/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — penggambar grafik ke PNG (canvas, di browser).
   Dipakai PDF, Excel, dan pratinjau. PowerPoint memakai grafik asli PPT.
   Gaya: bersih, latar putih, label nilai langsung di grafik (manajemen
   tidak perlu membaca sumbu), tanpa garis berlebihan.
════════════════════════════════════════════════════════════ */

import { SERIES_COLORS, fmtNum, fmtVal, getReportLang, tr, type ChartSpec } from "./model";

const FONT = "Helvetica, Arial, sans-serif";
const INK = "#1E293B";
const MUTED = "#64748B";
const GRID = "#E2E8F0";

function shortVal(n: number, unit: ChartSpec["unit"]): string {
  if (unit === "rp") {
    const v = Math.abs(n);
    const en = getReportLang() === "en";
    if (v >= 1_000_000) return `${fmtNum(n / 1_000_000, 1)}${en ? "M" : " jt"}`;
    if (v >= 1_000) return `${fmtNum(n / 1_000, 0)}${en ? "K" : " rb"}`;
    return fmtNum(n);
  }
  if (unit === "pct") return `${fmtNum(n, 1)}%`;
  return fmtNum(n);
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return s * p;
}

function legend(ctx: CanvasRenderingContext2D, items: { name: string; color: string }[], x: number, y: number, maxW: number) {
  ctx.font = `600 12px ${FONT}`;
  let cx = x;
  items.forEach((it) => {
    const w = ctx.measureText(it.name).width + 26;
    if (cx + w > x + maxW) return;
    ctx.fillStyle = it.color;
    ctx.beginPath(); ctx.roundRect(cx, y - 5, 10, 10, 2); ctx.fill();
    ctx.fillStyle = MUTED; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(it.name, cx + 15, y);
    cx += w;
  });
}

/** Gambar grafik → data URL PNG. w/h dalam piksel CSS; dirender 2× agar tajam di cetak. */
export function renderChartPNG(spec: ChartSpec, w = 640, h = 340, format: "png" | "jpeg" = "png"): string {
  if (typeof document === "undefined") return "";
  const scale = 2;
  const cv = document.createElement("canvas");
  cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  const allZero = spec.series.every((s) => s.values.every((v) => !v));
  if (spec.labels.length === 0 || allZero) {
    ctx.fillStyle = MUTED; ctx.font = `500 14px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tr("Belum ada data pada periode ini", "No data for this period"), w / 2, h / 2);
    return format === "jpeg" ? cv.toDataURL("image/jpeg", 0.9) : cv.toDataURL("image/png");
  }

  if (spec.type === "donut") drawDonut(ctx, spec, w, h);
  else if (spec.type === "hbar") drawHBar(ctx, spec, w, h);
  else if (spec.type === "line") drawLine(ctx, spec, w, h);
  else drawBars(ctx, spec, w, h, spec.type === "stacked");
  return format === "jpeg" ? cv.toDataURL("image/jpeg", 0.9) : cv.toDataURL("image/png");
}

function deltaColor(d: number, goodUp: boolean | null | undefined): string {
  if (Math.abs(d) < 0.5) return "#94A3B8";
  if (goodUp === null || goodUp === undefined) return d > 0 ? "#1D4ED8" : "#B45309";
  return (d > 0) === goodUp ? "#047857" : "#B91C1C";
}

function drawBars(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number, stacked: boolean) {
  const multi = spec.series.length > 1;
  const trend = Array.isArray(spec.deltas);
  const top = multi ? 34 : 18, bottom = trend ? 58 : 40, left = 16, right = 16;
  const ph = h - top - bottom, pw = w - left - right;
  const totals = spec.labels.map((_, i) => (stacked ? spec.series.reduce((s, se) => s + (se.values[i] || 0), 0) : Math.max(...spec.series.map((se) => se.values[i] || 0))));
  const max = niceMax(Math.max(...totals) * 1.12);
  if (multi) legend(ctx, spec.series, left, 14, pw);

  ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, top + ph + 0.5); ctx.lineTo(left + pw, top + ph + 0.5); ctx.stroke();

  const n = spec.labels.length;
  const slot = pw / n;
  const groupW = Math.min(slot * (trend ? 0.7 : 0.62), 70);
  const valFont = n > 9 ? 10.5 : 12;
  spec.labels.forEach((lab, i) => {
    const cx = left + slot * i + slot / 2;
    const isLast = i === n - 1;
    ctx.globalAlpha = trend && !isLast ? 0.5 : 1;
    if (stacked) {
      let y = top + ph;
      spec.series.forEach((se) => {
        const v = se.values[i] || 0;
        const bh = (v / max) * ph;
        ctx.fillStyle = se.color;
        ctx.fillRect(cx - groupW / 2, y - bh, groupW, bh);
        y -= bh;
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK; ctx.font = `700 ${valFont}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      if (totals[i] > 0) ctx.fillText(shortVal(totals[i], spec.unit), cx, y - 4);
    } else {
      const bw = groupW / spec.series.length;
      spec.series.forEach((se, k) => {
        const v = se.values[i] || 0;
        const bh = (v / max) * ph;
        const x = cx - groupW / 2 + k * bw;
        ctx.globalAlpha = trend && !isLast ? 0.5 : 1;
        ctx.fillStyle = se.color;
        ctx.beginPath(); ctx.roundRect(x + 1, top + ph - bh, bw - 2, bh, [4, 4, 0, 0]); ctx.fill();
        ctx.globalAlpha = 1;
        if (v > 0 && (!multi || n <= 8)) {
          ctx.fillStyle = INK; ctx.font = `700 ${multi ? 10.5 : valFont}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(shortVal(v, spec.unit), x + bw / 2, top + ph - bh - 4);
        }
      });
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = trend && isLast ? INK : MUTED; ctx.font = `${trend && isLast ? 700 : 500} ${n > 9 ? 10.5 : 11.5}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, lab, slot - 2), cx, top + ph + 8);
    if (trend) {
      const d = spec.deltas![i];
      const txt = d === null || d === undefined ? "·" : Math.abs(d) < 0.5 ? "0%" : `${d > 0 ? "▲" : "▼"}${fmtNum(Math.abs(d), Math.abs(d) >= 10 ? 0 : 1)}%`;
      ctx.fillStyle = d === null || d === undefined ? "#CBD5E1" : deltaColor(d, spec.goodUp);
      ctx.font = `700 ${n > 9 ? 10 : 11}px ${FONT}`;
      ctx.fillText(fit(ctx, txt, slot), cx, top + ph + 24);
    }
  });
  if (trend && spec.note) {
    ctx.fillStyle = MUTED; ctx.font = `500 10.5px ${FONT}`; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText(spec.note, left + pw, h - 2);
  }
}

function drawHBar(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number) {
  const se = spec.series[0];
  const n = spec.labels.length;
  const top = 10, bottom = 10;
  const labelW = Math.min(190, w * 0.36);
  const valueW = 78;
  const pw = w - labelW - valueW - 24;
  const rowH = Math.min(40, (h - top - bottom) / n);
  const max = Math.max(...se.values, 1);
  spec.labels.forEach((lab, i) => {
    const y = top + i * rowH + rowH / 2;
    const v = se.values[i] || 0;
    ctx.fillStyle = INK; ctx.font = `600 12.5px ${FONT}`; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, lab, labelW - 8), labelW, y);
    ctx.fillStyle = "#F1F5F9";
    ctx.beginPath(); ctx.roundRect(labelW + 10, y - rowH * 0.3, pw, rowH * 0.6, 5); ctx.fill();
    ctx.fillStyle = spec.colors?.[i] || se.color;
    ctx.globalAlpha = i === 0 ? 1 : 0.78;
    ctx.beginPath(); ctx.roundRect(labelW + 10, y - rowH * 0.3, Math.max(4, (v / max) * pw), rowH * 0.6, 5); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK; ctx.font = `700 12.5px ${FONT}`; ctx.textAlign = "left";
    ctx.fillText(shortVal(v, spec.unit), labelW + 16 + pw, y);
  });
}

function drawLine(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number) {
  const top = 34, bottom = 40, left = 16, right = 20;
  const ph = h - top - bottom, pw = w - left - right;
  const vals = spec.series.flatMap((s) => s.values).filter((v) => v > 0);
  const lo = spec.unit === "pct" ? Math.max(0, Math.floor((Math.min(...vals, 100) - 5) / 5) * 5) : 0;
  const hi = spec.unit === "pct" ? 100 : niceMax(Math.max(...vals, 1) * 1.1);
  legend(ctx, spec.series, left, 14, pw);
  const n = spec.labels.length;
  const x = (i: number) => left + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
  const y = (v: number) => top + ph - ((Math.max(lo, v) - lo) / (hi - lo || 1)) * ph;
  ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((f) => {
    const yy = top + ph * f + 0.5;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(left + pw, yy); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.font = `500 10.5px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(shortVal(hi - (hi - lo) * f, spec.unit), left + 2, yy - 2);
  });
  spec.series.forEach((se) => {
    ctx.strokeStyle = se.color; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    se.values.forEach((v, i) => { if (!v) return; if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v)); });
    ctx.stroke();
    se.values.forEach((v, i) => {
      if (!v) return;
      ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(x(i), y(v), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = se.color; ctx.lineWidth = 2.5; ctx.stroke();
    });
    const lastI = se.values.map((v, i) => (v ? i : -1)).filter((i) => i >= 0).pop();
    if (lastI !== undefined) {
      ctx.fillStyle = se.color; ctx.font = `700 12px ${FONT}`; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText(shortVal(se.values[lastI], spec.unit), x(lastI), y(se.values[lastI]) - 8);
    }
  });
  spec.labels.forEach((lab, i) => {
    ctx.fillStyle = MUTED; ctx.font = `500 11.5px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, lab, pw / n + 10), x(i), top + ph + 8);
  });
}

function drawDonut(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number) {
  const vals = spec.series[0].values;
  const total = vals.reduce((s, v) => s + v, 0) || 1;
  const r = Math.min(h * 0.4, w * 0.22);
  const cx = r + 24, cy = h / 2;
  let a = -Math.PI / 2;
  vals.forEach((v, i) => {
    if (!v) return;
    const ang = (v / total) * Math.PI * 2;
    ctx.fillStyle = spec.colors?.[i] || SERIES_COLORS[i % SERIES_COLORS.length];
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + ang); ctx.closePath(); ctx.fill();
    a += ang;
  });
  ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.font = `800 ${Math.round(r * 0.3)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(spec.unit === "rp" ? shortVal(total, "rp") : fmtNum(total), cx, cy - 6);
  ctx.fillStyle = MUTED; ctx.font = `600 11px ${FONT}`;
  ctx.fillText("total", cx, cy + r * 0.2);

  const lx = cx + r + 30, lw = w - lx - 12;
  const rows = spec.labels.map((l, i) => ({ l, v: vals[i] || 0, c: spec.colors?.[i] || SERIES_COLORS[i % SERIES_COLORS.length] })).filter((x) => x.v > 0);
  const rowH = Math.min(30, (h - 20) / Math.max(1, rows.length));
  const y0 = cy - (rows.length * rowH) / 2 + rowH / 2;
  rows.forEach((row, i) => {
    const y = y0 + i * rowH;
    ctx.fillStyle = row.c; ctx.beginPath(); ctx.roundRect(lx, y - 6, 12, 12, 3); ctx.fill();
    ctx.fillStyle = INK; ctx.font = `600 12.5px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, row.l, lw - 120), lx + 20, y);
    ctx.font = `700 12.5px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(`${fmtNum((row.v / total) * 100, 0)}%`, lx + lw, y);
    ctx.fillStyle = MUTED; ctx.font = `500 11px ${FONT}`;
    ctx.fillText(fmtVal(row.v, spec.unit), lx + lw - 44, y);
  });
}
