/* Logbook Gate MDC ⇄ FFI — form publik /logbook + dashboard Security. Tabel logbook_gate (SQL 16). */

import { supabase } from "./supabaseClient";
import { L } from "./i18n";

export type LogbookArah = "mdc_ffi" | "ffi_mdc";
export type LogbookTipe = "karyawan" | "guest";

export interface LogbookEntry {
  id: string;
  no: string;
  createdAt: string;
  /** YYYY-MM-DD (WIB) */
  tanggal: string;
  /** HH:MM (WIB) */
  jam: string;
  arah: LogbookArah;
  tipe: LogbookTipe;
  nama: string;
  asal: string;
  keperluan: string;
}

export const ARAH_LABEL: Record<LogbookArah, string> = { mdc_ffi: "MDC → FFI", ffi_mdc: "FFI → MDC" };

/** Pilihan tujuan / keperluan di form (bisa juga ketik sendiri). */
export const KEPERLUAN_KARYAWAN = ["Rapat", "Antar / ambil barang", "Inspeksi / audit", "Makan / istirahat", "Urusan pekerjaan"];
export const KEPERLUAN_GUEST = ["Meeting", "Kunjungan / tur", "Kirim / terima barang", "Audit / inspeksi", "Servis / vendor"];

export interface LogbookSubmit { arah: LogbookArah; tipe: LogbookTipe; nama: string; asal: string; keperluan: string }
export interface LogbookReceipt { no: string; tanggal: string; jam: string; arah: LogbookArah }

const SQL_MSG = () => L("Logbook belum aktif di database — jalankan supabase/16_logbook_gate_mdc.sql di Supabase SQL Editor.", "The logbook is not enabled yet — run supabase/16_logbook_gate_mdc.sql in the Supabase SQL Editor.");
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42883" || e.code === "42P01" || e.code === "PGRST202" || e.code === "PGRST205" || /logbook_(gate|submit)/i.test(e.message ?? "") && /does not exist|could not find/i.test(e.message ?? ""));

/** Catat satu kunjungan (publik, tanpa login). */
export async function submitLogbook(a: LogbookSubmit): Promise<LogbookReceipt> {
  const { data, error } = await supabase.rpc("logbook_submit", { p_arah: a.arah, p_tipe: a.tipe, p_nama: a.nama, p_asal: a.asal, p_keperluan: a.keperluan });
  if (isMissing(error)) throw new Error(SQL_MSG());
  if (error) throw new Error(error.message);
  const r = data as LogbookReceipt;
  return { no: String(r.no), tanggal: String(r.tanggal), jam: String(r.jam).slice(0, 5), arah: r.arah };
}

type Row = Record<string, unknown>;
const toEntry = (r: Row): LogbookEntry => ({
  id: String(r.id), no: String(r.no ?? ""), createdAt: String(r.created_at ?? ""), tanggal: String(r.tanggal ?? "").slice(0, 10),
  jam: String(r.jam ?? "").slice(0, 5), arah: r.arah === "ffi_mdc" ? "ffi_mdc" : "mdc_ffi", tipe: r.tipe === "guest" ? "guest" : "karyawan",
  nama: String(r.nama ?? ""), asal: String(r.asal ?? ""), keperluan: String(r.keperluan ?? ""),
});

/** Daftar catatan pada rentang tanggal (dimuat bertahap — batas 1.000 baris per permintaan). */
export async function getLogbook(from: string, to: string): Promise<LogbookEntry[]> {
  const out: LogbookEntry[] = [];
  for (let start = 0; start < 20000; start += 1000) {
    const { data, error } = await supabase.from("logbook_gate").select("*").gte("tanggal", from).lte("tanggal", to)
      .order("tanggal", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + 999);
    if (isMissing(error)) throw new Error(SQL_MSG());
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows.map(toEntry));
    if (rows.length < 1000) break;
  }
  return out;
}

export async function deleteLogbook(id: string): Promise<void> {
  const { data, error } = await supabase.from("logbook_gate").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(L("Penghapusan tidak diizinkan untuk akun ini.", "Deletion is not allowed for this account."));
}

/** Realtime: onChange (di-debounce) tiap ada catatan baru / dihapus. */
export function subscribeLogbook(onChange: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  const ch = supabase.channel(`logbook-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "logbook_gate" }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(onChange, 300);
    })
    .subscribe();
  return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
}
