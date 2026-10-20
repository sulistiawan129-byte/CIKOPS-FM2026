"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import { CATS, EXTRA_CATS, INC_CATS, KPI_OBJ, type CatKey, type ExtraKey } from "./constants";
import { addMonths, last13, monthDays, monthEnd, parseMonth } from "./dates";
import type { AreaIssue, DayEvent, Improvement, Leave, MonthData, MonthExtra, Note, Patrol } from "./types";

const REALTIME_TABLES = [
  "daily_counts", "day_events", "incident_counts", "patrol_monthly", "leaves",
  "improvements", "kpi_scores", "report_notes", "monthly_baseline",
] as const;
/** Tabel dari laporan_cikops.sql — dilanggan di channel terpisah supaya realtime utama tetap jalan bila SQL belum dijalankan. */
const EXTRA_TABLES = ["daily_extra", "monthly_extra", "area_issues"] as const;

const emptyPatrol: Patrol = { target_patrol: 0, target_checkpoint: 0, actual_patrol: 0, actual_checkpoint: 0, note: "" };
const emptyExtra = (): MonthExtra => ({ selisih_timbang: 0, palm_oil: 0, team: {}, team_note: "" });

/** Ambil semua data satu bulan untuk satu site. */
export async function fetchMonth(siteId: string, month: string): Promise<MonthData> {
  const sb = supabaseBrowser();
  const days = monthDays(month);
  const months = last13(month);
  const { y } = parseMonth(month);
  const prev = addMonths(month, -1);

  const [daily, totals, base, inc, pat, lv, ni, kpi, notes, ev] = await Promise.all([
    sb.from("daily_counts").select("day,category,value").eq("site_id", siteId).gte("day", month).lte("day", monthEnd(month)),
    sb.from("monthly_totals").select("month,category,total").eq("site_id", siteId).gte("month", months[0]).lte("month", month),
    sb.from("monthly_baseline").select("month,category,total").eq("site_id", siteId).gte("month", months[0]).lte("month", month),
    sb.from("incident_counts").select("month,category,value,note").eq("site_id", siteId).in("month", [month, prev]),
    sb.from("patrol_monthly").select("*").eq("site_id", siteId).eq("month", month).maybeSingle(),
    sb.from("leaves").select("id,name,date_text,type,backup").eq("site_id", siteId).eq("month", month).order("created_at"),
    sb.from("improvements").select("id,opened_month,description,priority,progress,status").eq("site_id", siteId).order("opened_month").order("id"),
    sb.from("kpi_scores").select("month,objective,score").eq("site_id", siteId).eq("year", y),
    sb.from("report_notes").select("category,note,weekly_note").eq("site_id", siteId).eq("month", month),
    sb.from("day_events").select("id,day,kind,description,created_at").eq("site_id", siteId).gte("day", month).lte("day", monthEnd(month)).order("created_at"),
  ]);
  // Data tambahan: kalau tabelnya belum ada (SQL belum dijalankan), halaman tetap jalan tanpa bagian ini.
  const [xd, xm, xi] = await Promise.all([
    sb.from("daily_extra").select("day,category,value").eq("site_id", siteId).gte("day", month).lte("day", monthEnd(month)),
    sb.from("monthly_extra").select("selisih_timbang,palm_oil,team,team_note").eq("site_id", siteId).eq("month", month).maybeSingle(),
    sb.from("area_issues").select("id,day,category,description,status").eq("site_id", siteId).gte("day", month).lte("day", monthEnd(month)).order("day").order("created_at"),
  ]);
  const extraReady = !xd.error && !xm.error && !xi.error;
  const extraDaily = {} as Record<ExtraKey, number[]>;
  EXTRA_CATS.forEach((c) => (extraDaily[c.k] = days.map(() => 0)));
  (extraReady ? xd.data ?? [] : []).forEach((r: { day: string; category: ExtraKey; value: number }) => {
    const i = Number(r.day.slice(8, 10)) - 1;
    if (extraDaily[r.category] && i >= 0 && i < days.length) extraDaily[r.category][i] = r.value;
  });
  const err = [daily, totals, base, inc, pat, lv, ni, kpi, notes, ev].find((r) => r.error);
  if (err?.error) throw new Error(err.error.message);

  const dailyMap = {} as Record<CatKey, number[]>;
  const filled = days.map(() => false);
  CATS.forEach((c) => (dailyMap[c.k] = days.map(() => 0)));
  (daily.data ?? []).forEach((r: { day: string; category: CatKey; value: number }) => {
    const i = Number(r.day.slice(8, 10)) - 1;
    if (dailyMap[r.category] && i >= 0 && i < days.length) { dailyMap[r.category][i] = r.value; filled[i] = true; }
  });

  const totals13 = {} as Record<CatKey, number[]>;
  CATS.forEach((c) => {
    totals13[c.k] = months.map((m, idx) => {
      if (idx === months.length - 1) return dailyMap[c.k].reduce((a, b) => a + b, 0);
      const t = (totals.data ?? []).find((r: { month: string; category: string }) => r.month === m && r.category === c.k);
      if (t) return t.total as number;
      const b = (base.data ?? []).find((r: { month: string; category: string }) => r.month === m && r.category === c.k);
      return (b?.total as number) ?? 0;
    });
  });

  const incRows = (inc.data ?? []) as { month: string; category: string; value: number; note: string }[];
  const incPrev: Record<string, number | null> = {};
  const incList = INC_CATS.map((cat) => {
    const r = incRows.find((x) => x.month === month && x.category === cat);
    const p = incRows.find((x) => x.month === prev && x.category === cat);
    incPrev[cat] = p ? p.value : null;
    return { category: cat, value: r?.value ?? 0, note: r?.note ?? "" };
  });

  const kpiGrid: (number | null)[][] = KPI_OBJ.map(() => Array(12).fill(null));
  (kpi.data ?? []).forEach((r: { month: number; objective: number; score: number | null }) => {
    if (kpiGrid[r.objective - 1]) kpiGrid[r.objective - 1][r.month - 1] = r.score;
  });

  const noteMap: Record<string, Note> = {};
  (notes.data ?? []).forEach((r: { category: string; note: string; weekly_note: string }) => (noteMap[r.category] = { note: r.note, weekly_note: r.weekly_note }));

  return {
    month, days, daily: dailyMap, filled, totals13,
    inc: incList, incPrev,
    patrol: (pat.data as Patrol) ?? emptyPatrol,
    leaves: (lv.data ?? []) as Leave[],
    improvements: (ni.data ?? []) as Improvement[],
    kpi: kpiGrid, notes: noteMap,
    events: (ev.data ?? []) as DayEvent[],
    extraReady, extraDaily,
    extra: extraReady && xm.data ? { ...emptyExtra(), ...(xm.data as MonthExtra) } : emptyExtra(),
    issues: (extraReady ? xi.data ?? [] : []) as AreaIssue[],
    loadedAt: Date.now(),
  };
}

/**
 * Data bulan + langganan realtime. Setiap perubahan di tabel mana pun
 * untuk site ini memicu muat ulang (di-debounce), jadi semua layar
 * yang membuka site yang sama selalu sinkron.
 */
export function useMonthData(siteId: string | null, month: string | null) {
  const [data, setData] = useState<MonthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!siteId || !month) return;
    try {
      const d = await fetchMonth(siteId, month);
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [siteId, month]);

  useEffect(() => {
    alive.current = true;
    setData(null);
    load();
    if (!siteId) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`site-${siteId}-${month}-${Math.random().toString(36).slice(2, 7)}`);
    REALTIME_TABLES.forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "security", table: t, filter: `site_id=eq.${siteId}` }, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { load(); setPulse((p) => p + 1); }, 250);
      })
    );
    ch.subscribe((status) => setLive(status === "SUBSCRIBED"));
    const chx = sb.channel(`site-x-${siteId}-${month}-${Math.random().toString(36).slice(2, 7)}`);
    EXTRA_TABLES.forEach((t) =>
      chx.on("postgres_changes", { event: "*", schema: "security", table: t, filter: `site_id=eq.${siteId}` }, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { load(); setPulse((p) => p + 1); }, 250);
      })
    );
    chx.subscribe();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    const onOnline = () => load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    const poll = setInterval(load, 120000); // jaring pengaman kalau koneksi realtime putus
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      sb.removeChannel(ch);
      sb.removeChannel(chx);
    };
  }, [siteId, month, load]);

  return { data, setData, error, live, pulse, reload: load };
}

/* ───────────── Mutasi (RLS di database yang menentukan boleh/tidaknya) ───────────── */
const sb = () => supabaseBrowser();
/** Jalankan query Supabase sebagai Promise sungguhan; lempar Error kalau ditolak (mis. RLS). */
async function run<T extends { error: { message: string } | null }>(q: PromiseLike<T>): Promise<T> {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r;
}

export const api = {
  setDaily: (site_id: string, day: string, category: CatKey, value: number) =>
    run(sb().from("daily_counts").upsert({ site_id, day, category, value })),

  setIncident: (site_id: string, month: string, category: string, patch: { value?: number; note?: string }, current: { value: number; note: string }) =>
    run(sb().from("incident_counts").upsert({ site_id, month, category, value: patch.value ?? current.value, note: patch.note ?? current.note })),

  setPatrol: (site_id: string, month: string, p: Patrol) =>
    run(sb().from("patrol_monthly").upsert({ site_id, month, ...p })),

  addLeave: (site_id: string, month: string) =>
    run(sb().from("leaves").insert({ site_id, month }).select("id").single()),
  updateLeave: (id: string, patch: Partial<Leave>) => run(sb().from("leaves").update(patch).eq("id", id)),
  deleteLeave: (id: string) => run(sb().from("leaves").delete().eq("id", id)),

  addImprovement: (site_id: string, opened_month: string) =>
    run(sb().from("improvements").insert({ site_id, opened_month }).select("id").single()),
  updateImprovement: (id: string, patch: Partial<Improvement>) => run(sb().from("improvements").update(patch).eq("id", id)),
  deleteImprovement: (id: string) => run(sb().from("improvements").delete().eq("id", id)),

  setKpi: (site_id: string, year: number, month1: number, objective: number, score: number | null) =>
    run(sb().from("kpi_scores").upsert({ site_id, year, month: month1, objective, score })),

  setNote: (site_id: string, month: string, category: string, n: Note) =>
    run(sb().from("report_notes").upsert({ site_id, month, category, ...n })),

  addEvent: (site_id: string, day: string, kind: string, description: string) =>
    run(sb().from("day_events").insert({ site_id, day, kind, description })),
  deleteEvent: (id: string) => run(sb().from("day_events").delete().eq("id", id)),

  setDailyExtra: (site_id: string, day: string, category: ExtraKey, value: number) =>
    run(sb().from("daily_extra").upsert({ site_id, day, category, value })),
  setMonthExtra: (site_id: string, month: string, x: MonthExtra) =>
    run(sb().from("monthly_extra").upsert({ site_id, month, ...x })),
  addIssue: (site_id: string, i: Omit<AreaIssue, "id">) => run(sb().from("area_issues").insert({ site_id, ...i })),
  updateIssue: (id: string, patch: Partial<AreaIssue>) => run(sb().from("area_issues").update(patch).eq("id", id)),
  deleteIssue: (id: string) => run(sb().from("area_issues").delete().eq("id", id)),
};

/** Debounce per kunci — dipakai untuk simpan otomatis saat mengetik. */
const pending = new Map<string, ReturnType<typeof setTimeout>>();
export function debounced(key: string, fn: () => Promise<unknown>, ms = 450, onError?: (e: Error) => void) {
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); fn().catch((e) => onError?.(e)); }, ms));
}
