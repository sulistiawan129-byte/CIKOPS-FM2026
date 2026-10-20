"use client";

import { useId, useMemo } from "react";
import type { Employee } from "@/lib/types";
import type { Contact } from "@/lib/receptionist/model";
import { exportGenericExcel, exportGenericPdf, type ReportColumn } from "@/lib/reportEngine";
import r from "./receptionist.module.css";

/** Direktori nama: buku alamat (punya email) + master karyawan (punya departemen). */
export interface Directory { contacts: Contact[]; employees: Employee[] }

export function lookupPerson(dir: Directory, name: string): { email: string; department: string } | null {
  const k = name.trim().toLowerCase();
  if (!k) return null;
  const c = dir.contacts.find((x) => x.name.trim().toLowerCase() === k);
  const e = dir.employees.find((x) => x.nama.trim().toLowerCase() === k);
  if (!c && !e) return null;
  return { email: c?.email ?? "", department: c?.department || e?.departement || "" };
}

/** Input nama dengan saran dari buku alamat & master karyawan. Saat nama cocok,
 *  `onPick` dipanggil dengan email/departemen yang diingat sistem. */
export function NameInput({ dir, value, onChange, onPick, placeholder, required }: {
  dir: Directory; value: string; onChange: (v: string) => void; onPick?: (p: { email: string; department: string }) => void; placeholder?: string; required?: boolean;
}) {
  const id = useId();
  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; hint: string }[] = [];
    for (const c of dir.contacts) { const k = c.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ name: c.name, hint: c.email }); } }
    for (const e of dir.employees) { const k = e.nama.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ name: e.nama, hint: e.departement ?? "" }); } }
    return out;
  }, [dir]);
  return (
    <>
      <input
        className={r.input} list={id} value={value} placeholder={placeholder} required={required} autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          const hit = lookupPerson(dir, e.target.value);
          if (hit && onPick) onPick(hit);
        }}
      />
      <datalist id={id}>{names.slice(0, 400).map((n) => <option key={n.name} value={n.name}>{n.hint}</option>)}</datalist>
    </>
  );
}

/** Tombol ekspor Excel + PDF untuk sebuah tabel. */
export function ExportButtons<T>({ rows, columns, title, filename, period }: { rows: T[]; columns: ReportColumn<T>[]; title: string; filename: string; period?: string }) {
  const opts = { rows, columns, lang: "id" as const, titleId: title, filename, periodLabel: period };
  return (
    <span className={r.row} style={{ gap: 6 }}>
      <button type="button" className={r.ghost} disabled={!rows.length} onClick={() => exportGenericExcel(opts).catch((e) => alert(String(e)))}>Excel</button>
      <button type="button" className={r.ghost} disabled={!rows.length} onClick={() => exportGenericPdf(opts).catch((e) => alert(String(e)))}>PDF</button>
    </span>
  );
}

export const col = <T,>(key: string, label: string, get: (row: T) => string | number, align?: "left" | "right" | "center"): ReportColumn<T> =>
  ({ key, labelId: label, labelEn: label, get, align });
