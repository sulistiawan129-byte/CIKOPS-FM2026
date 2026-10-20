/* ════════════════════════════════════════════════════════════
   SECURITY DESK (cik-g4s) → CIKOPS
   Tim security mengisi semua data di Security Desk. CIKOPS membaca
   ringkasan bulanan lewat /api/gc-nc?sd=1 (fungsi security.cikops_report)
   lalu mengubahnya ke format SecData yang dipakai modul & laporan manajemen.
════════════════════════════════════════════════════════════ */

import { KEJ_CATS, normalizeData, weeksOfMonth, type SecData, type VehKey, type WeekPair } from "./model";

export const SECDESK_URL = "https://cik-g4s.vercel.app";

export interface SdReport {
  version: number;
  site: { code: string; name: string; plant: string };
  month: string;
  generated_at: string;
  daily: { d: string; c: string; v: number }[];
  incidents: { category: string; value: number; note: string }[];
  patrol: { target_patrol: number; actual_patrol: number; target_checkpoint: number; actual_checkpoint: number; note: string } | null;
  extra: { selisih_timbang: number; palm_oil: number; team: Record<string, number>; team_note: string } | null;
  issues: { day: string; category: string; description: string; status: "Open" | "Close" }[];
  leaves: { name: string; date_text: string; type: string; backup: string }[];
  improvements: { opened_month: string; description: string; priority: string; progress: string; status: "Open" | "Proses" | "Selesai" }[];
  kpi: { m: number; o: number; s: number }[];
  gate: {
    days: { d: string; n: number }[];
    total_in: number; total_out: number; with_findings: number; avg_minutes: number | null;
    inside_now: number; over_4h: number; top_companies: { name: string; n: number }[];
  };
}

/** Objektif KPI security (urutan = nomor objektif di Security Desk). */
export const SD_KPI_OBJ: [string, number][] = [
  ["Internal audit finding", 15], ["Follow up internal audit", 15], ["External audit finding", 15],
  ["Follow up external audit", 15], ["Kepuasan klien", 15], ["NC & komplain", 15], ["Follow up NC & komplain", 10],
];

/** Bulan ini punya isi di Security Desk? (kalau kosong, data CIKOPS lama tetap dipakai) */
export function sdHasData(r: SdReport | null | undefined): r is SdReport {
  if (!r) return false;
  return r.daily.length > 0 || r.incidents.some((i) => i.value > 0) || !!r.patrol || !!r.extra || r.issues.length > 0;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SD_VEH: Record<string, VehKey> = { karyawan: "kary", tamu: "tamu", kontraktor: "kontr", motor: "motor" };

/** Ubah laporan Security Desk ke SecData. Bagian yang tidak ada di Security Desk (input cadangan G-C, status) diambil dari `base`. */
export function sdToSecData(key: string, r: SdReport, base?: SecData | null): SecData {
  const weeks = weeksOfMonth(key);
  const n = weeks.length;
  const pair = (): WeekPair => ({ wd: Array(n).fill(0), we: Array(n).fill(0) });
  const veh: Record<VehKey, WeekPair> = { kary: pair(), tamu: pair(), kontr: pair(), motor: pair() };
  const vis = pair(), tr = pair(), bio = pair();
  let non = 0, sekam = 0, abu = 0;

  for (const row of r.daily) {
    const i = weeks.findIndex((w) => row.d >= w.from && row.d <= w.to);
    if (i < 0) continue;
    const dow = new Date(`${row.d}T00:00:00`).getDay();
    const side = dow === 0 || dow === 6 ? "we" : "wd";
    const v = Number(row.v) || 0;
    if (SD_VEH[row.c]) veh[SD_VEH[row.c]][side][i] += v;
    else if (row.c === "visitor") vis[side][i] += v;
    else if (row.c === "timbang") tr[side][i] += v;
    else if (row.c === "non_timbang") non += v;
    else if (row.c === "sekam") { sekam += v; bio[side][i] += v; }
    else if (row.c === "abu") { abu += v; bio[side][i] += v; }
  }

  const kej: Record<string, number> = Object.fromEntries(KEJ_CATS.map((c) => [c.id, 0]));
  const catOf = (name: string) => KEJ_CATS.find((c) => norm(c.id) === norm(name))?.id || name;
  for (const i of r.incidents) kej[catOf(i.category)] = (kej[catOf(i.category)] || 0) + (Number(i.value) || 0);

  const p = r.patrol;
  const x = r.extra;
  return normalizeData(key, {
    pelManual: base?.pelManual,
    totals: base?.totals,
    status: base?.status,
    veh, vis,
    tr: { ...tr, non, sel: x?.selisih_timbang || 0, po: x?.palm_oil || 0 },
    bio: { ...bio, sekam, abu },
    kej,
    issues: r.issues.map((i) => ({ tgl: i.day, kat: catOf(i.category), desc: i.description, status: i.status === "Close" ? "Close" : "Open" })),
    pat: p
      ? { tp: p.target_patrol, ap: p.actual_patrol, tc: p.target_checkpoint, ac: p.actual_checkpoint, missed: Math.max(0, p.target_patrol - p.actual_patrol), note: p.note }
      : { tp: 0, ap: 0, tc: 0, ac: 0, missed: 0, note: "" },
    team: x?.team || {},
    teamNote: x?.team_note || "",
    sd: { at: r.generated_at },
  });
}
