/* ════════════════════════════════════════════════════════════
   MOCK BACKEND — inti: penyimpanan, util tanggal, tipe bersama.
   Dipakai deployment "mockup" (NEXT_PUBLIC_MOCK_BACKEND=1): seluruh aplikasi
   CIKOPS berjalan TANPA Supabase. Data dummy dibuat di browser, disimpan di
   localStorage pengunjung, dan bisa di-reset kapan saja.
════════════════════════════════════════════════════════════ */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export type MockDB = Record<string, Row[]>;

export interface MockCtx {
  db: MockDB;
  /** id auth user yang sedang "login" (null = anonim) */
  userId: string | null;
  email: string | null;
  /** baris profiles milik user (null bila bukan staf) */
  profile: Row | null;
  save: () => void;
}
export type RpcHandler = (args: Row, ctx: MockCtx) => unknown;

/** Error yang meniru PostgrestError */
export class MockError extends Error {
  code: string;
  constructor(message: string, code = "P0001") { super(message); this.code = code; }
}
export const fail = (message: string, code?: string): never => { throw new MockError(message, code); };

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/* ── waktu (semua mengikuti WIB, seperti database asli) ── */
const WIB = 7 * 3600000;
export const nowIso = () => new Date().toISOString();
/** YYYY-MM-DD hari ini (WIB) */
export const todayWib = () => new Date(Date.now() + WIB).toISOString().slice(0, 10);
/** Geser tanggal YYYY-MM-DD sebanyak n hari */
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Tanggal + jam WIB → ISO (UTC) */
export const wibIso = (d: string, hhmm: string) => new Date(Date.parse(`${d}T${hhmm.length === 5 ? hhmm + ":00" : hhmm}Z`) - WIB).toISOString();
/** Jam sekarang WIB "HH:MM" */
export const nowHmWib = () => new Date(Date.now() + WIB).toISOString().slice(11, 16);
/** Tanggal WIB dari ISO timestamp */
export const wibDate = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) + WIB).toISOString().slice(0, 10) : null);
/** Jam WIB HH:MM dari ISO timestamp */
export const wibTime = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) + WIB).toISOString().slice(11, 16) : null);
export const isoDow = (d: string) => { const x = new Date(`${d}T00:00:00Z`).getUTCDay(); return x === 0 ? 7 : x; };
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;

/** PRNG berbiji (mulberry32) — data dummy konsisten */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── penyimpanan ── */
const KEY = "cikops_mock_db_v1";
let cache: MockDB | null = null;
let builder: (() => MockDB) | null = null;
export function setSeedBuilder(fn: () => MockDB) { builder = fn; }

export function getDb(): MockDB {
  if (cache) return cache;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { day: string; db: MockDB };
        // data dibuat ulang tiap hari baru supaya tanggal tetap "hari ini"
        if (parsed.day === todayWib()) { cache = parsed.db; return cache; }
      }
    } catch { /* storage diblokir / rusak → buat baru */ }
  }
  cache = builder ? builder() : {};
  saveDb();
  return cache;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveDb() {
  if (typeof window === "undefined" || !cache) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ day: todayWib(), db: cache })); } catch { /* penuh / privat */ }
  }, 150);
}
/** Kembalikan semua data ke kondisi awal demo */
export function resetDb() {
  try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
  cache = builder ? builder() : {};
  saveDb();
}
export const table = (db: MockDB, name: string) => (db[name] ??= []);
