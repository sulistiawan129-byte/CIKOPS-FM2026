import type { Claim, Overtime, Vehicle, Kantong, DriverTier, Plant, Driver, TaskDetail } from "./types";
import { computeReportAnalytics } from "./analytics";
import { toLocalISODate } from "./dateUtils";

/* ════════════════════════════════════════════════════════════
   Period filtering — shared by both the UI (ReportsTab) and the
   export functions below, so what you see on screen always matches
   exactly what gets exported.
════════════════════════════════════════════════════════════ */
export type ReportPeriodMode = "month" | "range" | "year";

export interface ReportPeriod {
  mode: ReportPeriodMode;
  month: number; // 0-indexed, used when mode==="month"
  year: number; // used when mode==="month" or mode==="year"
  dateFrom: string; // yyyy-mm-dd, used when mode==="range"
  dateTo: string; // yyyy-mm-dd, used when mode==="range"
}

export function periodLabel(p: ReportPeriod, months: string[]): string {
  if (p.mode === "month") return `${months[p.month]} ${p.year}`;
  if (p.mode === "year") return String(p.year);
  return `${p.dateFrom} s/d ${p.dateTo}`;
}

function toIso(d: Date): string {
  return toLocalISODate(d);
}

/** Actual [from, to] ISO date bounds for a period — needed to fetch Tasks
 *  (which are queried by exact date range) regardless of report mode. */
export function getPeriodDateRange(p: ReportPeriod): { from: string; to: string } {
  if (p.mode === "month") {
    const from = new Date(p.year, p.month, 1);
    const to = new Date(p.year, p.month + 1, 0);
    return { from: toIso(from), to: toIso(to) };
  }
  if (p.mode === "year") {
    return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
  }
  return { from: p.dateFrom, to: p.dateTo };
}

/** The immediately preceding period of equivalent length — used to compute
 *  trend insights ("naik/turun X% dibanding periode sebelumnya"). */
export function getPreviousPeriod(p: ReportPeriod): ReportPeriod {
  if (p.mode === "month") {
    const d = new Date(p.year, p.month - 1, 1);
    return { ...p, month: d.getMonth(), year: d.getFullYear() };
  }
  if (p.mode === "year") {
    return { ...p, year: p.year - 1 };
  }
  const from = new Date(p.dateFrom);
  const to = new Date(p.dateTo);
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { ...p, dateFrom: toIso(prevFrom), dateTo: toIso(prevTo) };
}

function claimInPeriod(c: Claim, p: ReportPeriod): boolean {
  const d = new Date(c.periodDate);
  if (isNaN(d.getTime())) return false;
  if (p.mode === "month") return d.getMonth() === p.month && d.getFullYear() === p.year;
  if (p.mode === "year") return d.getFullYear() === p.year;
  const from = new Date(p.dateFrom);
  const to = new Date(p.dateTo);
  to.setHours(23, 59, 59, 999);
  return d >= from && d <= to;
}

function overtimeInPeriod(o: Overtime, p: ReportPeriod): boolean {
  // Overtime is stored per-month ("YYYY-MM"), not an exact date, so we
  // compare against the 1st of that month.
  const d = new Date(`${o.period}-01`);
  if (isNaN(d.getTime())) return false;
  if (p.mode === "month") return d.getMonth() === p.month && d.getFullYear() === p.year;
  if (p.mode === "year") return d.getFullYear() === p.year;
  const from = new Date(p.dateFrom);
  const to = new Date(p.dateTo);
  return d >= from && d <= to;
}

export interface FleetReportData {
  period: ReportPeriod;
  claims: Claim[];
  overtimes: Overtime[];
  vehicles: Vehicle[];
  kantong: Kantong | null;
  tiers: DriverTier[];
  tasks: TaskDetail[];
}

export function buildFleetReportData(
  period: ReportPeriod,
  allClaims: Claim[],
  allOvertimes: Overtime[],
  vehicles: Vehicle[],
  kantong: Kantong | null,
  tiers: DriverTier[],
  tasks: TaskDetail[]
): FleetReportData {
  return {
    period,
    claims: allClaims.filter((c) => claimInPeriod(c, period)),
    overtimes: allOvertimes.filter((o) => overtimeInPeriod(o, period)),
    vehicles,
    kantong,
    tiers,
    tasks,
  };
}

/* ════════════════════════════════════════════════════════════
   INSIGHTS — the same analytical patterns the original FleetOS system
   used (top driver, top category, trend vs previous period, high
   spenders, plant gap), now spanning Claims + Overtime + Tasks together
   so management gets one coherent narrative instead of raw numbers only.
════════════════════════════════════════════════════════════ */
function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

export function buildInsights(
  data: FleetReportData,
  previousData: FleetReportData | null,
  drivers: Driver[],
  lang: "id" | "en"
): string[] {
  const out: string[] = [];
  const en = lang === "en";

  /* ── Claims insights ── */
  const totalClaims = data.claims.reduce((s, c) => s + c.total, 0);
  if (data.claims.length > 0) {
    const byDriver = new Map<string, { total: number; count: number }>();
    data.claims.forEach((c) => {
      const cur = byDriver.get(c.driverName) || { total: 0, count: 0 };
      cur.total += c.total;
      cur.count += 1;
      byDriver.set(c.driverName, cur);
    });
    const topDriverEntry = [...byDriver.entries()].sort((a, b) => b[1].total - a[1].total)[0];
    if (topDriverEntry) {
      out.push(
        en
          ? `Most active claimant: ${topDriverEntry[0]} with ${topDriverEntry[1].count} claims totaling Rp ${fmtNum(topDriverEntry[1].total)}`
          : `Driver paling aktif klaim: ${topDriverEntry[0]} dengan ${topDriverEntry[1].count} klaim senilai Rp ${fmtNum(topDriverEntry[1].total)}`
      );
    }

    const byType = new Map<string, { total: number; count: number }>();
    data.claims.forEach((c) => c.items.forEach((i) => {
      const cur = byType.get(i.type) || { total: 0, count: 0 };
      cur.total += i.total;
      cur.count += 1;
      byType.set(i.type, cur);
    }));
    const topTypeEntry = [...byType.entries()].sort((a, b) => b[1].total - a[1].total)[0];
    if (topTypeEntry && totalClaims > 0) {
      const pct = ((topTypeEntry[1].total / totalClaims) * 100).toFixed(1);
      out.push(
        en
          ? `Largest claim category: ${topTypeEntry[0]} (${topTypeEntry[1].count}x, ${pct}% of total)`
          : `Jenis klaim terbesar: ${topTypeEntry[0]} (${topTypeEntry[1].count}x, ${pct}% dari total)`
      );
    }

    // High spenders — drivers above 1.5x the average
    if (byDriver.size > 1) {
      const avg = totalClaims / byDriver.size;
      const highSpenders = [...byDriver.entries()].filter(([, v]) => v.total > avg * 1.5).map(([name]) => name);
      if (highSpenders.length > 0) {
        out.push(
          en
            ? `Above-average claimants: ${highSpenders.join(", ")}`
            : `Driver di atas rata-rata pengeluaran: ${highSpenders.join(", ")}`
        );
      }
    }
  }

  // Trend vs previous period
  if (previousData) {
    const prevTotal = previousData.claims.reduce((s, c) => s + c.total, 0);
    if (prevTotal > 0) {
      const changePct = ((totalClaims - prevTotal) / prevTotal) * 100;
      if (changePct > 10) {
        out.push(en ? `Trend: claim spending up +${changePct.toFixed(0)}% vs previous period` : `Tren: pengeluaran klaim naik +${changePct.toFixed(0)}% dibanding periode sebelumnya`);
      } else if (changePct < -10) {
        out.push(en ? `Trend: claim spending down ${changePct.toFixed(0)}% vs previous period` : `Tren: pengeluaran klaim turun ${changePct.toFixed(0)}% dibanding periode sebelumnya`);
      } else {
        out.push(en ? "Trend: claim spending relatively stable vs previous period" : "Tren: pengeluaran klaim relatif stabil dibanding periode sebelumnya");
      }
    }
  }

  if (data.claims.length > 0) {
    out.push(
      en
        ? `Total claims this period: Rp ${fmtNum(totalClaims)} from ${data.claims.length} submissions`
        : `Total klaim periode ini: Rp ${fmtNum(totalClaims)} dari ${data.claims.length} pengajuan`
    );
  }

  /* ── Overtime insights ── */
  if (data.overtimes.length > 0) {
    const totalHours = data.overtimes.reduce((s, o) => s + o.hours, 0);
    const totalAmount = data.overtimes.reduce((s, o) => s + o.amount, 0);

    const otByDriver = new Map<string, number>();
    data.overtimes.forEach((o) => otByDriver.set(o.driverName, (otByDriver.get(o.driverName) || 0) + o.hours));
    const topOtDriver = [...otByDriver.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topOtDriver) {
      out.push(
        en
          ? `Driver with most overtime: ${topOtDriver[0]} — ${fmtNum(topOtDriver[1])} hours`
          : `Driver dengan OT terbanyak: ${topOtDriver[0]} — ${fmtNum(topOtDriver[1])} jam`
      );
    }

    const plants: Plant[] = ["CIK", "PRB"];
    const byPlant = plants.map((p) => ({
      plant: p,
      hours: data.overtimes.filter((o) => o.plant === p).reduce((s, o) => s + o.hours, 0),
    }));
    const topPlant = [...byPlant].sort((a, b) => b.hours - a.hours)[0];
    const otherPlant = byPlant.find((p) => p.plant !== topPlant.plant);
    if (topPlant.hours > 0 && totalHours > 0) {
      const pct = ((topPlant.hours / totalHours) * 100).toFixed(1);
      out.push(
        en
          ? `Plant with most overtime: ${topPlant.plant} (${fmtNum(topPlant.hours)} hours, ${pct}% of total OT hours)`
          : `Plant dengan OT terbanyak: ${topPlant.plant} (${fmtNum(topPlant.hours)} jam, ${pct}% dari total jam OT)`
      );
      if (otherPlant && otherPlant.hours > 0) {
        const gapPct = (((topPlant.hours - otherPlant.hours) / otherPlant.hours) * 100).toFixed(0);
        if (Number(gapPct) > 5) {
          out.push(
            en
              ? `Plant ${topPlant.plant} carries ${gapPct}% higher OT load than ${otherPlant.plant}`
              : `Plant ${topPlant.plant} memiliki beban OT ${gapPct}% lebih tinggi dibanding ${otherPlant.plant}`
          );
        }
      }
    }

    out.push(
      en
        ? `Overtime total: ${fmtNum(totalHours)} hours worth Rp ${fmtNum(totalAmount)} from ${data.overtimes.length} entries`
        : `Total keseluruhan OT: ${fmtNum(totalHours)} jam senilai Rp ${fmtNum(totalAmount)} dari ${data.overtimes.length} entri`
    );
  }

  /* ── Task assignment insights (merged from the original driver-assignment report) ── */
  if (data.tasks.length > 0) {
    const analytics = computeReportAnalytics(data.tasks, drivers);
    out.push(
      en
        ? `Task completion rate: ${analytics.completionRate.toFixed(0)}% (${analytics.done} of ${analytics.totalTask - analytics.cancelled} non-cancelled tasks)`
        : `Tingkat penyelesaian tugas: ${analytics.completionRate.toFixed(0)}% (${analytics.done} dari ${analytics.totalTask - analytics.cancelled} tugas non-batal)`
    );
    if (analytics.topDriverByTask.length > 0) {
      const top = analytics.topDriverByTask[0];
      out.push(
        en
          ? `Busiest driver by task count: ${top.label} (${top.value} tasks)`
          : `Driver tersibuk (jumlah tugas): ${top.label} (${top.value} tugas)`
      );
    }
    if (analytics.avgDurationByDriver.length > 0) {
      const fastest = [...analytics.avgDurationByDriver].sort((a, b) => a.value - b.value)[0];
      out.push(
        en
          ? `Fastest average task completion: ${fastest.label} (~${fastest.value} min/task)`
          : `Penyelesaian tugas tercepat rata-rata: ${fastest.label} (~${fastest.value} menit/tugas)`
      );
    }
    if (analytics.cancelled > 0) {
      const cancelPct = ((analytics.cancelled / analytics.totalTask) * 100).toFixed(0);
      out.push(
        en
          ? `${analytics.cancelled} tasks cancelled (${cancelPct}% of total) — worth reviewing if the rate is rising`
          : `${analytics.cancelled} tugas dibatalkan (${cancelPct}% dari total) — perlu ditinjau kalau rasionya naik`
      );
    }
  }

  /* ── Vehicle document insights ── */
  const urgentDocs = data.vehicles.filter((v) => {
    const dates = [v.kir_date, v.service_date, v.stnk_date].filter(Boolean) as string[];
    return dates.some((d) => {
      const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
      return days <= 7;
    });
  });
  if (urgentDocs.length > 0) {
    out.push(
      en
        ? `${urgentDocs.length} vehicle(s) have documents expiring within 7 days — needs immediate attention`
        : `${urgentDocs.length} kendaraan punya dokumen jatuh tempo ≤7 hari — perlu perhatian segera`
    );
  }

  /* ── Dana Operasional insight ── */
  if (data.kantong) {
    const totalAlokasi = data.kantong.allocOpDriver + data.kantong.allocEmergency;
    const outstanding = totalAlokasi + data.kantong.cashAvailable + data.kantong.claimSubmitted + data.kantong.claimPaid;
    const gap = outstanding - data.kantong.totalBudget;
    if (Math.abs(gap) > data.kantong.totalBudget * 0.05) {
      out.push(
        en
          ? `Operational fund GAP is ${gap >= 0 ? "+" : ""}Rp ${fmtNum(gap)} — ${gap > 0 ? "outstanding exceeds total cash" : "outstanding is below total cash"}, worth reconciling`
          : `GAP Dana Operasional ${gap >= 0 ? "+" : ""}Rp ${fmtNum(gap)} — ${gap > 0 ? "outstanding melebihi total cash" : "outstanding di bawah total cash"}, perlu direkonsiliasi`
      );
    }
  }

  return out;
}

/* ════════════════════════════════════════════════════════════
   CSV EXPORT — sections for every module in one file (Tasks / Claims /
   Overtime / Vehicles / Dana Operasional), separated by a blank line and
   a header row, so it opens cleanly in Excel/Sheets as one workbook.
════════════════════════════════════════════════════════════ */
function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportFleetReportToCsv(data: FleetReportData, months: string[], insights: string[]): void {
  const lines: string[] = [];
  const label = periodLabel(data.period, months);

  lines.push(escapeCsv(`LAPORAN FLEETOS — ${label}`));
  lines.push("");

  if (insights.length > 0) {
    lines.push(escapeCsv("=== INSIGHT & ANALISA ==="));
    insights.forEach((ins) => lines.push(escapeCsv(ins)));
    lines.push("");
  }

  lines.push(escapeCsv("=== PENUGASAN DRIVER ==="));
  lines.push(["Tanggal", "Driver", "Kendaraan", "Jenis Pekerjaan", "Tujuan", "Requestor", "Status"].map(escapeCsv).join(","));
  data.tasks.forEach((t) => {
    lines.push([t.tanggal, t.driver_nama || "-", t.kendaraan || "-", t.jenis_pekerjaan, t.tujuan, t.requestor, t.status].map(escapeCsv).join(","));
  });
  lines.push("");

  lines.push(escapeCsv("=== KLAIM ==="));
  lines.push(["Periode", "Tanggal Pengajuan", "Driver", "Jenis", "Nominal"].map(escapeCsv).join(","));
  data.claims.forEach((c) => {
    c.items.forEach((item) => {
      lines.push([c.periodDate, c.submissionDate, c.driverName, item.type, item.total].map(escapeCsv).join(","));
    });
  });
  lines.push(["", "", "", "TOTAL", data.claims.reduce((s, c) => s + c.total, 0)].map(escapeCsv).join(","));
  lines.push("");

  if (data.overtimes.length > 0) {
    lines.push(escapeCsv("=== OVERTIME ==="));
    lines.push(["Periode", "Driver", "Plant", "Jam", "Nominal", "Alasan"].map(escapeCsv).join(","));
    data.overtimes.forEach((o) => {
      lines.push([o.period, o.driverName, o.plant, o.hours, o.amount, o.reason].map(escapeCsv).join(","));
    });
    lines.push(["", "", "", "TOTAL", data.overtimes.reduce((s, o) => s + o.amount, 0), ""].map(escapeCsv).join(","));
    lines.push("");
  }

  lines.push(escapeCsv("=== ARMADA (snapshot saat ini) ==="));
  lines.push(["Plat Nomor", "Tipe", "Status", "KIR", "Service", "STNK"].map(escapeCsv).join(","));
  data.vehicles.forEach((v) => {
    lines.push(
      [v.nopol, v.jenis, v.aktif ? "Aktif" : "Maintenance", v.kir_date, v.service_date, v.stnk_date]
        .map(escapeCsv)
        .join(",")
    );
  });

  if (data.kantong) {
    lines.push("");
    lines.push(escapeCsv("=== DANA OPERASIONAL (periode berjalan) ==="));
    lines.push(["Total Budget", "Alokasi Op Driver", "Alokasi Emergency", "Cash Available", "Claim Diajukan", "Claim Dibayar"].map(escapeCsv).join(","));
    lines.push(
      [data.kantong.totalBudget, data.kantong.allocOpDriver, data.kantong.allocEmergency, data.kantong.cashAvailable, data.kantong.claimSubmitted, data.kantong.claimPaid]
        .map(escapeCsv)
        .join(",")
    );
  }

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `FleetOS_Report_${label.replace(/\s/g, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — Sky & Gold themed, same jsPDF/autoTable stack already
   used by report.ts (Tasks report), so no new dependency is introduced.
════════════════════════════════════════════════════════════ */
type RGB = [number, number, number];
const NAVY: RGB = [20, 49, 92];
const BRAND: RGB = [0, 174, 239];
const GOLD: RGB = [216, 169, 78];
const GREEN: RGB = [26, 160, 107];
const ORANGE: RGB = [226, 134, 26];
const GRAY: RGB = [100, 112, 133];
const LIGHT_BG: RGB = [247, 250, 253];
const LIGHT_BORDER: RGB = [222, 232, 245];

export async function exportFleetReportToPdf(
  data: FleetReportData,
  months: string[],
  insights: string[]
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  const label = periodLabel(data.period, months);

  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function drawPageHeader(subtitle: string) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CIKOPS FLEET OS", marginX, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(subtitle, marginX, 44);
    doc.setFontSize(8);
    doc.text(`Periode ${label}`, pageWidth - marginX, 27, { align: "right" });
    doc.text(`Dibuat ${generatedAt}`, pageWidth - marginX, 40, { align: "right" });
  }

  function drawFooter() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text("CIKOPS Fleet OS — Laporan gabungan seluruh modul, dibuat otomatis", marginX, pageHeight - 16);
  }

  function drawStatCard(x: number, y: number, w: number, h: number, lbl: string, value: string, accent: RGB) {
    doc.setFillColor(...accent);
    doc.rect(x, y, w, 3, "F");
    doc.setDrawColor(...LIGHT_BORDER);
    doc.setFillColor(...LIGHT_BG);
    doc.rect(x, y + 3, w, h - 3, "FD");
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(value, x + 12, y + h / 2 + 4);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(lbl, x + 12, y + h - 8);
  }

  function drawSectionTitle(x: number, y: number, text: string) {
    doc.setFillColor(...BRAND);
    doc.rect(x, y - 9, 3, 11, "F");
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(text, x + 9, y);
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n || 0));

  /* ── Page 1: Summary ── */
  drawPageHeader(data.overtimes.length > 0 ? "Laporan Komprehensif — Klaim, Overtime, Armada, Dana Operasional" : "Laporan Komprehensif — Klaim, Armada, Dana Operasional");
  let y = 96;
  drawSectionTitle(marginX, y, "Ringkasan Keseluruhan");
  y += 18;

  const totalClaims = data.claims.reduce((s, c) => s + c.total, 0);
  const totalOtHours = data.overtimes.reduce((s, o) => s + o.hours, 0);
  const totalOtAmount = data.overtimes.reduce((s, o) => s + o.amount, 0);
  const activeVehicles = data.vehicles.filter((v) => v.aktif).length;
  const totalTierBudget = data.tiers.reduce((s, t) => s + t.amountPerMonth * t.activeDriverCount, 0);

  const cards: Array<[string, string, RGB]> = [
    ["Total Klaim", fmtRp(totalClaims), BRAND],
    ...(data.overtimes.length > 0 ? ([
      ["Total Jam OT", `${new Intl.NumberFormat("id-ID").format(totalOtHours)} jam`, GOLD],
      ["Nominal OT", fmtRp(totalOtAmount), GOLD],
    ] as Array<[string, string, RGB]>) : []),
    ["Kendaraan Aktif", `${activeVehicles}/${data.vehicles.length}`, GREEN],
    ["Budget Driver/Bulan", fmtRp(totalTierBudget), NAVY],
  ];
  const gap = 8;
  const cardW = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const cardH = 56;
  cards.forEach(([lbl, value, accent], i) => {
    drawStatCard(marginX + i * (cardW + gap), y, cardW, cardH, lbl, value, accent);
  });
  y += cardH + 26;

  if (insights.length > 0) {
    drawSectionTitle(marginX, y, "Insight & Analisa untuk Manajemen");
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    insights.forEach((ins) => {
      doc.setFillColor(...BRAND);
      doc.circle(marginX + 2, y - 3, 1.5, "F");
      const lines = doc.splitTextToSize(ins, contentWidth - 16);
      doc.text(lines, marginX + 10, y);
      y += lines.length * 12 + 4;
    });
    y += 10;
  }

  if (data.kantong) {
    drawSectionTitle(marginX, y, "Dana Operasional (Periode Berjalan)");
    y += 14;
    const totalAlokasi = data.kantong.allocOpDriver + data.kantong.allocEmergency;
    const outstanding = totalAlokasi + data.kantong.cashAvailable + data.kantong.claimSubmitted + data.kantong.claimPaid;
    const gapVal = outstanding - data.kantong.totalBudget;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Total Cash", "Alokasi Op Driver", "Alokasi Emergency", "Cash Available", "Claim Diajukan", "Claim Dibayar", "Outstanding", "GAP"]],
      body: [[
        fmtRp(data.kantong.totalBudget),
        fmtRp(data.kantong.allocOpDriver),
        fmtRp(data.kantong.allocEmergency),
        fmtRp(data.kantong.cashAvailable),
        fmtRp(data.kantong.claimSubmitted),
        fmtRp(data.kantong.claimPaid),
        fmtRp(outstanding),
        `${gapVal >= 0 ? "+" : ""}${fmtRp(gapVal)}`,
      ]],
      theme: "grid",
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  }

  if (data.overtimes.length > 0) {
  drawSectionTitle(marginX, y, "Perbandingan Overtime — CIK vs PRB");
  y += 14;
  const plants: Plant[] = ["CIK", "PRB"];
  const plantRows = plants.map((p) => {
    const rows = data.overtimes.filter((o) => o.plant === p);
    const hours = rows.reduce((s, o) => s + o.hours, 0);
    const amount = rows.reduce((s, o) => s + o.amount, 0);
    return [p, String(rows.length), `${hours} jam`, fmtRp(amount)];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Plant", "Jumlah Entri", "Total Jam", "Total Nominal"]],
    body: plantRows,
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });

  }
  drawFooter();

  /* ── Page 2: Task Assignment (Penugasan Driver) — merged from the
     original driver-assignment report into this one unified report. ── */
  if (data.tasks.length > 0) {
    doc.addPage();
    drawPageHeader("Penugasan Driver");
    y = 96;
    drawSectionTitle(marginX, y, `Ringkasan Penugasan (${data.tasks.length} tugas)`);
    y += 16;

    const taskDone = data.tasks.filter((t) => t.status === "DONE").length;
    const taskCancelled = data.tasks.filter((t) => t.status === "CANCELLED").length;
    const taskActive = data.tasks.filter((t) => t.status === "ASSIGNED" || t.status === "ON GOING").length;
    const completionRate = data.tasks.length - taskCancelled > 0 ? (taskDone / (data.tasks.length - taskCancelled)) * 100 : 0;

    const taskCards: Array<[string, string, RGB]> = [
      ["Total Tugas", String(data.tasks.length), BRAND],
      ["Selesai", String(taskDone), GREEN],
      ["Aktif/Berjalan", String(taskActive), GOLD],
      ["Dibatalkan", String(taskCancelled), ORANGE],
      ["Completion Rate", `${completionRate.toFixed(0)}%`, NAVY],
    ];
    const tGap = 8;
    const tCardW = (contentWidth - tGap * (taskCards.length - 1)) / taskCards.length;
    taskCards.forEach(([lbl, value, accent], i) => {
      drawStatCard(marginX + i * (tCardW + tGap), y, tCardW, 56, lbl, value, accent);
    });
    y += 56 + 26;

    drawSectionTitle(marginX, y, "Detail Tugas per Driver");
    const driverTaskMap = new Map<string, { total: number; done: number; cancelled: number }>();
    data.tasks.forEach((t) => {
      const name = t.driver_nama || "-";
      const cur = driverTaskMap.get(name) || { total: 0, done: 0, cancelled: 0 };
      cur.total += 1;
      if (t.status === "DONE") cur.done += 1;
      if (t.status === "CANCELLED") cur.cancelled += 1;
      driverTaskMap.set(name, cur);
    });
    const driverTaskRows = [...driverTaskMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, v]) => [
        name,
        String(v.total),
        String(v.done),
        String(v.cancelled),
        v.total - v.cancelled > 0 ? `${((v.done / (v.total - v.cancelled)) * 100).toFixed(0)}%` : "-",
      ]);
    autoTable(doc, {
      startY: y + 14,
      margin: { left: marginX, right: marginX },
      head: [["Driver", "Total Tugas", "Selesai", "Dibatalkan", "Completion Rate"]],
      body: driverTaskRows.length > 0 ? driverTaskRows : [["Tidak ada data tugas pada periode ini", "", "", "", ""]],
      theme: "grid",
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
      alternateRowStyles: { fillColor: LIGHT_BG },
    });
    drawFooter();
  }

  /* ── Page 3: Claims detail ── */
  doc.addPage();
  drawPageHeader("Detail Klaim");
  y = 96;
  drawSectionTitle(marginX, y, `Detail Klaim (${data.claims.length} entri)`);
  const claimRows: (string | number)[][] = [];
  data.claims.forEach((c) => {
    c.items.forEach((item, idx) => {
      claimRows.push([
        idx === 0 ? c.periodDate : "",
        idx === 0 ? c.driverName : "",
        item.type,
        item.expr,
        fmtRp(item.total),
      ]);
    });
  });
  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Periode", "Driver", "Jenis", "Rincian", "Nominal"]],
    body: claimRows.length > 0 ? claimRows : [["Tidak ada data klaim pada periode ini", "", "", "", ""]],
    foot: [["", "", "", "TOTAL", fmtRp(totalClaims)]],
    theme: "grid",
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: LIGHT_BG, textColor: NAVY, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });
  drawFooter();

  /* ── Page 4: Overtime detail (hanya bila ada data) ── */
  if (data.overtimes.length > 0) {
  doc.addPage();
  drawPageHeader("Detail Overtime");
  y = 96;
  drawSectionTitle(marginX, y, `Detail Overtime (${data.overtimes.length} entri)`);
  const otRows = data.overtimes.map((o) => [o.period, o.driverName, o.plant, `${o.hours} jam`, fmtRp(o.amount), o.reason || "-"]);
  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Periode", "Driver", "Plant", "Jam", "Nominal", "Alasan"]],
    body: otRows.length > 0 ? otRows : [["Tidak ada data overtime pada periode ini", "", "", "", "", ""]],
    foot: [["", "", "", `${totalOtHours} jam`, fmtRp(totalOtAmount), ""]],
    theme: "grid",
    headStyles: { fillColor: GOLD, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: LIGHT_BG, textColor: NAVY, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });
  drawFooter();
  }

  /* ── Page 4: Vehicles snapshot ── */
  doc.addPage();
  drawPageHeader("Snapshot Armada (kondisi saat ini)");
  y = 96;
  drawSectionTitle(marginX, y, `Daftar Kendaraan (${data.vehicles.length})`);
  const vehicleRows = data.vehicles.map((v) => [
    v.nopol,
    v.jenis || "-",
    v.aktif ? "Aktif" : "Maintenance",
    v.kir_date || "-",
    v.service_date || "-",
    v.stnk_date || "-",
  ]);
  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Plat Nomor", "Tipe", "Status", "KIR", "Service", "STNK"]],
    body: vehicleRows.length > 0 ? vehicleRows : [["Belum ada data kendaraan", "", "", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 2) {
        const status = hookData.cell.raw as string;
        if (status === "Maintenance") hookData.cell.styles.textColor = ORANGE;
        else if (status === "Aktif") hookData.cell.styles.textColor = GREEN;
      }
    },
  });
  drawFooter();

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  doc.save(`FleetOS_Report_${label.replace(/\s/g, "_")}.pdf`);
}
