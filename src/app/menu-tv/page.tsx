"use client";

/**
 * /menu-tv — MENU KANTIN KARYAWAN untuk layar TV (tanpa login, layar penuh 16:9, murni tayangan otomatis).
 * Gaya restoran fine-dining dengan palet CIKOPS. Urutan:
 *   Sampul → Menu Snack → Menu Meal → Menu Hari Ini → Penutup (berganti otomatis, berulang).
 * Tiap butir menu menampilkan: nama, kalori (kkal) dan berat (gram).
 * URL: ?slide=cover|snack|meal|today|closing (mulai di slide tertentu), ?rotate=0 (tanpa rotasi),
 *      ?sec=20 (lama tiap slide, detik), ?date=2026-11-03 (pratinjau minggu lain).
 * Operator: ← → ganti slide, F layar penuh (layar tidak merespons klik/sentuhan).
 * Data: diisi di Dashboard → Kantin → Menu TV, dibaca lewat fungsi publik canteen_menu_public (segar tiap 5 menit).
 *      ?sample=1 menampilkan menu contoh (untuk uji tampilan).
 *      ?today=2026-11-04 berpura-pura hari itu adalah hari ini (pratinjau slide Menu Hari Ini).
 *      ?safe=3 mengecilkan tampilan 3% dari tepi (untuk TV yang memotong tepi layar).
 * Layar yang menyala terus: minggu & hari ini mengikuti jam (WIB), data dibaca ulang tiap 5 menit,
 * halaman dimuat ulang otomatis tiap 03:30 WIB, dan bila jaringan putus layar tetap menampilkan menu terakhir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./menutv.module.css";
import { BRAND } from "@/lib/brand";
import { L, loc } from "@/lib/i18n";
import { addDaysIso, hasItem, mondayOf, sampleWeek, snackTotal, type MenuItem, type WeeklyMenu } from "@/lib/canteenMenu";
import { getPublicMenu } from "@/lib/canteenMenuApi";

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
const Num = ({ it }: { it: MenuItem }) => <div className={s.dishNum}><b>{it.kcal || "–"}</b> {kk()} · <b>{it.gram || "–"}</b> g</div>;
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
  return (
    <section className={s.slide}>
      <div className={s.head}>
        <div className={`${s.headIcon} ${s.fade}`}><Cup /></div>
        <div className={s.rise} style={idxStyle(0)}>
          <h1 className={s.headTitle}>{L("Menu", "Snack")} <em className={s.goldText}>{L("Snack", "Menu")}</em></h1>
          <p className={s.headSub}>{L("Snack Breakfast, Snack Shift 2 & Shift 3 — beberapa komponen setiap hari.", "Snack Breakfast, Shift 2 & Shift 3 — several parts every day.")}</p>
        </div>
        <div className={s.headGrow} />
        <div className={`${s.headPeriod} ${s.rise}`} style={idxStyle(1)}><span className={s.label}>{L("Periode", "Period")}</span><b>{c.period}</b></div>
      </div>
      <div className={s.days}>
        {c.week.days.map((d, i) => {
          const items = d.snacks.filter(hasItem);
          return (
            <div key={i} className={`${s.day} ${s.rise} ${c.dates[i] === c.today ? s.today : ""}`} style={idxStyle(i + 2)}>
              <div className={s.dayHead}>
                <span className={s.dayName}>{fmt(c.dates[i], { weekday: "long" })}</span>
                <span className={s.dayDate}>{c.dates[i] === c.today ? `★ ${L("Hari ini", "Today")} · ` : ""}{fmt(c.dates[i], { day: "numeric", month: "short" })}</span>
              </div>
              <div className={s.snackBody}>
                {items.length === 0 && <div className={s.sEmpty}>—</div>}
                {items.map((sn, k) => (
                  <div key={k} className={`${s.sItem} ${k === 0 ? s.sMain : ""}`}>
                    <div className={s.sItemName}>{sn.name}</div>
                    <div className={s.sItemNum}><b>{sn.kcal || "–"}</b> {kk()} · <b>{sn.gram || "–"}</b> g</div>
                  </div>
                ))}
              </div>
              {items.length > 0 && (
                <div className={s.sTotal}><span>{L("Total snack", "Snack total")}</span><b><CountUp to={snackTotal(d)} delay={700 + i * 90} /></b><em>{kk()}</em></div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Lauk utama mengikuti menu vendor: A Ayam · B Daging/Ikan · C Telur */
const TAGS = (): [keyof WeeklyMenu["days"][number]["main"], string, string][] => [
  ["ayam", "A", "#f6c667"], ["daging", "B", "#ff9d8a"], ["telur", "C", "#ffeaa8"],
];

/** Label lengkap untuk slide Menu Hari Ini */
const TAGS_FULL = (): [keyof WeeklyMenu["days"][number]["main"], string, string][] => [
  ["ayam", L("A · Ayam", "A · Chicken"), "#f6c667"], ["daging", L("B · Daging/Ikan", "B · Beef/Fish"), "#ff9d8a"], ["telur", L("C · Telur", "C · Egg"), "#ffeaa8"],
];

function Meal({ c }: { c: Ctx }) {
  return (
    <section className={s.slide}>
      <div className={s.head}>
        <Cloche className={`${s.headIcon} ${s.fade}`} />
        <div className={s.rise} style={idxStyle(0)}>
          <h1 className={s.headTitle}>{L("Menu", "Meal")} <em className={s.goldText}>{L("Meal", "Menu")}</em></h1>
          <p className={s.headSub}>{L("Lauk utama: A Ayam · B Daging / Ikan · C Telur — dengan sayur, pendamping, dan buah.", "Main dishes: A Chicken · B Beef / Fish · C Egg — with veg, sides and fruit.")}</p>
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
                  <i className={s.abc}>{tag}</i>
                  {hasItem(d.main[k]) ? (
                    <>
                      <div className={s.dishName}>{d.main[k].name}</div>
                      <Num it={d.main[k]} />
                    </>
                  ) : <div className={s.dishName} style={{ opacity: 0.3 }}>—</div>}
                </div>
              ))}
              {hasItem(d.special) ? (
                <div className={s.special}>
                  <div className={s.dishTag}>★ Special</div>
                  <div className={s.dishName}>{d.special.name}</div>
                  <Num it={d.special} />
                </div>
              ) : <div className={s.noSpecial}>—</div>}
              <div className={s.sec}>{L("Pendamping", "Sides")}</div>
              {d.sides.filter(hasItem).map((sd, k) => (
                <div key={k} className={s.side}><div className={s.dishName}>{sd.name}</div><Num it={sd} /></div>
              ))}
              {hasItem(d.fruit) && (
                <div className={s.fruit}>
                  <div className={s.dishFoot}><span className={s.dishTag}>{L("Buah", "Fruit")}</span><Num it={d.fruit} /></div>
                  <div className={s.dishName}>{d.fruit.name}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={`${s.staples} ${s.rise}`} style={idxStyle(9)}>
        <div className={s.staplesLabel}>{L("Selalu Tersedia", "Always Served")}<small>{L("Senin – Minggu", "Monday – Sunday")}</small></div>
        <div className={s.stapleList}>
          {c.week.staples.filter(hasItem).slice(0, 3).map((st, k) => (
            <div key={k} className={s.staple}>
              <div className={s.stapleIcon}>{["N", "S", "K"][k] ?? "•"}</div>
              <div><div className={s.stapleName}>{st.name}</div><div className={s.stapleNum}><b>{st.kcal || "–"}</b> {kk()} · <b>{st.gram || "–"}</b> g</div></div>
            </div>
          ))}
          <div className={`${s.staple} ${s.fruitNote}`}>
            <div className={s.stapleIcon}>B</div>
            <div><div className={s.stapleName}>{L("Buah", "Fruit")}</div><div className={s.stapleNum}>{L("berbeda setiap hari — lihat tiap kolom", "changes daily — see each column")}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

const MRow = ({ tag, col, it, i, sp }: { tag?: string; col?: string; it: MenuItem; i: number; sp?: boolean }) => (
  <div className={`${s.mRow} ${sp ? s.sp : ""} ${s.rise}`} style={{ ...idxStyle(i, 400), ["--c" as string]: col ?? "var(--gold)" } as React.CSSProperties}>
    {tag !== undefined && <span className={s.mTag}>{tag}</span>}
    <span className={s.mName}>{it.name}</span><span className={s.mLead} />
    <span className={s.mNum}><b>{it.kcal ? <CountUp to={it.kcal} delay={500 + i * 70} /> : "–"}</b> {kk()} · {it.gram || "–"} g</span>
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
          <div className={`${s.course} ${s.rise}`} style={idxStyle(2)}><h3>I. {L("Snack", "Snack")}<span>{L("SHIFT 1 · 2 · 3", "SHIFT 1 · 2 · 3")}</span></h3>
            {d.snacks.some(hasItem) ? d.snacks.filter(hasItem).map((sn, k) => <MRow key={k} it={sn} i={n++} />) : <div className={s.mRow} style={{ opacity: 0.35 }}><span className={s.mName}>—</span></div>}
          </div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(3)}><h3>II. {L("Hidangan Utama", "Main Dishes")}<span>{L("PILIHAN LAUK", "CHOICES")}</span></h3>
            {TAGS_FULL().map(([k, tag, col]) => hasItem(d.main[k]) ? <MRow key={k} tag={tag} col={col} it={d.main[k]} i={n++} /> : null)}
          </div>
          {hasItem(d.special) && (
            <div className={`${s.course} ${s.rise}`} style={idxStyle(4)}><h3>III. Special<span>{L("HARI INI SAJA", "TODAY ONLY")}</span></h3>
              <MRow sp it={d.special} i={n++} />
            </div>
          )}
        </div>
        <div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(5)}><h3>{hasItem(d.special) ? "IV" : "III"}. {L("Pendamping", "Sides")}<span>{L("PELENGKAP", "ACCOMPANIMENT")}</span></h3>
            {d.sides.filter(hasItem).map((sd, k) => <MRow key={k} it={sd} i={n++} />)}
          </div>
          <div className={`${s.course} ${s.rise}`} style={idxStyle(6)}><h3>{hasItem(d.special) ? "V" : "IV"}. {L("Pelengkap", "On the Side")}<span>{L("SETIAP HARI", "EVERY DAY")}</span></h3>
            {hasItem(d.fruit) && <MRow tag={L("Buah", "Fruit")} col="#ff9ec4" it={d.fruit} i={n++} />}
            {c.week.staples.filter(hasItem).map((st, k) => <MRow key={k} it={st} i={n++} />)}
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

function EmptySlide({ period, error }: { period: string; error: boolean }) {
  return (
    <section className={`${s.slide} ${s.cover}`}>
      <div className={s.rays} />
      <div className={`${s.logoWrap} ${s.rise}`} style={idxStyle(0)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="CIKOPS-FM" />
      </div>
      <div className={`${s.label} ${s.coverKicker} ${s.rise}`} style={idxStyle(1)}>{BRAND.company} · Facility Management</div>
      <h1 className={`${s.coverMenu} ${s.goldText} ${s.rise}`} style={{ ...idxStyle(2), fontSize: 120 }}>{L("Menu Kantin", "Canteen Menu")}</h1>
      <div className={`${s.coverOrn} ${s.fade}`} style={idxStyle(4)}><Ornament /></div>
      <div className={`${s.coverCourses} ${s.rise}`} style={idxStyle(5)}>{error ? L("Menu sedang dimuat — mohon tunggu sebentar.", "Loading the menu — please wait a moment.") : L("Menu minggu ini segera hadir.", "This week's menu is coming soon.")}</div>
      <div className={`${s.coverPeriod} ${s.rise}`} style={{ ...idxStyle(6), marginTop: 30, fontSize: 30 }}><small>{L("Periode", "Period")}</small><b>{period}</b></div>
    </section>
  );
}

/* ═════════ HALAMAN ═════════ */
export default function MenuTv() {
  const [ready, setReady] = useState(false);
  const [todayLive, setToday] = useState("");
  const [todayParam, setTodayParam] = useState<string | null>(null); // ?today= (pratinjau hari tertentu)
  const [dateParam, setDateParam] = useState<string | null>(null); // ?date= (pratinjau); bila kosong → ikut hari ini
  const [safe, setSafe] = useState(0); // ?safe=N → kecilkan N% dari tepi (TV yang memotong tepi layar / overscan)
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0); // naik tiap pergantian slide → memicu ulang sapuan emas
  const [auto, setAuto] = useState(true);
  const [secOverride, setSecOverride] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [week, setWeek] = useState<WeeklyMenu | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [sample, setSample] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasData = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = wibToday();
    setToday(t);
    const d = q.get("date");
    setDateParam(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    const tp = q.get("today"); setTodayParam(tp && /^\d{4}-\d{2}-\d{2}$/.test(tp) ? tp : null);
    const sf = Number(q.get("safe")); if (sf > 0) setSafe(Math.min(10, sf));
    const sl = q.get("slide");
    if (sl) { const i = /^\d$/.test(sl) ? Number(sl) : ORDER.indexOf(sl as SlideKey); if (i >= 0 && i < ORDER.length) setIdx(i); }
    if (q.get("rotate") === "0") setAuto(false);
    if (q.get("sample") === "1") setSample(true);
    const sec = Number(q.get("sec")); if (sec > 0) setSecOverride(sec);
    setReady(true);
  }, []);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080) * (1 - safe / 100));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [safe]);

  const key = ORDER[idx];
  const dur = secOverride ?? DEFAULT_SEC[key];
  const go = useCallback((d: number) => { setIdx((i) => (i + d + ORDER.length) % ORDER.length); setTick((t) => t + 1); }, []);

  useEffect(() => {
    if (!auto || !ready) return;
    const t = setTimeout(() => go(1), dur * 1000);
    return () => clearTimeout(t);
  }, [auto, ready, idx, dur, go]);

  // layar menyala berhari-hari: perbarui "hari ini" tiap menit (minggu & sorotan hari ikut berganti tengah malam)
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => { const n = wibToday(); setToday((o) => (o === n ? o : n)); }, 30_000);
    return () => clearInterval(t);
  }, [ready]);

  // muat ulang sekali sehari (03:30 WIB): ambil versi aplikasi terbaru setelah deploy & bersihkan memori browser TV
  useEffect(() => {
    if (!ready) return;
    const now = Date.now() + 7 * 3600_000;
    const d = new Date(now); d.setUTCHours(3, 30, 0, 0);
    let at = d.getTime(); if (at <= now + 60_000) at += 24 * 3600_000;
    const t = setTimeout(() => window.location.reload(), at - now);
    return () => clearTimeout(t);
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

  const today = todayParam ?? todayLive;
  const viewDate = dateParam ?? today;
  const weekStart = useMemo(() => (viewDate ? mondayOf(viewDate) : ""), [viewDate]);

  // ambil menu minggu ini; segarkan tiap 5 menit supaya perubahan dari Dashboard ikut tampil
  useEffect(() => {
    if (!ready || !weekStart) return;
    if (sample) { setWeek(sampleWeek(weekStart)); setStatus("ok"); return; }
    setStatus("loading"); hasData.current = false; // pergantian minggu: kosongkan dulu, jangan tampilkan menu minggu lalu
    let alive = true;
    const pull = async () => {
      try {
        const w = await getPublicMenu(weekStart);
        if (!alive) return;
        setWeek(w); setStatus(w ? "ok" : "empty"); hasData.current = !!w;
      } catch { if (alive) setStatus((st) => (st === "ok" ? st : "error")); }
    };
    void pull();
    const t = setInterval(pull, 5 * 60_000);
    // belum ada data (jaringan baru menyala / minggu belum diisi): coba lagi tiap menit
    const quick = setInterval(() => { if (!hasData.current) void pull(); }, 60_000);
    return () => { alive = false; clearInterval(t); clearInterval(quick); };
  }, [ready, weekStart, sample]);

  if (!ready || !weekStart) return <div className={s.root} />;
  // data minggu lama tidak boleh tampil di bawah tanggal minggu baru (pergantian Minggu → Senin)
  const emptyState = status !== "ok" || !week || week.weekStart !== weekStart;

  const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const period = periodText(dates[0], dates[6]);
  const c: Ctx | null = emptyState ? null : { week: week!, dates, today, period };

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
          {!c && status !== "loading" && <EmptySlide period={period} error={status === "error"} />}
          {c && key === "cover" && <Cover c={c} />}
          {c && key === "snack" && <Snack c={c} />}
          {c && key === "meal" && <Meal c={c} />}
          {c && key === "today" && <TodaySlide c={c} />}
          {c && key === "closing" && <Closing c={c} />}
          <div className={s.wipe} />
        </div>
      </div>

      {auto && c && <div key={`${idx}-${tick}-${dur}`} className={s.progress} style={{ animationDuration: `${dur}s` }} />}
      <div className={s.nav} style={c ? undefined : { display: "none" }}>
        {ORDER.map((k, i) => <span key={k} className={`${s.navDot} ${i === idx ? s.on : ""}`} />)}
      </div>
    </div>
  );
}
