"use client";

/* Induction Room — grid ketersediaan mingguan, booking (boleh lebih dari 1 jam), booking berulang,
   penolakan jadwal bentrok (dicek di layar & ditegakkan database), sinkron otomatis ke Kalender & Agenda. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { bookRoom, deleteBooking, emailBooking, getBookingSeries, getBookings, updateBooking } from "@/lib/receptionist/api";
import {
  addDays, fmtDate, fromMin, overlaps, parseISO, repeatDates, toMin, todayISO, weekStart,
  receiptFromBooking, type RcpSettings, type RepeatMode, type RoomBooking,
} from "@/lib/receptionist/model";
import { ExportButtons, NameInput, col, lookupPerson, type Directory } from "./shared";
import { ProofModal } from "./ProofCard";
import r from "./receptionist.module.css";

import { L } from "@/lib/i18n";
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const SLOT_PX = 26;

interface Draft { id?: string; seriesId?: string | null; date: string; start: string; end: string; title: string; pic: string; email: string; department: string; attendees: string; notes: string; repeat: RepeatMode; until: string; count: number }

export default function RcpRoom({ settings, dir, onChanged }: { settings: RcpSettings; dir: Directory; onChanged: () => void }) {
  const [week, setWeek] = useState(weekStart(todayISO()));
  const [rows, setRows] = useState<RoomBooking[]>([]);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [proof, setProof] = useState<{ b: RoomBooking; series: RoomBooking[]; note?: string } | null>(null);
  const [now, setNow] = useState(new Date());
  async function openProof(b: RoomBooking, series?: RoomBooking[], note?: string) {
    let ss = series ?? [];
    if (!series && b.seriesId) { try { ss = await getBookingSeries(b.seriesId); } catch { ss = []; } }
    setProof({ b, series: ss, note });
  }
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
    // 1 jam, tapi dipendekkan bila menabrak booking berikutnya di hari itu
    const nextStart = rows.filter((b) => b.date === date && toMin(b.start) > startMin).map((b) => toMin(b.start)).sort((a, b) => a - b)[0] ?? close;
    const end = Math.min(close, nextStart, startMin + Math.max(60, step));
    setDraft({ date, start: fromMin(startMin), end: fromMin(end), title: "", pic: "", email: "", department: "", attendees: "", notes: "", repeat: "none", until: addDays(date, 28), count: 0 });
  }
  /** "+ Booking": slot kosong pertama minggu ini (hari ini mulai dari jam sekarang). */
  function quickNew() {
    const startDay = today < days[0] || today > days[6] ? days[0] : today;
    for (const d of days.filter((x) => x >= startDay)) {
      const from = d === today ? Math.ceil(nowMin / step) * step : open;
      for (let m = Math.max(open, from); m + step <= close; m += step) {
        if (!rows.some((b) => b.date === d && overlaps(b.start, b.end, fromMin(m), fromMin(m + step)))) { newAt(d, m); return; }
      }
    }
    newAt(startDay, open);
  }
  function edit(b: RoomBooking) {
    setDraft({ id: b.id, seriesId: b.seriesId, date: b.date, start: b.start, end: b.end, title: b.title, pic: b.pic, email: b.picEmail, department: b.department, attendees: b.attendees ? String(b.attendees) : "", notes: b.notes, repeat: "none", until: b.date, count: 0 });
  }

  const weekLabel = `${fmtDate(days[0], { day: "numeric", month: "short" })} – ${fmtDate(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
  const draftDates = draft && !draft.id ? repeatDates(draft.date, draft.repeat, draft.until, draft.count) : draft ? [draft.date] : [];

  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <div className={r.weekNav}>
          <button type="button" className={r.ghost} onClick={() => setWeek(addDays(week, -7))} aria-label={L("Minggu sebelumnya", "Previous week")}>‹</button>
          <b>{weekLabel}</b>
          <button type="button" className={r.ghost} onClick={() => setWeek(addDays(week, 7))} aria-label={L("Minggu berikutnya", "Next week")}>›</button>
          <button type="button" className={r.ghost} onClick={() => setWeek(weekStart(today))}>{L("Minggu ini", "This week")}</button>
        </div>
        <span className={r.row}>
          <ExportButtons rows={rows} title={`Booking ${settings.roomName}`} filename="Booking_Induction_Room" period={weekLabel} columns={[
            col<RoomBooking>("tgl", L("Tanggal", "Date"), (b) => fmtDate(b.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })),
            col<RoomBooking>("jam", L("Jam", "Time"), (b) => `${b.start}–${b.end}`), col<RoomBooking>("judul", L("Keperluan", "Purpose"), (b) => b.title),
            col<RoomBooking>("pic", "PIC", (b) => b.pic), col<RoomBooking>("dept", L("Departemen", "Department"), (b) => b.department),
            col<RoomBooking>("org", L("Peserta", "Attendees"), (b) => b.attendees ?? "", "right"), col<RoomBooking>("ket", L("Catatan", "Notes"), (b) => b.notes)]} />
          <button type="button" className={`${r.btn} ${r.btnSm}`} onClick={quickNew}>+ Booking</button>
        </span>
      </div>
      <div className={r.legend}>
        <span><i style={{ background: "var(--green)" }} />Terbooking</span>
        <span><i style={{ border: "1px dashed var(--green)" }} />Booking berulang</span>
        <span><i style={{ background: "var(--red)" }} />{L("Garis = sekarang", "Line = now")}</span>
        <span className={r.mute}>{L(`Jam operasional ${settings.openTime}–${settings.closeTime} · slot ${step} menit · klik slot kosong untuk booking`, `Operating hours ${settings.openTime}–${settings.closeTime} · ${step}-minute slots · click an empty slot to book`)}</span>
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

      {draft && <BookingModal draft={draft} setDraft={setDraft} settings={settings} dir={dir} weekRows={rows}
        onProof={(b) => { setDraft(null); openProof(b); }}
        onDone={async (created) => { setDraft(null); await load(); onChanged(); if (created?.first) openProof(created.first, created.series); }} />}
      {proof && (
        <ProofModal data={receiptFromBooking(proof.b, proof.series)} token={proof.b.shareToken || undefined} email={proof.b.picEmail} phone={lookupPerson(dir, proof.b.pic)?.phone}
          onEmail={proof.b.picEmail ? () => emailBooking(proof.b, proof.b.picEmail, proof.series.length || 1) : undefined} onClose={() => setProof(null)} />
      )}
    </section>
  );
}

function BookingModal({ draft, setDraft, settings, dir, weekRows, onDone, onProof }: {
  draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft | null>>; settings: RcpSettings; dir: Directory; weekRows: RoomBooking[];
  onDone: (created?: { first: RoomBooking | null; series: RoomBooking[] }) => Promise<void>; onProof: (b: RoomBooking) => void;
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
        await updateBooking(draft.id, { date: draft.date, start: draft.start, end: draft.end, title: draft.title, pic: draft.pic, email: draft.email, department: draft.department, attendees: att, notes: draft.notes });
        await onDone();
      } else {
        const res = await bookRoom({ slots: dates.map((d) => ({ date: d, start: draft.start, end: draft.end })), title: draft.title, pic: draft.pic, email: draft.email, department: draft.department, attendees: att, notes: draft.notes, skipConflicts: skip });
        const notes: string[] = [];
        if (res.skipped.length) notes.push(L(`${res.skipped.length} tanggal dilewati karena bentrok:\n`, `${res.skipped.length} date(s) skipped due to clashes:\n`) + res.skipped.map((x) => `• ${fmtDate(x.date)} — ${x.reason}`).join("\n"));
        if (res.first && draft.email.trim()) {
          try { await emailBooking(res.first, draft.email.trim(), res.series.length || 1); } catch (e) { notes.push(e instanceof Error ? e.message : String(e)); }
        }
        if (notes.length) alert(`${res.created} booking dibuat.\n\n${notes.join("\n\n")}`);
        await onDone({ first: res.first, series: res.series });
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function remove(series: boolean) {
    if (!draft.id) return;
    if (!confirm(series ? L("Hapus booking ini dan semua jadwal berikutnya dalam seri yang sama?", "Delete this booking and all following bookings in the same series?") : L("Hapus booking ini?", "Delete this booking?"))) return;
    setBusy(true);
    try { await deleteBooking(draft.id, series ? draft.seriesId : null, draft.date); await onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <ModalPortal onOverlayClick={() => setDraft(null)} maxWidth={620}>
      <div className={r.modal} role="dialog" aria-modal="true" aria-labelledby="rcp-bk-title">
        <div className={r.modalHead}>
          <div><h2 id="rcp-bk-title">{draft.id ? L("Ubah booking", "Edit booking") : `Booking ${settings.roomName}`}</h2><p>Jam operasional {settings.openTime}–{settings.closeTime}</p></div>
          <button type="button" className={r.iconBtn} onClick={() => setDraft(null)} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <div className={r.form}>
          <div className={r.section}>Detail</div>
          <label className={`${r.field} ${r.full}`}><span>Keperluan *</span><input className={r.input} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="mis. Induction karyawan baru" autoFocus /></label>
          <label className={r.field}><span>PIC</span><NameInput dir={dir} value={draft.pic} onChange={(v) => set("pic", v)} onPick={(p) => setDraft((d) => (d ? { ...d, email: p.email || d.email, department: p.department || d.department } : d))} placeholder="Yang meminta" /></label>
          <label className={r.field}><span>{L("Departemen", "Department")}</span><input className={r.input} value={draft.department} onChange={(e) => set("department", e.target.value)} /></label>
          <label className={`${r.field} ${r.full}`}><span>Email PIC <em>(konfirmasi & bukti booking dikirim ke sini)</em></span><input className={r.input} type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@perusahaan.com" /></label>
          <div className={r.section}>Waktu</div>
          <label className={r.field}><span>{L("Tanggal", "Date")}</span><input className={r.input} type="date" value={draft.date} min={draft.id ? undefined : todayISO()} onChange={(e) => e.target.value && set("date", e.target.value)} /></label>
          <label className={r.field}><span>{L("Jumlah peserta", "Number of attendees")}</span><input className={r.input} type="number" min={0} value={draft.attendees} onChange={(e) => set("attendees", e.target.value)} /></label>
          <label className={r.field}><span>{L("Mulai", "Start")}</span>
            <select className={r.input} value={draft.start} onChange={(e) => setStart(e.target.value)}>{times.slice(0, -1).map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className={r.field}><span>{L("Selesai", "Done")} <em>({durMin > 0 ? `${Math.floor(durMin / 60) ? `${Math.floor(durMin / 60)} jam ` : ""}${durMin % 60 ? `${durMin % 60} mnt` : ""}` : "–"})</em></span>
            <select className={r.input} value={draft.end} onChange={(e) => set("end", e.target.value)}>{times.filter((t) => toMin(t) > toMin(draft.start)).map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          {!draft.id && (
            <div className={`${r.field} ${r.full}`}><span>Ulangi <em>(booking berulang)</em></span>
              <div className={r.chips}>
                {([["none", L("Tidak", "None")], ["daily", L("Setiap hari", "Every day")], ["weekdays", L("Hari kerja (Sen–Jum)", "Weekdays (Mon–Fri)")], ["weekly", L("Setiap minggu", "Every week")]] as [RepeatMode, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={r.chip} aria-pressed={draft.repeat === k} onClick={() => set("repeat", k)}>{l}</button>
                ))}
              </div>
              {draft.repeat !== "none" && (
                <div className={r.row} style={{ marginTop: 8 }}>
                  <span className={r.mute} style={{ fontSize: 13 }}>{L("Sampai", "Until")}</span><input className={r.input} style={{ width: 180 }} type="date" value={draft.until} min={draft.date} onChange={(e) => set("until", e.target.value)} />
                  <span className={`${r.pill} ${r.pBlue}`}>{dates.length} jadwal{dates.length >= 60 ? " (maks 60)" : ""}</span>
                </div>
              )}
            </div>
          )}
          <label className={`${r.field} ${r.full}`}><span>{L("Catatan", "Notes")}</span><input className={r.input} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="mis. butuh proyektor, layout kelas" /></label>
        </div>
        {clashes.length > 0 && (
          <div className={r.warn}>
            {L("Bentrok pada", "Clashes on")} {clashes.length} {L("jadwal", "schedule(s)")}: {clashes.slice(0, 4).map((x) => `${fmtDate(x.d, { day: "numeric", month: "short" })} (“${x.b!.title}” ${x.b!.start}–${x.b!.end})`).join(", ")}{clashes.length > 4 ? ", …" : ""}.
            {dates.length > 1 && clashes.length < dates.length && (
              <label className={r.check} style={{ marginTop: 8, display: "flex" }}><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> {L("Lewati tanggal yang bentrok, booking sisanya", "Skip clashing dates, book the rest")} ({dates.length - clashes.length})</label>
            )}
          </div>
        )}
        {err && <div className={r.err}>{err}</div>}
        <div className={r.modalFoot}>
          {draft.id && <button type="button" className={r.dangerBtn} disabled={busy} onClick={() => remove(false)}>{L("Hapus", "Delete")}</button>}
          {draft.id && draft.seriesId && <button type="button" className={r.dangerBtn} disabled={busy} onClick={() => remove(true)}>{L("Hapus seri berikutnya", "Delete following series")}</button>}
          {draft.id && (() => { const b = known.find((x) => x.id === draft.id) ?? weekRows.find((x) => x.id === draft.id); return b ? <button type="button" className={r.proofBtn} style={{ minHeight: 38 }} onClick={() => onProof(b)}>🧾 {L("Bukti", "Receipt")}</button> : null; })()}
          {!draft.id && <span className={r.hint}>Otomatis muncul di Kalender &amp; Agenda.</span>}
          <span className={r.grow} />
          <button type="button" className={r.ghost} onClick={() => setDraft(null)}>{L("Batal", "Cancel")}</button>
          <button type="button" className={r.btn} disabled={!canSave} onClick={save}>{busy ? L("Menyimpan…", "Saving…") : draft.id ? L("Simpan", "Save") : dates.length > 1 ? `Booking ${skip ? dates.length - clashes.length : dates.length} jadwal` : "Booking"}</button>
        </div>
      </div>
    </ModalPortal>
  );
}

