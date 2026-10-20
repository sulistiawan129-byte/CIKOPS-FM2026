/* SECURITY — akses data (Supabase CIKOPS) + sinkron G-C lewat /api/gc-nc. */

import { supabase } from "../supabaseClient";
import { DEFAULT_KHUSUS, addMonthsKey, monthStart, normalizeData, type DriverNames, type GcCase, type SecData } from "./model";
import { sdHasData, sdToSecData, type SdReport } from "./secdesk";

const PLANT = "CIK";

export interface SecMonthRow { key: string; data: SecData; updatedAt: string | null }

export async function getSecurityMonth(key: string): Promise<SecMonthRow> {
  const [row, sd] = await Promise.all([getSecurityMonthLocal(key), fetchSecDesk(key, key)]);
  const r = sd.ok ? sd.months[key] : null;
  return sdHasData(r) ? { ...row, data: sdToSecData(key, r, row.data) } : row;
}

async function getSecurityMonthLocal(key: string): Promise<SecMonthRow> {
  const { data, error } = await supabase
    .from("security_monthly")
    .select("period, data, updated_at")
    .eq("plant", PLANT)
    .eq("period", monthStart(key))
    .maybeSingle();
  if (error) throw error;
  return { key, data: normalizeData(key, (data?.data as SecData) || null), updatedAt: (data?.updated_at as string) || null };
}

/** Semua bulan dalam rentang (kunci YYYY-MM), tanpa normalisasi — untuk report & riwayat. */
export async function getSecurityMonths(fromKey: string, toKey: string): Promise<Record<string, SecData>> {
  const { data, error } = await supabase
    .from("security_monthly")
    .select("period, data")
    .eq("plant", PLANT)
    .gte("period", monthStart(fromKey))
    .lte("period", monthStart(toKey));
  if (error) throw error;
  const out: Record<string, SecData> = {};
  (data || []).forEach((r) => { out[String(r.period).slice(0, 7)] = (r.data as SecData) || {}; });
  // bulan yang sudah diisi di Security Desk memakai angka Security Desk
  for (let k = fromKey; k <= toKey; k = addMonthsKey(k, 24)) {
    const end = addMonthsKey(k, 23) < toKey ? addMonthsKey(k, 23) : toKey;
    const sd = await fetchSecDesk(k, end);
    if (!sd.ok) break;
    for (const [mk, r] of Object.entries(sd.months)) if (sdHasData(r)) out[mk] = sdToSecData(mk, r, out[mk]);
  }
  return out;
}

export async function saveSecurityMonth(key: string, data: SecData): Promise<void> {
  const { error } = await supabase
    .from("security_monthly")
    .upsert({ plant: PLANT, period: monthStart(key), data }, { onConflict: "plant,period" });
  if (error) throw error;
}

/** Simpan hanya bagian "totals" (riwayat) tanpa menimpa data mingguan bulan tsb. */
export async function saveSecurityTotals(key: string, totals: SecData["totals"]): Promise<void> {
  const { data: row } = await supabase.from("security_monthly").select("data").eq("plant", PLANT).eq("period", monthStart(key)).maybeSingle();
  const cur = ((row?.data as SecData) || {}) as SecData;
  await saveSecurityMonth(key, { ...cur, totals });
}

export interface SecurityConfig { khusus: string[]; driverNames: DriverNames }

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const { data, error } = await supabase.from("security_config").select("key, value");
  if (error) throw error;
  const m = new Map((data || []).map((r) => [r.key as string, r.value]));
  const k = m.get("khusus_companies");
  return {
    khusus: Array.isArray(k) && k.length ? (k as string[]) : DEFAULT_KHUSUS,
    driverNames: (m.get("driver_names") as DriverNames) || {},
  };
}

export async function saveSecurityConfig(key: "khusus_companies" | "driver_names", value: unknown): Promise<void> {
  const { error } = await supabase.from("security_config").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

/* ── G-C ── */
export type GcResult =
  | { ok: true; cases: GcCase[]; fetchedAt: string; plant: string }
  | { ok: false; error: string; notConfigured?: boolean };

async function authHeader(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

const gcCache = new Map<string, { at: number; res: GcResult }>();

/** Kasus NC berstatus Accept dari G-C (hanya membaca). Cache 2 menit per rentang. */
export async function fetchGcCases(from: string, to: string, force = false): Promise<GcResult> {
  const ck = `${from}|${to}`;
  const hit = gcCache.get(ck);
  if (!force && hit && Date.now() - hit.at < 120_000) return hit.res;
  const h = await authHeader();
  if (!h) return { ok: false, error: "Sesi login tidak ditemukan" };
  try {
    const r = await fetch(`/api/gc-nc?from=${from}&to=${to}`, { headers: h, cache: "no-store" });
    const j = await r.json().catch(() => null);
    const res: GcResult = !r.ok || !j?.ok
      ? { ok: false, error: j?.error || `HTTP ${r.status}`, notConfigured: r.status === 503 }
      : { ok: true, cases: j.cases as GcCase[], fetchedAt: j.fetchedAt, plant: j.plant };
    if (res.ok) gcCache.set(ck, { at: Date.now(), res });
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface GcPing { ok: boolean; configured: boolean; mode?: string; plant?: string; latest?: string | null; total?: number; error?: string }
export async function pingGc(): Promise<GcPing> {
  const h = await authHeader();
  if (!h) return { ok: false, configured: false, error: "Sesi login tidak ditemukan" };
  try {
    const r = await fetch(`/api/gc-nc?ping=1`, { headers: h, cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, configured: r.status !== 503, error: `HTTP ${r.status}` };
    return { ok: !!j.ok, configured: r.status !== 503, mode: j.mode, plant: j.plant, latest: j.latest ?? null, total: j.total, error: j.error };
  } catch (e) {
    return { ok: false, configured: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Security Desk ── */
export type SdResult =
  | { ok: true; months: Record<string, SdReport>; fetchedAt: string; site?: string; sites?: { code: string; name: string; n: number }[] }
  | { ok: false; error: string; notConfigured?: boolean };

const sdCache = new Map<string, { at: number; res: SdResult }>();

/** Laporan Security Desk per bulan (YYYY-MM, maks 26 bulan). Cache 2 menit. Gagal = { ok:false }, tidak melempar. */
export async function fetchSecDesk(fromKey: string, toKey: string, force = false): Promise<SdResult> {
  const ck = `${fromKey}|${toKey}`;
  const hit = sdCache.get(ck);
  if (!force && hit && Date.now() - hit.at < 120_000) return hit.res;
  const h = await authHeader();
  if (!h) return { ok: false, error: "Sesi login tidak ditemukan" };
  try {
    const r = await fetch(`/api/gc-nc?sd=1&from=${fromKey}&to=${toKey}`, { headers: h, cache: "no-store" });
    const j = await r.json().catch(() => null);
    const res: SdResult = !r.ok || !j?.ok
      ? { ok: false, error: j?.error || `HTTP ${r.status}`, notConfigured: r.status === 503 }
      : { ok: true, months: j.months as Record<string, SdReport>, fetchedAt: j.fetchedAt, site: j.site, sites: j.sites };
    sdCache.set(ck, { at: Date.now(), res });
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
