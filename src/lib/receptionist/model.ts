/* RECEPTIONIST — tipe data & logika murni (Wifi Guest, Barang & Surat, Induction Room).
   Aturan slot/berlaku/bentrok ditegakkan di database (supabase/01_dasar.sql (bagian 031));
   di sini hanya untuk tampilan & pengolahan di klien. */

export type WifiStatus = "available" | "partial" | "full" | "expired" | "inactive";

export interface RcpSettings {
  openTime: string;      // "06:00"
  closeTime: string;     // "22:00"
  slotMinutes: number;   // 15 | 30 | 60
  roomName: string;
  wifiSsid: string;
  wifiTerms: string;
}
export const DEFAULT_SETTINGS: RcpSettings = { openTime: "06:00", closeTime: "22:00", slotMinutes: 30, roomName: "Induction Room", wifiSsid: "", wifiTerms: "" };

export interface WifiAccount {
  id: string; username: string; password: string; validFrom: string; validUntil: string;
  slots: number; used: number; free: number; daysLeft: number; durationDays: number;
  status: WifiStatus; batch: string; notes: string; active: boolean; createdAt: string;
}

export interface WifiSuggestion { id: string; username: string; validUntil: string; free: number; daysLeft: number; durationDays: number }

export interface WifiGrant {
  id: string; receiptNo: string; accountId: string; username: string; password: string; slots: number;
  guestName: string; guestCompany: string; requestorName: string; requestorEmail: string; department: string;
  lineManager: string; purpose: string; startDate: string; endDate: string; returnedAt: string | null; returnNote: string;
  emailSentAt: string | null; createdBy: string; createdAt: string; shareToken: string;
}

export interface WifiGrantResult { id: string; receiptNo: string; username: string; password: string; startDate: string; endDate: string; accountValidUntil: string; shareToken: string; createdAt: string }

export type ParcelDirection = "in" | "out";
export interface Parcel {
  id: string; receiptNo: string; direction: ParcelDirection; itemType: string; description: string;
  sender: string; recipient: string; department: string; email: string; courier: string;
  status: "waiting" | "handed"; handedTo: string; handedAt: string | null; handedBy: string;
  notifiedAt: string | null; createdBy: string; createdAt: string; shareToken: string;
}

export interface RoomBooking {
  id: string; room: string; date: string; start: string; end: string; title: string; pic: string;
  department: string; attendees: number | null; notes: string; seriesId: string | null; createdBy: string; createdAt: string;
  receiptNo: string; shareToken: string; picEmail: string;
}

/** Karyawan (tabel employees CIKOPS + kolom migrasi 033). */
export interface RcpEmployee { id: string; nama: string; nik: string; departement: string; email: string; noHp: string; jabatan: string; aktif: boolean; createdAt: string }

/* ── Bukti Permintaan (halaman /bukti & tombol cetak) ── */
export type ReceiptKind = "wifi" | "parcel" | "booking";
export interface ReceiptData {
  kind: ReceiptKind; receipt_no: string; created_at: string; created_by: string; status: string;
  // wifi
  guest_name?: string; guest_company?: string; requestor_name?: string; department?: string; purpose?: string; slots?: number;
  start_date?: string; end_date?: string; returned_at?: string | null; username?: string; password?: string | null; ssid?: string; terms?: string;
  // barang
  direction?: "in" | "out"; item_type?: string; description?: string; sender?: string; recipient?: string; courier?: string; handed_to?: string; handed_at?: string | null;
  // booking
  room?: string; date?: string; start?: string; end?: string; title?: string; pic?: string; attendees?: number | null; notes?: string;
  series?: { count: number; first: string; last: string } | null;
}

/** Tautan publik bukti. */
export const receiptUrl = (token: string, origin = typeof window !== "undefined" ? window.location.origin : "") => `${origin}/bukti?t=${encodeURIComponent(token)}`;
/** Kode verifikasi pendek dari token (ditampilkan di bukti). */
export const verifyCode = (token: string) => token.slice(0, 8).toUpperCase().replace(/(.{4})(.{4})/, "$1-$2");

/** Bukti dari data yang sudah ada di layar (tanpa memanggil server). */
export function receiptFromGrant(g: WifiGrant, s: RcpSettings): ReceiptData {
  const today = todayISO();
  const active = !g.returnedAt && g.endDate >= today;
  return { kind: "wifi", receipt_no: g.receiptNo, created_at: g.createdAt, created_by: g.createdBy, status: g.returnedAt ? "returned" : g.endDate < today ? "ended" : "active",
    guest_name: g.guestName, guest_company: g.guestCompany, requestor_name: g.requestorName, department: g.department, purpose: g.purpose, slots: g.slots,
    start_date: g.startDate, end_date: g.endDate, returned_at: g.returnedAt, username: g.username, password: active ? g.password : null, ssid: s.wifiSsid, terms: s.wifiTerms };
}
export function receiptFromParcel(p: Parcel): ReceiptData {
  return { kind: "parcel", receipt_no: p.receiptNo, created_at: p.createdAt, created_by: p.createdBy, status: p.status, direction: p.direction, item_type: p.itemType,
    description: p.description, sender: p.sender, recipient: p.recipient, department: p.department, courier: p.courier, handed_to: p.handedTo, handed_at: p.handedAt };
}
export function receiptFromBooking(b: RoomBooking, series?: RoomBooking[]): ReceiptData {
  const ss = series && series.length > 1 ? [...series].sort((x, y) => x.date.localeCompare(y.date)) : null;
  return { kind: "booking", receipt_no: b.receiptNo, created_at: b.createdAt, created_by: b.createdBy, status: b.date < todayISO() ? "done" : "confirmed",
    room: b.room, date: b.date, start: b.start, end: b.end, title: b.title, pic: b.pic, department: b.department, attendees: b.attendees, notes: b.notes,
    series: ss ? { count: ss.length, first: ss[0].date, last: ss[ss.length - 1].date } : null };
}

export interface Contact { name: string; email: string; department: string; useCount: number }

export const ITEM_TYPES = ["Paket", "Dokumen / Surat", "Makanan", "Barang lain"] as const;

export const WIFI_STATUS_LABEL: Record<WifiStatus, string> = {
  available: "Tersedia", partial: "Terpakai sebagian", full: "Penuh", expired: "Kedaluwarsa", inactive: "Nonaktif",
};

/* ── tanggal (lokal WIB perangkat) ── */
const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const todayISO = () => isoOf(new Date());
export function addDays(iso: string, n: number): string { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); }
export function addMonths(iso: string, n: number): string { const d = parseISO(iso); d.setMonth(d.getMonth() + n); return isoOf(d); }
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "–";
  return parseISO(iso).toLocaleDateString("id-ID", opts);
}
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "–";
  return new Date(ts).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", ":");
}
export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "–";
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
}
export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Masih memakai slot hari ini? (sama dengan aturan di database) */
export const grantActive = (g: WifiGrant, today = todayISO()) => !g.returnedAt && g.endDate >= today;

/** Durasi pemakaian wifi → tanggal selesai. */
export type WifiDuration = "today" | "d3" | "w1" | "m1" | "m3" | "custom";
export const WIFI_DURATIONS: { key: WifiDuration; label: string }[] = [
  { key: "today", label: "Hari ini (harian)" },
  { key: "d3", label: "3 hari" },
  { key: "w1", label: "1 minggu" },
  { key: "m1", label: "1 bulan" },
  { key: "m3", label: "3 bulan" },
  { key: "custom", label: "Sampai tanggal…" },
];
export function durationEnd(start: string, d: WifiDuration, custom: string): string {
  switch (d) {
    case "today": return start;
    case "d3": return addDays(start, 2);
    case "w1": return addDays(start, 6);
    case "m1": return addDays(addMonths(start, 1), -1);
    case "m3": return addDays(addMonths(start, 3), -1);
    default: return custom || start;
  }
}

/* ── Impor akun wifi dari teks (tempel dari Excel / CSV) ──
   Kolom yang dikenali (urutan bebas, baris judul opsional):
   username/user, password/pass, berlaku sampai/valid until/expired, berlaku mulai/valid from, durasi/hari, slot, batch/keterangan. */
export interface ImportRow { username: string; password: string; validFrom: string | null; validUntil: string | null; slots: number | null; batch: string; error?: string }

function normDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
  m = s.match(/^(\d{1,2})\s+([a-zA-Z]{3})[a-zA-Z]*\s+(\d{4})$/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(+m[1])}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 30000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return isoOf(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  return null;
}

export function parseAccountsText(text: string, defaults: { validFrom: string; durationDays: number; slots: number; batch: string }): ImportRow[] {
  // Jangan trim baris utuh: kolom pertama yang kosong (tab di awal) harus tetap terhitung.
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/[;,]/)).map((x) => x.trim().replace(/^"|"$/g, ""));
  const first = split(lines[0]).map((x) => x.toLowerCase());
  const find = (...keys: string[]) => first.findIndex((h) => keys.some((k) => h.includes(k)));
  const hasHeader = find("user", "pass", "berlaku", "valid", "expire") >= 0;
  const col = hasHeader
    ? { u: find("user", "akun", "login"), p: find("pass", "sandi"), until: find("sampai", "until", "expire", "akhir", "habis"), from: find("mulai", "from", "awal", "start"), dur: find("durasi", "hari", "days", "duration"), slot: find("slot", "perangkat", "device"), batch: find("batch", "ket", "note", "tipe", "jenis") }
    : { u: 0, p: 1, until: 2, from: -1, dur: -1, slot: -1, batch: -1 };
  return lines.slice(hasHeader ? 1 : 0).map((l) => {
    const c = split(l);
    const get = (i: number) => (i >= 0 ? c[i] ?? "" : "");
    const username = get(col.u);
    const validFrom = normDate(get(col.from)) ?? defaults.validFrom;
    let validUntil = normDate(get(col.until));
    const durRaw = get(col.dur) || (col.until >= 0 && !validUntil ? get(col.until) : "");
    const dur = parseInt(durRaw, 10);
    if (!validUntil) validUntil = addDays(validFrom, (Number.isFinite(dur) && dur > 0 ? dur : defaults.durationDays) - 1);
    const slots = parseInt(get(col.slot), 10);
    const row: ImportRow = { username, password: get(col.p), validFrom, validUntil, slots: Number.isFinite(slots) && slots > 0 ? slots : defaults.slots, batch: get(col.batch) || defaults.batch };
    if (!username) row.error = "username kosong";
    else if (validUntil < validFrom) row.error = "tanggal berlaku terbalik";
    return row;
  });
}

/* ── Induction Room: grid mingguan ── */
export function weekStart(iso: string): string { const d = parseISO(iso); const dow = d.getDay(); d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow)); return isoOf(d); }
export function overlaps(aS: string, aE: string, bS: string, bE: string) { return toMin(aS) < toMin(bE) && toMin(bS) < toMin(aE); }

export type RepeatMode = "none" | "daily" | "weekdays" | "weekly";
/** Daftar tanggal booking berulang (maks 60 kejadian). */
export function repeatDates(start: string, mode: RepeatMode, until: string, count: number): string[] {
  if (mode === "none") return [start];
  const out: string[] = [];
  let d = start;
  const limit = Math.min(count > 0 ? count : 60, 60);
  for (let guard = 0; guard < 400 && out.length < limit; guard++) {
    if (until && d > until) break;
    const dow = parseISO(d).getDay();
    if (mode !== "weekdays" || (dow !== 0 && dow !== 6)) out.push(d);
    d = addDays(d, mode === "weekly" ? 7 : 1);
  }
  return out;
}

/** Pemakaian wifi per departemen per bulan (jumlah tanda terima & slot). */
export function usageByDeptMonth(grants: WifiGrant[]): { months: string[]; rows: { dept: string; byMonth: Record<string, number>; total: number }[] } {
  const months = [...new Set(grants.map((g) => monthOf(g.createdAt)))].sort();
  const map = new Map<string, Record<string, number>>();
  for (const g of grants) {
    const k = g.department.trim() || "Lainnya";
    const m = monthOf(g.createdAt);
    const r = map.get(k) ?? {};
    r[m] = (r[m] ?? 0) + 1;
    map.set(k, r);
  }
  const rows = [...map.entries()].map(([dept, byMonth]) => ({ dept, byMonth, total: Object.values(byMonth).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  return { months, rows };
}

export const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "2-digit" }); };

/** Tanggal / bulan lokal dari timestamp (timestamptz disimpan UTC). */
export const dayOf = (ts: string | null | undefined) => (ts ? isoOf(new Date(ts)) : "");
export const monthOf = (ts: string | null | undefined) => dayOf(ts).slice(0, 7);
