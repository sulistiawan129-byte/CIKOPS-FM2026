/* MOCK BACKEND — RPC modul facility: ATK, Locker, Gift, Printer, Receptionist,
   Cleaning & Gardening (GA). Meniru fungsi SQL di supabase/01_dasar.sql,
   02_peran_keamanan.sql & 04_aplikasi_lapangan.sql (definisi TERAKHIR yang dipakai). */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { addDays, fail, isoDow, nowIso, table, todayWib, uuid, wibDate, type MockCtx, type Row, type RpcHandler } from "../core";

/* ════════════════ helper umum ════════════════ */
const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const arr = (v: unknown): Row[] => {
  if (Array.isArray(v)) return v as Row[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d: string) => (d ? `${d.slice(8, 10)} ${MON[Number(d.slice(5, 7)) - 1] ?? ""} ${d.slice(0, 4)}` : "");
/** "8:00" / "08:00:00" → "08:00" */
const hm = (t: unknown) => { const x = s(t); if (!x) return ""; const [h, m = "00"] = x.split(":"); return `${h.padStart(2, "0")}:${m.padStart(2, "0").slice(0, 2)}`; };
const nowWibParts = () => new Date(Date.now() + 7 * 3600000).toISOString(); // "YYYY-MM-DDTHH:MM:SS…" dalam WIB
const randHex = (n: number) => uuid().replace(/-/g, "").slice(0, n);
/** Ganti isi tabel DI TEMPAT (referensi array tetap sama). */
function setRows(db: MockCtx["db"], name: string, rows: Row[]) {
  const t = table(db, name);
  if (rows === t) return;
  const copy = rows.slice();
  t.length = 0;
  for (const r of copy) t.push(r);
}

function staffCan(ctx: MockCtx, mod: string): boolean {
  const role = s(ctx.profile?.role);
  if (ctx.profile?.is_master_admin) return true;
  switch (role) {
    case "master": case "admin": case "ga": return true;
    case "admin_ga_cik": return ["fleet", "finance", "facility", "receptionist", "masterdata", "calendar", "general"].includes(mod);
    case "admin_ga_prb": return ["fleet", "masterdata", "calendar", "general"].includes(mod);
    case "admin_iss": return ["iss", "general"].includes(mod);
    case "admin_security": return ["security", "general"].includes(mod);
    case "receptionist": return ["receptionist", "calendar", "general"].includes(mod);
    default: return false;
  }
}
const isAdmin = (ctx: MockCtx) => !!ctx.profile && (["admin", "master"].includes(s(ctx.profile.role)) || !!ctx.profile.is_master_admin);
const staffName = (ctx: MockCtx) => s(ctx.profile?.full_name) || "Admin";
function requireStaff(ctx: MockCtx, mod: string, msg: string): string {
  if (!ctx.profile) fail("Akses ditolak: akun tidak terdaftar di CIKOPS.", "42501");
  if (!staffCan(ctx, mod)) fail(msg, "42501");
  return staffName(ctx);
}

/* ════════════════ ATK ════════════════ */
const atkStaff = (ctx: MockCtx) => requireStaff(ctx, "facility", "Akses ditolak: akun ini tidak mengelola modul ATK.");
function atkConfig(ctx: MockCtx): Row {
  const t = table(ctx.db, "atk_sync_config");
  let c = t.find((r) => r.id === 1);
  if (!c) { c = { id: 1, sync_key: randHex(32), last_push_at: null, last_pull_at: null, last_pull_count: 0 }; t.push(c); }
  return c;
}
function atkNewId(ctx: MockCtx, prefix: string, tanggal: string, tbl: "req" | "rst"): string {
  const w = nowWibParts();
  const hms = w.slice(11, 19).replace(/:/g, "");
  const rows = table(ctx.db, tbl === "req" ? "atk_requests" : "atk_restocks");
  const col = tbl === "req" ? "request_id" : "update_id";
  for (;;) {
    const v = `${prefix}-${tanggal.replace(/-/g, "")}${hms}-W${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
    if (!rows.some((r) => r[col] === v)) return v;
  }
}
/** Gabungkan baris p_items per kode: [{kode, jumlah}] */
function groupItems(items: unknown): { kode: string; jumlah: number }[] {
  const m = new Map<string, number>();
  for (const x of arr(items)) {
    const k = s(x.kode);
    const j = x.jumlah == null || x.jumlah === "" ? NaN : Number(x.jumlah);
    m.set(k, (m.has(k) ? m.get(k)! : 0) + j);
  }
  return [...m.entries()].map(([kode, jumlah]) => ({ kode, jumlah }));
}
function atkRestock(ctx: MockCtx, by: string, a: Row): string {
  const items = arr(a.p_items);
  if (!items.length) fail("Pilih minimal 1 barang.");
  const tanggal = s(a.p_tanggal) || todayWib();
  const id = atkNewId(ctx, "UPD", tanggal, "rst");
  const itemsT = table(ctx.db, "atk_items");
  const lines = groupItems(items);
  // validasi dulu (transaksi: semua atau tidak sama sekali)
  for (const r of lines) {
    if (!Number.isFinite(r.jumlah) || r.jumlah <= 0) fail(`Jumlah untuk ${r.kode} harus lebih dari 0.`);
    if (!itemsT.some((i) => i.kode_barang === r.kode)) fail(`Barang ${r.kode} tidak ditemukan.`);
  }
  const now = nowIso();
  for (const r of lines) {
    const it = itemsT.find((i) => i.kode_barang === r.kode)!;
    table(ctx.db, "atk_restocks").push({
      id: uuid(), update_id: id, tanggal, nama: s(a.p_nama) || by, nik: s(a.p_nik), departemen: s(a.p_departemen),
      kode_barang: it.kode_barang, nama_barang: it.nama_barang, jumlah: r.jumlah, satuan: it.satuan ?? "", created_at: now,
      source: "web", excel_pulled_at: null, created_by: by,
    });
    it.stok = num(it.stok) + r.jumlah; it.updated_at = now;
  }
  return id;
}

const ATK: Record<string, RpcHandler> = {
  atk_web_request(a, ctx) {
    const by = atkStaff(ctx);
    if (!s(a.p_nama)) fail("Nama pemohon wajib diisi.");
    if (!arr(a.p_items).length) fail("Pilih minimal 1 barang.");
    const tanggal = s(a.p_tanggal) || todayWib();
    const id = atkNewId(ctx, "REQ", tanggal, "req");
    const itemsT = table(ctx.db, "atk_items");
    const lines = groupItems(a.p_items);
    for (const r of lines) {
      if (!Number.isFinite(r.jumlah) || r.jumlah <= 0) fail(`Jumlah untuk ${r.kode} harus lebih dari 0.`);
      const it = itemsT.find((i) => i.kode_barang === r.kode);
      if (!it) fail(`Barang ${r.kode} tidak ditemukan.`);
      if (num(it!.stok) < r.jumlah) fail(`Stok ${it!.nama_barang} tidak cukup (sisa ${num(it!.stok)}, diminta ${r.jumlah}).`);
    }
    const now = nowIso();
    for (const r of lines) {
      const it = itemsT.find((i) => i.kode_barang === r.kode)!;
      table(ctx.db, "atk_requests").push({
        id: uuid(), request_id: id, tanggal, nama: s(a.p_nama), nik: s(a.p_nik), departemen: s(a.p_departemen),
        kode_barang: it.kode_barang, nama_barang: it.nama_barang, jumlah: r.jumlah, satuan: it.satuan ?? "", created_at: now,
        helper: s(a.p_helper), source: "web", excel_pulled_at: null, created_by: by,
      });
      it.stok = num(it.stok) - r.jumlah; it.updated_at = now;
    }
    return id;
  },
  atk_web_restock(a, ctx) {
    return atkRestock(ctx, atkStaff(ctx), a);
  },
  atk_web_add_item(a, ctx) {
    const by = atkStaff(ctx);
    const kode = s(a.p_kode).toUpperCase();
    const nama = s(a.p_nama);
    if (!kode || !nama) fail("Kode dan nama barang wajib diisi.");
    const itemsT = table(ctx.db, "atk_items");
    if (itemsT.some((i) => s(i.kode_barang).toUpperCase() === kode)) fail(`Kode ${kode} sudah dipakai.`);
    if (itemsT.some((i) => s(i.nama_barang).toLowerCase() === nama.toLowerCase())) fail(`Nama barang "${nama}" sudah ada.`);
    itemsT.push({
      id: uuid(), kode_barang: kode, nama_barang: nama, satuan: s(a.p_satuan), stok: 0,
      min_stok: Math.max(a.p_min_stok == null ? 5 : num(a.p_min_stok, 5), 0), source: "web", excel_pulled_at: null,
      created_by: by, created_at: nowIso(), updated_at: nowIso(),
    });
    if (num(a.p_stok_awal) > 0) {
      atkRestock(ctx, by, { p_tanggal: todayWib(), p_nama: by, p_nik: "", p_departemen: "Stok awal", p_items: [{ kode, jumlah: num(a.p_stok_awal) }] });
    }
    return kode;
  },
  atk_web_set_min_stok(a, ctx) {
    atkStaff(ctx);
    const it = table(ctx.db, "atk_items").find((i) => i.kode_barang === a.p_kode);
    if (!it) fail(`Barang ${a.p_kode} tidak ditemukan.`);
    it!.min_stok = Math.max(num(a.p_min), 0);
    return null;
  },
  atk_web_cancel(a, ctx) {
    atkStaff(ctx);
    const ref = s(a.p_ref);
    const itemsT = table(ctx.db, "atk_items");
    const sumBy = (rows: Row[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => m.set(r.kode_barang, (m.get(r.kode_barang) ?? 0) + num(r.jumlah)));
      return m;
    };
    let n = 0;
    if (a.p_kind === "request") {
      const t = table(ctx.db, "atk_requests");
      const rows = t.filter((r) => r.request_id === ref);
      if (rows.some((r) => r.source !== "web" || r.excel_pulled_at)) fail("Transaksi ini sudah ada di Excel — batalkan/koreksi dari Excel.");
      for (const [kode, j] of sumBy(rows)) {
        const it = itemsT.find((i) => i.kode_barang === kode);
        if (it) { it.stok = num(it.stok) + j; it.updated_at = nowIso(); }
      }
      n = rows.length;
      setRows(ctx.db, "atk_requests", t.filter((r) => r.request_id !== ref));
    } else if (a.p_kind === "restock") {
      const t = table(ctx.db, "atk_restocks");
      const rows = t.filter((r) => r.update_id === ref);
      if (rows.some((r) => r.source !== "web" || r.excel_pulled_at)) fail("Transaksi ini sudah ada di Excel — batalkan/koreksi dari Excel.");
      const sums = sumBy(rows);
      for (const [kode, j] of sums) {
        const it = itemsT.find((i) => i.kode_barang === kode);
        if (it && num(it.stok) < j) fail(`Tidak bisa dibatalkan: stok ${it.nama_barang} tinggal ${num(it.stok)}, sudah terpakai.`);
      }
      for (const [kode, j] of sums) {
        const it = itemsT.find((i) => i.kode_barang === kode);
        if (it) { it.stok = num(it.stok) - j; it.updated_at = nowIso(); }
      }
      n = rows.length;
      setRows(ctx.db, "atk_restocks", t.filter((r) => r.update_id !== ref));
    } else {
      fail("Jenis transaksi tidak dikenal.");
    }
    if (n === 0) fail(`Transaksi ${ref} tidak ditemukan.`);
    return n;
  },
  atk_sync_status(_a, ctx) {
    atkStaff(ctx);
    const c = atkConfig(ctx);
    const admin = isAdmin(ctx);
    const pend = (rows: Row[], col: string) => new Set(rows.filter((r) => r.source === "web" && !r.excel_pulled_at).map((r) => r[col])).size;
    return {
      pending_requests: pend(table(ctx.db, "atk_requests"), "request_id"),
      pending_restocks: pend(table(ctx.db, "atk_restocks"), "update_id"),
      pending_items: table(ctx.db, "atk_items").filter((r) => r.source === "web" && !r.excel_pulled_at).length,
      last_push_at: c.last_push_at ?? null, last_pull_at: c.last_pull_at ?? null, last_pull_count: c.last_pull_count ?? 0,
      is_admin: admin, sync_key: admin ? c.sync_key ?? null : null,
    };
  },
  atk_rotate_sync_key(_a, ctx) {
    if (!isAdmin(ctx)) fail("Hanya admin yang bisa mengganti kunci sinkron.", "42501");
    const v = randHex(32);
    atkConfig(ctx).sync_key = v;
    return v;
  },
};

/* ════════════════ LOCKER (fungsi produksi — kontrak dari src/lib/lockerApi.ts) ════════════════ */
const lockers = (ctx: MockCtx) => table(ctx.db, "lockers");
const sortedLockers = (ctx: MockCtx) => [...lockers(ctx)].sort((x, y) => num(x.row_no) - num(y.row_no) || s(x.number).localeCompare(s(y.number), undefined, { numeric: true }));
function releaseRow(l: Row, source: string) {
  return { locker_number: l.number, nama: l.nama ?? null, email: l.email ?? null, extra: l.extra ?? null, periode: l.periode ?? null, source, pin: l.pin ?? null };
}
/** Kosongkan locker. PIN tetap (nilai aktual locker fisik), disalin ke prev_pin untuk referensi. */
function doRelease(l: Row, source: string) {
  const out = releaseRow(l, source);
  Object.assign(l, {
    status: "Available", prev_pin: l.pin, nama: null, no_hp: null, email: null, periode: null, extra: null,
    end_date: null, last_confirmed: null, confirm_token: null, confirm_sent_at: null,
  });
  return out;
}
function newLockerPin(ctx: MockCtx): string {
  const used = new Set(lockers(ctx).map((l) => s(l.pin)));
  for (let i = 0; i < 10000; i++) {
    const p = String(1000 + Math.floor(Math.random() * 9000));
    if (!used.has(p)) return p;
  }
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
}
function findByNumberPin(ctx: MockCtx, number: unknown, pin: unknown): Row {
  const l = lockers(ctx).find((x) => s(x.number) === s(number));
  if (!l || s(l.pin) !== s(pin)) fail("Nomor locker atau PIN salah.");
  if (l!.status !== "Terisi") fail(`Locker ${l!.number} sedang tidak dipakai.`);
  return l!;
}
const isRecipient = (l: Row) => l.status === "Terisi" && s(l.email).includes("@");

const LOCKER: Record<string, RpcHandler> = {
  generate_unique_locker_pin(_a, ctx) {
    return newLockerPin(ctx);
  },
  register_locker(a, ctx) {
    if (!s(a.p_nama)) fail("Nama wajib diisi.");
    const l = sortedLockers(ctx).find((x) => x.status === "Available");
    if (!l) return [];
    if (!s(l.pin)) l.pin = newLockerPin(ctx);
    Object.assign(l, {
      status: "Terisi", nama: s(a.p_nama), no_hp: s(a.p_no_hp) || null, email: s(a.p_email).toLowerCase() || null,
      periode: s(a.p_periode) || null, extra: s(a.p_extra) || null, end_date: s(a.p_tanggal_selesai) || null,
      last_confirmed: todayWib(), confirm_token: null,
    });
    return [{ locker_number: l.number, pin: l.pin, periode: l.periode ?? "" }];
  },
  verify_locker_release(a, ctx) {
    const l = findByNumberPin(ctx, a.p_number, a.p_pin);
    return [{ locker_number: l.number, nama: l.nama ?? "", extra: l.extra ?? "", periode: l.periode ?? "" }];
  },
  release_locker_by_user(a, ctx) {
    const l = lockers(ctx).find((x) => s(x.number) === s(a.p_number) && s(x.pin) === s(a.p_pin) && x.status === "Terisi");
    if (!l) return [];
    return [doRelease(l, "user")];
  },
  admin_release_locker(a, ctx) {
    requireStaff(ctx, "facility", "Akses ditolak: akun ini tidak mengelola modul Locker.");
    const l = lockers(ctx).find((x) => s(x.number) === s(a.p_number));
    if (!l) return [];
    if (l.status !== "Terisi") fail(`Locker ${l.number} sudah kosong.`);
    return [doRelease(l, "admin")];
  },
  get_confirmation_recipient_count(_a, ctx) {
    requireStaff(ctx, "facility", "Akses ditolak.");
    return lockers(ctx).filter(isRecipient).length;
  },
  start_bulk_confirmation(_a, ctx) {
    requireStaff(ctx, "facility", "Akses ditolak.");
    const now = nowIso();
    return sortedLockers(ctx).filter(isRecipient).map((l) => {
      l.confirm_token = randHex(32); l.confirm_sent_at = now;
      return { locker_number: l.number, email: l.email, nama: l.nama ?? "", extra: l.extra ?? "", periode: l.periode ?? "", token: l.confirm_token };
    });
  },
  get_locker_by_confirm_token(a, ctx) {
    const t = s(a.p_token);
    const l = t ? lockers(ctx).find((x) => x.confirm_token === t && x.status === "Terisi") : null;
    return l ? [{ locker_number: l.number, nama: l.nama ?? "" }] : [];
  },
  confirm_locker_answer(a, ctx) {
    const t = s(a.p_token);
    const l = t ? lockers(ctx).find((x) => x.confirm_token === t && x.status === "Terisi") : null;
    if (!l) fail("Link ini sudah pernah digunakan sebelumnya, atau sudah kedaluwarsa.");
    if (a.p_answer === "yes") {
      l!.last_confirmed = todayWib(); l!.confirm_token = null;
      return [{ ...releaseRow(l!, "user-confirm"), kept: true }];
    }
    if (a.p_answer !== "no") fail("Jawaban tidak valid.");
    return [{ ...doRelease(l!, "user-confirm"), kept: false }];
  },
};

/* ════════════════ GIFT ════════════════ */
const MOCK_SEED_PASSCODE = "123456";
function giftRow(ctx: MockCtx, r: Row, mask = false): Row {
  const ev = table(ctx.db, "gift_events").find((e) => e.id === r.event_id);
  const nik = s(r.nik);
  return {
    id: r.id, event_id: r.event_id, event_name: ev?.name ?? "",
    nik: mask && nik.length > 4 ? "•".repeat(nik.length - 4) + nik.slice(-4) : r.nik,
    nama: r.nama, departemen: r.departemen, email: mask ? "" : r.email ?? "",
    sequence_no: r.sequence_no ?? "", lokasi_pengambilan: r.lokasi_pengambilan ?? "",
    jumlah_tiket: r.jumlah_tiket ?? null, anak_dibawah_2_tahun: r.anak_dibawah_2_tahun ?? null, status_kehadiran: r.status_kehadiran ?? null,
    selections: r.selections ?? [], claimed: !!r.claimed, claimed_at: r.claimed_at ?? null, claimed_by: r.claimed_by ?? null,
    registered_at: r.registered_at,
  };
}
const giftRegs = (ctx: MockCtx) => table(ctx.db, "gift_registrations");

const GIFT: Record<string, RpcHandler> = {
  create_gift_registration(a, ctx) {
    if (!table(ctx.db, "gift_events").some((e) => e.id === a.p_event_id && e.status === "open")) return [{ success: false, error_code: "EVENT_CLOSED" }];
    if (giftRegs(ctx).some((r) => r.event_id === a.p_event_id && s(r.nik) === s(a.p_nik))) return [{ success: false, error_code: "ALREADY_REGISTERED" }];
    giftRegs(ctx).push({
      id: uuid(), event_id: a.p_event_id, nik: s(a.p_nik), nama: s(a.p_nama), departemen: s(a.p_departemen), email: s(a.p_email).toLowerCase(),
      selections: arr(a.p_selections), passcode_hash: "mock", passcode: s(a.p_passcode),
      claimed: false, claimed_at: null, claimed_by: null, registered_at: nowIso(),
    });
    return [{ success: true, error_code: "" }];
  },
  verify_gift_passcode(a, ctx) {
    const p = s(a.p_passcode);
    if (p.replace(/\D/g, "").length < 4) fail("Passcode tidak valid.", "22023");
    const hits = giftRegs(ctx).filter((r) =>
      r.passcode != null && r.passcode !== "" ? s(r.passcode) === p : !!r.passcode_hash && p === MOCK_SEED_PASSCODE);
    // passcode seed demo cocok ke banyak baris → utamakan yang belum diambil
    hits.sort((x, y) => Number(!!x.claimed) - Number(!!y.claimed));
    table(ctx.db, "gift_verify_attempts").push({ at: nowIso(), ok: hits.length > 0 });
    return hits.map((r) => giftRow(ctx, r, true));
  },
  find_gift_registration_by_nik(a, ctx) {
    const nik = s(a.p_nik).toLowerCase();
    if (!nik) return [];
    return giftRegs(ctx).filter((r) => r.event_id === a.p_event_id && s(r.nik).toLowerCase() === nik).slice(0, 1).map((r) => giftRow(ctx, r));
  },
  find_gift_registrations_by_name(a, ctx) {
    const q = s(a.p_name).toLowerCase();
    if (q.length < 2) return [];
    return giftRegs(ctx).filter((r) => r.event_id === a.p_event_id && s(r.nama).toLowerCase().includes(q))
      .sort((x, y) => s(x.nama).localeCompare(s(y.nama))).slice(0, 50).map((r) => giftRow(ctx, r));
  },
  find_gift_registration_by_sequence_no(a, ctx) {
    const no = s(a.p_no);
    if (!no) return [];
    return giftRegs(ctx).filter((r) => r.event_id === a.p_event_id && s(r.sequence_no) === no).map((r) => giftRow(ctx, r));
  },
  claim_gift_registration(a, ctx) {
    const r = giftRegs(ctx).find((x) => x.id === a.p_id);
    if (!r || r.claimed) return false;
    r.claimed = true; r.claimed_at = nowIso(); r.claimed_by = s(a.p_claimed_by) || "Petugas";
    return true;
  },
};

/* ════════════════ PRINTER ════════════════ */
const PRINTER: Record<string, RpcHandler> = {
  get_printer_locations_public(_a, ctx) {
    const locs = new Set<string>();
    table(ctx.db, "printers").filter((p) => p.aktif !== false).forEach((p) => { const l = s(p.location); if (l) locs.add(l); });
    return [...locs].sort((x, y) => x.localeCompare(y)).map((location) => ({ location }));
  },
};

/* ════════════════ RECEPTIONIST ════════════════ */
const rcpStaff = (ctx: MockCtx) => requireStaff(ctx, "receptionist", "Akses ditolak: akun ini tidak mengelola modul Receptionist.");
const rcpIsStaff = (ctx: MockCtx) => !!ctx.profile && staffCan(ctx, "receptionist");
function rcpSettings(ctx: MockCtx): Row {
  const t = table(ctx.db, "rcp_settings");
  let st = t.find((r) => r.id === 1);
  if (!st) {
    st = {
      id: 1, open_time: "06:00:00", close_time: "22:00:00", slot_minutes: 30, room_name: "Induction Room", wifi_ssid: "",
      wifi_terms: "1. Akun hanya untuk tamu yang tercantum dan tidak boleh dibagikan.\n2. Satu akun berlaku untuk maksimal 2 perangkat.\n3. Dilarang mengakses konten ilegal atau melanggar kebijakan perusahaan.\n4. Akses berakhir otomatis pada tanggal berlaku atau saat tamu meninggalkan lokasi.",
      updated_at: nowIso(),
    };
    t.push(st);
  }
  return st;
}
function rcpNextNo(ctx: MockCtx, prefix: string): string {
  const w = nowWibParts();
  const period = w.slice(2, 4) + w.slice(5, 7);
  const t = table(ctx.db, "rcp_counters");
  let c = t.find((r) => r.prefix === prefix && r.period === period);
  if (!c) { c = { prefix, period, last: 0 }; t.push(c); }
  c.last = num(c.last) + 1;
  return `${prefix}-${period}-${String(c.last).padStart(3, "0")}`;
}
const rcpToken = () => randHex(20);
function rcpRememberContact(ctx: MockCtx, name: unknown, email: unknown, dept: unknown) {
  const n = s(name), e = s(email).toLowerCase(), d = s(dept);
  if (!n || !e || !e.includes("@")) return;
  const t = table(ctx.db, "rcp_contacts");
  const key = n.toLowerCase();
  const c = t.find((r) => r.name_key === key);
  if (c) { c.email = e; if (d) c.department = d; c.use_count = num(c.use_count) + 1; c.updated_at = nowIso(); }
  else t.push({ name_key: key, name: n, email: e, department: d, use_count: 1, updated_at: nowIso() });
  table(ctx.db, "employees").forEach((emp) => {
    if (s(emp.nama).toLowerCase() === key && !s(emp.email)) { emp.email = e; emp.updated_at = nowIso(); }
  });
}
function wifiUsed(ctx: MockCtx, accountId: string): number {
  const today = todayWib();
  return table(ctx.db, "rcp_wifi_grants")
    .filter((g) => g.account_id === accountId && !g.returned_at && s(g.end_date) >= today)
    .reduce((x, g) => x + num(g.slots), 0);
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
function wifiStatusRows(ctx: MockCtx): Row[] {
  const today = todayWib();
  return table(ctx.db, "rcp_wifi_accounts").map((a) => {
    const used = wifiUsed(ctx, a.id);
    const slots = num(a.slots, 2);
    const active = a.active !== false;
    const status = !active ? "inactive" : s(a.valid_until) < today ? "expired" : used >= slots ? "full" : used > 0 ? "partial" : "available";
    return {
      id: a.id, username: a.username, password: a.password ?? "", valid_from: a.valid_from, valid_until: a.valid_until, slots,
      used, free: Math.max(slots - used, 0), days_left: dayDiff(s(a.valid_until), today), duration_days: dayDiff(s(a.valid_until), s(a.valid_from)),
      status, batch: a.batch ?? "", notes: a.notes ?? "", active, created_at: a.created_at,
    };
  }).sort((x, y) => s(x.valid_until).localeCompare(s(y.valid_until)) || s(x.username).localeCompare(s(y.username)));
}
const agendaNotes = (b: Row) =>
  [s(b.department), b.attendees != null ? `${b.attendees} orang` : "", s(b.notes)].filter(Boolean).join(" · ");

const RECEPTIONIST: Record<string, RpcHandler> = {
  rcp_wifi_accounts_status(_a, ctx) {
    if (!rcpIsStaff(ctx)) fail("Akses ditolak.", "42501");
    return wifiStatusRows(ctx);
  },
  rcp_wifi_suggest(a, ctx) {
    if (!rcpIsStaff(ctx)) fail("Akses ditolak.", "42501");
    const end = s(a.p_end);
    const need = Math.max(num(a.p_slots, 1), 1);
    return wifiStatusRows(ctx)
      .filter((r) => (r.status === "available" || r.status === "partial") && s(r.valid_until) >= end && r.free >= need)
      .sort((x, y) => s(x.valid_until).localeCompare(s(y.valid_until)) || x.free - y.free || s(x.username).localeCompare(s(y.username)))
      .slice(0, 8)
      .map((r) => ({ id: r.id, username: r.username, valid_until: r.valid_until, free: r.free, days_left: r.days_left, duration_days: r.duration_days }));
  },
  rcp_wifi_import(a, ctx) {
    const by = rcpStaff(ctx);
    const t = table(ctx.db, "rcp_wifi_accounts");
    let created = 0, updated = 0;
    for (const r of arr(a.p_rows)) {
      const u = s(r.username);
      const vu = s(r.valid_until);
      if (!u || !vu) continue;
      const ex = t.find((x) => x.username === u);
      if (ex) {
        if (r.password != null) ex.password = r.password;
        if (r.valid_from) ex.valid_from = r.valid_from;
        ex.valid_until = vu;
        if (r.slots != null && r.slots !== "") ex.slots = num(r.slots, ex.slots);
        if (s(r.batch)) ex.batch = s(r.batch);
        if (s(r.notes)) ex.notes = s(r.notes);
        ex.active = true;
        updated++;
      } else {
        const today = todayWib();
        t.push({
          id: uuid(), username: u, password: r.password ?? "", valid_from: s(r.valid_from) || (today < vu ? today : vu), valid_until: vu,
          slots: r.slots == null || r.slots === "" ? 2 : num(r.slots, 2), batch: s(r.batch), notes: s(r.notes), active: true,
          created_by: by, created_at: nowIso(),
        });
        created++;
      }
    }
    return { created, updated };
  },
  rcp_wifi_grant(a, ctx) {
    const by = rcpStaff(ctx);
    if (!s(a.p_guest_name)) fail("Nama tamu wajib diisi.");
    if (!s(a.p_requestor_name)) fail("Nama requestor wajib diisi.");
    const start = s(a.p_start), end = s(a.p_end);
    if (!start || !end || end < start) fail("Tanggal pemakaian tidak valid.");
    if (end < todayWib()) fail("Tanggal selesai sudah lewat.");
    const acc = table(ctx.db, "rcp_wifi_accounts").find((x) => x.id === a.p_account_id);
    if (!acc || acc.active === false) fail("Akun wifi tidak ditemukan / nonaktif.");
    if (s(acc!.valid_until) < end) fail(`Akun ${acc!.username} hanya berlaku sampai ${fmtDate(s(acc!.valid_until))} — tidak cukup untuk pemakaian sampai ${fmtDate(end)}.`);
    const used = wifiUsed(ctx, acc!.id);
    const slots = Math.max(num(a.p_slots, 1), 1);
    if (used + slots > num(acc!.slots, 2)) fail(`Slot akun ${acc!.username} tidak cukup (tersisa ${Math.max(num(acc!.slots, 2) - used, 0)}).`);
    const no = rcpNextNo(ctx, "WF");
    const id = uuid();
    table(ctx.db, "rcp_wifi_grants").push({
      id, receipt_no: no, account_id: acc!.id, slots, guest_name: s(a.p_guest_name), guest_company: s(a.p_guest_company),
      requestor_name: s(a.p_requestor_name), requestor_email: s(a.p_requestor_email).toLowerCase(), department: s(a.p_department),
      line_manager: s(a.p_line_manager), purpose: s(a.p_purpose), start_date: start, end_date: end, returned_at: null, return_note: "",
      email_sent_at: null, created_by: by, created_at: nowIso(), share_token: rcpToken(),
    });
    rcpRememberContact(ctx, a.p_requestor_name, a.p_requestor_email, a.p_department);
    return { id, receipt_no: no, username: acc!.username, password: acc!.password ?? "", start_date: start, end_date: end, account_valid_until: acc!.valid_until };
  },
  rcp_wifi_return(a, ctx) {
    rcpStaff(ctx);
    const g = table(ctx.db, "rcp_wifi_grants").find((x) => x.id === a.p_grant_id && !x.returned_at);
    if (g) { g.returned_at = nowIso(); g.return_note = s(a.p_note); }
    return null;
  },
  rcp_parcel_create(a, ctx) {
    const by = rcpStaff(ctx);
    const dir = s(a.p_direction);
    if (dir !== "in" && dir !== "out") fail("Arah barang tidak valid.");
    if (!s(a.p_recipient) && !s(a.p_sender)) fail("Isi dari / untuk siapa.");
    const no = rcpNextNo(ctx, dir === "in" ? "IN" : "OUT");
    const id = uuid();
    table(ctx.db, "rcp_parcels").push({
      id, receipt_no: no, direction: dir, item_type: s(a.p_item_type) || "Paket", description: s(a.p_description), sender: s(a.p_sender),
      recipient: s(a.p_recipient), department: s(a.p_department), email: s(a.p_email).toLowerCase(), courier: s(a.p_courier),
      status: "waiting", handed_to: "", handed_at: null, handed_by: "", notified_at: null, created_by: by, created_at: nowIso(), share_token: rcpToken(),
    });
    rcpRememberContact(ctx, dir === "in" ? a.p_recipient : a.p_sender, a.p_email, a.p_department);
    return { id, receipt_no: no };
  },
  rcp_parcel_handover(a, ctx) {
    const by = rcpStaff(ctx);
    if (!s(a.p_handed_to)) fail("Nama pengambil wajib diisi.");
    const p = table(ctx.db, "rcp_parcels").find((x) => x.id === a.p_id && x.status === "waiting");
    if (!p) fail("Barang sudah diserahkan atau tidak ditemukan.");
    Object.assign(p!, { status: "handed", handed_to: s(a.p_handed_to), handed_at: nowIso(), handed_by: by });
    return null;
  },
  rcp_room_book(a, ctx) {
    const by = rcpStaff(ctx);
    const title = s(a.p_title);
    if (!title) fail("Judul / keperluan wajib diisi.");
    const rows = arr(a.p_rows);
    if (!rows.length) fail("Pilih minimal 1 jadwal.");
    const st = rcpSettings(ctx);
    const room = s(st.room_name) || "Induction Room";
    const open = hm(st.open_time) || "06:00", close = hm(st.close_time) || "22:00";
    const series = rows.length > 1 ? uuid() : null;
    const bookings = table(ctx.db, "rcp_room_bookings");
    const sorted = [...rows].sort((x, y) => s(x.date).localeCompare(s(y.date)) || hm(x.start).localeCompare(hm(y.start)));
    const skipped: { date: string; reason: string }[] = [];
    const toInsert: Row[] = [];
    let first: string | null = null;
    for (const r of sorted) {
      const date = s(r.date), start = hm(r.start), end = hm(r.end);
      try {
        if (!date || !start || !end) fail("Jadwal tidak lengkap.");
        if (end <= start) fail("Jam selesai harus setelah jam mulai.");
        if (start < open || end > close) fail(`Di luar jam operasional (${open} – ${close}).`);
        const c = [...bookings, ...toInsert].find((b) => b.room === room && b.booking_date === date && hm(b.start_time) < end && start < hm(b.end_time));
        if (c) fail(`Bentrok dengan "${c.title}" pada ${fmtDate(date)} (${hm(c.start_time)} – ${hm(c.end_time)}).`, "23P01");
        const id = uuid();
        toInsert.push({
          id, room, booking_date: date, start_time: `${start}:00`, end_time: `${end}:00`, title, pic_name: s(a.p_pic), pic_email: s(a.p_email).toLowerCase(),
          department: s(a.p_department), attendees: a.p_attendees == null || a.p_attendees === "" ? null : num(a.p_attendees), notes: s(a.p_notes),
          series_id: series, created_by: by, created_at: nowIso(), share_token: rcpToken(), receipt_no: null,
        });
        first ??= id;
      } catch (e) {
        if (!a.p_skip_conflicts) throw e;
        skipped.push({ date, reason: (e as Error).message });
      }
    }
    // semua lolos (atau yang bentrok dilewati) → simpan + nomor + agenda (trigger rcp_room_sync_agenda)
    const agenda = table(ctx.db, "agenda_events");
    for (const b of toInsert) {
      b.receipt_no = rcpNextNo(ctx, "BK");
      bookings.push(b);
      agenda.push({
        id: uuid(), title: b.title, location: b.room, event_date: b.booking_date, event_time: hm(b.start_time), end_time: hm(b.end_time),
        color: "green", kategori: "pelatihan", notes: agendaNotes(b), pic: b.pic_name, created_by: b.created_by, rcp_booking_id: b.id,
        task_id: null, created_at: nowIso(), updated_at: null,
      });
    }
    rcpRememberContact(ctx, a.p_pic, a.p_email, a.p_department);
    return { created: toInsert.length, skipped, series_id: series, first_id: first };
  },
  rcp_receipt(a, ctx) {
    const tk = s(a.p_token);
    if (tk.length < 16) return null;
    const st = rcpSettings(ctx);
    const today = todayWib();
    const g = table(ctx.db, "rcp_wifi_grants").find((x) => x.share_token === tk);
    if (g) {
      const acc = table(ctx.db, "rcp_wifi_accounts").find((x) => x.id === g.account_id);
      if (acc) {
        const live = !g.returned_at && s(g.end_date) >= today;
        return {
          kind: "wifi", receipt_no: g.receipt_no, created_at: g.created_at, created_by: g.created_by, guest_name: g.guest_name,
          guest_company: g.guest_company, requestor_name: g.requestor_name, department: g.department, purpose: g.purpose, slots: g.slots,
          start_date: g.start_date, end_date: g.end_date, returned_at: g.returned_at ?? null,
          status: g.returned_at ? "returned" : s(g.end_date) < today ? "ended" : "active",
          username: acc.username, password: live ? acc.password : null, ssid: st.wifi_ssid ?? "", terms: st.wifi_terms ?? "",
        };
      }
    }
    const p = table(ctx.db, "rcp_parcels").find((x) => x.share_token === tk);
    if (p) {
      return {
        kind: "parcel", receipt_no: p.receipt_no, created_at: p.created_at, created_by: p.created_by, direction: p.direction, item_type: p.item_type,
        description: p.description, sender: p.sender, recipient: p.recipient, department: p.department, courier: p.courier,
        status: p.status, handed_to: p.handed_to, handed_at: p.handed_at ?? null,
      };
    }
    const b = table(ctx.db, "rcp_room_bookings").find((x) => x.share_token === tk);
    if (b) {
      let series: Row | null = null;
      if (b.series_id) {
        const ss = table(ctx.db, "rcp_room_bookings").filter((x) => x.series_id === b.series_id).map((x) => s(x.booking_date)).sort();
        series = { count: ss.length, first: ss[0], last: ss[ss.length - 1] };
      }
      return {
        kind: "booking", receipt_no: b.receipt_no, created_at: b.created_at, created_by: b.created_by, room: b.room, date: b.booking_date,
        start: hm(b.start_time), end: hm(b.end_time), title: b.title, pic: b.pic_name, department: b.department, attendees: b.attendees ?? null,
        notes: b.notes, status: s(b.booking_date) < today ? "done" : "confirmed", series,
      };
    }
    return null;
  },
  rcp_board(_a, ctx) {
    const today = todayWib();
    const live = table(ctx.db, "rcp_wifi_accounts").filter((x) => x.active !== false && s(x.valid_until) >= today);
    const parcels = table(ctx.db, "rcp_parcels");
    const twoDaysAgo = Date.now() - 2 * 86400000;
    const waiting = parcels.filter((p) => p.status === "waiting");
    const week = addDays(today, 6);
    const rb = table(ctx.db, "rcp_room_bookings");
    return {
      today,
      wifi: {
        accounts: live.length,
        slots: live.reduce((x, r) => x + num(r.slots, 2), 0),
        used: live.reduce((x, r) => x + Math.min(wifiUsed(ctx, r.id), num(r.slots, 2)), 0),
        expiring7: live.filter((r) => s(r.valid_until) <= addDays(today, 7)).length,
        guests_today: table(ctx.db, "rcp_wifi_grants").filter((g) => wibDate(g.created_at) === today).length,
      },
      parcels: {
        waiting: waiting.length,
        waiting_in: waiting.filter((p) => p.direction === "in").length,
        waiting_out: waiting.filter((p) => p.direction === "out").length,
        waiting_old: waiting.filter((p) => Date.parse(p.created_at) < twoDaysAgo).length,
        in_today: parcels.filter((p) => wibDate(p.created_at) === today).length,
        handed_today: parcels.filter((p) => p.handed_at && wibDate(p.handed_at) === today).length,
      },
      bookings: rb.filter((b) => b.booking_date === today).sort((x, y) => s(x.start_time).localeCompare(s(y.start_time)))
        .map((b) => ({ start: hm(b.start_time), end: hm(b.end_time), title: b.title, attendees: b.attendees ?? null })),
      bookings_week: rb.filter((b) => s(b.booking_date) >= today && s(b.booking_date) <= week).length,
    };
  },
};

/* ════════════════ CLEANING & GARDENING (GA) ════════════════ */
const gaStaff = (ctx: MockCtx) => {
  if (!ctx.profile || !staffCan(ctx, "iss")) fail("Akses ditolak: akun ini tidak mengelola modul Cleaning & Gardening.", "42501");
  return s(ctx.profile!.full_name) || "Admin GA";
};
function gaConfig(ctx: MockCtx): Row {
  const t = table(ctx.db, "ga_sync_config");
  let c = t.find((r) => r.id === 1);
  if (!c) {
    // demo: CIKOPS langsung jadi sumber utama supaya input/generate/reset bisa dicoba
    c = { id: 1, sync_key: randHex(32), last_sync_at: null, last_computer: null, last_plan_at: null, last_master_at: null, last_logs_at: null,
      last_summary: null, master: "cikops", master_since: nowIso(), last_pull_at: null, last_pull_computer: null };
    t.push(c);
  }
  return c;
}
const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const gaDayNo = (p: unknown): number | null => {
  const k = s(p).replace(/['’]/g, "").toLowerCase();
  const i = DAY_NAMES.findIndex((d) => d.toLowerCase() === k);
  return i < 0 ? null : i + 1;
};
const gaDayName = (n: number) => DAY_NAMES[n - 1] ?? "";
const gaWeekOfMonth = (d: string) => Math.floor((Number(d.slice(8, 10)) + isoDow(`${d.slice(0, 8)}01`) - 2) / 7) + 1;
const jobDays = (hari: unknown) => new Set(s(hari).split(",").map(gaDayNo).filter((x): x is number => x != null));
function periodRange(p: unknown): { first: string; last: string; periode: number } {
  const periode = Math.trunc(num(p, NaN));
  if (!Number.isFinite(periode) || periode < 200001 || periode % 100 < 1 || periode % 100 > 12) fail("Periode tidak valid.");
  const y = Math.floor(periode / 100), m = periode % 100;
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last, periode };
}
/** Insert jadwal (ga_plan) untuk job aktif dalam rentang [from, to]; key yang sudah ada dilewati. */
function gaInsertPlan(ctx: MockCtx, periode: number, from: string, to: string, tim: string): number {
  const plan = table(ctx.db, "ga_plan");
  const keys = new Set(plan.map((g) => g.key));
  const jobs = table(ctx.db, "ga_jobs").filter((j) => j.aktif !== false && (!tim || s(j.tim).toLowerCase() === tim.toLowerCase()));
  const now = nowIso();
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = isoDow(d);
    for (const j of jobs) {
      if (!jobDays(j.hari).has(dow)) continue;
      const key = `${j.id}|${d.replace(/-/g, "")}`;
      if (keys.has(key)) continue;
      keys.add(key);
      plan.push({
        key, periode, tanggal: d, hari: gaDayName(dow), minggu_ke: gaWeekOfMonth(d), job_id: j.id, tim: j.tim, lokasi: j.lokasi, tipe: j.tipe,
        area: j.area, frek: j.frek, petugas: j.petugas, plan: 1, actual: null, spv: "", waktu_input: null, sync_id: "cikops", synced_at: now,
      });
      n++;
    }
  }
  return n;
}
function gaResetGuard(ctx: MockCtx): string {
  if (!ctx.profile || !staffCan(ctx, "iss")) fail("Akses ditolak — khusus Admin ISS / Master.", "42501");
  if (gaConfig(ctx).master !== "cikops") fail("Reset hanya bisa saat CIKOPS sumber utama (mode Excel: data akan tertimpa sinkron Excel).");
  return gaStaff(ctx);
}
const nextBigId = (rows: Row[]) => rows.reduce((m, r) => Math.max(m, num(r.id)), 0) + 1;
const LOG_TABLES: Record<string, string> = { events: "ga_events", improvements: "ga_improvements", inventory: "ga_inventory" };
const gaDate = (v: unknown) => { const x = s(v); return /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null; };
const frekOf = (n: number) => (n === 1 ? "W" : `${n}W`);

const GA: Record<string, RpcHandler> = {
  ga_sync_status(_a, ctx) {
    if (!ctx.profile) fail("Akses ditolak.", "42501");
    const c = gaConfig(ctx);
    const admin = isAdmin(ctx);
    return {
      last_sync_at: c.last_sync_at ?? null, last_computer: c.last_computer ?? null, last_plan_at: c.last_plan_at ?? null,
      last_master_at: c.last_master_at ?? null, last_logs_at: c.last_logs_at ?? null,
      jobs: table(ctx.db, "ga_jobs").length, plan: table(ctx.db, "ga_plan").length,
      is_admin: admin, sync_key: admin ? c.sync_key ?? null : null,
      master: c.master ?? "excel", master_since: c.master_since ?? null, last_pull_at: c.last_pull_at ?? null, last_pull_computer: c.last_pull_computer ?? null,
    };
  },
  ga_rotate_sync_key(_a, ctx) {
    if (!isAdmin(ctx)) fail("Hanya admin yang bisa mengganti kunci sinkron.", "42501");
    const v = randHex(32);
    gaConfig(ctx).sync_key = v;
    return v;
  },
  ga_set_master(a, ctx) {
    if (!isAdmin(ctx)) fail("Hanya admin yang bisa mengganti sumber data.", "42501");
    if (a.p_mode !== "excel" && a.p_mode !== "cikops") fail("Mode tidak dikenal.");
    const c = gaConfig(ctx);
    c.master = a.p_mode; c.master_since = nowIso();
    return { master: a.p_mode };
  },
  ga_save_job(a, ctx) {
    const by = gaStaff(ctx);
    const d: Row = a.p_data ?? {};
    if (!s(d.tim)) fail("Tim wajib diisi.");
    if (!s(d.tipe)) fail("Tipe pekerjaan wajib diisi.");
    const aktif = d.aktif == null ? true : d.aktif === true || d.aktif === "true";
    const hariIn: unknown[] = Array.isArray(d.hari) ? d.hari : s(d.hari).split(",");
    const days = [...new Set(hariIn.map(gaDayNo).filter((x): x is number => x != null))].sort((x, y) => x - y);
    if (aktif && days.length === 0) fail("Pilih minimal 1 hari jadwal.");
    if (days.length > 4) fail("Maksimal 4 hari per pekerjaan (sama dengan kolom Hari 1–4 di Excel). Pecah jadi 2 pekerjaan bila perlu.");
    const hari = days.map(gaDayName).join(", ");
    const frek = s(d.frek) || frekOf(days.length);
    const jobs = table(ctx.db, "ga_jobs");
    const now = nowIso();
    const fields = {
      tim: s(d.tim), lokasi: s(d.lokasi), tipe: s(d.tipe), area: s(d.area), frek, hari, petugas: s(d.petugas), aktif, catatan: s(d.catatan),
      updated_by: by, updated_at: now,
    };
    if (!s(a.p_id)) {
      let id = s(d.id).toUpperCase();
      if (!id) {
        const tl = s(d.tim).toLowerCase();
        const pre = tl === "cleaning service" ? "CS" : tl === "gardener" ? "GD" : (s(d.tim).replace(/[^A-Za-z]/g, "") + "XX").slice(0, 2).toUpperCase();
        const re = new RegExp(`^${pre}-(\\d+)$`);
        const n = jobs.reduce((m, j) => { const x = re.exec(s(j.id)); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1;
        id = `${pre}-${String(n).padStart(3, "0")}`;
      }
      if (jobs.some((j) => j.id === id)) fail(`ID ${id} sudah dipakai.`);
      const row = { id, ...fields, synced_at: now, created_at: now };
      jobs.push(row);
      return { ...row };
    }
    const j = jobs.find((x) => x.id === a.p_id);
    if (!j) fail(`Pekerjaan ${a.p_id} tidak ditemukan.`);
    Object.assign(j!, fields);
    return { ...j! };
  },
  ga_delete_job(a, ctx) {
    gaStaff(ctx);
    const today = todayWib();
    const plan = table(ctx.db, "ga_plan");
    const keep = plan.filter((g) => !(g.job_id === a.p_id && g.actual == null && s(g.tanggal) >= today));
    const n = plan.length - keep.length;
    setRows(ctx.db, "ga_plan", keep);
    setRows(ctx.db, "ga_jobs", table(ctx.db, "ga_jobs").filter((j) => j.id !== a.p_id));
    return { plan_removed: n };
  },
  ga_save_manpower(a, ctx) {
    gaStaff(ctx);
    const d: Row = a.p_data ?? {};
    if (!s(d.nama)) fail("Nama wajib diisi.");
    const t = table(ctx.db, "ga_manpower");
    const fields = {
      nama: s(d.nama), tim: s(d.tim), jabatan: s(d.jabatan), area_tugas: s(d.area_tugas), status: s(d.status) || "Aktif", no_hp: s(d.no_hp),
      updated_at: nowIso(),
    };
    if (!s(a.p_id)) {
      const n = t.reduce((m, r) => { const x = /^MP-(\d+)$/.exec(s(r.id)); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1;
      const row = { id: `MP-${String(n).padStart(3, "0")}`, ...fields, synced_at: nowIso() };
      t.push(row);
      return { ...row };
    }
    const m = t.find((r) => r.id === a.p_id);
    if (!m) fail("Manpower tidak ditemukan.");
    Object.assign(m!, fields);
    return { ...m! };
  },
  ga_delete_manpower(a, ctx) {
    gaStaff(ctx);
    setRows(ctx.db, "ga_manpower", table(ctx.db, "ga_manpower").filter((r) => r.id !== a.p_id));
    return null;
  },
  ga_generate_plan(a, ctx) {
    gaStaff(ctx);
    const { first, last, periode } = periodRange(a.p_periode);
    const pf = s(a.p_from);
    const from = pf && pf > first ? pf : first;
    let removed = 0;
    if (a.p_rebuild) {
      const plan = table(ctx.db, "ga_plan");
      const keep = plan.filter((g) => !(num(g.periode) === periode && s(g.tanggal) >= from && g.actual == null));
      removed = plan.length - keep.length;
      setRows(ctx.db, "ga_plan", keep);
    }
    const added = from <= last ? gaInsertPlan(ctx, periode, from, last, "") : 0;
    return { periode, added, removed, total: table(ctx.db, "ga_plan").filter((g) => num(g.periode) === periode).length };
  },
  ga_set_actual(a, ctx) {
    const name = gaStaff(ctx);
    const spv = s(a.p_spv) || name;
    const byKey = new Map(table(ctx.db, "ga_plan").map((g) => [g.key, g]));
    const now = nowIso();
    let n = 0;
    for (const r of arr(a.p_rows)) {
      const act = r.actual == null || r.actual === "" ? null : Number(r.actual);
      if (act !== null && act !== 0 && act !== 1) continue;
      const g = byKey.get(r.key);
      if (!g) continue;
      g.actual = act; g.spv = act === null ? "" : spv; g.waktu_input = now; g.sync_id = "cikops"; g.synced_at = now;
      n++;
    }
    return n;
  },
  ga_save_log(a, ctx) {
    const by = gaStaff(ctx);
    const tn = LOG_TABLES[s(a.p_table)];
    if (!tn) fail(`Tabel ${a.p_table} tidak dikenal.`);
    const d: Row = a.p_data ?? {};
    const t = table(ctx.db, tn);
    let fields: Row;
    if (a.p_table === "events") {
      if (!s(d.nama)) fail("Nama event wajib diisi.");
      fields = { tanggal: gaDate(d.tanggal), nama: s(d.nama), deskripsi: s(d.deskripsi), waktu: s(d.waktu), support: s(d.support), dokumentasi: s(d.dokumentasi) };
    } else if (a.p_table === "improvements") {
      if (!s(d.deskripsi)) fail("Deskripsi wajib diisi.");
      fields = {
        tanggal: gaDate(d.tanggal), kategori: s(d.kategori), jenis: s(d.jenis), deskripsi: s(d.deskripsi), area: s(d.area),
        petugas: s(d.petugas), pengawas: s(d.pengawas), dokumentasi: s(d.dokumentasi),
      };
    } else {
      if (!s(d.nama)) fail("Nama alat wajib diisi.");
      fields = {
        kode: s(d.kode), nama: s(d.nama), jenis: s(d.jenis), area: s(d.area), status: s(d.status) || "Baik", foto: s(d.foto),
        jumlah: d.jumlah == null || d.jumlah === "" ? null : num(d.jumlah), tgl_update: gaDate(d.tgl_update) ?? todayWib(),
      };
    }
    Object.assign(fields, { updated_by: by, updated_at: nowIso() });
    if (a.p_id == null || a.p_id === "") {
      const id = nextBigId(t);
      t.push({ id, baris: null, synced_at: null, ...fields });
      return id;
    }
    const row = t.find((r) => num(r.id) === num(a.p_id));
    if (!row) fail("Data tidak ditemukan.");
    Object.assign(row!, fields);
    return row!.id;
  },
  ga_delete_log(a, ctx) {
    gaStaff(ctx);
    const tn = LOG_TABLES[s(a.p_table)];
    if (!tn) fail(`Tabel ${a.p_table} tidak dikenal.`);
    setRows(ctx.db, tn, table(ctx.db, tn).filter((r) => num(r.id) !== num(a.p_id)));
    return null;
  },
  ga_reset_period(a, ctx) {
    const by = gaResetGuard(ctx);
    const mode = s(a.p_mode);
    if (mode !== "actual" && mode !== "plan") fail("Mode reset tidak dikenal.");
    const { first, last, periode } = periodRange(a.p_periode);
    const pf = gaDate(a.p_from), pt = gaDate(a.p_to);
    const from = pf && pf > first ? pf : first;
    const to = pt && pt < last ? pt : last;
    if (from > to) fail("Rentang tanggal tidak valid.");
    const timIn = s(a.p_tim);
    const tim = timIn === "" || timIn === "Semua" ? "" : timIn;
    const inScope = (g: Row) => num(g.periode) === periode && s(g.tanggal) >= from && s(g.tanggal) <= to && (!tim || s(g.tim).toLowerCase() === tim.toLowerCase());
    const plan = table(ctx.db, "ga_plan");
    const scope = plan.filter(inScope);
    const nRows = scope.length, nAct = scope.filter((g) => g.actual != null).length;
    if (a.p_dry_run) {
      return {
        rows: nRows, actual: nAct, from, to,
        jobs: table(ctx.db, "ga_jobs").filter((j) => j.aktif !== false && (!tim || s(j.tim).toLowerCase() === tim.toLowerCase())).length,
      };
    }
    const snapshot = scope.filter((g) => mode === "plan" || g.actual != null).map((g) => ({ ...g }));
    let added = 0;
    if (mode === "actual") {
      const now = nowIso();
      scope.filter((g) => g.actual != null).forEach((g) => { g.actual = null; g.spv = ""; g.waktu_input = null; g.sync_id = "cikops"; g.synced_at = now; });
    } else {
      setRows(ctx.db, "ga_plan", plan.filter((g) => !inScope(g)));
      added = gaInsertPlan(ctx, periode, from, to, tim);
    }
    const resets = table(ctx.db, "ga_plan_resets");
    const id = nextBigId(resets);
    resets.push({
      id, periode, mode, tim, date_from: from, date_to: to, n_rows: nRows, n_actual: nAct, n_added: added, snapshot,
      created_by: by, created_at: nowIso(), undone_at: null, undone_by: null,
    });
    // simpan 30 salinan terakhir saja
    if (resets.length > 30) {
      setRows(ctx.db, "ga_plan_resets", [...resets].sort((x, y) => s(y.created_at).localeCompare(s(x.created_at)) || num(y.id) - num(x.id)).slice(0, 30));
    }
    return { id, mode, rows: nRows, actual: nAct, added, from, to };
  },
  ga_reset_history(a, ctx) {
    if (!ctx.profile || !staffCan(ctx, "iss")) fail("Akses ditolak.", "42501");
    const p = a.p_periode == null || a.p_periode === "" ? null : num(a.p_periode);
    return table(ctx.db, "ga_plan_resets")
      .filter((r) => p == null || num(r.periode) === p)
      .sort((x, y) => s(y.created_at).localeCompare(s(x.created_at)) || num(y.id) - num(x.id))
      .map((r) => ({
        id: r.id, periode: r.periode, mode: r.mode, tim: r.tim ?? "", from: r.date_from, to: r.date_to, rows: r.n_rows, actual: r.n_actual,
        added: r.n_added, by: r.created_by, at: r.created_at, undone_at: r.undone_at ?? null, undone_by: r.undone_by ?? null,
      }));
  },
  ga_undo_reset(a, ctx) {
    const by = gaResetGuard(ctx);
    const r = table(ctx.db, "ga_plan_resets").find((x) => num(x.id) === num(a.p_id));
    if (!r) fail("Riwayat reset tidak ditemukan.");
    if (r!.undone_at) fail("Reset ini sudah dibatalkan.");
    const snap = arr(r!.snapshot);
    let n = 0;
    if (r!.mode === "actual") {
      const byKey = new Map(table(ctx.db, "ga_plan").map((g) => [g.key, g]));
      const now = nowIso();
      for (const sRow of snap) {
        const g = byKey.get(sRow.key);
        if (!g || g.actual != null) continue;   // input baru tidak ditimpa
        g.actual = sRow.actual; g.spv = sRow.spv; g.waktu_input = sRow.waktu_input; g.sync_id = "cikops"; g.synced_at = now;
        n++;
      }
    } else {
      const tim = s(r!.tim).toLowerCase();
      const keep = table(ctx.db, "ga_plan").filter((g) =>
        !(num(g.periode) === num(r!.periode) && s(g.tanggal) >= s(r!.date_from) && s(g.tanggal) <= s(r!.date_to) && (!tim || s(g.tim).toLowerCase() === tim)));
      const keys = new Set(keep.map((g) => g.key));
      for (const sRow of snap) {
        if (keys.has(sRow.key)) continue;
        keys.add(sRow.key);
        keep.push({ ...sRow });
        n++;
      }
      setRows(ctx.db, "ga_plan", keep);
    }
    r!.undone_at = nowIso(); r!.undone_by = by;
    return { restored: n, mode: r!.mode };
  },
};

export const FACILITY: Record<string, RpcHandler> = { ...ATK, ...LOCKER, ...GIFT, ...PRINTER, ...RECEPTIONIST, ...GA };
