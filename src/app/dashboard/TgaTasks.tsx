"use client";

/* Papan tugas TGA: admin menugaskan teknisi (atau ke semua TGA — siapa cepat),
   memantau alur Baru → Diterima/Proses → Selesai, mengalihkan, dan membatalkan.
   Permintaan karyawan dari /request masuk ke kolom "Belum diambil". */

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  TGA_CATEGORIES, tgaAdminAssign, tgaAdminCancel, tgaAdminUsers, tgaAllActivities, tgaCategory, tgaStatusLabel,
  type TgaActivity, type TgaUserRow,
} from "@/lib/tga/api";
import { notifyTgaTask } from "@/lib/push";
import a from "./atk.module.css";
import b from "./tgatasks.module.css";

type Lang = "id" | "en";
interface Emp { id: string; nama: string; departement: string | null }
interface Draft {
  id: string | null; userId: string; kategori: string; activity: string; lokasi: string;
  requestorId: string; requestBy: string; departemen: string; phone: string; prioritas: "normal" | "urgent"; catatan: string;
}

const ago = (iso: string | null | undefined, lang: Lang) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return lang === "en" ? "just now" : "baru saja";
  if (m < 60) return lang === "en" ? `${m} min ago` : `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "en" ? `${h} h ago` : `${h} jam lalu`;
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short" });
};

export default function TgaTasks({ lang, onChanged }: { lang: Lang; onChanged?: () => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [rows, setRows] = useState<TgaActivity[] | null>(null);
  const [users, setUsers] = useState<TgaUserRow[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await tgaAllActivities();
      setRows(all.filter((x) => (x.sumber ?? "mandiri") !== "mandiri" && x.status !== "batal"));
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => {
    load();
    tgaAdminUsers().then((u) => setUsers(u.filter((x) => x.aktif))).catch(() => {});
    supabase.from("employees").select("id, nama, departement").order("nama").limit(3000)
      .then(({ data }) => setEmps(((data ?? []) as Emp[]).filter((e) => (e as unknown as { aktif?: boolean }).aktif !== false)));
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const cols = useMemo(() => {
    const r = rows ?? [];
    return [
      { id: "pool", title: L("Belum diambil", "Unclaimed"), hint: L("Siapa cepat · permintaan karyawan", "First come · employee requests"), tone: "orange", items: r.filter((x) => x.status === "baru" && x.pool) },
      { id: "wait", title: L("Menunggu diterima", "Awaiting acceptance"), hint: L("Sudah ditugaskan", "Assigned"), tone: "red", items: r.filter((x) => x.status === "baru" && !x.pool) },
      { id: "work", title: L("Dikerjakan", "In progress"), hint: L("Proses · pending · butuh part", "Working · pending · needs part"), tone: "blue", items: r.filter((x) => ["proses", "pending", "butuh_part"].includes(x.status)) },
      { id: "done", title: L("Selesai hari ini", "Done today"), hint: L("Ditutup teknisi", "Closed by technician"), tone: "green", items: r.filter((x) => x.status === "selesai" && (x.selesai_at ?? "").slice(0, 10) === today) },
    ];
  }, [rows, lang, today]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setEdit({ id: null, userId: "", kategori: "", activity: "", lokasi: "", requestorId: "", requestBy: "", departemen: "", phone: "", prioritas: "normal", catatan: "" });
  }
  function openEdit(t: TgaActivity) {
    setEdit({
      id: t.id, userId: t.pool ? "" : (users.find((u) => u.nama === t.nama_tga)?.id ?? ""), kategori: t.kategori, activity: t.activity, lokasi: t.lokasi,
      requestorId: t.requestor_id ?? "", requestBy: t.request_by, departemen: t.departemen, phone: t.request_phone ?? "",
      prioritas: t.prioritas, catatan: t.catatan,
    });
  }
  async function cancel(t: TgaActivity) {
    const reason = prompt(L(`Batalkan ${t.ref_no}? Tulis alasan (opsional):`, `Cancel ${t.ref_no}? Reason (optional):`));
    if (reason === null) return;
    try { await tgaAdminCancel(t.id, reason); setMsg(L(`${t.ref_no} dibatalkan.`, `${t.ref_no} cancelled.`)); load(); onChanged?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <section className={a.card}>
      <div className={a.cardHead}>
        <div>
          <h2>{L("Papan tugas TGA", "TGA task board")}</h2>
          <p>{L("Tugaskan teknisi — HP teknisi berdering, teknisi menerima, lalu menandai selesai", "Assign technicians — their phone rings, they accept, then mark done")}</p>
        </div>
        <button type="button" className={a.primary} onClick={openNew}>＋ {L("Tugaskan TGA", "Assign TGA")}</button>
      </div>
      {err && <div className={a.msgErr}>{err}</div>}
      {msg && <div className={a.msgOk}>{msg}</div>}

      {rows === null ? <p className={a.empty}>{L("Memuat…", "Loading…")}</p> : (
        <div className={b.board}>
          {cols.map((c) => (
            <div key={c.id} className={`${b.col} ${b["tone_" + c.tone]}`}>
              <div className={b.colHead}><b>{c.title}</b><span>{c.items.length}</span></div>
              <small className={b.colHint}>{c.hint}</small>
              <div className={b.cards}>
                {c.items.length === 0 ? <p className={b.none}>—</p> : c.items.map((t) => {
                  const cat = tgaCategory(t.kategori);
                  return (
                    <article key={t.id} className={`${b.card} ${t.prioritas === "urgent" ? b.urgent : ""}`}>
                      <div className={b.cardTop}>
                        <span className={b.ref}>{cat.icon} {t.ref_no}</span>
                        {t.prioritas === "urgent" && <span className={a.tagPending}>URGENT</span>}
                      </div>
                      <b className={b.title}>{t.activity}</b>
                      <div className={b.meta}>
                        {t.lokasi && <span>📍 {t.lokasi}</span>}
                        {t.request_by && <span>👤 {t.request_by}{t.departemen ? ` · ${t.departemen}` : ""}</span>}
                      </div>
                      <div className={b.foot}>
                        <span className={b.who}>
                          {t.pool ? <em>{L("Belum ada teknisi", "No technician yet")}</em> : <>🧰 <b>{t.nama_tga}</b></>}
                          <small>{c.id === "done" ? `✓ ${ago(t.selesai_at, lang)}` : c.id === "work" ? `${tgaStatusLabel(t.status)} · ${ago(t.accepted_at, lang)}` : ago(t.assigned_at ?? t.created_at, lang)}</small>
                        </span>
                        {c.id !== "done" && (
                          <span className={b.actions}>
                            <button type="button" className={a.smallBtn} onClick={() => openEdit(t)}>{c.id === "work" ? L("Ubah", "Edit") : L("Tugaskan / alihkan", "Assign / move")}</button>
                            <button type="button" className={a.iconBtn} onClick={() => cancel(t)} aria-label={L("Batalkan", "Cancel")} title={L("Batalkan", "Cancel")}>✕</button>
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <AssignModal lang={lang} initial={edit} users={users} emps={emps} onClose={() => setEdit(null)}
          onSaved={(r, notify) => {
            setEdit(null);
            setMsg(notify ? L(`${r.ref_no} dikirim ke ${r.pool ? "semua TGA" : r.nama_tga} — HP teknisi berdering.`, `${r.ref_no} sent to ${r.pool ? "all TGA" : r.nama_tga}.`) : L(`${r.ref_no} diperbarui.`, `${r.ref_no} updated.`));
            if (notify) notifyTgaTask(r.id);
            load(); onChanged?.();
          }} />
      )}
    </section>
  );
}

function AssignModal({ lang, initial, users, emps, onClose, onSaved }: {
  lang: Lang; initial: Draft; users: TgaUserRow[]; emps: Emp[]; onClose: () => void; onSaved: (r: TgaActivity, notify: boolean) => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const cat = TGA_CATEGORIES.find((c) => c.id === d.kategori);

  function pickRequestor(name: string) {
    const e = emps.find((x) => x.nama.toLowerCase() === name.trim().toLowerCase());
    setD((x) => ({ ...x, requestBy: name, requestorId: e?.id ?? "", departemen: e ? (e.departement ?? x.departemen) : x.departemen }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.activity.trim()) { setErr(L("Isi pekerjaan yang harus dikerjakan.", "Describe the job.")); return; }
    setBusy(true); setErr(null);
    try {
      const r = await tgaAdminAssign(d.id, d.userId || null, {
        kategori: d.kategori || "Lainnya", activity: d.activity, lokasi: d.lokasi, requestor_id: d.requestorId || null,
        request_by: d.requestBy, departemen: d.departemen, request_phone: d.phone, prioritas: d.prioritas, catatan: d.catatan,
      });
      // Notifikasi dikirim untuk tugas baru dan saat dialihkan (status kembali "baru")
      onSaved(r, r.status === "baru");
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className={a.overlay} onClick={onClose}>
      <form className={a.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tga-assign-title" style={{ width: "min(620px, 100%)" }}>
        <div className={a.modalHead}>
          <h2 id="tga-assign-title">{d.id ? L("Ubah / alihkan tugas", "Edit / reassign task") : L("Tugaskan TGA", "Assign TGA")}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>

        <div className={a.field}>
          <span>{L("Teknisi", "Technician")}</span>
          <div className={b.techPick}>
            <button type="button" className={!d.userId ? b.techOn : ""} onClick={() => set("userId", "")}>
              <i>👥</i><b>{L("Semua TGA", "All TGA")}</b><small>{L("siapa cepat", "first come")}</small>
            </button>
            {users.map((u) => (
              <button key={u.id} type="button" className={d.userId === u.id ? b.techOn : ""} onClick={() => set("userId", u.id)}>
                <i>🧰</i><b>{u.nama}</b><small>{u.month_count} {L("bln ini", "this mo.")}</small>
              </button>
            ))}
          </div>
          {users.length === 0 && <small className={a.mute}>{L("Belum ada akun TGA — buat di kartu Akun aplikasi TGA di bawah.", "No TGA accounts yet — create them below.")}</small>}
        </div>

        <div className={a.field}>
          <span>{L("Jenis pekerjaan", "Category")}</span>
          <div className={b.catPick}>
            {TGA_CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={d.kategori === c.id ? b.catOn : ""} onClick={() => set("kategori", d.kategori === c.id ? "" : c.id)}>{c.icon} {c.id}</button>
            ))}
          </div>
        </div>

        <label className={a.field}><span>{L("Pekerjaan", "Job")} *</span>
          <textarea className={a.input} style={{ height: 76, padding: "10px 12px", resize: "vertical" }} value={d.activity} onChange={(e) => set("activity", e.target.value)} placeholder={L("mis. AC ruang meeting lt. 2 tidak dingin", "e.g. meeting room AC not cooling")} required />
          {cat && <span className={b.quick}>{cat.quick.map((q) => <button key={q} type="button" onClick={() => set("activity", q)}>{q}</button>)}</span>}
        </label>

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
            <input className={a.input} list="tga-emp-list" value={d.requestBy} onChange={(e) => pickRequestor(e.target.value)} placeholder={L("Ketik nama…", "Type a name…")} />
            <datalist id="tga-emp-list">{emps.map((e) => <option key={e.id} value={e.nama}>{e.departement ?? ""}</option>)}</datalist>
            {d.requestBy && <small className={d.requestorId ? a.tGreen : a.mute}>{d.requestorId ? L("✓ terhubung ke data karyawan", "✓ linked to employee") : L("di luar data karyawan", "not in employee data")}</small>}
          </label>
          <label className={a.field}><span>{L("Departemen", "Department")}</span><input className={a.input} value={d.departemen} onChange={(e) => set("departemen", e.target.value)} /></label>
        </div>
        <div className={a.fields2}>
          <label className={a.field}><span>{L("No. HP requestor", "Requestor phone")}</span><input className={a.input} inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className={a.field}><span>{L("Catatan untuk teknisi", "Note for technician")}</span><input className={a.input} value={d.catatan} onChange={(e) => set("catatan", e.target.value)} /></label>
        </div>

        {err && <div className={a.msgErr}>{err}</div>}
        <div className={a.modalFoot}>
          <button type="button" className={a.ghostBtn} onClick={onClose}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={a.primary} disabled={busy}>{busy ? L("Mengirim…", "Sending…") : d.id ? L("Simpan", "Save") : L("🔔 Kirim tugas", "🔔 Send task")}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
