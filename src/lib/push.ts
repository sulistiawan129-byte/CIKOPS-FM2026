// Notifikasi untuk aplikasi Driver & TGA (036 + edge function send-web-push).
// Berbunyi & bergetar walau aplikasi tertutup:
//  • APK CIKOPS (Firebase): notifikasi native. APK membuka halaman dengan ?fcm=<token>;
//    token disimpan lalu didaftarkan otomatis sesudah login (bagian 042).
//  • Browser / PWA: Web Push (Android Chrome; iPhone iOS 16.4+ dan harus dipasang ke Layar Utama).
import { supabase } from "./supabaseClient";

export type PushState = "unsupported" | "ios-install" | "denied" | "on" | "off";

export interface PushSubData { endpoint: string; p256dh: string; auth: string; ua: string }

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/* ── Token FCM dari APK ── */
const FCM_KEY = "cikops_fcm";
const FCM_REG_KEY = "cikops_fcm_reg";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* mode privat */ } },
};

/** Ambil ?fcm= dari alamat (dikirim APK saat dibuka), simpan, lalu bersihkan alamatnya. */
function captureNativeToken() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const tok = url.searchParams.get("fcm");
  if (!tok) return;
  if (/^[A-Za-z0-9_:.-]{20,4096}$/.test(tok)) store.set(FCM_KEY, tok);
  url.searchParams.delete("fcm");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
captureNativeToken();

/** Token FCM bila halaman dibuka dari APK CIKOPS yang mendukung notifikasi native. */
export function nativeToken(): string | null {
  return typeof window === "undefined" ? null : store.get(FCM_KEY);
}

/** Daftarkan HP ini otomatis (tanpa tombol) bila dibuka dari APK dan belum terdaftar. */
export async function autoEnableNative(register: (s: PushSubData) => Promise<void>): Promise<boolean> {
  const tok = nativeToken();
  if (!tok || store.get(FCM_REG_KEY) === tok) return false;
  try { await enablePush(register); return true; } catch { return false; }
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js").catch(() => null);
  return navigator.serviceWorker.ready;
}

export async function pushState(): Promise<PushState> {
  const tok = nativeToken();
  if (tok) return store.get(FCM_REG_KEY) === tok ? "on" : "off";
  if (!pushSupported()) return isIOS() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch { return "off"; }
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const bytesToB64 = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";

async function vapidKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("send-web-push", { body: { action: "vapid-key" } });
  const d = data as { publicKey?: string; error?: string } | null;
  if (error || !d?.publicKey) throw new Error(d?.error ?? "Layanan notifikasi belum aktif — admin perlu memasang fungsi send-web-push.");
  return d.publicKey;
}

/** Minta izin + daftarkan HP. register() menyimpan langganan ke database (per aplikasi). */
export async function enablePush(register: (s: PushSubData) => Promise<void>): Promise<void> {
  const tok = nativeToken();
  if (tok) {
    await register({ endpoint: `fcm:${tok}`, p256dh: "", auth: "", ua: navigator.userAgent });
    store.set(FCM_REG_KEY, tok);
    // Langganan Web Push lama di HP yang sama dimatikan supaya notifikasi tidak dobel
    if (pushSupported()) {
      const sub = await navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).catch(() => null);
      if (sub) { await supabase.rpc("push_unsubscribe", { p_endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => false); }
    }
    return;
  }
  if (!pushSupported()) {
    throw new Error(isIOS() ? "Di iPhone, pasang dulu aplikasi ke Layar Utama (Bagikan → Tambah ke Layar Utama), lalu buka dari ikon." : "Browser ini belum mendukung notifikasi. Pakai Chrome.");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Izin notifikasi ditolak. Aktifkan lewat pengaturan situs / aplikasi di HP.");
  const reg = await registration();
  const key = await vapidKey();
  let sub = await reg.pushManager.getSubscription();
  // Kunci server berganti → daftar ulang
  if (sub && bytesToB64(sub.options.applicationServerKey) !== key.replace(/=+$/, "")) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await register({ endpoint: sub.endpoint, p256dh: bytesToB64(sub.getKey("p256dh")), auth: bytesToB64(sub.getKey("auth")), ua: navigator.userAgent });
}

export async function disablePush(): Promise<void> {
  const tok = nativeToken();
  if (tok) {
    await supabase.rpc("push_unsubscribe", { p_endpoint: `fcm:${tok}` });
    store.set(FCM_REG_KEY, null);
    return;
  }
  if (!pushSupported()) return;
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Kirim notifikasi tes ke HP ini. */
export async function testPush(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-web-push", { body: { event: "test", ...body } });
  const d = data as { ok?: boolean; sent?: number; error?: string; errors?: string[] } | null;
  if (error) throw new Error(error.message);
  if (!d?.ok) throw new Error(d?.error ?? "Gagal mengirim notifikasi tes.");
  if (!d.sent) throw new Error(d.errors?.length ? `Notifikasi tidak terkirim: ${d.errors.join(" · ")}` : "Notifikasi tidak terkirim — coba matikan lalu aktifkan lagi. (Bila tetap gagal, pastikan fungsi send-web-push sudah versi terbaru.)");
}

/** Beri tahu teknisi TGA tentang tugas baru / dialihkan (isi pesan dibuat server dari database). */
export function notifyTgaTask(id: string) {
  supabase.functions.invoke("send-web-push", { body: { event: "tga_task", id } }).catch(() => {});
}

/* ── Nada dering di dalam aplikasi (saat aplikasi terbuka) ── */
export function createRinger(src = "/notif.wav") {
  let audio: HTMLAudioElement | null = null;
  let left = 0;
  const get = () => {
    if (!audio && typeof Audio !== "undefined") {
      audio = new Audio(src);
      audio.preload = "auto";
      audio.addEventListener("ended", () => { if (left-- > 0 && audio) { audio.currentTime = 0; audio.play().catch(() => {}); } });
    }
    return audio;
  };
  return {
    /** Panggil dari sentuhan pertama pengguna supaya browser mengizinkan suara. */
    unlock() {
      const a = get();
      if (!a) return;
      a.muted = true;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
    },
    ring(times = 3) {
      const a = get();
      left = times - 1;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300, 400, 300, 120, 300]);
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
    },
    stop() {
      left = 0;
      if (audio) { audio.pause(); audio.currentTime = 0; }
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
    },
  };
}
