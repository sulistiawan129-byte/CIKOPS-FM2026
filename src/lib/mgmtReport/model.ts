/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — model data bersama untuk Excel, PowerPoint, PDF
   dan pratinjau di aplikasi. Satu sumber angka, tiga format keluaran.
════════════════════════════════════════════════════════════ */

export type ModuleKey = "fleet" | "claims" | "canteen" | "atk" | "ga" | "tga" | "receptionist" | "security";

/** Modul yang datanya dipisah per plant (tugas/armada/driver/klaim). Modul lain (kantin, ATK, C&G, TGA, Receptionist, Security) adalah fasilitas satu lokasi (CIK) dan tidak punya data PRB. */
export const PLANT_MODULES: ModuleKey[] = ["fleet", "claims"];

/** Kelompok laporan — sama dengan kategori menu dashboard. */
export type CategoryKey = "fleet" | "finance" | "facility" | "security";
export const CATEGORIES: { key: CategoryKey; id: string; en: string; modules: ModuleKey[] }[] = [
  { key: "fleet", id: "Fleet & Kendaraan", en: "Fleet & Vehicles", modules: ["fleet"] },
  { key: "finance", id: "Finance", en: "Finance", modules: ["claims"] },
  { key: "facility", id: "Fasilitas", en: "Facility", modules: ["canteen", "atk", "ga", "tga", "receptionist"] },
  { key: "security", id: "Security", en: "Security", modules: ["security"] },
];
export const categoryOf = (k: ModuleKey): CategoryKey => CATEGORIES.find((c) => c.modules.includes(k))?.key ?? "facility";

export type ReportLang = "id" | "en";
export type Granularity = "auto" | "day" | "week" | "month";

/* Bahasa & granularitas aktif. Laporan disusun & diekspor berurutan di klien,
   jadi cukup satu status modul: build/ekspor memanggil setReportLang() di awal. */
let LANG: ReportLang = "id";
let GRAN: Granularity = "auto";
export function setReportLang(l: ReportLang) { LANG = l === "en" ? "en" : "id"; }
export function getReportLang(): ReportLang { return LANG; }
export function setGranularity(g: Granularity) { GRAN = g; }
/** Pilih teks sesuai bahasa laporan aktif. */
export const tr = (id: string, en: string) => (LANG === "en" ? en : id);
/** Jalankan fn dengan bahasa tertentu, lalu kembalikan bahasa sebelumnya. */
export function withLang<T>(l: ReportLang, fn: () => T): T {
  const prev = LANG; LANG = l;
  try { return fn(); } finally { LANG = prev; }
}

const META_ID: Record<ModuleKey, { title: string; short: string; accent: string; desc: string }> = {
  fleet: { title: "Fleet Management", short: "Armada", accent: "#2D5BFF", desc: "Penugasan driver, pemakaian kendaraan, dokumen armada" },
  claims: { title: "Klaim Driver", short: "Klaim", accent: "#0F9D74", desc: "Pengeluaran operasional driver per kategori" },
  canteen: { title: "Kantin", short: "Kantin", accent: "#E08A00", desc: "Efisiensi order & sisa makanan per shift" },
  atk: { title: "Alat Tulis Kantor (ATK)", short: "ATK", accent: "#7A5AF0", desc: "Pemakaian, departemen, dan stok kritis" },
  ga: { title: "Cleaning & Gardening", short: "C&G", accent: "#0EA5B7", desc: "Achievement plan vs actual ISS, event & improvement" },
  tga: { title: "TGA — Teknisi GA", short: "TGA", accent: "#DB2777", desc: "Pekerjaan teknisi: selesai, tertunda, urgent, per teknisi" },
  receptionist: { title: "Receptionist", short: "Receptionist", accent: "#0D9488", desc: "Wifi tamu, barang & surat, pemakaian Induction Room" },
  security: { title: "Security", short: "Security", accent: "#E5484D", desc: "Kendaraan & visitor, transporter, pelanggaran, kejadian, patroli" },
};
const META_EN: Record<ModuleKey, { title: string; short: string; accent: string; desc: string }> = {
  fleet: { title: "Fleet Management", short: "Fleet", accent: "#2D5BFF", desc: "Driver assignments, vehicle usage, fleet documents" },
  claims: { title: "Driver Claims", short: "Claims", accent: "#0F9D74", desc: "Driver operating expenses by category" },
  canteen: { title: "Canteen", short: "Canteen", accent: "#E08A00", desc: "Order efficiency & food waste per shift" },
  atk: { title: "Office Supplies (ATK)", short: "Supplies", accent: "#7A5AF0", desc: "Usage, departments and critical stock" },
  ga: { title: "Cleaning & Gardening", short: "C&G", accent: "#0EA5B7", desc: "ISS plan vs actual achievement, events & improvements" },
  tga: { title: "TGA — GA Technicians", short: "TGA", accent: "#DB2777", desc: "Technician jobs: completed, pending, urgent, per technician" },
  receptionist: { title: "Receptionist", short: "Receptionist", accent: "#0D9488", desc: "Guest wifi, items & mail, Induction Room usage" },
  security: { title: "Security", short: "Security", accent: "#E5484D", desc: "Vehicles & visitors, transporters, violations, incidents, patrol" },
};
/** Metadata modul dalam bahasa yang diminta (default: bahasa aktif). */
export function metaOf(key: ModuleKey, lang: ReportLang = LANG) { return (lang === "en" ? META_EN : META_ID)[key]; }
export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  /** "good" | "bad" | "neutral" — warna penanda tren/sub. */
  tone?: "good" | "bad" | "neutral";
}

export type ChartType = "bar" | "hbar" | "line" | "donut" | "stacked";

export interface ChartSeries {
  name: string;
  values: number[];
  color: string;
}

export interface ChartSpec {
  id: string;
  title: string;
  type: ChartType;
  labels: string[];
  series: ChartSeries[];
  unit: "rp" | "num" | "pct";
  /** Warna per kategori (donut / hbar). Bila kosong, pakai SERIES_COLORS. */
  colors?: string[];
  note?: string;
  /** Grafik tren: % perubahan tiap titik dari titik sebelumnya (ditulis di bawah label). */
  deltas?: (number | null)[];
  /** Arti kenaikan untuk pewarnaan ▲▼: true = naik baik, false = naik buruk, null = netral. */
  goodUp?: boolean | null;
}

/** Catatan data per modul (teks sudah dilokalkan): ditampilkan di layar, PDF, PPT, dan Excel. */
export interface DataNote {
  /** "Data tersedia sejak … · terakhir tercatat … (N hari lalu)" */
  status: string;
  /** Peringatan bila perbandingan dengan periode lalu belum representatif (kosong = aman). */
  warn?: string;
  /** Definisi indikator & aturan penghitungan modul ini. */
  defs: string[];
}

export interface ModuleReport {
  key: ModuleKey;
  title: string;
  accent: string;
  /** Satu kalimat utama untuk ringkasan eksekutif. */
  headline: string;
  kpis: Kpi[];
  /** Dua grafik pertama = grafik utama (dipakai di PDF/PPT); sisanya pelengkap di Excel. */
  charts: ChartSpec[];
  insights: string[];
  actions: string[];
  /** Butir yang perlu perhatian manajemen (masuk ringkasan eksekutif). */
  attention: string[];
  table?: { title: string; headers: string[]; rows: (string | number)[][] };
  empty: boolean;
  /** Bagian lanjutan sebuah modul (mis. halaman rincian Security) — tidak tampil sebagai kartu di ringkasan eksekutif. */
  sub?: boolean;
  /** Catatan data (kesegaran, kelayakan perbandingan, definisi). */
  note?: DataNote;
}

export interface MgmtReport {
  lang: ReportLang;
  granularity: Granularity;
  title: string;
  company: string;
  periodLabel: string;
  prevLabel: string;
  from: string;
  to: string;
  scopeLabel: string;
  /** plant yang dilaporkan; null = semua plant */
  plant: "CIK" | "PRB" | null;
  generatedAt: string;
  generatedBy: string;
  modules: ModuleReport[];
}

/* ── format angka ── */
export const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat(LANG === "en" ? "en-US" : "id-ID", { maximumFractionDigits: d, minimumFractionDigits: d }).format(Number.isFinite(n) ? n : 0);
export const fmtRp = (n: number) => (LANG === "en" ? "IDR " : "Rp ") + fmtNum(Math.round(n || 0));
export function fmtRpShort(n: number): string {
  const v = Math.abs(n || 0);
  if (LANG === "en") {
    if (v >= 1_000_000_000) return `IDR ${fmtNum(n / 1_000_000_000, 1)}B`;
    if (v >= 1_000_000) return `IDR ${fmtNum(n / 1_000_000, 1)}M`;
    if (v >= 1_000) return `IDR ${fmtNum(n / 1_000, 0)}K`;
    return fmtRp(n);
  }
  if (v >= 1_000_000_000) return `Rp ${fmtNum(n / 1_000_000_000, 1)} M`;
  if (v >= 1_000_000) return `Rp ${fmtNum(n / 1_000_000, 1)} jt`;
  if (v >= 1_000) return `Rp ${fmtNum(n / 1_000, 0)} rb`;
  return fmtRp(n);
}
export const fmtPct = (n: number, d = 1) => `${fmtNum(n, d)}%`;
export function fmtVal(n: number, unit: ChartSpec["unit"]): string {
  if (unit === "rp") return fmtRpShort(n);
  if (unit === "pct") return fmtPct(n);
  return fmtNum(n);
}
/* Status kelayakan perbandingan modul yang sedang dihitung (dipasang build.ts sebelum compute per modul).
   Bila periode pembanding / periode ini datanya belum lengkap, angka naik/turun tetap ditampilkan tetapi
   diberi tanda ⚠, tidak diwarnai baik/buruk, dan tidak dijadikan dasar rekomendasi. */
let CMP_OK = true;
export function setComparable(ok: boolean) { CMP_OK = ok; }
export const COMPARE_FLAG = "⚠";
/** "naik 12%" / "turun 8%" / "stabil" dibanding periode sebelumnya. */
export function deltaText(cur: number, prev: number): { text: string; pct: number | null } {
  if (prev <= 0) return { text: cur > 0 ? tr("belum ada data periode sebelumnya", "no prior-period data") : tr("stabil", "stable"), pct: null };
  const pct = ((cur - prev) / prev) * 100;
  const text = Math.abs(pct) < 2 ? tr("relatif stabil", "broadly stable") : `${pct > 0 ? tr("naik", "up") : tr("turun", "down")} ${fmtNum(Math.abs(pct), 0)}%`;
  if (!CMP_OK) return { text: `${text} ${COMPARE_FLAG}`, pct: null };
  return { text, pct };
}
/* Awal data modul yang sedang dihitung (dipasang build.ts): bulan sebelum data ada tidak dihitung sebagai "0",
   dan perubahan terhadap bulan yang datanya baru terisi sebagian tidak ditampilkan di grafik / kalimat tren. */
export const COVERAGE_MIN = 0.8;
let DATA_START: string | null = null;
export function setDataStart(d: string | null) { DATA_START = d; }
/** Porsi (0–1) bulan `m` yang sudah punya data. */
export function monthCov(m: { from: string; to: string }): number {
  if (DATA_START === null) return 1;
  if (DATA_START <= m.from) return 1;
  if (DATA_START > m.to) return 0;
  return daysBetween(DATA_START, m.to) / daysBetween(m.from, m.to);
}
/** Perubahan persen untuk modul yang menghitung sendiri (Security): null bila perbandingan belum representatif. */
export function comparableOk(): boolean { return CMP_OK; }

/** Ambil n teratas; sisanya digabung jadi "Lainnya" agar rincian selalu menjumlah ke total. */
export function withOther<T extends [string, number]>(entries: T[], n: number, otherLabel = tr("Lainnya", "Other")): [string, number][] {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map((e) => [e[0], e[1]] as [string, number]);
  const rest = sorted.slice(n).reduce((a, e) => a + e[1], 0);
  if (rest <= 0) return top;
  const ex = top.find((e) => e[0] === otherLabel);
  if (ex) ex[1] += rest; else top.push([otherLabel, rest]);
  return top;
}

/* ── tanggal & periode ── */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000) + 1;
}
/** Periode pembanding: bulan/kuartal/tahun penuh → periode kalender sebelumnya (Sep → Agu, Q3 → Q2);
    bulan berjalan (tgl 1 s.d. pertengahan bulan) → rentang HARI YANG SAMA di bulan lalu (1–15 Nov ↔ 1–15 Okt);
    selain itu rentang sama panjang tepat sebelumnya. */
export function prevRange(from: string, to: string): { from: string; to: string } {
  const a = parseISO(from), b = parseISO(to);
  const wholeMonths = a.getDate() === 1 && b.getDate() === new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
  if (a.getDate() === 1 && !wholeMonths && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    const pm = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    const last = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
    return { from: iso(pm), to: iso(new Date(pm.getFullYear(), pm.getMonth(), Math.min(b.getDate(), last))) };
  }
  if (wholeMonths) {
    const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
    return { from: iso(new Date(a.getFullYear(), a.getMonth() - months, 1)), to: iso(new Date(a.getFullYear(), a.getMonth(), 0)) };
  }
  const n = daysBetween(from, to);
  const pTo = parseISO(from); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - (n - 1));
  return { from: iso(pFrom), to: iso(pTo) };
}
const MON_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const FULL_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monShort = (m: number) => (LANG === "en" ? MON_EN : MON_ID)[m];
export const monFull = (m: number) => (LANG === "en" ? FULL_EN : FULL_ID)[m];
export const dowShort = (d: number) => (LANG === "en" ? DOW_EN : DOW_ID)[d];
/** "3 Mar 2026" */
export function dFull(s: string): string {
  const d = parseISO(s);
  return `${d.getDate()} ${monShort(d.getMonth())} ${d.getFullYear()}`;
}
export function dShort(s: string): string {
  const d = parseISO(s);
  return `${d.getDate()} ${monShort(d.getMonth())}`;
}
/** Nomor minggu ISO-8601. */
export function isoWeek(s: string): number {
  const d = parseISO(s);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
export function periodLabelOf(from: string, to: string): string {
  const a = parseISO(from), b = parseISO(to);
  const lastDay = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
  const range = a.getFullYear() === b.getFullYear()
    ? a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${monShort(b.getMonth())} ${b.getFullYear()}`
      : `${a.getDate()} ${monShort(a.getMonth())} – ${b.getDate()} ${monShort(b.getMonth())} ${b.getFullYear()}`
    : `${a.getDate()} ${monShort(a.getMonth())} ${a.getFullYear()} – ${b.getDate()} ${monShort(b.getMonth())} ${b.getFullYear()}`;
  if (from === to) return `${b.getDate()} ${monFull(b.getMonth())} ${b.getFullYear()}`;
  // satu minggu penuh Senin–Minggu
  if (daysBetween(from, to) === 7 && a.getDay() === 1) return `${tr("Minggu ke-", "Week ")}${isoWeek(from)} (${range})`;
  if (a.getDate() === 1 && b.getDate() === lastDay && a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) return `${monFull(a.getMonth())} ${a.getFullYear()}`;
    if (a.getMonth() === 0 && b.getMonth() === 11) return `${tr("Tahun", "Year")} ${a.getFullYear()}`;
    if (a.getMonth() % 3 === 0 && b.getMonth() === a.getMonth() + 2) return `${tr("Kuartal", "Q")}${tr(" ", "")}${a.getMonth() / 3 + 1} ${a.getFullYear()} (${monShort(a.getMonth())}–${monShort(b.getMonth())})`;
    return `${monFull(a.getMonth())} – ${monFull(b.getMonth())} ${a.getFullYear()}`;
  }
  return range;
}

/* ── tren 13 bulan ── */
export interface MonthSlot { key: string; from: string; to: string; label: string; partial: boolean }
/** n bulan kalender yang berakhir di bulan tanggal `to`. Bulan terakhir ditandai partial bila `to` belum akhir bulan. */
export function trendMonths(to: string, n = 13): MonthSlot[] {
  const end = parseISO(to);
  const out: MonthSlot[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const a = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    const partial = i === 0 && end.getDate() < b.getDate();
    out.push({
      key: iso(a).slice(0, 7), from: iso(a), to: partial ? iso(end) : iso(b), partial,
      label: `${monShort(a.getMonth())} ${String(a.getFullYear()).slice(2)}${partial ? "*" : ""}`,
    });
  }
  return out;
}
export function deltasOf(vals: (number | null)[]): (number | null)[] {
  return vals.map((v, i) => {
    if (i === 0 || v === null) return null;
    const p = vals[i - 1];
    return p === null || p === undefined || p <= 0 ? null : ((v - p) / p) * 100;
  });
}
/** Grafik batang tren 13 bulan dengan % perubahan bulanan. */
export function trendChart(p: {
  id: string; title: string; months: MonthSlot[]; unit: ChartSpec["unit"]; goodUp: boolean | null;
  series: { name: string; values: (number | null)[]; color: string }[];
}): ChartSpec {
  const tot = p.months.map((m, i) => {
    if (monthCov(m) === 0) return null;   // belum ada data modul pada bulan itu
    const vs = p.series.map((s) => s.values[i]);
    return vs.every((v) => v === null || v === undefined) ? null : vs.reduce<number>((a, v) => a + (v || 0), 0);
  });
  // perubahan terhadap bulan yang datanya baru terisi sebagian tidak ditampilkan
  const deltas = deltasOf(tot).map((d, i) => (i > 0 && monthCov(p.months[i - 1]) < COVERAGE_MIN ? null : d));
  const partial = p.months[p.months.length - 1]?.partial;
  return {
    id: p.id, title: p.title, type: p.series.length > 1 ? "stacked" : "bar",
    labels: p.months.map((m) => m.label),
    series: p.series.map((s) => ({ name: s.name, color: s.color, values: s.values.map((v) => v || 0) })),
    unit: p.unit, deltas, goodUp: p.goodUp,
    note: partial ? tr("* bulan berjalan", "* month to date") : undefined,
  };
}
/** Kalimat ringkas tren 13 bulan: perubahan bulanan & tahunan, tertinggi/terendah. */
export function trendSentence(name: string, rawVals: (number | null)[], months: MonthSlot[], fmt: (n: number) => string): string {
  const vals = rawVals.map((v, i) => (v !== null && monthCov(months[i]) > 0 ? v : null));   // bulan sebelum data ada = tanpa data
  const n = vals.length - 1;
  const cur = vals[n];
  if (cur === null || cur === undefined) return "";
  const pairs = vals.map((v, i) => ({ v, l: months[i].label.replace("*", "") })).filter((x) => x.v !== null) as { v: number; l: string }[];
  if (pairs.length < 2) return "";
  const prev = vals[n - 1], first = vals[0];
  const ch = (a: number, b: number) => {
    const p = ((b - a) / a) * 100;
    return Math.abs(p) < 0.5 ? tr("stabil", "flat") : `${p > 0 ? tr("naik", "up") : tr("turun", "down")} ${fmtNum(Math.abs(p), 1)}%`;
  };
  const hi = pairs.reduce((a, b) => (b.v > a.v ? b : a)), lo = pairs.reduce((a, b) => (b.v < a.v ? b : a));
  const parts: string[] = [];
  if (prev && monthCov(months[n - 1]) >= COVERAGE_MIN) parts.push(`${ch(prev, cur)} ${tr("dari bulan sebelumnya", "month on month")}`);
  if (vals.length >= 13 && first && monthCov(months[0]) >= COVERAGE_MIN) parts.push(`${ch(first, cur)} ${tr("dari", "vs")} ${months[0].label}`);
  const partialNote = months[n].partial ? tr(" (bulan berjalan)", " (month to date)") : "";
  return tr(
    `Tren 13 bulan — ${name} ${fmt(cur)}${partialNote}: ${parts.join(", ")}. Tertinggi ${hi.l} (${fmt(hi.v)}), terendah ${lo.l} (${fmt(lo.v)}).`,
    `13-month trend — ${name} ${fmt(cur)}${partialNote}: ${parts.join(", ")}. Highest ${hi.l} (${fmt(hi.v)}), lowest ${lo.l} (${fmt(lo.v)}).`,
  );
}

export interface Bucket { key: string; label: string; from: string; to: string }
/** Granularitas tren efektif: auto = harian ≤ 14 hari, mingguan ≤ 92 hari, selebihnya bulanan. */
export function resolveGran(from: string, to: string, g: Granularity = GRAN): "day" | "week" | "month" {
  if (g !== "auto") {
    const n = daysBetween(from, to);
    if (g === "day" && n > 92) return "week"; // cegah grafik ratusan batang
    return g;
  }
  const n = daysBetween(from, to);
  return n <= 14 ? "day" : n <= 92 ? "week" : "month";
}
/** "per hari" / "per minggu" / "per bulan" sesuai granularitas tren. */
export function perWord(from: string, to: string): string {
  const g = resolveGran(from, to);
  return g === "day" ? tr("per hari", "by day") : g === "week" ? tr("per minggu", "by week") : tr("per bulan", "by month");
}
export function buckets(from: string, to: string): Bucket[] {
  const out: Bucket[] = [];
  const g = resolveGran(from, to);
  const end = parseISO(to);
  let cur = parseISO(from);
  if (g === "day") {
    const short = daysBetween(from, to) <= 7;
    while (cur <= end) {
      const k = iso(cur);
      out.push({ key: k, from: k, to: k, label: short ? `${dowShort(cur.getDay())} ${cur.getDate()}` : dShort(k) });
      cur = new Date(cur); cur.setDate(cur.getDate() + 1);
    }
  } else if (g === "week") {
    while (cur <= end) {
      const dow = (cur.getDay() + 6) % 7;
      const wEnd = new Date(cur); wEnd.setDate(cur.getDate() + (6 - dow));
      const bEnd = wEnd > end ? end : wEnd;
      out.push({ key: iso(cur), from: iso(cur), to: iso(bEnd), label: `${dShort(iso(cur))}–${bEnd.getDate()}` });
      cur = new Date(bEnd); cur.setDate(cur.getDate() + 1);
    }
  } else {
    while (cur <= end) {
      const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const bEnd = mEnd > end ? end : mEnd;
      out.push({ key: iso(cur), from: iso(cur), to: iso(bEnd), label: `${monShort(cur.getMonth())} ${String(cur.getFullYear()).slice(2)}` });
      cur = new Date(bEnd); cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
}
export const PALETTE = {
  navy: "#0B1633",
  brand: "#2D5BFF",
  green: "#0F9D74",
  amber: "#E08A00",
  red: "#D64545",
  purple: "#7A5AF0",
  cyan: "#0EA5B7",
  gray: "#94A3B8",
  ink: "#1E293B",
  muted: "#64748B",
};
export const SERIES_COLORS = ["#2D5BFF", "#0EA5B7", "#E08A00", "#7A5AF0", "#0F9D74", "#D64545", "#94A3B8"];
