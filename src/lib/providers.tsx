"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { DICT, type Lang, type Dict } from "./dictionary";
import { setGlobalLang } from "./i18n";

/* ════════════════════════════════════════════════════════════
   THEME — same localStorage key ("cikops_theme") and same
   document.documentElement[data-theme] mechanism the driver page
   already used, just centralized so every page shares one state.
════════════════════════════════════════════════════════════ */
type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <AppProviders>");
  return ctx;
}

/* ════════════════════════════════════════════════════════════
   LANGUAGE — id/en, same pattern as FleetOS's LangContext:
   a flat dictionary object per language, looked up via t().
════════════════════════════════════════════════════════════ */
interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const LangContext = createContext<LangContextValue | null>(null);

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within <AppProviders>");
  return ctx;
}

/* ════════════════════════════════════════════════════════════
   Combined provider — wrap once in layout.tsx, available to both
   /driver and /dashboard (and anything else added later).
════════════════════════════════════════════════════════════ */
export function AppProviders({ children }: { children: ReactNode }) {
  // Read whatever the pre-paint inline script (see layout.tsx) already
  // applied to <html data-theme>, so there's no flash of the wrong theme
  // AND no blank frame while waiting for a `mounted` gate.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  });
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "id";
    try {
      const saved = localStorage.getItem("cikops_lang") as Lang | null;
      return saved === "en" ? "en" : "id";
    } catch {
      return "id";
    }
  });

  // L() di seluruh aplikasi membaca bahasa aktif ini (aman diulang: hanya menyimpan nilai)
  setGlobalLang(lang);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("cikops_theme", next);
      } catch {
        /* ignore */
      }
      if (next === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      return next;
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("cikops_lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  const themeValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  const langValue = useMemo(
    () => ({ lang, setLang, t: DICT[lang] }),
    [lang, setLang]
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      {/* key={lang}: ganti bahasa me-render ulang seluruh tampilan, jadi semua teks L() ikut berubah */}
      <LangContext.Provider value={langValue}><Fragment key={lang}>{children}</Fragment></LangContext.Provider>
    </ThemeContext.Provider>
  );
}
