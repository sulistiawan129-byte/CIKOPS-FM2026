import type { CatKey, ExtraKey } from "./constants";
import type { DayInfo } from "./dates";

import type { Role } from "./access";
export type { Role };
export interface Profile { id: string; email: string | null; full_name: string | null; role: Role; site_ids: string[]; modules: string[] | null; active: boolean }
export interface Site { id: string; code: string; name: string; client: string | null }

export interface IncRow { category: string; value: number; note: string }
export interface Patrol { target_patrol: number; target_checkpoint: number; actual_patrol: number; actual_checkpoint: number; note: string }
export interface Leave { id: string; name: string; date_text: string; type: string; backup: string }
export interface Improvement { id: string; opened_month: string; description: string; priority: string; progress: string; status: "Open" | "Proses" | "Selesai" }
export interface DayEvent { id: string; day: string; kind: string; description: string; created_at: string }
export interface MonthExtra { selisih_timbang: number; palm_oil: number; team: Record<string, number>; team_note: string }
export interface AreaIssue { id: string; day: string; category: string; description: string; status: "Open" | "Close" }
export interface Note { note: string; weekly_note: string }

export interface MonthData {
  month: string;
  days: DayInfo[];
  daily: Record<CatKey, number[]>;
  filled: boolean[];
  totals13: Record<CatKey, number[]>;
  inc: IncRow[];
  incPrev: Record<string, number | null>;
  patrol: Patrol;
  leaves: Leave[];
  improvements: Improvement[];
  kpi: (number | null)[][];
  notes: Record<string, Note>;
  events: DayEvent[];
  /** false = laporan_cikops.sql belum dijalankan (tabel tambahan belum ada). */
  extraReady: boolean;
  extraDaily: Record<ExtraKey, number[]>;
  extra: MonthExtra;
  issues: AreaIssue[];
  loadedAt: number;
}
