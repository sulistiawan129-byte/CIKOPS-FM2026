/** Export utilities for the Claims "Weekly Recap" table.
 *
 *  Structure per section (one section per Driver User split, same list
 *  used by "Export Tanda Terima"):
 *
 *    PT. FRISIAN FLAG INDONESIA
 *    REKAPITULASI BIAYA OPERASIONAL KENDARAAN {year}
 *    [TANDA TERIMA / TANDA TERIMA — DRIVER USER]   Total Claim   Rp X
 *    Periode : ...
 *
 *    Minggu | Driver | Gasoline | Toll | Parking | Other | Total
 *    ... rows ...                                  Grand Total
 *
 *    RINCIAN CLAIM
 *    Gasoline | Toll | Parking | Others | Total
 *    ... one row per claim LINE ITEM (one physical "lembar"/sheet of
 *        stapled receipts) — never merged with another item of the same
 *        category, and always the item's final total, never the raw
 *        addition expression (e.g. "100000+10000" → shown as 110000). ...
 */

import type { RincianRow } from "./claimRecap";
import { BRAND } from "./brand";

export interface WeeklyRecapRow {
  weekLabel: string;
  driver: string;
  gasoline: number;
  toll: number;
  parking: number;
  other: number;
  total: number;
}

export interface WeeklyRecapGrandTotal {
  gasoline: number;
  toll: number;
  parking: number;
  other: number;
  total: number;
}

export interface WeeklyRecapSection {
  /** e.g. "TANDA TERIMA — DRIVER USER" or "TANDA TERIMA" */
  title: string;
  rows: WeeklyRecapRow[];
  grandTotal: WeeklyRecapGrandTotal;
  rincianRows: RincianRow[];
}

const COMPANY_NAME = BRAND.company.toUpperCase();

function recapDocTitle(): string {
  return `REKAPITULASI BIAYA OPERASIONAL KENDARAAN ${new Date().getFullYear()}`;
}

function safeFileLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

/* ════════════════════════════════════════════════════════════
   EXCEL EXPORT (.xlsx) — via ExcelJS (supports real cell styling)
════════════════════════════════════════════════════════════ */

const HEADER_FILL = "FFD9E2F3";
const TABLE_HEAD_FILL = "FF2E5BFF";
const TOTAL_FILL = "FFF2F4F8";
const BORDER_THIN = { style: "thin" as const, color: { argb: "FFDDDDDD" } };
const BORDER_DARK = { style: "thin" as const, color: { argb: "FF1F2937" } };

export async function exportWeeklyRecapToExcel(
  sections: WeeklyRecapSection[],
  periodLabel: string
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "CIKOPS Fleet OS";
  wb.created = new Date();

  const numCols = 7; // Minggu, Driver, Gasoline, Toll, Parking, Other, Total

  sections.forEach((section, idx) => {
    if (section.rows.length === 0 && sections.length > 1) return;

    const sheetName = (idx === 0 && sections.length > 1 ? "Driver User" : sections.length > 1 ? "Lainnya" : "Weekly Recap").slice(0, 31);
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [{ width: 10 }, { width: 24 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }];

    let r = 1;
    let cell = ws.getCell(r, 1);
    ws.mergeCells(r, 1, r, numCols);
    cell.value = COMPANY_NAME;
    cell.font = { bold: true, size: 13 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    ws.getRow(r).height = 22;
    r++;

    cell = ws.getCell(r, 1);
    ws.mergeCells(r, 1, r, numCols);
    cell.value = recapDocTitle();
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    ws.getRow(r).height = 20;
    r++;

    ws.mergeCells(r, 1, r, numCols - 2);
    cell = ws.getCell(r, 1);
    cell.value = section.title;
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    const labelCell = ws.getCell(r, numCols - 1);
    labelCell.value = "Total Claim";
    labelCell.font = { bold: true, size: 10.5 };
    labelCell.alignment = { horizontal: "right", vertical: "middle" };
    const valueCell = ws.getCell(r, numCols);
    valueCell.value = `Rp ${fmtRp(section.grandTotal.total)}`;
    valueCell.font = { bold: true, size: 11 };
    valueCell.alignment = { horizontal: "right", vertical: "middle" };
    ws.getRow(r).height = 20;
    r++;

    ws.mergeCells(r, 1, r, numCols);
    cell = ws.getCell(r, 1);
    cell.value = `Periode: ${periodLabel}`;
    cell.font = { italic: true, size: 9.5, color: { argb: "FF555555" } };
    r++;

    r++; // spacer

    const headerRow = ws.getRow(r);
    ["Minggu", "Driver", "Gasoline", "Toll", "Parking", "Other", "Total"].forEach((h, i) => {
      const c = headerRow.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TABLE_HEAD_FILL } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK };
    });
    headerRow.commit();
    r++;

    if (section.rows.length > 0) {
      section.rows.forEach((row) => {
        const wr = ws.getRow(r);
        const vals = [row.weekLabel, row.driver, row.gasoline, row.toll, row.parking, row.other, row.total];
        vals.forEach((v, ci) => {
          const c = wr.getCell(ci + 1);
          c.value = v as string | number;
          c.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
          if (ci >= 2) {
            c.numFmt = "#,##0";
            c.alignment = { horizontal: "right" };
          }
        });
        wr.commit();
        r++;
      });
    } else {
      ws.getRow(r).getCell(1).value = "Tidak ada data klaim pada periode/kelompok ini";
      r++;
    }

    {
      const wr = ws.getRow(r);
      const vals = ["", "Grand Total", section.grandTotal.gasoline, section.grandTotal.toll, section.grandTotal.parking, section.grandTotal.other, section.grandTotal.total];
      vals.forEach((v, ci) => {
        const c = wr.getCell(ci + 1);
        c.value = v as string | number;
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
        c.border = { top: { style: "double", color: { argb: "FF1F2937" } } };
        if (ci >= 2) {
          c.numFmt = "#,##0";
          c.alignment = { horizontal: "right" };
        }
      });
      wr.commit();
      r++;
    }

    r++; // spacer
    r++; // spacer

    // ── RINCIAN CLAIM — one row per claim line item (per "lembar") ──
    {
      const headingCell = ws.getCell(r, 1);
      headingCell.value = "RINCIAN CLAIM";
      headingCell.font = { bold: true, size: 11 };
      r++;
    }
    {
      const wr = ws.getRow(r);
      ["Gasoline", "Toll", "Parking", "Others", "Total"].forEach((h, i) => {
        const c = wr.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TABLE_HEAD_FILL } };
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK };
      });
      wr.commit();
      r++;
    }

    if (section.rincianRows.length > 0) {
      section.rincianRows.forEach((rr) => {
        const wr = ws.getRow(r);
        const vals = [rr.gasoline || "", rr.toll || "", rr.parking || "", rr.others || "", rr.total];
        vals.forEach((v, ci) => {
          const c = wr.getCell(ci + 1);
          c.value = v as number;
          c.numFmt = "#,##0";
          c.alignment = { horizontal: "right" };
          c.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
        });
        wr.commit();
        r++;
      });
    } else {
      ws.getRow(r).getCell(1).value = "Tidak ada rincian";
      r++;
    }

    {
      const wr = ws.getRow(r);
      const vals = [section.grandTotal.gasoline, section.grandTotal.toll, section.grandTotal.parking, section.grandTotal.other, section.grandTotal.total];
      vals.forEach((v, ci) => {
        const c = wr.getCell(ci + 1);
        c.value = v;
        c.font = { bold: true };
        c.numFmt = "#,##0";
        c.alignment = { horizontal: "right" };
        c.border = { top: { style: "double", color: { argb: "FF1F2937" } } };
      });
      wr.commit();
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `CIKOPS_WeeklyRecap_Klaim_${safeFileLabel(periodLabel)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — same house style as the main Report export
════════════════════════════════════════════════════════════ */

type RGB = [number, number, number];
const COLOR_NAVY: RGB = [11, 30, 77];
const COLOR_BRAND: RGB = [46, 91, 255];
const COLOR_GRAY: RGB = [100, 110, 130];
const COLOR_LIGHT_BG: RGB = [247, 249, 253];
const COLOR_HEADER_BG: RGB = [217, 226, 243];

export async function exportWeeklyRecapToPdf(
  sections: WeeklyRecapSection[],
  periodLabel: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  const visibleSections = sections.filter((s) => s.rows.length > 0 || sections.length === 1);

  visibleSections.forEach((section, idx) => {
    if (idx > 0) doc.addPage();

    doc.setFillColor(...COLOR_HEADER_BG);
    doc.rect(marginX, 30, pageWidth - marginX * 2, 46, "F");
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(COMPANY_NAME, pageWidth / 2, 48, { align: "center" });
    doc.setFontSize(10.5);
    doc.text(recapDocTitle(), pageWidth / 2, 65, { align: "center" });

    const titleY = 92;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 26, 50);
    doc.text(section.title, marginX, titleY);
    doc.setFontSize(9.5);
    doc.text("Total Claim", pageWidth - marginX - 100, titleY, { align: "right" });
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_BRAND);
    doc.text(`Rp ${fmtRp(section.grandTotal.total)}`, pageWidth - marginX, titleY, { align: "right" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(`Periode: ${periodLabel}`, marginX, titleY + 14);

    const bodyRows = section.rows.map((r) => [
      r.weekLabel,
      r.driver,
      `Rp ${fmtRp(r.gasoline)}`,
      `Rp ${fmtRp(r.toll)}`,
      `Rp ${fmtRp(r.parking)}`,
      `Rp ${fmtRp(r.other)}`,
      `Rp ${fmtRp(r.total)}`,
    ]);

    autoTable(doc, {
      startY: titleY + 24,
      margin: { left: marginX, right: marginX },
      head: [["Minggu", "Driver", "Gasoline", "Toll", "Parking", "Other", "Total"]],
      body: bodyRows.length > 0 ? bodyRows : [["-", "Tidak ada data klaim pada periode/kelompok ini", "", "", "", "", ""]],
      foot: [[
        "", "Grand Total",
        `Rp ${fmtRp(section.grandTotal.gasoline)}`,
        `Rp ${fmtRp(section.grandTotal.toll)}`,
        `Rp ${fmtRp(section.grandTotal.parking)}`,
        `Rp ${fmtRp(section.grandTotal.other)}`,
        `Rp ${fmtRp(section.grandTotal.total)}`,
      ]],
      theme: "grid",
      headStyles: { fillColor: COLOR_BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, halign: "right" },
      footStyles: { fillColor: COLOR_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, halign: "right" },
      bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50], halign: "right" },
      columnStyles: { 0: { halign: "left" }, 1: { halign: "left" } },
      alternateRowStyles: { fillColor: COLOR_LIGHT_BG },
    });

    // @ts-expect-error jspdf-autotable augments doc with lastAutoTable at runtime
    const afterMainY = doc.lastAutoTable.finalY as number;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(20, 26, 50);
    doc.text("RINCIAN CLAIM", marginX, afterMainY + 20);

    const rincianBody =
      section.rincianRows.length > 0
        ? section.rincianRows.map((r) => [
            r.gasoline ? `Rp ${fmtRp(r.gasoline)}` : "",
            r.toll ? `Rp ${fmtRp(r.toll)}` : "",
            r.parking ? `Rp ${fmtRp(r.parking)}` : "",
            r.others ? `Rp ${fmtRp(r.others)}` : "",
            `Rp ${fmtRp(r.total)}`,
          ])
        : [["-", "", "", "", ""]];

    autoTable(doc, {
      startY: afterMainY + 28,
      margin: { left: marginX, right: marginX },
      head: [["Gasoline", "Toll", "Parking", "Others", "Total"]],
      body: rincianBody,
      foot: [[
        `Rp ${fmtRp(section.grandTotal.gasoline)}`,
        `Rp ${fmtRp(section.grandTotal.toll)}`,
        `Rp ${fmtRp(section.grandTotal.parking)}`,
        `Rp ${fmtRp(section.grandTotal.other)}`,
        `Rp ${fmtRp(section.grandTotal.total)}`,
      ]],
      theme: "grid",
      headStyles: { fillColor: COLOR_BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5, halign: "right" },
      footStyles: { fillColor: COLOR_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5, halign: "right" },
      bodyStyles: { fontSize: 8, textColor: [20, 26, 50], halign: "right" },
      alternateRowStyles: { fillColor: COLOR_LIGHT_BG },
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(
      "CIKOPS Fleet OS — Rekap dibuat otomatis dari data sistem. Nominal per lembar adalah total penjumlahan (bukan deret angkanya).",
      marginX,
      pageHeight - 16
    );
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  doc.save(`CIKOPS_WeeklyRecap_Klaim_${safeFileLabel(periodLabel)}.pdf`);
}
