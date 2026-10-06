"use client";

import { useEffect, useState } from "react";
import type { Driver, DriverType } from "./types";

/**
 * Status tugas (duty) driver.
 *  - operational : status mengikuti penugasan (diatur di tempat lain).
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

/** Status duty untuk driver bertipe user (untuk operational: locked=false). */
export function getUserDutyStatus(d?: Driver | null, now: Date = new Date()): UserDutyStatus {
  const type: DriverType = isUserDriver(d) ? "user" : "operational";
  if (type === "operational") return { type, locked: false, onDuty: false, userName: "", userTitle: "" };
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
