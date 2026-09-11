export type TaskStatus = "ASSIGNED" | "ON GOING" | "DONE" | "CANCELLED";

export interface Driver {
  id: string;
  nama: string;
  no_hp: string | null;
  avatar_emoji: string | null;
  aktif: boolean;
  // Added by the FleetOS merge migration:
  email?: string | null;
  tier_id?: string | null;
  plant?: Plant;
}

export interface Vehicle {
  id: string;
  nopol: string;
  jenis: string | null;
  aktif: boolean;
  // Added by the FleetOS merge migration:
  year?: number | null;
  color?: string | null;
  fuel?: string | null;
  odometer?: number | null;
  kir_date?: string | null;
  service_date?: string | null;
  stnk_date?: string | null;
  dept?: string | null;
  default_driver_id?: string | null;
  plant?: Plant;
}

export interface Employee {
  id: string;
  nama: string;
  departement: string | null;
}

export interface JobType {
  id: string;
  label: string;
}

export type Plant = "CIK" | "PRB";

export interface ClaimItem {
  type: string;
  expr: string;
  total: number;
}

export interface Claim {
  id: string;
  driver_id: string;
  driverName: string;
  driverEmail: string;
  submissionDate: string;
  periodDate: string;
  items: ClaimItem[];
  total: number;
  status: string;
  note: string;
  submittedAt: string;
  plant: Plant;
}

/** Karangan Bunga Duka Cita — condolence flower wreath record, tracked
 *  separately from regular expense claims since it's a one-off event
 *  (not tied to a driver or a Rp amount) that still needs its own
 *  claim-submitted status and its own report. */
/** Catatan keluar/masuk kendaraan di security gate. Semantik status
 *  tergantung plant: CIK => OUT berarti "sedang pergi kerja", DONE
 *  berarti "sudah kembali". PRB => IN berarti "sedang check-in
 *  (di dalam)", DONE berarti "sudah check-out". */
/** Printer Management — daftar printer kantor (berwarna/hitam-putih)
 *  dan pencatatan permintaan karyawan (reset kuota, tambah kuota,
 *  pengambilan toner) yang diinput admin. */
export type EmployeeRequestType = "DRIVER" | "TONER" | "OTHER";
export type EmployeeRequestStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "REJECTED";

/** Field spesifik untuk permintaan jenis DRIVER — disimpan di kolom
 *  `details` (jsonb) supaya skema employee_requests tetap fleksibel
 *  kalau nanti ada jenis permintaan baru lagi. */
export interface DriverRequestDetails {
  eventDate: string;       // Tanggal Event/Acara
  destination: string;     // Tujuan
  departureTime: string;   // Jam Berangkat
  purpose: string;         // Keperluan
  additionalNotes: string; // Catatan Tambahan
}

/** Permintaan karyawan dari form publik (/request) — request driver
 *  atau lainnya (permintaan terkait printer masuk langsung ke tabel
 *  printer_requests, lihat PrinterRequest di bawah, supaya otomatis
 *  sinkron dengan log yang dipakai admin). */
export interface EmployeeRequest {
  id: string;
  requestType: EmployeeRequestType;
  employeeName: string;
  department: string;
  phone: string;
  description: string;
  details: Partial<DriverRequestDetails>;
  status: EmployeeRequestStatus;
  adminNotes: string;
  createdAt: string;
  processedAt: string | null;
}

/** ATK (alat tulis kantor) — data disinkronkan dari Excel/VBA lewat
 *  tombol "Sinkron ke CIKOPS". CIKOPS cuma untuk laporan, input
 *  tetap dilakukan di Excel. */
export interface AtkItem {
  id: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  stok: number;
  updatedAt: string;
}

export interface AtkRequest {
  id: string;
  requestId: string;
  tanggal: string;
  nama: string;
  nik: string;
  departemen: string;
  kodeBarang: string;
  namaBarang: string;
  jumlah: number;
  satuan: string;
  helper: string;
  createdAt: string;
}

export interface AtkRestock {
  id: string;
  updateId: string;
  tanggal: string;
  nama: string;
  nik: string;
  departemen: string;
  kodeBarang: string;
  namaBarang: string;
  jumlah: number;
  satuan: string;
  createdAt: string;
}

/** Agenda/Kalender & Pengumuman — widget Dashboard. */
export interface AgendaEvent {
  id: string;
  title: string;
  location: string;
  eventDate: string; // yyyy-mm-dd
  eventTime: string; // "HH:MM" bebas teks
  color: string;
  createdBy: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Printer {
  id: string;
  noEq: string;
  location: string;
  type: "COLOR" | "BW";
  controlPanelUrl: string;
  brand: string;
  aktif: boolean;
  createdAt: string;
}

export type PrinterRequestType = "RESET_KUOTA" | "TAMBAH_KUOTA" | "AMBIL_TONER";
export type PrinterRequestSource = "ADMIN" | "EMPLOYEE";

export interface PrinterRequest {
  id: string;
  printerId: string | null;
  printerNoEq: string;
  printerLocation: string;
  printUserId: string;
  source: PrinterRequestSource;
  requestType: PrinterRequestType;
  employeeName: string;
  department: string;
  quotaAmount: number | null;
  notes: string;
  createdAt: string;
}

export interface VehicleGateLog {
  id: string;
  vehicleId: string;
  nopol: string;
  jenis: string;
  color: string;
  driverId: string | null;
  driverNameManual: string | null;
  driverName: string; // resolved: driverNameManual jika ada, kalau tidak nama driver terdaftar
  plant: Plant;
  tujuan: string;
  timeOut: string | null;
  timeIn: string | null;
  status: "OUT" | "IN" | "DONE";
  createdAt: string;
}

/** Opsi ringan untuk dropdown di halaman publik gate — sengaja tidak
 *  pakai tipe Vehicle/Driver penuh karena RPC publiknya cuma expose
 *  kolom yang benar-benar perlu (lihat get_active_vehicles_for_gate /
 *  get_active_drivers_for_gate di migration 016). */
export interface GateVehicleOption {
  id: string;
  nopol: string;
  jenis: string;
  plant: Plant;
  color: string;
}
export interface GateDriverOption {
  id: string;
  nama: string;
}

/** Karangan Bunga Duka Cita — condolence flower wreath record, tracked
 *  separately from regular expense claims since it's a one-off event
 *  (not tied to a driver or a Rp amount) that still needs its own
 *  claim-submitted status and its own report. */
export interface Wreath {
  id: string;
  plant: Plant;
  tanggal: string;
  atasNama: string;
  keterangan: string;
  claimed: boolean;
  createdAt: string;
}

export interface Overtime {
  id: string;
  driver_id: string;
  driverName: string;
  period: string;
  periodYear: number;
  periodMonth: number;
  plant: Plant;
  hours: number;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface DriverTier {
  id: string;
  name: string;
  color: string;
  amountPerMonth: number;
  activeDriverCount: number;
}

export interface Kantong {
  id: string;
  period: string;
  plant: Plant;
  totalBudget: number;
  allocOpDriver: number;
  allocEmergency: number;
  cashAvailable: number;
  claimSubmitted: number;
  claimPaid: number;
  unsubmittedClaim: number;
  lastReset: string;
}

export interface FuelEntry {
  type: string;
  available: boolean;
}

export interface GasStation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  fuels: FuelEntry[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail {
  id: string;
  tanggal: string;
  driver_id: string | null;
  driver_nama: string | null;
  driver_avatar: string | null;
  vehicle_id: string | null;
  kendaraan: string | null;
  kendaraan_jenis: string | null;
  jenis_pekerjaan: string;
  tujuan: string;
  requestor: string;
  departement: string | null;
  perihal: string | null;
  status: TaskStatus;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  plant: Plant;
  batch_id: string | null;
  batch_total_days: number;
}

export interface TaskStats {
  total: number;
  assigned: number;
  ongoing: number;
  done: number;
  cancelled: number;
}

export function computeStats(tasks: TaskDetail[]): TaskStats {
  return {
    total: tasks.length,
    assigned: tasks.filter((t) => t.status === "ASSIGNED").length,
    ongoing: tasks.filter((t) => t.status === "ON GOING").length,
    done: tasks.filter((t) => t.status === "DONE").length,
    cancelled: tasks.filter((t) => t.status === "CANCELLED").length,
  };
}

export interface DriverSummary {
  driverId: string;
  driverNama: string;
  total: number;
  done: number;
  cancelled: number;
  ongoingOrAssigned: number;
  completionRate: number;
  avgDurationMinutes: number | null;
}

export function computeDriverSummaries(
  tasks: TaskDetail[],
  drivers: Driver[]
): DriverSummary[] {
  const byDriver = new Map<string, TaskDetail[]>();
  for (const t of tasks) {
    if (!t.driver_id) continue;
    const list = byDriver.get(t.driver_id) ?? [];
    list.push(t);
    byDriver.set(t.driver_id, list);
  }

  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const summaries: DriverSummary[] = [];
  // Iterate over byDriver (derived straight from `tasks`), not over `drivers`.
  // Iterating over `drivers` would silently drop any task whose driver_id
  // isn't present in that array (e.g. an inactive/deleted driver that was
  // filtered out before calling this function).
  for (const [driverId, list] of byDriver) {
    const driver = driverById.get(driverId);
    // Fall back to the name already denormalized onto the task row when the
    // driver record itself isn't available.
    const driverNama = driver?.nama ?? list[0]?.driver_nama ?? "Unknown";

    const done = list.filter((t) => t.status === "DONE").length;
    const cancelled = list.filter((t) => t.status === "CANCELLED").length;
    const ongoingOrAssigned = list.filter(
      (t) => t.status === "ASSIGNED" || t.status === "ON GOING"
    ).length;

    const durations: number[] = [];
    for (const t of list) {
      if (t.status === "DONE" && t.accepted_at && t.completed_at) {
        const ms =
          new Date(t.completed_at).getTime() -
          new Date(t.accepted_at).getTime();
        if (ms > 0) durations.push(ms / 60000);
      }
    }
    const avgDurationMinutes =
      durations.length > 0
        ? Math.round(
            (durations.reduce((a, b) => a + b, 0) / durations.length) * 100
          ) / 100
        : null;

    summaries.push({
      driverId,
      driverNama,
      total: list.length,
      done,
      cancelled,
      ongoingOrAssigned,
      completionRate:
        list.length > 0 ? Math.round((done / list.length) * 10000) / 100 : 0,
      avgDurationMinutes,
    });
  }

  return summaries.sort((a, b) => b.total - a.total);
}

export interface CanteenReport {
  id: string;
  reportDate: string;
  snackOrder: [number, number, number];
  snackLeftover: [number, number, number];
  mealOrder: [number, number, number];
  mealLeftover: [number, number, number];
  submittedBy: string;
  createdAt: string;
}

export interface CanteenKPI {
  days: number;
  totalSnackOrder: number;
  totalSnackConsumed: number;
  totalSnackLeftover: number;
  totalMealOrder: number;
  totalMealConsumed: number;
  totalMealLeftover: number;
  snackEff: number;
  mealEff: number;
}

export function computeCanteenKPI(rows: CanteenReport[]): CanteenKPI {
  let totalSnackOrder = 0, totalSnackLeftover = 0, totalMealOrder = 0, totalMealLeftover = 0;
  rows.forEach((r) => {
    totalSnackOrder += r.snackOrder[0] + r.snackOrder[1] + r.snackOrder[2];
    totalSnackLeftover += r.snackLeftover[0] + r.snackLeftover[1] + r.snackLeftover[2];
    totalMealOrder += r.mealOrder[0] + r.mealOrder[1] + r.mealOrder[2];
    totalMealLeftover += r.mealLeftover[0] + r.mealLeftover[1] + r.mealLeftover[2];
  });
  const totalSnackConsumed = Math.max(0, totalSnackOrder - totalSnackLeftover);
  const totalMealConsumed = Math.max(0, totalMealOrder - totalMealLeftover);
  return {
    days: rows.length,
    totalSnackOrder,
    totalSnackConsumed,
    totalSnackLeftover,
    totalMealOrder,
    totalMealConsumed,
    totalMealLeftover,
    snackEff: totalSnackOrder > 0 ? Math.round((totalSnackConsumed / totalSnackOrder) * 10000) / 100 : 0,
    mealEff: totalMealOrder > 0 ? Math.round((totalMealConsumed / totalMealOrder) * 10000) / 100 : 0,
  };
}

// ── Gift Distribution System ──────────────────────────────────

export interface GiftItemDef {
  name: string;
  variants: string[]; // [] = no variants (semua sama)
}

export interface GiftSelection {
  item: string;
  variant: string; // "" jika tidak ada varian
  qty?: number; // default 1 — dipakai untuk mode import (bisa lebih dari 1 per item)
}

export interface GiftEvent {
  id: string;
  name: string;
  description: string | null;
  items: GiftItemDef[];
  status: "open" | "closed";
  plant: string | null;
  mode: "self_register" | "lookup"; // self_register: karyawan daftar sendiri; lookup: admin import, karyawan cukup kasih NIK
  createdAt: string;
  updatedAt: string;
}

export interface GiftRegistration {
  id: string;
  eventId: string;
  eventName: string;
  nik: string;
  nama: string;
  departemen: string;
  email: string;
  sequenceNo: string; // "No" dari sheet asli — cuma dipakai mode lookup, kosong untuk mode self_register
  lokasiPengambilan: string; // khusus mode lookup (misal beda plant/cabang pengambilan)
  selections: GiftSelection[];
  claimed: boolean;
  claimedAt: string | null;
  claimedBy: string | null;
  registeredAt: string;
}
