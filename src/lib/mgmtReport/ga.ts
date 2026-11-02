/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — modul Cleaning Service & Gardening (TGA punya laporan sendiri: tga.ts).
   Sumber: tabel ga_* hasil sinkron Excel "ISS GA System".
   Achievement = dikerjakan / plan (target 100%).
════════════════════════════════════════════════════════════ */

import { byLowestAch, groupBy, summarize, type GaEvent, type GaImprovement, type GaInventory, type GaPlan } from "../ga/model";
import {
  PALETTE, buckets, fmtNum, fmtPct, metaOf, perWord, tr, trendChart, trendSentence,
  type ChartSpec, type Kpi, type ModuleReport, type MonthSlot,
} from "./model";

const inR = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;
const p100 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);
/** Laporan manajemen hanya menilai HASIL kerja: achievement = dikerjakan / (dikerjakan + tidak dikerjakan).
 *  Jadwal yang belum diinput SPV tidak dihitung sebagai gagal (itu urusan kepatuhan input, bukan hasil kerja). */
const rate = (g: { done: number; tidak: number }) => (g.done + g.tidak ? g.done / (g.done + g.tidak) : null);
const sum = (rows: GaPlan[], asOf: string) => { const x = summarize(rows, asOf); return { ...x, ach: rate(x) }; };
const grp = (rows: GaPlan[], keyOf: (r: GaPlan) => string, asOf: string) => groupBy(rows, keyOf, asOf).map((g) => ({ ...g, ach: rate(g) }));
const pTxt = (v: number | null) => (v === null ? "–" : fmtPct(v * 100, 1));

export function computeGa(p: {
  from: string; to: string; prevFrom: string; prevTo: string; today: string; months: MonthSlot[];
  plan: GaPlan[]; events: GaEvent[]; imps: GaImprovement[]; inv: GaInventory[];
}): ModuleReport {
  const meta = metaOf("ga");
  const asOf = p.today < p.to ? p.today : p.to;
  const cur = p.plan.filter((r) => inR(r.tanggal, p.from, p.to));
  const prevRows = p.plan.filter((r) => inR(r.tanggal, p.prevFrom, p.prevTo));
  const events = p.events.filter((t) => inR(t.tanggal, p.from, p.to));
  const imps = p.imps.filter((t) => inR(t.tanggal, p.from, p.to));
  const invItems = p.inv.filter((i) => i.nama);
  const invBad = invItems.filter((i) => i.status.toLowerCase() !== "baik");

  const sNow = sum(cur, asOf);
  if (sNow.done + sNow.tidak === 0 && events.length === 0 && imps.length === 0) {
    const msg = tr("Belum ada hasil pekerjaan Cleaning & Gardening yang tercatat pada periode ini.", "No Cleaning & Gardening results recorded for this period.");
    return { key: "ga", title: meta.title, accent: meta.accent, headline: msg, kpis: [], charts: [], insights: [msg], actions: [], attention: [], empty: true };
  }

  const s = sum(cur, asOf);
  const sp = sum(prevRows, p.prevTo);
  const results = s.done + s.tidak;
  const dPts = s.ach !== null && sp.ach !== null ? (s.ach - sp.ach) * 100 : null;
  const teams = grp(cur, (r) => r.tim, asOf).sort((a, b) => a.key.localeCompare(b.key));
  const lokasi = grp(cur, (r) => r.lokasi, asOf).filter((g) => g.done + g.tidak > 0).sort(byLowestAch);
  const tipe = grp(cur, (r) => r.tipe, asOf).filter((g) => g.done + g.tidak > 0).sort(byLowestAch);
  const below = lokasi.filter((g) => g.ach !== null && g.ach < 0.999);

  // tren 13 bulan (achievement %)
  const trendVals = p.months.map((m) => {
    const rs = p.plan.filter((r) => inR(r.tanggal, m.from, m.to));
    return rs.length ? p100(sum(rs, m.to < asOf ? m.to : asOf).ach) : null;
  });
  const bs = buckets(p.from, p.to);
  const bVals = bs.map((b) => p100(sum(cur.filter((r) => r.tanggal >= b.from && r.tanggal <= b.to), asOf).ach) ?? 0);

  const kpis: Kpi[] = [
    { label: "Achievement", value: pTxt(s.ach),
      sub: `${s.ach !== null && s.ach >= 0.999 ? tr("✓ achieve", "✓ achieved") : tr("target 100%", "target 100%")}${dPts !== null ? ` · ${dPts >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(dPts), 1)} ${tr("poin", "pts")}` : ""}`,
      tone: s.ach === null ? "neutral" : s.ach >= 0.999 ? "good" : s.ach >= 0.9 ? "neutral" : "bad" },
    { label: tr("Pekerjaan dikerjakan", "Jobs done"), value: `${fmtNum(s.done)} / ${fmtNum(results)}`, sub: `${fmtNum(s.tidak)} ${tr("tidak dikerjakan", "not done")}`, tone: s.tidak ? "bad" : "good" },
    { label: tr("Lokasi di bawah target", "Locations below target"), value: `${fmtNum(below.length)} / ${fmtNum(lokasi.length)}`, sub: below[0] ? `${tr("terendah", "lowest")}: ${below[0].key} ${pTxt(below[0].ach)}` : tr("semua lokasi achieve", "all locations achieved"), tone: below.length ? "bad" : "good" },
    { label: tr("Event & improvement", "Events & improvements"), value: fmtNum(events.length + imps.length), sub: `${events.length} event · ${imps.length} improvement`, tone: "neutral" },
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

  const teamTxt = teams.map((t) => `${t.key} ${pTxt(t.ach)}`).join(", ");
  const insights = [
    results ? tr(
      `Achievement pekerjaan rutin ${pTxt(s.ach)} (${fmtNum(s.done)} dari ${fmtNum(results)} pekerjaan tercatat dikerjakan)${dPts !== null ? `, ${dPts >= 0 ? "naik" : "turun"} ${fmtNum(Math.abs(dPts), 1)} poin dari periode sebelumnya (${pTxt(sp.ach)})` : ""}. ${teamTxt ? `Per tim: ${teamTxt}.` : ""}`,
      `Routine work achievement ${pTxt(s.ach)} (${fmtNum(s.done)} of ${fmtNum(results)} recorded jobs done)${dPts !== null ? `, ${dPts >= 0 ? "up" : "down"} ${fmtNum(Math.abs(dPts), 1)} pts versus the prior period (${pTxt(sp.ach)})` : ""}. ${teamTxt ? `By team: ${teamTxt}.` : ""}`,
    ) : tr("Belum ada plan pekerjaan rutin pada periode ini.", "No routine work plan for this period."),
    trendSentence("achievement", trendVals, p.months, (n) => fmtPct(n, 1)),
    below.length ? tr(
      `${below.length} lokasi di bawah target: ${below.slice(0, 3).map((g) => `${g.key} (${pTxt(g.ach)})`).join(", ")}.`,
      `${below.length} locations below target: ${below.slice(0, 3).map((g) => `${g.key} (${pTxt(g.ach)})`).join(", ")}.`,
    ) : results ? tr("Semua lokasi mencapai target 100%.", "All locations reached the 100% target.") : "",
    tipe[0] && tipe[0].ach !== null && tipe[0].ach < 0.999 ? tr(`Tipe pekerjaan terendah: ${tipe[0].key} (${pTxt(tipe[0].ach)}).`, `Lowest work type: ${tipe[0].key} (${pTxt(tipe[0].ach)}).`) : "",
    events.length || imps.length ? tr(`${events.length} event didukung GA dan ${imps.length} improvement/inovasi tercatat.`, `${events.length} events supported by GA and ${imps.length} improvements recorded.`) : "",
    invItems.length ? tr(`Inventory alat: ${invItems.length} jenis, ${invBad.length} perlu tindak lanjut (status selain Baik).`, `Tool inventory: ${invItems.length} types, ${invBad.length} need follow-up (status other than Good).`) : "",
  ].filter(Boolean);

  const actions: string[] = [];
  const attention: string[] = [];
  if (s.ach !== null && s.ach < 0.999) {
    actions.push(tr(`Tinjau ${fmtNum(s.tidak)} pekerjaan yang tidak dikerjakan bersama SPV ISS${below[0] ? `, prioritaskan ${below.slice(0, 2).map((g) => g.key).join(" & ")}` : ""}.`,
                    `Review the ${fmtNum(s.tidak)} skipped jobs with the ISS supervisor${below[0] ? `, prioritising ${below.slice(0, 2).map((g) => g.key).join(" & ")}` : ""}.`));
    if (s.ach < 0.95) attention.push(tr(`Cleaning & Gardening: achievement ${pTxt(s.ach)} (target 100%).`, `Cleaning & Gardening: achievement ${pTxt(s.ach)} (target 100%).`));
  }
  if (invBad.length) actions.push(tr(`Tindak lanjuti ${invBad.length} alat kebersihan/taman yang tidak dalam kondisi baik.`, `Follow up ${invBad.length} cleaning/garden tools not in good condition.`));
  if (actions.length === 0) actions.push(tr("Pekerjaan Cleaning & Gardening mencapai target — pertahankan pemantauan mingguan.", "Cleaning & Gardening met target — keep weekly monitoring."));

  return {
    key: "ga", title: meta.title, accent: meta.accent,
    headline: tr(
      `Achievement ${pTxt(s.ach)}${s.ach !== null ? (s.ach >= 0.999 ? " (achieve)" : " (di bawah target 100%)") : ""}; ${fmtNum(s.done)} dari ${fmtNum(results)} pekerjaan tercatat dikerjakan.`,
      `Achievement ${pTxt(s.ach)}${s.ach !== null ? (s.ach >= 0.999 ? " (achieved)" : " (below 100% target)") : ""}; ${fmtNum(s.done)} of ${fmtNum(results)} recorded jobs done.`,
    ),
    kpis, charts, insights, actions, attention,
    table: lokasi.length ? {
      title: tr("Achievement per lokasi", "Achievement by location"),
      headers: [tr("Lokasi", "Location"), tr("Tercatat", "Recorded"), tr("Dikerjakan", "Done"), tr("Tidak", "Not done"), "Achievement"],
      rows: lokasi.slice(0, 12).map((g) => [g.key, g.done + g.tidak, g.done, g.tidak, pTxt(g.ach)]),
    } : undefined,
    empty: false,
  };
}
