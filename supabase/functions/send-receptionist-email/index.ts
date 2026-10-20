// Receptionist — email Bukti Permintaan: Wifi Guest, Barang & Surat, dan booking Induction Room.
// Setiap email membawa tombol "Lihat & cetak bukti" (tautan publik /bukti?t=…, migrasi 033).
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
  kind: "wifi-receipt" | "parcel-arrived" | "parcel-handed" | "room-booking";
  toEmail: string;
  receiptNo: string;
  receiptUrl?: string;
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
  // booking
  title?: string;
  room?: string;
  date?: string;
  start?: string;
  end?: string;
  pic?: string;
  department?: string;
  attendees?: number | null;
  seriesCount?: number;
}

/** Warna aksen per jenis — sama dengan tiket Bukti Permintaan di aplikasi. */
const ACCENT: Record<string, [string, string, string]> = {
  wifi: ["#2d5bff", "#7c3aed", "AKSES WIFI TAMU"],
  in: ["#0ea5a4", "#2563eb", "BARANG / SURAT MASUK"],
  out: ["#7c3aed", "#db2777", "BARANG / SURAT KELUAR"],
  booking: ["#059669", "#0ea5e9", "BOOKING RUANGAN"],
};

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

/** Kerangka email bergaya tiket: header bergradasi sesuai jenis + nomor bukti, isi, tombol bukti. */
function shell(title: string, body: string, p: Payload, kindKey: keyof typeof ACCENT): string {
  const [a1, a2, label] = ACCENT[kindKey];
  const button = p.receiptUrl
    ? `<div style="text-align:center;margin:26px 0 6px"><a href="${esc(p.receiptUrl)}" style="display:inline-block;padding:13px 26px;border-radius:12px;background:${a1};background-image:linear-gradient(135deg,${a1},${a2});color:#fff;text-decoration:none;font-weight:700;font-size:14px">🧾 Lihat &amp; cetak bukti</a></div>
       <p style="font-size:11.5px;color:#64748b;text-align:center;margin:6px 0 0">Atau buka: <a href="${esc(p.receiptUrl)}" style="color:${a1}">${esc(p.receiptUrl)}</a></p>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;padding:24px 12px;background:#eef2f9">
    <div style="max-width:540px;margin:auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 18px 40px -24px rgba(11,27,58,.45)">
      <div style="padding:22px 26px;background:${a1};background-image:linear-gradient(135deg,${a1},${a2});color:#fff">
        <table role="presentation" style="width:100%;border-collapse:collapse"><tr>
          <td style="vertical-align:middle"><img src="${LOGO_URL}" alt="" style="width:34px;height:34px;border-radius:9px;background:#fff;padding:3px"></td>
          <td style="vertical-align:middle;padding-left:10px;font-size:12px;letter-spacing:2px;color:#ffffff">FACILITY MANAGEMENT<br><b style="letter-spacing:1px;color:#ffffff">BUKTI PERMINTAAN</b></td>
        </tr></table>
        <div style="margin-top:16px;display:inline-block;padding:4px 11px;border-radius:999px;background:rgba(255,255,255,.2);font-size:11px;font-weight:700;letter-spacing:2px">${label}</div>
        <div style="margin-top:8px;font-size:28px;font-weight:700;letter-spacing:.5px">${esc(p.receiptNo)}</div>
        <div style="margin-top:2px;font-size:14px;opacity:.9">${esc(title)}</div>
      </div>
      <div style="padding:24px 26px 26px;color:#0b1b3a;font-size:14px;line-height:1.55">
        ${body}
        ${button}
      </div>
      <div style="padding:14px 26px;border-top:2px dashed #e3e8f3;font-size:11.5px;color:#64748b;text-align:center">Email otomatis dari CIKOPS — mohon tidak membalas email ini.</div>
    </div>
  </div>`;
}

const row = (k: string, v: string) =>
  `<tr><td style="padding:8px 0;color:#64748b;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;color:#0a1f3d;font-weight:600">${v}</td></tr>`;

function wifiTemplate(p: Payload) {
  const subject = `Akses Wifi Tamu ${p.receiptNo} — ${p.guestName ?? ""}`.trim();
  const terms = (p.terms ?? "").split(/\r?\n/).filter((x) => x.trim()).map((x) => `<li style="margin:4px 0">${esc(x.replace(/^\d+[.)]\s*/, ""))}</li>`).join("");
  const html = shell("Akses wifi tamu siap dipakai", `
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
      ${terms ? `<div style="margin-top:18px;padding:14px 18px;background:#f1f5f9;border-radius:10px;font-size:13px;color:#334155"><b>Ketentuan</b><ol style="margin:8px 0 0;padding-left:18px">${terms}</ol></div>` : ""}`, p, "wifi");
  return { subject, html };
}

function parcelArrivedTemplate(p: Payload) {
  const isIn = p.direction !== "out";
  const subject = isIn ? `Barang/Surat untuk Anda di Resepsionis — ${p.receiptNo}` : `Barang/Surat keluar tercatat — ${p.receiptNo}`;
  const html = shell(isIn ? "Ada kiriman untuk Anda" : "Kiriman keluar tercatat", `
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
      </table>`, p, isIn ? "in" : "out");
  return { subject, html };
}

function parcelHandedTemplate(p: Payload) {
  const isIn = p.direction !== "out";
  const subject = `${isIn ? "Barang/Surat sudah diambil" : "Barang/Surat sudah diserahkan ke kurir"} — ${p.receiptNo}`;
  const html = shell(isIn ? "Kiriman sudah diambil" : "Kiriman sudah diserahkan ke kurir", `
      <p>Dear <b>${esc(isIn ? p.recipient : p.sender)}</b>,</p>
      <p>Kiriman dengan nomor <b>${esc(p.receiptNo)}</b> sudah ${isIn ? "diambil" : "diserahkan ke kurir"}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Jenis", esc(p.itemType))}
        ${p.description ? row("Keterangan", esc(p.description)) : ""}
        ${row(isIn ? "Diambil oleh" : "Kurir", esc(p.handedTo))}
        ${row("Waktu", esc(fmtDateTime(p.handedAt)))}
      </table>
      <p style="font-size:12px;color:#555;margin-top:16px">Jika Anda tidak merasa ${isIn ? "mengambil" : "menyerahkan"} kiriman ini, segera hubungi resepsionis.</p>`, p, isIn ? "in" : "out");
  return { subject, html };
}

function bookingTemplate(p: Payload) {
  const series = (p.seriesCount ?? 1) > 1;
  const subject = `Booking ${p.room ?? "ruangan"} terkonfirmasi — ${p.receiptNo}`;
  const html = shell(`${p.room ?? "Ruangan"} sudah dibooking`, `
      <p>Dear <b>${esc(p.pic || "Bapak/Ibu")}</b>,</p>
      <p>Booking Anda sudah tercatat dan otomatis masuk Kalender &amp; Agenda Facility Management.</p>
      <div style="margin:18px 0;padding:16px 18px;border-radius:14px;background:#f4f7fd;border:1px solid #e3e8f3">
        <div style="font-size:12px;letter-spacing:1.5px;color:#64748b">${esc(fmtDate(p.date).toUpperCase())}</div>
        <div style="font-size:26px;font-weight:700;margin-top:2px">${esc(p.start)} – ${esc(p.end)}</div>
        <div style="font-size:13px;color:#64748b">${esc(p.room)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Keperluan", esc(p.title))}
        ${p.department ? row("Departemen", esc(p.department)) : ""}
        ${p.attendees ? row("Peserta", `${esc(p.attendees)} orang`) : ""}
        ${series ? row("Berulang", `${esc(p.seriesCount)} jadwal`) : ""}
      </table>
      <p style="font-size:12px;color:#555;margin-top:16px">Perlu mengubah atau membatalkan? Hubungi resepsionis dengan menyebutkan nomor bukti di atas.</p>`, p, "booking");
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

    const t = p.kind === "wifi-receipt" ? wifiTemplate(p)
      : p.kind === "parcel-arrived" ? parcelArrivedTemplate(p)
      : p.kind === "room-booking" ? bookingTemplate(p)
      : parcelHandedTemplate(p);
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
