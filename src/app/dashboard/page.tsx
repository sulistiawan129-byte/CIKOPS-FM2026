"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { TaskBoardBar, TaskCard, TaskEmpty, TaskSlipModal, sortTasks } from "./TasksUI";
import tk from "./tasks.module.css";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";
import { getMyProfile, canAccessTab, lockedTabOf, roleLabel, isPrbOnly, cancelTaskByAdmin, deleteTask, deleteTaskBatch, getDrivers, type MyProfile, getEmployees, getJobTypes, getTasksByDate, getVehicles, subscribeToTasks, updateTaskStatus } from "@/lib/api";
import type { Driver, Employee, JobType, TaskDetail, TaskStatus, Vehicle } from "@/lib/types";
import { computeStats, plantLocation } from "@/lib/types";
import { useLang, useTheme } from "@/lib/providers";
import LockerTab from "./LockerTab";
import CanteenTab from "./CanteenTab";
import MgmtReportTab from "./MgmtReportTab";
import SecurityTab from "./SecurityTab";
import { LinksTab } from "./LinksTab";
import AccountsTab, { ExecutiveView } from "./AccountsTab";
import CalendarAgenda from "./CalendarAgenda";
import AtkTab from "./AtkTab";
import GaTab from "./GaTab";
import TgaTab from "./TgaTab";
import ReceptionistTab from "./receptionist/ReceptionistTab";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/Icon";
import SideNav, { type SideNavGroup } from "./SideNav";
import of from "./opfund.module.css";
import { ModuleHeader, ModulePage } from "./ModuleShell";
import { GasStationsTab } from "./GasStationsTab";
import { todayStr, DashboardTab, NAV_GROUPS, useIsMobile } from "./dashboardShared";
import { HomeTab, OverviewTab } from "./HomeTab";
import { ReportModal, CreateTaskModal } from "./TaskModals";
import { ClaimsTab } from "./ClaimsTab";
import { OpFundPage } from "./OpFundTab";
import { ActivityLogTab } from "./ActivityLogTab";
import { LoginScreen } from "./LoginScreen";
import { GateTab, VehiclesTab } from "./VehiclesTab";
import { PrinterTab } from "./PrinterTab";
import { EmployeeRequestsTab } from "./EmployeeRequestsTab";
import { MasterDataTab } from "./MasterDataTab";
import { GiftMasterPanel } from "./GiftTab";

/** Label pendek grup untuk rail sidebar. */
const NAV_SHORT_ID: Record<string, string> = { fleet: "Fleet", finance: "Finance", facility: "Fasilitas", security: "Security", system: "Sistem" };
const NAV_SHORT_EN: Record<string, string> = { fleet: "Fleet", finance: "Finance", facility: "Facility", security: "Security", system: "System" };

/** Menu yang punya alamat sendiri: /dashboard/<id>. */
// "driverbudget" tetap punya alamat lama → dibuka sebagai tab Budget Driver di Dana Operasional
const URL_TABS = new Set<DashboardTab>(["home", "overview", "tasks", "driverbudget", ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id))]);
function tabFromPath(pathname: string): DashboardTab | null {
  const m = pathname.match(/^\/dashboard\/([a-z]+)\/?$/);
  const id = m?.[1] as DashboardTab | undefined;
  return id && URL_TABS.has(id) ? id : null;
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
        // Akun yang dikunci ke satu menu (mis. receptionist): selalu buka menu itu.
        const locked = lockedTabOf(p);
        if (locked) {
          // Akun tanpa Beranda: buka menu dari URL bila boleh, selain itu menu pertamanya.
          const fromUrl = tabFromPath(typeof window !== "undefined" ? window.location.pathname : "");
          setActiveTab((fromUrl && canAccessTab(p, fromUrl) ? fromUrl : locked) as DashboardTab);
          return;
        }
        // Akun dengan menu terbatas: buka menu pertamanya, kecuali URL sudah menunjuk menu yang boleh diakses.
        if (p?.allowedTabs && p.allowedTabs.length > 0 && !p.allowedTabs.includes("overview")) {
          const fromUrl = tabFromPath(typeof window !== "undefined" ? window.location.pathname : "");
          if (!fromUrl || !canAccessTab(p, fromUrl)) setActiveTab(p.allowedTabs[0] as DashboardTab);
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

  // ── URL per menu: /dashboard/<menu> (bisa dibagikan, di-bookmark, tombol Back browser jalan) ──
  const urlReadyRef = useRef(false);
  useEffect(() => {
    const t = tabFromPath(window.location.pathname);
    if (t && t !== activeTabRef.current) { activeTabRef.current = t; setActiveTabState(t); }
    urlReadyRef.current = true;
    const onPop = () => {
      const next = tabFromPath(window.location.pathname) || "home";
      activeTabRef.current = next;
      setActiveTabState(next);
      if (next === "home") setActiveHomeGroup(undefined);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!urlReadyRef.current) return;
    const path = activeTab === "home" ? "/dashboard" : `/dashboard/${activeTab}`;
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }, [activeTab]);

  // Akun scope PRB hanya boleh Penugasan, Armada, Master Data — kembalikan ke Home bila tab lain terbuka.
  const lockedTab = lockedTabOf(myProfile) as DashboardTab | null;
  useEffect(() => {
    if (lockedTab) { if (!canAccessTab(myProfile, activeTab)) setActiveTab(lockedTab); return; }
    if (activeTab !== "home" && myProfile && !canAccessTab(myProfile, activeTab)) setActiveTab("home");
  }, [activeTab, myProfile, setActiveTab, lockedTab]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
const [masterDataInitialSub, setMasterDataInitialSub] = useState<"drivers" | "employees" | "jobtypes">("drivers");

  const [dateFilter, setDateFilter] = useState(todayStr());
  /** Dari Kalender: buka Penugasan pada tanggal tertentu. */
  const openTasksOn = useCallback((d: string) => { setDateFilter(d); setActiveTab("tasks"); }, [setActiveTab]);
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

  // Grup sidebar: Dashboard (Beranda + Ringkasan) lalu grup menu yang boleh diakses.
  const sideGroups: SideNavGroup[] = [
    ...(!lockedTab ? [{
      id: "dashboard", icon: "home", label: "Dashboard", short: "Dashboard",
      items: [
        { id: "home", label: lang === "en" ? "Home" : "Beranda" },
        ...(!isPrbOnly(myProfile) ? [{ id: "overview", label: lang === "en" ? "Overview" : "Ringkasan" }] : []),
      ],
    }] : []),
    ...NAV_GROUPS.map((g) => ({
      id: g.id,
      icon: g.id,
      label: lang === "en" ? g.labelEn : g.labelId,
      short: (lang === "en" ? NAV_SHORT_EN : NAV_SHORT_ID)[g.id] ?? (lang === "en" ? g.labelEn : g.labelId),
      items: g.tabs.filter((tb) => canAccessTab(myProfile, tb.id)).map((tb) => ({ id: tb.id, label: lang === "en" ? tb.labelEn : tb.labelId, desc: lang === "en" ? tb.descEn : tb.descId })),
    })).filter((g) => g.items.length > 0),
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", gap: isMobile ? 0 : 18, padding: isMobile ? 0 : 16, alignItems: "flex-start" }}>
      {/* ── Sidebar: rail grup + panel menu ── */}
      <SideNav
        groups={sideGroups}
        activeTab={activeTab === "driverbudget" ? "opfund" : activeTab}
        onSelect={(id) => { setActiveTab(id as DashboardTab); if (id === "home") setActiveHomeGroup(undefined); }}
        lang={lang === "en" ? "en" : "id"}
        appName={t.appName}
        live={liveConnected}
        userName={myProfile?.fullName || user?.email?.split("@")[0] || "-"}
        userRole={roleLabel(myProfile)}
        onSignOut={() => signOut()}
        publicHref={!isPrbOnly(myProfile) && !lockedTab ? "/dashboard-viewonly" : undefined}
        isMobile={isMobile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Main content wrapper ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Topbar */}
        <div className="premiumChrome" style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "10px 14px" : "10px 16px", borderRadius: isMobile ? 0 : 20, marginBottom: isMobile ? 0 : 18, position: "sticky", top: isMobile ? 0 : 16, zIndex: 100 }}>
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)} aria-label="Menu" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t1)", display: "grid", placeItems: "center" }}>
              <Icon name="menu" size={22} />
            </button>
          )}
          {lockedTab && <div style={{ flex: 1 }} />}
          {!isMobile && !lockedTab && (
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
          {!isPrbOnly(myProfile) && !lockedTab && <a
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
                  {roleLabel(myProfile)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: "auto" }}>
      {activeTab !== "home" && !lockedTab && (() => {
        const labelOf = (id: DashboardTab) => {
          if (id === "home") return lang === "en" ? "Dashboard" : "Dashboard";
          if (id === "overview") return lang === "en" ? "Overview" : "Ringkasan";
          if (id === "driverbudget") return lang === "en" ? "Operational Fund" : "Dana Operasional";
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
        <div style={{ marginBottom: 14 }}><ModuleHeader
          kicker={lang === "en" ? "Fleet · Driver tasks" : "Fleet · Penugasan driver"}
          title={lang === "en" ? "Tasks" : "Penugasan"}
          desc={lang === "en" ? "Assign drivers, follow trips live, and print task slips." : "Tugaskan driver, pantau perjalanan secara langsung, dan cetak slip tugas."}
          actions={<>
            {!isPrbOnly(myProfile) && <button type="button" onClick={() => setReportModalOpen(true)} title="Laporan & Analytics" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 14px", borderRadius: 12, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--t1)", fontWeight: 700, cursor: "pointer" }}>
              <Icon name="reports" size={16} /> {lang === "en" ? "Report" : "Laporan"}
            </button>}
            <button className={styles.btnPrimary} onClick={() => setModalOpen(true)}>{isMobile ? "+ Tugaskan" : "+ Tugaskan Driver"}</button>
          </>}
        /></div>
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
          {activeTab === "home" && <HomeTab setActiveTab={setActiveTab} openTasksOn={openTasksOn} myProfile={myProfile} activeGroupId={activeHomeGroup} setActiveGroupId={setActiveHomeGroup} />}
          {activeTab === "overview" && <OverviewTab setActiveTab={setActiveTab} myProfile={myProfile} />}
          {activeTab === "vehicles" && <VehiclesTab myProfile={myProfile} />}
          {activeTab === "gate" && <GateTab myProfile={myProfile} />}
          {activeTab === "claims" && <ClaimsTab myProfile={myProfile} />}
          {(activeTab === "opfund" || activeTab === "driverbudget") && <OpFundPage myProfile={myProfile} initial={activeTab === "driverbudget" ? "budget" : "fund"} />}
          {activeTab === "gasstations" && <GasStationsTab />}
          {activeTab === "reports" && <MgmtReportTab myProfile={myProfile} />}
        {activeTab === "masterdata" && (
  <MasterDataTab
    initialSub={masterDataInitialSub}
    restrictedToDriversOnly={myProfile?.accessScope === "tasks_only"}
    myProfile={myProfile}
  />
)}
          {activeTab === "canteen" && <CanteenTab />}
          {activeTab === "locker" && <LockerTab />}
          {activeTab === "gift" && (
            <ModulePage>
              <ModuleHeader
                kicker={lang === "en" ? "Facility · Distribution" : "Fasilitas · Pembagian"}
                title={lang === "en" ? "Gift & Uniform Distribution" : "Pembagian Gift / Seragam"}
                desc={lang === "en" ? "Run distribution programs (gifts, uniforms, merchandise): registration links, officer verification, stock per size, and participant tracking." : "Kelola program pembagian (gift, seragam, merchandise): link pendaftaran, verifikasi petugas, stok per ukuran, dan pantau peserta."}
              />
              <GiftMasterPanel cardStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--shadow-sm)" }} />
            </ModulePage>
          )}
          {activeTab === "printer" && <PrinterTab />}
          {activeTab === "employeerequests" && <EmployeeRequestsTab />}
          {activeTab === "atk" && <AtkTab myProfile={myProfile} />}
          {activeTab === "gafacility" && <GaTab myProfile={myProfile} />}
          {activeTab === "tga" && <TgaTab myProfile={myProfile} />}
          {activeTab === "receptionist" && <ReceptionistTab myProfile={myProfile} />}
          {activeTab === "security" && <SecurityTab myProfile={myProfile} />}
          {activeTab === "executive" && <ExecutiveView onReports={() => setActiveTab("reports")} />}
          {activeTab === "accounts" && <AccountsTab myProfile={myProfile} />}
          {activeTab === "links" && <LinksTab myProfile={myProfile} />}
          {activeTab === "calendar" && <CalendarAgenda variant="full" myProfile={myProfile} onOpenTasks={openTasksOn} />}
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
