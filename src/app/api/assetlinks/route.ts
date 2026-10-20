// /.well-known/assetlinks.json (lewat rewrite di next.config.js)
// Menyatakan bahwa aplikasi Android CIKOPS (APK hasil GitHub Actions) milik situs ini,
// supaya aplikasi tampil layar penuh tanpa address bar.
// Atur di Vercel → Settings → Environment Variables:
//   TWA_SHA256   = sidik jari SHA-256 sertifikat APK (dari ringkasan build GitHub Actions),
//                  beberapa dipisah koma
//   TWA_PACKAGES = (opsional) default "com.cikops.tga,com.cikops.driver"
export const dynamic = "force-dynamic";

const split = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function GET() {
  const prints = split(process.env.TWA_SHA256).map((s) => s.toUpperCase());
  const packages = split(process.env.TWA_PACKAGES ?? "com.cikops.tga,com.cikops.driver");
  const body = prints.length === 0 ? [] : packages.map((package_name) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name, sha256_cert_fingerprints: prints },
  }));
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
