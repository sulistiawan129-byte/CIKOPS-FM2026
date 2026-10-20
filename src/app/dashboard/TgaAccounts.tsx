"use client";

/* Akun aplikasi TGA (/tga): admin GA membuat nama + PIN untuk tiap teknisi.
   Data lewat RPC tga_admin_* (034_tga_app.sql) — PIN disimpan sebagai hash bcrypt. */

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { tgaAdminDeleteUser, tgaAdminSaveUser, tgaAdminUsers, type TgaUserRow } from "@/lib/tga/api";
import type { GaManpower } from "@/lib/ga/model";
import a from "./atk.module.css";

type Lang = "id" | "en";
type Draft = { id: string | null; nama: string; no_hp: string; pin: string; aktif: boolean };

const fmtDT = (d: string | null, lang: Lang) =>
  d ? new Date(d).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function TgaAccounts({ lang, manpower }: { lang: Lang; manpower: GaManpower[] }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [users, setUsers] = useState<TgaUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { setUsers(await tgaAdminUsers()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setUsers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const appUrl = typeof window === "undefined" ? "/tga" : `${window.location.origin}/tga`;
  const have = new Set((users ?? []).map((u) => u.nama.trim().toLowerCase()));
  const suggestions = manpower.filter((p) => p.tim.toUpperCase() === "TGA" && !have.has(p.nama.trim().toLowerCase()));

  async function remove(u: TgaUserRow) {
    if (!confirm(L(`Hapus akun ${u.nama}? Kegiatan yang sudah dicatat tetap tersimpan.`, `Delete ${u.nama}'s account? Logged activities are kept.`))) return;
    try { await tgaAdminDeleteUser(u.id); setMsg(L(`Akun ${u.nama} dihapus.`, `${u.nama}'s account deleted.`)); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <section className={a.card}>
      <div className={a.cardHead}>
        <div>
          <h2>{L("Akun aplikasi TGA", "TGA app accounts")}</h2>
          <p>{L("Teknisi masuk ke aplikasi HP dengan nama + PIN", "Technicians sign in to the phone app with name + PIN")}</p>
        </div>
        <button type="button" className={a.primary} onClick={() => setEdit({ id: null, nama: "", no_hp: "", pin: "", aktif: true })}>＋ {L("Akun baru", "New account")}</button>
      </div>

      <div className={a.toolbar}>
        <code className={a.mono} style={{ fontSize: 13 }}>{appUrl}</code>
        <button type="button" className={a.smallBtn} onClick={() => { navigator.clipboard?.writeText(appUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }}>
          {copied ? L("✓ Tersalin", "✓ Copied") : L("Salin tautan", "Copy link")}
        </button>
        <a className={a.smallBtn} href={`https://wa.me/?text=${encodeURIComponent(L(`Aplikasi TGA CIKOPS — buka di HP lalu pilih "Tambahkan ke layar utama": ${appUrl}`, `CIKOPS TGA app — open on your phone and choose "Add to home screen": ${appUrl}`))}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          {L("Bagikan ke WhatsApp", "Share via WhatsApp")}
        </a>
        <a className={a.linkBtn} href="/tga" target="_blank" rel="noreferrer">{L("Buka aplikasi ↗", "Open app ↗")}</a>
      </div>

      {err && <div className={a.msgErr}>{err}</div>}
      {msg && <div className={a.msgOk}>{msg}</div>}

      {suggestions.length > 0 && (
        <div className={a.toolbar}>
          <span className={a.hint} style={{ margin: 0 }}>{L("Manpower TGA belum punya akun:", "TGA manpower without an account:")}</span>
          {suggestions.map((p) => (
            <button key={p.id} type="button" className={a.focusChip} onClick={() => setEdit({ id: null, nama: p.nama, no_hp: "", pin: "", aktif: true })}>＋ {p.nama}</button>
          ))}
        </div>
      )}

      {users === null ? <p className={a.empty}>{L("Memuat…", "Loading…")}</p> : users.length === 0 ? (
        <p className={a.empty}>{L("Belum ada akun. Buat akun untuk tiap teknisi TGA, lalu bagikan tautan aplikasinya.", "No accounts yet. Create one per TGA technician, then share the app link.")}</p>
      ) : (
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>{L("Nama", "Name")}</th><th>{L("No. HP", "Phone")}</th><th>Status</th><th>{L("Kegiatan bulan ini", "This month")}</th><th>{L("Terakhir masuk", "Last sign-in")}</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.nama}</b></td>
                  <td>{u.no_hp || "—"}</td>
                  <td>
                    {!u.aktif ? <span className={a.tagPending}>{L("Nonaktif", "Inactive")}</span>
                      : u.locked ? <span className={a.tagPending}>{L("Terkunci (PIN salah)", "Locked (wrong PIN)")}</span>
                      : <span className={a.tagExcel}>{L("Aktif", "Active")}</span>}
                  </td>
                  <td>{u.month_count}</td>
                  <td>{fmtDT(u.last_login_at, lang)}</td>
                  <td className={a.rowAct}>
                    <button type="button" className={a.smallBtn} onClick={() => setEdit({ id: u.id, nama: u.nama, no_hp: u.no_hp ?? "", pin: "", aktif: u.aktif })}>{L("Ubah / reset PIN", "Edit / reset PIN")}</button>{" "}
                    <button type="button" className={a.iconBtn} onClick={() => remove(u)} aria-label={L("Hapus", "Delete")}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <AccountModal lang={lang} initial={edit} onClose={() => setEdit(null)}
          onSaved={(nama, isNew) => { setEdit(null); setMsg(isNew ? L(`Akun ${nama} dibuat. Beritahu PIN-nya ke teknisi.`, `${nama}'s account created. Tell the technician the PIN.`) : L(`Akun ${nama} diperbarui.`, `${nama}'s account updated.`)); load(); }} />
      )}
    </section>
  );
}

function AccountModal({ lang, initial, onClose, onSaved }: { lang: Lang; initial: Draft; onClose: () => void; onSaved: (nama: string, isNew: boolean) => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isNew = d.id === null;
  const pinBad = d.pin !== "" && !/^\d{4,6}$/.test(d.pin);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.nama.trim()) { setErr(L("Nama wajib diisi.", "Name is required.")); return; }
    if (isNew && !d.pin) { setErr(L("PIN wajib diisi untuk akun baru.", "PIN is required for a new account.")); return; }
    if (pinBad) { setErr(L("PIN harus 4–6 angka.", "PIN must be 4–6 digits.")); return; }
    setBusy(true); setErr(null);
    try { await tgaAdminSaveUser({ ...d, nama: d.nama.trim() }); onSaved(d.nama.trim(), isNew); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tga-acc-title">
        <div className={a.modalHead}>
          <h2 id="tga-acc-title">{isNew ? L("Akun TGA baru", "New TGA account") : L("Ubah akun TGA", "Edit TGA account")}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <label className={a.field}><span>{L("Nama teknisi", "Technician name")} *</span>
          <input className={a.input} value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} maxLength={60} autoFocus={isNew} required />
        </label>
        <label className={a.field}><span>{L("No. HP", "Phone")}</span>
          <input className={a.input} value={d.no_hp} onChange={(e) => setD({ ...d, no_hp: e.target.value })} inputMode="tel" maxLength={20} placeholder="08…" />
        </label>
        <label className={a.field}><span>PIN {isNew ? "*" : L("baru (kosongkan bila tidak diganti)", "new (leave empty to keep)")}</span>
          <input className={a.input} value={d.pin} onChange={(e) => setD({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" placeholder="4–6 angka" aria-invalid={pinBad} style={{ letterSpacing: ".3em", fontFamily: "var(--mono)" }} />
          <small className={pinBad ? a.tRed : a.mute}>{L("Mengganti PIN membuka kunci akun & mengeluarkan sesi lama.", "Changing the PIN unlocks the account and signs out old sessions.")}</small>
        </label>
        {!isNew && (
          <label className={a.field} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={d.aktif} onChange={(e) => setD({ ...d, aktif: e.target.checked })} />
            <b style={{ fontSize: 14 }}>{L("Akun aktif", "Account active")}</b>
          </label>
        )}
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
