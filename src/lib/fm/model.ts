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
  canteen_daily: { d: string; o: number[]; l: number[] }[] | null;
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
export interface AreaCard {
  key: string; name: string; today: string; todayUnit: string; month: string; monthUnit: string;
  status: Status; story: string; spark: number[];
}
export interface Attention { level: "kritis" | "perhatian" | "info"; text: string; area: string }
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

  /* ── KANTIN ── */
  const cd = s.canteen_daily ?? [];
  const sum = (a: number[]) => a.reduce((x, y) => x + Number(y || 0), 0);
  const effOf = (rows: typeof cd) => { const o = rows.reduce((a, r) => a + sum(r.o), 0); const l = rows.reduce((a, r) => a + sum(r.l), 0); return o ? ((o - l) / o) * 100 : null; };
  const effTone = (e: number | null): Status => (e === null ? "na" : e >= TARGET.canteenOk ? "baik" : e >= TARGET.canteenWarn ? "perhatian" : "kritis");
  const cToday = cd.find((r) => r.d === today) ?? null;
  const cLast = cToday ?? (cd.length ? cd[cd.length - 1] : null);      // laporan terakhir bila hari ini belum diinput
  const effToday = cToday ? effOf([cToday]) : null;
  const effMonth = effOf(cd);
  const orderMonth = cd.reduce((a, r) => a + sum(r.o), 0), leftMonth = cd.reduce((a, r) => a + sum(r.l), 0);
  const shifts = [0, 1, 2].map((i) => {
    const o = cLast ? Number(cLast.o[i] || 0) : 0, l = cLast ? Number(cLast.l[i] || 0) : 0;
    const om = cd.reduce((a, r) => a + Number(r.o[i] || 0), 0), lm = cd.reduce((a, r) => a + Number(r.l[i] || 0), 0);
    return { order: o, left: l, leftPctMonth: om ? (lm / om) * 100 : null };
  });
  const worstShift = shifts.reduce<{ i: number; v: number } | null>((b, x, i) => (x.leftPctMonth !== null && (!b || x.leftPctMonth > b.v) ? { i, v: x.leftPctMonth } : b), null);
  const canteenStatus = effTone(effMonth);

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

  /* ── KARTU AREA (hari ini + bulan berjalan) ── */
  const areas: AreaCard[] = [
    {
      key: "fleet", name: "Fleet Management", today: nf(tasksToday), todayUnit: `tugas hari ini · ${nf(doneToday)} selesai`, month: nf(tasksMonth), monthUnit: "tugas bulan ini", status: fleetStatus,
      story: [`${nf(gateToday)} pergerakan gate hari ini`, open.length ? `${open.length} kendaraan sedang di luar` : "", longOpen.length ? `${longOpen.length} lebih dari ${TARGET.gateLongHours} jam` : "", docsCrit.length ? `${docsCrit.length} dokumen kendaraan jatuh tempo ≤ ${TARGET.docCritDays} hari` : ""].filter(Boolean).join("; ") + ".",
      spark: monthDays.slice(-14).map((d) => td.find((r) => r.d === d)?.n ?? 0),
    },
    {
      key: "canteen", name: "Kantin", today: pct(effToday, 1), todayUnit: cToday ? "efisiensi hari ini" : "laporan hari ini belum diinput", month: pct(effMonth, 1), monthUnit: "efisiensi bulan ini", status: canteenStatus,
      story: !cd.length ? "Belum ada laporan kantin bulan ini." : `${nf(orderMonth)} porsi dipesan, sisa ${nf(leftMonth)}${worstShift ? `; sisa terbanyak di shift ${worstShift.i + 1} (${pct(worstShift.v, 0)})` : ""}.`,
      spark: monthDays.slice(-14).map((d) => effOf(cd.filter((r) => r.d === d)) ?? 0),
    },
    {
      key: "atk", name: "ATK & Supplies", today: nf(atkToday), todayUnit: "unit keluar hari ini", month: nf(atkMonth), monthUnit: "unit keluar bulan ini", status: atkStatus,
      story: atkCrit.length ? `${atkCrit.length} item stok kritis: ${atkCrit.slice(0, 3).map((c) => c.nama).join(", ")}${atkCrit.length > 3 ? " dll" : ""}${atkOut.length ? " — ada yang habis" : ""}.` : "Semua stok ATK aman.",
      spark: monthDays.slice(-14).map((d) => Number(ad.find((r) => r.d === d)?.n ?? 0)),
    },
    {
      key: "nc", name: "Pelanggaran / NC", today: nc ? nf(ncToday.length) : "–", todayUnit: "NC hari ini", month: nc ? nf(ni.length) : "–", monthUnit: "NC bulan ini", status: ncStatus,
      story: !nc ? "Data pelanggaran G-C belum tersambung." : ni.length ? `${ncJenis[0] ? `Terbanyak: ${ncJenis[0].k} (${ncJenis[0].n})` : ""}${ncTrans[0] ? `; transporter terbanyak ${ncTrans[0].k} (${ncTrans[0].n})` : ""}.` : "Tidak ada pelanggaran bulan ini.",
      spark: monthDays.slice(-14).map((d) => ni.filter((x) => x.d === d).length),
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
  if (effToday !== null && effToday < TARGET.canteenWarn) attention.push({ level: "perhatian", area: "Kantin", text: `Efisiensi kantin hari ini ${pct(effToday, 0)}` });
  if (!cToday && nowMs && new Date(nowMs).getHours() >= 16) attention.push({ level: "info", area: "Kantin", text: "Laporan kantin hari ini belum diinput" });
  for (const d of docsWarn.slice(0, 3)) attention.push({ level: "info", area: "Fleet", text: `${d.doc} ${d.nopol} jatuh tempo ${d.days} hari lagi` });
  const lvlRank = { kritis: 0, perhatian: 1, info: 2 };
  attention.sort((a, b) => lvlRank[a.level] - lvlRank[b.level]);

  /* ── INDEKS: rata-rata status area (Baik 100 · Perhatian 70 · Kritis 40) ── */
  const scores = areas.map((a) => statusScore[a.status]).filter((x): x is number => x !== null);
  const health = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const healthStatus: Status = health === null ? "na" : health >= 85 ? "baik" : health >= 65 ? "perhatian" : "kritis";
  const weakest = areas.filter((a) => a.status === "kritis" || a.status === "perhatian").map((a) => a.name);
  const summary = `Hari ini: ${nf(tasksToday)} tugas driver, ${nf(gateToday)} pergerakan gate, ${nf(atkToday)} unit ATK keluar${nc ? `, ${nf(ncToday.length)} pelanggaran` : ""}${effToday !== null ? `, efisiensi kantin ${pct(effToday, 0)}` : ""}.`;
  const summary2 = weakest.length ? `Perlu perhatian: ${weakest.join(", ")}.` : "Semua area dalam kondisi baik.";

  return {
    today, todayLabel, monthLabel, generatedAt: s.generated_at,
    health, healthStatus, summary, summary2, areas, attention,
    fleet: {
      today: tasksToday, doneToday, month: tasksMonth, sameDayPct, util: util.slice(0, 8), utilAvg, docs: docs.slice(0, 8),
      daily: dailyBars((d) => td.find((r) => r.d === d)?.n ?? 0, (n) => nf(n)),
    },
    gate: { today: gateToday, month: gateMonth, avgTrip, open: open.length, longOpen, hours: gateHours },
    canteen: {
      effToday, effMonth, hasToday: !!cToday, lastDate: cLast?.d ?? null, shifts, orderMonth, leftMonth,
      daily: dailyBars((d) => effOf(cd.filter((r) => r.d === d)), (n) => pct(n, 0), effTone),
    },
    atk: { today: atkToday, month: atkMonth, critical: atkCrit, depts: s.atk_depts ?? [], todayItems: s.atk_today ?? [], daily: dailyBars((d) => Number(ad.find((r) => r.d === d)?.n ?? 0), (n) => nf(n)) },
    nc: {
      connected: !!nc, today: ncToday.length, month: ni.length, temuan: ncTemuan, jenis: ncJenis.slice(0, 6), trans: ncTrans.slice(0, 6), recent: ncRecent,
      transCount: ncTrans.length, daily: dailyBars((d) => ni.filter((x) => x.d === d).length, (n) => nf(n)),
    },
  };
}
export type FmView = ReturnType<typeof computeFm>;
