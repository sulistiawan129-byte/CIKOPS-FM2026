/* Riwayat pembuatan Surat Kuasa (tabel surat_kuasa_log, SQL 15). */

import { supabase } from "./supabaseClient";
import type { SuratKuasaData, SuratKuasaTipe } from "./suratKuasa";
import { L } from "./i18n";

export interface SuratKuasaLog {
  id: string;
  createdAt: string;
  createdBy: string;
  tipe: SuratKuasaTipe;
  tanggal: string;
  nopol: string;
  merk: string;
  vehicleId: string | null;
  pemberiNama: string;
  penerimaNama: string;
  data: SuratKuasaData | null;
}

const SQL_MSG = () => L("Riwayat Surat Kuasa belum aktif — jalankan supabase/15_data_dokumen_kendaraan.sql di Supabase SQL Editor.", "Letter history is not enabled yet — run supabase/15_data_dokumen_kendaraan.sql in the Supabase SQL Editor.");
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /surat_kuasa_log/i.test(e.message ?? ""));

type Row = Record<string, unknown>;
const toLog = (r: Row): SuratKuasaLog => ({
  id: String(r.id), createdAt: String(r.created_at ?? ""), createdBy: String(r.created_by ?? ""),
  tipe: r.tipe === "kir" ? "kir" : "stnk", tanggal: String(r.tanggal ?? ""), nopol: String(r.nopol ?? ""), merk: String(r.merk ?? ""),
  vehicleId: (r.vehicle_id as string | null) ?? null, pemberiNama: String(r.pemberi_nama ?? ""), penerimaNama: String(r.penerima_nama ?? ""),
  data: (r.data && typeof r.data === "object" && (r.data as Row).tipe ? (r.data as unknown as SuratKuasaData) : null),
});

export async function getSuratKuasaLog(limit = 100): Promise<SuratKuasaLog[]> {
  const { data, error } = await supabase.from("surat_kuasa_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (isMissingTable(error)) throw new Error(SQL_MSG());
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toLog);
}

export async function addSuratKuasaLog(d: SuratKuasaData, vehicleId: string | null): Promise<void> {
  const { error } = await supabase.from("surat_kuasa_log").insert({
    tipe: d.tipe, tanggal: d.tanggal, kota: d.kota, vehicle_id: vehicleId || null, nopol: d.kendaraan.nopol, merk: d.kendaraan.merk,
    pemberi_nama: d.pemberi.nama, pemberi_jabatan: d.pemberi.jabatan, penerima_nama: d.penerima.nama, penerima_alamat: d.penerima.alamat, data: d,
  });
  if (isMissingTable(error)) throw new Error(SQL_MSG());
  if (error) throw error;
}
