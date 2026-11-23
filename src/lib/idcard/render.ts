/* ════════════════════════════════════════════════════════════
   ID CARD — desain kartu & pembuat PDF A4.
   Sama dengan sistem ID Card lama: template gambar + 3 zona teks ({typeLabel}, {line2}, {idNum}) + logo tambahan,
   dicetak 200 dpi ke kertas A4 (kartu 54×85 mm, 3×3 per halaman).
════════════════════════════════════════════════════════════ */
import { MOCK_MODE } from "../brand";

export interface ZoneDef { y: number; fontSize: number; color: string; bold: boolean; font: string; content: string }
export interface LogoDef { id: string; name: string; src: string; visible: boolean; x: number; y: number; width: number; height: number }
export interface CardDesign {
  cardW: number; cardH: number;
  /** "" / null = template bawaan; selain itu data URL gambar hasil unggah */
  bgImg: string | null;
  zones: { line1: ZoneDef; line2: ZoneDef; idNum: ZoneDef };
  logos: LogoDef[];
}
export type ZoneKey = keyof CardDesign["zones"];
export interface CardContent { typeLabel: string; line2: string; idNum: string }

/** Template bawaan (hanya di deployment asli; demo memakai kartu polos buatan). */
export const DEFAULT_BG_URL = MOCK_MODE ? "" : "/idcard/template-default.jpg";

export function getDefaultDesign(): CardDesign {
  return {
    cardW: 54, cardH: 85, bgImg: null,
    zones: {
      line1: { y: 30, fontSize: 11, color: "#000000", bold: true, font: "Arial", content: "{typeLabel}" },
      line2: { y: 39, fontSize: 11, color: "#000000", bold: true, font: "Arial", content: "{line2}" },
      idNum: { y: 62, fontSize: 13, color: "#1f4a99", bold: true, font: "Arial", content: "{idNum}" },
    },
    logos: [],
  };
}

/** Lengkapi desain dari database (kolom yang kurang diisi bawaan). */
export function normalizeDesign(raw: unknown): CardDesign {
  const d = getDefaultDesign();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CardDesign>;
  const zone = (k: ZoneKey): ZoneDef => ({ ...d.zones[k], ...((r.zones && r.zones[k]) || {}) });
  return {
    cardW: Number(r.cardW) > 0 ? Number(r.cardW) : d.cardW,
    cardH: Number(r.cardH) > 0 ? Number(r.cardH) : d.cardH,
    bgImg: typeof r.bgImg === "string" && r.bgImg.startsWith("data:") ? r.bgImg : null,
    zones: { line1: zone("line1"), line2: zone("line2"), idNum: zone("idNum") },
    logos: Array.isArray(r.logos) ? r.logos.filter((l) => l && typeof l === "object").map((l) => ({ id: String(l.id), name: String(l.name ?? "Logo"), src: String(l.src ?? ""), visible: !!l.visible, x: Number(l.x) || 20, y: Number(l.y) || 10, width: Number(l.width) || 25, height: Number(l.height) || 18 })) : [],
  };
}

/* ── cache gambar ── */
const cache = new Map<string, HTMLImageElement>();
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const hit = cache.get(src);
  if (hit && hit.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { cache.set(src, img); resolve(img); };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
const cached = (src: string | null | undefined) => {
  if (!src) return null;
  const i = cache.get(src);
  return i && i.complete && i.naturalWidth > 0 ? i : null;
};
export const bgSrcOf = (d: CardDesign) => d.bgImg || DEFAULT_BG_URL;
/** Muat template + logo supaya gambar bisa dipakai saat menggambar. */
export async function preloadDesign(d: CardDesign): Promise<void> {
  await Promise.all([loadImage(bgSrcOf(d)), ...d.logos.filter((l) => l.src).map((l) => loadImage(l.src))]);
}

export const resolveText = (tpl: string, c: CardContent) =>
  (tpl || "").replaceAll("{typeLabel}", c.typeLabel).replaceAll("{type}", c.typeLabel).replaceAll("{line2}", c.line2).replaceAll("{idNum}", c.idNum);

/** Gambar satu kartu ke canvas (x, y, lebar, tinggi dalam piksel). Gambar harus sudah dimuat (preloadDesign). */
export function renderCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: CardContent, des: CardDesign) {
  ctx.save();
  const bg = cached(bgSrcOf(des));
  if (bg) ctx.drawImage(bg, x, y, w, h);
  else {
    // kartu polos bila template tidak ada
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, w, h);
    const bw = Math.max(2, w * 0.025);
    ctx.strokeStyle = "#1f4a99"; ctx.lineWidth = bw; ctx.strokeRect(x + bw / 2, y + bw / 2, w - bw, h - bw);
    ctx.fillStyle = "#000000"; ctx.fillRect(x, y + h * 0.462, w, Math.max(2, h * 0.012));
    ctx.fillStyle = "#1f4a99"; ctx.fillRect(x, y + h * 0.9, w, h * 0.1);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  (["line1", "line2", "idNum"] as ZoneKey[]).forEach((k) => {
    const z = des.zones[k];
    const text = resolveText(z.content, card);
    if (!text) return;
    const fs = Math.max(6, Math.round(w * (z.fontSize / 100)));
    ctx.font = `${z.bold ? "bold " : ""}${fs}px ${z.font || "Arial"}, sans-serif`;
    ctx.fillStyle = z.color || "#000000";
    ctx.fillText(text, x + w * 0.5, y + h * (z.y / 100), w * 0.88);
  });
  for (const logo of des.logos) {
    if (!logo.src || !logo.visible) continue;
    const img = cached(logo.src);
    if (!img) continue;
    const lw = w * (logo.width / 100), lh = h * (logo.height / 100);
    ctx.drawImage(img, x + w * (logo.x / 100) - lw / 2, y + h * (logo.y / 100) - lh / 2, lw, lh);
  }
  ctx.restore();
}

/** Jumlah kolom × baris kartu pada A4 (margin 8 mm, jarak 4 mm). */
export function a4Grid(cardW: number, cardH: number) {
  const gap = 4, margin = 8;
  return {
    cols: Math.max(1, Math.floor((210 - 2 * margin + gap) / (cardW + gap))),
    rows: Math.max(1, Math.floor((297 - 2 * margin + gap) / (cardH + gap))),
    gap,
  };
}

/** PDF A4 berisi semua kartu (nomor diberikan) — dirender 200 dpi seperti sistem lama. */
export async function buildCardsPdf(numbers: string[], typeLabel: string, lokasi: string, design: CardDesign) {
  const { jsPDF } = await import("jspdf");
  await preloadDesign(design);
  const A4W = 210, A4H = 297, DPI = 200, MM = DPI / 25.4;
  const { cols, rows, gap } = a4Grid(design.cardW, design.cardH);
  const totW = cols * design.cardW + (cols - 1) * gap, totH = rows * design.cardH + (rows - 1) * gap;
  const mx = (A4W - totW) / 2, my = (A4H - totH) / 2;
  const perPage = cols * rows;
  const cw = Math.round(design.cardW * MM), ch = Math.round(design.cardH * MM);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pages = Math.ceil(numbers.length / perPage);
  for (let p = 0; p < pages; p++) {
    if (p > 0) pdf.addPage();
    const cvs = document.createElement("canvas");
    cvs.width = Math.round(A4W * MM); cvs.height = Math.round(A4H * MM);
    const ctx = cvs.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cvs.width, cvs.height);
    numbers.slice(p * perPage, (p + 1) * perPage).forEach((num, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      renderCard(ctx, Math.round((mx + col * (design.cardW + gap)) * MM), Math.round((my + row * (design.cardH + gap)) * MM), cw, ch, { typeLabel, line2: lokasi || "CIKARANG", idNum: num }, design);
    });
    pdf.addImage(cvs.toDataURL("image/png", 1.0), "PNG", 0, 0, A4W, A4H, undefined, "FAST");
  }
  return { pdf, pages };
}

/** Perkecil gambar unggahan (maks. sisi panjang `max` px) → data URL JPEG/PNG agar tersimpan ringan di database. */
export async function shrinkImageFile(file: File, max = 1400, asPng = false): Promise<string> {
  const url: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Gagal membaca file")); r.readAsDataURL(file); });
  const img = await loadImage(url);
  if (!img) throw new Error("Gambar tidak bisa dimuat");
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext("2d")!;
  if (!asPng) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return asPng ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.88);
}
