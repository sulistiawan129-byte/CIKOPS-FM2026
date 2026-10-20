"use client";

/* Barang & Surat — input sekali (nomor IN-/OUT- otomatis), serah terima (nama pengambil + jam
   otomatis + email), riwayat, ekspor, dan lembar serah terima kurir harian (cetak bila perlu). */

import { useMemo, useState } from "react";
import { createParcel, deleteParcel, emailParcel, handoverParcel } from "@/lib/receptionist/api";
import { ITEM_TYPES, fmtDate, fmtDateTime, fmtTime, todayISO, dayOf, monthOf, receiptFromParcel, type Parcel, type ParcelDirection } from "@/lib/receptionist/model";
import { ExportButtons, NameInput, col, lookupPerson, type Directory } from "./shared";
import { ProofModal } from "./ProofCard";
import r from "./receptionist.module.css";

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
            {([["waiting", `Menunggu (${waiting.length})`], ["today", "Hari ini"], ["history", "Riwayat"]] as [Sub, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>
            ))}
          </div>
          <CourierSheet parcels={parcels} />
        </div>
        {sub === "waiting" && <WaitingList list={waiting} reload={reload} onProof={setProof} />}
        {sub === "today" && <SimpleList list={todayList} onProof={setProof} />}
        {sub === "history" && <HistoryList parcels={parcels} onProof={setProof} />}
      </section>
      {proof && (
        <ProofModal data={receiptFromParcel(proof)} token={proof.shareToken || undefined} email={proof.email} phone={lookupPerson(dir, who)?.phone}
          onEmail={proof.email ? () => emailParcel(proof.status === "handed" ? "parcel-handed" : "parcel-arrived", proof) : undefined} onClose={() => setProof(null)} />
      )}
    </div>
  );
}

function NewParcel({ dir, reload, onProof }: { dir: Directory; reload: () => Promise<void>; onProof: (p: Parcel) => void }) {
  const blank = { itemType: ITEM_TYPES[0] as string, description: "", sender: "", recipient: "", department: "", email: "", courier: "" };
  const [direction, setDirection] = useState<ParcelDirection>("in");
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
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
      <div className={r.cardHead}><div><h2>Catat barang / surat</h2><p>Nomor tanda terima dibuat otomatis</p></div></div>
      <div className={r.chips}>
        <button type="button" className={r.chip} aria-pressed={isIn} onClick={() => setDirection("in")}>⬇ Masuk (untuk karyawan)</button>
        <button type="button" className={r.chip} aria-pressed={!isIn} onClick={() => setDirection("out")}>⬆ Keluar (dikirim karyawan)</button>
      </div>
      <div className={r.form}>
        <div className={`${r.field} ${r.full}`}><span>Jenis</span>
          <div className={r.chips}>{ITEM_TYPES.map((t) => <button key={t} type="button" className={r.chip} aria-pressed={f.itemType === t} onClick={() => set("itemType", t)}>{t}</button>)}</div>
        </div>
        {isIn ? (
          <>
            <label className={r.field}><span>Untuk (karyawan) *</span><NameInput dir={dir} value={f.recipient} onChange={(v) => set("recipient", v)} onPick={pickPerson} placeholder="Ketik nama — email terisi sendiri" /></label>
            <label className={r.field}><span>Dari</span><input className={r.input} value={f.sender} onChange={(e) => set("sender", e.target.value)} placeholder="Pengirim / ekspedisi" /></label>
          </>
        ) : (
          <>
            <label className={r.field}><span>Dari (karyawan) *</span><NameInput dir={dir} value={f.sender} onChange={(v) => set("sender", v)} onPick={pickPerson} placeholder="Ketik nama — email terisi sendiri" /></label>
            <label className={r.field}><span>Untuk / tujuan</span><input className={r.input} value={f.recipient} onChange={(e) => set("recipient", e.target.value)} placeholder="Nama & alamat tujuan" /></label>
          </>
        )}
        <label className={r.field}><span>Departemen</span><input className={r.input} value={f.department} onChange={(e) => set("department", e.target.value)} /></label>
        <label className={r.field}><span>Email <em>(opsional — untuk notifikasi)</em></span><input className={r.input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className={r.field}><span>Keterangan <em>(opsional)</em></span><input className={r.input} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="mis. 1 dus, amplop coklat" /></label>
        <label className={r.field}><span>Kurir / ekspedisi <em>(opsional)</em></span><input className={r.input} value={f.courier} onChange={(e) => set("courier", e.target.value)} placeholder="JNE, Gojek, internal…" /></label>
      </div>
      {msg && <div className={msg.ok ? r.ok : r.err}>{msg.text}</div>}
      <div className={r.formFoot}>
        <span className={r.hint}>Email yang diisi diingat untuk nama ini — lain kali cukup ketik namanya.</span>
        <button type="button" className={r.btn} disabled={!canSave} onClick={submit}>{busy ? "Menyimpan…" : isIn ? "Simpan barang masuk" : "Simpan barang keluar"}</button>
      </div>
    </section>
  );
}

function WaitingList({ list, reload, onProof }: { list: Parcel[]; reload: () => Promise<void>; onProof: (p: Parcel) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = list.filter((p) => !q || [p.receiptNo, p.sender, p.recipient, p.department, p.description, p.itemType].join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  async function hand(p: Parcel) {
    const who = (names[p.id] ?? (p.direction === "in" ? p.recipient : p.courier)).trim();
    if (!who) { alert("Isi nama pengambil."); return; }
    setBusy(p.id);
    try {
      const done = await handoverParcel(p.id, who);
      if (done.email) { try { await emailParcel("parcel-handed", done); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }
      await reload();
      onProof(done);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function del(p: Parcel) {
    if (!confirm(`Hapus ${p.receiptNo}? (salah input)`)) return;
    try { await deleteParcel(p.id); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  const ageDays = (p: Parcel) => Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000);
  return (
    <>
      <input className={r.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor, nama, departemen…" />
      {shown.length === 0 ? <p className={r.empty}>Tidak ada barang yang menunggu.</p> : (
        <div className={r.list}>
          {shown.map((p) => (
            <div key={p.id} className={r.item}>
              <div>
                <b className={p.direction === "in" ? r.dirIn : r.dirOut}>{p.direction === "in" ? "⬇" : "⬆"} {p.direction === "in" ? p.recipient : p.sender}</b>
                {ageDays(p) >= 2 && <span className={`${r.pill} ${r.pOrange}`} style={{ marginLeft: 8 }}>{ageDays(p)} hari</span>}
                <div className={r.meta}>
                  <span className={r.mono}>{p.receiptNo}</span><span>{p.itemType}{p.description ? ` · ${p.description}` : ""}</span>
                  <span>{p.direction === "in" ? `dari ${p.sender || "–"}` : `ke ${p.recipient || "–"}`}</span>
                  {p.department && <span>{p.department}</span>}<span className={r.mute}>{fmtDateTime(p.createdAt)}</span>
                  {p.email && <span className={r.mute}>{p.notifiedAt ? "✉ terkirim" : "✉ belum terkirim"}</span>}
                </div>
              </div>
              <div className={r.itemSide}>
                <input className={r.input} value={names[p.id] ?? (p.direction === "in" ? p.recipient : p.courier)} onChange={(e) => setNames((x) => ({ ...x, [p.id]: e.target.value }))} placeholder={p.direction === "in" ? "Nama pengambil" : "Nama kurir"} aria-label="Nama pengambil" />
                <button type="button" className={`${r.btn} ${r.btnSm}`} disabled={busy === p.id} onClick={() => hand(p)}>{busy === p.id ? "…" : "Serahkan"}</button>
                <button type="button" className={r.proofBtn} onClick={() => onProof(p)} title="Bukti permintaan">🧾</button>
                <button type="button" className={`${r.link} ${r.danger}`} onClick={() => del(p)}>Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SimpleList({ list, onProof }: { list: Parcel[]; onProof: (p: Parcel) => void }) {
  if (!list.length) return <p className={r.empty}>Belum ada aktivitas hari ini.</p>;
  return (
    <div className={r.list}>
      {list.map((p) => (
        <div key={p.id} className={r.item}>
          <div>
            <b className={p.direction === "in" ? r.dirIn : r.dirOut}>{p.direction === "in" ? "⬇" : "⬆"} {p.direction === "in" ? p.recipient : p.sender}</b>
            <div className={r.meta}><span className={r.mono}>{p.receiptNo}</span><span>{p.itemType}</span><span>masuk {fmtTime(p.createdAt)}</span></div>
          </div>
          <div className={r.itemSide}>{p.status === "handed" ? <span className={`${r.pill} ${r.pGreen}`}>{p.handedTo} · {fmtTime(p.handedAt)}</span> : <span className={`${r.pill} ${r.pOrange}`}>Menunggu</span>}
            <button type="button" className={r.proofBtn} onClick={() => onProof(p)}>🧾 Bukti</button></div>
        </div>
      ))}
    </div>
  );
}

const COLS = [
  col<Parcel>("no", "No. Tanda Terima", (p) => p.receiptNo), col<Parcel>("arah", "Arah", (p) => (p.direction === "in" ? "Masuk" : "Keluar")),
  col<Parcel>("jenis", "Jenis", (p) => p.itemType), col<Parcel>("ket", "Keterangan", (p) => p.description), col<Parcel>("dari", "Dari", (p) => p.sender),
  col<Parcel>("untuk", "Untuk", (p) => p.recipient), col<Parcel>("dept", "Departemen", (p) => p.department), col<Parcel>("masuk", "Dicatat", (p) => fmtDateTime(p.createdAt)),
  col<Parcel>("ambil", "Diambil oleh", (p) => p.handedTo || "-"), col<Parcel>("jam", "Waktu serah", (p) => (p.handedAt ? fmtDateTime(p.handedAt) : "-")),
];

function HistoryList({ parcels, onProof }: { parcels: Parcel[]; onProof: (p: Parcel) => void }) {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [dirF, setDirF] = useState<"all" | ParcelDirection>("all");
  const [q, setQ] = useState("");
  const list = parcels.filter((p) => monthOf(p.createdAt) === month && (dirF === "all" || p.direction === dirF) && (!q || [p.receiptNo, p.sender, p.recipient, p.department, p.handedTo].join(" ").toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className={r.row}>
        <input className={r.input} style={{ width: 150 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Bulan" />
        <div className={r.seg}>{([["all", "Semua"], ["in", "Masuk"], ["out", "Keluar"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={dirF === k} onClick={() => setDirF(k)}>{l}</button>)}</div>
        <input className={r.input} style={{ flex: "1 1 160px", width: "auto" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" />
        <ExportButtons rows={list} columns={COLS} title="Barang & Surat" filename="Barang_Surat" period={month} />
      </div>
      <p className={r.hint}>Riwayat memuat 6 bulan terakhir.</p>
      {list.length === 0 ? <p className={r.empty}>Tidak ada data.</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>No.</th><th>Jenis</th><th>Dari → Untuk</th><th>Dicatat</th><th>Serah terima</th><th /></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td className={`${r.mono} ${r.nowrap}`}>{p.receiptNo}</td>
                <td>{p.itemType}{p.description && <div className={r.mute}>{p.description}</div>}</td>
                <td>{p.sender || "–"} → <b>{p.recipient || "–"}</b>{p.department && <div className={r.mute}>{p.department}</div>}</td>
                <td className={r.nowrap}>{fmtDateTime(p.createdAt)}</td>
                <td>{p.status === "handed" ? <>{p.handedTo}<div className={r.mute}>{fmtDateTime(p.handedAt)}</div></> : <span className={`${r.pill} ${r.pOrange}`}>Menunggu</span>}</td>
                <td className={r.num}><button type="button" className={r.proofBtn} onClick={() => onProof(p)}>🧾 Bukti</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
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
    doc.text(`Tanggal: ${fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`, w / 2, 58, { align: "center" });
    autoTable(doc, {
      startY: 74,
      head: [["No", "No. Tanda Terima", "Jenis", "Dari", "Untuk / tujuan", "Kurir", "Jam serah", "Paraf kurir"]],
      body: rows.map((p, i) => [String(i + 1), p.receiptNo, p.itemType + (p.description ? ` — ${p.description}` : ""), p.sender, p.recipient, p.handedTo || p.courier, p.handedAt ? fmtTime(p.handedAt) : "", ""]),
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
      <input className={r.input} style={{ width: 150, minHeight: 36 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tanggal lembar kurir" />
      <button type="button" className={r.ghost} disabled={!rows.length} onClick={() => print().catch((e) => alert(String(e)))} title="Cetak lembar serah terima kurir (barang keluar)">🖨 Lembar kurir ({rows.length})</button>
    </span>
  );
}
