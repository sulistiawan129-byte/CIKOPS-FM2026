// Supabase Edge Function: send-claim-email
// VERSI SMTP GMAIL — menggantikan Resend sepenuhnya, tidak butuh
// verifikasi domain, bisa kirim ke email manapun langsung dari
// akun Gmail kamu (dengan App Password).
//
// Setup:
//   supabase secrets set GMAIL_USER=emailkamu@gmail.com
//   supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx (tanpa spasi)
//   supabase functions deploy send-claim-email --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "CIKOPS Fleet Ops";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ClaimItem {
  type: string;
  expr: string;
  total: number;
}

interface ClaimEmailPayload {
  recipientType: "driver" | "manager";
  toEmail: string | string[];
  driverName: string;
  periodDate: string;
  submissionDate: string;
  items: ClaimItem[];
  total: number;
  note?: string;
  lang?: "id" | "en";
}

/** Escape untuk mencegah HTML/markup injection dari field yang diisi user
 * (driverName, note, item.type, item.expr, dll) sebelum disisipkan ke email HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

function fmtDate(d: string, lang: "id" | "en"): string {
  try {
    return new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}
function minify(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}



function categorySummaryRows(items: ClaimItem[]): string {
  const buckets: Record<string, number> = { Gasoline: 0, Toll: 0, Parking: 0, Other: 0 };
  items.forEach((i) => {
    const cat = i.type === "Gasoline" ? "Gasoline" : i.type === "Toll" ? "Toll" : i.type === "Parking" ? "Parking" : "Other";
    buckets[cat] += i.total;
  });
  return Object.entries(buckets)
    .filter(([, total]) => total > 0)
    .map(
      ([cat, total]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e3e7ef;font-size:13px;color:#2d375a;">${cat}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e3e7ef;font-size:13px;color:#0d1328;font-weight:600;text-align:right;">Rp ${fmtRp(total)}</td>
      </tr>`
    )
    .join("");
}

function driverTemplate(p: ClaimEmailPayload): { subject: string; html: string } {
  const id = (p.lang ?? "id") === "id";
  const driverName = escapeHtml(p.driverName);
  const note = p.note ? escapeHtml(p.note) : "";

  const subject = id
    ? `Klaim Anda Telah Diterima - ${fmtDate(p.periodDate, "id")}`
    : `Your Claim Has Been Received - ${fmtDate(p.periodDate, "en")}`;

  const html = minify(`
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;background:#f3f8fd;padding:24px;">
    <div style="background:linear-gradient(135deg,#3d6ff2,#2a52d6);border-radius:16px 16px 0 0;padding:24px;text-align:center;">
      <div style="font-size:28px;margin-bottom:6px;">🧾</div>
      <div style="color:#fff;font-size:18px;font-weight:800;">${id ? "Klaim Diterima" : "Claim Received"}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;">
      <p style="font-size:14px;color:#0d1328;line-height:1.6;">
        ${id ? `Halo <strong>${driverName}</strong>,` : `Hi <strong>${driverName}</strong>,`}
      </p>
      <p style="font-size:14px;color:#2d375a;line-height:1.6;">
        ${id
          ? "Klaim operasional Anda sudah kami terima dan tercatat di sistem. Berikut rinciannya:"
          : "Your operational claim has been received and recorded in the system. Here are the details:"}
      </p>
      <div style="background:#f7fbfe;border-radius:12px;padding:14px;margin:16px 0;font-size:13px;color:#2d375a;">
        <div style="margin-bottom:6px;"><strong>${id ? "Periode" : "Period"}:</strong> ${fmtDate(p.periodDate, p.lang ?? "id")}</div>
        <div><strong>${id ? "Tanggal Pengajuan" : "Submitted"}:</strong> ${fmtDate(p.submissionDate, p.lang ?? "id")}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <thead>
          <tr style="background:#eaf1fd;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#3d6ff2;text-transform:uppercase;">${id ? "Jenis" : "Type"}</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#3d6ff2;text-transform:uppercase;">${id ? "Nominal" : "Amount"}</th>
          </tr>
        </thead>
        <tbody>${categorySummaryRows(p.items)}</tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;background:#fff8e8;border:1px solid #d8a94e;border-radius:10px;padding:12px 16px;margin-bottom:20px;">
        <span style="font-size:12px;font-weight:700;color:#5a6485;">TOTAL</span>
        <span style="font-size:18px;font-weight:800;color:#0f9c8f;">Rp ${fmtRp(p.total)}</span>
      </div>
      ${note ? `<p style="font-size:12.5px;color:#5a6485;font-style:italic;margin-bottom:16px;">${id ? "Catatan" : "Note"}: ${note}</p>` : ""}
      <p style="font-size:13px;color:#5a6485;line-height:1.6;">
        ${id
          ? "Terima kasih atas pengajuan klaim Anda. Tim GA akan memproses lebih lanjut sesuai jadwal pencairan."
          : "Thank you for submitting your claim. The GA team will process it further according to the disbursement schedule."}
      </p>
      <p style="font-size:11px;color:#9ba3be;margin-top:20px;">${id ? "Email otomatis dari" : "Automated email from"} CIKOPS Fleet Ops</p>
    </div>
  </div>`;)

  return { subject, html };
}

function managerTemplate(p: ClaimEmailPayload): { subject: string; html: string } {
  const id = (p.lang ?? "id") === "id";
  const driverName = escapeHtml(p.driverName);
  const note = p.note ? escapeHtml(p.note) : "";

  // Header-injection guard: driverName ikut membentuk baris Subject SMTP.
  // Kalau nama driver pernah diisi/di-paste dengan karakter newline mentah,
  // parser MIME penerima (Gmail dkk) bisa kehilangan batas header/body dan
  // menampilkan seluruh sisa pesan (header asli + boundary MIME) sebagai
  // teks body mentah — lihat penjelasan lengkap & bukti reproduksi di
  // send-task-email/index.ts (sanitizeHeaderValue). driverName yang dipakai
  // di body (baris di atas) tetap versi escapeHtml biasa; di sini kita
  // pakai versi khusus tanpa newline untuk Subject saja.
  const driverNameForSubject = driverName.replace(/[\r\n]+/g, " ").trim();
  const subject = id
    ? `[Notifikasi Klaim] ${driverNameForSubject} - ${fmtDate(p.periodDate, "id")}`
    : `[Claim Notification] ${driverNameForSubject} - ${fmtDate(p.periodDate, "en")}`;

  const html = minify(`
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;background:#ffffff;padding:0;border:1px solid #d1d5e6;">
    <div style="background:#14315c;padding:20px 28px;">
      <div style="color:#fff;font-size:15px;font-weight:700;letter-spacing:0.02em;">CIKOPS FLEET OPS</div>
      <div style="color:#b2c1e4;font-size:11px;margin-top:2px;">${id ? "Notifikasi Klaim Operasional Driver" : "Driver Operational Claim Notification"}</div>
    </div>
    <div style="padding:28px;">
      <p style="font-size:13px;color:#1a1a1a;line-height:1.7;">
        ${id ? "Yth. Bapak/Ibu," : "Dear Sir/Madam,"}
      </p>
      <p style="font-size:13px;color:#1a1a1a;line-height:1.7;">
        ${id
          ? "Dengan hormat, kami sampaikan notifikasi ini sebagai bukti dan dokumentasi bahwa telah terjadi pengajuan klaim operasional driver dengan rincian sebagai berikut:"
          : "This notice is provided as a record and documentation that a driver operational claim has been submitted with the following details:"}
      </p>

      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:12.5px;">
        <tr><td style="padding:5px 0;color:#5a6485;width:160px;">${id ? "Nama Driver" : "Driver Name"}</td><td style="padding:5px 0;color:#1a1a1a;font-weight:700;">${driverName}</td></tr>
        <tr><td style="padding:5px 0;color:#5a6485;">${id ? "Periode Klaim" : "Claim Period"}</td><td style="padding:5px 0;color:#1a1a1a;">${fmtDate(p.periodDate, p.lang ?? "id")}</td></tr>
        <tr><td style="padding:5px 0;color:#5a6485;">${id ? "Tanggal Pengajuan" : "Submission Date"}</td><td style="padding:5px 0;color:#1a1a1a;">${fmtDate(p.submissionDate, p.lang ?? "id")}</td></tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #d1d5e6;">
        <thead>
          <tr style="background:#14315c;">
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:#fff;text-transform:uppercase;">${id ? "Jenis Klaim" : "Claim Type"}</th>
            <th style="padding:9px 12px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;">${id ? "Nominal" : "Amount"}</th>
          </tr>
        </thead>
        <tbody>${categorySummaryRows(p.items)}</tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 12px;background:#f7f8fb;border:1px solid #d1d5e6;font-size:13px;font-weight:700;color:#1a1a1a;">${id ? "TOTAL KESELURUHAN" : "GRAND TOTAL"}</td>
          <td style="padding:10px 12px;background:#f7f8fb;border:1px solid #d1d5e6;font-size:15px;font-weight:700;color:#14315c;text-align:right;">Rp ${fmtRp(p.total)}</td>
        </tr>
      </table>

      ${note ? `<p style="font-size:12.5px;color:#5a6485;margin-bottom:16px;"><em>${id ? "Catatan tambahan" : "Additional note"}: ${note}</em></p>` : ""}

      <p style="font-size:13px;color:#1a1a1a;line-height:1.7;">
        ${id
          ? "Email ini dikirimkan secara otomatis oleh sistem sebagai bagian dari proses dokumentasi dan tidak memerlukan tindakan lebih lanjut kecuali diperlukan verifikasi tambahan."
          : "This email is generated automatically by the system as part of the documentation process and does not require further action unless additional verification is needed."}
      </p>
      <p style="font-size:13px;color:#1a1a1a;line-height:1.7;margin-top:16px;">
        ${id ? "Hormat kami," : "Regards,"}<br/>
        <strong>CIKOPS Fleet Ops System</strong>
      </p>
    </div>
    <div style="background:#f7f8fb;border-top:1px solid #d1d5e6;padding:12px 28px;">
      <p style="font-size:10px;color:#9ba3be;">${id ? "Dokumen ini dibuat otomatis dan sah tanpa tanda tangan." : "This document is system-generated and valid without a signature."}</p>
    </div>
  </div>`;)

  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: ClaimEmailPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients = (Array.isArray(payload.toEmail) ? payload.toEmail : [payload.toEmail])
      .map((e) => (typeof e === "string" ? e.trim() : ""))
      .filter((e) => EMAIL_RE.test(e));

    if (
      recipients.length === 0 ||
      !payload.driverName ||
      !Array.isArray(payload.items) ||
      payload.items.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields or no valid recipient email." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subject, html } =
      payload.recipientType === "manager" ? managerTemplate(payload) : driverTemplate(payload);

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });

    // Kirim satu email per penerima (bukan satu panggilan dengan array
    // banyak alamat) — lihat catatan di send-task-batch-email untuk alasan:
    // menghindari header `To:` non-standar dari denomailer saat multi-
    // recipient, dan mencegah penerima satu melihat alamat penerima lain.
    const failed: string[] = [];
    for (const to of recipients) {
      try {
        await client.send({
          from: `${FROM_NAME} <${GMAIL_USER}>`,
          to,
          subject,
          html,
        });
      } catch (sendErr) {
        console.error(`Gagal kirim ke ${to}:`, sendErr);
        failed.push(to);
      }
    }
    await client.close();

    if (failed.length === recipients.length) {
      return new Response(
        JSON.stringify({ error: "Gagal mengirim ke semua penerima.", failed }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipients: recipients.filter((r) => !failed.includes(r)),
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
