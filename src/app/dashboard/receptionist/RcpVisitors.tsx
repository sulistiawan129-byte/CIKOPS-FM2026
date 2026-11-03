"use client";

/* Tamu yang datang — buku tamu harian: catat tamu (nama, instansi, jumlah orang, bertemu siapa, keperluan, kartu tamu),
   catat pulang, koreksi & hapus, ekspor. Data: rcp_visitors (supabase/04_aplikasi_lapangan.sql bagian 055). */

import { useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { SearchPick } from "@/components/SearchPick";
import { checkoutVisitor, createVisitor, deleteVisitor, undoCheckoutVisitor, updateVisitor } from "@/lib/receptionist/api";
import { VISIT_PURPOSES, addDays, fmtDate, fmtDateTime, fmtDuration, fmtTime, todayISO, visitMinutes, visitPurposeLabel, type Visitor } from "@/lib/receptionist/model";
import { ExportButtons, NameInput, col, hueOf, initialsOf, type Directory } from "./shared";
import { useNow } from "./useNow";
import r from "./receptionist.module.css";
import d from "./rcpdash.module.css";

import { L } from "@/lib/i18n";

const z = (n: number) => String(n).padStart(2, "0");
/** ISO → nilai <input type="datetime-local"> (waktu lokal perangkat). */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const t = new Date(iso);
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T${z(t.getHours())}:${z(t.getMinutes())}`;
};

/** Kartu avatar bulat berwarna stabil per nama. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hueOf(name || "?");
  return <span className={d.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `linear-gradient(135deg, hsl(${h} 70% 52%), hsl(${(h + 40) % 360} 70% 42%))` }} aria-hidden>{initialsOf(name)}</span>;
}

/* ───────────── Dialog catat / ubah tamu ───────────── */
export function VisitorModal({ edit, dir, history, onClose, onSaved }: {
  edit: Visitor | null; dir: Directory; history: Visitor[]; onClose: () => void; onSaved: (msg: string) => void | Promise<void>;
}) {
  const now = toLocalInput(new Date().toISOString());
  const [f, setF] = useState({
    name: edit?.name ?? "", company: edit?.company ?? "", phone: edit?.phone ?? "", pax: edit?.pax ?? 1, host: edit?.host ?? "", department: edit?.department ?? "",
    purpose: edit?.purpose ?? "Meeting", badge: edit?.badge ?? "", notes: edit?.notes ?? "",
    checkedIn: toLocalInput(edit?.checkedInAt) || now, checkedOut: toLocalInput(edit?.checkedOutAt),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // tamu yang pernah datang → pilih nama, instansi & HP terisi sendiri
  const known = useMemo(() => {
    const m = new Map<string, Visitor>();
    for (const v of history) { const k = v.name.trim().toLowerCase(); if (k && !m.has(k)) m.set(k, v); }
    return m;
  }, [history]);
  const options = useMemo(() => [...known.values()].map((v) => ({ key: v.name.toLowerCase(), name: v.name, hint: [v.company, v.phone].filter(Boolean).join(" · ") || undefined })), [known]);
  const fillKnown = (name: string) => {
    const v = known.get(name.trim().toLowerCase());
    if (v) setF((x) => ({ ...x, company: x.company || v.company, phone: x.phone || v.phone }));
  };

  const inMs = f.checkedIn ? new Date(f.checkedIn).getTime() : NaN;
  const outMs = f.checkedOut ? new Date(f.checkedOut).getTime() : null;
  const timeErr = !Number.isFinite(inMs) ? L("Isi jam datang.", "Enter the arrival time.") : inMs > Date.now() + 3600000 ? L("Jam datang tidak boleh di masa depan.", "Arrival time cannot be in the future.")
    : outMs !== null && outMs < inMs ? L("Jam pulang tidak boleh sebelum jam datang.", "Departure cannot be before arrival.") : "";
  const canSave = f.name.trim() && f.pax >= 1 && !timeErr && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      const base = { name: f.name, company: f.company, phone: f.phone, pax: f.pax, host: f.host, department: f.department, purpose: f.purpose, badge: f.badge, notes: f.notes };
      if (edit) await updateVisitor(edit.id, { ...base, checkedIn: new Date(f.checkedIn).toISOString(), checkedOut: f.checkedOut ? new Date(f.checkedOut).toISOString() : null });
      else await createVisitor({ ...base, checkedIn: new Date(f.checkedIn).toISOString() });
      await onSaved(edit ? L(`✓ Data ${f.name} diperbarui`, `✓ ${f.name} updated`) : L(`✓ ${f.name}${f.pax > 1 ? ` (+${f.pax - 1})` : ""} tercatat datang`, `✓ ${f.name}${f.pax > 1 ? ` (+${f.pax - 1})` : ""} checked in`));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <ModalPortal onOverlayClick={busy ? undefined : onClose} maxWidth={640}>
      <form className={r.modal} onSubmit={(e) => { e.preventDefault(); void save(); }} role="dialog" aria-modal="true" aria-labelledby="rcp-visitor-title">
        <div className={r.modalHead}>
          <div className={d.modalTitle}>
            <span className={d.modalIcon} aria-hidden>🙋</span>
            <div><h2 id="rcp-visitor-title">{edit ? L("Ubah data tamu", "Edit visitor") : L("Catat tamu datang", "Check in a visitor")}</h2>
              <p>{edit ? L("Koreksi isian, jam datang, atau jam pulang.", "Correct the details, arrival or departure time.") : L("Cukup nama & jumlah orang — sisanya opsional.", "Just the name & number of people — the rest is optional.")}</p></div>
          </div>
          <button type="button" className={r.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <div className={r.form}>
          <label className={`${r.field} ${r.full}`}><span>{L("Nama tamu", "Visitor name")} *</span>
            <SearchPick inputClassName={r.input} value={f.name} onChange={(v) => set("name", v)} onPick={(o) => fillKnown(o.name)} onBlur={() => fillKnown(f.name)} options={options} required maxLength={120}
              placeholder={L("Ketik nama — tamu yang pernah datang muncul sebagai saran", "Type a name — returning visitors appear as suggestions")} ariaLabel={L("Nama tamu", "Visitor name")} autoFocus />
          </label>
          <label className={r.field}><span>{L("Perusahaan / instansi", "Company / organisation")}</span><input className={r.input} value={f.company} onChange={(e) => set("company", e.target.value)} maxLength={120} /></label>
          <label className={r.field}><span>{L("No. HP", "Phone")}</span><input className={r.input} value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" maxLength={40} /></label>
          <div className={r.field}><span>{L("Jumlah orang", "Number of people")} *</span>
            <div className={d.stepper}>
              <button type="button" onClick={() => set("pax", Math.max(1, f.pax - 1))} aria-label={L("Kurangi", "Decrease")}>−</button>
              <input value={f.pax} inputMode="numeric" aria-label={L("Jumlah orang", "Number of people")} onChange={(e) => set("pax", Math.min(500, Math.max(1, Math.round(Number(e.target.value.replace(/\D/g, ""))) || 1)))} />
              <button type="button" onClick={() => set("pax", Math.min(500, f.pax + 1))} aria-label={L("Tambah", "Increase")}>+</button>
            </div>
          </div>
          <label className={r.field}><span>{L("No. kartu tamu", "Visitor badge no.")} <em>({L("opsional", "optional")})</em></span><input className={r.input} value={f.badge} onChange={(e) => set("badge", e.target.value)} maxLength={30} placeholder="K-07" /></label>
          <label className={r.field}><span>{L("Bertemu dengan", "Meeting with")}</span>
            <NameInput dir={dir} value={f.host} onChange={(v) => set("host", v)} onPick={(p) => setF((x) => ({ ...x, department: p.department || x.department }))} placeholder={L("Nama karyawan yang dituju", "Employee being visited")} /></label>
          <label className={r.field}><span>{L("Departemen", "Department")}</span><input className={r.input} value={f.department} onChange={(e) => set("department", e.target.value)} maxLength={120} /></label>
          <div className={`${r.field} ${r.full}`}><span>{L("Keperluan", "Purpose")}</span>
            <div className={r.chips}>{VISIT_PURPOSES.map((t) => <button key={t} type="button" className={r.chip} aria-pressed={f.purpose === t} onClick={() => set("purpose", t)}>{visitPurposeLabel(t)}</button>)}</div>
          </div>
          <label className={r.field}><span>{L("Jam datang", "Arrival")}</span><input className={r.input} type="datetime-local" value={f.checkedIn} max={now} onChange={(e) => set("checkedIn", e.target.value)} required /></label>
          {edit
            ? <label className={r.field}><span>{L("Jam pulang", "Departure")} <em>({L("kosong = masih di lokasi", "empty = still on site")})</em></span><input className={r.input} type="datetime-local" value={f.checkedOut} max={now} onChange={(e) => set("checkedOut", e.target.value)} /></label>
            : <div className={r.field}><span>{L("Status", "Status")}</span><div className={d.hintBox}>{L("Otomatis “Di lokasi” — tekan Pulang saat tamu keluar.", "Starts as “On site” — press Check out when the visitor leaves.")}</div></div>}
          <label className={`${r.field} ${r.full}`}><span>{L("Catatan", "Notes")} <em>({L("opsional", "optional")})</em></span><input className={r.input} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={300} /></label>
        </div>
        {edit?.updatedAt && <p className={r.hint}>{L("Terakhir diubah", "Last edited")}: {edit.updatedBy || "–"} · {fmtDateTime(edit.updatedAt)}</p>}
        {(timeErr || err) && <div className={r.err}>{err || timeErr}</div>}
        <div className={r.modalFoot}>
          <button type="button" className={r.ghost} onClick={onClose} disabled={busy}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={r.btn} disabled={!canSave}>{busy ? L("Menyimpan…", "Saving…") : edit ? L("Simpan perubahan", "Save changes") : L("Catat tamu datang", "Check in")}</button>
        </div>
      </form>
    </ModalPortal>
  );
}

/* ───────────── Tab Tamu ───────────── */
type Filter = "all" | "in" | "out";

export default function RcpVisitors({ visitors, day, setDay, reload, onNew, onEdit, notify }: {
  visitors: Visitor[]; day: string; setDay: (d: string) => void; reload: () => Promise<void>;
  onNew: () => void; onEdit: (v: Visitor) => void; notify: (m: { ok: boolean; text: string }) => void;
}) {
  const now = useNow(30000);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayISO();

  const ofDay = useMemo(() => visitors.filter((v) => v.visitDate === day).sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)), [visitors, day]);
  const shown = ofDay.filter((v) => (filter === "all" || (filter === "in" ? !v.checkedOutAt : !!v.checkedOutAt)) && (!q.trim() || `${v.name} ${v.company} ${v.host} ${v.department} ${v.badge}`.toLowerCase().includes(q.trim().toLowerCase())));
  const guests = ofDay.reduce((s, v) => s + v.pax, 0);
  const inside = ofDay.filter((v) => !v.checkedOutAt);
  const done = ofDay.filter((v) => v.checkedOutAt);
  const avg = done.length ? Math.round(done.reduce((s, v) => s + visitMinutes(v, now), 0) / done.length) : 0;

  async function act(id: string, fn: () => Promise<void>, ok: string) {
    setBusy(id);
    try { await fn(); await reload(); notify({ ok: true, text: ok }); } catch (e) { notify({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  }
  function remove(v: Visitor) {
    if (!confirm(L(`Hapus catatan tamu “${v.name}”${v.pax > 1 ? ` (${v.pax} orang)` : ""}?\nHanya untuk data yang salah catat. Tindakan ini tidak bisa dibatalkan.`, `Delete the visitor record “${v.name}”${v.pax > 1 ? ` (${v.pax} people)` : ""}?\nOnly for entries made by mistake. This cannot be undone.`))) return;
    void act(v.id, () => deleteVisitor(v.id), L("✓ Catatan tamu dihapus", "✓ Visitor record deleted"));
  }

  return (
    <div className={d.visWrap}>
      <section className={r.card}>
        <div className={r.cardHead}>
          <div><h2>{L("Buku tamu", "Visitor log")}</h2><p>{fmtDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{day === today ? ` · ${L("hari ini", "today")}` : ""}</p></div>
          <div className={r.row}>
            <div className={d.dayNav} role="group" aria-label={L("Pilih tanggal", "Pick a date")}>
              <button type="button" onClick={() => setDay(addDays(day, -1))} aria-label={L("Hari sebelumnya", "Previous day")}>‹</button>
              <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={L("Tanggal", "Date")} />
              <button type="button" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label={L("Hari berikutnya", "Next day")}>›</button>
            </div>
            {day !== today && <button type="button" className={r.ghost} onClick={() => setDay(today)}>{L("Hari ini", "Today")}</button>}
            <button type="button" className={r.btn} onClick={onNew}>＋ {L("Tamu datang", "Check in visitor")}</button>
          </div>
        </div>

        <div className={d.visStats}>
          <div><b>{guests}</b><small>{L("orang datang", "people arrived")}</small></div>
          <div><b>{ofDay.length}</b><small>{L("kunjungan", "visits")}</small></div>
          <div className={inside.length ? d.statLive : undefined}><b>{inside.length}</b><small>{L("masih di lokasi", "still on site")}</small></div>
          <div><b>{avg ? fmtDuration(avg) : "–"}</b><small>{L("rata-rata berkunjung", "average stay")}</small></div>
        </div>

        <div className={r.toolbar}>
          <div className={r.seg} role="group" aria-label={L("Filter status", "Status filter")}>
            {([["all", `${L("Semua", "All")} (${ofDay.length})`], ["in", `${L("Di lokasi", "On site")} (${inside.length})`], ["out", `${L("Sudah pulang", "Left")} (${done.length})`]] as [Filter, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <input className={`${r.input} ${r.search}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Cari nama, perusahaan, yang ditemui…", "Search name, company, host…")} aria-label={L("Cari tamu", "Search visitors")} />
          <span className={r.grow} />
          <ExportButtons rows={ofDay} title={`${L("Buku Tamu", "Visitor Log")} ${fmtDate(day)}`} filename={`Buku_Tamu_${day}`} period={fmtDate(day)} columns={[
            col<Visitor>("n", L("Nama", "Name"), (v) => v.name), col<Visitor>("c", L("Perusahaan", "Company"), (v) => v.company), col<Visitor>("p", L("Orang", "People"), (v) => v.pax, "right"),
            col<Visitor>("h", L("Bertemu", "Meeting"), (v) => v.host), col<Visitor>("d", L("Departemen", "Department"), (v) => v.department), col<Visitor>("k", L("Keperluan", "Purpose"), (v) => visitPurposeLabel(v.purpose)),
            col<Visitor>("b", L("Kartu", "Badge"), (v) => v.badge), col<Visitor>("i", L("Datang", "In"), (v) => fmtTime(v.checkedInAt)), col<Visitor>("o", L("Pulang", "Out"), (v) => (v.checkedOutAt ? fmtTime(v.checkedOutAt) : "–")),
            col<Visitor>("t", L("Lama", "Stay"), (v) => fmtDuration(visitMinutes(v, now)), "right"),
          ]} />
        </div>

        {shown.length === 0 ? (
          <div className={d.emptyArt}>
            <span aria-hidden>{ofDay.length ? "🔍" : "☕"}</span>
            <b>{ofDay.length ? L("Tidak ada yang cocok", "No match") : day === today ? L("Lobby masih sepi", "The lobby is quiet") : L("Tidak ada tamu pada tanggal ini", "No visitors on this date")}</b>
            <p>{ofDay.length ? L("Ubah filter atau kata pencarian.", "Change the filter or search.") : L("Tekan “Tamu datang” saat ada tamu yang tiba.", "Press “Check in visitor” when someone arrives.")}</p>
          </div>
        ) : (
          <ul className={d.visList}>
            {shown.map((v) => {
              const minutes = visitMinutes(v, now);
              const longStay = !v.checkedOutAt && minutes >= 240;
              return (
                <li key={v.id} className={`${d.visRow} ${v.checkedOutAt ? "" : d.visLive}`}>
                  <Avatar name={v.name} />
                  <div className={d.visMain}>
                    <div className={d.visName}><b>{v.name}</b>{v.pax > 1 && <span className={d.paxTag}>×{v.pax}</span>}
                      {v.purpose && <span className={d.purposeTag}>{visitPurposeLabel(v.purpose)}</span>}
                      {v.badge && <span className={d.badgeTag}>🪪 {v.badge}</span>}</div>
                    <div className={d.visSub}>{[v.company, v.host && L(`bertemu ${v.host}`, `meeting ${v.host}`), v.department].filter(Boolean).join(" · ") || "–"}</div>
                    {v.notes && <div className={d.visNote}>{v.notes}</div>}
                    {v.updatedAt && <div className={d.visNote}>{L("✎ diubah", "✎ edited")}{v.updatedBy ? ` ${L("oleh", "by")} ${v.updatedBy}` : ""} · {fmtDateTime(v.updatedAt)}</div>}
                  </div>
                  <div className={d.visTimes}>
                    <span>{fmtTime(v.checkedInAt)} → {v.checkedOutAt ? fmtTime(v.checkedOutAt) : <em className={d.liveDot}>{L("di lokasi", "on site")}</em>}</span>
                    <small className={longStay ? d.warnText : undefined}>{fmtDuration(minutes)}{longStay ? ` · ${L("lupa check-out?", "forgot to check out?")}` : ""}</small>
                  </div>
                  <div className={d.visActs}>
                    {v.checkedOutAt
                      ? <button type="button" className={r.ghost} disabled={busy === v.id} onClick={() => act(v.id, () => undoCheckoutVisitor(v.id), L("✓ Pulang dibatalkan — tamu kembali “di lokasi”", "✓ Check-out undone — visitor is back “on site”"))} title={L("Batalkan catatan pulang", "Undo the check-out")} aria-label={L("Batalkan catatan pulang", "Undo the check-out")}>↩</button>
                      : <button type="button" className={r.btn} disabled={busy === v.id} onClick={() => act(v.id, () => checkoutVisitor(v.id), L(`✓ ${v.name} tercatat pulang`, `✓ ${v.name} checked out`))}>{L("Pulang", "Check out")}</button>}
                    <button type="button" className={r.ghost} onClick={() => onEdit(v)} aria-label={L("Ubah", "Edit")} title={L("Ubah", "Edit")}>✎</button>
                    <button type="button" className={`${r.ghost} ${r.danger}`} disabled={busy === v.id} onClick={() => remove(v)} aria-label={L("Hapus", "Delete")} title={L("Hapus", "Delete")}>🗑</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
