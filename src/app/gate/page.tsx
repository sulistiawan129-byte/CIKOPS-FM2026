"use client";

/* ════════════════════════════════════════════════════════════
   /gate — Pos Security Plant Cikarang
   • Kendaraan CIK : KELUAR plant  → KEMBALI
   • Kendaraan PRB : MASUK CIK     → KELUAR CIK
   Data & aksi memakai RPC publik yang sama seperti sebelumnya.
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeGateCheckpoint, getActiveDriversForGate, getActiveVehiclesForGate, getGateLogsPublic, openGateCheckpoint,
} from "@/lib/api";
import type { GateDriverOption, GateVehicleOption, Plant, VehicleGateLog } from "@/lib/types";
import s from "./gate.module.css";

type Mode = "light" | "dark";
type Tab = "active" | "done" | "all";
type PlantF = "all" | Plant;

const DEFAULT_TUJUAN = ["Plant Pasar Rebo", "Bank", "Customer", "Bengkel / Servis", "Kantor Pusat"];
const PAGE = 12;

/* ── util waktu (zona lokal, bukan UTC) ── */
const pad = (n: number) => String(n).padStart(2, "0");
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (iso: string | null) => (iso ? (() => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; })() : "–");
const fmtDur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}j ${pad(min % 60)}m` : `${min}m`);
const minsBetween = (a: string | null, b: string | number | null) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)) : null);

/** kejadian pertama & kedua sesuai plant */
function ev(l: VehicleGateLog) {
  return l.plant === "CIK"
    ? { first: l.timeOut, second: l.timeIn, firstLbl: "Keluar", secondLbl: "Kembali", act: "Catat Kembali", running: "Di luar", doneLbl: "Sudah kembali" }
    : { first: l.timeIn, second: l.timeOut, firstLbl: "Masuk CIK", secondLbl: "Keluar CIK", act: "Catat Keluar CIK", running: "Di dalam", doneLbl: "Sudah keluar" };
}
const pVar = (p: Plant) => ({ ["--p" as string]: p === "PRB" ? "var(--g-prb)" : "var(--g-cik)" });

/* ── ikon ── */
const I = {
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>,
  car: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14v-5l-2-5H7l-2 5z" /><path d="M3 12h18" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /></svg>,
  out: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h5v16h-5" /><path d="M3 12h11m-4-4 4 4-4 4" /></svg>,
  in: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4H5v16h5" /><path d="M21 12H10m4-4-4 4 4 4" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>,
  empty: <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14v-5l-2-5H7l-2 5z" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /></svg>,
};

export default function GatePage() {
  const [mode, setMode] = useState<Mode>("light");
  const [officer, setOfficer] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const today = now ? localISO(now) : "";

  const [vehicles, setVehicles] = useState<GateVehicleOption[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [logs, setLogs] = useState<VehicleGateLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tanggal, setTanggal] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [plateQ, setPlateQ] = useState("");
  const [driverId, setDriverId] = useState("");
  const [manual, setManual] = useState(false);
  const [driverManual, setDriverManual] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [ket, setKet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autoDriver, setAutoDriver] = useState("");

  const [tab, setTab] = useState<Tab>("active");
  const [plantF, setPlantF] = useState<PlantF>("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ plate: string; text: string } | null>(null);
  const plateRef = useRef<HTMLInputElement>(null);

  /* jam & tanggal awal (lokal) */
  useEffect(() => {
    const d = new Date();
    setNow(d);
    setTanggal(localISO(d));
    const t = setInterval(() => setNow(new Date()), 1000);
    try {
      const m = localStorage.getItem("gate-theme");
      if (m === "light" || m === "dark") setMode(m);
      setOfficer(localStorage.getItem("gate-officer-name") ?? "");
    } catch { /* abaikan */ }
    return () => clearInterval(t);
  }, []);

  const loadLogs = useCallback(async (silent = false) => {
    if (!tanggal) return;
    if (!silent) setLoading(true);
    try { setLogs(await getGateLogsPublic(tanggal)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Gagal memuat aktivitas gate"); }
    finally { setLoading(false); }
  }, [tanggal]);

  useEffect(() => {
    getActiveVehiclesForGate().then(setVehicles).catch(() => setError("Gagal memuat daftar kendaraan"));
    getActiveDriversForGate().then(setDrivers).catch(() => {});
  }, []);
  useEffect(() => {
    loadLogs();
    const t = setInterval(() => loadLogs(true), 15000);
    return () => clearInterval(t);
  }, [loadLogs]);
  useEffect(() => { setShown(PAGE); }, [tab, plantF, q, tanggal]);
  useEffect(() => { if (!confirmId) return; const t = setTimeout(() => setConfirmId(null), 3500); return () => clearTimeout(t); }, [confirmId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3800); return () => clearTimeout(t); }, [toast]);

  function toggleMode() {
    const m = mode === "light" ? "dark" : "light";
    setMode(m);
    try { localStorage.setItem("gate-theme", m); } catch { /* abaikan */ }
  }
  function editOfficer() {
    const n = window.prompt("Nama petugas gate yang sedang bertugas:", officer);
    if (n === null) return;
    setOfficer(n.trim());
    try { localStorage.setItem("gate-officer-name", n.trim()); } catch { /* abaikan */ }
  }

  /* ── turunan data ── */
  const active = useMemo(() => logs.filter((l) => l.status !== "DONE"), [logs]);
  const done = useMemo(() => logs.filter((l) => l.status === "DONE"), [logs]);
  const busyVehicle = useMemo(() => new Map(active.map((l) => [l.vehicleId, l])), [active]);
  const selected = vehicles.find((v) => v.id === vehicleId) ?? null;
  const vList = useMemo(() => {
    const t = plateQ.replace(/\s+/g, "").toLowerCase();
    return vehicles
      .filter((v) => !t || v.nopol.replace(/\s+/g, "").toLowerCase().includes(t) || v.jenis.toLowerCase().includes(t))
      .sort((a, b) => Number(busyVehicle.has(a.id)) - Number(busyVehicle.has(b.id)) || a.plant.localeCompare(b.plant) || a.nopol.localeCompare(b.nopol));
  }, [vehicles, plateQ, busyVehicle]);
  const tujuanChips = useMemo(() => {
    const m = new Map<string, number>();
    logs.forEach((l) => { const k = l.tujuan.trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return [...new Set([...top, ...DEFAULT_TUJUAN])].slice(0, 6);
  }, [logs]);
  const avgDur = useMemo(() => {
    const ds = done.map((l) => { const e = ev(l); return minsBetween(e.first, e.second); }).filter((x): x is number => x !== null);
    return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
  }, [done]);
  const hourly = useMemo(() => {
    const H = Array.from({ length: 19 }, (_, i) => ({ h: i + 5, out: 0, in: 0 }));
    const add = (iso: string | null, k: "out" | "in") => {
      if (!iso) return;
      const d = new Date(iso);
      if (localISO(d) !== tanggal) return;
      const slot = H.find((x) => x.h === d.getHours()) ?? (d.getHours() < 5 ? H[0] : H[H.length - 1]);
      slot[k]++;
    };
    logs.forEach((l) => { add(l.timeOut, "out"); add(l.timeIn, "in"); });
    return H;
  }, [logs, tanggal]);
  const maxH = Math.max(1, ...hourly.map((x) => x.out + x.in));

  const list = useMemo(() => {
    const base = tab === "active" ? active : tab === "done" ? done : logs;
    const t = q.trim().toLowerCase();
    return base
      .filter((l) => plantF === "all" || l.plant === plantF)
      .filter((l) => !t || [l.nopol, l.driverName, l.tujuan, l.keterangan ?? "", l.jenis].join(" ").toLowerCase().includes(t))
      .sort((a, b) => {
        if (tab === "active") return (ev(a).first ?? "").localeCompare(ev(b).first ?? "");
        return (ev(b).second ?? ev(b).first ?? b.createdAt).localeCompare(ev(a).second ?? ev(a).first ?? a.createdAt);
      });
  }, [tab, active, done, logs, plantF, q]);

  /* ── form ── */
  function pick(v: GateVehicleOption) {
    if (busyVehicle.has(v.id)) return;
    setVehicleId(v.id);
    setPlateQ(v.nopol);
    // driver otomatis: driver terakhir yang membawa kendaraan ini hari ini
    const last = [...logs].filter((l) => l.vehicleId === v.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (last) {
      const d = drivers.find((x) => x.nama.trim().toLowerCase() === last.driverName.trim().toLowerCase());
      if (d) { setManual(false); setDriverId(d.id); setAutoDriver(d.nama); }
      else { setManual(true); setDriverManual(last.driverName); setAutoDriver(last.driverName); }
    } else setAutoDriver("");
  }
  function clearVehicle() { setVehicleId(""); setPlateQ(""); setAutoDriver(""); plateRef.current?.focus(); }
  const driverOk = manual ? driverManual.trim() !== "" : driverId !== "";
  const canSubmit = !!selected && driverOk && !submitting && !!tanggal;

  async function submit() {
    if (!canSubmit || !selected) return;
    setSubmitting(true); setError("");
    try {
      const n = new Date();
      const [y, m, d] = tanggal.split("-").map(Number);
      const ts = new Date(y, m - 1, d, n.getHours(), n.getMinutes(), n.getSeconds()).toISOString();
      await openGateCheckpoint({
        vehicleId: selected.id, driverId: manual ? null : driverId, driverNameManual: manual ? driverManual.trim() : null,
        tujuan: tujuan.trim(), keterangan: ket.trim(), timestamp: ts,
      });
      setToast({ plate: selected.nopol, text: `${selected.plant === "PRB" ? "tercatat MASUK CIK" : "tercatat KELUAR"} · ${pad(n.getHours())}:${pad(n.getMinutes())}` });
      const vid = selected.id;
      setVehicleId(""); setPlateQ(""); setDriverId(""); setManual(false); setDriverManual(""); setTujuan(""); setKet(""); setAutoDriver("");
      setTab("active");
      const fresh = await getGateLogsPublic(tanggal);
      setLogs(fresh);
      const nl = fresh.filter((l) => l.vehicleId === vid && l.status !== "DONE")[0];
      if (nl) { setFlashId(nl.id); setTimeout(() => setFlashId(null), 1800); }
      plateRef.current?.focus();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal mencatat kendaraan"); }
    finally { setSubmitting(false); }
  }

  async function closeTrip(l: VehicleGateLog) {
    if (confirmId !== l.id) { setConfirmId(l.id); return; }
    setConfirmId(null); setBusyId(l.id); setError("");
    try {
      await closeGateCheckpoint(l.vehicleId);
      const n = new Date();
      setToast({ plate: l.nopol, text: `${l.plant === "PRB" ? "tercatat KELUAR CIK" : "tercatat KEMBALI"} · ${pad(n.getHours())}:${pad(n.getMinutes())}` });
      await loadLogs(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal mencatat data"); }
    finally { setBusyId(null); }
  }

  const tglObj = tanggal ? new Date(tanggal + "T00:00:00") : null;
  const isToday = tanggal === today;
  const kpiSet = (t: Tab, p: PlantF) => { setTab(t); setPlantF(p); };
  const cikOut = active.filter((l) => l.plant === "CIK").length;
  const prbIn = active.filter((l) => l.plant === "PRB").length;
  const nowMs = now?.getTime() ?? 0;

  return (
    <div className={`${s.root} ${mode === "dark" ? s.dark : ""}`}>
      {/* ── HEADER ── */}
      <header className={s.head}>
        <div className={s.brand}>
          <img src="/logo.png" alt="CIKOPS FM" />
          <div><b>Gate Control</b><small>Pos Security · Plant Cikarang</small></div>
        </div>
        <span className={s.grow} />
        <div className={s.clock} aria-live="off"><b>{now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : "--:--:--"}</b><span>WIB</span></div>
        {now && (
          <div className={s.dateChip}>
            <b>{now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</b>
            <small>{now.toLocaleDateString("id-ID", { weekday: "long" })}</small>
          </div>
        )}
        <button type="button" className={s.iconBtn} onClick={toggleMode} aria-label={mode === "light" ? "Mode gelap" : "Mode terang"} title={mode === "light" ? "Mode gelap" : "Mode terang"}>{mode === "light" ? I.moon : I.sun}</button>
        <button type="button" className={s.officer} onClick={editOfficer} title="Ganti nama petugas">
          <i>{officer ? officer.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "SC"}</i>
          <span><small>Petugas</small><b>{officer || "Atur nama"}</b></span>
        </button>
      </header>

      <main className={s.main}>
        {tanggal && !isToday && (
          <div className={s.banner}>
            Melihat & mencatat untuk tanggal {tglObj?.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            <button type="button" onClick={() => setTanggal(today)}>Kembali ke hari ini</button>
          </div>
        )}
        {error && <div className={s.err} role="alert">⚠ {error}</div>}

        {/* ── KPI ── */}
        <section className={s.kpis}>
          <button type="button" className={`${s.kpi} ${tab === "active" && plantF === "CIK" ? s.kpiOn : ""}`} style={{ ["--k" as string]: "var(--g-cik)" }} onClick={() => kpiSet("active", "CIK")}>
            <small>{cikOut > 0 && <span className={s.pulse} />}CIK di luar</small><b>{cikOut}</b><em>kendaraan sedang trip</em>
          </button>
          <button type="button" className={`${s.kpi} ${tab === "active" && plantF === "PRB" ? s.kpiOn : ""}`} style={{ ["--k" as string]: "var(--g-prb)" }} onClick={() => kpiSet("active", "PRB")}>
            <small>{prbIn > 0 && <span className={s.pulse} />}PRB di dalam</small><b>{prbIn}</b><em>kendaraan Pasar Rebo di CIK</em>
          </button>
          <button type="button" className={`${s.kpi} ${tab === "done" && plantF === "all" ? s.kpiOn : ""}`} style={{ ["--k" as string]: "var(--g-green)" }} onClick={() => kpiSet("done", "all")}>
            <small>Selesai</small><b>{done.length}</b><em>trip tuntas {isToday ? "hari ini" : ""}</em>
          </button>
          <button type="button" className={`${s.kpi} ${tab === "all" && plantF === "all" ? s.kpiOn : ""}`} style={{ ["--k" as string]: "var(--g-brand)" }} onClick={() => kpiSet("all", "all")}>
            <small>Total tercatat</small><b>{logs.length}</b><em>{vehicles.length} kendaraan terdaftar</em>
          </button>
          <div className={`${s.kpi} ${s.kpiStatic}`} style={{ ["--k" as string]: "#8b6cff" }}>
            <small>Rata-rata durasi</small><b>{avgDur === null ? "–" : fmtDur(avgDur)}</b><em>dari trip yang selesai</em>
          </div>
        </section>

        <div className={s.grid}>
          {/* ── FORM ── */}
          <section className={`${s.card} ${s.form} ${selected ? (selected.plant === "PRB" ? s.formPrb : s.formCik) : ""}`} aria-label="Catat kendaraan">
            <div className={s.cardHead}>
              <i>{I.car}</i>
              <div className={s.grow}><b>Catat Kendaraan</b><small>Pilih kendaraan, driver, lalu simpan.</small></div>
            </div>

            <div className={s.step}>
              <div className={s.label}><span><em>1</em>Kendaraan</span>{selected && <button type="button" className={s.link} onClick={clearVehicle}>Ganti</button>}</div>
              <div className={s.plateWrap}>
                <input
                  ref={plateRef}
                  className={`${s.input} ${s.plateInput}`}
                  value={plateQ}
                  onChange={(e) => { setPlateQ(e.target.value.toUpperCase()); setVehicleId(""); setAutoDriver(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { const f = vList.find((v) => !busyVehicle.has(v.id)); if (f && !selected) { e.preventDefault(); pick(f); } } }}
                  placeholder="Ketik / pilih plat nomor"
                  aria-label="Plat nomor"
                  autoComplete="off"
                />
                {plateQ && <button type="button" className={s.plateClear} onClick={clearVehicle} aria-label="Hapus">×</button>}
              </div>
              {!selected && (
                <div className={s.vgrid}>
                  {vList.length === 0 && <div className={s.vempty}>Plat tidak ditemukan</div>}
                  {vList.slice(0, 60).map((v) => {
                    const b = busyVehicle.get(v.id);
                    return (
                      <button key={v.id} type="button" className={s.vchip} style={pVar(v.plant)} disabled={!!b} onClick={() => pick(v)} title={b ? `${ev(b).running} sejak ${hhmm(ev(b).first)}` : `${v.nopol} · ${v.jenis}`}>
                        <b>{v.nopol}</b>
                        {b ? <small style={{ color: "var(--g-prb-text)", fontWeight: 700 }}>{v.plant === "CIK" ? "Di luar" : "Di dalam"} · {hhmm(ev(b).first)}</small> : <small>{v.plant} · {v.jenis}</small>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selected && (
              <div className={`${s.dir} ${selected.plant === "PRB" ? s.dirPrb : s.dirCik}`}>
                <i>{selected.plant === "PRB" ? I.in : I.out}</i>
                <div><b>{selected.plant === "PRB" ? "MASUK CIK" : "KELUAR PLANT"}</b><small>{selected.jenis}{selected.color ? ` · ${selected.color}` : ""} · {selected.plant === "PRB" ? "Kendaraan Pasar Rebo" : "Kendaraan Cikarang"}</small></div>
                <span className={s.plate} style={{ marginLeft: "auto", fontFamily: "var(--mono, monospace)", fontWeight: 800, fontSize: 15, padding: "6px 10px", borderRadius: 8, border: "2px solid currentColor", whiteSpace: "nowrap" }}>{selected.nopol}</span>
              </div>
            )}

            <div className={s.step}>
              <div className={s.label}><span><em>2</em>Driver</span>
                <button type="button" className={s.link} onClick={() => { setManual((v) => !v); setAutoDriver(""); }}>{manual ? "Pilih dari daftar" : "Ketik manual"}</button>
              </div>
              {manual ? (
                <input className={s.input} value={driverManual} onChange={(e) => setDriverManual(e.target.value)} placeholder="Nama driver / pengemudi" />
              ) : (
                <select className={s.select} value={driverId} onChange={(e) => { setDriverId(e.target.value); setAutoDriver(""); }}>
                  <option value="">— Pilih driver —</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
                </select>
              )}
              {autoDriver && <div className={s.hint}>✓ Terisi otomatis: <b>{autoDriver}</b> (driver terakhir kendaraan ini)</div>}
            </div>

            <div className={s.step}>
              <div className={s.label}><span><em>3</em>Tujuan</span></div>
              <input className={s.input} value={tujuan} onChange={(e) => setTujuan(e.target.value)} placeholder="Contoh: Antar dokumen ke PRB" />
              <div className={s.chips}>
                {tujuanChips.map((t) => <button key={t} type="button" className={`${s.chip} ${tujuan === t ? s.chipOn : ""}`} onClick={() => setTujuan(tujuan === t ? "" : t)}>{t}</button>)}
              </div>
            </div>

            <div className={s.step}>
              <div className={s.label}><span><em>4</em>Keperluan / catatan</span><span style={{ letterSpacing: 0, textTransform: "none", fontWeight: 600 }}>opsional</span></div>
              <textarea className={s.textarea} rows={2} value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Keperluan perjalanan, barang bawaan, dll." />
            </div>

            <div className={s.step} style={{ marginBottom: 20 }}>
              <div className={s.label}><span>Tanggal pencatatan</span></div>
              <input type="date" className={s.input} value={tanggal} max={today || undefined} onChange={(e) => setTanggal(e.target.value)} />
            </div>

            <button type="button" className={`${s.submit} ${selected?.plant === "PRB" ? s.submitPrb : ""}`} disabled={!canSubmit} onClick={submit}>
              {submitting ? "Menyimpan…" : !selected ? "Pilih kendaraan dulu" : !driverOk ? "Pilih driver" : <>{selected.plant === "PRB" ? I.in : I.out} {selected.plant === "PRB" ? "CATAT MASUK CIK" : "CATAT KELUAR"} · {selected.nopol}</>}
            </button>
            <div className={s.kbd}>Tips: ketik plat lalu tekan Enter untuk memilih kendaraan teratas.</div>
          </section>

          <div className={s.side}>
            {/* ── GRAFIK PER JAM ── */}
            <section className={`${s.card} ${s.chart}`}>
              <div className={s.chartHead}>
                <div><b>Pergerakan per jam</b> <small>· {tglObj?.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}</small></div>
                <div className={s.legend}><span><i style={{ background: "var(--g-cik)" }} />Keluar</span><span><i style={{ background: "var(--g-green)" }} />Masuk / kembali</span></div>
              </div>
              <div className={s.bars}>
                {hourly.map((x, hi) => {
                  const tot = x.out + x.in;
                  const isNow = isToday && now?.getHours() === x.h;
                  return (
                    <div key={x.h} className={`${s.barCol} ${isNow ? s.barNow : ""}`}>
                      <span className={s.barTip} style={hi >= hourly.length - 4 ? { left: "auto", right: 0, transform: "none" } : hi < 3 ? { left: 0, transform: "none" } : undefined}>{pad(x.h)}:00 · {x.out} keluar · {x.in} masuk</span>
                      <div className={s.barStack} style={{ height: `${Math.max(4, (tot / maxH) * 100)}%` }}>
                        {x.out > 0 && <span style={{ height: `${(x.out / Math.max(1, tot)) * 100}%`, background: "var(--g-cik)" }} />}
                        {x.in > 0 && <span style={{ height: `${(x.in / Math.max(1, tot)) * 100}%`, background: "var(--g-green)" }} />}
                      </div>
                      <small>{x.h % 2 === 1 ? pad(x.h) : ""}</small>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── DAFTAR AKTIVITAS ── */}
            <section className={`${s.card} ${s.list}`}>
              <div className={s.listHead}>
                <div><b>Aktivitas Gate</b><small>Diperbarui otomatis tiap 15 detik</small></div>
                <span className={s.grow} />
                <label className={s.search}>
                  {I.search}
                  <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari plat, driver, tujuan…" aria-label="Cari" />
                </label>
                <input type="date" className={`${s.input} ${s.dateIn}`} value={tanggal} max={today || undefined} onChange={(e) => setTanggal(e.target.value)} aria-label="Tanggal" />
              </div>
              <div className={s.toolbar}>
                <div className={s.seg} role="tablist">
                  {([["active", "Sedang berjalan", active.length], ["done", "Selesai", done.length], ["all", "Semua", logs.length]] as [Tab, string, number][]).map(([k, lbl, n]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? s.segOn : ""} onClick={() => setTab(k)}>{lbl}<span>{n}</span></button>
                  ))}
                </div>
                <div className={s.seg}>
                  {([["all", "Semua plant"], ["CIK", "CIK"], ["PRB", "PRB"]] as [PlantF, string][]).map(([k, lbl]) => (
                    <button key={k} type="button" aria-pressed={plantF === k} className={plantF === k ? s.segOn : ""} onClick={() => setPlantF(k)}>{lbl}</button>
                  ))}
                </div>
              </div>

              {loading && logs.length === 0 ? (
                <div className={s.cards}>{[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}</div>
              ) : list.length === 0 ? (
                <div className={s.empty}>
                  {I.empty}
                  <b>{tab === "active" ? "Tidak ada kendaraan yang sedang berjalan" : "Belum ada data"}</b>
                  {q ? "Coba kata kunci lain." : tab === "active" ? "Semua kendaraan sudah di tempatnya." : "Belum ada pergerakan tercatat pada tanggal ini."}
                </div>
              ) : tab === "active" ? (
                <div className={s.cards}>
                  {list.slice(0, shown).map((l) => {
                    const e = ev(l);
                    const m = minsBetween(e.first, nowMs) ?? 0;
                    const tone = m >= 480 ? s.tLong : m >= 240 ? s.tWarn : s.tOk;
                    const conf = confirmId === l.id;
                    return (
                      <article key={l.id} className={`${s.trip} ${flashId === l.id ? s.tripFlash : ""}`} style={pVar(l.plant)}>
                        <div className={s.tripTop}>
                          <span className={s.plate} style={{ fontFamily: "var(--mono, monospace)", fontSize: 17, fontWeight: 800, letterSpacing: ".05em", padding: "4px 9px", borderRadius: 8, border: "2px solid var(--g-t1)", background: "var(--g-plate-bg)", color: "var(--g-plate-text)", whiteSpace: "nowrap" }}>{l.nopol}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <b style={{ display: "block", fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.driverName}</b>
                            <small style={{ display: "block", fontSize: 12, color: "var(--g-t3)" }}>{l.jenis}{l.color ? ` · ${l.color}` : ""}</small>
                          </div>
                          <span className={`${s.ptag} ${l.plant === "PRB" ? s.ptagPrb : s.ptagCik}`}>{l.plant}</span>
                        </div>
                        <div className={s.tripMeta}>
                          <div>{I.pin}<span>{l.tujuan || "Tujuan tidak diisi"}{l.keterangan ? <><br /><em>{l.keterangan}</em></> : null}</span></div>
                          <div>{I.clock}<span>{e.firstLbl} {hhmm(e.first)} WIB</span></div>
                        </div>
                        <div className={s.tripFoot}>
                          <div className={`${s.timer} ${tone}`}><small>{e.running}</small><b>{fmtDur(m)}</b></div>
                          <button type="button" className={`${s.act} ${conf ? s.actConfirm : ""}`} disabled={busyId === l.id} onClick={() => closeTrip(l)}>
                            {busyId === l.id ? "Menyimpan…" : conf ? <>{I.check} Ketuk lagi untuk konfirmasi</> : <>{l.plant === "PRB" ? I.out : I.in} {e.act}</>}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={s.done}>
                  {list.slice(0, shown).map((l) => {
                    const e = ev(l);
                    const fin = l.status === "DONE";
                    const m = minsBetween(e.first, fin ? e.second : nowMs);
                    return (
                      <div key={l.id} className={s.doneRow} style={pVar(l.plant)}>
                        <div><span className={s.plate} style={{ fontFamily: "var(--mono, monospace)", fontWeight: 800, fontSize: 14 }}>{l.nopol}</span><small style={{ display: "block", fontSize: 11.5, color: "var(--g-t3)" }}>{l.plant} · {l.jenis}</small></div>
                        <div style={{ minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{l.driverName}</b><small style={{ display: "block", fontSize: 11.5, color: fin ? "var(--g-green-text)" : "var(--g-prb-text)", fontWeight: 700 }}>{fin ? e.doneLbl : e.running.toLowerCase() === "di luar" ? "Sedang keluar" : "Sedang di CIK"}</small></div>
                        <div style={{ color: "var(--g-t2)", minWidth: 0 }}>{l.tujuan || "–"}{l.keterangan ? <small style={{ display: "block", fontSize: 11.5, color: "var(--g-t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.keterangan}</small> : null}</div>
                        <div className={s.flow}>
                          <span>{hhmm(e.first)}<small style={{ display: "block" }}>{e.firstLbl}</small></span>
                          <i />
                          <span>{fin ? hhmm(e.second) : "…"}<small style={{ display: "block" }}>{e.secondLbl}</small></span>
                        </div>
                        <span className={s.dur} style={fin ? undefined : { background: "var(--g-prb-soft)", color: "var(--g-prb-text)" }}>{m === null ? "–" : fmtDur(m)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {list.length > shown && <button type="button" className={s.more} onClick={() => setShown((n) => n + PAGE)}>Tampilkan {Math.min(PAGE, list.length - shown)} lagi · {list.length - shown} tersisa</button>}
            </section>
          </div>
        </div>
      </main>

      {toast && (
        <div className={s.toast} role="status"><i>{I.check}</i><span className={s.plate} style={{ fontFamily: "var(--mono, monospace)", padding: "2px 7px", borderRadius: 6, border: "1.5px solid rgba(255,255,255,.6)" }}>{toast.plate}</span>{toast.text}</div>
      )}
    </div>
  );
}
