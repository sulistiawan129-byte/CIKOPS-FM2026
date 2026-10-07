"use client";

/**
 * Tampilan modul Klaim — "struk".
 * Klaim driver pada dasarnya struk (bensin, tol, parkir), jadi form punya
 * pratinjau struk yang terisi langsung saat mengetik, dan daftar klaim
 * dikelompokkan per minggu kerja dengan bar komposisi kategori.
 *
 * Komponen di sini murni tampilan: state, API, dan ekspor tetap di ClaimsTab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./claims.module.css";
import type { Claim } from "@/lib/types";

/* ───────────────────────── kategori ───────────────────────── */

export const CLAIM_CATS = ["Gasoline", "Toll", "Parking", "Service", "Maintenance", "Other"] as const;

const CAT_META: Record<string, { color: string; id: string; en: string; icon: ReactNode }> = {
  Gasoline: {
    color: "var(--green)", id: "Bensin", en: "Fuel",
    icon: <><path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" /><path d="M3 20h12" /><path d="M7 8h4" /><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3" /></>,
  },
  Toll: {
    color: "var(--brand)", id: "Tol", en: "Toll",
    icon: <><path d="M3 9a2 2 0 0 0 0 4v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-4V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1Z" /><path d="M13 6v12" strokeDasharray="2 2.4" /></>,
  },
  Parking: {
    color: "var(--orange)", id: "Parkir", en: "Parking",
    icon: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M9.5 16.5V7.5h3.2a2.7 2.7 0 0 1 0 5.4H9.5" /></>,
  },
  Service: {
    color: "var(--red)", id: "Servis", en: "Service",
    icon: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-.5-.5-2.1Z" />,
  },
  Maintenance: {
    color: "var(--purple, #8b6cf0)", id: "Perawatan", en: "Maintenance",
    icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
  },
  Other: {
    color: "var(--t3)", id: "Lainnya", en: "Other",
    icon: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  },
};

export function catMeta(type: string) {
  return CAT_META[type] ?? CAT_META.Other;
}
export function catLabel(type: string, lang: string) {
  const m = catMeta(type);
  return CAT_META[type] ? (lang === "en" ? m.en : m.id) : type;
}

export function CatIcon({ type, size = 16 }: { type: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {catMeta(type).icon}
    </svg>
  );
}

/* ───────────────────────── helper ───────────────────────── */

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateLabel(iso: string, lang: string, withYear = true) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}),
  });
}

function initials(name: string) {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const h = hue(name || "?");
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${h} 62% 46%)`, boxShadow: `0 0 0 3px hsl(${h} 62% 46% / .16)` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** Angka yang bergeser halus ke target — dipakai untuk total di struk. */
function useTween(target: number, ms = 420) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setV(target); from.current = target; return; }
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e;
      setV(cur);
      from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ───────────────────────── tab tampilan ───────────────────────── */

export function ViewSwitch<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { key: T; label: string; icon?: ReactNode }[] }) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <div className={styles.views} role="tablist" style={{ ["--n" as string]: options.length, ["--i" as string]: idx }}>
      <span className={styles.viewsInk} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={value === o.key}
          className={`${styles.viewBtn} ${value === o.key ? styles.viewBtnOn : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function PeriodSwitch({
  value, onChange, labels,
}: { value: "all" | "week" | "date"; onChange: (v: "all" | "week" | "date") => void; labels: [string, string, string] }) {
  const keys = ["all", "week", "date"] as const;
  return (
    <div className={styles.seg} style={{ ["--i" as string]: keys.indexOf(value) }} role="group">
      <span className={styles.segInk} aria-hidden="true" />
      {keys.map((k, i) => (
        <button key={k} aria-pressed={value === k} className={`${styles.segBtn} ${value === k ? styles.segBtnOn : ""}`} onClick={() => onChange(k)}>
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── ringkasan ───────────────────────── */

export function ClaimsHero({
  lang, total, count, drivers, byType, activeType, onType, totalValue, countValue, driversValue, periodLabel,
}: {
  lang: string; total: number; count: number; drivers: number;
  byType: { type: string; amount: number }[];
  activeType: string | null; onType: (t: string | null) => void;
  totalValue: number; countValue: number; driversValue: number; periodLabel: string;
}) {
  const sum = byType.reduce((s, b) => s + b.amount, 0);
  return (
    <section className={styles.hero} aria-label={lang === "en" ? "Claims summary" : "Ringkasan klaim"}>
      <div className={styles.heroMain}>
        <div className={styles.heroLabel}>{lang === "en" ? "Total claimed" : "Total klaim"} · {periodLabel}</div>
        <div className={styles.heroTotal}><small>Rp</small>{fmt(totalValue)}</div>
        <div className={styles.heroMeta}>
          <span><b>{countValue}</b> {lang === "en" ? "claims" : "klaim"}</span>
          <span><b>{driversValue}</b> {lang === "en" ? "drivers" : "driver"}</span>
          {count > 0 && <span>{lang === "en" ? "avg" : "rata-rata"} <b>Rp {fmt(total / count)}</b></span>}
        </div>
      </div>

      <div className={styles.mix}>
        <div className={styles.mixBar} role="img" aria-label={lang === "en" ? "Share by category" : "Komposisi per kategori"}>
          {sum === 0 && <span className={styles.mixEmpty} />}
          {byType.filter((b) => b.amount > 0).map((b) => (
            <button
              key={b.type}
              className={`${styles.mixSeg} ${activeType && activeType !== b.type ? styles.mixDim : ""}`}
              style={{ flexGrow: b.amount, ["--c" as string]: catMeta(b.type).color }}
              onClick={() => onType(activeType === b.type ? null : b.type)}
              title={`${catLabel(b.type, lang)} · Rp ${fmt(b.amount)}`}
              aria-label={`${catLabel(b.type, lang)} Rp ${fmt(b.amount)}`}
            />
          ))}
        </div>
        <div className={styles.mixLegend}>
          {byType.map((b) => (
            <button
              key={b.type}
              className={`${styles.chip} ${activeType === b.type ? styles.chipOn : ""} ${b.amount === 0 ? styles.chipZero : ""}`}
              style={{ ["--c" as string]: catMeta(b.type).color }}
              onClick={() => onType(activeType === b.type ? null : b.type)}
              aria-pressed={activeType === b.type}
            >
              <CatIcon type={b.type} size={14} />
              <span>{catLabel(b.type, lang)}</span>
              <em>{b.amount > 0 ? fmt(b.amount) : "–"}</em>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── daftar klaim ───────────────────────── */

export function WeekHeader({ label, count, total, lang }: { label: string; count: number; total: number; lang: string }) {
  return (
    <div className={styles.weekHead}>
      <span className={styles.weekName}>{label}</span>
      <span className={styles.weekLine} aria-hidden="true" />
      <span className={styles.weekSum}>
        {count} {lang === "en" ? "claims" : "klaim"} · <b>Rp {fmt(total)}</b>
      </span>
    </div>
  );
}

export function ClaimCard({
  claim, open, onToggle, onDelete, lang, typeFilter, weekText,
}: {
  claim: Claim; open: boolean; onToggle: () => void; onDelete: () => void;
  lang: string; typeFilter: string | null; weekText: string;
}) {
  const types = useMemo(() => [...new Set(claim.items.map((i) => i.type))], [claim.items]);
  const max = Math.max(1, ...claim.items.map((i) => i.total));
  return (
    <article className={`${styles.card} ${open ? styles.cardOpen : ""}`}>
      <button className={styles.cardHead} onClick={onToggle} aria-expanded={open}>
        <Avatar name={claim.driverName} />
        <span className={styles.cardWho}>
          <span className={styles.cardName}>{claim.driverName || "-"}</span>
          <span className={styles.cardDate}>
            {lang === "en" ? "Period" : "Periode"} {dateLabel(claim.periodDate, lang)}
            <i aria-hidden="true">·</i>
            {lang === "en" ? "filed" : "diajukan"} {dateLabel(claim.submissionDate, lang, false)}
          </span>
        </span>
        <span className={styles.cardTypes}>
          {types.map((tp) => (
            <span
              key={tp}
              className={`${styles.pill} ${typeFilter === tp ? styles.pillHit : ""}`}
              style={{ ["--c" as string]: catMeta(tp).color }}
            >
              <CatIcon type={tp} size={13} />{catLabel(tp, lang)}
            </span>
          ))}
        </span>
        <span className={styles.cardAmt}>
          <span><small>Rp</small>{fmt(claim.total)}</span>
          <span className={styles.cardCount}>{claim.items.length} {lang === "en" ? "items" : "item"}</span>
        </span>
        <svg className={styles.chev} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <button className={styles.cardDel} onClick={onDelete} aria-label={lang === "en" ? "Delete claim" : "Hapus klaim"} title={lang === "en" ? "Delete" : "Hapus"}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" /></svg>
      </button>

      <div className={styles.expand} data-open={open}>
        <div className={styles.expandInner}>
          <div className={styles.slip}>
            <div className={styles.slipHead}>
              <span>{weekText}</span>
              <span>{lang === "en" ? "Filed" : "Diajukan"} {dateLabel(claim.submissionDate, lang)}</span>
            </div>
            {claim.items.map((it, i) => (
              <div className={styles.slipRow} key={i} style={{ ["--c" as string]: catMeta(it.type).color }}>
                <span className={styles.slipType}><CatIcon type={it.type} size={14} />{catLabel(it.type, lang)}</span>
                <span className={styles.slipExpr}>{it.expr}</span>
                <span className={styles.slipAmt}>Rp {fmt(it.total)}</span>
                <span className={styles.slipBar} style={{ ["--w" as string]: `${(it.total / max) * 100}%` }} />
              </div>
            ))}
            <div className={styles.slipTotal}><span>Total</span><b>Rp {fmt(claim.total)}</b></div>
            {claim.note && <div className={styles.slipNote}>“{claim.note}”</div>}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ───────────────────────── rekap mingguan ───────────────────────── */

export function RecapBar({ g, t, p, o }: { g: number; t: number; p: number; o: number }) {
  const sum = g + t + p + o;
  if (!sum) return <span className={styles.recapBar} />;
  const seg = (v: number, c: string) => <i style={{ flexGrow: v, background: c }} />;
  return (
    <span className={styles.recapBar} aria-hidden="true">
      {g > 0 && seg(g, "var(--green)")}{t > 0 && seg(t, "var(--brand)")}{p > 0 && seg(p, "var(--orange)")}{o > 0 && seg(o, "var(--t3)")}
    </span>
  );
}

/* ───────────────────────── form klaim ───────────────────────── */

export interface ClaimLine { id: number; type: string; expr: string }

export interface ClaimFormProps {
  lang: string;
  drivers: { id: string; nama: string }[];
  driverId: string; setDriverId: (v: string) => void;
  submissionDate: string; setSubmissionDate: (v: string) => void;
  periodDate: string; setPeriodDate: (v: string) => void;
  weekLabel: string;
  lines: ClaimLine[];
  addLine: () => void; removeLine: (id: number) => void;
  updateLine: (id: number, field: "type" | "expr", value: string) => void;
  note: string; setNote: (v: string) => void;
  grandTotal: number; canSave: boolean; saving: boolean;
  onSave: () => void; onClose: () => void;
  evalExpr: (raw: string) => number | null;
  cancelText: string; savingText: string;
}

const QUICK = [10000, 20000, 50000, 100000];

export function ClaimForm(p: ClaimFormProps) {
  const { lang, evalExpr } = p;
  const en = lang === "en";
  const [q, setQ] = useState("");
  const total = useTween(p.grandTotal);
  const firstRef = useRef<HTMLInputElement>(null);
  const driver = p.drivers.find((d) => d.id === p.driverId);
  const shown = p.drivers.filter((d) => d.nama.toLowerCase().includes(q.trim().toLowerCase()));
  const today = isoLocal(new Date());
  const yest = isoLocal(new Date(Date.now() - 86400000));
  const filled = p.lines.filter((l) => l.expr.trim() !== "");
  const allValid = p.lines.every((l) => (evalExpr(l.expr) || 0) > 0);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const hint = !p.driverId
    ? (en ? "Pick a driver to continue" : "Pilih driver dulu")
    : !allValid
      ? (en ? "Fill in an amount on every line" : "Isi nominal di setiap baris")
      : null;

  const quickAdd = (id: number, expr: string, amount: number) => {
    const clean = expr.trim();
    p.updateLine(id, "expr", clean ? `${clean}+${amount}` : String(amount));
  };

  return (
    <div className={styles.form}>
      <header className={styles.formHead}>
        <div>
          <h2>{en ? "New claim" : "Buat klaim"}</h2>
          <p>{en ? "Add what the driver spent — the receipt on the right updates as you type." : "Catat pengeluaran driver. Struk di kanan ikut terisi saat Anda mengetik."}</p>
        </div>
        <button className={styles.x} onClick={p.onClose} aria-label={en ? "Close" : "Tutup"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>

      <div className={styles.formBody}>
        <div className={styles.formCol}>
          {/* 1 · driver */}
          <section className={styles.block}>
            <h3>{en ? "Who is claiming?" : "Klaim untuk siapa?"}</h3>
            {p.drivers.length > 7 && (
              <input
                ref={firstRef}
                className={styles.search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={en ? "Search driver name" : "Cari nama driver"}
                aria-label={en ? "Search driver" : "Cari driver"}
              />
            )}
            <div className={styles.drivers} role="radiogroup" aria-label="Driver">
              {shown.map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={p.driverId === d.id}
                  className={`${styles.drv} ${p.driverId === d.id ? styles.drvOn : ""}`}
                  onClick={() => p.setDriverId(d.id)}
                >
                  <Avatar name={d.nama} size={26} />
                  <span>{d.nama}</span>
                </button>
              ))}
              {shown.length === 0 && <span className={styles.none}>{en ? "No driver matches" : "Tidak ada driver yang cocok"}</span>}
            </div>
          </section>

          {/* 2 · tanggal */}
          <section className={styles.block}>
            <h3>{en ? "Which day?" : "Pengeluaran tanggal berapa?"}</h3>
            <div className={styles.dateRow}>
              <input className={styles.date} type="date" value={p.periodDate} onChange={(e) => p.setPeriodDate(e.target.value)} aria-label={en ? "Period date" : "Tanggal periode"} />
              <button className={`${styles.quick} ${p.periodDate === today ? styles.quickOn : ""}`} onClick={() => p.setPeriodDate(today)}>{en ? "Today" : "Hari ini"}</button>
              <button className={`${styles.quick} ${p.periodDate === yest ? styles.quickOn : ""}`} onClick={() => p.setPeriodDate(yest)}>{en ? "Yesterday" : "Kemarin"}</button>
              <span className={styles.weekTag}>{p.weekLabel}</span>
            </div>
            <label className={styles.inline}>
              <span>{en ? "Filed on" : "Diajukan tanggal"}</span>
              <input className={styles.dateSm} type="date" value={p.submissionDate} onChange={(e) => p.setSubmissionDate(e.target.value)} />
            </label>
          </section>

          {/* 3 · rincian */}
          <section className={styles.block}>
            <h3>{en ? "What was spent?" : "Apa saja yang dikeluarkan?"}</h3>
            <div className={styles.lines}>
              {p.lines.map((l, idx) => {
                const val = evalExpr(l.expr);
                const meta = catMeta(l.type);
                return (
                  <div key={l.id} className={styles.line} style={{ ["--c" as string]: meta.color }}>
                    <div className={styles.cats} role="radiogroup" aria-label={en ? "Category" : "Kategori"}>
                      {CLAIM_CATS.map((c) => (
                        <button
                          key={c}
                          role="radio"
                          aria-checked={l.type === c}
                          className={`${styles.cat} ${l.type === c ? styles.catOn : ""}`}
                          style={{ ["--c" as string]: catMeta(c).color }}
                          onClick={() => p.updateLine(l.id, "type", c)}
                        >
                          <CatIcon type={c} size={15} />{catLabel(c, lang)}
                        </button>
                      ))}
                    </div>
                    <div className={styles.amountRow}>
                      <div className={`${styles.amount} ${l.expr && val === null ? styles.amountBad : ""}`}>
                        <span className={styles.rp}>Rp</span>
                        <input
                          inputMode="text"
                          autoComplete="off"
                          value={l.expr}
                          placeholder="50000+30000"
                          aria-label={`${en ? "Amount" : "Nominal"} ${idx + 1}`}
                          onChange={(e) => p.updateLine(l.id, "expr", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (evalExpr(l.expr) || 0) > 0 && idx === p.lines.length - 1) { e.preventDefault(); p.addLine(); }
                          }}
                        />
                        <span className={styles.eq} data-bad={l.expr !== "" && val === null}>
                          {l.expr === "" ? "" : val !== null ? `= ${fmt(val)}` : (en ? "Invalid" : "Tidak valid")}
                        </span>
                      </div>
                      <button className={styles.rm} onClick={() => p.removeLine(l.id)} disabled={p.lines.length === 1} aria-label={en ? "Remove line" : "Hapus baris"}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </div>
                    <div className={styles.quickRow}>
                      {QUICK.map((a) => (
                        <button key={a} className={styles.add} onClick={() => quickAdd(l.id, l.expr, a)}>
                          +{a >= 100000 ? "100" : a / 1000}{en ? "k" : "rb"}
                        </button>
                      ))}
                      <span className={styles.tip}>{en ? "Combine with + , e.g. 50000+30000" : "Gabung dengan +, mis. 50000+30000"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className={styles.addLine} onClick={p.addLine}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              {en ? "Add another expense" : "Tambah pengeluaran lain"}
            </button>
          </section>

          {/* 4 · catatan */}
          <section className={styles.block}>
            <h3>{en ? "Note" : "Catatan"} <em>{en ? "optional" : "opsional"}</em></h3>
            <input className={styles.search} value={p.note} onChange={(e) => p.setNote(e.target.value)} placeholder={en ? "e.g. trip to Pasar Rebo" : "mis. antar dokumen ke Pasar Rebo"} />
          </section>
        </div>

        {/* struk */}
        <aside className={styles.paperWrap} aria-label={en ? "Receipt preview" : "Pratinjau struk"}>
          <div className={styles.paper}>
            <div className={styles.pHead}>
              <b>CIKOPS-FM</b>
              <span>{en ? "Driver expense claim" : "Klaim pengeluaran driver"}</span>
            </div>
            <div className={styles.pMeta}>
              <div><span>{en ? "Driver" : "Driver"}</span><b>{driver?.nama ?? "—"}</b></div>
              <div><span>{en ? "Period" : "Periode"}</span><b>{dateLabel(p.periodDate, lang)}</b></div>
              <div><span>{en ? "Week" : "Minggu"}</span><b>{p.weekLabel}</b></div>
            </div>
            <div className={styles.pRule} />
            <div className={styles.pLines}>
              {filled.length === 0 && <div className={styles.pEmpty}>{en ? "Nothing yet. Enter an amount on the left." : "Belum ada isi. Masukkan nominal di sebelah kiri."}</div>}
              {filled.map((l) => {
                const v = evalExpr(l.expr);
                return (
                  <div className={styles.pLine} key={l.id}>
                    <span className={styles.pDot} style={{ background: catMeta(l.type).color }} />
                    <span className={styles.pName}>{catLabel(l.type, lang)}<small>{l.expr}</small></span>
                    <span className={styles.pAmt}>{v !== null ? fmt(v) : "?"}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.pRule} />
            <div className={styles.pTotal}>
              <span>TOTAL</span>
              <b>Rp {fmt(total)}</b>
            </div>
            {p.canSave && <div className={styles.stamp} key="stamp">{en ? "Ready to submit" : "Siap diajukan"}</div>}
            <div className={styles.barcode} aria-hidden="true" />
          </div>
        </aside>
      </div>

      <footer className={styles.formFoot}>
        <button className={styles.ghost} onClick={p.onClose}>{p.cancelText}</button>
        <div className={styles.footTotal}>
          <span>{filled.length > 0 ? `${filled.length} ${en ? "items" : "item"}` : "Total"}</span>
          <b>Rp {fmt(total)}</b>
        </div>
        <div className={styles.footCta}>
          {hint && <span className={styles.hint}>{hint}</span>}
          <button className={styles.submit} onClick={p.onSave} disabled={!p.canSave || p.saving}>
            {p.saving ? p.savingText : (en ? "Submit claim" : "Ajukan klaim")}
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────────────── karangan bunga ───────────────────────── */

export function WreathCard({
  atasNama, keterangan, tanggal, plant, claimed, onToggle, onDelete, lang,
}: {
  atasNama: string; keterangan: string; tanggal: string; plant: string; claimed: boolean;
  onToggle: () => void; onDelete: () => void; lang: string;
}) {
  const en = lang === "en";
  return (
    <article className={styles.wreath}>
      <span className={styles.wreathIc} aria-hidden="true">💐</span>
      <div className={styles.wreathMain}>
        <div className={styles.wreathName}>{atasNama}</div>
        <div className={styles.wreathSub}>
          {dateLabel(tanggal, lang)} <i>·</i> {plant}{keterangan ? <><i>·</i>{keterangan}</> : null}
        </div>
      </div>
      <button
        className={`${styles.switch} ${claimed ? styles.switchOn : ""}`}
        role="switch"
        aria-checked={claimed}
        onClick={onToggle}
        title={en ? "Toggle claim status" : "Ubah status klaim"}
      >
        <span className={styles.knob} />
        <span className={styles.switchTxt}>{claimed ? (en ? "Submitted" : "Sudah diajukan") : (en ? "Not yet" : "Belum diajukan")}</span>
      </button>
      <button className={styles.wreathDel} onClick={onDelete} aria-label={en ? "Delete" : "Hapus"}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
      </button>
    </article>
  );
}
