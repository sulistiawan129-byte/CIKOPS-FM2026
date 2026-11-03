"use client";

/* Kotak pencarian untuk memilih orang (karyawan, pemohon, dll.) dari daftar panjang.
   Gantinya <select> / <datalist> yang sulit dipakai di HP: ketik sebagian nama, NIK, atau departemen
   (beberapa kata boleh, urutannya bebas) → hasil muncul di bawah kolom, ketuk untuk memilih.
   • strict  : hanya boleh memilih dari daftar (teks yang tidak dipilih dikembalikan saat kolom ditinggalkan)
   • bebas   : teks yang diketik tetap dipakai bila tidak ada yang cocok (mis. tamu / orang di luar data karyawan) */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { L } from "@/lib/i18n";

export interface PickOption { key: string; name: string; hint?: string }

const MAX_SHOWN = 8;

export function SearchPick<T extends PickOption>({
  options, value, onChange, onPick, onBlur, placeholder, strict = false, required, inputClassName, inputRef, ariaLabel, autoFocus, maxLength,
}: {
  options: T[]; value: string; onChange: (text: string) => void; onPick?: (o: T) => void; onBlur?: () => void; placeholder?: string;
  strict?: boolean; required?: boolean; inputClassName?: string; inputRef?: React.Ref<HTMLInputElement>; ariaLabel?: string; autoFocus?: boolean; maxLength?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // nilai dari luar (terpilih / dikosongkan / form di-reset) → ikut ke kolom
  useEffect(() => { setText(value); }, [value]);

  const q = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [] as T[];
    const toks = q.split(/\s+/);
    const rank = (o: T) => { const n = o.name.toLowerCase(); return n.startsWith(q) ? 0 : n.split(/\s+/).some((w) => w.startsWith(toks[0])) ? 1 : 2; };
    return options
      .filter((o) => { const h = `${o.name} ${o.hint ?? ""}`.toLowerCase(); return toks.every((t) => h.includes(t)); })
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [q, options]);
  const shown = matches.slice(0, MAX_SHOWN);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" }); }, [hi]);

  function pick(o: T) {
    setText(o.name); setOpen(false);
    onChange(o.name);
    onPick?.(o);
  }
  function clear() { setText(""); onChange(""); setOpen(true); }

  function handleBlur() {
    setOpen(false);
    if (strict && text !== value) {
      // ketikan persis sama dengan satu nama → anggap terpilih; selain itu kembalikan ke pilihan terakhir
      const exact = options.filter((o) => o.name.toLowerCase() === q);
      if (exact.length === 1) pick(exact[0]); else setText(value);
    }
    onBlur?.();
  }

  const box: React.CSSProperties = {
    position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 80, margin: 0, padding: 4, listStyle: "none",
    background: "linear-gradient(var(--surface, #fff), var(--surface, #fff)), var(--bg, #fff)", border: "1px solid var(--border2, #cfd8ea)", borderRadius: 12,
    boxShadow: "0 16px 40px -12px rgba(8,16,40,.45)", maxHeight: 360, overflowY: "auto",
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef} className={inputClassName} value={text} placeholder={placeholder} required={required} autoFocus={autoFocus} maxLength={maxLength}
        role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-label={ariaLabel}
        autoComplete="off" autoCapitalize="words" spellCheck={false} inputMode="search" enterKeyHint="search"
        style={{ paddingRight: text ? 36 : undefined }}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (!strict) onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(shown.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
      />
      {text && (
        <button type="button" aria-label={L("Hapus", "Clear")} tabIndex={-1}
          onPointerDown={(e) => { e.preventDefault(); clear(); }}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, border: 0, borderRadius: 8, background: "transparent", color: "var(--t3, #7a86aa)", fontSize: 15, cursor: "pointer" }}>✕</button>
      )}
      {open && (
        <ul id={id} role="listbox" ref={listRef} style={box}>
          {!q && <li style={{ padding: "12px 12px", fontSize: 13, color: "var(--t3, #7a86aa)" }}>{L(`Ketik nama, NIK, atau departemen untuk mencari (${options.length} orang)`, `Type a name, ID or department to search (${options.length} people)`)}</li>}
          {q && shown.length === 0 && (
            <li style={{ padding: "12px 12px", fontSize: 13, color: "var(--t3, #7a86aa)" }}>
              {strict ? L("Tidak ada yang cocok.", "No match.") : L(`Tidak ditemukan — “${text.trim()}” dipakai apa adanya.`, `No match — “${text.trim()}” will be used as typed.`)}
            </li>
          )}
          {shown.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === hi}
              onPointerDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHi(i)}
              style={{ padding: "10px 12px", minHeight: 48, display: "flex", flexDirection: "column", justifyContent: "center", borderRadius: 9, cursor: "pointer",
                background: i === hi ? "color-mix(in srgb, var(--brand, #2d5bff) 14%, transparent)" : "transparent" }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--t1, #0d1a36)" }}>{o.name}</span>
              {o.hint && <span style={{ fontSize: 12, color: "var(--t3, #7a86aa)" }}>{o.hint}</span>}
            </li>
          ))}
          {matches.length > MAX_SHOWN && (
            <li style={{ padding: "8px 12px", fontSize: 12, color: "var(--t3, #7a86aa)" }}>{L(`+${matches.length - MAX_SHOWN} lainnya — ketik lebih spesifik`, `+${matches.length - MAX_SHOWN} more — type something more specific`)}</li>
          )}
        </ul>
      )}
    </div>
  );
}
