"use client";

/* BUKTI PERMINTAAN — tiket bernomor unik untuk wifi tamu, barang & surat, dan booking ruangan.
   Dipakai di dashboard (pratinjau + aksi kirim/cetak) dan di halaman publik /bukti?t=… */

import { useMemo, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { code128 } from "@/lib/receptionist/barcode";
import { daysBetween, fmtDate, receiptUrl, todayISO, verifyCode, type ReceiptData } from "@/lib/receptionist/model";
import p from "./proof.module.css";
import r from "./receptionist.module.css";

const KIND_LABEL = { wifi: "Akses Wifi Tamu", in: "Barang / Surat Masuk", out: "Barang / Surat Keluar", booking: "Booking Ruangan" } as const;

function stampOf(d: ReceiptData): { text: string; tone: string } {
  if (d.kind === "wifi") return d.status === "active" ? { text: "Aktif", tone: p.s_ok } : d.status === "returned" ? { text: "Dikembalikan", tone: p.s_off } : { text: "Selesai", tone: p.s_off };
  if (d.kind === "parcel") return d.status === "handed" ? { text: d.direction === "out" ? "Terkirim" : "Diserahkan", tone: p.s_ok } : { text: "Menunggu", tone: p.s_wait };
  return d.status === "done" ? { text: "Selesai", tone: p.s_off } : { text: "Terkonfirmasi", tone: p.s_ok };
}
const dt = (ts?: string | null) => (ts ? new Date(ts).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(".", ":") : "–");
const longDate = (iso?: string) => fmtDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function Barcode({ text }: { text: string }) {
  const bits = useMemo(() => code128(text), [text]);
  const q = 10; // zona sepi kiri-kanan
  return (
    <svg className={p.barcode} viewBox={`0 0 ${bits.length + q * 2} 40`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${text}`}>
      <rect width="100%" height="100%" fill="#fff" />
      {[...bits].map((b, i) => (b === "1" ? <rect key={i} x={i + q} y="0" width="1" height="40" fill="#0b1b3a" /> : null))}
    </svg>
  );
}

export function ProofCard({ data, token, innerRef }: { data: ReceiptData; token?: string; innerRef?: React.Ref<HTMLDivElement> }) {
  const kindKey = data.kind === "parcel" ? (data.direction === "out" ? "out" : "in") : data.kind;
  const stamp = stampOf(data);
  return (
    <div ref={innerRef} className={`${p.ticket} ${p["k_" + kindKey]}`}>
      <div className={p.top}>
        <div className={p.brand}>
          <img src="/logo.png" alt="" />
          <div><b>Facility Management</b><small>Bukti Permintaan</small></div>
        </div>
        <span className={p.kind}>{KIND_LABEL[kindKey]}</span>
        <div className={p.no}>{data.receipt_no}</div>
        <div className={p.issued}>Diterbitkan {dt(data.created_at)}{data.created_by ? ` · oleh ${data.created_by}` : ""}</div>
      </div>
      <span className={`${p.stamp} ${stamp.tone}`}>{stamp.text}</span>

      <div className={p.body}>
        {data.kind === "wifi" && <WifiBody d={data} />}
        {data.kind === "parcel" && <ParcelBody d={data} />}
        {data.kind === "booking" && <BookingBody d={data} />}
      </div>

      <div className={p.tear} aria-hidden="true"><i /><i /></div>
      <div className={p.foot}>
        <Barcode text={data.receipt_no} />
        <div className={p.code}>{data.receipt_no}</div>
        {token ? <div className={p.verify}>Kode verifikasi <b>{verifyCode(token)}</b></div> : null}
        <div className={p.legal}>Dokumen elektronik CIKOPS — sah tanpa tanda tangan.</div>
      </div>
    </div>
  );
}

function WifiBody({ d }: { d: ReceiptData }) {
  const total = d.start_date && d.end_date ? daysBetween(d.start_date, d.end_date) + 1 : 1;
  const used = d.start_date ? Math.min(total, Math.max(0, daysBetween(d.start_date, todayISO()) + 1)) : 0;
  return (
    <>
      <p className={p.hello}>Halo <b>{d.requestor_name}</b>, akses wifi untuk tamu Anda sudah siap. Berikan data di bawah ini kepada tamu.</p>
      <div className={p.creds}>
        {d.ssid ? <div className={p.cred}><span className={p.lbl}>Wifi</span><b>{d.ssid}</b></div> : null}
        <div className={p.cred}><span className={p.lbl}>User</span><b>{d.username}</b></div>
        <div className={p.cred}><span className={p.lbl}>Password</span>{d.password ? <b>{d.password}</b> : <span className={p.credHidden}>disembunyikan — akses sudah berakhir</span>}</div>
      </div>
      <div className={p.grid}>
        <div><span className={p.lbl}>Tamu</span><div className={p.val}>{d.guest_name}</div></div>
        <div><span className={p.lbl}>Instansi</span><div className={p.val}>{d.guest_company || "–"}</div></div>
        <div><span className={p.lbl}>Departemen</span><div className={p.val}>{d.department || "–"}</div></div>
        <div><span className={p.lbl}>Perangkat</span><div className={p.val}>{d.slots ?? 1}<span className={p.devices}>{Array.from({ length: d.slots ?? 1 }, (_, i) => <i key={i} />)}</span></div></div>
      </div>
      <div className={p.validity}>
        <div className={p.vRow}><span>Mulai <b>{fmtDate(d.start_date)}</b></span><span>Berlaku sampai <b>{fmtDate(d.end_date)}</b></span></div>
        <div className={p.bar}><i style={{ width: `${d.status === "active" ? Math.max(6, (used / total) * 100) : 100}%` }} /></div>
        <div className={p.vRow}><span>{total} hari</span><span>{d.status === "active" ? `hari ke-${Math.max(used, 1)}` : d.status === "returned" ? `dikembalikan ${dt(d.returned_at)}` : "masa pakai selesai"}</span></div>
      </div>
      {d.terms ? <ol className={p.terms}>{d.terms.split(/\r?\n/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x.replace(/^\d+[.)]\s*/, "")}</li>)}</ol> : null}
    </>
  );
}

function ParcelBody({ d }: { d: ReceiptData }) {
  const isIn = d.direction !== "out";
  return (
    <>
      <p className={p.hello}>{isIn ? <>Kiriman untuk <b>{d.recipient}</b> {d.status === "handed" ? "sudah diambil." : "menunggu di meja resepsionis. Tunjukkan bukti ini saat mengambil."}</> : <>Kiriman dari <b>{d.sender}</b> {d.status === "handed" ? "sudah diserahkan ke kurir." : "menunggu diambil kurir."}</>}</p>
      <div className={p.flow}>
        <div className={p.party}><span className={p.lbl}>Dari</span><b>{d.sender || "–"}</b>{!isIn && d.department ? <small>{d.department}</small> : null}</div>
        <span className={p.arrow}>→</span>
        <div className={p.party}><span className={p.lbl}>Untuk</span><b>{d.recipient || "–"}</b>{isIn && d.department ? <small>{d.department}</small> : null}</div>
      </div>
      <div className={p.grid}>
        <div><span className={p.lbl}>Jenis</span><div className={p.val}>{d.item_type}</div></div>
        <div><span className={p.lbl}>Kurir / ekspedisi</span><div className={p.val}>{d.courier || "–"}</div></div>
        {d.description ? <div className={p.full}><span className={p.lbl}>Keterangan</span><div className={p.val}>{d.description}</div></div> : null}
      </div>
      <ol className={p.steps}>
        <li className={p.done}><b>Dicatat resepsionis</b><span>{dt(d.created_at)}</span></li>
        <li className={d.status === "handed" ? p.done : ""}><b>{isIn ? `Diambil${d.handed_to ? ` oleh ${d.handed_to}` : ""}` : `Diserahkan ke kurir${d.handed_to ? ` (${d.handed_to})` : ""}`}</b><span>{d.status === "handed" ? dt(d.handed_at) : "menunggu"}</span></li>
      </ol>
    </>
  );
}

function BookingBody({ d }: { d: ReceiptData }) {
  const day = d.date ? new Date(d.date + "T00:00:00") : new Date();
  return (
    <>
      <p className={p.hello}>Booking <b>{d.room}</b> untuk <b>{d.pic || "Anda"}</b> sudah tercatat dan otomatis masuk Kalender &amp; Agenda.</p>
      <div className={p.when}>
        <div className={p.cal}><small>{day.toLocaleDateString("id-ID", { month: "short" })}</small><b>{day.getDate()}</b><span>{day.toLocaleDateString("id-ID", { weekday: "long" })}</span></div>
        <div><div className={p.time}>{d.start} – {d.end}</div><div className={p.room}>{d.room} · {longDate(d.date)}</div></div>
      </div>
      <div className={p.grid}>
        <div className={p.full}><span className={p.lbl}>Keperluan</span><div className={p.val}>{d.title}</div></div>
        <div><span className={p.lbl}>PIC</span><div className={p.val}>{d.pic || "–"}</div></div>
        <div><span className={p.lbl}>Departemen</span><div className={p.val}>{d.department || "–"}</div></div>
        <div><span className={p.lbl}>Peserta</span><div className={p.val}>{d.attendees ? `${d.attendees} orang` : "–"}</div></div>
        {d.series ? <div><span className={p.lbl}>Berulang</span><div className={p.val}>{d.series.count}× · {fmtDate(d.series.first, { day: "numeric", month: "short" })} – {fmtDate(d.series.last, { day: "numeric", month: "short" })}</div></div> : null}
        {d.notes ? <div className={p.full}><span className={p.lbl}>Catatan</span><div className={p.val}>{d.notes}</div></div> : null}
      </div>
    </>
  );
}

/** Cetak tiket di jendela terpisah (gaya ikut disalin) — hasil cetak hanya tiketnya. */
export function printTicket(el: HTMLElement | null, title: string) {
  if (!el) return;
  const w = window.open("", "_blank", "width=560,height=860");
  if (!w) { alert("Izinkan pop-up untuk mencetak bukti."); return; }
  // Salin ISI aturan CSS (bukan <link>) supaya jendela cetak langsung bergaya tanpa memuat ulang file.
  const inline: string[] = [], links: string[] = [];
  for (const sh of [...document.styleSheets]) {
    try {
      const base = sh.href ?? window.location.href;
      // url(...) relatif (font, gambar) dihitung dari lokasi stylesheet aslinya
      const abs = (css: string) => css.replace(/url\((['"]?)(?!data:|https?:|blob:|#)([^'")]+)\1\)/g, (_m, q: string, u: string) => `url(${q}${new URL(u, base).href}${q})`);
      inline.push([...sh.cssRules].map((rule) => abs(rule.cssText)).join("\n"));
    }
    catch { if (sh.href) links.push(`<link rel="stylesheet" href="${sh.href}">`); } // lembar lintas-domain (mis. font)
  }
  const styles = `${links.join("")}<style>${inline.join("\n")}</style>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${title}</title>${styles}
    <style>html,body{background:#fff!important;margin:0}body{padding:24px}.${p.tear} i{background:#fff!important}.${p.ticket}{box-shadow:0 0 0 1px #e3e8f3!important}@page{size:A5;margin:10mm}@media print{body{padding:0}}</style></head>
    <body>${el.outerHTML}</body></html>`);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  if (w.document.readyState === "complete") setTimeout(go, 500); else w.addEventListener("load", () => setTimeout(go, 300));
}

/** Pratinjau bukti + cara mengirimnya ke requestor. */
export function ProofModal({ data, token, email, phone, onEmail, onClose }: {
  data: ReceiptData; token?: string; email?: string; phone?: string; onEmail?: () => Promise<void>; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const link = token ? receiptUrl(token) : "";
  const kindText = data.kind === "wifi" ? "akses wifi tamu" : data.kind === "parcel" ? "barang/surat" : "booking ruangan";
  const waText = `Bukti Permintaan ${data.receipt_no} (${kindText})${link ? `\nLihat & cetak: ${link}` : ""}`;
  const waPhone = (phone ?? "").replace(/\D/g, "").replace(/^0/, "62");
  async function copy() {
    try { await navigator.clipboard.writeText(link || data.receipt_no); setMsg({ ok: true, text: link ? "Tautan bukti disalin." : "Nomor disalin." }); }
    catch { setMsg({ ok: false, text: "Gagal menyalin." }); }
  }
  async function sendEmail() {
    if (!onEmail) return;
    setBusy(true); setMsg(null);
    try { await onEmail(); setMsg({ ok: true, text: `Email bukti terkirim ke ${email}.` }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={520}>
      <div className={r.modal} style={{ background: "var(--surface2)" }} role="dialog" aria-modal="true" aria-labelledby="rcp-proof-title">
        <div className={r.modalHead}>
          <div><h2 id="rcp-proof-title">Bukti Permintaan</h2><p>Kirim atau cetak untuk requestor</p></div>
          <button type="button" className={r.iconBtn} onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div style={{ ["--hole" as string]: "var(--surface2)" }}><ProofCard data={data} token={token} innerRef={ref} /></div>
        {!token && <div className={r.warn}>Tautan publik belum tersedia — jalankan supabase/01_dasar.sql (bagian 033). Cetak tetap bisa.</div>}
        {msg && <div className={msg.ok ? r.ok : r.err}>{msg.text}</div>}
        <div className={r.proofActions}>
          <button type="button" className={r.btn} onClick={() => printTicket(ref.current, data.receipt_no)}>🖨 Cetak</button>
          <button type="button" className={r.ghost} onClick={copy}>🔗 Salin tautan</button>
          <a className={r.ghost} href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>💬 WhatsApp</a>
          {onEmail && email ? <button type="button" className={r.ghost} disabled={busy} onClick={sendEmail}>{busy ? "Mengirim…" : "✉ Email"}</button> : null}
        </div>
      </div>
    </ModalPortal>
  );
}
