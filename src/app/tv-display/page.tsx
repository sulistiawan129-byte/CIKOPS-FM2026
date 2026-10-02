"use client";

/**
 * /tv-display — layar publik TANPA LOGIN untuk ditampilkan di TV kantor.
 * Split 2 kolom: CIKARANG (kiri) & PASAR REBO (kanan).
 *
 * Catatan desain data:
 * - Semua data diambil lewat fungsi yang SUDAH ADA di src/lib/api.ts
 *   (getTasksByDate, getDrivers, getVehicles). Tabel-tabel ini sudah
 *   RLS "select using (true)" di supabase/schema.sql, jadi anon key
 *   (tanpa login) sudah pasti bisa baca — tidak perlu migrasi SQL baru.
 * - Panel "Gate Lintas-Plant" di sisi CIK TIDAK memakai vehicle_gate_logs,
 *   karena RPC publik yang ada (get_gate_logs_public) tidak mengembalikan
 *   plant asal kendaraan/driver, sehingga tidak bisa dipakai untuk
 *   mendeteksi "driver PRB yang sedang di CIK" secara akurat. Sebagai
 *   gantinya, panel ini diturunkan dari data tasks_detail hari ini:
 *     - "Masuk dari PRB"  = task milik plant PRB, status ON GOING,
 *                           dan tujuan mengandung kata "cikarang"/"cik".
 *     - "Keluar dari CIK" = task milik plant CIK, status ON GOING
 *                           (drivernya sedang di luar plant).
 *   Kalau nanti mau berbasis scan gate fisik yang sebenarnya, RPC
 *   get_gate_logs_public perlu ditambah kolom vehicle_plant/driver_plant
 *   dulu — tinggal bilang, saya buatkan migrasinya.
 * - Polling tiap 15 detik (bukan Supabase Realtime subscription) supaya
 *   tidak perlu mengaktifkan Realtime publication tambahan di Supabase.
 *   Bisa diupgrade ke subscription kapan saja kalau mau benar-benar push-based.
 *
 * Skala tipografi (dipakai konsisten di semua card supaya tidak ada yang
 * kelihatan "kekecilan"/"kegedean" sembarangan):
 *   28px/900  — angka hero KPI
 *   15px/800  — nama driver, nilai Dari/Tujuan
 *   13px/700  — label plant, nama di panel gate
 *   12.5px/600— baris keperluan, info kendaraan, footer
 *   11px/800  — label section, badge, uppercase micro-label
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getTasksByDate, getDrivers, getVehicles } from "@/lib/api";
import type { TaskDetail, Driver, Vehicle, Plant } from "@/lib/types";

const POLL_MS = 15000;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function elapsedSince(iso: string | null): string {
  if (!iso) return "-";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} mnt`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} jam ${m} mnt`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function secondsAgoLabel(d: Date | null, nowTick: number): string {
  if (!d) return "memuat…";
  const s = Math.max(0, Math.round((nowTick - d.getTime()) / 1000));
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} dtk lalu`;
  return `${Math.round(s / 60)} mnt lalu`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "?";
}

interface Snapshot {
  tasks: TaskDetail[];
  drivers: Driver[];
  vehicles: Vehicle[];
}

function usePlantSnapshot(): { data: Snapshot | null; error: string | null; loadedAt: Date | null } {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [tasks, drivers, vehicles] = await Promise.all([
        getTasksByDate(todayStr()),
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

function usePlantSlice(snapshot: Snapshot | null, plant: Plant) {
  return useMemo(() => {
    if (!snapshot) {
      return { tasksToday: [] as TaskDetail[], driverCount: 0, vehicleCount: 0, doneToday: 0 };
    }
    const tasksToday = snapshot.tasks
      .filter((t) => t.plant === plant && t.status !== "CANCELLED")
      .sort((a, b) => (a.status === "ON GOING" ? -1 : 1));
    const driverCount = snapshot.drivers.filter((d) => d.plant === plant && d.aktif).length;
    const vehicleCount = snapshot.vehicles.filter((v) => v.plant === plant && v.aktif).length;
    const doneToday = snapshot.tasks.filter((t) => t.plant === plant && t.status === "DONE").length;
    return { tasksToday, driverCount, vehicleCount, doneToday };
  }, [snapshot, plant]);
}

function TaskCard({ t, delay }: { t: TaskDetail; delay: number }) {
  const isGoing = t.status === "ON GOING";
  return (
    <div className={`tcard${isGoing ? "" : " wait"}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="tcard-top">
        <div className="tcard-driver">
          <div className="av">{initials(t.driver_nama)}</div>
          <div className="tcard-driver-txt">
            <div className="nm">{t.driver_nama ?? "Belum ditentukan"}</div>
            <div className="vh">{t.kendaraan ?? "-"}{t.kendaraan_jenis ? ` · ${t.kendaraan_jenis}` : ""}</div>
          </div>
        </div>
        {isGoing ? (
          <span className="tcard-status go"><span className="d" />On Going</span>
        ) : (
          <span className="tcard-status wait">Assigned</span>
        )}
      </div>
      <div className="tcard-route">
        <div className="pt"><small>Dari</small><b>{t.plant === "CIK" ? "Cikarang" : "Pasar Rebo"}</b></div>
        <span className="arrow">➔</span>
        <div className="pt"><small>Tujuan</small><b title={t.tujuan || "-"}>{t.tujuan || "-"}</b></div>
      </div>
      <div className="tcard-purpose">
        <span className="pp-lbl">Keperluan</span>
        <span className="pp-body">{t.perihal || t.jenis_pekerjaan || "-"}</span>
        <span className="pp-meta">req. {t.requestor || "-"} · {isGoing ? elapsedSince(t.accepted_at ?? t.created_at) : "belum berangkat"}</span>
      </div>
    </div>
  );
}

function PlantSide({
  plant,
  label,
  snapshot,
  crossPlantGate,
}: {
  plant: Plant;
  label: string;
  snapshot: Snapshot | null;
  crossPlantGate?: { masuk: TaskDetail[]; keluar: TaskDetail[] };
}) {
  const { tasksToday, driverCount, vehicleCount, doneToday } = usePlantSlice(snapshot, plant);
  const ongoingCount = tasksToday.filter((t) => t.status === "ON GOING").length;
  const visibleTasks = tasksToday.slice(0, 6);

  return (
    <div className={`side ${plant === "CIK" ? "cik" : "prb"}`}>
      <div className="side-head">
        <div className="plant-name">
          <span className="plant-dot" />
          <div>
            <h2>{label}</h2>
            <div className="code">Plant {plant}</div>
          </div>
        </div>
      </div>

      <div className="hero-row">
        <div className="hero">
          <div className="hero-ic">👤</div>
          <div className="hero-txt">
            <div className="num">{driverCount}<span className="unit">driver</span></div>
            <div className="lbl">Driver Aktif</div>
          </div>
        </div>
        <div className="hero">
          <div className="hero-ic">🚐</div>
          <div className="hero-txt">
            <div className="num">{vehicleCount}<span className="unit">unit</span></div>
            <div className="lbl">Kendaraan</div>
          </div>
        </div>
        <div className="hero accent">
          <div className="hero-ic">⏱</div>
          <div className="hero-txt">
            <div className="num">{ongoingCount}<span className="unit">unit</span></div>
            <div className="lbl">Belum Kembali</div>
          </div>
        </div>
      </div>

      <div className="section-label">
        <span>Penugasan Hari Ini</span>
        <span className="mono badge">{ongoingCount} aktif</span>
      </div>
      <div className="task-list">
        {visibleTasks.length === 0 && (
          <div className="empty-block">
            <div className="empty-ic">🗓️</div>
            <div>Tidak ada penugasan hari ini.</div>
          </div>
        )}
        {visibleTasks.map((t, i) => (
          <TaskCard key={t.id} t={t} delay={i * 70} />
        ))}
      </div>

      {crossPlantGate && (
        <div className="gate-panel">
          <div className="gate-panel-head">
            <span className="gate-ic">🚧</span>
            <h3>Gate Lintas-Plant</h3>
            <span className="live-chip"><span className="live-dot sm" />live</span>
          </div>
          <div className="gate-cols">
            <div className="gate-col in">
              <h4><span className="arrow-badge in">↙</span>Masuk dari PRB</h4>
              {crossPlantGate.masuk.length === 0 && <div className="gate-empty">Tidak ada driver PRB di Cikarang saat ini.</div>}
              {crossPlantGate.masuk.map((t) => (
                <div className="gate-row" key={t.id}>
                  <div className="ic">{initials(t.driver_nama)}</div>
                  <div className="body">
                    <div className="l1">{t.driver_nama ?? "-"}</div>
                    <div className="l2">{t.kendaraan ?? "-"} · {t.perihal || t.jenis_pekerjaan || "-"}</div>
                  </div>
                  <div className="time">{fmtTime(t.accepted_at ?? t.created_at)}</div>
                </div>
              ))}
            </div>
            <div className="gate-col out">
              <h4><span className="arrow-badge out">↗</span>Keluar dari CIK</h4>
              {crossPlantGate.keluar.length === 0 && <div className="gate-empty">Semua driver CIK ada di plant.</div>}
              {crossPlantGate.keluar.map((t) => (
                <div className="gate-row" key={t.id}>
                  <div className="ic">{initials(t.driver_nama)}</div>
                  <div className="body">
                    <div className="l1">{t.driver_nama ?? "-"}</div>
                    <div className="l2">{t.kendaraan ?? "-"} · ke {t.tujuan || "-"}</div>
                  </div>
                  <div className="time">{fmtTime(t.accepted_at ?? t.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="side-foot">
        <span><b>{doneToday}</b> tugas selesai hari ini</span>
        <span className="sep">•</span>
        <span><b>{Math.max(0, vehicleCount - ongoingCount)}</b> armada di pool</span>
      </div>
    </div>
  );
}

export default function TvDisplayPage() {
  const { data, error, loadedAt } = usePlantSnapshot();
  const [clock, setClock] = useState("");
  const [clockDate, setClockDate] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setClock(`${hh}.${mm}.${ss}`);
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
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      pageRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const crossPlantGate = useMemo(() => {
    if (!data) return { masuk: [], keluar: [] };
    const masuk = data.tasks.filter(
      (t) =>
        t.plant === "PRB" &&
        t.status === "ON GOING" &&
        /cik|cikarang/i.test(t.tujuan || "")
    );
    const keluar = data.tasks.filter((t) => t.plant === "CIK" && t.status === "ON GOING");
    return { masuk, keluar };
  }, [data]);

  const tickerItems = useMemo(() => {
    if (!data) return [] as string[];
    const items: string[] = [];
    const lateOngoing = data.tasks.filter((t) => {
      if (t.status !== "ON GOING") return false;
      const started = t.accepted_at ?? t.created_at;
      return started && Date.now() - new Date(started).getTime() > 2 * 60 * 60 * 1000;
    });
    if (lateOngoing.length > 0) {
      items.push(`${lateOngoing.length} tugas sudah berjalan lebih dari 2 jam — perlu dicek`);
    }
    if (crossPlantGate.masuk.length > 0) {
      items.push(`${crossPlantGate.masuk.length} driver PRB sedang berada di area Cikarang`);
    }
    if (crossPlantGate.keluar.length > 0) {
      items.push(`${crossPlantGate.keluar.length} driver CIK sedang keluar plant`);
    }
    if (items.length === 0) items.push("Semua penugasan berjalan normal");
    return items;
  }, [data, crossPlantGate]);

  return (
    <>
      <style jsx global>{`
        :root {
          --ink: #070c18; --panel: #0d1830; --panel2: #121f3c; --panel3: #172546;
          --line: rgba(255,255,255,.09); --line2: rgba(255,255,255,.17);
          --blue: #3d6ff2; --blue-bright: #85a6ff; --blue-soft: rgba(61,111,242,.2);
          --teal: #34e0c4; --teal-soft: rgba(52,224,196,.16);
          --amber: #f6c267; --amber-soft: rgba(246,194,103,.16);
          --tx1: #f8fafd; --tx2: rgba(232,238,250,.78); --tx3: rgba(201,213,238,.56);
          --radius-lg: 18px; --radius-md: 14px; --radius-sm: 10px;
          --shadow-card: 0 10px 30px -14px rgba(0,0,0,.55);
        }
        html, body {
          height: 100%; margin: 0; color: var(--tx1);
          font-family: Inter, -apple-system, 'Segoe UI', sans-serif;
          background:
            radial-gradient(1100px 620px at 14% -8%, rgba(61,111,242,.16), transparent 60%),
            radial-gradient(900px 560px at 86% 108%, rgba(52,224,196,.10), transparent 55%),
            var(--ink);
        }
      `}</style>
      <style jsx>{`
        .page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

        /* ---------- top strip ---------- */
        .topstrip {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 16px 30px; border-bottom: 1px solid var(--line2);
          background: linear-gradient(180deg, rgba(18,31,60,.9), rgba(13,24,48,.75));
          backdrop-filter: blur(6px);
          flex-shrink: 0; position: relative;
        }
        .topstrip::after {
          content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
          background: linear-gradient(90deg, transparent, var(--blue-bright), transparent);
          opacity: .5;
        }
        .ts-left { display: flex; align-items: center; gap: 14px; }
        .ts-mark { width: 13px; height: 34px; border-radius: 5px; background: linear-gradient(180deg, var(--blue-bright), var(--blue)); box-shadow: 0 0 16px rgba(133,166,255,.5); }
        .ts-left h1 { font-size: 19px; font-weight: 900; letter-spacing: .03em; text-transform: uppercase; margin: 0; }
        .ts-left .sub { font-size: 12px; color: var(--tx3); margin-top: 3px; font-weight: 600; }
        .ts-right { display: flex; align-items: center; gap: 16px; }
        .fs-btn {
          width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: var(--panel2); border: 1px solid var(--line2); color: var(--tx2); cursor: pointer; font-size: 15px;
          transition: background .15s, transform .15s;
        }
        .fs-btn:hover { background: var(--panel3); transform: translateY(-1px); }
        .public-flag { font-size: 11px; font-weight: 800; letter-spacing: .05em; color: var(--tx3); background: var(--panel2); border: 1px solid var(--line2); padding: 7px 13px; border-radius: 999px; text-transform: uppercase; }
        .live-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 800; color: var(--teal); border: 1px solid rgba(52,224,196,.45); background: var(--teal-soft); padding: 7px 15px; border-radius: 999px; text-transform: uppercase; letter-spacing: .04em; }
        .live-pill .ago { font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--tx3); margin-left: 2px; }
        .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); animation: pulse 1.6s infinite; box-shadow: 0 0 0 0 rgba(52,224,196,.6); }
        .live-dot.sm { width: 5px; height: 5px; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(52,224,196,.45); } 70% { box-shadow: 0 0 0 7px rgba(52,224,196,0); } 100% { box-shadow: 0 0 0 0 rgba(52,224,196,0); } }
        .ts-clock { text-align: right; }
        .ts-clock .time { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
        .ts-clock .date { font-size: 11.5px; color: var(--tx3); margin-top: 4px; font-weight: 600; }
        .err-banner { background: var(--amber-soft); color: var(--amber); font-size: 12.5px; font-weight: 600; padding: 8px 30px; }

        .split { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
        :global(.side) { display: flex; flex-direction: column; min-height: 0; padding: 22px 26px 14px; overflow-y: auto; }
        :global(.side.cik) { border-right: 1px solid var(--line2); }
        :global(.side-head) { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 18px; }
        :global(.plant-name) { display: flex; align-items: center; gap: 12px; }
        :global(.plant-dot) { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
        :global(.side.cik .plant-dot) { background: var(--blue-bright); box-shadow: 0 0 0 6px var(--blue-soft); }
        :global(.side.prb .plant-dot) { background: var(--teal); box-shadow: 0 0 0 6px var(--teal-soft); }
        :global(.plant-name h2) { font-size: 23px; font-weight: 900; letter-spacing: .01em; margin: 0; }
        :global(.plant-name .code) { font-size: 11px; font-weight: 800; color: var(--tx3); text-transform: uppercase; letter-spacing: .09em; margin-top: 2px; }

        /* ---------- hero KPI ---------- */
        :global(.hero-row) { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; margin-bottom: 20px; }
        :global(.hero) {
          background: linear-gradient(165deg, var(--panel), var(--panel2));
          border: 1px solid var(--line); border-radius: var(--radius-md);
          padding: 15px 14px; display: flex; align-items: center; gap: 11px;
          box-shadow: var(--shadow-card);
          transition: transform .2s ease, border-color .2s ease;
        }
        :global(.hero:hover) { transform: translateY(-3px); border-color: var(--line2); }
        :global(.hero.accent) { background: linear-gradient(155deg, #2449ad, #0f2466); border-color: rgba(133,166,255,.45); }
        :global(.hero-ic) {
          width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 16px;
          background: rgba(255,255,255,.07); border: 1px solid var(--line2);
        }
        :global(.hero-txt) { min-width: 0; }
        :global(.hero .num) { font-size: 28px; font-weight: 900; line-height: 1; letter-spacing: -.01em; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 5px; }
        :global(.hero .num .unit) { font-size: 12px; font-weight: 700; color: var(--tx3); }
        :global(.hero.accent .num .unit) { color: rgba(255,255,255,.7); }
        :global(.hero .lbl) { font-size: 11px; color: var(--tx3); margin-top: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
        :global(.hero.accent .lbl) { color: rgba(255,255,255,.82); }

        :global(.section-label) { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--tx3); margin-bottom: 11px; display: flex; align-items: center; justify-content: space-between; }
        :global(.mono) { font-family: 'JetBrains Mono', monospace; }
        :global(.badge) { background: var(--panel2); border: 1px solid var(--line2); padding: 3px 10px; border-radius: 999px; color: var(--tx2); font-weight: 700; }

        /* ---------- task cards — ukuran & tipografi seragam ---------- */
        :global(.task-list) { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        @keyframes card-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        :global(.tcard) {
          background: linear-gradient(160deg, var(--panel), var(--panel2));
          border: 1px solid var(--line); border-left: 4px solid var(--blue-bright);
          border-radius: var(--radius-md); padding: 15px 16px;
          display: flex; flex-direction: column; gap: 11px;
          box-shadow: var(--shadow-card);
          transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease;
          animation: card-in .45s ease both;
          min-height: 128px;
        }
        :global(.tcard:hover) { border-color: var(--line2); transform: translateY(-2px); box-shadow: 0 14px 34px -14px rgba(61,111,242,.35); }
        :global(.tcard.wait) { border-left-color: var(--amber); }
        :global(.tcard-top) { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        :global(.tcard-driver) { display: flex; align-items: center; gap: 11px; min-width: 0; flex: 1; }
        :global(.tcard-driver .av) {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(145deg, var(--blue-bright), var(--blue));
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: #0a1430;
        }
        :global(.tcard-driver-txt) { min-width: 0; }
        :global(.tcard-driver .nm) { font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.tcard-driver .vh) { font-size: 12px; color: var(--tx3); font-family: 'JetBrains Mono', monospace; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.tcard-status) { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 800; padding: 5px 11px; border-radius: 999px; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; flex-shrink: 0; }
        :global(.tcard-status.go) { background: var(--teal-soft); color: var(--teal); }
        :global(.tcard-status.go .d) { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); animation: pulse 1.6s infinite; display: inline-block; }
        :global(.tcard-status.wait) { background: var(--amber-soft); color: var(--amber); }
        :global(.tcard-route) { display: flex; align-items: center; gap: 10px; font-size: 13px; background: rgba(255,255,255,.03); border-radius: var(--radius-sm); padding: 9px 12px; }
        :global(.tcard-route .pt) { min-width: 0; flex: 1; }
        :global(.tcard-route .pt b) { display: block; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.tcard-route .pt small) { font-size: 10px; font-weight: 800; color: var(--tx3); text-transform: uppercase; letter-spacing: .05em; }
        :global(.tcard-route .arrow) { color: var(--blue-bright); font-size: 14px; flex-shrink: 0; }
        :global(.tcard-purpose) { font-size: 12.5px; color: var(--tx2); line-height: 1.5; display: flex; flex-wrap: wrap; gap: 0 6px; }
        :global(.pp-lbl) { color: var(--tx3); font-weight: 700; }
        :global(.pp-body) { font-weight: 700; color: var(--tx1); display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        :global(.pp-meta) { color: var(--tx3); font-weight: 500; }

        :global(.empty-block) { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 10px; color: var(--tx3); font-size: 13px; font-weight: 600; background: rgba(255,255,255,.02); border: 1px dashed var(--line2); border-radius: var(--radius-md); }
        :global(.empty-ic) { font-size: 22px; opacity: .7; }

        /* ---------- gate lintas-plant ---------- */
        :global(.gate-panel) {
          background: linear-gradient(160deg, var(--panel2), var(--panel3));
          border: 1px solid var(--line2); border-radius: var(--radius-lg);
          padding: 18px 18px 16px; margin-top: auto; box-shadow: var(--shadow-card);
        }
        :global(.gate-panel-head) { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        :global(.gate-ic) { font-size: 15px; }
        :global(.gate-panel-head h3) { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; margin: 0; color: var(--tx1); flex: 1; }
        :global(.live-chip) { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--teal); }
        :global(.gate-cols) { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        :global(.gate-col h4) { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
        :global(.arrow-badge) { width: 20px; height: 20px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
        :global(.arrow-badge.in) { background: var(--teal-soft); color: var(--teal); }
        :global(.arrow-badge.out) { background: var(--amber-soft); color: var(--amber); }
        :global(.gate-col.in h4) { color: var(--teal); }
        :global(.gate-col.out h4) { color: var(--amber); }
        :global(.gate-row) { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }
        :global(.gate-col > .gate-row:first-of-type) { border-top: none; }
        :global(.gate-row .ic) {
          width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800; flex-shrink: 0; color: #0a1430;
        }
        :global(.gate-col.in .ic) { background: linear-gradient(145deg, var(--teal), #159e86); }
        :global(.gate-col.out .ic) { background: linear-gradient(145deg, var(--amber), #c98a1f); }
        :global(.gate-row .body) { min-width: 0; flex: 1; }
        :global(.gate-row .l1) { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.gate-row .l2) { font-size: 11px; color: var(--tx3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
        :global(.gate-row .time) { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--tx3); flex-shrink: 0; }
        :global(.gate-empty) { font-size: 12px; color: var(--tx3); font-style: italic; padding: 6px 0; }

        :global(.side-foot) { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--tx3); font-weight: 600; flex-wrap: wrap; }
        :global(.side-foot b) { color: var(--tx2); font-weight: 800; }
        :global(.side-foot .sep) { opacity: .5; }

        /* ---------- ticker ---------- */
        .ticker-wrap { flex-shrink: 0; background: linear-gradient(180deg, var(--panel3), #0e1830); border-top: 1px solid var(--line2); display: flex; align-items: stretch; overflow: hidden; }
        .ticker-flag { background: linear-gradient(135deg, var(--amber), #d99a2c); color: #241a04; font-size: 11.5px; font-weight: 900; letter-spacing: .06em; padding: 11px 18px; display: flex; align-items: center; white-space: nowrap; }
        .ticker-track { flex: 1; overflow: hidden; position: relative; display: flex; align-items: center; }
        .ticker-items { display: flex; gap: 48px; white-space: nowrap; animation: scroll-left 26s linear infinite; padding-left: 100%; }
        @keyframes scroll-left { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .ticker-items span { font-size: 12.5px; font-weight: 600; color: var(--tx2); display: inline-flex; align-items: center; gap: 8px; }
        .ticker-items .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); flex-shrink: 0; }

        @media (max-width: 900px) {
          .split { grid-template-columns: 1fr; }
          :global(.side.cik) { border-right: none; border-bottom: 1px solid var(--line2); }
          :global(.gate-cols) { grid-template-columns: 1fr; }
          .page { height: auto; min-height: 100vh; overflow: auto; }
        }
      `}</style>

      <div className="page" ref={pageRef}>
        <div className="topstrip">
          <div className="ts-left">
            <div className="ts-mark" />
            <div>
              <h1>CIKOPS Fleet — Status Penugasan</h1>
              <div className="sub">PT Frisian Flag Indonesia</div>
            </div>
          </div>
          <div className="ts-right">
            <span className="public-flag">🖥️ Tampilan publik · hanya lihat</span>
            <span className="live-pill">
              <span className="live-dot" />Live
              <span className="ago">· {secondsAgoLabel(loadedAt, nowTick)}</span>
            </span>
            <div className="ts-clock">
              <div className="time">{clock || "--.--.--"}</div>
              <div className="date">{clockDate}</div>
            </div>
            <button
              type="button"
              className="fs-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? "⤢" : "⛶"}
            </button>
          </div>
        </div>

        {error && <div className="err-banner">Gagal memuat data terbaru: {error} — menampilkan data terakhir yang berhasil dimuat.</div>}

        <div className="split">
          <PlantSide plant="CIK" label="Cikarang" snapshot={data} crossPlantGate={crossPlantGate} />
          <PlantSide plant="PRB" label="Pasar Rebo" snapshot={data} />
        </div>

        <div className="ticker-wrap">
          <div className="ticker-flag">Perlu Dicek</div>
          <div className="ticker-track">
            <div className="ticker-items">
              {tickerItems.map((item, i) => (
                <span key={i}><i className="dot" />{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
