/* ════════════════════════════════════════════════════════════
   GA FACILITY (Cleaning Service, Gardening, TGA) — tipe & hitungan.
   Data hasil sinkron dari Excel "ISS GA System" (modSyncGA).
   Rumus mengikuti Laporan Bulanan Excel:
     achievement      = dikerjakan / plan yang sudah jatuh tempo (≤ asOf).
                        Untuk bulan yang sudah lewat asOf = akhir bulan, jadi sama
                        persis dengan Excel; bulan berjalan tidak "turun" karena
                        jadwal yang memang belum tiba.
     belum diinput    = jadwal sudah lewat (≤ hari ini) dengan actual kosong
     kepatuhan input  = jadwal jatuh tempo yang sudah diinput / jadwal jatuh tempo
════════════════════════════════════════════════════════════ */

export interface GaPlan {
  key: string;
  periode: number;
  tanggal: string;
  hari: string;
  jobId: string;
  tim: string;
  lokasi: string;
  tipe: string;
  area: string;
  petugas: string;
  plan: number;
  actual: 0 | 1 | null;
  spv: string;
  waktuInput: string | null;
}
export interface GaJob { id: string; tim: string; lokasi: string; tipe: string; area: string; frek: string; hari: string; petugas: string; aktif: boolean; catatan: string }
export interface GaManpower { id: string; nama: string; tim: string; jabatan: string; areaTugas: string; status: string }
export interface GaEvent { id: number; tanggal: string | null; nama: string; deskripsi: string; waktu: string; support: string; dokumentasi: string }
export interface GaImprovement { id: number; tanggal: string | null; kategori: string; jenis: string; deskripsi: string; area: string; petugas: string; pengawas: string; dokumentasi: string }
export interface GaInventory { id: number; kode: string; nama: string; jenis: string; area: string; status: string; foto: string; jumlah: number | null; tglUpdate: string | null }
export interface GaTga {
  id: number | string; tanggal: string | null; namaTga: string; activity: string; requestBy: string;
  /** "excel" = hasil sinkron log Excel, "app" = dicatat teknisi lewat aplikasi /tga */
  source?: "excel" | "app";
  refNo?: string; kategori?: string; lokasi?: string; departemen?: string; status?: string; prioritas?: string; jam?: string; catatan?: string;
}
export interface GaSyncStatus {
  lastSyncAt: string | null; lastComputer: string | null; lastPlanAt: string | null; lastMasterAt: string | null; lastLogsAt: string | null;
  jobs: number; plan: number; isAdmin: boolean; syncKey: string | null;
}

export interface GaSummary {
  plan: number; done: number; tidak: number; belum: number; notDue: number; due: number; inputted: number;
  /** 0..1 = dikerjakan / jadwal jatuh tempo; null bila belum ada jadwal jatuh tempo */
  ach: number | null;
  /** 0..1 atau null bila belum ada jadwal jatuh tempo */
  compliance: number | null;
}

export const TEAMS = ["Cleaning Service", "Gardener"] as const;

export function summarize(rows: GaPlan[], asOf: string): GaSummary {
  let plan = 0, done = 0, tidak = 0, belum = 0, notDue = 0, due = 0, inputted = 0, doneDue = 0;
  for (const r of rows) {
    if (!r.plan) continue;
    plan++;
    const isDue = r.tanggal <= asOf;
    if (r.actual === 1) done++;
    else if (r.actual === 0) tidak++;
    if (isDue) {
      due++;
      if (r.actual === null) belum++; else inputted++;
      if (r.actual === 1) doneDue++;
    } else if (r.actual === null) notDue++;
  }
  return { plan, done, tidak, belum, notDue, due, inputted, ach: due ? doneDue / due : null, compliance: due ? inputted / due : null };
}

export interface GaGroup extends GaSummary { key: string }
export function groupBy(rows: GaPlan[], keyOf: (r: GaPlan) => string, asOf: string): GaGroup[] {
  const m = new Map<string, GaPlan[]>();
  for (const r of rows) {
    const k = keyOf(r) || "(kosong)";
    const a = m.get(k);
    if (a) a.push(r); else m.set(k, [r]);
  }
  return [...m.entries()].map(([key, rs]) => ({ key, ...summarize(rs, asOf) }));
}

/** Achievement terendah dulu (yang perlu perhatian), lalu plan terbanyak. */
export function byLowestAch(a: GaGroup, b: GaGroup): number {
  return (a.ach ?? 2) - (b.ach ?? 2) || b.plan - a.plan;
}

export function statusAch(s: GaSummary): "achieve" | "not" | "na" {
  if (s.ach === null) return "na";
  return s.ach >= 0.999 ? "achieve" : "not";
}

export function periodeOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4)) * 100 + Number(isoDate.slice(5, 7));
}
export function monthRange(periode: number): { from: string; to: string } {
  const y = Math.floor(periode / 100), m = periode % 100;
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}
export function shiftPeriode(periode: number, n: number): number {
  const y = Math.floor(periode / 100), m = periode % 100;
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() * 100 + d.getMonth() + 1;
}
/** "Minggu ke" dalam bulan: minggu Senin–Minggu; minggu pertama = minggu yang memuat tanggal 1. */
export function weekOfMonth(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00");
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Math.floor((d.getDate() + offset - 1) / 7) + 1;
}
export const inMonth = (d: string | null, periode: number) => !!d && periodeOf(d) === periode;
