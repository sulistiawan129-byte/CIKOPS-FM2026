import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Penugasan TGA · CIKOPS",
  description: "Form penugasan Teknisi GA untuk staf GA",
  icons: { icon: "/icon-tga-192.png", apple: "/icon-tga-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f1b3d" };

export default function TugasTgaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
