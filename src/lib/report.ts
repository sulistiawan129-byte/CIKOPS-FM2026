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

/* ════════════════════════════════════════════════════════════
   KARANGAN BUNGA DUKA CITA — laporan khusus, terpisah dari
   laporan klaim reguler karena bukan pengeluaran per-driver.
════════════════════════════════════════════════════════════ */

type Lang = "id" | "en";
const pick = (lang: Lang) => (id: string, en: string) => (lang === "en" ? en : id);

export function exportWreathsToCsv(
  wreaths: Wreath[],
  plantLabel: string,
  lang: Lang = "id"
): void {
  const L = pick(lang);
  const headers = [L("Tanggal", "Date"), L("Atas Nama", "On Behalf Of"), L("Status Klaim", "Claim Status"), L("Keterangan", "Notes")];

  const rows = wreaths.map((w) => [
    formatDateOnly(w.tanggal),
    w.atasNama,
    w.claimed ? L("Sudah Diajukan", "Submitted") : L("Belum Diajukan", "Not Submitted"),
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

function fmtJam(iso: string | null, lang: Lang = "id"): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(lang === "en" ? "en-GB" : "id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDurasi(timeOut: string | null, timeIn: string | null, lang: Lang = "id"): string {
  if (!timeOut || !timeIn) return "";
  const ms = Math.abs(new Date(timeIn).getTime() - new Date(timeOut).getTime());
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}${lang === "en" ? "h" : "j"} ${m}m`;
}

function statusLabelGate(log: VehicleGateLog, lang: Lang = "id"): string {
  const L = pick(lang);
  if (log.plant === "CIK") {
    return log.status === "DONE" ? L("Sudah Kembali", "Returned") : L("Sedang Keluar", "Currently Out");
  }
  return log.status === "DONE" ? L("Sudah Check-Out", "Checked Out") : L("Sedang Check-In", "Checked In");
}

export function exportGateLogsToCsv(logs: VehicleGateLog[], lang: Lang = "id", plantLabel?: string): void {
  const headers = lang === "en"
    ? ["log_id", "date", "driver_id", "driver_name", "vehicle_plate", "destination", "time_out", "time_in", "status", "Duration", "vehicle_plant"]
    : ["log_id", "tanggal", "driver_id", "nama_driver", "plat_mobil", "tujuan", "jam_out", "jam_in", "status", "Durasi", "plant_kendaraan"];

  const rows = logs.map((l) => [
    l.id,
    formatDateOnly(l.createdAt),
    l.driverId ?? "",
    l.driverName,
    l.nopol,
    l.tujuan,
    fmtJam(l.timeOut, lang),
    fmtJam(l.timeIn, lang),
    statusLabelGate(l, lang),
    fmtDurasi(l.timeOut, l.timeIn, lang),
    l.plant,
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
  link.download = `GateLog${plantLabel ? `_${plantLabel}` : ""}_${todayForFilename()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════
   PRINTER MANAGEMENT — laporan permintaan (reset kuota, tambah
   kuota, ambil toner).
════════════════════════════════════════════════════════════ */

function printerRequestTypeLabel(t: PrinterRequest["requestType"], lang: Lang = "id"): string {
  const L = pick(lang);
  if (t === "RESET_KUOTA") return L("Reset Kuota", "Quota Reset");
  if (t === "TAMBAH_KUOTA") return L("Tambah Kuota", "Add Quota");
  return L("Pengambilan Toner", "Toner Pickup");
}

export function exportPrinterRequestsToCsv(requests: PrinterRequest[], lang: Lang = "id"): void {
  const L = pick(lang);
  const headers = [L("Tanggal", "Date"), L("No EQ Printer", "Printer EQ No."), L("Lokasi", "Location"), L("Jenis Permintaan", "Request Type"), L("Nama Karyawan", "Employee Name"), L("Departemen", "Department"), L("Jumlah Kuota", "Quota Amount"), L("Catatan", "Notes")];

  const rows = requests.map((r) => [
    formatDateOnly(r.createdAt),
    r.printerNoEq,
    r.printerLocation,
    printerRequestTypeLabel(r.requestType, lang),
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
