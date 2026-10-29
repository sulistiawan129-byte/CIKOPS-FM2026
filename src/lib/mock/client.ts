/* MOCK BACKEND — pengganti objek `supabase` (createClient) untuk deployment mockup.
   Tanpa login: dashboard otomatis masuk sebagai Master Admin, aplikasi driver sebagai
   driver demo. Ganti role lewat bar demo (MockBar) atau panel "Coba akun demo". */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb, MockError, saveDb, setSeedBuilder, table, type MockCtx, type Row } from "./core";
import { MockQuery } from "./query";
import { RPC } from "./rpc";
import { FUNCTIONS } from "./rpc/functions";
import { buildSeed } from "./seed";

setSeedBuilder(buildSeed);

type Slot = "dashboard" | "driver";
const AUTH_KEY = "cikops_mock_auth_v1";
const slotOf = (): Slot => (typeof window !== "undefined" && window.location.pathname.startsWith("/driver") ? "driver" : "dashboard");

function readAuth(): Record<Slot, string | null> {
  const db = getDb();
  const users = table(db, "auth_users");
  const def = {
    dashboard: users.find((u) => u.email === "master@demo.cikops.id")?.id ?? null,
    driver: users.find((u) => u.email === "driver.andi@demo.cikops.id")?.id ?? null,
  };
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(AUTH_KEY) : null;
    if (raw) {
      const v = JSON.parse(raw) as Record<Slot, string | null>;
      // id user ikut berubah saat data dibuat ulang → cocokkan lagi
      return {
        dashboard: v.dashboard === null ? null : users.some((u) => u.id === v.dashboard) ? v.dashboard : def.dashboard,
        driver: v.driver === null ? null : users.some((u) => u.id === v.driver) ? v.driver : def.driver,
      };
    }
  } catch { /* abaikan */ }
  return def;
}
function writeAuth(a: Record<Slot, string | null>) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch { /* abaikan */ }
}

function sessionFor(userId: string | null) {
  if (!userId) return null;
  const u = table(getDb(), "auth_users").find((x) => x.id === userId);
  if (!u) return null;
  const user = {
    id: u.id, email: u.email, aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "email" }, user_metadata: { full_name: u.full_name, ...(u.user_metadata ?? {}) },
    created_at: u.created_at, last_sign_in_at: new Date().toISOString(),
  };
  return { access_token: `mock-${u.id}`, refresh_token: "mock", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user };
}

export function currentCtx(): MockCtx {
  const db = getDb();
  const userId = readAuth()[slotOf()];
  const u = userId ? table(db, "auth_users").find((x) => x.id === userId) : null;
  return {
    db, userId: u?.id ?? null, email: u?.email ?? null,
    profile: u ? table(db, "profiles").find((p) => p.id === u.id) ?? null : null,
    save: saveDb,
  };
}

type Listener = (event: string, session: any) => void;
const listeners = new Set<Listener>();
const emit = (event: string) => { const s = sessionFor(readAuth()[slotOf()]); listeners.forEach((l) => l(event, s)); };

const wrap = (fn: () => any) => {
  try { return Promise.resolve(fn()).then((data) => ({ data, error: null })); }
  catch (e) { return Promise.resolve({ data: null, error: { message: (e as Error).message, code: (e as MockError).code ?? "XX000" } }); }
};

/** Ganti "akun" yang sedang dipakai (bar demo / panel akun demo). */
export function mockSignInAs(email: string): boolean {
  const u = table(getDb(), "auth_users").find((x) => String(x.email).toLowerCase() === email.trim().toLowerCase());
  if (!u) return false;
  const a = readAuth();
  const isDriver = table(getDb(), "drivers").some((d) => String(d.email ?? "").toLowerCase() === String(u.email).toLowerCase());
  a[isDriver ? "driver" : "dashboard"] = u.id;
  writeAuth(a);
  emit("SIGNED_IN");
  return true;
}
export const mockCurrentEmail = () => currentCtx().email;

class Channel {
  on() { return this; }
  subscribe(cb?: (s: string) => void) { setTimeout(() => cb?.("SUBSCRIBED"), 0); return this; }
  unsubscribe() { return Promise.resolve("ok"); }
  send() { return Promise.resolve("ok"); }
}

export function createMockClient(): any {
  const client: any = {
    from(name: string) { return new MockQuery(getDb(), name, saveDb); },
    schema() { return client; },
    rpc(fn: string, args: Row = {}) {
      const h = RPC[fn];
      const run = () => {
        if (!h) { console.warn(`[mock] RPC ${fn} belum ada di mockup`); return null; }
        const ctx = currentCtx();
        const r = h(args ?? {}, ctx);
        ctx.save();
        return r;
      };
      // objek thenable + .single()/.maybeSingle() seperti supabase-js
      const p: any = new Promise((resolve) => setTimeout(() => resolve(wrap(run)), 40)).then((x) => x);
      p.single = () => p; p.maybeSingle = () => p; p.select = () => p;
      return p;
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: sessionFor(readAuth()[slotOf()]) }, error: null }),
      getUser: () => { const s = sessionFor(readAuth()[slotOf()]); return Promise.resolve({ data: { user: s?.user ?? null }, error: s ? null : { message: "Auth session missing" } }); },
      onAuthStateChange(cb: Listener) {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithPassword({ email }: { email: string; password: string }) {
        const ok = mockSignInAs(email);
        if (!ok) return Promise.resolve({ data: { user: null, session: null }, error: { message: "Invalid login credentials", status: 400 } });
        const s = sessionFor(readAuth()[slotOf()]) ?? sessionFor(table(getDb(), "auth_users").find((u) => u.email === email.toLowerCase())?.id ?? null);
        return Promise.resolve({ data: { user: s?.user ?? null, session: s }, error: null });
      },
      signOut() { const a = readAuth(); a[slotOf()] = null; writeAuth(a); emit("SIGNED_OUT"); return Promise.resolve({ error: null }); },
      updateUser(attrs: { data?: Row }) {
        const ctx = currentCtx();
        const u = table(ctx.db, "auth_users").find((x) => x.id === ctx.userId);
        if (u && attrs?.data) { u.user_metadata = { ...(u.user_metadata ?? {}), ...attrs.data }; saveDb(); }
        const s = sessionFor(ctx.userId);
        emit("USER_UPDATED");
        return Promise.resolve({ data: { user: s?.user ?? null }, error: null });
      },
      refreshSession: () => Promise.resolve({ data: { session: sessionFor(readAuth()[slotOf()]) }, error: null }),
    },
    functions: {
      invoke(name: string, opts?: { body?: Row }) {
        const h = FUNCTIONS[name];
        return wrap(() => {
          if (!h) return { ok: true, mock: true };
          const ctx = currentCtx();
          const r = h(opts?.body ?? {}, ctx);
          ctx.save();
          return r;
        });
      },
    },
    channel: () => new Channel(),
    removeChannel: () => Promise.resolve("ok"),
    removeAllChannels: () => Promise.resolve([]),
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
  return client;
}
