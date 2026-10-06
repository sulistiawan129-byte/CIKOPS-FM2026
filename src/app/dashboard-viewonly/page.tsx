"use client";

/**
 * /dashboard-viewonly — layar publik TANPA LOGIN, hanya lihat ("Driver Operations").
 * Untuk SPV/manajer & TV kantor. Data lewat RPC get_viewonly_snapshot (migrasi 015).
 *
 * Susunan layar (atas → bawah)
 *   1. Header: brand, LIVE, layar penuh, tema, jam besar
 *   2. 6 KPI (garis warna di atas kartu)
 *   3. 3 kolom: Plant Cikarang | Plant Pasar Rebo | Tugas Berikutnya
 *      → daftar DRIVER per plant, tiap baris = status driver saat ini
 *   4. Baris bawah: Progres hari ini | Gate Lintas-Plant | Perlu Perhatian
 *   5. Bar GATE berjalan (marquee) untuk pergerakan lintas-plant
 *
 * Data tidak ditampilkan mentah: semua teks lewat formatter (titleCase,
 * shortName, plate, fmtDur, …). Semua ukuran memakai rem dan root font-size
 * mengikuti layar (min(vw, vh)) sehingga proporsional di TV 1080p/4K/laptop.
 * Daftar yang panjang dipaginasi otomatis (5 baris, ganti tiap 10 dtk).
 *
 * Skala tipografi (rem; 1rem ≈ 17px di 1920×1080):
 *   3.0 display  angka KPI
 *   2.6 display  jam
 *   1.35 display judul panel (kapital, renggang)
 *   1.15 display nama driver / nama tujuan
 *   1.0  body    keterangan
 *   0.85 mono    meta (plat, waktu)
 *   0.75 label   kapital kecil, chip
 *
 * Sumber data: getViewOnlySnapshot() → RPC get_viewonly_snapshot (hanya data
 * ringkas & aman, tanpa no. HP/email/PIN), polling 15 dtk. Gate lintas-plant diturunkan dari tasks hari ini:
 *   Masuk dari PRB  = plant PRB, ON GOING, tujuan mengandung "cik/cikarang"
 *   Keluar dari CIK = plant CIK, ON GOING
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Chakra_Petch, Inter } from "next/font/google";
import Icon from "@/components/Icon";
import { getViewOnlySnapshot } from "@/lib/api";
import { getUserDutyStatus, isUserDriver, useNowTick, dutyHoursLabel } from "@/lib/duty";
import type { TaskDetail, Driver, Vehicle, Plant } from "@/lib/types";

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const POLL_MS = 15000;
const PER_PAGE = 5;
const ROTATE_MS = 10000;
const LATE_MIN = 120;
const THEME_KEY = "cikops_tv_theme";

/* ───────────────────────── formatter ───────────────────────── */

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

function sentence(input?: string | null): string {
  const s = (input ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const letters = s.replace(/[^A-Za-z]/g, "");
  const base = letters && letters === letters.toUpperCase() ? s.toLowerCase() : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function shortName(name?: string | null): string {
  const t = titleCase(name);
  if (!t) return "Belum ditentukan";
  return t.split(" ").slice(0, 2).join(" ");
}

function plate(nopol?: string | null): string {
  const s = (nopol ?? "").replace(/\s+/g, "").toUpperCase();
  const m = s.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  return m ? [m[1], m[2], m[3]].filter(Boolean).join(" ") : (nopol ?? "").trim() || "—";
}

function initials(name?: string | null): string {
  const t = titleCase(name);
  if (!t) return "?";
  const p = t.split(" ");
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function elapsedMins(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

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
  if (s < 60) return `${s} dtk`;
  return `${Math.round(s / 60)} mnt`;
}

const PLANT_NAME: Record<Plant, string> = { CIK: "Cikarang", PRB: "Pasar Rebo" };
const startOf = (t: TaskDetail) => t.accepted_at ?? t.created_at;

/* ───────────────────────── data ───────────────────────── */

interface Snapshot { tasks: TaskDetail[]; drivers: Driver[]; vehicles: Vehicle[] }

function usePlantSnapshot() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const { tasks, drivers, vehicles } = await getViewOnlySnapshot();
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

type State = "long" | "go" | "wait" | "idle" | "done" | "duty" | "off";
interface Row { driver: Driver; task: TaskDetail | null; state: State }

const STATE_RANK: Record<State, number> = { long: 0, go: 1, wait: 2, idle: 3, done: 4, duty: 5, off: 6 };
const TASK_RANK: Record<string, number> = { "ON GOING": 0, ASSIGNED: 1, DONE: 2 };

function pickTask(list: TaskDetail[]): TaskDetail | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const r = (TASK_RANK[a.status] ?? 9) - (TASK_RANK[b.status] ?? 9);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

function stateOf(t: TaskDetail | null): State {
  if (!t) return "idle";
  if (t.status === "ON GOING") return elapsedMins(startOf(t)) > LATE_MIN ? "long" : "go";
  if (t.status === "ASSIGNED") return "wait";
  return "done";
}

/** Satu baris per driver aktif di plant, lengkap dengan status terkini.
 *  Driver bertipe "user" selalu ON DUTY 08.00–16.30 WIB (status terkunci,
 *  tidak ikut penugasan) → tampil sebagai baris "duty"/"off" di urutan akhir. */
function useDriverRows(snapshot: Snapshot | null, plant: Plant) {
  const now = useNowTick(30000);
  return useMemo(() => {
    if (!snapshot) return { rows: [] as Row[], out: 0, userCount: 0 };
    const byDriver = new Map<string, TaskDetail[]>();
    for (const t of snapshot.tasks) {
      if (t.status === "CANCELLED" || !t.driver_id) continue;
      const arr = byDriver.get(t.driver_id) ?? [];
      arr.push(t);
      byDriver.set(t.driver_id, arr);
    }
    const rows: Row[] = snapshot.drivers
      .filter((d) => d.plant === plant && d.aktif)
      .map((d): Row => {
        if (isUserDriver(d)) return { driver: d, task: null, state: getUserDutyStatus(d, now).onDuty ? "duty" : "off" };
        const task = pickTask(byDriver.get(d.id) ?? []);
        return { driver: d, task, state: stateOf(task) };
      })
      .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.driver.nama.localeCompare(b.driver.nama));
    return {
      rows,
      out: rows.filter((r) => r.state === "go" || r.state === "long").length,
      userCount: rows.filter((r) => r.state === "duty" || r.state === "off").length,
    };
  }, [snapshot, plant, now]);
}

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

function Dots({ pages, page, jump }: { pages: number; page: number; jump: (i: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="dots" aria-label="Halaman">
      {Array.from({ length: pages }).map((_, i) => (
        <button key={i} className={i === page ? "on" : ""} onClick={() => jump(i)} aria-label={`Halaman ${i + 1}`} />
      ))}
    </div>
  );
}

function Kpi({ tone, label, value, unit, sub }: { tone: string; label: string; value: number | string; unit?: string; sub: string }) {
  return (
    <div className={`kpi t-${tone}`}>
      <div className="k-lbl">{label}</div>
      <div className="k-num">{value}{unit && <span className="k-unit">{unit}</span>}</div>
      <div className="k-sub">{sub}</div>
    </div>
  );
}

const CHIP: Record<State, string> = { long: "Perlu dicek", go: "Di jalan", wait: "Menunggu", idle: "Standby", done: "Selesai", duty: "On Duty", off: "Off Duty" };

/* ── Paginasi berbasis ukuran: tujuan & keperluan SELALU tampil penuh ──
 * Baris tidak dipotong (tanpa "…"); teks panjang dibungkus ke baris baru.
 * Halaman disusun dengan memperkirakan tinggi tiap baris (jumlah baris teks)
 * lalu mengisi sampai tinggi area tersedia, sisanya pindah ke halaman berikut. */

/** Ukuran elemen dalam rem (mengikuti root font-size layar). */
function useBox(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 38, h: 24 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setBox({ w: el.clientWidth / rem, h: el.clientHeight / rem });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

const linesFor = (text: string, perLine: number) => Math.max(1, Math.ceil(text.length / Math.max(12, perLine)));

/** Perkiraan tinggi baris (rem). */
function estimateHeight(dest: string, purpose: string, hasTask: boolean, widthRem: number): number {
  const inner = widthRem - 6.6; // padding + avatar + gap
  const perLine = inner / 0.62; // lebar rata-rata 1 huruf ±0.62rem (aman)
  if (!hasTask) return 4.5;
  return 1.35 + 1.55 + linesFor(dest, perLine - 2) * 1.5 + (purpose ? linesFor(purpose, perLine) * 1.45 : 0) + 1.5;
}

function pack<T>(items: T[], heightOf: (x: T) => number, budget: number, gap = 0.5): T[][] {
  const pages: T[][] = [];
  let cur: T[] = [];
  let used = 0;
  for (const it of items) {
    const h = heightOf(it);
    const add = (cur.length ? gap : 0) + h;
    if (cur.length && used + add > budget) {
      pages.push(cur);
      cur = [it];
      used = h;
    } else {
      cur.push(it);
      used += add;
    }
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

function rowTexts(r: Row) {
  const t = r.task;
  return {
    dest: t ? titleCase(t.tujuan) || "—" : "",
    purpose: t ? sentence(t.perihal) || sentence(t.jenis_pekerjaan) : "",
  };
}

function DriverRow({ r, plant, delay }: { r: Row; plant: Plant; delay: number }) {
  const t = r.task;
  const { dest, purpose } = rowTexts(r);
  let meta = "";
  if (!t) meta = "Belum keluar plant hari ini";
  else if (r.state === "go" || r.state === "long") meta = `${plate(t.kendaraan)} · berangkat ${fmtTime(startOf(t))} · ${fmtDur(elapsedMins(startOf(t)))}`;
  else if (r.state === "wait") meta = `${plate(t.kendaraan)} · ditugaskan ${fmtTime(t.created_at)}`;
  else meta = `${plate(t.kendaraan)} · selesai ${fmtTime(t.completed_at)}`;
  const chip = r.state === "idle" ? `Standby di ${PLANT_NAME[plant]}` : CHIP[r.state];
  if (r.state === "duty" || r.state === "off") {
    const du = getUserDutyStatus(r.driver);
    return (
      <div className={`drow s-${r.state}`} style={{ animationDelay: `${delay}ms` }}>
        <div className="av">{initials(r.driver.nama)}</div>
        <div className="d-main">
          <div className="d-top">
            <div className="d-name">{shortName(r.driver.nama)}</div>
            <span className="chip">🔒 {chip}</span>
          </div>
          <div className="d-purpose idle">
            Driver User · mengantar <b className="u-name">{du.userName || "—"}</b>{du.userTitle ? ` (${du.userTitle})` : ""}
          </div>
          <div className="d-meta">Otomatis {dutyHoursLabel} WIB · status terkunci</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`drow s-${r.state}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="av">{initials(r.driver.nama)}</div>
      <div className="d-main">
        <div className="d-top">
          <div className="d-name">{shortName(r.driver.nama)}</div>
          <span className="chip">{(r.state === "go" || r.state === "long") && <i className="pdot" />}{chip}</span>
        </div>
        {t ? (
          <>
            <div className="d-dest"><Icon name="pin" size={14} strokeWidth={2.4} /><b>{dest}</b></div>
            {purpose && <div className="d-purpose">{purpose}</div>}
            <div className="d-meta">{meta}</div>
          </>
        ) : (
          <div className="d-purpose idle">Tidak ada tugas terjadwal <span className="d-meta inline">· {meta}</span></div>
        )}
      </div>
    </div>
  );
}

function PlantColumn({ plant, snapshot }: { plant: Plant; snapshot: Snapshot | null }) {
  const { rows, out, userCount } = useDriverRows(snapshot, plant);
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useBox(boxRef);
  const pagesArr = useMemo(
    () => pack(rows, (r) => { const x = rowTexts(r); return estimateHeight(x.dest, x.purpose, !!r.task, box.w); }, box.h - 0.6),
    [rows, box.w, box.h],
  );
  const { page, jump } = useRotator(pagesArr.length, ROTATE_MS);
  const visible = pagesArr[page] ?? [];
  return (
    <section className={`panel col p-${plant.toLowerCase()}`}>
      <header className="p-head">
        <h2>Plant {PLANT_NAME[plant]}</h2>
        <span className="p-meta">{rows.length - userCount - out} di plant · {out} di luar{userCount > 0 ? ` · ${userCount} user` : ""}</span>
      </header>
      <div className="rows" ref={boxRef}>
        <div className="rows-in" key={`${plant}-${page}`}>
          {visible.length === 0 && <div className="none">Belum ada driver aktif di plant ini.</div>}
          {visible.map((r, i) => <DriverRow key={r.driver.id} r={r} plant={plant} delay={i * 60} />)}
        </div>
      </div>
      <Dots pages={pagesArr.length} page={page} jump={jump} />
    </section>
  );
}

function UpcomingColumn({ upcoming, done }: { upcoming: TaskDetail[]; done: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useBox(boxRef);
  const pagesArr = useMemo(
    () => pack(upcoming, (t) => estimateHeight(titleCase(t.tujuan) || "—", sentence(t.perihal) || sentence(t.jenis_pekerjaan), true, box.w - 4), box.h - 0.6),
    [upcoming, box.w, box.h],
  );
  const { page, jump } = useRotator(pagesArr.length, ROTATE_MS);
  const visible = pagesArr[page] ?? [];
  return (
    <section className="panel col up">
      <header className="p-head">
        <h2>Tugas Berikutnya</h2>
        <span className="p-meta">{upcoming.length} tersisa · {done} selesai</span>
      </header>
      <div className="rows" ref={boxRef}>
        <div className="rows-in" key={`up-${page}`}>
          {visible.length === 0 && <div className="none">Tidak ada tugas tersisa hari ini.</div>}
          {visible.map((t, i) => (
            <div className="urow" key={t.id} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="u-time">{fmtTime(t.created_at)}</div>
              <div className="d-main">
                <div className="d-top">
                  <div className="d-name">{shortName(t.driver_nama)}</div>
                  <span className={`ptag ${t.plant === "CIK" ? "cik" : "prb"}`}>{t.plant}</span>
                </div>
                <div className="d-dest"><Icon name="pin" size={14} strokeWidth={2.4} /><b>{titleCase(t.tujuan) || "—"}</b></div>
                <div className="d-purpose">{sentence(t.perihal) || sentence(t.jenis_pekerjaan) || "—"}</div>
                <div className="d-meta">{plate(t.kendaraan)} · req. {shortName(t.requestor)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Dots pages={pagesArr.length} page={page} jump={jump} />
    </section>
  );
}

function ProgressPanel({ done, going, wait }: { done: number; going: number; wait: number }) {
  const total = done + going + wait;
  const pct = total ? done / total : 0;
  const r = 44, c = 2 * Math.PI * r;
  return (
    <section className="panel prog">
      <header className="p-head"><h2>Progres Tugas Hari Ini</h2></header>
      <div className="prog-body">
        <div className="ring">
          <svg viewBox="0 0 110 110" width="100%" height="100%">
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <circle cx="55" cy="55" r={r} fill="none" stroke="var(--track)" strokeWidth="10" />
            <circle
              cx="55" cy="55" r={r} fill="none" stroke="url(#rg)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 55 55)"
              style={{ transition: "stroke-dashoffset .9s ease" }}
            />
          </svg>
          <div className="ring-txt"><b>{done}/{total}</b><small>selesai</small></div>
        </div>
        <ul className="legend">
          <li><i style={{ background: "var(--green)" }} /><b>{done}</b><span>Selesai</span></li>
          <li><i style={{ background: "var(--blue)" }} /><b>{going}</b><span>Sedang jalan</span></li>
          <li><i style={{ background: "var(--amber)" }} /><b>{wait}</b><span>Belum diterima</span></li>
        </ul>
      </div>
    </section>
  );
}

function GateRow({ t, dir }: { t: TaskDetail; dir: "in" | "out" }) {
  return (
    <div className={`g-row ${dir}`}>
      <div className="av sm">{initials(t.driver_nama)}</div>
      <div className="d-main">
        <div className="d-name sm">{shortName(t.driver_nama)}</div>
        <div className="g-text"><span className="plate">{plate(t.kendaraan)}</span> {dir === "out" ? `ke ${titleCase(t.tujuan) || "—"}` : sentence(t.perihal || t.jenis_pekerjaan) || "—"}</div>
      </div>
      <div className="g-time">{fmtTime(startOf(t))}</div>
    </div>
  );
}

function GatePanel({ masuk, keluar }: { masuk: TaskDetail[]; keluar: TaskDetail[] }) {
  const MAX = 2;
  return (
    <section className="panel gate">
      <header className="p-head">
        <h2>Gate Lintas-Plant</h2>
        <span className="p-meta live"><i className="pdot" />live</span>
      </header>
      <div className="g-cols">
        <div className="g-col in">
          <h4><span className="cnt">{masuk.length}</span>Driver PRB masuk Cikarang{masuk.length > MAX && <em>+{masuk.length - MAX} lagi</em>}</h4>
          {masuk.length === 0 && <div className="none sm">Tidak ada driver PRB di Cikarang</div>}
          {masuk.slice(0, MAX).map((t) => <GateRow key={t.id} t={t} dir="in" />)}
        </div>
        <div className="g-col out">
          <h4><span className="cnt">{keluar.length}</span>Driver CIK sedang keluar{keluar.length > MAX && <em>+{keluar.length - MAX} lagi</em>}</h4>
          {keluar.length === 0 && <div className="none sm">Semua driver CIK ada di plant</div>}
          {keluar.slice(0, MAX).map((t) => <GateRow key={t.id} t={t} dir="out" />)}
        </div>
      </div>
    </section>
  );
}

interface Alert { tone: "red" | "amber" | "blue"; title: string; sub: string }

function AttentionPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <section className="panel attn">
      <header className="p-head"><h2>Perlu Perhatian</h2>{alerts.length > 0 && <span className="p-meta warn">{alerts.length} item</span>}</header>
      {alerts.length === 0 ? (
        <div className="ok">
          <span className="ok-ic"><Icon name="check" size={26} strokeWidth={2.6} /></span>
          <div><b>Semua normal</b><small>Tidak ada yang perlu ditindaklanjuti</small></div>
        </div>
      ) : (
        <div className="alerts">
          {alerts.slice(0, 3).map((a, i) => (
            <div className={`alert ${a.tone}`} key={i}>
              <span className="a-ic"><Icon name="alert" size={18} strokeWidth={2.2} /></span>
              <div><b>{a.title}</b><small>{a.sub}</small></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── halaman ───────────────────────── */

export default function TvDisplayPage() {
  const { data, error, loadedAt } = usePlantSnapshot();
  const [clock, setClock] = useState("");
  const [clockDate, setClockDate] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
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
      setClock(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`);
      setClockDate(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" }));
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

  const cik = useDriverRows(data, "CIK");
  const prb = useDriverRows(data, "PRB");

  const m = useMemo(() => {
    const tasks = (data?.tasks ?? []).filter((t) => t.status !== "CANCELLED");
    const going = tasks.filter((t) => t.status === "ON GOING");
    const assigned = tasks.filter((t) => t.status === "ASSIGNED");
    const done = tasks.filter((t) => t.status === "DONE");
    const masuk = going.filter((t) => t.plant === "PRB" && /cik|cikarang/i.test(t.tujuan || ""));
    const keluar = going.filter((t) => t.plant === "CIK");
    const late = going.filter((t) => elapsedMins(startOf(t)) > LATE_MIN);
    const stale = assigned.filter((t) => elapsedMins(t.created_at) > 30);
    const alerts: Alert[] = [
      ...late.map((t): Alert => ({ tone: "red", title: `${shortName(t.driver_nama)} sudah ${fmtDur(elapsedMins(startOf(t)))} di luar`, sub: `${plate(t.kendaraan)} · ke ${titleCase(t.tujuan) || "—"}` })),
      ...stale.map((t): Alert => ({ tone: "amber", title: `${shortName(t.driver_nama)} belum berangkat`, sub: `Ditugaskan ${fmtDur(elapsedMins(t.created_at))} lalu · ${titleCase(t.tujuan) || "—"}` })),
    ];
    const allRows = [...cik.rows, ...prb.rows];
    const opRows = allRows.filter((r) => r.state !== "duty" && r.state !== "off");
    const userRows = allRows.length - opRows.length;
    const activeDrivers = allRows.length;
    const out = opRows.filter((r) => r.state === "go" || r.state === "long").length;
    return {
      going, assigned, done, masuk, keluar, alerts, activeDrivers, out, opCount: opRows.length, userRows,
      totalDrivers: data?.drivers.length ?? 0,
      ready: allRows.filter((r) => r.state === "idle").length,
      vehiclesActive: (data?.vehicles ?? []).filter((v) => v.aktif).length,
      total: tasks.length,
      upcoming: [...assigned].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    };
  }, [data, cik.rows, prb.rows]);

  const gateEvents = useMemo(() => {
    const ev: string[] = [];
    m.masuk.forEach((t) => ev.push(`↙ MASUK · ${shortName(t.driver_nama)} (PRB) ke Cikarang · ${plate(t.kendaraan)} · ${fmtTime(startOf(t))}`));
    m.keluar.forEach((t) => ev.push(`↗ KELUAR · ${shortName(t.driver_nama)} (CIK) → ${titleCase(t.tujuan) || "—"} · ${plate(t.kendaraan)} · ${fmtTime(startOf(t))}`));
    if (!ev.length) ev.push("Belum ada pergerakan gate lintas-plant saat ini");
    return ev;
  }, [m.masuk, m.keluar]);

  return (
    <>
      <style jsx global>{`
        html { font-size: clamp(10px, min(0.9vw, 1.6vh), 30px); }
        body { margin: 0; }
      `}</style>
      <style jsx>{`
        .page {
          --bg: #050b1c; --card: rgba(12,22,48,.88); --card2: rgba(20,34,70,.7); --line: rgba(120,150,255,.14);
          --t1: #f2f6ff; --t2: #b3c0e3; --t3: #7384ad; --track: rgba(255,255,255,.08);
          --blue: #4d8dff; --green: #34d399; --cyan: #22d3ee; --amber: #fbbf24; --purple: #a78bfa; --red: #fb7185;
          --grid: rgba(120,150,255,.055);
          display: flex; flex-direction: column; gap: .9rem; height: 100vh; overflow: hidden; padding: 1.1rem 1.6rem .9rem;
          font-family: var(--font-inter), system-ui, sans-serif; color: var(--t1);
          background:
            radial-gradient(60rem 30rem at 12% -12%, rgba(77,141,255,.18), transparent 60%),
            radial-gradient(50rem 28rem at 100% 110%, rgba(34,211,238,.1), transparent 60%),
            linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 2.4rem 2.4rem,
            linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 2.4rem 2.4rem,
            var(--bg);
        }
        .page.light {
          --bg: #eef3fc; --card: rgba(255,255,255,.94); --card2: #f3f7fe; --line: #dbe4f5;
          --t1: #0d1a36; --t2: #44537a; --t3: #7886a8; --track: #e3eaf8;
          --blue: #2d5bff; --green: #12a572; --cyan: #0fa3b8; --amber: #d98a06; --purple: #7c5cf0; --red: #e5484d;
          --grid: rgba(45,91,255,.05);
          background:
            radial-gradient(60rem 30rem at 12% -12%, rgba(45,91,255,.14), transparent 60%),
            radial-gradient(50rem 28rem at 100% 110%, rgba(15,181,164,.12), transparent 60%),
            linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 2.4rem 2.4rem,
            linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 2.4rem 2.4rem,
            var(--bg);
        }
        .disp { font-family: var(--font-display), var(--font-inter), sans-serif; }

        /* ───── header ───── */
        .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-shrink: 0; }
        .brand { display: flex; align-items: center; gap: .9rem; }
        .logo { width: 3rem; height: 3rem; border-radius: .95rem; display: grid; place-items: center; background: #fff; box-shadow: 0 0 0 1px var(--line), 0 0 1.4rem rgba(77,141,255,.35); }
        .logo img { width: 76%; height: 76%; object-fit: contain; }
        .b-name { font-family: var(--font-display), sans-serif; font-size: 2rem; font-weight: 700; letter-spacing: .04em; line-height: 1; }
        .b-name sup { font-size: .9rem; color: var(--cyan); margin-left: .15rem; }
        .b-sep { width: 1px; height: 1.8rem; background: var(--line); }
        .b-sub { font-family: var(--font-display), sans-serif; font-size: 1.1rem; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: var(--t2); }
        .vo-badge { display: inline-flex; align-items: center; gap: .4rem; height: 1.9rem; padding: 0 .8rem; border-radius: 999px; font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--cyan); border: 1px solid color-mix(in srgb, var(--cyan) 50%, transparent); background: color-mix(in srgb, var(--cyan) 10%, transparent); }
        .tools { display: flex; align-items: center; gap: .6rem; margin-left: 1rem; }
        .live { display: inline-flex; align-items: center; gap: .5rem; height: 2.1rem; padding: 0 .9rem; border-radius: 999px; font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--red); border: 1px solid color-mix(in srgb, var(--red) 55%, transparent); background: color-mix(in srgb, var(--red) 10%, transparent); }
        .live .ago { text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--t3); }
        :global(.tbtn) { height: 2.1rem; padding: 0 .85rem; border-radius: .7rem; display: inline-flex; align-items: center; gap: .45rem; font: inherit; font-size: .8rem; font-weight: 700; color: var(--t1); text-decoration: none; cursor: pointer; background: var(--card2); border: 1px solid var(--line); transition: transform .15s, border-color .15s; }
        :global(.tbtn:hover) { transform: translateY(-1px); border-color: var(--blue); }
        .page.fs :global(.hide-fs) { display: none; }
        .clock { text-align: right; }
        .clock .time { font-family: var(--font-display), sans-serif; font-size: 2.6rem; font-weight: 700; line-height: 1; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
        .clock .date { font-size: .9rem; font-weight: 500; color: var(--t2); margin-top: .25rem; }
        .err { flex-shrink: 0; padding: .45rem .9rem; border-radius: .7rem; font-size: .85rem; font-weight: 600; color: var(--amber); background: color-mix(in srgb, var(--amber) 12%, transparent); }

        /* ───── KPI ───── */
        .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .8rem; flex-shrink: 0; }
        :global(.kpi) { --c: var(--blue); padding: .8rem 1rem .75rem; border-radius: .95rem; background: var(--card); border: 1px solid var(--line); border-top: 3px solid var(--c); box-shadow: 0 14px 30px -20px rgba(0,0,0,.7); }
        :global(.kpi.t-green) { --c: var(--green); } :global(.kpi.t-cyan) { --c: var(--cyan); }
        :global(.kpi.t-amber) { --c: var(--amber); } :global(.kpi.t-purple) { --c: var(--purple); }
        :global(.k-lbl) { font-size: .75rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.k-num) { font-family: var(--font-display), sans-serif; font-size: 3rem; font-weight: 700; line-height: 1.05; margin: .15rem 0 .1rem; color: var(--c); font-variant-numeric: tabular-nums; }
        :global(.k-unit) { font-size: 1.3rem; font-weight: 600; color: var(--t3); margin-left: .35rem; }
        :global(.k-sub) { font-size: .85rem; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* ───── panel umum ───── */
        .mid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.2fr 1.2fr 1fr; gap: .9rem; }
        :global(.panel) { min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: .85rem 1rem; border-radius: 1rem; background: var(--card); border: 1px solid var(--line); box-shadow: 0 14px 30px -22px rgba(0,0,0,.7); }
        :global(.p-head) { display: flex; align-items: baseline; justify-content: space-between; gap: .8rem; margin-bottom: .6rem; flex-shrink: 0; }
        :global(.p-head h2) { margin: 0; font-family: var(--font-display), sans-serif; font-size: 1.35rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
        :global(.p-meta) { font-size: .85rem; font-weight: 500; color: var(--t3); white-space: nowrap; }
        :global(.p-meta.live) { display: inline-flex; align-items: center; gap: .4rem; color: var(--green); font-weight: 800; font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; }
        :global(.p-meta.warn) { color: var(--amber); font-weight: 700; }
        :global(.p-cik) { box-shadow: inset 0 3px 0 var(--blue), 0 14px 30px -22px rgba(0,0,0,.7); }
        :global(.p-prb) { box-shadow: inset 0 3px 0 var(--cyan), 0 14px 30px -22px rgba(0,0,0,.7); }
        :global(.up) { box-shadow: inset 0 3px 0 var(--purple), 0 14px 30px -22px rgba(0,0,0,.7); }

        :global(.rows) { flex: 1; min-height: 0; overflow: hidden; }
        :global(.rows-in) { display: flex; flex-direction: column; gap: .5rem; }
        @keyframes row-in { from { opacity: 0; transform: translateX(.8rem); } to { opacity: 1; transform: none; } }
        :global(.none) { display: grid; place-items: center; min-height: 6rem; color: var(--t3); font-size: 1rem; border: 1px dashed var(--line); border-radius: .8rem; }
        :global(.none.sm) { font-size: .85rem; border: none; padding: .8rem 0; justify-content: start; }
        :global(.dots) { display: flex; justify-content: center; gap: .4rem; padding-top: .55rem; flex-shrink: 0; }
        :global(.dots button) { width: .55rem; height: .55rem; padding: 0; border: none; border-radius: 999px; background: var(--track); cursor: pointer; transition: all .25s; }
        :global(.dots button.on) { width: 1.6rem; background: var(--blue); }

        /* ───── baris driver ───── */
        :global(.drow), :global(.urow) {
          --tone: var(--green);
          display: flex; align-items: flex-start; gap: .8rem; min-width: 0; padding: .65rem .9rem;
          border-radius: .8rem; border: 1px solid color-mix(in srgb, var(--tone) 34%, transparent);
          background: linear-gradient(90deg, color-mix(in srgb, var(--tone) 11%, transparent), color-mix(in srgb, var(--tone) 3%, transparent));
          animation: row-in .45s ease both;
        }
        :global(.drow.s-go) { --tone: var(--blue); } :global(.drow.s-long) { --tone: var(--red); }
        :global(.drow.s-wait) { --tone: var(--amber); } :global(.drow.s-idle) { --tone: var(--green); }
        :global(.drow.s-done) { --tone: var(--t3); } :global(.drow.s-duty) { --tone: var(--purple); } :global(.drow.s-off) { --tone: var(--t3); }
        :global(.u-name) { color: var(--t1); font-weight: 700; }
        :global(.urow) { --tone: var(--purple); }
        :global(.av) { width: 2.5rem; height: 2.5rem; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-family: var(--font-display), sans-serif; font-size: .9rem; font-weight: 700; color: #04122e; background: linear-gradient(140deg, #6cc4ff, #3a86ff); }
        :global(.av.sm) { width: 2.1rem; height: 2.1rem; font-size: .78rem; }
        :global(.d-main) { min-width: 0; flex: 1; }
        :global(.d-top) { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
        :global(.d-name) { font-family: var(--font-display), sans-serif; font-size: 1.15rem; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; line-height: 1.2; }
        :global(.d-name.sm) { font-size: 1rem; }
        :global(.d-dest) { display: flex; align-items: flex-start; gap: .4rem; margin-top: .25rem; font-size: 1.05rem; line-height: 1.35; color: var(--t1); }
        :global(.d-dest svg) { color: var(--tone); flex-shrink: 0; margin-top: .2rem; }
        :global(.d-dest b) { font-weight: 700; overflow-wrap: anywhere; }
        :global(.d-purpose) { margin-top: .15rem; font-size: 1rem; line-height: 1.4; color: var(--t2); overflow-wrap: anywhere; }
        :global(.d-purpose.idle) { margin-top: .25rem; }
        :global(.chip) { display: inline-flex; align-items: center; gap: .4rem; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--tone); white-space: nowrap; flex-shrink: 0; }
        :global(.d-meta) { margin-top: .3rem; font-family: var(--font-jetbrains-mono), monospace; font-size: .85rem; color: var(--t3); }
        :global(.d-meta.inline) { margin: 0; font-size: .85rem; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 55%, transparent); } 70% { box-shadow: 0 0 0 .45rem transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
        :global(.pdot) { width: .5rem; height: .5rem; border-radius: 50%; background: currentColor; display: inline-block; animation: pulse 1.6s infinite; }

        :global(.u-time) { font-family: var(--font-display), sans-serif; font-size: 1.3rem; font-weight: 700; color: var(--purple); width: 3.6rem; flex-shrink: 0; font-variant-numeric: tabular-nums; line-height: 1.2; }
        :global(.ptag) { font-size: .75rem; font-weight: 800; letter-spacing: .1em; padding: .25rem .6rem; border-radius: .5rem; flex-shrink: 0; }
        :global(.ptag.cik) { color: var(--blue); background: color-mix(in srgb, var(--blue) 16%, transparent); }
        :global(.ptag.prb) { color: var(--cyan); background: color-mix(in srgb, var(--cyan) 16%, transparent); }

        /* ───── baris bawah ───── */
        .bottom { flex-shrink: 0; min-height: 13.4rem; display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: .9rem; }
        :global(.prog-body) { flex: 1; min-height: 0; display: flex; align-items: center; gap: 1.6rem; padding: 0 .4rem; }
        :global(.ring) { position: relative; height: 100%; max-height: 8.6rem; aspect-ratio: 1; flex-shrink: 0; }
        :global(.ring-txt) { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        :global(.ring-txt b) { font-family: var(--font-display), sans-serif; font-size: 1.6rem; font-weight: 700; line-height: 1; }
        :global(.ring-txt small) { font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--t3); margin-top: .3rem; }
        :global(.legend) { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .55rem; }
        :global(.legend li) { display: flex; align-items: center; gap: .7rem; }
        :global(.legend i) { width: .6rem; height: .6rem; border-radius: 3px; }
        :global(.legend b) { font-family: var(--font-display), sans-serif; font-size: 1.7rem; font-weight: 700; min-width: 2.2rem; line-height: 1; }
        :global(.legend span) { font-size: 1rem; color: var(--t2); }

        :global(.g-cols) { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        :global(.g-col) { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: .3rem; overflow: hidden; }
        :global(.g-col + .g-col) { border-left: 1px solid var(--line); padding-left: 1rem; }
        :global(.g-col h4) { margin: 0 0 .15rem; display: flex; align-items: center; gap: .55rem; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
        :global(.g-col h4 em) { margin-left: auto; font-style: normal; font-weight: 700; letter-spacing: 0; text-transform: none; color: var(--t3); }
        :global(.g-col.in h4) { color: var(--green); } :global(.g-col.out h4) { color: var(--amber); }
        :global(.cnt) { min-width: 1.5rem; height: 1.5rem; padding: 0 .35rem; display: inline-grid; place-items: center; border-radius: .5rem; font-family: var(--font-display), sans-serif; font-size: .9rem; letter-spacing: 0; color: #04122e; background: var(--green); }
        :global(.g-col.out .cnt) { background: var(--amber); }
        :global(.g-row) { --tone: var(--green); display: flex; align-items: flex-start; gap: .65rem; min-width: 0; }
        :global(.g-row.out) { --tone: var(--amber); }
        :global(.g-row .av) { background: var(--tone); }
                :global(.g-text) { margin-top: .1rem; font-size: .9rem; line-height: 1.5; color: var(--t2); overflow-wrap: anywhere; }
        :global(.plate) { margin-right: .3rem; font-family: var(--font-jetbrains-mono), monospace; font-size: .8rem; font-weight: 700; padding: .05rem .4rem; border-radius: .35rem; background: var(--card2); border: 1px solid var(--line); color: var(--t1); flex-shrink: 0; }
        :global(.g-time) { font-family: var(--font-jetbrains-mono), monospace; font-size: .85rem; color: var(--t2); flex-shrink: 0; }

        :global(.ok) { flex: 1; display: flex; align-items: center; gap: 1rem; }
        :global(.ok-ic) { width: 3.6rem; height: 3.6rem; border-radius: 50%; display: grid; place-items: center; color: #04122e; background: var(--green); box-shadow: 0 0 1.6rem color-mix(in srgb, var(--green) 55%, transparent); }
        :global(.ok b), :global(.alert b) { display: block; font-family: var(--font-display), sans-serif; font-size: 1.15rem; font-weight: 700; letter-spacing: .02em; }
        :global(.ok small), :global(.alert small) { display: block; font-size: .9rem; color: var(--t2); margin-top: .15rem; }
        :global(.alerts) { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: .45rem; overflow: hidden; }
        :global(.alert) { --tone: var(--red); display: flex; align-items: center; gap: .7rem; padding: .45rem .7rem; border-radius: .7rem; border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent); background: color-mix(in srgb, var(--tone) 11%, transparent); }
        :global(.alert.amber) { --tone: var(--amber); }
        :global(.alert .a-ic) { color: var(--tone); display: grid; flex-shrink: 0; }
        :global(.alert b) { font-size: 1rem; }
        :global(.alert small) { font-size: .85rem; margin-top: 0; }

        /* ───── GATE ticker ───── */
        .ticker { flex-shrink: 0; display: flex; align-items: stretch; border-radius: .8rem; overflow: hidden; background: var(--card); border: 1px solid var(--line); }
        .t-flag { display: flex; align-items: center; padding: 0 1.1rem; font-family: var(--font-display), sans-serif; font-size: .95rem; font-weight: 700; letter-spacing: .16em; color: #fff; background: linear-gradient(120deg, #2d6bff, #4d8dff); }
        .t-track { flex: 1; overflow: hidden; display: flex; align-items: center; padding: .55rem 0; mask-image: linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent); }
        .t-roll { display: flex; width: max-content; animation: roll 40s linear infinite; }
        .t-set { display: flex; gap: 3rem; padding-right: 3rem; white-space: nowrap; }
        .t-set span { font-size: 1rem; font-weight: 600; color: var(--t2); }

        @keyframes roll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        @media (max-width: 900px) {
          .page { height: auto; min-height: 100vh; overflow: auto; padding: .8rem; }
          .top { flex-wrap: wrap; }
          .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .mid { grid-template-columns: 1fr; }
          :global(.drow), :global(.urow) { padding: .6rem .8rem; }
          .bottom { grid-template-columns: 1fr; height: auto; }
          :global(.g-cols) { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) { .t-roll { animation: none; } :global(.drow), :global(.urow) { animation: none; } }
      `}</style>

      <div className={`page ${display.variable} ${inter.variable}${theme === "light" ? " light" : ""}${isFullscreen ? " fs" : ""}`} ref={pageRef}>
        <header className="top">
          <div className="brand">
            <div className="logo"><img src="/logo.png" alt="CIKOPS" /></div>
            <div className="b-name">CIKOPS-FM<sup>+</sup></div>
            <div className="b-sep" />
            <div className="b-sub">Driver Operations</div>
            <span className="vo-badge"><Icon name="eye" size={14} />View Only</span>
            <div className="tools">
              <span className="live"><i className="pdot" />Live<span className="ago">· {agoLabel(loadedAt, nowTick)}</span></span>
              <button type="button" className="tbtn" onClick={toggleFullscreen}>
                <Icon name={isFullscreen ? "shrink" : "expand"} size={15} />{isFullscreen ? "Keluar penuh" : "Layar penuh"}
              </button>
              <button type="button" className="tbtn" onClick={toggleTheme} aria-label="Ganti tema" title="Ganti tema">
                <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
              </button>
              <Link href="/dashboard" className="tbtn hide-fs" title="Kembali ke Dashboard">
                <Icon name="back" size={15} strokeWidth={2.3} />Dashboard
              </Link>
            </div>
          </div>
          <div className="clock">
            <div className="time">{clock || "--:--:--"}</div>
            <div className="date">{clockDate} · Plant CIK &amp; PRB</div>
          </div>
        </header>

        {error && <div className="err">Gagal memuat data terbaru: {error} — menampilkan data terakhir yang berhasil dimuat.</div>}

        <section className="kpis">
          <Kpi tone="blue" label="Driver aktif" value={m.activeDrivers} sub={`${m.opCount} operasional · ${m.userRows} user`} />
          <Kpi tone="green" label="Di plant" value={m.opCount - m.out} sub={`${m.ready} siap berangkat`} />
          <Kpi tone="cyan" label="Di luar · bertugas" value={m.out} sub="sedang di perjalanan" />
          <Kpi tone="amber" label="Menunggu berangkat" value={m.assigned.length} sub="belum diterima driver" />
          <Kpi tone="purple" label="Kendaraan keluar" value={m.going.length} sub={`dari ${m.vehiclesActive} unit aktif`} />
          <Kpi tone="blue" label="Tugas hari ini" value={m.done.length} unit={`/ ${m.total}`} sub={`${m.going.length} sedang berjalan`} />
        </section>

        <main className="mid">
          <PlantColumn plant="CIK" snapshot={data} />
          <PlantColumn plant="PRB" snapshot={data} />
          <UpcomingColumn upcoming={m.upcoming} done={m.done.length} />
        </main>

        <section className="bottom">
          <ProgressPanel done={m.done.length} going={m.going.length} wait={m.assigned.length} />
          <GatePanel masuk={m.masuk} keluar={m.keluar} />
          <AttentionPanel alerts={m.alerts} />
        </section>

        <footer className="ticker">
          <div className="t-flag">GATE</div>
          <div className="t-track">
            <div className="t-roll">
              {[0, 1].map((k) => (
                <div className="t-set" key={k} aria-hidden={k === 1}>
                  {gateEvents.map((e, i) => <span key={i}>{e}</span>)}
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
