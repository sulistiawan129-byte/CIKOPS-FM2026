import type { Metadata } from "next";
import { Playfair_Display, Cormorant_Garamond, Jost } from "next/font/google";

// Font menu restoran: serif klasik (judul & nama hidangan), italic elegan (aksen), sans bersih (label & angka).
const serif = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700", "800"], style: ["normal", "italic"], variable: "--mt-serif", display: "swap" });
const script = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--mt-script", display: "swap" });
const sans = Jost({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--mt-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Menu Kantin · CIKOPS-FM",
  description: "Menu kantin karyawan mingguan untuk layar TV.",
  robots: { index: false, follow: false },
};

export default function MenuTvLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${serif.variable} ${script.variable} ${sans.variable}`} style={{ display: "contents" }}>{children}</div>;
}
