/* ════════════════════════════════════════════════════════════
   SURAT KUASA — pengurusan perpanjangan STNK & KIR / uji kendaraan.
   Output: PDF A4 untuk dicetak di kertas ber-kop. Bagian atas sengaja dikosongkan (ruang kop),
   tanda tangan tidak dicetak (dibubuhkan basah). Format mengikuti surat kuasa GA yang sudah dipakai.
════════════════════════════════════════════════════════════ */

export type SuratKuasaTipe = "stnk" | "kir";

export interface SuratKuasaData {
  tipe: SuratKuasaTipe;
  kota: string;
  /** YYYY-MM-DD */
  tanggal: string;
  pemberi: { nama: string; jabatan: string };
  penerima: { nama: string; alamat: string };
  kendaraan: {
    /** merk & tipe, mis. "Mitsubishi Colt Diesel Fe7.1 MT 4" */
    merk: string;
    nopol: string;
    /** jenis menurut STNK, mis. "Mobil Barang" */
    jenis: string;
    tahun: string;
    warna: string;
    rangka: string;
    mesin: string;
    /** nomor uji KIR, mis. "JKT761681" */
    noUji: string;
  };
  /** Ruang kosong di atas untuk kop surat (mm) */
  kopMm: number;
}

export const SURAT_KUASA_LABEL: Record<SuratKuasaTipe, string> = {
  stnk: "Perpanjangan STNK",
  kir: "KIR / Uji kendaraan",
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-07-28" → "28 Juli 2026" */
export function tanggalIndonesia(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

/** Nama berkas: Surat-Kuasa-STNK-B-9065-TCF.pdf */
export function suratKuasaFileName(d: SuratKuasaData): string {
  const plat = d.kendaraan.nopol.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kendaraan";
  return `Surat-Kuasa-${d.tipe === "stnk" ? "STNK" : "KIR"}-${plat}.pdf`;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function buildSuratKuasaPdf(d: SuratKuasaData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297;
  const left = 25, right = PW - 25;
  const labelX = left + 10, colonX = left + 42, valueX = left + 46;
  const valueW = right - valueX;
  const LH = 6.2;              // tinggi baris
  const FS = 11;
  const kota = clean(d.kota) || "Jakarta";
  const tgl = `${kota}, ${tanggalIndonesia(d.tanggal)}`;
  const v = d.kendaraan;

  let y = Math.max(15, Math.min(90, d.kopMm || 0)) + 6;
  pdf.setTextColor(0);
  const normal = () => pdf.setFont("helvetica", "normal");
  const bold = () => pdf.setFont("helvetica", "bold");
  pdf.setFontSize(FS); normal();

  const need = (h: number) => { if (y + h > PH - 15) { pdf.addPage(); y = 25; pdf.setFontSize(FS); normal(); } };
  const line = (text: string, x = left) => { need(LH); pdf.text(text, x, y); y += LH; };
  const gap = (h = LH) => { y += h; };

  /** Baris isian: "Label : nilai". Nilai kosong → garis titik-titik supaya bisa ditulis tangan. */
  const field = (label: string, value: string, x0 = labelX, colon = colonX, vx = valueX) => {
    const val = clean(value);
    const lines: string[] = val ? pdf.splitTextToSize(val, right - vx) : [""];
    need(LH * lines.length);
    pdf.text(label, x0, y); pdf.text(":", colon, y);
    if (!val) {
      pdf.setDrawColor(120); pdf.setLineWidth(0.2); pdf.setLineDashPattern([0.6, 0.9], 0);
      pdf.line(vx, y + 0.6, Math.min(right, vx + 70), y + 0.6); pdf.setLineDashPattern([], 0);
      y += LH; return;
    }
    lines.forEach((t, i) => { pdf.text(t, vx, y + i * LH); });
    y += LH * lines.length;
  };

  // ── Tanggal & judul ──
  line(tgl);
  gap(LH * 1.3);
  bold(); pdf.setFontSize(14);
  const title = "SURAT KUASA";
  pdf.text(title, PW / 2, y, { align: "center" });
  const tw = pdf.getTextWidth(title);
  pdf.setLineWidth(0.4); pdf.setDrawColor(0); pdf.line(PW / 2 - tw / 2, y + 1.2, PW / 2 + tw / 2, y + 1.2);
  y += LH * 1.9;
  pdf.setFontSize(FS); normal();

  // ── Pemberi kuasa ──
  line("Saya yang bertanda tangan dibawah ini :");
  gap(LH * 0.4);
  field("Nama", d.pemberi.nama);
  field("Jabatan", d.pemberi.jabatan);
  gap(LH * 0.7);

  // ── Penerima kuasa ──
  line("Dengan ini memberikan kuasa kepada :");
  gap(LH * 0.4);
  field("Nama", d.penerima.nama);
  field("Alamat", d.penerima.alamat);
  gap(LH * 0.7);

  // ── Keperluan + data kendaraan ──
  line(d.tipe === "stnk" ? "Untuk pengurusan perpanjangan STNK kendaraan ;" : "Untuk mengurus KIR / uji kendaraan ;");
  gap(LH * 0.4);
  field("Kendaraan", v.merk);
  field("No.Polisi", v.nopol);
  field("Jenis", v.jenis);
  if (d.tipe === "stnk") {
    field("Tahun", v.tahun);
    field("Warna", v.warna);
    field("Nomor Rangka", v.rangka);
    field("Nomor Mesin", v.mesin);
  } else {
    field("No. Uji", v.noUji);
  }
  gap(LH * 1.1);

  // ── Penutup ──
  const closing = pdf.splitTextToSize("Demikianlah surat kuasa ini kami buat agar dipergunakan dengan sebagaimana mestinya.", right - left) as string[];
  closing.forEach((t) => line(t));
  gap(LH * 0.9);

  // ── Tanda tangan (dikosongkan) ──
  need(LH * 9 + 24);
  if (d.tipe === "stnk") { line(tgl); gap(LH * 0.3); }
  const colB = 118;
  pdf.text("Hormat Kami,", left, y); pdf.text("Yang Menerima Kuasa", colB, y);
  y += 30;                                   // ruang tanda tangan basah
  const nameLine = (name: string, x: number, w: number) => {
    const n = clean(name);
    if (n) { pdf.text(n, x, y); const nw = pdf.getTextWidth(n); pdf.setLineWidth(0.3); pdf.setDrawColor(0); pdf.line(x, y + 1, x + nw, y + 1); }
    else { pdf.setDrawColor(120); pdf.setLineWidth(0.2); pdf.setLineDashPattern([0.6, 0.9], 0); pdf.line(x, y + 0.6, x + w, y + 0.6); pdf.setLineDashPattern([], 0); }
  };
  nameLine(d.pemberi.nama, left, 55);
  nameLine(d.penerima.nama, colB, 55);
  y += LH;
  const jab = clean(d.pemberi.jabatan);
  if (jab) (pdf.splitTextToSize(jab, 80) as string[]).forEach((t, i) => pdf.text(t, left, y + i * LH));

  pdf.setProperties({ title: `Surat Kuasa ${d.tipe === "stnk" ? "Perpanjangan STNK" : "KIR"} ${v.nopol}`.trim(), subject: "Surat Kuasa" });
  return pdf;
}

/** Unduh PDF; bila peramban memblokir unduhan otomatis, PDF dibuka di tab baru. */
export async function downloadSuratKuasa(d: SuratKuasaData): Promise<void> {
  const pdf = await buildSuratKuasaPdf(d);
  try { pdf.save(suratKuasaFileName(d)); }
  catch { const url = URL.createObjectURL(pdf.output("blob")); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); }
}

/** Buka PDF di tab baru (pratinjau / langsung cetak). */
export async function previewSuratKuasa(d: SuratKuasaData): Promise<void> {
  const pdf = await buildSuratKuasaPdf(d);
  const url = URL.createObjectURL(pdf.output("blob"));
  const w = window.open(url, "_blank");
  if (!w) pdf.save(suratKuasaFileName(d));
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
