"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { ReportExportButtons, LanguagePickerModal, useExportLanguagePicker } from "@/components/ReportControls";
import { exportSummaryCsv, exportSummaryPdf } from "@/lib/reportEngine";
import type { ReportColumn } from "@/lib/reportEngine";
import { getGiftEvents, createGiftEvent, updateGiftEvent, updateGiftEventActualCounts, updateGiftEventStockPerSize, deleteGiftEvent, bulkImportGiftRegistrations, upsertGiftRegistrations, unclaimGiftRegistration, claimGift, getGiftRegistrations } from "@/lib/api";
import type { Claim, Plant, GiftEvent, GiftItemDef, GiftRegistration, GiftSelection } from "@/lib/types";
import type { Employee } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { toLocalISODate } from "@/lib/dateUtils";
import of from "./opfund.module.css";
import { SkeletonRows } from "./TaskModals";
import { BRAND } from "@/lib/brand";

// ════════════════════════════════════════════════════════════════
//  GIFT DISTRIBUTION MASTER PANEL
// ════════════════════════════════════════════════════════════════
/** Cetak label pembagian seragam — diurutkan berdasarkan No. Urut,
 *  supaya kantong seragam bisa di-packing & disortir sebelum acara.
 *  Petugas pas hari-H cukup cari NIK di /gift/lookup untuk tahu No.
 *  Urut, lalu ambil kantong bernomor itu (yang sudah tersortir rapi).
 *  No. Urut dibuat BESAR supaya gampang dibaca dari jauh, dan slot
 *  ukuran yang KOSONG di-filter total (tidak ikut dicetak).
 *
 *  layout "standard": 3 kolom x 4 baris = 12 label/lembar, kotak 66mm
 *  (pas untuk peserta dengan baju sedikit, mis. ≤5).
 *  layout "large": 3 kolom x 3 baris = 9 label/lembar, kotak lebih
 *  tinggi (~88mm) — dipakai KHUSUS untuk peserta dengan baju BANYAK
 *  (>5), supaya semua ukurannya muat, tidak kepotong lagi. */
/** Kartu KPI yang bisa DIKLIK untuk langsung menerapkan filter terkait
 *  di tabel Peserta di bawahnya — supaya tidak perlu cari-cari dropdown
 *  filter secara manual. */
function GiftKpiCard({
  icon, label, value, color, bg, onClick, active,
}: { icon: string; label: string; value: number; color: string; bg: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: bg, borderRadius: 14, padding: 16, textAlign: "left", cursor: "pointer",
        border: active ? `2px solid ${color}` : "2px solid transparent",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
    </button>
  );
}

/** Kartu input untuk mencatat jumlah AKTUAL (fisik yang datang) —
 *  dibandingkan dengan jumlah KEBUTUHAN hasil hitung sistem. Kasih
 *  peringatan visual kalau aktual < kebutuhan (kurang stok). */
function ActualCountCard({
  label, value, kebutuhan, onSave,
}: { label: string; value: number | null; kebutuhan: number; onSave: (val: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const parsed = draft.trim() === "" ? null : parseInt(draft, 10);
      await onSave(isNaN(parsed as number) ? null : parsed);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  const kurang = value != null && value < kebutuhan;

  return (
    <div style={{ background: kurang ? "rgba(239,68,68,0.06)" : "var(--bg2)", border: kurang ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--border2)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 8 }}>{label}</div>
      {editing ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className={styles.formInput}
            style={{ width: 100, padding: "6px 10px" }}
          />
          <button onClick={handleSave} disabled={saving} style={{ background: "var(--brand)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {saving ? "..." : "Simpan"}
          </button>
          <button onClick={() => { setEditing(false); setDraft(value != null ? String(value) : ""); }} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
            Batal
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: kurang ? "var(--red)" : "var(--t1)" }}>{value ?? "-"}</div>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>/ {kebutuhan} kebutuhan</div>
          <button onClick={() => setEditing(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--brand)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✏️ Edit
          </button>
        </div>
      )}
      {kurang && !editing && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6, fontWeight: 700 }}>⚠️ Kurang {kebutuhan - (value ?? 0)} dari kebutuhan</div>}
    </div>
  );
}

/** Jumlah slot ukuran yang benar-benar terisi untuk 1 peserta (skip
 *  kosong/karakter rusak) — dipakai untuk filter ">5 baju" dan
 *  kategori Single/Suami-Istri/Keluarga. */
function countFilledSizes(r: GiftRegistration): number {
  return r.selections.filter((s) => {
    if (s.variant == null) return false;
    const t = String(s.variant).trim();
    return t !== "" && !/^\uFFFD+$/.test(t);
  }).length;
}

/** Deteksi slot "anak" — berdasarkan NOMOR SLOT/KOLOM-nya (bukan
 *  teks ukurannya), sesuai urutan sebenarnya:
 *  slot 1 = Karyawan, slot 2 = Suami/Istri, slot 3-9 = Anak. */
function isChildSlot(itemLabel: string): boolean {
  const slotNum = parseInt(itemLabel, 10);
  return !isNaN(slotNum) && slotNum >= 3;
}
function countChildren(r: GiftRegistration): number {
  return r.selections.filter((s) => {
    if (s.variant == null) return false;
    const t = String(s.variant).trim();
    if (t === "" || /^\uFFFD+$/.test(t)) return false;
    return isChildSlot(s.item);
  }).length;
}

type GiftCategory = "single" | "couple" | "family";

/** Kategori berdasarkan jumlah orang dalam 1 pendaftaran (= jumlah
 *  baju yang diterima, karena 1 baju = 1 orang):
 *  1 orang = Single, 2 orang = Suami Istri, 3-9 orang = Keluarga. */
function getGiftCategory(r: GiftRegistration): GiftCategory | null {
  const total = countFilledSizes(r);
  if (total === 0) return null; // tidak ada baju sama sekali — tidak masuk kategori manapun
  if (countChildren(r) >= 1) return "family"; // ada slot 3-9 terisi = sudah punya anak
  if (total === 1) return "single"; // cuma slot 1 (karyawan) terisi
  return "couple"; // slot 1+2 terisi, tidak ada anak
}

const CATEGORY_LABEL: Record<GiftCategory, { id: string; en: string; icon: string }> = {
  single: { id: "Single", en: "Single", icon: "👤" },
  couple: { id: "Suami Istri", en: "Couple", icon: "💑" },
  family: { id: "Keluarga", en: "Family", icon: "👨‍👩‍👧‍👦" },
};

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

/** Jumlah TIKET yang berlaku untuk 1 peserta = "Jumlah Tiket" (kolom
 *  eksplisit dari CSV) DIKURANGI jumlah anak <2 tahun (mereka gratis
 *  masuk / free entry, tidak perlu tiket). Tidak pernah negatif. */
function getEffectiveTicketCount(r: GiftRegistration): number {
  const tiket = r.jumlahTiket ?? 0;
  const anakBalita = r.anakDibawah2Tahun ?? 0;
  return Math.max(0, tiket - anakBalita);
}

/** Export laporan Gift ke Excel dengan 2 SHEET terpisah:
 *  1. "Ringkasan" — KPI & breakdown (mirip laporan modul lain)
 *  2. "Data Karyawan" — 1 baris per karyawan, dengan rincian jumlah
 *     peserta (diri sendiri, pasangan, anak) supaya bisa langsung
 *     dipakai untuk keperluan operasional (bukan cuma ringkasan). */
async function exportGiftReportExcel2Sheets(opts: {
  lang: "id" | "en";
  eventName: string;
  filename: string;
  kpis: { labelId: string; labelEn: string; value: string | number }[];
  sizeBreakdown: [string, number][];
  categoryCounts: Record<GiftCategory, number>;
  regs: GiftRegistration[];
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const L = (id: string, en: string) => (opts.lang === "en" ? en : id);

  // ── Sheet 1: Ringkasan ──
  const wsSummary = wb.addWorksheet(L("Ringkasan", "Summary"));
  let row = 1;
  wsSummary.getCell(row, 1).value = BRAND.companyWithSite;
  wsSummary.getCell(row, 1).font = { bold: true, size: 13 };
  row++;
  wsSummary.getCell(row, 1).value = `${L("Laporan Pembagian", "Distribution Report")} — ${opts.eventName}`;
  wsSummary.getCell(row, 1).font = { bold: true, size: 12 };
  row += 2;

  wsSummary.getCell(row, 1).value = L("RINGKASAN", "SUMMARY");
  wsSummary.getCell(row, 1).font = { bold: true, size: 12, color: { argb: "FF0F2847" } };
  row++;
  for (const k of opts.kpis) {
    wsSummary.getCell(row, 1).value = opts.lang === "en" ? k.labelEn : k.labelId;
    wsSummary.getCell(row, 2).value = k.value;
    wsSummary.getCell(row, 2).font = { bold: true };
    row++;
  }
  row++;

  wsSummary.getCell(row, 1).value = L("Jumlah Peserta per Kategori", "Participants by Category");
  wsSummary.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FF0F2847" } };
  row++;
  const catRows: [string, number][] = [
    [L("Single (1 orang)", "Single (1 person)"), opts.categoryCounts.single],
    [L("Suami Istri (2 orang)", "Couple (2 people)"), opts.categoryCounts.couple],
    [L("Keluarga (3-9 orang)", "Family (3-9 people)"), opts.categoryCounts.family],
  ];
  for (const [label, count] of catRows) {
    wsSummary.getCell(row, 1).value = label;
    wsSummary.getCell(row, 2).value = count;
    row++;
  }
  row++;

  wsSummary.getCell(row, 1).value = L("Jumlah Baju per Ukuran", "Items by Size");
  wsSummary.getCell(row, 1).font = { bold: true, size: 11, color: { argb: "FF0F2847" } };
  row++;
  const sizeHeaderRow = wsSummary.getRow(row);
  sizeHeaderRow.getCell(1).value = L("Ukuran", "Size");
  sizeHeaderRow.getCell(2).value = L("Jumlah", "Count");
  sizeHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  sizeHeaderRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
  sizeHeaderRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
  row++;
  for (const [size, count] of opts.sizeBreakdown) {
    wsSummary.getCell(row, 1).value = size;
    wsSummary.getCell(row, 2).value = count;
    row++;
  }
  wsSummary.columns.forEach((col) => { col.width = 26; });

  // ── Sheet 2: Data Karyawan ──
  const wsData = wb.addWorksheet(L("Data Karyawan", "Employee Data"));
  const headers = [
    L("No. Urut", "Sequence No."), "NIK", L("Nama Karyawan", "Employee Name"),
    L("Total Peserta", "Total Participants"), L("Diri Sendiri", "Self"),
    L("Pasangan", "Spouse"), L("Jumlah Anak", "Number of Children"),
    L("Jumlah Tiket (Efektif)", "Effective Tickets"), L("Anak <2 Tahun", "Children <2yo"),
    L("Status Kehadiran", "Attendance Status"),
    L("Departemen", "Department"), L("Lokasi Pengambilan", "Pickup Location"),
    L("Kategori", "Category"), L("Status Klaim", "Claim Status"), L("Daftar Ukuran", "Size List"),
  ];
  const headerRow = wsData.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
  });

  opts.regs.forEach((r, i) => {
    const total = countFilledSizes(r);
    const anak = countChildren(r);
    const pasangan = total >= 2 ? 1 : 0; // slot 2 = pasangan, sesuai urutan tetap (1=diri, 2=pasangan, 3-9=anak)
    const cat = getGiftCategory(r);
    const dataRow = wsData.getRow(i + 2);
    dataRow.getCell(1).value = r.sequenceNo;
    dataRow.getCell(2).value = r.nik;
    dataRow.getCell(3).value = r.nama;
    dataRow.getCell(4).value = total;
    dataRow.getCell(5).value = total >= 1 ? 1 : 0;
    dataRow.getCell(6).value = pasangan;
    dataRow.getCell(7).value = anak;
    dataRow.getCell(8).value = getEffectiveTicketCount(r);
    dataRow.getCell(9).value = r.anakDibawah2Tahun ?? 0;
    dataRow.getCell(10).value = r.statusKehadiran ?? "-";
    dataRow.getCell(11).value = r.departemen;
    dataRow.getCell(12).value = r.lokasiPengambilan;
    dataRow.getCell(13).value = cat ? CATEGORY_LABEL[cat][opts.lang] : "-";
    dataRow.getCell(14).value = r.claimed ? L("Sudah Diambil", "Claimed") : L("Belum Diambil", "Not Claimed");
    dataRow.getCell(15).value = r.selections
      .filter((s) => s.variant != null && String(s.variant).trim() !== "" && !/^\uFFFD+$/.test(String(s.variant).trim()))
      .map((s) => parseGiftSize(String(s.variant)).size)
      .join(", ") || "-";
  });
  wsData.columns.forEach((col) => { col.width = 18; });
  wsData.getColumn(3).width = 28; // Nama lebih lebar
  wsData.getColumn(15).width = 30; // Daftar Ukuran perlu lebih lebar

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filename}_${toLocalISODate(new Date())}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Kartu "Stok Baju per Ukuran" — admin isi stok fisik yang datang
 *  UNTUK TIAP UKURAN, sistem otomatis hitung Sisa = Stok Aktual −
 *  Jumlah yang SUDAH DIAMBIL (dari peserta claimed=true saja). */
function StockPerSizeCard({
  sizeBreakdown, claimedSizeCounts, actualStockPerSize, onSave,
}: {
  sizeBreakdown: [string, number][];
  claimedSizeCounts: Map<string, number>;
  actualStockPerSize: Record<string, number> | null;
  onSave: (stock: Record<string, number>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function startEdit() {
    const initial: Record<string, string> = {};
    for (const [size] of sizeBreakdown) {
      const v = actualStockPerSize?.[size];
      initial[size] = v != null ? String(v) : "";
    }
    setDrafts(initial);
    setEditing(true);
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      const stock: Record<string, number> = {};
      for (const [size] of sizeBreakdown) {
        const raw = drafts[size];
        const n = raw != null && raw.trim() !== "" ? parseInt(raw, 10) : NaN;
        if (!isNaN(n)) stock[size] = n;
      }
      await onSave(stock);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan stok.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "var(--bg2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)" }}>STOK BAJU PER UKURAN (SISA SETELAH PEMBAGIAN)</div>
        {!editing ? (
          <button onClick={startEdit} style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✏️ Isi/Edit Stok Aktual
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--t3)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Batal
            </button>
            <button onClick={handleSaveAll} disabled={saving} style={{ background: "var(--brand)", border: "none", borderRadius: 8, padding: "5px 14px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {saving ? "Menyimpan..." : "Simpan Semua"}
            </button>
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Ukuran", "Stok Aktual", "Sudah Diambil", "Sisa"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "6px 10px", fontSize: 11, color: "var(--t3)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizeBreakdown.map(([size]) => {
              const diambil = claimedSizeCounts.get(size) ?? 0;
              const aktual = actualStockPerSize?.[size];
              const sisa = aktual != null ? aktual - diambil : null;
              return (
                <tr key={size} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: "var(--t1)" }}>{size}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>
                    {editing ? (
                      <input
                        type="number"
                        value={drafts[size] ?? ""}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [size]: e.target.value }))}
                        className={styles.formInput}
                        style={{ width: 90, padding: "4px 8px", textAlign: "right" }}
                      />
                    ) : (
                      <span style={{ color: "var(--t2)" }}>{aktual ?? "-"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--t2)" }}>{diambil}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: sisa == null ? "var(--t3)" : sisa < 0 ? "var(--red)" : "var(--green)" }}>
                    {sisa ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function printGiftLabels(regs: GiftRegistration[], layout: "standard" | "large" = "standard") {
  const w = window.open("", "_blank", "width=850,height=1000");
  if (!w) return;

  const perRow = 3;
  const perPage = layout === "large" ? 9 : 12;
  const labelHeight = layout === "large" ? "88mm" : "66mm";
  const noValueSize = layout === "large" ? "56px" : "50px";

  const sorted = [...regs].sort((a, b) => {
    const na = parseInt(a.sequenceNo, 10);
    const nb = parseInt(b.sequenceNo, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.sequenceNo.localeCompare(b.sequenceNo);
  });

  const labelHtmls = sorted.map((r) => {
    // Filter TEGAS — cuma slot yang benar-benar ada isinya yang dicetak.
    // Termasuk skip karakter Unicode Replacement (U+FFFD / "�") yang
    // muncul kalau CSV sumbernya disimpan dengan encoding selain UTF-8
    // (sel kosong di Excel jadi ke-decode sebagai karakter aneh ini,
    // bukan string kosong murni — makanya perlu dicek eksplisit).
    const filledSizes = r.selections.filter((s) => {
      if (s.variant == null) return false;
      const t = String(s.variant).trim();
      if (t === "") return false;
      return !/^\uFFFD+$/.test(t);
    });
    const sizeRows = filledSizes
      .map((s, i) => {
        const parsed = parseGiftSize(String(s.variant));
        return `<div class="sizeRow"><span class="idx">${i + 1}</span><span class="sizeVal">${parsed.size}</span></div>`;
      })
      .join("");
    const ticketCount = getEffectiveTicketCount(r);
    const sizesHtml =
      filledSizes.length > 0
        ? `<div class="totalRow"><span>TOTAL BAJU</span><span class="totalVal">${filledSizes.length}</span></div><div class="ticketRow">🎟️ Tiket Event: <b>${ticketCount}</b></div><div class="sizesBox">${sizeRows}</div>`
        : `<div class="totalRow"><span>TOTAL BAJU</span><span class="totalVal">0</span></div>`;

    return `
      <div class="label">
        <div class="noLabel">NO. URUT</div>
        <div class="noValue">${r.sequenceNo || "-"}</div>
        <div class="nama">${r.nama}</div>
        <div class="meta">${r.nik} &middot; ${r.departemen || "-"}</div>
        <div class="meta">${r.lokasiPengambilan || "-"}</div>
        ${r.statusKehadiran ? `<div class="statusTag">${r.statusKehadiran}</div>` : ""}
        ${(r.anakDibawah2Tahun ?? 0) > 0 ? `<div class="toddlerNote">👶 ${r.anakDibawah2Tahun} Anak Gratis Masuk / Free Entry (&lt;2 Tahun)</div>` : ""}
        ${sizesHtml}
      </div>`;
  });

  // Bagi label jadi HALAMAN eksplisit, 12 per halaman (3 kolom x 4
  // baris) — dipaksa lewat kode, BUKAN mengandalkan browser membagi
  // grid panjang secara otomatis (beberapa browser tidak konsisten
  // soal ini saat print, bisa berhenti lebih awal dari seharusnya).
  const LABELS_PER_PAGE = perPage;
  const pages: string[] = [];
  for (let i = 0; i < labelHtmls.length; i += LABELS_PER_PAGE) {
    const chunk = labelHtmls.slice(i, i + LABELS_PER_PAGE).join("");
    pages.push(`<div class="page"><div class="grid">${chunk}</div></div>`);
  }
  const pagesHtml = pages.join("");

  w.document.write(`
    <html>
      <head>
        <title>Label Pembagian — ${new Date().toLocaleDateString("id-ID")}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; margin: 0; color: #0d1a36; }
          .page { page-break-after: always; break-after: page; }
          .page:last-child { page-break-after: auto; break-after: auto; }
          .grid { overflow: hidden; } /* contain floated labels */
          .label {
            float: left; width: 62mm; height: ${labelHeight}; margin: 0 4mm 4mm 0;
            border: 1.5px solid #cfd9ee; border-radius: 10px; padding: 8px 10px;
            page-break-inside: avoid; break-inside: avoid; overflow: hidden; display: flex; flex-direction: column;
            box-shadow: 0 1px 3px rgba(15,40,71,0.08);
          }
          .label:nth-child(${perRow}n) { margin-right: 0; }
          .noLabel { font-size: 7px; color: #7886a8; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
          .noValue { font-size: ${noValueSize}; font-weight: 900; line-height: 1; color: #000; margin-bottom: 2px; letter-spacing: -0.02em; text-align: center; }
          .nama { font-weight: 800; font-size: 12px; color: #0d1a36; margin-bottom: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .meta { font-size: 8px; color: #44537a; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .totalRow {
            display: flex; justify-content: space-between; align-items: stretch;
            border-radius: 6px; margin: 5px 0 4px; overflow: hidden; border: 1px solid #cfd9ee;
            font-size: 8.5px; font-weight: 800; color: #7886a8; flex-shrink: 0;
          }
          .totalRow span:first-child { background: #eef2fb; display: flex; align-items: center; padding: 0 8px; letter-spacing: 0.04em; }
          .ticketRow { font-size: 8px; color: #a87c1f; font-weight: 700; margin-bottom: 4px; flex-shrink: 0; }
          .ticketRow b { font-size: 9.5px; }
          .totalVal {
            font-size: 13px; font-weight: 900; color: #fff; background: #0d1a36;
            padding: 4px 12px; display: flex; align-items: center; justify-content: center; min-width: 26px;
          }
          .sizesBox { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; flex: 1; min-height: 0; }
          .sizeRow {
            display: flex; justify-content: space-between; font-size: 9px; padding: 1px 8px;
            border-bottom: 1px solid #f1f5f9; line-height: 1.35; background: #fff;
          }
          .sizeRow:nth-child(even) { background: #f8faff; }
          .sizeRow:last-child { border-bottom: none; }
          .idx { color: #7886a8; font-weight: 700; }
          .sizeVal { font-weight: 800; color: #0d1a36; }
          .freeTag { font-size: 6.5px; font-weight: 800; color: #dc2626; background: #fef2f2; padding: 1px 4px; border-radius: 4px; margin-right: 4px; }
          .toddlerNote { font-size: 7.5px; font-weight: 800; color: #dc2626; margin-bottom: 3px; }
          .statusTag { display: inline-block; font-size: 6.5px; font-weight: 800; color: #0d1a36; background: #eef2fb; padding: 1px 6px; border-radius: 999px; margin-bottom: 3px; letter-spacing: 0.03em; }
          @media print {
            .label { box-shadow: none; }
            .totalVal { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export function GiftMasterPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  const { lang, t } = useLang();
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create" | "edit" | "registrations">("list");
  const [editTarget, setEditTarget] = useState<GiftEvent | null>(null);
  const [regEvent, setRegEvent] = useState<GiftEvent | null>(null);
  const [regs, setRegs] = useState<GiftRegistration[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GiftEvent | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStatus, setFormStatus] = useState<"open" | "closed">("open");
  const [formMode, setFormMode] = useState<"self_register" | "lookup">("self_register");
  const [formItems, setFormItems] = useState<GiftItemDef[]>([{ name: "", variants: [] }]);
  const [variantInput, setVariantInput] = useState<Record<number, string>>({});

  // Import CSV (mode lookup)
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"insert" | "update">("insert");
  const [importResult, setImportResult] = useState<{ inserted?: number; duplicates?: string[]; processed?: number } | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    setLoading(true);
    try { setEvents(await getGiftEvents()); } catch { /**/ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setFormName(""); setFormDesc(""); setFormStatus("open"); setFormMode("self_register");
    setFormItems([{ name: "", variants: [] }]); setVariantInput({});
    setEditTarget(null); setView("create");
  }

  function openEdit(ev: GiftEvent) {
    setFormName(ev.name); setFormDesc(ev.description ?? "");
    setFormStatus(ev.status); setFormMode(ev.mode);
    setFormItems(ev.items.map(i => ({ ...i, variants: [...i.variants] })));
    setVariantInput({}); setEditTarget(ev); setView("edit");
  }

  async function openRegistrations(ev: GiftEvent) {
    setRegEvent(ev); setView("registrations"); setRegsLoading(true);
    setCsvFile(null); setImportResult(null);
    try { setRegs(await getGiftRegistrations(ev.id)); } catch { setRegs([]); } finally { setRegsLoading(false); }
  }

  /** Parse CSV kolom: NIK, Nama, Departemen, Email, Item, Varian, Jumlah
   *  Satu NIK bisa muncul di beberapa baris (satu baris = satu barang) —
   *  otomatis digabung jadi satu registrasi per NIK. */
  /** Parser CSV FLEKSIBEL untuk format sheet Family Day / pembagian
   *  seragam: satu BARIS = satu orang (bukan satu barang). Kolom yang
   *  "dikenal" (No, Nama, NIK, Departemen, Lokasi) dibaca langsung;
   *  SISA KOLOM APAPUN NAMANYA otomatis dianggap "slot" — nama kolom
   *  itu sendiri jadi label (mis. "1".."9"), isinya jadi ukuran yang
   *  diterima. Slot yang kosong dilewati otomatis. */
  function parseGiftCsv(text: string): { nik: string; nama: string; departemen: string; email?: string; sequenceNo?: string; lokasiPengambilan?: string; jumlahTiket?: number | null; anakDibawah2Tahun?: number | null; statusKehadiran?: string | null; selections: GiftSelection[] }[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return [];
    const rawHeader = lines[0].split(",").map((h) => h.trim());
    const headerLower = rawHeader.map((h) => h.toLowerCase());

    const findCol = (...aliases: string[]) => headerLower.findIndex((h) => aliases.includes(h));
    const iNo = findCol("no", "nomor");
    const iNama = findCol("nama", "nama lengkap", "nama lengkap karyawan");
    const iNik = findCol("nik", "nik/global id karyawan", "nik/global id", "global id");
    const iDept = findCol("departemen", "department");
    const iLokasi = findCol("lokasi pengambilan", "lokasi");
    const iEmail = findCol("email");
    const iTiket = findCol("jumlah tiket", "tiket");
    const iAnakBalita = findCol("jumlah anak < 2 tahun", "anak < 2 tahun", "anak <2 tahun", "anak dibawah 2 tahun", "anak di bawah 2 tahun");
    const iStatus = findCol("status", "status kehadiran");

    if (iNik === -1 || iNama === -1) {
      throw new Error("Header CSV wajib punya kolom Nama dan NIK/Global ID (nama kolom lain bebas — semua kolom selain No/Nama/NIK/Departemen/Lokasi/Email/Jumlah Tiket/Anak <2 Tahun otomatis dianggap slot ukuran).");
    }

    const knownCols = new Set([iNo, iNama, iNik, iDept, iLokasi, iEmail, iTiket, iAnakBalita, iStatus].filter((i) => i !== -1));
    const slotCols = rawHeader.map((h, i) => ({ header: h, i })).filter(({ i }) => !knownCols.has(i) && rawHeader[i] !== "");

    const parseNum = (v: string | undefined): number | null => {
      if (v == null || v.trim() === "") return null;
      const n = parseInt(v.trim(), 10);
      return isNaN(n) ? null : n;
    };

    const results: { nik: string; nama: string; departemen: string; email?: string; sequenceNo?: string; lokasiPengambilan?: string; jumlahTiket?: number | null; anakDibawah2Tahun?: number | null; statusKehadiran?: string | null; selections: GiftSelection[] }[] = [];
    let emptyNikCounter = 0; // untuk NIK kosong — dikasih placeholder unik "0-1", "0-2", dst, supaya baris tetap ke-import (tidak di-skip diam-diam)
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim());
      let nik = cols[iNik] ?? "";
      if (!nik) {
        emptyNikCounter++;
        nik = `0-${emptyNikCounter}`;
      }

      const selections: GiftSelection[] = [];
      for (const slot of slotCols) {
        const val = cols[slot.i] ?? "";
        // Slot kosong ATAU cuma berisi Unicode Replacement Character
        // ("�", U+FFFD) — muncul kalau file CSV disimpan dengan encoding
        // selain UTF-8, sel kosong di Excel jadi ke-decode jadi karakter
        // ini alih-alih string kosong murni. Keduanya dilewati.
        if (val === "" || /^\uFFFD+$/.test(val)) continue;
        selections.push({ item: slot.header, variant: val, qty: 1 });
      }

      results.push({
        nik,
        nama: cols[iNama] ?? "",
        departemen: iDept !== -1 ? (cols[iDept] ?? "") : "",
        email: iEmail !== -1 ? cols[iEmail] : undefined,
        sequenceNo: iNo !== -1 ? (cols[iNo] ?? "") : "",
        lokasiPengambilan: iLokasi !== -1 ? (cols[iLokasi] ?? "") : "",
        jumlahTiket: iTiket !== -1 ? parseNum(cols[iTiket]) : null,
        anakDibawah2Tahun: iAnakBalita !== -1 ? parseNum(cols[iAnakBalita]) : null,
        statusKehadiran: iStatus !== -1 ? (cols[iStatus] ?? null) : null,
        selections,
      });
    }
    return results;
  }

  async function handleImportCsv() {
    if (!csvFile || !regEvent) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await csvFile.text();
      const rows = parseGiftCsv(text);
      if (rows.length === 0) { alert("Tidak ada data valid di file CSV."); return; }
      if (importMode === "update") {
        const result = await upsertGiftRegistrations(regEvent.id, rows);
        setImportResult(result);
      } else {
        const result = await bulkImportGiftRegistrations(regEvent.id, rows);
        setImportResult(result);
      }
      setRegs(await getGiftRegistrations(regEvent.id));
      setCsvFile(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengimpor CSV.");
    } finally {
      setImporting(false);
    }
  }

  const [togglingId, setTogglingId] = useState<string | null>(null);

  /** Ubah status klaim — bisa dua arah, jaga-jaga kalau petugas salah
   *  tandai (misal kepencet, atau salah cari NIK di /gift/lookup). */
  async function handleToggleClaim(r: GiftRegistration) {
    setTogglingId(r.id);
    try {
      if (r.claimed) {
        await unclaimGiftRegistration(r.id);
      } else {
        await claimGift(r.id, "Admin (Dashboard)");
      }
      if (regEvent) setRegs(await getGiftRegistrations(regEvent.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setTogglingId(null);
    }
  }

  // ── Filter komprehensif — bisa digabung (AND): kategori + ukuran + jumlah anak ──
  const [categoryFilter, setCategoryFilter] = useState<GiftCategory | "all">("all");
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [childrenFilter, setChildrenFilter] = useState<"all" | "0" | "1" | "2plus">("all");
  const [claimFilter, setClaimFilter] = useState<"all" | "claimed" | "not_claimed">("all");
  const [giftSearch, setGiftSearch] = useState("");

  const giftKpis = useMemo(() => {
    const sizeCounts = new Map<string, number>();
    const claimedSizeCounts = new Map<string, number>(); // cuma dari peserta yang SUDAH mengambil
    const categoryCounts: Record<GiftCategory, number> = { single: 0, couple: 0, family: 0 };
    const categorySizeCounts: Record<GiftCategory, Map<string, number>> = { single: new Map(), couple: new Map(), family: new Map() };
    let totalChildren = 0;
    let regsWithChildren = 0;
    let totalTiket = 0;
    let claimedTiket = 0; // tiket yang sudah "keluar" (dari peserta claimed=true)
    let totalAnakDibawah2 = 0;
    for (const r of regs) {
      const cat = getGiftCategory(r);
      if (cat) categoryCounts[cat]++;
      const childCount = countChildren(r);
      totalChildren += childCount;
      if (childCount > 0) regsWithChildren++;
      const effTiket = getEffectiveTicketCount(r); // Jumlah Tiket (CSV) dikurangi Anak <2 Tahun
      totalTiket += effTiket;
      if (r.claimed) claimedTiket += effTiket;
      totalAnakDibawah2 += r.anakDibawah2Tahun ?? 0;
      for (const s of r.selections) {
        if (s.variant == null) continue;
        const raw = String(s.variant).trim();
        if (raw === "" || /^\uFFFD+$/.test(raw)) continue;
        const parsed = parseGiftSize(raw);
        sizeCounts.set(parsed.size, (sizeCounts.get(parsed.size) ?? 0) + 1);
        if (r.claimed) claimedSizeCounts.set(parsed.size, (claimedSizeCounts.get(parsed.size) ?? 0) + 1);
        if (cat) categorySizeCounts[cat].set(parsed.size, (categorySizeCounts[cat].get(parsed.size) ?? 0) + 1);
      }
    }
    const sizeBreakdown = Array.from(sizeCounts.entries()).sort((a, b) => b[1] - a[1]);
    const claimedCount = regs.filter((r) => r.claimed).length;
    const totalBaju = sizeBreakdown.reduce((s, [, c]) => s + c, 0);
    return {
      total: regs.length,
      claimedCount,
      notClaimedCount: regs.length - claimedCount,
      totalBaju,
      totalTiket, // sekarang murni dari kolom "Jumlah Tiket" di CSV, independen dari data baju
      claimedTiket,
      totalAnakDibawah2,
      sizeBreakdown,
      claimedSizeCounts, // Map<ukuran, jumlah sudah diambil> — dipakai untuk hitung sisa stok
      categoryCounts,
      totalChildren,
      regsWithChildren,
      categorySizeBreakdown: {
        single: Array.from(categorySizeCounts.single.entries()).sort((a, b) => b[1] - a[1]),
        couple: Array.from(categorySizeCounts.couple.entries()).sort((a, b) => b[1] - a[1]),
        family: Array.from(categorySizeCounts.family.entries()).sort((a, b) => b[1] - a[1]),
      },
    };
  }, [regs]);

  /** Daftar semua ukuran unik yang ada di data — untuk dropdown filter ukuran. */
  const availableSizes = useMemo(() => giftKpis.sizeBreakdown.map(([size]) => size), [giftKpis.sizeBreakdown]);

  const visibleRegs = useMemo(() => {
    const q = giftSearch.trim().toLowerCase();
    return regs.filter((r) => {
      if (categoryFilter !== "all" && getGiftCategory(r) !== categoryFilter) return false;
      if (sizeFilter !== "all") {
        const hasSize = r.selections.some((s) => s.variant != null && parseGiftSize(String(s.variant)).size === sizeFilter);
        if (!hasSize) return false;
      }
      if (childrenFilter !== "all") {
        const n = countChildren(r);
        if (childrenFilter === "0" && n !== 0) return false;
        if (childrenFilter === "1" && n !== 1) return false;
        if (childrenFilter === "2plus" && n < 2) return false;
      }
      if (claimFilter === "claimed" && !r.claimed) return false;
      if (claimFilter === "not_claimed" && r.claimed) return false;
      if (q) {
        const hay = `${r.nama} ${r.nik} ${r.sequenceNo} ${r.departemen}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [regs, categoryFilter, sizeFilter, childrenFilter, claimFilter, giftSearch]);

  const giftReportExportPicker = useExportLanguagePicker((format, exportLang) => {
    if (!regEvent) return;
    const activeFilterLabel =
      claimFilter === "not_claimed" ? " (Belum Diambil)" :
      claimFilter === "claimed" ? " (Sudah Diambil)" :
      categoryFilter !== "all" ? ` (${CATEGORY_LABEL[categoryFilter].id})` :
      sizeFilter !== "all" ? ` (Ukuran ${sizeFilter})` : "";
    const opts = {
      lang: exportLang,
      titleId: `Laporan Pembagian — ${regEvent.name}${activeFilterLabel}`, titleEn: `Distribution Report — ${regEvent.name}${activeFilterLabel}`,
      filename: `Laporan_Pembagian_${regEvent.name.replace(/\s+/g, "_")}${activeFilterLabel.replace(/[^\w]+/g, "_")}`,
      kpis: [
        { labelId: "Total Peserta", labelEn: "Total Participants", value: giftKpis.total },
        { labelId: "Total Baju", labelEn: "Total Items", value: giftKpis.totalBaju },
        { labelId: "Total Tiket Event", labelEn: "Total Event Tickets", value: giftKpis.totalTiket },
        { labelId: "Sudah Diambil", labelEn: "Claimed", value: giftKpis.claimedCount },
        { labelId: "Belum Diambil", labelEn: "Not Claimed", value: giftKpis.notClaimedCount },
      ],
      breakdowns: [
        {
          titleId: "Jumlah Baju per Ukuran", titleEn: "Items by Size",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.sizeBreakdown.map(([size, count]) => ({ label: size, value: count })),
        },
        {
          titleId: "Jumlah Peserta per Kategori", titleEn: "Participants by Category",
          valueLabelId: "Jumlah Peserta", valueLabelEn: "Participant Count",
          items: [
            { label: "👤 Single (1 orang)", value: giftKpis.categoryCounts.single },
            { label: "💑 Suami Istri (2 orang)", value: giftKpis.categoryCounts.couple },
            { label: "👨‍👩‍👧‍👦 Keluarga (3-9 orang)", value: giftKpis.categoryCounts.family },
          ],
        },
        {
          titleId: "Ukuran Baju — Kategori Single", titleEn: "Sizes — Single Category",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.categorySizeBreakdown.single.map(([size, count]) => ({ label: size, value: count })),
        },
        {
          titleId: "Ukuran Baju — Kategori Suami Istri", titleEn: "Sizes — Couple Category",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.categorySizeBreakdown.couple.map(([size, count]) => ({ label: size, value: count })),
        },
        {
          titleId: "Ukuran Baju — Kategori Keluarga", titleEn: "Sizes — Family Category",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: giftKpis.categorySizeBreakdown.family.map(([size, count]) => ({ label: size, value: count })),
        },
      ],
      tableTitleId: "Daftar Peserta", tableTitleEn: "Participant List",
      tableRows: visibleRegs,
      tableColumns: [
        { key: "no", labelId: "No", labelEn: "No", get: (r: GiftRegistration) => r.sequenceNo },
        { key: "nama", labelId: "Nama", labelEn: "Name", get: (r: GiftRegistration) => r.nama },
        { key: "nik", labelId: "NIK", labelEn: "NIK", get: (r: GiftRegistration) => r.nik },
        { key: "total_peserta", labelId: "Total Peserta", labelEn: "Total Participants", get: (r: GiftRegistration) => countFilledSizes(r), align: "right" as const },
        {
          key: "daftar_ukuran", labelId: "Daftar Ukuran", labelEn: "Size List",
          get: (r: GiftRegistration) => r.selections
            .filter((s) => s.variant != null && String(s.variant).trim() !== "" && !/^\uFFFD+$/.test(String(s.variant).trim()))
            .map((s) => parseGiftSize(String(s.variant)).size)
            .join(", ") || "-",
        },
        { key: "jumlah_tiket", labelId: "Jumlah Tiket (Efektif)", labelEn: "Effective Tickets", get: (r: GiftRegistration) => getEffectiveTicketCount(r), align: "right" as const },
        { key: "status_kehadiran", labelId: "Status", labelEn: "Status", get: (r: GiftRegistration) => r.statusKehadiran ?? "-" },
        { key: "anak_dibawah_2", labelId: "Anak <2 Tahun", labelEn: "Children <2yo", get: (r: GiftRegistration) => r.anakDibawah2Tahun ?? 0, align: "right" as const },
        { key: "dept", labelId: "Departemen", labelEn: "Department", get: (r: GiftRegistration) => r.departemen },
        { key: "lokasi", labelId: "Lokasi", labelEn: "Location", get: (r: GiftRegistration) => r.lokasiPengambilan },
        { key: "kategori", labelId: "Kategori", labelEn: "Category", get: (r: GiftRegistration) => { const c = getGiftCategory(r); return c ? CATEGORY_LABEL[c].id : "-"; } },
        { key: "anak", labelId: "Jumlah Anak", labelEn: "Number of Children", get: (r: GiftRegistration) => countChildren(r), align: "right" as const },
        { key: "status", labelId: "Status Klaim", labelEn: "Claim Status", get: (r: GiftRegistration) => (r.claimed ? "Sudah Diambil" : "Belum Diambil") },
      ] as ReportColumn<GiftRegistration>[],
    };
    if (format === "csv") exportSummaryCsv(opts);
    else if (format === "excel") {
      exportGiftReportExcel2Sheets({
        lang: exportLang,
        eventName: `${regEvent.name}${activeFilterLabel}`,
        filename: `Laporan_Pembagian_${regEvent.name.replace(/\s+/g, "_")}`,
        kpis: opts.kpis,
        sizeBreakdown: giftKpis.sizeBreakdown,
        categoryCounts: giftKpis.categoryCounts,
        regs: visibleRegs,
      });
    }
    else exportSummaryPdf(opts);
  });

  function addItem() { setFormItems(prev => [...prev, { name: "", variants: [] }]); }
  function removeItem(i: number) { setFormItems(prev => prev.filter((_, idx) => idx !== i)); }
  function setItemName(i: number, name: string) { setFormItems(prev => prev.map((it, idx) => idx === i ? { ...it, name } : it)); }
  function addVariant(i: number) {
    const v = (variantInput[i] ?? "").trim();
    if (!v) return;
    setFormItems(prev => prev.map((it, idx) => idx === i ? { ...it, variants: [...it.variants, v] } : it));
    setVariantInput(prev => ({ ...prev, [i]: "" }));
  }
  function removeVariant(itemIdx: number, varIdx: number) {
    setFormItems(prev => prev.map((it, idx) => idx === itemIdx ? { ...it, variants: it.variants.filter((_, vi) => vi !== varIdx) } : it));
  }

  async function handleSave() {
    if (!formName.trim()) { alert("Nama event wajib diisi."); return; }
    const validItems = formItems.filter(i => i.name.trim());
    if (formMode === "self_register" && validItems.length === 0) { alert("Minimal satu item harus diisi."); return; }
    setSaving(true);
    try {
      const payload = { name: formName.trim(), description: formDesc.trim(), items: validItems, status: formStatus, mode: formMode };
      if (editTarget) { await updateGiftEvent(editTarget.id, payload); }
      else { await createGiftEvent(payload); }
      await load(); setView("list");
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  async function handleDelete(ev: GiftEvent) {
    try { await deleteGiftEvent(ev.id); await load(); setConfirmDelete(null); }
    catch (e) { alert(e instanceof Error ? e.message : "Gagal menghapus."); }
  }

  async function toggleStatus(ev: GiftEvent) {
    try { await updateGiftEvent(ev.id, { status: ev.status === "open" ? "closed" : "open" }); await load(); }
    catch { /**/ }
  }

  // ── REGISTRATIONS VIEW ──
  if (view === "registrations" && regEvent) return (
    <div style={{ ...cardStyle, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 13 }}>← Kembali</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)" }}>
          Peserta: {regEvent.name}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--t3)" }}>{regs.length} peserta</span>
        {regEvent.mode === "lookup" && regs.length > 0 && (
          <>
            <ReportExportButtons onExport={giftReportExportPicker.requestExport} disabled={regs.length === 0} />
            <button
              onClick={() => printGiftLabels(regs, "large")}
              style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
            >
              🖨️ Cetak Label (3×3)
            </button>
          </>
        )}
      </div>

      {regEvent.mode === "lookup" && regs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
          <GiftKpiCard icon="👥" label="JUMLAH KARYAWAN" value={giftKpis.total} color="var(--t1)" bg="var(--bg2)"
            onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setChildrenFilter("all"); setClaimFilter("all"); }} />
          <GiftKpiCard icon="🎁" label="TOTAL PESERTA (1-9)" value={giftKpis.totalBaju} color="var(--t1)" bg="var(--bg2)"
            onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setChildrenFilter("all"); setClaimFilter("all"); }} />
          <GiftKpiCard icon="⏳" label="BELUM DIAMBIL" value={giftKpis.notClaimedCount} color="#eab308" bg="rgba(234,179,8,0.1)"
            onClick={() => setClaimFilter("not_claimed")} active={claimFilter === "not_claimed"} />
          <GiftKpiCard icon="✅" label="SUDAH DIAMBIL" value={giftKpis.claimedCount} color="var(--green)" bg="rgba(34,197,94,0.1)"
            onClick={() => setClaimFilter("claimed")} active={claimFilter === "claimed"} />
          <GiftKpiCard icon="👤" label="KARYAWAN SINGLE (1)" value={giftKpis.categoryCounts.single} color="#6366f1" bg="rgba(99,102,241,0.08)"
            onClick={() => setCategoryFilter("single")} active={categoryFilter === "single"} />
          <GiftKpiCard icon="💑" label="BERKELUARGA, BELUM PUNYA ANAK (1-2)" value={giftKpis.categoryCounts.couple} color="#ec4899" bg="rgba(236,72,153,0.08)"
            onClick={() => setCategoryFilter("couple")} active={categoryFilter === "couple"} />
          <GiftKpiCard icon="👨‍👩‍👧‍👦" label="KELUARGA, SUDAH PUNYA ANAK (1-9)" value={giftKpis.categoryCounts.family} color="#10b981" bg="rgba(16,185,129,0.08)"
            onClick={() => setCategoryFilter("family")} active={categoryFilter === "family"} />
        </div>
      )}

      {regEvent.mode === "lookup" && regs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
          <ActualCountCard
            label="TOTAL BAJU AKTUAL (Fisik yang Datang)"
            value={regEvent.actualBajuCount}
            kebutuhan={giftKpis.totalBaju}
            onSave={async (val) => {
              await updateGiftEventActualCounts(regEvent.id, { actualBajuCount: val, actualTiketCount: regEvent.actualTiketCount });
              await load();
              const fresh = await getGiftEvents();
              const updated = fresh.find((e) => e.id === regEvent.id);
              if (updated) setRegEvent(updated);
            }}
          />
          <ActualCountCard
            label="TOTAL TIKET AKTUAL (Fisik yang Datang)"
            value={regEvent.actualTiketCount}
            kebutuhan={giftKpis.totalTiket}
            onSave={async (val) => {
              await updateGiftEventActualCounts(regEvent.id, { actualBajuCount: regEvent.actualBajuCount, actualTiketCount: val });
              await load();
              const fresh = await getGiftEvents();
              const updated = fresh.find((e) => e.id === regEvent.id);
              if (updated) setRegEvent(updated);
            }}
          />
        </div>
      )}

      {regEvent.mode === "lookup" && regEvent.actualTiketCount != null && (
        <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
          🎟️ Sisa Tiket saat ini: <b style={{ color: (regEvent.actualTiketCount - giftKpis.claimedTiket) < 0 ? "var(--red)" : "var(--green)" }}>{regEvent.actualTiketCount - giftKpis.claimedTiket}</b>
          <span style={{ color: "var(--t3)" }}>({regEvent.actualTiketCount} aktual − {giftKpis.claimedTiket} sudah diambil)</span>
        </div>
      )}

      {regEvent.mode === "lookup" && giftKpis.totalAnakDibawah2 > 0 && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
          👶 <b>{giftKpis.totalAnakDibawah2}</b> anak di bawah 2 tahun terdaftar. Jumlah Tiket dihitung dari kolom &quot;Jumlah Tiket&quot; di CSV (independen dari jumlah baju).
        </div>
      )}

      {regEvent.mode === "lookup" && giftKpis.sizeBreakdown.length > 0 && (
        <StockPerSizeCard
          sizeBreakdown={giftKpis.sizeBreakdown}
          claimedSizeCounts={giftKpis.claimedSizeCounts}
          actualStockPerSize={regEvent.actualStockPerSize}
          onSave={async (stock) => {
            await updateGiftEventStockPerSize(regEvent.id, stock);
            const fresh = await getGiftEvents();
            const updated = fresh.find((e) => e.id === regEvent.id);
            if (updated) setRegEvent(updated);
          }}
        />
      )}

      {regEvent.mode === "lookup" && giftKpis.sizeBreakdown.length > 0 && (
        <div style={{ background: "var(--bg2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 10 }}>TOTAL PER UKURAN BAJU</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {giftKpis.sizeBreakdown.map(([size, count]) => (
              <button
                key={size}
                onClick={() => setSizeFilter(sizeFilter === size ? "all" : size)}
                style={{
                  background: sizeFilter === size ? "var(--brand)" : "var(--surface)",
                  border: `1px solid ${sizeFilter === size ? "var(--brand)" : "var(--border2)"}`,
                  borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: sizeFilter === size ? "#fff" : "var(--t1)" }}>{size}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: sizeFilter === size ? "#fff" : "var(--brand)" }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {regEvent.mode === "lookup" && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--t1)", marginBottom: 6 }}>📥 Import Data dari CSV</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setImportMode("insert")}
              style={{
                padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: importMode === "insert" ? "var(--brand)" : "var(--surface)",
                color: importMode === "insert" ? "#fff" : "var(--t2)",
              }}
            >
              📥 Import Data Baru
            </button>
            <button
              onClick={() => setImportMode("update")}
              style={{
                padding: "6px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: importMode === "update" ? "var(--brand)" : "var(--surface)",
                color: importMode === "update" ? "#fff" : "var(--t2)",
              }}
            >
              🔄 Update Data Existing
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--t3)", marginBottom: 12 }}>
            {importMode === "update" ? (
              <>
                Mode <strong>Update</strong>: NIK yang <strong>sudah ada</strong> akan diperbarui (nama, ukuran, dll) dari data CSV terbaru — <strong>status "sudah/belum diambil" TIDAK berubah</strong>. NIK yang belum ada akan ditambahkan sebagai baris baru. Cocok untuk perbaiki data yang salah tanpa kehilangan progres pengambilan.
              </>
            ) : (
              <>
                Kolom wajib: <code>Nama</code>, <code>NIK/Global ID</code>. Kolom opsional yang dikenali: <code>No, Departemen, Lokasi Pengambilan, Email, Jumlah Tiket, Jumlah Anak &lt; 2 tahun, Status</code>. <strong>Kolom lain apapun namanya</strong> (misal <code>1, 2, 3...9</code>) otomatis dianggap slot ukuran — 1 baris = 1 orang, kolom yang kosong dilewati otomatis.
                <br />
                ⚠️ Baris dengan <strong>NIK kosong</strong> tetap di-import (tidak dilewati) dengan NIK sementara <code>0-1</code>, <code>0-2</code>, dst — mohon cek &amp; perbaiki manual di tabel Peserta setelah import.
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12, color: "var(--t2)" }} />
            <button
              onClick={handleImportCsv}
              disabled={!csvFile || importing}
              style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: !csvFile || importing ? "default" : "pointer", opacity: !csvFile || importing ? 0.6 : 1 }}
            >
              {importing ? "Memproses..." : importMode === "update" ? "Update" : "Import"}
            </button>
          </div>
          {importResult && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--t2)" }}>
              {importResult.processed != null ? (
                <>✅ {importResult.processed} data berhasil diperbarui/ditambahkan (status klaim tidak berubah).</>
              ) : (
                <>
                  ✅ {importResult.inserted} data berhasil ditambahkan.
                  {importResult.duplicates && importResult.duplicates.length > 0 && (
                    <div style={{ color: "var(--orange-text)", marginTop: 4 }}>
                      ⚠️ {importResult.duplicates.length} NIK dilewati karena sudah ada di event ini: {importResult.duplicates.join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {regsLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>Memuat...</div>
      ) : regs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div>Belum ada yang mendaftar</div>
        </div>
      ) : (
        <div>
          {regEvent.mode === "lookup" && (
            <div style={{ position: "relative", marginBottom: 12, maxWidth: 380 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: 13 }}>🔍</span>
              <input
                value={giftSearch}
                onChange={(e) => setGiftSearch(e.target.value)}
                placeholder="Cari nama, NIK, atau nomor urut..."
                className={styles.formInput}
                style={{ paddingLeft: 36, borderRadius: "var(--pill)" }}
              />
            </div>
          )}
          {regEvent.mode === "lookup" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {([
                ["all", `Semua (${regs.length})`],
                ["single", `👤 Single (${giftKpis.categoryCounts.single})`],
                ["couple", `💑 Suami Istri (${giftKpis.categoryCounts.couple})`],
                ["family", `👨‍👩‍👧‍👦 Keluarga (${giftKpis.categoryCounts.family})`],
              ] as [GiftCategory | "all", string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  style={{
                    padding: "7px 14px", borderRadius: "var(--pill)", border: "1px solid var(--border2)",
                    background: categoryFilter === key ? "var(--brand)" : "var(--bg2)",
                    color: categoryFilter === key ? "#fff" : "var(--t2)",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {regEvent.mode === "lookup" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
                className={styles.formSelect}
                style={{ width: "auto", fontSize: 12.5 }}
              >
                <option value="all">📏 Semua Ukuran</option>
                {availableSizes.map((size) => (
                  <option key={size} value={size}>Ukuran: {size}</option>
                ))}
              </select>
              <select
                value={childrenFilter}
                onChange={(e) => setChildrenFilter(e.target.value as typeof childrenFilter)}
                className={styles.formSelect}
                style={{ width: "auto", fontSize: 12.5 }}
              >
                <option value="all">🧒 Semua (Jumlah Anak)</option>
                <option value="0">Tanpa Anak</option>
                <option value="1">1 Anak</option>
                <option value="2plus">2+ Anak</option>
              </select>
              {(categoryFilter !== "all" || sizeFilter !== "all" || childrenFilter !== "all" || claimFilter !== "all" || giftSearch !== "") && (
                <button
                  onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setChildrenFilter("all"); setClaimFilter("all"); setGiftSearch(""); }}
                  style={{ background: "none", border: "none", color: "var(--red)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  ✕ Reset Filter
                </button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--t3)", fontWeight: 600 }}>
                Menampilkan {visibleRegs.length} dari {regs.length} peserta
              </span>
            </div>
          )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg2)" }}>
                {["NIK", "Nama", "Departemen", "Email", "Item", "Status", "Terdaftar", "Aksi"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--t3)", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRegs.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", color: "var(--t2)" }}>{r.nik}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--t1)" }}>{r.nama}</td>
                  <td style={{ padding: "10px 12px", color: "var(--t2)" }}>{r.departemen}</td>
                  <td style={{ padding: "10px 12px", color: "var(--t3)", fontSize: 12 }}>{r.email}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.selections.filter(s => s.variant != null && String(s.variant).trim() !== "" && !/^\uFFFD+$/.test(String(s.variant).trim())).map(s => {
                      const parsed = parseGiftSize(String(s.variant));
                      return (
                        <span key={s.item} style={{ fontSize: 11, background: "var(--bg2)", color: "var(--t1)", borderRadius: 6, padding: "2px 8px", marginRight: 4, whiteSpace: "nowrap" }}>
                          {s.item} ({parsed.size})
                        </span>
                      );
                    })}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: r.claimed ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)", color: r.claimed ? "var(--green)" : "#eab308" }}>
                      {r.claimed ? "✅ Diambil" : "⏳ Belum"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--t3)", fontSize: 11 }}>
                    {new Date(r.registeredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      onClick={() => handleToggleClaim(r)}
                      disabled={togglingId === r.id}
                      title={r.claimed ? "Batalkan status — kembalikan jadi Belum Diambil" : "Tandai manual sebagai Sudah Diambil"}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border2)",
                        background: "var(--surface)", color: "var(--t2)", cursor: togglingId === r.id ? "default" : "pointer",
                        opacity: togglingId === r.id ? 0.5 : 1, whiteSpace: "nowrap",
                      }}
                    >
                      {togglingId === r.id ? "..." : r.claimed ? "↩️ Batalkan" : "✅ Tandai"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
      {giftReportExportPicker.pending && (
        <LanguagePickerModal key={giftReportExportPicker.pending} format={giftReportExportPicker.pending} onConfirm={giftReportExportPicker.confirm} onClose={giftReportExportPicker.cancel} />
      )}
    </div>
  );

  // ── CREATE / EDIT FORM ──
  if (view === "create" || view === "edit") return (
    <div style={{ ...cardStyle, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 13 }}>← Batal</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)" }}>
          {view === "create" ? "Buat Event Baru" : `Edit: ${editTarget?.name}`}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>NAMA EVENT</label>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Contoh: Pembagian Seragam 2026" className={styles.formInput} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>DESKRIPSI (opsional)</label>
          <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Informasi tambahan untuk karyawan" className={styles.formInput} />
        </div>
        <div>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>STATUS</label>
          <select value={formStatus} onChange={e => setFormStatus(e.target.value as "open" | "closed")} className={styles.formSelect} style={{ width: "auto" }}>
            <option value="open">🟢 Buka (karyawan bisa daftar)</option>
            <option value="closed">🔴 Tutup</option>
          </select>
        </div>
        <div>
          <label className="fLabel" style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>MODE PROJECT</label>
          <select value={formMode} onChange={e => setFormMode(e.target.value as "self_register" | "lookup")} className={styles.formSelect} style={{ width: "auto" }}>
            <option value="self_register">📝 Karyawan Daftar Sendiri</option>
            <option value="lookup">📥 Import Data (Admin) — cari by NIK</option>
          </select>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 5 }}>
            {formMode === "lookup"
              ? "Karyawan tidak perlu daftar apapun — cukup kasih NIK ke petugas, semua detail muncul otomatis."
              : "Karyawan mengisi form pendaftaran sendiri dan memilih item yang diinginkan."}
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--t2)", marginBottom: 12 }}>Item yang Dibagikan</div>
      {formItems.map((item, i) => (
        <div key={i} style={{ background: "var(--bg2)", borderRadius: 14, padding: "16px", marginBottom: 10, border: "1px solid var(--border2)" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
            <input value={item.name} onChange={e => setItemName(i, e.target.value)} placeholder="Nama item (contoh: Seragam)" className={styles.formInput} style={{ flex: 1 }} />
            {formItems.length > 1 && (
              <button onClick={() => removeItem(i)} style={{ background: "rgba(239,68,68,0.1)", border: "none", borderRadius: 8, padding: "8px 12px", color: "var(--red)", cursor: "pointer", fontSize: 16 }}>×</button>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>Varian/Ukuran (kosongkan jika semua sama):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {item.variants.map((v, vi) => (
              <span key={vi} style={{ fontSize: 12, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                {v}
                <button onClick={() => removeVariant(i, vi)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={variantInput[i] ?? ""} onChange={e => setVariantInput(p => ({ ...p, [i]: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addVariant(i))}
              placeholder="Ketik ukuran lalu Enter" className={styles.formInput} style={{ flex: 1, padding: "8px 12px" }} />
            <button onClick={() => addVariant(i)} style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>+ Tambah</button>
          </div>
        </div>
      ))}
      <button onClick={addItem} style={{ background: "none", border: "1.5px dashed var(--border2)", borderRadius: 12, padding: "10px 16px", color: "var(--t3)", cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 20 }}>
        + Tambah Item Lain
      </button>

      <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>
        {saving ? "Menyimpan..." : view === "create" ? "Buat Event" : "Simpan Perubahan"}
      </button>
    </div>
  );

  // ── LIST VIEW ──
  return (
    <div style={{ ...cardStyle, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--t1)" }}>{lang === "en" ? "Distribution events" : "Event pembagian"}</div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{lang === "en" ? "Links to share and the list of programs" : "Link untuk dibagikan dan daftar program"}</div>
        </div>
        <button onClick={openCreate} style={{ background: "var(--brand)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Event Baru
        </button>
      </div>

      {/* Links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "🔗 Link Pendaftaran Karyawan", url: `${baseUrl}/gift`, desc: "Bagikan ke karyawan (mode Daftar Sendiri)" },
          { label: "🔑 Link Verifikasi Petugas", url: `${baseUrl}/gift/verify`, desc: "Cek passcode — mode Daftar Sendiri" },
          { label: "🔍 Link Cari by NIK", url: `${baseUrl}/gift/lookup`, desc: "Cek data via NIK — mode Import Data" },
        ].map(l => (
          <div key={l.url} style={{ background: "var(--bg2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border2)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 6 }}>{l.label}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>{l.desc}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input readOnly value={l.url} style={{ flex: 1, fontSize: 11, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--t2)", fontFamily: "var(--mono)" }} />
              <button onClick={() => navigator.clipboard.writeText(l.url)} style={{ background: "var(--brand)", border: "none", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 11, cursor: "pointer" }}>Salin</button>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎁</div>
          <div style={{ fontWeight: 700, color: "var(--t2)", marginBottom: 4 }}>Belum ada event</div>
          <div style={{ fontSize: 13 }}>Buat event baru untuk mulai pembagian.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map(ev => (
            <div key={ev.id} style={{ border: "1px solid var(--border2)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px", background: "var(--bg2)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: "var(--t1)" }}>{ev.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: ev.status === "open" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)", color: ev.status === "open" ? "var(--green)" : "var(--red)" }}>
                      {ev.status === "open" ? "BUKA" : "TUTUP"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: "var(--bg2)", color: "var(--t3)" }}>
                      {ev.mode === "lookup" ? "📥 Import Data" : "📝 Daftar Sendiri"}
                    </span>
                  </div>
                  {ev.description && <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 6 }}>{ev.description}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ev.items.map(item => (
                      <span key={item.name} style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, padding: "2px 10px", color: "var(--t2)" }}>
                        {item.name}{item.variants.length > 0 ? ` (${item.variants.join(", ")})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 14 }}>
                  <button onClick={() => openRegistrations(ev)} title="Lihat peserta" style={{ background: "rgba(61,111,242,0.1)", border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>👥</button>
                  <button onClick={() => toggleStatus(ev)} title={ev.status === "open" ? "Tutup pendaftaran" : "Buka pendaftaran"} style={{ background: ev.status === "open" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>
                    {ev.status === "open" ? "🔒" : "🔓"}
                  </button>
                  <button onClick={() => openEdit(ev)} title="Edit" style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>✏️</button>
                  <button onClick={() => setConfirmDelete(ev)} title="Hapus" style={{ background: "rgba(239,68,68,0.1)", border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={380}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--t1)", marginBottom: 8 }}>Hapus Event?</div>
            <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 20 }}>
              Event "<strong>{confirmDelete.name}</strong>" dan semua data pendaftarannya akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Hapus</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
