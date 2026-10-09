"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import styles from "./dashboard.module.css";
import cs from "./claims.module.css";
import { TaskBoardBar, TaskCard, TaskEmpty, TaskSlipModal, TaskForm, TaskSuccess, sortTasks } from "./TasksUI";
import type { TaskFormValues } from "./TasksUI";
import tk from "./tasks.module.css";
import { GateLogPanel } from "./GateUI";
import { OverviewBoard, type OverviewData } from "./OverviewUI";
import hm from "./home.module.css";
import { ClaimsHero, ClaimCard, WeekHeader, ViewSwitch, PeriodSwitch, RecapBar, ClaimForm, WreathCard, CLAIM_CATS, catLabel } from "./ClaimsUI";
import { ModalPortal } from "@/components/ModalPortal";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";
import { ReportExportButtons, LanguagePickerModal, useExportLanguagePicker, ReportRangePicker, defaultReportRange } from "@/components/ReportControls";
import type { ExportFormat } from "@/components/ReportControls";
import { exportGenericCsv, exportGenericExcel, exportGenericPdf, exportSummaryCsv, exportSummaryExcel, exportSummaryPdf } from "@/lib/reportEngine";
import type { ReportColumn, ReportRangeState, ReportLang, SummaryKpi, SummaryBreakdown } from "@/lib/reportEngine";
import { reportRangeToDates, reportRangeLabel } from "@/lib/reportEngine";
import type { DriverReportSummary } from "@/lib/analytics";
import {
  getMyProfile,
  canAccessTab,
  isPrbOnly,
  getActivityLog,
  type ActivityLogEntry,
  cancelTaskByAdmin,
  createTask,
  createTaskBatch,
  sendTaskBatchEmail,
  sendPushToDriver,
 deleteTask,
  deleteTaskBatch,
  getDrivers,
  type MyProfile,
  getAllDriversFull,
  addDriver,
  updateDriver,
  deleteDriver,
  sendDriverCredentials,
  type DriverInput,
  getAllEmployeesFull,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  type EmployeeInput,
  getAllJobTypesFull,
  addJobType,
  updateJobType,
  deleteJobType,
  getEmployees,
  getJobTypes,
  getCanteenReportsForMonth,
  getAllCanteenReports,
  saveCanteenReport,
  deleteCanteenReport,
  getGiftEvents,
  createGiftEvent,
  updateGiftEvent,
  updateGiftEventActualCounts,
  updateGiftEventStockPerSize,
  deleteGiftEvent,
  bulkImportGiftRegistrations,
  upsertGiftRegistrations,
  unclaimGiftRegistration,
  claimGift,
  getGiftRegistrations,
  getTasksByDate,
  getTasksByRange,
  getVehicles,
  subscribeToTasks,
  updateTaskStatus,
  getAllVehiclesFull,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  getClaims,
  addClaim,
  deleteClaim,
  getWreaths,
  addWreath,
  setWreathClaimed,
  deleteWreath,
  getVehicleGateLogs,
  withOrigins,
  deleteGateLog,
  forceCloseGateLog,
  getPrinters,
  addPrinter,
  updatePrinter,
  deletePrinter,
  getPrinterRequests,
  addPrinterRequest,
  deletePrinterRequest,
  getEmployeeRequests,
  updateEmployeeRequestStatus,
  deleteEmployeeRequest,
  getAtkItems,
  getAtkRequests,
  getAtkRestocks,
  getAgendaEvents,
  addAgendaEvent,
  deleteAgendaEvent,
  getAnnouncements,
  addAnnouncement,
  sendClaimNotificationEmails,
  getAppSetting,
  setAppSetting,
  getOvertimes,
  addOvertime,
  deleteOvertime,
  getCurrentKantong,
  getKantongHistory,
  updateKantongBudget,
  resetKantong,
  createKantong,
  getDriverTiers,
  addDriverTier,
  updateDriverTier,
  deleteDriverTier,
  setDriverTier,
  getGasStations,
  addGasStation,
  updateGasStation,
  deleteGasStation,
} from "@/lib/api";
import type { Claim, ClaimItem, Overtime, Plant, Kantong, DriverTier, GasStation, FuelEntry, CanteenReport, GiftEvent, GiftItemDef, GiftRegistration, GiftSelection, Wreath, VehicleGateLog, Printer, PrinterRequest, PrinterRequestType, EmployeeRequest, EmployeeRequestType, EmployeeRequestStatus, AtkItem, AtkRequest, AtkRestock, AgendaEvent, Announcement } from "@/lib/types";
import { computeCanteenKPI } from "@/lib/types";
import type { DriverType } from "@/lib/types";
import { getUserDutyStatus, isUserDriver, useNowTick, dutyHoursLabel } from "@/lib/duty";
import { exportTandaTerima } from "@/lib/tandaTerima";
import { buildRincianRows } from "@/lib/claimRecap";
import { exportWeeklyRecapToExcel, exportWeeklyRecapToPdf } from "@/lib/weeklyRecapExport";
import {
  buildFleetReportData,
  buildInsights,
  exportFleetReportToCsv,
  exportFleetReportToPdf,
  periodLabel,
  getPeriodDateRange,
  getPreviousPeriod,
  type ReportPeriod,
  type FleetReportData,
} from "@/lib/fleetReport";


// Leaflet touches `window` directly, so it must never be server-rendered.
const GasStationMap = dynamic(() => import("./GasStationMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, borderRadius: "var(--r2)", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>
      Memuat peta...
    </div>
  ),
});
import { exportTasksToCsv, exportTasksToPdf, exportWreathsToCsv, exportGateLogsToCsv, exportPrinterRequestsToCsv, statusLabelId, formatDateTime } from "@/lib/report";
import { computeReportAnalytics, formatMinutes } from "@/lib/analytics";
import type {
  Driver,
  Employee,
  JobType,
  TaskDetail,
  TaskStatus,
  Vehicle,
} from "@/lib/types";
import { computeStats, plantLocation } from "@/lib/types";
import { useLang, useTheme } from "@/lib/providers";
import LockerTab from "./LockerTab";
import { getLockerStatusGrid } from "@/lib/lockerApi";
import CanteenTab from "./CanteenTab";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { toLocalISODate } from "@/lib/dateUtils";
import Icon from "@/components/Icon";

function todayStr() {
  return toLocalISODate(new Date());
}

/** Merged dashboard tabs — "tasks" is the original driver-assignment
 *  feature; the rest are FleetOS features ported into this same app. */
export type DashboardTab =
  | "home"
  | "overview"
  | "tasks"
  | "vehicles"
  | "claims"
  | "overtime"
  | "driverbudget"
  | "opfund"
  | "gasstations"
  | "reports"
  | "masterdata"
  | "canteen"
  | "locker"
  | "gift"
  | "printer"
  | "employeerequests"
  | "atk"
  | "activitylog";

interface NavTab { id: DashboardTab; icon: string; labelId: string; labelEn: string; descId?: string; descEn?: string }
interface NavGroup { id: string; icon: string; labelId: string; labelEn: string; tabs: NavTab[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: "fleet",
    icon: "🚚",
    labelId: "Fleet & Kendaraan",
    labelEn: "Fleet & Vehicles",
    tabs: [
      { id: "tasks", icon: "🗂️", labelId: "Penugasan", labelEn: "Tasks", descId: "Kelola penugasan kendaraan & driver", descEn: "Manage vehicle & driver tasks" },
      { id: "vehicles", icon: "🚗", labelId: "Armada", labelEn: "Vehicles", descId: "Data kendaraan & kelengkapannya", descEn: "Vehicle data & documents" },
      { id: "gasstations", icon: "⛽", labelId: "Pom Bensin", labelEn: "Gas Stations", descId: "Mapping & transaksi bahan bakar", descEn: "Fuel mapping & transactions" },
    ],
  },
  {
    id: "finance",
    icon: "💵",
    labelId: "Finance",
    labelEn: "Finance",
    tabs: [
      { id: "claims", icon: "🧾", labelId: "Klaim", labelEn: "Claims", descId: "Pengajuan & monitoring klaim", descEn: "Claim submission & monitoring" },
      { id: "driverbudget", icon: "💳", labelId: "Budget Driver", labelEn: "Driver Budget", descId: "Budget rutin & penggunaan", descEn: "Routine budget & usage" },
      { id: "opfund", icon: "💰", labelId: "Dana Operasional", labelEn: "Operational Fund", descId: "Pengajuan dana operasional", descEn: "Operational fund requests" },
    ],
  },
  {
    id: "facility",
    icon: "🏢",
    labelId: "Fasilitas",
    labelEn: "Facility",
    tabs: [
      { id: "canteen", icon: "🍱", labelId: "Kantin", labelEn: "Canteen", descId: "Manajemen kantin perusahaan", descEn: "Company canteen management" },
      { id: "locker", icon: "🔐", labelId: "Locker", labelEn: "Locker", descId: "Pemesanan & pengelolaan locker", descEn: "Locker booking & management" },
      { id: "gift", icon: "🎁", labelId: "Pembagian", labelEn: "Gift Dist.", descId: "Distribusi barang & perlengkapan", descEn: "Item & supply distribution" },
      { id: "printer", icon: "🖨️", labelId: "Printer", labelEn: "Printer", descId: "Manajemen printer & permintaan", descEn: "Printer management & requests" },
      { id: "employeerequests", icon: "📨", labelId: "Permintaan Karyawan", labelEn: "Employee Requests", descId: "Pengajuan permintaan dari karyawan", descEn: "Employee-submitted requests" },
      { id: "atk", icon: "✏️", labelId: "ATK", labelEn: "Office Supplies", descId: "Pengajuan ATK & perlengkapan", descEn: "Office supplies requests" },
    ],
  },
  {
    id: "system",
    icon: "⚙️",
    labelId: "Sistem",
    labelEn: "System",
    tabs: [
      { id: "reports", icon: "📈", labelId: "Report", labelEn: "Reports", descId: "Laporan & analisis data", descEn: "Reports & data analysis" },
      { id: "masterdata", icon: "🗄️", labelId: "Master Data", labelEn: "Master Data", descId: "Kelola master data sistem", descEn: "Manage system master data" },
      { id: "activitylog", icon: "📋", labelId: "Log Aktivitas", labelEn: "Activity Log", descId: "Riwayat aktivitas sistem", descEn: "System activity history" },
    ],
  },
];

/** Hook sederhana untuk deteksi viewport mobile vs desktop, dipakai untuk
 *  memilih presentasi yang berbeda (tabel di PC, kartu di HP) dari data yang sama. */
function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < breakpoint);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}

/** Animates a number counting up from 0 to `target` over ~900ms using an
 *  eased curve — used for hero KPI values so the dashboard feels alive on
 *  load instead of numbers just appearing statically. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export default function DashboardPage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { session, user, loading: authLoading, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
     if (user?.id) {
      setProfileChecked(false);
      getMyProfile(user.id).then((p) => {
        setMyProfile(p);
        setProfileChecked(true);
        if (p?.allowedTabs && p.allowedTabs.length > 0 && !p.allowedTabs.includes("overview")) {
          setActiveTab(p.allowedTabs[0] as DashboardTab);
        }
      });
    }
   }, [user?.id]);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTabState] = useState<DashboardTab>("home");
  // Riwayat tab → dipakai tombol "Kembali" di setiap modul.
  const [tabHistory, setTabHistory] = useState<DashboardTab[]>([]);
  const activeTabRef = useRef<DashboardTab>("home");
  const setActiveTab = useCallback((next: DashboardTab) => {
    const cur = activeTabRef.current;
    if (next === cur) return;
    setTabHistory((h) => (next === "home" ? [] : [...h.slice(-19), cur]));
    activeTabRef.current = next;
    setActiveTabState(next);
  }, []);
  const goBackTab = useCallback(() => {
    const prev = tabHistory[tabHistory.length - 1] ?? "home";
    setTabHistory((h) => h.slice(0, -1));
    activeTabRef.current = prev;
    setActiveTabState(prev);
    if (prev === "home") setActiveHomeGroup(undefined);
  }, [tabHistory]);
  const [activeHomeGroup, setActiveHomeGroup] = useState<string | undefined>(undefined);
  // Akun scope PRB hanya boleh Penugasan, Armada, Master Data — kembalikan ke Home bila tab lain terbuka.
  useEffect(() => {
    if (activeTab !== "home" && myProfile && !canAccessTab(myProfile, activeTab)) setActiveTab("home");
  }, [activeTab, myProfile, setActiveTab]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
const [masterDataInitialSub, setMasterDataInitialSub] = useState<"drivers" | "employees" | "jobtypes">("drivers");

  const [dateFilter, setDateFilter] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null);
  const [slipTasks, setSlipTasks] = useState<TaskDetail[] | null>(null);
  const [search, setSearch] = useState("");

  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const menuSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    const results: { tab: DashboardTab; label: string; icon: string; group: string }[] = [];
    for (const group of NAV_GROUPS) {
      for (const tabItem of group.tabs) {
        const label = lang === "en" ? tabItem.labelEn : tabItem.labelId;
        if (canAccessTab(myProfile, tabItem.id) && label.toLowerCase().includes(q)) {
          results.push({ tab: tabItem.id, label, icon: tabItem.icon, group: lang === "en" ? group.labelEn : group.labelId });
        }
      }
    }
    return results.slice(0, 6);
  }, [globalSearch, lang, myProfile]);

  const dataSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: { kind: "driver" | "vehicle" | "employee"; id: string; label: string; sub: string }[] = [];
    for (const d of drivers) {
      if (d.nama.toLowerCase().includes(q)) results.push({ kind: "driver", id: d.id, label: d.nama, sub: d.no_hp || "Driver" });
      if (results.length >= 4) break;
    }
    for (const v of vehicles) {
      if (v.nopol.toLowerCase().includes(q) || (v.jenis ?? "").toLowerCase().includes(q)) results.push({ kind: "vehicle", id: v.id, label: v.nopol, sub: v.jenis || "Kendaraan" });
      if (results.filter((r) => r.kind === "vehicle").length >= 4) break;
    }
    for (const e of employees) {
      if (e.nama.toLowerCase().includes(q)) results.push({ kind: "employee", id: e.id, label: e.nama, sub: e.departement || "Karyawan" });
      if (results.filter((r) => r.kind === "employee").length >= 3) break;
    }
    return results.slice(0, 8);
  }, [globalSearch, drivers, vehicles, employees]);

  function goToSearchResult(kind: "driver" | "vehicle" | "employee") {
    if (kind === "driver") { setMasterDataInitialSub("drivers"); setActiveTab("masterdata"); }
    else if (kind === "employee") { setMasterDataInitialSub("employees"); setActiveTab("masterdata"); }
    else { setActiveTab("vehicles"); }
    setGlobalSearch("");
    setShowSearchDropdown(false);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowSearchDropdown(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const [jobTypes, setJobTypes] = useState<JobType[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TaskDetail | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(
    null
  );

  function showToast(msg: string, isError = false) {
    setToast({ msg, error: isError });
    setTimeout(() => setToast(null), 2500);
  }

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasksByDate(dateFilter, myProfile?.plantScope ?? null);
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data tugas");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, myProfile?.plantScope]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToTasks(() => {
      loadTasks();
    }, setLiveConnected);
    return unsubscribe;
  }, [loadTasks]);

  // load master data once (for the create-task form)
  useEffect(() => {
    (async () => {
      try {
        const [d, v, e, j] = await Promise.all([
          getDrivers(myProfile?.plantScope ?? null),
          getVehicles(myProfile?.plantScope ?? null),
          getEmployees(),
          getJobTypes(),
        ]);
        setDrivers(d);
        setVehicles(v);
        setEmployees(e);
        setJobTypes(j);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Gagal memuat master data",
          true
        );
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile?.plantScope]);

  const stats = useMemo(() => computeStats(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.tujuan?.toLowerCase().includes(q) ||
          t.driver_nama?.toLowerCase().includes(q) ||
          t.requestor?.toLowerCase().includes(q) ||
          t.kendaraan?.toLowerCase().includes(q) ||
          t.jenis_pekerjaan?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tasks, statusFilter, search]);

  async function handleStatusChange(task: TaskDetail, status: TaskStatus) {
    try {
      await updateTaskStatus(task.id, status);
      showToast(`Status diubah ke ${status}`);
      loadTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal mengubah status", true);
    }
  }

  async function handleDelete(task: TaskDetail) {
    const isBatch = !!task.batch_id && task.batch_total_days > 1;

    if (isBatch) {
      const deleteAll = confirm(
        `Tugas ini bagian dari penugasan rentang tanggal (${task.batch_total_days} hari total).\n\nKlik OK untuk HAPUS SELURUH ${task.batch_total_days} hari sekaligus, atau Cancel untuk pilihan lain.`
      );
      if (deleteAll) {
        try {
          const count = await deleteTaskBatch(task.batch_id!);
          showToast(`${count} tugas (seluruh penugasan) dihapus`);
          loadTasks();
        } catch (e) {
          showToast(e instanceof Error ? e.message : "Gagal menghapus seluruh penugasan", true);
        }
        return;
      }
      const deleteOne = confirm(`Hapus tugas hari ini saja ("${task.tujuan}")?`);
      if (!deleteOne) return;
    } else {
      if (!confirm(`Hapus tugas ke "${task.tujuan}"?`)) return;
    }

    try {
      await deleteTask(task.id);
      showToast("Tugas dihapus");
      loadTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menghapus tugas", true);
    }
  }

  function openCancelConfirm(task: TaskDetail) {
    setCancelTarget(task);
  }

  async function handleCancelConfirmed() {
    if (!cancelTarget) return;
    const task = cancelTarget;
    setCancelTarget(null);
    try {
      await cancelTaskByAdmin(task.id);
      showToast("Tugas dibatalkan");
      loadTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal membatalkan tugas", true);
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--t3)" }}>
        {t.actionLoading}
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  // ── Gerbang akses staf (fail-closed) ──
  // Punya sesi login ≠ punya akses dashboard. Akun harus punya baris di
  // `profiles` (dibuat untuk staf/GA). Akun driver — yang sengaja tidak
  // diberi profil oleh migrasi 008 — mentok di sini, tidak bisa melihat
  // data admin walau berhasil login.
  if (!profileChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--t3)" }}>
        {t.actionLoading}
      </div>
    );
  }
  if (!myProfile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "var(--bg)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>
          {lang === "en" ? "No dashboard access" : "Tidak punya akses dashboard"}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--t3)", maxWidth: 380, lineHeight: 1.6 }}>
          {lang === "en"
            ? "This account isn't registered as admin/GA staff. If you're a driver, use the driver app instead. If you believe this is a mistake, contact the master admin."
            : "Akun ini tidak terdaftar sebagai staf admin/GA. Kalau kamu driver, silakan pakai aplikasi driver. Kalau menurutmu ini keliru, hubungi master admin."}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <a href="/driver" style={{ padding: "11px 20px", borderRadius: 12, background: "var(--brand)", color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>
            {lang === "en" ? "Open driver app" : "Buka aplikasi driver"}
          </a>
          <button onClick={() => signOut()} style={{ padding: "11px 20px", borderRadius: 12, background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--t2)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            {lang === "en" ? "Sign out" : "Keluar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", gap: isMobile ? 0 : 18, padding: isMobile ? 0 : 16, alignItems: "flex-start" }}>
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,13,24,0.6)", zIndex: 299 }}
        />
      )}

      {/* ── Sidebar (floating, berlabel) ── */}
      <aside
        className="premiumChrome"
        style={{
          width: 256,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          position: isMobile ? "fixed" : "sticky",
          top: isMobile ? 0 : 16,
          left: isMobile ? (sidebarOpen ? 0 : -290) : "auto",
          height: isMobile ? "100vh" : "calc(100vh - 32px)",
          borderRadius: isMobile ? "0 26px 26px 0" : 26,
          zIndex: 300,
          transition: "left 0.25s ease",
          padding: "18px 12px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "2px 8px 14px" }}>
          <img src="/logo.png" alt="CIKOPS" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)", letterSpacing: "-0.01em" }}>{t.appName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className={liveConnected ? styles.livePulseDot : undefined} style={liveConnected ? undefined : { width: 7, height: 7, borderRadius: "50%", background: "var(--t3)" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: liveConnected ? "var(--green-text)" : "var(--t3)", letterSpacing: "0.04em" }}>
                {liveConnected ? "LIVE" : (lang === "en" ? "Connecting…" : "Menyambungkan…")}
              </span>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "2px 2px 8px", minHeight: 0 }}>
          <button
            className={`navItem ${activeTab === "home" ? "navItemActive" : ""}`}
            onClick={() => { setActiveTab("home"); setActiveHomeGroup(undefined); setSidebarOpen(false); }}
          >
            <span><Icon name="home" /></span>
            Dashboard
          </button>
          {!isPrbOnly(myProfile) && <button
            className={`navItem ${activeTab === "overview" ? "navItemActive" : ""}`}
            onClick={() => { setActiveTab("overview"); setSidebarOpen(false); }}
          >
            <span><Icon name="overview" /></span>
            {lang === "id" ? "Ringkasan" : "Overview"}
          </button>}
          {NAV_GROUPS.map((group) => {
            const visibleTabs = group.tabs.filter((tabItem) => canAccessTab(myProfile, tabItem.id));
            if (visibleTabs.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="navSectionLabel">{lang === "id" ? group.labelId : group.labelEn}</div>
                {visibleTabs.map((tabItem) => (
                  <button
                    key={tabItem.id}
                    className={`navItem ${activeTab === tabItem.id ? "navItemActive" : ""}`}
                    onClick={() => { setActiveTab(tabItem.id); setSidebarOpen(false); }}
                  >
                    <span><Icon name={tabItem.id} /></span>
                    {lang === "id" ? tabItem.labelId : tabItem.labelEn}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {!isPrbOnly(myProfile) && <a
          href="/dashboard-viewonly"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.tvLink}
          title={lang === "en" ? "Open Dashboard-ViewOnly in a new tab (no login needed)" : "Buka Dashboard-ViewOnly di tab baru (tanpa login)"}
        >
          <span className={styles.tvLinkIc}><Icon name="eye" size={18} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>Dashboard-ViewOnly</b>
            <small>{lang === "en" ? "No login · view only" : "Tanpa login · lihat saja"}</small>
          </span>
          <Icon name="external" size={15} />
        </a>}

        <div style={{ marginTop: 8, padding: 10, borderRadius: 16, background: "var(--surface2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--grad-brand)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
            {(myProfile?.fullName || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {myProfile?.fullName || user?.email?.split("@")[0] || "-"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{myProfile?.role === "admin" ? "Admin" : "GA Manager"}</div>
          </div>
          <button
            onClick={() => signOut()}
            title={t.actionSignOut}
            aria-label={t.actionSignOut}
            style={{ width: 34, height: 34, borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--red)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main content wrapper ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Topbar */}
        <div className="premiumChrome" style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "10px 14px" : "10px 16px", borderRadius: isMobile ? 0 : 20, marginBottom: isMobile ? 0 : 18, position: "sticky", top: isMobile ? 0 : 16, zIndex: 100 }}>
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)} aria-label="Menu" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t1)", display: "grid", placeItems: "center" }}>
              <Icon name="menu" size={22} />
            </button>
          )}
          {!isMobile && (
            <div ref={searchBoxRef} style={{ flex: 1, position: "relative", maxWidth: 400 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", display: "grid", placeItems: "center" }}><Icon name="search" size={16} /></span>
              <input
                placeholder={lang === "en" ? "Search menu, data, or module..." : "Cari menu, data, atau modul..."}
                className={styles.formInput}
                style={{ borderRadius: 14, paddingLeft: 40 }}
                value={globalSearch}
                onChange={(e) => { setGlobalSearch(e.target.value); setShowSearchDropdown(true); }}
                onFocus={() => setShowSearchDropdown(true)}
              />
              {showSearchDropdown && globalSearch.trim() !== "" && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-lg)", maxHeight: 360, overflowY: "auto", zIndex: 200,
                  } as CSSProperties}
                >
                  {menuSearchResults.length === 0 && dataSearchResults.length === 0 ? (
                    <div style={{ padding: 18, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
                      {lang === "en" ? "No results found." : "Tidak ada hasil ditemukan."}
                    </div>
                  ) : (
                    <>
                      {menuSearchResults.length > 0 && (
                        <div style={{ padding: "10px 8px 4px" }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--t3)", letterSpacing: "0.06em", padding: "0 10px 6px" }}>
                            {lang === "en" ? "MENU" : "MENU"}
                          </div>
                          {menuSearchResults.map((r) => (
                            <div
                              key={r.tab}
                              onClick={() => { setActiveTab(r.tab); setGlobalSearch(""); setShowSearchDropdown(false); }}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, cursor: "pointer" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg2)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <span style={{ fontSize: 15 }}>{r.icon}</span>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{r.label}</div>
                                <div style={{ fontSize: 11, color: "var(--t3)" }}>{r.group}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {dataSearchResults.length > 0 && (
                        <div style={{ padding: "4px 8px 10px", borderTop: menuSearchResults.length > 0 ? "1px solid var(--border)" : "none" }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--t3)", letterSpacing: "0.06em", padding: "8px 10px 6px" }}>
                            {lang === "en" ? "DATA" : "DATA"}
                          </div>
                          {dataSearchResults.map((r) => (
                            <div
                              key={`${r.kind}-${r.id}`}
                              onClick={() => goToSearchResult(r.kind)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, cursor: "pointer" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg2)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <span style={{ fontSize: 15 }}>{r.kind === "driver" ? "🧑‍✈️" : r.kind === "vehicle" ? "🚗" : "👤"}</span>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{r.label}</div>
                                <div style={{ fontSize: 11, color: "var(--t3)" }}>{r.sub}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1 }} />
          {!isMobile && (
            <div className={styles.liveBadge}>
              <span className={styles.liveDot} /> Live
            </div>
          )}
          {!isPrbOnly(myProfile) && <a
            className={styles.iconBtn}
            href="/dashboard-viewonly"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Dashboard-ViewOnly"
            title={lang === "en" ? "Open Dashboard-ViewOnly" : "Buka Dashboard-ViewOnly"}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Icon name="eye" size={18} />
          </a>}
          <button
            className={styles.iconBtn}
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            aria-label="Language"
            style={{ fontSize: 12, fontWeight: 700 }}
          >
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button className={styles.iconBtn} onClick={toggleTheme} aria-label="Theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <button className={styles.iconBtn} aria-label="Notifications" title={lang === "en" ? "Notifications" : "Notifikasi"}>
            <Icon name="bell" size={18} />
          </button>
          {activeTab === "tasks" && (
            <>
              {!isPrbOnly(myProfile) && <button
                className={styles.iconBtn}
                onClick={() => setReportModalOpen(true)}
                aria-label="Laporan & Analytics"
                title="Laporan & Analytics"
              >
                <Icon name="reports" size={18} />
              </button>}
              <button className={styles.btnPrimary} onClick={() => setModalOpen(true)}>
                {isMobile ? "+ Tugaskan" : "+ Tugaskan Driver"}
              </button>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, marginLeft: 2, borderLeft: "1px solid var(--border)" }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--brand), var(--brand2))",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}
            >
              {(myProfile?.fullName || user?.email || "?").charAt(0).toUpperCase()}
            </div>
            {!isMobile && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>
                  {myProfile?.fullName || user?.email?.split("@")[0] || "-"}
                </div>
                <div style={{ fontSize: 12, color: "var(--t3)" }}>
                  {myProfile?.role === "admin" ? "Admin" : "GA Manager"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: "auto" }}>
      {activeTab !== "home" && (() => {
        const labelOf = (id: DashboardTab) => {
          if (id === "home") return lang === "en" ? "Dashboard" : "Dashboard";
          if (id === "overview") return lang === "en" ? "Overview" : "Ringkasan";
          for (const g of NAV_GROUPS) {
            const f = g.tabs.find((x) => x.id === id);
            if (f) return lang === "en" ? f.labelEn : f.labelId;
          }
          return String(id);
        };
        const prev = tabHistory[tabHistory.length - 1];
        const showPrev = prev && prev !== "home";
        return (
          <nav className={styles.backBar} aria-label="Navigasi kembali">
            <button className={styles.backBtn} onClick={() => setActiveTab("home")} title={lang === "en" ? "Back to Home" : "Kembali ke Home"}>
              <Icon name="home" size={15} strokeWidth={2.2} />
              {lang === "en" ? "Back to Home" : "Kembali ke Home"}
            </button>
            {showPrev && (
              <button className={`${styles.backBtn} ${styles.backBtnGhost}`} onClick={goBackTab} title={labelOf(prev)}>
                <Icon name="back" size={15} strokeWidth={2.2} />
                {labelOf(prev)}
              </button>
            )}
            <span className={styles.backCrumb}>
              <span>Home</span><span aria-hidden="true">/</span><b>{labelOf(activeTab)}</b>
            </span>
          </nav>
        );
      })()}
      {activeTab === "tasks" && (
      <div key="tasks" className={`${styles.body} ${tk.page} tabContent`}>
        <TaskBoardBar
          date={dateFilter}
          today={todayStr()}
          onDate={setDateFilter}
          stats={stats}
          statusFilter={statusFilter}
          onStatus={setStatusFilter}
          search={search}
          onSearch={setSearch}
          printCount={filteredTasks.length}
          onPrintAll={() => setSlipTasks(sortTasks(filteredTasks))}
        />

        {error && <div className={styles.errBanner}>{error}</div>}

        {loading && tasks.length === 0 ? (
          <div className={tk.loading}><div className={tk.spin} /><span>Memuat data tugas…</span></div>
        ) : filteredTasks.length === 0 ? (
          <TaskEmpty
            filtered={tasks.length > 0}
            onNew={() => setModalOpen(true)}
            onClear={() => { setStatusFilter(null); setSearch(""); }}
          />
        ) : (
          <div className={tk.list}>
            {sortTasks(filteredTasks).map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onAdvance={handleStatusChange}
                onCancel={openCancelConfirm}
                onDelete={handleDelete}
                onPrint={(x) => setSlipTasks([x])}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {activeTab !== "tasks" && (
        <div key={activeTab} className="tabContent">
          <TabErrorBoundary label={activeTab}>
          {activeTab === "home" && <HomeTab setActiveTab={setActiveTab} myProfile={myProfile} activeGroupId={activeHomeGroup} setActiveGroupId={setActiveHomeGroup} />}
          {activeTab === "overview" && <OverviewTab setActiveTab={setActiveTab} myProfile={myProfile} />}
          {activeTab === "vehicles" && <VehiclesTab myProfile={myProfile} />}
          {activeTab === "claims" && <ClaimsTab myProfile={myProfile} />}
          {activeTab === "driverbudget" && <DriverBudgetTab myProfile={myProfile} />}
          {activeTab === "opfund" && <OpFundTab myProfile={myProfile} />}
          {activeTab === "gasstations" && <GasStationsTab />}
          {activeTab === "reports" && <ReportsTab myProfile={myProfile} />}
        {activeTab === "masterdata" && (
  <MasterDataTab
    initialSub={masterDataInitialSub}
    restrictedToDriversOnly={myProfile?.accessScope === "tasks_only"}
    myProfile={myProfile}
  />
)}
          {activeTab === "canteen" && <CanteenTab />}
          {activeTab === "locker" && <LockerTab />}
          {activeTab === "gift" && <GiftMasterPanel cardStyle={{ background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)" }} />}
          {activeTab === "printer" && <PrinterTab />}
          {activeTab === "employeerequests" && <EmployeeRequestsTab />}
          {activeTab === "atk" && <AtkTab />}
          {activeTab === "activitylog" && <ActivityLogTab />}
          </TabErrorBoundary>
        </div>
      )}
        </div>
      </div>

      {modalOpen && (
    <CreateTaskModal
       drivers={drivers}
      vehicles={vehicles}
      employees={employees}
      jobTypes={jobTypes}
     myProfile={myProfile}
     places={Array.from(new Set(tasks.flatMap((t) => [t.tujuan, t.lokasi_asal ?? ""]).map((x) => (x || "").trim()).filter(Boolean)))}
     onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            showToast("Tugas berhasil ditugaskan ✓");
            loadTasks();
          }}
          onError={(msg) => showToast(msg, true)}
        />
      )}

      {slipTasks && (
        <TaskSlipModal
          tasks={slipTasks}
          printedBy={myProfile?.fullName || user?.email?.split("@")[0] || ""}
          onClose={() => setSlipTasks(null)}
        />
      )}

      {reportModalOpen && (
        <ReportModal
          drivers={drivers}
          myProfile={myProfile}
          onClose={() => setReportModalOpen(false)}
          onError={(msg) => showToast(msg, true)}
          onSuccess={(msg) => showToast(msg)}
        />
      )}

      {cancelTarget && (
        <div
          className={`${styles.modalOverlay} modalOverlayAnim`}
          onClick={() => setCancelTarget(null)}
        >
          <div
            className={`${styles.confirmBox} modalPop`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalTitle}>Batalkan tugas ini?</div>
            <div className={styles.confirmSub}>
              {(cancelTarget.lokasi_asal || plantLocation(cancelTarget.plant))} → {cancelTarget.tujuan} · Driver:{" "}
              {cancelTarget.driver_nama || "-"}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancel}
                onClick={() => setCancelTarget(null)}
              >
                Tidak
              </button>
              <button
                className={styles.btnDangerConfirm}
                onClick={handleCancelConfirmed}
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.error ? styles.toastError : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/** Shimmering placeholder rows shown while a table/list is loading —
 *  replaces plain "Loading..." text everywhere in the dashboard so the
 *  screen doesn't feel frozen while data comes in. */
function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ padding: "16px 4px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px" }}>
          <div className={styles.skeletonBar} style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <div className={styles.skeletonBar} style={{ height: 12, width: `${58 - i * 6}%` }} />
            <div className={styles.skeletonBar} style={{ height: 10, width: `${34 - i * 3}%` }} />
          </div>
          <div className={styles.skeletonBar} style={{ height: 22, width: 64, borderRadius: "var(--pill)", flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   REPORT MODAL — pilih rentang tanggal, unduh CSV/PDF
════════════════════════════════════════════════ */

type QuickRange = "today" | "7d" | "14d" | "30d" | "3m" | "thisMonth";

function quickRangeToDates(range: QuickRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === "today") {
    // from = to
  } else if (range === "7d") {
    from.setDate(from.getDate() - 6);
  } else if (range === "14d") {
    from.setDate(from.getDate() - 13);
  } else if (range === "30d") {
    from.setDate(from.getDate() - 29);
  } else if (range === "3m") {
    from.setMonth(from.getMonth() - 3);
  } else if (range === "thisMonth") {
    from.setDate(1);
  }
  const fmt = (d: Date) => toLocalISODate(d);
  return { from: fmt(from), to: fmt(to) };
}

function ReportModal({
  drivers,
  myProfile,
  onClose,
  onError,
  onSuccess,
}: {
  drivers: Driver[];
  myProfile: MyProfile | null;
  onClose: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [range, setRange] = useState<ReportRangeState>(defaultReportRange());
  const { from: dateFrom, to: dateTo } = reportRangeToDates(range);
  const [reportTasks, setReportTasks] = useState<TaskDetail[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoadingPreview(true);
    try {
      const data = await getTasksByRange(dateFrom, dateTo, myProfile?.plantScope ?? null);
      setReportTasks(data); // ⚠️ sebelumnya data hasil fetch tidak pernah disimpan ke state — makanya preview & export selalu kosong
    } catch (e) {
      onError(e instanceof Error ? e.message : "Gagal memuat data laporan");
    } finally {
      setLoadingPreview(false);
    }
  }, [dateFrom, dateTo, onError, myProfile?.plantScope]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const analytics = useMemo(
    () => computeReportAnalytics(reportTasks, drivers),
    [reportTasks, drivers]
  );

  const driverNameMap = useMemo(() => new Map(drivers.map((d) => [d.id, d.nama])), [drivers]);

  const driverSummaryColumns: ReportColumn<DriverReportSummary>[] = [
    { key: "driver", labelId: "Driver", labelEn: "Driver", get: (d) => d.driverNama },
    { key: "total", labelId: "Total Tugas", labelEn: "Total Tasks", get: (d) => d.totalTask, align: "right" },
    { key: "selesai", labelId: "Selesai", labelEn: "Completed", get: (d) => d.selesai, align: "right" },
    { key: "dibatalkan", labelId: "Dibatalkan", labelEn: "Cancelled", get: (d) => d.dibatalkan, align: "right" },
    { key: "aktif", labelId: "Aktif", labelEn: "Active", get: (d) => d.aktif, align: "right" },
    { key: "rate", labelId: "Completion Rate", labelEn: "Completion Rate", get: (d) => `${d.completionRate.toFixed(0)}%`, align: "right" },
    { key: "avgDur", labelId: "Rata-rata Durasi", labelEn: "Avg Duration", get: (d) => (d.avgDurationMinutes != null ? formatMinutes(d.avgDurationMinutes) : "-") },
  ];

  const exportPicker = useExportLanguagePicker((format, exportLang) => {
    const periodLabel = reportRangeLabel(range, exportLang);
    const opts = {
      lang: exportLang,
      titleId: "Laporan Tugas Driver", titleEn: "Driver Task Report",
      periodLabel, filename: "Laporan_Tugas_Driver",
      kpis: [
        { labelId: "Total Tugas", labelEn: "Total Tasks", value: analytics.totalTask },
        { labelId: "Selesai", labelEn: "Completed", value: analytics.done },
        { labelId: "Dibatalkan", labelEn: "Cancelled", value: analytics.cancelled },
        { labelId: "Sedang Berjalan", labelEn: "Ongoing", value: analytics.assigned + analytics.ongoing },
        { labelId: "Completion Rate", labelEn: "Completion Rate", value: `${analytics.completionRate.toFixed(0)}%` },
        { labelId: "Driver Aktif", labelEn: "Active Drivers", value: analytics.driverAktif },
      ],
      breakdowns: [
        {
          titleId: "Top Driver (Jumlah Tugas)", titleEn: "Top Driver (Task Count)",
          valueLabelId: "Jumlah Tugas", valueLabelEn: "Task Count",
          items: analytics.topDriverByTask.map((e) => ({ label: e.label, value: e.value })),
        },
        {
          titleId: "Top Departemen Requestor", titleEn: "Top Requesting Department",
          valueLabelId: "Jumlah Tugas", valueLabelEn: "Task Count",
          items: analytics.topDepartementRequestor.map((e) => ({ label: e.label, value: e.value })),
        },
        {
          titleId: "Top Jenis Pekerjaan", titleEn: "Top Job Type",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: analytics.topJenisPekerjaan.map((e) => ({ label: e.label, value: e.value })),
        },
        {
          titleId: "Utilisasi Kendaraan", titleEn: "Vehicle Utilization",
          valueLabelId: "Jumlah Pemakaian", valueLabelEn: "Usage Count",
          items: analytics.utilisasiKendaraan.map((e) => ({ label: e.label, value: e.value })),
        },
      ],
      tableTitleId: "Rekap per Driver", tableTitleEn: "Per-Driver Recap",
      tableRows: analytics.driverSummaries, tableColumns: driverSummaryColumns,
    };
    if (format === "csv") exportSummaryCsv(opts);
    else if (format === "excel") exportSummaryExcel(opts);
    else exportSummaryPdf(opts);
    onSuccess(`Laporan ${format.toUpperCase()} berhasil diunduh`);
  });

  return (
    <div className={styles.reportOverlay}>
      <div className={styles.reportPanel}>
        <div className={styles.reportTopbar}>
          <div className={styles.reportTitleWrap}>
            <div className={styles.topbarEyebrow}>CIKOPS</div>
            <div className={styles.topbarTitle}>Laporan & Analytics</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            ✕ Tutup
          </button>
        </div>

        <div className={styles.reportBody}>
          <div className={styles.reportFilterRow}>
            <ReportRangePicker value={range} onChange={setRange} inputClassName={styles.toolbarDateInput} />
          </div>

          <div className={styles.reportActionRow}>
            <ReportExportButtons onExport={exportPicker.requestExport} disabled={loadingPreview || reportTasks.length === 0} />
          </div>
          {exportPicker.pending && <LanguagePickerModal format={exportPicker.pending} onConfirm={exportPicker.confirm} onClose={exportPicker.cancel} />}

          {loadingPreview ? (
            <div className={styles.tableWrap}>
              <div className={styles.tableLoading}>
                <div className={styles.spinner} />
                <div className={styles.loadingTxt}>Memuat data laporan...</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.statsRow}>
                <div className={`${styles.statCard} ${styles.statTotal}`}>
                  <div className={styles.statCardNum}>{analytics.totalTask}</div>
                  <div className={styles.statCardLabel}>Total Task</div>
                </div>
                <div className={`${styles.statCard} ${styles.statAssigned}`}>
                  <div className={styles.statCardNum}>{analytics.assigned}</div>
                  <div className={styles.statCardLabel}>Assigned</div>
                </div>
                <div className={`${styles.statCard} ${styles.statOngoing}`}>
                  <div className={styles.statCardNum}>{analytics.ongoing}</div>
                  <div className={styles.statCardLabel}>On Going</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDone}`}>
                  <div className={styles.statCardNum}>{analytics.done}</div>
                  <div className={styles.statCardLabel}>Done</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDriverAktif}`}>
                  <div className={styles.statCardNum}>
                    {analytics.driverAktif}
                  </div>
                  <div className={styles.statCardLabel}>Driver Aktif</div>
                </div>
                <div className={`${styles.statCard} ${styles.statCompletion}`}>
                  <div className={styles.statCardNum}>
                    {analytics.completionRate.toFixed(0)}%
                  </div>
                  <div className={styles.statCardLabel}>Completion Rate</div>
                </div>
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>📊</span>
                Analytics & Insights
              </div>

              <div className={styles.insightGrid}>
                <InsightCard
                  icon="🏆"
                  title="Top Driver (Task)"
                  entries={analytics.topDriverByTask}
                  color="blue"
                />
                <InsightCard
                  icon="⏱️"
                  title="Rata-rata Durasi Driver"
                  entries={analytics.avgDurationByDriver}
                  color="cyan"
                  valueFormatter={(v) => formatMinutes(v)}
                />
                <InsightCard
                  icon="🏢"
                  title="Top Departemen Requestor"
                  entries={analytics.topDepartementRequestor}
                  color="purple"
                />
                <InsightCard
                  icon="🧰"
                  title="Jenis Pekerjaan Terbanyak"
                  entries={analytics.topJenisPekerjaan}
                  color="green"
                />
                <InsightCard
                  icon="🚗"
                  title="Utilisasi Kendaraan"
                  entries={analytics.utilisasiKendaraan}
                  color="orange"
                />
                <InsightCard
                  icon="📅"
                  title="Aktivitas Harian"
                  entries={analytics.aktivitasHarian.map((e) => ({
                    ...e,
                    label: formatDateLabel(e.label),
                  }))}
                  color="red"
                />
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>👥</span>
                Ringkasan Per Driver
                <span className={styles.reportSectionCount}>
                  {analytics.driverSummaries.length} driver
                </span>
              </div>

              <div className={styles.driverSummaryGrid}>
                {analytics.driverSummaries.length === 0 ? (
                  <div className={styles.tableEmpty}>
                    <div className={styles.tableEmptyTitle}>
                      Tidak ada data driver pada periode ini
                    </div>
                  </div>
                ) : (
                  analytics.driverSummaries.map((s) => (
                    <div key={s.driverId} className={styles.driverSummaryCard}>
                      <div className={styles.driverSummaryHeader}>
                        <span>🏅</span> {s.driverNama}
                      </div>
                      <div className={styles.driverSummaryPeriod}>
                        {formatDateLabel(dateFrom)} s/d {formatDateLabel(dateTo)}
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Total Task</span>
                        <strong>{s.totalTask}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Selesai</span>
                        <strong>{s.selesai}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Completion Rate</span>
                        <strong className={styles.driverSummaryAccent}>
                          {s.completionRate.toFixed(0)}%
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Total Jam Kerja</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {formatMinutes(s.totalJamKerjaMinutes)}
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Avg Durasi/Task</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {s.avgDurationMinutes !== null
                            ? formatMinutes(s.avgDurationMinutes)
                            : "-"}
                        </strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

const INSIGHT_COLOR_CLASS: Record<string, string> = {
  blue: "insightBarBlue",
  cyan: "insightBarCyan",
  purple: "insightBarPurple",
  green: "insightBarGreen",
  orange: "insightBarOrange",
  red: "insightBarRed",
};

function InsightCard({
  icon,
  title,
  entries,
  color,
  valueFormatter,
}: {
  icon: string;
  title: string;
  entries: { label: string; value: number }[];
  color: string;
  valueFormatter?: (v: number) => string;
}) {
  const maxValue = Math.max(...entries.map((e) => e.value), 1);
  const barClass =
    styles[INSIGHT_COLOR_CLASS[color] as keyof typeof styles] || "";
  return (
    <div className={styles.insightCard}>
      <div className={styles.insightCardHeader}>
        <span>{icon}</span> {title}
      </div>
      {entries.length === 0 ? (
        <div className={styles.insightEmpty}>Tidak ada data</div>
      ) : (
        <div className={styles.insightList}>
          {entries.slice(0, 5).map((e) => (
            <div key={e.label} className={styles.insightRow}>
              <div className={styles.insightLabel} title={e.label}>
                {e.label}
              </div>
              <div className={styles.insightBarTrack}>
                <div
                  className={`${styles.insightBarFill} ${barClass}`}
                  style={{ width: `${(e.value / maxValue) * 100}%` }}
                />
              </div>
              <div className={styles.insightValue}>
                {valueFormatter ? valueFormatter(e.value) : e.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   CREATE TASK MODAL
════════════════════════════════════════════════ */

/** Builds a formatted WhatsApp share message for a newly-assigned driver
 *  task — greeting adapts to time of day, uses WhatsApp's own *bold*
 *  markup so it renders nicely once shared. */
function buildTaskWhatsAppMessage(params: {
  tanggal: string;
  driverName: string;
  vehicleLabel: string;
  jenisPekerjaan: string;
  asal: string;
  tujuan: string;
  requestor: string;
  departement: string;
  perihal: string;
}): string {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";

  // params.tanggal bisa berupa single date "YYYY-MM-DD"
  // atau range "YYYY-MM-DD s/d YYYY-MM-DD" — handle keduanya
  function fmtWaDate(d: string): string {
    const parsed = new Date(d + "T00:00:00");
    if (isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  let tanggalFormatted: string;
  if (params.tanggal.includes(" s/d ")) {
    const [from, to] = params.tanggal.split(" s/d ");
    tanggalFormatted = `${fmtWaDate(from.trim())} s/d ${fmtWaDate(to.trim())}`;
  } else {
    tanggalFormatted = fmtWaDate(params.tanggal);
  }

  const lines = [
    `${greeting},`,
    "",
    "Berikut informasi penugasan driver:",
    "",
    `📅 *Tanggal* : ${tanggalFormatted}`,
    `🧑‍✈️ *Driver* : ${params.driverName}`,
    `🚗 *Kendaraan* : ${params.vehicleLabel}`,
    `🧰 *Jenis Pekerjaan* : ${params.jenisPekerjaan}`,
    `🚩 *Dari* : ${params.asal}`,
    `📍 *Tujuan* : ${params.tujuan}`,
    `👤 *Requestor* : ${params.requestor}${params.departement ? ` (${params.departement})` : ""}`,
  ];
  if (params.perihal.trim()) {
    lines.push(`📝 *Perihal* : ${params.perihal.trim()}`);
  }
  lines.push("", "Mohon dapat ditindaklanjuti. Terima kasih 🙏", "", "_Pesan otomatis — CIKOPS Fleet Ops_");

  return lines.join("\n");
}

function CreateTaskModal({
  drivers,
  vehicles,
  employees,
  jobTypes,
  myProfile,
  places,
  onClose,
  onCreated,
  onError,
}: {
  drivers: Driver[];
  vehicles: Vehicle[];
  employees: Employee[];
  jobTypes: JobType[];
  myProfile: MyProfile | null;
  places: string[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [waMessage, setWaMessage] = useState<string | null>(null);

  async function handleSubmit(v: TaskFormValues) {
    setBusy(true);
    try {
      const { plant, tanggal, tanggalTo, asal, tujuan, driverId, vehicleId, jenisPekerjaan, requestor, departement, perihal, requestorEmail } = v;
      const driverName = drivers.find((d) => d.id === driverId)?.nama || "-";
      const vehicle = vehicles.find((x) => x.id === vehicleId);
      const vehicleLabel = vehicle ? `${vehicle.nopol}${vehicle.jenis ? ` (${vehicle.jenis})` : ""}` : "-";
      const driverPhone = drivers.find((d) => d.id === driverId)?.no_hp || undefined;
      const isRange = v.dateMode === "range";
      const dateTo = isRange ? tanggalTo : tanggal;

      let dayCount = 1;
      if (isRange) {
        const res = await createTaskBatch({
          driverId, vehicleId, jenisPekerjaan, tujuan, requestor, departement, perihal, plant,
          dateFrom: tanggal, dateTo: tanggalTo, lokasiAsal: asal,
        });
        dayCount = res.createdCount;
      } else {
        await createTask({
          tanggal, driver_id: driverId, vehicle_id: vehicleId, jenis_pekerjaan: jenisPekerjaan,
          tujuan, requestor, departement, perihal, plant, lokasi_asal: asal,
        });
      }

      // Notifikasi (best-effort, tidak menggagalkan penugasan)
      sendTaskBatchEmail({
        requestorEmail, requestor, driverName, driverPhone, vehicleLabel, jenisPekerjaan,
        tujuan, asal, departement, perihal, dateFrom: tanggal, dateTo, dayCount,
      }).catch((e) => console.warn("Task email failed:", e));
      sendPushToDriver(
        [driverId],
        "Ada Tugas Baru 🚗",
        `${asal} → ${tujuan} · ${jenisPekerjaan} · ${isRange ? `${tanggal} s/d ${tanggalTo}` : tanggal}`,
        { type: "task" }
      ).catch(() => {});

      setWaMessage(
        buildTaskWhatsAppMessage({
          tanggal: isRange ? `${tanggal} s/d ${tanggalTo}` : tanggal,
          driverName, vehicleLabel, jenisPekerjaan, asal, tujuan, requestor, departement, perihal,
        })
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal membuat tugas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onOverlayClick={waMessage ? undefined : onClose} maxWidth={waMessage ? 520 : 980}>
      {waMessage ? (
        <TaskSuccess
          message={waMessage}
          onWhatsapp={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
          onDone={() => { setWaMessage(null); onCreated(); }}
        />
      ) : (
        <TaskForm
          drivers={drivers}
          vehicles={vehicles}
          employees={employees}
          jobTypes={jobTypes}
          lockedPlant={myProfile?.plantScope ?? null}
          places={places}
          busy={busy}
          error=""
          onSubmit={handleSubmit}
          onClose={onClose}
        />
      )}
    </ModalPortal>
  );
}

/* ════════════════════════════════════════════════════════════
   FLEETOS TABS — ported from the original FleetOS system into this
   merged dashboard. Styled with the shared "Sky & Gold" design tokens
   (var(--brand), var(--gold), var(--surface), etc.) via inline styles,
   since these are new components without a pre-existing CSS module.
════════════════════════════════════════════════════════════ */

function daysUntil(dateStr: string | null | undefined): number {
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
  return d.toISOString().slice(0, 10);
}

/**
 * Ketentuan next date:
 *   KIR     → +6 bulan dari tanggal KIR terakhir
 *   STNK    → +12 bulan dari tanggal STNK terakhir
 *   Service → +3 bulan dari tanggal service terakhir (reminder awal),
 *             hard-deadline +6 bulan
 */
function nextDocDate(type: "KIR" | "STNK" | "Service", lastDate: string | null | undefined): {
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

function urgencyColor(days: number): string {
  if (days <= 7) return "var(--red)";
  if (days <= 30) return "var(--orange)";
  return "var(--green)";
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

/** Safely evaluates a simple arithmetic expression like "50000+30000" —
 *  strips anything that isn't a digit/operator first, same approach the
 *  original FleetOS claim form used for its nominal field. */
function evalExpr(raw: string): number | null {
  const cleaned = (raw || "").replace(/[^0-9+\-*/().\s]/g, "").slice(0, 120);
  if (!cleaned.trim()) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function('"use strict";return (' + cleaned + ")")();
    return isFinite(value) && value >= 0 ? Math.round(value) : null;
  } catch {
    return null;
  }
}

/** Computes the 4 Monday–Friday-anchored week boundaries (day-of-month
 *  numbers) for the month containing `dateStr`.
 *
 *  Business rule: a "week" here means a work week (Mon–Fri), and every
 *  month is always divided into exactly 4 of them for Claims reporting —
 *  never 5, even though a calendar month rarely divides evenly into
 *  4 full Mon–Fri blocks.
 *
 *  Week 1 always starts on the 1st, whatever weekday that is, and runs
 *  through the nearest Friday on/after it — EXCEPT if the 1st itself
 *  falls on a Friday, Saturday, or Sunday, in which case it runs through
 *  the *following* Friday instead. That's what folds a weekend sitting
 *  right at the start of the month into Week 1 (rather than that
 *  weekend becoming its own tiny "week 0"), and avoids a degenerate
 *  1-day Week 1 when the 1st happens to be a Friday:
 *    1st = Mon → Week 1 = day 1–5     1st = Fri → Week 1 = day 1–8
 *    1st = Tue → Week 1 = day 1–4     1st = Sat → Week 1 = day 1–7
 *    1st = Wed → Week 1 = day 1–3     1st = Sun → Week 1 = day 1–6
 *    1st = Thu → Week 1 = day 1–2
 *
 *  Weeks 2 and 3 are then standard 7-day blocks following on. Week 4
 *  absorbs everything through the end of the month (so it's often
 *  longer than 7 days — that's expected, it's the 4th bucket by design,
 *  not a 5th week). */
function monthWeekBoundaries(dateStr: string): { start: number; end: number }[] {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day1Weekday = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat
  let toFriday = (5 - day1Weekday + 7) % 7;
  if (toFriday === 0) toFriday = 7; // 1st is a Friday — push to next Friday, not a same-day week
  const w1End = Math.min(1 + toFriday, daysInMonth);
  const w2End = Math.min(w1End + 7, daysInMonth);
  const w3End = Math.min(w2End + 7, daysInMonth);
  return [
    { start: 1, end: w1End },
    { start: Math.min(w1End + 1, daysInMonth), end: w2End },
    { start: Math.min(w2End + 1, daysInMonth), end: w3End },
    { start: Math.min(w3End + 1, daysInMonth), end: daysInMonth },
  ];
}

/** Which of the month's 4 work-weeks (1–4) a date falls into — see
 *  monthWeekBoundaries() above for the exact rule. */
function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 1;
  const dNum = d.getDate();
  const bounds = monthWeekBoundaries(dateStr);
  for (let i = 0; i < bounds.length; i++) {
    if (dNum <= bounds[i].end) return i + 1;
  }
  return 4;
}

/* ════════════════════════════════════════════════════════════
   BUDGET FORECAST (Claims-based) — used by OpFundTab to project
   next week's likely spend from recent claim history, for the
   "dana belum cair dari Finance" contingency-planning scenario.
════════════════════════════════════════════════════════════ */

interface WeekBucket {
  key: string;   // e.g. "2026-08-W1" — unique across months
  label: string; // e.g. "M1 Agu"
  endDate: Date; // last day of that work-week, used for chronological sort
}

/** Every 4-week bucket (using the same Mon–Fri, weekend-folded-into-Week-1
 *  rule as weekOfMonth) whose end date falls within the last `monthsBack`
 *  months up to today — oldest first. A claim's bucket key is
 *  `${year}-${month}-W${weekOfMonth(date)}`, so summing claim totals by
 *  bucket key and walking this sequence gives a complete week-by-week
 *  history with explicit zeros for weeks that had no claims (not just
 *  the weeks that happen to have data — a driver who claims every other
 *  week should average lower per-week than one who claims every week,
 *  and skipping the zero-claim weeks would hide that). */
function generateWeekBucketSequence(monthsBack: number): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  const today = new Date();
  const rangeStart = new Date(today);
  rangeStart.setMonth(rangeStart.getMonth() - monthsBack);

  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const endCursor = new Date(today.getFullYear(), today.getMonth(), 1);

  while (cursor <= endCursor) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const bounds = monthWeekBoundaries(`${year}-${String(month + 1).padStart(2, "0")}-01`);
    bounds.forEach((b, i) => {
      const endDate = new Date(year, month, b.end);
      if (endDate >= rangeStart && endDate <= today) {
        buckets.push({
          key: `${year}-${String(month + 1).padStart(2, "0")}-W${i + 1}`,
          label: `M${i + 1} ${cursor.toLocaleDateString("id-ID", { month: "short" })}`,
          endDate,
        });
      }
    });
    cursor = new Date(year, month + 1, 1);
  }
  return buckets.sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
}

function claimWeekBucketKey(dateStr: string): string {
  const d = new Date(dateStr);
  const wk = weekOfMonth(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-W${wk}`;
}

/** Recency-weighted average: the most recent week in `buckets` gets
 *  weight 1, and each week further back is weighted by `decay` less
 *  (decay=0.85 ⇒ a week ~5 weeks old counts about half as much as this
 *  week) — so a recent spike or dip in a driver's claim pattern shows up
 *  in the forecast faster than a flat 3-month average would, while older
 *  weeks still contribute rather than being cut off entirely. */
function weightedWeeklyAverage(buckets: WeekBucket[], totalsByKey: Record<string, number>, decay = 0.85): number {
  const n = buckets.length;
  if (n === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  buckets.forEach((b, i) => {
    const weight = Math.pow(decay, n - 1 - i);
    weightedSum += weight * (totalsByKey[b.key] ?? 0);
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/** Shared placeholder for tabs not yet ported in this pass. */
function ComingSoonTab({ title }: { title: string }) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: "center",
        color: "var(--t3)",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)" }}>
        {title}
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        Segera hadir di tahap berikutnya — belum diporting dari FleetOS.
      </div>
    </div>
  );
}
async function getOverviewKantong(profile: MyProfile | null): Promise<Kantong | null> {
  if (profile?.plantScope) {
    return getCurrentKantong(profile.plantScope);
  }
  // Admin global — gabungkan CIK + PRB jadi satu angka ringkasan.
  const [cik, prb] = await Promise.all([getCurrentKantong("CIK"), getCurrentKantong("PRB")]);
  if (!cik && !prb) return null;
  return {
    id: "combined",
    period: cik?.period ?? prb?.period ?? "",
    plant: "CIK",
    totalBudget: (cik?.totalBudget ?? 0) + (prb?.totalBudget ?? 0),
    allocOpDriver: (cik?.allocOpDriver ?? 0) + (prb?.allocOpDriver ?? 0),
    allocEmergency: (cik?.allocEmergency ?? 0) + (prb?.allocEmergency ?? 0),
    cashAvailable: (cik?.cashAvailable ?? 0) + (prb?.cashAvailable ?? 0),
    claimSubmitted: (cik?.claimSubmitted ?? 0) + (prb?.claimSubmitted ?? 0),
    claimPaid: (cik?.claimPaid ?? 0) + (prb?.claimPaid ?? 0),
    unsubmittedClaim: (cik?.unsubmittedClaim ?? 0) + (prb?.unsubmittedClaim ?? 0),
    lastReset: cik?.lastReset ?? prb?.lastReset ?? "",
  };
}

/* ════════════════════════════════════════════════════════════
   HOME TAB — halaman utama baru: kartu ikon per modul, dikelompokkan
   per kategori (tab horizontal), supaya sidebar bisa dibikin ramping
   tanpa kehilangan kemudahan navigasi. Konten "Ringkasan" (KPI dsb.)
   yang lama tetap ada terpisah, tidak diganti.
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   WIDGET — Kalender bulan interaktif, titik penanda di tanggal yang
   ada agenda-nya.
════════════════════════════════════════════════════════════ */
function CalendarWidget({ events, onPickDate, selectedDate }: { events: AgendaEvent[]; onPickDate?: (dateStr: string) => void; selectedDate?: string | null }) {
  const { lang } = useLang();
  const [viewDate, setViewDate] = useState(new Date());
  const todayStr = new Date().toISOString().slice(0, 10);
  const eventDates = useMemo(() => new Set(events.map((e) => e.eventDate)), [events]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Senin = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthsId = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const monthsEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dowId = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const dowEn = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const cells: (number | null)[] = Array(startOffset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  return (
    <div className="neonCard" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--t2)" }}>‹</button>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--t1)" }}>{(lang === "id" ? monthsId : monthsEn)[month]} {year}</div>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--t2)" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {(lang === "id" ? dowId : dowEn).map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "var(--t3)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const hasEvent = eventDates.has(dateStr);
          const isSelected = selectedDate === dateStr;
          return (
            <button
              key={i}
              onClick={() => onPickDate?.(dateStr)}
              title={hasEvent ? (lang === "en" ? "Has agenda — click to view" : "Ada agenda — klik untuk lihat") : undefined}
              style={{
                position: "relative", aspectRatio: "1", borderRadius: 8, cursor: "pointer",
                border: isSelected ? "2px solid var(--brand)" : "2px solid transparent",
                background: isToday ? "var(--accent-solid)" : hasEvent ? "var(--orange-soft)" : "transparent",
                color: isToday ? "var(--accent-solid-text)" : hasEvent ? "var(--orange-text)" : "var(--t2)",
                fontSize: 12, fontWeight: isToday || hasEvent ? 800 : 500,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10.5, color: "var(--t3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--accent-solid)", display: "inline-block" }} /> {lang === "en" ? "Today" : "Hari ini"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--orange-soft)", border: "1px solid var(--orange-text)", display: "inline-block" }} /> {lang === "en" ? "Has agenda" : "Ada agenda"}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   WIDGET — Agenda Mendatang
════════════════════════════════════════════════════════════ */
const AGENDA_COLORS: Record<string, string> = { blue: "var(--brand)", green: "var(--green)", orange: "var(--orange)", red: "var(--red)", purple: "var(--purple)" };

function AgendaWidget({
  events, onAdd, onDelete, filterDate, onClearFilter,
}: {
  events: AgendaEvent[];
  onAdd: (e: { title: string; location: string; eventDate: string; eventTime: string }) => void;
  onDelete: (id: string) => void;
  filterDate?: string | null;
  onClearFilter?: () => void;
}) {
  const { lang } = useLang();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(filterDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");

  useEffect(() => { if (filterDate) setDate(filterDate); }, [filterDate]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const list = filterDate
    ? events.filter((e) => e.eventDate === filterDate)
    : events.filter((e) => e.eventDate >= todayStr).slice(0, 5);

  function formatDateLabelShort(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="neonCard" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--t1)" }}>
          {filterDate ? (lang === "en" ? "Agenda" : "Agenda") : (lang === "en" ? "Upcoming Agenda" : "Agenda Mendatang")}
        </div>
        <button onClick={() => setShowForm((v) => !v)} style={{ background: "none", border: "none", color: "var(--brand)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {showForm ? (lang === "en" ? "Cancel" : "Batal") : `+ ${lang === "en" ? "Add" : "Tambah"}`}
        </button>
      </div>

      {filterDate && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--orange-text)", background: "var(--orange-soft)", padding: "4px 10px", borderRadius: "var(--pill)" }}>
            📅 {formatDateLabelShort(filterDate)}
          </div>
          <button onClick={onClearFilter} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            {lang === "en" ? "Show all" : "Tampilkan semua"} ✕
          </button>
        </div>
      )}
      {!filterDate && <div style={{ marginBottom: 14 }} />}

      {showForm && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, padding: 12, borderRadius: 10, background: "var(--bg2)" }}>
          <input className={styles.formInput} placeholder={lang === "en" ? "Title" : "Judul"} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className={styles.formInput} placeholder={lang === "en" ? "Location" : "Lokasi"} value={location} onChange={(e) => setLocation(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" className={styles.formInput} value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" className={styles.formInput} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <button
            className="pillBtn"
            disabled={!title.trim()}
            onClick={() => { onAdd({ title: title.trim(), location: location.trim(), eventDate: date, eventTime: time }); setTitle(""); setLocation(""); setShowForm(false); }}
          >
            {lang === "en" ? "Save" : "Simpan"}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--t3)", textAlign: "center", padding: "12px 0" }}>
          {filterDate ? (lang === "en" ? "No agenda on this date." : "Tidak ada agenda di tanggal ini.") : (lang === "en" ? "No upcoming agenda." : "Belum ada agenda mendatang.")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", position: "relative" }}>
              <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: AGENDA_COLORS[e.color] ?? "var(--brand)", flexShrink: 0 }} />
              {!filterDate && <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t3)", width: 42, flexShrink: 0, paddingTop: 1 }}>{e.eventTime || "-"}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                {filterDate && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", marginBottom: 2 }}>{e.eventTime || "-"}</div>}
                {!filterDate && <div style={{ fontSize: 10.5, color: "var(--t3)", marginBottom: 2 }}>{formatDateLabelShort(e.eventDate)}</div>}
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{e.title}</div>
                {e.location && <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{e.location}</div>}
              </div>
              <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 12, padding: 2 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   WIDGET — Aksi Cepat
════════════════════════════════════════════════════════════ */
function QuickActionsWidget({ setActiveTab }: { setActiveTab: (t: DashboardTab) => void }) {
  const { lang } = useLang();
  const actions: { icon: string; labelId: string; labelEn: string; tab: DashboardTab; tone: string }[] = [
    { icon: "employeerequests", labelId: "Permintaan Baru", labelEn: "New Request", tab: "employeerequests", tone: "facility" },
    { icon: "reports", labelId: "Laporan Cepat", labelEn: "Quick Report", tab: "reports", tone: "fleet" },
    { icon: "vehicles", labelId: "Tambah Armada", labelEn: "Add Vehicle", tab: "vehicles", tone: "fleet" },
    { icon: "claims", labelId: "Pengajuan Klaim", labelEn: "Submit Claim", tab: "claims", tone: "finance" },
  ];
  return (
    <div className="neonCard" style={{ padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>{lang === "en" ? "Quick Actions" : "Aksi Cepat"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {actions.map((a) => {
          const tn = GROUP_TONE[a.tone] ?? GROUP_TONE.system;
          return (
            <button
              key={a.tab}
              onClick={() => setActiveTab(a.tab)}
              className={styles.quickAction}
            >
              <span className={styles.quickActionIcon} style={{ background: tn.bg, color: tn.fg }}><Icon name={a.icon} size={17} /></span>
              <span className={styles.quickActionLabel}>{lang === "id" ? a.labelId : a.labelEn}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   WIDGET — Pengumuman
════════════════════════════════════════════════════════════ */
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

function HomeTab({
  setActiveTab,
  myProfile,
  activeGroupId,
  setActiveGroupId,
}: {
  setActiveTab: (t: DashboardTab) => void;
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

  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string | null>(null);
  const [weekTasks, setWeekTasks] = useState<TaskDetail[]>([]);
  const [gateLogs, setGateLogs] = useState<VehicleGateLog[]>([]);
  const [gateLoadedAt, setGateLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [kpi, setKpi] = useState<{
    claimWeekTotal: number;
    tasksToday: number;
    canteenTodayTotal: number;
    opBudgetAvailable: number;
    vehiclesActive: number;
    driversActive: number;
  } | null>(null);

  const loadWidgets = useCallback(async () => {
    try {
      const [ag, an] = await Promise.all([getAgendaEvents(), getAnnouncements()]);
      setAgendaEvents(ag);
      setAnnouncements(an);
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
        const todayS = now.toISOString().slice(0, 10);
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const dow = (now.getDay() + 6) % 7; // Senin = 0
        const monday = new Date(now);
        monday.setDate(now.getDate() - dow);
        const mondayStr = monday.toISOString().slice(0, 10);

        if (prbOnly) {
          const [tasksToday, vehicles, drivers] = await Promise.all([
            getTasksByRange(todayS, todayS, "PRB"),
            getVehicles("PRB"),
            getDrivers("PRB"),
          ]);
          setKpi({
            claimWeekTotal: 0, tasksToday: tasksToday.length, canteenTodayTotal: 0, opBudgetAvailable: 0,
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
        const canteenTodayTotal = canteenToday
          ? canteenToday.snackOrder.reduce((a, b) => a + b, 0) + canteenToday.mealOrder.reduce((a, b) => a + b, 0)
          : 0;
        const opBudgetAvailable = (kantongCik?.cashAvailable ?? 0) + (kantongPrb?.cashAvailable ?? 0);

        setKpi({
          claimWeekTotal,
          tasksToday: tasksToday.length,
          canteenTodayTotal,
          opBudgetAvailable,
          vehiclesActive: vehicles.filter((v) => v.aktif).length,
          driversActive: drivers.filter((d) => d.aktif).length,
        });
      } catch (e) {
        console.warn("Gagal memuat KPI Home:", e);
      }
    })();
  }, [prbOnly]);

  async function handleAddAgenda(e: { title: string; location: string; eventDate: string; eventTime: string }) {
    try {
      await addAgendaEvent(e);
      loadWidgets();
    } catch (err) {
      alert(`Gagal menambah agenda: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async function handleDeleteAgenda(id: string) {
    try {
      await deleteAgendaEvent(id);
      loadWidgets();
    } catch (err) {
      alert(`Gagal menghapus agenda: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
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
                      <b className={hm.kpiVal}>{kpi.canteenTodayTotal.toLocaleString("id-ID")}<small> porsi</small></b>
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
        <CalendarWidget events={agendaEvents} selectedDate={selectedAgendaDate} onPickDate={(d) => setSelectedAgendaDate(d === selectedAgendaDate ? null : d)} />
        <AgendaWidget events={agendaEvents} onAdd={handleAddAgenda} onDelete={handleDeleteAgenda} filterDate={selectedAgendaDate} onClearFilter={() => setSelectedAgendaDate(null)} />
        <AnnouncementWidget announcements={announcements} onAdd={handleAddAnnouncement} canManage={myProfile?.role === "admin"} />
      </div>}
    </div>
  );
}

function HomeKpiCard({
  icon, tone, labelId, labelEn, value, isCurrency, subValue, subLabelId, subLabelEn,
}: {
  icon: string; tone: string; labelId: string; labelEn: string; value: number;
  isCurrency?: boolean; subValue?: number; subLabelId?: string; subLabelEn?: string;
}) {
  const { lang } = useLang();
  const animated = useCountUp(value);
  const animatedSub = useCountUp(subValue ?? 0);
  const tn = GROUP_TONE[tone] ?? GROUP_TONE.fleet;
  const displayValue = isCurrency ? `Rp ${animated.toLocaleString("id-ID")}` : animated.toLocaleString("id-ID");
  return (
    <div className={styles.homeKpi}>
      <span className={styles.homeKpiIcon} style={{ background: tn.bg, color: tn.fg }}><Icon name={icon} size={20} /></span>
      <div className={styles.homeKpiValue} style={{ fontSize: isCurrency ? 22 : 30 }}>
        {displayValue}
        {subValue !== undefined && (
          <small> / {animatedSub} {lang === "id" ? subLabelId : subLabelEn}</small>
        )}
      </div>
      <div className={styles.homeKpiLabel}>{lang === "id" ? labelId : labelEn}</div>
    </div>
  );
}


function OverviewTab({ setActiveTab, myProfile }: { setActiveTab: (t: DashboardTab) => void; myProfile: MyProfile | null }) {
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
const CLAIM_TYPES = ["Gasoline", "Toll", "Parking", "Service", "Maintenance", "Other"];
const CLAIM_TYPE_COLOR: Record<string, string> = {
  Gasoline: "var(--green)",
  Toll: "var(--brand)",
  Parking: "var(--orange)",
  Service: "var(--red)",
  Maintenance: "var(--red)",
  Other: "var(--t3)",
};

type ClaimLineDraft = { id: number; type: string; expr: string };

/** The month-anchored work-week (Mon–Fri, Week 1–4) containing the given
 *  date — used both for the Claims table's "Period: X – Y" display and
 *  for the per-week filter. Shares monthWeekBoundaries()'s rule with
 *  weekOfMonth() so the filter and the Weekly Recap report always agree
 *  on where each week starts and ends. */
function weekRangeOf(dateStr: string, lang: string): { from: Date; to: Date; label: string } {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const wk = weekOfMonth(dateStr);
  const bounds = monthWeekBoundaries(dateStr)[wk - 1];
  const from = new Date(year, month, bounds.start);
  const to = new Date(year, month, bounds.end);
  const fmt = (dt: Date) => dt.toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short" });
  const weekLabel = lang === "en" ? `Week ${wk}` : `Minggu ${wk}`;
  return { from, to, label: `${weekLabel} · ${fmt(from)} – ${fmt(to)}` };
}

function ActivityLogTab() {
  const { lang } = useLang();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [daysFilter, setDaysFilter] = useState<number>(7);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const TABLE_OPTIONS = ["all", "claims", "kantong", "drivers", "employees", "job_types"];
  const TABLE_LABEL: Record<string, string> = {
    all: lang === "en" ? "All Tables" : "Semua Tabel",
    claims: "Claims",
    kantong: lang === "en" ? "Operational Fund" : "Dana Operasional",
    drivers: "Drivers",
    employees: "Employees",
    job_types: lang === "en" ? "Job Types" : "Jenis Pekerjaan",
  };
  const ACTION_COLOR: Record<string, string> = { INSERT: "var(--green)", UPDATE: "var(--brand)", DELETE: "var(--red)" };
  const ACTION_LABEL_ID: Record<string, string> = { INSERT: "Ditambah", UPDATE: "Diubah", DELETE: "Dihapus" };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivityLog({
        tableName: tableFilter === "all" ? undefined : tableFilter,
        days: daysFilter,
      });
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat log aktivitas");
    } finally {
      setLoading(false);
    }
  }, [tableFilter, daysFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function diffFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
    if (!oldData || !newData) return [];
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    keys.forEach((k) => {
      if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) {
        changes.push({ field: k, from: oldData[k], to: newData[k] });
      }
    });
    return changes;
  }

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return "-";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  return (
    <div style={{ padding: 20 }}>
      <div className="sectionHeading">{lang === "en" ? "Activity Log" : "Log Aktivitas"}</div>
      <div style={{ fontSize: 12.5, color: "var(--t3)", marginBottom: 18 }}>
        {lang === "en"
          ? "Complete audit trail of who changed what, across Claims, Operational Fund, and Master Data. Visible only to master admin."
          : "Jejak audit lengkap siapa mengubah apa, mencakup Claims, Dana Operasional, dan Master Data. Cuma bisa dilihat oleh master admin."}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <select
          className={styles.formSelect}
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          style={{ width: "auto" }}
        >
          {TABLE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TABLE_LABEL[t]}</option>
          ))}
        </select>
        <div style={{ display: "flex", borderRadius: "var(--pill)", border: "1px solid var(--border2)", padding: 3, gap: 2 }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDaysFilter(d)}
              className="tabPill"
              style={{
                padding: "6px 14px", borderRadius: "var(--pill)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: daysFilter === d ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent",
                color: daysFilter === d ? "#fff" : "var(--t2)",
              }}
            >
              {lang === "en" ? `${d}d` : `${d} hari`}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>{lang === "en" ? "Loading..." : "Memuat..."}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
            {lang === "en" ? "No activity in this period." : "Tidak ada aktivitas pada periode ini."}
          </div>
        ) : (
          logs.map((log, i) => {
            const isOpen = expandedId === log.id;
            const changes = log.action === "UPDATE" ? diffFields(log.oldData, log.newData) : [];
            return (
              <div key={log.id} className="staggerItem" style={{ borderBottom: "1px solid var(--border)", animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                <div
                  onClick={() => setExpandedId(isOpen ? null : log.id)}
                  className="rowHover"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", position: "relative", zIndex: 1 }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--pill)", background: `${ACTION_COLOR[log.action]}18`, color: ACTION_COLOR[log.action], whiteSpace: "nowrap" }}>
                    {ACTION_LABEL_ID[log.action] || log.action}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>
                      {log.actorName} <span style={{ fontWeight: 400, color: "var(--t3)" }}>· {log.actorRole}{log.actorPlant ? ` · ${log.actorPlant}` : ""}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t3)" }}>
                      {TABLE_LABEL[log.tableName] || log.tableName}
                      {changes.length > 0 && ` — ${changes.length} ${lang === "en" ? "field(s) changed" : "field berubah"}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", whiteSpace: "nowrap" }}>
                    {new Date(log.createdAt).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <span style={{ color: "var(--t3)", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 18px 16px 18px", position: "relative", zIndex: 1 }}>
                    {log.action === "UPDATE" && changes.length > 0 ? (
                      <div style={{ borderRadius: 10, border: "1px solid var(--border2)", overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", padding: "8px 12px", background: "var(--bg2)", fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase" }}>
                          <div>{lang === "en" ? "Field" : "Field"}</div>
                          <div>{lang === "en" ? "Before" : "Sebelum"}</div>
                          <div>{lang === "en" ? "After" : "Sesudah"}</div>
                        </div>
                        {changes.map((c) => (
                          <div key={c.field} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
                            <div style={{ fontWeight: 700, color: "var(--t2)" }}>{c.field}</div>
                            <div style={{ color: "var(--red)" }}>{fmtVal(c.from)}</div>
                            <div style={{ color: "var(--green)" }}>{fmtVal(c.to)}</div>
                          </div>
                        ))}
                      </div>
                    ) : log.action === "INSERT" ? (
                      <div style={{ fontSize: 12, color: "var(--t2)", fontFamily: "var(--mono)", background: "var(--bg2)", borderRadius: 10, padding: 12 }}>
                        {JSON.stringify(log.newData, null, 2)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--t2)", fontFamily: "var(--mono)", background: "var(--bg2)", borderRadius: 10, padding: 12 }}>
                        {JSON.stringify(log.oldData, null, 2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Groups claims into per-week, per-driver totals by category (Gasoline/
 *  Toll/Parking/Other). Shared by the on-screen Weekly Recap table and by
 *  the Excel/PDF export (which calls this twice — once for the "Driver
 *  User" list, once for everyone else — to produce two separate tables). */
function computeWeeklyRecap(claims: Claim[]): {
  rows: { weekLabel: string; driver: string; gasoline: number; toll: number; parking: number; other: number; total: number }[];
  grandTotal: { gasoline: number; toll: number; parking: number; other: number; total: number };
} {
  const weekMap = new Map<string, Map<string, { Gasoline: number; Toll: number; Parking: number; Other: number }>>();
  claims.forEach((c) => {
    const wk = weekOfMonth(c.periodDate);
    const weekKey = `${c.periodDate.slice(0, 7)}-W${wk}`;
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Map());
    const driverMap = weekMap.get(weekKey)!;
    const name = c.driverName || "-";
    if (!driverMap.has(name)) driverMap.set(name, { Gasoline: 0, Toll: 0, Parking: 0, Other: 0 });
    const bucket = driverMap.get(name)!;
    c.items.forEach((item) => {
      const cat = item.type === "Gasoline" ? "Gasoline" : item.type === "Toll" ? "Toll" : item.type === "Parking" ? "Parking" : "Other";
      bucket[cat] += item.total;
    });
  });
  const weekKeys = [...weekMap.keys()].sort();
  const rows: { weekLabel: string; driver: string; gasoline: number; toll: number; parking: number; other: number; total: number }[] = [];
  weekKeys.forEach((wk) => {
    const driverMap = weekMap.get(wk)!;
    const weekNum = wk.split("-W")[1];
    [...driverMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([driver, vals]) => {
      rows.push({
        weekLabel: weekNum,
        driver,
        gasoline: vals.Gasoline,
        toll: vals.Toll,
        parking: vals.Parking,
        other: vals.Other,
        total: vals.Gasoline + vals.Toll + vals.Parking + vals.Other,
      });
    });
  });
  const grandTotal = {
    gasoline: rows.reduce((s, r) => s + r.gasoline, 0),
    toll: rows.reduce((s, r) => s + r.toll, 0),
    parking: rows.reduce((s, r) => s + r.parking, 0),
    other: rows.reduce((s, r) => s + r.other, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
  };
  return { rows, grandTotal };
}

function ClaimsTab({ myProfile = null }: { myProfile?: MyProfile | null }) {
  const { lang, t } = useLang();
  const isMobileClaims = useIsMobile(768);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [periodMode, setPeriodMode] = useState<"all" | "week" | "date">("all");
  const [filterDate, setFilterDate] = useState(todayStr());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Claim | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formDriverId, setFormDriverId] = useState("");
  const [submissionDate, setSubmissionDate] = useState(todayStr());
  const [periodDate, setPeriodDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ClaimLineDraft[]>([
    { id: Date.now(), type: "Gasoline", expr: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [driverUserIds, setDriverUserIds] = useState<string[]>([]);
  const [exportingRecap, setExportingRecap] = useState(false);
  const [exportingWeeklyRecap, setExportingWeeklyRecap] = useState<"excel" | "pdf" | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "weekly" | "wreath">("list");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ name: string; total: number } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  // ── Karangan Bunga Duka Cita ──
  const [wreaths, setWreaths] = useState<Wreath[]>([]);
  const [loadingWreaths, setLoadingWreaths] = useState(false);
  const [showWreathForm, setShowWreathForm] = useState(false);
  const [wreathTanggal, setWreathTanggal] = useState(todayStr());
  const [wreathAtasNama, setWreathAtasNama] = useState("");
  const [wreathKeterangan, setWreathKeterangan] = useState("");
  const [wreathPlant, setWreathPlant] = useState<Plant>(myProfile?.plantScope ?? "CIK");
  const [savingWreath, setSavingWreath] = useState(false);
  const [confirmDeleteWreath, setConfirmDeleteWreath] = useState<Wreath | null>(null);
  const [wreathStatusFilter, setWreathStatusFilter] = useState<"all" | "submitted" | "pending">("all");

  const loadWreaths = useCallback(async () => {
    setLoadingWreaths(true);
    try {
      const w = await getWreaths(myProfile?.plantScope ?? null);
      setWreaths(w);
    } catch (e) {
      console.warn("Gagal memuat data karangan bunga:", e);
    } finally {
      setLoadingWreaths(false);
    }
  }, [myProfile?.plantScope]);

  useEffect(() => {
    if (viewMode === "wreath") loadWreaths();
  }, [viewMode, loadWreaths]);

  const filteredWreaths = useMemo(() => {
    if (wreathStatusFilter === "submitted") return wreaths.filter((w) => w.claimed);
    if (wreathStatusFilter === "pending") return wreaths.filter((w) => !w.claimed);
    return wreaths;
  }, [wreaths, wreathStatusFilter]);

  function openAddWreath() {
    setWreathTanggal(todayStr());
    setWreathAtasNama("");
    setWreathKeterangan("");
    setWreathPlant(myProfile?.plantScope ?? "CIK");
    setShowWreathForm(true);
  }

  const canSaveWreath = wreathTanggal.trim() !== "" && wreathAtasNama.trim() !== "";

  async function handleSaveWreath() {
    if (!canSaveWreath || savingWreath) return;
    setSavingWreath(true);
    try {
      await addWreath({
        plant: wreathPlant,
        tanggal: wreathTanggal,
        atasNama: wreathAtasNama.trim(),
        keterangan: wreathKeterangan.trim(),
      });
      setShowWreathForm(false);
      await loadWreaths();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan data karangan bunga");
    } finally {
      setSavingWreath(false);
    }
  }

  async function handleToggleWreathClaimed(w: Wreath) {
    // optimistic update — table stays snappy, revert on failure
    setWreaths((prev) => prev.map((x) => (x.id === w.id ? { ...x, claimed: !x.claimed } : x)));
    try {
      await setWreathClaimed(w.id, !w.claimed);
    } catch (e) {
      setWreaths((prev) => prev.map((x) => (x.id === w.id ? { ...x, claimed: w.claimed } : x)));
      alert(e instanceof Error ? e.message : "Gagal mengubah status klaim");
    }
  }

  async function handleDeleteWreath() {
    if (!confirmDeleteWreath) return;
    try {
      await deleteWreath(confirmDeleteWreath.id);
      setConfirmDeleteWreath(null);
      await loadWreaths();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus data karangan bunga");
    }
  }

  function handleExportWreaths() {
    const plantLabel = myProfile?.plantScope ?? "Semua-Plant";
    exportWreathsToCsv(filteredWreaths, plantLabel);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, d, du] = await Promise.all([getClaims(myProfile?.plantScope ?? null), getDrivers(myProfile?.plantScope ?? null), getAppSetting("driver_user_ids")]);
      setClaims(c);
      setDrivers(d);
      setDriverUserIds(du ? du.split(",").filter(Boolean) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data klaim");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = driverFilter === "all" ? claims : claims.filter((c) => c.driver_id === driverFilter);
    if (periodMode === "date") {
      list = list.filter((c) => c.periodDate === filterDate);
    } else if (periodMode === "week") {
      const { from, to } = weekRangeOf(filterDate, lang);
      list = list.filter((c) => {
        const d = new Date(c.periodDate);
        return d >= from && d <= to;
      });
    }
    return list;
  }, [claims, driverFilter, periodMode, filterDate, lang]);
  const totalFiltered = filtered.reduce((s, c) => s + c.total, 0);
  const uniqueDriversFiltered = new Set(filtered.map((c) => c.driver_id)).size;
  const animatedClaimsCount = useCountUp(filtered.length);
  const animatedTotalFiltered = useCountUp(totalFiltered);
  const animatedActiveDriversClaims = useCountUp(uniqueDriversFiltered);

  const weeklyRecap = useMemo(() => computeWeeklyRecap(filtered), [filtered]);

  function openAdd() {
    setFormDriverId("");
    setSubmissionDate(todayStr());
    setPeriodDate(todayStr());
    setNote("");
    setLines([{ id: Date.now(), type: "Gasoline", expr: "" }]);
    setShowForm(true);
  }

  function addLine() {
    setLines((p) => [...p, { id: Date.now() + Math.random(), type: "Gasoline", expr: "" }]);
  }
  function removeLine(id: number) {
    setLines((p) => (p.length > 1 ? p.filter((l) => l.id !== id) : p));
  }
  function updateLine(id: number, field: "type" | "expr", value: string) {
    setLines((p) => p.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  const grandTotal = lines.reduce((s, l) => s + (evalExpr(l.expr) || 0), 0);
  const canSave = !!formDriverId && lines.every((l) => l.type && (evalExpr(l.expr) || 0) > 0);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const items: ClaimItem[] = lines.map((l) => ({
        type: l.type,
        expr: l.expr,
        total: evalExpr(l.expr) || 0,
      }));
      await addClaim({
        driver_id: formDriverId,
        submissionDate,
        periodDate,
        items,
        total: grandTotal,
        note,
      });
      setShowForm(false);
      setNotice({ name: drivers.find((d) => d.id === formDriverId)?.nama || "-", total: grandTotal });
      await load();

      // Best-effort email notifications — driver gets a friendly
      // confirmation, manager gets a formal record copy. Never blocks
      // or fails the claim submission itself; only logged if it fails
      // (e.g. Edge Function not deployed yet, or no email on file).
      const driverEmail = drivers.find((d) => d.id === formDriverId)?.email;
      const driverName = drivers.find((d) => d.id === formDriverId)?.nama || "-";
      sendClaimNotificationEmails(driverEmail, {
        driverName,
        periodDate,
        submissionDate,
        items,
        total: grandTotal,
        note,
        lang,
      })
        .then((res) => {
          if (res.driver && !res.driver.ok) console.warn("Driver claim email failed:", res.driver.error);
          if (res.manager && !res.manager.ok) console.warn("Manager claim email failed:", res.manager.error);
        })
        .catch((e) => console.warn("Claim email notification failed:", e));
      // Push notification ke driver (fire-and-forget)
      sendPushToDriver(
        [formDriverId],
        lang === "en" ? "New Claim Submitted 💰" : "Ada Klaim Baru 💰",
        lang === "en"
          ? `Period: ${periodDate} · Total: Rp ${new Intl.NumberFormat("id-ID").format(grandTotal)}`
          : `Periode: ${periodDate} · Total: Rp ${new Intl.NumberFormat("id-ID").format(grandTotal)}`,
        { type: "claim" }
      ).catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan klaim");
    } finally {
      setSaving(false);
    }
  }

 async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteClaim(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus klaim");
    }
  }

  function handleExportRecap() {
    setExportingRecap(true);
    try {
      const label = weekRangeOf(filterDate, lang).label + " " + filterDate.slice(0, 4);
      exportTandaTerima(filtered, `Week ${weekOfMonth(filterDate)} - ${label}`, "Cikarang", driverUserIds);
    } finally {
      setExportingRecap(false);
    }
  }

  function weeklyRecapPeriodLabel(): string {
    if (periodMode === "week") return `${weekRangeOf(filterDate, lang).label} ${filterDate.slice(0, 4)}`;
    if (periodMode === "date") return filterDate;
    return lang === "en" ? "All Time" : "Semua Periode";
  }

  async function handleExportWeeklyRecap(format: "excel" | "pdf") {
    if (exportingWeeklyRecap) return;
    setExportingWeeklyRecap(format);
    try {
      const label = weeklyRecapPeriodLabel();

      const userClaims = filtered.filter((c) => driverUserIds.includes(c.driver_id));
      const otherClaims = filtered.filter((c) => !driverUserIds.includes(c.driver_id));
      const hasDriverUserSplit = driverUserIds.length > 0 && userClaims.length > 0;

      const sections = hasDriverUserSplit
        ? [
            { ...computeWeeklyRecap(userClaims), title: "TANDA TERIMA — DRIVER USER", rincianRows: buildRincianRows(userClaims) },
            { ...computeWeeklyRecap(otherClaims), title: "TANDA TERIMA", rincianRows: buildRincianRows(otherClaims) },
          ]
        : [{ ...weeklyRecap, title: "TANDA TERIMA", rincianRows: buildRincianRows(filtered) }];

      if (format === "excel") {
        await exportWeeklyRecapToExcel(sections, label);
      } else {
        await exportWeeklyRecapToPdf(sections, label);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal membuat file rekap");
    } finally {
      setExportingWeeklyRecap(null);
    }
  }

  const en = lang === "en";
  const periodLabel = weeklyRecapPeriodLabel();
  const typeOrder = [...CLAIM_CATS as readonly string[], ...Array.from(new Set(filtered.flatMap((c) => c.items.map((i) => i.type)))).filter((x) => !(CLAIM_CATS as readonly string[]).includes(x))];
  const byType = typeOrder.map((type) => ({
    type,
    amount: filtered.reduce((s, c) => s + c.items.filter((i) => i.type === type).reduce((a, i) => a + i.total, 0), 0),
  }));
  const typeFiltered = typeFilter ? filtered.filter((c) => c.items.some((i) => i.type === typeFilter)) : filtered;
  const groups = useMemo(() => {
    const sorted = typeFiltered.slice().sort((a, b) => (a.periodDate < b.periodDate ? 1 : a.periodDate > b.periodDate ? -1 : (a.submittedAt < b.submittedAt ? 1 : -1)));
    const map = new Map<string, { label: string; items: Claim[]; total: number }>();
    for (const c of sorted) {
      const key = `${c.periodDate.slice(0, 7)}-W${weekOfMonth(c.periodDate)}`;
      const g = map.get(key) ?? { label: weekRangeOf(c.periodDate, lang).label, items: [], total: 0 };
      g.items.push(c);
      g.total += c.total;
      map.set(key, g);
    }
    return [...map.entries()];
  }, [typeFiltered, lang]);
  let formWeek = "";
  try { formWeek = periodDate ? weekRangeOf(periodDate, lang).label : ""; } catch { formWeek = ""; }
  const driverOptions = drivers.map((d) => ({ id: d.id, nama: d.nama }));

  return (
    <div className={cs.root}>
      {notice && (
        <div className={cs.notice} role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m8 12.5 2.8 2.8L16 9.5" /></svg>
          <span>{en ? "Claim submitted for" : "Klaim terkirim untuk"} <b>{notice.name}</b> · Rp {fmtRp(notice.total)}</span>
        </div>
      )}
      {error && <div className={`${cs.notice} ${cs.noticeErr}`} role="alert">{error}</div>}

      <ViewSwitch
        value={viewMode}
        onChange={setViewMode}
        options={[
          { key: "list", label: en ? "Claims" : "Daftar klaim" },
          { key: "weekly", label: en ? "Weekly recap" : "Rekap mingguan" },
          { key: "wreath", label: en ? "Condolence wreaths" : "Karangan bunga duka cita", icon: <span aria-hidden="true">💐</span> },
        ]}
      />

      {viewMode !== "wreath" && (
        <div className={cs.top}>
          <div className={cs.filters}>
            <select className={cs.select} value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Driver">
              <option value="all">{en ? "All drivers" : "Semua driver"}</option>
              {drivers.map((d) => (<option key={d.id} value={d.id}>{d.nama}</option>))}
            </select>
            <PeriodSwitch
              value={periodMode}
              onChange={setPeriodMode}
              labels={[en ? "All time" : "Semua", en ? "By week" : "Per minggu", en ? "By date" : "Per tanggal"]}
            />
            {periodMode !== "all" && (
              <input type="date" className={cs.dateIn} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} aria-label={en ? "Filter date" : "Tanggal filter"} />
            )}
            {periodMode === "week" && <span className={cs.weekNote}>{weekRangeOf(filterDate, lang).label}</span>}
          </div>
          <div className={cs.actions}>
            {periodMode === "week" && filtered.length > 0 && (
              <button className={`${cs.btn} ${cs.btnGreen}`} onClick={handleExportRecap} disabled={exportingRecap} title={en ? "Export official Finance recap format (CSV)" : "Export format rekap resmi Finance (CSV)"}>
                ⬇ {exportingRecap ? "..." : "Export Tanda Terima"}
              </button>
            )}
            <button className={cs.primary} onClick={openAdd}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {en ? "New claim" : "Buat klaim"}
            </button>
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <>
          <ClaimsHero
            lang={lang}
            total={totalFiltered}
            count={filtered.length}
            drivers={uniqueDriversFiltered}
            byType={byType}
            activeType={typeFilter}
            onType={setTypeFilter}
            totalValue={animatedTotalFiltered}
            countValue={animatedClaimsCount}
            driversValue={animatedActiveDriversClaims}
            periodLabel={periodLabel}
          />
          {loading ? (
            <div className={cs.skel}><i /><i /><i /></div>
          ) : typeFiltered.length === 0 ? (
            <div className={cs.empty}>
              <span className={cs.emptyIc} aria-hidden="true">🧾</span>
              <b>{filtered.length === 0 ? (en ? "No claims in this view" : "Belum ada klaim di tampilan ini") : (en ? "No claim has this category" : "Tidak ada klaim dengan kategori ini")}</b>
              <p>{filtered.length === 0 ? (en ? "Change the filters, or add the first claim." : "Ubah filter di atas, atau buat klaim pertama.") : (en ? "Clear the category filter to see everything again." : "Hapus filter kategori untuk melihat semuanya lagi.")}</p>
              {filtered.length === 0
                ? <button className={cs.primary} onClick={openAdd}>{en ? "New claim" : "Buat klaim"}</button>
                : <button className={cs.btn} onClick={() => setTypeFilter(null)}>{en ? "Clear filter" : "Hapus filter"}</button>}
            </div>
          ) : (
            <div className={cs.list}>
              {groups.map(([key, g]) => (
                <div key={key} style={{ display: "contents" }}>
                  <WeekHeader label={g.label} count={g.items.length} total={g.total} lang={lang} />
                  {g.items.map((c) => (
                    <ClaimCard
                      key={c.id}
                      claim={c}
                      open={expandedId === c.id}
                      onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      onDelete={() => setConfirmDelete(c)}
                      lang={lang}
                      typeFilter={typeFilter}
                      weekText={weekRangeOf(c.periodDate, lang).label}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === "weekly" && (
        <div className={cs.panel}>
          <div className={cs.panelBar}>
            <h3>{en ? "Weekly recap" : "Rekap mingguan"} · {periodLabel}</h3>
            <div className={cs.actions}>
              <button className={`${cs.btn} ${cs.btnGreen}`} onClick={() => handleExportWeeklyRecap("excel")} disabled={exportingWeeklyRecap !== null || weeklyRecap.rows.length === 0} title={en ? "Download this recap as Excel (.xlsx)" : "Unduh rekap ini sebagai Excel (.xlsx)"}>
                ⬇ {exportingWeeklyRecap === "excel" ? "..." : "Excel"}
              </button>
              <button className={`${cs.btn} ${cs.btnRed}`} onClick={() => handleExportWeeklyRecap("pdf")} disabled={exportingWeeklyRecap !== null || weeklyRecap.rows.length === 0} title={en ? "Download this recap as PDF" : "Unduh rekap ini sebagai PDF"}>
                ⬇ {exportingWeeklyRecap === "pdf" ? "..." : "PDF"}
              </button>
            </div>
          </div>
          {weeklyRecap.rows.length === 0 ? (
            <div className={cs.empty} style={{ border: 0 }}><span className={cs.emptyIc} aria-hidden="true">📊</span><b>{t.actionNoDataYet}</b></div>
          ) : (
            <div className={cs.tableWrap}>
              <table className={cs.table}>
                <thead>
                  <tr>
                    <th>{en ? "Week" : "Minggu"}</th>
                    <th>{en ? "Driver" : "Nama driver"}</th>
                    <th className={cs.num}>{catLabel("Gasoline", lang)}</th>
                    <th className={cs.num}>{catLabel("Toll", lang)}</th>
                    <th className={cs.num}>{catLabel("Parking", lang)}</th>
                    <th className={cs.num}>{en ? "Other" : "Lainnya"}</th>
                    <th style={{ minWidth: 110 }}>{en ? "Mix" : "Komposisi"}</th>
                    <th className={cs.num}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRecap.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.weekLabel}</td>
                      <td className={cs.strong}>{r.driver}</td>
                      <td className={cs.num}>Rp {fmtRp(r.gasoline)}</td>
                      <td className={cs.num}>Rp {fmtRp(r.toll)}</td>
                      <td className={cs.num}>Rp {fmtRp(r.parking)}</td>
                      <td className={cs.num}>Rp {fmtRp(r.other)}</td>
                      <td><RecapBar g={r.gasoline} t={r.toll} p={r.parking} o={r.other} /></td>
                      <td className={`${cs.num} ${cs.strong}`}>Rp {fmtRp(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Grand total</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.gasoline)}</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.toll)}</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.parking)}</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.other)}</td>
                    <td><RecapBar g={weeklyRecap.grandTotal.gasoline} t={weeklyRecap.grandTotal.toll} p={weeklyRecap.grandTotal.parking} o={weeklyRecap.grandTotal.other} /></td>
                    <td className={cs.num} style={{ color: "var(--brand)" }}>Rp {fmtRp(weeklyRecap.grandTotal.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {viewMode === "wreath" && (
        <>
          <div className={cs.top}>
            <div className={cs.filters}>
              <PeriodSwitch
                value={wreathStatusFilter === "all" ? "all" : wreathStatusFilter === "submitted" ? "week" : "date"}
                onChange={(v) => setWreathStatusFilter(v === "all" ? "all" : v === "week" ? "submitted" : "pending")}
                labels={[en ? "All" : "Semua", en ? "Submitted" : "Sudah diajukan", en ? "Not yet" : "Belum diajukan"]}
              />
            </div>
            <div className={cs.actions}>
              <button className={`${cs.btn} ${cs.btnGreen}`} onClick={handleExportWreaths} disabled={filteredWreaths.length === 0} title={en ? "Export condolence wreath report (CSV)" : "Export laporan karangan bunga (CSV)"}>
                ⬇ {en ? "Export report" : "Export laporan"}
              </button>
              <button className={cs.primary} onClick={openAddWreath}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {en ? "Add wreath" : "Tambah karangan bunga"}
              </button>
            </div>
          </div>
          {loadingWreaths ? (
            <div className={cs.skel}><i /><i /><i /></div>
          ) : filteredWreaths.length === 0 ? (
            <div className={cs.empty}>
              <span className={cs.emptyIc} aria-hidden="true">💐</span>
              <b>{en ? "No wreath records yet" : "Belum ada data karangan bunga"}</b>
              <p>{en ? "Record each condolence wreath so Finance can claim it later." : "Catat tiap karangan bunga duka cita supaya bisa diajukan ke Finance."}</p>
              <button className={cs.primary} onClick={openAddWreath}>{en ? "Add wreath" : "Tambah karangan bunga"}</button>
            </div>
          ) : (
            <div className={cs.list}>
              {filteredWreaths.map((w) => (
                <WreathCard
                  key={w.id}
                  atasNama={w.atasNama}
                  keterangan={w.keterangan}
                  tanggal={w.tanggal}
                  plant={w.plant}
                  claimed={w.claimed}
                  onToggle={() => handleToggleWreathClaimed(w)}
                  onDelete={() => setConfirmDeleteWreath(w)}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={940}>
          <ClaimForm
            lang={lang}
            drivers={driverOptions}
            driverId={formDriverId} setDriverId={setFormDriverId}
            submissionDate={submissionDate} setSubmissionDate={setSubmissionDate}
            periodDate={periodDate} setPeriodDate={setPeriodDate}
            weekLabel={formWeek}
            lines={lines}
            addLine={addLine} removeLine={removeLine} updateLine={updateLine}
            note={note} setNote={setNote}
            grandTotal={grandTotal} canSave={canSave} saving={saving}
            onSave={handleSave} onClose={() => setShowForm(false)}
            evalExpr={evalExpr}
            cancelText={t.actionCancel} savingText={t.actionSaving}
          />
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={380}>
          <div className={`${cs.dialog} ${cs.dialogWarn}`}>
            <div className={cs.warnIc} aria-hidden="true">!</div>
            <h2>{en ? "Delete this claim?" : "Hapus klaim ini?"}</h2>
            <p><b>Rp {fmtRp(confirmDelete.total)}</b> ({confirmDelete.driverName}) {en ? "will be permanently deleted." : "akan dihapus permanen."}</p>
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setConfirmDelete(null)}>{t.actionCancel}</button>
              <button className={cs.danger} onClick={handleDelete}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {showWreathForm && (
        <ModalPortal onOverlayClick={() => setShowWreathForm(false)} maxWidth={460}>
          <div className={cs.dialog}>
            <h2>💐 {en ? "Add condolence wreath" : "Tambah karangan bunga duka cita"}</h2>
            <label className={cs.field}>
              <span>{en ? "Date" : "Tanggal"}</span>
              <input type="date" className={cs.search} value={wreathTanggal} onChange={(e) => setWreathTanggal(e.target.value)} />
            </label>
            <label className={cs.field}>
              <span>{en ? "On behalf of" : "Atas nama"}</span>
              <input className={cs.search} value={wreathAtasNama} onChange={(e) => setWreathAtasNama(e.target.value)} placeholder={en ? "e.g. Bapak Ahmad (father of driver Budi)" : "mis. Bapak Ahmad (ayah dari driver Budi)"} autoFocus />
            </label>
            <label className={cs.field}>
              <span>{en ? "Note" : "Keterangan"} <em style={{ fontStyle: "normal", fontWeight: 600, color: "var(--t3)" }}>{en ? "optional" : "opsional"}</em></span>
              <input className={cs.search} value={wreathKeterangan} onChange={(e) => setWreathKeterangan(e.target.value)} />
            </label>
            <div className={cs.field}>
              <span>{t.fieldPlant}</span>
              <div className={cs.plants} role="radiogroup">
                {OT_PLANTS.map((p) => (
                  <button key={p} role="radio" aria-checked={wreathPlant === p} className={`${cs.plantBtn} ${wreathPlant === p ? cs.plantBtnOn : ""}`} style={{ ["--c" as string]: PLANT_COLOR[p] }} onClick={() => setWreathPlant(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setShowWreathForm(false)}>{t.actionCancel}</button>
              <button className={cs.primary} style={{ height: 44 }} onClick={handleSaveWreath} disabled={!canSaveWreath || savingWreath}>
                {savingWreath ? t.actionSaving : (en ? "Save record" : "Simpan data")}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDeleteWreath && (
        <ModalPortal onOverlayClick={() => setConfirmDeleteWreath(null)} maxWidth={380}>
          <div className={`${cs.dialog} ${cs.dialogWarn}`}>
            <div className={cs.warnIc} aria-hidden="true">!</div>
            <h2>{en ? "Delete this record?" : "Hapus data ini?"}</h2>
            <p><b>{confirmDeleteWreath.atasNama}</b> ({formatDateLabel(confirmDeleteWreath.tanggal)}) {en ? "will be permanently deleted." : "akan dihapus permanen."}</p>
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setConfirmDeleteWreath(null)}>{t.actionCancel}</button>
              <button className={cs.danger} onClick={handleDeleteWreath}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
const OT_PLANTS: Plant[] = ["CIK", "PRB"];
const PLANT_COLOR: Record<Plant, string> = { CIK: "var(--brand)", PRB: "var(--green)" };
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TIER_PALETTE = ["var(--brand)", "var(--green)", "var(--orange)", "var(--red)", "var(--purple)"];

/* ════════════════════════════════════════════════════════════
   LOGIN SCREEN — Admin/GA sign-in via Supabase Auth. Separate from
   the driver PIN system on /driver, which is untouched.
════════════════════════════════════════════════════════════ */
function LoginScreen() {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isMobile = useIsMobile();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) setError(t.loginErrorGeneric);
  }

  const inputStyle: CSSProperties = { paddingLeft: 40 };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* ── Left: decorative brand panel — hidden on mobile ── */}
      {!isMobile && (
        <div
          style={{
            flex: "0 0 44%",
            position: "relative",
            overflow: "hidden",
            background: "var(--grad-hero)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 44px",
          }}
        >
          <div style={{ position: "absolute", top: "-15%", right: "-10%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.14), transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: "-20%", left: "-15%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(23,195,178,0.22), transparent 70%)" }} />
          <div style={{ position: "absolute", top: "38%", left: "48%", width: 260, height: 260, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)" }} />
          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: 48, height: 48 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{t.appName}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Integrated Facility Management</div>
            </div>
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginBottom: 10 }}>
              {lang === "en" ? "One System," : "Satu Sistem,"}
              <br />
              {lang === "en" ? "All Operations in " : "Semua Operasional "}
              <span style={{ background: "linear-gradient(120deg, #5eead4, #a78bfa)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
                {lang === "en" ? "Harmony" : "Selaras"}
              </span>
            </div>
            <div style={{ width: 40, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.4)", marginBottom: 14 }} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", maxWidth: 340 }}>
              {lang === "en"
                ? "Fleet, finance, and facility operations — managed in one integrated ecosystem."
                : "Fleet, finance, dan fasilitas — dikelola dalam satu ekosistem terintegrasi."}
            </div>
          </div>
          <div style={{ position: "relative", zIndex: 1, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            © {new Date().getFullYear()} <span style={{ color: "#5eead4", fontWeight: 700 }}>{t.appName}</span>. All rights reserved.
          </div>
        </div>
      )}

      {/* ── Right: login form panel — floating glass card on dotted bg ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", background: "var(--bg2)" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, var(--border2) 1.3px, transparent 1.3px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 20, position: "relative", zIndex: 1 }}>
          <button
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            className="topbarIconBtn"
            style={{ width: "auto", padding: "0 12px", borderRadius: "var(--pill)", fontWeight: 700, fontSize: 12 }}
          >
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button onClick={toggleTheme} className="topbarIconBtn">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", zIndex: 1 }}>
          <div className="tabContent cardGlass" style={{ width: "100%", maxWidth: 380, padding: "36px 32px" }}>
            <div style={{ textAlign: "center", marginBottom: 26 }}>
              <div className="hexBadge blue" style={{ margin: "0 auto 16px" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>{t.loginTitle}</div>
              <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 4 }}>{t.loginSubtitle}</div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label>{t.loginEmail.toUpperCase()}</label>
                <div style={{ position: "relative" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }}>
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" />
                  </svg>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.formInput} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label>{t.loginPassword.toUpperCase()}</label>
                <div style={{ position: "relative" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }}>
                    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className={styles.formInput} style={{ ...inputStyle, paddingRight: 40 }} />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4, display: "flex" }}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={17} height={17}>
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={17} height={17}>
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {error && (
                <div style={{ padding: 10, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", fontSize: 12.5, marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="neonBtn" disabled={busy} style={{ padding: "12px", fontSize: 14, opacity: busy ? 0.7 : 1 }}>
                {busy ? t.loginSigningIn : t.loginButton}
                {!busy && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <a href="/driver" style={{ fontSize: 12, color: "var(--t3)", textDecoration: "none" }}>
                {t.loginBackToDriver}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverBudgetTab({ myProfile = null }: { myProfile?: MyProfile | null }) {
  const { lang, t } = useLang();
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DriverTier | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(TIER_PALETTE[0]);
  const [formAmount, setFormAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DriverTier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d] = await Promise.all([getDriverTiers(), getDrivers(myProfile?.plantScope ?? null)]);
      setTiers(t);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data tier");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalDrivers = tiers.reduce((s, t) => s + t.activeDriverCount, 0);
  const totalBudget = tiers.reduce((s, t) => s + t.amountPerMonth * t.activeDriverCount, 0);
  const animatedTotalDrivers = useCountUp(totalDrivers);
  const animatedTotalBudget = useCountUp(totalBudget);
  const animatedYearlyBudget = useCountUp(totalBudget * 12);

  const tierColumns: ReportColumn<DriverTier>[] = [
    { key: "name", labelId: "Nama Tier", labelEn: "Tier Name", get: (t) => t.name },
    { key: "count", labelId: "Jumlah Driver Aktif", labelEn: "Active Drivers", get: (t) => t.activeDriverCount, align: "right" },
    { key: "perMonth", labelId: "Nominal per Bulan (Rp)", labelEn: "Amount per Month (Rp)", get: (t) => t.amountPerMonth, align: "right" },
    { key: "totalMonth", labelId: "Total per Bulan (Rp)", labelEn: "Total per Month (Rp)", get: (t) => t.amountPerMonth * t.activeDriverCount, align: "right" },
    { key: "totalYear", labelId: "Total per Tahun (Rp)", labelEn: "Total per Year (Rp)", get: (t) => t.amountPerMonth * t.activeDriverCount * 12, align: "right" },
  ];
  const tierExportPicker = useExportLanguagePicker((format, exportLang) => {
    const opts = {
      rows: tiers, columns: tierColumns, lang: exportLang,
      titleId: "Laporan Tier Uang Operasional Driver", titleEn: "Driver Operational Allowance Tier Report",
      periodLabel: new Date().toLocaleDateString(exportLang === "en" ? "en-US" : "id-ID", { day: "2-digit", month: "long", year: "numeric" }),
      filename: "Laporan_Driver_Budget",
      summaryRows: [
        { label: "Total Driver Aktif / Total Active Drivers", value: totalDrivers },
        { label: "Total Budget per Bulan / Total Monthly Budget (Rp)", value: totalBudget.toLocaleString("id-ID") },
        { label: "Total Budget per Tahun / Total Yearly Budget (Rp)", value: (totalBudget * 12).toLocaleString("id-ID") },
      ],
    };
    if (format === "csv") exportGenericCsv(opts);
    else if (format === "excel") exportGenericExcel(opts);
    else exportGenericPdf(opts);
  });

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormColor(TIER_PALETTE[0]);
    setFormAmount("");
    setShowForm(true);
  }
  function openEdit(t: DriverTier) {
    setEditing(t);
    setFormName(t.name);
    setFormColor(t.color);
    setFormAmount(String(t.amountPerMonth));
    setShowForm(true);
  }

  const canSaveTier = formName.trim() !== "" && !!evalExpr(formAmount);

  async function handleSave() {
    const amount = evalExpr(formAmount);
    if (!formName || !amount) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDriverTier(editing.id, { name: formName, color: formColor, amountPerMonth: amount });
      } else {
        await addDriverTier({ name: formName, color: formColor, amountPerMonth: amount });
      }
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan tier");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteDriverTier(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus tier");
    }
  }

  async function handleAssignTier(driverId: string, tierId: string) {
    try {
      await setDriverTier(driverId, tierId || null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal assign tier");
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div style={{ padding: 20 }}>
      <div className="neonCard" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", position: "relative", zIndex: 1 }}>
            <div className="hexBadge blue small">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
              </svg>
            </div>
            <div><div className="statValue" style={{ fontSize: 20 }}>{animatedTotalDrivers}</div><div className="statLabel">{lang === "en" ? "Total Drivers" : "Total Driver"}</div></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderLeft: "1px solid var(--border2)", position: "relative", zIndex: 1 }}>
            <div className="hexBadge teal small">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
              </svg>
            </div>
            <div><div className="statValue" style={{ fontSize: 20 }}>Rp {fmtRp(animatedTotalBudget)}</div><div className="statLabel">{lang === "en" ? "Budget/Month" : "Budget/Bulan"}</div></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderLeft: "1px solid var(--border2)", position: "relative", zIndex: 1 }}>
            <div className="hexBadge purple small">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            </div>
            <div><div className="statValue" style={{ fontSize: 20 }}>Rp {fmtRp(animatedYearlyBudget)}</div><div className="statLabel">{lang === "en" ? "Per Year" : "Per Tahun"}</div></div>
          </div>
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <ReportExportButtons onExport={tierExportPicker.requestExport} disabled={tiers.length === 0} />
      </div>
      {tierExportPicker.pending && <LanguagePickerModal format={tierExportPicker.pending} onConfirm={tierExportPicker.confirm} onClose={tierExportPicker.cancel} />}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{lang === "en" ? "Operational Allowance Tiers" : "Tier Uang Operasional"}</div>
            <button className="pillBtn" onClick={openAdd} style={{ padding: "6px 14px", fontSize: 12 }}>+ Tambah</button>
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 30, color: "var(--t3)" }}>Memuat...</div>
          ) : tiers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
          ) : (
            tiers.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--bg2)", marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{t.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--t3)" }}>{t.activeDriverCount} driver · Rp {fmtRp(t.amountPerMonth)}/orang</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, color: t.color }}>Rp {fmtRp(t.amountPerMonth * t.activeDriverCount)}</div>
                <button onClick={() => openEdit(t)} style={{ border: "none", background: "none", cursor: "pointer" }}>✏️</button>
                <button onClick={() => setConfirmDelete(t)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--red)" }}>🗑️</button>
              </div>
            ))
          )}
        </div>

        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? "Assign Tier per Driver" : "Assign Tier per Driver"}
          </div>
          <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 14 }}>
            {lang === "en" ? "New — links each driver to their allowance tier." : "Baru — hubungkan tiap driver ke tier uang operasionalnya."}
          </div>
          {drivers.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, fontSize: 12.5, color: "var(--t1)" }}>{d.nama}</div>
              <select
                className={styles.formSelect}
                style={{ width: "auto", fontSize: 13, padding: "6px 10px" }}
                value={d.tier_id || ""}
                onChange={(e) => handleAssignTier(d.id, e.target.value)}
              >
                <option value="">-</option>
                {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={380}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Tier" : "Edit Tier") : (lang === "en" ? "Add Tier" : "Tambah Tier")}</div>
            <div style={{ marginBottom: 12 }}>
              <label>{t.fieldTierName}</label>
              <input className={styles.formInput} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Senior Driver" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>{t.fieldColor}</label>
              <div style={{ display: "flex", gap: 8 }}>
                {TIER_PALETTE.map((c) => (
                  <div key={c} onClick={() => setFormColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: formColor === c ? "2px solid var(--t1)" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>{t.fieldAmountPerPersonMonth}</label>
              <input className={styles.formInput} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="2000000" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSave} disabled={!canSaveTier || saving} style={{ flex: 1, justifyContent: "center", opacity: canSaveTier && !saving ? 1 : 0.5 }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this tier?" : "Hapus tier ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.name}</strong> akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
/** "Prediksi Kebutuhan Minggu Depan" — projects next week's likely
 *  Op Driver claim spend from the last 3 months of Claims history, using
 *  a recency-weighted per-driver average (see weightedWeeklyAverage()).
 *  Built for the "dana belum cair dari Finance" scenario: gives the
 *  admin a defensible number to work from even without waiting on an
 *  actual disbursement. */
function ForecastCard({ plant }: { plant: Plant }) {
  const { lang } = useLang();
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const all = await getClaims(plant);
        if (!cancelled) setClaims(all);
      } catch {
        if (!cancelled) setClaims([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plant]);

  const forecast = useMemo(() => {
    const MONTHS_BACK = 3;
    const buckets = generateWeekBucketSequence(MONTHS_BACK);
    if (buckets.length === 0) return { total: 0, perDriver: [] as { driverId: string; name: string; weekly: number }[], weeksAnalyzed: 0 };

    const cutoff = buckets[0].endDate;
    const recentClaims = claims.filter((c) => {
      const d = new Date(c.periodDate || c.submissionDate);
      return !isNaN(d.getTime()) && d >= cutoff;
    });

    // driverId -> bucketKey -> sum of claim totals
    const byDriver = new Map<string, { name: string; totals: Record<string, number> }>();
    for (const c of recentClaims) {
      const key = claimWeekBucketKey(c.periodDate || c.submissionDate);
      const entry = byDriver.get(c.driver_id) ?? { name: c.driverName, totals: {} };
      entry.totals[key] = (entry.totals[key] ?? 0) + c.total;
      byDriver.set(c.driver_id, entry);
    }

    const perDriver = Array.from(byDriver.entries())
      .map(([driverId, { name, totals }]) => ({
        driverId,
        name,
        weekly: weightedWeeklyAverage(buckets, totals),
      }))
      .filter((d) => d.weekly > 0)
      .sort((a, b) => b.weekly - a.weekly);

    const total = perDriver.reduce((sum, d) => sum + d.weekly, 0);
    return { total, perDriver, weeksAnalyzed: buckets.length };
  }, [claims]);

  const animatedTotal = useCountUp(Math.round(forecast.total));

  return (
    <div className="statPop" style={{ ...cardStyle, padding: 20, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
            🔮 {lang === "en" ? "Next Week Budget Forecast" : "Prediksi Kebutuhan Minggu Depan"}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>
            {lang === "en"
              ? `Recency-weighted average from the last ${forecast.weeksAnalyzed} weeks of Claims history — use this if Finance funds haven't landed yet.`
              : `Rata-rata tertimbang (minggu terbaru lebih berpengaruh) dari ${forecast.weeksAnalyzed} minggu riwayat Claims terakhir — pakai ini kalau dana dari Finance belum cair.`}
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : forecast.perDriver.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12.5 }}>
          {lang === "en" ? "Not enough Claims history yet to forecast." : "Belum cukup riwayat Claims untuk membuat prediksi."}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--mono)", color: "var(--brand)", margin: "10px 0 16px" }}>
            Rp {fmtRp(animatedTotal)}
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t3)", marginLeft: 8 }}>
              / {lang === "en" ? "week" : "minggu"} · {forecast.perDriver.length} {lang === "en" ? "drivers" : "driver"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {forecast.perDriver.map((d, i) => {
              const pct = forecast.total > 0 ? (d.weekly / forecast.total) * 100 : 0;
              return (
                <div key={d.driverId} className="staggerItem" style={{ animationDelay: `${i * 0.04}s` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ color: "var(--t2)", fontWeight: 600 }}>{d.name}</span>
                    <span style={{ color: "var(--t3)", fontFamily: "var(--mono)" }}>Rp {fmtRp(Math.round(d.weekly))}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: "var(--brand)", borderRadius: 3, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function OpFundTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang, t } = useLang();
  const lockedPlant = myProfile?.plantScope ?? null;
  const [viewPlant, setViewPlant] = useState<Plant>(lockedPlant ?? "CIK");

  useEffect(() => {
    if (lockedPlant) setViewPlant(lockedPlant);
  }, [lockedPlant]);

  const [kantong, setKantong] = useState<Kantong | null>(null);
  const [history, setHistory] = useState<Kantong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [gaugeReady, setGaugeReady] = useState(false);

  const [eBudget, setEBudget] = useState("");
  const [eOpDriver, setEOpDriver] = useState("");
  const [eEmergency, setEEmergency] = useState("");
  const [eCash, setECash] = useState("");
  const [eSubmitted, setESubmitted] = useState("");
  const [ePaid, setEPaid] = useState("");
  const [eUnsubmittedClaim, setEUnsubmittedClaim] = useState("");
  const [saving, setSaving] = useState(false);

  // First-time setup — shown only when no kantong row exists yet at all
  // for this plant.
  const [initBudget, setInitBudget] = useState("");
  const [initOpDriver, setInitOpDriver] = useState("");
  const [initEmergency, setInitEmergency] = useState("");
  const [initCash, setInitCash] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (plant: Plant) => {
    setLoading(true);
    setError(null);
    try {
      const k = await getCurrentKantong(plant);
      setKantong(k);
      if (k) {
        setEBudget(String(k.totalBudget));
        setEOpDriver(String(k.allocOpDriver));
        setEEmergency(String(k.allocEmergency));
        setECash(String(k.cashAvailable));
        setESubmitted(String(k.claimSubmitted));
        setEPaid(String(k.claimPaid));
        setEUnsubmittedClaim(String(k.unsubmittedClaim));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat Dana Operasional");
    } finally {
      setLoading(false);
    }
    try {
      setHistory(await getKantongHistory(plant));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    load(viewPlant);
  }, [load, viewPlant]);

  const totalBudgetPre = kantong?.totalBudget ?? 0;
  const outstandingPre = kantong
    ? kantong.allocOpDriver + kantong.allocEmergency + kantong.cashAvailable + kantong.claimSubmitted + kantong.claimPaid + kantong.unsubmittedClaim
    : 0;
  const gapPre = outstandingPre - totalBudgetPre;
  const animatedTotalBudget = useCountUp(totalBudgetPre);
  const animatedOutstanding = useCountUp(outstandingPre);
  const animatedGapAbs = useCountUp(Math.abs(gapPre));

  // ⚠️ Hook laporan ini WAJIB ada di sini (sebelum return awal loading/
  // error/belum-ada-data di bawah) — kalau dipindah ke bawah lagi,
  // jumlah hook yang dipanggil beda antar render dan bikin React error
  // #310 ("Rendered more hooks than during the previous render").
  const kantongColumns: ReportColumn<Kantong>[] = [
    { key: "period", labelId: "Periode", labelEn: "Period", get: (k) => k.period },
    { key: "plant", labelId: "Plant", labelEn: "Plant", get: (k) => k.plant },
    { key: "budget", labelId: "Total Budget (Rp)", labelEn: "Total Budget (Rp)", get: (k) => k.totalBudget, align: "right" },
    { key: "opDriver", labelId: "Alokasi OP Driver (Rp)", labelEn: "OP Driver Allocation (Rp)", get: (k) => k.allocOpDriver, align: "right" },
    { key: "emergency", labelId: "Alokasi Darurat (Rp)", labelEn: "Emergency Allocation (Rp)", get: (k) => k.allocEmergency, align: "right" },
    { key: "cash", labelId: "Kas Tersedia (Rp)", labelEn: "Cash Available (Rp)", get: (k) => k.cashAvailable, align: "right" },
    { key: "submitted", labelId: "Klaim Diajukan (Rp)", labelEn: "Claims Submitted (Rp)", get: (k) => k.claimSubmitted, align: "right" },
    { key: "paid", labelId: "Klaim Dibayar (Rp)", labelEn: "Claims Paid (Rp)", get: (k) => k.claimPaid, align: "right" },
    { key: "unsubmitted", labelId: "Belum Diajukan (Rp)", labelEn: "Not Yet Submitted (Rp)", get: (k) => k.unsubmittedClaim, align: "right" },
  ];
  const opFundExportPicker = useExportLanguagePicker((format, exportLang) => {
    const opts = {
      rows: history, columns: kantongColumns, lang: exportLang,
      titleId: `Laporan Dana Operasional — ${viewPlant}`, titleEn: `Operational Fund Report — ${viewPlant}`,
      periodLabel: history.length > 0 ? `${history[history.length - 1].period} s/d ${history[0].period}` : "-",
      filename: `Laporan_OpFund_${viewPlant}`,
    };
    if (format === "csv") exportGenericCsv(opts);
    else if (format === "excel") exportGenericExcel(opts);
    else exportGenericPdf(opts);
  });

  useEffect(() => {
    if (!loading && kantong) {
      const timer = setTimeout(() => setGaugeReady(true), 80);
      return () => clearTimeout(timer);
    }
    setGaugeReady(false);
  }, [loading, kantong]);

  const inputStyleInit: CSSProperties = {};
  const labelStyleInit: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  const PlantSwitcher = !lockedPlant ? (
    <div style={{ display: "flex", padding: 3, borderRadius: 10, background: "var(--bg2)", border: "1px solid var(--border2)", width: "fit-content", marginBottom: 18 }}>
      {(["CIK", "PRB"] as Plant[]).map((p) => (
        <button
          key={p}
          onClick={() => setViewPlant(p)}
          style={{
            padding: "8px 22px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: viewPlant === p ? "var(--surface)" : "transparent",
            color: viewPlant === p ? "var(--brand)" : "var(--t3)",
            boxShadow: viewPlant === p ? "var(--shadow-sm)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, background: "var(--bg2)", width: "fit-content", marginBottom: 18, fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)" }} />
      {lockedPlant}
      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--t3)" }}>({lang === "en" ? "your plant" : "plant akun ini"})</span>
    </div>
  );

  async function handleCreateInitial() {
    const budget = evalExpr(initBudget);
    if (!budget) return;
    setCreating(true);
    try {
      const now = new Date();
      await createKantong({
        period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        plant: viewPlant,
        totalBudget: budget,
        allocOpDriver: evalExpr(initOpDriver) || 0,
        allocEmergency: evalExpr(initEmergency) || 0,
        cashAvailable: evalExpr(initCash) || 0,
      });
      setInitBudget(""); setInitOpDriver(""); setInitEmergency(""); setInitCash("");
      await load(viewPlant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal membuat data Dana Operasional");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        {PlantSwitcher}
        <SkeletonRows rows={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 20 }}>
        {PlantSwitcher}
        <div style={{ padding: 30, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)" }}>{error}</div>
      </div>
    );
  }

  if (!kantong) {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>{PlantSwitcher}</div>
        <div className="heroGlow" style={{ borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)", padding: 28, width: "100%", maxWidth: 440 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? `Set Up Operational Fund — ${viewPlant}` : `Buat Data Dana Operasional — ${viewPlant}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 20 }}>
            {lang === "en"
              ? `No data yet for ${viewPlant} this period — enter the starting numbers below.`
              : `Belum ada data untuk plant ${viewPlant} periode ini — isi angka awalnya di bawah.`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative", zIndex: 1 }}>
            <div>
              <label className="fLabel" style={labelStyleInit}>{t.fieldTotalCashOp} *</label>
              <input className={styles.formInput} style={inputStyleInit} value={initBudget} onChange={(e) => setInitBudget(e.target.value)} placeholder="48000000" />
            </div>
            <div>
              <label className="fLabel" style={labelStyleInit}>OP DRIVER (A1)</label>
              <input className={styles.formInput} style={inputStyleInit} value={initOpDriver} onChange={(e) => setInitOpDriver(e.target.value)} placeholder="9000000" />
            </div>
            <div>
              <label className="fLabel" style={labelStyleInit}>EMERGENCY (A2)</label>
              <input className={styles.formInput} style={inputStyleInit} value={initEmergency} onChange={(e) => setInitEmergency(e.target.value)} placeholder="1500000" />
            </div>
            <div>
              <label className="fLabel" style={labelStyleInit}>CASH AVAILABLE (A4)</label>
              <input className={styles.formInput} style={inputStyleInit} value={initCash} onChange={(e) => setInitCash(e.target.value)} placeholder="20000000" />
            </div>
          </div>
          <button
            className="pillBtn"
            onClick={handleCreateInitial}
            disabled={!evalExpr(initBudget) || creating}
            style={{ width: "100%", justifyContent: "center", marginTop: 20, opacity: evalExpr(initBudget) && !creating ? 1 : 0.5 }}
          >
            {creating ? t.actionSaving : (lang === "en" ? "Create" : "Buat Data")}
          </button>
        </div>
      </div>
    );
  }

  const totalAlokasi = kantong.allocOpDriver + kantong.allocEmergency;
  const outstanding = totalAlokasi + kantong.cashAvailable + kantong.claimSubmitted + kantong.claimPaid + kantong.unsubmittedClaim;
  const gap = outstanding - kantong.totalBudget;
  const gapColor = gap === 0 ? "var(--green)" : gap > 0 ? "var(--orange)" : "var(--red)";
  const gapText = gap === 0 ? "Sesuai" : gap > 0 ? "Outstanding melebihi total cash" : "Outstanding di bawah total cash";

  async function handleSaveEdit() {
    if (!kantong) return;
    setSaving(true);
    try {
      const updated = {
        period: kantong.period,
        plant: viewPlant,
        totalBudget: evalExpr(eBudget) ?? kantong.totalBudget,
        allocOpDriver: evalExpr(eOpDriver) ?? kantong.allocOpDriver,
        allocEmergency: evalExpr(eEmergency) ?? kantong.allocEmergency,
        cashAvailable: evalExpr(eCash) ?? kantong.cashAvailable,
        claimSubmitted: evalExpr(eSubmitted) ?? kantong.claimSubmitted,
        claimPaid: evalExpr(ePaid) ?? kantong.claimPaid,
        unsubmittedClaim: evalExpr(eUnsubmittedClaim) ?? kantong.unsubmittedClaim,
        lastReset: kantong.lastReset,
      };
      await updateKantongBudget(updated);
      setShowEdit(false);
      await load(viewPlant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!kantong) return;
    const now = new Date();
    const newPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      await resetKantong(viewPlant, newPeriod, toLocalISODate(now));
      setShowResetConfirm(false);
      await load(viewPlant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal reset periode");
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  const composition = [
    { label: "Op Driver (A1)", value: kantong.allocOpDriver, color: "var(--orange)" },
    { label: "Emergency (A2)", value: kantong.allocEmergency, color: "var(--red)" },
    { label: "Cash Available (A4)", value: kantong.cashAvailable, color: "var(--green)" },
    { label: lang === "en" ? "Claim Submitted (A5)" : "Klaim Diajukan (A5)", value: kantong.claimSubmitted, color: "var(--brand)" },
    { label: lang === "en" ? "Claim Paid (A6)" : "Klaim Dibayar (A6)", value: kantong.claimPaid, color: "var(--purple)" },
    { label: lang === "en" ? "Unsubmitted Claim (A7)" : "Klaim Belum Diajukan (A7)", value: kantong.unsubmittedClaim, color: "var(--gold2)" },
  ];

  const fundHealthPct = kantong.totalBudget > 0
    ? Math.max(0, 100 - Math.min(100, (Math.abs(gap) / kantong.totalBudget) * 100))
    : 100;
  const healthColor = fundHealthPct >= 90 ? "var(--green)" : fundHealthPct >= 70 ? "var(--brand)" : fundHealthPct >= 50 ? "var(--orange)" : "var(--red)";
  const RG = 52, CIRCG = 2 * Math.PI * RG;
  const gaugeOffset = CIRCG * (1 - fundHealthPct / 100);

  const trendData = history.map((h) => ({
    period: h.period,
gap: h.allocOpDriver + h.allocEmergency + h.cashAvailable + h.claimSubmitted + h.claimPaid + h.unsubmittedClaim - h.totalBudget,
  }));
  const chartW = 640, chartH = 140, chartPad = 30;
  const maxAbsGap = Math.max(...trendData.map((d) => Math.abs(d.gap)), 1);
  const midY = chartH / 2;
  const trendPoints = trendData.map((d, i) => {
    const x = chartPad + (trendData.length > 1 ? (i / (trendData.length - 1)) * (chartW - chartPad * 2) : 0);
    const y = midY - (d.gap / maxAbsGap) * (midY - chartPad / 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div style={{ padding: 20 }}>
      {PlantSwitcher}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--t3)" }}>
          {lang === "en" ? "Period" : "Periode"}: <strong style={{ color: "var(--t1)" }}>{kantong.period}</strong> · Reset: {kantong.lastReset}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowEdit(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✏️ {lang === "en" ? "Edit Values" : "Edit Nilai"}
          </button>
          <button onClick={() => setShowResetConfirm(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            🔄 {lang === "en" ? "Reset Period" : "Reset Periode"}
          </button>
          <ReportExportButtons onExport={opFundExportPicker.requestExport} disabled={history.length === 0} />
        </div>
      </div>
      {opFundExportPicker.pending && <LanguagePickerModal format={opFundExportPicker.pending} onConfirm={opFundExportPicker.confirm} onClose={opFundExportPicker.cancel} />}

      <div className="heroGlow statPop" style={{ borderRadius: "var(--r3)", boxShadow: "var(--shadow-lg)", padding: "24px 26px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: healthColor, display: "inline-block" }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1, color: "var(--t3)", textTransform: "uppercase" }}>
            💰 {lang === "en" ? `Operational Fund Health — ${viewPlant}` : `Kesehatan Dana Operasional — ${viewPlant}`}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg viewBox="0 0 120 120" width={104} height={104}>
              <defs>
                <linearGradient id="fundGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--brand)" />
                  <stop offset="100%" stopColor="var(--gold)" />
                </linearGradient>
              </defs>
              <circle cx={60} cy={60} r={RG} fill="none" stroke="var(--border)" strokeWidth={8} />
              <circle className="gaugeAnimated" cx={60} cy={60} r={RG} fill="none" stroke="url(#fundGrad)" strokeWidth={8} strokeLinecap="round" strokeDasharray={CIRCG} strokeDashoffset={gaugeReady ? gaugeOffset : CIRCG} transform="rotate(-90 60 60)" />
              <text x={60} y={57} textAnchor="middle" fontSize={22} fontWeight={800} fill="url(#fundGrad)" fontFamily="var(--mono)">{Math.round(fundHealthPct)}</text>
              <text x={60} y={72} textAnchor="middle" fontSize={9.5} fill="var(--t3)">/ 100</text>
            </svg>
            <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: healthColor }}>{gapText}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
            <div style={{ padding: "0 16px", borderLeft: "none" }}>
              <div className="numGrad" style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--mono)" }}>Rp {fmtRp(animatedTotalBudget)}</div>
              <div style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600, marginTop: 3 }}>Total Cash Operational (A)</div>
            </div>
            <div style={{ padding: "0 16px", borderLeft: "1px solid var(--border2)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--mono)", color: "var(--gold2)" }}>Rp {fmtRp(animatedOutstanding)}</div>
              <div style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600, marginTop: 3 }}>Outstanding (B)</div>
            </div>
            <div style={{ padding: "0 16px", borderLeft: "1px solid var(--border2)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--mono)", color: gapColor }}>{gap >= 0 ? "+" : "−"}Rp {fmtRp(animatedGapAbs)}</div>
              <div style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600, marginTop: 3 }}>GAP = B − A</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? "Budget Composition" : "Komposisi Cash"}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16 }}>
            {lang === "en" ? "Each segment relative to Total Cash Operational" : "Tiap segmen relatif terhadap Total Cash Operational"}
          </div>
          {composition.map((c, i) => {
            const pct = kantong.totalBudget > 0 ? (c.value / kantong.totalBudget) * 100 : 0;
            return (
              <div key={c.label} className="staggerItem" style={{ marginBottom: i === composition.length - 1 ? 0 : 12, animationDelay: `${i * 0.05}s` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--t2)", fontWeight: 600 }}>{c.label}</span>
                  <span style={{ color: "var(--t3)" }}>Rp {fmtRp(c.value)} · {pct.toFixed(0)}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: c.color, borderRadius: 4, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="statPop" style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? "Gap Trend by Period" : "Tren Gap per Periode"}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16 }}>
            {lang === "en" ? "Positive = over budget, negative = under" : "Positif = melebihi budget, negatif = di bawah"}
          </div>
          {trendData.length < 2 ? (
            <div style={{ fontSize: 12.5, color: "var(--t3)", padding: "20px 0", textAlign: "center" }}>
              {lang === "en" ? "Not enough periods yet for a trend." : "Belum cukup periode untuk membuat tren."}
            </div>
          ) : (
            <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH}>
              <line x1={chartPad} x2={chartW - chartPad} y1={midY} y2={midY} stroke="var(--border2)" strokeWidth={1} strokeDasharray="4 4" />
              <polyline points={trendPoints} fill="none" stroke={gap >= 0 ? "var(--orange)" : "var(--brand)"} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {trendData.map((d, i) => {
                const x = chartPad + (trendData.length > 1 ? (i / (trendData.length - 1)) * (chartW - chartPad * 2) : 0);
                return (
                  <text key={d.period} x={x} y={chartH - 6} textAnchor="middle" fontSize={9.5} fill="var(--t3)">
                    {d.period.slice(2)}
                  </text>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      <ForecastCard plant={viewPlant} />

      {showEdit && (
        <ModalPortal onOverlayClick={() => setShowEdit(false)} maxWidth={420}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>Edit Dana Operasional — {viewPlant}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label>{t.fieldTotalCashOp}</label><input className={styles.formInput} value={eBudget} onChange={(e) => setEBudget(e.target.value)} /></div>
              <div><label>OP DRIVER (A1)</label><input className={styles.formInput} value={eOpDriver} onChange={(e) => setEOpDriver(e.target.value)} /></div>
              <div><label>EMERGENCY (A2)</label><input className={styles.formInput} value={eEmergency} onChange={(e) => setEEmergency(e.target.value)} /></div>
              <div><label>CASH AVAILABLE (A4)</label><input className={styles.formInput} value={eCash} onChange={(e) => setECash(e.target.value)} /></div>
              <div><label>{lang === "en" ? "CLAIM SUBMITTED (A5)" : "CLAIM DIAJUKAN (A5)"}</label><input className={styles.formInput} value={eSubmitted} onChange={(e) => setESubmitted(e.target.value)} /></div>
             <div><label>{lang === "en" ? "CLAIM PAID (A6)" : "CLAIM DIBAYAR (A6)"}</label><input className={styles.formInput} value={ePaid} onChange={(e) => setEPaid(e.target.value)} /></div>
              <div><label>{lang === "en" ? "UNSUBMITTED CLAIM (A7)" : "KLAIM BELUM DIAJUKAN (A7)"}</label><input className={styles.formInput} value={eUnsubmittedClaim} onChange={(e) => setEUnsubmittedClaim(e.target.value)} placeholder="0" /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowEdit(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSaveEdit} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {showResetConfirm && (
        <ModalPortal onOverlayClick={() => setShowResetConfirm(false)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔄</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>Reset Periode — {viewPlant}?</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              Claim Diajukan (A5) dan Claim Dibayar (A6) akan direset ke 0 untuk periode baru. Total cash dan alokasi tetap sama. Data periode lama tetap tersimpan.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleReset} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Ya, Reset</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
const FUEL_TYPES_LIST = ["Pertalite", "Pertamax", "Pertamax Turbo", "Pertamax Green", "Solar", "Dexlite"];

/* ── REPORTS TAB — comprehensive report merging Tasks (Penugasan Driver),
   Claims, Overtime, Vehicles, Dana Operasional, and Driver Budget.
   Filterable by month / date range / year. Nothing is computed until the
   user explicitly clicks "Generate Laporan". ── */
function ReportsTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang } = useLang();
  const months = lang === "en" ? MONTHS_EN : MONTHS_ID;
  const now = new Date();

  const [loadingMaster, setLoadingMaster] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allClaims, setAllClaims] = useState<Claim[]>([]);
  const [allOvertimes, setAllOvertimes] = useState<Overtime[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [kantongCik, setKantongCik] = useState<Kantong | null>(null);
  const [kantongPrb, setKantongPrb] = useState<Kantong | null>(null);
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  const [mode, setMode] = useState<"month" | "range" | "year">("month");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return toLocalISODate(d);
  });
  const [dateTo, setDateTo] = useState(toLocalISODate(now));

  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<FleetReportData | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [reportLabel, setReportLabel] = useState("");

  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Master data (claims/overtime/vehicles/kantong/tiers/drivers) loads once
  // up front — it's cheap and shared across every period the user might
  // pick. Tasks are fetched per-period on demand (see handleGenerate),
  // since they're queried by date range server-side.
  const loadMaster = useCallback(async () => {
    setError(null);
    try {
      const [c, ot, v, kCik, kPrb, t, d] = await Promise.all([
        getClaims(myProfile?.plantScope ?? null),
        Promise.resolve([] as Overtime[]), // modul Overtime dinonaktifkan
        getAllVehiclesFull(),
        getCurrentKantong("CIK"),
        getCurrentKantong("PRB"),
        getDriverTiers(),
        getDrivers(myProfile?.plantScope ?? null),
      ]);
      setAllClaims(c);
      setAllOvertimes(ot);
      setVehicles(v);
      setKantongCik(kCik);
      setKantongPrb(kPrb);
      setTiers(t);
      setDrivers(d);
      return { c, ot, v, kCik, kPrb, t };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data master laporan");
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingMaster(true);
      await loadMaster();
      setLoadingMaster(false);
    })();
  }, [loadMaster]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      // Refresh dulu semua data master supaya laporan tidak pakai data basi.
      const fresh = await loadMaster();
      if (!fresh) { setGenerating(false); return; }
      const { c: freshClaims, ot: freshOt, v: freshVehicles, kCik: freshKCik, kPrb: freshKPrb, t: freshTiers } = fresh;
      const myKantongForReport = myProfile?.plantScope === "PRB" ? freshKPrb : freshKCik;

      const period: ReportPeriod = { mode, month, year, dateFrom, dateTo };
      const { from, to } = getPeriodDateRange(period);
      const tasks = await getTasksByRange(from, to, myProfile?.plantScope ?? null);

      const data = buildFleetReportData(period, freshClaims, freshOt, freshVehicles, myKantongForReport, freshTiers, tasks);
      // Previous-period data, for trend insights — silently skipped if it
      // fails (trend is a nice-to-have, not worth blocking the report).
      let prevData: FleetReportData | null = null;
      try {
        const prevPeriod = getPreviousPeriod(period);
        const prevRange = getPeriodDateRange(prevPeriod);
        const prevTasks = await getTasksByRange(prevRange.from, prevRange.to, myProfile?.plantScope ?? null);
        prevData = buildFleetReportData(prevPeriod, freshClaims, freshOt, freshVehicles, myKantongForReport, freshTiers, prevTasks);
      } catch {
        prevData = null;
      }

      setReportData(data);
      setInsights(buildInsights(data, prevData, drivers, lang));
      setReportLabel(periodLabel(period, months));
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat laporan");
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportCsv() {
    if (!reportData) return;
    setExportingCsv(true);
    try {
      exportFleetReportToCsv(reportData, months, insights);
    } finally {
      setExportingCsv(false);
    }
  }
  async function handleExportPdf() {
    if (!reportData) return;
    setExportingPdf(true);
    try {
      await exportFleetReportToPdf(reportData, months, insights);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal membuat PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const inputStyle: CSSProperties = {};

  // ── Derived views of reportData (only meaningful once generated) ──
  const totalClaims = reportData?.claims.reduce((s, c) => s + c.total, 0) ?? 0;
  const totalOtHours = reportData?.overtimes.reduce((s, o) => s + o.hours, 0) ?? 0;
  const totalOtAmount = reportData?.overtimes.reduce((s, o) => s + o.amount, 0) ?? 0;
  const activeVehicles = vehicles.filter((v) => v.aktif).length;

  const taskStats = useMemo(() => {
    if (!reportData) return null;
    return computeStats(reportData.tasks);
  }, [reportData]);
  const taskCompletionRate = useMemo(() => {
    if (!reportData || reportData.tasks.length === 0) return 0;
    const nonCancelled = reportData.tasks.length - (taskStats?.cancelled ?? 0);
    return nonCancelled > 0 ? ((taskStats?.done ?? 0) / nonCancelled) * 100 : 0;
  }, [reportData, taskStats]);

  const byType = useMemo(() => {
    if (!reportData) return [];
    const map = new Map<string, number>();
    reportData.claims.forEach((c) => c.items.forEach((i) => map.set(i.type, (map.get(i.type) || 0) + i.total)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [reportData]);

  const byDriverClaim = useMemo(() => {
    if (!reportData) return [];
    const map = new Map<string, number>();
    reportData.claims.forEach((c) => map.set(c.driverName, (map.get(c.driverName) || 0) + c.total));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [reportData]);

  const otByPlant = useMemo(() => {
    if (!reportData) return [];
    return OT_PLANTS.map((p) => ({
      plant: p,
      hours: reportData.overtimes.filter((o) => o.plant === p).reduce((s, o) => s + o.hours, 0),
      amount: reportData.overtimes.filter((o) => o.plant === p).reduce((s, o) => s + o.amount, 0),
    }));
  }, [reportData]);

  const byDriverTask = useMemo(() => {
    if (!reportData) return [];
    const map = new Map<string, { total: number; done: number }>();
    reportData.tasks.forEach((t) => {
      const name = t.driver_nama || "-";
      const cur = map.get(name) || { total: 0, done: 0 };
      cur.total += 1;
      if (t.status === "DONE") cur.done += 1;
      map.set(name, cur);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  }, [reportData]);

  if (loadingMaster) return <div style={{ padding: 60, textAlign: "center", color: "var(--t3)" }}>Memuat...</div>;

  return (
    <div style={{ padding: 20 }}>
      {/* ── Filter bar ── */}
      <div className="statPop" style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["month", "range", "year"] as const).map((m) => (
            <button
              key={m}
              className="tabPill"
              onClick={() => { setMode(m); setGenerated(false); }}
              style={{
                padding: "7px 16px",
                borderRadius: "var(--pill)",
                border: mode === m ? "none" : "1px solid var(--border2)",
                background: mode === m ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent",
                color: mode === m ? "#fff" : "var(--t2)",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {m === "month" ? (lang === "en" ? "Monthly" : "Per Bulan") : m === "range" ? (lang === "en" ? "Date Range" : "Per Tanggal") : (lang === "en" ? "Yearly" : "Per Tahun")}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {mode === "month" && (
            <>
              <select className={styles.formSelect} style={{ ...inputStyle, width: "auto" }} value={month} onChange={(e) => { setMonth(Number(e.target.value)); setGenerated(false); }}>
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className={styles.formSelect} style={{ ...inputStyle, width: "auto" }} value={year} onChange={(e) => { setYear(Number(e.target.value)); setGenerated(false); }}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
          {mode === "range" && (
            <>
              <input className={styles.formInput} style={{ ...inputStyle, width: "auto" }} type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setGenerated(false); }} />
              <span style={{ color: "var(--t3)" }}>s/d</span>
              <input className={styles.formInput} style={{ ...inputStyle, width: "auto" }} type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setGenerated(false); }} />
            </>
          )}
          {mode === "year" && (
            <select className={styles.formSelect} style={{ ...inputStyle, width: "auto" }} value={year} onChange={(e) => { setYear(Number(e.target.value)); setGenerated(false); }}>
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}

          <div style={{ flex: 1 }} />

          <button className="pillBtn" onClick={handleGenerate} disabled={generating}>
            📊 {generating ? (lang === "en" ? "Generating..." : "Membuat...") : (lang === "en" ? "Generate Report" : "Generate Laporan")}
          </button>

          {generated && (
            <>
              <button
                onClick={handleExportCsv}
                disabled={exportingCsv}
                style={{ padding: "9px 16px", borderRadius: "var(--pill)", border: "1px solid var(--green)", background: "var(--green-soft)", color: "var(--green)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                ⬇ {exportingCsv ? "..." : "CSV"}
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                style={{ padding: "9px 16px", borderRadius: "var(--pill)", border: "1px solid var(--brand)", background: "rgba(0,174,239,0.1)", color: "var(--brand)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                ⬇ {exportingPdf ? "..." : "PDF"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {!generated ? (
        <div className="heroGlow" style={{ borderRadius: "var(--r2)", padding: 50, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📈</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? "Pick a period, then click Generate Report" : "Pilih periode lalu klik Generate Laporan"}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>
            {lang === "en"
              ? "Combines Task Assignment, Claims, Vehicles, and Operational Fund into one report."
              : "Menggabungkan Penugasan Driver, Klaim, Armada, dan Dana Operasional jadi satu laporan."}
          </div>
        </div>
      ) : (
        <div className="tabContent">
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16 }}>
            {lang === "en" ? "Showing report for" : "Menampilkan laporan untuk"}: <strong style={{ color: "var(--t1)" }}>{reportLabel}</strong>
          </div>

          {/* ── Summary stat cards (now includes Tasks) ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 18 }}>
            {[
              { label: lang === "en" ? "Tasks Completed" : "Tugas Selesai", value: `${taskCompletionRate.toFixed(0)}%`, color: "var(--green)" },
              { label: lang === "en" ? "Total Claims" : "Total Klaim", value: `Rp ${fmtRp(totalClaims)}`, color: "var(--brand)" },
              { label: lang === "en" ? "OT Hours" : "Jam OT", value: `${fmtRp(totalOtHours)} jam`, color: "var(--gold2)" },
              { label: lang === "en" ? "OT Amount" : "Nominal OT", value: `Rp ${fmtRp(totalOtAmount)}`, color: "var(--gold2)" },
              { label: lang === "en" ? "Active Vehicles" : "Kendaraan Aktif", value: `${activeVehicles}/${vehicles.length}`, color: "var(--green)" },
              { label: lang === "en" ? "Total Entries" : "Total Entri", value: String((reportData?.claims.length ?? 0) + (reportData?.overtimes.length ?? 0) + (reportData?.tasks.length ?? 0)), color: "var(--t1)" },
            ].map((s, i) => (
              <div key={i} className="statPop" style={{ ...cardStyle, padding: 14, textAlign: "center", animationDelay: `${i * 0.05}s` }}>
                <div className="numGrad" style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--mono)" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Insights — the whole point of the request: valuable, textual
              analysis for management, not just raw numbers. ── */}
          <div className="statPop" style={{ ...cardStyle, borderLeft: "3px solid var(--gold)", padding: "16px 20px", marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 12 }}>
              💡 {lang === "en" ? "Insights & Analysis for Management" : "Insight & Analisa untuk Manajemen"}
            </div>
            {insights.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t3)" }}>
                {lang === "en" ? "Not enough data in this period to generate insights." : "Data pada periode ini belum cukup untuk membuat insight."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {insights.map((ins, i) => (
                  <div key={i} className="staggerItem" style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "var(--t2)", lineHeight: 1.5, animationDelay: `${i * 0.06}s` }}>
                    <span style={{ flexShrink: 0, marginTop: 6, width: 5, height: 5, borderRadius: "50%", background: "var(--gold)" }} />
                    <span>{ins}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Task Assignment summary (merged) ── */}
          {reportData && reportData.tasks.length > 0 && (
            <div className="statPop" style={{ ...cardStyle, overflow: "hidden", marginBottom: 18 }}>
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
                🗂️ {lang === "en" ? "Task Assignment Summary" : "Ringkasan Penugasan Driver"}
              </div>
              <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 12, borderBottom: "1px solid var(--border)" }}>
                {[
                  { label: lang === "en" ? "New" : "Baru", value: taskStats?.assigned ?? 0, color: "var(--orange)" },
                  { label: lang === "en" ? "Ongoing" : "Berlangsung", value: taskStats?.ongoing ?? 0, color: "var(--brand)" },
                  { label: lang === "en" ? "Done" : "Selesai", value: taskStats?.done ?? 0, color: "var(--green)" },
                  { label: lang === "en" ? "Cancelled" : "Dibatalkan", value: taskStats?.cancelled ?? 0, color: "var(--red)" },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: "var(--t3)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 8 }}>
                {byDriverTask.map(([name, v], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 12.5, color: "var(--t1)" }}>{name}</div>
                    <div style={{ fontSize: 13.5, color: "var(--t3)" }}>{v.done}/{v.total} {lang === "en" ? "done" : "selesai"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
                🧾 {lang === "en" ? "Claims by Type" : "Klaim per Jenis"}
              </div>
              {byType.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>-</div>
              ) : (
                <div style={{ padding: 16 }}>
                  {byType.map(([type, total]) => {
                    const max = byType[0][1] || 1;
                    return (
                      <div key={type} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: "var(--t2)" }}>{type}</span>
                          <span style={{ fontWeight: 700, color: "var(--t1)" }}>Rp {fmtRp(total)}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(total / max) * 100}%`, background: CLAIM_TYPE_COLOR[type] || "var(--brand)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
              🏆 {lang === "en" ? "Top Drivers by Claim Amount" : "Driver Terbanyak Klaim"}
            </div>
            {byDriverClaim.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
                {lang === "en" ? "No claim data for this period." : "Tidak ada data klaim pada periode ini."}
              </div>
            ) : (
              byDriverClaim.map(([name, total], i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12.5, color: "var(--t1)" }}>{name}</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--t1)" }}>Rp {fmtRp(total)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GasStationsTab() {
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
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{lang === "en" ? "Gas Stations" : "Pom Bensin"}</div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>
            {new Date().toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
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
      </div>

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
    </div>
  );
}

/* ── VEHICLES TAB — full CRUD, ported from FleetOS ── */

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

function VehiclesTab({ myProfile }: { myProfile: MyProfile | null }) {
  const isAdmin = myProfile?.role === "admin";
  const { lang, t } = useLang();
  const [viewMode, setViewMode] = useState<"list" | "gatelog">("list");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormState>(BLANK_VEHICLE_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Gate Log ──
  const [gateLogs, setGateLogs] = useState<VehicleGateLog[]>([]);
  const [loadingGateLogs, setLoadingGateLogs] = useState(false);
  const [gatePlantFilter, setGatePlantFilter] = useState<"all" | Plant>("all");
  const [gateDateFrom, setGateDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [gateDateTo, setGateDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirmDeleteGateLog, setConfirmDeleteGateLog] = useState<VehicleGateLog | null>(null);
  const [busyGateLogId, setBusyGateLogId] = useState<string | null>(null);

  const loadGateLogs = useCallback(async () => {
    setLoadingGateLogs(true);
    try {
      const logs = await getVehicleGateLogs({
        plant: gatePlantFilter === "all" ? null : gatePlantFilter,
        dateFrom: gateDateFrom,
        dateTo: gateDateTo,
      });
      setGateLogs(logs);
    } catch (e) {
      console.warn("Gagal memuat gate log:", e);
    } finally {
      setLoadingGateLogs(false);
    }
  }, [gatePlantFilter, gateDateFrom, gateDateTo]);

  useEffect(() => {
    if (viewMode === "gatelog") loadGateLogs();
  }, [viewMode, loadGateLogs]);

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
  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--t2)",
    marginBottom: 5,
    display: "block",
  };

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setViewMode("list")}
            style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: viewMode === "list" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: viewMode === "list" ? "#fff" : "var(--t2)" }}
          >
            {lang === "en" ? "Vehicle Fleet" : "Armada Kendaraan"}
          </button>
          {!isPrbOnly(myProfile) && <button
            onClick={() => setViewMode("gatelog")}
            style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: viewMode === "gatelog" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: viewMode === "gatelog" ? "#fff" : "var(--t2)" }}
          >
            🚧 Gate Log
          </button>}
        </div>
        {viewMode === "list" && (
          <button className="pillBtn" onClick={openAdd}>
            + {lang === "en" ? "Add Vehicle" : "Tambah Kendaraan"}
          </button>
        )}
      </div>

      {viewMode === "gatelog" && (
        <GateLogPanel
          logs={gateLogs}
          loading={loadingGateLogs}
          dateFrom={gateDateFrom}
          dateTo={gateDateTo}
          onDateFrom={setGateDateFrom}
          onDateTo={setGateDateTo}
          onQuickRange={(days) => {
            const d = new Date(); const from = new Date(); from.setDate(d.getDate() - days);
            setGateDateFrom(from.toISOString().slice(0, 10)); setGateDateTo(d.toISOString().slice(0, 10));
          }}
          plant={gatePlantFilter}
          onPlant={setGatePlantFilter}
          busyId={busyGateLogId}
          onForceClose={handleForceCloseGateLog}
          onDelete={setConfirmDeleteGateLog}
          onExport={() => exportGateLogsToCsv(gateLogs)}
        />
      )}

      <div style={{ display: viewMode === "list" ? "block" : "none" }}>
      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "var(--red-soft)",
            color: "var(--red)",
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          {lang === "en" ? "Loading vehicles..." : "Memuat kendaraan..."}
        </div>
      ) : vehicles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          {lang === "en" ? "No vehicles yet." : "Belum ada kendaraan."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          {vehicles.map((v) => {
            return (
              <div key={v.id} className="statPop" style={{ ...cardStyle, padding: 16, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    borderRadius: "var(--r2) 0 0 var(--r2)",
                    background: v.aktif ? "var(--green)" : "var(--orange)",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                   <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
     <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "var(--t1)" }}>
      {v.nopol}
    </span>
    <span
      style={{
       fontSize: 9.5, fontWeight: 800, padding: "1px 7px", borderRadius: 6,
       background: "var(--bg2)", color: PLANT_COLOR[v.plant || "CIK"], border: `1px solid ${PLANT_COLOR[v.plant || "CIK"]}33`,
     }}
   >
      {v.plant || "CIK"}
    </span>
  </div>
                    <div style={{ fontSize: 13, color: "var(--t3)" }}>
                      {v.jenis} · {v.year}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "var(--pill)",
                      background: v.aktif ? "var(--green-soft)" : "var(--orange-soft)",
                      color: v.aktif ? "var(--green)" : "var(--orange)",
                      height: "fit-content",
                    }}
                  >
                    {v.aktif ? (lang === "en" ? "Active" : "Aktif") : (lang === "en" ? "Maintenance" : "Maintenance")}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, fontSize: 12 }}>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>Driver</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{driverName(v.default_driver_id)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>{lang === "en" ? "Dept" : "Departemen"}</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{v.dept || "-"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>BBM</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{v.fuel || "-"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>Odometer</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{fmtRp(v.odometer || 0)} km</div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 12 }}>
                  {([ ["KIR", v.kir_date], ["Service", v.service_date], ["STNK", v.stnk_date] ] as [string, string | null | undefined][]).map(([label, lastDate]) => {
                    const docType = label as "KIR" | "STNK" | "Service";
                    const { next, nextEarly } = nextDocDate(docType, lastDate);
                    // Hari menuju next date (pakai nextEarly dulu kalau ada — Service 3 bulan)
                    const daysToNext = daysUntil(next);
                    const daysToEarly = nextEarly ? daysUntil(nextEarly) : null;
                    // Warna: pakai countdown yang paling dekat
                    const effectiveDays = daysToEarly !== null && daysToEarly <= 0
                      ? daysToNext   // early sudah lewat → pakai countdown ke batas akhir
                      : daysToEarly !== null
                      ? daysToEarly  // Service dalam window 3-6 bulan → warnai dari early
                      : daysToNext;
                    const fmtDate = (ds: string) =>
                      new Date(ds).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric" });
                    const intervalLabel = docType === "KIR" ? "(6 bln)" : docType === "STNK" ? "(1 thn)" : "(3–6 bln)";
                    return (
                      <div key={label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                          <span style={{ color: "var(--t3)", fontWeight: 600 }}>{label} <span style={{ fontSize: 10, fontWeight: 400 }}>{intervalLabel}</span></span>
                          {next ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: `${urgencyColor(effectiveDays)}18`, color: urgencyColor(effectiveDays) }}>
                              {daysToNext <= 0 ? (lang === "en" ? "Overdue" : "Lewat") : `${daysToNext}h`}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--t3)" }}>—</span>
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                          <span style={{ color: "var(--t3)" }}>
                            {lang === "en" ? "Last:" : "Terakhir:"} {lastDate ? fmtDate(lastDate) : "—"}
                          </span>
                          <span style={{ color: next ? urgencyColor(effectiveDays) : "var(--t3)", fontWeight: next ? 600 : 400 }}>
                            {next
                              ? `${lang === "en" ? "Due:" : "Jatuh:"} ${fmtDate(next)}`
                              : (lang === "en" ? "Not set" : "Belum diisi")}
                          </span>
                        </div>
                        {/* Service: tampilkan juga reminder 3 bulan kalau belum lewat */}
                        {nextEarly && daysToEarly !== null && daysToEarly > 0 && (
                          <div style={{ fontSize: 10.5, color: "var(--orange)", marginTop: 2, textAlign: "right" }}>
                            ⚡ {lang === "en" ? "Early reminder:" : "Reminder awal:"} {fmtDate(nextEarly)} ({daysToEarly}h)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openEdit(v)}
                    style={{
                      flex: 1,
                      padding: "7px",
                      borderRadius: 8,
                      border: "1px solid var(--border2)",
                      background: "var(--surface2)",
                      color: "var(--t2)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ {t.actionEdit}
                  </button>
                  {isAdmin && (
                  <button
                    onClick={() => setConfirmDelete(v)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--red)",
                      background: "var(--red-soft)",
                      color: "var(--red)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                   )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

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
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PRINTER MANAGEMENT — dashboard jumlah printer (berwarna/hitam-
   putih), daftar printer dengan link Control Panel, dan pencatatan
   permintaan karyawan (Reset Kuota, Tambah Kuota, Pengambilan
   Toner) yang diinput admin.
════════════════════════════════════════════════════════════ */

const PRINTER_REQUEST_LABELS: Record<PrinterRequestType, string> = {
  RESET_KUOTA: "Reset Kuota",
  TAMBAH_KUOTA: "Tambah Kuota",
  AMBIL_TONER: "Pengambilan Toner",
};

function PrinterTab() {
  const { lang, t } = useLang();
  const [viewMode, setViewMode] = useState<"list" | "requests">("list");
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  // ── Printers ──
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [showPrinterForm, setShowPrinterForm] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  const [confirmDeletePrinter, setConfirmDeletePrinter] = useState<Printer | null>(null);
  const [savingPrinter, setSavingPrinter] = useState(false);

  const [formNoEq, setFormNoEq] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formType, setFormType] = useState<"COLOR" | "BW">("BW");
  const [formUrl, setFormUrl] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formAktif, setFormAktif] = useState(true);

  const loadPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      setPrinters(await getPrinters());
    } catch (e) {
      console.warn("Gagal memuat printer:", e);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => { loadPrinters(); }, [loadPrinters]);

  const totalPrinters = printers.length;
  const colorCount = printers.filter((p) => p.type === "COLOR").length;
  const bwCount = printers.filter((p) => p.type === "BW").length;
  // useCountUp HARUS dipanggil tanpa syarat di sini (bukan di dalam JSX
  // kondisional viewMode==="list"), supaya jumlah hook yang terpanggil
  // selalu sama di setiap render — ini yang menyebabkan React error #300
  // ("Rendered fewer hooks than expected") saat pindah ke tab "requests".
  const animatedTotalPrinters = useCountUp(totalPrinters);
  const animatedColorCount = useCountUp(colorCount);
  const animatedBwCount = useCountUp(bwCount);

  function openAddPrinter() {
    setEditingPrinter(null);
    setFormNoEq(""); setFormLocation(""); setFormType("BW"); setFormUrl(""); setFormBrand(""); setFormAktif(true);
    setShowPrinterForm(true);
  }
  function openEditPrinter(p: Printer) {
    setEditingPrinter(p);
    setFormNoEq(p.noEq); setFormLocation(p.location); setFormType(p.type); setFormUrl(p.controlPanelUrl); setFormBrand(p.brand); setFormAktif(p.aktif);
    setShowPrinterForm(true);
  }
  const canSavePrinter = formNoEq.trim() !== "" && formLocation.trim() !== "";
  async function handleSavePrinter() {
    if (!canSavePrinter) return;
    setSavingPrinter(true);
    try {
      const payload = { noEq: formNoEq.trim(), location: formLocation.trim(), type: formType, controlPanelUrl: formUrl.trim(), brand: formBrand.trim(), aktif: formAktif };
      if (editingPrinter) await updatePrinter(editingPrinter.id, payload);
      else await addPrinter(payload);
      setShowPrinterForm(false);
      await loadPrinters();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan printer");
    } finally {
      setSavingPrinter(false);
    }
  }
  async function handleDeletePrinter() {
    if (!confirmDeletePrinter) return;
    try {
      await deletePrinter(confirmDeletePrinter.id);
      setConfirmDeletePrinter(null);
      await loadPrinters();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus printer");
    }
  }
  function openControlPanel(url: string) {
    if (!url) {
      alert(lang === "en" ? "Control Panel URL not set for this printer." : "URL Control Panel belum diatur untuk printer ini.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ── Requests ──
  const [requests, setRequests] = useState<PrinterRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState<PrinterRequest | null>(null);
  const [savingRequest, setSavingRequest] = useState(false);
  const [reqDateFrom, setReqDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [reqDateTo, setReqDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [reqPrinterId, setReqPrinterId] = useState("");
  const [reqType, setReqType] = useState<PrinterRequestType>("RESET_KUOTA");
  const [reqEmployeeName, setReqEmployeeName] = useState("");
  const [reqDepartment, setReqDepartment] = useState("");
  const [reqQuota, setReqQuota] = useState("");
  const [reqNotes, setReqNotes] = useState("");

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      setRequests(await getPrinterRequests({ dateFrom: reqDateFrom, dateTo: reqDateTo }));
    } catch (e) {
      console.warn("Gagal memuat permintaan printer:", e);
    } finally {
      setLoadingRequests(false);
    }
  }, [reqDateFrom, reqDateTo]);

  useEffect(() => { if (viewMode === "requests") loadRequests(); }, [viewMode, loadRequests]);

  function openAddRequest() {
    setReqPrinterId(printers[0]?.id ?? "");
    setReqType("RESET_KUOTA");
    setReqEmployeeName(""); setReqDepartment(""); setReqQuota(""); setReqNotes("");
    setShowRequestForm(true);
  }
  const canSaveRequest = reqPrinterId !== "" && reqEmployeeName.trim() !== "";
  async function handleSaveRequest() {
    if (!canSaveRequest) return;
    setSavingRequest(true);
    try {
      await addPrinterRequest({
        printerId: reqPrinterId,
        requestType: reqType,
        employeeName: reqEmployeeName.trim(),
        department: reqDepartment.trim(),
        quotaAmount: reqType === "TAMBAH_KUOTA" && reqQuota.trim() !== "" ? Number(reqQuota) : null,
        notes: reqNotes.trim(),
      });
      setShowRequestForm(false);
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan permintaan");
    } finally {
      setSavingRequest(false);
    }
  }
  async function handleDeleteRequest() {
    if (!confirmDeleteRequest) return;
    try {
      await deletePrinterRequest(confirmDeleteRequest.id);
      setConfirmDeleteRequest(null);
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus permintaan");
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setViewMode("list")}
            style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: viewMode === "list" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: viewMode === "list" ? "#fff" : "var(--t2)" }}
          >
            🖨️ {lang === "en" ? "Printer List" : "Daftar Printer"}
          </button>
          <button
            onClick={() => setViewMode("requests")}
            style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: viewMode === "requests" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: viewMode === "requests" ? "#fff" : "var(--t2)" }}
          >
            📋 {lang === "en" ? "Employee Requests" : "Permintaan Karyawan"}
          </button>
        </div>
        {viewMode === "list" ? (
          <button className="pillBtn" onClick={openAddPrinter}>+ {lang === "en" ? "Add Printer" : "Tambah Printer"}</button>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => exportPrinterRequestsToCsv(requests)}
                disabled={requests.length === 0}
                style={{ padding: "9px 16px", borderRadius: "var(--pill)", border: "1px solid var(--green)", background: "var(--green-soft)", color: "var(--green)", fontWeight: 700, fontSize: 13, cursor: requests.length === 0 ? "not-allowed" : "pointer", opacity: requests.length === 0 ? 0.5 : 1 }}
              >
                ⬇ {lang === "en" ? "Export CSV" : "Export CSV"}
              </button>
              <button className="pillBtn" onClick={openAddRequest} disabled={printers.length === 0} title={printers.length === 0 ? (lang === "en" ? "Add a printer first" : "Tambahkan printer dulu di tab 'Daftar Printer'") : undefined}>
                + {lang === "en" ? "Log Request" : "Catat Permintaan"}
              </button>
            </div>
            {printers.length === 0 && (
              <div style={{ padding: "0 18px 14px", fontSize: 12.5, color: "var(--orange)" }}>
                ⚠️ {lang === "en" ? "Add at least 1 printer in the \"Printer List\" tab before logging a request." : "Tambahkan minimal 1 printer di tab \"Daftar Printer\" dulu sebelum bisa mencatat permintaan."}
              </div>
            )}
          </>
        )}
      </div>

      {viewMode === "list" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
            <div className="statPop" style={{ ...cardStyle, padding: 18, background: "linear-gradient(135deg, var(--brand), var(--brand2))" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>{lang === "en" ? "Total Printers" : "Total Printer"}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", fontFamily: "var(--mono)" }}>{animatedTotalPrinters}</div>
            </div>
            <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>🎨 {lang === "en" ? "Color" : "Berwarna"}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--purple)", fontFamily: "var(--mono)" }}>{animatedColorCount}</div>
            </div>
            <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>⚫ {lang === "en" ? "Black & White" : "Hitam Putih"}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--t1)", fontFamily: "var(--mono)" }}>{animatedBwCount}</div>
            </div>
          </div>

          <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
            {loadingPrinters ? (
              <SkeletonRows rows={4} />
            ) : printers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
                🖨️ {lang === "en" ? "No printers registered yet." : "Belum ada printer terdaftar."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tableCompact" style={{ minWidth: 720, width: "100%" }}>
                  <thead>
                    <tr>
                      <th>No. EQ</th>
                      <th>{lang === "en" ? "Location" : "Lokasi"}</th>
                      <th>{lang === "en" ? "Type" : "Jenis"}</th>
                      <th>Brand</th>
                      <th>Control Panel</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>{lang === "en" ? "Actions" : "Aksi"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printers.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{p.noEq}</td>
                        <td>{p.location}</td>
                        <td>
                          <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: p.type === "COLOR" ? "var(--gold-soft)" : "var(--bg2)", color: p.type === "COLOR" ? "var(--gold2)" : "var(--t2)" }}>
                            {p.type === "COLOR" ? (lang === "en" ? "Color" : "Berwarna") : (lang === "en" ? "B/W" : "Hitam Putih")}
                          </span>
                        </td>
                        <td style={{ color: "var(--t3)" }}>{p.brand || "-"}</td>
                        <td>
                          <button
                            onClick={() => openControlPanel(p.controlPanelUrl)}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border2)", background: p.controlPanelUrl ? "var(--bg2)" : "transparent", color: p.controlPanelUrl ? "var(--brand)" : "var(--t3)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                          >
                            🔗 {lang === "en" ? "Open Panel" : "Buka Panel"}
                          </button>
                        </td>
                        <td>
                          <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: p.aktif ? "var(--green-soft)" : "var(--red-soft)", color: p.aktif ? "var(--green)" : "var(--red)" }}>
                            {p.aktif ? (lang === "en" ? "Active" : "Aktif") : (lang === "en" ? "Inactive" : "Nonaktif")}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => openEditPrinter(p)} style={{ border: "none", background: "var(--bg2)", color: "var(--t2)", borderRadius: 8, cursor: "pointer", padding: "5px 9px", marginRight: 6 }}>✏️</button>
                          <button onClick={() => setConfirmDeletePrinter(p)} style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", padding: "5px 9px" }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === "requests" && (
        <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "16px 18px" }}>
            <input type="date" className={styles.formInput} style={{ width: "auto" }} value={reqDateFrom} onChange={(e) => setReqDateFrom(e.target.value)} />
            <span style={{ color: "var(--t3)", fontSize: 12 }}>—</span>
            <input type="date" className={styles.formInput} style={{ width: "auto" }} value={reqDateTo} onChange={(e) => setReqDateTo(e.target.value)} />
          </div>
          {loadingRequests ? (
            <SkeletonRows rows={4} />
          ) : requests.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
              📋 {lang === "en" ? "No requests logged in this range." : "Belum ada permintaan tercatat di rentang ini."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tableCompact" style={{ minWidth: 900, width: "100%" }}>
                <thead>
                  <tr>
                    <th>{lang === "en" ? "Date" : "Tanggal"}</th>
                    <th>{lang === "en" ? "Source" : "Sumber"}</th>
                    <th>{lang === "en" ? "Printer / User ID" : "Printer / User ID"}</th>
                    <th>{lang === "en" ? "Request Type" : "Jenis Permintaan"}</th>
                    <th>{lang === "en" ? "Employee" : "Karyawan"}</th>
                    <th>{lang === "en" ? "Department" : "Departemen"}</th>
                    <th>{lang === "en" ? "Quota" : "Kuota"}</th>
                    <th>{lang === "en" ? "Note" : "Catatan"}</th>
                    <th style={{ textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDateLabel(r.createdAt.slice(0, 10))}</td>
                      <td>
                        <span style={{ padding: "3px 9px", borderRadius: "var(--pill)", fontSize: 10.5, fontWeight: 700, background: r.source === "EMPLOYEE" ? "var(--brand)" : "var(--bg2)", color: r.source === "EMPLOYEE" ? "#fff" : "var(--t2)" }}>
                          {r.source === "EMPLOYEE" ? (lang === "en" ? "Employee" : "Karyawan") : "Admin"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>
                        {r.printerId ? r.printerNoEq : (r.requestType === "RESET_KUOTA" ? `📍 ${r.printUserId}` : r.printUserId)}
                        {r.printerId && <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400, fontFamily: "var(--font)" }}>{r.printerLocation}</div>}
                        {!r.printerId && r.requestType === "RESET_KUOTA" && <div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 400, fontFamily: "var(--font)" }}>Area/Lokasi</div>}
                      </td>
                      <td>
                        <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: "var(--bg2)", color: "var(--t2)" }}>
                          {PRINTER_REQUEST_LABELS[r.requestType]}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.employeeName}</td>
                      <td>{r.department || "-"}</td>
                      <td style={{ fontFamily: "var(--mono)" }}>{r.quotaAmount ?? "-"}</td>
                      <td style={{ color: "var(--t3)", whiteSpace: "pre-line" }}>{r.notes || "-"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => printRequestReceipt({
                            refId: r.id, createdAt: r.createdAt, typeLabel: PRINTER_REQUEST_LABELS[r.requestType], employeeName: r.employeeName, department: r.department,
                            lines: [
                              { label: r.printerId ? "Printer" : "User ID Print", value: r.printerId ? `${r.printerNoEq} — ${r.printerLocation}` : r.printUserId },
                              { label: "Kuota", value: r.quotaAmount != null ? String(r.quotaAmount) : "" },
                              { label: "Catatan", value: r.notes },
                            ],
                          })}
                          style={{ border: "none", background: "var(--bg2)", color: "var(--t2)", borderRadius: 8, cursor: "pointer", padding: "5px 9px", marginRight: 6 }}
                        >
                          🖨️
                        </button>
                        <button onClick={() => setConfirmDeleteRequest(r)} style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", padding: "5px 9px" }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showPrinterForm && (
        <ModalPortal onOverlayClick={() => setShowPrinterForm(false)} maxWidth={440}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>
              {editingPrinter ? (lang === "en" ? "Edit Printer" : "Edit Printer") : (lang === "en" ? "Add Printer" : "Tambah Printer")}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>No. EQ Printer *</label>
              <input className={styles.formInput} value={formNoEq} onChange={(e) => setFormNoEq(e.target.value)} placeholder="PRN-001" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Location" : "Lokasi"} *</label>
              <input className={styles.formInput} value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder={lang === "en" ? "e.g. 2nd Floor - Finance" : "Contoh: Lantai 2 - Finance"} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Type" : "Jenis"} *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["BW", "COLOR"] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setFormType(tp)}
                    style={{ flex: 1, padding: "9px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", border: formType === tp ? "1px solid var(--brand)" : "1px solid var(--border2)", background: formType === tp ? "var(--bg2)" : "transparent", color: formType === tp ? "var(--brand)" : "var(--t3)" }}
                  >
                    {tp === "BW" ? (lang === "en" ? "Black & White" : "Hitam Putih") : (lang === "en" ? "Color" : "Berwarna")}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Brand / Model</label>
              <input className={styles.formInput} value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="Contoh: HP LaserJet Pro" />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Control Panel URL</label>
              <input className={styles.formInput} value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="http://192.168.1.50" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <input type="checkbox" checked={formAktif} onChange={(e) => setFormAktif(e.target.checked)} id="printerAktif" />
              <label htmlFor="printerAktif" style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600 }}>{lang === "en" ? "Active" : "Aktif"}</label>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPrinterForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSavePrinter} disabled={!canSavePrinter || savingPrinter} style={{ flex: 2, justifyContent: "center", opacity: canSavePrinter && !savingPrinter ? 1 : 0.5 }}>
                {savingPrinter ? t.actionSaving : t.actionSave}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDeletePrinter && (
        <ModalPortal onOverlayClick={() => setConfirmDeletePrinter(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this printer?" : "Hapus printer ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDeletePrinter.noEq}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeletePrinter(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDeletePrinter} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {showRequestForm && (
        <ModalPortal onOverlayClick={() => setShowRequestForm(false)} maxWidth={440}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>
              {lang === "en" ? "Log Employee Request" : "Catat Permintaan Karyawan"}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Printer *</label>
              <select className={styles.formSelect} value={reqPrinterId} onChange={(e) => setReqPrinterId(e.target.value)}>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.noEq} — {p.location}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Request Type" : "Jenis Permintaan"} *</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(Object.keys(PRINTER_REQUEST_LABELS) as PrinterRequestType[]).map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setReqType(rt)}
                    style={{ flex: 1, minWidth: 110, padding: "9px", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", border: reqType === rt ? "1px solid var(--brand)" : "1px solid var(--border2)", background: reqType === rt ? "var(--bg2)" : "transparent", color: reqType === rt ? "var(--brand)" : "var(--t3)" }}
                  >
                    {PRINTER_REQUEST_LABELS[rt]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Employee Name" : "Nama Karyawan"} *</label>
              <input className={styles.formInput} value={reqEmployeeName} onChange={(e) => setReqEmployeeName(e.target.value)} placeholder={lang === "en" ? "Full name" : "Nama lengkap"} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Department" : "Departemen"}</label>
              <input className={styles.formInput} value={reqDepartment} onChange={(e) => setReqDepartment(e.target.value)} />
            </div>
            {reqType === "TAMBAH_KUOTA" && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{lang === "en" ? "Quota Amount" : "Jumlah Kuota"}</label>
                <input className={styles.formInput} type="number" value={reqQuota} onChange={(e) => setReqQuota(e.target.value)} placeholder="100" />
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>{lang === "en" ? "Notes" : "Catatan"}</label>
              <textarea className={styles.formTextarea} value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} rows={2} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowRequestForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSaveRequest} disabled={!canSaveRequest || savingRequest} style={{ flex: 2, justifyContent: "center", opacity: canSaveRequest && !savingRequest ? 1 : 0.5 }}>
                {savingRequest ? t.actionSaving : t.actionSave}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDeleteRequest && (
        <ModalPortal onOverlayClick={() => setConfirmDeleteRequest(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this request record?" : "Hapus catatan permintaan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDeleteRequest.employeeName}</strong> — {PRINTER_REQUEST_LABELS[confirmDeleteRequest.requestType]} {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeleteRequest(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDeleteRequest} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
/* ════════════════════════════════════════════════════════════
   EMPLOYEE REQUESTS — inbox permintaan dari form publik (/request):
   request driver, request toner, atau lainnya. Admin bisa langsung
   proses (tandai diproses/selesai/tolak) dari sini.
════════════════════════════════════════════════════════════ */

/** Buka jendela baru berisi bukti permintaan yang rapi lalu langsung
 *  panggil print — dipakai admin untuk cetak ulang bukti permintaan
 *  apapun (driver, toner/printer, lainnya) dari Dashboard. */
/** Identitas dokumen resmi di bukti cetak — samakan dengan yang di
 *  src/app/request/page.tsx kalau ada pergantian administrator. */
const RECEIPT_COMPANY_NAME = "PT. Frisian Flag Indonesia - Plant Cikarang";
const RECEIPT_SYSTEM_NAME = "CIKOPS Fleet Management";
const RECEIPT_ADMIN_NAME = "Sulistiawan";
const RECEIPT_ADMIN_DEPARTMENT = "Facility Management";

function printRequestReceipt(params: {
  refId: string;
  createdAt: string;
  typeLabel: string;
  employeeName: string;
  department: string;
  lines: { label: string; value: string }[];
}) {
  const w = window.open("", "_blank", "width=520,height=760");
  if (!w) return;
  const refNo = `REQ-${new Date(params.createdAt).toISOString().slice(0, 10).replace(/-/g, "")}-${params.refId.slice(0, 6).toUpperCase()}`;
  const rows = params.lines
    .filter((l) => l.value)
    .map((l) => `<tr><td style="padding:5px 0;color:#7886a8;width:38%;vertical-align:top;">${l.label}</td><td style="padding:5px 0;font-weight:700;color:#0d1a36;">: ${l.value}</td></tr>`)
    .join("");
  const origin = window.location.origin;
  w.document.write(`
    <html>
      <head>
        <title>Bukti Permintaan — ${refNo}</title>
        <style>
          @page { margin: 16mm; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #0d1a36; margin: 0; }
          .wrap { max-width: 480px; margin: 0 auto; border: 1px solid #cfd9ee; border-radius: 14px; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; }
          .lbl { font-size: 11px; font-weight: 800; color: #7886a8; letter-spacing: 0.06em; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div style="padding:24px 28px 18px;border-bottom:3px solid #0d1a36;display:flex;align-items:center;gap:14px;">
            <div style="width:56px;height:56px;border-radius:10px;background:#0d1a36;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
              <img src="${origin}/logo.png" alt="CIKOPS" style="width:80%;height:80%;object-fit:contain;" />
            </div>
            <div>
              <div style="font-size:15.5px;font-weight:800;color:#0d1a36;line-height:1.3;">${RECEIPT_COMPANY_NAME}</div>
              <div style="font-size:12.5px;color:#44537a;font-weight:600;">${RECEIPT_SYSTEM_NAME}</div>
              <div style="font-size:11px;color:#7886a8;">Departemen Facility Management</div>
            </div>
          </div>

          <div style="padding:18px 28px 14px;text-align:center;background:#f6f9ff;">
            <div style="font-size:15px;font-weight:800;color:#0d1a36;letter-spacing:0.04em;">BUKTI PERMINTAAN</div>
            <div style="font-size:11.5px;color:#7886a8;font-family:monospace;margin-top:3px;">No. ${refNo}</div>
          </div>

          <div style="padding:20px 28px;">
            <table style="margin-bottom:16px;font-size:13px;">
              <tr><td style="padding:5px 0;color:#7886a8;width:38%;">Tanggal Pengajuan</td><td style="padding:5px 0;font-weight:700;">: ${new Date(params.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
              <tr><td style="padding:5px 0;color:#7886a8;">Jenis Permintaan</td><td style="padding:5px 0;font-weight:700;">: ${params.typeLabel}</td></tr>
              <tr><td style="padding:5px 0;color:#7886a8;">Nama Pemohon</td><td style="padding:5px 0;font-weight:700;">: ${params.employeeName}</td></tr>
              <tr><td style="padding:5px 0;color:#7886a8;">Departemen</td><td style="padding:5px 0;font-weight:700;">: ${params.department || "-"}</td></tr>
            </table>

            <div class="lbl" style="border-top:1px solid #eef3fc;padding-top:14px;margin-bottom:8px;">DETAIL PERMINTAAN</div>
            <table style="margin-bottom:22px;font-size:13px;">${rows}</table>

            <div style="border-top:1px dashed #cfd9ee;padding-top:16px;display:flex;justify-content:flex-end;">
              <div style="text-align:center;min-width:170px;">
                <div style="font-size:11px;color:#7886a8;margin-bottom:46px;">Diterima &amp; diproses oleh,</div>
                <div style="font-size:13.5px;font-weight:800;color:#0d1a36;border-top:1px solid #0d1a36;padding-top:4px;">${RECEIPT_ADMIN_NAME}</div>
                <div style="font-size:11.5px;color:#7886a8;">${RECEIPT_ADMIN_DEPARTMENT}</div>
              </div>
            </div>
          </div>

          <div style="text-align:center;padding:10px 0;font-size:10px;color:#a0aabb;border-top:1px solid #eef3fc;">
            Dokumen ini digenerate otomatis oleh sistem ${RECEIPT_SYSTEM_NAME}
          </div>
        </div>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

const EMPLOYEE_REQUEST_TYPE_LABELS: Record<EmployeeRequestType, { label: string; icon: string }> = {
  DRIVER: { label: "Request Driver", icon: "🚗" },
  TONER: { label: "Request Toner", icon: "🖨️" },
  OTHER: { label: "Lainnya", icon: "📝" },
};
const EMPLOYEE_REQUEST_STATUS_LABELS: Record<EmployeeRequestStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: "Menunggu", color: "var(--orange)", bg: "var(--orange-soft)" },
  IN_PROGRESS: { label: "Diproses", color: "var(--brand)", bg: "var(--bg2)" },
  DONE: { label: "Selesai", color: "var(--green)", bg: "var(--green-soft)" },
  REJECTED: { label: "Ditolak", color: "var(--red)", bg: "var(--red-soft)" },
};

function EmployeeRequestsTab() {
  const { lang, t } = useLang();
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeRequestStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | EmployeeRequestType>("all");
  const [confirmDelete, setConfirmDelete] = useState<EmployeeRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<EmployeeRequest | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await getEmployeeRequests());
    } catch (e) {
      console.warn("Gagal memuat permintaan karyawan:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const inProgressCount = requests.filter((r) => r.status === "IN_PROGRESS").length;
  const doneCount = requests.filter((r) => r.status === "DONE").length;

  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (typeFilter !== "all" && r.requestType !== typeFilter) return false;
    return true;
  });

  function openDetail(r: EmployeeRequest) {
    setDetailRequest(r);
    setNotesDraft(r.adminNotes);
  }

  async function handleSetStatus(r: EmployeeRequest, status: EmployeeRequestStatus) {
    setBusyId(r.id);
    try {
      await updateEmployeeRequestStatus(r.id, status, notesDraft);
      setDetailRequest(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteEmployeeRequest(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus permintaan");
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>
          📨 {lang === "en" ? "Employee Requests" : "Permintaan Karyawan"}
        </div>
        <div style={{ fontSize: 12, color: "var(--t3)" }}>
          {lang === "en" ? "Public link:" : "Link publik:"} <code style={{ background: "var(--bg2)", padding: "2px 8px", borderRadius: 6, fontFamily: "var(--mono)" }}>/request</code>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 18, background: pendingCount > 0 ? "linear-gradient(135deg, var(--orange), #d9730d)" : undefined, border: pendingCount === 0 ? "1px solid var(--border2)" : undefined }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: pendingCount > 0 ? "rgba(255,255,255,0.85)" : "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "Pending" : "Menunggu"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: pendingCount > 0 ? "#fff" : "var(--t1)", fontFamily: "var(--mono)" }}>{useCountUp(pendingCount)}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "In Progress" : "Diproses"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--brand)", fontFamily: "var(--mono)" }}>{useCountUp(inProgressCount)}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "Done" : "Selesai"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--green)", fontFamily: "var(--mono)" }}>{useCountUp(doneCount)}</div>
        </div>
      </div>

      <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 18px" }}>
          {([
            ["all", lang === "en" ? "All" : "Semua"],
            ["PENDING", "Menunggu"],
            ["IN_PROGRESS", "Diproses"],
            ["DONE", "Selesai"],
            ["REJECTED", "Ditolak"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{ padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 700, background: statusFilter === key ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: statusFilter === key ? "#fff" : "var(--t2)" }}
            >
              {label}
            </button>
          ))}
          <div style={{ width: 1, background: "var(--border2)", margin: "0 4px" }} />
          {([
            ["all", "Semua Jenis"],
            ["DRIVER", "🚗 Driver"],
            ["TONER", "🖨️ Toner"],
            ["OTHER", "📝 Lainnya"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              style={{ padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 700, background: typeFilter === key ? "var(--bg2)" : "transparent", color: typeFilter === key ? "var(--t1)" : "var(--t3)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonRows rows={4} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
            📨 {lang === "en" ? "No requests found." : "Tidak ada permintaan."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tableCompact" style={{ minWidth: 820, width: "100%" }}>
              <thead>
                <tr>
                  <th>{lang === "en" ? "Date" : "Tanggal"}</th>
                  <th>{lang === "en" ? "Type" : "Jenis"}</th>
                  <th>{lang === "en" ? "Employee" : "Karyawan"}</th>
                  <th>{lang === "en" ? "Department" : "Departemen"}</th>
                  <th>{lang === "en" ? "Description" : "Detail"}</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>{lang === "en" ? "Actions" : "Aksi"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const typeInfo = EMPLOYEE_REQUEST_TYPE_LABELS[r.requestType] ?? { label: r.requestType || "-", icon: "❔" };
                  const statusInfo = EMPLOYEE_REQUEST_STATUS_LABELS[r.status] ?? { label: r.status || "-", color: "var(--t3)", bg: "var(--bg2)" };
                  return (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openDetail(r)}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDateLabel(r.createdAt.slice(0, 10))}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{typeInfo.icon} {typeInfo.label}</td>
                      <td style={{ fontWeight: 700 }}>{r.employeeName}{r.phone && <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400 }}>{r.phone}</div>}</td>
                      <td>{r.department || "-"}</td>
                      <td style={{ color: "var(--t3)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</td>
                      <td>
                        <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: statusInfo.bg, color: statusInfo.color }}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setConfirmDelete(r)} style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", padding: "5px 9px" }}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRequest && (
        <ModalPortal onOverlayClick={() => setDetailRequest(null)} maxWidth={460}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{(EMPLOYEE_REQUEST_TYPE_LABELS[detailRequest.requestType] ?? { icon: "❔" }).icon}</span>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>{(EMPLOYEE_REQUEST_TYPE_LABELS[detailRequest.requestType] ?? { label: detailRequest.requestType }).label}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 18 }}>{formatDateLabel(detailRequest.createdAt.slice(0, 10))} · {new Date(detailRequest.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>

            <div style={{ background: "var(--bg2)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 2 }}>{detailRequest.employeeName}</div>
              <div style={{ fontSize: 12.5, color: "var(--t3)" }}>{detailRequest.department || "-"}{detailRequest.phone ? ` · ${detailRequest.phone}` : ""}</div>
            </div>

            {detailRequest.requestType === "DRIVER" && detailRequest.details ? (
              <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Tanggal Event/Acara", detailRequest.details.eventDate ? formatDateLabel(detailRequest.details.eventDate) : ""],
                  ["Tujuan", detailRequest.details.destination ?? ""],
                  ["Jam Berangkat", detailRequest.details.departureTime ?? ""],
                  ["Keperluan", detailRequest.details.purpose ?? ""],
                  ["Catatan Tambahan", detailRequest.details.additionalNotes ?? ""],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--t3)" }}>{label}</span>
                    <span style={{ fontWeight: 700, color: "var(--t1)", textAlign: "right" }}>{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 5 }}>{lang === "en" ? "Description" : "Detail Permintaan"}</div>
                <div style={{ fontSize: 13.5, color: "var(--t1)", lineHeight: 1.6 }}>{detailRequest.description}</div>
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" }}>{lang === "en" ? "Admin Notes" : "Catatan Admin"}</label>
              <textarea className={styles.formTextarea} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={2} placeholder={lang === "en" ? "Optional notes..." : "Catatan opsional..."} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const typeInfo2 = EMPLOYEE_REQUEST_TYPE_LABELS[detailRequest.requestType] ?? { label: detailRequest.requestType };
                  const lines = detailRequest.requestType === "DRIVER"
                    ? [
                        { label: "Tanggal Event/Acara", value: detailRequest.details.eventDate ? formatDateLabel(detailRequest.details.eventDate) : "" },
                        { label: "Tujuan", value: detailRequest.details.destination ?? "" },
                        { label: "Jam Berangkat", value: detailRequest.details.departureTime ?? "" },
                        { label: "Keperluan", value: detailRequest.details.purpose ?? "" },
                        { label: "Catatan Tambahan", value: detailRequest.details.additionalNotes ?? "" },
                      ]
                    : [{ label: "Detail Permintaan", value: detailRequest.description }];
                  printRequestReceipt({ refId: detailRequest.id, createdAt: detailRequest.createdAt, typeLabel: typeInfo2.label, employeeName: detailRequest.employeeName, department: detailRequest.department, lines });
                }}
                style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t2)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                🖨️ {lang === "en" ? "Print Receipt" : "Cetak Bukti"}
              </button>
              {detailRequest.status !== "IN_PROGRESS" && (
                <button onClick={() => handleSetStatus(detailRequest, "IN_PROGRESS")} disabled={busyId === detailRequest.id} style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "1px solid var(--brand)", background: "var(--bg2)", color: "var(--brand)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  {lang === "en" ? "Mark In Progress" : "Tandai Diproses"}
                </button>
              )}
              {detailRequest.status !== "DONE" && (
                <button onClick={() => handleSetStatus(detailRequest, "DONE")} disabled={busyId === detailRequest.id} style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "none", background: "var(--green)", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  ✓ {lang === "en" ? "Mark Done" : "Tandai Selesai"}
                </button>
              )}
              {detailRequest.status !== "REJECTED" && (
                <button onClick={() => handleSetStatus(detailRequest, "REJECTED")} disabled={busyId === detailRequest.id} style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  {lang === "en" ? "Reject" : "Tolak"}
                </button>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this request?" : "Hapus permintaan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.employeeName}</strong> — {(EMPLOYEE_REQUEST_TYPE_LABELS[confirmDelete.requestType] ?? { label: confirmDelete.requestType }).label} {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ATK (ALAT TULIS KANTOR) — murni laporan. Input tetap dilakukan di
   Excel (form VBA yang sudah ada), data masuk ke sini lewat tombol
   "Sinkron ke CIKOPS" (lihat vba/modSyncCikops.bas). Tidak ada
   tambah/edit/hapus dari Dashboard — cuma lihat & export laporan.
════════════════════════════════════════════════════════════ */

function AtkTab() {
  const { lang } = useLang();
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const [subView, setSubView] = useState<"stok" | "permintaan" | "restock">("permintaan");

  const [items, setItems] = useState<AtkItem[]>([]);
  const [requests, setRequests] = useState<AtkRequest[]>([]);
  const [restocks, setRestocks] = useState<AtkRestock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [range, setRange] = useState<ReportRangeState>(defaultReportRange());
  const { from: dateFrom, to: dateTo } = reportRangeToDates(range);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const errors: string[] = [];
    try {
      setItems(await getAtkItems());
    } catch (e) {
      errors.push(`Stok: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      setRequests(await getAtkRequests({ dateFrom, dateTo }));
    } catch (e) {
      errors.push(`Permintaan: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      setRestocks(await getAtkRestocks({ dateFrom, dateTo }));
    } catch (e) {
      errors.push(`Restock: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (errors.length > 0) setLoadError(errors.join(" | "));
    setLastUpdated(new Date());
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const lowStockItems = useMemo(() => items.filter((i) => Number(i.stok) <= 5), [items]);
  const totalRequestQty = useMemo(() => requests.reduce((s, r) => s + Number(r.jumlah || 0), 0), [requests]);
  const totalRestockQty = useMemo(() => restocks.reduce((s, r) => s + Number(r.jumlah || 0), 0), [restocks]);
  const animatedItems = useCountUp(items.length);
  const animatedLowStock = useCountUp(lowStockItems.length);
  const animatedRequests = useCountUp(requests.length);

  const itemColumns = useMemo<ReportColumn<AtkItem>[]>(() => [
    { key: "kode", labelId: "Kode Barang", labelEn: "Item Code", get: (i) => i.kodeBarang ?? "" },
    { key: "nama", labelId: "Nama Barang", labelEn: "Item Name", get: (i) => i.namaBarang ?? "" },
    { key: "satuan", labelId: "Satuan", labelEn: "Unit", get: (i) => i.satuan ?? "" },
    { key: "stok", labelId: "Stok Saat Ini", labelEn: "Current Stock", get: (i) => i.stok ?? 0, align: "right" },
    { key: "updated", labelId: "Terakhir Diperbarui", labelEn: "Last Updated", get: (i) => (i.updatedAt ? formatDateTime(i.updatedAt) : "-") },
  ], []);

  const requestColumns = useMemo<ReportColumn<AtkRequest>[]>(() => [
    { key: "requestId", labelId: "No. Request", labelEn: "Request No.", get: (r) => r.requestId ?? "" },
    { key: "tanggal", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal ?? "" },
    { key: "nama", labelId: "Nama Pemohon", labelEn: "Requester", get: (r) => r.nama ?? "" },
    { key: "nik", labelId: "NIK", labelEn: "Employee ID", get: (r) => r.nik ?? "" },
    { key: "departemen", labelId: "Departemen", labelEn: "Department", get: (r) => r.departemen ?? "" },
    { key: "barang", labelId: "Nama Barang", labelEn: "Item Name", get: (r) => r.namaBarang ?? "" },
    { key: "jumlah", labelId: "Jumlah", labelEn: "Quantity", get: (r) => r.jumlah ?? 0, align: "right" },
    { key: "satuan", labelId: "Satuan", labelEn: "Unit", get: (r) => r.satuan ?? "" },
    { key: "helper", labelId: "Helper (Pengambil Barang)", labelEn: "Helper (Item Picker)", get: (r) => r.helper ?? "" },
  ], []);

  const restockColumns = useMemo<ReportColumn<AtkRestock>[]>(() => [
    { key: "updateId", labelId: "No. Update", labelEn: "Update No.", get: (r) => r.updateId ?? "" },
    { key: "tanggal", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal ?? "" },
    { key: "petugas", labelId: "Petugas", labelEn: "Staff", get: (r) => r.nama ?? "" },
    { key: "departemen", labelId: "Departemen", labelEn: "Department", get: (r) => r.departemen ?? "" },
    { key: "barang", labelId: "Nama Barang", labelEn: "Item Name", get: (r) => r.namaBarang ?? "" },
    { key: "jumlah", labelId: "Jumlah Masuk", labelEn: "Quantity In", get: (r) => r.jumlah ?? 0, align: "right" },
    { key: "satuan", labelId: "Satuan", labelEn: "Unit", get: (r) => r.satuan ?? "" },
  ], []);

  function handleExportClick(format: ExportFormat, exportLang: ReportLang) {
    try {
      const periodLabel = reportRangeLabel(range, exportLang);
      const runner = format === "csv" ? exportGenericCsv : format === "excel" ? exportGenericExcel : exportGenericPdf;
      if (subView === "stok") {
        runner({ rows: items, columns: itemColumns, lang: exportLang, titleId: "Laporan Stok ATK", titleEn: "Office Supplies Stock Report", filename: "Laporan_Stok_ATK" });
      } else if (subView === "permintaan") {
        runner({
          rows: requests, columns: requestColumns, lang: exportLang, titleId: "Laporan Permintaan ATK", titleEn: "Office Supplies Request Report",
          periodLabel, filename: "Laporan_Permintaan_ATK",
          summaryRows: [{ label: exportLang === "en" ? "Total Quantity Requested" : "Total Jumlah Diminta", value: totalRequestQty }],
        });
      } else {
        runner({
          rows: restocks, columns: restockColumns, lang: exportLang, titleId: "Laporan Restock ATK", titleEn: "Office Supplies Restock Report",
          periodLabel, filename: "Laporan_Restock_ATK",
          summaryRows: [{ label: exportLang === "en" ? "Total Quantity Restocked" : "Total Jumlah Masuk", value: totalRestockQty }],
        });
      }
    } catch (e) {
      console.error("[AtkTab export error]", e);
      alert(`Gagal membuat laporan: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const exportPicker = useExportLanguagePicker(handleExportClick);

  const currentEmptyDisabled =
    subView === "stok" ? items.length === 0 : subView === "permintaan" ? requests.length === 0 : restocks.length === 0;

  let tableBody: React.ReactNode;
  if (loading) {
    tableBody = <SkeletonRows rows={5} />;
  } else if (subView === "stok") {
    tableBody = items.length === 0 ? (
      <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{lang === "en" ? "No data yet — sync from Excel first." : "Belum ada data — sinkron dari Excel dulu."}</div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table className="tableCompact" style={{ minWidth: 600, width: "100%" }}>
          <thead><tr><th>Kode</th><th>{lang === "en" ? "Item Name" : "Nama Barang"}</th><th>{lang === "en" ? "Unit" : "Satuan"}</th><th style={{ textAlign: "right" }}>Stok</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ fontFamily: "var(--mono)" }}>{i.kodeBarang}</td>
                <td style={{ fontWeight: 700 }}>{i.namaBarang}</td>
                <td>{i.satuan}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: Number(i.stok) <= 5 ? "var(--red)" : "var(--t1)" }}>{i.stok}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (subView === "permintaan") {
    tableBody = requests.length === 0 ? (
      <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{lang === "en" ? "No requests in this period." : "Belum ada permintaan di periode ini."}</div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table className="tableCompact" style={{ minWidth: 900, width: "100%" }}>
          <thead><tr><th>Tanggal</th><th>Pemohon</th><th>Departemen</th><th>Barang</th><th style={{ textAlign: "right" }}>Jumlah</th><th>Helper</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{formatDateLabel(r.tanggal)}</td>
                <td style={{ fontWeight: 700 }}>{r.nama}</td>
                <td>{r.departemen || "-"}</td>
                <td>{r.namaBarang}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{r.jumlah} {r.satuan}</td>
                <td style={{ color: "var(--t3)" }}>{r.helper || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    tableBody = restocks.length === 0 ? (
      <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{lang === "en" ? "No restock records in this period." : "Belum ada restock di periode ini."}</div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table className="tableCompact" style={{ minWidth: 800, width: "100%" }}>
          <thead><tr><th>Tanggal</th><th>Petugas</th><th>Barang</th><th style={{ textAlign: "right" }}>Jumlah Masuk</th></tr></thead>
          <tbody>
            {restocks.map((r) => (
              <tr key={r.id}>
                <td>{formatDateLabel(r.tanggal)}</td>
                <td style={{ fontWeight: 700 }}>{r.nama || "-"}</td>
                <td>{r.namaBarang}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{r.jumlah} {r.satuan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>📎 {lang === "en" ? "Office Supplies (ATK)" : "Alat Tulis Kantor (ATK)"}</div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>
            {lang === "en" ? "Reporting only — data synced from Excel." : "Khusus laporan — data disinkron dari Excel."}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdated ? (
            <span style={{ fontSize: 11.5, color: "var(--t3)" }}>
              {lang === "en" ? "Updated" : "Diperbarui"}: {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          ) : null}
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: "8px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t2)", fontWeight: 700, fontSize: 12.5, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            {loading ? "..." : "🔄"} {lang === "en" ? "Refresh Data" : "Refresh Data"}
          </button>
        </div>
      </div>

      {loadError ? (
        <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 16, fontSize: 12.5, fontFamily: "var(--mono)" }}>
          ⚠️ {loadError}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "Total Items" : "Total Jenis Barang"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--t1)", fontFamily: "var(--mono)" }}>{animatedItems}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 18, background: lowStockItems.length > 0 ? "linear-gradient(135deg, var(--red), #c0392b)" : undefined }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: lowStockItems.length > 0 ? "rgba(255,255,255,0.85)" : "var(--t3)", marginBottom: 6 }}>⚠️ {lang === "en" ? "Low Stock (≤5)" : "Stok Menipis (≤5)"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: lowStockItems.length > 0 ? "#fff" : "var(--t1)", fontFamily: "var(--mono)" }}>{animatedLowStock}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "Requests (period)" : "Permintaan (periode)"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--brand)", fontFamily: "var(--mono)" }}>{animatedRequests}</div>
        </div>
      </div>

      <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "16px 18px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setSubView("permintaan")}
              style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: subView === "permintaan" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: subView === "permintaan" ? "#fff" : "var(--t2)" }}
            >
              {lang === "en" ? "Requests" : "Permintaan"}
            </button>
            <button
              onClick={() => setSubView("restock")}
              style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: subView === "restock" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: subView === "restock" ? "#fff" : "var(--t2)" }}
            >
              Restock
            </button>
            <button
              onClick={() => setSubView("stok")}
              style={{ padding: "7px 16px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: subView === "stok" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: subView === "stok" ? "#fff" : "var(--t2)" }}
            >
              {lang === "en" ? "Current Stock" : "Stok Saat Ini"}
            </button>
          </div>
          <ReportExportButtons onExport={exportPicker.requestExport} disabled={currentEmptyDisabled} />
        </div>

        {subView !== "stok" ? (
          <div style={{ padding: "0 18px 14px" }}>
            <ReportRangePicker value={range} onChange={setRange} inputClassName={styles.formInput} />
          </div>
        ) : null}

        {tableBody}
      </div>

      {exportPicker.pending ? (
        <LanguagePickerModal key={exportPicker.pending} format={exportPicker.pending} onConfirm={exportPicker.confirm} onClose={exportPicker.cancel} />
      ) : null}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   MASTER DATA — the missing piece: until now there was no way to add
   a new Driver, Employee, or Job Type through the UI at all (only
   read-only dropdowns fed by Supabase). This tab covers all three.
════════════════════════════════════════════════════════════ */

const AVATAR_EMOJIS = ["🧑", "👨", "👩", "🧔", "👨‍🦱", "👩‍🦱", "👨‍🦳", "👩‍🦳", "🧑‍✈️", "🕺"];

function MasterDataTab({
  initialSub = "drivers",
  restrictedToDriversOnly = false,
  myProfile = null,
}: {
  initialSub?: "drivers" | "employees" | "jobtypes";
  restrictedToDriversOnly?: boolean;
  myProfile?: MyProfile | null;
}) {
  const { lang } = useLang();
   const [sub, setSub] = useState<"drivers" | "employees" | "jobtypes" | "settings">(
   restrictedToDriversOnly ? "drivers" : initialSub
   );

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        {([
     { id: "drivers", label: lang === "en" ? "Drivers" : "Driver", icon: "🧑‍✈️" },
     { id: "employees", label: lang === "en" ? "Employees" : "Pegawai", icon: "👤" },
     { id: "jobtypes", label: lang === "en" ? "Job Types" : "Jenis Pekerjaan", icon: "🧰" },
     { id: "settings", label: lang === "en" ? "Settings" : "Pengaturan", icon: "⚙️" },
   ] as const)
     .filter((s) => !restrictedToDriversOnly || s.id === "drivers" || s.id === "employees")
     .map((s) => (
          <button
            key={s.id}
            className="tabPill"
            onClick={() => setSub(s.id)}
            style={{
              padding: "9px 18px", borderRadius: "var(--pill)", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700,
              background: sub === s.id ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "var(--surface2)",
              color: sub === s.id ? "#fff" : "var(--t2)",
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {sub === "drivers" && <DriversMasterPanel cardStyle={cardStyle} myProfile={myProfile} />}
      {sub === "employees" && <EmployeesMasterPanel cardStyle={cardStyle} />}
      {sub === "jobtypes" && <JobTypesMasterPanel cardStyle={cardStyle} />}
      {sub === "settings" && <SettingsPanel cardStyle={cardStyle} />}
    </div>
  );
}

/* ── Settings sub-panel — currently just the manager notification
   email used by the Claims email feature, but a natural home for any
   future app-wide config. ── */
function SettingsPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  const { lang, t } = useLang();
  const [managerEmails, setManagerEmails] = useState<string[]>([]);
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [driverUserIds, setDriverUserIds] = useState<string[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, du, drv] = await Promise.all([
        getAppSetting("manager_email"),
        getAppSetting("driver_user_ids"),
        getAllDriversFull(),
      ]);
      setManagerEmails(me ? me.split(",").map((e) => e.trim()).filter(Boolean) : []);
      setDriverUserIds(du ? du.split(",").filter(Boolean) : []);
      setAllDrivers(drv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pengaturan");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggleDriverUser(id: string) {
    setDriverUserIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function addManagerEmail() {
    const email = newManagerEmail.trim();
    if (!email) return;
    if (managerEmails.some((e) => e.toLowerCase() === email.toLowerCase())) {
      setNewManagerEmail("");
      return;
    }
    setManagerEmails((p) => [...p, email]);
    setNewManagerEmail("");
  }

  function removeManagerEmail(email: string) {
    setManagerEmails((p) => p.filter((e) => e !== email));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        setAppSetting("manager_email", managerEmails.join(",")),
        setAppSetting("driver_user_ids", driverUserIds.join(",")),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  if (loading) return <SkeletonRows />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
      <div className="statPop" style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
          📧 {lang === "en" ? "Claim Email Notifications" : "Notifikasi Email Klaim"}
        </div>
        <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 18, lineHeight: 1.5 }}>
          {lang === "en"
            ? "Every time a claim is submitted, the driver gets a confirmation email and every manager address below gets a formal copy for record-keeping."
            : "Setiap kali klaim diajukan, driver dapat email konfirmasi dan setiap alamat manager di bawah ini dapat salinan formal untuk dokumentasi."}
        </div>

        {error && <div style={{ padding: 10, borderRadius: 8, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 12.5 }}>{error}</div>}

        <label>{lang === "en" ? "MANAGER EMAILS" : "EMAIL MANAGER"}</label>

        {managerEmails.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {managerEmails.map((email) => (
              <span
                key={email}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
                  borderRadius: "var(--pill)", background: "var(--bg2)", border: "1px solid var(--border2)",
                  fontSize: 12.5, color: "var(--t1)",
                }}
              >
                {email}
                <button
                  onClick={() => removeManagerEmail(email)}
                  style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                  title={lang === "en" ? "Remove" : "Hapus"}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            className={styles.formInput}
            type="email"
            value={newManagerEmail}
            onChange={(e) => setNewManagerEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManagerEmail(); } }}
            placeholder="manager@company.com"
          />
          <button
            onClick={addManagerEmail}
            style={{ padding: "0 16px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            + {lang === "en" ? "Add" : "Tambah"}
          </button>
        </div>
        {managerEmails.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>
            {lang === "en"
              ? "No manager email configured yet — claim copies won't be sent until you add at least one."
              : "Belum ada email manager — salinan klaim tidak akan terkirim sampai kamu tambah minimal satu."}
          </div>
        )}
      </div>

      <div className="statPop" style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
          🧾 {lang === "en" ? "Tanda Terima Export — Driver User List" : "Export Tanda Terima — Daftar Driver User"}
        </div>
        <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16, lineHeight: 1.5 }}>
          {lang === "en"
            ? "Drivers checked here get their own separate Tanda Terima recap file (different budgeting) when exporting per-week. Everyone else goes into the combined file."
            : "Driver yang dicentang di sini akan mendapat file rekap Tanda Terima terpisah (budgeting beda) saat export per-minggu. Sisanya masuk ke file gabungan."}
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border2)", borderRadius: 10 }}>
          {allDrivers.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>{t.actionNoDataYet}</div>
          ) : (
            allDrivers.map((d) => (
              <label key={d.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={driverUserIds.includes(d.id)} onChange={() => toggleDriverUser(d.id)} />
                <span style={{ color: "var(--t1)" }}>{d.avatar_emoji || "🧑"} {d.nama}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="pillBtn" onClick={handleSave} disabled={saving}>
          {saving ? t.actionSaving : t.actionSave}
        </button>
        {saved && <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>✓ {lang === "en" ? "Saved" : "Tersimpan"}</span>}
      </div>
    </div>
  );
}

/* ── Drivers sub-panel ── */
function DriversMasterPanel({ cardStyle, myProfile = null }: { cardStyle: CSSProperties; myProfile?: MyProfile | null }) {
  const isAdmin = myProfile?.role === "admin";
  const { lang, t } = useLang();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [formNama, setFormNama] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAvatar, setFormAvatar] = useState(AVATAR_EMOJIS[0]);
  const [formAktif, setFormAktif] = useState(true);
  const [formPin, setFormPin] = useState("");
  const [formPlant, setFormPlant] = useState<Plant>("CIK");
  const [formType, setFormType] = useState<DriverType>("operational");
  const [formUser, setFormUser] = useState("");
  const [formUserTitle, setFormUserTitle] = useState("");
  const dutyNow = useNowTick();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Driver | null>(null);

  const [pinTarget, setPinTarget] = useState<Driver | null>(null);
  const [credSending, setCredSending] = useState(false);
  const [credResult, setCredResult] = useState<{ ok: boolean; msg: string; tempPassword?: string } | null>(null);

  async function handleSendCredentials() {
    if (!pinTarget?.email || credSending) return;
    setCredSending(true);
    setCredResult(null);
    try {
      const res = await sendDriverCredentials(pinTarget.email, lang === "en" ? "en" : "id");
      if (res.ok) {
        setCredResult({
          ok: true,
          msg: lang === "en"
            ? `${res.created ? "Account created" : "Password reset"} — temporary password sent to ${pinTarget.email}.`
            : `${res.created ? "Akun dibuat" : "Password direset"} — password sementara sudah dikirim ke ${pinTarget.email}.`,
        });
      } else {
        const errMsg = res.error || (lang === "en" ? "Unknown error — check Edge Function logs." : "Error tidak diketahui — cek log Edge Function di Supabase.");
        setCredResult({ ok: false, msg: errMsg, tempPassword: res.tempPassword });
      }
    } catch (e) {
      setCredResult({ ok: false, msg: e instanceof Error ? e.message : (lang === "en" ? "Failed." : "Gagal.") });
    } finally {
      setCredSending(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, tr] = await Promise.all([getAllDriversFull(myProfile?.plantScope ?? null), getDriverTiers()]);
      setDrivers(d);
      setTiers(tr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data driver");
    } finally {
      setLoading(false);
    }
  }, [myProfile?.plantScope]);
  useEffect(() => { load(); }, [load]);

  function openAdd() {
     setEditing(null);
    setFormNama(""); setFormPhone(""); setFormEmail(""); setFormAvatar(AVATAR_EMOJIS[0]); setFormAktif(true); setFormPin("");
   setFormPlant(myProfile?.plantScope ?? "CIK");
    setFormType("operational"); setFormUser(""); setFormUserTitle("");
    setShowForm(true);
  }
   function openEdit(d: Driver) {
  setEditing(d);
 setFormNama(d.nama); setFormPhone(d.no_hp || ""); setFormEmail(d.email || ""); setFormAvatar(d.avatar_emoji || AVATAR_EMOJIS[0]); setFormAktif(d.aktif); setFormPin("");
   setFormPlant(d.plant || "CIK");
   setFormType(d.driver_type === "user" ? "user" : "operational"); setFormUser(d.assigned_user || ""); setFormUserTitle(d.assigned_user_title || "");
   setShowForm(true);
 }

  const canSave = formNama.trim() !== "" && (!!editing || formPin.length >= 4) && (formType !== "user" || formUser.trim() !== "");

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: DriverInput = { nama: formNama.trim(), no_hp: formPhone.trim() || null, email: formEmail.trim() || null, avatar_emoji: formAvatar, aktif: formAktif, plant: myProfile?.plantScope ?? formPlant, driver_type: formType, assigned_user: formType === "user" ? formUser.trim() : null, assigned_user_title: formType === "user" ? (formUserTitle.trim() || null) : null };
      if (editing) await updateDriver(editing.id, payload);
      else await addDriver(payload, formPin);
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan driver");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteDriver(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert((e instanceof Error ? e.message : "Gagal menghapus driver") + " — driver ini mungkin masih punya riwayat tugas/klaim/overtime, coba nonaktifkan saja.");
    }
  }

  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--t3)" }}>{drivers.length} {lang === "en" ? "drivers total" : "total driver"}</div>
        <button className="pillBtn" onClick={openAdd}>+ {lang === "en" ? "Add Driver" : "Tambah Driver"}</button>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
        {loading ? (
          <SkeletonRows />
        ) : drivers.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
        ) : (
          drivers.map((d) => (
            <div key={d.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{d.avatar_emoji || "🧑"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
     <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{d.nama}</span>
  <span
     style={{
       fontSize: 9.5, fontWeight: 800, padding: "1px 7px", borderRadius: 6,
        background: "var(--bg2)", color: PLANT_COLOR[d.plant || "CIK"], border: `1px solid ${PLANT_COLOR[d.plant || "CIK"]}33`,
      }}
    >
      {d.plant || "CIK"}
    </span>
  </div>
                <div style={{ fontSize: 13, color: "var(--t3)" }}>{d.no_hp || "-"} {d.email ? `· ${d.email}` : ""}</div>
                {isUserDriver(d) && (() => {
                  const du = getUserDutyStatus(d, dutyNow);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: "var(--pill)", background: du.onDuty ? "var(--green-soft)" : "var(--surface2)", color: du.onDuty ? "var(--green)" : "var(--t3)", border: `1px solid ${du.onDuty ? "var(--green)" : "var(--border2)"}` }}>
                        🔒 {du.onDuty ? "ON DUTY" : "OFF DUTY"} · {dutyHoursLabel}
                      </span>
                      <span style={{ fontSize: 12.5, color: "var(--t2)" }}>
                        {lang === "en" ? "User" : "User"}: <b style={{ color: "var(--t1)" }}>{du.userName || "—"}</b>{du.userTitle ? ` · ${du.userTitle}` : ""}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: "var(--pill)", background: isUserDriver(d) ? "var(--purple-soft, var(--surface2))" : "var(--brand-soft, var(--surface2))", color: isUserDriver(d) ? "var(--purple)" : "var(--brand)", whiteSpace: "nowrap" }}>
                {isUserDriver(d) ? "DRIVER USER" : "OPERATIONAL"}
              </span>
              <div style={{ fontSize: 13, color: "var(--t3)", minWidth: 90 }}>
                {tiers.find((tr) => tr.id === d.tier_id)?.name || (lang === "en" ? "No tier" : "Tanpa tier")}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--pill)", background: d.aktif ? "var(--green-soft)" : "var(--red-soft)", color: d.aktif ? "var(--green)" : "var(--red)" }}>
                {d.aktif ? (lang === "en" ? "Active" : "Aktif") : (lang === "en" ? "Inactive" : "Nonaktif")}
              </span>
              <button onClick={() => { setPinTarget(d); setCredResult(null); }} title="Reset Password" style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🔑</button>
              <button onClick={() => openEdit(d)} style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>✏️</button>
              {isAdmin && (
                <button onClick={() => setConfirmDelete(d)} style={{ border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
              )}
            </div>
          ))
        )}
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={440}>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, var(--brand), var(--brand2))", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧑‍✈️</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {editing ? (lang === "en" ? "Edit Driver" : "Edit Driver") : (lang === "en" ? "Add Driver" : "Tambah Driver")}
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label>AVATAR</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12, background: "var(--bg2)", borderRadius: 12 }}>
                  {AVATAR_EMOJIS.map((em) => (
                    <button
                      key={em} type="button" onClick={() => setFormAvatar(em)}
                      style={{
                        width: 38, height: 38, borderRadius: "50%", fontSize: 17, cursor: "pointer",
                        background: formAvatar === em ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "var(--surface)",
                        border: formAvatar === em ? "2px solid var(--brand2)" : "1px solid var(--border2)",
                        boxShadow: formAvatar === em ? "var(--shadow-brand)" : "none",
                        transition: "transform 0.15s ease",
                        transform: formAvatar === em ? "scale(1.08)" : "scale(1)",
                      }}
                    >{em}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
     <label>PLANT *</label>
    <div style={{ display: "flex", gap: 8 }}>
      {((myProfile?.plantScope ? [myProfile.plantScope] : ["CIK", "PRB"]) as Plant[]).map((p) => (
        <button
           key={p}
          type="button"
          onClick={() => setFormPlant(p)}
          style={{
           flex: 1,
            padding: "9px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            border: formPlant === p ? `1px solid ${PLANT_COLOR[p]}` : "1px solid var(--border2)",
            background: formPlant === p ? "var(--bg2)" : "transparent",
            color: formPlant === p ? PLANT_COLOR[p] : "var(--t3)",
          }}
        >
          {p}
        </button>
      ))}
     </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>{lang === "en" ? "DRIVER TYPE" : "TIPE DRIVER"} *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["operational", "Operational", lang === "en" ? "Takes task assignments" : "Menerima penugasan"], ["user", "Driver User", lang === "en" ? "Dedicated to one user" : "Khusus untuk 1 user"]] as [DriverType, string, string][]).map(([val, title, sub]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFormType(val)}
                      style={{
                        flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                        border: formType === val ? "1px solid var(--brand)" : "1px solid var(--border2)",
                        background: formType === val ? "var(--bg2)" : "transparent",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13, color: formType === val ? "var(--brand)" : "var(--t2)" }}>{title}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{sub}</div>
                    </button>
                  ))}
                </div>
                {formType === "user" && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "var(--bg2)", border: "1px solid var(--border2)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label>{lang === "en" ? "USER NAME" : "NAMA USER"} *</label>
                        <input className={styles.formInput} value={formUser} onChange={(e) => setFormUser(e.target.value)} placeholder={lang === "en" ? "Who this driver serves" : "Siapa yang diantar"} />
                      </div>
                      <div>
                        <label>{lang === "en" ? "TITLE / NOTE" : "JABATAN / KET."}</label>
                        <input className={styles.formInput} value={formUserTitle} onChange={(e) => setFormUserTitle(e.target.value)} placeholder="Plant Director" />
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55, color: "var(--t2)" }}>
                      🔒 {lang === "en"
                        ? `Automatically ON DUTY every day ${dutyHoursLabel} (WIB). Status is locked and this driver can't be given operational task assignments.`
                        : `Otomatis ON DUTY setiap hari pukul ${dutyHoursLabel} WIB. Status terkunci dan driver ini tidak bisa ditugaskan ke penugasan operasional.`}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>{lang === "en" ? "NAME" : "NAMA"} *</label>
                <input className={styles.formInput} value={formNama} onChange={(e) => setFormNama(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label>{lang === "en" ? "PHONE" : "NO. HP"}</label>
                  <input className={styles.formInput} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="0812xxxxxxx" />
                </div>
                <div>
                  <label>EMAIL</label>
                  <input className={styles.formInput} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                </div>
              </div>
              {!editing && (
                <div style={{ marginBottom: 14, padding: 14, background: "var(--gold-soft)", borderRadius: 12, border: "1px solid var(--gold)" }}>
                  <label className="fLabel" style={{ ...labelStyle, color: "var(--gold2)" }}>🔑 {lang === "en" ? "INITIAL PIN (min. 4 digits)" : "PIN AWAL (min. 4 digit)"} *</label>
                  <input className={styles.formInput} type="password" inputMode="numeric" value={formPin} onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
                </div>
              )}
              <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={formAktif} onChange={(e) => setFormAktif(e.target.checked)} id="driverAktif" />
                <label className="fLabel" htmlFor="driverAktif" style={{ fontSize: 12.5, color: "var(--t2)" }}>{lang === "en" ? "Active" : "Aktif"}</label>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
                <button className="pillBtn" onClick={handleSave} disabled={!canSave || saving} style={{ flex: 1, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}>{saving ? t.actionSaving : t.actionSave}</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {pinTarget && (
        <ModalPortal onOverlayClick={() => { if (!credSending) setPinTarget(null); }} maxWidth={420}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, color: "var(--t1)" }}>{lang === "en" ? "Driver Login Access" : "Akses Login Driver"}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 14 }}>
              {pinTarget.nama}{pinTarget.email ? ` · ${pinTarget.email}` : ""}
            </div>

            {!pinTarget.email ? (
              <div style={{ fontSize: 12.5, color: "var(--orange)", lineHeight: 1.6, marginBottom: 6 }}>
                {lang === "en" ? "⚠ This driver has no email yet — fill it in first (Edit), otherwise they can't log in at all." : "⚠ Driver ini belum punya email — isi dulu (Edit), tanpa email dia tidak bisa login sama sekali."}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.65, marginBottom: 14 }}>
                  {lang === "en"
                    ? "One click below: creates the account (or resets the password) with a random temporary password, then emails it to the driver — including a reminder to change it via Profile → Change Password."
                    : "Satu klik di bawah: akun dibuat (atau password-nya direset) dengan password sementara acak, lalu dikirim otomatis ke email driver — lengkap dengan saran ganti password lewat Profil → Ubah Password."}
                </div>

                {credResult && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: "10px 13px", borderRadius: 10, marginBottom: 12, background: credResult.ok ? "rgba(34,197,94,0.1)" : "rgba(229,72,77,0.1)", border: `1px solid ${credResult.ok ? "rgba(34,197,94,0.35)" : "rgba(229,72,77,0.3)"}`, color: credResult.ok ? "var(--green)" : "var(--red)" }}>
                    {credResult.ok ? "✅ " : "⚠ "}{credResult.msg}
                    {credResult.tempPassword && (
                      <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 15, fontWeight: 800, color: "var(--t1)", background: "var(--bg2)", padding: "8px 12px", borderRadius: 8, letterSpacing: 1 }}>
                        {credResult.tempPassword}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSendCredentials}
                  disabled={credSending}
                  style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 700, cursor: credSending ? "default" : "pointer", opacity: credSending ? 0.65 : 1, marginBottom: 12 }}
                >
                  {credSending
                    ? (lang === "en" ? "Sending..." : "Mengirim...")
                    : (lang === "en" ? "📧 Create/Reset & Email Temp Password" : "📧 Buat/Reset Akun & Kirim Email")}
                </button>

                <details style={{ marginBottom: 4 }}>
                  <summary style={{ fontSize: 12, color: "var(--t3)", cursor: "pointer" }}>
                    {lang === "en" ? "Manual way (via Supabase Dashboard)" : "Cara manual (lewat Supabase Dashboard)"}
                  </summary>
                  <ol style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.7, margin: "8px 0 0", paddingLeft: 18 }}>
                    <li>{lang === "en" ? "Supabase Dashboard → Authentication → Users" : "Supabase Dashboard → Authentication → Users"}</li>
                    <li>{lang === "en" ? "Find " : "Cari "}<strong style={{ color: "var(--t2)" }}>{pinTarget.email}</strong></li>
                    <li>{lang === "en" ? "Open the user → set a new password" : "Buka user-nya → isi password baru"}</li>
                  </ol>
                </details>
              </>
            )}

            <button onClick={() => setPinTarget(null)} disabled={credSending} style={{ width: "100%", marginTop: 10, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: credSending ? "default" : "pointer" }}>
              {lang === "en" ? "Close" : "Tutup"}
            </button>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this driver?" : "Hapus driver ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{confirmDelete.nama}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

/* ── Employees sub-panel ── */
function EmployeesMasterPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  const { lang, t } = useLang();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [formNama, setFormNama] = useState("");
  const [formDept, setFormDept] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await getAllEmployeesFull());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data pegawai");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setFormNama(""); setFormDept(""); setShowForm(true); }
  function openEdit(e: Employee) { setEditing(e); setFormNama(e.nama); setFormDept(e.departement || ""); setShowForm(true); }
  const canSave = formNama.trim() !== "";

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: EmployeeInput = { nama: formNama.trim(), departement: formDept.trim() || null };
      if (editing) await updateEmployee(editing.id, payload);
      else await addEmployee(payload);
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan pegawai");
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteEmployee(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus pegawai");
    }
  }

  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--t3)" }}>{employees.length} {lang === "en" ? "employees total" : "total pegawai"}</div>
        <button className="pillBtn" onClick={openAdd}>+ {lang === "en" ? "Add Employee" : "Tambah Pegawai"}</button>
      </div>
      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}
      <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
        {loading ? (
          <SkeletonRows />
        ) : employees.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
        ) : (
          employees.map((emp) => (
            <div key={emp.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{emp.nama}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--t2)" }}>{emp.departement || "-"}</div>
              <button onClick={() => openEdit(emp)} style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>✏️</button>
              <button onClick={() => setConfirmDelete(emp)} style={{ border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={380}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Employee" : "Edit Pegawai") : (lang === "en" ? "Add Employee" : "Tambah Pegawai")}</div>
            <div style={{ marginBottom: 12 }}>
              <label>{lang === "en" ? "NAME" : "NAMA"} *</label>
              <input className={styles.formInput} value={formNama} onChange={(e) => setFormNama(e.target.value)} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>{lang === "en" ? "DEPARTMENT" : "DEPARTEMEN"}</label>
              <input className={styles.formInput} value={formDept} onChange={(e) => setFormDept(e.target.value)} />
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
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this employee?" : "Hapus pegawai ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{confirmDelete.nama}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

/* ── Job Types sub-panel ── */
function JobTypesMasterPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  const { lang, t } = useLang();
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JobType | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<JobType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobTypes(await getAllJobTypesFull());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat jenis pekerjaan");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setFormLabel(""); setShowForm(true); }
  function openEdit(j: JobType) { setEditing(j); setFormLabel(j.label); setShowForm(true); }
  const canSave = formLabel.trim() !== "";

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editing) await updateJobType(editing.id, formLabel.trim());
      else await addJobType(formLabel.trim());
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan jenis pekerjaan");
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteJobType(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus jenis pekerjaan");
    }
  }

  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--t3)" }}>{jobTypes.length} {lang === "en" ? "job types total" : "total jenis pekerjaan"}</div>
        <button className="pillBtn" onClick={openAdd}>+ {lang === "en" ? "Add Job Type" : "Tambah Jenis"}</button>
      </div>
      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}
      <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
        {loading ? (
          <SkeletonRows />
        ) : jobTypes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
        ) : (
          jobTypes.map((j) => (
            <div key={j.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{j.label}</div>
              <button onClick={() => openEdit(j)} style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>✏️</button>
              <button onClick={() => setConfirmDelete(j)} style={{ border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Job Type" : "Edit Jenis Pekerjaan") : (lang === "en" ? "Add Job Type" : "Tambah Jenis Pekerjaan")}</div>
            <div style={{ marginBottom: 18 }}>
              <label>LABEL *</label>
              <input className={styles.formInput} value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder={lang === "en" ? "e.g. Internal Meeting" : "cth: Meeting Internal"} />
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
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this job type?" : "Hapus jenis pekerjaan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{confirmDelete.label}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CANTEEN — merged from the standalone Canteen Ops (GAS) system.
   Same flow as the original: a daily entry form (per-shift order +
   leftover for Snack/Meal), and a dashboard summarizing efficiency,
   trends, and shift breakdown for the selected month.
════════════════════════════════════════════════════════════ */

const SHIFT_LABELS = ["Shift 1", "Shift 2", "Shift 3"];

function fmtCanteenDate(d: string, lang: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

/* ── Daily Entry sub-panel ── */
function CanteenEntryPanel({ cardStyle, onSaved }: { cardStyle: CSSProperties; onSaved: () => void }) {
  const { lang, t } = useLang();
  const [reportDate, setReportDate] = useState(todayStr());
  const [snackOrder, setSnackOrder] = useState<[string, string, string]>(["", "", ""]);
  const [snackLeftover, setSnackLeftover] = useState<[string, string, string]>(["", "", ""]);
  const [mealOrder, setMealOrder] = useState<[string, string, string]>(["", "", ""]);
  const [mealLeftover, setMealLeftover] = useState<[string, string, string]>(["", "", ""]);
  const [submittedBy, setSubmittedBy] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (arr: [string, string, string]) => arr.map((v) => Number(v) || 0) as [number, number, number];
  const sum = (arr: [number, number, number]) => arr[0] + arr[1] + arr[2];

  const sOrd = sum(num(snackOrder)), sLft = sum(num(snackLeftover)), sCon = Math.max(0, sOrd - sLft);
  const mOrd = sum(num(mealOrder)), mLft = sum(num(mealLeftover)), mCon = Math.max(0, mOrd - mLft);
  const sEff = sOrd > 0 ? (sCon / sOrd) * 100 : 0;
  const mEff = mOrd > 0 ? (mCon / mOrd) * 100 : 0;

  const hasOverflow =
    snackOrder.some((v, i) => Number(snackLeftover[i]) > Number(v) && Number(v) > 0) ||
    mealOrder.some((v, i) => Number(mealLeftover[i]) > Number(v) && Number(v) > 0);
  const allZero = [...snackOrder, ...mealOrder].every((v) => !Number(v));
  const canSave = reportDate && !allZero && !hasOverflow;

  async function handleSubmit() {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveCanteenReport({
        reportDate,
        snackOrder: num(snackOrder),
        snackLeftover: num(snackLeftover),
        mealOrder: num(mealOrder),
        mealLeftover: num(mealLeftover),
        submittedBy: submittedBy.trim() || (lang === "en" ? "Canteen Operator" : "Operator Kantin"),
      });
      setSnackOrder(["", "", ""]); setSnackLeftover(["", "", ""]);
      setMealOrder(["", "", ""]); setMealLeftover(["", "", ""]);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan laporan");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: CSSProperties = { textAlign: "center" };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  function ShiftGrid({ category, order, leftover, setOrder, setLeftover, color }: {
    category: string; order: [string, string, string]; leftover: [string, string, string];
    setOrder: (v: [string, string, string]) => void; setLeftover: (v: [string, string, string]) => void; color: string;
  }) {
    return (
      <div className="statPop" style={{ ...cardStyle, padding: 18, borderTop: `3px solid ${color}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>{category}</div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div />
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase" }}>{lang === "en" ? "Order" : "Order"}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase" }}>{lang === "en" ? "Leftover" : "Sisa"}</div>
        </div>
        {SHIFT_LABELS.map((sh, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600 }}>{sh}</div>
            <input className={styles.formInput} type="number" min="0" placeholder="0" value={order[i]} onChange={(e) => { const v = [...order] as [string, string, string]; v[i] = e.target.value; setOrder(v); }} />
            <input className={styles.formInput} style={{ ...inputStyle, borderColor: Number(leftover[i]) > Number(order[i]) && Number(order[i]) > 0 ? "var(--red)" : undefined }} type="number" min="0" placeholder="0" value={leftover[i]} onChange={(e) => { const v = [...leftover] as [string, string, string]; v[i] = e.target.value; setLeftover(v); }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="statPop" style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>{lang === "en" ? "REPORT DATE" : "TANGGAL LAPORAN"} *</label>
            <input className={styles.formInput} style={{ ...inputStyle, textAlign: "left" }} type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <div>
            <label>{lang === "en" ? "SUBMITTED BY" : "DIINPUT OLEH"}</label>
            <input className={styles.formInput} style={{ ...inputStyle, textAlign: "left" }} value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} placeholder={lang === "en" ? "Canteen Operator" : "Operator Kantin"} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ShiftGrid category={`🥐 ${lang === "en" ? "Snack" : "Snack"}`} order={snackOrder} leftover={snackLeftover} setOrder={setSnackOrder} setLeftover={setSnackLeftover} color="var(--green)" />
        <ShiftGrid category={`🍱 ${lang === "en" ? "Meal" : "Meal"}`} order={mealOrder} leftover={mealLeftover} setOrder={setMealOrder} setLeftover={setMealLeftover} color="var(--brand)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}><span style={{ color: "var(--t3)" }}>{lang === "en" ? "Total Ordered" : "Total Order"}</span><span style={{ fontWeight: 700, color: "var(--t1)" }}>{fmtRp(sOrd)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}><span style={{ color: "var(--t3)" }}>{lang === "en" ? "Consumed" : "Terpakai"}</span><span style={{ fontWeight: 700, color: "var(--green)" }}>{fmtRp(sCon)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: "var(--t3)" }}>{lang === "en" ? "Leftover" : "Sisa"}</span><span style={{ fontWeight: 700, color: "var(--red)" }}>{fmtRp(sLft)}</span></div>
          <div style={{ marginTop: 10, height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}><div style={{ height: "100%", width: `${sEff}%`, background: "var(--green)" }} /></div>
          <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--green)", marginTop: 4 }}>{sEff.toFixed(1)}% eff</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}><span style={{ color: "var(--t3)" }}>{lang === "en" ? "Total Ordered" : "Total Order"}</span><span style={{ fontWeight: 700, color: "var(--t1)" }}>{fmtRp(mOrd)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}><span style={{ color: "var(--t3)" }}>{lang === "en" ? "Consumed" : "Terpakai"}</span><span style={{ fontWeight: 700, color: "var(--brand)" }}>{fmtRp(mCon)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: "var(--t3)" }}>{lang === "en" ? "Leftover" : "Sisa"}</span><span style={{ fontWeight: 700, color: "var(--red)" }}>{fmtRp(mLft)}</span></div>
          <div style={{ marginTop: 10, height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}><div style={{ height: "100%", width: `${mEff}%`, background: "var(--brand)" }} /></div>
          <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--brand)", marginTop: 4 }}>{mEff.toFixed(1)}% eff</div>
        </div>
      </div>

      {hasOverflow && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 12.5 }}>{lang === "en" ? "Leftover can't be greater than order — check the highlighted fields." : "Sisa tidak boleh lebih besar dari order — cek field yang ditandai merah."}</div>}

      <button className="pillBtn" onClick={handleSubmit} disabled={!canSave || saving} style={{ width: "100%", justifyContent: "center", padding: 14, opacity: canSave && !saving ? 1 : 0.5 }}>
        {saving ? t.actionSaving : (lang === "en" ? "Save Report" : "Simpan Laporan")}
      </button>
    </div>
  );
}

/* ── Dashboard sub-panel ── */
function CanteenDashboardPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  const { lang, t } = useLang();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [rows, setRows] = useState<CanteenReport[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CanteenReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [monthRows, allRows] = await Promise.all([getCanteenReportsForMonth(month), getAllCanteenReports()]);
      setRows(monthRows);
      const months = [...new Set(allRows.map((r) => r.reportDate.slice(0, 7)))].sort().reverse();
      setAvailableMonths(months.length > 0 ? months : [month]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data kantin");
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteCanteenReport(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus laporan");
    }
  }

  const kpi = useMemo(() => computeCanteenKPI(rows), [rows]);
  const overallEff = Math.round(((kpi.snackEff + kpi.mealEff) / 2) * 10) / 10;

  const shiftTotals = useMemo(() => {
    const s: [number, number, number] = [0, 0, 0];
    const m: [number, number, number] = [0, 0, 0];
    rows.forEach((r) => { for (let i = 0; i < 3; i++) { s[i] += r.snackOrder[i]; m[i] += r.mealOrder[i]; } });
    return { snack: s, meal: m };
  }, [rows]);

  const chartW = 640, chartH = 160, pad = 30;
  const maxOrd = Math.max(...rows.map((r) => r.snackOrder[0] + r.snackOrder[1] + r.snackOrder[2] + r.mealOrder[0] + r.mealOrder[1] + r.mealOrder[2]), 1);
  const snackPts = rows.map((r, i) => {
    const x = pad + (rows.length > 1 ? (i / (rows.length - 1)) * (chartW - pad * 2) : 0);
    const total = r.snackOrder[0] + r.snackOrder[1] + r.snackOrder[2];
    const y = chartH - pad - (total / maxOrd) * (chartH - pad * 2 - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const mealPts = rows.map((r, i) => {
    const x = pad + (rows.length > 1 ? (i / (rows.length - 1)) * (chartW - pad * 2) : 0);
    const total = r.mealOrder[0] + r.mealOrder[1] + r.mealOrder[2];
    const y = chartH - pad - (total / maxOrd) * (chartH - pad * 2 - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <select className={styles.formSelect} value={month} onChange={(e) => setMonth(e.target.value)} style={{ borderRadius: "var(--pill)" }}>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { month: "long", year: "numeric" })}</option>
          ))}
        </select>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <SkeletonRows />
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
            {[
              { label: lang === "en" ? "Snack Ordered" : "Snack Order", value: fmtRp(kpi.totalSnackOrder), color: "var(--green)" },
              { label: lang === "en" ? "Snack Efficiency" : "Efisiensi Snack", value: `${kpi.snackEff}%`, color: "var(--green)" },
              { label: lang === "en" ? "Meal Ordered" : "Meal Order", value: fmtRp(kpi.totalMealOrder), color: "var(--brand)" },
              { label: lang === "en" ? "Meal Efficiency" : "Efisiensi Meal", value: `${kpi.mealEff}%`, color: "var(--brand)" },
              { label: lang === "en" ? "Overall Efficiency" : "Efisiensi Keseluruhan", value: `${overallEff}%`, color: overallEff >= 95 ? "var(--green)" : overallEff >= 90 ? "var(--orange)" : "var(--red)" },
            ].map((s, i) => (
              <div key={i} className="statPop" style={{ ...cardStyle, padding: 14, textAlign: "center", animationDelay: `${i * 0.05}s` }}>
                <div className="numGrad" style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--mono)" }}>{s.value}</div>
                <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Trend chart + Shift breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 18 }}>
            <div className="statPop" style={{ ...cardStyle, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>{lang === "en" ? "Daily Order Trend" : "Tren Order Harian"}</div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, marginBottom: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--green)" }} />Snack</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--brand)" }} />Meal</span>
              </div>
              {rows.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12 }}>{t.actionNoDataYet}</div>
              ) : (
                <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH}>
                  {[0.25, 0.5, 0.75].map((f) => (<line key={f} x1={pad} x2={chartW - pad} y1={pad + f * (chartH - pad * 2 - 10)} y2={pad + f * (chartH - pad * 2 - 10)} stroke="var(--border)" strokeWidth={1} />))}
                  <polyline points={snackPts} fill="none" stroke="var(--green)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  <polyline points={mealPts} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="statPop" style={{ ...cardStyle, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>{lang === "en" ? "Shift Breakdown" : "Breakdown Shift"}</div>
              {SHIFT_LABELS.map((sh, i) => {
                const sTot = shiftTotals.snack[0] + shiftTotals.snack[1] + shiftTotals.snack[2] || 1;
                const mTot = shiftTotals.meal[0] + shiftTotals.meal[1] + shiftTotals.meal[2] || 1;
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t2)", marginBottom: 4 }}>{sh}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}><div style={{ height: "100%", width: `${(shiftTotals.snack[i] / sTot) * 100}%`, background: "var(--green)" }} /></div>
                      <span style={{ fontSize: 10.5, color: "var(--t3)", minWidth: 40, textAlign: "right" }}>{fmtRp(shiftTotals.snack[i])}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}><div style={{ height: "100%", width: `${(shiftTotals.meal[i] / mTot) * 100}%`, background: "var(--brand)" }} /></div>
                      <span style={{ fontSize: 10.5, color: "var(--t3)", minWidth: 40, textAlign: "right" }}>{fmtRp(shiftTotals.meal[i])}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail table */}
          <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>{lang === "en" ? "Daily Detail" : "Detail Harian"}</div>
            {rows.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12 }}>{t.actionNoDataYet}</div>
            ) : (
              rows.slice().reverse().map((r) => {
                const sOrd = r.snackOrder[0] + r.snackOrder[1] + r.snackOrder[2];
                const sLft = r.snackLeftover[0] + r.snackLeftover[1] + r.snackLeftover[2];
                const mOrd = r.mealOrder[0] + r.mealOrder[1] + r.mealOrder[2];
                const mLft = r.mealLeftover[0] + r.mealLeftover[1] + r.mealLeftover[2];
                return (
                  <div key={r.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 18px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ minWidth: 100, fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{fmtCanteenDate(r.reportDate, lang)}</div>
                    <div style={{ flex: 1, fontSize: 11.5, color: "var(--t3)" }}>🥐 {fmtRp(sOrd)} order · sisa {fmtRp(sLft)}</div>
                    <div style={{ flex: 1, fontSize: 11.5, color: "var(--t3)" }}>🍱 {fmtRp(mOrd)} order · sisa {fmtRp(mLft)}</div>
                    <button onClick={() => setConfirmDelete(r)} style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", fontSize: 13 }}>🗑️</button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this report?" : "Hapus laporan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{fmtCanteenDate(confirmDelete.reportDate, lang)}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  GIFT DISTRIBUTION MASTER PANEL
// ════════════════════════════════════════════════════════════════
/** Cetak label pembagian seragam — diurutkan berdasarkan No. Urut,
 *  supaya kantong seragam bisa di-packing & disortir sebelum acara.
 *  Petugas pas hari-H cukup cari NIK di /gift/lookup untuk tahu No.
 *  Urut, lalu ambil kantong bernomor itu (yang sudah tersortir rapi).
 *  No. Urut dibuat BESAR supaya gampang dibaca dari jauh, dan slot
 *  ukuran yang KOSONG di-filter total (tidak ikut dicetak).
 *
 *  layout "standard": 3 kolom x 4 baris = 12 label/lembar, kotak 66mm
 *  (pas untuk peserta dengan baju sedikit, mis. ≤5).
 *  layout "large": 3 kolom x 3 baris = 9 label/lembar, kotak lebih
 *  tinggi (~88mm) — dipakai KHUSUS untuk peserta dengan baju BANYAK
 *  (>5), supaya semua ukurannya muat, tidak kepotong lagi. */
/** Kartu KPI yang bisa DIKLIK untuk langsung menerapkan filter terkait
 *  di tabel Peserta di bawahnya — supaya tidak perlu cari-cari dropdown
 *  filter secara manual. */
function GiftKpiCard({
  icon, label, value, color, bg, onClick, active,
}: { icon: string; label: string; value: number; color: string; bg: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: bg, borderRadius: 14, padding: 16, textAlign: "left", cursor: "pointer",
        border: active ? `2px solid ${color}` : "2px solid transparent",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
    </button>
  );
}

/** Kartu input untuk mencatat jumlah AKTUAL (fisik yang datang) —
 *  dibandingkan dengan jumlah KEBUTUHAN hasil hitung sistem. Kasih
 *  peringatan visual kalau aktual < kebutuhan (kurang stok). */
function ActualCountCard({
  label, value, kebutuhan, onSave,
}: { label: string; value: number | null; kebutuhan: number; onSave: (val: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const parsed = draft.trim() === "" ? null : parseInt(draft, 10);
      await onSave(isNaN(parsed as number) ? null : parsed);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  const kurang = value != null && value < kebutuhan;

  return (
    <div style={{ background: kurang ? "rgba(239,68,68,0.06)" : "var(--bg2)", border: kurang ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--border2)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 8 }}>{label}</div>
      {editing ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className={styles.formInput}
            style={{ width: 100, padding: "6px 10px" }}
          />
          <button onClick={handleSave} disabled={saving} style={{ background: "var(--brand)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {saving ? "..." : "Simpan"}
          </button>
          <button onClick={() => { setEditing(false); setDraft(value != null ? String(value) : ""); }} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
            Batal
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: kurang ? "var(--red)" : "var(--t1)" }}>{value ?? "-"}</div>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>/ {kebutuhan} kebutuhan</div>
          <button onClick={() => setEditing(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--brand)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✏️ Edit
          </button>
        </div>
      )}
      {kurang && !editing && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6, fontWeight: 700 }}>⚠️ Kurang {kebutuhan - (value ?? 0)} dari kebutuhan</div>}
    </div>
  );
}

/** Jumlah slot ukuran yang benar-benar terisi untuk 1 peserta (skip
 *  kosong/karakter rusak) — dipakai untuk filter ">5 baju" dan
 *  kategori Single/Suami-Istri/Keluarga. */
function countFilledSizes(r: GiftRegistration): number {
  return r.selections.filter((s) => {
    if (s.variant == null) return false;
    const t = String(s.variant).trim();
    return t !== "" && !/^\uFFFD+$/.test(t);
  }).length;
}

/** Deteksi slot "anak" — berdasarkan NOMOR SLOT/KOLOM-nya (bukan
 *  teks ukurannya), sesuai urutan sebenarnya:
 *  slot 1 = Karyawan, slot 2 = Suami/Istri, slot 3-9 = Anak. */
function isChildSlot(itemLabel: string): boolean {
  const slotNum = parseInt(itemLabel, 10);
  return !isNaN(slotNum) && slotNum >= 3;
}
function countChildren(r: GiftRegistration): number {
  return r.selections.filter((s) => {
    if (s.variant == null) return false;
    const t = String(s.variant).trim();
    if (t === "" || /^\uFFFD+$/.test(t)) return false;
    return isChildSlot(s.item);
  }).length;
}

type GiftCategory = "single" | "couple" | "family";

/** Kategori berdasarkan jumlah orang dalam 1 pendaftaran (= jumlah
 *  baju yang diterima, karena 1 baju = 1 orang):
 *  1 orang = Single, 2 orang = Suami Istri, 3-9 orang = Keluarga. */
function getGiftCategory(r: GiftRegistration): GiftCategory | null {
  const total = countFilledSizes(r);
  if (total === 0) return null; // tidak ada baju sama sekali — tidak masuk kategori manapun
  if (countChildren(r) >= 1) return "family"; // ada slot 3-9 terisi = sudah punya anak
  if (total === 1) return "single"; // cuma slot 1 (karyawan) terisi
  return "couple"; // slot 1+2 terisi, tidak ada anak
}

const CATEGORY_LABEL: Record<GiftCategory, { id: string; en: string; icon: string }> = {
  single: { id: "Single", en: "Single", icon: "👤" },
  couple: { id: "Suami Istri", en: "Couple", icon: "💑" },
  family: { id: "Keluarga", en: "Family", icon: "👨‍👩‍👧‍👦" },
};

/** Parse teks ukuran — kalau formatnya "size - Free Entry" (anak di
 *  bawah 2 tahun), pisahkan ukurannya dari label "Free Entry" dan
 *  tandai isFreeEntry=true. Slot Free Entry TETAP dapat baju, tapi
 *  TIDAK dapat tiket event. */
function parseGiftSize(variant: string): { size: string; isFreeEntry: boolean } {
  const t = variant.trim();
  const m = /^(.*?)\s*-\s*free\s*entry\s*$/i.exec(t);
  if (m) return { size: m[1].trim(), isFreeEntry: true };
  return { size: t, isFreeEntry: false };
}

/** Jumlah TIKET yang berlaku untuk 1 peserta = "Jumlah Tiket" (kolom
 *  eksplisit dari CSV) DIKURANGI jumlah anak <2 tahun (mereka gratis
 *  masuk / free entry, tidak perlu tiket). Tidak pernah negatif. */
function getEffectiveTicketCount(r: GiftRegistration): number {
  const tiket = r.jumlahTiket ?? 0;
  const anakBalita = r.anakDibawah2Tahun ?? 0;
  return Math.max(0, tiket - anakBalita);
}

/** Export laporan Gift ke Excel dengan 2 SHEET terpisah:
 *  1. "Ringkasan" — KPI & breakdown (mirip laporan modul lain)
 *  2. "Data Karyawan" — 1 baris per karyawan, dengan rincian jumlah
 *     peserta (diri sendiri, pasangan, anak) supaya bisa langsung
 *     dipakai untuk keperluan operasional (bukan cuma ringkasan). */
async function exportGiftReportExcel2Sheets(opts: {
  lang: "id" | "en";
  eventName: string;
  filename: string;
  kpis: { labelId: string; labelEn: string; value: string | number }[];
  sizeBreakdown: [string, number][];
  categoryCounts: Record<GiftCategory, number>;
  regs: GiftRegistration[];
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const L = (id: string, en: string) => (opts.lang === "en" ? en : id);

  // ── Sheet 1: Ringkasan ──
  const wsSummary = wb.addWorksheet(L("Ringkasan", "Summary"));
  let row = 1;
  wsSummary.getCell(row, 1).value = "PT. Frisian Flag Indonesia - Plant Cikarang";
  wsSummary.getCell(row, 1).font = { bold: true, size: 13 };
  row++;
  wsSummary.getCell(row, 1).value = `${L("Laporan Pembagian", "Distribution Report")} — ${opts.eventName}`;
  wsSummary.getCell(row, 1).font = { bold: true, size: 12 };
  row += 2;

  wsSummary.getCell(row, 1).value = L("RINGKASAN", "SUMMARY");
  wsSummary.getCell(row, 1).font = { bold: true, size: 12, color: { argb: "FF0F2847" } };
  row++;
  for (const k of opts.kpis) {
    wsSummary.getCell(row, 1).value = opts.lang === "en" ? k.labelEn : k.labelId;
    wsSummary.getCell(row, 2).value = k.value;
    wsSummary.getCell(row, 2).font = { bold: true };
    row++;
  }
  row++;

  wsSummary.getCell(row, 1).value = L("Jumlah Peserta per Kategori", "Participants by Category");
  wsSummary.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FF0F2847" } };
  row++;
  const catRows: [string, number][] = [
    [L("Single (1 orang)", "Single (1 person)"), opts.categoryCounts.single],
    [L("Suami Istri (2 orang)", "Couple (2 people)"), opts.categoryCounts.couple],
    [L("Keluarga (3-9 orang)", "Family (3-9 people)"), opts.categoryCounts.family],
  ];
  for (const [label, count] of catRows) {
    wsSummary.getCell(row, 1).value = label;
    wsSummary.getCell(row, 2).value = count;
    row++;
  }
  row++;

  wsSummary.getCell(row, 1).value = L("Jumlah Baju per Ukuran", "Items by Size");
  wsSummary.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FF0F2847" } };
  row++;
  const sizeHeaderRow = wsSummary.getRow(row);
  sizeHeaderRow.getCell(1).value = L("Ukuran", "Size");
  sizeHeaderRow.getCell(2).value = L("Jumlah", "Count");
  sizeHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  sizeHeaderRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
  sizeHeaderRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
  row++;
  for (const [size, count] of opts.sizeBreakdown) {
    wsSummary.getCell(row, 1).value = size;
    wsSummary.getCell(row, 2).value = count;
    row++;
  }
  wsSummary.columns.forEach((col) => { col.width = 26; });

  // ── Sheet 2: Data Karyawan ──
  const wsData = wb.addWorksheet(L("Data Karyawan", "Employee Data"));
  const headers = [
    L("No. Urut", "Sequence No."), "NIK", L("Nama Karyawan", "Employee Name"),
    L("Total Peserta", "Total Participants"), L("Diri Sendiri", "Self"),
    L("Pasangan", "Spouse"), L("Jumlah Anak", "Number of Children"),
    L("Jumlah Tiket (Efektif)", "Effective Tickets"), L("Anak <2 Tahun", "Children <2yo"),
    L("Status Kehadiran", "Attendance Status"),
    L("Departemen", "Department"), L("Lokasi Pengambilan", "Pickup Location"),
    L("Kategori", "Category"), L("Status Klaim", "Claim Status"), L("Daftar Ukuran", "Size List"),
  ];
  const headerRow = wsData.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
  });

  opts.regs.forEach((r, i) => {
    const total = countFilledSizes(r);
    const anak = countChildren(r);
    const pasangan = total >= 2 ? 1 : 0; // slot 2 = pasangan, sesuai urutan tetap (1=diri, 2=pasangan, 3-9=anak)
    const cat = getGiftCategory(r);
    const dataRow = wsData.getRow(i + 2);
    dataRow.getCell(1).value = r.sequenceNo;
    dataRow.getCell(2).value = r.nik;
    dataRow.getCell(3).value = r.nama;
    dataRow.getCell(4).value = total;
    dataRow.getCell(5).value = total >= 1 ? 1 : 0;
    dataRow.getCell(6).value = pasangan;
    dataRow.getCell(7).value = anak;
    dataRow.getCell(8).value = getEffectiveTicketCount(r);
    dataRow.getCell(9).value = r.anakDibawah2Tahun ?? 0;
    dataRow.getCell(10).value = r.statusKehadiran ?? "-";
    dataRow.getCell(11).value = r.departemen;
    dataRow.getCell(12).value = r.lokasiPengambilan;
    dataRow.getCell(13).value = cat ? CATEGORY_LABEL[cat][opts.lang] : "-";
    dataRow.getCell(14).value = r.claimed ? L("Sudah Diambil", "Claimed") : L("Belum Diambil", "Not Claimed");
    dataRow.getCell(15).value = r.selections
      .filter((s) => s.variant != null && String(s.variant).trim() !== "" && !/^\uFFFD+$/.test(String(s.variant).trim()))
      .map((s) => parseGiftSize(String(s.variant)).size)
      .join(", ") || "-";
  });
  wsData.columns.forEach((col) => { col.width = 18; });
  wsData.getColumn(3).width = 28; // Nama lebih lebar
  wsData.getColumn(15).width = 30; // Daftar Ukuran perlu lebih lebar

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Kartu "Stok Baju per Ukuran" — admin isi stok fisik yang datang
 *  UNTUK TIAP UKURAN, sistem otomatis hitung Sisa = Stok Aktual −
 *  Jumlah yang SUDAH DIAMBIL (dari peserta claimed=true saja). */
function StockPerSizeCard({
  sizeBreakdown, claimedSizeCounts, actualStockPerSize, onSave,
}: {
  sizeBreakdown: [string, number][];
  claimedSizeCounts: Map<string, number>;
  actualStockPerSize: Record<string, number> | null;
  onSave: (stock: Record<string, number>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function startEdit() {
    const initial: Record<string, string> = {};
    for (const [size] of sizeBreakdown) {
      const v = actualStockPerSize?.[size];
      initial[size] = v != null ? String(v) : "";
    }
    setDrafts(initial);
    setEditing(true);
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      const stock: Record<string, number> = {};
      for (const [size] of sizeBreakdown) {
        const raw = drafts[size];
        const n = raw != null && raw.trim() !== "" ? parseInt(raw, 10) : NaN;
        if (!isNaN(n)) stock[size] = n;
      }
      await onSave(stock);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan stok.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "var(--bg2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)" }}>STOK BAJU PER UKURAN (SISA SETELAH PEMBAGIAN)</div>
        {!editing ? (
          <button onClick={startEdit} style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✏️ Isi/Edit Stok Aktual
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--t3)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Batal
            </button>
            <button onClick={handleSaveAll} disabled={saving} style={{ background: "var(--brand)", border: "none", borderRadius: 8, padding: "5px 14px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {saving ? "Menyimpan..." : "Simpan Semua"}
            </button>
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Ukuran", "Stok Aktual", "Sudah Diambil", "Sisa"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "6px 10px", fontSize: 11, color: "var(--t3)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizeBreakdown.map(([size]) => {
              const diambil = claimedSizeCounts.get(size) ?? 0;
              const aktual = actualStockPerSize?.[size];
              const sisa = aktual != null ? aktual - diambil : null;
              return (
                <tr key={size} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: "var(--t1)" }}>{size}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>
                    {editing ? (
                      <input
                        type="number"
                        value={drafts[size] ?? ""}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [size]: e.target.value }))}
                        className={styles.formInput}
                        style={{ width: 90, padding: "4px 8px", textAlign: "right" }}
                      />
                    ) : (
                      <span style={{ color: "var(--t2)" }}>{aktual ?? "-"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--t2)" }}>{diambil}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: sisa == null ? "var(--t3)" : sisa < 0 ? "var(--red)" : "var(--green)" }}>
                    {sisa ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function printGiftLabels(regs: GiftRegistration[], layout: "standard" | "large" = "standard") {
  const w = window.open("", "_blank", "width=850,height=1000");
  if (!w) return;

  const perRow = 3;
  const perPage = layout === "large" ? 9 : 12;
  const labelHeight = layout === "large" ? "88mm" : "66mm";
  const noValueSize = layout === "large" ? "56px" : "50px";

  const sorted = [...regs].sort((a, b) => {
    const na = parseInt(a.sequenceNo, 10);
    const nb = parseInt(b.sequenceNo, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.sequenceNo.localeCompare(b.sequenceNo);
  });

  const labelHtmls = sorted.map((r) => {
    // Filter TEGAS — cuma slot yang benar-benar ada isinya yang dicetak.
    // Termasuk skip karakter Unicode Replacement (U+FFFD / "�") yang
    // muncul kalau CSV sumbernya disimpan dengan encoding selain UTF-8
    // (sel kosong di Excel jadi ke-decode sebagai karakter aneh ini,
    // bukan string kosong murni — makanya perlu dicek eksplisit).
    const filledSizes = r.selections.filter((s) => {
      if (s.variant == null) return false;
      const t = String(s.variant).trim();
      if (t === "") return false;
      return !/^\uFFFD+$/.test(t);
    });
    const sizeRows = filledSizes
      .map((s, i) => {
        const parsed = parseGiftSize(String(s.variant));
        return `<div class="sizeRow"><span class="idx">${i + 1}</span><span class="sizeVal">${parsed.size}</span></div>`;
      })
      .join("");
    const ticketCount = getEffectiveTicketCount(r);
    const sizesHtml =
      filledSizes.length > 0
        ? `<div class="totalRow"><span>TOTAL BAJU</span><span class="totalVal">${filledSizes.length}</span></div><div class="ticketRow">🎟️ Tiket Event: <b>${ticketCount}</b></div><div class="sizesBox">${sizeRows}</div>`
        : `<div class="totalRow"><span>TOTAL BAJU</span><span class="totalVal">0</span></div>`;

    return `
      <div class="label">
        <div class="noLabel">NO. URUT</div>
        <div class="noValue">${r.sequenceNo || "-"}</div>
        <div class="nama">${r.nama}</div>
        <div class="meta">${r.nik} &middot; ${r.departemen || "-"}</div>
        <div class="meta">${r.lokasiPengambilan || "-"}</div>
        ${r.statusKehadiran ? `<div class="statusTag">${r.statusKehadiran}</div>` : ""}
        ${(r.anakDibawah2Tahun ?? 0) > 0 ? `<div class="toddlerNote">👶 ${r.anakDibawah2Tahun} Anak Gratis Masuk / Free Entry (&lt;2 Tahun)</div>` : ""}
        ${sizesHtml}
      </div>`;
  });

  // Bagi label jadi HALAMAN eksplisit, 12 per halaman (3 kolom x 4
  // baris) — dipaksa lewat kode, BUKAN mengandalkan browser membagi
  // grid panjang secara otomatis (beberapa browser tidak konsisten
  // soal ini saat print, bisa berhenti lebih awal dari seharusnya).
  const LABELS_PER_PAGE = perPage;
  const pages: string[] = [];
  for (let i = 0; i < labelHtmls.length; i += LABELS_PER_PAGE) {
    const chunk = labelHtmls.slice(i, i + LABELS_PER_PAGE).join("");
    pages.push(`<div class="page"><div class="grid">${chunk}</div></div>`);
  }
  const pagesHtml = pages.join("");

  w.document.write(`
    <html>
      <head>
        <title>Label Pembagian — ${new Date().toLocaleDateString("id-ID")}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; margin: 0; color: #0d1a36; }
          .page { page-break-after: always; break-after: page; }
          .page:last-child { page-break-after: auto; break-after: auto; }
          .grid { overflow: hidden; } /* contain floated labels */
          .label {
            float: left; width: 62mm; height: ${labelHeight}; margin: 0 4mm 4mm 0;
            border: 1.5px solid #cfd9ee; border-radius: 10px; padding: 8px 10px;
            page-break-inside: avoid; break-inside: avoid; overflow: hidden; display: flex; flex-direction: column;
            box-shadow: 0 1px 3px rgba(15,40,71,0.08);
          }
          .label:nth-child(${perRow}n) { margin-right: 0; }
          .noLabel { font-size: 7px; color: #7886a8; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
          .noValue { font-size: ${noValueSize}; font-weight: 900; line-height: 1; color: #000; margin-bottom: 2px; letter-spacing: -0.02em; text-align: center; }
          .nama { font-weight: 800; font-size: 12px; color: #0d1a36; margin-bottom: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .meta { font-size: 8px; color: #44537a; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .totalRow {
            display: flex; justify-content: space-between; align-items: stretch;
            border-radius: 6px; margin: 5px 0 4px; overflow: hidden; border: 1px solid #cfd9ee;
            font-size: 8.5px; font-weight: 800; color: #7886a8; flex-shrink: 0;
          }
          .totalRow span:first-child { background: #eef2fb; display: flex; align-items: center; padding: 0 8px; letter-spacing: 0.04em; }
          .ticketRow { font-size: 8px; color: #a87c1f; font-weight: 700; margin-bottom: 4px; flex-shrink: 0; }
          .ticketRow b { font-size: 9.5px; }
          .totalVal {
            font-size: 13px; font-weight: 900; color: #fff; background: #0d1a36;
            padding: 4px 12px; display: flex; align-items: center; justify-content: center; min-width: 26px;
          }
          .sizesBox { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; flex: 1; min-height: 0; }
          .sizeRow {
            display: flex; justify-content: space-between; font-size: 9px; padding: 1px 8px;
            border-bottom: 1px solid #f1f5f9; line-height: 1.35; background: #fff;
          }
          .sizeRow:nth-child(even) { background: #f8faff; }
          .sizeRow:last-child { border-bottom: none; }
          .idx { color: #7886a8; font-weight: 700; }
          .sizeVal { font-weight: 800; color: #0d1a36; }
          .freeTag { font-size: 6.5px; font-weight: 800; color: #dc2626; background: #fef2f2; padding: 1px 4px; border-radius: 4px; margin-right: 4px; }
          .toddlerNote { font-size: 7.5px; font-weight: 800; color: #dc2626; margin-bottom: 3px; }
          .statusTag { display: inline-block; font-size: 6.5px; font-weight: 800; color: #0d1a36; background: #eef2fb; padding: 1px 6px; border-radius: 999px; margin-bottom: 3px; letter-spacing: 0.03em; }
          @media print {
            .label { box-shadow: none; }
            .totalVal { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}



function GiftMasterPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  const { lang, t } = useLang();
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create" | "edit" | "registrations">("list");
  const [editTarget, setEditTarget] = useState<GiftEvent | null>(null);
  const [regEvent, setRegEvent] = useState<GiftEvent | null>(null);
  const [regs, setRegs] = useState<GiftRegistration[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GiftEvent | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStatus, setFormStatus] = useState<"open" | "closed">("open");
  const [formMode, setFormMode] = useState<"self_register" | "lookup">("self_register");
  const [formItems, setFormItems] = useState<GiftItemDef[]>([{ name: "", variants: [] }]);
  const [variantInput, setVariantInput] = useState<Record<number, string>>({});

  // Import CSV (mode lookup)
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"insert" | "update">("insert");
  const [importResult, setImportResult] = useState<{ inserted?: number; duplicates?: string[]; processed?: number } | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    setLoading(true);
    try { setEvents(await getGiftEvents()); } catch { /**/ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setFormName(""); setFormDesc(""); setFormStatus("open"); setFormMode("self_register");
    setFormItems([{ name: "", variants: [] }]); setVariantInput({});
    setEditTarget(null); setView("create");
  }

  function openEdit(ev: GiftEvent) {
    setFormName(ev.name); setFormDesc(ev.description ?? "");
    setFormStatus(ev.status); setFormMode(ev.mode);
    setFormItems(ev.items.map(i => ({ ...i, variants: [...i.variants] })));
    setVariantInput({}); setEditTarget(ev); setView("edit");
  }

  async function openRegistrations(ev: GiftEvent) {
    setRegEvent(ev); setView("registrations"); setRegsLoading(true);
    setCsvFile(null); setImportResult(null);
    try { setRegs(await getGiftRegistrations(ev.id)); } catch { setRegs([]); } finally { setRegsLoading(false); }
  }

  /** Parse CSV kolom: NIK, Nama, Departemen, Email, Item, Varian, Jumlah
   *  Satu NIK bisa muncul di beberapa baris (satu baris = satu barang) —
   *  otomatis digabung jadi satu registrasi per NIK. */
  /** Parser CSV FLEKSIBEL untuk format sheet Family Day / pembagian
   *  seragam: satu BARIS = satu orang (bukan satu barang). Kolom yang
   *  "dikenal" (No, Nama, NIK, Departemen, Lokasi) dibaca langsung;
   *  SISA KOLOM APAPUN NAMANYA otomatis dianggap "slot" — nama kolom
   *  itu sendiri jadi label (mis. "1".."9"), isinya jadi ukuran yang
   *  diterima. Slot yang kosong dilewati otomatis. */
  function parseGiftCsv(text: string): { nik: string; nama: string; departemen: string; email?: string; sequenceNo?: string; lokasiPengambilan?: string; jumlahTiket?: number | null; anakDibawah2Tahun?: number | null; statusKehadiran?: string | null; selections: GiftSelection[] }[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return [];
    const rawHeader = lines[0].split(",").map((h) => h.trim());
    const headerLower = rawHeader.map((h) => h.toLowerCase());

    const findCol = (...aliases: string[]) => headerLower.findIndex((h) => aliases.includes(h));
    const iNo = findCol("no", "nomor");
    const iNama = findCol("nama", "nama lengkap", "nama lengkap karyawan");
    const iNik = findCol("nik", "nik/global id karyawan", "nik/global id", "global id");
    const iDept = findCol("departemen", "department");
    const iLokasi = findCol("lokasi pengambilan", "lokasi");
    const iEmail = findCol("email");
    const iTiket = findCol("jumlah tiket", "tiket");
    const iAnakBalita = findCol("jumlah anak < 2 tahun", "anak < 2 tahun", "anak <2 tahun", "anak dibawah 2 tahun", "anak di bawah 2 tahun");
    const iStatus = findCol("status", "status kehadiran");

    if (iNik === -1 || iNama === -1) {
      throw new Error("Header CSV wajib punya kolom Nama dan NIK/Global ID (nama kolom lain bebas — semua kolom selain No/Nama/NIK/Departemen/Lokasi/Email/Jumlah Tiket/Anak <2 Tahun otomatis dianggap slot ukuran).");
    }

    const knownCols = new Set([iNo, iNama, iNik, iDept, iLokasi, iEmail, iTiket, iAnakBalita, iStatus].filter((i) => i !== -1));
    const slotCols = rawHeader.map((h, i) => ({ header: h, i })).filter(({ i }) => !knownCols.has(i) && rawHeader[i] !== "");

    const parseNum = (v: string | undefined): number | null => {
      if (v == null || v.trim() === "") return null;
      const n = parseInt(v.trim(), 10);
      return isNaN(n) ? null : n;
    };

    const results: { nik: string; nama: string; departemen: string; email?: string; sequenceNo?: string; lokasiPengambilan?: string; jumlahTiket?: number | null; anakDibawah2Tahun?: number | null; statusKehadiran?: string | null; selections: GiftSelection[] }[] = [];
    let emptyNikCounter = 0; // untuk NIK kosong — dikasih placeholder unik "0-1", "0-2", dst, supaya baris tetap ke-import (tidak di-skip diam-diam)
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim());
      let nik = cols[iNik] ?? "";
      if (!nik) {
        emptyNikCounter++;
        nik = `0-${emptyNikCounter}`;
      }

      const selections: GiftSelection[] = [];
      for (const slot of slotCols) {
        const val = cols[slot.i] ?? "";
        // Slot kosong ATAU cuma berisi Unicode Replacement Character
        // ("�", U+FFFD) — muncul kalau file CSV disimpan dengan encoding
        // selain UTF-8, sel kosong di Excel jadi ke-decode jadi karakter
        // ini alih-alih string kosong murni. Keduanya dilewati.
        if (val === "" || /^\uFFFD+$/.test(val)) continue;
        selections.push({ item: slot.header, variant: val, qty: 1 });
      }

      results.push({
        nik,
        nama: cols[iNama] ?? "",
        departemen: iDept !== -1 ? (cols[iDept] ?? "") : "",
        email: iEmail !== -1 ? cols[iEmail] : undefined,
        sequenceNo: iNo !== -1 ? (cols[iNo] ?? "") : "",
        lokasiPengambilan: iLokasi !== -1 ? (cols[iLokasi] ?? "") : "",
        jumlahTiket: iTiket !== -1 ? parseNum(cols[iTiket]) : null,
        anakDibawah2Tahun: iAnakBalita !== -1 ? parseNum(cols[iAnakBalita]) : null,
        statusKehadiran: iStatus !== -1 ? (cols[iStatus] ?? null) : null,
        selections,
      });
    }
    return results;
  }

  async function handleImportCsv() {
    if (!csvFile || !regEvent) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await csvFile.text();
      const rows = parseGiftCsv(text);
      if (rows.length === 0) { alert("Tidak ada data valid di file CSV."); return; }
      if (importMode === "update") {
        const result = await upsertGiftRegistrations(regEvent.id, rows);
        setImportResult(result);
      } else {
        const result = await bulkImportGiftRegistrations(regEvent.id, rows);
        setImportResult(result);
      }
      setRegs(await getGiftRegistrations(regEvent.id));
      setCsvFile(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengimpor CSV.");
    } finally {
      setImporting(false);
    }
  }

  const [togglingId, setTogglingId] = useState<string | null>(null);

  /** Ubah status klaim — bisa dua arah, jaga-jaga kalau petugas salah
   *  tandai (misal kepencet, atau salah cari NIK di /gift/lookup). */
  async function handleToggleClaim(r: GiftRegistration) {
    setTogglingId(r.id);
    try {
      if (r.claimed) {
        await unclaimGiftRegistration(r.id);
      } else {
        await claimGift(r.id, "Admin (Dashboard)");
      }
      if (regEvent) setRegs(await getGiftRegistrations(regEvent.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setTogglingId(null);
    }
  }

  // ── Filter komprehensif — bisa digabung (AND): kategori + ukuran + jumlah anak ──
  const [categoryFilter, setCategoryFilter] = useState<GiftCategory | "all">("all");
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [childrenFilter, setChildrenFilter] = useState<"all" | "0" | "1" | "2plus">("all");
  const [claimFilter, setClaimFilter] = useState<"all" | "claimed" | "not_claimed">("all");
  const [giftSearch, setGiftSearch] = useState("");

  const giftKpis = useMemo(() => {
    const sizeCounts = new Map<string, number>();
    const claimedSizeCounts = new Map<string, number>(); // cuma dari peserta yang SUDAH mengambil
    const categoryCounts: Record<GiftCategory, number> = { single: 0, couple: 0, family: 0 };
    const categorySizeCounts: Record<GiftCategory, Map<string, number>> = { single: new Map(), couple: new Map(), family: new Map() };
    let totalChildren = 0;
    let regsWithChildren = 0;
    let totalTiket = 0;
    let claimedTiket = 0; // tiket yang sudah "keluar" (dari peserta claimed=true)
    let totalAnakDibawah2 = 0;
    for (const r of regs) {
      const cat = getGiftCategory(r);
      if (cat) categoryCounts[cat]++;
      const childCount = countChildren(r);
      totalChildren += childCount;
      if (childCount > 0) regsWithChildren++;
      const effTiket = getEffectiveTicketCount(r); // Jumlah Tiket (CSV) dikurangi Anak <2 Tahun
      totalTiket += effTiket;
      if (r.claimed) claimedTiket += effTiket;
      totalAnakDibawah2 += r.anakDibawah2Tahun ?? 0;
      for (const s of r.selections) {
        if (s.variant == null) continue;
        const raw = String(s.variant).trim();
        if (raw === "" || /^\uFFFD+$/.test(raw)) continue;
        const parsed = parseGiftSize(raw);
        sizeCounts.set(parsed.size, (sizeCounts.get(parsed.size) ?? 0) + 1);
        if (r.claimed) claimedSizeCounts.set(parsed.size, (claimedSizeCounts.get(parsed.size) ?? 0) + 1);
        if (cat) categorySizeCounts[cat].set(parsed.size, (categorySizeCounts[cat].get(parsed.size) ?? 0) + 1);
      }
    }
    const sizeBreakdown = Array.from(sizeCounts.entries()).sort((a, b) => b[1] - a[1]);
    const claimedCount = regs.filter((r) => r.claimed).length;
    const totalBaju = sizeBreakdown.reduce((s, [, c]) => s + c, 0);
    return {
      total: regs.length,
      claimedCount,
      notClaimedCount: regs.length - claimedCount,
      totalBaju,
      totalTiket, // sekarang murni dari kolom "Jumlah Tiket" di CSV, independen dari data baju
      claimedTiket,
      totalAnakDibawah2,
      sizeBreakdown,
      claimedSizeCounts, // Map<ukuran, jumlah sudah diambil> — dipakai untuk hitung sisa stok
      categoryCounts,
      totalChildren,
      regsWithChildren,
      categorySizeBreakdown: {
        single: Array.from(categorySizeCounts.single.entries()).sort((a, b) => b[1] - a[1]),
        couple: Array.from(categorySizeCounts.couple.entries()).sort((a, b) => b[1] - a[1]),
        family: Array.from(categorySizeCounts.family.entries()).sort((a, b) => b[1] - a[1]),
      },
    };
  }, [regs]);

  /** Daftar semua ukuran unik yang ada di data — untuk dropdown filter ukuran. */
  const availableSizes = useMemo(() => giftKpis.sizeBreakdown.map(([size]) => size), [giftKpis.sizeBreakdown]);

  const visibleRegs = useMemo(() => {
    const q = giftSearch.trim().toLowerCase();
    return regs.filter((r) => {
      if (categoryFilter !== "all" && getGiftCategory(r) !== categoryFilter) return false;
      if (sizeFilter !== "all") {
        const hasSize = r.selections.some((s) => s.variant != null && parseGiftSize(String(s.variant)).size === sizeFilter);
        if (!hasSize) return false;
      }
      if (childrenFilter !== "all") {
        const n = countChildren(r);
        if (childrenFilter === "0" && n !== 0) return false;
        if (childrenFilter === "1" && n !== 1) return false;
        if (childrenFilter === "2plus" && n < 2) return false;
      }
      if (claimFilter === "claimed" && !r.claimed) return false;
      if (claimFilter === "not_claimed" && r.claimed) return false;
      if (q) {
        const hay = `${r.nama} ${r.nik} ${r.sequenceNo} ${r.departemen}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [regs, categoryFilter, sizeFilter, childrenFilter, claimFilter, giftSearch]);

  const giftReportExportPicker = useExportLanguagePicker((format, exportLang) => {
    if (!regEvent) return;
    const activeFilterLabel =
      claimFilter === "not_claimed" ? " (Belum Diambil)" :
      claimFilter === "claimed" ? " (Sudah Diambil)" :
      categoryFilter !== "all" ? ` (${CATEGORY_LABEL[categoryFilter].id})` :
      sizeFilter !== "all" ? ` (Ukuran ${sizeFilter})` : "";
    const opts = {
      lang: exportLang,
      titleId: `Laporan Pembagian — ${regEvent.name}${activeFilterLabel}`, titleEn: `Distribution Report — ${regEvent.name}${activeFilterLabel}`,
      filename: `Laporan_Pembagian_${regEvent.name.replace(/\s+/g, "_")}${activeFilterLabel.replace(/[^\w]+/g, "_")}`,
      kpis: [
        { labelId: "Total Peserta", labelEn: "Total Participants", value: giftKpis.total },
        { labelId: "Total Baju", labelEn: "Total Items", value: giftKpis.totalBaju },
        { labelId: "Total Tiket Event", labelEn: "Total Event Tickets", value: giftKpis.totalTiket },
        { labelId: "Sudah Diambil", labelEn: "Claimed", value: giftKpis.claimedCount },
        { labelId: "Belum Diambil", labelEn: "Not Claimed", value: giftKpis.notClaimedCount },
      ],
      breakdowns: [
        {
          titleId: "Jumlah Baju per Ukuran", titleEn: "Items by Size",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.sizeBreakdown.map(([size, count]) => ({ label: size, value: count })),
        },
        {
          titleId: "Jumlah Peserta per Kategori", titleEn: "Participants by Category",
          valueLabelId: "Jumlah Peserta", valueLabelEn: "Participant Count",
          items: [
            { label: "👤 Single (1 orang)", value: giftKpis.categoryCounts.single },
            { label: "💑 Suami Istri (2 orang)", value: giftKpis.categoryCounts.couple },
            { label: "👨‍👩‍👧‍👦 Keluarga (3-9 orang)", value: giftKpis.categoryCounts.family },
          ],
        },
        {
          titleId: "Ukuran Baju — Kategori Single", titleEn: "Sizes — Single Category",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.categorySizeBreakdown.single.map(([size, count]) => ({ label: size, value: count })),
        },
        {
          titleId: "Ukuran Baju — Kategori Suami Istri", titleEn: "Sizes — Couple Category",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.categorySizeBreakdown.couple.map(([size, count]) => ({ label: size, value: count })),
        },
        {
          titleId: "Ukuran Baju — Kategori Keluarga", titleEn: "Sizes — Family Category",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.categorySizeBreakdown.family.map(([size, count]) => ({ label: size, value: count })),
        },
      ],
      tableTitleId: "Daftar Peserta", tableTitleEn: "Participant List",
      tableRows: visibleRegs,
      tableColumns: [
        { key: "no", labelId: "No", labelEn: "No", get: (r: GiftRegistration) => r.sequenceNo },
        { key: "nama", labelId: "Nama", labelEn: "Name", get: (r: GiftRegistration) => r.nama },
        { key: "nik", labelId: "NIK", labelEn: "NIK", get: (r: GiftRegistration) => r.nik },
        { key: "total_peserta", labelId: "Total Peserta", labelEn: "Total Participants", get: (r: GiftRegistration) => countFilledSizes(r), align: "right" as const },
        {
          key: "daftar_ukuran", labelId: "Daftar Ukuran", labelEn: "Size List",
          get: (r: GiftRegistration) => r.selections
            .filter((s) => s.variant != null && String(s.variant).trim() !== "" && !/^\uFFFD+$/.test(String(s.variant).trim()))
            .map((s) => parseGiftSize(String(s.variant)).size)
            .join(", ") || "-",
        },
        { key: "jumlah_tiket", labelId: "Jumlah Tiket (Efektif)", labelEn: "Effective Tickets", get: (r: GiftRegistration) => getEffectiveTicketCount(r), align: "right" as const },
        { key: "status_kehadiran", labelId: "Status", labelEn: "Status", get: (r: GiftRegistration) => r.statusKehadiran ?? "-" },
        { key: "anak_dibawah_2", labelId: "Anak <2 Tahun", labelEn: "Children <2yo", get: (r: GiftRegistration) => r.anakDibawah2Tahun ?? 0, align: "right" as const },
        { key: "dept", labelId: "Departemen", labelEn: "Department", get: (r: GiftRegistration) => r.departemen },
        { key: "lokasi", labelId: "Lokasi", labelEn: "Location", get: (r: GiftRegistration) => r.lokasiPengambilan },
        { key: "kategori", labelId: "Kategori", labelEn: "Category", get: (r: GiftRegistration) => { const c = getGiftCategory(r); return c ? CATEGORY_LABEL[c].id : "-"; } },
        { key: "anak", labelId: "Jumlah Anak", labelEn: "Number of Children", get: (r: GiftRegistration) => countChildren(r), align: "right" as const },
        { key: "status", labelId: "Status Klaim", labelEn: "Claim Status", get: (r: GiftRegistration) => (r.claimed ? "Sudah Diambil" : "Belum Diambil") },
      ] as ReportColumn<GiftRegistration>[],
    };
    if (format === "csv") exportSummaryCsv(opts);
    else if (format === "excel") {
      exportGiftReportExcel2Sheets({
        lang: exportLang,
        eventName: `${regEvent.name}${activeFilterLabel}`,
        filename: `Laporan_Pembagian_${regEvent.name.replace(/\s+/g, "_")}`,
        kpis: opts.kpis,
        sizeBreakdown: giftKpis.sizeBreakdown,
        categoryCounts: giftKpis.categoryCounts,
        regs: visibleRegs,
      });
    }
    else exportSummaryPdf(opts);
  });

  function addItem() { setFormItems(prev => [...prev, { name: "", variants: [] }]); }
  function removeItem(i: number) { setFormItems(prev => prev.filter((_, idx) => idx !== i)); }
  function setItemName(i: number, name: string) { setFormItems(prev => prev.map((it, idx) => idx === i ? { ...it, name } : it)); }
  function addVariant(i: number) {
    const v = (variantInput[i] ?? "").trim();
    if (!v) return;
    setFormItems(prev => prev.map((it, idx) => idx === i ? { ...it, variants: [...it.variants, v] } : it));
    setVariantInput(prev => ({ ...prev, [i]: "" }));
  }
  function removeVariant(itemIdx: number, varIdx: number) {
    setFormItems(prev => prev.map((it, idx) => idx === itemIdx ? { ...it, variants: it.variants.filter((_, vi) => vi !== varIdx) } : it));
  }

  async function handleSave() {
    if (!formName.trim()) { alert("Nama event wajib diisi."); return; }
    const validItems = formItems.filter(i => i.name.trim());
    if (formMode === "self_register" && validItems.length === 0) { alert("Minimal satu item harus diisi."); return; }
    setSaving(true);
    try {
      const payload = { name: formName.trim(), description: formDesc.trim(), items: validItems, status: formStatus, mode: formMode };
      if (editTarget) { await updateGiftEvent(editTarget.id, payload); }
      else { await createGiftEvent(payload); }
      await load(); setView("list");
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  async function handleDelete(ev: GiftEvent) {
    try { await deleteGiftEvent(ev.id); await load(); setConfirmDelete(null); }
    catch (e) { alert(e instanceof Error ? e.message : "Gagal menghapus."); }
  }

  async function toggleStatus(ev: GiftEvent) {
    try { await updateGiftEvent(ev.id, { status: ev.status === "open" ? "closed" : "open" }); await load(); }
    catch { /**/ }
  }


  // ── REGISTRATIONS VIEW ──
  if (view === "registrations" && regEvent) return (
    <div style={{ ...cardStyle, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 13 }}>← Kembali</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)" }}>
          Peserta: {regEvent.name}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--t3)" }}>{regs.length} peserta</span>
        {regEvent.mode === "lookup" && regs.length > 0 && (
          <>
            <ReportExportButtons onExport={giftReportExportPicker.requestExport} disabled={regs.length === 0} />
            <button
              onClick={() => printGiftLabels(regs, "large")}
              style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
            >
              🖨️ Cetak Label (3×3)
            </button>
          </>
        )}
      </div>

      {regEvent.mode === "lookup" && regs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
          <GiftKpiCard icon="👥" label="JUMLAH KARYAWAN" value={giftKpis.total} color="var(--t1)" bg="var(--bg2)"
            onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setChildrenFilter("all"); setClaimFilter("all"); }} />
          <GiftKpiCard icon="🎁" label="TOTAL PESERTA (1-9)" value={giftKpis.totalBaju} color="var(--t1)" bg="var(--bg2)"
            onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setChildrenFilter("all"); setClaimFilter("all"); }} />
          <GiftKpiCard icon="⏳" label="BELUM DIAMBIL" value={giftKpis.notClaimedCount} color="#eab308" bg="rgba(234,179,8,0.1)"
            onClick={() => setClaimFilter("not_claimed")} active={claimFilter === "not_claimed"} />
          <GiftKpiCard icon="✅" label="SUDAH DIAMBIL" value={giftKpis.claimedCount} color="var(--green)" bg="rgba(34,197,94,0.1)"
            onClick={() => setClaimFilter("claimed")} active={claimFilter === "claimed"} />
          <GiftKpiCard icon="👤" label="KARYAWAN SINGLE (1)" value={giftKpis.categoryCounts.single} color="#6366f1" bg="rgba(99,102,241,0.08)"
            onClick={() => setCategoryFilter("single")} active={categoryFilter === "single"} />
          <GiftKpiCard icon="💑" label="BERKELUARGA, BELUM PUNYA ANAK (1-2)" value={giftKpis.categoryCounts.couple} color="#ec4899" bg="rgba(236,72,153,0.08)"
            onClick={() => setCategoryFilter("couple")} active={categoryFilter === "couple"} />
          <GiftKpiCard icon="👨‍👩‍👧‍👦" label="KELUARGA, SUDAH PUNYA ANAK (1-9)" value={giftKpis.categoryCounts.family} color="#10b981" bg="rgba(16,185,129,0.08)"
            onClick={() => setCategoryFilter("family")} active={categoryFilter === "family"} />
        </div>
      )}

      {regEvent.mode === "lookup" && regs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
          <ActualCountCard
            label="TOTAL BAJU AKTUAL (Fisik yang Datang)"
            value={regEvent.actualBajuCount}
            kebutuhan={giftKpis.totalBaju}
            onSave={async (val) => {
              await updateGiftEventActualCounts(regEvent.id, { actualBajuCount: val, actualTiketCount: regEvent.actualTiketCount });
              await load();
              const fresh = await getGiftEvents();
              const updated = fresh.find((e) => e.id === regEvent.id);
              if (updated) setRegEvent(updated);
            }}
          />
          <ActualCountCard
            label="TOTAL TIKET AKTUAL (Fisik yang Datang)"
            value={regEvent.actualTiketCount}
            kebutuhan={giftKpis.totalTiket}
            onSave={async (val) => {
              await updateGiftEventActualCounts(regEvent.id, { actualBajuCount: regEvent.actualBajuCount, actualTiketCount: val });
              await load();
              const fresh = await getGiftEvents();
              const updated = fresh.find((e) => e.id === regEvent.id);
              if (updated) setRegEvent(updated);
            }}
          />
        </div>
      )}

      {regEvent.mode === "lookup" && regEvent.actualTiketCount != null && (
        <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
          🎟️ Sisa Tiket saat ini: <b style={{ color: (regEvent.actualTiketCount - giftKpis.claimedTiket) < 0 ? "var(--red)" : "var(--green)" }}>{regEvent.actualTiketCount - giftKpis.claimedTiket}</b>
          <span style={{ color: "var(--t3)" }}>({regEvent.actualTiketCount} aktual − {giftKpis.claimedTiket} sudah diambil)</span>
        </div>
      )}

      {regEvent.mode === "lookup" && giftKpis.totalAnakDibawah2 > 0 && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
          👶 <b>{giftKpis.totalAnakDibawah2}</b> anak di bawah 2 tahun terdaftar. Jumlah Tiket dihitung dari kolom &quot;Jumlah Tiket&quot; di CSV (independen dari jumlah baju).
        </div>
      )}

      {regEvent.mode === "lookup" && giftKpis.sizeBreakdown.length > 0 && (
        <StockPerSizeCard
          sizeBreakdown={giftKpis.sizeBreakdown}
          claimedSizeCounts={giftKpis.claimedSizeCounts}
          actualStockPerSize={regEvent.actualStockPerSize}
          onSave={async (stock) => {
            await updateGiftEventStockPerSize(regEvent.id, stock);
            const fresh = await getGiftEvents();
            const updated = fresh.find((e) => e.id === regEvent.id);
            if (updated) setRegEvent(updated);
          }}
        />
      )}

      {regEvent.mode === "lookup" && giftKpis.sizeBreakdown.length > 0 && (
        <div style={{ background: "var(--bg2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 10 }}>TOTAL PER UKURAN BAJU</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {giftKpis.sizeBreakdown.map(([size, count]) => (
              <button
                key={size}
                onClick={() => setSizeFilter(sizeFilter === size ? "all" : size)}
                style={{
                  background: sizeFilter === size ? "var(--brand)" : "var(--surface)",
                  border: `1px solid ${sizeFilter === size ? "var(--brand)" : "var(--border2)"}`,
                  borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: sizeFilter === size ? "#fff" : "var(--t1)" }}>{size}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: sizeFilter === size ? "#fff" : "var(--brand)" }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {regEvent.mode === "lookup" && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--t1)", marginBottom: 6 }}>📥 Import Data dari CSV</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setImportMode("insert")}
              style={{
                padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: importMode === "insert" ? "var(--brand)" : "var(--surface)",
                color: importMode === "insert" ? "#fff" : "var(--t2)",
              }}
            >
              📥 Import Data Baru
            </button>
            <button
              onClick={() => setImportMode("update")}
              style={{
                padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: importMode === "update" ? "var(--brand)" : "var(--surface)",
                color: importMode === "update" ? "#fff" : "var(--t2)",
              }}
            >
              🔄 Update Data Existing
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--t3)", marginBottom: 12 }}>
            {importMode === "update" ? (
              <>
                Mode <strong>Update</strong>: NIK yang <strong>sudah ada</strong> akan diperbarui (nama, ukuran, dll) dari data CSV terbaru — <strong>status "sudah/belum diambil" TIDAK berubah</strong>. NIK yang belum ada akan ditambahkan sebagai baris baru. Cocok untuk perbaiki data yang salah tanpa kehilangan progres pengambilan.
              </>
            ) : (
              <>
                Kolom wajib: <code>Nama</code>, <code>NIK/Global ID</code>. Kolom opsional yang dikenali: <code>No, Departemen, Lokasi Pengambilan, Email, Jumlah Tiket, Jumlah Anak &lt; 2 tahun, Status</code>. <strong>Kolom lain apapun namanya</strong> (misal <code>1, 2, 3...9</code>) otomatis dianggap slot ukuran — 1 baris = 1 orang, kolom yang kosong dilewati otomatis.
                <br />
                ⚠️ Baris dengan <strong>NIK kosong</strong> tetap di-import (tidak dilewati) dengan NIK sementara <code>0-1</code>, <code>0-2</code>, dst — mohon cek &amp; perbaiki manual di tabel Peserta setelah import.
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12, color: "var(--t2)" }} />
            <button
              onClick={handleImportCsv}
              disabled={!csvFile || importing}
              style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: !csvFile || importing ? "default" : "pointer", opacity: !csvFile || importing ? 0.6 : 1 }}
            >
              {importing ? "Memproses..." : importMode === "update" ? "Update" : "Import"}
            </button>
          </div>
          {importResult && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--t2)" }}>
              {importResult.processed != null ? (
                <>✅ {importResult.processed} data berhasil diperbarui/ditambahkan (status klaim tidak berubah).</>
              ) : (
                <>
                  ✅ {importResult.inserted} data berhasil ditambahkan.
                  {importResult.duplicates && importResult.duplicates.length > 0 && (
                    <div style={{ color: "var(--orange-text)", marginTop: 4 }}>
                      ⚠️ {importResult.duplicates.length} NIK dilewati karena sudah ada di event ini: {importResult.duplicates.join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {regsLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>Memuat...</div>
      ) : regs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div>Belum ada yang mendaftar</div>
        </div>
      ) : (
        <div>
          {regEvent.mode === "lookup" && (
            <div style={{ position: "relative", marginBottom: 12, maxWidth: 380 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 13 }}>🔍</span>
              <input
                value={giftSearch}
                onChange={(e) => setGiftSearch(e.target.value)}
                placeholder="Cari nama, NIK, atau nomor urut..."
                className={styles.formInput}
                style={{ paddingLeft: 36, borderRadius: "var(--pill)" }}
              />
            </div>
          )}
          {regEvent.mode === "lookup" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {([
                ["all", `Semua (${regs.length})`],
                ["single", `👤 Single (${giftKpis.categoryCounts.single})`],
                ["couple", `💑 Suami Istri (${giftKpis.categoryCounts.couple})`],
                ["family", `👨‍👩‍👧‍👦 Keluarga (${giftKpis.categoryCounts.family})`],
              ] as [GiftCategory | "all", string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  style={{
                    padding: "7px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)",
                    background: categoryFilter === key ? "var(--brand)" : "var(--bg2)",
                    color: categoryFilter === key ? "#fff" : "var(--t2)",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {regEvent.mode === "lookup" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
                className={styles.formSelect}
                style={{ width: "auto", fontSize: 12.5 }}
              >
                <option value="all">📏 Semua Ukuran</option>
                {availableSizes.map((size) => (
                  <option key={size} value={size}>Ukuran: {size}</option>
                ))}
              </select>
              <select
                value={childrenFilter}
                onChange={(e) => setChildrenFilter(e.target.value as typeof childrenFilter)}
                className={styles.formSelect}
                style={{ width: "auto", fontSize: 12.5 }}
              >
                <option value="all">🧒 Semua (Jumlah Anak)</option>
                <option value="0">Tanpa Anak</option>
                <option value="1">1 Anak</option>
                <option value="2plus">2+ Anak</option>
              </select>
              {(categoryFilter !== "all" || sizeFilter !== "all" || childrenFilter !== "all" || claimFilter !== "all" || giftSearch !== "") && (
                <button
                  onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setChildrenFilter("all"); setClaimFilter("all"); setGiftSearch(""); }}
                  style={{ background: "none", border: "none", color: "var(--red)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  ✕ Reset Filter
                </button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--t3)", fontWeight: 600 }}>
                Menampilkan {visibleRegs.length} dari {regs.length} peserta
              </span>
            </div>
          )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg2)" }}>
                {["NIK", "Nama", "Departemen", "Email", "Item", "Status", "Terdaftar", "Aksi"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--t3)", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRegs.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", color: "var(--t2)" }}>{r.nik}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--t1)" }}>{r.nama}</td>
                  <td style={{ padding: "10px 12px", color: "var(--t2)" }}>{r.departemen}</td>
                  <td style={{ padding: "10px 12px", color: "var(--t3)", fontSize: 12 }}>{r.email}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.selections.filter(s => s.variant != null && String(s.variant).trim() !== "" && !/^\uFFFD+$/.test(String(s.variant).trim())).map(s => {
                      const parsed = parseGiftSize(String(s.variant));
                      return (
                        <span key={s.item} style={{ fontSize: 11, background: "var(--bg2)", color: "var(--t1)", borderRadius: 6, padding: "2px 8px", marginRight: 4, whiteSpace: "nowrap" }}>
                          {s.item} ({parsed.size})
                        </span>
                      );
                    })}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: r.claimed ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)", color: r.claimed ? "var(--green)" : "#eab308" }}>
                      {r.claimed ? "✅ Diambil" : "⏳ Belum"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--t3)", fontSize: 11 }}>
                    {new Date(r.registeredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      onClick={() => handleToggleClaim(r)}
                      disabled={togglingId === r.id}
                      title={r.claimed ? "Batalkan status — kembalikan jadi Belum Diambil" : "Tandai manual sebagai Sudah Diambil"}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border2)",
                        background: "var(--surface)", color: "var(--t2)", cursor: togglingId === r.id ? "default" : "pointer",
                        opacity: togglingId === r.id ? 0.5 : 1, whiteSpace: "nowrap",
                      }}
                    >
                      {togglingId === r.id ? "..." : r.claimed ? "↩️ Batalkan" : "✅ Tandai"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
      {giftReportExportPicker.pending && (
        <LanguagePickerModal key={giftReportExportPicker.pending} format={giftReportExportPicker.pending} onConfirm={giftReportExportPicker.confirm} onClose={giftReportExportPicker.cancel} />
      )}
    </div>
  );

  // ── CREATE / EDIT FORM ──
  if (view === "create" || view === "edit") return (
    <div style={{ ...cardStyle, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 13 }}>← Batal</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)" }}>
          {view === "create" ? "Buat Event Baru" : `Edit: ${editTarget?.name}`}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>NAMA EVENT</label>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Contoh: Pembagian Seragam 2026" className={styles.formInput} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>DESKRIPSI (opsional)</label>
          <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Informasi tambahan untuk karyawan" className={styles.formInput} />
        </div>
        <div>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>STATUS</label>
          <select value={formStatus} onChange={e => setFormStatus(e.target.value as "open" | "closed")} className={styles.formSelect} style={{ width: "auto" }}>
            <option value="open">🟢 Buka (karyawan bisa daftar)</option>
            <option value="closed">🔴 Tutup</option>
          </select>
        </div>
        <div>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>MODE PROJECT</label>
          <select value={formMode} onChange={e => setFormMode(e.target.value as "self_register" | "lookup")} className={styles.formSelect} style={{ width: "auto" }}>
            <option value="self_register">📝 Karyawan Daftar Sendiri</option>
            <option value="lookup">📥 Import Data (Admin) — cari by NIK</option>
          </select>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 5 }}>
            {formMode === "lookup"
              ? "Karyawan tidak perlu daftar apapun — cukup kasih NIK ke petugas, semua detail muncul otomatis."
              : "Karyawan mengisi form pendaftaran sendiri dan memilih item yang diinginkan."}
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--t2)", marginBottom: 12 }}>Item yang Dibagikan</div>
      {formItems.map((item, i) => (
        <div key={i} style={{ background: "var(--bg2)", borderRadius: 14, padding: "16px", marginBottom: 10, border: "1px solid var(--border2)" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <input value={item.name} onChange={e => setItemName(i, e.target.value)} placeholder="Nama item (contoh: Seragam)" className={styles.formInput} style={{ flex: 1 }} />
            {formItems.length > 1 && (
              <button onClick={() => removeItem(i)} style={{ background: "rgba(239,68,68,0.1)", border: "none", borderRadius: 8, padding: "8px 12px", color: "var(--red)", cursor: "pointer", fontSize: 16 }}>×</button>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>Varian/Ukuran (kosongkan jika semua sama):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {item.variants.map((v, vi) => (
              <span key={vi} style={{ fontSize: 12, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                {v}
                <button onClick={() => removeVariant(i, vi)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={variantInput[i] ?? ""} onChange={e => setVariantInput(p => ({ ...p, [i]: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addVariant(i))}
              placeholder="Ketik ukuran lalu Enter" className={styles.formInput} style={{ flex: 1, padding: "8px 12px" }} />
            <button onClick={() => addVariant(i)} style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>+ Tambah</button>
          </div>
        </div>
      ))}
      <button onClick={addItem} style={{ background: "none", border: "1.5px dashed var(--border2)", borderRadius: 12, padding: "10px 16px", color: "var(--t3)", cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 20 }}>
        + Tambah Item Lain
      </button>

      <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>
        {saving ? "Menyimpan..." : view === "create" ? "Buat Event" : "Simpan Perubahan"}
      </button>
    </div>
  );

  // ── LIST VIEW ──
  return (
    <div style={{ ...cardStyle, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)" }}>🎁 Pembagian Gift / Seragam</div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>Kelola program pembagian dan pantau peserta</div>
        </div>
        <button onClick={openCreate} style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Event Baru
        </button>
      </div>

      {/* Links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "🔗 Link Pendaftaran Karyawan", url: `${baseUrl}/gift`, desc: "Bagikan ke karyawan (mode Daftar Sendiri)" },
          { label: "🔑 Link Verifikasi Petugas", url: `${baseUrl}/gift/verify`, desc: "Cek passcode — mode Daftar Sendiri" },
          { label: "🔍 Link Cari by NIK", url: `${baseUrl}/gift/lookup`, desc: "Cek data via NIK — mode Import Data" },
        ].map(l => (
          <div key={l.url} style={{ background: "var(--bg2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border2)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 6 }}>{l.label}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>{l.desc}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input readOnly value={l.url} style={{ flex: 1, fontSize: 11, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--t2)", fontFamily: "var(--mono)" }} />
              <button onClick={() => navigator.clipboard.writeText(l.url)} style={{ background: "var(--brand)", border: "none", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 11, cursor: "pointer" }}>Salin</button>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎁</div>
          <div style={{ fontWeight: 700, color: "var(--t2)", marginBottom: 4 }}>Belum ada event</div>
          <div style={{ fontSize: 13 }}>Buat event baru untuk mulai pembagian.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map(ev => (
            <div key={ev.id} style={{ border: "1px solid var(--border2)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px", background: "var(--bg2)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: "var(--t1)" }}>{ev.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: ev.status === "open" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)", color: ev.status === "open" ? "var(--green)" : "var(--red)" }}>
                      {ev.status === "open" ? "BUKA" : "TUTUP"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: "var(--bg2)", color: "var(--t3)" }}>
                      {ev.mode === "lookup" ? "📥 Import Data" : "📝 Daftar Sendiri"}
                    </span>
                  </div>
                  {ev.description && <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 6 }}>{ev.description}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ev.items.map(item => (
                      <span key={item.name} style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, padding: "2px 10px", color: "var(--t2)" }}>
                        {item.name}{item.variants.length > 0 ? ` (${item.variants.join(", ")})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 14 }}>
                  <button onClick={() => openRegistrations(ev)} title="Lihat peserta" style={{ background: "rgba(61,111,242,0.1)", border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>👥</button>
                  <button onClick={() => toggleStatus(ev)} title={ev.status === "open" ? "Tutup pendaftaran" : "Buka pendaftaran"} style={{ background: ev.status === "open" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>
                    {ev.status === "open" ? "🔒" : "🔓"}
                  </button>
                  <button onClick={() => openEdit(ev)} title="Edit" style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>✏️</button>
                  <button onClick={() => setConfirmDelete(ev)} title="Hapus" style={{ background: "rgba(239,68,68,0.1)", border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={380}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)", marginBottom: 8 }}>Hapus Event?</div>
            <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 20 }}>
              Event "<strong>{confirmDelete.name}</strong>" dan semua data pendaftarannya akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Hapus</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
