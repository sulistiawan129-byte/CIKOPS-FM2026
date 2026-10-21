"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./dashboard.module.css";
import { OverviewBoard, type OverviewData } from "./OverviewUI";
import hm from "./home.module.css";
import { canAccessTab, isPrbOnly, getDrivers, type MyProfile, getCanteenReportsForMonth, getTasksByRange, getVehicles, getAllVehiclesFull, getClaims, getVehicleGateLogs, withOrigins, getAnnouncements, addAnnouncement, getOvertimes, getCurrentKantong, getDriverTiers, getGasStations } from "@/lib/api";
import type { Claim, Overtime, Kantong, DriverTier, GasStation, CanteenReport, VehicleGateLog, Announcement } from "@/lib/types";
import type { Driver, TaskDetail, Vehicle } from "@/lib/types";
import { plantLocation } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { getLockerStatusGrid } from "@/lib/lockerApi";
import CalendarAgenda from "./CalendarAgenda";
import { toLocalISODate } from "@/lib/dateUtils";
import Icon from "@/components/Icon";
import of from "./opfund.module.css";
import { todayStr, DashboardTab, NAV_GROUPS, useCountUp } from "./dashboardShared";

export interface NavTab { id: DashboardTab; icon: string; labelId: string; labelEn: string; descId?: string; descEn?: string }
export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

/** Adds months to a date string, returns ISO date string (YYYY-MM-DD).
 *  Clamps to the last day of the target month so Jan 31 + 1 month
 *  correctly returns Feb 28 (not March 3). */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  const targetMonth = d.getMonth() + months;
  // Set to day 1 first to avoid overflow when probing last day
  d.setDate(1);
  d.setMonth(targetMonth);
  // Find last day of target month
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  // Use original day, clamped to last day of target month
  const originalDay = new Date(dateStr).getDate();
  d.setDate(Math.min(originalDay, lastDay));
  return toLocalISODate(d);
}

/**
 * Ketentuan next date:
 *   KIR     → +6 bulan dari tanggal KIR terakhir
 *   STNK    → +12 bulan dari tanggal STNK terakhir
 *   Service → +3 bulan dari tanggal service terakhir (reminder awal),
 *             hard-deadline +6 bulan
 */
export function nextDocDate(type: "KIR" | "STNK" | "Service", lastDate: string | null | undefined): {
  next: string | null;
  nextEarly: string | null; // hanya untuk Service (3-bulan reminder)
} {
  if (!lastDate) return { next: null, nextEarly: null };
  if (type === "KIR")     return { next: addMonths(lastDate, 6),  nextEarly: null };
  if (type === "STNK")    return { next: addMonths(lastDate, 12), nextEarly: null };
  // Service: reminder mulai 3 bulan, batas akhir 6 bulan
  return {
    next: addMonths(lastDate, 6),
    nextEarly: addMonths(lastDate, 3),
  };
}

function AnnouncementWidget({ announcements, onAdd, canManage }: { announcements: Announcement[]; onAdd: (a: { title: string; body: string }) => void; canManage: boolean }) {
  const { lang } = useLang();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const latest = announcements[0];
  const isNew = latest ? Date.now() - new Date(latest.createdAt).getTime() < 1000 * 60 * 60 * 24 * 3 : false;

  return (
    <div className="neonCard" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--t1)" }}>{lang === "en" ? "Announcement" : "Pengumuman"}</div>
        {latest && isNew && <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: "var(--pill)", background: "var(--red)", color: "#fff" }}>{lang === "en" ? "NEW" : "BARU"}</span>}
      </div>
      {canManage && (
        <button onClick={() => setShowForm((v) => !v)} style={{ background: "none", border: "none", color: "var(--brand)", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
          {showForm ? (lang === "en" ? "Cancel" : "Batal") : `+ ${lang === "en" ? "Post announcement" : "Buat pengumuman"}`}
        </button>
      )}
      {showForm && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, padding: 12, borderRadius: 10, background: "var(--bg2)" }}>
          <input className={styles.formInput} placeholder={lang === "en" ? "Title" : "Judul"} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={styles.formTextarea} rows={3} placeholder={lang === "en" ? "Message" : "Isi pesan"} value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="pillBtn" disabled={!title.trim() || !body.trim()} onClick={() => { onAdd({ title: title.trim(), body: body.trim() }); setTitle(""); setBody(""); setShowForm(false); }}>
            {lang === "en" ? "Post" : "Terbitkan"}
          </button>
        </div>
      )}
      {latest ? (
        <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, background: "var(--bg2)" }}>
          <span style={{ fontSize: 20 }}>📢</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 3 }}>{latest.title}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.4 }}>{latest.body}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--t3)", textAlign: "center", padding: "12px 0" }}>{lang === "en" ? "No announcements." : "Belum ada pengumuman."}</div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   HOME TAB — halaman utama baru: sapaan + KPI ringkas, Modul Utama
   (kartu ikon per kategori), dan panel kanan (Kalender, Agenda,
   Aksi Cepat, Pengumuman). Konten "Ringkasan" (KPI detail lama)
   tetap ada terpisah, tidak diganti.
════════════════════════════════════════════════════════════ */
const GROUP_TONE: Record<string, { fg: string; bg: string }> = {
  fleet: { fg: "var(--brand)", bg: "var(--accent-soft)" },
  finance: { fg: "var(--green-text)", bg: "var(--green-soft)" },
  facility: { fg: "var(--orange-text)", bg: "var(--orange-soft)" },
  security: { fg: "var(--red)", bg: "var(--red-soft)" },
  system: { fg: "var(--t2)", bg: "var(--bg2)" },
};

function initialsOf(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function fmtClock(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function fmtRpShort(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${Math.round(n || 0)}`;
}

export function HomeTab({
  setActiveTab,
  openTasksOn,
  myProfile,
  activeGroupId,
  setActiveGroupId,
}: {
  setActiveTab: (t: DashboardTab) => void;
  openTasksOn: (date: string) => void;
  myProfile: MyProfile | null;
  activeGroupId?: string;
  setActiveGroupId: (id: string | undefined) => void;
}) {
  const { lang } = useLang();
  const [viewLinkCopied, setViewLinkCopied] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"all" | "ON GOING" | "ASSIGNED" | "DONE">("all");
  const prbOnly = isPrbOnly(myProfile);
  const visibleGroups = NAV_GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => canAccessTab(myProfile, t.id)) })).filter((g) => g.tabs.length > 0);
  const filteredGroup = activeGroupId ? visibleGroups.find((g) => g.id === activeGroupId) : undefined;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [weekTasks, setWeekTasks] = useState<TaskDetail[]>([]);
  const [gateLogs, setGateLogs] = useState<VehicleGateLog[]>([]);
  const [gateLoadedAt, setGateLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [kpi, setKpi] = useState<{
    claimWeekTotal: number;
    tasksToday: number;
    canteenTodaySnack: number;
    canteenTodayMeal: number;
    opBudgetAvailable: number;
    vehiclesActive: number;
    driversActive: number;
  } | null>(null);

  const loadWidgets = useCallback(async () => {
    try {
      setAnnouncements(await getAnnouncements());
    } catch (e) {
      console.warn("Gagal memuat widget dashboard:", e);
    }
  }, []);

  useEffect(() => { if (!prbOnly) loadWidgets(); }, [loadWidgets, prbOnly]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Tugas 7 hari terakhir (untuk grafik) — mengikuti plant scope akun.
  useEffect(() => {
    (async () => {
      try {
        const from = new Date();
        from.setDate(from.getDate() - 6);
        setWeekTasks(await withOrigins(await getTasksByRange(toLocalISODate(from), todayStr(), myProfile?.plantScope ?? null)));
      } catch (e) {
        console.warn("Gagal memuat tugas 7 hari:", e);
      }
    })();
  }, [myProfile?.plantScope]);

  // Aktivitas gate hari ini, ditarik ulang tiap 20 detik.
  useEffect(() => {
    let alive = true;
    async function loadGate() {
      try {
        const d = todayStr();
        const logs = await getVehicleGateLogs({ plant: myProfile?.plantScope ?? null, dateFrom: d, dateTo: d });
        if (alive) { setGateLogs(logs); setGateLoadedAt(Date.now()); }
      } catch (e) {
        console.warn("Gagal memuat aktivitas gate:", e);
      }
    }
    if (prbOnly) return;
    loadGate();
    const id = setInterval(loadGate, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [myProfile?.plantScope, prbOnly]);

  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const todayS = toLocalISODate(now);
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const dow = (now.getDay() + 6) % 7; // Senin = 0
        const monday = new Date(now);
        monday.setDate(now.getDate() - dow);
        const mondayStr = toLocalISODate(monday);

        if (prbOnly) {
          const [tasksToday, vehicles, drivers] = await Promise.all([
            getTasksByRange(todayS, todayS, "PRB"),
            getVehicles("PRB"),
            getDrivers("PRB"),
          ]);
          setKpi({
            claimWeekTotal: 0, tasksToday: tasksToday.length, canteenTodaySnack: 0, canteenTodayMeal: 0, opBudgetAvailable: 0,
            vehiclesActive: vehicles.filter((v) => v.aktif).length,
            driversActive: drivers.filter((d) => d.aktif).length,
          });
          return;
        }

        const [claims, tasksToday, canteenMonth, kantongCik, kantongPrb, vehicles, drivers] = await Promise.all([
          getClaims(),
          getTasksByRange(todayS, todayS, null),
          getCanteenReportsForMonth(monthStr),
          getCurrentKantong("CIK").catch(() => null),
          getCurrentKantong("PRB").catch(() => null),
          getVehicles(),
          getDrivers(),
        ]);

        const claimWeekTotal = claims
          .filter((c) => c.submissionDate >= mondayStr && c.submissionDate <= todayS)
          .reduce((s, c) => s + c.total, 0);
        const canteenToday = canteenMonth.find((r) => r.reportDate === todayS);
        // Snack & makan ditampilkan terpisah, tidak digabung.
        const canteenTodaySnack = canteenToday ? canteenToday.snackOrder.reduce((a, b) => a + b, 0) : 0;
        const canteenTodayMeal = canteenToday ? canteenToday.mealOrder.reduce((a, b) => a + b, 0) : 0;
        const opBudgetAvailable = (kantongCik?.cashAvailable ?? 0) + (kantongPrb?.cashAvailable ?? 0);

        setKpi({
          claimWeekTotal,
          tasksToday: tasksToday.length,
          canteenTodaySnack,
          canteenTodayMeal,
          opBudgetAvailable,
          vehiclesActive: vehicles.filter((v) => v.aktif).length,
          driversActive: drivers.filter((d) => d.aktif).length,
        });
      } catch (e) {
        console.warn("Gagal memuat KPI Home:", e);
      }
    })();
  }, [prbOnly]);

  async function handleAddAnnouncement(a: { title: string; body: string }) {
    try {
      await addAnnouncement({ ...a, createdBy: myProfile?.fullName ?? "" });
      loadWidgets();
    } catch (err) {
      alert(`Gagal menerbitkan pengumuman: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Turunan data untuk hero, grafik, donut ──
  const today = todayStr();
  const activeWeek = weekTasks.filter((t) => t.status !== "CANCELLED");
  const todayTasks = activeWeek.filter((t) => t.tanggal === today);
  const ongoingToday = todayTasks.filter((t) => t.status === "ON GOING");
  const lateOngoing = ongoingToday.filter((t) => {
    const started = t.accepted_at ?? t.created_at;
    return started && nowTick - new Date(started).getTime() > 2 * 60 * 60 * 1000;
  });
  const vehiclesOut = new Set(ongoingToday.map((t) => t.vehicle_id).filter(Boolean)).size;
  const vehiclesTotal = kpi?.vehiclesActive ?? 0;
  const vehiclesFree = Math.max(0, vehiclesTotal - vehiclesOut);

  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(toLocalISODate(d));
  }
  const chartData = dayKeys.map((k) => ({
    key: k,
    label: new Date(k + "T00:00:00").toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { weekday: "short" }),
    cik: activeWeek.filter((t) => t.tanggal === k && t.plant === "CIK").length,
    prb: activeWeek.filter((t) => t.tanggal === k && t.plant === "PRB").length,
  }));
  const chartMax = Math.max(4, ...chartData.map((d) => Math.max(d.cik, d.prb)));

  const hour = new Date(nowTick).getHours();
  const greet =
    lang === "en"
      ? hour < 11 ? "Good morning" : hour < 15 ? "Good afternoon" : hour < 18 ? "Good evening" : "Good night"
      : hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  const firstName = (myProfile?.fullName || "").split(" ")[0] || "Admin";
  const dateLabel = new Date(nowTick).toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const heroCount = { today: useCountUp(todayTasks.length), going: useCountUp(ongoingToday.length), out: useCountUp(vehiclesOut) };
  const gateAgo = gateLoadedAt ? Math.max(0, Math.round((nowTick - gateLoadedAt) / 1000)) : null;

  function renderCard(tabItem: NavTab, groupId: string) {
    const tone = GROUP_TONE[groupId] ?? GROUP_TONE.system;
    return (
      <button key={tabItem.id} onClick={() => setActiveTab(tabItem.id)} className={styles.moduleCard}>
        <span className={styles.moduleIcon} style={{ background: tone.bg, color: tone.fg }}>
          <Icon name={tabItem.id} size={22} />
        </span>
        <span className={styles.moduleText}>
          <span className={styles.moduleName}>{lang === "id" ? tabItem.labelId : tabItem.labelEn}</span>
          <span className={styles.moduleDesc}>{lang === "id" ? tabItem.descId : tabItem.descEn}</span>
        </span>
        <span className={styles.moduleArrow}><Icon name="arrow" size={16} /></span>
      </button>
    );
  }

  const donutR = 46;
  const donutC = 2 * Math.PI * donutR;
  const donutTotal = Math.max(1, vehiclesTotal);
  const outLen = (vehiclesOut / donutTotal) * donutC;
  const freeLen = (vehiclesFree / donutTotal) * donutC;
  const readyPct = vehiclesTotal > 0 ? Math.round((vehiclesFree / vehiclesTotal) * 100) : 0;

  return (
    <div className={`${styles.homeLayout} ${hm.exec}`} style={prbOnly ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
      <div className={styles.homeMain}>
        {!filteredGroup && (
          <>
            {/* ── Hero: command center ── */}
            <section className={hm.hero}>
              <div className={hm.heroTop}>
                <span className={hm.eyebrow}><i className={hm.liveDot} />{dateLabel}</span>
                <div className={hm.clock} aria-label="Waktu sekarang">
                  {new Date(nowTick).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")}
                  <span>WIB</span>
                </div>
              </div>
              <h1>{greet}, {firstName}.</h1>
              <p className={hm.heroSub}>
                {ongoingToday.length > 0
                  ? `${ongoingToday.length} tugas sedang berjalan${lateOngoing.length > 0 ? `, ${lateOngoing.length} perlu dicek.` : ", semua sesuai jadwal."}`
                  : todayTasks.length > 0 ? "Belum ada tugas yang berjalan saat ini." : "Belum ada penugasan hari ini."}
              </p>
              <div className={hm.heroBottom}>
                <div className={hm.heroActions}>
                  <button type="button" className={hm.heroPrimary} onClick={() => setActiveTab("tasks")}>
                    <Icon name="plus" size={16} strokeWidth={2.4} />Tugaskan driver
                  </button>
                  {!prbOnly && (
                    <>
                      <a className={hm.heroGhost} href="/dashboard-viewonly" target="_blank" rel="noopener noreferrer">
                        <Icon name="eye" size={16} />ViewOnly<Icon name="external" size={13} />
                      </a>
                      <button
                        type="button"
                        className={hm.heroGhost}
                        title="Salin link Dashboard-ViewOnly"
                        onClick={() => {
                          const url = `${window.location.origin}/dashboard-viewonly`;
                          navigator.clipboard?.writeText(url).then(
                            () => { setViewLinkCopied(true); setTimeout(() => setViewLinkCopied(false), 2000); },
                            () => window.prompt("Salin link ini:", url),
                          );
                        }}
                      >
                        <Icon name={viewLinkCopied ? "check" : "copy"} size={15} />{viewLinkCopied ? "Tersalin" : "Salin link"}
                      </button>
                    </>
                  )}
                </div>
                <div className={hm.heroStats}>
                  <button type="button" onClick={() => setActiveTab("tasks")}><b>{heroCount.today}</b><span>Tugas hari ini</span></button>
                  <button type="button" onClick={() => setActiveTab("tasks")}><b>{heroCount.going}</b><span>Sedang jalan</span></button>
                  <button type="button" onClick={() => setActiveTab("vehicles")}><b>{heroCount.out}</b><span>Kendaraan keluar</span></button>
                </div>
              </div>
            </section>

            {lateOngoing.length > 0 && (
              <button type="button" className={hm.alert} onClick={() => setActiveTab("tasks")}>
                <span className={hm.alertIc}><Icon name="alert" size={18} /></span>
                <span className={hm.alertText}>
                  <b>{lateOngoing.length} tugas berjalan lebih dari 2 jam</b>
                  <span>{lateOngoing.slice(0, 2).map((t) => `${t.driver_nama ?? "-"} ke ${t.tujuan}`).join(" · ")}</span>
                </span>
                <span className={hm.alertGo}>Cek tugas</span>
              </button>
            )}

            {/* ── KPI band ── */}
            {kpi && (
              <section className={hm.kpiBand} aria-label="Indikator" style={{ ["--n" as string]: prbOnly ? 2 : 5 }}>
                <button type="button" className={hm.kpi} onClick={() => setActiveTab("tasks")}>
                  <span className={hm.kpiIc}><Icon name="tasks" size={18} /></span>
                  <span className={hm.kpiLabel}>Tugas hari ini</span>
                  <b className={hm.kpiVal}>{kpi.tasksToday.toLocaleString("id-ID")}</b>
                </button>
                <button type="button" className={hm.kpi} onClick={() => setActiveTab("vehicles")}>
                  <span className={hm.kpiIc}><Icon name="vehicles" size={18} /></span>
                  <span className={hm.kpiLabel}>Kendaraan aktif</span>
                  <b className={hm.kpiVal}>{kpi.vehiclesActive}<small> · {kpi.driversActive} driver</small></b>
                </button>
                {!prbOnly && (
                  <>
                    <button type="button" className={hm.kpi} onClick={() => setActiveTab("claims")}>
                      <span className={hm.kpiIc}><Icon name="claims" size={18} /></span>
                      <span className={hm.kpiLabel}>Klaim minggu ini</span>
                      <b className={hm.kpiVal}>{fmtRpShort(kpi.claimWeekTotal)}</b>
                    </button>
                    <button type="button" className={hm.kpi} onClick={() => setActiveTab("canteen")}>
                      <span className={hm.kpiIc}><Icon name="canteen" size={18} /></span>
                      <span className={hm.kpiLabel}>Kantin hari ini</span>
                      <b className={hm.kpiVal}>{kpi.canteenTodaySnack.toLocaleString("id-ID")}<small> snack · </small>{kpi.canteenTodayMeal.toLocaleString("id-ID")}<small> makan</small></b>
                    </button>
                    <button type="button" className={hm.kpi} onClick={() => setActiveTab("opfund")}>
                      <span className={hm.kpiIc}><Icon name="opfund" size={18} /></span>
                      <span className={hm.kpiLabel}>Dana tersedia</span>
                      <b className={hm.kpiVal}>{fmtRpShort(kpi.opBudgetAvailable)}</b>
                    </button>
                  </>
                )}
              </section>
            )}

            {/* ── Papan: tugas hari ini, gate, armada, perhatian ── */}
            <div className={hm.boardWrap}>
            <div className={`${hm.board} ${prbOnly ? hm.boardPrb : ""}`}>
              <section className={`${hm.card} ${hm.aTasks}`}>
                <div className={hm.cardHead}>
                  <div>
                    <h2>Tugas hari ini</h2>
                    <span className={hm.sub}>{todayTasks.length} tugas · {todayTasks.filter((t) => t.status === "DONE").length} selesai</span>
                  </div>
                  <div className={hm.seg} role="group" aria-label="Filter status tugas">
                    {([["all", "Semua", todayTasks.length], ["ON GOING", "Berjalan", todayTasks.filter((t) => t.status === "ON GOING").length], ["ASSIGNED", "Menunggu", todayTasks.filter((t) => t.status === "ASSIGNED").length], ["DONE", "Selesai", todayTasks.filter((t) => t.status === "DONE").length]] as const).map(([k, l, n]) => (
                      <button key={k} type="button" aria-pressed={taskFilter === k} className={taskFilter === k ? hm.segOn : ""} onClick={() => setTaskFilter(k)}>
                        {l}<span>{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const order: Record<string, number> = { "ON GOING": 0, ASSIGNED: 1, DONE: 2 };
                  const list = todayTasks
                    .filter((t) => taskFilter === "all" || t.status === taskFilter)
                    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  if (list.length === 0) {
                    return (
                      <div className={hm.emptyBox}>
                        <b>{todayTasks.length === 0 ? "Belum ada penugasan hari ini" : "Tidak ada tugas dengan status ini"}</b>
                        {todayTasks.length === 0 && <button type="button" className={hm.cardLink} onClick={() => setActiveTab("tasks")}><Icon name="plus" size={14} />Tugaskan driver</button>}
                      </div>
                    );
                  }
                  return (
                    <div className={hm.taskList}>
                      {list.slice(0, 6).map((t) => {
                        const st = t.status === "ON GOING" ? { l: "Berjalan", c: hm.sGo } : t.status === "DONE" ? { l: "Selesai", c: hm.sDone } : { l: "Menunggu", c: hm.sWait };
                        const at = t.status === "DONE" ? t.completed_at : t.status === "ON GOING" ? t.accepted_at : t.created_at;
                        return (
                          <button key={t.id} type="button" className={hm.taskRow} onClick={() => setActiveTab("tasks")}>
                            <span className={`${hm.av} ${t.plant === "PRB" ? hm.avPrb : ""}`}>{initialsOf(t.driver_nama ?? "-")}</span>
                            <span className={hm.taskMain}>
                              <b>{t.driver_nama ?? "Belum ada driver"}</b>
                              <span className={hm.route}>
                                <span>{t.lokasi_asal || plantLocation(t.plant)}</span>
                                <Icon name="arrow" size={13} />
                                <span>{t.tujuan}</span>
                              </span>
                            </span>
                            <span className={hm.taskMeta}>
                              <span className={`${hm.status} ${st.c}`}>{st.l}</span>
                              <small>{t.kendaraan ?? "-"}{at ? ` · ${fmtClock(at)}` : ""}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                <button type="button" className={hm.cardLink} onClick={() => setActiveTab("tasks")}>Buka Penugasan<Icon name="arrow" size={14} /></button>
              </section>

              {!prbOnly && (
                <section className={`${hm.card} ${hm.aGate}`}>
                  <div className={hm.cardHead}>
                    <div>
                      <h2>Aktivitas gate</h2>
                      <span className={hm.sub}>{gateAgo === null ? "Memuat…" : gateAgo < 5 ? "Diperbarui baru saja" : `Diperbarui ${gateAgo} dtk lalu`}</span>
                    </div>
                    <span className={hm.livePill}><i className={hm.liveDot} />Live</span>
                  </div>
                  <div className={hm.feed}>
                    {gateLogs.length === 0 && <div className={hm.empty}>Belum ada pergerakan gate hari ini.</div>}
                    {gateLogs.slice(0, 6).map((g) => {
                      const out = g.status === "OUT";
                      const tag = out ? "Keluar" : g.status === "IN" ? "Masuk" : "Selesai";
                      return (
                        <div key={g.id} className={hm.feedRow}>
                          <span className={`${hm.av} ${g.plant === "PRB" ? hm.avPrb : ""}`}>{initialsOf(g.driverName)}</span>
                          <span className={hm.feedText}>
                            <b>{g.driverName}</b>
                            <span>{g.nopol} · {g.plant}{g.tujuan ? ` → ${g.tujuan}` : ""}</span>
                            {g.keterangan ? <em>{g.keterangan}</em> : null}
                          </span>
                          <span className={`${hm.tag} ${out ? hm.tagOut : g.status === "IN" ? hm.tagIn : hm.tagDone}`}>{tag}<small>{fmtClock(out ? g.timeOut : g.timeIn ?? g.timeOut)}</small></span>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className={hm.cardLink} onClick={() => setActiveTab("vehicles")}>Buka Gate Log<Icon name="arrow" size={14} /></button>
                </section>
              )}

              <section className={`${hm.card} ${hm.aFleet}`}>
                <div className={hm.cardHead}><h2>Armada</h2><span className={hm.sub}>{vehiclesTotal} unit aktif</span></div>
                <div className={hm.donutWrap}>
                  <svg viewBox="0 0 120 120" width="112" height="112" role="img" aria-label={`${readyPct}% armada siap pakai`}>
                    <circle cx="60" cy="60" r={donutR} className={hm.donutBg} />
                    {vehiclesOut > 0 && <circle cx="60" cy="60" r={donutR} className={hm.donutOut} strokeDasharray={`${Math.max(0, outLen - 4)} ${donutC - outLen + 4}`} transform="rotate(-90 60 60)" />}
                    {vehiclesFree > 0 && <circle cx="60" cy="60" r={donutR} className={hm.donutFree} strokeDasharray={`${Math.max(0, freeLen - 4)} ${donutC - freeLen + 4}`} strokeDashoffset={-outLen} transform="rotate(-90 60 60)" />}
                    <text x="60" y="58" textAnchor="middle" className={hm.donutVal}>{readyPct}%</text>
                    <text x="60" y="74" textAnchor="middle" className={hm.donutSub}>siap pakai</text>
                  </svg>
                  <div className={hm.donutLegend}>
                    <span><i className={hm.dOut} />Bertugas<b>{vehiclesOut}</b></span>
                    <span><i className={hm.dFree} />Tersedia<b>{vehiclesFree}</b></span>
                  </div>
                </div>
                {!prbOnly && (
                  <div className={hm.plants}>
                    {(["CIK", "PRB"] as const).map((pl) => {
                      const all = todayTasks.filter((t) => t.plant === pl).length;
                      const going = ongoingToday.filter((t) => t.plant === pl).length;
                      return (
                        <div key={pl} className={hm.plantChip}>
                          <span className={hm.plantName}><i className={pl === "PRB" ? hm.bPrb : hm.bCik} />{pl === "CIK" ? "Cikarang" : "Pasar Rebo"}</span>
                          <b>{all}<small> tugas</small></b>
                          <span className={hm.sub}>{going} berjalan</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className={`${hm.card} ${hm.aAttn}`}>
                <div className={hm.cardHead}><h2>Perlu perhatian</h2><span className={`${hm.count} ${lateOngoing.length ? hm.countWarn : ""}`}>{lateOngoing.length}</span></div>
                <div className={hm.feed}>
                  {lateOngoing.length === 0 && (
                    <div className={hm.allGood}><span><Icon name="check" size={18} /></span>Tidak ada yang perlu dicek saat ini.</div>
                  )}
                  {lateOngoing.slice(0, 4).map((t) => (
                    <div className={hm.feedRow} key={t.id}>
                      <span className={`${hm.av} ${hm.avWarn}`}><Icon name="clock" size={16} /></span>
                      <span className={hm.feedText}>
                        <b>{t.driver_nama ?? "-"}</b>
                        <span>{t.tujuan}</span>
                      </span>
                      <span className={`${hm.tag} ${hm.tagOut}`}>{Math.round((nowTick - new Date(t.accepted_at ?? t.created_at).getTime()) / 3600000)} jam</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            </div>
          </>
        )}
      </div>

      {/* ── Kolom kanan ── */}
      {!prbOnly && <div className={styles.homeSide}>
        <CalendarAgenda variant="mini" myProfile={myProfile} onOpenTasks={openTasksOn} onOpenCalendar={() => setActiveTab("calendar")} />
        <AnnouncementWidget announcements={announcements} onAdd={handleAddAnnouncement} canManage={myProfile?.role === "admin"} />
      </div>}
    </div>
  );
}

export function OverviewTab({ setActiveTab, myProfile }: { setActiveTab: (t: DashboardTab) => void; myProfile: MyProfile | null }) {
  const { lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [kantongCik, setKantongCik] = useState<Kantong | null>(null);
  const [kantongPrb, setKantongPrb] = useState<Kantong | null>(null);
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [gasStations, setGasStations] = useState<GasStation[]>([]);
  const [tasksLast30d, setTasksLast30d] = useState<TaskDetail[]>([]);
  const [canteenThisMonth, setCanteenThisMonth] = useState<CanteenReport[]>([]);
  const [lockerEntries, setLockerEntries] = useState<{ number: string; pin: string; status: string }[]>([]);
  const [clockNow, setClockNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const from30d = new Date(now);
      from30d.setDate(from30d.getDate() - 29);
      try {
        const [v, c, ot, d, kCik, kPrb, t, g, tt, canteen, lockers] = await Promise.all([
          getAllVehiclesFull(),
          getClaims(myProfile?.plantScope ?? null),
          getOvertimes(myProfile?.plantScope ?? null),
          getDrivers(myProfile?.plantScope ?? null),
          getCurrentKantong("CIK"),
          getCurrentKantong("PRB"),
          getDriverTiers(),
          getGasStations(),
          getTasksByRange(toLocalISODate(from30d), todayStr(), myProfile?.plantScope ?? null),
          getCanteenReportsForMonth(monthStr).catch(() => []),
          getLockerStatusGrid().catch(() => []),
        ]);
        setVehicles(v);
        setClaims(c);
        setOvertimes(ot);
        setDrivers(d);
        setKantongCik(kCik);
        setKantongPrb(kPrb);
        setTiers(t);
        setGasStations(g);
        setTasksLast30d(tt);
        setCanteenThisMonth(canteen);
        setLockerEntries(lockers);
      } catch {
        // best-effort overview — individual tabs already surface their own errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Computed BEFORE the loading-gate (hooks must be called unconditionally)
  // so the hero KPI numbers can animate with a count-up effect on load.
  const docBucketsPre = { urgent: 0, mid: 0, safe: 0, noData: 0 };
  vehicles.forEach((v) => {
    const docNextDates: (string | null)[] = [
      nextDocDate("KIR",     v.kir_date).next,
      nextDocDate("Service", v.service_date).nextEarly ?? nextDocDate("Service", v.service_date).next,
      nextDocDate("STNK",    v.stnk_date).next,
    ];
    docNextDates.forEach((d) => {
      if (!d) {
        docBucketsPre.noData++;
        return;
      }
      const days = daysUntil(d);
      if (days <= 7) docBucketsPre.urgent++;
      else if (days <= 30) docBucketsPre.mid++;
      else docBucketsPre.safe++;
    });
  });
  const urgentDocsPre = docBucketsPre.urgent + docBucketsPre.mid;
  const availableDriversPre = drivers.filter((d) => d.aktif).length;

  const nowPre = new Date();
  const thisMonthTotalPre = claims
    .filter((c) => { const d = new Date(c.periodDate); return d.getMonth() === nowPre.getMonth() && d.getFullYear() === nowPre.getFullYear(); })
    .reduce((s, c) => s + c.total, 0);
  const periodNowPre = `${nowPre.getFullYear()}-${String(nowPre.getMonth() + 1).padStart(2, "0")}`;
  const otThisMonthPre = overtimes.filter((o) => o.period === periodNowPre);
  const otHoursPre = otThisMonthPre.reduce((s, o) => s + o.hours, 0);
  const otAmountPre = otThisMonthPre.reduce((s, o) => s + o.amount, 0);

  const animatedVehicleCount = useCountUp(vehicles.length);
  const animatedAvailableDrivers = useCountUp(availableDriversPre);
  const animatedUrgentDocs = useCountUp(urgentDocsPre);
  const animatedThisMonthTotal = useCountUp(thisMonthTotalPre);
  const animatedOtHours = useCountUp(otHoursPre);
  const animatedOtAmount = useCountUp(otAmountPre);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "var(--t3)" }}>{lang === "en" ? "Loading overview..." : "Memuat ringkasan..."}</div>;

  // ── Data untuk tampilan Ringkasan baru (OverviewUI) ──
  const ovDocs: OverviewData["docs"] = [];
  vehicles.filter((v) => v.aktif).forEach((v) => {
    const svc = nextDocDate("Service", v.service_date);
    const items: [string, string | null][] = [
      ["KIR", nextDocDate("KIR", v.kir_date).next],
      ["STNK", nextDocDate("STNK", v.stnk_date).next],
      ["Service", svc.nextEarly ?? svc.next],
    ];
    items.forEach(([doc, date]) => {
      if (date) ovDocs.push({ id: `${v.id}-${doc}`, nopol: v.nopol, plant: v.plant ?? "CIK", doc, date, days: daysUntil(date) });
    });
  });
  const sum3 = (a: number[] | undefined) => (a ?? []).slice(0, 3).reduce((s, n) => s + (Number(n) || 0), 0);
  const snackOrder = canteenThisMonth.reduce((s, r) => s + sum3(r.snackOrder), 0);
  const snackLeft = canteenThisMonth.reduce((s, r) => s + sum3(r.snackLeftover), 0);
  const mealOrder = canteenThisMonth.reduce((s, r) => s + sum3(r.mealOrder), 0);
  const mealLeft = canteenThisMonth.reduce((s, r) => s + sum3(r.mealLeftover), 0);
  const ovData: OverviewData = {
    tasks: tasksLast30d,
    claims,
    vehicles,
    drivers,
    funds: [kantongCik, kantongPrb].filter((k): k is Kantong => !!k).map((k) => ({ plant: k.plant, cash: k.cashAvailable, budget: k.totalBudget })),
    docs: ovDocs,
    tiers,
    canteen: { snackOrder, snackUsed: Math.max(0, snackOrder - snackLeft), mealOrder, mealUsed: Math.max(0, mealOrder - mealLeft) },
    locker: { total: lockerEntries.length, used: lockerEntries.filter((e) => e.status === "Terisi").length },
    gas: { stations: gasStations.length, fuelTypes: new Set(gasStations.flatMap((s) => s.fuels.filter((f) => f.available).map((f) => f.type))).size },
  };

  return (
    <div style={{ padding: 20 }}>
      <OverviewBoard
        data={ovData}
        lockedPlant={myProfile?.plantScope ?? null}
        userName={myProfile?.fullName ?? ""}
        onGo={(tab) => setActiveTab(tab as DashboardTab)}
      />
    </div>
  );
}
