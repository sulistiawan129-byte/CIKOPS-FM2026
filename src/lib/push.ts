// Notifikasi Web Push untuk aplikasi Driver & TGA (036 + edge function send-web-push).
// Berbunyi & bergetar walau aplikasi tertutup (Android: Chrome / APK GitHub; iPhone: iOS 16.4+
// dan aplikasi harus dipasang ke Layar Utama).
import { supabase } from "./supabaseClient";

export type PushState = "unsupported" | "ios-install" | "denied" | "on" | "off";

export interface PushSubData { endpoint: string; p256dh: string; auth: string; ua: string }

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js").catch(() => null);
  return navigator.serviceWorker.ready;
}

export async function pushState(): Promise<PushState> {
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
  const d = data as { ok?: boolean; sent?: number; error?: string } | null;
  if (error) throw new Error(error.message);
  if (!d?.ok) throw new Error(d?.error ?? "Gagal mengirim notifikasi tes.");
  if (!d.sent) throw new Error("Notifikasi tidak terkirim — coba matikan lalu aktifkan lagi.");
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
