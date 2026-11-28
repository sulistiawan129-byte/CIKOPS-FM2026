"use client";

/* LOGBOOK GATE MDC ⇄ FFI — dashboard (Security / Admin GA CIK / Master). Entri datang realtime dari form publik /logbook. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import cs from "./claims.module.css";
import rs from "./claimsRecap.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { ModuleHeader, ModulePage } from "./ModuleShell";
import { deleteLogbook, getLogbook, subscribeLogbook, ARAH_LABEL, type LogbookArah, type LogbookEntry, type LogbookTipe } from "@/lib/logbookApi";
import { exportRecapExcel, exportRecapPdf, type RecapDoc } from "@/lib/driverClaimRecap";
import { isoDaysAgo, type MyProfile } from "@/lib/api";
import { toLocalISODate } from "@/lib/dateUtils";
import { useLang } from "@/lib/providers";
import { L } from "@/lib/i18n";

const PAGE = 100;
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default function LogbookTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const today = toLocalISODate(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [arah, setArah] = useState<"all" | LogbookArah>("all");
  const [tipe, setTipe] = useState<"all" | LogbookTipe>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [live, setLive] = useState<Date | null>(null);
  const [qr, setQr] = useState(false);
  const [busy, setBusy] = useState<"" | "excel" | "pdf">("");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const list = await getLogbook(from, to);
      // tandai entri yang baru masuk (realtime) supaya terlihat sebentar
      if (!first.current) {
        const added = list.filter((r) => !seen.current.has(r.id)).map((r) => r.id);
        if (added.length) { setFresh(new Set(added)); setTimeout(() => setFresh(new Set()), 6000); }
      }
      first.current = false;
      seen.current = new Set(list.map((r) => r.id));
      setRows(list); setErr(""); setLive(new Date());
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { first.current = true; void load(); }, [load]);
  useEffect(() => subscribeLogbook(() => { void load(true); }), [load]);
  useEffect(() => setShown(PAGE), [from, to, arah, tipe, q]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (arah === "all" || r.arah === arah) && (tipe === "all" || r.tipe === tipe)
      && (!needle || [r.nama, r.asal, r.keperluan, r.no].join(" ").toLowerCase().includes(needle)));
  }, [rows, arah, tipe, q]);

  const k = useMemo(() => ({
    total: list.length,
    toFfi: list.filter((r) => r.arah === "mdc_ffi").length,
    toMdc: list.filter((r) => r.arah === "ffi_mdc").length,
    kary: list.filter((r) => r.tipe === "karyawan").length,
    guest: list.filter((r) => r.tipe === "guest").length,
  }), [list]);

  const canDelete = !!myProfile;
  async function remove(r: LogbookEntry) {
    if (!confirm(L(`Hapus catatan ${r.no} (${r.nama})? Gunakan hanya untuk salah input.`, `Delete entry ${r.no} (${r.nama})? Use only for mistaken entries.`))) return;
    try { await deleteLogbook(r.id); await load(true); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }

  const periodLabel = from === to ? dmy(from) : `${dmy(from)} – ${dmy(to)}`;
  function buildDoc(): RecapDoc {
    const scope = [arah !== "all" ? ARAH_LABEL[arah] : "", tipe !== "all" ? (tipe === "guest" ? "Guest" : L("Karyawan", "Employee")) : "", q.trim() ? `"${q.trim()}"` : ""].filter(Boolean).join(" · ");
    return {
      lang: en ? "en" : "id", title: "Logbook Gate MDC - PT. Frisian Flag Indonesia", period: periodLabel, scope: scope || undefined,
      filename: `Logbook_MDC_${from}${from === to ? "" : "_" + to}`, landscape: true,
      sections: [{
        head: ["No", L("Tanggal", "Date"), L("Jam", "Time"), L("Arah", "Direction"), "Tipe", L("Nama", "Name"), L("Departemen / Perusahaan", "Dept / Company"), L("Tujuan / Keperluan", "Purpose")],
        align: ["left", "left", "left", "left", "left", "left", "left", "left"],
        rows: [...list].reverse().map((r) => [r.no, dmy(r.tanggal), r.jam, ARAH_LABEL[r.arah], r.tipe === "guest" ? "Guest" : L("Karyawan", "Employee"), r.nama, r.asal, r.keperluan]),
        total: [L("Total", "Total"), "", "", "", "", `${list.length} ${L("catatan", "entries")}`, "", ""],
      }],
    };
  }
  async function exportAs(kind: "excel" | "pdf") {
    setBusy(kind);
    try { const d = buildDoc(); if (kind === "excel") await exportRecapExcel(d); else await exportRecapPdf(d); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  const quick = (days: number) => { setFrom(isoDaysAgo(days)); setTo(today); };
  const month = () => { setFrom(`${today.slice(0, 8)}01`); setTo(today); };

  return (
    <ModulePage>
      <ModuleHeader kicker={L("Security", "Security")} title={L("Logbook Gate MDC ⇄ FFI", "MDC ⇄ FFI Gate Logbook")}
        desc={L("Catatan keluar-masuk antara area MDC dan FFI dari form publik. Entri baru muncul otomatis.", "In/out entries between the MDC and FFI areas from the public form. New entries appear automatically.")}
        actions={<button type="button" className={cs.btn} onClick={() => setQr(true)}>🔗 {L("Link & QR form", "Form link & QR")}</button>} />

      {err && <div className={cs.empty} role="alert" style={{ marginBottom: 14 }}><b>{L("Gagal memuat logbook", "Failed to load logbook")}</b><p>{err}</p></div>}

      <div className={cs.panel}>
        <div className={rs.controls}>
          <label className={rs.ctl}><span>{L("Dari", "From")}</span><input className={cs.dateIn} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || today)} /></label>
          <label className={rs.ctl}><span>{L("Sampai", "To")}</span><input className={cs.dateIn} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value || today)} /></label>
          <div className={rs.ctl}>
            <span>{L("Cepat", "Quick")}</span>
            <div className={rs.mode} role="group" aria-label={L("Rentang cepat", "Quick range")}>
              <button type="button" aria-pressed={from === today && to === today} onClick={() => quick(0)}>{L("Hari ini", "Today")}</button>
              <button type="button" aria-pressed={from === isoDaysAgo(6) && to === today} onClick={() => quick(6)}>7 {L("hari", "days")}</button>
              <button type="button" aria-pressed={from === `${today.slice(0, 8)}01` && to === today} onClick={month}>{L("Bulan ini", "This month")}</button>
            </div>
          </div>
          <label className={rs.ctl}><span>{L("Arah", "Direction")}</span>
            <select className={cs.select} value={arah} onChange={(e) => setArah(e.target.value as typeof arah)}>
              <option value="all">{L("Semua", "All")}</option><option value="mdc_ffi">{ARAH_LABEL.mdc_ffi}</option><option value="ffi_mdc">{ARAH_LABEL.ffi_mdc}</option>
            </select></label>
          <label className={rs.ctl}><span>{L("Tipe", "Type")}</span>
            <select className={cs.select} value={tipe} onChange={(e) => setTipe(e.target.value as typeof tipe)}>
              <option value="all">{L("Semua", "All")}</option><option value="karyawan">{L("Karyawan", "Employee")}</option><option value="guest">Guest</option>
            </select></label>
          <label className={rs.ctl} style={{ flex: "1 1 180px" }}><span>{L("Cari", "Search")}</span>
            <input className={cs.dateIn} type="search" placeholder={L("Nama, departemen, keperluan…", "Name, department, purpose…")} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        <div className={rs.kpis}>
          <div className={`${rs.kpi} ${rs.kpiMain}`}>
            <span className={rs.kpiLbl}>{L("TOTAL CATATAN", "TOTAL ENTRIES")} · {periodLabel}</span>
            <span className={rs.kpiVal}>{k.total}</span>
            <span className={rs.kpiSub}>{live ? `● Live · ${live.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "…"}</span>
          </div>
          <div className={rs.kpi}><span className={rs.kpiLbl}>MDC → FFI</span><span className={rs.kpiVal}>{k.toFfi}</span><span className={rs.kpiSub}>{L("masuk ke FFI", "into FFI")}</span></div>
          <div className={rs.kpi}><span className={rs.kpiLbl}>FFI → MDC</span><span className={rs.kpiVal}>{k.toMdc}</span><span className={rs.kpiSub}>{L("masuk ke MDC", "into MDC")}</span></div>
          <div className={rs.kpi}><span className={rs.kpiLbl}>{L("Karyawan", "Employees")}</span><span className={rs.kpiVal}>{k.kary}</span><span className={rs.kpiSub}>{L("catatan", "entries")}</span></div>
          <div className={rs.kpi}><span className={rs.kpiLbl}>Guest</span><span className={rs.kpiVal}>{k.guest}</span><span className={rs.kpiSub}>{L("catatan", "entries")}</span></div>
        </div>

        <div className={cs.panelBar} style={{ borderTop: "1px solid var(--border)" }}>
          <h3>{L("Daftar catatan", "Entries")} <small style={{ color: "var(--t3)", fontWeight: 600 }}>({list.length})</small></h3>
          <div className={cs.actions}>
            <button className={`${cs.btn} ${cs.btnGreen}`} onClick={() => exportAs("excel")} disabled={busy !== "" || list.length === 0}>⬇ {busy === "excel" ? "..." : "Excel"}</button>
            <button className={`${cs.btn} ${cs.btnRed}`} onClick={() => exportAs("pdf")} disabled={busy !== "" || list.length === 0}>⬇ {busy === "pdf" ? "..." : "PDF"}</button>
          </div>
        </div>

        {loading ? (
          <div className={cs.empty} style={{ border: 0 }}><span>{L("Memuat…", "Loading…")}</span></div>
        ) : list.length === 0 ? (
          <div className={cs.empty} style={{ border: 0 }}>
            <span className={cs.emptyIc} aria-hidden="true">📒</span>
            <b>{L("Belum ada catatan", "No entries yet")}</b>
            <p>{L("Belum ada yang mengisi form pada rentang ini. Bagikan link/QR form ke karyawan & tamu.", "Nobody has used the form in this range. Share the form link / QR with employees and guests.")}</p>
          </div>
        ) : (
          <div className={cs.tableWrap}>
            <table className={cs.table}>
              <thead><tr>
                <th>{L("Waktu", "Time")}</th><th>{L("Arah", "Direction")}</th><th>{L("Tipe", "Type")}</th><th>{L("Nama", "Name")}</th>
                <th>{L("Departemen / Perusahaan", "Dept / Company")}</th><th>{L("Tujuan / Keperluan", "Purpose")}</th><th>No</th>{canDelete && <th />}
              </tr></thead>
              <tbody>
                {list.slice(0, shown).map((r) => (
                  <tr key={r.id} style={fresh.has(r.id) ? { background: "color-mix(in srgb, var(--green) 14%, transparent)" } : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{dmy(r.tanggal)} <b>{r.jam}</b></td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 700, color: r.arah === "mdc_ffi" ? "var(--brand)" : "var(--orange)" }}>{ARAH_LABEL[r.arah]}</td>
                    <td>{r.tipe === "guest" ? "Guest" : L("Karyawan", "Employee")}</td>
                    <td className={cs.strong}>{r.nama}</td>
                    <td>{r.asal}</td>
                    <td>{r.keperluan}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--t3)", whiteSpace: "nowrap" }}>{r.no}</td>
                    {canDelete && <td><button type="button" className={cs.btn} onClick={() => remove(r)} aria-label={L("Hapus catatan", "Delete entry")} title={L("Hapus (salah input)", "Delete (mistake)")}>🗑️</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > shown && (
              <div style={{ textAlign: "center", padding: 14 }}>
                <button type="button" className={cs.btn} onClick={() => setShown((n) => n + 200)}>{L("Tampilkan lebih banyak", "Show more")} ({list.length - shown})</button>
              </div>
            )}
          </div>
        )}
      </div>

      {qr && <FormQr onClose={() => setQr(false)} />}
    </ModulePage>
  );
}

function FormQr({ onClose }: { onClose: () => void }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/logbook` : "/logbook";
  const [src, setSrc] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc("")); }, [url]);
  function print() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Logbook Gate MDC</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}img{width:340px;height:340px}h1{margin:16px 0 6px;font-size:26px}p{margin:4px 0;color:#444;font-size:16px}code{font-size:14px}</style></head>
      <body><img src="${src}" alt=""><h1>Logbook Gate MDC ⇄ FFI</h1><p>Scan &amp; isi sekali saat melewati gate MDC / FFI</p><p>Scan &amp; fill once when passing the MDC / FFI gate</p><p><code>${url}</code></p>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={400}>
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Logbook Gate MDC ⇄ FFI</h2>
        {src ? <img src={src} alt="QR form logbook" style={{ width: 240, height: 240 }} /> : <div style={{ width: 240, height: 240, margin: "0 auto" }} />}
        <code style={{ display: "block", margin: "10px 0 14px", fontSize: 13, overflowWrap: "anywhere" }}>{url}</code>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className={cs.btn} onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>{copied ? "✓" : "⧉"} {L("Salin link", "Copy link")}</button>
          {src && <a className={cs.btn} href={src} download="QR-Logbook-MDC.png" style={{ textDecoration: "none" }}>{L("Unduh PNG", "Download PNG")}</a>}
          {src && <button type="button" className={cs.btn} onClick={print}>{L("Cetak", "Print")}</button>}
          <button type="button" className={cs.btn} onClick={onClose}>{L("Tutup", "Close")}</button>
        </div>
      </div>
    </ModalPortal>
  );
}
