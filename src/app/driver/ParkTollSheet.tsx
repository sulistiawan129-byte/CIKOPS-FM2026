"use client";

import { useState } from "react";
import s from "@/components/fieldapp/fieldapp.module.css";
import { Sheet } from "@/components/fieldapp/FieldKit";
import { FORM_NOTE, FORM_PER_SHEET, FORM_TITLE, downloadParkTollForm } from "@/lib/driverForms";

/* Lembar unduh "Form Parkir & Toll Manual" (PDF A4, 10 form per lembar) di aplikasi driver. */
export default function ParkTollSheet({ L, onClose }: { L: (id: string, en: string) => string; onClose: () => void }) {
  const [sheets, setSheets] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function download() {
    setBusy(true); setErr("");
    try { await downloadParkTollForm(sheets); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  const line = { flex: 1, borderBottom: "1px dotted #8a8f98", height: 11, marginBottom: 2 } as const;
  const row = { display: "flex", alignItems: "flex-end", gap: 6, fontSize: 12, marginTop: 6 } as const;
  const lab = { width: 74, fontWeight: 700 } as const;
  const box = { display: "inline-block", width: 10, height: 10, border: "1.5px solid #333", marginRight: 4, verticalAlign: "-1px" } as const;

  return (
    <Sheet onClose={() => { if (!busy) onClose(); }} label={L("Form Parkir & Toll Manual", "Manual Parking & Toll Form")}>
      <div className={s.stack}>
        <div className={s.cardHead}><h3>{L("Form Parkir & Toll Manual", "Manual Parking & Toll Form")}</h3><span>PDF · A4</span></div>
        <p className={s.muted}>{L("Cetak, isi dengan tangan saat transaksi parkir / toll tidak punya struk elektronik, lalu lampirkan bukti transaksinya. Satu lembar A4 berisi 10 form — gunting di garis putus-putus.", "Print it, fill it in by hand when a parking / toll transaction has no electronic receipt, then attach the proof. One A4 sheet holds 10 forms — cut along the dashed lines.")}</p>

        {/* pratinjau satu form */}
        <div style={{ border: "1.5px dashed #8a8f98", borderRadius: 8, padding: "10px 14px 8px", background: "#fff", color: "#111", maxWidth: 360, margin: "0 auto", width: "100%" }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>{FORM_TITLE}</div>
          <div style={{ borderTop: "2px solid #333", borderBottom: "2px solid #333", height: 4, margin: "3px 0 6px" }} />
          <div style={row}><span style={lab}>Tanggal Trx</span>:<span style={{ ...line, color: "#b0b4bb", fontSize: 9 }}>&nbsp;DD / MM / YYYY</span></div>
          <div style={row}><span style={lab}>Jenis Trx</span>:<span><i style={box} />Parkir &nbsp;&nbsp;<i style={box} />Toll</span></div>
          <div style={row}><span style={lab}>Nominal</span>:<b>Rp</b><span style={line} /></div>
          <div style={row}><span style={lab}>Lokasi</span>:<span style={line} /></div>
          <div style={row}><span style={lab}>Jam</span>:<span style={{ ...line, flex: "0 0 90px", color: "#b0b4bb", fontSize: 9 }}>&nbsp;JJ : MM</span><span style={{ fontSize: 10, color: "#666" }}>WIB</span></div>
          <div style={{ marginTop: 9, fontSize: 11, fontStyle: "italic" }}><b>Note :</b> {FORM_NOTE}</div>
        </div>

        <div className={s.fLabel}>{L("Jumlah lembar", "Number of sheets")}</div>
        <div className={s.seg}>
          {[1, 2, 3, 5].map((n) => (
            <button key={n} type="button" className={sheets === n ? s.segActive : ""} onClick={() => setSheets(n)}>{n} {L("lembar", n === 1 ? "sheet" : "sheets")}</button>
          ))}
        </div>
        <p className={s.muted} style={{ margin: 0 }}>{L("Total", "Total")}: <b>{sheets * FORM_PER_SHEET}</b> form</p>
        {err && <div className={s.errBox} style={{ margin: 0 }}>{err}</div>}
        <button type="button" className={s.primaryBtn} onClick={download} disabled={busy}>{busy ? L("Membuat PDF…", "Building PDF…") : `📄 ${L("Unduh PDF", "Download PDF")}`}</button>
        <button type="button" className={s.ghostBtn} onClick={onClose} disabled={busy}>{L("Tutup", "Close")}</button>
      </div>
    </Sheet>
  );
}
