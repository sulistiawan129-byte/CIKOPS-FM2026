"use client";
import { useState, useEffect, useRef } from "react";
import { getGiftEvents, findGiftRegistrationByNik, claimGift } from "@/lib/api";
import type { GiftEvent, GiftRegistration } from "@/lib/types";

const NAVY = "#0F2847";
const NAVY_LIGHT = "#1F44B8";

/** Layar laptop/desktop (lebar) tampil 2 kolom sejajar (form kiri,
 *  hasil kanan) supaya tidak perlu scroll. HP/tablet (sempit) tetap
 *  tampilan tumpuk seperti biasa. */
function useIsWideScreen(breakpoint = 860) {
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    function check() { setIsWide(window.innerWidth >= breakpoint); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isWide;
}

/** Cek apakah nilai sebuah "slot" harus dianggap KOSONG — bukan cuma
 *  string kosong "", tapi juga karakter Unicode Replacement (U+FFFD,
 *  tampil sebagai "�") yang muncul kalau file CSV sumbernya disimpan
 *  dengan encoding selain UTF-8 (byte yang tidak valid otomatis
 *  diganti jadi karakter ini saat dibaca browser). Tanpa pengecekan
 *  ini, sel yang sebenarnya kosong di Excel malah kelihatan "ada
 *  isinya" karena bukan string kosong murni. */
function isBlankSlotValue(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = v.trim();
  if (t === "") return true;
  // seluruh isi cuma terdiri dari replacement character (satu atau lebih)
  return /^\uFFFD+$/.test(t);
}

/** Parse teks ukuran — kalau formatnya "size - Free Entry" (anak di
 *  bawah 2 tahun), pisahkan ukurannya dari label "Free Entry" dan
 *  tandai isFreeEntry=true. Slot Free Entry TETAP dapat baju, tapi
 *  TIDAK dapat tiket event. */
function parseGiftSize(variant: string): { size: string; isFreeEntry: boolean } {
  const t = variant.trim();
  const m = /^(.*?)\s*-\s*free\s*entry\s*$/i.exec(t);
  if (m) return { size: m[1].trim(), isFreeEntry: true };
  return { size: t, isFreeEntry: false };
}

export default function GiftLookupPage() {
  const isWide = useIsWideScreen();
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [nik, setNik] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reg, setReg] = useState<GiftRegistration | null>(null);
  const [petugas, setPetugas] = useState("");
  const [petugasInput, setPetugasInput] = useState(""); // draft saat isi form 1x di awal
  const [showPetugasPrompt, setShowPetugasPrompt] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const nikInputRef = useRef<HTMLInputElement>(null);

  // Nama petugas cukup diisi SEKALI per perangkat (tersimpan di
  // localStorage) — supaya tidak perlu ketik ulang setiap kali klaim,
  // biar prosesnya cepat pas antrian panjang.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("gift_petugas_name") : null;
    if (saved && saved.trim()) {
      setPetugas(saved);
    } else {
      setShowPetugasPrompt(true);
    }
  }, []);

  function savePetugasName() {
    const name = petugasInput.trim();
    if (!name) return;
    localStorage.setItem("gift_petugas_name", name);
    setPetugas(name);
    setShowPetugasPrompt(false);
    setTimeout(() => nikInputRef.current?.focus(), 50);
  }

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
    if (!showPetugasPrompt) nikInputRef.current?.focus();
  }, [showPetugasPrompt]);

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
      setReg((prev) => (prev ? { ...prev, claimed: true, claimedBy: petugas, claimedAt: new Date().toISOString() } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menandai pengambilan. Mungkin sudah diklaim sebelumnya.");
      // Kemungkinan besar operator LAIN sudah lebih dulu klaim NIK yang
      // sama (3 petugas jalan bersamaan) — ambil ulang data terbaru
      // supaya layar langsung menampilkan status SEBENARNYA, bukan
      // status lama yang bisa bikin operator coba klik berkali-kali.
      if (eventId) {
        try {
          const fresh = await findGiftRegistrationByNik(eventId, reg.nik);
          if (fresh) setReg(fresh);
        } catch { /* biarkan status lama kalau refresh juga gagal */ }
      }
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
      <div style={{ background: NAVY, padding: "20px 20px 24px", textAlign: "center", position: "relative" }}>
        <img src="/logo.png" alt="CIKOPS" style={{ width: 52, height: 52, marginBottom: 10 }} />
        <div style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Pembagian Seragam</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>Masukkan NIK untuk melihat data pengambilan</div>
        {petugas && (
          <div style={{ position: "absolute", top: 16, right: 16, textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Petugas</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{petugas}</div>
            <button
              onClick={() => { setPetugasInput(petugas); setShowPetugasPrompt(true); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 11, textDecoration: "underline", cursor: "pointer", padding: 0, marginTop: 2 }}
            >
              Ganti
            </button>
          </div>
        )}
      </div>

      {showPetugasPrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,40,71,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 40, textAlign: "center", marginBottom: 10 }}>👋</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, textAlign: "center", marginBottom: 4 }}>Nama Petugas</div>
            <div style={{ fontSize: 13, color: "#7c8aa0", textAlign: "center", marginBottom: 18 }}>
              Diisi 1x saja untuk perangkat ini — tidak perlu diulang tiap kali proses pengambilan.
            </div>
            <input
              type="text"
              value={petugasInput}
              onChange={(e) => setPetugasInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePetugasName(); }}
              placeholder="Nama Anda"
              autoFocus
              style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #dbe4f0", fontSize: 16, color: NAVY, outline: "none", boxSizing: "border-box", marginBottom: 14, textAlign: "center", fontWeight: 700 }}
            />
            <button
              onClick={savePetugasName}
              disabled={!petugasInput.trim()}
              style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: petugasInput.trim() ? `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})` : "#e5e7eb",
                color: petugasInput.trim() ? "#fff" : "#9ca3af",
                fontWeight: 800, fontSize: 15, cursor: petugasInput.trim() ? "pointer" : "default",
              }}
            >
              Mulai
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: isWide ? "24px 24px 0" : "24px 16px 40px", width: "100%" }}>
        <div style={{ maxWidth: isWide ? "none" : 560, width: "100%", display: "flex", flexDirection: isWide ? "row" : "column", alignItems: "flex-start", gap: isWide ? 24 : 0 }}>
        <div style={{ width: isWide ? 420 : "100%", flexShrink: 0 }}>

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
        </div>

        <div style={{ flex: 1, width: "100%", minWidth: 0 }}>
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

              <div style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

                  {/* ── Sub-kolom KIRI: identitas karyawan ── */}
                  <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                    {reg.sequenceNo && (
                      <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "2px dashed #dbe4f0" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em" }}>NO.</div>
                        <div style={{ fontSize: 42, fontWeight: 900, color: NAVY, lineHeight: 1.1 }}>{reg.sequenceNo}</div>
                      </div>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <tbody>
                        {[
                          ["Nama", reg.nama],
                          ["NIK", reg.nik],
                          ["Departemen", reg.departemen],
                          ["Lokasi Pengambilan", reg.lokasiPengambilan],
                        ].filter(([, v]) => v).map(([k, v]) => (
                          <tr key={k} style={{ borderBottom: "1px solid #eef2f9" }}>
                            <td style={{ padding: "8px 0", color: "#94a3b8", width: "44%" }}>{k}</td>
                            <td style={{ padding: "8px 0", fontWeight: 700, color: NAVY }}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button onClick={reset} style={{ width: "100%", marginTop: 16, padding: 13, borderRadius: 12, border: "2px solid #dbe4f0", background: "#f6f8fc", color: "#7c8aa0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                      Cari NIK Lain
                    </button>
                  </div>

                  {/* ── Sub-kolom KANAN: detail hadiah + aksi ── */}
                  <div style={{ flex: "1.3 1 300px", minWidth: 260 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 10 }}>UKURAN YANG DITERIMA</div>
                    {(() => {
                      const filledSizes = reg.selections.filter((s) => !isBlankSlotValue(s.variant));
                      const parsed = filledSizes.map((s) => ({ ...s, parsed: parseGiftSize(String(s.variant)) }));
                      const ticketCount = parsed.filter((p) => !p.parsed.isFreeEntry).length;
                      return (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div style={{ background: "#eef2fb", borderRadius: 12, padding: "10px 14px" }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7c8aa0", marginBottom: 2 }}>TOTAL BAJU</div>
                              <div style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{filledSizes.length}</div>
                            </div>
                            <div style={{ background: "#fff8e6", borderRadius: 12, padding: "10px 14px" }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a87c1f", marginBottom: 2 }}>🎟️ TIKET EVENT</div>
                              <div style={{ fontSize: 20, fontWeight: 900, color: "#a87c1f" }}>{ticketCount}</div>
                            </div>
                          </div>
                          <div style={{ border: "1.5px solid #dbe4f0", borderRadius: 12, overflow: "hidden", maxHeight: 168, overflowY: "auto" }}>
                            {parsed.length === 0 ? (
                              <div style={{ padding: 14, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>-</div>
                            ) : (
                              parsed.map((s, i) => (
                                <div
                                  key={i}
                                  style={{
                                    padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                                    borderBottom: i < parsed.length - 1 ? "1px solid #eef2f9" : "none",
                                  }}
                                >
                                  <span style={{ fontSize: 13, color: "#7c8aa0", fontWeight: 700 }}>{i + 1}</span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {s.parsed.isFreeEntry && (
                                      <span style={{ fontSize: 10, fontWeight: 800, color: "#dc2626", background: "#fef2f2", padding: "2px 8px", borderRadius: 999 }}>
                                        GRATIS · NO TIKET
                                      </span>
                                    )}
                                    <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{s.parsed.size}</span>
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {!reg.claimed && !claimed ? (
                      <div>
                        <button
                          onClick={handleClaim}
                          disabled={claiming}
                          style={{
                            width: "100%", padding: "15px", borderRadius: 14, border: "none",
                            background: "linear-gradient(135deg,#16a34a,#22c55e)",
                            color: "#fff",
                            fontWeight: 800, fontSize: 15.5, cursor: claiming ? "default" : "pointer",
                            opacity: claiming ? 0.7 : 1,
                          }}
                        >
                          {claiming ? "Memproses..." : "✅  TANDAI SUDAH DIAMBIL"}
                        </button>
                      </div>
                    ) : (
                      <div style={{ background: "#dcfce7", borderRadius: 14, padding: "16px", textAlign: "center" }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
                        <div style={{ fontWeight: 800, color: "#166534", fontSize: 15 }}>Pengambilan berhasil dicatat!</div>
                        <div style={{ color: "#4ade80", fontSize: 12, marginTop: 4 }}>NIK ini tidak bisa diambil lagi.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {!reg && isWide && (
            <div style={{ background: "#fff", borderRadius: 24, minHeight: "calc(100vh - 220px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#a0aabb" }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
              <div style={{ fontSize: 15 }}>Hasil pencarian akan muncul di sini</div>
            </div>
          )}
        </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: "#a0aabb" }}>
        CIKOPS-FM SYSTEM — Hanya untuk petugas yang berwenang
      </div>
    </div>
  );
}
