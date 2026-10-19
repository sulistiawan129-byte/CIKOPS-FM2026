import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FM Command Center · CIKOPS-FM",
  description: "FM Command Center CIKOPS-FM — rapor facility management, hanya lihat, tanpa login.",
  // Halaman publik untuk SPV/manajer: jangan diindeks mesin pencari.
  robots: { index: false, follow: false },
};

export default function ViewOnlyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
