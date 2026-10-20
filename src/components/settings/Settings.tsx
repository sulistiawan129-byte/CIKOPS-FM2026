"use client";

/* ════════════════════════════════════════════════════════════
   Model CRUD standar untuk semua halaman Pengaturan.
   • CrudList      — daftar data: cari, tambah, ubah, hapus (langsung tersimpan)
   • SettingsGroup — nilai tunggal: lihat nilai, ubah lewat formulir
   Keduanya memakai formulir dari definisi field (FieldDef), jadi
   pengaturan baru cukup ditambah sebagai data, tanpa membuat UI baru.
════════════════════════════════════════════════════════════ */

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import s from "./settings.module.css";

export type FieldType = "text" | "email" | "number" | "time" | "textarea" | "select" | "chips";
export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  /** tidak bisa diubah setelah dibuat (mis. kunci) */
  readOnlyOnEdit?: boolean;
  /** pesan error, atau null bila valid */
  validate?: (value: string, row: Partial<T>) => string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/* ── Formulir dari definisi field ── */
function FormModal<T extends Record<string, unknown>>({ title, fields, initial, isNew, onClose, onSubmit }: {
  title: string; fields: FieldDef<T>[]; initial: Partial<T>; isNew: boolean;
  onClose: () => void; onSubmit: (v: Partial<T>) => Promise<void>;
}) {
  const [v, setV] = useState<Partial<T>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, val: unknown) => setV((x) => ({ ...x, [k]: val }));

  function check(): string | null {
    for (const f of fields) {
      const val = asText(v[f.key]).trim();
      if (f.required && !val) return `${f.label} wajib diisi.`;
      if (val && f.type === "email" && !EMAIL_RE.test(val)) return `${f.label} tidak valid.`;
      if (val && f.type === "number" && !Number.isFinite(Number(val))) return `${f.label} harus angka.`;
      const custom = f.validate?.(val, v);
      if (custom) return custom;
    }
    return null;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try { await onSubmit(v); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); setBusy(false); }
  }

  return createPortal(
    <div className={s.overlay} onClick={onClose}>
      <form className={s.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.modalHead}><h2>{title}</h2><button type="button" className={s.iconBtn} onClick={onClose} aria-label="Tutup">✕</button></div>
        {fields.map((f, i) => {
          const val = asText(v[f.key]);
          const ro = !isNew && f.readOnlyOnEdit;
          const label = <span>{f.label}{f.required ? " *" : ""}</span>;
          if (f.type === "chips") return (
            <div key={f.key} className={s.field}>{label}
              <div className={s.chips}>{(f.options ?? []).map((o) => (
                <button type="button" key={o.value} disabled={ro} className={val === o.value ? s.chipOn : ""} onClick={() => set(f.key, o.value)}>{o.label}</button>
              ))}</div>
              {f.hint && <small>{f.hint}</small>}
            </div>
          );
          return (
            <label key={f.key} className={s.field}>{label}
              {f.type === "textarea" ? <textarea className={s.input} rows={5} value={val} disabled={ro} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} autoFocus={i === 0} />
                : f.type === "select" ? (
                  <select className={s.input} value={val} disabled={ro} onChange={(e) => set(f.key, e.target.value)} autoFocus={i === 0}>
                    <option value="">— pilih —</option>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : <input className={s.input} type={f.type === "number" ? "number" : f.type ?? "text"} value={val} disabled={ro} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} autoFocus={i === 0} />}
              {f.hint && <small>{f.hint}</small>}
            </label>
          );
        })}
        {err && <div className={s.err} role="alert">{err}</div>}
        <div className={s.modalFoot}>
          <button type="button" className={s.ghost} onClick={onClose}>Batal</button>
          <button type="submit" className={s.primary} disabled={busy}>{busy ? "Menyimpan…" : isNew ? "Tambah" : "Simpan"}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function ConfirmModal({ text, onClose, onConfirm }: { text: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return createPortal(
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" style={{ width: "min(420px, 100%)" }}>
        <div className={s.modalHead}><h2>Hapus data?</h2><button type="button" className={s.iconBtn} onClick={onClose} aria-label="Tutup">✕</button></div>
        <p className={s.mute}>{text}</p>
        {err && <div className={s.err} role="alert">{err}</div>}
        <div className={s.modalFoot}>
          <button type="button" className={s.ghost} onClick={onClose}>Batal</button>
          <button type="button" className={s.danger} disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await onConfirm(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? "Menghapus…" : "Hapus"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── CrudList ── */
export interface CrudColumn<T> { label: string; render: (row: T) => ReactNode; width?: string }

export function CrudList<T extends Record<string, unknown>>({
  icon, title, desc, rows, rowKey, columns, fields, itemName, empty, canEdit = true,
  onCreate, onUpdate, onDelete, newDefaults, extraActions,
}: {
  icon?: string; title: string; desc?: ReactNode; rows: T[]; rowKey: (r: T) => string;
  columns: CrudColumn<T>[]; fields: FieldDef<T>[]; itemName: string; empty?: string; canEdit?: boolean;
  onCreate?: (v: Partial<T>) => Promise<void>; onUpdate?: (row: T, v: Partial<T>) => Promise<void>; onDelete?: (row: T) => Promise<void>;
  newDefaults?: Partial<T>; extraActions?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ row: T | null } | null>(null);
  const [del, setDel] = useState<T | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => Object.values(r).some((v) => asText(v).toLowerCase().includes(k)));
  }, [rows, q]);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };
  const hasActions = canEdit && (onUpdate || onDelete);

  return (
    <section className={s.card}>
      <header className={s.head}>
        <div className={s.headText}>
          <h3>{icon && <span aria-hidden="true">{icon}</span>}{title} <em>{rows.length}</em></h3>
          {desc && <p>{desc}</p>}
        </div>
        <div className={s.headActions}>
          {rows.length > 5 && <input className={`${s.input} ${s.search}`} placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Cari ${itemName}`} />}
          {extraActions}
          {canEdit && onCreate && <button type="button" className={s.primary} onClick={() => setEdit({ row: null })}>+ Tambah</button>}
        </div>
      </header>
      {msg && <div className={s.ok} role="status">{msg}</div>}
      {shown.length === 0 ? <p className={s.empty}>{rows.length ? "Tidak ada yang cocok." : empty ?? `Belum ada ${itemName}.`}</p> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>{columns.map((c) => <th key={c.label} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}{hasActions && <th className={s.actCol} aria-label="Aksi" />}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={rowKey(r)}>
                  {columns.map((c) => <td key={c.label}>{c.render(r)}</td>)}
                  {hasActions && (
                    <td className={s.actCol}>
                      {onUpdate && <button type="button" className={s.small} onClick={() => setEdit({ row: r })}>Ubah</button>}
                      {onDelete && <button type="button" className={s.smallDanger} onClick={() => setDel(r)}>Hapus</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <FormModal<T>
          title={edit.row ? `Ubah ${itemName}` : `Tambah ${itemName}`} fields={fields} isNew={!edit.row}
          initial={edit.row ?? newDefaults ?? {}}
          onClose={() => setEdit(null)}
          onSubmit={async (v) => {
            if (edit.row) await onUpdate?.(edit.row, v); else await onCreate?.(v);
            setEdit(null); flash(edit.row ? "✓ Perubahan tersimpan." : `✓ ${itemName[0].toUpperCase()}${itemName.slice(1)} ditambahkan.`);
          }}
        />
      )}
      {del && <ConfirmModal text={`Hapus ${itemName} ini? Tindakan ini tidak bisa dibatalkan.`} onClose={() => setDel(null)} onConfirm={async () => { await onDelete?.(del); setDel(null); flash("✓ Dihapus."); }} />}
    </section>
  );
}

/* ── SettingsGroup ── */
export interface SettingItem<T> extends FieldDef<T> { display?: (value: unknown) => ReactNode }

export function SettingsGroup<T extends Record<string, unknown>>({ icon, title, desc, values, items, canEdit = true, onSave }: {
  icon?: string; title: string; desc?: ReactNode; values: T; items: SettingItem<T>[]; canEdit?: boolean;
  /** simpan satu nilai; patch berisi field yang diubah */
  onSave: (patch: Partial<T>) => Promise<void>;
}) {
  const [edit, setEdit] = useState<SettingItem<T> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className={s.card}>
      <header className={s.head}><div className={s.headText}><h3>{icon && <span aria-hidden="true">{icon}</span>}{title}</h3>{desc && <p>{desc}</p>}</div></header>
      {msg && <div className={s.ok} role="status">{msg}</div>}
      <ul className={s.items}>
        {items.map((it) => {
          const raw = values[it.key];
          const shown = it.display ? it.display(raw) : it.options?.find((o) => o.value === asText(raw))?.label ?? (asText(raw) || "—");
          return (
            <li key={it.key}>
              <div className={s.itemText}><b>{it.label}</b>{it.hint && <small>{it.hint}</small>}</div>
              <div className={`${s.itemValue} ${it.type === "textarea" ? s.itemValueLong : ""}`}>{shown}</div>
              {canEdit && <button type="button" className={s.small} onClick={() => setEdit(it)}>Ubah</button>}
            </li>
          );
        })}
      </ul>
      {edit && (
        <FormModal<T>
          title={`Ubah ${edit.label.toLowerCase()}`} fields={[edit]} isNew={false}
          initial={{ [edit.key]: asText(values[edit.key]) } as Partial<T>}
          onClose={() => setEdit(null)}
          onSubmit={async (v) => { await onSave(v); setEdit(null); setMsg("✓ Tersimpan."); setTimeout(() => setMsg(null), 2500); }}
        />
      )}
    </section>
  );
}

export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className={s.page}>{children}</div>;
}
