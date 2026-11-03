/* API menu kantin mingguan (layar TV /menu-tv + editor di Dashboard → Kantin → Menu TV). */
import { supabase } from "./supabaseClient";
import { L } from "./i18n";
import { normalizeWeek, serializeWeek, type WeeklyMenu } from "./canteenMenu";

const friendly = (e: { code?: string; message?: string }): Error => {
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883")
    return new Error(L("Tabel menu kantin belum ada — jalankan supabase/04_aplikasi_lapangan.sql (bagian 051) di Supabase SQL Editor.", "The canteen menu table is missing — run supabase/04_aplikasi_lapangan.sql (section 051) in the Supabase SQL Editor."));
  if (e.code === "42501") return new Error(L("Akun ini tidak punya izin mengubah menu kantin.", "This account is not allowed to edit the canteen menu."));
  return new Error(e.message ?? L("Terjadi kesalahan.", "Something went wrong."));
};

/** Menu satu minggu (staf login). null = belum pernah diisi. */
export async function getMenuWeek(weekStart: string): Promise<WeeklyMenu | null> {
  const { data, error } = await supabase.from("canteen_menu_weeks").select("week_start, data").eq("week_start", weekStart).maybeSingle();
  if (error) throw friendly(error);
  return data ? normalizeWeek((data as { data: unknown }).data, weekStart) : null;
}

/** Beberapa minggu terakhir — dipakai untuk saran nama menu + kalori/gram otomatis. */
export async function getRecentMenuWeeks(limit = 12): Promise<WeeklyMenu[]> {
  const { data, error } = await supabase.from("canteen_menu_weeks").select("week_start, data").order("week_start", { ascending: false }).limit(limit);
  if (error) throw friendly(error);
  return ((data ?? []) as { week_start: string; data: unknown }[]).map((r) => normalizeWeek(r.data, r.week_start));
}

export async function saveMenuWeek(menu: WeeklyMenu): Promise<void> {
  const { error } = await supabase.from("canteen_menu_weeks").upsert(
    { week_start: menu.weekStart, data: serializeWeek(menu), updated_at: new Date().toISOString() }, { onConflict: "week_start" });
  if (error) throw friendly(error);
}

export async function deleteMenuWeek(weekStart: string): Promise<void> {
  const { error } = await supabase.from("canteen_menu_weeks").delete().eq("week_start", weekStart);
  if (error) throw friendly(error);
}

/** Layar TV (tanpa login): lewat fungsi publik, hanya baca. null = minggu itu belum diisi. */
export async function getPublicMenu(weekStart: string): Promise<WeeklyMenu | null> {
  const { data, error } = await supabase.rpc("canteen_menu_public", { p_week: weekStart });
  if (error) throw friendly(error);
  return data ? normalizeWeek(data, weekStart) : null;
}
