"use client";

/* Terjemahan inline: L("Teks Indonesia", "English text") mengikuti bahasa aplikasi (tombol ID/EN).
   Kamus besar ada di dictionary.ts; ini untuk teks yang hanya dipakai di satu tempat. */
import { useCallback } from "react";
import { useLang } from "./providers";

export type TrFn = (id: string, en: string) => string;

export function useL(): TrFn {
  const { lang } = useLang();
  return useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);
}

/** Locale untuk tanggal & angka mengikuti bahasa aplikasi. */
export const localeOf = (lang: string) => (lang === "en" ? "en-GB" : "id-ID");
export function useLocale(): string {
  const { lang } = useLang();
  return localeOf(lang);
}
