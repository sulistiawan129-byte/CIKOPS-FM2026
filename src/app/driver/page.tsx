"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./driver.module.css";
import {
  acceptTask,
  cancelTaskByDriver,
  changeDriverPassword,
  completeTask,
  driverGetSession,
  driverSignIn,
  driverSignOut,
  getClaimsByDriver,
  getDriverHistory,
  getDriverTasksToday,
  subscribeToDriverClaims,
  subscribeToTasks,
  getDriverDutyInfo,
} from "@/lib/api";
import type { Claim, Driver, TaskDetail } from "@/lib/types";
import { computeStats } from "@/lib/types";
import { useLang, useTheme } from "@/lib/providers";
import type { Dict } from "@/lib/dictionary";
import { todayLocalISODate } from "@/lib/dateUtils";
import { getUserDutyStatus, isUserDriver, useNowTick, dutyHoursLabel } from "@/lib/duty";

type Screen = "splash" | "login" | "app";
type Tab = "today" | "history" | "claims" | "profile";

export default function DriverPanelPage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const [screen, setScreen] = useState<Screen>("splash");
  const [splashFading, setSplashFading] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [loggedDriver, setLoggedDriver] = useState<Driver | null>(null);
  const dutyNow = useNowTick();

  // Tipe driver (operational / user) + nama user diambil terpisah lewat RPC
  // (sesi login driver tidak selalu bisa SELECT langsung ke tabel drivers).
  useEffect(() => {
    if (!loggedDriver || loggedDriver.driver_type !== undefined) return;
    let cancelled = false;
    getDriverDutyInfo(loggedDriver.id).then((info) => {
      if (!cancelled) setLoggedDriver((cur) => (cur && cur.id === loggedDriver.id ? { ...cur, ...info } : cur));
    });
    return () => { cancelled = true; };
  }, [loggedDriver]);

  const [todayTasks, setTodayTasks] = useState<TaskDetail[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [cancelConfirmTask, setCancelConfirmTask] = useState<TaskDetail | null>(
    null
  );
  const knownAssignedIdsRef = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string | null>(
    null
  );
  const [historyTasks, setHistoryTasks] = useState<TaskDetail[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyApplied, setHistoryApplied] = useState(false);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [newClaimCount, setNewClaimCount] = useState(0);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwModalNew, setPwModalNew] = useState("");
  const [pwModalConfirm, setPwModalConfirm] = useState("");
  const [pwModalError, setPwModalError] = useState("");
  const [pwModalBusy, setPwModalBusy] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // ── splash screen: tampil sebentar, lalu cek sesi Supabase Auth ──
useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1300);
    const nextTimer = setTimeout(async () => {
      try {
        const driver = await driverGetSession();
        if (driver) {
          setLoggedDriver(driver);
          setScreen("app");
          setTab("today");
          return;
        }
      } catch {
        // fall through ke layar login
      }
      setScreen("login");
    }, 1700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(nextTimer);
    };
  }, []);

  // Preload audio element — HTML Audio works in Median WebView where
  // Web Audio API is often blocked without user gesture workaround.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio("/notif.wav");
    audio.preload = "auto";
    audio.load();
    audioRef.current = audio;
  }, []);

  function playNotificationSound() {
    // Try HTML Audio first (most reliable in Median WebView)
    try {
      if (audioRef.current) {
        const a = audioRef.current;
        a.currentTime = 0;
        const p = a.play();
        if (p !== undefined) {
          p.catch(() => {
            // Blocked — fall through to Web Audio
            playWebAudio();
          });
          return;
        }
      }
    } catch {}
    playWebAudio();
  }

  function playWebAudio() {
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AudioCtx();
        audioCtxRef.current = ctx;
      }
      const doPlay = () => {
        const playTone = (freq: number, start: number, dur: number, gain = 0.5) => {
          const osc = ctx!.createOscillator();
          const g = ctx!.createGain();
          osc.type = "square";
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          osc.connect(g);
          g.connect(ctx!.destination);
          osc.start(start);
          osc.stop(start + dur);
        };
        const now = ctx!.currentTime;
        [0, 0.7].forEach((off) => {
          playTone(988,  now + off,        0.14, 0.55);
          playTone(1318, now + off + 0.16, 0.16, 0.55);
          playTone(988,  now + off + 0.34, 0.14, 0.55);
        });
      };
      if (ctx.state === "suspended") ctx.resume().then(doPlay).catch(() => {});
      else doPlay();
    } catch {}
  }

  // Warm up HTML Audio + AudioContext on first touch
  useEffect(() => {
    function warmUp() {
      // Unlock HTML Audio
      if (audioRef.current) {
        const a = audioRef.current;
        const p = a.play();
        if (p) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      }
      // Unlock Web Audio
      try {
        if (!audioCtxRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          if (ctx.state === "suspended") ctx.resume().catch(() => {});
        }
      } catch {}
    }
    document.addEventListener("touchstart", warmUp, { once: true, passive: true });
    document.addEventListener("click", warmUp, { once: true, passive: true });
    return () => {
      document.removeEventListener("touchstart", warmUp);
      document.removeEventListener("click", warmUp);
    };
  }, []);

  // Register Service Worker untuk caching + siap push notification
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // OneSignal JavaScript Bridge — daftarkan driver sebagai External User ID
  // Median SDK v5: pakai median.onesignal.login(externalId)
  // 4 jalur supaya pasti terpanggil terlepas dari timing bridge ready:
  // 1. median_onesignal_info callback (dipanggil otomatis Median setelah page load)
  // 2. Langsung saat komponen mount
  // 3. Retry 2 detik  4. Retry 5 detik (cold start lambat)
  useEffect(() => {
    if (screen !== "app" || !loggedDriver) return;
    const driverId = loggedDriver.id;

    function doLogin() {
      try {
        const w = window as Window & {
          median?: { onesignal?: { login?: (id: string) => void } };
        };
        if (w.median?.onesignal?.login) {
          w.median.onesignal.login(driverId);
        }
      } catch {}
    }

    // Jalur 1: callback global yang Median panggil otomatis setelah bridge siap
    (window as Window & {
      median_onesignal_info?: (data: unknown) => void;
    }).median_onesignal_info = () => { doLogin(); };

    // Jalur 2, 3, 4
    doLogin();
    const t1 = setTimeout(doLogin, 2000);
    const t2 = setTimeout(doLogin, 5000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      delete (window as Window & { median_onesignal_info?: unknown }).median_onesignal_info;
    };
  }, [screen, loggedDriver?.id]);

  // Logout OneSignal saat driver keluar supaya device tidak terima notif driver lain
  // (dipanggil dari fungsi logout() di bawah)
  function oneSignalLogout() {
    try {
      const w = window as Window & {
        median?: { onesignal?: { logout?: () => void } };
      };
      w.median?.onesignal?.logout?.();
    } catch {}
  }

  // Clear badge saat driver membuka app dari background
  useEffect(() => {
    function clearBadgeOnFocus() {
      updateAppBadge(0);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") clearBadgeOnFocus();
    });
    window.addEventListener("focus", clearBadgeOnFocus);
    return () => {
      window.removeEventListener("focus", clearBadgeOnFocus);
    };
  }, []);

  function speakNewTaskAnnouncement(destination?: string) {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window))
        return;
      const text = destination
        ? lang === "en"
          ? `New task received, destination ${destination}`
          : `Ada tugas masuk, tujuan ${destination}`
        : t.tugasBaruMasuk.replace(" 🔔", "");
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === "en" ? "en-US" : "id-ID";
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      // Web Speech API tidak tersedia/diblokir — abaikan.
    }
  }

  function updateAppBadge(count: number) {
    // 1. Web Badging API (works in some WebView builds)
    try {
      const nav = navigator as Navigator & {
        setAppBadge?: (count?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      if (count > 0 && nav.setAppBadge) {
        nav.setAppBadge(count).catch(() => {});
      } else if (nav.clearAppBadge) {
        nav.clearAppBadge().catch(() => {});
      }
    } catch {}

    // 2. Tab title — selalu jalan di semua WebView
    if (typeof document !== "undefined") {
      document.title = count > 0 ? `(${count}) CIKOPS Fleet` : "CIKOPS Fleet";
    }

    // 3. Dynamic favicon dengan badge angka merah
    try {
      if (typeof document === "undefined") return;
      const canvas = document.createElement("canvas");
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 32, 32);
        if (count > 0) {
          ctx.beginPath();
          ctx.arc(24, 8, 9, 0, 2 * Math.PI);
          ctx.fillStyle = "#e5484d";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(count > 9 ? "9+" : String(count), 24, 8);
        }
        const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']") ||
          Object.assign(document.createElement("link"), { rel: "icon" });
        link.href = canvas.toDataURL();
        document.head.appendChild(link);
      };
      img.src = "/favicon.png";
    } catch {}
  }

  function notifyNewTask(destination?: string) {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([260, 110, 260, 110, 260]);
    }
    playNotificationSound();
    speakNewTaskAnnouncement(destination);
  }

  const loadTodayTasks = useCallback(
    async (driverId: string) => {
      setTodayLoading(true);
      setTodayError(null);
      try {
        const data = await getDriverTasksToday(driverId);
        setTodayTasks(data);

        const assignedTasks = data.filter((task) => task.status === "ASSIGNED");
        const currentAssignedIds = new Set(assignedTasks.map((task) => task.id));
        const known = knownAssignedIdsRef.current;
        if (known !== null) {
          const newTasks = assignedTasks.filter((task) => !known.has(task.id));
          if (newTasks.length > 0) {
            notifyNewTask(newTasks[0].tujuan);
            showToast(
              newTasks.length > 1
                ? `${newTasks.length} ${t.tugasBaruMasuk}`
                : t.tugasBaruMasuk
            );
          }
        }
        knownAssignedIdsRef.current = currentAssignedIds;
        updateAppBadge(assignedTasks.length);
      } catch (e) {
        setTodayError(e instanceof Error ? e.message : t.gagalMemuatTugas);
      } finally {
        setTodayLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (screen !== "app" || !loggedDriver) return;

    loadTodayTasks(loggedDriver.id);

    let unsubscribe = subscribeToTasks(() => {
      loadTodayTasks(loggedDriver!.id);
    });

    // Reconnect WebSocket langsung saat app kembali ke foreground
    // (WebView Android sering drop koneksi saat di-background)
    function reconnectAndLoad() {
      if (document.visibilityState !== "visible") return;
      unsubscribe();
      unsubscribe = subscribeToTasks(() => {
        loadTodayTasks(loggedDriver!.id);
      });
      loadTodayTasks(loggedDriver!.id);
    }

    document.addEventListener("visibilitychange", reconnectAndLoad);
    window.addEventListener("focus", reconnectAndLoad);
    window.addEventListener("online", reconnectAndLoad);

    // Poll setiap 15 detik sebagai jaring pengaman (turun dari 45 detik)
    // — WebView Android terkadang tidak membangunkan WebSocket tepat waktu
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadTodayTasks(loggedDriver!.id);
      }
    }, 15000);

    // Heartbeat reconnect setiap 20 detik supaya WebSocket tidak tidur
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") {
        unsubscribe();
        unsubscribe = subscribeToTasks(() => {
          loadTodayTasks(loggedDriver!.id);
        });
      }
    }, 20000);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", reconnectAndLoad);
      window.removeEventListener("focus", reconnectAndLoad);
      window.removeEventListener("online", reconnectAndLoad);
      clearInterval(pollInterval);
      clearInterval(heartbeat);
    };
  }, [screen, loggedDriver, loadTodayTasks]);

  useEffect(() => {
    if (screen !== "app" || !loggedDriver) return;

    async function recheckStillActive() {
      try {
        const fresh = await driverGetSession();
        if (!fresh) {
          showToast(
            lang === "en" ? "Your session has ended" : "Sesi kamu telah berakhir"
          );
          logout();
        }
      } catch {
        // best-effort — don't log the driver out just because this
        // particular check failed (e.g. briefly offline)
      }
    }

    function handleVisible() {
      if (document.visibilityState === "visible") recheckStillActive();
    }
    document.addEventListener("visibilitychange", handleVisible);
    const id = setInterval(recheckStillActive, 5 * 60 * 1000); // tiap 5 menit
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      clearInterval(id);
    };
  }, [screen, loggedDriver]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function submitLogin(e?: React.FormEvent) {
    e?.preventDefault();
    const email = loginEmail.trim();
    if (!email || !loginPassword || loginBusy) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const driver = await driverSignIn(email, loginPassword);
      setLoggedDriver(driver);
      setLoginPassword("");
      setScreen("app");
      setTab("today");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "NOT_A_DRIVER") setLoginError(t.akunBukanDriver);
      else if (msg === "INVALID_CREDENTIALS") setLoginError(t.loginGagal);
      else setLoginError(msg || t.loginGagal);
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    oneSignalLogout();
    try {
      await driverSignOut();
    } catch {
      // Sesi lokal tetap dibersihkan meski request sign-out gagal
      // (mis. sedang offline) — Supabase menghapus token lokalnya sendiri.
    }
    knownAssignedIdsRef.current = null;
    updateAppBadge(0);
    setLoggedDriver(null);
    setLoginPassword("");
    setLoginError(null);
    setScreen("login");
    setTab("today");
    setTodayTasks([]);
    setHistoryTasks([]);
    setHistoryApplied(false);
    setClaims([]);
    setNewClaimCount(0);
  }

  const loadClaims = useCallback(async (driverId: string) => {
    setClaimsLoading(true);
    try {
      const data = await getClaimsByDriver(driverId);
      setClaims(data);
    } catch {
      // best-effort
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  // Realtime subscription for new claims — badge + sound + auto-switch
  useEffect(() => {
    if (screen !== "app" || !loggedDriver) return;
    loadClaims(loggedDriver.id);
    const unsubscribe = subscribeToDriverClaims(loggedDriver.id, () => {
      loadClaims(loggedDriver.id);
      setNewClaimCount((c) => c + 1);
      playNotificationSound();
      showToast(lang === "en" ? "💰 New claim submitted for you" : "💰 Ada klaim baru untukmu");
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, loggedDriver?.id]);

  async function handleAccept(task: TaskDetail) {
    if (!loggedDriver) return;
    setActionBusyId(task.id);
    try {
      await acceptTask(task.id, loggedDriver.id);
      showToast(t.tugasDiterima);
      await loadTodayTasks(loggedDriver.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMenerimaTugas);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleComplete(task: TaskDetail) {
    if (!loggedDriver) return;
    setActionBusyId(task.id);
    try {
      await completeTask(task.id, loggedDriver.id);
      showToast(t.tugasSelesaiToast);
      await loadTodayTasks(loggedDriver.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMenyelesaikanTugas);
    } finally {
      setActionBusyId(null);
    }
  }

  function openCancelConfirm(task: TaskDetail) {
    setCancelConfirmTask(task);
  }

  function closeCancelConfirm() {
    setCancelConfirmTask(null);
  }

  async function handleCancelConfirmed() {
    if (!loggedDriver || !cancelConfirmTask) return;
    const task = cancelConfirmTask;
    setActionBusyId(task.id);
    setCancelConfirmTask(null);
    try {
      await cancelTaskByDriver(task.id, loggedDriver.id);
      showToast(t.tugasDibatalkanToast);
      await loadTodayTasks(loggedDriver.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMembatalkanTugas);
    } finally {
      setActionBusyId(null);
    }
  }

  async function applyHistoryFilter() {
    if (!loggedDriver) return;
    const today = todayLocalISODate();
    const from = historyFrom || today;
    const to = historyTo || today;
    setHistoryLoading(true);
    try {
      const data = await getDriverHistory(loggedDriver.id, from, to);
      setHistoryTasks(data);
      setHistoryApplied(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMemuatRiwayat);
    } finally {
      setHistoryLoading(false);
    }
  }

  function resetHistoryFilter() {
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryStatusFilter(null);
    setHistoryTasks([]);
    setHistoryApplied(false);
  }

  const filteredHistory = useMemo(() => {
    if (!historyStatusFilter) return historyTasks;
    return historyTasks.filter((t) => t.status === historyStatusFilter);
  }, [historyTasks, historyStatusFilter]);

  function openPasswordModal() {
    setPwModalOpen(true);
    setPwModalNew("");
    setPwModalConfirm("");
    setPwModalError("");
  }

  function closePasswordModal() {
    if (pwModalBusy) return;
    setPwModalOpen(false);
  }

  async function submitPasswordChange(e?: React.FormEvent) {
    e?.preventDefault();
    if (pwModalBusy) return;
    if (pwModalNew.length < 6) {
      setPwModalError(t.passwordMin6);
      return;
    }
    if (pwModalNew !== pwModalConfirm) {
      setPwModalError(t.passwordTidakSama);
      return;
    }
    setPwModalBusy(true);
    setPwModalError("");
    try {
      await changeDriverPassword(pwModalNew);
      setPwModalOpen(false);
      showToast(t.passwordDiubah);
    } catch (e2) {
      setPwModalError(e2 instanceof Error ? e2.message : t.gagalMengubahPassword);
    } finally {
      setPwModalBusy(false);
    }
  }

  const stats = useMemo(() => computeStats(todayTasks), [todayTasks]);

  if (screen === "splash") {
    return (
      <div className={styles.appOuter}>
        <div
          className={`${styles.screen} ${styles.splashScreen} ${
            splashFading ? styles.splashFadeOut : ""
          }`}
        >
          <div className={styles.splashLogoWrap}>
            <img src="/logo.png" alt="CIKOPS" className={styles.splashLogo} />
            <div className={styles.splashBrandName}>{t.appName}</div>
            <div className={styles.splashBrandSub}>{t.splashTagline}</div>
          </div>
          <div className={styles.splashLoader}>
            <span className={styles.splashLoaderDot} />
            <span className={styles.splashLoaderDot} />
            <span className={styles.splashLoaderDot} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === "login") {
    return (
      <div className={styles.appOuter}>
      <div className={`${styles.screen} ${styles.landingScreen}`}>
        <div className={styles.landingBody}>
          <div className={styles.topBar}>
            <button
              className={styles.themeBtn}
              onClick={() => setLang(lang === "id" ? "en" : "id")}
              aria-label={t.language}
              style={{ marginRight: 8, fontSize: 12, fontWeight: 700 }}
            >
              {lang === "id" ? "EN" : "ID"}
            </button>
            <button
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={t.gantiTema}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>

          <div className={styles.heroLogoWrap}>
            <img src="/logo.png" alt="CIKOPS" className={styles.logoBadgeImg} />
            <div className={styles.brandName}>{t.appName} Fleet</div>
            <div className={styles.brandSub}>Driver Operations</div>
          </div>

          <div className={styles.loginWelcome}>{t.loginWelcome}</div>
          <div className={styles.loginWelcomeSub}>{t.masukDenganAkun}</div>

          <form className={styles.loginCard} onSubmit={submitLogin}>
            <label className={styles.loginLabel} htmlFor="driver-email">Email</label>
            <input
              id="driver-email"
              className={styles.loginInput}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nama@perusahaan.com"
              value={loginEmail}
              onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
              disabled={loginBusy}
            />

            <label className={styles.loginLabel} htmlFor="driver-password">Password</label>
            <div className={styles.loginPasswordWrap}>
              <input
                id="driver-password"
                className={styles.loginInput}
                type={loginShowPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }}
                disabled={loginBusy}
              />
              <button
                type="button"
                className={styles.loginEyeBtn}
                onClick={() => setLoginShowPassword((v) => !v)}
                aria-label={loginShowPassword ? t.sembunyikanPassword : t.lihatPassword}
                tabIndex={-1}
              >
                {loginShowPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {loginError && <div className={styles.loginError}>{loginError}</div>}

            <button
              type="submit"
              className={styles.btnMasuk}
              disabled={!loginEmail.trim() || !loginPassword || loginBusy}
              style={{ marginTop: 6 }}
            >
              {loginBusy ? t.sedangMasuk : t.masuk}
            </button>
          </form>

          <div className={styles.loginHint}>{t.loginHintAdmin}</div>

          <div className={styles.landingFooter}>CIKOPS-FM SYSTEM v1.0</div>
        </div>
      </div>
      </div>
    );
  }

  if (screen === "app" && loggedDriver) {
    return (
      <div className={styles.appOuter}>
      <div className={`${styles.screen} ${styles.appScreen}`}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <img src="/logo.png" alt="CIKOPS" className={styles.logoMarkImg} />
            <div className={styles.headerInfo}>
              <div className={styles.headerLabel}>{t.appName}</div>
              <div className={styles.headerTitle}>{t.driverPanel}</div>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.hbtn}
                onClick={() => setLang(lang === "id" ? "en" : "id")}
                aria-label={t.language}
                style={{ fontSize: 11, fontWeight: 700 }}
              >
                {lang === "id" ? "EN" : "ID"}
              </button>
              <button className={styles.hbtn} onClick={toggleTheme}>
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.driverStrip}>
          <div className={styles.driverStripAvatar}>
            {loggedDriver.avatar_emoji || "🧑‍✈️"}
          </div>
          <div className={styles.driverStripInfo}>
            <div className={styles.driverStripName}>{loggedDriver.nama}</div>
            <div className={styles.driverStripStatus}>
              {isUserDriver(loggedDriver) ? (
                <>🔒 {getUserDutyStatus(loggedDriver, dutyNow).onDuty ? "ON DUTY" : "OFF DUTY"} · {dutyHoursLabel}</>
              ) : (
                <><span className={styles.stripDot} /> {t.online}</>
              )}
            </div>
          </div>
          <button className={styles.btnLogout} onClick={logout}>
            {t.keluar}
          </button>
        </div>

        {isUserDriver(loggedDriver) && (() => {
          const du = getUserDutyStatus(loggedDriver, dutyNow);
          return (
            <div className={`${styles.dutyBanner} ${du.onDuty ? styles.dutyOn : styles.dutyOff}`} role="status">
              <div className={styles.dutyIcon}>🔒</div>
              <div className={styles.dutyBody}>
                <div className={styles.dutyTitle}>
                  {du.onDuty ? "ON DUTY" : "OFF DUTY"}
                  <span className={styles.dutyHours}>{dutyHoursLabel} WIB</span>
                </div>
                <div className={styles.dutyUser}>
                  {lang === "en" ? "Your user" : "User Anda"}: <b>{du.userName || "—"}</b>{du.userTitle ? ` · ${du.userTitle}` : ""}
                </div>
                <div className={styles.dutyNote}>
                  {lang === "en"
                    ? "Status is set automatically every day and cannot be changed."
                    : "Status diatur otomatis setiap hari dan tidak dapat diubah."}
                </div>
              </div>
            </div>
          );
        })()}

        {tab === "today" && (
          <div className={`${styles.statsStrip} ${styles.statsStripVisible}`}>
            <div className={styles.statPill}>
              <div className={`${styles.statNum} ${styles.cOrange}`}>
                {stats.assigned}
              </div>
              <div className={styles.statLabel}>{t.statBaru}</div>
            </div>
            <div className={styles.statPill}>
              <div className={`${styles.statNum} ${styles.cCyan}`}>
                {stats.ongoing}
              </div>
              <div className={styles.statLabel}>{t.statProses}</div>
            </div>
            <div className={styles.statPill}>
              <div className={`${styles.statNum} ${styles.cGreen}`}>
                {stats.done}
              </div>
              <div className={styles.statLabel}>{t.statSelesai}</div>
            </div>
          </div>
        )}

        <div className={styles.tabRow}>
          <button
            className={`${styles.tab} ${tab === "today" ? styles.tabActive : ""}`}
            onClick={() => setTab("today")}
          >
            <span className={styles.tabIcon}>📋</span> {t.hariIni}
            {stats.assigned + stats.ongoing > 0 && (
              <span className={styles.tabCount}>
                {stats.assigned + stats.ongoing}
              </span>
            )}
          </button>
          <button
            className={`${styles.tab} ${tab === "history" ? styles.tabActive : ""}`}
            onClick={() => setTab("history")}
          >
            <span className={styles.tabIcon}>🕘</span> {t.riwayat}
          </button>
          <button
            className={`${styles.tab} ${tab === "claims" ? styles.tabActive : ""}`}
            onClick={() => { setTab("claims"); setNewClaimCount(0); }}
          >
            <span className={styles.tabIcon}>🧾</span> {t.klaim}
            {newClaimCount > 0 && (
              <span className={styles.tabCount}>{newClaimCount}</span>
            )}
          </button>
          <button
            className={`${styles.tab} ${tab === "profile" ? styles.tabActive : ""}`}
            onClick={() => setTab("profile")}
          >
            <span className={styles.tabIcon}>👤</span> {t.profil}
          </button>
        </div>

        <div className={styles.scrollArea}>
          <div className={styles.scrollContent}>
            {tab === "today" && (
              <TodayTab
                loading={todayLoading}
                error={todayError}
                tasks={todayTasks}
                actionBusyId={actionBusyId}
                onAccept={handleAccept}
                onComplete={handleComplete}
                onCancel={openCancelConfirm}
              />
            )}

            {tab === "history" && (
              <HistoryTab
                from={historyFrom}
                to={historyTo}
                setFrom={setHistoryFrom}
                setTo={setHistoryTo}
                statusFilter={historyStatusFilter}
                setStatusFilter={setHistoryStatusFilter}
                onApply={applyHistoryFilter}
                onReset={resetHistoryFilter}
                applied={historyApplied}
                loading={historyLoading}
                tasks={filteredHistory}
              />
            )}

            {tab === "claims" && (
              <ClaimsTab
                claims={claims}
                loading={claimsLoading}
                expandedId={expandedClaimId}
                setExpandedId={setExpandedClaimId}
                lang={lang}
              />
            )}

            {tab === "profile" && (
              <ProfileTab
                driver={loggedDriver}
                onChangePassword={openPasswordModal}
                onLogout={logout}
              />
            )}
          </div>
        </div>

        <div className={styles.bottomNav}>
          <button
            className={`${styles.bnavItem} ${
              tab === "today" ? styles.bnavItemActive : ""
            }`}
            onClick={() => setTab("today")}
          >
            <span className={styles.bnavIcon}>📋</span>
            {t.hariIni}
            {stats.assigned + stats.ongoing > 0 && (
              <span className={styles.bnavBadge}>
                {stats.assigned + stats.ongoing}
              </span>
            )}
          </button>
          <button
            className={`${styles.bnavItem} ${
              tab === "history" ? styles.bnavItemActive : ""
            }`}
            onClick={() => setTab("history")}
          >
            <span className={styles.bnavIcon}>🕘</span>
            {t.riwayat}
          </button>
          <button
            className={`${styles.bnavItem} ${
              tab === "claims" ? styles.bnavItemActive : ""
            }`}
            onClick={() => { setTab("claims"); setNewClaimCount(0); }}
          >
            <span className={styles.bnavIcon}>🧾</span>
            {t.klaim}
            {newClaimCount > 0 && (
              <span className={styles.bnavBadge}>{newClaimCount}</span>
            )}
          </button>
          <button
            className={`${styles.bnavItem} ${
              tab === "profile" ? styles.bnavItemActive : ""
            }`}
            onClick={() => setTab("profile")}
          >
            <span className={styles.bnavIcon}>👤</span>
            {t.profil}
          </button>
        </div>

        {pwModalOpen && (
          <PasswordChangeModal
            newVal={pwModalNew}
            confirmVal={pwModalConfirm}
            error={pwModalError}
            busy={pwModalBusy}
            setNewVal={setPwModalNew}
            setConfirmVal={setPwModalConfirm}
            onSubmit={submitPasswordChange}
            onClose={closePasswordModal}
          />
        )}

        {cancelConfirmTask && (
          <div className={styles.modalOverlay} onClick={closeCancelConfirm}>
            <div
              className={`${styles.modalBox} ${styles.modalBoxOpen}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHandle} />
              <div className={styles.modalTitle}>{t.batalkanTugasIni}</div>
              <div className={styles.modalSub}>
                {t.tujuanLabel}: {cancelConfirmTask.tujuan}
              </div>
              <button
                className={styles.btnCancelConfirmYes}
                onClick={handleCancelConfirmed}
              >
                {t.yaBatalkanTugas}
              </button>
              <button
                className={styles.modalCancelBtn}
                onClick={closeCancelConfirm}
              >
                {t.tidakKembali}
              </button>
            </div>
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
      </div>
    );
  }

  return null;
}

function statusLabel(status: string, t: Dict) {
  if (status === "ASSIGNED") return t.statusAssigned;
  if (status === "ON GOING") return t.statusOngoing;
  if (status === "CANCELLED") return t.statusCancelled;
  return t.statusDone;
}

function statusClasses(status: string) {
  if (status === "ASSIGNED")
    return { accent: styles.accentAssigned, badge: styles.badgeAssigned, dot: styles.sdotAssigned };
  if (status === "ON GOING")
    return { accent: styles.accentOngoing, badge: styles.badgeOngoing, dot: styles.sdotOngoing };
  if (status === "CANCELLED")
    return { accent: styles.accentCancelled, badge: styles.badgeCancelled, dot: styles.sdotCancelled };
  return { accent: styles.accentDone, badge: styles.badgeDone, dot: styles.sdotDone };
}

function TaskCard({
  task,
  busy,
  onAccept,
  onComplete,
  onCancel,
}: {
  task: TaskDetail;
  busy: boolean;
  onAccept: (t: TaskDetail) => void;
  onComplete: (t: TaskDetail) => void;
  onCancel?: (t: TaskDetail) => void;
}) {
  const { t, lang } = useLang();
  const cls = statusClasses(task.status);
  const locale = lang === "en" ? "en-GB" : "id-ID";
  return (
    <div className={styles.taskCard}>
      <div className={`${styles.cardAccent} ${cls.accent}`} />
      <div className={styles.cardHead}>
        <div className={styles.destBlock}>
          <div className={styles.destIcon}>📍 {t.tujuan}</div>
          <div className={styles.destName}>{task.tujuan}</div>
        </div>
        <div className={`${styles.sbadge} ${cls.badge}`}>
          <span className={`${styles.sdot} ${cls.dot}`} />
          {statusLabel(task.status, t)}
        </div>
      </div>

      <div className={styles.cardMeta}>
        <div className={styles.metaRow}>
          <div className={`${styles.mi} ${styles.miBlue}`}>🚗</div>
          <div className={styles.metaContent}>
            <div className={styles.ml}>{t.kendaraan}</div>
            <div className={styles.mv}>{task.kendaraan || "-"}</div>
          </div>
        </div>
        <div className={styles.metaRow}>
          <div className={`${styles.mi} ${styles.miPurple}`}>🧰</div>
          <div className={styles.metaContent}>
            <div className={styles.ml}>{t.jenisPekerjaan}</div>
            <div className={styles.mv}>{task.jenis_pekerjaan}</div>
          </div>
        </div>
        <div className={styles.metaRow}>
          <div className={`${styles.mi} ${styles.miAmber}`}>👤</div>
          <div className={styles.metaContent}>
            <div className={styles.ml}>{t.requestor}</div>
            <div className={styles.mv}>
              {task.requestor}
              {task.departement ? ` · ${task.departement}` : ""}
            </div>
          </div>
        </div>
        {task.perihal && (
          <div className={styles.metaRow}>
            <div className={`${styles.mi} ${styles.miGreen}`}>📝</div>
            <div className={styles.metaContent}>
              <div className={styles.ml}>{t.perihal}</div>
              <div className={styles.mv}>{task.perihal}</div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.cardAction}>
        {task.status === "ASSIGNED" && (
          <>
            <button
              className={styles.btnAccept}
              disabled={busy}
              onClick={() => onAccept(task)}
            >
              {busy ? t.memproses : t.terimaTugas}
            </button>
            {onCancel && (
              <button
                className={styles.btnCancelTask}
                disabled={busy}
                onClick={() => onCancel(task)}
              >
                {t.batalkanTugas}
              </button>
            )}
          </>
        )}
        {task.status === "ON GOING" && (
          <>
            <button
              className={styles.btnDone}
              disabled={busy}
              onClick={() => onComplete(task)}
            >
              {busy ? t.memproses : t.selesaikanTugas}
            </button>
            {onCancel && (
              <button
                className={styles.btnCancelTask}
                disabled={busy}
                onClick={() => onCancel(task)}
              >
                {t.batalkanTugas}
              </button>
            )}
          </>
        )}
        {task.status === "DONE" && (
          <div className={styles.doneStamp}>
            <span>✅</span>
            <div className={styles.doneStampTxt}>
              {t.selesai}{" "}
              {task.completed_at
                ? new Date(task.completed_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </div>
          </div>
        )}
        {task.status === "CANCELLED" && (
          <div className={styles.cancelStamp}>
            <span>🚫</span>
            <div className={styles.cancelStampTxt}>
              {t.statusCancelled}{" "}
              {task.cancelled_at
                ? new Date(task.cancelled_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
              {task.cancelled_by ? ` ${t.dibatalkanOleh} ${task.cancelled_by}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TodayTab({
  loading,
  error,
  tasks,
  actionBusyId,
  onAccept,
  onComplete,
  onCancel,
}: {
  loading: boolean;
  error: string | null;
  tasks: TaskDetail[];
  actionBusyId: string | null;
  onAccept: (t: TaskDetail) => void;
  onComplete: (t: TaskDetail) => void;
  onCancel: (t: TaskDetail) => void;
}) {
  const { t } = useLang();
  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <div className={styles.loadingTxt}>{t.memuatTugasHariIni}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errBox}>
        <div className={styles.errTxt}>{error}</div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIco}>📭</span>
        <div className={styles.emptyTitle}>{t.belumAdaTugasHariIni}</div>
        <div className={styles.emptySub}>
          {t.tugasBaruOtomatis}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.liveBar}>
        <span className={styles.liveDot} />
        <span className={styles.liveTxt}>{t.liveUpdateOtomatis}</span>
      </div>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          busy={actionBusyId === task.id}
          onAccept={onAccept}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      ))}
    </>
  );
}

function HistoryTab({
  from,
  to,
  setFrom,
  setTo,
  statusFilter,
  setStatusFilter,
  onApply,
  onReset,
  applied,
  loading,
  tasks,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  statusFilter: string | null;
  setStatusFilter: (v: string | null) => void;
  onApply: () => void;
  onReset: () => void;
  applied: boolean;
  loading: boolean;
  tasks: TaskDetail[];
}) {
  const { t } = useLang();
  return (
    <>
      <div className={styles.filterBox}>
        <div className={styles.filterRow}>
          <div className={styles.fiIcon}>📅</div>
          <div className={styles.fiInfo}>
            <div className={styles.fiLabel}>{t.dariTanggal}</div>
            <input
              type="date"
              className={styles.dateInput}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.fiIcon}>📅</div>
          <div className={styles.fiInfo}>
            <div className={styles.fiLabel}>{t.sampaiTanggal}</div>
            <input
              type="date"
              className={styles.dateInput}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.filterDivider}>
          <div className={styles.fdl} />
          <div className={styles.fdt}>{t.statusLabel}</div>
          <div className={styles.fdl} />
        </div>

        <div className={styles.chips}>
          {["ASSIGNED", "ON GOING", "DONE"].map((s) => (
            <button
              key={s}
              className={`${styles.chip} ${
                statusFilter === s ? styles.chipOn : ""
              }`}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            >
              {statusLabel(s, t)}
            </button>
          ))}
        </div>

        <div className={styles.filterActions}>
          <button className={styles.btnApply} onClick={onApply}>
            {t.terapkan}
          </button>
          <button className={styles.btnReset} onClick={onReset}>
            {t.reset}
          </button>
        </div>
      </div>

      {loading && (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <div className={styles.loadingTxt}>{t.memuatRiwayat}</div>
        </div>
      )}

      {!loading && applied && tasks.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIco}>🗂️</span>
          <div className={styles.emptyTitle}>{t.tidakAdaRiwayat}</div>
          <div className={styles.emptySub}>
            {t.cobaUbahRentang}
          </div>
        </div>
      )}

      {!loading && !applied && (
        <div className={styles.empty}>
          <span className={styles.emptyIco}>🔎</span>
          <div className={styles.emptyTitle}>{t.pilihRentangTanggal}</div>
          <div className={styles.emptySub}>
            {t.tekanTerapkan}
          </div>
        </div>
      )}

      {!loading &&
        tasks.map((task) => (
          <TaskCard key={task.id} task={task} busy={false} onAccept={() => {}} onComplete={() => {}} />
        ))}
    </>
  );
}

// ── Week-range helper (ported from dashboard) ──
function claimWeekLabel(dateStr: string, driverName: string, lang: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  // "Week 3 July 2026" — based on which week-of-month the Monday falls in
  const weekNum = Math.ceil(monday.getDate() / 7);
  const monthYear = monday.toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    month: "long", year: "numeric",
  });
  return `Claim Week ${weekNum} ${monthYear} – ${driverName}`;
}

function claimWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return monday.toISOString().slice(0, 10); // "YYYY-MM-DD" of the Monday
}

function ClaimsTab({
  claims,
  loading,
  expandedId,
  setExpandedId,
  lang,
}: {
  claims: Claim[];
  loading: boolean;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  lang: string;
}) {
  const [weekFilter, setWeekFilter] = useState<string>("all");

  const fmtRpLocal = (n: number) =>
    new Intl.NumberFormat("id-ID").format(Math.round(n || 0));

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
      day: "numeric", month: "short", year: "numeric",
    });

  const statusColor: Record<string, string> = {
    submitted: "var(--brand)",
    approved: "var(--green)",
    rejected: "var(--red)",
    paid: "#2dd4bf",
  };
  const statusLabel: Record<string, string> = {
    submitted: lang === "en" ? "Submitted" : "Diajukan",
    approved: lang === "en" ? "Approved" : "Disetujui",
    rejected: lang === "en" ? "Rejected" : "Ditolak",
    paid: lang === "en" ? "Paid" : "Dibayar",
  };

  // Collect unique weeks for the filter dropdown
  const weeks = useMemo<{ key: string; label: string }[]>(() => {
    const seen = new Set<string>();
    const result: { key: string; label: string }[] = [];
    for (const c of claims) {
      const key = claimWeekKey(c.periodDate);
      if (!seen.has(key)) {
        seen.add(key);
        const monday = new Date(key);
        const weekNum = Math.ceil(monday.getDate() / 7);
        const monthYear = monday.toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
          month: "long", year: "numeric",
        });
        result.push({ key, label: `Week ${weekNum} ${monthYear}` });
      }
    }
    return result;
  }, [claims, lang]);

  const filtered = useMemo(() =>
    weekFilter === "all" ? claims : claims.filter((c) => claimWeekKey(c.periodDate) === weekFilter),
    [claims, weekFilter]
  );

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <div className={styles.loadingTxt}>{lang === "en" ? "Loading claims..." : "Memuat klaim..."}</div>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "52px 24px", color: "var(--t3)" }}>
        <div style={{ fontSize: 38, marginBottom: 12 }}>🧾</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--t2)", marginBottom: 6 }}>
          {lang === "en" ? "No claims yet" : "Belum ada klaim"}
        </div>
        <div style={{ fontSize: 13 }}>
          {lang === "en"
            ? "Claims submitted by the GA admin will appear here."
            : "Klaim yang diajukan admin GA akan muncul di sini."}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Week filter ── */}
      {weeks.length > 1 && (
        <div style={{ padding: "10px 14px 4px", overflowX: "auto", display: "flex", gap: 7, WebkitOverflowScrolling: "touch" }}>
          <button
            onClick={() => setWeekFilter("all")}
            style={{
              flexShrink: 0, padding: "6px 14px", borderRadius: 6, border: "1.5px solid",
              borderColor: weekFilter === "all" ? "var(--brand)" : "var(--border2)",
              background: weekFilter === "all" ? "var(--brand)" : "var(--surface2)",
              color: weekFilter === "all" ? "#fff" : "var(--t2)",
              fontWeight: 700, fontSize: 12.5, cursor: "pointer",
            }}
          >
            {lang === "en" ? "All" : "Semua"}
          </button>
          {weeks.map((w) => (
            <button
              key={w.key}
              onClick={() => setWeekFilter(w.key)}
              style={{
                flexShrink: 0, padding: "6px 14px", borderRadius: 6, border: "1.5px solid",
                borderColor: weekFilter === w.key ? "var(--brand)" : "var(--border2)",
                background: weekFilter === w.key ? "var(--brand)" : "var(--surface2)",
                color: weekFilter === w.key ? "#fff" : "var(--t2)",
                fontWeight: 700, fontSize: 12.5, cursor: "pointer",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Claim rows ── */}
      <div style={{ padding: "8px 0" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 24px", color: "var(--t3)", fontSize: 13 }}>
            {lang === "en" ? "No claims in this week." : "Tidak ada klaim di minggu ini."}
          </div>
        )}
        {filtered.map((c) => {
          const isOpen = expandedId === c.id;
          const color = statusColor[c.status] || "var(--t3)";
          const title = claimWeekLabel(c.periodDate, c.driverName || "–", lang);
          return (
            <div key={c.id}>
              {/* ── Notification row (flat, no border-radius) ── */}
              <button
                onClick={() => setExpandedId(isOpen ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "13px 16px",
                  background: isOpen ? "var(--bg2)" : "transparent",
                  border: "none", borderBottom: "1px solid var(--border)",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                {/* Status dot */}
                <span style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: color, flexShrink: 0, marginTop: 2,
                }} />
                {/* Title + date */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 2 }}>
                    {fmtDate(c.submissionDate)} · <span style={{ color }}>{statusLabel[c.status] || c.status}</span>
                  </div>
                </div>
                {/* Total + chevron */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 13.5, color: "var(--t1)" }}>
                    Rp {fmtRpLocal(c.total)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--t3)" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* ── Drill-down detail (accordion) ── */}
              {isOpen && (
                <div style={{
                  background: "var(--bg2)",
                  borderBottom: "2px solid var(--brand)",
                  padding: "14px 16px",
                }}>
                  {/* Item table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--t3)", paddingBottom: 6 }}>
                          {lang === "en" ? "Type" : "Jenis"}
                        </th>
                        <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--t3)", paddingBottom: 6 }}>
                          {lang === "en" ? "Amount" : "Jumlah"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.items.map((item, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "7px 0", fontSize: 13.5, color: "var(--t2)" }}>{item.type}</td>
                          <td style={{ padding: "7px 0", fontFamily: "var(--mono)", fontSize: 13.5, fontWeight: 700, textAlign: "right", color: "var(--t1)" }}>
                            Rp {fmtRpLocal(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ paddingTop: 8, fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>Total</td>
                        <td style={{ paddingTop: 8, fontFamily: "var(--mono)", fontSize: 14, fontWeight: 800, textAlign: "right", color: "var(--brand)" }}>
                          Rp {fmtRpLocal(c.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Periode & catatan */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: c.note ? 8 : 0 }}>
                    <span style={{ fontSize: 11.5, color: "var(--t3)" }}>
                      {lang === "en" ? "Period:" : "Periode:"} {fmtDate(c.periodDate)}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--t3)" }}>·</span>
                    <span style={{ fontSize: 11.5, color: "var(--t3)" }}>
                      {lang === "en" ? "Submitted:" : "Diajukan:"} {fmtDate(c.submissionDate)}
                    </span>
                  </div>
                  {c.note && (
                    <div style={{
                      fontSize: 12.5, color: "var(--t2)", background: "var(--surface)",
                      borderRadius: 8, padding: "8px 11px",
                      borderLeft: "3px solid var(--brand)",
                    }}>
                      📝 {c.note}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileTab({
  driver,
  onChangePassword,
  onLogout,
}: {
  driver: Driver;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const { t } = useLang();
  return (
    <div className={styles.profileWrap}>
      <div className={styles.profileHero}>
        <div className={styles.profileAvatar}>
          {driver.avatar_emoji || "🧑‍✈️"}
        </div>
        <div className={styles.profileName}>{driver.nama}</div>
        <div className={styles.profileRoleLabel}>{isUserDriver(driver) ? "DRIVER USER" : "DRIVER"}</div>
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileSectionHeader}>{t.informasi}</div>
        {isUserDriver(driver) && (
          <>
            <div className={styles.profileRow}>
              <span className={styles.profileRowIco}>👤</span>
              <span className={styles.profileRowLabel}>User</span>
              <span className={styles.profileRowVal}>{driver.assigned_user || "-"}{driver.assigned_user_title ? ` · ${driver.assigned_user_title}` : ""}</span>
            </div>
            <div className={styles.profileRow}>
              <span className={styles.profileRowIco}>🔒</span>
              <span className={styles.profileRowLabel}>Status</span>
              <span className={styles.profileRowVal}>ON DUTY {dutyHoursLabel} WIB</span>
            </div>
          </>
        )}
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>📱</span>
          <span className={styles.profileRowLabel}>{t.noHp}</span>
          <span className={styles.profileRowVal}>{driver.no_hp || "-"}</span>
        </div>
        {driver.email && (
          <div className={styles.profileRow}>
            <span className={styles.profileRowIco}>✉️</span>
            <span className={styles.profileRowLabel}>Email</span>
            <span className={styles.profileRowVal} style={{ fontSize: 13.5, wordBreak: "break-all" }}>{driver.email}</span>
          </div>
        )}
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileSectionHeader}>{t.keamanan}</div>
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>🔒</span>
          <span className={styles.profileRowLabel}>Password</span>
          <button className={styles.pinRowBtn} onClick={onChangePassword}>
            {t.ubahPassword}
          </button>
        </div>
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>🚪</span>
          <span className={styles.profileRowLabel}>{t.keluarDariAkun}</span>
          <button className={styles.pinRowBtn} onClick={onLogout}>
            {t.keluar}
          </button>
        </div>
      </div>

      <div className={styles.profileFooter}>CIKOPS-FM SYSTEM v1.0</div>
    </div>
  );
}

function PasswordChangeModal({
  newVal,
  confirmVal,
  error,
  busy,
  setNewVal,
  setConfirmVal,
  onSubmit,
  onClose,
}: {
  newVal: string;
  confirmVal: string;
  error: string;
  busy: boolean;
  setNewVal: (v: string) => void;
  setConfirmVal: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalBox} ${styles.modalBoxOpen}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHandle} />
        <div className={styles.modalTitle}>{t.ubahPassword}</div>
        <div className={styles.modalSub}>{t.passwordMin6}</div>

        <form onSubmit={onSubmit} className={styles.pwForm}>
          <label className={styles.loginLabel} htmlFor="pw-new">{t.passwordBaru}</label>
          <input
            id="pw-new"
            className={styles.loginInput}
            type="password"
            autoComplete="new-password"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            disabled={busy}
          />

          <label className={styles.loginLabel} htmlFor="pw-confirm">{t.konfirmasiPasswordBaru}</label>
          <input
            id="pw-confirm"
            className={styles.loginInput}
            type="password"
            autoComplete="new-password"
            value={confirmVal}
            onChange={(e) => setConfirmVal(e.target.value)}
            disabled={busy}
          />

          <div className={styles.modalErr}>{error}</div>

          <button
            type="submit"
            className={styles.btnMasuk}
            disabled={busy || !newVal || !confirmVal}
          >
            {busy ? t.menyimpan : t.simpanPassword}
          </button>
        </form>

        <button className={styles.modalCancelBtn} onClick={onClose} disabled={busy}>
          {t.batal}
        </button>
      </div>
    </div>
  );
}
