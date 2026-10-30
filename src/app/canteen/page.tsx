"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useLang, useTheme } from "@/lib/providers";
import { saveCanteenReport } from "@/lib/api";
import { toLocalISODate } from "@/lib/dateUtils";

const SHIFT_LABELS = ["Shift 1", "Shift 2", "Shift 3"];

function todayStr() {
  return toLocalISODate(new Date());
}

export default function CanteenPublicPage() {
  const { lang, setLang, t } = useLang();
  const { theme, toggleTheme } = useTheme();

  const [screen, setScreen] = useState<"form" | "success">("form");
  const [saving, setSaving] = useState(false);

  const [reportDate, setReportDate] = useState(todayStr());
  const [snackOrder, setSnackOrder] = useState<[string, string, string]>(["", "", ""]);
  const [snackLeftover, setSnackLeftover] = useState<[string, string, string]>(["", "", ""]);
  const [mealOrder, setMealOrder] = useState<[string, string, string]>(["", "", ""]);
  const [mealLeftover, setMealLeftover] = useState<[string, string, string]>(["", "", ""]);
  const [submittedBy, setSubmittedBy] = useState("");

  const num = (arr: [string, string, string]) => arr.map((v) => Number(v) || 0) as [number, number, number];
  const sum = (arr: [number, number, number]) => arr[0] + arr[1] + arr[2];

  const sOrd = sum(num(snackOrder)), sLft = sum(num(snackLeftover)), sCon = Math.max(0, sOrd - sLft);
  const mOrd = sum(num(mealOrder)), mLft = sum(num(mealLeftover)), mCon = Math.max(0, mOrd - mLft);
  const sEff = sOrd > 0 ? (sCon / sOrd) * 100 : 0;
  const mEff = mOrd > 0 ? (mCon / mOrd) * 100 : 0;

  const hasOverflow =
    snackOrder.some((v, i) => Number(snackLeftover[i]) > Number(v) && Number(v) > 0) ||
    mealOrder.some((v, i) => Number(mealLeftover[i]) > Number(v) && Number(v) > 0);
  const allZero = [...snackOrder, ...mealOrder].every((v) => !Number(v));
  const canSave = reportDate && !allZero && !hasOverflow;

  function resetForm() {
    setSnackOrder(["", "", ""]); setSnackLeftover(["", "", ""]);
    setMealOrder(["", "", ""]); setMealLeftover(["", "", ""]);
    setSubmittedBy("");
    setReportDate(todayStr());
    setScreen("form");
  }

  async function handleSubmit() {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveCanteenReport({
        reportDate,
        snackOrder: num(snackOrder),
        snackLeftover: num(snackLeftover),
        mealOrder: num(mealOrder),
        mealLeftover: num(mealLeftover),
        submittedBy: submittedBy.trim() || (lang === "en" ? "Canteen Operator" : "Operator Kantin"),
      });
      setScreen("success");
    } catch (e) {
      // Supabase melempar PostgrestError (plain object), bukan instanceof Error,
      // sehingga pesan aslinya tersembunyi. Ambil dari .message dulu,
      // fallback ke JSON, fallback ke pesan generik.
      const msg =
        (e instanceof Error ? e.message : null) ||
        (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : null) ||
        (lang === "en" ? "Failed to save report. Please try again." : "Gagal menyimpan laporan. Coba lagi.");
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  const fmtRp = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));

  return (
    <div style={outerWrap}>
      <BackgroundBlobs />
      <div style={appCard}>
        {/* ── Top bar ── */}
        <div style={topbar}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 38, height: 38, background: "#fff", borderRadius: 10, padding: 4, objectFit: "contain", display: "block" }} />
            <span style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "var(--green)", border: "2px solid var(--navy)", animation: "pulse 1.8s infinite" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>
              {lang === "en" ? "Canteen Daily Entry" : "Input Harian Kantin"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>{t.appName}</div>
          </div>
          <button onClick={() => setLang(lang === "id" ? "en" : "id")} style={pillIconBtn}>
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button onClick={toggleTheme} style={{ ...pillIconBtn, borderRadius: "50%", width: 30, padding: 0 }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {/* ── Body ── */}
        <div className="tabContent" key={screen} style={{ flex: 1, overflowY: "auto", padding: "26px 20px 118px" }}>
          {screen === "form" ? (
            <>
              <div className="staggerItem" style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
                🍱 {lang === "en" ? "Daily Report" : "Laporan Harian"}
              </div>
              <div className="staggerItem" style={{ fontSize: 13, color: "var(--t3)", marginBottom: 20, animationDelay: "0.05s" }}>
                {lang === "en" ? "Fill in today's order & leftover count per shift." : "Isi jumlah order & sisa per shift untuk hari ini."}
              </div>

              <div className="staggerItem statPop" style={{ ...cardStyle, padding: 18, marginBottom: 16, animationDelay: "0.08s" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>{lang === "en" ? "REPORT DATE" : "TANGGAL LAPORAN"} *</label>
                    <input className="premiumInput" style={{ ...inputStyle, textAlign: "left" }} type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>{lang === "en" ? "SUBMITTED BY" : "DIINPUT OLEH"}</label>
                    <input className="premiumInput" style={{ ...inputStyle, textAlign: "left" }} value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} placeholder={lang === "en" ? "Canteen Operator" : "Operator Kantin"} />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
                <ShiftGrid
                  category={`🥐 Snack`}
                  order={snackOrder} leftover={snackLeftover}
                  setOrder={setSnackOrder} setLeftover={setSnackLeftover}
                  color="var(--green)" lang={lang} delay="0.11s"
                />
                <ShiftGrid
                  category={`🍱 Meal`}
                  order={mealOrder} leftover={mealLeftover}
                  setOrder={setMealOrder} setLeftover={setMealLeftover}
                  color="var(--brand)" lang={lang} delay="0.14s"
                />
              </div>

              <div className="staggerItem" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, animationDelay: "0.17s" }}>
                <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
                  <SummaryRow label={lang === "en" ? "Ordered" : "Order"} value={fmtRp(sOrd)} />
                  <SummaryRow label={lang === "en" ? "Consumed" : "Terpakai"} value={fmtRp(sCon)} color="var(--green)" />
                  <SummaryRow label={lang === "en" ? "Leftover" : "Sisa"} value={fmtRp(sLft)} color="var(--red)" />
                  <MiniBar pct={sEff} color="var(--green)" />
                  <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--green)", marginTop: 4 }}>{sEff.toFixed(1)}% eff</div>
                </div>
                <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
                  <SummaryRow label={lang === "en" ? "Ordered" : "Order"} value={fmtRp(mOrd)} />
                  <SummaryRow label={lang === "en" ? "Consumed" : "Terpakai"} value={fmtRp(mCon)} color="var(--brand)" />
                  <SummaryRow label={lang === "en" ? "Leftover" : "Sisa"} value={fmtRp(mLft)} color="var(--red)" />
                  <MiniBar pct={mEff} color="var(--brand)" />
                  <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--brand)", marginTop: 4 }}>{mEff.toFixed(1)}% eff</div>
                </div>
              </div>

              {hasOverflow && (
                <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 12.5 }}>
                  {lang === "en" ? "Leftover can't be greater than order — check the highlighted fields." : "Sisa tidak boleh lebih besar dari order — cek field yang ditandai merah."}
                </div>
              )}
            </>
          ) : (
            <SuccessScreen lang={lang} onReset={resetForm} />
          )}
        </div>

        {/* ── Bottom bar ── */}
        {screen === "form" && (
          <div style={bottomBar}>
            <button
              onClick={handleSubmit}
              disabled={!canSave || saving}
              style={{
                width: "100%", height: 52, border: "none", borderRadius: 14, fontSize: 15.5, fontWeight: 700,
                cursor: !canSave || saving ? "not-allowed" : "pointer", color: "#fff",
                background: !canSave || saving ? "var(--t3)" : "linear-gradient(135deg, var(--brand), var(--brand2))",
                opacity: !canSave || saving ? 0.6 : 1,
                boxShadow: !canSave || saving ? "none" : "var(--shadow-brand)",
              }}
            >
              {saving ? (lang === "en" ? "Saving..." : "Menyimpan...") : (lang === "en" ? "Save Report" : "Simpan Laporan")}
            </button>
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
   Shell styles
════════════════════════════════════════════════════════════ */

const outerWrap: CSSProperties = {
  minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "24px 0",
  background: "var(--grad-hero)",
  position: "relative", overflow: "hidden",
};
const appCard: CSSProperties = {
  width: "100%", maxWidth: 440, minHeight: "calc(100vh - 48px)", background: "var(--bg)", borderRadius: 28,
  boxShadow: "0 30px 70px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)", overflow: "hidden",
  display: "flex", flexDirection: "column", position: "relative", zIndex: 2,
};
const topbar: CSSProperties = {
  background: "var(--grad-hero)", padding: "20px 20px 18px",
  display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
};
const bottomBar: CSSProperties = {
  position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--surface)",
  padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)",
  boxShadow: "0 -8px 24px rgba(0,0,0,0.06)",
};
const pillIconBtn: CSSProperties = {
  background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", borderRadius: "var(--pill)",
  padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
};
const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)",
  borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)",
};
const inputStyle: CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)",
  background: "var(--bg2)", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)",
};
const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

function BackgroundBlobs() {
  return (
    <>
      <div style={{ position: "absolute", top: "-10%", left: "-15%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(23,195,178,0.35), transparent 70%)", filter: "blur(10px)", animation: "floatBlob1 14s ease-in-out infinite", zIndex: 1 }} />
      <div style={{ position: "absolute", bottom: "-15%", right: "-15%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)", filter: "blur(10px)", animation: "floatBlob2 18s ease-in-out infinite", zIndex: 1 }} />
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Pieces
════════════════════════════════════════════════════════════ */

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
      <span style={{ color: "var(--t3)" }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || "var(--t1)" }}>{value}</span>
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ marginTop: 10, height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, transition: "width 0.6s ease" }} />
    </div>
  );
}

function ShiftGrid({
  category, order, leftover, setOrder, setLeftover, color, lang, delay,
}: {
  category: string; order: [string, string, string]; leftover: [string, string, string];
  setOrder: (v: [string, string, string]) => void; setLeftover: (v: [string, string, string]) => void;
  color: string; lang: string; delay: string;
}) {
  return (
    <div className="statPop staggerItem" style={{ ...cardStyle, padding: 18, borderTop: `3px solid ${color}`, animationDelay: delay }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>{category}</div>
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div />
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase" }}>{lang === "en" ? "Order" : "Order"}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase" }}>{lang === "en" ? "Leftover" : "Sisa"}</div>
      </div>
      {SHIFT_LABELS.map((sh, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600 }}>{sh}</div>
          <input
            className="premiumInput" style={{ ...inputStyle, textAlign: "center" }} type="number" min="0" placeholder="0"
            value={order[i]}
            onChange={(e) => { const v = [...order] as [string, string, string]; v[i] = e.target.value; setOrder(v); }}
          />
          <input
            className="premiumInput"
            style={{ ...inputStyle, textAlign: "center", borderColor: Number(leftover[i]) > Number(order[i]) && Number(order[i]) > 0 ? "var(--red)" : undefined }}
            type="number" min="0" placeholder="0" value={leftover[i]}
            onChange={(e) => { const v = [...leftover] as [string, string, string]; v[i] = e.target.value; setLeftover(v); }}
          />
        </div>
      ))}
    </div>
  );
}

function SuccessScreen({ lang, onReset }: { lang: string; onReset: () => void }) {
  return (
    <div style={{ position: "relative", borderRadius: 22, padding: "34px 26px", textAlign: "center", color: "#fff", background: "linear-gradient(135deg, var(--green), #0d8a4f)", boxShadow: "0 20px 50px rgba(23,166,115,0.35)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
      <div style={{ position: "relative", width: 60, height: 60, margin: "0 auto 16px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", animation: "ringExpand 1.8s ease-out infinite" }} />
        <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, animation: "checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          ✅
        </div>
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase" }}>{lang === "en" ? "Success" : "Berhasil"}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 10 }}>
        {lang === "en" ? "Report saved" : "Laporan tersimpan"}
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 12, lineHeight: 1.6 }}>
        {lang === "en" ? "Thank you — your daily report has been recorded." : "Terima kasih — laporan harian kamu sudah tercatat."}
      </div>
      <button
        onClick={onReset}
        style={{ marginTop: 20, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
      >
        {lang === "en" ? "Enter Another Report" : "Input Laporan Lain"}
      </button>
    </div>
  );
}
