"use client";
import { useState } from "react";
import { verifyGiftPasscode, claimGift } from "@/lib/api";
import type { GiftRegistration } from "@/lib/types";

export default function GiftVerifyPage() {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reg, setReg] = useState<GiftRegistration | null>(null);
  const [petugas, setPetugas] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = passcode.trim().replace(/\D/g, "");
    if (code.length !== 8) { setError("Passcode harus 8 digit angka."); return; }
    setLoading(true);
    setError("");
    setReg(null);
    try {
      const result = await verifyGiftPasscode(code);
      if (!result) { setError("Passcode tidak ditemukan atau sudah tidak berlaku."); return; }
      setReg(result);
    } catch (e) {
      // tampilkan pesan dari server (mis. batas percobaan passcode), selain itu pesan umum
      const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
      setError(m && !/fetch|network/i.test(m) ? m : "Gagal memverifikasi. Periksa koneksi internet.");
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
      setReg(prev => prev ? { ...prev, claimed: true } : prev);
    } catch {
      alert("Gagal menandai pengambilan. Mungkin sudah diklaim sebelumnya.");
    } finally {
      setClaiming(false);
    }
  }

  function reset() {
    setPasscode(""); setReg(null); setError(""); setClaimed(false); setPetugas("");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4fb", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="CIKOPS" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 14 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1c3e82", margin: "0 0 4px" }}>Verifikasi Pengambilan</h1>
          <p style={{ color: "#7a86aa", fontSize: 13, margin: 0 }}>Masukkan passcode 8 digit dari karyawan</p>
        </div>

        {/* Passcode input */}
        <form onSubmit={handleVerify} style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#7a86aa", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            Passcode
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={passcode}
            onChange={e => { setPasscode(e.target.value.replace(/\D/g, "")); setError(""); setReg(null); }}
            placeholder="00000000"
            disabled={loading}
            style={{ width: "100%", padding: "16px 18px", borderRadius: 14, border: "2px solid #dfe6f3", background: "#f8faff", fontSize: 28, fontWeight: 800, letterSpacing: 8, fontFamily: "monospace", textAlign: "center", color: "#1c3e82", outline: "none", boxSizing: "border-box", marginBottom: 14 }}
          />
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", color: "#dc2626", fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading || passcode.length !== 8} style={{
            width: "100%", padding: 14, borderRadius: 14, border: "none",
            background: passcode.length === 8 ? "linear-gradient(135deg,#1c3e82,#3d6ff2)" : "#e5e7eb",
            color: passcode.length === 8 ? "#fff" : "#9ca3af",
            fontWeight: 700, fontSize: 15, cursor: passcode.length === 8 ? "pointer" : "default",
          }}>
            {loading ? "Memeriksa..." : "Cek Passcode"}
          </button>
        </form>

        {/* Result card */}
        {reg && (
          <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            {/* Status banner */}
            <div style={{ background: reg.claimed ? "#dcfce7" : "linear-gradient(135deg,#1c3e82,#3d6ff2)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>{reg.claimed ? "✅" : "🎁"}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: reg.claimed ? "#166534" : "#fff" }}>
                  {reg.claimed ? "Sudah Diambil" : "Belum Diambil"}
                </div>
                <div style={{ fontSize: 12, color: reg.claimed ? "#4ade80" : "rgba(255,255,255,0.7)" }}>
                  {reg.claimed ? `Diproses oleh ${reg.claimedBy}` : reg.eventName}
                </div>
              </div>
            </div>

            {/* Data karyawan */}
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a86aa", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Data Karyawan</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
                <tbody>
                  {[
                    ["NIK", reg.nik],
                    ["Nama", reg.nama],
                    ["Departemen", reg.departemen],
                    ["Email", reg.email],
                    ["Program", reg.eventName],
                    ["Terdaftar", new Date(reg.registeredAt).toLocaleString("id-ID")],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #edf0f7" }}>
                      <td style={{ padding: "9px 0", fontSize: 13, color: "#7a86aa", width: "40%" }}>{k}</td>
                      <td style={{ padding: "9px 0", fontSize: 13, color: "#1a2540", fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pilihan item */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a86aa", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Item yang Diambil</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {reg.selections.map(s => (
                  <div key={s.item} style={{ background: "#eef2fb", borderRadius: 10, padding: "8px 16px", fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: "#1c3e82" }}>{s.item}</span>
                    {s.variant && <span style={{ color: "#3d6ff2", fontWeight: 800 }}> — {s.variant}</span>}
                  </div>
                ))}
              </div>

              {/* Action */}
              {!reg.claimed && !claimed ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#7a86aa", letterSpacing: 1, marginBottom: 8 }}>NAMA PETUGAS</div>
                  <input
                    type="text"
                    value={petugas}
                    onChange={e => setPetugas(e.target.value)}
                    placeholder="Nama petugas yang memproses"
                    style={{ width: "100%", padding: "12px 15px", borderRadius: 12, border: "1.5px solid #dfe6f3", fontSize: 14, color: "#1a2540", outline: "none", boxSizing: "border-box", marginBottom: 12 }}
                  />
                  <button onClick={handleClaim} disabled={!petugas.trim() || claiming} style={{
                    width: "100%", padding: 14, borderRadius: 14, border: "none",
                    background: petugas.trim() ? "linear-gradient(135deg,#16a34a,#22c55e)" : "#e5e7eb",
                    color: petugas.trim() ? "#fff" : "#9ca3af",
                    fontWeight: 800, fontSize: 15, cursor: petugas.trim() ? "pointer" : "default",
                  }}>
                    {claiming ? "Memproses..." : "✅ Tandai Sudah Diambil"}
                  </button>
                </div>
              ) : (
                <div style={{ background: "#dcfce7", borderRadius: 14, padding: "16px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontWeight: 800, color: "#166534", fontSize: 15 }}>Pengambilan berhasil dicatat!</div>
                  <div style={{ color: "#4ade80", fontSize: 12, marginTop: 4 }}>Passcode ini tidak dapat digunakan lagi.</div>
                </div>
              )}

              <button onClick={reset} style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 12, border: "1.5px solid #dfe6f3", background: "#f8faff", color: "#7a86aa", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Cek Passcode Lain
              </button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "#a0aac0" }}>
          CIKOPS-FM SYSTEM — Hanya untuk petugas yang berwenang
        </div>
      </div>
    </div>
  );
}
