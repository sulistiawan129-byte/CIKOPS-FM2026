/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — PowerPoint 16:9 bergaya dashboard CIKOPS
   (tema gelap "executive"): kartu KPI, grafik di kartu putih (gambar
   yang sama dengan pratinjau di aplikasi), temuan & rekomendasi.
   Semua warna teks dipilih kontras tinggi terhadap latarnya (≥ 4.5:1).
════════════════════════════════════════════════════════════ */

import { renderChartPNG } from "./chartImage";
import { metaOf, setReportLang, tr, type ChartSpec, type MgmtReport, type ModuleKey, type ModuleReport } from "./model";

type Slide = import("pptxgenjs").default.Slide;
type Pres = import("pptxgenjs").default;

/* palet gelap — kontras teks terhadap latar SURF (#0B1530):
   TXT 16:1 · MUT 9:1 · DIM 6:1 · aksen terang ≥ 6:1 */
const BG = "050B1C";
const SURF = "0B1530";
const SURF2 = "111E40";
const BORDER = "2A3C68";
const TXT = "F1F5FF";
const MUT = "C3CFEA";
const DIM = "9DAED3";
const INK = "1E293B"; // teks di kartu putih
const GREEN = "4ADE9A";
const RED_T = "FF9B9B";
const TONE: Record<string, string> = { good: GREEN, bad: RED_T, neutral: MUT };
/** Versi terang warna modul untuk teks/angka di latar gelap. */
const ACC_LIGHT: Record<ModuleKey, string> = { fleet: "8FB2FF", claims: "4ADE9A", canteen: "F7BE5C", atk: "BBA6FF", security: "FF9499" };
const HEAD = "Bahnschrift";
const BODY = "Segoe UI";
const W = 13.333;
const hex = (c: string) => c.replace("#", "").toUpperCase();

export async function exportMgmtPptx(report: MgmtReport, filename: string): Promise<void> {
  setReportLang(report.lang);
  const { default: PptxGenJS } = await import("pptxgenjs");
  const RPT = tr("Laporan Manajemen", "Management Report");
  const pres: Pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in
  pres.author = report.generatedBy || "CIKOPS-FM";
  pres.company = report.company;
  pres.title = `${RPT} ${report.periodLabel}`;
  let n = 0;

  const newSlide = () => { const s = pres.addSlide(); s.background = { color: BG }; n++; return s; };
  const footer = (s: Slide) => {
    s.addShape(pres.ShapeType.line, { x: 0.5, y: 7.0, w: W - 1, h: 0, line: { color: BORDER, width: 0.75 } });
    s.addText(`${report.company} · ${RPT} · ${report.periodLabel}`, { x: 0.5, y: 7.04, w: 9, h: 0.3, fontFace: BODY, fontSize: 9, color: DIM });
    s.addText(String(n), { x: W - 1.5, y: 7.04, w: 1, h: 0.3, fontFace: BODY, fontSize: 9, color: DIM, align: "right" });
  };
  const header = (s: Slide, title: string, accent: string, kicker: string) => {
    s.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.38, w: 0.07, h: 0.72, fill: { color: hex(accent) }, line: { color: hex(accent) } });
    s.addText(kicker.toUpperCase(), { x: 0.72, y: 0.3, w: 8.5, h: 0.3, fontFace: BODY, fontSize: 10.5, bold: true, color: DIM, charSpacing: 2 });
    s.addText(title, { x: 0.72, y: 0.56, w: 9.6, h: 0.58, fontFace: HEAD, fontSize: 26, bold: true, color: TXT, fit: "shrink" });
    s.addText(report.periodLabel, { x: W - 4.3, y: 0.56, w: 3.8, h: 0.58, fontFace: BODY, fontSize: 12, color: MUT, align: "right", valign: "middle" });
  };
  const card = (s: Slide, x: number, y: number, w: number, h: number, fill = SURF, line = BORDER) =>
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: line, width: 0.75 }, rectRadius: 0.1 });

  /* ── sampul ── */
  {
    const s = newSlide();
    s.addShape(pres.ShapeType.ellipse, { x: 7.6, y: -2.6, w: 8.5, h: 8.5, fill: { color: "13285A", transparency: 55 }, line: { color: "13285A", transparency: 100 } });
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: "4D8DFF" }, line: { color: "4D8DFF" } });
    s.addText(RPT.toUpperCase(), { x: 0.9, y: 1.35, w: 10, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: "8FB2FF", charSpacing: 4 });
    s.addText("Fleet & Facility Management", { x: 0.9, y: 1.8, w: 11.5, h: 0.95, fontFace: HEAD, fontSize: 44, bold: true, color: TXT });
    s.addText(report.company, { x: 0.9, y: 2.75, w: 11, h: 0.45, fontFace: BODY, fontSize: 18, color: MUT });
    card(s, 0.9, 3.45, 6.4, 1.1);
    s.addText(report.periodLabel, { x: 1.15, y: 3.55, w: 6, h: 0.5, fontFace: HEAD, fontSize: 24, bold: true, color: TXT, fit: "shrink" });
    s.addText(`${report.scopeLabel} · ${tr("dibandingkan dengan", "compared with")} ${report.prevLabel}`, { x: 1.15, y: 4.03, w: 6, h: 0.38, fontFace: BODY, fontSize: 12, color: MUT, fit: "shrink" });
    const smc = report.modules.filter((m) => !m.sub);
    const gap = 0.18, cw = Math.min(2.6, (W - 1.8 - gap * (smc.length - 1)) / Math.max(1, smc.length));
    smc.forEach((m, i) => {
      const x = 0.9 + i * (cw + gap);
      card(s, x, 5.0, cw, 1.15);
      s.addShape(pres.ShapeType.rect, { x: x + 0.02, y: 5.12, w: 0.06, h: 0.9, fill: { color: hex(m.accent) }, line: { color: hex(m.accent) } });
      s.addText(m.title, { x: x + 0.2, y: 5.1, w: cw - 0.3, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: TXT, fit: "shrink" });
      s.addText(metaOf(m.key).desc, { x: x + 0.2, y: 5.48, w: cw - 0.3, h: 0.6, fontFace: BODY, fontSize: 9.5, color: MUT, valign: "top", fit: "shrink" });
    });
    s.addText(`${tr("Dibuat", "Generated")} ${report.generatedAt}${report.generatedBy ? ` ${tr("oleh", "by")} ${report.generatedBy}` : ""} · CIKOPS-FM`, { x: 0.9, y: 6.75, w: 8, h: 0.3, fontFace: BODY, fontSize: 10, color: DIM });
    s.addText(tr("Dokumen internal — untuk keperluan manajemen", "Internal document — for management use"), { x: W - 5.4, y: 6.75, w: 4.9, h: 0.3, fontFace: BODY, fontSize: 10, color: DIM, align: "right" });
  }

  /* ── ringkasan eksekutif ── */
  {
    const s = newSlide();
    header(s, tr("Ringkasan Eksekutif", "Executive Summary"), "#4D8DFF", RPT);
    const sm = report.modules.filter((m) => !m.sub);
    const nc = sm.length > 4 ? 3 : 2;
    const gap = 0.2, cw = (W - 1 - gap * (nc - 1)) / nc, ch = 2.05;
    sm.forEach((m, i) => {
      const x = 0.5 + (i % nc) * (cw + gap), y = 1.35 + Math.floor(i / nc) * (ch + 0.15);
      const acc = ACC_LIGHT[m.key];
      card(s, x, y, cw, ch);
      s.addShape(pres.ShapeType.rect, { x: x + 0.02, y: y + 0.14, w: 0.06, h: ch - 0.28, fill: { color: hex(m.accent) }, line: { color: hex(m.accent) } });
      s.addText(m.title, { x: x + 0.24, y: y + 0.1, w: cw - 0.4, h: 0.38, fontFace: BODY, fontSize: 15, bold: true, color: TXT });
      s.addText(m.headline, { x: x + 0.24, y: y + 0.46, w: cw - 0.44, h: 0.56, fontFace: BODY, fontSize: 10.5, color: MUT, valign: "top", fit: "shrink" });
      const ks = m.kpis.slice(0, 3);
      const kw = (cw - 0.44) / Math.max(1, ks.length);
      ks.forEach((k, j) => {
        const kx = x + 0.24 + j * kw;
        s.addText(k.label.toUpperCase(), { x: kx, y: y + 1.06, w: kw - 0.08, h: 0.26, fontFace: BODY, fontSize: 8, bold: true, color: DIM, fit: "shrink" });
        s.addText(k.value, { x: kx, y: y + 1.3, w: kw - 0.08, h: 0.42, fontFace: HEAD, fontSize: valSize(k.value, kw, nc === 3 ? 18 : 21), bold: true, color: acc, fit: "shrink" });
        if (k.sub) s.addText(k.sub, { x: kx, y: y + 1.72, w: kw - 0.08, h: 0.26, fontFace: BODY, fontSize: 8.5, color: TONE[k.tone || "neutral"], fit: "shrink" });
      });
      if (m.empty) s.addText(tr("Tidak ada data pada periode ini.", "No data for this period."), { x: x + 0.24, y: y + 1.3, w: cw - 0.4, h: 0.4, fontFace: BODY, fontSize: 11, color: MUT });
    });
    const rows = Math.ceil(sm.length / nc);
    const ay = 1.35 + rows * (ch + 0.15) + 0.05;
    const att = report.modules.flatMap((m) => m.attention);
    const ah = Math.min(2.2, 6.88 - ay);
    if (ah >= 0.6) {
      card(s, 0.5, ay, W - 1, ah, att.length ? "2A1013" : "0E2A22", att.length ? "6B2A31" : "1F5A47");
      s.addText(tr("Perlu perhatian manajemen", "Management attention required"), { x: 0.75, y: ay + 0.08, w: 5, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: att.length ? "FFC2C2" : "A7F3CF" });
      const items = att.length ? att.slice(0, ah > 1.4 ? 5 : 3) : [tr("Tidak ada isu kritis pada periode ini.", "No critical issues this period.")];
      s.addText(items.map((t) => ({ text: `•  ${t}`, options: { breakLine: true } })), {
        x: 0.75, y: ay + 0.4, w: W - 1.5, h: ah - 0.46, fontFace: BODY, fontSize: 10, color: att.length ? "FFE4E4" : "D1FAE5", valign: "top", fit: "shrink", paraSpaceAfter: 2,
      });
    }
    footer(s);
  }

  /* ── per modul ── */
  for (const m of report.modules) {
    const acc = ACC_LIGHT[m.key];
    const s = newSlide();
    header(s, m.title, m.accent, `${tr("Kinerja", "Performance")} · ${metaOf(m.key).title}`);
    if (m.empty) {
      card(s, 0.5, 2.6, W - 1, 1.6);
      s.addText(m.headline, { x: 0.8, y: 2.7, w: W - 1.6, h: 1.4, fontFace: BODY, fontSize: 18, color: MUT, align: "center", valign: "middle" });
      footer(s);
      continue;
    }
    kpiRow(pres, s, m, 0.5, 1.35, W - 1);
    const charts = m.charts.slice(0, 2);
    if (charts.length === 1) chartCard(pres, s, charts[0], 0.5, 2.72, W - 1, 4.15, true);
    else charts.forEach((c, i) => chartCard(pres, s, c, 0.5 + i * 6.28, 2.72, 6.05, 4.15, false));
    footer(s);

    const s2 = newSlide();
    header(s2, m.title, m.accent, `${tr("Temuan & rekomendasi", "Findings & recommendations")} · ${metaOf(m.key).title}`);
    const colW = 6.05;
    card(s2, 0.5, 1.35, colW, 5.5);
    sectionTitle(pres, s2, tr("Temuan utama", "Key findings"), 0.75, 1.5, colW - 0.5, acc);
    bullets(s2, m.insights.slice(0, 6), 0.75, 2.05, colW - 0.5, 4.65, "●", acc);
    const recH = m.table ? 2.35 : 5.5;
    card(s2, 6.78, 1.35, colW, recH);
    sectionTitle(pres, s2, tr("Rekomendasi", "Recommendations"), 7.03, 1.5, colW - 0.5, GREEN);
    bullets(s2, m.actions.slice(0, 4), 7.03, 2.05, colW - 0.5, recH - 0.85, "→", GREEN);
    if (m.table) {
      card(s2, 6.78, 3.9, colW, 2.95);
      s2.addText(m.table.title, { x: 7.03, y: 3.98, w: colW - 0.5, h: 0.34, fontFace: BODY, fontSize: 12, bold: true, color: TXT });
      const nCols = m.table.headers.length;
      const firstW = Math.min(3.0, (colW - 0.5) * 0.48);
      const restW = (colW - 0.5 - firstW) / Math.max(1, nCols - 1);
      const rows = [
        m.table.headers.map((t) => ({ text: t, options: { bold: true, color: TXT, fill: { color: "1D3263" } } })),
        ...m.table.rows.slice(0, 6).map((r, ri) => r.map((c) => ({ text: String(c), options: { color: TXT, fill: { color: ri % 2 ? SURF : SURF2 } } }))),
      ];
      s2.addTable(rows as import("pptxgenjs").default.TableRow[], {
        x: 7.03, y: 4.36, w: colW - 0.5, colW: [firstW, ...Array.from({ length: nCols - 1 }, () => restW)],
        fontFace: BODY, fontSize: 9.5, border: { type: "solid", color: BORDER, pt: 0.75 }, rowH: 0.3, valign: "middle", autoPage: false,
      });
    }
    footer(s2);
  }

  /* ── catatan metodologi ── */
  {
    const s = newSlide();
    header(s, tr("Catatan metodologi", "Methodology notes"), "#4D8DFF", RPT);
    const notes = report.lang === "en" ? [
      `Reporting period ${report.periodLabel}; compared with ${report.prevLabel} (previous calendar period for full months, quarters or years; otherwise the same-length period immediately before).`,
      "Data source: CIKOPS-FM app (driver assignments, fleet & gate, driver claims, daily canteen reports, office supplies transactions, monthly security input).",
      "Fleet utilisation = active vehicles used at least once ÷ total active vehicles.",
      "Canteen efficiency = (portions ordered − leftover) ÷ portions ordered.",
      "Critical supplies stock = out of stock or under 14 days' cover based on this period's average usage.",
      "13-month trend charts: ▲▼ under each month = change from the previous month.",
      "Security: transporter violations read directly from G-C (Accept cases; cases counted per report, types per finding).",
    ] : [
      `Periode laporan ${report.periodLabel}; pembanding ${report.prevLabel} (periode kalender sebelumnya untuk bulan/kuartal/tahun penuh; selain itu rentang sama panjang tepat sebelumnya).`,
      "Sumber data: aplikasi CIKOPS-FM (penugasan driver, armada & gate, klaim driver, laporan kantin harian, transaksi ATK, input bulanan security).",
      "Utilisasi armada = kendaraan aktif yang dipakai minimal sekali ÷ total kendaraan aktif.",
      "Efisiensi kantin = (porsi dipesan − sisa) ÷ porsi dipesan.",
      "Stok ATK kritis = stok habis atau hanya cukup < 14 hari berdasarkan pemakaian rata-rata periode ini.",
      "Grafik tren 13 bulan: ▲▼ di bawah tiap bulan = perubahan dari bulan sebelumnya.",
      "Security: pelanggaran transporter dibaca langsung dari G-C (status Accept; kasus dihitung per laporan, jenis per temuan).",
    ];
    card(s, 0.5, 1.35, W - 1, 5.5);
    bullets(s, notes, 0.8, 1.6, W - 1.6, 5.1, "●", "8FB2FF", 14);
    footer(s);
  }

  await pres.writeFile({ fileName: `${filename}.pptx` });
}

/** Ukuran huruf angka KPI supaya muat satu baris (perkiraan lebar karakter ±0.55 em). */
function valSize(text: string, widthIn: number, max: number): number {
  const fit = (widthIn * 72) / (Math.max(1, text.length) * 0.66);
  return Math.max(11, Math.min(max, Math.floor(fit)));
}

function sectionTitle(pres: Pres, s: Slide, text: string, x: number, y: number, w: number, color: string) {
  s.addText(text, { x, y, w, h: 0.38, fontFace: HEAD, fontSize: 17, bold: true, color: TXT });
  s.addShape(pres.ShapeType.rect, { x, y: y + 0.42, w: 0.6, h: 0.05, fill: { color }, line: { color } });
}

function bullets(s: Slide, items: string[], x: number, y: number, w: number, h: number, mark: string, markColor: string, size = 13) {
  if (!items.length) return;
  const runs = items.flatMap((t) => [
    { text: `${mark}  `, options: { color: markColor, bold: true } },
    { text: t, options: { color: TXT, breakLine: true } },
  ]);
  s.addText(runs, { x, y, w, h, fontFace: BODY, fontSize: size, valign: "top", paraSpaceAfter: 9, fit: "shrink" });
}

function kpiRow(pres: Pres, s: Slide, m: ModuleReport, x: number, y: number, w: number) {
  const n = m.kpis.length, gap = 0.16;
  const kw = (w - gap * (n - 1)) / Math.max(1, n);
  m.kpis.forEach((k, i) => {
    const kx = x + i * (kw + gap);
    s.addShape(pres.ShapeType.roundRect, { x: kx, y, w: kw, h: 1.2, fill: { color: SURF }, line: { color: BORDER, width: 0.75 }, rectRadius: 0.1 });
    s.addShape(pres.ShapeType.rect, { x: kx + 0.14, y, w: kw - 0.28, h: 0.05, fill: { color: hex(m.accent) }, line: { color: hex(m.accent) } });
    s.addText(k.label.toUpperCase(), { x: kx + 0.14, y: y + 0.12, w: kw - 0.28, h: 0.26, fontFace: BODY, fontSize: 8.5, bold: true, color: DIM, fit: "shrink" });
    s.addText(k.value, { x: kx + 0.14, y: y + 0.38, w: kw - 0.28, h: 0.48, fontFace: HEAD, fontSize: valSize(k.value, kw - 0.28, 24), bold: true, color: TXT, fit: "shrink" });
    if (k.sub) s.addText(k.sub, { x: kx + 0.14, y: y + 0.86, w: kw - 0.28, h: 0.28, fontFace: BODY, fontSize: 9, color: TONE[k.tone || "neutral"], fit: "shrink" });
  });
}

/** Grafik sebagai gambar (sama persis dengan pratinjau di aplikasi) di kartu putih. */
function chartCard(pres: Pres, s: Slide, c: ChartSpec, x: number, y: number, w: number, h: number, wide: boolean) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" }, rectRadius: 0.1 });
  s.addText(c.title, { x: x + 0.2, y: y + 0.08, w: w - 0.4, h: 0.38, fontFace: BODY, fontSize: 12.5, bold: true, color: INK, fit: "shrink" });
  const pw = wide ? 1100 : 640, ph = 400;
  const img = renderChartPNG(c, pw, ph, "jpeg");
  if (!img) return;
  const maxW = w - 0.3, maxH = h - 0.6;
  let iw = maxW, ih = (maxW * ph) / pw;
  if (ih > maxH) { ih = maxH; iw = (maxH * pw) / ph; }
  s.addImage({ data: img.replace(/^data:/, ""), x: x + (w - iw) / 2, y: y + 0.5, w: iw, h: ih });
}
