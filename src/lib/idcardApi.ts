import { supabase } from "./supabaseClient";
import { L } from "./i18n";
import { normalizeDesign, type CardDesign, type DesignKind } from "./idcard/render";
import { COUNTER_DAY_TR, formatNumber, seriesOf, wibToday, type CardStatus, type CardTipe, type IdCard, type IdCardLog, type IdHandover, type IdRequest, type RequestStatus } from "./idcard/model";

/* ════════════════════════════════════════════════════════════
   ID CARD — lapisan API (tabel idcard_*, supabase/11_idcard.sql).
════════════════════════════════════════════════════════════ */

function wrap(e: { code?: string; message: string }): Error {
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883") {
    return new Error(L("Modul ID Card belum aktif di database — jalankan supabase/11_idcard.sql di Supabase SQL Editor.", "The ID Card module is not active in the database yet — run supabase/11_idcard.sql in the Supabase SQL Editor."));
  }
  if (e.code === "42501") return new Error(L("Akun ini tidak punya izin mengelola ID Card.", "This account is not allowed to manage ID Cards."));
  return new Error(e.message);
}

/* ── pemetaan baris ── */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const mapReq = (r: Row): IdRequest => ({
  id: r.id, tanggal: r.tanggal, perusahaan: r.perusahaan, pic: r.pic, phone: r.phone ?? "", tipe: r.tipe, lokasi: r.lokasi ?? "", jumlah: r.jumlah,
  cardFrom: r.card_from, cardTo: r.card_to, status: r.status, catatan: r.catatan ?? "", createdBy: r.created_by ?? "", createdAt: r.created_at,
});
const mapHo = (r: Row): IdHandover => ({
  id: r.id, tanggal: r.tanggal, perusahaan: r.perusahaan, pic: r.pic, phone: r.phone ?? "", jabatan: r.jabatan ?? "", tipe: r.tipe, jumlah: r.jumlah,
  cardFrom: r.card_from, cardTo: r.card_to, catatan: r.catatan ?? "", requestId: r.request_id ?? null, validated: r.validated !== false, createdBy: r.created_by ?? "", createdAt: r.created_at,
});
const mapCard = (r: Row): IdCard => ({ id: r.id, requestId: r.request_id, number: r.number, tipe: r.tipe, status: r.status, handoverId: r.handover_id ?? null, handedAt: r.handed_at ?? "", note: r.note ?? "" });

/* ── pengajuan ── */
export async function getRequests(): Promise<IdRequest[]> {
  const out: IdRequest[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("idcard_requests").select("*").order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw wrap(error);
    out.push(...(data ?? []).map(mapReq));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Saran nama penerima (PIC) dari RIWAYAT pengajuan ID Card — bukan dari Master Karyawan. Nama baru cukup diketik manual. */
export async function getRecentPics(): Promise<{ key: string; name: string; hint?: string }[]> {
  const { data, error } = await supabase.from("idcard_requests").select("pic, perusahaan").order("created_at", { ascending: false }).limit(1500);
  if (error) throw wrap(error);
  const seen = new Set<string>();
  const out: { key: string; name: string; hint?: string }[] = [];
  for (const r of data ?? []) {
    const name = String(r.pic ?? "").trim(); const k = name.toLowerCase();
    if (!name || seen.has(k)) continue;
    seen.add(k);
    out.push({ key: `h:${k}`, name, hint: String(r.perusahaan ?? "").trim() || undefined });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

/** Nomor berikutnya yang akan diberikan (hanya perkiraan untuk pratinjau; nomor sebenarnya dibuat database saat disimpan). */
export async function peekNextSeq(tipe: CardTipe): Promise<number> {
  const { data, error } = await supabase.from("idcard_counters").select("last_seq").eq("day", tipe === "R" ? COUNTER_DAY_TR : wibToday()).eq("series", seriesOf(tipe)).maybeSingle();
  if (error) throw wrap(error);
  return ((data as { last_seq?: number } | null)?.last_seq ?? 0) + 1;
}
export const previewNumber = (tipe: CardTipe, seq: number) => formatNumber(tipe, wibToday(), seq);

export interface RequestInput { tanggal: string; perusahaan: string; pic: string; phone: string; tipe: CardTipe; lokasi: string; jumlah: number; catatan: string }
export async function createRequest(i: RequestInput): Promise<string> {
  const { data, error } = await supabase.rpc("idcard_create_request", {
    p_tanggal: i.tanggal || null, p_perusahaan: i.perusahaan, p_pic: i.pic, p_phone: i.phone, p_tipe: i.tipe, p_lokasi: i.lokasi, p_jumlah: i.jumlah, p_catatan: i.catatan,
  });
  if (error) throw wrap(error);
  return String(data);
}
export async function markPrinted(id: string): Promise<void> {
  const { error } = await supabase.rpc("idcard_mark_printed", { p_id: id });
  if (error) throw wrap(error);
}
export async function setRequestStatus(id: string, status: RequestStatus): Promise<void> {
  const { data, error } = await supabase.from("idcard_requests").update({ status }).eq("id", id).select("id");
  if (error) throw wrap(error);
  if (!data?.length) throw new Error(L("Perubahan tidak tersimpan: data tidak ditemukan atau akun ini tidak punya izin.", "Not saved: record not found or no permission."));
}
export async function deleteRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc("idcard_delete_request", { p_id: id });
  if (error) throw wrap(error);
}

/* ── kartu ── */
export async function getCardsOfRequest(requestId: string): Promise<IdCard[]> {
  const { data, error } = await supabase.from("idcards").select("*").eq("request_id", requestId).order("ord", { ascending: true });
  if (error) throw wrap(error);
  return (data ?? []).map(mapCard);
}
/** Cari kartu berdasarkan nomor (sebagian nomor boleh). */
export async function searchCards(q: string, limit = 50): Promise<IdCard[]> {
  const t = q.trim().toUpperCase().replace(/[%_,()"\\]/g, "");
  if (!t) return [];
  const { data, error } = await supabase.from("idcards").select("*").ilike("number", `%${t}%`).order("ord", { ascending: false }).limit(limit);
  if (error) throw wrap(error);
  return (data ?? []).map(mapCard);
}
export async function getCardCounts(): Promise<Record<CardStatus, number>> {
  const out = { diterbitkan: 0, diserahkan: 0, kembali: 0, hilang: 0 } as Record<CardStatus, number>;
  await Promise.all((Object.keys(out) as CardStatus[]).map(async (st) => {
    const { count, error } = await supabase.from("idcards").select("id", { count: "exact", head: true }).eq("status", st);
    if (error) throw wrap(error);
    out[st] = count ?? 0;
  }));
  return out;
}
export async function getCardLogs(number: string): Promise<IdCardLog[]> {
  const { data, error } = await supabase.from("idcard_card_logs").select("*").eq("number", number).order("created_at", { ascending: false }).limit(50);
  if (error) throw wrap(error);
  return (data ?? []).map((r: Row) => ({ id: r.id, number: r.number, action: r.action, detail: r.detail ?? "", actor: r.actor ?? "", createdAt: r.created_at }));
}
export async function setCardStatus(number: string, status: "kembali" | "hilang" | "diterbitkan", note: string): Promise<void> {
  const { error } = await supabase.rpc("idcard_set_card_status", { p_number: number, p_status: status, p_note: note || null });
  if (error) throw wrap(error);
}

/* ── penyerahan ── */
export async function getHandovers(): Promise<IdHandover[]> {
  const { data, error } = await supabase.from("idcard_handovers").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw wrap(error);
  return (data ?? []).map(mapHo);
}
export interface HandoverInput {
  tanggal: string; perusahaan: string; pic: string; phone: string; jabatan: string; tipe: CardTipe; cardFrom: string; cardTo: string; jumlah: number;
  catatan: string; requestId: string | null; skipValidation: boolean;
}
export async function createHandover(i: HandoverInput): Promise<string> {
  const { data, error } = await supabase.rpc("idcard_create_handover", {
    p_tanggal: i.tanggal || null, p_perusahaan: i.perusahaan, p_pic: i.pic, p_phone: i.phone, p_jabatan: i.jabatan, p_tipe: i.tipe, p_card_from: i.cardFrom, p_card_to: i.cardTo,
    p_jumlah: i.jumlah, p_catatan: i.catatan, p_request_id: i.requestId, p_skip_validation: i.skipValidation,
  });
  if (error) throw wrap(error);
  return String(data);
}
export async function deleteHandover(id: string): Promise<void> {
  const { error } = await supabase.rpc("idcard_delete_handover", { p_id: id });
  if (error) throw wrap(error);
}

/* ── desain: id 1 = umum (Temporary / Contractor / Outsourcing), id 2 = Transporter ── */
export interface Designs { general: CardDesign; transporter: CardDesign }
export async function getDesigns(): Promise<Designs> {
  const { data, error } = await supabase.from("idcard_settings").select("id, design");
  if (error) throw wrap(error);
  const rows = (data ?? []) as { id: number; design: unknown }[];
  return { general: normalizeDesign(rows.find((r) => r.id === 1)?.design, "general"), transporter: normalizeDesign(rows.find((r) => r.id === 2)?.design, "transporter") };
}
export async function saveDesign(kind: DesignKind, design: CardDesign, actor: string): Promise<void> {
  const { error } = await supabase.from("idcard_settings").upsert({ id: kind === "transporter" ? 2 : 1, design, updated_at: new Date().toISOString(), updated_by: actor }, { onConflict: "id" });
  if (error) {
    if (error.code === "23514") throw new Error(L("Desain Transporter belum bisa disimpan — jalankan supabase/12_idcard_transporter.sql di Supabase SQL Editor.", "The Transporter design cannot be saved yet — run supabase/12_idcard_transporter.sql in the Supabase SQL Editor."));
    throw wrap(error);
  }
}
