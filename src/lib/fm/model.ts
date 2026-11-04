
import { L, loc } from "@/lib/i18n";
/* ════════════════════════════════════════════════════════════
   FM COMMAND CENTER — olah data berjalan menjadi "cerita" layar TV.
   Cakupan: HARI INI + TOTAL BULAN BERJALAN (tanpa tren tahunan).
   Area: Fleet (tugas + gate), Kantin, ATK, Pelanggaran/NC security.
   Tidak ada data bernominal (Rp) — layar ini publik.
════════════════════════════════════════════════════════════ */

export interface FmSnapshot {
  today: string;
  generated_at: string;
  tasks_daily: { d: string; n: number; done: number; same: number }[] | null;
  vehicles: { nopol: string; jenis: string | null; plant: string | null; kir: string | null; stnk: string | null; service: string | null; days: number; trips: number }[] | null;
  gate_daily: { d: string; n: number; done: number; trip: number | null }[] | null;
  gate_hours: { out: number[]; in: number[] } | null;
  gate_open: { plant: string; nopol: string | null; since: string }[] | null;
  /** so/sl = snack order/sisa, mo/ml = makan order/sisa per shift (migrasi 029). o/l = gabungan (lama). */
  canteen_daily: { d: string; o: number[]; l: number[]; so?: number[]; sl?: number[]; mo?: number[]; ml?: number[] }[] | null;
  atk_daily: { d: string; n: number }[] | null;
  atk_critical: { nama: string; stok: number; satuan: string; u30: number; cover: number | null }[] | null;
  atk_depts: { k: string; n: number }[] | null;
  atk_today: { k: string; n: number }[] | null;
}

/** Ringkasan NC bulan berjalan dari /api/gc-nc?board=1 */
export interface NcBoard {
  ok: boolean;
  today: string;
  fetchedAt: string;
  items: { d: string; jam: string | null; transporter: string; jenis: string[] }[];
}

/** Ringkasan Receptionist dari rcp_board() (migrasi 031). */
export interface RcpBoard {
  today: string;
  wifi: { accounts: number; slots: number; used: number; expiring7: number; guests_today: number };
  /** in_today / out_today = JUMLAH barang (per kolom Jumlah) yang dicatat hari ini, *_n = jumlah CATATAN (angka utama yang ditampilkan); handed_today = serah terima hari ini (apa pun tanggal dicatatnya).
   *  Field baru (SQL 056) opsional supaya tetap jalan sebelum SQL dijalankan. */
  parcels: { waiting: number; waiting_in: number; waiting_out: number; waiting_old: number; in_today: number; handed_today: number; in_today_n?: number; out_today?: number; out_today_n?: number; handed_from_other_days?: number };
  visitors?: { guests: number; visits: number; inside: number };
  bookings: { start: string; end: string; title: string; attendees: number | null }[];
  bookings_week: number;
}

/** Ringkasan TGA dari tga_board() (04_aplikasi_lapangan.sql bagian 048) — tanpa data pribadi. */
export interface TgaBoard {
  today: string;
  technicians: { nama: string; busy: boolean; ref: string | null; activity: string | null; lokasi: string | null; kategori: string | null; since: string | null; done_today: number; open: number }[];
  open: { ref: string; kategori: string; activity: string; lokasi: string; dept: string; tga: string; status: string; urgent: boolean; pool: boolean; at: string | null; accepted: string | null }[];
  done_today: number; in_today: number; month_done: number; month_total: number; month_cancel: number; avg_min: number | null;
  daily: { d: string; n: number; r: number }[];
  cats: { k: string; n: number }[];
  techs_month: { k: string; n: number }[];
}

export type Status = "baik" | "perhatian" | "kritis" | "na";
export interface AreaFact { label: string; value: string; tone?: Status }
export interface AreaCard {
  key: string; name: string; today: string; todayUnit: string; month: string; monthUnit: string;
  status: Status; story: string; spark: number[];
  /** Satu kalimat pendek: inti cerita area ini hari ini. */
  hook: string;
  /** 2–3 fakta pendukung (chip). */
  facts: AreaFact[];
  /** Grafik 14 hari terakhir (interaktif: label & nilai untuk tooltip). */
  trend: Bar[]; trendLabel: string;
}
export interface Attention { level: "kritis" | "perhatian" | "info"; text: string; area: string }
/** Butir perhatian yang dikelompokkan: satu judul + rincian (bisa dibuka). */
export interface AttentionGroup { level: Attention["level"]; area: string; tab: string; title: string; items: string[] }
/** Angka "denyut" hari ini di ringkasan. */
export interface Pulse { key: string; label: string; value: string; unit: string; tab: string; tone?: Status }
export interface Bar { label: string; value: number; display: string; highlight?: boolean; tone?: Status }

/* ── util ── */
const monfName = (m: number) => new Date(2000, m, 1).toLocaleDateString(loc(), { month: "long" });
const dowName = (d: number) => new Date(2023, 0, 1 + d).toLocaleDateString(loc(), { weekday: "short" });
const pad = (n: number) => String(n).padStart(2, "0");
export const nf = (n: number, d = 0) => new Intl.NumberFormat(loc(), { maximumFractionDigits: d, minimumFractionDigits: d }).format(Number.isFinite(n) ? n : 0);
export const pct = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? "–" : `${nf(v, d)}%`);
export const fmtMin = (m: number | null) => (m === null || !Number.isFinite(m) ? "–" : m >= 60 ? `${Math.floor(m / 60)}${L("j", "h")} ${pad(Math.round(m % 60))}m` : `${Math.round(m)}m`);
const parse = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
function addMonths(isoDate: string, n: number): string { const d = parse(isoDate); return iso(new Date(d.getFullYear(), d.getMonth() + n, d.getDate())); }
const statusScore: Record<Status, number | null> = { baik: 100, perhatian: 70, kritis: 40, na: null };

/* ── target / ambang status (bisa diubah di sini) ── */
export const TARGET = {
  canteenOk: 90, canteenWarn: 80,          // efisiensi % (order − sisa) / order
  sameDayOk: 95, sameDayWarn: 85,          // % tugas selesai di hari yang sama
  gateLongHours: 8,                        // kendaraan di luar lebih dari … jam
  docWarnDays: 30, docCritDays: 7,         // dokumen kendaraan jatuh tempo
  atkCoverDays: 14,                        // stok ATK cukup kurang dari … hari
  ncTodayWarn: 1, ncTodayCrit: 5,          // jumlah NC hari ini
};

/* ════════════════════════════════════════════════════════════ */
export function computeFm(s: FmSnapshot, nc: NcBoard | null, nowMs = Date.now(), rcp: RcpBoard | null = null, tga: TgaBoard | null = null) {
  const today = s.today;
  const t = parse(today);
  const monthLabel = `${monfName(t.getMonth())} ${t.getFullYear()}`;
  const todayLabel = `${dowName(t.getDay())}, ${t.getDate()} ${monfName(t.getMonth())}`;
  /** tanggal 1 … hari ini (bulan berjalan) */
  const monthDays = Array.from({ length: t.getDate() }, (_, i) => iso(new Date(t.getFullYear(), t.getMonth(), i + 1)));
  const dailyBars = (val: (d: string) => number | null, fmt: (n: number) => string, tone?: (v: number | null) => Status): Bar[] =>
    monthDays.map((d) => { const v = val(d); return { label: String(parse(d).getDate()), value: v ?? 0, display: v === null ? "–" : fmt(v), highlight: d === today, tone: tone ? tone(v) : undefined }; });

  /* ── FLEET: TUGAS ── */
  const td = s.tasks_daily ?? [];
  const tRow = td.find((r) => r.d === today);
  const tasksToday = tRow?.n ?? 0, doneToday = tRow?.done ?? 0;
  const tasksMonth = td.reduce((a, r) => a + r.n, 0);
  const doneM = td.reduce((a, r) => a + r.done, 0), sameM = td.reduce((a, r) => a + r.same, 0);
  const sameDayPct = doneM ? (sameM / doneM) * 100 : null;
  const workDays = monthDays.filter((d) => parse(d).getDay() !== 0).length || 1;
  const util = (s.vehicles ?? []).map((v) => ({ nopol: v.nopol, pct: Math.min(100, (v.days / workDays) * 100), trips: v.trips })).sort((a, b) => b.pct - a.pct);
  const utilAvg = util.length ? util.reduce((a, u) => a + u.pct, 0) / util.length : null;
  const docs: { nopol: string; doc: string; days: number }[] = [];
  for (const v of s.vehicles ?? []) {
    const add = (doc: string, last: string | null, months: number) => { if (!last) return; const days = daysBetween(today, addMonths(last, months)); if (days <= 60) docs.push({ nopol: v.nopol, doc, days }); };
    add("STNK", v.stnk, 12); add("KIR", v.kir, 6); add("Servis", v.service, 6);
  }
  docs.sort((a, b) => a.days - b.days);
  const docsCrit = docs.filter((d) => d.days <= TARGET.docCritDays);
  const docsWarn = docs.filter((d) => d.days > TARGET.docCritDays && d.days <= TARGET.docWarnDays);

  /* ── FLEET: GATE ── */
  const gd = s.gate_daily ?? [];
  const gateToday = gd.find((r) => r.d === today)?.n ?? 0;
  const gateMonth = gd.reduce((a, r) => a + r.n, 0);
  const tripRows = gd.filter((r) => r.trip !== null);
  const avgTrip = tripRows.length ? tripRows.reduce((a, r) => a + (r.trip ?? 0) * r.done, 0) / Math.max(1, tripRows.reduce((a, r) => a + r.done, 0)) : null;
  const open = (s.gate_open ?? []).map((g) => ({ ...g, mins: Math.max(0, Math.round((nowMs - new Date(g.since).getTime()) / 60000)) }));
  const longOpen = open.filter((g) => g.mins >= TARGET.gateLongHours * 60).sort((a, b) => b.mins - a.mins);
  const nowH = new Date(nowMs).getHours();
  const gateHours: Bar[] = Array.from({ length: 13 }, (_, i) => i + 6).map((h) => { const n = (s.gate_hours?.out ?? []).filter((x) => x === h).length + (s.gate_hours?.in ?? []).filter((x) => x === h).length; return { label: pad(h), value: n, display: nf(n), highlight: h === nowH }; });

  const fleetStatus: Status = !td.length && !gd.length ? "na"
    : docsCrit.length || longOpen.length > 2 || (sameDayPct !== null && sameDayPct < TARGET.sameDayWarn) ? "kritis"
    : docsWarn.length || longOpen.length || (sameDayPct !== null && sameDayPct < TARGET.sameDayOk) ? "perhatian" : "baik";

  /* ── KANTIN — snack & makan selalu dihitung TERPISAH, tidak digabung ── */
  const cd = s.canteen_daily ?? [];
  const canteenSplit = cd.every((r) => Array.isArray(r.so) && Array.isArray(r.mo));   // false = migrasi 029 belum dijalankan
  const sum = (a: number[] | undefined) => (a ?? []).reduce((x, y) => x + Number(y || 0), 0);
  type CRow = (typeof cd)[number];
  type Cat = "snack" | "meal";
  const ordOf = (r: CRow, k: Cat) => (k === "snack" ? r.so : r.mo) ?? [];
  const leftOf = (r: CRow, k: Cat) => (k === "snack" ? r.sl : r.ml) ?? [];
  const effOf = (rows: CRow[], k: Cat) => { const o = rows.reduce((a, r) => a + sum(ordOf(r, k)), 0); const l = rows.reduce((a, r) => a + sum(leftOf(r, k)), 0); return o ? ((o - l) / o) * 100 : null; };
  const effTone = (e: number | null): Status => (e === null ? "na" : e >= TARGET.canteenOk ? "baik" : e >= TARGET.canteenWarn ? "perhatian" : "kritis");
  const worstTone = (a: Status, b: Status): Status => { const rank: Record<Status, number> = { kritis: 0, perhatian: 1, baik: 2, na: 3 }; return rank[a] <= rank[b] ? a : b; };
  const minEff = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
  const cToday = cd.find((r) => r.d === today) ?? null;
  const cLast = cToday ?? (cd.length ? cd[cd.length - 1] : null);      // laporan terakhir bila hari ini belum diinput
  const catStats = (k: Cat) => {
    const effToday = cToday ? effOf([cToday], k) : null;
    const effMonth = effOf(cd, k);
    const orderToday = cToday ? sum(ordOf(cToday, k)) : 0, leftToday = cToday ? sum(leftOf(cToday, k)) : 0;
    const orderMonth = cd.reduce((a, r) => a + sum(ordOf(r, k)), 0), leftMonth = cd.reduce((a, r) => a + sum(leftOf(r, k)), 0);
    const shifts = [0, 1, 2].map((i) => {
      const o = cLast ? Number(ordOf(cLast, k)[i] || 0) : 0, l = cLast ? Number(leftOf(cLast, k)[i] || 0) : 0;
      const om = cd.reduce((a, r) => a + Number(ordOf(r, k)[i] || 0), 0), lm = cd.reduce((a, r) => a + Number(leftOf(r, k)[i] || 0), 0);
      return { order: o, left: l, leftPctMonth: om ? (lm / om) * 100 : null };
    });
    const worstShift = shifts.reduce<{ i: number; v: number } | null>((b, x, i) => (x.leftPctMonth !== null && (!b || x.leftPctMonth > b.v) ? { i, v: x.leftPctMonth } : b), null);
    return { effToday, effMonth, orderToday, leftToday, orderMonth, leftMonth, shifts, worstShift };
  };
  const cSnack = catStats("snack"), cMeal = catStats("meal");
  const canteenStatus = worstTone(effTone(cSnack.effMonth), effTone(cMeal.effMonth));
  const catStory = (name: string, c: typeof cSnack) => `${name}: ${nf(c.orderMonth)} porsi, sisa ${nf(c.leftMonth)}${c.worstShift ? ` (terbanyak shift ${c.worstShift.i + 1})` : ""}`;
  const pair = (a: number | null, b: number | null) => (a === null && b === null ? "–" : `${pct(a, 0)} / ${pct(b, 0)}`);

  /* ── ATK ── */
  const ad = s.atk_daily ?? [];
  const atkToday = Number(ad.find((r) => r.d === today)?.n ?? 0);
  const atkMonth = ad.reduce((a, r) => a + Number(r.n || 0), 0);
  const atkCrit = s.atk_critical ?? [];
  const atkOut = atkCrit.filter((c) => Number(c.stok) <= 0);
  const atkStatus: Status = s.atk_critical === null ? "na" : atkOut.length || atkCrit.length > 3 ? "kritis" : atkCrit.length ? "perhatian" : "baik";

  /* ── PELANGGARAN / NC (G-C) ── */
  const ni = nc?.items ?? [];
  const ncToday = ni.filter((x) => x.d === today);
  const countBy = (arr: string[]) => { const m = new Map<string, number>(); arr.forEach((k) => m.set(k, (m.get(k) || 0) + 1)); return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
  const ncJenis = countBy(ni.flatMap((x) => (x.jenis.length ? x.jenis : ["Lainnya"])));
  const ncTrans = countBy(ni.map((x) => x.transporter || "-"));
  const ncTemuan = ni.reduce((a, x) => a + Math.max(1, x.jenis.length), 0);
  const ncRecent = [...ni].sort((a, b) => (b.d + (b.jam ?? "")).localeCompare(a.d + (a.jam ?? ""))).slice(0, 5);
  const ncRepeat = ncTrans.filter((x) => x.n >= 3);
  const ncStatus: Status = !nc ? "na" : ncToday.length >= TARGET.ncTodayCrit ? "kritis" : ncToday.length >= TARGET.ncTodayWarn ? "perhatian" : "baik";

  /* ── KARTU AREA (hari ini + bulan berjalan) ──
     Tiap kartu: hook (1 kalimat inti) + 2–3 fakta + tren 14 hari interaktif. */
  const last14 = monthDays.slice(-14);
  const trendOf = (val: (d: string) => number | null, fmt: (n: number) => string, tone?: (v: number | null) => Status): Bar[] =>
    last14.map((d) => { const v = val(d); const dt = parse(d); return { label: `${dowName(dt.getDay())} ${dt.getDate()}`, value: v ?? 0, display: v === null ? "–" : fmt(v), highlight: d === today, tone: tone ? tone(v) : undefined }; });
  const fleetHook = docsCrit.length ? L(`${docsCrit.length} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari`, `${docsCrit.length} vehicle document(s) due within ${TARGET.docCritDays} days`)
    : longOpen.length ? L(`${longOpen.length} kendaraan di luar lebih dari ${TARGET.gateLongHours} jam`, `${longOpen.length} vehicle(s) out for over ${TARGET.gateLongHours} hours`)
    : sameDayPct !== null && sameDayPct < TARGET.sameDayOk ? L(`Penyelesaian di hari yang sama ${pct(sameDayPct, 0)} — di bawah target`, `Same-day completion ${pct(sameDayPct, 0)} — below target`)
    : docsWarn.length ? L(`${docsWarn.length} dokumen kendaraan jatuh tempo bulan ini`, `${docsWarn.length} vehicle document(s) due this month`)
    : tasksToday ? L(`${nf(doneToday)} dari ${nf(tasksToday)} tugas hari ini selesai`, `${nf(doneToday)} of ${nf(tasksToday)} tasks done today`) : L("Belum ada tugas driver hari ini", "No driver tasks today");
  const canteenHook = !cd.length ? L("Belum ada laporan kantin bulan ini", "No canteen report this month")
    : !canteenSplit ? L("Jalankan migrasi 029 untuk snack & makan terpisah", "Run migration 029 to separate snacks & meals")
    : canteenStatus === "baik" ? L(`Sisa terkendali — snack ${pct(cSnack.effMonth, 0)}, makan ${pct(cMeal.effMonth, 0)} terpakai`, `Leftovers under control — snack ${pct(cSnack.effMonth, 0)}, meal ${pct(cMeal.effMonth, 0)} consumed`)
    : L(`Sisa ${(cSnack.effMonth ?? 100) <= (cMeal.effMonth ?? 100) ? "snack" : "makan"} paling tinggi bulan ini`, `Highest ${(cSnack.effMonth ?? 100) <= (cMeal.effMonth ?? 100) ? "snack" : "meal"} leftover this month`);
  const atkHook = s.atk_critical === null ? L("Data stok ATK belum tersedia", "ATK stock data is not available yet")
    : atkOut.length ? L(`${atkOut.length} item stok habis — perlu pengadaan`, `${atkOut.length} item(s) out of stock — procurement needed`)
    : atkCrit.length ? L(`${atkCrit.length} item stok cukup < ${TARGET.atkCoverDays} hari`, `${atkCrit.length} item(s) with < ${TARGET.atkCoverDays} days of stock`)
    : L("Semua stok ATK aman", "All ATK stock is safe");
  const ncHook = !nc ? L("Data pelanggaran G-C belum tersambung", "G-C violation data is not connected yet")
    : ncToday.length ? L(`${nf(ncToday.length)} pelanggaran tercatat hari ini`, `${nf(ncToday.length)} violation(s) recorded today`)
    : ni.length ? L("Nihil pelanggaran hari ini", "No violations today") : L("Nihil pelanggaran bulan ini", "No violations this month");
  const areas: AreaCard[] = [
    {
      key: "fleet", name: "Fleet Management", today: nf(tasksToday), todayUnit: L(`tugas hari ini · ${nf(doneToday)} selesai`, `tasks today · ${nf(doneToday)} done`), month: nf(tasksMonth), monthUnit: L("tugas bulan ini", "tasks this month"), status: fleetStatus,
      story: [L(`${nf(gateToday)} pergerakan gate hari ini`, `${nf(gateToday)} gate movements today`), open.length ? L(`${open.length} kendaraan sedang di luar`, `${open.length} vehicle(s) currently out`) : "", longOpen.length ? L(`${longOpen.length} lebih dari ${TARGET.gateLongHours} jam`, `${longOpen.length} over ${TARGET.gateLongHours} hours`) : "", docsCrit.length ? L(`${docsCrit.length} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari`, `${docsCrit.length} vehicle document(s) due within ${TARGET.docCritDays} days`) : ""].filter(Boolean).join("; ") + ".",
      spark: last14.map((d) => td.find((r) => r.d === d)?.n ?? 0),
      hook: fleetHook,
      facts: [
        { label: L("Gate hari ini", "Gate today"), value: nf(gateToday) },
        { label: L("Sedang di luar", "Currently out"), value: nf(open.length), tone: longOpen.length ? "perhatian" : undefined },
        { label: L("Selesai hari sama", "Same-day completion"), value: pct(sameDayPct, 0), tone: sameDayPct === null ? undefined : sameDayPct < TARGET.sameDayWarn ? "kritis" : sameDayPct < TARGET.sameDayOk ? "perhatian" : "baik" },
      ],
      trend: trendOf((d) => td.find((r) => r.d === d)?.n ?? 0, (n) => `${nf(n)} ${L("tugas", "tasks")}`), trendLabel: L("Tugas / hari", "Tasks / day"),
    },
    {
      key: "canteen", name: L("Kantin", "Canteen"),
      today: cToday ? pair(cSnack.effToday, cMeal.effToday) : pair(cSnack.effMonth, cMeal.effMonth),
      todayUnit: cToday ? L("snack / makan terpakai hari ini", "snack / meal consumed today") : L("snack / makan terpakai bulan ini", "snack / meal consumed this month"),
      month: cToday ? pair(cSnack.effMonth, cMeal.effMonth) : L("Belum", "Not yet"), monthUnit: cToday ? L("bulan ini", "this month") : L("laporan hari ini", "today's report"), status: canteenStatus,
      story: !cd.length ? L("Belum ada laporan kantin bulan ini.", "No canteen report this month.") : !canteenSplit ? L("Jalankan migrasi supabase/029 agar snack & makan tampil terpisah.", "Run migration supabase/029 so snacks & meals show separately.") : `${catStory("Snack", cSnack)}; ${catStory(L("Makan", "Meal"), cMeal)}.`,
      spark: last14.map((d) => { const rs = cd.filter((r) => r.d === d); return minEff(effOf(rs, "snack"), effOf(rs, "meal")) ?? 0; }),
      hook: canteenHook,
      facts: [
        { label: L("Sisa snack", "Snack leftover"), value: `${nf(cSnack.leftMonth)} ${L("porsi", "portions")}`, tone: effTone(cSnack.effMonth) },
        { label: L("Sisa makan", "Meal leftover"), value: `${nf(cMeal.leftMonth)} ${L("porsi", "portions")}`, tone: effTone(cMeal.effMonth) },
        { label: L("Laporan hari ini", "Today's report"), value: cToday ? L("Masuk", "In") : L("Belum", "Not yet"), tone: cToday ? "baik" : "perhatian" },
      ],
      trend: trendOf((d) => { const rs = cd.filter((r) => r.d === d); return minEff(effOf(rs, "snack"), effOf(rs, "meal")); }, (n) => `${pct(n, 0)} (${L("terendah snack/makan", "lowest of snack/meal")})`, effTone),
      trendLabel: L("Efisiensi / hari", "Efficiency / day"),
    },
    {
      key: "atk", name: "ATK & Supplies", today: nf(atkToday), todayUnit: L("unit keluar hari ini", "units issued today"), month: nf(atkMonth), monthUnit: L("unit keluar bulan ini", "units issued this month"), status: atkStatus,
      story: atkCrit.length ? L(`${atkCrit.length} item stok kritis: ${atkCrit.slice(0, 3).map((c) => c.nama).join(", ")}${atkCrit.length > 3 ? " dll" : ""}${atkOut.length ? " — ada yang habis" : ""}.`, `${atkCrit.length} critical stock item(s): ${atkCrit.slice(0, 3).map((c) => c.nama).join(", ")}${atkCrit.length > 3 ? " etc." : ""}${atkOut.length ? " — some are out of stock" : ""}.`) : L("Semua stok ATK aman.", "All ATK stock is safe."),
      spark: last14.map((d) => Number(ad.find((r) => r.d === d)?.n ?? 0)),
      hook: atkHook,
      facts: [
        { label: L("Stok habis", "Out of stock"), value: nf(atkOut.length), tone: atkOut.length ? "kritis" : "baik" },
        { label: L("Menipis", "Running low"), value: nf(atkCrit.length - atkOut.length), tone: atkCrit.length - atkOut.length ? "perhatian" : undefined },
        ...((s.atk_depts ?? [])[0] ? [{ label: L("Pemakai terbesar", "Biggest user"), value: (s.atk_depts ?? [])[0].k }] : []),
      ],
      trend: trendOf((d) => Number(ad.find((r) => r.d === d)?.n ?? 0), (n) => `${nf(n)} ${L("unit", "units")}`), trendLabel: L("Unit / hari", "Units / day"),
    },
    {
      key: "nc", name: L("Pelanggaran / NC", "Violations / NC"), today: nc ? nf(ncToday.length) : "–", todayUnit: L("NC hari ini", "NC today"), month: nc ? nf(ni.length) : "–", monthUnit: L("NC bulan ini", "NC this month"), status: ncStatus,
      story: !nc ? L("Data pelanggaran G-C belum tersambung.", "G-C violation data is not connected yet.") : ni.length ? L(`${ncJenis[0] ? `Terbanyak: ${ncJenis[0].k} (${ncJenis[0].n})` : ""}${ncTrans[0] ? `; transporter terbanyak ${ncTrans[0].k} (${ncTrans[0].n})` : ""}.`, `${ncJenis[0] ? `Most common: ${ncJenis[0].k} (${ncJenis[0].n})` : ""}${ncTrans[0] ? `; top transporter ${ncTrans[0].k} (${ncTrans[0].n})` : ""}.`) : L("Tidak ada pelanggaran bulan ini.", "No violations this month."),
      spark: last14.map((d) => ni.filter((x) => x.d === d).length),
      hook: ncHook,
      facts: nc ? [
        ...(ncJenis[0] ? [{ label: L("Jenis terbanyak", "Most common type"), value: `${ncJenis[0].k} · ${ncJenis[0].n}` }] : []),
        ...(ncTrans[0] ? [{ label: "Transporter", value: `${ncTrans[0].k} · ${ncTrans[0].n}` }] : []),
        { label: L("Berulang ≥ 3×", "Repeat ≥ 3×"), value: nf(ncRepeat.length), tone: ncRepeat.length ? "perhatian" : undefined },
      ] : [],
      trend: trendOf((d) => (nc ? ni.filter((x) => x.d === d).length : null), (n) => `${nf(n)} NC`), trendLabel: L("NC / hari", "NC / day"),
    },
  ];

  /* ── PERLU PERHATIAN ── */
  const attention: Attention[] = [];
  for (const d of docsCrit) attention.push({ level: "kritis", area: "Fleet", text: `${d.doc} ${d.nopol} ${d.days < 0 ? L(`lewat ${-d.days} hari`, `${-d.days} days overdue`) : d.days === 0 ? L("jatuh tempo hari ini", "due today") : L(`jatuh tempo ${d.days} hari lagi`, `due in ${d.days} days`)}` });
  for (const a of atkOut) attention.push({ level: "kritis", area: "ATK", text: L(`Stok ${a.nama} habis`, `${a.nama} is out of stock`) });
  if (ncToday.length >= TARGET.ncTodayCrit) attention.push({ level: "kritis", area: "NC", text: L(`${ncToday.length} pelanggaran tercatat hari ini`, `${ncToday.length} violations recorded today`) });
  for (const g of longOpen.slice(0, 3)) attention.push({ level: "perhatian", area: "Gate", text: `${g.nopol ?? L("Kendaraan", "Vehicle")} ${g.plant === "CIK" ? L("di luar", "out") : L("di dalam CIK", "inside CIK")} ${fmtMin(g.mins)}` });
  if (ncToday.length && ncToday.length < TARGET.ncTodayCrit) attention.push({ level: "perhatian", area: "NC", text: L(`${ncToday.length} pelanggaran hari ini${ncToday[0] ? ` — terakhir ${ncToday[ncToday.length - 1].transporter}` : ""}`, `${ncToday.length} violation(s) today${ncToday[0] ? ` — latest ${ncToday[ncToday.length - 1].transporter}` : ""}`) });
  for (const r of ncRepeat.slice(0, 2)) attention.push({ level: "perhatian", area: "NC", text: L(`${r.k}: ${r.n}× pelanggaran bulan ini`, `${r.k}: ${r.n}× violations this month`) });
  if (atkCrit.length - atkOut.length > 0) attention.push({ level: "perhatian", area: "ATK", text: L(`${atkCrit.length - atkOut.length} item ATK cukup < ${TARGET.atkCoverDays} hari`, `${atkCrit.length - atkOut.length} ATK item(s) with < ${TARGET.atkCoverDays} days of stock`) });
  if (cSnack.effToday !== null && cSnack.effToday < TARGET.canteenWarn) attention.push({ level: "perhatian", area: L("Kantin", "Canteen"), text: L(`Efisiensi snack hari ini ${pct(cSnack.effToday, 0)} — sisa ${nf(cSnack.leftToday)} porsi`, `Snack efficiency today ${pct(cSnack.effToday, 0)} — ${nf(cSnack.leftToday)} portions left`) });
  if (cMeal.effToday !== null && cMeal.effToday < TARGET.canteenWarn) attention.push({ level: "perhatian", area: L("Kantin", "Canteen"), text: L(`Efisiensi makan hari ini ${pct(cMeal.effToday, 0)} — sisa ${nf(cMeal.leftToday)} porsi`, `Meal efficiency today ${pct(cMeal.effToday, 0)} — ${nf(cMeal.leftToday)} portions left`) });
  if (cd.length && !canteenSplit) attention.push({ level: "info", area: L("Kantin", "Canteen"), text: L("Jalankan migrasi supabase/029 agar snack & makan tampil terpisah", "Run migration supabase/029 so snacks & meals show separately") });
  if (!cToday && nowMs && new Date(nowMs).getHours() >= 16) attention.push({ level: "info", area: L("Kantin", "Canteen"), text: L("Laporan kantin hari ini belum diinput", "Today's canteen report has not been entered") });
  for (const d of docsWarn.slice(0, 3)) attention.push({ level: "info", area: "Fleet", text: L(`${d.doc} ${d.nopol} jatuh tempo ${d.days} hari lagi`, `${d.doc} ${d.nopol} due in ${d.days} days`) });
  const lvlRank = { kritis: 0, perhatian: 1, info: 2 };
  attention.sort((a, b) => lvlRank[a.level] - lvlRank[b.level]);

  /* Dikelompokkan supaya layar tidak penuh teks: satu baris per masalah, rincian bisa dibuka. */
  const groups: AttentionGroup[] = [];
  const grp = (level: Attention["level"], area: string, tab: string, items: string[], one: (x: string) => string, many: (n: number) => string) => {
    if (items.length) groups.push({ level, area, tab, title: items.length === 1 ? one(items[0]) : many(items.length), items: items.length === 1 ? [] : items });
  };
  grp("kritis", "Fleet", "fleet", docsCrit.map((d) => `${d.doc} ${d.nopol} — ${d.days < 0 ? L(`lewat ${-d.days} hari`, `${-d.days} days overdue`) : d.days === 0 ? L("hari ini", "today") : L(`${d.days} hari lagi`, `in ${d.days} days`)}`), (x) => x, (n) => L(`${n} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari`, `${n} vehicle documents due within ${TARGET.docCritDays} days`));
  grp("kritis", "ATK", "atk", atkOut.map((a) => a.nama), (x) => L(`Stok ${x} habis`, `${x} is out of stock`), (n) => L(`${n} item ATK habis`, `${n} ATK items out of stock`));
  if (ncToday.length >= TARGET.ncTodayCrit) grp("kritis", "NC", "nc", ncToday.map((x) => `${x.jam ?? ""} ${x.transporter}`.trim()), () => L(`${ncToday.length} pelanggaran hari ini`, `${ncToday.length} violation(s) today`), (n) => L(`${n} pelanggaran tercatat hari ini`, `${n} violations recorded today`));
  grp("perhatian", "Gate", "fleet", longOpen.map((g) => `${g.nopol ?? L("Kendaraan", "Vehicle")} ${g.plant === "CIK" ? L("di luar", "out") : L("di dalam CIK", "inside CIK")} ${fmtMin(g.mins)}`), (x) => x, (n) => L(`${n} kendaraan lebih dari ${TARGET.gateLongHours} jam di luar`, `${n} vehicles out for over ${TARGET.gateLongHours} hours`));
  if (ncToday.length && ncToday.length < TARGET.ncTodayCrit) grp("perhatian", "NC", "nc", ncToday.map((x) => `${x.jam ?? ""} ${x.transporter}`.trim()), (x) => L(`1 pelanggaran hari ini — ${x}`, `1 violation today — ${x}`), (n) => L(`${n} pelanggaran hari ini`, `${n} violations today`));
  grp("perhatian", "NC", "nc", ncRepeat.map((r) => `${r.k}: ${r.n}×`), (x) => L(`Transporter berulang — ${x}`, `Repeat transporter — ${x}`), (n) => L(`${n} transporter melanggar ≥ 3× bulan ini`, `${n} transporters violated ≥ 3× this month`));
  grp("perhatian", "ATK", "atk", atkCrit.filter((c) => Number(c.stok) > 0).map((c) => L(`${c.nama} — cukup ${c.cover ?? "?"} hari`, `${c.nama} — ${c.cover ?? "?"} days of cover`)), (x) => L(`Stok menipis: ${x}`, `Low stock: ${x}`), (n) => L(`${n} item ATK cukup < ${TARGET.atkCoverDays} hari`, `${n} ATK items with < ${TARGET.atkCoverDays} days of stock`));
  grp("perhatian", L("Kantin", "Canteen"), "canteen", [
    ...(cSnack.effToday !== null && cSnack.effToday < TARGET.canteenWarn ? [L(`Snack ${pct(cSnack.effToday, 0)} — sisa ${nf(cSnack.leftToday)} porsi`, `Snack ${pct(cSnack.effToday, 0)} — ${nf(cSnack.leftToday)} portions left`)] : []),
    ...(cMeal.effToday !== null && cMeal.effToday < TARGET.canteenWarn ? [L(`Makan ${pct(cMeal.effToday, 0)} — sisa ${nf(cMeal.leftToday)} porsi`, `Meal ${pct(cMeal.effToday, 0)} — ${nf(cMeal.leftToday)} portions left`)] : []),
  ], (x) => L(`Kantin hari ini: ${x}`, `Canteen today: ${x}`), () => L("Sisa snack & makan hari ini tinggi", "High snack & meal leftovers today"));
  grp("info", L("Kantin", "Canteen"), "canteen", [
    ...(cd.length && !canteenSplit ? [L("Jalankan migrasi supabase/029 agar snack & makan tampil terpisah", "Run migration supabase/029 so snacks & meals show separately")] : []),
    ...(!cToday && nowMs && new Date(nowMs).getHours() >= 16 ? [L("Laporan kantin hari ini belum diinput", "Today's canteen report has not been entered")] : []),
  ], (x) => x, (n) => L(`${n} catatan kantin`, `${n} canteen notes`));
  grp("info", "Fleet", "fleet", docsWarn.map((d) => L(`${d.doc} ${d.nopol} — ${d.days} hari lagi`, `${d.doc} ${d.nopol} — in ${d.days} days`)), (x) => L(`Jatuh tempo: ${x}`, `Due: ${x}`), (n) => L(`${n} dokumen kendaraan jatuh tempo ≤ ${TARGET.docWarnDays} hari`, `${n} vehicle documents due within ${TARGET.docWarnDays} days`));
  /* Receptionist (bila migrasi 031 sudah jalan) */
  const rcpFree = rcp ? Math.max(0, rcp.wifi.slots - rcp.wifi.used) : 0;
  if (rcp && rcp.wifi.slots > 0 && rcpFree / rcp.wifi.slots < 0.15) {
    grp(rcpFree === 0 ? "kritis" : "perhatian", L("Resepsionis", "Reception"), "rcp", [L(`${nf(rcpFree)} dari ${nf(rcp.wifi.slots)} slot`, `${nf(rcpFree)} of ${nf(rcp.wifi.slots)} slots`)], () => (rcpFree === 0 ? L("Slot wifi tamu habis — minta akun baru ke IT", "Guest wifi slots are used up — ask IT for new accounts") : L(`Slot wifi tamu tinggal ${nf(rcpFree)} dari ${nf(rcp.wifi.slots)}`, `Only ${nf(rcpFree)} of ${nf(rcp.wifi.slots)} guest wifi slots left`)), () => "");
  }
  if (rcp && rcp.parcels.waiting_old > 0) grp("perhatian", L("Resepsionis", "Reception"), "rcp", [L(`${nf(rcp.parcels.waiting_old)} barang`, `${nf(rcp.parcels.waiting_old)} item(s)`)], () => L(`${nf(rcp.parcels.waiting_old)} barang menunggu diambil lebih dari 2 hari`, `${nf(rcp.parcels.waiting_old)} item(s) waiting to be collected for over 2 days`), () => "");
  if (rcp && rcp.wifi.expiring7 > 0) grp("info", L("Resepsionis", "Reception"), "rcp", [L(`${nf(rcp.wifi.expiring7)} akun`, `${nf(rcp.wifi.expiring7)} account(s)`)], () => L(`${nf(rcp.wifi.expiring7)} akun wifi tamu habis ≤ 7 hari`, `${nf(rcp.wifi.expiring7)} guest wifi account(s) expire within 7 days`), () => "");
  /* TGA (bila bagian 048 sudah jalan): tugas belum diambil / belum diterima terlalu lama */
  const minsSince = (iso: string | null) => (iso ? Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000)) : 0);
  const tgaWaiting = (tga?.open ?? []).filter((x) => x.status === "baru" && !x.urgent && minsSince(x.at) >= 30);
  const tgaUrgent = (tga?.open ?? []).filter((x) => x.urgent && x.status === "baru");
  grp("kritis", "TGA", "tga", tgaUrgent.map((x) => `${x.ref} · ${x.activity}${x.lokasi ? ` · ${x.lokasi}` : ""}`), (x) => L(`Tugas TGA urgent belum diterima — ${x}`, `Urgent TGA task not yet accepted — ${x}`), (n) => L(`${n} tugas TGA urgent belum diterima`, `${n} urgent TGA tasks not yet accepted`));
  grp("perhatian", "TGA", "tga", tgaWaiting.map((x) => `${x.ref} · ${x.activity} — ${fmtMin(minsSince(x.at))}`), (x) => L(`Tugas TGA menunggu: ${x}`, `TGA task waiting: ${x}`), (n) => L(`${n} tugas TGA menunggu lebih dari 30 menit`, `${n} TGA tasks waiting for over 30 minutes`));
  if (tgaUrgent.length) attention.push({ level: "kritis", area: "TGA", text: L(`${tgaUrgent.length} tugas urgent belum diterima`, `${tgaUrgent.length} urgent task(s) not yet accepted`) });
  if (tgaWaiting.length) attention.push({ level: "perhatian", area: "TGA", text: L(`${tgaWaiting.length} tugas menunggu > 30 menit`, `${tgaWaiting.length} task(s) waiting > 30 minutes`) });
  if (rcp && rcp.wifi.slots > 0 && rcpFree / rcp.wifi.slots < 0.15) attention.push({ level: rcpFree === 0 ? "kritis" : "perhatian", area: L("Resepsionis", "Reception"), text: L("Slot wifi tamu menipis", "Guest wifi slots running low") });
  if (rcp && rcp.parcels.waiting_old > 0) attention.push({ level: "perhatian", area: L("Resepsionis", "Reception"), text: L("Barang menunggu > 2 hari", "Items waiting > 2 days") });
  if (rcp && rcp.wifi.expiring7 > 0) attention.push({ level: "info", area: L("Resepsionis", "Reception"), text: L("Akun wifi akan habis", "Wifi accounts about to expire") });
  const counts = { kritis: attention.filter((x) => x.level === "kritis").length, perhatian: attention.filter((x) => x.level === "perhatian").length, info: attention.filter((x) => x.level === "info").length };

  /* ── INDEKS: rata-rata status area (Baik 100 · Perhatian 70 · Kritis 40) ── */
  const scores = areas.map((a) => statusScore[a.status]).filter((x): x is number => x !== null);
  // TGA ikut indeks (tanpa kartu area): urgent belum diterima = kritis, menunggu lama = perhatian
  if (tga) scores.push(tgaUrgent.length ? 40 : tgaWaiting.length ? 70 : 100);
  const health = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const healthStatus: Status = health === null ? "na" : health >= 85 ? "baik" : health >= 65 ? "perhatian" : "kritis";
  const weakest = areas.filter((a) => a.status === "kritis" || a.status === "perhatian").map((a) => a.name);
  const summary = L(`Hari ini: ${nf(tasksToday)} tugas driver, ${nf(gateToday)} pergerakan gate, ${nf(atkToday)} unit ATK keluar${nc ? `, ${nf(ncToday.length)} pelanggaran` : ""}${cToday ? `, kantin snack ${pct(cSnack.effToday, 0)} · makan ${pct(cMeal.effToday, 0)}` : ""}.`, `Today: ${nf(tasksToday)} driver tasks, ${nf(gateToday)} gate movements, ${nf(atkToday)} ATK units issued${nc ? `, ${nf(ncToday.length)} violations` : ""}${cToday ? `, canteen snack ${pct(cSnack.effToday, 0)} · meal ${pct(cMeal.effToday, 0)}` : ""}.`);
  const summary2 = weakest.length ? L(`Perlu perhatian: ${weakest.join(", ")}.`, `Needs attention: ${weakest.join(", ")}.`) : L("Semua area dalam kondisi baik.", "All areas are in good condition.");

  /* Headline: satu kalimat yang langsung menjawab "bagaimana FM hari ini?" */
  const crit = areas.filter((a) => a.status === "kritis"), warn = areas.filter((a) => a.status === "perhatian");
  const short: Record<string, string> = { fleet: "Fleet", canteen: L("Kantin", "Canteen"), atk: "ATK", nc: "NC" };
  const joinNames = (xs: AreaCard[]) => xs.map((a) => short[a.key] ?? a.name).join(" & ");
  // TGA tidak punya kartu area, tapi tugas urgent / lama menunggu tetap muncul di judul
  const tgaHook = tgaUrgent.length ? L(`${tgaUrgent.length} tugas TGA urgent belum diterima`, `${tgaUrgent.length} urgent TGA task(s) not yet accepted`) : tgaWaiting.length ? L(`${tgaWaiting.length} tugas TGA menunggu > 30 menit`, `${tgaWaiting.length} TGA task(s) waiting > 30 minutes`) : "";
  const headline = crit.length ? L(`${crit.length} area butuh tindakan: ${joinNames(crit)}${tgaUrgent.length ? " & TGA" : ""}`, `${crit.length} area(s) need action: ${joinNames(crit)}${tgaUrgent.length ? " & TGA" : ""}`)
    : tgaUrgent.length ? L("Tugas TGA urgent perlu segera diambil", "Urgent TGA tasks need to be picked up now")
    : warn.length ? L(`Operasional terkendali — pantau ${joinNames(warn)}${tgaWaiting.length ? " & TGA" : ""}`, `Operations under control — keep an eye on ${joinNames(warn)}${tgaWaiting.length ? " & TGA" : ""}`)
    : tgaWaiting.length ? L("Operasional terkendali — pantau TGA", "Operations under control — keep an eye on TGA")
    : health === null ? L("Menunggu data hari ini", "Waiting for today's data") : L("Semua area berjalan baik", "All areas are running well");
  const subParts = (crit.length ? crit : warn).map((a) => a.hook);
  if (tgaHook) subParts.push(tgaHook);
  const headlineSub = subParts.length ? subParts.join(" · ") : L("Tidak ada yang perlu ditindaklanjuti saat ini.", "Nothing needs follow-up right now.");
  const pulse: Pulse[] = [
    { key: "tasks", label: L("Tugas driver", "Driver tasks"), value: nf(tasksToday), unit: L(`${nf(doneToday)} selesai`, `${nf(doneToday)} done`), tab: "ops" },
    { key: "gate", label: L("Gerak gate", "Gate movements"), value: nf(gateToday), unit: L(`${nf(open.length)} di luar`, `${nf(open.length)} out`), tab: "fleet", tone: longOpen.length ? "perhatian" : undefined },
    { key: "canteen", label: L("Kantin", "Canteen"), value: cToday ? `${nf(cSnack.orderToday)} · ${nf(cMeal.orderToday)}` : "–", unit: cToday ? L("porsi snack · makan", "snack · meal portions") : L("belum diinput", "not entered yet"), tab: "canteen" },
    { key: "atk", label: L("ATK keluar", "ATK issued"), value: nf(atkToday), unit: L("unit", "units"), tab: "atk" },
    { key: "nc", label: L("Pelanggaran", "Violations"), value: nc ? nf(ncToday.length) : "–", unit: nc ? L("NC hari ini", "NC today") : L("belum tersambung", "not connected"), tab: "nc", tone: ncToday.length ? ncStatus : undefined },
    ...(tga ? [{ key: "tga", label: "TGA", value: nf(tga.open.length), unit: L(`terbuka · ${nf(tga.technicians.filter((x) => !x.busy).length)} teknisi available`, `open · ${nf(tga.technicians.filter((x) => !x.busy).length)} technician(s) available`), tab: "tga", tone: tgaUrgent.length ? ("kritis" as Status) : tgaWaiting.length ? ("perhatian" as Status) : undefined }] : []),
    ...(rcp ? [{ key: "rcp", label: L("Resepsionis", "Reception"), value: nf(rcp.parcels.waiting), unit: L("barang menunggu", "items waiting"), tab: "rcp", tone: rcp.parcels.waiting_old ? ("perhatian" as Status) : undefined }] : []),
  ];

  return {
    today, todayLabel, monthLabel, generatedAt: s.generated_at,
    health, healthStatus, summary, summary2, areas, attention, groups, counts, headline, headlineSub, pulse,
    rcp: rcp ? { ...rcp, free: rcpFree } : null,
    tga: tga ? {
      ...tga,
      busy: tga.technicians.filter((x) => x.busy).length,
      free: tga.technicians.filter((x) => !x.busy).length,
      waiting: tgaWaiting.length, urgent: tgaUrgent.length,
      daily: dailyBars((d) => tga.daily.find((r) => r.d === d)?.n ?? 0, (n) => nf(n)),
    } : null,
    fleet: {
      today: tasksToday, doneToday, month: tasksMonth, sameDayPct, util: util.slice(0, 8), utilAvg, docs: docs.slice(0, 8),
      daily: dailyBars((d) => td.find((r) => r.d === d)?.n ?? 0, (n) => nf(n)),
    },
    gate: { today: gateToday, month: gateMonth, avgTrip, open: open.length, longOpen, hours: gateHours },
    canteen: {
      split: canteenSplit, hasToday: !!cToday, lastDate: cLast?.d ?? null,
      snack: { ...cSnack, daily: dailyBars((d) => effOf(cd.filter((r) => r.d === d), "snack"), (n) => pct(n, 0), effTone) },
      meal: { ...cMeal, daily: dailyBars((d) => effOf(cd.filter((r) => r.d === d), "meal"), (n) => pct(n, 0), effTone) },
    },
    atk: { today: atkToday, month: atkMonth, critical: atkCrit, depts: s.atk_depts ?? [], todayItems: s.atk_today ?? [], daily: dailyBars((d) => Number(ad.find((r) => r.d === d)?.n ?? 0), (n) => nf(n)) },
    nc: {
      connected: !!nc, today: ncToday.length, month: ni.length, temuan: ncTemuan, jenis: ncJenis.slice(0, 6), trans: ncTrans.slice(0, 6), recent: ncRecent,
      transCount: ncTrans.length, daily: dailyBars((d) => ni.filter((x) => x.d === d).length, (n) => nf(n)),
    },
  };
}
export type FmView = ReturnType<typeof computeFm>;
