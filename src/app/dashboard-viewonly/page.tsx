"use client";

/**
 * /dashboard-viewonly — FM COMMAND CENTER (tanpa login, hanya lihat).
 * Layar TV kantor: data BERJALAN (hari ini + total bulan berjalan), berganti otomatis.
 *   1 Ringkasan  2 Fleet live (papan driver)  3 Fleet & Gate  4 Kantin  5 ATK  6 Pelanggaran / NC
 * Tanpa data bernominal (Rp) & tanpa nama driver — aman untuk layar publik.
 * Data: RPC get_fm_snapshot (migrasi 028) + /api/gc-nc?board=1, polling 60 dtk.
 * URL: ?tab=nc (mulai di tab tertentu), ?rotate=0 (tanpa rotasi), ?sec=30 (lama rotasi, detik).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { getFmSnapshot, getNcBoard } from "@/lib/fm/api";
import { computeFm, fmtMin, nf, pct, TARGET, type AreaCard, type Bar, type FmSnapshot, type FmView, type NcBoard, type Status } from "@/lib/fm/model";
import OpsBoard from "./OpsBoard";
import s from "./fm.module.css";

const POLL_MS = 60000;
const TABS = [
  { id: "rapor", label: "Ringkasan hari ini", dot: "#5b8cff" },
  { id: "ops", label: "Fleet live", dot: "#22d3ee" },
  { id: "fleet", label: "Fleet & Gate", dot: "#5b8cff" },
  { id: "canteen", label: "Kantin", dot: "#34d399" },
  { id: "atk", label: "ATK", dot: "#fbbf24" },
  { id: "nc", label: "Pelanggaran / NC", dot: "#fb7185" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<Status, string> = { baik: "Baik", perhatian: "Perhatian", kritis: "Kritis", na: "Belum ada data" };
const STATUS_COLOR: Record<Status, string> = { baik: "#34d399", perhatian: "#fbbf24", kritis: "#fb7185", na: "#5b6b94" };
const AREA_TAB: Record<string, TabId> = { fleet: "fleet", canteen: "canteen", atk: "atk", nc: "nc" };
const pad = (n: number) => String(n).padStart(2, "0");

export default function CommandCenterPage() {
  const [snap, setSnap] = useState<FmSnapshot | null>(null);
  const [nc, setNc] = useState<NcBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("rapor");
  const [auto, setAuto] = useState(true);
  const [sec, setSec] = useState(25);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState<Date | null>(null);
  const [fs, setFs] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* parameter URL */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
    if (q.get("rotate") === "0") setAuto(false);
    const sc = Number(q.get("sec"));
    if (sc >= 8 && sc <= 600) setSec(sc);
    setNow(new Date());
  }, []);

  const load = useCallback(async () => {
    const [a, b] = await Promise.allSettled([getFmSnapshot(), getNcBoard()]);
    if (a.status === "fulfilled") { setSnap(a.value); setError(null); setLoadedAt(Date.now()); }
    else setError(a.reason instanceof Error ? a.reason.message : "Gagal memuat data");
    if (b.status === "fulfilled") setNc(b.value);
  }, []);
  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  /* jam + rotasi */
  useEffect(() => {
    const iv = setInterval(() => { setNow(new Date()); setTick((x) => x + 1); }, 1000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!auto || tick < sec) return;
    setTick(0);
    setTab((cur) => TABS[(TABS.findIndex((x) => x.id === cur) + 1) % TABS.length].id);
  }, [tick, auto, sec]);
  const pick = (id: TabId) => { setTab(id); setTick(0); };

  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const minute = now ? Math.floor(now.getTime() / 60000) : 0;
  const v: FmView | null = useMemo(() => (snap ? computeFm(snap, nc, Date.now()) : null), [snap, nc, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const ago = loadedAt && now ? Math.max(0, Math.round((now.getTime() - loadedAt) / 1000)) : null;

  return (
    <div className={s.cc} ref={rootRef}>
      <style>{`html{font-size:clamp(10px,min(0.9vw,1.6vh),30px)}@media (max-width:900px){html{font-size:13px!important}}body{margin:0;background:#050b1c}`}</style>
      <header className={s.bar}>
        <div className={s.brand}>
          <img className={s.logo} src="/logo.png" alt="CIKOPS FM" />
          <div>
            <div className={s.bName}>FM Command Center</div>
            <div className={s.bSub}>Facility Management · Plant Cikarang &amp; Pasar Rebo</div>
          </div>
        </div>
        <span className={s.grow} />
        <div className={s.tools}>
          <span className={s.live}><i />Live{ago !== null && <span>· {ago < 5 ? "baru saja" : ago < 60 ? `${ago} dtk` : `${Math.round(ago / 60)} mnt`}</span>}</span>
          <button type="button" className={s.tbtn} onClick={() => { setAuto((a) => !a); setTick(0); }} aria-pressed={auto}>
            <Icon name="clock" size={15} />{auto ? "Jeda rotasi" : "Putar otomatis"}
          </button>
          <button type="button" className={`${s.tbtn} ${s.hideSm}`} onClick={toggleFs}>
            <Icon name={fs ? "shrink" : "expand"} size={15} />{fs ? "Keluar penuh" : "Layar penuh"}
          </button>
          {!fs && <Link href="/dashboard" className={`${s.tbtn} ${s.hideSm}`}><Icon name="back" size={15} />Dashboard</Link>}
          <div className={s.clock}>
            <b>{now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : "--:--:--"}</b>
            <small>{now ? now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}</small>
          </div>
        </div>
      </header>

      <nav className={s.tabs} aria-label="Halaman">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`${s.tab} ${tab === t.id ? s.tabOn : ""}`} onClick={() => pick(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <i className={s.tabDot} style={{ background: t.dot }} />{t.label}
          </button>
        ))}
      </nav>
      <div className={s.prog} aria-hidden="true"><span style={{ width: `${auto ? Math.min(100, (tick / sec) * 100) : 0}%` }} /></div>

      {tab === "ops" ? (
        <div className={s.body} style={{ padding: 0 }}><OpsBoard embedded /></div>
      ) : (
        <main className={s.body}>
          {error && <div className={s.note}>{error}{snap ? " — menampilkan data terakhir." : ""}</div>}
          {!v ? <div className={s.empty}>{error ? "" : "Memuat data…"}</div> : (
            <>
              {tab === "rapor" && <Rapor v={v} onOpen={pick} />}
              {tab === "fleet" && <Fleet v={v} />}
              {tab === "canteen" && <Canteen v={v} />}
              {tab === "atk" && <Atk v={v} />}
              {tab === "nc" && <Nc v={v} />}
            </>
          )}
        </main>
      )}
    </div>
  );
}

/* ════════════════ komponen kecil ════════════════ */
function Pill({ st, children }: { st: Status | "info"; children?: React.ReactNode }) {
  return <span className={`${s.pill} ${s["s_" + st]}`}>{children ?? STATUS_LABEL[st as Status]}</span>;
}
function Bars({ bars, height = "9rem", showVal = true }: { bars: Bar[]; height?: string; showVal?: boolean }) {
  const max = Math.max(...bars.map((b) => b.value), 0) * 1.08 || 1;
  return (
    <div className={s.bars} style={{ height }}>
      {bars.map((b, i) => (
        <div key={i} className={s.bcol} title={`${b.label}: ${b.display}`}>
          {showVal && <span className={s.bv}>{b.value ? b.display : ""}</span>}
          <div className={`${s.bfill} ${b.tone ? s["t_" + b.tone] : b.highlight ? s.bHi : ""}`} style={{ height: `${Math.max(1.5, (b.value / max) * 100)}%` }} />
          <span className={s.bl}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}
function Meter({ name, value, frac, color = "#5b8cff" }: { name: string; value: string; frac: number; color?: string }) {
  return (
    <div className={s.meter}>
      <div className={s.meterTop}><b>{name}</b><span className={s.muted}>{value}</span></div>
      <div className={s.track}><span style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: color }} /></div>
    </div>
  );
}
function Kpi({ label, value, sub, c }: { label: string; value: string; sub: string; c: string }) {
  return <div className={`${s.card} ${s.kpi}`} style={{ ["--c" as string]: c }}><div className={s.lbl}>{label}</div><div className={s.num}>{value}</div><div className={s.kpiSub}>{sub}</div></div>;
}
const fill = { display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: "8rem" } as const;
function Chart({ title, note, bars }: { title: string; note?: string; bars: Bar[] }) {
  return (
    <div className={`${s.card} ${s.chart}`}>
      <div className={s.cardHead}><span className={s.lbl}>{title}</span>{note && <small>{note}</small>}</div>
      <div className={s.flex1} style={fill}><Bars bars={bars} height="100%" /></div>
    </div>
  );
}

function AreaTile({ a, onOpen }: { a: AreaCard; onOpen: (t: TabId) => void }) {
  const max = Math.max(1, ...a.spark);
  return (
    <button type="button" className={`${s.card} ${s.area}`} style={{ ["--c" as string]: STATUS_COLOR[a.status] }} onClick={() => onOpen(AREA_TAB[a.key] ?? "rapor")}>
      <div className={s.cardHead}><span className={s.lbl}>{a.name}</span><Pill st={a.status} /></div>
      <div className={s.areaVal}>
        <div>
          <div className={s.num}>{a.today}</div>
          <div className={s.areaUnit}>{a.todayUnit}</div>
        </div>
        <div className={s.areaMonth}>
          <b>{a.month}</b>
          <span>{a.monthUnit}</span>
        </div>
      </div>
      <div className={s.spark} aria-hidden="true">{a.spark.map((x, i) => <span key={i} style={{ height: `${Math.max(4, (x / max) * 100)}%` }} />)}</div>
      <p className={s.story}>{a.story}</p>
    </button>
  );
}

/* ════════════════ 1 · RINGKASAN ════════════════ */
function Rapor({ v, onOpen }: { v: FmView; onOpen: (t: TabId) => void }) {
  const deg = v.health === null ? 0 : (v.health / 100) * 360;
  return (
    <div className={s.rapor}>
      <div className={s.col}>
        <div className={s.top2}>
          <div className={`${s.card} ${s.health}`}>
            <div className={s.ring} style={{ background: `conic-gradient(${STATUS_COLOR[v.healthStatus]} 0 ${deg}deg, rgba(255,255,255,.08) ${deg}deg 360deg)` }}>
              <div className={s.ringIn}><div><div className={s.num} style={{ fontSize: "2.4rem" }}>{v.health ?? "–"}</div><div className={s.muted} style={{ fontSize: ".7rem" }}>dari 100</div></div></div>
            </div>
            <div className={s.col} style={{ gap: ".4rem" }}>
              <div className={s.lbl}>Indeks FM hari ini</div>
              <div className={s.disp} style={{ fontSize: "1.35rem", fontWeight: 700 }}>{v.healthStatus === "baik" ? "Operasional berjalan baik" : v.healthStatus === "perhatian" ? "Ada area yang perlu perhatian" : v.healthStatus === "kritis" ? "Perlu tindakan segera" : "Menunggu data"}</div>
              <div className={s.muted} style={{ fontSize: ".78rem" }}>Rata-rata status area: Baik 100 · Perhatian 70 · Kritis 40</div>
            </div>
          </div>
          <div className={s.card}>
            <div className={s.lbl}>{v.todayLabel} · bulan berjalan {v.monthLabel}</div>
            <p className={s.summary} style={{ margin: 0 }}>{v.summary} <b>{v.summary2}</b></p>
          </div>
        </div>
        <div className={`${s.areas} ${s.areas2}`}>
          {v.areas.map((a) => <AreaTile key={a.key} a={a} onOpen={onOpen} />)}
        </div>
      </div>
      <div className={s.col}>
        <div className={`${s.card} ${s.flex1}`}>
          <div className={s.cardHead}><span className={s.lbl}>Perlu perhatian</span><Pill st={v.attention.some((x) => x.level === "kritis") ? "kritis" : v.attention.length ? "perhatian" : "baik"}>{v.attention.length} item</Pill></div>
          {v.attention.length === 0 ? <div className={s.empty}>Tidak ada yang perlu ditindaklanjuti.</div> : (
            <ul className={s.list}>
              {v.attention.slice(0, 9).map((x, i) => (
                <li key={i} className={s.li}><Pill st={x.level === "info" ? "info" : x.level}>{x.level === "kritis" ? "Kritis" : x.level === "perhatian" ? "Perhatian" : "Info"}</Pill><span>{x.text}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${s.card} ${s.soon}`}>
          <div className={s.cardHead}><span className={s.lbl}>Tamu &amp; visitor hari ini</span><Pill st="na">Segera</Pill></div>
          <div className={s.muted} style={{ fontSize: ".85rem" }}>Tampil otomatis setelah modul Receptionist aktif.</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ 3 · FLEET & GATE ════════════════ */
function Fleet({ v }: { v: FmView }) {
  const f = v.fleet, g = v.gate;
  return (
    <>
      <div className={s.kpis}>
        <Kpi label="Tugas driver hari ini" value={nf(f.today)} sub={`${nf(f.doneToday)} selesai · ${nf(f.month)} tugas bulan ini`} c="#5b8cff" />
        <Kpi label="Selesai di hari yang sama" value={pct(f.sameDayPct, 0)} sub={`bulan ini · target ≥ ${TARGET.sameDayOk}%`} c={f.sameDayPct !== null && f.sameDayPct < TARGET.sameDayOk ? "#fbbf24" : "#34d399"} />
        <Kpi label="Pergerakan gate hari ini" value={nf(g.today)} sub={`${nf(g.month)} bulan ini · rata-rata trip ${fmtMin(g.avgTrip)}`} c="#22d3ee" />
        <Kpi label="Sedang di luar" value={nf(g.open)} sub={g.longOpen.length ? `${g.longOpen.length} lebih dari ${TARGET.gateLongHours} jam` : `tidak ada yang > ${TARGET.gateLongHours} jam`} c={g.longOpen.length ? "#fb7185" : "#34d399"} />
      </div>
      <Chart title={`Tugas driver per hari · ${v.monthLabel}`} note={`total ${nf(f.month)} tugas`} bars={f.daily} />
      <div className={s.grid3}>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Gate per jam · hari ini</span></div>
          <div className={s.flex1} style={fill}><Bars bars={g.hours} height="100%" /></div>
          {g.longOpen.length > 0 && <ul className={s.list}>{g.longOpen.slice(0, 3).map((x, i) => <li key={i} className={s.li}><Pill st="perhatian">{fmtMin(x.mins)}</Pill><span className={s.plate}>{x.nopol ?? "—"}</span><span className={s.muted}>{x.plant === "CIK" ? "di luar" : "di dalam CIK"}</span></li>)}</ul>}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Utilisasi kendaraan · bulan ini</span><small>rata-rata {pct(f.utilAvg, 0)}</small></div>
          {f.util.length === 0 ? <div className={s.empty}>Belum ada data.</div> : f.util.map((u) => <Meter key={u.nopol} name={u.nopol} value={`${pct(u.pct, 0)} · ${u.trips} tugas`} frac={u.pct / 100} color={u.pct < 40 ? "#fbbf24" : "#5b8cff"} />)}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Dokumen kendaraan · 60 hari ke depan</span></div>
          {f.docs.length === 0 ? <div className={s.empty}>Tidak ada dokumen yang jatuh tempo.</div> : (
            <table className={s.tbl}>
              <thead><tr><th>Kendaraan</th><th>Dokumen</th><th>Sisa</th></tr></thead>
              <tbody>{f.docs.map((d, i) => <tr key={i}><td className={s.plate}>{d.nopol}</td><td>{d.doc}</td><td><Pill st={d.days <= TARGET.docCritDays ? "kritis" : d.days <= TARGET.docWarnDays ? "perhatian" : "baik"}>{d.days < 0 ? `lewat ${-d.days} hr` : d.days === 0 ? "hari ini" : `${d.days} hari`}</Pill></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

/* ════════════════ 4 · KANTIN ════════════════ */
function Canteen({ v }: { v: FmView }) {
  const c = v.canteen;
  const effC = (e: number | null) => (e === null ? "#5b6b94" : e >= TARGET.canteenOk ? "#34d399" : e >= TARGET.canteenWarn ? "#fbbf24" : "#fb7185");
  const lastLbl = c.lastDate ? new Date(c.lastDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
  return (
    <>
      <div className={s.kpis}>
        <Kpi label="Efisiensi hari ini" value={pct(c.effToday, 1)} sub={c.hasToday ? "(order − sisa) ÷ order" : "laporan hari ini belum diinput"} c={effC(c.effToday)} />
        <Kpi label="Efisiensi bulan ini" value={pct(c.effMonth, 1)} sub={`target ≥ ${TARGET.canteenOk}%`} c={effC(c.effMonth)} />
        <Kpi label="Porsi dipesan bulan ini" value={nf(c.orderMonth)} sub="snack + makan, 3 shift" c="#5b8cff" />
        <Kpi label="Sisa bulan ini" value={nf(c.leftMonth)} sub={c.orderMonth ? `${pct((c.leftMonth / c.orderMonth) * 100, 1)} dari order` : "—"} c="#fbbf24" />
      </div>
      <div className={s.grid2b}>
        <Chart title={`Efisiensi per hari · ${v.monthLabel}`} note={`hijau ≥ ${TARGET.canteenOk}% · kuning ≥ ${TARGET.canteenWarn}%`} bars={c.daily} />
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Per shift · {c.hasToday ? "hari ini" : lastLbl ? `laporan terakhir ${lastLbl}` : "—"}</span></div>
          {c.shifts.map((x, i) => (
            <div key={i} className={s.shift}>
              <b>Shift {i + 1}</b>
              <span><small>Order</small>{nf(x.order)}</span>
              <span><small>Sisa</small>{nf(x.left)}</span>
              <span><small>Sisa bln ini</small>{pct(x.leftPctMonth, 1)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ════════════════ 5 · ATK ════════════════ */
function Atk({ v }: { v: FmView }) {
  const a = v.atk;
  const out = a.critical.filter((r) => Number(r.stok) <= 0).length;
  return (
    <>
      <div className={s.kpis}>
        <Kpi label="Keluar hari ini" value={nf(a.today)} sub="unit" c="#fbbf24" />
        <Kpi label="Keluar bulan ini" value={nf(a.month)} sub={`unit · ${v.monthLabel}`} c="#5b8cff" />
        <Kpi label="Stok kritis" value={nf(a.critical.length)} sub={`cukup < ${TARGET.atkCoverDays} hari`} c={a.critical.length ? "#fbbf24" : "#34d399"} />
        <Kpi label="Stok habis" value={nf(out)} sub="perlu pengadaan" c={out ? "#fb7185" : "#34d399"} />
      </div>
      <Chart title={`ATK keluar per hari · ${v.monthLabel}`} note={`total ${nf(a.month)} unit`} bars={a.daily} />
      <div className={s.grid3}>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Stok kritis</span></div>
          {a.critical.length === 0 ? <div className={s.empty}>Semua item aman.</div> : (
            <table className={s.tbl}>
              <thead><tr><th>Item</th><th>Stok</th><th>Cukup</th></tr></thead>
              <tbody>{a.critical.map((r, i) => <tr key={i}><td>{r.nama}</td><td>{nf(Number(r.stok))} {r.satuan}</td><td><Pill st={Number(r.stok) <= 0 ? "kritis" : "perhatian"}>{Number(r.stok) <= 0 ? "habis" : r.cover === null ? "–" : `${nf(Number(r.cover), 0)} hari`}</Pill></td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Item keluar hari ini</span></div>
          {a.todayItems.length === 0 ? <div className={s.empty}>Belum ada pengambilan hari ini.</div> : a.todayItems.map((d) => <Meter key={d.k} name={d.k} value={`${nf(Number(d.n))} unit`} frac={Number(d.n) / Math.max(1, Number(a.todayItems[0].n))} color="#fbbf24" />)}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Per departemen · bulan ini</span></div>
          {a.depts.length === 0 ? <div className={s.empty}>Belum ada pemakaian bulan ini.</div> : a.depts.map((d) => <Meter key={d.k} name={d.k} value={`${nf(Number(d.n))} unit`} frac={Number(d.n) / Math.max(1, Number(a.depts[0].n))} />)}
        </div>
      </div>
    </>
  );
}

/* ════════════════ 6 · PELANGGARAN / NC ════════════════ */
function Nc({ v }: { v: FmView }) {
  const n = v.nc;
  if (!n.connected) return <div className={s.card}><div className={s.lbl}>Pelanggaran / NC</div><div className={s.empty}>Data pelanggaran dari G-C (Security Desk) belum tersambung. Pastikan environment variable GC_* sudah diisi di Vercel.</div></div>;
  return (
    <>
      <div className={s.kpis}>
        <Kpi label="NC hari ini" value={nf(n.today)} sub="laporan diterima (Accept)" c={n.today >= TARGET.ncTodayCrit ? "#fb7185" : n.today ? "#fbbf24" : "#34d399"} />
        <Kpi label="NC bulan ini" value={nf(n.month)} sub={v.monthLabel} c="#fb7185" />
        <Kpi label="Total temuan" value={nf(n.temuan)} sub="satu laporan bisa > 1 temuan" c="#a78bfa" />
        <Kpi label="Transporter terlibat" value={nf(n.transCount)} sub="bulan ini" c="#5b8cff" />
      </div>
      <Chart title={`NC per hari · ${v.monthLabel}`} note={`total ${nf(n.month)} laporan`} bars={n.daily} />
      <div className={s.grid3}>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Terbaru</span></div>
          {n.recent.length === 0 ? <div className={s.empty}>Tidak ada pelanggaran bulan ini.</div> : (
            <ul className={s.list}>
              {n.recent.map((x, i) => (
                <li key={i} className={s.li}>
                  <span className={s.liTime}>{x.d === v.today ? (x.jam ?? "Hari ini") : new Date(x.d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
                  <span><b>{x.transporter}</b><br /><span className={s.muted}>{x.jenis.join(", ") || "—"}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Jenis temuan · bulan ini</span></div>
          {n.jenis.length === 0 ? <div className={s.empty}>—</div> : n.jenis.map((j) => <Meter key={j.k} name={j.k} value={`${j.n}`} frac={j.n / Math.max(1, n.jenis[0].n)} color="#fb7185" />)}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Transporter · bulan ini</span></div>
          {n.trans.length === 0 ? <div className={s.empty}>—</div> : n.trans.map((j) => <Meter key={j.k} name={j.k} value={`${j.n} laporan`} frac={j.n / Math.max(1, n.trans[0].n)} color={j.n >= 3 ? "#fbbf24" : "#5b8cff"} />)}
        </div>
      </div>
    </>
  );
}
