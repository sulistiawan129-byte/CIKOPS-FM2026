"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { useLang, useTheme } from "@/lib/providers";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "./dashboardShared";

export function LoginScreen() {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isMobile = useIsMobile();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) setError(t.loginErrorGeneric);
  }

  const inputStyle: CSSProperties = { paddingLeft: 40 };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* ── Left: decorative brand panel — hidden on mobile ── */}
      {!isMobile && (
        <div
          style={{
            flex: "0 0 44%",
            position: "relative",
            overflow: "hidden",
            background: "var(--grad-hero)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 44px",
          }}
        >
          <div style={{ position: "absolute", top: "-15%", right: "-10%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.14), transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: "-20%", left: "-15%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(23,195,178,0.22), transparent 70%)" }} />
          <div style={{ position: "absolute", top: "38%", left: "48%", width: 260, height: 260, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)" }} />
          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: 48, height: 48 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{t.appName}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Integrated Facility Management</div>
            </div>
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginBottom: 10 }}>
              {lang === "en" ? "One System," : "Satu Sistem,"}
              <br />
              {lang === "en" ? "All Operations in " : "Semua Operasional "}
              <span style={{ background: "linear-gradient(120deg, #5eead4, #a78bfa)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
                {lang === "en" ? "Harmony" : "Selaras"}
              </span>
            </div>
            <div style={{ width: 40, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.4)", marginBottom: 14 }} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", maxWidth: 340 }}>
              {lang === "en"
                ? "Fleet, finance, and facility operations — managed in one integrated ecosystem."
                : "Fleet, finance, dan fasilitas — dikelola dalam satu ekosistem terintegrasi."}
            </div>
          </div>
          <div style={{ position: "relative", zIndex: 1, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            © {new Date().getFullYear()} <span style={{ color: "#5eead4", fontWeight: 700 }}>{t.appName}</span>. All rights reserved.
          </div>
        </div>
      )}

      {/* ── Right: login form panel — floating glass card on dotted bg ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", background: "var(--bg2)" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, var(--border2) 1.3px, transparent 1.3px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 20, position: "relative", zIndex: 1 }}>
          <button
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            className="topbarIconBtn"
            style={{ width: "auto", padding: "0 12px", borderRadius: "var(--pill)", fontWeight: 700, fontSize: 12 }}
          >
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button onClick={toggleTheme} className="topbarIconBtn">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", zIndex: 1 }}>
          <div className="tabContent cardGlass" style={{ width: "100%", maxWidth: 380, padding: "36px 32px" }}>
            <div style={{ textAlign: "center", marginBottom: 26 }}>
              <div className="hexBadge blue" style={{ margin: "0 auto 16px" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>{t.loginTitle}</div>
              <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 4 }}>{t.loginSubtitle}</div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label>{t.loginEmail.toUpperCase()}</label>
                <div style={{ position: "relative" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }}>
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" />
                  </svg>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.formInput} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label>{t.loginPassword.toUpperCase()}</label>
                <div style={{ position: "relative" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }}>
                    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className={styles.formInput} style={{ ...inputStyle, paddingRight: 40 }} />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4, display: "flex" }}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={17} height={17}>
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={17} height={17}>
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {error && (
                <div style={{ padding: 10, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", fontSize: 12.5, marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="neonBtn" disabled={busy} style={{ padding: "12px", fontSize: 14, opacity: busy ? 0.7 : 1 }}>
                {busy ? t.loginSigningIn : t.loginButton}
                {!busy && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <a href="/driver" style={{ fontSize: 12, color: "var(--t3)", textDecoration: "none" }}>
                {t.loginBackToDriver}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
