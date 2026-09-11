"use client";
import { useState, useEffect, useRef } from "react";
import { getGiftEvents, findGiftRegistrationByNik, claimGift } from "@/lib/api";
import type { GiftEvent, GiftRegistration } from "@/lib/types";

const NAVY = "#0F2847";
const NAVY_LIGHT = "#1F44B8";

export default function GiftLookupPage() {
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [nik, setNik] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reg, setReg] = useState<GiftRegistration | null>(null);
  const [petugas, setPetugas] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const nikInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await getGiftEvents(true);
        const lookupEvents = all.filter((e) => e.mode === "lookup");
        setEvents(lookupEvents);
        if (lookupEvents.length === 1) setEventId(lookupEvents[0].id);
      } catch {
        setEvents([]);
      }
    })();
  }, []);

  useEffect(() => {
    nikInputRef.current?.focus();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) { setError("Pilih program terlebih dahulu."); return; }
    if (!nik.trim()) { setError("Masukkan NIK."); return; }
    setLoading(true);
    setError("");
    setReg(null);
    setClaimed(false);
    try {
      const result = await findGiftRegistrationByNik(eventId, nik.trim());
      if (!result) { setError("NIK tidak ditemukan di program ini."); return; }
      setReg(result);
    } catch {
      setError("Gagal mencari data. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim() {
    if (!reg || !petugas.trim()) return;
    setClaiming(true);
    try {
      await claimGift(reg.id, petugas.trim());
      setClaimed(true);
      setReg((prev) => (prev ? { ...prev, claimed: true } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menandai pengambilan. Mungkin sudah diklaim sebelumnya.");
    } finally {
      setClaiming(false);
    }
  }

  function reset() {
    setNik(""); setReg(null); setError(""); setClaimed(false); setPetugas("");
    setTimeout(() => nikInputRef.current?.focus(), 50);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#eef2f9", display: "flex", flexDirection: "column", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
      <div style={{ background: NAVY, padding: "20px 20px 24px", textAlign: "center" }}>
        <img src="/logo.png" alt="CIKOPS" style={{ width: 52, height: 52, marginBottom: 10 }} />
        <div style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Pembagian Seragam</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>Masukkan NIK untuk melihat data pengambilan</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px 40px", width: "100%" }}>
        <div style={{ maxWidth: 560, width: "100%" }}>

          {events.length > 1 && (
            <select
              value={eventId}
              onChange={(e) => { setEventId(e.target.value); setError(""); setReg(null); }}
              style={{
                width: "100%", padding: "16px 18px", borderRadius: 16, border: "2px solid #dbe4f0", background: "#fff",
                fontSize: 16, fontWeight: 700, color: NAVY, outline: "none", boxSizing: "border-box", marginBottom: 16,
                boxShadow: "0 2px 10px rgba(15,40,71,0.06)",
              }}
            >
              <option value="">— Pilih program —</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          )}
          {events.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
              Belum ada program aktif dengan mode Import Data.
            </div>
          )}

          <form onSubmit={handleSearch} style={{ background: "#fff", borderRadius: 24, padding: "28px 24px", boxShadow: "0 8px 30px rgba(15,40,71,0.1)", marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#7c8aa0", letterSpacing: "0.06em", textAlign: "center", marginBottom: 14 }}>
              NIK KARYAWAN
            </label>
            <input
              ref={nikInputRef}
              type="text"
              inputMode="numeric"
              autoFocus
              value={nik}
              onChange={(e) => { setNik(e.target.value.replace(/\D/g, "")); setError(""); setReg(null); }}
              placeholder="000000"
              disabled={loading}
              style={{
                width: "100%", padding: "26px 16px", borderRadius: 20, border: `3px solid ${nik ? NAVY : "#dbe4f0"}`,
                background: "#f6f8fc", fontSize: "clamp(36px, 9vw, 56px)", fontWeight: 900, letterSpacing: "0.05em",
                fontFamily: "monospace", textAlign: "center", color: NAVY, outline: "none",
                boxSizing: "border-box", marginBottom: 18, transition: "border-color 0.15s ease",
              }}
            />
            {error && (
              <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 14, padding: "14px 18px", color: "#dc2626", fontSize: 15, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !nik.trim() || !eventId}
              style={{
                width: "100%", padding: "22px", borderRadius: 18, border: "none",
                background: nik.trim() && eventId ? `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})` : "#e5e7eb",
                color: nik.trim() && eventId ? "#fff" : "#9ca3af",
                fontWeight: 800, fontSize: 22, cursor: nik.trim() && eventId ? "pointer" : "default",
                boxShadow: nik.trim() && eventId ? "0 6px 20px rgba(15,40,71,0.3)" : "none",
              }}
            >
              {loading ? "Mencari..." : "🔍  CARI"}
            </button>
          </form>

          {reg && (
            <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 8px 30px rgba(15,40,71,0.1)", overflow: "hidden" }}>
              <div style={{ background: reg.claimed ? "#16a34a" : `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, padding: "20px 26px", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 30 }}>{reg.claimed ? "✅" : "🎁"}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "#fff" }}>
                    {reg.claimed ? "Sudah Diambil" : "Belum Diambil"}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                    {reg.claimed ? `Diproses oleh ${reg.claimedBy}` : reg.eventName}
                  </div>
                </div>
              </div>

              <div style={{ padding: "26px 24px" }}>
                {reg.sequenceNo && (
                  <div style={{ textAlign: "center", marginBottom: 22, paddingBottom: 22, borderBottom: "2px dashed #dbe4f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em" }}>NO.</div>
                    <div style={{ fontSize: 56, fontWeight: 900, color: NAVY, lineHeight: 1.1 }}>{reg.sequenceNo}</div>
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 22, fontSize: 16 }}>
                  <tbody>
                    {[
                      ["Nama", reg.nama],
                      ["NIK", reg.nik],
                      ["Departemen", reg.departemen],
                      ["Lokasi Pengambilan", reg.lokasiPengambilan],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "1px solid #eef2f9" }}>
                        <td style={{ padding: "10px 0", color: "#94a3b8", width: "42%" }}>{k}</td>
                        <td style={{ padding: "10px 0", fontWeight: 700, color: NAVY }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 12 }}>UKURAN YANG DITERIMA</div>
                <div style={{ display: "grid", gridTemplateColumns: reg.selections.length > 1 ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 24 }}>
                  {reg.selections.map((s, i) => (
                    <div key={i} style={{ background: "#eef2fb", borderRadius: 14, padding: "16px", textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#7c8aa0", marginBottom: 4 }}>{s.item}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: NAVY_LIGHT }}>{s.variant}</div>
                    </div>
                  ))}
                </div>

                {!reg.claimed && !claimed ? (
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#7c8aa0", letterSpacing: "0.04em", marginBottom: 10 }}>NAMA PETUGAS</label>
                    <input
                      type="text"
                      value={petugas}
                      onChange={(e) => setPetugas(e.target.value)}
                      placeholder="Nama petugas yang memproses"
                      style={{ width: "100%", padding: "16px 18px", borderRadius: 14, border: "2px solid #dbe4f0", fontSize: 16, color: NAVY, outline: "none", boxSizing: "border-box", marginBottom: 14 }}
                    />
                    <button
                      onClick={handleClaim}
                      disabled={!petugas.trim() || claiming}
                      style={{
                        width: "100%", padding: "20px", borderRadius: 16, border: "none",
                        background: petugas.trim() ? "linear-gradient(135deg,#16a34a,#22c55e)" : "#e5e7eb",
                        color: petugas.trim() ? "#fff" : "#9ca3af",
                        fontWeight: 800, fontSize: 19, cursor: petugas.trim() ? "pointer" : "default",
                      }}
                    >
                      {claiming ? "Memproses..." : "✅  TANDAI SUDAH DIAMBIL"}
                    </button>
                  </div>
                ) : (
                  <div style={{ background: "#dcfce7", borderRadius: 16, padding: "20px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontWeight: 800, color: "#166534", fontSize: 17 }}>Pengambilan berhasil dicatat!</div>
                    <div style={{ color: "#4ade80", fontSize: 13, marginTop: 4 }}>NIK ini tidak bisa diambil lagi untuk program ini.</div>
                  </div>
                )}

                <button onClick={reset} style={{ width: "100%", marginTop: 14, padding: 16, borderRadius: 14, border: "2px solid #dbe4f0", background: "#f6f8fc", color: "#7c8aa0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  Cari NIK Lain
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: "#a0aabb" }}>
        CIKOPS-FM SYSTEM — Hanya untuk petugas yang berwenang
      </div>
    </div>
  );
}
