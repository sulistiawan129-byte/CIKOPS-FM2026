"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { getPrinters, addPrinter, updatePrinter, deletePrinter, getPrinterRequests, addPrinterRequest, deletePrinterRequest } from "@/lib/api";
import type { Printer, PrinterRequest, PrinterRequestType } from "@/lib/types";
import { exportPrinterRequestsToCsv } from "@/lib/report";
import type { Employee } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { toLocalISODate } from "@/lib/dateUtils";
import { ModuleHeader, ModulePage, ModuleTabs } from "./ModuleShell";
import { useCountUp, formatDateLabel, printRequestReceipt } from "./dashboardShared";
import { SkeletonRows } from "./TaskModals";

const PRINTER_REQUEST_LABELS: Record<PrinterRequestType, string> = {
  RESET_KUOTA: "Reset Kuota",
  TAMBAH_KUOTA: "Tambah Kuota",
  AMBIL_TONER: "Pengambilan Toner",
};

export function PrinterTab() {
  const { lang, t } = useLang();
  const [viewMode, setViewMode] = useState<"list" | "requests">("list");
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  // ── Printers ──
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [showPrinterForm, setShowPrinterForm] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  const [confirmDeletePrinter, setConfirmDeletePrinter] = useState<Printer | null>(null);
  const [savingPrinter, setSavingPrinter] = useState(false);

  const [formNoEq, setFormNoEq] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formType, setFormType] = useState<"COLOR" | "BW">("BW");
  const [formUrl, setFormUrl] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formAktif, setFormAktif] = useState(true);

  const loadPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      setPrinters(await getPrinters());
    } catch (e) {
      console.warn("Gagal memuat printer:", e);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => { loadPrinters(); }, [loadPrinters]);

  const totalPrinters = printers.length;
  const colorCount = printers.filter((p) => p.type === "COLOR").length;
  const bwCount = printers.filter((p) => p.type === "BW").length;
  // useCountUp HARUS dipanggil tanpa syarat di sini (bukan di dalam JSX
  // kondisional viewMode==="list"), supaya jumlah hook yang terpanggil
  // selalu sama di setiap render — ini yang menyebabkan React error #300
  // ("Rendered fewer hooks than expected") saat pindah ke tab "requests".
  const animatedTotalPrinters = useCountUp(totalPrinters);
  const animatedColorCount = useCountUp(colorCount);
  const animatedBwCount = useCountUp(bwCount);

  function openAddPrinter() {
    setEditingPrinter(null);
    setFormNoEq(""); setFormLocation(""); setFormType("BW"); setFormUrl(""); setFormBrand(""); setFormAktif(true);
    setShowPrinterForm(true);
  }
  function openEditPrinter(p: Printer) {
    setEditingPrinter(p);
    setFormNoEq(p.noEq); setFormLocation(p.location); setFormType(p.type); setFormUrl(p.controlPanelUrl); setFormBrand(p.brand); setFormAktif(p.aktif);
    setShowPrinterForm(true);
  }
  const canSavePrinter = formNoEq.trim() !== "" && formLocation.trim() !== "";
  async function handleSavePrinter() {
    if (!canSavePrinter) return;
    setSavingPrinter(true);
    try {
      const payload = { noEq: formNoEq.trim(), location: formLocation.trim(), type: formType, controlPanelUrl: formUrl.trim(), brand: formBrand.trim(), aktif: formAktif };
      if (editingPrinter) await updatePrinter(editingPrinter.id, payload);
      else await addPrinter(payload);
      setShowPrinterForm(false);
      await loadPrinters();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan printer");
    } finally {
      setSavingPrinter(false);
    }
  }
  async function handleDeletePrinter() {
    if (!confirmDeletePrinter) return;
    try {
      await deletePrinter(confirmDeletePrinter.id);
      setConfirmDeletePrinter(null);
      await loadPrinters();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus printer");
    }
  }
  function openControlPanel(url: string) {
    if (!url) {
      alert(lang === "en" ? "Control Panel URL not set for this printer." : "URL Control Panel belum diatur untuk printer ini.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ── Requests ──
  const [requests, setRequests] = useState<PrinterRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState<PrinterRequest | null>(null);
  const [savingRequest, setSavingRequest] = useState(false);
  const [reqDateFrom, setReqDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return toLocalISODate(d);
  });
  const [reqDateTo, setReqDateTo] = useState(() => toLocalISODate(new Date()));

  const [reqPrinterId, setReqPrinterId] = useState("");
  const [reqType, setReqType] = useState<PrinterRequestType>("RESET_KUOTA");
  const [reqEmployeeName, setReqEmployeeName] = useState("");
  const [reqDepartment, setReqDepartment] = useState("");
  const [reqQuota, setReqQuota] = useState("");
  const [reqNotes, setReqNotes] = useState("");

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      setRequests(await getPrinterRequests({ dateFrom: reqDateFrom, dateTo: reqDateTo }));
    } catch (e) {
      console.warn("Gagal memuat permintaan printer:", e);
    } finally {
      setLoadingRequests(false);
    }
  }, [reqDateFrom, reqDateTo]);

  useEffect(() => { if (viewMode === "requests") loadRequests(); }, [viewMode, loadRequests]);

  function openAddRequest() {
    setReqPrinterId(printers[0]?.id ?? "");
    setReqType("RESET_KUOTA");
    setReqEmployeeName(""); setReqDepartment(""); setReqQuota(""); setReqNotes("");
    setShowRequestForm(true);
  }
  const canSaveRequest = reqPrinterId !== "" && reqEmployeeName.trim() !== "";
  async function handleSaveRequest() {
    if (!canSaveRequest) return;
    setSavingRequest(true);
    try {
      await addPrinterRequest({
        printerId: reqPrinterId,
        requestType: reqType,
        employeeName: reqEmployeeName.trim(),
        department: reqDepartment.trim(),
        quotaAmount: reqType === "TAMBAH_KUOTA" && reqQuota.trim() !== "" ? Number(reqQuota) : null,
        notes: reqNotes.trim(),
      });
      setShowRequestForm(false);
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan permintaan");
    } finally {
      setSavingRequest(false);
    }
  }
  async function handleDeleteRequest() {
    if (!confirmDeleteRequest) return;
    try {
      await deletePrinterRequest(confirmDeleteRequest.id);
      setConfirmDeleteRequest(null);
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus permintaan");
    }
  }

  const Lp = (id: string, en: string) => (lang === "en" ? en : id);
  return (
    <ModulePage>
      <ModuleHeader
        kicker={Lp("Fasilitas · Printer", "Facility · Printers")}
        title="Printer"
        desc={Lp("Daftar printer kantor beserta link Control Panel, dan catatan permintaan karyawan: reset kuota, tambah kuota, dan pengambilan toner.",
          "Office printers with their Control Panel links, plus employee requests: quota reset, extra quota and toner pickup.")}
        actions={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {viewMode === "list" ? (
          <button className="pillBtn" onClick={openAddPrinter}>+ {lang === "en" ? "Add Printer" : "Tambah Printer"}</button>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => exportPrinterRequestsToCsv(requests)}
                disabled={requests.length === 0}
                style={{ padding: "9px 16px", borderRadius: "var(--pill)", border: "1px solid var(--green)", background: "var(--green-soft)", color: "var(--green)", fontWeight: 700, fontSize: 13, cursor: requests.length === 0 ? "not-allowed" : "pointer", opacity: requests.length === 0 ? 0.5 : 1 }}
              >
                ⬇ {lang === "en" ? "Export CSV" : "Export CSV"}
              </button>
              <button className="pillBtn" onClick={openAddRequest} disabled={printers.length === 0} title={printers.length === 0 ? (lang === "en" ? "Add a printer first" : "Tambahkan printer dulu di tab 'Daftar Printer'") : undefined}>
                + {lang === "en" ? "Log Request" : "Catat Permintaan"}
              </button>
            </div>
            {printers.length === 0 && (
              <div style={{ padding: "0 18px 14px", fontSize: 12.5, color: "var(--orange)" }}>
                ⚠️ {lang === "en" ? "Add at least 1 printer in the \"Printer List\" tab before logging a request." : "Tambahkan minimal 1 printer di tab \"Daftar Printer\" dulu sebelum bisa mencatat permintaan."}
              </div>
            )}
          </>
        )}
        </div>}
      />
      <ModuleTabs
        tabs={[{ id: "list", label: Lp("Daftar Printer", "Printer List"), icon: "🖨️" }, { id: "requests", label: Lp("Permintaan Karyawan", "Employee Requests"), icon: "📋", badge: requests.length || undefined }]}
        value={viewMode}
        onChange={setViewMode}
      />

      {viewMode === "list" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
            <div className="statPop" style={{ ...cardStyle, padding: 18, background: "linear-gradient(135deg, var(--brand), var(--brand2))" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>{lang === "en" ? "Total Printers" : "Total Printer"}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", fontFamily: "var(--mono)" }}>{animatedTotalPrinters}</div>
            </div>
            <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>🎨 {lang === "en" ? "Color" : "Berwarna"}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--purple)", fontFamily: "var(--mono)" }}>{animatedColorCount}</div>
            </div>
            <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>⚫ {lang === "en" ? "Black & White" : "Hitam Putih"}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--t1)", fontFamily: "var(--mono)" }}>{animatedBwCount}</div>
            </div>
          </div>

          <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
            {loadingPrinters ? (
              <SkeletonRows rows={4} />
            ) : printers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
                🖨️ {lang === "en" ? "No printers registered yet." : "Belum ada printer terdaftar."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tableCompact" style={{ minWidth: 720, width: "100%" }}>
                  <thead>
                    <tr>
                      <th>No. EQ</th>
                      <th>{lang === "en" ? "Location" : "Lokasi"}</th>
                      <th>{lang === "en" ? "Type" : "Jenis"}</th>
                      <th>Brand</th>
                      <th>Control Panel</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>{lang === "en" ? "Actions" : "Aksi"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printers.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{p.noEq}</td>
                        <td>{p.location}</td>
                        <td>
                          <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: p.type === "COLOR" ? "var(--gold-soft)" : "var(--bg2)", color: p.type === "COLOR" ? "var(--gold2)" : "var(--t2)" }}>
                            {p.type === "COLOR" ? (lang === "en" ? "Color" : "Berwarna") : (lang === "en" ? "B/W" : "Hitam Putih")}
                          </span>
                        </td>
                        <td style={{ color: "var(--t3)" }}>{p.brand || "-"}</td>
                        <td>
                          <button
                            onClick={() => openControlPanel(p.controlPanelUrl)}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border2)", background: p.controlPanelUrl ? "var(--bg2)" : "transparent", color: p.controlPanelUrl ? "var(--brand)" : "var(--t3)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                          >
                            🔗 {lang === "en" ? "Open Panel" : "Buka Panel"}
                          </button>
                        </td>
                        <td>
                          <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: p.aktif ? "var(--green-soft)" : "var(--red-soft)", color: p.aktif ? "var(--green)" : "var(--red)" }}>
                            {p.aktif ? (lang === "en" ? "Active" : "Aktif") : (lang === "en" ? "Inactive" : "Nonaktif")}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => openEditPrinter(p)} style={{ border: "none", background: "var(--bg2)", color: "var(--t2)", borderRadius: 8, cursor: "pointer", padding: "5px 9px", marginRight: 6 }}>✏️</button>
                          <button onClick={() => setConfirmDeletePrinter(p)} style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", padding: "5px 9px" }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === "requests" && (
        <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "16px 18px" }}>
            <input type="date" className={styles.formInput} style={{ width: "auto" }} value={reqDateFrom} onChange={(e) => setReqDateFrom(e.target.value)} />
            <span style={{ color: "var(--t3)", fontSize: 12 }}>—</span>
            <input type="date" className={styles.formInput} style={{ width: "auto" }} value={reqDateTo} onChange={(e) => setReqDateTo(e.target.value)} />
          </div>
          {loadingRequests ? (
            <SkeletonRows rows={4} />
          ) : requests.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
              📋 {lang === "en" ? "No requests logged in this range." : "Belum ada permintaan tercatat di rentang ini."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tableCompact" style={{ minWidth: 900, width: "100%" }}>
                <thead>
                  <tr>
                    <th>{lang === "en" ? "Date" : "Tanggal"}</th>
                    <th>{lang === "en" ? "Source" : "Sumber"}</th>
                    <th>{lang === "en" ? "Printer / User ID" : "Printer / User ID"}</th>
                    <th>{lang === "en" ? "Request Type" : "Jenis Permintaan"}</th>
                    <th>{lang === "en" ? "Employee" : "Karyawan"}</th>
                    <th>{lang === "en" ? "Department" : "Departemen"}</th>
                    <th>{lang === "en" ? "Quota" : "Kuota"}</th>
                    <th>{lang === "en" ? "Note" : "Catatan"}</th>
                    <th style={{ textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDateLabel(r.createdAt.slice(0, 10))}</td>
                      <td>
                        <span style={{ padding: "3px 9px", borderRadius: "var(--pill)", fontSize: 10.5, fontWeight: 700, background: r.source === "EMPLOYEE" ? "var(--brand)" : "var(--bg2)", color: r.source === "EMPLOYEE" ? "#fff" : "var(--t2)" }}>
                          {r.source === "EMPLOYEE" ? (lang === "en" ? "Employee" : "Karyawan") : "Admin"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>
                        {r.printerId ? r.printerNoEq : (r.requestType === "RESET_KUOTA" ? `📍 ${r.printUserId}` : r.printUserId)}
                        {r.printerId && <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400, fontFamily: "var(--font)" }}>{r.printerLocation}</div>}
                        {!r.printerId && r.requestType === "RESET_KUOTA" && <div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 400, fontFamily: "var(--font)" }}>Area/Lokasi</div>}
                      </td>
                      <td>
                        <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: "var(--bg2)", color: "var(--t2)" }}>
                          {PRINTER_REQUEST_LABELS[r.requestType]}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.employeeName}</td>
                      <td>{r.department || "-"}</td>
                      <td style={{ fontFamily: "var(--mono)" }}>{r.quotaAmount ?? "-"}</td>
                      <td style={{ color: "var(--t3)", whiteSpace: "pre-line" }}>{r.notes || "-"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => printRequestReceipt({
                            refId: r.id, createdAt: r.createdAt, typeLabel: PRINTER_REQUEST_LABELS[r.requestType], employeeName: r.employeeName, department: r.department,
                            lines: [
                              { label: r.printerId ? "Printer" : "User ID Print", value: r.printerId ? `${r.printerNoEq} — ${r.printerLocation}` : r.printUserId },
                              { label: "Kuota", value: r.quotaAmount != null ? String(r.quotaAmount) : "" },
                              { label: "Catatan", value: r.notes },
                            ],
                          })}
                          style={{ border: "none", background: "var(--bg2)", color: "var(--t2)", borderRadius: 8, cursor: "pointer", padding: "5px 9px", marginRight: 6 }}
                        >
                          🖨️
                        </button>
                        <button onClick={() => setConfirmDeleteRequest(r)} style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", padding: "5px 9px" }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showPrinterForm && (
        <ModalPortal onOverlayClick={() => setShowPrinterForm(false)} maxWidth={440}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>
              {editingPrinter ? (lang === "en" ? "Edit Printer" : "Edit Printer") : (lang === "en" ? "Add Printer" : "Tambah Printer")}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>No. EQ Printer *</label>
              <input className={styles.formInput} value={formNoEq} onChange={(e) => setFormNoEq(e.target.value)} placeholder="PRN-001" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Location" : "Lokasi"} *</label>
              <input className={styles.formInput} value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder={lang === "en" ? "e.g. 2nd Floor - Finance" : "Contoh: Lantai 2 - Finance"} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Type" : "Jenis"} *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["BW", "COLOR"] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setFormType(tp)}
                    style={{ flex: 1, padding: "9px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", border: formType === tp ? "1px solid var(--brand)" : "1px solid var(--border2)", background: formType === tp ? "var(--bg2)" : "transparent", color: formType === tp ? "var(--brand)" : "var(--t3)" }}
                  >
                    {tp === "BW" ? (lang === "en" ? "Black & White" : "Hitam Putih") : (lang === "en" ? "Color" : "Berwarna")}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Brand / Model</label>
              <input className={styles.formInput} value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="Contoh: HP LaserJet Pro" />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Control Panel URL</label>
              <input className={styles.formInput} value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="http://192.168.1.50" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <input type="checkbox" checked={formAktif} onChange={(e) => setFormAktif(e.target.checked)} id="printerAktif" />
              <label htmlFor="printerAktif" style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600 }}>{lang === "en" ? "Active" : "Aktif"}</label>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPrinterForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSavePrinter} disabled={!canSavePrinter || savingPrinter} style={{ flex: 2, justifyContent: "center", opacity: canSavePrinter && !savingPrinter ? 1 : 0.5 }}>
                {savingPrinter ? t.actionSaving : t.actionSave}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDeletePrinter && (
        <ModalPortal onOverlayClick={() => setConfirmDeletePrinter(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this printer?" : "Hapus printer ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDeletePrinter.noEq}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeletePrinter(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDeletePrinter} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {showRequestForm && (
        <ModalPortal onOverlayClick={() => setShowRequestForm(false)} maxWidth={440}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>
              {lang === "en" ? "Log Employee Request" : "Catat Permintaan Karyawan"}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Printer *</label>
              <select className={styles.formSelect} value={reqPrinterId} onChange={(e) => setReqPrinterId(e.target.value)}>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.noEq} — {p.location}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Request Type" : "Jenis Permintaan"} *</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(Object.keys(PRINTER_REQUEST_LABELS) as PrinterRequestType[]).map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setReqType(rt)}
                    style={{ flex: 1, minWidth: 110, padding: "9px", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", border: reqType === rt ? "1px solid var(--brand)" : "1px solid var(--border2)", background: reqType === rt ? "var(--bg2)" : "transparent", color: reqType === rt ? "var(--brand)" : "var(--t3)" }}
                  >
                    {PRINTER_REQUEST_LABELS[rt]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Employee Name" : "Nama Karyawan"} *</label>
              <input className={styles.formInput} value={reqEmployeeName} onChange={(e) => setReqEmployeeName(e.target.value)} placeholder={lang === "en" ? "Full name" : "Nama lengkap"} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{lang === "en" ? "Department" : "Departemen"}</label>
              <input className={styles.formInput} value={reqDepartment} onChange={(e) => setReqDepartment(e.target.value)} />
            </div>
            {reqType === "TAMBAH_KUOTA" && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{lang === "en" ? "Quota Amount" : "Jumlah Kuota"}</label>
                <input className={styles.formInput} type="number" value={reqQuota} onChange={(e) => setReqQuota(e.target.value)} placeholder="100" />
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>{lang === "en" ? "Notes" : "Catatan"}</label>
              <textarea className={styles.formTextarea} value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} rows={2} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowRequestForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSaveRequest} disabled={!canSaveRequest || savingRequest} style={{ flex: 2, justifyContent: "center", opacity: canSaveRequest && !savingRequest ? 1 : 0.5 }}>
                {savingRequest ? t.actionSaving : t.actionSave}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDeleteRequest && (
        <ModalPortal onOverlayClick={() => setConfirmDeleteRequest(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this request record?" : "Hapus catatan permintaan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDeleteRequest.employeeName}</strong> — {PRINTER_REQUEST_LABELS[confirmDeleteRequest.requestType]} {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeleteRequest(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDeleteRequest} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </ModulePage>
  );
}
/* ════════════════════════════════════════════════════════════
   EMPLOYEE REQUESTS — inbox permintaan dari form publik (/request):
   request driver, request toner, atau lainnya. Admin bisa langsung
   proses (tandai diproses/selesai/tolak) dari sini.
════════════════════════════════════════════════════════════ */
