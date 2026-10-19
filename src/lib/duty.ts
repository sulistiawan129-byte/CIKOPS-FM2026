"use client";

import { useEffect, useState } from "react";
import type { Driver, DriverType } from "./types";

/**
 * Status tugas (duty) driver. Tiga klasifikasi:
 *  - operational : DRIVER POOL — status mengikuti penugasan (diatur di tempat lain).
 *  - support     : DRIVER SUPPORT — driver pendukung/cadangan; menerima
 *                  penugasan seperti Driver Pool, hanya beda klasifikasi.
 *  - user        : driver dedicated untuk seorang "user". Otomatis ON DUTY
 *                  setiap hari pukul 08.00–16.30 WIB. Status TERKUNCI —
 *                  tidak bisa diubah manual dan tidak ikut penugasan.
 */
export const USER_DUTY_START = "08:00";
export const USER_DUTY_END = "16:30";
export const DUTY_TZ = "Asia/Jakarta";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Menit sejak 00.00 di zona waktu WIB. */
export function minutesNowWIB(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUTY_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function isWithinUserDutyHours(now: Date = new Date()): boolean {
  const t = minutesNowWIB(now);
  return t >= toMin(USER_DUTY_START) && t < toMin(USER_DUTY_END);
}

export function isUserDriver(d?: Pick<Driver, "driver_type"> | null): boolean {
  return (d?.driver_type ?? "operational") === "user";
}

/** Tipe driver yang sudah dinormalisasi (nilai kosong/tak dikenal → Driver Pool). */
export function driverTypeOf(d?: Pick<Driver, "driver_type"> | null): DriverType {
  const t = d?.driver_type;
  return t === "user" || t === "support" ? t : "operational";
}

export const DRIVER_TYPES: DriverType[] = ["operational", "user", "support"];

/** Label tampilan tiap tipe driver. Nilai database "operational" = Driver Pool. */
export const DRIVER_TYPE_LABEL: Record<DriverType, string> = {
  operational: "Driver Pool",
  user: "Driver User",
  support: "Driver Support",
};

/** Warna penanda tipe driver (CSS var). */
export const DRIVER_TYPE_COLOR: Record<DriverType, string> = {
  operational: "var(--brand)",
  user: "var(--purple)",
  support: "var(--orange)",
};

export function driverTypeLabel(d?: Pick<Driver, "driver_type"> | null): string {
  return DRIVER_TYPE_LABEL[driverTypeOf(d)];
}

export const dutyHoursLabel = `${USER_DUTY_START.replace(":", ".")}–${USER_DUTY_END.replace(":", ".")}`;

export interface UserDutyStatus {
  type: DriverType;
  /** true selama driver user: status tidak bisa diubah manual */
  locked: boolean;
  /** true bila sedang jam dinas (08.00–16.30 WIB) */
  onDuty: boolean;
  /** nama user yang diantar, mis. "Bpk. Budi" */
  userName: string;
  userTitle: string;
}

/** Status duty untuk driver bertipe user (untuk pool/support: locked=false). */
export function getUserDutyStatus(d?: Driver | null, now: Date = new Date()): UserDutyStatus {
  const type: DriverType = driverTypeOf(d);
  if (type !== "user") return { type, locked: false, onDuty: false, userName: "", userTitle: "" };
  return {
    type,
    locked: true,
    onDuty: isWithinUserDutyHours(now),
    userName: (d?.assigned_user ?? "").trim(),
    userTitle: (d?.assigned_user_title ?? "").trim(),
  };
}

/** Re-render berkala supaya status berpindah tepat jam 08.00 / 16.30. */
export function useNowTick(ms = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}
