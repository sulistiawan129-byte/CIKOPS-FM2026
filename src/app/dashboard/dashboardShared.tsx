"use client";

import { useEffect, useState } from "react";
import type { Claim, Plant, Printer } from "@/lib/types";
import type { Employee, Vehicle } from "@/lib/types";
import { toLocalISODate } from "@/lib/dateUtils";
import of from "./opfund.module.css";
import { NavTab } from "./HomeTab";

export function todayStr() {
  return toLocalISODate(new Date());
}

/** Merged dashboard tabs — "tasks" is the original driver-assignment
 *  feature; the rest are FleetOS features ported into this same app. */
export type DashboardTab =
  | "home"
  | "overview"
  | "tasks"
  | "vehicles"
  | "claims"
  | "overtime"
  | "driverbudget"
  | "gate"
  | "opfund"
  | "gasstations"
  | "reports"
  | "masterdata"
  | "canteen"
  | "locker"
  | "gift"
  | "printer"
  | "employeerequests"
  | "atk"
  | "gafacility"
  | "receptionist"
  | "security"
  | "calendar"
  | "executive"
  | "accounts"
  | "activitylog";

interface NavGroup { id: string; icon: string; labelId: string; labelEn: string; tabs: NavTab[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "fleet",
    icon: "🚚",
    labelId: "Fleet & Kendaraan",
    labelEn: "Fleet & Vehicles",
    tabs: [
      { id: "tasks", icon: "🗂️", labelId: "Penugasan", labelEn: "Tasks", descId: "Kelola penugasan kendaraan & driver", descEn: "Manage vehicle & driver tasks" },
      { id: "vehicles", icon: "🚗", labelId: "Armada", labelEn: "Vehicles", descId: "Data kendaraan & kelengkapannya", descEn: "Vehicle data & documents" },
      { id: "gate", icon: "🚧", labelId: "Gate Log", labelEn: "Gate Log", descId: "Keluar-masuk kendaraan di pos gate", descEn: "Vehicle in/out at the gate post" },
      { id: "gasstations", icon: "⛽", labelId: "Pom Bensin", labelEn: "Gas Stations", descId: "Mapping & transaksi bahan bakar", descEn: "Fuel mapping & transactions" },
    ],
  },
  {
    id: "finance",
    icon: "💵",
    labelId: "Finance",
    labelEn: "Finance",
    tabs: [
      { id: "claims", icon: "🧾", labelId: "Klaim", labelEn: "Claims", descId: "Pengajuan & monitoring klaim", descEn: "Claim submission & monitoring" },
      { id: "opfund", icon: "💰", labelId: "Dana Operasional", labelEn: "Operational Fund", descId: "Kas operasional & budget driver per tier", descEn: "Operational cash & driver budget tiers" },
    ],
  },
  {
    id: "facility",
    icon: "🏢",
    labelId: "Fasilitas",
    labelEn: "Facility",
    tabs: [
      { id: "canteen", icon: "🍱", labelId: "Kantin", labelEn: "Canteen", descId: "Manajemen kantin perusahaan", descEn: "Company canteen management" },
      { id: "locker", icon: "🔐", labelId: "Locker", labelEn: "Locker", descId: "Pemesanan & pengelolaan locker", descEn: "Locker booking & management" },
      { id: "gift", icon: "🎁", labelId: "Pembagian", labelEn: "Gift Dist.", descId: "Distribusi barang & perlengkapan", descEn: "Item & supply distribution" },
      { id: "printer", icon: "🖨️", labelId: "Printer", labelEn: "Printer", descId: "Manajemen printer & permintaan", descEn: "Printer management & requests" },
      { id: "employeerequests", icon: "📨", labelId: "Permintaan Karyawan", labelEn: "Employee Requests", descId: "Pengajuan permintaan dari karyawan", descEn: "Employee-submitted requests" },
      { id: "atk", icon: "✏️", labelId: "ATK", labelEn: "Office Supplies", descId: "Pengajuan ATK & perlengkapan", descEn: "Office supplies requests" },
      { id: "receptionist", icon: "🛎️", labelId: "Receptionist", labelEn: "Receptionist", descId: "Wifi tamu, barang & surat, booking Induction Room", descEn: "Guest wifi, parcels & mail, Induction Room booking" },
      { id: "gafacility", icon: "🧹", labelId: "Cleaning & Gardening", labelEn: "Cleaning & Gardening", descId: "Cleaning Service, Gardener & TGA (sinkron Excel)", descEn: "Cleaning, gardening & GA technicians (Excel sync)" },
    ],
  },
  {
    id: "security",
    icon: "🛡️",
    labelId: "Security",
    labelEn: "Security",
    tabs: [
      { id: "security", icon: "🛡️", labelId: "Laporan Security", labelEn: "Security Report", descId: "Input bulanan kendaraan, transporter, kejadian, patroli", descEn: "Monthly vehicles, transporters, incidents, patrol" },
    ],
  },
  {
    id: "system",
    icon: "⚙️",
    labelId: "Sistem",
    labelEn: "System",
    tabs: [
      { id: "executive", icon: "📺", labelId: "Command Center", labelEn: "Command Center", descId: "Dashboard eksekutif & tarik laporan", descEn: "Executive dashboard & report export" },
      { id: "calendar", icon: "📅", labelId: "Kalender", labelEn: "Calendar", descId: "Agenda kunjungan, event & penugasan driver", descEn: "Visits, events & driver tasks" },
      { id: "reports", icon: "📈", labelId: "Report", labelEn: "Reports", descId: "Laporan & analisis data", descEn: "Reports & data analysis" },
      { id: "masterdata", icon: "🗄️", labelId: "Master Data", labelEn: "Master Data", descId: "Kelola master data sistem", descEn: "Manage system master data" },
      { id: "accounts", icon: "👥", labelId: "Akun & Role", labelEn: "Accounts & Roles", descId: "Kelola akun tim dan perannya", descEn: "Manage team accounts and roles" },
      { id: "activitylog", icon: "📋", labelId: "Log Aktivitas", labelEn: "Activity Log", descId: "Riwayat aktivitas sistem", descEn: "System activity history" },
    ],
  },
];

/** Hook sederhana untuk deteksi viewport mobile vs desktop, dipakai untuk
 *  memilih presentasi yang berbeda (tabel di PC, kartu di HP) dari data yang sama. */
export function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < breakpoint);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}

/** Animates a number counting up from 0 to `target` over ~900ms using an
 *  eased curve — used for hero KPI values so the dashboard feels alive on
 *  load instead of numbers just appearing statically. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

/** Safely evaluates a simple arithmetic expression like "50000+30000" —
 *  strips anything that isn't a digit/operator first, same approach the
 *  original FleetOS claim form used for its nominal field. */
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

/** Computes the 4 Monday–Friday-anchored week boundaries (day-of-month
 *  numbers) for the month containing `dateStr`.
 *
 *  Business rule: a "week" here means a work week (Mon–Fri), and every
 *  month is always divided into exactly 4 of them for Claims reporting —
 *  never 5, even though a calendar month rarely divides evenly into
 *  4 full Mon–Fri blocks.
 *
 *  Week 1 always starts on the 1st, whatever weekday that is, and runs
 *  through the nearest Friday on/after it — EXCEPT if the 1st itself
 *  falls on a Friday, Saturday, or Sunday, in which case it runs through
 *  the *following* Friday instead. That's what folds a weekend sitting
 *  right at the start of the month into Week 1 (rather than that
 *  weekend becoming its own tiny "week 0"), and avoids a degenerate
 *  1-day Week 1 when the 1st happens to be a Friday:
 *    1st = Mon → Week 1 = day 1–5     1st = Fri → Week 1 = day 1–8
 *    1st = Tue → Week 1 = day 1–4     1st = Sat → Week 1 = day 1–7
 *    1st = Wed → Week 1 = day 1–3     1st = Sun → Week 1 = day 1–6
 *    1st = Thu → Week 1 = day 1–2
 *
 *  Weeks 2 and 3 are then standard 7-day blocks following on. Week 4
 *  absorbs everything through the end of the month (so it's often
 *  longer than 7 days — that's expected, it's the 4th bucket by design,
 *  not a 5th week). */
export function monthWeekBoundaries(dateStr: string): { start: number; end: number }[] {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day1Weekday = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat
  let toFriday = (5 - day1Weekday + 7) % 7;
  if (toFriday === 0) toFriday = 7; // 1st is a Friday — push to next Friday, not a same-day week
  const w1End = Math.min(1 + toFriday, daysInMonth);
  const w2End = Math.min(w1End + 7, daysInMonth);
  const w3End = Math.min(w2End + 7, daysInMonth);
  return [
    { start: 1, end: w1End },
    { start: Math.min(w1End + 1, daysInMonth), end: w2End },
    { start: Math.min(w2End + 1, daysInMonth), end: w3End },
    { start: Math.min(w3End + 1, daysInMonth), end: daysInMonth },
  ];
}

export const PLANT_COLOR: Record<Plant, string> = { CIK: "var(--brand)", PRB: "var(--green)" };
/** Buka jendela baru berisi bukti permintaan yang rapi lalu langsung
 *  panggil print — dipakai admin untuk cetak ulang bukti permintaan
 *  apapun (driver, toner/printer, lainnya) dari Dashboard. */
/** Identitas dokumen resmi di bukti cetak — samakan dengan yang di
 *  src/app/request/page.tsx kalau ada pergantian administrator. */
const RECEIPT_COMPANY_NAME = "PT. Frisian Flag Indonesia - Plant Cikarang";
const RECEIPT_SYSTEM_NAME = "CIKOPS Fleet Management";
const RECEIPT_ADMIN_NAME = "Sulistiawan";
const RECEIPT_ADMIN_DEPARTMENT = "Facility Management";

export function printRequestReceipt(params: {
  refId: string;
  createdAt: string;
  typeLabel: string;
  employeeName: string;
  department: string;
  lines: { label: string; value: string }[];
}) {
  const w = window.open("", "_blank", "width=520,height=760");
  if (!w) return;
  const refNo = `REQ-${toLocalISODate(new Date(params.createdAt)).replace(/-/g, "")}-${params.refId.slice(0, 6).toUpperCase()}`;
  const rows = params.lines
    .filter((l) => l.value)
    .map((l) => `<tr><td style="padding:5px 0;color:#7886a8;width:38%;vertical-align:top;">${l.label}</td><td style="padding:5px 0;font-weight:700;color:#0d1a36;">: ${l.value}</td></tr>`)
    .join("");
  const origin = window.location.origin;
  w.document.write(`
    <html>
      <head>
        <title>Bukti Permintaan — ${refNo}</title>
        <style>
          @page { margin: 16mm; }
          body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #0d1a36; margin: 0; }
          .wrap { max-width: 480px; margin: 0 auto; border: 1px solid #cfd9ee; border-radius: 14px; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; }
          .lbl { font-size: 11px; font-weight: 800; color: #7886a8; letter-spacing: 0.06em; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div style="padding:24px 28px 18px;border-bottom:3px solid #0d1a36;display:flex;align-items:center;gap:14px;">
            <div style="width:56px;height:56px;border-radius:10px;background:#0d1a36;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
              <img src="${origin}/logo.png" alt="CIKOPS" style="width:80%;height:80%;object-fit:contain;" />
            </div>
            <div>
              <div style="font-size:15.5px;font-weight:800;color:#0d1a36;line-height:1.3;">${RECEIPT_COMPANY_NAME}</div>
              <div style="font-size:12.5px;color:#44537a;font-weight:600;">${RECEIPT_SYSTEM_NAME}</div>
              <div style="font-size:11px;color:#7886a8;">Departemen Facility Management</div>
            </div>
          </div>

          <div style="padding:18px 28px 14px;text-align:center;background:#f6f9ff;">
            <div style="font-size:15px;font-weight:800;color:#0d1a36;letter-spacing:0.04em;">BUKTI PERMINTAAN</div>
            <div style="font-size:11.5px;color:#7886a8;font-family:monospace;margin-top:3px;">No. ${refNo}</div>
          </div>

          <div style="padding:20px 28px;">
            <table style="margin-bottom:16px;font-size:13px;">
              <tr><td style="padding:5px 0;color:#7886a8;width:38%;">Tanggal Pengajuan</td><td style="padding:5px 0;font-weight:700;">: ${new Date(params.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
              <tr><td style="padding:5px 0;color:#7886a8;">Jenis Permintaan</td><td style="padding:5px 0;font-weight:700;">: ${params.typeLabel}</td></tr>
              <tr><td style="padding:5px 0;color:#7886a8;">Nama Pemohon</td><td style="padding:5px 0;font-weight:700;">: ${params.employeeName}</td></tr>
              <tr><td style="padding:5px 0;color:#7886a8;">Departemen</td><td style="padding:5px 0;font-weight:700;">: ${params.department || "-"}</td></tr>
            </table>

            <div class="lbl" style="border-top:1px solid #eef3fc;padding-top:14px;margin-bottom:8px;">DETAIL PERMINTAAN</div>
            <table style="margin-bottom:22px;font-size:13px;">${rows}</table>

            <div style="border-top:1px dashed #cfd9ee;padding-top:16px;display:flex;justify-content:flex-end;">
              <div style="text-align:center;min-width:170px;">
                <div style="font-size:11px;color:#7886a8;margin-bottom:46px;">Diterima &amp; diproses oleh,</div>
                <div style="font-size:13.5px;font-weight:800;color:#0d1a36;border-top:1px solid #0d1a36;padding-top:4px;">${RECEIPT_ADMIN_NAME}</div>
                <div style="font-size:11.5px;color:#7886a8;">${RECEIPT_ADMIN_DEPARTMENT}</div>
              </div>
            </div>
          </div>

          <div style="text-align:center;padding:10px 0;font-size:10px;color:#a0aabb;border-top:1px solid #eef3fc;">
            Dokumen ini digenerate otomatis oleh sistem ${RECEIPT_SYSTEM_NAME}
          </div>
        </div>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
