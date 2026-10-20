"use client";

/* ════════════════════════════════════════════════════════════
   Akun & Role — setiap admin mengelola akun timnya sendiri
   (Edge Function manage-staff-account + SQL 02_peran_keamanan bagian 039).
   ExecutiveView — tampilan Management: FM Command Center + tarik laporan.
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ROLE_INFO, createStaffAccount, listStaffAccounts, resetStaffPassword, setStaffActive, updateStaffAccount,
  type MyProfile, type StaffAccount, type StaffRole,
} from "@/lib/api";
import { useLang } from "@/lib/providers";
import { ModuleHeader, ModulePage } from "./ModuleShell";
import a from "./atk.module.css";
import x from "./accounts.module.css";

type Lang = "id" | "en";
const LEGACY: Record<string, { id: string; en: string }> = { admin: { id: "Admin (role lama)", en: "Admin (legacy)" }, ga: { id: "GA (role lama)", en: "GA (legacy)" } };
const roleName = (r: string, lang: Lang) => { const i = ROLE_INFO[r as StaffRole]; return i ? (lang === "en" ? i.en : i.id) : LEGACY[r]?.[lang] ?? r; };
const roleDesc = (r: string, lang: Lang) => { const i = ROLE_INFO[r as StaffRole]; return i ? (lang === "en" ? i.descEn : i.descId) : ""; };
const ROLE_TONE: Record<string, string> = {
  master: x.tMaster, admin_ga_cik: x.tGa, admin_ga_prb: x.tPrb, admin_iss: x.tIss, admin_security: x.tSec, receptionist: x.tRcp, management: x.tMgmt,
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const fmtDate = (s: string | null, lang: Lang) => (s ? new Date(s).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function AccountsTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang: raw } = useLang();
  const lang: Lang = raw === "en" ? "en" : "id";
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [rows, setRows] = useState<StaffAccount[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState<string>("all");
  const [edit, setEdit] = useState<StaffAccount | "new" | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const r = await listStaffAccounts(); setRows(r.rows); setRoles(r.roles); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (roleF === "all" || r.role === roleF) && (!s || r.fullName.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)));
  }, [rows, q, roleF]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((m, r) => { m[r.role] = (m[r.role] || 0) + 1; return m; }, {}), [rows]);
  const filterRoles = [...new Set([...roles, ...rows.map((r) => r.role)])];

  async function toggleActive(r: StaffAccount) {
    if (!window.confirm(r.active ? L(`Nonaktifkan ${r.fullName || r.email}? Akun tidak bisa login sampai diaktifkan lagi.`, `Deactivate ${r.email}?`) : L(`Aktifkan lagi ${r.fullName || r.email}?`, `Reactivate ${r.email}?`))) return;
    try { await setStaffActive(r.id, !r.active); setMsg(r.active ? L("Akun dinonaktifkan.", "Account deactivated.") : L("Akun aktif lagi.", "Account reactivated.")); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function reset(r: StaffAccount) {
    if (!window.confirm(L(`Buat password baru untuk ${r.fullName || r.email}? Password lama tidak berlaku lagi.`, `Create a new password for ${r.email}?`))) return;
    try { const res = await resetStaffPassword(r.id); setSecret({ email: r.email, password: res.password, title: L("Password baru", "New password") }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Sistem · Akses", "System · Access")}
        title={L("Akun & Role", "Accounts & Roles")}
        desc={L("Buat dan atur akun tim Anda. Setiap role hanya bisa membuka dan mengubah modulnya sendiri — dijaga juga oleh database.", "Create and manage your team's accounts. Each role can only open and change its own modules — enforced by the database too.")}
        actions={roles.length > 0 ? <button type="button" className={a.primary} onClick={() => setEdit("new")}>+ {L("Akun baru", "New account")}</button> : undefined}
      />

      {err && <div className={a.msgErr} role="alert">{err}</div>}
      {msg && <div className={a.msgOk} role="status">{msg}</div>}

      {roles.length > 0 && (
        <div className={x.roleGrid}>
          {roles.map((r) => (
            <button type="button" key={r} className={`${x.roleCard} ${ROLE_TONE[r] || ""} ${roleF === r ? x.roleOn : ""}`} onClick={() => setRoleF(roleF === r ? "all" : r)}>
              <span className={x.roleDot} aria-hidden="true" />
              <b>{roleName(r, lang)}</b>
              <small>{roleDesc(r, lang)}</small>
              <em>{counts[r] || 0} {L("akun", "accounts")}</em>
            </button>
          ))}
        </div>
      )}

      <div className={a.card}>
        <div className={x.toolbar}>
          <input className={`${a.input} ${a.search}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Cari nama atau email…", "Search name or email…")} aria-label={L("Cari akun", "Search accounts")} />
          <select className={a.input} style={{ maxWidth: 240 }} value={roleF} onChange={(e) => setRoleF(e.target.value)} aria-label="Role">
            <option value="all">{L("Semua role", "All roles")}</option>
            {filterRoles.map((r) => <option key={r} value={r}>{roleName(r, lang)}</option>)}
          </select>
          <button type="button" className={a.ghostBtn} onClick={load} disabled={loading}>{loading ? L("Memuat…", "Loading…") : L("Muat ulang", "Reload")}</button>
        </div>

        {loading && rows.length === 0 ? <p className={a.empty}>{L("Memuat akun…", "Loading accounts…")}</p>
          : shown.length === 0 ? <p className={a.empty}>{rows.length ? L("Tidak ada akun yang cocok.", "No matching accounts.") : L("Belum ada akun di tim Anda.", "No accounts in your team yet.")}</p>
          : (
            <ul className={x.list}>
              {shown.map((r) => (
                <li key={r.id} className={`${x.row} ${r.active ? "" : x.rowOff}`}>
                  <span className={`${x.avatar} ${ROLE_TONE[r.role] || ""}`}>{initials(r.fullName || r.email)}</span>
                  <div className={x.who}>
                    <b>{r.fullName || "—"}{r.self && <span className={x.me}>{L("Anda", "You")}</span>}</b>
                    <small>{r.email}</small>
                  </div>
                  <span className={`${x.rolePill} ${ROLE_TONE[r.role] || ""}`}>{roleName(r.role, lang)}{r.plant ? ` · ${r.plant}` : ""}</span>
                  <span className={x.meta}>{r.active ? <span className={a.pillOk}>{L("Aktif", "Active")}</span> : <span className={a.pillWarn}>{L("Nonaktif", "Inactive")}</span>}<small>{L("Login terakhir", "Last sign-in")}: {fmtDate(r.lastSignIn, lang)}</small></span>
                  <span className={x.acts}>
                    <button type="button" className={a.smallBtn} onClick={() => setEdit(r)}>{L("Ubah", "Edit")}</button>
                    <button type="button" className={a.smallBtn} onClick={() => reset(r)}>{L("Password", "Password")}</button>
                    {!r.self && <button type="button" className={r.active ? a.dangerBtn : a.smallBtn} onClick={() => toggleActive(r)}>{r.active ? L("Nonaktifkan", "Deactivate") : L("Aktifkan", "Activate")}</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
      {myProfile && <p className={a.mute} style={{ margin: 0 }}>{L("Akun driver dikelola di Master Data → Driver, akun TGA di Cleaning & Gardening → TGA.", "Driver accounts are managed in Master Data → Drivers, TGA accounts in Cleaning & Gardening → TGA.")}</p>}

      {edit && (
        <AccountModal
          lang={lang} roles={roles} acc={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={(res) => { setEdit(null); load(); if (res) setSecret(res); else setMsg(L("Akun tersimpan.", "Account saved.")); }}
        />
      )}
      {secret && <SecretModal lang={lang} {...secret} onClose={() => setSecret(null)} />}
    </ModulePage>
  );
}

function AccountModal({ lang, roles, acc, onClose, onSaved }: {
  lang: Lang; roles: string[]; acc: StaffAccount | null;
  onClose: () => void; onSaved: (secret: { email: string; password: string; title: string } | null) => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const isNew = !acc;
  const [email, setEmail] = useState(acc?.email ?? "");
  const [name, setName] = useState(acc?.fullName ?? "");
  // akun baru: jangan otomatis Master Admin
  const [role, setRole] = useState(acc?.role ?? roles.find((r) => r !== "master") ?? roles[0] ?? "");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const opts = acc && !roles.includes(acc.role) ? [acc.role, ...roles] : roles;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        const r = await createStaffAccount({ email, fullName: name, role, password: pw || undefined });
        onSaved({ email: r.email, password: r.password, title: r.existed ? L("Akun lama dihubungkan & password diganti", "Existing account linked, password changed") : L("Akun dibuat", "Account created") });
      } else {
        await updateStaffAccount(acc.id, { fullName: name, role: role !== acc.role ? role : undefined });
        onSaved(null);
      }
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="acc-title" style={{ width: "min(620px, 100%)" }}>
        <div className={a.modalHead}>
          <h2 id="acc-title">{isNew ? L("Akun baru", "New account") : `${L("Ubah akun", "Edit account")} · ${acc.email}`}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        {isNew && <label className={a.field}><span>Email *</span><input className={a.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="nama@perusahaan.com" /></label>}
        <label className={a.field}><span>{L("Nama", "Name")} *</span><input className={a.input} value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!isNew} /></label>
        <div className={a.field}>
          <span>Role *</span>
          <div className={x.rolePick}>
            {opts.map((r) => (
              <button type="button" key={r} disabled={acc?.self && r !== acc.role} className={`${x.pickItem} ${ROLE_TONE[r] || ""} ${role === r ? x.pickOn : ""}`} onClick={() => setRole(r)}>
                <b>{roleName(r, lang)}</b><small>{roleDesc(r, lang)}</small>
              </button>
            ))}
          </div>
          {acc?.self && <small className={a.mute}>{L("Role akun sendiri tidak bisa diubah.", "You can't change your own role.")}</small>}
        </div>
        {isNew && (
          <label className={a.field}>
            <span>{L("Password awal", "Initial password")}</span>
            <input className={a.input} type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={L("Kosongkan = dibuat acak", "Empty = random")} autoComplete="new-password" />
            <small className={a.mute}>{L("Minimal 8 karakter, berisi huruf dan angka. Pemilik akun bisa menggantinya setelah login.", "At least 8 characters with letters and digits.")}</small>
          </label>
        )}
        {err && <div className={a.msgErr} role="alert">{err}</div>}
        <div className={a.modalFoot}>
          <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={a.primary} disabled={busy || !name.trim() || (isNew && !email.trim()) || !role}>{busy ? L("Menyimpan…", "Saving…") : isNew ? L("Buat akun", "Create account") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function SecretModal({ lang, email, password, title, onClose }: { lang: Lang; email: string; password: string; title: string; onClose: () => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [copied, setCopied] = useState(false);
  const text = `Email: ${email}\nPassword: ${password}\nLogin: ${typeof window !== "undefined" ? window.location.origin : ""}/dashboard`;
  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <div className={a.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sec-title" style={{ width: "min(480px, 100%)" }}>
        <div className={a.modalHead}><h2 id="sec-title">🔑 {title}</h2><button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button></div>
        <p className={a.mute} style={{ margin: 0 }}>{L("Sampaikan ke pemilik akun. Password ini hanya ditampilkan sekali.", "Share with the account owner. Shown only once.")}</p>
        <div className={x.secret}><span>Email</span><b>{email}</b><span>Password</span><b className={x.mono}>{password}</b></div>
        <div className={a.modalFoot}>
          <button type="button" className={a.ghostBtn} onClick={() => { navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {}); }}>{copied ? L("✓ Tersalin", "✓ Copied") : L("Salin", "Copy")}</button>
          <button type="button" className={a.primary} onClick={onClose}>{L("Selesai", "Done")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Management: FM Command Center + tarik laporan ── */
export function ExecutiveView({ onReports }: { onReports: () => void }) {
  const { lang: raw } = useLang();
  const L = (id: string, en: string) => (raw === "en" ? en : id);
  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Management · Lihat saja", "Management · View only")}
        title="FM Command Center"
        desc={L("Data berjalan hari ini dan bulan berjalan dari semua modul. Untuk laporan resmi (Excel / PowerPoint / PDF), buka Tarik laporan.", "Live data for today and this month across modules. For official reports (Excel / PowerPoint / PDF), open Report export.")}
        actions={<>
          <a className={a.ghostBtn} href="/dashboard-viewonly" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{L("Layar penuh ↗", "Full screen ↗")}</a>
          <button type="button" className={a.primary} onClick={onReports}>📈 {L("Tarik laporan", "Report export")}</button>
        </>}
      />
      <div className={x.board}><iframe src="/dashboard-viewonly" title="FM Command Center" /></div>
    </ModulePage>
  );
}
