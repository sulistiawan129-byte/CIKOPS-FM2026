"use client";

/**
 * /menu-tv — MENU KANTIN KARYAWAN untuk layar TV (tanpa login, layar penuh 16:9, murni tayangan otomatis).
 * Gaya restoran fine-dining dengan palet CIKOPS. Urutan:
 *   Sampul → Menu Snack → Menu Meal → Menu Hari Ini → Penutup (berganti otomatis, berulang).
 * Tiap butir menu menampilkan: nama, kalori (kkal) dan berat (gram).
 * URL: ?slide=cover|snack|meal|today|closing (mulai di slide tertentu), ?rotate=0 (tanpa rotasi),
 *      ?sec=20 (lama tiap slide, detik), ?date=2026-11-03 (pratinjau minggu lain).
 * Operator: ← → ganti slide, F layar penuh (layar tidak merespons klik/sentuhan).
 * CATATAN: isi menu masih CONTOH (lib/canteenMenu.ts) sampai ada input menu di Dashboard → Kantin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./menutv.module.css";
import { BRAND } from "@/lib/brand";
import { L, loc } from "@/lib/i18n";
import { addDaysIso, sampleWeek, type MenuItem, type WeeklyMenu } from "@/lib/canteenMenu";

type SlideKey = "cover" | "snack" | "meal" | "today" | "closing";
const ORDER: SlideKey[] = ["cover", "snack", "meal", "today", "closing"];
const DEFAULT_SEC: Record<SlideKey, number> = { cover: 10, snack: 18, meal: 34, today: 22, closing: 10 };

const wibToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const dt = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => dt(iso).toLocaleDateString(loc(), { ...o, timeZone: "UTC" });

function periodText(from: string, to: string): string {
  const a = dt(from), b = dt(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear())
    return `${a.getUTCDate()} – ${fmt(to, { day: "numeric", month: "long", year: "numeric" })}`;
  return `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

/* ── partikel debu emas (deterministik, dihitung sekali) ── */
const DUST = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 46 }, () => ({
    left: rnd() * 100, size: 3 + rnd() * 7, dur: 14 + rnd() * 18, delay: -rnd() * 30, o: 0.35 + rnd() * 0.5, sx: (rnd() - 0.5) * 140,
  }));
})();

/* ── ornamen ── */
const Corner = ({ cls }: { cls: string }) => (
  <svg className={`${s.corner} ${cls}`} viewBox="0 0 74 74" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path d="M4 70V18C4 10 10 4 18 4H70" /><path d="M14 70V26C14 19 19 14 26 14H70" opacity=".45" />
    <path d="M30 30l6 6-6 6-6-6z" fill="currentColor" stroke="none" />
  </svg>
);
const Ornament = ({ w = 360 }: { w?: number }) => (
  <svg className={s.orn} width={w} height="22" viewBox="0 0 360 22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path d="M0 11H146M214 11H360" opacity=".7" /><path d="M180 2l9 9-9 9-9-9z" fill="currentColor" stroke="none" />
    <circle cx="156" cy="11" r="2.6" fill="currentColor" stroke="none" /><circle cx="204" cy="11" r="2.6" fill="currentColor" stroke="none" />
    <path d="M130 11l-8-5M130 11l-8 5M230 11l8-5M230 11l8 5" opacity=".7" />
  </svg>
);
const Cloche = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="32" cy="12" r="3.4" /><path d="M12 46C12 29 21 19 32 19s20 10 20 27" /><path d="M5 46h54M9 52h46" /><path d="M19 38c1-6 5-10 10-11" opacity=".6" />
  </svg>
);
const Cup = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 28h34v10c0 9-7 15-17 15s-17-6-17-15z" /><path d="M46 31h3.5c4.5 0 4.5 9 0 9H45" /><path d="M8 57h42" /><path d="M20 34c2 4 5 6 9 6" opacity=".5" />
    <path className={s.steam} d="M22 22c-4-4 4-7 0-12" /><path className={`${s.steam} ${s.steam2}`} d="M30 22c-4-4 4-7 0-12" /><path className={`${s.steam} ${s.steam3}`} d="M38 22c-4-4 4-7 0-12" />
  </svg>
);

function CountUp({ to, delay = 0, dur = 1100 }: { to: number; delay?: number; dur?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, dur]);
  return <>{v}</>;
}

const kk = () => L("kkal", "kcal");
const Num = ({ it }: { it: MenuItem }) => <div className={s.dishNum}><b>{it.kcal}</b> {kk()} · <b>{it.gram}</b> g</div>;
const idxStyle = (i: number, b = 0) => ({ ["--i" as string]: i, ["--b" as string]: `${b}ms` }) as React.CSSProperties;

interface Ctx { week: WeeklyMenu; dates: string[]; today: string; period: string }

/* ═════════ SLIDES ═════════ */
function Cover({ c }: { c: Ctx }) {
  return (
    <section className={`${s.slide} ${s.cover}`}>
      <div className={s.rays} />
      <div className={`${s.logoWrap} ${s.rise}`} style={idxStyle(0)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="CIKOPS-FM" />
      </div>
      <div className={`${s.label} ${s.coverKicker} ${s.rise}`} style={idxStyle(1)}>{BRAND.company} · Facility Management</div>
      <h1 className={`${s.coverMenu} ${s.goldText} ${s.rise}`} style={idxStyle(2)}>{L("Menu Kantin", "Canteen Menu")}</h1>
      <div className={`${s.coverIt} ${s.goldText} ${s.rise}`} style={idxStyle(3)}>{L("Karyawan", "for Employees")}</div>
      <div className={`${s.coverOrn} ${s.fade}`} style={idxStyle(5)}><Ornament /></div>
      <div className={`${s.coverPeriod} ${s.rise}`} style={idxStyle(6)}><small>{L("Periode", "Period")}</small><b>{c.period}</b></div>
      <div className={`${s.coverCourses} ${s.rise}`} style={idxStyle(8)}>Snack <span>✦</span> Meal</div>
    </section>
  );
}

function Snack({ c }: { c: Ctx }) {
  const max = Math.max(...c.week.days.map((d) => d.snack.kcal));
  return (
    <section className={`${s.slide} ${s.snack}`}>
      <div className={s.snackLeft}>
        <div className={`${s.cupWrap} ${s.fade}`} style={idxStyle(0)}><Cup /></div>
        <h1 className={`${s.snackTitle} ${s.rise}`} style={idxStyle(1)}>{L("Menu", "Snack")}<em className={s.goldText}>{L("Snack", "Menu")}</em></h1>
        <p className={`${s.snackSub} ${s.rise}`} style={idxStyle(3)}>{L("Sarapan & camilan — satu hidangan istimewa setiap hari.", "Breakfast & bites — one signature treat every day.")}</p>
        <div className={`${s.snackPeriod} ${s.rise}`} style={idxStyle(4)}><span className={s.label}>{L("Periode", "Period")}</span><b>{c.period}</b></div>
      </div>
      <div className={s.snackList}>
        {c.week.days.map((d, i) => (
          <div key={i} className={`${s.sRow} ${s.rise} ${c.dates[i] === c.today ? s.today : ""}`} style={idxStyle(i + 2)}>
            <div className={s.sDay}>{fmt(c.dates[i], { weekday: "long" })}
              {c.dates[i] === c.today ? <span><br /><span className={s.sNow}>{L("HARI INI", "TODAY")}</span></span> : <small>{fmt(c.dates[i], { day: "numeric", month: "short" })}</small>}
            </div>
            <div className={s.sName}>{d.snack.name}</div>
            <div className={s.sNum}>
              <div><b><CountUp to={d.snack.kcal} delay={600 + i * 90} /></b><span>{kk()}</span></div>
              <div className="g"><b style={{ color: "var(--sky)" }}><CountUp to={d.snack.gram} delay={700 + i * 90} /></b><span>g</span></div>
            </div>
            <div className={s.sBar}><i style={{ ...idxStyle(i + 2), width: `${Math.round((d.snack.kcal / max) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

const TAGS = (): [keyof WeeklyMenu["days"][number]["main"], string, string][] => [
  ["daging", L("Daging", "Beef"), "#ff9d8a"], ["ayam", L("Ayam", "Chicken"), "#f6c667"], ["telur", L("Telur", "Egg"), "#ffeaa8"],
];

function Meal({ c }: { c: Ctx }) {
  return (
    <section className={s.slide}>
      <div className={s.head}>
        <Cloche className={`${s.headIcon} ${s.fade}`} />
        <div className={s.rise} style={idxStyle(0)}>
          <h1 className={s.headTitle}>{L("Menu", "Meal")} <em className={s.goldText}>{L("Meal", "Menu")}</em></h1>
          <p className={s.headSub}>{L("Tiga lauk utama setiap hari, dengan pendamping pilihan.", "Three main dishes every day, with selected sides.")}</p>
        </div>
        <div className={s.headGrow} />
        <div className={`${s.headPeriod} ${s.rise}`} style={idxStyle(1)}><span className={s.label}>{L("Periode", "Period")}</span><b>{c.period}</b></div>
      </div>
      <div className={s.days}>
        {c.week.days.map((d, i) => (
          <div key={i} className={`${s.day} ${s.rise} ${c.dates[i] === c.today ? s.today : ""}`} style={idxStyle(i + 2)}>
            <div className={s.dayHead}>
              <span className={s.dayName}>{fmt(c.dates[i], { weekday: "long" })}</span>
              <span className={s.dayDate}>{c.dates[i] === c.today ? `★ ${L("Hari ini", "Today")} · ` : ""}{fmt(c.dates[i], { day: "numeric", month: "short" })}</span>
            </div>
            <div className={s.mealBody}>
              <div className={s.sec}>{L("Lauk Utama", "Main Dish")}</div>
              {TAGS().map(([k, tag, col]) => (
                <div key={k} className={s.dish} style={{ ["--c" as string]: col }}>
                  <div className={s.dishName}>{d.main[k].name}</div>
                  <div className={s.dishFoot}><Num it={d.main[k]} /><span className={s.dishTag}>{tag}</span></div>
                </div>
              ))}
              {d.special ? (
                <div className={s.special}>
                  <div className={s.dishTag}>★ Special</div>
                  <div className={s.dishName}>{d.special.name}</div>
                  <Num it={d.special} />
                </div>
              ) : <div className={s.noSpecial}>—</div>}
              <div className={s.sec}>{L("Pendamping", "Sides")}</div>
              {d.sides.map((sd, k) => (
                <div key={k} className={s.side}><div className={s.dishName}>{sd.name}</div><Num it={sd} /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={`${s.staples} ${s.rise}`} style={idxStyle(9)}>
        <div className={s.staplesLabel}>{L("Selalu Tersedia", "Always Served")}<small>{L("setiap hari, Senin – Minggu", "every day, Monday – Sunday")}</small></div>
        <div className={s.stapleList}>
          {c.week.staples.map((st, k) => (
            <div key={k} className={s.staple}>
              <div className={s.stapleIcon}>{["N", "S", "K", "B"][k] ?? "•"}</div>
              <div><div className={s.stapleName}>{st.name}</div><div className={s.stapleNum}><b>{st.kcal}</b> {kk()} · <b>{st.gram}</b> g</div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const MRow = ({ tag, col, it, i, sp }: { tag?: string; col?: string; it: MenuItem; i: number; sp?: boolean }) => (
  <div className={`${s.mRow} ${sp ? s.sp : ""} ${s.rise}`} style={{ ...idxStyle(i, 400), ["--c" as string]: col ?? "var(--gold)" } as React.CSSProperties}>
    {tag !== undefined && <span className={s.mTag}>{tag}</span>}
    <span className={s.mName}>{it.name}</span><span className={s.mLead} />
    <span className={s.mNum}><b><CountUp to={it.kcal} delay={500 + i * 70} /></b> {kk()} · {it.gram} g</span>
  </div>
);

function TodaySlide({ c }: { c: Ctx }) {
  const i = Math.max(0, c.dates.indexOf(c.today));
  const d = c.week.days[i];
  const iso = c.dates[i];
  let n = 0;
  return (
    <section className={`${s.slide} ${s.todaySlide}`}>
      <div className={s.rays} style={{ opacity: 0.3 }} />
      <div className={s.tLeft}>
        <div className={`${s.label} ${s.tKicker} ${s.rise}`} style={idxStyle(0)}>{c.dates[i] === c.today ? L("Menu Hari Ini", "Today's Menu") : L("Menu Hari", "Menu of")}</div>
        <div className={`${s.tDay} ${s.goldText} ${s.rise}`} style={idxStyle(1)}>{fmt(iso, { weekday: "long" })}</div>
        <div className={`${s.coverOrn} ${s.fade}`} style={idxStyle(3)}><Ornament w={300} /></div>
        <div className={`${s.tDate} ${s.rise}`} style={idxStyle(4)}>{fmt(iso, { day: "numeric", month: "long", year: "numeric" })}</div>
        <div className={`${s.tNote} ${s.rise}`} style={idxStyle(5)}>{L("Selamat datang di kantin — nikmati hidangan pilihan hari ini.", "Welcome to the canteen — enjoy today's selection.")}</div>
      </div>
      <div className={s.tCols}>
        <div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(2)}><h3>I. {L("Snack", "Snack")}<span>{L("SARAPAN", "BREAKFAST")}</span></h3>
            <MRow it={d.snack} i={n++} />
          </div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(3)}><h3>II. {L("Hidangan Utama", "Main Dishes")}<span>{L("3 PILIHAN", "3 CHOICES")}</span></h3>
            {TAGS().map(([k, tag, col]) => <MRow key={k} tag={tag} col={col} it={d.main[k]} i={n++} />)}
          </div>
          {d.special && (
            <div className={`${s.course} ${s.rise}`} style={idxStyle(4)}><h3>III. Special<span>{L("HARI INI SAJA", "TODAY ONLY")}</span></h3>
              <MRow sp it={d.special} i={n++} />
            </div>
          )}
        </div>
        <div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(5)}><h3>{d.special ? "IV" : "III"}. {L("Pendamping", "Sides")}<span>{L("PELENGKAP", "ACCOMPANIMENT")}</span></h3>
            {d.sides.map((sd, k) => <MRow key={k} it={sd} i={n++} />)}
          </div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(6)}><h3>{d.special ? "V" : "IV"}. {L("Selalu Tersedia", "Always Served")}<span>{L("SETIAP HARI", "EVERY DAY")}</span></h3>
            {c.week.staples.map((st, k) => <MRow key={k} it={st} i={n++} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function Closing({ c }: { c: Ctx }) {
  return (
    <section className={`${s.slide} ${s.closing}`}>
      <div className={s.rays} />
      <div className={`${s.coverOrn} ${s.fade}`} style={idxStyle(0)}><Ornament w={460} /></div>
      <h1 className={`${s.closeA} ${s.goldText} ${s.rise}`} style={idxStyle(1)}>{L("Selamat", "Bon")}</h1>
      <div className={`${s.closeB} ${s.goldText} ${s.rise}`} style={idxStyle(2)}>{L("Menikmati", "Appétit")}</div>
      <p className={`${s.closeSub} ${s.rise}`} style={idxStyle(4)}>{L("Ambil secukupnya, habiskan hidanganmu — bersama kita kurangi sisa makanan.", "Take what you need, finish your plate — together we reduce food waste.")}</p>
      <div className={`${s.closeMeta} ${s.label} ${s.rise}`} style={idxStyle(6)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" /><span>{BRAND.company} · {c.period}</span>
      </div>
    </section>
  );
}

/* ═════════ HALAMAN ═════════ */
export default function MenuTv() {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [viewDate, setViewDate] = useState("");
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0); // naik tiap pergantian slide → memicu ulang sapuan emas
  const [auto, setAuto] = useState(true);
  const [secOverride, setSecOverride] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = wibToday();
    setToday(t);
    const d = q.get("date");
    setViewDate(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : t);
    const sl = q.get("slide");
    if (sl) { const i = /^\d$/.test(sl) ? Number(sl) : ORDER.indexOf(sl as SlideKey); if (i >= 0 && i < ORDER.length) setIdx(i); }
    if (q.get("rotate") === "0") setAuto(false);
    const sec = Number(q.get("sec")); if (sec > 0) setSecOverride(sec);
    setReady(true);
  }, []);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const key = ORDER[idx];
  const dur = secOverride ?? DEFAULT_SEC[key];
  const go = useCallback((d: number) => { setIdx((i) => (i + d + ORDER.length) % ORDER.length); setTick((t) => t + 1); }, []);

  useEffect(() => {
    if (!auto || !ready) return;
    const t = setTimeout(() => go(1), dur * 1000);
    return () => clearTimeout(t);
  }, [auto, ready, idx, dur, go]);

  // pulihkan tanggal otomatis bila layar menyala melewati tengah malam
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => { const n = wibToday(); setToday((o) => (o === n ? o : n)); }, 60_000);
    return () => clearInterval(t);
  }, [ready]);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "f" || e.key === "F") toggleFs();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleFs]);

  const week = useMemo(() => (viewDate ? sampleWeek(viewDate) : null), [viewDate]);
  if (!ready || !week) return <div className={s.root} />;

  const dates = week.days.map((_, i) => addDaysIso(week.weekStart, i));
  const c: Ctx = { week, dates, today, period: periodText(dates[0], dates[6]) };

  return (
    <div ref={rootRef} className={s.root}>
      <div className={s.stage} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={s.glowPulse} style={{ width: 700, height: 700, left: -200, top: -200, background: "rgba(45,91,255,.45)" }} />
        <div className={s.glowPulse} style={{ width: 620, height: 620, right: -180, bottom: -220, background: "rgba(15,181,164,.38)", animationDelay: "-4s" }} />
        <div className={s.dust}>
          {DUST.map((p, i) => (
            <i key={i} style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, ["--o" as string]: p.o, ["--sx" as string]: `${p.sx}px` }} />
          ))}
        </div>
        <div className={s.vignette} />
        <div className={s.frame} />
        <Corner cls={s.cTL} /><Corner cls={s.cTR} /><Corner cls={s.cBL} /><Corner cls={s.cBR} />

        <div key={`${key}-${tick}`} style={{ position: "absolute", inset: 0 }}>
          {key === "cover" && <Cover c={c} />}
          {key === "snack" && <Snack c={c} />}
          {key === "meal" && <Meal c={c} />}
          {key === "today" && <TodaySlide c={c} />}
          {key === "closing" && <Closing c={c} />}
          <div className={s.wipe} />
        </div>
      </div>

      {auto && <div key={`${idx}-${tick}-${dur}`} className={s.progress} style={{ animationDuration: `${dur}s` }} />}
      <div className={s.nav}>
        {ORDER.map((k, i) => <span key={k} className={`${s.navDot} ${i === idx ? s.on : ""}`} />)}
      </div>
    </div>
  );
}
