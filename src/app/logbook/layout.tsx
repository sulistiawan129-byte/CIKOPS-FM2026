import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Logbook Gate MDC - PT. Frisian Flag Indonesia",
  description: "Catat keluar-masuk antara area MDC dan FFI — sekali isi, tanpa NIK.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#34499c" };

export default function LogbookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
