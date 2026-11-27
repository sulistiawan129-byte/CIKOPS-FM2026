"use client";

/* IMPOR DATA KLAIM LAMA — tempel dari Excel (atau pilih file .xlsx), cek pratinjau, lalu impor.
   Baris dengan driver + tanggal pengajuan + periode yang sama digabung menjadi satu klaim. */

import { useEffect, useMemo, useState } from "react";
import cs from "./claims.module.css";
import is from "./claimsImport.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { fmtRp } from "./dashboardShared";
import { getAllDriversFull, type MyProfile } from "@/lib/api";
import {
  buildDrafts, matchDriver, normName, parseSheetRows, parseSheetText, summarizeByMonth, type DriverLite, type MonthBy,
} from "@/lib/claimImport";
import { countImported, deleteImported, importMarker, insertDrafts } from "@/lib/claimImportApi";
import { monthName } from "@/lib/driverClaimRecap";

async function readXlsx(file: File): Promise<unknown[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const out: unknown[][] = [];
  if (!ws) return out;
  const val = (v: unknown): unknown => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
      if (o.result !== undefined) return o.result;
      if (o.richText) return o.richText.map((r) => r.text).join("");
      if (o.text !== undefined) return o.text;
    }
    return v;
  };
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells = (row.values as unknown[]).slice(1).map(val);
    out.push(cells);
  });
  return out;
}

export function ClaimsImport({ lang, myProfile, onClose, onImported }: { lang: string; myProfile: MyProfile | null; onClose: () => void; onImported: () => void }) {
  const en = lang === "en";
  const [text, setText] = useState("");
  const [fileTable, setFileTable] = useState<{ name: string; table: unknown[][] } | null>(null);
  const [drivers, setDrivers] = useState<DriverLite[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [monthBy, setMonthBy] = useState<MonthBy>("start");
  const [label, setLabel] = useState("");
  const [existing, setExisting] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    getAllDriversFull(myProfile?.plantScope ?? null).then((l) => setDrivers(l.map((d) => ({ id: d.id, nama: d.nama, aktif: d.aktif })))).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [myProfile?.plantScope]);

  const parsed = useMemo(() => (fileTable ? parseSheetRows(fileTable.table) : parseSheetText(text)), [text, fileTable]);

  // penanda default = tahun pengajuan terbanyak
  const autoLabel = useMemo(() => {
    const c = new Map<string, number>();
    parsed.rows.forEach((r) => { const y = r.submission.slice(0, 4); c.set(y, (c.get(y) ?? 0) + 1); });
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [parsed]);
  useEffect(() => { if (autoLabel && !label) setLabel(autoLabel); }, [autoLabel, label]);
  const marker = importMarker(label || autoLabel || "LAMA");

  // pencocokan nama driver (bisa diubah per nama)
  const names = useMemo(() => {
    const m = new Map<string, { raw: string; rows: number; amount: number }>();
    parsed.rows.forEach((r) => { const k = normName(r.driverRaw); const cur = m.get(k) ?? { raw: r.driverRaw, rows: 0, amount: 0 }; cur.rows++; cur.amount += r.amount; m.set(k, cur); });
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amount - a.amount);
  }, [parsed]);
  useEffect(() => {
    if (!drivers.length) return;
    setMap((prev) => {
      const next: Record<string, string> = {};
      names.forEach((n) => { next[n.key] = n.key in prev ? prev[n.key] : matchDriver(n.raw, drivers).id; });
      return next;
    });
  }, [names, drivers]);

  const { drafts, skippedRows } = useMemo(() => buildDrafts(parsed.rows, map, monthBy, marker), [parsed, map, monthBy, marker]);
  const months = useMemo(() => summarizeByMonth(drafts), [drafts]);
  const grand = months.reduce((s, m) => ({ claims: s.claims + m.claims, items: s.items + m.items, gasoline: s.gasoline + m.gasoline, toll: s.toll + m.toll, parking: s.parking + m.parking, others: s.others + m.others, total: s.total + m.total }), { claims: 0, items: 0, gasoline: 0, toll: 0, parking: 0, others: 0, total: 0 });
  const badPeriod = parsed.rows.filter((r) => !r.periodOk).length;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { countImported(marker).then((n) => { if (alive) setExisting(n); }).catch(() => { if (alive) setExisting(0); }); }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [marker]);

  async function pickFile(f: File | null) {
    setError(""); setDone("");
    if (!f) { setFileTable(null); return; }
    try {
      if (/\.xlsx$/i.test(f.name)) setFileTable({ name: f.name, table: await readXlsx(f) });
      else { setFileTable(null); setText(await f.text()); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function run() {
    setError(""); setDone("");
    const msg = existing > 0
      ? `Sudah ada ${existing} klaim dengan penanda ${marker}. Klaim itu akan DIHAPUS lalu diganti ${drafts.length} klaim baru. Lanjutkan?`
      : `Impor ${drafts.length} klaim (Rp ${fmtRp(grand.total)}) ke sistem?`;
    if (!window.confirm(en ? msg : msg)) return;
    try {
      if (existing > 0) { setBusy("Menghapus impor sebelumnya…"); await deleteImported(marker); }
      setBusy("Menyimpan…");
      const n = await insertDrafts(drafts, (d, t) => setBusy(`Menyimpan… ${d}/${t}`));
      setExisting(await countImported(marker).catch(() => n));
      setDone(`Selesai: ${n} klaim (Rp ${fmtRp(grand.total)}) tersimpan dengan penanda ${marker}. Lihat hasilnya di tab "Rekap per driver".`);
      onImported();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function undo() {
    if (!window.confirm(`Hapus ${existing} klaim dengan penanda ${marker}? Klaim lain tidak tersentuh.`)) return;
    setError(""); setDone(""); setBusy("Menghapus…");
    try { await deleteImported(marker); setExisting(0); setDone(`Impor ${marker} dibatalkan.`); onImported(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const hasData = parsed.rows.length > 0;
  const unmatched = names.filter((n) => !map[n.key]).length;

  return (
    <ModalPortal onOverlayClick={() => { if (!busy) onClose(); }} maxWidth={980}>
      <div className={is.wrap}>
        <div className={is.head}>
          <h2>{en ? "Import old claim data" : "Impor data klaim lama"}</h2>
          <p>Tempel data dari Excel (kolom: Week, Tanggal Pengajuan, Periode Klaim, Nama Driver, Jenis Klaim, Nominal, Keterangan) atau pilih file Excel.</p>
        </div>

        <div className={is.body}>
          <div>
            <label className={is.label} htmlFor="imp-text">Data</label>
            <textarea id="imp-text" className={is.area} value={fileTable ? "" : text} disabled={!!fileTable} placeholder={"Week\tTanggal Pengajuan\tPeriode Klaim\tNama Driver\tJenis Klaim\tNominal\tKeterangan\n\t2-May-2025\t1 - 7 Mei 2025\tMohamad Amin\tToll\t Rp16.500\t"} onChange={(e) => { setText(e.target.value); setDone(""); }} />
            <p className={is.hint}>
              {fileTable ? <>Memakai file <b>{fileTable.name}</b> · <button type="button" className={cs.ghost} onClick={() => setFileTable(null)}>pakai teks tempel</button></> : <>Salin seluruh tabel dari Excel lalu tempel di sini (baris judul boleh ikut), atau: <input className={is.file} type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} /></>}
            </p>
          </div>

          <div className={is.row}>
            <label className={is.col}>
              <span className={is.label}>Bulan laporan mengikuti</span>
              <select className={is.field} value={monthBy} onChange={(e) => setMonthBy(e.target.value as MonthBy)}>
                <option value="start">Tanggal mulai periode klaim</option>
                <option value="end">Tanggal akhir periode klaim</option>
                <option value="submission">Tanggal pengajuan</option>
              </select>
            </label>
            <label className={is.col}>
              <span className={is.label}>Penanda impor</span>
              <input className={is.field} style={{ width: 140 }} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} aria-label="Penanda impor" />
            </label>
            <span className={is.hint} style={{ alignSelf: "center" }}>Catatan tiap klaim diawali <b>{marker}</b> sehingga impor ini bisa diganti atau dibatalkan.</span>
          </div>

          {hasData && (
            <>
              <div className={is.stats}>
                <div className={is.stat}><small>BARIS TERBACA</small><b>{parsed.rows.length}</b></div>
                <div className={is.stat}><small>KLAIM YANG DIBUAT</small><b>{drafts.length}</b></div>
                <div className={is.stat}><small>TOTAL NOMINAL</small><b>Rp {fmtRp(grand.total)}</b></div>
                <div className={`${is.stat} ${skippedRows ? is.warn : ""}`}><small>BARIS DILEWATI (DRIVER)</small><b>{skippedRows}</b></div>
                <div className={`${is.stat} ${parsed.issues.length ? is.bad : ""}`}><small>BARIS BERMASALAH</small><b>{parsed.issues.length}</b></div>
              </div>

              {existing > 0 && <div className={is.notice}>Sudah ada <b>{existing} klaim</b> dengan penanda <b>{marker}</b>. Bila Anda mengimpor lagi, klaim itu <b>diganti</b> (dihapus lalu dimasukkan ulang). Klaim lain tidak tersentuh.</div>}
              {badPeriod > 0 && <div className={is.notice}>{badPeriod} baris punya periode yang tidak terbaca; tanggal pengajuan dipakai sebagai periodenya.</div>}

              <div className={is.box}>
                <h4>Nama driver di data ↔ driver di sistem {unmatched ? <span className={`${is.pill} ${is.no}`}>{unmatched} belum dipilih</span> : null}</h4>
                <div className={is.scroll}>
                  <table className={is.tbl}>
                    <thead><tr><th>Nama di data</th><th className={is.n}>Baris</th><th className={is.n}>Nominal</th><th>Driver di sistem</th><th>Status</th></tr></thead>
                    <tbody>
                      {names.map((n) => {
                        const m = matchDriver(n.raw, drivers);
                        const sel = map[n.key] ?? "";
                        const kind = !sel ? "none" : sel === m.id ? m.kind : "exact";
                        return (
                          <tr key={n.key}>
                            <td><b>{n.raw}</b></td>
                            <td className={is.n}>{n.rows}</td>
                            <td className={is.n}>{fmtRp(n.amount)}</td>
                            <td>
                              <select className={is.field} value={sel} onChange={(e) => setMap((p) => ({ ...p, [n.key]: e.target.value }))} aria-label={`Driver untuk ${n.raw}`}>
                                <option value="">(lewati baris ini)</option>
                                {drivers.slice().sort((a, b) => a.nama.localeCompare(b.nama)).map((d) => <option key={d.id} value={d.id}>{d.nama}{d.aktif === false ? " (nonaktif)" : ""}</option>)}
                              </select>
                            </td>
                            <td><span className={`${is.pill} ${kind === "exact" ? is.ok : kind === "fuzzy" ? is.fz : is.no}`}>{kind === "exact" ? "cocok" : kind === "fuzzy" ? "mirip — cek" : "belum dipilih"}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={is.box}>
                <h4>Ringkasan per bulan (untuk dicocokkan dengan total di Excel Anda)</h4>
                <div className={is.scroll}>
                  <table className={is.tbl}>
                    <thead><tr><th>Bulan</th><th className={is.n}>Klaim</th><th className={is.n}>Gasoline</th><th className={is.n}>Toll</th><th className={is.n}>Parkir</th><th className={is.n}>Lainnya</th><th className={is.n}>Total (Rp)</th></tr></thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.key}>
                          <td><b>{monthName(Number(m.key.slice(5, 7)) - 1, "id")} {m.key.slice(0, 4)}</b></td>
                          <td className={is.n}>{m.claims}</td>
                          <td className={is.n}>{fmtRp(m.gasoline)}</td><td className={is.n}>{fmtRp(m.toll)}</td><td className={is.n}>{fmtRp(m.parking)}</td><td className={is.n}>{fmtRp(m.others)}</td>
                          <td className={is.n}><b>{fmtRp(m.total)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>Total</td><td className={is.n}>{grand.claims}</td><td className={is.n}>{fmtRp(grand.gasoline)}</td><td className={is.n}>{fmtRp(grand.toll)}</td><td className={is.n}>{fmtRp(grand.parking)}</td><td className={is.n}>{fmtRp(grand.others)}</td><td className={is.n}>{fmtRp(grand.total)}</td></tr></tfoot>
                  </table>
                </div>
              </div>

              {parsed.issues.length > 0 && (
                <div className={is.box}>
                  <h4>Baris yang tidak bisa dibaca (tidak ikut diimpor)</h4>
                  <div className={is.scroll}>
                    <table className={is.tbl}>
                      <thead><tr><th>Baris</th><th>Masalah</th><th>Isi</th></tr></thead>
                      <tbody>{parsed.issues.slice(0, 50).map((i, k) => <tr key={k}><td className={is.n}>{i.line}</td><td>{i.reason}</td><td className={is.issue}>{i.text}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <div className={is.err} role="alert">{error}</div>}
          {done && <div className={is.done} role="status">{done}</div>}
        </div>

        <div className={is.foot}>
          <span className={is.footMsg}>{busy ?? (hasData ? `${drafts.length} klaim siap diimpor · Rp ${fmtRp(grand.total)}` : "Belum ada data yang terbaca")}</span>
          {existing > 0 && <button type="button" className={cs.danger} onClick={undo} disabled={!!busy}>Batalkan impor {marker} ({existing})</button>}
          <button type="button" className={cs.btn} style={{ height: 42 }} onClick={onClose} disabled={!!busy}>Tutup</button>
          <button type="button" className={cs.primary} onClick={run} disabled={!!busy || drafts.length === 0}>{existing > 0 ? "Ganti & impor" : "Impor ke sistem"}</button>
        </div>
      </div>
    </ModalPortal>
  );
}
