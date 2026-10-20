import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
//  manage-staff-account — menu Akun & Role di dashboard CIKOPS
//
//  Setiap admin mengelola akun TIMNYA sendiri (lihat SQL 02_peran_keamanan bagian 039,
//  fungsi staff_manageable_roles):
//    master        → semua role
//    admin_ga_cik  → admin_ga_cik, receptionist
//    admin_ga_prb  → admin_ga_prb
//    admin_iss     → admin_iss
//    admin_security→ admin_security
//
//  Aksi (POST JSON { action, ... }):
//    list                               daftar akun yang boleh dikelola
//    create  { email, fullName, role, password? }
//    update  { id, fullName?, role? }
//    reset   { id, password? }          password baru (acak bila kosong)
//    active  { id, active }             nonaktifkan / aktifkan login
//
//  Selalu balas HTTP 200 { ok, error?, ... } supaya client gampang membaca.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLANT_OF: Record<string, string | null> = { admin_ga_cik: "CIK", admin_ga_prb: "PRB" };

function json(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Password sementara 10 karakter tanpa huruf/angka yang mirip (0/O, 1/l/I). */
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak tersedia." });
    let p: Record<string, unknown>;
    try { p = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body." }); }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── Pemanggil & role yang boleh dikelolanya ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) return json({ ok: false, error: "Tidak terautentikasi." });
    const { data: me } = await admin.from("profiles").select("id, role").eq("id", caller.user.id).maybeSingle();
    if (!me) return json({ ok: false, error: "Akun ini bukan staf CIKOPS." });
    const { data: mr, error: mrErr } = await admin.rpc("staff_manageable_roles", { p_role: me.role });
    if (mrErr) return json({ ok: false, error: `SQL 02_peran_keamanan.sql (bagian 039) belum dijalankan (${mrErr.message}).` });
    const manageable = new Set<string>((mr as string[] | null) ?? []);
    if (manageable.size === 0) return json({ ok: false, error: "Role ini tidak bisa mengelola akun." });
    const isMaster = manageable.has("master");

    // semua akun auth (jumlah kecil — cukup 1 halaman besar)
    async function allUsers() {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error(`Gagal membaca daftar akun: ${error.message}`);
      return data.users;
    }
    async function targetProfile(id: unknown) {
      if (typeof id !== "string" || !id) throw new Error("id akun tidak valid.");
      const { data } = await admin.from("profiles").select("id, role, full_name").eq("id", id).maybeSingle();
      if (!data) throw new Error("Akun tidak ditemukan.");
      // Master boleh juga merapikan akun role lama (admin / ga)
      if (!manageable.has(data.role) && !(isMaster && (data.role === "admin" || data.role === "ga"))) {
        throw new Error("Akun ini di luar tim Anda.");
      }
      return data as { id: string; role: string; full_name: string | null };
    }

    const action = String(p.action || "");

    if (action === "list") {
      const [users, { data: profs, error }] = await Promise.all([
        allUsers(),
        admin.from("profiles").select("id, full_name, role, plant_scope"),
      ]);
      if (error) return json({ ok: false, error: error.message });
      const byId = new Map(users.map((u) => [u.id, u]));
      const now = Date.now();
      const rows = (profs ?? [])
        .filter((r) => manageable.has(r.role) || (isMaster && (r.role === "admin" || r.role === "ga")))
        .map((r) => {
          const u = byId.get(r.id);
          const banned = !!u?.banned_until && Date.parse(u.banned_until) > now;
          return {
            id: r.id, email: u?.email ?? "", fullName: r.full_name ?? "", role: r.role, plant: r.plant_scope ?? null,
            active: !banned, lastSignIn: u?.last_sign_in_at ?? null, createdAt: u?.created_at ?? null, self: r.id === me.id,
          };
        })
        .sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName));
      return json({ ok: true, myRole: me.role, roles: [...manageable], rows });
    }

    if (action === "create") {
      const email = String(p.email ?? "").trim().toLowerCase();
      const fullName = String(p.fullName ?? "").trim().slice(0, 120);
      const role = String(p.role ?? "");
      let password = String(p.password ?? "");
      if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Email tidak valid." });
      if (!fullName) return json({ ok: false, error: "Nama wajib diisi." });
      if (!manageable.has(role)) return json({ ok: false, error: "Role ini di luar tim Anda." });
      if (password && !strongEnough(password)) return json({ ok: false, error: "Password minimal 8 karakter, berisi huruf dan angka." });
      const generated = !password;
      if (generated) password = tempPassword();

      // Email driver tidak boleh dijadikan akun staf
      const { data: drv } = await admin.from("drivers").select("id").ilike("email", email.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(1);
      if (drv && drv.length) return json({ ok: false, error: "Email ini terdaftar sebagai driver. Pakai email lain untuk akun staf." });

      const existing = (await allUsers()).find((u) => (u.email ?? "").toLowerCase() === email);
      let id: string;
      if (existing) {
        const { data: prof } = await admin.from("profiles").select("role").eq("id", existing.id).maybeSingle();
        // Akun auth yang sudah ada (mis. dari aplikasi lain) boleh dipakai bila belum punya role di luar tim
        if (prof && !manageable.has(prof.role) && !(isMaster && (prof.role === "admin" || prof.role === "ga"))) {
          return json({ ok: false, error: "Email ini sudah dipakai akun lain di luar tim Anda." });
        }
        const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, ban_duration: "none" });
        if (error) return json({ ok: false, error: `Gagal memperbarui akun: ${error.message}` });
        id = existing.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
        if (error || !data.user) return json({ ok: false, error: `Gagal membuat akun: ${error?.message ?? "tanpa data"}` });
        id = data.user.id;
      }
      const { error: upErr } = await admin.from("profiles").upsert(
        { id, full_name: fullName, role, plant_scope: PLANT_OF[role] ?? null, is_master_admin: role === "master", allowed_tabs: null },
        { onConflict: "id" },
      );
      if (upErr) return json({ ok: false, error: `Akun dibuat, tetapi gagal menyimpan role: ${upErr.message}` });
      return json({ ok: true, id, email, password, generated, existed: !!existing });
    }

    if (action === "update") {
      const t = await targetProfile(p.id);
      const patch: Record<string, unknown> = {};
      if (typeof p.fullName === "string" && p.fullName.trim()) patch.full_name = p.fullName.trim().slice(0, 120);
      if (typeof p.role === "string" && p.role !== t.role) {
        if (t.id === me.id) return json({ ok: false, error: "Role akun sendiri tidak bisa diubah." });
        if (!manageable.has(p.role)) return json({ ok: false, error: "Role ini di luar tim Anda." });
        Object.assign(patch, { role: p.role, plant_scope: PLANT_OF[p.role] ?? null, is_master_admin: p.role === "master", allowed_tabs: null });
      }
      if (!Object.keys(patch).length) return json({ ok: true });
      const { error } = await admin.from("profiles").update(patch).eq("id", t.id);
      return error ? json({ ok: false, error: error.message }) : json({ ok: true });
    }

    if (action === "reset") {
      const t = await targetProfile(p.id);
      let password = String(p.password ?? "");
      if (password && !strongEnough(password)) return json({ ok: false, error: "Password minimal 8 karakter, berisi huruf dan angka." });
      const generated = !password;
      if (generated) password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(t.id, { password });
      return error ? json({ ok: false, error: error.message }) : json({ ok: true, password, generated });
    }

    if (action === "active") {
      const t = await targetProfile(p.id);
      if (t.id === me.id) return json({ ok: false, error: "Akun sendiri tidak bisa dinonaktifkan." });
      const on = p.active === true;
      const { error } = await admin.auth.admin.updateUserById(t.id, { ban_duration: on ? "none" : "876000h" });
      return error ? json({ ok: false, error: error.message }) : json({ ok: true });
    }

    return json({ ok: false, error: "Aksi tidak dikenal." });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
