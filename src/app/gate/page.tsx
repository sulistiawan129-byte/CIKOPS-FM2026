"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  getActiveVehiclesForGate,
  getActiveDriversForGate,
  getGateLogsPublic,
  openGateCheckpoint,
  closeGateCheckpoint,
} from "@/lib/api";
import type { GateVehicleOption, GateDriverOption, VehicleGateLog } from "@/lib/types";

type Mode = "light" | "dark";
const PAGE_SIZE = 6;

const PLANT_THEME = {
  CIK: { main: "#2d5bff", soft: "#e8edff", softDark: "rgba(61,123,255,0.15)", text: "#2d5bff", textDark: "#8ab4ff" },
  PRB: { main: "#ec9a17", soft: "#fdf1d6", softDark: "rgba(255,179,64,0.15)", text: "#a35f00", textDark: "#ffc873" },
} as const;

interface Palette {
  bg: string; headerBg: string; headerBorder: string;
  textPrimary: string; textSecondary: string; textMuted: string;
  cardBg: string; cardBorder: string; inputBg: string; inputBorder: string; inputText: string;
  tableHeadBg: string; tableRowBorder: string; tableRowHover: string;
  pillBg: string; pillBgActive: string;
}
const PALETTE: Record<Mode, Palette> = {
  light: {
    bg: "#eef3fc",
    headerBg: "#ffffff",
    headerBorder: "#e1e8f5",
    textPrimary: "#0d1a36",
    textSecondary: "#44537a",
    textMuted: "#7886a8",
    cardBg: "#ffffff",
    cardBorder: "#e1e8f5",
    inputBg: "#f6f9ff",
    inputBorder: "#cfd9ee",
    inputText: "#0d1a36",
    tableHeadBg: "#f6f9ff",
    tableRowBorder: "#eef1f7",
    tableRowHover: "#f6f9ff",
    pillBg: "#f1f5f9",
    pillBgActive: "#0d1a36",
  },
  dark: {
    bg: "#070d1d",
    headerBg: "#0f1932",
    headerBorder: "rgba(255,255,255,0.08)",
    textPrimary: "#eef3ff",
    textSecondary: "rgba(226,234,248,0.6)",
    textMuted: "rgba(226,234,248,0.4)",
    cardBg: "#0f1932",
    cardBorder: "rgba(255,255,255,0.08)",
    inputBg: "rgba(255,255,255,0.04)",
    inputBorder: "rgba(255,255,255,0.12)",
    inputText: "#eef3ff",
    tableHeadBg: "rgba(255,255,255,0.03)",
    tableRowBorder: "rgba(255,255,255,0.06)",
    tableRowHover: "rgba(255,255,255,0.03)",
    pillBg: "rgba(255,255,255,0.06)",
    pillBgActive: "#2d5bff",
  },
};

function controlLabel(plant: "CIK" | "PRB"): string {
  return plant === "CIK" ? "Check-Out" : "Check-Out";
}
function fmtJam(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}
function fmtTgl(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtTanggalHeader(dateStr: string): { tgl: string; hari: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    tgl: dt.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
    hari: dt.toLocaleDateString("id-ID", { weekday: "long" }),
  };
}
function driverCode(name: string, idx: number): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
  return `${letters}-${String(idx + 1).padStart(3, "0")}`;
}
function firstEventTime(l: VehicleGateLog): string | null {
  return l.plant === "CIK" ? l.timeOut : l.timeIn;
}
function secondEventTime(l: VehicleGateLog): string | null {
  return l.plant === "CIK" ? l.timeIn : l.timeOut;
}

export default function GatePage() {
  const [mode, setMode] = useState<Mode>("light");
  const [officerName, setOfficerName] = useState("");

  const [vehicles, setVehicles] = useState<GateVehicleOption[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [logs, setLogs] = useState<VehicleGateLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("");

  const [tanggal, setTanggal] = useState(todayStr());
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [useManualDriver, setUseManualDriver] = useState(false);
  const [driverManual, setDriverManual] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyLogId, setBusyLogId] = useState<string | null>(null);
  const vehicleInputRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<"active" | "done">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem("gate-theme");
      if (savedMode === "light" || savedMode === "dark") setMode(savedMode);
      const savedOfficer = window.localStorage.getItem("gate-officer-name");
      if (savedOfficer) setOfficerName(savedOfficer);
    } catch {}
  }, []);

  function toggleMode() {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    try { window.localStorage.setItem("gate-theme", next); } catch {}
  }
  function changeOfficerName() {
    const name = window.prompt("Nama petugas gate:", officerName || "");
    if (name !== null) {
      setOfficerName(name.trim());
      try { window.localStorage.setItem("gate-officer-name", name.trim()); } catch {}
    }
  }

  const P = PALETTE[mode];

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "15px 16px",
    borderRadius: 12,
    border: `1.5px solid ${P.inputBorder}`,
    background: P.inputBg,
    fontSize: 15.5,
    color: P.inputText,
    fontFamily: "inherit",
    outline: "none",
    fontWeight: 500,
  };
  const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: P.textMuted, marginBottom: 8, display: "block", letterSpacing: "0.06em" };

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      setLogs(await getGateLogsPublic(tanggal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar");
    } finally {
      setLoadingLogs(false);
    }
  }, [tanggal]);

  useEffect(() => {
    getActiveVehiclesForGate().then(setVehicles).catch(() => {});
    getActiveDriversForGate().then(setDrivers).catch(() => {});
  }, []);

  useEffect(() => {
    loadLogs();
    const poll = setInterval(loadLogs, 15000);
    const clockTimer = setInterval(() => setClock(new Date().toLocaleTimeString("id-ID")), 1000);
    return () => { clearInterval(poll); clearInterval(clockTimer); };
  }, [loadLogs]);

  useEffect(() => { setPage(1); }, [tab, search, tanggal]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (vehicleInputRef.current && !vehicleInputRef.current.contains(e.target as Node)) setShowVehicleDropdown(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const filteredVehicles = vehicles.filter((v) => v.nopol.toLowerCase().includes(vehicleSearch.toLowerCase()));
  const driverOk = useManualDriver ? driverManual.trim() !== "" : driverId !== "";
  const canSubmit = vehicleId !== "" && driverOk && !submitting;
  const activePlant = selectedVehicle ? PLANT_THEME[selectedVehicle.plant] : PLANT_THEME.CIK;

  function pickVehicle(v: GateVehicleOption) {
    setVehicleId(v.id);
    setVehicleSearch(`${v.nopol} — ${v.jenis}`);
    setShowVehicleDropdown(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const now = new Date();
      const [y, m, d] = tanggal.split("-").map(Number);
      const ts = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
      await openGateCheckpoint({
        vehicleId,
        driverId: useManualDriver ? null : driverId,
        driverNameManual: useManualDriver ? driverManual.trim() : null,
        tujuan: tujuan.trim(),
        timestamp: ts,
      });
      setVehicleId(""); setVehicleSearch(""); setDriverId(""); setUseManualDriver(false); setDriverManual(""); setTujuan("");
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleControl(log: VehicleGateLog) {
    setBusyLogId(log.id);
    setError("");
    try {
      await closeGateCheckpoint(log.vehicleId);
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setBusyLogId(null);
    }
  }

  const driverCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const l of logs) {
      if (!map.has(l.driverName)) { map.set(l.driverName, driverCode(l.driverName, i)); i++; }
    }
    return map;
  }, [logs]);

  const activeLogs = logs.filter((l) => l.status !== "DONE");
  const doneLogs = logs.filter((l) => l.status === "DONE");
  const currentList = tab === "active" ? activeLogs : doneLogs;
  const searchedList = currentList.filter((l) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return l.driverName.toLowerCase().includes(q) || l.nopol.toLowerCase().includes(q) || l.tujuan.toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(searchedList.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageList = searchedList.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "-apple-system,'Segoe UI',sans-serif", transition: "background 0.25s ease", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 10, background: "linear-gradient(90deg, #1d44d6, #2d5bff, #5b8cff, #2d5bff, #1d44d6)", flexShrink: 0 }} />
      {/* Header */}
      <div style={{ background: P.headerBg, borderBottom: `1px solid ${P.headerBorder}`, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#0d1a36", border: "2px solid #2d5bff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: P.textPrimary, letterSpacing: "-0.01em" }}>Security Gate Control</div>
            <div style={{ fontSize: 11.5, color: P.textMuted, fontWeight: 700, letterSpacing: "0.04em" }}>CIKOPS FLEET — VEHICLE ACCESS LOG</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <StatPill icon="●" iconColor={PLANT_THEME.CIK.main} iconBg={mode === "light" ? PLANT_THEME.CIK.soft : PLANT_THEME.CIK.softDark} label="CIK KELUAR" value={activeLogs.filter((l) => l.plant === "CIK").length} P={P} />
          <StatPill icon="●" iconColor={PLANT_THEME.PRB.main} iconBg={mode === "light" ? PLANT_THEME.PRB.soft : PLANT_THEME.PRB.softDark} label="PRB CHECK-IN" value={activeLogs.filter((l) => l.plant === "PRB").length} P={P} />

          <div style={{ width: 1, height: 30, background: P.headerBorder }} />

          <div style={{ textAlign: "center", fontFamily: "var(--font-mono, monospace)", padding: "4px 12px" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: P.textPrimary }}>{clock || "--:--:--"}</div>
            <div style={{ fontSize: 10, color: P.textMuted, fontWeight: 700, letterSpacing: "0.04em" }}>WAKTU SERVER</div>
          </div>

          <div style={{ width: 1, height: 30, background: P.headerBorder }} />

          <div style={{ padding: "8px 14px", borderRadius: 12, background: P.pillBg, textAlign: "center" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: P.textPrimary }}>{fmtTanggalHeader(tanggal).tgl}</div>
            <div style={{ fontSize: 10, color: P.textMuted, fontWeight: 700 }}>{fmtTanggalHeader(tanggal).hari}</div>
          </div>

          <button
            onClick={toggleMode}
            title={mode === "light" ? "Mode gelap" : "Mode terang"}
            style={{ width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${P.cardBorder}`, background: P.cardBg, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: P.textPrimary }}
          >
            {mode === "light" ? "\u25D1" : "\u2600"}
          </button>

          <button
            onClick={changeOfficerName}
            title="Nama petugas gate"
            style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "linear-gradient(135deg,#2fd894,#17a673)", color: "#052b1e", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
          >
            {officerName ? officerName.slice(0, 2).toUpperCase() : "SC"}
          </button>
        </div>
      </div>

      <div style={{ width: "100%", boxSizing: "border-box", margin: "0", padding: "28px 40px", display: "grid", gridTemplateColumns: "minmax(460px, 560px) 1fr", gap: 28, alignItems: "start", flex: 1 }}>

        {/* ── FORM (lebih besar — fokus utama halaman) ── */}
        <div style={{ background: P.cardBg, borderRadius: 20, border: `1.5px solid ${selectedVehicle ? activePlant.main : P.cardBorder}`, padding: 34, position: "sticky", top: 24, boxShadow: mode === "light" ? "0 4px 24px rgba(15,40,71,0.06)" : "0 4px 24px rgba(0,0,0,0.3)", transition: "border-color 0.25s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: mode === "light" ? "#e8edff" : "rgba(47,95,224,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#2d5bff", fontWeight: 800 }}>+</div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: P.textPrimary }}>Catat Kendaraan</div>
              <div style={{ fontSize: 12.5, color: P.textMuted }}>Input data untuk akses gate.</div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "13px 16px", borderRadius: 12, background: "#fde5e6", color: "#e5484d", fontSize: 13.5, fontWeight: 600, marginBottom: 18 }}>{error}</div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>TANGGAL *</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20, position: "relative" }} ref={vehicleInputRef}>
            <label style={labelStyle}>KENDARAAN — KETIK PLAT NOMOR *</label>
            <input
              value={vehicleSearch}
              onChange={(e) => { setVehicleSearch(e.target.value); setVehicleId(""); setShowVehicleDropdown(true); }}
              onFocus={() => setShowVehicleDropdown(true)}
              placeholder="Ketik nomor polisi... contoh: B 1234 FFI"
              style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)", border: vehicleId ? `1.5px solid ${activePlant.main}` : inputStyle.border }}
            />
            {showVehicleDropdown && vehicleSearch.trim() !== "" && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: P.cardBg, borderRadius: 14, boxShadow: "0 16px 40px rgba(0,0,0,0.18)", maxHeight: 280, overflowY: "auto", zIndex: 30, border: `1px solid ${P.cardBorder}` }}>
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: 16, color: P.textMuted, fontSize: 14, textAlign: "center" }}>Tidak ditemukan</div>
                ) : (
                  filteredVehicles.map((v) => (
                    <div
                      key={v.id}
                      onMouseDown={() => pickVehicle(v)}
                      style={{ padding: "13px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${P.tableRowBorder}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = P.tableRowHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 15.5, color: P.textPrimary, fontFamily: "var(--font-mono, monospace)" }}>{v.nopol}</span>
                        <span style={{ fontSize: 12.5, color: P.textMuted, marginLeft: 8 }}>{v.jenis}{v.color ? ` - ${v.color}` : ""}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 7, background: mode === "light" ? PLANT_THEME[v.plant].soft : PLANT_THEME[v.plant].softDark, color: mode === "light" ? PLANT_THEME[v.plant].text : PLANT_THEME[v.plant].textDark }}>{v.plant}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>DRIVER *</label>
              <button type="button" onClick={() => setUseManualDriver((v) => !v)} style={{ background: "none", border: "none", color: "#2d5bff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                {useManualDriver ? "Pilih dari daftar" : "Kelola Driver"}
              </button>
            </div>
            {useManualDriver ? (
              <input value={driverManual} onChange={(e) => setDriverManual(e.target.value)} placeholder="Nama driver" style={inputStyle} />
            ) : (
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={inputStyle}>
                <option value="" style={{ background: "#ffffff", color: "#0d1a36" }}>-- Pilih Driver --</option>
                {drivers.map((d) => <option key={d.id} value={d.id} style={{ background: "#ffffff", color: "#0d1a36" }}>{d.nama}</option>)}
              </select>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>TUJUAN</label>
            <input value={tujuan} onChange={(e) => setTujuan(e.target.value)} placeholder="Contoh: Antar dokumen ke PRB" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>KEPERLUAN / CATATAN</label>
            <textarea placeholder="Keperluan perjalanan..." rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: "100%", padding: 18, borderRadius: 14, border: "none",
              background: canSubmit ? "linear-gradient(135deg,#2d5bff,#1d44d6)" : (mode === "light" ? "#e1e8f5" : "rgba(255,255,255,0.06)"),
              color: canSubmit ? "#fff" : P.textMuted, fontWeight: 800, fontSize: 16,
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? "0 10px 24px rgba(47,95,224,0.3)" : "none",
            }}
          >
            {submitting ? "MENYIMPAN..." : selectedVehicle?.plant === "PRB" ? "+ CATAT CHECK-IN" : "+ CATAT KELUAR"}
          </button>
        </div>

        {/* ── LIST (tabel) ── */}
        <div style={{ background: P.cardBg, borderRadius: 20, border: `1px solid ${P.cardBorder}`, overflow: "hidden", boxShadow: mode === "light" ? "0 4px 24px rgba(15,40,71,0.05)" : "0 4px 24px rgba(0,0,0,0.25)" }}>
          <div style={{ padding: "22px 26px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: P.textPrimary }}>Aktivitas Gate</div>
              <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 2 }}>Daftar kendaraan yang tercatat hari ini.</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari driver, kendaraan, tujuan..."
                  style={{ ...inputStyle, width: 260, padding: "10px 14px 10px 34px", fontSize: 13.5 }}
                />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: P.textMuted, fontSize: 13 }}>⌕</span>
              </div>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "10px 12px", fontSize: 13 }} />
            </div>
          </div>

          <div style={{ padding: "0 26px 18px", display: "flex", gap: 8 }}>
            <button
              onClick={() => setTab("active")}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, background: tab === "active" ? P.pillBgActive : P.pillBg, color: tab === "active" ? "#fff" : P.textSecondary }}
            >
              SEDANG AKTIF ({activeLogs.length})
            </button>
            <button
              onClick={() => setTab("done")}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, background: tab === "done" ? P.pillBgActive : P.pillBg, color: tab === "done" ? "#fff" : P.textSecondary }}
            >
              SELESAI ({doneLogs.length})
            </button>
          </div>

          {loadingLogs ? (
            <div style={{ padding: 60, textAlign: "center", color: P.textMuted, fontSize: 15 }}>Memuat data...</div>
          ) : pageList.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: P.textMuted, fontSize: 15 }}>Tidak ada data.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                <thead>
                  <tr style={{ background: P.tableHeadBg }}>
                    {["NO", "DRIVER", "KENDARAAN", "TUJUAN", "CHECK-IN", "CHECK-OUT", "STATUS", "AKSI"].map((h, i) => (
                      <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: P.textMuted, letterSpacing: "0.05em", textAlign: i === 7 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageList.map((l, i) => {
                    const done = l.status === "DONE";
                    const theme = PLANT_THEME[l.plant];
                    const first = firstEventTime(l);
                    const second = secondEventTime(l);
                    return (
                      <tr key={l.id} style={{ borderTop: `1px solid ${P.tableRowBorder}` }}>
                        <td style={{ padding: "16px", fontSize: 13.5, color: P.textMuted }}>{(pageSafe - 1) * PAGE_SIZE + i + 1}</td>
                        <td style={{ padding: "16px" }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: P.textPrimary }}>{l.driverName}</div>
                          <div style={{ fontSize: 11.5, color: P.textMuted, fontFamily: "var(--font-mono, monospace)" }}>{driverCodeMap.get(l.driverName)}</div>
                        </td>
                        <td style={{ padding: "16px" }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: P.textPrimary, fontFamily: "var(--font-mono, monospace)" }}>{l.nopol}</div>
                          <div style={{ fontSize: 11.5, color: P.textMuted }}>{l.jenis}{l.color ? ` - ${l.color}` : ""}</div>
                        </td>
                        <td style={{ padding: "16px", fontSize: 13.5, color: P.textSecondary, maxWidth: 160 }}>{l.tujuan || "-"}</td>
                        <td style={{ padding: "16px", fontSize: 13, color: P.textSecondary }}>
                          {first ? <>{fmtJam(first)}<div style={{ fontSize: 11, color: P.textMuted }}>{fmtTgl(first)}</div></> : "-"}
                        </td>
                        <td style={{ padding: "16px", fontSize: 13, color: P.textSecondary }}>
                          {second ? <>{fmtJam(second)}<div style={{ fontSize: 11, color: P.textMuted }}>{fmtTgl(second)}</div></> : "-"}
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: done ? "#e5f7ef" : (mode === "light" ? theme.soft : theme.softDark), color: done ? "#17a673" : (mode === "light" ? theme.text : theme.textDark) }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: done ? "#17a673" : theme.main }} />
                            {done ? "SELESAI" : "ON TRIP"}
                          </span>
                        </td>
                        <td style={{ padding: "16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${mode === "light" ? "#cfd9ee" : "rgba(255,255,255,0.12)"}`, fontSize: 12, fontWeight: 700, color: P.textSecondary, marginRight: 6 }}>
                            ✓ Check-In
                          </span>
                          <button
                            onClick={() => !done && handleControl(l)}
                            disabled={done || busyLogId === l.id}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9,
                              border: `1.5px solid ${done ? (mode === "light" ? "#cfd9ee" : "rgba(255,255,255,0.12)") : "#ec9a17"}`,
                              background: done ? "transparent" : (mode === "light" ? "#fdf1d6" : "rgba(255,179,64,0.12)"),
                              color: done ? P.textMuted : "#a35f00",
                              fontSize: 12, fontWeight: 700,
                              cursor: done ? "default" : busyLogId === l.id ? "wait" : "pointer",
                            }}
                          >
                            {busyLogId === l.id ? "..." : `✓ ${controlLabel(l.plant)}`}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {searchedList.length > 0 && (
            <div style={{ padding: "16px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${P.tableRowBorder}` }}>
              <div style={{ fontSize: 12.5, color: P.textMuted }}>
                Menampilkan {(pageSafe - 1) * PAGE_SIZE + 1} - {Math.min(pageSafe * PAGE_SIZE, searchedList.length)} dari {searchedList.length} data
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${P.tableRowBorder}`, background: P.cardBg, color: P.textSecondary, cursor: pageSafe === 1 ? "default" : "pointer" }}>‹</button>
                {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
                  <button key={i} onClick={() => setPage(i + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: pageSafe === i + 1 ? "#2d5bff" : "transparent", color: pageSafe === i + 1 ? "#fff" : P.textSecondary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{i + 1}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${P.tableRowBorder}`, background: P.cardBg, color: P.textSecondary, cursor: pageSafe === totalPages ? "default" : "pointer" }}>›</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 10, background: "linear-gradient(90deg, #1d44d6, #2d5bff, #5b8cff, #2d5bff, #1d44d6)", flexShrink: 0 }} />
    </div>
  );
}

function StatPill({ icon, iconColor, iconBg, label, value, P }: { icon: string; iconColor: string; iconBg: string; label: string; value: number; P: Palette }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 6px", borderRadius: 14, background: P.pillBg }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: iconColor }}>{icon}</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: P.textPrimary, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 9.5, fontWeight: 800, color: P.textMuted, letterSpacing: "0.04em" }}>{label}</div>
      </div>
    </div>
  );
}
