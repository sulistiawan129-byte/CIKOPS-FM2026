"use client";

/* Cleaning & Gardening — input langsung di CIKOPS (038: CIKOPS sumber utama, Excel mengikuti).
   • GaChecklist : checklist actual harian (✓ dikerjakan / ✗ tidak / – kosong) per lokasi
   • GaMaster    : master pekerjaan (hari jadwal Sen–Min, maks 4) & manpower + generate jadwal
   • GaLogModal  : form Event / Improvement / Inventory
   • GaModeCard  : pilih sumber data (Excel lama ↔ CIKOPS) */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteGaJob, deleteGaManpower, generateGaPlan, getGaPlan, saveGaJob, saveGaManpower, setGaActual, setGaMaster,
  type GaJobInput,
} from "@/lib/ga/api";
import { GA_DAYS, GA_DAY_SHORT, jobDays, periodeOf, type GaJob, type GaManpower, type GaPlan, type GaSyncStatus } from "@/lib/ga/model";
import { toLocalISODate } from "@/lib/dateUtils";
import a from "./atk.module.css";
import m from "./gamanage.module.css";

type Lang = "id" | "en";
const BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toLocalISODate(d); };
const mondayOf = (iso: string) => { const d = new Date(iso + "T00:00:00"); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return toLocalISODate(d); };
const fmtLong = (iso: string) => { const d = new Date(iso + "T00:00:00"); return `${HARI_FULL[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`; };
const perLabel = (p: number) => `${BLN[(p % 100) - 1]} ${Math.floor(p / 100)}`;
const DAY2: Record<string, string> = { Senin: "Sn", Selasa: "Sl", Rabu: "Rb", Kamis: "Km", Jumat: "Jm", Sabtu: "Sb", Minggu: "Mg" };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Banner bila masih mode Excel (input CIKOPS belum aktif). */
export function GaExcelModeNote({ lang, sync, onGoSync }: { lang: Lang; sync: GaSyncStatus | null; onGoSync: () => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  if (!sync || sync.master === "cikops") return null;
  return (
    <div className={m.modeNote}>
      <span>ℹ️</span>
      <p><b>{L("Masih mode Excel", "Still in Excel mode")}</b>{L(" — data diambil dari Excel SPV. Aktifkan CIKOPS sebagai sumber utama supaya bisa input di sini.", " — data comes from the SPV Excel. Switch CIKOPS to master to enter data here.")}</p>
      <button type="button" className={a.smallBtn} onClick={onGoSync}>{L("Atur sumber data →", "Set data source →")}</button>
    </div>
  );
}

/* ════════════ CHECKLIST HARIAN ════════════ */
export function GaChecklist({ lang, editable, onChanged }: { lang: Lang; editable: boolean; onChanged: () => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const today = toLocalISODate(new Date());
  const [date, setDate] = useState(today);
  const [week, setWeek] = useState<GaPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, 0 | 1 | null>>({});
  const [team, setTeam] = useState("Semua");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const wk = mondayOf(date);

  const load = useCallback(async () => {
    setLoading(true);
    try { setWeek(await getGaPlan(wk, addDays(wk, 6))); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [wk]);
  useEffect(() => { load(); }, [load]);

  const pending = Object.keys(edits).length;
  function go(newDate: string) {
    if (pending && !confirm(L(`Ada ${pending} perubahan belum disimpan. Pindah tanggal tanpa menyimpan?`, `${pending} unsaved changes. Leave without saving?`))) return;
    setEdits({}); setDate(newDate); setMsg(null);
  }
  const val = (r: GaPlan) => (r.key in edits ? edits[r.key] : r.actual);
  function setVal(r: GaPlan, v: 0 | 1 | null) {
    if (!editable) return;
    setEdits((e) => {
      const n = { ...e };
      if (v === r.actual) delete n[r.key]; else n[r.key] = v;
      return n;
    });
  }

  const teams = useMemo(() => ["Semua", ...Array.from(new Set(week.map((r) => r.tim).filter(Boolean)))], [week]);
  const dayRows = week.filter((r) => r.tanggal === date && (team === "Semua" || r.tim === team) &&
    (!q || [r.lokasi, r.tipe, r.area, r.petugas, r.jobId].join(" ").toLowerCase().includes(q.toLowerCase())));
  const groups = useMemo(() => {
    const g = new Map<string, GaPlan[]>();
    dayRows.forEach((r) => { const k = `${r.tim} · ${r.lokasi || "—"}`; const x = g.get(k) ?? []; x.push(r); g.set(k, x); });
    return [...g.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [dayRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = dayRows.filter((r) => val(r) === 1).length;
  const not = dayRows.filter((r) => val(r) === 0).length;
  const empty = dayRows.length - done - not;
  const pct = dayRows.length ? Math.round((done / dayRows.length) * 100) : 0;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(wk, i);
    const rs = week.filter((r) => r.tanggal === d && (team === "Semua" || r.tim === team));
    return { d, total: rs.length, filled: rs.filter((r) => r.actual !== null).length, done: rs.filter((r) => r.actual === 1).length };
  });

  async function save() {
    setSaving(true); setErr(null);
    try {
      const rows = Object.entries(edits).map(([key, actual]) => ({ key, actual }));
      const n = await setGaActual(rows);
      setMsg(L(`✓ ${n} jadwal tersimpan.`, `✓ ${n} entries saved.`));
      setEdits({}); await load(); onChanged();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className={m.wrap}>
      <section className={m.dayHead}>
        <div className={m.dayNav}>
          <button type="button" className={m.navBtn} onClick={() => go(addDays(date, -1))} aria-label={L("Hari sebelumnya", "Previous day")}>‹</button>
          <div>
            <small>{L("Checklist harian", "Daily checklist")}</small>
            <b>{fmtLong(date)}</b>
          </div>
          <button type="button" className={m.navBtn} onClick={() => go(addDays(date, 1))} aria-label={L("Hari berikutnya", "Next day")}>›</button>
          {date !== today && <button type="button" className={a.smallBtn} onClick={() => go(today)}>{L("Hari ini", "Today")}</button>}
          <input type="date" className={m.dateInput} value={date} onChange={(e) => e.target.value && go(e.target.value)} aria-label={L("Pilih tanggal", "Pick date")} />
        </div>
        <div className={m.dayStats}>
          <div className={m.ring} style={{ ["--p" as string]: pct }}><div><b>{pct}%</b><small>{L("selesai", "done")}</small></div></div>
          <div className={m.statList}>
            <span><i className={m.dDone} />{L("Dikerjakan", "Done")} <b>{done}</b></span>
            <span><i className={m.dNot} />{L("Tidak", "Not done")} <b>{not}</b></span>
            <span><i className={m.dEmpty} />{L("Belum diisi", "Empty")} <b>{empty}</b></span>
          </div>
        </div>
      </section>

      <div className={m.week}>
        {days.map((x) => {
          const fill = x.total ? x.filled / x.total : 0;
          return (
            <button key={x.d} type="button" className={`${m.weekDay} ${x.d === date ? m.weekOn : ""} ${x.d === today ? m.weekToday : ""}`} onClick={() => go(x.d)}>
              <small>{GA_DAY_SHORT[HARI_FULL[new Date(x.d + "T00:00:00").getDay()]]}</small>
              <b>{Number(x.d.slice(8))}</b>
              <span className={m.weekBar}><span style={{ width: `${fill * 100}%` }} className={fill >= 1 ? m.barFull : ""} /></span>
              <em>{x.total ? `${x.filled}/${x.total}` : "—"}</em>
            </button>
          );
        })}
      </div>

      <div className={a.toolbar}>
        <input className={`${a.input} ${a.search}`} placeholder={L("Cari lokasi, pekerjaan, area, petugas…", "Search location, job, area, staff…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={a.seg} role="group">
          {teams.map((t) => <button key={t} type="button" className={team === t ? a.segOn : ""} onClick={() => setTeam(t)} aria-pressed={team === t}>{t === "Semua" ? L("Semua tim", "All teams") : t}</button>)}
        </div>
      </div>

      {err && <div className={a.msgErr}>{err}</div>}
      {msg && <div className={a.msgOk}>{msg}</div>}
      {!editable && <div className={m.readOnly}>{L("Mode lihat saja — input actual dilakukan di Excel selama sumber data masih Excel.", "View only — actuals are entered in Excel while Excel is the data source.")}</div>}

      {loading ? <div className={a.skeleton} style={{ height: 220 }} /> : dayRows.length === 0 ? (
        <div className={m.empty}><span>🗓️</span><b>{L("Tidak ada jadwal di tanggal ini", "No schedule on this date")}</b><small>{L("Jadwal dibuat dari Master Pekerjaan → Generate jadwal.", "Schedules come from Job Master → Generate schedule.")}</small></div>
      ) : (
        <div className={m.groups}>
          {groups.map(([k, rows]) => {
            const gDone = rows.filter((r) => val(r) === 1).length;
            return (
              <section key={k} className={m.group}>
                <div className={m.groupHead}>
                  <b>{k}</b>
                  <span>{gDone}/{rows.length}</span>
                  {editable && rows.some((r) => val(r) === null) && (
                    <button type="button" className={a.smallBtn} onClick={() => rows.forEach((r) => val(r) === null && setVal(r, 1))}>✓ {L("Kosong = dikerjakan", "Empty = done")}</button>
                  )}
                </div>
                <ul className={m.rows}>
                  {rows.map((r) => {
                    const v = val(r);
                    const changed = r.key in edits;
                    return (
                      <li key={r.key} className={`${m.row} ${v === 1 ? m.rDone : v === 0 ? m.rNot : ""} ${changed ? m.rChanged : ""}`}>
                        <div className={m.rowMain}>
                          <b>{r.tipe}</b>
                          <small>{[r.area, r.petugas && `👤 ${r.petugas}`, r.jobId].filter(Boolean).join(" · ")}</small>
                          {r.spv && r.actual !== null && !changed && <em>{L("diisi", "by")} {r.spv}</em>}
                        </div>
                        <div className={m.tri} role="group" aria-label={r.tipe}>
                          <button type="button" className={v === 1 ? m.tDone : ""} onClick={() => setVal(r, v === 1 ? null : 1)} disabled={!editable} aria-pressed={v === 1} title={L("Dikerjakan", "Done")}>✓</button>
                          <button type="button" className={v === 0 ? m.tNot : ""} onClick={() => setVal(r, v === 0 ? null : 0)} disabled={!editable} aria-pressed={v === 0} title={L("Tidak dikerjakan", "Not done")}>✕</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {pending > 0 && (
        <div className={m.saveBar}>
          <span><b>{pending}</b> {L("perubahan belum disimpan", "unsaved changes")}</span>
          <button type="button" className={a.ghostBtn} onClick={() => setEdits({})} disabled={saving}>{L("Batal", "Discard")}</button>
          <button type="button" className={a.primary} onClick={save} disabled={saving}>{saving ? L("Menyimpan…", "Saving…") : L("Simpan checklist", "Save checklist")}</button>
        </div>
      )}
    </div>
  );
}

/* ════════════ MASTER PEKERJAAN & MANPOWER ════════════ */
interface JobDraft extends GaJobInput { isNew: boolean }
const TEAMS = ["Cleaning Service", "Gardener"];

export function GaMaster({ lang, jobs, manpower, periode, editable, onChanged }: {
  lang: Lang; jobs: GaJob[]; manpower: GaManpower[]; periode: number; editable: boolean; onChanged: () => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [sub, setSub] = useState<"jobs" | "people">("jobs");
  const [q, setQ] = useState("");
  const [tim, setTim] = useState("Semua");
  const [showOff, setShowOff] = useState(false);
  const [job, setJob] = useState<JobDraft | null>(null);
  const [person, setPerson] = useState<(GaManpower & { isNew: boolean }) | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = toLocalISODate(new Date());
  const curPeriode = periodeOf(today);

  const teams = useMemo(() => ["Semua", ...Array.from(new Set([...TEAMS, ...jobs.map((j) => j.tim).filter(Boolean)]))], [jobs]);
  const list = jobs.filter((j) => (showOff || j.aktif) && (tim === "Semua" || j.tim === tim) &&
    (!q || [j.id, j.lokasi, j.tipe, j.area, j.petugas].join(" ").toLowerCase().includes(q.toLowerCase())));
  const people = manpower.filter((p) => !q || [p.nama, p.tim, p.jabatan, p.areaTugas].join(" ").toLowerCase().includes(q.toLowerCase()));
  const perDay = GA_DAYS.map((d) => jobs.filter((j) => j.aktif && jobDays(j.hari).includes(d)).length);
  const maxDay = Math.max(1, ...perDay);

  async function run(fn: () => Promise<string>) {
    setBusy(true); setErr(null); setMsg(null);
    try { setMsg(await fn()); onChanged(); }
    catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  }
  const genMonth = (p: number, rebuild: boolean) => run(async () => {
    const from = rebuild && p === curPeriode ? today : null;
    const r = await generateGaPlan(p, from, rebuild);
    return rebuild
      ? L(`Jadwal ${perLabel(p)} diperbarui${from ? " mulai hari ini" : ""}: ${r.added} ditambah, ${r.removed} diganti (yang sudah diisi tidak berubah). Total ${r.total}.`, `${perLabel(p)} schedule refreshed: ${r.added} added, ${r.removed} replaced. Total ${r.total}.`)
      : L(`Jadwal ${perLabel(p)}: ${r.added} jadwal baru dibuat. Total ${r.total}.`, `${perLabel(p)}: ${r.added} new entries. Total ${r.total}.`);
  });

  async function removeJob(j: GaJob) {
    if (!confirm(L(`Hapus pekerjaan ${j.id} — ${j.tipe}?\nJadwal mendatang yang belum diisi ikut dihapus; riwayat yang sudah diisi tetap ada.`, `Delete job ${j.id}?`))) return;
    run(async () => { const r = await deleteGaJob(j.id); return L(`${j.id} dihapus (${r.plan_removed} jadwal mendatang ikut dihapus).`, `${j.id} deleted.`); });
  }
  async function removePerson(p: GaManpower) {
    if (!confirm(L(`Hapus ${p.nama} dari manpower?`, `Remove ${p.nama}?`))) return;
    run(async () => { await deleteGaManpower(p.id); return L(`${p.nama} dihapus.`, `${p.nama} removed.`); });
  }

  return (
    <div className={m.wrap}>
      <div className={m.masterTop}>
        <div className={a.seg} role="tablist">
          <button type="button" className={sub === "jobs" ? a.segOn : ""} onClick={() => setSub("jobs")}>🧹 {L("Master pekerjaan", "Job master")} <small>{jobs.filter((j) => j.aktif).length}</small></button>
          <button type="button" className={sub === "people" ? a.segOn : ""} onClick={() => setSub("people")}>👥 Manpower <small>{manpower.length}</small></button>
        </div>
        <span className={a.grow} />
        {editable && sub === "jobs" && (
          <>
            <button type="button" className={a.ghostBtn} disabled={busy} onClick={() => genMonth(periode, false)} title={L("Tambah jadwal yang belum ada (tidak mengubah yang sudah ada)", "Add missing schedule entries")}>🗓️ {L("Generate", "Generate")} {perLabel(periode)}</button>
            <button type="button" className={a.ghostBtn} disabled={busy} onClick={() => genMonth(periode, true)} title={L("Terapkan perubahan master ke jadwal yang belum diisi", "Apply master changes to empty entries")}>♻️ {L("Perbarui jadwal", "Refresh schedule")}</button>
            <button type="button" className={a.primary} onClick={() => setJob({ isNew: true, tim: tim !== "Semua" ? tim : "Cleaning Service", lokasi: "", tipe: "", area: "", hari: [], petugas: "", aktif: true, catatan: "" })}>+ {L("Pekerjaan", "Job")}</button>
          </>
        )}
        {editable && sub === "people" && <button type="button" className={a.primary} onClick={() => setPerson({ isNew: true, id: "", nama: "", tim: "Cleaning Service", jabatan: "", areaTugas: "", status: "Aktif", noHp: "" })}>+ Manpower</button>}
      </div>

      {err && <div className={a.msgErr}>{err}</div>}
      {msg && <div className={a.msgOk}>{msg}</div>}

      {sub === "jobs" ? (
        <>
          <section className={m.dayLoad}>
            <b>{L("Beban jadwal per hari", "Workload per weekday")}</b>
            <div className={m.dayLoadBars}>
              {GA_DAYS.map((d, i) => (
                <div key={d}><em>{perDay[i]}</em><i><span style={{ height: `${(perDay[i] / maxDay) * 100}%` }} /></i><small>{GA_DAY_SHORT[d]}</small></div>
              ))}
            </div>
          </section>
          <section className={a.card}>
            <div className={a.toolbar}>
              <input className={`${a.input} ${a.search}`} placeholder={L("Cari ID, lokasi, pekerjaan, area, petugas…", "Search ID, location, job, area, staff…")} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className={a.seg}>{teams.map((t) => <button key={t} type="button" className={tim === t ? a.segOn : ""} onClick={() => setTim(t)}>{t === "Semua" ? L("Semua", "All") : t}</button>)}</div>
              <label className={m.check}><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> {L("Tampilkan nonaktif", "Show inactive")}</label>
            </div>
            {list.length === 0 ? <p className={a.empty}>{L("Belum ada pekerjaan. Tambahkan master pekerjaan, lalu Generate jadwal.", "No jobs yet.")}</p> : (
              <div className={a.tableWrap}>
                <table className={a.table}>
                  <thead><tr><th>ID</th><th>Tim</th><th>{L("Lokasi / Area", "Location / Area")}</th><th>{L("Pekerjaan", "Job")}</th><th>{L("Hari", "Days")}</th><th>{L("Petugas", "Staff")}</th><th /></tr></thead>
                  <tbody>{list.map((j) => {
                    const ds = jobDays(j.hari);
                    return (
                      <tr key={j.id} className={j.aktif ? "" : m.rowOff}>
                        <td className={a.mono} style={{ whiteSpace: "nowrap" }}>{j.id}</td>
                        <td>{j.tim}</td>
                        <td><b>{j.lokasi || "—"}</b>{j.area && <><br /><small className={a.mute}>{j.area}</small></>}</td>
                        <td>{j.tipe}{j.catatan && <><br /><small className={a.mute}>📝 {j.catatan}</small></>}</td>
                        <td><span className={m.days}>{GA_DAYS.map((d) => <i key={d} className={ds.includes(d) ? m.dayOn : ""} title={d}>{DAY2[d]}</i>)}</span>{!j.aktif && <small className={a.mute}> {L("nonaktif", "inactive")}</small>}</td>
                        <td>{j.petugas || "—"}</td>
                        <td className={a.rowAct}>{editable && <>
                          <button type="button" className={a.smallBtn} onClick={() => setJob({ isNew: false, id: j.id, tim: j.tim, lokasi: j.lokasi, tipe: j.tipe, area: j.area, hari: ds, petugas: j.petugas, aktif: j.aktif, catatan: j.catatan, frek: j.frek })}>{L("Ubah", "Edit")}</button>{" "}
                          <button type="button" className={a.iconBtn} onClick={() => removeJob(j)} aria-label={L("Hapus", "Delete")}>✕</button>
                        </>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className={a.card}>
          <div className={a.toolbar}><input className={`${a.input} ${a.search}`} placeholder={L("Cari nama, tim, jabatan…", "Search name, team, role…")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {people.length === 0 ? <p className={a.empty}>{L("Belum ada manpower.", "No manpower yet.")}</p> : (
            <div className={m.people}>
              {people.map((p) => (
                <div key={p.id} className={`${m.person} ${/nonaktif/i.test(p.status) ? m.rowOff : ""}`}>
                  <span className={m.avatar}>{p.nama.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                  <div><b>{p.nama}</b><small>{[p.tim, p.jabatan, p.areaTugas].filter(Boolean).join(" · ") || "—"}</small>{p.noHp && <small>📱 {p.noHp}</small>}</div>
                  <span className={/nonaktif/i.test(p.status) ? a.tagPending : a.tagExcel}>{p.status || "Aktif"}</span>
                  {editable && <span className={m.personAct}>
                    <button type="button" className={a.smallBtn} onClick={() => setPerson({ ...p, isNew: false })}>{L("Ubah", "Edit")}</button>
                    <button type="button" className={a.iconBtn} onClick={() => removePerson(p)} aria-label={L("Hapus", "Delete")}>✕</button>
                  </span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {job && <JobModal lang={lang} initial={job} jobs={jobs} manpower={manpower} onClose={() => setJob(null)}
        onSaved={async (id, isNew) => {
          setJob(null);
          await run(async () => {
            // Terapkan langsung ke jadwal bulan berjalan (mulai hari ini, yang belum diisi saja)
            const r = await generateGaPlan(curPeriode, today, true).catch(() => null);
            return `${isNew ? L("Pekerjaan baru", "New job") : L("Pekerjaan", "Job")} ${id} ${L("tersimpan", "saved")}${r ? L(` · jadwal ${perLabel(curPeriode)} diperbarui mulai hari ini (${r.total} jadwal).`, ` · schedule refreshed.`) : "."}`;
          });
        }} />}
      {person && <PersonModal lang={lang} initial={person} onClose={() => setPerson(null)}
        onSaved={(nama) => { setPerson(null); setMsg(L(`${nama} tersimpan.`, `${nama} saved.`)); onChanged(); }} />}
    </div>
  );
}

function JobModal({ lang, initial, jobs, manpower, onClose, onSaved }: {
  lang: Lang; initial: JobDraft; jobs: GaJob[]; manpower: GaManpower[]; onClose: () => void; onSaved: (id: string, isNew: boolean) => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [d, setD] = useState<JobDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof JobDraft>(k: K, v: JobDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const lokasiList = Array.from(new Set(jobs.filter((j) => j.tim === d.tim).map((j) => j.lokasi).filter(Boolean))).sort();
  const areaList = Array.from(new Set(jobs.filter((j) => j.lokasi === d.lokasi).map((j) => j.area).filter(Boolean))).sort();
  const tipeList = Array.from(new Set(jobs.filter((j) => j.tim === d.tim).map((j) => j.tipe).filter(Boolean))).sort();
  const petugasList = manpower.filter((p) => !d.tim || p.tim === d.tim).map((p) => p.nama);
  function toggleDay(day: string) {
    setD((x) => {
      if (x.hari.includes(day)) return { ...x, hari: x.hari.filter((h) => h !== day) };
      if (x.hari.length >= 4) { setErr(L("Maksimal 4 hari per pekerjaan (kolom Hari 1–4 di Excel). Untuk jadwal harian, buat 2 pekerjaan.", "Max 4 days per job.")); return x; }
      setErr(null);
      return { ...x, hari: GA_DAYS.filter((g) => [...x.hari, day].includes(g)) };
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { isNew, id, ...rest } = d;
      const r = await saveGaJob(isNew ? null : id ?? null, { ...rest, frek: undefined });
      onSaved(r.id, isNew);
    } catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  }
  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ga-job-title" style={{ width: "min(640px, 100%)" }}>
        <div className={a.modalHead}>
          <h2 id="ga-job-title">{d.isNew ? L("Pekerjaan baru", "New job") : `${L("Ubah pekerjaan", "Edit job")} · ${d.id}`}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <div className={a.field}>
          <span>Tim *</span>
          <div className={a.seg}>
            {Array.from(new Set([...TEAMS, d.tim].filter(Boolean))).map((t) => <button key={t} type="button" className={d.tim === t ? a.segOn : ""} onClick={() => set("tim", t)}>{t}</button>)}
          </div>
          {d.isNew && <small className={a.mute}>{L("ID dibuat otomatis: Cleaning Service → CS-###, Gardener → GD-###.", "ID is generated automatically.")}</small>}
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>{L("Lokasi", "Location")}</span><input className={a.input} list="ga-lok" value={d.lokasi} onChange={(e) => set("lokasi", e.target.value)} placeholder={L("mis. Gedung A lt. 1", "e.g. Building A")} /></label>
          <label className={a.field}><span>Area</span><input className={a.input} list="ga-area" value={d.area} onChange={(e) => set("area", e.target.value)} placeholder={L("mis. Lobby, Toilet pria", "e.g. Lobby")} /></label>
        </div>
        <datalist id="ga-lok">{lokasiList.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="ga-area">{areaList.map((x) => <option key={x} value={x} />)}</datalist>
        <label className={a.field}><span>{L("Tipe pekerjaan", "Job type")} *</span><input className={a.input} list="ga-tipe" value={d.tipe} onChange={(e) => set("tipe", e.target.value)} placeholder={L("mis. Sapu & pel lantai", "e.g. Mop floor")} required /></label>
        <datalist id="ga-tipe">{tipeList.map((x) => <option key={x} value={x} />)}</datalist>
        <div className={a.field}>
          <span>{L("Hari jadwal", "Schedule days")} * <small className={a.mute}>({d.hari.length}/4)</small></span>
          <div className={m.dayPick}>
            {GA_DAYS.map((day) => <button key={day} type="button" className={d.hari.includes(day) ? m.dayPickOn : ""} onClick={() => toggleDay(day)} aria-pressed={d.hari.includes(day)}>{GA_DAY_SHORT[day]}</button>)}
          </div>
          <small className={a.mute}>{L("Frekuensi otomatis:", "Frequency:")} {d.hari.length <= 1 ? "W" : `${d.hari.length}W`} ({d.hari.length || 0}× {L("seminggu", "a week")})</small>
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>{L("Petugas", "Staff")}</span><input className={a.input} list="ga-ptg" value={d.petugas} onChange={(e) => set("petugas", e.target.value)} /></label>
          <label className={a.field}><span>{L("Catatan", "Note")}</span><input className={a.input} value={d.catatan} onChange={(e) => set("catatan", e.target.value)} /></label>
        </div>
        <datalist id="ga-ptg">{petugasList.map((x) => <option key={x} value={x} />)}</datalist>
        <label className={m.check}><input type="checkbox" checked={d.aktif} onChange={(e) => set("aktif", e.target.checked)} /> {L("Aktif (dibuatkan jadwal)", "Active (scheduled)")}</label>
        {err && <div className={a.msgErr}>{err}</div>}
        <div className={a.modalFoot}>
          <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={a.primary} disabled={busy}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function PersonModal({ lang, initial, onClose, onSaved }: { lang: Lang; initial: GaManpower & { isNew: boolean }; onClose: () => void; onSaved: (nama: string) => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await saveGaManpower(d.isNew ? null : d.id, { nama: d.nama, tim: d.tim, jabatan: d.jabatan, area_tugas: d.areaTugas, status: d.status, no_hp: d.noHp ?? "" });
      onSaved(d.nama);
    } catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  }
  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ga-mp-title">
        <div className={a.modalHead}>
          <h2 id="ga-mp-title">{d.isNew ? L("Manpower baru", "New manpower") : `${L("Ubah", "Edit")} · ${d.nama}`}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <label className={a.field}><span>{L("Nama", "Name")} *</span><input className={a.input} value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} required autoFocus /></label>
        <div className={a.field}><span>Tim</span>
          <div className={a.seg}>{[...TEAMS, "TGA"].map((t) => <button key={t} type="button" className={d.tim === t ? a.segOn : ""} onClick={() => setD({ ...d, tim: t })}>{t}</button>)}</div>
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>{L("Jabatan", "Role")}</span><input className={a.input} value={d.jabatan} onChange={(e) => setD({ ...d, jabatan: e.target.value })} /></label>
          <label className={a.field}><span>{L("Area tugas", "Assigned area")}</span><input className={a.input} value={d.areaTugas} onChange={(e) => setD({ ...d, areaTugas: e.target.value })} /></label>
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>No HP</span><input className={a.input} inputMode="tel" value={d.noHp ?? ""} onChange={(e) => setD({ ...d, noHp: e.target.value })} /></label>
          <label className={a.field}><span>Status</span>
            <select className={a.input} value={/nonaktif/i.test(d.status) ? "Nonaktif" : "Aktif"} onChange={(e) => setD({ ...d, status: e.target.value })}><option>Aktif</option><option>Nonaktif</option></select>
          </label>
        </div>
        {err && <div className={a.msgErr}>{err}</div>}
        <div className={a.modalFoot}>
          <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={a.primary} disabled={busy}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/* ════════════ FORM EVENT / IMPROVEMENT / INVENTORY ════════════ */
export interface LogField { key: string; label: string; type?: "text" | "date" | "textarea" | "number"; options?: string[]; required?: boolean; wide?: boolean }

export function GaLogModal({ lang, title, fields, initial, onClose, onSubmit }: {
  lang: Lang; title: string; fields: LogField[]; initial: Record<string, string>; onClose: () => void; onSubmit: (v: Record<string, string>) => Promise<void>;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [v, setV] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await onSubmit(v); } catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  }
  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ga-log-title" style={{ width: "min(620px, 100%)" }}>
        <div className={a.modalHead}><h2 id="ga-log-title">{title}</h2><button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button></div>
        <div className={m.formGrid}>
          {fields.map((f) => (
            <label key={f.key} className={`${a.field} ${f.wide || f.type === "textarea" ? m.wide : ""}`}>
              <span>{f.label}{f.required ? " *" : ""}</span>
              {f.type === "textarea" ? (
                <textarea className={a.input} style={{ height: 84, padding: "10px 12px", resize: "vertical" }} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} required={f.required} />
              ) : (
                <>
                  <input className={a.input} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} list={f.options ? `ga-opt-${f.key}` : undefined}
                    value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} required={f.required} />
                  {f.options && <datalist id={`ga-opt-${f.key}`}>{f.options.map((o) => <option key={o} value={o} />)}</datalist>}
                </>
              )}
            </label>
          ))}
        </div>
        {err && <div className={a.msgErr}>{err}</div>}
        <div className={a.modalFoot}>
          <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={a.primary} disabled={busy}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/* ════════════ SUMBER DATA ════════════ */
export function GaModeCard({ lang, sync, onChanged }: { lang: Lang; sync: GaSyncStatus | null; onChanged: () => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isC = sync?.master === "cikops";
  async function switchTo(mode: "excel" | "cikops") {
    const txt = mode === "cikops"
      ? L("Jadikan CIKOPS sumber utama?\n\n• Data sekarang (hasil sinkron Excel terakhir) jadi data awal.\n• Semua input (master, jadwal, checklist, event, improvement, inventory) dilakukan di CIKOPS.\n• Excel lama tidak bisa mengirim lagi; pasang modSyncGA v2 untuk menarik data dari CIKOPS.", "Make CIKOPS the master?")
      : L("Kembalikan ke mode Excel? Data dari Excel akan menimpa data di CIKOPS pada sinkron berikutnya.", "Switch back to Excel mode? Excel will overwrite CIKOPS data on the next sync.");
    if (!confirm(txt)) return;
    setBusy(true); setErr(null);
    try { await setGaMaster(mode); onChanged(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <section className={`${a.card} ${m.modeCard} ${isC ? m.modeC : ""}`}>
      <div className={a.cardHead}><div><h2>{L("Sumber data utama", "Master data source")}</h2><p>{isC ? L("CIKOPS → Excel: input di CIKOPS, Excel menarik & mengikuti.", "CIKOPS → Excel: enter data in CIKOPS, Excel pulls & follows.") : L("Excel → CIKOPS (mode lama): input di Excel SPV.", "Excel → CIKOPS (legacy): enter data in the SPV Excel.")}</p></div></div>
      <div className={m.modeRow}>
        <div className={`${m.modeOpt} ${!isC ? m.modeOptOn : ""}`}><b>📗 Excel</b><small>{L("Mode lama — CIKOPS hanya membaca.", "Legacy — CIKOPS read-only.")}</small></div>
        <span className={m.modeArrow}>⇄</span>
        <div className={`${m.modeOpt} ${isC ? m.modeOptOn : ""}`}><b>🟦 CIKOPS</b><small>{L("Template & input di sistem; Excel jadi cermin/laporan.", "Templates & input in the system; Excel mirrors.")}</small></div>
      </div>
      {sync?.isAdmin ? (
        isC ? <button type="button" className={a.ghostBtn} disabled={busy} onClick={() => switchTo("excel")}>{L("Kembali ke mode Excel", "Back to Excel mode")}</button>
          : <button type="button" className={a.primary} disabled={busy} onClick={() => switchTo("cikops")}>🟦 {L("Jadikan CIKOPS sumber utama", "Make CIKOPS the master")}</button>
      ) : <p className={a.hint}>{L("Hanya admin yang bisa mengganti sumber data.", "Only admins can change the data source.")}</p>}
      {isC && sync?.masterSince && <p className={a.hint}>{L("Aktif sejak", "Active since")} {new Date(sync.masterSince).toLocaleString("id-ID")}{sync.lastPullAt ? ` · ${L("Excel terakhir menarik", "Excel last pulled")} ${new Date(sync.lastPullAt).toLocaleString("id-ID")}${sync.lastPullComputer ? ` (${sync.lastPullComputer})` : ""}` : ` · ${L("Excel belum pernah menarik", "Excel hasn't pulled yet")}`}</p>}
      {err && <div className={a.msgErr}>{err}</div>}
    </section>
  );
}

