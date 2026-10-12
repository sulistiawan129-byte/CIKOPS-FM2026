/* LAPORAN MANAJEMEN — PowerPoint 16:9 dengan grafik asli PPT (bisa diedit manajemen). */

import { fmtNum, metaOf, setReportLang, tr, type ChartSpec, type MgmtReport, type ModuleReport } from "./model";

const NAVY = "0B1633";
const INK = "1E293B";
const MUTED = "64748B";
const LINE = "E2E8F0";
const SOFT = "F6F8FC";
const FONT = "Calibri";
const TONE: Record<string, string> = { good: "0F9D74", bad: "D64545", neutral: "64748B" };
const SERIES = ["2D5BFF", "0EA5B7", "E08A00", "7A5AF0", "0F9D74", "D64545", "94A3B8"];
const h = (c: string) => c.replace("#", "").toUpperCase();

export async function exportMgmtPptx(report: MgmtReport, filename: string): Promise<void> {
  setReportLang(report.lang);
  const { default: PptxGenJS } = await import("pptxgenjs");
  const RPT = tr("Laporan Manajemen", "Management Report");
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.author = report.generatedBy || "CIKOPS-FM";
  pres.company = report.company;
  pres.title = `${RPT} ${report.periodLabel}`;
  const W = 13.333;

  const footer = (s: import("pptxgenjs").default.Slide, n: number) => {
    s.addShape(pres.ShapeType.line, { x: 0.5, y: 7.05, w: W - 1, h: 0, line: { color: LINE, width: 0.75 } });
    s.addText(`${report.company} · ${RPT} · ${report.periodLabel}`, { x: 0.5, y: 7.08, w: 9, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTED });
    s.addText(String(n), { x: W - 1.5, y: 7.08, w: 1, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTED, align: "right" });
  };
  const titleBar = (s: import("pptxgenjs").default.Slide, title: string, accent: string, kicker?: string) => {
    s.background = { color: "FFFFFF" };
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.95, fill: { color: NAVY }, line: { color: NAVY } });
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0.95, w: W, h: 0.06, fill: { color: h(accent) }, line: { color: h(accent) } });
    s.addText(title, { x: 0.5, y: 0.14, w: 9, h: 0.67, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", valign: "middle" });
    if (kicker) s.addText(kicker, { x: W - 4.5, y: 0.14, w: 4, h: 0.67, fontFace: FONT, fontSize: 12, color: "BECAE6", align: "right", valign: "middle" });
  };
  let n = 0;

  /* ── sampul ── */
  {
    const s = pres.addSlide(); n++;
    s.background = { color: NAVY };
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: "2D5BFF" }, line: { color: "2D5BFF" } });
    s.addText(RPT.toUpperCase(), { x: 0.9, y: 1.7, w: 10, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: "8CA0D2", charSpacing: 4 });
    s.addText("Fleet & Facility Management", { x: 0.9, y: 2.1, w: 11, h: 0.9, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF" });
    s.addText(report.company, { x: 0.9, y: 3.0, w: 11, h: 0.45, fontFace: FONT, fontSize: 18, color: "C8D2EB" });
    s.addText(report.periodLabel, { x: 0.9, y: 3.85, w: 11, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF" });
    s.addText(`${report.scopeLabel} · ${tr("dibandingkan dengan", "compared with")} ${report.prevLabel}`, { x: 0.9, y: 4.35, w: 11, h: 0.35, fontFace: FONT, fontSize: 13, color: "AAB6D6" });
    const smc = report.modules.filter((m) => !m.sub);
    const step = Math.min(2.9, (W - 1.8) / Math.max(1, smc.length));
    smc.forEach((m, i) => {
      const x = 0.9 + i * step;
      s.addShape(pres.ShapeType.rect, { x, y: 5.3, w: 0.08, h: 0.55, fill: { color: h(m.accent) }, line: { color: h(m.accent) } });
      s.addText(m.title, { x: x + 0.18, y: 5.25, w: step - 0.3, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: "FFFFFF", fit: "shrink" });
      s.addText(metaOf(m.key).short, { x: x + 0.18, y: 5.58, w: step - 0.3, h: 0.3, fontFace: FONT, fontSize: 10, color: "8CA0D2" });
    });
    s.addText(`${tr("Dibuat", "Generated")} ${report.generatedAt}${report.generatedBy ? ` ${tr("oleh", "by")} ${report.generatedBy}` : ""} · CIKOPS-FM`, { x: 0.9, y: 6.8, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, color: "8C9BC3" });
  }

  /* ── ringkasan eksekutif ── */
  {
    const s = pres.addSlide(); n++;
    titleBar(s, tr("Ringkasan Eksekutif", "Executive Summary"), "#2D5BFF", report.periodLabel);
    const sm = report.modules.filter((m) => !m.sub);
    const nc = sm.length > 4 ? 3 : 2;
    const cw = nc === 3 ? (W - 1 - 0.5) / 3 : 6.0, ch = 2.35;
    sm.forEach((m, i) => {
      const x = 0.5 + (i % nc) * (cw + 0.25), y = 1.25 + Math.floor(i / nc) * (ch + 0.22);
      s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: SOFT }, line: { color: LINE, width: 0.75 }, rectRadius: 0.08 });
      s.addShape(pres.ShapeType.rect, { x: x + 0.02, y: y + 0.12, w: 0.07, h: ch - 0.24, fill: { color: h(m.accent) }, line: { color: h(m.accent) } });
      s.addText(m.title, { x: x + 0.25, y: y + 0.1, w: cw - 0.4, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: INK });
      s.addText(m.headline, { x: x + 0.25, y: y + 0.48, w: cw - 0.45, h: 0.6, fontFace: FONT, fontSize: 11.5, color: MUTED, valign: "top" });
      const ks = m.kpis.slice(0, 3);
      const kw = (cw - 0.5) / Math.max(1, ks.length);
      ks.forEach((k, j) => {
        const kx = x + 0.25 + j * kw;
        s.addText(k.label.toUpperCase(), { x: kx, y: y + 1.15, w: kw - 0.1, h: 0.28, fontFace: FONT, fontSize: 8.5, color: MUTED, bold: true });
        s.addText(k.value, { x: kx, y: y + 1.42, w: kw - 0.1, h: 0.5, fontFace: FONT, fontSize: nc === 3 ? 17 : 22, bold: true, color: h(m.accent), fit: "shrink" });
        if (k.sub) s.addText(k.sub, { x: kx, y: y + 1.9, w: kw - 0.1, h: 0.3, fontFace: FONT, fontSize: 8.5, color: TONE[k.tone || "neutral"] });
      });
    });
    const att = report.modules.flatMap((m) => m.attention);
    s.addText(tr("Perlu perhatian manajemen", "Management attention"), { x: 0.5, y: 6.3, w: 4, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: INK });
    s.addText(att.length ? att.slice(0, 3).join("   •   ") : tr("Tidak ada isu kritis pada periode ini.", "No critical issues this period."), { x: 4.3, y: 6.25, w: W - 4.8, h: 0.42, fontFace: FONT, fontSize: 10.5, color: att.length ? "D64545" : MUTED, fit: "shrink" });
    footer(s, n);
  }

  /* ── per modul: kinerja + temuan ── */
  for (const m of report.modules) {
    const s = pres.addSlide(); n++;
    titleBar(s, m.title, m.accent, `${report.periodLabel} · ${tr("Kinerja", "Performance")}`);
    if (m.empty) {
      s.addText(m.headline, { x: 0.5, y: 3.2, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 18, color: MUTED, align: "center" });
      footer(s, n);
      continue;
    }
    kpiRow(pres, s, m, 0.5, 1.25, W - 1);
    m.charts.slice(0, 2).forEach((c, i) => addChart(pres, s, c, 0.5 + i * 6.25, 2.75, 6.0, 4.15));
    footer(s, n);

    const s2 = pres.addSlide(); n++;
    titleBar(s2, m.title, m.accent, `${report.periodLabel} · ${tr("Temuan & rekomendasi", "Findings & recommendations")}`);
    columnBox(pres, s2, tr("Temuan utama", "Key findings"), m.insights.slice(0, 6), 0.5, 1.3, 6.05, h(m.accent));
    columnBox(pres, s2, tr("Rekomendasi", "Recommendations"), m.actions.slice(0, 4), 6.8, 1.3, 6.05, "0F9D74", m.table ? 2.7 : 5.5);
    if (m.table) {
      s2.addText(m.table.title, { x: 6.8, y: 4.15, w: 6.05, h: 0.32, fontFace: FONT, fontSize: 12, bold: true, color: INK });
      const rows = [
        m.table.headers.map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } })),
        ...m.table.rows.slice(0, 6).map((r) => r.map((c) => ({ text: String(c) }))),
      ];
      s2.addTable(rows as import("pptxgenjs").default.TableRow[], { x: 6.8, y: 4.5, w: 6.05, fontFace: FONT, fontSize: 10, color: INK, border: { type: "solid", color: LINE, pt: 0.75 }, rowH: 0.3 });
    }
    footer(s2, n);
  }

  /* ── catatan ── */
  {
    const s = pres.addSlide(); n++;
    titleBar(s, tr("Catatan metodologi", "Methodology notes"), "#2D5BFF", report.periodLabel);
    const notes = report.lang === "en" ? [
      `Reporting period ${report.periodLabel}; compared with ${report.prevLabel} (previous calendar period for full months, quarters or years; otherwise the same-length period immediately before).`,
      "Data source: CIKOPS-FM app (driver assignments, fleet & gate, driver claims, daily canteen reports, office supplies transactions).",
      "Fleet utilisation = active vehicles used at least once ÷ total active vehicles.",
      "Canteen efficiency = (portions ordered − leftover) ÷ portions ordered.",
      "Critical supplies stock = out of stock or under 14 days' cover based on this period's average usage.",
      "Fleet documents: KIR every 6 months, STNK 12 months, Service 6 months from the last date; flagged when due within 30 days.",
      "13-month trend charts: ▲▼ under each month = change from the previous month. Security: monthly input from the security report; transporter violations read directly from G-C (Accept cases; cases counted per report, types per finding).",
    ] : [
      `Periode laporan ${report.periodLabel}; pembanding ${report.prevLabel} (periode kalender sebelumnya untuk bulan/kuartal/tahun penuh; selain itu rentang sama panjang tepat sebelumnya).`,
      "Sumber data: aplikasi CIKOPS-FM (penugasan driver, armada & gate, klaim driver, laporan kantin harian, transaksi ATK).",
      "Utilisasi armada = kendaraan aktif yang dipakai minimal sekali ÷ total kendaraan aktif.",
      "Efisiensi kantin = (porsi dipesan − sisa) ÷ porsi dipesan.",
      "Stok ATK kritis = stok habis atau hanya cukup < 14 hari berdasarkan pemakaian rata-rata periode ini.",
      "Dokumen armada: KIR 6 bulan, STNK 12 bulan, Service 6 bulan dari tanggal terakhir; ditandai bila jatuh tempo ≤ 30 hari.",
      "Grafik tren 13 bulan: ▲▼ di bawah tiap bulan = perubahan dari bulan sebelumnya. Security: input bulanan dari laporan security; pelanggaran transporter dibaca langsung dari G-C (status Accept; kasus dihitung per laporan, jenis per temuan).",
    ];
    s.addText(notes.map((t) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: true } })), { x: 0.7, y: 1.4, w: W - 1.4, h: 4.8, fontFace: FONT, fontSize: 13, color: INK, paraSpaceAfter: 8, valign: "top", fit: "shrink" });
    footer(s, n);
  }

  await pres.writeFile({ fileName: `${filename}.pptx` });
}

function kpiRow(pres: import("pptxgenjs").default, s: import("pptxgenjs").default.Slide, m: ModuleReport, x: number, y: number, w: number) {
  const n = m.kpis.length, gap = 0.18;
  const kw = (w - gap * (n - 1)) / n;
  m.kpis.forEach((k, i) => {
    const kx = x + i * (kw + gap);
    s.addShape(pres.ShapeType.roundRect, { x: kx, y, w: kw, h: 1.3, fill: { color: SOFT }, line: { color: LINE, width: 0.75 }, rectRadius: 0.06 });
    s.addShape(pres.ShapeType.rect, { x: kx, y, w: kw, h: 0.06, fill: { color: h(m.accent) }, line: { color: h(m.accent) } });
    s.addText(k.label.toUpperCase(), { x: kx + 0.15, y: y + 0.12, w: kw - 0.3, h: 0.28, fontFace: FONT, fontSize: 9, bold: true, color: MUTED });
    s.addText(k.value, { x: kx + 0.15, y: y + 0.38, w: kw - 0.3, h: 0.52, fontFace: FONT, fontSize: 24, bold: true, color: INK, fit: "shrink" });
    if (k.sub) s.addText(k.sub, { x: kx + 0.15, y: y + 0.9, w: kw - 0.3, h: 0.3, fontFace: FONT, fontSize: 9, color: TONE[k.tone || "neutral"], fit: "shrink" });
  });
}

function columnBox(pres: import("pptxgenjs").default, s: import("pptxgenjs").default.Slide, title: string, items: string[], x: number, y: number, w: number, color: string, hgt = 5.5) {
  s.addText(title, { x, y, w, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: INK });
  s.addShape(pres.ShapeType.rect, { x, y: y + 0.42, w: 0.6, h: 0.05, fill: { color }, line: { color } });
  s.addText(items.map((t) => ({ text: t, options: { bullet: { code: "25CF", indent: 16 }, breakLine: true } })), {
    x, y: y + 0.6, w, h: hgt - 0.6, fontFace: FONT, fontSize: 13, color: INK, paraSpaceAfter: 8, valign: "top", fit: "shrink",
  });
}

function addChart(pres: import("pptxgenjs").default, s: import("pptxgenjs").default.Slide, c: ChartSpec, x: number, y: number, w: number, hh: number) {
  const rp = c.unit === "rp";
  const conv = (v: number) => (rp ? Math.round((v / 1_000_000) * 10) / 10 : v);
  const title = rp ? `${c.title} (${tr("Rp juta", "IDR million")})` : c.title;
  s.addText(title, { x, y, w, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: INK });
  const empty = c.labels.length === 0 || c.series.every((se) => se.values.every((v) => !v));
  if (empty) {
    s.addShape(pres.ShapeType.roundRect, { x, y: y + 0.4, w, h: hh - 0.4, fill: { color: SOFT }, line: { color: LINE }, rectRadius: 0.06 });
    s.addText(tr("Belum ada data pada periode ini", "No data for this period"), { x, y: y + 0.4, w, h: hh - 0.4, fontFace: FONT, fontSize: 12, color: MUTED, align: "center", valign: "middle" });
    return;
  }
  const labels = c.deltas
    ? c.labels.map((l, i) => { const d = c.deltas![i]; return d === null || d === undefined ? l : `${l}\n${Math.abs(d) < 0.5 ? "0%" : `${d > 0 ? "▲" : "▼"}${fmtNum(Math.abs(d), Math.abs(d) >= 10 ? 0 : 1)}%`}`; })
    : c.labels;
  const data = c.series.map((se) => ({ name: se.name, labels, values: se.values.map(conv) }));
  const base = {
    x, y: y + 0.4, w, h: hh - 0.4,
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, catAxisLabelColor: MUTED,
    valAxisHidden: true, valGridLine: { style: "none" as const },
    dataLabelFontFace: FONT, dataLabelFontSize: 10, dataLabelColor: INK,
    showValue: true, dataLabelFormatCode: rp ? "#,##0.0" : c.unit === "pct" ? '0.0"%"' : "#,##0",
    showLegend: c.series.length > 1, legendPos: "t" as const, legendFontFace: FONT, legendFontSize: 10,
  };
  if (c.type === "donut") {
    s.addChart(pres.ChartType.doughnut, data, {
      ...base, holeSize: 58, showPercent: true, showValue: false, showLegend: true, legendPos: "r", legendFontSize: 11, dataLabelFormatCode: "0%",
      chartColors: (c.colors?.length ? c.colors : SERIES.map((x) => "#" + x)).map(h), dataLabelColor: "FFFFFF",
    });
  } else if (c.type === "line") {
    s.addChart(pres.ChartType.line, data, { ...base, chartColors: c.series.map((se) => h(se.color)), lineSize: 3, lineDataSymbolSize: 8, valAxisHidden: false, valAxisLabelFontSize: 9, valAxisLabelColor: MUTED, valGridLine: { color: LINE, size: 0.5 }, valAxisMinVal: c.unit === "pct" ? Math.max(0, Math.floor(Math.min(...c.series.flatMap((se) => se.values.filter((v) => v > 0)), 100) / 5) * 5 - 5) : undefined, valAxisMaxVal: c.unit === "pct" ? 100 : undefined });
  } else {
    s.addChart(pres.ChartType.bar, data, {
      ...base,
      barDir: c.type === "hbar" ? "bar" : "col",
      barGrouping: c.type === "stacked" ? "stacked" : "clustered",
      catAxisOrientation: (c.type === "hbar" ? "maxMin" : "minMax") as "minMax",
      barGapWidthPct: 60,
      chartColors: c.series.map((se) => h(se.color)),
      dataLabelPosition: c.type === "stacked" ? "ctr" : "outEnd",
      dataLabelColor: c.type === "stacked" ? "FFFFFF" : INK,
    });
  }
}

export const _fmt = fmtNum;
