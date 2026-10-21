"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { GateLogPanel } from "./GateUI";
import { ModalPortal } from "@/components/ModalPortal";
import { getDrivers, type MyProfile, getAllVehiclesFull, addVehicle, updateVehicle, deleteVehicle, getVehicleGateLogs, deleteGateLog, forceCloseGateLog } from "@/lib/api";
import type { Plant, VehicleGateLog } from "@/lib/types";
import { exportGateLogsToCsv } from "@/lib/report";
import type { Driver, Vehicle } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { toLocalISODate } from "@/lib/dateUtils";
import of from "./opfund.module.css";
import vh from "./vehicles.module.css";
import { ModuleHeader, ModulePage } from "./ModuleShell";
import { formatDateLabel, fmtRp, PLANT_COLOR } from "./dashboardShared";
import { daysUntil, nextDocDate } from "./HomeTab";

const FUEL_OPTIONS = ["Pertalite", "Pertamax", "Pertamax Turbo", "Solar", "Dexlite"];

type VehicleFormState = {
  nopol: string;
  jenis: string;
  year: string;
  color: string;
  fuel: string;
  odometer: string;
  aktif: boolean;
  kir_date: string;
  service_date: string;
  stnk_date: string;
  dept: string;
  default_driver_id: string;
  plant: Plant;
};

const BLANK_VEHICLE_FORM: VehicleFormState = {
  nopol: "",
  jenis: "",
  year: String(new Date().getFullYear()),
  color: "",
  fuel: "Pertalite",
  odometer: "0",
  aktif: true,
  kir_date: "",
  service_date: "",
  stnk_date: "",
  dept: "",
  default_driver_id: "",
  plant: "CIK",
};

/* ── GATE LOG — modul sendiri (dulu tab di dalam Armada) ── */
export function GateTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang, t } = useLang();
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const [gateLogs, setGateLogs] = useState<VehicleGateLog[]>([]);
  const [loadingGateLogs, setLoadingGateLogs] = useState(false);
  const [gatePlantFilter, setGatePlantFilter] = useState<"all" | Plant>(myProfile?.plantScope ?? "all");
  const [gateDateFrom, setGateDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return toLocalISODate(d);
  });
  const [gateDateTo, setGateDateTo] = useState(() => toLocalISODate(new Date()));
  const [confirmDeleteGateLog, setConfirmDeleteGateLog] = useState<VehicleGateLog | null>(null);
  const [busyGateLogId, setBusyGateLogId] = useState<string | null>(null);

  const loadGateLogs = useCallback(async () => {
    setLoadingGateLogs(true);
    try {
      const logs = await getVehicleGateLogs({
        plant: gatePlantFilter === "all" ? null : gatePlantFilter,
        dateFrom: gateDateFrom,
        dateTo: gateDateTo,
        includeActive: true,
      });
      setGateLogs(logs);
    } catch (e) {
      console.warn("Gagal memuat gate log:", e);
    } finally {
      setLoadingGateLogs(false);
    }
  }, [gatePlantFilter, gateDateFrom, gateDateTo]);

  useEffect(() => { loadGateLogs(); }, [loadGateLogs]);

  async function handleForceCloseGateLog(log: VehicleGateLog) {
    setBusyGateLogId(log.id);
    try {
      await forceCloseGateLog(log);
      await loadGateLogs();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menutup catatan");
    } finally {
      setBusyGateLogId(null);
    }
  }

  async function handleDeleteGateLog() {
    if (!confirmDeleteGateLog) return;
    try {
      await deleteGateLog(confirmDeleteGateLog.id);
      setConfirmDeleteGateLog(null);
      await loadGateLogs();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus catatan");
    }
  }

  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Fleet · Pos Security", "Fleet · Security post")}
        title="Gate Log"
        desc={L("Catatan keluar-masuk kendaraan di pos gate: jam keluar, jam kembali, KM, dan driver. Petugas gate menginput lewat halaman /gate.",
          "Vehicle in/out records at the gate post: departure, return, mileage and driver. Gate officers log entries on the /gate page.")}
        actions={<>
          <a className={vh.headLink} href="/gate" target="_blank" rel="noopener noreferrer">🚧 {L("Buka halaman petugas gate ↗", "Open gate officer page ↗")}</a>
          <button type="button" className={vh.btn} onClick={loadGateLogs} disabled={loadingGateLogs}>{loadingGateLogs ? "…" : "↻"} {L("Muat ulang", "Refresh")}</button>
        </>}
      />
      <GateLogPanel
        logs={gateLogs}
        loading={loadingGateLogs}
        dateFrom={gateDateFrom}
        dateTo={gateDateTo}
        onDateFrom={setGateDateFrom}
        onDateTo={setGateDateTo}
        onQuickRange={(days) => {
          const d = new Date(); const from = new Date(); from.setDate(d.getDate() - days);
          setGateDateFrom(toLocalISODate(from)); setGateDateTo(toLocalISODate(d));
        }}
        plant={gatePlantFilter}
        onPlant={setGatePlantFilter}
        busyId={busyGateLogId}
        onForceClose={handleForceCloseGateLog}
        onDelete={setConfirmDeleteGateLog}
        onExport={() => exportGateLogsToCsv(gateLogs)}
      />
      {confirmDeleteGateLog && (
        <ModalPortal onOverlayClick={() => setConfirmDeleteGateLog(null)} maxWidth={380}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>
              {lang === "en" ? "Delete this gate log entry?" : "Hapus catatan gate ini?"}
            </div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDeleteGateLog.nopol}</strong> — {confirmDeleteGateLog.driverName} ({formatDateLabel(confirmDeleteGateLog.createdAt.slice(0, 10))}) {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeleteGateLog(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                {t.actionCancel}
              </button>
              <button onClick={handleDeleteGateLog} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                {t.actionYesDelete}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

    </ModulePage>
  );
}

/* ── ARMADA KENDARAAN — tampilan baru: ringkasan, filter interaktif, kartu & tabel ── */
type DocKey = "KIR" | "Service" | "STNK";
interface DocState { key: DocKey; last: string | null; next: string | null; early: string | null; days: number | null; level: "none" | "ok" | "soon" | "due" | "over" }
const DOC_INTERVAL_DAYS: Record<DocKey, number> = { KIR: 182, Service: 182, STNK: 365 };

function vehicleDocs(v: Vehicle): DocState[] {
  return ([["KIR", v.kir_date], ["Service", v.service_date], ["STNK", v.stnk_date]] as [DocKey, string | null | undefined][]).map(([key, last]) => {
    const { next, nextEarly } = nextDocDate(key, last);
    if (!next) return { key, last: last ?? null, next: null, early: null, days: null, level: "none" };
    const days = daysUntil(next);
    const earlyDays = nextEarly ? daysUntil(nextEarly) : null;
    const level: DocState["level"] = days <= 0 ? "over" : days <= 7 ? "due" : days <= 30 || (earlyDays !== null && earlyDays <= 0) ? "soon" : "ok";
    return { key, last: last ?? null, next, early: nextEarly, days, level };
  });
}
const DOC_RANK: Record<DocState["level"], number> = { over: 0, due: 1, soon: 2, none: 3, ok: 4 };
function worstDoc(docs: DocState[]): DocState {
  return [...docs].sort((a, b) => DOC_RANK[a.level] - DOC_RANK[b.level] || (a.days ?? 9999) - (b.days ?? 9999))[0];
}

export function VehiclesTab({ myProfile }: { myProfile: MyProfile | null }) {
  const isAdmin = myProfile?.role === "admin";
  const { lang, t } = useLang();
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormState>(BLANK_VEHICLE_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter & tampilan
  const [q, setQ] = useState("");
  const [plantF, setPlantF] = useState<"all" | Plant>("all");
  const [statusF, setStatusF] = useState<"all" | "active" | "maint" | "attention" | "over">("all");
  const [sortBy, setSortBy] = useState<"due" | "nopol" | "odo" | "year">("due");
  const [view, setView] = useState<"grid" | "table">(() => {
    try { return (localStorage.getItem("cikops_vehicle_view") as "grid" | "table") || "grid"; } catch { return "grid"; }
  });
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem("cikops_vehicle_view", view); } catch { /* privat */ } }, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, d] = await Promise.all([getAllVehiclesFull(myProfile?.plantScope ?? null), getDrivers(myProfile?.plantScope ?? null)]);
      setVehicles(v);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data kendaraan");
    } finally {
      setLoading(false);
    }
  }, [myProfile?.plantScope]);

  useEffect(() => {
    load();
  }, [load]);

  function driverName(id: string | null | undefined) {
    return drivers.find((d) => d.id === id)?.nama || "-";
  }
  function driverOf(id: string | null | undefined) {
    return drivers.find((d) => d.id === id) ?? null;
  }
  function openAdd() {
    setEditing(null);
    setForm({ ...BLANK_VEHICLE_FORM, plant: myProfile?.plantScope ?? BLANK_VEHICLE_FORM.plant });
    setShowForm(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      nopol: v.nopol,
      jenis: v.jenis || "",
      year: String(v.year || new Date().getFullYear()),
      color: v.color || "",
      fuel: v.fuel || "Pertalite",
      odometer: String(v.odometer || 0),
      aktif: v.aktif,
      kir_date: v.kir_date || "",
      service_date: v.service_date || "",
      stnk_date: v.stnk_date || "",
      dept: v.dept || "",
      default_driver_id: v.default_driver_id || "",
      plant: v.plant || "CIK",
    });
    setShowForm(true);
  }

  const canSave = form.nopol.trim() !== "" && form.jenis.trim() !== "";

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      nopol: form.nopol.trim(),
      jenis: form.jenis.trim(),
      year: Number(form.year) || null,
      color: form.color || null,
      fuel: form.fuel || null,
      odometer: Number(form.odometer) || 0,
      aktif: form.aktif,
      kir_date: form.kir_date || null,
      service_date: form.service_date || null,
      stnk_date: form.stnk_date || null,
      dept: form.dept || null,
      default_driver_id: form.default_driver_id || null,
      plant: myProfile?.plantScope ?? form.plant,
    };
    try {
      if (editing) {
        await updateVehicle(editing.id, payload);
      } else {
        await addVehicle(payload);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan kendaraan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteVehicle(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus kendaraan");
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };

  const rows = useMemo(() => vehicles.map((v) => {
    const docs = vehicleDocs(v);
    return { v, docs, worst: worstDoc(docs) };
  }), [vehicles]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.v.aktif).length,
    maint: rows.filter((r) => !r.v.aktif).length,
    over: rows.filter((r) => r.docs.some((d) => d.level === "over")).length,
    attention: rows.filter((r) => r.docs.some((d) => d.level === "due" || d.level === "soon")).length,
    noDocs: rows.filter((r) => r.docs.every((d) => d.level === "none")).length,
  }), [rows]);

  const upcoming = useMemo(() => rows.flatMap((r) => r.docs.filter((d) => d.next && d.level !== "ok").map((d) => ({ v: r.v, d })))
    .sort((a, b) => (a.d.days ?? 0) - (b.d.days ?? 0)).slice(0, 8), [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(({ v, docs }) => {
      if (plantF !== "all" && (v.plant || "CIK") !== plantF) return false;
      if (statusF === "active" && !v.aktif) return false;
      if (statusF === "maint" && v.aktif) return false;
      if (statusF === "over" && !docs.some((d) => d.level === "over")) return false;
      if (statusF === "attention" && !docs.some((d) => d.level === "due" || d.level === "soon")) return false;
      if (!needle) return true;
      return [v.nopol, v.jenis, v.dept, v.color, v.fuel, driverName(v.default_driver_id)].join(" ").toLowerCase().includes(needle);
    });
    out.sort((a, b) => {
      if (sortBy === "nopol") return a.v.nopol.localeCompare(b.v.nopol);
      if (sortBy === "odo") return (b.v.odometer || 0) - (a.v.odometer || 0);
      if (sortBy === "year") return (b.v.year || 0) - (a.v.year || 0);
      return DOC_RANK[a.worst.level] - DOC_RANK[b.worst.level] || (a.worst.days ?? 9999) - (b.worst.days ?? 9999);
    });
    return out;
  }, [rows, q, plantF, statusF, sortBy, drivers]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtD = (ds: string | null) => (ds ? new Date(ds).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const dueText = (d: DocState) => d.level === "none" ? L("Belum diisi", "Not set") : (d.days ?? 0) <= 0 ? L(`Lewat ${Math.abs(d.days ?? 0)} hr`, `${Math.abs(d.days ?? 0)}d overdue`) : L(`${d.days} hari lagi`, `in ${d.days}d`);
  const levelLabel: Record<DocState["level"], string> = { over: L("Lewat", "Overdue"), due: L("≤ 7 hari", "≤ 7 days"), soon: L("Segera", "Soon"), ok: "OK", none: L("Kosong", "Empty") };
  const lockedPlant = myProfile?.plantScope ?? null;

  const KPIS: { id: typeof statusF; label: string; value: number; foot: string; tone: string; icon: string }[] = [
    { id: "all", label: L("Total armada", "Fleet"), value: stats.total, foot: stats.noDocs ? `${stats.noDocs} ${L("belum ada data dokumen", "without document data")}` : `${stats.active} ${L("aktif", "active")} · ${stats.maint} maint.`, tone: "brand", icon: "🚗" },
    { id: "active", label: L("Siap jalan", "Ready"), value: stats.active, foot: stats.total ? `${Math.round((stats.active / stats.total) * 100)}% ${L("dari armada", "of fleet")}` : "—", tone: "green", icon: "✅" },
    { id: "maint", label: "Maintenance", value: stats.maint, foot: L("sedang tidak beroperasi", "out of service"), tone: "orange", icon: "🔧" },
    { id: "attention", label: L("Dokumen segera", "Docs due soon"), value: stats.attention, foot: L("KIR / service / STNK ≤ 30 hari", "KIR / service / STNK ≤ 30 days"), tone: "gold", icon: "⏳" },
    { id: "over", label: L("Dokumen lewat", "Docs overdue"), value: stats.over, foot: L("lewat jatuh tempo — perlu tindakan", "past due — needs action"), tone: "red", icon: "⛔" },
  ];

  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Fleet · Armada", "Fleet · Vehicles")}
        title={L("Armada Kendaraan", "Vehicle Fleet")}
        desc={L("Status armada, driver tetap, dan jadwal KIR, service, serta STNK — kendaraan yang perlu perhatian otomatis naik ke atas.",
          "Fleet status, assigned drivers, and KIR, service and STNK schedules — vehicles needing attention float to the top.")}
        actions={<button type="button" className={vh.primary} onClick={openAdd}>+ {L("Tambah kendaraan", "Add vehicle")}</button>}
      />

      {error && <div className={vh.err}>{error}</div>}

      <div className={vh.kpis}>
        {KPIS.map((k) => (
          <button key={k.id} type="button" className={`${vh.kpi} ${vh["k_" + k.tone]} ${statusF === k.id ? vh.kpiOn : ""}`} onClick={() => setStatusF(statusF === k.id ? "all" : k.id)} aria-pressed={statusF === k.id}>
            <span className={vh.kpiIcon}>{k.icon}</span>
            <span className={vh.kpiBody}><small>{k.label}</small><b>{loading ? "…" : k.value}</b><em>{k.foot}</em></span>
          </button>
        ))}
      </div>

      {upcoming.length > 0 && (
        <section className={vh.upcoming}>
          <div className={vh.upHead}><b>📅 {L("Jatuh tempo terdekat", "Coming due")}</b><small>{L("Klik untuk membuka kendaraan", "Click to open the vehicle")}</small></div>
          <div className={vh.upList}>
            {upcoming.map(({ v, d }) => (
              <button key={v.id + d.key} type="button" className={`${vh.upItem} ${vh["lv_" + d.level]}`} onClick={() => { setOpenId(v.id); setStatusF("all"); setQ(v.nopol); }}>
                <span className={vh.upDoc}>{d.key}</span>
                <span className={vh.upPlate}>{v.nopol}</span>
                <span className={vh.upDays}>{dueText(d)}</span>
                <small>{fmtD(d.next)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={vh.toolbar}>
        <div className={vh.search}>
          <span>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Cari nopol, tipe, driver, departemen…", "Search plate, type, driver, department…")} />
          {q && <button type="button" onClick={() => setQ("")} aria-label={L("Hapus", "Clear")}>✕</button>}
        </div>
        {!lockedPlant && (
          <div className={vh.seg}>
            {(["all", "CIK", "PRB"] as const).map((p) => (
              <button key={p} type="button" className={plantF === p ? vh.segOn : ""} onClick={() => setPlantF(p)}>{p === "all" ? L("Semua plant", "All plants") : p}</button>
            ))}
          </div>
        )}
        <label className={vh.sort}>
          <span>{L("Urutkan", "Sort")}</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="due">{L("Perlu perhatian dulu", "Needs attention first")}</option>
            <option value="nopol">{L("Nomor polisi", "Plate number")}</option>
            <option value="odo">{L("Odometer tertinggi", "Highest odometer")}</option>
            <option value="year">{L("Tahun terbaru", "Newest year")}</option>
          </select>
        </label>
        <div className={vh.seg} role="group" aria-label={L("Tampilan", "View")}>
          <button type="button" className={view === "grid" ? vh.segOn : ""} onClick={() => setView("grid")} aria-pressed={view === "grid"}>▦ {L("Kartu", "Cards")}</button>
          <button type="button" className={view === "table" ? vh.segOn : ""} onClick={() => setView("table")} aria-pressed={view === "table"}>☰ {L("Tabel", "Table")}</button>
        </div>
      </div>
      <p className={vh.count}>{list.length} {L("dari", "of")} {stats.total} {L("kendaraan", "vehicles")}{statusF !== "all" && <> · <button type="button" className={vh.linkBtn} onClick={() => setStatusF("all")}>{L("hapus filter", "clear filter")}</button></>}</p>

      {loading ? (
        <div className={vh.grid}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={vh.skel} />)}</div>
      ) : vehicles.length === 0 ? (
        <div className={vh.empty}>
          <span>🚗</span><b>{L("Belum ada kendaraan", "No vehicles yet")}</b>
          <small>{L("Tambahkan armada pertama untuk mulai memantau dokumen dan penugasan.", "Add your first vehicle to start tracking documents and tasks.")}</small>
          <button type="button" className={vh.primary} onClick={openAdd}>+ {L("Tambah kendaraan", "Add vehicle")}</button>
        </div>
      ) : list.length === 0 ? (
        <div className={vh.empty}><span>🔎</span><b>{L("Tidak ada yang cocok", "No matches")}</b><small>{L("Ubah kata kunci atau filter.", "Change the search or filters.")}</small></div>
      ) : view === "grid" ? (
        <div className={vh.grid}>
          {list.map(({ v, docs, worst }, i) => {
            const drv = driverOf(v.default_driver_id);
            const open = openId === v.id;
            return (
              <article key={v.id} className={`${vh.card} ${v.aktif ? "" : vh.cardMaint} ${open ? vh.cardOpen : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}>
                <div className={`${vh.cardTop} ${vh["lv_" + worst.level]}`}>
                  <span className={vh.statusDot} />
                  <span>{v.aktif ? L("Aktif", "Active") : "Maintenance"}</span>
                  <span className={vh.cardTopRight}>{worst.level === "ok" ? L("Dokumen aman", "Docs OK") : worst.level === "none" ? L("Dokumen belum diisi", "No document data") : `${worst.key} · ${dueText(worst)}`}</span>
                </div>
                <div className={vh.cardBody}>
                  <div className={vh.identity}>
                    <div className={vh.plate}><b>{v.nopol}</b><small>{(v.plant || "CIK")}</small></div>
                    <div className={vh.model}>
                      <b>{v.jenis || "—"}</b>
                      <span>{[v.year, v.color, v.fuel].filter(Boolean).join(" · ") || "—"}</span>
                    </div>
                  </div>
                  <div className={vh.facts}>
                    <div><small>Driver</small><b>{drv ? <>{drv.avatar_emoji || "🧑‍✈️"} {drv.nama}</> : "—"}</b></div>
                    <div><small>{L("Departemen", "Department")}</small><b>{v.dept || "—"}</b></div>
                    <div><small>Odometer</small><b>{fmtRp(v.odometer || 0)} km</b></div>
                  </div>
                  <div className={vh.docs}>
                    {docs.map((d) => {
                      const pct = d.days === null ? 0 : Math.max(0, Math.min(100, (d.days / DOC_INTERVAL_DAYS[d.key]) * 100));
                      return (
                        <button key={d.key} type="button" className={`${vh.doc} ${vh["lv_" + d.level]}`} onClick={() => setOpenId(open ? null : v.id)} title={`${d.key}: ${L("terakhir", "last")} ${fmtD(d.last)} · ${L("jatuh tempo", "due")} ${fmtD(d.next)}`}>
                          <span className={vh.docRing} style={{ ["--p" as string]: d.level === "none" ? 0 : d.level === "over" ? 100 : pct }}><i>{d.key === "Service" ? "SVC" : d.key}</i></span>
                          <span className={vh.docText}><b>{levelLabel[d.level]}</b><small>{d.level === "none" ? "—" : dueText(d)}</small></span>
                        </button>
                      );
                    })}
                  </div>
                  {open && (
                    <div className={vh.detail}>
                      {docs.map((d) => (
                        <div key={d.key}>
                          <b>{d.key}</b>
                          <span>{L("Terakhir", "Last")}: {fmtD(d.last)}</span>
                          <span>{L("Jatuh tempo", "Due")}: <strong className={vh["tx_" + d.level]}>{fmtD(d.next)}</strong></span>
                          {d.key === "Service" && d.early && <span>⚡ {L("Reminder awal", "Early reminder")}: {fmtD(d.early)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className={vh.cardFoot}>
                  <button type="button" className={vh.linkBtn} onClick={() => setOpenId(open ? null : v.id)}>{open ? L("Tutup detail", "Hide details") : L("Detail dokumen", "Document details")}</button>
                  <span className={vh.grow} />
                  <button type="button" className={vh.btn} onClick={() => openEdit(v)}>✏️ {t.actionEdit}</button>
                  {isAdmin && <button type="button" className={vh.iconDanger} onClick={() => setConfirmDelete(v)} aria-label={L("Hapus", "Delete")}>🗑️</button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={vh.tableWrap}>
          <table className={vh.table}>
            <thead><tr>
              <th>{L("Nopol", "Plate")}</th><th>{L("Kendaraan", "Vehicle")}</th><th>Status</th><th>Driver</th><th>{L("Dept", "Dept")}</th><th>Odometer</th><th>KIR</th><th>Service</th><th>STNK</th><th />
            </tr></thead>
            <tbody>
              {list.map(({ v, docs }) => (
                <tr key={v.id}>
                  <td><span className={vh.plateSm}>{v.nopol}</span></td>
                  <td><b>{v.jenis || "—"}</b><br /><small>{[v.year, v.fuel, v.plant].filter(Boolean).join(" · ")}</small></td>
                  <td><span className={`${vh.pill} ${v.aktif ? vh.pillOk : vh.pillWarn}`}>{v.aktif ? L("Aktif", "Active") : "Maint."}</span></td>
                  <td>{driverName(v.default_driver_id)}</td>
                  <td>{v.dept || "—"}</td>
                  <td className={vh.num}>{fmtRp(v.odometer || 0)} km</td>
                  {docs.map((d) => <td key={d.key}><span className={`${vh.pill} ${vh["pl_" + d.level]}`}>{d.level === "none" ? "—" : dueText(d)}</span></td>)}
                  <td className={vh.rowAct}>
                    <button type="button" className={vh.btn} onClick={() => openEdit(v)}>✏️</button>
                    {isAdmin && <button type="button" className={vh.iconDanger} onClick={() => setConfirmDelete(v)} aria-label={L("Hapus", "Delete")}>🗑️</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={560}>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, var(--brand), var(--brand2))", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🚗</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {editing ? (lang === "en" ? "Edit Vehicle" : "Edit Kendaraan") : (lang === "en" ? "Add Vehicle" : "Tambah Kendaraan")}
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
    <label>PLANT *</label>
     <div style={{ display: "flex", gap: 6 }}>
      {((myProfile?.plantScope ? [myProfile.plantScope] : ["CIK", "PRB"]) as Plant[]).map((p) => (
        <button
         key={p}
         type="button"
          onClick={() => setForm({ ...form, plant: p })}
          style={{
            flex: 1,
            padding: "9px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 12.5,
           cursor: "pointer",
            border: form.plant === p ? `1px solid ${PLANT_COLOR[p]}` : "1px solid var(--border2)",
            background: form.plant === p ? "var(--bg2)" : "transparent",
            color: form.plant === p ? PLANT_COLOR[p] : "var(--t3)",
          }}
         >
           {p}
       </button>
      ))}
    </div>
  </div>
                <div>
                  <label>{t.fieldPlateNumber} *</label>
                  <input className={styles.formInput} value={form.nopol} onChange={(e) => setForm({ ...form, nopol: e.target.value })} placeholder="B 1234 XY" />
                </div>
                <div>
                  <label>{t.fieldType} *</label>
                  <input className={styles.formInput} value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} placeholder="Toyota Avanza" />
                </div>
                <div>
                  <label>{t.fieldYear}</label>
                  <input className={styles.formInput} type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </div>
                <div>
                  <label>{t.fieldColor}</label>
                  <input className={styles.formInput} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
                <div>
                  <label>{t.fieldFuel}</label>
                  <select className={styles.formSelect} value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
                    {FUEL_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>{t.fieldOdometer}</label>
                  <input className={styles.formInput} type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
                </div>
                <div>
                  <label>{t.fieldDefaultDriver}</label>
                  <select className={styles.formSelect} value={form.default_driver_id} onChange={(e) => setForm({ ...form, default_driver_id: e.target.value })}>
                    <option value="">-</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.nama}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>{t.fieldDepartment}</label>
                  <input className={styles.formInput} value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} />
                </div>
                <div>
                  <label>{t.fieldStatus}</label>
                  <select
                    className={styles.formSelect}
                    value={form.aktif ? "active" : "maintenance"}
                    onChange={(e) => setForm({ ...form, aktif: e.target.value === "active" })}
                  >
                    <option value="active">Aktif</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div />
              </div>

              <div style={{ marginTop: 16, padding: 14, background: "var(--bg2)", borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>📋 {lang === "en" ? "Document Schedule" : "Jadwal Dokumen"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label>{t.fieldScheduleKir}</label>
                    <input className={styles.formInput} type="date" value={form.kir_date} onChange={(e) => setForm({ ...form, kir_date: e.target.value })} />
                  </div>
                  <div>
                    <label>{t.fieldScheduleService}</label>
                    <input className={styles.formInput} type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
                  </div>
                  <div>
                    <label>{t.fieldScheduleStnk}</label>
                    <input className={styles.formInput} type="date" value={form.stnk_date} onChange={(e) => setForm({ ...form, stnk_date: e.target.value })} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}
                >
                  {t.actionCancel}
                </button>
                <button
                  className="pillBtn"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  style={{ flex: 2, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}
                >
                  {saving ? t.actionSaving : t.actionSave}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this vehicle?" : "Hapus kendaraan?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.nopol}</strong> akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                {t.actionCancel}
              </button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                {t.actionYesDelete}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      </div>
    </ModulePage>
  );
}

/* ════════════════════════════════════════════════════════════
   PRINTER MANAGEMENT — dashboard jumlah printer (berwarna/hitam-
   putih), daftar printer dengan link Control Panel, dan pencatatan
   permintaan karyawan (Reset Kuota, Tambah Kuota, Pengambilan
   Toner) yang diinput admin.
════════════════════════════════════════════════════════════ */
