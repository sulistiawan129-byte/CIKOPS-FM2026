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
const MONF = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const pad = (n: number) => String(n).padStart(2, "0");
export const nf = (n: number, d = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d }).format(Number.isFinite(n) ? n : 0);
export const pct = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? "–" : `${nf(v, d)}%`);
export const fmtMin = (m: number | null) => (m === null || !Number.isFinite(m) ? "–" : m >= 60 ? `${Math.floor(m / 60)}j ${pad(Math.round(m % 60))}m` : `${Math.round(m)}m`);
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
export function computeFm(s: FmSnapshot, nc: NcBoard | null, nowMs = Date.now()) {
  const today = s.today;
  const t = parse(today);
  const monthLabel = `${MONF[t.getMonth()]} ${t.getFullYear()}`;
  const todayLabel = `${DOW[t.getDay()]}, ${t.getDate()} ${MONF[t.getMonth()]}`;
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
    last14.map((d) => { const v = val(d); const dt = parse(d); return { label: `${DOW[dt.getDay()]} ${dt.getDate()}`, value: v ?? 0, display: v === null ? "–" : fmt(v), highlight: d === today, tone: tone ? tone(v) : undefined }; });
  const fleetHook = docsCrit.length ? `${docsCrit.length} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari`
    : longOpen.length ? `${longOpen.length} kendaraan di luar lebih dari ${TARGET.gateLongHours} jam`
    : sameDayPct !== null && sameDayPct < TARGET.sameDayOk ? `Penyelesaian di hari yang sama ${pct(sameDayPct, 0)} — di bawah target`
    : docsWarn.length ? `${docsWarn.length} dokumen kendaraan jatuh tempo bulan ini`
    : tasksToday ? `${nf(doneToday)} dari ${nf(tasksToday)} tugas hari ini selesai` : "Belum ada tugas driver hari ini";
  const canteenHook = !cd.length ? "Belum ada laporan kantin bulan ini"
    : !canteenSplit ? "Jalankan migrasi 029 untuk snack & makan terpisah"
    : canteenStatus === "baik" ? `Sisa terkendali — snack ${pct(cSnack.effMonth, 0)}, makan ${pct(cMeal.effMonth, 0)} terpakai`
    : `Sisa ${(cSnack.effMonth ?? 100) <= (cMeal.effMonth ?? 100) ? "snack" : "makan"} paling tinggi bulan ini`;
  const atkHook = s.atk_critical === null ? "Data stok ATK belum tersedia"
    : atkOut.length ? `${atkOut.length} item stok habis — perlu pengadaan`
    : atkCrit.length ? `${atkCrit.length} item stok cukup < ${TARGET.atkCoverDays} hari`
    : "Semua stok ATK aman";
  const ncHook = !nc ? "Data pelanggaran G-C belum tersambung"
    : ncToday.length ? `${nf(ncToday.length)} pelanggaran tercatat hari ini`
    : ni.length ? "Nihil pelanggaran hari ini" : "Nihil pelanggaran bulan ini";
  const areas: AreaCard[] = [
    {
      key: "fleet", name: "Fleet Management", today: nf(tasksToday), todayUnit: `tugas hari ini · ${nf(doneToday)} selesai`, month: nf(tasksMonth), monthUnit: "tugas bulan ini", status: fleetStatus,
      story: [`${nf(gateToday)} pergerakan gate hari ini`, open.length ? `${open.length} kendaraan sedang di luar` : "", longOpen.length ? `${longOpen.length} lebih dari ${TARGET.gateLongHours} jam` : "", docsCrit.length ? `${docsCrit.length} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari` : ""].filter(Boolean).join("; ") + ".",
      spark: last14.map((d) => td.find((r) => r.d === d)?.n ?? 0),
      hook: fleetHook,
      facts: [
        { label: "Gate hari ini", value: nf(gateToday) },
        { label: "Sedang di luar", value: nf(open.length), tone: longOpen.length ? "perhatian" : undefined },
        { label: "Selesai hari sama", value: pct(sameDayPct, 0), tone: sameDayPct === null ? undefined : sameDayPct < TARGET.sameDayWarn ? "kritis" : sameDayPct < TARGET.sameDayOk ? "perhatian" : "baik" },
      ],
      trend: trendOf((d) => td.find((r) => r.d === d)?.n ?? 0, (n) => `${nf(n)} tugas`), trendLabel: "Tugas per hari · 14 hari",
    },
    {
      key: "canteen", name: "Kantin",
      today: cToday ? pair(cSnack.effToday, cMeal.effToday) : pair(cSnack.effMonth, cMeal.effMonth),
      todayUnit: cToday ? "snack / makan terpakai hari ini" : "snack / makan terpakai bulan ini",
      month: cToday ? pair(cSnack.effMonth, cMeal.effMonth) : "Belum", monthUnit: cToday ? "bulan ini" : "laporan hari ini", status: canteenStatus,
      story: !cd.length ? "Belum ada laporan kantin bulan ini." : !canteenSplit ? "Jalankan migrasi supabase/029 agar snack & makan tampil terpisah." : `${catStory("Snack", cSnack)}; ${catStory("Makan", cMeal)}.`,
      spark: last14.map((d) => { const rs = cd.filter((r) => r.d === d); return minEff(effOf(rs, "snack"), effOf(rs, "meal")) ?? 0; }),
      hook: canteenHook,
      facts: [
        { label: "Sisa snack", value: `${nf(cSnack.leftMonth)} porsi`, tone: effTone(cSnack.effMonth) },
        { label: "Sisa makan", value: `${nf(cMeal.leftMonth)} porsi`, tone: effTone(cMeal.effMonth) },
        { label: "Laporan hari ini", value: cToday ? "Masuk" : "Belum", tone: cToday ? "baik" : "perhatian" },
      ],
      trend: trendOf((d) => { const rs = cd.filter((r) => r.d === d); return minEff(effOf(rs, "snack"), effOf(rs, "meal")); }, (n) => `${pct(n, 0)} (terendah snack/makan)`, effTone),
      trendLabel: "Efisiensi terendah snack/makan · 14 hari",
    },
    {
      key: "atk", name: "ATK & Supplies", today: nf(atkToday), todayUnit: "unit keluar hari ini", month: nf(atkMonth), monthUnit: "unit keluar bulan ini", status: atkStatus,
      story: atkCrit.length ? `${atkCrit.length} item stok kritis: ${atkCrit.slice(0, 3).map((c) => c.nama).join(", ")}${atkCrit.length > 3 ? " dll" : ""}${atkOut.length ? " — ada yang habis" : ""}.` : "Semua stok ATK aman.",
      spark: last14.map((d) => Number(ad.find((r) => r.d === d)?.n ?? 0)),
      hook: atkHook,
      facts: [
        { label: "Stok habis", value: nf(atkOut.length), tone: atkOut.length ? "kritis" : "baik" },
        { label: "Menipis", value: nf(atkCrit.length - atkOut.length), tone: atkCrit.length - atkOut.length ? "perhatian" : undefined },
        ...((s.atk_depts ?? [])[0] ? [{ label: "Pemakai terbesar", value: (s.atk_depts ?? [])[0].k }] : []),
      ],
      trend: trendOf((d) => Number(ad.find((r) => r.d === d)?.n ?? 0), (n) => `${nf(n)} unit`), trendLabel: "Unit keluar per hari · 14 hari",
    },
    {
      key: "nc", name: "Pelanggaran / NC", today: nc ? nf(ncToday.length) : "–", todayUnit: "NC hari ini", month: nc ? nf(ni.length) : "–", monthUnit: "NC bulan ini", status: ncStatus,
      story: !nc ? "Data pelanggaran G-C belum tersambung." : ni.length ? `${ncJenis[0] ? `Terbanyak: ${ncJenis[0].k} (${ncJenis[0].n})` : ""}${ncTrans[0] ? `; transporter terbanyak ${ncTrans[0].k} (${ncTrans[0].n})` : ""}.` : "Tidak ada pelanggaran bulan ini.",
      spark: last14.map((d) => ni.filter((x) => x.d === d).length),
      hook: ncHook,
      facts: nc ? [
        ...(ncJenis[0] ? [{ label: "Jenis terbanyak", value: `${ncJenis[0].k} · ${ncJenis[0].n}` }] : []),
        ...(ncTrans[0] ? [{ label: "Transporter", value: `${ncTrans[0].k} · ${ncTrans[0].n}` }] : []),
        { label: "Berulang ≥ 3×", value: nf(ncRepeat.length), tone: ncRepeat.length ? "perhatian" : undefined },
      ] : [],
      trend: trendOf((d) => (nc ? ni.filter((x) => x.d === d).length : null), (n) => `${nf(n)} NC`), trendLabel: "NC per hari · 14 hari",
    },
  ];

  /* ── PERLU PERHATIAN ── */
  const attention: Attention[] = [];
  for (const d of docsCrit) attention.push({ level: "kritis", area: "Fleet", text: `${d.doc} ${d.nopol} ${d.days < 0 ? `lewat ${-d.days} hari` : d.days === 0 ? "jatuh tempo hari ini" : `jatuh tempo ${d.days} hari lagi`}` });
  for (const a of atkOut) attention.push({ level: "kritis", area: "ATK", text: `Stok ${a.nama} habis` });
  if (ncToday.length >= TARGET.ncTodayCrit) attention.push({ level: "kritis", area: "NC", text: `${ncToday.length} pelanggaran tercatat hari ini` });
  for (const g of longOpen.slice(0, 3)) attention.push({ level: "perhatian", area: "Gate", text: `${g.nopol ?? "Kendaraan"} ${g.plant === "CIK" ? "di luar" : "di dalam CIK"} ${fmtMin(g.mins)}` });
  if (ncToday.length && ncToday.length < TARGET.ncTodayCrit) attention.push({ level: "perhatian", area: "NC", text: `${ncToday.length} pelanggaran hari ini${ncToday[0] ? ` — terakhir ${ncToday[ncToday.length - 1].transporter}` : ""}` });
  for (const r of ncRepeat.slice(0, 2)) attention.push({ level: "perhatian", area: "NC", text: `${r.k}: ${r.n}× pelanggaran bulan ini` });
  if (atkCrit.length - atkOut.length > 0) attention.push({ level: "perhatian", area: "ATK", text: `${atkCrit.length - atkOut.length} item ATK cukup < ${TARGET.atkCoverDays} hari` });
  if (cSnack.effToday !== null && cSnack.effToday < TARGET.canteenWarn) attention.push({ level: "perhatian", area: "Kantin", text: `Efisiensi snack hari ini ${pct(cSnack.effToday, 0)} — sisa ${nf(cSnack.leftToday)} porsi` });
  if (cMeal.effToday !== null && cMeal.effToday < TARGET.canteenWarn) attention.push({ level: "perhatian", area: "Kantin", text: `Efisiensi makan hari ini ${pct(cMeal.effToday, 0)} — sisa ${nf(cMeal.leftToday)} porsi` });
  if (cd.length && !canteenSplit) attention.push({ level: "info", area: "Kantin", text: "Jalankan migrasi supabase/029 agar snack & makan tampil terpisah" });
  if (!cToday && nowMs && new Date(nowMs).getHours() >= 16) attention.push({ level: "info", area: "Kantin", text: "Laporan kantin hari ini belum diinput" });
  for (const d of docsWarn.slice(0, 3)) attention.push({ level: "info", area: "Fleet", text: `${d.doc} ${d.nopol} jatuh tempo ${d.days} hari lagi` });
  const lvlRank = { kritis: 0, perhatian: 1, info: 2 };
  attention.sort((a, b) => lvlRank[a.level] - lvlRank[b.level]);

  /* Dikelompokkan supaya layar tidak penuh teks: satu baris per masalah, rincian bisa dibuka. */
  const groups: AttentionGroup[] = [];
  const grp = (level: Attention["level"], area: string, tab: string, items: string[], one: (x: string) => string, many: (n: number) => string) => {
    if (items.length) groups.push({ level, area, tab, title: items.length === 1 ? one(items[0]) : many(items.length), items: items.length === 1 ? [] : items });
  };
  grp("kritis", "Fleet", "fleet", docsCrit.map((d) => `${d.doc} ${d.nopol} — ${d.days < 0 ? `lewat ${-d.days} hari` : d.days === 0 ? "hari ini" : `${d.days} hari lagi`}`), (x) => x, (n) => `${n} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari`);
  grp("kritis", "ATK", "atk", atkOut.map((a) => a.nama), (x) => `Stok ${x} habis`, (n) => `${n} item ATK habis`);
  if (ncToday.length >= TARGET.ncTodayCrit) grp("kritis", "NC", "nc", ncToday.map((x) => `${x.jam ?? ""} ${x.transporter}`.trim()), () => `${ncToday.length} pelanggaran hari ini`, (n) => `${n} pelanggaran tercatat hari ini`);
  grp("perhatian", "Gate", "fleet", longOpen.map((g) => `${g.nopol ?? "Kendaraan"} ${g.plant === "CIK" ? "di luar" : "di dalam CIK"} ${fmtMin(g.mins)}`), (x) => x, (n) => `${n} kendaraan lebih dari ${TARGET.gateLongHours} jam di luar`);
  if (ncToday.length && ncToday.length < TARGET.ncTodayCrit) grp("perhatian", "NC", "nc", ncToday.map((x) => `${x.jam ?? ""} ${x.transporter}`.trim()), (x) => `1 pelanggaran hari ini — ${x}`, (n) => `${n} pelanggaran hari ini`);
  grp("perhatian", "NC", "nc", ncRepeat.map((r) => `${r.k}: ${r.n}×`), (x) => `Transporter berulang — ${x}`, (n) => `${n} transporter melanggar ≥ 3× bulan ini`);
  grp("perhatian", "ATK", "atk", atkCrit.filter((c) => Number(c.stok) > 0).map((c) => `${c.nama} — cukup ${c.cover ?? "?"} hari`), (x) => `Stok menipis: ${x}`, (n) => `${n} item ATK cukup < ${TARGET.atkCoverDays} hari`);
  grp("perhatian", "Kantin", "canteen", [
    ...(cSnack.effToday !== null && cSnack.effToday < TARGET.canteenWarn ? [`Snack ${pct(cSnack.effToday, 0)} — sisa ${nf(cSnack.leftToday)} porsi`] : []),
    ...(cMeal.effToday !== null && cMeal.effToday < TARGET.canteenWarn ? [`Makan ${pct(cMeal.effToday, 0)} — sisa ${nf(cMeal.leftToday)} porsi`] : []),
  ], (x) => `Kantin hari ini: ${x}`, () => "Sisa snack & makan hari ini tinggi");
  grp("info", "Kantin", "canteen", [
    ...(cd.length && !canteenSplit ? ["Jalankan migrasi supabase/029 agar snack & makan tampil terpisah"] : []),
    ...(!cToday && nowMs && new Date(nowMs).getHours() >= 16 ? ["Laporan kantin hari ini belum diinput"] : []),
  ], (x) => x, (n) => `${n} catatan kantin`);
  grp("info", "Fleet", "fleet", docsWarn.map((d) => `${d.doc} ${d.nopol} — ${d.days} hari lagi`), (x) => `Jatuh tempo: ${x}`, (n) => `${n} dokumen kendaraan jatuh tempo ≤ ${TARGET.docWarnDays} hari`);
  const counts = { kritis: attention.filter((x) => x.level === "kritis").length, perhatian: attention.filter((x) => x.level === "perhatian").length, info: attention.filter((x) => x.level === "info").length };

  /* ── INDEKS: rata-rata status area (Baik 100 · Perhatian 70 · Kritis 40) ── */
  const scores = areas.map((a) => statusScore[a.status]).filter((x): x is number => x !== null);
  const health = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const healthStatus: Status = health === null ? "na" : health >= 85 ? "baik" : health >= 65 ? "perhatian" : "kritis";
  const weakest = areas.filter((a) => a.status === "kritis" || a.status === "perhatian").map((a) => a.name);
  const summary = `Hari ini: ${nf(tasksToday)} tugas driver, ${nf(gateToday)} pergerakan gate, ${nf(atkToday)} unit ATK keluar${nc ? `, ${nf(ncToday.length)} pelanggaran` : ""}${cToday ? `, kantin snack ${pct(cSnack.effToday, 0)} · makan ${pct(cMeal.effToday, 0)}` : ""}.`;
  const summary2 = weakest.length ? `Perlu perhatian: ${weakest.join(", ")}.` : "Semua area dalam kondisi baik.";

  /* Headline: satu kalimat yang langsung menjawab "bagaimana FM hari ini?" */
  const crit = areas.filter((a) => a.status === "kritis"), warn = areas.filter((a) => a.status === "perhatian");
  const short: Record<string, string> = { fleet: "Fleet", canteen: "Kantin", atk: "ATK", nc: "NC" };
  const joinNames = (xs: AreaCard[]) => xs.map((a) => short[a.key] ?? a.name).join(" & ");
  const headline = crit.length ? `${crit.length} area butuh tindakan: ${joinNames(crit)}`
    : warn.length ? `Operasional terkendali — pantau ${joinNames(warn)}`
    : health === null ? "Menunggu data hari ini" : "Semua area berjalan baik";
  const headlineSub = crit.length ? crit.map((a) => a.hook).join(" · ") : warn.length ? warn.map((a) => a.hook).join(" · ") : "Tidak ada yang perlu ditindaklanjuti saat ini.";
  const pulse: Pulse[] = [
    { key: "tasks", label: "Tugas driver", value: nf(tasksToday), unit: `${nf(doneToday)} selesai`, tab: "ops" },
    { key: "gate", label: "Gerak gate", value: nf(gateToday), unit: `${nf(open.length)} di luar`, tab: "fleet", tone: longOpen.length ? "perhatian" : undefined },
    { key: "canteen", label: "Kantin snack · makan", value: cToday ? `${nf(cSnack.orderToday)} · ${nf(cMeal.orderToday)}` : "–", unit: cToday ? "porsi dipesan" : "belum diinput", tab: "canteen" },
    { key: "atk", label: "ATK keluar", value: nf(atkToday), unit: "unit", tab: "atk" },
    { key: "nc", label: "Pelanggaran", value: nc ? nf(ncToday.length) : "–", unit: nc ? "NC hari ini" : "belum tersambung", tab: "nc", tone: ncToday.length ? ncStatus : undefined },
  ];

  return {
    today, todayLabel, monthLabel, generatedAt: s.generated_at,
    health, healthStatus, summary, summary2, areas, attention, groups, counts, headline, headlineSub, pulse,
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
