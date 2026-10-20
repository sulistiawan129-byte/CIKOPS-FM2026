/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  async rewrites() {
    // Digital Asset Links untuk APK Android (lihat src/app/api/assetlinks/route.ts)
    return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }];
  },
};

module.exports = nextConfig;
