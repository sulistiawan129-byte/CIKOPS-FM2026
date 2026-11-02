/* Terjemahan inline: L("Teks Indonesia", "English text") mengikuti bahasa aplikasi (tombol ID/EN).
   Kamus besar ada di dictionary.ts; ini untuk teks yang hanya dipakai di satu tempat.
   L() membaca bahasa aktif yang diset AppProviders, jadi bisa dipakai juga di fungsi bantu di luar komponen. */

export type Lang = "id" | "en";
let CUR: Lang = "id";

/** Dipanggil AppProviders setiap kali bahasa berubah. */
export function setGlobalLang(l: Lang) { CUR = l === "en" ? "en" : "id"; }
export const currentLang = (): Lang => CUR;

/** Pilih teks sesuai bahasa aktif. */
export const L = (id: string, en: string): string => (CUR === "en" ? en : id);

/** Locale tanggal & angka mengikuti bahasa aplikasi. */
export const loc = (): string => (CUR === "en" ? "en-GB" : "id-ID");
export const localeOf = (lang: string) => (lang === "en" ? "en-GB" : "id-ID");
