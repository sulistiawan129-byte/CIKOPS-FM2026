// send-web-push — notifikasi untuk aplikasi Driver & TGA.
// Berbunyi & bergetar walau aplikasi tertutup. Langganan HP ada di tabel push_subscriptions (036):
//   • endpoint https://…   → Web Push (browser / PWA)
//   • endpoint fcm:<token> → Firebase Cloud Messaging (APK, notifikasi native) — bagian 042
//
// Deploy : supabase functions deploy send-web-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mis. mailto:ga@perusahaan.com)
//          → buat sekali: npx web-push generate-vapid-keys
//          FCM_SERVICE_ACCOUNT  isi file JSON service account Firebase
//          (Firebase → Project settings → Service accounts → Generate new private key)
//
// Permintaan (POST JSON):
//   { action: "vapid-key" }                          → kunci publik untuk mendaftar (tanpa login)
//   { event: "tga_task", id }                        → tugas TGA baru / dialihkan (isi pesan dari database;
//                                                      hanya terkirim sekali per penugasan, ≤ 15 menit)
//   { event: "driver", driverIds, title, body }      → pesan ke driver (wajib login staf)
//   { event: "test", app: "tga", token }             → tes ke HP teknisi sendiri
//   { event: "test", app: "driver" }                 → tes ke HP driver yang login (Authorization)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@cikops.com";
const FCM_SERVICE_ACCOUNT = Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Sub { endpoint: string; p256dh: string; auth: string }
interface Message { title: string; body: string; url: string; tag: string; app: "driver" | "tga"; urgent?: boolean; kind?: "task" | "info" }

const CAT_ICON: Record<string, string> = { Listrik: "⚡", AC: "❄️", Plumbing: "🚰", Furniture: "🪑", Sipil: "🧱", Lainnya: "🔧" };

/* ── Firebase Cloud Messaging (HTTP v1) ── */
interface ServiceAccount { project_id: string; client_email: string; private_key: string }
let fcmCache: { token: string; exp: number } | null = null;

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b));
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** FCM_SERVICE_ACCOUNT boleh berisi JSON apa adanya atau versi base64-nya. */
function serviceAccount(): ServiceAccount | null {
  const raw = FCM_SERVICE_ACCOUNT.trim();
  if (!raw) return null;
  for (const text of [raw, (() => { try { return atob(raw.replace(/\s+/g, "")); } catch { return ""; } })()]) {
    try {
      const sa = JSON.parse(text) as ServiceAccount;
      if (sa.project_id && sa.client_email && sa.private_key) return { ...sa, private_key: sa.private_key.replace(/\\n/g, "\n") };
    } catch { /* coba format berikutnya */ }
  }
  console.warn("FCM_SERVICE_ACCOUNT tidak terbaca — isi dengan JSON service account atau base64-nya");
  return null;
}

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmCache && fcmCache.exp - 60 > now) return fcmCache.token;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = await res.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!j.access_token) throw new Error(`FCM auth gagal: ${j.error_description ?? res.status}`);
  fcmCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** Kirim satu pesan data FCM. "gone" = token sudah tidak berlaku (aplikasi dihapus / data dibersihkan). */
async function sendFcm(sa: ServiceAccount, token: string, msg: Message): Promise<"ok" | "gone" | "fail"> {
  const access = await fcmAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        // pesan data saja → selalu ditampilkan oleh PushService dengan kanal bunyi + getar CIKOPS
        data: { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag, urgent: msg.urgent ? "1" : "0", kind: msg.kind ?? "task" },
        android: { priority: "HIGH", ttl: "21600s" },
      },
    }),
  });
  if (res.ok) return "ok";
  const t = await res.text();
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(t)) return "gone";
  if (res.status === 400 && /INVALID_ARGUMENT/.test(t) && /token/i.test(t)) return "gone";
  console.warn("fcm gagal", res.status, t.slice(0, 300));
  return "fail";
}

async function sendAll(admin: ReturnType<typeof createClient>, subs: Sub[], msg: Message) {
  let sent = 0;
  const gone: string[] = [];
  const sa = serviceAccount();
  await Promise.all(subs.map(async (s) => {
    if (s.endpoint.startsWith("fcm:")) {
      if (!sa) { console.warn("FCM_SERVICE_ACCOUNT belum diset — notifikasi APK dilewati"); return; }
      try {
        const r = await sendFcm(sa, s.endpoint.slice(4), msg);
        if (r === "ok") sent++;
        else if (r === "gone") gone.push(s.endpoint);
      } catch (e) { console.warn("fcm error", (e as Error).message); }
      return;
    }
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...msg, icon: msg.app === "tga" ? "/icon-tga-192.png" : "/icon-192.png" }),
        { TTL: 60 * 60 * 6, urgency: "high", topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.endpoint);  // HP sudah tidak berlangganan
      else console.warn("push gagal", code, (e as Error).message);
    }
  }));
  if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
  return { sent, total: subs.length, removed: gone.length };
}

async function staffOf(admin: ReturnType<typeof createClient>, req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak tersedia." });
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let p: Record<string, unknown> = {};
    try { p = await req.json(); } catch { /* GET / body kosong */ }
    if (req.method === "GET" || p.action === "vapid-key") {
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ ok: false, error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum diset di secrets." });
      return json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── Tugas TGA baru / dialihkan ──
    if (p.event === "tga_task") {
      const id = String(p.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "id tidak valid" });
      const { data: a } = await admin.from("tga_activities")
        .select("id, ref_no, user_id, status, kategori, lokasi, activity, request_by, departemen, prioritas, assigned_at, notified_key")
        .eq("id", id).maybeSingle();
      if (!a || a.status !== "baru" || !a.assigned_at) return json({ ok: true, skipped: "bukan tugas baru" });
      if (Date.now() - new Date(a.assigned_at).getTime() > 15 * 60 * 1000) return json({ ok: true, skipped: "kedaluwarsa" });
      const key = `${a.user_id ?? "pool"}:${a.assigned_at}`;
      if (a.notified_key === key) return json({ ok: true, skipped: "sudah dikirim" });
      await admin.from("tga_activities").update({ notified_key: key }).eq("id", id);

      let q = admin.from("push_subscriptions").select("endpoint, p256dh, auth, tga_user_id").eq("app", "tga");
      q = a.user_id ? q.eq("tga_user_id", a.user_id) : q.not("tga_user_id", "is", null);
      const { data: subs } = await q;
      const urgent = a.prioritas === "urgent";
      const who = [a.request_by, a.departemen].filter(Boolean).join(" · ");
      const msg: Message = {
        app: "tga", urgent, url: "/tga", tag: `tga-${a.ref_no}`,
        title: `${urgent ? "🔥 URGENT · " : ""}${a.user_id ? "Tugas baru untukmu" : "Permintaan baru"} ${CAT_ICON[a.kategori] ?? "🔧"}`,
        body: `${a.activity}${a.lokasi ? `\n📍 ${a.lokasi}` : ""}${who ? `\n👤 ${who}` : ""}${a.user_id ? "" : "\nSiapa cepat — ambil di aplikasi."}`,
      };
      return json({ ok: true, ...(await sendAll(admin, (subs ?? []) as Sub[], msg)) });
    }

    // ── Pesan ke driver (dari dashboard) ──
    if (p.event === "driver") {
      const user = await staffOf(admin, req);
      if (!user) return json({ ok: false, error: "Tidak terautentikasi." });
      const { data: prof } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (!prof) return json({ ok: false, error: "Hanya staf yang boleh mengirim notifikasi driver." });
      const ids = (Array.isArray(p.driverIds) ? p.driverIds : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
      if (!ids.length) return json({ ok: false, error: "driverIds kosong." });
      const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("app", "driver").in("driver_id", ids);
      const msg: Message = {
        app: "driver", url: "/driver", tag: `driver-${Date.now()}`, urgent: p.kind !== "info", kind: p.kind === "info" ? "info" : "task",
        title: String(p.title ?? "Tugas baru").slice(0, 120), body: String(p.body ?? "").slice(0, 400),
      };
      return json({ ok: true, ...(await sendAll(admin, (subs ?? []) as Sub[], msg)) });
    }

    // ── Tes notifikasi ke HP sendiri ──
    if (p.event === "test") {
      let subs: Sub[] = [];
      let app: "tga" | "driver" = "tga";
      if (p.app === "tga") {
        const { data: ses } = await admin.from("tga_sessions").select("user_id").eq("token", String(p.token ?? "")).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (!ses) return json({ ok: false, error: "Sesi berakhir — silakan masuk lagi." });
        const { data } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("app", "tga").eq("tga_user_id", ses.user_id);
        subs = (data ?? []) as Sub[];
      } else {
        app = "driver";
        const user = await staffOf(admin, req);
        if (!user?.email) return json({ ok: false, error: "Tidak terautentikasi." });
        const { data: drv } = await admin.from("drivers").select("id").ilike("email", user.email.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(1).maybeSingle();
        if (!drv) return json({ ok: false, error: "Akun ini bukan driver." });
        const { data } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("app", "driver").eq("driver_id", drv.id);
        subs = (data ?? []) as Sub[];
      }
      if (!subs.length) return json({ ok: false, error: "HP ini belum terdaftar untuk notifikasi." });
      const msg: Message = {
        app, url: app === "tga" ? "/tga" : "/driver", tag: "tes", urgent: false,
        title: "🔔 Tes notifikasi berhasil", body: "Notifikasi aktif — kamu akan diberi tahu saat ada tugas baru.",
      };
      return json({ ok: true, ...(await sendAll(admin, subs, msg)) });
    }

    return json({ ok: false, error: "Permintaan tidak dikenal." });
  } catch (err) {
    console.error("send-web-push error:", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unexpected error" });
  }
});
