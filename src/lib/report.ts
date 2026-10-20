import type { Wreath, VehicleGateLog, PrinterRequest } from "./types";

function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateOnly(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/* ════════════════════════════════════════════════════════════
   CSV EXPORT — tidak berubah, data mentah lengkap
════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — laporan profesional & komprehensif:
   1. Ringkasan keseluruhan (stat cards)
   2. Analytics & Insights (bar chart per kategori)
   3. Ringkasan per driver (tabel performa)
   4. Detail lengkap setiap tugas
════════════════════════════════════════════════════════════ */

type RGB = [number, number, number];

/* ════════════════════════════════════════════════════════════
   KARANGAN BUNGA DUKA CITA — laporan khusus, terpisah dari
   laporan klaim reguler karena bukan pengeluaran per-driver.
════════════════════════════════════════════════════════════ */

export function exportWreathsToCsv(
  wreaths: Wreath[],
  plantLabel: string
): void {
  const headers = ["Tanggal", "Atas Nama", "Status Klaim", "Keterangan"];

  const rows = wreaths.map((w) => [
    formatDateOnly(w.tanggal),
    w.atasNama,
    w.claimed ? "Sudah Diajukan" : "Belum Diajukan",
    w.keterangan || "-",
  ]);

  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  const csvContent = "\uFEFF" + csvLines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `CIKOPS_KarangaBunga_${plantLabel}_${todayForFilename()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function todayForFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ════════════════════════════════════════════════════════════
   VEHICLE GATE LOG — laporan keluar/masuk kendaraan security gate.
   Format kolom mengikuti persis sistem GAS Spreadsheet lama, supaya
   drop-in compatible dengan alur kerja yang sudah biasa dipakai:
   log_id, tanggal, driver_id, nama_driver, plat_mobil, tujuan,
   jam_out, jam_in, status, Durasi
════════════════════════════════════════════════════════════ */

function fmtJam(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDurasi(timeOut: string | null, timeIn: string | null): string {
  if (!timeOut || !timeIn) return "";
  const ms = Math.abs(new Date(timeIn).getTime() - new Date(timeOut).getTime());
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}j ${m}m`;
}

function statusLabelGate(log: VehicleGateLog): string {
  if (log.plant === "CIK") {
    return log.status === "DONE" ? "Sudah Kembali" : "Sedang Keluar";
  }
  return log.status === "DONE" ? "Sudah Check-Out" : "Sedang Check-In";
}

export function exportGateLogsToCsv(logs: VehicleGateLog[]): void {
  const headers = ["log_id", "tanggal", "driver_id", "nama_driver", "plat_mobil", "tujuan", "jam_out", "jam_in", "status", "Durasi"];

  const rows = logs.map((l) => [
    l.id,
    formatDateOnly(l.createdAt),
    l.driverId ?? "",
    l.driverName,
    l.nopol,
    l.tujuan,
    fmtJam(l.timeOut),
    fmtJam(l.timeIn),
    statusLabelGate(l),
    fmtDurasi(l.timeOut, l.timeIn),
  ]);

  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  const csvContent = "\uFEFF" + csvLines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `GateLog_${todayForFilename()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════
   PRINTER MANAGEMENT — laporan permintaan (reset kuota, tambah
   kuota, ambil toner).
════════════════════════════════════════════════════════════ */

function printerRequestTypeLabel(t: PrinterRequest["requestType"]): string {
  if (t === "RESET_KUOTA") return "Reset Kuota";
  if (t === "TAMBAH_KUOTA") return "Tambah Kuota";
  return "Pengambilan Toner";
}

export function exportPrinterRequestsToCsv(requests: PrinterRequest[]): void {
  const headers = ["Tanggal", "No EQ Printer", "Lokasi", "Jenis Permintaan", "Nama Karyawan", "Departemen", "Jumlah Kuota", "Catatan"];

  const rows = requests.map((r) => [
    formatDateOnly(r.createdAt),
    r.printerNoEq,
    r.printerLocation,
    printerRequestTypeLabel(r.requestType),
    r.employeeName,
    r.department,
    r.quotaAmount ?? "",
    r.notes,
  ]);

  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  const csvContent = "\uFEFF" + csvLines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `PrinterRequests_${todayForFilename()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
