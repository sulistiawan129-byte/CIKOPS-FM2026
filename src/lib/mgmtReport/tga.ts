/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — modul TGA (Teknisi GA).
   Sumber: tga_activities (aplikasi TGA, form penugasan, permintaan).
   Ringkas: volume, penyelesaian, tertunda/urgent, beban per teknisi, pemohon.
════════════════════════════════════════════════════════════ */

import type { TgaActivity } from "../tga/api";
import {
  PALETTE, deltaText, fmtNum, fmtPct, metaOf, perWord, buckets, tr, trendChart, trendSentence,
  type ChartSpec, type Kpi, type ModuleReport, type MonthSlot,
} from "./model";

const inR = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;
const OPEN = new Set(["baru", "proses", "pending", "butuh_part"]);
const topOf = (xs: string[], n: number) => {
  const m = new Map<string, number>();
  xs.forEach((x) => { const k = (x || "").trim() || "–"; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

export function computeTga(p: {
  from: string; to: string; prevFrom: string; prevTo: string; months: MonthSlot[]; rows: TgaActivity[];
}): ModuleReport {
  const meta = metaOf("tga");
  const valid = (r: TgaActivity) => r.status !== "batal";
  const cur = p.rows.filter((r) => inR(r.tanggal, p.from, p.to));
  const prev = p.rows.filter((r) => inR(r.tanggal, p.prevFrom, p.prevTo) && valid(r));
  if (cur.length === 0) {
    const msg = tr("Belum ada pekerjaan TGA pada periode ini.", "No TGA jobs for this period.");
    return { key: "tga", title: meta.title, accent: meta.accent, headline: msg, kpis: [], charts: [], insights: [msg], actions: [], attention: [], empty: true };
  }

  const jobs = cur.filter(valid);
  const cancelled = cur.length - jobs.length;
  const done = jobs.filter((r) => r.status === "selesai");
  const open = jobs.filter((r) => OPEN.has(r.status));
  const part = jobs.filter((r) => r.status === "butuh_part");
  const urgent = jobs.filter((r) => r.prioritas === "urgent");
  const urgentOpen = urgent.filter((r) => OPEN.has(r.status));
  const rate = jobs.length ? (done.length / jobs.length) * 100 : 0;
  const prevDone = prev.filter((r) => r.status === "selesai").length;
  const dv = deltaText(jobs.length, prev.length);

  // rata-rata waktu pengerjaan (menit) dari jam mulai → jam selesai
  const mins = done.map((r) => {
    if (!r.jam_mulai || !r.jam_selesai) return null;
    const [h1, m1] = r.jam_mulai.split(":").map(Number), [h2, m2] = r.jam_selesai.split(":").map(Number);
    const d = h2 * 60 + m2 - (h1 * 60 + m1);
    return d > 0 && d < 720 ? d : null;
  }).filter((x): x is number => x !== null);
  const avgMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;

  const techs = topOf(jobs.map((r) => r.nama_tga), 8);
  const reqDept = topOf(jobs.map((r) => r.departemen), 6);
  const cats = topOf(jobs.map((r) => r.kategori), 6);
  const bs = buckets(p.from, p.to);
  const trendVals = p.months.map((m) => p.rows.filter((r) => valid(r) && inR(r.tanggal, m.from, m.to)).length);

  const kpis: Kpi[] = [
    { label: tr("Total pekerjaan", "Total jobs"), value: fmtNum(jobs.length), sub: dv.text, tone: "neutral" },
    { label: tr("Selesai", "Completed"), value: fmtPct(rate, 0), sub: `${fmtNum(done.length)} ${tr("pekerjaan", "jobs")}${prev.length ? ` · ${tr("lalu", "prior")} ${fmtNum(prevDone)}` : ""}`, tone: rate >= 85 ? "good" : rate >= 65 ? "neutral" : "bad" },
    { label: tr("Belum selesai", "Still open"), value: fmtNum(open.length), sub: part.length ? tr(`${part.length} menunggu part`, `${part.length} waiting for parts`) : tr("tidak ada yang menunggu part", "none waiting for parts"), tone: open.length > jobs.length * 0.3 ? "bad" : "neutral" },
    { label: "Urgent", value: fmtNum(urgent.length), sub: urgentOpen.length ? tr(`${urgentOpen.length} belum selesai`, `${urgentOpen.length} not finished`) : tr("semua tertangani", "all handled"), tone: urgentOpen.length ? "bad" : "good" },
  ];

  const charts: ChartSpec[] = [
    trendChart({ id: "tga-trend13", title: tr("Pekerjaan TGA per bulan — 13 bulan", "TGA jobs per month — 13 months"), months: p.months, unit: "num", goodUp: null,
      series: [{ name: tr("Pekerjaan", "Jobs"), values: trendVals, color: PALETTE.purple }] }),
    { id: "tga-status", title: tr("Status pekerjaan", "Job status"), type: "donut",
      labels: [tr("Selesai", "Completed"), tr("Proses / baru", "In progress / new"), tr("Pending", "Pending"), tr("Butuh part", "Needs parts"), tr("Dibatalkan", "Cancelled")],
      series: [{ name: tr("Pekerjaan", "Jobs"), color: PALETTE.purple, values: [done.length, jobs.filter((r) => r.status === "proses" || r.status === "baru").length, jobs.filter((r) => r.status === "pending").length, part.length, cancelled] }], unit: "num",
      colors: [PALETTE.green, PALETTE.brand, PALETTE.amber, PALETTE.red, PALETTE.gray] },
    { id: "tga-tech", title: tr("Pekerjaan per teknisi", "Jobs per technician"), type: "hbar", labels: techs.map((x) => x[0]),
      series: [{ name: tr("Pekerjaan", "Jobs"), color: PALETTE.purple, values: techs.map((x) => x[1]) }], unit: "num" },
    { id: "tga-period", title: `${tr("Pekerjaan", "Jobs")} ${perWord(p.from, p.to)}`, type: "bar", labels: bs.map((b) => b.label),
      series: [{ name: tr("Pekerjaan", "Jobs"), color: PALETTE.purple, values: bs.map((b) => jobs.filter((r) => r.tanggal >= b.from && r.tanggal <= b.to).length) }], unit: "num" },
  ];

  const insights = [
    tr(`${fmtNum(jobs.length)} pekerjaan TGA, ${dv.text} dibanding periode lalu (${fmtNum(prev.length)}); ${fmtPct(rate, 0)} selesai.`,
       `${fmtNum(jobs.length)} TGA jobs, ${dv.text} versus the prior period (${fmtNum(prev.length)}); ${fmtPct(rate, 0)} completed.`),
    trendSentence(tr("pekerjaan TGA", "TGA jobs"), trendVals, p.months, (n) => fmtNum(n)),
    techs[0] ? tr(`Teknisi tersibuk ${techs[0][0]} (${techs[0][1]} pekerjaan)${techs[1] ? `, lalu ${techs[1][0]} (${techs[1][1]})` : ""}.`,
                  `Busiest technician ${techs[0][0]} (${techs[0][1]} jobs)${techs[1] ? `, then ${techs[1][0]} (${techs[1][1]})` : ""}.`) : "",
    reqDept[0] && reqDept[0][0] !== "–" ? tr(`Permintaan terbanyak dari ${reqDept[0][0]} (${reqDept[0][1]})${cats[0] ? `; kategori utama ${cats[0][0]}` : ""}.`,
                                           `Most requests came from ${reqDept[0][0]} (${reqDept[0][1]})${cats[0] ? `; main category ${cats[0][0]}` : ""}.`) : "",
    avgMin ? tr(`Rata-rata waktu pengerjaan ${fmtNum(avgMin / 60, 1)} jam per pekerjaan.`, `Average working time ${fmtNum(avgMin / 60, 1)} hours per job.`) : "",
    cancelled ? tr(`${cancelled} pekerjaan dibatalkan.`, `${cancelled} jobs cancelled.`) : "",
  ].filter(Boolean);

  const actions: string[] = [];
  const attention: string[] = [];
  if (urgentOpen.length) {
    actions.push(tr(`Selesaikan ${urgentOpen.length} pekerjaan urgent yang masih terbuka.`, `Close the ${urgentOpen.length} urgent jobs still open.`));
    attention.push(tr(`TGA: ${urgentOpen.length} pekerjaan urgent belum selesai.`, `TGA: ${urgentOpen.length} urgent jobs not finished.`));
  }
  if (part.length) actions.push(tr(`Percepat pengadaan part untuk ${part.length} pekerjaan yang menunggu.`, `Speed up parts procurement for ${part.length} waiting jobs.`));
  if (techs.length > 1 && techs[0][1] > jobs.length * 0.45) actions.push(tr(`Beban kerja timpang — ${techs[0][0]} memegang ${fmtPct((techs[0][1] / jobs.length) * 100, 0)} pekerjaan; seimbangkan penugasan.`, `Uneven workload — ${techs[0][0]} holds ${fmtPct((techs[0][1] / jobs.length) * 100, 0)} of jobs; rebalance assignments.`));
  if (rate < 65) attention.push(tr(`TGA: hanya ${fmtPct(rate, 0)} pekerjaan selesai.`, `TGA: only ${fmtPct(rate, 0)} of jobs completed.`));
  if (actions.length === 0) actions.push(tr("Kinerja TGA baik — pertahankan.", "TGA performance is healthy — keep it up."));

  return {
    key: "tga", title: meta.title, accent: meta.accent,
    headline: tr(`${fmtNum(jobs.length)} pekerjaan, ${fmtPct(rate, 0)} selesai${urgentOpen.length ? `, ${urgentOpen.length} urgent terbuka` : ""}.`,
                 `${fmtNum(jobs.length)} jobs, ${fmtPct(rate, 0)} completed${urgentOpen.length ? `, ${urgentOpen.length} urgent open` : ""}.`),
    kpis, charts, insights, actions, attention,
    table: techs.length ? {
      title: tr("Pekerjaan per teknisi", "Jobs per technician"),
      headers: [tr("Teknisi", "Technician"), tr("Total", "Total"), tr("Selesai", "Completed"), tr("Belum selesai", "Open")],
      rows: techs.map(([n, c]) => [n, c, jobs.filter((r) => (r.nama_tga || "–") === n && r.status === "selesai").length, jobs.filter((r) => (r.nama_tga || "–") === n && OPEN.has(r.status)).length]),
    } : undefined,
    empty: false,
  };
}
