"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { L } from "@/lib/i18n";
import { useLang } from "@/lib/providers";
import { ModalPortal } from "@/components/ModalPortal";
import { SearchPick, type PickOption } from "@/components/SearchPick";
import { getAllEmployeesFull, type MyProfile } from "@/lib/api";
import {
  cardStatusLabel, csvEscape, fmtDate, logActionLabel, requestStatusLabel, tipeName, TIPES, TIPE_ICON, TIPE_LABEL, wibToday,
  type CardStatus, type CardTipe, type IdCard, type IdCardLog, type IdHandover, type IdRequest, type RequestStatus,
} from "@/lib/idcard/model";
import { buildCardsPdf, cardContent, designKindOf, getDefaultDesign, preloadDesign, renderCard, type CardDesign, type DesignKind } from "@/lib/idcard/render";
import { printHandoverReceipt, printRequestReceipt } from "@/lib/idcard/documents";
import {
  createHandover, createRequest, deleteHandover, deleteRequest, getCardCounts, getCardLogs, getCardsOfRequest, getDesigns, getHandovers, getRequests, type Designs,
  markPrinted, peekNextSeq, previewNumber, searchCards, setCardStatus, setRequestStatus,
} from "@/lib/idcardApi";
import { ModuleHeader, ModulePage, ModuleTabs } from "./ModuleShell";
import IdCardDesigner from "./IdCardDesigner";
import s from "./idcard.module.css";

/* ════════════════════════════════════════════════════════════
   ID CARD — kartu akses Temporary / Contractor / Outsourcing.
   Alur sama dengan sistem ID Card lama: Pengajuan → Cetak kartu (PDF) → Penyerahan (tanda terima) + Card Designer,
   ditambah pelacakan per kartu (diterbitkan / diserahkan / kembali / hilang). Data: supabase/11_idcard.sql.
════════════════════════════════════════════════════════════ */

type Pane = "dashboard" | "pengajuan" | "riwayat" | "penyerahan" | "kartu" | "designer";
type Toast = (msg: string, err?: boolean) => void;
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function IdCardTab({ myProfile }: { myProfile?: MyProfile | null }) {
  const { lang } = useLang();
  void lang;
  const actor = myProfile?.fullName || "Admin";

  const [pane, setPane] = useState<Pane>("dashboard");
  const [requests, setRequests] = useState<IdRequest[]>([]);
  const [handovers, setHandovers] = useState<IdHandover[]>([]);
  const [counts, setCounts] = useState<Record<CardStatus, number>>({ diterbitkan: 0, diserahkan: 0, kembali: 0, hilang: 0 });
  const [designs, setDesigns] = useState<Designs>({ general: getDefaultDesign("general"), transporter: getDefaultDesign("transporter") });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToastState] = useState<{ msg: string; err?: boolean } | null>(null);
  const [detail, setDetail] = useState<IdRequest | null>(null);
  const [prefill, setPrefill] = useState<IdRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const notify: Toast = useCallback((msg, err) => { setToastState({ msg, err }); setTimeout(() => setToastState(null), err ? 5000 : 2800); }, []);

  const reload = useCallback(async () => {
    try {
      const [r, h, c, d] = await Promise.all([getRequests(), getHandovers(), getCardCounts(), getDesigns()]);
      setRequests(r); setHandovers(h); setCounts(c); setDesigns(d); setError(null);
    } catch (e) { setError(msgOf(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /* ── aksi bersama ── */
  async function printCards(r: IdRequest) {
    setBusy(L("Membuat PDF kartu…", "Building the cards PDF…"));
    try {
      const cards = await getCardsOfRequest(r.id);
      const { pdf, pages } = await buildCardsPdf(cards.map((c) => c.number), TIPE_LABEL[r.tipe], r.lokasi, designs[designKindOf(r.tipe)], { tipe: r.tipe });
      pdf.save(`kartu-${r.tipe}-${r.cardFrom}-${r.cardTo}.pdf`);
      if (r.status === "pending") await markPrinted(r.id);
      notify(L(`PDF ${pages} halaman, ${r.jumlah} kartu`, `PDF ${pages} page(s), ${r.jumlah} cards`));
      await reload();
    } catch (e) { notify(msgOf(e), true); }
    setBusy(null);
  }
  async function printReceipt(r: IdRequest) {
    try {
      const cards = await getCardsOfRequest(r.id);
      if (!printRequestReceipt(r, cards.map((c) => c.number))) notify(L("Jendela cetak diblokir peramban — izinkan pop-up untuk situs ini.", "The print window was blocked by the browser — allow pop-ups for this site."), true);
    } catch (e) { notify(msgOf(e), true); }
  }
  async function cycleStatus(r: IdRequest) {
    const order: RequestStatus[] = ["pending", "printed", "selesai"];
    const next = order[(order.indexOf(r.status) + 1) % order.length];
    try { await setRequestStatus(r.id, next); notify(L(`Status diubah: ${requestStatusLabel(next)}`, `Status changed: ${requestStatusLabel(next)}`)); await reload(); setDetail((d) => (d && d.id === r.id ? { ...d, status: next } : d)); }
    catch (e) { notify(msgOf(e), true); }
  }
  async function removeRequest(r: IdRequest) {
    if (!window.confirm(L(`Hapus pengajuan "${r.perusahaan}" (${r.jumlah} kartu, ${r.cardFrom}→${r.cardTo})?\n\nNomor yang sudah dipakai tidak dipakai ulang. Data tidak bisa dikembalikan.`, `Delete the request "${r.perusahaan}" (${r.jumlah} cards, ${r.cardFrom}→${r.cardTo})?\n\nUsed numbers are not reused. This cannot be undone.`))) return;
    try { await deleteRequest(r.id); notify(L("Pengajuan dihapus", "Request deleted")); setDetail(null); await reload(); }
    catch (e) { notify(msgOf(e), true); }
  }
  function startHandover(r: IdRequest) { setDetail(null); setPrefill(r); setPane("penyerahan"); }

  const pendingCards = useMemo(() => requests.filter((r) => r.status === "pending").reduce((a, r) => a + r.jumlah, 0), [requests]);
  const sumBy = (t: CardTipe) => requests.filter((r) => r.tipe === t).reduce((a, r) => a + r.jumlah, 0);

  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Security · ID Card", "Security · ID Card")}
        title="ID Card"
        desc={L("Kartu akses Temporary, Contractor & Outsourcing: pengajuan, cetak PDF, tanda terima penyerahan, desain kartu, dan pelacakan tiap nomor kartu.", "Temporary, Contractor & Outsourcing access cards: requests, PDF printing, hand-over receipts, card design, and tracking of every card number.")}
        actions={<span className={s.chip}>{(counts.diterbitkan + counts.diserahkan + counts.kembali + counts.hilang).toLocaleString()} {L("kartu terdaftar", "cards registered")}</span>}
      />
      {error && <div className={s.err}>{error}</div>}
      {busy && <div className={s.warnBox}>⏳ {busy}</div>}

      <ModuleTabs<Pane>
        value={pane}
        onChange={setPane}
        tabs={[
          { id: "dashboard", label: "Dashboard", icon: "📊" },
          { id: "pengajuan", label: L("Pengajuan Baru", "New Request"), icon: "📝" },
          { id: "riwayat", label: L("Riwayat", "History"), icon: "📋", badge: requests.filter((r) => r.status === "pending").length || undefined },
          { id: "penyerahan", label: L("Penyerahan", "Hand-over"), icon: "📦" },
          { id: "kartu", label: L("Cari Kartu", "Find Card"), icon: "🔎" },
          { id: "designer", label: "Card Designer", icon: "🎨" },
        ]}
      />

      {pane === "dashboard" && (
        <>
          <div className={s.stats}>
            <div className={s.stat}><small>{L("Total kartu", "Total cards")}</small><b>{(sumBy("T") + sumBy("C") + sumBy("O") + sumBy("R")).toLocaleString()}</b><em>{L("semua jenis", "all types")}</em></div>
            <div className={`${s.stat} ${s.t_orange}`}><small>Temporary</small><b>{sumBy("T").toLocaleString()}</b><em>T-DDMMYY###</em></div>
            <div className={s.stat}><small>Contractor</small><b>{sumBy("C").toLocaleString()}</b><em>DDMMYY###</em></div>
            <div className={`${s.stat} ${s.t_green}`}><small>Outsourcing</small><b>{sumBy("O").toLocaleString()}</b><em>DDMMYY###</em></div>
            <div className={`${s.stat} ${s.t_orange}`}><small>Transporter</small><b>{sumBy("R").toLocaleString()}</b><em>1, 2, 3 …</em></div>
            <div className={`${s.stat} ${s.t_orange}`}><small>Pending Print</small><b>{pendingCards.toLocaleString()}</b><em>{L("belum dicetak", "not printed yet")}</em></div>
            <div className={`${s.stat} ${s.t_green}`}><small>{L("Sedang diserahkan", "Currently handed over")}</small><b>{counts.diserahkan.toLocaleString()}</b><em>{handovers.length} {L("transaksi penyerahan", "hand-over records")}</em></div>
            <div className={`${s.stat} ${s.t_gray}`}><small>{L("Stok diterbitkan", "Issued stock")}</small><b>{counts.diterbitkan.toLocaleString()}</b><em>{L("belum diserahkan", "not handed over yet")}</em></div>
            <div className={`${s.stat} ${counts.hilang ? s.t_red : s.t_gray}`}><small>{L("Hilang / kembali", "Lost / returned")}</small><b>{counts.hilang} / {counts.kembali}</b><em>{L("hilang / dikembalikan", "lost / returned")}</em></div>
          </div>
          <div className={s.grid2}>
            <div className={s.panel}>
              <div className={s.panelHead}>🕐 {L("Pengajuan Terbaru", "Latest Requests")}</div>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>{L("Tanggal", "Date")}</th><th>{L("Perusahaan / PIC", "Company / PIC")}</th><th>{L("Jenis", "Type")}</th><th>{L("Kartu", "Cards")}</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {loading ? <tr><td colSpan={6} className={s.empty}>…</td></tr> : requests.length === 0 ? <tr><td colSpan={6} className={s.empty}>{L("Belum ada pengajuan", "No requests yet")}</td></tr> : requests.slice(0, 6).map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDate(r.tanggal)}</td>
                        <td><b>{r.perusahaan}</b><span className={s.sub}>{r.pic}</span></td>
                        <td><span className={`${s.badge} ${s["b_" + r.tipe]}`}>{TIPE_LABEL[r.tipe]}</span></td>
                        <td>{r.jumlah}</td>
                        <td><span className={`${s.badge} ${s["b_" + r.status]}`}>{requestStatusLabel(r.status)}</span></td>
                        <td><button type="button" className={`${s.btn} ${s.sm}`} onClick={() => setDetail(r)}>Detail</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={s.panel}>
              <div className={s.panelHead}>⚡ {L("Aksi Cepat", "Quick Actions")}</div>
              <div className={s.panelBody}>
                <button type="button" className={`${s.btnPrimary} ${s.full}`} onClick={() => setPane("pengajuan")}>📝 {L("Buat Pengajuan Baru", "Create a New Request")}</button>
                <button type="button" className={`${s.btnAmber} ${s.full}`} onClick={() => setPane("penyerahan")}>📦 {L("Buat Tanda Terima Penyerahan", "Create a Hand-over Receipt")}</button>
                <button type="button" className={`${s.btn} ${s.full}`} onClick={() => setPane("kartu")}>🔎 {L("Cari Nomor Kartu", "Find a Card Number")}</button>
                <button type="button" className={`${s.btn} ${s.full}`} onClick={() => setPane("designer")}>🎨 {L("Edit Template Kartu", "Edit the Card Template")}</button>
                <div className={s.divider} />
                <span className={s.sectionTitle}>{L("Format nomor kartu", "Card number format")}</span>
                <div className={s.formatRows}>
                  <div><span className={`${s.badge} ${s.b_T}`}>T</span><span className={s.tag}>T-DDMMYY001</span>Temporary</div>
                  <div><span className={`${s.badge} ${s.b_C}`}>C</span><span className={s.tag}>DDMMYY001</span>Contractor</div>
                  <div><span className={`${s.badge} ${s.b_O}`}>O</span><span className={s.tag}>DDMMYY001</span>Outsourcing</div>
                  <div><span className={`${s.badge} ${s.b_R}`}>R</span><span className={s.tag}>1, 2, 3 …</span>Transporter</div>
                </div>
                <span className={s.hint}>{L("Contractor & Outsourcing berbagi satu urutan harian sehingga nomor tidak pernah kembar. Transporter memakai nomor urut polos yang terus berlanjut.", "Contractor & Outsourcing share one daily sequence, so numbers never repeat. Transporter uses plain running numbers that keep counting.")}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {pane === "pengajuan" && <RequestPane requests={requests} designs={designs} notify={notify} onCreated={async (r) => { await reload(); setDetail(r); }} />}
      {pane === "riwayat" && <HistoryPane requests={requests} loading={loading} onDetail={setDetail} onPrint={printCards} onReceipt={printReceipt} onCycle={cycleStatus} onDelete={removeRequest} notify={notify} />}
      {pane === "penyerahan" && <HandoverPane requests={requests} handovers={handovers} prefill={prefill} clearPrefill={() => setPrefill(null)} notify={notify} onChanged={reload} />}
      {pane === "kartu" && <CardsPane notify={notify} onChanged={reload} />}
      {pane === "designer" && <IdCardDesigner designs={designs} actor={actor} onSaved={(k: DesignKind, d: CardDesign) => setDesigns((p) => ({ ...p, [k]: d }))} notify={notify} />}

      {detail && <RequestDetail r={detail} onClose={() => setDetail(null)} onPrint={printCards} onReceipt={printReceipt} onCycle={cycleStatus} onHandover={startHandover} onDelete={removeRequest} />}
      {toast && <div className={`${s.toast} ${toast.err ? s.toastErr : ""}`} role="status">{toast.msg}</div>}
    </ModulePage>
  );
}

/* ════════════════ Pengajuan baru ════════════════ */
function RequestPane({ requests, designs, notify, onCreated }: { requests: IdRequest[]; designs: Designs; notify: Toast; onCreated: (r: IdRequest) => void }) {
  const [perusahaan, setPerusahaan] = useState("");
  const [pic, setPic] = useState("");
  const [phone, setPhone] = useState("");
  const [tipe, setTipe] = useState<CardTipe>("T");
  const [lokasi, setLokasi] = useState("CIKARANG");
  const [jumlah, setJumlah] = useState("10");
  const [tanggal, setTanggal] = useState(wibToday());
  const [catatan, setCatatan] = useState("");
  const [seq, setSeq] = useState(1);
  const [saving, setSaving] = useState(false);
  const cvs = useRef<HTMLCanvasElement>(null);
  const n = Math.max(0, parseInt(jumlah) || 0);
  const design = designs[designKindOf(tipe)];

  useEffect(() => { let alive = true; peekNextSeq(tipe).then((v) => alive && setSeq(v)).catch(() => {}); return () => { alive = false; }; }, [tipe, requests]);

  useEffect(() => {
    const c = cvs.current;
    if (!c) return;
    let alive = true;
    preloadDesign(design).then(() => {
      if (!alive) return;
      const DPX = 3, w = Math.round(design.cardW * DPX), h = Math.round(design.cardH * DPX);
      c.width = w; c.height = h;
      renderCard(c.getContext("2d")!, 0, 0, w, h, cardContent(tipe, TIPE_LABEL[tipe], lokasi, previewNumber(tipe, seq), wibToday()), design);
    });
    return () => { alive = false; };
  }, [design, tipe, lokasi, seq]);

  const prev = useMemo(() => requests.filter((r) => r.tipe === tipe).slice(0, 5), [requests, tipe]);

  async function submit() {
    if (!perusahaan.trim()) return notify(L("Nama perusahaan harus diisi", "Company name is required"), true);
    if (!pic.trim()) return notify(L("Nama PIC harus diisi", "PIC name is required"), true);
    if (n < 1 || n > 500) return notify(L("Jumlah harus antara 1–500", "Quantity must be between 1 and 500"), true);
    setSaving(true);
    try {
      const id = await createRequest({ tanggal, perusahaan: perusahaan.trim(), pic: pic.trim(), phone: phone.trim(), tipe, lokasi: lokasi.trim() || "CIKARANG", jumlah: n, catatan: catatan.trim() });
      const fresh = (await getRequests()).find((r) => r.id === id);
      notify(L(`Pengajuan berhasil! ${n} kartu${fresh ? ` (${fresh.cardFrom} → ${fresh.cardTo})` : ""}`, `Request created! ${n} cards${fresh ? ` (${fresh.cardFrom} → ${fresh.cardTo})` : ""}`));
      setPerusahaan(""); setPic(""); setPhone(""); setCatatan(""); setJumlah("10");
      if (fresh) onCreated(fresh);
    } catch (e) { notify(msgOf(e), true); }
    setSaving(false);
  }

  return (
    <div className={s.gridForm}>
      <div className={s.panel}>
        <div className={s.panelHead}>📝 {L("Form Pengajuan Kartu", "Card Request Form")}</div>
        <div className={s.panelBody}>
          <label className={s.field}>{L("Nama Perusahaan / Kontraktor", "Company / Contractor")}<input value={perusahaan} onChange={(e) => setPerusahaan(e.target.value)} placeholder="PT. Nama Perusahaan" maxLength={120} /></label>
          <div className={s.row2}>
            <label className={s.field}>{L("Nama PIC", "PIC name")}<input value={pic} onChange={(e) => setPic(e.target.value)} placeholder={L("Nama lengkap PIC", "PIC full name")} maxLength={80} /></label>
            <label className={s.field}>{L("No. HP / WA PIC", "PIC phone / WA")}<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx-xxxx-xxxx" maxLength={30} inputMode="tel" /></label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>{L("Jenis Kartu", "Card type")}
              <select value={tipe} onChange={(e) => setTipe(e.target.value as CardTipe)}>{TIPES.map((t) => <option key={t} value={t}>{TIPE_ICON[t]} {tipeName(t)}</option>)}</select>
            </label>
            <label className={s.field}>{L("Lokasi / Unit", "Location / Unit")}<input value={lokasi} onChange={(e) => setLokasi(e.target.value)} placeholder="CIKARANG" maxLength={40} /></label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>{L("Jumlah Kartu", "Quantity")}<input type="number" min={1} max={500} value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></label>
            <label className={s.field}>{L("Tanggal Pengajuan", "Request date")}<input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>
          </div>
          <label className={s.field}>{L("Catatan / Keperluan", "Notes / Purpose")}<textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={L("Keperluan pembuatan kartu, proyek, dll…", "Purpose of the cards, project, etc…")} maxLength={500} /></label>
          <div className={s.divider} />
          <div className={s.sumBox}>
            <span className={s.cap}>{L("Nomor kartu yang akan digenerate", "Card numbers to be generated")}</span>
            <div className={s.sumRow}>
              <div><small>{L("Dari", "From")}</small><span className={s.tag}>{previewNumber(tipe, seq)}</span></div>
              <span style={{ color: "var(--t3)" }}>→</span>
              <div><small>{L("Sampai", "To")}</small><span className={s.tag}>{previewNumber(tipe, seq + Math.max(n, 1) - 1)}</span></div>
              <div><small>Total</small><b>{n}</b></div>
            </div>
            <span className={s.hint}>{tipe === "R" ? L("Transporter: nomor urut polos yang terus berlanjut (tidak kembali ke 1). Nomor seri & tanggal cetak dibuat saat kartu dicetak.", "Transporter: plain running numbers that keep counting (never back to 1). The serial no. and print date are added when the card is printed.") : L("Nomor pastinya ditetapkan database saat disimpan (aman walau ada yang mengajukan bersamaan).", "The exact numbers are assigned by the database on save (safe even if someone else submits at the same time).")}</span>
          </div>
          <button type="button" className={`${s.btnPrimary} ${s.full}`} onClick={submit} disabled={saving}>✅ {saving ? L("Menyimpan…", "Saving…") : L("Buat Pengajuan & Generate Kartu", "Create Request & Generate Cards")}</button>
        </div>
      </div>
      <div className={s.wrap}>
        <div className={s.panel}>
          <div className={s.panelHead}>👁 {L("Preview Kartu", "Card Preview")}</div>
          <div className={`${s.panelBody} ${s.previewWrap}`}>
            <canvas ref={cvs} />
            <span className={s.hint}>{L("Preview berdasarkan template saat ini (ubah di Card Designer)", "Preview based on the current template (edit in Card Designer)")}</span>
          </div>
        </div>
        <div className={s.panel}>
          <div className={s.panelHead}>📊 {L("Pengajuan Sebelumnya", "Previous Requests")} <span className={s.hint}>({L("jenis sama", "same type")})</span></div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>{L("Tanggal", "Date")}</th><th>{L("Dari", "From")}</th><th>{L("Sampai", "To")}</th><th>{L("Jml", "Qty")}</th></tr></thead>
              <tbody>
                {prev.length === 0 ? <tr><td colSpan={4} className={s.empty}>{L("Belum ada", "None yet")}</td></tr> : prev.map((r) => (
                  <tr key={r.id}><td>{fmtDate(r.tanggal)}</td><td><span className={s.tag}>{r.cardFrom}</span></td><td><span className={s.tag}>{r.cardTo}</span></td><td><b>{r.jumlah}</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Riwayat ════════════════ */
function HistoryPane({ requests, loading, onDetail, onPrint, onReceipt, onCycle, onDelete, notify }: {
  requests: IdRequest[]; loading: boolean; onDetail: (r: IdRequest) => void; onPrint: (r: IdRequest) => void; onReceipt: (r: IdRequest) => void;
  onCycle: (r: IdRequest) => void; onDelete: (r: IdRequest) => void; notify: Toast;
}) {
  const [q, setQ] = useState("");
  const [tipe, setTipe] = useState("");
  const [status, setStatus] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return requests.filter((r) => (!t || `${r.perusahaan} ${r.pic} ${r.cardFrom} ${r.cardTo}`.toLowerCase().includes(t)) && (!tipe || r.tipe === tipe) && (!status || r.status === status));
  }, [requests, q, tipe, status]);

  function exportCsv() {
    if (requests.length === 0) return notify(L("Tidak ada data", "No data"), true);
    const rows = [["ID", "Tanggal", "Perusahaan", "PIC", "Telp", "Jenis", "Lokasi", "Jumlah", "Dari", "Sampai", "Status", "Catatan"]];
    list.forEach((r) => rows.push([r.id, r.tanggal, r.perusahaan, r.pic, r.phone, TIPE_LABEL[r.tipe], r.lokasi, String(r.jumlah), r.cardFrom, r.cardTo, requestStatusLabel(r.status), r.catatan]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `id-card-log-${wibToday().replaceAll("-", "")}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    notify(L("CSV diekspor", "CSV exported"));
  }

  return (
    <>
      <div className={s.filters}>
        <input type="search" placeholder={L("Cari perusahaan, PIC, nomor kartu…", "Search company, PIC, card number…")} aria-label={L("Cari riwayat", "Search history")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={tipe} onChange={(e) => setTipe(e.target.value)} aria-label={L("Jenis", "Type")}><option value="">{L("Semua jenis", "All types")}</option>{TIPES.map((t) => <option key={t} value={t}>{tipeName(t)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">{L("Semua status", "All statuses")}</option>{(["pending", "printed", "selesai"] as const).map((x) => <option key={x} value={x}>{requestStatusLabel(x)}</option>)}</select>
        <button type="button" className={s.btn} onClick={exportCsv}>📊 {L("Export CSV", "Export CSV")}</button>
      </div>
      <div className={s.panel}>
        <div className={s.panelHead}>📋 {L("Riwayat Pengajuan Kartu", "Card Request History")}<span className={s.chip} style={{ marginLeft: "auto" }}>{list.length} {L("data", "records")}</span></div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>{L("Tgl Pengajuan", "Request date")}</th><th>{L("Perusahaan", "Company")}</th><th>PIC</th><th>{L("Jenis", "Type")}</th><th>{L("No. Dari", "From")}</th><th>{L("No. Sampai", "To")}</th><th>{L("Jml", "Qty")}</th><th>Status</th><th>{L("Aksi", "Actions")}</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className={s.empty}>…</td></tr> : list.length === 0 ? <tr><td colSpan={9} className={s.empty}><span>📋</span>{L("Belum ada data", "No data yet")}</td></tr> : list.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.tanggal)}</td>
                  <td><b>{r.perusahaan}</b></td>
                  <td>{r.pic}</td>
                  <td><span className={`${s.badge} ${s["b_" + r.tipe]}`}>{TIPE_LABEL[r.tipe]}</span></td>
                  <td><span className={s.tag}>{r.cardFrom}</span></td>
                  <td><span className={s.tag}>{r.cardTo}</span></td>
                  <td><b>{r.jumlah}</b></td>
                  <td><span className={`${s.badge} ${s["b_" + r.status]}`}>{requestStatusLabel(r.status)}</span></td>
                  <td>
                    <div className={s.rowActions}>
                      <button type="button" className={s.iconBtn} onClick={() => onDetail(r)} title="Detail" aria-label="Detail">👁</button>
                      <button type="button" className={s.iconBtn} onClick={() => onPrint(r)} title={L("Cetak kartu (PDF)", "Print cards (PDF)")} aria-label={L("Cetak kartu", "Print cards")}>🖨</button>
                      <button type="button" className={s.iconBtn} onClick={() => onReceipt(r)} title={L("Tanda terima pengajuan", "Request receipt")} aria-label={L("Tanda terima", "Receipt")}>📄</button>
                      <button type="button" className={s.iconBtn} onClick={() => onCycle(r)} title={L("Ubah status", "Change status")} aria-label={L("Ubah status", "Change status")}>🔄</button>
                      <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} onClick={() => onDelete(r)} title={L("Hapus", "Delete")} aria-label={L("Hapus", "Delete")}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ════════════════ Detail pengajuan ════════════════ */
function RequestDetail({ r, onClose, onPrint, onReceipt, onCycle, onHandover, onDelete }: {
  r: IdRequest; onClose: () => void; onPrint: (r: IdRequest) => void; onReceipt: (r: IdRequest) => void; onCycle: (r: IdRequest) => void; onHandover: (r: IdRequest) => void; onDelete: (r: IdRequest) => void;
}) {
  const [cards, setCards] = useState<IdCard[] | null>(null);
  useEffect(() => { let alive = true; getCardsOfRequest(r.id).then((c) => alive && setCards(c)).catch(() => alive && setCards([])); return () => { alive = false; }; }, [r.id, r.status]);
  const by = (st: string) => (cards ?? []).filter((c) => c.status === st).length;
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={700}>
      <div className={s.dialog}>
        <h3>{L("Detail Pengajuan", "Request Details")} — {r.perusahaan}</h3>
        <div className={s.infoGrid}>
          <div><span>{L("Perusahaan", "Company")}</span><b>{r.perusahaan}</b></div>
          <div><span>{L("Jenis", "Type")}</span><span className={`${s.badge} ${s["b_" + r.tipe]}`} style={{ minWidth: 0 }}>{TIPE_LABEL[r.tipe]}</span></div>
          <div><span>PIC</span>{r.pic}</div>
          <div><span>{L("Jumlah", "Quantity")}</span><b>{r.jumlah} {L("kartu", "cards")}</b></div>
          <div><span>{L("No. HP", "Phone")}</span>{r.phone || "—"}</div>
          <div><span>{L("Nomor dari", "From")}</span><span className={s.tag} style={{ minWidth: 0 }}>{r.cardFrom}</span></div>
          <div><span>{L("Tanggal", "Date")}</span>{fmtDate(r.tanggal)}</div>
          <div><span>{L("Nomor sampai", "To")}</span><span className={s.tag} style={{ minWidth: 0 }}>{r.cardTo}</span></div>
          <div><span>{L("Lokasi", "Location")}</span>{r.lokasi || "—"}</div>
          <div><span>Status</span><span className={`${s.badge} ${s["b_" + r.status]}`} style={{ minWidth: 0 }}>{requestStatusLabel(r.status)}</span></div>
          <div><span>{L("Dibuat oleh", "Created by")}</span>{r.createdBy || "—"}</div>
        </div>
        {r.catatan && <div className={s.warnBox} style={{ background: "var(--surface2)", color: "var(--t2)" }}><b>{L("Catatan:", "Notes:")}</b> {r.catatan}</div>}
        <span className={s.sectionTitle}>
          {L("Daftar nomor kartu", "Card numbers")} ({r.jumlah}) — {L("diterbitkan", "issued")} {by("diterbitkan")} · {L("diserahkan", "handed over")} {by("diserahkan")} · {L("kembali", "returned")} {by("kembali")} · {L("hilang", "lost")} {by("hilang")}
        </span>
        <div className={s.numGrid}>{cards === null ? "…" : cards.map((c) => <span key={c.id} className={`${s.numTag} ${s["n_" + c.status]}`} title={cardStatusLabel(c.status)}>{c.number}</span>)}</div>
        <div className={s.dialogActions} style={{ justifyContent: "flex-start" }}>
          <button type="button" className={s.btnPrimary} onClick={() => { onPrint(r); onClose(); }}>🖨 {L("Cetak Kartu PDF", "Print Cards PDF")}</button>
          <button type="button" className={s.btnAmber} onClick={() => { onReceipt(r); onClose(); }}>📄 {L("Tanda Terima", "Receipt")}</button>
          <button type="button" className={s.btnAmber} onClick={() => onHandover(r)}>📦 {L("Buat Penyerahan", "Create Hand-over")}</button>
          <button type="button" className={s.btn} onClick={() => onCycle(r)}>🔄 {L("Ubah Status", "Change Status")}</button>
          <button type="button" className={s.btnDanger} onClick={() => onDelete(r)}>🗑 {L("Hapus", "Delete")}</button>
          <button type="button" className={s.btn} onClick={onClose} style={{ marginLeft: "auto" }}>{L("Tutup", "Close")}</button>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ════════════════ Penyerahan ════════════════ */
function HandoverPane({ requests, handovers, prefill, clearPrefill, notify, onChanged }: {
  requests: IdRequest[]; handovers: IdHandover[]; prefill: IdRequest | null; clearPrefill: () => void; notify: Toast; onChanged: () => Promise<void>;
}) {
  const [perusahaan, setPerusahaan] = useState("");
  const [pic, setPic] = useState("");
  const [phone, setPhone] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [tanggal, setTanggal] = useState(wibToday());
  const [tipe, setTipe] = useState<CardTipe>("C");
  const [jumlah, setJumlah] = useState("1");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [catatan, setCatatan] = useState("");
  const [ref, setRef] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emps, setEmps] = useState<PickOption[]>([]);
  useEffect(() => { let alive = true; getAllEmployeesFull().then((l) => alive && setEmps(l.filter((e) => e.aktif !== false).map((e) => ({ key: e.id, name: e.nama, hint: `${e.nik ?? ""} ${e.departement ?? ""}`.trim() })))).catch(() => {}); return () => { alive = false; }; }, []);

  const apply = useCallback((r: IdRequest) => {
    setPerusahaan(r.perusahaan); setPic(r.pic); setPhone(r.phone); setTipe(r.tipe); setJumlah(String(r.jumlah)); setFrom(r.cardFrom); setTo(r.cardTo); setRef(r.id); setLegacy(false);
  }, []);
  useEffect(() => { if (prefill) { apply(prefill); clearPrefill(); } }, [prefill, apply, clearPrefill]);

  // pengajuan yang masih punya kartu belum diserahkan lebih dulu
  const refOptions = useMemo(() => requests.filter((r) => r.status !== "selesai").concat(requests.filter((r) => r.status === "selesai").slice(0, 10)), [requests]);

  async function submit() {
    if (!perusahaan.trim()) return notify(L("Nama perusahaan harus diisi", "Company name is required"), true);
    if (!pic.trim()) return notify(L("Nama penerima harus diisi", "Recipient name is required"), true);
    if (!from.trim() || !to.trim()) return notify(L("Nomor kartu dari / sampai harus diisi", "Card numbers from / to are required"), true);
    setSaving(true);
    try {
      const id = await createHandover({
        tanggal, perusahaan: perusahaan.trim(), pic: pic.trim(), phone: phone.trim(), jabatan: jabatan.trim(), tipe, cardFrom: from.trim(), cardTo: to.trim(),
        jumlah: parseInt(jumlah) || 0, catatan: catatan.trim(), requestId: ref || null, skipValidation: legacy,
      });
      notify(L("Penyerahan dicatat", "Hand-over recorded"));
      setPerusahaan(""); setPic(""); setPhone(""); setJabatan(""); setFrom(""); setTo(""); setCatatan(""); setRef(""); setJumlah("1"); setLegacy(false);
      await onChanged();
      const fresh = (await getHandovers()).find((x) => x.id === id);
      if (fresh && !printHandoverReceipt(fresh)) notify(L("Jendela cetak diblokir peramban — cetak ulang dari tabel di kanan.", "The print window was blocked — reprint from the table on the right."), true);
    } catch (e) { notify(msgOf(e), true); }
    setSaving(false);
  }

  async function remove(h: IdHandover) {
    if (!window.confirm(L(`Batalkan penyerahan untuk "${h.perusahaan}" (${h.cardFrom}→${h.cardTo})?\n\nKartunya kembali berstatus "diterbitkan".`, `Cancel the hand-over for "${h.perusahaan}" (${h.cardFrom}→${h.cardTo})?\n\nThe cards go back to "issued".`))) return;
    try { await deleteHandover(h.id); notify(L("Penyerahan dibatalkan", "Hand-over cancelled")); await onChanged(); } catch (e) { notify(msgOf(e), true); }
  }

  return (
    <div className={s.gridForm}>
      <div className={s.panel}>
        <div className={s.panelHead}>📦 {L("Form Penyerahan Kartu", "Card Hand-over Form")}</div>
        <div className={s.panelBody}>
          <label className={s.field}>{L("Referensi Pengajuan (opsional)", "Request reference (optional)")}
            <select value={ref} onChange={(e) => { setRef(e.target.value); const r = requests.find((x) => x.id === e.target.value); if (r) apply(r); }}>
              <option value="">{L("— Pilih pengajuan yang sudah ada —", "— Pick an existing request —")}</option>
              {refOptions.map((r) => <option key={r.id} value={r.id}>{fmtDate(r.tanggal)} · {r.perusahaan} · {TIPE_LABEL[r.tipe]} · {r.cardFrom}→{r.cardTo} ({r.jumlah})</option>)}
            </select>
            <span className={s.hint}>{L("Pilih pengajuan untuk mengisi data di bawah otomatis", "Pick a request to fill in the data below automatically")}</span>
          </label>
          <label className={s.field}>{L("Nama Perusahaan / Kontraktor", "Company / Contractor")}<input value={perusahaan} onChange={(e) => setPerusahaan(e.target.value)} placeholder="PT. Nama Perusahaan" maxLength={120} /></label>
          <div className={s.row2}>
            <div className={s.field}>{L("Nama Penerima (PIC)", "Recipient (PIC)")}<SearchPick options={emps} value={pic} onChange={setPic} placeholder={L("Nama lengkap penerima", "Recipient full name")} ariaLabel={L("Nama penerima", "Recipient name")} maxLength={80} /></div>
            <label className={s.field}>{L("No. HP / WA", "Phone / WA")}<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx-xxxx-xxxx" maxLength={30} inputMode="tel" /></label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>{L("Jabatan Penerima", "Recipient position")}<input value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="Supervisor, HSE, …" maxLength={60} /></label>
            <label className={s.field}>{L("Tanggal Penyerahan", "Hand-over date")}<input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>
          </div>
          <div className={s.divider} />
          <span className={s.sectionTitle}>{L("Detail kartu yang diserahkan", "Cards being handed over")}</span>
          <div className={s.row2}>
            <label className={s.field}>{L("Jenis Kartu", "Card type")}<select value={tipe} onChange={(e) => setTipe(e.target.value as CardTipe)}>{TIPES.map((t) => <option key={t} value={t}>{TIPE_ICON[t]} {tipeName(t)}</option>)}</select></label>
            {legacy && <label className={s.field}>{L("Jumlah Kartu", "Quantity")}<input type="number" min={1} max={999} value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></label>}
          </div>
          <div className={s.row2}>
            <label className={s.field}>{L("Nomor Kartu Dari", "Card number from")}<input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="231126001" maxLength={20} /></label>
            <label className={s.field}>{L("Nomor Kartu Sampai", "Card number to")}<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="231126010" maxLength={20} /></label>
          </div>
          <label className={`${s.field} ${s.check}`}>
            <input type="checkbox" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} />
            <span>{L("Kartu lama di luar sistem — catat tanpa memeriksa nomor", "Legacy cards outside the system — record without checking the numbers")}</span>
          </label>
          {!legacy && <span className={s.hint}>{L("Nomor diperiksa terhadap kartu yang diterbitkan; jumlah dihitung otomatis. Kartu yang sudah diserahkan tidak bisa diserahkan lagi.", "Numbers are checked against issued cards; the quantity is counted automatically. Cards already handed over cannot be handed over again.")}</span>}
          <label className={s.field}>{L("Catatan", "Notes")}<textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={L("Keterangan tambahan, lokasi kerja, dll…", "Extra notes, work location, etc…")} maxLength={500} /></label>
          <button type="button" className={`${s.btnGreen} ${s.full}`} onClick={submit} disabled={saving}>✅ {saving ? L("Menyimpan…", "Saving…") : L("Simpan & Cetak Tanda Terima", "Save & Print Receipt")}</button>
        </div>
      </div>
      <div className={s.panel}>
        <div className={s.panelHead}>📋 {L("Riwayat Penyerahan", "Hand-over History")}<span className={s.chip} style={{ marginLeft: "auto" }}>{handovers.length} {L("data", "records")}</span></div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>{L("Tanggal", "Date")}</th><th>{L("Perusahaan", "Company")}</th><th>{L("Penerima", "Recipient")}</th><th>{L("Jenis", "Type")}</th><th>{L("No. Dari", "From")}</th><th>{L("No. Sampai", "To")}</th><th>{L("Jml", "Qty")}</th><th>{L("Aksi", "Actions")}</th></tr></thead>
            <tbody>
              {handovers.length === 0 ? <tr><td colSpan={8} className={s.empty}><span>📦</span>{L("Belum ada penyerahan", "No hand-overs yet")}</td></tr> : handovers.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDate(h.tanggal)}</td>
                  <td><b>{h.perusahaan}</b>{!h.validated && <span className={s.sub}>{L("kartu lama", "legacy cards")}</span>}</td>
                  <td>{h.pic}{h.jabatan && <span className={s.sub}>{h.jabatan}</span>}</td>
                  <td><span className={`${s.badge} ${s["b_" + h.tipe]}`}>{TIPE_LABEL[h.tipe]}</span></td>
                  <td><span className={s.tag}>{h.cardFrom}</span></td>
                  <td><span className={s.tag}>{h.cardTo}</span></td>
                  <td><b>{h.jumlah}</b></td>
                  <td><div className={s.rowActions}>
                    <button type="button" className={s.iconBtn} onClick={() => { if (!printHandoverReceipt(h)) notify(L("Jendela cetak diblokir peramban.", "The print window was blocked."), true); }} title={L("Cetak tanda terima", "Print receipt")} aria-label={L("Cetak tanda terima", "Print receipt")}>📄</button>
                    <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} onClick={() => remove(h)} title={L("Batalkan penyerahan", "Cancel hand-over")} aria-label={L("Batalkan penyerahan", "Cancel hand-over")}>🗑</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Cari kartu ════════════════ */
function CardsPane({ notify, onChanged }: { notify: Toast; onChanged: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<IdCard[] | null>(null);
  const [logs, setLogs] = useState<Record<string, IdCardLog[]>>({});
  const [reqs, setReqs] = useState<Record<string, IdRequest | undefined>>({});
  const [hos, setHos] = useState<Record<string, IdHandover | undefined>>({});
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const run = useCallback(async (term: string) => {
    const id = ++seq.current;
    if (!term.trim()) { setRes(null); return; }
    setLoading(true);
    try {
      const cards = await searchCards(term);
      const [r, h] = await Promise.all([getRequests(), getHandovers()]);
      if (id !== seq.current) return;
      setReqs(Object.fromEntries(r.map((x) => [x.id, x])));
      setHos(Object.fromEntries(h.map((x) => [x.id, x])));
      setRes(cards);
      const lg: Record<string, IdCardLog[]> = {};
      await Promise.all(cards.slice(0, 5).map(async (c) => { lg[c.number] = await getCardLogs(c.number); }));
      if (id === seq.current) setLogs(lg);
    } catch (e) { notify(msgOf(e), true); }
    if (id === seq.current) setLoading(false);
  }, [notify]);
  useEffect(() => { const t = setTimeout(() => run(q), 300); return () => clearTimeout(t); }, [q, run]);

  async function change(c: IdCard, st: "kembali" | "hilang" | "diterbitkan") {
    const label = st === "kembali" ? L("kartu ini dikembalikan", "this card was returned") : st === "hilang" ? L("kartu ini hilang", "this card is lost") : L("kartu ini disiapkan ulang (stok)", "this card is returned to stock");
    const note = st === "diterbitkan" ? "" : window.prompt(L(`Catatan (opsional) — ${label}:`, `Note (optional) — ${label}:`), "");
    if (note === null) return;
    try { await setCardStatus(c.number, st, note); notify(L("Status kartu diperbarui", "Card status updated")); await run(q); await onChanged(); } catch (e) { notify(msgOf(e), true); }
  }

  return (
    <>
      <div className={s.filters}>
        <input type="search" autoFocus placeholder={L("Ketik nomor kartu (sebagian boleh), mis. 231126 atau T-2311…", "Type a card number (partial is fine), e.g. 231126 or T-2311…")} aria-label={L("Cari nomor kartu", "Search card number")} value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 48, fontSize: 15 }} />
      </div>
      <div className={s.panel}>
        <div className={s.panelHead}>🔎 {L("Hasil pencarian kartu", "Card search results")}{res && <span className={s.chip} style={{ marginLeft: "auto" }}>{res.length}</span>}</div>
        {res === null ? <div className={s.empty}><span>🪪</span>{L("Ketik nomor kartu untuk melihat siapa yang memegangnya.", "Type a card number to see who holds it.")}</div>
          : loading && res.length === 0 ? <div className={s.empty}>…</div>
          : res.length === 0 ? <div className={s.empty}><span>🤷</span>{L("Tidak ada kartu dengan nomor itu.", "No card with that number.")}</div>
          : res.map((c) => {
            const r = reqs[c.requestId], h = c.handoverId ? hos[c.handoverId] : undefined;
            return (
              <div key={c.id} className={s.cardRes}>
                <div><span className={s.num}>{c.number}</span><small>{tipeName(c.tipe)}</small></div>
                <div>
                  <span className={`${s.badge} ${s["b_" + c.status]}`}>{cardStatusLabel(c.status)}</span>
                  <small>{L("Diterbitkan untuk", "Issued for")} <b>{r?.perusahaan ?? "—"}</b>{r ? ` · PIC ${r.pic}` : ""}</small>
                  {h && <small>{L("Diserahkan ke", "Handed to")} <b>{h.pic}</b> ({h.perusahaan}) · {fmtDate(c.handedAt || h.tanggal)}</small>}
                  {c.note && <small>📝 {c.note}</small>}
                  {logs[c.number] && logs[c.number].length > 0 && (
                    <ul className={s.logList} style={{ marginTop: 6 }}>{logs[c.number].slice(0, 5).map((l) => <li key={l.id}><time>{fmtDate(l.createdAt)}</time><span><b>{logActionLabel(l.action)}</b>{l.detail ? ` · ${l.detail}` : ""} — {l.actor}</span></li>)}</ul>
                  )}
                </div>
                <div className={s.rowActions} style={{ flexWrap: "wrap" }}>
                  {c.status === "diserahkan" && <button type="button" className={s.iconBtn} onClick={() => change(c, "kembali")}>↩ {L("Kembali", "Returned")}</button>}
                  {c.status !== "hilang" && <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} onClick={() => change(c, "hilang")}>⚠ {L("Hilang", "Lost")}</button>}
                  {(c.status === "kembali" || c.status === "hilang") && <button type="button" className={s.iconBtn} onClick={() => change(c, "diterbitkan")}>♻ {L("Siapkan ulang", "Back to stock")}</button>}
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
