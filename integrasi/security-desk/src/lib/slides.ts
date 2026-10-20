/**
 * Generator slide laporan bulanan. Formatnya meniru laporan G4S yang
 * biasa dikirim ke FFI (1280×720, grafik batang 3D, kotak highlight navy,
 * footer merah). Output berupa HTML string; semua teks dari pengguna di-escape.
 */
import { CATS, KPI_OBJ, MON, MONTH_ID, TEAM_KEYS, dec, esc, fmt, type Cat, type ExtraKey } from "./constants";
import { last13, monthLabelEn, parseMonth } from "./dates";
import { agg, catHighlights, incOrdered, incTotal, kpiCalc, monthName, monthsOpen, patrolPct } from "./calc";
import type { MonthData, Site } from "./types";

interface Series { values: number[]; front: string; side: string; top: string }
const BLUE = { front: "#3366FF", side: "#2244BB", top: "#6E92FF" };
const RED = { front: "#FF0000", side: "#A80000", top: "#FF5C5C" };

function bar3d(o: { labels: string[]; series: Series[]; W: number; H: number; rotate?: boolean; legend?: boolean; labelSize?: number; bottom?: number }) {
  const { labels, series, W, H, rotate, legend } = o;
  const padL = rotate && o.bottom ? 70 : 22, padR = 28, dx = 9, dy = -7, top = legend ? 64 : 40, base = H - (o.bottom || (rotate ? 74 : 34));
  const n = labels.length, m = series.length, plotW = W - padL - padR - dx, gw = plotW / n, bw = m === 1 ? gw * 0.56 : gw * 0.34;
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.02, span = base - top - 26, fs = o.labelSize || 13;
  let s = `<polygon points="${padL - 6},${base + 5} ${padL + plotW + 6},${base + 5} ${padL + plotW + 6 + dx * 1.7},${base + 5 + dy * 1.7} ${padL - 6 + dx * 1.7},${base + 5 + dy * 1.7}" fill="#C9C300" stroke="#7a7600" stroke-width="1"/>`;
  let lab = "";
  labels.forEach((L, i) => {
    const gx = padL + i * gw + (gw - bw * m) / 2;
    series.forEach((se, j) => {
      const v = se.values[i] || 0, h = (v / max) * span, x = gx + j * bw, y = base - h;
      if (h > 0) {
        s += `<polygon points="${x + bw},${y} ${x + bw + dx},${y + dy} ${x + bw + dx},${base + dy} ${x + bw},${base}" fill="${se.side}" stroke="#111" stroke-width=".6"/>`;
        s += `<polygon points="${x},${y} ${x + dx},${y + dy} ${x + bw + dx},${y + dy} ${x + bw},${y}" fill="${se.top}" stroke="#111" stroke-width=".6"/>`;
        s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${se.front}" stroke="#111" stroke-width=".6"/>`;
      }
      const t = String(v), tw = t.length * (fs * 0.62) + 10, cx = x + bw / 2 + dx / 2, by = Math.min(y, base) + dy - fs - 11;
      lab += `<rect x="${cx - tw / 2 + 2}" y="${by + 2}" width="${tw}" height="${fs + 8}" fill="#555" opacity=".45"/><rect x="${cx - tw / 2}" y="${by}" width="${tw}" height="${fs + 8}" fill="#FF0000" stroke="#fff"/><text x="${cx}" y="${by + fs + 2}" font-size="${fs}" font-weight="700" fill="#fff" text-anchor="middle">${t}</text>`;
    });
    const lx = gx + (bw * m) / 2;
    s += rotate
      ? `<text x="${lx + 6}" y="${base + 18}" font-size="13" font-weight="700" fill="#000" text-anchor="end" transform="rotate(-38 ${lx + 6} ${base + 18})">${esc(L)}</text>`
      : `<text x="${lx}" y="${base + 26}" font-size="14" font-weight="700" fill="#000" text-anchor="middle">${esc(L)}</text>`;
  });
  let lg = "";
  if (legend) {
    const cx = W / 2;
    lg = `<rect x="${cx - 86}" y="14" width="10" height="10" fill="#3366FF" stroke="#111" stroke-width=".6"/><text x="${cx - 72}" y="23" font-size="13" font-weight="700">Weekday</text><rect x="${cx + 6}" y="14" width="10" height="10" fill="#FF0000" stroke="#111" stroke-width=".6"/><text x="${cx + 20}" y="23" font-size="13" font-weight="700">Weekend</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial,Helvetica,sans-serif">${s}${lab}${lg}</svg>`;
}

function donut(pct: number, col: string, W: number) {
  const r = 100, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, pct / 100));
  return `<svg viewBox="0 0 280 280" width="${W}" height="${W}"><circle cx="140" cy="140" r="${r}" fill="none" stroke="${col}" stroke-width="54" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 140 140)"/><circle cx="140" cy="140" r="${r}" fill="none" stroke="#E1001A" stroke-width="54" stroke-dasharray="${c * (1 - f)} ${c}" stroke-dashoffset="${-c * f}" transform="rotate(-90 140 140)"/><text x="140" y="148" text-anchor="middle" font-size="28" font-weight="700" font-family="Arial">${dec(pct)}%</text></svg>`;
}

const hl = (items: string[], title: string, italic?: boolean) =>
  `<h4>${title}</h4><ul>${items.filter(Boolean).map((t) => `<li class="${italic ? "n" : ""}">${t}</li>`).join("")}</ul>`;

export interface SlideCtx { D: MonthData; site: Site | null }
function frame(ctx: SlideCtx, title: string, body: string, page: number) {
  const { name, year } = monthName(ctx.D.month);
  const client = esc(ctx.site ? `${ctx.site.client ?? ""} · ${ctx.site.name}` : "");
  return `<div class="sl"><div class="st">${esc(title)}</div><div class="corner"><b>SECURITY MONTHLY REPORT</b>${client}</div>${body}<div class="foot"><span>Periode ${name} ${year}</span><i>${page}</i></div></div>`;
}

function slideCat(ctx: SlideCtx, c: Cat, page: number) {
  const D = ctx.D, a = agg(D, c.k), vals = D.totals13[c.k], h = catHighlights(D, c), { name, year } = monthName(D.month);
  const months = last13(D.month), y0 = parseMonth(months[0]).y;
  const annual = bar3d({ labels: months.map(monthLabelEn), series: [{ values: vals, ...BLUE }], W: 584, H: 318, rotate: true, labelSize: Math.max(...vals) > 9999 ? 11 : 12 });
  const weekly = bar3d({ labels: ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4", "Minggu 5"], series: [{ values: a.wd, ...BLUE }, { values: a.we, ...RED }], W: 584, H: 318, legend: true, labelSize: 12 });
  return frame(ctx, c.t,
    `<div class="pan" style="left:0;top:92px;width:600px;height:380px"><div class="ct">ANNUAL CHART ${c.c}<br>PERIODE ${y0} - ${year}</div>${annual}</div>
     <div class="hb" style="left:0;top:472px;width:600px;height:196px">${hl(h.left.map(esc), "HIGHLIGHTS")}</div>
     <div class="pan" style="left:680px;top:92px;width:600px;height:380px"><div class="ct">WEEKLY CHART ${c.c}<br>PERIODE ${name.toUpperCase()} ${year}</div>${weekly}</div>
     <div class="hb" style="left:680px;top:472px;width:600px;height:196px">${hl(h.right.map(esc), "Highlights", true)}</div>`, page);
}

function slideInc(ctx: SlideCtx, page: number) {
  const D = ctx.D, ord = incOrdered(D), { name, year, prevName } = monthName(D.month);
  const items = [...D.inc].filter((i) => i.value > 0).sort((a, b) => b.value - a.value).map((i) => {
    let t = `<u>${esc(i.category)}</u>: ${i.value} kejadian`;
    const p = D.incPrev[i.category];
    if (p !== null && p !== undefined) { const d = i.value - p; t += `, ${d < 0 ? "turun" : "naik"} ${Math.abs(d)} dibanding ${prevName} (${p})`; }
    return t + (i.note ? `. ${esc(i.note)}` : ".");
  });
  const ch = bar3d({ labels: ord.map((i) => i.category), series: [{ values: ord.map((i) => i.value), ...BLUE }], W: 790, H: 500, rotate: true, labelSize: 13, bottom: 130 });
  return frame(ctx, `GRAFIK LAPORAN KEJADIAN ${name.toUpperCase()} ${year}`,
    `<div class="hb" style="left:0;top:92px;width:470px;height:576px;font-size:16px">${hl(items, "HIGHLIGHTS")}</div>
     <div class="pan" style="left:470px;top:92px;width:810px;height:576px;border:0"><div class="ct">TOTAL ${incTotal(D)} KEJADIAN · ${name.toUpperCase()} ${year}</div><div style="padding:10px 10px 0">${ch}</div></div>`, page);
}

function slidePatrol(ctx: SlideCtx, page: number) {
  const p = ctx.D.patrol, pc = patrolPct(ctx.D), ps = p.target_patrol ? (p.actual_patrol / p.target_patrol) * 100 : 0, c = "text-align:center;font-weight:700";
  return frame(ctx, "PATROL ACTIVITY REPORT",
    `<div class="pan" style="left:40px;top:92px;width:590px;height:350px;text-align:center"><div class="ct">TOUR CHECKPOINT</div>${donut(pc, "#8CCB4F", 270)}</div>
     <div class="pan" style="left:650px;top:92px;width:590px;height:350px;text-align:center"><div class="ct">TOUR SCHEDULE</div>${donut(ps, "#12A9E6", 270)}</div>
     <div style="position:absolute;left:40px;top:460px;width:1200px"><table><tr><th>Target Patrol</th><th>Target Checkpoint</th><th>Actual Patrol</th><th>Actual Checkpoint</th><th>Missed</th></tr>
     <tr><td style="${c}">${fmt(p.target_patrol)}</td><td style="${c}">${fmt(p.target_checkpoint)}</td><td style="${c}">${fmt(p.actual_patrol)}</td><td style="${c}">${fmt(p.actual_checkpoint)}</td><td style="${c};color:#E1001A">${fmt(p.target_checkpoint - p.actual_checkpoint)}</td></tr></table>
     <div style="margin-top:14px;background:#F6A99F;padding:14px 20px;font-size:16px;border:1px solid #333"><b>Catatan:</b> ${esc(p.note) || "-"}</div></div>`, page);
}

function slideLeave(ctx: SlideCtx, page: number) {
  const rows = ctx.D.leaves.map((l, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.date_text)}</td><td>${esc(l.type)}</td><td>${l.backup ? esc(l.backup) : '<span class="tag" style="background:#FDE7EA;color:#C4122F">Tanpa backup</span>'}</td></tr>`).join("");
  return frame(ctx, "DATA BACKUP, CUTI & SAKIT", `<div style="position:absolute;left:52px;right:52px;top:100px"><table><tr><th>No</th><th>Nama</th><th>Tanggal</th><th>Keterangan</th><th>Backup</th></tr>${rows || '<tr><td colspan="5" style="text-align:center">Tidak ada cuti atau sakit bulan ini.</td></tr>'}</table></div>`, page);
}

function slideNI(ctx: SlideCtx, page: number) {
  const col: Record<string, string> = { Open: "#C4122F", Proses: "#B86A00", Selesai: "#1C8A4E" };
  const rows = ctx.D.improvements.map((n, i) => { const { y, m0 } = parseMonth(n.opened_month); return `<tr><td style="text-align:center">${i + 1}</td><td>${MON[m0]} ${y}</td><td>${esc(n.description)}</td><td>${esc(n.priority)}</td><td>${n.progress ? esc(n.progress) : "-"}</td><td style="text-align:center"><span class="tag" style="color:#fff;background:${col[n.status]}">${n.status}</span></td><td style="text-align:center">${monthsOpen(n.opened_month, ctx.D.month)} bln</td></tr>`; }).join("");
  return frame(ctx, "NEED IMPROVEMENT", `<div style="position:absolute;left:40px;right:40px;top:96px"><table style="font-size:14px"><tr><th>No</th><th>Dibuka</th><th>Deskripsi</th><th>Tingkat</th><th>Progres</th><th>Status</th><th>Umur</th></tr>${rows}</table></div>`, page);
}

function slideKPI(ctx: SlideCtx, page: number) {
  const D = ctx.D, k = kpiCalc(D), { m0 } = parseMonth(D.month), { year } = monthName(D.month);
  const mi = [m0 - 2, m0 - 1, m0].filter((x) => x >= 0), cc = "text-align:center", R = "background:#E1001A;border-color:#E1001A";
  const rows = KPI_OBJ.map((o, i) => `<tr><td style="${cc}">${i + 1}</td><td>${o[0]}</td><td style="${cc}">${o[1]}%</td>${mi.map((m) => { const v = D.kpi[i][m]; return `<td style="${cc}">${v ?? ""}</td><td style="${cc};background:#E4E6EB">${v === null ? "" : dec((v * o[1]) / 100)}</td>`; }).join("")}<td style="${cc}">${dec(k.rows[i].avg)}</td><td style="${cc};font-weight:700">${dec(k.rows[i].w)}</td></tr>`).join("");
  const mf = (m: number) => (k.monthly[m] === null ? "-" : dec(k.monthly[m] as number));
  return frame(ctx, "KEY PERFORMANCE INDICATOR", `<div style="position:absolute;left:40px;right:40px;top:96px"><table style="font-size:14px"><tr><th rowspan="2">No</th><th rowspan="2">Objectives</th><th rowspan="2">Bobot</th>${mi.map((m) => `<th colspan="2">${MONTH_ID[m]} ${year}</th>`).join("")}<th colspan="2" style="${R}">YTD ${year}</th></tr>
  <tr>${mi.map(() => "<th>Score</th><th>Final</th>").join("")}<th style="${R}">Rata-rata</th><th style="${R}">Final</th></tr>${rows}
  <tr><td colspan="3" style="text-align:right;font-weight:700">FINAL SCORE</td>${mi.map((m) => `<td colspan="2" style="${cc};font-weight:700">${mf(m)}</td>`).join("")}<td colspan="2" style="${cc};font-weight:800;font-size:18px;background:#FFF3B0">${dec(k.final)}</td></tr></table>
  <p style="font-size:13px;color:#444;margin-top:10px">Skor YTD = rata-rata bulan yang sudah dinilai (${k.rows[0].n} bulan) × bobot. Skala 1–5.</p></div>`, page);
}

/** Jumlah per minggu (hari kerja / libur) untuk data harian tambahan. */
function weekX(D: SlideCtx["D"], keys: ExtraKey[]) {
  const wd = [0, 0, 0, 0, 0], we = [0, 0, 0, 0, 0];
  D.days.forEach((x) => { const v = keys.reduce((a, k) => a + (D.extraDaily[k][x.d - 1] || 0), 0); (x.we ? we : wd)[x.wk - 1] += v; });
  return { wd, we, total: [...wd, ...we].reduce((a, b) => a + b, 0) };
}

function slideTransporter(ctx: SlideCtx, page: number) {
  const D = ctx.D, { name, year } = monthName(D.month), wk = ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4", "Minggu 5"];
  const t = weekX(D, ["timbang"]), non = weekX(D, ["non_timbang"]).total, b = weekX(D, ["sekam", "abu"]);
  const sekam = weekX(D, ["sekam"]).total, abu = weekX(D, ["abu"]).total;
  const chT = bar3d({ labels: wk, series: [{ values: t.wd, ...BLUE }, { values: t.we, ...RED }], W: 584, H: 300, legend: true, labelSize: 12 });
  const chB = bar3d({ labels: wk, series: [{ values: b.wd, ...BLUE }, { values: b.we, ...RED }], W: 584, H: 300, legend: true, labelSize: 12 });
  const left = [`Kendaraan timbang ${fmt(t.total)} unit dan non-timbang ${fmt(non)} unit, total ${fmt(t.total + non)} unit transporter material.`,
    `Selisih timbang ≥ 40 kg: ${fmt(D.extra.selisih_timbang)} kejadian${D.extra.palm_oil ? `, ${fmt(D.extra.palm_oil)} di antaranya kendaraan Palm Oil / Fat Blend` : ""}.`];
  const right = [`Suplai sekam ${fmt(sekam)} unit dan buang abu ${fmt(abu)} unit, total ${fmt(sekam + abu)} kendaraan biomas.`];
  return frame(ctx, `TRANSPORTER MATERIAL & BIOMAS ${name.toUpperCase()} ${year}`,
    `<div class="pan" style="left:0;top:92px;width:600px;height:360px"><div class="ct">KENDARAAN TIMBANG PER MINGGU<br>PERIODE ${name.toUpperCase()} ${year}</div>${chT}</div>
     <div class="hb" style="left:0;top:452px;width:600px;height:216px">${hl(left.map(esc), "HIGHLIGHTS")}</div>
     <div class="pan" style="left:680px;top:92px;width:600px;height:360px"><div class="ct">BIOMAS PT BECIS (SEKAM + ABU)<br>PERIODE ${name.toUpperCase()} ${year}</div>${chB}</div>
     <div class="hb" style="left:680px;top:452px;width:600px;height:216px">${hl(right.map(esc), "Highlights", true)}</div>`, page);
}

function slideVisitIssue(ctx: SlideCtx, page: number) {
  const D = ctx.D, x = D.extra, c = "text-align:center";
  const team = `<table><tr>${TEAM_KEYS.map((k) => `<th>${esc(k)}</th>`).join("")}<th>Total</th></tr><tr>${TEAM_KEYS.map((k) => `<td style="${c};font-weight:700">${fmt(x.team[k] || 0)}</td>`).join("")}<td style="${c};font-weight:800">${fmt(TEAM_KEYS.reduce((a, k) => a + (x.team[k] || 0), 0))}</td></tr></table>
    <div style="margin-top:10px;background:#F6A99F;padding:10px 16px;font-size:15px;border:1px solid #333"><b>Catatan:</b> ${esc(x.team_note) || "-"}</div>`;
  const rows = D.issues.map((i, n) => { const [, m, d] = i.day.split("-"); return `<tr><td style="${c}">${n + 1}</td><td style="${c}">${Number(d)} ${MON[Number(m) - 1]}</td><td>${esc(i.category)}</td><td>${esc(i.description)}</td><td style="${c}"><span class="tag" style="color:#fff;background:${i.status === "Open" ? "#C4122F" : "#1C8A4E"}">${i.status}</span></td></tr>`; }).join("");
  return frame(ctx, "KUNJUNGAN TEAM SUPPORT & ISSUE AREA",
    `<div style="position:absolute;left:40px;right:40px;top:96px"><h4 style="margin:0 0 8px">Kunjungan team support pengamanan</h4>${team}
     <h4 style="margin:22px 0 8px">Issue area</h4><table style="font-size:14px"><tr><th>No</th><th>Tanggal</th><th>Jenis</th><th>Kejadian</th><th>Status</th></tr>${rows || '<tr><td colspan="5" style="text-align:center">Tidak ada issue area bulan ini.</td></tr>'}</table></div>`, page);
}

export interface SlideDef { n: string; render: (ctx: SlideCtx, page: number) => string; go?: string; cat?: string; patrol?: boolean; extra?: boolean }
export const SLIDES: SlideDef[] = [
  { n: "Cuti & sakit", render: slideLeave, go: "/personel" },
  { n: "Kejadian", render: slideInc, go: "/kejadian" },
  ...CATS.map((c) => ({ n: c.n, render: (ctx: SlideCtx, p: number) => slideCat(ctx, c, p), cat: c.k })),
  { n: "Patroli", render: slidePatrol, patrol: true, go: "/kejadian" },
  { n: "Transporter & biomas", render: slideTransporter, go: "/harian", extra: true },
  { n: "Kunjungan & issue area", render: slideVisitIssue, go: "/kejadian", extra: true },
  { n: "Need improvement", render: slideNI, go: "/personel" },
  { n: "KPI", render: slideKPI, go: "/kpi" },
];

/** Apakah data untuk slide ini sudah lengkap (titik hijau/kuning). */
import { checks } from "./calc";
export function slideOk(D: MonthData, s: SlideDef, ch = checks(D)): boolean {
  const m0 = parseMonth(D.month).m0;
  if (s.patrol) return !!D.patrol.target_checkpoint;
  if (s.extra) return D.extraReady && (s.go === "/kejadian" || D.extraDaily.timbang.some((v) => v > 0));
  if (s.cat) return !ch.some((c) => c.go === "/harian");
  if (s.go === "/personel") return !ch.some((c) => c.go === "/personel");
  if (s.go === "/kejadian") return !ch.some((c) => c.go === "/kejadian" && !c.title.startsWith("Data patroli"));
  if (s.go === "/kpi") return D.kpi.some((r) => r[m0] !== null);
  return true;
}
