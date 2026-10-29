"use client";

/**
 * /dashboard-viewonly — FM COMMAND CENTER (tanpa login, hanya lihat).
 * Layar TV kantor: data BERJALAN (hari ini + total bulan berjalan), berganti otomatis.
 *   1 Ringkasan  2 Fleet live (papan driver)  3 Fleet & Gate  4 TGA  5 Kantin  6 ATK  7 Pelanggaran / NC  8 Receptionist
 * Tanpa data bernominal (Rp) & tanpa nama driver — aman untuk layar publik.
 * Data: RPC get_fm_snapshot (migrasi 028) + /api/gc-nc?board=1, polling 60 dtk.
 * URL: ?tab=nc (mulai di tab tertentu), ?rotate=0 (tanpa rotasi), ?sec=30 (lama rotasi, detik).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { getFmSnapshot, getNcBoard, getRcpBoard, getTgaBoard } from "@/lib/fm/api";
import { computeFm, fmtMin, nf, pct, TARGET, type AreaCard, type Bar, type FmSnapshot, type FmView, type NcBoard, type RcpBoard, type Status, type TgaBoard } from "@/lib/fm/model";
import OpsBoard from "./OpsBoard";
import s from "./fm.module.css";
import { plantFull, plantShort } from "@/lib/brand";

const POLL_MS = 60000;
const THEME_KEY = "cikops_cc_theme";
const TABS = [
  { id: "rapor", label: "Ringkasan hari ini", dot: "#5b8cff" },
  { id: "ops", label: "Fleet live", dot: "#22d3ee" },
  { id: "fleet", label: "Fleet & Gate", dot: "#5b8cff" },
  { id: "tga", label: "TGA", dot: "#fb923c" },
  { id: "canteen", label: "Kantin", dot: "#34d399" },
  { id: "atk", label: "ATK", dot: "#fbbf24" },
  { id: "nc", label: "Pelanggaran / NC", dot: "#fb7185" },
  { id: "rcp", label: "Receptionist", dot: "#a78bfa" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<Status, string> = { baik: "Baik", perhatian: "Perhatian", kritis: "Kritis", na: "Belum ada data" };
const STATUS_COLOR: Record<Status, string> = { baik: "var(--ok)", perhatian: "var(--warn)", kritis: "var(--bad)", na: "var(--na)" };
const AREA_TAB: Record<string, TabId> = { fleet: "fleet", canteen: "canteen", atk: "atk", nc: "nc" };
const pad = (n: number) => String(n).padStart(2, "0");

export default function CommandCenterPage() {
  const [snap, setSnap] = useState<FmSnapshot | null>(null);
  const [nc, setNc] = useState<NcBoard | null>(null);
  const [rcp, setRcp] = useState<RcpBoard | null>(null);
  const [tga, setTga] = useState<TgaBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("rapor");
  const [auto, setAuto] = useState(true);
  const [sec, setSec] = useState(25);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState<Date | null>(null);
  const [fs, setFs] = useState(false);
  const [light, setLight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* parameter URL */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
    if (q.get("rotate") === "0") setAuto(false);
    const sc = Number(q.get("sec"));
    if (sc >= 8 && sc <= 600) setSec(sc);
    // Tema: ?theme=light|dark → pilihan tersimpan di layar ini → ikut tema dashboard
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* mode privat */ }
    const th = q.get("theme") ?? saved;
    setLight(th ? th === "light" : document.documentElement.getAttribute("data-theme") !== "dark");
    setNow(new Date());
  }, []);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.allSettled([getFmSnapshot(), getNcBoard(), getRcpBoard(), getTgaBoard()]);
    if (c.status === "fulfilled") setRcp(c.value);
    if (d.status === "fulfilled") setTga(d.value);
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
  const toggleTheme = () => setLight((l) => {
    try { localStorage.setItem(THEME_KEY, l ? "dark" : "light"); } catch { /* mode privat */ }
    return !l;
  });
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const minute = now ? Math.floor(now.getTime() / 60000) : 0;
  const v: FmView | null = useMemo(() => (snap ? computeFm(snap, nc, Date.now(), rcp, tga) : null), [snap, nc, rcp, tga, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const ago = loadedAt && now ? Math.max(0, Math.round((now.getTime() - loadedAt) / 1000)) : null;

  return (
    <div className={`${s.cc} ${light ? s.light : ""}`} ref={rootRef}>
      <style>{`html{font-size:clamp(14px,min(1.04vw,1.85vh),32px)}@media (max-width:899px){html{font-size:14px!important}}body{margin:0;background:${light ? "#f3f5fa" : "#060b19"}}`}</style>
      <header className={s.bar}>
        <div className={s.brand}>
          <img className={s.logo} src="/logo.png" alt="CIKOPS FM" />
          <div>
            <div className={s.bName}>FM Command Center</div>
            <div className={s.bSub}>Facility Management · {plantFull("CIK")} &amp; {plantShort("PRB")}</div>
          </div>
        </div>
        <span className={s.grow} />
        <div className={s.tools}>
          <span className={s.live}><i />{ago === null ? "Live" : ago < 5 ? "Live · baru saja" : ago < 60 ? `Live · ${ago} dtk` : `Live · ${Math.round(ago / 60)} mnt`}</span>
          <button type="button" className={`${s.iconBtn} ${auto ? s.iconOn : ""}`} onClick={() => { setAuto((a) => !a); setTick(0); }} aria-pressed={auto} title={auto ? "Jeda rotasi halaman" : "Putar halaman otomatis"}>
            <Icon name="clock" size={16} />
          </button>
          <button type="button" className={s.iconBtn} onClick={toggleTheme} title={light ? "Tema gelap" : "Tema terang"}>
            <Icon name={light ? "moon" : "sun"} size={16} />
          </button>
          <button type="button" className={`${s.iconBtn} ${s.hideSm}`} onClick={toggleFs} title={fs ? "Keluar layar penuh" : "Layar penuh"}>
            <Icon name={fs ? "shrink" : "expand"} size={16} />
          </button>
          {!fs && <Link href="/dashboard" className={`${s.iconBtn} ${s.hideSm}`} title="Kembali ke dashboard"><Icon name="back" size={16} /></Link>}
          <div className={s.clock}>
            <b>{now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--"}</b>
            <small>{now ? now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }) : ""}</small>
          </div>
        </div>
      </header>

      <div className={s.nav}>
        <nav className={s.tabs} aria-label="Halaman">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`${s.tab} ${tab === t.id ? s.tabOn : ""}`} onClick={() => pick(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <i className={s.tabDot} style={{ background: t.dot }} />{t.label}
              {tab === t.id && auto && <span className={s.tabProg} aria-hidden="true"><span style={{ width: `${Math.min(100, (tick / sec) * 100)}%` }} /></span>}
            </button>
          ))}
        </nav>
      </div>

      {tab === "ops" ? (
        <div className={s.body} style={{ padding: 0 }}><OpsBoard embedded light={light} /></div>
      ) : (
        <main className={s.body} key={tab}>
          {error && <div className={s.note}>{error}{snap ? " — menampilkan data terakhir." : ""}</div>}
          {!v ? <div className={s.empty}>{error ? "" : "Memuat data…"}</div> : (
            <>
              {tab === "rapor" && <Rapor v={v} onOpen={pick} />}
              {tab === "fleet" && <Fleet v={v} />}
              {tab === "canteen" && <Canteen v={v} />}
              {tab === "atk" && <Atk v={v} />}
              {tab === "nc" && <Nc v={v} />}
              {tab === "rcp" && <Rcp v={v} />}
              {tab === "tga" && <Tga v={v} />}
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
/** Lebar elemen (px) — dipakai grafik supaya label tidak saling menimpa. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
/** Daftar yang tidak muat di layar TV bergulir pelan sendiri (berhenti sebentar di ujung, berhenti saat disorot). */
function useAutoScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let dir = 1, pause = 75;
    const iv = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight + 2 || el.matches(":hover")) return;
      if (pause > 0) { pause--; return; }
      el.scrollTop += dir;
      if (dir > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { dir = -1; pause = 75; }
      else if (dir < 0 && el.scrollTop <= 0) { dir = 1; pause = 75; }
    }, 40);
    return () => clearInterval(iv);
  }, []);
  return ref;
}
const remPx = () => (typeof window === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

/** Grafik batang. Angka di atas batang hanya tampil bila muat (bila tidak: hanya hari ini / batang
 *  yang disorot); label sumbu dijarangkan otomatis supaya tidak bertumpuk. */
function Bars({ bars, height = "9rem", showVal = true }: { bars: Bar[]; height?: string; showVal?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(...bars.map((b) => b.value), 0) * 1.12 || 1;
  const rem = remPx();
  const per = bars.length ? width / bars.length : 0;
  const charPx = 0.62 * rem * 0.78;
  const valW = Math.max(...bars.map((b) => (b.value ? b.display.length : 0)), 1) * charPx + 6;
  const lblW = Math.max(...bars.map((b) => b.label.length), 1) * charPx + 8;
  const allVals = showVal && width > 0 && per >= valW;
  const step = width > 0 ? Math.max(1, Math.ceil(lblW / Math.max(1, per))) : 1;
  return (
    <div ref={ref} className={s.bars} style={{ height }}>
      {bars.map((b, i) => {
        const showV = showVal && b.value > 0 && (allVals || b.highlight);
        const showL = i % step === 0 || i === bars.length - 1 && (bars.length - 1) % step >= step / 2;
        return (
          <div key={i} className={s.bcol} title={`${b.label}: ${b.display}`}>
            <span className={s.bv}>{showV ? b.display : ""}</span>
            <div className={`${s.bfill} ${b.tone ? s["t_" + b.tone] : b.highlight ? s.bHi : ""}`} style={{ height: `${Math.max(2, (b.value / max) * 100)}%` }} />
            <span className={s.bl}>{showL ? b.label : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
function Meter({ name, value, frac, color }: { name: string; value: string; frac: number; color?: string }) {
  return (
    <div className={s.meter}>
      <div className={s.meterTop}><b>{name}</b><span className={s.muted}>{value}</span></div>
      <div className={s.track}><span style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, ...(color ? { background: color } : {}) }} /></div>
    </div>
  );
}
/** Baris KPI halaman detail: satu kartu, empat angka dipisah garis tipis. */
function KpiStrip({ items }: { items: { label: string; value: string; sub: string; c: string }[] }) {
  return (
    <div className={`${s.card} ${s.kpiStrip}`}>
      {items.map((k) => (
        <div key={k.label} className={s.kpi} style={{ ["--c" as string]: k.c }}>
          <span className={s.lbl}><i />{k.label}</span>
          <span className={s.num}>{k.value}</span>
          <span className={s.kpiSub}>{k.sub}</span>
        </div>
      ))}
    </div>
  );
}
function Chart({ title, note, bars, flex }: { title: string; note?: string; bars: Bar[]; flex?: number }) {
  return (
    <div className={`${s.card} ${s.chart}`} style={flex ? { flex } : undefined}>
      <div className={s.cardHead}><span className={s.title}>{title}</span>{note && <small>{note}</small>}</div>
      <div className={s.chartBody}><Bars bars={bars} height="100%" /></div>
    </div>
  );
}
function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const ref = useAutoScroll<HTMLDivElement>();
  return (
    <div className={s.card}>
      <div className={s.cardHead}><span className={s.title}>{title}</span>{note && <small>{note}</small>}</div>
      <div className={s.scroll} ref={ref}>{children}</div>
    </div>
  );
}

/** Grafik mini 14 hari — arahkan kursor / sentuh batang untuk melihat nilainya. */
function Trend({ bars, label }: { bars: Bar[]; label: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const cur = hi ?? bars.length - 1;
  const b = bars[cur];
  return (
    <div className={s.trend} onMouseLeave={() => setHi(null)}>
      <div className={s.trendHead}><span>{label}</span>{b && <b>{b.label} · {b.display}</b>}</div>
      <div className={s.trendBars} role="list">
        {bars.map((x, i) => (
          <span
            key={i} role="listitem" tabIndex={0} aria-label={`${x.label}: ${x.display}`}
            className={`${s.tb} ${x.highlight ? s.tbToday : ""} ${i === cur ? s.tbOn : ""}`}
            style={{ height: `${Math.max(5, (x.value / max) * 100)}%` }}
            onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} onClick={(e) => { e.stopPropagation(); setHi(i); }}
          />
        ))}
      </div>
    </div>
  );
}

function AreaTile({ a, onOpen, i }: { a: AreaCard; onOpen: (t: TabId) => void; i: number }) {
  const open = () => onOpen(AREA_TAB[a.key] ?? "rapor");
  return (
    <div
      className={`${s.card} ${s.area} ${s.fade}`} style={{ ["--c" as string]: STATUS_COLOR[a.status], animationDelay: `${120 + i * 70}ms` }}
      role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
      aria-label={`${a.name}: ${a.hook}. Buka detail`}
    >
      <div className={s.areaHead}><span className={s.title}>{a.name}</span><Pill st={a.status} /></div>
      <p className={s.hook}>{a.hook}</p>
      <div className={s.areaBody}>
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
        <Trend bars={a.trend} label={a.trendLabel} />
      </div>
      {a.facts.length > 0 && (
        <div className={s.facts}>
          {a.facts.slice(0, 3).map((f, j) => (
            <span key={f.label}>{j > 0 ? " · " : ""}{f.label} <b className={f.tone ? s["f_" + f.tone] : undefined}>{f.value}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVEL_LABEL = { kritis: "Kritis", perhatian: "Perhatian", info: "Info" } as const;
const LEVEL_ST = { kritis: "kritis", perhatian: "perhatian", info: "info" } as const;

/** Perlu tindakan — dikelompokkan per masalah; klik untuk membuka rincian. */
function ActionList({ v, onOpen }: { v: FmView; onOpen: (t: TabId) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const listRef = useAutoScroll<HTMLUListElement>();
  return (
    <div className={`${s.card} ${s.actions} ${s.fade}`} style={{ animationDelay: "80ms" }}>
      <div className={s.cardHead}><span className={s.title}>Perlu tindakan</span><small>{v.groups.length} masalah</small></div>
      <div className={s.levels}>
        {(["kritis", "perhatian", "info"] as const).map((k) => (
          <div key={k} className={`${s.level} ${s["s_" + LEVEL_ST[k]]}`}><b>{v.counts[k]}</b><span>{LEVEL_LABEL[k]}</span></div>
        ))}
      </div>
      {v.groups.length === 0 ? (
        <div className={s.allGood}><Icon name="check" size={22} strokeWidth={2.6} /><div><b>Semua aman</b><small>Tidak ada yang perlu ditindaklanjuti.</small></div></div>
      ) : (
        <ul className={s.groups} ref={listRef}>
          {v.groups.map((g, i) => {
            const key = `${g.area}-${g.level}-${i}`;
            const isOpen = openKey === key;
            return (
              <li key={key} className={`${s.grp} ${s["s_" + LEVEL_ST[g.level]]}`}>
                <button type="button" className={s.grpHead} aria-expanded={g.items.length ? isOpen : undefined}
                  onClick={() => (g.items.length ? setOpenKey(isOpen ? null : key) : onOpen(g.tab as TabId))}>
                  <i />
                  <span className={s.grpText}><small>{g.area}</small><b>{g.title}</b></span>
                  {g.items.length > 0 ? <span className={s.grpN}>{g.items.length}</span> : <span />}
                </button>
                {isOpen && (
                  <div className={s.grpBody}>
                    <ul>{g.items.slice(0, 8).map((x) => <li key={x}>{x}</li>)}</ul>
                    {g.items.length > 8 && <small className={s.muted}>+{g.items.length - 8} lainnya</small>}
                    <button type="button" className={s.linkBtn} onClick={() => onOpen(g.tab as TabId)}>Buka halaman {g.area} →</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ════════════════ 1 · RINGKASAN ════════════════
   Alur: (1) headline — bagaimana FM hari ini, (2) angka hari ini dalam satu baris,
   (3) 4 area: status, angka, tren, (4) daftar tindakan di kolom kanan. */
function Rapor({ v, onOpen }: { v: FmView; onOpen: (t: TabId) => void }) {
  const R = 46, C = 2 * Math.PI * R;
  const frac = v.health === null ? 0 : v.health / 100;
  const col = STATUS_COLOR[v.healthStatus];
  return (
    <div className={s.rapor}>
      <div className={s.col}>
        <div className={`${s.card} ${s.hero} ${s.fade}`} style={{ ["--c" as string]: col }}>
          <svg className={s.heroRing} viewBox="0 0 110 110" role="img" aria-label={`Indeks FM ${v.health ?? "–"} dari 100`}>
            <circle cx="55" cy="55" r={R} fill="none" stroke="currentColor" strokeOpacity=".09" strokeWidth="8" />
            <circle cx="55" cy="55" r={R} fill="none" style={{ stroke: col }} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 55 55)" className={s.heroArc} />
            <text x="55" y="59" textAnchor="middle" className={s.heroVal}>{v.health ?? "–"}</text>
            <text x="55" y="75" textAnchor="middle" className={s.heroSub}>indeks FM</text>
          </svg>
          <div className={s.heroText}>
            <span className={s.lbl}>{v.todayLabel} · bulan berjalan {v.monthLabel}</span>
            <h2 className={s.headline}>{v.headline}</h2>
            <p className={s.headlineSub}>{v.headlineSub}</p>
          </div>
        </div>

        <div className={`${s.card} ${s.strip} ${s.fade}`} style={{ ["--n" as string]: v.pulse.length, animationDelay: "60ms" }}>
          {v.pulse.map((p) => (
            <button key={p.key} type="button" className={s.cell} style={{ ["--c" as string]: p.tone ? STATUS_COLOR[p.tone] : undefined }} onClick={() => onOpen(p.tab as TabId)}>
              <span className={s.lbl}><i />{p.label}</span>
              <b className={s.num}>{p.value}</b>
              <span>{p.unit}</span>
            </button>
          ))}
        </div>

        <div className={s.areas}>
          {v.areas.map((a, i) => <AreaTile key={a.key} a={a} onOpen={onOpen} i={i} />)}
        </div>
      </div>
      <ActionList v={v} onOpen={onOpen} />
    </div>
  );
}

/* ════════════════ 3 · FLEET & GATE ════════════════ */
const C = { blue: "var(--acc)", cyan: "var(--acc2)", ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", violet: "var(--violet)" };

function Fleet({ v }: { v: FmView }) {
  const f = v.fleet, g = v.gate;
  return (
    <>
      <KpiStrip items={[
        { label: "Tugas driver hari ini", value: nf(f.today), sub: `${nf(f.doneToday)} selesai · ${nf(f.month)} tugas bulan ini`, c: C.blue },
        { label: "Selesai di hari yang sama", value: pct(f.sameDayPct, 0), sub: `bulan ini · target ≥ ${TARGET.sameDayOk}%`, c: f.sameDayPct !== null && f.sameDayPct < TARGET.sameDayOk ? C.warn : C.ok },
        { label: "Pergerakan gate hari ini", value: nf(g.today), sub: `${nf(g.month)} bulan ini · rata-rata trip ${fmtMin(g.avgTrip)}`, c: C.cyan },
        { label: "Sedang di luar", value: nf(g.open), sub: g.longOpen.length ? `${g.longOpen.length} lebih dari ${TARGET.gateLongHours} jam` : `tidak ada yang > ${TARGET.gateLongHours} jam`, c: g.longOpen.length ? C.bad : C.ok },
      ]} />
      <Chart title={`Tugas driver per hari · ${v.monthLabel}`} note={`total ${nf(f.month)} tugas`} bars={f.daily} />
      <div className={s.grid3}>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.title}>Gate per jam · hari ini</span></div>
          <div className={s.chartBody}><Bars bars={g.hours} height="100%" /></div>
          {g.longOpen.length > 0 && <ul className={s.list}>{g.longOpen.slice(0, 3).map((x, i) => <li key={i} className={s.li}><Pill st="perhatian">{fmtMin(x.mins)}</Pill><span className={s.plate}>{x.nopol ?? "—"}</span><span className={s.muted}>{x.plant === "CIK" ? "di luar" : "di dalam CIK"}</span></li>)}</ul>}
        </div>
        <Card title="Utilisasi kendaraan · bulan ini" note={`rata-rata ${pct(f.utilAvg, 0)}`}>
          {f.util.length === 0 ? <div className={s.empty}>Belum ada data.</div> : (
            <div className={s.meters}>{f.util.map((u) => <Meter key={u.nopol} name={u.nopol} value={`${pct(u.pct, 0)} · ${u.trips} tugas`} frac={u.pct / 100} color={u.pct < 40 ? C.warn : undefined} />)}</div>
          )}
        </Card>
        <Card title="Dokumen kendaraan · 60 hari ke depan">
          {f.docs.length === 0 ? <div className={s.empty}>Tidak ada dokumen yang jatuh tempo.</div> : (
            <table className={s.tbl}>
              <thead><tr><th>Kendaraan</th><th>Dokumen</th><th>Sisa</th></tr></thead>
              <tbody>{f.docs.map((d, i) => <tr key={i}><td className={s.plate}>{d.nopol}</td><td>{d.doc}</td><td><Pill st={d.days <= TARGET.docCritDays ? "kritis" : d.days <= TARGET.docWarnDays ? "perhatian" : "baik"}>{d.days < 0 ? `lewat ${-d.days} hr` : d.days === 0 ? "hari ini" : `${d.days} hari`}</Pill></td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

/* ════════════════ 4 · KANTIN — snack & makan terpisah ════════════════ */
/** Ringkasan grafik efisiensi: rata-rata & hari terendah (angka per batang sering tidak muat). */
function effNote(bars: Bar[]) {
  const vals = bars.filter((b) => b.value > 0);
  if (!vals.length) return `target ≥ ${TARGET.canteenOk}%`;
  const avg = vals.reduce((a, b) => a + b.value, 0) / vals.length;
  const low = vals.reduce((a, b) => (b.value < a.value ? b : a));
  return `rata-rata ${pct(avg, 1)} · terendah ${low.display} (tgl ${low.label})`;
}
function Canteen({ v }: { v: FmView }) {
  const c = v.canteen;
  const effC = (e: number | null) => (e === null ? "var(--na)" : e >= TARGET.canteenOk ? C.ok : e >= TARGET.canteenWarn ? C.warn : C.bad);
  const lastLbl = c.lastDate ? new Date(c.lastDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
  const sub = (order: number, left: number, eff: number | null) => (order ? `sisa ${nf(left)} · efisiensi ${pct(eff, 1)}` : "belum ada order");
  return (
    <>
      <KpiStrip items={[
        { label: "Snack hari ini", value: c.hasToday ? nf(c.snack.orderToday) : "–", sub: c.hasToday ? sub(c.snack.orderToday, c.snack.leftToday, c.snack.effToday) : "laporan hari ini belum diinput", c: effC(c.snack.effToday) },
        { label: "Makan hari ini", value: c.hasToday ? nf(c.meal.orderToday) : "–", sub: c.hasToday ? sub(c.meal.orderToday, c.meal.leftToday, c.meal.effToday) : "laporan hari ini belum diinput", c: effC(c.meal.effToday) },
        { label: "Snack bulan ini", value: nf(c.snack.orderMonth), sub: sub(c.snack.orderMonth, c.snack.leftMonth, c.snack.effMonth), c: effC(c.snack.effMonth) },
        { label: "Makan bulan ini", value: nf(c.meal.orderMonth), sub: sub(c.meal.orderMonth, c.meal.leftMonth, c.meal.effMonth), c: effC(c.meal.effMonth) },
      ]} />
      {!c.split && <div className={s.note}>Data snack &amp; makan terpisah belum tersedia — jalankan supabase/01_dasar.sql (bagian 029).</div>}
      <div className={s.grid3}>
        <Chart title="Efisiensi snack per hari" note={effNote(c.snack.daily)} bars={c.snack.daily} />
        <Chart title="Efisiensi makan per hari" note={effNote(c.meal.daily)} bars={c.meal.daily} />
        <Card title="Per shift" note={c.hasToday ? "hari ini" : lastLbl ? `laporan ${lastLbl}` : "—"}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={s.shift}>
              <b>Shift {i + 1}</b>
              <span><small>Snack</small>{nf(c.snack.shifts[i].order)}</span>
              <span><small>Sisa</small>{nf(c.snack.shifts[i].left)}</span>
              <span><small>Makan</small>{nf(c.meal.shifts[i].order)}</span>
              <span><small>Sisa</small>{nf(c.meal.shifts[i].left)}</span>
            </div>
          ))}
        </Card>
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
      <KpiStrip items={[
        { label: "Keluar hari ini", value: nf(a.today), sub: "unit", c: C.warn },
        { label: "Keluar bulan ini", value: nf(a.month), sub: `unit · ${v.monthLabel}`, c: C.blue },
        { label: "Stok kritis", value: nf(a.critical.length), sub: `cukup < ${TARGET.atkCoverDays} hari`, c: a.critical.length ? C.warn : C.ok },
        { label: "Stok habis", value: nf(out), sub: "perlu pengadaan", c: out ? C.bad : C.ok },
      ]} />
      <Chart title={`ATK keluar per hari · ${v.monthLabel}`} note={`total ${nf(a.month)} unit`} bars={a.daily} />
      <div className={s.grid3}>
        <Card title="Stok kritis" note={a.critical.length ? `${a.critical.length} item` : undefined}>
          {a.critical.length === 0 ? <div className={s.empty}>Semua item aman.</div> : (
            <table className={s.tbl}>
              <thead><tr><th>Item</th><th>Stok</th><th>Cukup</th></tr></thead>
              <tbody>{a.critical.map((r, i) => <tr key={i}><td>{r.nama}</td><td>{nf(Number(r.stok))} {r.satuan}</td><td><Pill st={Number(r.stok) <= 0 ? "kritis" : "perhatian"}>{Number(r.stok) <= 0 ? "habis" : r.cover === null ? "–" : `${nf(Number(r.cover), 0)} hari`}</Pill></td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title="Item keluar hari ini">
          {a.todayItems.length === 0 ? <div className={s.empty}>Belum ada pengambilan hari ini.</div> : (
            <div className={s.meters}>{a.todayItems.map((d) => <Meter key={d.k} name={d.k} value={`${nf(Number(d.n))} unit`} frac={Number(d.n) / Math.max(1, Number(a.todayItems[0].n))} color={C.warn} />)}</div>
          )}
        </Card>
        <Card title="Per departemen · bulan ini">
          {a.depts.length === 0 ? <div className={s.empty}>Belum ada pemakaian bulan ini.</div> : (
            <div className={s.meters}>{a.depts.map((d) => <Meter key={d.k} name={d.k} value={`${nf(Number(d.n))} unit`} frac={Number(d.n) / Math.max(1, Number(a.depts[0].n))} />)}</div>
          )}
        </Card>
      </div>
    </>
  );
}

/* ════════════════ 7 · RECEPTIONIST ════════════════ */
function Rcp({ v }: { v: FmView }) {
  const r = v.rcp;
  if (!r) return <div className={s.empty}>Modul Receptionist belum aktif — jalankan supabase/01_dasar.sql (bagian 031).</div>;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const freePct = r.wifi.slots ? (r.free / r.wifi.slots) * 100 : 0;
  return (
    <>
      <KpiStrip items={[
        { label: "Slot wifi tamu tersedia", value: `${nf(r.free)} / ${nf(r.wifi.slots)}`, sub: `${nf(r.wifi.accounts)} akun berlaku · ${nf(r.wifi.expiring7)} habis ≤ 7 hari`, c: freePct < 15 ? C.bad : freePct < 35 ? C.warn : C.ok },
        { label: "Tamu wifi hari ini", value: nf(r.wifi.guests_today), sub: `${nf(r.wifi.used)} slot sedang dipakai`, c: C.blue },
        { label: "Barang menunggu", value: nf(r.parcels.waiting), sub: `${nf(r.parcels.waiting_in)} masuk · ${nf(r.parcels.waiting_out)} keluar${r.parcels.waiting_old ? ` · ${nf(r.parcels.waiting_old)} > 2 hari` : ""}`, c: r.parcels.waiting_old ? C.warn : C.violet },
        { label: "Booking Induction Room", value: nf(r.bookings.length), sub: `hari ini · ${nf(r.bookings_week)} dalam 7 hari`, c: C.ok },
      ]} />
      <div className={s.grid2}>
        <Card title="Jadwal Induction Room hari ini">
          {r.bookings.length === 0 ? <div className={s.empty}>Ruangan kosong hari ini.</div> : (
            <ul className={s.list}>
              {r.bookings.map((b, i) => {
                const live = toMin(b.start) <= nowMin && nowMin < toMin(b.end), past = toMin(b.end) <= nowMin;
                return (
                  <li key={i} className={s.li} style={{ opacity: past ? 0.5 : 1 }}>
                    <span className={s.liTime} style={{ minWidth: "6.6rem" }}>{b.start}–{b.end}</span>
                    <span style={{ flex: 1 }}>{b.title}{b.attendees ? <span className={s.muted}> · {b.attendees} orang</span> : null}</span>
                    {live && <Pill st="baik">Berlangsung</Pill>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Barang & surat hari ini">
          <div className={s.duo}>
            <div><div className={s.num} style={{ fontSize: "2.6rem" }}>{nf(r.parcels.in_today)}</div><div className={s.areaUnit}>dicatat hari ini</div></div>
            <div><div className={s.num} style={{ fontSize: "2.6rem" }}>{nf(r.parcels.handed_today)}</div><div className={s.areaUnit}>diserahkan hari ini</div></div>
          </div>
          <div style={{ marginTop: "1.4rem" }}>
            <Meter name="Slot wifi terpakai" value={`${nf(r.wifi.used)} dari ${nf(r.wifi.slots)}`} frac={r.wifi.slots ? r.wifi.used / r.wifi.slots : 0} color={freePct < 15 ? C.bad : undefined} />
          </div>
        </Card>
      </div>
    </>
  );
}

/* ════════════════ 4 · TGA (teknisi GA) ════════════════ */
const TGA_ST: Record<string, { label: string; st: Status | "info" }> = {
  baru: { label: "Menunggu", st: "perhatian" }, proses: { label: "Dikerjakan", st: "info" },
  pending: { label: "Pending", st: "na" }, butuh_part: { label: "Butuh part", st: "kritis" },
};
const sinceMin = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0);

function Tga({ v }: { v: FmView }) {
  const t = v.tga;
  if (!t) return <div className={s.empty}>Ringkasan TGA belum aktif — jalankan supabase/04_aplikasi_lapangan.sql (bagian 048).</div>;
  const pool = t.open.filter((x) => x.status === "baru" && x.pool).length;
  const work = t.open.filter((x) => x.status !== "baru").length;
  const maxCat = Math.max(1, ...t.cats.map((c) => c.n));
  const maxTech = Math.max(1, ...t.techs_month.map((c) => c.n));
  return (
    <>
      <KpiStrip items={[
        { label: "Pekerjaan terbuka", value: nf(t.open.length), sub: `${nf(pool)} belum diambil · ${nf(work)} dikerjakan`, c: t.urgent ? C.bad : t.waiting ? C.warn : C.blue },
        { label: "Teknisi available", value: `${nf(t.free)} / ${nf(t.technicians.length)}`, sub: `${nf(t.busy)} sedang busy`, c: t.free ? C.ok : C.warn },
        { label: "Selesai hari ini", value: nf(t.done_today), sub: `${nf(t.in_today)} pekerjaan tercatat hari ini`, c: C.cyan },
        { label: "Selesai bulan ini", value: nf(t.month_done), sub: `dari ${nf(t.month_total)} · rata-rata ${t.avg_min !== null ? fmtMin(t.avg_min) : "–"} / pekerjaan`, c: C.violet },
      ]} />
      <div className={s.grid3}>
        <Card title="Status teknisi" note={`${nf(t.free)} available · ${nf(t.busy)} busy`}>
          {t.technicians.length === 0 ? <div className={s.empty}>Belum ada akun teknisi.</div> : (
            <ul className={s.list}>
              {t.technicians.map((x) => (
                <li key={x.nama} className={s.li} style={{ alignItems: "flex-start" }}>
                  <Pill st={x.busy ? "kritis" : "baik"}>{x.busy ? "Busy" : "Available"}</Pill>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{x.nama}</b>
                    <span className={s.muted} style={{ display: "block" }}>
                      {x.busy ? `${x.ref} · ${x.activity ?? ""}${x.lokasi ? ` · ${x.lokasi}` : ""} · ${fmtMin(sinceMin(x.since))}` : `${nf(x.done_today)} selesai hari ini${x.open ? ` · ${nf(x.open)} antre` : ""}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Pekerjaan terbuka" note={t.open.length ? `${nf(t.open.length)} pekerjaan` : undefined}>
          {t.open.length === 0 ? <div className={s.empty}>Tidak ada pekerjaan terbuka. 👍</div> : (
            <ul className={s.list}>
              {t.open.map((x) => (
                <li key={x.ref} className={s.li} style={{ alignItems: "flex-start" }}>
                  <Pill st={x.urgent && x.status === "baru" ? "kritis" : TGA_ST[x.status]?.st ?? "na"}>{x.urgent ? "Urgent" : TGA_ST[x.status]?.label ?? x.status}</Pill>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{x.activity}</b>
                    <span className={s.muted} style={{ display: "block" }}>
                      {[x.ref, x.lokasi, x.dept, x.status === "baru" ? (x.pool ? "belum diambil" : `menunggu ${x.tga || "teknisi"}`) : x.tga].filter(Boolean).join(" · ")} · {fmtMin(sinceMin(x.status === "baru" ? x.at : x.accepted ?? x.at))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Jenis pekerjaan · ${v.monthLabel}`}>
          {t.cats.length === 0 ? <div className={s.empty}>Belum ada pekerjaan bulan ini.</div> : (
            <div className={s.meters}>
              {t.cats.map((c) => <Meter key={c.k} name={c.k} value={`${nf(c.n)} pekerjaan`} frac={c.n / maxCat} />)}
              {t.techs_month.length > 0 && <div className={s.lbl} style={{ marginTop: ".6rem" }}>Selesai per teknisi</div>}
              {t.techs_month.map((c) => <Meter key={`t-${c.k}`} name={c.k} value={nf(c.n)} frac={c.n / maxTech} color="var(--acc2)" />)}
            </div>
          )}
        </Card>
      </div>
      <Chart title={`Pekerjaan TGA selesai per hari · ${v.monthLabel}`} note={`total ${nf(t.month_done)} selesai`} bars={t.daily} flex={0.6} />
    </>
  );
}

/* ════════════════ 6 · PELANGGARAN / NC ════════════════ */
function Nc({ v }: { v: FmView }) {
  const n = v.nc;
  if (!n.connected) return <Card title="Pelanggaran / NC"><div className={s.empty}>Data pelanggaran dari G-C (Security Desk) belum tersambung. Pastikan environment variable GC_* sudah diisi di Vercel.</div></Card>;
  return (
    <>
      <KpiStrip items={[
        { label: "NC hari ini", value: nf(n.today), sub: "laporan diterima (Accept)", c: n.today >= TARGET.ncTodayCrit ? C.bad : n.today ? C.warn : C.ok },
        { label: "NC bulan ini", value: nf(n.month), sub: v.monthLabel, c: C.bad },
        { label: "Total temuan", value: nf(n.temuan), sub: "satu laporan bisa > 1 temuan", c: C.violet },
        { label: "Transporter terlibat", value: nf(n.transCount), sub: "bulan ini", c: C.blue },
      ]} />
      <Chart title={`NC per hari · ${v.monthLabel}`} note={`total ${nf(n.month)} laporan`} bars={n.daily} />
      <div className={s.grid3}>
        <Card title="Terbaru">
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
        </Card>
        <Card title="Jenis temuan · bulan ini">
          {n.jenis.length === 0 ? <div className={s.empty}>—</div> : <div className={s.meters}>{n.jenis.map((j) => <Meter key={j.k} name={j.k} value={`${j.n}`} frac={j.n / Math.max(1, n.jenis[0].n)} color={C.bad} />)}</div>}
        </Card>
        <Card title="Transporter · bulan ini">
          {n.trans.length === 0 ? <div className={s.empty}>—</div> : <div className={s.meters}>{n.trans.map((j) => <Meter key={j.k} name={j.k} value={`${j.n} laporan`} frac={j.n / Math.max(1, n.trans[0].n)} color={j.n >= 3 ? C.warn : undefined} />)}</div>}
        </Card>
      </div>
    </>
  );
}
