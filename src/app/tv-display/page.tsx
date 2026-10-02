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
 */

import { useEffect, useMemo, useState, useCallback } from "react";
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

function TaskCard({ t }: { t: TaskDetail }) {
  const isGoing = t.status === "ON GOING";
  return (
    <div className={`tcard${isGoing ? "" : " wait"}`}>
      <div className="tcard-top">
        <div className="tcard-driver">
          <div className="av">🧑‍✈️</div>
          <div>
            <div className="nm">{t.driver_nama ?? "Belum ditentukan"}</div>
            <div className="vh">{t.kendaraan ?? "-"} {t.kendaraan_jenis ? `· ${t.kendaraan_jenis}` : ""}</div>
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
        <div className="pt"><small>Tujuan</small><b>{t.tujuan || "-"}</b></div>
      </div>
      <div className="tcard-purpose">
        Keperluan: <b>{t.perihal || t.jenis_pekerjaan || "-"}</b> — req. {t.requestor || "-"} ·{" "}
        {isGoing ? elapsedSince(t.accepted_at ?? t.created_at) : "belum berangkat"}
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
        <div className="hero"><div className="num">{driverCount} <span className="unit">driver</span></div><div className="lbl">Driver Aktif</div></div>
        <div className="hero"><div className="num">{vehicleCount} <span className="unit">unit</span></div><div className="lbl">Kendaraan</div></div>
        <div className="hero accent"><div className="num">{ongoingCount} <span className="unit">unit</span></div><div className="lbl">Belum Kembali</div></div>
      </div>

      <div className="section-label">
        Penugasan Hari Ini <span className="mono">{ongoingCount} aktif</span>
      </div>
      <div className="task-list">
        {tasksToday.length === 0 && <div className="gate-empty">Tidak ada penugasan hari ini.</div>}
        {tasksToday.slice(0, 6).map((t) => (
          <TaskCard key={t.id} t={t} />
        ))}
      </div>

      {crossPlantGate && (
        <div className="gate-panel">
          <div className="gate-panel-head">🚧<h3>Gate Lintas-Plant — Live</h3></div>
          <div className="gate-cols">
            <div className="gate-col in">
              <h4>↙ Masuk dari PRB</h4>
              {crossPlantGate.masuk.length === 0 && <div className="gate-empty">Tidak ada driver PRB di Cikarang saat ini.</div>}
              {crossPlantGate.masuk.map((t) => (
                <div className="gate-row" key={t.id}>
                  <div className="ic">👤</div>
                  <div className="body">
                    <div className="l1">{t.driver_nama ?? "-"}</div>
                    <div className="l2">{t.kendaraan ?? "-"} · {t.perihal || t.jenis_pekerjaan || "-"}</div>
                  </div>
                  <div className="time">{fmtTime(t.accepted_at ?? t.created_at)}</div>
                </div>
              ))}
            </div>
            <div className="gate-col out">
              <h4>↗ Keluar dari CIK</h4>
              {crossPlantGate.keluar.length === 0 && <div className="gate-empty">Semua driver CIK ada di plant.</div>}
              {crossPlantGate.keluar.map((t) => (
                <div className="gate-row" key={t.id}>
                  <div className="ic">👤</div>
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
        <span><b>{Math.max(0, vehicleCount - ongoingCount)}</b> armada di pool</span>
      </div>
    </div>
  );
}

export default function TvDisplayPage() {
  const { data, error, loadedAt } = usePlantSnapshot();
  const [clock, setClock] = useState("");
  const [clockDate, setClockDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setClock(`${hh}.${mm}.${ss}`);
      setClockDate(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
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
          --ink: #060b16; --panel: #0c1526; --panel2: #101c33; --panel3: #15223c;
          --line: rgba(255,255,255,.08); --line2: rgba(255,255,255,.15);
          --blue: #3d6ff2; --blue-bright: #7ea0ff; --blue-soft: rgba(61,111,242,.18);
          --teal: #2dd4bf; --teal-soft: rgba(45,212,191,.15);
          --amber: #f3b94f; --amber-soft: rgba(243,185,79,.15);
          --tx1: #f6f8fd; --tx2: rgba(230,236,248,.74); --tx3: rgba(198,210,235,.52);
        }
        html, body { height: 100%; margin: 0; background: var(--ink); color: var(--tx1); font-family: Inter, -apple-system, 'Segoe UI', sans-serif; }
      `}</style>
      <style jsx>{`
        .page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .topstrip { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 28px; border-bottom: 1px solid var(--line2); background: var(--panel); flex-shrink: 0; }
        .ts-left { display: flex; align-items: center; gap: 13px; }
        .ts-mark { width: 12px; height: 30px; border-radius: 4px; background: linear-gradient(180deg, var(--blue-bright), var(--blue)); }
        .ts-left h1 { font-size: 18px; font-weight: 900; letter-spacing: .03em; text-transform: uppercase; margin: 0; }
        .ts-left .sub { font-size: 11px; color: var(--tx3); margin-top: 2px; }
        .ts-right { display: flex; align-items: center; gap: 18px; }
        .public-flag { font-size: 10px; font-weight: 800; letter-spacing: .05em; color: var(--tx3); background: var(--panel2); border: 1px solid var(--line2); padding: 5px 11px; border-radius: 999px; text-transform: uppercase; }
        .live-pill { display: inline-flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 800; color: var(--teal); border: 1px solid rgba(45,212,191,.4); background: var(--teal-soft); padding: 6px 13px; border-radius: 999px; text-transform: uppercase; letter-spacing: .04em; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); animation: pulse 1.6s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(1.4); } }
        .ts-clock { text-align: right; }
        .ts-clock .time { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 800; line-height: 1; }
        .ts-clock .date { font-size: 10.5px; color: var(--tx3); margin-top: 3px; }
        .err-banner { background: var(--amber-soft); color: var(--amber); font-size: 11.5px; padding: 6px 28px; }

        .split { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
        :global(.side) { display: flex; flex-direction: column; min-height: 0; padding: 18px 22px 10px; overflow-y: auto; }
        :global(.side.cik) { border-right: 1px solid var(--line2); }
        :global(.side-head) { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        :global(.plant-name) { display: flex; align-items: center; gap: 10px; }
        :global(.plant-dot) { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        :global(.side.cik .plant-dot) { background: var(--blue-bright); box-shadow: 0 0 0 5px var(--blue-soft); }
        :global(.side.prb .plant-dot) { background: var(--teal); box-shadow: 0 0 0 5px var(--teal-soft); }
        :global(.plant-name h2) { font-size: 21px; font-weight: 900; letter-spacing: .01em; margin: 0; }
        :global(.plant-name .code) { font-size: 10.5px; font-weight: 800; color: var(--tx3); text-transform: uppercase; letter-spacing: .08em; }

        :global(.hero-row) { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-bottom: 16px; }
        :global(.hero) { background: var(--panel); border: 1px solid var(--line); border-radius: 13px; padding: 13px 14px; transition: transform .2s, border-color .2s; }
        :global(.hero:hover) { transform: translateY(-2px); border-color: var(--line2); }
        :global(.hero.accent) { background: linear-gradient(145deg, #1a3a8f, #0d1f52); border-color: rgba(126,160,255,.4); }
        :global(.hero .num) { font-size: 28px; font-weight: 900; line-height: 1; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
        :global(.hero .num .unit) { font-size: 12.5px; font-weight: 700; color: var(--tx3); margin-left: 3px; }
        :global(.hero.accent .num .unit) { color: rgba(255,255,255,.65); }
        :global(.hero .lbl) { font-size: 10.5px; color: var(--tx3); margin-top: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
        :global(.hero.accent .lbl) { color: rgba(255,255,255,.8); }

        :global(.section-label) { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--tx3); margin-bottom: 9px; display: flex; align-items: center; justify-content: space-between; }
        :global(.mono) { font-family: 'JetBrains Mono', monospace; }

        :global(.task-list) { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        :global(.tcard) { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--blue-bright); border-radius: 11px; padding: 11px 14px; display: flex; flex-direction: column; gap: 7px; transition: border-color .2s, transform .2s; }
        :global(.tcard:hover) { border-color: var(--line2); transform: translateX(2px); }
        :global(.tcard.wait) { border-left-color: var(--amber); }
        :global(.tcard-top) { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        :global(.tcard-driver) { display: flex; align-items: center; gap: 9px; min-width: 0; }
        :global(.tcard-driver .av) { width: 28px; height: 28px; border-radius: 50%; background: var(--panel2); border: 1px solid var(--line2); display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
        :global(.tcard-driver .nm) { font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.tcard-driver .vh) { font-size: 10.5px; color: var(--tx3); font-family: 'JetBrains Mono', monospace; }
        :global(.tcard-status) { display: inline-flex; align-items: center; gap: 5px; font-size: 9.5px; font-weight: 800; padding: 4px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; flex-shrink: 0; }
        :global(.tcard-status.go) { background: var(--teal-soft); color: var(--teal); }
        :global(.tcard-status.go .d) { width: 5px; height: 5px; border-radius: 50%; background: var(--teal); animation: pulse 1.6s infinite; display: inline-block; }
        :global(.tcard-status.wait) { background: var(--amber-soft); color: var(--amber); }
        :global(.tcard-route) { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
        :global(.tcard-route .pt b) { display: block; font-size: 13px; font-weight: 700; }
        :global(.tcard-route .pt small) { font-size: 9px; font-weight: 800; color: var(--tx3); text-transform: uppercase; letter-spacing: .05em; }
        :global(.tcard-route .arrow) { color: var(--blue-bright); font-size: 12px; flex-shrink: 0; }
        :global(.tcard-purpose) { font-size: 11px; color: var(--tx2); background: var(--panel2); border-radius: 7px; padding: 6px 9px; }
        :global(.tcard-purpose b) { color: var(--tx1); }

        :global(.gate-panel) { background: var(--panel2); border: 1px solid var(--line2); border-radius: 13px; padding: 14px 16px; margin-top: auto; }
        :global(.gate-panel-head) { display: flex; align-items: center; gap: 8px; margin-bottom: 11px; }
        :global(.gate-panel-head h3) { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; margin: 0; color: var(--tx2); }
        :global(.gate-cols) { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        :global(.gate-col h4) { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 8px; }
        :global(.gate-col.in h4) { color: var(--teal); }
        :global(.gate-col.out h4) { color: var(--amber); }
        :global(.gate-row) { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-top: 1px solid var(--line); }
        :global(.gate-col > .gate-row:first-of-type) { border-top: none; }
        :global(.gate-row .ic) { width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
        :global(.gate-col.in .ic) { background: var(--teal-soft); color: var(--teal); }
        :global(.gate-col.out .ic) { background: var(--amber-soft); color: var(--amber); }
        :global(.gate-row .body) { min-width: 0; flex: 1; }
        :global(.gate-row .l1) { font-size: 11.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.gate-row .l2) { font-size: 9.5px; color: var(--tx3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        :global(.gate-row .time) { font-size: 9.5px; font-family: 'JetBrains Mono', monospace; color: var(--tx3); flex-shrink: 0; }
        :global(.gate-empty) { font-size: 11px; color: var(--tx3); font-style: italic; padding: 4px 0; }

        :global(.side-foot) { display: flex; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--tx3); flex-wrap: wrap; }
        :global(.side-foot b) { color: var(--tx2); font-weight: 700; }

        .ticker-wrap { flex-shrink: 0; background: var(--panel3); border-top: 1px solid var(--line2); display: flex; align-items: stretch; overflow: hidden; }
        .ticker-flag { background: var(--amber); color: #241a04; font-size: 10.5px; font-weight: 900; letter-spacing: .06em; padding: 9px 15px; display: flex; align-items: center; white-space: nowrap; }
        .ticker-track { flex: 1; overflow: hidden; position: relative; display: flex; align-items: center; }
        .ticker-items { display: flex; gap: 40px; white-space: nowrap; animation: scroll-left 24s linear infinite; padding-left: 100%; }
        @keyframes scroll-left { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .ticker-items span { font-size: 11.5px; color: var(--tx2); display: inline-flex; align-items: center; gap: 7px; }
        .ticker-items .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--amber); flex-shrink: 0; }

        @media (max-width: 900px) {
          .split { grid-template-columns: 1fr; }
          :global(.side.cik) { border-right: none; border-bottom: 1px solid var(--line2); }
          :global(.gate-cols) { grid-template-columns: 1fr; }
          .page { height: auto; min-height: 100vh; overflow: auto; }
        }
      `}</style>

      <div className="page">
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
            <span className="live-pill"><span className="live-dot" />Live{loadedAt ? "" : " · memuat…"}</span>
            <div className="ts-clock">
              <div className="time">{clock || "--.--.--"}</div>
              <div className="date">{clockDate}</div>
            </div>
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
