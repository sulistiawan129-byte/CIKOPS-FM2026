"use client";

/* ════════════════════════════════════════════════════════════
   KANTIN — dashboard (admin, baca + hapus). Input harian ada di /canteen.
   - Periode: Harian / Mingguan / Bulanan / Kustom, dengan tombol mundur/maju
   - Snack & Makan selalu terpisah (order, terpakai, sisa, efisiensi) — tidak digabung
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
import { ModuleHeader } from "./ModuleShell";

import { loc , L} from "@/lib/i18n";
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
const num = (n: number) => new Intl.NumberFormat(loc()).format(Math.round(n || 0));
const pctTxt = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
function dShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(loc(), { day: "numeric", month: "short" });
}
function dFull(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
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
  if (!hasData) return { label: L("Belum ada data", "No data yet"), tone: c.tMute };
  if (eff >= 97) return { label: L("Sangat baik", "Excellent"), tone: c.tGood };
  if (eff >= 90) return { label: L("Baik", "Good"), tone: c.tGood };
  if (eff >= 80) return { label: L("Cukup", "Fair"), tone: c.tWarn };
  return { label: L("Perlu perhatian", "Needs attention"), tone: c.tBad };
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
      setError(e instanceof Error ? e.message : L("Gagal memuat data kantin", "Failed to load canteen data"));
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
      alert(e instanceof Error ? e.message : L("Gagal menghapus laporan", "Failed to delete the report"));
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
      periodLabel: new Date(y, m - 1, 1).toLocaleDateString(loc(), { month: "long", year: "numeric" }),
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
    return {
      snackOrder, snackLeftover, snackConsumed, snackEff: effOf(snackConsumed, snackOrder),
      mealOrder, mealLeftover, mealConsumed, mealEff: effOf(mealConsumed, mealOrder),
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
    if (sPeak.snackLeftover > 0) out.push(L(`Sisa snack terbanyak ${num(sPeak.snackLeftover)} porsi pada ${dShort(sPeak.date)}.`, `Most snack leftover: ${num(sPeak.snackLeftover)} portions on ${dShort(sPeak.date)}.`));
    if (mPeak.mealLeftover > 0) out.push(L(`Sisa makan terbanyak ${num(mPeak.mealLeftover)} porsi pada ${dShort(mPeak.date)}.`, `Most meal leftover: ${num(mPeak.mealLeftover)} portions on ${dShort(mPeak.date)}.`));
    const worstShift = (pick: (r: CanteenReport) => number[]) => SHIFTS.map((label, i) => ({
      label,
      left: filteredRows.reduce((a, r) => a + (pick(r)[i] || 0), 0),
    })).sort((a, b) => b.left - a.left)[0];
    const sShift = worstShift((r) => r.snackLeftover), mShift = worstShift((r) => r.mealLeftover);
    if (sShift && sShift.left > 0) out.push(L(`Sisa snack paling banyak di ${sShift.label} (${num(sShift.left)} porsi).`, `Most snack leftover in ${sShift.label} (${num(sShift.left)} portions).`));
    if (mShift && mShift.left > 0) out.push(L(`Sisa makan paling banyak di ${mShift.label} (${num(mShift.left)} porsi).`, `Most meal leftover in ${mShift.label} (${num(mShift.left)} portions).`));
    if (out.length === 0) out.push(L("Tidak ada sisa makanan pada periode ini.", "No food leftover in this period."));
    return out;
  }, [dayAggs, filteredRows]);

  const autoAnalysis = useMemo(() => {
    if (dayAggs.length === 0) return L("Belum ada data tercatat pada periode ini.", "No data recorded for this period.");
    const part = (name: string, order: number, used: number, left: number, eff: number) =>
      order > 0 ? L(`${name}: order ${num(order)}, terpakai ${num(used)}, sisa ${num(left)} (${eff.toFixed(2)}% — ${health(eff, true).label})`, `${name}: ordered ${num(order)}, consumed ${num(used)}, leftover ${num(left)} (${eff.toFixed(2)}% — ${health(eff, true).label})`) : L(`${name}: belum ada order`, `${name}: no orders yet`);
    return `${periodLabel} — ${part("Snack", totals.snackOrder, totals.snackConsumed, totals.snackLeftover, totals.snackEff)}. ${part(L("Makan", "Meal"), totals.mealOrder, totals.mealConsumed, totals.mealLeftover, totals.mealEff)}. ${insights.join(" ")}`;
  }, [dayAggs, totals, periodLabel, insights]);

  function handleExportCsv() {
    // Dua bagian terpisah: SNACK lalu MAKAN, masing-masing dengan total sendiri.
    const pctCsv = (used: number, order: number) => (order > 0 ? effOf(used, order).toFixed(2) : "");
    const lines: string[] = [];
    (["snack", "meal"] as const).forEach((k, idx) => {
      const name = k === "snack" ? "SNACK" : L("MAKAN", "MEAL");
      if (idx > 0) lines.push("");
      lines.push(name);
      lines.push([L("Tanggal", "Date"), L("Order", "Ordered"), L("Terpakai", "Consumed"), L("Sisa", "Leftover"), L("Efisiensi %", "Efficiency %")].join(","));
      dayAggs.forEach((d) => {
        const o = k === "snack" ? d.snackOrder : d.mealOrder, u = k === "snack" ? d.snackConsumed : d.mealConsumed, l = k === "snack" ? d.snackLeftover : d.mealLeftover;
        lines.push([d.date, o, u, l, pctCsv(u, o)].join(","));
      });
      const o = k === "snack" ? totals.snackOrder : totals.mealOrder, u = k === "snack" ? totals.snackConsumed : totals.mealConsumed, l = k === "snack" ? totals.snackLeftover : totals.mealLeftover;
      lines.push([`TOTAL ${name}`, o, u, l, pctCsv(u, o)].join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = L(`Laporan_Kantin_${rangeFrom}_sd_${rangeTo}.csv`, `Canteen_Report_${rangeFrom}_to_${rangeTo}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportCanteenToPdf(dayAggs, totals, periodLabel, autoAnalysis, rangeFrom, rangeTo, L("id", "en") === "en" ? "en" : "id");
    } catch (e) {
      alert(e instanceof Error ? e.message : L("Gagal membuat PDF", "Failed to create the PDF"));
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) return <div className={c.loading}>{L("Memuat data kantin…", "Loading canteen data…")}</div>;

  const hasData = dayAggs.length > 0;

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
        <span className={c.catBig}><b>{order > 0 ? pctTxt(eff) : "–"}</b><span>{L("terpakai", "consumed")}</span></span>
        <span className={c.track}><i style={{ width: `${Math.min(100, eff)}%` }} /></span>
        <span className={c.catStats}>
          <span><small>{L("Total order", "Total ordered")}</small><b>{num(order)}</b></span>
          <span><small>{L("Terpakai", "Consumed")}</small><b>{num(used)}</b></span>
          <span><small>{L("Total sisa", "Total leftover")}</small><b className={left > 0 ? c.inkBad : ""}>{num(left)}</b></span>
        </span>
        <span className={c.catFoot}>{hasData ? L(`${dayAggs.length} hari tercatat · rata-rata sisa ${num(left / dayAggs.length)} porsi/hari`, `${dayAggs.length} day${dayAggs.length === 1 ? "" : "s"} recorded · average leftover ${num(left / dayAggs.length)} portions/day`) : L("Belum ada laporan pada periode ini.", "No reports in this period.")}</span>
      </button>
    );
  };

  return (
    <div className={c.wrap}>
      <ModuleHeader
        kicker={L("Fasilitas · Kantin", "Facility · Canteen")}
        title={L("Kantin", "Canteen")}
        desc={L("Snack dan makan dilaporkan terpisah — total order, terpakai, dan sisa per shift, dari input harian staf kantin di /canteen.", "Snacks and meals are reported separately — total ordered, consumed and leftover per shift, from the canteen staff's daily input at /canteen.")}
        actions={<>
          <button type="button" className={c.ghost} onClick={handleExportCsv} disabled={!hasData}><IcDown />CSV</button>
          <button type="button" className={c.ghost} onClick={handleExportPdf} disabled={!hasData || exportingPdf}><IcDown />{exportingPdf ? L("Membuat…", "Creating…") : "PDF"}</button>
        </>}
      />

      <div className={c.toolbar}>
        <div className={c.seg} role="group" aria-label={L("Mode periode", "Period mode")}>
          {([["day", L("Harian", "Daily")], ["week", L("Mingguan", "Weekly")], ["month", L("Bulanan", "Monthly")], ["custom", L("Kustom", "Custom")]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? c.segOn : ""} onClick={() => { setMode(k); setPicked(null); }}>{l}</button>
          ))}
        </div>
        <div className={c.period}>
          {mode !== "custom" && <button type="button" className={c.navBtn} onClick={() => shift(-1)} aria-label={L("Periode sebelumnya", "Previous period")}><IcPrev /></button>}
          <span className={c.periodLabel}>{periodLabel}</span>
          {mode !== "custom" && <button type="button" className={c.navBtn} onClick={() => shift(1)} aria-label={L("Periode berikutnya", "Next period")}><IcNext /></button>}
        </div>
        <div className={c.pickers}>
          {(mode === "day" || mode === "week") && <input className={c.input} type="date" value={dayValue} onChange={(e) => { setDayValue(e.target.value); setPicked(null); }} aria-label={L("Tanggal", "Date")} />}
          {mode === "month" && <input className={c.input} type="month" value={monthValue} onChange={(e) => { setMonthValue(e.target.value); setPicked(null); }} aria-label={L("Bulan", "Month")} />}
          {mode === "custom" && (
            <>
              <input className={c.input} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Dari" />
              <span className={c.sep}>s/d</span>
              <input className={c.input} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label={L("Sampai", "To")} />
            </>
          )}
        </div>
      </div>

      {error && <div className={c.err}>{error}</div>}

      <section className={c.top}>
        {catCard("snack", L("Snack", "Snacks"), totals.snackOrder, totals.snackConsumed, totals.snackLeftover, totals.snackEff)}
        {catCard("meal", L("Makan", "Meals"), totals.mealOrder, totals.mealConsumed, totals.mealLeftover, totals.mealEff)}
      </section>

      {hasData && (
        <section className={c.insight} aria-label={L("Catatan otomatis", "Automatic notes")}>
          <span className={c.insightIc}><IcBulb /></span>
          <ul>{insights.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}

      <div className={c.split}>
        <section className={`${c.card} ${c.chartCard}`}>
          <div className={c.cardHead}>
            <div>
              <h2>{L("Tren harian", "Daily trend")} · {cat === "snack" ? L("Snack", "Snacks") : L("Makan", "Meals")}</h2>
              <span className={c.hint}>{L("Arahkan kursor untuk detail, klik batang untuk melihat rincian shift hari itu.", "Hover for details, click a bar to see that day's shift breakdown.")}</span>
            </div>
            <div className={c.seg} role="group" aria-label={L("Kategori", "Category")}>
              <button type="button" aria-pressed={cat === "snack"} className={cat === "snack" ? c.segOn : ""} onClick={() => setCat("snack")}>{L("Snack", "Snacks")}</button>
              <button type="button" aria-pressed={cat === "meal"} className={cat === "meal" ? c.segOn : ""} onClick={() => setCat("meal")}>{L("Makan", "Meals")}</button>
            </div>
          </div>
          <div className={c.legend}>
            <span><i className={`${c.dot} ${cat === "meal" ? c.dotMeal : c.dotSnack}`} />{L("Terpakai", "Consumed")}</span>
            <span><i className={`${c.dot} ${c.dotLeft}`} />{L("Sisa", "Leftover")}</span>
          </div>
          {series.length === 0 ? (
            <div className={c.empty}>{L("Belum ada data pada periode ini.", "No data for this period.")}</div>
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
                      aria-label={L(`${dFull(s.date)}: terpakai ${s.used}, sisa ${s.left}`, `${dFull(s.date)}: consumed ${s.used}, leftover ${s.left}`)}
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
                  <span>{L("Terpakai", "Consumed")} <b>{num(tip.used)}</b></span>
                  <span>{L("Sisa", "Leftover")} <b>{num(tip.left)}</b></span>
                  <span>{L("Efisiensi", "Efficiency")} <b>{pctTxt(effOf(tip.used, tip.order))}</b></span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={`${c.card} ${c.shiftCard}`}>
          <div className={c.cardHead}>
            <div>
              <h2>Per shift</h2>
              <span className={c.hint}>{picked ? dFull(picked) : L(`Seluruh periode · ${periodLabel}`, `Whole period · ${periodLabel}`)}</span>
            </div>
            {picked && <button type="button" className={c.link} onClick={() => setPicked(null)}>{L("Semua hari", "All days")}</button>}
          </div>
          {shiftRows.map((s) => (
            <div key={s.label} className={c.shiftRow}>
              <b className={c.shiftName}>{s.label}</b>
              <div className={c.shiftBars}>
                <div className={c.shiftLine}>
                  <span>{L("Snack", "Snacks")}</span>
                  <span className={c.track}><i className={c.trackSnack} style={{ width: `${Math.min(100, s.sEff)}%` }} /></span>
                  <span className={c.shiftVal}>{s.so > 0 ? pctTxt(s.sEff) : "–"}<small>{L("sisa", "left")} {num(s.sl)}</small></span>
                </div>
                <div className={c.shiftLine}>
                  <span>{L("Makan", "Meals")}</span>
                  <span className={c.track}><i className={c.trackMeal} style={{ width: `${Math.min(100, s.mEff)}%` }} /></span>
                  <span className={c.shiftVal}>{s.mo > 0 ? pctTxt(s.mEff) : "–"}<small>{L("sisa", "left")} {num(s.ml)}</small></span>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className={c.card}>
        <div className={c.cardHead}>
          <h2>{L("Laporan harian", "Daily reports")}</h2>
          <span className={c.hint}>{filteredRows.length} {L("laporan", "reports")}</span>
        </div>
        {filteredRows.length === 0 ? (
          <div className={c.empty}>{t.actionNoDataYet}</div>
        ) : (
          <div className={c.tableBox}>
            <table className={c.table}>
              <thead>
                <tr className={c.groupRow}>
                  <th />
                  <th colSpan={4} className={`${c.group} ${c.groupSnack}`}>{L("Snack", "Snacks")}</th>
                  <th colSpan={4} className={`${c.group} ${c.groupMeal}`}>{L("Makan", "Meals")}</th>
                  <th colSpan={2} />
                </tr>
                <tr>
                  <th>{L("Tanggal", "Date")}</th>
                  <th className={`${c.num} ${c.gStart}`}>{L("Order", "Ordered")}</th><th className={c.num}>{L("Terpakai", "Consumed")}</th><th className={c.num}>{L("Sisa", "Leftover")}</th><th className={c.num}>{L("Efisiensi", "Efficiency")}</th>
                  <th className={`${c.num} ${c.gStart}`}>{L("Order", "Ordered")}</th><th className={c.num}>{L("Terpakai", "Consumed")}</th><th className={c.num}>{L("Sisa", "Leftover")}</th><th className={c.num}>{L("Efisiensi", "Efficiency")}</th>
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
                      <td className={`${c.num} ${c.gStart}`}>{num(d.snackOrder)}</td>
                      <td className={c.num}>{num(d.snackConsumed)}</td>
                      <td className={`${c.num} ${d.snackLeftover > 0 ? c.inkBad : ""}`}>{num(d.snackLeftover)}</td>
                      <td className={c.num}><span className={`${c.badge} ${health(se, d.snackOrder > 0).tone}`}>{d.snackOrder > 0 ? pctTxt(se) : "–"}</span></td>
                      <td className={`${c.num} ${c.gStart}`}>{num(d.mealOrder)}</td>
                      <td className={c.num}>{num(d.mealConsumed)}</td>
                      <td className={`${c.num} ${d.mealLeftover > 0 ? c.inkBad : ""}`}>{num(d.mealLeftover)}</td>
                      <td className={c.num}><span className={`${c.badge} ${health(me, d.mealOrder > 0).tone}`}>{d.mealOrder > 0 ? pctTxt(me) : "–"}</span></td>
                      <td className={c.muted}>{r.submittedBy || "-"}</td>
                      <td className={c.num}>
                        <button type="button" className={c.del} onClick={(e) => { e.stopPropagation(); setConfirmDelete(r); }} aria-label={L(`Hapus laporan ${dFull(r.reportDate)}`, `Delete report ${dFull(r.reportDate)}`)}><IcTrash /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={c.totalRow}>
                  <td>{L("Total periode", "Period total")}</td>
                  <td className={`${c.num} ${c.gStart}`}>{num(totals.snackOrder)}</td>
                  <td className={c.num}>{num(totals.snackConsumed)}</td>
                  <td className={`${c.num} ${totals.snackLeftover > 0 ? c.inkBad : ""}`}>{num(totals.snackLeftover)}</td>
                  <td className={c.num}><span className={`${c.badge} ${health(totals.snackEff, totals.snackOrder > 0).tone}`}>{totals.snackOrder > 0 ? pctTxt(totals.snackEff) : "–"}</span></td>
                  <td className={`${c.num} ${c.gStart}`}>{num(totals.mealOrder)}</td>
                  <td className={c.num}>{num(totals.mealConsumed)}</td>
                  <td className={`${c.num} ${totals.mealLeftover > 0 ? c.inkBad : ""}`}>{num(totals.mealLeftover)}</td>
                  <td className={c.num}><span className={`${c.badge} ${health(totals.mealEff, totals.mealOrder > 0).tone}`}>{totals.mealOrder > 0 ? pctTxt(totals.mealEff) : "–"}</span></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={380}>
          <div className={c.confirm}>
            <h3>{L("Hapus laporan ini?", "Delete this report?")}</h3>
            <p>{L("Laporan", "The report for")} <b>{dFull(confirmDelete.reportDate)}</b> {L("akan dihapus permanen.", "will be permanently deleted.")}</p>
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
