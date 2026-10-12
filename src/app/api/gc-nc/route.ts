/* ════════════════════════════════════════════════════════════
   /api/gc-nc — jembatan BACA-SAJA ke database G-C (Security Desk).
   Mengambil laporan NC berstatus Accept beserta supplier & jenis temuan.

   • Hanya pengguna dashboard CIKOPS yang login (punya baris di profiles).
   • Kredensial G-C hanya di server (environment variable), tidak pernah
     dikirim ke browser.
   • Nomor SIM tidak dikirim ke browser: diganti hash + 4 digit terakhir.

   Environment variable (Vercel → Settings → Environment Variables):
     GC_SUPABASE_URL            URL project Supabase G-C / Security Desk
     GC_SUPABASE_ANON_KEY       anon key project G-C
     GC_READER_EMAIL            akun baca-saja di G-C (peran SHE / Management)
     GC_READER_PASSWORD         password akun tsb
     (alternatif) GC_SUPABASE_SERVICE_ROLE_KEY — dipakai bila diisi, menggantikan login akun
     GC_PLANT                   nilai kolom plant di nc_reports (default "Cikarang")
     GC_HASH_SALT               teks acak untuk hash nomor SIM (disarankan diisi)
════════════════════════════════════════════════════════════ */

import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class HttpErr extends Error { constructor(public status: number, msg: string) { super(msg); } }

const env = (k: string) => (process.env[k] || "").trim();

let gcClient: SupabaseClient | null = null;
let gcUntil = 0;

function gcMode(): "service" | "account" | null {
  if (!env("GC_SUPABASE_URL")) return null;
  if (env("GC_SUPABASE_SERVICE_ROLE_KEY")) return "service";
  if (env("GC_SUPABASE_ANON_KEY") && env("GC_READER_EMAIL") && env("GC_READER_PASSWORD")) return "account";
  return null;
}

async function gc(): Promise<SupabaseClient> {
  const mode = gcMode();
  if (!mode) throw new HttpErr(503, "Sinkron G-C belum dikonfigurasi (environment variable GC_* belum diisi).");
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  if (mode === "service") {
    if (!gcClient) gcClient = createClient(env("GC_SUPABASE_URL"), env("GC_SUPABASE_SERVICE_ROLE_KEY"), opts);
    return gcClient;
  }
  if (gcClient && Date.now() < gcUntil) return gcClient;
  const c = createClient(env("GC_SUPABASE_URL"), env("GC_SUPABASE_ANON_KEY"), opts);
  const { data, error } = await c.auth.signInWithPassword({ email: env("GC_READER_EMAIL"), password: env("GC_READER_PASSWORD") });
  if (error || !data.session) throw new HttpErr(502, `Login ke G-C gagal: ${error?.message || "tanpa sesi"}`);
  gcClient = c;
  gcUntil = Date.now() + Math.max(60, (data.session.expires_in || 3600) - 120) * 1000;
  return c;
}

async function requireDashboardUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpErr(401, "Tidak ada sesi login.");
  const url = env("NEXT_PUBLIC_SUPABASE_URL"), anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await c.auth.getUser(token);
  if (error || !data.user) throw new HttpErr(401, "Sesi login tidak valid.");
  const { data: prof } = await c.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!prof) throw new HttpErr(403, "Akun ini bukan pengguna dashboard.");
}

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const hashSim = (sim: string) => {
  const s = sim.replace(/\s+/g, "").toUpperCase();
  if (!s) return "";
  return createHash("sha256").update(`${env("GC_HASH_SALT") || "cikops-gc"}:${s}`).digest("hex").slice(0, 16);
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  try {
    await requireDashboardUser(req);
    const u = new URL(req.url);
    const plant = env("GC_PLANT") || "Cikarang";
    const db = await gc();

    if (u.searchParams.get("ping")) {
      const { data, error, count } = await db.from("nc_reports").select("tanggal", { count: "exact" })
        .eq("status", "Accept").eq("plant", plant).order("tanggal", { ascending: false }).limit(1);
      if (error) throw new HttpErr(502, `G-C menolak query: ${error.message}`);
      return json({ ok: true, mode: gcMode(), plant, latest: data?.[0]?.tanggal ?? null, total: count ?? null });
    }

    const from = u.searchParams.get("from"), to = u.searchParams.get("to");
    if (!isDate(from) || !isDate(to) || from! > to!) throw new HttpErr(400, "Parameter from/to tidak valid (YYYY-MM-DD).");
    const span = (Date.parse(to!) - Date.parse(from!)) / 86400000;
    if (span > 800) throw new HttpErr(400, "Rentang maksimal ±26 bulan.");

    // 1) laporan NC (paginasi 1000)
    type R = { id: string; tanggal: string; supplier_id: string | null; no_polisi: string | null; nomor_identitas: string | null };
    const reports: R[] = [];
    for (let off = 0; off < 50000; off += 1000) {
      const { data, error } = await db.from("nc_reports")
        .select("id, tanggal, supplier_id, no_polisi, nomor_identitas")
        .eq("status", "Accept").eq("plant", plant).gte("tanggal", from!).lte("tanggal", to!)
        .order("tanggal", { ascending: true }).range(off, off + 999);
      if (error) throw new HttpErr(502, `G-C menolak query nc_reports: ${error.message}`);
      reports.push(...((data || []) as R[]));
      if (!data || data.length < 1000) break;
    }

    // 2) master supplier & kategori
    const [{ data: sup, error: e1 }, { data: cat, error: e2 }] = await Promise.all([
      db.from("suppliers").select("id, name").range(0, 9999),
      db.from("nc_categories").select("id, name"),
    ]);
    if (e1 || e2) throw new HttpErr(502, `G-C menolak query master: ${(e1 || e2)!.message}`);
    const supName = new Map((sup || []).map((s) => [s.id as string, String(s.name || "").trim()]));
    const catName = new Map((cat || []).map((c) => [c.id as number, String(c.name || "").trim()]));

    // 3) temuan per laporan (per 200 id)
    const findings = new Map<string, string[]>();
    const ids = reports.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from("nc_report_findings").select("report_id, category_id").in("report_id", ids.slice(i, i + 200));
      if (error) throw new HttpErr(502, `G-C menolak query nc_report_findings: ${error.message}`);
      (data || []).forEach((f) => {
        const arr = findings.get(f.report_id as string) || [];
        arr.push(catName.get(f.category_id as number) || "Lainnya");
        findings.set(f.report_id as string, arr);
      });
    }

    const cases = reports.map((r) => {
      const sim = String(r.nomor_identitas || "").replace(/\s+/g, "");
      return {
        id: r.id,
        tanggal: String(r.tanggal).slice(0, 10),
        supplier: supName.get(r.supplier_id || "") || "-",
        nopol: String(r.no_polisi || "").toUpperCase().trim(),
        simHash: hashSim(sim),
        simLast4: sim.slice(-4),
        jenis: findings.get(r.id) || [],
      };
    });
    return json({ ok: true, plant, fetchedAt: new Date().toISOString(), cases });
  } catch (e) {
    const status = e instanceof HttpErr ? e.status : 500;
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, status);
  }
}
