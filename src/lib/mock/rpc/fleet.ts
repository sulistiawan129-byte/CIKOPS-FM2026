/* MOCK BACKEND — RPC modul fleet: tugas driver, klaim, kantong, gate, snapshot
   Command Center, push driver. Logika meniru fungsi SQL (supabase/01, 02, 04)
   dan, untuk RPC yang hanya ada di produksi, kontrak yang dipakai pemanggilnya. */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  addDays, fail, monthStart, nowIso, table, todayWib, uuid, wibDate, wibIso, wibTime,
  type MockCtx, type MockDB, type Row, type RpcHandler,
} from "../core";
import { taskDetail } from "../views";

/* ── util ── */
const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v == null ? "" : String(v));
const cmp = (a: unknown, b: unknown) => { const x = str(a), y = str(b); return x < y ? -1 : x > y ? 1 : 0; };
const lower = (v: unknown) => str(v).trim().toLowerCase();

/** drivers.id milik akun login (my_driver_id() di SQL) */
function myDriver(ctx: MockCtx): Row | null {
  if (!ctx.email) return null;
  const e = lower(ctx.email);
  return table(ctx.db, "drivers").find((d) => d.aktif !== false && lower(d.email) === e) ?? null;
}
const isStaff = (ctx: MockCtx) => !!ctx.profile;
function requireStaff(ctx: MockCtx, msg = "Akses ditolak: hanya staf yang bisa melakukan ini.") {
  if (!isStaff(ctx)) fail(msg, "42501");
}
function findTask(db: MockDB, id: unknown) {
  return table(db, "tasks").find((t) => t.id === id) ?? null;
}
/** Driver hanya boleh mengubah tugasnya sendiri; staf armada boleh semua. */
function guardDriver(ctx: MockCtx, driverId: unknown) {
  const me = myDriver(ctx);
  if (me?.id !== driverId && !isStaff(ctx)) fail("Akses ditolak: tugas ini bukan milik akun Anda.", "42501");
}
const plantOrigin = (plant: unknown) => (plant === "CIK" ? "Plant Cikarang" : plant === "PRB" ? "Plant Pasar Rebo" : null);
const reviewer = (ctx: MockCtx) => str(ctx.profile?.full_name).trim() || "Admin";

/** claim_items_clean() */
function cleanItems(items: unknown): Row[] {
  if (!Array.isArray(items)) fail("Rincian klaim tidak valid.");
  const arr = items as Row[];
  if (arr.length === 0) fail("Isi minimal satu rincian.");
  if (arr.length > 30) fail("Rincian maksimal 30 baris.");
  return arr.map((it) => {
    const type = str(it?.type).trim().slice(0, 40);
    const total = Math.round(num(it?.total));
    if (!type) fail("Jenis klaim wajib diisi.");
    if (total <= 0 || total > 50000000) fail(`Nominal ${type} tidak valid.`);
    return { type, expr: str(it?.expr ?? total).slice(0, 120) || String(total), total };
  });
}
const sumItems = (items: Row[]) => items.reduce((a, x) => a + num(x.total), 0);

/* ── gate ── */
const gateFirst = (g: Row) => (g.plant === "PRB" ? g.time_in : g.time_out);
const gateDate = (g: Row) => wibDate(g.time_out ?? g.time_in ?? g.created_at);
function openGateLog(db: MockDB, vehicleId: unknown) {
  return table(db, "vehicle_gate_logs")
    .filter((g) => g.vehicle_id === vehicleId && g.status !== "DONE")
    .sort((a, b) => cmp(b.created_at, a.created_at))[0] ?? null;
}
function gateDriverName(db: MockDB, g: Row) {
  const manual = str(g.driver_name_manual).trim();
  if (manual) return manual;
  return table(db, "drivers").find((d) => d.id === g.driver_id)?.nama ?? "-";
}

/* ── task status ── */
function setStatus(ctx: MockCtx, t: Row, status: string) {
  t.status = status;
  if (status === "ON GOING") t.accepted_at = nowIso();
  if (status === "DONE") { t.completed_at = nowIso(); t.accepted_at ??= t.completed_at; }
  return taskDetail(ctx.db, t);
}

export const FLEET: Record<string, RpcHandler> = {
  /* ═════════ TUGAS — aplikasi driver ═════════ */
  accept_task(a, ctx) {
    guardDriver(ctx, a.p_driver_id);
    const t = findTask(ctx.db, a.p_task_id);
    if (!t || t.driver_id !== a.p_driver_id || t.status !== "ASSIGNED") {
      return fail("Task tidak dapat diterima (status bukan ASSIGNED atau bukan milik driver ini)");
    }
    return setStatus(ctx, t, "ON GOING");
  },

  complete_task(a, ctx) {
    guardDriver(ctx, a.p_driver_id);
    const t = findTask(ctx.db, a.p_task_id);
    if (!t || t.driver_id !== a.p_driver_id || t.status !== "ON GOING") {
      return fail("Task tidak dapat diselesaikan (status bukan ON GOING atau bukan milik driver ini)");
    }
    return setStatus(ctx, t, "DONE");
  },

  cancel_task(a, ctx) {
    guardDriver(ctx, a.p_driver_id);
    const t = findTask(ctx.db, a.p_task_id);
    if (!t || t.driver_id !== a.p_driver_id || !["ASSIGNED", "ON GOING"].includes(t.status)) {
      return fail("Task tidak dapat dibatalkan (status sudah final atau bukan milik driver ini)");
    }
    Object.assign(t, { status: "CANCELLED", cancelled_at: nowIso(), cancelled_by: "driver", cancel_reason: a.p_reason ?? null });
    return taskDetail(ctx.db, t);
  },

  /** Tutup otomatis tugas yang lewat pukul 17.00 WIB (migrasi 020). */
  auto_complete_tasks(_a, ctx) {
    const now = Date.now();
    let n = 0;
    for (const t of table(ctx.db, "tasks")) {
      if (t.status !== "ASSIGNED" && t.status !== "ON GOING") continue;
      if (!t.tanggal) continue;
      const cut = wibIso(t.tanggal, "17:00");
      if (Date.parse(cut) > now) continue;
      const acc = t.accepted_at ? Date.parse(t.accepted_at) : 0;
      t.status = "DONE";
      t.completed_at = acc > Date.parse(cut) ? t.accepted_at : cut;
      t.auto_completed = true;
      n++;
    }
    return n;
  },

  /* ═════════ TUGAS — dashboard admin ═════════ */
  admin_update_task_status(a, ctx) {
    requireStaff(ctx);
    const t = findTask(ctx.db, a.p_task_id);
    if (!t) return fail("Tugas tidak ditemukan.");
    const next = a.p_new_status;
    if (next === "ON GOING") {
      if (t.status !== "ASSIGNED") return fail("Hanya tugas berstatus ASSIGNED yang bisa dimulai.");
    } else if (next === "DONE") {
      if (t.status !== "ON GOING" && t.status !== "ASSIGNED") return fail("Tugas ini sudah selesai atau dibatalkan.");
    } else {
      return fail(`Transisi status tidak didukung: ${str(next)}`);
    }
    return setStatus(ctx, t, next);
  },

  admin_cancel_task(a, ctx) {
    requireStaff(ctx);
    const t = findTask(ctx.db, a.p_task_id);
    if (!t) return fail("Tugas tidak ditemukan.");
    if (!["ASSIGNED", "ON GOING"].includes(t.status)) return fail("Tugas ini sudah selesai atau dibatalkan.");
    Object.assign(t, { status: "CANCELLED", cancelled_at: nowIso(), cancelled_by: "admin", cancel_reason: a.p_reason ?? null });
    return taskDetail(ctx.db, t);
  },

  /** Penugasan rentang tanggal: satu tugas per hari, satu batch_id. → [{ batch_id, created_count }] */
  create_task_batch(a, ctx) {
    requireStaff(ctx);
    const from = str(a.p_date_from), to = str(a.p_date_to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return fail("Tanggal mulai/selesai wajib diisi.");
    if (to < from) return fail("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    const dates: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      dates.push(d);
      if (dates.length > 92) return fail("Rentang tanggal maksimal 92 hari.");
    }
    if (!table(ctx.db, "drivers").some((d) => d.id === a.p_driver_id)) return fail("Driver tidak ditemukan.");
    if (!table(ctx.db, "vehicles").some((v) => v.id === a.p_vehicle_id)) return fail("Kendaraan tidak ditemukan.");
    const batchId = uuid();
    const created = nowIso();
    const tasks = table(ctx.db, "tasks");
    for (const tanggal of dates) {
      tasks.push({
        id: uuid(), tanggal, driver_id: a.p_driver_id, vehicle_id: a.p_vehicle_id,
        jenis_pekerjaan: str(a.p_jenis_pekerjaan), tujuan: str(a.p_tujuan), requestor: str(a.p_requestor),
        departement: str(a.p_departement), perihal: str(a.p_perihal), status: "ASSIGNED",
        created_at: created, accepted_at: null, completed_at: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
        plant: a.p_plant ?? "CIK", lokasi_asal: plantOrigin(a.p_plant ?? "CIK"), auto_completed: false,
        batch_id: batchId, batch_total_days: dates.length,
      });
    }
    return [{ batch_id: batchId, created_count: dates.length }];
  },

  delete_task_batch(a, ctx) {
    requireStaff(ctx);
    if (!a.p_batch_id) return 0;
    const tasks = table(ctx.db, "tasks");
    const before = tasks.length;
    ctx.db.tasks = tasks.filter((t) => t.batch_id !== a.p_batch_id);
    return before - ctx.db.tasks.length;
  },

  get_task_origins(a, ctx) {
    const ids = new Set<unknown>(Array.isArray(a.p_ids) ? a.p_ids : []);
    return table(ctx.db, "tasks").filter((t) => ids.has(t.id)).map((t) => ({ id: t.id, lokasi_asal: t.lokasi_asal ?? null }));
  },

  set_task_origin_batch(a, ctx) {
    requireStaff(ctx, "Akses ditolak.");
    const asal = str(a.p_asal).trim() || null;
    let n = 0;
    for (const t of table(ctx.db, "tasks")) if (t.batch_id && t.batch_id === a.p_batch_id) { t.lokasi_asal = asal; n++; }
    return n;
  },

  /* ═════════ DRIVER ═════════ */
  admin_set_driver_pin(a, ctx) {
    requireStaff(ctx, "Only admin/GA users can set a driver PIN directly");
    if (!a.p_new_pin || str(a.p_new_pin).length < 4) return fail("PIN must be at least 4 digits");
    const d = table(ctx.db, "drivers").find((x) => x.id === a.p_driver_id);
    if (d) d.pin_hash = `mock$${str(a.p_new_pin)}`;
    return null;
  },

  get_driver_by_email(a, ctx) {
    const e = lower(a.p_email);
    if (!e) return [];
    return table(ctx.db, "drivers")
      .filter((d) => d.aktif !== false && lower(d.email) === e)
      .slice(0, 1)
      .map(({ pin_hash: _p, ...rest }) => rest);
  },

  get_driver_duty_info(a, ctx) {
    return table(ctx.db, "drivers").filter((d) => d.id === a.p_driver_id).map((d) => ({
      driver_type: d.driver_type ?? "operational", assigned_user: d.assigned_user ?? null, assigned_user_title: d.assigned_user_title ?? null,
    }));
  },

  /* ═════════ KLAIM ═════════ */
  get_claims_by_driver(a, ctx) {
    const d = table(ctx.db, "drivers").find((x) => x.id === a.p_driver_id);
    return table(ctx.db, "claims")
      .filter((c) => c.driver_id === a.p_driver_id)
      .sort((x, y) => cmp(y.submission_date, x.submission_date) || cmp(y.submitted_at, x.submitted_at))
      .map((c) => ({
        id: c.id, driver_id: c.driver_id, driver_name: d?.nama ?? "", driver_email: d?.email ?? "",
        period_date: c.period_date, submission_date: c.submission_date, items: Array.isArray(c.items) ? c.items : [],
        total: num(c.total), status: c.status, note: c.note ?? "", submitted_at: c.submitted_at, plant: c.plant ?? d?.plant ?? "CIK",
      }));
  },

  driver_claim_submit(a, ctx) {
    const me = myDriver(ctx);
    if (!me) return fail("Akun ini bukan akun driver.", "42501");
    const today = todayWib();
    const period = str(a.p_period);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || period > today || period < addDays(today, -120)) {
      return fail("Tanggal pengeluaran tidak valid (maksimal 120 hari ke belakang).");
    }
    const items = cleanItems(a.p_items);
    const fields = {
      period_date: period, items, total: sumItems(items), note: str(a.p_note).slice(0, 500),
      nota: a.p_nota === "ada" ? "ada" : "menyusul",
    };
    const reqs = table(ctx.db, "driver_claim_requests");
    if (!a.p_id) {
      const now = nowIso();
      const row = {
        id: uuid(), driver_id: me.id, ...fields, status: "menunggu", admin_note: "", claim_id: null,
        reviewed_by: "", reviewed_at: null, created_at: now, updated_at: now,
      };
      reqs.push(row);
      return row.id;
    }
    const r = reqs.find((x) => x.id === a.p_id && x.driver_id === me.id && x.status === "menunggu");
    if (!r) return fail("Pengajuan sudah diproses admin — tidak bisa diubah lagi.");
    Object.assign(r, fields, { updated_at: nowIso() });
    return r.id;
  },

  driver_claim_cancel(a, ctx) {
    const me = myDriver(ctx);
    const r = table(ctx.db, "driver_claim_requests").find((x) => x.id === a.p_id && me && x.driver_id === me.id && x.status === "menunggu");
    if (!r) return fail("Pengajuan sudah diproses admin — tidak bisa dibatalkan.");
    r.status = "dibatalkan";
    r.updated_at = nowIso();
    return null;
  },

  driver_claim_approve(a, ctx) {
    requireStaff(ctx, "Akses ditolak: akun ini tidak mengelola modul Finance.");
    const r = table(ctx.db, "driver_claim_requests").find((x) => x.id === a.p_id);
    if (!r) return fail("Pengajuan tidak ditemukan.");
    if (r.status !== "menunggu") return fail(`Pengajuan ini sudah ${r.status}.`);
    const items = cleanItems(a.p_items);
    const driverId = a.p_driver ?? r.driver_id;
    const d = table(ctx.db, "drivers").find((x) => x.id === driverId);
    const claimId = uuid();
    const now = nowIso();
    table(ctx.db, "claims").push({
      id: claimId, driver_id: driverId, submission_date: a.p_submission ?? todayWib(), period_date: a.p_period ?? r.period_date,
      items, total: sumItems(items), note: str(a.p_note), status: "submitted", submitted_at: now, plant: d?.plant ?? "CIK",
    });
    Object.assign(r, {
      status: "disetujui", claim_id: claimId, admin_note: str(a.p_admin_note).slice(0, 500),
      reviewed_by: reviewer(ctx), reviewed_at: now, updated_at: now,
    });
    return claimId;
  },

  driver_claim_reject(a, ctx) {
    requireStaff(ctx, "Akses ditolak: akun ini tidak mengelola modul Finance.");
    const reason = str(a.p_reason).trim();
    if (!reason) return fail("Alasan penolakan wajib diisi.");
    const r = table(ctx.db, "driver_claim_requests").find((x) => x.id === a.p_id && x.status === "menunggu");
    if (!r) return fail("Pengajuan sudah diproses.");
    const now = nowIso();
    Object.assign(r, { status: "ditolak", admin_note: reason.slice(0, 500), reviewed_by: reviewer(ctx), reviewed_at: now, updated_at: now });
    return null;
  },

  /* ═════════ KANTONG (Op Fund) ═════════ */
  get_current_kantong(a, ctx) {
    const rows = table(ctx.db, "kantong").filter((k) => k.plant === a.p_plant).sort((x, y) => cmp(y.period, x.period));
    return rows.slice(0, 1);
  },

  /* ═════════ GATE ═════════ */
  open_gate_checkpoint(a, ctx) {
    const v = table(ctx.db, "vehicles").find((x) => x.id === a.p_vehicle_id);
    if (!v) return fail("Kendaraan tidak ditemukan.");
    if (v.aktif === false) return fail("Kendaraan ini tidak aktif.");
    if (openGateLog(ctx.db, v.id)) {
      return fail(v.plant === "PRB"
        ? `${v.nopol} masih tercatat di dalam CIK — catat keluar dulu.`
        : `${v.nopol} masih tercatat di luar — catat kembali dulu.`);
    }
    const driverId = a.p_driver_id || null;
    const manual = str(a.p_driver_name_manual).trim() || null;
    if (!driverId && !manual) return fail("Pilih driver atau isi nama driver.");
    const ts = a.p_timestamp && !Number.isNaN(Date.parse(a.p_timestamp)) ? new Date(a.p_timestamp).toISOString() : nowIso();
    const plant = v.plant ?? "CIK";
    const row: Row = {
      id: uuid(), vehicle_id: v.id, driver_id: driverId, driver_name_manual: manual, plant, tujuan: str(a.p_tujuan),
      time_out: plant === "PRB" ? null : ts, time_in: plant === "PRB" ? ts : null,
      status: plant === "PRB" ? "IN" : "OUT", created_at: nowIso(), keterangan: null,
    };
    table(ctx.db, "vehicle_gate_logs").push(row);
    return row.id;
  },

  close_gate_checkpoint(a, ctx) {
    const g = openGateLog(ctx.db, a.p_vehicle_id);
    if (!g) return fail("Tidak ada catatan aktif untuk kendaraan ini.");
    const now = nowIso();
    if (g.plant === "PRB") g.time_out = now; else g.time_in = now;
    g.status = "DONE";
    return g.id;
  },

  set_gate_keterangan(a, ctx) {
    const g = openGateLog(ctx.db, a.p_vehicle_id);
    if (g) g.keterangan = str(a.p_keterangan).trim() || null;
    return null;
  },

  get_gate_keterangan(a, ctx) {
    const ids = new Set<unknown>(Array.isArray(a.p_ids) ? a.p_ids : []);
    return table(ctx.db, "vehicle_gate_logs")
      .filter((g) => ids.has(g.id) && g.keterangan != null)
      .map((g) => ({ id: g.id, keterangan: g.keterangan }));
  },

  /** Log gate untuk satu tanggal (WIB) + yang masih terbuka (bila tanggal = hari ini). */
  get_gate_logs_public(a, ctx) {
    const today = todayWib();
    const date = str(a.p_date) || today;
    const vehicles = table(ctx.db, "vehicles");
    return table(ctx.db, "vehicle_gate_logs")
      .filter((g) => wibDate(gateFirst(g) ?? g.created_at) === date || (date >= today && g.status !== "DONE"))
      .sort((x, y) => cmp(y.created_at, x.created_at))
      .map((g) => {
        const v = vehicles.find((x) => x.id === g.vehicle_id);
        return {
          log_id: g.id, vehicle_id: g.vehicle_id, nopol: v?.nopol ?? "-", jenis: v?.jenis ?? null, color: v?.color ?? null,
          plant: g.plant ?? v?.plant ?? "CIK", driver_name: gateDriverName(ctx.db, g), tujuan: g.tujuan ?? null,
          time_out: g.time_out ?? null, time_in: g.time_in ?? null, status: g.status, created_at: g.created_at,
        };
      });
  },

  get_active_vehicles_for_gate(_a, ctx) {
    return table(ctx.db, "vehicles")
      .filter((v) => v.aktif !== false)
      .sort((x, y) => cmp(x.plant, y.plant) || cmp(x.nopol, y.nopol))
      .map((v) => ({ id: v.id, nopol: v.nopol, jenis: v.jenis ?? "", plant: v.plant ?? "CIK", color: v.color ?? "" }));
  },

  get_active_drivers_for_gate(_a, ctx) {
    return table(ctx.db, "drivers")
      .filter((d) => d.aktif !== false)
      .sort((x, y) => cmp(x.nama, y.nama))
      .map((d) => ({ id: d.id, nama: d.nama }));
  },

  /* ═════════ COMMAND CENTER ═════════ */
  /** FM Command Center (bagian 029). */
  get_fm_snapshot(_a, ctx) {
    const db = ctx.db;
    const today = todayWib();
    const m0 = monthStart(today);
    const inMonth = (d: unknown) => !!d && str(d) >= m0 && str(d) <= today;
    const tasks = table(db, "tasks");

    // tugas per hari
    const byDay = new Map<string, { d: string; n: number; done: number; same: number }>();
    for (const t of tasks) {
      if (!inMonth(t.tanggal)) continue;
      const r = byDay.get(t.tanggal) ?? { d: t.tanggal, n: 0, done: 0, same: 0 };
      if (t.status !== "CANCELLED") r.n++;
      if (t.status === "DONE") { r.done++; if (wibDate(t.completed_at) === t.tanggal) r.same++; }
      byDay.set(t.tanggal, r);
    }
    const tasks_daily = [...byDay.values()].sort((x, y) => cmp(x.d, y.d));

    // armada
    const vehicles = table(db, "vehicles").filter((v) => v.aktif !== false).sort((x, y) => cmp(x.nopol, y.nopol)).map((v) => {
      const used = tasks.filter((t) => t.vehicle_id === v.id && inMonth(t.tanggal) && t.status !== "CANCELLED");
      return {
        nopol: v.nopol, jenis: v.jenis ?? null, plant: v.plant ?? null,
        kir: v.kir_date ?? null, stnk: v.stnk_date ?? null, service: v.service_date ?? null,
        days: new Set(used.map((t) => t.tanggal)).size, trips: used.length,
      };
    });

    // gate
    const logs = table(db, "vehicle_gate_logs");
    const gDay = new Map<string, { d: string; n: number; done: number; trips: number[] }>();
    for (const g of logs) {
      const d = gateDate(g);
      if (!d || d < m0) continue;
      const r = gDay.get(d) ?? { d, n: 0, done: 0, trips: [] };
      r.n++;
      if (g.status === "DONE") r.done++;
      if (g.time_in && g.time_out) r.trips.push(Math.abs(Date.parse(g.time_in) - Date.parse(g.time_out)) / 60000);
      gDay.set(d, r);
    }
    const gate_daily = [...gDay.values()].sort((x, y) => cmp(x.d, y.d)).map((r) => ({
      d: r.d, n: r.n, done: r.done, trip: r.trips.length ? Math.round(r.trips.reduce((s, x) => s + x, 0) / r.trips.length) : null,
    }));
    const hourOf = (iso: string) => Number(wibTime(iso)?.slice(0, 2));
    const gate_hours = {
      out: logs.filter((g) => g.time_out && wibDate(g.time_out) === today).map((g) => hourOf(g.time_out)),
      in: logs.filter((g) => g.time_in && wibDate(g.time_in) === today).map((g) => hourOf(g.time_in)),
    };
    const gate_open = logs.filter((g) => g.status !== "DONE").sort((x, y) => cmp(x.created_at, y.created_at)).map((g) => ({
      plant: g.plant, nopol: table(db, "vehicles").find((v) => v.id === g.vehicle_id)?.nopol ?? null,
      since: (g.plant === "CIK" ? g.time_out : g.time_in) ?? g.created_at,
    }));

    // kantin
    const canteen_daily = table(db, "canteen_reports").filter((c) => inMonth(c.report_date)).sort((x, y) => cmp(x.report_date, y.report_date)).map((c) => {
      const so = [1, 2, 3].map((i) => num(c[`snack_order_${i}`]));
      const sl = [1, 2, 3].map((i) => num(c[`snack_leftover_${i}`]));
      const mo = [1, 2, 3].map((i) => num(c[`meal_order_${i}`]));
      const ml = [1, 2, 3].map((i) => num(c[`meal_leftover_${i}`]));
      return { d: c.report_date, so, sl, mo, ml, o: so.map((x, i) => x + mo[i]), l: sl.map((x, i) => x + ml[i]) };
    });

    // ATK
    const reqs = table(db, "atk_requests");
    const items = table(db, "atk_items");
    const sumBy = (rows: Row[], key: (r: Row) => string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + num(r.jumlah));
      return m;
    };
    const monthReqs = reqs.filter((q) => inMonth(q.tanggal));
    const atk_daily = [...sumBy(monthReqs, (q) => str(q.tanggal))].sort((x, y) => cmp(x[0], y[0])).map(([d, n]) => ({ d, n }));
    const since30 = addDays(today, -30);
    const atk_critical = items
      .map((i) => {
        const stok = num(i.stok);
        const u30 = reqs.filter((q) => q.kode_barang === i.kode_barang && str(q.tanggal) > since30).reduce((s, q) => s + num(q.jumlah), 0);
        const rate = u30 > 0 ? stok / (u30 / 30) : null;
        return { nama: i.nama_barang, stok, satuan: str(i.satuan), u30, cover: rate === null ? null : Math.round(rate * 10) / 10, _k: stok <= 0 ? -1 : rate };
      })
      .filter((x) => x.stok <= 0 || (x._k !== null && x._k < 14))
      .sort((x, y) => (x._k ?? Infinity) - (y._k ?? Infinity))
      .slice(0, 8)
      .map(({ _k, ...rest }) => rest);
    const top6 = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => ({ k, n }));
    const atk_depts = top6(sumBy(monthReqs, (q) => str(q.departemen).trim() || "Lainnya"));
    const atk_today = top6(sumBy(reqs.filter((q) => q.tanggal === today),
      (q) => items.find((i) => i.kode_barang === q.kode_barang)?.nama_barang ?? str(q.kode_barang)));

    return {
      today, generated_at: nowIso(), tasks_daily, vehicles, gate_daily, gate_hours, gate_open,
      canteen_daily, atk_daily, atk_critical, atk_depts, atk_today,
    };
  },

  /** Command Center publik (02_peran_keamanan 4g): data ringkas tanpa HP/email/PIN. */
  get_viewonly_snapshot(_a, ctx) {
    const db = ctx.db;
    const today = todayWib();
    const tasks = table(db, "tasks")
      .filter((t) => t.tanggal === today || (str(t.tanggal) < today && (t.status === "ASSIGNED" || t.status === "ON GOING")))
      .sort((x, y) => cmp(y.created_at, x.created_at))
      .map((t) => {
        const { cancel_reason: _r, cancelled_by: _b, ...rest } = taskDetail(db, t);
        return { ...rest, requestor: str(t.requestor).split(" ")[0] };
      });
    const drivers = table(db, "drivers").filter((d) => d.aktif !== false).sort((x, y) => cmp(x.nama, y.nama)).map((d) => ({
      id: d.id, nama: d.nama, aktif: d.aktif, plant: d.plant, avatar_emoji: d.avatar_emoji, driver_type: d.driver_type ?? "operational",
      assigned_user: d.assigned_user ?? null, assigned_user_title: d.assigned_user_title ?? null,
    }));
    const vehicles = table(db, "vehicles").filter((v) => v.aktif !== false).sort((x, y) => cmp(x.nopol, y.nopol)).map((v) => ({
      id: v.id, nopol: v.nopol, jenis: v.jenis, aktif: v.aktif, plant: v.plant,
    }));
    const gate = table(db, "vehicle_gate_logs")
      .filter((g) => g.status !== "DONE" || wibDate(g.created_at) === today || wibDate(g.time_out) === today || wibDate(g.time_in) === today)
      .sort((x, y) => cmp(y.created_at, x.created_at))
      .map((g) => {
        const v = table(db, "vehicles").find((x) => x.id === g.vehicle_id);
        return {
          id: g.id, nopol: v?.nopol ?? null, jenis: v?.jenis ?? null, driver_name: gateDriverName(db, g),
          plant: g.plant, tujuan: g.tujuan ?? null, keterangan: g.keterangan ?? null,
          time_out: g.time_out ?? null, time_in: g.time_in ?? null, status: g.status, created_at: g.created_at,
        };
      });
    return { date: today, tasks, drivers, vehicles, gate };
  },

  /* ═════════ PUSH ═════════ */
  push_subscribe_driver(a, ctx) {
    const me = myDriver(ctx);
    if (!me) return fail("Akun ini tidak terhubung ke driver aktif.");
    const ep = str(a.p_endpoint);
    if (!/^https:\/\//.test(ep) && !/^fcm:[A-Za-z0-9_:.-]+$/.test(ep)) return fail("Langganan notifikasi tidak valid.");
    const subs = table(ctx.db, "push_subscriptions");
    const now = nowIso();
    const fields = { p256dh: str(a.p_p256dh), auth: str(a.p_auth), app: "driver", driver_id: me.id, tga_user_id: null, user_agent: str(a.p_ua).slice(0, 300), updated_at: now };
    const cur = subs.find((s) => s.endpoint === ep);
    if (cur) Object.assign(cur, fields);
    else subs.push({ endpoint: ep, ...fields, created_at: now });
    return true;
  },

  push_unsubscribe(a, ctx) {
    ctx.db.push_subscriptions = table(ctx.db, "push_subscriptions").filter((s) => s.endpoint !== a.p_endpoint);
    return null;
  },

  /* ═════════ lain-lain ═════════ */
  /** Laporan security G-C (skema security) — tidak ada di mockup. */
  cikops_report() {
    return null;
  },
};
