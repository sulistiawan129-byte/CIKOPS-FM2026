"use client";

/**
 * Gate Log (Armada → Gate) — tampilan baru.
 * Hanya presentasi: data, filter tanggal/plant (server) dan aksi (tutup, hapus,
 * ekspor) tetap dikelola VehiclesTab.
 */

import { useMemo, useState } from "react";
import type { Plant, VehicleGateLog } from "@/lib/types";
import g from "./gate.module.css";

type StatusFilter = "all" | "active" | "done";

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":") : null;

const dayKey = (l: VehicleGateLog) => (l.timeOut ?? l.timeIn ?? l.createdAt).slice(0, 10);

function dayTitle(key: string): string {
  const d = new Date(key + "T00:00:00");
  if (isNaN(d.getTime())) return key;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
  const base = d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return diff === 0 ? `Hari ini · ${base}` : diff === 1 ? `Kemarin · ${base}` : base;
}

function minutes(l: VehicleGateLog): number | null {
  if (!l.timeOut || !l.timeIn) return null;
  return Math.round(Math.abs(new Date(l.timeIn).getTime() - new Date(l.timeOut).getTime()) / 60000);
}

const fmtDur = (m: number | null) => (m === null ? "–" : m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`);

function events(l: VehicleGateLog): { first: { label: string; at: string | null }; second: { label: string; at: string | null } } {
  return l.plant === "CIK"
    ? { first: { label: "Keluar", at: l.timeOut }, second: { label: "Kembali", at: l.timeIn } }
    : { first: { label: "Masuk CIK", at: l.timeIn }, second: { label: "Keluar CIK", at: l.timeOut } };
}

function statusText(l: VehicleGateLog): string {
  const done = l.status === "DONE";
  return l.plant === "CIK" ? (done ? "Sudah kembali" : "Sedang keluar") : done ? "Sudah keluar CIK" : "Sedang di CIK";
}

const Ic = {
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  note: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v12l-5 5H5z" /><path d="M14 21v-5h5" /></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  down: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" /></svg>,
};

export function GateLogPanel(p: {
  logs: VehicleGateLog[];
  loading: boolean;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  onQuickRange: (days: number) => void;
  plant: "all" | Plant;
  onPlant: (v: "all" | Plant) => void;
  busyId: string | null;
  onForceClose: (l: VehicleGateLog) => void;
  onDelete: (l: VehicleGateLog) => void;
  onExport: () => void;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const stats = useMemo(() => {
    const active = p.logs.filter((l) => l.status !== "DONE").length;
    const durs = p.logs.map(minutes).filter((m): m is number => m !== null);
    const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    return { total: p.logs.length, active, done: p.logs.length - active, avg };
  }, [p.logs]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return p.logs.filter((l) => {
      if (status === "active" && l.status === "DONE") return false;
      if (status === "done" && l.status !== "DONE") return false;
      if (!k) return true;
      return [l.nopol, l.driverName, l.tujuan, l.keterangan ?? "", l.jenis].some((x) => x.toLowerCase().includes(k));
    });
  }, [p.logs, status, q]);

  const groups = useMemo(() => {
    const m = new Map<string, VehicleGateLog[]>();
    for (const l of shown) {
      const k = dayKey(l);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [shown]);

  const rangeDays = Math.round((new Date(p.dateTo).getTime() - new Date(p.dateFrom).getTime()) / 86400000);
  const quick = [
    { label: "Hari ini", days: 0 },
    { label: "7 hari", days: 7 },
    { label: "30 hari", days: 30 },
  ];

  return (
    <div className={g.wrap}>
      <div className={g.kpis}>
        <div className={g.kpi}><span>Total catatan</span><b>{stats.total}</b></div>
        <div className={`${g.kpi} ${g.kpiLive}`}><span>Sedang aktif</span><b>{stats.active}</b><small>belum kembali / keluar</small></div>
        <div className={g.kpi}><span>Selesai</span><b>{stats.done}</b></div>
        <div className={g.kpi}><span>Rata-rata durasi</span><b>{fmtDur(stats.avg)}</b></div>
      </div>

      <div className={g.toolbar}>
        <div className={g.chips} role="group" aria-label="Rentang cepat">
          {quick.map((c) => (
            <button key={c.days} type="button" className={`${g.chip} ${rangeDays === c.days ? g.chipOn : ""}`} onClick={() => p.onQuickRange(c.days)}>{c.label}</button>
          ))}
        </div>
        <div className={g.dates}>
          <input type="date" value={p.dateFrom} onChange={(e) => p.onDateFrom(e.target.value)} aria-label="Dari tanggal" />
          <span>–</span>
          <input type="date" value={p.dateTo} onChange={(e) => p.onDateTo(e.target.value)} aria-label="Sampai tanggal" />
        </div>
        <div className={g.seg} role="group" aria-label="Plant">
          {(["all", "CIK", "PRB"] as const).map((v) => (
            <button key={v} type="button" className={p.plant === v ? g.segOn : ""} onClick={() => p.onPlant(v)}>{v === "all" ? "Semua" : v}</button>
          ))}
        </div>
        <div className={g.seg} role="group" aria-label="Status">
          {([["all", "Semua"], ["active", "Aktif"], ["done", "Selesai"]] as const).map(([v, label]) => (
            <button key={v} type="button" className={status === v ? g.segOn : ""} onClick={() => setStatus(v)}>{label}</button>
          ))}
        </div>
        <label className={g.search}>
          {Ic.search}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari plat, driver, tujuan, keterangan" />
        </label>
        <button type="button" className={g.exportBtn} onClick={p.onExport} disabled={p.logs.length === 0}>{Ic.down} CSV</button>
      </div>

      {p.loading ? (
        <div className={g.empty}>Memuat catatan gate…</div>
      ) : groups.length === 0 ? (
        <div className={g.empty}>{p.logs.length === 0 ? "Belum ada catatan gate di rentang ini" : "Tidak ada catatan yang cocok dengan filter"}</div>
      ) : (
        groups.map(([key, rows]) => (
          <section key={key} className={g.day}>
            <h3>{dayTitle(key)} <em>{rows.length} catatan</em></h3>
            <div className={g.list}>
              {rows.map((l) => {
                const done = l.status === "DONE";
                const ev = events(l);
                const dur = minutes(l);
                return (
                  <article key={l.id} className={`${g.row} ${done ? g.rowDone : g.rowLive}`}>
                    <div className={g.veh}>
                      <span className={g.plate}>{l.nopol}</span>
                      <span className={`${g.plantTag} ${l.plant === "PRB" ? g.prb : ""}`}>{l.plant}</span>
                      <small>{l.jenis}{l.color ? ` · ${l.color}` : ""}</small>
                    </div>
                    <div className={g.who}>
                      <b>{l.driverName}</b>
                      <span className={g.dest}>{Ic.pin}{l.tujuan || "Tujuan belum diisi"}</span>
                      {l.keterangan ? <span className={g.keter}>{Ic.note}{l.keterangan}</span> : null}
                    </div>
                    <div className={g.times}>
                      <div><small>{ev.first.label}</small><b>{hhmm(ev.first.at) ?? "–"}</b></div>
                      <i aria-hidden="true" />
                      <div><small>{ev.second.label}</small><b>{hhmm(ev.second.at) ?? "–"}</b></div>
                      {dur !== null ? <span className={g.dur}>{fmtDur(dur)}</span> : null}
                    </div>
                    <div className={g.side}>
                      <span className={`${g.pill} ${done ? g.pillDone : g.pillLive}`}>{statusText(l)}</span>
                      <div className={g.acts}>
                        {!done && (
                          <button type="button" className={g.closeBtn} disabled={p.busyId === l.id} onClick={() => p.onForceClose(l)} title="Tutup manual (koreksi data)">
                            {p.busyId === l.id ? "…" : "Tutup"}
                          </button>
                        )}
                        <button type="button" className={g.delBtn} onClick={() => p.onDelete(l)} title="Hapus" aria-label="Hapus catatan">{Ic.trash}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
