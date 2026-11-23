import { supabase } from "./supabaseClient";
import { L } from "./i18n";
import type { LockerKeyDraft, LockerKeyStatus } from "./lockerKeyImport";

/* ════════════════════════════════════════════════════════════
   KUNCI LOKER KARYAWAN — lapisan API (tabel locker_keys, locker_key_logs; supabase/10_kunci_loker_karyawan.sql).
   Terpisah dari lockerApi.ts (loker ber-PIN untuk pemesanan).
════════════════════════════════════════════════════════════ */

export type { LockerKeyStatus } from "./lockerKeyImport";

export interface LockerKey {
  id: string;
  rowNo: number;
  blok: string;
  slot: number | null;
  pintu: string;
  nama: string;
  nik: string;
  dept: string;
  noKunci: string;
  status: LockerKeyStatus;
  borrowedBy: string;
  borrowedAt: string; // yyyy-mm-dd atau ""
  keterangan: string;
}

export interface LockerKeyInput {
  blok: string;
  slot: number | null;
  pintu: string;
  nama: string;
  nik: string;
  dept: string;
  noKunci: string;
  status: LockerKeyStatus;
  keterangan: string;
}

export type LockerKeyAction = "tambah" | "ubah" | "hapus" | "pinjam" | "kembali" | "impor";
export interface LockerKeyLog {
  id: string;
  lockerKeyId: string | null;
  blok: string;
  pintu: string;
  nama: string;
  action: LockerKeyAction;
  detail: string;
  actor: string;
  createdAt: string;
}

interface Db {
  id: string; row_no: number; blok: string; slot: number | null; pintu: string; nama: string; nik: string; dept: string;
  no_kunci: string; status: LockerKeyStatus; borrowed_by: string; borrowed_at: string | null; keterangan: string;
}
const COLS = "id, row_no, blok, slot, pintu, nama, nik, dept, no_kunci, status, borrowed_by, borrowed_at, keterangan";

const map = (r: Db): LockerKey => ({
  id: r.id, rowNo: r.row_no ?? 0, blok: r.blok ?? "", slot: r.slot ?? null, pintu: r.pintu ?? "", nama: r.nama ?? "", nik: r.nik ?? "", dept: r.dept ?? "",
  noKunci: r.no_kunci ?? "", status: r.status, borrowedBy: r.borrowed_by ?? "", borrowedAt: r.borrowed_at ?? "", keterangan: r.keterangan ?? "",
});

/** Pesan ramah bila SQL 10 belum dijalankan. */
function wrap(e: { code?: string; message: string }): Error {
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883") {
    return new Error(L("Modul Kunci Loker belum aktif di database — jalankan supabase/10_kunci_loker_karyawan.sql di Supabase SQL Editor.", "The Locker Keys module is not active in the database yet — run supabase/10_kunci_loker_karyawan.sql in the Supabase SQL Editor."));
  }
  if (e.code === "42501") return new Error(L("Akun ini tidak punya izin mengubah data kunci loker.", "This account is not allowed to change locker key data."));
  return new Error(e.message);
}
const noChange = () => new Error(L("Perubahan tidak tersimpan: data tidak ditemukan atau akun ini tidak punya izin mengubahnya.", "Changes were not saved: the record was not found or this account is not allowed to change it."));

/** Semua loker (PostgREST membatasi 1000 baris per permintaan → diambil bertahap). */
export async function getLockerKeys(): Promise<LockerKey[]> {
  const out: LockerKey[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("locker_keys").select(COLS).order("row_no", { ascending: true }).order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw wrap(error);
    const rows = (data ?? []) as unknown as Db[];
    out.push(...rows.map(map));
    if (rows.length < PAGE) break;
  }
  return out;
}

const payload = (i: LockerKeyInput) => ({
  blok: i.blok.trim(), slot: i.slot, pintu: i.pintu.trim(), nama: i.nama.trim(), nik: i.nik.trim(), dept: i.dept.trim(),
  no_kunci: i.noKunci.trim(), status: i.status, keterangan: i.keterangan.trim(),
});

export async function addLockerKey(input: LockerKeyInput, rowNo: number): Promise<void> {
  const body = { ...payload(input), row_no: rowNo };
  if (body.status !== "Dipinjam") Object.assign(body, { borrowed_by: "", borrowed_at: null });
  const { error } = await supabase.from("locker_keys").insert(body);
  if (error) throw wrap(error);
}

export async function updateLockerKey(id: string, input: LockerKeyInput): Promise<void> {
  const body: Record<string, unknown> = payload(input);
  if (input.status !== "Dipinjam") { body.borrowed_by = ""; body.borrowed_at = null; }
  const { data, error } = await supabase.from("locker_keys").update(body).eq("id", id).select("id");
  if (error) throw wrap(error);
  if (!data?.length) throw noChange();
}

export async function deleteLockerKey(id: string): Promise<void> {
  const { data, error } = await supabase.from("locker_keys").delete().eq("id", id).select("id");
  if (error) throw wrap(error);
  if (!data?.length) throw noChange();
}

export async function borrowLockerKey(id: string, by: string, date: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("locker_key_borrow", { p_id: id, p_by: by, p_date: date || null, p_note: note || null });
  if (error) throw wrap(error);
}

export async function returnLockerKey(id: string): Promise<void> {
  const { error } = await supabase.rpc("locker_key_return", { p_id: id });
  if (error) throw wrap(error);
}

export async function getLockerKeyLogs(limit = 300): Promise<LockerKeyLog[]> {
  const { data, error } = await supabase.from("locker_key_logs").select("id, locker_key_id, blok, pintu, nama, action, detail, actor, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) throw wrap(error);
  return ((data ?? []) as { id: string; locker_key_id: string | null; blok: string; pintu: string; nama: string; action: LockerKeyAction; detail: string; actor: string; created_at: string }[])
    .map((r) => ({ id: r.id, lockerKeyId: r.locker_key_id, blok: r.blok, pintu: r.pintu, nama: r.nama, action: r.action, detail: r.detail, actor: r.actor, createdAt: r.created_at }));
}

/** Impor hasil pembacaan Excel. replace = true → semua data lama diganti (atomik). Mengembalikan jumlah baris tersimpan. */
export async function importLockerKeys(rows: LockerKeyDraft[], replace: boolean): Promise<number> {
  const p_rows = rows.map((r) => ({ blok: r.blok, slot: r.slot, pintu: r.pintu, nama: r.nama, nik: r.nik, dept: r.dept, no_kunci: r.noKunci, status: r.status, keterangan: r.keterangan }));
  const { data, error } = await supabase.rpc("locker_keys_import", { p_rows, p_replace: replace });
  if (error) throw wrap(error);
  return Number(data ?? 0);
}

/** Ekspor daftar (yang sedang tampil / semua) ke file Excel dengan format yang sama dengan file master. */
export async function exportLockerKeysXlsx(rows: LockerKey[], filename: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Master");
  ws.columns = [
    { header: "BLOK", key: "blok", width: 9 }, { header: "NO.SLOT KUNCI", key: "slot", width: 14 }, { header: "NO.URUT PINTU", key: "pintu", width: 14 },
    { header: "NAMA KARYAWAN", key: "nama", width: 30 }, { header: "NIK", key: "nik", width: 12 }, { header: "NO.KUNCI", key: "noKunci", width: 11 },
    { header: "DEPT", key: "dept", width: 22 }, { header: "STATUS", key: "status", width: 11 }, { header: "PEMINJAM KUNCI SEREP", key: "borrowedBy", width: 22 },
    { header: "TGL PINJAM", key: "borrowedAt", width: 12 }, { header: "KETERANGAN", key: "keterangan", width: 40 },
  ];
  rows.forEach((r) => ws.addRow({ ...r, slot: r.slot ?? "" }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "K1" };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
