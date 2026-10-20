import type { Metadata, Viewport } from "next";

// Manifest sendiri supaya aplikasi TGA ter-install terpisah dari aplikasi driver (start_url /tga).
export const metadata: Metadata = {
  title: "CIKOPS TGA",
  description: "Aplikasi Teknisi GA — catat kegiatan dari HP",
  manifest: "/manifest-tga.json",
  icons: { icon: "/icon-tga-192.png", apple: "/icon-tga-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CIKOPS TGA" },
};

export const viewport: Viewport = { themeColor: "#0f1b3d" };

export default function TgaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
