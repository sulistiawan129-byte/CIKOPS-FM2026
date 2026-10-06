"use client";

/**
 * /tv-display — layar publik TANPA LOGIN untuk TV kantor.
 * Split 2 kolom: CIKARANG (kiri) & PASAR REBO (kanan).
 *
 * Prinsip tampilan
 * - Data TIDAK ditampilkan mentah. Semua teks lewat "formatter" (titleCase,
 *   shortName, plate, elapsed, dst.) supaya nama ALL-CAPS, spasi ganda, plat
 *   tanpa spasi, atau tujuan huruf kecil semua tetap tampil rapi.
 * - Semua ukuran memakai rem dan root font-size mengikuti ukuran layar
 *   (min(vw, vh)), jadi proporsinya sama di TV 1080p, 4K, maupun laptop.
 * - Daftar tugas dipaginasi otomatis (4 kartu / halaman, ganti tiap 10 detik)
 *   sehingga TV tidak perlu scroll dan tidak ada kartu terpotong.
 *
 * Skala tipografi (rem; 1rem ≈ 17px di layar 1920×1080) — hanya 7 level:
 *   2.6  /800  angka KPI & persen progres
 *   2.0  /800  nama plant
 *   1.5  /800  judul header, jam
 *   1.2  /800  nama driver, nama tujuan
 *   1.0  /500  isi (keperluan)
 *   0.88 /600  meta (plat, waktu, requestor)
 *   0.78 /800  label huruf kapital, chip, badge
 *
 * Sumber data: getTasksByDate / getDrivers / getVehicles (RLS anon sudah
 * terbuka). Panel "Gate Lintas-Plant" diturunkan dari tasks hari ini:
 *   - Masuk dari PRB  = plant PRB, ON GOING, tujuan mengandung "cik/cikarang"
 *   - Keluar dari CIK = plant CIK, ON GOING
 * Polling 15 detik.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { getTasksByDate, getDrivers, getVehicles } from "@/lib/api";
import type { TaskDetail, Driver, Vehicle, Plant } from "@/lib/types";

const POLL_MS = 15000;
const PER_PAGE = 4;
const ROTATE_MS = 10000;
const THEME_KEY = "cikops_tv_theme";

/* ───────────────────────── formatter ───────────────────────── */

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const KEEP_UPPER = new Set([
  "PT", "CV", "PRB", "CIK", "GA", "HRD", "IT", "QC", "QA", "WH", "FF", "FFI",
  "DC", "RS", "SPBU", "BCA", "BRI", "BNI", "UD", "TNI", "ATK", "FM",
]);

/** ALL-CAPS / all-lower → Title Case. Teks yang sudah campuran dibiarkan. */
function titleCase(input?: string | null): string {
  const s = (input ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .split(" ")
    .map((w) => (KEEP_UPPER.has(w.toUpperCase().replace(/[.,]/g, "")) ? w.toUpperCase() : w))
    .join(" ");
}

/** Kalimat: huruf pertama kapital, sisanya tetap kecuali teks ALL-CAPS. */
function sentence(input?: string | null): string {
  const s = (input ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const letters = s.replace(/[^A-Za-z]/g, "");
  const base = letters && letters === letters.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** "BUDI SANTOSO WIJAYA" → "Budi Santoso" */
function shortName(name?: string | null): string {
  const t = titleCase(name);
  if (!t) return "Belum ditentukan";
  return t.split(" ").slice(0, 2).join(" ");
}

/** "B1234XYZ" → "B 1234 XYZ" */
function plate(nopol?: string | null): string {
  const s = (nopol ?? "").replace(/\s+/g, "").toUpperCase();
  const m = s.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  return m ? [m[1], m[2], m[3]].filter(Boolean).join(" ") : (nopol ?? "").trim() || "—";
}

function initials(name: string | null): string {
  const t = titleCase(name);
  if (!t) return "?";
  const parts = t.split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function elapsedMins(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/** 85 → "1j 25m", 40 → "40 mnt" */
function fmtDur(mins: number): string {
  if (mins < 60) return `${mins} mnt`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}j ${m}m` : `${h}j`;
}

function agoLabel(d: Date | null, nowTick: number): string {
  if (!d) return "memuat…";
  const s = Math.max(0, Math.round((nowTick - d.getTime()) / 1000));
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} dtk lalu`;
  return `${Math.round(s / 60)} mnt lalu`;
}

const PLANT_NAME: Record<Plant, string> = { CIK: "Cikarang", PRB: "Pasar Rebo" };

/* ───────────────────────── data hooks ───────────────────────── */

interface Snapshot { tasks: TaskDetail[]; drivers: Driver[]; vehicles: Vehicle[] }

function usePlantSnapshot() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [tasks, drivers, vehicles] = await Promise.all([
        getTasksByDate(localDateStr()),
        getDrivers(),
        getVehicles(),
      ]);
      setData({ tasks, drivers, vehicles });
      setError(null);
      setLoadedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  return { data, error, loadedAt };
}

const STATUS_RANK: Record<string, number> = { "ON GOING": 0, ASSIGNED: 1, DONE: 2 };

function usePlantSlice(snapshot: Snapshot | null, plant: Plant) {
  return useMemo(() => {
    const empty = {
      tasks: [] as TaskDetail[], driverCount: 0, vehicleCount: 0,
      ongoing: 0, done: 0, total: 0, standby: [] as Driver[],
    };
    if (!snapshot) return empty;
    const tasks = snapshot.tasks
      .filter((t) => t.plant === plant && t.status !== "CANCELLED")
      .sort((a, b) => {
        const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
        if (r !== 0) return r;
        // yang paling lama berjalan tampil duluan
        return new Date(a.accepted_at ?? a.created_at).getTime() - new Date(b.accepted_at ?? b.created_at).getTime();
      });
    const drivers = snapshot.drivers.filter((d) => d.plant === plant && d.aktif);
    const busy = new Set(tasks.filter((t) => t.status === "ON GOING").map((t) => t.driver_id));
    return {
      tasks,
      driverCount: drivers.length,
      vehicleCount: snapshot.vehicles.filter((v) => v.plant === plant && v.aktif).length,
      ongoing: tasks.filter((t) => t.status === "ON GOING").length,
      done: tasks.filter((t) => t.status === "DONE").length,
      total: tasks.length,
      standby: drivers.filter((d) => !busy.has(d.id)),
    };
  }, [snapshot, plant]);
}

/** Halaman otomatis berganti; klik titik untuk lompat (timer di-reset). */
function useRotator(pages: number, ms: number) {
  const [page, setPage] = useState(0);
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    if (pages <= 1) return;
    const iv = setInterval(() => setPage((p) => (p + 1) % pages), ms);
    return () => clearInterval(iv);
  }, [pages, ms, stamp]);
  const jump = useCallback((i: number) => { setPage(i); setStamp((s) => s + 1); }, []);
  return { page: pages <= 1 ? 0 : Math.min(page, pages - 1), jump };
}

/* ───────────────────────── komponen ───────────────────────── */

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 64 64" width="100%" height="100%">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="7" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset .8s ease" }}
        />
      </svg>
      <div className="ring-txt"><b>{pct}%</b><small>selesai</small></div>
    </div>
  );
}

function TaskCard({ t, delay }: { t: TaskDetail; delay: number }) {
  const going = t.status === "ON GOING";
  const done = t.status === "DONE";
  const started = t.accepted_at ?? t.created_at;
  const mins = going ? elapsedMins(started) : 0;
  const long = going && mins > 120;
  const tone = done ? "done" : going ? (long ? "long" : "go") : "wait";
  const main = sentence(t.perihal) || sentence(t.jenis_pekerjaan) || "—";
  const tag = t.perihal && t.jenis_pekerjaan ? titleCase(t.jenis_pekerjaan) : "";

  let timeLine: string;
  if (going) timeLine = `Berangkat ${fmtTime(started)} · ${fmtDur(mins)}`;
  else if (done) timeLine = `Selesai ${fmtTime(t.completed_at)}`;
  else timeLine = `Ditugaskan ${fmtTime(t.created_at)}`;

  return (
    <article className={`tcard ${tone}`} style={{ animationDelay: `${delay}ms` }}>
      <header className="tc-top">
        <div className="av">{initials(t.driver_nama)}</div>
        <div className="tc-who">
          <div className="nm">{shortName(t.driver_nama)}</div>
          <div className="vh">
            <span className="plate">{plate(t.kendaraan)}</span>
          </div>
        </div>
        <span className={`chip ${tone}`}>
          {going && <i className="pdot" />}
          {done ? "Selesai" : going ? (long ? "Perlu dicek" : "Di jalan") : "Menunggu"}
        </span>
      </header>

      <div className="tc-route">
        <span className="rt-from"><i className="rt-a" />{PLANT_NAME[t.plant]}</span>
        <span className="rt-bar"><Icon name="arrow" size={14} strokeWidth={2.4} /></span>
        <span className="rt-to" title={titleCase(t.tujuan)}><Icon name="pin" size={15} strokeWidth={2.3} /><span>{titleCase(t.tujuan) || "—"}</span></span>
      </div>

      <div className="tc-purpose" title={main}>{tag && <em>{tag}</em>}{main}</div>

      <footer className="tc-foot">
        <span className="tm"><Icon name="clock" size={14} strokeWidth={2.2} />{timeLine}</span>
        <span className="rq">
          {titleCase(t.requestor) ? `Req. ${shortName(t.requestor)}` : ""}
        </span>
      </footer>
    </article>
  );
}

function GateRow({ t, dir }: { t: TaskDetail; dir: "in" | "out" }) {
  const started = t.accepted_at ?? t.created_at;
  return (
    <div className="gate-row">
      <div className="gic">{initials(t.driver_nama)}</div>
      <div className="gbody">
        <div className="g1">{shortName(t.driver_nama)}</div>
        <div className="g2">
          <span className="plate sm">{plate(t.kendaraan)}</span>
          {dir === "out" ? `ke ${titleCase(t.tujuan) || "—"}` : sentence(t.perihal || t.jenis_pekerjaan) || "—"}
        </div>
      </div>
      <div className="gtime">{fmtTime(started)}</div>
    </div>
  );
}

function GatePanel({ masuk, keluar }: { masuk: TaskDetail[]; keluar: TaskDetail[] }) {
  const MAX = 2;
  return (
    <section className="panel gate">
      <div className="panel-head">
        <span className="ph-ic"><Icon name="gate" size={18} /></span>
        <h3>Gate Lintas-Plant</h3>
        <span className="live-chip"><i className="pdot" />live</span>
      </div>
      <div className="gate-cols">
        <div className="gate-col in">
          <h4><span className="cnt">{masuk.length}</span>Driver PRB masuk Cikarang{masuk.length > MAX && <span className="g-more">+{masuk.length - MAX} lagi</span>}</h4>
          {masuk.length === 0 && <div className="g-empty">Tidak ada driver PRB di Cikarang</div>}
          {masuk.slice(0, MAX).map((t) => <GateRow key={t.id} t={t} dir="in" />)}

        </div>
        <div className="gate-col out">
          <h4><span className="cnt">{keluar.length}</span>Driver CIK sedang keluar{keluar.length > MAX && <span className="g-more">+{keluar.length - MAX} lagi</span>}</h4>
          {keluar.length === 0 && <div className="g-empty">Semua driver CIK ada di plant</div>}
          {keluar.slice(0, MAX).map((t) => <GateRow key={t.id} t={t} dir="out" />)}

        </div>
      </div>
    </section>
  );
}

function StandbyPanel({ drivers }: { drivers: Driver[] }) {
  const MAX = 8;
  return (
    <section className="panel standby">
      <div className="panel-head">
        <span className="ph-ic"><Icon name="users" size={18} /></span>
        <h3>Driver Standby di Plant</h3>
        <span className="live-chip"><i className="pdot" />{drivers.length} siap</span>
      </div>
      {drivers.length === 0 ? (
        <div className="g-empty">Semua driver sedang bertugas</div>
      ) : (
        <div className="sb-grid">
          {drivers.slice(0, MAX).map((d) => (
            <div className="sb-chip" key={d.id}>
              <span className="sb-av">{initials(d.nama)}</span>
              {shortName(d.nama)}
            </div>
          ))}
          {drivers.length > MAX && <div className="sb-chip more">+{drivers.length - MAX}</div>}
        </div>
      )}
    </section>
  );
}

function PlantSide({
  plant, snapshot, extra,
}: { plant: Plant; snapshot: Snapshot | null; extra: React.ReactNode }) {
  const s = usePlantSlice(snapshot, plant);
  const pages = Math.max(1, Math.ceil(s.tasks.length / PER_PAGE));
  const { page, jump } = useRotator(pages, ROTATE_MS);
  const visible = s.tasks.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <div className={`side ${plant === "CIK" ? "cik" : "prb"}`}>
      <div className="banner">
        <div className="bn-l">
          <div className="bn-code">Plant {plant}</div>
          <h2>{PLANT_NAME[plant]}</h2>
          <div className="bn-sub"><b>{s.total}</b> penugasan · <b>{s.done}</b> selesai</div>
        </div>
        <ProgressRing pct={pct} />
        <div className="kpis">
          <div className="kpi"><div className="k-num">{s.driverCount}</div><div className="k-lbl">Driver aktif</div></div>
          <div className="kpi"><div className="k-num">{s.vehicleCount}</div><div className="k-lbl">Kendaraan</div></div>
          <div className="kpi hot"><div className="k-num">{s.ongoing}</div><div className="k-lbl">Belum kembali</div></div>
        </div>
      </div>

      <div className="sec-head">
        <span>Penugasan Hari Ini</span>
        {pages > 1 && (
          <div className="dots" role="tablist" aria-label="Halaman">
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} className={i === page ? "on" : ""} onClick={() => jump(i)} aria-label={`Halaman ${i + 1}`} />
            ))}
            <span className="pg">{page + 1}/{pages}</span>
          </div>
        )}
      </div>

      <div className="tgrid" key={`${plant}-${page}`}>
        {visible.length === 0 ? (
          <div className="empty">
            <Icon name="tasks" size={34} strokeWidth={1.6} />
            <div>Belum ada penugasan hari ini</div>
          </div>
        ) : (
          visible.map((t, i) => <TaskCard key={t.id} t={t} delay={i * 80} />)
        )}
      </div>

      {extra}
    </div>
  );
}

/* ───────────────────────── halaman ───────────────────────── */

export default function TvDisplayPage() {
  const { data, error, loadedAt } = usePlantSnapshot();
  const [clock, setClock] = useState("");
  const [clockDate, setClockDate] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch { /* storage bisa diblokir */ }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((cur) => {
      const next = cur === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch { /* abaikan */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}.${String(d.getSeconds()).padStart(2, "0")}`);
      setClockDate(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
      setNowTick(Date.now());
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else pageRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const gate = useMemo(() => {
    if (!data) return { masuk: [] as TaskDetail[], keluar: [] as TaskDetail[] };
    return {
      masuk: data.tasks.filter((t) => t.plant === "PRB" && t.status === "ON GOING" && /cik|cikarang/i.test(t.tujuan || "")),
      keluar: data.tasks.filter((t) => t.plant === "CIK" && t.status === "ON GOING"),
    };
  }, [data]);

  const prbStandby = usePlantSlice(data, "PRB").standby;

  const ticker = useMemo(() => {
    const items: string[] = [];
    if (data) {
      const late = data.tasks.filter((t) => t.status === "ON GOING" && elapsedMins(t.accepted_at ?? t.created_at) > 120).length;
      if (late) items.push(`${late} tugas sudah berjalan lebih dari 2 jam — mohon dicek`);
      if (gate.masuk.length) items.push(`${gate.masuk.length} driver PRB sedang berada di area Cikarang`);
      if (gate.keluar.length) items.push(`${gate.keluar.length} driver CIK sedang bertugas di luar plant`);
    }
    if (!items.length) items.push("Semua penugasan berjalan normal");
    items.push("Gunakan helm & sabuk pengaman — keselamatan nomor satu");
    return items;
  }, [data, gate]);

  return (
    <>
      <style jsx global>{`
        html { font-size: clamp(10px, min(0.9vw, 1.6vh), 30px); }
        body { margin: 0; }
      `}</style>
      <style jsx>{`
        .page {
          --bg: #eef3fc; --surface: #ffffff; --surface2: #f5f8fe; --line: #dfe7f5;
          --t1: #0d1a36; --t2: #44537a; --t3: #7886a8;
          --blue: #2d5bff; --blue2: #1d44d6; --teal: #0fb5a4; --teal2: #0b8f82;
          --amber: #f59e0b; --amber-bg: #fff4dc; --green: #16a34a; --green-bg: #e3f7ea;
          --red-bg: #ffe9e6; --red: #e5484d;
          --shadow: 0 1px 2px rgba(20,40,100,.06), 0 14px 32px -16px rgba(30,60,160,.25);
          --blob1: rgba(45,91,255,.14); --blob2: rgba(15,181,164,.12);
          display: flex; flex-direction: column; height: 100vh; overflow: hidden;
          font-family: var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif;
          color: var(--t1);
          background:
            radial-gradient(60rem 36rem at 8% -10%, var(--blob1), transparent 60%),
            radial-gradient(54rem 34rem at 96% 108%, var(--blob2), transparent 60%),
            var(--bg);
        }
        .page.dark {
          --bg: #070d1d; --surface: #0f1932; --surface2: #15213f; --line: rgba(255,255,255,.1);
          --t1: #f4f7ff; --t2: #b4c0e0; --t3: #7f8db3;
          --amber-bg: rgba(245,158,11,.16); --green-bg: rgba(34,197,94,.16); --red-bg: rgba(229,72,77,.18);
          --shadow: 0 14px 34px -16px rgba(0,0,0,.65);
          --blob1: rgba(45,91,255,.22); --blob2: rgba(15,181,164,.14);
        }

        /* ───── header ───── */
        .top {
          display: flex; align-items: center; justify-content: space-between; gap: 1.2rem;
          padding: 0.95rem 2rem; flex-shrink: 0; position: relative; overflow: hidden; color: #fff;
          background: linear-gradient(115deg, #1639c4 0%, #2d5bff 52%, #4d8bff 100%);
          box-shadow: 0 10px 30px -14px rgba(29,68,214,.7);
        }
        .top::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.16) 50%, transparent 65%);
          transform: translateX(-120%); animation: shine 7s ease-in-out infinite;
        }
        @keyframes shine { 0%, 55% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
        .brand { display: flex; align-items: center; gap: 1rem; position: relative; }
        .logo { width: 3.1rem; height: 3.1rem; border-radius: 1rem; background: #fff; display: grid; place-items: center; box-shadow: 0 6px 18px -6px rgba(0,0,0,.4); }
        .logo img { width: 74%; height: 74%; object-fit: contain; }
        .brand h1 { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -.01em; line-height: 1.1; }
        .brand .sub { font-size: .88rem; font-weight: 600; opacity: .82; margin-top: .25rem; }
        .tools { display: flex; align-items: center; gap: .8rem; position: relative; }
        .live {
          display: inline-flex; align-items: center; gap: .5rem; font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
          background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); padding: .45rem .9rem; border-radius: 999px;
        }
        .live .ago { text-transform: none; letter-spacing: 0; font-weight: 600; opacity: .85; }
        :global(.ibtn) {
          height: 2.5rem; min-width: 2.5rem; padding: 0 .75rem; border-radius: .85rem; display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
          background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.32); color: #fff; cursor: pointer; text-decoration: none;
          font: inherit; font-size: .88rem; font-weight: 700; transition: background .15s, transform .15s;
        }
        :global(.ibtn:hover) { background: rgba(255,255,255,.28); transform: translateY(-1px); }
        .page.fs :global(.hide-fs) { display: none; }
        .clock { text-align: right; padding-left: .6rem; }
        .clock .time { font-family: var(--font-jetbrains-mono), monospace; font-size: 1.5rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
        .clock .date { font-size: .88rem; font-weight: 600; opacity: .82; margin-top: .3rem; }
        .err { background: var(--amber-bg); color: var(--amber); font-size: .88rem; font-weight: 700; padding: .5rem 2rem; flex-shrink: 0; }

        /* ───── split ───── */
        .split { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1.3rem; padding: 1.3rem 1.6rem 1rem; }
        :global(.side) { display: flex; flex-direction: column; gap: .95rem; min-height: 0; min-width: 0; }
        :global(.side.cik) { --acc: var(--blue); --acc2: var(--blue2); --accbg: linear-gradient(120deg, #1d44d6, #2d5bff 60%, #5b8cff); }
        :global(.side.prb) { --acc: var(--teal); --acc2: var(--teal2); --accbg: linear-gradient(120deg, #0a8d80, #0fb5a4 60%, #3fd6c4); }

        :global(.banner) {
          display: flex; align-items: center; gap: 1.2rem; padding: 1rem 1.4rem; border-radius: 1.4rem; color: #fff;
          background: var(--accbg); box-shadow: 0 16px 32px -18px var(--acc2); position: relative; overflow: hidden; flex-shrink: 0;
        }
        :global(.banner)::after { content: ""; position: absolute; right: -3rem; top: -5rem; width: 14rem; height: 14rem; border-radius: 50%; background: rgba(255,255,255,.1); pointer-events: none; }
        :global(.bn-l) { min-width: 0; z-index: 1; }
        :global(.bn-code) { font-size: .78rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; opacity: .85; }
        :global(.banner h2) { margin: .2rem 0 .3rem; font-size: 2rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.05; white-space: nowrap; }
        :global(.bn-sub) { font-size: .88rem; font-weight: 600; opacity: .92; white-space: nowrap; }
        :global(.bn-sub b) { font-weight: 800; }
        :global(.ring) { position: relative; width: 4.9rem; height: 4.9rem; flex-shrink: 0; z-index: 1; }
        :global(.ring-txt) { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
        :global(.ring-txt b) { font-size: 1.2rem; font-weight: 800; }
        :global(.ring-txt small) { font-size: .78rem; font-weight: 700; opacity: .85; margin-top: .2rem; }

        :global(.kpis) { margin-left: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem; z-index: 1; }
        :global(.kpi) {
          padding: .65rem .95rem; border-radius: 1rem; min-width: 7.4rem;
          background: rgba(255,255,255,.17); border: 1px solid rgba(255,255,255,.3); backdrop-filter: blur(4px);
        }
        :global(.k-num) { font-size: 2.6rem; font-weight: 800; line-height: 1; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
        :global(.k-lbl) { font-size: .78rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; opacity: .88; margin-top: .3rem; white-space: nowrap; }
        :global(.kpi.hot) { background: #fff; border-color: #fff; color: var(--acc2); }
        :global(.kpi.hot .k-lbl) { opacity: 1; }

        :global(.sec-head) { display: flex; align-items: center; justify-content: space-between; font-size: .78rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--t2); flex-shrink: 0; margin-top: .1rem; }
        :global(.sec-head > span) { display: inline-flex; align-items: center; gap: .55rem; }
        :global(.sec-head > span)::before { content: ""; width: .35rem; height: 1.1rem; border-radius: 3px; background: var(--acc); }
        :global(.dots) { display: inline-flex; align-items: center; gap: .4rem; }
        :global(.dots button) { width: .6rem; height: .6rem; padding: 0; border-radius: 999px; border: none; background: var(--line); cursor: pointer; transition: all .25s; }
        :global(.dots button.on) { width: 1.7rem; background: var(--acc); }
        :global(.pg) { font-family: var(--font-jetbrains-mono), monospace; font-size: .78rem; font-weight: 700; color: var(--t3); margin-left: .35rem; letter-spacing: 0; }

        /* ───── task cards: grid 2×2, tinggi seragam ───── */
        :global(.tgrid) { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: .8rem; }
        @keyframes card-in { from { opacity: 0; transform: translateY(.7rem) scale(.985); } to { opacity: 1; transform: none; } }
        :global(.tcard) {
          --tone: var(--blue);
          position: relative; min-height: 0; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: .5rem;
          padding: .9rem 1.1rem .8rem; border-radius: 1.2rem; background: var(--surface); border: 1px solid var(--line);
          box-shadow: var(--shadow); overflow: hidden; animation: card-in .5s ease both; transition: transform .2s, box-shadow .2s;
        }
        :global(.tcard)::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: .32rem; background: var(--tone); }
        :global(.tcard:hover) { transform: translateY(-3px); }
        :global(.tcard.go) { --tone: var(--green); }
        :global(.tcard.long) { --tone: var(--red); }
        :global(.tcard.wait) { --tone: var(--amber); }
        :global(.tcard.done) { --tone: var(--t3); }
        :global(.tcard.done) { opacity: .82; }
        :global(.tc-top) { display: flex; align-items: center; gap: .7rem; }
        :global(.av) { width: 2.5rem; height: 2.5rem; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: .88rem; font-weight: 800; color: #fff; background: var(--accbg); }
        :global(.tc-who) { min-width: 0; flex: 1; }
        :global(.nm) { font-size: 1.2rem; font-weight: 800; letter-spacing: -.01em; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.vh) { display: flex; align-items: center; gap: .5rem; margin-top: .25rem; min-width: 0; }
        :global(.plate) { font-family: var(--font-jetbrains-mono), monospace; font-size: .88rem; font-weight: 700; padding: .12rem .5rem; border-radius: .4rem; background: var(--surface2); border: 1px solid var(--line); white-space: nowrap; color: var(--t1); }
        :global(.plate.sm) { margin-right: .45rem; font-size: .78rem; padding: .05rem .4rem; }
        :global(.jenis) { font-size: .88rem; font-weight: 600; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.chip) { display: inline-flex; align-items: center; gap: .4rem; font-size: .78rem; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; padding: .35rem .7rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0; }
        :global(.chip.go) { background: var(--green-bg); color: var(--green); }
        :global(.chip.long) { background: var(--red-bg); color: var(--red); }
        :global(.chip.wait) { background: var(--amber-bg); color: var(--amber); }
        :global(.chip.done) { background: var(--surface2); color: var(--t3); }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 55%, transparent); } 70% { box-shadow: 0 0 0 .5rem transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
        :global(.pdot) { width: .5rem; height: .5rem; border-radius: 50%; background: currentColor; display: inline-block; animation: pulse 1.6s infinite; }

        :global(.tc-route) { display: flex; align-items: center; gap: .6rem; padding: .55rem .8rem; border-radius: .9rem; background: var(--surface2); min-width: 0; }
        :global(.rt-from) { display: inline-flex; align-items: center; gap: .45rem; font-size: .88rem; font-weight: 600; color: var(--t3); white-space: nowrap; flex-shrink: 0; }
        :global(.rt-a) { width: .6rem; height: .6rem; border-radius: 50%; border: .18rem solid var(--tone); background: var(--surface); display: inline-block; }
        :global(.rt-bar) { flex: 0 0 auto; color: var(--tone); display: grid; place-items: center; opacity: .8; }
        :global(.rt-to) { display: flex; align-items: center; gap: .4rem; min-width: 0; flex: 1; font-size: 1.2rem; font-weight: 800; letter-spacing: -.01em; line-height: 1.15; }
        :global(.rt-to svg) { color: var(--tone); flex-shrink: 0; }
        :global(.rt-to span) { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
        :global(.tc-purpose) { font-size: 1rem; font-weight: 500; color: var(--t2); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        :global(.tc-foot) { display: flex; align-items: center; justify-content: space-between; gap: .6rem; font-size: .88rem; font-weight: 600; color: var(--t3); }
        :global(.tm) { display: inline-flex; align-items: center; gap: .4rem; white-space: nowrap; color: var(--t2); }
        :global(.rq) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        :global(.tc-purpose em) { font-style: normal; font-size: .78rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; padding: .12rem .5rem; margin-right: .55rem; border-radius: .4rem; background: color-mix(in srgb, var(--acc) 12%, transparent); color: var(--acc); vertical-align: .08em; }
        :global(.empty) { grid-column: 1 / -1; grid-row: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .7rem; color: var(--t3); font-size: 1.2rem; font-weight: 700; border: 2px dashed var(--line); border-radius: 1.2rem; }

        /* ───── panel gate / standby ───── */
        :global(.panel) { flex-shrink: 0; height: 12.8rem; padding: 1rem 1.2rem; border-radius: 1.3rem; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }
        :global(.panel-head) { display: flex; align-items: center; gap: .65rem; margin-bottom: .7rem; }
        :global(.ph-ic) { width: 2rem; height: 2rem; border-radius: .7rem; display: grid; place-items: center; color: #fff; background: var(--accbg); }
        :global(.panel-head h3) { margin: 0; flex: 1; font-size: .88rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        :global(.live-chip) { display: inline-flex; align-items: center; gap: .4rem; font-size: .78rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--green); }
        :global(.gate-cols) { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        :global(.gate-col) { min-width: 0; display: flex; flex-direction: column; gap: .15rem; }
        :global(.gate-col + .gate-col) { border-left: 1px solid var(--line); padding-left: 1rem; }
        :global(.gate-col h4) { margin: 0 0 .35rem; display: flex; align-items: center; gap: .55rem; font-size: .78rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        :global(.gate-col.in h4) { color: var(--teal2); }
        :global(.gate-col.out h4) { color: var(--amber); }
        :global(.cnt) { min-width: 1.5rem; height: 1.5rem; padding: 0 .35rem; border-radius: .5rem; display: inline-grid; place-items: center; font-size: .88rem; letter-spacing: 0; color: #fff; background: var(--teal); }
        :global(.gate-col.out .cnt) { background: var(--amber); }
        :global(.gate-row) { display: flex; align-items: center; gap: .65rem; padding: .3rem 0; }
        :global(.gic) { width: 1.9rem; height: 1.9rem; border-radius: 50%; display: grid; place-items: center; font-size: .78rem; font-weight: 800; color: #fff; flex-shrink: 0; background: var(--teal); }
        :global(.gate-col.out .gic) { background: var(--amber); }
        :global(.gbody) { min-width: 0; flex: 1; }
        :global(.g1) { font-size: 1rem; font-weight: 800; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.g2) { font-size: .88rem; font-weight: 500; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }
        :global(.gtime) { font-family: var(--font-jetbrains-mono), monospace; font-size: .88rem; font-weight: 700; color: var(--t2); flex-shrink: 0; }
        :global(.g-empty) { font-size: .88rem; font-weight: 600; color: var(--t3); padding: .5rem 0; }
        :global(.g-more) { margin-left: auto; font-size: .78rem; font-weight: 800; color: var(--t3); letter-spacing: .03em; text-transform: none; }
        :global(.sb-grid) { display: flex; flex-wrap: wrap; align-content: flex-start; gap: .55rem; }
        :global(.sb-chip) { display: inline-flex; align-items: center; gap: .5rem; padding: .3rem .85rem .3rem .35rem; border-radius: 999px; background: var(--surface2); border: 1px solid var(--line); font-size: .88rem; font-weight: 700; }
        :global(.sb-chip.more) { padding: .3rem .85rem; color: var(--t3); }
        :global(.sb-av) { width: 1.7rem; height: 1.7rem; border-radius: 50%; display: grid; place-items: center; font-size: .78rem; font-weight: 800; color: #fff; background: var(--teal); }

        /* ───── ticker ───── */
        .ticker { flex-shrink: 0; display: flex; align-items: stretch; background: var(--surface); border-top: 1px solid var(--line); overflow: hidden; }
        .t-flag { display: flex; align-items: center; gap: .55rem; padding: .7rem 1.4rem; color: #fff; font-size: .78rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; background: linear-gradient(120deg, #f59e0b, #f97316); }
        .t-track { flex: 1; overflow: hidden; display: flex; align-items: center; mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
        .t-roll { display: flex; width: max-content; animation: roll 38s linear infinite; }
        .t-set { display: flex; gap: 3rem; padding-right: 3rem; white-space: nowrap; }
        .t-set span { display: inline-flex; align-items: center; gap: .6rem; font-size: 1rem; font-weight: 600; color: var(--t2); }
        .t-set i { width: .45rem; height: .45rem; border-radius: 50%; background: var(--amber); }
        @keyframes roll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        @media (max-width: 900px) {
          .page { height: auto; min-height: 100vh; overflow: auto; }
          .top { flex-wrap: wrap; padding: 1rem; }
          .split { grid-template-columns: 1fr; }
          :global(.tgrid) { grid-template-columns: 1fr; grid-template-rows: none; }
          :global(.gate-cols) { grid-template-columns: 1fr; }
          :global(.panel) { height: auto; }
        }
        @media (prefers-reduced-motion: reduce) { .top::before, .t-roll { animation: none; } :global(.tcard) { animation: none; } }
      `}</style>

      <div className={`page${theme === "dark" ? " dark" : ""}${isFullscreen ? " fs" : ""}`} ref={pageRef}>
        <header className="top">
          <div className="brand">
            <div className="logo"><img src="/logo.png" alt="CIKOPS" /></div>
            <div>
              <h1>CIKOPS Fleet — Status Penugasan</h1>
              <div className="sub">PT Frisian Flag Indonesia · Plant Cikarang &amp; Pasar Rebo</div>
            </div>
          </div>
          <div className="tools">
            <Link href="/dashboard" className="ibtn hide-fs" title="Kembali ke Dashboard">
              <Icon name="back" size={16} strokeWidth={2.3} />Dashboard
            </Link>
            <span className="live"><i className="pdot" />Live<span className="ago">· {agoLabel(loadedAt, nowTick)}</span></span>
            <button type="button" className="ibtn" onClick={toggleTheme} title="Ganti tema" aria-label="Ganti tema">
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
            <button type="button" className="ibtn" onClick={toggleFullscreen} title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"} aria-label="Layar penuh">
              <Icon name={isFullscreen ? "shrink" : "expand"} size={17} />
            </button>
            <div className="clock">
              <div className="time">{clock || "--.--.--"}</div>
              <div className="date">{clockDate}</div>
            </div>
          </div>
        </header>

        {error && <div className="err">Gagal memuat data terbaru: {error} — menampilkan data terakhir yang berhasil dimuat.</div>}

        <main className="split">
          <PlantSide plant="CIK" snapshot={data} extra={<GatePanel masuk={gate.masuk} keluar={gate.keluar} />} />
          <PlantSide plant="PRB" snapshot={data} extra={<StandbyPanel drivers={prbStandby} />} />
        </main>

        <footer className="ticker">
          <div className="t-flag"><Icon name="megaphone" size={16} strokeWidth={2.2} />Info</div>
          <div className="t-track">
            <div className="t-roll">
              {[0, 1].map((k) => (
                <div className="t-set" key={k} aria-hidden={k === 1}>
                  {ticker.map((item, i) => <span key={i}><i />{item}</span>)}
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
