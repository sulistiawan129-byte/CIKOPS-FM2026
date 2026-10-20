// Receptionist — email tanda terima Wifi Guest & notifikasi Barang & Surat.
// Deploy: supabase functions deploy send-receptionist-email
// Secrets (sama dengan fungsi email lain): GMAIL_USER, GMAIL_APP_PASSWORD
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "Facility Management — Receptionist";
const LOGO_URL = "https://www.frisianflag.com/storage/app/media/logo-frisianflag-resize.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  kind: "wifi-receipt" | "parcel-arrived" | "parcel-handed";
  toEmail: string;
  receiptNo: string;
  // wifi
  requestorName?: string;
  guestName?: string;
  guestCompany?: string;
  username?: string;
  password?: string;
  ssid?: string;
  slots?: number;
  startDate?: string;
  endDate?: string;
  terms?: string;
  // barang
  direction?: "in" | "out";
  itemType?: string;
  description?: string;
  sender?: string;
  recipient?: string;
  handedTo?: string;
  handedAt?: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00+07:00" : iso);
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}
function fmtDateTime(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

function shell(title: string, body: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;padding:25px;background:#f4f6f8">
    <div style="max-width:540px;margin:auto;background:white;border-radius:12px;padding:30px">
      <div style="text-align:center;margin-bottom:20px">
        <img src="${LOGO_URL}" style="width:90px;" alt="">
        <h2 style="color:#0a1f3d;margin:10px 0 4px">${esc(title)}</h2>
        <div style="color:#64748b;font-size:13px">Facility Management · Receptionist</div>
      </div>
      ${body}
      <hr style="margin:25px 0;border:0;border-top:1px solid #e2e8f0">
      <p style="font-size:12px;color:#888;text-align:center;margin:0">Email otomatis dari CIKOPS — mohon tidak membalas email ini.</p>
    </div>
  </div>`;
}

const row = (k: string, v: string) =>
  `<tr><td style="padding:8px 0;color:#64748b;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;color:#0a1f3d;font-weight:600">${v}</td></tr>`;

function wifiTemplate(p: Payload) {
  const subject = `Akses Wifi Tamu ${p.receiptNo} — ${p.guestName ?? ""}`.trim();
  const terms = (p.terms ?? "").split(/\r?\n/).filter((x) => x.trim()).map((x) => `<li style="margin:4px 0">${esc(x.replace(/^\d+[.)]\s*/, ""))}</li>`).join("");
  const html = shell("Akses Wifi Tamu", `
      <p>Dear <b>${esc(p.requestorName)}</b>,</p>
      <p>Akses wifi untuk tamu Anda sudah disiapkan. Berikut detailnya:</p>
      <div style="margin:20px 0;padding:22px;background:#0a1f3d;color:white;border-radius:10px;text-align:center">
        <div style="font-size:12px;letter-spacing:2px;opacity:.75">NO. TANDA TERIMA</div>
        <div style="font-size:18px;font-weight:bold;margin-bottom:14px">${esc(p.receiptNo)}</div>
        ${p.ssid ? `<div style="font-size:12px;opacity:.75">WIFI (SSID)</div><div style="font-size:18px;font-weight:bold;margin-bottom:10px">${esc(p.ssid)}</div>` : ""}
        <div style="font-size:12px;opacity:.75">USER</div>
        <div style="font-size:26px;font-weight:bold;font-family:monospace">${esc(p.username)}</div>
        <div style="font-size:12px;opacity:.75;margin-top:10px">PASSWORD</div>
        <div style="font-size:26px;font-weight:bold;font-family:monospace">${esc(p.password)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Tamu", esc(p.guestName) + (p.guestCompany ? ` · ${esc(p.guestCompany)}` : ""))}
        ${row("Jumlah perangkat", `${p.slots ?? 1}`)}
        ${row("Mulai", esc(fmtDate(p.startDate)))}
        ${row("Berlaku sampai", `<span style="color:#b91c1c">${esc(fmtDate(p.endDate))}</span>`)}
      </table>
      ${terms ? `<div style="margin-top:18px;padding:14px 18px;background:#f1f5f9;border-radius:10px;font-size:13px;color:#334155"><b>Ketentuan</b><ol style="margin:8px 0 0;padding-left:18px">${terms}</ol></div>` : ""}`);
  return { subject, html };
}

function parcelArrivedTemplate(p: Payload) {
  const isIn = p.direction !== "out";
  const subject = isIn ? `Barang/Surat untuk Anda di Resepsionis — ${p.receiptNo}` : `Barang/Surat keluar tercatat — ${p.receiptNo}`;
  const html = shell(isIn ? "Ada Kiriman untuk Anda" : "Kiriman Keluar Tercatat", `
      <p>Dear <b>${esc(isIn ? p.recipient : p.sender)}</b>,</p>
      <p>${isIn ? "Ada kiriman untuk Anda yang menunggu di meja resepsionis. Silakan diambil dengan menyebutkan nomor tanda terima di bawah." : "Kiriman Anda sudah diterima resepsionis dan menunggu diambil kurir."}</p>
      <div style="margin:18px 0;padding:16px;background:#0a1f3d;color:white;border-radius:10px;text-align:center">
        <div style="font-size:12px;letter-spacing:2px;opacity:.75">NO. TANDA TERIMA</div>
        <div style="font-size:24px;font-weight:bold">${esc(p.receiptNo)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Jenis", esc(p.itemType))}
        ${p.description ? row("Keterangan", esc(p.description)) : ""}
        ${row("Dari", esc(p.sender || "-"))}
        ${row("Untuk", esc(p.recipient || "-"))}
      </table>`);
  return { subject, html };
}

function parcelHandedTemplate(p: Payload) {
  const isIn = p.direction !== "out";
  const subject = `${isIn ? "Barang/Surat sudah diambil" : "Barang/Surat sudah diserahkan ke kurir"} — ${p.receiptNo}`;
  const html = shell(isIn ? "Kiriman Sudah Diambil" : "Kiriman Sudah Diserahkan", `
      <p>Dear <b>${esc(isIn ? p.recipient : p.sender)}</b>,</p>
      <p>Kiriman dengan nomor <b>${esc(p.receiptNo)}</b> sudah ${isIn ? "diambil" : "diserahkan ke kurir"}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Jenis", esc(p.itemType))}
        ${p.description ? row("Keterangan", esc(p.description)) : ""}
        ${row(isIn ? "Diambil oleh" : "Kurir", esc(p.handedTo))}
        ${row("Waktu", esc(fmtDateTime(p.handedAt)))}
      </table>
      <p style="font-size:12px;color:#555;margin-top:16px">Jika Anda tidak merasa ${isIn ? "mengambil" : "menyerahkan"} kiriman ini, segera hubungi resepsionis.</p>`);
  return { subject, html };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return json({ error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di secrets." }, 500);
    const p: Payload = await req.json();
    if (!p.kind || !p.toEmail || !p.receiptNo) return json({ error: "Missing required fields." }, 400);

    const t = p.kind === "wifi-receipt" ? wifiTemplate(p) : p.kind === "parcel-arrived" ? parcelArrivedTemplate(p) : parcelHandedTemplate(p);
    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD } },
    });
    await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: p.toEmail, subject: t.subject, content: "HTML required", html: t.html });
    await client.close();
    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
