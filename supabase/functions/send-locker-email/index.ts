import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "Facility Management";
const ADMIN_EMAIL = Deno.env.get("LOCKER_ADMIN_EMAIL") ?? "facilitymanagement.admin@gmail.com";
const LOGO_URL = "https://www.frisianflag.com/storage/app/media/logo-frisianflag-resize.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LockerEmailPayload {
  kind: "register" | "release" | "confirm-request";
  toEmail?: string;
  lockerNumber: string;
  pin?: string;
  nama?: string;
  noHp?: string;
  extra?: string;
  periode?: string;
  source?: "user" | "admin" | "auto" | "user-confirm";
  token?: string;
  baseUrl?: string; // e.g. https://yourapp.com/locker/confirm
}

function reasonText(p: LockerEmailPayload): string {
  const isEmployee = p.periode === "Employee";
  if (p.source === "auto") {
    return isEmployee
      ? "Masa penggunaan telah berakhir (otomatis)"
      : "Masa internship/kontrak telah berakhir (otomatis oleh sistem)";
  }
  if (p.source === "admin") return "Dinonaktifkan oleh Admin Facility Management";
  if (p.source === "user-confirm") return "Pengguna mengonfirmasi TIDAK LAGI menggunakan locker melalui email konfirmasi";
  return isEmployee ? "Karyawan mengakhiri penggunaan locker" : "Peserta magang mengonfirmasi selesai tugas";
}

/** Rapatkan HTML (sama dengan fungsi email lain). denomailer mengirim HTML sebagai
 *  quoted-printable; baris ber-indentasi membuat "=20" tampil di sebagian aplikasi email. */
function minify(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}

/* ═══════════════ TEMPLATE: register (ke user) ═══════════════ */
function registerUserTemplate(p: LockerEmailPayload) {
  const subject = "Locker Registration Confirmation";
  const html = `
  <div style="font-family:Arial;padding:25px;background:#f4f6f8">
    <div style="max-width:520px;margin:auto;background:white;border-radius:12px;padding:30px">
      <div style="text-align:center;margin-bottom:20px">
        <img src="${LOGO_URL}" style="width:90px;">
        <h2 style="color:#0a1f3d;margin-top:10px">Locker Registration Successful</h2>
        <div style="color:#64748b;font-size:13px">Facility Management</div>
      </div>
      <p>Dear <b>${p.nama ?? "-"}</b>,</p>
      <p>Your locker has been successfully assigned.</p>
      <div style="margin:20px 0;padding:25px;background:#0a1f3d;color:white;border-radius:10px;text-align:center">
        <div style="font-size:14px">Locker Number</div>
        <div style="font-size:34px;font-weight:bold">${p.lockerNumber}</div>
        <div style="margin-top:10px;font-size:14px">PIN</div>
        <div style="font-size:26px;font-weight:bold">${p.pin ?? "-"}</div>
      </div>
      <p><b>Period:</b> ${p.periode ?? "-"}</p>
      <p style="font-size:12px;color:#555">Please keep this information secure. PIN may be reset periodically.</p>
      <hr style="margin:25px 0">
      <p style="font-size:12px;color:#888;text-align:center">Locker Management System</p>
    </div>
  </div>`;
  return { subject, html };
}

/* ═══════════════ TEMPLATE: register (ke admin) ═══════════════ */
function registerAdminTemplate(p: LockerEmailPayload) {
  const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const subject = "New Locker Registration";
  const html = `
  <div style="font-family:Arial;padding:25px;background:#f4f6f8">
    <div style="max-width:600px;margin:auto;background:white;border-radius:10px;padding:25px">
      <h2 style="color:#0a1f3d">New Locker Assigned</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:15px">
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Name</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.nama ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Phone</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.noHp ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Email</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.toEmail ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Department / University</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.extra ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Period</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.periode ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Locker Number</b></td><td style="padding:8px;border-bottom:1px solid #eee"><b>${p.lockerNumber}</b></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>PIN</b></td><td style="padding:8px;border-bottom:1px solid #eee"><b>${p.pin ?? "-"}</b></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Registration Time</b></td><td style="padding:8px;border-bottom:1px solid #eee">${time}</td></tr>
      </table>
    </div>
  </div>`;
  return { subject, html };
}

/* ═══════════════ TEMPLATE: release (ke user) ═══════════════ */
function releaseUserTemplate(p: LockerEmailPayload) {
  const isEmployee = p.periode === "Employee";
  const title = isEmployee ? "Locker Usage Ended" : "Selesai Internship / Kontrak";
  const subject = `${title} - Locker ${p.lockerNumber}`;
  const html = `
  <div style="font-family:Arial;padding:25px;background:#f4f6f8">
    <div style="max-width:520px;margin:auto;background:white;border-radius:12px;padding:30px">
      <div style="text-align:center;margin-bottom:20px">
        <img src="${LOGO_URL}" style="width:90px;">
        <h2 style="color:#0a1f3d;margin-top:10px">${title}</h2>
        <div style="color:#64748b;font-size:13px">Facility Management</div>
      </div>
      <p>Dear <b>${p.nama ?? "-"}</b>,</p>
      <p>Locker nomor <b>${p.lockerNumber}</b> yang terdaftar atas nama Anda kini telah dinonaktifkan.</p>
      <div style="margin:20px 0;padding:18px 22px;background:#f1f5f9;border-radius:10px;color:#0a1f3d">
        <b>Alasan:</b> ${reasonText(p)}
      </div>
      <p style="font-size:12px;color:#555">Jika Anda merasa ini adalah kekeliruan, silakan hubungi tim Facility Management.</p>
      <hr style="margin:25px 0">
      <p style="font-size:12px;color:#888;text-align:center">Locker Management System</p>
    </div>
  </div>`;
  return { subject, html };
}

/* ═══════════════ TEMPLATE: release (ke admin) ═══════════════ */
function releaseAdminTemplate(p: LockerEmailPayload) {
  const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const subject = `Locker Released - ${p.lockerNumber}`;
  const html = `
  <div style="font-family:Arial;padding:25px;background:#f4f6f8">
    <div style="max-width:600px;margin:auto;background:white;border-radius:10px;padding:25px">
      <h2 style="color:#0a1f3d">Locker Released</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:15px">
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Locker Number</b></td><td style="padding:8px;border-bottom:1px solid #eee"><b>${p.lockerNumber}</b></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Name</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.nama ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Department / University</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.extra ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Period</b></td><td style="padding:8px;border-bottom:1px solid #eee">${p.periode ?? "-"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Reason</b></td><td style="padding:8px;border-bottom:1px solid #eee">${reasonText(p)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Time</b></td><td style="padding:8px;border-bottom:1px solid #eee">${time}</td></tr>
      </table>
      <p style="font-size:12px;color:#888;margin-top:15px">PIN locker ini telah otomatis diacak ulang dan siap dipakai peserta berikutnya.</p>
    </div>
  </div>`;
  return { subject, html };
}

/* ═══════════════ TEMPLATE: confirm-request (ke user) ═══════════════ */
function confirmRequestTemplate(p: LockerEmailPayload) {
  const base = p.baseUrl ?? "";
  const yesUrl = `${base}?token=${encodeURIComponent(p.token ?? "")}&answer=yes`;
  const noUrl = `${base}?token=${encodeURIComponent(p.token ?? "")}&answer=no`;
  const subject = `Konfirmasi Locker ${p.lockerNumber} - Mohon Respon`;
  const html = `
  <div style="font-family:Arial;padding:25px;background:#f4f6f8">
    <div style="max-width:520px;margin:auto;background:white;border-radius:12px;padding:30px">
      <div style="text-align:center;margin-bottom:20px">
        <img src="${LOGO_URL}" style="width:90px;">
        <h2 style="color:#0a1f3d;margin-top:10px">Konfirmasi Penggunaan Locker</h2>
        <div style="color:#64748b;font-size:13px">Facility Management</div>
      </div>
      <p>Dear <b>${p.nama ?? "-"}</b>,</p>
      <p>Kami sedang melakukan pendataan ulang penggunaan locker. Apakah Anda <b>masih menggunakan</b> locker nomor <b>${p.lockerNumber}</b>?</p>
      <div style="text-align:center;margin:26px 0">
        <a href="${yesUrl}" style="display:inline-block;margin:6px;padding:13px 26px;background:#16a34a;color:white;border-radius:10px;text-decoration:none;font-weight:600">Ya, Masih Pakai</a>
        <a href="${noUrl}" style="display:inline-block;margin:6px;padding:13px 26px;background:#dc2626;color:white;border-radius:10px;text-decoration:none;font-weight:600">Tidak Lagi</a>
      </div>
      <p style="font-size:12px;color:#555">
        Jika Anda memilih "Tidak Lagi", locker akan otomatis dinonaktifkan dan PIN akan diacak ulang.
        Mohon konfirmasi dalam 7 hari sejak email ini diterima.
      </p>
      <hr style="margin:25px 0">
      <p style="font-size:12px;color:#888;text-align:center">Locker Management System</p>
    </div>
  </div>`;
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: LockerEmailPayload = await req.json();
    if (!payload.kind || !payload.lockerNumber) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });

    const sent: string[] = [];

    if (payload.kind === "register") {
      if (payload.toEmail) {
        const { subject, html } = registerUserTemplate(payload);
        await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: payload.toEmail, subject, content: "HTML required", html: minify(html) });
        sent.push("user");
      }
      const { subject, html } = registerAdminTemplate(payload);
      await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: ADMIN_EMAIL, subject, content: "HTML required", html: minify(html) });
      sent.push("admin");
    } else if (payload.kind === "release") {
      if (payload.toEmail) {
        const { subject, html } = releaseUserTemplate(payload);
        await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: payload.toEmail, subject, content: "HTML required", html: minify(html) });
        sent.push("user");
      }
      const { subject, html } = releaseAdminTemplate(payload);
      await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: ADMIN_EMAIL, subject, content: "HTML required", html: minify(html) });
      sent.push("admin");
    } else if (payload.kind === "confirm-request") {
      if (!payload.toEmail) {
        return new Response(JSON.stringify({ error: "toEmail is required for confirm-request." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { subject, html } = confirmRequestTemplate(payload);
      await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: payload.toEmail, subject, content: "HTML required", html: minify(html) });
      sent.push("user");
    }

    await client.close();

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
