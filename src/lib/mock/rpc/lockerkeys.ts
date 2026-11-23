/* MOCK BACKEND — modul Kunci Loker Karyawan. Meniru supabase/10_kunci_loker_karyawan.sql:
   RPC pinjam / kembali / impor + riwayat otomatis (trigger locker_keys_audit). */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fail, nowIso, table, todayWib, uuid, type MockDB, type MockCtx, type Row, type RpcHandler } from "../core";

const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const dmy = (d: unknown) => { const x = s(d); return x ? `${x.slice(8, 10)}-${x.slice(5, 7)}-${x.slice(0, 4)}` : ""; };
const join = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" · ");

function staffOk(ctx: MockCtx): boolean {
  if (ctx.profile?.is_master_admin) return true;
  return ["master", "admin", "ga", "admin_ga_cik"].includes(s(ctx.profile?.role));
}
function guard(ctx: MockCtx) {
  if (!ctx.profile || !staffOk(ctx)) fail("Akses ditolak: akun ini tidak mengelola modul Fasilitas.", "42501");
}

let skipLog = false;

/** Dipanggil query.ts setelah insert / update / delete di tabel locker_keys (pengganti trigger). */
export function lockerKeyAudit(db: MockDB, op: "insert" | "update" | "delete", before: Row | null, after: Row | null, actor: string) {
  if (skipLog) return;
  const logs = table(db, "locker_key_logs");
  const push = (r: Row, action: string, detail: string) => logs.push({ id: uuid(), locker_key_id: r.id, blok: s(r.blok), pintu: s(r.pintu), nama: s(r.nama), action, detail, actor, created_at: nowIso() });
  if (op === "insert" && after) return void push(after, "tambah", join(s(after.no_kunci) && `kunci ${s(after.no_kunci)}`, s(after.dept)));
  if (op === "delete" && before) return void push(before, "hapus", join(s(before.no_kunci) && `kunci ${s(before.no_kunci)}`, s(before.dept), s(before.status)));
  if (!before || !after) return;
  if (before.status !== "Dipinjam" && after.status === "Dipinjam") return void push(after, "pinjam", join(s(after.borrowed_by) && `oleh ${s(after.borrowed_by)}`, dmy(after.borrowed_at), s(after.keterangan)));
  if (before.status === "Dipinjam" && after.status !== "Dipinjam") return void push(after, "kembali", join(s(before.borrowed_by) && `dari ${s(before.borrowed_by)}`, before.borrowed_at ? `dipinjam ${dmy(before.borrowed_at)}` : ""));
  const parts: string[] = [];
  const diff = (k: string, label: string) => { if (s(before[k]) !== s(after[k])) parts.push(k === "keterangan" ? "keterangan diubah" : `${label}: ${s(before[k])} → ${s(after[k])}`); };
  diff("blok", "blok"); diff("pintu", "pintu"); diff("nama", "nama"); diff("nik", "NIK"); diff("dept", "dept"); diff("no_kunci", "kunci"); diff("status", "status"); diff("keterangan", "keterangan");
  if (before.slot !== after.slot) parts.push(`slot: ${before.slot ?? "-"} → ${after.slot ?? "-"}`);
  if (parts.length) push(after, "ubah", parts.join(" · "));
}

export const LOCKERKEY: Record<string, RpcHandler> = {
  locker_key_borrow: (a, ctx) => {
    guard(ctx);
    const by = s(a.p_by).slice(0, 80);
    if (!by) fail("Nama peminjam wajib diisi.");
    const t = table(ctx.db, "locker_keys");
    const row = t.find((r) => r.id === a.p_id);
    if (!row) return fail("Loker tidak ditemukan.");
    const before = { ...row };
    Object.assign(row, { status: "Dipinjam", borrowed_by: by, borrowed_at: s(a.p_date) || todayWib() });
    if (s(a.p_note)) row.keterangan = s(a.p_note).slice(0, 300);
    lockerKeyAudit(ctx.db, "update", before, row, s(ctx.profile?.full_name) || "Staf");
    return null;
  },
  locker_key_return: (a, ctx) => {
    guard(ctx);
    const row = table(ctx.db, "locker_keys").find((r) => r.id === a.p_id && r.status === "Dipinjam");
    if (!row) return fail("Kunci ini tidak sedang dipinjam.");
    const before = { ...row };
    Object.assign(row, { status: s(row.nama) ? "Terisi" : "Kosong", borrowed_by: "", borrowed_at: null });
    lockerKeyAudit(ctx.db, "update", before, row, s(ctx.profile?.full_name) || "Staf");
    return null;
  },
  locker_keys_import: (a, ctx) => {
    guard(ctx);
    const list = Array.isArray(a.p_rows) ? (a.p_rows as Row[]) : [];
    if (list.length === 0) fail("Tidak ada baris untuk diimpor.");
    const t = table(ctx.db, "locker_keys");
    const replace = a.p_replace === true;
    skipLog = true;
    try {
      const base = replace ? 0 : t.reduce((m, r) => Math.max(m, Number(r.row_no) || 0), 0);
      if (replace) t.length = 0;
      let n = 0;
      list.forEach((x, i) => {
        if (!s(x.blok)) return;
        t.push({
          id: uuid(), row_no: base + i + 1, blok: s(x.blok).slice(0, 30), slot: x.slot ? Number(x.slot) : null, pintu: s(x.pintu).slice(0, 30), nama: s(x.nama).slice(0, 120),
          nik: s(x.nik).slice(0, 30), dept: s(x.dept).slice(0, 80), no_kunci: s(x.no_kunci).slice(0, 30), status: ["Terisi", "Kosong", "Dipinjam"].includes(s(x.status)) ? s(x.status) : "Kosong",
          borrowed_by: s(x.borrowed_by).slice(0, 80), borrowed_at: null, keterangan: s(x.keterangan).slice(0, 300), created_at: nowIso(), updated_at: nowIso(),
        });
        n++;
      });
      table(ctx.db, "locker_key_logs").push({ id: uuid(), locker_key_id: null, blok: "", pintu: "", nama: "", action: "impor", detail: `${n} baris diimpor dari Excel (${replace ? "semua data lama diganti" : "ditambahkan ke data yang ada"})`, actor: s(ctx.profile?.full_name) || "Staf", created_at: nowIso() });
      return n;
    } finally { skipLog = false; }
  },
};
