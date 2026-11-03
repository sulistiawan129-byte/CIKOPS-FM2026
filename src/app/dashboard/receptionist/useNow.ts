"use client";

import { useEffect, useState } from "react";

/** Waktu sekarang (ms) yang diperbarui berkala — untuk jam hidup & lama kunjungan yang berjalan. */
export function useNow(everyMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Angka yang naik pelan-pelan ke nilai baru (count-up). Menghormati prefers-reduced-motion. */
export function useCountUp(target: number, ms = 750): number {
  const [val, setVal] = useState(target);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || ms <= 0) { setVal(target); return; }
    let raf = 0;
    const from = val;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(from + (target - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return val;
}
