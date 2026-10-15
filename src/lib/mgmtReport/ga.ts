/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — modul GA FACILITY (Cleaning Service, Gardening, TGA).
   Sumber: tabel ga_* hasil sinkron Excel "ISS GA System".
   Achievement = dikerjakan / plan (target 100%).
════════════════════════════════════════════════════════════ */

import { byLowestAch, groupBy, summarize, type GaEvent, type GaImprovement, type GaInventory, type GaPlan, type GaTga } from "../ga/model";
import {
  PALETTE, buckets, fmtNum, fmtPct, metaOf, perWord, tr, trendChart, trendSentence,
  type ChartSpec, type Kpi, type ModuleReport, type MonthSlot,
} from "./model";

const inR = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;
const p100 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);
const pTxt = (v: number | null) => (v === null ? "–" : fmtPct(v * 100, 1));

export function computeGa(p: {
  from: string; to: string; prevFrom: string; prevTo: string; today: string; months: MonthSlot[];
  plan: GaPlan[]; tga: GaTga[]; events: GaEvent[]; imps: GaImprovement[]; inv: GaInventory[];
}): ModuleReport {
  const meta = metaOf("ga");
  const asOf = p.today < p.to ? p.today : p.to;
  const cur = p.plan.filter((r) => inR(r.tanggal, p.from, p.to));
  const prevRows = p.plan.filter((r) => inR(r.tanggal, p.prevFrom, p.prevTo));
  const tga = p.tga.filter((t) => inR(t.tanggal, p.from, p.to));
  const prevTga = p.tga.filter((t) => inR(t.tanggal, p.prevFrom, p.prevTo));
  const events = p.events.filter((t) => inR(t.tanggal, p.from, p.to));
  const imps = p.imps.filter((t) => inR(t.tanggal, p.from, p.to));
  const invItems = p.inv.filter((i) => i.nama);
  const invBad = invItems.filter((i) => i.status.toLowerCase() !== "baik");

  if (cur.length === 0 && tga.length === 0 && events.length === 0 && imps.length === 0) {
    return { key: "ga", title: meta.title, accent: meta.accent, headline: tr("Belum ada data GA pada periode ini (sinkron dari Excel ISS GA System).", "No GA data for this period (synced from the ISS GA System Excel)."),
      kpis: [], charts: [], insights: [tr("Belum ada data GA pada periode ini.", "No GA data for this period.")], actions: [], attention: [], empty: true };
  }

  const s = summarize(cur, asOf);
  const sp = summarize(prevRows, p.prevTo);
  const dPts = s.ach !== null && sp.ach !== null ? (s.ach - sp.ach) * 100 : null;
  const teams = groupBy(cur, (r) => r.tim, asOf).sort((a, b) => a.key.localeCompare(b.key));
  const lokasi = groupBy(cur, (r) => r.lokasi, asOf).filter((g) => g.plan > 0).sort(byLowestAch);
  const tipe = groupBy(cur, (r) => r.tipe, asOf).filter((g) => g.plan > 0).sort(byLowestAch);
  const below = lokasi.filter((g) => g.ach !== null && g.ach < 0.999);

  const tgaBy = new Map<string, number>();
  tga.forEach((t) => tgaBy.set(t.namaTga || "–", (tgaBy.get(t.namaTga || "–") ?? 0) + 1));
  const tech = [...tgaBy.entries()].sort((a, b) => b[1] - a[1]);
  const reqBy = new Map<string, number>();
  tga.forEach((t) => reqBy.set(t.requestBy || "–", (reqBy.get(t.requestBy || "–") ?? 0) + 1));
  const req = [...reqBy.entries()].sort((a, b) => b[1] - a[1]);

  // tren 13 bulan (achievement %)
  const trendVals = p.months.map((m) => {
    const rs = p.plan.filter((r) => inR(r.tanggal, m.from, m.to));
    return rs.length ? p100(summarize(rs, m.to < asOf ? m.to : asOf).ach) : null;
  });
  const tgaVals = p.months.map((m) => p.tga.filter((t) => inR(t.tanggal, m.from, m.to)).length);
  const bs = buckets(p.from, p.to);
  const bVals = bs.map((b) => p100(summarize(cur.filter((r) => r.tanggal >= b.from && r.tanggal <= b.to), asOf).ach) ?? 0);

  const kpis: Kpi[] = [
    { label: "Achievement", value: pTxt(s.ach),
      sub: `${s.ach !== null && s.ach >= 0.999 ? tr("✓ achieve", "✓ achieved") : tr("target 100%", "target 100%")}${dPts !== null ? ` · ${dPts >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(dPts), 1)} ${tr("poin", "pts")}` : ""}`,
      tone: s.ach === null ? "neutral" : s.ach >= 0.999 ? "good" : s.ach >= 0.9 ? "neutral" : "bad" },
    { label: tr("Pekerjaan dikerjakan", "Jobs done"), value: `${fmtNum(s.done)} / ${fmtNum(s.plan)}`, sub: `${fmtNum(s.tidak)} ${tr("tidak dikerjakan", "not done")}`, tone: s.tidak ? "bad" : "good" },
    { label: tr("Kepatuhan input SPV", "SPV input compliance"), value: pTxt(s.compliance), sub: `${fmtNum(s.belum)} ${tr("jadwal belum diinput", "jobs not entered")}`, tone: s.compliance === null ? "neutral" : s.compliance >= 0.95 ? "good" : "bad" },
    { label: tr("Aktivitas TGA", "TGA activities"), value: fmtNum(tga.length), sub: `${events.length} event · ${imps.length} improvement`, tone: "neutral" },
  ];

  const charts: ChartSpec[] = [
    trendChart({ id: "ga-trend13", title: tr("Achievement Cleaning & Gardening — 13 bulan (%)", "Cleaning & Gardening achievement — 13 months (%)"), months: p.months, unit: "pct", goodUp: true,
      series: [{ name: "Achievement", values: trendVals, color: PALETTE.cyan }] }),
    { id: "ga-lokasi", title: tr("Achievement per lokasi (terendah dulu)", "Achievement by location (lowest first)"), type: "hbar",
      labels: lokasi.slice(0, 8).map((g) => g.key), series: [{ name: "Achievement", color: PALETTE.cyan, values: lokasi.slice(0, 8).map((g) => p100(g.ach) ?? 0) }], unit: "pct",
      colors: lokasi.slice(0, 8).map((g) => ((g.ach ?? 0) >= 0.999 ? PALETTE.green : (g.ach ?? 0) >= 0.9 ? PALETTE.amber : PALETTE.red)) },
    { id: "ga-trend", title: `${tr("Achievement", "Achievement")} ${perWord(p.from, p.to)}`, type: "bar", labels: bs.map((b) => b.label),
      series: [{ name: "Achievement", color: PALETTE.cyan, values: bVals }], unit: "pct" },
    { id: "ga-team", title: tr("Achievement per tim", "Achievement by team"), type: "bar", labels: teams.map((t) => t.key),
      series: [{ name: "Achievement", color: PALETTE.cyan, values: teams.map((t) => p100(t.ach) ?? 0) }], unit: "pct" },
  ];
  if (tech.length) charts.push({ id: "ga-tga", title: tr("Aktivitas TGA per teknisi", "TGA activities by technician"), type: "hbar",
    labels: tech.slice(0, 8).map((x) => x[0]), series: [{ name: tr("Aktivitas", "Activities"), color: PALETTE.purple, values: tech.slice(0, 8).map((x) => x[1]) }], unit: "num" });
  if (tgaVals.some((v) => v > 0)) charts.push(trendChart({ id: "ga-tga13", title: tr("Aktivitas TGA per bulan — 13 bulan", "TGA activities per month — 13 months"), months: p.months, unit: "num", goodUp: null,
    series: [{ name: "TGA", values: tgaVals, color: PALETTE.purple }] }));

  const teamTxt = teams.map((t) => `${t.key} ${pTxt(t.ach)}`).join(", ");
  const insights = [
    s.plan ? tr(
      `Achievement pekerjaan rutin ${pTxt(s.ach)} (${fmtNum(s.done)} dari ${fmtNum(s.plan)} jadwal dikerjakan)${dPts !== null ? `, ${dPts >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(dPts), 1)} poin dari periode sebelumnya (${pTxt(sp.ach)})` : ""}. ${teamTxt ? `Per tim: ${teamTxt}.` : ""}`,
      `Routine work achievement ${pTxt(s.ach)} (${fmtNum(s.done)} of ${fmtNum(s.plan)} scheduled jobs done)${dPts !== null ? `, ${dPts >= 0 ? "up" : "down"} ${fmtNum(Math.abs(dPts), 1)} pts versus the prior period (${pTxt(sp.ach)})` : ""}. ${teamTxt ? `By team: ${teamTxt}.` : ""}`,
    ) : tr("Belum ada plan pekerjaan rutin pada periode ini.", "No routine work plan for this period."),
    trendSentence("achievement", trendVals, p.months, (n) => fmtPct(n, 1)),
    below.length ? tr(
      `${below.length} lokasi di bawah target: ${below.slice(0, 3).map((g) => `${g.key} (${pTxt(g.ach)})`).join(", ")}.`,
      `${below.length} locations below target: ${below.slice(0, 3).map((g) => `${g.key} (${pTxt(g.ach)})`).join(", ")}.`,
    ) : s.plan ? tr("Semua lokasi mencapai target 100%.", "All locations reached the 100% target.") : "",
    tipe[0] && tipe[0].ach !== null && tipe[0].ach < 0.999 ? tr(`Tipe pekerjaan terendah: ${tipe[0].key} (${pTxt(tipe[0].ach)}).`, `Lowest work type: ${tipe[0].key} (${pTxt(tipe[0].ach)}).`) : "",
    s.due ? tr(
      `Kepatuhan input actual SPV ${pTxt(s.compliance)}${s.belum ? ` — ${fmtNum(s.belum)} jadwal yang sudah lewat belum diinput` : ""}.`,
      `SPV actual-input compliance ${pTxt(s.compliance)}${s.belum ? ` — ${fmtNum(s.belum)} past jobs not yet entered` : ""}.`,
    ) : "",
    tga.length ? tr(
      `${fmtNum(tga.length)} aktivitas TGA (perbaikan/permintaan)${prevTga.length ? ` vs ${prevTga.length} periode lalu` : ""}; teknisi tersibuk ${tech[0][0]} (${tech[0][1]}), pemohon terbanyak ${req[0][0]} (${req[0][1]}).`,
      `${fmtNum(tga.length)} TGA activities (repairs/requests)${prevTga.length ? ` vs ${prevTga.length} prior period` : ""}; busiest technician ${tech[0][0]} (${tech[0][1]}), top requester ${req[0][0]} (${req[0][1]}).`,
    ) : tr("Tidak ada aktivitas TGA tercatat.", "No TGA activities recorded."),
    events.length || imps.length ? tr(`${events.length} event didukung GA dan ${imps.length} improvement/inovasi tercatat.`, `${events.length} events supported by GA and ${imps.length} improvements recorded.`) : "",
    invItems.length ? tr(`Inventory alat: ${invItems.length} jenis, ${invBad.length} perlu tindak lanjut (status selain Baik).`, `Tool inventory: ${invItems.length} types, ${invBad.length} need follow-up (status other than Good).`) : "",
  ].filter(Boolean);

  const actions: string[] = [];
  const attention: string[] = [];
  if (s.ach !== null && s.ach < 0.999) {
    actions.push(tr(`Tinjau ${fmtNum(s.tidak)} pekerjaan yang tidak dikerjakan bersama SPV ISS${below[0] ? `, prioritaskan ${below.slice(0, 2).map((g) => g.key).join(" & ")}` : ""}.`,
                    `Review the ${fmtNum(s.tidak)} skipped jobs with the ISS supervisor${below[0] ? `, prioritising ${below.slice(0, 2).map((g) => g.key).join(" & ")}` : ""}.`));
    if (s.ach < 0.95) attention.push(tr(`GA: achievement ${pTxt(s.ach)} (target 100%).`, `GA: achievement ${pTxt(s.ach)} (target 100%).`));
  }
  if (s.compliance !== null && s.compliance < 0.95) {
    actions.push(tr(`Ingatkan SPV menginput actual mingguan — ${fmtNum(s.belum)} jadwal belum diinput.`, `Remind the SPV to enter weekly actuals — ${fmtNum(s.belum)} jobs pending.`));
    attention.push(tr(`GA: ${fmtNum(s.belum)} jadwal belum diinput SPV.`, `GA: ${fmtNum(s.belum)} jobs not entered by the SPV.`));
  }
  if (req[0] && tga.length >= 5 && req[0][1] / tga.length > 0.4) actions.push(tr(`${req[0][0]} mengajukan ${fmtPct((req[0][1] / tga.length) * 100, 0)} permintaan TGA — cek akar masalah fasilitas di area tersebut.`,
                                                                                   `${req[0][0]} raised ${fmtPct((req[0][1] / tga.length) * 100, 0)} of TGA requests — check the root cause of facility issues there.`));
  if (invBad.length) actions.push(tr(`Tindak lanjuti ${invBad.length} alat kebersihan/taman yang tidak dalam kondisi baik.`, `Follow up ${invBad.length} cleaning/garden tools not in good condition.`));
  if (actions.length === 0) actions.push(tr("Pekerjaan Cleaning & Gardening mencapai target — pertahankan pemantauan mingguan.", "Cleaning & Gardening met target — keep weekly monitoring."));

  return {
    key: "ga", title: meta.title, accent: meta.accent,
    headline: tr(
      `Achievement ${pTxt(s.ach)}${s.ach !== null ? (s.ach >= 0.999 ? " (achieve)" : " (di bawah target 100%)") : ""}; ${tga.length} aktivitas TGA.`,
      `Achievement ${pTxt(s.ach)}${s.ach !== null ? (s.ach >= 0.999 ? " (achieved)" : " (below 100% target)") : ""}; ${tga.length} TGA activities.`,
    ),
    kpis, charts, insights, actions, attention,
    table: lokasi.length ? {
      title: tr("Achievement per lokasi", "Achievement by location"),
      headers: [tr("Lokasi", "Location"), "Plan", tr("Dikerjakan", "Done"), tr("Tidak", "Not done"), tr("Belum input", "Not entered"), "Achievement"],
      rows: lokasi.slice(0, 12).map((g) => [g.key, g.plan, g.done, g.tidak, g.belum, pTxt(g.ach)]),
    } : undefined,
    empty: false,
  };
}
