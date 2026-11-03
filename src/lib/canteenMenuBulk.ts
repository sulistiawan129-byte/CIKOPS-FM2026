/* Isi massal menu kantin: tempel dari Excel / ketik / unggah CSV → baris → menu mingguan.
   Format satu baris = satu hidangan:   Hari  |  Jenis  |  Menu  |  Kkal  |  Gram
   Pembeda kolom (delimiter) bisa Tab (hasil salin dari Excel), titik koma, koma, atau garis tegak — atau otomatis.
   Fungsi di sini murni (tanpa jaringan) supaya mudah diuji. */

import { addDaysIso, emptyItem, emptyWeek, mondayOf, type DayMenu, type MenuItem, type WeeklyMenu } from "./canteenMenu";

export type BulkKind = "snack" | "daging" | "ayam" | "telur" | "special" | "side" | "fruit" | "staple";
export type Delim = "auto" | "tab" | ";" | "," | "|";

export interface BulkRow {
  line: number;
  raw: string;
  /** Senin dari minggu sasaran (null = minggu yang sedang dipilih) */
  weekStart: string | null;
  /** 0–6 (Senin–Minggu), "all" = semua hari minggu itu, null = tidak berlaku (menu tetap) */
  day: number | "all" | null;
  kind?: BulkKind;
  item?: MenuItem;
  /** "-" pada kolom menu = kosongkan butir itu */
  clear?: boolean;
  error?: string;
}

const DAY_WORDS: Record<string, number> = {
  senin: 0, mon: 0, monday: 0, "1": 0, selasa: 1, tue: 1, tues: 1, tuesday: 1, "2": 1, rabu: 2, wed: 2, wednesday: 2, "3": 2,
  kamis: 3, thu: 3, thur: 3, thurs: 3, thursday: 3, "4": 3, jumat: 4, "jum'at": 4, jumaat: 4, fri: 4, friday: 4, "5": 4,
  sabtu: 5, sat: 5, saturday: 5, "6": 5, minggu: 6, ahad: 6, sun: 6, sunday: 6, "7": 6,
};
const ALL_WORDS = new Set(["semua", "all", "setiap hari", "tiap hari", "every day", "everyday", "*", "senin-minggu", "senin–minggu"]);
const NONE_WORDS = new Set(["", "-", "–", "—", "tetap", "fixed"]);

const KIND_WORDS: Record<string, BulkKind> = {
  // (Jenis yang diawali "snack" / "sayur" ditangani di parseBulk: Snack Breakfast, Snack shift 2, Sayur, …)
  snack: "snack", sarapan: "snack", camilan: "snack", breakfast: "snack",
  daging: "daging", sapi: "daging", beef: "daging", meat: "daging", ikan: "daging", fish: "daging", "daging/ikan": "daging", "daging / ikan": "daging", "daging atau ikan": "daging",
  ayam: "ayam", chicken: "ayam",
  telur: "telur", telor: "telur", egg: "telur",
  special: "special", spesial: "special", istimewa: "special",
  pendamping: "side", side: "side", sides: "side", "lauk pendamping": "side", sayur: "side",
  buah: "fruit", fruit: "fruit",
  tetap: "staple", staple: "staple", fixed: "staple", "selalu tersedia": "staple", "selalu": "staple", nasi: "staple", sambal: "staple", kerupuk: "staple",
};

export const KIND_LABEL: Record<BulkKind, string> = {
  snack: "Snack", daging: "Daging/Ikan", ayam: "Ayam", telur: "Telur", special: "Special", side: "Pendamping", fruit: "Buah", staple: "Tetap",
};
const DAY_ID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

function detectDelim(lines: string[]): Exclude<Delim, "auto"> {
  const sample = lines.slice(0, 8).join("\n");
  if (sample.includes("\t")) return "tab";
  const count = (ch: string) => (sample.match(new RegExp(`\\${ch}`, "g")) ?? []).length;
  if (count(";") > 0) return ";";
  if (count("|") > 0) return "|";
  return ",";
}
const splitLine = (line: string, d: Exclude<Delim, "auto">): string[] => {
  const ch = d === "tab" ? "\t" : d;
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ch && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
};

/** "2026-11-03", "03/11/2026", "3-11-2026" → ISO; selain itu null. */
const MONTHS: Record<string, number> = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12 };
function parseDate(v: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  let y = 0, mo = 0, d = 0;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = /^(\d{1,2})[\s/.-]+([A-Za-z]{3,9})[\s/.,-]+(\d{2}|\d{4})$/.exec(v.trim())) && MONTHS[m[2].toLowerCase()]) {
    // "02-Nov-26", "2 Nov 2026", "02/November/2026"
    d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

function parseNum(v: string): number | null {
  const t = v.replace(/kkal|kcal|gram|gr|g\b/gi, "").replace(/\s/g, "");
  if (t === "") return 0;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
}

export function parseBulk(text: string, delim: Delim = "auto"): { rows: BulkRow[]; delim: Exclude<Delim, "auto"> } {
  const lines = text.replace(/\r/g, "").split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const d = delim === "auto" ? detectDelim(nonEmpty) : delim;
  const rows: BulkRow[] = [];
  let first = true;
  lines.forEach((raw, idx) => {
    if (raw.trim() === "") return;
    let cells = splitLine(raw, d);
    // tabel markdown dari AI: | Senin | Snack | ... |  → buang sel kosong di tepi; baris pemisah |---|---| dilewati
    if (cells.length && cells[0] === "") cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1] === "") cells = cells.slice(0, -1);
    if (cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) return;
    // baris judul (Hari | Jenis | Menu | Kkal | Gram) dilewati
    if (first) {
      first = false;
      const h = cells.map(norm);
      if ((h[0] === "hari" || h[0] === "tanggal" || h[0] === "day" || h[0] === "date") && (h[1] === "jenis" || h[1] === "kategori" || h[1] === "type")) return;
    }
    const row: BulkRow = { line: idx + 1, raw, weekStart: null, day: null };
    rows.push(row);
    if (cells.length < 3) { row.error = "Kolom kurang — butuh Hari, Jenis, Menu (Kkal & Gram boleh kosong)."; return; }

    const kindWord = norm(cells[1]);
    const kind = KIND_WORDS[kindWord] ?? (/^snack\b/.test(kindWord) ? "snack" : /^sayur\b/.test(kindWord) ? "side" : /^pendamping\b/.test(kindWord) ? "side" : undefined);
    if (!kind) { row.error = `Jenis "${cells[1]}" tidak dikenal (Snack, Daging, Ayam, Telur, Special, Pendamping, Buah, Tetap).`; return; }
    row.kind = kind;

    const dayWord = norm(cells[0]);
    if (kind === "staple") {
      row.day = null; // menu tetap berlaku seminggu penuh
      const dt = parseDate(cells[0]); if (dt) row.weekStart = mondayOf(dt);
    } else if (ALL_WORDS.has(dayWord)) row.day = "all";
    else if (dayWord in DAY_WORDS) row.day = DAY_WORDS[dayWord];
    else {
      const dt = parseDate(cells[0]);
      if (dt) { row.weekStart = mondayOf(dt); row.day = dowOf(dt); }
      else if (NONE_WORDS.has(dayWord)) { row.error = "Hari kosong — isi Senin–Minggu, tanggal, atau Semua."; return; }
      else { row.error = `Hari "${cells[0]}" tidak dikenal (Senin–Minggu, tanggal, atau Semua).`; return; }
    }

    // nama dari vendor sering berakhiran porsi "50%" / "35 %" → dibuang
    const name = cells[2].replace(/\s*\b\d{1,3}\s*%\s*$/, "").trim();
    if (name === "") {
      // baris template yang belum diisi (nama, kkal, gram kosong) → diabaikan, bukan error
      if ((cells[3] ?? "") === "" && (cells[4] ?? "") === "") { rows.pop(); return; }
      row.error = "Nama menu kosong (isi '-' untuk mengosongkan)."; return;
    }
    if (name === "-" || name === "–") { row.clear = true; row.item = emptyItem(); return; }
    if (name.length > 80) { row.error = "Nama menu terlalu panjang (maks. 80 huruf)."; return; }
    const kcal = parseNum(cells[3] ?? ""); const gram = parseNum(cells[4] ?? "");
    if (kcal === null) { row.error = `Kalori "${cells[3]}" bukan angka.`; return; }
    if (gram === null) { row.error = `Gram "${cells[4]}" bukan angka.`; return; }
    row.item = { name, kcal, gram };
  });
  return { rows, delim: d };
}

/** Ringkasan minggu-minggu yang akan tersentuh. */
export function touchedWeeks(rows: BulkRow[], baseWeek: string): string[] {
  const set = new Set<string>();
  for (const r of rows) if (!r.error) set.add(r.weekStart ?? baseWeek);
  return [...set].sort();
}

/** Terapkan baris ke menu. `existing` = menu tersimpan per minggu (yang belum ada akan dibuat kosong). */
export function applyBulk(rows: BulkRow[], baseWeek: string, existing: Map<string, WeeklyMenu | null>, mode: "merge" | "replace"): Map<string, WeeklyMenu> {
  const result = new Map<string, WeeklyMenu>();
  const get = (ws: string): WeeklyMenu => {
    let w = result.get(ws);
    if (!w) {
      const ex = existing.get(ws);
      w = mode === "replace" || !ex ? emptyWeek(ws) : JSON.parse(JSON.stringify(ex)) as WeeklyMenu;
      result.set(ws, w);
    }
    return w;
  };
  const sideReset = new Set<string>();  // `${week}|${day}` — pendamping hari itu sudah dikosongkan oleh impor ini
  const snackReset = new Set<string>();  // idem untuk snack (beberapa komponen per hari)
  const stapleReset = new Set<string>();
  for (const r of rows) {
    if (r.error || !r.kind || !r.item) continue;
    const ws = r.weekStart ?? baseWeek;
    const w = get(ws);
    if (r.kind === "staple") {
      if (!stapleReset.has(ws)) { stapleReset.add(ws); w.staples = []; }
      if (!r.clear) w.staples.push({ ...r.item });
      continue;
    }
    const days = r.day === "all" ? [0, 1, 2, 3, 4, 5, 6] : typeof r.day === "number" ? [r.day] : [];
    for (const di of days) {
      const day: DayMenu = w.days[di];
      const it = { ...r.item };
      if (r.kind === "snack") {
        const k = `${ws}|${di}`;
        if (!snackReset.has(k)) { snackReset.add(k); day.snacks = []; }
        if (!r.clear) day.snacks.push(it);
      }
      else if (r.kind === "daging" || r.kind === "ayam" || r.kind === "telur") day.main[r.kind] = it;
      else if (r.kind === "special") day.special = it;
      else if (r.kind === "fruit") day.fruit = it;
      else if (r.kind === "side") {
        const k = `${ws}|${di}`;
        if (!sideReset.has(k)) { sideReset.add(k); day.sides = []; }
        if (!r.clear) day.sides.push(it);
      }
    }
  }
  // minimal 2 baris pendamping di editor
  result.forEach((w) => w.days.forEach((d) => { while (d.sides.length < 2) d.sides.push(emptyItem()); while (d.snacks.length < 4) d.snacks.push(emptyItem()); }));
  return result;
}

/** Menu satu minggu → teks baris (untuk template / unduh). */
export function toBulkText(w: WeeklyMenu, delim: Exclude<Delim, "auto"> = "tab"): string {
  const sep = delim === "tab" ? "\t" : delim;
  const line = (day: string, kind: string, it: MenuItem) => [day, kind, it.name, it.kcal || "", it.gram || ""].join(sep);
  const out: string[] = [["Hari", "Jenis", "Menu", "Kkal", "Gram"].join(sep)];
  w.days.forEach((d, i) => {
    const day = DAY_ID[i];
    d.snacks.forEach((x) => out.push(line(day, "Snack", x)));
    out.push(line(day, "Ayam", d.main.ayam), line(day, "Daging", d.main.daging), line(day, "Telur", d.main.telur));
    out.push(line(day, "Special", d.special ?? emptyItem()));
    d.sides.forEach((x) => out.push(line(day, "Pendamping", x)));
    out.push(line(day, "Buah", d.fruit ?? emptyItem()));
  });
  (w.staples.length ? w.staples : [emptyItem(), emptyItem(), emptyItem()]).forEach((x) => out.push(line("-", "Tetap", x)));
  return out.join("\n");
}

/** Prompt siap-tempel untuk AI (ChatGPT, Claude, Gemini, …) agar mengubah GAMBAR menu vendor menjadi teks yang langsung bisa ditempel di Isi massal. */
export const AI_PROMPT = `Ubah gambar menu kantin terlampir menjadi teks CSV dengan pemisah titik koma (;).
Satu baris = satu hidangan. Keluarkan HANYA CSV-nya (tanpa penjelasan, tanpa tabel markdown, tanpa tanda kutip miring).
Baris pertama (judul kolom) persis: Hari;Jenis;Menu;Kkal;Gram

Aturan:
1. Hari = tanggal format YYYY-MM-DD dari judul tiap hari di gambar (contoh "02-Nov-26" → 2026-11-02).
2. Jenis harus salah satu dari: Snack, Ayam, Daging, Telur, Special, Pendamping, Buah, Tetap.
   - Tabel "Snack Breakfast / Snack shift 2 / shift 3": Jenis = Snack, satu baris untuk SETIAP komponen (nasi kuning, tempe orek, timun iris, kerupuk, dst.).
   - Lauk A (ayam) → Ayam. Lauk B (daging / ikan / lele) → Daging. Lauk C (telur) → Telur. Bila di suatu hari lauk B ternyata telur, tulis Telur; jangan mengisi Daging bila tidak ada.
   - Sayur dan tempe / tahu / lumpia / perkedel → Pendamping (satu baris masing-masing).
   - Semangka / pepaya / pisang / melon / buah lain → Buah.
   - Nasi putih, Sambal, Kerupuk yang sama setiap hari → Tetap, tulis SEKALI saja (bukan per hari), kolom Hari diisi tanggal hari Senin.
   - Hidangan istimewa di luar pola biasa (mis. "Sop Daging") → Special.
3. Menu = nama hidangan saja. Hapus persentase porsi seperti "50%" dan huruf A/B/C di depan nama.
4. Kkal = kolom Calori/Kalori, Gram = kolom Berat Gram. Isi angka saja. Bila kosong atau tidak terbaca, BIARKAN KOSONG — jangan menebak.
5. Jangan membuat baris untuk hidangan yang tidak ada di gambar.

Contoh:
Hari;Jenis;Menu;Kkal;Gram
2026-11-02;Snack;Nasi kuning;180;75
2026-11-02;Ayam;Ayam rica-rica;285;50
2026-11-02;Pendamping;Sop kacang merah;85;75
2026-11-02;Buah;Semangka;32;100
2026-11-02;Tetap;Nasi putih;450;250`;

export { addDaysIso };
