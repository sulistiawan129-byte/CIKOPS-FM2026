import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "CIKOPS-FM System";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TaskBatchEmailPayload {
  // "requestor" = email ke requestor, "manager" = email ke manager/admin
  recipientType?: "requestor" | "manager";
  toEmail: string | string[];
  requestor: string;
  driverName: string;
  driverPhone?: string;
  vehicleLabel: string;
  jenisPekerjaan: string;
  tujuan: string;
  asal?: string;
  departement: string;
  perihal?: string;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
}

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] ?? c));
}

// ── FIX: header-injection guard ─────────────────────────────────────────────
// Root cause dari bug "email tampil sebagai kode MIME mentah di Gmail":
// field "Tujuan" di form Tugaskan Driver adalah <input type="text"> biasa.
// Mengetik Enter memang tidak bisa menyisipkan baris baru di input
// satu-baris, TAPI paste dari clipboard (mis. staff copy-paste alamat/
// catatan yang punya baris baru dari WhatsApp/Notes) BISA menyisipkan
// karakter \n mentah ke dalam value-nya — browser tidak membersihkannya.
//
// Nilai itu lalu dipakai langsung untuk membangun `subject`, dan `subject`
// ditulis apa adanya ke baris header SMTP "Subject: ...". Begitu ada \n
// mentah di tengah baris header, parser MIME penerima (termasuk Gmail)
// kehilangan batas antara blok header dan body: baris "Subject" dianggap
// terpotong, dan SEMUA baris sesudahnya — termasuk header asli
// From/To/Date/MIME-Version/Content-Type dan boundary multipart — ikut
// dianggap sebagai isi body biasa (bukan header). Itulah kenapa Gmail
// menampilkan kode MIME mentah sebagai isi email, persis seperti yang
// dilaporkan. (Dikonfirmasi dengan mereproduksi persis payload SMTP yang
// dihasilkan lalu mem-parse-nya dengan parser MIME standar: begitu ada
// \n mentah pada subject, hasilnya persis defect
// "MissingHeaderBodySeparatorDefect" dan seluruh sisa pesan jatuh jadi body
// text/plain — identik dengan screenshot yang dilaporkan.)
//
// Perbaikan: semua nilai dinamis yang ikut membentuk SUBJECT wajib
// disaring dari \r, \n, dan control character lain sebelum dipakai.
function sanitizeHeaderValue(v: unknown): string {
  return String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function fmtDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return d; }
}

function minify(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}

const HEADER = (subtitle: string) => `<div style="background:linear-gradient(135deg,#1c3e82 0%,#3d6ff2 100%);border-radius:16px 16px 0 0;padding:28px 28px 24px;text-align:center;"><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.65);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">PT. FRISIAN FLAG INDONESIA</div><div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">${subtitle}</div><div style="font-size:13px;color:rgba(255,255,255,0.7);">CIKOPS Fleet Management System</div></div>`;

const FOOTER = `<div style="text-align:center;padding:16px 0 0;"><p style="font-size:11px;color:#a0aac0;margin:0;">Email ini dibuat secara otomatis oleh <strong>CIKOPS-FM System</strong> dan tidak memerlukan balasan langsung.</p></div>`;

function detailTable(p: TaskBatchEmailPayload, isSameDay: boolean, dateFrom: string, dateTo: string): string {
  const rows = [
    ["Nama Driver", `<strong>${esc(p.driverName)}</strong>`],
    ...(p.driverPhone ? [["No. HP Driver", esc(p.driverPhone)]] : []),
    ["Kendaraan", esc(p.vehicleLabel)],
    ["Jenis Pekerjaan", esc(p.jenisPekerjaan)],
    ...(p.asal ? [["Lokasi Keberangkatan", esc(p.asal)]] : []),
    ["Tujuan", `<strong>${esc(p.tujuan)}</strong>`],
    ["Departemen", esc(p.departement) || "-"],
    ["Requestor", esc(p.requestor)],
    ["Tanggal", `<strong style="color:#1c3e82;">${isSameDay ? dateFrom : `${dateFrom} s/d ${dateTo}`}</strong>${!isSameDay ? ` <span style="font-size:11px;color:#7a86aa;">(${p.dayCount} hari)</span>` : ""}`],
    ...(p.perihal ? [["Perihal / Catatan", `<em>${esc(p.perihal)}</em>`]] : []),
  ];
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${rows.map(([k, v], i) =>
    `<tr style="border-bottom:1px solid #edf0f7;"><td style="padding:10px 14px;color:#7a86aa;width:38%;background:#f8faff;${i === 0 ? "border-radius:8px 0 0 0;" : i === rows.length - 1 ? "border-radius:0 0 0 8px;" : ""}">${k}</td><td style="padding:10px 14px;color:#1a2540;">${v}</td></tr>`
  ).join("")}</table>`;
}

// ── EMAIL KE REQUESTOR ──────────────────────────────────────────────────────
function requestorTemplate(p: TaskBatchEmailPayload): { subject: string; html: string } {
  const isSameDay = p.dateFrom === p.dateTo;
  const dateFrom = fmtDate(p.dateFrom);
  const dateTo = fmtDate(p.dateTo);
  const dateLabel = isSameDay ? dateFrom : `${dateFrom} - ${dateTo}`;

  const subject = `Konfirmasi Penugasan Driver : ${dateLabel} | ${sanitizeHeaderValue(p.tujuan)}`;

  const html = minify(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f4fb;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;"><div style="max-width:560px;margin:32px auto;background:#f0f4fb;padding:0 16px 32px;">${HEADER("Konfirmasi Penugasan Driver")}<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;"><p style="font-size:14px;color:#1a2540;line-height:1.7;margin:0 0 14px;">Yth. <strong>${esc(p.requestor)}</strong>,</p><p style="font-size:14px;color:#2d3d6b;line-height:1.7;margin:0 0 20px;">Permintaan penugasan driver Anda telah <strong>dikonfirmasi dan dijadwalkan</strong>. Berikut detail penugasan yang telah diproses:</p>${detailTable(p, isSameDay, dateFrom, dateTo)}<div style="background:#f0f5ff;border-left:4px solid #3d6ff2;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:24px;"><p style="margin:0;font-size:13px;color:#2d3d6b;line-height:1.7;">Silakan melakukan koordinasi langsung dengan driver apabila terdapat informasi tambahan atau perubahan jadwal.${p.driverPhone ? ` Driver dapat dihubungi melalui nomor <strong>${esc(p.driverPhone)}</strong>.` : ""}</p></div><p style="font-size:13px;color:#2d3d6b;line-height:1.7;margin:0 0 8px;">Demikian konfirmasi ini kami sampaikan. Terima kasih atas kepercayaan Anda.</p><p style="font-size:13px;color:#2d3d6b;margin:0;">Hormat kami,<br><strong>Tim GA — Fleet Management</strong><br><span style="color:#7a86aa;font-size:12px;">PT. Frisian Flag Indonesia</span></p></div>${FOOTER}</div></body></html>`);

  return { subject, html };
}

// ── EMAIL KE MANAGER / ADMIN ─────────────────────────────────────────────────
function managerTemplate(p: TaskBatchEmailPayload): { subject: string; html: string } {
  const isSameDay = p.dateFrom === p.dateTo;
  const dateFrom = fmtDate(p.dateFrom);
  const dateTo = fmtDate(p.dateTo);
  const dateLabel = isSameDay ? dateFrom : `${dateFrom} - ${dateTo}`;

  const subject = `[Notifikasi Penugasan] ${sanitizeHeaderValue(p.driverName)} -> ${sanitizeHeaderValue(p.tujuan)} | ${dateLabel}`;

  const html = minify(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f4fb;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;"><div style="max-width:560px;margin:32px auto;background:#f0f4fb;padding:0 16px 32px;">${HEADER("Notifikasi Penugasan Driver")}<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;"><p style="font-size:14px;color:#1a2540;line-height:1.7;margin:0 0 14px;">Yth. Bapak/Ibu,</p><p style="font-size:14px;color:#2d3d6b;line-height:1.7;margin:0 0 20px;">Dengan hormat, berikut kami sampaikan informasi penugasan driver yang telah dijadwalkan oleh tim GA:</p>${detailTable(p, isSameDay, dateFrom, dateTo)}<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:24px;"><p style="margin:0;font-size:13px;color:#92400e;line-height:1.7;"><strong>Informasi untuk Tim Manajemen:</strong> Penugasan ini telah dikonfirmasi dan driver telah mendapatkan notifikasi. Apabila diperlukan penyesuaian, segera koordinasikan dengan tim GA.</p></div><p style="font-size:13px;color:#2d3d6b;line-height:1.7;margin:0 0 8px;">Demikian informasi ini kami sampaikan untuk diketahui. Atas perhatiannya, kami ucapkan terima kasih.</p><p style="font-size:13px;color:#2d3d6b;margin:0;">Hormat kami,<br><strong>Tim GA — Fleet Management</strong><br><span style="color:#7a86aa;font-size:12px;">PT. Frisian Flag Indonesia</span></p></div>${FOOTER}</div></body></html>`);

  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "GMAIL secrets belum diset." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let payload: TaskBatchEmailPayload;
    try { payload = await req.json(); }
    catch { return new Response(JSON.stringify({ error: "Invalid JSON." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const recipients = (Array.isArray(payload.toEmail) ? payload.toEmail : [payload.toEmail])
      .map(e => typeof e === "string" ? e.trim() : "").filter(e => EMAIL_RE.test(e));

    if (!recipients.length || !payload.driverName || !payload.dateFrom || !payload.dateTo) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pilih template berdasarkan recipientType
    const { subject, html } = payload.recipientType === "manager"
      ? managerTemplate(payload)
      : requestorTemplate(payload);

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD } },
    });
    const failed: string[] = [];
    for (const to of recipients) {
      try { await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to, subject, html }); }
      catch (e) { console.error(`Failed to send to ${to}:`, e); failed.push(to); }
    }
    await client.close();

    if (failed.length === recipients.length) {
      return new Response(JSON.stringify({ error: "Gagal kirim ke semua penerima.", failed }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(
      JSON.stringify({ success: true, sent: recipients.filter(r => !failed.includes(r)), failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
