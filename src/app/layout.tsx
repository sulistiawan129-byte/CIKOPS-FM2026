import type { Metadata, Viewport } from "next";
import { Space_Mono, Plus_Jakarta_Sans, JetBrains_Mono, Chakra_Petch, Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth";
import GlobalBack from "@/components/GlobalBack";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Tema "executive" (sama dengan Dashboard-ViewOnly) — dipakai di Beranda dashboard.
const execDisplay = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-exec-display",
  display: "swap",
});

const execBody = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-exec-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CIKOPS-FM System",
  description: "Facility Management System — CIKOPS-FM",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CIKOPS",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2D5BFF",
};
// Applies the saved theme to <html> BEFORE React hydrates, so there's no
// flash of the wrong theme on load. Reads the same "cikops_theme" key
// AppProviders uses, keeping a single source of truth.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem("cikops_theme");
    if (t !== "light") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
`;
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${spaceMono.variable} ${jakarta.variable} ${jetbrainsMono.variable} ${execDisplay.variable} ${execBody.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppProviders>
          <AuthProvider>
            <GlobalBack />
            {children}
          </AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
