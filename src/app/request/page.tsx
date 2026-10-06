"use client";
import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { submitEmployeeRequest, submitPrinterRequestPublic, getPrinterLocationsPublic } from "@/lib/api";

type FormKind = "DRIVER" | "PRINTER" | "OTHER";

/** Identitas dokumen resmi di bukti cetak — ubah di sini kalau ada
 *  pergantian administrator atau data perusahaan. */
const COMPANY_NAME = "PT. Frisian Flag Indonesia - Plant Cikarang";
const SYSTEM_NAME = "CIKOPS Fleet Management";
const ADMIN_NAME = "Sulistiawan";
const ADMIN_DEPARTMENT = "Facility Management";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "13px 15px",
  borderRadius: 12,
  border: "1.5px solid #e1e8f5",
  background: "#eef3fc",
  fontSize: 14.5,
  color: "#0d1a36",
  fontFamily: "inherit",
  outline: "none",
};
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: "#44537a", marginBottom: 6, display: "block", letterSpacing: "0.02em" };

function todayLabel(): string {
  return new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Receipt {
  refId: string;
  createdAt: string;
  kind: FormKind;
  employeeName: string;
  department: string;
  lines: { label: string; value: string }[];
}

export default function RequestPage() {
  const [kind, setKind] = useState<FormKind>("DRIVER");
  const [employeeName, setEmployeeName] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");

  // Driver fields
  const [eventDate, setEventDate] = useState(todayISO());
  const [destination, setDestination] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Printer fields
  const [printAction, setPrintAction] = useState<"RESET_KUOTA" | "TAMBAH_KUOTA">("RESET_KUOTA");
  const [printUserId, setPrintUserId] = useState("");
  const [printReason, setPrintReason] = useState("");
  const [printerLocations, setPrinterLocations] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Other fields
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    getPrinterLocationsPublic().then(setPrinterLocations).catch(() => {});
  }, []);

  function toggleArea(area: string) {
    setSelectedAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  }

  function resetAll() {
    setKind("DRIVER");
    setEmployeeName(""); setDepartment(""); setPhone("");
    setEventDate(todayISO()); setDestination(""); setDepartureTime(""); setPurpose(""); setAdditionalNotes("");
    setPrintAction("RESET_KUOTA"); setPrintUserId(""); setPrintReason(""); setSelectedAreas([]);
    setDescription("");
    setReceipt(null); setError("");
  }

  const canSubmit =
    employeeName.trim() !== "" &&
    !submitting &&
    (kind === "DRIVER"
      ? eventDate !== "" && destination.trim() !== "" && departureTime !== "" && purpose.trim() !== ""
      : kind === "PRINTER"
      ? printAction === "RESET_KUOTA"
        ? selectedAreas.length > 0
        : printUserId.trim() !== ""
      : description.trim() !== "");

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      if (kind === "DRIVER") {
        const result = await submitEmployeeRequest({
          requestType: "DRIVER",
          employeeName: employeeName.trim(),
          department: department.trim(),
          phone: phone.trim(),
          description: purpose.trim(),
          details: { eventDate, destination: destination.trim(), departureTime, purpose: purpose.trim(), additionalNotes: additionalNotes.trim() },
        });
        setReceipt({
          refId: result.id, createdAt: result.createdAt, kind, employeeName: employeeName.trim(), department: department.trim(),
          lines: [
            { label: "Tanggal Event/Acara", value: new Date(eventDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) },
            { label: "Tujuan", value: destination.trim() },
            { label: "Jam Berangkat", value: departureTime },
            { label: "Keperluan", value: purpose.trim() },
            ...(additionalNotes.trim() ? [{ label: "Catatan Tambahan", value: additionalNotes.trim() }] : []),
          ],
        });
      } else if (kind === "PRINTER") {
        const combinedNotes = printAction === "TAMBAH_KUOTA"
          ? `userid : ${printUserId.trim()}\n${printReason.trim()}`
          : printReason.trim();
        const result = await submitPrinterRequestPublic({
          requestType: printAction,
          employeeName: employeeName.trim(),
          department: department.trim(),
          printUserId: printAction === "TAMBAH_KUOTA" ? printUserId.trim() : undefined,
          locations: printAction === "RESET_KUOTA" ? selectedAreas : undefined,
          notes: combinedNotes,
        });
        setReceipt({
          refId: result.id, createdAt: result.createdAt, kind, employeeName: employeeName.trim(), department: department.trim(),
          lines: [
            { label: "Jenis Permintaan", value: printAction === "RESET_KUOTA" ? "Reset Kuota" : "Tambah Kuota" },
            ...(printAction === "RESET_KUOTA"
              ? [{ label: "Area / Lokasi", value: selectedAreas.join(", ") }]
              : [{ label: "User ID Print", value: printUserId.trim() }]),
            ...(printAction === "TAMBAH_KUOTA" ? [{ label: "Alasan / Keperluan", value: printReason.trim() }] : []),
          ],
        });
      } else {
        const result = await submitEmployeeRequest({
          requestType: "OTHER",
          employeeName: employeeName.trim(),
          department: department.trim(),
          phone: phone.trim(),
          description: description.trim(),
        });
        setReceipt({
          refId: result.id, createdAt: result.createdAt, kind, employeeName: employeeName.trim(), department: department.trim(),
          lines: [{ label: "Detail Permintaan", value: description.trim() }],
        });
      }
    } catch (e) {
      const parts: string[] = [];
      if (e instanceof Error) parts.push(e.message);
      const anyE = e as { code?: string; details?: string; hint?: string } | null;
      if (anyE?.code) parts.push(`Code: ${anyE.code}`);
      if (anyE?.details) parts.push(`Details: ${anyE.details}`);
      if (anyE?.hint) parts.push(`Hint: ${anyE.hint}`);
      setError(parts.length > 0 ? parts.join(" — ") : `Gagal mengirim permintaan (unknown error): ${JSON.stringify(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    const kindLabel = receipt.kind === "DRIVER" ? "Request Driver / Kendaraan" : receipt.kind === "PRINTER" ? "Permintaan Kuota Printer" : "Permintaan Lainnya";
    const refNo = `REQ-${new Date(receipt.createdAt).toISOString().slice(0, 10).replace(/-/g, "")}-${receipt.refId.slice(0, 6).toUpperCase()}`;
    return (
      <div style={{ minHeight: "100vh", background: "#eef3fc", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div id="receipt-print-area" style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 40px rgba(15,40,71,0.12)", overflow: "hidden", border: "1px solid #cfd9ee" }}>

            {/* ── Kop surat ── */}
            <div style={{ padding: "24px 28px 18px", borderBottom: "3px solid #0d1a36", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 10, background: "#0d1a36", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                <img src="/logo.png" alt="CIKOPS" style={{ width: "80%", height: "80%", objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: "#0d1a36", lineHeight: 1.3 }}>{COMPANY_NAME}</div>
                <div style={{ fontSize: 12.5, color: "#44537a", fontWeight: 600 }}>{SYSTEM_NAME}</div>
                <div style={{ fontSize: 11, color: "#7886a8" }}>Departemen Facility Management</div>
              </div>
            </div>

            {/* ── Judul dokumen ── */}
            <div style={{ padding: "18px 28px 14px", textAlign: "center", background: "#f6f9ff" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0d1a36", letterSpacing: "0.04em" }}>BUKTI PERMINTAAN</div>
              <div style={{ fontSize: 11.5, color: "#7886a8", fontFamily: "monospace", marginTop: 3 }}>No. {refNo}</div>
            </div>

            <div style={{ padding: "20px 28px" }}>
              {/* ── Info dasar ── */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "5px 0", color: "#7886a8", width: "38%" }}>Tanggal Pengajuan</td>
                    <td style={{ padding: "5px 0", fontWeight: 700, color: "#0d1a36" }}>: {new Date(receipt.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "5px 0", color: "#7886a8" }}>Jenis Permintaan</td>
                    <td style={{ padding: "5px 0", fontWeight: 700, color: "#0d1a36" }}>: {kindLabel}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "5px 0", color: "#7886a8" }}>Nama Pemohon</td>
                    <td style={{ padding: "5px 0", fontWeight: 700, color: "#0d1a36" }}>: {receipt.employeeName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "5px 0", color: "#7886a8" }}>Departemen</td>
                    <td style={{ padding: "5px 0", fontWeight: 700, color: "#0d1a36" }}>: {receipt.department || "-"}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Detail permintaan ── */}
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7886a8", letterSpacing: "0.06em", marginBottom: 8, borderTop: "1px solid #eef3fc", paddingTop: 14 }}>
                DETAIL PERMINTAAN
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 18 }}>
                <tbody>
                  {receipt.lines.map((l) => (
                    <tr key={l.label}>
                      <td style={{ padding: "5px 0", color: "#7886a8", width: "38%", verticalAlign: "top" }}>{l.label}</td>
                      <td style={{ padding: "5px 0", fontWeight: 700, color: "#0d1a36" }}>: {l.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ textAlign: "center", padding: "10px 0", background: "#fdf1d6", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#a35f00", letterSpacing: "0.03em", marginBottom: 22 }}>
                STATUS: MENUNGGU DIPROSES
              </div>

              {/* ── Blok administrator / penanggung jawab ── */}
              <div style={{ borderTop: "1px dashed #cfd9ee", paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <div style={{ textAlign: "center", minWidth: 170 }}>
                  <div style={{ fontSize: 11, color: "#7886a8", marginBottom: 46 }}>Diterima &amp; diproses oleh,</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0d1a36", borderTop: "1px solid #0d1a36", paddingTop: 4 }}>{ADMIN_NAME}</div>
                  <div style={{ fontSize: 11.5, color: "#7886a8" }}>{ADMIN_DEPARTMENT}</div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: "center", padding: "10px 0", fontSize: 10, color: "#a0aabb", borderTop: "1px solid #eef3fc" }}>
              Dokumen ini digenerate otomatis oleh sistem {SYSTEM_NAME}
            </div>
          </div>

          <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={resetAll} style={{ flex: 1, padding: 14, borderRadius: 14, border: "1.5px solid #cfd9ee", background: "#fff", color: "#44537a", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Kirim Permintaan Lain
            </button>
            <button onClick={() => window.print()} style={{ flex: 1, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#2d5bff,#1d44d6)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              🖨️ Cetak Bukti

            </button>
          </div>
        </div>

        <style>{`
          @media print {
            @page { margin: 16mm; }
            .no-print { display: none !important; }
            body * { visibility: hidden; }
            #receipt-print-area, #receipt-print-area * { visibility: visible; }
            #receipt-print-area { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; border: none !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a1930, #0d1a36)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "-apple-system, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#ffffff", borderRadius: 24, padding: 30, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#0d1a36", border: "2px solid #2d5bff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", overflow: "hidden" }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0d1a36" }}>Form Permintaan Karyawan</div>
          <div style={{ fontSize: 13, color: "#7886a8", marginTop: 3 }}>CIKOPS FLEET — Facility Management</div>
        </div>

        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fde5e6", color: "#e5484d", fontSize: 12.5, marginBottom: 16, wordBreak: "break-word", fontFamily: "monospace", lineHeight: 1.5 }}>{error}</div>
        )}

        {/* Jenis Permintaan */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>JENIS PERMINTAAN *</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {([
              ["DRIVER", "🚗", "Request Driver / Kendaraan"],
              ["PRINTER", "🖨️", "Reset / Tambah Kuota Printer"],
              ["OTHER", "📝", "Lainnya"],
            ] as const).map(([val, icon, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setKind(val)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, textAlign: "left",
                  border: kind === val ? "2px solid #2d5bff" : "1.5px solid #e1e8f5",
                  background: kind === val ? "#eef3ff" : "#fff", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: kind === val ? "#1d44d6" : "#0d1a36" }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Data umum */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>NAMA LENGKAP *</label>
          <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Nama Anda" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>DEPARTEMEN</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Contoh: Finance" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>NO. HP</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" style={inputStyle} />
          </div>
        </div>

        <div style={{ height: 1, background: "#eef3fc", margin: "0 0 18px" }} />

        {/* Field dinamis per jenis */}
        {kind === "DRIVER" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TANGGAL PENGAJUAN</label>
              <div style={{ ...inputStyle, color: "#7886a8", background: "#eef1f7" }}>{todayLabel()} (Otomatis)</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TANGGAL EVENT / ACARA *</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TUJUAN *</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Contoh: Kantor PRB" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>JAM BERANGKAT *</label>
              <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>KEPERLUAN *</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Contoh: Meeting dengan vendor" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>CATATAN TAMBAHAN</label>
              <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={2} placeholder="Opsional..." style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>
          </>
        )}

        {kind === "PRINTER" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TANGGAL PENGAJUAN</label>
              <div style={{ ...inputStyle, color: "#7886a8", background: "#eef1f7" }}>{todayLabel()} (Otomatis)</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>PILIHAN *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["RESET_KUOTA", "TAMBAH_KUOTA"] as const).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setPrintAction(act)}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, fontWeight: 700, fontSize: 13.5, cursor: "pointer", border: printAction === act ? "2px solid #2d5bff" : "1.5px solid #e1e8f5", background: printAction === act ? "#eef3ff" : "#fff", color: printAction === act ? "#1d44d6" : "#0d1a36" }}
                  >
                    {act === "RESET_KUOTA" ? "Reset Kuota" : "Tambah Kuota"}
                  </button>
                ))}
              </div>
            </div>
            {printAction === "RESET_KUOTA" ? (
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>PILIH AREA / LOKASI * {selectedAreas.length > 0 ? `(${selectedAreas.length} dipilih)` : ""}</label>
                {printerLocations.length === 0 ? (
                  <div style={{ ...inputStyle, color: "#a0aabb", fontSize: 13 }}>Memuat daftar area...</div>
                ) : (
                  <div style={{ border: "1.5px solid #e1e8f5", borderRadius: 12, maxHeight: 220, overflowY: "auto" }}>
                    {printerLocations.map((loc) => (
                      <label
                        key={loc}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #f2f5fa" }}
                      >
                        <input type="checkbox" checked={selectedAreas.includes(loc)} onChange={() => toggleArea(loc)} style={{ width: 16, height: 16, accentColor: "#2d5bff" }} />
                        <span style={{ fontSize: 14, color: "#0d1a36", fontWeight: 600 }}>{loc}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: "#7886a8", marginTop: 6 }}>Bisa pilih lebih dari 1 area — tiap area akan dicatat sebagai permintaan terpisah.</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>USER ID PRINT *</label>
                  <input value={printUserId} onChange={(e) => setPrintUserId(e.target.value)} placeholder="Contoh: budi.santoso" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={labelStyle}>ALASAN / KEPERLUAN *</label>
                  <textarea value={printReason} onChange={(e) => setPrintReason(e.target.value)} rows={2} placeholder="Contoh: Kuota habis, butuh cetak laporan bulanan" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                </div>
              </>
            )}
          </>
        )}

        {kind === "OTHER" && (
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>DETAIL PERMINTAAN *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Jelaskan kebutuhan Anda..." style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: "100%", padding: 15, borderRadius: 14, border: "none",
            background: canSubmit ? "linear-gradient(135deg,#2d5bff,#1d44d6)" : "#e1e8f5",
            color: canSubmit ? "#fff" : "#a0aabb", fontWeight: 800, fontSize: 16,
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit ? "0 10px 24px rgba(47,95,224,0.3)" : "none",
          }}
        >
          {submitting ? "MENGIRIM..." : "KIRIM PERMINTAAN"}
        </button>
      </div>
    </div>
  );
}
