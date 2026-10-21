"use client";

/* Komponen bersama aplikasi lapangan (Driver & TGA): navigasi bawah, tarik-untuk-muat-ulang,
   getar, layar sukses, skeleton, status koneksi. Gaya di fieldapp.module.css. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./fieldapp.module.css";

/** Getar singkat (HP Android). Diabaikan di perangkat yang tidak mendukung. */
export function haptic(pattern: number | number[] = 12) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch { /* abaikan */ }
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const net = () => setOnline(navigator.onLine);
    net();
    window.addEventListener("online", net); window.addEventListener("offline", net);
    return () => { window.removeEventListener("online", net); window.removeEventListener("offline", net); };
  }, []);
  return online;
}

/** Tarik layar ke bawah dari paling atas untuk memuat ulang (seperti aplikasi native). */
export function usePullRefresh(onRefresh: () => Promise<unknown> | void, enabled = true) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    if (!enabled) return;
    let startY: number | null = null;
    let dist = 0;
    const blocked = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-nopull]");
    const down = (e: TouchEvent) => { startY = window.scrollY <= 0 && !blocked(e.target) ? e.touches[0].clientY : null; dist = 0; };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      dist = Math.max(0, Math.min(120, (e.touches[0].clientY - startY) * 0.5));
      setPull(dist);
    };
    const up = async () => {
      if (startY === null) return;
      startY = null;
      if (dist >= 64) {
        haptic(15);
        setBusy(true); setPull(56);
        try { await cb.current(); } finally { setBusy(false); setPull(0); }
      } else setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [enabled]);
  return { pull, busy };
}

export function PullIndicator({ pull, busy }: { pull: number; busy: boolean }) {
  if (!pull && !busy) return null;
  return (
    <div className={s.pull} style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 56) }} aria-hidden>
      <span className={busy ? s.spin : undefined} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }}>⟳</span>
    </div>
  );
}

export function NavBtn({ on, icon, label, badge, onClick }: { on: boolean; icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={`${s.navBtn} ${on ? s.navOn : ""}`} onClick={() => { haptic(8); onClick(); }} aria-current={on ? "page" : undefined}>
      <span>{icon}{badge ? <em className={s.navBadge}>{badge > 99 ? "99+" : badge}</em> : null}</span><small>{label}</small>
    </button>
  );
}

export function BottomNav({ left, right, fab }: { left: ReactNode; right: ReactNode; fab: { label: string; icon?: ReactNode; onClick: () => void } }) {
  return (
    <nav className={s.nav}>
      {left}
      <button type="button" className={s.fab} onClick={() => { haptic(15); fab.onClick(); }} aria-label={fab.label}>
        <span>{fab.icon ?? "＋"}</span>
      </button>
      {right}
    </nav>
  );
}

export function Skeleton() {
  return <div className={s.stack}><div className={`${s.skel} ${s.skelBig}`} /><div className={s.skel} /><div className={s.skel} /><div className={s.skel} /></div>;
}

/** Layar sukses dengan centang beranimasi + konfeti. */
export function SuccessScreen({ title, text, children, primary, secondary }: {
  title: string; text: string; children?: ReactNode;
  primary?: { label: string; onClick: () => void }; secondary: { label: string; onClick: () => void };
}) {
  useEffect(() => { haptic([20, 40, 20]); }, []);
  return (
    <div className={s.successWrap}>
      <div className={s.confetti}>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      <div className={s.successCard}>
        <div className={s.check}><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg></div>
        <h2>{title}</h2>
        <p>{text}</p>
        {children}
        {primary && <button type="button" className={s.primaryBtn} onClick={primary.onClick}>{primary.label}</button>}
        <button type="button" className={s.ghostBtn} onClick={secondary.onClick}>{secondary.label}</button>
      </div>
    </div>
  );
}

/** Lembar bawah (bottom sheet) dengan latar redup; ketuk latar untuk menutup. */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label?: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className={s.sheetWrap} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={label} data-nopull>
        <div className={s.grab} />
        {children}
      </div>
    </div>
  );
}

export function SunMoon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  );
}
