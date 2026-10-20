/* RECEPTIONIST — akses data (migrasi 031) + email (Edge Function send-receptionist-email). */

import { supabase } from "../supabaseClient";
import {
  DEFAULT_SETTINGS, type Contact, type ImportRow, type Parcel, type ParcelDirection, type RcpSettings, type RoomBooking,
  type WifiAccount, type WifiGrant, type WifiGrantResult, type WifiSuggestion,
} from "./model";

const MIGRATION_MSG = "Modul Receptionist belum aktif — jalankan supabase/031_receptionist.sql di Supabase SQL Editor.";
function friendly(error: { code?: string; message?: string } | null): Error {
  if (!error) return new Error("Terjadi kesalahan");
  if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || /Could not find the (function|table)|does not exist/i.test(error.message ?? "")) {
    return new Error(MIGRATION_MSG);
  }
  return new Error(error.message ?? String(error));
}
const hm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

/* ── Pengaturan ── */
export async function getRcpSettings(): Promise<RcpSettings> {
  const { data, error } = await supabase.from("rcp_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw friendly(error);
  if (!data) return DEFAULT_SETTINGS;
  return { openTime: hm(data.open_time), closeTime: hm(data.close_time), slotMinutes: data.slot_minutes, roomName: data.room_name, wifiSsid: data.wifi_ssid ?? "", wifiTerms: data.wifi_terms ?? "" };
}
export async function saveRcpSettings(s: RcpSettings): Promise<void> {
  const { error } = await supabase.from("rcp_settings").upsert({
    id: 1, open_time: s.openTime, close_time: s.closeTime, slot_minutes: s.slotMinutes, room_name: s.roomName.trim() || "Induction Room",
    wifi_ssid: s.wifiSsid.trim(), wifi_terms: s.wifiTerms, updated_at: new Date().toISOString(),
  });
  if (error) throw friendly(error);
}

/* ── Buku alamat ── */
export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase.from("rcp_contacts").select("name, email, department, use_count").order("use_count", { ascending: false }).limit(2000);
  if (error) throw friendly(error);
  return (data ?? []).map((r) => ({ name: r.name, email: r.email, department: r.department ?? "", useCount: r.use_count ?? 0 }));
}

/* ── Wifi ── */
interface AccountRow {
  id: string; username: string; password: string; valid_from: string; valid_until: string; slots: number; used: number; free: number;
  days_left: number; duration_days: number; status: WifiAccount["status"]; batch: string; notes: string; active: boolean; created_at: string;
}
export async function getWifiAccounts(): Promise<WifiAccount[]> {
  const { data, error } = await supabase.rpc("rcp_wifi_accounts_status");
  if (error) throw friendly(error);
  return ((data ?? []) as AccountRow[]).map((r) => ({
    id: r.id, username: r.username, password: r.password, validFrom: r.valid_from, validUntil: r.valid_until, slots: r.slots,
    used: r.used, free: r.free, daysLeft: r.days_left, durationDays: r.duration_days, status: r.status, batch: r.batch ?? "",
    notes: r.notes ?? "", active: r.active, createdAt: r.created_at,
  }));
}
export async function suggestWifi(endDate: string, slots: number): Promise<WifiSuggestion[]> {
  const { data, error } = await supabase.rpc("rcp_wifi_suggest", { p_end: endDate, p_slots: slots });
  if (error) throw friendly(error);
  return ((data ?? []) as { id: string; username: string; valid_until: string; free: number; days_left: number; duration_days: number }[])
    .map((r) => ({ id: r.id, username: r.username, validUntil: r.valid_until, free: r.free, daysLeft: r.days_left, durationDays: r.duration_days }));
}
export async function importWifiAccounts(rows: ImportRow[]): Promise<{ created: number; updated: number }> {
  const payload = rows.filter((r) => !r.error).map((r) => ({ username: r.username, password: r.password, valid_from: r.validFrom, valid_until: r.validUntil, slots: r.slots, batch: r.batch }));
  const { data, error } = await supabase.rpc("rcp_wifi_import", { p_rows: payload });
  if (error) throw friendly(error);
  return data as { created: number; updated: number };
}
export async function setWifiAccountActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("rcp_wifi_accounts").update({ active }).eq("id", id);
  if (error) throw friendly(error);
}
export async function deleteWifiAccount(id: string): Promise<void> {
  const { error } = await supabase.from("rcp_wifi_accounts").delete().eq("id", id);
  if (error) throw new Error(error.code === "23503" ? "Akun sudah pernah dipakai — nonaktifkan saja (riwayat tanda terima tetap tersimpan)." : friendly(error).message);
}

interface GrantRow {
  id: string; receipt_no: string; account_id: string; slots: number; guest_name: string; guest_company: string; requestor_name: string;
  requestor_email: string; department: string; line_manager: string; purpose: string; start_date: string; end_date: string;
  returned_at: string | null; return_note: string; email_sent_at: string | null; created_by: string; created_at: string;
  rcp_wifi_accounts?: { username: string; password: string } | null;
}
export async function getWifiGrants(sinceISO?: string): Promise<WifiGrant[]> {
  let q = supabase.from("rcp_wifi_grants").select("*, rcp_wifi_accounts(username, password)").order("created_at", { ascending: false }).limit(3000);
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { data, error } = await q;
  if (error) throw friendly(error);
  return ((data ?? []) as GrantRow[]).map((r) => ({
    id: r.id, receiptNo: r.receipt_no, accountId: r.account_id, username: r.rcp_wifi_accounts?.username ?? "-", password: r.rcp_wifi_accounts?.password ?? "",
    slots: r.slots, guestName: r.guest_name, guestCompany: r.guest_company ?? "", requestorName: r.requestor_name, requestorEmail: r.requestor_email ?? "",
    department: r.department ?? "", lineManager: r.line_manager ?? "", purpose: r.purpose ?? "", startDate: r.start_date, endDate: r.end_date,
    returnedAt: r.returned_at, returnNote: r.return_note ?? "", emailSentAt: r.email_sent_at, createdBy: r.created_by ?? "", createdAt: r.created_at,
  }));
}
export interface WifiGrantInput {
  accountId: string; slots: number; guestName: string; guestCompany: string; requestorName: string; requestorEmail: string;
  department: string; lineManager: string; purpose: string; startDate: string; endDate: string;
}
export async function grantWifi(i: WifiGrantInput): Promise<WifiGrantResult> {
  const { data, error } = await supabase.rpc("rcp_wifi_grant", {
    p_account_id: i.accountId, p_slots: i.slots, p_guest_name: i.guestName, p_guest_company: i.guestCompany,
    p_requestor_name: i.requestorName, p_requestor_email: i.requestorEmail, p_department: i.department, p_line_manager: i.lineManager,
    p_purpose: i.purpose, p_start: i.startDate, p_end: i.endDate,
  });
  if (error) throw friendly(error);
  const r = data as { id: string; receipt_no: string; username: string; password: string; start_date: string; end_date: string; account_valid_until: string };
  return { id: r.id, receiptNo: r.receipt_no, username: r.username, password: r.password, startDate: r.start_date, endDate: r.end_date, accountValidUntil: r.account_valid_until };
}
export async function returnWifi(grantId: string, note = ""): Promise<void> {
  const { error } = await supabase.rpc("rcp_wifi_return", { p_grant_id: grantId, p_note: note });
  if (error) throw friendly(error);
}

/* ── Email (best-effort: kegagalan email tidak membatalkan transaksi) ── */
type EmailPayload = Record<string, unknown> & { kind: "wifi-receipt" | "parcel-arrived" | "parcel-handed"; toEmail: string; receiptNo: string };
async function sendEmail(p: EmailPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-receptionist-email", { body: p });
  if (error) throw new Error(`Email gagal dikirim: ${error.message}. Pastikan fungsi send-receptionist-email sudah di-deploy.`);
  if (data && (data as { error?: string }).error) throw new Error(`Email gagal dikirim: ${(data as { error: string }).error}`);
}
export async function emailWifiReceipt(g: { id: string; receiptNo: string; toEmail: string; requestorName: string; guestName: string; guestCompany: string; username: string; password: string; slots: number; startDate: string; endDate: string }, s: RcpSettings): Promise<void> {
  await sendEmail({ kind: "wifi-receipt", toEmail: g.toEmail, receiptNo: g.receiptNo, requestorName: g.requestorName, guestName: g.guestName, guestCompany: g.guestCompany, username: g.username, password: g.password, slots: g.slots, startDate: g.startDate, endDate: g.endDate, terms: s.wifiTerms, ssid: s.wifiSsid });
  await supabase.from("rcp_wifi_grants").update({ email_sent_at: new Date().toISOString() }).eq("id", g.id);
}
export async function emailParcel(kind: "parcel-arrived" | "parcel-handed", p: Parcel): Promise<void> {
  if (!p.email) return;
  await sendEmail({ kind, toEmail: p.email, receiptNo: p.receiptNo, direction: p.direction, itemType: p.itemType, description: p.description, sender: p.sender, recipient: p.recipient, handedTo: p.handedTo, handedAt: p.handedAt ?? undefined });
  if (kind === "parcel-arrived") await supabase.from("rcp_parcels").update({ notified_at: new Date().toISOString() }).eq("id", p.id);
}

/* ── Barang & Surat ── */
interface ParcelRow {
  id: string; receipt_no: string; direction: ParcelDirection; item_type: string; description: string; sender: string; recipient: string;
  department: string; email: string; courier: string; status: "waiting" | "handed"; handed_to: string; handed_at: string | null; handed_by: string;
  notified_at: string | null; created_by: string; created_at: string;
}
const mapParcel = (r: ParcelRow): Parcel => ({
  id: r.id, receiptNo: r.receipt_no, direction: r.direction, itemType: r.item_type, description: r.description ?? "", sender: r.sender ?? "",
  recipient: r.recipient ?? "", department: r.department ?? "", email: r.email ?? "", courier: r.courier ?? "", status: r.status,
  handedTo: r.handed_to ?? "", handedAt: r.handed_at, handedBy: r.handed_by ?? "", notifiedAt: r.notified_at, createdBy: r.created_by ?? "", createdAt: r.created_at,
});
/** Semua yang masih menunggu + riwayat sejak `sinceISO`. */
export async function getParcels(sinceISO: string): Promise<Parcel[]> {
  const { data, error } = await supabase.from("rcp_parcels").select("*").or(`status.eq.waiting,created_at.gte.${sinceISO}`).order("created_at", { ascending: false }).limit(3000);
  if (error) throw friendly(error);
  return ((data ?? []) as ParcelRow[]).map(mapParcel);
}
export interface ParcelInput { direction: ParcelDirection; itemType: string; description: string; sender: string; recipient: string; department: string; email: string; courier: string }
export async function createParcel(i: ParcelInput): Promise<Parcel> {
  const { data, error } = await supabase.rpc("rcp_parcel_create", {
    p_direction: i.direction, p_item_type: i.itemType, p_description: i.description, p_sender: i.sender, p_recipient: i.recipient,
    p_department: i.department, p_email: i.email, p_courier: i.courier,
  });
  if (error) throw friendly(error);
  const id = (data as { id: string }).id;
  const { data: row, error: e2 } = await supabase.from("rcp_parcels").select("*").eq("id", id).single();
  if (e2) throw friendly(e2);
  return mapParcel(row as ParcelRow);
}
export async function handoverParcel(id: string, handedTo: string): Promise<Parcel> {
  const { error } = await supabase.rpc("rcp_parcel_handover", { p_id: id, p_handed_to: handedTo });
  if (error) throw friendly(error);
  const { data, error: e2 } = await supabase.from("rcp_parcels").select("*").eq("id", id).single();
  if (e2) throw friendly(e2);
  return mapParcel(data as ParcelRow);
}
export async function deleteParcel(id: string): Promise<void> {
  const { error } = await supabase.from("rcp_parcels").delete().eq("id", id);
  if (error) throw friendly(error);
}

/* ── Induction Room ── */
interface BookingRow {
  id: string; room: string; booking_date: string; start_time: string; end_time: string; title: string; pic_name: string; department: string;
  attendees: number | null; notes: string; series_id: string | null; created_by: string; created_at: string;
}
const mapBooking = (r: BookingRow): RoomBooking => ({
  id: r.id, room: r.room, date: r.booking_date, start: hm(r.start_time), end: hm(r.end_time), title: r.title, pic: r.pic_name ?? "",
  department: r.department ?? "", attendees: r.attendees, notes: r.notes ?? "", seriesId: r.series_id, createdBy: r.created_by ?? "", createdAt: r.created_at,
});
export async function getBookings(from: string, to: string): Promise<RoomBooking[]> {
  const { data, error } = await supabase.from("rcp_room_bookings").select("*").gte("booking_date", from).lte("booking_date", to).order("booking_date").order("start_time");
  if (error) throw friendly(error);
  return ((data ?? []) as BookingRow[]).map(mapBooking);
}
export interface BookingInput { slots: { date: string; start: string; end: string }[]; title: string; pic: string; department: string; attendees: number | null; notes: string; skipConflicts: boolean }
export async function bookRoom(i: BookingInput): Promise<{ created: number; skipped: { date: string; reason: string }[] }> {
  const { data, error } = await supabase.rpc("rcp_room_book", {
    p_rows: i.slots.map((x) => ({ date: x.date, start: x.start, end: x.end })), p_title: i.title, p_pic: i.pic, p_department: i.department,
    p_attendees: i.attendees, p_notes: i.notes, p_skip_conflicts: i.skipConflicts,
  });
  if (error) throw friendly(error);
  return data as { created: number; skipped: { date: string; reason: string }[] };
}
export async function updateBooking(id: string, b: { date: string; start: string; end: string; title: string; pic: string; department: string; attendees: number | null; notes: string }): Promise<void> {
  const { error } = await supabase.from("rcp_room_bookings").update({
    booking_date: b.date, start_time: b.start, end_time: b.end, title: b.title.trim(), pic_name: b.pic.trim(), department: b.department.trim(), attendees: b.attendees, notes: b.notes.trim(),
  }).eq("id", id);
  if (error) throw friendly(error);
}
export async function deleteBooking(id: string, wholeSeries?: string | null, fromDate?: string): Promise<void> {
  let q = supabase.from("rcp_room_bookings").delete();
  q = wholeSeries ? q.eq("series_id", wholeSeries).gte("booking_date", fromDate ?? "0000-01-01") : q.eq("id", id);
  const { error } = await q;
  if (error) throw friendly(error);
}
