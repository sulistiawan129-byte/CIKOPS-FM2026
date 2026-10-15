"use client";

/* ════════════════════════════════════════════════════════════
   GA FACILITY — Cleaning Service, Gardening & TGA.
   CIKOPS hanya MENAMPILKAN data hasil sinkron dari Excel "ISS GA System"
   (modSyncGA). Input tetap di Excel oleh SPV.
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getGaEvents, getGaImprovements, getGaInventory, getGaJobs, getGaManpower, getGaPlan, getGaSyncStatus, getGaTga, rotateGaSyncKey,
} from "@/lib/ga/api";
import {
  byLowestAch, groupBy, inMonth, monthRange, periodeOf, shiftPeriode, summarize, weekOfMonth,
  type GaEvent, type GaGroup, type GaImprovement, type GaInventory, type GaJob, type GaManpower, type GaPlan, type GaSummary, type GaSyncStatus, type GaTga,
} from "@/lib/ga/model";
import type { MyProfile } from "@/lib/api";
import { toLocalISODate } from "@/lib/dateUtils";
import { useLang } from "@/lib/providers";
import { exportGenericCsv, exportGenericExcel, exportGenericPdf } from "@/lib/reportEngine";
import type { ReportColumn, ReportLang } from "@/lib/reportEngine";
import a from "./atk.module.css";
import g from "./ga.module.css";

type Lang = "id" | "en";
type View = "dashboard" | "matrix" | "tga" | "event" | "improvement" | "inventory" | "sync";
type Team = "Semua" | "Cleaning Service" | "Gardener";

const BLN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BLN_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BLN_S = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const pct = (v: number | null, d = 1) => (v === null ? "—" : `${(v * 100).toFixed(d).replace(".", ",")}%`);
const nf = (n: number) => n.toLocaleString("id-ID");
const perLabel = (p: number, lang: Lang) => `${(lang === "en" ? BLN_EN : BLN_ID)[(p % 100) - 1]} ${Math.floor(p / 100)}`;
const fmtD = (d: string | null, lang: Lang) => (d ? new Date(d + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDT = (d: string | null, lang: Lang) => (d ? new Date(d).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
function ago(t: string | null, lang: Lang) {
  if (!t) return lang === "en" ? "never" : "belum pernah";
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
  if (m < 60) return lang === "en" ? `${m} min ago` : `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 48) return lang === "en" ? `${h} h ago` : `${h} jam lalu`;
  return lang === "en" ? `${Math.round(h / 24)} d ago` : `${Math.round(h / 24)} hari lalu`;
}
const achClass = (v: number | null) => (v === null ? g.achNa : v >= 0.999 ? g.achOk : v >= 0.9 ? g.achMid : g.achLow);

export default function GaTab({ myProfile }: { myProfile: MyProfile | null }) {
  void myProfile;
  const { lang: rawLang } = useLang();
  const lang: Lang = rawLang === "en" ? "en" : "id";
  const L = useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);

  const today = toLocalISODate(new Date());
  const [periode, setPeriode] = useState(() => periodeOf(today));
  const [team, setTeam] = useState<Team>("Semua");
  const [view, setView] = useState<View>("dashboard");

  const [plan, setPlan] = useState<GaPlan[]>([]);
  const [jobs, setJobs] = useState<GaJob[]>([]);
  const [manpower, setManpower] = useState<GaManpower[]>([]);
  const [events, setEvents] = useState<GaEvent[]>([]);
  const [imps, setImps] = useState<GaImprovement[]>([]);
  const [inv, setInv] = useState<GaInventory[]>([]);
  const [tga, setTga] = useState<GaTga[]>([]);
  const [sync, setSync] = useState<GaSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const winFrom = monthRange(shiftPeriode(periode, -5)).from;
  const winTo = monthRange(periode).to;

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try { setPlan(await getGaPlan(winFrom, winTo)); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [winFrom, winTo]);
  const loadOther = useCallback(async () => {
    const r = await Promise.allSettled([getGaJobs(), getGaManpower(), getGaEvents(), getGaImprovements(), getGaInventory(), getGaTga(), getGaSyncStatus()]);
    if (r[0].status === "fulfilled") setJobs(r[0].value);
    if (r[1].status === "fulfilled") setManpower(r[1].value);
    if (r[2].status === "fulfilled") setEvents(r[2].value);
    if (r[3].status === "fulfilled") setImps(r[3].value);
    if (r[4].status === "fulfilled") setInv(r[4].value);
    if (r[5].status === "fulfilled") setTga(r[5].value);
    if (r[6].status === "fulfilled") setSync(r[6].value);
    const firstErr = r.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstErr) setErr(firstErr.reason instanceof Error ? firstErr.reason.message : String(firstErr.reason));
  }, []);
  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => { loadOther(); const id = setInterval(loadOther, 120000); return () => clearInterval(id); }, [loadOther]);

  const asOf = today < monthRange(periode).to ? today : monthRange(periode).to;
  const teamRows = useMemo(() => (team === "Semua" ? plan : plan.filter((r) => r.tim.toLowerCase() === team.toLowerCase())), [plan, team]);
  const curRows = useMemo(() => teamRows.filter((r) => r.periode === periode), [teamRows, periode]);
  const prevRows = useMemo(() => teamRows.filter((r) => r.periode === shiftPeriode(periode, -1)), [teamRows, periode]);
  const cur = useMemo(() => summarize(curRows, asOf), [curRows, asOf]);
  const prev = useMemo(() => summarize(prevRows, monthRange(shiftPeriode(periode, -1)).to), [prevRows, periode]);
  const tgaMonth = useMemo(() => tga.filter((t) => inMonth(t.tanggal, periode)), [tga, periode]);
  const evMonth = useMemo(() => events.filter((t) => inMonth(t.tanggal, periode)), [events, periode]);
  const impMonth = useMemo(() => imps.filter((t) => inMonth(t.tanggal, periode)), [imps, periode]);

  const TABS: { id: View; label: string; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "matrix", label: L("Plan vs Actual", "Plan vs Actual") },
    { id: "tga", label: "TGA", badge: tgaMonth.length || undefined },
    { id: "event", label: "Event", badge: evMonth.length || undefined },
    { id: "improvement", label: "Improvement", badge: impMonth.length || undefined },
    { id: "inventory", label: "Inventory" },
    { id: "sync", label: L("Sinkron Excel", "Excel Sync") },
  ];
  const noData = !loading && plan.length === 0 && jobs.length === 0;

  return (
    <div className={a.wrap}>
      <header className={a.head}>
        <div className={a.headText}>
          <span className={a.kicker}>{L("Fasilitas · ISS General Affairs", "Facility · ISS General Affairs")}</span>
          <h1>{L("Cleaning, Gardening & TGA", "Cleaning, Gardening & TGA")}</h1>
          <p>{L("Laporan plan vs actual pekerjaan rutin, aktivitas teknisi GA, event, improvement dan inventory alat — tersinkron dari Excel SPV.", "Routine plan vs actual, GA technician activities, events, improvements and tool inventory — synced from the supervisor's Excel.")}</p>
        </div>
        <div className={a.headSide}>
          <button type="button" className={`${a.syncPill} ${sync?.lastSyncAt ? a.pillOk : a.pillWarn}`} onClick={() => setView("sync")}>
            <i />
            <span><b>{sync?.lastSyncAt ? L("Excel tersinkron", "Excel synced") : L("Belum ada sinkron", "Not synced yet")}</b><small>{sync?.lastSyncAt ? `${ago(sync.lastSyncAt, lang)} · ${sync.lastComputer || "-"}` : L("Pasang modSyncGA di Excel", "Install modSyncGA in Excel")}</small></span>
          </button>
          <button type="button" className={a.ghostBtn} onClick={() => { loadPlan(); loadOther(); }} disabled={loading}>{loading ? "…" : "↻"} {L("Muat ulang", "Refresh")}</button>
        </div>
      </header>

      <nav className={a.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} className={`${a.tab} ${view === t.id ? a.tabOn : ""}`} onClick={() => setView(t.id)}>
            {t.label}{t.badge ? <span className={`${a.tabBadge} ${a.badgeInfo}`}>{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {err && <div className={a.msgErr}>⚠ {err}</div>}

      {view !== "sync" && view !== "inventory" && (
        <div className={a.period}>
          <div className={g.monthNav}>
            <button type="button" className={g.navBtn} onClick={() => setPeriode((p) => shiftPeriode(p, -1))} aria-label={L("Bulan sebelumnya", "Previous month")}>‹</button>
            <b>{perLabel(periode, lang)}</b>
            <button type="button" className={g.navBtn} onClick={() => setPeriode((p) => shiftPeriode(p, 1))} aria-label={L("Bulan berikutnya", "Next month")}>›</button>
          </div>
          {(view === "dashboard" || view === "matrix") && (
            <div className={a.seg} role="group" aria-label="Tim">
              {(["Semua", "Cleaning Service", "Gardener"] as Team[]).map((t) => (
                <button key={t} type="button" aria-pressed={team === t} className={team === t ? a.segOn : ""} onClick={() => setTeam(t)}>{t === "Semua" ? L("Semua tim", "All teams") : t}</button>
              ))}
            </div>
          )}
          <span className={a.periodLabel}>{L("Data s/d", "Data up to")} {fmtD(asOf, lang)}</span>
        </div>
      )}

      {noData && view !== "sync" ? (
        <section className={a.card}>
          <p className={a.empty}>{L("Belum ada data dari Excel. Pasang modSyncGA di file ISS GA System lalu klik Sinkron CIKOPS (lihat tab Sinkron Excel).", "No data from Excel yet. Install modSyncGA in the ISS GA System file and click Sync (see the Excel Sync tab).")}</p>
        </section>
      ) : (
        <>
          {view === "dashboard" && (
            <Dashboard lang={lang} loading={loading} periode={periode} cur={cur} prev={prev} curRows={curRows} teamRows={teamRows} asOf={asOf}
              tga={tgaMonth} events={evMonth} imps={impMonth} inv={inv} onGo={setView} />
          )}
          {view === "matrix" && <Matrix lang={lang} rows={curRows} periode={periode} today={today} />}
          {view === "tga" && <TgaView lang={lang} rows={tgaMonth} all={tga} periode={periode} manpower={manpower} />}
          {view === "event" && <SimpleTable lang={lang} title="Event" rows={evMonth} periode={periode}
            cols={[
              { key: "tanggal", labelId: "Tanggal", labelEn: "Date", get: (r: GaEvent) => r.tanggal ?? "" },
              { key: "nama", labelId: "Nama Event", labelEn: "Event", get: (r: GaEvent) => r.nama },
              { key: "deskripsi", labelId: "Deskripsi", labelEn: "Description", get: (r: GaEvent) => r.deskripsi },
              { key: "waktu", labelId: "Waktu", labelEn: "Time", get: (r: GaEvent) => r.waktu },
              { key: "support", labelId: "Support GA", labelEn: "GA support", get: (r: GaEvent) => r.support },
              { key: "dok", labelId: "Dokumentasi", labelEn: "Documentation", get: (r: GaEvent) => r.dokumentasi },
            ]} empty={L("Tidak ada event di bulan ini.", "No events this month.")} filename="Event_GA" />}
          {view === "improvement" && <SimpleTable lang={lang} title="Improvement / Inovasi" rows={impMonth} periode={periode}
            cols={[
              { key: "tanggal", labelId: "Tanggal", labelEn: "Date", get: (r: GaImprovement) => r.tanggal ?? "" },
              { key: "kategori", labelId: "Kategori", labelEn: "Category", get: (r: GaImprovement) => r.kategori },
              { key: "jenis", labelId: "Jenis Pekerjaan", labelEn: "Work type", get: (r: GaImprovement) => r.jenis },
              { key: "deskripsi", labelId: "Deskripsi", labelEn: "Description", get: (r: GaImprovement) => r.deskripsi },
              { key: "area", labelId: "Area", labelEn: "Area", get: (r: GaImprovement) => r.area },
              { key: "petugas", labelId: "Petugas", labelEn: "Staff", get: (r: GaImprovement) => r.petugas },
              { key: "pengawas", labelId: "Pengawas", labelEn: "Supervisor", get: (r: GaImprovement) => r.pengawas },
              { key: "dok", labelId: "Dokumentasi", labelEn: "Documentation", get: (r: GaImprovement) => r.dokumentasi },
            ]} empty={L("Tidak ada improvement / inovasi di bulan ini.", "No improvements this month.")} filename="Improvement_GA" />}
          {view === "inventory" && <InventoryView lang={lang} rows={inv} />}
          {view === "sync" && <SyncView lang={lang} sync={sync} jobs={jobs.length} manpower={manpower.length} onRotated={(k) => setSync((s) => (s ? { ...s, syncKey: k } : s))} onError={(m) => setErr(m)} />}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
function Dashboard({ lang, loading, periode, cur, prev, curRows, teamRows, asOf, tga, events, imps, inv, onGo }: {
  lang: Lang; loading: boolean; periode: number; cur: GaSummary; prev: GaSummary; curRows: GaPlan[]; teamRows: GaPlan[]; asOf: string;
  tga: GaTga[]; events: GaEvent[]; imps: GaImprovement[]; inv: GaInventory[]; onGo: (v: View) => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const weeks = useMemo(() => groupBy(curRows, (r) => String(weekOfMonth(r.tanggal)), asOf).sort((x, y) => Number(x.key) - Number(y.key)), [curRows, asOf]);
  const teams = useMemo(() => groupBy(curRows, (r) => r.tim, asOf).sort((x, y) => x.key.localeCompare(y.key)), [curRows, asOf]);
  const lokasi = useMemo(() => groupBy(curRows, (r) => r.lokasi, asOf).sort(byLowestAch), [curRows, asOf]);
  const tipe = useMemo(() => groupBy(curRows, (r) => r.tipe, asOf).sort(byLowestAch), [curRows, asOf]);
  const trend = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const p = shiftPeriode(periode, i - 5);
    const rs = teamRows.filter((r) => r.periode === p);
    const s = summarize(rs, i === 5 ? asOf : monthRange(p).to);
    return { p, label: `${BLN_S[(p % 100) - 1]} ${String(Math.floor(p / 100)).slice(2)}`, s };
  }), [teamRows, periode, asOf]);
  const tidak = useMemo(() => curRows.filter((r) => r.actual === 0).sort((x, y) => x.tanggal.localeCompare(y.tanggal)), [curRows]);
  const spv = useMemo(() => {
    const m = new Map<string, { n: number; last: string | null }>();
    for (const r of curRows) if (r.actual !== null && r.spv) {
      const x = m.get(r.spv) ?? { n: 0, last: null };
      x.n++;
      if (r.waktuInput && (!x.last || r.waktuInput > x.last)) x.last = r.waktuInput;
      m.set(r.spv, x);
    }
    return [...m.entries()].sort((x, y) => y[1].n - x[1].n);
  }, [curRows]);
  const tgaBy = useMemo(() => {
    const m = new Map<string, number>();
    tga.forEach((t) => m.set(t.namaTga || "—", (m.get(t.namaTga || "—") ?? 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [tga]);
  const reqBy = useMemo(() => {
    const m = new Map<string, number>();
    tga.forEach((t) => m.set(t.requestBy || "—", (m.get(t.requestBy || "—") ?? 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [tga]);
  const invPerlu = inv.filter((i) => i.nama && i.status.toLowerCase() !== "baik").length;
  const dAch = cur.ach !== null && prev.ach !== null ? (cur.ach - prev.ach) * 100 : null;

  if (loading && curRows.length === 0) return <div className={a.skeletonGrid}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className={a.skeleton} />)}</div>;

  return (
    <div className={a.dash}>
      <div className={g.kpis}>
        <div className={`${a.kpi} ${g.kpiHero} ${achClass(cur.ach)}`}>
          <span className={a.kpiLabel}>Achievement</span>
          <span className={a.kpiValue}>{pct(cur.ach)}</span>
          <span className={a.kpiFoot}>
            {cur.ach === null ? L("belum ada jadwal jatuh tempo", "no jobs due yet") : cur.ach >= 0.999 ? L("✓ Achieve (target 100%)", "✓ Achieved (target 100%)") : L("Belum achieve · target 100%", "Not achieved · target 100%")}
            {dAch !== null && <> · <b className={dAch >= 0 ? a.tGreen : a.tRed}>{dAch >= 0 ? "▲" : "▼"} {Math.abs(dAch).toFixed(1).replace(".", ",")} {L("poin", "pts")}</b> {L("vs bulan lalu", "vs last month")}</>}
          </span>
        </div>
        <Kpi label={L("Plan bulan ini", "Planned")} value={nf(cur.plan)} foot={L("jadwal pekerjaan", "scheduled jobs")} tone="brand" />
        <Kpi label={L("Dikerjakan", "Done")} value={nf(cur.done)} foot="actual = 1" tone="green" />
        <Kpi label={L("Tidak dikerjakan", "Not done")} value={nf(cur.tidak)} foot="actual = 0" tone={cur.tidak ? "red" : "neutral"} onClick={() => onGo("matrix")} />
        <Kpi label={L("Belum diinput", "Not entered")} value={nf(cur.belum)} foot={L("jadwal lewat, actual kosong", "past jobs without actual")} tone={cur.belum ? "orange" : "neutral"} />
        <Kpi label={L("Kepatuhan input", "Input compliance")} value={pct(cur.compliance)} foot={`${nf(cur.inputted)} / ${nf(cur.due)} ${L("jadwal jatuh tempo", "due jobs")}`} tone="purple" />
      </div>

      <div className={a.gridMain}>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Achievement per minggu", "Achievement by week")}</h2><p>{L("Dikerjakan / jadwal yang sudah lewat · garis = target 100%", "Done / jobs due so far · line = 100% target")}</p></div></div>
          <AchBars data={weeks.map((w) => ({ label: `${L("Mg", "Wk")} ${w.key}`, s: w }))} lang={lang} />
        </section>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Per tim", "By team")}</h2><p>{L("Dikerjakan / plan", "Done / planned")}</p></div></div>
          <ul className={g.teamList}>
            {teams.length === 0 && <li className={a.empty}>{L("Belum ada plan.", "No plan yet.")}</li>}
            {teams.map((t) => (
              <li key={t.key}>
                <div className={g.teamTop}><b>{t.key}</b><span className={achClass(t.ach)}>{pct(t.ach)}</span></div>
                <div className={a.track}><span className={achClass(t.ach)} style={{ width: `${Math.min(100, (t.ach ?? 0) * 100)}%` }} /></div>
                <div className={g.teamSub}>{nf(t.done)} / {nf(t.plan)} · {L("tidak", "not done")} {nf(t.tidak)} · {L("belum input", "not entered")} {nf(t.belum)}</div>
              </li>
            ))}
          </ul>
          <div className={a.cardHead} style={{ marginTop: 8 }}><div><h2>{L("Tren 6 bulan", "6-month trend")}</h2></div></div>
          <AchBars data={trend.map((t) => ({ label: t.label, s: t.s }))} lang={lang} compact />
        </section>
      </div>

      <div className={g.grid2}>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Per lokasi", "By location")}</h2><p>{L("Diurutkan dari achievement terendah", "Lowest achievement first")}</p></div></div>
          <GroupTable lang={lang} rows={lokasi} label={L("Lokasi", "Location")} />
        </section>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Per tipe pekerjaan", "By work type")}</h2><p>{L("Diurutkan dari achievement terendah", "Lowest achievement first")}</p></div></div>
          <GroupTable lang={lang} rows={tipe} label={L("Tipe", "Type")} />
        </section>
      </div>

      <div className={a.gridThree}>
        <section className={a.card}>
          <div className={a.cardHead}>
            <div><h2>{L("Tidak dikerjakan", "Not done")}</h2><p>{L("Actual = 0 di bulan ini", "Actual = 0 this month")}</p></div>
            <button type="button" className={a.linkBtn} onClick={() => onGo("matrix")}>Plan vs Actual →</button>
          </div>
          {tidak.length === 0 ? <div className={a.allGood}>✓ {L("Tidak ada pekerjaan yang dilewati.", "No skipped jobs.")}</div> : (
            <ul className={a.feed}>
              {tidak.slice(0, 10).map((r) => (
                <li key={r.key}>
                  <span className={`${a.feedIcon} ${g.feedBad}`}>✕</span>
                  <div className={a.feedMain}>
                    <div className={a.feedTop}><b>{r.tipe} · {r.area}</b><span>{fmtD(r.tanggal, lang).slice(0, 6)}</span></div>
                    <div className={a.feedSub}>{r.lokasi} · {r.tim}{r.petugas ? ` · ${r.petugas}` : ""}</div>
                  </div>
                </li>
              ))}
              {tidak.length > 10 && <li className={a.hint}>+{tidak.length - 10} {L("lainnya", "more")}</li>}
            </ul>
          )}
        </section>

        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Kegiatan bulan ini", "Activities this month")}</h2><p>TGA · Event · Improvement · Inventory</p></div></div>
          <div className={g.miniStats}>
            <button type="button" onClick={() => onGo("tga")}><b>{tga.length}</b><span>{L("aktivitas TGA", "TGA activities")}</span></button>
            <button type="button" onClick={() => onGo("event")}><b>{events.length}</b><span>Event</span></button>
            <button type="button" onClick={() => onGo("improvement")}><b>{imps.length}</b><span>Improvement</span></button>
            <button type="button" onClick={() => onGo("inventory")} className={invPerlu ? g.statWarn : ""}><b>{invPerlu}</b><span>{L("alat perlu cek", "tools to check")}</span></button>
          </div>
          {tgaBy.length > 0 && (
            <>
              <div className={g.subHead}>{L("TGA per teknisi", "TGA by technician")}</div>
              <ol className={a.hbars}>
                {tgaBy.slice(0, 5).map(([n, c]) => (
                  <li key={n}><div className={a.hbar} style={{ cursor: "default" }}><span className={a.hbarBody}><span className={a.hbarTop}><b>{n}</b><span>{c}</span></span><span className={a.track}><span style={{ width: `${(c / tgaBy[0][1]) * 100}%` }} /></span></span></div></li>
                ))}
              </ol>
              {reqBy[0] && <p className={a.hint}>{L("Pemohon terbanyak", "Top requester")}: <b>{reqBy[0][0]}</b> ({reqBy[0][1]})</p>}
            </>
          )}
        </section>

        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Input actual SPV", "SPV actual input")}</h2><p>{L("Jumlah actual yang diinput bulan ini", "Actuals entered this month")}</p></div></div>
          {spv.length === 0 ? <p className={a.empty}>{L("Belum ada input actual di bulan ini.", "No actual entered this month.")}</p> : (
            <ul className={a.feed}>
              {spv.map(([n, x]) => (
                <li key={n}>
                  <span className={`${a.feedIcon} ${a.feedIn}`}>✓</span>
                  <div className={a.feedMain}>
                    <div className={a.feedTop}><b>{n}</b><span>{nf(x.n)} {L("jadwal", "jobs")}</span></div>
                    <div className={a.feedSub}>{L("Input terakhir", "Last input")}: {fmtDT(x.last, lang)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, foot, tone, onClick }: { label: string; value: string; foot: string; tone: "brand" | "green" | "red" | "orange" | "purple" | "neutral"; onClick?: () => void }) {
  const cls = `${a.kpi} ${g["tone_" + tone]}`;
  const inner = (<><span className={a.kpiLabel}>{label}</span><span className={a.kpiValue}>{value}</span><span className={a.kpiFoot}>{foot}</span></>);
  return onClick ? <button type="button" className={cls} onClick={onClick} style={{ cursor: "pointer" }}>{inner}</button> : <div className={cls}>{inner}</div>;
}

function AchBars({ data, lang, compact }: { data: { label: string; s: GaSummary }[]; lang: Lang; compact?: boolean }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  if (data.length === 0 || data.every((d) => d.s.plan === 0)) return <p className={a.empty}>{L("Belum ada plan.", "No plan yet.")}</p>;
  const H = compact ? 110 : 170;
  return (
    <div className={g.bars} style={{ height: H + 40 }}>
      <div className={g.target} style={{ bottom: 40 + H }} />
      {data.map((d) => (
        <div key={d.label} className={g.barCol} title={`${d.label}: ${pct(d.s.ach)} (${d.s.done}/${d.s.plan})`}>
          <span className={g.barVal}>{pct(d.s.ach, 0)}</span>
          <div className={g.barTrack} style={{ height: H }}>
            <div className={`${g.barFill} ${achClass(d.s.ach)}`} style={{ height: `${Math.min(100, (d.s.ach ?? 0) * 100)}%` }} />
          </div>
          <span className={g.barLbl}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function GroupTable({ lang, rows, label }: { lang: Lang; rows: GaGroup[]; label: string }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [all, setAll] = useState(false);
  if (rows.length === 0) return <p className={a.empty}>{L("Belum ada plan.", "No plan yet.")}</p>;
  const list = all ? rows : rows.slice(0, 10);
  return (
    <>
      <div className={a.tableWrap}>
        <table className={`${a.table} ${g.tableSm}`}>
          <thead><tr><th>{label}</th><th className={a.num}>Plan</th><th className={a.num}>{L("Selesai", "Done")}</th><th className={a.num}>{L("Tidak", "Not")}</th><th className={a.num}>{L("Blm input", "Pending")}</th><th className={g.achTh}>Achievement</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.key}>
                <td><b>{r.key}</b></td>
                <td className={a.num}>{nf(r.plan)}</td>
                <td className={a.num}>{nf(r.done)}</td>
                <td className={`${a.num} ${r.tidak ? a.tRed : ""}`}>{nf(r.tidak)}</td>
                <td className={`${a.num} ${r.belum ? a.tOrange : ""}`}>{nf(r.belum)}</td>
                <td className={g.achTh}>
                  <div className={g.achCell}><div className={a.track}><span className={achClass(r.ach)} style={{ width: `${Math.min(100, (r.ach ?? 0) * 100)}%` }} /></div><b className={achClass(r.ach)}>{pct(r.ach)}</b></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && <button type="button" className={a.addLine} onClick={() => setAll((v) => !v)}>{all ? L("Ringkas", "Show less") : `${L("Tampilkan semua", "Show all")} (${rows.length})`}</button>}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   PLAN VS ACTUAL — matriks mingguan
════════════════════════════════════════════════════════════ */
function Matrix({ lang, rows, periode, today }: { lang: Lang; rows: GaPlan[]; periode: number; today: string }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const weeks = useMemo(() => [...new Set(rows.map((r) => weekOfMonth(r.tanggal)))].sort((x, y) => x - y), [rows]);
  const [week, setWeek] = useState<number>(() => (periodeOf(today) === periode ? weekOfMonth(today) : 1));
  const [lok, setLok] = useState("");
  const [status, setStatus] = useState<"all" | "tidak" | "belum">("all");
  const [q, setQ] = useState("");
  useEffect(() => { if (weeks.length && !weeks.includes(week)) setWeek(weeks[0]); }, [weeks, week]);

  const wRows = useMemo(() => rows.filter((r) => weekOfMonth(r.tanggal) === week), [rows, week]);
  const lokasiList = useMemo(() => [...new Set(rows.map((r) => r.lokasi))].sort(), [rows]);
  const days = useMemo(() => {
    const anyDate = wRows[0]?.tanggal ?? monthRange(periode).from;
    const d = new Date(anyDate + "T00:00:00");
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return toLocalISODate(x); });
  }, [wRows, periode]);
  const jobs = useMemo(() => {
    const m = new Map<string, { job: GaPlan; cells: Record<string, GaPlan> }>();
    for (const r of wRows) {
      if (lok && r.lokasi !== lok) continue;
      const e = m.get(r.jobId) ?? { job: r, cells: {} };
      e.cells[r.tanggal] = r;
      m.set(r.jobId, e);
    }
    const t = q.trim().toLowerCase();
    return [...m.values()]
      .filter((e) => !t || [e.job.jobId, e.job.lokasi, e.job.tipe, e.job.area, e.job.petugas].join(" ").toLowerCase().includes(t))
      .filter((e) => status === "all" || Object.values(e.cells).some((c) => status === "tidak" ? c.actual === 0 : c.actual === null && c.tanggal <= today))
      .sort((x, y) => x.job.tim.localeCompare(y.job.tim) || x.job.lokasi.localeCompare(y.job.lokasi) || x.job.jobId.localeCompare(y.job.jobId));
  }, [wRows, lok, q, status, today]);
  const s = summarize(wRows.filter((r) => !lok || r.lokasi === lok), today);

  function exportRows(fmt: "excel" | "pdf" | "csv") {
    const cols: ReportColumn<GaPlan>[] = [
      { key: "tgl", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal },
      { key: "id", labelId: "ID", labelEn: "ID", get: (r) => r.jobId },
      { key: "tim", labelId: "Tim", labelEn: "Team", get: (r) => r.tim },
      { key: "lok", labelId: "Lokasi", labelEn: "Location", get: (r) => r.lokasi },
      { key: "tipe", labelId: "Tipe Pekerjaan", labelEn: "Work type", get: (r) => r.tipe },
      { key: "area", labelId: "Area", labelEn: "Area", get: (r) => r.area },
      { key: "ptg", labelId: "Petugas", labelEn: "Staff", get: (r) => r.petugas },
      { key: "act", labelId: "Actual", labelEn: "Actual", get: (r) => (r.actual === null ? "-" : r.actual) },
      { key: "spv", labelId: "SPV", labelEn: "SPV", get: (r) => r.spv },
    ];
    const run = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    run({ rows: [...rows].sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.jobId.localeCompare(y.jobId)), columns: cols, lang: lang as ReportLang,
      titleId: "Plan vs Actual Cleaning & Gardening", titleEn: "Cleaning & Gardening Plan vs Actual", periodLabel: perLabel(periode, lang), filename: "Plan_vs_Actual_GA" });
  }

  return (
    <section className={a.card}>
      <div className={a.toolbar}>
        <div className={a.seg} role="group" aria-label={L("Minggu", "Week")}>
          {weeks.map((w) => <button key={w} type="button" aria-pressed={week === w} className={week === w ? a.segOn : ""} onClick={() => setWeek(w)}>{L("Minggu", "Week")} {w}</button>)}
        </div>
        <select className={a.input} style={{ width: "auto" }} value={lok} onChange={(e) => setLok(e.target.value)} aria-label={L("Lokasi", "Location")}>
          <option value="">{L("Semua lokasi", "All locations")}</option>
          {lokasiList.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={a.input} style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="all">{L("Semua status", "All statuses")}</option>
          <option value="tidak">{L("Ada yang tidak dikerjakan", "Has not-done")}</option>
          <option value="belum">{L("Ada yang belum diinput", "Has pending input")}</option>
        </select>
        <input className={`${a.input} ${a.search}`} placeholder={L("Cari ID, area, tipe, petugas…", "Search ID, area, type, staff…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className={a.grow} />
        <div className={a.exportGroup}>{(["excel", "pdf", "csv"] as const).map((f) => <button key={f} type="button" className={a.ghostBtn} onClick={() => exportRows(f)} disabled={!rows.length}>{f.toUpperCase()}</button>)}</div>
      </div>
      <div className={g.legend}>
        <span><i className={g.cDone}>✓</i>{L("Dikerjakan", "Done")}</span>
        <span><i className={g.cNot}>✕</i>{L("Tidak dikerjakan", "Not done")}</span>
        <span><i className={g.cPending}>!</i>{L("Belum diinput", "Not entered")}</span>
        <span><i className={g.cPlan}>•</i>{L("Terjadwal", "Scheduled")}</span>
        <b className={achClass(s.ach)}>{L("Minggu ini", "This week")}: {pct(s.ach)} ({nf(s.done)}/{nf(s.plan)})</b>
      </div>
      {jobs.length === 0 ? <p className={a.empty}>{L("Tidak ada jadwal yang cocok.", "No matching jobs.")}</p> : (
        <div className={a.tableWrap}>
          <table className={`${a.table} ${g.matrix}`}>
            <thead>
              <tr>
                <th>{L("Pekerjaan", "Job")}</th>
                {days.map((d, i) => <th key={d} className={`${g.dayCol} ${d === today ? g.todayCol : ""}`}>{HARI[i]}<small>{Number(d.slice(8))}</small></th>)}
              </tr>
            </thead>
            <tbody>
              {jobs.map((e) => (
                <tr key={e.job.jobId}>
                  <td>
                    <div className={g.jobName}>{e.job.tipe} · {e.job.area}</div>
                    <div className={a.itemCode}>{e.job.jobId} · {e.job.lokasi}{e.job.petugas ? ` · ${e.job.petugas}` : ""}</div>
                  </td>
                  {days.map((d) => {
                    const c = e.cells[d];
                    if (!c) return <td key={d} className={`${g.dayCol} ${d === today ? g.todayCol : ""}`} />;
                    const st = c.actual === 1 ? "done" : c.actual === 0 ? "not" : d <= today ? "pending" : "plan";
                    return (
                      <td key={d} className={`${g.dayCol} ${d === today ? g.todayCol : ""}`} title={c.spv ? `${c.spv} · ${fmtDT(c.waktuInput, lang)}` : undefined}>
                        <i className={st === "done" ? g.cDone : st === "not" ? g.cNot : st === "pending" ? g.cPending : g.cPlan}>{st === "done" ? "✓" : st === "not" ? "✕" : st === "pending" ? "!" : "•"}</i>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════
   TGA
════════════════════════════════════════════════════════════ */
function TgaView({ lang, rows, all, periode, manpower }: { lang: Lang; rows: GaTga[]; all: GaTga[]; periode: number; manpower: GaManpower[] }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const tech = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((t) => m.set(t.namaTga || "—", (m.get(t.namaTga || "—") ?? 0) + 1));
    manpower.filter((p) => p.tim.toUpperCase() === "TGA").forEach((p) => { if (!m.has(p.nama)) m.set(p.nama, 0); });
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [rows, manpower]);
  const req = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((t) => m.set(t.requestBy || "—", (m.get(t.requestBy || "—") ?? 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  }, [rows]);
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const p = shiftPeriode(periode, i - 5);
    return { p, label: BLN_S[(p % 100) - 1], n: all.filter((t) => inMonth(t.tanggal, p)).length };
  }), [all, periode]);
  const list = rows.filter((t) => (!who || (t.namaTga || "—") === who) && (!q || [t.activity, t.requestBy, t.namaTga].join(" ").toLowerCase().includes(q.toLowerCase())));
  const maxM = Math.max(1, ...months.map((m) => m.n));

  function exportRows(fmt: "excel" | "pdf" | "csv") {
    const cols: ReportColumn<GaTga>[] = [
      { key: "tgl", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal ?? "" },
      { key: "nama", labelId: "Nama TGA", labelEn: "Technician", get: (r) => r.namaTga },
      { key: "act", labelId: "Activity", labelEn: "Activity", get: (r) => r.activity, width: 3 },
      { key: "req", labelId: "Request By", labelEn: "Requested by", get: (r) => r.requestBy },
    ];
    const run = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    run({ rows: list, columns: cols, lang: lang as ReportLang, titleId: "Aktivitas TGA (Teknisi GA)", titleEn: "GA Technician Activities", periodLabel: perLabel(periode, lang), filename: "Aktivitas_TGA",
      summaryRows: [{ label: L("Total aktivitas", "Total activities"), value: list.length }] });
  }

  return (
    <div className={a.dash}>
      <div className={g.grid3}>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Aktivitas bulan ini", "Activities this month")}</h2><p>{L("Perbaikan / permintaan yang dikerjakan TGA", "Repairs / requests handled by TGA")}</p></div></div>
          <div className={g.bigNum}>{rows.length}</div>
          <div className={g.sparkBars}>{months.map((m) => <div key={m.p} title={`${m.label}: ${m.n}`}><span style={{ height: `${(m.n / maxM) * 100}%` }} className={m.p === periode ? g.sparkOn : ""} /><small>{m.label}</small></div>)}</div>
        </section>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Per teknisi", "By technician")}</h2><p>{L("Klik untuk memfilter", "Click to filter")}</p></div></div>
          {tech.length === 0 ? <p className={a.empty}>—</p> : (
            <ol className={a.hbars}>
              {tech.map(([n, c]) => (
                <li key={n}>
                  <button type="button" className={`${a.hbar} ${who === n ? a.hbarOn : ""}`} onClick={() => setWho(who === n ? "" : n)} aria-pressed={who === n}>
                    <span className={a.hbarBody}><span className={a.hbarTop}><b>{n}</b><span>{c}</span></span><span className={a.track}><span style={{ width: `${tech[0][1] ? (c / tech[0][1]) * 100 : 0}%` }} /></span></span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Pemohon terbanyak", "Top requesters")}</h2><p>Request By</p></div></div>
          {req.length === 0 ? <p className={a.empty}>—</p> : (
            <ul className={a.feed}>{req.map(([n, c]) => <li key={n}><div className={a.feedMain}><div className={a.feedTop}><b>{n}</b><span>{c} {L("aktivitas", "activities")}</span></div></div></li>)}</ul>
          )}
        </section>
      </div>
      <section className={a.card}>
        <div className={a.toolbar}>
          <input className={`${a.input} ${a.search}`} placeholder={L("Cari activity, pemohon, teknisi…", "Search activity, requester, technician…")} value={q} onChange={(e) => setQ(e.target.value)} />
          {who && <button type="button" className={a.focusChip} onClick={() => setWho("")}>{who} ✕</button>}
          <span className={a.grow} />
          <div className={a.exportGroup}>{(["excel", "pdf", "csv"] as const).map((f) => <button key={f} type="button" className={a.ghostBtn} onClick={() => exportRows(f)} disabled={!list.length}>{f.toUpperCase()}</button>)}</div>
        </div>
        {list.length === 0 ? <p className={a.empty}>{L("Tidak ada aktivitas TGA di bulan ini.", "No TGA activities this month.")}</p> : (
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead><tr><th>{L("Tanggal", "Date")}</th><th>{L("Nama TGA", "Technician")}</th><th>Activity</th><th>Request By</th></tr></thead>
              <tbody>{list.map((t) => <tr key={t.id}><td style={{ whiteSpace: "nowrap" }}>{fmtD(t.tanggal, lang)}</td><td><b>{t.namaTga || "—"}</b></td><td>{t.activity}</td><td>{t.requestBy || "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EVENT / IMPROVEMENT (tabel sederhana)
════════════════════════════════════════════════════════════ */
function SimpleTable<T extends { id: number }>({ lang, title, rows, periode, cols, empty, filename }: {
  lang: Lang; title: string; rows: T[]; periode: number; cols: ReportColumn<T>[]; empty: string; filename: string;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [q, setQ] = useState("");
  const list = rows.filter((r) => !q || cols.map((c) => String(c.get(r))).join(" ").toLowerCase().includes(q.toLowerCase()));
  function exportRows(fmt: "excel" | "pdf" | "csv") {
    const run = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    run({ rows: list, columns: cols, lang: lang as ReportLang, titleId: title, titleEn: title, periodLabel: perLabel(periode, lang), filename });
  }
  return (
    <section className={a.card}>
      <div className={a.toolbar}>
        <input className={`${a.input} ${a.search}`} placeholder={L("Cari…", "Search…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className={a.histSummary}>{list.length} {L("baris", "rows")}</span>
        <span className={a.grow} />
        <div className={a.exportGroup}>{(["excel", "pdf", "csv"] as const).map((f) => <button key={f} type="button" className={a.ghostBtn} onClick={() => exportRows(f)} disabled={!list.length}>{f.toUpperCase()}</button>)}</div>
      </div>
      {list.length === 0 ? <p className={a.empty}>{empty}</p> : (
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr>{cols.map((c) => <th key={c.key}>{lang === "en" ? c.labelEn : c.labelId}</th>)}</tr></thead>
            <tbody>{list.map((r) => <tr key={r.id}>{cols.map((c) => {
              const v = c.get(r);
              const isDate = c.key === "tanggal" && typeof v === "string" && /^\d{4}-/.test(v);
              const isDoc = c.key === "dok" && v;
              return <td key={c.key} style={isDate ? { whiteSpace: "nowrap" } : undefined}>{isDate ? fmtD(String(v), lang) : isDoc ? <span className={g.docChip} title={L("Foto tersimpan di folder Dokumentasi Excel", "Photo stored in the Excel Documentation folder")}>📎 {String(v)}</span> : String(v || "—")}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>
      )}
      <p className={a.hint}>{L("Foto / dokumen tersimpan di folder Dokumentasi pada PC SPV — CIKOPS hanya menampilkan nama filenya.", "Photos / documents stay in the Documentation folder on the SPV PC — CIKOPS only shows the file name.")}</p>
    </section>
  );
}

function InventoryView({ lang, rows }: { lang: Lang; rows: GaInventory[] }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [st, setSt] = useState("");
  const counts = useMemo(() => {
    const m = new Map<string, { jenis: number; unit: number }>();
    rows.filter((r) => r.nama).forEach((r) => { const k = r.status || L("(belum diisi)", "(empty)"); const x = m.get(k) ?? { jenis: 0, unit: 0 }; x.jenis++; x.unit += r.jumlah ?? 0; m.set(k, x); });
    return [...m.entries()].sort((x, y) => y[1].jenis - x[1].jenis);
  }, [rows, L]);
  const total = rows.filter((r) => r.nama).length;
  const baik = rows.filter((r) => r.nama && r.status.toLowerCase() === "baik").length;
  const list = rows.filter((r) => r.nama && (!st || (r.status || L("(belum diisi)", "(empty)")) === st));
  return (
    <div className={a.dash}>
      <div className={g.invStats}>
        <div className={`${a.kpi} ${g.tone_brand}`}><span className={a.kpiLabel}>{L("Jenis alat", "Tool types")}</span><span className={a.kpiValue}>{total}</span><span className={a.kpiFoot}>{nf(rows.reduce((s, r) => s + (r.jumlah ?? 0), 0))} unit</span></div>
        <div className={`${a.kpi} ${g.tone_green}`}><span className={a.kpiLabel}>{L("Kondisi baik", "Good condition")}</span><span className={a.kpiValue}>{total ? pct(baik / total) : "—"}</span><span className={a.kpiFoot}>{baik} / {total}</span></div>
        <div className={`${a.kpi} ${total - baik ? g.tone_red : g.tone_neutral}`}><span className={a.kpiLabel}>{L("Perlu tindak lanjut", "Needs follow-up")}</span><span className={a.kpiValue}>{total - baik}</span><span className={a.kpiFoot}>{L("status selain Baik", "status other than Good")}</span></div>
      </div>
      <section className={a.card}>
        <div className={a.toolbar}>
          <div className={a.seg} role="group">
            <button type="button" aria-pressed={!st} className={!st ? a.segOn : ""} onClick={() => setSt("")}>{L("Semua", "All")} <small>{total}</small></button>
            {counts.map(([k, v]) => <button key={k} type="button" aria-pressed={st === k} className={st === k ? a.segOn : ""} onClick={() => setSt(k)}>{k} <small>{v.jenis}</small></button>)}
          </div>
        </div>
        {list.length === 0 ? <p className={a.empty}>{L("Data inventory belum diisi di Excel.", "Inventory not filled in Excel yet.")}</p> : (
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead><tr><th>{L("Kode", "Code")}</th><th>{L("Nama alat", "Tool")}</th><th>{L("Jenis", "Type")}</th><th>Area</th><th>Status</th><th className={a.num}>{L("Jumlah", "Qty")}</th><th>{L("Tgl update", "Updated")}</th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.id}>
                  <td className={a.itemCode}>{r.kode}</td><td><b>{r.nama}</b></td><td>{r.jenis}</td><td>{r.area}</td>
                  <td><span className={r.status.toLowerCase() === "baik" ? a.tagExcel : r.status ? a.tagPending : a.tagWeb}>{r.status || "—"}</span></td>
                  <td className={a.num}>{r.jumlah ?? "—"}</td><td style={{ whiteSpace: "nowrap" }}>{fmtD(r.tglUpdate, lang)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SINKRON
════════════════════════════════════════════════════════════ */
function SyncView({ lang, sync, jobs, manpower, onRotated, onError }: { lang: Lang; sync: GaSyncStatus | null; jobs: number; manpower: number; onRotated: (k: string) => void; onError: (m: string) => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  async function rotate() {
    if (!window.confirm(L("Buat kunci sinkron GA baru? Kunci lama langsung tidak berlaku — isi GA_SYNC_KEY baru di modSyncGA.", "Create a new GA sync key? The old key stops working — update GA_SYNC_KEY in modSyncGA."))) return;
    try { onRotated(await rotateGaSyncKey()); setShow(true); } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <div className={a.syncGrid}>
      <section className={`${a.card} ${a.flowCard}`}>
        <div className={a.cardHead}><div><h2>{L("Cara kerja", "How it works")}</h2><p>{L("Excel SPV → CIKOPS (satu arah). CIKOPS hanya menampilkan laporan.", "SPV Excel → CIKOPS (one way). CIKOPS only displays reports.")}</p></div></div>
        <ol className={a.steps}>
          <li><b>{L("SPV input di Excel seperti biasa", "SPV enters data in Excel as usual")}</b> — {L("Generate Plan, Input Actual mingguan, Event, Improvement, Inventory dan TGA.", "Generate Plan, weekly actuals, Event, Improvement, Inventory and TGA.")}</li>
          <li><b>{L("Sinkron otomatis", "Automatic sync")}</b> — {L("setiap Simpan Actual / Generate Plan / Hapus Plan, data langsung dikirim ke CIKOPS.", "every Save Actual / Generate Plan / Delete Plan sends data to CIKOPS.")}</li>
          <li><b>{L("Kalau offline", "When offline")}</b> — {L("data masuk antrean dan dikirim ulang otomatis tiap 10 menit selama file terbuka, serta saat file dibuka lagi. Tombol \"Sinkron CIKOPS\" di MENU untuk kirim manual.", "data is queued and retried every 10 minutes while the file is open and when it is reopened. Use the \"Sinkron CIKOPS\" button on MENU to send manually.")}</li>
          <li><b>{L("Aman dari beberapa PC", "Safe across PCs")}</b> — {L("actual dari salinan file yang lebih lama tidak menimpa actual yang lebih baru.", "actuals from an older copy never overwrite newer actuals.")}</li>
          <li><b>{L("Foto", "Photos")}</b> — {L("tetap di folder Dokumentasi lokal; CIKOPS hanya mencatat nama file.", "stay in the local Documentation folder; CIKOPS only records the file name.")}</li>
        </ol>
      </section>
      <section className={a.card}>
        <div className={a.cardHead}><div><h2>Status</h2></div></div>
        {!sync ? <div className={a.skeleton} style={{ height: 140 }} /> : (
          <div className={a.statGrid}>
            <div className={`${a.stat} ${sync.lastSyncAt ? a.statOk : ""}`}><small>{L("Sinkron terakhir", "Last sync")}</small><b>{ago(sync.lastSyncAt, lang)}</b><span>{fmtDT(sync.lastSyncAt, lang)}{sync.lastComputer ? ` · ${sync.lastComputer}` : ""}</span></div>
            <div className={a.stat}><small>{L("Data di CIKOPS", "Data in CIKOPS")}</small><b>{nf(sync.plan)} {L("jadwal", "jobs")}</b><span>{jobs} {L("master pekerjaan", "job masters")} · {manpower} manpower</span></div>
            <div className={a.stat}><small>{L("Rincian", "Details")}</small><span>Plan: {fmtDT(sync.lastPlanAt, lang)}<br />Master: {fmtDT(sync.lastMasterAt, lang)}<br />Log: {fmtDT(sync.lastLogsAt, lang)}</span></div>
          </div>
        )}
      </section>
      <section className={a.card}>
        <div className={a.cardHead}><div><h2>{L("Pasang di Excel", "Install in Excel")}</h2><p>ISS GA System</p></div></div>
        <ol className={a.steps}>
          <li>{L("Unduh:", "Download:")} <a className={a.primarySm} href="/downloads/modSyncGA.bas" download>⬇ modSyncGA.bas</a> <a className={a.primarySm} href="/downloads/modGA.bas" download>⬇ modGA.bas (v1.7)</a></li>
          <li>{L("Alt+F11 → hapus modGA lama → Import modGA.bas & modSyncGA.bas.", "Alt+F11 → remove the old modGA → import modGA.bas & modSyncGA.bas.")}</li>
          <li>{L("Isi SUPABASE_URL, SUPABASE_ANON_KEY dan GA_SYNC_KEY (di bawah) di modSyncGA.", "Fill SUPABASE_URL, SUPABASE_ANON_KEY and GA_SYNC_KEY (below) in modSyncGA.")}</li>
          <li>{L("Jalankan Setup_Tombol sekali (membuat sheet TGA & tombol baru), lalu klik Sinkron CIKOPS → NO (semua periode).", "Run Setup_Tombol once (creates the TGA sheet & new buttons), then click Sinkron CIKOPS → NO (all periods).")}</li>
        </ol>
        <div className={a.keyBox}>
          <small>GA_SYNC_KEY</small>
          {sync?.isAdmin && sync.syncKey ? (
            <>
              <code className={a.mono}>{show ? sync.syncKey : "•".repeat(32)}</code>
              <div className={a.keyBtns}>
                <button type="button" className={a.ghostBtn} onClick={() => setShow((v) => !v)}>{show ? L("Sembunyikan", "Hide") : L("Tampilkan", "Show")}</button>
                <button type="button" className={a.ghostBtn} onClick={async () => { try { await navigator.clipboard.writeText(sync.syncKey!); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setShow(true); } }}>{copied ? L("Tersalin ✓", "Copied ✓") : L("Salin", "Copy")}</button>
                <button type="button" className={`${a.ghostBtn} ${a.dangerText}`} onClick={rotate}>{L("Ganti kunci", "Rotate key")}</button>
              </div>
            </>
          ) : <span className={a.hint}>{L("Hanya admin yang bisa melihat kunci. Pastikan SQL 027_ga_facility.sql sudah dijalankan.", "Only admins can view the key. Make sure SQL 027_ga_facility.sql has been run.")}</span>}
        </div>
      </section>
    </div>
  );
}
