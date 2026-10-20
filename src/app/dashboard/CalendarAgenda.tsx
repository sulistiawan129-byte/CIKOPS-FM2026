"use client";

/* ════════════════════════════════════════════════════════════
   Kalender & Agenda — tersinkron dengan Penugasan Driver.
   • Agenda (kunjungan, event, meeting, pelatihan, libur, lainnya):
     tambah / ubah / hapus lewat formulir.
   • Penugasan driver (tasks_detail) tampil otomatis di tanggalnya;
     agenda bisa ditautkan ke penugasan (mis. kunjungan tamu yang
     dijemput driver), atau dibuat langsung dari penugasan.
   Dua tampilan: "mini" (kolom kanan Home) dan "full" (menu Kalender).
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAgendaEvents, addAgendaEvent, updateAgendaEvent, deleteAgendaEvent, getTasksByRange } from "@/lib/api";
import { roleInfoOf, type MyProfile } from "@/lib/api";
import type { AgendaCategory, AgendaEvent, AgendaEventInput, TaskDetail, TaskStatus } from "@/lib/types";
import { toLocalISODate } from "@/lib/dateUtils";
import { useLang } from "@/lib/providers";
import c from "./calendar.module.css";

type Lang = "id" | "en";

export const AGENDA_CAT: Record<AgendaCategory, { id: string; en: string; icon: string; color: string }> = {
  kunjungan: { id: "Kunjungan", en: "Visit", icon: "🤝", color: "var(--purple)" },
  event: { id: "Event", en: "Event", icon: "🎉", color: "var(--orange)" },
  meeting: { id: "Meeting", en: "Meeting", icon: "👥", color: "var(--brand)" },
  pelatihan: { id: "Pelatihan", en: "Training", icon: "🎓", color: "var(--green)" },
  libur: { id: "Libur", en: "Holiday", icon: "🏖️", color: "var(--red)" },
  lainnya: { id: "Lainnya", en: "Other", icon: "📌", color: "var(--t3)" },
};
const CATS = Object.keys(AGENDA_CAT) as AgendaCategory[];
const TASK_COLOR = "var(--gold)";

const STATUS: Record<TaskStatus, { id: string; en: string; cls: string }> = {
  ASSIGNED: { id: "Ditugaskan", en: "Assigned", cls: "stAssigned" },
  "ON GOING": { id: "Berjalan", en: "On going", cls: "stOngoing" },
  DONE: { id: "Selesai", en: "Done", cls: "stDone" },
  CANCELLED: { id: "Batal", en: "Cancelled", cls: "stCancelled" },
};
const STATUS_ORDER: Record<TaskStatus, number> = { "ON GOING": 0, ASSIGNED: 1, DONE: 2, CANCELLED: 3 };

const MONTHS = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const DOW = { id: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };

function iso(d: Date) { return toLocalISODate(d); }
function parseISO(s: string) { return new Date(s + "T00:00:00"); }
function catLabel(k: AgendaCategory, lang: Lang) { return lang === "en" ? AGENDA_CAT[k].en : AGENDA_CAT[k].id; }
function timeRange(a: string, b: string) { return a && b ? `${a}–${b}` : a || ""; }
function longDate(s: string, lang: Lang) {
  return parseISO(s).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function shortDate(s: string, lang: Lang) {
  return parseISO(s).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "2-digit", month: "short" });
}
function taskLine(t: TaskDetail) {
  return [t.driver_nama || "—", t.kendaraan].filter(Boolean).join(" · ");
}
function sortEvents(a: AgendaEvent, b: AgendaEvent) {
  return a.eventDate.localeCompare(b.eventDate) || (a.eventTime || "99").localeCompare(b.eventTime || "99") || a.title.localeCompare(b.title);
}

/** Grid 6 minggu (Senin–Minggu) yang memuat bulan `month`. */
function gridDays(month: Date): string[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return iso(d);
  });
}

export default function CalendarAgenda({
  variant,
  myProfile,
  onOpenTasks,
  onOpenCalendar,
}: {
  variant: "mini" | "full";
  myProfile: MyProfile | null;
  /** Buka menu Penugasan pada tanggal tertentu. */
  onOpenTasks?: (date: string) => void;
  /** (mini) buka menu Kalender penuh. */
  onOpenCalendar?: () => void;
}) {
  const { lang: rawLang } = useLang();
  const lang: Lang = rawLang === "en" ? "en" : "id";
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const full = variant === "full";
  const today = iso(new Date());
  const plant = myProfile?.plantScope ?? null;
  // Receptionist: kalender kunjungan/agenda saja, tanpa penugasan driver
  const allowTasks = roleInfoOf(myProfile)?.calendarTasks ?? true;

  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(full ? today : null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [showTasksRaw, setShowTasks] = useState(true);
  const showTasks = allowTasks && showTasksRaw;
  const [hidden, setHidden] = useState<Set<AgendaCategory>>(new Set());
  const [form, setForm] = useState<{ event: AgendaEvent | null; draft: AgendaEventInput } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => gridDays(month), [month]);
  const rangeFrom = days[0];
  const rangeTo = days[days.length - 1];

  const loadEvents = useCallback(async () => {
    try { setEvents(await getAgendaEvents()); }
    catch (e) { setMsg({ ok: false, text: `${L("Gagal memuat agenda", "Failed to load agenda")}: ${e instanceof Error ? e.message : String(e)}` }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const loadTasks = useCallback(async () => {
    if (!allowTasks) return;
    try { setTasks(await getTasksByRange(rangeFrom, rangeTo, plant)); }
    catch (e) { console.warn("Gagal memuat penugasan untuk kalender:", e); }
  }, [rangeFrom, rangeTo, plant, allowTasks]);

  useEffect(() => { loadEvents().finally(() => setLoading(false)); }, [loadEvents]);
  useEffect(() => {
    loadTasks();
    const id = setInterval(loadTasks, 60000); // status penugasan berubah sepanjang hari
    return () => clearInterval(id);
  }, [loadTasks]);
  useEffect(() => { if (!msg?.ok) return; const id = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(id); }, [msg]);

  const visibleEvents = useMemo(() => events.filter((e) => !hidden.has(e.category)).sort(sortEvents), [events, hidden]);
  const eventsByDate = useMemo(() => {
    const m = new Map<string, AgendaEvent[]>();
    for (const e of visibleEvents) { const a = m.get(e.eventDate); if (a) a.push(e); else m.set(e.eventDate, [e]); }
    return m;
  }, [visibleEvents]);
  const tasksByDate = useMemo(() => {
    const m = new Map<string, TaskDetail[]>();
    for (const t of tasks) { const a = m.get(t.tanggal); if (a) a.push(t); else m.set(t.tanggal, [t]); }
    for (const a of m.values()) a.sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || (x.driver_nama ?? "").localeCompare(y.driver_nama ?? ""));
    return m;
  }, [tasks]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const agendaByTask = useMemo(() => {
    const m = new Map<string, AgendaEvent>();
    for (const e of events) if (e.taskId) m.set(e.taskId, e);
    return m;
  }, [events]);
  const activeTasks = (d: string) => (tasksByDate.get(d) ?? []).filter((t) => t.status !== "CANCELLED");

  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const monthStats = useMemo(() => ({
    agenda: visibleEvents.filter((e) => e.eventDate.startsWith(monthKey)).length,
    tasks: tasks.filter((t) => t.tanggal.startsWith(monthKey) && t.status !== "CANCELLED").length,
  }), [visibleEvents, tasks, monthKey]);

  function shiftMonth(n: number) { setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); }
  function goToday() { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today); }
  function pick(d: string) {
    if (!full && selected === d) { setSelected(null); return; }
    setSelected(d);
    const pd = parseISO(d);
    if (pd.getMonth() !== month.getMonth() || pd.getFullYear() !== month.getFullYear()) setMonth(new Date(pd.getFullYear(), pd.getMonth(), 1));
  }
  function toggleCat(k: AgendaCategory) {
    setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  function openCreate(date: string, fromTask?: TaskDetail) {
    setForm({
      event: null,
      draft: fromTask
        ? { title: `${L("Kunjungan", "Visit")}: ${fromTask.tujuan || fromTask.jenis_pekerjaan}`, category: "kunjungan", eventDate: fromTask.tanggal, eventTime: "", endTime: "", location: fromTask.tujuan || "", pic: fromTask.requestor || "", notes: fromTask.perihal || "", taskId: fromTask.id }
        : { title: "", category: "event", eventDate: date, eventTime: "09:00", endTime: "", location: "", pic: "", notes: "", taskId: null },
    });
  }
  function openEdit(e: AgendaEvent) {
    setForm({ event: e, draft: { title: e.title, category: e.category, eventDate: e.eventDate, eventTime: e.eventTime, endTime: e.endTime, location: e.location, pic: e.pic, notes: e.notes, taskId: e.taskId } });
  }

  async function save(draft: AgendaEventInput, existing: AgendaEvent | null) {
    if (existing) await updateAgendaEvent(existing.id, draft);
    else await addAgendaEvent({ ...draft, createdBy: myProfile?.fullName ?? "" });
    setForm(null);
    setMsg({ ok: true, text: existing ? L("Agenda diperbarui.", "Agenda updated.") : L("Agenda ditambahkan.", "Agenda added.") });
    setSelected(draft.eventDate);
    await loadEvents();
  }
  async function remove(e: AgendaEvent) {
    if (!window.confirm(L(`Hapus agenda "${e.title}"?`, `Delete agenda "${e.title}"?`))) return;
    try {
      await deleteAgendaEvent(e.id);
      setForm(null);
      setMsg({ ok: true, text: L("Agenda dihapus.", "Agenda deleted.") });
      await loadEvents();
    } catch (err) {
      setMsg({ ok: false, text: `${L("Gagal menghapus", "Failed to delete")}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  /* ── potongan tampilan ── */

  const legend = (
    <div className={c.legend}>
      {CATS.map((k) => (
        <button key={k} type="button" className={`${c.chip} ${hidden.has(k) ? c.chipOff : ""}`} aria-pressed={!hidden.has(k)} onClick={() => toggleCat(k)} style={{ ["--cat" as string]: AGENDA_CAT[k].color }}>
          <span className={c.sw} />{catLabel(k, lang)}
        </button>
      ))}
      {allowTasks && <button type="button" className={`${c.chip} ${showTasks ? "" : c.chipOff}`} aria-pressed={showTasks} onClick={() => setShowTasks((v) => !v)} style={{ ["--cat" as string]: TASK_COLOR }}>
        <span className={c.sw} />{L("Penugasan driver", "Driver tasks")}
      </button>}
    </div>
  );

  const grid = (
    <div className={full ? c.gridFull : c.gridMini}>
      {DOW[lang].map((d, i) => <div key={d} className={`${c.dow} ${i >= 5 ? c.dowWe : ""}`}>{full ? d : d.slice(0, 2)}</div>)}
      {days.map((d) => {
        const pd = parseISO(d);
        const inMonth = pd.getMonth() === month.getMonth();
        const evs = eventsByDate.get(d) ?? [];
        const tks = showTasks ? activeTasks(d) : [];
        const isHoliday = evs.some((e) => e.category === "libur");
        const cls = [c.cell, inMonth ? "" : c.outside, d === today ? c.today : "", d === selected ? c.selected : "", pd.getDay() === 0 || pd.getDay() === 6 || isHoliday ? c.weekend : ""].join(" ");
        const label = `${longDate(d, lang)}: ${evs.length} agenda, ${tks.length} ${L("penugasan", "tasks")}`;
        if (!full) {
          return (
            <button key={d} type="button" className={cls} onClick={() => pick(d)} aria-label={label} title={label}>
              <span className={c.num}>{pd.getDate()}</span>
              <span className={c.dots}>
                {evs.slice(0, 3).map((e) => <i key={e.id} style={{ background: AGENDA_CAT[e.category].color }} />)}
                {tks.length > 0 && <i style={{ background: TASK_COLOR }} />}
              </span>
            </button>
          );
        }
        const maxChips = tks.length ? 2 : 3;
        return (
          <div key={d} className={cls} role="button" tabIndex={0} aria-label={label} onClick={() => pick(d)} onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); pick(d); } }}>
            <div className={c.cellHead}>
              <span className={c.num}>{pd.getDate()}</span>
              <button type="button" className={c.cellAdd} title={L("Tambah agenda", "Add agenda")} aria-label={L("Tambah agenda", "Add agenda")} onClick={(ev) => { ev.stopPropagation(); setSelected(d); openCreate(d); }}>+</button>
            </div>
            <div className={c.items}>
              {evs.slice(0, maxChips).map((e) => (
                <button key={e.id} type="button" className={c.item} style={{ ["--cat" as string]: AGENDA_CAT[e.category].color }} title={`${catLabel(e.category, lang)} · ${timeRange(e.eventTime, e.endTime)} ${e.title}`} onClick={(ev) => { ev.stopPropagation(); setSelected(d); openEdit(e); }}>
                  {e.eventTime && <b>{e.eventTime}</b>}<span>{e.title}</span>
                </button>
              ))}
              {evs.length > maxChips && <span className={c.more}>+{evs.length - maxChips} agenda</span>}
              {tks.length > 0 && (
                <span className={`${c.item} ${c.itemTask}`} style={{ ["--cat" as string]: TASK_COLOR }}>
                  <span title={`${tks.length} ${L("penugasan driver", "driver tasks")}`}>🚗 {tks.length} {L("tugas", tks.length > 1 ? "tasks" : "task")}</span>
                </span>
              )}
            </div>
            <span className={c.dots}>
              {evs.slice(0, 3).map((e) => <i key={e.id} style={{ background: AGENDA_CAT[e.category].color }} />)}
              {tks.length > 0 && <i style={{ background: TASK_COLOR }} />}
            </span>
          </div>
        );
      })}
    </div>
  );

  function agendaItem(e: AgendaEvent, showDate?: boolean) {
    const t = e.taskId ? taskById.get(e.taskId) : undefined;
    return (
      <li key={e.id} className={c.row} style={{ ["--cat" as string]: AGENDA_CAT[e.category].color }}>
        <div className={c.rowMain}>
          <div className={c.rowMeta}>
            <span className={c.badge}>{AGENDA_CAT[e.category].icon} {catLabel(e.category, lang)}</span>
            {showDate && <span>{shortDate(e.eventDate, lang)}</span>}
            {(e.eventTime || e.endTime) && <span className={c.time}>{timeRange(e.eventTime, e.endTime)}</span>}
          </div>
          <div className={c.rowTitle}>{e.title}</div>
          {(e.location || e.pic) && <div className={c.rowSub}>{[e.location && `📍 ${e.location}`, e.pic && `👤 ${e.pic}`].filter(Boolean).join("   ")}</div>}
          {e.notes && <div className={c.rowNote}>{e.notes}</div>}
          {e.taskId && (
            <div className={c.link}>
              🚗 {t ? <>{taskLine(t)} → {t.tujuan || t.jenis_pekerjaan} <span className={`${c.st} ${c[STATUS[t.status].cls]}`}>{lang === "en" ? STATUS[t.status].en : STATUS[t.status].id}</span></> : L("Tertaut ke penugasan driver", "Linked to a driver task")}
            </div>
          )}
        </div>
        <div className={c.rowAct}>
          <button type="button" className={c.iconBtn} onClick={() => openEdit(e)} aria-label={L("Ubah", "Edit")} title={L("Ubah", "Edit")}>✎</button>
          <button type="button" className={`${c.iconBtn} ${c.danger}`} onClick={() => remove(e)} aria-label={L("Hapus", "Delete")} title={L("Hapus", "Delete")}>🗑</button>
        </div>
      </li>
    );
  }

  function dayPanel(d: string) {
    const evs = eventsByDate.get(d) ?? [];
    const tks = showTasks ? tasksByDate.get(d) ?? [] : [];
    const active = tks.filter((t) => t.status !== "CANCELLED").length;
    return (
      <div className={c.day}>
        <div className={c.dayHead}>
          <div>
            <div className={c.kicker}>{d === today ? L("Hari ini", "Today") : L("Tanggal dipilih", "Selected date")}</div>
            <div className={c.dayTitle}>{longDate(d, lang)}</div>
          </div>
          <div className={c.dayBtns}>
            {!full && <button type="button" className={c.ghost} onClick={() => setSelected(null)}>{L("Tutup", "Close")} ✕</button>}
            <button type="button" className={c.primary} onClick={() => openCreate(d)}>+ Agenda</button>
          </div>
        </div>

        <div className={c.secTitle}>Agenda <span>{evs.length}</span></div>
        {evs.length === 0 ? <p className={c.empty}>{L("Belum ada agenda di tanggal ini.", "No agenda on this date.")}</p> : (
          <ul className={c.list}>{evs.map((e) => agendaItem(e))}</ul>
        )}

        {showTasks && (
          <>
            <div className={c.secTitle}>
              {L("Penugasan driver", "Driver tasks")} <span>{active}</span>
              {onOpenTasks && <button type="button" className={c.linkBtn} onClick={() => onOpenTasks(d)}>{L("Buka di Penugasan", "Open in Tasks")} →</button>}
            </div>
            {tks.length === 0 ? <p className={c.empty}>{L("Tidak ada penugasan driver.", "No driver tasks.")}</p> : (
              <ul className={c.list}>
                {tks.slice(0, full ? 50 : 6).map((t) => {
                  const ag = agendaByTask.get(t.id);
                  return (
                    <li key={t.id} className={`${c.row} ${t.status === "CANCELLED" ? c.rowDim : ""}`} style={{ ["--cat" as string]: TASK_COLOR }}>
                      <div className={c.rowMain}>
                        <div className={c.rowMeta}>
                          <span className={`${c.st} ${c[STATUS[t.status].cls]}`}>{lang === "en" ? STATUS[t.status].en : STATUS[t.status].id}</span>
                          <span>{t.jenis_pekerjaan}</span>
                          {t.batch_total_days > 1 && <span>· {t.batch_total_days} {L("hari", "days")}</span>}
                        </div>
                        <div className={c.rowTitle}>{taskLine(t)}</div>
                        <div className={c.rowSub}>{[t.lokasi_asal, t.tujuan].filter(Boolean).join(" → ") || "—"}{t.requestor ? `   👤 ${t.requestor}` : ""}</div>
                        {ag && <div className={c.link}>{AGENDA_CAT[ag.category].icon} {ag.title}</div>}
                      </div>
                      {!ag && t.status !== "CANCELLED" && (
                        <div className={c.rowAct}>
                          <button type="button" className={c.smallBtn} onClick={() => openCreate(t.tanggal, t)} title={L("Buat agenda dari penugasan ini", "Create agenda from this task")}>+ Agenda</button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {!full && tks.length > 6 && <li className={c.more}>+{tks.length - 6} {L("penugasan lainnya", "more tasks")}</li>}
              </ul>
            )}
          </>
        )}
      </div>
    );
  }

  const upcoming = visibleEvents.filter((e) => e.eventDate >= today).slice(0, full ? 8 : 5);
  const upcomingList = (
    <div className={c.day}>
      <div className={c.dayHead}>
        <div className={c.dayTitle}>{L("Agenda mendatang", "Upcoming agenda")}</div>
        <button type="button" className={c.primary} onClick={() => openCreate(selected ?? today)}>+ Agenda</button>
      </div>
      {showTasks && !full && (
        <button type="button" className={c.todayTasks} onClick={() => pick(today)}>
          🚗 {activeTasks(today).length} {L("penugasan driver hari ini", "driver tasks today")} <span>›</span>
        </button>
      )}
      {upcoming.length === 0 ? <p className={c.empty}>{L("Belum ada agenda mendatang.", "No upcoming agenda.")}</p> : (
        <ul className={c.list}>{upcoming.map((e) => agendaItem(e, true))}</ul>
      )}
    </div>
  );

  const head = (
    <div className={c.monthBar}>
      <button type="button" className={c.nav} onClick={() => shiftMonth(-1)} aria-label={L("Bulan sebelumnya", "Previous month")}>‹</button>
      <div className={c.monthName}>{MONTHS[lang][month.getMonth()]} {month.getFullYear()}</div>
      <button type="button" className={c.nav} onClick={() => shiftMonth(1)} aria-label={L("Bulan berikutnya", "Next month")}>›</button>
      <button type="button" className={c.ghost} onClick={goToday}>{L("Hari ini", "Today")}</button>
    </div>
  );

  const message = msg && <div className={msg.ok ? c.msgOk : c.msgErr} role="status">{msg.text}</div>;
  const modal = form && (
    <AgendaForm
      lang={lang}
      initial={form.draft}
      existing={form.event}
      plant={plant}
      knownTasks={tasks}
      linkedTaskIds={new Set(events.filter((e) => e.taskId && e.id !== form.event?.id).map((e) => e.taskId as string))}
      onCancel={() => setForm(null)}
      onSave={(d) => save(d, form.event)}
      onDelete={form.event ? () => remove(form.event as AgendaEvent) : undefined}
    />
  );

  if (!full) {
    return (
      <>
        <div className={`neonCard ${c.card}`}>
          <div className={c.miniHead}>
            {head}
          </div>
          {grid}
          <div className={c.miniFoot}>
            <span className={c.miniLegend}><i style={{ background: "var(--brand)" }} />Agenda <i style={{ background: TASK_COLOR }} />{L("Penugasan", "Tasks")}</span>
            {onOpenCalendar && <button type="button" className={c.linkBtn} onClick={onOpenCalendar}>{L("Kalender lengkap", "Full calendar")} →</button>}
          </div>
        </div>
        <div className={`neonCard ${c.card}`}>
          {message}
          {selected ? dayPanel(selected) : upcomingList}
        </div>
        {modal}
      </>
    );
  }

  return (
    <div className={c.wrap}>
      <div className={c.pageHead}>
        <div>
          <div className={c.kicker}>{L("Kalender & Agenda", "Calendar & Agenda")}</div>
          <h1 className={c.h1}>{L("Kalender", "Calendar")}</h1>
          <p className={c.lead}>{L("Agenda kunjungan, event, meeting dan lainnya — beserta penugasan driver yang otomatis muncul di tanggalnya.", "Visits, events, meetings and more — plus driver tasks shown automatically on their dates.")}</p>
        </div>
        <div className={c.stats}>
          <div className={c.stat}><span>Agenda</span><b>{monthStats.agenda}</b></div>
          <div className={c.stat}><span>{L("Penugasan", "Tasks")}</span><b>{monthStats.tasks}</b></div>
          <button type="button" className={c.primary} onClick={() => openCreate(selected ?? today)}>+ {L("Tambah agenda", "Add agenda")}</button>
        </div>
      </div>
      {message}
      <div className={c.toolbar}>{head}{legend}</div>
      <div className={c.layout}>
        <div className={`neonCard ${c.card} ${c.gridCard}`}>
          {loading ? <div className={c.empty}>{L("Memuat…", "Loading…")}</div> : grid}
        </div>
        <div className={c.side}>
          <div className={`neonCard ${c.card}`}>{dayPanel(selected ?? today)}</div>
          <div className={`neonCard ${c.card}`}>{upcomingList}</div>
        </div>
      </div>
      {modal}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Formulir tambah / ubah agenda
════════════════════════════════════════════════════════════ */
function AgendaForm({
  lang, initial, existing, plant, knownTasks, linkedTaskIds, onCancel, onSave, onDelete,
}: {
  lang: Lang;
  initial: AgendaEventInput;
  existing: AgendaEvent | null;
  plant: MyProfile["plantScope"] | null;
  knownTasks: TaskDetail[];
  linkedTaskIds: Set<string>;
  onCancel: () => void;
  onSave: (d: AgendaEventInput) => Promise<void>;
  onDelete?: () => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [d, setD] = useState<AgendaEventInput>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dayTasks, setDayTasks] = useState<TaskDetail[]>(() => knownTasks.filter((t) => t.tanggal === initial.eventDate));
  const set = <K extends keyof AgendaEventInput>(k: K, v: AgendaEventInput[K]) => setD((p) => ({ ...p, [k]: v }));

  // Penugasan pada tanggal agenda (untuk ditautkan); ambil dari server bila di luar bulan yang dimuat.
  useEffect(() => {
    const local = knownTasks.filter((t) => t.tanggal === d.eventDate);
    if (local.length) { setDayTasks(local); return; }
    let alive = true;
    if (!d.eventDate) { setDayTasks([]); return; }
    getTasksByRange(d.eventDate, d.eventDate, plant ?? null).then((r) => { if (alive) setDayTasks(r); }).catch(() => { if (alive) setDayTasks([]); });
    return () => { alive = false; };
  }, [d.eventDate, knownTasks, plant]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const linkable = dayTasks.filter((t) => t.status !== "CANCELLED" && (!linkedTaskIds.has(t.id) || t.id === d.taskId));
  const linkedElsewhere = d.taskId && !dayTasks.some((t) => t.id === d.taskId);
  const timeErr = d.eventTime && d.endTime && d.endTime < d.eventTime;
  const valid = !!d.title.trim() && !!d.eventDate && !timeErr;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setErr(null);
    try {
      await onSave({ ...d, title: d.title.trim(), location: (d.location ?? "").trim(), pic: (d.pic ?? "").trim(), notes: (d.notes ?? "").trim(), taskId: linkedElsewhere ? null : d.taskId ?? null });
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  }

  return (
    <div className={c.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className={c.modal} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="agenda-form-title">
        <div className={c.modalHead}>
          <h2 id="agenda-form-title">{existing ? L("Ubah agenda", "Edit agenda") : L("Tambah agenda", "Add agenda")}</h2>
          <button type="button" className={c.iconBtn} onClick={onCancel} aria-label={L("Tutup", "Close")}>✕</button>
        </div>

        <div className={c.field}>
          <span>{L("Jenis", "Type")}</span>
          <div className={c.catPick}>
            {CATS.map((k) => (
              <button key={k} type="button" className={`${c.catBtn} ${d.category === k ? c.catOn : ""}`} aria-pressed={d.category === k} style={{ ["--cat" as string]: AGENDA_CAT[k].color }} onClick={() => set("category", k)}>
                {AGENDA_CAT[k].icon} {catLabel(k, lang)}
              </button>
            ))}
          </div>
        </div>

        <label className={c.field}>
          <span>{L("Judul", "Title")} *</span>
          <input className={c.input} value={d.title} onChange={(e) => set("title", e.target.value)} placeholder={L("mis. Kunjungan PT Maju Jaya", "e.g. Visit from PT Maju Jaya")} autoFocus required maxLength={160} />
        </label>

        <div className={c.fields3}>
          <label className={c.field}>
            <span>{L("Tanggal", "Date")} *</span>
            <input type="date" className={c.input} value={d.eventDate} onChange={(e) => set("eventDate", e.target.value)} required />
          </label>
          <label className={c.field}>
            <span>{L("Mulai", "Start")}</span>
            <input type="time" className={c.input} value={d.eventTime ?? ""} onChange={(e) => set("eventTime", e.target.value)} />
          </label>
          <label className={c.field}>
            <span>{L("Selesai", "End")}</span>
            <input type="time" className={c.input} value={d.endTime ?? ""} onChange={(e) => set("endTime", e.target.value)} aria-invalid={!!timeErr} />
          </label>
        </div>
        {timeErr && <div className={c.fieldErr}>{L("Jam selesai harus setelah jam mulai.", "End time must be after start time.")}</div>}

        <div className={c.fields2}>
          <label className={c.field}>
            <span>{L("Lokasi", "Location")}</span>
            <input className={c.input} value={d.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder={L("mis. Ruang Meeting Lt. 2", "e.g. Meeting Room 2F")} maxLength={160} />
          </label>
          <label className={c.field}>
            <span>{L("PIC / Penanggung jawab", "Person in charge")}</span>
            <input className={c.input} value={d.pic ?? ""} onChange={(e) => set("pic", e.target.value)} maxLength={120} />
          </label>
        </div>

        <label className={c.field}>
          <span>{L("Tautkan ke penugasan driver", "Link to a driver task")}</span>
          <select className={c.input} value={linkedElsewhere ? "" : d.taskId ?? ""} onChange={(e) => set("taskId", e.target.value || null)}>
            <option value="">{linkable.length ? L("— Tidak ditautkan —", "— Not linked —") : L("— Tidak ada penugasan di tanggal ini —", "— No tasks on this date —")}</option>
            {linkable.map((t) => (
              <option key={t.id} value={t.id}>{taskLine(t)} → {t.tujuan || t.jenis_pekerjaan} ({lang === "en" ? STATUS[t.status].en : STATUS[t.status].id})</option>
            ))}
          </select>
          {linkedElsewhere && <small className={c.hint}>{L("Tanggal diubah — tautan penugasan lama akan dilepas.", "Date changed — the previous task link will be removed.")}</small>}
        </label>

        <label className={c.field}>
          <span>{L("Catatan", "Notes")}</span>
          <textarea className={`${c.input} ${c.textarea}`} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={1000} />
        </label>

        {err && <div className={c.msgErr}>{L("Gagal menyimpan", "Failed to save")}: {err}</div>}

        <div className={c.modalFoot}>
          {onDelete && <button type="button" className={`${c.ghost} ${c.dangerBtn}`} onClick={onDelete} disabled={busy}>{L("Hapus", "Delete")}</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className={c.ghost} onClick={onCancel} disabled={busy}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={c.primary} disabled={!valid || busy}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </div>
  );
}
