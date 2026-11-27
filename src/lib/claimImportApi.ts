/* Simpan / hapus hasil impor klaim lama. Setiap klaim hasil impor diberi penanda di awal catatan,
   mis. "[IMPOR-2025] Carwash", supaya impor bisa diganti atau dibatalkan tanpa menyentuh klaim lain. */

import { supabase } from "./supabaseClient";
import type { ClaimDraft } from "./claimImport";

export const importMarker = (label: string) => `[IMPOR-${label.trim().replace(/[^A-Za-z0-9_-]+/g, "") || "LAMA"}]`;

export async function countImported(marker: string): Promise<number> {
  const { count, error } = await supabase.from("claims").select("id", { count: "exact", head: true }).like("note", `${marker}%`);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteImported(marker: string): Promise<void> {
  const { error } = await supabase.from("claims").delete().like("note", `${marker}%`);
  if (error) throw error;
}

/** Masukkan klaim bertahap (agar permintaan tidak terlalu besar). Mengembalikan jumlah klaim yang tersimpan. */
export async function insertDrafts(drafts: ClaimDraft[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < drafts.length; i += BATCH) {
    const rows = drafts.slice(i, i + BATCH).map((d) => ({
      driver_id: d.driver_id,
      submission_date: d.submission_date,
      period_date: d.period_date,
      items: d.items,
      total: d.total,
      note: d.note,
      status: "submitted",
      submitted_at: `${d.submission_date}T09:00:00+07:00`,
    }));
    const { error } = await supabase.from("claims").insert(rows);
    if (error) throw new Error(`${error.message} (setelah ${done} klaim tersimpan; jalankan impor lagi untuk mengganti seluruhnya)`);
    done += rows.length;
    onProgress?.(done, drafts.length);
  }
  return done;
}
