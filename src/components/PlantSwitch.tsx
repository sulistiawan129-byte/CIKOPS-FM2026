"use client";

/* Pemilih Plant (Semua / CIK / PRB) untuk laporan & daftar.
   Akun yang dikunci ke satu plant (Admin GA CIK / PRB) tidak bisa mengganti — hanya melihat penanda "Plant … (sesuai akun)". */

import { L } from "@/lib/i18n";
import { plantShort } from "@/lib/brand";
import type { Plant } from "@/lib/types";
import s from "./PlantSwitch.module.css";

export type PlantSel = "all" | Plant;

/** Plant efektif untuk query: scope akun menang atas pilihan; "all" → null (semua plant). */
export const effectivePlant = (locked: Plant | null | undefined, sel: PlantSel): Plant | null => locked ?? (sel === "all" ? null : sel);

export function PlantSwitch({ value, onChange, locked, label, allowAll = true, compact = false }: {
  value: PlantSel; onChange: (v: PlantSel) => void; locked?: Plant | null; label?: string; allowAll?: boolean;
  /** tanpa judul kecil di atas (untuk baris filter) */
  compact?: boolean;
}) {
  const title = label ?? L("Plant", "Plant");
  if (locked) {
    return (
      <div className={s.wrap}>
        {!compact && <span className={s.label}>{title}</span>}
        <span className={s.locked} title={L("Akun ini dibatasi ke satu plant", "This account is limited to one plant")}>🔒 {plantShort(locked)} <small>{L("(sesuai akun)", "(per account)")}</small></span>
      </div>
    );
  }
  const opts: PlantSel[] = allowAll ? ["all", "CIK", "PRB"] : ["CIK", "PRB"];
  return (
    <div className={s.wrap}>
      {!compact && <span className={s.label}>{title}</span>}
      <div className={s.seg} role="group" aria-label={title}>
        {opts.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} className={value === o ? s.on : ""} onClick={() => onChange(o)}>
            {o === "all" ? L("Semua plant", "All plants") : plantShort(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
