"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useLang, useTheme } from "@/lib/providers";
import {
  registerLocker,
  verifyLockerRelease,
  releaseLockerByUser,
  sendLockerEmail,
} from "@/lib/lockerApi";

type Screen =
  | "menu"
  | "employee-nik"
  | "employee-form"
  | "intern-form"
  | "end-use"
  | "end-confirm"
  | "result"
  | "end-result";

const TOP_TITLES: Record<Screen, { id: string; en: string }> = {
  menu: { id: "Daftar Locker", en: "Locker Registration" },
  "employee-nik": { id: "Daftar Karyawan", en: "Register — Employee" },
  "employee-form": { id: "Daftar Karyawan", en: "Register — Employee" },
  "intern-form": { id: "Daftar Internship", en: "Register — Internship" },
  "end-use": { id: "Selesai Pakai Locker", en: "End Locker Usage" },
  "end-confirm": { id: "Konfirmasi", en: "Confirm" },
  result: { id: "Berhasil", en: "Success" },
  "end-result": { id: "Berhasil", en: "Success" },
};

const LAST_LOCKER_KEY = "cikops_locker_last";

interface LastLockerHint {
  number: string;
  periode: string;
  savedAt: string;
}

export default function LockerPublicPage() {
  const { lang, setLang, t } = useLang();
  const { theme, toggleTheme } = useTheme();

  const [history, setHistory] = useState<Screen[]>(["menu"]);
  const screen = history[history.length - 1];

  const [loading, setLoading] = useState<string | null>(null);
  const [lastLocker, setLastLocker] = useState<LastLockerHint | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_LOCKER_KEY);
      if (raw) setLastLocker(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function rememberLocker(number: string, periode: string) {
    try {
      const hint: LastLockerHint = { number, periode, savedAt: new Date().toISOString() };
      localStorage.setItem(LAST_LOCKER_KEY, JSON.stringify(hint));
      setLastLocker(hint);
    } catch {
      /* ignore */
    }
  }

  function forgetLocker() {
    try {
      localStorage.removeItem(LAST_LOCKER_KEY);
    } catch {
      /* ignore */
    }
    setLastLocker(null);
  }

  // Employee NIK step
  const [nik, setNik] = useState("");
  const [namaEmp, setNamaEmp] = useState("");
  const [dept, setDept] = useState("");

  // Employee contact step
  const [hpEmp, setHpEmp] = useState("");
  const [emailEmp, setEmailEmp] = useState("");

  // Intern form
  const [namaInt, setNamaInt] = useState("");
  const [kampus, setKampus] = useState("");
  const [hpInt, setHpInt] = useState("");
  const [emailInt, setEmailInt] = useState("");
  const [periode, setPeriode] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");

  // End-of-use
  const [endNumber, setEndNumber] = useState("");
  const [endPin, setEndPin] = useState("");
  const [endUseError, setEndUseError] = useState("");
  const [confirmData, setConfirmData] = useState<{ nama: string; extra: string; periode: string } | null>(null);

  // Result
  const [resultLocker, setResultLocker] = useState("");
  const [resultPin, setResultPin] = useState("");
  const [resultPeriode, setResultPeriode] = useState("");

  function goTo(s: Screen) {
    setHistory((h) => [...h, s]);
  }
  function goBack() {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  }
  function resetApp() {
    setNik(""); setNamaEmp(""); setDept("");
    setHpEmp(""); setEmailEmp("");
    setNamaInt(""); setKampus(""); setHpInt(""); setEmailInt(""); setPeriode(""); setTanggalSelesai("");
    setEndNumber(""); setEndPin(""); setEndUseError(""); setConfirmData(null);
    setHistory(["menu"]);
  }

  function jumpToMyLocker() {
    if (!lastLocker) return;
    setEndNumber(lastLocker.number);
    goTo("end-use");
  }

  // Employee NIK step (input manual — TIDAK auto-lookup lagi, karyawan isi sendiri)

  async function submitEmployee() {
    if (!hpEmp.trim() || !emailEmp.trim()) {
      alert(lang === "en" ? "Phone number and email are required." : "Nomor HP dan Email wajib diisi.");
      return;
    }
    setLoading(lang === "en" ? "Registering locker..." : "Mendaftarkan locker...");
    try {
      const res = await registerLocker({
        nama: namaEmp,
        noHp: hpEmp.trim(),
        email: emailEmp.trim(),
        periode: "Employee",
        extra: dept,
      });
      sendLockerEmail({
        kind: "register",
        toEmail: emailEmp.trim(),
        lockerNumber: res.lockerNumber,
        pin: res.pin,
        nama: namaEmp,
        noHp: hpEmp.trim(),
        extra: dept,
        periode: "Employee",
      }).catch(() => {});
      rememberLocker(res.lockerNumber, res.periode);
      setResultLocker(res.lockerNumber);
      setResultPin(res.pin);
      setResultPeriode(res.periode);
      goTo("result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  }

  async function submitIntern() {
    if (!namaInt.trim() || !kampus.trim() || !hpInt.trim() || !emailInt.trim() || !tanggalSelesai) {
      alert(lang === "en" ? "All fields are required, including end date." : "Semua data wajib diisi, termasuk tanggal selesai.");
      return;
    }
    setLoading(lang === "en" ? "Registering locker..." : "Mendaftarkan locker...");
    try {
      const res = await registerLocker({
        nama: namaInt.trim(),
        noHp: hpInt.trim(),
        email: emailInt.trim(),
        periode: periode.trim(),
        extra: kampus.trim(),
        tanggalSelesai,
      });
      sendLockerEmail({
        kind: "register",
        toEmail: emailInt.trim(),
        lockerNumber: res.lockerNumber,
        pin: res.pin,
        nama: namaInt.trim(),
        noHp: hpInt.trim(),
        extra: kampus.trim(),
        periode: res.periode,
      }).catch(() => {});
      rememberLocker(res.lockerNumber, res.periode);
      setResultLocker(res.lockerNumber);
      setResultPin(res.pin);
      setResultPeriode(res.periode);
      goTo("result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  }

  async function verifyEndUse() {
    setEndUseError("");
    if (!endNumber.trim() || !endPin.trim()) {
      setEndUseError(lang === "en" ? "Locker number and PIN are required." : "Nomor locker dan PIN wajib diisi.");
      return;
    }
    setLoading(lang === "en" ? "Checking..." : "Memeriksa data...");
    try {
      const data = await verifyLockerRelease(endNumber.trim(), endPin.trim());
      setConfirmData(data);
      goTo("end-confirm");
    } catch (e) {
      setEndUseError(e instanceof Error ? e.message : "Gagal menghubungi server. Coba lagi.");
    } finally {
      setLoading(null);
    }
  }

  async function confirmEndUse() {
    setLoading(lang === "en" ? "Processing..." : "Memproses...");
    try {
      const res = await releaseLockerByUser(endNumber.trim(), endPin.trim());
      if (res.email) {
        sendLockerEmail({
          kind: "release",
          toEmail: res.email,
          lockerNumber: res.lockerNumber,
          nama: res.nama,
          extra: res.extra,
          periode: res.periode,
          source: "user",
        }).catch(() => {});
      }
      if (lastLocker?.number === res.lockerNumber) forgetLocker();
      goTo("end-result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={outerWrap}>
      <BackgroundBlobs />

      <div style={appCard}>
        {/* ── Top bar ── */}
        <div style={topbar}>
          <button
            onClick={goBack}
            style={{
              width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer", color: "#fff",
              visibility: screen === "menu" ? "hidden" : "visible", flexShrink: 0, transition: "background 0.15s ease",
            }}
          >
            ←
          </button>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 38, height: 38, background: "#fff", borderRadius: 10, padding: 4, objectFit: "contain", display: "block" }} />
            <span style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "var(--green)", border: "2px solid var(--navy)", animation: "pulse 1.8s infinite" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>{lang === "en" ? TOP_TITLES[screen].en : TOP_TITLES[screen].id}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Facility Management</div>
          </div>
          <button
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", borderRadius: "var(--pill)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button onClick={toggleTheme} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, cursor: "pointer" }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="tabContent" key={screen} style={{ flex: 1, overflowY: "auto", padding: "26px 20px 118px" }}>
          {screen === "menu" && (
            <MenuScreen lang={lang} onPick={(s) => goTo(s)} lastLocker={lastLocker} onJumpToMyLocker={jumpToMyLocker} onForget={forgetLocker} />
          )}

          {screen === "employee-nik" && (
            <EmployeeNikScreen lang={lang} nik={nik} setNik={setNik} namaEmp={namaEmp} setNamaEmp={setNamaEmp} dept={dept} setDept={setDept} />
          )}

          {screen === "employee-form" && (
            <ContactFormScreen lang={lang} hp={hpEmp} setHp={setHpEmp} email={emailEmp} setEmail={setEmailEmp} />
          )}

          {screen === "intern-form" && (
            <InternFormScreen
              lang={lang}
              namaInt={namaInt} setNamaInt={setNamaInt}
              kampus={kampus} setKampus={setKampus}
              hpInt={hpInt} setHpInt={setHpInt}
              emailInt={emailInt} setEmailInt={setEmailInt}
              periode={periode} setPeriode={setPeriode}
              tanggalSelesai={tanggalSelesai} setTanggalSelesai={setTanggalSelesai}
            />
          )}

          {screen === "end-use" && (
            <EndUseScreen lang={lang} number={endNumber} setNumber={setEndNumber} pin={endPin} setPin={setEndPin} error={endUseError} />
          )}

          {screen === "end-confirm" && confirmData && <EndConfirmScreen lang={lang} data={confirmData} />}

          {screen === "result" && <ResultScreen lang={lang} locker={resultLocker} pin={resultPin} periode={resultPeriode} />}

          {screen === "end-result" && <EndResultScreen lang={lang} />}
        </div>

        {/* ── Bottom action bar ── */}
        <div style={bottomBar}>
          {screen === "employee-nik" && (
            <BigButton disabled={!nik.trim() || !namaEmp.trim() || !dept.trim()} onClick={() => goTo("employee-form")}>
              {lang === "en" ? "Continue" : "Lanjutkan"}
            </BigButton>
          )}
          {screen === "employee-form" && (
            <BigButton onClick={submitEmployee}>{lang === "en" ? "Register Locker" : "Daftarkan Locker"}</BigButton>
          )}
          {screen === "intern-form" && (
            <BigButton onClick={submitIntern}>{lang === "en" ? "Register Locker" : "Daftarkan Locker"}</BigButton>
          )}
          {screen === "end-use" && (
            <BigButton onClick={verifyEndUse}>{lang === "en" ? "Verify" : "Verifikasi"}</BigButton>
          )}
          {screen === "end-confirm" && (
            <BigButton danger onClick={confirmEndUse}>
              {confirmData?.periode === "Employee"
                ? (lang === "en" ? "Confirm Exit" : "Konfirmasi Exit Locker")
                : (lang === "en" ? "Confirm Finished" : "Konfirmasi Selesai")}
            </BigButton>
          )}
          {(screen === "result" || screen === "end-result") && (
            <BigButton onClick={resetApp}>{lang === "en" ? "Back to Menu" : "Kembali ke Menu"}</BigButton>
          )}
        </div>

        {/* ── Loading overlay ── */}
        {loading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(248,250,252,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 50 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", border: "4px solid var(--border)", borderTopColor: "var(--brand)", borderRightColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 13.5, color: "var(--t2)", fontWeight: 600 }}>{loading}</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes floatBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.08); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes floatBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-35px, 30px) scale(1.1); }
        }
        @keyframes shimmerSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        @keyframes ringExpand {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes checkPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Shell styles / decorative background
════════════════════════════════════════════════════════════ */

const outerWrap: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: "24px 0",
  background: "var(--grad-hero)",
  position: "relative",
  overflow: "hidden",
};

const appCard: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  minHeight: "calc(100vh - 48px)",
  background: "var(--bg)",
  borderRadius: 28,
  boxShadow: "0 30px 70px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  zIndex: 2,
};

const topbar: CSSProperties = {
  background: "var(--grad-hero)",
  padding: "20px 20px 18px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexShrink: 0,
  position: "relative",
};

const bottomBar: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  background: "var(--surface)",
  padding: "14px 20px calc(14px + env(safe-area-inset-bottom))",
  borderTop: "1px solid var(--border)",
  boxShadow: "0 -8px 24px rgba(0,0,0,0.06)",
};

function BackgroundBlobs() {
  return (
    <>
      <div
        style={{
          position: "absolute", top: "-10%", left: "-15%", width: 380, height: 380, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(23,195,178,0.35), transparent 70%)",
          filter: "blur(10px)", animation: "floatBlob1 14s ease-in-out infinite", zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute", bottom: "-15%", right: "-15%", width: 420, height: 420, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)",
          filter: "blur(10px)", animation: "floatBlob2 18s ease-in-out infinite", zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute", top: "35%", right: "8%", width: 180, height: 180, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(61,111,242,0.3), transparent 70%)",
          filter: "blur(8px)", animation: "floatBlob1 20s ease-in-out infinite reverse", zIndex: 1,
        }}
      />
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Shared bits
════════════════════════════════════════════════════════════ */

function BigButton({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 52,
        border: "none",
        borderRadius: 14,
        fontSize: 15.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        color: "#fff",
        background: disabled ? "var(--t3)" : danger ? "var(--red)" : "linear-gradient(135deg, var(--brand), var(--brand2))",
        opacity: disabled ? 0.6 : 1,
        boxShadow: disabled ? "none" : danger ? "0 10px 24px rgba(224,72,63,0.35)" : "var(--shadow-brand)",
        transition: "transform 0.12s ease, box-shadow 0.12s ease",
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

const fieldLabel: CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--t2)", marginBottom: 7 };
const fieldInput: CSSProperties = {
  width: "100%", height: 52, padding: "0 15px", borderRadius: 14, border: "1.5px solid var(--border2)",
  fontSize: 15, fontFamily: "var(--font)", background: "var(--surface)", color: "var(--t1)",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={fieldLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SCREENS
════════════════════════════════════════════════════════════ */

function MenuScreen({
  lang, onPick, lastLocker, onJumpToMyLocker, onForget,
}: {
  lang: string;
  onPick: (s: Screen) => void;
  lastLocker: LastLockerHint | null;
  onJumpToMyLocker: () => void;
  onForget: () => void;
}) {
  const tiles: { screen: Screen; icon: string; color: string; titleId: string; titleEn: string; subId: string; subEn: string }[] = [
    { screen: "employee-nik", icon: "🧑‍💼", color: "var(--brand)", titleId: "Daftar sebagai Karyawan", titleEn: "Register as Employee", subId: "Registrasi locker untuk karyawan tetap", subEn: "Locker registration for permanent staff" },
    { screen: "intern-form", icon: "🎓", color: "var(--gold2)", titleId: "Daftar sebagai Internship", titleEn: "Register as Intern", subId: "Registrasi locker untuk peserta magang", subEn: "Locker registration for interns" },
    { screen: "end-use", icon: "🔓", color: "var(--green)", titleId: "Selesai Pakai Locker", titleEn: "End Locker Usage", subId: "Exit / selesai kontrak & magang", subEn: "Exit / end of contract & internship" },
  ];
  return (
    <div>
      <div className="staggerItem" style={{ fontSize: 22, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
        {lang === "en" ? "Welcome 👋" : "Selamat datang 👋"}
      </div>
      <div className="staggerItem" style={{ fontSize: 13, color: "var(--t3)", marginBottom: 22, animationDelay: "0.05s" }}>
        {lang === "en" ? "Choose a menu below to continue." : "Pilih salah satu menu di bawah untuk melanjutkan."}
      </div>

      {lastLocker && (
        <div
          className="staggerItem heroGlow"
          onClick={onJumpToMyLocker}
          style={{
            borderRadius: 16, padding: 16, marginBottom: 16, cursor: "pointer", animationDelay: "0.08s",
            border: "1px solid var(--border2)", position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, var(--brand), var(--gold))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>🔑</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)" }}>
                {lang === "en" ? "Your Locker" : "Locker Saya"} — No. {lastLocker.number}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--t3)" }}>
                {lang === "en" ? "Tap to end usage on this device" : "Ketuk untuk selesai pakai dari perangkat ini"}
              </div>
            </div>
            <span style={{ color: "var(--t3)", fontSize: 18 }}>›</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onForget(); }}
            style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", fontSize: 11, color: "var(--t3)", cursor: "pointer", padding: 4 }}
            title={lang === "en" ? "Not me" : "Bukan saya"}
          >
            ✕
          </button>
        </div>
      )}

      {tiles.map((tile, i) => (
        <button
          key={tile.screen}
          onClick={() => onPick(tile.screen)}
          className="statPop staggerItem"
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 14, background: "var(--surface)",
            border: "1px solid var(--border2)", borderRadius: 18, padding: 16, marginBottom: 12, cursor: "pointer", textAlign: "left",
            animationDelay: `${0.12 + i * 0.06}s`, position: "relative", overflow: "hidden",
            borderLeft: `3px solid ${tile.color}`,
          }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${tile.color}, ${tile.color}99)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, boxShadow: `0 8px 18px ${tile.color}44` }}>
            {tile.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--t1)" }}>{lang === "en" ? tile.titleEn : tile.titleId}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{lang === "en" ? tile.subEn : tile.subId}</div>
          </div>
          <div style={{ color: "var(--t3)", fontSize: 18 }}>›</div>
        </button>
      ))}
    </div>
  );
}

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < step ? "var(--green)" : i === step ? "var(--brand)" : "var(--border)", transition: "background 0.3s ease" }} />
      ))}
    </div>
  );
}

function EmployeeNikScreen({
  lang, nik, setNik, namaEmp, setNamaEmp, dept, setDept,
}: {
  lang: string; nik: string; setNik: (v: string) => void; namaEmp: string; setNamaEmp: (v: string) => void; dept: string; setDept: (v: string) => void;
}) {
  return (
    <div className="tabContent">
      <StepBar step={0} total={2} />
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Step 1 of 2 — Employee Data" : "Langkah 1 dari 2 — Data Karyawan"}
      </div>
      <Field label={lang === "en" ? "Full Name" : "Nama Lengkap"}>
        <input className="premiumInput" style={fieldInput} placeholder={lang === "en" ? "Enter full name" : "Masukkan nama lengkap"} value={namaEmp} onChange={(e) => setNamaEmp(e.target.value)} />
      </Field>
      <Field label={lang === "en" ? "Employee NIK" : "NIK Karyawan"}>
        <input className="premiumInput" style={fieldInput} inputMode="numeric" placeholder={lang === "en" ? "Enter NIK" : "Masukkan NIK"} value={nik} onChange={(e) => setNik(e.target.value)} />
      </Field>
      <Field label={lang === "en" ? "Department" : "Departemen"}>
        <input className="premiumInput" style={fieldInput} placeholder={lang === "en" ? "Enter department" : "Masukkan departemen"} value={dept} onChange={(e) => setDept(e.target.value)} />
      </Field>
    </div>
  );
}

function ContactFormScreen({
  lang, hp, setHp, email, setEmail,
}: { lang: string; hp: string; setHp: (v: string) => void; email: string; setEmail: (v: string) => void }) {
  return (
    <div className="tabContent">
      <StepBar step={1} total={2} />
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Step 2 of 2 — Contact Details" : "Langkah 2 dari 2 — Data Kontak"}
      </div>
      <Field label={lang === "en" ? "Phone Number" : "Nomor HP"}>
        <input className="premiumInput" style={fieldInput} type="tel" inputMode="tel" placeholder="08xxxxxxxxxx" value={hp} onChange={(e) => setHp(e.target.value)} />
      </Field>
      <Field label="Email">
        <input className="premiumInput" style={fieldInput} type="email" inputMode="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
    </div>
  );
}

function InternFormScreen({
  lang, namaInt, setNamaInt, kampus, setKampus, hpInt, setHpInt, emailInt, setEmailInt, periode, setPeriode, tanggalSelesai, setTanggalSelesai,
}: {
  lang: string;
  namaInt: string; setNamaInt: (v: string) => void;
  kampus: string; setKampus: (v: string) => void;
  hpInt: string; setHpInt: (v: string) => void;
  emailInt: string; setEmailInt: (v: string) => void;
  periode: string; setPeriode: (v: string) => void;
  tanggalSelesai: string; setTanggalSelesai: (v: string) => void;
}) {
  return (
    <div className="tabContent">
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Internship / Contract Participant Data" : "Data Peserta Magang / Kontrak"}
      </div>
      <Field label={lang === "en" ? "Full Name" : "Nama Lengkap"}>
        <input className="premiumInput" style={fieldInput} value={namaInt} onChange={(e) => setNamaInt(e.target.value)} placeholder={lang === "en" ? "Full name" : "Nama lengkap"} />
      </Field>
      <Field label={lang === "en" ? "University / Institution" : "Universitas / Institusi"}>
        <input className="premiumInput" style={fieldInput} value={kampus} onChange={(e) => setKampus(e.target.value)} placeholder={lang === "en" ? "University name" : "Nama universitas"} />
      </Field>
      <Field label={lang === "en" ? "Phone Number" : "Nomor HP"}>
        <input className="premiumInput" style={fieldInput} type="tel" inputMode="tel" value={hpInt} onChange={(e) => setHpInt(e.target.value)} placeholder="08xxxxxxxxxx" />
      </Field>
      <Field label="Email">
        <input className="premiumInput" style={fieldInput} type="email" inputMode="email" value={emailInt} onChange={(e) => setEmailInt(e.target.value)} placeholder="nama@email.com" />
      </Field>
      <Field label={lang === "en" ? "Period (e.g. Jul - Dec 2026)" : "Periode (contoh: Jul - Des 2026)"}>
        <input className="premiumInput" style={fieldInput} value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder={lang === "en" ? "Write the internship period" : "Tulis periode magang"} />
      </Field>
      <Field
        label={lang === "en" ? "Internship / Contract End Date" : "Tanggal Selesai Magang / Kontrak"}
        hint={lang === "en" ? "The locker will auto-reset and PIN will be shuffled on this date." : "Locker akan otomatis direset & PIN diacak ulang pada tanggal ini."}
      >
        <input className="premiumInput" style={fieldInput} type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} />
      </Field>
    </div>
  );
}

function EndUseScreen({
  lang, number, setNumber, pin, setPin, error,
}: { lang: string; number: string; setNumber: (v: string) => void; pin: string; setPin: (v: string) => void; error: string }) {
  return (
    <div className="tabContent">
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Locker Verification" : "Verifikasi Locker"}
      </div>
      {error && (
        <div style={{ fontSize: 13, padding: "12px 14px", borderRadius: 10, marginBottom: 14, background: "var(--red-soft)", color: "var(--red)" }}>{error}</div>
      )}
      <Field label={lang === "en" ? "Locker Number" : "Nomor Locker"}>
        <input className="premiumInput" style={fieldInput} inputMode="numeric" placeholder={lang === "en" ? "e.g. 12" : "Contoh: 12"} value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <Field label="PIN">
        <input className="premiumInput" style={fieldInput} inputMode="numeric" placeholder={lang === "en" ? "Enter your PIN" : "Masukkan PIN Anda"} value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
    </div>
  );
}

function EndConfirmScreen({ lang, data }: { lang: string; data: { nama: string; extra: string; periode: string } }) {
  return (
    <div className="tabContent">
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>{lang === "en" ? "Confirmation" : "Konfirmasi"}</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <InfoRow label={lang === "en" ? "Name" : "Nama"} value={data.nama} />
        <InfoRow label={lang === "en" ? "Department / University" : "Dept / Universitas"} value={data.extra} />
        <InfoRow label={lang === "en" ? "Period" : "Periode"} value={data.periode} last />
      </div>
      <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>
        {lang === "en"
          ? "Once confirmed, this locker will be reset, its PIN shuffled, and a confirmation email sent to you and the Facility Management team. This cannot be undone."
          : "Setelah dikonfirmasi, locker ini akan direset, PIN akan diacak ulang, dan email konfirmasi akan dikirim ke Anda serta tim Facility Management. Tindakan ini tidak bisa dibatalkan."}
      </p>
    </div>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13.5, borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <span style={{ color: "var(--t3)" }}>{label}</span>
      <span style={{ color: "var(--t1)", fontWeight: 700 }}>{value || "-"}</span>
    </div>
  );
}

function ResultScreen({ lang, locker, pin, periode }: { lang: string; locker: string; pin: string; periode: string }) {
  return (
    <div className="tabContent" style={{ position: "relative" }}>
      <div style={{ position: "relative", borderRadius: 22, padding: "34px 26px", textAlign: "center", color: "#fff", background: "linear-gradient(135deg, var(--navy), var(--brand))", boxShadow: "0 20px 50px rgba(20,49,92,0.4)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
        <div style={{ position: "relative", width: 60, height: 60, margin: "0 auto 16px" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", animation: "ringExpand 1.8s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, animation: "checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            ✅
          </div>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase" }}>Locker Number</div>
        <div className="numGrad" style={{ fontSize: 46, fontWeight: 800, marginTop: 6, letterSpacing: 2, WebkitTextFillColor: "#fff", background: "none" }}>{locker}</div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.2)", margin: "20px 0" }} />
        <div style={{ fontSize: 23, fontWeight: 800, background: "#fff", color: "var(--navy)", padding: "9px 26px", display: "inline-block", borderRadius: 12, letterSpacing: 1.5, boxShadow: "0 8px 20px rgba(0,0,0,0.2)" }}>
          PIN {pin}
        </div>
        <div style={{ marginTop: 14, fontSize: 13.5, opacity: 0.9, fontWeight: 600 }}>{periode}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 16, lineHeight: 1.6 }}>
          {lang === "en" ? "Locker registered successfully." : "Locker berhasil didaftarkan."}<br />
          {lang === "en" ? "Please keep your PIN safe." : "Simpan PIN Anda dengan aman."}
        </div>
      </div>
    </div>
  );
}

function EndResultScreen({ lang }: { lang: string }) {
  return (
    <div className="tabContent" style={{ position: "relative" }}>
      <div style={{ position: "relative", borderRadius: 22, padding: "34px 26px", textAlign: "center", color: "#fff", background: "linear-gradient(135deg, var(--green), #0d8a4f)", boxShadow: "0 20px 50px rgba(23,166,115,0.35)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, left: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ position: "relative", width: 60, height: 60, margin: "0 auto 16px" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", animation: "ringExpand 1.8s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, animation: "checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            🔓
          </div>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase" }}>{lang === "en" ? "Success" : "Berhasil"}</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 10 }}>
          {lang === "en" ? "Locker has been deactivated" : "Locker telah dinonaktifkan"}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.15)", fontSize: 12.5, fontWeight: 700 }}>
          {lang === "en" ? "⚠️ Your PIN for this locker is no longer valid." : "⚠️ PIN Anda untuk locker ini sudah tidak berlaku lagi."}
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 14, lineHeight: 1.6 }}>
          {lang === "en"
            ? "A confirmation email has been sent to you and the Facility Management team."
            : "Email konfirmasi telah dikirim ke Anda dan tim Facility Management."}
        </div>
      </div>
    </div>
  );
}
