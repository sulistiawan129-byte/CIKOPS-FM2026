import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Menu Kantin · CIKOPS-FM",
  description: "Menu kantin karyawan mingguan untuk layar TV.",
  robots: { index: false, follow: false },
};

export default function MenuTvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
