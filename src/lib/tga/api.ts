// Aplikasi TGA (teknisi GA): login nama + PIN, catat kegiatan harian.
// Semua lewat RPC SECURITY DEFINER (supabase/01_dasar.sql (bagian 034)) — teknisi tidak butuh akun Supabase.
import { supabase } from "@/lib/supabaseClient";

export type TgaStatus = "selesai" | "proses" | "pending" | "butuh_part" | "baru" | "batal";
/** Asal kegiatan: dicatat sendiri, ditugaskan admin, atau permintaan karyawan (/request). */
export type TgaSource = "mandiri" | "tugas" | "permintaan";
export type TgaPriority = "normal" | "urgent";

export interface TgaActivity {
  id: string;
  ref_no: string;
  nama_tga: string;
  tanggal: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  kategori: string;
  lokasi: string;
  activity: string;
  request_by: string;
  /** Terhubung ke Data Karyawan (employees.id); null = di luar data karyawan */
  requestor_id?: string | null;
  departemen: string;
  status: TgaStatus;
  prioritas: TgaPriority;
  catatan: string;
  selesai_at: string | null;
  created_at: string;
  updated_at: string | null;
  sumber?: TgaSource;
  assigned_by?: string;
  assigned_at?: string | null;
  accepted_at?: string | null;
  request_phone?: string;
  /** Tugas belum diambil siapa pun (siapa cepat) */
  pool?: boolean;
  /** Teknisi pemilik (tersedia di data dashboard) */
  user_id?: string | null;
}

export interface TgaDraft {
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  kategori: string;
  lokasi: string;
  activity: string;
  request_by: string;
  requestor_id: string | null;
  departemen: string;
  status: TgaStatus;
  prioritas: TgaPriority;
  catatan: string;
}

export interface TgaMyData { nama: string; today: string; activities: TgaActivity[]; pool?: TgaActivity[]; month_count: number }
/** Karyawan dari Data Karyawan (employees). id kosong bila 035 belum dijalankan. */
export interface TgaRequestor { id?: string; nama: string; dept: string; nik?: string; jabatan?: string }

export interface TgaUserRow {
  id: string;
  nama: string;
  no_hp: string | null;
  aktif: boolean;
  last_login_at: string | null;
  locked: boolean;
  month_count: number;
}

export const TGA_STATUS: { id: TgaStatus; label: string; short: string; tone: string }[] = [
  { id: "selesai", label: "Selesai", short: "Selesai", tone: "green" },
  { id: "proses", label: "Dalam proses", short: "Proses", tone: "blue" },
  { id: "pending", label: "Pending", short: "Pending", tone: "orange" },
  { id: "butuh_part", label: "Butuh part", short: "Part", tone: "red" },
];
/** Status di luar pilihan form: tugas baru (menunggu diterima) & dibatalkan admin. */
export const TGA_STATUS_EXTRA: { id: TgaStatus; label: string; short: string; tone: string }[] = [
  { id: "baru", label: "Tugas baru", short: "Baru", tone: "red" },
  { id: "batal", label: "Dibatalkan", short: "Batal", tone: "gray" },
];
export const tgaStatusInfo = (s: string) => [...TGA_STATUS, ...TGA_STATUS_EXTRA].find((x) => x.id === s);
export const tgaStatusLabel = (s: string) => tgaStatusInfo(s)?.label ?? s;
export const TGA_SOURCE_LABEL: Record<TgaSource, string> = { mandiri: "Dicatat sendiri", tugas: "Ditugaskan admin", permintaan: "Permintaan karyawan" };

export const TGA_CATEGORIES: { id: string; icon: string; hue: number; quick: string[] }[] = [
  { id: "Listrik", icon: "⚡", hue: 45, quick: ["Ganti lampu", "Perbaiki stop kontak", "Cek MCB / panel", "Pasang kabel"] },
  { id: "AC", icon: "❄️", hue: 195, quick: ["Cuci AC", "AC tidak dingin", "AC bocor air", "Ganti remote / baterai"] },
  { id: "Plumbing", icon: "🚰", hue: 210, quick: ["Kran bocor", "Saluran mampet", "Perbaiki toilet", "Ganti selang"] },
  { id: "Furniture", icon: "🪑", hue: 28, quick: ["Perbaiki kursi", "Perbaiki meja", "Pindah furniture", "Pasang rak"] },
  { id: "Sipil", icon: "🧱", hue: 12, quick: ["Tambal dinding", "Cat ulang", "Perbaiki plafon", "Perbaiki pintu"] },
  { id: "Lainnya", icon: "🔧", hue: 265, quick: ["Pasang banner", "Angkat barang", "Persiapan acara", "Pengecekan rutin"] },
];
export const tgaCategory = (id: string) => TGA_CATEGORIES.find((c) => c.id === id) ?? TGA_CATEGORIES[TGA_CATEGORIES.length - 1];

const TOKEN_KEY = "cikops_tga_token";
const NAME_KEY = "cikops_tga_name";

export function tgaStoredSession(): { token: string; nama: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { token, nama: localStorage.getItem(NAME_KEY) ?? "" } : null;
  } catch { return null; }
}
function storeSession(token: string | null, nama = "") {
  try {
    if (token) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(NAME_KEY, nama); }
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* mode privat — sesi hanya selama tab terbuka */ }
}

/** Pesan error yang ramah: fungsi belum dipasang = 034 belum dijalankan. */
function friendly(e: { message?: string; code?: string } | null): Error {
  const msg = e?.message ?? "Terjadi kesalahan.";
  if (e?.code === "PGRST202" || e?.code === "42883" || /could not find the function/i.test(msg)) {
    return new Error(/tga_admin_save|tga_admin_delete_act|tga_assign|assign_config|assign_code/i.test(msg)
      ? "Fitur ini belum aktif — admin perlu menjalankan supabase/04_aplikasi_lapangan.sql (bagian 045)."
      : "Aplikasi TGA belum aktif — admin perlu menjalankan supabase/01_dasar.sql (bagian 034).");
  }
  if (/failed to fetch|network/i.test(msg)) return new Error("Tidak ada koneksi internet. Coba lagi.");
  return new Error(msg);
}
/** Sesi kedaluwarsa → hapus token supaya aplikasi kembali ke layar masuk. */
export const isSessionError = (e: unknown) => e instanceof Error && /sesi berakhir/i.test(e.message);

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const err = friendly(error);
    if (isSessionError(err)) storeSession(null);
    throw err;
  }
  return data as T;
}

export const tgaNames = () => rpc<string[]>("tga_names").then((d) => d ?? []);

export async function tgaLogin(nama: string, pin: string): Promise<{ token: string; nama: string }> {
  const r = await rpc<{ token?: string; nama?: string; error?: string }>("tga_login", { p_nama: nama, p_pin: pin });
  if (!r?.token) throw new Error(r?.error ?? "Gagal masuk.");
  storeSession(r.token, r.nama ?? nama);
  return { token: r.token, nama: r.nama ?? nama };
}

export async function tgaLogout(token: string) {
  storeSession(null);
  await supabase.rpc("tga_logout", { p_token: token });
}

export const tgaMyData = (token: string, days = 60) => rpc<TgaMyData>("tga_my_data", { p_token: token, p_days: days });
export const tgaSave = (token: string, id: string | null, d: TgaDraft) => rpc<TgaActivity>("tga_save_activity", { p_token: token, p_id: id, p_data: d });
/** Terima tugas sendiri / ambil permintaan yang belum diambil → status Proses. */
export const tgaAccept = (token: string, id: string) => rpc<TgaActivity>("tga_accept", { p_token: token, p_id: id });
export const tgaPushSubscribe = (token: string, s: { endpoint: string; p256dh: string; auth: string; ua: string }) =>
  rpc<boolean>("tga_push_subscribe", { p_token: token, p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_ua: s.ua }).then(() => undefined);
export const tgaDelete = (token: string, id: string) => rpc<null>("tga_delete_activity", { p_token: token, p_id: id });
const REQ_CACHE = "cikops_tga_requestors";
/** Cache daftar karyawan di HP supaya pemilih requestor langsung tampil (diperbarui tiap form dibuka). */
export function tgaCachedRequestors(): TgaRequestor[] {
  try { return JSON.parse(localStorage.getItem(REQ_CACHE) ?? "[]") as TgaRequestor[]; } catch { return []; }
}
export const tgaRequestors = (token: string) => rpc<TgaRequestor[]>("tga_requestors", { p_token: token }).then((d) => {
  const list = d ?? [];
  try { localStorage.setItem(REQ_CACHE, JSON.stringify(list)); } catch { /* penuh / privat */ }
  return list;
});

// ── Admin (dashboard, login Supabase) ──
export const tgaAdminUsers = () => rpc<TgaUserRow[]>("tga_admin_users").then((d) => d ?? []);
export const tgaAdminSaveUser = (u: { id: string | null; nama: string; no_hp: string; pin: string; aktif: boolean }) =>
  rpc<null>("tga_admin_save_user", { p_id: u.id, p_nama: u.nama, p_no_hp: u.no_hp, p_pin: u.pin, p_aktif: u.aktif });
export const tgaAdminDeleteUser = (id: string) => rpc<null>("tga_admin_delete_user", { p_id: id });

/** Dashboard: buat / ubah / alihkan tugas. userId null = ke semua TGA (siapa cepat). */
export const tgaAdminAssign = (id: string | null, userId: string | null, d: Record<string, unknown>) =>
  rpc<TgaActivity>("tga_admin_assign", { p_id: id, p_user_id: userId, p_data: d });
export const tgaAdminCancel = (id: string, reason = "") => rpc<null>("tga_admin_cancel", { p_id: id, p_reason: reason });
/** Dashboard (menu TGA): tambah / ubah pekerjaan apa pun — teknisi, status, tanggal, jam (045). */
export const tgaAdminSaveActivity = (id: string | null, userId: string | null, d: Record<string, unknown>) =>
  rpc<TgaActivity>("tga_admin_save_activity", { p_id: id, p_user_id: userId, p_data: d });
/** Hapus permanen (berbeda dengan batal yang tetap tercatat). */
export const tgaAdminDeleteActivity = (id: string) => rpc<null>("tga_admin_delete_activity", { p_id: id });

// ── Form penugasan publik /tugas-tga (045) ──
export interface TgaAssignConfig { aktif: boolean; has_code: boolean; updated_at: string | null; updated_by: string; locked: boolean; today: number }
export const tgaAdminAssignConfig = () => rpc<TgaAssignConfig>("tga_admin_assign_config");
export const tgaAdminSetAssignCode = (code: string, aktif: boolean) => rpc<null>("tga_admin_set_assign_code", { p_code: code, p_aktif: aktif });
export interface TgaAssignInfo { technicians: { id: string; nama: string; open: number; busy?: boolean; busy_ref?: string }[]; employees: { id: string; nama: string; dept: string }[] }
/** Error kode (salah / terkunci / belum aktif) dikembalikan sebagai Error biasa. */
export async function tgaAssignPublicInfo(code: string): Promise<TgaAssignInfo> {
  const r = await rpc<TgaAssignInfo & { error?: string }>("tga_assign_public_info", { p_code: code });
  if (r?.error) throw new Error(r.error);
  return { technicians: r?.technicians ?? [], employees: r?.employees ?? [] };
}
export async function tgaAssignPublic(code: string, userId: string | null, d: Record<string, unknown>) {
  const r = await rpc<{ id?: string; ref_no?: string; nama_tga?: string; pool?: boolean; error?: string }>("tga_assign_public", { p_code: code, p_user_id: userId, p_data: d });
  if (!r?.id) throw new Error(r?.error ?? "Gagal mengirim tugas.");
  return r as { id: string; ref_no: string; nama_tga: string; pool: boolean };
}

/** Halaman publik /request: karyawan minta bantuan TGA. */
export const tgaRequestPublic = (r: { nama: string; dept: string; phone: string; kategori: string; lokasi: string; activity: string; prioritas: string }) =>
  rpc<{ id: string; ref_no: string }>("tga_request_public", {
    p_name: r.nama, p_dept: r.dept, p_phone: r.phone, p_kategori: r.kategori, p_lokasi: r.lokasi, p_activity: r.activity, p_prioritas: r.prioritas,
  });

/** Status teknisi: Busy bila ada pekerjaan berstatus Proses (sudah diterima, sedang dikerjakan);
 *  Available bila tidak ada. Kunci = id akun teknisi. */
export function tgaPresence(acts: TgaActivity[]): Map<string, TgaActivity> {
  const m = new Map<string, TgaActivity>();
  for (const a of acts) {
    if (a.status !== "proses" || !a.user_id) continue;
    const cur = m.get(a.user_id);
    if (!cur || (a.accepted_at ?? "") > (cur.accepted_at ?? "")) m.set(a.user_id, a);
  }
  return m;
}

/** Realtime: panggil onChange (sudah di-debounce) setiap ada perubahan pekerjaan TGA.
 *  Butuh tga_activities di publikasi supabase_realtime (04, bagian 046). */
export function subscribeTgaActivities(onChange: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  const ch = supabase.channel(`tga-acts-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tga_activities" }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(onChange, 400);
    })
    .subscribe();
  return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
}

/** Semua kegiatan dari aplikasi (untuk dashboard GA; RLS: staf). Kosong bila 034 belum dijalankan. */
export async function tgaAllActivities(): Promise<TgaActivity[]> {
  const { data, error } = await supabase.from("tga_activities").select("*").order("tanggal", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message)) return [];
    throw friendly(error);
  }
  return (data ?? []).map((r) => ({
    ...r,
    jam_mulai: r.jam_mulai ? String(r.jam_mulai).slice(0, 5) : null,
    jam_selesai: r.jam_selesai ? String(r.jam_selesai).slice(0, 5) : null,
    pool: r.user_id == null,
  })) as TgaActivity[];
}
