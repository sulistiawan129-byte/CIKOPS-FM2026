import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "CIKOPS-FM System";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] ?? c));
}

function minify(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "Email secrets belum diset." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, nama, eventName, passcode, selections } = await req.json() as {
      email: string; nama: string; eventName: string;
      passcode: string; selections: { item: string; variant: string }[];
    };

    if (!email || !nama || !passcode) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Keamanan: function ini dipanggil tanpa login (halaman /gift). Email hanya
    // dikirim ke pendaftar yang BARU SAJA terdaftar (≤ 15 menit) dengan email itu,
    // dan passcode harus berupa angka — tidak bisa dipakai mengirim email sembarangan.
    if (!/^\d{4,10}$/.test(String(passcode))) {
      return new Response(JSON.stringify({ error: "Passcode tidak valid." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak tersedia.");
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: reg } = await db.from("gift_registrations").select("id")
      .ilike("email", String(email).trim().replace(/[\\%_]/g, (m) => `\\${m}`)).gte("registered_at", since)
      .order("registered_at", { ascending: false }).limit(1);
    if (!reg || reg.length === 0) {
      return new Response(JSON.stringify({ error: "Tidak ada pendaftaran baru dengan email ini." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemRows = selections.filter(s => s.item).map(s =>
      `<tr><td style="padding:8px 14px;border-bottom:1px solid #edf0f7;font-size:13.5px;color:#2d3d6b;">${esc(s.item)}</td><td style="padding:8px 14px;border-bottom:1px solid #edf0f7;font-size:13.5px;font-weight:700;color:#1c3e82;text-align:right;">${esc(s.variant) || "—"}</td></tr>`
    ).join("");

    const subject = `Passcode Pengambilan - ${eventName}`;

    const html = minify(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f4fb;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:520px;margin:32px auto;background:#f0f4fb;padding:0 16px 32px;">
<div style="background:linear-gradient(135deg,#1c3e82 0%,#3d6ff2 100%);border-radius:16px 16px 0 0;padding:28px 28px 24px;text-align:center;">
<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.65);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">PT. FRISIAN FLAG INDONESIA</div>
<div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">Passcode Pengambilan</div>
<div style="font-size:13px;color:rgba(255,255,255,0.7);">${esc(eventName)}</div>
</div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;">
<p style="font-size:14px;color:#1a2540;line-height:1.7;margin:0 0 18px;">Halo <strong>${esc(nama)}</strong>,</p>
<p style="font-size:14px;color:#2d3d6b;line-height:1.7;margin:0 0 20px;">Pendaftaran Anda untuk program <strong>${esc(eventName)}</strong> telah berhasil. Berikut adalah passcode pengambilan Anda:</p>
<div style="background:#f0f5ff;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;border:2px dashed #3d6ff2;">
<div style="font-size:11px;font-weight:700;color:#3d6ff2;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">PASSCODE ANDA</div>
<div style="font-size:52px;font-weight:900;color:#1c3e82;letter-spacing:10px;font-family:Courier,monospace;">${esc(passcode)}</div>
<div style="font-size:12px;color:#7a86aa;margin-top:10px;">Tunjukkan passcode ini kepada petugas saat pengambilan</div>
</div>
<div style="font-size:11px;font-weight:700;color:#3d6ff2;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Item yang Anda Daftarkan</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
<thead><tr style="background:#eef2fb;"><th style="padding:9px 14px;text-align:left;font-size:11px;color:#3d6ff2;text-transform:uppercase;">Item</th><th style="padding:9px 14px;text-align:right;font-size:11px;color:#3d6ff2;text-transform:uppercase;">Ukuran / Varian</th></tr></thead>
<tbody>${itemRows}</tbody>
</table>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:24px;">
<p style="margin:0;font-size:13px;color:#92400e;line-height:1.7;"><strong>Penting:</strong> Passcode ini hanya berlaku satu kali. Setelah barang diambil, passcode tidak dapat digunakan kembali. Jangan bagikan passcode ini kepada siapa pun.</p>
</div>
<p style="font-size:13px;color:#2d3d6b;line-height:1.7;margin:0 0 8px;">Apabila ada pertanyaan, silakan hubungi tim GA secara langsung.</p>
<p style="font-size:13px;color:#2d3d6b;margin:0;">Salam,<br><strong>Tim GA — Fleet Management</strong><br><span style="color:#7a86aa;font-size:12px;">PT. Frisian Flag Indonesia</span></p>
</div>
<div style="text-align:center;padding:16px 0 0;">
<p style="font-size:11px;color:#a0aac0;margin:0;">Email ini dibuat secara otomatis oleh <strong>CIKOPS-FM System</strong>. Jangan membalas email ini.</p>
</div>
</div>
</body></html>`);

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD } },
    });
    await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to: email, subject, html });
    await client.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-gift-passcode error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
