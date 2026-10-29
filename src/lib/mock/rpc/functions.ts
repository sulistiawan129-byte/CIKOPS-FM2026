/* MOCK BACKEND — Edge Function tiruan (supabase.functions.invoke).
   Meniru bentuk balasan supabase/functions/* — email & push tidak benar-benar dikirim. */
import { nowIso, table, uuid, type MockCtx, type Row, type RpcHandler } from "../core";

const DEMO_PASSWORD = "Demo2026!";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLANT_OF: Record<string, string | null> = { admin_ga_cik: "CIK", admin_ga_prb: "PRB" };
const ALL_ROLES = ["master", "admin_ga_cik", "admin_ga_prb", "admin_iss", "admin_security", "receptionist", "management"];
const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/** staff_manageable_roles (02_peran_keamanan.sql) */
function manageableRoles(role: string): string[] {
  switch (role) {
    case "master": case "admin": return ALL_ROLES;
    case "admin_ga_cik": return ["admin_ga_cik", "receptionist"];
    case "admin_ga_prb": return ["admin_ga_prb"];
    case "admin_iss": return ["admin_iss"];
    case "admin_security": return ["admin_security"];
    default: return [];
  }
}

const isBanned = (u: Row | undefined) => !!u?.banned_until && Date.parse(u.banned_until) > Date.now();

function manageStaff(p: Row, ctx: MockCtx): Row {
  const { db } = ctx;
  if (!ctx.userId) return { ok: false, error: "Tidak terautentikasi." };
  const me = ctx.profile;
  if (!me) return { ok: false, error: "Akun ini bukan staf CIKOPS." };
  // akun master demo (is_master_admin) diperlakukan sebagai master
  const myRole = me.is_master_admin && !manageableRoles(String(me.role)).length ? "master" : String(me.role);
  const manageable = new Set(manageableRoles(myRole));
  if (!manageable.size) return { ok: false, error: "Role ini tidak bisa mengelola akun." };
  const isMaster = manageable.has("master");
  const users = table(db, "auth_users");
  const profiles = table(db, "profiles");
  const inTeam = (role: string) => manageable.has(role) || (isMaster && (role === "admin" || role === "ga"));

  const targetProfile = (id: unknown) => {
    if (typeof id !== "string" || !id) throw new Error("id akun tidak valid.");
    const prof = profiles.find((x) => x.id === id);
    if (!prof) throw new Error("Akun tidak ditemukan.");
    if (!inTeam(String(prof.role))) throw new Error("Akun ini di luar tim Anda.");
    return prof;
  };

  try {
    const action = String(p.action || "");

    if (action === "list") {
      const rows = profiles
        .filter((r) => inTeam(String(r.role)))
        .map((r) => {
          const u = users.find((x) => x.id === r.id);
          return {
            id: r.id, email: u?.email ?? "", fullName: r.full_name ?? "", role: r.role, plant: r.plant_scope ?? null,
            active: !isBanned(u), lastSignIn: u?.last_sign_in_at ?? null, createdAt: u?.created_at ?? null, self: r.id === me.id,
          };
        })
        .sort((a, b) => String(a.role).localeCompare(String(b.role)) || String(a.fullName).localeCompare(String(b.fullName)));
      return { ok: true, myRole: me.role, roles: [...manageable], rows };
    }

    if (action === "create") {
      const email = String(p.email ?? "").trim().toLowerCase();
      const fullName = String(p.fullName ?? "").trim().slice(0, 120);
      const role = String(p.role ?? "");
      let password = String(p.password ?? "");
      if (!EMAIL_RE.test(email)) return { ok: false, error: "Email tidak valid." };
      if (!fullName) return { ok: false, error: "Nama wajib diisi." };
      if (!manageable.has(role)) return { ok: false, error: "Role ini di luar tim Anda." };
      if (password && !strongEnough(password)) return { ok: false, error: "Password minimal 8 karakter, berisi huruf dan angka." };
      const generated = !password;
      if (generated) password = DEMO_PASSWORD;
      if (table(db, "drivers").some((d) => String(d.email ?? "").toLowerCase() === email)) {
        return { ok: false, error: "Email ini terdaftar sebagai driver. Pakai email lain untuk akun staf." };
      }
      const existing = users.find((u) => String(u.email ?? "").toLowerCase() === email);
      let id: string;
      if (existing) {
        const prof = profiles.find((x) => x.id === existing.id);
        if (prof && !inTeam(String(prof.role))) return { ok: false, error: "Email ini sudah dipakai akun lain di luar tim Anda." };
        existing.banned_until = null;
        id = existing.id;
      } else {
        id = uuid();
        users.push({ id, email, full_name: fullName, created_at: nowIso(), last_sign_in_at: null, banned_until: null, user_metadata: { full_name: fullName } });
      }
      const patch = { id, full_name: fullName, role, plant_scope: PLANT_OF[role] ?? null, is_master_admin: role === "master", allowed_tabs: null };
      const prof = profiles.find((x) => x.id === id);
      if (prof) Object.assign(prof, patch); else profiles.push({ ...patch, created_at: nowIso() });
      return { ok: true, id, email, password, generated, existed: !!existing };
    }

    if (action === "update") {
      const t = targetProfile(p.id);
      const patch: Row = {};
      if (typeof p.fullName === "string" && p.fullName.trim()) patch.full_name = p.fullName.trim().slice(0, 120);
      if (typeof p.role === "string" && p.role !== t.role) {
        if (t.id === me.id) return { ok: false, error: "Role akun sendiri tidak bisa diubah." };
        if (!manageable.has(p.role)) return { ok: false, error: "Role ini di luar tim Anda." };
        Object.assign(patch, { role: p.role, plant_scope: PLANT_OF[p.role] ?? null, is_master_admin: p.role === "master", allowed_tabs: null });
      }
      Object.assign(t, patch);
      if (patch.full_name) {
        const u = users.find((x) => x.id === t.id);
        if (u) u.full_name = patch.full_name;
      }
      return { ok: true };
    }

    if (action === "reset") {
      targetProfile(p.id);
      let password = String(p.password ?? "");
      if (password && !strongEnough(password)) return { ok: false, error: "Password minimal 8 karakter, berisi huruf dan angka." };
      const generated = !password;
      if (generated) password = DEMO_PASSWORD;
      return { ok: true, password, generated };
    }

    if (action === "active") {
      const t = targetProfile(p.id);
      if (t.id === me.id) return { ok: false, error: "Akun sendiri tidak bisa dinonaktifkan." };
      const u = users.find((x) => x.id === t.id);
      if (u) u.banned_until = p.active === true ? null : new Date(Date.now() + 876000 * 3600000).toISOString();
      return { ok: true };
    }

    return { ok: false, error: "Aksi tidak dikenal." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const sentOk = () => ({ ok: true, sent: 1, mock: true });

export const FUNCTIONS: Record<string, RpcHandler> = {
  "manage-staff-account": manageStaff,

  "send-driver-credentials": (p, { db }) => {
    const email = String(p.driverEmail ?? "").trim().toLowerCase();
    if (!email) return { ok: false, error: "Email driver kosong." };
    const drv = table(db, "drivers").find((d) => String(d.email ?? "").toLowerCase() === email);
    if (!drv) return { ok: false, error: "Driver dengan email ini tidak ditemukan." };
    if (drv.aktif === false) return { ok: false, error: "Driver ini nonaktif." };
    return { ok: true, created: false, tempPassword: DEMO_PASSWORD };
  },

  "send-web-push": (p) => {
    // Kunci VAPID tidak ada di mode demo → aktifkan notifikasi gagal dengan pesan jelas.
    if (p.action === "vapid-key") return { ok: false, error: "Notifikasi push tidak tersedia di mode demo." };
    return { ok: true, sent: 0, mock: true };
  },

  "send-claim-email": sentOk,
  "send-gift-passcode": sentOk,
  "send-locker-email": sentOk,
  "send-receptionist-email": sentOk,
  "send-task-email": sentOk,
};
