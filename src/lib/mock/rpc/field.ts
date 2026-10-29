/* MOCK BACKEND — RPC modul field: aplikasi TGA (teknisi GA), form penugasan publik,
   permintaan karyawan (/request), ringkasan FM Command Center.
   Meniru supabase/01_dasar.sql (bagian 034–037) & supabase/04_aplikasi_lapangan.sql
   (bagian 045, 046, 048). Versi definisi TERAKHIR yang diikuti. */
import {
  addDays, fail, monthStart, nowIso, nowHmWib, table, todayWib, uuid, wibTime,
  type MockCtx, type MockDB, type Row, type RpcHandler,
} from "../core";

const OPEN = ["baru", "proses", "pending", "butuh_part"];
const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const t = (v: unknown) => s(v).trim();
const nn = (v: unknown) => (s(v) === "" ? null : s(v));
const hm = (v: unknown) => (v ? String(v).slice(0, 5) : null);
const lower = (v: unknown) => t(v).toLowerCase();

/* ── helper ── */
function nextNo(db: MockDB): string {
  const period = todayWib().slice(2, 4) + todayWib().slice(5, 7);
  const ctr = table(db, "tga_counters");
  let c = ctr.find((x) => x.period === period);
  if (!c) {
    // lanjutkan dari ref_no yang sudah ada (data dummy) supaya tidak bentrok
    const max = table(db, "tga_activities").reduce((m, a) => {
      const r = new RegExp(`^TGA-${period}-(\\d+)$`).exec(s(a.ref_no));
      return r ? Math.max(m, Number(r[1])) : m;
    }, 0);
    c = { period, last: max };
    ctr.push(c);
  }
  c.last = Number(c.last ?? 0) + 1;
  return `TGA-${period}-${String(c.last).padStart(3, "0")}`;
}

/** tga_user_of: sesi → teknisi aktif (dan perpanjang sesi). */
function userOf(db: MockDB, token: unknown): Row {
  const ses = table(db, "tga_sessions").find((x) => x.token === token && Date.parse(x.expires_at) > Date.now());
  const u = ses ? table(db, "tga_users").find((x) => x.id === ses.user_id && x.aktif !== false) : null;
  if (!ses || !u) fail("Sesi berakhir — silakan masuk lagi.", "28000");
  if (Date.parse(ses!.expires_at) < Date.now() + 110 * 86400000) ses!.expires_at = new Date(Date.now() + 120 * 86400000).toISOString();
  return u!;
}

function staffOnly(ctx: MockCtx) {
  if (!ctx.profile) fail("Akses ditolak.", "42501");
}
const staffName = (ctx: MockCtx) => t(ctx.profile?.full_name) || "Admin GA";

function actJson(a: Row): Row {
  return {
    id: a.id, ref_no: a.ref_no, nama_tga: a.nama_tga ?? "", tanggal: a.tanggal,
    jam_mulai: hm(a.jam_mulai), jam_selesai: hm(a.jam_selesai),
    kategori: a.kategori ?? "Lainnya", lokasi: a.lokasi ?? "", activity: a.activity ?? "", request_by: a.request_by ?? "",
    requestor_id: a.requestor_id ?? null, departemen: a.departemen ?? "", request_phone: a.request_phone ?? "",
    status: a.status, prioritas: a.prioritas ?? "normal", catatan: a.catatan ?? "",
    sumber: a.sumber ?? "mandiri", assigned_by: a.assigned_by ?? "", assigned_at: a.assigned_at ?? null, accepted_at: a.accepted_at ?? null,
    pool: a.user_id == null,
    selesai_at: a.selesai_at ?? null, created_at: a.created_at, updated_at: a.updated_at ?? null,
  };
}

function newActivity(db: MockDB, f: Row): Row {
  const now = nowIso();
  const a: Row = {
    id: uuid(), ref_no: nextNo(db), user_id: null, nama_tga: "", tanggal: todayWib(), jam_mulai: null, jam_selesai: null,
    kategori: "Lainnya", lokasi: "", activity: "", request_by: "", requestor_id: null, departemen: "", request_phone: "",
    status: "selesai", prioritas: "normal", catatan: "", selesai_at: null, sumber: "mandiri", assigned_by: "",
    assigned_at: null, accepted_at: null, notified_key: null, created_at: now, updated_at: now,
    ...f,
  };
  table(db, "tga_activities").push(a);
  return a;
}

const empActive = (e: Row) => t(e.nama) !== "" && e.aktif !== false;
const byNama = (a: Row, b: Row) => s(a.nama).localeCompare(s(b.nama));
const employeeOf = (db: MockDB, id: unknown) => table(db, "employees").find((e) => e.id === id);

/** requestor_id → nama & departemen dari Data Karyawan. */
function resolveRequestor(db: MockDB, p: Row, req: string, dept: string, strict: boolean) {
  let reqId: string | null = null;
  if (UUID_RE.test(s(p.requestor_id))) {
    const e = employeeOf(db, p.requestor_id);
    if (e) { reqId = e.id; req = s(e.nama); dept = t(e.departement) || dept; }
    else if (strict) fail("Karyawan requestor tidak ditemukan — pilih ulang dari daftar.");
  }
  return { reqId, req, dept };
}

const monthCount = (db: MockDB, userId: string) => {
  const ym = todayWib().slice(0, 7);
  return table(db, "tga_activities").filter((a) => a.user_id === userId && a.status !== "batal" && s(a.tanggal).slice(0, 7) === ym).length;
};

/** tga_assign_check — null = lolos. */
function assignCheck(db: MockDB, code: unknown): string | null {
  const c = table(db, "tga_assign_config").find((x) => Number(x.id) === 1);
  if (!c || !c.aktif || !c.code) return "Form penugasan belum diaktifkan admin.";
  if (c.locked_until && Date.parse(c.locked_until) > Date.now()) {
    return `Terlalu banyak kode salah. Coba lagi ${Math.max(1, Math.ceil((Date.parse(c.locked_until) - Date.now()) / 60000))} menit lagi.`;
  }
  if (s(code).toUpperCase() !== s(c.code).toUpperCase()) {
    const n = Number(c.failed_count ?? 0) + 1;
    if (n >= 8) { c.locked_until = new Date(Date.now() + 15 * 60000).toISOString(); c.failed_count = 0; }
    else c.failed_count = n;
    return "Kode penugasan salah.";
  }
  if (Number(c.failed_count ?? 0) > 0) c.failed_count = 0;
  return null;
}

const acts = (db: MockDB) => table(db, "tga_activities");
const byCreated = (a: Row, b: Row) => s(a.created_at).localeCompare(s(b.created_at));

export const FIELD: Record<string, RpcHandler> = {
  /* ── aplikasi TGA (tanpa login Supabase) ── */
  tga_names: (_a, { db }) =>
    table(db, "tga_users").filter((u) => u.aktif !== false).map((u) => s(u.nama)).sort((a, b) => a.localeCompare(b)),

  tga_login: ({ p_nama, p_pin }, { db }) => {
    const u = table(db, "tga_users").find((x) => lower(x.nama) === lower(p_nama) && x.aktif !== false);
    if (!u) return { error: "Nama tidak terdaftar atau akun nonaktif." };
    if (u.locked_until && Date.parse(u.locked_until) > Date.now()) {
      return { error: `Terlalu banyak PIN salah. Coba lagi pukul ${wibTime(u.locked_until)}.` };
    }
    if (s(u.pin) !== s(p_pin)) {
      u.failed_count = Number(u.failed_count ?? 0) + 1;
      u.locked_until = u.failed_count >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
      return { error: u.locked_until ? "PIN salah 5 kali — akun dikunci 15 menit." : `PIN salah. Sisa ${5 - u.failed_count} percobaan.` };
    }
    const token = (uuid() + uuid()).replace(/-/g, "");
    const ses = table(db, "tga_sessions");
    ses.push({ token, user_id: u.id, created_at: nowIso(), expires_at: new Date(Date.now() + 120 * 86400000).toISOString() });
    Object.assign(u, { failed_count: 0, locked_until: null, last_login_at: nowIso() });
    db.tga_sessions = ses.filter((x) => Date.parse(x.expires_at) >= Date.now());
    return { token, nama: u.nama };
  },

  tga_logout: ({ p_token }, { db }) => {
    db.tga_sessions = table(db, "tga_sessions").filter((x) => x.token !== p_token);
    return null;
  },

  tga_my_data: ({ p_token, p_days }, { db }) => {
    const u = userOf(db, p_token);
    const today = todayWib();
    const from = addDays(today, -Math.max(Number(p_days ?? 60) || 60, 1));
    const mine = acts(db)
      .filter((a) => a.user_id === u.id && a.status !== "batal" && (s(a.tanggal) >= from || a.status !== "selesai"))
      .sort((a, b) => s(b.tanggal).localeCompare(s(a.tanggal)) || s(b.created_at).localeCompare(s(a.created_at)));
    const pool = acts(db)
      .filter((a) => a.user_id == null && a.status === "baru")
      .sort((a, b) => Number(b.prioritas === "urgent") - Number(a.prioritas === "urgent") || byCreated(a, b));
    return { nama: u.nama, today, activities: mine.map(actJson), pool: pool.map(actJson), month_count: monthCount(db, u.id) };
  },

  tga_accept: ({ p_token, p_id }, { db }) => {
    const u = userOf(db, p_token);
    const a = acts(db).find((x) => x.id === p_id && x.status === "baru" && (x.user_id === u.id || x.user_id == null));
    if (!a) {
      if (acts(db).some((x) => x.id === p_id && x.status === "baru" && x.user_id != null && x.user_id !== u.id)) fail("Tugas ini sudah diambil teknisi lain.");
      fail("Tugas tidak tersedia lagi (sudah diambil atau dibatalkan).");
    }
    Object.assign(a!, {
      user_id: u.id, nama_tga: u.nama, status: "proses", accepted_at: nowIso(), tanggal: todayWib(),
      jam_mulai: a!.jam_mulai ?? nowHmWib(), updated_at: nowIso(),
    });
    return actJson(a!);
  },

  tga_save_activity: ({ p_token, p_id, p_data }, { db }) => {
    const u = userOf(db, p_token);
    const d: Row = p_data ?? {};
    const act = t(d.activity);
    if (!act) fail("Isi kegiatan yang dikerjakan.");
    const status = s(d.status) || "selesai";
    if (!["proses", "pending", "butuh_part", "selesai"].includes(status)) fail("Status tidak valid.");
    const r = resolveRequestor(db, d, t(d.request_by), t(d.departemen), true);
    if (!p_id) {
      return actJson(newActivity(db, {
        user_id: u.id, nama_tga: u.nama, tanggal: s(d.tanggal) || todayWib(),
        jam_mulai: nn(d.jam_mulai), jam_selesai: nn(d.jam_selesai),
        kategori: t(d.kategori) || "Lainnya", lokasi: t(d.lokasi), activity: act,
        request_by: r.req, requestor_id: r.reqId, departemen: r.dept, status,
        prioritas: s(d.prioritas) || "normal", catatan: t(d.catatan),
        selesai_at: status === "selesai" ? nowIso() : null, sumber: "mandiri",
      }));
    }
    const a = acts(db).find((x) => x.id === p_id && x.user_id === u.id && x.status !== "batal");
    if (!a) fail("Kegiatan tidak ditemukan.");
    Object.assign(a!, {
      tanggal: s(d.tanggal) || a!.tanggal, jam_mulai: nn(d.jam_mulai), jam_selesai: nn(d.jam_selesai),
      kategori: t(d.kategori) || a!.kategori, lokasi: t(d.lokasi), activity: act,
      request_by: r.req, requestor_id: r.reqId, departemen: r.dept, status,
      prioritas: s(d.prioritas) || a!.prioritas, catatan: t(d.catatan),
      accepted_at: a!.accepted_at ?? (a!.sumber !== "mandiri" ? nowIso() : null),
      selesai_at: status === "selesai" ? a!.selesai_at ?? nowIso() : null, updated_at: nowIso(),
    });
    return actJson(a!);
  },

  tga_delete_activity: ({ p_token, p_id }, { db }) => {
    const u = userOf(db, p_token);
    if (acts(db).some((x) => x.id === p_id && x.user_id === u.id && x.sumber !== "mandiri")) {
      fail("Tugas dari admin / permintaan karyawan tidak bisa dihapus. Hubungi admin GA bila perlu dibatalkan.");
    }
    db.tga_activities = acts(db).filter((x) => !(x.id === p_id && x.user_id === u.id));
    return null;
  },

  tga_requestors: ({ p_token }, { db }) => {
    userOf(db, p_token);
    return table(db, "employees").filter(empActive).sort(byNama)
      .map((e) => ({ id: e.id, nama: e.nama, dept: e.departement ?? "", nik: e.nik ?? "", jabatan: e.jabatan ?? "" }));
  },

  tga_push_subscribe: ({ p_token, p_endpoint, p_p256dh, p_auth, p_ua }, { db }) => {
    const u = userOf(db, p_token);
    const ep = s(p_endpoint);
    if (!/^https:\/\//.test(ep) && !/^fcm:.+/.test(ep)) fail("Langganan notifikasi tidak valid.");
    const subs = table(db, "push_subscriptions");
    const now = nowIso();
    const row = { endpoint: ep, p256dh: s(p_p256dh), auth: s(p_auth), app: "tga", driver_id: null, tga_user_id: u.id, user_agent: s(p_ua).slice(0, 300), updated_at: now };
    const ex = subs.find((x) => x.endpoint === ep);
    if (ex) Object.assign(ex, row); else subs.push({ ...row, created_at: now });
    return true;
  },

  /* ── dashboard (staf CIKOPS) ── */
  tga_admin_users: (_a, ctx) => {
    staffOnly(ctx);
    return table(ctx.db, "tga_users").slice().sort(byNama).map((u) => ({
      id: u.id, nama: u.nama, no_hp: u.no_hp ?? "", aktif: u.aktif !== false, last_login_at: u.last_login_at ?? null,
      locked: !!u.locked_until && Date.parse(u.locked_until) > Date.now(),
      // definisi 034: dihitung termasuk batal, per bulan berjalan
      month_count: acts(ctx.db).filter((a) => a.user_id === u.id && s(a.tanggal).slice(0, 7) === todayWib().slice(0, 7)).length,
    }));
  },

  tga_admin_save_user: ({ p_id, p_nama, p_no_hp, p_pin, p_aktif }, ctx) => {
    staffOnly(ctx);
    const nama = t(p_nama);
    const pin = s(p_pin);
    if (!nama) fail("Nama wajib diisi.");
    if (pin && !/^[0-9]{4,6}$/.test(pin)) fail("PIN harus 4–6 angka.");
    const users = table(ctx.db, "tga_users");
    if (users.some((u) => lower(u.nama) === nama.toLowerCase() && u.id !== (p_id ?? null))) fail(`Nama "${nama}" sudah punya akun.`);
    if (!p_id) {
      if (!pin) fail("PIN wajib diisi untuk akun baru.");
      users.push({ id: uuid(), nama, no_hp: t(p_no_hp), pin, aktif: p_aktif ?? true, failed_count: 0, locked_until: null, last_login_at: null, created_at: nowIso() });
      return null;
    }
    const u = users.find((x) => x.id === p_id);
    if (u) {
      Object.assign(u, { nama, no_hp: t(p_no_hp), aktif: p_aktif ?? u.aktif });
      if (pin) Object.assign(u, { pin, failed_count: 0, locked_until: null });
      if (p_aktif === false || pin) ctx.db.tga_sessions = table(ctx.db, "tga_sessions").filter((x) => x.user_id !== p_id);
    }
    return null;
  },

  tga_admin_delete_user: ({ p_id }, ctx) => {
    staffOnly(ctx);
    ctx.db.tga_users = table(ctx.db, "tga_users").filter((u) => u.id !== p_id);
    ctx.db.tga_sessions = table(ctx.db, "tga_sessions").filter((x) => x.user_id !== p_id);
    ctx.db.push_subscriptions = table(ctx.db, "push_subscriptions").filter((x) => x.tga_user_id !== p_id);
    for (const a of acts(ctx.db)) if (a.user_id === p_id) a.user_id = null; // kegiatan tetap, nama tetap
    return null;
  },

  tga_admin_assign: ({ p_id, p_user_id, p_data }, ctx) => {
    staffOnly(ctx);
    const { db } = ctx;
    const d: Row = p_data ?? {};
    const by = staffName(ctx);
    const act = t(d.activity);
    if (!act) fail("Isi pekerjaan yang harus dikerjakan.");
    let nama = "";
    if (p_user_id) {
      const u = table(db, "tga_users").find((x) => x.id === p_user_id && x.aktif !== false);
      if (!u) fail("Teknisi tidak ditemukan atau nonaktif.");
      nama = s(u!.nama);
    }
    const r = resolveRequestor(db, d, t(d.request_by), t(d.departemen), false);
    if (!p_id) {
      return actJson(newActivity(db, {
        user_id: p_user_id ?? null, nama_tga: nama, tanggal: s(d.tanggal) || todayWib(),
        kategori: t(d.kategori) || "Lainnya", lokasi: t(d.lokasi), activity: act,
        request_by: r.req, requestor_id: r.reqId, departemen: r.dept, request_phone: t(d.request_phone),
        status: "baru", prioritas: s(d.prioritas) || "normal", catatan: t(d.catatan),
        sumber: "tugas", assigned_by: by, assigned_at: nowIso(),
      }));
    }
    const a = acts(db).find((x) => x.id === p_id);
    if (!a) fail("Tugas tidak ditemukan.");
    const reassign = (a!.user_id ?? null) !== (p_user_id ?? null);
    Object.assign(a!, {
      user_id: p_user_id ?? null, nama_tga: nama,
      kategori: t(d.kategori) || a!.kategori, lokasi: t(d.lokasi), activity: act,
      request_by: r.req, requestor_id: r.reqId, departemen: r.dept,
      request_phone: d.request_phone == null ? t(a!.request_phone) : t(d.request_phone),
      prioritas: s(d.prioritas) || a!.prioritas, catatan: t(d.catatan),
      status: reassign && a!.status !== "selesai" ? "baru" : a!.status,
      accepted_at: reassign ? null : a!.accepted_at,
      assigned_by: reassign ? by : a!.assigned_by,
      assigned_at: reassign ? nowIso() : a!.assigned_at,
      updated_at: nowIso(),
    });
    return actJson(a!);
  },

  tga_admin_cancel: ({ p_id, p_reason }, ctx) => {
    staffOnly(ctx);
    const a = acts(ctx.db).find((x) => x.id === p_id && x.status !== "selesai");
    if (a) {
      const reason = t(p_reason);
      Object.assign(a, { status: "batal", updated_at: nowIso(), catatan: (s(a.catatan) + (reason ? ` [Dibatalkan: ${reason}]` : " [Dibatalkan]")).trim() });
    }
    return null;
  },

  tga_admin_save_activity: ({ p_id, p_user_id, p_data }, ctx) => {
    staffOnly(ctx);
    const { db } = ctx;
    const d: Row = p_data ?? {};
    const by = staffName(ctx);
    const act = t(d.activity);
    if (!act) fail("Isi pekerjaan yang dikerjakan.");
    const status = s(d.status) || "baru";
    if (!OPEN.concat(["selesai", "batal"]).includes(status)) fail("Status tidak dikenal.");
    let nama: string;
    if (p_user_id) {
      const u = table(db, "tga_users").find((x) => x.id === p_user_id);
      if (!u) fail("Teknisi tidak ditemukan.");
      nama = s(u!.nama);
    } else nama = t(d.nama_tga).slice(0, 80);
    if (["proses", "pending", "butuh_part", "selesai"].includes(status) && nama === "") fail("Pilih teknisi untuk status ini.");
    const r = resolveRequestor(db, d, t(d.request_by).slice(0, 80), t(d.departemen).slice(0, 80), false);
    const tgl = s(d.tanggal) || todayWib();
    const working = ["proses", "pending", "butuh_part", "selesai"].includes(status);
    const prio = d.prioritas === "urgent" ? "urgent" : "normal";
    if (!p_id) {
      return actJson(newActivity(db, {
        user_id: p_user_id ?? null, nama_tga: nama, tanggal: tgl, jam_mulai: nn(d.jam_mulai), jam_selesai: nn(d.jam_selesai),
        kategori: t(d.kategori) || "Lainnya", lokasi: t(d.lokasi).slice(0, 120), activity: act.slice(0, 1000),
        request_by: r.req, requestor_id: r.reqId, departemen: r.dept, request_phone: t(d.request_phone).slice(0, 30),
        status, prioritas: prio, catatan: t(d.catatan), sumber: "tugas", assigned_by: by, assigned_at: nowIso(),
        accepted_at: working ? nowIso() : null, selesai_at: status === "selesai" ? nowIso() : null,
      }));
    }
    const a = acts(db).find((x) => x.id === p_id);
    if (!a) fail("Pekerjaan tidak ditemukan.");
    const old = { ...a! };
    const reopened = status === "baru" && (old.status !== "baru" || (old.user_id ?? null) !== (p_user_id ?? null));
    Object.assign(a!, {
      user_id: p_user_id ?? null, nama_tga: nama, tanggal: tgl, jam_mulai: nn(d.jam_mulai), jam_selesai: nn(d.jam_selesai),
      kategori: t(d.kategori) || old.kategori, lokasi: t(d.lokasi).slice(0, 120), activity: act.slice(0, 1000),
      request_by: r.req, requestor_id: r.reqId, departemen: r.dept,
      request_phone: (d.request_phone == null ? t(old.request_phone) : t(d.request_phone)).slice(0, 30),
      status, prioritas: prio, catatan: t(d.catatan),
      accepted_at: status === "baru" ? null : old.accepted_at ?? (status !== "batal" ? nowIso() : null),
      selesai_at: status === "selesai" ? old.selesai_at ?? nowIso() : null,
      assigned_by: reopened ? by : old.assigned_by,
      assigned_at: reopened ? nowIso() : old.assigned_at,
      updated_at: nowIso(),
    });
    return actJson(a!);
  },

  tga_admin_delete_activity: ({ p_id }, ctx) => {
    staffOnly(ctx);
    if (!acts(ctx.db).some((x) => x.id === p_id)) fail("Pekerjaan tidak ditemukan (mungkin sudah dihapus).");
    ctx.db.tga_activities = acts(ctx.db).filter((x) => x.id !== p_id);
    return null;
  },

  tga_admin_assign_config: (_a, ctx) => {
    staffOnly(ctx);
    const c = table(ctx.db, "tga_assign_config").find((x) => Number(x.id) === 1) ?? {};
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    return {
      aktif: !!c.aktif, has_code: !!c.code, updated_at: c.updated_at ?? null, updated_by: c.updated_by ?? "",
      locked: !!c.locked_until && Date.parse(c.locked_until) > Date.now(),
      today: acts(ctx.db).filter((a) => a.sumber === "tugas" && s(a.assigned_by).endsWith("· form") && s(a.created_at) > dayAgo).length,
    };
  },

  tga_admin_set_assign_code: ({ p_code, p_aktif }, ctx) => {
    staffOnly(ctx);
    const code = s(p_code);
    if (code && !/^[A-Za-z0-9]{4,20}$/.test(code)) fail("Kode harus 4–20 huruf/angka tanpa spasi.");
    const cfg = table(ctx.db, "tga_assign_config");
    let c = cfg.find((x) => Number(x.id) === 1);
    if (!c) { c = { id: 1, code: null, aktif: false, failed_count: 0, locked_until: null, updated_at: null, updated_by: "" }; cfg.push(c); }
    if (p_aktif && !code && !c.code) fail("Buat kode penugasan dulu.");
    Object.assign(c, {
      code: code ? code.toUpperCase() : c.code, aktif: p_aktif ?? c.aktif,
      failed_count: 0, locked_until: null, updated_at: nowIso(), updated_by: staffName(ctx),
    });
    return null;
  },

  /* ── form publik /tugas-tga ── */
  tga_assign_public_info: ({ p_code }, { db }) => {
    const err = assignCheck(db, p_code);
    if (err) return { error: err };
    return {
      technicians: table(db, "tga_users").filter((u) => u.aktif !== false).sort(byNama).map((u) => {
        const mine = acts(db).filter((a) => a.user_id === u.id);
        const busy = mine.filter((a) => a.status === "proses").sort((a, b) => s(b.accepted_at).localeCompare(s(a.accepted_at)));
        return { id: u.id, nama: u.nama, open: mine.filter((a) => OPEN.includes(a.status)).length, busy: busy.length > 0, busy_ref: busy[0]?.ref_no ?? null };
      }),
      employees: table(db, "employees").filter(empActive).sort(byNama).map((e) => ({ id: e.id, nama: e.nama, dept: e.departement ?? "" })),
    };
  },

  tga_assign_public: ({ p_code, p_user_id, p_data }, { db }) => {
    const err = assignCheck(db, p_code);
    if (err) return { error: err };
    const d: Row = p_data ?? {};
    const by = t(d.assigned_by).slice(0, 60);
    if (by.length < 2) return { error: "Isi nama Anda (pemberi tugas)." };
    const act = t(d.activity);
    if (act.length < 3) return { error: "Isi pekerjaan yang harus dikerjakan." };
    const tenAgo = new Date(Date.now() - 600000).toISOString();
    if (acts(db).filter((a) => s(a.assigned_by).endsWith("· form") && s(a.created_at) > tenAgo).length >= 30) {
      return { error: "Terlalu banyak tugas dalam 10 menit. Coba lagi sebentar." };
    }
    let nama = "";
    if (p_user_id) {
      const u = table(db, "tga_users").find((x) => x.id === p_user_id && x.aktif !== false);
      if (!u) return { error: "Teknisi tidak ditemukan atau nonaktif." };
      nama = s(u.nama);
    }
    const r = resolveRequestor(db, d, t(d.request_by).slice(0, 80), t(d.departemen).slice(0, 80), false);
    const a = newActivity(db, {
      user_id: p_user_id ?? null, nama_tga: nama, kategori: t(d.kategori) || "Lainnya",
      lokasi: t(d.lokasi).slice(0, 120), activity: act.slice(0, 1000), request_by: r.req, requestor_id: r.reqId, departemen: r.dept,
      request_phone: t(d.request_phone).slice(0, 30), status: "baru", prioritas: d.prioritas === "urgent" ? "urgent" : "normal",
      catatan: t(d.catatan).slice(0, 500), sumber: "tugas", assigned_by: `${by} · form`, assigned_at: nowIso(),
    });
    return { id: a.id, ref_no: a.ref_no, nama_tga: a.nama_tga, pool: a.user_id == null };
  },

  /* ── halaman publik /request ── */
  tga_request_public: ({ p_name, p_dept, p_phone, p_kategori, p_lokasi, p_activity, p_prioritas }, { db }) => {
    const name = t(p_name);
    if (!name) fail("Nama wajib diisi.");
    if (!t(p_lokasi)) fail("Lokasi wajib diisi.");
    if (t(p_activity).length < 5) fail("Jelaskan masalahnya (minimal 5 huruf).");
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    if (acts(db).filter((a) => a.sumber === "permintaan" && lower(a.request_by) === name.toLowerCase() && s(a.created_at) > hourAgo).length >= 5) {
      fail("Terlalu banyak permintaan dalam 1 jam. Hubungi admin GA langsung.");
    }
    const match = table(db, "employees").filter((e) => lower(e.nama) === name.toLowerCase());
    const a = newActivity(db, {
      user_id: null, nama_tga: "", kategori: t(p_kategori) || "Lainnya", lokasi: t(p_lokasi).slice(0, 120),
      activity: t(p_activity).slice(0, 1000), request_by: name.slice(0, 80), requestor_id: match.length === 1 ? match[0].id : null,
      departemen: t(p_dept).slice(0, 80), request_phone: t(p_phone).slice(0, 30), status: "baru",
      prioritas: p_prioritas === "urgent" ? "urgent" : "normal", sumber: "permintaan", assigned_by: "Permintaan karyawan", assigned_at: nowIso(),
    });
    return { id: a.id, ref_no: a.ref_no };
  },

  /* ── FM Command Center (tanpa login) ── */
  tga_board: (_a, { db }) => {
    const d = todayWib();
    const m0 = monthStart(d);
    const all = acts(db);
    const a = all.filter((x) => s(x.tanggal) >= m0 || OPEN.includes(x.status));
    const inMonth = a.filter((x) => s(x.tanggal) >= m0);
    const at = (x: Row) => s(x.assigned_at ?? x.created_at);
    const technicians = table(db, "tga_users").filter((u) => u.aktif !== false).map((u) => {
      const w = all.filter((x) => x.user_id === u.id && x.status === "proses").sort((p, q) => s(q.accepted_at).localeCompare(s(p.accepted_at)))[0];
      return {
        nama: u.nama, busy: !!w, ref: w?.ref_no ?? null, activity: w?.activity ?? null, lokasi: w?.lokasi ?? null,
        kategori: w?.kategori ?? null, since: w?.accepted_at ?? null,
        done_today: all.filter((x) => x.user_id === u.id && x.status === "selesai" && x.tanggal === d).length,
        open: all.filter((x) => x.user_id === u.id && OPEN.includes(x.status)).length,
      };
    }).sort((p, q) => Number(p.busy === false) - Number(q.busy === false) || s(p.nama).localeCompare(s(q.nama)));
    const open = all.filter((x) => OPEN.includes(x.status))
      .sort((p, q) => Number(q.prioritas === "urgent") - Number(p.prioritas === "urgent") || at(p).localeCompare(at(q)))
      .map((x) => ({
        ref: x.ref_no, kategori: x.kategori, activity: s(x.activity).slice(0, 140), lokasi: x.lokasi, dept: x.departemen,
        tga: x.nama_tga, status: x.status, urgent: x.prioritas === "urgent", pool: x.user_id == null,
        at: x.assigned_at ?? x.created_at, accepted: x.accepted_at ?? null,
      }));
    const durs = inMonth
      .filter((x) => x.status === "selesai" && x.accepted_at && x.selesai_at && Date.parse(x.selesai_at) > Date.parse(x.accepted_at)
        && Date.parse(x.selesai_at) - Date.parse(x.accepted_at) < 3 * 86400000)
      .map((x) => (Date.parse(x.selesai_at) - Date.parse(x.accepted_at)) / 60000);
    const daily: Row[] = [];
    for (let g = m0; g <= d; g = addDays(g, 1)) {
      daily.push({ d: g, n: a.filter((x) => x.tanggal === g && x.status === "selesai").length, r: a.filter((x) => x.tanggal === g && x.status !== "batal").length });
    }
    const group = (rows: Row[], key: (x: Row) => string) => {
      const m = new Map<string, number>();
      rows.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1));
      return [...m].map(([k, n]) => ({ k, n })).sort((p, q) => q.n - p.n);
    };
    return {
      today: d, technicians, open,
      done_today: a.filter((x) => x.status === "selesai" && x.tanggal === d).length,
      in_today: a.filter((x) => x.status !== "batal" && x.tanggal === d).length,
      month_done: inMonth.filter((x) => x.status === "selesai").length,
      month_total: inMonth.filter((x) => x.status !== "batal").length,
      month_cancel: inMonth.filter((x) => x.status === "batal").length,
      avg_min: durs.length ? Math.round(durs.reduce((p, q) => p + q, 0) / durs.length) : null,
      daily,
      cats: group(inMonth.filter((x) => x.status !== "batal"), (x) => s(x.kategori)),
      techs_month: group(inMonth.filter((x) => x.status === "selesai"), (x) => t(x.nama_tga) || "—"),
    };
  },
};
