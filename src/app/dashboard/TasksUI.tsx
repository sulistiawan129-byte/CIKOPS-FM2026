"use client";

/**
 * Tampilan modul Penugasan Driver — "rute".
 * Tiap tugas adalah satu perjalanan: Dari mana → ke mana. Kartu tugas, form
 * penugasan (dengan tiket pratinjau), dan modal cetak bukti memakai bahasa
 * visual yang sama. Murni tampilan: data, API, dan pengiriman tetap di
 * DashboardPage / CreateTaskModal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import s from "./tasks.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { isUserDriver } from "@/lib/duty";
import { buildTaskSlipsHtml, taskRefNo } from "@/lib/taskSlip";
import { plantLocation } from "@/lib/types";
import type { Driver, Employee, JobType, Plant, TaskDetail, TaskStatus, Vehicle } from "@/lib/types";

/* ───────────────────────── util ───────────────────────── */

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Teks yang seluruhnya KAPITAL dirapikan jadi "Title Case" (singkatan ≤3 huruf tetap kapital). */
function tidy(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (s.length < 4 || s !== s.toUpperCase() || s === s.toLowerCase()) return s;
  return s.replace(/[A-Za-z]+/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()));
}

function hhmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
}

function initials(name: string) {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const h = hue(name || "?");
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${h} 62% 46%)`, boxShadow: `0 0 0 3px hsl(${h} 62% 46% / .16)` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const Svg = ({ children, size = 16, sw = 2 }: { children: ReactNode; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcPrint = ({ size }: { size?: number }) => <Svg size={size}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" /></Svg>;
const IcCar = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16" /><rect x="3" y="16" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="18" r=".6" /><circle cx="16.5" cy="18" r=".6" /></Svg>;
const IcSwap = ({ size }: { size?: number }) => <Svg size={size}><path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" /></Svg>;
const IcPlus = ({ size }: { size?: number }) => <Svg size={size} sw={2.6}><path d="M12 5v14M5 12h14" /></Svg>;
const IcX = ({ size }: { size?: number }) => <Svg size={size} sw={2.2}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
const IcLock = ({ size }: { size?: number }) => <Svg size={size}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
const IcChevL = () => <Svg size={18} sw={2.4}><path d="m15 6-6 6 6 6" /></Svg>;
const IcChevR = () => <Svg size={18} sw={2.4}><path d="m9 6 6 6-6 6" /></Svg>;

const TONE: Record<TaskStatus, { key: string; label: string; color: string }> = {
  ASSIGNED: { key: "assigned", label: "Ditugaskan", color: "var(--orange)" },
  "ON GOING": { key: "ongoing", label: "Berjalan", color: "var(--brand)" },
  DONE: { key: "done", label: "Selesai", color: "var(--green)" },
  CANCELLED: { key: "cancelled", label: "Dibatalkan", color: "var(--red)" },
};
const ORDER: TaskStatus[] = ["ON GOING", "ASSIGNED", "DONE", "CANCELLED"];

export function sortTasks(list: TaskDetail[]): TaskDetail[] {
  return list.slice().sort((a, b) => {
    const r = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/* ───────────────────────── bar atas papan ───────────────────────── */

export function TaskBoardBar(p: {
  date: string; today: string; onDate: (d: string) => void;
  stats: { total: number; assigned: number; ongoing: number; done: number; cancelled: number };
  statusFilter: TaskStatus | null; onStatus: (s: TaskStatus | null) => void;
  search: string; onSearch: (v: string) => void;
  printCount: number; onPrintAll: () => void;
}) {
  const { stats } = p;
  const segs: { st: TaskStatus; n: number }[] = [
    { st: "ASSIGNED", n: stats.assigned },
    { st: "ON GOING", n: stats.ongoing },
    { st: "DONE", n: stats.done },
    { st: "CANCELLED", n: stats.cancelled },
  ];
  const doneRate = stats.total - stats.cancelled > 0 ? Math.round((stats.done / (stats.total - stats.cancelled)) * 100) : 0;
  return (
    <section className={s.board}>
      <div className={s.boardTop}>
        <div className={s.dateNav}>
          <button className={s.navBtn} onClick={() => p.onDate(shiftDay(p.date, -1))} aria-label="Hari sebelumnya"><IcChevL /></button>
          <label className={s.dateLabel}>
            <span>{dayLabel(p.date)}</span>
            <input type="date" value={p.date} onChange={(e) => e.target.value && p.onDate(e.target.value)} aria-label="Pilih tanggal" />
          </label>
          <button className={s.navBtn} onClick={() => p.onDate(shiftDay(p.date, 1))} aria-label="Hari berikutnya"><IcChevR /></button>
          {p.date !== p.today && <button className={s.todayBtn} onClick={() => p.onDate(p.today)}>Hari ini</button>}
        </div>
        <div className={s.boardRight}>
          <div className={s.search}>
            <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
            <input value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder="Cari tujuan, driver, plat, requestor" aria-label="Cari tugas" />
          </div>
          <button className={s.ghostBtn} onClick={p.onPrintAll} disabled={p.printCount === 0} title="Cetak bukti semua tugas yang tampil">
            <IcPrint size={16} />Cetak semua{p.printCount > 0 ? ` (${p.printCount})` : ""}
          </button>
        </div>
      </div>

      <div className={s.pipeline}>
        <div className={s.pipeHead}>
          <div className={s.pipeTotal}><b>{stats.total}</b><span>tugas</span></div>
          <div className={s.pipeRate}>{stats.total === 0 ? "Belum ada tugas hari ini" : `${doneRate}% selesai`}</div>
        </div>
        <div className={s.pipeBar} role="img" aria-label="Komposisi status tugas">
          {stats.total === 0 && <span className={s.pipeEmpty} />}
          {segs.filter((g) => g.n > 0).map((g) => (
            <button
              key={g.st}
              className={`${s.pipeSeg} ${p.statusFilter && p.statusFilter !== g.st ? s.dim : ""}`}
              style={{ flexGrow: g.n, ["--c" as string]: TONE[g.st].color }}
              onClick={() => p.onStatus(p.statusFilter === g.st ? null : g.st)}
              aria-label={`${TONE[g.st].label}: ${g.n}`}
              title={`${TONE[g.st].label} · ${g.n}`}
            />
          ))}
        </div>
        <div className={s.chips}>
          {segs.map((g) => (
            <button
              key={g.st}
              className={`${s.chip} ${p.statusFilter === g.st ? s.chipOn : ""} ${g.n === 0 ? s.chipZero : ""}`}
              style={{ ["--c" as string]: TONE[g.st].color }}
              onClick={() => p.onStatus(p.statusFilter === g.st ? null : g.st)}
              aria-pressed={p.statusFilter === g.st}
            >
              <i className={s.chipDot} />{TONE[g.st].label}<em>{g.n}</em>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── kartu tugas ───────────────────────── */

function StatusTimes({ t }: { t: TaskDetail }) {
  if (t.status === "CANCELLED") {
    return (
      <div className={s.cancelNote}>
        Dibatalkan{t.cancelled_at ? ` ${hhmm(t.cancelled_at)}` : ""}{t.cancelled_by ? ` oleh ${t.cancelled_by === "driver" ? "driver" : "admin"}` : ""}
        {t.cancel_reason ? <> · <i>“{t.cancel_reason}”</i></> : null}
      </div>
    );
  }
  const parts = [`Ditugaskan ${hhmm(t.created_at)}`];
  if (t.accepted_at) parts.push(`Berjalan ${hhmm(t.accepted_at)}`);
  if (t.completed_at) parts.push(`Selesai ${hhmm(t.completed_at)}`);
  return <div className={s.timesTxt}>{parts.join(" · ")}</div>;
}

export function TaskCard({
  task: t, onAdvance, onCancel, onDelete, onPrint,
}: {
  task: TaskDetail;
  onAdvance: (t: TaskDetail, status: TaskStatus) => void;
  onCancel: (t: TaskDetail) => void;
  onDelete: (t: TaskDetail) => void;
  onPrint: (t: TaskDetail) => void;
}) {
  const tone = TONE[t.status];
  const asal = (t.lokasi_asal && t.lokasi_asal.trim()) || plantLocation(t.plant);
  const open = t.status === "ASSIGNED" || t.status === "ON GOING";
  return (
    <article className={`${s.card} ${s["st_" + tone.key]}`} style={{ ["--tone" as string]: tone.color }}>
      <header className={s.cardTop}>
        <Avatar name={t.driver_nama || "?"} />
        <div className={s.who}>
          <div className={s.whoName} title={tidy(t.driver_nama)}>{tidy(t.driver_nama) || "Belum ada driver"}</div>
          <div className={s.whoSub}>
            <span className={s.plate}>{t.kendaraan || "—"}</span>
            {t.kendaraan_jenis ? <span className={s.dimTxt} title={t.kendaraan_jenis}>{tidy(t.kendaraan_jenis)}</span> : null}
            <span className={s.plantTag}>{t.plant}</span>
          </div>
        </div>
        <div className={s.topRight}>
          <span className={s.status}>{tone.label}</span>
          <span className={s.time}>{hhmm(t.created_at)}</span>
        </div>
      </header>

      <div className={s.route}>
        <div className={s.stop}>
          <span className={s.stopLabel}><i className={s.dotFrom} />Dari</span>
          <b title={asal}>{tidy(asal)}</b>
        </div>
        <div className={s.path} aria-hidden="true"><i /><span><IcCar size={16} /></span><i /></div>
        <div className={`${s.stop} ${s.stopTo}`}>
          <span className={s.stopLabel}><i className={s.dotTo} />Tujuan</span>
          <b title={t.tujuan}>{tidy(t.tujuan)}</b>
        </div>
      </div>

      <div className={s.meta}>
        <span className={s.tag} title={t.jenis_pekerjaan}>{t.jenis_pekerjaan}</span>
        <span className={s.tagSoft} title={`Requestor: ${t.requestor}${t.departement ? ` · ${t.departement}` : ""}`}>Req. {t.requestor}{t.departement ? ` · ${t.departement}` : ""}</span>
        {t.batch_id && t.batch_total_days > 1 ? <span className={s.tagSoft} style={{ flex: "none" }}>Rentang {t.batch_total_days} hari</span> : null}
      </div>
      <p className={`${s.note} ${t.perihal ? "" : s.noteNone}`} title={t.perihal || undefined}>{t.perihal || "Tidak ada catatan"}</p>

      <StatusTimes t={t} />

      <footer className={s.actions}>
        {open && (
          <button className={s.advance} onClick={() => onAdvance(t, t.status === "ASSIGNED" ? "ON GOING" : "DONE")}>
            {t.status === "ASSIGNED" ? "Proses tugas" : "Selesaikan"}
          </button>
        )}
        <button className={s.printBtn} onClick={() => onPrint(t)} title="Cetak bukti penugasan">
          <IcPrint size={15} />Cetak
        </button>
        <span className={s.spacer} />
        {open && <button className={s.linkBtn} onClick={() => onCancel(t)}>Batalkan</button>}
        <button className={`${s.linkBtn} ${s.linkDanger}`} onClick={() => onDelete(t)}>Hapus</button>
      </footer>
    </article>
  );
}

export function TaskEmpty({ filtered, onNew, onClear }: { filtered: boolean; onNew: () => void; onClear: () => void }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIc} aria-hidden="true"><IcCar size={30} /></span>
      <b>{filtered ? "Tidak ada tugas yang cocok" : "Belum ada penugasan di tanggal ini"}</b>
      <p>{filtered ? "Ubah pencarian atau hapus filter status untuk melihat semua tugas." : "Tugaskan driver untuk memulai. Tiap tugas mencatat dari mana dan ke mana."}</p>
      {filtered ? <button className={s.ghostBtn} onClick={onClear}>Hapus filter</button> : <button className={s.primary} onClick={onNew}><IcPlus size={16} />Tugaskan driver</button>}
    </div>
  );
}

/* ───────────────────────── modal cetak ───────────────────────── */

export function TaskSlipModal({ tasks, printedBy, onClose }: { tasks: TaskDetail[]; printedBy: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(
    () => buildTaskSlipsHtml(tasks, { printedBy, origin: typeof window !== "undefined" ? window.location.origin : "" }),
    [tasks, printedBy]
  );
  const print = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };
  const pages = Math.ceil(tasks.length / 2);
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={920}>
      <div className={s.slipModal}>
        <header className={s.slipHead}>
          <div>
            <h2>{tasks.length === 1 ? "Bukti penugasan" : `Bukti penugasan · ${tasks.length} tugas`}</h2>
            <p>
              {tasks.length === 1 ? <>No. Ref <b className={s.mono}>{taskRefNo(tasks[0])}</b> · </> : null}
              Ukuran A4, dua bukti per lembar{pages > 1 ? ` (${pages} lembar)` : ""}. Hitam-putih juga jelas.
            </p>
          </div>
          <button className={s.x} onClick={onClose} aria-label="Tutup"><IcX size={18} /></button>
        </header>
        <iframe ref={frame} className={s.slipFrame} title="Pratinjau bukti penugasan" srcDoc={html} />
        <footer className={s.slipFoot}>
          <button className={s.ghostBtn} onClick={onClose}>Tutup</button>
          <button className={s.primary} onClick={print}><IcPrint size={16} />Cetak</button>
        </footer>
      </div>
    </ModalPortal>
  );
}

/* ───────────────────────── form penugasan ───────────────────────── */

export interface TaskFormValues {
  plant: Plant; dateMode: "single" | "range"; tanggal: string; tanggalTo: string;
  asal: string; tujuan: string; driverId: string; vehicleId: string;
  jenisPekerjaan: string; requestor: string; departement: string; perihal: string; requestorEmail: string;
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Ticket({ v, driver, vehicle }: { v: TaskFormValues; driver?: Driver; vehicle?: Vehicle }) {
  const date = v.dateMode === "range" && v.tanggalTo !== v.tanggal ? `${dayLabel(v.tanggal)} – ${dayLabel(v.tanggalTo)}` : dayLabel(v.tanggal);
  return (
    <div className={s.ticket}>
      <div className={s.tkMain}>
        <div className={s.tkTop}><span>Tiket penugasan</span><span>{v.plant}</span></div>
        <div className={s.tkRoute}>
          <div className={s.tkStop}><small>Dari</small><b className={v.asal ? "" : s.tkEmpty}>{v.asal || "Belum diisi"}</b></div>
          <div className={s.tkPath} aria-hidden="true"><i /><span><IcCar size={15} /></span><i /></div>
          <div className={s.tkStop}><small>Ke</small><b className={v.tujuan ? "" : s.tkEmpty}>{v.tujuan || "Belum diisi"}</b></div>
        </div>
        <div className={s.tkMeta}>
          {v.jenisPekerjaan ? <span className={s.tag}>{v.jenisPekerjaan}</span> : <span className={s.tagGhost}>Jenis pekerjaan</span>}
          <span className={s.tkReq}>{v.requestor ? `Req. ${v.requestor}` : "Requestor belum dipilih"}</span>
        </div>
        {v.perihal.trim() ? <p className={s.tkNote}>{v.perihal.trim()}</p> : null}
      </div>
      <div className={s.tkNotch} aria-hidden="true" />
      <div className={s.tkStub}>
        <div className={s.tkWho}>
          {driver ? <Avatar name={driver.nama} size={34} /> : <span className={s.tkAvatarEmpty} />}
          <div>
            <b>{driver?.nama ?? "Driver belum dipilih"}</b>
            <span className={s.plate}>{vehicle ? `${vehicle.nopol}${vehicle.jenis ? ` · ${vehicle.jenis}` : ""}` : "Kendaraan belum dipilih"}</span>
          </div>
        </div>
        <div className={s.tkDate}>{date}</div>
      </div>
    </div>
  );
}

export function TaskForm(p: {
  drivers: Driver[]; vehicles: Vehicle[]; employees: Employee[]; jobTypes: JobType[];
  lockedPlant: Plant | null; places: string[]; busy: boolean; error: string;
  onSubmit: (v: TaskFormValues) => void; onClose: () => void;
}) {
  const [plant, setPlant] = useState<Plant>(p.lockedPlant ?? "CIK");
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [tanggal, setTanggal] = useState(isoToday());
  const [tanggalTo, setTanggalTo] = useState(isoToday());
  const [asal, setAsal] = useState(plantLocation(p.lockedPlant ?? "CIK"));
  const [asalTouched, setAsalTouched] = useState(false);
  const [tujuan, setTujuan] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [jenisPekerjaan, setJenisPekerjaan] = useState("");
  const [requestor, setRequestor] = useState("");
  const [departement, setDepartement] = useState("");
  const [perihal, setPerihal] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [localErr, setLocalErr] = useState("");
  const tujuanRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (p.lockedPlant) setPlant(p.lockedPlant); }, [p.lockedPlant]);

  const drivers = p.drivers.filter((d) => !d.plant || d.plant === plant);
  const vehicles = p.vehicles.filter((v) => !v.plant || v.plant === plant);
  const driver = p.drivers.find((d) => d.id === driverId);
  const vehicle = p.vehicles.find((v) => v.id === vehicleId);

  const today = isoToday();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

  const required = [asal.trim(), tujuan.trim(), driverId, vehicleId, jenisPekerjaan, requestor];
  const filled = required.filter(Boolean).length;
  const ready = filled === required.length;

  const recentTujuan = useMemo(() => {
    const own = new Set([plantLocation("CIK"), plantLocation("PRB")].map((x) => x.toLowerCase()));
    return p.places.filter((x) => !own.has(x.toLowerCase())).slice(0, 5);
  }, [p.places]);

  function pickPlant(next: Plant) {
    setPlant(next);
    setDriverId("");
    setVehicleId("");
    if (!asalTouched) setAsal(plantLocation(next));
  }
  function swap() {
    const a = asal, b = tujuan;
    setAsal(b); setTujuan(a); setAsalTouched(true);
  }
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ");

  function pickRequestor(name: string) {
    setRequestor(name);
    const emp = p.employees.find((e) => e.nama === name);
    if (emp?.departement) setDepartement(emp.departement);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr("");
    if (!asal.trim()) return setLocalErr("Isi lokasi keberangkatan (Dari mana)");
    if (!driverId || !vehicleId || !jenisPekerjaan || !tujuan.trim() || !requestor) return setLocalErr("Lengkapi semua isian wajib");
    if (dateMode === "range") {
      if (tanggalTo < tanggal) return setLocalErr("Tanggal selesai tidak boleh sebelum tanggal mulai");
      if (!requestorEmail) return setLocalErr("Email requestor wajib diisi untuk penugasan rentang tanggal");
    }
    p.onSubmit({ plant, dateMode, tanggal, tanggalTo, asal: asal.trim(), tujuan: tujuan.trim(), driverId, vehicleId, jenisPekerjaan, requestor, departement, perihal, requestorEmail });
  }

  const values: TaskFormValues = { plant, dateMode, tanggal, tanggalTo, asal: asal.trim(), tujuan: tujuan.trim(), driverId, vehicleId, jenisPekerjaan, requestor, departement, perihal, requestorEmail };
  const err = localErr || p.error;
  const missing = !asal.trim() ? "Isi lokasi keberangkatan" : !tujuan.trim() ? "Isi tujuan" : !driverId ? "Pilih driver" : !vehicleId ? "Pilih kendaraan" : !jenisPekerjaan ? "Pilih jenis pekerjaan" : !requestor ? "Pilih requestor" : "";

  return (
    <form className={s.form} onSubmit={submit}>
      <header className={s.formHead}>
        <div>
          <h2>Tugaskan driver</h2>
          <p>Mulai dari rute: dari mana dan ke mana. Tiket di kanan ikut terisi.</p>
        </div>
        <button type="button" className={s.x} onClick={p.onClose} aria-label="Tutup"><IcX size={18} /></button>
      </header>
      <div className={s.progress} aria-hidden="true"><i style={{ width: `${(filled / required.length) * 100}%` }} data-ready={ready} /></div>

      <div className={s.formBody}>
        <div className={s.formCol}>
          {/* rute */}
          <section className={s.block}>
            <h3>Rute perjalanan</h3>
            <div className={s.routeBox}>
              <label className={s.rField}>
                <span><i className={s.dotFrom} />Lokasi keberangkatan / penjemputan</span>
                <input
                  className={s.input}
                  list="task-places"
                  value={asal}
                  onChange={(e) => { setAsal(clean(e.target.value)); setAsalTouched(true); }}
                  placeholder="mis. Plant Cikarang, Gudang, rumah requestor"
                  autoComplete="off"
                />
              </label>
              <div className={s.swapRow}>
                <span className={s.swapLine} />
                <button type="button" className={s.swap} onClick={swap} disabled={!asal && !tujuan} title="Tukar dari ↔ ke (untuk perjalanan pulang)">
                  <IcSwap size={15} />Tukar
                </button>
                <span className={s.swapLine} />
              </div>
              <label className={s.rField}>
                <span><i className={s.dotTo} />Tujuan</span>
                <input
                  ref={tujuanRef}
                  className={s.input}
                  list="task-places"
                  value={tujuan}
                  onChange={(e) => setTujuan(clean(e.target.value))}
                  onPaste={(e) => {
                    // Newline hasil paste pernah merusak header Subject email notifikasi → jadi satu baris.
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text").replace(/[\r\n]+/g, " ");
                    const el = e.currentTarget;
                    const a = el.selectionStart ?? tujuan.length, b = el.selectionEnd ?? tujuan.length;
                    setTujuan(tujuan.slice(0, a) + pasted + tujuan.slice(b));
                  }}
                  placeholder="mis. Kantor Cabang Selatan"
                  autoComplete="off"
                />
              </label>
              <datalist id="task-places">{p.places.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
            <div className={s.quickRow}>
              <span className={s.quickLbl}>Dari:</span>
              {(["CIK", "PRB"] as Plant[]).map((pl) => (
                <button type="button" key={pl} className={`${s.quick} ${asal === plantLocation(pl) ? s.quickOn : ""}`} onClick={() => { setAsal(plantLocation(pl)); setAsalTouched(true); }}>
                  {plantLocation(pl)}
                </button>
              ))}
            </div>
            {recentTujuan.length > 0 && (
              <div className={s.quickRow}>
                <span className={s.quickLbl}>Tujuan terakhir:</span>
                {recentTujuan.map((x) => (
                  <button type="button" key={x} className={`${s.quick} ${tujuan === x ? s.quickOn : ""}`} onClick={() => setTujuan(x)}>{x}</button>
                ))}
              </div>
            )}
          </section>

          {/* plant + tanggal */}
          <section className={s.block}>
            <h3>Plant dan tanggal</h3>
            <div className={s.twoCol}>
              <div>
                <div className={s.lbl}>Plant</div>
                {p.lockedPlant ? (
                  <div className={s.locked}><IcLock size={14} />{plantLocation(p.lockedPlant)}<small>khusus plant ini</small></div>
                ) : (
                  <div className={s.seg} style={{ ["--i" as string]: plant === "CIK" ? 0 : 1, ["--n" as string]: 2 }}>
                    <span className={s.segInk} aria-hidden="true" />
                    {(["CIK", "PRB"] as Plant[]).map((pl) => (
                      <button type="button" key={pl} className={`${s.segBtn} ${plant === pl ? s.segOn : ""}`} aria-pressed={plant === pl} onClick={() => pickPlant(pl)}>{pl}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className={s.lbl}>Lama tugas</div>
                <div className={s.seg} style={{ ["--i" as string]: dateMode === "single" ? 0 : 1, ["--n" as string]: 2 }}>
                  <span className={s.segInk} aria-hidden="true" />
                  {(["single", "range"] as const).map((m) => (
                    <button type="button" key={m} className={`${s.segBtn} ${dateMode === m ? s.segOn : ""}`} aria-pressed={dateMode === m} onClick={() => setDateMode(m)}>{m === "single" ? "1 hari" : "Rentang"}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className={s.dateRow}>
              <input type="date" className={s.input} value={tanggal} onChange={(e) => setTanggal(e.target.value)} aria-label="Tanggal tugas" />
              {dateMode === "range" ? (
                <>
                  <span className={s.to}>s/d</span>
                  <input type="date" className={s.input} value={tanggalTo} min={tanggal} onChange={(e) => setTanggalTo(e.target.value)} aria-label="Tanggal selesai" />
                </>
              ) : (
                <>
                  <button type="button" className={`${s.quick} ${tanggal === today ? s.quickOn : ""}`} onClick={() => setTanggal(today)}>Hari ini</button>
                  <button type="button" className={`${s.quick} ${tanggal === tomorrow ? s.quickOn : ""}`} onClick={() => setTanggal(tomorrow)}>Besok</button>
                </>
              )}
            </div>
            {dateMode === "range" && (
              <label className={s.field}>
                <span>Email requestor <em>untuk notifikasi otomatis</em></span>
                <input type="email" className={s.input} placeholder="nama@perusahaan.com" value={requestorEmail} onChange={(e) => setRequestorEmail(e.target.value)} />
              </label>
            )}
          </section>

          {/* driver */}
          <section className={s.block}>
            <h3>Driver &amp; kendaraan</h3>
            <div className={s.twoCol}>
              <label className={s.field}>
                <span>Driver</span>
                <select className={s.input} value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Driver">
                  <option value="">{drivers.length === 0 ? "Tidak ada driver di plant ini" : "— Pilih driver —"}</option>
                  {drivers.map((d) => {
                    const locked = isUserDriver(d);
                    return (
                      <option key={d.id} value={d.id} disabled={locked}>
                        {d.nama}{locked ? ` — Driver User (On Duty${d.assigned_user ? ` · ${d.assigned_user}` : ""})` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className={s.field}>
                <span>Kendaraan</span>
                <select className={s.input} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} aria-label="Kendaraan">
                  <option value="">{vehicles.length === 0 ? "Tidak ada kendaraan di plant ini" : "— Pilih kendaraan —"}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.nopol}{v.jenis ? ` (${v.jenis})` : ""}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* detail */}
          <section className={s.block}>
            <h3>Detail tugas</h3>
            <div className={s.lbl}>Jenis pekerjaan</div>
            <div className={s.chipsWrap} role="radiogroup" aria-label="Jenis pekerjaan">
              {p.jobTypes.map((j) => (
                <button type="button" key={j.id} role="radio" aria-checked={jenisPekerjaan === j.label} className={`${s.cat} ${jenisPekerjaan === j.label ? s.catOn : ""}`} onClick={() => setJenisPekerjaan(j.label)}>{j.label}</button>
              ))}
            </div>
            <div className={s.twoCol} style={{ marginTop: 14 }}>
              <label className={s.field}>
                <span>Requestor</span>
                <select className={s.input} value={requestor} onChange={(e) => pickRequestor(e.target.value)}>
                  <option value="">Pilih pegawai</option>
                  {p.employees.map((emp) => <option key={emp.id} value={emp.nama}>{emp.nama}</option>)}
                </select>
              </label>
              <label className={s.field}>
                <span>Departemen</span>
                <input className={s.input} value={departement} onChange={(e) => setDepartement(e.target.value)} placeholder="Terisi otomatis" />
              </label>
            </div>
            <label className={s.field}>
              <span>Perihal <em>opsional</em></span>
              <textarea className={`${s.input} ${s.textarea}`} value={perihal} onChange={(e) => setPerihal(e.target.value)} placeholder="Catatan tambahan untuk driver" />
            </label>
          </section>
        </div>

        <aside className={s.side} aria-label="Pratinjau tiket">
          <div className={s.sideSticky}>
            <Ticket v={values} driver={driver} vehicle={vehicle} />
            <ul className={s.checks}>
              {[
                ["Lokasi asal", !!asal.trim()],
                ["Tujuan", !!tujuan.trim()],
                ["Driver", !!driverId],
                ["Kendaraan", !!vehicleId],
                ["Jenis pekerjaan", !!jenisPekerjaan],
                ["Requestor", !!requestor],
              ].map(([label, ok]) => (
                <li key={label as string} data-ok={ok as boolean}><i />{label as string}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {err && <div className={s.formErr} role="alert">{err}</div>}
      <footer className={s.formFoot}>
        <button type="button" className={s.ghostBtn} onClick={p.onClose}>Batal</button>
        <div className={s.footInfo}>{ready ? <b data-ok="true">Siap ditugaskan</b> : <span>{missing} · {filled} dari {required.length} terisi</span>}</div>
        <button type="submit" className={s.submit} disabled={p.busy}>{p.busy ? "Menyimpan…" : "Tugaskan driver"}</button>
      </footer>
    </form>
  );
}

/* ───────────────────────── sukses + WhatsApp ───────────────────────── */

export function TaskSuccess({ message, onDone, onWhatsapp }: { message: string; onDone: () => void; onWhatsapp: string }) {
  return (
    <div className={s.success}>
      <div className={s.okIc} aria-hidden="true"><Svg size={26} sw={2.6}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg></div>
      <h2>Tugas berhasil dibuat</h2>
      <p>Bagikan detail penugasan ke driver atau grup lewat WhatsApp. Bukti cetak tersedia di tiap kartu tugas.</p>
      <pre className={s.wa}>{message}</pre>
      <div className={s.successFoot}>
        <button className={s.ghostBtn} onClick={onDone}>Selesai</button>
        <a className={s.wabtn} href={onWhatsapp} target="_blank" rel="noopener noreferrer" onClick={onDone}>Kirim via WhatsApp</a>
      </div>
    </div>
  );
}
