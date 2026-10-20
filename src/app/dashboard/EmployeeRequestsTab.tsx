"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { getEmployeeRequests, updateEmployeeRequestStatus, deleteEmployeeRequest } from "@/lib/api";
import type { EmployeeRequest, EmployeeRequestType, EmployeeRequestStatus } from "@/lib/types";
import type { Driver, Employee } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { ModuleHeader, ModulePage } from "./ModuleShell";
import { useCountUp, formatDateLabel, printRequestReceipt } from "./dashboardShared";
import { SkeletonRows } from "./TaskModals";

const EMPLOYEE_REQUEST_TYPE_LABELS: Record<EmployeeRequestType, { label: string; icon: string }> = {
  DRIVER: { label: "Request Driver", icon: "🚗" },
  TONER: { label: "Request Toner", icon: "🖨️" },
  OTHER: { label: "Lainnya", icon: "📝" },
};
const EMPLOYEE_REQUEST_STATUS_LABELS: Record<EmployeeRequestStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: "Menunggu", color: "var(--orange)", bg: "var(--orange-soft)" },
  IN_PROGRESS: { label: "Diproses", color: "var(--brand)", bg: "var(--bg2)" },
  DONE: { label: "Selesai", color: "var(--green)", bg: "var(--green-soft)" },
  REJECTED: { label: "Ditolak", color: "var(--red)", bg: "var(--red-soft)" },
};

export function EmployeeRequestsTab() {
  const { lang, t } = useLang();
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeRequestStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | EmployeeRequestType>("all");
  const [confirmDelete, setConfirmDelete] = useState<EmployeeRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<EmployeeRequest | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await getEmployeeRequests());
    } catch (e) {
      console.warn("Gagal memuat permintaan karyawan:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const inProgressCount = requests.filter((r) => r.status === "IN_PROGRESS").length;
  const doneCount = requests.filter((r) => r.status === "DONE").length;

  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (typeFilter !== "all" && r.requestType !== typeFilter) return false;
    return true;
  });

  function openDetail(r: EmployeeRequest) {
    setDetailRequest(r);
    setNotesDraft(r.adminNotes);
  }

  async function handleSetStatus(r: EmployeeRequest, status: EmployeeRequestStatus) {
    setBusyId(r.id);
    try {
      await updateEmployeeRequestStatus(r.id, status, notesDraft);
      setDetailRequest(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteEmployeeRequest(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus permintaan");
    }
  }

  return (
    <ModulePage>
      <ModuleHeader
        kicker={lang === "en" ? "Facility · Employee Requests" : "Fasilitas · Permintaan Karyawan"}
        title={lang === "en" ? "Employee Requests" : "Permintaan Karyawan"}
        desc={lang === "en" ? "Requests employees submit via the public form: driver / vehicle, printer quota, GA technician, and others." : "Permintaan yang dikirim karyawan lewat form publik: driver / kendaraan, kuota printer, teknisi GA, dan lainnya."}
        actions={<a href="/request" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 14px", borderRadius: 11, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--t1)", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>📝 {lang === "en" ? "Open public form ↗" : "Buka form publik ↗"}</a>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 18, background: pendingCount > 0 ? "linear-gradient(135deg, var(--orange), #d9730d)" : undefined, border: pendingCount === 0 ? "1px solid var(--border2)" : undefined }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: pendingCount > 0 ? "rgba(255,255,255,0.85)" : "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "Pending" : "Menunggu"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: pendingCount > 0 ? "#fff" : "var(--t1)", fontFamily: "var(--mono)" }}>{useCountUp(pendingCount)}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "In Progress" : "Diproses"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--brand)", fontFamily: "var(--mono)" }}>{useCountUp(inProgressCount)}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>{lang === "en" ? "Done" : "Selesai"}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--green)", fontFamily: "var(--mono)" }}>{useCountUp(doneCount)}</div>
        </div>
      </div>

      <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 18px" }}>
          {([
            ["all", lang === "en" ? "All" : "Semua"],
            ["PENDING", "Menunggu"],
            ["IN_PROGRESS", "Diproses"],
            ["DONE", "Selesai"],
            ["REJECTED", "Ditolak"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{ padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 700, background: statusFilter === key ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: statusFilter === key ? "#fff" : "var(--t2)" }}
            >
              {label}
            </button>
          ))}
          <div style={{ width: 1, background: "var(--border2)", margin: "0 4px" }} />
          {([
            ["all", "Semua Jenis"],
            ["DRIVER", "🚗 Driver"],
            ["TONER", "🖨️ Toner"],
            ["OTHER", "📝 Lainnya"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              style={{ padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 700, background: typeFilter === key ? "var(--bg2)" : "transparent", color: typeFilter === key ? "var(--t1)" : "var(--t3)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonRows rows={4} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
            📨 {lang === "en" ? "No requests found." : "Tidak ada permintaan."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tableCompact" style={{ minWidth: 820, width: "100%" }}>
              <thead>
                <tr>
                  <th>{lang === "en" ? "Date" : "Tanggal"}</th>
                  <th>{lang === "en" ? "Type" : "Jenis"}</th>
                  <th>{lang === "en" ? "Employee" : "Karyawan"}</th>
                  <th>{lang === "en" ? "Department" : "Departemen"}</th>
                  <th>{lang === "en" ? "Description" : "Detail"}</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>{lang === "en" ? "Actions" : "Aksi"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const typeInfo = EMPLOYEE_REQUEST_TYPE_LABELS[r.requestType] ?? { label: r.requestType || "-", icon: "❔" };
                  const statusInfo = EMPLOYEE_REQUEST_STATUS_LABELS[r.status] ?? { label: r.status || "-", color: "var(--t3)", bg: "var(--bg2)" };
                  return (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openDetail(r)}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDateLabel(r.createdAt.slice(0, 10))}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{typeInfo.icon} {typeInfo.label}</td>
                      <td style={{ fontWeight: 700 }}>{r.employeeName}{r.phone && <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400 }}>{r.phone}</div>}</td>
                      <td>{r.department || "-"}</td>
                      <td style={{ color: "var(--t3)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</td>
                      <td>
                        <span style={{ padding: "4px 10px", borderRadius: "var(--pill)", fontSize: 11.5, fontWeight: 700, background: statusInfo.bg, color: statusInfo.color }}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setConfirmDelete(r)} style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", padding: "5px 9px" }}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRequest && (
        <ModalPortal onOverlayClick={() => setDetailRequest(null)} maxWidth={460}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{(EMPLOYEE_REQUEST_TYPE_LABELS[detailRequest.requestType] ?? { icon: "❔" }).icon}</span>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>{(EMPLOYEE_REQUEST_TYPE_LABELS[detailRequest.requestType] ?? { label: detailRequest.requestType }).label}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 18 }}>{formatDateLabel(detailRequest.createdAt.slice(0, 10))} · {new Date(detailRequest.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>

            <div style={{ background: "var(--bg2)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 2 }}>{detailRequest.employeeName}</div>
              <div style={{ fontSize: 12.5, color: "var(--t3)" }}>{detailRequest.department || "-"}{detailRequest.phone ? ` · ${detailRequest.phone}` : ""}</div>
            </div>

            {detailRequest.requestType === "DRIVER" && detailRequest.details ? (
              <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Tanggal Event/Acara", detailRequest.details.eventDate ? formatDateLabel(detailRequest.details.eventDate) : ""],
                  ["Tujuan", detailRequest.details.destination ?? ""],
                  ["Jam Berangkat", detailRequest.details.departureTime ?? ""],
                  ["Keperluan", detailRequest.details.purpose ?? ""],
                  ["Catatan Tambahan", detailRequest.details.additionalNotes ?? ""],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--t3)" }}>{label}</span>
                    <span style={{ fontWeight: 700, color: "var(--t1)", textAlign: "right" }}>{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 5 }}>{lang === "en" ? "Description" : "Detail Permintaan"}</div>
                <div style={{ fontSize: 13.5, color: "var(--t1)", lineHeight: 1.6 }}>{detailRequest.description}</div>
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" }}>{lang === "en" ? "Admin Notes" : "Catatan Admin"}</label>
              <textarea className={styles.formTextarea} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={2} placeholder={lang === "en" ? "Optional notes..." : "Catatan opsional..."} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const typeInfo2 = EMPLOYEE_REQUEST_TYPE_LABELS[detailRequest.requestType] ?? { label: detailRequest.requestType };
                  const lines = detailRequest.requestType === "DRIVER"
                    ? [
                        { label: "Tanggal Event/Acara", value: detailRequest.details.eventDate ? formatDateLabel(detailRequest.details.eventDate) : "" },
                        { label: "Tujuan", value: detailRequest.details.destination ?? "" },
                        { label: "Jam Berangkat", value: detailRequest.details.departureTime ?? "" },
                        { label: "Keperluan", value: detailRequest.details.purpose ?? "" },
                        { label: "Catatan Tambahan", value: detailRequest.details.additionalNotes ?? "" },
                      ]
                    : [{ label: "Detail Permintaan", value: detailRequest.description }];
                  printRequestReceipt({ refId: detailRequest.id, createdAt: detailRequest.createdAt, typeLabel: typeInfo2.label, employeeName: detailRequest.employeeName, department: detailRequest.department, lines });
                }}
                style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t2)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                🖨️ {lang === "en" ? "Print Receipt" : "Cetak Bukti"}
              </button>
              {detailRequest.status !== "IN_PROGRESS" && (
                <button onClick={() => handleSetStatus(detailRequest, "IN_PROGRESS")} disabled={busyId === detailRequest.id} style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "1px solid var(--brand)", background: "var(--bg2)", color: "var(--brand)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  {lang === "en" ? "Mark In Progress" : "Tandai Diproses"}
                </button>
              )}
              {detailRequest.status !== "DONE" && (
                <button onClick={() => handleSetStatus(detailRequest, "DONE")} disabled={busyId === detailRequest.id} style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "none", background: "var(--green)", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  ✓ {lang === "en" ? "Mark Done" : "Tandai Selesai"}
                </button>
              )}
              {detailRequest.status !== "REJECTED" && (
                <button onClick={() => handleSetStatus(detailRequest, "REJECTED")} disabled={busyId === detailRequest.id} style={{ flex: 1, minWidth: 110, padding: "10px", borderRadius: 10, border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  {lang === "en" ? "Reject" : "Tolak"}
                </button>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this request?" : "Hapus permintaan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.employeeName}</strong> — {(EMPLOYEE_REQUEST_TYPE_LABELS[confirmDelete.requestType] ?? { label: confirmDelete.requestType }).label} {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </ModulePage>
  );
}

/* ════════════════════════════════════════════════════════════
   MASTER DATA — the missing piece: until now there was no way to add
   a new Driver, Employee, or Job Type through the UI at all (only
   read-only dropdowns fed by Supabase). This tab covers all three.
════════════════════════════════════════════════════════════ */
