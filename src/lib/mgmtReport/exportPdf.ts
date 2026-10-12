/* LAPORAN MANAJEMEN — PDF (A4 landscape): sampul, ringkasan eksekutif, 1 halaman per modul. */

import { renderChartPNG } from "./chartImage";
import { metaOf, setReportLang, tr, type MgmtReport, type ModuleReport } from "./model";

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const NAVY: RGB = [11, 22, 51];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const SOFT: RGB = [246, 248, 252];
const TONE: Record<string, RGB> = { good: [15, 157, 116], bad: [214, 69, 69], neutral: [100, 116, 139] };

export async function exportMgmtPdf(report: MgmtReport, filename: string): Promise<void> {
  setReportLang(report.lang);
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  // Font standar PDF (WinAnsi) tidak punya ≤ ≥ → − ; ganti dengan padanan aman.
  const clean = (t: string) => t.replace(/≤/g, tr("maks.", "max.")).replace(/≥/g, tr("min.", "min.")).replace(/→/g, "->").replace(/−/g, "-").replace(/[“”]/g, '"');
  const cleanAny = (t: string | string[]) => (Array.isArray(t) ? t.map(clean) : clean(t));
  const origText = doc.text.bind(doc);
  const origSplit = doc.splitTextToSize.bind(doc);
  (doc as unknown as { text: typeof doc.text }).text = ((t: string | string[], ...rest: unknown[]) => (origText as (...a: unknown[]) => unknown)(cleanAny(t), ...rest)) as typeof doc.text;
  (doc as unknown as { splitTextToSize: typeof doc.splitTextToSize }).splitTextToSize = ((t: string, ...rest: unknown[]) => (origSplit as (...a: unknown[]) => unknown)(clean(t), ...rest)) as typeof doc.splitTextToSize;
  const W = 297, H = 210, M = 14;

  const footer = (page: number) => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`${report.company} · ${tr("Laporan Manajemen", "Management Report")} · ${report.periodLabel}`, M, H - 6.5);
    doc.text(`${tr("Halaman", "Page")} ${page}`, W - M, H - 6.5, { align: "right" });
  };
  const header = (title: string, accent: RGB, kicker: string) => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 20, "F");
    doc.setFillColor(...accent); doc.rect(0, 20, W, 1.2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(title, M, 12.8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(190, 202, 230);
    doc.text(kicker, W - M, 12.8, { align: "right" });
  };
  const bullets = (items: string[], x: number, y: number, w: number, maxY: number, color: RGB) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    for (const it of items) {
      const lines = doc.splitTextToSize(it, w - 6) as string[];
      if (y + lines.length * 4.4 > maxY) break;
      doc.setFillColor(...color); doc.circle(x + 1.4, y - 1.2, 1, "F");
      doc.text(lines, x + 5, y);
      y += lines.length * 4.4 + 2.2;
    }
    return y;
  };

  /* ── sampul ── */
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(45, 91, 255); doc.rect(0, 0, 6, H, "F");
  doc.setTextColor(140, 160, 210); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(tr("LAPORAN MANAJEMEN", "MANAGEMENT REPORT"), 26, 52, { charSpace: 1.2 });
  doc.setTextColor(255, 255, 255); doc.setFontSize(30);
  doc.text("Fleet & Facility Management", 26, 68);
  doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(200, 210, 235);
  doc.text(report.company, 26, 78);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  doc.text(report.periodLabel, 26, 96);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(170, 182, 214);
  doc.text(`${report.scopeLabel} · ${tr("dibandingkan dengan", "compared with")} ${report.prevLabel}`, 26, 103);
  let cy = 122;
  report.modules.forEach((m) => {
    doc.setFillColor(...hex(m.accent)); doc.roundedRect(26, cy - 4, 3, 7, 1, 1, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text(m.title, 33, cy + 1);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(170, 182, 214);
    doc.text(metaOf(m.key).desc, 100, cy + 1);
    cy += 10;
  });
  doc.setFontSize(8.5); doc.setTextColor(140, 155, 195);
  doc.text(`${tr("Dibuat", "Generated")} ${report.generatedAt}${report.generatedBy ? ` ${tr("oleh", "by")} ${report.generatedBy}` : ""} · CIKOPS-FM`, 26, H - 16);
  doc.text(tr("Dokumen internal — untuk keperluan manajemen", "Internal document — for management use"), W - M, H - 16, { align: "right" });

  /* ── ringkasan eksekutif ── */
  let page = 2;
  doc.addPage(); header(tr("Ringkasan Eksekutif", "Executive Summary"), [45, 91, 255], report.periodLabel);
  const cols = 2, gap = 6;
  const cw = (W - M * 2 - gap) / cols, ch = 58;
  report.modules.forEach((m, i) => {
    const x = M + (i % cols) * (cw + gap);
    const y = 28 + Math.floor(i / cols) * (ch + gap);
    doc.setFillColor(...SOFT); doc.setDrawColor(...LINE); doc.roundedRect(x, y, cw, ch, 3, 3, "FD");
    doc.setFillColor(...hex(m.accent)); doc.rect(x, y + 3, 1.6, ch - 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...INK);
    doc.text(m.title, x + 7, y + 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
    doc.text((doc.splitTextToSize(m.headline, cw - 14) as string[]).slice(0, 2), x + 7, y + 17);
    const ks = m.kpis.slice(0, 3);
    const kw = (cw - 14) / Math.max(1, ks.length);
    ks.forEach((k, j) => {
      const kx = x + 7 + j * kw;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text((doc.splitTextToSize(k.label.toUpperCase(), kw - 4) as string[])[0], kx, y + 33);
      doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...hex(m.accent));
      doc.text((doc.splitTextToSize(k.value, kw - 3) as string[])[0], kx, y + 42);
      if (k.sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...(TONE[k.tone || "neutral"])); doc.text((doc.splitTextToSize(k.sub, kw - 4) as string[])[0], kx, y + 48); }
    });
    if (m.empty) { doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(tr("Tidak ada data pada periode ini.", "No data for this period."), x + 7, y + 38); }
  });
  const attention = report.modules.flatMap((m) => m.attention);
  const ay = 28 + Math.ceil(report.modules.length / cols) * (ch + gap);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(tr("Perlu perhatian manajemen", "Management attention required"), M, ay + 4);
  if (attention.length) bullets(attention, M, ay + 11, W - M * 2, H - 14, [214, 69, 69]);
  else { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUTED); doc.text(tr("Tidak ada isu kritis pada periode ini.", "No critical issues this period."), M, ay + 11); }
  footer(page);

  /* ── halaman per modul ── */
  for (const m of report.modules) {
    page += 1;
    doc.addPage();
    header(m.title, hex(m.accent), report.periodLabel);
    modulePage(doc, m, W, H, M, bullets);
    footer(page);
  }

  doc.save(`${filename}.pdf`);
}

function modulePage(
  doc: import("jspdf").jsPDF, m: ModuleReport, W: number, H: number, M: number,
  bullets: (items: string[], x: number, y: number, w: number, maxY: number, color: RGB) => number,
) {
  const accent = hex(m.accent);
  if (m.empty) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(...MUTED);
    doc.text(m.headline, M, 40);
    return;
  }
  // KPI
  const n = m.kpis.length, gap = 5;
  const kw = (W - M * 2 - gap * (n - 1)) / n;
  m.kpis.forEach((k, i) => {
    const x = M + i * (kw + gap), y = 27;
    doc.setFillColor(...SOFT); doc.setDrawColor(...LINE); doc.roundedRect(x, y, kw, 25, 2.5, 2.5, "FD");
    doc.setFillColor(...accent); doc.rect(x, y, kw, 1.2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...MUTED);
    doc.text((doc.splitTextToSize(k.label.toUpperCase(), kw - 6) as string[])[0], x + 3.5, y + 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15.5); doc.setTextColor(...INK);
    doc.text((doc.splitTextToSize(k.value, kw - 6) as string[])[0], x + 3.5, y + 15.5);
    if (k.sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...(TONE[k.tone || "neutral"])); doc.text((doc.splitTextToSize(k.sub, kw - 6) as string[])[0], x + 3.5, y + 21.5); }
  });
  // grafik utama (2)
  const charts = m.charts.slice(0, 2);
  const cw = (W - M * 2 - 8) / 2, chH = cw * (300 / 640);
  charts.forEach((c, i) => {
    const x = M + i * (cw + 8), y = 58;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(c.title, x, y);
    const img = renderChartPNG(c, 640, 300, "jpeg");
    if (img) doc.addImage(img, "JPEG", x, y + 2.5, cw, chH, undefined, "FAST");
    doc.setDrawColor(...LINE); doc.roundedRect(x, y + 2.5, cw, chH, 2, 2, "S");
  });
  // temuan & rekomendasi
  const by = 58 + 2.5 + chH + 9;
  const colW = (W - M * 2 - 10) / 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(tr("Temuan utama", "Key findings"), M, by);
  doc.text(tr("Rekomendasi", "Recommendations"), M + colW + 10, by);
  doc.setFillColor(...accent); doc.rect(M, by + 1.8, 14, 0.8, "F"); doc.rect(M + colW + 10, by + 1.8, 14, 0.8, "F");
  bullets(m.insights.slice(0, 5), M, by + 8, colW, H - 14, accent);
  bullets(m.actions.slice(0, 4), M + colW + 10, by + 8, colW, H - 14, [15, 157, 116]);
}
