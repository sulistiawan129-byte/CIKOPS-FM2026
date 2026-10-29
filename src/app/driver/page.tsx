"use client";

/* /driver — Aplikasi Driver CIKOPS: tugas hari ini, riwayat, klaim (termasuk Self-Claim), profil.
   Tampilan memakai design system aplikasi lapangan yang sama dengan aplikasi TGA
   (src/components/fieldapp). Bisa dibuka dari APK CIKOPS Driver (notifikasi native). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "@/components/fieldapp/fieldapp.module.css";
import {
  BottomNav, NavBtn, PullIndicator, Sheet, Skeleton, SuccessScreen, SunMoon, haptic, useOnline, usePullRefresh,
} from "@/components/fieldapp/FieldKit";
import {
  acceptTask, cancelTaskByDriver, changeDriverPassword, completeTask, driverGetSession, driverSignIn, driverSignOut,
  getClaimsByDriver, getDriverDutyInfo, getDriverHistory, getDriverTasksToday, subscribeToDriverClaims, subscribeToTasks,
} from "@/lib/api";
import type { Claim, ClaimItem, Driver, TaskDetail } from "@/lib/types";
import { computeStats, isAutoCompleted, plantLocation, TASK_CUTOFF_HOUR } from "@/lib/types";
import {
  CLAIM_REQUEST_STATUS, CLAIM_TYPES, cancelClaimRequest, claimType, evalExpr, getMyClaimRequests, submitClaimRequest,
  subscribeClaimRequests, type ClaimRequest,
} from "@/lib/claims/driverClaims";
import { useLang, useTheme } from "@/lib/providers";
import { todayLocalISODate, toLocalISODate } from "@/lib/dateUtils";
import { autoEnableNative, createRinger, disablePush, enablePush, pushState, testPush, type PushState, type PushSubData } from "@/lib/push";
import { supabase } from "@/lib/supabaseClient";
import { driverTypeLabel, dutyHoursLabel, getUserDutyStatus, isUserDriver, useNowTick } from "@/lib/duty";
import { DEMO_DRIVER_EMAIL, DEMO_MODE, DEMO_PASSWORD, plantFull } from "@/lib/brand";

type Screen = "splash" | "login" | "app";
type Tab = "today" | "history" | "claims" | "profile";
type Lx = (id: string, en: string) => string;

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const firstName = (n: string) => n.split(/\s+/)[0] ?? n;
const DAYS = { id: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"], en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };
const MONTHS = { id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };

function fmtDay(iso: string, lang: string) {
  const L = lang === "en" ? "en" : "id";
  const today = todayLocalISODate();
  if (iso === today) return L === "en" ? "Today" : "Hari ini";
  const y = new Date(today + "T00:00:00"); y.setDate(y.getDate() - 1);
  if (iso === toLocalISODate(y)) return L === "en" ? "Yesterday" : "Kemarin";
  const d = new Date(iso + "T00:00:00");
  return `${DAYS[L][d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[L][d.getMonth()]} ${d.getFullYear()}`;
}
function fmtLong(lang: string) {
  const L = lang === "en" ? "en" : "id";
  const d = new Date();
  return `${DAYS[L][d.getDay()]}, ${d.getDate()} ${MONTHS[L][d.getMonth()]} ${d.getFullYear()}`;
}
const fmtTime = (iso: string | null, lang: string) =>
  iso ? new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
function greeting(lang: string) {
  const h = new Date().getHours();
  if (lang === "en") return h < 11 ? "Good morning" : h < 15 ? "Good afternoon" : h < 18 ? "Good afternoon" : "Good evening";
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return toLocalISODate(d); }

/* ── Draft Self-Claim ── */
interface ClaimLine { key: number; type: string; expr: string }
interface ClaimDraft { periodDate: string; lines: ClaimLine[]; note: string; nota: "ada" | "menyusul" }
const DRAFT_KEY = "cikops_claim_draft";
const newLine = (type = "Gasoline"): ClaimLine => ({ key: Date.now() + Math.random(), type, expr: "" });
const emptyClaim = (): ClaimDraft => ({ periodDate: todayLocalISODate(), lines: [newLine()], note: "", nota: "menyusul" });
function draftFromRequest(r: ClaimRequest): ClaimDraft {
  return { periodDate: r.periodDate, note: r.note, nota: r.nota, lines: r.items.map((it, i) => ({ key: Date.now() + i, type: it.type, expr: it.expr || String(it.total) })) };
}

export default function DriverPanelPage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang } = useLang();
  const L: Lx = useCallback((id, en) => (lang === "en" ? en : id), [lang]);
  const online = useOnline();

  const [screen, setScreen] = useState<Screen>("splash");
  const [tab, setTab] = useState<Tab>("today");
  const [driver, setDriver] = useState<Driver | null>(null);
  const dutyNow = useNowTick();

  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [tasksErr, setTasksErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTask, setCancelTask] = useState<TaskDetail | null>(null);
  const [incoming, setIncoming] = useState<TaskDetail | null>(null);
  const knownAssigned = useRef<Set<string> | null>(null);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [reqErr, setReqErr] = useState<string | null>(null);
  const [claimBadge, setClaimBadge] = useState(0);
  const [claimForm, setClaimForm] = useState<{ id: string | null; draft: ClaimDraft } | null>(null);
  const [claimSent, setClaimSent] = useState<{ total: number; lines: number; edited: boolean } | null>(null);
  const knownReviewed = useRef<Map<string, string> | null>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringer = useRef<ReturnType<typeof createRinger> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ── Splash → cek sesi ──
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const d = await driverGetSession();
        if (d) { setDriver(d); setScreen("app"); return; }
      } catch { /* ke layar login */ }
      setScreen("login");
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // Tipe driver (pool / user) + user yang dilayani diambil lewat RPC
  useEffect(() => {
    if (!driver || driver.driver_type !== undefined) return;
    let off = false;
    getDriverDutyInfo(driver.id).then((info) => { if (!off) setDriver((cur) => (cur && cur.id === driver.id ? { ...cur, ...info } : cur)); });
    return () => { off = true; };
  }, [driver]);

  // Service worker (cache + Web Push) & nada dering (butuh sentuhan pertama)
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    ringer.current = createRinger("/notif.wav");
    const unlock = () => ringer.current?.unlock();
    document.addEventListener("touchstart", unlock, { once: true, passive: true });
    document.addEventListener("click", unlock, { once: true });
    return () => { document.removeEventListener("touchstart", unlock); document.removeEventListener("click", unlock); ringer.current?.stop(); };
  }, []);

  const setBadge = useCallback((n: number) => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try { if (n > 0) nav.setAppBadge?.(n).catch(() => {}); else nav.clearAppBadge?.().catch(() => {}); } catch { /* abaikan */ }
    document.title = n > 0 ? `(${n}) CIKOPS Driver` : "CIKOPS Driver";
  }, []);

  const announce = useCallback((dest?: string) => {
    try {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(dest ? L(`Ada tugas masuk, tujuan ${dest}`, `New task, destination ${dest}`) : L("Ada tugas masuk", "New task received"));
      u.lang = lang === "en" ? "en-US" : "id-ID";
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch { /* tidak didukung */ }
  }, [L, lang]);

  // ── Tugas hari ini ──
  const loadTasks = useCallback(async () => {
    if (!driver) return;
    setRefreshing(true);
    try {
      const data = await getDriverTasksToday(driver.id);
      setTasks(data); setTasksErr(null); setTasksLoaded(true);
      const assigned = data.filter((t) => t.status === "ASSIGNED");
      if (knownAssigned.current) {
        const fresh = assigned.filter((t) => !knownAssigned.current!.has(t.id));
        if (fresh.length) { setIncoming(fresh[0]); ringer.current?.ring(4); announce(fresh[0].tujuan); }
      }
      knownAssigned.current = new Set(assigned.map((t) => t.id));
      setBadge(assigned.length);
    } catch (e) {
      const m = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
      setTasksErr(m || L("Gagal memuat tugas.", "Failed to load tasks."));
    } finally { setRefreshing(false); }
  }, [driver, announce, setBadge, L]);

  useEffect(() => {
    if (screen !== "app" || !driver) return;
    loadTasks();
    let unsub = subscribeToTasks(() => loadTasks());
    const resub = () => { unsub(); unsub = subscribeToTasks(() => loadTasks()); };
    const onVisible = () => { if (document.visibilityState === "visible") { resub(); loadTasks(); setBadge(0); } };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    // Jaring pengaman: WebView Android kadang menidurkan koneksi realtime
    const poll = setInterval(() => { if (document.visibilityState === "visible") loadTasks(); }, 15000);
    const beat = setInterval(() => { if (document.visibilityState === "visible") resub(); }, 20000);
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "push-click") loadTasks(); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      clearInterval(poll); clearInterval(beat);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [screen, driver, loadTasks, setBadge]);

  const logout = useCallback(async () => {
    try { await driverSignOut(); } catch { /* sesi lokal tetap dibersihkan */ }
    knownAssigned.current = null; knownReviewed.current = null;
    setBadge(0); setDriver(null); setTasks([]); setTasksLoaded(false); setClaims([]); setRequests([]); setClaimBadge(0);
    setTab("today"); setScreen("login");
  }, [setBadge]);

  // Akun dinonaktifkan admin → keluar otomatis
  useEffect(() => {
    if (screen !== "app" || !driver) return;
    const check = async () => {
      try { if (!(await driverGetSession())) { flash(L("Sesi kamu telah berakhir", "Your session has ended")); logout(); } } catch { /* offline */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(check, 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, [screen, driver, flash, L, logout]);

  // Dibuka dari APK CIKOPS (Firebase) → daftarkan HP untuk notifikasi native otomatis
  const registerPush = useCallback(async (sub: PushSubData) => {
    const { error } = await supabase.rpc("push_subscribe_driver", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth, p_ua: sub.ua });
    if (error) throw new Error(/could not find the function/i.test(error.message) ? L("Notifikasi belum aktif di server.", "Notifications are not set up on the server yet.") : error.message);
  }, [L]);
  useEffect(() => {
    if (screen === "app" && driver) autoEnableNative(registerPush).then((ok) => { if (ok) flash(L("🔔 Notifikasi aktif di HP ini", "🔔 Notifications on for this phone")); });
  }, [screen, driver, registerPush, flash, L]);

  // ── Klaim resmi + pengajuan Self-Claim ──
  const loadClaims = useCallback(async () => {
    if (!driver) return;
    getClaimsByDriver(driver.id).then(setClaims).catch(() => {});
    try {
      const list = await getMyClaimRequests();
      setRequests(list); setReqErr(null);
      const reviewed = new Map(list.filter((r) => r.status === "disetujui" || r.status === "ditolak").map((r) => [r.id, r.status]));
      if (knownReviewed.current) {
        const changed = list.filter((r) => reviewed.has(r.id) && !knownReviewed.current!.has(r.id));
        if (changed.length) {
          const r = changed[0];
          ringer.current?.ring(1);
          flash(r.status === "disetujui" ? L(`✅ Klaim Rp ${fmtRp(r.total)} sudah diverifikasi`, `✅ Claim Rp ${fmtRp(r.total)} verified`) : L("❌ Ada klaim yang ditolak — cek alasannya", "❌ A claim was rejected — see why"));
          setClaimBadge((n) => n + changed.length);
        }
      }
      knownReviewed.current = reviewed;
    } catch (e) { setReqErr(e instanceof Error ? e.message : String(e)); }
  }, [driver, flash, L]);

  useEffect(() => {
    if (screen !== "app" || !driver) return;
    loadClaims();
    const off1 = subscribeToDriverClaims(driver.id, () => {
      loadClaims(); setClaimBadge((n) => n + 1); ringer.current?.ring(1);
      flash(L("💰 Ada klaim baru untukmu", "💰 A new claim was filed for you"));
    });
    const off2 = subscribeClaimRequests(() => loadClaims(), driver.id);
    return () => { off1(); off2(); };
  }, [screen, driver, loadClaims, flash, L]);

  const refreshAll = useCallback(async () => { await Promise.all([loadTasks(), loadClaims()]); }, [loadTasks, loadClaims]);
  const { pull, busy: pulling } = usePullRefresh(refreshAll, screen === "app" && !claimForm && !cancelTask && !pwOpen && !incoming);

  // ── Aksi tugas ──
  async function act(task: TaskDetail, kind: "accept" | "complete" | "cancel") {
    if (!driver) return;
    setBusyId(task.id);
    try {
      if (kind === "accept") await acceptTask(task.id, driver.id);
      else if (kind === "complete") await completeTask(task.id, driver.id);
      else await cancelTaskByDriver(task.id, driver.id);
      haptic(kind === "cancel" ? [40, 60, 40] : [20, 40, 20]);
      flash(kind === "accept" ? L("👍 Tugas diterima — hati-hati di jalan!", "👍 Task accepted — drive safe!")
        : kind === "complete" ? L("✅ Tugas selesai. Terima kasih!", "✅ Task completed. Thank you!")
        : L("Tugas dibatalkan", "Task cancelled"));
      await loadTasks();
    } catch (e) {
      flash(e instanceof Error ? e.message : L("Gagal memproses tugas.", "Failed to update the task."));
    } finally { setBusyId(null); }
  }

  // ── Self-Claim ──
  function openClaimForm(r?: ClaimRequest) {
    if (r) { setClaimForm({ id: r.id, draft: draftFromRequest(r) }); return; }
    let draft = emptyClaim();
    try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) draft = { ...draft, ...(JSON.parse(raw) as ClaimDraft) }; } catch { /* draf rusak */ }
    setClaimForm({ id: null, draft });
  }
  async function cancelRequest(r: ClaimRequest) {
    if (!confirm(L(`Batalkan pengajuan klaim Rp ${fmtRp(r.total)}?`, `Cancel the Rp ${fmtRp(r.total)} claim request?`))) return;
    try { await cancelClaimRequest(r.id); flash(L("Pengajuan dibatalkan", "Request cancelled")); loadClaims(); }
    catch (e) { flash(e instanceof Error ? e.message : String(e)); }
  }

  const stats = useMemo(() => computeStats(tasks), [tasks]);
  const pendingReq = requests.filter((r) => r.status === "menunggu").length;

  /* ════════ SPLASH ════════ */
  if (screen === "splash") {
    return (
      <div className={`${s.splash} ${s.acc_driver}`}>
        <div className={s.splashLogo}><CarGlyph /></div>
        <b>CIKOPS Driver</b>
        <span>{L("Tugas · Klaim · Notifikasi", "Tasks · Claims · Notifications")}</span>
      </div>
    );
  }

  /* ════════ LOGIN ════════ */
  if (screen === "login" || !driver) {
    return (
      <LoginScreen L={L} lang={lang} theme={theme} toggleTheme={toggleTheme} setLang={setLang}
        onDone={(d) => { setDriver(d); setScreen("app"); setTab("today"); }} />
    );
  }

  /* ════════ APLIKASI ════════ */
  const userDriver = isUserDriver(driver);
  const duty = userDriver ? getUserDutyStatus(driver, dutyNow) : null;
  const activeCount = stats.assigned + stats.ongoing;

  return (
    <div className={`${s.app} ${s.acc_driver}`}>
      <PullIndicator pull={pull} busy={pulling} />
      {!online && <div className={s.offline}>{L("Tidak ada koneksi — data mungkin belum terbaru.", "You're offline — data may be out of date.")}</div>}

      <header className={s.hero}>
        <div className={s.heroTop}>
          <div className={s.brandMini}><span><CarGlyph /></span>CIKOPS DRIVER</div>
          <div className={s.heroBtns}>
            <button type="button" className={`${s.iconBtn} ${s.iconTxt}`} onClick={() => setLang(lang === "id" ? "en" : "id")} aria-label="Language">{lang === "id" ? "EN" : "ID"}</button>
            <button type="button" className={s.iconBtn} onClick={toggleTheme} aria-label={L("Ganti tema", "Toggle theme")}><SunMoon dark={theme === "dark"} /></button>
            <button type="button" className={`${s.iconBtn} ${refreshing ? s.spin : ""}`} onClick={refreshAll} aria-label={L("Muat ulang", "Refresh")}>⟳</button>
          </div>
        </div>
        <p className={s.hello}>{greeting(lang)},</p>
        <h1 className={s.heroName}>{firstName(driver.nama)} {driver.avatar_emoji || "👋"}</h1>
        <p className={s.heroDate}>{fmtLong(lang)}</p>
        <div className={s.heroChips}>
          {duty ? (
            <span className={`${s.heroChip} ${duty.onDuty ? "" : s.heroChipOff}`}><i />{duty.onDuty ? "ON DUTY" : "OFF DUTY"} · {dutyHoursLabel}</span>
          ) : (
            <span className={s.heroChip}><i />{L("Online", "Online")} · {driverTypeLabel(driver)}</span>
          )}
          {activeCount > 0 && <span className={s.heroChip}>🚗 {activeCount} {L("tugas aktif", "active")}</span>}
        </div>
      </header>

      <main className={s.main}>
        {tab === "today" && (
          !tasksLoaded && !tasksErr ? <Skeleton /> : (
            <TodayView L={L} lang={lang} tasks={tasks} err={tasksErr} busyId={busyId} duty={duty}
              onRetry={loadTasks} onAccept={(t) => act(t, "accept")} onComplete={(t) => act(t, "complete")} onCancel={setCancelTask}
              onClaim={() => openClaimForm()} registerPush={registerPush} />
          )
        )}
        {tab === "history" && <HistoryView L={L} lang={lang} driverId={driver.id} />}
        {tab === "claims" && (
          <ClaimsView L={L} lang={lang} claims={claims} requests={requests} err={reqErr}
            onNew={() => openClaimForm()} onEdit={openClaimForm} onCancel={cancelRequest} />
        )}
        {tab === "profile" && (
          <ProfileView L={L} lang={lang} driver={driver} stats={stats} theme={theme} toggleTheme={toggleTheme} setLang={setLang}
            registerPush={registerPush} onPassword={() => setPwOpen(true)}
            onLogout={() => { if (confirm(L("Keluar dari aplikasi driver?", "Sign out of the driver app?"))) logout(); }} />
        )}
      </main>

      <BottomNav
        left={<>
          <NavBtn on={tab === "today"} icon="⌂" label={L("Hari ini", "Today")} badge={activeCount} onClick={() => setTab("today")} />
          <NavBtn on={tab === "history"} icon="☰" label={L("Riwayat", "History")} onClick={() => setTab("history")} />
        </>}
        fab={{ label: L("Ajukan klaim", "New claim"), icon: "＋", onClick: () => openClaimForm() }}
        right={<>
          <NavBtn on={tab === "claims"} icon="🧾" label={L("Klaim", "Claims")} badge={claimBadge || pendingReq} onClick={() => { setTab("claims"); setClaimBadge(0); }} />
          <NavBtn on={tab === "profile"} icon="◉" label={L("Profil", "Profile")} onClick={() => setTab("profile")} />
        </>}
      />

      {incoming && (
        <IncomingTask L={L} t={incoming}
          onAccept={() => { ringer.current?.stop(); const t = incoming; setIncoming(null); act(t, "accept"); }}
          onLater={() => { ringer.current?.stop(); setIncoming(null); }} />
      )}

      {cancelTask && (
        <Sheet onClose={() => setCancelTask(null)} label={L("Batalkan tugas", "Cancel task")}>
          <div className={s.stack}>
            <div className={s.cardHead}><h3>{L("Batalkan tugas ini?", "Cancel this task?")}</h3></div>
            <p className={s.muted}>{L("Tujuan", "Destination")}: <b>{cancelTask.tujuan}</b>. {L("Admin akan melihat bahwa tugas dibatalkan oleh driver.", "The admin will see that the driver cancelled it.")}</p>
            <button type="button" className={`${s.ghostBtn} ${s.danger}`} onClick={() => { const t = cancelTask; setCancelTask(null); act(t, "cancel"); }}>{L("Ya, batalkan tugas", "Yes, cancel task")}</button>
            <button type="button" className={s.ghostBtn} onClick={() => setCancelTask(null)}>{L("Tidak, kembali", "No, go back")}</button>
          </div>
        </Sheet>
      )}

      {pwOpen && <PasswordSheet L={L} onClose={() => setPwOpen(false)} onDone={() => { setPwOpen(false); flash(L("Password berhasil diubah", "Password changed")); }} />}

      {claimForm && (
        <ClaimForm L={L} lang={lang} id={claimForm.id} initial={claimForm.draft} onClose={() => setClaimForm(null)}
          onSaved={(total, lines) => {
            const edited = claimForm.id !== null;
            if (!edited) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* abaikan */ } }
            setClaimForm(null); setClaimSent({ total, lines, edited }); loadClaims();
          }} />
      )}

      {claimSent && (
        <SuccessScreen title={claimSent.edited ? L("Tersimpan!", "Saved!") : L("Terkirim!", "Sent!")}
          text={L("Admin Finance akan memverifikasi. Kamu dapat notifikasi saat sudah diproses.", "Finance will review it. You'll be notified once it's processed.")}
          primary={{ label: L("Lihat pengajuan saya", "View my requests"), onClick: () => { setClaimSent(null); setTab("claims"); } }}
          secondary={{ label: L("Kembali", "Back"), onClick: () => setClaimSent(null) }}>
          <div className={s.ticket}>
            <div className={s.ticketTop}><span>🧾 Self-Claim</span><span>{claimSent.lines} {L("rincian", "items")}</span></div>
            <strong className={s.money}>Rp {fmtRp(claimSent.total)}</strong>
            <div className={s.ticketMeta}><span className={`${s.pill} ${s.t_orange}`}>{L("Menunggu verifikasi", "Awaiting review")}</span></div>
          </div>
        </SuccessScreen>
      )}

      {toast && <div className={s.toast} role="status">{toast}</div>}
    </div>
  );
}

/* ════════════ LOGIN ════════════ */
function LoginScreen({ L, lang, theme, toggleTheme, setLang, onDone }: {
  L: Lx; lang: string; theme: string; toggleTheme: () => void; setLang: (l: "id" | "en") => void; onDone: (d: Driver) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  async function submit(e: React.FormEvent | null, demo = false) {
    e?.preventDefault();
    if ((!demo && (!email.trim() || !password)) || busy) return;
    setBusy(true); setErr(null);
    if (demo) { setEmail(DEMO_DRIVER_EMAIL); setPassword(DEMO_PASSWORD); }
    try {
      onDone(await driverSignIn(demo ? DEMO_DRIVER_EMAIL : email.trim(), demo ? DEMO_PASSWORD : password));
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : "";
      setErr(m === "NOT_A_DRIVER" ? L("Akun ini bukan akun driver.", "This account is not a driver account.")
        : m === "INVALID_CREDENTIALS" ? L("Email atau password salah.", "Wrong email or password.") : m || L("Gagal masuk.", "Sign-in failed."));
      setShake(true); setTimeout(() => setShake(false), 500); haptic(120);
    } finally { setBusy(false); }
  }

  return (
    <div className={`${s.login} ${s.acc_driver}`}>
      <div className={s.loginHero}>
        <div className={s.blob1} /><div className={s.blob2} />
        <div className={s.heroBtns} style={{ position: "absolute", top: "calc(14px + var(--safe-t))", right: 14 }}>
          <button type="button" className={`${s.iconBtn} ${s.iconTxt}`} onClick={() => setLang(lang === "id" ? "en" : "id")} aria-label="Language">{lang === "id" ? "EN" : "ID"}</button>
          <button type="button" className={s.iconBtn} onClick={toggleTheme} aria-label="Theme"><SunMoon dark={theme === "dark"} /></button>
        </div>
        <div className={s.loginLogo}><CarGlyph /></div>
        <h1>CIKOPS <span>Driver</span></h1>
        <p>{L("Terima tugas, ajukan klaim, dan pantau perjalanan — langsung dari HP.", "Accept tasks, file claims and track trips — right from your phone.")}</p>
      </div>
      <form className={`${s.loginCard} ${shake ? s.shake : ""}`} onSubmit={submit}>
        <h2>{L("Masuk", "Sign in")}</h2>
        <p className={s.sub}>{L("Pakai email & password dari admin GA", "Use the email & password from the GA admin")}</p>
        <div className={s.stack} style={{ gap: 10 }}>
          <input className={s.input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            placeholder="nama@perusahaan.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} disabled={busy} aria-label="Email" />
          <div className={s.pwWrap}>
            <input className={s.input} type={show ? "text" : "password"} autoComplete="current-password" placeholder="Password"
              value={password} onChange={(e) => { setPassword(e.target.value); setErr(null); }} disabled={busy} aria-label="Password" style={{ paddingRight: 52 }} />
            <button type="button" className={s.linkBtn} style={{ position: "absolute", right: 7 }} onClick={() => setShow((v) => !v)} tabIndex={-1}>
              {show ? L("Tutup", "Hide") : L("Lihat", "Show")}
            </button>
          </div>
          {err && <div className={s.errBox} style={{ margin: 0 }}>{err}</div>}
          <button type="submit" className={s.primaryBtn} disabled={!email.trim() || !password || busy}>{busy ? L("Memeriksa…", "Checking…") : L("Masuk", "Sign in")}</button>
        </div>
        <p className={s.hint}>{L("Lupa password? Hubungi admin GA.", "Forgot your password? Contact the GA admin.")}</p>
        {DEMO_MODE && (
          <button type="button" className={s.ghostBtn} onClick={() => submit(null, true)} disabled={busy} style={{ marginTop: 10, width: "100%" }}>
            🚗 {L("Masuk sebagai driver demo", "Sign in as demo driver")}
          </button>
        )}
      </form>
    </div>
  );
}

/* ════════════ HARI INI ════════════ */
function TodayView({ L, lang, tasks, err, busyId, duty, onRetry, onAccept, onComplete, onCancel, onClaim, registerPush }: {
  L: Lx; lang: string; tasks: TaskDetail[]; err: string | null; busyId: string | null;
  duty: ReturnType<typeof getUserDutyStatus> | null;
  onRetry: () => void; onAccept: (t: TaskDetail) => void; onComplete: (t: TaskDetail) => void; onCancel: (t: TaskDetail) => void;
  onClaim: () => void; registerPush: (s: PushSubData) => Promise<void>;
}) {
  const fresh = tasks.filter((t) => t.status === "ASSIGNED");
  const going = tasks.filter((t) => t.status === "ON GOING");
  const closed = tasks.filter((t) => t.status === "DONE" || t.status === "CANCELLED");
  const done = tasks.filter((t) => t.status === "DONE").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className={s.stack}>
      <NotifNudge L={L} registerPush={registerPush} />
      {err && <div className={s.errBox}>{err} <button type="button" onClick={onRetry}>{L("Coba lagi", "Retry")}</button></div>}

      {duty && (
        <section className={`${s.duty} ${duty.onDuty ? "" : s.dutyOff}`}>
          <span>🔒</span>
          <p>
            <b>{duty.onDuty ? "ON DUTY" : "OFF DUTY"} · {dutyHoursLabel} WIB</b>
            <small>{L("User", "User")}: {duty.userName || "—"}{duty.userTitle ? ` · ${duty.userTitle}` : ""}</small>
            <small>{L("Status diatur otomatis setiap hari.", "Status is set automatically every day.")}</small>
          </p>
        </section>
      )}

      <section className={s.statCard}>
        <div className={s.ring} style={{ ["--p" as string]: pct }}>
          <div><b>{tasks.length}</b><small>{L("tugas", "tasks")}</small></div>
        </div>
        <div className={s.statList}>
          <div><i style={{ background: "var(--acc)" }} /> <span>{L("Baru", "New")}</span><b>{fresh.length}</b></div>
          <div><i className={s.tBlue} /> <span>{L("Dalam perjalanan", "On the way")}</span><b>{going.length}</b></div>
          <div><i className={s.tGreen} /> <span>{L("Selesai", "Done")}</span><b>{done}</b></div>
        </div>
      </section>

      {fresh.length > 0 && (
        <section>
          <div className={s.secHead}><h3>🔔 {L("Tugas baru", "New tasks")}</h3><span className={`${s.badge} ${s.badgeRed}`}>{fresh.length}</span></div>
          <div className={`${s.list} ${s.cols2}`}>{fresh.map((t) => <TripCard key={t.id} L={L} lang={lang} t={t} busy={busyId === t.id} onAccept={onAccept} onComplete={onComplete} onCancel={onCancel} />)}</div>
        </section>
      )}

      {going.length > 0 && (
        <section>
          <div className={s.secHead}><h3>🚗 {L("Sedang berjalan", "In progress")}</h3><span className={s.badge}>{going.length}</span></div>
          <div className={`${s.list} ${s.cols2}`}>{going.map((t) => <TripCard key={t.id} L={L} lang={lang} t={t} busy={busyId === t.id} onAccept={onAccept} onComplete={onComplete} onCancel={onCancel} />)}</div>
        </section>
      )}

      {tasks.length === 0 && !err && (
        <div className={s.emptyBox}>
          <span className={s.emptyIcon}>📭</span>
          <b>{L("Belum ada tugas hari ini", "No tasks today yet")}</b>
          <small>{L("Tugas baru muncul otomatis — HP akan berbunyi.", "New tasks appear automatically — your phone will ring.")}</small>
        </div>
      )}

      {closed.length > 0 && (
        <section>
          <div className={s.secHead}><h3>{L("Selesai hari ini", "Finished today")}</h3><span className={s.badge}>{closed.length}</span></div>
          <div className={s.list}>{closed.map((t) => <TripRow key={t.id} L={L} lang={lang} t={t} />)}</div>
        </section>
      )}

      <button type="button" className={s.emptyCta} onClick={onClaim}>
        <span className={s.emptyIcon}>🧾</span>
        <b>{L("Ada pengeluaran bensin, tol, atau parkir?", "Spent on fuel, tolls or parking?")}</b>
        <small>{L("Ajukan klaim sendiri — admin tinggal verifikasi.", "File the claim yourself — the admin just verifies it.")}</small>
      </button>
      <p className={s.count} style={{ textAlign: "center" }}><span className={s.live}><i />{L("Pembaruan otomatis", "Live updates")}</span></p>
    </div>
  );
}

function statusPill(t: TaskDetail, L: Lx) {
  if (t.status === "ASSIGNED") return <span className={`${s.pill} ${s.t_orange}`}>{L("Baru", "New")}</span>;
  if (t.status === "ON GOING") return <span className={`${s.pill} ${s.t_blue}`}>{L("Berjalan", "On the way")}</span>;
  if (t.status === "CANCELLED") return <span className={`${s.pill} ${s.t_red}`}>{L("Batal", "Cancelled")}</span>;
  return <span className={`${s.pill} ${s.t_green}`}>{L("Selesai", "Done")}</span>;
}

function TripCard({ L, lang, t, busy, onAccept, onComplete, onCancel }: {
  L: Lx; lang: string; t: TaskDetail; busy: boolean;
  onAccept: (t: TaskDetail) => void; onComplete: (t: TaskDetail) => void; onCancel: (t: TaskDetail) => void;
}) {
  const from = (t.lokasi_asal && t.lokasi_asal.trim()) || plantLocation(t.plant);
  return (
    <article className={`${s.trip} ${t.status === "ASSIGNED" ? s.tripNew : t.status === "ON GOING" ? s.tripGo : ""}`}>
      <div className={s.tripHead}>
        {statusPill(t, L)}
        <small>{t.batch_total_days > 1 ? `${t.batch_total_days} ${L("hari", "days")} · ` : ""}{fmtDay(t.tanggal, lang)}</small>
      </div>
      <div className={s.route}>
        <div><small>{L("Dari", "From")}</small><b>{from}</b></div>
        <div><small>{L("Tujuan", "Destination")}</small><b>{t.tujuan}</b></div>
      </div>
      <div className={s.tripMeta}>
        <div><small>{L("Kendaraan", "Vehicle")}</small><b>{t.kendaraan || "—"}</b></div>
        <div><small>{L("Pekerjaan", "Job")}</small><b>{t.jenis_pekerjaan}</b></div>
        <div className={s.tripWide}><small>{L("Pemohon", "Requestor")}</small><b>{t.requestor}{t.departement ? ` · ${t.departement}` : ""}</b></div>
        {t.perihal && <div className={s.tripWide}><small>{L("Perihal", "Purpose")}</small><b>{t.perihal}</b></div>}
      </div>
      {(t.status === "ASSIGNED" || t.status === "ON GOING") && (
        <div className={s.tripNote}>⏰ {L(`Selesaikan sebelum pukul ${TASK_CUTOFF_HOUR}.00 — yang belum selesai ditutup otomatis.`, `Finish before ${TASK_CUTOFF_HOUR}:00 — unfinished tasks close automatically.`)}</div>
      )}
      {t.status === "ASSIGNED" && (
        <div className={s.tripActions}>
          <button type="button" className={s.acceptBtn} disabled={busy} onClick={() => onAccept(t)}>{busy ? L("Memproses…", "Working…") : L("✓ Terima tugas", "✓ Accept task")}</button>
          <button type="button" className={s.cancelBtn} disabled={busy} onClick={() => onCancel(t)}>{L("Tolak", "Decline")}</button>
        </div>
      )}
      {t.status === "ON GOING" && (
        <div className={s.tripActions}>
          <button type="button" className={s.goBtn} disabled={busy} onClick={() => onComplete(t)}>{busy ? L("Memproses…", "Working…") : L("🏁 Selesaikan tugas", "🏁 Complete task")}</button>
          <button type="button" className={s.cancelBtn} disabled={busy} onClick={() => onCancel(t)}>{L("Batal", "Cancel")}</button>
        </div>
      )}
      {t.status === "DONE" && (
        <div className={`${s.stamp} ${s.stampDone}`}>✅ {L("Selesai", "Completed")} {fmtTime(t.completed_at, lang)}
          {isAutoCompleted(t) ? ` · ${L("ditutup otomatis", "closed automatically")}` : ""}</div>
      )}
      {t.status === "CANCELLED" && (
        <div className={`${s.stamp} ${s.stampCancel}`}>🚫 {L("Dibatalkan", "Cancelled")} {fmtTime(t.cancelled_at, lang)}{t.cancelled_by ? ` · ${t.cancelled_by}` : ""}</div>
      )}
    </article>
  );
}

/** Baris ringkas untuk tugas yang sudah selesai / batal (ketuk untuk detail). */
function TripRow({ L, lang, t }: { L: Lx; lang: string; t: TaskDetail }) {
  const [open, setOpen] = useState(false);
  if (open) return <div onClick={() => setOpen(false)}><TripCard L={L} lang={lang} t={t} busy={false} onAccept={() => {}} onComplete={() => {}} onCancel={() => {}} /></div>;
  return (
    <div className={s.row} role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(true); }}>
      <span className={s.catIcon} style={{ ["--h" as string]: t.status === "DONE" ? 145 : 355 }}>{t.status === "DONE" ? "🏁" : "🚫"}</span>
      <div className={s.rowBody}>
        <div className={s.rowTop}><b>{t.tujuan}</b></div>
        <div className={s.rowMeta}>
          <span>{fmtDay(t.tanggal, lang)}</span>
          {t.kendaraan && <span>🚗 {t.kendaraan}</span>}
          <span>👤 {t.requestor}</span>
        </div>
      </div>
      {statusPill(t, L)}
    </div>
  );
}

/* ════════════ TUGAS MASUK (berdering) ════════════ */
function IncomingTask({ L, t, onAccept, onLater }: { L: Lx; t: TaskDetail; onAccept: () => void; onLater: () => void }) {
  return (
    <div className={s.incomingWrap} role="alertdialog" aria-modal="true" aria-labelledby="drv-incoming">
      <div className={s.incomingCard}>
        <div className={s.bell}>🚗</div>
        <small className={s.incomingKicker}>{L("Tugas baru untukmu", "New task for you")}</small>
        <h2 id="drv-incoming">{t.tujuan}</h2>
        <div className={s.incomingMeta}>
          <span>🚩 {(t.lokasi_asal && t.lokasi_asal.trim()) || plantLocation(t.plant)}</span>
          {t.kendaraan && <span>🚗 {t.kendaraan}</span>}
          <span>👤 {t.requestor}</span>
          <span>🧰 {t.jenis_pekerjaan}</span>
        </div>
        <button type="button" className={s.acceptBtn} onClick={onAccept}>{L("✓ Terima tugas", "✓ Accept task")}</button>
        <button type="button" className={s.ghostBtn} onClick={onLater}>{L("Lihat nanti", "Later")}</button>
      </div>
    </div>
  );
}

/* ════════════ RIWAYAT ════════════ */
function HistoryView({ L, lang, driverId }: { L: Lx; lang: string; driverId: string }) {
  const [range, setRange] = useState<"7" | "30" | "90" | "custom">("7");
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayLocalISODate());
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<TaskDetail[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setRows(null); setErr(null);
    try { setRows(await getDriverHistory(driverId, f, t)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, [driverId]);

  useEffect(() => {
    if (range === "custom") return;
    const f = daysAgo(Number(range) - 1), t = todayLocalISODate();
    setFrom(f); setTo(t); load(f, t);
  }, [range, load]);

  const list = (rows ?? []).filter((r) => !status || r.status === status);
  const groups = useMemo(() => {
    const m = new Map<string, TaskDetail[]>();
    list.forEach((r) => { const g = m.get(r.tanggal) ?? []; g.push(r); m.set(r.tanggal, g); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [list]);
  const done = (rows ?? []).filter((r) => r.status === "DONE").length;

  return (
    <div className={s.stack}>
      <div className={s.seg}>
        {(["7", "30", "90", "custom"] as const).map((r) => (
          <button key={r} type="button" className={range === r ? s.segActive : ""} onClick={() => setRange(r)}>
            {r === "custom" ? L("Pilih", "Custom") : `${r} ${L("hari", "days")}`}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <section className={s.card}>
          <div className={s.timeGrid} style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label><small>{L("Dari", "From")}</small><input type="date" className={s.input} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label><small>{L("Sampai", "To")}</small><input type="date" className={s.input} value={to} min={from} max={todayLocalISODate()} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <button type="button" className={s.primaryBtn} style={{ marginTop: 10 }} onClick={() => load(from, to)}>{L("Tampilkan", "Show")}</button>
        </section>
      )}
      <div className={s.chips}>
        {[["", L("Semua", "All")], ["DONE", L("Selesai", "Done")], ["ON GOING", L("Berjalan", "On the way")], ["ASSIGNED", L("Baru", "New")], ["CANCELLED", L("Batal", "Cancelled")]].map(([k, label]) => (
          <button key={k} type="button" className={status === k ? s.chipOn : ""} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>
      {rows !== null && !err && (
        <div className={s.openSummary}>
          <div className={s.t_blue}><b>{rows.length}</b><span>{L("Tugas", "Tasks")}</span></div>
          <div className={s.t_green}><b>{done}</b><span>{L("Selesai", "Done")}</span></div>
          <div className={s.t_orange}><b>{new Set(rows.map((r) => r.tanggal)).size}</b><span>{L("Hari kerja", "Work days")}</span></div>
        </div>
      )}
      {err && <div className={s.errBox}>{err}</div>}
      {rows === null ? <Skeleton /> : groups.length === 0 ? (
        <div className={s.emptyBox}><span className={s.emptyIcon}>🗂️</span><b>{L("Tidak ada riwayat", "No history")}</b><small>{L("Coba ubah rentang tanggal atau status.", "Try another date range or status.")}</small></div>
      ) : groups.map(([d, items]) => (
        <section key={d}>
          <div className={s.dayHead}><b>{fmtDay(d, lang)}</b><span>{items.length}</span></div>
          <div className={s.list}>{items.map((t) => <TripRow key={t.id} L={L} lang={lang} t={t} />)}</div>
        </section>
      ))}
    </div>
  );
}

/* ════════════ KLAIM ════════════ */
function weekKey(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return toLocalISODate(d);
}
function weekLabel(monday: string, lang: string) {
  const d = new Date(monday + "T00:00:00");
  const L = lang === "en" ? "en" : "id";
  return `${L === "en" ? "Week" : "Minggu"} ${Math.ceil(d.getDate() / 7)} · ${MONTHS[L][d.getMonth()]} ${d.getFullYear()}`;
}

function ClaimsView({ L, lang, claims, requests, err, onNew, onEdit, onCancel }: {
  L: Lx; lang: string; claims: Claim[]; requests: ClaimRequest[]; err: string | null;
  onNew: () => void; onEdit: (r: ClaimRequest) => void; onCancel: (r: ClaimRequest) => void;
}) {
  const pending = requests.filter((r) => r.status === "menunggu");
  const [view, setView] = useState<"requests" | "claims">(pending.length || !claims.length ? "requests" : "claims");
  const [open, setOpen] = useState<string | null>(null);
  const monthKey = todayLocalISODate().slice(0, 7);
  const monthTotal = claims.filter((c) => c.periodDate.slice(0, 7) === monthKey).reduce((a, c) => a + c.total, 0);
  const groups = useMemo(() => {
    const m = new Map<string, Claim[]>();
    [...claims].sort((a, b) => b.periodDate.localeCompare(a.periodDate)).forEach((c) => { const k = weekKey(c.periodDate); m.set(k, [...(m.get(k) ?? []), c]); });
    return [...m.entries()];
  }, [claims]);

  return (
    <div className={s.stack}>
      <section className={s.statCard}>
        <div className={s.statList}>
          <div><i style={{ background: "var(--orange)" }} /><span>{L("Menunggu verifikasi", "Awaiting review")}</span><b>{pending.length}</b></div>
          <div><i className={s.tGreen} /><span>{L("Klaim bulan ini", "Claims this month")}</span><b className={s.money}>Rp {fmtRp(monthTotal)}</b></div>
        </div>
      </section>

      <div className={s.seg}>
        <button type="button" className={view === "requests" ? s.segActive : ""} onClick={() => setView("requests")}>
          {L("Pengajuan saya", "My requests")}{pending.length > 0 && <em>{pending.length}</em>}
        </button>
        <button type="button" className={view === "claims" ? s.segActive : ""} onClick={() => setView("claims")}>{L("Klaim resmi", "Official claims")}</button>
      </div>

      {view === "requests" && (
        <>
          {err && <div className={s.errBox}>{err}</div>}
          {requests.length === 0 && !err ? (
            <button type="button" className={s.emptyCta} onClick={onNew}>
              <span className={s.emptyIcon}>🧾</span>
              <b>{L("Belum ada pengajuan", "No requests yet")}</b>
              <small>{L("Ketuk untuk mengajukan klaim bensin, tol, parkir, dan lainnya.", "Tap to claim fuel, tolls, parking and more.")}</small>
            </button>
          ) : (
            <div className={s.list}>
              {requests.map((r) => {
                const st = CLAIM_REQUEST_STATUS[r.status];
                const ct = claimType(r.items[0]?.type ?? "Other");
                const isOpen = open === r.id;
                return (
                  <div key={r.id} className={s.claimRow} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <div className={s.claimTop}>
                      <span className={s.catIcon} style={{ ["--h" as string]: ct.hue }}>{ct.icon}</span>
                      <div className={s.rowBody}>
                        <b>{fmtDay(r.periodDate, lang)}</b>
                        <div className={s.rowMeta}>
                          <span>{r.items.length} {L("rincian", "items")}</span>
                          <span>{r.nota === "menyusul" ? L("📎 nota menyusul", "📎 receipt later") : L("📎 nota ada", "📎 receipt ready")}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className={s.money}>Rp {fmtRp(r.total)}</div>
                        <span className={`${s.pill} ${s["t_" + st.tone]}`}>{lang === "en" ? st.en : st.label}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <>
                        <ItemsList items={r.items} total={r.total} lang={lang} />
                        {r.note && <p className={s.muted} style={{ margin: 0 }}>📝 {r.note}</p>}
                        {r.status === "ditolak" && <div className={`${s.adminNote} ${s.adminNoteRed}`}><b>{L("Alasan ditolak", "Rejection reason")}:</b> {r.adminNote}</div>}
                        {r.status === "disetujui" && (
                          <div className={`${s.adminNote} ${s.adminNoteGreen}`}>✓ {L("Diverifikasi", "Verified by")} {r.reviewedBy}{r.adminNote ? ` — ${r.adminNote}` : ""}</div>
                        )}
                        {r.status === "menunggu" && (
                          <div className={s.btnRow} onClick={(e) => e.stopPropagation()}>
                            <button type="button" className={s.ghostBtn} onClick={() => onEdit(r)}>✎ {L("Ubah", "Edit")}</button>
                            <button type="button" className={`${s.ghostBtn} ${s.danger}`} onClick={() => onCancel(r)}>{L("Batalkan", "Cancel")}</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "claims" && (
        claims.length === 0 ? (
          <div className={s.emptyBox}><span className={s.emptyIcon}>💰</span><b>{L("Belum ada klaim resmi", "No official claims yet")}</b><small>{L("Klaim yang sudah diverifikasi admin muncul di sini.", "Claims verified by the admin appear here.")}</small></div>
        ) : groups.map(([wk, items]) => (
          <section key={wk}>
            <div className={s.dayHead}><b>{weekLabel(wk, lang)}</b><span className={s.money}>Rp {fmtRp(items.reduce((a, c) => a + c.total, 0))}</span></div>
            <div className={s.list}>
              {items.map((c) => {
                const ct = claimType(c.items[0]?.type ?? "Other");
                const isOpen = open === c.id;
                return (
                  <div key={c.id} className={s.claimRow} onClick={() => setOpen(isOpen ? null : c.id)}>
                    <div className={s.claimTop}>
                      <span className={s.catIcon} style={{ ["--h" as string]: ct.hue }}>{ct.icon}</span>
                      <div className={s.rowBody}>
                        <b>{fmtDay(c.periodDate, lang)}</b>
                        <div className={s.rowMeta}><span>{c.items.map((i) => (lang === "en" ? claimType(i.type).en : claimType(i.type).label)).join(", ")}</span></div>
                      </div>
                      <div className={s.money}>Rp {fmtRp(c.total)}</div>
                    </div>
                    {isOpen && (
                      <>
                        <ItemsList items={c.items} total={c.total} lang={lang} />
                        <p className={s.count}>{L("Diajukan", "Submitted")}: {fmtDay(c.submissionDate, lang)}</p>
                        {c.note && <p className={s.muted} style={{ margin: 0 }}>📝 {c.note}</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ItemsList({ items, total, lang }: { items: ClaimItem[]; total: number; lang: string }) {
  return (
    <div className={s.claimItems}>
      {items.map((it, i) => {
        const ct = claimType(it.type);
        return <div key={i}><span>{ct.icon} {lang === "en" ? ct.en : ct.label}{it.expr && /[+\-*/]/.test(it.expr) ? <small> ({it.expr})</small> : null}</span><b className={s.money}>Rp {fmtRp(it.total)}</b></div>;
      })}
      <div className={s.claimSum}><span>Total</span><b className={s.money}>Rp {fmtRp(total)}</b></div>
    </div>
  );
}

/* ════════════ FORM SELF-CLAIM ════════════ */
function ClaimForm({ L, lang, id, initial, onClose, onSaved }: {
  L: Lx; lang: string; id: string | null; initial: ClaimDraft; onClose: () => void; onSaved: (total: number, lines: number) => void;
}) {
  const [d, setD] = useState<ClaimDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = todayLocalISODate();

  // Draf pengajuan baru disimpan di HP supaya tidak hilang bila aplikasi tertutup
  useEffect(() => {
    if (id) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* penuh / mode privat */ }
  }, [d, id]);

  const setLine = (key: number, patch: Partial<ClaimLine>) => setD((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const total = d.lines.reduce((a, l) => a + (evalExpr(l.expr) || 0), 0);
  const filled = d.lines.filter((l) => (evalExpr(l.expr) || 0) > 0).length;

  async function submit() {
    const bad = d.lines.findIndex((l) => !((evalExpr(l.expr) || 0) > 0));
    if (bad >= 0) { setErr(L(`Nominal rincian ${bad + 1} belum diisi.`, `Amount for item ${bad + 1} is missing.`)); return; }
    if (!d.periodDate || d.periodDate > today) { setErr(L("Tanggal pengeluaran tidak valid.", "Invalid expense date.")); return; }
    setBusy(true); setErr(null);
    try {
      const items: ClaimItem[] = d.lines.map((l) => ({ type: l.type, expr: l.expr.replace(/\s+/g, ""), total: evalExpr(l.expr) || 0 }));
      await submitClaimRequest(id, { periodDate: d.periodDate, items, note: d.note.trim(), nota: d.nota });
      onSaved(total, items.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); haptic(120);
    } finally { setBusy(false); }
  }

  return (
    <div className={s.formWrap} data-nopull>
      <header className={s.formHead}>
        <button type="button" className={s.iconBtnDark} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        <div><b>{id ? L("Ubah pengajuan", "Edit request") : L("Ajukan klaim", "New claim")}</b><small>{L("Masuk ke admin Finance untuk diverifikasi", "Sent to Finance for review")}</small></div>
      </header>

      <div className={s.formBody}>
        <section className={s.fSec}>
          <label className={s.fLabel} htmlFor="claim-date"><span className={s.step}>1</span> {L("Tanggal pengeluaran", "Expense date")}</label>
          <input id="claim-date" type="date" className={s.input} value={d.periodDate} max={today} min={daysAgo(120)} onChange={(e) => setD((x) => ({ ...x, periodDate: e.target.value || today }))} />
          <div className={s.quick} style={{ margin: "10px 0 0" }}>
            {[0, 1, 2].map((n) => { const v = daysAgo(n); return <button key={n} type="button" className={d.periodDate === v ? s.quickOn : ""} onClick={() => setD((x) => ({ ...x, periodDate: v }))}>{fmtDay(v, lang)}</button>; })}
          </div>
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel}><span className={s.step}>2</span> {L("Rincian pengeluaran", "Expense items")} <em>*</em></label>
          <div className={s.stack} style={{ gap: 10 }}>
            {d.lines.map((l, i) => {
              const val = evalExpr(l.expr);
              return (
                <div key={l.key} className={s.lineCard}>
                  <div className={s.lineHead}>
                    <span>{L("Rincian", "Item")} {i + 1}</span>
                    {d.lines.length > 1 && <button type="button" onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}>{L("Hapus", "Remove")}</button>}
                  </div>
                  <div className={s.typeRow}>
                    {CLAIM_TYPES.map((t) => (
                      <button key={t.id} type="button" className={l.type === t.id ? s.typeOn : ""} style={{ ["--h" as string]: t.hue }} onClick={() => { haptic(8); setLine(l.key, { type: t.id }); }}>
                        {t.icon} {lang === "en" ? t.en : t.label}
                      </button>
                    ))}
                  </div>
                  <div className={s.amountWrap}>
                    <span>Rp</span>
                    <input className={s.input} inputMode="tel" placeholder="0" value={l.expr} aria-label={L("Nominal", "Amount")}
                      onChange={(e) => setLine(l.key, { expr: e.target.value.replace(/[^0-9+\-*/(). ]/g, "") })} />
                  </div>
                  {/[+\-*/]/.test(l.expr) && <div className={s.amountHint}>= Rp {val !== null ? fmtRp(val) : "?"}</div>}
                  <div className={s.quickAmt}>
                    {[10000, 20000, 50000, 100000].map((n) => (
                      <button key={n} type="button" onClick={() => setLine(l.key, { expr: l.expr ? `${l.expr}+${n}` : String(n) })}>+{n / 1000}rb</button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button type="button" className={s.addLine} onClick={() => setD((x) => ({ ...x, lines: [...x.lines, newLine(x.lines[x.lines.length - 1]?.type === "Gasoline" ? "Toll" : "Parking")] }))}>＋ {L("Tambah rincian", "Add item")}</button>
          </div>
          <p className={s.count} style={{ marginTop: 10 }}>{L("Tip: beberapa struk bisa dijumlah, mis. 50000+25000", "Tip: add several receipts, e.g. 50000+25000")}</p>
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel}><span className={s.step}>3</span> {L("Nota / struk", "Receipts")}</label>
          <div className={s.choice}>
            <button type="button" className={d.nota === "menyusul" ? s.choiceOn : ""} onClick={() => setD((x) => ({ ...x, nota: "menyusul" }))}>
              <b>📎 {L("Menyusul", "Later")}</b><small>{L("Nota diserahkan ke admin nanti", "I'll hand the receipts in later")}</small>
            </button>
            <button type="button" className={d.nota === "ada" ? s.choiceOn : ""} onClick={() => setD((x) => ({ ...x, nota: "ada" }))}>
              <b>✅ {L("Sudah ada", "Ready")}</b><small>{L("Nota sudah saya pegang / serahkan", "I have / handed in the receipts")}</small>
            </button>
          </div>
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel} htmlFor="claim-note"><span className={s.step}>4</span> {L("Keterangan", "Notes")} <span className={s.opt}>{L("opsional", "optional")}</span></label>
          <textarea id="claim-note" className={s.textarea} rows={2} maxLength={500} placeholder={L("mis. Antar tamu ke Jakarta, tol pulang-pergi", "e.g. Drove guests to Jakarta, return tolls")}
            value={d.note} onChange={(e) => setD((x) => ({ ...x, note: e.target.value }))} />
        </section>
      </div>

      <footer className={s.formFoot}>
        <div className={s.totalBar}>
          <div><small>{L("Total klaim", "Claim total")} · {filled}/{d.lines.length} {L("rincian", "items")}</small><span className={s.money}>Rp {fmtRp(total)}</span></div>
        </div>
        {err && <div className={s.errBox}>{err}</div>}
        <button type="button" className={s.saveBtn} onClick={submit} disabled={busy || total <= 0}>
          {busy ? L("Mengirim…", "Sending…") : id ? L("Simpan perubahan", "Save changes") : L("Kirim ke admin", "Send to admin")}
        </button>
      </footer>
    </div>
  );
}

/* ════════════ PROFIL ════════════ */
function ProfileView({ L, lang, driver, stats, theme, toggleTheme, setLang, registerPush, onPassword, onLogout }: {
  L: Lx; lang: string; driver: Driver; stats: ReturnType<typeof computeStats>; theme: string; toggleTheme: () => void;
  setLang: (l: "id" | "en") => void; registerPush: (s: PushSubData) => Promise<void>; onPassword: () => void; onLogout: () => void;
}) {
  return (
    <div className={s.stack}>
      <section className={s.profileCard}>
        <span className={`${s.avatar} ${s.avatarLg}`} style={{ ["--h" as string]: 222, fontSize: 32 }}>{driver.avatar_emoji || "🧑‍✈️"}</span>
        <b>{driver.nama}</b>
        <small>{driverTypeLabel(driver)} · {plantFull(driver.plant)}</small>
        <div className={s.profileStats}>
          <div><b>{stats.total}</b><span>{L("Tugas hari ini", "Today")}</span></div>
          <div><b>{stats.done}</b><span>{L("Selesai", "Done")}</span></div>
          <div><b>{stats.assigned + stats.ongoing}</b><span>{L("Aktif", "Active")}</span></div>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><h3>{L("Informasi", "Details")}</h3></div>
        <div className={s.infoList}>
          {isUserDriver(driver) && <div><span>👤</span><p><small>User</small><b>{driver.assigned_user || "—"}{driver.assigned_user_title ? ` · ${driver.assigned_user_title}` : ""}</b></p></div>}
          {isUserDriver(driver) && <div><span>🔒</span><p><small>{L("Jam tugas", "Duty hours")}</small><b>{dutyHoursLabel} WIB</b></p></div>}
          <div><span>📱</span><p><small>{L("No. HP", "Phone")}</small><b>{driver.no_hp || "—"}</b></p></div>
          {driver.email && <div><span>✉️</span><p><small>Email</small><b>{driver.email}</b></p></div>}
        </div>
      </section>

      <NotifCard L={L} registerPush={registerPush} />

      <section className={s.card}>
        <div className={s.cardHead}><h3>{L("Pengaturan", "Settings")}</h3></div>
        <div className={s.infoList}>
          <div><span>🔑</span><p><small>Password</small><b>••••••••</b></p><button type="button" className={s.linkBtn} onClick={onPassword}>{L("Ubah", "Change")}</button></div>
          <div><span>🌗</span><p><small>{L("Tema", "Theme")}</small><b>{theme === "dark" ? L("Gelap", "Dark") : L("Terang", "Light")}</b></p><button type="button" className={s.linkBtn} onClick={toggleTheme}>{L("Ganti", "Switch")}</button></div>
          <div><span>🌐</span><p><small>{L("Bahasa", "Language")}</small><b>{lang === "en" ? "English" : "Bahasa Indonesia"}</b></p><button type="button" className={s.linkBtn} onClick={() => setLang(lang === "en" ? "id" : "en")}>{lang === "en" ? "ID" : "EN"}</button></div>
        </div>
      </section>

      <button type="button" className={s.logoutBtn} onClick={onLogout}>{L("Keluar", "Sign out")}</button>
      <p className={s.footNote}>CIKOPS-FM · {L("Aplikasi Driver", "Driver app")}</p>
    </div>
  );
}

/** Ajakan mengaktifkan notifikasi di beranda (hilang setelah aktif / ditutup). */
function NotifNudge({ L, registerPush }: { L: Lx; registerPush: (s: PushSubData) => Promise<void> }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    try { off = localStorage.getItem("cikops_driver_nudge") === "0"; } catch { /* abaikan */ }
    if (!off) pushState().then((st) => setShow(st === "off"));
  }, []);
  if (!show) return null;
  return (
    <div className={s.nudge}>
      <span>🔔</span>
      <p><b>{L("Aktifkan notifikasi", "Turn on notifications")}</b><small>{L("Supaya HP berdering saat ada tugas baru.", "So your phone rings for new tasks.")}</small></p>
      <button type="button" className={s.linkBtn} disabled={busy} onClick={async () => {
        setBusy(true);
        try { await enablePush(registerPush); setShow(false); haptic([20, 40, 20]); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); }
      }}>{busy ? "…" : L("Aktifkan", "Enable")}</button>
      <button type="button" aria-label={L("Tutup", "Close")} onClick={() => { setShow(false); try { localStorage.setItem("cikops_driver_nudge", "0"); } catch { /* abaikan */ } }}>✕</button>
    </div>
  );
}

function NotifCard({ L, registerPush }: { L: Lx; registerPush: (s: PushSubData) => Promise<void> }) {
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { pushState().then(setSt); }, []);
  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); setSt(await pushState()); }
  }
  return (
    <section className={`${s.card} ${s.notifCard}`}>
      <div className={s.cardHead}><h3>🔔 {L("Notifikasi & nada dering", "Notifications & ringtone")}</h3>{st === "on" && <span className={`${s.pill} ${s.t_green}`}>{L("Aktif", "On")}</span>}</div>
      <p className={s.muted}>
        {st === "on" ? L("HP ini berbunyi & bergetar saat ada tugas baru, walau aplikasi tertutup.", "This phone rings & vibrates for new tasks, even when the app is closed.")
          : st === "denied" ? L("Notifikasi diblokir. Izinkan di pengaturan aplikasi / situs, lalu coba lagi.", "Notifications are blocked. Allow them in app / site settings, then retry.")
          : st === "ios-install" ? L("iPhone: pasang dulu ke Layar Utama, buka dari ikon, lalu aktifkan.", "iPhone: add to Home Screen first, open from the icon, then enable.")
          : st === "unsupported" ? L("Browser ini belum mendukung notifikasi — pakai Chrome atau APK CIKOPS Driver.", "This browser doesn't support notifications — use Chrome or the CIKOPS Driver APK.")
          : L("Aktifkan supaya HP berdering saat ada tugas baru.", "Turn on so your phone rings for new tasks.")}
      </p>
      {st === "on" ? (
        <div className={s.btnRow}>
          <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => run(() => testPush({ app: "driver" }), L("Tes dikirim — cek bar notifikasi.", "Test sent — check your notifications."))}>{L("Kirim tes", "Send test")}</button>
          <button type="button" className={`${s.ghostBtn} ${s.danger}`} disabled={busy} onClick={() => run(disablePush, L("Notifikasi dimatikan.", "Notifications off."))}>{L("Matikan", "Turn off")}</button>
        </div>
      ) : st === "off" || st === "denied" ? (
        <button type="button" className={s.primaryBtn} disabled={busy} onClick={() => run(() => enablePush(registerPush), L("Notifikasi aktif! 🎉", "Notifications on! 🎉"))}>
          {busy ? L("Mengaktifkan…", "Enabling…") : L("🔔 Aktifkan notifikasi", "🔔 Turn on notifications")}
        </button>
      ) : null}
      {msg && <p className={msg.ok ? s.okText : s.errText}>{msg.text}</p>}
    </section>
  );
}

function PasswordSheet({ L, onClose, onDone }: { L: Lx; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) { setErr(L("Password minimal 6 karakter.", "Password must be at least 6 characters.")); return; }
    if (pw !== pw2) { setErr(L("Konfirmasi password tidak sama.", "Passwords do not match.")); return; }
    setBusy(true); setErr(null);
    try { await changeDriverPassword(pw); onDone(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : L("Gagal mengubah password.", "Failed to change password.")); }
    finally { setBusy(false); }
  }
  return (
    <Sheet onClose={() => { if (!busy) onClose(); }} label={L("Ubah password", "Change password")}>
      <form className={s.stack} onSubmit={submit}>
        <div className={s.cardHead}><h3>{L("Ubah password", "Change password")}</h3><span>{L("min. 6 karakter", "min. 6 characters")}</span></div>
        <input className={s.input} type="password" autoComplete="new-password" placeholder={L("Password baru", "New password")} value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} />
        <input className={s.input} type="password" autoComplete="new-password" placeholder={L("Ulangi password baru", "Repeat new password")} value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={busy} />
        {err && <div className={s.errBox} style={{ margin: 0 }}>{err}</div>}
        <button type="submit" className={s.primaryBtn} disabled={busy || !pw || !pw2}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan password", "Save password")}</button>
        <button type="button" className={s.ghostBtn} onClick={onClose} disabled={busy}>{L("Batal", "Cancel")}</button>
      </form>
    </Sheet>
  );
}

function CarGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 17h14v-5l-2-5H7l-2 5v5z" /><path d="M5 12h14" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" />
    </svg>
  );
}
