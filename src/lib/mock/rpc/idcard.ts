/* MOCK BACKEND — modul ID Card. Meniru supabase/11_idcard.sql (penomoran atomik, pengajuan, penyerahan, status kartu). */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fail, nowIso, table, todayWib, uuid, type MockCtx, type MockDB, type Row, type RpcHandler } from "../core";

const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const ddmmyy = (d: string) => `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(2, 4)}`;
const fmt = (t: string, d: string, n: number) => (t === "R" ? String(n) : `${t === "T" ? "T-" : ""}${ddmmyy(d)}${String(n).padStart(3, "0")}`);

function guard(ctx: MockCtx) {
  const role = s(ctx.profile?.role);
  const ok = !!ctx.profile && (ctx.profile.is_master_admin || ["master", "admin", "ga", "admin_ga_cik", "admin_security"].includes(role));
  if (!ok) fail("Akses ditolak: akun ini tidak mengelola modul ID Card.", "42501");
}
const actor = (ctx: MockCtx) => s(ctx.profile?.full_name) || "Staf";

function log(db: MockDB, number: string, action: string, detail: string, by: string) {
  table(db, "idcard_card_logs").push({ id: uuid(), number, action, detail, actor: by, created_at: nowIso() });
}

/** Dipakai juga oleh seed demo. */
export function createRequestCore(db: MockDB, by: string, a: { tanggal?: string; perusahaan: string; pic: string; phone?: string; tipe: string; lokasi?: string; jumlah: number; catatan?: string }): Row {
  if (!["T", "C", "O", "R"].includes(a.tipe)) fail("Jenis kartu tidak valid.");
  if (!s(a.perusahaan)) fail("Nama perusahaan harus diisi.");
  if (!s(a.pic)) fail("Nama PIC harus diisi.");
  if (!a.jumlah || a.jumlah < 1 || a.jumlah > 500) fail("Jumlah harus antara 1–500.");
  const today = todayWib(), day = a.tipe === "R" ? "2000-01-01" : today, series = a.tipe === "T" ? "T" : a.tipe === "R" ? "TR" : "CO";
  const counters = table(db, "idcard_counters");
  let c = counters.find((x) => x.day === day && x.series === series);
  if (!c) { c = { day, series, last_seq: 0 }; counters.push(c); }
  const start = c.last_seq + 1;
  c.last_seq += a.jumlah;
  const req: Row = {
    id: uuid(), tanggal: a.tanggal || today, perusahaan: s(a.perusahaan).slice(0, 120), pic: s(a.pic).slice(0, 80), phone: s(a.phone).slice(0, 30), tipe: a.tipe,
    lokasi: (s(a.lokasi) || "CIKARANG").toUpperCase().slice(0, 40), jumlah: a.jumlah, card_from: fmt(a.tipe, day, start), card_to: fmt(a.tipe, day, c.last_seq),
    status: "pending", catatan: s(a.catatan).slice(0, 500), created_by: by, created_at: nowIso(),
  };
  table(db, "idcard_requests").push(req);
  const cards = table(db, "idcards");
  let ord = cards.reduce((m, x) => Math.max(m, x.ord ?? 0), 0);
  for (let i = start; i <= c.last_seq; i++) cards.push({ id: uuid(), ord: ++ord, request_id: req.id, number: fmt(a.tipe, day, i), tipe: a.tipe, status: "diterbitkan", handover_id: null, handed_at: null, note: "", created_at: nowIso(), updated_at: nowIso() });
  return req;
}

function refreshRequestStatus(db: MockDB, requestId: string) {
  const req = table(db, "idcard_requests").find((r) => r.id === requestId);
  if (req && req.status !== "selesai" && !table(db, "idcards").some((c) => c.request_id === requestId && c.status === "diterbitkan")) req.status = "selesai";
}

export function createHandoverCore(db: MockDB, by: string, a: Row): Row {
  const from = s(a.p_card_from).toUpperCase(), to = s(a.p_card_to).toUpperCase(), tipe = s(a.p_tipe);
  if (!["T", "C", "O", "R"].includes(tipe)) fail("Jenis kartu tidak valid.");
  if (!s(a.p_perusahaan)) fail("Nama perusahaan harus diisi.");
  if (!s(a.p_pic)) fail("Nama penerima harus diisi.");
  if (!from || !to) fail("Nomor kartu dari / sampai harus diisi.");
  const cards = table(db, "idcards");
  let jumlah = Number(a.p_jumlah) || 0;
  const id = uuid();
  const skip = a.p_skip_validation === true;
  let range: Row[] = [];
  if (!skip) {
    const f = cards.find((c) => c.number === from), t = cards.find((c) => c.number === to);
    const miss = (n: string) => fail(`Nomor ${n} tidak ditemukan di data kartu yang diterbitkan. (Kartu lama? Centang "kartu lama di luar sistem".)`);
    if (!f) miss(from);
    if (!t) miss(to);
    if (f!.tipe !== tipe || t!.tipe !== tipe) fail("Jenis kartu pada nomor tidak sama dengan jenis yang dipilih.");
    if (f!.ord > t!.ord) fail('Nomor "dari" harus lebih awal dari nomor "sampai".');
    range = cards.filter((c) => c.tipe === tipe && c.ord >= f!.ord && c.ord <= t!.ord);
    const busy = range.filter((c) => c.status !== "diterbitkan").length;
    if (busy > 0) fail(`${busy} dari ${range.length} kartu dalam rentang ini tidak berstatus "diterbitkan" (sudah diserahkan / kembali / hilang).`);
    jumlah = range.length;
  } else if (jumlah < 1 || jumlah > 999) fail("Jumlah harus antara 1–999.");
  const tanggal = s(a.p_tanggal) || todayWib();
  const ho: Row = {
    id, tanggal, perusahaan: s(a.p_perusahaan).slice(0, 120), pic: s(a.p_pic).slice(0, 80), phone: s(a.p_phone).slice(0, 30), jabatan: s(a.p_jabatan).slice(0, 60), tipe,
    jumlah, card_from: from, card_to: to, catatan: s(a.p_catatan).slice(0, 500), request_id: a.p_request_id ?? null, validated: !skip, created_by: by, created_at: nowIso(),
  };
  table(db, "idcard_handovers").push(ho);
  if (!skip) {
    for (const c of range) { Object.assign(c, { status: "diserahkan", handover_id: id, handed_at: tanggal, updated_at: nowIso() }); log(db, c.number, "serah", `${s(a.p_perusahaan)} · ${s(a.p_pic)}`, by); }
    for (const rid of new Set(range.map((c) => c.request_id as string))) refreshRequestStatus(db, rid);
  }
  return ho;
}

export const IDCARD: Record<string, RpcHandler> = {
  idcard_create_request: (a, ctx) => {
    guard(ctx);
    return createRequestCore(ctx.db, actor(ctx), { tanggal: s(a.p_tanggal), perusahaan: s(a.p_perusahaan), pic: s(a.p_pic), phone: s(a.p_phone), tipe: s(a.p_tipe), lokasi: s(a.p_lokasi), jumlah: Number(a.p_jumlah), catatan: s(a.p_catatan) }).id;
  },
  idcard_mark_printed: (a, ctx) => {
    guard(ctx);
    const r = table(ctx.db, "idcard_requests").find((x) => x.id === a.p_id);
    if (r && r.status === "pending") r.status = "printed";
    return null;
  },
  idcard_delete_request: (a, ctx) => {
    guard(ctx);
    const cards = table(ctx.db, "idcards");
    const n = cards.filter((c) => c.request_id === a.p_id && c.status !== "diterbitkan").length;
    if (n > 0) fail(`Tidak bisa dihapus: ${n} kartu sudah diserahkan / dikembalikan / hilang. Batalkan penyerahannya dulu.`);
    const reqs = table(ctx.db, "idcard_requests");
    const i = reqs.findIndex((r) => r.id === a.p_id);
    if (i < 0) fail("Pengajuan tidak ditemukan.");
    reqs.splice(i, 1);
    for (let k = cards.length - 1; k >= 0; k--) if (cards[k].request_id === a.p_id) cards.splice(k, 1);
    return null;
  },
  idcard_create_handover: (a, ctx) => { guard(ctx); return createHandoverCore(ctx.db, actor(ctx), a).id; },
  idcard_delete_handover: (a, ctx) => {
    guard(ctx);
    const by = actor(ctx), cards = table(ctx.db, "idcards"), hos = table(ctx.db, "idcard_handovers");
    const i = hos.findIndex((h) => h.id === a.p_id);
    if (i < 0) fail("Data penyerahan tidak ditemukan.");
    for (const c of cards.filter((x) => x.handover_id === a.p_id)) {
      log(ctx.db, c.number, "batal-serah", "penyerahan dibatalkan", by);
      if (c.status === "diserahkan") Object.assign(c, { status: "diterbitkan", handover_id: null, handed_at: null, updated_at: nowIso() });
    }
    for (const r of table(ctx.db, "idcard_requests")) if (r.status === "selesai" && cards.some((c) => c.request_id === r.id && c.status === "diterbitkan")) r.status = "printed";
    hos.splice(i, 1);
    return null;
  },
  idcard_set_card_status: (a, ctx) => {
    guard(ctx);
    const st = s(a.p_status);
    if (!["kembali", "hilang", "diterbitkan"].includes(st)) fail("Status tidak valid.");
    const c = table(ctx.db, "idcards").find((x) => x.number === s(a.p_number).toUpperCase());
    if (!c) fail("Nomor kartu tidak ditemukan.");
    if (st === "kembali" && c!.status !== "diserahkan") fail("Hanya kartu yang sedang diserahkan yang bisa ditandai kembali.");
    const note = s(a.p_note);
    Object.assign(c!, { status: st, note: a.p_note == null ? c!.note : note.slice(0, 300), updated_at: nowIso() });
    if (st === "diterbitkan") { c!.handover_id = null; c!.handed_at = null; const r = table(ctx.db, "idcard_requests").find((x) => x.id === c!.request_id); if (r && r.status === "selesai") r.status = "printed"; }
    log(ctx.db, c!.number, st, note, actor(ctx));
    return null;
  },
};
