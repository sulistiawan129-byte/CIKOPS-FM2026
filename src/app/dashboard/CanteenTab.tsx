"use client";

/* ════════════════════════════════════════════════════════════
   KANTIN — dashboard (admin, baca + hapus). Input harian ada di /canteen.
   - Periode: Harian / Mingguan / Bulanan / Kustom, dengan tombol mundur/maju
   - Ring efisiensi keseluruhan + kartu Snack & Makan
   - Grafik harian interaktif (hover = tooltip, klik = pilih hari)
   - Rincian per shift (1/2/3) untuk periode atau hari terpilih
   - Catatan otomatis, tabel harian, ekspor CSV & PDF, hapus laporan
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/providers";
import { ModalPortal } from "@/components/ModalPortal";
import { getAllCanteenReports, deleteCanteenReport } from "@/lib/api";
import type { CanteenReport } from "@/lib/types";
import { exportCanteenToPdf } from "@/lib/canteenReport";
import c from "./canteen.module.css";

type PeriodMode = "day" | "week" | "month" | "custom";
type Cat = "snack" | "meal";

interface DayAgg {
  date: string;
  snackOrder: number;
  snackLeftover: number;
  snackConsumed: number;
  mealOrder: number;
  mealLeftover: number;
  mealConsumed: number;
}

const SHIFTS = ["Shift 1", "Shift 2", "Shift 3"];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekRangeOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}
const num = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const pctTxt = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
function dShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function dFull(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
const sum3 = (a: number[]) => (a[0] || 0) + (a[1] || 0) + (a[2] || 0);
function toDayAgg(r: CanteenReport): DayAgg {
  const snackOrder = sum3(r.snackOrder), snackLeftover = sum3(r.snackLeftover);
  const mealOrder = sum3(r.mealOrder), mealLeftover = sum3(r.mealLeftover);
  return {
    date: r.reportDate,
    snackOrder, snackLeftover, snackConsumed: Math.max(0, snackOrder - snackLeftover),
    mealOrder, mealLeftover, mealConsumed: Math.max(0, mealOrder - mealLeftover),
  };
}
const effOf = (consumed: number, order: number) => (order > 0 ? (consumed / order) * 100 : 0);
function health(eff: number, hasData: boolean): { label: string; tone: string } {
  if (!hasData) return { label: "Belum ada data", tone: c.tMute };
  if (eff >= 97) return { label: "Sangat baik", tone: c.tGood };
  if (eff >= 90) return { label: "Baik", tone: c.tGood };
  if (eff >= 80) return { label: "Cukup", tone: c.tWarn };
  return { label: "Perlu perhatian", tone: c.tBad };
}

const IcPrev = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
const IcNext = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;
const IcDown = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" /></svg>;
const IcTrash = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
const IcBulb = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2l.1.7h4.8l.1-.7c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" /></svg>;

export default function CanteenTab() {
  const { t } = useLang();
  const now = new Date();

  const [allRows, setAllRows] = useState<CanteenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CanteenReport | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [mode, setMode] = useState<PeriodMode>("month");
  const [dayValue, setDayValue] = useState(toISO(now));
  const [monthValue, setMonthValue] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [customFrom, setCustomFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(toISO(now));

  const [cat, setCat] = useState<Cat>("snack");
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAllRows(await getAllCanteenReports());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data kantin");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteCanteenReport(confirmDelete.id);
      if (picked === confirmDelete.reportDate) setPicked(null);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus laporan");
    }
  }

  const { rangeFrom, rangeTo, periodLabel } = useMemo(() => {
    if (mode === "day") return { rangeFrom: dayValue, rangeTo: dayValue, periodLabel: dFull(dayValue) };
    if (mode === "week") {
      const { from, to } = weekRangeOf(dayValue);
      return { rangeFrom: from, rangeTo: to, periodLabel: `${dShort(from)} – ${dShort(to)}` };
    }
    if (mode === "custom") return { rangeFrom: customFrom, rangeTo: customTo, periodLabel: `${dShort(customFrom)} – ${dShort(customTo)}` };
    const [y, m] = monthValue.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      rangeFrom: `${monthValue}-01`,
      rangeTo: `${monthValue}-${String(last).padStart(2, "0")}`,
      periodLabel: new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
    };
  }, [mode, dayValue, monthValue, customFrom, customTo]);

  function shift(dir: -1 | 1) {
    setPicked(null);
    if (mode === "day" || mode === "week") {
      const d = new Date(dayValue + "T00:00:00");
      d.setDate(d.getDate() + dir * (mode === "day" ? 1 : 7));
      setDayValue(toISO(d));
    } else if (mode === "month") {
      const [y, m] = monthValue.split("-").map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      setMonthValue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }

  const filteredRows = useMemo(
    () => allRows.filter((r) => r.reportDate >= rangeFrom && r.reportDate <= rangeTo).sort((a, b) => (a.reportDate < b.reportDate ? -1 : 1)),
    [allRows, rangeFrom, rangeTo]
  );
  const dayAggs = useMemo(() => filteredRows.map(toDayAgg), [filteredRows]);

  const totals = useMemo(() => {
    const s = (k: keyof Omit<DayAgg, "date">) => dayAggs.reduce((a, d) => a + d[k], 0);
    const snackOrder = s("snackOrder"), snackLeftover = s("snackLeftover"), snackConsumed = s("snackConsumed");
    const mealOrder = s("mealOrder"), mealLeftover = s("mealLeftover"), mealConsumed = s("mealConsumed");
    const overallOrder = snackOrder + mealOrder, overallConsumed = snackConsumed + mealConsumed;
    return {
      snackOrder, snackLeftover, snackConsumed, snackEff: effOf(snackConsumed, snackOrder),
      mealOrder, mealLeftover, mealConsumed, mealEff: effOf(mealConsumed, mealOrder),
      overallOrder, overallConsumed, overallEff: effOf(overallConsumed, overallOrder),
    };
  }, [dayAggs]);

  // Rincian per shift — untuk hari terpilih, atau seluruh periode
  const shiftRows = useMemo(() => {
    const src = picked ? filteredRows.filter((r) => r.reportDate === picked) : filteredRows;
    return SHIFTS.map((label, i) => {
      const so = src.reduce((a, r) => a + (r.snackOrder[i] || 0), 0);
      const sl = src.reduce((a, r) => a + (r.snackLeftover[i] || 0), 0);
      const mo = src.reduce((a, r) => a + (r.mealOrder[i] || 0), 0);
      const ml = src.reduce((a, r) => a + (r.mealLeftover[i] || 0), 0);
      return { label, so, sl, mo, ml, sEff: effOf(Math.max(0, so - sl), so), mEff: effOf(Math.max(0, mo - ml), mo) };
    });
  }, [filteredRows, picked]);

  const insights = useMemo(() => {
    if (dayAggs.length === 0) return [] as string[];
    const out: string[] = [];
    const sPeak = dayAggs.reduce((b, d) => (d.snackLeftover > b.snackLeftover ? d : b), dayAggs[0]);
    const mPeak = dayAggs.reduce((b, d) => (d.mealLeftover > b.mealLeftover ? d : b), dayAggs[0]);
    if (sPeak.snackLeftover > 0) out.push(`Sisa snack terbanyak ${num(sPeak.snackLeftover)} porsi pada ${dShort(sPeak.date)}.`);
    if (mPeak.mealLeftover > 0) out.push(`Sisa makan terbanyak ${num(mPeak.mealLeftover)} porsi pada ${dShort(mPeak.date)}.`);
    const allShift = SHIFTS.map((label, i) => ({
      label,
      left: filteredRows.reduce((a, r) => a + (r.snackLeftover[i] || 0) + (r.mealLeftover[i] || 0), 0),
    })).sort((a, b) => b.left - a.left)[0];
    if (allShift && allShift.left > 0) out.push(`${allShift.label} menyumbang sisa paling banyak (${num(allShift.left)} porsi).`);
    if (out.length === 0) out.push("Tidak ada sisa makanan pada periode ini.");
    return out;
  }, [dayAggs, filteredRows]);

  const autoAnalysis = useMemo(() => {
    if (dayAggs.length === 0) return "Belum ada data tercatat pada periode ini.";
    return `${periodLabel} — Snack ${totals.snackEff.toFixed(2)}% · Makan ${totals.mealEff.toFixed(2)}% · Keseluruhan ${totals.overallEff.toFixed(1)}% — ${health(totals.overallEff, true).label}. ${insights.join(" ")}`;
  }, [dayAggs, totals, periodLabel, insights]);

  function handleExportCsv() {
    const lines = [["Tanggal", "Snack Order", "Snack Sisa", "Snack Terpakai", "Makan Order", "Makan Sisa", "Makan Terpakai"].join(",")];
    dayAggs.forEach((d) => lines.push([d.date, d.snackOrder, d.snackLeftover, d.snackConsumed, d.mealOrder, d.mealLeftover, d.mealConsumed].join(",")));
    lines.push("");
    lines.push(["TOTAL", totals.snackOrder, totals.snackLeftover, totals.snackConsumed, totals.mealOrder, totals.mealLeftover, totals.mealConsumed].join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan_Kantin_${rangeFrom}_sd_${rangeTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportCanteenToPdf(dayAggs, totals, periodLabel, autoAnalysis, rangeFrom, rangeTo);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal membuat PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) return <div className={c.loading}>Memuat data kantin…</div>;

  const hasData = dayAggs.length > 0;
  const overall = health(totals.overallEff, hasData);
  const R = 52, CIRC = 2 * Math.PI * R;
  const ringLen = (Math.min(100, totals.overallEff) / 100) * CIRC;

  // grafik
  const series = dayAggs.map((d) => cat === "snack"
    ? { date: d.date, used: d.snackConsumed, left: d.snackLeftover, order: d.snackOrder }
    : { date: d.date, used: d.mealConsumed, left: d.mealLeftover, order: d.mealOrder });
  const maxOrder = Math.max(1, ...series.map((s) => s.order));
  const labelEvery = Math.max(1, Math.ceil(series.length / 10));
  const tip = hover !== null ? series[hover] : null;

  const catCard = (key: Cat, title: string, order: number, used: number, left: number, eff: number) => {
    const h = health(eff, order > 0);
    return (
      <button type="button" className={`${c.catCard} ${cat === key ? c.catOn : ""} ${key === "meal" ? c.meal : c.snack}`} onClick={() => setCat(key)} aria-pressed={cat === key}>
        <span className={c.catHead}>
          <b>{title}</b>
          <span className={`${c.badge} ${h.tone}`}>{h.label}</span>
        </span>
        <span className={c.catBig}><b>{order > 0 ? pctTxt(eff) : "–"}</b><span>terpakai</span></span>
        <span className={c.track}><i style={{ width: `${Math.min(100, eff)}%` }} /></span>
        <span className={c.catStats}>
          <span><small>Order</small><b>{num(order)}</b></span>
          <span><small>Terpakai</small><b>{num(used)}</b></span>
          <span><small>Sisa</small><b className={left > 0 ? c.inkBad : ""}>{num(left)}</b></span>
        </span>
      </button>
    );
  };

  return (
    <div className={c.wrap}>
      <header className={c.head}>
        <div className={c.headText}>
          <h1>Kantin</h1>
          <p>Order dan sisa snack &amp; makan per shift, dilaporkan harian dari halaman /canteen.</p>
        </div>
        <div className={c.headActions}>
          <button type="button" className={c.ghost} onClick={handleExportCsv} disabled={!hasData}><IcDown />CSV</button>
          <button type="button" className={c.ghost} onClick={handleExportPdf} disabled={!hasData || exportingPdf}><IcDown />{exportingPdf ? "Membuat…" : "PDF"}</button>
        </div>
      </header>

      <div className={c.toolbar}>
        <div className={c.seg} role="group" aria-label="Mode periode">
          {([["day", "Harian"], ["week", "Mingguan"], ["month", "Bulanan"], ["custom", "Kustom"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? c.segOn : ""} onClick={() => { setMode(k); setPicked(null); }}>{l}</button>
          ))}
        </div>
        <div className={c.period}>
          {mode !== "custom" && <button type="button" className={c.navBtn} onClick={() => shift(-1)} aria-label="Periode sebelumnya"><IcPrev /></button>}
          <span className={c.periodLabel}>{periodLabel}</span>
          {mode !== "custom" && <button type="button" className={c.navBtn} onClick={() => shift(1)} aria-label="Periode berikutnya"><IcNext /></button>}
        </div>
        <div className={c.pickers}>
          {(mode === "day" || mode === "week") && <input className={c.input} type="date" value={dayValue} onChange={(e) => { setDayValue(e.target.value); setPicked(null); }} aria-label="Tanggal" />}
          {mode === "month" && <input className={c.input} type="month" value={monthValue} onChange={(e) => { setMonthValue(e.target.value); setPicked(null); }} aria-label="Bulan" />}
          {mode === "custom" && (
            <>
              <input className={c.input} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Dari" />
              <span className={c.sep}>s/d</span>
              <input className={c.input} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Sampai" />
            </>
          )}
        </div>
      </div>

      {error && <div className={c.err}>{error}</div>}

      <section className={c.top}>
        <div className={c.ringCard}>
          <svg viewBox="0 0 132 132" width="132" height="132" role="img" aria-label={`Efisiensi keseluruhan ${pctTxt(totals.overallEff)}`}>
            <circle cx="66" cy="66" r={R} className={c.ringBg} />
            {hasData && <circle cx="66" cy="66" r={R} className={c.ringFg} strokeDasharray={`${ringLen} ${CIRC}`} transform="rotate(-90 66 66)" />}
            <text x="66" y="64" textAnchor="middle" className={c.ringVal}>{hasData ? pctTxt(totals.overallEff) : "–"}</text>
            <text x="66" y="82" textAnchor="middle" className={c.ringSub}>efisiensi</text>
          </svg>
          <div className={c.ringText}>
            <span className={`${c.badge} ${overall.tone}`}>{overall.label}</span>
            <b>{num(totals.overallConsumed)}<small> / {num(totals.overallOrder)} porsi terpakai</small></b>
            <span>{hasData ? `${dayAggs.length} hari tercatat · sisa ${num(totals.snackLeftover + totals.mealLeftover)} porsi` : "Belum ada laporan pada periode ini."}</span>
          </div>
        </div>
        {catCard("snack", "Snack", totals.snackOrder, totals.snackConsumed, totals.snackLeftover, totals.snackEff)}
        {catCard("meal", "Makan", totals.mealOrder, totals.mealConsumed, totals.mealLeftover, totals.mealEff)}
      </section>

      {hasData && (
        <section className={c.insight} aria-label="Catatan otomatis">
          <span className={c.insightIc}><IcBulb /></span>
          <ul>{insights.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}

      <div className={c.split}>
        <section className={`${c.card} ${c.chartCard}`}>
          <div className={c.cardHead}>
            <div>
              <h2>Tren harian · {cat === "snack" ? "Snack" : "Makan"}</h2>
              <span className={c.hint}>Arahkan kursor untuk detail, klik batang untuk melihat rincian shift hari itu.</span>
            </div>
            <div className={c.seg} role="group" aria-label="Kategori">
              <button type="button" aria-pressed={cat === "snack"} className={cat === "snack" ? c.segOn : ""} onClick={() => setCat("snack")}>Snack</button>
              <button type="button" aria-pressed={cat === "meal"} className={cat === "meal" ? c.segOn : ""} onClick={() => setCat("meal")}>Makan</button>
            </div>
          </div>
          <div className={c.legend}>
            <span><i className={`${c.dot} ${cat === "meal" ? c.dotMeal : c.dotSnack}`} />Terpakai</span>
            <span><i className={`${c.dot} ${c.dotLeft}`} />Sisa</span>
          </div>
          {series.length === 0 ? (
            <div className={c.empty}>Belum ada data pada periode ini.</div>
          ) : (
            <div className={c.chartBox} onMouseLeave={() => setHover(null)}>
              <div className={c.chart} style={{ gridTemplateColumns: `repeat(${series.length}, minmax(14px, 1fr))` }}>
                {series.map((s, i) => {
                  const usedH = (s.used / maxOrder) * 100;
                  const leftH = (s.left / maxOrder) * 100;
                  const on = picked === s.date;
                  return (
                    <button
                      key={s.date}
                      type="button"
                      className={`${c.col} ${on ? c.colOn : ""} ${picked && !on ? c.colDim : ""}`}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      onClick={() => setPicked(on ? null : s.date)}
                      aria-label={`${dFull(s.date)}: terpakai ${s.used}, sisa ${s.left}`}
                      aria-pressed={on}
                    >
                      <span className={c.stack}>
                        <span className={c.left} style={{ height: `${leftH}%` }} />
                        <span className={`${c.used} ${cat === "meal" ? c.usedMeal : ""}`} style={{ height: `${usedH}%` }} />
                      </span>
                      <span className={c.xl}>{i % labelEvery === 0 || i === series.length - 1 ? dShort(s.date) : ""}</span>
                    </button>
                  );
                })}
              </div>
              {tip && hover !== null && (
                <div className={c.tip} style={{ left: `${((hover + 0.5) / series.length) * 100}%` }} role="status">
                  <b>{dFull(tip.date)}</b>
                  <span>Order <b>{num(tip.order)}</b></span>
                  <span>Terpakai <b>{num(tip.used)}</b></span>
                  <span>Sisa <b>{num(tip.left)}</b></span>
                  <span>Efisiensi <b>{pctTxt(effOf(tip.used, tip.order))}</b></span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={`${c.card} ${c.shiftCard}`}>
          <div className={c.cardHead}>
            <div>
              <h2>Per shift</h2>
              <span className={c.hint}>{picked ? dFull(picked) : `Seluruh periode · ${periodLabel}`}</span>
            </div>
            {picked && <button type="button" className={c.link} onClick={() => setPicked(null)}>Semua hari</button>}
          </div>
          {shiftRows.map((s) => (
            <div key={s.label} className={c.shiftRow}>
              <b className={c.shiftName}>{s.label}</b>
              <div className={c.shiftBars}>
                <div className={c.shiftLine}>
                  <span>Snack</span>
                  <span className={c.track}><i className={c.trackSnack} style={{ width: `${Math.min(100, s.sEff)}%` }} /></span>
                  <span className={c.shiftVal}>{s.so > 0 ? pctTxt(s.sEff) : "–"}<small>sisa {num(s.sl)}</small></span>
                </div>
                <div className={c.shiftLine}>
                  <span>Makan</span>
                  <span className={c.track}><i className={c.trackMeal} style={{ width: `${Math.min(100, s.mEff)}%` }} /></span>
                  <span className={c.shiftVal}>{s.mo > 0 ? pctTxt(s.mEff) : "–"}<small>sisa {num(s.ml)}</small></span>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className={c.card}>
        <div className={c.cardHead}>
          <h2>Laporan harian</h2>
          <span className={c.hint}>{filteredRows.length} laporan</span>
        </div>
        {filteredRows.length === 0 ? (
          <div className={c.empty}>{t.actionNoDataYet}</div>
        ) : (
          <div className={c.tableBox}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th className={c.num}>Snack order</th><th className={c.num}>Sisa</th><th className={c.num}>Efisiensi</th>
                  <th className={c.num}>Makan order</th><th className={c.num}>Sisa</th><th className={c.num}>Efisiensi</th>
                  <th>Pelapor</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice().reverse().map((r) => {
                  const d = toDayAgg(r);
                  const se = effOf(d.snackConsumed, d.snackOrder), me = effOf(d.mealConsumed, d.mealOrder);
                  const on = picked === r.reportDate;
                  return (
                    <tr key={r.id} className={on ? c.rowOn : ""} onClick={() => setPicked(on ? null : r.reportDate)}>
                      <td><b>{dFull(r.reportDate)}</b></td>
                      <td className={c.num}>{num(d.snackOrder)}</td>
                      <td className={`${c.num} ${d.snackLeftover > 0 ? c.inkBad : ""}`}>{num(d.snackLeftover)}</td>
                      <td className={c.num}><span className={`${c.badge} ${health(se, d.snackOrder > 0).tone}`}>{d.snackOrder > 0 ? pctTxt(se) : "–"}</span></td>
                      <td className={c.num}>{num(d.mealOrder)}</td>
                      <td className={`${c.num} ${d.mealLeftover > 0 ? c.inkBad : ""}`}>{num(d.mealLeftover)}</td>
                      <td className={c.num}><span className={`${c.badge} ${health(me, d.mealOrder > 0).tone}`}>{d.mealOrder > 0 ? pctTxt(me) : "–"}</span></td>
                      <td className={c.muted}>{r.submittedBy || "-"}</td>
                      <td className={c.num}>
                        <button type="button" className={c.del} onClick={(e) => { e.stopPropagation(); setConfirmDelete(r); }} aria-label={`Hapus laporan ${dFull(r.reportDate)}`}><IcTrash /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={380}>
          <div className={c.confirm}>
            <h3>Hapus laporan ini?</h3>
            <p>Laporan <b>{dFull(confirmDelete.reportDate)}</b> akan dihapus permanen.</p>
            <div className={c.confirmActions}>
              <button type="button" className={c.ghost} onClick={() => setConfirmDelete(null)}>{t.actionCancel}</button>
              <button type="button" className={c.danger} onClick={handleDelete}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
