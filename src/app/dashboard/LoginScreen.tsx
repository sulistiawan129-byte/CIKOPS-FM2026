"use client";

/* Login dashboard — konsep "etalase modul": panel kiri memperlihatkan modul CIKOPS
   (kartu kaca beranimasi), kartu login di kanan. Ingat email, peringatan Caps Lock,
   animasi loading saat masuk & menyiapkan dashboard. */

import { useEffect, useState } from "react";
import l from "./login.module.css";
import Icon from "@/components/Icon";
import { useLang, useTheme } from "@/lib/providers";
import { useAuth } from "@/lib/auth";
import { DEMO_ACCOUNTS, DEMO_MODE, DEMO_PASSWORD, plantFull, plantShort } from "@/lib/brand";

const EMAIL_KEY = "cikops_login_email";

const MODULES = [
  { icon: "fleet", id: "Fleet & Driver", en: "Fleet & Drivers", dId: "Penugasan, armada, gate", dEn: "Tasks, vehicles, gate", hue: 222 },
  { icon: "finance", id: "Finance", en: "Finance", dId: "Klaim & dana operasional", dEn: "Claims & op. fund", hue: 152 },
  { icon: "facility", id: "Fasilitas", en: "Facility", dId: "Kantin, locker, ATK, gift", dEn: "Canteen, lockers, supplies", hue: 32 },
  { icon: "security", id: "Security", en: "Security", dId: "Laporan G4S & pelanggaran", dEn: "G4S reports & violations", hue: 352 },
  { icon: "gafacility", id: "Cleaning & TGA", en: "Cleaning & TGA", dId: "Kebersihan, taman & teknisi GA", dEn: "Cleaning, garden & technicians", hue: 188 },
  { icon: "receptionist", id: "Receptionist", en: "Receptionist", dId: "Wifi tamu, barang, ruangan", dEn: "Guest wifi, parcels, rooms", hue: 268 },
] as const;

export function LoginScreen() {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { signIn } = useAuth();
  const en = lang === "en";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
      else setRemember(localStorage.getItem(EMAIL_KEY + "_off") !== "1");
    } catch { /* mode privat */ }
  }, []);

  // Sorotan berpindah antar modul — etalase terasa hidup
  useEffect(() => {
    const iv = setInterval(() => setActive((a) => (a + 1) % MODULES.length), 2600);
    return () => clearInterval(iv);
  }, []);

  async function handleSubmit(e: React.FormEvent | null, demoEmail?: string) {
    e?.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const addr = (demoEmail ?? email).trim();
    if (demoEmail) { setEmail(demoEmail); setPassword(DEMO_PASSWORD); }
    const { error: err } = await signIn(addr, demoEmail ? DEMO_PASSWORD : password);
    if (err) {
      setBusy(false);
      setError(/network|fetch/i.test(err) ? (en ? "No connection — check your internet." : "Tidak ada koneksi — periksa internet Anda.") : t.loginErrorGeneric);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    try {
      if (remember) { localStorage.setItem(EMAIL_KEY, addr); localStorage.removeItem(EMAIL_KEY + "_off"); }
      else { localStorage.removeItem(EMAIL_KEY); localStorage.setItem(EMAIL_KEY + "_off", "1"); }
    } catch { /* mode privat */ }
    // Berhasil: tampilkan layar "menyiapkan dashboard" sampai dashboard termuat
    setEntering(true);
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);

  return (
    <div className={l.root}>
      {/* ── Panel kiri: etalase modul ── */}
      <aside className={l.brand}>
        <div className={l.glow1} /><div className={l.glow2} /><div className={l.gridBg} />
        <header className={l.brandTop}>
          <img src="/logo.png" alt="CIKOPS" />
          <div>
            <b>{t.appName}</b>
            <span>Integrated Facility Management</span>
          </div>
        </header>

        <div className={l.pitch}>
          <h1>{en ? <>One system for every<br /><em>facility operation</em></> : <>Satu sistem untuk seluruh<br /><em>operasional FM</em></>}</h1>
          <p>{en ? `${plantFull("CIK")} & ${plantShort("PRB")} — tasks, finance, facilities and security in one place.` : `${plantFull("CIK")} & ${plantShort("PRB")} — penugasan, keuangan, fasilitas, dan keamanan di satu tempat.`}</p>
        </div>

        <ul className={l.modules}>
          {MODULES.map((m, i) => (
            <li key={m.icon} className={`${l.mod} ${i === active ? l.modOn : ""}`} style={{ ["--h" as string]: m.hue, animationDelay: `${150 + i * 90}ms` }}>
              <span className={l.modIcon}><Icon name={m.icon} size={20} /></span>
              <b>{en ? m.en : m.id}</b>
              <small>{en ? m.dEn : m.dId}</small>
            </li>
          ))}
        </ul>

        <footer className={l.brandFoot}>
          <span className={l.live}><i />{en ? "Live · 6 integrated modules" : "Live · 6 modul terintegrasi"}</span>
          <span>© {new Date().getFullYear()} {t.appName}</span>
        </footer>
      </aside>

      {/* ── Panel kanan: login ── */}
      <main className={l.side}>
        <div className={l.tools}>
          <button type="button" className={l.toolBtn} onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button>
          <button type="button" className={l.toolBtn} onClick={toggleTheme} aria-label={en ? "Toggle theme" : "Ganti tema"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>
        </div>

        <div className={l.center}>
          {/* Merek ringkas untuk HP (panel kiri disembunyikan) */}
          <div className={l.mobileBrand}>
            <img src="/logo.png" alt="" />
            <div><b>{t.appName}</b><span>Integrated Facility Management</span></div>
          </div>

          <form className={`${l.card} ${shake ? l.shake : ""}`} onSubmit={handleSubmit} aria-busy={busy}>
            {busy && <span className={l.progress} aria-hidden="true" />}
            <h2>{en ? "Welcome back" : "Selamat datang"} <span aria-hidden="true">👋</span></h2>
            <p className={l.sub}>{en ? "Sign in to the CIKOPS-FM dashboard" : "Masuk ke dashboard CIKOPS-FM"}</p>

            <label className={l.field}>
              <span>{t.loginEmail}</span>
              <div className={l.inputWrap}>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></svg>
                <input type="email" required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
                  placeholder="nama@perusahaan.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} disabled={busy} />
              </div>
            </label>

            <label className={l.field}>
              <span>{t.loginPassword}</span>
              <div className={l.inputWrap}>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                <input type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} onKeyUp={onKey} onKeyDown={onKey} onBlur={() => setCaps(false)} disabled={busy} />
                <button type="button" className={l.eye} onClick={() => setShowPassword((p) => !p)} aria-label={showPassword ? (en ? "Hide password" : "Sembunyikan password") : (en ? "Show password" : "Lihat password")} tabIndex={-1}>
                  <Icon name="eye" size={17} />
                </button>
              </div>
              {caps && <em className={l.caps}>⇪ {en ? "Caps Lock is on" : "Caps Lock sedang aktif"}</em>}
            </label>

            <label className={l.check}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>{en ? "Remember my email" : "Ingat email saya"}</span>
            </label>

            {error && <div className={l.error} role="alert">{error}</div>}

            <button type="submit" className={l.submit} disabled={busy || !email.trim() || !password}>
              {busy ? <><span className={l.spinner} aria-hidden="true" />{t.loginSigningIn}</> : <>{t.loginButton}<span aria-hidden="true">→</span></>}
            </button>

            <p className={l.help}>{en ? "Forgot your password? Ask the Master Admin or your team admin." : "Lupa password? Hubungi Master Admin atau admin tim Anda."}</p>
          </form>

          {DEMO_MODE && (
            <section className={l.demo} aria-label={en ? "Demo accounts" : "Akun demo"}>
              <div className={l.demoHead}>
                <b>{en ? "Try a demo account" : "Coba akun demo"}</b>
                <span>{en ? "One click · all data is fictitious" : "Sekali klik · semua data fiktif"}</span>
              </div>
              <div className={l.demoGrid}>
                {DEMO_ACCOUNTS.map((a) => (
                  <button key={a.email} type="button" className={l.demoBtn} onClick={() => handleSubmit(null, a.email)} disabled={busy}>
                    <span className={l.demoIc}><Icon name={a.icon} size={16} /></span>
                    <span><b>{a.label}</b><small>{a.desc}</small></span>
                  </button>
                ))}
              </div>
              <p className={l.demoNote}>{en ? "Or sign in manually" : "Atau masuk manual"}: <code>master@demo.cikops.id</code> · <code>{DEMO_PASSWORD}</code></p>
            </section>
          )}

          <a href="/driver" className={l.back}>{t.loginBackToDriver}</a>
        </div>
      </main>

      {entering && (
        <div className={l.entering} role="status">
          <div className={l.enterLogo}><img src="/logo.png" alt="" /><span /></div>
          <b>{en ? "Preparing your dashboard…" : "Menyiapkan dashboard…"}</b>
          <div className={l.dots}><i /><i /><i /></div>
        </div>
      )}
    </div>
  );
}
