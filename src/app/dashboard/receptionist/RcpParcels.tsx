"use client";

/* Barang & Surat — input sekali (nomor IN-/OUT- otomatis), serah terima (nama pengambil + jam
   otomatis + email), riwayat, ekspor, dan lembar serah terima kurir harian (cetak bila perlu). */

import { useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { createParcel, deleteParcel, emailParcel, handoverParcel, unhandoverParcel, updateParcel } from "@/lib/receptionist/api";
import { itemTypeLabel, ITEM_TYPES, fmtDate, fmtDateTime, fmtTime, todayISO, dayOf, monthOf, receiptFromParcel, type Parcel, type ParcelDirection } from "@/lib/receptionist/model";
import { ExportButtons, NameInput, col, lookupPerson, type Directory } from "./shared";
import { ProofModal } from "./ProofCard";
import r from "./receptionist.module.css";

import { L } from "@/lib/i18n";
type Sub = "waiting" | "today" | "history";

export default function RcpParcels({ parcels, dir, reload }: { parcels: Parcel[]; dir: Directory; reload: () => Promise<void> }) {
  const [sub, setSub] = useState<Sub>("waiting");
  const [proof, setProof] = useState<Parcel | null>(null);
  const who = proof ? (proof.direction === "in" ? proof.recipient : proof.sender) : "";
  const waiting = parcels.filter((p) => p.status === "waiting");
  const today = todayISO();
  const todayList = parcels.filter((p) => dayOf(p.createdAt) === today || dayOf(p.handedAt) === today);
  return (
    <div className={r.split}>
      <NewParcel dir={dir} reload={reload} onProof={setProof} />
      <section className={r.card}>
        <div className={r.cardHead}>
          <div className={r.seg} role="group" aria-label="Daftar">
            {([["waiting", `Menunggu (${waiting.length})`], ["today", L("Hari ini", "Today")], ["history", L("Riwayat", "History")]] as [Sub, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>
            ))}
          </div>
          <CourierSheet parcels={parcels} />
        </div>
        {sub === "waiting" && <WaitingList list={waiting} reload={reload} onProof={setProof} />}
        {sub === "today" && <SimpleList list={todayList} onProof={setProof} reload={reload} />}
        {sub === "history" && <HistoryList parcels={parcels} onProof={setProof} reload={reload} />}
      </section>
      {proof && (
        <ProofModal data={receiptFromParcel(proof)} token={proof.shareToken || undefined} email={proof.email} phone={lookupPerson(dir, who)?.phone}
          onEmail={proof.email ? () => emailParcel(proof.status === "handed" ? "parcel-handed" : "parcel-arrived", proof) : undefined} onClose={() => setProof(null)} />
      )}
    </div>
  );
}

function NewParcel({ dir, reload, onProof }: { dir: Directory; reload: () => Promise<void>; onProof: (p: Parcel) => void }) {
  const blank = { itemType: ITEM_TYPES[0] as string, description: "", sender: "", recipient: "", department: "", email: "", courier: "", qty: 1 };
  const [direction, setDirection] = useState<ParcelDirection>("in");
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: Exclude<keyof typeof blank, "qty">, v: string) => setF((x) => ({ ...x, [k]: v }));
  const pickPerson = (p: { email: string; department: string }) => setF((x) => ({ ...x, email: p.email || x.email, department: p.department || x.department }));
  const isIn = direction === "in";
  const canSave = (isIn ? f.recipient.trim() : f.sender.trim()) && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true); setMsg(null);
    try {
      const p = await createParcel({ direction, ...f });
      let note = "";
      if (p.email) {
        try { await emailParcel("parcel-arrived", p); note = ` · email terkirim ke ${p.email}`; }
        catch (e) { note = ` · ⚠ ${e instanceof Error ? e.message : String(e)}`; }
      }
      setMsg({ ok: true, text: `✓ Tercatat ${p.receiptNo}${note}` });
      setF(blank);
      await reload();
      onProof(p);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  }

  return (
    <section className={r.card}>
      <div className={r.cardHead}><div><h2>{L("Catat barang / surat", "Log item / mail")}</h2><p>{L("Nomor tanda terima dibuat otomatis", "The receipt number is generated automatically")}</p></div></div>
      <div className={r.chips}>
        <button type="button" className={r.chip} aria-pressed={isIn} onClick={() => setDirection("in")}>{L("⬇ Masuk (untuk karyawan)", "⬇ Incoming (for an employee)")}</button>
        <button type="button" className={r.chip} aria-pressed={!isIn} onClick={() => setDirection("out")}>{L("⬆ Keluar (dikirim karyawan)", "⬆ Outgoing (sent by an employee)")}</button>
      </div>
      <div className={r.form}>
        <div className={`${r.field} ${r.full}`}><span>{L("Jenis", "Type")}</span>
          <div className={r.chips}>{ITEM_TYPES.map((t) => <button key={t} type="button" className={r.chip} aria-pressed={f.itemType === t} onClick={() => set("itemType", t)}>{itemTypeLabel(t)}</button>)}</div>
        </div>
        {isIn ? (
          <>
            <label className={r.field}><span>Untuk (karyawan) *</span><NameInput dir={dir} value={f.recipient} onChange={(v) => set("recipient", v)} onPick={pickPerson} placeholder="Ketik nama — email terisi sendiri" /></label>
            <label className={r.field}><span>{L("Dari", "From")}</span><input className={r.input} value={f.sender} onChange={(e) => set("sender", e.target.value)} placeholder={L("Pengirim / ekspedisi", "Sender / courier")} /></label>
          </>
        ) : (
          <>
            <label className={r.field}><span>Dari (karyawan) *</span><NameInput dir={dir} value={f.sender} onChange={(v) => set("sender", v)} onPick={pickPerson} placeholder="Ketik nama — email terisi sendiri" /></label>
            <label className={r.field}><span>{L("Untuk / tujuan", "To / destination")}</span><input className={r.input} value={f.recipient} onChange={(e) => set("recipient", e.target.value)} placeholder={L("Nama & alamat tujuan", "Recipient name & address")} /></label>
          </>
        )}
        <label className={r.field}><span>{L("Jumlah", "Quantity")} *</span><input className={r.input} type="number" min={1} max={9999} step={1} inputMode="numeric" value={f.qty} onChange={(e) => setF((x) => ({ ...x, qty: Math.min(9999, Math.max(1, Math.round(Number(e.target.value)) || 1)) }))} aria-label={L("Jumlah barang / surat", "Number of items / letters")} /></label>
        <label className={r.field}><span>{L("Departemen", "Department")}</span><input className={r.input} value={f.department} onChange={(e) => set("department", e.target.value)} /></label>
        <label className={r.field}><span>Email <em>{L("(opsional — untuk notifikasi)", "(optional — for notifications)")}</em></span><input className={r.input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className={r.field}><span>{L("Keterangan", "Description")} <em>(opsional)</em></span><input className={r.input} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="mis. 1 dus, amplop coklat" /></label>
        <label className={r.field}><span>Kurir / ekspedisi <em>(opsional)</em></span><input className={r.input} value={f.courier} onChange={(e) => set("courier", e.target.value)} placeholder="JNE, Gojek, internal…" /></label>
      </div>
      {msg && <div className={msg.ok ? r.ok : r.err}>{msg.text}</div>}
      <div className={r.formFoot}>
        <span className={r.hint}>{L("Email yang diisi diingat untuk nama ini — lain kali cukup ketik namanya.", "The email entered is remembered for this name — next time just type the name.")}</span>
        <button type="button" className={r.btn} disabled={!canSave} onClick={submit}>{busy ? L("Menyimpan…", "Saving…") : isIn ? L("Simpan barang masuk", "Save incoming item") : L("Simpan barang keluar", "Save outgoing item")}</button>
      </div>
    </section>
  );
}

/** Penanda "diubah" di daftar (siapa & kapan) — supaya koreksi bisa ditelusuri. */
const editedMark = (p: Parcel) => (p.updatedAt ? <span className={r.mute}>{L("✎ diubah", "✎ edited")} {p.updatedBy ? `${L("oleh", "by")} ${p.updatedBy} ` : ""}· {fmtDateTime(p.updatedAt)}</span> : null);

/** Konfirmasi hapus: sebut nomor, penerima, jumlah, dan status supaya tidak salah hapus. */
function confirmDelete(p: Parcel): boolean {
  const who = p.direction === "in" ? p.recipient : p.sender;
  const extra = p.status === "handed" ? L("\n\nBarang ini SUDAH diserahkan — riwayat serah terimanya ikut terhapus. Bila hanya salah catat pengambil, pakai Ubah / Batalkan serah terima.", "\n\nThis item was ALREADY handed over — its handover record is deleted too. If only the collector was wrong, use Edit / Undo handover.") : "";
  return confirm(L(`Hapus ${p.receiptNo} (${who || "–"}${p.qty > 1 ? `, ×${p.qty}` : ""})?\nHanya untuk data yang salah catat. Tindakan ini tidak bisa dibatalkan.${extra}`, `Delete ${p.receiptNo} (${who || "–"}${p.qty > 1 ? `, ×${p.qty}` : ""})?\nOnly for entries made by mistake. This cannot be undone.${extra}`));
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};

/** Koreksi isian barang. Arah (masuk/keluar) & nomor bukti tetap; bila arah salah → hapus lalu catat ulang. */
function EditParcel({ p, onClose, onSaved }: { p: Parcel; onClose: () => void; onSaved: () => Promise<void> }) {
  const isIn = p.direction === "in";
  const [f, setF] = useState({ itemType: p.itemType, description: p.description, sender: p.sender, recipient: p.recipient, department: p.department, email: p.email, courier: p.courier, qty: p.qty, handedTo: p.handedTo, handedAt: toLocalInput(p.handedAt) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const handed = p.status === "handed";
  const canSave = (f.sender.trim() || f.recipient.trim()) && f.qty >= 1 && (!handed || f.handedTo.trim()) && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      await updateParcel(p.id, { ...f, handedTo: handed ? f.handedTo : undefined, handedAt: handed && f.handedAt ? new Date(f.handedAt).toISOString() : null });
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  async function undo() {
    if (!confirm(L(`Batalkan serah terima ${p.receiptNo}? Barang kembali berstatus Menunggu.`, `Undo the handover of ${p.receiptNo}? The item goes back to Waiting.`))) return;
    setBusy(true); setErr("");
    try { await unhandoverParcel(p.id); await onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <ModalPortal onOverlayClick={busy ? undefined : onClose} maxWidth={600}>
      <form className={r.modal} onSubmit={(e) => { e.preventDefault(); void save(); }} role="dialog" aria-modal="true" aria-labelledby="rcp-parcel-edit">
        <div className={r.modalHead}>
          <div><h2 id="rcp-parcel-edit">{L("Ubah barang / surat", "Edit item / mail")} · <span className={r.mono}>{p.receiptNo}</span></h2>
            <p>{isIn ? L("⬇ Masuk", "⬇ Incoming") : L("⬆ Keluar", "⬆ Outgoing")} · {L("arah & nomor bukti tidak bisa diubah — bila arah salah, hapus lalu catat ulang", "direction & receipt number cannot change — if the direction is wrong, delete and log again")}</p></div>
          <button type="button" className={r.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <div className={r.form}>
          <div className={`${r.field} ${r.full}`}><span>{L("Jenis", "Type")}</span>
            <div className={r.chips}>{ITEM_TYPES.map((t) => <button key={t} type="button" className={r.chip} aria-pressed={f.itemType === t} onClick={() => set("itemType", t)}>{itemTypeLabel(t)}</button>)}</div>
          </div>
          <label className={r.field}><span>{isIn ? L("Untuk (karyawan) *", "For (employee) *") : L("Untuk / tujuan", "To / destination")}</span><input className={r.input} value={f.recipient} onChange={(e) => set("recipient", e.target.value)} /></label>
          <label className={r.field}><span>{isIn ? L("Dari", "From") : L("Dari (karyawan) *", "From (employee) *")}</span><input className={r.input} value={f.sender} onChange={(e) => set("sender", e.target.value)} /></label>
          <label className={r.field}><span>{L("Jumlah", "Quantity")} *</span><input className={r.input} type="number" min={1} max={9999} step={1} inputMode="numeric" value={f.qty} onChange={(e) => set("qty", Math.min(9999, Math.max(1, Math.round(Number(e.target.value)) || 1)))} /></label>
          <label className={r.field}><span>{L("Departemen", "Department")}</span><input className={r.input} value={f.department} onChange={(e) => set("department", e.target.value)} /></label>
          <label className={r.field}><span>Email</span><input className={r.input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label className={r.field}><span>{L("Kurir / ekspedisi", "Courier")}</span><input className={r.input} value={f.courier} onChange={(e) => set("courier", e.target.value)} /></label>
          <label className={`${r.field} ${r.full}`}><span>{L("Keterangan", "Description")}</span><input className={r.input} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
          {handed && (
            <>
              <div className={r.section}>{L("Serah terima", "Handover")}</div>
              <label className={r.field}><span>{L("Diambil oleh *", "Collected by *")}</span><input className={r.input} value={f.handedTo} onChange={(e) => set("handedTo", e.target.value)} /></label>
              <label className={r.field}><span>{L("Waktu serah terima", "Handover time")}</span><input className={r.input} type="datetime-local" value={f.handedAt} max={toLocalInput(new Date().toISOString())} onChange={(e) => set("handedAt", e.target.value)} /></label>
            </>
          )}
        </div>
        {p.updatedAt && <p className={r.hint} style={{ padding: "0 20px" }}>{L("Terakhir diubah", "Last edited")}: {p.updatedBy || "–"} · {fmtDateTime(p.updatedAt)}</p>}
        {err && <div className={r.err} style={{ margin: "0 20px" }}>{err}</div>}
        <div className={r.modalFoot}>
          {handed && <button type="button" className={`${r.link} ${r.danger}`} onClick={undo} disabled={busy}>{L("↩ Batalkan serah terima", "↩ Undo handover")}</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className={r.ghost} onClick={onClose} disabled={busy}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={r.btn} disabled={!canSave}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan perubahan", "Save changes")}</button>
        </div>
      </form>
    </ModalPortal>
  );
}

function WaitingList({ list, reload, onProof }: { list: Parcel[]; reload: () => Promise<void>; onProof: (p: Parcel) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Parcel | null>(null);
  const shown = list.filter((p) => !q || [p.receiptNo, p.sender, p.recipient, p.department, p.description, p.itemType].join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  async function hand(p: Parcel) {
    const who = (names[p.id] ?? (p.direction === "in" ? p.recipient : p.courier)).trim();
    if (!who) { alert(L("Isi nama pengambil.", "Enter the name of the person collecting.")); return; }
    setBusy(p.id);
    try {
      const done = await handoverParcel(p.id, who);
      if (done.email) { try { await emailParcel("parcel-handed", done); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }
      await reload();
      onProof(done);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function del(p: Parcel) {
    if (!confirmDelete(p)) return;
    try { await deleteParcel(p.id); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  const ageDays = (p: Parcel) => Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000);
  return (
    <>
      <input className={r.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Cari nomor, nama, departemen…", "Search number, name, department…")} />
      {shown.length === 0 ? <p className={r.empty}>{L("Tidak ada barang yang menunggu.", "No items waiting.")}</p> : (
        <div className={r.list}>
          {shown.map((p) => (
            <div key={p.id} className={r.item}>
              <div>
                <b className={p.direction === "in" ? r.dirIn : r.dirOut}>{p.direction === "in" ? "⬇" : "⬆"} {p.direction === "in" ? p.recipient : p.sender}</b>
                {ageDays(p) >= 2 && <span className={`${r.pill} ${r.pOrange}`} style={{ marginLeft: 8 }}>{ageDays(p)} hari</span>}
                <div className={r.meta}>
                  <span className={r.mono}>{p.receiptNo}</span><span>{itemTypeLabel(p.itemType)}{p.qty > 1 ? ` ×${p.qty}` : ""}{p.description ? ` · ${p.description}` : ""}</span>
                  <span>{p.direction === "in" ? `${L("dari", "from")} ${p.sender || "–"}` : `${L("ke", "to")} ${p.recipient || "–"}`}</span>
                  {p.department && <span>{p.department}</span>}<span className={r.mute}>{fmtDateTime(p.createdAt)}</span>
                  {p.email && <span className={r.mute}>{p.notifiedAt ? "✉ terkirim" : "✉ belum terkirim"}</span>}{editedMark(p)}
                </div>
              </div>
              <div className={r.itemSide}>
                <input className={r.input} value={names[p.id] ?? (p.direction === "in" ? p.recipient : p.courier)} onChange={(e) => setNames((x) => ({ ...x, [p.id]: e.target.value }))} placeholder={p.direction === "in" ? L("Nama pengambil", "Collector name") : L("Nama kurir", "Courier name")} aria-label={L("Nama pengambil", "Collector name")} />
                <button type="button" className={`${r.btn} ${r.btnSm}`} disabled={busy === p.id} onClick={() => hand(p)}>{busy === p.id ? "…" : "Serahkan"}</button>
                <button type="button" className={r.proofBtn} onClick={() => onProof(p)} title={L("Bukti permintaan", "Request receipt")}>🧾</button>
                <button type="button" className={r.link} onClick={() => setEdit(p)}>{L("✎ Ubah", "✎ Edit")}</button>
                <button type="button" className={`${r.link} ${r.danger}`} onClick={() => del(p)}>{L("Hapus", "Delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <EditParcel p={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </>
  );
}

function SimpleList({ list, onProof, reload }: { list: Parcel[]; onProof: (p: Parcel) => void; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<Parcel | null>(null);
  if (!list.length) return <p className={r.empty}>{L("Belum ada aktivitas hari ini.", "No activity today.")}</p>;
  return (
    <div className={r.list}>
      {list.map((p) => (
        <div key={p.id} className={r.item}>
          <div>
            <b className={p.direction === "in" ? r.dirIn : r.dirOut}>{p.direction === "in" ? "⬇" : "⬆"} {p.direction === "in" ? p.recipient : p.sender}</b>
            <div className={r.meta}><span className={r.mono}>{p.receiptNo}</span><span>{itemTypeLabel(p.itemType)}{p.qty > 1 ? ` ×${p.qty}` : ""}</span><span>{L("masuk", "logged")} {fmtTime(p.createdAt)}</span>{editedMark(p)}</div>
          </div>
          <div className={r.itemSide}>{p.status === "handed" ? <span className={`${r.pill} ${r.pGreen}`}>{p.handedTo} · {fmtTime(p.handedAt)}</span> : <span className={`${r.pill} ${r.pOrange}`}>{L("Menunggu", "Waiting")}</span>}
            <button type="button" className={r.proofBtn} onClick={() => onProof(p)}>🧾 {L("Bukti", "Receipt")}</button>
            <button type="button" className={r.link} onClick={() => setEdit(p)}>{L("✎ Ubah", "✎ Edit")}</button></div>
        </div>
      ))}
      {edit && <EditParcel p={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </div>
  );
}

const cols = () => [
  col<Parcel>("no", L("No. Tanda Terima", "Receipt No."), (p) => p.receiptNo), col<Parcel>("arah", L("Arah", "Direction"), (p) => (p.direction === "in" ? L("Masuk", "Incoming") : L("Keluar", "Outgoing"))),
  col<Parcel>("jenis", L("Jenis", "Type"), (p) => itemTypeLabel(p.itemType)), col<Parcel>("qty", L("Jumlah", "Qty"), (p) => String(p.qty)), col<Parcel>("ket", L("Keterangan", "Description"), (p) => p.description), col<Parcel>("dari", L("Dari", "From"), (p) => p.sender),
  col<Parcel>("untuk", L("Untuk", "To"), (p) => p.recipient), col<Parcel>("dept", L("Departemen", "Department"), (p) => p.department), col<Parcel>("masuk", L("Dicatat", "Logged"), (p) => fmtDateTime(p.createdAt)),
  col<Parcel>("ambil", L("Diambil oleh", "Collected by"), (p) => p.handedTo || "-"), col<Parcel>("jam", L("Waktu serah", "Handover time"), (p) => (p.handedAt ? fmtDateTime(p.handedAt) : "-")),
];

function HistoryList({ parcels, onProof, reload }: { parcels: Parcel[]; onProof: (p: Parcel) => void; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<Parcel | null>(null);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [dirF, setDirF] = useState<"all" | ParcelDirection>("all");
  const [q, setQ] = useState("");
  const list = parcels.filter((p) => monthOf(p.createdAt) === month && (dirF === "all" || p.direction === dirF) && (!q || [p.receiptNo, p.sender, p.recipient, p.department, p.handedTo].join(" ").toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className={r.row}>
        <input className={r.input} style={{ width: 150 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={L("Bulan", "Month")} />
        <div className={r.seg}>{([["all", L("Semua", "All")], ["in", L("Masuk", "Incoming")], ["out", L("Keluar", "Outgoing")]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={dirF === k} onClick={() => setDirF(k)}>{l}</button>)}</div>
        <input className={r.input} style={{ flex: "1 1 160px", width: "auto" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Cari…", "Search…")} />
        <ExportButtons rows={list} columns={cols()} title={L("Barang & Surat", "Items & Mail")} filename="Barang_Surat" period={month} />
      </div>
      <p className={r.hint}>Riwayat memuat 6 bulan terakhir.</p>
      {list.length === 0 ? <p className={r.empty}>{L("Tidak ada data.", "No data.")}</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>No.</th><th>{L("Jenis", "Type")}</th><th>{L("Dari → Untuk", "From → To")}</th><th>{L("Dicatat", "Logged")}</th><th>{L("Serah terima", "Handover")}</th><th /></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td className={`${r.mono} ${r.nowrap}`}>{p.receiptNo}</td>
                <td>{itemTypeLabel(p.itemType)}{p.qty > 1 ? ` ×${p.qty}` : ""}{p.description && <div className={r.mute}>{p.description}</div>}</td>
                <td>{p.sender || "–"} → <b>{p.recipient || "–"}</b>{p.department && <div className={r.mute}>{p.department}</div>}</td>
                <td className={r.nowrap}>{fmtDateTime(p.createdAt)}</td>
                <td>{p.status === "handed" ? <>{p.handedTo}<div className={r.mute}>{fmtDateTime(p.handedAt)}</div></> : <span className={`${r.pill} ${r.pOrange}`}>{L("Menunggu", "Waiting")}</span>}{editedMark(p) && <div className={r.mute}>{editedMark(p)}</div>}</td>
                <td className={`${r.num} ${r.nowrap}`}><button type="button" className={r.proofBtn} onClick={() => onProof(p)}>🧾 {L("Bukti", "Receipt")}</button>{" "}<button type="button" className={r.link} onClick={() => setEdit(p)}>{L("✎ Ubah", "✎ Edit")}</button>{" "}<button type="button" className={`${r.link} ${r.danger}`} onClick={async () => { if (!confirmDelete(p)) return; try { await deleteParcel(p.id); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }}>{L("Hapus", "Delete")}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <EditParcel p={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </>
  );
}

/** Lembar serah terima harian untuk kurir — hanya dicetak bila diperlukan. */
function CourierSheet({ parcels }: { parcels: Parcel[] }) {
  const [date, setDate] = useState(todayISO());
  const rows = useMemo(() => parcels.filter((p) => p.direction === "out" && (dayOf(p.createdAt) === date || dayOf(p.handedAt) === date)), [parcels, date]);
  async function print() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("LEMBAR SERAH TERIMA KURIR — BARANG & SURAT KELUAR", w / 2, 40, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`${L("Tanggal", "Date")}: ${fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`, w / 2, 58, { align: "center" });
    autoTable(doc, {
      startY: 74,
      head: [["No", L("No. Tanda Terima", "Receipt No."), L("Jenis", "Type"), L("Dari", "From"), L("Untuk / tujuan", "To / destination"), "Kurir", "Jam serah", "Paraf kurir"]],
      body: rows.map((p, i) => [String(i + 1), p.receiptNo, itemTypeLabel(p.itemType) + (p.description ? ` — ${p.description}` : ""), p.sender, p.recipient, p.handedTo || p.courier, p.handedAt ? fmtTime(p.handedAt) : "", ""]),
      styles: { fontSize: 9, cellPadding: 6, minCellHeight: 26 }, headStyles: { fillColor: [15, 40, 71] }, margin: { left: 30, right: 30 },
      columnStyles: { 7: { cellWidth: 90 } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y = ((doc as any).lastAutoTable?.finalY ?? 120) + 40;
    doc.text("Resepsionis,", 60, y); doc.text("Kurir,", w - 200, y);
    doc.text("(________________________)", 60, y + 60); doc.text("(________________________)", w - 200, y + 60);
    doc.save(`Serah_Terima_Kurir_${date}.pdf`);
  }
  return (
    <span className={r.row} style={{ gap: 6 }}>
      <input className={r.input} style={{ width: 150, minHeight: 36 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={L("Tanggal lembar kurir", "Courier sheet date")} />
      <button type="button" className={r.ghost} disabled={!rows.length} onClick={() => print().catch((e) => alert(String(e)))} title={L("Cetak lembar serah terima kurir (barang keluar)", "Print the courier handover sheet (outgoing items)")}>🖨 Lembar kurir ({rows.length})</button>
    </span>
  );
}
