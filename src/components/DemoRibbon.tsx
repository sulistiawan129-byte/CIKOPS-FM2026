"use client";

/* Pita "DEMO" di semua halaman deployment demo. Di deployment MOCKUP (backend tiruan)
   pita ini jadi bar demo: ganti role tanpa login, lompat ke aplikasi lain, reset data. */
import { useEffect, useState } from "react";
import { DEMO_ACCOUNTS, DEMO_MODE, MOCK_MODE } from "@/lib/brand";
import { mockCurrentEmail, mockSignInAs } from "@/lib/mock/client";
import { resetDb } from "@/lib/mock/core";
import { L } from "@/lib/i18n";

const links = (): { href: string; label: string }[] => [
  { href: "/demo", label: L("🏠 Pusat demo", "🏠 Demo hub") },
  { href: "/dashboard", label: "📊 Dashboard" },
  { href: "/dashboard-viewonly", label: "📺 Command Center" },
  { href: "/driver", label: L("🚗 Aplikasi Driver", "🚗 Driver app") },
  { href: "/tga", label: L("🛠️ Aplikasi TGA", "🛠️ TGA app") },
  { href: "/request", label: L("📨 Form permintaan", "📨 Request form") },
];

export default function DemoRibbon() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { if (MOCK_MODE) setEmail(mockCurrentEmail()); }, [open]);
  if (!DEMO_MODE) return null;

  const pill = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />{L("DEMO · DATA FIKTIF", "DEMO · FICTIONAL DATA")}
    </span>
  );
  const base: React.CSSProperties = {
    position: "fixed", left: 12, bottom: 12, zIndex: 9999, font: "800 11px/1 system-ui, sans-serif", letterSpacing: ".08em", color: "#fff",
    background: "linear-gradient(135deg, #f97316, #e11d48)", boxShadow: "0 6px 18px -6px rgba(225,29,72,.6)", borderRadius: 999, border: 0,
  };
  if (!MOCK_MODE) return <div role="note" aria-label={L("Mode demo — semua data fiktif", "Demo mode — all data is fictional")} style={{ ...base, pointerEvents: "none", padding: "5px 11px", opacity: 0.92 }}>{pill}</div>;

  const current = DEMO_ACCOUNTS.find((a) => a.email === email);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ ...base, padding: "7px 12px", cursor: "pointer" }}
        title={L("Ganti role / buka aplikasi lain / reset data demo", "Switch role / open another app / reset demo data")}>
        {pill}<span style={{ marginLeft: 8, opacity: 0.9, letterSpacing: 0, fontWeight: 700 }}>{current ? `· ${current.label}` : ""} ▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label={L("Panel demo", "Demo panel")} style={{
          position: "fixed", left: 12, bottom: 50, zIndex: 9999, width: "min(320px, calc(100vw - 24px))", maxHeight: "70vh", overflow: "auto",
          padding: 12, borderRadius: 16, background: "#0f172a", color: "#e2e8f0", font: "500 13px/1.35 system-ui, sans-serif",
          boxShadow: "0 18px 50px -12px rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.1)",
        }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".08em", color: "#fb923c", marginBottom: 6 }}>{L("LIHAT SEBAGAI", "VIEW AS")}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" onClick={() => { mockSignInAs(a.email); window.location.href = "/dashboard"; }}
                style={{ textAlign: "left", padding: "7px 10px", borderRadius: 10, cursor: "pointer", font: "inherit",
                  border: `1px solid ${a.email === email ? "#fb923c" : "rgba(255,255,255,.08)"}`, background: a.email === email ? "rgba(251,146,60,.15)" : "rgba(255,255,255,.04)", color: "inherit" }}>
                <b style={{ display: "block", color: "#fff" }}>{a.label}</b><small style={{ color: "#94a3b8" }}>{a.desc}</small>
              </button>
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".08em", color: "#fb923c", margin: "12px 0 6px" }}>{L("BUKA", "OPEN")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {links().map((l) => <a key={l.href} href={l.href} style={{ padding: "6px 9px", borderRadius: 9, background: "rgba(255,255,255,.06)", color: "#e2e8f0", textDecoration: "none", fontSize: 12 }}>{l.label}</a>)}
          </div>
          <button type="button" onClick={() => { if (confirm(L("Kembalikan semua data demo ke kondisi awal?", "Restore all demo data to its initial state?"))) { resetDb(); window.location.reload(); } }}
            style={{ marginTop: 12, width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(248,113,113,.4)", background: "rgba(248,113,113,.1)", color: "#fca5a5", font: "700 12.5px system-ui", cursor: "pointer" }}>
            {L("↺ Reset data demo", "↺ Reset demo data")}
          </button>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#94a3b8" }}>{L("Semua perubahan hanya tersimpan di browser ini. Data dibuat ulang otomatis tiap hari.", "All changes are stored only in this browser. Data is regenerated automatically every day.")}</p>
        </div>
      )}
    </>
  );
}
