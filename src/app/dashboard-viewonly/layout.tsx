import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard-ViewOnly · CIKOPS-FM",
  description: "Pantauan penugasan driver CIKOPS-FM — hanya lihat, tanpa login.",
  // Halaman publik untuk SPV/manajer: jangan diindeks mesin pencari.
  robots: { index: false, follow: false },
};

export default function ViewOnlyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
