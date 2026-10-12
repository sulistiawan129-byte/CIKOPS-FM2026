/* LAPORAN MANAJEMEN — ambil data sesuai modul & periode, lalu hitung. */

import {
  getAllCanteenReports, getAllVehiclesFull, getAtkItems, getAtkRequests, getAtkRestocks,
  getClaims, getTasksByRange, getVehicleGateLogs,
} from "../api";
import type { Plant } from "../types";
import { computeAtk, computeCanteen, computeClaims, computeFleet } from "./compute";
import {
  periodLabelOf, prevRange, setGranularity, setReportLang, tr,
  type Granularity, type MgmtReport, type ModuleKey, type ModuleReport, type ReportLang,
} from "./model";

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

  for (const key of p.modules) {
    if (key === "fleet") {
      const [tasks, prevTasks, vehicles, gateLogs] = await Promise.all([
        safe(() => getTasksByRange(p.from, p.to, p.plant), []),
        safe(() => getTasksByRange(prev.from, prev.to, p.plant), []),
        safe(() => getAllVehiclesFull(p.plant), []),
        safe(() => getVehicleGateLogs({ plant: p.plant, dateFrom: p.from, dateTo: p.to }), []),
      ]);
      use();
      out.push(computeFleet({ from: p.from, to: p.to, tasks, prevTasks, vehicles, gateLogs, showPlants }));
    } else if (key === "claims") {
      const claims = await safe(() => getClaims(p.plant), []);
      use();
      out.push(computeClaims({ from: p.from, to: p.to, claims, showPlants }));
    } else if (key === "canteen") {
      const rows = await safe(() => getAllCanteenReports(), []);
      use();
      out.push(computeCanteen({ from: p.from, to: p.to, rows }));
    } else if (key === "atk") {
      const [requests, prevRequests, restocks, items] = await Promise.all([
        safe(() => getAtkRequests({ dateFrom: p.from, dateTo: p.to }), []),
        safe(() => getAtkRequests({ dateFrom: prev.from, dateTo: prev.to }), []),
        safe(() => getAtkRestocks({ dateFrom: p.from, dateTo: p.to }), []),
        safe(() => getAtkItems(), []),
      ]);
      use();
      out.push(computeAtk({ from: p.from, to: p.to, requests, prevRequests, restocks, items }));
    }
  }

  use();
  const now = new Date();
  const loc = lang === "en" ? "en-GB" : "id-ID";
  return {
    lang,
    granularity: p.granularity || "auto",
    title: tr("Laporan Manajemen", "Management Report"),
    company: "PT Frisian Flag Indonesia",
    periodLabel: periodLabelOf(p.from, p.to),
    prevLabel: periodLabelOf(prev.from, prev.to),
    from: p.from,
    to: p.to,
    scopeLabel: p.plant === "PRB" ? "Plant Pasar Rebo" : p.plant === "CIK" ? "Plant Cikarang" : tr("Semua plant", "All plants"),
    generatedAt: now.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" }) + " " + now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":"),
    generatedBy: p.generatedBy,
    modules: out,
  };
}

export function reportFilename(r: MgmtReport): string {
  return r.lang === "en" ? `Management_Report_${r.from}_to_${r.to}` : `Laporan_Manajemen_${r.from}_sd_${r.to}`;
}
