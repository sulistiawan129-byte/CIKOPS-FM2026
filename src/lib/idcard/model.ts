/* ════════════════════════════════════════════════════════════
   ID CARD — model & util murni (tanpa akses database / browser).
   Penomoran sama dengan sistem ID Card lama: Temporary T-DDMMYY###, Contractor & Outsourcing DDMMYY###.
════════════════════════════════════════════════════════════ */
import { L } from "../i18n";

export type CardTipe = "T" | "C" | "O" | "R";
export type RequestStatus = "pending" | "printed" | "selesai";
export type CardStatus = "diterbitkan" | "diserahkan" | "kembali" | "hilang";

export const TIPES: CardTipe[] = ["T", "C", "O", "R"];
/** Teks pada kartu / dokumen */
export const TIPE_LABEL: Record<CardTipe, string> = { T: "TEMPORARY", C: "CONTRACTOR", O: "OUTSOURCING", R: "TRANSPORTER" };
export const TIPE_ICON: Record<CardTipe, string> = { T: "🟡", C: "🔵", O: "🟢", R: "🟠" };
export const tipeName = (t: CardTipe | string) => ({ T: "Temporary", C: "Contractor", O: "Outsourcing", R: "Transporter" } as Record<string, string>)[t] ?? t;

export const requestStatusLabel = (s: string) => ({ pending: L("Pending", "Pending"), printed: L("Dicetak", "Printed"), selesai: L("Selesai", "Done") } as Record<string, string>)[s] ?? s;
export const cardStatusLabel = (s: string) => ({ diterbitkan: L("Diterbitkan", "Issued"), diserahkan: L("Diserahkan", "Handed over"), kembali: L("Kembali", "Returned"), hilang: L("Hilang", "Lost") } as Record<string, string>)[s] ?? s;
export const logActionLabel = (a: string) => ({
  serah: L("Diserahkan", "Handed over"), "batal-serah": L("Serah dibatalkan", "Handover cancelled"), kembali: L("Dikembalikan", "Returned"),
  hilang: L("Dilaporkan hilang", "Reported lost"), diterbitkan: L("Disiapkan ulang", "Re-issued"),
} as Record<string, string>)[a] ?? a;

export interface IdRequest {
  id: string; tanggal: string; perusahaan: string; pic: string; phone: string; tipe: CardTipe; lokasi: string;
  jumlah: number; cardFrom: string; cardTo: string; status: RequestStatus; catatan: string; createdBy: string; createdAt: string;
}
export interface IdHandover {
  id: string; tanggal: string; perusahaan: string; pic: string; phone: string; jabatan: string; tipe: CardTipe;
  jumlah: number; cardFrom: string; cardTo: string; catatan: string; requestId: string | null; validated: boolean; createdBy: string; createdAt: string;
}
export interface IdCard {
  id: string; requestId: string; number: string; tipe: CardTipe; status: CardStatus; handoverId: string | null; handedAt: string; note: string;
}
export interface IdCardLog { id: string; number: string; action: string; detail: string; actor: string; createdAt: string }

/** YYYY-MM-DD hari ini menurut WIB */
export const wibToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
/** "2026-11-23" → "231126" */
export const ddmmyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;
/** Transporter: nomor urut polos (1, 2, 3 …). Lainnya: [T-]DDMMYY###. */
export const formatNumber = (tipe: CardTipe, dayIso: string, seq: number) => (tipe === "R" ? String(seq) : `${tipe === "T" ? "T-" : ""}${ddmmyy(dayIso)}${String(seq).padStart(3, "0")}`);
/** Contractor & Outsourcing memakai satu urutan harian; Temporary punya urutan sendiri; Transporter berlanjut tanpa reset harian. */
export const seriesOf = (t: CardTipe): "T" | "CO" | "TR" => (t === "T" ? "T" : t === "R" ? "TR" : "CO");
/** Tanggal acuan penghitung: Transporter memakai tanggal tetap (tidak reset harian). */
export const COUNTER_DAY_TR = "2000-01-01";
/** Nomor seri Transporter yang dicetak di kartu: TRP-DDMMYY-### (tanggal cetak + nomor 3 digit). */
export const serialOf = (number: string, printIso: string) => `TRP-${ddmmyy(printIso)}-${number.padStart(3, "0")}`;

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(`${s.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString(L("id-ID", "en-GB"), { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateLong = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

/** "satu / dua / …" untuk kalimat tanda terima (sama dengan sistem lama, dilengkapi sampai ratusan) */
export function angkaKata(n: number): string {
  const s = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  if (n <= 0) return "nol";
  if (n <= 11) return s[n];
  if (n < 20) return `${s[n - 10]} belas`;
  if (n < 100) return `${s[Math.floor(n / 10)]} puluh${n % 10 ? ` ${s[n % 10]}` : ""}`;
  if (n < 200) return `seratus${n % 100 ? ` ${angkaKata(n % 100)}` : ""}`;
  if (n < 1000) return `${s[Math.floor(n / 100)]} ratus${n % 100 ? ` ${angkaKata(n % 100)}` : ""}`;
  return String(n);
}

export const csvEscape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
