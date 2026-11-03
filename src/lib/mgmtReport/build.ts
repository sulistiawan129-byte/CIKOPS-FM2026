/* LAPORAN MANAJEMEN — ambil data sesuai modul & periode, lalu hitung. */

import {
  getAllCanteenReports, getAllVehiclesFull, getAtkItems, getAtkRequests, getAtkRestocks,
  getClaims, getTasksByRange, getVehicleGateLogs,
} from "../api";
import type { Plant } from "../types";
import { computeAtk, computeCanteen, computeClaims, computeFleet } from "./compute";
import { computeSecurity } from "./security";
import { computeGa } from "./ga";
import { getGaEvents, getGaImprovements, getGaInventory, getGaPlan } from "../ga/api";
import { tgaAllActivities } from "../tga/api";
import { computeTga } from "./tga";
import { computeReceptionist } from "./receptionist";
import { getBookings, getParcels, getRcpSettings, getWifiCapacity, getWifiGrants } from "../receptionist/api";
import { DEFAULT_SETTINGS, toMin } from "../receptionist/model";
import { atkTrend, canteenTrend, claimsTrend, fleetTrend } from "./trend";
import { fetchGcCases, getSecurityConfig, getSecurityMonths } from "../security/api";
import { DEFAULT_KHUSUS, monthKeyOf } from "../security/model";
import { assessData, buildNote, type Assessment } from "./notes";
import {
  dShort, iso, periodLabelOf, prevRange, setComparable, setDataStart, setGranularity, setReportLang, tr, trendMonths,
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
  // periode yang masih berjalan (mis. bulan ini) dipotong sampai HARI INI → perbandingan dengan rentang hari yang sama di periode lalu
  const todayIso = iso(new Date());
  const to = p.to > todayIso && p.from <= todayIso ? todayIso : p.to;
  const clipped = to !== p.to;
  const prev = prevRange(p.from, to);
  const showPlants = !p.plant;
  const out: ModuleReport[] = [];
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };
  // jendela data: periode, periode pembanding, dan 13 bulan untuk grafik tren
  const months = trendMonths(to, 13);
  const winFrom = [p.from, prev.from, months[0].from].sort()[0];
  const inR = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;
  // kelayakan perbandingan + catatan data per modul (lihat notes.ts)
  const prevLabel = periodLabelOf(prev.from, prev.to);
  const assess = (dates: (string | null | undefined)[], inputs?: (string | null | undefined)[]): Assessment => {
    const a = assessData({ dates, inputs, from: p.from, to: to, prevFrom: prev.from, prevTo: prev.to, prevLabel, today: todayIso });
    setComparable(a.ok);
    setDataStart(a.first);
    return a;
  };
  const noted = (m: ModuleReport, key: ModuleKey, a: Assessment): ModuleReport => (m.empty ? m : { ...m, note: buildNote(key, a, prevLabel) });

  for (const key of p.modules) {
    if (key === "fleet") {
      const [allTasks, vehicles, gateLogs] = await Promise.all([
        safe(() => getTasksByRange(winFrom, to, p.plant), []),
        safe(() => getAllVehiclesFull(p.plant), []),
        safe(() => getVehicleGateLogs({ plant: p.plant, dateFrom: p.from, dateTo: to }), []),
      ]);
      use();
      const A = assess(allTasks.map((t) => t.tanggal), allTasks.map((t) => t.created_at));
      const tasks = allTasks.filter((t) => inR(t.tanggal, p.from, to));
      const prevTasks = allTasks.filter((t) => inR(t.tanggal, prev.from, prev.to));
      out.push(noted(fleetTrend(computeFleet({ from: p.from, to: to, tasks, prevTasks, vehicles, gateLogs, showPlants }), months, allTasks), key, A));
    } else if (key === "claims") {
      const claims = await safe(() => getClaims(p.plant), []);
      use();
      const A = assess(claims.map((c) => c.periodDate || c.submissionDate), claims.map((c) => c.submittedAt || c.submissionDate));
      out.push(noted(claimsTrend(computeClaims({ from: p.from, to: to, claims, showPlants }), months, claims), key, A));
    } else if (key === "canteen") {
      const rows = await safe(() => getAllCanteenReports(), []);
      use();
      const A = assess(rows.map((r) => r.reportDate));
      out.push(noted(canteenTrend(computeCanteen({ from: p.from, to: to, rows }), months, rows), key, A));
    } else if (key === "atk") {
      const [allReq, restocks, items] = await Promise.all([
        safe(() => getAtkRequests({ dateFrom: winFrom, dateTo: to }), []),
        safe(() => getAtkRestocks({ dateFrom: p.from, dateTo: to }), []),
        safe(() => getAtkItems(), []),
      ]);
      use();
      const A = assess(allReq.map((r) => r.tanggal), allReq.map((r) => r.createdAt || r.tanggal));
      const requests = allReq.filter((r) => inR(r.tanggal, p.from, to));
      const prevRequests = allReq.filter((r) => inR(r.tanggal, prev.from, prev.to));
      out.push(noted(atkTrend(computeAtk({ from: p.from, to: to, requests, prevRequests, restocks, items }), months, allReq), key, A));
    } else if (key === "ga") {
      const [plan, events, imps, inv] = await Promise.all([
        safe(() => getGaPlan(winFrom, to), []),
        safe(() => getGaEvents(), []),
        safe(() => getGaImprovements(), []),
        safe(() => getGaInventory(), []),
      ]);
      use();
      const t = new Date();
      const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      const done = plan.filter((r) => r.actual !== null);   // jadwal yang sudah dinilai (dikerjakan / tidak)
      const A = assess(done.map((r) => r.tanggal), done.map((r) => r.waktuInput || r.tanggal));
      out.push(noted(computeGa({ from: p.from, to: to, prevFrom: prev.from, prevTo: prev.to, today, months, plan, events, imps, inv }), key, A));
    } else if (key === "tga") {
      const rows = await safe(() => tgaAllActivities(), []);
      use();
      const A = assess(rows.map((r) => r.tanggal), rows.map((r) => r.created_at || r.tanggal));
      out.push(noted(computeTga({ from: p.from, to: to, prevFrom: prev.from, prevTo: prev.to, months, rows }), key, A));
    } else if (key === "receptionist") {
      const [grants, parcels, bookings, accounts, settings] = await Promise.all([
        safe(() => getWifiGrants(winFrom), []),
        safe(() => getParcels(winFrom), []),
        safe(() => getBookings(winFrom, to), []),
        safe(() => getWifiCapacity(), []),
        safe(() => getRcpSettings(), DEFAULT_SETTINGS),
      ]);
      use();
      const t = new Date();
      const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      const openHours = Math.max(1, (toMin(settings.closeTime) - toMin(settings.openTime)) / 60);
      const A = assess(
        [...grants.map((g) => g.startDate), ...parcels.map((x) => x.createdAt), ...bookings.map((b) => b.date)],
        [...grants.map((g) => g.createdAt), ...parcels.map((x) => x.createdAt), ...bookings.map((b) => b.createdAt || b.date)],
      );
      out.push(noted(computeReceptionist({ from: p.from, to: to, prevFrom: prev.from, prevTo: prev.to, today, months, grants, parcels, bookings, accounts, openHours, roomName: settings.roomName || "Induction Room" }), key, A));
    } else if (key === "security") {
      const [rows, cfg, gc] = await Promise.all([
        safe(() => getSecurityMonths(monthKeyOf(winFrom), monthKeyOf(to)), {}),
        safe(() => getSecurityConfig(), { khusus: DEFAULT_KHUSUS, driverNames: {} }),
        fetchGcCases(winFrom, to),
      ]);
      use();
      // data Security bulanan: bulan yang ada isinya dianggap "tersedia"; terakhir tercatat = akhir bulan terakhir berisi data
      const keys = Object.keys(rows).filter((k) => rows[k] && Object.keys(rows[k]).length).sort();
      const A = assess(keys.map((k) => `${k}-01`), keys.map((k) => { const [y, m] = k.split("-").map(Number); return iso(new Date(y, m, 0)); }));
      const sec = computeSecurity({ from: p.from, to: to, months, rows, gc, khusus: cfg.khusus, driverNames: cfg.driverNames });
      out.push(...sec.map((m, i) => (i === 0 ? noted(m, key, A) : m)));
    }
  }

  use();
  setComparable(true);
  setDataStart(null);
  // pasca-proses: tidak boleh ada butir kosong; modul berisi tanpa narasi diberi kalimat cadangan
  const modules = out.map((m) => {
    const insights = m.insights.filter((x) => x && x.trim());
    const actions = m.actions.filter((x) => x && x.trim());
    const attention = m.attention.filter((x) => x && x.trim());
    if (!m.empty && insights.length === 0) insights.push(m.headline || tr("Data periode ini tercatat; belum ada temuan yang menonjol.", "Data for this period is recorded; nothing stands out yet."));
    return { ...m, insights, actions, attention };
  });
  const now = new Date();
  const loc = lang === "en" ? "en-GB" : "id-ID";
  return {
    lang,
    granularity: p.granularity || "auto",
    title: tr("Laporan Manajemen", "Management Report"),
    company: BRAND.company,
    periodLabel: periodLabelOf(p.from, p.to) + (clipped ? tr(` (data s.d. ${dShort(to)})`, ` (data through ${dShort(to)})`) : ""),
    prevLabel,
    from: p.from,
    to,
    scopeLabel: p.plant === "PRB" || p.plant === "CIK" ? plantFull(p.plant) : tr("Semua plant", "All plants"),
    generatedAt: now.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" }) + " " + now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":"),
    generatedBy: p.generatedBy,
    modules,
  };
}

export function reportFilename(r: MgmtReport): string {
  return r.lang === "en" ? `Management_Report_${r.from}_to_${r.to}` : `Laporan_Manajemen_${r.from}_sd_${r.to}`;
}
