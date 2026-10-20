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
  return (data ?? []).map((r) => ({ id: r.id, nama: r.nama ?? "", tim: r.tim ?? "", jabatan: r.jabatan ?? "", areaTugas: r.area_tugas ?? "", status: r.status ?? "" }));
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
  const app: GaTga[] = await tgaAllActivities().then((rows) => rows.map((a) => ({
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
  };
}
export async function rotateGaSyncKey(): Promise<string> {
  const { data, error } = await supabase.rpc("ga_rotate_sync_key");
  if (error) throw notReady(error);
  return String(data);
}
