/* MOCK BACKEND — Logbook Gate MDC ⇄ FFI. Meniru supabase/16_logbook_gate_mdc.sql (logbook_submit). */
import { fail, nowHmWib, nowIso, table, todayWib, uuid, type MockDB, type Row, type RpcHandler } from "../core";

const clean = (v: unknown) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
const ddmmyy = (d: string) => `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(2, 4)}`;

/** Dipakai juga oleh seed demo. */
export function addLogbookCore(db: MockDB, a: { tanggal?: string; jam?: string; arah: string; tipe: string; nama: string; asal: string; keperluan: string }): Row {
  const tgl = a.tanggal ?? todayWib();
  const rows = table(db, "logbook_gate");
  let n = rows.filter((r) => r.tanggal === tgl).length + 1;
  let no = `LB-${ddmmyy(tgl)}-${String(n).padStart(3, "0")}`;
  while (rows.some((r) => r.no === no)) { n++; no = `LB-${ddmmyy(tgl)}-${String(n).padStart(3, "0")}`; }
  const row: Row = { id: uuid(), no, created_at: nowIso(), tanggal: tgl, jam: `${a.jam ?? nowHmWib()}:00`, arah: a.arah, tipe: a.tipe, nama: a.nama, asal: a.asal, keperluan: a.keperluan, plant: "CIK" };
  rows.push(row);
  return row;
}

export const LOGBOOK: Record<string, RpcHandler> = {
  logbook_submit(a, ctx) {
    const arah = clean(a.p_arah), tipe = clean(a.p_tipe), nama = clean(a.p_nama), asal = clean(a.p_asal), kep = clean(a.p_keperluan);
    if (!["mdc_ffi", "ffi_mdc"].includes(arah)) fail("Arah tidak valid.");
    if (!["karyawan", "guest"].includes(tipe)) fail("Pilih Karyawan atau Guest.");
    if (nama.length < 2 || nama.length > 80) fail("Nama lengkap harus diisi (2–80 huruf).");
    if (asal.length < 1 || asal.length > 80) fail("Departemen / perusahaan harus diisi.");
    if (kep.length < 2 || kep.length > 120) fail("Tujuan / keperluan harus diisi.");
    const rows = table(ctx.db, "logbook_gate");
    const dup = rows.some((r) => r.nama.toLowerCase() === nama.toLowerCase() && r.arah === arah && Date.now() - Date.parse(r.created_at) < 60000);
    if (dup) fail("Catatan yang sama baru saja masuk. Tunggu semenit bila memang ingin mencatat lagi.");
    const r = addLogbookCore(ctx.db, { arah, tipe, nama, asal, keperluan: kep });
    return { no: r.no, tanggal: r.tanggal, jam: String(r.jam).slice(0, 5), arah };
  },
};
