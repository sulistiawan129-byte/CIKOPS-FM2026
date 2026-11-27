/* REKAP KLAIM PER DRIVER — bulanan & tahunan.
   Per driver dijumlahkan per kategori: Gasoline + Toll + Parking + Other = Total.
   Bulan/tahun mengikuti TANGGAL PERIODE klaim (periodDate), sama seperti rekap mingguan.
   Total selalu = jumlah keempat kategori (supaya kolom pasti cocok). */

import type { Claim, Plant } from "./types";
import { bucketForType } from "./claimRecap";
import { BRAND } from "./brand";

export type Cat = "gasoline" | "toll" | "parking" | "others";
export const CATS: Cat[] = ["gasoline", "toll", "parking", "others"];

export interface Totals { gasoline: number; toll: number; parking: number; others: number; total: number; count: number }
export interface DriverTotals extends Totals { driverId: string; driverName: string }
export interface DriverYearRow extends DriverTotals { months: Totals[] }

export const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_ID_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const MONTHS_EN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m: number, lang: string) => (lang === "en" ? MONTHS_EN : MONTHS_ID)[m] ?? "";
export const monthShort = (m: number, lang: string) => (lang === "en" ? MONTHS_EN_SHORT : MONTHS_ID_SHORT)[m] ?? "";

export const emptyTotals = (): Totals => ({ gasoline: 0, toll: 0, parking: 0, others: 0, total: 0, count: 0 });

function addTo(t: Totals, c: Claim): void {
  for (const it of c.items) t[bucketForType(it.type)] += Number(it.total) || 0;
  t.total = t.gasoline + t.toll + t.parking + t.others;
  t.count += 1;
}
function merge(into: Totals, from: Totals): void {
  for (const k of CATS) into[k] += from[k];
  into.total = into.gasoline + into.toll + into.parking + into.others;
  into.count += from.count;
}

/** Tahun & bulan (0–11) dari tanggal periode "YYYY-MM-DD" — tanpa Date supaya tidak geser zona waktu. */
function ymOf(c: Claim): { y: number; m: number } {
  const s = String(c.periodDate ?? "");
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 };
}

export function yearsIn(claims: Claim[]): number[] {
  const set = new Set<number>([new Date().getFullYear()]);
  for (const c of claims) { const y = ymOf(c).y; if (y > 2000) set.add(y); }
  return [...set].sort((a, b) => b - a);
}

function scoped(claims: Claim[], plant: Plant | null, driverId: string): Claim[] {
  return claims.filter((c) => (!plant || (c.plant ?? "CIK") === plant) && (driverId === "all" || c.driver_id === driverId));
}

/** Satu bulan: satu baris per driver, urut dari total terbesar. */
export function monthByDriver(claims: Claim[], year: number, month: number, plant: Plant | null, driverId: string): { rows: DriverTotals[]; grand: Totals } {
  const map = new Map<string, DriverTotals>();
  for (const c of scoped(claims, plant, driverId)) {
    const { y, m } = ymOf(c);
    if (y !== year || m !== month) continue;
    const cur = map.get(c.driver_id) ?? { ...emptyTotals(), driverId: c.driver_id, driverName: c.driverName };
    addTo(cur, c);
    map.set(c.driver_id, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total || a.driverName.localeCompare(b.driverName));
  const grand = emptyTotals();
  rows.forEach((r) => merge(grand, r));
  return { rows, grand };
}

/** Satu tahun, semua driver: total per bulan + total setahun per driver. */
export function yearByDriver(claims: Claim[], year: number, plant: Plant | null, driverId: string): { rows: DriverYearRow[]; grandMonths: Totals[]; grand: Totals } {
  const map = new Map<string, DriverYearRow>();
  for (const c of scoped(claims, plant, driverId)) {
    const { y, m } = ymOf(c);
    if (y !== year || m < 0 || m > 11) continue;
    const cur = map.get(c.driver_id) ?? { ...emptyTotals(), driverId: c.driver_id, driverName: c.driverName, months: Array.from({ length: 12 }, emptyTotals) };
    addTo(cur.months[m], c);
    addTo(cur, c);
    map.set(c.driver_id, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total || a.driverName.localeCompare(b.driverName));
  const grandMonths = Array.from({ length: 12 }, emptyTotals);
  const grand = emptyTotals();
  rows.forEach((r) => { r.months.forEach((mt, i) => merge(grandMonths[i], mt)); merge(grand, r); });
  return { rows, grandMonths, grand };
}

/* ═════════════ EKSPOR (Excel & PDF) ═════════════ */

export interface RecapSection {
  heading?: string;
  head: string[];
  align: ("left" | "right" | "center")[];
  rows: (string | number)[][];
  total?: (string | number)[];
}
export interface RecapDoc {
  lang: "id" | "en";
  title: string;
  period: string;
  /** Baris keterangan di bawah periode, mis. "Driver: Boby · Plant: Cikarang". */
  scope?: string;
  filename: string;
  sections: RecapSection[];
  landscape?: boolean;
}

const NAVY = "FF0F2847";
const fmtNum = (n: number) => (n === 0 ? "–" : Math.round(n).toLocaleString("id-ID"));
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
const stamp = (lang: string) => new Date().toLocaleString(lang === "en" ? "en-US" : "id-ID");

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportRecapExcel(doc: RecapDoc): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(doc.lang === "en" ? "Recap" : "Rekap", {
    pageSetup: { orientation: doc.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const ncol = Math.max(...doc.sections.map((s) => s.head.length));
  const merged = (r: number) => ws.mergeCells(r, 1, r, ncol);

  let r = 1;
  merged(r); ws.getCell(r, 1).value = BRAND.companyWithSite; ws.getCell(r, 1).font = { bold: true, size: 13 }; r++;
  merged(r); ws.getCell(r, 1).value = doc.title; ws.getCell(r, 1).font = { bold: true, size: 15, color: { argb: NAVY } }; ws.getRow(r).height = 22; r++;
  merged(r); ws.getCell(r, 1).value = `${doc.lang === "en" ? "Period" : "Periode"}: ${doc.period}`; ws.getCell(r, 1).font = { size: 11 }; r++;
  if (doc.scope) { merged(r); ws.getCell(r, 1).value = doc.scope; ws.getCell(r, 1).font = { size: 10, color: { argb: "FF5B677A" } }; r++; }
  r++;

  let firstHeaderRow = 0;
  for (const sec of doc.sections) {
    if (sec.heading) { merged(r); ws.getCell(r, 1).value = sec.heading; ws.getCell(r, 1).font = { bold: true, size: 11.5, color: { argb: NAVY } }; r++; }
    const hr = ws.getRow(r);
    if (!firstHeaderRow) firstHeaderRow = r;
    sec.head.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { horizontal: i === 0 || sec.align[i] === "left" ? "left" : "center", vertical: "middle", wrapText: true };
      c.border = { top: { style: "thin", color: { argb: NAVY } }, bottom: { style: "thin", color: { argb: NAVY } } };
    });
    hr.height = 24; r++;
    sec.rows.forEach((row, ri) => {
      const er = ws.getRow(r);
      row.forEach((v, i) => {
        const c = er.getCell(i + 1);
        c.value = v;
        if (typeof v === "number") c.numFmt = '#,##0;-#,##0;"–"';
        c.alignment = { horizontal: sec.align[i] ?? "left", vertical: "middle" };
        c.border = { bottom: { style: "hair", color: { argb: "FFC9D1DE" } } };
        if (ri % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F8FC" } };
      });
      r++;
    });
    if (sec.total) {
      const er = ws.getRow(r);
      sec.total.forEach((v, i) => {
        const c = er.getCell(i + 1);
        c.value = v;
        if (typeof v === "number") c.numFmt = '#,##0;-#,##0;"–"';
        c.font = { bold: true };
        c.alignment = { horizontal: sec.align[i] ?? "left", vertical: "middle" };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4EAF4" } };
        c.border = { top: { style: "medium", color: { argb: NAVY } }, bottom: { style: "medium", color: { argb: NAVY } } };
      });
      er.height = 20; r++;
    }
    r++;
  }
  merged(r);
  ws.getCell(r, 1).value = `${doc.lang === "en" ? "Based on the claim period date. Generated" : "Berdasarkan tanggal periode klaim. Diunduh"} ${stamp(doc.lang)} · CIKOPS`;
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF7A869A" } };

  ws.getColumn(1).width = 30;
  for (let i = 2; i <= ncol; i++) ws.getColumn(i).width = ncol > 9 ? 13 : 17;
  if (doc.sections.length === 1 && firstHeaderRow) ws.views = [{ state: "frozen", ySplit: firstHeaderRow, xSplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safe(doc.filename)}.xlsx`);
}

export async function exportRecapPdf(doc: RecapDoc): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ orientation: doc.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const M = 32;

  // Kop
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(90, 100, 120);
  pdf.text(BRAND.companyWithSite, M, 34);
  pdf.setFontSize(18); pdf.setTextColor(15, 40, 71);
  pdf.text(doc.title, M, 58);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10.5); pdf.setTextColor(40, 50, 70);
  pdf.text(`${doc.lang === "en" ? "Period" : "Periode"}: ${doc.period}`, M, 76);
  let y = 76;
  if (doc.scope) { pdf.setFontSize(9.5); pdf.setTextColor(100, 110, 130); y += 14; pdf.text(doc.scope, M, y); }
  pdf.setDrawColor(15, 40, 71); pdf.setLineWidth(1.2); pdf.line(M, y + 10, W - M, y + 10);
  y += 26;

  for (const sec of doc.sections) {
    if (sec.heading) {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(15, 40, 71);
      pdf.text(sec.heading, M, y); y += 8;
    }
    const numeric = (i: number) => (sec.align[i] ?? "left") !== "left";
    const cell = (v: string | number) => (typeof v === "number" ? fmtNum(v) : String(v));
    const colStyles: Record<number, { halign: "left" | "right" | "center" }> = {};
    sec.align.forEach((a, i) => { colStyles[i] = { halign: a }; });
    autoTable(pdf, {
      startY: y,
      head: [sec.head],
      body: sec.rows.map((row) => row.map(cell)),
      foot: sec.total ? [sec.total.map(cell)] : undefined,
      showFoot: "lastPage",
      theme: "grid",
      margin: { left: M, right: M, bottom: 40 },
      styles: { fontSize: sec.head.length > 9 ? 7.5 : 9, cellPadding: sec.head.length > 9 ? 4 : 5.5, lineColor: [213, 220, 232], lineWidth: 0.4, textColor: [28, 38, 55], valign: "middle" },
      headStyles: { fillColor: [15, 40, 71], textColor: 255, fontStyle: "bold", halign: "center" },
      footStyles: { fillColor: [228, 234, 244], textColor: [15, 40, 71], fontStyle: "bold", lineWidth: 0.8, lineColor: [15, 40, 71] },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === "head" && !numeric(d.column.index)) d.cell.styles.halign = "left";
        if (d.section === "foot") d.cell.styles.halign = sec.align[d.column.index] ?? "left";
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((pdf as any).lastAutoTable?.finalY ?? y) + 26;
  }

  const pages = pdf.getNumberOfPages();
  const H = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(140, 150, 165);
    pdf.text(`CIKOPS · ${doc.lang === "en" ? "Generated" : "Diunduh"} ${stamp(doc.lang)} · ${doc.lang === "en" ? "Based on the claim period date" : "Berdasarkan tanggal periode klaim"}`, M, H - 20);
    pdf.text(`${i}/${pages}`, W - M, H - 20, { align: "right" });
  }
  pdf.save(`${safe(doc.filename)}.pdf`);
}

/* ═════════════ Penyusun dokumen ═════════════ */

export interface DocLabels {
  lang: "id" | "en";
  cat: Record<Cat, string>;
  driver: string;
  total: string;
  claims: string;
  no: string;
  month: string;
}

const row7 = (name: string, t: Totals): (string | number)[] => [name, t.gasoline, t.toll, t.parking, t.others, t.total, t.count];

/** Bulanan: satu baris per driver (atau satu driver saja). */
export function monthDoc(L: DocLabels, year: number, month: number, data: { rows: DriverTotals[]; grand: Totals }, scope: string): RecapDoc {
  const head = [L.driver, L.cat.gasoline, L.cat.toll, L.cat.parking, L.cat.others, `${L.total} (Rp)`, L.claims];
  return {
    lang: L.lang,
    title: L.lang === "en" ? "Driver Claim Recap — Monthly" : "Rekap Klaim Driver — Bulanan",
    period: `${monthName(month, L.lang)} ${year}`,
    scope,
    filename: `Rekap_Klaim_Driver_${year}-${String(month + 1).padStart(2, "0")}`,
    sections: [{
      head, align: ["left", "right", "right", "right", "right", "right", "center"],
      rows: data.rows.map((r) => row7(r.driverName, r)),
      total: row7(L.lang === "en" ? "Grand total" : "Total keseluruhan", data.grand),
    }],
  };
}

/** Tahunan, semua driver: matriks driver × bulan + rincian kategori setahun. */
export function yearDoc(L: DocLabels, year: number, data: { rows: DriverYearRow[]; grandMonths: Totals[]; grand: Totals }, scope: string): RecapDoc {
  const gt = L.lang === "en" ? "Grand total" : "Total keseluruhan";
  const monthsHead = [L.driver, ...Array.from({ length: 12 }, (_, i) => monthShort(i, L.lang)), `${L.total} (Rp)`];
  return {
    lang: L.lang, landscape: true,
    title: L.lang === "en" ? "Driver Claim Recap — Yearly" : "Rekap Klaim Driver — Tahunan",
    period: String(year), scope,
    filename: `Rekap_Klaim_Driver_${year}`,
    sections: [
      {
        heading: L.lang === "en" ? "Total per month (Rp)" : "Total per bulan (Rp)",
        head: monthsHead, align: ["left", ...Array<"right">(13).fill("right")],
        rows: data.rows.map((r) => [r.driverName, ...r.months.map((m) => m.total), r.total]),
        total: [gt, ...data.grandMonths.map((m) => m.total), data.grand.total],
      },
      {
        heading: L.lang === "en" ? "Breakdown by category (full year)" : "Rincian per kategori (setahun)",
        head: [L.driver, L.cat.gasoline, L.cat.toll, L.cat.parking, L.cat.others, `${L.total} (Rp)`, L.claims],
        align: ["left", "right", "right", "right", "right", "right", "center"],
        rows: data.rows.map((r) => row7(r.driverName, r)),
        total: row7(gt, data.grand),
      },
    ],
  };
}

/** Tahunan, satu driver: 12 baris bulan × kategori — mis. "Boby, Januari = ...". */
export function yearDriverDoc(L: DocLabels, year: number, driverName: string, row: DriverYearRow | null, scope: string): RecapDoc {
  const months = row?.months ?? Array.from({ length: 12 }, emptyTotals);
  return {
    lang: L.lang,
    title: L.lang === "en" ? `Claim Recap — ${driverName}` : `Rekap Klaim — ${driverName}`,
    period: String(year), scope,
    filename: `Rekap_Klaim_${driverName}_${year}`,
    sections: [{
      head: [L.month, L.cat.gasoline, L.cat.toll, L.cat.parking, L.cat.others, `${L.total} (Rp)`, L.claims],
      align: ["left", "right", "right", "right", "right", "right", "center"],
      rows: months.map((m, i) => row7(monthName(i, L.lang), m)),
      total: row7(`${L.lang === "en" ? "Total" : "Total"} ${year}`, row ?? emptyTotals()),
    }],
  };
}
