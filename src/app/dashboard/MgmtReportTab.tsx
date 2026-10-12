"use client";

/* ════════════════════════════════════════════════════════════
   REPORT — Laporan Manajemen per modul (Fleet, Klaim, Kantin, ATK).
   Pilih modul + periode → pratinjau ringkas → unduh Excel / PPT / PDF.
════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import type { MyProfile } from "@/lib/api";
import { useLang } from "@/lib/providers";
import { buildMgmtReport, reportFilename } from "@/lib/mgmtReport/build";
import { renderChartPNG } from "@/lib/mgmtReport/chartImage";
import {
  daysBetween, iso, metaOf, parseISO, periodLabelOf, prevRange, resolveGran, withLang,
  type Granularity, type MgmtReport, type ModuleKey, type ReportLang,
} from "@/lib/mgmtReport/model";
import r from "./mgmt.module.css";

type Mode = "week" | "month" | "quarter" | "year" | "range";
const ALL: ModuleKey[] = ["fleet", "claims", "canteen", "atk", "security"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Rentang periode untuk mode kalender (minggu Senin–Minggu, bulan, kuartal, tahun) yang memuat tanggal anchor. */
function rangeOf(mode: Exclude<Mode, "range">, anchor: string): { from: string; to: string } {
  const d = parseISO(anchor);
  const y = d.getFullYear(), m = d.getMonth();
  if (mode === "week") {
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: iso(mon), to: iso(sun) };
  }
  if (mode === "month") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (mode === "quarter") { const q = Math.floor(m / 3) * 3; return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) }; }
  return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
}
/** Geser anchor satu periode maju/mundur. */
function shiftAnchor(mode: Exclude<Mode, "range">, anchor: string, dir: 1 | -1): string {
  const d = parseISO(anchor);
  if (mode === "week") { d.setDate(d.getDate() + 7 * dir); return iso(d); }
  const step = mode === "month" ? 1 : mode === "quarter" ? 3 : 12;
  return iso(new Date(d.getFullYear(), d.getMonth() + step * dir, 1));
}

const Ic = {
  xls: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 8 8 8M16 8l-8 8" /></svg>,
  ppt: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 13l3-3 2 2 3-3" /></svg>,
  pdf: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>,
  spark: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>,
};

export default function MgmtReportTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang: appLang } = useLang();
  const today = iso(new Date());
  const [mods, setMods] = useState<ModuleKey[]>(ALL);
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(today);
  const [rFrom, setRFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return iso(d); });
  const [rTo, setRTo] = useState(today);
  const [lang, setLang] = useState<ReportLang>(appLang === "en" ? "en" : "id");
  const [gran, setGran] = useState<Granularity>("auto");
  const [report, setReport] = useState<MgmtReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<null | "xlsx" | "pptx" | "pdf">(null);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = mode === "range" ? { from: rFrom, to: rTo } : rangeOf(mode, anchor);
  const valid = mods.length > 0 && !!from && !!to && from <= to;
  const selKeys = ALL.filter((k) => mods.includes(k)).join();
  const stale = !!report && (report.from !== from || report.to !== to || report.lang !== lang || report.granularity !== gran || [...new Set(report.modules.map((m) => m.key))].join() !== selKeys);
  const cur = parseISO(anchor);
  const years = useMemo(() => { const y = new Date().getFullYear(); return Array.from({ length: 6 }, (_, i) => y - 4 + i); }, []);
  const periodHint = valid ? withLang(lang, () => periodLabelOf(from, to)) : "";
  const prevHint = valid ? withLang(lang, () => { const pr = prevRange(from, to); return periodLabelOf(pr.from, pr.to); }) : "";
  const effGran = valid ? resolveGran(from, to, gran) : "week";
  const nDays = valid ? daysBetween(from, to) : 0;

  function toggle(k: ModuleKey) {
    setMods((p) => (p.includes(k) ? p.filter((x) => x !== k) : ALL.filter((x) => x === k || p.includes(x))));
  }
  function quickRange(days: number | "ytd") {
    const end = new Date();
    const start = days === "ytd" ? new Date(end.getFullYear(), 0, 1) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
    setMode("range"); setRFrom(iso(start)); setRTo(iso(end));
  }

  async function generate() {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      setReport(await buildMgmtReport({
        modules: ALL.filter((k) => mods.includes(k)), from, to, lang, granularity: gran,
        plant: myProfile?.plantScope ?? null, generatedBy: myProfile?.fullName ?? "",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyusun laporan");
    } finally {
      setBusy(false);
    }
  }

  async function download(kind: "xlsx" | "pptx" | "pdf") {
    if (!report || exporting) return;
    setExporting(kind); setError(null);
    try {
      const name = reportFilename(report);
      if (kind === "xlsx") await (await import("@/lib/mgmtReport/exportXlsx")).exportMgmtXlsx(report, name);
      else if (kind === "pptx") await (await import("@/lib/mgmtReport/exportPptx")).exportMgmtPptx(report, name);
      else await (await import("@/lib/mgmtReport/exportPdf")).exportMgmtPdf(report, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat file");
    } finally {
      setExporting(null);
    }
  }

  const images = useMemo(() => {
    if (!report) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    withLang(report.lang, () => report.modules.forEach((m) => m.charts.slice(0, 2).forEach((c) => { out[c.id] = renderChartPNG(c, 640, 300); })));
    return out;
  }, [report]);

  const attention = report ? report.modules.flatMap((m) => m.attention) : [];

  return (
    <div className={r.wrap}>
      <header className={r.head}>
        <div>
          <span className={r.kicker}>Report</span>
          <h1>Laporan Manajemen</h1>
          <p>Ringkasan per modul untuk manajemen: angka utama, grafik, temuan, dan rekomendasi. Unduh dalam Excel, PowerPoint, atau PDF.</p>
        </div>
      </header>

      <section className={r.panel}>
        <div className={r.step}>
          <span className={r.stepNo}>1</span>
          <div className={r.stepBody}>
            <h2>Pilih modul</h2>
            <div className={r.mods}>
              {ALL.map((k) => {
                const on = mods.includes(k);
                return (
                  <button key={k} type="button" className={`${r.mod} ${on ? r.modOn : ""}`} style={{ ["--c" as string]: metaOf(k, "id").accent }} onClick={() => toggle(k)} aria-pressed={on}>
                    <span className={r.modTick}>{on ? Ic.check : null}</span>
                    <span className={r.modText}><b>{metaOf(k, "id").title}</b><small>{metaOf(k, "id").desc}</small></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={r.step}>
          <span className={r.stepNo}>2</span>
          <div className={r.stepBody}>
            <h2>Periode</h2>
            <div className={r.seg} role="group" aria-label="Jenis periode">
              {([["week", "Mingguan"], ["month", "Bulanan"], ["quarter", "Kuartalan"], ["year", "Tahunan"], ["range", "Rentang tanggal"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? r.segOn : ""} onClick={() => { if (k !== mode && k !== "range") setAnchor(today); setMode(k); }}>{l}</button>
              ))}
            </div>

            {mode !== "range" ? (
              <div className={r.nav}>
                <button type="button" className={r.navBtn} onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Periode sebelumnya">‹</button>
                <div className={r.navPick}>
                  {mode === "week" && (
                    <label className={r.field}>
                      <span>Minggu yang memuat tanggal</span>
                      <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
                    </label>
                  )}
                  {mode === "month" && (
                    <label className={r.field}>
                      <span>Bulan</span>
                      <select value={cur.getMonth()} onChange={(e) => setAnchor(iso(new Date(cur.getFullYear(), Number(e.target.value), 1)))}>
                        {MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}
                      </select>
                    </label>
                  )}
                  {mode === "quarter" && (
                    <label className={r.field}>
                      <span>Kuartal</span>
                      <select value={Math.floor(cur.getMonth() / 3)} onChange={(e) => setAnchor(iso(new Date(cur.getFullYear(), Number(e.target.value) * 3, 1)))}>
                        {["Q1 · Jan–Mar", "Q2 · Apr–Jun", "Q3 · Jul–Sep", "Q4 · Okt–Des"].map((n, i) => <option key={n} value={i}>{n}</option>)}
                      </select>
                    </label>
                  )}
                  {mode !== "week" && (
                    <label className={r.field}>
                      <span>Tahun</span>
                      <select value={cur.getFullYear()} onChange={(e) => setAnchor(iso(new Date(Number(e.target.value), cur.getMonth(), 1)))}>
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <button type="button" className={r.navBtn} onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} disabled={rangeOf(mode, shiftAnchor(mode, anchor, 1)).from > today} aria-label="Periode berikutnya">›</button>
                <button type="button" className={r.navNow} onClick={() => setAnchor(today)} disabled={from <= today && today <= to}>
                  {mode === "week" ? "Minggu ini" : mode === "month" ? "Bulan ini" : mode === "quarter" ? "Kuartal ini" : "Tahun ini"}
                </button>
              </div>
            ) : (
              <div className={r.nav}>
                <label className={r.field}><span>Dari</span><input type="date" value={rFrom} max={rTo} onChange={(e) => setRFrom(e.target.value)} /></label>
                <label className={r.field}><span>Sampai</span><input type="date" value={rTo} min={rFrom} onChange={(e) => setRTo(e.target.value)} /></label>
                <div className={r.quick}>
                  {([[7, "7 hari terakhir"], [30, "30 hari terakhir"], [90, "90 hari terakhir"], ["ytd", "Sejak awal tahun"]] as const).map(([d, l]) => (
                    <button key={l} type="button" onClick={() => quickRange(d)}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            <div className={r.periodCard}>
              {valid ? (
                <>
                  <strong>{periodHint}</strong>
                  <span>{nDays} hari · dibandingkan dengan {prevHint}</span>
                </>
              ) : <span className={r.tBad}>Tanggal awal harus sebelum tanggal akhir</span>}
            </div>
          </div>
        </div>

        <div className={r.step}>
          <span className={r.stepNo}>3</span>
          <div className={r.stepBody}>
            <h2>Opsi laporan</h2>
            <div className={r.opts}>
              <div className={r.opt}>
                <span className={r.optLabel}>Bahasa laporan</span>
                <div className={r.seg} role="group" aria-label="Bahasa laporan">
                  {([["id", "Indonesia"], ["en", "English"]] as const).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={lang === k} className={lang === k ? r.segOn : ""} onClick={() => setLang(k)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className={r.opt}>
                <span className={r.optLabel}>Grafik tren</span>
                <div className={r.seg} role="group" aria-label="Grafik tren">
                  {([["auto", "Otomatis"], ["day", "Per hari"], ["week", "Per minggu"], ["month", "Per bulan"]] as const).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={gran === k} className={gran === k ? r.segOn : ""} onClick={() => setGran(k)} disabled={k === "day" && nDays > 92}>{l}</button>
                  ))}
                </div>
                <small className={r.optHint}>
                  {valid ? `Tren ditampilkan ${effGran === "day" ? "per hari" : effGran === "week" ? "per minggu" : "per bulan"}${gran === "auto" ? " (otomatis menyesuaikan panjang periode)" : ""}.` : ""}
                </small>
              </div>
            </div>
          </div>
        </div>

        <div className={r.actions}>
          <button type="button" className={r.primary} onClick={generate} disabled={!valid || busy}>
            {Ic.spark}{busy ? "Menyusun laporan…" : report ? (stale ? "Perbarui laporan" : "Susun ulang") : "Susun laporan"}
          </button>
          <div className={r.dl}>
            <button type="button" className={`${r.dlBtn} ${r.dlXls}`} onClick={() => download("xlsx")} disabled={!report || stale || !!exporting}>{Ic.xls}{exporting === "xlsx" ? "Membuat…" : "Excel"}</button>
            <button type="button" className={`${r.dlBtn} ${r.dlPpt}`} onClick={() => download("pptx")} disabled={!report || stale || !!exporting}>{Ic.ppt}{exporting === "pptx" ? "Membuat…" : "PowerPoint"}</button>
            <button type="button" className={`${r.dlBtn} ${r.dlPdf}`} onClick={() => download("pdf")} disabled={!report || stale || !!exporting}>{Ic.pdf}{exporting === "pdf" ? "Membuat…" : "PDF"}</button>
          </div>
        </div>
        {stale && <div className={r.note}>Pilihan berubah — tekan &quot;Perbarui laporan&quot; sebelum mengunduh.</div>}
        {error && <div className={r.err}>{error}</div>}
      </section>

      {!report && !busy && (
        <div className={r.emptyState}>
          <b>Belum ada laporan</b>
          <span>Pilih modul dan periode, lalu tekan "Susun laporan" untuk melihat pratinjau.</span>
        </div>
      )}

      {report && (
        <>
          <section className={r.exec}>
            <div className={r.execHead}>
              <div>
                <span className={r.kicker}>{report.lang === "en" ? "Executive summary" : "Ringkasan eksekutif"}</span>
                <h2>{report.periodLabel}</h2>
                <span className={r.hint}>{report.scopeLabel} · {report.lang === "en" ? "compared with" : "pembanding"} {report.prevLabel}</span>
              </div>
            </div>
            <div className={r.execGrid}>
              {report.modules.filter((m) => !m.sub).map((m) => (
                <a key={m.key} href={`#mr-${m.key}`} className={r.execCard} style={{ ["--c" as string]: m.accent }}>
                  <b>{m.title}</b>
                  <p>{m.headline}</p>
                  <div className={r.execKpis}>
                    {m.kpis.slice(0, 3).map((k) => (<span key={k.label}><small>{k.label}</small><strong>{k.value}</strong></span>))}
                  </div>
                </a>
              ))}
            </div>
            <div className={`${r.attn} ${attention.length ? r.attnOn : ""}`}>
              <b>{report.lang === "en" ? "Management attention required" : "Perlu perhatian manajemen"}</b>
              {attention.length ? <ul>{attention.map((a, i) => <li key={i}>{a}</li>)}</ul> : <span>{report.lang === "en" ? "No critical issues this period." : "Tidak ada isu kritis pada periode ini."}</span>}
            </div>
          </section>

          {report.modules.map((m, mi) => (
            <section key={`${m.key}-${mi}`} id={m.sub ? undefined : `mr-${m.key}`} className={`${r.module} ${m.sub ? r.moduleSub : ""}`} style={{ ["--c" as string]: m.accent }}>
              <div className={r.modHead}>
                <h2>{m.title}</h2>
                <span>{report.periodLabel}</span>
              </div>
              {m.empty ? (
                <div className={r.emptyState}><span>{m.headline}</span></div>
              ) : (
                <>
                  <div className={r.kpis} style={{ ["--n" as string]: m.kpis.length }}>
                    {m.kpis.map((k) => (
                      <div key={k.label} className={r.kpi}>
                        <small>{k.label}</small>
                        <strong>{k.value}</strong>
                        {k.sub && <span className={k.tone === "bad" ? r.tBad : k.tone === "good" ? r.tGood : r.tMute}>{k.sub}</span>}
                      </div>
                    ))}
                  </div>
                  <div className={r.charts}>
                    {m.charts.slice(0, 2).map((c) => (
                      <figure key={c.id} className={r.chart}>
                        <figcaption>{c.title}</figcaption>
                        {images[c.id] ? <img src={images[c.id]} alt={c.title} /> : null}
                      </figure>
                    ))}
                  </div>
                  <div className={r.cols}>
                    <div>
                      <h3>{report.lang === "en" ? "Key findings" : "Temuan utama"}</h3>
                      <ul className={r.list}>{m.insights.slice(0, 5).map((t, i) => <li key={i}>{t}</li>)}</ul>
                    </div>
                    <div>
                      <h3>{report.lang === "en" ? "Recommendations" : "Rekomendasi"}</h3>
                      <ul className={`${r.list} ${r.listAct}`}>{m.actions.slice(0, 4).map((t, i) => <li key={i}>{t}</li>)}</ul>
                    </div>
                  </div>
                </>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
