/* FM COMMAND CENTER — akses data (RPC migrasi 028 + ringkasan NC dari G-C). Tanpa login. */

import { supabase } from "../supabaseClient";
import type { FmSnapshot, NcBoard } from "./model";

function friendly(error: { code?: string; message?: string }): Error {
  if (error.code === "PGRST202" || error.code === "42883" || /Could not find the function|does not exist/i.test(error.message ?? "")) {
    return new Error("FM Command Center belum aktif — jalankan supabase/028_fm_command_center.sql di Supabase.");
  }
  return new Error(error.message ?? String(error));
}

/** Data berjalan (hari ini + bulan berjalan) Fleet, Gate, Kantin, ATK. */
export async function getFmSnapshot(): Promise<FmSnapshot> {
  const { data, error } = await supabase.rpc("get_fm_snapshot");
  if (error) throw friendly(error);
  return data as FmSnapshot;
}

/** Pelanggaran / NC bulan berjalan dari G-C (jumlah, jenis, transporter — tanpa data driver). */
export async function getNcBoard(): Promise<NcBoard> {
  const r = await fetch("/api/gc-nc?board=1", { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as (NcBoard & { error?: string }) | null;
  if (!r.ok || !j || !j.ok) throw new Error(j?.error || `Data pelanggaran tidak tersedia (${r.status})`);
  return j;
}
