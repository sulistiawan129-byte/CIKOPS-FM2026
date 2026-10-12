/* LAPORAN MANAJEMEN — Excel: sheet Ringkasan + 1 sheet per modul (KPI, temuan, rekomendasi, grafik, data grafik). */

import { renderChartPNG } from "./chartImage";
import { setReportLang, tr, type MgmtReport, type ModuleReport } from "./model";

const NAVY = "FF0B1633";
const INK = "FF1E293B";
const MUTED = "FF64748B";
const SOFT = "FFF6F8FC";
const LINE = "FFE2E8F0";
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

export async function exportMgmtXlsx(report: MgmtReport, filename: string): Promise<void> {
  setReportLang(report.lang);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = report.generatedBy || "CIKOPS-FM";
  wb.created = new Date();

  /* ── Ringkasan ── */
  const ws = wb.addWorksheet(tr("Ringkasan", "Summary"), { views: [{ showGridLines: false }], properties: { tabColor: { argb: NAVY } } });
  ws.columns = [{ width: 3 }, { width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }];
  titleBlock(ws, `${tr("Laporan Manajemen", "Management Report")} — Fleet & Facility Management`, `${report.company} · ${report.periodLabel} · ${report.scopeLabel}`,
    `${tr("Pembanding", "Compared with")}: ${report.prevLabel} · ${tr("Dibuat", "Generated")} ${report.generatedAt}${report.generatedBy ? ` ${tr("oleh", "by")} ${report.generatedBy}` : ""}`, 7);
  let r = 6;
  for (const m of report.modules.filter((x) => !x.sub)) {
    const head = ws.getRow(r);
    ws.mergeCells(r, 2, r, 7);
    head.getCell(2).value = m.title;
    head.getCell(2).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    head.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(m.accent) } };
    head.height = 22;
    r++;
    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = m.headline;
    ws.getCell(r, 2).font = { italic: true, color: { argb: MUTED } };
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 30;
    r++;
    const ks = m.kpis.slice(0, 5);
    ks.forEach((k, i) => {
      const c1 = ws.getCell(r, 2 + i); c1.value = k.label.toUpperCase();
      c1.font = { bold: true, size: 9, color: { argb: MUTED } }; c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
      const c2 = ws.getCell(r + 1, 2 + i); c2.value = k.value;
      c2.font = { bold: true, size: 15, color: { argb: argb(m.accent) } }; c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
      const c3 = ws.getCell(r + 2, 2 + i); c3.value = k.sub || "";
      c3.font = { size: 9, color: { argb: k.tone === "bad" ? "FFD64545" : k.tone === "good" ? "FF0F9D74" : MUTED } }; c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
      c3.alignment = { wrapText: true, vertical: "top" };
    });
    ws.getRow(r + 1).height = 24; ws.getRow(r + 2).height = 28;
    r += 4;
  }
  const att = report.modules.flatMap((m) => m.attention);
  ws.getCell(r, 2).value = tr("Perlu perhatian manajemen", "Management attention required");
  ws.getCell(r, 2).font = { bold: true, size: 12, color: { argb: INK } };
  r++;
  (att.length ? att : [tr("Tidak ada isu kritis pada periode ini.", "No critical issues this period.")]).forEach((t) => {
    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = `•  ${t}`;
    ws.getCell(r, 2).font = { color: { argb: att.length ? "FFD64545" : MUTED } };
    r++;
  });

  /* ── per modul ── */
  const used = new Set<string>(["ringkasan", "summary"]);
  for (const m of report.modules) moduleSheet(wb, m, report, used);

  // cetak: landscape, selebar 1 halaman
  wb.worksheets.forEach((sh) => {
    sh.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

type WS = import("exceljs").Worksheet;
type WB = import("exceljs").Workbook;

function titleBlock(ws: WS, title: string, sub: string, sub2: string, lastCol: number) {
  ws.mergeCells(1, 2, 1, lastCol);
  ws.getCell(1, 2).value = title;
  ws.getCell(1, 2).font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  for (let c = 1; c <= lastCol; c++) ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 34;
  ws.getCell(1, 2).alignment = { vertical: "middle" };
  ws.mergeCells(2, 2, 2, lastCol); ws.getCell(2, 2).value = sub; ws.getCell(2, 2).font = { bold: true, size: 11, color: { argb: INK } };
  ws.mergeCells(3, 2, 3, lastCol); ws.getCell(3, 2).value = sub2; ws.getCell(3, 2).font = { size: 9.5, color: { argb: MUTED } };
}

function sectionTitle(ws: WS, r: number, text: string, color: string) {
  ws.getCell(r, 2).value = text;
  ws.getCell(r, 2).font = { bold: true, size: 12, color: { argb: color } };
  ws.getCell(r, 2).border = { bottom: { style: "medium", color: { argb: color } } };
}

function moduleSheet(wb: WB, m: ModuleReport, report: MgmtReport, used: Set<string>) {
  const base = m.title.replace(/^Security — /, "Sec — ").replace(/[\\/*?:[\]]/g, "").slice(0, 28);
  let name = base, i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 25)} ${i++}`;
  used.add(name.toLowerCase());
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb(m.accent) } } });
  ws.columns = [{ width: 3 }, { width: 34 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 3 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  titleBlock(ws, m.title, `${report.periodLabel} · ${report.scopeLabel}`, m.headline, 13);
  let r = 5;
  if (m.empty) { ws.getCell(r, 2).value = m.headline; return; }

  sectionTitle(ws, r, tr("Indikator utama", "Key indicators"), argb(m.accent)); r++;
  const hdr = ws.getRow(r);
  [tr("Indikator", "Indicator"), tr("Nilai", "Value"), tr("Keterangan", "Note")].forEach((t, i) => {
    const c = hdr.getCell(2 + i); c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });
  ws.mergeCells(r, 4, r, 6); r++;
  m.kpis.forEach((k) => {
    ws.getCell(r, 2).value = k.label;
    ws.getCell(r, 3).value = k.value; ws.getCell(r, 3).font = { bold: true, color: { argb: INK } };
    ws.mergeCells(r, 4, r, 6);
    ws.getCell(r, 4).value = k.sub || ""; ws.getCell(r, 4).font = { color: { argb: k.tone === "bad" ? "FFD64545" : k.tone === "good" ? "FF0F9D74" : MUTED } };
    for (let c = 2; c <= 6; c++) ws.getCell(r, c).border = { bottom: { style: "thin", color: { argb: LINE } } };
    r++;
  });
  r++;
  sectionTitle(ws, r, tr("Temuan utama", "Key findings"), argb(m.accent)); r++;
  m.insights.forEach((t) => { ws.mergeCells(r, 2, r, 6); const c = ws.getCell(r, 2); c.value = `•  ${t}`; c.alignment = { wrapText: true, vertical: "top" }; ws.getRow(r).height = Math.max(18, Math.ceil(t.length / 95) * 15); r++; });
  r++;
  sectionTitle(ws, r, tr("Rekomendasi", "Recommendations"), "FF0F9D74"); r++;
  m.actions.forEach((t) => { ws.mergeCells(r, 2, r, 6); const c = ws.getCell(r, 2); c.value = `→  ${t}`; c.alignment = { wrapText: true, vertical: "top" }; ws.getRow(r).height = Math.max(18, Math.ceil(t.length / 95) * 15); r++; });
  r++;

  if (m.table) {
    sectionTitle(ws, r, m.table.title, argb(m.accent)); r++;
    m.table.headers.forEach((t, i) => { const c = ws.getCell(r, 2 + i); c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; });
    r++;
    m.table.rows.forEach((row) => { row.forEach((v, i) => { const c = ws.getCell(r, 2 + i); c.value = v; c.border = { bottom: { style: "thin", color: { argb: LINE } } }; }); r++; });
    r++;
  }

  // grafik di kolom kanan (H..M), bertumpuk ke bawah
  let gy = 4;
  m.charts.forEach((c) => {
    ws.getCell(gy + 1, 8).value = c.title;
    ws.getCell(gy + 1, 8).font = { bold: true, size: 11, color: { argb: INK } };
    const png = renderChartPNG(c, 640, 320);
    if (png) {
      const id = wb.addImage({ base64: png, extension: "png" });
      ws.addImage(id, { tl: { col: 7, row: gy + 1 }, ext: { width: 600, height: 300 } });
    }
    gy += 18;
  });

  // data grafik (angka di balik grafik)
  r = Math.max(r, 5) + 1;
  sectionTitle(ws, r, tr("Data grafik", "Chart data"), MUTED); r++;
  m.charts.forEach((c) => {
    ws.getCell(r, 2).value = c.title; ws.getCell(r, 2).font = { bold: true, color: { argb: INK } }; r++;
    const head = [tr("Kategori", "Category"), ...c.series.map((s) => s.name), ...(c.deltas ? [tr("Perubahan vs bulan sebelumnya", "Change vs previous month")] : [])];
    head.forEach((t, i) => { const cell = ws.getCell(r, 2 + i); cell.value = t; cell.font = { bold: true, color: { argb: MUTED } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } }; });
    r++;
    c.labels.forEach((lab, li) => {
      ws.getCell(r, 2).value = lab;
      c.series.forEach((s, si) => {
        const cell = ws.getCell(r, 3 + si);
        cell.value = Math.round((s.values[li] || 0) * 100) / 100;
        cell.numFmt = c.unit === "rp" ? (report.lang === "en" ? '"IDR" #,##0' : '"Rp" #,##0') : c.unit === "pct" ? '0.0"%"' : "#,##0";
      });
      if (c.deltas) {
        const d = c.deltas[li];
        const cell = ws.getCell(r, 3 + c.series.length);
        cell.value = d === null || d === undefined ? "–" : Math.round(d * 10) / 1000;
        if (typeof cell.value === "number") cell.numFmt = '+0.0%;-0.0%;0.0%';
      }
      r++;
    });
    r++;
  });
}
