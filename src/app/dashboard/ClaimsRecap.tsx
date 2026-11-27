"use client";

/* REKAP KLAIM PER DRIVER — bulanan & tahunan (tab di menu Klaim).
   Per driver: Gasoline + Toll + Parking + Other = Total. Bulan/tahun mengikuti tanggal periode klaim. */

import { useMemo, useState } from "react";
import cs from "./claims.module.css";
import rs from "./claimsRecap.module.css";
import { RecapBar, catLabel } from "./ClaimsUI";
import { fmtRp } from "./dashboardShared";
import type { Claim, Driver, Plant } from "@/lib/types";
import {
  monthByDriver, yearByDriver, yearsIn, monthName, monthShort, monthDoc, yearDoc, yearDriverDoc, exportRecapExcel, exportRecapPdf,
  type Cat, type DocLabels, type RecapDoc, type Totals,
} from "@/lib/driverClaimRecap";
import { plantShort } from "@/lib/brand";

const CAT_KEY: Record<Cat, string> = { gasoline: "Gasoline", toll: "Toll", parking: "Parking", others: "Other" };
const CAT_COLOR: Record<Cat, string> = { gasoline: "var(--green)", toll: "var(--brand)", parking: "var(--orange)", others: "var(--t3)" };
const CATS: Cat[] = ["gasoline", "toll", "parking", "others"];

const nz = (n: number) => (n === 0 ? <span className={rs.zero}>–</span> : fmtRp(n));

export function ClaimsRecap({ claims: rawClaims, drivers, plantF, lang }: { claims: Claim[]; drivers: Driver[]; plantF: Plant | null; lang: string }) {
  const en = lang === "en";
  const L = en ? "en" : "id";
  // Nama driver: dari klaim; bila kosong, ambil dari daftar driver (berdasarkan id)
  const claims = useMemo(() => {
    const names = new Map(drivers.map((d) => [d.id, d.nama]));
    return rawClaims.map((c) => (c.driverName ? c : { ...c, driverName: names.get(c.driver_id) ?? "" }));
  }, [rawClaims, drivers]);
  const years = useMemo(() => yearsIn(claims), [claims]);

  // Awal: periode terbaru yang punya klaim (supaya tidak langsung kosong)
  const latest = useMemo(() => {
    let best = "";
    for (const c of claims) if ((!plantF || (c.plant ?? "CIK") === plantF) && String(c.periodDate) > best) best = String(c.periodDate);
    const now = new Date();
    return best ? { y: Number(best.slice(0, 4)), m: Number(best.slice(5, 7)) - 1 } : { y: now.getFullYear(), m: now.getMonth() };
  }, [claims, plantF]);

  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState(latest.y);
  const [month, setMonth] = useState(latest.m);
  const [driverId, setDriverId] = useState("all");
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);

  const driverOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of claims) if (!plantF || (c.plant ?? "CIK") === plantF) map.set(c.driver_id, c.driverName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [claims, plantF]);
  const driverName = driverId === "all" ? "" : driverOptions.find((d) => d.id === driverId)?.name ?? "";

  const monthData = useMemo(() => monthByDriver(claims, year, month, plantF, driverId), [claims, year, month, plantF, driverId]);
  const yearData = useMemo(() => yearByDriver(claims, year, plantF, driverId), [claims, year, plantF, driverId]);

  const grand: Totals = mode === "month" ? monthData.grand : yearData.grand;
  const empty = grand.count === 0;
  const periodLabel = mode === "month" ? `${monthName(month, L)} ${year}` : String(year);
  const scope = `${en ? "Driver" : "Driver"}: ${driverName || (en ? "All drivers" : "Semua driver")}${plantF ? ` · Plant ${plantShort(plantF)}` : ""}`;

  const labels: DocLabels = {
    lang: L,
    cat: { gasoline: catLabel("Gasoline", lang), toll: catLabel("Toll", lang), parking: catLabel("Parking", lang), others: catLabel("Other", lang) },
    driver: en ? "Driver" : "Nama driver", total: "Total", claims: en ? "Claims" : "Jml klaim", no: "No", month: en ? "Month" : "Bulan",
  };

  function buildDoc(): RecapDoc {
    if (mode === "month") return monthDoc(labels, year, month, monthData, scope);
    if (driverId !== "all") return yearDriverDoc(labels, year, driverName, yearData.rows[0] ?? null, scope);
    return yearDoc(labels, year, yearData, scope);
  }
  async function exportAs(kind: "excel" | "pdf") {
    setBusy(kind);
    try { const d = buildDoc(); if (kind === "excel") await exportRecapExcel(d); else await exportRecapPdf(d); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const driverRow = yearData.rows[0] ?? null;
  const showMonthTable = mode === "month";
  const showYearAll = mode === "year" && driverId === "all";
  const showYearOne = mode === "year" && driverId !== "all";
  const pct = (v: number) => (grand.total > 0 ? `${Math.round((v / grand.total) * 100)}%` : "0%");

  return (
    <div className={cs.panel}>
      <div className={cs.panelBar}>
        <h3>{en ? "Claim recap per driver" : "Rekap klaim per driver"} · {periodLabel}</h3>
        <div className={cs.actions}>
          <button className={`${cs.btn} ${cs.btnGreen}`} onClick={() => exportAs("excel")} disabled={busy !== null || empty} title={en ? "Download as Excel (.xlsx)" : "Unduh sebagai Excel (.xlsx)"}>⬇ {busy === "excel" ? "..." : "Excel"}</button>
          <button className={`${cs.btn} ${cs.btnRed}`} onClick={() => exportAs("pdf")} disabled={busy !== null || empty} title={en ? "Download as PDF" : "Unduh sebagai PDF"}>⬇ {busy === "pdf" ? "..." : "PDF"}</button>
        </div>
      </div>

      <div className={rs.controls}>
        <div className={rs.ctl}>
          <span>{en ? "Period" : "Periode"}</span>
          <div className={rs.mode} role="group" aria-label={en ? "Period type" : "Jenis periode"}>
            <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>{en ? "Monthly" : "Bulanan"}</button>
            <button type="button" aria-pressed={mode === "year"} onClick={() => setMode("year")}>{en ? "Yearly" : "Tahunan"}</button>
          </div>
        </div>
        <label className={rs.ctl}>
          <span>{en ? "Year" : "Tahun"}</span>
          <select className={cs.select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {mode === "month" && (
          <label className={rs.ctl}>
            <span>{en ? "Month" : "Bulan"}</span>
            <select className={cs.select} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{monthName(i, L)}</option>)}
            </select>
          </label>
        )}
        <label className={rs.ctl}>
          <span>Driver</span>
          <select className={cs.select} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="all">{en ? "All drivers" : "Semua driver"}</option>
            {driverOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>

      {empty ? (
        <div className={cs.empty} style={{ border: 0 }}>
          <span className={cs.emptyIc} aria-hidden="true">📊</span>
          <b>{en ? `No claims for ${periodLabel}` : `Belum ada klaim untuk ${periodLabel}`}</b>
          <span>{en ? "Pick another period or driver." : "Pilih periode atau driver lain."}</span>
        </div>
      ) : (
        <>
          <div className={rs.kpis}>
            <div className={`${rs.kpi} ${rs.kpiMain}`}>
              <span className={rs.kpiLbl}>{driverName ? `${driverName} · ` : ""}{en ? "TOTAL" : "TOTAL"} {periodLabel}</span>
              <span className={rs.kpiVal}>Rp {fmtRp(grand.total)}</span>
              <span className={rs.kpiSub}>{grand.count} {en ? "claim(s)" : "klaim"}{driverId === "all" ? ` · ${mode === "month" ? monthData.rows.length : yearData.rows.length} driver` : ""}</span>
            </div>
            {CATS.map((k) => (
              <div className={rs.kpi} key={k}>
                <span className={rs.kpiLbl}><i className={rs.dot} style={{ background: CAT_COLOR[k] }} />{catLabel(CAT_KEY[k], lang)}</span>
                <span className={rs.kpiVal} style={{ fontSize: 18 }}>Rp {fmtRp(grand[k])}</span>
                <span className={rs.kpiSub}>{pct(grand[k])} {en ? "of total" : "dari total"}</span>
              </div>
            ))}
          </div>

          {showMonthTable && (
            <div className={cs.tableWrap}>
              <table className={cs.table}>
                <thead>
                  <tr>
                    <th>{labels.driver}</th>
                    {CATS.map((k) => <th key={k} className={cs.num}>{catLabel(CAT_KEY[k], lang)}</th>)}
                    <th style={{ minWidth: 110 }}>{en ? "Mix" : "Komposisi"}</th>
                    <th className={cs.num}>Total (Rp)</th>
                    <th className={cs.num}>{labels.claims}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthData.rows.map((r) => (
                    <tr key={r.driverId}>
                      <td className={cs.strong}>
                        <button type="button" className={rs.driverLink} onClick={() => { setDriverId(r.driverId); setMode("year"); }} title={en ? "See this driver for the whole year" : "Lihat driver ini selama setahun"}>{r.driverName}</button>
                      </td>
                      {CATS.map((k) => <td key={k} className={cs.num}>{nz(r[k])}</td>)}
                      <td><RecapBar g={r.gasoline} t={r.toll} p={r.parking} o={r.others} /></td>
                      <td className={`${cs.num} ${cs.strong}`}>{fmtRp(r.total)}</td>
                      <td className={cs.num}>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{en ? "Grand total" : "Total keseluruhan"}</td>
                    {CATS.map((k) => <td key={k} className={cs.num}>{fmtRp(monthData.grand[k])}</td>)}
                    <td><RecapBar g={monthData.grand.gasoline} t={monthData.grand.toll} p={monthData.grand.parking} o={monthData.grand.others} /></td>
                    <td className={cs.num} style={{ color: "var(--brand)" }}>{fmtRp(monthData.grand.total)}</td>
                    <td className={cs.num}>{monthData.grand.count}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {showYearOne && (
            <div className={cs.tableWrap}>
              <table className={cs.table}>
                <thead>
                  <tr>
                    <th>{labels.month}</th>
                    {CATS.map((k) => <th key={k} className={cs.num}>{catLabel(CAT_KEY[k], lang)}</th>)}
                    <th style={{ minWidth: 110 }}>{en ? "Mix" : "Komposisi"}</th>
                    <th className={cs.num}>Total (Rp)</th>
                    <th className={cs.num}>{labels.claims}</th>
                  </tr>
                </thead>
                <tbody>
                  {(driverRow?.months ?? []).map((m, i) => (
                    <tr key={i} style={m.count === 0 ? { opacity: 0.55 } : undefined}>
                      <td className={cs.strong}>{monthName(i, L)}</td>
                      {CATS.map((k) => <td key={k} className={cs.num}>{nz(m[k])}</td>)}
                      <td><RecapBar g={m.gasoline} t={m.toll} p={m.parking} o={m.others} /></td>
                      <td className={`${cs.num} ${cs.strong}`}>{nz(m.total)}</td>
                      <td className={cs.num}>{m.count || <span className={rs.zero}>–</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total {year}</td>
                    {CATS.map((k) => <td key={k} className={cs.num}>{fmtRp(grand[k])}</td>)}
                    <td><RecapBar g={grand.gasoline} t={grand.toll} p={grand.parking} o={grand.others} /></td>
                    <td className={cs.num} style={{ color: "var(--brand)" }}>{fmtRp(grand.total)}</td>
                    <td className={cs.num}>{grand.count}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {showYearAll && (
            <>
              <div className={rs.subHead}><h4>{en ? "Total per month (Rp)" : "Total per bulan (Rp)"}</h4><small>{en ? "Tap a name to see that driver's detail" : "Ketuk nama untuk melihat rincian driver"}</small></div>
              <div className={cs.tableWrap}>
                <table className={`${cs.table} ${rs.matrix}`}>
                  <thead>
                    <tr>
                      <th>{labels.driver}</th>
                      {Array.from({ length: 12 }, (_, i) => <th key={i} className={cs.num}>{monthShort(i, L)}</th>)}
                      <th className={cs.num}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearData.rows.map((r) => {
                      const peak = Math.max(...r.months.map((m) => m.total));
                      return (
                        <tr key={r.driverId}>
                          <td className={cs.strong}><button type="button" className={rs.driverLink} onClick={() => setDriverId(r.driverId)}>{r.driverName}</button></td>
                          {r.months.map((m, i) => <td key={i} className={`${cs.num} ${m.total > 0 && m.total === peak ? rs.peak : ""}`}>{nz(m.total)}</td>)}
                          <td className={`${cs.num} ${cs.strong}`}>{fmtRp(r.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{en ? "Grand total" : "Total keseluruhan"}</td>
                      {yearData.grandMonths.map((m, i) => <td key={i} className={cs.num}>{nz(m.total)}</td>)}
                      <td className={cs.num} style={{ color: "var(--brand)" }}>{fmtRp(yearData.grand.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className={rs.subHead}><h4>{en ? "Breakdown by category (full year)" : "Rincian per kategori (setahun)"}</h4></div>
              <div className={cs.tableWrap}>
                <table className={cs.table}>
                  <thead>
                    <tr>
                      <th>{labels.driver}</th>
                      {CATS.map((k) => <th key={k} className={cs.num}>{catLabel(CAT_KEY[k], lang)}</th>)}
                      <th style={{ minWidth: 110 }}>{en ? "Mix" : "Komposisi"}</th>
                      <th className={cs.num}>Total (Rp)</th>
                      <th className={cs.num}>{labels.claims}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearData.rows.map((r) => (
                      <tr key={r.driverId}>
                        <td className={cs.strong}>{r.driverName}</td>
                        {CATS.map((k) => <td key={k} className={cs.num}>{nz(r[k])}</td>)}
                        <td><RecapBar g={r.gasoline} t={r.toll} p={r.parking} o={r.others} /></td>
                        <td className={`${cs.num} ${cs.strong}`}>{fmtRp(r.total)}</td>
                        <td className={cs.num}>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{en ? "Grand total" : "Total keseluruhan"}</td>
                      {CATS.map((k) => <td key={k} className={cs.num}>{fmtRp(yearData.grand[k])}</td>)}
                      <td><RecapBar g={yearData.grand.gasoline} t={yearData.grand.toll} p={yearData.grand.parking} o={yearData.grand.others} /></td>
                      <td className={cs.num} style={{ color: "var(--brand)" }}>{fmtRp(yearData.grand.total)}</td>
                      <td className={cs.num}>{yearData.grand.count}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
          <p className={rs.note}>{en ? "Months follow each claim's period date. Total = Gasoline + Toll + Parking + Other." : "Bulan mengikuti tanggal periode tiap klaim. Total = Gasoline + Toll + Parking + Lainnya."}</p>
        </>
      )}
    </div>
  );
}
