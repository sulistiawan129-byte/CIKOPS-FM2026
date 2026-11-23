"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/providers";
import { L } from "@/lib/i18n";
import { ModalPortal } from "@/components/ModalPortal";
import { SearchPick, type PickOption } from "@/components/SearchPick";
import { getAllEmployeesFull } from "@/lib/api";
import {
  addLockerKey, borrowLockerKey, deleteLockerKey, exportLockerKeysXlsx, getLockerKeyLogs, getLockerKeys, importLockerKeys, returnLockerKey, updateLockerKey,
  type LockerKey, type LockerKeyInput, type LockerKeyLog, type LockerKeyStatus,
} from "@/lib/lockerKeyApi";
import { normalizeLockerRows, readLockerWorkbook, type LockerImportReport, type LockerKeyDraft } from "@/lib/lockerKeyImport";
import { ModuleHeader, ModulePage, ModuleTabs } from "./ModuleShell";
import { useIsMobile } from "./dashboardShared";
import s from "./lockerkey.module.css";

/* ════════════════════════════════════════════════════════════
   KUNCI LOKER KARYAWAN — cari kunci loker dengan cepat (nama / NIK / no. kunci / pintu / blok / dept),
   kelola data (tambah, ubah, hapus), catat peminjaman kunci serep, peta blok, riwayat, impor & ekspor Excel.
   Data: tabel locker_keys (supabase/10_kunci_loker_karyawan.sql). Terpisah dari modul "Locker" (loker ber-PIN).
════════════════════════════════════════════════════════════ */

type SubTab = "cari" | "blok" | "pinjam" | "riwayat";
const PAGE = 60;
const STATUSES: LockerKeyStatus[] = ["Terisi", "Kosong", "Dipinjam"];
const statusLabel = (st: string) => (st === "Terisi" ? L("Terisi", "In use") : st === "Kosong" ? L("Kosong", "Empty") : L("Dipinjam", "Borrowed"));
const actionLabel = (a: string) => ({ tambah: L("Tambah", "Added"), ubah: L("Ubah", "Edited"), hapus: L("Hapus", "Deleted"), pinjam: L("Pinjam serep", "Spare borrowed"), kembali: L("Kembali", "Returned"), impor: L("Impor", "Import") } as Record<string, string>)[a] ?? a;

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const todayIso = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const fmtDate = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const fmtTs = (t: string) => { const d = new Date(new Date(t).getTime() + 7 * 3600000).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)} ${d.slice(11, 16)}`; };
const daysSince = (d: string) => (d ? Math.max(0, Math.floor((Date.parse(todayIso()) - Date.parse(d)) / 86400000)) : null);

/** Sorot kata yang dicari. */
function Hl({ text, tokens }: { text: string; tokens: string[] }) {
  if (!text || tokens.length === 0) return <>{text}</>;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

const hay = (r: LockerKey) => norm(`${r.nama} ${r.nik} ${r.noKunci} ${r.pintu} ${r.blok} ${r.dept} ${r.keterangan} ${r.borrowedBy} ${statusLabel(r.status)} ${r.status}`);

export default function LockerKeyTab() {
  const { lang } = useLang();
  void lang;
  const isMobile = useIsMobile(860);

  const [rows, setRows] = useState<LockerKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SubTab>("cari");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | LockerKeyStatus>("all");
  const [blok, setBlok] = useState("");
  const [dept, setDept] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const [form, setForm] = useState<LockerKey | "new" | null>(null);
  const [borrowFor, setBorrowFor] = useState<LockerKey | null>(null);
  const [delFor, setDelFor] = useState<LockerKey | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [logs, setLogs] = useState<LockerKeyLog[] | null>(null);
  const [logQ, setLogQ] = useState("");
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, isErr = false) => {
    setToast({ msg, error: isErr });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    try {
      setRows(await getLockerKeys());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const loadLogs = useCallback(async () => {
    try { setLogs(await getLockerKeyLogs()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { if (tab === "riwayat") loadLogs(); }, [tab, loadLogs]);

  /* ── turunan ── */
  const counts = useMemo(() => {
    const c = { all: rows.length, Terisi: 0, Kosong: 0, Dipinjam: 0 };
    rows.forEach((r) => { c[r.status]++; });
    return c;
  }, [rows]);
  const bloks = useMemo(() => { const m = new Map<string, number>(); rows.forEach((r) => m.set(r.blok, (m.get(r.blok) ?? 0) + 1)); return [...m.keys()]; }, [rows]);
  const depts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => { if (r.dept) m.set(r.dept, (m.get(r.dept) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);
  const index = useMemo(() => rows.map((r) => ({ r, h: hay(r) })), [rows]);

  const tokens = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);
  const results = useMemo(() => {
    let out = index.filter(({ r, h }) => (status === "all" || r.status === status) && (!blok || r.blok === blok) && (!dept || r.dept === dept) && tokens.every((t) => h.includes(t)));
    if (tokens.length) {
      // yang cocok persis (no. kunci, NIK, pintu) dan nama yang diawali kata kunci tampil lebih dulu
      const score = (r: LockerKey) => {
        const t0 = tokens[0];
        if (norm(r.noKunci) === t0 || norm(r.nik) === t0 || norm(r.pintu) === t0) return 0;
        if (norm(r.nama).startsWith(t0)) return 1;
        if (norm(r.nama).split(" ").some((w) => w.startsWith(t0))) return 2;
        return 3;
      };
      out = [...out].sort((a, b) => score(a.r) - score(b.r) || a.r.rowNo - b.r.rowNo);
    }
    return out.map((x) => x.r);
  }, [index, status, blok, dept, tokens]);
  useEffect(() => { setLimit(PAGE); }, [q, status, blok, dept]);

  const borrowed = useMemo(() => rows.filter((r) => r.status === "Dipinjam").sort((a, b) => (a.borrowedAt || "9999").localeCompare(b.borrowedAt || "9999") || a.rowNo - b.rowNo), [rows]);
  const blockGroups = useMemo(() => {
    const m = new Map<string, LockerKey[]>();
    rows.forEach((r) => { const k = r.blok; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return [...m.entries()];
  }, [rows]);

  /* ── aksi ── */
  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); showToast(ok); await load(); if (tab === "riwayat") loadLogs(); return true; }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), true); return false; }
  }
  const openBlok = (b: string) => { setBlok(b); setQ(""); setStatus("all"); setDept(""); setTab("cari"); };

  function ActionButtons({ r }: { r: LockerKey }) {
    return (
      <div className={s.rowActions}>
        {r.status === "Dipinjam"
          ? <button type="button" className={s.iconBtn} onClick={() => run(() => returnLockerKey(r.id), L("Kunci serep dikembalikan", "Spare key returned"))}>↩ {L("Kembalikan", "Return")}</button>
          : r.nama ? <button type="button" className={s.iconBtn} onClick={() => setBorrowFor(r)}>🔑 {L("Pinjam serep", "Borrow spare")}</button> : null}
        <button type="button" className={s.iconBtn} onClick={() => setForm(r)} aria-label={L("Ubah", "Edit")}>✏️</button>
        <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} onClick={() => setDelFor(r)} aria-label={L("Hapus", "Delete")}>🗑</button>
      </div>
    );
  }

  const shown = results.slice(0, limit);
  const filtersActive = !!(q || blok || dept || status !== "all");

  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Fasilitas · Kunci Loker", "Facility · Locker Keys")}
        title={L("Kunci Loker Karyawan", "Employee Locker Keys")}
        desc={L("Cari kunci loker dalam hitungan detik: ketik nama, NIK, no. kunci, pintu, blok, atau departemen. Kelola data, catat peminjaman kunci serep, dan impor dari Excel.", "Find a locker key in seconds: type a name, NIK, key no., door, block or department. Manage the data, log spare-key loans and import from Excel.")}
        actions={
          <div className={s.headActions}>
            <button type="button" className={s.btn} onClick={() => setImportOpen(true)}>⬆️ {L("Impor Excel", "Import Excel")}</button>
            <button type="button" className={s.btn} disabled={results.length === 0} onClick={() => run(() => exportLockerKeysXlsx(results, `Kunci_Loker_${todayIso()}.xlsx`), L("File Excel diunduh", "Excel file downloaded"))}>⬇️ {L("Ekspor Excel", "Export Excel")}</button>
            <button type="button" className={s.btnPrimary} onClick={() => setForm("new")}>＋ {L("Tambah loker", "Add locker")}</button>
          </div>
        }
      />

      {error && <div className={s.err}>{error}</div>}

      <div className={s.kpis}>
        <button type="button" className={`${s.kpi} ${s.k_brand} ${status === "all" ? s.kpiOn : ""}`} onClick={() => { setStatus("all"); setTab("cari"); }}><small>{L("Total kunci", "Total keys")}</small><b>{counts.all.toLocaleString()}</b></button>
        <button type="button" className={`${s.kpi} ${s.k_green} ${status === "Terisi" ? s.kpiOn : ""}`} onClick={() => { setStatus("Terisi"); setTab("cari"); }}><small>{L("Terisi", "In use")}</small><b>{counts.Terisi.toLocaleString()}</b></button>
        <button type="button" className={`${s.kpi} ${s.k_gray} ${status === "Kosong" ? s.kpiOn : ""}`} onClick={() => { setStatus("Kosong"); setTab("cari"); }}><small>{L("Kosong", "Empty")}</small><b>{counts.Kosong.toLocaleString()}</b></button>
        <button type="button" className={`${s.kpi} ${s.k_orange} ${status === "Dipinjam" ? s.kpiOn : ""}`} onClick={() => { setStatus("Dipinjam"); setTab("cari"); }}><small>{L("Serep dipinjam", "Spares borrowed")}</small><b>{counts.Dipinjam.toLocaleString()}</b></button>
        <div className={`${s.kpi} ${s.k_brand}`}><small>{L("Jumlah blok", "Blocks")}</small><b>{bloks.length}</b></div>
      </div>

      <ModuleTabs<SubTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "cari", label: L("Cari Kunci", "Find Key"), icon: "🔎" },
          { id: "blok", label: L("Peta Blok", "Block Map"), icon: "🗂️" },
          { id: "pinjam", label: L("Serep Dipinjam", "Borrowed Spares"), icon: "🔑", badge: counts.Dipinjam || undefined },
          { id: "riwayat", label: L("Riwayat", "History"), icon: "🕘" },
        ]}
      />

      {/* ═══════ CARI ═══════ */}
      {tab === "cari" && (
        <>
          <div className={s.searchBox}>
            <span aria-hidden>🔎</span>
            <input
              ref={searchRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder={L("Ketik nama / NIK / no. kunci / pintu / dept …", "Type name / NIK / key no. / door / dept …")}
              aria-label={L("Cari kunci loker", "Search locker keys")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && <button type="button" onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label={L("Hapus", "Clear")}>✕</button>}
          </div>
          <div className={s.filters}>
            <div className={s.chips} role="group" aria-label={L("Status", "Status")}>
              {(["all", ...STATUSES] as const).map((st) => (
                <button key={st} type="button" className={`${s.chip} ${status === st ? s.chipOn : ""}`} onClick={() => setStatus(st)}>
                  {st === "all" ? L("Semua", "All") : statusLabel(st)} ({st === "all" ? counts.all : counts[st]})
                </button>
              ))}
            </div>
            <select value={blok} onChange={(e) => setBlok(e.target.value)} aria-label={L("Blok", "Block")}>
              <option value="">{L("Semua blok", "All blocks")}</option>
              {bloks.map((b) => <option key={b} value={b}>{L("Blok", "Block")} {b}</option>)}
            </select>
            <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label={L("Departemen", "Department")}>
              <option value="">{L("Semua dept", "All depts")}</option>
              {depts.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
            </select>
            {filtersActive && <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => { setQ(""); setStatus("all"); setBlok(""); setDept(""); }}>✕ {L("Reset", "Reset")}</button>}
            <span className={s.count}>{results.length.toLocaleString()} {L("hasil", "results")}</span>
          </div>

          {loading ? (
            <div className={s.cards}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={s.skel} />)}</div>
          ) : results.length === 0 ? (
            <div className={s.empty}>
              <span>🔐</span>
              <b>{rows.length === 0 ? L("Belum ada data kunci loker", "No locker key data yet") : L("Tidak ada yang cocok", "No match")}</b>
              <small>{rows.length === 0 ? L("Klik Impor Excel untuk memasukkan file Master Loker Karyawan, atau Tambah loker satu per satu.", "Click Import Excel to load the Master Employee Locker file, or add lockers one by one.") : L("Coba kata kunci lain, atau reset filter.", "Try another keyword, or reset the filters.")}</small>
            </div>
          ) : isMobile ? (
            <div className={s.cards}>
              {shown.map((r) => (
                <div key={r.id} className={s.card}>
                  <div className={s.cardTop}>
                    <span className={s.door}><Hl text={r.pintu || "—"} tokens={tokens} /></span>
                    <span className={`${s.badge} ${s["b_" + r.status]}`}>{statusLabel(r.status)}</span>
                    <span className={s.keyNo}><Hl text={r.noKunci || "—"} tokens={tokens} /></span>
                  </div>
                  <div><span className={s.name}>{r.nama ? <Hl text={r.nama} tokens={tokens} /> : <i>{L("Kosong", "Empty")}</i>}</span></div>
                  <div className={s.cardMeta}>
                    <span>{L("Blok", "Block")} <Hl text={r.blok} tokens={tokens} />{r.slot ? ` · ${L("slot", "slot")} ${r.slot}` : ""}</span>
                    {r.nik && <span>NIK <Hl text={r.nik} tokens={tokens} /></span>}
                    {r.dept && <span><Hl text={r.dept} tokens={tokens} /></span>}
                  </div>
                  {r.status === "Dipinjam" && r.borrowedBy && <div className={s.note}>🔑 {L("Dipinjam oleh", "Borrowed by")} <b>{r.borrowedBy}</b> {r.borrowedAt && `· ${fmtDate(r.borrowedAt)}`}</div>}
                  {r.keterangan && <div className={s.note}><Hl text={r.keterangan} tokens={tokens} /></div>}
                  <div className={s.cardActions}><ActionButtons r={r} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>{L("Pintu", "Door")}</th><th>{L("Blok / Slot", "Block / Slot")}</th><th>{L("Nama karyawan", "Employee")}</th><th>NIK</th>
                    <th>{L("No. kunci", "Key no.")}</th><th>{L("Dept", "Dept")}</th><th>{L("Status", "Status")}</th><th>{L("Keterangan", "Notes")}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td><span className={s.door}><Hl text={r.pintu || "—"} tokens={tokens} /></span></td>
                      <td><Hl text={r.blok} tokens={tokens} />{r.slot ? <span className={s.sub}>{L("slot", "slot")} {r.slot}</span> : null}</td>
                      <td><span className={s.name}>{r.nama ? <Hl text={r.nama} tokens={tokens} /> : <i style={{ color: "var(--t3)" }}>{L("— kosong —", "— empty —")}</i>}</span></td>
                      <td><Hl text={r.nik} tokens={tokens} /></td>
                      <td><span className={s.keyNo}><Hl text={r.noKunci} tokens={tokens} /></span></td>
                      <td><Hl text={r.dept} tokens={tokens} /></td>
                      <td>
                        <span className={`${s.badge} ${s["b_" + r.status]}`}>{statusLabel(r.status)}</span>
                        {r.status === "Dipinjam" && r.borrowedBy && <span className={s.sub}>{r.borrowedBy}{r.borrowedAt ? ` · ${fmtDate(r.borrowedAt)}` : ""}</span>}
                      </td>
                      <td><div className={s.note}><Hl text={r.keterangan} tokens={tokens} /></div></td>
                      <td><ActionButtons r={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {results.length > limit && (
            <button type="button" className={`${s.btn} ${s.more}`} onClick={() => setLimit((n) => n + PAGE)}>{L("Tampilkan lebih banyak", "Show more")} ({results.length - limit})</button>
          )}
        </>
      )}

      {/* ═══════ PETA BLOK ═══════ */}
      {tab === "blok" && (
        <>
          <div className={s.legend}>
            <span><i style={{ background: "var(--green)" }} />{L("Terisi", "In use")}</span>
            <span><i style={{ background: "var(--t3)", opacity: .55 }} />{L("Kosong", "Empty")}</span>
            <span><i style={{ background: "var(--orange)" }} />{L("Serep dipinjam", "Spare borrowed")}</span>
            <span style={{ color: "var(--t3)" }}>{L("Ketuk pintu untuk melihat / mengubah, ketuk nama blok untuk menyaring.", "Tap a door to view / edit, tap the block name to filter.")}</span>
          </div>
          {loading ? <div className={s.cards}>{Array.from({ length: 4 }, (_, i) => <div key={i} className={s.skel} />)}</div> : blockGroups.length === 0 ? (
            <div className={s.empty}><span>🗂️</span><b>{L("Belum ada data", "No data yet")}</b></div>
          ) : (
            <div className={s.blocks}>
              {blockGroups.map(([b, list]) => {
                const c = { Terisi: 0, Kosong: 0, Dipinjam: 0 };
                list.forEach((r) => { c[r.status]++; });
                return (
                  <div key={b} className={s.block}>
                    <button type="button" className={s.blockHead} onClick={() => openBlok(b)}>
                      <b>{L("Blok", "Block")} {b}</b>
                      <small>{c.Terisi}/{list.length} {L("terisi", "in use")}{c.Dipinjam ? ` · ${c.Dipinjam} ${L("serep", "spare")}` : ""}</small>
                    </button>
                    <div className={s.blockBar} aria-hidden>
                      <i style={{ width: `${(c.Terisi / list.length) * 100}%`, background: "var(--green)" }} />
                      <i style={{ width: `${(c.Dipinjam / list.length) * 100}%`, background: "var(--orange)" }} />
                    </div>
                    <div className={s.doors}>
                      {list.map((r) => (
                        <button key={r.id} type="button" className={`${s.doorBtn} ${s["d_" + r.status]}`} title={`${r.pintu} · ${r.nama || L("kosong", "empty")}${r.noKunci ? ` · ${L("kunci", "key")} ${r.noKunci}` : ""}`} onClick={() => setForm(r)}>
                          {r.pintu.replace(new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "") || "·"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════ SEREP DIPINJAM ═══════ */}
      {tab === "pinjam" && (
        borrowed.length === 0 ? (
          <div className={s.empty}><span>✅</span><b>{L("Tidak ada kunci serep yang sedang dipinjam", "No spare keys are currently borrowed")}</b><small>{L("Peminjaman dicatat lewat tombol 🔑 Pinjam serep di daftar kunci.", "Loans are logged with the 🔑 Borrow spare button in the key list.")}</small></div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>{L("Pintu", "Door")}</th><th>{L("Pemilik loker", "Locker owner")}</th><th>{L("No. kunci", "Key no.")}</th><th>{L("Dipinjam oleh", "Borrowed by")}</th><th>{L("Sejak", "Since")}</th><th>{L("Keterangan", "Notes")}</th><th></th></tr></thead>
              <tbody>
                {borrowed.map((r) => {
                  const d = daysSince(r.borrowedAt);
                  return (
                    <tr key={r.id}>
                      <td><span className={s.door}>{r.pintu || "—"}</span><span className={s.sub}>{L("Blok", "Block")} {r.blok}</span></td>
                      <td><span className={s.name}>{r.nama}</span><span className={s.sub}>{r.dept}</span></td>
                      <td><span className={s.keyNo}>{r.noKunci}</span></td>
                      <td>{r.borrowedBy || <span style={{ color: "var(--t3)" }}>{L("(lihat keterangan)", "(see notes)")}</span>}</td>
                      <td>{r.borrowedAt ? <><span>{fmtDate(r.borrowedAt)}</span><span className={`${s.sub} ${s.age} ${d !== null && d > 30 ? s.ageOld : ""}`}>{d} {L("hari", "days")}</span></> : "—"}</td>
                      <td><div className={s.note}>{r.keterangan}</div></td>
                      <td><div className={s.rowActions}><button type="button" className={s.iconBtn} onClick={() => run(() => returnLockerKey(r.id), L("Kunci serep dikembalikan", "Spare key returned"))}>↩ {L("Kembalikan", "Return")}</button><button type="button" className={s.iconBtn} onClick={() => setForm(r)} aria-label={L("Ubah", "Edit")}>✏️</button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ═══════ RIWAYAT ═══════ */}
      {tab === "riwayat" && (
        <>
          <div className={s.searchBox} style={{ height: 44 }}>
            <span aria-hidden>🔎</span>
            <input type="search" placeholder={L("Cari di riwayat (nama, pintu, petugas, …)", "Search history (name, door, staff, …)")} aria-label={L("Cari riwayat", "Search history")} value={logQ} onChange={(e) => setLogQ(e.target.value)} />
          </div>
          {logs === null ? <div className={s.cards}>{Array.from({ length: 5 }, (_, i) => <div key={i} className={s.skel} />)}</div> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>{L("Waktu", "Time")}</th><th>{L("Aksi", "Action")}</th><th>{L("Pintu", "Door")}</th><th>{L("Nama", "Name")}</th><th>{L("Rincian", "Details")}</th><th>{L("Petugas", "Staff")}</th></tr></thead>
                <tbody>
                  {logs.filter((l) => !logQ || norm(`${l.nama} ${l.pintu} ${l.blok} ${l.detail} ${l.actor} ${actionLabel(l.action)}`).includes(norm(logQ))).map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtTs(l.createdAt)}</td>
                      <td><span className={`${s.act} ${s["a_" + l.action]}`}>{actionLabel(l.action)}</span></td>
                      <td>{l.pintu ? <span className={s.door}>{l.pintu}</span> : "—"}</td>
                      <td>{l.nama}</td>
                      <td><div className={s.note}>{l.detail}</div></td>
                      <td>{l.actor}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--t3)", padding: 24 }}>{L("Belum ada riwayat.", "No history yet.")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══════ DIALOG ═══════ */}
      {form && (
        <LockerForm
          initial={form === "new" ? null : form}
          rows={rows}
          onClose={() => setForm(null)}
          onSave={async (input, id) => {
            const nextRow = rows.reduce((m, r) => Math.max(m, r.rowNo), 0) + 1;
            const ok = await run(() => (id ? updateLockerKey(id, input) : addLockerKey(input, nextRow)), id ? L("Perubahan tersimpan", "Changes saved") : L("Loker ditambahkan", "Locker added"));
            if (ok) setForm(null);
          }}
        />
      )}

      {borrowFor && (
        <BorrowDialog
          row={borrowFor}
          onClose={() => setBorrowFor(null)}
          onSave={async (by, date, note) => { if (await run(() => borrowLockerKey(borrowFor.id, by, date, note), L("Peminjaman dicatat", "Loan logged"))) setBorrowFor(null); }}
        />
      )}

      {delFor && (
        <ModalPortal onOverlayClick={() => setDelFor(null)} maxWidth={420}>
          <div className={s.dialog}>
            <h3>{L("Hapus loker ini?", "Delete this locker?")}</h3>
            <p><b>{delFor.pintu || delFor.blok}</b> · {delFor.nama || L("kosong", "empty")} · {L("kunci", "key")} {delFor.noKunci || "—"}<br />{L("Data dihapus permanen, tetapi tetap tercatat di Riwayat.", "The data is deleted permanently, but stays recorded in History.")}</p>
            <div className={s.dialogActions}>
              <button type="button" className={s.btn} onClick={() => setDelFor(null)}>{L("Batal", "Cancel")}</button>
              <button type="button" className={s.btnDanger} onClick={async () => { if (await run(() => deleteLockerKey(delFor.id), L("Loker dihapus", "Locker deleted"))) setDelFor(null); }}>{L("Hapus", "Delete")}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {importOpen && (
        <ImportDialog
          existing={rows.length}
          onClose={() => setImportOpen(false)}
          onDone={async (n) => { setImportOpen(false); showToast(L(`${n} loker diimpor`, `${n} lockers imported`)); await load(); setTab("cari"); }}
        />
      )}

      {toast && <div className={`${s.toast} ${toast.error ? s.toastErr : ""}`} role="status">{toast.msg}</div>}
    </ModulePage>
  );
}

/* ════════════════ Formulir tambah / ubah ════════════════ */
function LockerForm({ initial, rows, onClose, onSave }: { initial: LockerKey | null; rows: LockerKey[]; onClose: () => void; onSave: (i: LockerKeyInput, id?: string) => Promise<void> }) {
  const [blok, setBlok] = useState(initial?.blok ?? "");
  const [slot, setSlot] = useState(initial?.slot ? String(initial.slot) : "");
  const [pintu, setPintu] = useState(initial?.pintu ?? "");
  const [nama, setNama] = useState(initial?.nama ?? "");
  const [nik, setNik] = useState(initial?.nik ?? "");
  const [dept, setDept] = useState(initial?.dept ?? "");
  const [noKunci, setNoKunci] = useState(initial?.noKunci ?? "");
  const [ket, setKet] = useState(initial?.keterangan ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [emps, setEmps] = useState<PickOption[]>([]);
  const empData = useRef<Map<string, { nik: string; dept: string }>>(new Map());

  useEffect(() => {
    let alive = true;
    getAllEmployeesFull().then((list) => {
      if (!alive) return;
      const m = new Map<string, { nik: string; dept: string }>();
      const opts: PickOption[] = list.filter((e) => e.aktif !== false).map((e) => {
        m.set(e.id, { nik: e.nik ?? "", dept: e.departement ?? "" });
        return { key: e.id, name: e.nama, hint: `${e.nik ?? ""} ${e.departement ?? ""}`.trim() };
      });
      empData.current = m;
      setEmps(opts);
    }).catch(() => { /* daftar karyawan opsional: isian tetap bisa diketik manual */ });
    return () => { alive = false; };
  }, []);

  const deptList = useMemo(() => [...new Set(rows.map((r) => r.dept).filter(Boolean))].sort(), [rows]);
  const blokList = useMemo(() => [...new Set(rows.map((r) => r.blok))], [rows]);
  const status: LockerKeyStatus = initial?.status === "Dipinjam" ? "Dipinjam" : nama.trim() ? "Terisi" : "Kosong";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!blok.trim()) { setErr(L("Blok wajib diisi.", "Block is required.")); return; }
    if (!pintu.trim() && !noKunci.trim()) { setErr(L("Isi minimal pintu atau no. kunci.", "Fill in at least the door or key no.")); return; }
    const dup = rows.find((r) => r.id !== initial?.id && r.blok === blok.trim().toUpperCase() && pintu.trim() && r.pintu === pintu.trim().toUpperCase());
    if (dup && !window.confirm(L(`Pintu ${dup.pintu} di blok ${dup.blok} sudah ada (${dup.nama || "kosong"}). Tetap simpan?`, `Door ${dup.pintu} in block ${dup.blok} already exists (${dup.nama || "empty"}). Save anyway?`))) return;
    setSaving(true); setErr("");
    await onSave({ blok: blok.trim().toUpperCase(), slot: slot.trim() ? Math.max(0, Math.round(Number(slot)) || 0) || null : null, pintu: pintu.trim().toUpperCase(), nama: nama.trim().toUpperCase(), nik: nik.trim(), dept: dept.trim().toUpperCase(), noKunci: noKunci.trim(), status, keterangan: ket.trim() }, initial?.id);
    setSaving(false);
  }

  return (
    <ModalPortal onOverlayClick={() => !saving && onClose()} maxWidth={560}>
      <form className={s.dialog} onSubmit={submit}>
        <h3>{initial ? L("Ubah data loker", "Edit locker") : L("Tambah loker", "Add locker")}</h3>
        <div className={s.grid2}>
          <label className={s.field}>{L("Blok", "Block")} *<input list="lk-blok" value={blok} onChange={(e) => setBlok(e.target.value)} maxLength={30} autoFocus /></label>
          <label className={s.field}>{L("No. slot kunci", "Key slot no.")}<input type="number" min={0} value={slot} onChange={(e) => setSlot(e.target.value)} /></label>
          <label className={s.field}>{L("No. urut pintu", "Door no.")}<input value={pintu} onChange={(e) => setPintu(e.target.value)} maxLength={30} placeholder="A1" /></label>
          <label className={s.field}>{L("No. kunci", "Key no.")}<input value={noKunci} onChange={(e) => setNoKunci(e.target.value)} maxLength={30} inputMode="numeric" /></label>
          <div className={`${s.field} ${s.span2}`}>
            {L("Nama karyawan (kosongkan bila loker kosong)", "Employee name (leave empty if the locker is empty)")}
            <SearchPick
              options={emps}
              value={nama}
              onChange={setNama}
              onPick={(o) => { const d = empData.current.get(o.key); if (d) { setNik(d.nik); setDept((x) => d.dept || x); } }}
              placeholder={L("Ketik nama / NIK karyawan…", "Type employee name / NIK…")}
              ariaLabel={L("Nama karyawan", "Employee name")}
              maxLength={120}
            />
            <span className={s.hint}>{L("Pilih dari Master Karyawan untuk mengisi NIK & dept otomatis, atau ketik manual.", "Pick from the employee master to fill NIK & dept automatically, or type it in.")}</span>
          </div>
          <label className={s.field}>NIK<input value={nik} onChange={(e) => setNik(e.target.value)} maxLength={30} inputMode="numeric" /></label>
          <label className={s.field}>{L("Departemen", "Department")}<input list="lk-dept" value={dept} onChange={(e) => setDept(e.target.value)} maxLength={80} /></label>
          <label className={`${s.field} ${s.span2}`}>{L("Keterangan", "Notes")}<textarea value={ket} onChange={(e) => setKet(e.target.value)} maxLength={300} placeholder={L("mis. kunci hilang, pindah blok, tidak ada serep …", "e.g. key lost, moved block, no spare …")} /></label>
        </div>
        <datalist id="lk-blok">{blokList.map((b) => <option key={b} value={b} />)}</datalist>
        <datalist id="lk-dept">{deptList.map((d) => <option key={d} value={d} />)}</datalist>
        <div className={s.hint}>{L("Status:", "Status:")} <span className={`${s.badge} ${s["b_" + status]}`}>{statusLabel(status)}</span> {status === "Dipinjam" ? L("(kembalikan lewat tombol ↩ di daftar)", "(return it with the ↩ button in the list)") : L("(otomatis dari nama penghuni)", "(automatic, from the occupant name)")}</div>
        {err && <div className={s.formErr}>{err}</div>}
        <div className={s.dialogActions}>
          <button type="button" className={s.btn} onClick={onClose} disabled={saving}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>{saving ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </ModalPortal>
  );
}

/* ════════════════ Pinjam kunci serep ════════════════ */
function BorrowDialog({ row, onClose, onSave }: { row: LockerKey; onClose: () => void; onSave: (by: string, date: string, note: string) => Promise<void> }) {
  const [by, setBy] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [emps, setEmps] = useState<PickOption[]>([]);
  useEffect(() => { let alive = true; getAllEmployeesFull().then((l) => alive && setEmps(l.filter((e) => e.aktif !== false).map((e) => ({ key: e.id, name: e.nama, hint: `${e.nik ?? ""} ${e.departement ?? ""}`.trim() })))).catch(() => {}); return () => { alive = false; }; }, []);
  return (
    <ModalPortal onOverlayClick={() => !saving && onClose()} maxWidth={440}>
      <form className={s.dialog} onSubmit={async (e) => { e.preventDefault(); if (!by.trim()) return; setSaving(true); await onSave(by.trim().toUpperCase(), date, note.trim()); setSaving(false); }}>
        <h3>🔑 {L("Pinjam kunci serep", "Borrow spare key")}</h3>
        <p><b>{row.pintu || row.blok}</b> · {row.nama} · {L("kunci", "key")} {row.noKunci || "—"}</p>
        <div className={s.field}>
          {L("Dipinjam oleh", "Borrowed by")} *
          <SearchPick options={emps} value={by} onChange={setBy} placeholder={L("Ketik nama peminjam…", "Type the borrower's name…")} ariaLabel={L("Peminjam", "Borrower")} maxLength={80} autoFocus />
        </div>
        <label className={s.field}>{L("Tanggal pinjam", "Loan date")}<input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className={s.field}>{L("Keterangan (opsional)", "Notes (optional)")}<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={L("mis. kunci utama hilang / ketinggalan", "e.g. main key lost / forgotten")} /></label>
        <p className={s.hint}>{L("Keterangan yang diisi akan menggantikan keterangan lama.", "A filled-in note replaces the previous note.")}</p>
        <div className={s.dialogActions}>
          <button type="button" className={s.btn} onClick={onClose} disabled={saving}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={s.btnPrimary} disabled={saving || !by.trim()}>{saving ? L("Menyimpan…", "Saving…") : L("Catat peminjaman", "Log loan")}</button>
        </div>
      </form>
    </ModalPortal>
  );
}

/* ════════════════ Impor Excel ════════════════ */
function ImportDialog({ existing, onClose, onDone }: { existing: number; onClose: () => void; onDone: (n: number) => void }) {
  const [rows, setRows] = useState<LockerKeyDraft[] | null>(null);
  const [report, setReport] = useState<LockerImportReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"replace" | "append">(existing > 0 ? "replace" : "replace");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(""); setBusy(true); setRows(null); setReport(null); setFileName(f.name);
    try {
      const raw = await readLockerWorkbook(f);
      const { rows: r, report: rep } = normalizeLockerRows(raw);
      if (r.length === 0) throw new Error(L("Tidak ada baris loker yang terbaca. Pastikan sheet \"Master\" berisi kolom BLOK, NO.URUT PINTU, NAMA KARYAWAN, NIK, NO.KUNCI, DEPT, KETERANGAN.", "No locker rows could be read. Make sure the \"Master\" sheet has the columns BLOK, NO.URUT PINTU, NAMA KARYAWAN, NIK, NO.KUNCI, DEPT, KETERANGAN."));
      setRows(r); setReport(rep);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!rows) return;
    setBusy(true); setErr("");
    try { onDone(await importLockerKeys(rows, mode === "replace")); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const fixes: string[] = [];
  if (report) {
    if (report.swapped) fixes.push(L(`${report.swapped} baris kolom NO.KUNCI / DEPT tertukar → dibetulkan`, `${report.swapped} rows with swapped KEY / DEPT columns → fixed`));
    if (report.deptNumeric) fixes.push(L(`${report.deptNumeric} baris DEPT berisi angka → dikosongkan`, `${report.deptNumeric} rows with a numeric DEPT → cleared`));
    if (report.keyUnreadable) fixes.push(L(`${report.keyUnreadable} baris NO.KUNCI tak terbaca → dipindah ke Keterangan`, `${report.keyUnreadable} rows with an unreadable KEY → moved to Notes`));
    if (report.nikInvalid) fixes.push(L(`${report.nikInvalid} NIK tidak valid → dikosongkan (nilai asli di Keterangan)`, `${report.nikInvalid} invalid NIK → cleared (original value in Notes)`));
    if (report.duplicateDoors) fixes.push(L(`${report.duplicateDoors} pintu muncul lebih dari sekali dalam blok yang sama (tetap diimpor, cek manual)`, `${report.duplicateDoors} doors appear more than once in the same block (still imported, check manually)`));
  }

  return (
    <ModalPortal onOverlayClick={() => !busy && onClose()} maxWidth={580}>
      <div className={s.dialog}>
        <h3>⬆️ {L("Impor dari Excel", "Import from Excel")}</h3>
        <p>{L("Pilih file Master Loker Karyawan (.xlsx). Sheet \"Master\" dibaca: BLOK, NO.SLOT KUNCI, NO.URUT PINTU, NAMA KARYAWAN, NIK, NO.KUNCI, DEPT, KETERANGAN. Status (Terisi / Kosong / Dipinjam) ditentukan otomatis dari nama dan keterangan.", "Choose the Master Employee Locker file (.xlsx). The \"Master\" sheet is read: BLOK, NO.SLOT KUNCI, NO.URUT PINTU, NAMA KARYAWAN, NIK, NO.KUNCI, DEPT, KETERANGAN. Status (In use / Empty / Borrowed) is derived automatically from the name and notes.")}</p>
        <label className={s.dropzone}>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
          <span style={{ fontSize: 26 }}>📄</span>
          <b>{fileName || L("Klik untuk memilih file Excel", "Click to choose an Excel file")}</b>
        </label>
        {busy && !report && <p>{L("Membaca file…", "Reading file…")}</p>}
        {report && rows && (
          <>
            <div className={s.report}>
              <div><b>{report.total.toLocaleString()}</b><small>{L("loker", "lockers")}</small></div>
              <div><b>{report.terisi.toLocaleString()}</b><small>{L("terisi", "in use")}</small></div>
              <div><b>{report.kosong.toLocaleString()}</b><small>{L("kosong", "empty")}</small></div>
              <div><b>{report.dipinjam.toLocaleString()}</b><small>{L("serep dipinjam", "spares borrowed")}</small></div>
            </div>
            <p>{report.blocks} {L("blok terbaca.", "blocks read.")}</p>
            {fixes.length > 0 && <><p><b>{L("Perbaikan otomatis:", "Automatic fixes:")}</b></p><ul className={s.fixes}>{fixes.map((f) => <li key={f}>{f}</li>)}</ul></>}
            <label className={s.radio}><input type="radio" name="lkmode" checked={mode === "replace"} onChange={() => setMode("replace")} /><span><b>{L("Ganti semua data", "Replace all data")}</b><small>{existing > 0 ? L(`${existing.toLocaleString()} loker yang ada sekarang dihapus lalu diganti isi file ini.`, `The ${existing.toLocaleString()} lockers currently stored are deleted and replaced by this file.`) : L("Pilihan yang tepat untuk impor pertama.", "Right choice for the first import.")}</small></span></label>
            <label className={s.radio}><input type="radio" name="lkmode" checked={mode === "append"} onChange={() => setMode("append")} /><span><b>{L("Tambahkan ke data yang ada", "Add to existing data")}</b><small>{L("Baris file ditambahkan di bawah. Hati-hati: bisa menggandakan loker bila file yang sama diimpor dua kali.", "File rows are added below. Careful: importing the same file twice duplicates lockers.")}</small></span></label>
            {mode === "replace" && existing > 0 && <div className={s.warnBox}>⚠️ {L("Perubahan manual (peminjaman serep, koreksi nama) yang belum ada di file ini akan hilang. Ekspor data dulu bila perlu.", "Manual changes (spare-key loans, name corrections) that are not in this file will be lost. Export the data first if needed.")}</div>}
          </>
        )}
        {err && <div className={s.formErr}>{err}</div>}
        <div className={s.dialogActions}>
          <button type="button" className={s.btn} onClick={onClose} disabled={busy}>{L("Batal", "Cancel")}</button>
          <button type="button" className={s.btnPrimary} onClick={submit} disabled={busy || !rows}>{busy && rows ? L("Mengimpor…", "Importing…") : L(`Impor ${report?.total ?? 0} loker`, `Import ${report?.total ?? 0} lockers`)}</button>
        </div>
      </div>
    </ModalPortal>
  );
}
