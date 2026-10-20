"use client";

/**
 * /dashboard-viewonly — FM COMMAND CENTER (tanpa login, hanya lihat).
 * Layar TV kantor: data BERJALAN (hari ini + total bulan berjalan), berganti otomatis.
 *   1 Ringkasan  2 Fleet live (papan driver)  3 Fleet & Gate  4 Kantin  5 ATK  6 Pelanggaran / NC  7 Receptionist
 * Tanpa data bernominal (Rp) & tanpa nama driver — aman untuk layar publik.
 * Data: RPC get_fm_snapshot (migrasi 028) + /api/gc-nc?board=1, polling 60 dtk.
 * URL: ?tab=nc (mulai di tab tertentu), ?rotate=0 (tanpa rotasi), ?sec=30 (lama rotasi, detik).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { getFmSnapshot, getNcBoard, getRcpBoard } from "@/lib/fm/api";
import { computeFm, fmtMin, nf, pct, TARGET, type AreaCard, type Bar, type FmSnapshot, type FmView, type NcBoard, type RcpBoard, type Status } from "@/lib/fm/model";
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
  { id: "rcp", label: "Receptionist", dot: "#a78bfa" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<Status, string> = { baik: "Baik", perhatian: "Perhatian", kritis: "Kritis", na: "Belum ada data" };
const STATUS_COLOR: Record<Status, string> = { baik: "#34d399", perhatian: "#fbbf24", kritis: "#fb7185", na: "#5b6b94" };
const AREA_TAB: Record<string, TabId> = { fleet: "fleet", canteen: "canteen", atk: "atk", nc: "nc" };
const pad = (n: number) => String(n).padStart(2, "0");

export default function CommandCenterPage() {
  const [snap, setSnap] = useState<FmSnapshot | null>(null);
  const [nc, setNc] = useState<NcBoard | null>(null);
  const [rcp, setRcp] = useState<RcpBoard | null>(null);
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
    const [a, b, c] = await Promise.allSettled([getFmSnapshot(), getNcBoard(), getRcpBoard()]);
    if (c.status === "fulfilled") setRcp(c.value);
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
  const v: FmView | null = useMemo(() => (snap ? computeFm(snap, nc, Date.now(), rcp) : null), [snap, nc, rcp, minute]); // eslint-disable-line react-hooks/exhaustive-deps
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
              {tab === "rcp" && <Rcp v={v} />}
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
            className={`${s.tb} ${x.tone ? s["t_" + x.tone] : x.highlight ? s.tbToday : ""} ${i === cur ? s.tbOn : ""}`}
            style={{ height: `${Math.max(4, (x.value / max) * 100)}%` }}
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
      className={`${s.card} ${s.area} ${s.rise}`} style={{ ["--c" as string]: STATUS_COLOR[a.status], animationDelay: `${120 + i * 70}ms` }}
      role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
      aria-label={`${a.name}: ${a.hook}. Buka detail`}
    >
      <div className={s.cardHead}><span className={s.lbl}>{a.name}</span><Pill st={a.status} /></div>
      <p className={s.hook}>{a.hook}</p>
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
      {a.facts.length > 0 && (
        <div className={s.facts}>
          {a.facts.map((f) => (
            <span key={f.label} className={`${s.fact} ${f.tone ? s["f_" + f.tone] : ""}`}><small>{f.label}</small><b>{f.value}</b></span>
          ))}
        </div>
      )}
      <Trend bars={a.trend} label={a.trendLabel} />
    </div>
  );
}

const LEVEL_LABEL = { kritis: "Kritis", perhatian: "Perhatian", info: "Info" } as const;

/** Perlu tindakan — dikelompokkan per masalah; klik untuk membuka rincian. */
function ActionList({ v, onOpen }: { v: FmView; onOpen: (t: TabId) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className={`${s.card} ${s.flex1} ${s.rise}`} style={{ animationDelay: "80ms" }}>
      <div className={s.cardHead}><span className={s.lbl}>Perlu tindakan</span><small>{v.groups.length} masalah</small></div>
      <div className={s.lvlRow}>
        {(["kritis", "perhatian", "info"] as const).map((k) => (
          <div key={k} className={`${s.lvl} ${s["s_" + k]}`}><b>{v.counts[k]}</b><span>{LEVEL_LABEL[k]}</span></div>
        ))}
      </div>
      {v.groups.length === 0 ? (
        <div className={s.allGood}><Icon name="check" size={22} strokeWidth={2.6} /><div><b>Semua aman</b><small>Tidak ada yang perlu ditindaklanjuti.</small></div></div>
      ) : (
        <ul className={s.groups}>
          {v.groups.map((g, i) => {
            const key = `${g.area}-${g.level}-${i}`;
            const isOpen = openKey === key;
            return (
              <li key={key} className={`${s.grp} ${s["g_" + g.level]}`}>
                <button type="button" className={s.grpHead} aria-expanded={g.items.length ? isOpen : undefined}
                  onClick={() => (g.items.length ? setOpenKey(isOpen ? null : key) : onOpen(g.tab as TabId))}>
                  <span className={s.grpArea}>{g.area}</span>
                  <span className={s.grpTitle}>{g.title}</span>
                  {g.items.length > 0 && <span className={s.grpN}>{g.items.length}</span>}
                  <span className={`${s.chev} ${isOpen ? s.chevOn : ""}`}><Icon name="arrow" size={14} /></span>
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
      <div className={s.soonLine}><span>Tamu &amp; visitor hari ini</span><Pill st="na">Segera</Pill></div>
    </div>
  );
}

/* ════════════════ 1 · RINGKASAN ════════════════
   Alur cerita: (1) headline — bagaimana FM hari ini, (2) denyut angka hari ini,
   (3) 4 area: satu hook + fakta + tren, (4) daftar tindakan yang dikelompokkan. */
function Rapor({ v, onOpen }: { v: FmView; onOpen: (t: TabId) => void }) {
  const R = 46, C = 2 * Math.PI * R;
  const frac = v.health === null ? 0 : v.health / 100;
  const col = STATUS_COLOR[v.healthStatus];
  return (
    <div className={s.rapor}>
      <div className={s.col}>
        <div className={`${s.card} ${s.hero} ${s.rise}`} style={{ ["--c" as string]: col }}>
          <svg className={s.heroRing} viewBox="0 0 110 110" role="img" aria-label={`Indeks FM ${v.health ?? "–"} dari 100`}>
            <circle cx="55" cy="55" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
            <circle cx="55" cy="55" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 55 55)" className={s.heroArc} />
            <text x="55" y="58" textAnchor="middle" className={s.heroVal}>{v.health ?? "–"}</text>
            <text x="55" y="75" textAnchor="middle" className={s.heroSub}>indeks FM</text>
          </svg>
          <div className={s.heroText}>
            <div className={s.lbl}>{v.todayLabel} · bulan berjalan {v.monthLabel}</div>
            <h2 className={s.headline}>{v.headline}</h2>
            <p className={s.headlineSub}>{v.headlineSub}</p>
          </div>
          <div className={s.heroAreas}>
            {v.areas.map((a) => (
              <button key={a.key} type="button" className={s.dotBtn} style={{ ["--c" as string]: STATUS_COLOR[a.status] }} onClick={() => onOpen(AREA_TAB[a.key] ?? "rapor")} title={a.hook}>
                <i />{a.name.split(" ")[0]}<small>{STATUS_LABEL[a.status]}</small>
              </button>
            ))}
          </div>
        </div>

        <div className={s.pulse} style={{ gridTemplateColumns: `repeat(${v.pulse.length}, minmax(0, 1fr))` }}>
          {v.pulse.map((p, i) => (
            <button key={p.key} type="button" className={`${s.pulseItem} ${s.rise}`} style={{ animationDelay: `${60 + i * 50}ms`, ["--c" as string]: p.tone ? STATUS_COLOR[p.tone] : "#5b8cff" }} onClick={() => onOpen(p.tab as TabId)}>
              <small>{p.label}</small>
              <b className={s.num}>{p.value}</b>
              <span>{p.unit}</span>
            </button>
          ))}
        </div>

        <div className={`${s.areas} ${s.areas2}`}>
          {v.areas.map((a, i) => <AreaTile key={a.key} a={a} onOpen={onOpen} i={i} />)}
        </div>
      </div>
      <div className={s.col}>
        <ActionList v={v} onOpen={onOpen} />
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

/* ════════════════ 4 · KANTIN — snack & makan terpisah ════════════════ */
function Canteen({ v }: { v: FmView }) {
  const c = v.canteen;
  const effC = (e: number | null) => (e === null ? "#5b6b94" : e >= TARGET.canteenOk ? "#34d399" : e >= TARGET.canteenWarn ? "#fbbf24" : "#fb7185");
  const lastLbl = c.lastDate ? new Date(c.lastDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
  const sub = (order: number, left: number, eff: number | null) => (order ? `sisa ${nf(left)} · efisiensi ${pct(eff, 1)}` : "belum ada order");
  return (
    <>
      <div className={s.kpis}>
        <Kpi label="Snack hari ini" value={c.hasToday ? nf(c.snack.orderToday) : "–"} sub={c.hasToday ? sub(c.snack.orderToday, c.snack.leftToday, c.snack.effToday) : "laporan hari ini belum diinput"} c={effC(c.snack.effToday)} />
        <Kpi label="Makan hari ini" value={c.hasToday ? nf(c.meal.orderToday) : "–"} sub={c.hasToday ? sub(c.meal.orderToday, c.meal.leftToday, c.meal.effToday) : "laporan hari ini belum diinput"} c={effC(c.meal.effToday)} />
        <Kpi label="Snack bulan ini" value={nf(c.snack.orderMonth)} sub={sub(c.snack.orderMonth, c.snack.leftMonth, c.snack.effMonth)} c={effC(c.snack.effMonth)} />
        <Kpi label="Makan bulan ini" value={nf(c.meal.orderMonth)} sub={sub(c.meal.orderMonth, c.meal.leftMonth, c.meal.effMonth)} c={effC(c.meal.effMonth)} />
      </div>
      {!c.split && <div className={s.muted} style={{ fontSize: ".85rem" }}>Data snack &amp; makan terpisah belum tersedia — jalankan migrasi supabase/029_fm_canteen_split.sql.</div>}
      <div className={s.grid3}>
        <Chart title={`Efisiensi snack per hari · ${v.monthLabel}`} note={`hijau ≥ ${TARGET.canteenOk}% · kuning ≥ ${TARGET.canteenWarn}%`} bars={c.snack.daily} />
        <Chart title={`Efisiensi makan per hari · ${v.monthLabel}`} note={`hijau ≥ ${TARGET.canteenOk}% · kuning ≥ ${TARGET.canteenWarn}%`} bars={c.meal.daily} />
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Per shift · {c.hasToday ? "hari ini" : lastLbl ? `laporan terakhir ${lastLbl}` : "—"}</span></div>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${s.shift} ${s.shift4}`}>
              <b>Shift {i + 1}</b>
              <span><small>Snack</small>{nf(c.snack.shifts[i].order)}</span>
              <span><small>Sisa</small>{nf(c.snack.shifts[i].left)}</span>
              <span><small>Makan</small>{nf(c.meal.shifts[i].order)}</span>
              <span><small>Sisa</small>{nf(c.meal.shifts[i].left)}</span>
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

/* ════════════════ 7 · RECEPTIONIST ════════════════ */
function Rcp({ v }: { v: FmView }) {
  const r = v.rcp;
  if (!r) return <div className={s.empty}>Modul Receptionist belum aktif — jalankan supabase/031_receptionist.sql.</div>;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const freePct = r.wifi.slots ? (r.free / r.wifi.slots) * 100 : 0;
  return (
    <>
      <div className={s.kpis}>
        <Kpi label="Slot wifi tamu tersedia" value={`${nf(r.free)} / ${nf(r.wifi.slots)}`} sub={`${nf(r.wifi.accounts)} akun berlaku · ${nf(r.wifi.expiring7)} habis ≤ 7 hari`} c={freePct < 15 ? "#fb7185" : freePct < 35 ? "#fbbf24" : "#34d399"} />
        <Kpi label="Tamu wifi hari ini" value={nf(r.wifi.guests_today)} sub={`${nf(r.wifi.used)} slot sedang dipakai`} c="#5b8cff" />
        <Kpi label="Barang menunggu" value={nf(r.parcels.waiting)} sub={`${nf(r.parcels.waiting_in)} masuk · ${nf(r.parcels.waiting_out)} keluar${r.parcels.waiting_old ? ` · ${nf(r.parcels.waiting_old)} > 2 hari` : ""}`} c={r.parcels.waiting_old ? "#fbbf24" : "#a78bfa"} />
        <Kpi label="Booking Induction Room" value={nf(r.bookings.length)} sub={`hari ini · ${nf(r.bookings_week)} dalam 7 hari`} c="#34d399" />
      </div>
      <div className={s.grid2} style={{ alignItems: "start" }}>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Jadwal Induction Room hari ini</span></div>
          {r.bookings.length === 0 ? <div className={s.empty}>Ruangan kosong hari ini.</div> : (
            <ul className={s.list}>
              {r.bookings.map((b, i) => {
                const live = toMin(b.start) <= nowMin && nowMin < toMin(b.end), past = toMin(b.end) <= nowMin;
                return (
                  <li key={i} className={s.li} style={{ opacity: past ? 0.5 : 1, borderColor: live ? "#34d399" : undefined }}>
                    <span className={s.liTime} style={{ minWidth: "6.6rem" }}>{b.start}–{b.end}</span>
                    <span style={{ flex: 1 }}>{b.title}{b.attendees ? <span className={s.muted}> · {b.attendees} orang</span> : null}</span>
                    {live && <Pill st="baik">Berlangsung</Pill>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className={s.card}>
          <div className={s.cardHead}><span className={s.lbl}>Barang &amp; surat hari ini</span></div>
          <div className={s.kpis} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div><div className={s.num} style={{ fontSize: "3rem" }}>{nf(r.parcels.in_today)}</div><div className={s.muted}>dicatat hari ini</div></div>
            <div><div className={s.num} style={{ fontSize: "3rem" }}>{nf(r.parcels.handed_today)}</div><div className={s.muted}>diserahkan hari ini</div></div>
          </div>
          <Meter name="Slot wifi terpakai" value={`${nf(r.wifi.used)} dari ${nf(r.wifi.slots)}`} frac={r.wifi.slots ? r.wifi.used / r.wifi.slots : 0} color={freePct < 15 ? "#fb7185" : "#5b8cff"} />
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
