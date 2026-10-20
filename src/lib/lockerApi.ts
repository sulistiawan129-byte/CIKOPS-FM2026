import { supabase } from "./supabaseClient";

/* ════════════════════════════════════════════════════════════
   LOCKER MODULE — API layer
   Kept as its own file (not merged into lib/api.ts) so nothing about
   the existing, already-working Fleet system changes. Mirrors the
   same call patterns already used throughout lib/api.ts (thin
   wrappers around supabase.from()/rpc(), throw on error, map rows to
   camelCase types).
════════════════════════════════════════════════════════════ */

export type LockerStatus = "Available" | "Terisi";

/** Full locker row, as used by the admin "Kelola Locker" CRUD table. */
export interface LockerRow {
  id: string;
  number: string;
  pin: string;
  prevPin: string;
  status: LockerStatus;
  nama: string;
  noHp: string;
  email: string;
  periode: string;
  extra: string;
  endDate: string; // yyyy-mm-dd or ""
  lastConfirmed: string; // yyyy-mm-dd or ""
}

interface LockerDbRow {
  id: string;
  number: string;
  pin: string;
  prev_pin: string | null;
  status: LockerStatus;
  nama: string | null;
  no_hp: string | null;
  email: string | null;
  periode: string | null;
  extra: string | null;
  end_date: string | null;
  last_confirmed: string | null;
}

function mapLockerRow(r: LockerDbRow): LockerRow {
  return {
    id: r.id,
    number: r.number,
    pin: r.pin,
    prevPin: r.prev_pin ?? "",
    status: r.status,
    nama: r.nama ?? "",
    noHp: r.no_hp ?? "",
    email: r.email ?? "",
    periode: r.periode ?? "",
    extra: r.extra ?? "",
    endDate: r.end_date ?? "",
    lastConfirmed: r.last_confirmed ?? "",
  };
}

/* ── Overview grid (admin dashboard "Overview" sub-tab) — lightweight,
   just enough to render the locker grid + used/available counts. ── */
export interface LockerStatusEntry {
  number: string;
  pin: string;
  status: LockerStatus;
}

export async function getLockerStatusGrid(): Promise<LockerStatusEntry[]> {
  const { data, error } = await supabase
    .from("lockers")
    .select("number, pin, status")
    .order("row_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LockerStatusEntry[];
}

/* ── Full CRUD list (admin "Kelola Locker" table) ── */
export async function getAllLockers(): Promise<LockerRow[]> {
  const { data, error } = await supabase
    .from("lockers")
    .select("id, number, pin, prev_pin, status, nama, no_hp, email, periode, extra, end_date, last_confirmed")
    .order("row_no", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as LockerDbRow[]) ?? []).map(mapLockerRow);
}

export interface LockerInput {
  number: string;
  pin?: string; // kosong = generate otomatis (server-side default handles it via generate_unique_locker_pin if you leave this unset)
  status: LockerStatus;
  nama?: string;
  noHp?: string;
  email?: string;
  periode?: string;
  extra?: string;
  endDate?: string; // yyyy-mm-dd
}

/** Menambah locker baru. Kalau `pin` kosong, generate PIN unik dulu
 *  lewat RPC yang sama dipakai server (generate_unique_locker_pin),
 *  supaya tidak ada dua locker dengan PIN sama. */
export async function addLocker(input: LockerInput): Promise<void> {
  let pin = input.pin?.trim();
  if (!pin) {
    const { data, error: pinErr } = await supabase.rpc("generate_unique_locker_pin");
    if (pinErr) throw new Error(pinErr.message);
    pin = data as string;
  }

  const isTerisi = input.status === "Terisi";
  const { error } = await supabase.from("lockers").insert({
    number: input.number.trim(),
    pin,
    status: input.status,
    nama: isTerisi ? input.nama || null : null,
    no_hp: isTerisi ? input.noHp || null : null,
    email: isTerisi ? input.email || null : null,
    periode: isTerisi ? input.periode || null : null,
    extra: isTerisi ? input.extra || null : null,
    end_date: input.endDate || null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error(`Nomor locker ${input.number} sudah ada.`);
    }
    throw new Error(error.message);
  }
}

export async function updateLocker(id: string, input: LockerInput): Promise<void> {
  const isTerisi = input.status === "Terisi";
  const payload: Record<string, unknown> = {
    number: input.number.trim(),
    status: input.status,
    nama: isTerisi ? input.nama || null : null,
    no_hp: isTerisi ? input.noHp || null : null,
    email: isTerisi ? input.email || null : null,
    periode: isTerisi ? input.periode || null : null,
    extra: isTerisi ? input.extra || null : null,
    end_date: input.endDate || null,
  };
  if (input.pin?.trim()) payload.pin = input.pin.trim();

  const { error } = await supabase.from("lockers").update(payload).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      throw new Error(`Nomor locker ${input.number} sudah dipakai locker lain.`);
    }
    throw new Error(error.message);
  }
}

export async function deleteLocker(id: string): Promise<void> {
  const { error } = await supabase.from("lockers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ── Search & report (admin) ── */
export async function searchLockerUser(keyword: string): Promise<LockerRow[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const { data, error } = await supabase
    .from("lockers")
    .select("id, number, pin, prev_pin, status, nama, no_hp, email, periode, extra, end_date, last_confirmed")
    .or(`number.eq.${kw},nama.ilike.%${kw}%`);
  if (error) throw new Error(error.message);
  return ((data as LockerDbRow[]) ?? []).map(mapLockerRow);
}

export async function getLockerReport(): Promise<LockerRow[]> {
  const { data, error } = await supabase
    .from("lockers")
    .select("id, number, pin, prev_pin, status, nama, no_hp, email, periode, extra, end_date, last_confirmed")
    .eq("status", "Terisi")
    .order("row_no", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as LockerDbRow[]) ?? []).map(mapLockerRow);
}

/* ── Register (public flow) ── */
export interface RegisterLockerResult {
  lockerNumber: string;
  pin: string;
  periode: string;
}

export async function registerLocker(input: {
  nama: string;
  noHp: string;
  email: string;
  periode: string;
  extra: string;
  tanggalSelesai?: string; // yyyy-mm-dd
}): Promise<RegisterLockerResult> {
  const { data, error } = await supabase.rpc("register_locker", {
    p_nama: input.nama,
    p_no_hp: input.noHp,
    p_email: input.email,
    p_periode: input.periode,
    p_extra: input.extra,
    p_tanggal_selesai: input.tanggalSelesai || null,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error("Semua locker sudah terisi!");
  return { lockerNumber: row.locker_number, pin: row.pin, periode: row.periode };
}

/* ── Release (both public self-service and admin) ── */
export interface ReleaseLockerResult {
  lockerNumber: string;
  nama: string;
  email: string;
  extra: string;
  periode: string;
  source: string;
  pin: string; // nilai aktual, tidak pernah berubah — hanya untuk referensi admin
}

function mapReleaseRow(row: {
  locker_number: string;
  nama: string | null;
  email: string | null;
  extra: string | null;
  periode: string | null;
  source: string;
  pin: string | null;
}): ReleaseLockerResult {
  return {
    lockerNumber: row.locker_number,
    nama: row.nama ?? "",
    email: row.email ?? "",
    extra: row.extra ?? "",
    periode: row.periode ?? "",
    source: row.source,
    pin: row.pin ?? "",
  };
}

export async function releaseLockerByUser(number: string, pin: string): Promise<ReleaseLockerResult> {
  const { data, error } = await supabase.rpc("release_locker_by_user", { p_number: number, p_pin: pin });
  if (error) throw new Error(error.message);
  return mapReleaseRow(data[0]);
}

export async function adminReleaseLocker(number: string): Promise<ReleaseLockerResult> {
  const { data, error } = await supabase.rpc("admin_release_locker", { p_number: number });
  if (error) throw new Error(error.message);
  return mapReleaseRow(data[0]);
}

/** Just a lookup, for the end-of-use verification screen (shows the
 *  user their own name/dept back after they've typed the right
 *  number+PIN, before asking them to confirm release). Uses a plain
 *  authenticated-only select for the admin side; the PUBLIC end-of-use
 *  flow instead calls releaseLockerByUser directly (which does its own
 *  PIN check server-side) — this helper is for the admin detail view. */
export async function getLockerDetailAdmin(number: string): Promise<LockerRow | null> {
  const { data, error } = await supabase
    .from("lockers")
    .select("id, number, pin, prev_pin, status, nama, no_hp, email, periode, extra, end_date, last_confirmed")
    .eq("number", number)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLockerRow(data as LockerDbRow) : null;
}

/* ── Bulk email confirmation (admin) ── */
export async function getConfirmationRecipientCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_confirmation_recipient_count");
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export interface BulkConfirmationRecipient {
  lockerNumber: string;
  email: string;
  nama: string;
  extra: string;
  periode: string;
  token: string;
}

export async function startBulkConfirmation(): Promise<BulkConfirmationRecipient[]> {
  const { data, error } = await supabase.rpc("start_bulk_confirmation");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    locker_number: string; email: string; nama: string; extra: string; periode: string; token: string;
  }>).map((r) => ({
    lockerNumber: r.locker_number,
    email: r.email,
    nama: r.nama,
    extra: r.extra,
    periode: r.periode,
    token: r.token,
  }));
}

/* ── Email confirmation link handler (public /locker/confirm page) ── */
export async function getLockerByConfirmToken(token: string): Promise<{ lockerNumber: string; nama: string } | null> {
  const { data, error } = await supabase.rpc("get_locker_by_confirm_token", { p_token: token });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return { lockerNumber: data[0].locker_number, nama: data[0].nama };
}

export interface ConfirmLockerAnswerResult extends ReleaseLockerResult {
  kept: boolean;
}

export async function confirmLockerAnswer(token: string, answer: "yes" | "no"): Promise<ConfirmLockerAnswerResult> {
  const { data, error } = await supabase.rpc("confirm_locker_answer", { p_token: token, p_answer: answer });
  if (error) throw new Error(error.message);
  const row = data[0];
  return { ...mapReleaseRow(row), kept: row.kept };
}

/* ── Email dispatch — invokes the send-locker-email Edge Function.
   Mirrors sendClaimNotificationEmails' "best-effort, never throws"
   pattern in lib/api.ts, so a failed/misconfigured email never blocks
   the underlying register/release action (which has already
   succeeded by the time this runs). ── */
export interface LockerEmailInput {
  kind: "register" | "release" | "confirm-request";
  toEmail?: string;
  lockerNumber: string;
  pin?: string;
  nama?: string;
  noHp?: string;
  extra?: string;
  periode?: string;
  source?: "user" | "admin" | "auto" | "user-confirm";
  token?: string;
  baseUrl?: string;
}

export async function sendLockerEmail(input: LockerEmailInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.functions.invoke("send-locker-email", { body: input });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email" };
  }
}

/** Base URL for confirmation links sent in bulk-confirmation emails —
 *  points at the public /locker/confirm page. Only works client-side
 *  (window.location), which is fine since bulk-send is only ever
 *  triggered from the authenticated dashboard in the browser. */
export function getConfirmBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/locker/confirm`;
}

/** Verifikasi nomor+PIN TANPA melepas locker — dipakai layar
 *  konfirmasi "Selesai Pakai Locker" (tampilkan nama/dept dulu sebelum
 *  user menekan tombol konfirmasi final). Release yang sesungguhnya
 *  tetap lewat releaseLockerByUser() di atas. */
export async function verifyLockerRelease(
  number: string,
  pin: string
): Promise<{ lockerNumber: string; nama: string; extra: string; periode: string }> {
  const { data, error } = await supabase.rpc("verify_locker_release", { p_number: number, p_pin: pin });
  if (error) throw new Error(error.message);
  const row = data[0];
  return { lockerNumber: row.locker_number, nama: row.nama ?? "", extra: row.extra ?? "", periode: row.periode ?? "" };
}
