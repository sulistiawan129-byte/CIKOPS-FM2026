"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { ReportLang, ReportRangeState } from "@/lib/reportEngine";

import { L } from "@/lib/i18n";
/* ════════════════════════════════════════════════════════════
   LANGUAGE PICKER — selalu muncul sebelum export apapun (CSV/Excel/
   PDF), di modul manapun. Reusable, tidak perlu ditulis ulang tiap
   modul.
════════════════════════════════════════════════════════════ */

export type ExportFormat = "csv" | "excel" | "pdf";

interface LanguagePickerModalProps {
  format: ExportFormat;
  onConfirm: (lang: ReportLang) => void;
  onClose: () => void;
}

export function LanguagePickerModal({ format, onConfirm, onClose }: LanguagePickerModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const formatLabel = format === "csv" ? "CSV" : format === "excel" ? "Excel" : "PDF";
  const modal = (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(6,13,24,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--r2)", padding: 26, width: 320, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>{L("Pilih Bahasa Laporan", "Choose Report Language")}</div>
        <div style={{ fontSize: 12.5, color: "var(--t3)", marginBottom: 20 }}>Export {formatLabel} — choose report language</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => onConfirm("id")}
            style={{ padding: "13px", borderRadius: 12, border: "1.5px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            🇮🇩 Bahasa Indonesia
          </button>
          <button
            onClick={() => onConfirm("en")}
            style={{ padding: "13px", borderRadius: 12, border: "1.5px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            🇬🇧 English
          </button>
        </div>
        <button onClick={onClose} style={{ marginTop: 14, width: "100%", padding: "9px", borderRadius: 10, border: "none", background: "transparent", color: "var(--t3)", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
          Batal
        </button>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

/** Hook kecil: kelola state modal pemilih bahasa + format yang sedang
 *  diminta, supaya tiap modul tinggal panggil `requestExport("pdf")`
 *  dan render `<LanguagePickerModal>` kalau `pending` tidak null. */
export function useExportLanguagePicker(onGo: (format: ExportFormat, lang: ReportLang) => void) {
  const [pending, setPending] = useState<ExportFormat | null>(null);
  function requestExport(format: ExportFormat) {
    setPending(format);
  }
  function confirm(lang: ReportLang) {
    if (pending) onGo(pending, lang);
    setPending(null);
  }
  function cancel() {
    setPending(null);
  }
  return { pending, requestExport, confirm, cancel };
}

/* ════════════════════════════════════════════════════════════
   RANGE PICKER — toolbar rentang tanggal ATAU per-bulan, reusable
   untuk semua modul.
════════════════════════════════════════════════════════════ */

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

interface ReportRangePickerProps {
  value: ReportRangeState;
  onChange: (v: ReportRangeState) => void;
  inputClassName?: string;
}

export function ReportRangePicker({ value, onChange, inputClassName }: ReportRangePickerProps) {
  const pillBase: CSSProperties = { padding: "7px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 700 };
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={() => onChange({ ...value, mode: "month" })}
        style={{ ...pillBase, background: value.mode === "month" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: value.mode === "month" ? "#fff" : "var(--t2)" }}
      >
        {L("Per Bulan", "By Month")}
      </button>
      <button
        onClick={() => {
          if (value.mode !== "range") {
            const today = new Date();
            const yearAgo = new Date();
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            onChange({ ...value, mode: "range", dateFrom: iso(yearAgo), dateTo: iso(today) });
          }
        }}
        style={{ ...pillBase, background: value.mode === "range" ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent", color: value.mode === "range" ? "#fff" : "var(--t2)" }}
      >
        {L("Rentang Tanggal", "Date Range")}
      </button>

      {value.mode === "month" ? (
        <>
          <select className={inputClassName} style={{ width: "auto" }} value={value.month} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}>
            {MONTHS_ID.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className={inputClassName} style={{ width: "auto" }} value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </>
      ) : (
        <>
          <input type="date" className={inputClassName} style={{ width: "auto" }} value={value.dateFrom} onChange={(e) => onChange({ ...value, dateFrom: e.target.value })} />
          <span style={{ color: "var(--t3)", fontSize: 12 }}>—</span>
          <input type="date" className={inputClassName} style={{ width: "auto" }} value={value.dateTo} onChange={(e) => onChange({ ...value, dateTo: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function defaultReportRange(): ReportRangeState {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    mode: "month",
    month: now.getMonth(),
    year: now.getFullYear(),
    dateFrom: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: iso(now),
  };
}

/* ════════════════════════════════════════════════════════════
   EXPORT BUTTONS — grup 3 tombol CSV/Excel/PDF, reusable di semua
   modul. Selalu memicu language picker lewat onExport(format).
════════════════════════════════════════════════════════════ */
interface ReportExportButtonsProps {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}
export function ReportExportButtons({ onExport, disabled }: ReportExportButtonsProps) {
  const btn: CSSProperties = {
    padding: "8px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", background: "var(--bg2)",
    color: "var(--t2)", fontWeight: 700, fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button style={btn} disabled={disabled} onClick={() => onExport("csv")}>⬇ CSV</button>
      <button style={btn} disabled={disabled} onClick={() => onExport("excel")}>⬇ Excel</button>
      <button style={btn} disabled={disabled} onClick={() => onExport("pdf")}>⬇ PDF</button>
    </div>
  );
}
