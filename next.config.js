/* Header keamanan (audit ISO 27001, temuan S-03).
 *
 *  1) Selalu aktif (aman, tidak mengubah perilaku aplikasi): HSTS, nosniff, Referrer-Policy, Permissions-Policy,
 *     serta CSP ringan `frame-ancestors / object-src / base-uri` (anti-clickjacking, anti plugin, anti <base> injection).
 *  2) CSP penuh (daftar sumber yang diizinkan) — dikirim sebagai **Report-Only** secara bawaan supaya tidak
 *     merusak fitur bila ada sumber yang terlewat; pelanggaran tercatat di /api/csp-report (log Vercel).
 *     Setelah log bersih beberapa hari, aktifkan penegakan: Vercel → Environment Variables → CSP_ENFORCE=1 → redeploy.
 *
 *  Variabel lingkungan (semua opsional):
 *     CSP_ENFORCE=1            CSP penuh ditegakkan (bukan Report-Only)
 *     CSP_FRAME_ANCESTORS      daftar asal yang boleh membingkai aplikasi (bawaan: 'self'), mis. "'self' https://portal.perusahaan.com"
 *     CSP_EXTRA_CONNECT        asal tambahan untuk connect-src (dipisah spasi), mis. domain kustom Supabase
 */

const isProd = process.env.NODE_ENV === "production";

function supabaseOrigins() {
  const out = new Set(["https://*.supabase.co", "wss://*.supabase.co"]);
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (u.host) { out.add(`https://${u.host}`); out.add(`wss://${u.host}`); }
  } catch { /* URL belum diset (mode mockup / build lokal) */ }
  for (const x of (process.env.CSP_EXTRA_CONNECT || "").split(/\s+/).filter(Boolean)) out.add(x);
  return [...out];
}

function buildCsp() {
  const sb = supabaseOrigins();
  const sbHttp = sb.filter((x) => x.startsWith("https://"));
  const frameAncestors = (process.env.CSP_FRAME_ANCESTORS || "'self'").trim();
  // 'unsafe-inline' diperlukan Next.js (skrip hidrasi inline & skrip tema di <head>); nonce penuh akan memaksa SEMUA halaman
  // menjadi dinamis (lihat docs Next.js → Content Security Policy), jadi tidak dipakai di sini.
  const full = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${sbHttp.join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self' ${sb.join(" ")}`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "report-uri /api/csp-report",
  ].join("; ");
  const light = `frame-ancestors ${frameAncestors}; object-src 'none'; base-uri 'self'`;
  return { full, light, frameAncestors };
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Source map produksi dimatikan supaya kode lengkap tidak bisa diunduh publik.
  productionBrowserSourceMaps: false,
  // Jangan bocorkan versi framework lewat header X-Powered-By.
  poweredByHeader: false,
  async rewrites() {
    // Digital Asset Links untuk APK Android (lihat src/app/api/assetlinks/route.ts)
    return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }];
  },
  async headers() {
    if (!isProd) return []; // dev: HMR memakai eval/WebSocket — header hanya untuk build produksi
    const { full, light, frameAncestors } = buildCsp();
    const enforce = process.env.CSP_ENFORCE === "1";
    const h = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      { key: "Content-Security-Policy", value: enforce ? full : light },
    ];
    if (!enforce) h.push({ key: "Content-Security-Policy-Report-Only", value: full });
    if (frameAncestors === "'self'") h.push({ key: "X-Frame-Options", value: "SAMEORIGIN" });
    return [{ source: "/:path*", headers: h }];
  },
};

module.exports = nextConfig;
