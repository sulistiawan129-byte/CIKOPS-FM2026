/* ════════════════════════════════════════════════════════════
   SECURITY — model data input bulanan (dipakai form & report).
   Satu baris per bulan di tabel security_monthly (kolom data jsonb).
   Angka kendaraan/visitor/transporter diisi per minggu (WD/WE);
   bulan-bulan lama cukup diisi total (riwayat) untuk grafik tren.
════════════════════════════════════════════════════════════ */

export type VehKey = "kary" | "tamu" | "kontr" | "motor";
export type TotalKey = VehKey | "vis" | "timbang" | "non" | "biomas" | "pel" | "kej";

export const VEH_CATS: { k: VehKey; id: string; en: string; noteId?: string; noteEn?: string }[] = [
  { k: "kary", id: "Mobil Karyawan", en: "Employee Cars" },
  { k: "tamu", id: "Mobil Tamu", en: "Guest Cars" },
  { k: "kontr", id: "Mobil Kontraktor", en: "Contractor Cars" },
  { k: "motor", id: "Motor", en: "Motorcycles", noteId: "karyawan, outsource, kontraktor & tamu", noteEn: "employees, outsourced, contractors & guests" },
];

/** Jenis kejadian yang diisi manual. Dua jenis lain dihitung otomatis:
 *  Timbangan (dari selisih timbang di form Transporter) dan Pelanggaran Transporter (dari G-C). */
export const KEJ_CATS: { id: string; en: string }[] = [
  { id: "Lingkungan", en: "Environment" },
  { id: "Komplain Internal", en: "Internal Complaint" },
  { id: "Komplain Eksternal", en: "External Complaint" },
  { id: "Security Issue", en: "Security Issue" },
  { id: "Lost & Found", en: "Lost & Found" },
  { id: "Kerusakan Fasilitas", en: "Facility Damage" },
  { id: "Kecelakaan / Sakit", en: "Accident / Illness" },
  { id: "Kerusakan Khusus", en: "Special Damage" },
  { id: "External Threat", en: "External Threat" },
  { id: "Kejadian Lain-lain", en: "Other Incidents" },
  { id: "Kegiatan Khusus", en: "Special Activities" },
  { id: "Pelanggaran KDM", en: "KDM Violation" },
];
export const KEJ_AUTO_TIMBANG = { id: "Timbangan (selisih ≥ 40 kg)", en: "Weighbridge (gap ≥ 40 kg)" };
export const KEJ_AUTO_PEL = { id: "Pelanggaran Transporter", en: "Transporter Violations" };

export const TEAM_KEYS = ["Team G", "External", "Lingkungan", "G4S"];

/** Jenis pelanggaran transporter (sama dengan kategori NC di G-C) — untuk input manual cadangan. */
export const NC_JENIS = [
  "Pengganjal Tidak Standard", "Tidak Pakai Rompi", "Tidak Tersedia APAR & P3K", "Tidak Pakai Sepatu Safety",
  "KIR Kendaraan Mati", "Tidak Ada Pengganjal Ban", "Tidak Pakai Helm", "SIM Tidak Sesuai", "Tidak Tersedia APAR",
];

export const DEFAULT_KHUSUS = ["PT. BECIS", "PT. JAYA MUKTI MANDIRI"];

export interface WeekPair { wd: number[]; we: number[] }
export interface Issue { tgl: string; kat: string; desc: string; status: "Open" | "Close" }
export interface PelManual {
  companies: { name: string; n: number }[];
  jenis: Record<string, number>;
  kJenis: Record<string, number>;
  drivers: { name: string; co: string; n: number }[];
}
export interface SecData {
  veh?: Partial<Record<VehKey, WeekPair>>;
  vis?: WeekPair;
  team?: Record<string, number>;
  teamNote?: string;
  tr?: { wd: number[]; we: number[]; non: number; sel: number; po: number };
  bio?: { sekam: number; abu: number; wd: number[]; we: number[] };
  kej?: Record<string, number>;
  issues?: Issue[];
  pat?: { tp: number; ap: number; tc: number; ac: number; missed: number; note?: string };
  /** Dipakai bila sinkron G-C tidak tersedia. */
  pelManual?: PelManual;
  /** Riwayat: total sebulan untuk bulan yang tidak diisi per minggu. */
  totals?: Partial<Record<TotalKey, number>>;
  status?: "draft" | "ready";
}

export interface Week { from: string; to: string; label: string; wdDays: number; weDays: number }

const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKeyOf = (iso: string) => iso.slice(0, 7);
export const monthStart = (key: string) => `${key}-01`;
export function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return isoOf(new Date(y, m, 0));
}
export function addMonthsKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthKeysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let k = fromKey;
  for (let i = 0; i < 400 && k <= toKey; i++) { out.push(k); k = addMonthsKey(k, 1); }
  return out;
}

/** Minggu kalender Senin–Minggu, dipotong batas bulan (mis. Sep 2026: 1–6, 7–13, 14–20, 21–27, 28–30). */
export function weeksOfMonth(key: string): Week[] {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: Week[] = [];
  let d = 1;
  while (d <= last) {
    const start = new Date(y, m - 1, d);
    const dow = (start.getDay() + 6) % 7; // 0 = Senin
    const endDay = Math.min(last, d + (6 - dow));
    let wd = 0, we = 0;
    for (let i = d; i <= endDay; i++) { const g = new Date(y, m - 1, i).getDay(); if (g === 0 || g === 6) we++; else wd++; }
    out.push({ from: isoOf(start), to: isoOf(new Date(y, m - 1, endDay)), label: d === endDay ? `${d}` : `${d}–${endDay}`, wdDays: wd, weDays: we });
    d = endDay + 1;
  }
  return out;
}

const zeros = (n: number) => Array.from({ length: n }, () => 0);
export function emptyData(key: string): SecData {
  const n = weeksOfMonth(key).length;
  return {
    veh: { kary: { wd: zeros(n), we: zeros(n) }, tamu: { wd: zeros(n), we: zeros(n) }, kontr: { wd: zeros(n), we: zeros(n) }, motor: { wd: zeros(n), we: zeros(n) } },
    vis: { wd: zeros(n), we: zeros(n) },
    team: Object.fromEntries(TEAM_KEYS.map((k) => [k, 0])),
    teamNote: "",
    tr: { wd: zeros(n), we: zeros(n), non: 0, sel: 0, po: 0 },
    bio: { sekam: 0, abu: 0, wd: zeros(n), we: zeros(n) },
    kej: Object.fromEntries(KEJ_CATS.map((c) => [c.id, 0])),
    issues: [],
    pat: { tp: 0, ap: 0, tc: 0, ac: 0, missed: 0, note: "" },
    status: "draft",
  };
}

/** Lengkapi data dari DB supaya semua field ada & panjang array minggu sesuai bulan. */
export function normalizeData(key: string, raw: SecData | null | undefined): SecData {
  const base = emptyData(key);
  const d: SecData = JSON.parse(JSON.stringify(raw || {}));
  const n = weeksOfMonth(key).length;
  const fixPair = (p?: WeekPair): WeekPair => ({ wd: zeros(n).map((_, i) => num(p?.wd?.[i])), we: zeros(n).map((_, i) => num(p?.we?.[i])) });
  return {
    ...d,
    veh: Object.fromEntries(VEH_CATS.map((c) => [c.k, fixPair(d.veh?.[c.k])])) as SecData["veh"],
    vis: fixPair(d.vis),
    team: { ...base.team, ...(d.team || {}) },
    teamNote: d.teamNote || "",
    tr: { ...fixPair(d.tr), non: num(d.tr?.non), sel: num(d.tr?.sel), po: num(d.tr?.po) },
    bio: { ...fixPair(d.bio), sekam: num(d.bio?.sekam), abu: num(d.bio?.abu) },
    kej: { ...base.kej, ...(d.kej || {}) },
    issues: Array.isArray(d.issues) ? d.issues : [],
    pat: { ...base.pat!, ...(d.pat || {}) },
    status: d.status || "draft",
  };
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
export const sumArr = (a?: number[]) => (a || []).reduce((s, v) => s + num(v), 0);
const pairSum = (p?: WeekPair) => sumArr(p?.wd) + sumArr(p?.we);

export interface MonthTotals {
  kary: number | null; tamu: number | null; kontr: number | null; motor: number | null; vis: number | null;
  timbang: number | null; non: number | null; biomas: number | null;
  /** Kejadian manual (tanpa dua jenis otomatis). */
  kejManual: number | null; sel: number | null;
  pelManual: number | null; pelHist: number | null;
}

/** Total sebulan per indikator. null = bulan itu tidak punya data indikator tsb. */
export function monthTotals(d: SecData | null | undefined): MonthTotals {
  const t = d?.totals || {};
  const pick = (weekly: number, hasWeekly: boolean, hist: number | undefined) => (hasWeekly && weekly > 0 ? weekly : hist !== undefined && hist !== null ? num(hist) : null);
  const vehOf = (k: VehKey) => pick(pairSum(d?.veh?.[k]), !!d?.veh?.[k], t[k]);
  const timbangW = sumArr(d?.tr?.wd) + sumArr(d?.tr?.we);
  const bioW = num(d?.bio?.sekam) + num(d?.bio?.abu);
  const kejW = d?.kej ? Object.values(d.kej).reduce((s, v) => s + num(v), 0) : 0;
  const pm = d?.pelManual?.companies?.reduce((s, c) => s + num(c.n), 0) || 0;
  return {
    kary: vehOf("kary"), tamu: vehOf("tamu"), kontr: vehOf("kontr"), motor: vehOf("motor"),
    vis: pick(pairSum(d?.vis), !!d?.vis, t.vis),
    timbang: pick(timbangW, !!d?.tr, t.timbang),
    non: d?.tr && num(d.tr.non) > 0 ? num(d.tr.non) : t.non !== undefined ? num(t.non) : null,
    biomas: bioW > 0 ? bioW : t.biomas !== undefined ? num(t.biomas) : null,
    kejManual: kejW > 0 ? kejW : t.kej !== undefined ? num(t.kej) : null,
    sel: d?.tr && num(d.tr.sel) > 0 ? num(d.tr.sel) : null,
    pelManual: pm > 0 ? pm : null,
    pelHist: t.pel !== undefined && t.pel !== null ? num(t.pel) : null,
  };
}

/* ── Kasus pelanggaran dari G-C (hasil API /api/gc-nc) ── */
export interface GcCase {
  id: string;
  tanggal: string;
  supplier: string;
  nopol: string;
  /** Hash nomor SIM (nomor aslinya tidak dikirim ke browser). */
  simHash: string;
  simLast4: string;
  jenis: string[];
}

export const normCo = (s: string) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();

export interface GcAgg {
  total: number;
  temuan: number;
  companies: { name: string; n: number; t: number; khusus: boolean }[];
  jenis: { name: string; n: number }[];
  khusus: {
    total: number;
    byCo: { name: string; n: number }[];
    jenis: { name: string; n: number }[];
    drivers: { hash: string; last4: string; nopol: string; co: string; n: number }[];
  };
  repeat: { hash: string; last4: string; nopol: string; co: string; n: number }[];
}

export function aggregateGc(cases: GcCase[], from: string, to: string, khususList: string[]): GcAgg {
  const kset = new Set(khususList.map(normCo));
  const cur = cases.filter((c) => c.tanggal >= from && c.tanggal <= to);
  const co = new Map<string, { n: number; t: number }>();
  const je = new Map<string, number>();
  const kje = new Map<string, number>();
  const drv = new Map<string, { hash: string; last4: string; nopol: string; co: string; n: number }>();
  let temuan = 0;
  cur.forEach((c) => {
    const name = c.supplier || "-";
    const e = co.get(name) || { n: 0, t: 0 };
    e.n += 1; e.t += Math.max(1, c.jenis.length); co.set(name, e);
    c.jenis.forEach((j) => { je.set(j, (je.get(j) || 0) + 1); temuan++; });
    const key = c.simHash || `nopol:${c.nopol}`;
    const d = drv.get(key) || { hash: key, last4: c.simLast4, nopol: c.nopol, co: name, n: 0 };
    d.n += 1; drv.set(key, d);
    if (kset.has(normCo(name))) c.jenis.forEach((j) => kje.set(j, (kje.get(j) || 0) + 1));
  });
  const companies = [...co.entries()].map(([name, v]) => ({ name, n: v.n, t: v.t, khusus: kset.has(normCo(name)) })).sort((a, b) => b.n - a.n || b.t - a.t);
  const drivers = [...drv.values()];
  const kDrivers = drivers.filter((d) => kset.has(normCo(d.co))).sort((a, b) => b.n - a.n);
  const byCo = khususList.map((k) => ({ name: k, n: companies.find((c) => normCo(c.name) === normCo(k))?.n || 0 }));
  return {
    total: cur.length,
    temuan,
    companies,
    jenis: [...je.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    khusus: { total: byCo.reduce((s, c) => s + c.n, 0), byCo, jenis: [...kje.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n), drivers: kDrivers },
    repeat: drivers.filter((d) => d.n > 1).sort((a, b) => b.n - a.n),
  };
}

/** Rekap dari input manual (cadangan bila G-C tidak tersambung). */
export function aggregateManual(p: PelManual | undefined, khususList: string[]): GcAgg {
  const kset = new Set(khususList.map(normCo));
  const companies = (p?.companies || []).filter((c) => num(c.n) > 0).map((c) => ({ name: c.name, n: num(c.n), t: num(c.n), khusus: kset.has(normCo(c.name)) })).sort((a, b) => b.n - a.n);
  const jenis = Object.entries(p?.jenis || {}).map(([name, n]) => ({ name, n: num(n) })).filter((j) => j.n > 0).sort((a, b) => b.n - a.n);
  const byCo = khususList.map((k) => ({ name: k, n: companies.find((c) => normCo(c.name) === normCo(k))?.n || 0 }));
  const drivers = (p?.drivers || []).filter((d) => num(d.n) > 0).map((d) => ({ hash: `manual:${d.name}`, last4: "", nopol: "", co: d.co, n: num(d.n), name: d.name }));
  return {
    total: companies.reduce((s, c) => s + c.n, 0),
    temuan: jenis.reduce((s, j) => s + j.n, 0),
    companies, jenis,
    khusus: {
      total: byCo.reduce((s, c) => s + c.n, 0), byCo,
      jenis: Object.entries(p?.kJenis || {}).map(([name, n]) => ({ name, n: num(n) })).filter((j) => j.n > 0).sort((a, b) => b.n - a.n),
      drivers,
    },
    repeat: drivers.filter((d) => d.n > 1),
  };
}

/** Nama driver yang ditautkan admin ke hash SIM (disimpan di security_config.driver_names). */
export type DriverNames = Record<string, { name: string; co?: string }>;
export function driverLabel(d: { hash: string; last4: string; nopol: string; name?: string }, names: DriverNames): string {
  if (d.name) return d.name;
  const n = names[d.hash]?.name;
  if (n) return n;
  return [d.last4 ? `SIM ••${d.last4}` : "", d.nopol].filter(Boolean).join(" · ") || "-";
}
