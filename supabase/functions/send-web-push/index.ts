// send-web-push — notifikasi Web Push untuk aplikasi Driver & TGA (PWA / APK GitHub).
// Berbunyi & bergetar walau aplikasi tertutup. Langganan HP ada di tabel push_subscriptions (036).
//
// Deploy : supabase functions deploy send-web-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mis. mailto:ga@perusahaan.com)
//          → buat sekali: npx web-push generate-vapid-keys
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Sub { endpoint: string; p256dh: string; auth: string }
interface Message { title: string; body: string; url: string; tag: string; app: "driver" | "tga"; urgent?: boolean }

const CAT_ICON: Record<string, string> = { Listrik: "⚡", AC: "❄️", Plumbing: "🚰", Furniture: "🪑", Sipil: "🧱", Lainnya: "🔧" };

async function sendAll(admin: ReturnType<typeof createClient>, subs: Sub[], msg: Message) {
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(subs.map(async (s) => {
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
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ ok: false, error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum diset di secrets." });
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak tersedia." });
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let p: Record<string, unknown> = {};
    try { p = await req.json(); } catch { /* GET / body kosong */ }
    if (req.method === "GET" || p.action === "vapid-key") return json({ ok: true, publicKey: VAPID_PUBLIC_KEY });

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
        app: "driver", url: "/driver", tag: `driver-${Date.now()}`, urgent: true,
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
        app, url: app === "tga" ? "/tga" : "/driver", tag: "tes", urgent: true,
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
