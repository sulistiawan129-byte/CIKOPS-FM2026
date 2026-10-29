/* MOCK BACKEND — view database (dihitung saat dibaca). */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { table, type MockDB, type Row } from "./core";

export const VIEWS: Record<string, true> = { tasks_detail: true, driver_tier_summary: true, current_kantong: true };

export function taskDetail(db: MockDB, t: Row): Row {
  const d = table(db, "drivers").find((x) => x.id === t.driver_id);
  const v = table(db, "vehicles").find((x) => x.id === t.vehicle_id);
  return {
    ...t,
    driver_nama: d?.nama ?? null, driver_avatar: d?.avatar_emoji ?? null,
    kendaraan: v?.nopol ?? null, kendaraan_jenis: v?.jenis ?? null,
    plant: t.plant ?? d?.plant ?? "CIK", batch_id: t.batch_id ?? null, batch_total_days: t.batch_total_days ?? 1,
  };
}

export function readView(db: MockDB, name: string): Row[] {
  if (name === "tasks_detail") return table(db, "tasks").map((t) => taskDetail(db, t));
  if (name === "driver_tier_summary") {
    const drivers = table(db, "drivers");
    return table(db, "driver_tiers").map((t) => ({ ...t, active_driver_count: drivers.filter((d) => d.tier_id === t.id && d.aktif).length }));
  }
  if (name === "current_kantong") {
    const by = new Map<string, Row>();
    for (const k of table(db, "kantong")) { const cur = by.get(k.plant); if (!cur || k.period > cur.period) by.set(k.plant, k); }
    return [...by.values()];
  }
  return [];
}
