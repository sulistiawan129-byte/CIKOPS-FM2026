/* IMPOR DATA KLAIM LAMA (dari Excel / hasil salin-tempel).
   Kolom yang dikenali (urutan bebas bila ada baris judul; tanpa judul dianggap urutan di bawah):
     Week | Tanggal Pengajuan | Periode Klaim | Nama Driver | Jenis Klaim | Nominal | Keterangan
   Satu baris = satu item (satu lembar nota). Baris dengan driver + tanggal pengajuan + periode yang sama
   digabung menjadi SATU klaim berisi banyak item. */

import { bucketForType } from "./claimRecap";
import type { ClaimItem } from "./types";

export type ClaimCat = "Gasoline" | "Toll" | "Parking" | "Service" | "Maintenance" | "Other";
export type MonthBy = "start" | "end" | "submission";

export interface ImportRow {
  line: number;
  submission: string;
  periodStart: string;
  periodEnd: string;
  periodText: string;
  periodOk: boolean;
  driverRaw: string;
  type: ClaimCat;
  amount: number;
  note: string;
}
export interface ImportIssue { line: number; text: string; reason: string }
export interface ParseResult { rows: ImportRow[]; issues: ImportIssue[]; headerFound: boolean; lines: number }

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function validIso(y: number, m: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2100) || m < 0 || m > 11 || d < 1) return null;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return d <= last ? iso(y, m, d) : null;
}

const MONTH3: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 };
const monthIdx = (name: string): number => MONTH3[name.toLowerCase().slice(0, 3)] ?? -1;

/** Tanggal dari teks ("2-May-2025", "02/05/2025", "2025-05-02"), objek Date (Excel), atau nomor seri Excel. */
export function parseDateCell(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validIso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-\/ .]+([A-Za-z]+)[-\/ ,.]+(\d{4})$/);
  if (m) { const mi = monthIdx(m[2]); return mi < 0 ? null : validIso(+m[3], mi, +m[1]); }
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) return validIso(+m[3], +m[2] - 1, +m[1]);
  return null;
}

/** "1 - 7 Mei 2025", "29 Mei  - 4 Juni 2025", "13-18 Agustus 2025", "01-07 October 2025". */
export function parsePeriod(text: string): { start: string; end: string } | null {
  const s = String(text ?? "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m = s.match(/(\d{1,2}) ?([A-Za-z]+) ?- ?(\d{1,2}) ?([A-Za-z]+) ?(\d{4})/); // lintas bulan
  if (m) {
    const sm = monthIdx(m[2]), em = monthIdx(m[4]); const y = +m[5];
    if (sm < 0 || em < 0) return null;
    const sy = sm > em ? y - 1 : y;
    const a = validIso(sy, sm, +m[1]), b = validIso(y, em, +m[3]);
    return a && b ? { start: a, end: b } : null;
  }
  m = s.match(/(\d{1,2}) ?- ?(\d{1,2}) ([A-Za-z]+) ?(\d{4})/); // satu bulan
  if (m) {
    const mi = monthIdx(m[3]); if (mi < 0) return null;
    const a = validIso(+m[4], mi, +m[1]), b = validIso(+m[4], mi, +m[2]);
    return a && b ? { start: a, end: b } : null;
  }
  m = s.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/); // satu tanggal
  if (m) { const mi = monthIdx(m[2]); const a = mi < 0 ? null : validIso(+m[3], mi, +m[1]); return a ? { start: a, end: a } : null; }
  return null;
}

/** "Rp16.500", " Rp 1.000.000 ", 16500 → angka bulat; null bila tidak terbaca. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) && v >= 0 ? Math.round(v) : null;
  let s = String(v ?? "").replace(/rp/gi, "").replace(/\s+/g, "").trim();
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(/,\d+$/, "");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "").replace(/\.\d+$/, "");
  else if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(/[.,]\d+$/, "");
  else return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function mapType(raw: string): { type: ClaimCat; extra: string } {
  const t = raw.trim().toLowerCase();
  if (/gas|bensin|bbm|solar|pertamax|fuel/.test(t)) return { type: "Gasoline", extra: "" };
  if (/toll|tol\b/.test(t)) return { type: "Toll", extra: "" };
  if (/park/.test(t)) return { type: "Parking", extra: "" };
  if (/servis|service/.test(t)) return { type: "Service", extra: "" };
  if (/maint|perawatan/.test(t)) return { type: "Maintenance", extra: "" };
  return { type: "Other", extra: t === "other" || t === "lainnya" || !t ? "" : raw.trim() };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function splitCells(line: string, sep: string): string[] { return line.split(sep); }

function detectSep(lines: string[]): string {
  const sample = lines.find((l) => l.trim()) ?? "";
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}

interface ColIdx { sub: number; per: number; drv: number; typ: number; amt: number; note: number }
const DEFAULT_COLS: ColIdx = { sub: 1, per: 2, drv: 3, typ: 4, amt: 5, note: 6 };

function colsFromHeader(cells: string[]): ColIdx | null {
  const low = cells.map((c) => norm(String(c ?? "")));
  const find = (re: RegExp) => low.findIndex((c) => re.test(c));
  const drv = find(/driver|nama/), amt = find(/nominal|jumlah|amount/);
  if (drv < 0 || amt < 0) return null;
  const sub = find(/pengajuan|submission|tanggal/);
  const per = find(/periode|period/);
  const typ = find(/jenis|type|kategori/);
  const note = find(/keterangan|catatan|note/);
  if (sub < 0 || typ < 0) return null;
  return { sub, per: per < 0 ? sub : per, drv, typ, amt, note };
}

/** Teks tempel-an (TSV dari Excel) → baris terstruktur + daftar baris bermasalah. */
export function parseSheetRows(table: unknown[][]): ParseResult {
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  let cols = DEFAULT_COLS;
  let headerFound = false;
  table.forEach((cells, i) => {
    const line = i + 1;
    if (cells.every((c) => String(c ?? "").trim() === "")) return;
    const asText = cells.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? "")));
    if (!headerFound && rows.length === 0) {
      const h = colsFromHeader(asText);
      if (h) { cols = h; headerFound = true; return; }
    }
    const submission = parseDateCell(cells[cols.sub]);
    const periodText = String(cells[cols.per] instanceof Date ? "" : cells[cols.per] ?? "").trim();
    const driverRaw = String(cells[cols.drv] ?? "").replace(/\s+/g, " ").trim();
    const typeRaw = String(cells[cols.typ] ?? "").trim();
    const amount = parseAmount(cells[cols.amt]);
    const note = String(cells[cols.note] ?? "").replace(/\s+/g, " ").trim();
    const raw = asText.join(" | ").slice(0, 120);
    if (!driverRaw) { issues.push({ line, text: raw, reason: "Nama driver kosong" }); return; }
    if (!submission) { issues.push({ line, text: raw, reason: "Tanggal pengajuan tidak terbaca" }); return; }
    if (amount === null) { issues.push({ line, text: raw, reason: "Nominal tidak terbaca" }); return; }
    if (!typeRaw) { issues.push({ line, text: raw, reason: "Jenis klaim kosong" }); return; }
    const per = parsePeriod(periodText);
    const { type, extra } = mapType(typeRaw);
    const notes = [extra, note].filter(Boolean).join(" · ");
    rows.push({
      line, submission, periodStart: per?.start ?? submission, periodEnd: per?.end ?? submission, periodText: periodText || "(kosong)",
      periodOk: !!per, driverRaw, type, amount, note: notes,
    });
  });
  return { rows, issues, headerFound, lines: table.length };
}

export function parseSheetText(text: string): ParseResult {
  const lines = text.replace(/\r/g, "").split("\n");
  const sep = detectSep(lines);
  return parseSheetRows(lines.map((l) => splitCells(l, sep)));
}

/* ── pencocokan nama driver ── */

export interface DriverLite { id: string; nama: string; aktif?: boolean }
export type MatchKind = "exact" | "fuzzy" | "none";
export interface DriverMatch { id: string; kind: MatchKind; name: string }

function lev1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function matchDriver(raw: string, drivers: DriverLite[]): DriverMatch {
  const n = norm(raw);
  if (!n) return { id: "", kind: "none", name: "" };
  const exact = drivers.filter((d) => norm(d.nama) === n);
  if (exact.length) { const d = exact.sort((x, y) => Number(y.aktif !== false) - Number(x.aktif !== false))[0]; return { id: d.id, kind: "exact", name: d.nama }; }
  const toks = n.split(" ");
  const scored = drivers.map((d) => {
    const dn = norm(d.nama); const dt = dn.split(" ");
    const prefix = dn.startsWith(n) || n.startsWith(dn);
    const tokenOk = toks.every((t) => dt.some((x) => x === t || (t.length >= 4 && x.length >= 4 && lev1(t, x))));
    return { d, ok: prefix || tokenOk };
  }).filter((x) => x.ok);
  if (scored.length >= 1) {
    scored.sort((x, y) => Number(y.d.aktif !== false) - Number(x.d.aktif !== false) || x.d.nama.length - y.d.nama.length);
    return { id: scored[0].d.id, kind: "fuzzy", name: scored[0].d.nama };
  }
  return { id: "", kind: "none", name: "" };
}

/* ── penggabungan jadi klaim ── */

export interface ClaimDraft {
  key: string;
  driver_id: string;
  driverRaw: string;
  submission_date: string;
  period_date: string;
  items: ClaimItem[];
  total: number;
  note: string;
  lines: number[];
}

export function periodDateOf(r: ImportRow, by: MonthBy): string {
  return by === "end" ? r.periodEnd : by === "submission" ? r.submission : r.periodStart;
}

/** driverMap: nama mentah (norm) → driver_id ("" = lewati). Baris tanpa driver terpilih tidak ikut. */
export function buildDrafts(rows: ImportRow[], driverMap: Record<string, string>, by: MonthBy, marker: string): { drafts: ClaimDraft[]; skippedRows: number } {
  const map = new Map<string, ClaimDraft & { notes: Set<string> }>();
  let skipped = 0;
  for (const r of rows) {
    const driver_id = driverMap[norm(r.driverRaw)] ?? "";
    if (!driver_id) { skipped++; continue; }
    const period_date = periodDateOf(r, by);
    const key = `${driver_id}|${r.submission}|${norm(r.periodText)}|${by === "submission" ? "" : period_date}`;
    let d = map.get(key);
    if (!d) { d = { key, driver_id, driverRaw: r.driverRaw, submission_date: r.submission, period_date, items: [], total: 0, note: "", lines: [], notes: new Set() }; map.set(key, d); }
    d.items.push({ type: r.type, expr: String(r.amount), total: r.amount });
    d.total += r.amount;
    d.lines.push(r.line);
    if (r.note) d.notes.add(r.note);
  }
  const drafts = [...map.values()].map(({ notes, ...d }) => ({ ...d, note: `${marker}${notes.size ? " " + [...notes].join("; ").slice(0, 400) : ""}` }));
  drafts.sort((a, b) => a.submission_date.localeCompare(b.submission_date) || a.driverRaw.localeCompare(b.driverRaw));
  return { drafts, skippedRows: skipped };
}

/* ── ringkasan untuk pratinjau ── */

export interface MonthSummary { key: string; claims: number; items: number; gasoline: number; toll: number; parking: number; others: number; total: number }

export function summarizeByMonth(drafts: ClaimDraft[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>();
  for (const d of drafts) {
    const key = d.period_date.slice(0, 7);
    const m = map.get(key) ?? { key, claims: 0, items: 0, gasoline: 0, toll: 0, parking: 0, others: 0, total: 0 };
    m.claims++;
    for (const it of d.items) { m[bucketForType(it.type)] += it.total; m.items++; }
    m.total = m.gasoline + m.toll + m.parking + m.others;
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export const normName = norm;
