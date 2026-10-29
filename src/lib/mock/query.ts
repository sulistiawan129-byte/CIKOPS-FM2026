/* MOCK BACKEND — query builder yang meniru supabase-js / PostgREST
   (select + embed, filter, order, range, insert/update/upsert/delete, count). */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { MockError, nowIso, table, uuid, type MockDB, type Row } from "./core";
import { readView, VIEWS } from "./views";

/** Relasi untuk embed `tabel(kolom…)`: "<tabel asal>.<tabel embed>" → kolom FK di tabel asal */
const REL: Record<string, string> = {
  "vehicle_gate_logs.vehicles": "vehicle_id",
  "vehicle_gate_logs.drivers": "driver_id",
  "printer_requests.printers": "printer_id",
  "gift_registrations.gift_events": "event_id",
  "rcp_wifi_grants.rcp_wifi_accounts": "account_id",
  "claims.drivers": "driver_id",
  "tasks.drivers": "driver_id",
  "tasks.vehicles": "vehicle_id",
  "overtime.drivers": "driver_id",
  "driver_claim_requests.drivers": "driver_id",
};
/** Kolom unik untuk upsert tanpa onConflict */
const PK: Record<string, string[]> = {
  app_settings: ["key"], security_config: ["key"], security_monthly: ["plant", "period"], profiles: ["id"], rcp_settings: ["id"],
  kantong: ["period", "plant"], rcp_contacts: ["name_key"], ga_jobs: ["id"], ga_manpower: ["id"], ga_plan: ["key"], atk_items: ["kode_barang"],
  push_subscriptions: ["endpoint"], tga_counters: ["period"], rcp_counters: ["prefix", "period"],
};
/** Default kolom saat insert (selain id / created_at) */
const DEFAULTS: Record<string, Row> = {
  tasks: { status: "ASSIGNED" },
  claims: { status: "submitted", note: "", items: [] },
  employee_requests: { status: "PENDING", details: {} },
  lockers: { status: "Available" },
  rcp_parcels: { status: "waiting", handed_to: "", handed_by: "" },
  drivers: { aktif: true, driver_type: "operational" },
  vehicles: { aktif: true },
  employees: { aktif: true },
  announcements: { is_active: true },
  printers: { aktif: true },
  gift_events: { status: "open", items: [] },
  driver_claim_requests: { status: "menunggu", items: [] },
  tga_activities: { status: "selesai", prioritas: "normal", sumber: "mandiri", catatan: "" },
};

/* ── util nilai ── */
const isNum = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) && !/^\d{4}-\d{2}/.test(v));
function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b) ? 0 : String(a) < String(b) ? -1 : 1;
  if (isNum(a) && isNum(b)) return Number(a) - Number(b);
  // tanggal "YYYY-MM-DD" vs timestamp ISO: bandingkan sebagai teks (format ISO bisa diurutkan)
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
const eqv = (a: unknown, b: unknown) => (a === null || a === undefined ? b === null || b === undefined || b === "null" : cmp(a, b) === 0);
const likeRe = (pat: string, ci: boolean) =>
  new RegExp("^" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", ci ? "i" : "");
const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/\\"/g, '"') : s);

type Pred = (r: Row) => boolean;
function opPred(col: string, op: string, raw: string): Pred {
  const v = unquote(raw);
  switch (op) {
    case "eq": return (r) => eqv(r[col], v);
    case "neq": return (r) => !eqv(r[col], v);
    case "gt": return (r) => r[col] != null && cmp(r[col], v) > 0;
    case "gte": return (r) => r[col] != null && cmp(r[col], v) >= 0;
    case "lt": return (r) => r[col] != null && cmp(r[col], v) < 0;
    case "lte": return (r) => r[col] != null && cmp(r[col], v) <= 0;
    case "like": return (r) => likeRe(v, false).test(String(r[col] ?? ""));
    case "ilike": return (r) => likeRe(v, true).test(String(r[col] ?? ""));
    case "is": return (r) => (v === "null" ? r[col] == null : String(r[col]) === v);
    case "in": { const list = v.replace(/^\(|\)$/g, "").split(",").map(unquote); return (r) => list.some((x) => eqv(r[col], x)); }
    default: return () => true;
  }
}
/** Pecah teks berdasarkan koma di tingkat teratas (abaikan koma dalam kurung / kutip) */
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, q = false, cur = "";
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === ",") { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** Filter teks PostgREST: "a.eq.1,b.ilike.%x%,and(c.gte.1,c.lte.2)" (untuk .or) */
function parseLogic(expr: string, mode: "or" | "and"): Pred {
  const parts = splitTop(expr).map((p): Pred => {
    const m = /^(and|or)\((.*)\)$/.exec(p);
    if (m) return parseLogic(m[2], m[1] as "and" | "or");
    const neg = p.match(/^([^.]+)\.not\.([a-z]+)\.(.*)$/);
    if (neg) { const f = opPred(neg[1], neg[2], neg[3]); return (r) => !f(r); }
    const [col, op, ...rest] = p.split(".");
    return opPred(col, op, rest.join("."));
  });
  return mode === "or" ? (r) => parts.some((f) => f(r)) : (r) => parts.every((f) => f(r));
}

/* ── select & embed ── */
interface SelSpec { all: boolean; cols: { name: string; alias: string }[]; embeds: { table: string; alias: string; spec: SelSpec; inner: boolean }[] }
function parseSelect(s: string): SelSpec {
  const spec: SelSpec = { all: false, cols: [], embeds: [] };
  for (const part0 of splitTop(s || "*")) {
    const part = part0.trim();
    if (!part) continue;
    if (part === "*") { spec.all = true; continue; }
    const em = /^(?:([a-z_0-9]+):)?([a-z_0-9]+)(?:!([a-z_0-9]+))?\((.*)\)$/i.exec(part);
    if (em) { spec.embeds.push({ alias: em[1] || em[2], table: em[2], spec: parseSelect(em[4]), inner: em[3] === "inner" }); continue; }
    const al = /^(?:([a-z_0-9]+):)?([a-z_0-9]+)(?:::[a-z]+)?$/i.exec(part);
    if (al) spec.cols.push({ alias: al[1] || al[2], name: al[2] });
  }
  return spec;
}
function project(db: MockDB, base: string, r: Row, spec: SelSpec): Row {
  const out: Row = spec.all || (!spec.cols.length && !spec.embeds.length) ? { ...r } : {};
  for (const c of spec.cols) out[c.alias] = r[c.name] ?? null;
  for (const e of spec.embeds) {
    const fk = REL[`${base}.${e.table}`];
    const src = rowsOf(db, e.table);
    if (fk) {
      const hit = src.find((x) => x.id === r[fk]);
      out[e.alias] = hit ? project(db, e.table, hit, e.spec) : null;
    } else {
      // satu-ke-banyak: tabel embed punya kolom <base singular>_id
      const back = `${base.replace(/s$/, "")}_id`;
      out[e.alias] = src.filter((x) => x[back] === r.id).map((x) => project(db, e.table, x, e.spec));
    }
  }
  return out;
}
const rowsOf = (db: MockDB, name: string): Row[] => (VIEWS[name] ? readView(db, name) : table(db, name));

/* ── builder ── */
type Action = "select" | "insert" | "update" | "upsert" | "delete";
export class MockQuery implements PromiseLike<{ data: any; error: any; count: number | null; status: number }> {
  private preds: Pred[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean; foreign?: string }[] = [];
  private lim: number | null = null;
  private from_ = 0;
  private to_: number | null = null;
  private sel: string | null = null;
  private countOpt: string | null = null;
  private head = false;
  private one: "single" | "maybe" | null = null;
  private action: Action = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] | null = null;
  private ignoreDup = false;

  constructor(private db: MockDB, private name: string, private onWrite: () => void) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.sel = cols;
    if (opts?.count) this.countOpt = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: Row | Row[]) { this.action = "insert"; this.payload = Array.isArray(v) ? v : [v]; return this; }
  upsert(v: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = "upsert"; this.payload = Array.isArray(v) ? v : [v];
    this.conflict = opts?.onConflict ? opts.onConflict.split(",").map((x) => x.trim()) : null;
    this.ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }
  update(v: Row) { this.action = "update"; this.patch = v; return this; }
  delete() { this.action = "delete"; return this; }

  eq(c: string, v: unknown) { this.preds.push((r) => eqv(r[c], v)); return this; }
  neq(c: string, v: unknown) { this.preds.push((r) => !eqv(r[c], v)); return this; }
  gt(c: string, v: unknown) { this.preds.push((r) => r[c] != null && cmp(r[c], v) > 0); return this; }
  gte(c: string, v: unknown) { this.preds.push((r) => r[c] != null && cmp(r[c], v) >= 0); return this; }
  lt(c: string, v: unknown) { this.preds.push((r) => r[c] != null && cmp(r[c], v) < 0); return this; }
  lte(c: string, v: unknown) { this.preds.push((r) => r[c] != null && cmp(r[c], v) <= 0); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.some((v) => eqv(r[c], v))); return this; }
  is(c: string, v: unknown) { this.preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  like(c: string, p: string) { this.preds.push((r) => likeRe(p, false).test(String(r[c] ?? ""))); return this; }
  ilike(c: string, p: string) { this.preds.push((r) => likeRe(p, true).test(String(r[c] ?? ""))); return this; }
  not(c: string, op: string, v: unknown) {
    const f = op === "in" ? opPred(c, "in", String(v)) : op === "is" ? opPred(c, "is", String(v)) : opPred(c, op, String(v));
    this.preds.push((r) => !f(r)); return this;
  }
  or(expr: string) { this.preds.push(parseLogic(expr, "or")); return this; }
  filter(c: string, op: string, v: unknown) { this.preds.push(opPred(c, op, String(v))); return this; }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  contains(c: string, v: unknown) {
    this.preds.push((r) => {
      const x = r[c];
      if (Array.isArray(x) && Array.isArray(v)) return v.every((y) => x.includes(y));
      if (x && typeof x === "object" && v && typeof v === "object") return Object.entries(v as Row).every(([k, y]) => (x as Row)[k] === y);
      return false;
    });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (opts?.foreignTable || opts?.referencedTable) return this; // urutan embed: diabaikan
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }
  returns() { return this; }

  then<A = any, B = never>(ok?: ((v: { data: any; error: any; count: number | null; status: number }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let res: { data: any; error: any; count: number | null; status: number };
    try { res = this.run(); }
    catch (e) {
      const err = e instanceof MockError ? { message: e.message, code: e.code, details: null, hint: null } : { message: String((e as Error)?.message ?? e), code: "XX000", details: null, hint: null };
      res = { data: null, error: err, count: null, status: 400 };
    }
    // jeda kecil seperti jaringan supaya animasi "memuat" tetap terlihat wajar
    return new Promise<typeof res>((r) => setTimeout(() => r(res), 40)).then(ok, bad);
  }

  private match_(r: Row) { return this.preds.every((p) => p(r)); }

  private run() {
    const db = this.db;
    if (VIEWS[this.name] && this.action !== "select") throw new MockError(`View ${this.name} tidak bisa diubah (mock).`);
    const rows = rowsOf(db, this.name);
    let affected: Row[] = [];
    if (this.action === "insert" || this.action === "upsert") {
      const keys = this.conflict ?? PK[this.name] ?? ["id"];
      for (const p of this.payload) {
        const hit = this.action === "upsert" ? rows.find((r) => keys.every((k) => p[k] !== undefined && eqv(r[k], p[k]))) : undefined;
        if (hit) {
          if (!this.ignoreDup) Object.assign(hit, p, "updated_at" in hit ? { updated_at: nowIso() } : {});
          affected.push(hit);
        } else {
          const row: Row = { ...(DEFAULTS[this.name] ?? {}), ...p };
          if (row.id === undefined && !PK[this.name]) row.id = uuid();
          if (row.created_at === undefined) row.created_at = nowIso();
          rows.push(row);
          affected.push(row);
        }
      }
      this.onWrite();
    } else if (this.action === "update") {
      affected = rows.filter((r) => this.match_(r));
      for (const r of affected) Object.assign(r, this.patch);
      if (affected.length) this.onWrite();
    } else if (this.action === "delete") {
      affected = rows.filter((r) => this.match_(r));
      if (affected.length) { const keep = rows.filter((r) => !affected.includes(r)); rows.length = 0; rows.push(...keep); this.onWrite(); }
    } else {
      affected = rows.filter((r) => this.match_(r));
    }

    // tulis tanpa .select() → data null (seperti supabase-js)
    if (this.action !== "select" && this.sel === null) return { data: null, error: null, count: null, status: 201 };

    let list = [...affected];
    for (const o of [...this.orders].reverse()) {
      list.sort((a, b) => {
        const x = a[o.col], y = b[o.col];
        if (x == null || y == null) { if (x == null && y == null) return 0; const nf = o.nullsFirst ?? !o.asc; return (x == null ? -1 : 1) * (nf ? 1 : -1); }
        const c = cmp(x, y);
        return o.asc ? c : -c;
      });
    }
    const count = list.length;
    if (this.to_ !== null) list = list.slice(this.from_, this.to_ + 1);
    if (this.lim !== null) list = list.slice(0, this.lim);
    const spec = parseSelect(this.sel ?? "*");
    let data: any = this.head ? null : list.map((r) => project(db, this.name, r, spec));
    // embed !inner: buang baris yang embed-nya kosong
    if (Array.isArray(data)) for (const e of spec.embeds) if (e.inner) data = data.filter((d: Row) => d[e.alias]);
    if (this.one) {
      if (data.length === 0) {
        if (this.one === "single") throw new MockError("JSON object requested, multiple (or no) rows returned", "PGRST116");
        data = null;
      } else data = data[0];
    }
    return { data, error: null, count: this.countOpt ? count : null, status: 200 };
  }
}
