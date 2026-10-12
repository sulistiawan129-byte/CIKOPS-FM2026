/* LAPORAN MANAJEMEN — tren 13 bulan untuk modul Fleet, Klaim, Kantin, ATK.
   Grafik tren dipasang sebagai grafik pertama (tampil di PDF/PPT), dan satu
   kalimat tren disisipkan di temuan utama. */

import type { AtkRequest, CanteenReport, Claim, TaskDetail } from "../types";
import { PALETTE, fmtNum, fmtPct, fmtRpShort, tr, trendChart, trendSentence, type ModuleReport, type MonthSlot } from "./model";

const inM = (d: string | null | undefined, m: MonthSlot) => !!d && d.slice(0, 10) >= m.from && d.slice(0, 10) <= m.to;
const sum = (a: number[]) => a.reduce((s, n) => s + (Number(n) || 0), 0);

/** Sisipkan grafik tren di urutan pertama. `swapFirst`: grafik lama nomor 1 dipindah ke nomor 3
 *  (dipakai Fleet & Kantin supaya grafik komposisi tetap tampil di PDF/PPT). */
function attach(r: ModuleReport, chart: ReturnType<typeof trendChart>, sentence: string, swapFirst: boolean): ModuleReport {
  if (r.empty) return r;
  const c = r.charts;
  const charts = swapFirst && c.length >= 2 ? [chart, c[1], c[0], ...c.slice(2)] : [chart, ...c];
  const insights = [...r.insights];
  if (sentence) insights.splice(1, 0, sentence);
  return { ...r, charts, insights };
}

export function fleetTrend(r: ModuleReport, months: MonthSlot[], tasks: TaskDetail[]): ModuleReport {
  const vals = months.map((m) => tasks.filter((t) => t.status !== "CANCELLED" && inM(t.tanggal, m)).length);
  const chart = trendChart({ id: "fleet-trend13", title: tr("Penugasan per bulan — 13 bulan", "Assignments per month — 13 months"), months, unit: "num", goodUp: null,
    series: [{ name: tr("Tugas", "Tasks"), values: vals, color: PALETTE.brand }] });
  return attach(r, chart, trendSentence(tr("penugasan", "assignments"), vals, months, (n) => fmtNum(n)), true);
}

export function claimsTrend(r: ModuleReport, months: MonthSlot[], claims: Claim[]): ModuleReport {
  const day = (c: Claim) => (c.periodDate || c.submissionDate || "").slice(0, 10);
  const vals = months.map((m) => sum(claims.filter((c) => inM(day(c), m)).map((c) => c.total)));
  const chart = trendChart({ id: "claims-trend13", title: tr("Nominal klaim per bulan — 13 bulan", "Claim amount per month — 13 months"), months, unit: "rp", goodUp: false,
    series: [{ name: tr("Nominal", "Amount"), values: vals, color: PALETTE.green }] });
  return attach(r, chart, trendSentence(tr("total klaim", "total claims"), vals, months, fmtRpShort), false);
}

export function canteenTrend(r: ModuleReport, months: MonthSlot[], rows: CanteenReport[]): ModuleReport {
  const vals = months.map((m) => {
    const rs = rows.filter((x) => inM(x.reportDate, m));
    const o = sum(rs.flatMap((x) => [...x.snackOrder, ...x.mealOrder]));
    const l = sum(rs.flatMap((x) => [...x.snackLeftover, ...x.mealLeftover]));
    return o ? Math.round(((o - l) / o) * 1000) / 10 : null;
  });
  const chart = trendChart({ id: "canteen-trend13", title: tr("Efisiensi kantin per bulan — 13 bulan (%)", "Canteen efficiency per month — 13 months (%)"), months, unit: "pct", goodUp: true,
    series: [{ name: tr("Efisiensi", "Efficiency"), values: vals, color: PALETTE.amber }] });
  return attach(r, chart, trendSentence(tr("efisiensi", "efficiency"), vals, months, (n) => fmtPct(n, 1)), true);
}

export function atkTrend(r: ModuleReport, months: MonthSlot[], requests: AtkRequest[]): ModuleReport {
  const vals = months.map((m) => sum(requests.filter((x) => inM(x.tanggal, m)).map((x) => x.jumlah)));
  const chart = trendChart({ id: "atk-trend13", title: tr("Unit ATK keluar per bulan — 13 bulan", "Supplies issued per month — 13 months"), months, unit: "num", goodUp: null,
    series: [{ name: tr("Unit", "Units"), values: vals, color: PALETTE.purple }] });
  return attach(r, chart, trendSentence(tr("unit keluar", "units issued"), vals, months, (n) => fmtNum(n)), false);
}
