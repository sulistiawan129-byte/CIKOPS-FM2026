import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
//  send-driver-credentials
//  Dipanggil dari dashboard admin (master data Driver → 🔑):
//   1. Verifikasi pemanggil adalah STAF (punya baris di profiles)
//   2. Verifikasi email target adalah DRIVER AKTIF (tabel drivers)
//   3. Buat akun Supabase Auth kalau belum ada, atau reset password
//      kalau sudah ada — dengan password sementara acak
//   4. Kirim email ke driver: email terdaftar + password sementara +
//      saran ganti password lewat aplikasi (Profil → Ubah Password)
//
//  Selalu balas HTTP 200 dengan { ok, error?, tempPassword? } supaya
//  client gampang baca hasilnya. tempPassword HANYA disertakan kalau
//  reset berhasil tapi email gagal terkirim — biar admin bisa
//  menyampaikan manual, tidak buntu.
// ═══════════════════════════════════════════════════════════════

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM_NAME = "CIKOPS-FM System";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}
function minify(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}



/** Password sementara 10 karakter dari huruf/angka yang tidak ambigu
 *  (tanpa 0/O, 1/l/I) — gampang diketik dari layar HP. */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function template(p: {
  nama: string;
  email: string;
  tempPassword: string;
  appUrl: string;
  lang: "id" | "en";
}): { subject: string; html: string } {
  const id = p.lang === "id";
  const nama = escapeHtml(p.nama);
  const email = escapeHtml(p.email);
  const pw = escapeHtml(p.tempPassword);
  const url = escapeHtml(p.appUrl);

  const subject = id
    ? "Akun Aplikasi Driver CIKOPS Fleet — Password Sementara"
    : "CIKOPS Fleet Driver App Account — Temporary Password";

  const html = minify(`
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1c2b4a">
    <div style="background:linear-gradient(135deg,#3d6ff2,#1c3e82);border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="color:#fff;font-size:19px;font-weight:bold">CIKOPS Fleet</div>
      <div style="color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px">DRIVER OPERATIONS</div>
    </div>
    <div style="border:1px solid #dfe6f3;border-top:none;border-radius:0 0 14px 14px;padding:24px 26px">
      <p style="margin:0 0 14px">${id ? `Halo <strong>${nama}</strong>,` : `Hello <strong>${nama}</strong>,`}</p>
      <p style="margin:0 0 16px;line-height:1.6">${
        id
          ? "Akun kamu untuk aplikasi driver CIKOPS Fleet sudah siap. Gunakan data di bawah ini untuk masuk:"
          : "Your CIKOPS Fleet driver app account is ready. Use the credentials below to sign in:"
      }</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
        <tr>
          <td style="padding:10px 14px;background:#f2f6ff;border:1px solid #dfe6f3;font-size:12px;color:#5a6a8a;width:40%">${id ? "Email login" : "Login email"}</td>
          <td style="padding:10px 14px;background:#f2f6ff;border:1px solid #dfe6f3;font-weight:bold">${email}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border:1px solid #dfe6f3;font-size:12px;color:#5a6a8a">${id ? "Password sementara" : "Temporary password"}</td>
          <td style="padding:10px 14px;border:1px solid #dfe6f3;font-family:Courier,monospace;font-weight:bold;font-size:16px;letter-spacing:1px">${pw}</td>
        </tr>
      </table>
      ${url ? `<p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;background:#3d6ff2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${id ? "Buka Aplikasi Driver" : "Open Driver App"}</a></p>` : ""}
      <p style="margin:0 0 8px;line-height:1.6;font-size:13.5px">${
        id
          ? "<strong>Penting:</strong> demi keamanan, segera ganti password ini setelah login pertama — buka tab <strong>Profil → Ubah Password</strong> di aplikasi."
          : "<strong>Important:</strong> for security, change this password right after your first sign-in — open the <strong>Profile → Change Password</strong> tab in the app."
      }</p>
      <p style="margin:0;line-height:1.6;font-size:13.5px;color:#5a6a8a">${
        id
          ? "Jangan bagikan email ini ke siapa pun. Kalau kamu tidak merasa meminta akun ini, hubungi admin GA."
          : "Do not share this email with anyone. If you didn't expect this account, contact your GA admin."
      }</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9aa7c2;margin-top:14px">CIKOPS-FM SYSTEM</p>
  </div>`);

  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return json({ ok: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di secrets." });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak tersedia." });
    }

    let payload: { driverEmail?: string; appUrl?: string; lang?: "id" | "en" };
    try {
      payload = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body." });
    }

    const driverEmail = (payload.driverEmail ?? "").trim();
    const lang: "id" | "en" = payload.lang === "en" ? "en" : "id";
    const appUrl = typeof payload.appUrl === "string" ? payload.appUrl.slice(0, 300) : "";
    if (!EMAIL_RE.test(driverEmail)) {
      return json({ ok: false, error: "Email driver tidak valid." });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Pemanggil harus staf (punya baris di profiles) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) {
      return json({ ok: false, error: "Tidak terautentikasi." });
    }
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (!callerProfile) {
      return json({ ok: false, error: "Hanya staf admin/GA yang boleh mengirim kredensial." });
    }

    // ── 2. Target harus driver aktif ──
    const { data: driverRows, error: driverErr } = await admin
      .from("drivers")
      .select("id, nama, email")
      .ilike("email", driverEmail.replace(/[\\%_]/g, (m) => `\\${m}`))
      .eq("aktif", true)
      .limit(1);
    if (driverErr) {
      return json({ ok: false, error: `Gagal cek data driver: ${driverErr.message}` });
    }
    if (!driverRows || driverRows.length === 0) {
      return json({ ok: false, error: "Email ini tidak terdaftar sebagai driver aktif." });
    }
    const driver = driverRows[0] as { id: string; nama: string; email: string };

    // ── 3. Buat akun / reset password ──
    const tempPassword = generateTempPassword();

    // Cari user auth dengan email ini (jumlah user kecil — listUsers cukup)
    const { data: userList, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      return json({ ok: false, error: `Gagal membaca daftar akun: ${listErr.message}` });
    }
    const existing = userList.users.find(
      (u) => (u.email ?? "").toLowerCase() === driverEmail.toLowerCase()
    );

    if (existing) {
      const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        email_confirm: true,
      });
      if (updErr) {
        return json({ ok: false, error: `Gagal reset password: ${updErr.message}` });
      }
    } else {
      const { error: createErr } = await admin.auth.admin.createUser({
        email: driver.email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createErr) {
        return json({ ok: false, error: `Gagal membuat akun: ${createErr.message}` });
      }
    }

    // ── 4. Kirim email ──
    const { subject, html } = template({
      nama: driver.nama,
      email: driver.email,
      tempPassword,
      appUrl,
      lang,
    });

    try {
      const client = new SMTPClient({
        connection: {
          hostname: "smtp.gmail.com",
          port: 465,
          tls: true,
          auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
        },
      });
      await client.send({
        from: `${FROM_NAME} <${GMAIL_USER}>`,
        to: driver.email,
        subject,
        html,
      });
      await client.close();
    } catch (mailErr) {
      // Password SUDAH direset tapi email gagal — kasih password sementara
      // ke admin (yang memang berwenang) supaya bisa disampaikan manual.
      console.error("Gagal kirim email kredensial:", mailErr);
      return json({
        ok: false,
        tempPassword,
        error:
          "Akun sudah dibuat/direset, tapi email gagal terkirim. Sampaikan password sementara ini ke driver secara manual.",
      });
    }

    return json({ ok: true, created: !existing });
  } catch (err) {
    console.error("send-driver-credentials error:", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unexpected error." });
  }
});
