"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import styles from "./dashboard.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { getGasStations, addGasStation, updateGasStation, deleteGasStation } from "@/lib/api";
import type { Overtime, GasStation, FuelEntry } from "@/lib/types";
import type { Driver } from "@/lib/types";
import { useLang } from "@/lib/providers";
import of from "./opfund.module.css";
import { ModuleHeader, ModulePage } from "./ModuleShell";
import { SkeletonRows } from "./TaskModals";

// Leaflet touches `window` directly, so it must never be server-rendered.
const GasStationMap = dynamic(() => import("./GasStationMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, borderRadius: "var(--r2)", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>
      Memuat peta...
    </div>
  ),
});

const FUEL_TYPES_LIST = ["Pertalite", "Pertamax", "Pertamax Turbo", "Pertamax Green", "Solar", "Dexlite"];

/* ── REPORTS TAB — comprehensive report merging Tasks (Penugasan Driver),
   Claims, Overtime, Vehicles, Dana Operasional, and Driver Budget.
   Filterable by month / date range / year. Nothing is computed until the
   user explicitly clicks "Generate Laporan". ── */
export function GasStationsTab() {
  const { lang, t } = useLang();
  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [focusStation, setFocusStation] = useState<GasStation | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GasStation | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formFuels, setFormFuels] = useState<FuelEntry[]>(FUEL_TYPES_LIST.map((f) => ({ type: f, available: true })));
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GasStation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStations(await getGasStations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data SPBU");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormAddress("");
    setFormLat("");
    setFormLng("");
    setFormFuels(FUEL_TYPES_LIST.map((f) => ({ type: f, available: true })));
    setFormNotes("");
    setShowForm(true);
  }
  function openEdit(s: GasStation) {
    setEditing(s);
    setFormName(s.name);
    setFormAddress(s.address);
    setFormLat(String(s.lat));
    setFormLng(String(s.lng));
    setFormFuels(FUEL_TYPES_LIST.map((f) => {
      const existing = s.fuels.find((x) => x.type === f);
      return { type: f, available: existing ? existing.available : false };
    }));
    setFormNotes(s.notes);
    setShowForm(true);
  }
  function toggleFuel(type: string) {
    setFormFuels((p) => p.map((f) => (f.type === type ? { ...f, available: !f.available } : f)));
  }

  function handleMapPick(lat: number, lng: number) {
    setPlacing(false);
    setEditing(null);
    setFormName("");
    setFormAddress("");
    setFormLat(lat.toFixed(6));
    setFormLng(lng.toFixed(6));
    setFormFuels(FUEL_TYPES_LIST.map((f) => ({ type: f, available: true })));
    setFormNotes("");
    setShowForm(true);
  }

  function handleMarkerClick(s: GasStation) {
    openEdit(s);
  }

  const canSave = formName.trim() && formLat !== "" && formLng !== "" && !isNaN(Number(formLat)) && !isNaN(Number(formLng));

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = { name: formName.trim(), address: formAddress.trim(), lat: Number(formLat), lng: Number(formLng), fuels: formFuels, notes: formNotes.trim() };
      if (editing) await updateGasStation(editing.id, payload);
      else await addGasStation(payload);
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan SPBU");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteGasStation(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus SPBU");
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  // ── Derived analytics for the stat cards / charts below ──
  const totalStations = stations.length;
  const fuelTypesTracked = new Set(stations.flatMap((s) => s.fuels.filter((f) => f.available).map((f) => f.type))).size;
  const avgFuelTypesPerStation = totalStations > 0 ? stations.reduce((sum, s) => sum + s.fuels.filter((f) => f.available).length, 0) / totalStations : 0;
  const noFuelDataYet = stations.filter((s) => s.fuels.every((f) => !f.available)).length;

  const fuelDistribution = FUEL_TYPES_LIST.map((type) => {
    const count = stations.filter((s) => s.fuels.find((f) => f.type === type)?.available).length;
    return { type, count, pct: totalStations > 0 ? (count / totalStations) * 100 : 0 };
  }).sort((a, b) => b.count - a.count);

  const completeness = { complete: 0, partial: 0, notFilled: 0 };
  stations.forEach((s) => {
    const fuelCount = s.fuels.filter((f) => f.available).length;
    const hasAddress = !!s.address.trim();
    if (fuelCount === 0) completeness.notFilled++;
    else if (fuelCount >= 3 && hasAddress) completeness.complete++;
    else completeness.partial++;
  });

  const growthByMonth = (() => {
    const map = new Map<string, number>();
    stations
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((s) => {
        const d = new Date(s.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, (map.get(key) || 0) + 1);
      });
    let running = 0;
    return [...map.entries()].map(([key, count]) => {
      running += count;
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { month: "short", year: "2-digit" });
      return { label, cumulative: running };
    });
  })();
  const maxGrowth = Math.max(...growthByMonth.map((g) => g.cumulative), 1);

return (
    <ModulePage>
      <ModuleHeader
        kicker={lang === "en" ? "Fleet · Fuel" : "Fleet · Bahan Bakar"}
        title={lang === "en" ? "Gas Stations" : "Pom Bensin"}
        desc={lang === "en" ? "Map of gas stations drivers use, the fuel types each one sells, and data completeness." : "Peta SPBU yang dipakai driver, jenis BBM yang tersedia di tiap titik, dan kelengkapan datanya."}
        actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, color: "var(--t3)", marginRight: 4 }}>{totalStations} {lang === "en" ? "stations saved" : "SPBU tersimpan"}</span>
          <button
            onClick={() => setPlacing((p) => !p)}
            className="pillBtn"
            style={{
              background: placing ? "linear-gradient(135deg, var(--orange), #c96a10)" : "linear-gradient(135deg, var(--brand), var(--brand2))",
              boxShadow: placing ? "none" : "var(--shadow-brand)",
            }}
          >
            {placing ? `✕ ${lang === "en" ? "Cancel" : "Batal"}` : `📍 ${lang === "en" ? "Mark on Map" : "Tandai di Peta"}`}
          </button>
          <button
            onClick={openAdd}
            style={{ padding: "10px 18px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            + {lang === "en" ? "Manual Input" : "Input Manual"}
          </button>
        </div>
        }
      />

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {/* ── Stat cards ── */}
      <div className="neonCard" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {[
            { label: lang === "en" ? "Total Stations" : "Total SPBU", sub: lang === "en" ? "points saved" : "titik tersimpan", value: String(totalStations), badge: "blue",
              icon: <><path d="M3 22V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M3 10h10" /><path d="M15 6l3.5 3.5a1.5 1.5 0 0 0 2.5-1.1V6.5" /></> },
            { label: lang === "en" ? "Fuel Types Tracked" : "Jenis BBM Terlacak", sub: lang === "en" ? "types at ≥1 station" : "jenis di ≥1 SPBU", value: `${fuelTypesTracked}/${FUEL_TYPES_LIST.length}`, badge: "teal",
              icon: <><path d="M9 2v6L4 20a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L15 8V2" /><path d="M9 2h6" /></> },
            { label: lang === "en" ? "Avg Fuel Types/Station" : "Rata BBM/SPBU", sub: lang === "en" ? "types per point" : "jenis per titik", value: avgFuelTypesPerStation.toFixed(1), badge: "purple",
              icon: <><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-4" /></> },
            { label: lang === "en" ? "No Fuel Data Yet" : "Belum Ada Data BBM", sub: lang === "en" ? "needs completing" : "perlu dilengkapi", value: String(noFuelDataYet), badge: noFuelDataYet > 0 ? "red" : "green",
              icon: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></> },
          ].map((s, i) => (
            <div key={i} className="statPop" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderLeft: i > 0 ? "1px solid var(--border2)" : "none", position: "relative", zIndex: 1, animationDelay: `${i * 0.05}s` }}>
              <div className={`hexBadge ${s.badge} small`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {s.icon}
                </svg>
              </div>
              <div>
                <div className="statValue" style={{ fontSize: 20 }}>{s.value}</div>
                <div className="statLabel">{s.label}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fuel distribution + Data completeness + Growth trend ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 16 }}>{lang === "en" ? "Fuel Type Distribution" : "Distribusi Jenis BBM"}</div>
          {fuelDistribution.map((f, i) => (
            <div key={f.type} style={{ marginBottom: i === fuelDistribution.length - 1 ? 0 : 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--t2)", fontWeight: 600 }}>{f.type}{i === 0 && f.count > 0 ? " ★" : ""}</span>
                <span style={{ color: "var(--t3)" }}>{f.count} {lang === "en" ? "stations" : "SPBU"} · {f.pct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${f.pct}%`, background: "linear-gradient(90deg, var(--brand), var(--gold2))", borderRadius: 4, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="statPop" style={{ ...cardStyle, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>{lang === "en" ? "Data Completeness" : "Kelengkapan Data"}</div>
            {[
              { label: lang === "en" ? "Complete" : "Lengkap", value: completeness.complete, color: "var(--green)" },
              { label: lang === "en" ? "Partial" : "Sebagian", value: completeness.partial, color: "var(--orange)" },
              { label: lang === "en" ? "Not Filled" : "Belum Diisi", value: completeness.notFilled, color: "var(--red)" },
            ].map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < 2 ? 10 : 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: "var(--t2)", flex: 1 }}>{c.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{c.value}</span>
              </div>
            ))}
          </div>

          <div className="statPop" style={{ ...cardStyle, padding: 20, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>{lang === "en" ? "Station Growth Trend" : "Tren Pertumbuhan SPBU"}</div>
            {growthByMonth.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--t3)" }}>{lang === "en" ? "No data yet" : "Belum ada data"}</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 70 }}>
                {growthByMonth.map((g, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{g.cumulative}</span>
                    <div style={{ width: "100%", height: `${Math.max(8, (g.cumulative / maxGrowth) * 44)}px`, background: "linear-gradient(180deg, var(--brand), var(--brand2))", borderRadius: "6px 6px 2px 2px" }} />
                    <span style={{ fontSize: 12, color: "var(--t3)" }}>{g.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Map + Station list ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <div className="statPop">
          <GasStationMap stations={stations} placing={placing} onPick={handleMapPick} onMarkerClick={handleMarkerClick} focusStation={focusStation} />
        </div>
        <div className="statPop" style={{ ...cardStyle, overflow: "hidden", maxHeight: 420, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
            {lang === "en" ? "Station List" : "Daftar SPBU"}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : stations.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12 }}>{t.actionNoDataYet}</div>
            ) : (
              stations.map((s) => {
                const activeFuelCount = s.fuels.filter((f) => f.available).length;
                const isFocused = focusStation?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setFocusStation(s)}
                    className="rowHover"
                    style={{
                      padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
                      background: isFocused ? "var(--gold-soft)" : undefined,
                      borderLeft: isFocused ? "3px solid var(--gold)" : "3px solid transparent",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>📍 {s.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address || `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}</div>
                      <div style={{ fontSize: 12, color: "var(--brand)", marginTop: 2, fontWeight: 600 }}>{activeFuelCount} {lang === "en" ? "fuel types available" : "jenis BBM tersedia"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                        style={{ border: "none", background: "none", color: "var(--t3)", cursor: "pointer", fontSize: 12 }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }}
                        style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={460}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Station" : "Edit SPBU") : (lang === "en" ? "Add Station" : "Tambah SPBU")}</div>
            <div style={{ marginBottom: 12 }}>
              <label>{t.fieldStationName}</label>
              <input className={styles.formInput} value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div><label>{t.fieldLatitude}</label><input className={styles.formInput} value={formLat} onChange={(e) => setFormLat(e.target.value)} placeholder="-6.2607" /></div>
              <div><label>{t.fieldLongitude}</label><input className={styles.formInput} value={formLng} onChange={(e) => setFormLng(e.target.value)} placeholder="107.1525" /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label>{t.fieldAddress}</label>
              <input className={styles.formInput} value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label>{t.fieldFuelsAvailable}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {formFuels.map((f) => (
                  <div
                    key={f.type}
                    onClick={() => toggleFuel(f.type)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 8, cursor: "pointer", background: f.available ? "var(--green-soft)" : "var(--bg2)", border: f.available ? "1px solid var(--green)" : "1px solid var(--border2)" }}
                  >
                    <div style={{ width: 15, height: 15, borderRadius: 4, background: f.available ? "var(--green)" : "transparent", border: f.available ? "none" : "1px solid var(--border2)" }} />
                    <span style={{ fontSize: 12, color: f.available ? "var(--t1)" : "var(--t3)", fontWeight: f.available ? 700 : 400 }}>{f.type}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>{t.fieldNotes}</label>
              <input className={styles.formInput} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="dekat pintu tol, buka 24 jam..." />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSave} disabled={!canSave || saving} style={{ flex: 1, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this station?" : "Hapus SPBU ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{confirmDelete.name}</strong> akan dihapus permanen.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </ModulePage>
  );
}

/* ── VEHICLES TAB — full CRUD, ported from FleetOS ── */
