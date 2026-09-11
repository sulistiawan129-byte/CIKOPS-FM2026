"use client";
import { useEffect, useState } from "react";
import {
  getGiftEvents,
  generateGiftPasscode,
  registerGift,
} from "@/lib/api";
import type { GiftEvent, GiftSelection } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";

type Screen = "list" | "form" | "success";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function GiftPage() {
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("list");
  const [selectedEvent, setSelectedEvent] = useState<GiftEvent | null>(null);

  // Form fields
  const [nik, setNik] = useState("");
  const [nama, setNama] = useState("");
  const [departemen, setDepartemen] = useState("");
  const [email, setEmail] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Success state
  const [passcode, setPasscode] = useState("");
  const [successData, setSuccessData] = useState<{ nama: string; eventName: string; selections: GiftSelection[] } | null>(null);

  // Email sending
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    getGiftEvents(true).then((all) => setEvents(all.filter((e) => e.mode === "self_register"))).finally(() => setLoading(false));
  }, []);

  function selectEvent(ev: GiftEvent) {
    setSelectedEvent(ev);
    // init selections
    const init: Record<string, string> = {};
    ev.items.forEach(item => { init[item.name] = item.variants[0] ?? ""; });
    setSelections(init);
    setScreen("form");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) return;
    if (!nik.trim() || !nama.trim() || !departemen.trim() || !email.trim()) {
      setError("Semua kolom wajib diisi."); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Format email tidak valid."); return;
    }

    const sels: GiftSelection[] = selectedEvent.items.map(item => ({
      item: item.name,
      variant: selections[item.name] ?? "",
    }));

    const pc = generateGiftPasscode();
    setSaving(true);
    setError("");
    try {
      const res = await registerGift({
        eventId: selectedEvent.id,
        nik: nik.trim(),
        nama: nama.trim(),
        departemen: departemen.trim(),
        email: email.trim(),
        selections: sels,
        passcode: pc,
      });

      if (!res.success) {
        if (res.errorCode === "ALREADY_REGISTERED") {
          setError("NIK ini sudah terdaftar untuk event ini.");
        } else if (res.errorCode === "EVENT_CLOSED") {
          setError("Pendaftaran untuk event ini sudah ditutup.");
        } else {
          setError(`Gagal mendaftar: ${res.errorCode ?? "error tidak diketahui"}`);
        }
        return;
      }

      // Send email via edge function
      try {
        await supabase.functions.invoke("send-gift-passcode", {
          body: { email: email.trim(), nama: nama.trim(), eventName: selectedEvent.name, passcode: pc, selections: sels },
        });
        setEmailSent(true);
      } catch {
        setEmailSent(false); // email gagal tapi pendaftaran berhasil
      }

      setPasscode(pc);
      setSuccessData({ nama: nama.trim(), eventName: selectedEvent.name, selections: sels });
      setScreen("success");
    } catch (err) {
      const msg = (err instanceof Error ? err.message : null) ||
        (err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : null) ||
        "Terjadi kesalahan. Coba lagi.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── LIST SCREEN ───────────────────────────────────────────────
  if (screen === "list") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0f2757 0%,#1c3e82 50%,#1a5276 100%)", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", padding: "48px 0 36px" }}>
          <img src="/logo.png" alt="CIKOPS" style={{ width: 70, height: 70, marginBottom: 16, borderRadius: "50%" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            PT. FRISIAN FLAG INDONESIA
          </div>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: "0 0 8px", letterSpacing: -0.5 }}>
            Pendaftaran Pengambilan
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, margin: 0 }}>
            Pilih program di bawah ini untuk mendaftar
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", padding: 40 }}>Memuat data...</div>
        ) : events.length === 0 ? (
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
            <div style={{ color: "#fff", fontWeight: 700, marginBottom: 6 }}>Belum ada program aktif</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Hubungi tim GA untuk informasi lebih lanjut.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {events.map(ev => (
              <button key={ev.id} onClick={() => selectEvent(ev)} style={{
                background: "rgba(255,255,255,0.10)",
                border: "1.5px solid rgba(255,255,255,0.2)",
                backdropFilter: "blur(12px)",
                borderRadius: 18,
                padding: "20px 22px",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.17)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{ev.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "#22c55e", color: "#fff", padding: "3px 10px", borderRadius: 999, flexShrink: 0, marginLeft: 10 }}>
                    BUKA
                  </span>
                </div>
                {ev.description && (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 10 }}>{ev.description}</div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ev.items.map(item => (
                    <span key={item.name} style={{ fontSize: 12, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", padding: "4px 12px", borderRadius: 999 }}>
                      {item.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
                  Dibuka {fmtDate(ev.createdAt)}
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 40, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          CIKOPS-FM SYSTEM
        </div>
      </div>
    </div>
  );

  // ── FORM SCREEN ───────────────────────────────────────────────
  if (screen === "form" && selectedEvent) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0f2757 0%,#1c3e82 50%,#1a5276 100%)", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ padding: "32px 0 24px" }}>
          <button onClick={() => setScreen("list")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
            ← Kembali
          </button>
          <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{selectedEvent.name}</h2>
          {selectedEvent.description && (
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>{selectedEvent.description}</p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.18)", padding: "24px 20px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 18 }}>Data Karyawan</div>

            {[
              { label: "NIK / No. Karyawan", value: nik, set: setNik, type: "text", placeholder: "Contoh: 1234567890" },
              { label: "Nama Lengkap", value: nama, set: setNama, type: "text", placeholder: "Sesuai data karyawan" },
              { label: "Departemen", value: departemen, set: setDepartemen, type: "text", placeholder: "Contoh: Operations" },
              { label: "Email", value: email, set: setEmail, type: "email", placeholder: "email@example.com" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 7 }}>{f.label}</label>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  disabled={saving}
                  style={{ width: "100%", padding: "13px 15px", borderRadius: 13, border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.10)", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            ))}
          </div>

          {/* Item selections */}
          <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.18)", padding: "24px 20px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 18 }}>Pilihan Item</div>
            {selectedEvent.items.map(item => (
              <div key={item.name} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{item.name}</div>
                {item.variants.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {item.variants.map(v => (
                      <button key={v} type="button"
                        onClick={() => setSelections(s => ({ ...s, [item.name]: v }))}
                        style={{
                          padding: "8px 18px", borderRadius: 10, border: "2px solid",
                          borderColor: selections[item.name] === v ? "#fff" : "rgba(255,255,255,0.25)",
                          background: selections[item.name] === v ? "#fff" : "transparent",
                          color: selections[item.name] === v ? "#1c3e82" : "#fff",
                          fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.15s",
                        }}
                      >{v}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Semua ukuran/varian sama</div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "12px 16px", marginBottom: 14, color: "#fca5a5", fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} style={{
            width: "100%", padding: 16, borderRadius: 16, border: "none",
            background: saving ? "rgba(255,255,255,0.3)" : "#fff",
            color: "#1c3e82", fontWeight: 800, fontSize: 16, cursor: saving ? "default" : "pointer", transition: "all 0.15s",
          }}>
            {saving ? "Mendaftar..." : "Daftar Sekarang"}
          </button>
        </form>
      </div>
    </div>
  );

  // ── SUCCESS SCREEN ────────────────────────────────────────────
  if (screen === "success" && successData) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0f2757 0%,#1c3e82 50%,#1a5276 100%)", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>Pendaftaran Berhasil!</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, margin: 0 }}>
            {emailSent ? `Passcode juga sudah dikirim ke ${email}` : "Simpan passcode di bawah ini — screenshot sekarang"}
          </p>
        </div>

        {/* Passcode card */}
        <div style={{ background: "#fff", borderRadius: 24, padding: 28, textAlign: "center", marginBottom: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7a86aa", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
            PASSCODE PENGAMBILAN
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: "#1c3e82", letterSpacing: 8, fontFamily: "monospace", marginBottom: 12 }}>
            {passcode}
          </div>
          <div style={{ fontSize: 12, color: "#a0aac0" }}>
            Tunjukkan passcode ini ke petugas saat pengambilan
          </div>
        </div>

        {/* Detail */}
        <div style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(12px)", borderRadius: 18, border: "1.5px solid rgba(255,255,255,0.2)", padding: "20px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Detail Pendaftaran</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <tbody>
              {[
                ["Program", successData.eventName],
                ["Nama", successData.nama],
                ["NIK", nik],
                ["Departemen", departemen],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "8px 0", color: "rgba(255,255,255,0.5)" }}>{k}</td>
                  <td style={{ padding: "8px 0", color: "#fff", fontWeight: 600, textAlign: "right" }}>{v}</td>
                </tr>
              ))}
              {successData.selections.filter(s => s.variant).map(s => (
                <tr key={s.item} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "8px 0", color: "rgba(255,255,255,0.5)" }}>{s.item}</td>
                  <td style={{ padding: "8px 0", color: "#fff", fontWeight: 600, textAlign: "right" }}>{s.variant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 14, padding: "12px 16px", color: "#fde68a", fontSize: 12.5, lineHeight: 1.6 }}>
          ⚠️ Simpan screenshot halaman ini. Passcode hanya berlaku satu kali dan tidak bisa diulang setelah barang diambil.
        </div>
      </div>
    </div>
  );

  return null;
}
