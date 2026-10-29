/** ════════════════════════════════════════════════════════════
 *  REPORT ENGINE — mesin laporan generik dwibahasa (ID/EN), dipakai
 *  SEMUA modul. Setiap modul cukup mendefinisikan kolom + data-nya;
 *  logic CSV/Excel/PDF-nya sama untuk semua, jadi tidak perlu ditulis
 *  ulang tiap modul.
 * ════════════════════════════════════════════════════════════ */
import { BRAND } from "./brand";

export type ReportLang = "id" | "en";

export interface ReportColumn<T> {
  key: string;
  labelId: string;
  labelEn: string;
  get: (row: T) => string | number;
  align?: "left" | "right" | "center";
  /** Lebar kolom relatif untuk PDF/Excel (opsional, default merata). */
  width?: number;
}

export interface GenericReportOptions<T> {
  rows: T[];
  columns: ReportColumn<T>[];
  lang: ReportLang;
  /** Judul dokumen, mis. "Laporan Dana Operasional" / akan dicari padanan EN-nya sendiri kalau tidak dikasih titleEn. */
  titleId: string;
  titleEn?: string;
  /** Label periode yang sedang dilaporkan, mis. "Januari 2026" atau "01 Jan 2026 s/d 31 Jan 2026". */
  periodLabel?: string;
  /** Nama file tanpa ekstensi. */
  filename: string;
  /** Baris ringkasan/total tambahan di akhir tabel (opsional). */
  summaryRows?: { label: string; value: string | number }[];
}

const COMPANY_NAME = BRAND.companyWithSite;
const SYSTEM_NAME = "CIKOPS Fleet Management";

function colLabel<T>(c: ReportColumn<T>, lang: ReportLang): string {
  return lang === "en" ? c.labelEn : c.labelId;
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function safeFilePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function todayForFilename(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── CSV ── */
export function exportGenericCsv<T>(opts: GenericReportOptions<T>): void {
  const headers = opts.columns.map((c) => colLabel(c, opts.lang));
  const rows = opts.rows.map((row) => opts.columns.map((c) => c.get(row)));
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const r of rows) lines.push(r.map(escapeCsvField).join(","));
  if (opts.summaryRows) {
    lines.push("");
    for (const s of opts.summaryRows) lines.push(`${escapeCsvField(s.label)},${escapeCsvField(s.value)}`);
  }
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${safeFilePart(opts.filename)}_${todayForFilename()}.csv`);
}

/* ── Excel (.xlsx) via ExcelJS ── */
export async function exportGenericExcel<T>(opts: GenericReportOptions<T>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.lang === "en" ? "Report" : "Laporan");

  const title = opts.lang === "en" ? (opts.titleEn ?? opts.titleId) : opts.titleId;
  ws.mergeCells(1, 1, 1, opts.columns.length);
  ws.getCell(1, 1).value = COMPANY_NAME;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  ws.mergeCells(2, 1, 2, opts.columns.length);
  ws.getCell(2, 1).value = title;
  ws.getCell(2, 1).font = { bold: true, size: 12 };

  let headerRowIdx = 4;
  if (opts.periodLabel) {
    ws.mergeCells(3, 1, 3, opts.columns.length);
    ws.getCell(3, 1).value = `${opts.lang === "en" ? "Period" : "Periode"}: ${opts.periodLabel}`;
    ws.getCell(3, 1).font = { italic: true, size: 10, color: { argb: "FF666666" } };
    headerRowIdx = 5;
  }

  const headerRow = ws.getRow(headerRowIdx);
  opts.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = colLabel(c, opts.lang);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  opts.rows.forEach((row, rIdx) => {
    const excelRow = ws.getRow(headerRowIdx + 1 + rIdx);
    opts.columns.forEach((c, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      cell.value = c.get(row);
      cell.alignment = { horizontal: c.align ?? "left" };
    });
  });

  if (opts.summaryRows && opts.summaryRows.length > 0) {
    const summaryStart = headerRowIdx + 1 + opts.rows.length + 1;
    opts.summaryRows.forEach((s, i) => {
      const r = ws.getRow(summaryStart + i);
      r.getCell(1).value = s.label;
      r.getCell(1).font = { bold: true };
      r.getCell(2).value = s.value;
      r.getCell(2).font = { bold: true };
    });
  }

  opts.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.max(14, colLabel(c, opts.lang).length + 4);
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `${safeFilePart(opts.filename)}_${todayForFilename()}.xlsx`);
}

/* ── PDF via jsPDF + autotable ── */
export async function exportGenericPdf<T>(opts: GenericReportOptions<T>): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: opts.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, pageWidth / 2, 40, { align: "center" });

  const title = opts.lang === "en" ? (opts.titleEn ?? opts.titleId) : opts.titleId;
  doc.setFontSize(11);
  doc.text(title, pageWidth / 2, 58, { align: "center" });

  let startY = 72;
  if (opts.periodLabel) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(`${opts.lang === "en" ? "Period" : "Periode"}: ${opts.periodLabel}`, pageWidth / 2, 74, { align: "center" });
    startY = 88;
  }

  autoTable(doc, {
    startY,
    head: [opts.columns.map((c) => colLabel(c, opts.lang))],
    body: opts.rows.map((row) => opts.columns.map((c) => String(c.get(row)))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 40, 71], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    margin: { left: 30, right: 30 },
  });

  if (opts.summaryRows && opts.summaryRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? startY;
    let y = finalY + 20;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    for (const s of opts.summaryRows) {
      doc.text(`${s.label}: ${s.value}`, 30, y);
      y += 14;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `${SYSTEM_NAME} — ${opts.lang === "en" ? "Generated on" : "Digenerate pada"} ${new Date().toLocaleString(opts.lang === "en" ? "en-US" : "id-ID")}`,
      30,
      doc.internal.pageSize.getHeight() - 20
    );
    doc.text(`${i}/${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`${safeFilePart(opts.filename)}_${todayForFilename()}.pdf`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ── Helper periode: rentang tanggal ATAU per-bulan, dipakai semua modul ── */
export type ReportRangeMode = "month" | "range";
export interface ReportRangeState {
  mode: ReportRangeMode;
  month: number; // 0-indexed
  year: number;
  dateFrom: string; // yyyy-mm-dd
  dateTo: string;
}
export function reportRangeToDates(r: ReportRangeState): { from: string; to: string } {
  if (r.mode === "month") {
    const from = new Date(r.year, r.month, 1);
    const to = new Date(r.year, r.month + 1, 0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: iso(from), to: iso(to) };
  }
  return { from: r.dateFrom, to: r.dateTo };
}
export function reportRangeLabel(r: ReportRangeState, lang: ReportLang): string {
  const monthsId = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const monthsEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const months = lang === "en" ? monthsEn : monthsId;
  if (r.mode === "month") return `${months[r.month]} ${r.year}`;
  return `${r.dateFrom} ${lang === "en" ? "to" : "s/d"} ${r.dateTo}`;
}

/* ════════════════════════════════════════════════════════════
   SUMMARY REPORT ENGINE — laporan berbasis RINGKASAN (kartu KPI +
   breakdown top-N), bukan dump tabel mentah. Struktur: KPI di atas,
   lalu 0+ blok breakdown (masing-masing daftar top-N berlabel), lalu
   1 tabel pendukung ringkas di bawah (opsional). Dipakai semua modul
   supaya isi laporan konsisten dengan yang ditampilkan di layar.
════════════════════════════════════════════════════════════ */

export interface SummaryKpi {
  labelId: string;
  labelEn: string;
  value: string | number;
}

export interface SummaryBreakdown {
  titleId: string;
  titleEn: string;
  /** Label kolom kedua (angkanya), mis. "Jumlah Tugas" / "Total (Rp)". */
  valueLabelId: string;
  valueLabelEn: string;
  items: { label: string; value: string | number; sublabel?: string }[];
}

export interface SummaryReportOptions<T> {
  lang: ReportLang;
  titleId: string;
  titleEn?: string;
  periodLabel?: string;
  filename: string;
  kpis: SummaryKpi[];
  breakdowns?: SummaryBreakdown[];
  /** Tabel pendukung di bagian bawah — idealnya sudah teragregasi
   *  (mis. rekap per driver/per departemen), bukan data mentah baris
   *  per transaksi, kecuali memang datanya sudah ringkas secara alami. */
  tableTitleId?: string;
  tableTitleEn?: string;
  tableRows: T[];
  tableColumns: ReportColumn<T>[];
}

export async function exportSummaryCsv<T>(opts: SummaryReportOptions<T>): Promise<void> {
  const lines: string[] = [];
  const title = opts.lang === "en" ? (opts.titleEn ?? opts.titleId) : opts.titleId;
  lines.push(escapeCsvField(COMPANY_NAME));
  lines.push(escapeCsvField(title));
  if (opts.periodLabel) lines.push(escapeCsvField(`${opts.lang === "en" ? "Period" : "Periode"}: ${opts.periodLabel}`));
  lines.push("");

  lines.push(escapeCsvField(opts.lang === "en" ? "SUMMARY" : "RINGKASAN"));
  for (const k of opts.kpis) lines.push(`${escapeCsvField(opts.lang === "en" ? k.labelEn : k.labelId)},${escapeCsvField(k.value)}`);
  lines.push("");

  for (const b of opts.breakdowns ?? []) {
    lines.push(escapeCsvField(opts.lang === "en" ? b.titleEn : b.titleId));
    lines.push(`${escapeCsvField(opts.lang === "en" ? "Item" : "Item")},${escapeCsvField(opts.lang === "en" ? b.valueLabelEn : b.valueLabelId)}`);
    for (const item of b.items) lines.push(`${escapeCsvField(item.label)},${escapeCsvField(item.value)}`);
    lines.push("");
  }

  if (opts.tableRows.length > 0) {
    lines.push(escapeCsvField(opts.lang === "en" ? (opts.tableTitleEn ?? "Detail") : (opts.tableTitleId ?? "Detail")));
    lines.push(opts.tableColumns.map((c) => escapeCsvField(colLabel(c, opts.lang))).join(","));
    for (const row of opts.tableRows) lines.push(opts.tableColumns.map((c) => escapeCsvField(c.get(row))).join(","));
  }

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${safeFilePart(opts.filename)}_${todayForFilename()}.csv`);
}

export async function exportSummaryExcel<T>(opts: SummaryReportOptions<T>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.lang === "en" ? "Summary" : "Ringkasan");
  const title = opts.lang === "en" ? (opts.titleEn ?? opts.titleId) : opts.titleId;
  let row = 1;

  ws.getCell(row, 1).value = COMPANY_NAME;
  ws.getCell(row, 1).font = { bold: true, size: 13 };
  row++;
  ws.getCell(row, 1).value = title;
  ws.getCell(row, 1).font = { bold: true, size: 12 };
  row++;
  if (opts.periodLabel) {
    ws.getCell(row, 1).value = `${opts.lang === "en" ? "Period" : "Periode"}: ${opts.periodLabel}`;
    ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF666666" } };
    row++;
  }
  row++;

  ws.getCell(row, 1).value = opts.lang === "en" ? "SUMMARY" : "RINGKASAN";
  ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: "FF0F2847" } };
  row++;
  for (const k of opts.kpis) {
    ws.getCell(row, 1).value = opts.lang === "en" ? k.labelEn : k.labelId;
    ws.getCell(row, 2).value = k.value;
    ws.getCell(row, 2).font = { bold: true };
    row++;
  }
  row++;

  for (const b of opts.breakdowns ?? []) {
    ws.getCell(row, 1).value = opts.lang === "en" ? b.titleEn : b.titleId;
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FF0F2847" } };
    row++;
    const headerRow = ws.getRow(row);
    headerRow.getCell(1).value = opts.lang === "en" ? "Item" : "Item";
    headerRow.getCell(2).value = opts.lang === "en" ? b.valueLabelEn : b.valueLabelId;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
    headerRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
    row++;
    for (const item of b.items) {
      ws.getCell(row, 1).value = item.label;
      ws.getCell(row, 2).value = item.value;
      row++;
    }
    row++;
  }

  if (opts.tableRows.length > 0) {
    ws.getCell(row, 1).value = opts.lang === "en" ? (opts.tableTitleEn ?? "Detail") : (opts.tableTitleId ?? "Detail");
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FF0F2847" } };
    row++;
    const headerRow = ws.getRow(row);
    opts.tableColumns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = colLabel(c, opts.lang);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
    });
    row++;
    for (const tRow of opts.tableRows) {
      opts.tableColumns.forEach((c, i) => {
        ws.getCell(row, i + 1).value = c.get(tRow);
      });
      row++;
    }
  }

  ws.columns.forEach((col) => { col.width = 24; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `${safeFilePart(opts.filename)}_${todayForFilename()}.xlsx`);
}

export async function exportSummaryPdf<T>(opts: SummaryReportOptions<T>): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += 18;

  const title = opts.lang === "en" ? (opts.titleEn ?? opts.titleId) : opts.titleId;
  doc.setFontSize(12);
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 14;

  if (opts.periodLabel) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(`${opts.lang === "en" ? "Period" : "Periode"}: ${opts.periodLabel}`, pageWidth / 2, y, { align: "center" });
    y += 20;
  } else {
    y += 10;
  }

  // ── KPI cards (grid 2 kolom) ──
  const cardW = (pageWidth - 60) / 2;
  const cardH = 46;
  opts.kpis.forEach((k, i) => {
    const col = i % 2;
    const rowI = Math.floor(i / 2);
    const x = 30 + col * (cardW + 8);
    const cy = y + rowI * (cardH + 8);
    doc.setFillColor(246, 248, 252);
    doc.roundedRect(x, cy, cardW, cardH, 6, 6, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 130, 150);
    doc.text(opts.lang === "en" ? k.labelEn : k.labelId, x + 10, cy + 16);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 40, 71);
    doc.text(String(k.value), x + 10, cy + 34);
  });
  y += Math.ceil(opts.kpis.length / 2) * (cardH + 8) + 16;
  doc.setTextColor(0, 0, 0);

  // ── Breakdown blocks (tabel kecil per blok) ──
  for (const b of opts.breakdowns ?? []) {
    if (y > 700) { doc.addPage(); y = 40; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(opts.lang === "en" ? b.titleEn : b.titleId, 30, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [[opts.lang === "en" ? "Item" : "Item", opts.lang === "en" ? b.valueLabelEn : b.valueLabelId]],
      body: b.items.map((it) => [it.sublabel ? `${it.label} (${it.sublabel})` : it.label, String(it.value)]),
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [15, 40, 71], textColor: 255, fontStyle: "bold" },
      margin: { left: 30, right: 30 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: () => {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // ── Tabel pendukung ──
  if (opts.tableRows.length > 0) {
    if (y > 680) { doc.addPage(); y = 40; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(opts.lang === "en" ? (opts.tableTitleEn ?? "Detail") : (opts.tableTitleId ?? "Detail"), 30, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [opts.tableColumns.map((c) => colLabel(c, opts.lang))],
      body: opts.tableRows.map((row) => opts.tableColumns.map((c) => String(c.get(row)))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 40, 71], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      margin: { left: 30, right: 30 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `${SYSTEM_NAME} — ${opts.lang === "en" ? "Generated on" : "Digenerate pada"} ${new Date().toLocaleString(opts.lang === "en" ? "en-US" : "id-ID")}`,
      30,
      doc.internal.pageSize.getHeight() - 20
    );
    doc.text(`${i}/${pageCount}`, pageWidth - 60, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`${safeFilePart(opts.filename)}_${todayForFilename()}.pdf`);
}

