"use client";

/* ════════════════════════════════════════════════════════════
   ATK / Office Supplies — dashboard, input, stok, riwayat, sinkron Excel.
   Sinkron DUA ARAH dengan Excel/VBA (lihat supabase/01_dasar.sql (bagian 026)
   dan vba/modSyncCikops.bas):
   • Excel → CIKOPS : tombol "Sinkron ke CIKOPS" di Excel.
   • CIKOPS → Excel : input di sini langsung mengubah stok; Excel menarik
                      transaksinya lewat tombol "Tarik dari CIKOPS".
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAtkItems, getAtkRequests, getAtkRestocks, getAtkSyncStatus, rotateAtkSyncKey,
} from "@/lib/api";
import type { MyProfile } from "@/lib/api";
import type { AtkItem, AtkRequest, AtkRestock, AtkSyncStatus } from "@/lib/types";
import { toLocalISODate } from "@/lib/dateUtils";
import { useLang } from "@/lib/providers";
import { exportGenericCsv, exportGenericExcel, exportGenericPdf } from "@/lib/reportEngine";
import type { ReportColumn, ReportLang } from "@/lib/reportEngine";
import s from "./atk.module.css";

import { loc } from "@/lib/i18n";
type Lang = "id" | "en";
type View = "dashboard" | "stock" | "history" | "sync";
type Preset = "thisMonth" | "lastMonth" | "d30" | "m3" | "year" | "custom";

const iso = (d: Date) => toLocalISODate(d);
const parse = (d: string) => new Date(d + "T00:00:00");
const nf = (n: number, lang: Lang) => n.toLocaleString(lang === "en" ? "en-US" : "id-ID", { maximumFractionDigits: 2 });
const DAY = 86400000;

function presetRange(p: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (p) {
    case "thisMonth": return { from: iso(new Date(y, m, 1)), to: iso(now) };
    case "lastMonth": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "d30": return { from: iso(new Date(now.getTime() - 29 * DAY)), to: iso(now) };
    case "m3": return { from: iso(new Date(y, m - 2, 1)), to: iso(now) };
    case "year": return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    default: return custom;
  }
}
/** Periode pembanding dengan panjang yang sama, tepat sebelum `from`. */
function prevOf(from: string, to: string) {
  const len = Math.round((parse(to).getTime() - parse(from).getTime()) / DAY) + 1;
  const pTo = new Date(parse(from).getTime() - DAY);
  return { from: iso(new Date(pTo.getTime() - (len - 1) * DAY)), to: iso(pTo), len };
}
function fmtDate(d: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  return parse(d).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", opts);
}
function fmtDateTime(t: string | null, lang: Lang) {
  if (!t) return "—";
  return new Date(t).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function ago(t: string | null, lang: Lang) {
  if (!t) return lang === "en" ? "never" : "belum pernah";
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
  if (m < 1) return lang === "en" ? "just now" : "baru saja";
  if (m < 60) return lang === "en" ? `${m} min ago` : `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "en" ? `${h} h ago` : `${h} jam lalu`;
  return lang === "en" ? `${Math.round(h / 24)} d ago` : `${Math.round(h / 24)} hari lalu`;
}
function stockState(i: AtkItem): "out" | "low" | "ok" {
  if (i.stok <= 0) return "out";
  if (i.stok <= i.minStok) return "low";
  return "ok";
}

/* ── Transaksi gabungan (1 baris = 1 nomor permintaan / restock) ── */
interface Txn {
  kind: "request" | "restock";
  ref: string;
  tanggal: string;
  nama: string;
  nik: string;
  departemen: string;
  helper: string;
  lines: { kode: string; nama: string; jumlah: number; satuan: string }[];
  qty: number;
  source: "excel" | "web";
  pulled: boolean;
  createdBy: string;
  createdAt: string;
}
function groupTxns(requests: AtkRequest[], restocks: AtkRestock[]): Txn[] {
  const m = new Map<string, Txn>();
  for (const r of requests) {
    const k = "Q" + r.requestId;
    let t = m.get(k);
    if (!t) { t = { kind: "request", ref: r.requestId, tanggal: r.tanggal, nama: r.nama, nik: r.nik, departemen: r.departemen, helper: r.helper, lines: [], qty: 0, source: r.source, pulled: true, createdBy: r.createdBy, createdAt: r.createdAt }; m.set(k, t); }
    t.lines.push({ kode: r.kodeBarang, nama: r.namaBarang, jumlah: r.jumlah, satuan: r.satuan });
    t.qty += r.jumlah;
    t.pulled = t.pulled && r.pulled;
  }
  for (const r of restocks) {
    const k = "S" + r.updateId;
    let t = m.get(k);
    if (!t) { t = { kind: "restock", ref: r.updateId, tanggal: r.tanggal, nama: r.nama, nik: r.nik, departemen: r.departemen, helper: "", lines: [], qty: 0, source: r.source, pulled: true, createdBy: r.createdBy, createdAt: r.createdAt }; m.set(k, t); }
    t.lines.push({ kode: r.kodeBarang, nama: r.namaBarang, jumlah: r.jumlah, satuan: r.satuan });
    t.qty += r.jumlah;
    t.pulled = t.pulled && r.pulled;
  }
  return [...m.values()].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.ref.localeCompare(a.ref));
}

/* ════════════════════════════════════════════════════════════ */
export default function AtkTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang: rawLang } = useLang();
  const lang: Lang = rawLang === "en" ? "en" : "id";
  const L = useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);

  const [view, setView] = useState<View>("dashboard");
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [custom, setCustom] = useState(() => presetRange("thisMonth", { from: "", to: "" }));
  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const prev = useMemo(() => prevOf(range.from, range.to), [range]);

  const [items, setItems] = useState<AtkItem[]>([]);
  const [requests, setRequests] = useState<AtkRequest[]>([]); // prev.from .. range.to
  const [restocks, setRestocks] = useState<AtkRestock[]>([]);
  const [sync, setSync] = useState<AtkSyncStatus | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const errs: string[] = [];
    await Promise.all([
      getAtkItems().then(setItems).catch((e) => errs.push(`${L("Stok", "Stock")}: ${e.message ?? e}`)),
      getAtkRequests({ dateFrom: prev.from, dateTo: range.to }).then(setRequests).catch((e) => errs.push(`${L("Permintaan", "Requests")}: ${e.message ?? e}`)),
      getAtkRestocks({ dateFrom: prev.from, dateTo: range.to }).then(setRestocks).catch((e) => errs.push(`Restock: ${e.message ?? e}`)),
      getAtkSyncStatus().then((v) => { setSync(v); setSyncErr(null); }).catch((e) => setSyncErr(e.message ?? String(e))),
    ]);
    setLoadErr(errs.length ? errs.join(" | ") : null);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [prev.from, range.to]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
  }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5000); return () => clearTimeout(id); }, [toast]);

  const inRange = <T extends { tanggal: string }>(arr: T[], f: string, t: string) => arr.filter((x) => x.tanggal >= f && x.tanggal <= t);
  const curReq = useMemo(() => inRange(requests, range.from, range.to), [requests, range]);
  const curRst = useMemo(() => inRange(restocks, range.from, range.to), [restocks, range]);
  const prvReq = useMemo(() => inRange(requests, prev.from, prev.to), [requests, prev]);
  const prvRst = useMemo(() => inRange(restocks, prev.from, prev.to), [restocks, prev]);
  const pendingCount = sync ? sync.pendingRequests + sync.pendingRestocks + sync.pendingItems : 0;
  const lowCount = useMemo(() => items.filter((i) => stockState(i) !== "ok").length, [items]);

  const TABS: { id: View; label: string; badge?: number; tone?: "warn" | "info" }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "stock", label: L("Stok Barang", "Stock"), badge: lowCount || undefined, tone: "warn" },
    { id: "history", label: L("Riwayat", "History") },
    { id: "sync", label: L("Sinkron Excel", "Excel Sync"), badge: pendingCount || undefined, tone: "info" },
  ];

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.kicker}>{L("Fasilitas · Office Supplies", "Facility · Office Supplies")}</span>
          <h1>{L("ATK & Supplies", "Office Supplies")}</h1>
          <p>{L("Pantau stok dan riwayat transaksi ATK. Data diterima dari Excel ATK lewat sinkron — tidak ada input di aplikasi ini.", "Monitor ATK stock and transaction history. Data is received from the ATK Excel via sync — nothing is entered in this app.")}</p>
        </div>
        <div className={s.headSide}>
          <SyncPill sync={sync} err={syncErr} lang={lang} onClick={() => setView("sync")} />
          <button type="button" className={s.ghostBtn} onClick={() => load()} disabled={loading} title={updatedAt ? `${L("Diperbarui", "Updated")} ${updatedAt.toLocaleTimeString(loc())}` : undefined}>
            {loading ? "…" : "↻"} {L("Muat ulang", "Refresh")}
          </button>
        </div>
      </header>

      <nav className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} className={`${s.tab} ${view === t.id ? s.tabOn : ""}`} onClick={() => setView(t.id)}>
            {t.label}
            {t.badge ? <span className={`${s.tabBadge} ${t.tone === "warn" ? s.badgeWarn : s.badgeInfo}`}>{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {toast && <div className={toast.ok ? s.msgOk : s.msgErr} role="status">{toast.text}</div>}
      {loadErr && <div className={s.msgErr}>⚠ {loadErr}</div>}

      {(view === "dashboard" || view === "history") && (
        <PeriodBar lang={lang} preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} range={range} />
      )}

      {view === "dashboard" && (
        <Dashboard
          lang={lang} loading={loading} items={items} curReq={curReq} curRst={curRst} prvReq={prvReq} prvRst={prvRst}
          range={range} prevLen={prev.len}
          onGo={setView}
        />
      )}
      {view === "stock" && (
        <StockView lang={lang} items={items} requests={requests} loading={loading} />
      )}
      {view === "history" && (
        <HistoryView lang={lang} requests={curReq} restocks={curRst} range={range} loading={loading} />
      )}
      {view === "sync" && (
        <SyncView lang={lang} sync={sync} err={syncErr} onRotated={(k) => { setSync((v) => (v ? { ...v, syncKey: k } : v)); setToast({ ok: true, text: L("Kunci sinkron baru dibuat — perbarui CIKOPS_SYNC_KEY di VBA.", "New sync key created — update CIKOPS_SYNC_KEY in VBA.") }); }}
          onError={(msg) => setToast({ ok: false, text: msg })} />
      )}
    </div>
  );
}

/* ── Status sinkron ringkas di header ── */
function SyncPill({ sync, err, lang, onClick }: { sync: AtkSyncStatus | null; err: string | null; lang: Lang; onClick: () => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  if (err) return <button type="button" className={`${s.syncPill} ${s.pillWarn}`} onClick={onClick}><i />{L("Sinkron dua arah belum aktif", "Two-way sync not active")}</button>;
  if (!sync) return null;
  const pending = sync.pendingRequests + sync.pendingRestocks + sync.pendingItems;
  return (
    <button type="button" className={`${s.syncPill} ${pending ? s.pillInfo : s.pillOk}`} onClick={onClick}>
      <i />
      <span>
        <b>{pending ? L(`${pending} menunggu ditarik Excel`, `${pending} waiting for Excel`) : L("Excel & CIKOPS selaras", "Excel & CIKOPS in sync")}</b>
        <small>{L("Excel kirim", "Excel push")}: {ago(sync.lastPushAt, lang)}</small>
      </span>
    </button>
  );
}

/* ── Pilihan periode ── */
function PeriodBar({ lang, preset, setPreset, custom, setCustom, range }: {
  lang: Lang; preset: Preset; setPreset: (p: Preset) => void; custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void; range: { from: string; to: string };
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const opts: [Preset, string][] = [["thisMonth", L("Bulan ini", "This month")], ["lastMonth", L("Bulan lalu", "Last month")], ["d30", L("30 hari", "30 days")], ["m3", L("3 bulan", "3 months")], ["year", L("Tahun ini", "This year")], ["custom", L("Pilih tanggal", "Custom")]];
  return (
    <div className={s.period}>
      <div className={s.seg} role="group" aria-label={L("Periode", "Period")}>
        {opts.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={preset === k} className={preset === k ? s.segOn : ""} onClick={() => { if (k === "custom") setCustom(range); setPreset(k); }}>{label}</button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className={s.dates}>
          <input type="date" className={s.input} value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label={L("Dari", "From")} />
          <span>—</span>
          <input type="date" className={s.input} value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label={L("Sampai", "To")} />
        </div>
      ) : (
        <span className={s.periodLabel}>{fmtDate(range.from, lang)} – {fmtDate(range.to, lang)}</span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
const PALETTE = ["var(--brand)", "var(--green)", "var(--orange)", "var(--purple)", "var(--gold)", "var(--red)", "var(--t3)"];

function Dashboard({ lang, loading, items, curReq, curRst, prvReq, prvRst, range, prevLen, onGo }: {
  lang: Lang; loading: boolean; items: AtkItem[]; curReq: AtkRequest[]; curRst: AtkRestock[]; prvReq: AtkRequest[]; prvRst: AtkRestock[];
  range: { from: string; to: string }; prevLen: number; onGo: (v: View) => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [focus, setFocus] = useState<{ dept?: string; kode?: string }>({});
  const fReq = useMemo(() => curReq.filter((r) => (!focus.dept || (r.departemen || "—") === focus.dept) && (!focus.kode || r.kodeBarang === focus.kode)), [curReq, focus]);
  const fPrv = useMemo(() => prvReq.filter((r) => (!focus.dept || (r.departemen || "—") === focus.dept) && (!focus.kode || r.kodeBarang === focus.kode)), [prvReq, focus]);
  const fRst = useMemo(() => curRst.filter((r) => !focus.kode || r.kodeBarang === focus.kode), [curRst, focus]);
  const fPrvRst = useMemo(() => prvRst.filter((r) => !focus.kode || r.kodeBarang === focus.kode), [prvRst, focus]);

  const sum = (a: { jumlah: number }[]) => a.reduce((x, r) => x + r.jumlah, 0);
  const uniq = (a: string[]) => new Set(a.filter(Boolean)).size;
  const kpi = {
    out: sum(fReq), outPrev: sum(fPrv),
    txn: uniq(fReq.map((r) => r.requestId)), txnPrev: uniq(fPrv.map((r) => r.requestId)),
    inn: sum(fRst), innPrev: sum(fPrvRst),
    people: uniq(fReq.map((r) => r.nik || r.nama)),
    depts: uniq(fReq.map((r) => r.departemen)),
  };
  const out = items.filter((i) => stockState(i) === "out");
  const low = items.filter((i) => stockState(i) === "low");
  const totalUnits = items.reduce((x, i) => x + Math.max(0, i.stok), 0);

  // tren
  const days = Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / DAY) + 1;
  const gran: "day" | "week" | "month" = days <= 45 ? "day" : days <= 200 ? "week" : "month";
  const buckets = useMemo(() => {
    const keyOf = (d: string) => {
      if (gran === "day") return d;
      if (gran === "month") return d.slice(0, 7);
      const dt = parse(d); const dow = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - dow); return iso(dt);
    };
    const keys: string[] = [];
    for (let t = parse(range.from).getTime(); t <= parse(range.to).getTime(); t += DAY) {
      const k = keyOf(iso(new Date(t)));
      if (keys[keys.length - 1] !== k) keys.push(k);
    }
    const m = new Map(keys.map((k) => [k, { out: 0, inn: 0 }]));
    for (const r of fReq) { const b = m.get(keyOf(r.tanggal)); if (b) b.out += r.jumlah; }
    for (const r of fRst) { const b = m.get(keyOf(r.tanggal)); if (b) b.inn += r.jumlah; }
    return keys.map((k) => {
      const label = gran === "month" ? parse(k + "-01").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { month: "short" })
        : gran === "week" ? fmtDate(k, lang, { day: "2-digit", month: "short" }) : String(parse(k).getDate());
      const full = gran === "month" ? parse(k + "-01").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { month: "long", year: "numeric" })
        : gran === "week" ? `${L("Minggu mulai", "Week of")} ${fmtDate(k, lang)}` : fmtDate(k, lang, { weekday: "long", day: "numeric", month: "long" });
      return { key: k, label, full, ...m.get(k)! };
    });
  }, [fReq, fRst, range, gran, lang, L]);

  // top barang & departemen (dari permintaan periode, tanpa filter fokus yang sama)
  const topItems = useMemo(() => {
    const base = curReq.filter((r) => !focus.dept || (r.departemen || "—") === focus.dept);
    const m = new Map<string, { kode: string; nama: string; satuan: string; qty: number }>();
    for (const r of base) { const x = m.get(r.kodeBarang) ?? { kode: r.kodeBarang, nama: r.namaBarang, satuan: r.satuan, qty: 0 }; x.qty += r.jumlah; m.set(r.kodeBarang, x); }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [curReq, focus.dept]);
  const depts = useMemo(() => {
    const base = curReq.filter((r) => !focus.kode || r.kodeBarang === focus.kode);
    const m = new Map<string, number>();
    for (const r of base) m.set(r.departemen || "—", (m.get(r.departemen || "—") ?? 0) + r.jumlah);
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const top = arr.slice(0, 6);
    const rest = arr.slice(6).reduce((x, [, v]) => x + v, 0);
    if (rest > 0) top.push([L("Lainnya", "Others"), rest]);
    return top;
  }, [curReq, focus.kode, L]);
  const stockByKode = useMemo(() => new Map(items.map((i) => [i.kodeBarang, i])), [items]);
  const critical = useMemo(() => [...out, ...low].sort((a, b) => a.stok / Math.max(a.minStok, 1) - b.stok / Math.max(b.minStok, 1)).slice(0, 8), [out, low]);
  const recent = useMemo(() => groupTxns(curReq, curRst).slice(0, 7), [curReq, curRst]);
  const focusName = focus.kode ? stockByKode.get(focus.kode)?.namaBarang ?? focus.kode : null;
  const per = L(`vs ${prevLen} hari sebelumnya`, `vs previous ${prevLen} days`);

  if (loading && items.length === 0) return <div className={s.skeletonGrid}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className={s.skeleton} />)}</div>;

  return (
    <div className={s.dash}>
      {(focus.dept || focus.kode) && (
        <div className={s.focusBar}>
          <span>{L("Filter aktif", "Active filter")}:</span>
          {focus.dept && <button type="button" className={s.focusChip} onClick={() => setFocus({ ...focus, dept: undefined })}>{L("Departemen", "Dept")}: <b>{focus.dept}</b> ✕</button>}
          {focusName && <button type="button" className={s.focusChip} onClick={() => setFocus({ ...focus, kode: undefined })}>{L("Barang", "Item")}: <b>{focusName}</b> ✕</button>}
          <button type="button" className={s.linkBtn} onClick={() => setFocus({})}>{L("Hapus semua", "Clear all")}</button>
        </div>
      )}

      <div className={s.kpis}>
        <Kpi tone="brand" label={L("Barang keluar", "Items issued")} value={nf(kpi.out, lang)} unit={L("unit", "units")} delta={kpi.out - kpi.outPrev} prev={kpi.outPrev} per={per} lang={lang} spark={buckets.map((b) => b.out)} />
        <Kpi tone="purple" label={L("Permintaan", "Requests")} value={nf(kpi.txn, lang)} unit={L("transaksi", "txns")} delta={kpi.txn - kpi.txnPrev} prev={kpi.txnPrev} per={per} lang={lang}
          foot={L(`${kpi.people} pemohon · ${kpi.depts} departemen`, `${kpi.people} requesters · ${kpi.depts} departments`)} />
        <Kpi tone="green" label={L("Restock masuk", "Restocked")} value={nf(kpi.inn, lang)} unit={L("unit", "units")} delta={kpi.inn - kpi.innPrev} prev={kpi.innPrev} per={per} goodUp lang={lang} spark={buckets.map((b) => b.inn)} />
        <button type="button" className={`${s.kpi} ${s.kpiAlert} ${out.length + low.length ? s.kpiAlertOn : ""}`} onClick={() => onGo("stock")}>
          <span className={s.kpiLabel}>{L("Perlu restock", "Needs restock")}</span>
          <span className={s.kpiValue}>{out.length + low.length}<small> {L("barang", "items")}</small></span>
          <span className={s.kpiFoot}><b className={s.tRed}>{out.length} {L("habis", "out")}</b> · <b className={s.tOrange}>{low.length} {L("menipis", "low")}</b> · {nf(totalUnits, lang)} {L("unit di gudang", "units on hand")}</span>
        </button>
      </div>

      <div className={s.gridMain}>
        <section className={`${s.card} ${s.trendCard}`}>
          <div className={s.cardHead}>
            <div>
              <h2>{L("Arus barang", "Stock flow")}</h2>
              <p>{L(`Keluar (permintaan) vs masuk (restock) per ${gran === "day" ? "hari" : gran === "week" ? "minggu" : "bulan"}`, `Issued vs restocked per ${gran}`)}</p>
            </div>
            <div className={s.legend}><span><i style={{ background: "var(--brand)" }} />{L("Keluar", "Issued")}</span><span><i style={{ background: "var(--green)" }} />{L("Masuk", "Restocked")}</span></div>
          </div>
          <FlowChart data={buckets} lang={lang} />
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div><h2>{L("Per departemen", "By department")}</h2><p>{L("Klik untuk memfilter dashboard", "Click to filter the dashboard")}</p></div>
          </div>
          <Donut data={depts} lang={lang} active={focus.dept} onPick={(d) => setFocus({ ...focus, dept: focus.dept === d ? undefined : d === L("Lainnya", "Others") ? focus.dept : d })} />
        </section>
      </div>

      <div className={s.gridThree}>
        <section className={s.card}>
          <div className={s.cardHead}><div><h2>{L("Paling banyak diminta", "Most requested")}</h2><p>{L("Klik barang untuk memfilter", "Click an item to filter")}</p></div></div>
          {topItems.length === 0 ? <p className={s.empty}>{L("Belum ada permintaan di periode ini.", "No requests in this period.")}</p> : (
            <ol className={s.hbars}>
              {topItems.map((t, i) => {
                const st = stockByKode.get(t.kode);
                return (
                  <li key={t.kode}>
                    <button type="button" className={`${s.hbar} ${focus.kode === t.kode ? s.hbarOn : ""}`} onClick={() => setFocus({ ...focus, kode: focus.kode === t.kode ? undefined : t.kode })} aria-pressed={focus.kode === t.kode}>
                      <span className={s.rank}>{i + 1}</span>
                      <span className={s.hbarBody}>
                        <span className={s.hbarTop}><b>{t.nama}</b><span>{nf(t.qty, lang)} {t.satuan}</span></span>
                        <span className={s.track}><span style={{ width: `${(t.qty / topItems[0].qty) * 100}%` }} /></span>
                        {st && <span className={`${s.hbarSub} ${stockState(st) !== "ok" ? s.tRed : ""}`}>{L("Sisa stok", "In stock")}: {nf(st.stok, lang)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div><h2>{L("Stok kritis", "Critical stock")}</h2><p>{L("Di bawah atau sama dengan stok minimum", "At or below minimum stock")}</p></div>
            <button type="button" className={s.linkBtn} onClick={() => onGo("stock")}>{L("Semua stok", "All stock")} →</button>
          </div>
          {critical.length === 0 ? <div className={s.allGood}>✓ {L("Semua stok aman.", "All stock is healthy.")}</div> : (
            <ul className={s.critList}>
              {critical.map((i) => (
                <li key={i.id}>
                  <div className={s.critMain}>
                    <div className={s.critTop}><b>{i.namaBarang}</b><span className={stockState(i) === "out" ? s.chipRed : s.chipOrange}>{stockState(i) === "out" ? L("Habis", "Out") : L("Menipis", "Low")}</span></div>
                    <div className={s.track}><span className={stockState(i) === "out" ? s.fillRed : s.fillOrange} style={{ width: `${Math.min(100, (Math.max(0, i.stok) / Math.max(i.minStok * 2, 1)) * 100)}%` }} /></div>
                    <div className={s.critSub}>{nf(i.stok, lang)} / min {nf(i.minStok, lang)} {i.satuan}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div><h2>{L("Aktivitas terbaru", "Recent activity")}</h2><p>{L("Permintaan & restock di periode ini", "Requests & restocks this period")}</p></div>
            <button type="button" className={s.linkBtn} onClick={() => onGo("history")}>{L("Riwayat", "History")} →</button>
          </div>
          {recent.length === 0 ? <p className={s.empty}>{L("Belum ada transaksi.", "No transactions yet.")}</p> : (
            <ul className={s.feed}>
              {recent.map((t) => (
                <li key={t.kind + t.ref}>
                  <span className={`${s.feedIcon} ${t.kind === "request" ? s.feedOut : s.feedIn}`}>{t.kind === "request" ? "↑" : "↓"}</span>
                  <div className={s.feedMain}>
                    <div className={s.feedTop}><b>{t.nama || "—"}</b><span>{fmtDate(t.tanggal, lang, { day: "2-digit", month: "short" })}</span></div>
                    <div className={s.feedSub}>{t.kind === "request" ? "−" : "+"}{nf(t.qty, lang)} · {t.lines.map((x) => x.nama).slice(0, 2).join(", ")}{t.lines.length > 2 ? ` +${t.lines.length - 2}` : ""}</div>
                  </div>
                  <SourceTag t={t} lang={lang} compact />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ tone, label, value, unit, delta, prev, per, goodUp, lang, spark, foot }: {
  tone: "brand" | "green" | "purple"; label: string; value: string; unit: string; delta: number; prev: number; per: string; goodUp?: boolean; lang: Lang; spark?: number[]; foot?: string;
}) {
  const pct = prev > 0 ? Math.round((delta / prev) * 100) : null;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const good = goodUp === undefined ? null : dir === "flat" ? null : (dir === "up") === goodUp;
  return (
    <div className={`${s.kpi} ${s["kpi_" + tone]}`}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}<small> {unit}</small></span>
      <span className={s.kpiFoot}>
        <b className={good === null ? s.tNeutral : good ? s.tGreen : s.tRed}>{dir === "up" ? "▲" : dir === "down" ? "▼" : "■"} {pct === null ? (delta === 0 ? "0" : (delta > 0 ? "+" : "") + nf(delta, lang)) : `${pct > 0 ? "+" : ""}${pct}%`}</b> {per}
      </span>
      {foot && <span className={s.kpiFoot}>{foot}</span>}
      {spark && spark.length > 1 && <Spark data={spark} />}
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg className={s.spark} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,30 ${pts} 100,30`} className={s.sparkArea} />
      <polyline points={pts} className={s.sparkLine} />
    </svg>
  );
}

function FlowChart({ data, lang }: { data: { key: string; label: string; full: string; out: number; inn: number }[]; lang: Lang }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, pl = 36, pr = 8, pt = 12, pb = 26;
  const max = Math.max(1, ...data.map((d) => Math.max(d.out, d.inn)));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const n = Math.ceil(max / p); return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; })();
  const cw = (W - pl - pr) / Math.max(data.length, 1);
  const bw = Math.max(2, Math.min(18, cw * 0.36));
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / nice);
  const step = Math.ceil(data.length / 16);
  const h = hover !== null ? data[hover] : null;
  if (data.every((d) => d.out === 0 && d.inn === 0)) return <p className={s.empty}>{L("Belum ada pergerakan barang di periode ini.", "No stock movement in this period.")}</p>;
  return (
    <div className={s.chartWrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label={L("Grafik barang keluar dan masuk", "Issued vs restocked chart")}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={W - pr} y1={y(nice * f)} y2={y(nice * f)} className={s.gridLine} />
            <text x={pl - 6} y={y(nice * f) + 3} className={s.axisText} textAnchor="end">{nf(nice * f, lang)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pl + cw * i + cw / 2;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={pl + cw * i} y={pt} width={cw} height={H - pt - pb} className={hover === i ? s.hoverCol : s.hitCol} />
              <rect x={cx - bw - 1} y={y(d.out)} width={bw} height={Math.max(0, H - pb - y(d.out))} rx={Math.min(3, bw / 3)} className={s.barOut} />
              <rect x={cx + 1} y={y(d.inn)} width={bw} height={Math.max(0, H - pb - y(d.inn))} rx={Math.min(3, bw / 3)} className={s.barIn} />
              {i % step === 0 && <text x={cx} y={H - 8} className={s.axisText} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className={s.tip} style={{ left: `${((pl + cw * hover + cw / 2) / W) * 100}%` }}>
          <b>{h.full}</b>
          <span><i style={{ background: "var(--brand)" }} />{L("Keluar", "Issued")} <b>{nf(h.out, lang)}</b></span>
          <span><i style={{ background: "var(--green)" }} />{L("Masuk", "Restocked")} <b>{nf(h.inn, lang)}</b></span>
        </div>
      )}
    </div>
  );
}

function Donut({ data, lang, active, onPick }: { data: [string, number][]; lang: Lang; active?: string; onPick: (d: string) => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const total = data.reduce((x, [, v]) => x + v, 0);
  const [hover, setHover] = useState<string | null>(null);
  if (total === 0) return <p className={s.empty}>{L("Belum ada data.", "No data yet.")}</p>;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const shown = hover ?? active ?? null;
  const shownV = shown ? data.find(([k]) => k === shown)?.[1] ?? 0 : total;
  return (
    <div className={s.donutWrap}>
      <svg viewBox="0 0 140 140" className={s.donut} role="img" aria-label={L("Komposisi per departemen", "Share by department")}>
        <circle cx="70" cy="70" r={R} className={s.donutBg} />
        {data.map(([k, v], i) => {
          const len = (v / total) * C;
          const el = (
            <circle key={k} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={active === k || hover === k ? 22 : 16}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"
              className={s.donutSeg} style={{ opacity: active && active !== k ? 0.35 : 1 }}
              onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onClick={() => onPick(k)} />
          );
          acc += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className={s.donutVal}>{nf(shownV, lang)}</text>
        <text x="70" y="82" textAnchor="middle" className={s.donutLbl}>{shown ? `${Math.round((shownV / total) * 100)}%` : L("unit keluar", "units issued")}</text>
      </svg>
      <ul className={s.donutLegend}>
        {data.map(([k, v], i) => (
          <li key={k}>
            <button type="button" className={active === k ? s.legOn : ""} onClick={() => onPick(k)} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} aria-pressed={active === k}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />
              <span>{k}</span>
              <b>{nf(v, lang)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceTag({ t, lang, compact }: { t: { source: "excel" | "web"; pulled: boolean }; lang: Lang; compact?: boolean }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  if (t.source === "excel") return <span className={s.tagExcel} title={L("Diinput di Excel", "Entered in Excel")}>Excel</span>;
  return t.pulled
    ? <span className={s.tagWeb} title={L("Diinput di CIKOPS, sudah ada di Excel", "Entered in CIKOPS, already in Excel")}>CIKOPS ✓</span>
    : <span className={s.tagPending} title={L("Diinput di CIKOPS, menunggu ditarik Excel", "Entered in CIKOPS, waiting for Excel")}>{compact ? "CIKOPS ⏳" : <>CIKOPS · {L("menunggu Excel", "awaiting Excel")}</>}</span>;
}

/* ════════════════════════════════════════════════════════════
   FORM PERMINTAAN / RESTOCK
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   STOK BARANG
════════════════════════════════════════════════════════════ */
function StockView({ lang, items, requests, loading }: {
  lang: Lang; items: AtkItem[]; requests: AtkRequest[]; loading: boolean;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "out" | "low" | "ok" | "web">("all");
  const [sort, setSort] = useState<"name" | "stock" | "usage">("name");

  // pemakaian 30 hari terakhir → perkiraan hari stok habis
  const usage = useMemo(() => {
    const from = iso(new Date(Date.now() - 29 * DAY));
    const m = new Map<string, number>();
    for (const r of requests) if (r.tanggal >= from) m.set(r.kodeBarang, (m.get(r.kodeBarang) ?? 0) + r.jumlah);
    return m;
  }, [requests]);
  const counts = useMemo(() => ({
    all: items.length, out: items.filter((i) => stockState(i) === "out").length, low: items.filter((i) => stockState(i) === "low").length,
    ok: items.filter((i) => stockState(i) === "ok").length, web: items.filter((i) => i.source === "web").length,
  }), [items]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" || (filter === "web" ? i.source === "web" : stockState(i) === filter)) && (!t || i.namaBarang.toLowerCase().includes(t) || i.kodeBarang.toLowerCase().includes(t)))
      .sort((a, b) => sort === "stock" ? a.stok / Math.max(a.minStok, 1) - b.stok / Math.max(b.minStok, 1) : sort === "usage" ? (usage.get(b.kodeBarang) ?? 0) - (usage.get(a.kodeBarang) ?? 0) : a.namaBarang.localeCompare(b.namaBarang));
  }, [items, q, filter, sort, usage]);

  function exportStock(fmt: "csv" | "excel" | "pdf") {
    const cols: ReportColumn<AtkItem>[] = [
      { key: "kode", labelId: "Kode Barang", labelEn: "Item Code", get: (i) => i.kodeBarang },
      { key: "nama", labelId: "Nama Barang", labelEn: "Item Name", get: (i) => i.namaBarang },
      { key: "satuan", labelId: "Satuan", labelEn: "Unit", get: (i) => i.satuan },
      { key: "stok", labelId: "Stok", labelEn: "Stock", get: (i) => i.stok, align: "right" },
      { key: "min", labelId: "Stok Minimum", labelEn: "Min. Stock", get: (i) => i.minStok, align: "right" },
      { key: "status", labelId: "Status", labelEn: "Status", get: (i) => ({ out: L("Habis", "Out"), low: L("Menipis", "Low"), ok: L("Aman", "OK") })[stockState(i)] },
      { key: "pakai", labelId: "Pemakaian 30 hari", labelEn: "30-day usage", get: (i) => usage.get(i.kodeBarang) ?? 0, align: "right" },
    ];
    const run = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    run({ rows: list, columns: cols, lang: lang as ReportLang, titleId: "Laporan Stok ATK", titleEn: "Office Supplies Stock Report", periodLabel: fmtDate(iso(new Date()), lang), filename: "Laporan_Stok_ATK" });
  }

  return (
    <section className={s.card}>
      <div className={s.toolbar}>
        <input className={`${s.input} ${s.search}`} placeholder={L("Cari kode / nama barang…", "Search code / name…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={L("Cari barang", "Search items")} />
        <div className={s.seg} role="group">
          {([["all", L("Semua", "All")], ["out", L("Habis", "Out")], ["low", L("Menipis", "Low")], ["ok", L("Aman", "OK")], ["web", L("Baru dari CIKOPS", "Added in CIKOPS")]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? s.segOn : ""} onClick={() => setFilter(k)}>{label} <small>{counts[k]}</small></button>
          ))}
        </div>
        <select className={s.input} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={L("Urutkan", "Sort")} style={{ width: "auto" }}>
          <option value="name">{L("Urut: nama", "Sort: name")}</option>
          <option value="stock">{L("Urut: paling kritis", "Sort: most critical")}</option>
          <option value="usage">{L("Urut: paling sering dipakai", "Sort: most used")}</option>
        </select>
        <span className={s.grow} />
        <div className={s.exportGroup}>
          {(["excel", "pdf", "csv"] as const).map((f) => <button key={f} type="button" className={s.ghostBtn} onClick={() => exportStock(f)} disabled={!list.length}>{f.toUpperCase()}</button>)}
        </div>
      </div>

      {loading && items.length === 0 ? <div className={s.skeleton} style={{ height: 240 }} /> : list.length === 0 ? <p className={s.empty}>{items.length ? L("Tidak ada barang yang cocok.", "No matching items.") : L("Belum ada data barang — sinkron dari Excel atau tambah barang baru.", "No items yet — sync from Excel or add a new item.")}</p> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{L("Barang", "Item")}</th>
                <th className={s.num}>{L("Stok", "Stock")}</th>
                <th className={s.barCol}>{L("Kondisi", "Level")}</th>
                <th className={s.num}>Min</th>
                <th className={s.num}>{L("Pakai 30 hr", "30-day use")}</th>
                <th className={s.num}>{L("Cukup ±", "Lasts ±")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const st = stockState(i);
                const u = usage.get(i.kodeBarang) ?? 0;
                const daysLeft = u > 0 ? Math.floor(Math.max(0, i.stok) / (u / 30)) : null;
                return (
                  <tr key={i.id}>
                    <td>
                      <div className={s.itemName}>{i.namaBarang}{i.source === "web" && <span className={i.pulled ? s.tagWeb : s.tagPending}>{i.pulled ? "CIKOPS ✓" : L("baru · menunggu Excel", "new · awaiting Excel")}</span>}</div>
                      <div className={s.itemCode}>{i.kodeBarang} · {i.satuan || "—"}</div>
                    </td>
                    <td className={`${s.num} ${s.big} ${st === "out" ? s.tRed : st === "low" ? s.tOrange : ""}`}>{nf(i.stok, lang)}</td>
                    <td className={s.barCol}>
                      <div className={s.track}><span className={st === "out" ? s.fillRed : st === "low" ? s.fillOrange : s.fillGreen} style={{ width: `${Math.min(100, (Math.max(0, i.stok) / Math.max(i.minStok * 3, 1)) * 100)}%` }} /></div>
                    </td>
                    <td className={s.num}>
                      {nf(i.minStok, lang)}
                    </td>
                    <td className={s.num}>{u ? nf(u, lang) : "—"}</td>
                    <td className={`${s.num} ${daysLeft !== null && daysLeft < 14 ? s.tOrange : ""}`}>{daysLeft === null ? "—" : daysLeft > 365 ? "> 1 th" : `${daysLeft} ${L("hr", "d")}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.hint}>{L("Data stok diterima dari Excel ATK lewat sinkron. Koreksi dilakukan di Excel.", "Stock data is received from the ATK Excel via sync. Corrections are made in Excel.")}</p>
    </section>
  );
}

function HistoryView({ lang, requests, restocks, range, loading }: {
  lang: Lang; requests: AtkRequest[]; restocks: AtkRestock[]; range: { from: string; to: string }; loading: boolean;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [kind, setKind] = useState<"all" | "request" | "restock">("all");
  const [src, setSrc] = useState<"all" | "excel" | "web" | "pending">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const all = useMemo(() => groupTxns(requests, restocks), [requests, restocks]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((x) =>
      (kind === "all" || x.kind === kind) &&
      (src === "all" || (src === "pending" ? x.source === "web" && !x.pulled : x.source === src)) &&
      (!t || [x.ref, x.nama, x.nik, x.departemen, x.helper, ...x.lines.map((l) => l.nama + " " + l.kode)].join(" ").toLowerCase().includes(t)));
  }, [all, kind, src, q]);

  function exportRows(fmt: "csv" | "excel" | "pdf") {
    const run = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    const periodLabel = `${fmtDate(range.from, lang)} – ${fmtDate(range.to, lang)}`;
    const srcLabel = (r: { source: string; pulled: boolean }) => r.source === "excel" ? "Excel" : r.pulled ? L("CIKOPS (sudah di Excel)", "CIKOPS (already in Excel)") : L("CIKOPS (menunggu Excel)", "CIKOPS (waiting for Excel)");
    if (kind !== "restock") {
      const cols: ReportColumn<AtkRequest>[] = [
        { key: "id", labelId: "No. Request", labelEn: "Request No.", get: (r) => r.requestId },
        { key: "tgl", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal },
        { key: "nama", labelId: "Nama Pemohon", labelEn: "Requester", get: (r) => r.nama },
        { key: "nik", labelId: "NIK", labelEn: "Employee ID", get: (r) => r.nik },
        { key: "dept", labelId: "Departemen", labelEn: "Department", get: (r) => r.departemen },
        { key: "barang", labelId: "Nama Barang", labelEn: "Item", get: (r) => r.namaBarang },
        { key: "jml", labelId: "Jumlah", labelEn: "Qty", get: (r) => r.jumlah, align: "right" },
        { key: "sat", labelId: "Satuan", labelEn: "Unit", get: (r) => r.satuan },
        { key: "helper", labelId: "Helper", labelEn: "Helper", get: (r) => r.helper },
        { key: "src", labelId: "Sumber", labelEn: "Source", get: srcLabel },
      ];
      const keep = new Set(list.filter((x) => x.kind === "request").map((x) => x.ref));
      const rows = requests.filter((r) => keep.has(r.requestId));
      run({ rows, columns: cols, lang: lang as ReportLang, titleId: "Laporan Permintaan ATK", titleEn: "Office Supplies Request Report", periodLabel, filename: "Laporan_Permintaan_ATK",
        summaryRows: [{ label: L("Total jumlah diminta", "Total quantity requested"), value: rows.reduce((x, r) => x + r.jumlah, 0) }] });
    }
    if (kind !== "request") {
      const cols: ReportColumn<AtkRestock>[] = [
        { key: "id", labelId: "No. Update", labelEn: "Update No.", get: (r) => r.updateId },
        { key: "tgl", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal },
        { key: "nama", labelId: "Petugas", labelEn: "Staff", get: (r) => r.nama },
        { key: "dept", labelId: "Departemen", labelEn: "Department", get: (r) => r.departemen },
        { key: "barang", labelId: "Nama Barang", labelEn: "Item", get: (r) => r.namaBarang },
        { key: "jml", labelId: "Jumlah Masuk", labelEn: "Qty In", get: (r) => r.jumlah, align: "right" },
        { key: "sat", labelId: "Satuan", labelEn: "Unit", get: (r) => r.satuan },
        { key: "src", labelId: "Sumber", labelEn: "Source", get: srcLabel },
      ];
      const keep = new Set(list.filter((x) => x.kind === "restock").map((x) => x.ref));
      const rows = restocks.filter((r) => keep.has(r.updateId));
      if (kind === "restock" || rows.length) run({ rows, columns: cols, lang: lang as ReportLang, titleId: "Laporan Restock ATK", titleEn: "Office Supplies Restock Report", periodLabel, filename: "Laporan_Restock_ATK",
        summaryRows: [{ label: L("Total jumlah masuk", "Total quantity restocked"), value: rows.reduce((x, r) => x + r.jumlah, 0) }] });
    }
  }

  return (
    <section className={s.card}>
      <div className={s.toolbar}>
        <input className={`${s.input} ${s.search}`} placeholder={L("Cari no. transaksi, nama, NIK, barang…", "Search no., name, ID, item…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={L("Cari transaksi", "Search transactions")} />
        <div className={s.seg} role="group">
          {([["all", L("Semua", "All")], ["request", L("Keluar", "Issued")], ["restock", L("Masuk", "Restock")]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? s.segOn : ""} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
        <select className={s.input} style={{ width: "auto" }} value={src} onChange={(e) => setSrc(e.target.value as typeof src)} aria-label={L("Sumber", "Source")}>
          <option value="all">{L("Semua sumber", "All sources")}</option>
          <option value="excel">{L("Dari Excel", "From Excel")}</option>
          <option value="web">{L("Dari CIKOPS", "From CIKOPS")}</option>
          <option value="pending">{L("Menunggu ditarik Excel", "Awaiting Excel")}</option>
        </select>
        <span className={s.grow} />
        <div className={s.exportGroup}>
          {(["excel", "pdf", "csv"] as const).map((f) => <button key={f} type="button" className={s.ghostBtn} onClick={() => exportRows(f)} disabled={!list.length}>{f.toUpperCase()}</button>)}
        </div>
      </div>
      <div className={s.histSummary}>
        {list.length} {L("transaksi", "transactions")} · <b className={s.tBrand}>−{nf(list.filter((x) => x.kind === "request").reduce((a, x) => a + x.qty, 0), lang)}</b> {L("keluar", "issued")} · <b className={s.tGreen}>+{nf(list.filter((x) => x.kind === "restock").reduce((a, x) => a + x.qty, 0), lang)}</b> {L("masuk", "restocked")}
      </div>
      {loading && all.length === 0 ? <div className={s.skeleton} style={{ height: 240 }} /> : list.length === 0 ? <p className={s.empty}>{L("Tidak ada transaksi di periode / filter ini.", "No transactions for this period / filter.")}</p> : (
        <ul className={s.txnList}>
          {list.slice(0, limit).map((t) => {
            const id = t.kind + t.ref;
            return (
              <li key={id} className={s.txn}>
                <button type="button" className={s.txnHead} onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                  <span className={`${s.feedIcon} ${t.kind === "request" ? s.feedOut : s.feedIn}`}>{t.kind === "request" ? "↑" : "↓"}</span>
                  <span className={s.txnDate}><b>{fmtDate(t.tanggal, lang, { day: "2-digit" })}</b>{fmtDate(t.tanggal, lang, { month: "short" })}</span>
                  <span className={s.txnMain}>
                    <b>{t.nama || "—"}</b>
                    <span>{[t.departemen, t.kind === "request" && t.helper ? `${L("diambil", "picked up by")} ${t.helper}` : ""].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <span className={s.txnItems}>{t.lines.slice(0, 2).map((x) => x.nama).join(", ")}{t.lines.length > 2 ? ` +${t.lines.length - 2}` : ""}</span>
                  <span className={`${s.txnQty} ${t.kind === "request" ? s.tBrand : s.tGreen}`}>{t.kind === "request" ? "−" : "+"}{nf(t.qty, lang)}</span>
                  <SourceTag t={t} lang={lang} />
                  <span className={s.chev} aria-hidden>{open === id ? "▴" : "▾"}</span>
                </button>
                {open === id && (
                  <div className={s.txnBody}>
                    <div className={s.txnMeta}>
                      <span><small>{L("No. transaksi", "Transaction no.")}</small><b className={s.mono}>{t.ref}</b></span>
                      {t.nik && <span><small>NIK</small><b>{t.nik}</b></span>}
                      {t.createdBy && <span><small>{L("Diinput oleh", "Entered by")}</small><b>{t.createdBy}</b></span>}
                      <span><small>{L("Dicatat", "Recorded")}</small><b>{fmtDateTime(t.createdAt, lang)}</b></span>
                    </div>
                    <table className={s.miniTable}>
                      <tbody>{t.lines.map((l, i) => <tr key={i}><td className={s.itemCode}>{l.kode}</td><td>{l.nama}</td><td className={s.num}><b>{nf(l.jumlah, lang)}</b> {l.satuan}</td></tr>)}</tbody>
                    </table>
                    <div className={s.txnFoot}>
                        <span className={s.hint}>{t.source === "excel" ? L("Diinput di Excel — koreksi dilakukan di Excel.", "Entered in Excel — correct it in Excel.") : L("Sudah ditarik ke Excel — koreksi dilakukan di Excel.", "Already pulled into Excel — correct it in Excel.")}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > limit && <button type="button" className={s.addLine} onClick={() => setLimit((v) => v + 60)}>{L("Tampilkan lebih banyak", "Show more")} ({list.length - limit})</button>}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════
   SINKRON EXCEL
════════════════════════════════════════════════════════════ */
function SyncView({ lang, sync, err, onRotated, onError }: { lang: Lang; sync: AtkSyncStatus | null; err: string | null; onRotated: (k: string) => void; onError: (m: string) => void }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!sync?.syncKey) return;
    try { await navigator.clipboard.writeText(sync.syncKey); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setShow(true); }
  }
  async function rotate() {
    if (!window.confirm(L("Buat kunci sinkron baru? Kunci lama langsung tidak berlaku — Excel harus diisi kunci baru sebelum bisa menarik data.", "Create a new sync key? The old key stops working immediately — Excel must be updated before it can pull."))) return;
    try { onRotated(await rotateAtkSyncKey()); setShow(true); } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  const pending = sync ? sync.pendingRequests + sync.pendingRestocks + sync.pendingItems : 0;
  return (
    <div className={s.syncGrid}>
      <section className={`${s.card} ${s.flowCard}`}>
        <div className={s.cardHead}><div><h2>{L("Cara kerja sinkron dua arah", "How two-way sync works")}</h2><p>{L("Excel tetap bisa dipakai seperti biasa; CIKOPS sekarang juga bisa input.", "Keep using Excel as usual; CIKOPS can now enter data too.")}</p></div></div>
        <div className={s.flow}>
          <div className={s.node}><span className={s.nodeIcon}>XL</span><b>Excel ATK</b><small>MasterBarang · TransaksiPermintaan · TransaksiUpdateBarang</small></div>
          <div className={s.arrows}>
            <div className={s.arrowR}><span>{L("Sinkron ke CIKOPS", "Sync to CIKOPS")}</span><small>{L("stok, permintaan, restock", "stock, requests, restocks")}</small></div>
            <div className={s.arrowL}><span>{L("Tarik dari CIKOPS", "Pull from CIKOPS")}</span><small>{L("input web + barang baru", "web entries + new items")}</small></div>
          </div>
          <div className={`${s.node} ${s.nodeCikops}`}><span className={s.nodeIcon}>CK</span><b>CIKOPS</b><small>{L("Dashboard · input · laporan", "Dashboard · input · reports")}</small></div>
        </div>
        <ol className={s.steps}>
          <li><b>{L("Input di CIKOPS", "Enter in CIKOPS")}</b> — {L("stok di database langsung berubah dan transaksi ditandai “menunggu Excel”.", "database stock changes immediately and the entry is marked “awaiting Excel”.")}</li>
          <li><b>{L("Klik Sinkron di Excel", "Click Sync in Excel")}</b> — {L("Excel menarik dulu transaksi CIKOPS (masuk ke sheet + stok MasterBarang disesuaikan), lalu mengirim data Excel.", "Excel first pulls CIKOPS entries (added to sheets, MasterBarang stock adjusted), then pushes Excel data.")}</li>
          <li><b>{L("Stok tidak saling menimpa", "Stock never overwrites")}</b> — {L("stok kiriman Excel dikoreksi otomatis dengan transaksi CIKOPS yang belum ditarik, jadi angkanya tetap benar walau Excel belum sempat menarik.", "stock pushed by Excel is auto-corrected with CIKOPS entries not yet pulled, so numbers stay right even before Excel pulls.")}</li>
          <li><b>{L("Koreksi", "Corrections")}</b> — {L("transaksi CIKOPS bisa dibatalkan selama belum ditarik Excel. Setelah ditarik, koreksi dilakukan di Excel.", "CIKOPS entries can be cancelled until Excel pulls them. After that, correct them in Excel.")}</li>
        </ol>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><div><h2>Status</h2><p>{L("Diperbarui otomatis tiap 30 detik", "Auto-refreshed every 30 seconds")}</p></div></div>
        {err ? (
          <div className={s.msgErr}>{err}</div>
        ) : !sync ? <div className={s.skeleton} style={{ height: 160 }} /> : (
          <div className={s.statGrid}>
            <div className={s.stat}><small>{L("Terakhir Excel kirim", "Last Excel push")}</small><b>{ago(sync.lastPushAt, lang)}</b><span>{fmtDateTime(sync.lastPushAt, lang)}</span></div>
            <div className={s.stat}><small>{L("Terakhir Excel tarik", "Last Excel pull")}</small><b>{ago(sync.lastPullAt, lang)}</b><span>{sync.lastPullAt ? `${fmtDateTime(sync.lastPullAt, lang)} · ${sync.lastPullCount} ${L("baris", "rows")}` : L("VBA versi baru belum dipakai", "New VBA not used yet")}</span></div>
            <div className={`${s.stat} ${pending ? s.statInfo : s.statOk}`}>
              <small>{L("Menunggu ditarik Excel", "Awaiting Excel pull")}</small>
              <b>{pending ? pending : "✓ 0"}</b>
              <span>{sync.pendingRequests} {L("permintaan", "requests")} · {sync.pendingRestocks} restock · {sync.pendingItems} {L("barang baru", "new items")}</span>
            </div>
          </div>
        )}
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><div><h2>{L("Pasang / update VBA", "Install / update VBA")}</h2><p>{L("Sekali saja di file Excel ATK", "One time in the ATK Excel file")}</p></div></div>
        <ol className={s.steps}>
          <li>{L("Unduh modul VBA versi 2:", "Download VBA module v2:")} <a className={s.primarySm} href="/downloads/modSyncCikops.bas" download>⬇ modSyncCikops.bas</a></li>
          <li>{L("Excel → Alt+F11 → hapus modul modSyncCikops lama → File → Import File → pilih file tadi.", "Excel → Alt+F11 → remove the old modSyncCikops → File → Import File → pick the file.")}</li>
          <li>{L("Isi SUPABASE_URL, SUPABASE_ANON_KEY (sama seperti dulu) dan CIKOPS_SYNC_KEY (kunci di bawah).", "Fill SUPABASE_URL, SUPABASE_ANON_KEY (same as before) and CIKOPS_SYNC_KEY (key below).")}</li>
          <li>{L("Tombol Sinkron yang lama (SyncToCikops) kini otomatis tarik + kirim. Opsional: buat tombol baru untuk macro TarikDariCikops.", "The existing Sync button (SyncToCikops) now pulls + pushes. Optional: add a button for the TarikDariCikops macro.")}</li>
        </ol>
        <div className={s.keyBox}>
          <small>CIKOPS_SYNC_KEY</small>
          {sync?.isAdmin && sync.syncKey ? (
            <>
              <code className={s.mono}>{show ? sync.syncKey : "•".repeat(32)}</code>
              <div className={s.keyBtns}>
                <button type="button" className={s.ghostBtn} onClick={() => setShow((v) => !v)}>{show ? L("Sembunyikan", "Hide") : L("Tampilkan", "Show")}</button>
                <button type="button" className={s.ghostBtn} onClick={copy}>{copied ? L("Tersalin ✓", "Copied ✓") : L("Salin", "Copy")}</button>
                <button type="button" className={`${s.ghostBtn} ${s.dangerText}`} onClick={rotate}>{L("Ganti kunci", "Rotate key")}</button>
              </div>
            </>
          ) : <span className={s.hint}>{err ? L("Jalankan supabase/01_dasar.sql (bagian 026) dulu.", "Run supabase/01_dasar.sql (bagian 026) first.") : L("Hanya admin yang bisa melihat kunci sinkron.", "Only admins can view the sync key.")}</span>}
        </div>
      </section>
    </div>
  );
}
