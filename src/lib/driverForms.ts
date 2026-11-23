/* ════════════════════════════════════════════════════════════
   FORM PARKIR & TOLL MANUAL — template PDF untuk driver.
   Dipakai bila transaksi parkir / toll tidak punya struk elektronik: driver menulis tangan di form ini lalu melampirkan bukti.
   1 lembar A4 = 10 form (2 kolom × 5 baris), bisa digunting di garis putus-putus.
════════════════════════════════════════════════════════════ */

export const FORM_PER_SHEET = 10;
export const FORM_TITLE = "FORM PARKIR & TOLL MANUAL";
export const FORM_NOTE = "Harap Lampirkan Bukti Transaksi";

/** Ukuran & posisi (mm) satu lembar A4: margin 8, 2 kolom (jarak 4), 5 baris (jarak 3). */
export const SHEET = (() => {
  const W = 210, H = 297, margin = 8, gapX = 4, gapY = 3, cols = 2, rows = 5;
  return { W, H, margin, gapX, gapY, cols, rows, cellW: (W - 2 * margin - gapX * (cols - 1)) / cols, cellH: (H - 2 * margin - gapY * (rows - 1)) / rows };
})();

/** PDF berisi `sheets` lembar A4 (masing-masing 10 form). */
export async function buildParkTollFormPdf(sheets = 1) {
  const { jsPDF } = await import("jspdf");
  const n = Math.max(1, Math.min(50, Math.round(sheets) || 1));
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { cellW: W, cellH: H, margin, gapX, gapY, cols, rows } = SHEET;

  const drawForm = (x0: number, y0: number) => {
    // garis gunting (putus-putus)
    pdf.setDrawColor(140); pdf.setLineWidth(0.25); pdf.setLineDashPattern([1.6, 1.2], 0);
    pdf.roundedRect(x0, y0, W, H, 1.5, 1.5, "S");
    pdf.setLineDashPattern([], 0);

    const left = x0 + 5, right = x0 + W - 5;
    // judul + garis ganda ("=====")
    pdf.setTextColor(20); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(FORM_TITLE, left, y0 + 7);
    pdf.setDrawColor(40); pdf.setLineWidth(0.3); pdf.line(left, y0 + 9.2, right, y0 + 9.2);
    pdf.setLineWidth(0.3); pdf.line(left, y0 + 10.2, right, y0 + 10.2);

    const labelX = left, colonX = left + 24, fieldX = left + 27;
    let y = y0 + 16.4;
    const step = 6.9;
    const label = (text: string, yy: number) => {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5); pdf.setTextColor(20);
      pdf.text(text, labelX, yy); pdf.text(":", colonX, yy);
    };
    const rule = (x1: number, x2: number, yy: number) => { pdf.setDrawColor(120); pdf.setLineWidth(0.2); pdf.setLineDashPattern([0.6, 0.8], 0); pdf.line(x1, yy + 1.1, x2, yy + 1.1); pdf.setLineDashPattern([], 0); };
    const hint = (text: string, xx: number, yy: number) => { pdf.setFont("helvetica", "normal"); pdf.setFontSize(6); pdf.setTextColor(165); pdf.text(text, xx, yy); pdf.setTextColor(20); };

    // Tanggal Trx
    label("Tanggal Trx", y); rule(fieldX, right, y); hint("DD / MM / YYYY", fieldX + 1, y);
    // Jenis Trx — dua kotak centang
    y += step; label("Jenis Trx", y);
    pdf.setDrawColor(40); pdf.setLineWidth(0.3);
    pdf.rect(fieldX, y - 2.9, 3.2, 3.2, "S"); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(20); pdf.text("Parkir", fieldX + 5, y);
    pdf.rect(fieldX + 24, y - 2.9, 3.2, 3.2, "S"); pdf.text("Toll", fieldX + 29, y);
    // Nominal
    y += step; label("Nominal", y);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5); pdf.text("Rp", fieldX, y);
    rule(fieldX + 6.5, right, y);
    // Lokasi
    y += step; label("Lokasi", y); rule(fieldX, right, y);
    // Jam
    y += step; label("Jam", y); rule(fieldX, fieldX + 24, y); hint("JJ : MM", fieldX + 1, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(90); pdf.text("WIB", fieldX + 26, y);

    // catatan
    pdf.setTextColor(20); pdf.setFont("helvetica", "bolditalic"); pdf.setFontSize(7.5);
    pdf.text("Note :", left, y0 + H - 3.4);
    pdf.setFont("helvetica", "italic"); pdf.text(FORM_NOTE, left + 10, y0 + H - 3.4);
  };

  for (let p = 0; p < n; p++) {
    if (p > 0) pdf.addPage();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) drawForm(margin + c * (W + gapX), margin + r * (H + gapY));
  }
  return pdf;
}

/** Unduh PDF; bila peramban memblokir unduhan otomatis, PDF dibuka di tab baru. */
export async function downloadParkTollForm(sheets = 1): Promise<void> {
  const pdf = await buildParkTollFormPdf(sheets);
  const name = `Form-Parkir-Toll-Manual-${sheets}-lembar.pdf`;
  try { pdf.save(name); }
  catch { const url = URL.createObjectURL(pdf.output("blob")); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
