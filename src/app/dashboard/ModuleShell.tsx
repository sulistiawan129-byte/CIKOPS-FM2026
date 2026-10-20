"use client";

/* Kerangka standar modul dashboard (gaya ATK): kicker, judul, deskripsi, aksi, dan tab.
   Dipakai supaya semua modul punya header & navigasi yang seragam. */

import type { ReactNode } from "react";
import s from "./atk.module.css";

export function ModuleHeader({ kicker, title, desc, actions }: { kicker: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={s.head}>
      <div className={s.headText}>
        <span className={s.kicker}>{kicker}</span>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className={s.headSide}>{actions}</div>}
    </header>
  );
}

export interface ModuleTab<T extends string> { id: T; label: string; badge?: number; icon?: string }

export function ModuleTabs<T extends string>({ tabs, value, onChange, label }: { tabs: ModuleTab<T>[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <nav className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`${s.tab} ${value === t.id ? s.tabOn : ""}`} onClick={() => onChange(t.id)}>
          {t.icon && <span aria-hidden>{t.icon}</span>}
          {t.label}
          {t.badge ? <span className={s.tabBadge}>{t.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

/** Pembungkus halaman modul (jarak & padding standar). */
export function ModulePage({ children }: { children: ReactNode }) {
  return <div className={s.wrap}>{children}</div>;
}
