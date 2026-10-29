/* LAPORAN MANAJEMEN — ambil data sesuai modul & periode, lalu hitung. */

import {
  getAllCanteenReports, getAllVehiclesFull, getAtkItems, getAtkRequests, getAtkRestocks,
  getClaims, getTasksByRange, getVehicleGateLogs,
} from "../api";
import type { Plant } from "../types";
import { computeAtk, computeCanteen, computeClaims, computeFleet } from "./compute";
import { computeSecurity } from "./security";
import { computeGa } from "./ga";
import { getGaEvents, getGaImprovements, getGaInventory, getGaPlan, getGaTga } from "../ga/api";
import { atkTrend, canteenTrend, claimsTrend, fleetTrend } from "./trend";
import { fetchGcCases, getSecurityConfig, getSecurityMonths } from "../security/api";
import { DEFAULT_KHUSUS, monthKeyOf } from "../security/model";
import {
  periodLabelOf, prevRange, setGranularity, setReportLang, tr, trendMonths,
  type Granularity, type MgmtReport, type ModuleKey, type ModuleReport, type ReportLang,
} from "./model";
import { BRAND, plantFull } from "../brand";

export async function buildMgmtReport(p: {
  modules: ModuleKey[];
  from: string;
  to: string;
  plant: Plant | null;
  generatedBy: string;
  lang?: ReportLang;
  granularity?: Granularity;
}): Promise<MgmtReport> {
  const lang: ReportLang = p.lang === "en" ? "en" : "id";
  // status bahasa/granularitas dipasang ulang setelah setiap await (lihat use())
  const use = () => { setReportLang(lang); setGranularity(p.granularity || "auto"); };
  use();
  const prev = prevRange(p.from, p.to);
  const showPlants = !p.plant;
  const out: ModuleReport[] = [];
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };
  // jendela data: periode, periode pembanding, dan 13 bulan untuk grafik tren
  const months = trendMonths(p.to, 13);
  const winFrom = [p.from, prev.from, months[0].from].sort()[0];
  const inR = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;

  for (const key of p.modules) {
    if (key === "fleet") {
      const [allTasks, vehicles, gateLogs] = await Promise.all([
        safe(() => getTasksByRange(winFrom, p.to, p.plant), []),
        safe(() => getAllVehiclesFull(p.plant), []),
        safe(() => getVehicleGateLogs({ plant: p.plant, dateFrom: p.from, dateTo: p.to }), []),
      ]);
      use();
      const tasks = allTasks.filter((t) => inR(t.tanggal, p.from, p.to));
      const prevTasks = allTasks.filter((t) => inR(t.tanggal, prev.from, prev.to));
      out.push(fleetTrend(computeFleet({ from: p.from, to: p.to, tasks, prevTasks, vehicles, gateLogs, showPlants }), months, allTasks));
    } else if (key === "claims") {
      const claims = await safe(() => getClaims(p.plant), []);
      use();
      out.push(claimsTrend(computeClaims({ from: p.from, to: p.to, claims, showPlants }), months, claims));
    } else if (key === "canteen") {
      const rows = await safe(() => getAllCanteenReports(), []);
      use();
      out.push(canteenTrend(computeCanteen({ from: p.from, to: p.to, rows }), months, rows));
    } else if (key === "atk") {
      const [allReq, restocks, items] = await Promise.all([
        safe(() => getAtkRequests({ dateFrom: winFrom, dateTo: p.to }), []),
        safe(() => getAtkRestocks({ dateFrom: p.from, dateTo: p.to }), []),
        safe(() => getAtkItems(), []),
      ]);
      use();
      const requests = allReq.filter((r) => inR(r.tanggal, p.from, p.to));
      const prevRequests = allReq.filter((r) => inR(r.tanggal, prev.from, prev.to));
      out.push(atkTrend(computeAtk({ from: p.from, to: p.to, requests, prevRequests, restocks, items }), months, allReq));
    } else if (key === "ga") {
      const [plan, tga, events, imps, inv] = await Promise.all([
        safe(() => getGaPlan(winFrom, p.to), []),
        safe(() => getGaTga(), []),
        safe(() => getGaEvents(), []),
        safe(() => getGaImprovements(), []),
        safe(() => getGaInventory(), []),
      ]);
      use();
      const t = new Date();
      const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      out.push(computeGa({ from: p.from, to: p.to, prevFrom: prev.from, prevTo: prev.to, today, months, plan, tga, events, imps, inv }));
    } else if (key === "security") {
      const [rows, cfg, gc] = await Promise.all([
        safe(() => getSecurityMonths(monthKeyOf(winFrom), monthKeyOf(p.to)), {}),
        safe(() => getSecurityConfig(), { khusus: DEFAULT_KHUSUS, driverNames: {} }),
        fetchGcCases(winFrom, p.to),
      ]);
      use();
      out.push(...computeSecurity({ from: p.from, to: p.to, months, rows, gc, khusus: cfg.khusus, driverNames: cfg.driverNames }));
    }
  }

  use();
  const now = new Date();
  const loc = lang === "en" ? "en-GB" : "id-ID";
  return {
    lang,
    granularity: p.granularity || "auto",
    title: tr("Laporan Manajemen", "Management Report"),
    company: BRAND.company,
    periodLabel: periodLabelOf(p.from, p.to),
    prevLabel: periodLabelOf(prev.from, prev.to),
    from: p.from,
    to: p.to,
    scopeLabel: p.plant === "PRB" || p.plant === "CIK" ? plantFull(p.plant) : tr("Semua plant", "All plants"),
    generatedAt: now.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" }) + " " + now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":"),
    generatedBy: p.generatedBy,
    modules: out,
  };
}

export function reportFilename(r: MgmtReport): string {
  return r.lang === "en" ? `Management_Report_${r.from}_to_${r.to}` : `Laporan_Manajemen_${r.from}_sd_${r.to}`;
}
