/* GA FACILITY — baca data hasil sinkron Excel (tabel ga_*, migrasi 027). CIKOPS hanya membaca. */

import { supabase } from "../supabaseClient";
import type { GaEvent, GaImprovement, GaInventory, GaJob, GaManpower, GaPlan, GaSyncStatus, GaTga } from "./model";
import { tgaAllActivities } from "../tga/api";

function notReady(error: { code?: string; message?: string }): Error {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || /does not exist|Could not find/i.test(error.message ?? "")) {
    return new Error("Modul GA belum aktif — jalankan supabase/027_ga_facility.sql di Supabase.");
  }
  return new Error(error.message ?? String(error));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function allRows<T>(table: string, cols: string, build: (q: any) => any, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < 200000; off += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(cols);
    q = build(q) ?? q;
    q = q.order(order, { ascending: true }).range(off, off + 999);
    const { data, error } = await q;
    if (error) throw notReady(error);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface PlanRow {
  key: string; periode: number; tanggal: string; hari: string | null; job_id: string | null; tim: string | null; lokasi: string | null;
  tipe: string | null; area: string | null; petugas: string | null; plan: number | null; actual: number | null; spv: string | null; waktu_input: string | null;
}
export async function getGaPlan(from: string, to: string): Promise<GaPlan[]> {
  const rows = await allRows<PlanRow>(
    "ga_plan", "key, periode, tanggal, hari, job_id, tim, lokasi, tipe, area, petugas, plan, actual, spv, waktu_input",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => q.gte("tanggal", from).lte("tanggal", to), "key",
  );
  return rows.map((r) => ({
    key: r.key, periode: r.periode, tanggal: r.tanggal, hari: r.hari ?? "", jobId: r.job_id ?? "", tim: r.tim ?? "", lokasi: r.lokasi ?? "",
    tipe: r.tipe ?? "", area: r.area ?? "", petugas: r.petugas ?? "", plan: r.plan ?? 1,
    actual: r.actual === 1 ? 1 : r.actual === 0 ? 0 : null, spv: r.spv ?? "", waktuInput: r.waktu_input,
  }));
}

export async function getGaJobs(): Promise<GaJob[]> {
  const { data, error } = await supabase.from("ga_jobs").select("*").order("id");
  if (error) throw notReady(error);
  return (data ?? []).map((r) => ({
    id: r.id, tim: r.tim ?? "", lokasi: r.lokasi ?? "", tipe: r.tipe ?? "", area: r.area ?? "", frek: r.frek ?? "",
    hari: r.hari ?? "", petugas: r.petugas ?? "", aktif: r.aktif !== false, catatan: r.catatan ?? "",
  }));
}
export async function getGaManpower(): Promise<GaManpower[]> {
  const { data, error } = await supabase.from("ga_manpower").select("*").order("nama");
  if (error) throw notReady(error);
  return (data ?? []).map((r) => ({ id: r.id, nama: r.nama ?? "", tim: r.tim ?? "", jabatan: r.jabatan ?? "", areaTugas: r.area_tugas ?? "", status: r.status ?? "", noHp: r.no_hp ?? "" }));
}
export async function getGaEvents(): Promise<GaEvent[]> {
  const { data, error } = await supabase.from("ga_events").select("*").order("tanggal", { ascending: false });
  if (error) throw notReady(error);
  return (data ?? []).map((r) => ({ id: r.id, tanggal: r.tanggal, nama: r.nama ?? "", deskripsi: r.deskripsi ?? "", waktu: r.waktu ?? "", support: r.support ?? "", dokumentasi: r.dokumentasi ?? "" }));
}
export async function getGaImprovements(): Promise<GaImprovement[]> {
  const { data, error } = await supabase.from("ga_improvements").select("*").order("tanggal", { ascending: false });
  if (error) throw notReady(error);
  return (data ?? []).map((r) => ({
    id: r.id, tanggal: r.tanggal, kategori: r.kategori ?? "", jenis: r.jenis ?? "", deskripsi: r.deskripsi ?? "", area: r.area ?? "",
    petugas: r.petugas ?? "", pengawas: r.pengawas ?? "", dokumentasi: r.dokumentasi ?? "",
  }));
}
export async function getGaInventory(): Promise<GaInventory[]> {
  const { data, error } = await supabase.from("ga_inventory").select("*").order("baris");
  if (error) throw notReady(error);
  return (data ?? []).map((r) => ({
    id: r.id, kode: r.kode ?? "", nama: r.nama ?? "", jenis: r.jenis ?? "", area: r.area ?? "", status: r.status ?? "",
    foto: r.foto ?? "", jumlah: r.jumlah === null || r.jumlah === undefined ? null : Number(r.jumlah), tglUpdate: r.tgl_update,
  }));
}
export async function getGaTga(): Promise<GaTga[]> {
  const { data, error } = await supabase.from("ga_tga").select("*").order("tanggal", { ascending: false }).order("baris", { ascending: false });
  if (error) throw notReady(error);
  const excel: GaTga[] = (data ?? []).map((r) => ({ id: r.id, tanggal: r.tanggal, namaTga: r.nama_tga ?? "", activity: r.activity ?? "", requestBy: r.request_by ?? "", source: "excel" }));
  // Kegiatan yang dicatat teknisi lewat aplikasi /tga (034). Gagal/ belum dipasang → tetap tampilkan data Excel.
  // Tugas yang belum diterima / dibatalkan tidak dihitung sebagai aktivitas (tampil di Papan tugas TGA).
  const app: GaTga[] = await tgaAllActivities().then((rows) => rows.filter((a) => a.status !== "baru" && a.status !== "batal").map((a) => ({
    id: a.id, tanggal: a.tanggal, namaTga: a.nama_tga, activity: a.activity, requestBy: a.request_by, source: "app" as const,
    refNo: a.ref_no, requestorLinked: Boolean(a.requestor_id), kategori: a.kategori, lokasi: a.lokasi, departemen: a.departemen, status: a.status, prioritas: a.prioritas, catatan: a.catatan,
    jam: a.jam_mulai ? `${a.jam_mulai}${a.jam_selesai ? `–${a.jam_selesai}` : ""}` : "",
  }))).catch(() => []);
  return [...app, ...excel].sort((x, y) => (y.tanggal ?? "").localeCompare(x.tanggal ?? ""));
}

export async function getGaSyncStatus(): Promise<GaSyncStatus> {
  const { data, error } = await supabase.rpc("ga_sync_status");
  if (error) throw notReady(error);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    lastSyncAt: (d.last_sync_at as string) ?? null, lastComputer: (d.last_computer as string) ?? null,
    lastPlanAt: (d.last_plan_at as string) ?? null, lastMasterAt: (d.last_master_at as string) ?? null, lastLogsAt: (d.last_logs_at as string) ?? null,
    jobs: Number(d.jobs ?? 0), plan: Number(d.plan ?? 0), isAdmin: Boolean(d.is_admin), syncKey: (d.sync_key as string) ?? null,
    master: d.master === "cikops" ? "cikops" : "excel", masterSince: (d.master_since as string) ?? null,
    lastPullAt: (d.last_pull_at as string) ?? null, lastPullComputer: (d.last_pull_computer as string) ?? null,
  };
}
export async function rotateGaSyncKey(): Promise<string> {
  const { data, error } = await supabase.rpc("ga_rotate_sync_key");
  if (error) throw notReady(error);
  return String(data);
}

/* ── Input dari CIKOPS (038: CIKOPS sumber utama, Excel mengikuti) ── */
function need038(error: { code?: string; message?: string }): Error {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")) {
    return new Error("Fitur input CIKOPS belum aktif — jalankan supabase/038_ga_cikops_master.sql di Supabase.");
  }
  return new Error(error.message ?? String(error));
}
async function rpc038<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw need038(error);
  return data as T;
}
export const setGaMaster = (mode: "excel" | "cikops") => rpc038<{ master: string }>("ga_set_master", { p_mode: mode });
export interface GaJobInput { id?: string; tim: string; lokasi: string; tipe: string; area: string; hari: string[]; petugas: string; aktif: boolean; catatan: string; frek?: string }
export const saveGaJob = (id: string | null, d: GaJobInput) => rpc038<{ id: string }>("ga_save_job", { p_id: id, p_data: d });
export const deleteGaJob = (id: string) => rpc038<{ plan_removed: number }>("ga_delete_job", { p_id: id });
export interface GaManpowerInput { nama: string; tim: string; jabatan: string; area_tugas: string; status: string; no_hp: string }
export const saveGaManpower = (id: string | null, d: GaManpowerInput) => rpc038<{ id: string }>("ga_save_manpower", { p_id: id, p_data: d });
export const deleteGaManpower = (id: string) => rpc038<null>("ga_delete_manpower", { p_id: id });
export const generateGaPlan = (periode: number, from: string | null, rebuild: boolean) =>
  rpc038<{ added: number; removed: number; total: number }>("ga_generate_plan", { p_periode: periode, p_from: from, p_rebuild: rebuild });
export const setGaActual = (rows: { key: string; actual: 0 | 1 | null }[]) => rpc038<number>("ga_set_actual", { p_rows: rows, p_spv: null });
export type GaLogTable = "events" | "improvements" | "inventory";
export const saveGaLog = (table: GaLogTable, id: number | null, d: Record<string, unknown>) => rpc038<number>("ga_save_log", { p_table: table, p_id: id, p_data: d });
export const deleteGaLog = (table: GaLogTable, id: number) => rpc038<null>("ga_delete_log", { p_table: table, p_id: id });
