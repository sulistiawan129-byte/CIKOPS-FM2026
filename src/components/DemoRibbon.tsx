"use client";

/* Pita kecil "DEMO" di semua halaman deployment demo (NEXT_PUBLIC_DEMO_MODE=1). */
import { DEMO_MODE } from "@/lib/brand";

export default function DemoRibbon() {
  if (!DEMO_MODE) return null;
  return (
    <div role="note" aria-label="Mode demo — semua data fiktif" style={{
      position: "fixed", left: 12, bottom: 12, zIndex: 9999, pointerEvents: "none",
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999,
      font: "800 11px/1 system-ui, sans-serif", letterSpacing: ".08em", color: "#fff",
      background: "linear-gradient(135deg, #f97316, #e11d48)", boxShadow: "0 6px 18px -6px rgba(225,29,72,.6)", opacity: .92,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />DEMO · DATA FIKTIF
    </div>
  );
}
