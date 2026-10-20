"use client";

/* Induction Room — grid ketersediaan mingguan, booking (boleh lebih dari 1 jam), booking berulang,
   penolakan jadwal bentrok (dicek di layar & ditegakkan database), sinkron otomatis ke Kalender & Agenda. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { bookRoom, deleteBooking, getBookings, updateBooking } from "@/lib/receptionist/api";
import {
  addDays, fmtDate, fromMin, overlaps, parseISO, repeatDates, toMin, todayISO, weekStart,
  type RcpSettings, type RepeatMode, type RoomBooking,
} from "@/lib/receptionist/model";
import { ExportButtons, NameInput, col, type Directory } from "./shared";
import r from "./receptionist.module.css";

const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const SLOT_PX = 26;

interface Draft { id?: string; seriesId?: string | null; date: string; start: string; end: string; title: string; pic: string; department: string; attendees: string; notes: string; repeat: RepeatMode; until: string; count: number }

export default function RcpRoom({ settings, dir, onChanged }: { settings: RcpSettings; dir: Directory; onChanged: () => void }) {
  const [week, setWeek] = useState(weekStart(todayISO()));
  const [rows, setRows] = useState<RoomBooking[]>([]);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [now, setNow] = useState(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  const load = useCallback(async () => {
    try { setRows(await getBookings(week, addDays(week, 6))); setErr(""); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [week]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const open = toMin(settings.openTime), close = toMin(settings.closeTime), step = settings.slotMinutes;
  const slots = useMemo(() => { const a: number[] = []; for (let m = open; m < close; m += step) a.push(m); return a; }, [open, close, step]);
  const today = todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pxOf = (min: number) => ((min - open) / step) * SLOT_PX;

  function newAt(date: string, startMin: number) {
    const end = Math.min(close, startMin + Math.max(60, step));
    setDraft({ date, start: fromMin(startMin), end: fromMin(end), title: "", pic: "", department: "", attendees: "", notes: "", repeat: "none", until: addDays(date, 28), count: 0 });
  }
  function edit(b: RoomBooking) {
    setDraft({ id: b.id, seriesId: b.seriesId, date: b.date, start: b.start, end: b.end, title: b.title, pic: b.pic, department: b.department, attendees: b.attendees ? String(b.attendees) : "", notes: b.notes, repeat: "none", until: b.date, count: 0 });
  }

  const weekLabel = `${fmtDate(days[0], { day: "numeric", month: "short" })} – ${fmtDate(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
  const draftDates = draft && !draft.id ? repeatDates(draft.date, draft.repeat, draft.until, draft.count) : draft ? [draft.date] : [];

  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <div className={r.weekNav}>
          <button type="button" className={r.ghost} onClick={() => setWeek(addDays(week, -7))} aria-label="Minggu sebelumnya">‹</button>
          <b>{weekLabel}</b>
          <button type="button" className={r.ghost} onClick={() => setWeek(addDays(week, 7))} aria-label="Minggu berikutnya">›</button>
          <button type="button" className={r.ghost} onClick={() => setWeek(weekStart(today))}>Minggu ini</button>
        </div>
        <span className={r.row}>
          <ExportButtons rows={rows} title={`Booking ${settings.roomName}`} filename="Booking_Induction_Room" period={weekLabel} columns={[
            col<RoomBooking>("tgl", "Tanggal", (b) => fmtDate(b.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })),
            col<RoomBooking>("jam", "Jam", (b) => `${b.start}–${b.end}`), col<RoomBooking>("judul", "Keperluan", (b) => b.title),
            col<RoomBooking>("pic", "PIC", (b) => b.pic), col<RoomBooking>("dept", "Departemen", (b) => b.department),
            col<RoomBooking>("org", "Peserta", (b) => b.attendees ?? "", "right"), col<RoomBooking>("ket", "Catatan", (b) => b.notes)]} />
          <button type="button" className={r.btn} onClick={() => newAt(today < days[0] || today > days[6] ? days[0] : today, Math.max(open, Math.min(close - step, Math.ceil(nowMin / step) * step)))}>+ Booking</button>
        </span>
      </div>
      <div className={r.legend}>
        <span><i style={{ background: "var(--green)" }} />Terbooking</span>
        <span><i style={{ border: "1px dashed var(--green)" }} />Booking berulang</span>
        <span><i style={{ background: "var(--red)" }} />Garis = sekarang</span>
        <span className={r.mute}>Jam operasional {settings.openTime}–{settings.closeTime} · slot {step} menit · klik slot kosong untuk booking</span>
      </div>
      {err && <div className={r.err}>{err}</div>}

      <div className={r.wk} style={{ ["--sh" as string]: `${SLOT_PX}px` }}>
        <div className={r.wkCorner} />
        {days.map((d, i) => (
          <div key={d} className={`${r.wkHead} ${d === today ? r.wkToday : ""}`}>{DOW[i]}<small>{parseISO(d).getDate()} {fmtDate(d, { month: "short" })}</small></div>
        ))}
        <div className={r.wkTimes}>
          {slots.map((m) => <div key={m} className={r.wkTime}>{m % 60 === 0 ? fromMin(m) : ""}</div>)}
        </div>
        {days.map((d) => {
          const dayRows = rows.filter((b) => b.date === d);
          const past = (m: number) => d < today || (d === today && m + step <= nowMin);
          return (
            <div key={d} className={r.wkDay}>
              {slots.map((m) => (
                <div key={m} className={`${r.wkCell} ${past(m) ? r.wkPast : ""}`} title={past(m) ? "" : `${fmtDate(d)} ${fromMin(m)}`}
                  onClick={() => { if (!past(m) && !dayRows.some((b) => overlaps(b.start, b.end, fromMin(m), fromMin(m + step)))) newAt(d, m); }} />
              ))}
              {dayRows.map((b) => (
                <button key={b.id} type="button" className={`${r.bk} ${b.seriesId ? r.bkSeries : ""}`}
                  style={{ top: pxOf(toMin(b.start)), height: Math.max(SLOT_PX - 2, pxOf(toMin(b.end)) - pxOf(toMin(b.start)) - 2) }}
                  onClick={() => edit(b)} title={`${b.start}–${b.end} ${b.title}${b.pic ? ` · ${b.pic}` : ""}`}>
                  <b>{b.title}</b><small>{b.start}–{b.end}{b.pic ? ` · ${b.pic}` : ""}</small>
                </button>
              ))}
              {draft && draftDates.includes(d) && (
                <div className={`${r.bk} ${dayRows.some((b) => b.id !== draft.id && overlaps(b.start, b.end, draft.start, draft.end)) ? r.bkClash : r.bkDraft}`}
                  style={{ top: pxOf(toMin(draft.start)), height: Math.max(SLOT_PX - 2, pxOf(toMin(draft.end)) - pxOf(toMin(draft.start)) - 2) }}>
                  <b>{draft.title || "Booking baru"}</b><small>{draft.start}–{draft.end}</small>
                </div>
              )}
              {d === today && nowMin >= open && nowMin <= close && <div className={r.nowLine} style={{ top: pxOf(nowMin) }} />}
            </div>
          );
        })}
      </div>

      {draft && <BookingModal draft={draft} setDraft={setDraft} settings={settings} dir={dir} weekRows={rows} onDone={async () => { setDraft(null); await load(); onChanged(); }} />}
    </section>
  );
}

function BookingModal({ draft, setDraft, settings, dir, weekRows, onDone }: {
  draft: Draft; setDraft: (d: Draft | null) => void; settings: RcpSettings; dir: Directory; weekRows: RoomBooking[]; onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [skip, setSkip] = useState(false);
  const [known, setKnown] = useState<RoomBooking[]>(weekRows);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const open = toMin(settings.openTime), close = toMin(settings.closeTime), step = settings.slotMinutes;
  const times = useMemo(() => { const a: string[] = []; for (let m = open; m <= close; m += step) a.push(fromMin(m)); return a; }, [open, close, step]);
  const dates = draft.id ? [draft.date] : repeatDates(draft.date, draft.repeat, draft.until, draft.count);
  const durMin = toMin(draft.end) - toMin(draft.start);

  // Ambil booking pada rentang tanggal berulang supaya bentrok terlihat sebelum disimpan.
  const lastDate = dates[dates.length - 1] ?? draft.date;
  useEffect(() => {
    let off = false;
    getBookings(draft.date, lastDate).then((x) => { if (!off) setKnown(x); }).catch(() => {});
    return () => { off = true; };
  }, [draft.date, lastDate]);
  const clashes = dates.map((d) => ({ d, b: known.find((b) => b.date === d && b.id !== draft.id && overlaps(b.start, b.end, draft.start, draft.end)) })).filter((x) => x.b);
  const valid = draft.title.trim() && durMin > 0 && dates.length > 0;
  const canSave = valid && !busy && (clashes.length === 0 || (skip && clashes.length < dates.length));

  function setStart(v: string) {
    const keep = Math.max(step, durMin);
    setDraft({ ...draft, start: v, end: fromMin(Math.min(close, toMin(v) + keep)) });
  }
  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      const att = draft.attendees.trim() ? Math.max(0, parseInt(draft.attendees, 10) || 0) : null;
      if (draft.id) {
        await updateBooking(draft.id, { date: draft.date, start: draft.start, end: draft.end, title: draft.title, pic: draft.pic, department: draft.department, attendees: att, notes: draft.notes });
      } else {
        const res = await bookRoom({ slots: dates.map((d) => ({ date: d, start: draft.start, end: draft.end })), title: draft.title, pic: draft.pic, department: draft.department, attendees: att, notes: draft.notes, skipConflicts: skip });
        if (res.skipped.length) alert(`${res.created} booking dibuat. ${res.skipped.length} tanggal dilewati karena bentrok:\n` + res.skipped.map((x) => `• ${fmtDate(x.date)} — ${x.reason}`).join("\n"));
      }
      await onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function remove(series: boolean) {
    if (!draft.id) return;
    if (!confirm(series ? "Hapus booking ini dan semua jadwal berikutnya dalam seri yang sama?" : "Hapus booking ini?")) return;
    setBusy(true);
    try { await deleteBooking(draft.id, series ? draft.seriesId : null, draft.date); await onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <ModalPortal onOverlayClick={() => setDraft(null)} maxWidth={620}>
      <div className={r.modal}>
        <h3>{draft.id ? "Ubah booking" : `Booking ${settings.roomName}`}</h3>
        <div className={r.form}>
          <label className={`${r.field} ${r.full}`}><span>Keperluan *</span><input className={r.input} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="mis. Induction karyawan baru" autoFocus /></label>
          <label className={r.field}><span>PIC</span><NameInput dir={dir} value={draft.pic} onChange={(v) => set("pic", v)} onPick={(p) => p.department && !draft.department && set("department", p.department)} placeholder="Yang meminta" /></label>
          <label className={r.field}><span>Departemen</span><input className={r.input} value={draft.department} onChange={(e) => set("department", e.target.value)} /></label>
          <label className={r.field}><span>Tanggal</span><input className={r.input} type="date" value={draft.date} min={draft.id ? undefined : todayISO()} onChange={(e) => e.target.value && set("date", e.target.value)} /></label>
          <label className={r.field}><span>Jumlah peserta</span><input className={r.input} type="number" min={0} value={draft.attendees} onChange={(e) => set("attendees", e.target.value)} /></label>
          <label className={r.field}><span>Mulai</span>
            <select className={r.input} value={draft.start} onChange={(e) => setStart(e.target.value)}>{times.slice(0, -1).map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className={r.field}><span>Selesai <em>({durMin > 0 ? `${Math.floor(durMin / 60) ? `${Math.floor(durMin / 60)} jam ` : ""}${durMin % 60 ? `${durMin % 60} mnt` : ""}` : "–"})</em></span>
            <select className={r.input} value={draft.end} onChange={(e) => set("end", e.target.value)}>{times.filter((t) => toMin(t) > toMin(draft.start)).map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          {!draft.id && (
            <div className={`${r.field} ${r.full}`}><span>Ulangi</span>
              <div className={r.chips}>
                {([["none", "Tidak"], ["daily", "Setiap hari"], ["weekdays", "Hari kerja (Sen–Jum)"], ["weekly", "Setiap minggu"]] as [RepeatMode, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={r.chip} aria-pressed={draft.repeat === k} onClick={() => set("repeat", k)}>{l}</button>
                ))}
              </div>
              {draft.repeat !== "none" && (
                <div className={r.row} style={{ marginTop: 6 }}>
                  <span className={r.mute}>sampai</span><input className={r.input} style={{ width: 170 }} type="date" value={draft.until} min={draft.date} onChange={(e) => set("until", e.target.value)} />
                  <span className={r.mute}>→ {dates.length} jadwal{dates.length >= 60 ? " (maks 60)" : ""}</span>
                </div>
              )}
            </div>
          )}
          <label className={`${r.field} ${r.full}`}><span>Catatan</span><input className={r.input} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="mis. butuh proyektor, layout kelas" /></label>
        </div>
        {clashes.length > 0 && (
          <div className={r.warn}>
            Bentrok pada {clashes.length} jadwal: {clashes.slice(0, 4).map((x) => `${fmtDate(x.d, { day: "numeric", month: "short" })} (“${x.b!.title}” ${x.b!.start}–${x.b!.end})`).join(", ")}{clashes.length > 4 ? ", …" : ""}.
            {dates.length > 1 && clashes.length < dates.length && (
              <label className={r.row} style={{ marginTop: 6, gap: 6 }}><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Lewati tanggal yang bentrok, booking sisanya ({dates.length - clashes.length})</label>
            )}
          </div>
        )}
        <p className={r.hint}>Booking otomatis muncul di Kalender &amp; Agenda (kategori Pelatihan).</p>
        {err && <div className={r.err}>{err}</div>}
        <div className={r.modalActions}>
          {draft.id && <button type="button" className={`${r.ghost} ${r.danger}`} disabled={busy} onClick={() => remove(false)}>Hapus</button>}
          {draft.id && draft.seriesId && <button type="button" className={`${r.ghost} ${r.danger}`} disabled={busy} onClick={() => remove(true)}>Hapus seri berikutnya</button>}
          <span className={r.grow} />
          <button type="button" className={r.ghost} onClick={() => setDraft(null)}>Batal</button>
          <button type="button" className={r.btn} disabled={!canSave} onClick={save}>{busy ? "Menyimpan…" : draft.id ? "Simpan" : dates.length > 1 ? `Booking ${skip ? dates.length - clashes.length : dates.length} jadwal` : "Booking"}</button>
        </div>
      </div>
    </ModalPortal>
  );
}

