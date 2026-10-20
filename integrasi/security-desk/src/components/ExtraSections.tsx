"use client";
/**
 * Bagian tambahan halaman Kejadian & patroli (tabel dari laporan_cikops.sql):
 * transporter bulanan, kunjungan team support pengamanan, dan issue area.
 * Semua angka ini juga dibaca CIKOPS (FM) untuk laporan manajemen.
 */
import { useRef, useState } from "react";
import { useApp } from "@/components/AppContext";
import { EXTRA_CATS, INC_CATS, TEAM_KEYS, fmt } from "@/lib/constants";
import { monthEnd } from "@/lib/dates";
import { api, debounced } from "@/lib/data";
import { useDrafts } from "@/lib/useDrafts";
import type { AreaIssue, MonthExtra } from "@/lib/types";

const shortDate = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}`; };

export function ExtraSections() {
  const { D, setD, siteId, canWrite, toast, fail } = useApp();
  const { set, clear, val } = useDrafts();
  const Dref = useRef(D);
  Dref.current = D;
  const [day, setDay] = useState("");
  const [cat, setCat] = useState(INC_CATS[3]);
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<AreaIssue["status"]>("Open");

  if (!D) return null;
  if (!D.extraReady) {
    return (
      <section className="sec">
        <h2>Transporter, kunjungan & issue area</h2>
        <p className="sub">Bagian ini aktif setelah admin menjalankan <b>supabase/laporan_cikops.sql</b> di Supabase.</p>
      </section>
    );
  }

  const tot = (k: (typeof EXTRA_CATS)[number]["k"]) => D.extraDaily[k].reduce((a, b) => a + b, 0);

  function patch(p: Partial<MonthExtra>, key: string, raw: string) {
    if (!siteId || !D) return;
    set(key, raw);
    const next = { ...D.extra, ...p, team: { ...D.extra.team, ...(p.team || {}) } };
    setD((x) => x && { ...x, extra: next });
    const month = D.month;
    debounced("extra", async () => { await api.setMonthExtra(siteId, month, Dref.current?.extra ?? next); clear(key); }, 500, fail);
  }
  const n = (raw: string) => Math.max(0, parseInt(raw) || 0);

  async function addIssue() {
    if (!siteId || !D || !desc.trim()) return;
    const d = day || (new Date().toISOString().slice(0, 7) === D.month.slice(0, 7) ? new Date().toISOString().slice(0, 10) : D.month);
    try { await api.addIssue(siteId, { day: d, category: cat, description: desc.trim(), status }); setDesc(""); toast("Issue area ditambahkan"); } catch (e) { fail(e as Error); }
  }
  function toggle(i: AreaIssue) {
    const s: AreaIssue["status"] = i.status === "Open" ? "Close" : "Open";
    setD((x) => x && { ...x, issues: x.issues.map((y) => (y.id === i.id ? { ...y, status: s } : y)) });
    api.updateIssue(i.id, { status: s }).catch(fail);
  }

  const open = D.issues.filter((i) => i.status === "Open").length;

  return (
    <>
      <fieldset className="sec ro" disabled={!canWrite}>
        <div><h2>Transporter & biomas</h2><p className="sub">Jumlah harian diisi di menu Data harian. Di sini cukup dua angka bulanan.</p></div>
        <div className="totals">
          {EXTRA_CATS.map((c) => <div className="tot" key={c.k}><div className="num">{fmt(tot(c.k))}</div><div className="l">{c.n}</div></div>)}
        </div>
        <div className="pat">
          <div><label htmlFor="x-sel">Selisih timbang ≥ 40 kg</label><input id="x-sel" type="number" min={0} value={val("x:sel", D.extra.selisih_timbang)} onChange={(e) => patch({ selisih_timbang: n(e.target.value) }, "x:sel", e.target.value)} /></div>
          <div><label htmlFor="x-po">dari kendaraan Palm Oil / Fat Blend</label><input id="x-po" type="number" min={0} value={val("x:po", D.extra.palm_oil)} onChange={(e) => patch({ palm_oil: n(e.target.value) }, "x:po", e.target.value)} /></div>
        </div>
      </fieldset>

      <fieldset className="sec ro" disabled={!canWrite}>
        <div><h2>Kunjungan team support pengamanan</h2><p className="sub">Jumlah kunjungan per kelompok bulan ini, plus siapa saja yang berkunjung.</p></div>
        <div className="pat">
          {TEAM_KEYS.map((k) => (
            <div key={k}><label htmlFor={`t-${k}`}>{k}</label><input id={`t-${k}`} type="number" min={0} value={val(`t:${k}`, D.extra.team[k] ?? 0)} onChange={(e) => patch({ team: { [k]: n(e.target.value) } }, `t:${k}`, e.target.value)} /></div>
          ))}
        </div>
        <label htmlFor="t-note" style={{ display: "block", fontSize: 13, fontWeight: 600, margin: "4px 0 6px" }}>Catatan kunjungan</label>
        <textarea id="t-note" className="inline" value={val("t:note", D.extra.team_note)} placeholder="mis. External: BHABINSA, Polsek … · G4S: Supervisor Area, OH …" onChange={(e) => patch({ team_note: e.target.value }, "t:note", e.target.value)} />
      </fieldset>

      <fieldset className="sec ro" disabled={!canWrite}>
        <div><h2>Issue area</h2><p className="sub">{D.issues.length ? `${D.issues.length} issue bulan ini, ${open} masih open. Klik status untuk mengubah.` : "Belum ada issue area bulan ini."}</p></div>
        {D.issues.length > 0 && (
          <ul className="rows isl">
            {D.issues.map((i) => (
              <li key={i.id}>
                <b>{shortDate(i.day)}</b>
                <span className="sub" style={{ margin: 0 }}>{i.category}</span>
                <span>{i.description}</span>
                <button type="button" className={`btn ${i.status === "Open" ? "red" : "q"}`} onClick={() => toggle(i)}>{i.status}</button>
                <button type="button" className="btn q" aria-label="Hapus issue" onClick={() => api.deleteIssue(i.id).then(() => toast("Issue dihapus")).catch(fail)}>Hapus</button>
              </li>
            ))}
          </ul>
        )}
        <div className="issue-add">
          <input type="date" className="inline" aria-label="Tanggal" value={day} min={D.month} max={monthEnd(D.month)} onChange={(e) => setDay(e.target.value)} />
          <select className="inline" aria-label="Jenis" value={cat} onChange={(e) => setCat(e.target.value)}>{INC_CATS.map((c) => <option key={c}>{c}</option>)}</select>
          <input className="inline" placeholder="Deskripsi singkat…" aria-label="Deskripsi" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIssue()} />
          <select className="inline" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as AreaIssue["status"])}><option>Open</option><option>Close</option></select>
          <button type="button" className="btn red" onClick={addIssue}>+ Tambah</button>
        </div>
      </fieldset>
    </>
  );
}
