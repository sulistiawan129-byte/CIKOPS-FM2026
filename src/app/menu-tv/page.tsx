"use client";

/**
 * /menu-tv — MENU KANTIN KARYAWAN untuk layar TV (tanpa login, layar penuh 16:9).
 * Urutan slide: Sampul → Menu Snack → Menu Meal → Penutup, berganti otomatis.
 * Tiap butir menu menampilkan: nama, kalori (kkal) dan berat (gram).
 * URL: ?slide=cover|snack|meal|closing (mulai di slide tertentu), ?rotate=0 (tanpa rotasi),
 *      ?sec=20 (lama tiap slide, detik), ?date=2026-11-03 (pratinjau minggu lain).
 * Tombol: ← → / spasi (ganti slide), F (layar penuh). Klik layar = slide berikutnya.
 * CATATAN: isi menu masih CONTOH (lib/canteenMenu.ts) sampai ada input menu di Dashboard → Kantin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./menutv.module.css";
import { BRAND } from "@/lib/brand";
import { L, loc } from "@/lib/i18n";
import { addDaysIso, sampleWeek, type MenuItem } from "@/lib/canteenMenu";

type SlideKey = "cover" | "snack" | "meal" | "closing";
const ORDER: SlideKey[] = ["cover", "snack", "meal", "closing"];
const DEFAULT_SEC: Record<SlideKey, number> = { cover: 8, snack: 16, meal: 32, closing: 9 };

const wibToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const dt = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => dt(iso).toLocaleDateString(loc(), { ...o, timeZone: "UTC" });

function periodText(from: string, to: string): string {
  const a = dt(from), b = dt(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear())
    return `${a.getUTCDate()} – ${fmt(to, { day: "numeric", month: "long", year: "numeric" })}`;
  return `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

const Num = ({ it }: { it: MenuItem }) => (
  <div className={s.dishNum}><b>{it.kcal}</b> {L("kkal", "kcal")} · <b>{it.gram}</b> g</div>
);

export default function MenuTv() {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [viewDate, setViewDate] = useState("");
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);
  const [secOverride, setSecOverride] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [idle, setIdle] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // kanvas 1920×1080 diskalakan mengikuti layar
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const key = ORDER[idx];
  const dur = secOverride ?? DEFAULT_SEC[key];
  const go = useCallback((d: number) => setIdx((i) => (i + d + ORDER.length) % ORDER.length), []);

  useEffect(() => {
    if (!auto || !ready) return;
    const t = setTimeout(() => go(1), dur * 1000);
    return () => clearTimeout(t);
  }, [auto, ready, idx, dur, go]);

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

  // sembunyikan kursor setelah diam
  const poke = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 3500);
  }, []);
  useEffect(() => { poke(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; }, [poke]);

  const week = useMemo(() => (viewDate ? sampleWeek(viewDate) : null), [viewDate]);
  if (!ready || !week) return <div className={s.root} />;

  const dates = week.days.map((_, i) => addDaysIso(week.weekStart, i));
  const period = periodText(dates[0], dates[6]);
  const dayName = (iso: string) => fmt(iso, { weekday: "long" });
  const dayDate = (iso: string) => fmt(iso, { day: "numeric", month: "short" });

  const Head = ({ icon, title, sub, meal }: { icon: string; title: string; sub: string; meal?: boolean }) => (
    <div className={s.head}>
      <div className={`${s.headIcon} ${meal ? s.meal : ""}`}>{icon}</div>
      <div><h1 className={s.headTitle}>{title}</h1><p className={s.headSub}>{sub}</p></div>
      <div className={s.headGrow} />
      <div className={s.headPeriod}><small>{L("PERIODE", "PERIOD")}</small><b>{period}</b></div>
    </div>
  );

  const DayHead = ({ i }: { i: number }) => (
    <div className={s.dayHead}>
      <div className={s.dayHeadText}>
        <span className={s.dayName}>{dayName(dates[i])}</span>
        <span className={s.dayDate}>{dates[i] === today ? `★ ${L("HARI INI", "TODAY")} · ` : ""}{dayDate(dates[i])}</span>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`${s.root} ${idle ? s.idle : ""}`} onMouseMove={poke} onClick={() => go(1)}>
      <div className={s.stage} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={s.dotsGrid} />

        {key === "cover" && (
          <section className={`${s.slide} ${s.cover}`} key="cover">
            <div className={s.ring} style={{ width: 1100, height: 1100, left: -380, top: -420 }} />
            <div className={s.ring} style={{ width: 760, height: 760, right: -220, bottom: -300, borderColor: "rgba(52,211,153,.2)" }} />
            <div className={s.kicker}>{BRAND.company} · Facility Management</div>
            <h1 className={s.coverTitle}>{L("MENU KANTIN", "EMPLOYEE")}<br />{L("KARYAWAN", "CANTEEN MENU")}</h1>
            <div className={s.coverRule} />
            <div className={s.period}><small>{L("PERIODE", "PERIOD")}</small><b>{period}</b></div>
            <div className={s.coverChips}>
              <span className={s.chip}><i>🥐</i>Snack</span>
              <span className={s.chip}><i>🍛</i>Meal</span>
            </div>
          </section>
        )}

        {key === "snack" && (
          <section className={s.slide} key="snack">
            <Head icon="🥐" title={L("Menu Snack", "Snack Menu")} sub={L("Sarapan / Snack · 1 menu setiap hari", "Breakfast / Snack · 1 item every day")} />
            <div className={s.days}>
              {week.days.map((d, i) => (
                <div key={i} className={`${s.day} ${dates[i] === today ? s.today : ""}`}>
                  <DayHead i={i} />
                  <div className={s.snackBody}>
                    <div className={s.snackEmoji}>🥐</div>
                    <div className={s.snackName}>{d.snack.name}</div>
                    <div className={s.stats}>
                      <div className={s.stat}><b>{d.snack.kcal}</b><span>{L("kkal", "kcal")}</span></div>
                      <div className={`${s.stat} ${s.g}`}><b>{d.snack.gram}</b><span>{L("gram", "grams")}</span></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {key === "meal" && (
          <section className={s.slide} key="meal">
            <Head meal icon="🍛" title={L("Menu Meal", "Meal Menu")} sub={L("Makan · 3 lauk utama setiap hari + pendamping", "Lunch · 3 main dishes every day + side dishes")} />
            <div className={s.days}>
              {week.days.map((d, i) => (
                <div key={i} className={`${s.day} ${dates[i] === today ? s.today : ""}`}>
                  <DayHead i={i} />
                  <div className={s.mealBody}>
                    <div className={s.sec}>{L("Lauk Utama", "Main Dish")}</div>
                    {([["daging", L("Daging", "Beef"), "#fb7185"], ["ayam", L("Ayam", "Chicken"), "#fbbf24"], ["telur", L("Telur", "Egg"), "#fde68a"]] as const).map(([k, tag, c]) => (
                      <div key={k} className={s.dish} style={{ ["--c" as string]: c }}>
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
                    <div className={s.sideRow}>
                      {d.sides.map((sd, k) => (
                        <div key={k} className={s.side}><div className={s.dishName}>{sd.name}</div><Num it={sd} /></div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className={s.staples}>
              <div className={s.staplesLabel}>{L("Selalu Tersedia", "Always Available")}<small>{L("setiap hari, Senin – Minggu", "every day, Monday – Sunday")}</small></div>
              <div className={s.stapleList}>
                {week.staples.map((st, k) => (
                  <div key={k} className={s.staple}>
                    <div className={s.stapleIcon}>{["🍚", "🌶️", "🍘", "🍉"][k] ?? "🍽️"}</div>
                    <div><div className={s.stapleName}>{st.name}</div><div className={s.stapleNum}><b>{st.kcal}</b> {L("kkal", "kcal")} · <b>{st.gram}</b> g</div></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {key === "closing" && (
          <section className={`${s.slide} ${s.closing}`} key="closing">
            <div className={s.ring} style={{ width: 1000, height: 1000, right: -300, top: -400 }} />
            <div className={s.ring} style={{ width: 700, height: 700, left: -240, bottom: -300, borderColor: "rgba(52,211,153,.2)" }} />
            <div className={s.closeEmoji}>🍽️</div>
            <h1 className={s.closeTitle}>{L("Selamat", "Enjoy")}<br />{L("Menikmati!", "Your Meal!")}</h1>
            <p className={s.closeSub}>{L("Ambil secukupnya, habiskan makananmu — bersama kita kurangi sisa makanan.", "Take what you need, finish your plate — together we reduce food waste.")}</p>
            <div className={s.closeMeta}>{BRAND.company} · {period}</div>
          </section>
        )}
      </div>

      {auto && <div key={`${idx}-${dur}`} className={s.progress} style={{ animationDuration: `${dur}s` }} />}
      <div className={s.nav} onClick={(e) => e.stopPropagation()}>
        {ORDER.map((k, i) => <button key={k} type="button" aria-label={k} className={`${s.navDot} ${i === idx ? s.on : ""}`} onClick={() => setIdx(i)} />)}
      </div>
      <div className={s.tools} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={s.tool} onClick={() => setAuto((a) => !a)}>{auto ? "⏸" : "▶"}</button>
        <button type="button" className={s.tool} onClick={toggleFs}>⛶ {L("Layar penuh", "Full screen")}</button>
      </div>
    </div>
  );
}
