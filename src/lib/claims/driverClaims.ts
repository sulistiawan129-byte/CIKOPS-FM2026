/* Self-Claim driver (bagian 043 di supabase/04_aplikasi_lapangan.sql).
   Driver mengajukan klaim dari aplikasi → status "menunggu" → admin Finance
   memverifikasi (boleh mengedit) di menu Klaim → klaim resmi dibuat di tabel claims. */
import { supabase } from "../supabaseClient";
import type { ClaimItem, Plant } from "../types";

export type ClaimRequestStatus = "menunggu" | "disetujui" | "ditolak" | "dibatalkan";

export interface ClaimRequest {
  id: string;
  driverId: string;
  driverName: string;
  driverEmail: string;
  driverPlant: Plant | null;
  periodDate: string;
  items: ClaimItem[];
  total: number;
  note: string;
  nota: "ada" | "menyusul";
  status: ClaimRequestStatus;
  adminNote: string;
  claimId: string | null;
  reviewedBy: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimRequestInput {
  periodDate: string;
  items: ClaimItem[];
  note: string;
  nota: "ada" | "menyusul";
}

/** Jenis klaim — sama dengan form Klaim di dashboard (CLAIM_CATS). */
export const CLAIM_TYPES = [
  { id: "Gasoline", label: "Bensin", en: "Fuel", icon: "⛽", hue: 145 },
  { id: "Toll", label: "Tol", en: "Toll", icon: "🛣️", hue: 222 },
  { id: "Parking", label: "Parkir", en: "Parking", icon: "🅿️", hue: 265 },
  { id: "Service", label: "Servis", en: "Service", icon: "🔧", hue: 28 },
  { id: "Maintenance", label: "Perawatan", en: "Maintenance", icon: "🧰", hue: 190 },
  { id: "Other", label: "Lainnya", en: "Other", icon: "🧾", hue: 330 },
] as const;

export function claimType(id: string) {
  return CLAIM_TYPES.find((t) => t.id === id) ?? { id, label: id, en: id, icon: "🧾", hue: 330 };
}

export const CLAIM_REQUEST_STATUS: Record<ClaimRequestStatus, { label: string; en: string; tone: "orange" | "green" | "red" | "gray" }> = {
  menunggu: { label: "Menunggu verifikasi", en: "Awaiting review", tone: "orange" },
  disetujui: { label: "Diverifikasi", en: "Verified", tone: "green" },
  ditolak: { label: "Ditolak", en: "Rejected", tone: "red" },
  dibatalkan: { label: "Dibatalkan", en: "Cancelled", tone: "gray" },
};

/** Hitung nominal dari isian seperti "50000+25000" (hanya angka & operator). */
export function evalExpr(raw: string): number | null {
  const cleaned = (raw || "").replace(/[^0-9+\-*/().\s]/g, "").slice(0, 120);
  if (!cleaned.trim()) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function('"use strict";return (' + cleaned + ")")();
    return isFinite(value) && value >= 0 ? Math.round(value) : null;
  } catch {
    return null;
  }
}

interface Row {
  id: string; driver_id: string; period_date: string; items: ClaimItem[]; total: number; note: string; nota: string;
  status: ClaimRequestStatus; admin_note: string; claim_id: string | null; reviewed_by: string; reviewed_at: string | null;
  created_at: string; updated_at: string;
  drivers?: { nama: string; email: string | null; plant: string | null } | null;
}

const COLS = "id, driver_id, period_date, items, total, note, nota, status, admin_note, claim_id, reviewed_by, reviewed_at, created_at, updated_at";

function mapRow(r: Row): ClaimRequest {
  return {
    id: r.id, driverId: r.driver_id,
    driverName: r.drivers?.nama ?? "", driverEmail: r.drivers?.email ?? "", driverPlant: (r.drivers?.plant as Plant) ?? null,
    periodDate: r.period_date, items: Array.isArray(r.items) ? r.items : [], total: Number(r.total) || 0,
    note: r.note ?? "", nota: r.nota === "ada" ? "ada" : "menyusul", status: r.status,
    adminNote: r.admin_note ?? "", claimId: r.claim_id, reviewedBy: r.reviewed_by ?? "", reviewedAt: r.reviewed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function friendly(e: { message?: string; code?: string } | null): Error {
  const m = e?.message ?? "Terjadi kesalahan.";
  if (/driver_claim|could not find the function|relation .* does not exist|schema cache/i.test(m)) {
    return new Error("Fitur Self-Claim belum aktif — admin perlu menjalankan supabase/04_aplikasi_lapangan.sql.");
  }
  return new Error(m);
}

/* ── Aplikasi driver ── */

/** Pengajuan milik driver yang login (RLS hanya mengembalikan miliknya). */
export async function getMyClaimRequests(): Promise<ClaimRequest[]> {
  const { data, error } = await supabase.from("driver_claim_requests").select(COLS)
    .order("created_at", { ascending: false }).limit(80);
  if (error) throw friendly(error);
  return ((data ?? []) as Row[]).map(mapRow);
}

export async function submitClaimRequest(id: string | null, input: ClaimRequestInput): Promise<string> {
  const { data, error } = await supabase.rpc("driver_claim_submit", {
    p_id: id, p_period: input.periodDate, p_items: input.items, p_note: input.note, p_nota: input.nota,
  });
  if (error) throw friendly(error);
  return String(data);
}

export async function cancelClaimRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc("driver_claim_cancel", { p_id: id });
  if (error) throw friendly(error);
}

/* ── Dashboard (admin Finance) ── */

export async function getClaimRequests(opts: { status?: ClaimRequestStatus | "all"; plant?: Plant | null } = {}): Promise<ClaimRequest[]> {
  let q = supabase.from("driver_claim_requests")
    .select(`${COLS}, drivers${opts.plant ? "!inner" : ""} ( nama, email, plant )`)
    .order("created_at", { ascending: false }).limit(200);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.plant) q = q.eq("drivers.plant", opts.plant);
  const { data, error } = await q;
  if (error) throw friendly(error);
  return ((data ?? []) as unknown as Row[]).map(mapRow);
}

export async function approveClaimRequest(id: string, input: {
  driverId: string; submissionDate: string; periodDate: string; items: ClaimItem[]; note: string; adminNote?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("driver_claim_approve", {
    p_id: id, p_driver: input.driverId, p_submission: input.submissionDate, p_period: input.periodDate,
    p_items: input.items, p_note: input.note, p_admin_note: input.adminNote ?? "",
  });
  if (error) throw friendly(error);
  return String(data);
}

export async function rejectClaimRequest(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("driver_claim_reject", { p_id: id, p_reason: reason });
  if (error) throw friendly(error);
}

/** Realtime: perubahan pengajuan (filter per driver untuk aplikasi driver). */
export function subscribeClaimRequests(onChange: () => void, driverId?: string) {
  const channel = supabase
    .channel(`claim-requests-${driverId ?? "all"}-${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "driver_claim_requests", ...(driverId ? { filter: `driver_id=eq.${driverId}` } : {}) },
      () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
