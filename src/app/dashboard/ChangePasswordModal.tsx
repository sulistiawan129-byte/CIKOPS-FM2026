"use client";

/* Ubah password akun dashboard (menu akun → Ubah password).
   Mode "forced": akun baru dibuat / direset admin dengan password sementara
   (user_metadata.must_change_password) → modal tampil sesudah login dan tidak bisa
   ditutup sebelum password diganti (atau keluar). */

import { createPortal } from "react-dom";
import { useState } from "react";
import { changeMyPassword } from "@/lib/api";
import Icon from "@/components/Icon";
import a from "./atk.module.css";
import x from "./accounts.module.css";

type Lang = "id" | "en";

/** 0–4: panjang, huruf besar/kecil, angka, simbol */
function strength(pw: string) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++;
  return n;
}

export default function ChangePasswordModal({ lang, email, forced, onClose, onDone, onSignOut }: {
  lang: Lang; email: string; forced: boolean; onClose: () => void; onDone: () => void; onSignOut: () => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const st = strength(pw);
  const ST = [L("Terlalu lemah", "Too weak"), L("Lemah", "Weak"), L("Cukup", "Fair"), L("Kuat", "Strong"), L("Sangat kuat", "Very strong")];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { setErr(L("Password baru minimal 8 karakter, berisi huruf dan angka.", "New password: at least 8 characters with letters and digits.")); return; }
    if (pw !== pw2) { setErr(L("Ulangi password baru tidak sama.", "Passwords do not match.")); return; }
    if (pw === cur) { setErr(L("Password baru harus berbeda dari password saat ini.", "New password must differ from the current one.")); return; }
    setBusy(true);
    try { await changeMyPassword(email, cur, pw); setOk(true); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
    finally { setBusy(false); }
  }

  const type = show ? "text" : "password";
  return createPortal(
    <div className={a.overlay} onClick={forced ? undefined : onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pw-title" style={{ width: "min(460px, 100%)" }}>
        <div className={a.modalHead}>
          <h2 id="pw-title"><Icon name="key" size={18} /> {forced ? L("Buat password baru", "Set a new password") : L("Ubah password", "Change password")}</h2>
          {!forced && <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>}
        </div>

        {ok ? (
          <>
            <div className={a.msgOk}>✓ {L("Password berhasil diganti. Pakai password baru ini untuk login berikutnya.", "Password changed. Use it next time you sign in.")}</div>
            <div className={a.modalFoot}><button type="button" className={a.primary} onClick={onDone}>{L("Selesai", "Done")}</button></div>
          </>
        ) : (
          <>
            {forced && <div className={x.pwNote}>{L("Akun Anda memakai password sementara dari admin. Demi keamanan, buat password sendiri sebelum melanjutkan.", "Your account uses a temporary password from an admin. Please set your own password to continue.")}</div>}
            <p className={a.mute} style={{ margin: 0 }}>{email}</p>
            <label className={a.field}><span>{forced ? L("Password sementara", "Temporary password") : L("Password saat ini", "Current password")}</span>
              <input className={a.input} type={type} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required autoFocus />
            </label>
            <label className={a.field}><span>{L("Password baru", "New password")}</span>
              <input className={a.input} type={type} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
              {pw && (
                <span className={x.pwMeter} data-s={st}><i /><i /><i /><i /><small>{ST[st]}</small></span>
              )}
            </label>
            <label className={a.field}><span>{L("Ulangi password baru", "Repeat new password")}</span>
              <input className={a.input} type={type} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required aria-invalid={!!pw2 && pw2 !== pw} />
            </label>
            <label className={a.field} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              <span style={{ textTransform: "none", letterSpacing: 0 }}>{L("Tampilkan password", "Show passwords")}</span>
            </label>
            <small className={a.mute}>{L("Minimal 8 karakter, berisi huruf dan angka.", "At least 8 characters with letters and digits.")}</small>
            {err && <div className={a.msgErr}>{err}</div>}
            <div className={a.modalFoot}>
              {forced
                ? <button type="button" className={a.ghostBtn} onClick={onSignOut} style={{ marginRight: "auto" }}>{L("Keluar", "Sign out")}</button>
                : <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Batal", "Cancel")}</button>}
              <button type="submit" className={a.primary} disabled={busy || !cur || !pw || !pw2}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan password", "Save password")}</button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
