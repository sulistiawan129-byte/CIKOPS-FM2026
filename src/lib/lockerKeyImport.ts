/* ════════════════════════════════════════════════════════════
   KUNCI LOKER KARYAWAN — pembacaan & pembersihan file Excel "Master Loker Karyawan".
   Fungsi murni (tanpa akses database / browser) supaya mudah diuji.
   Sheet "Master": BLOK | NO.SLOT KUNCI | NO.URUT PINTU | NAMA KARYAWAN | NIK | NO.KUNCI | DEPT | KETERANGAN
════════════════════════════════════════════════════════════ */

export type LockerKeyStatus = "Terisi" | "Kosong" | "Dipinjam";

export interface LockerKeyDraft {
  rowNo: number;
  blok: string;
  slot: number | null;
  pintu: string;
  nama: string;
  nik: string;
  dept: string;
  noKunci: string;
  status: LockerKeyStatus;
  keterangan: string;
}

export interface LockerImportReport {
  total: number;
  terisi: number;
  kosong: number;
  dipinjam: number;
  blocks: number;
  /** Kolom NO.KUNCI dan DEPT tertukar di file → sudah dibetulkan */
  swapped: number;
  /** DEPT berisi angka (bukan nama departemen) → dikosongkan */
  deptNumeric: number;
  /** NO.KUNCI berisi teks yang tak terbaca → dipindah ke Keterangan */
  keyUnreadable: number;
  /** NIK tidak valid → dikosongkan (nilai asli masuk Keterangan) */
  nikInvalid: number;
  /** Baris kosong di file (tanpa blok & pintu & kunci) dilewati */
  skippedEmpty: number;
  /** Pintu yang muncul lebih dari sekali dalam blok yang sama */
  duplicateDoors: number;
}

/** Nilai sel Excel (angka, teks, rich text, rumus, tanggal) → teks rapi tanpa spasi ganda. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text?: string }[]; text?: unknown; result?: unknown; hyperlink?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("").replace(/\s+/g, " ").trim();
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return cellText(o.text);
  }
  return "";
}

const up = (s: string) => s.toLocaleUpperCase("id-ID");
const hasLetters = (s: string) => /[A-Za-z]{2,}/.test(s);

const HEADERS: Record<string, string[]> = {
  blok: ["BLOK"],
  slot: ["NO.SLOT KUNCI", "NO SLOT KUNCI", "SLOT"],
  pintu: ["NO.URUT PINTU", "NO URUT PINTU", "PINTU"],
  nama: ["NAMA KARYAWAN", "NAMA"],
  nik: ["NIK"],
  kunci: ["NO.KUNCI", "NO KUNCI", "KUNCI"],
  dept: ["DEPT", "DEPARTEMEN", "DEPARTMENT"],
  ket: ["KETERANGAN", "KET"],
};

/** Status dari isi baris: tanpa nama = Kosong; keterangan "dipinjam …" (belum dibalikin) = Dipinjam; selain itu Terisi. */
export function deriveStatus(nama: string, keterangan: string): LockerKeyStatus {
  if (!nama) return "Kosong";
  if (/pinjam/i.test(keterangan) && !/(sudah|sdh|udah).{0,15}(balik|kembali)/i.test(keterangan)) return "Dipinjam";
  return "Terisi";
}

/** Rapikan label pintu: "h12" → "H12"; angka saja (blok M, pintu 3) → "M3". */
function doorLabel(blok: string, raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^\d+$/.test(t)) return /^[A-Za-z]{1,2}$/.test(blok) ? `${up(blok)}${t}` : `${up(blok)} ${t}`;
  return up(t);
}

/**
 * Baca baris Excel (array 2 dimensi, baris pertama = judul kolom) menjadi daftar loker yang sudah dibersihkan.
 * Perbaikan otomatis dicatat di `report` supaya admin tahu apa yang diubah.
 */
export function normalizeLockerRows(raw: unknown[][]): { rows: LockerKeyDraft[]; report: LockerImportReport } {
  const report: LockerImportReport = { total: 0, terisi: 0, kosong: 0, dipinjam: 0, blocks: 0, swapped: 0, deptNumeric: 0, keyUnreadable: 0, nikInvalid: 0, skippedEmpty: 0, duplicateDoors: 0 };
  const head = raw.findIndex((r) => (r ?? []).some((c) => up(cellText(c)) === "BLOK"));
  const hdr = head >= 0 ? (raw[head] ?? []).map((c) => up(cellText(c))) : [];
  const col = (k: keyof typeof HEADERS, fallback: number) => {
    const i = hdr.findIndex((h) => HEADERS[k].includes(h));
    return i >= 0 ? i : fallback;
  };
  const ix = { blok: col("blok", 0), slot: col("slot", 1), pintu: col("pintu", 2), nama: col("nama", 3), nik: col("nik", 4), kunci: col("kunci", 5), dept: col("dept", 6), ket: col("ket", 7) };

  const rows: LockerKeyDraft[] = [];
  const seen = new Map<string, number>();
  const body = raw.slice(head >= 0 ? head + 1 : 0);
  for (const r of body) {
    const g = (i: number) => (r ?? [])[i];
    const blok = up(cellText(g(ix.blok)));
    let pintuRaw = cellText(g(ix.pintu));
    let kunciRaw = cellText(g(ix.kunci));
    let deptRaw = cellText(g(ix.dept));
    const nama = up(cellText(g(ix.nama)));
    const nikRaw = cellText(g(ix.nik));
    let ket = cellText(g(ix.ket));
    const slotN = Number(cellText(g(ix.slot)));

    if (!blok && !pintuRaw && !kunciRaw && !nama) { report.skippedEmpty++; continue; }
    if (!blok) { report.skippedEmpty++; continue; }

    // ── NO.KUNCI vs DEPT: sebagian baris tertukar / berisi karakter liar ──
    let noKunci = "";
    const kunciIsNum = /^\d{3,}$/.test(kunciRaw);
    const deptIsNum = /^\d+$/.test(deptRaw);
    if (kunciRaw && !kunciIsNum && hasLetters(kunciRaw) && (!deptRaw || deptIsNum)) {
      // kunci berisi nama departemen, dept berisi nomor kunci → tukar
      if (deptIsNum && /^\d{3,}$/.test(deptRaw)) noKunci = deptRaw;
      deptRaw = kunciRaw;
      report.swapped++;
    } else if (kunciRaw && !kunciIsNum && hasLetters(kunciRaw) && deptRaw) {
      // kunci berisi teks, dept juga teks: kunci dianggap departemen, dept lama jadi catatan
      ket = [ket, `Kolom dept semula: ${deptRaw}`].filter(Boolean).join(" · ");
      deptRaw = kunciRaw;
      report.keyUnreadable++;
    } else if (!kunciRaw && /^\d{3,}$/.test(deptRaw)) {
      // nomor kunci tertulis di kolom DEPT (kolom NO.KUNCI kosong)
      noKunci = deptRaw;
      deptRaw = "";
      report.swapped++;
    } else if (kunciRaw && kunciIsNum) {
      noKunci = kunciRaw;
    } else if (kunciRaw && /^\d+$/.test(kunciRaw)) {
      noKunci = kunciRaw;            // angka pendek, tetap dipakai
    } else if (kunciRaw) {
      ket = [ket, `Kolom kunci tidak terbaca: "${kunciRaw}"`].filter(Boolean).join(" · ");
      report.keyUnreadable++;
    }
    let dept = "";
    if (deptRaw) {
      if (/^\d+$/.test(deptRaw)) report.deptNumeric++;
      else dept = up(deptRaw);
    }

    // ── NIK ──
    let nik = "";
    if (nikRaw) {
      if (/^\d{3,}$/.test(nikRaw)) nik = nikRaw;
      else { ket = [ket, `NIK di file: ${nikRaw}`].filter(Boolean).join(" · "); report.nikInvalid++; }
    }

    const pintu = doorLabel(blok, pintuRaw) || "";
    const key = `${blok}|${pintu}`;
    if (pintu) {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n === 2) report.duplicateDoors++;
    }

    const status = deriveStatus(nama, ket);
    rows.push({
      rowNo: rows.length + 1, blok, slot: Number.isFinite(slotN) && slotN > 0 ? Math.round(slotN) : null, pintu,
      nama, nik, dept, noKunci, status, keterangan: ket,
    });
  }

  report.total = rows.length;
  report.terisi = rows.filter((x) => x.status === "Terisi").length;
  report.kosong = rows.filter((x) => x.status === "Kosong").length;
  report.dipinjam = rows.filter((x) => x.status === "Dipinjam").length;
  report.blocks = new Set(rows.map((x) => x.blok)).size;
  return { rows, report };
}

/** Baca file .xlsx (sheet "Master", atau sheet pertama) di browser → baris mentah. */
export async function readLockerWorkbook(file: File): Promise<unknown[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Master") ?? wb.worksheets.find((w) => /master/i.test(w.name)) ?? wb.worksheets[0];
  if (!ws) throw new Error("File Excel tidak berisi sheet.");
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : [];
    out.push(vals);
  });
  return out;
}
