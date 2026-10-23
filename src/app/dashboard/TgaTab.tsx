"use client";

/* ════════════════════════════════════════════════════════════
   TGA — Teknisi GA (menu sendiri, terpisah dari Cleaning & Gardening).
   • Papan tugas   : tugaskan teknisi, pantau Baru → Proses → Selesai
   • Data pekerjaan: CRUD semua pekerjaan (ubah teknisi/status/tanggal, batalkan, hapus)
   • Teknisi       : akun aplikasi /tga (nama + PIN)
   • Form penugasan: form publik /tugas-tga untuk semua staf GA (pakai kode)
   • Laporan       : rekap bulanan + ekspor
════════════════════════════════════════════════════════════ */

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getGaManpower, getGaTga } from "@/lib/ga/api";
import { inMonth, periodeOf, shiftPeriode, type GaManpower, type GaTga } from "@/lib/ga/model";
import type { MyProfile } from "@/lib/api";
import { toLocalISODate } from "@/lib/dateUtils";
import { useLang } from "@/lib/providers";
import { notifyTgaTask } from "@/lib/push";
import {
  TGA_CATEGORIES, TGA_SOURCE_LABEL, tgaAdminAssignConfig, tgaAdminCancel, tgaAdminDeleteActivity, tgaAdminSaveActivity, tgaAdminSetAssignCode,
  tgaAdminUsers, tgaAllActivities, tgaCategory, tgaPresence, tgaStatusLabel, subscribeTgaActivities,
  type TgaActivity, type TgaAssignConfig, type TgaStatus, type TgaUserRow,
} from "@/lib/tga/api";
import { exportGenericCsv, exportGenericExcel, exportGenericPdf } from "@/lib/reportEngine";
import type { ReportColumn, ReportLang } from "@/lib/reportEngine";
import a from "./atk.module.css";
import g from "./ga.module.css";
import t from "./tgatab.module.css";
import TgaAccounts from "./TgaAccounts";
import TgaReport, { perLabel } from "./TgaReport";
import TgaTasks from "./TgaTasks";

type Lang = "id" | "en";
type View = "board" | "jobs" | "techs" | "form" | "report";
interface Emp { id: string; nama: string; departement: string | null }

const ALL_STATUS: { id: TgaStatus; id_: string; en: string; tag: string }[] = [
  { id: "baru", id_: "Baru", en: "New", tag: "tagPending" },
  { id: "proses", id_: "Proses", en: "In progress", tag: "tagWeb" },
  { id: "pending", id_: "Pending", en: "Pending", tag: "tagPending" },
  { id: "butuh_part", id_: "Butuh part", en: "Needs part", tag: "tagPending" },
  { id: "selesai", id_: "Selesai", en: "Done", tag: "tagExcel" },
  { id: "batal", id_: "Dibatalkan", en: "Cancelled", tag: "tagWeb" },
];
const stInfo = (s: string) => ALL_STATUS.find((x) => x.id === s);
const OPEN: TgaStatus[] = ["baru", "proses", "pending", "butuh_part"];
const fmtD = (d: string | null, lang: Lang) => (d ? new Date(d + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function TgaTab({ myProfile }: { myProfile: MyProfile | null }) {
  void myProfile;
  const { lang: rawLang } = useLang();
  const lang: Lang = rawLang === "en" ? "en" : "id";
  const L = useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);

  const [view, setView] = useState<View>("board");
  const [periode, setPeriode] = useState(() => periodeOf(toLocalISODate(new Date())));
  const [acts, setActs] = useState<TgaActivity[] | null>(null);
  const [users, setUsers] = useState<TgaUserRow[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [report, setReport] = useState<GaTga[]>([]);
  const [manpower, setManpower] = useState<GaManpower[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try { setActs(await tgaAllActivities()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setActs([]); }
    tgaAdminUsers().then(setUsers).catch(() => {});
    getGaTga().then(setReport).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    getGaManpower().then(setManpower).catch(() => {});
    supabase.from("employees").select("id, nama, departement").order("nama").limit(3000)
      .then(({ data }) => setEmps(((data ?? []) as Emp[]).filter((e) => (e as unknown as { aktif?: boolean }).aktif !== false)));
    const id = setInterval(load, 60000);
    // Realtime: teknisi menerima / menyelesaikan tugas → status Available/Busy & papan langsung berubah
    const off = subscribeTgaActivities(() => { load(); setTick((n) => n + 1); });
    return () => { clearInterval(id); off(); };
  }, [load]);
  const changed = () => { load(); setTick((n) => n + 1); };

  const list = acts ?? [];
  const presence = useMemo(() => tgaPresence(list), [list]);
  const kpi = useMemo(() => ({
    pool: list.filter((x) => x.status === "baru" && x.pool).length,
    wait: list.filter((x) => x.status === "baru" && !x.pool).length,
    work: list.filter((x) => ["proses", "pending", "butuh_part"].includes(x.status)).length,
    done: list.filter((x) => x.status === "selesai" && inMonth(x.tanggal, periode)).length,
    batal: list.filter((x) => x.status === "batal" && inMonth(x.tanggal, periode)).length,
  }), [list, periode]);
  const reportMonth = useMemo(() => report.filter((r) => inMonth(r.tanggal, periode)), [report, periode]);

  const TABS: { id: View; label: string; badge?: number; warn?: boolean }[] = [
    { id: "board", label: L("Papan tugas", "Task board"), badge: kpi.pool + kpi.wait || undefined, warn: kpi.pool + kpi.wait > 0 },
    { id: "jobs", label: L("Data pekerjaan", "Jobs") },
    { id: "techs", label: L("Teknisi", "Technicians"), badge: users.filter((u) => u.aktif).length || undefined },
    { id: "form", label: L("Form penugasan", "Assignment form") },
    { id: "report", label: L("Laporan", "Report") },
  ];

  return (
    <div className={a.wrap}>
      <header className={a.head}>
        <div className={a.headText}>
          <span className={a.kicker}>{L("Fasilitas · ISS General Affairs", "Facility · ISS General Affairs")}</span>
          <h1>{L("TGA — Teknisi GA", "TGA — GA Technicians")}</h1>
          <p>{L("Penugasan teknisi, data pekerjaan, akun aplikasi TGA dan form penugasan untuk semua staf GA.", "Technician assignments, job records, TGA app accounts and the assignment form for all GA staff.")}</p>
        </div>
        <div className={a.headSide}>
          <a className={a.ghostBtn} href="/tga" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{L("Aplikasi TGA ↗", "TGA app ↗")}</a>
          <button type="button" className={a.ghostBtn} onClick={changed}>↻ {L("Muat ulang", "Refresh")}</button>
        </div>
      </header>

      <div className={t.kpis}>
        <button type="button" className={`${t.kpi} ${kpi.pool ? t.kpiHot : ""}`} onClick={() => setView("board")}><small>{L("Belum diambil", "Unclaimed")}</small><b>{kpi.pool}</b><span>{L("siapa cepat", "first come")}</span></button>
        <button type="button" className={`${t.kpi} ${kpi.wait ? t.kpiWarn : ""}`} onClick={() => setView("board")}><small>{L("Menunggu diterima", "Awaiting")}</small><b>{kpi.wait}</b><span>{L("sudah ditugaskan", "assigned")}</span></button>
        <button type="button" className={`${t.kpi} ${t.kpiBlue}`} onClick={() => setView("jobs")}><small>{L("Dikerjakan", "In progress")}</small><b>{kpi.work}</b><span>{L("proses · pending · part", "working · pending · part")}</span></button>
        <button type="button" className={`${t.kpi} ${t.kpiGreen}`} onClick={() => setView("jobs")}><small>{L("Selesai", "Done")}</small><b>{kpi.done}</b><span>{perLabel(periode, lang)}</span></button>
        <button type="button" className={t.kpi} onClick={() => setView("jobs")}><small>{L("Dibatalkan", "Cancelled")}</small><b>{kpi.batal}</b><span>{perLabel(periode, lang)}</span></button>
      </div>

      <nav className={a.tabs} role="tablist">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={view === x.id} className={`${a.tab} ${view === x.id ? a.tabOn : ""}`} onClick={() => setView(x.id)}>
            {x.label}{x.badge ? <span className={`${a.tabBadge} ${x.warn ? a.badgeWarn : a.badgeInfo}`}>{x.badge}</span> : null}
          </button>
        ))}
      </nav>

      {err && <div className={a.msgErr}>⚠ {err}</div>}

      {(view === "board" || view === "techs") && <PresenceStrip lang={lang} users={users} presence={presence} />}

      {(view === "jobs" || view === "report") && (
        <div className={a.period}>
          <div className={g.monthNav}>
            <button type="button" className={g.navBtn} onClick={() => setPeriode((p) => shiftPeriode(p, -1))} aria-label={L("Bulan sebelumnya", "Previous month")}>‹</button>
            <b>{perLabel(periode, lang)}</b>
            <button type="button" className={g.navBtn} onClick={() => setPeriode((p) => shiftPeriode(p, 1))} aria-label={L("Bulan berikutnya", "Next month")}>›</button>
          </div>
        </div>
      )}

      {view === "board" && <TgaTasks lang={lang} tick={tick} presence={presence} onChanged={load} />}
      {view === "jobs" && <JobsTable lang={lang} rows={acts} periode={periode} users={users} emps={emps} onChanged={changed} />}
      {view === "techs" && <TgaAccounts lang={lang} manpower={manpower} presence={presence} />}
      {view === "form" && <AssignFormSettings lang={lang} />}
      {view === "report" && <TgaReport lang={lang} rows={reportMonth} all={report} periode={periode} manpower={manpower} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   STATUS TEKNISI — Available / Busy (realtime)
════════════════════════════════════════════════════════════ */
function PresenceStrip({ lang, users, presence }: { lang: Lang; users: TgaUserRow[]; presence: Map<string, TgaActivity> }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const active = users.filter((u) => u.aktif);
  if (!active.length) return null;
  const busy = active.filter((u) => presence.has(u.id)).length;
  return (
    <section className={t.presence} aria-live="polite">
      <div className={t.presHead}>
        <b>{L("Status teknisi", "Technician status")}</b>
        <span><i className={t.dotFree} />{active.length - busy} available</span>
        <span><i className={t.dotBusy} />{busy} busy</span>
        <small className={t.liveTag}><i />Live</small>
      </div>
      <div className={t.presList}>
        {active.map((u) => {
          const w = presence.get(u.id);
          return (
            <div key={u.id} className={`${t.pres} ${w ? t.presBusy : t.presFree}`} title={w ? `${w.ref_no} · ${w.activity}` : L("Siap menerima tugas", "Ready for tasks")}>
              <i />
              <span>
                <b>{u.nama}</b>
                <small>{w ? `Busy · ${w.ref_no} · ${w.activity}` : "Available"}</small>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════
   DATA PEKERJAAN — CRUD
════════════════════════════════════════════════════════════ */
type Filter = "all" | "open" | "baru" | "work" | "selesai" | "batal";

function JobsTable({ lang, rows, periode, users, emps, onChanged }: {
  lang: Lang; rows: TgaActivity[] | null; periode: number; users: TgaUserRow[]; emps: Emp[]; onChanged: () => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("all");
  const [who, setWho] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<TgaActivity | "new" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "Belum selesai" lintas bulan supaya tidak terlewat; filter lain per bulan.
  const all = rows ?? [];
  const month = all.filter((x) => inMonth(x.tanggal, periode));
  const base = f === "open" ? all.filter((x) => OPEN.includes(x.status)) : month;
  const list = base.filter((x) =>
    (f === "all" || f === "open" || (f === "work" ? ["proses", "pending", "butuh_part"].includes(x.status) : x.status === f)) &&
    (!who || (who === "-" ? !x.nama_tga : x.nama_tga === who)) &&
    (!q || [x.ref_no, x.activity, x.lokasi, x.request_by, x.nama_tga, x.kategori, x.departemen, x.catatan].join(" ").toLowerCase().includes(q.toLowerCase())));
  const techNames = Array.from(new Set([...users.map((u) => u.nama), ...all.map((x) => x.nama_tga).filter(Boolean)])).sort();
  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: L("Semua", "All"), n: month.length },
    { id: "open", label: L("Belum selesai", "Open"), n: all.filter((x) => OPEN.includes(x.status)).length },
    { id: "baru", label: L("Baru", "New"), n: month.filter((x) => x.status === "baru").length },
    { id: "work", label: L("Dikerjakan", "Working"), n: month.filter((x) => ["proses", "pending", "butuh_part"].includes(x.status)).length },
    { id: "selesai", label: L("Selesai", "Done"), n: month.filter((x) => x.status === "selesai").length },
    { id: "batal", label: L("Batal", "Cancelled"), n: month.filter((x) => x.status === "batal").length },
  ];
  const selRows = list.filter((x) => sel.has(x.id));
  const allOn = list.length > 0 && list.every((x) => sel.has(x.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); setMsg(label); setSel(new Set()); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function cancel(x: TgaActivity) {
    const reason = prompt(L(`Batalkan ${x.ref_no}? Tulis alasan (opsional):`, `Cancel ${x.ref_no}? Reason (optional):`));
    if (reason === null) return;
    run(L(`${x.ref_no} dibatalkan.`, `${x.ref_no} cancelled.`), () => tgaAdminCancel(x.id, reason));
  }
  function remove(x: TgaActivity) {
    if (!confirm(L(`Hapus permanen ${x.ref_no}?\n"${x.activity}"\n\nData hilang dari laporan dan tidak bisa dikembalikan. Pilih Batalkan bila ingin tetap tercatat.`, `Permanently delete ${x.ref_no}? This cannot be undone.`))) return;
    run(L(`${x.ref_no} dihapus.`, `${x.ref_no} deleted.`), () => tgaAdminDeleteActivity(x.id));
  }
  function bulkCancel() {
    const open = selRows.filter((x) => x.status !== "selesai" && x.status !== "batal");
    if (!open.length) { setErr(L("Tidak ada pekerjaan terpilih yang bisa dibatalkan (selesai/batal dilewati).", "Nothing cancellable selected.")); return; }
    const reason = prompt(L(`Batalkan ${open.length} pekerjaan? Alasan (opsional):`, `Cancel ${open.length} jobs? Reason (optional):`));
    if (reason === null) return;
    run(L(`${open.length} pekerjaan dibatalkan.`, `${open.length} jobs cancelled.`), async () => { for (const x of open) await tgaAdminCancel(x.id, reason); });
  }
  function bulkDelete() {
    if (!confirm(L(`Hapus permanen ${selRows.length} pekerjaan terpilih? Tidak bisa dikembalikan.`, `Permanently delete ${selRows.length} selected jobs?`))) return;
    run(L(`${selRows.length} pekerjaan dihapus.`, `${selRows.length} jobs deleted.`), async () => { for (const x of selRows) await tgaAdminDeleteActivity(x.id); });
  }
  function exportRows(fmt: "excel" | "pdf" | "csv") {
    const cols: ReportColumn<TgaActivity>[] = [
      { key: "ref", labelId: "No. Ref", labelEn: "Ref no.", get: (r) => r.ref_no },
      { key: "tgl", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal },
      { key: "jam", labelId: "Jam", labelEn: "Time", get: (r) => [r.jam_mulai, r.jam_selesai].filter(Boolean).join("–") },
      { key: "tga", labelId: "Teknisi", labelEn: "Technician", get: (r) => r.nama_tga || "-" },
      { key: "kat", labelId: "Kategori", labelEn: "Category", get: (r) => r.kategori },
      { key: "act", labelId: "Pekerjaan", labelEn: "Job", get: (r) => r.activity, width: 3 },
      { key: "lok", labelId: "Lokasi", labelEn: "Location", get: (r) => r.lokasi },
      { key: "req", labelId: "Requestor", labelEn: "Requestor", get: (r) => r.request_by },
      { key: "dept", labelId: "Departemen", labelEn: "Department", get: (r) => r.departemen },
      { key: "st", labelId: "Status", labelEn: "Status", get: (r) => tgaStatusLabel(r.status) + (r.prioritas === "urgent" ? " (URGENT)" : "") },
      { key: "src", labelId: "Asal", labelEn: "Source", get: (r) => TGA_SOURCE_LABEL[r.sumber ?? "mandiri"] },
      { key: "by", labelId: "Ditugaskan oleh", labelEn: "Assigned by", get: (r) => r.assigned_by ?? "" },
    ];
    const fn = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    fn({ rows: list, columns: cols, lang: lang as ReportLang, titleId: "Data Pekerjaan TGA", titleEn: "TGA Jobs", periodLabel: perLabel(periode, lang), filename: "Pekerjaan_TGA" });
  }

  return (
    <section className={a.card}>
      <div className={a.cardHead}>
        <div>
          <h2>{L("Data pekerjaan TGA", "TGA jobs")}</h2>
          <p>{L("Semua pekerjaan dari aplikasi, papan tugas, form penugasan & permintaan karyawan — ubah, batalkan, atau hapus", "Every job from the app, board, assignment form & employee requests — edit, cancel or delete")}</p>
        </div>
        <button type="button" className={a.primary} onClick={() => setEdit("new")}>＋ {L("Tambah pekerjaan", "Add job")}</button>
      </div>
      <div className={a.toolbar}>
        <input className={`${a.input} ${a.search}`} placeholder={L("Cari no. ref, pekerjaan, lokasi, requestor…", "Search ref, job, location, requestor…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={a.input} style={{ width: "auto", minWidth: 160 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label={L("Teknisi", "Technician")}>
          <option value="">{L("Semua teknisi", "All technicians")}</option>
          <option value="-">{L("— Belum ada teknisi", "— Unassigned")}</option>
          {techNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className={a.grow} />
        <div className={a.exportGroup}>{(["excel", "pdf", "csv"] as const).map((x) => <button key={x} type="button" className={a.ghostBtn} onClick={() => exportRows(x)} disabled={!list.length}>{x.toUpperCase()}</button>)}</div>
      </div>
      <div className={a.toolbar}>
        <div className={a.seg}>{FILTERS.map((x) => <button key={x.id} type="button" className={f === x.id ? a.segOn : ""} onClick={() => { setF(x.id); setSel(new Set()); }} aria-pressed={f === x.id}>{x.label}<small>{x.n}</small></button>)}</div>
      </div>
      {selRows.length > 0 && (
        <div className={t.bulk}>
          <b>{selRows.length} {L("dipilih", "selected")}</b>
          <button type="button" className={a.ghostBtn} onClick={bulkCancel} disabled={busy}>{L("Batalkan", "Cancel")}</button>
          <button type="button" className={a.dangerBtn} onClick={bulkDelete} disabled={busy}>{L("Hapus permanen", "Delete")}</button>
          <button type="button" className={a.smallBtn} onClick={() => setSel(new Set())}>{L("Batal pilih", "Clear")}</button>
        </div>
      )}
      {err && <div className={a.msgErr}>{err}</div>}
      {msg && <div className={a.msgOk}>{msg}</div>}

      {rows === null ? <p className={a.empty}>{L("Memuat…", "Loading…")}</p> : list.length === 0 ? (
        <p className={a.empty}>{f === "open" ? L("Tidak ada pekerjaan terbuka. 👍", "No open jobs. 👍") : L("Tidak ada pekerjaan untuk filter ini.", "No jobs for this filter.")}</p>
      ) : (
        <div className={a.tableWrap}>
          <table className={`${a.table} ${t.jobs}`}>
            <thead>
              <tr>
                <th style={{ width: 34 }}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(list.map((x) => x.id)))} aria-label={L("Pilih semua", "Select all")} /></th>
                <th>{L("Tanggal", "Date")}</th><th>{L("Pekerjaan", "Job")}</th><th>{L("Teknisi", "Technician")}</th><th>Requestor</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const st = stInfo(x.status);
                const cat = tgaCategory(x.kategori);
                return (
                  <tr key={x.id} className={sel.has(x.id) ? t.rowOn : x.status === "batal" ? t.rowMute : ""}>
                    <td><input type="checkbox" checked={sel.has(x.id)} onChange={() => toggle(x.id)} aria-label={x.ref_no} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtD(x.tanggal, lang)}<br /><small className={a.mute}>{x.ref_no}{x.jam_mulai ? ` · ${x.jam_mulai}${x.jam_selesai ? `–${x.jam_selesai}` : ""}` : ""}</small></td>
                    <td>
                      <b className={t.act}>{cat.icon} {x.activity}</b>
                      <small className={a.mute}>{[x.kategori, x.lokasi && `📍 ${x.lokasi}`, TGA_SOURCE_LABEL[x.sumber ?? "mandiri"] + (x.assigned_by && x.sumber !== "mandiri" ? ` · ${x.assigned_by}` : "")].filter(Boolean).join(" · ")}</small>
                      {x.catatan && <small className={a.mute}>📝 {x.catatan}</small>}
                    </td>
                    <td>{x.nama_tga ? <b>{x.nama_tga}</b> : <em className={a.mute}>{L("Belum ada", "None")}</em>}</td>
                    <td>{x.request_by || "—"}{x.departemen && <><br /><small className={a.mute}>{x.departemen}</small></>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={a[st?.tag ?? "tagWeb"]}>{lang === "en" ? st?.en : st?.id_}</span>
                      {x.prioritas === "urgent" && <> <span className={a.tagPending}>URGENT</span></>}
                    </td>
                    <td>
                      <span className={t.rowBtns}>
                        <button type="button" className={a.smallBtn} onClick={() => setEdit(x)}>{L("Ubah", "Edit")}</button>
                        {x.status !== "selesai" && x.status !== "batal" && <button type="button" className={a.smallBtn} onClick={() => cancel(x)} disabled={busy}>{L("Batalkan", "Cancel")}</button>}
                        <button type="button" className={`${a.iconBtn} ${t.del}`} onClick={() => remove(x)} disabled={busy} aria-label={L("Hapus", "Delete")} title={L("Hapus permanen", "Delete")}>🗑</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <JobModal lang={lang} initial={edit === "new" ? null : edit} users={users} emps={emps} onClose={() => setEdit(null)}
          onDeleted={(x) => { setEdit(null); setMsg(L(`${x.ref_no} dihapus.`, `${x.ref_no} deleted.`)); onChanged(); }}
          onSaved={(r) => {
            setEdit(null);
            setMsg(r.status === "baru" ? L(`${r.ref_no} tersimpan — dikirim ke ${r.pool ? "semua TGA" : r.nama_tga}.`, `${r.ref_no} saved — sent to ${r.pool ? "all TGA" : r.nama_tga}.`) : L(`${r.ref_no} tersimpan.`, `${r.ref_no} saved.`));
            // Server hanya mengirim bila tugas benar-benar baru / dialihkan (dan belum pernah dikirim)
            if (r.status === "baru") notifyTgaTask(r.id);
            onChanged();
          }} />
      )}
    </section>
  );
}

interface Draft {
  userId: string; namaTga: string; status: TgaStatus; tanggal: string; jamMulai: string; jamSelesai: string; kategori: string; activity: string; lokasi: string;
  requestorId: string; requestBy: string; departemen: string; phone: string; prioritas: "normal" | "urgent"; catatan: string;
}

function JobModal({ lang, initial, users, emps, onClose, onSaved, onDeleted }: {
  lang: Lang; initial: TgaActivity | null; users: TgaUserRow[]; emps: Emp[];
  onClose: () => void; onSaved: (r: TgaActivity) => void; onDeleted: (r: TgaActivity) => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const today = toLocalISODate(new Date());
  const [d, setD] = useState<Draft>(() => initial ? {
    userId: users.find((u) => u.nama === initial.nama_tga)?.id ?? "", namaTga: initial.nama_tga, status: initial.status, tanggal: initial.tanggal,
    jamMulai: initial.jam_mulai ?? "", jamSelesai: initial.jam_selesai ?? "", kategori: initial.kategori, activity: initial.activity, lokasi: initial.lokasi,
    requestorId: initial.requestor_id ?? "", requestBy: initial.request_by, departemen: initial.departemen, phone: initial.request_phone ?? "",
    prioritas: initial.prioritas, catatan: initial.catatan,
  } : {
    userId: "", namaTga: "", status: "baru", tanggal: today, jamMulai: "", jamSelesai: "", kategori: "", activity: "", lokasi: "",
    requestorId: "", requestBy: "", departemen: "", phone: "", prioritas: "normal", catatan: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Teknisi lama yang akunnya sudah dihapus tetap bisa dipertahankan namanya
  const orphan = initial && initial.nama_tga && !users.some((u) => u.nama === initial.nama_tga) ? initial.nama_tga : "";
  const techValue = d.userId || (d.namaTga && d.namaTga === orphan ? "orphan" : "");

  function pickRequestor(name: string) {
    const e = emps.find((x) => x.nama.toLowerCase() === name.trim().toLowerCase());
    setD((x) => ({ ...x, requestBy: name, requestorId: e?.id ?? "", departemen: e ? (e.departement ?? x.departemen) : x.departemen }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.activity.trim()) { setErr(L("Isi pekerjaan.", "Describe the job.")); return; }
    setBusy(true); setErr(null);
    try {
      const r = await tgaAdminSaveActivity(initial?.id ?? null, d.userId || null, {
        nama_tga: d.userId ? "" : d.namaTga, status: d.status, tanggal: d.tanggal, jam_mulai: d.jamMulai, jam_selesai: d.jamSelesai,
        kategori: d.kategori || "Lainnya", activity: d.activity, lokasi: d.lokasi, requestor_id: d.requestorId || null,
        request_by: d.requestBy, departemen: d.departemen, request_phone: d.phone, prioritas: d.prioritas, catatan: d.catatan,
      });
      onSaved(r);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!initial) return;
    if (!confirm(L(`Hapus permanen ${initial.ref_no}? Tidak bisa dikembalikan.`, `Permanently delete ${initial.ref_no}?`))) return;
    setBusy(true);
    try { await tgaAdminDeleteActivity(initial.id); onDeleted(initial); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); setBusy(false); }
  }

  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tga-job-title" style={{ width: "min(680px, 100%)" }}>
        <div className={a.modalHead}>
          <h2 id="tga-job-title">{initial ? `${L("Ubah pekerjaan", "Edit job")} · ${initial.ref_no}` : L("Tambah pekerjaan TGA", "Add TGA job")}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>

        <div className={a.fields2}>
          <label className={a.field}><span>{L("Teknisi", "Technician")}</span>
            <select className={a.input} value={techValue} onChange={(e) => {
              const v = e.target.value;
              setD((x) => ({ ...x, userId: v === "orphan" || v === "" ? "" : v, namaTga: v === "orphan" ? orphan : "" }));
            }}>
              <option value="">{L("— Semua TGA (siapa cepat)", "— All TGA (first come)")}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.aktif ? "" : L(" (nonaktif)", " (inactive)")}</option>)}
              {orphan && <option value="orphan">{orphan} {L("(akun dihapus)", "(account deleted)")}</option>}
            </select>
          </label>
          <label className={a.field}><span>Status</span>
            <select className={a.input} value={d.status} onChange={(e) => set("status", e.target.value as TgaStatus)}>
              {ALL_STATUS.map((s) => <option key={s.id} value={s.id}>{lang === "en" ? s.en : s.id_}</option>)}
            </select>
            {d.status === "baru" && <small className={a.mute}>{L("Baru = menunggu diterima; HP teknisi berdering saat disimpan.", "New = awaiting acceptance; the technician's phone rings on save.")}</small>}
          </label>
        </div>

        <div className={a.field}>
          <span>{L("Jenis pekerjaan", "Category")}</span>
          <div className={t.catPick}>
            {TGA_CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={d.kategori === c.id ? t.catOn : ""} onClick={() => set("kategori", d.kategori === c.id ? "" : c.id)}>{c.icon} {c.id}</button>
            ))}
          </div>
        </div>
        <label className={a.field}><span>{L("Pekerjaan", "Job")} *</span>
          <textarea className={a.input} style={{ height: 72, padding: "10px 12px", resize: "vertical" }} value={d.activity} onChange={(e) => set("activity", e.target.value)} required />
        </label>

        <div className={t.fields3}>
          <label className={a.field}><span>{L("Tanggal", "Date")}</span><input type="date" className={a.input} value={d.tanggal} onChange={(e) => set("tanggal", e.target.value || today)} /></label>
          <label className={a.field}><span>{L("Jam mulai", "Start")}</span><input type="time" className={a.input} value={d.jamMulai} onChange={(e) => set("jamMulai", e.target.value)} /></label>
          <label className={a.field}><span>{L("Jam selesai", "End")}</span><input type="time" className={a.input} value={d.jamSelesai} onChange={(e) => set("jamSelesai", e.target.value)} /></label>
        </div>

        <div className={a.fields2}>
          <label className={a.field}><span>{L("Lokasi", "Location")}</span><input className={a.input} value={d.lokasi} onChange={(e) => set("lokasi", e.target.value)} /></label>
          <label className={a.field}><span>{L("Prioritas", "Priority")}</span>
            <span className={a.seg}>
              <button type="button" className={d.prioritas === "normal" ? a.segOn : ""} onClick={() => set("prioritas", "normal")}>Normal</button>
              <button type="button" className={d.prioritas === "urgent" ? a.segOn : ""} onClick={() => set("prioritas", "urgent")}>🔥 Urgent</button>
            </span>
          </label>
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>{L("Requestor (Data Karyawan)", "Requestor (employee)")}</span>
            <input className={a.input} list="tga-job-emp" value={d.requestBy} onChange={(e) => pickRequestor(e.target.value)} placeholder={L("Ketik nama…", "Type a name…")} />
            <datalist id="tga-job-emp">{emps.map((e) => <option key={e.id} value={e.nama}>{e.departement ?? ""}</option>)}</datalist>
            {d.requestBy && <small className={d.requestorId ? a.tGreen : a.mute}>{d.requestorId ? L("✓ terhubung ke data karyawan", "✓ linked to employee") : L("di luar data karyawan", "not in employee data")}</small>}
          </label>
          <label className={a.field}><span>{L("Departemen", "Department")}</span><input className={a.input} value={d.departemen} onChange={(e) => set("departemen", e.target.value)} /></label>
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>{L("No. HP requestor", "Requestor phone")}</span><input className={a.input} inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className={a.field}><span>{L("Catatan", "Note")}</span><input className={a.input} value={d.catatan} onChange={(e) => set("catatan", e.target.value)} /></label>
        </div>

        {err && <div className={a.msgErr}>{err}</div>}
        <div className={a.modalFoot}>
          {initial && <button type="button" className={a.dangerBtn} onClick={del} disabled={busy} style={{ marginRight: "auto" }}>🗑 {L("Hapus", "Delete")}</button>}
          <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Tutup", "Close")}</button>
          <button type="submit" className={a.primary} disabled={busy}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/* ════════════════════════════════════════════════════════════
   FORM PENUGASAN PUBLIK — kode untuk semua staf GA
════════════════════════════════════════════════════════════ */
function AssignFormSettings({ lang }: { lang: Lang }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [cfg, setCfg] = useState<TgaAssignConfig | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(() => { tgaAdminAssignConfig().then((c) => { setCfg(c); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { load(); }, [load]);

  const url = typeof window === "undefined" ? "/tugas-tga" : `${window.location.origin}/tugas-tga`;
  const copy = (txt: string, key: string) => navigator.clipboard?.writeText(txt).then(() => { setCopied(key); setTimeout(() => setCopied(""), 1600); });

  async function save(aktif: boolean, newCode = "") {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await tgaAdminSetAssignCode(newCode, aktif);
      setMsg(newCode ? L(`Kode baru disimpan: ${newCode.toUpperCase()} — bagikan ke staf GA.`, `New code saved: ${newCode.toUpperCase()}.`) : aktif ? L("Form penugasan diaktifkan.", "Assignment form enabled.") : L("Form penugasan dinonaktifkan.", "Assignment form disabled."));
      setCode(""); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function randomCode() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const b = new Uint32Array(6); crypto.getRandomValues(b);
    setCode(Array.from(b, (n) => abc[n % abc.length]).join(""));
  }
  const share = L(`Form penugasan TGA (khusus staf GA): ${url}\nKode penugasan diberikan terpisah oleh admin GA.`, `TGA assignment form (GA staff only): ${url}\nThe access code is shared separately by the GA admin.`);

  return (
    <div className={t.formGrid}>
      <section className={a.card}>
        <div className={a.cardHead}>
          <div>
            <h2>{L("Form penugasan publik", "Public assignment form")}</h2>
            <p>{L("Semua staf GA bisa menugaskan TGA dari HP tanpa akun dashboard — cukup buka tautan dan masukkan kode penugasan.", "All GA staff can assign TGA from their phone without a dashboard account — open the link and enter the code.")}</p>
          </div>
          {cfg && <span className={cfg.aktif ? a.tagExcel : a.tagWeb}>{cfg.aktif ? L("● Aktif", "● Active") : L("Nonaktif", "Disabled")}</span>}
        </div>
        {err && <div className={a.msgErr}>{err}</div>}
        {msg && <div className={a.msgOk}>{msg}</div>}

        <div className={a.keyBox}>
          <small>{L("TAUTAN FORM", "FORM LINK")}</small>
          <code>{url}</code>
          <div className={a.keyBtns}>
            <button type="button" className={a.ghostBtn} onClick={() => copy(url, "url")}>{copied === "url" ? L("✓ Tersalin", "✓ Copied") : L("Salin tautan", "Copy link")}</button>
            <a className={a.ghostBtn} href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>WhatsApp</a>
            <a className={a.ghostBtn} href="/tugas-tga" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{L("Buka form ↗", "Open form ↗")}</a>
          </div>
        </div>

        <div className={t.codeRow}>
          <label className={a.field} style={{ flex: 1 }}>
            <span>{cfg?.has_code ? L("Ganti kode penugasan", "Change access code") : L("Buat kode penugasan", "Create access code")}</span>
            <input className={`${a.input} ${t.codeInput}`} value={code} maxLength={20} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} placeholder={L("4–20 huruf/angka", "4–20 letters/digits")} autoComplete="off" />
          </label>
          <button type="button" className={a.ghostBtn} onClick={randomCode}>🎲 {L("Acak", "Random")}</button>
          <button type="button" className={a.primary} disabled={busy || code.length < 4} onClick={() => save(true, code)}>{L("Simpan & aktifkan", "Save & enable")}</button>
        </div>
        {code && <p className={a.hint}>{L("Catat kode ini — setelah disimpan kode tidak bisa dilihat lagi (disimpan terenkripsi).", "Write this code down — it can't be viewed again after saving (stored hashed).")}</p>}

        {cfg?.has_code && (
          <div className={a.toolbar}>
            {cfg.aktif
              ? <button type="button" className={a.dangerBtn} disabled={busy} onClick={() => save(false)}>{L("Nonaktifkan form", "Disable form")}</button>
              : <button type="button" className={a.primary} disabled={busy} onClick={() => save(true)}>{L("Aktifkan dengan kode lama", "Enable with current code")}</button>}
            <span className={a.hint} style={{ margin: 0 }}>
              {cfg.updated_at && `${L("Diubah", "Changed")} ${new Date(cfg.updated_at).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${cfg.updated_by ? ` · ${cfg.updated_by}` : ""}`}
              {cfg.locked && <> · <b className={a.tRed}>{L("terkunci sementara (banyak kode salah)", "temporarily locked (too many wrong codes)")}</b></>}
            </span>
          </div>
        )}
      </section>

      <section className={a.card}>
        <div className={a.cardHead}><div><h2>{L("Cara kerja", "How it works")}</h2><p>{L("Ringkas untuk dibagikan ke staf GA", "Short guide for GA staff")}</p></div></div>
        <ol className={t.howto}>
          <li><b>{L("Buka tautan", "Open the link")}</b>{L(" — dari HP atau PC, tanpa login.", " — from phone or PC, no login.")}</li>
          <li><b>{L("Masukkan kode penugasan", "Enter the access code")}</b>{L(" — kode diingat di perangkat itu.", " — remembered on that device.")}</li>
          <li><b>{L("Isi tugas", "Fill in the task")}</b>{L(" — nama pemberi tugas, teknisi (atau semua TGA), jenis, pekerjaan, lokasi, requestor.", " — your name, technician (or all TGA), category, job, location, requestor.")}</li>
          <li><b>{L("Kirim", "Send")}</b>{L(" — HP teknisi langsung berdering; tugas muncul di Papan tugas dan Data pekerjaan dengan keterangan \"· form\".", " — the technician's phone rings; the task appears on the board marked \"· form\".")}</li>
        </ol>
        <div className={a.statGrid} style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className={a.stat}><small>{L("Tugas via form (24 jam)", "Form tasks (24 h)")}</small><b>{cfg?.today ?? "—"}</b></div>
          <div className={a.stat}><small>{L("Keamanan", "Security")}</small><span>{L("8x kode salah → terkunci 15 menit. Ganti kode bila ada staf keluar.", "8 wrong codes → locked 15 min. Change the code when staff leave.")}</span></div>
        </div>
      </section>
    </div>
  );
}
