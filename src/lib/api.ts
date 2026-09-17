import { supabase } from "./supabaseClient";
import { todayLocalISODate } from "./dateUtils";
import type {
  Claim,
  ClaimItem,
  Driver,
  DriverTier,
  Employee,
  FuelEntry,
  GasStation,
  JobType,
  Kantong,
  Overtime,
  Plant,
  TaskDetail,
  TaskStatus,
  Vehicle,
  CanteenReport,
  Wreath,
  VehicleGateLog,
  GateVehicleOption,
  GateDriverOption,
  Printer,
  PrinterRequest,
  PrinterRequestType,
  EmployeeRequest,
  EmployeeRequestType,
  EmployeeRequestStatus,
  DriverRequestDetails,
  PrinterRequestSource,
  AtkItem,
  AtkRequest,
  AtkRestock,
  AgendaEvent,
  Announcement,
} from "./types";

/* ════════════════════════════════════════════════════════════
   MASTER DATA
════════════════════════════════════════════════════════════ */

export async function getDrivers(plant?: Plant | null): Promise<Driver[]> {
  let q = supabase
    .from("drivers")
    .select("id, nama, no_hp, avatar_emoji, aktif, tier_id, email, plant")
    .eq("aktif", true)
    .order("nama", { ascending: true });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getVehicles(plant?: Plant | null): Promise<Vehicle[]> {
  let q = supabase
    .from("vehicles")
    .select("id, nopol, jenis, aktif, plant")
    .eq("aktif", true)
    .order("nopol", { ascending: true });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, nama, departement")
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getJobTypes(): Promise<JobType[]> {
  const { data, error } = await supabase
    .from("job_types")
    .select("id, label")
    .order("label", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ════════════════════════════════════════════════════════════
   AUTH (Supabase Auth) — driver login pakai email + password.
   Akun dibuat manual oleh admin di Supabase Dashboard → Authentication
   → Users (Invite/Add user), dengan email yang SAMA dengan kolom
   drivers.email. Fungsi di bawah menghubungkan sesi auth ke baris
   driver-nya.
════════════════════════════════════════════════════════════ */

async function resolveDriverByEmail(email: string): Promise<Driver | null> {
  // Lewat RPC security definer (migrasi 010), bukan select langsung ke
  // tabel — aturan RLS di tabel drivers sempat menyaring hasil query
  // untuk sesi login driver (0 baris tanpa error), pola yang sama
  // dengan kenapa sistem PIN lama juga pakai RPC (verify_driver_pin).
  const { data, error } = await supabase.rpc("get_driver_by_email", {
    p_email: email,
  });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0] as Driver;
}

/** Sign in via Supabase Auth, then resolve the matching active driver
 *  row (drivers.email). If the account isn't linked to an active
 *  driver, the session is discarded and an error is thrown so the
 *  login screen can show a clear message. */
export async function driverSignIn(email: string, password: string): Promise<Driver> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) {
    // Distinguish "wrong password" from network/other failures so the
    // login screen doesn't blame the user's credentials when they're
    // simply offline.
    const m = (authError.message || "").toLowerCase();
    if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
      throw new Error("INVALID_CREDENTIALS");
    }
    throw new Error(authError.message || "INVALID_CREDENTIALS");
  }
  const authEmail = authData.user?.email || email;
  const driver = await resolveDriverByEmail(authEmail);
  if (!driver) {
    await supabase.auth.signOut();
    throw new Error("NOT_A_DRIVER");
  }
  return driver;
}

/** Restores the driver for an existing Supabase Auth session (app
 *  relaunch). Returns null when there's no session or the session's
 *  account isn't linked to an active driver. Network failures are
 *  RETHROWN (not returned as null) so periodic "still active?" checks
 *  can ignore them instead of force-logging-out an offline driver.
 *
 *  PENTING: this check is deliberately non-destructive — it never calls
 *  signOut(). The admin dashboard shares the same Supabase Auth session
 *  storage in a browser, so an admin who merely OPENS /driver must not
 *  get their dashboard session killed. Explicit sign-out only happens
 *  from driverSignIn (user actively logging in) or driverSignOut. */
export async function driverGetSession(): Promise<Driver | null> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email;
  if (!email) return null;
  return resolveDriverByEmail(email);
}

export async function driverSignOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Admin: membuat/mereset akun login driver + mengirimkan email berisi
 *  password sementara ke driver ybs. Seluruh logika (validasi staf,
 *  validasi driver aktif, generate password, kirim email) berjalan di
 *  Edge Function send-driver-credentials — kunci service role tidak
 *  pernah menyentuh browser. */
export async function sendDriverCredentials(
  driverEmail: string,
  lang: "id" | "en"
): Promise<{ ok: boolean; error?: string; tempPassword?: string; created?: boolean }> {
  const appUrl = typeof window !== "undefined" ? `${window.location.origin}/driver` : "";
  const { data, error } = await supabase.functions.invoke("send-driver-credentials", {
    body: { driverEmail, appUrl, lang },
  });
  if (error) {
    return { ok: false, error: error.message || "Gagal memanggil fungsi email." };
  }
  return (data ?? { ok: false, error: "Respons kosong dari server." }) as {
    ok: boolean;
    error?: string;
    tempPassword?: string;
    created?: boolean;
  };
}

/** Changes the logged-in driver's password (Supabase Auth). */
export async function changeDriverPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   TASKS — driver panel
════════════════════════════════════════════════════════════ */

export async function getDriverTasksToday(
  driverId: string
): Promise<TaskDetail[]> {
  const today = todayLocalISODate();
  const { data, error } = await supabase
    .from("tasks_detail")
    .select("*")
    .eq("driver_id", driverId)
    .eq("tanggal", today)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDriverHistory(
  driverId: string,
  dateFrom: string,
  dateTo: string
): Promise<TaskDetail[]> {
  const { data, error } = await supabase
    .from("tasks_detail")
    .select("*")
    .eq("driver_id", driverId)
    .gte("tanggal", dateFrom)
    .lte("tanggal", dateTo)
    .order("tanggal", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function acceptTask(
  taskId: string,
  driverId: string
): Promise<void> {
  const { error } = await supabase.rpc("accept_task", {
    p_task_id: taskId,
    p_driver_id: driverId,
  });
  if (error) throw error;
}

export async function completeTask(
  taskId: string,
  driverId: string
): Promise<void> {
  const { error } = await supabase.rpc("complete_task", {
    p_task_id: taskId,
    p_driver_id: driverId,
  });
  if (error) throw error;
}

export async function cancelTaskByDriver(
  taskId: string,
  driverId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc("cancel_task", {
    p_task_id: taskId,
    p_driver_id: driverId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   TASKS — dashboard admin
════════════════════════════════════════════════════════════ */

export async function getTasksByDate(
  dateFilter: string,
  plant?: Plant | null
): Promise<TaskDetail[]> {
  let q = supabase
    .from("tasks_detail")
    .select("*")
    .eq("tanggal", dateFilter)
    .order("created_at", { ascending: false });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getTasksByRange(
  dateFrom: string,
  dateTo: string,
  plant?: Plant | null
): Promise<TaskDetail[]> {
  let q = supabase
    .from("tasks_detail")
    .select("*")
    .gte("tanggal", dateFrom)
    .lte("tanggal", dateTo)
    .order("tanggal", { ascending: false });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export interface CreateTaskInput {
  tanggal: string;
  driver_id: string;
  vehicle_id: string;
  jenis_pekerjaan: string;
  tujuan: string;
  requestor: string;
  departement: string;
  perihal?: string;
  plant: Plant; 
  }

  
export async function createTask(input: CreateTaskInput): Promise<void> {
  const { error } = await supabase.from("tasks").insert({
    tanggal: input.tanggal,
    driver_id: input.driver_id,
    vehicle_id: input.vehicle_id,
    jenis_pekerjaan: input.jenis_pekerjaan,
    tujuan: input.tujuan,
    requestor: input.requestor,
    departement: input.departement,
    perihal: input.perihal || "",
    status: "ASSIGNED",
    plant: input.plant,
  });
  if (error) throw error;
}

export interface CreateTaskBatchInput {
  driverId: string;
  vehicleId: string;
  jenisPekerjaan: string;
  tujuan: string;
  requestor: string;
  departement: string;
  perihal: string;
  plant: Plant;
  dateFrom: string;
  dateTo: string;
}

export async function createTaskBatch(input: CreateTaskBatchInput): Promise<{ createdCount: number; batchId: string }> {
  const { data, error } = await supabase.rpc("create_task_batch", {
    p_driver_id: input.driverId,
    p_vehicle_id: input.vehicleId,
    p_jenis_pekerjaan: input.jenisPekerjaan,
    p_tujuan: input.tujuan,
    p_requestor: input.requestor,
    p_departement: input.departement,
    p_perihal: input.perihal,
    p_plant: input.plant,
    p_date_from: input.dateFrom,
    p_date_to: input.dateTo,
  });
  if (error) throw error;
  const row = data?.[0];
  return { createdCount: row?.created_count ?? 0, batchId: row?.batch_id ?? "" };
}

export async function sendTaskBatchEmail(input: {
  requestorEmail: string;
  requestor: string;
  driverName: string;
  driverPhone?: string;
  vehicleLabel: string;
  jenisPekerjaan: string;
  tujuan: string;
  departement: string;
  perihal?: string;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
}): Promise<void> {
  let managerEmails: string[] = [];
  try {
    const raw = await getAppSetting("manager_email");
    managerEmails = raw ? raw.split(",").map((e) => e.trim()).filter(Boolean) : [];
  } catch (e) {
    console.warn("Failed to read manager_email:", e instanceof Error ? e.message : e);
  }

  const basePayload = {
    requestor: input.requestor,
    driverName: input.driverName,
    driverPhone: input.driverPhone,
    vehicleLabel: input.vehicleLabel,
    jenisPekerjaan: input.jenisPekerjaan,
    tujuan: input.tujuan,
    departement: input.departement,
    perihal: input.perihal,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    dayCount: input.dayCount,
  };

  // Kirim ke requestor (template konfirmasi)
  if (input.requestorEmail) {
    supabase.functions.invoke("send-task-email", {
      body: { ...basePayload, recipientType: "requestor", toEmail: [input.requestorEmail] },
    }).catch((e) => console.warn("Task email to requestor failed:", e instanceof Error ? e.message : e));
  }

  // Kirim ke manager (template notifikasi) — selalu dikirim kalau ada manager
  if (managerEmails.length > 0) {
    supabase.functions.invoke("send-task-email", {
      body: { ...basePayload, recipientType: "manager", toEmail: managerEmails },
    }).catch((e) => console.warn("Task email to manager failed:", e instanceof Error ? e.message : e));
  }

  if (!input.requestorEmail && managerEmails.length === 0) {
    console.warn("sendTaskBatchEmail: tidak ada penerima — isi manager_email di Settings.");
  }
}

/** Kirim push notification OneSignal ke satu atau lebih driver.
 *  driverIds = array UUID dari tabel drivers (External User ID di OneSignal).
 *  Fire-and-forget — error diabaikan supaya tidak ganggu alur utama. */
export async function sendPushToDriver(
  driverIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    await supabase.functions.invoke("send-push-notification", {
      body: { driverIds, title, body, data: data ?? {} },
    });
  } catch (e) {
    console.warn("Push notification failed (non-critical):", e);
  }
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<void> {
  // Hanya dua transisi yang valid didorong dari sisi admin:
  // ASSIGNED -> ON GOING, dan ON GOING -> DONE.
  if (status !== "ON GOING" && status !== "DONE") {
    throw new Error(`Transisi status tidak didukung dari dashboard: ${status}`);
  }
  const { error } = await supabase.rpc("admin_update_task_status", {
    p_task_id: taskId,
    p_new_status: status,
  });
  if (error) throw error;
}


export async function cancelTaskByAdmin(
  taskId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc("admin_cancel_task", {
    p_task_id: taskId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}
export async function deleteTaskBatch(batchId: string): Promise<number> {
  const { data, error } = await supabase.rpc("delete_task_batch", { p_batch_id: batchId });
  if (error) throw error;
  return data ?? 0;
}

/* ════════════════════════════════════════════════════════════
   REALTIME SUBSCRIPTION
════════════════════════════════════════════════════════════ */

export function subscribeToTasks(onChange: () => void, onStatusChange?: (connected: boolean) => void) {
  const channel = supabase
    .channel("tasks-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      () => {
        onChange();
      }
    )
    .subscribe((status) => {
      onStatusChange?.(status === "SUBSCRIBED");
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — VEHICLES (management tab: sees ALL vehicles, not just
   active ones, unlike getVehicles() above which the task-assignment
   form uses). Granular per-row ops only — `vehicles` is shared with
   the task-assignment feature, so we never bulk overwrite it.
════════════════════════════════════════════════════════════ */

export async function getAllVehiclesFull(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("nopol", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type VehicleInput = Omit<Vehicle, "id">;

export async function addVehicle(input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVehicle(
  id: string,
  input: Partial<VehicleInput>
): Promise<void> {
  const { error } = await supabase.from("vehicles").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Penghapusan tidak diizinkan — akun Anda mungkin tidak memiliki hak akses admin untuk menghapus kendaraan."
    );
  }
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — CLAIMS
════════════════════════════════════════════════════════════ */

interface ClaimRow {
  id: string;
  driver_id: string;
  submission_date: string;
  period_date: string;
  items: ClaimItem[];
  total: number;
  status: string;
  note: string | null;
  submitted_at: string;
  plant: string;
  drivers: { nama: string; email: string | null } | null;
}

function mapClaimRow(row: ClaimRow): Claim {
  return {
    id: row.id,
    driver_id: row.driver_id,
    driverName: row.drivers?.nama ?? "",
    driverEmail: row.drivers?.email ?? "",
    submissionDate: row.submission_date,
    periodDate: row.period_date,
    items: Array.isArray(row.items) ? row.items : [],
    total: Number(row.total) || 0,
    status: row.status,
    note: row.note ?? "",
    submittedAt: row.submitted_at,
    plant: row.plant as Plant,
  };
}

/** Claims for a single driver — used by the driver app's Claim tab. */
/** Claims for a single driver — uses a security-definer RPC (migration 011)
 *  so RLS on the claims+drivers join cannot block the driver's own data,
 *  same pattern as get_driver_by_email (migration 010). */
export async function getClaimsByDriver(driverId: string): Promise<Claim[]> {
  const { data, error } = await supabase.rpc("get_claims_by_driver", {
    p_driver_id: driverId,
  });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  // RPC returns flat rows — map to Claim shape
  return (data as {
    id: string; driver_id: string; driver_name: string; driver_email: string;
    period_date: string; submission_date: string; items: ClaimItem[];
    total: number; status: string; note: string; submitted_at: string; plant: string;
  }[]).map((r) => ({
    id: r.id,
    driver_id: r.driver_id,
    driverName: r.driver_name,
    driverEmail: r.driver_email,
    periodDate: r.period_date,
    submissionDate: r.submission_date,
    items: Array.isArray(r.items) ? r.items : [],
    total: Number(r.total) || 0,
    status: r.status,
    note: r.note ?? "",
    submittedAt: r.submitted_at,
    plant: r.plant as Plant,
  }));
}

/** Realtime subscription: fires whenever a claim row changes for a
 *  specific driver. Used by the driver app to push a notification when
 *  the admin submits a new claim on their behalf. */
export function subscribeToDriverClaims(driverId: string, onChange: () => void) {
  const channel = supabase
    .channel(`driver-claims-${driverId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "claims", filter: `driver_id=eq.${driverId}` },
      () => { onChange(); }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function getClaims(plant?: Plant | null): Promise<Claim[]> {
  let q = supabase
    .from("claims")
    .select(`
      id, driver_id, period_date, submission_date, items, total, status, note, submitted_at, plant,
      drivers ( nama, email )
    `)
    .order("submission_date", { ascending: false });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as ClaimRow[] ?? []).map(mapClaimRow);
}

export interface AddClaimInput {
  driver_id: string;
  submissionDate: string;
  periodDate: string;
  items: ClaimItem[];
  total: number;
  note?: string;
}

export async function addClaim(input: AddClaimInput): Promise<void> {
  const { error } = await supabase.from("claims").insert({
    driver_id: input.driver_id,
    submission_date: input.submissionDate,
    period_date: input.periodDate,
    items: input.items,
    total: input.total,
    note: input.note || "",
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteClaim(id: string): Promise<void> {
  const { error } = await supabase.from("claims").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   KARANGAN BUNGA DUKA CITA (Condolence Wreaths)
════════════════════════════════════════════════════════════ */

interface WreathRow {
  id: string;
  plant: Plant;
  tanggal: string;
  atas_nama: string;
  keterangan: string | null;
  claimed: boolean;
  created_at: string;
}

function mapWreathRow(r: WreathRow): Wreath {
  return {
    id: r.id,
    plant: r.plant,
    tanggal: r.tanggal,
    atasNama: r.atas_nama,
    keterangan: r.keterangan ?? "",
    claimed: r.claimed,
    createdAt: r.created_at,
  };
}

export async function getWreaths(plant?: Plant | null): Promise<Wreath[]> {
  let q = supabase.from("condolence_wreaths").select("*").order("tanggal", { ascending: false });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return (data as WreathRow[] ?? []).map(mapWreathRow);
}

export interface AddWreathInput {
  plant: Plant;
  tanggal: string;
  atasNama: string;
  keterangan?: string;
  claimed?: boolean;
}

export async function addWreath(input: AddWreathInput): Promise<void> {
  const { error } = await supabase.from("condolence_wreaths").insert({
    plant: input.plant,
    tanggal: input.tanggal,
    atas_nama: input.atasNama,
    keterangan: input.keterangan || "",
    claimed: input.claimed ?? false,
  });
  if (error) throw error;
}

export async function setWreathClaimed(id: string, claimed: boolean): Promise<void> {
  const { error } = await supabase.from("condolence_wreaths").update({ claimed }).eq("id", id);
  if (error) throw error;
}

export async function deleteWreath(id: string): Promise<void> {
  const { error } = await supabase.from("condolence_wreaths").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   VEHICLE GATE LOG — pencatatan keluar/masuk kendaraan di security
   gate. Halaman publik (/gate) TIDAK PERNAH menyentuh tabel
   langsung — semuanya lewat RPC security definer, sama seperti pola
   locker yang sudah terbukti aman. Cuma dashboard (authenticated)
   yang boleh baca tabel vehicle_gate_logs langsung.
════════════════════════════════════════════════════════════ */

/** Daftar kendaraan aktif untuk dropdown di form input operator. */
export async function getActiveVehiclesForGate(): Promise<GateVehicleOption[]> {
  const { data, error } = await supabase.rpc("get_active_vehicles_for_gate");
  if (error) throw error;
  return (data ?? []) as GateVehicleOption[];
}

/** Daftar driver aktif untuk dropdown di form input operator. */
export async function getActiveDriversForGate(): Promise<GateDriverOption[]> {
  const { data, error } = await supabase.rpc("get_active_drivers_for_gate");
  if (error) throw error;
  return (data ?? []) as GateDriverOption[];
}

interface GatePublicLogApiRow {
  log_id: string;
  vehicle_id: string;
  nopol: string;
  jenis: string | null;
  color: string | null;
  plant: Plant;
  driver_name: string;
  tujuan: string | null;
  time_out: string | null;
  time_in: string | null;
  status: "OUT" | "IN" | "DONE";
  created_at: string;
}

/** List entri gate untuk tanggal tertentu — dasar dari tampilan
 *  halaman publik /gate (form di atas, list ini di bawahnya). */
export async function getGateLogsPublic(date?: string): Promise<VehicleGateLog[]> {
  const { data, error } = await supabase.rpc("get_gate_logs_public", { p_date: date ?? null });
  if (error) throw error;
  return (data as GatePublicLogApiRow[] ?? []).map((r) => ({
    id: r.log_id,
    vehicleId: r.vehicle_id,
    nopol: r.nopol,
    jenis: r.jenis ?? "-",
    color: r.color ?? "",
    driverId: null,
    driverNameManual: null,
    driverName: r.driver_name,
    plant: r.plant,
    tujuan: r.tujuan ?? "",
    timeOut: r.time_out,
    timeIn: r.time_in,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Buka catatan baru dari form operator (tanggal, driver, kendaraan, tujuan). */
export async function openGateCheckpoint(input: {
  vehicleId: string;
  driverId?: string | null;
  driverNameManual?: string | null;
  tujuan: string;
  timestamp?: string; // ISO — kalau tidak diisi, RPC pakai now()
}): Promise<void> {
  const { error } = await supabase.rpc("open_gate_checkpoint", {
    p_vehicle_id: input.vehicleId,
    p_driver_id: input.driverId || null,
    p_driver_name_manual: input.driverNameManual || null,
    p_tujuan: input.tujuan || "",
    p_timestamp: input.timestamp ?? new Date().toISOString(),
  });
  if (error) throw error;
}

/** Tutup catatan (tombol kontrol di list) — satu klik, tidak butuh input. */
export async function closeGateCheckpoint(vehicleId: string): Promise<void> {
  const { error } = await supabase.rpc("close_gate_checkpoint", { p_vehicle_id: vehicleId });
  if (error) throw error;
}

interface GateLogRow {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  driver_name_manual: string | null;
  plant: Plant;
  tujuan: string | null;
  time_out: string | null;
  time_in: string | null;
  status: "OUT" | "IN" | "DONE";
  created_at: string;
  vehicles?: { nopol: string; jenis: string | null; color: string | null } | null;
  drivers?: { nama: string } | null;
}

function mapGateLogRow(r: GateLogRow): VehicleGateLog {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    nopol: r.vehicles?.nopol ?? "-",
    jenis: r.vehicles?.jenis ?? "-",
    color: r.vehicles?.color ?? "",
    driverId: r.driver_id,
    driverNameManual: r.driver_name_manual,
    driverName: r.driver_name_manual || r.drivers?.nama || "-",
    plant: r.plant,
    tujuan: r.tujuan ?? "",
    timeOut: r.time_out,
    timeIn: r.time_in,
    status: r.status,
    createdAt: r.created_at,
  };
}

/** Untuk Dashboard (Tab Vehicle → Gate Log) — authenticated only. */
export async function getVehicleGateLogs(params?: {
  plant?: Plant | null;
  dateFrom?: string;
  dateTo?: string;
}): Promise<VehicleGateLog[]> {
  let q = supabase
    .from("vehicle_gate_logs")
    .select("*, vehicles(nopol, jenis, color), drivers(nama)")
    .order("created_at", { ascending: false });
  if (params?.plant) q = q.eq("plant", params.plant);
  if (params?.dateFrom) q = q.gte("created_at", params.dateFrom);
  if (params?.dateTo) q = q.lte("created_at", params.dateTo + "T23:59:59");
  const { data, error } = await q;
  if (error) throw error;
  return (data as GateLogRow[] ?? []).map(mapGateLogRow);
}

/** Hapus 1 baris gate log — khusus Dashboard Admin (staf login),
 *  tidak pernah dipanggil dari halaman publik /gate. */
export async function deleteGateLog(logId: string): Promise<void> {
  const { error } = await supabase.from("vehicle_gate_logs").delete().eq("id", logId);
  if (error) throw error;
}

/** Tutup manual gate log yang kelupaan/kesangkut di status aktif —
 *  khusus Dashboard Admin, untuk koreksi data (mis. satpam lupa klik
 *  tombol kembali). Mengisi kolom waktu yang masih kosong dengan
 *  waktu sekarang dan menandai status selesai. */
export async function forceCloseGateLog(log: VehicleGateLog): Promise<void> {
  const now = new Date().toISOString();
  const updates: { status: "DONE"; time_out?: string; time_in?: string } = { status: "DONE" };
  if (!log.timeOut) updates.time_out = now;
  if (!log.timeIn) updates.time_in = now;
  const { error } = await supabase.from("vehicle_gate_logs").update(updates).eq("id", log.id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   PRINTER MANAGEMENT — daftar printer (berwarna/hitam-putih) +
   permintaan karyawan (reset kuota, tambah kuota, ambil toner).
   Murni fitur admin, tidak ada jalur publik sama sekali.
════════════════════════════════════════════════════════════ */

interface PrinterRow {
  id: string;
  no_eq: string;
  location: string;
  type: "COLOR" | "BW";
  control_panel_url: string | null;
  brand: string | null;
  aktif: boolean;
  created_at: string;
}

function mapPrinterRow(r: PrinterRow): Printer {
  return {
    id: r.id,
    noEq: r.no_eq,
    location: r.location,
    type: r.type,
    controlPanelUrl: r.control_panel_url ?? "",
    brand: r.brand ?? "",
    aktif: r.aktif,
    createdAt: r.created_at,
  };
}

export async function getPrinters(): Promise<Printer[]> {
  const { data, error } = await supabase.from("printers").select("*").order("no_eq");
  if (error) throw error;
  return (data as PrinterRow[] ?? []).map(mapPrinterRow);
}

export interface PrinterInput {
  noEq: string;
  location: string;
  type: "COLOR" | "BW";
  controlPanelUrl: string;
  brand: string;
  aktif: boolean;
}

export async function addPrinter(input: PrinterInput): Promise<void> {
  const { error } = await supabase.from("printers").insert({
    no_eq: input.noEq,
    location: input.location,
    type: input.type,
    control_panel_url: input.controlPanelUrl || null,
    brand: input.brand || null,
    aktif: input.aktif,
  });
  if (error) throw error;
}

export async function updatePrinter(id: string, input: PrinterInput): Promise<void> {
  const { error } = await supabase.from("printers").update({
    no_eq: input.noEq,
    location: input.location,
    type: input.type,
    control_panel_url: input.controlPanelUrl || null,
    brand: input.brand || null,
    aktif: input.aktif,
  }).eq("id", id);
  if (error) throw error;
}

export async function deletePrinter(id: string): Promise<void> {
  const { error } = await supabase.from("printers").delete().eq("id", id);
  if (error) throw error;
}

interface PrinterRequestRow {
  id: string;
  printer_id: string | null;
  print_user_id: string | null;
  source: PrinterRequestSource;
  request_type: PrinterRequestType;
  employee_name: string;
  department: string | null;
  quota_amount: number | null;
  notes: string | null;
  created_at: string;
  printers?: { no_eq: string; location: string } | null;
}

function mapPrinterRequestRow(r: PrinterRequestRow): PrinterRequest {
  return {
    id: r.id,
    printerId: r.printer_id,
    printerNoEq: r.printers?.no_eq ?? "-",
    printerLocation: r.printers?.location ?? "-",
    printUserId: r.print_user_id ?? "",
    source: r.source,
    requestType: r.request_type,
    employeeName: r.employee_name,
    department: r.department ?? "",
    quotaAmount: r.quota_amount,
    notes: r.notes ?? "",
    createdAt: r.created_at,
  };
}

export async function getPrinterRequests(params?: { dateFrom?: string; dateTo?: string }): Promise<PrinterRequest[]> {
  let q = supabase
    .from("printer_requests")
    .select("*, printers(no_eq, location)")
    .order("created_at", { ascending: false });
  if (params?.dateFrom) q = q.gte("created_at", params.dateFrom);
  if (params?.dateTo) q = q.lte("created_at", params.dateTo + "T23:59:59");
  const { data, error } = await q;
  if (error) throw error;
  return (data as PrinterRequestRow[] ?? []).map(mapPrinterRequestRow);
}

export interface AddPrinterRequestInput {
  printerId: string;
  requestType: PrinterRequestType;
  employeeName: string;
  department: string;
  quotaAmount: number | null;
  notes: string;
}

/** Dipanggil dari Dashboard Admin (Tab Printer) — admin input manual
 *  atas nama karyawan, terkait 1 unit printer fisik tertentu. */
export async function addPrinterRequest(input: AddPrinterRequestInput): Promise<void> {
  const { error } = await supabase.from("printer_requests").insert({
    printer_id: input.printerId,
    source: "ADMIN",
    request_type: input.requestType,
    employee_name: input.employeeName,
    department: input.department || null,
    quota_amount: input.quotaAmount,
    notes: input.notes || "",
  });
  if (error) throw error;
}

/** Daftar Area/Lokasi printer untuk form publik /request — dipakai
 *  di form "Reset Kuota" (pilih area, bukan User ID Print). */
export async function getPrinterLocationsPublic(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_printer_locations_public");
  if (error) throw error;
  return (data ?? []).map((r: { location: string }) => r.location);
}

export interface SubmitPrinterRequestPublicInput {
  requestType: "RESET_KUOTA" | "TAMBAH_KUOTA";
  employeeName: string;
  department: string;
  printUserId?: string;   // dipakai untuk TAMBAH_KUOTA
  locations?: string[];   // dipakai untuk RESET_KUOTA — bisa lebih dari 1 area
  notes: string;
}

/** Dipanggil dari form publik /request — TIDAK butuh login.
 *  - TAMBAH_KUOTA: karyawan input User ID Print (akun cetak personal).
 *  - RESET_KUOTA: karyawan pilih 1 atau lebih Area/Lokasi (dari data
 *    printer yang sudah ada) — tiap area jadi 1 baris permintaan
 *    terpisah, supaya admin bisa proses per-area satu-satu.
 *  Semua masuk ke tabel yang SAMA dengan yang dibaca admin di Tab
 *  Printer, jadi otomatis sinkron tanpa proses tambahan. */
export async function submitPrinterRequestPublic(input: SubmitPrinterRequestPublicInput): Promise<{ id: string; createdAt: string }> {
  // ID & waktu dibuat di sisi client, BUKAN dibaca-balik dari server —
  // membaca balik lewat .select() butuh izin SELECT, yang sengaja
  // dikunci authenticated-only untuk tabel ini. Kalau tetap pakai
  // .select(), submission dari pengguna anonim (bukan admin yang
  // sedang login) akan gagal di langkah baca-balik meskipun data
  // sudah berhasil masuk — persis bug yang bikin cuma jalan di
  // komputer admin.
  const createdAt = new Date().toISOString();

  if (input.requestType === "RESET_KUOTA") {
    const areas = (input.locations ?? []).filter((a) => a.trim() !== "");
    if (areas.length === 0) throw new Error("Pilih minimal 1 area.");
    const firstId = crypto.randomUUID();
    const rows = areas.map((area, i) => ({
      id: i === 0 ? firstId : crypto.randomUUID(),
      printer_id: null,
      print_user_id: area, // menyimpan nama Area/Lokasi untuk permintaan Reset
      source: "EMPLOYEE",
      request_type: "RESET_KUOTA",
      employee_name: input.employeeName,
      department: input.department || null,
      quota_amount: null,
      notes: input.notes || "",
      created_at: createdAt,
    }));
    const { error } = await supabase.from("printer_requests").insert(rows);
    if (error) throw error;
    return { id: firstId, createdAt };
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from("printer_requests").insert({
    id,
    printer_id: null,
    print_user_id: input.printUserId ?? "",
    source: "EMPLOYEE",
    request_type: input.requestType,
    employee_name: input.employeeName,
    department: input.department || null,
    quota_amount: null,
    notes: input.notes || "",
    created_at: createdAt,
  });
  if (error) throw error;
  return { id, createdAt };
}

export async function deletePrinterRequest(id: string): Promise<void> {
  const { error } = await supabase.from("printer_requests").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   EMPLOYEE REQUESTS — form publik (request driver, lainnya) yang
   masuk ke Dashboard untuk langsung dieksekusi admin. Permintaan
   terkait printer TIDAK lewat sini — lihat submitPrinterRequestPublic
   di atas, yang menulis langsung ke printer_requests supaya sinkron
   dengan log admin.
════════════════════════════════════════════════════════════ */

interface EmployeeRequestRow {
  id: string;
  request_type: EmployeeRequestType;
  employee_name: string;
  department: string | null;
  phone: string | null;
  description: string;
  details: Partial<DriverRequestDetails> | null;
  status: EmployeeRequestStatus;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
}

function mapEmployeeRequestRow(r: EmployeeRequestRow): EmployeeRequest {
  return {
    id: r.id,
    requestType: r.request_type,
    employeeName: r.employee_name,
    department: r.department ?? "",
    phone: r.phone ?? "",
    description: r.description,
    details: r.details ?? {},
    status: r.status,
    adminNotes: r.admin_notes ?? "",
    createdAt: r.created_at,
    processedAt: r.processed_at,
  };
}

/** Dipanggil dari form publik /request — tidak butuh login. */
export async function submitEmployeeRequest(input: {
  requestType: EmployeeRequestType;
  employeeName: string;
  department: string;
  phone: string;
  description: string;
  details?: Partial<DriverRequestDetails>;
}): Promise<{ id: string; createdAt: string }> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { error } = await supabase.from("employee_requests").insert({
    id,
    request_type: input.requestType,
    employee_name: input.employeeName,
    department: input.department || null,
    phone: input.phone || null,
    description: input.description,
    details: input.details ?? {},
    created_at: createdAt,
  });
  if (error) throw error;
  return { id, createdAt };
}

/** Untuk Dashboard (authenticated) — daftar semua permintaan. */
export async function getEmployeeRequests(): Promise<EmployeeRequest[]> {
  const { data, error } = await supabase.from("employee_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as EmployeeRequestRow[] ?? []).map(mapEmployeeRequestRow);
}

export async function updateEmployeeRequestStatus(id: string, status: EmployeeRequestStatus, adminNotes?: string): Promise<void> {
  const updates: { status: EmployeeRequestStatus; admin_notes?: string; processed_at?: string } = { status };
  if (adminNotes !== undefined) updates.admin_notes = adminNotes;
  if (status === "DONE" || status === "REJECTED") updates.processed_at = new Date().toISOString();
  const { error } = await supabase.from("employee_requests").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteEmployeeRequest(id: string): Promise<void> {
  const { error } = await supabase.from("employee_requests").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   ATK (ALAT TULIS KANTOR) — data disinkronkan dari Excel/VBA lewat
   tombol "Sinkron ke CIKOPS" (lihat vba/modSyncCikops.bas). CIKOPS
   murni untuk LAPORAN — tidak ada insert/update/delete dari sisi
   Dashboard, semua input tetap dilakukan di Excel.
════════════════════════════════════════════════════════════ */

interface AtkItemRow {
  id: string; kode_barang: string; nama_barang: string; satuan: string | null; stok: number; updated_at: string;
}
function mapAtkItemRow(r: AtkItemRow): AtkItem {
  return { id: r.id, kodeBarang: r.kode_barang, namaBarang: r.nama_barang, satuan: r.satuan ?? "", stok: r.stok, updatedAt: r.updated_at };
}
export async function getAtkItems(): Promise<AtkItem[]> {
  const { data, error } = await supabase.from("atk_items").select("*").order("nama_barang");
  if (error) throw error;
  return (data as AtkItemRow[] ?? []).map(mapAtkItemRow);
}

interface AtkRequestRow {
  id: string; request_id: string; tanggal: string; nama: string; nik: string | null; departemen: string | null;
  kode_barang: string; nama_barang: string; jumlah: number; satuan: string | null; helper: string | null; created_at: string;
}
function mapAtkRequestRow(r: AtkRequestRow): AtkRequest {
  return {
    id: r.id, requestId: r.request_id, tanggal: r.tanggal, nama: r.nama, nik: r.nik ?? "", departemen: r.departemen ?? "",
    kodeBarang: r.kode_barang, namaBarang: r.nama_barang, jumlah: r.jumlah, satuan: r.satuan ?? "", helper: r.helper ?? "", createdAt: r.created_at,
  };
}
export async function getAtkRequests(params?: { dateFrom?: string; dateTo?: string }): Promise<AtkRequest[]> {
  let q = supabase.from("atk_requests").select("*").order("tanggal", { ascending: false });
  if (params?.dateFrom) q = q.gte("tanggal", params.dateFrom);
  if (params?.dateTo) q = q.lte("tanggal", params.dateTo);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AtkRequestRow[] ?? []).map(mapAtkRequestRow);
}

interface AtkRestockRow {
  id: string; update_id: string; tanggal: string; nama: string | null; nik: string | null; departemen: string | null;
  kode_barang: string; nama_barang: string; jumlah: number; satuan: string | null; created_at: string;
}
function mapAtkRestockRow(r: AtkRestockRow): AtkRestock {
  return {
    id: r.id, updateId: r.update_id, tanggal: r.tanggal, nama: r.nama ?? "", nik: r.nik ?? "", departemen: r.departemen ?? "",
    kodeBarang: r.kode_barang, namaBarang: r.nama_barang, jumlah: r.jumlah, satuan: r.satuan ?? "", createdAt: r.created_at,
  };
}
export async function getAtkRestocks(params?: { dateFrom?: string; dateTo?: string }): Promise<AtkRestock[]> {
  let q = supabase.from("atk_restocks").select("*").order("tanggal", { ascending: false });
  if (params?.dateFrom) q = q.gte("tanggal", params.dateFrom);
  if (params?.dateTo) q = q.lte("tanggal", params.dateTo);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AtkRestockRow[] ?? []).map(mapAtkRestockRow);
}

/* ════════════════════════════════════════════════════════════
   AGENDA & PENGUMUMAN — widget Dashboard (Kalender, Agenda
   Mendatang, Pengumuman).
════════════════════════════════════════════════════════════ */

interface AgendaEventRow {
  id: string; title: string; location: string | null; event_date: string; event_time: string | null; color: string | null; created_by: string | null; created_at: string;
}
function mapAgendaEventRow(r: AgendaEventRow): AgendaEvent {
  return { id: r.id, title: r.title, location: r.location ?? "", eventDate: r.event_date, eventTime: r.event_time ?? "", color: r.color ?? "blue", createdBy: r.created_by ?? "", createdAt: r.created_at };
}
export async function getAgendaEvents(params?: { from?: string; to?: string }): Promise<AgendaEvent[]> {
  let q = supabase.from("agenda_events").select("*").order("event_date", { ascending: true }).order("event_time", { ascending: true });
  if (params?.from) q = q.gte("event_date", params.from);
  if (params?.to) q = q.lte("event_date", params.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AgendaEventRow[] ?? []).map(mapAgendaEventRow);
}
export async function addAgendaEvent(input: { title: string; location?: string; eventDate: string; eventTime?: string; color?: string; createdBy?: string }): Promise<void> {
  const { error } = await supabase.from("agenda_events").insert({
    title: input.title, location: input.location || "", event_date: input.eventDate, event_time: input.eventTime || "", color: input.color || "blue", created_by: input.createdBy || "",
  });
  if (error) throw error;
}
export async function deleteAgendaEvent(id: string): Promise<void> {
  const { error } = await supabase.from("agenda_events").delete().eq("id", id);
  if (error) throw error;
}

interface AnnouncementRow {
  id: string; title: string; body: string; is_active: boolean; created_by: string | null; created_at: string;
}
function mapAnnouncementRow(r: AnnouncementRow): Announcement {
  return { id: r.id, title: r.title, body: r.body, isActive: r.is_active, createdBy: r.created_by ?? "", createdAt: r.created_at };
}
export async function getAnnouncements(activeOnly = true): Promise<Announcement[]> {
  let q = supabase.from("announcements").select("*").order("created_at", { ascending: false });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AnnouncementRow[] ?? []).map(mapAnnouncementRow);
}
export async function addAnnouncement(input: { title: string; body: string; createdBy?: string }): Promise<void> {
  const { error } = await supabase.from("announcements").insert({ title: input.title, body: input.body, created_by: input.createdBy || "" });
  if (error) throw error;
}
export async function setAnnouncementActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("announcements").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — OVERTIME (Lembur, CIK vs PRB)
════════════════════════════════════════════════════════════ */

interface OvertimeRow {
  id: string;
  driver_id: string;
  period: string;
  plant: Plant;
  hours: number;
  amount: number;
  reason: string | null;
  created_at: string;
  drivers: { nama: string } | null;
}

function mapOvertimeRow(row: OvertimeRow): Overtime {
  const [y, m] = (row.period || "").split("-").map(Number);
  const now = new Date();
  return {
    id: row.id,
    driver_id: row.driver_id,
    driverName: row.drivers?.nama ?? "",
    period: row.period,
    periodYear: y || now.getFullYear(),
    periodMonth: m ? m - 1 : now.getMonth(),
    plant: row.plant,
    hours: Number(row.hours) || 0,
    amount: Number(row.amount) || 0,
    reason: row.reason ?? "",
    createdAt: row.created_at,
  };
}

export async function getOvertimes(plant?: Plant | null): Promise<Overtime[]> {
  let q = supabase
    .from("overtime")
    .select("*, drivers(nama)")
    .order("period", { ascending: false });
  if (plant) q = q.eq("plant", plant);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as OvertimeRow[] ?? []).map(mapOvertimeRow);
}

export interface AddOvertimeInput {
  driver_id: string;
  period: string;
  plant: Plant;
  hours: number;
  amount: number;
  reason?: string;
}

export async function addOvertime(input: AddOvertimeInput): Promise<void> {
  const { error } = await supabase.from("overtime").insert({
    driver_id: input.driver_id,
    period: input.period,
    plant: input.plant,
    hours: input.hours,
    amount: input.amount,
    reason: input.reason || "",
  });
  if (error) throw error;
}

export async function updateOvertime(
  id: string,
  input: Partial<AddOvertimeInput>
): Promise<void> {
  const { error } = await supabase.from("overtime").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteOvertime(id: string): Promise<void> {
  const { error } = await supabase.from("overtime").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — DRIVER TIERS (Driver Budget)
   `activeDriverCount` is derived (driver_tier_summary view) — never
   written back, only read.
════════════════════════════════════════════════════════════ */

interface DriverTierRow {
  id: string;
  name: string;
  color: string;
  amount_per_month: number;
  active_driver_count: number;
}

export async function getDriverTiers(): Promise<DriverTier[]> {
  const { data, error } = await supabase
    .from("driver_tier_summary")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as DriverTierRow[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    amountPerMonth: Number(r.amount_per_month) || 0,
    activeDriverCount: Number(r.active_driver_count) || 0,
  }));
}

export interface SaveDriverTierInput {
  name: string;
  color: string;
  amountPerMonth: number;
}

export async function addDriverTier(input: SaveDriverTierInput): Promise<void> {
  const { error } = await supabase.from("driver_tiers").insert({
    name: input.name,
    color: input.color,
    amount_per_month: input.amountPerMonth,
  });
  if (error) throw error;
}

export async function updateDriverTier(
  id: string,
  input: SaveDriverTierInput
): Promise<void> {
  const { error } = await supabase
    .from("driver_tiers")
    .update({
      name: input.name,
      color: input.color,
      amount_per_month: input.amountPerMonth,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDriverTier(id: string): Promise<void> {
  const { error } = await supabase.from("driver_tiers").delete().eq("id", id);
  if (error) throw error;
}

/** Assign (or clear, with tierId=null) a tier for one driver — the piece
 *  of UI the original FleetOS sheet version never had (it only tracked
 *  a manual headcount, not real per-driver assignment). */
export async function setDriverTier(
  driverId: string,
  tierId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("drivers")
    .update({ tier_id: tierId })
    .eq("id", driverId);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — DANA OPERASIONAL (Kantong), period-keyed
════════════════════════════════════════════════════════════ */

interface KantongRow {
  id: string;
  period: string;
  plant: Plant;
  total_budget: number;
  alloc_op_driver: number;
  alloc_emergency: number;
  cash_available: number;
  claim_submitted: number;
claim_paid: number;
  unsubmitted_claim: number;
  last_reset: string;
}

function mapKantongRow(row: KantongRow): Kantong {
  return {
    id: row.id,
    period: row.period,
    plant: row.plant,
    unsubmittedClaim: Number(row.unsubmitted_claim) || 0,
    totalBudget: Number(row.total_budget) || 0,
    allocOpDriver: Number(row.alloc_op_driver) || 0,
    allocEmergency: Number(row.alloc_emergency) || 0,
    cashAvailable: Number(row.cash_available) || 0,
    claimSubmitted: Number(row.claim_submitted) || 0,
    claimPaid: Number(row.claim_paid) || 0,
    lastReset: row.last_reset,
  };
}

export async function getCurrentKantong(plant: Plant): Promise<Kantong | null> {
  const { data, error } = await supabase.rpc("get_current_kantong", { p_plant: plant });
  if (error) throw error;
  const row = data?.[0];
  return row ? mapKantongRow(row as KantongRow) : null;
}

export interface KantongInput {
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

export async function updateKantongBudget(input: KantongInput): Promise<void> {
  const { error } = await supabase
    .from("kantong")
    .update({
      total_budget: input.totalBudget,
      alloc_op_driver: input.allocOpDriver,
      alloc_emergency: input.allocEmergency,
      cash_available: input.cashAvailable,
      claim_submitted: input.claimSubmitted,
      claim_paid: input.claimPaid,
      unsubmitted_claim: input.unsubmittedClaim,
      last_reset: input.lastReset,
    })
    .eq("period", input.period)
    .eq("plant", input.plant);
  if (error) throw error;
}

/** Creates the very first Dana Operasional row for the current period —
 *  needed because the table starts completely empty (the migration only
 *  creates the table, it doesn't seed a row), so there was previously no
 *  way to get past "no data yet" in the UI. */
export async function createKantong(input: {
  period: string;
  plant: Plant;
  totalBudget: number;
  allocOpDriver: number;
  allocEmergency: number;
  cashAvailable: number;
}): Promise<void> {
  const { error } = await supabase.from("kantong").insert({
    period: input.period,
    plant: input.plant,
    total_budget: input.totalBudget,
    alloc_op_driver: input.allocOpDriver,
    alloc_emergency: input.allocEmergency,
    cash_available: input.cashAvailable,
    claim_submitted: 0,
    claim_paid: 0,
    unsubmitted_claim: 0,
    last_reset: todayLocalISODate(),
  });
  if (error) throw error;
}

/** Starts a fresh period row, carrying budget/allocations/cash/unsubmitted
 *  claims forward and zeroing claimSubmitted/claimPaid — preserves history
 *  unlike the old single mutable sheet row. unsubmittedClaim carries over
 *  because an unsubmitted claim is still a pending liability regardless of
 *  which period it's viewed from — it doesn't disappear at rollover the
 *  way that period's processed claim activity does. */
export async function resetKantong(
  plant: Plant,
  newPeriod: string,
  lastReset: string
): Promise<void> {
  const current = await getCurrentKantong(plant);
  const { error } = await supabase.from("kantong").upsert(
    {
      period: newPeriod,
      plant,
      total_budget: current?.totalBudget ?? 0,
      alloc_op_driver: current?.allocOpDriver ?? 0,
      alloc_emergency: current?.allocEmergency ?? 0,
      cash_available: current?.cashAvailable ?? 0,
      claim_submitted: 0,
      claim_paid: 0,
      unsubmitted_claim: current?.unsubmittedClaim ?? 0,
      last_reset: lastReset,
    },
   { onConflict: "period,plant" }
  );
  if (error) throw error;
}
/** Ambil histori Dana Operasional beberapa periode terakhir (untuk grafik
 *  tren gap) — beda dari getCurrentKantong() yang cuma ambil 1 baris
 *  terbaru lewat view current_kantong. */
export async function getKantongHistory(plant: Plant, limit = 12): Promise<Kantong[]> {
  // Ambil dulu N periode TERBARU (descending + limit), baru dibalik ke urutan
  // kronologis (ascending) supaya grafik tren tetap terbaca kiri->kanan.
  // NB: order("period", { ascending: true }) + limit() SALAH di sini karena
  // itu akan mengambil N periode TERTUA, bukan yang terbaru.
  const { data, error } = await supabase
    .from("kantong")
    .select("*")
    .eq("plant", plant)
    .order("period", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as KantongRow[]) ?? []).map(mapKantongRow).reverse();
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — GAS STATIONS (Pom Bensin)
════════════════════════════════════════════════════════════ */

interface GasStationRow {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  fuels: FuelEntry[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapGasStationRow(row: GasStationRow): GasStation {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    fuels: Array.isArray(row.fuels) ? row.fuels : [],
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGasStations(): Promise<GasStation[]> {
  const { data, error } = await supabase
    .from("gas_stations")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as GasStationRow[]) ?? []).map(mapGasStationRow);
}

export interface GasStationInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
  fuels: FuelEntry[];
  notes: string;
}

export async function addGasStation(input: GasStationInput): Promise<void> {
  const { error } = await supabase.from("gas_stations").insert({
    name: input.name,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    fuels: input.fuels,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateGasStation(
  id: string,
  input: GasStationInput
): Promise<void> {
  const { error } = await supabase
    .from("gas_stations")
    .update({
      name: input.name,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      fuels: input.fuels,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGasStation(id: string): Promise<void> {
  const { error } = await supabase.from("gas_stations").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   MY PROFILE — for the sidebar topbar's avatar/name/role display.
   Returns null on any error (missing row, RLS, etc.) so the UI can
   fall back to showing just the auth email instead of breaking.
════════════════════════════════════════════════════════════ */
export interface MyProfile {
  fullName: string | null;
  role: string;
  plantScope: Plant | null;
  accessScope: "full" | "tasks_only";
  allowedTabs: string[] | null;
  isMasterAdmin: boolean;
}
export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, role, plant_scope, access_scope, allowed_tabs, is_master_admin")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      fullName: data.full_name,
      role: data.role,
      plantScope: (data.plant_scope as Plant | null) ?? null,
      accessScope: (data.access_scope as "full" | "tasks_only") ?? "full",
    allowedTabs: (data.allowed_tabs as string[] | null) ?? null,
      isMasterAdmin: Boolean(data.is_master_admin),
    };
  } catch {
    return null;
  }
}

/** Helper — dipakai di sidebar & tempat lain buat cek apakah profil ini
 *  boleh lihat tab tertentu. `allowedTabs === null` artinya akses penuh. */
export function canAccessTab(profile: MyProfile | null, tab: string): boolean {
  if (!profile) return true;
  if (tab === "activitylog") return profile.isMasterAdmin === true;
  return profile.allowedTabs === null || profile.allowedTabs.includes(tab);
}

export interface ActivityLogEntry {
  id: string;
  actorName: string;
  actorRole: string;
  actorPlant: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  tableName: string;
  recordId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

export async function getActivityLog(filters?: { tableName?: string; days?: number }): Promise<ActivityLogEntry[]> {
  let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(500);
  if (filters?.tableName) query = query.eq("table_name", filters.tableName);
  if (filters?.days) {
    const since = new Date();
    since.setDate(since.getDate() - filters.days);
    query = query.gte("created_at", since.toISOString());
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    actorPlant: r.actor_plant,
    action: r.action,
    tableName: r.table_name,
    recordId: r.record_id,
    oldData: r.old_data,
    newData: r.new_data,
    createdAt: r.created_at,
  }));
}
/* ════════════════════════════════════════════════════════════
   MASTER DATA — Drivers, Employees, Job Types.
   Unlike getDrivers()/getEmployees()/getJobTypes() above (which filter
   to only what the Task-assignment dropdowns need), these return
   everything for a management/admin view, plus full CRUD.
════════════════════════════════════════════════════════════ */

export async function getAllDriversFull(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, nama, no_hp, avatar_emoji, aktif, tier_id, email, plant")
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export interface DriverInput {
  nama: string;
  no_hp: string | null;
  email: string | null;
  avatar_emoji: string | null;
  aktif: boolean;
  plant?: Plant;
}

export async function addDriver(input: DriverInput, initialPin?: string): Promise<Driver> {
  const { data, error } = await supabase.from("drivers").insert(input).select().single();
  if (error) throw error;
  if (initialPin) {
    await supabase.rpc("admin_set_driver_pin", { p_driver_id: data.id, p_new_pin: initialPin });
  }
  return data;
}

export async function updateDriver(id: string, input: DriverInput): Promise<void> {
  const { error } = await supabase.from("drivers").update(input).eq("id", id);
  if (error) throw error;
}

export async function resetDriverPin(id: string, newPin: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_driver_pin", { p_driver_id: id, p_new_pin: newPin });
  if (error) throw error;
}

export async function deleteDriver(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("drivers")
    .delete()
    .eq("id", id)
    .select("id"); // wajib .select() supaya kita bisa cek data.length
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Penghapusan tidak diizinkan — akun Anda mungkin tidak memiliki hak akses admin untuk menghapus driver."
    );
  }
}

export async function getAllEmployeesFull(): Promise<Employee[]> {
  const { data, error } = await supabase.from("employees").select("*").order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface EmployeeInput {
  nama: string;
  departement: string | null;
}

export async function addEmployee(input: EmployeeInput): Promise<void> {
  const { error } = await supabase.from("employees").insert(input);
  if (error) throw error;
}

export async function updateEmployee(id: string, input: EmployeeInput): Promise<void> {
  const { error } = await supabase.from("employees").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}

export async function getAllJobTypesFull(): Promise<JobType[]> {
  const { data, error } = await supabase.from("job_types").select("*").order("label", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addJobType(label: string): Promise<void> {
  const { error } = await supabase.from("job_types").insert({ label });
  if (error) throw error;
}

export async function updateJobType(id: string, label: string): Promise<void> {
  const { error } = await supabase.from("job_types").update({ label }).eq("id", id);
  if (error) throw error;
}

export async function deleteJobType(id: string): Promise<void> {
  const { error } = await supabase.from("job_types").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   APP SETTINGS — simple key-value config (e.g. manager_email for
   claim notification emails), editable by any authenticated admin/GA.
════════════════════════════════════════════════════════════ */

export async function getAppSetting(key: string): Promise<string> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? "";
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   CLAIM EMAIL NOTIFICATIONS — sends via the `send-claim-email` Supabase
   Edge Function (Resend). Two templates: a friendly confirmation for
   the driver, and a formal record-keeping notice for the manager.
   Both calls are best-effort — a missing/misconfigured email address,
   or the Edge Function not being deployed yet, must never block the
   claim itself from being saved (that already happened before this
   is called).
════════════════════════════════════════════════════════════ */

export interface ClaimEmailInput {
  driverName: string;
  periodDate: string;
  submissionDate: string;
  items: { type: string; expr: string; total: number }[];
  total: number;
  note?: string;
  lang?: "id" | "en";
}

async function invokeClaimEmail(
  recipientType: "driver" | "manager",
  toEmail: string | string[],
  input: ClaimEmailInput
): Promise<{ ok: boolean; error?: string }> {
  const recipients = Array.isArray(toEmail) ? toEmail.filter(Boolean) : [toEmail].filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "No recipient email configured" };
  try {
    const { error } = await supabase.functions.invoke("send-claim-email", {
      body: { recipientType, toEmail: recipients, ...input },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email" };
  }
}

/** Sends both notification emails for a newly-submitted claim (driver +
 *  manager, if their addresses are available) and returns a per-recipient
 *  result so the UI can show a soft warning without blocking anything —
 *  the claim record itself is already saved by the time this runs. */
export async function sendClaimNotificationEmails(
  driverEmail: string | null | undefined,
  input: ClaimEmailInput
): Promise<{ driver: { ok: boolean; error?: string } | null; manager: { ok: boolean; error?: string } | null }> {
  let managerEmails: string[] = [];
  try {
    const raw = await getAppSetting("manager_email");
    managerEmails = raw ? raw.split(",").map((e) => e.trim()).filter(Boolean) : [];
  } catch (e) {
    console.warn("Failed to read manager_email setting:", e instanceof Error ? e.message : e);
  }
  if (managerEmails.length === 0) {
    console.warn("sendClaimNotificationEmails: manager_email is empty — no manager copy will be sent.");
  }
  const [driverResult, managerResult] = await Promise.all([
    driverEmail ? invokeClaimEmail("driver", driverEmail, input) : Promise.resolve(null),
    managerEmails.length > 0 ? invokeClaimEmail("manager", managerEmails, input) : Promise.resolve(null),
  ]);
  return { driver: driverResult, manager: managerResult };
}

/* ════════════════════════════════════════════════════════════
   CANTEEN — merged from the standalone Canteen Ops system.
════════════════════════════════════════════════════════════ */

interface CanteenReportRow {
  id: string;
  report_date: string;
  snack_order_1: number; snack_order_2: number; snack_order_3: number;
  snack_leftover_1: number; snack_leftover_2: number; snack_leftover_3: number;
  meal_order_1: number; meal_order_2: number; meal_order_3: number;
  meal_leftover_1: number; meal_leftover_2: number; meal_leftover_3: number;
  submitted_by: string | null;
  created_at: string;
}

function mapCanteenRow(row: CanteenReportRow): CanteenReport {
  return {
    id: row.id,
    reportDate: row.report_date,
    snackOrder: [Number(row.snack_order_1) || 0, Number(row.snack_order_2) || 0, Number(row.snack_order_3) || 0],
    snackLeftover: [Number(row.snack_leftover_1) || 0, Number(row.snack_leftover_2) || 0, Number(row.snack_leftover_3) || 0],
    mealOrder: [Number(row.meal_order_1) || 0, Number(row.meal_order_2) || 0, Number(row.meal_order_3) || 0],
    mealLeftover: [Number(row.meal_leftover_1) || 0, Number(row.meal_leftover_2) || 0, Number(row.meal_leftover_3) || 0],
    submittedBy: row.submitted_by ?? "",
    createdAt: row.created_at,
  };
}

/** Gets all canteen reports for a given "YYYY-MM" month. */
export async function getCanteenReportsForMonth(month: string): Promise<CanteenReport[]> {
  const [y, m] = month.split("-").map(Number);
  // Bug fix: compute actual last day instead of hardcoding "-31"
  // (Postgres throws "date out of range" for e.g. "2026-02-31")
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  const lastDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("canteen_reports")
    .select("*")
    .gte("report_date", `${month}-01`)
    .lte("report_date", lastDate)
    .order("report_date", { ascending: true });
  if (error) throw error;
  return ((data as CanteenReportRow[]) ?? []).map(mapCanteenRow);
}

/** Gets every canteen report on file — used for the monthly-history /
 *  month-picker views, where we need to know which months have data. */
export async function getAllCanteenReports(): Promise<CanteenReport[]> {
  const { data, error } = await supabase.from("canteen_reports").select("*").order("report_date", { ascending: true });
  if (error) throw error;
  return ((data as CanteenReportRow[]) ?? []).map(mapCanteenRow);
}

export interface CanteenReportInput {
  reportDate: string;
  snackOrder: [number, number, number];
  snackLeftover: [number, number, number];
  mealOrder: [number, number, number];
  mealLeftover: [number, number, number];
  submittedBy: string;
}

/** Saving a report for a date that already has one REPLACES it —
 *  matches the original system, where submitting the same day again
 *  was how you corrected a mistake, not a duplicate.
 *
 *  Bug fix: replaced .upsert({ onConflict: "report_date" }) with an
 *  explicit insert → update fallback. The table has TWO unique
 *  constraints on report_date (column-level UNIQUE + a named index),
 *  which made Supabase upsert's conflict resolution ambiguous and
 *  caused a duplicate-key error on the second submit for the same day. */
export async function saveCanteenReport(input: CanteenReportInput): Promise<void> {
  const row = {
    report_date: input.reportDate,
    snack_order_1: input.snackOrder[0], snack_order_2: input.snackOrder[1], snack_order_3: input.snackOrder[2],
    snack_leftover_1: input.snackLeftover[0], snack_leftover_2: input.snackLeftover[1], snack_leftover_3: input.snackLeftover[2],
    meal_order_1: input.mealOrder[0], meal_order_2: input.mealOrder[1], meal_order_3: input.mealOrder[2],
    meal_leftover_1: input.mealLeftover[0], meal_leftover_2: input.mealLeftover[1], meal_leftover_3: input.mealLeftover[2],
    submitted_by: input.submittedBy,
  };

  // Try insert first (new date)
  const { error: insertError } = await supabase
    .from("canteen_reports")
    .insert(row);

  if (!insertError) return; // inserted successfully

  // If duplicate key → fall back to update for this date
  const isDuplicate =
    insertError.code === "23505" || // Postgres unique violation
    (insertError.message ?? "").toLowerCase().includes("duplicate") ||
    (insertError.message ?? "").toLowerCase().includes("unique");

  if (!isDuplicate) throw insertError; // unexpected error — bubble up

  const { error: updateError } = await supabase
    .from("canteen_reports")
    .update(row)
    .eq("report_date", input.reportDate);

  if (updateError) throw updateError;
}

export async function deleteCanteenReport(id: string): Promise<void> {
  const { error } = await supabase.from("canteen_reports").delete().eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════
//  GIFT DISTRIBUTION SYSTEM
// ════════════════════════════════════════════════════════════

import type { GiftEvent, GiftRegistration, GiftItemDef, GiftSelection } from "./types";

// ── Row types ─────────────────────────────────────────────────
interface GiftEventRow {
  id: string; name: string; description: string | null;
  items: GiftItemDef[]; status: "open" | "closed"; plant: string | null;
  mode?: string;
  actual_baju_count: number | null; actual_tiket_count: number | null;
  actual_stock_per_size?: Record<string, number> | null;
  created_at: string; updated_at: string;
}
interface GiftRegRow {
  id: string; event_id: string; event_name: string;
  nik: string; nama: string; departemen: string; email: string;
  sequence_no?: string; lokasi_pengambilan?: string;
  jumlah_tiket?: number | null; anak_dibawah_2_tahun?: number | null; status_kehadiran?: string | null;
  selections: GiftSelection[]; claimed: boolean;
  claimed_at: string | null; claimed_by: string | null; registered_at: string;
}

function mapGiftEvent(r: GiftEventRow): GiftEvent {
  return { id: r.id, name: r.name, description: r.description,
    items: r.items ?? [], status: r.status, plant: r.plant,
    mode: (r.mode as "self_register" | "lookup") ?? "self_register",
    actualBajuCount: r.actual_baju_count, actualTiketCount: r.actual_tiket_count,
    actualStockPerSize: r.actual_stock_per_size ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapGiftReg(r: GiftRegRow): GiftRegistration {
  return { id: r.id, eventId: r.event_id, eventName: r.event_name ?? "",
    nik: r.nik, nama: r.nama, departemen: r.departemen, email: r.email,
    sequenceNo: r.sequence_no ?? "", lokasiPengambilan: r.lokasi_pengambilan ?? "",
    jumlahTiket: r.jumlah_tiket ?? null, anakDibawah2Tahun: r.anak_dibawah_2_tahun ?? null, statusKehadiran: r.status_kehadiran ?? null,
    selections: r.selections ?? [], claimed: r.claimed,
    claimedAt: r.claimed_at, claimedBy: r.claimed_by, registeredAt: r.registered_at };
}

// ── Events CRUD ───────────────────────────────────────────────
export async function getGiftEvents(onlyOpen = false): Promise<GiftEvent[]> {
  let q = supabase.from("gift_events").select("*").order("created_at", { ascending: false });
  if (onlyOpen) q = q.eq("status", "open");
  const { data, error } = await q;
  if (error) throw error;
  return ((data as GiftEventRow[]) ?? []).map(mapGiftEvent);
}

export async function createGiftEvent(input: {
  name: string; description: string; items: GiftItemDef[];
  status: "open" | "closed"; plant?: string; mode?: "self_register" | "lookup";
}): Promise<string> {
  const { data, error } = await supabase.from("gift_events").insert({
    name: input.name, description: input.description || null,
    items: input.items, status: input.status, plant: input.plant || null,
    mode: input.mode ?? "self_register",
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateGiftEvent(id: string, input: {
  name?: string; description?: string; items?: GiftItemDef[];
  status?: "open" | "closed"; plant?: string; mode?: "self_register" | "lookup";
}): Promise<void> {
  const { error } = await supabase.from("gift_events")
    .update({ ...input, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** Simpan jumlah baju/tiket AKTUAL (fisik yang datang) — diisi manual
 *  oleh admin, dibandingkan dengan jumlah kebutuhan hasil hitung
 *  sistem dari data peserta. */
export async function updateGiftEventActualCounts(id: string, input: { actualBajuCount: number | null; actualTiketCount: number | null }): Promise<void> {
  const { error } = await supabase.from("gift_events")
    .update({ actual_baju_count: input.actualBajuCount, actual_tiket_count: input.actualTiketCount, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Simpan stok baju AKTUAL per ukuran (mis. {"XL": 500, "L": 300}) —
 *  dipakai untuk hitung sisa stok otomatis (aktual dikurangi yang
 *  sudah diambil). */
export async function updateGiftEventStockPerSize(id: string, stockPerSize: Record<string, number>): Promise<void> {
  const { error } = await supabase.from("gift_events")
    .update({ actual_stock_per_size: stockPerSize, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGiftEvent(id: string): Promise<void> {
  const { error } = await supabase.from("gift_events").delete().eq("id", id);
  if (error) throw error;
}

// ── Registrations ─────────────────────────────────────────────
export async function getGiftRegistrations(eventId: string): Promise<GiftRegistration[]> {
  // ⚠️ PENTING: Supabase membatasi otomatis 1000 baris per query.
  // Untuk event besar (>1000 peserta, mis. pembagian seragam massal),
  // kita HARUS paginate manual pakai .range() berulang sampai data
  // benar-benar habis — kalau tidak, sisa peserta di atas baris ke-1000
  // tidak akan pernah muncul di tabel admin, KPI, cetak label, maupun
  // export laporan.
  const PAGE_SIZE = 1000;
  const all: unknown[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("gift_registrations")
      .select("*, gift_events(name)")
      .eq("event_id", eventId)
      .order("registered_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break; // halaman terakhir
    from += PAGE_SIZE;
  }
  return all.map((r: unknown) => {
    const row = r as GiftRegRow & { gift_events?: { name: string } };
    return mapGiftReg({ ...row, event_name: row.gift_events?.name ?? "" });
  });
}

/** Generate passcode 8 digit acak (client-side, langsung dikirim ke RPC untuk di-hash) */
export function generateGiftPasscode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 10000).padStart(4, "0");
}

export async function registerGift(input: {
  eventId: string; nik: string; nama: string;
  departemen: string; email: string;
  selections: GiftSelection[]; passcode: string;
}): Promise<{ success: boolean; errorCode?: string }> {
  const { data, error } = await supabase.rpc("create_gift_registration", {
    p_event_id:   input.eventId,
    p_nik:        input.nik.trim(),
    p_nama:       input.nama.trim(),
    p_departemen: input.departemen.trim(),
    p_email:      input.email.trim().toLowerCase(),
    p_selections: input.selections,
    p_passcode:   input.passcode,
  });
  if (error) return { success: false, errorCode: error.message };
  const row = (data as { success: boolean; error_code: string }[])?.[0];
  return { success: row?.success ?? false, errorCode: row?.error_code || undefined };
}

export async function verifyGiftPasscode(passcode: string): Promise<GiftRegistration | null> {
  const { data, error } = await supabase.rpc("verify_gift_passcode", { p_passcode: passcode });
  if (error) throw error;
  if (!data || (data as GiftRegRow[]).length === 0) return null;
  return mapGiftReg((data as GiftRegRow[])[0]);
}

/** Cari registrasi (mode "lookup" — admin import) berdasarkan NIK, tanpa
 *  passcode sama sekali. Lewat RPC security definer, jadi tidak perlu
 *  buka akses SELECT publik ke seluruh tabel gift_registrations. */
export async function findGiftRegistrationByNik(eventId: string, nik: string): Promise<GiftRegistration | null> {
  const { data, error } = await supabase.rpc("find_gift_registration_by_nik", { p_event_id: eventId, p_nik: nik.trim() });
  if (error) throw error;
  if (!data || (data as GiftRegRow[]).length === 0) return null;
  return mapGiftReg((data as GiftRegRow[])[0]);
}

/** Cari peserta by NAMA — bisa mengembalikan lebih dari 1 hasil
 *  (beda dari NIK yang pasti unik), berguna kalau ada NIK yang
 *  tertukar dengan nama orang lain di data sumber. */
export async function findGiftRegistrationsByName(eventId: string, name: string): Promise<GiftRegistration[]> {
  const { data, error } = await supabase.rpc("find_gift_registrations_by_name", { p_event_id: eventId, p_name: name.trim() });
  if (error) throw error;
  return ((data as GiftRegRow[]) ?? []).map(mapGiftReg);
}

/** Tandai barang sudah diambil — lewat RPC (bukan update tabel langsung),
 *  supaya tidak perlu policy UPDATE publik yang longgar. Dipakai baik
 *  mode "self_register" (passcode) maupun "lookup" (NIK). */
export async function claimGift(registrationId: string, claimedBy: string): Promise<void> {
  const { data, error } = await supabase.rpc("claim_gift_registration", { p_id: registrationId, p_claimed_by: claimedBy });
  if (error) throw error;
  if (!data) throw new Error("Sudah diklaim sebelumnya oleh pihak lain.");
}

/** Batalkan status "sudah diambil" — jaga-jaga kalau petugas salah
 *  tandai. HANYA dipanggil dari Dashboard (admin, sudah login), BUKAN
 *  dari halaman publik /gift/lookup — makanya ini update tabel
 *  langsung (bukan RPC security-definer), memanfaatkan policy
 *  "gift_reg_update_authenticated" yang sudah ada. */
export async function unclaimGiftRegistration(registrationId: string): Promise<void> {
  const { error } = await supabase.from("gift_registrations")
    .update({ claimed: false, claimed_at: null, claimed_by: null })
    .eq("id", registrationId);
  if (error) throw error;
}

/** Import bulk data karyawan + barang (mode "lookup") dari Excel/CSV,
 *  dipanggil dari Dashboard (admin, sudah login) — bukan dari halaman
 *  publik. Satu baris = satu karyawan, dengan array selections berisi
 *  semua barang yang berhak diterima (termasuk qty). NIK yang sama di
 *  event yang sama akan GAGAL (constraint unik) — dilaporkan sebagai
 *  duplikat, bukan menimpa data lama, supaya aman dari re-import tidak sengaja. */
export async function bulkImportGiftRegistrations(
  eventId: string,
  rows: { nik: string; nama: string; departemen: string; email?: string; sequenceNo?: string; lokasiPengambilan?: string; jumlahTiket?: number | null; anakDibawah2Tahun?: number | null; statusKehadiran?: string | null; selections: GiftSelection[] }[]
): Promise<{ inserted: number; duplicates: string[] }> {
  // ⚠️ PENTING: insert satu-per-satu akan SANGAT LAMBAT untuk data besar
  // (ribuan baris = ribuan round-trip network, bisa 5-10 menit dan
  // berisiko macet/timeout di tengah jalan). Sekarang pakai BATCH
  // INSERT (per 500 baris) — jauh lebih cepat (hitungan detik).
  //
  // Karena 1 baris gagal (duplikat) di dalam satu batch insert akan
  // membuat SELURUH batch itu gagal (transaksional), kita cek dulu
  // NIK mana saja yang sudah ada di database ATAU dobel di dalam file
  // itu sendiri, keluarkan dari daftar insert, baru batch-insert
  // sisanya yang aman.
  const duplicates: string[] = [];

  // 1) Cek NIK yang SUDAH ADA di event ini (ambil semua, dengan
  //    pagination yang sama seperti getGiftRegistrations, supaya
  //    tidak kena limit 1000-baris Supabase untuk event besar).
  const existingNiks = new Set<string>();
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("gift_registrations")
        .select("nik")
        .eq("event_id", eventId)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data as { nik: string }[]) existingNiks.add(r.nik);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // 2) Filter baris: skip yang NIK-nya sudah ada di DB, dan skip juga
  //    NIK yang dobel DI DALAM file itu sendiri (simpan kemunculan
  //    pertama saja).
  const seenInFile = new Set<string>();
  const toInsert: typeof rows = [];
  for (const r of rows) {
    const nik = r.nik.trim();
    if (existingNiks.has(nik) || seenInFile.has(nik)) {
      duplicates.push(nik);
      continue;
    }
    seenInFile.add(nik);
    toInsert.push(r);
  }

  // 3) Batch insert per 500 baris.
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE).map((r) => ({
      event_id: eventId,
      nik: r.nik.trim(),
      nama: r.nama.trim(),
      departemen: r.departemen.trim(),
      email: (r.email || "").trim().toLowerCase(),
      sequence_no: r.sequenceNo || "",
      lokasi_pengambilan: r.lokasiPengambilan || "",
      jumlah_tiket: r.jumlahTiket ?? null,
      anak_dibawah_2_tahun: r.anakDibawah2Tahun ?? null,
      status_kehadiran: r.statusKehadiran || null,
      selections: r.selections,
      passcode_hash: null, // mode lookup tidak pakai passcode
    }));
    const { error } = await supabase.from("gift_registrations").insert(batch);
    if (error) throw error;
    inserted += batch.length;
  }

  return { inserted, duplicates };
}
