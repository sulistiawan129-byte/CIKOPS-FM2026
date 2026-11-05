"use client";

/* HURUF KAPITAL OTOMATIS untuk semua isian teks (nama, tujuan, keterangan, plat, dst.) supaya tulisan seragam & rapi.
   Dipasang SATU kali di layout; bekerja lewat satu pendengar `input` di tingkat dokumen.

   Yang TIDAK dikapitalkan (membuat data rusak bila diubah): email, password, username, URL/link, token, kode/PIN, SSID,
   kolom angka/tanggal/jam, kotak pencarian, dan elemen berlabel/bertanda tersebut. Opt-out manual: beri atribut
   `data-nocaps` pada input / textarea / pembungkusnya (dipakai untuk kolom tempel data massal dan kolom password wifi). */

import { useEffect } from "react";

/** kata pada label/nama/placeholder yang menandai isian case-sensitive */
const RISKY = /e-?mail|surel|passw|kata sandi|\bsandi\b|username|user ?name|\burl\b|\blink\b|tautan|token|passcode|\bkode\b|\bcode\b|\bssid\b|\bpin\b|\bapi\b|secret|\bkey\b|https?:|www\.|\.com|@|cari|search|filter/i;

function labelTextOf(el: HTMLInputElement | HTMLTextAreaElement): string {
  const own = el.labels && el.labels.length ? Array.from(el.labels).map((l) => l.textContent ?? "").join(" ") : "";
  if (own) return own.slice(0, 120);
  // label tanpa `for`: teks label/span terdekat di pembungkus
  const near = el.closest("label")?.textContent ?? el.parentElement?.querySelector("label, span")?.textContent ?? "";
  return near.slice(0, 80);
}

function eligible(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el.readOnly || el.disabled || el.closest("[data-nocaps]")) return false;
  if (el instanceof HTMLInputElement && (el.getAttribute("type") || "text").toLowerCase() !== "text") return false;
  const im = (el.getAttribute("inputmode") || "").toLowerCase();
  if (im && im !== "text") return false;                                  // numeric, decimal, email, url, tel, search
  const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
  if (/email|username|password|one-time|url|current|new-/.test(ac)) return false;
  const role = el.getAttribute("role");
  if (role === "searchbox" || role === "combobox") return false;
  const hint = [el.getAttribute("name"), el.id, el.getAttribute("aria-label"), el.placeholder, labelTextOf(el)].join(" ");
  return !RISKY.test(hint);
}

const setters = typeof window !== "undefined"
  ? {
      input: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set,
      textarea: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set,
    }
  : { input: undefined, textarea: undefined };

/** Ubah nilai tanpa melewati pelacak nilai React (setter prototipe) supaya onChange tetap menerima nilai kapital. */
function upper(el: HTMLInputElement | HTMLTextAreaElement, notify: boolean) {
  const v = el.value, up = v.toUpperCase();
  if (v === up) return;
  const s = el.selectionStart, e = el.selectionEnd;
  const set = el instanceof HTMLTextAreaElement ? setters.textarea : setters.input;
  if (!set) return;
  set.call(el, up);
  try { if (s !== null && e !== null) el.setSelectionRange(s, e); } catch { /* tipe yang tak mendukung seleksi */ }
  if (notify) el.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function AutoCaps() {
  useEffect(() => {
    const onInput = (ev: Event) => {
      if ((ev as InputEvent).isComposing) return;                         // jangan ganggu IME (keyboard prediktif HP); ditangani saat compositionend
      if (eligible(ev.target)) upper(ev.target, false);                    // sebelum React membaca nilainya → onChange langsung kapital
    };
    const onCompEnd = (ev: Event) => { if (eligible(ev.target)) upper(ev.target, true); };
    // keyboard HP: minta huruf besar saat isian difokuskan
    const onFocus = (ev: Event) => { if (eligible(ev.target) && ev.target.getAttribute("autocapitalize") !== "characters") ev.target.setAttribute("autocapitalize", "characters"); };
    document.addEventListener("input", onInput, true);
    document.addEventListener("compositionend", onCompEnd, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("compositionend", onCompEnd, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, []);
  return null;
}
