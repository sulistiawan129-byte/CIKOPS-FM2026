/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — analisis per modul.
   Fungsi murni: data mentah + periode → ModuleReport (KPI, grafik,
   insight, rekomendasi). Tidak ada akses jaringan di sini.
════════════════════════════════════════════════════════════ */

import type { AtkItem, AtkRequest, AtkRestock, CanteenReport, Claim, Plant, TaskDetail, Vehicle, VehicleGateLog } from "../types";
import { isAutoCompleted } from "../types";
import {
  PALETTE, SERIES_COLORS, buckets, dShort, daysBetween, deltaText, metaOf, perWord, prevRange, tr,
  fmtNum, fmtPct, fmtRp, fmtRpShort, parseISO, iso,
  type ChartSpec, type Kpi, type ModuleReport,
} from "./model";

const DOW_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DOW_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dowName = (i: number) => tr(DOW_ID[i], DOW_EN[i]);
const vsPrev = () => tr("vs periode lalu", "vs prior period");
const inRange = (d: string | null | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
const sum = (a: number[]) => a.reduce((s, n) => s + (Number(n) || 0), 0);
function topN<T>(map: Map<T, number>, n: number): [T, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function addTo<K>(m: Map<K, number>, k: K, v: number) { m.set(k, (m.get(k) || 0) + v); }
function emptyModule(key: ModuleReport["key"], msg: string): ModuleReport {
  const meta = metaOf(key);
  return { key, title: meta.title, accent: meta.accent, headline: msg, kpis: [], charts: [], insights: [msg], actions: [], attention: [], empty: true };
}

/* ═══════════════════════ FLEET ═══════════════════════ */

function addMonths(dateStr: string, months: number): string {
  const d = parseISO(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
}

export function computeFleet(p: {
  from: string; to: string; tasks: TaskDetail[]; prevTasks: TaskDetail[];
  vehicles: Vehicle[]; gateLogs: VehicleGateLog[]; showPlants: boolean;
}): ModuleReport {
  const meta = metaOf("fleet");
  const tasks = p.tasks.filter((t) => inRange(t.tanggal, p.from, p.to));
  const activeVehicles = p.vehicles.filter((v) => v.aktif);
  if (tasks.length === 0 && activeVehicles.length === 0) return emptyModule("fleet", tr("Belum ada data penugasan maupun armada pada periode ini.", "No assignment or fleet data for this period."));

  const cancelled = tasks.filter((t) => t.status === "CANCELLED");
  const valid = tasks.filter((t) => t.status !== "CANCELLED");
  const done = valid.filter((t) => t.status === "DONE");
  const auto = done.filter((t) => isAutoCompleted(t));
  const prevValid = p.prevTasks.filter((t) => t.status !== "CANCELLED");
  const completion = valid.length ? (done.length / valid.length) * 100 : 0;
  const cancelRate = tasks.length ? (cancelled.length / tasks.length) * 100 : 0;

  const durations = done
    .filter((t) => t.accepted_at && t.completed_at && !isAutoCompleted(t))
    .map((t) => (new Date(t.completed_at as string).getTime() - new Date(t.accepted_at as string).getTime()) / 60000)
    .filter((m) => m > 0 && m < 24 * 60);
  const avgDur = durations.length ? sum(durations) / durations.length : 0;

  const usedVehicles = new Set(valid.map((t) => t.vehicle_id).filter(Boolean));
  const usedActive = activeVehicles.filter((v) => usedVehicles.has(v.id)).length;
  const util = activeVehicles.length ? (usedActive / activeVehicles.length) * 100 : 0;
  const idle = activeVehicles.filter((v) => !usedVehicles.has(v.id));

  // dokumen armada (KIR 6 bln, STNK 12 bln, Service 6 bln) jatuh tempo ≤ 30 hari dari akhir periode
  const today = iso(new Date());
  const docs: { nopol: string; doc: string; due: string; days: number }[] = [];
  activeVehicles.forEach((v) => {
    const items: [string, string | null | undefined, number][] = [["KIR", v.kir_date, 6], ["STNK", v.stnk_date, 12], ["Service", v.service_date, 6]];
    items.forEach(([doc, last, m]) => {
      if (!last) return;
      const due = addMonths(last, m);
      const days = daysBetween(today, due) - 1;
      if (days <= 30) docs.push({ nopol: v.nopol, doc, due, days });
    });
  });
  docs.sort((a, b) => a.days - b.days);
  const overdue = docs.filter((d) => d.days < 0);

  const vol = deltaText(valid.length, prevValid.length);
  const bs = buckets(p.from, p.to);
  const plants: Plant[] = ["CIK", "PRB"];
  const trendSeries = p.showPlants
    ? plants.map((pl, i) => ({
        name: pl === "CIK" ? "Cikarang" : "Pasar Rebo",
        color: i === 0 ? PALETTE.brand : PALETTE.cyan,
        values: bs.map((b) => valid.filter((t) => t.plant === pl && t.tanggal >= b.from && t.tanggal <= b.to).length),
      }))
    : [{ name: tr("Tugas", "Tasks"), color: PALETTE.brand, values: bs.map((b) => valid.filter((t) => t.tanggal >= b.from && t.tanggal <= b.to).length) }];

  const byJob = new Map<string, number>();
  valid.forEach((t) => addTo(byJob, t.jenis_pekerjaan || tr("Lainnya", "Other"), 1));
  const jobs = topN(byJob, 6);

  const byVehicle = new Map<string, number>();
  valid.forEach((t) => t.kendaraan && addTo(byVehicle, t.kendaraan, 1));
  const topVeh = topN(byVehicle, 5);

  const byDow = new Map<number, number>();
  valid.forEach((t) => addTo(byDow, parseISO(t.tanggal).getDay(), 1));
  const busiest = topN(byDow, 1)[0];
  const weeks = Math.max(1, daysBetween(p.from, p.to) / 7);

  const gateTrips = p.gateLogs.filter((g) => inRange(g.timeOut ?? g.timeIn ?? g.createdAt, p.from, p.to));
  const gateDur = gateTrips
    .filter((g) => g.timeOut && g.timeIn)
    .map((g) => Math.abs(new Date(g.timeIn as string).getTime() - new Date(g.timeOut as string).getTime()) / 60000)
    .filter((m) => m > 0 && m < 24 * 60);

  const kpis: Kpi[] = [
    { label: tr("Total penugasan", "Total assignments"), value: fmtNum(valid.length), sub: vol.pct === null ? vol.text : `${vol.text} ${vsPrev()}`, tone: vol.pct === null ? "neutral" : vol.pct >= 0 ? "good" : "neutral" },
    { label: tr("Tingkat penyelesaian", "Completion rate"), value: fmtPct(completion, 0), sub: `${fmtNum(cancelled.length)} ${tr("dibatalkan", "cancelled")} (${fmtPct(cancelRate, 0)})`, tone: completion >= 90 ? "good" : completion >= 75 ? "neutral" : "bad" },
    { label: tr("Utilisasi armada", "Fleet utilisation"), value: fmtPct(util, 0), sub: tr(`${usedActive} dari ${activeVehicles.length} unit terpakai`, `${usedActive} of ${activeVehicles.length} units used`), tone: util >= 70 ? "good" : util >= 50 ? "neutral" : "bad" },
    { label: tr("Rata-rata durasi tugas", "Avg. task duration"), value: avgDur ? `${fmtNum(avgDur / 60, 1)} ${tr("jam", "hrs")}` : "–", sub: tr("diterima → selesai", "accepted → completed"), tone: "neutral" },
    { label: tr("Dokumen jatuh tempo", "Documents due"), value: fmtNum(docs.length), sub: overdue.length ? tr(`${overdue.length} sudah lewat`, `${overdue.length} overdue`) : tr("≤ 30 hari ke depan", "within the next 30 days"), tone: docs.length ? "bad" : "good" },
  ];

  const charts: ChartSpec[] = [
    { id: "fleet-trend", title: `${tr("Tren penugasan", "Assignment trend")} ${perWord(p.from, p.to)}`, type: p.showPlants ? "stacked" : "bar", labels: bs.map((b) => b.label), series: trendSeries, unit: "num" },
    { id: "fleet-jobs", title: tr("Jenis pekerjaan terbanyak", "Top job types"), type: "hbar", labels: jobs.map((j) => j[0]), series: [{ name: tr("Tugas", "Tasks"), color: PALETTE.brand, values: jobs.map((j) => j[1]) }], unit: "num" },
    { id: "fleet-status", title: tr("Status penugasan", "Assignment status"), type: "donut",
      labels: [tr("Selesai", "Completed"), tr("Ditutup otomatis 17.00", "Auto-closed 17:00"), tr("Belum selesai", "Open"), tr("Dibatalkan", "Cancelled")],
      series: [{ name: tr("Tugas", "Tasks"), color: PALETTE.brand, values: [done.length - auto.length, auto.length, valid.length - done.length, cancelled.length] }], unit: "num",
      colors: [PALETTE.green, PALETTE.amber, PALETTE.brand, PALETTE.red] },
    { id: "fleet-vehicles", title: tr("Kendaraan paling sering dipakai", "Most-used vehicles"), type: "hbar", labels: topVeh.map((v) => v[0]), series: [{ name: tr("Tugas", "Tasks"), color: PALETTE.cyan, values: topVeh.map((v) => v[1]) }], unit: "num" },
  ];

  const insights: string[] = [];
  const busyAvg = busiest ? busiest[1] / weeks : 0;
  const gateAvg = gateDur.length ? sum(gateDur) / gateDur.length / 60 : 0;
  insights.push(tr(
    `${fmtNum(valid.length)} penugasan pada periode ini, ${vol.text}${vol.pct !== null ? ` dibanding periode sebelumnya (${fmtNum(prevValid.length)})` : ""}.`,
    `${fmtNum(valid.length)} assignments this period, ${vol.text}${vol.pct !== null ? ` versus the prior period (${fmtNum(prevValid.length)})` : ""}.`));
  insights.push(tr(
    `Tingkat penyelesaian ${fmtPct(completion, 0)}; ${fmtNum(cancelled.length)} tugas dibatalkan (${fmtPct(cancelRate, 0)} dari total).`,
    `Completion rate ${fmtPct(completion, 0)}; ${fmtNum(cancelled.length)} tasks cancelled (${fmtPct(cancelRate, 0)} of total).`));
  if (busiest && weeks >= 1.5) insights.push(tr(
    `Hari tersibuk adalah ${dowName(busiest[0])} dengan rata-rata ${fmtNum(busyAvg, 1)} tugas per minggu.`,
    `${dowName(busiest[0])} is the busiest day, averaging ${fmtNum(busyAvg, 1)} tasks per week.`));
  else if (busiest) insights.push(tr(
    `Hari tersibuk adalah ${dowName(busiest[0])} dengan ${fmtNum(busiest[1])} tugas.`,
    `${dowName(busiest[0])} was the busiest day with ${fmtNum(busiest[1])} tasks.`));
  if (jobs[0]) insights.push(tr(
    `Jenis pekerjaan dominan: ${jobs[0][0]} (${fmtPct((jobs[0][1] / Math.max(1, valid.length)) * 100, 0)} dari seluruh tugas).`,
    `Dominant job type: ${jobs[0][0]} (${fmtPct((jobs[0][1] / Math.max(1, valid.length)) * 100, 0)} of all tasks).`));
  insights.push(tr(
    `${usedActive} dari ${activeVehicles.length} kendaraan aktif terpakai (${fmtPct(util, 0)})${idle.length ? `; ${idle.length} unit tidak dipakai sama sekali` : ""}.`,
    `${usedActive} of ${activeVehicles.length} active vehicles were used (${fmtPct(util, 0)})${idle.length ? `; ${idle.length} units were not used at all` : ""}.`));
  if (gateTrips.length) insights.push(tr(
    `${fmtNum(gateTrips.length)} pergerakan kendaraan tercatat di gate${gateDur.length ? `, rata-rata ${fmtNum(gateAvg, 1)} jam di luar` : ""}.`,
    `${fmtNum(gateTrips.length)} vehicle movements logged at the gate${gateDur.length ? `, averaging ${fmtNum(gateAvg, 1)} hrs outside` : ""}.`));
  if (auto.length) insights.push(tr(
    `${fmtNum(auto.length)} tugas ditutup otomatis pukul 17.00 karena driver belum menekan "Selesai".`,
    `${fmtNum(auto.length)} tasks were auto-closed at 17:00 because the driver had not tapped "Done".`));
  if (docs.length) insights.push(tr(
    `${fmtNum(docs.length)} dokumen kendaraan (KIR/STNK/Service) jatuh tempo dalam 30 hari${overdue.length ? `, ${overdue.length} di antaranya sudah lewat` : ""}.`,
    `${fmtNum(docs.length)} vehicle documents (KIR/STNK/Service) fall due within 30 days${overdue.length ? `, ${overdue.length} already overdue` : ""}.`));

  const actions: string[] = [];
  const attention: string[] = [];
  if (docs.length) {
    const list = docs.slice(0, 3).map((d) => `${d.doc} ${d.nopol}`).join(", ");
    actions.push(tr(
      `Jadwalkan perpanjangan dokumen armada segera: ${list}${docs.length > 3 ? `, dan ${docs.length - 3} lainnya` : ""}.`,
      `Schedule fleet document renewals now: ${list}${docs.length > 3 ? `, and ${docs.length - 3} more` : ""}.`));
    attention.push(tr(
      `Armada: ${docs.length} dokumen kendaraan jatuh tempo${overdue.length ? ` (${overdue.length} sudah lewat)` : ""}.`,
      `Fleet: ${docs.length} vehicle documents due${overdue.length ? ` (${overdue.length} overdue)` : ""}.`));
  }
  if (activeVehicles.length && util < 60) {
    const idleList = idle.slice(0, 3).map((v) => v.nopol).join(", ");
    actions.push(tr(
      `Utilisasi armada ${fmtPct(util, 0)} — evaluasi kebutuhan unit atau rotasi pemakaian${idle.length ? ` (${idleList} tidak terpakai)` : ""}.`,
      `Fleet utilisation is ${fmtPct(util, 0)} — review unit requirements or rotate usage${idle.length ? ` (${idleList} unused)` : ""}.`));
    attention.push(tr(`Armada: utilisasi hanya ${fmtPct(util, 0)}.`, `Fleet: utilisation only ${fmtPct(util, 0)}.`));
  }
  if (cancelRate > 10) {
    actions.push(tr(
      `Pembatalan ${fmtPct(cancelRate, 0)} cukup tinggi — telusuri penyebab dan perketat konfirmasi permintaan.`,
      `Cancellations at ${fmtPct(cancelRate, 0)} are high — trace the causes and tighten request confirmation.`));
    attention.push(tr(`Armada: pembatalan tugas ${fmtPct(cancelRate, 0)}.`, `Fleet: task cancellations ${fmtPct(cancelRate, 0)}.`));
  }
  if (done.length && auto.length / done.length > 0.1) actions.push(tr(
    `Ingatkan driver menutup tugas di aplikasi; ${fmtPct((auto.length / done.length) * 100, 0)} tugas selesai tercatat otomatis.`,
    `Remind drivers to close tasks in the app; ${fmtPct((auto.length / done.length) * 100, 0)} of completed tasks were closed automatically.`));
  if (actions.length === 0) actions.push(tr("Kinerja armada dalam batas wajar — pertahankan pola penugasan saat ini.", "Fleet performance is within normal range — maintain the current assignment pattern."));

  return {
    key: "fleet", title: meta.title, accent: meta.accent,
    headline: tr(
      `${fmtNum(valid.length)} penugasan (${vol.text}), penyelesaian ${fmtPct(completion, 0)}, utilisasi armada ${fmtPct(util, 0)}.`,
      `${fmtNum(valid.length)} assignments (${vol.text}), ${fmtPct(completion, 0)} completed, fleet utilisation ${fmtPct(util, 0)}.`),
    kpis, charts, insights, actions, attention,
    table: docs.length ? {
      title: tr("Dokumen armada jatuh tempo", "Fleet documents due"),
      headers: [tr("Kendaraan", "Vehicle"), tr("Dokumen", "Document"), tr("Jatuh tempo", "Due date"), tr("Sisa hari", "Days left")],
      rows: docs.slice(0, 10).map((d) => [d.nopol, d.doc, dShort(d.due), d.days < 0 ? tr(`lewat ${-d.days}`, `${-d.days} overdue`) : d.days]),
    } : undefined,
    empty: false,
  };
}

/* ═══════════════════════ KLAIM ═══════════════════════ */

const CLAIM_ID: Record<string, string> = { Gasoline: "Bensin", Toll: "Tol", Parking: "Parkir", Service: "Servis", Maintenance: "Perawatan", Other: "Lainnya" };
const CLAIM_EN: Record<string, string> = { Gasoline: "Fuel", Toll: "Toll", Parking: "Parking", Service: "Service", Maintenance: "Maintenance", Other: "Other" };
const catName = (k: string) => tr(CLAIM_ID[k] || CLAIM_ID.Other, CLAIM_EN[k] || CLAIM_EN.Other);
const CLAIM_COLOR: Record<string, string> = { Gasoline: PALETTE.green, Toll: PALETTE.brand, Parking: PALETTE.amber, Service: PALETTE.red, Maintenance: PALETTE.purple, Other: PALETTE.gray };

export function computeClaims(p: { from: string; to: string; claims: Claim[]; showPlants: boolean }): ModuleReport {
  const meta = metaOf("claims");
  const day = (c: Claim) => (c.periodDate || c.submissionDate || "").slice(0, 10);
  const cur = p.claims.filter((c) => inRange(day(c), p.from, p.to));
  const pr = prevRange(p.from, p.to);
  const prev = p.claims.filter((c) => inRange(day(c), pr.from, pr.to));
  if (cur.length === 0) return emptyModule("claims", tr("Belum ada klaim driver pada periode ini.", "No driver claims for this period."));

  const total = sum(cur.map((c) => c.total));
  const prevTotal = sum(prev.map((c) => c.total));
  const d = deltaText(total, prevTotal);
  const avg = total / cur.length;
  const drivers = new Set(cur.map((c) => c.driver_id));

  const byCat = new Map<string, number>();
  cur.forEach((c) => c.items.forEach((it) => addTo(byCat, CLAIM_ID[it.type] ? it.type : "Other", it.total)));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const topCat = cats[0];

  const byDriver = new Map<string, number>();
  cur.forEach((c) => addTo(byDriver, c.driverName || "-", c.total));
  const topDrv = topN(byDriver, 5);

  const bs = buckets(p.from, p.to);
  const trend = bs.map((b) => sum(cur.filter((c) => day(c) >= b.from && day(c) <= b.to).map((c) => c.total)));
  const peakIdx = trend.indexOf(Math.max(...trend));

  const byPlant = new Map<string, number>();
  cur.forEach((c) => addTo(byPlant, c.plant === "PRB" ? "Pasar Rebo" : "Cikarang", c.total));

  const kpis: Kpi[] = [
    { label: tr("Total klaim", "Total claims"), value: fmtRpShort(total), sub: d.pct === null ? d.text : `${d.text} ${vsPrev()}`, tone: d.pct === null ? "neutral" : d.pct > 10 ? "bad" : d.pct < -2 ? "good" : "neutral" },
    { label: tr("Jumlah pengajuan", "Submissions"), value: fmtNum(cur.length), sub: tr(`${drivers.size} driver mengajukan`, `from ${drivers.size} drivers`), tone: "neutral" },
    { label: tr("Rata-rata per klaim", "Avg. per claim"), value: fmtRpShort(avg), sub: tr("per pengajuan", "per submission"), tone: "neutral" },
    { label: tr("Kategori terbesar", "Largest category"), value: topCat ? catName(topCat[0]) : "–", sub: topCat ? `${fmtPct((topCat[1] / Math.max(1, total)) * 100, 0)} ${tr("dari total", "of total")}` : "", tone: "neutral" },
  ];

  const charts: ChartSpec[] = [
    { id: "claims-cat", title: tr("Komposisi klaim per kategori", "Claims mix by category"), type: "donut", labels: cats.map((c) => catName(c[0])),
      series: [{ name: tr("Nominal", "Amount"), color: PALETTE.green, values: cats.map((c) => c[1]) }], unit: "rp", colors: cats.map((c) => CLAIM_COLOR[c[0]]) },
    { id: "claims-trend", title: `${tr("Tren nominal klaim", "Claim amount trend")} ${perWord(p.from, p.to)}`, type: "bar", labels: bs.map((b) => b.label), series: [{ name: tr("Nominal", "Amount"), color: PALETTE.green, values: trend }], unit: "rp" },
    { id: "claims-drivers", title: tr("5 driver dengan klaim terbesar", "Top 5 drivers by claims"), type: "hbar", labels: topDrv.map((x) => x[0]), series: [{ name: tr("Nominal", "Amount"), color: PALETTE.green, values: topDrv.map((x) => x[1]) }], unit: "rp" },
  ];
  if (p.showPlants && byPlant.size > 1) charts.push({ id: "claims-plant", title: tr("Klaim per plant", "Claims by plant"), type: "donut", labels: [...byPlant.keys()], series: [{ name: tr("Nominal", "Amount"), color: PALETTE.green, values: [...byPlant.values()] }], unit: "rp" });

  const topShare = topDrv[0] ? (topDrv[0][1] / total) * 100 : 0;
  const insights: string[] = [
    tr(`Total klaim ${fmtRp(total)} dari ${fmtNum(cur.length)} pengajuan, ${d.text}${d.pct !== null ? ` dibanding periode sebelumnya (${fmtRpShort(prevTotal)})` : ""}.`,
       `Total claims of ${fmtRp(total)} from ${fmtNum(cur.length)} submissions, ${d.text}${d.pct !== null ? ` versus the prior period (${fmtRpShort(prevTotal)})` : ""}.`),
    topCat ? tr(`${catName(topCat[0])} menjadi pengeluaran terbesar (${fmtPct((topCat[1] / total) * 100, 0)}), disusul ${cats[1] ? `${catName(cats[1][0])} (${fmtPct((cats[1][1] / total) * 100, 0)})` : "kategori lain"}.`,
                `${catName(topCat[0])} is the largest expense (${fmtPct((topCat[1] / total) * 100, 0)}), followed by ${cats[1] ? `${catName(cats[1][0])} (${fmtPct((cats[1][1] / total) * 100, 0)})` : "other categories"}.`) : "",
    topDrv[0] ? tr(`Klaim terbesar diajukan ${topDrv[0][0]}: ${fmtRpShort(topDrv[0][1])} (${fmtPct(topShare, 0)} dari total).`,
                   `Highest claims came from ${topDrv[0][0]}: ${fmtRpShort(topDrv[0][1])} (${fmtPct(topShare, 0)} of total).`) : "",
    tr(`Rata-rata ${fmtRpShort(avg)} per pengajuan; ${drivers.size} driver mengajukan klaim.`,
       `Average of ${fmtRpShort(avg)} per submission; ${drivers.size} drivers submitted claims.`),
    trend.length > 1 && trend[peakIdx] > 0 ? tr(`Puncak pengeluaran terjadi pada ${bs[peakIdx].label} (${fmtRpShort(trend[peakIdx])}).`, `Spending peaked in ${bs[peakIdx].label} (${fmtRpShort(trend[peakIdx])}).`) : "",
    p.showPlants && byPlant.size > 1 ? `${tr("Porsi per plant", "Share by plant")}: ${[...byPlant.entries()].map(([k, v]) => `${k} ${fmtPct((v / total) * 100, 0)}`).join(", ")}.` : "",
  ].filter(Boolean);

  const actions: string[] = [];
  const attention: string[] = [];
  if (d.pct !== null && d.pct > 20) {
    actions.push(tr(`Klaim naik ${fmtNum(d.pct, 0)}% — tinjau kebutuhan perjalanan dan kepatuhan bukti pengeluaran.`,
                    `Claims rose ${fmtNum(d.pct, 0)}% — review travel needs and receipt compliance.`));
    attention.push(tr(`Klaim: naik ${fmtNum(d.pct, 0)}% dibanding periode lalu.`, `Claims: up ${fmtNum(d.pct, 0)}% versus the prior period.`));
  }
  if (topCat && topCat[1] / total > 0.5) actions.push(tr(`${catName(topCat[0])} lebih dari separuh pengeluaran — pertimbangkan kontrol kuota atau kartu BBM/e-toll terpusat.`,
                    `${catName(topCat[0])} makes up over half of spending — consider quota controls or centralised fuel/e-toll cards.`));
  if (topShare > 30 && drivers.size > 2) {
    actions.push(tr(`Klaim terkonsentrasi pada ${topDrv[0][0]} (${fmtPct(topShare, 0)}) — verifikasi rute dan frekuensi tugasnya.`,
                    `Claims are concentrated on ${topDrv[0][0]} (${fmtPct(topShare, 0)}) — verify their routes and task frequency.`));
    attention.push(tr(`Klaim: ${fmtPct(topShare, 0)} dari total berasal dari satu driver.`, `Claims: ${fmtPct(topShare, 0)} of the total comes from a single driver.`));
  }
  if (actions.length === 0) actions.push(tr("Pola klaim wajar — lanjutkan rekap mingguan dan verifikasi bukti secara rutin.", "Claim patterns are normal — continue weekly recaps and routine receipt checks."));

  return {
    key: "claims", title: meta.title, accent: meta.accent,
    headline: tr(
      `Total klaim ${fmtRpShort(total)} (${d.text}); ${topCat ? `${catName(topCat[0])} terbesar ${fmtPct((topCat[1] / total) * 100, 0)}` : ""}.`,
      `Total claims ${fmtRpShort(total)} (${d.text}); ${topCat ? `${catName(topCat[0])} largest at ${fmtPct((topCat[1] / total) * 100, 0)}` : ""}.`),
    kpis, charts, insights, actions, attention,
    table: { title: tr("Rekap per kategori", "Summary by category"), headers: [tr("Kategori", "Category"), tr("Nominal", "Amount"), tr("Porsi", "Share")], rows: cats.map((c) => [catName(c[0]), fmtRp(c[1]), fmtPct((c[1] / total) * 100, 1)]) },
    empty: false,
  };
}

/* ═══════════════════════ KANTIN ═══════════════════════ */

export function computeCanteen(p: { from: string; to: string; rows: CanteenReport[] }): ModuleReport {
  const meta = metaOf("canteen");
  const cur = p.rows.filter((r) => inRange(r.reportDate, p.from, p.to)).sort((a, b) => (a.reportDate < b.reportDate ? -1 : 1));
  const pr = prevRange(p.from, p.to);
  const prev = p.rows.filter((r) => inRange(r.reportDate, pr.from, pr.to));
  if (cur.length === 0) return emptyModule("canteen", tr("Belum ada laporan kantin pada periode ini.", "No canteen reports for this period."));

  const agg = (rows: CanteenReport[]) => {
    const so = sum(rows.flatMap((r) => r.snackOrder)), sl = sum(rows.flatMap((r) => r.snackLeftover));
    const mo = sum(rows.flatMap((r) => r.mealOrder)), ml = sum(rows.flatMap((r) => r.mealLeftover));
    return { so, sl, mo, ml, sEff: so ? ((so - sl) / so) * 100 : 0, mEff: mo ? ((mo - ml) / mo) * 100 : 0 };
  };
  const A = agg(cur), P = agg(prev);
  const sDelta = prev.length && P.so ? A.sEff - P.sEff : null;
  const mDelta = prev.length && P.mo ? A.mEff - P.mEff : null;
  const days = cur.length;

  // Snack & makan selalu dihitung terpisah — tidak digabung.
  const shiftOf = (pick: "snack" | "meal") => [0, 1, 2].map((i) => ({
    order: sum(cur.map((r) => (pick === "snack" ? r.snackOrder[i] : r.mealOrder[i]) || 0)),
    left: sum(cur.map((r) => (pick === "snack" ? r.snackLeftover[i] : r.mealLeftover[i]) || 0)),
  }));
  const sShift = shiftOf("snack"), mShift = shiftOf("meal");
  const worstOf = (sh: { left: number }[]) => sh.reduce((b, x, i) => (x.left > sh[b].left ? i : b), 0);
  const sWorst = worstOf(sShift), mWorst = worstOf(mShift);
  const worstDayOf = (pick: "snack" | "meal") => cur.reduce((b, r) => {
    const l = sum(pick === "snack" ? r.snackLeftover : r.mealLeftover);
    return l > b.l ? { d: r.reportDate, l } : b;
  }, { d: cur[0].reportDate, l: -1 });
  const sDay = worstDayOf("snack"), mDay = worstDayOf("meal");

  const bs = buckets(p.from, p.to);
  const effBy = (pick: "snack" | "meal") => bs.map((b) => {
    const rows = cur.filter((r) => r.reportDate >= b.from && r.reportDate <= b.to);
    const o = sum(rows.flatMap((r) => (pick === "snack" ? r.snackOrder : r.mealOrder)));
    const l = sum(rows.flatMap((r) => (pick === "snack" ? r.snackLeftover : r.mealLeftover)));
    return o ? Math.round(((o - l) / o) * 1000) / 10 : 0;
  });

  const effTone = (e: number): Kpi["tone"] => (e >= 95 ? "good" : e >= 90 ? "neutral" : "bad");
  const deltaTxt = (d: number | null) => (d === null ? "" : ` · ${d >= 0 ? "+" : ""}${fmtNum(d, 1)} ${tr("poin", "pts")} ${vsPrev()}`);
  const kpis: Kpi[] = [
    { label: tr("Snack — efisiensi", "Snack — efficiency"), value: A.so ? fmtPct(A.sEff, 1) : "–",
      sub: tr(`dipesan ${fmtNum(A.so)} · terpakai ${fmtNum(A.so - A.sl)} · sisa ${fmtNum(A.sl)}`, `ordered ${fmtNum(A.so)} · consumed ${fmtNum(A.so - A.sl)} · leftover ${fmtNum(A.sl)}`) + deltaTxt(sDelta),
      tone: A.so ? effTone(A.sEff) : "neutral" },
    { label: tr("Makan — efisiensi", "Meal — efficiency"), value: A.mo ? fmtPct(A.mEff, 1) : "–",
      sub: tr(`dipesan ${fmtNum(A.mo)} · terpakai ${fmtNum(A.mo - A.ml)} · sisa ${fmtNum(A.ml)}`, `ordered ${fmtNum(A.mo)} · consumed ${fmtNum(A.mo - A.ml)} · leftover ${fmtNum(A.ml)}`) + deltaTxt(mDelta),
      tone: A.mo ? effTone(A.mEff) : "neutral" },
    { label: tr("Sisa snack / makan", "Snack / meal leftover"), value: `${fmtNum(A.sl)} / ${fmtNum(A.ml)}`,
      sub: tr(`porsi · rata-rata ${fmtNum(A.sl / days, 1)} / ${fmtNum(A.ml / days, 1)} per hari`, `portions · avg. ${fmtNum(A.sl / days, 1)} / ${fmtNum(A.ml / days, 1)} per day`), tone: "neutral" },
    { label: tr("Hari tercatat", "Days recorded"), value: fmtNum(days), sub: tr("laporan harian kantin", "daily canteen reports"), tone: "neutral" },
  ];

  const charts: ChartSpec[] = [
    { id: "canteen-eff", title: `${tr("Efisiensi snack & makan", "Snack & meal efficiency")} ${perWord(p.from, p.to)} (%)`, type: "line", labels: bs.map((b) => b.label),
      series: [{ name: "Snack", color: PALETTE.green, values: effBy("snack") }, { name: tr("Makan", "Meals"), color: PALETTE.brand, values: effBy("meal") }], unit: "pct" },
    { id: "canteen-shift", title: tr("Sisa per shift — snack & makan", "Leftover by shift — snack & meal"), type: "bar", labels: ["Shift 1", "Shift 2", "Shift 3"],
      series: [{ name: tr("Sisa snack", "Snack leftover"), color: PALETTE.green, values: sShift.map((x) => x.left) },
               { name: tr("Sisa makan", "Meal leftover"), color: PALETTE.brand, values: mShift.map((x) => x.left) }], unit: "num" },
    { id: "canteen-mix", title: tr("Dipesan vs terpakai", "Ordered vs consumed"), type: "stacked", labels: ["Snack", tr("Makan", "Meals")],
      series: [{ name: tr("Terpakai", "Consumed"), color: PALETTE.green, values: [A.so - A.sl, A.mo - A.ml] }, { name: tr("Sisa", "Leftover"), color: PALETTE.red, values: [A.sl, A.ml] }], unit: "num" },
  ];

  const catLine = (idName: string, enName: string, o: number, l: number, eff: number, d: number | null) =>
    tr(`${idName}: ${fmtNum(o - l)} dari ${fmtNum(o)} porsi terpakai, sisa ${fmtNum(l)} — efisiensi ${fmtPct(eff, 1)}${d !== null ? `, ${d >= 0 ? "membaik" : "menurun"} ${fmtNum(Math.abs(d), 1)} poin dari periode lalu` : ""}.`,
       `${enName}: ${fmtNum(o - l)} of ${fmtNum(o)} portions consumed, ${fmtNum(l)} left over — efficiency ${fmtPct(eff, 1)}${d !== null ? `, ${d >= 0 ? "up" : "down"} ${fmtNum(Math.abs(d), 1)} pts from the prior period` : ""}.`);
  const shiftLine = (idName: string, enName: string, sh: { order: number; left: number }[], w: number, day: { d: string; l: number }) =>
    sh[w].left > 0
      ? tr(`Sisa ${idName} terbanyak di Shift ${w + 1} (${fmtNum(sh[w].left)} porsi, ${fmtPct((sh[w].left / Math.max(1, sh[w].order)) * 100, 1)} dari pesanannya); tertinggi pada ${dShort(day.d)} (${fmtNum(day.l)} porsi).`,
           `Most ${enName} leftovers on Shift ${w + 1} (${fmtNum(sh[w].left)} portions, ${fmtPct((sh[w].left / Math.max(1, sh[w].order)) * 100, 1)} of its orders); peak on ${dShort(day.d)} (${fmtNum(day.l)} portions).`)
      : tr(`Tidak ada sisa ${idName} pada periode ini.`, `No ${enName} leftovers this period.`);
  const insights = [
    catLine("Snack", "Snack", A.so, A.sl, A.sEff, sDelta),
    catLine("Makan", "Meals", A.mo, A.ml, A.mEff, mDelta),
    shiftLine("snack", "snack", sShift, sWorst, sDay),
    shiftLine("makan", "meal", mShift, mWorst, mDay),
  ];
  const actions: string[] = [];
  const attention: string[] = [];
  if (A.so && A.sEff < 92) {
    actions.push(tr(`Sesuaikan jumlah pesanan snack, terutama Shift ${sWorst + 1}, berdasarkan rata-rata kehadiran.`,
                    `Align snack order quantities with average attendance, especially for Shift ${sWorst + 1}.`));
    attention.push(tr(`Kantin snack: efisiensi ${fmtPct(A.sEff, 1)} — sisa ${fmtNum(A.sl)} porsi.`, `Canteen snack: efficiency ${fmtPct(A.sEff, 1)} — ${fmtNum(A.sl)} portions left over.`));
  }
  if (A.mo && A.mEff < 92) {
    actions.push(tr(`Sesuaikan jumlah pesanan makan, terutama Shift ${mWorst + 1}, berdasarkan rata-rata kehadiran.`,
                    `Align meal order quantities with average attendance, especially for Shift ${mWorst + 1}.`));
    attention.push(tr(`Kantin makan: efisiensi ${fmtPct(A.mEff, 1)} — sisa ${fmtNum(A.ml)} porsi.`, `Canteen meals: efficiency ${fmtPct(A.mEff, 1)} — ${fmtNum(A.ml)} portions left over.`));
  }
  if ((sDelta !== null && sDelta < -2) || (mDelta !== null && mDelta < -2)) actions.push(tr("Efisiensi menurun — cek perubahan menu atau jadwal kerja yang memengaruhi kehadiran.", "Efficiency is falling — check menu changes or work schedules affecting attendance."));
  if (actions.length === 0) actions.push(tr("Efisiensi snack & makan sangat baik — pertahankan pola pemesanan saat ini.", "Snack & meal efficiency is excellent — keep the current ordering pattern."));

  const pctOf = (o: number, l: number) => fmtPct(o ? ((o - l) / o) * 100 : 0, 1);
  return {
    key: "canteen", title: meta.title, accent: meta.accent,
    headline: tr(`Snack ${fmtPct(A.sEff, 1)} (sisa ${fmtNum(A.sl)} porsi) · Makan ${fmtPct(A.mEff, 1)} (sisa ${fmtNum(A.ml)} porsi).`,
                 `Snack ${fmtPct(A.sEff, 1)} (${fmtNum(A.sl)} left over) · Meals ${fmtPct(A.mEff, 1)} (${fmtNum(A.ml)} left over).`),
    kpis, charts, insights, actions, attention,
    table: {
      title: tr("Ringkasan per shift — snack & makan", "Summary by shift — snack & meal"),
      headers: ["Shift", tr("Sisa snack", "Snack leftover"), tr("Efisiensi snack", "Snack eff."), tr("Sisa makan", "Meal leftover"), tr("Efisiensi makan", "Meal eff.")],
      rows: [
        ...[0, 1, 2].map((i) => [`Shift ${i + 1}`, fmtNum(sShift[i].left), pctOf(sShift[i].order, sShift[i].left), fmtNum(mShift[i].left), pctOf(mShift[i].order, mShift[i].left)]),
        ["Total", fmtNum(A.sl), pctOf(A.so, A.sl), fmtNum(A.ml), pctOf(A.mo, A.ml)],
      ],
    },
    empty: false,
  };
}

/* ═══════════════════════ ATK ═══════════════════════ */

export function computeAtk(p: { from: string; to: string; requests: AtkRequest[]; prevRequests: AtkRequest[]; restocks: AtkRestock[]; items: AtkItem[] }): ModuleReport {
  const meta = metaOf("atk");
  const cur = p.requests.filter((r) => inRange(r.tanggal, p.from, p.to));
  if (cur.length === 0 && p.items.length === 0) return emptyModule("atk", tr("Belum ada data ATK pada periode ini.", "No office supplies data for this period."));

  const qty = sum(cur.map((r) => r.jumlah));
  const prevQty = sum(p.prevRequests.map((r) => r.jumlah));
  const d = deltaText(qty, prevQty);
  const tx = new Set(cur.map((r) => r.requestId || r.id)).size;
  const restockQty = sum(p.restocks.filter((r) => inRange(r.tanggal, p.from, p.to)).map((r) => r.jumlah));

  const byItem = new Map<string, number>();
  cur.forEach((r) => addTo(byItem, r.namaBarang, r.jumlah));
  const topItems = topN(byItem, 8);
  const byDept = new Map<string, number>();
  cur.forEach((r) => addTo(byDept, r.departemen || tr("Lainnya", "Other"), r.jumlah));
  const depts = topN(byDept, 6);

  const days = daysBetween(p.from, p.to);
  const usageByCode = new Map<string, number>();
  cur.forEach((r) => addTo(usageByCode, r.kodeBarang, r.jumlah));
  const critical = p.items
    .map((it) => {
      const daily = (usageByCode.get(it.kodeBarang) || 0) / days;
      const cover = daily > 0 ? it.stok / daily : Infinity;
      return { it, daily, cover };
    })
    .filter((x) => x.it.stok <= 0 || x.cover < 14)
    .sort((a, b) => a.cover - b.cover);

  const bs = buckets(p.from, p.to);
  const trend = bs.map((b) => sum(cur.filter((r) => r.tanggal >= b.from && r.tanggal <= b.to).map((r) => r.jumlah)));

  const kpis: Kpi[] = [
    { label: tr("Unit ATK keluar", "Units issued"), value: fmtNum(qty), sub: d.pct === null ? d.text : `${d.text} ${vsPrev()}`, tone: d.pct === null ? "neutral" : d.pct > 20 ? "bad" : "neutral" },
    { label: tr("Jumlah permintaan", "Requests"), value: fmtNum(tx), sub: `${byDept.size} ${tr("departemen", "departments")}`, tone: "neutral" },
    { label: tr("Unit restock masuk", "Units restocked"), value: fmtNum(restockQty), sub: qty ? `${tr("rasio masuk/keluar", "in/out ratio")} ${fmtNum(restockQty / qty, 2)}` : "", tone: "neutral" },
    { label: tr("Item stok kritis", "Critical stock items"), value: fmtNum(critical.length), sub: tr("habis / cukup < 14 hari", "out / under 14 days' cover"), tone: critical.length ? "bad" : "good" },
  ];

  const charts: ChartSpec[] = [
    { id: "atk-items", title: tr("Item paling banyak diminta", "Most-requested items"), type: "hbar", labels: topItems.map((x) => x[0]), series: [{ name: tr("Unit", "Units"), color: PALETTE.purple, values: topItems.map((x) => x[1]) }], unit: "num" },
    { id: "atk-dept", title: tr("Pemakaian per departemen", "Usage by department"), type: "donut", labels: depts.map((x) => x[0]), series: [{ name: tr("Unit", "Units"), color: PALETTE.purple, values: depts.map((x) => x[1]) }], unit: "num" },
    { id: "atk-trend", title: `${tr("Tren unit keluar", "Units issued trend")} ${perWord(p.from, p.to)}`, type: "bar", labels: bs.map((b) => b.label), series: [{ name: tr("Unit", "Units"), color: PALETTE.purple, values: trend }], unit: "num" },
  ];

  const insights = [
    tr(`${fmtNum(qty)} unit ATK keluar dari ${fmtNum(tx)} permintaan, ${d.text}${d.pct !== null ? ` dibanding periode sebelumnya (${fmtNum(prevQty)} unit)` : ""}.`,
       `${fmtNum(qty)} units issued across ${fmtNum(tx)} requests, ${d.text}${d.pct !== null ? ` versus the prior period (${fmtNum(prevQty)} units)` : ""}.`),
    topItems[0] ? tr(`Item paling banyak diminta: ${topItems[0][0]} (${fmtNum(topItems[0][1])} unit, ${fmtPct((topItems[0][1] / Math.max(1, qty)) * 100, 0)} dari total).`,
                     `Most-requested item: ${topItems[0][0]} (${fmtNum(topItems[0][1])} units, ${fmtPct((topItems[0][1] / Math.max(1, qty)) * 100, 0)} of total).`) : "",
    depts[0] ? tr(`${depts[0][0]} departemen pemakai terbesar (${fmtPct((depts[0][1] / Math.max(1, qty)) * 100, 0)}).`,
                  `${depts[0][0]} is the largest consuming department (${fmtPct((depts[0][1] / Math.max(1, qty)) * 100, 0)}).`) : "",
    tr(`Restock ${fmtNum(restockQty)} unit${qty ? ` — ${restockQty >= qty ? "mencukupi" : "lebih kecil dari"} pemakaian periode ini` : ""}.`,
       `${fmtNum(restockQty)} units restocked${qty ? ` — ${restockQty >= qty ? "enough to cover" : "less than"} this period's usage` : ""}.`),
    critical.length
      ? `${critical.length} ${tr("item stok kritis", "critical stock items")}: ${critical.slice(0, 3).map((c) => `${c.it.namaBarang} (${c.it.stok} ${c.it.satuan || "unit"})`).join(", ")}.`
      : tr("Tidak ada item dengan stok kritis.", "No items at critical stock."),
  ].filter(Boolean);

  const actions: string[] = [];
  const attention: string[] = [];
  if (critical.length) {
    const crit3 = critical.slice(0, 3).map((c) => c.it.namaBarang).join(", ");
    actions.push(tr(`Lakukan pengadaan untuk ${critical.length} item stok kritis, prioritaskan ${crit3}.`,
                    `Procure ${critical.length} critical stock items, prioritising ${crit3}.`));
    attention.push(tr(`ATK: ${critical.length} item stok kritis.`, `Supplies: ${critical.length} items at critical stock.`));
  }
  if (d.pct !== null && d.pct > 25) {
    actions.push(tr(`Pemakaian naik ${fmtNum(d.pct, 0)}% — tinjau kuota per departemen.`, `Usage rose ${fmtNum(d.pct, 0)}% — review department quotas.`));
    attention.push(tr(`ATK: pemakaian naik ${fmtNum(d.pct, 0)}%.`, `Supplies: usage up ${fmtNum(d.pct, 0)}%.`));
  }
  if (depts[0] && depts[0][1] / Math.max(1, qty) > 0.4) actions.push(tr(`Konfirmasi kebutuhan ${depts[0][0]} yang menyerap ${fmtPct((depts[0][1] / qty) * 100, 0)} pemakaian.`,
                                                                       `Confirm the needs of ${depts[0][0]}, which consumes ${fmtPct((depts[0][1] / qty) * 100, 0)} of usage.`));
  if (actions.length === 0) actions.push(tr("Pemakaian dan stok ATK terkendali — lanjutkan pemantauan stok mingguan.", "Supplies usage and stock are under control — continue weekly stock monitoring."));

  return {
    key: "atk", title: meta.title, accent: meta.accent,
    headline: tr(`${fmtNum(qty)} unit keluar (${d.text}); ${critical.length ? `${critical.length} item stok kritis` : "stok aman"}.`,
                 `${fmtNum(qty)} units issued (${d.text}); ${critical.length ? `${critical.length} critical stock items` : "stock is healthy"}.`),
    kpis, charts, insights, actions, attention,
    table: critical.length ? {
      title: tr("Item stok kritis", "Critical stock items"),
      headers: ["Item", tr("Stok", "Stock"), tr("Pemakaian/hari", "Usage/day"), tr("Cukup untuk", "Cover")],
      rows: critical.slice(0, 10).map((c) => [c.it.namaBarang, `${c.it.stok} ${c.it.satuan}`, fmtNum(c.daily, 1),
        c.it.stok <= 0 ? tr("habis", "out of stock") : c.cover === Infinity ? "–" : `${fmtNum(c.cover, 0)} ${tr("hari", "days")}`]),
    } : undefined,
    empty: false,
  };
}

export { SERIES_COLORS };
