export interface CanteenDayAgg {
  date: string;
  snackOrder: number;
  snackLeftover: number;
  snackConsumed: number;
  mealOrder: number;
  mealLeftover: number;
  mealConsumed: number;
}

export interface CanteenTotals {
  snackOrder: number;
  snackLeftover: number;
  snackConsumed: number;
  snackEff: number;
  mealOrder: number;
  mealLeftover: number;
  mealConsumed: number;
  mealEff: number;
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — jsPDF + jspdf-autotable, same libraries/pattern
   already used by lib/report.ts for the Tasks report.
════════════════════════════════════════════════════════════ */

type RGB = [number, number, number];
const COLOR_NAVY: RGB = [11, 30, 77];
const COLOR_GREEN: RGB = [0, 184, 107];
const COLOR_BRAND: RGB = [46, 91, 255];
const COLOR_RED: RGB = [255, 59, 92];
const COLOR_GRAY: RGB = [100, 110, 130];
const COLOR_LIGHT_BG: RGB = [247, 249, 253];
const COLOR_LIGHT_BORDER: RGB = [222, 227, 240];

export async function exportCanteenToPdf(
  dayAggs: CanteenDayAgg[],
  totals: CanteenTotals,
  periodLabel: string,
  autoAnalysis: string,
  rangeFrom: string,
  rangeTo: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;

  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  function drawHeader() {
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(0, 0, pageWidth, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CIKOPS-FM — CANTEEN REPORT", marginX, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Periode: ${periodLabel}`, marginX, 44);
    doc.setFontSize(8);
    doc.text(`Dibuat ${generatedAt}`, pageWidth - marginX, 27, { align: "right" });
  }

  function drawStatCard(x: number, y: number, w: number, h: number, label: string, value: string, accent: RGB) {
    doc.setFillColor(...accent);
    doc.rect(x, y, w, 3, "F");
    doc.setDrawColor(...COLOR_LIGHT_BORDER);
    doc.setFillColor(...COLOR_LIGHT_BG);
    doc.rect(x, y + 3, w, h - 3, "FD");
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(value, x + 10, y + h / 2 + 4);
    doc.setTextColor(...COLOR_GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 10, y + h - 7);
  }

  function drawSectionTitle(x: number, y: number, text: string) {
    doc.setFillColor(...COLOR_BRAND);
    doc.rect(x, y - 9, 3, 11, "F");
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(text, x + 9, y);
  }

  function drawFooter() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text("CIKOPS-FM — Laporan dibuat otomatis dari data sistem", marginX, pageHeight - 16);
  }

  drawHeader();
  let y = 96;
  drawSectionTitle(marginX, y, "Ringkasan Snack");
  y += 16;

  const gap = 10;
  const snackCards: Array<[string, string, RGB]> = [
    ["Total Order", fmtRp(totals.snackOrder), COLOR_GRAY],
    ["Terpakai", fmtRp(totals.snackConsumed), COLOR_GREEN],
    ["Total Sisa", fmtRp(totals.snackLeftover), COLOR_RED],
    ["Efisiensi", `${totals.snackEff.toFixed(2)}%`, COLOR_GREEN],
  ];
  const cardW = (contentWidth - gap * (snackCards.length - 1)) / snackCards.length;
  const cardH = 50;
  snackCards.forEach(([label, value, accent], i) => drawStatCard(marginX + i * (cardW + gap), y, cardW, cardH, label, value, accent));
  y += cardH + 24;

  drawSectionTitle(marginX, y, "Ringkasan Meal");
  y += 16;
  const mealCards: Array<[string, string, RGB]> = [
    ["Total Order", fmtRp(totals.mealOrder), COLOR_GRAY],
    ["Terpakai", fmtRp(totals.mealConsumed), COLOR_BRAND],
    ["Total Sisa", fmtRp(totals.mealLeftover), COLOR_RED],
    ["Efisiensi", `${totals.mealEff.toFixed(2)}%`, COLOR_BRAND],
  ];
  mealCards.forEach(([label, value, accent], i) => drawStatCard(marginX + i * (cardW + gap), y, cardW, cardH, label, value, accent));
  y += cardH + 24;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_GRAY);
  const analysisLines = doc.splitTextToSize(`Analisis: ${autoAnalysis}`, contentWidth);
  doc.text(analysisLines, marginX, y);

  drawFooter();

  // ── Detail harian — dua bagian terpisah: Snack, lalu Meal (masing-masing dengan total sendiri) ──
  const effTxt = (used: number, order: number) => (order > 0 ? `${((used / order) * 100).toFixed(2)}%` : "-");
  const sections: Array<{ title: string; accent: RGB; pick: (d: CanteenDayAgg) => [number, number, number]; total: [number, number, number] }> = [
    { title: "Detail Harian — Snack", accent: COLOR_GREEN, pick: (d) => [d.snackOrder, d.snackConsumed, d.snackLeftover], total: [totals.snackOrder, totals.snackConsumed, totals.snackLeftover] },
    { title: "Detail Harian — Meal", accent: COLOR_BRAND, pick: (d) => [d.mealOrder, d.mealConsumed, d.mealLeftover], total: [totals.mealOrder, totals.mealConsumed, totals.mealLeftover] },
  ];
  sections.forEach((sec) => {
    doc.addPage();
    drawHeader();
    y = 96;
    drawSectionTitle(marginX, y, sec.title);
    const rows = dayAggs.map((d) => {
      const [o, u, l] = sec.pick(d);
      return [d.date, fmtRp(o), fmtRp(u), fmtRp(l), effTxt(u, o)];
    });
    const [to, tu, tl] = sec.total;
    autoTable(doc, {
      startY: y + 14,
      margin: { left: marginX, right: marginX },
      head: [["Tanggal", "Order", "Terpakai", "Sisa", "Efisiensi"]],
      body: rows.length > 0 ? rows : [["Tidak ada data pada periode ini", "", "", "", ""]],
      foot: rows.length > 0 ? [["TOTAL", fmtRp(to), fmtRp(tu), fmtRp(tl), effTxt(tu, to)]] : undefined,
      theme: "grid",
      headStyles: { fillColor: sec.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
      footStyles: { fillColor: COLOR_LIGHT_BORDER, textColor: COLOR_NAVY, fontStyle: "bold", fontSize: 9 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      alternateRowStyles: { fillColor: COLOR_LIGHT_BG },
      didDrawPage: () => drawFooter(),
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  doc.save(`Canteen_Report_${rangeFrom}_to_${rangeTo}.pdf`);
}
