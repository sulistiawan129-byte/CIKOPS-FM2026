"use client";

/* Tombol bahasa ID / EN mengambang untuk halaman yang tidak punya pengalih bahasa sendiri
   (form publik, Command Center, pos gate, dll.). Halaman dengan pengalih sendiri disembunyikan. */
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/providers";

const HAS_OWN = [/^\/menu-tv/, /^\/dashboard(\/|$)/, /^\/driver(\/|$)/, /^\/canteen(\/|$)/, /^\/locker$/, /^\/tv-display/];

export default function LangSwitch() {
  const { lang, setLang } = useLang();
  const path = usePathname() || "/";
  if (HAS_OWN.some((re) => re.test(path))) return null;
  const btn = (l: "id" | "en"): React.CSSProperties => ({
    border: 0, cursor: "pointer", padding: "5px 9px", font: "800 11px/1 system-ui, sans-serif", letterSpacing: ".06em",
    borderRadius: 999, color: lang === l ? "#fff" : "inherit", background: lang === l ? "#2d5bff" : "transparent",
  });
  return (
    <div role="group" aria-label="Language" style={{
      position: "fixed", right: 12, bottom: 12, zIndex: 9990, display: "flex", gap: 2, padding: 3, borderRadius: 999,
      background: "rgba(15,23,42,.78)", color: "#e2e8f0", boxShadow: "0 6px 18px -8px rgba(0,0,0,.5)", backdropFilter: "blur(6px)",
    }}>
      <button type="button" style={btn("id")} aria-pressed={lang === "id"} onClick={() => setLang("id")}>ID</button>
      <button type="button" style={btn("en")} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
    </div>
  );
}
