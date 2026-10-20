import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "CIKOPS Fleet Ops";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const THRESHOLDS = [30, 14, 7, 1] as const;

interface VehicleRow {
  id: string;
  nopol: string;
  jenis: string | null;
  kir_date: string | null;
  service_date: string | null;
  stnk_date: string | null;
}

interface DocHit {
  vehicle: VehicleRow;
  docType: "kir" | "service" | "stnk";
  docLabel: string;
  docDate: string;
  daysLeft: number;
  thresholdLabel: "30" | "14" | "7" | "1" | "expired";
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function matchThreshold(daysLeft: number): DocHit["thresholdLabel"] | null {
  if (daysLeft < 0) return "expired";
  if (THRESHOLDS.includes(daysLeft as (typeof THRESHOLDS)[number])) {
    return String(daysLeft) as DocHit["thresholdLabel"];
  }
  return null;
}

function fmtDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function buildEmailHtml(hits: DocHit[]): string {
  const rows = hits
    .map((h) => {
      const urgent = h.thresholdLabel === "expired" || h.thresholdLabel === "1";
      const statusText =
        h.thresholdLabel === "expired"
          ? `<span style="color:#e0483f;font-weight:700;">SUDAH LEWAT ${Math.abs(h.daysLeft)} hari</span>`
          : `<span style="color:${urgent ? "#e0483f" : "#f08c1a"};font-weight:700;">H-${h.daysLeft}</span>`;
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e7ef;font-size:13px;color:#0d1328;font-weight:700;">${h.vehicle.nopol}${h.vehicle.jenis ? ` (${h.vehicle.jenis})` : ""}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e7ef;font-size:13px;color:#2d375a;">${h.docLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e7ef;font-size:13px;color:#5a6485;">${fmtDate(h.docDate)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e7ef;font-size:13px;text-align:right;">${statusText}</td>
      </tr>`;
    })
    .join("");

  return `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f3f8fd;padding:24px;">
    <div style="background:linear-gradient(135deg,#3d6ff2,#2a52d6);border-radius:16px 16px 0 0;padding:24px;text-align:center;">
      <div style="font-size:28px;margin-bottom:6px;">🚗</div>
      <div style="color:#fff;font-size:18px;font-weight:800;">Pengingat Dokumen Kendaraan</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;">
      <p style="font-size:14px;color:#0d1328;line-height:1.6;">
        Berikut kendaraan yang dokumennya (KIR/Service/STNK) mendekati atau sudah melewati jatuh tempo:
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#eaf1fd;">
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:#3d6ff2;text-transform:uppercase;">Kendaraan</th>
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:#3d6ff2;text-transform:uppercase;">Dokumen</th>
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:#3d6ff2;text-transform:uppercase;">Jatuh Tempo</th>
            <th style="padding:9px 12px;text-align:right;font-size:11px;color:#3d6ff2;text-transform:uppercase;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:12.5px;color:#5a6485;line-height:1.6;">
        Mohon segera dijadwalkan perpanjangan untuk kendaraan di atas.
      </p>
      <p style="font-size:11px;color:#9ba3be;margin-top:20px;">Email otomatis harian dari CIKOPS Fleet Ops</p>
    </div>
  </div>`;
}

serve(async (req) => {
  // Hanya dijadwalkan (Supabase Cron) atau dipanggil dengan service role / CRON_SECRET — bukan publik.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!bearer || (bearer !== SUPABASE_SERVICE_ROLE_KEY && (!cronSecret || bearer !== cronSecret))) {
    return new Response(JSON.stringify({ error: "Tidak diizinkan." }), { status: 401 });
  }
  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset" }), { status: 500 });
    }

    const { data: vehicles, error: vErr } = await supabase
      .from("vehicles")
      .select("id, nopol, jenis, kir_date, service_date, stnk_date")
      .eq("aktif", true);
    if (vErr) throw vErr;

    const { data: settingRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "manager_email")
      .maybeSingle();
    const managerEmailRaw = settingRow?.value ?? "";
    const managerEmails = managerEmailRaw.split(",").map((e) => e.trim()).filter(Boolean);

    if (managerEmails.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "manager_email belum diset di app_settings" }),
        { status: 200 }
      );
    }

    const docFields: { key: "kir_date" | "service_date" | "stnk_date"; type: DocHit["docType"]; label: string }[] = [
      { key: "kir_date", type: "kir", label: "KIR" },
      { key: "service_date", type: "service", label: "Service Berkala" },
      { key: "stnk_date", type: "stnk", label: "Perpanjangan STNK" },
    ];

    const hits: DocHit[] = [];
    for (const v of (vehicles as VehicleRow[]) ?? []) {
      for (const field of docFields) {
        const dateVal = v[field.key];
        if (!dateVal) continue;
        const daysLeft = daysUntil(dateVal);
        const threshold = matchThreshold(daysLeft);
        if (!threshold) continue;

        const { data: existing, error: exErr } = await supabase
          .from("vehicle_doc_notifications")
          .select("id")
          .eq("vehicle_id", v.id)
          .eq("doc_type", field.type)
          .eq("threshold", threshold)
          .eq("doc_date", dateVal)
          .maybeSingle();
        // tabel riwayat wajib ada (SQL 02_peran_keamanan bagian 041), kalau tidak email yang sama terkirim setiap hari
        if (exErr) throw new Error(`vehicle_doc_notifications: ${exErr.message}. Jalankan supabase/02_peran_keamanan.sql (bagian 041).`);

        if (existing) continue;

        hits.push({
          vehicle: v,
          docType: field.type,
          docLabel: field.label,
          docDate: dateVal,
          daysLeft,
          thresholdLabel: threshold,
        });
      }
    }

    if (hits.length === 0) {
      return new Response(JSON.stringify({ sent: false, reason: "Tidak ada dokumen baru yang perlu diingatkan" }), {
        status: 200,
      });
    }

    const html = buildEmailHtml(hits);
    const subject = `[Pengingat Dokumen] ${hits.length} kendaraan perlu perhatian`;

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
      to: managerEmails,
      subject,
      content: "Email ini memerlukan HTML untuk ditampilkan dengan benar.",
      html,
    });

    await client.close();

    const { error: logErr } = await supabase.from("vehicle_doc_notifications").insert(
      hits.map((h) => ({
        vehicle_id: h.vehicle.id,
        doc_type: h.docType,
        threshold: h.thresholdLabel,
        doc_date: h.docDate,
      }))
    );
    if (logErr) throw new Error(`Email terkirim, tetapi riwayat gagal disimpan: ${logErr.message}`);

    return new Response(JSON.stringify({ sent: true, count: hits.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
