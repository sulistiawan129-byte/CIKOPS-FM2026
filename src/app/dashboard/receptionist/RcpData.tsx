"use client";

/* DATA MASTER Receptionist — tiga CRUD terpisah:
   • Karyawan  : tabel employees CIKOPS (+ email, no HP, jabatan, aktif — migrasi 033)
   • Akun Wifi : akun dari IT (tambah / ubah / impor / nonaktifkan / hapus)
   • Driver    : tabel drivers CIKOPS yang sama → otomatis sinkron dengan menu Driver CIKOPS */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { addDriver, deleteDriver, getAllDriversFull, resetDriverPin, updateDriver, type DriverInput } from "@/lib/api";
import { DRIVER_TYPES, DRIVER_TYPE_COLOR, DRIVER_TYPE_LABEL, driverTypeOf } from "@/lib/duty";
import type { Driver, DriverType, Plant } from "@/lib/types";
import { deleteRcpEmployee, importRcpEmployees, saveRcpEmployee, type RcpEmployeeInput } from "@/lib/receptionist/api";
import type { RcpEmployee, WifiAccount } from "@/lib/receptionist/model";
import { Accounts } from "./RcpWifi";
import { ExportButtons, col, hueOf, initialsOf } from "./shared";
import r from "./receptionist.module.css";
import { plantShort } from "@/lib/brand";

type Sub = "employees" | "wifi" | "drivers";

export default function RcpData({ employees, accounts, reloadEmployees, reloadWifi }: {
  employees: RcpEmployee[]; accounts: WifiAccount[]; reloadEmployees: () => Promise<void>; reloadWifi: () => Promise<void>;
}) {
  const [sub, setSub] = useState<Sub>("employees");
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [drvErr, setDrvErr] = useState("");
  const loadDrivers = useCallback(async () => {
    try { setDrivers(await getAllDriversFull(null)); setDrvErr(""); } catch (e) { setDrvErr(e instanceof Error ? e.message : String(e)); setDrivers([]); }
  }, []);
  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const cards: { k: Sub; icon: string; title: string; desc: string; n: number | string; c: string }[] = [
    { k: "employees", icon: "👥", title: "Data Karyawan", desc: "Nama, departemen, email & no HP requestor", n: employees.length, c: "var(--brand)" },
    { k: "wifi", icon: "📶", title: "Data Akun Wifi", desc: "Akun tamu dari IT & masa berlakunya", n: accounts.length, c: "var(--purple)" },
    { k: "drivers", icon: "🚘", title: "Data Driver", desc: "Sinkron dengan driver CIKOPS", n: drivers ? drivers.length : "…", c: "var(--green)" },
  ];
  return (
    <>
      <nav className={r.subnav} aria-label="Data master">
        {cards.map((c) => (
          <button key={c.k} type="button" className={r.subCard} style={{ ["--c" as string]: c.c }} aria-pressed={sub === c.k} onClick={() => setSub(c.k)}>
            <span className={r.subIcon}>{c.icon}</span>
            <span><b>{c.title}</b><small>{c.desc}</small></span>
            <span className={r.subCount}>{c.n}</span>
          </button>
        ))}
      </nav>
      {sub === "employees" && <Employees rows={employees} reload={reloadEmployees} />}
      {sub === "wifi" && <Accounts accounts={accounts} reload={reloadWifi} />}
      {sub === "drivers" && <Drivers rows={drivers} error={drvErr} reload={loadDrivers} />}
    </>
  );
}

/* ═════════════════ KARYAWAN ═════════════════ */
const EMPTY_EMP: RcpEmployeeInput = { nama: "", nik: "", departement: "", email: "", noHp: "", jabatan: "", aktif: true };

function Employees({ rows, reload }: { rows: RcpEmployee[]; reload: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "noEmail" | "inactive">("all");
  const [dept, setDept] = useState("");
  const [edit, setEdit] = useState<{ id: string | null; v: RcpEmployeeInput } | null>(null);
  const [imp, setImp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const depts = useMemo(() => [...new Set(rows.map((x) => x.departement).filter(Boolean))].sort(), [rows]);
  const withEmail = rows.filter((x) => x.email).length;
  const list = rows.filter((x) =>
    (f === "all" || (f === "noEmail" ? !x.email : !x.aktif)) && (!dept || x.departement === dept) &&
    (!q || [x.nama, x.nik, x.departement, x.email, x.jabatan, x.noHp].join(" ").toLowerCase().includes(q.toLowerCase())));

  async function toggle(x: RcpEmployee) {
    setBusy(x.id);
    try { await saveRcpEmployee(x.id, { ...x, aktif: !x.aktif }); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function del(x: RcpEmployee) {
    if (!confirm(`Hapus karyawan "${x.nama}"?`)) return;
    try { await deleteRcpEmployee(x.id); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <div><h2>Data Karyawan</h2><p>Dipakai untuk mengisi email & departemen requestor secara otomatis. Tersimpan di master karyawan CIKOPS.</p></div>
        <span className={r.row}>
          <ExportButtons rows={list} title="Data Karyawan" filename="Data_Karyawan" columns={[
            col<RcpEmployee>("n", "Nama", (x) => x.nama), col<RcpEmployee>("nik", "NIK", (x) => x.nik), col<RcpEmployee>("d", "Departemen", (x) => x.departement),
            col<RcpEmployee>("j", "Jabatan", (x) => x.jabatan), col<RcpEmployee>("e", "Email", (x) => x.email), col<RcpEmployee>("h", "No HP", (x) => x.noHp),
            col<RcpEmployee>("a", "Status", (x) => (x.aktif ? "Aktif" : "Nonaktif"))]} />
          <button type="button" className={r.ghost} onClick={() => setImp(true)}>Impor</button>
          <button type="button" className={`${r.btn} ${r.btnSm}`} onClick={() => setEdit({ id: null, v: { ...EMPTY_EMP } })}>+ Karyawan</button>
        </span>
      </div>
      <div className={r.stats}>
        <button type="button" className={r.stat} aria-pressed={f === "all"} onClick={() => setF("all")}><i /><b>{rows.length}</b>total</button>
        <button type="button" className={r.stat} style={{ ["--c" as string]: "var(--green)" }} aria-pressed={false} onClick={() => setF("all")}><i /><b>{rows.length ? Math.round((withEmail / rows.length) * 100) : 0}%</b>punya email</button>
        <button type="button" className={r.stat} style={{ ["--c" as string]: "var(--orange)" }} aria-pressed={f === "noEmail"} onClick={() => setF(f === "noEmail" ? "all" : "noEmail")}><i /><b>{rows.length - withEmail}</b>belum ada email</button>
        <button type="button" className={r.stat} style={{ ["--c" as string]: "var(--t3)" }} aria-pressed={f === "inactive"} onClick={() => setF(f === "inactive" ? "all" : "inactive")}><i /><b>{rows.filter((x) => !x.aktif).length}</b>nonaktif</button>
      </div>
      <div className={r.toolbar}>
        <label className={r.search}><span>⌕</span><input className={r.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, NIK, email, departemen…" /></label>
        <select className={r.input} style={{ width: 220 }} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Departemen">
          <option value="">Semua departemen</option>{depts.map((d) => <option key={d}>{d}</option>)}
        </select>
        <span className={r.mute} style={{ fontSize: 13 }}>{list.length} ditampilkan</span>
      </div>
      {list.length === 0 ? <p className={r.empty}>{rows.length ? "Tidak ada yang cocok dengan filter." : "Belum ada data karyawan. Klik “+ Karyawan” atau “Impor”."}</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>Karyawan</th><th>Departemen</th><th>Email</th><th>No HP</th><th>Aktif</th><th /></tr></thead>
            <tbody>
              {list.slice(0, 400).map((x) => (
                <tr key={x.id} className={`${r.clickRow} ${x.aktif ? "" : r.rowOff}`} onClick={() => setEdit({ id: x.id, v: { nama: x.nama, nik: x.nik, departement: x.departement, email: x.email, noHp: x.noHp, jabatan: x.jabatan, aktif: x.aktif } })}>
                  <td><span className={r.who}><span className={r.avatar} style={{ ["--hue" as string]: hueOf(x.nama) }}>{initialsOf(x.nama)}</span><span><b>{x.nama}</b><small>{[x.jabatan, x.nik && `NIK ${x.nik}`].filter(Boolean).join(" · ") || "—"}</small></span></span></td>
                  <td>{x.departement || <span className={r.mute}>–</span>}</td>
                  <td>{x.email ? x.email : <span className={`${r.pill} ${r.pOrange}`}>belum ada</span>}</td>
                  <td className={r.nowrap}>{x.noHp || <span className={r.mute}>–</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}><button type="button" role="switch" aria-checked={x.aktif} aria-label={`Aktif ${x.nama}`} className={r.switch} disabled={busy === x.id} onClick={() => toggle(x)} /></td>
                  <td className={r.num} onClick={(e) => e.stopPropagation()}><span className={r.rowActs}>
                    <button type="button" className={r.link} onClick={() => setEdit({ id: x.id, v: { nama: x.nama, nik: x.nik, departement: x.departement, email: x.email, noHp: x.noHp, jabatan: x.jabatan, aktif: x.aktif } })}>Ubah</button>
                    <button type="button" className={`${r.link} ${r.danger}`} onClick={() => del(x)}>Hapus</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 400 && <p className={r.hint}>Menampilkan 400 pertama — persempit dengan pencarian.</p>}
        </div>
      )}
      {edit && <EmployeeModal init={edit} depts={depts} rows={rows} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
      {imp && <EmployeeImport rows={rows} onClose={() => setImp(false)} reload={reload} />}
    </section>
  );
}

function EmployeeModal({ init, depts, rows, onClose, onSaved }: { init: { id: string | null; v: RcpEmployeeInput }; depts: string[]; rows: RcpEmployee[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState(init.v);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof RcpEmployeeInput>(k: K, x: RcpEmployeeInput[K]) => setV((o) => ({ ...o, [k]: x }));
  const dup = rows.some((x) => x.id !== init.id && x.nama.trim().toLowerCase() === v.nama.trim().toLowerCase());
  const badEmail = !!v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim());
  const ok = v.nama.trim() && !badEmail && !busy;
  async function save() {
    if (!ok) return;
    setBusy(true); setErr("");
    try { await saveRcpEmployee(init.id, v); await onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={560}>
      <form className={r.modal} onSubmit={(e) => { e.preventDefault(); save(); }} role="dialog" aria-modal="true" aria-labelledby="rcp-emp-title">
        <div className={r.modalHead}>
          <div className={r.who}><span className={r.avatar} style={{ ["--hue" as string]: hueOf(v.nama || "?"), width: 44, height: 44, fontSize: 15 }}>{initialsOf(v.nama)}</span>
            <div><h2 id="rcp-emp-title">{init.id ? "Ubah karyawan" : "Karyawan baru"}</h2><p>{v.nama || "Isi nama karyawan"}</p></div></div>
          <button type="button" className={r.iconBtn} onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div className={r.form}>
          <div className={r.section}>Identitas</div>
          <label className={`${r.field} ${r.full}`}><span>Nama lengkap *</span><input className={r.input} value={v.nama} onChange={(e) => set("nama", e.target.value)} autoFocus required />{dup && <small className={r.danger} style={{ fontSize: 12 }}>Nama ini sudah ada di data karyawan.</small>}</label>
          <label className={r.field}><span>NIK</span><input className={r.input} value={v.nik} onChange={(e) => set("nik", e.target.value)} /></label>
          <label className={r.field}><span>Jabatan</span><input className={r.input} value={v.jabatan} onChange={(e) => set("jabatan", e.target.value)} /></label>
          <label className={`${r.field} ${r.full}`}><span>Departemen</span><input className={r.input} list="rcp-depts" value={v.departement} onChange={(e) => set("departement", e.target.value)} /></label>
          <datalist id="rcp-depts">{depts.map((d) => <option key={d} value={d} />)}</datalist>
          <div className={r.section}>Kontak <em style={{ fontStyle: "normal", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>— untuk email & WhatsApp bukti permintaan</em></div>
          <label className={r.field}><span>Email</span><input className={r.input} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@perusahaan.com" aria-invalid={badEmail} />{badEmail && <small className={r.danger} style={{ fontSize: 12 }}>Format email tidak valid.</small>}</label>
          <label className={r.field}><span>No HP / WhatsApp</span><input className={r.input} inputMode="tel" value={v.noHp} onChange={(e) => set("noHp", e.target.value)} placeholder="08…" /></label>
          <div className={`${r.field} ${r.full}`}><span>Status</span>
            <label className={r.check}><button type="button" role="switch" aria-checked={v.aktif} className={r.switch} onClick={() => set("aktif", !v.aktif)} /> {v.aktif ? "Aktif — muncul di saran nama" : "Nonaktif — tidak muncul di saran nama"}</label>
          </div>
        </div>
        {err && <div className={r.err}>{err}</div>}
        <div className={r.modalFoot}>
          <span className={r.hint}>Tersimpan di master karyawan CIKOPS.</span><span className={r.grow} />
          <button type="button" className={r.ghost} onClick={onClose}>Batal</button>
          <button type="submit" className={r.btn} disabled={!ok}>{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </form>
    </ModalPortal>
  );
}

function parseEmployees(text: string): (RcpEmployeeInput & { error?: string })[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/[;,]/)).map((x) => x.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((x) => x.toLowerCase());
  const find = (...k: string[]) => head.findIndex((h) => k.some((x) => h.includes(x)));
  const hasHead = find("nama", "name", "email", "dept", "departemen") >= 0;
  const c = hasHead
    ? { n: find("nama", "name"), nik: find("nik", "id kar", "nip"), d: find("dept", "departemen", "divisi", "bagian"), j: find("jabatan", "posisi", "title"), e: find("email", "mail"), h: find("hp", "phone", "telp", "wa") }
    : { n: 0, nik: -1, d: 1, j: -1, e: 2, h: 3 };
  return lines.slice(hasHead ? 1 : 0).map((l) => {
    const x = split(l); const g = (i: number) => (i >= 0 ? x[i] ?? "" : "");
    const row = { nama: g(c.n), nik: g(c.nik), departement: g(c.d), jabatan: g(c.j), email: g(c.e).toLowerCase(), noHp: g(c.h), aktif: true } as RcpEmployeeInput & { error?: string };
    if (!row.nama) row.error = "nama kosong";
    else if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) row.error = "email tidak valid";
    return row;
  });
}

function EmployeeImport({ rows, onClose, reload }: { rows: RcpEmployee[]; onClose: () => void; reload: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const parsed = useMemo(() => parseEmployees(text), [text]);
  const ok = parsed.filter((x) => !x.error);
  const known = new Set(rows.map((x) => x.nama.trim().toLowerCase()));
  async function go() {
    setBusy(true); setMsg("");
    try { const res = await importRcpEmployees(ok, rows); await reload(); setMsg(`✓ ${res.created} karyawan baru, ${res.updated} dilengkapi.`); setText(""); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={760}>
      <div className={r.modal} role="dialog" aria-modal="true" aria-labelledby="rcp-empimp-title">
        <div className={r.modalHead}><div><h2 id="rcp-empimp-title">Impor data karyawan</h2><p>Tempel dari Excel — nama yang sudah ada hanya dilengkapi (tidak ditimpa)</p></div><button type="button" className={r.iconBtn} onClick={onClose} aria-label="Tutup">✕</button></div>
        <p className={r.hint}>Kolom yang dikenali: <b>Nama</b>, <b>NIK</b>, <b>Departemen</b>, <b>Jabatan</b>, <b>Email</b>, <b>No HP</b> (urutan bebas, dengan baris judul). Tanpa judul: nama, departemen, email, no HP.</p>
        <textarea className={r.input} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Nama\tDepartemen\tEmail\tNo HP\nBudi Santoso\tHR\tbudi@ffi.co.id\t0812…"} />
        {parsed.length > 0 && (
          <div className={r.previewBox}>
            <table className={r.table}>
              <thead><tr><th>Nama</th><th>Departemen</th><th>Email</th><th>No HP</th><th /></tr></thead>
              <tbody>{parsed.slice(0, 200).map((x, i) => (
                <tr key={i}><td>{x.nama || "–"}</td><td>{x.departement}</td><td>{x.email}</td><td>{x.noHp}</td>
                  <td>{x.error ? <span className={`${r.pill} ${r.pRed}`}>{x.error}</span> : known.has(x.nama.trim().toLowerCase()) ? <span className={`${r.pill} ${r.pBlue}`}>lengkapi</span> : <span className={`${r.pill} ${r.pGreen}`}>baru</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {msg && <div className={msg.startsWith("✓") ? r.ok : r.err}>{msg}</div>}
        <div className={r.modalFoot}>
          <button type="button" className={r.ghost} onClick={onClose}>Tutup</button>
          <button type="button" className={r.btn} disabled={!ok.length || busy} onClick={go}>{busy ? "Mengimpor…" : `Impor ${ok.length} baris`}</button>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ═════════════════ DRIVER (tabel drivers CIKOPS) ═════════════════ */
const AVATARS = ["🧑‍✈️", "👨‍✈️", "👩‍✈️", "🧔", "👨", "👩", "🧑", "👴", "🚗", "🚐"];
interface DrvForm { nama: string; noHp: string; email: string; plant: Plant; type: DriverType; user: string; userTitle: string; avatar: string; aktif: boolean; pin: string }

function Drivers({ rows, error, reload }: { rows: Driver[] | null; error: string; reload: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | DriverType>("all");
  const [plant, setPlant] = useState<"all" | Plant>("all");
  const [edit, setEdit] = useState<{ d: Driver | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows) return <section className={r.card}><p className={r.empty}>Memuat data driver…</p></section>;
  const list = rows.filter((d) => (type === "all" || driverTypeOf(d) === type) && (plant === "all" || (d.plant ?? "CIK") === plant) &&
    (!q || [d.nama, d.no_hp ?? "", d.email ?? "", d.assigned_user ?? ""].join(" ").toLowerCase().includes(q.toLowerCase())));
  async function toggle(d: Driver) {
    setBusy(d.id);
    try { await updateDriver(d.id, toInput(d, { aktif: !d.aktif })); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function del(d: Driver) {
    if (!confirm(`Hapus driver "${d.nama}"? Riwayat tugasnya mungkin membuat penghapusan ditolak — nonaktifkan bila ragu.`)) return;
    try { await deleteDriver(d.id); await reload(); } catch (e) { alert((e instanceof Error ? e.message : String(e)) + "\n\nSaran: nonaktifkan driver ini saja."); }
  }
  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <div><h2>Data Driver</h2><p>Data yang sama dengan menu Driver CIKOPS — perubahan di sini langsung berlaku di Penugasan & aplikasi driver.</p></div>
        <span className={r.row}>
          <ExportButtons rows={list} title="Data Driver" filename="Data_Driver" columns={[
            col<Driver>("n", "Nama", (d) => d.nama), col<Driver>("t", "Tipe", (d) => DRIVER_TYPE_LABEL[driverTypeOf(d)]), col<Driver>("p", "Plant", (d) => d.plant ?? "CIK"),
            col<Driver>("h", "No HP", (d) => d.no_hp ?? ""), col<Driver>("e", "Email", (d) => d.email ?? ""), col<Driver>("u", "User", (d) => d.assigned_user ?? ""),
            col<Driver>("a", "Status", (d) => (d.aktif ? "Aktif" : "Nonaktif"))]} />
          <button type="button" className={`${r.btn} ${r.btnSm}`} onClick={() => setEdit({ d: null })}>+ Driver</button>
        </span>
      </div>
      {error && <div className={r.err}>{error}</div>}
      <div className={r.stats}>
        <button type="button" className={r.stat} aria-pressed={type === "all"} onClick={() => setType("all")}><i /><b>{rows.length}</b>semua</button>
        {DRIVER_TYPES.map((t) => (
          <button key={t} type="button" className={r.stat} style={{ ["--c" as string]: DRIVER_TYPE_COLOR[t] }} aria-pressed={type === t} onClick={() => setType(type === t ? "all" : t)}>
            <i /><b>{rows.filter((d) => driverTypeOf(d) === t).length}</b>{DRIVER_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className={r.toolbar}>
        <label className={r.search}><span>⌕</span><input className={r.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, no HP, email, user…" /></label>
        <div className={r.seg}>{(["all", "CIK", "PRB"] as const).map((p) => <button key={p} type="button" aria-pressed={plant === p} onClick={() => setPlant(p)}>{p === "all" ? "Semua plant" : p}</button>)}</div>
      </div>
      {list.length === 0 ? <p className={r.empty}>Tidak ada driver yang cocok.</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>Driver</th><th>Tipe</th><th>Plant</th><th>Kontak</th><th>Aktif</th><th /></tr></thead>
            <tbody>
              {list.map((d) => {
                const t = driverTypeOf(d);
                return (
                  <tr key={d.id} className={`${r.clickRow} ${d.aktif ? "" : r.rowOff}`} onClick={() => setEdit({ d })}>
                    <td><span className={r.who}><span className={`${r.avatar} ${r.avatarEmoji}`}>{d.avatar_emoji || "🧑‍✈️"}</span><span><b>{d.nama}</b><small>{t === "user" ? `mengantar ${d.assigned_user || "–"}` : DRIVER_TYPE_LABEL[t]}</small></span></span></td>
                    <td><span className={r.typeTag} style={{ ["--tc" as string]: DRIVER_TYPE_COLOR[t] }}>{DRIVER_TYPE_LABEL[t]}</span></td>
                    <td><span className={`${r.pill} ${d.plant === "PRB" ? r.pOrange : r.pBlue}`}>{d.plant ?? "CIK"}</span></td>
                    <td><div>{d.no_hp || <span className={r.mute}>–</span>}</div><div className={r.mute} style={{ fontSize: 12 }}>{d.email || ""}</div></td>
                    <td onClick={(e) => e.stopPropagation()}><button type="button" role="switch" aria-checked={d.aktif} aria-label={`Aktif ${d.nama}`} className={r.switch} disabled={busy === d.id} onClick={() => toggle(d)} /></td>
                    <td className={r.num} onClick={(e) => e.stopPropagation()}><span className={r.rowActs}>
                      <button type="button" className={r.link} onClick={() => setEdit({ d })}>Ubah</button>
                      <button type="button" className={`${r.link} ${r.danger}`} onClick={() => del(d)}>Hapus</button>
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <DriverModal d={edit.d} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </section>
  );
}

function toInput(d: Driver, patch: Partial<DriverInput> = {}): DriverInput {
  const t = driverTypeOf(d);
  return { nama: d.nama, no_hp: d.no_hp ?? null, email: d.email ?? null, avatar_emoji: d.avatar_emoji ?? null, aktif: d.aktif, plant: d.plant ?? "CIK",
    driver_type: t, assigned_user: t === "user" ? d.assigned_user ?? null : null, assigned_user_title: t === "user" ? d.assigned_user_title ?? null : null, ...patch };
}

function DriverModal({ d, onClose, onSaved }: { d: Driver | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<DrvForm>(() => ({
    nama: d?.nama ?? "", noHp: d?.no_hp ?? "", email: d?.email ?? "", plant: d?.plant ?? "CIK", type: driverTypeOf(d), user: d?.assigned_user ?? "",
    userTitle: d?.assigned_user_title ?? "", avatar: d?.avatar_emoji || AVATARS[0], aktif: d?.aktif ?? true, pin: "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof DrvForm>(k: K, x: DrvForm[K]) => setV((o) => ({ ...o, [k]: x }));
  const pinOk = d ? v.pin === "" || /^\d{4,}$/.test(v.pin) : /^\d{4,}$/.test(v.pin);
  const ok = v.nama.trim() && pinOk && (v.type !== "user" || v.user.trim()) && !busy;
  async function save() {
    if (!ok) return;
    setBusy(true); setErr("");
    const input: DriverInput = { nama: v.nama.trim(), no_hp: v.noHp.trim() || null, email: v.email.trim() || null, avatar_emoji: v.avatar, aktif: v.aktif, plant: v.plant,
      driver_type: v.type, assigned_user: v.type === "user" ? v.user.trim() : null, assigned_user_title: v.type === "user" ? v.userTitle.trim() || null : null };
    try {
      if (d) { await updateDriver(d.id, input); if (v.pin) await resetDriverPin(d.id, v.pin); }
      else await addDriver(input, v.pin);
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={600}>
      <form className={r.modal} onSubmit={(e) => { e.preventDefault(); save(); }} role="dialog" aria-modal="true" aria-labelledby="rcp-drv-title">
        <div className={r.modalHead}>
          <div className={r.who}><span className={`${r.avatar} ${r.avatarEmoji}`} style={{ width: 44, height: 44, fontSize: 22 }}>{v.avatar}</span>
            <div><h2 id="rcp-drv-title">{d ? "Ubah driver" : "Driver baru"}</h2><p>Sinkron dengan driver CIKOPS</p></div></div>
          <button type="button" className={r.iconBtn} onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div className={r.form}>
          <div className={r.section}>Identitas</div>
          <label className={`${r.field} ${r.full}`}><span>Nama driver *</span><input className={r.input} value={v.nama} onChange={(e) => set("nama", e.target.value)} autoFocus required /></label>
          <div className={`${r.field} ${r.full}`}><span>Avatar</span>
            <div className={r.chips}>{AVATARS.map((a) => <button key={a} type="button" className={r.chip} style={{ fontSize: 18, flex: "0 0 auto" }} aria-pressed={v.avatar === a} onClick={() => set("avatar", a)}>{a}</button>)}</div>
          </div>
          <label className={r.field}><span>No HP / WhatsApp</span><input className={r.input} inputMode="tel" value={v.noHp} onChange={(e) => set("noHp", e.target.value)} /></label>
          <label className={r.field}><span>Email <em>(login aplikasi driver)</em></span><input className={r.input} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></label>
          <div className={r.section}>Penugasan</div>
          <div className={`${r.field} ${r.full}`}><span>Tipe driver</span>
            <div className={r.chips}>{DRIVER_TYPES.map((t) => <button key={t} type="button" className={r.chip} aria-pressed={v.type === t} onClick={() => set("type", t)}>{DRIVER_TYPE_LABEL[t]}</button>)}</div>
          </div>
          {v.type === "user" && (
            <>
              <label className={r.field}><span>Nama user *</span><input className={r.input} value={v.user} onChange={(e) => set("user", e.target.value)} placeholder="Siapa yang diantar" /></label>
              <label className={r.field}><span>Jabatan user</span><input className={r.input} value={v.userTitle} onChange={(e) => set("userTitle", e.target.value)} /></label>
            </>
          )}
          <div className={r.field}><span>Plant</span><div className={r.chips}>{(["CIK", "PRB"] as Plant[]).map((p) => <button key={p} type="button" className={r.chip} aria-pressed={v.plant === p} onClick={() => set("plant", p)}>{plantShort(p)}</button>)}</div></div>
          <div className={r.field}><span>Status</span><label className={r.check} style={{ height: 40 }}><button type="button" role="switch" aria-checked={v.aktif} className={r.switch} onClick={() => set("aktif", !v.aktif)} /> {v.aktif ? "Aktif" : "Nonaktif"}</label></div>
          <div className={r.section}>Keamanan</div>
          <label className={`${r.field} ${r.full}`}><span>{d ? "PIN baru" : "PIN *"} <em>{d ? "(kosongkan bila tidak diganti)" : "(minimal 4 angka)"}</em></span>
            <input className={r.input} inputMode="numeric" value={v.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} placeholder="••••" aria-invalid={!pinOk && v.pin !== ""} /></label>
        </div>
        {err && <div className={r.err}>{err}</div>}
        <div className={r.modalFoot}>
          <span className={r.hint}>Tersimpan di tabel driver CIKOPS.</span><span className={r.grow} />
          <button type="button" className={r.ghost} onClick={onClose}>Batal</button>
          <button type="submit" className={r.btn} disabled={!ok}>{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </form>
    </ModalPortal>
  );
}
