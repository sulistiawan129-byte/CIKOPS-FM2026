/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — modul SECURITY.
   Satu bagian ringkasan (kartu di ringkasan eksekutif) + bagian rincian
   (sub) seperti laporan security bulanan: per kategori kendaraan, visitor,
   transporter, pelanggaran (G-C), Becis & JMM, kejadian & patroli.
   Data input bersifat bulanan; pelanggaran dari G-C per tanggal.
════════════════════════════════════════════════════════════ */

import {
  KEJ_AUTO_PEL, KEJ_AUTO_TIMBANG, KEJ_CATS, TEAM_KEYS, VEH_CATS,
  aggregateGc, aggregateManual, driverLabel, monthKeyOf, monthKeysBetween, monthTotals, normalizeData, num, sumArr, weeksOfMonth,
  type DriverNames, type GcAgg, type GcCase, type MonthTotals, type SecData, type VehKey,
} from "../security/model";
import {
  PALETTE, dShort, fmtNum, fmtPct, getReportLang, monShort, metaOf, parseISO, prevRange, tr, trendChart, trendSentence,
  type ChartSpec, type Kpi, type ModuleReport, type MonthSlot,
} from "./model";

const RED = "#E5484D";

export interface SecurityInput {
  from: string;
  to: string;
  months: MonthSlot[];
  rows: Record<string, SecData>;
  gc: { ok: true; cases: GcCase[] } | { ok: false; error: string; notConfigured?: boolean } | null;
  khusus: string[];
  driverNames: DriverNames;
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
function change(cur: number | null, prev: number | null): { text: string; p: number | null } {
  if (cur === null || prev === null || prev <= 0) return { text: tr("belum ada pembanding", "no comparison"), p: null };
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) < 0.5) return { text: tr("stabil", "flat"), p };
  return { text: `${p > 0 ? "▲" : "▼"} ${fmtNum(Math.abs(p), 1)}%`, p };
}
const toneOf = (p: number | null, goodUp: boolean | null): Kpi["tone"] => (p === null || goodUp === null || Math.abs(p) < 0.5 ? "neutral" : (p > 0) === goodUp ? "good" : "bad");
const catName = (c: { id: string; en: string }) => tr(c.id, c.en);
const monthName = (key: string) => {
  const d = parseISO(`${key}-01`);
  return `${monShort(d.getMonth())} ${d.getFullYear()}`;
};

export function computeSecurity(p: SecurityInput): ModuleReport[] {
  const meta = metaOf("security");
  const lastKey = monthKeyOf(p.to);
  const keys = monthKeysBetween(monthKeyOf(p.from), lastKey);
  const prevKeys = keys.map((k) => {
    const d = parseISO(`${k}-01`);
    const a = new Date(d.getFullYear(), d.getMonth() - keys.length, 1);
    return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`;
  });
  const mt = (k: string): MonthTotals => monthTotals(p.rows[k]);
  const gcOk = p.gc && p.gc.ok ? p.gc.cases : null;
  const monthFrom = (k: string) => `${k}-01`;
  const monthTo = (k: string) => { const d = parseISO(`${k}-01`); return `${k}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, "0")}`; };

  /** Pelanggaran sebulan: riwayat manual (totals.pel) > G-C > input manual cadangan. */
  const pelOf = (k: string): number | null => {
    const t = mt(k);
    if (t.pelHist !== null) return t.pelHist;
    if (gcOk) return gcOk.filter((c) => c.tanggal >= monthFrom(k) && c.tanggal <= monthTo(k)).length;
    return t.pelManual;
  };
  const kejOf = (k: string): number | null => {
    const t = mt(k);
    const parts = [t.kejManual, t.sel, pelOf(k)];
    return parts.every((x) => x === null) ? null : parts.reduce<number>((a, x) => a + (x || 0), 0);
  };
  const sumOver = (ks: string[], f: (k: string) => number | null): number | null => {
    const vs = ks.map(f);
    return vs.every((v) => v === null) ? null : vs.reduce<number>((a, v) => a + (v || 0), 0);
  };
  const field = (name: keyof MonthTotals) => (k: string) => mt(k)[name] as number | null;

  const hasAny = keys.some((k) => p.rows[k]) || (gcOk && gcOk.some((c) => c.tanggal >= p.from && c.tanggal <= p.to));
  if (!hasAny) {
    const msg = tr("Belum ada data security pada periode ini. Isi menu Security (input bulanan) terlebih dahulu.", "No security data for this period yet. Fill in the Security menu (monthly input) first.");
    return [{ key: "security", title: meta.title, accent: meta.accent, headline: msg, kpis: [], charts: [], insights: [msg], actions: [], attention: [], empty: true }];
  }

  const last = normalizeData(lastKey, p.rows[lastKey]);
  const weeks = weeksOfMonth(lastKey);
  const wdDays = weeks.reduce((a, w) => a + w.wdDays, 0), weDays = weeks.reduce((a, w) => a + w.weDays, 0);
  const lastName = monthName(lastKey);
  const multiMonth = keys.length > 1;
  const periodNote = multiMonth ? tr(`${keys.length} bulan`, `${keys.length} months`) : lastName;
  const weekLabels = weeks.map((w, i) => `${tr("Mg", "Wk")} ${i + 1} (${w.label})`);
  const tm = p.months;

  const weeklyChart = (id: string, title: string, wd: number[], we: number[]): ChartSpec => ({
    id, title, type: "bar", labels: weekLabels, unit: "num",
    series: [{ name: tr("Hari kerja", "Weekdays"), values: wd, color: PALETTE.brand }, { name: tr("Akhir pekan", "Weekends"), values: we, color: RED }],
  });

  const out: ModuleReport[] = [];
  const attention: string[] = [];

  /* ── kendaraan per kategori + visitor ── */
  type VBlock = { key: VehKey | "vis"; name: string; note?: string; cur: number | null; prev: number | null; yoy: number | null; vals: (number | null)[]; wd: number[]; we: number[] };
  const vBlocks: VBlock[] = [
    ...VEH_CATS.map((c) => ({
      key: c.k, name: tr(c.id, c.en), note: c.noteId ? tr(c.noteId, c.noteEn || c.noteId) : undefined,
      cur: sumOver(keys, field(c.k)), prev: sumOver(prevKeys, field(c.k)),
      yoy: tm.length >= 13 ? mt(tm[0].key)[c.k] : null,
      vals: tm.map((m) => mt(m.key)[c.k]),
      wd: last.veh?.[c.k]?.wd || [], we: last.veh?.[c.k]?.we || [],
    })),
    {
      key: "vis" as const, name: tr("Visitor", "Visitors"),
      cur: sumOver(keys, field("vis")), prev: sumOver(prevKeys, field("vis")),
      yoy: tm.length >= 13 ? mt(tm[0].key).vis : null,
      vals: tm.map((m) => mt(m.key).vis), wd: last.vis?.wd || [], we: last.vis?.we || [],
    },
  ];
  const vehTotal = sumOver(keys, (k) => { const t = mt(k); const vs = [t.kary, t.tamu, t.kontr, t.motor]; return vs.every((v) => v === null) ? null : vs.reduce<number>((a, v) => a + (v || 0), 0); });
  const vehPrev = sumOver(prevKeys, (k) => { const t = mt(k); const vs = [t.kary, t.tamu, t.kontr, t.motor]; return vs.every((v) => v === null) ? null : vs.reduce<number>((a, v) => a + (v || 0), 0); });

  const vSections: ModuleReport[] = vBlocks.map((b) => {
    const title = `${meta.title} — ${b.name}`;
    if (b.cur === null) return { key: "security", sub: true, title, accent: meta.accent, headline: tr("Belum ada data.", "No data."), kpis: [], charts: [], insights: [tr("Belum ada data pada periode ini.", "No data for this period.")], actions: [], attention: [], empty: true };
    const ch = change(b.cur, b.prev), cy = change(b.cur, b.yoy);
    const wdSum = sumArr(b.wd), weSum = sumArr(b.we);
    const hasWeekly = wdSum + weSum > 0;
    const unitW = b.key === "vis" ? tr("orang", "people") : tr("unit", "units");
    const kpis: Kpi[] = [
      { label: tr("Total", "Total"), value: fmtNum(b.cur), sub: periodNote, tone: "neutral" },
      { label: tr("vs periode lalu", "vs prior period"), value: ch.text, sub: b.prev !== null ? fmtNum(b.prev) : "", tone: "neutral" },
      { label: tr("vs tahun lalu", "vs last year"), value: tm.length >= 13 ? cy.text : "–", sub: b.yoy !== null ? `${tm[0].label}: ${fmtNum(b.yoy)}` : "", tone: "neutral" },
      { label: tr("Rata-rata hari kerja", "Avg. per weekday"), value: hasWeekly && wdDays ? fmtNum(Math.round(wdSum / wdDays)) : "–", sub: hasWeekly ? lastName : tr("tanpa data mingguan", "no weekly data"), tone: "neutral" },
      { label: tr("Rata-rata hari libur", "Avg. per weekend day"), value: hasWeekly && weDays ? fmtNum(Math.round(weSum / weDays)) : "–", sub: hasWeekly ? lastName : "", tone: "neutral" },
    ];
    const charts: ChartSpec[] = [
      trendChart({ id: `sec-${b.key}-trend`, title: `${b.name} — ${tr("tren 13 bulan", "13-month trend")}`, months: tm, unit: "num", goodUp: null, series: [{ name: b.name, values: b.vals, color: PALETTE.brand }] }),
    ];
    if (hasWeekly) charts.push(weeklyChart(`sec-${b.key}-week`, `${b.name} — ${tr("per minggu", "by week")} ${lastName}`, b.wd, b.we));
    const insights = [
      tr(`${b.name}${b.note ? ` (${b.note})` : ""}: ${fmtNum(b.cur)} ${unitW} pada ${periodNote}, ${ch.p === null ? "belum ada pembanding" : `${ch.p >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(b.cur - (b.prev || 0)))} (${fmtNum(Math.abs(ch.p), 1)}%) dari periode sebelumnya`}.`,
         `${b.name}${b.note ? ` (${b.note})` : ""}: ${fmtNum(b.cur)} ${unitW} in ${periodNote}, ${ch.p === null ? "no comparison yet" : `${ch.p >= 0 ? "up" : "down"} ${fmtNum(Math.abs(b.cur - (b.prev || 0)))} (${fmtNum(Math.abs(ch.p), 1)}%) on the prior period`}.`),
      trendSentence(b.name.toLowerCase(), b.vals, tm, (n) => fmtNum(n)),
    ].filter(Boolean);
    if (hasWeekly) {
      const tot = b.wd.map((v, i) => num(v) + num(b.we[i]));
      const peak = tot.indexOf(Math.max(...tot));
      insights.push(tr(
        `Rata-rata ${fmtNum(Math.round(wdSum / Math.max(1, wdDays)))} per hari kerja dan ${fmtNum(Math.round(weSum / Math.max(1, weDays)))} per hari libur; minggu tersibuk minggu ke-${peak + 1} (${fmtNum(tot[peak])}).`,
        `Average ${fmtNum(Math.round(wdSum / Math.max(1, wdDays)))} per weekday and ${fmtNum(Math.round(weSum / Math.max(1, weDays)))} per weekend day; busiest week was week ${peak + 1} (${fmtNum(tot[peak])}).`));
    }
    if (b.key === "vis") {
      const team = last.team || {};
      const tsum = TEAM_KEYS.reduce((a, k) => a + num(team[k]), 0);
      if (tsum > 0) insights.push(tr(`Kunjungan team support pengamanan: ${TEAM_KEYS.map((k) => `${k} ${num(team[k])}`).join(", ")}.`, `Security support visits: ${TEAM_KEYS.map((k) => `${k} ${num(team[k])}`).join(", ")}.`));
      if (last.teamNote) insights.push(last.teamNote);
    }
    const actions: string[] = [];
    const isVis = b.key === "vis";
    if (ch.p !== null && ch.p >= 15) actions.push(isVis
      ? tr("Kunjungan naik tajam — siapkan petugas tambahan di pos tamu dan percepat registrasi visitor.", "Visits rose sharply — add staff at the guest post and speed up visitor registration.")
      : tr("Kenaikan cukup tajam — pantau kapasitas parkir dan pengaturan lalu lintas di jam sibuk.", "A sharp rise — monitor parking capacity and peak-hour traffic control."));
    else if (ch.p !== null && ch.p <= -15) actions.push(tr("Penurunan cukup tajam — konfirmasi penyebabnya (libur, proyek selesai, atau pencatatan).", "A sharp drop — confirm the cause (holidays, project completion, or recording)."));
    if (hasWeekly && weDays && weSum / Math.max(1, weDays) > (wdSum / Math.max(1, wdDays)) * 0.5 && !isVis) actions.push(tr("Aktivitas akhir pekan relatif tinggi — pastikan jumlah petugas shift akhir pekan memadai.", "Weekend activity is relatively high — make sure weekend shift staffing is adequate."));
    if (actions.length === 0) actions.push(tr("Pergerakan dalam batas wajar — tidak ada tindakan khusus.", "Movement is within normal range — no special action needed."));
    return { key: "security", sub: true, title, accent: meta.accent, headline: insights[0], kpis, charts, insights, actions, attention: [], empty: false };
  });

  /* ── transporter & biomas ── */
  const timb = sumOver(keys, field("timbang")), non = sumOver(keys, field("non")), bio = sumOver(keys, field("biomas"));
  const trTot = timb === null && non === null ? null : (timb || 0) + (non || 0);
  const trPrev = (() => { const a = sumOver(prevKeys, field("timbang")), b = sumOver(prevKeys, field("non")); return a === null && b === null ? null : (a || 0) + (b || 0); })();
  const bioPrev = sumOver(prevKeys, field("biomas"));
  const sel = last.tr?.sel || 0, po = last.tr?.po || 0;
  const trCh = change(trTot, trPrev), bioCh = change(bio, bioPrev);
  const trSection: ModuleReport = trTot === null
    ? { key: "security", sub: true, title: `${meta.title} — ${tr("Transporter", "Transporters")}`, accent: meta.accent, headline: tr("Belum ada data.", "No data."), kpis: [], charts: [], insights: [tr("Belum ada data transporter.", "No transporter data.")], actions: [], attention: [], empty: true }
    : (() => {
        const charts: ChartSpec[] = [
          trendChart({ id: "sec-tr-trend", title: tr("Kendaraan transporter — tren 13 bulan", "Transporter vehicles — 13-month trend"), months: tm, unit: "num", goodUp: null,
            series: [{ name: tr("Timbang", "Weighed"), values: tm.map((m) => mt(m.key).timbang), color: PALETTE.brand }, { name: tr("Non-timbang", "Non-weighed"), values: tm.map((m) => mt(m.key).non), color: PALETTE.cyan }] }),
        ];
        if (sumArr(last.bio?.wd) + sumArr(last.bio?.we) > 0) charts.push(weeklyChart("sec-bio-week", `${tr("Biomas (PT Becis) — per minggu", "Biomass (PT Becis) — by week")} ${lastName}`, last.bio!.wd, last.bio!.we));
        else charts.push(weeklyChart("sec-tr-week", `${tr("Kendaraan timbang — per minggu", "Weighed vehicles — by week")} ${lastName}`, last.tr?.wd || [], last.tr?.we || []));
        const insights = [
          tr(`Total ${fmtNum(trTot)} kendaraan transporter (timbang ${fmtNum(timb || 0)}, non-timbang ${fmtNum(non || 0)}), ${trCh.p === null ? "belum ada pembanding" : `${trCh.p >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(trCh.p), 1)}% dari periode sebelumnya`}.`,
             `Total ${fmtNum(trTot)} transporter vehicles (weighed ${fmtNum(timb || 0)}, non-weighed ${fmtNum(non || 0)}), ${trCh.p === null ? "no comparison yet" : `${trCh.p >= 0 ? "up" : "down"} ${fmtNum(Math.abs(trCh.p), 1)}% on the prior period`}.`),
          trendSentence(tr("kendaraan transporter", "transporter vehicles"), tm.map((m) => { const t = mt(m.key); return t.timbang === null && t.non === null ? null : (t.timbang || 0) + (t.non || 0); }), tm, (n) => fmtNum(n)),
        ].filter(Boolean);
        if (bio !== null) insights.push(tr(`Biomas: ${fmtNum(bio)} kendaraan${last.bio && last.bio.sekam + last.bio.abu > 0 ? ` (suplai sekam ${fmtNum(last.bio.sekam)}, buang abu ${fmtNum(last.bio.abu)})` : ""}, ${bioCh.p === null ? "belum ada pembanding" : `${bioCh.p >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(bioCh.p), 1)}%`}.`,
                                           `Biomass: ${fmtNum(bio)} vehicles${last.bio && last.bio.sekam + last.bio.abu > 0 ? ` (husk supply ${fmtNum(last.bio.sekam)}, ash removal ${fmtNum(last.bio.abu)})` : ""}, ${bioCh.p === null ? "no comparison yet" : `${bioCh.p >= 0 ? "up" : "down"} ${fmtNum(Math.abs(bioCh.p), 1)}%`}.`));
        const actions: string[] = [];
        if (sel > 0) {
          insights.push(tr(`Selisih timbang ≥ 40 kg: ${fmtNum(sel)} kendaraan${po ? ` dari ${fmtNum(po)} kendaraan Palm Oil / Fat Blend (${fmtPct(pct(sel, po), 0)})` : ""}.`,
                           `Weighbridge gap ≥ 40 kg: ${fmtNum(sel)} vehicles${po ? ` out of ${fmtNum(po)} Palm Oil / Fat Blend vehicles (${fmtPct(pct(sel, po), 0)})` : ""}.`));
          actions.push(tr("Telusuri pola selisih timbang bersama warehouse dan supplier terkait.", "Investigate the weighbridge gap pattern with warehouse and the suppliers involved."));
          if (!po || sel / po > 0.25) attention.push(tr(`Security: ${fmtNum(sel)} kendaraan selisih timbang ≥ 40 kg${po ? ` (${fmtPct(pct(sel, po), 0)} dari Palm Oil / Fat Blend)` : ""}.`, `Security: ${fmtNum(sel)} vehicles with weighbridge gap ≥ 40 kg${po ? ` (${fmtPct(pct(sel, po), 0)} of Palm Oil / Fat Blend)` : ""}.`));
        }
        if (actions.length === 0) actions.push(tr("Pergerakan transporter dalam batas wajar — pertahankan pemeriksaan rutin di gate.", "Transporter flow is within normal range — keep routine gate checks."));
        return {
          key: "security", sub: true, title: `${meta.title} — ${tr("Transporter", "Transporters")}`, accent: meta.accent, headline: insights[0],
          kpis: [
            { label: tr("Total transporter", "Total transporters"), value: fmtNum(trTot), sub: trCh.text, tone: "neutral" },
            { label: tr("Timbang", "Weighed"), value: fmtNum(timb || 0), sub: periodNote, tone: "neutral" },
            { label: tr("Non-timbang", "Non-weighed"), value: fmtNum(non || 0), sub: periodNote, tone: "neutral" },
            { label: tr("Biomas (Becis)", "Biomass (Becis)"), value: bio !== null ? fmtNum(bio) : "–", sub: bioCh.text, tone: "neutral" },
            { label: tr("Selisih timbang ≥ 40 kg", "Weighbridge gap ≥ 40 kg"), value: fmtNum(sel), sub: po ? `${fmtPct(pct(sel, po), 0)} ${tr("dari", "of")} ${fmtNum(po)}` : "", tone: sel > 0 ? "bad" : "good" },
          ],
          charts, insights, actions, attention: [], empty: false,
        } as ModuleReport;
      })();

  /* ── pelanggaran transporter ── */
  const agg: GcAgg = gcOk ? aggregateGc(gcOk, p.from, p.to, p.khusus) : aggregateManual(last.pelManual, p.khusus);
  const prevR = prevRange(p.from, p.to);
  const pelPrev = gcOk ? gcOk.filter((c) => c.tanggal >= prevR.from && c.tanggal <= prevR.to).length : sumOver(prevKeys, pelOf);
  const pelCur = agg.total || (gcOk ? 0 : sumOver(keys, pelOf) || 0);
  const pelCh = change(pelCur, pelPrev);
  const pelVals = tm.map((m) => pelOf(m.key));
  const src = gcOk ? tr("sumber: G-C", "source: G-C") : p.gc && !p.gc.ok ? tr("sumber: input manual (G-C tidak tersambung)", "source: manual input (G-C not connected)") : tr("sumber: input manual", "source: manual input");
  const top = agg.companies.slice(0, 10);
  const topShare = agg.total ? pct((top[0]?.n || 0) + (top[1]?.n || 0), agg.total) : 0;
  const pelInsights = [
    tr(`${fmtNum(pelCur)} kasus pelanggaran transporter${agg.temuan ? ` (${fmtNum(agg.temuan)} temuan)` : ""} dari ${fmtNum(agg.companies.length)} perusahaan, ${pelCh.p === null ? "belum ada pembanding" : `${pelCh.p >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(pelCh.p), 1)}% dari periode sebelumnya (${fmtNum(pelPrev || 0)})`}.`,
       `${fmtNum(pelCur)} transporter violation cases${agg.temuan ? ` (${fmtNum(agg.temuan)} findings)` : ""} across ${fmtNum(agg.companies.length)} companies, ${pelCh.p === null ? "no comparison yet" : `${pelCh.p >= 0 ? "up" : "down"} ${fmtNum(Math.abs(pelCh.p), 1)}% on the prior period (${fmtNum(pelPrev || 0)})`}.`),
    trendSentence(tr("kasus pelanggaran", "violation cases"), pelVals, tm, (n) => fmtNum(n)),
    top.length >= 2 ? tr(`${top[0].name} (${top[0].n}) dan ${top[1].name} (${top[1].n}) menyumbang ${fmtPct(topShare, 0)} kasus.`, `${top[0].name} (${top[0].n}) and ${top[1].name} (${top[1].n}) account for ${fmtPct(topShare, 0)} of cases.`) : "",
    agg.jenis[0] ? tr(`Temuan terbanyak: ${agg.jenis.slice(0, 3).map((j) => `${j.name} (${j.n})`).join(", ")}.`, `Most common findings: ${agg.jenis.slice(0, 3).map((j) => `${j.name} (${j.n})`).join(", ")}.`) : "",
    agg.repeat.length ? tr(`Driver berulang (SIM sama): ${agg.repeat.length} orang, terbanyak ${driverLabel(agg.repeat[0], p.driverNames)} — ${agg.repeat[0].co} (${agg.repeat[0].n}×).`, `Repeat drivers (same licence): ${agg.repeat.length}, most frequent ${driverLabel(agg.repeat[0], p.driverNames)} — ${agg.repeat[0].co} (${agg.repeat[0].n}×).`) : tr("Tidak ada driver yang melanggar berulang.", "No repeat offending drivers."),
  ].filter(Boolean);
  const pelActions: string[] = [];
  if (top[0] && agg.total && pct(top[0].n, agg.total) >= 15) pelActions.push(tr(`Panggil ${top[0].name}${top[1] ? ` dan ${top[1].name}` : ""} untuk pembinaan keselamatan driver.`, `Call in ${top[0].name}${top[1] ? ` and ${top[1].name}` : ""} for driver safety coaching.`));
  if (agg.jenis[0]) pelActions.push(tr(`Sosialisasi ulang standar "${agg.jenis[0].name}" di pos pemeriksaan dan ke vendor.`, `Re-brief the "${agg.jenis[0].name}" standard at the checkpoint and to vendors.`));
  if (pelCh.p !== null && pelCh.p > 10) attention.push(tr(`Security: pelanggaran transporter naik ${fmtNum(pelCh.p, 0)}% (${fmtNum(pelCur)} kasus).`, `Security: transporter violations up ${fmtNum(pelCh.p, 0)}% (${fmtNum(pelCur)} cases).`));
  if (pelActions.length === 0) pelActions.push(tr("Pertahankan pemeriksaan kelengkapan transporter di gate.", "Keep transporter compliance checks at the gate."));
  const pelSection: ModuleReport = {
    key: "security", sub: true, title: `${meta.title} — ${tr("Pelanggaran Transporter", "Transporter Violations")}`, accent: meta.accent,
    headline: pelInsights[0],
    kpis: [
      { label: tr("Kasus", "Cases"), value: fmtNum(pelCur), sub: pelCh.text, tone: toneOf(pelCh.p, false) },
      { label: tr("Temuan", "Findings"), value: fmtNum(agg.temuan), sub: src, tone: "neutral" },
      { label: tr("Perusahaan", "Companies"), value: fmtNum(agg.companies.length), sub: top[0] ? `${tr("terbanyak", "top")}: ${top[0].n}` : "", tone: "neutral" },
      { label: tr("Driver berulang", "Repeat drivers"), value: fmtNum(agg.repeat.length), sub: tr("SIM sama ≥ 2×", "same licence ≥ 2×"), tone: agg.repeat.length ? "bad" : "good" },
    ],
    charts: [
      trendChart({ id: "sec-pel-trend", title: tr("Kasus pelanggaran transporter — tren 13 bulan", "Transporter violation cases — 13-month trend"), months: tm, unit: "num", goodUp: false, series: [{ name: tr("Kasus", "Cases"), values: pelVals, color: RED }] }),
      { id: "sec-pel-co", title: tr("Perusahaan dengan kasus terbanyak", "Companies with most cases"), type: "hbar", labels: top.map((c) => c.name), series: [{ name: tr("Kasus", "Cases"), values: top.map((c) => c.n), color: PALETTE.brand }], unit: "num",
        colors: top.map((c) => (c.khusus ? PALETTE.amber : PALETTE.brand)) },
    ],
    insights: pelInsights, actions: pelActions, attention: [],
    table: top.length ? { title: tr("10 perusahaan dengan kasus terbanyak", "Top 10 companies by cases"), headers: [tr("Perusahaan", "Company"), tr("Kasus", "Cases"), tr("Temuan", "Findings"), tr("Porsi", "Share")], rows: top.map((c) => [c.name + (c.khusus ? " *" : ""), c.n, c.t, fmtPct(pct(c.n, agg.total), 1)]) } : undefined,
    empty: pelCur === 0 && agg.companies.length === 0 && pelVals.every((v) => !v),
  };

  /* ── jenis & Becis/JMM ── */
  const k = agg.khusus;
  const kNames = p.khusus.map((x) => x.replace(/^PT\.?\s*/i, "")).join(" & ");
  const kDrivers = k.drivers.slice(0, 8);
  const kInsights = [
    tr(`${kNames}: ${fmtNum(k.total)} kasus — ${k.byCo.map((c) => `${c.name} ${c.n}`).join(", ")}.`, `${kNames}: ${fmtNum(k.total)} cases — ${k.byCo.map((c) => `${c.name} ${c.n}`).join(", ")}.`),
    k.jenis.length ? tr(`Jenis pelanggaran: ${k.jenis.map((j) => `${j.name} (${j.n})`).join(", ")}.`, `Violation types: ${k.jenis.map((j) => `${j.name} (${j.n})`).join(", ")}.`) : "",
    kDrivers.filter((d) => d.n > 1).length
      ? tr(`Driver berulang: ${kDrivers.filter((d) => d.n > 1).map((d) => `${driverLabel(d, p.driverNames)} (${d.n}×)`).join(", ")}.`, `Repeat drivers: ${kDrivers.filter((d) => d.n > 1).map((d) => `${driverLabel(d, p.driverNames)} (${d.n}×)`).join(", ")}.`)
      : k.total ? tr("Tidak ada driver yang melanggar berulang.", "No repeat offending drivers.") : "",
    agg.jenis.length ? tr(`Semua perusahaan — jenis terbanyak: ${agg.jenis.slice(0, 4).map((j) => `${j.name} ${j.n}`).join(", ")}.`, `All companies — top types: ${agg.jenis.slice(0, 4).map((j) => `${j.name} ${j.n}`).join(", ")}.`) : "",
  ].filter(Boolean);
  const kActions: string[] = [];
  if (k.total > 0) {
    if (k.jenis[0]) kActions.push(tr(`Minta ${kNames} menuntaskan "${k.jenis[0].name}" sebelum unit diizinkan masuk.`, `Require ${kNames} to resolve "${k.jenis[0].name}" before units are allowed in.`));
    const rep = kDrivers.filter((d) => d.n > 1);
    if (rep.length) {
      kActions.push(tr(`Beri peringatan tertulis untuk driver berulang (${rep.map((d) => driverLabel(d, p.driverNames)).join(", ")}).`, `Issue written warnings to repeat drivers (${rep.map((d) => driverLabel(d, p.driverNames)).join(", ")}).`));
      attention.push(tr(`Security: driver ${rep.map((d) => `${driverLabel(d, p.driverNames)} (${d.n}×)`).join(", ")} melanggar berulang (${kNames}).`, `Security: repeat offenders ${rep.map((d) => `${driverLabel(d, p.driverNames)} (${d.n}×)`).join(", ")} (${kNames}).`));
    }
  } else kActions.push(tr(`${kNames} nihil pelanggaran — pertahankan.`, `${kNames} had no violations — keep it up.`));
  const kSection: ModuleReport = {
    key: "security", sub: true, title: `${meta.title} — ${tr("Jenis Pelanggaran & Becis/JMM", "Violation Types & Becis/JMM")}`, accent: meta.accent, headline: kInsights[0],
    kpis: [
      ...k.byCo.map((c) => ({ label: c.name.replace(/^PT\.?\s*/i, "PT "), value: fmtNum(c.n), sub: tr("kasus", "cases"), tone: (c.n ? "bad" : "good") as Kpi["tone"] })),
      { label: tr("Driver berulang", "Repeat drivers"), value: fmtNum(kDrivers.filter((d) => d.n > 1).length), sub: kNames, tone: kDrivers.some((d) => d.n > 1) ? "bad" : "good" },
      { label: tr("Jenis terbanyak", "Top type"), value: k.jenis[0]?.name || "–", sub: k.jenis[0] ? `${k.jenis[0].n} ${tr("temuan", "findings")}` : "", tone: "neutral" },
    ],
    charts: [
      { id: "sec-pel-jenis", title: tr("Jenis pelanggaran — semua perusahaan", "Violation types — all companies"), type: "hbar", labels: agg.jenis.slice(0, 9).map((j) => j.name), series: [{ name: tr("Temuan", "Findings"), values: agg.jenis.slice(0, 9).map((j) => j.n), color: PALETTE.brand }], unit: "num" },
      { id: "sec-pel-kdrv", title: `${kNames} — ${tr("driver pelanggar", "offending drivers")}`, type: "hbar", labels: kDrivers.map((d) => `${driverLabel(d, p.driverNames)} (${d.co.replace(/^PT\.?\s*/i, "")})`), series: [{ name: tr("Kasus", "Cases"), values: kDrivers.map((d) => d.n), color: PALETTE.amber }], unit: "num" },
      { id: "sec-pel-kjenis", title: `${kNames} — ${tr("jenis pelanggaran", "violation types")}`, type: "hbar", labels: k.jenis.map((j) => j.name), series: [{ name: tr("Temuan", "Findings"), values: k.jenis.map((j) => j.n), color: PALETTE.amber }], unit: "num" },
    ],
    insights: kInsights, actions: kActions, attention: [],
    table: k.jenis.length ? { title: `${kNames} — ${tr("rincian jenis", "type breakdown")}`, headers: [tr("Jenis", "Type"), tr("Temuan", "Findings")], rows: k.jenis.map((j) => [j.name, j.n]) } : undefined,
    empty: agg.total === 0 && k.total === 0,
  };

  /* ── kejadian & patroli ── */
  const kejByCat: { name: string; n: number }[] = KEJ_CATS.map((c) => ({ name: catName(c), n: keys.reduce((a, kk) => a + num(p.rows[kk]?.kej?.[c.id]), 0) }));
  const selSum = keys.reduce((a, kk) => a + num(p.rows[kk]?.tr?.sel), 0);
  kejByCat.push({ name: catName(KEJ_AUTO_TIMBANG), n: selSum }, { name: catName(KEJ_AUTO_PEL), n: pelCur });
  const kejNonZero = kejByCat.filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const kejTotal = kejByCat.reduce((a, x) => a + x.n, 0);
  const kejPrev = sumOver(prevKeys, kejOf);
  const kejCh = change(kejTotal, kejPrev);
  const prevLast = (() => { const d = parseISO(`${lastKey}-01`); const a = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`; })();
  const pat = last.pat || { tp: 0, ap: 0, tc: 0, ac: 0, missed: 0 };
  const patP = pct(pat.ap, pat.tp), chkP = pct(pat.ac, pat.tc);
  const issues = keys.flatMap((kk) => (p.rows[kk]?.issues || []));
  const openIssues = issues.filter((i) => i.status === "Open");
  const kejInsights = [
    tr(`${fmtNum(kejTotal)} kejadian tercatat (${kejNonZero.slice(0, 4).map((x) => `${x.name} ${x.n}`).join(", ")}), ${kejCh.p === null ? "belum ada pembanding" : `${kejCh.p >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(kejCh.p), 1)}% dari periode sebelumnya`}.`,
       `${fmtNum(kejTotal)} incidents recorded (${kejNonZero.slice(0, 4).map((x) => `${x.name} ${x.n}`).join(", ")}), ${kejCh.p === null ? "no comparison yet" : `${kejCh.p >= 0 ? "up" : "down"} ${fmtNum(Math.abs(kejCh.p), 1)}% on the prior period`}.`),
  ];
  // perubahan per jenis vs bulan sebelumnya (hanya untuk laporan 1 bulan)
  if (!multiMonth && p.rows[prevLast]?.kej) {
    const ups = KEJ_CATS.map((c) => ({ c, a: num(p.rows[prevLast]?.kej?.[c.id]), b: num(p.rows[lastKey]?.kej?.[c.id]) })).filter((x) => x.b > x.a && x.b >= 3).sort((x, y) => (y.b - y.a) - (x.b - x.a));
    if (ups[0]) kejInsights.push(tr(`${catName(ups[0].c)} naik dari ${ups[0].a} menjadi ${ups[0].b} kejadian.`, `${catName(ups[0].c)} rose from ${ups[0].a} to ${ups[0].b} incidents.`));
  }
  if (pat.tp > 0) kejInsights.push(tr(`Patroli ${fmtPct(patP, 1)} sesuai jadwal (${fmtNum(pat.ap)} dari ${fmtNum(pat.tp)}), checkpoint ${fmtPct(chkP, 1)} (${fmtNum(pat.tc - pat.ac)} tidak terpindai), missed ${fmtNum(pat.missed)}.`,
                                      `Patrols ${fmtPct(patP, 1)} on schedule (${fmtNum(pat.ap)} of ${fmtNum(pat.tp)}), checkpoints ${fmtPct(chkP, 1)} (${fmtNum(pat.tc - pat.ac)} not scanned), ${fmtNum(pat.missed)} missed.`));
  if (issues.length) kejInsights.push(tr(`${issues.length} issue area dicatat, ${openIssues.length} masih open.`, `${issues.length} area issues logged, ${openIssues.length} still open.`));
  const kejActions: string[] = [];
  openIssues.slice(0, 2).forEach((i) => kejActions.push(tr(`Tindak lanjuti: ${i.desc}`, `Follow up: ${i.desc}`)));
  if (pat.tc > 0 && chkP < 98) kejActions.push(tr("Evaluasi titik checkpoint yang sering terlewat bersama tim security.", "Review frequently missed checkpoints with the security team."));
  if (kejActions.length === 0) kejActions.push(tr("Tidak ada kejadian menonjol — pertahankan patroli dan pemeriksaan rutin.", "No notable incidents — keep routine patrols and checks."));
  openIssues.forEach((i) => attention.push(tr(`Security (open): ${i.desc}`, `Security (open): ${i.desc}`)));
  if (pat.tc > 0 && chkP < 95) attention.push(tr(`Security: checkpoint patroli hanya ${fmtPct(chkP, 1)}.`, `Security: patrol checkpoints only ${fmtPct(chkP, 1)}.`));
  const fmtTgl = (t: string) => (/^\d{4}-\d{2}-\d{2}$/.test(t) ? dShort(t) : t);
  const kejSection: ModuleReport = {
    key: "security", sub: true, title: `${meta.title} — ${tr("Kejadian & Patroli", "Incidents & Patrol")}`, accent: meta.accent, headline: kejInsights[0],
    kpis: [
      { label: tr("Total kejadian", "Total incidents"), value: fmtNum(kejTotal), sub: kejCh.text, tone: toneOf(kejCh.p, false) },
      { label: tr("Issue area open", "Open area issues"), value: fmtNum(openIssues.length), sub: `${tr("dari", "of")} ${issues.length}`, tone: openIssues.length ? "bad" : "good" },
      { label: tr("Patroli sesuai jadwal", "Patrols on schedule"), value: pat.tp ? fmtPct(patP, 1) : "–", sub: pat.tp ? `${fmtNum(pat.ap)} / ${fmtNum(pat.tp)}` : "", tone: pat.tp ? (patP >= 99 ? "good" : "bad") : "neutral" },
      { label: tr("Checkpoint terpindai", "Checkpoints scanned"), value: pat.tc ? fmtPct(chkP, 1) : "–", sub: pat.tc ? `${fmtNum(pat.ac)} / ${fmtNum(pat.tc)}` : "", tone: pat.tc ? (chkP >= 98 ? "good" : "bad") : "neutral" },
    ],
    charts: [
      { id: "sec-kej", title: tr("Kejadian per jenis", "Incidents by type"), type: "hbar", labels: kejNonZero.map((x) => x.name), series: [{ name: tr("Kejadian", "Incidents"), values: kejNonZero.map((x) => x.n), color: RED }], unit: "num" },
      trendChart({ id: "sec-kej-trend", title: tr("Total kejadian — tren 13 bulan", "Total incidents — 13-month trend"), months: tm, unit: "num", goodUp: false, series: [{ name: tr("Kejadian", "Incidents"), values: tm.map((m) => kejOf(m.key)), color: RED }] }),
      { id: "sec-pat", title: tr("Patrol activity — aktual vs target (%)", "Patrol activity — actual vs target (%)"), type: "bar", labels: [tr("Patroli", "Patrols"), "Checkpoint"], series: [{ name: "%", values: [Math.round(patP * 10) / 10, Math.round(chkP * 10) / 10], color: PALETTE.cyan }], unit: "pct" },
    ],
    insights: kejInsights, actions: kejActions, attention: [],
    table: issues.length ? { title: tr("Issue area", "Area issues"), headers: [tr("Tanggal", "Date"), tr("Jenis", "Type"), tr("Kejadian", "Description"), "Status"], rows: issues.map((i) => [fmtTgl(i.tgl), catName(KEJ_CATS.find((c) => c.id === i.kat) || { id: i.kat, en: i.kat }), i.desc, i.status]) } : undefined,
    empty: kejTotal === 0 && !pat.tp && !issues.length,
  };

  /* ── ringkasan (kartu di ringkasan eksekutif) ── */
  const visB = vBlocks.find((b) => b.key === "vis")!;
  const vehCh = change(vehTotal, vehPrev);
  const visCh = change(visB.cur, visB.prev);
  const comp = vBlocks.filter((b) => b.key !== "vis" && b.cur !== null);
  const headline = tr(
    `${vehTotal !== null ? `${fmtNum(vehTotal)} kendaraan masuk (${vehCh.text})` : "data kendaraan belum ada"}, ${fmtNum(pelCur)} pelanggaran transporter (${pelCh.text}), ${pat.tp ? `patroli ${fmtPct(patP, 1)} sesuai jadwal` : "patroli belum diisi"}.`,
    `${vehTotal !== null ? `${fmtNum(vehTotal)} vehicles in (${vehCh.text})` : "no vehicle data yet"}, ${fmtNum(pelCur)} transporter violations (${pelCh.text}), ${pat.tp ? `patrols ${fmtPct(patP, 1)} on schedule` : "patrol not filled in"}.`);
  const mainInsights = [
    vehTotal !== null ? tr(`Total ${fmtNum(vehTotal)} kendaraan masuk: ${comp.map((b) => `${b.name} ${fmtNum(b.cur || 0)}`).join(", ")}.`, `Total ${fmtNum(vehTotal)} vehicles in: ${comp.map((b) => `${b.name} ${fmtNum(b.cur || 0)}`).join(", ")}.`) : "",
    visB.cur !== null ? tr(`Visitor ${fmtNum(visB.cur)} orang (${visCh.text} dari periode sebelumnya).`, `Visitors ${fmtNum(visB.cur)} (${visCh.text} on the prior period).`) : "",
    pelInsights[0],
    trTot !== null ? trSection.insights[0] : "",
    kejInsights[0],
    pat.tp ? kejInsights.find((s) => s.startsWith(tr("Patroli", "Patrols"))) || "" : "",
  ].filter(Boolean);
  const mainActions = [...pelActions.slice(0, 1), ...kActions.slice(0, 1), ...kejActions.slice(0, 2)];
  const main: ModuleReport = {
    key: "security", title: meta.title, accent: meta.accent, headline,
    kpis: [
      { label: tr("Kendaraan masuk", "Vehicles in"), value: vehTotal !== null ? fmtNum(vehTotal) : "–", sub: vehCh.text, tone: "neutral" },
      { label: "Visitor", value: visB.cur !== null ? fmtNum(visB.cur) : "–", sub: visCh.text, tone: "neutral" },
      { label: tr("Pelanggaran transporter", "Transporter violations"), value: fmtNum(pelCur), sub: pelCh.text, tone: toneOf(pelCh.p, false) },
      { label: tr("Total kejadian", "Total incidents"), value: fmtNum(kejTotal), sub: kejCh.text, tone: toneOf(kejCh.p, false) },
      { label: tr("Patroli", "Patrols"), value: pat.tp ? fmtPct(patP, 1) : "–", sub: pat.tc ? `checkpoint ${fmtPct(chkP, 1)}` : "", tone: pat.tp ? (patP >= 99 ? "good" : "bad") : "neutral" },
    ],
    charts: [
      { id: "sec-comp", title: tr(`Kendaraan masuk per kategori — ${periodNote}`, `Vehicles in by category — ${periodNote}`), type: "hbar", labels: [...comp.map((b) => b.name), "Visitor"], series: [{ name: tr("Jumlah", "Count"), values: [...comp.map((b) => b.cur || 0), visB.cur || 0], color: PALETTE.brand }], unit: "num" },
      kejSection.charts[0],
    ],
    insights: mainInsights,
    actions: mainActions.length ? mainActions : [tr("Kondisi security terkendali — lanjutkan pemantauan bulanan.", "Security is under control — continue monthly monitoring.")],
    attention: attention.slice(0, 6),
    empty: false,
  };
  if (multiMonth || p.from.slice(8) !== "01") {
    main.insights.push(tr("Catatan: data security diinput per bulan; pelanggaran transporter dihitung per tanggal dari G-C.", "Note: security data is entered monthly; transporter violations are counted by date from G-C."));
  }
  void getReportLang;
  return [main, ...vSections, trSection, pelSection, kSection, kejSection];
}
