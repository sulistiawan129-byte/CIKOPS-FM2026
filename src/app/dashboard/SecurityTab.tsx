"use client";

/* ════════════════════════════════════════════════════════════
   SECURITY — input bulanan dari laporan security (diisi tiap tanggal 1).
   Pelanggaran transporter dibaca otomatis dari G-C (lihat /api/gc-nc);
   input manual hanya cadangan bila G-C tidak tersambung.
   Semua angka masuk ke Report → Laporan Manajemen, modul Security.
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MyProfile } from "@/lib/api";
import {
  DEFAULT_KHUSUS, KEJ_AUTO_PEL, KEJ_AUTO_TIMBANG, KEJ_CATS, NC_JENIS, TEAM_KEYS, VEH_CATS,
  addMonthsKey, aggregateGc, aggregateManual, driverLabel, monthEnd, monthKeysBetween, monthStart, monthTotals, normCo,
  normalizeData, num, sumArr, weeksOfMonth,
  type GcAgg, type Issue, type MonthTotals, type PelManual, type SecData, type TotalKey, type VehKey,
} from "@/lib/security/model";
import {
  fetchGcCases, fetchSecDesk, getSecurityConfig, getSecurityMonth, getSecurityMonths, pingGc, saveSecurityConfig, saveSecurityMonth, saveSecurityTotals,
  type GcPing, type GcResult, type SdResult, type SecurityConfig,
} from "@/lib/security/api";
import { SECDESK_URL, type SdReport } from "@/lib/security/secdesk";
import { GatePanel, PersonelView } from "./SecDeskViews";
import { CrudList, SettingsPage } from "@/components/settings/Settings";
import s from "./security.module.css";

type Tab = "ringkasan" | "kendaraan" | "transporter" | "pelanggaran" | "kejadian" | "visit" | "patroli" | "personel" | "riwayat" | "pengaturan";
const TABS: { id: Tab; label: string; check?: boolean }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "kendaraan", label: "Kendaraan All", check: true },
  { id: "transporter", label: "Transporter", check: true },
  { id: "pelanggaran", label: "Pelanggaran Transporter", check: true },
  { id: "kejadian", label: "Kejadian", check: true },
  { id: "visit", label: "Visit", check: true },
  { id: "patroli", label: "Patroli", check: true },
  { id: "personel", label: "Personel & KPI" },
  { id: "riwayat", label: "Riwayat 12 bulan" },
  { id: "pengaturan", label: "Pengaturan" },
];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const f = (n: number) => Number(n || 0).toLocaleString("id-ID");
const f1 = (n: number) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 });
const pctTxt = (a: number, b: number) => (b ? `${f1((a / b) * 100)}%` : "–");
const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const monthShortLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MON[m - 1]} ${String(y).slice(2)}`; };
const dateShort = (iso: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; };

function defaultMonth(): string {
  const d = new Date();
  // input dilakukan awal bulan untuk bulan sebelumnya
  const t = d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : new Date(d.getFullYear(), d.getMonth(), 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}
function delta(cur: number, prev: number | null | undefined): { txt: string; up: boolean | null } {
  if (!prev) return { txt: "belum ada data bulan lalu", up: null };
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) < 0.5) return { txt: `stabil vs bulan lalu (${f(prev)})`, up: null };
  return { txt: `${p > 0 ? "▲" : "▼"} ${f1(Math.abs(p))}% vs bulan lalu (${f(prev)})`, up: p > 0 };
}

function NumIn({ value, onChange, label, disabled, wide }: { value: number | undefined; onChange?: (n: number) => void; label: string; disabled?: boolean; wide?: boolean }) {
  return (
    <input
      type="number" inputMode="numeric" min={0} aria-label={label} placeholder="0" disabled={disabled}
      className={`${s.num} ${wide ? s.numWide : ""}`}
      value={value ? String(value) : ""}
      onChange={(e) => onChange?.(num(e.target.value))}
    />
  );
}

export default function SecurityTab({ myProfile }: { myProfile: MyProfile | null }) {
  void myProfile;
  const [monthKey, setMonthKey] = useState(defaultMonth());
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [data, setData] = useState<SecData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; text: string } | null>(null);
  const [prevT, setPrevT] = useState<MonthTotals | null>(null);
  const [cfg, setCfg] = useState<SecurityConfig>({ khusus: DEFAULT_KHUSUS, driverNames: {} });
  const [gc, setGc] = useState<GcResult | null>(null);
  const [gcLoading, setGcLoading] = useState(false);
  const [sd, setSd] = useState<SdResult | null>(null);
  const [reloadN, setReloadN] = useState(0);

  const weeks = useMemo(() => weeksOfMonth(monthKey), [monthKey]);
  const wdDays = weeks.reduce((a, w) => a + w.wdDays, 0), weDays = weeks.reduce((a, w) => a + w.weDays, 0);
  const [yy, mm] = monthKey.split("-").map(Number);
  const deadline = useMemo(() => { const n = addMonthsKey(monthKey, 1); const [y, m] = n.split("-").map(Number); return { input: `1 ${MON[m - 1]} ${y}`, report: `3 ${MON[m - 1]} ${y}` }; }, [monthKey]);

  const loadGc = useCallback(async (key: string, force = false) => {
    setGcLoading(true);
    setGc(await fetchGcCases(monthStart(key), monthEnd(key), force));
    setGcLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setMsg(null); setDirty(false);
    (async () => {
      try {
        if (reloadN) await fetchSecDesk(monthKey, monthKey, true);
        const [cur, prev, sdRes] = await Promise.all([getSecurityMonth(monthKey), getSecurityMonth(addMonthsKey(monthKey, -1)), fetchSecDesk(monthKey, monthKey)]);
        if (!alive) return;
        setSd(sdRes);
        setData(cur.data);
        setPrevT(monthTotals(prev.data));
      } catch (e) {
        if (alive) { setData(normalizeData(monthKey, null)); setMsg({ t: "err", text: `Gagal memuat data: ${e instanceof Error ? e.message : String(e)}. Pastikan SQL 01_dasar bagian 021 sudah dijalankan.` }); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    loadGc(monthKey);
    return () => { alive = false; };
  }, [monthKey, loadGc, reloadN]);

  useEffect(() => { getSecurityConfig().then(setCfg).catch(() => {}); }, []);

  const upd = (fn: (d: SecData) => void) => {
    setData((cur) => { if (!cur) return cur; const d: SecData = JSON.parse(JSON.stringify(cur)); fn(d); return d; });
    setDirty(true); setMsg(null);
  };

  async function save(extra?: Partial<SecData>) {
    if (!data) return;
    setSaving(true); setMsg(null);
    try {
      const d = { ...data, ...(extra || {}) };
      await saveSecurityMonth(monthKey, d);
      setData(d); setDirty(false);
      setMsg({ t: "ok", text: `Tersimpan — ${monthLabel(monthKey)}` });
    } catch (e) {
      setMsg({ t: "err", text: `Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  function changeMonth(k: string) {
    if (k === monthKey) return;
    if (dirty && !window.confirm("Ada perubahan yang belum disimpan. Pindah bulan tanpa menyimpan?")) return;
    setMonthKey(k);
  }

  /* ── turunan ── */
  const gcOk = gc && gc.ok ? gc : null;
  const agg: GcAgg | null = useMemo(() => {
    if (!data) return null;
    if (gcOk) return aggregateGc(gcOk.cases, monthStart(monthKey), monthEnd(monthKey), cfg.khusus);
    return aggregateManual(data.pelManual, cfg.khusus);
  }, [gcOk, data, monthKey, cfg.khusus]);

  if (loading || !data || !agg) {
    return <div className={s.wrap}><div className={s.loading}>Memuat data security…</div></div>;
  }

  const t = monthTotals(data);
  const vehSum = (k: VehKey) => sumArr(data.veh?.[k]?.wd) + sumArr(data.veh?.[k]?.we);
  const vehTotal = VEH_CATS.reduce((a, c) => a + vehSum(c.k), 0);
  const timbang = sumArr(data.tr?.wd) + sumArr(data.tr?.we);
  const trTotal = timbang + num(data.tr?.non);
  const bioWeek = sumArr(data.bio?.wd) + sumArr(data.bio?.we);
  const bioTot = num(data.bio?.sekam) + num(data.bio?.abu);
  const visTotal = sumArr(data.vis?.wd) + sumArr(data.vis?.we);
  const kejManual = KEJ_CATS.reduce((a, c) => a + num(data.kej?.[c.id]), 0);
  const kejTotal = kejManual + num(data.tr?.sel) + agg.total;
  const pat = data.pat!;
  const sdOn = !!data.sd;
  const sdR: SdReport | null = sd && sd.ok ? sd.months[monthKey] ?? null : null;
  const done: Record<string, boolean> = {
    kendaraan: VEH_CATS.every((c) => vehSum(c.k) > 0),
    transporter: timbang > 0 && (bioTot === 0 || bioWeek === bioTot),
    pelanggaran: !!gcOk || agg.total > 0,
    kejadian: kejManual > 0 || (data.issues?.length || 0) > 0,
    visit: visTotal > 0,
    patroli: pat.tp > 0 && pat.tc > 0,
  };
  const doneCount = Object.values(done).filter(Boolean).length;

  const weekRows = (pair: { wd: number[]; we: number[] } | undefined, setter: (i: number, side: "wd" | "we", v: number) => void, name: string) =>
    weeks.map((w, i) => (
      <tr key={i}>
        <th scope="row"><b>Minggu {i + 1}</b><small>{w.label} {MON[mm - 1]} · {w.wdDays} HK{w.weDays ? ` + ${w.weDays} libur` : ""}</small></th>
        <td><NumIn label={`${name} minggu ${i + 1} hari kerja`} value={pair?.wd[i]} onChange={(v) => setter(i, "wd", v)} /></td>
        <td><NumIn label={`${name} minggu ${i + 1} akhir pekan`} value={pair?.we[i]} onChange={(v) => setter(i, "we", v)} /></td>
        <td className={s.tdNum}>{f(num(pair?.wd[i]) + num(pair?.we[i]))}</td>
      </tr>
    ));

  return (
    <div className={s.wrap}>
      {/* header */}
      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.kicker}>Security · Plant Cikarang</span>
          <h1>Laporan Security Bulanan</h1>
          <p>{sdOn
            ? "Semua angka dibaca otomatis dari Security Desk (diisi tim security) dan pelanggaran transporter dari G-C. Tidak perlu input di sini — angka langsung masuk ke Report → Laporan Manajemen."
            : "Input rekap dari laporan security setiap tanggal 1. Angka otomatis masuk ke Report → Laporan Manajemen, modul Security. Pelanggaran transporter dibaca langsung dari G-C."}</p>
        </div>
        <div className={s.headSide}>
          <div className={s.monthPick}>
            <button type="button" className={s.navBtn} aria-label="Bulan sebelumnya" onClick={() => changeMonth(addMonthsKey(monthKey, -1))}>‹</button>
            <label className={s.field}>
              <span>Periode data</span>
              <div className={s.monthSelects}>
                <select value={mm} onChange={(e) => changeMonth(`${yy}-${String(e.target.value).padStart(2, "0")}`)} aria-label="Bulan">
                  {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                </select>
                <select value={yy} onChange={(e) => changeMonth(`${e.target.value}-${String(mm).padStart(2, "0")}`)} aria-label="Tahun">
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </label>
            <button type="button" className={s.navBtn} aria-label="Bulan berikutnya" onClick={() => changeMonth(addMonthsKey(monthKey, 1))}>›</button>
          </div>
          <div className={s.chipBox}>
            <span>Jadwal</span>
            <b>Input {deadline.input} · kirim ke manajemen {deadline.report}</b>
          </div>
          <div className={`${s.chipBox} ${doneCount === 6 ? s.chipOk : s.chipWarn}`}>
            <span>Kelengkapan</span>
            <b>{doneCount} / 6 laporan{data.status === "ready" ? " · siap" : ""}</b>
          </div>
        </div>
      </header>

      <nav className={s.tabs} role="tablist" aria-label="Laporan security">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={`${s.tab} ${tab === x.id ? s.tabOn : ""}`} onClick={() => setTab(x.id)}>
            {x.label}
            {x.check && <span className={`${s.dot} ${done[x.id] ? s.dotOk : s.dotWarn}`} aria-hidden="true" />}
          </button>
        ))}
      </nav>

      {msg && <div className={msg.t === "ok" ? s.msgOk : s.msgErr} role="status">{msg.text}</div>}

      <div className={sdOn ? s.sdOn : s.sdOff}>
        <span className={s.sdIcon} aria-hidden="true">{sdOn ? "🔗" : "⚠"}</span>
        <div>
          <b>{sdOn ? "Tersinkron dengan Security Desk" : sd && !sd.ok ? "Security Desk belum tersambung" : "Security Desk belum ada data bulan ini"}</b>
          <span>
            {sdOn
              ? `Data ${monthLabel(monthKey)}${sd && sd.ok && sd.site ? ` · site ${sd.site}` : ""} · diperbarui ${new Date(sd && sd.ok ? sd.fetchedAt : Date.now()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Ubah data di Security Desk; CIKOPS mengikuti.`
              : sd && !sd.ok ? `${sd.error} — sementara pakai input manual di bawah. Panduan: docs/PANDUAN.md (bab Security).`
              : sd && sd.ok && sd.sites && !sd.sites.length
                ? "Akun pembaca CIKOPS tidak bisa melihat site mana pun di Security Desk. Beri peran Management ke akun GC_READER_EMAIL (menu Pengguna)."
              : sd && sd.ok && sd.sites && !sd.sites.some((x) => x.n > 0)
                ? `Tidak ada data harian ${monthLabel(monthKey)} yang bisa dibaca akun CIKOPS (site: ${sd.sites.map((x) => x.code).join(", ")}). Pastikan akun GC_READER_EMAIL berperan Management di Security Desk.`
              : `Bulan ini belum diisi di Security Desk${sd && sd.ok && sd.site ? ` (site ${sd.site})` : ""}, jadi data CIKOPS (input manual) yang dipakai.`}
          </span>
        </div>
        <div className={s.sdBtns}>
          <button type="button" className={s.ghostBtn} onClick={() => setReloadN((n) => n + 1)}>Sinkron ulang</button>
          <a className={s.ghostBtn} href={SECDESK_URL} target="_blank" rel="noreferrer">Buka Security Desk ↗</a>
        </div>
      </div>

      {/* ═════ RINGKASAN ═════ */}
      {tab === "ringkasan" && (
        <section className={s.stack}>
          <div className={s.cards}>
            {[
              { id: "kendaraan" as Tab, title: "Laporan Kendaraan All", stats: [["Total kendaraan", f(vehTotal)], ["Mobil karyawan", f(vehSum("kary"))]], note: "4 kategori × minggu (hari kerja / akhir pekan)" },
              { id: "transporter" as Tab, title: "Laporan Transporter", stats: [["Timbang + non", f(trTotal)], ["Biomas", f(bioTot)]], note: bioTot && bioWeek !== bioTot ? "Biomas: total mingguan belum sama dengan sekam + abu" : `Selisih timbang ≥ 40 kg: ${f(num(data.tr?.sel))}` },
              { id: "pelanggaran" as Tab, title: "Pelanggaran Transporter", stats: [["Kasus", f(agg.total)], ["Becis & JMM", f(agg.khusus.total)]], note: gcOk ? "Otomatis dari G-C — tidak perlu input" : "G-C tidak tersambung — pakai input manual" },
              { id: "kejadian" as Tab, title: "Laporan Kejadian", stats: [["Total kejadian", f(kejTotal)], ["Issue area", f(data.issues?.length || 0)]], note: `Lost & Found ${f(num(data.kej?.["Lost & Found"]))} · Kerusakan fasilitas ${f(num(data.kej?.["Kerusakan Fasilitas"]))}` },
              { id: "visit" as Tab, title: "Laporan Visit", stats: [["Visitor", f(visTotal)], ["Team support", f(TEAM_KEYS.reduce((a, k) => a + num(data.team?.[k]), 0))]], note: delta(visTotal, prevT?.vis).txt },
              { id: "patroli" as Tab, title: "Patrol Activity", stats: [["Patroli", pctTxt(pat.ap, pat.tp)], ["Checkpoint", pctTxt(pat.ac, pat.tc)]], note: `${f(pat.missed)} patroli missed` },
            ].map((c) => (
              <article key={c.id} className={s.card}>
                <div className={s.cardHead}>
                  <b>{c.title}</b>
                  <span className={done[c.id] ? s.badgeOk : s.badgeWarn}>{c.id === "pelanggaran" && gcOk ? "Sinkron G-C" : sdOn && c.id !== "pelanggaran" ? (done[c.id] ? "Security Desk" : "Belum diisi di Security Desk") : done[c.id] ? "Lengkap" : "Perlu dilengkapi"}</span>
                </div>
                <div className={s.cardStats}>
                  {c.stats.map(([l, v]) => <div key={l}><small>{l}</small><strong>{v}</strong></div>)}
                </div>
                <span className={s.cardNote}>{c.note}</span>
                <button type="button" className={s.ghostBtn} onClick={() => setTab(c.id)}>{(c.id === "pelanggaran" && gcOk) || (sdOn && c.id !== "pelanggaran") ? "Lihat data" : done[c.id] ? "Lihat / ubah" : "Lengkapi"}</button>
              </article>
            ))}
          </div>
          <div className={s.readyBar}>
            <span>Setelah semua lengkap, buka <b>Report → Laporan Manajemen</b>, centang <b>Security</b>, pilih periode {monthLabel(monthKey)}, lalu unduh Excel / PowerPoint / PDF.</span>
            <button type="button" className={s.primary} disabled={saving} onClick={() => save({ status: data.status === "ready" ? "draft" : "ready" })}>
              {data.status === "ready" ? "Batalkan status siap" : "Tandai siap dilaporkan"}
            </button>
          </div>
        </section>
      )}

      <fieldset className={s.fs} disabled={sdOn}>
      {/* ═════ KENDARAAN ═════ */}
      {tab === "kendaraan" && (
        <section className={s.stack}>
          <div className={s.panel}>
            <div className={s.panelHead}>
              <div><h2>Laporan Kendaraan All</h2><p>Jumlah kendaraan masuk per minggu, dipisah hari kerja (HK) dan akhir pekan. Minggu mengikuti kalender Senin–Minggu.</p></div>
            </div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th rowSpan={2}>Minggu</th>
                    {VEH_CATS.map((c) => <th key={c.k} colSpan={2} className={s.thGroup}>{c.id}{c.noteId ? <small>{c.noteId}</small> : null}</th>)}
                  </tr>
                  <tr>{VEH_CATS.map((c) => [<th key={`${c.k}w`} className={s.thSub}>HK</th>, <th key={`${c.k}e`} className={s.thSub}>Libur</th>])}</tr>
                </thead>
                <tbody>
                  {weeks.map((w, i) => (
                    <tr key={i}>
                      <th scope="row"><b>Minggu {i + 1}</b><small>{w.label} {MON[mm - 1]}</small></th>
                      {VEH_CATS.map((c) => [
                        <td key={`${c.k}w`}><NumIn label={`${c.id} minggu ${i + 1} hari kerja`} value={data.veh?.[c.k]?.wd[i]} onChange={(v) => upd((d) => { d.veh![c.k]!.wd[i] = v; })} /></td>,
                        <td key={`${c.k}e`}><NumIn label={`${c.id} minggu ${i + 1} akhir pekan`} value={data.veh?.[c.k]?.we[i]} onChange={(v) => upd((d) => { d.veh![c.k]!.we[i] = v; })} /></td>,
                      ])}
                    </tr>
                  ))}
                  <tr className={s.totalRow}>
                    <th scope="row">Total</th>
                    {VEH_CATS.map((c) => [<td key={`${c.k}w`} className={s.tdNum}>{f(sumArr(data.veh?.[c.k]?.wd))}</td>, <td key={`${c.k}e`} className={s.tdNum}>{f(sumArr(data.veh?.[c.k]?.we))}</td>])}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className={s.kpis}>
            {VEH_CATS.map((c) => {
              const tot = vehSum(c.k); const d = delta(tot, prevT?.[c.k]);
              return (
                <div key={c.k} className={s.kpi}>
                  <small>{c.id}</small>
                  <strong>{f(tot)}</strong>
                  <span className={d.up === null ? s.mute : d.up ? s.up : s.down}>{d.txt}</span>
                  <span className={s.mute}>Rata-rata {f(Math.round(sumArr(data.veh?.[c.k]?.wd) / Math.max(1, wdDays)))} / hari kerja · {f(Math.round(sumArr(data.veh?.[c.k]?.we) / Math.max(1, weDays)))} / hari libur</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═════ TRANSPORTER ═════ */}
      {tab === "transporter" && (
        <section className={s.grid2}>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Transporter material</h2><p>Kendaraan timbang per minggu dan total non-timbang sebulan.</p></div></div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>Minggu</th><th className={s.thSub}>Timbang HK</th><th className={s.thSub}>Timbang libur</th><th className={s.thSub}>Total</th></tr></thead>
                <tbody>{weekRows(data.tr, (i, side, v) => upd((d) => { d.tr![side][i] = v; }), "Timbang")}</tbody>
              </table>
            </div>
            <div className={s.fields3}>
              <label className={s.field}><span>Non-timbang (sebulan)</span><NumIn wide label="Non-timbang" value={data.tr?.non} onChange={(v) => upd((d) => { d.tr!.non = v; })} /></label>
              <label className={s.field}><span>Selisih timbang ≥ 40 kg</span><NumIn wide label="Selisih timbang" value={data.tr?.sel} onChange={(v) => upd((d) => { d.tr!.sel = v; })} /></label>
              <label className={s.field}><span>dari kendaraan Palm Oil / Fat Blend</span><NumIn wide label="Kendaraan Palm Oil / Fat Blend" value={data.tr?.po} onChange={(v) => upd((d) => { d.tr!.po = v; })} /></label>
            </div>
            <div className={s.sumBar}>
              <span>Timbang <b>{f(timbang)}</b></span><span>Non-timbang <b>{f(num(data.tr?.non))}</b></span><span>Total <b>{f(trTotal)}</b></span>
              <span className={s.mute}>{delta(trTotal, prevT && (prevT.timbang !== null || prevT.non !== null) ? (prevT.timbang || 0) + (prevT.non || 0) : null).txt}</span>
            </div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Biomas — PT Becis</h2><p>Total suplai sekam & buang abu sebulan, lalu sebaran kendaraan per minggu.</p></div></div>
            <div className={s.fields2}>
              <label className={s.field}><span>Suplai sekam (unit)</span><NumIn wide label="Suplai sekam" value={data.bio?.sekam} onChange={(v) => upd((d) => { d.bio!.sekam = v; })} /></label>
              <label className={s.field}><span>Buang abu (unit)</span><NumIn wide label="Buang abu" value={data.bio?.abu} onChange={(v) => upd((d) => { d.bio!.abu = v; })} /></label>
            </div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>Minggu</th><th className={s.thSub}>HK</th><th className={s.thSub}>Libur</th><th className={s.thSub}>Total</th></tr></thead>
                <tbody>{weekRows(data.bio, (i, side, v) => upd((d) => { d.bio![side][i] = v; }), "Biomas")}</tbody>
              </table>
            </div>
            {bioTot > 0 && (
              <div className={bioWeek === bioTot ? s.checkOk : s.checkWarn}>
                {bioWeek === bioTot ? `✓ Total mingguan (${f(bioWeek)}) sama dengan sekam + abu (${f(bioTot)}).` : `⚠ Total mingguan ${f(bioWeek)}, sedangkan sekam + abu ${f(bioTot)}. Periksa lagi.`}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "transporter" && sdR && <GatePanel g={sdR.gate} />}
      </fieldset>

      {/* ═════ PELANGGARAN ═════ */}
      {tab === "pelanggaran" && (
        <PelanggaranView
          gc={gc} gcLoading={gcLoading} agg={agg} cfg={cfg} monthKey={monthKey} data={data}
          onResync={() => loadGc(monthKey, true)}
          onManual={(p) => upd((d) => { d.pelManual = p; })}
          onName={async (hash, name, co) => {
            const next = { ...cfg.driverNames };
            if (name.trim()) next[hash] = { name: name.trim(), co }; else delete next[hash];
            setCfg({ ...cfg, driverNames: next });
            try { await saveSecurityConfig("driver_names", next); setMsg({ t: "ok", text: "Nama driver tersimpan." }); } catch (e) { setMsg({ t: "err", text: `Gagal menyimpan nama: ${e instanceof Error ? e.message : String(e)}` }); }
          }}
        />
      )}

      <fieldset className={s.fs} disabled={sdOn}>
      {/* ═════ KEJADIAN ═════ */}
      {tab === "kejadian" && (
        <section className={s.stack}>
          <div className={s.panel}>
            <div className={s.panelHead}>
              <div><h2>Laporan Kejadian — jumlah per jenis</h2><p>Dua jenis bertanda <b className={s.autoTxt}>otomatis</b> terisi dari form lain dan tidak perlu diketik.</p></div>
              <div className={s.bigStat}><small>Total kejadian</small><strong>{f(kejTotal)}</strong></div>
            </div>
            <div className={s.kejGrid}>
              {KEJ_CATS.map((c) => (
                <label key={c.id} className={s.kejBox}>
                  <span>{c.id}</span>
                  <NumIn wide label={c.id} value={data.kej?.[c.id]} onChange={(v) => upd((d) => { d.kej![c.id] = v; })} />
                </label>
              ))}
              <label className={`${s.kejBox} ${s.kejAuto}`}>
                <span>{KEJ_AUTO_TIMBANG.id} <em>otomatis</em></span>
                <NumIn wide disabled label={KEJ_AUTO_TIMBANG.id} value={data.tr?.sel} />
              </label>
              <label className={`${s.kejBox} ${s.kejAuto}`}>
                <span>{KEJ_AUTO_PEL.id} <em>otomatis</em></span>
                <NumIn wide disabled label={KEJ_AUTO_PEL.id} value={agg.total} />
              </label>
            </div>
          </div>
          <IssuesPanel monthKey={monthKey} issues={data.issues || []} onChange={(list) => upd((d) => { d.issues = list; })} />
        </section>
      )}

      {/* ═════ VISIT ═════ */}
      {tab === "visit" && (
        <section className={s.grid2}>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Visitor</h2><p>Jumlah tamu per minggu.</p></div></div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>Minggu</th><th className={s.thSub}>HK</th><th className={s.thSub}>Libur</th><th className={s.thSub}>Total</th></tr></thead>
                <tbody>{weekRows(data.vis, (i, side, v) => upd((d) => { d.vis![side][i] = v; }), "Visitor")}</tbody>
              </table>
            </div>
            <div className={s.sumBar}><span>Total visitor <b>{f(visTotal)}</b></span><span className={s.mute}>{delta(visTotal, prevT?.vis).txt}</span></div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Kunjungan team support pengamanan</h2><p>Jumlah kunjungan per kelompok, plus siapa saja yang berkunjung.</p></div></div>
            <div className={s.fields2}>
              {TEAM_KEYS.map((k) => (
                <label key={k} className={s.field}><span>{k}</span><NumIn wide label={`Kunjungan ${k}`} value={data.team?.[k]} onChange={(v) => upd((d) => { d.team![k] = v; })} /></label>
              ))}
            </div>
            <label className={s.field}>
              <span>Catatan kunjungan</span>
              <textarea rows={4} className={s.textarea} value={data.teamNote || ""} onChange={(e) => upd((d) => { d.teamNote = e.target.value; })} placeholder="mis. External: BHABINSA, Polsek … · G4S: Supervisor Area, OH …" />
            </label>
          </div>
        </section>
      )}

      {/* ═════ PATROLI ═════ */}
      {tab === "patroli" && (
        <section className={s.grid2}>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Patrol activity</h2><p>Angka dari sistem guard tour, satu kali per bulan.</p></div></div>
            <div className={s.fields2}>
              {([["tp", "Target patrol"], ["ap", "Actual patrol"], ["tc", "Target checkpoint"], ["ac", "Actual checkpoint"], ["missed", "Missed"]] as const).map(([k, l]) => (
                <label key={k} className={s.field}><span>{l}</span><NumIn wide label={l} value={pat[k]} onChange={(v) => upd((d) => { d.pat![k] = v; })} /></label>
              ))}
            </div>
            <label className={s.field}>
              <span>Catatan (penyebab missed, dll.)</span>
              <textarea rows={3} className={s.textarea} value={pat.note || ""} onChange={(e) => upd((d) => { d.pat!.note = e.target.value; })} placeholder="Opsional" />
            </label>
          </div>
          <div className={s.panel}>
            <span className={s.kicker}>Hasil otomatis</span>
            {[
              { l: "Tour schedule (patroli)", a: pat.ap, b: pat.tp, sub: `${f(pat.ap)} dari ${f(pat.tp)} patroli · ${f(pat.missed)} missed` },
              { l: "Tour checkpoint", a: pat.ac, b: pat.tc, sub: `${f(pat.ac)} dari ${f(pat.tc)} checkpoint · ${f(Math.max(0, pat.tc - pat.ac))} tidak terpindai` },
            ].map((x) => (
              <div key={x.l} className={s.meter}>
                <div className={s.meterHead}><span>{x.l}</span><strong>{pctTxt(x.a, x.b)}</strong></div>
                <div className={s.meterTrack}><div className={s.meterFill} style={{ width: `${x.b ? Math.min(100, (x.a / x.b) * 100) : 0}%` }} /></div>
                <small className={s.mute}>{x.sub}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      </fieldset>

      {/* ═════ PERSONEL & KPI (dari Security Desk) ═════ */}
      {tab === "personel" && <PersonelView r={sdR} monthKey={monthKey} />}

      {tab === "riwayat" && <HistoryPanel monthKey={monthKey} onSaved={(text) => setMsg({ t: "ok", text })} onError={(text) => setMsg({ t: "err", text })} />}

      {tab === "pengaturan" && (
        <SettingsPanel
          cfg={cfg}
          onSaveKhusus={async (list) => {
            await saveSecurityConfig("khusus_companies", list); setCfg({ ...cfg, khusus: list });
          }}
          onSaveNames={async (names) => {
            await saveSecurityConfig("driver_names", names); setCfg({ ...cfg, driverNames: names });
          }}
        />
      )}

      {/* simpan */}
      {!["ringkasan", "personel", "riwayat", "pengaturan"].includes(tab) && !(tab === "pelanggaran" && gcOk) && !(sdOn && tab !== "pelanggaran") && (
        <div className={`${s.saveBar} ${dirty ? s.saveBarDirty : ""}`}>
          <span>{dirty ? "Ada perubahan yang belum disimpan." : `Data ${monthLabel(monthKey)}`}</span>
          <div className={s.saveBtns}>
            <button type="button" className={s.ghostBtn} onClick={() => setTab("ringkasan")}>Kembali ke ringkasan</button>
            <button type="button" className={s.primary} disabled={saving || !dirty} onClick={() => save()}>{saving ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════ Pelanggaran transporter ═════════════ */
function PelanggaranView({ gc, gcLoading, agg, cfg, monthKey, data, onResync, onManual, onName }: {
  gc: GcResult | null; gcLoading: boolean; agg: GcAgg; cfg: SecurityConfig; monthKey: string; data: SecData;
  onResync: () => void; onManual: (p: PelManual) => void; onName: (hash: string, name: string, co: string) => void;
}) {
  const gcOk = gc && gc.ok ? gc : null;
  const [manual, setManual] = useState(!gcOk);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setManual(!gcOk); }, [gcOk]);
  const maxJ = Math.max(1, ...agg.jenis.map((j) => j.n));
  const kNames = cfg.khusus.map((k) => k.replace(/^PT\.?\s*/i, "")).join(" & ");
  return (
    <section className={s.stack}>
      {gcOk ? (
        <div className={s.syncOk}>
          <div>
            <b>Tersinkron otomatis dari G-C (Kepatuhan Transporter)</b>
            <span>Laporan NC berstatus Accept · plant {gcOk.plant} · diperbarui {new Date(gcOk.fetchedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · tidak perlu input</span>
          </div>
          <div className={s.saveBtns}>
            <button type="button" className={s.ghostBtn} disabled={gcLoading} onClick={onResync}>{gcLoading ? "Menyinkron…" : "Sinkron ulang"}</button>
            <button type="button" className={s.ghostBtn} onClick={() => setManual((m) => !m)}>{manual ? "Sembunyikan input manual" : "Input manual (cadangan)"}</button>
          </div>
        </div>
      ) : (
        <div className={s.syncWarn}>
          <div>
            <b>{gc && !gc.ok && gc.notConfigured ? "Sinkron G-C belum dikonfigurasi" : "G-C tidak dapat dihubungi"}</b>
            <span>{gc && !gc.ok ? gc.error : "Memeriksa koneksi…"} — sementara pakai input manual di bawah. Panduan: docs/PANDUAN.md (bab Security).</span>
          </div>
          <button type="button" className={s.ghostBtn} disabled={gcLoading} onClick={onResync}>{gcLoading ? "Mencoba…" : "Coba lagi"}</button>
        </div>
      )}

      <div className={s.pelLayout}>
        <div className={s.stack}>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Pelanggaran per perusahaan</h2><p>Dihitung per laporan NC (kasus) · {f(agg.companies.length)} perusahaan</p></div></div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>#</th><th>Perusahaan</th><th className={s.thSub}>Kasus</th><th className={s.thSub}>Temuan</th></tr></thead>
                <tbody>
                  {agg.companies.length === 0 && <tr><td colSpan={4} className={s.empty}>Belum ada pelanggaran pada {monthLabel(monthKey)}.</td></tr>}
                  {(showAll ? agg.companies : agg.companies.slice(0, 15)).map((c, i) => (
                    <tr key={c.name} className={c.khusus ? s.rowKhusus : undefined}>
                      <td className={s.mute}>{i + 1}</td>
                      <td>{c.name} {c.khusus && <span className={s.tagKhusus}>KHUSUS</span>}</td>
                      <td className={s.tdNum}><b>{f(c.n)}</b></td>
                      <td className={s.tdNum}>{f(c.t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {agg.companies.length > 15 && (
              <button type="button" className={s.ghostBtn} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Tampilkan 15 teratas" : `Tampilkan semua (${agg.companies.length} perusahaan)`}
              </button>
            )}
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Jenis pelanggaran</h2><p>Dihitung per temuan · {f(agg.temuan)} temuan</p></div></div>
            {agg.jenis.length === 0 && <p className={s.empty}>Belum ada data.</p>}
            {agg.jenis.map((j) => (
              <div key={j.name} className={s.barRow}>
                <span>{j.name}</span>
                <div className={s.barTrack}><div className={s.barFill} style={{ width: `${(j.n / maxJ) * 100}%` }} /></div>
                <b>{f(j.n)}</b>
              </div>
            ))}
          </div>
          <div className={`${s.panel} ${s.panelKhusus}`}>
            <div className={s.panelHead}><div><h2>Khusus {kNames}</h2><p>Nama perusahaan khusus diatur di tab Pengaturan (harus persis sama dengan master supplier G-C).</p></div></div>
            <div className={s.fields2}>
              <div className={s.miniList}><small>Per perusahaan</small>{agg.khusus.byCo.map((c) => <div key={c.name}><span>{c.name}</span><b>{f(c.n)}</b></div>)}</div>
              <div className={s.miniList}><small>Jenis</small>{agg.khusus.jenis.length ? agg.khusus.jenis.map((j) => <div key={j.name}><span>{j.name}</span><b>{f(j.n)}</b></div>) : <span className={s.mute}>Nihil</span>}</div>
            </div>
            <div className={s.miniList}>
              <small>Driver pelanggar {gcOk ? "(dikenali dari nomor SIM — beri nama sekali, tersimpan untuk bulan berikutnya)" : ""}</small>
              {agg.khusus.drivers.length === 0 && <span className={s.mute}>Nihil</span>}
              {agg.khusus.drivers.map((d) => (
                <DriverRow key={d.hash} d={d} label={driverLabel(d, cfg.driverNames)} named={!!cfg.driverNames[d.hash] || d.hash.startsWith("manual:")} editable={!!gcOk} onName={onName} />
              ))}
            </div>
          </div>
        </div>
        <aside className={s.stack}>
          <div className={s.panel}>
            <span className={s.kicker}>{monthLabel(monthKey)}</span>
            <div className={s.bigRow}><strong>{f(agg.total)}</strong><span>kasus · {f(agg.temuan)} temuan</span></div>
            <div className={s.fields2}>
              <div className={`${s.statBox} ${s.statKhusus}`}><small>{kNames}</small><strong>{f(agg.khusus.total)}</strong><span>{agg.khusus.byCo.map((c) => `${c.name.replace(/^PT\.?\s*/i, "")} ${c.n}`).join(" · ")}</span></div>
              <div className={s.statBox}><small>Perusahaan lain</small><strong>{f(agg.total - agg.khusus.total)}</strong><span>{f(agg.companies.filter((c) => !c.khusus).length)} perusahaan</span></div>
            </div>
            <div className={s.miniList}>
              <small>Driver berulang (SIM sama)</small>
              {agg.repeat.length ? agg.repeat.slice(0, 6).map((d) => <div key={d.hash}><span>{driverLabel(d, cfg.driverNames)} — {d.co}</span><b>{d.n}×</b></div>) : <span className={s.mute}>Tidak ada</span>}
            </div>
          </div>
        </aside>
      </div>

      {manual && <ManualPel value={data.pelManual} khusus={cfg.khusus} onChange={onManual} />}
    </section>
  );
}

function DriverRow({ d, label, named, editable, onName }: { d: { hash: string; last4: string; nopol: string; co: string; n: number }; label: string; named: boolean; editable: boolean; onName: (hash: string, name: string, co: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(named ? label : "");
  return (
    <div className={s.drvRow}>
      {edit ? (
        <input className={s.text} autoFocus value={val} placeholder="Nama driver" aria-label="Nama driver" onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onName(d.hash, val, d.co); setEdit(false); } if (e.key === "Escape") setEdit(false); }} />
      ) : (
        <span><b>{label}</b>{named && d.last4 ? <small> · SIM ••{d.last4}</small> : null}</span>
      )}
      <span className={s.mute}>{d.co.replace(/^PT\.?\s*/i, "")}</span>
      <span className={d.n > 1 ? s.badgeBad : s.badgeMute}>{d.n}×</span>
      {editable && (edit
        ? <button type="button" className={s.smallBtn} onClick={() => { onName(d.hash, val, d.co); setEdit(false); }}>Simpan</button>
        : <button type="button" className={s.smallBtn} onClick={() => setEdit(true)}>{named ? "Ubah nama" : "Beri nama"}</button>)}
    </div>
  );
}

function ManualPel({ value, khusus, onChange }: { value: PelManual | undefined; khusus: string[]; onChange: (p: PelManual) => void }) {
  const v: PelManual = value || { companies: [], jenis: {}, kJenis: {}, drivers: [] };
  const [co, setCo] = useState(""); const [n, setN] = useState(0);
  const [dn, setDn] = useState(""); const [dco, setDco] = useState(khusus[khusus.length - 1] || ""); const [dc, setDc] = useState(1);
  const set = (fn: (p: PelManual) => void) => { const p: PelManual = JSON.parse(JSON.stringify(v)); fn(p); onChange(p); };
  const coTotal = v.companies.reduce((a, c) => a + num(c.n), 0);
  const jTotal = Object.values(v.jenis).reduce((a, x) => a + num(x), 0);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}><div><h2>Input manual (cadangan)</h2><p>Dipakai di report hanya bila G-C tidak tersambung. Totalnya: {f(coTotal)} kasus, {f(jTotal)} temuan.</p></div></div>
      <div className={s.grid2}>
        <div className={s.stack}>
          <small className={s.kicker}>Rekap per perusahaan</small>
          {v.companies.map((c, i) => (
            <div key={i} className={s.manualRow}>
              <span>{c.name}{khusus.map(normCo).includes(normCo(c.name)) && <span className={s.tagKhusus}>KHUSUS</span>}</span>
              <NumIn label={`Kasus ${c.name}`} value={c.n} onChange={(x) => set((p) => { p.companies[i].n = x; })} />
              <button type="button" className={s.iconBtn} aria-label={`Hapus ${c.name}`} onClick={() => set((p) => { p.companies.splice(i, 1); })}>✕</button>
            </div>
          ))}
          <div className={s.manualRow}>
            <input className={s.text} placeholder="Nama perusahaan…" aria-label="Nama perusahaan baru" value={co} onChange={(e) => setCo(e.target.value)} />
            <NumIn label="Jumlah kasus" value={n} onChange={setN} />
            <button type="button" className={s.smallBtn} onClick={() => { if (!co.trim()) return; set((p) => { p.companies.push({ name: co.trim().toUpperCase(), n }); }); setCo(""); setN(0); }}>+ Tambah</button>
          </div>
        </div>
        <div className={s.stack}>
          <small className={s.kicker}>Rekap per jenis (semua perusahaan)</small>
          {NC_JENIS.map((j) => (
            <label key={j} className={s.manualRow}><span>{j}</span><NumIn label={j} value={v.jenis[j]} onChange={(x) => set((p) => { p.jenis[j] = x; })} /></label>
          ))}
          {jTotal !== coTotal && coTotal > 0 && <div className={s.checkWarn}>⚠ Rekap per jenis ({f(jTotal)}) belum sama dengan total kasus ({f(coTotal)}). Satu kasus bisa punya lebih dari satu temuan.</div>}
        </div>
      </div>
      <div className={s.grid2}>
        <div className={s.stack}>
          <small className={s.kicker}>Khusus {khusus.join(" & ")} — jenis</small>
          {NC_JENIS.slice(0, 6).map((j) => (
            <label key={j} className={s.manualRow}><span>{j}</span><NumIn label={`Khusus ${j}`} value={v.kJenis[j]} onChange={(x) => set((p) => { p.kJenis[j] = x; })} /></label>
          ))}
        </div>
        <div className={s.stack}>
          <small className={s.kicker}>Khusus — driver pelanggar</small>
          {v.drivers.map((d, i) => (
            <div key={i} className={s.manualRow}>
              <span>{d.name} <small className={s.mute}>{d.co}</small></span>
              <NumIn label={`Kasus ${d.name}`} value={d.n} onChange={(x) => set((p) => { p.drivers[i].n = x; })} />
              <button type="button" className={s.iconBtn} aria-label={`Hapus ${d.name}`} onClick={() => set((p) => { p.drivers.splice(i, 1); })}>✕</button>
            </div>
          ))}
          <div className={s.manualRow}>
            <input className={s.text} placeholder="Nama driver…" aria-label="Nama driver baru" value={dn} onChange={(e) => setDn(e.target.value)} />
            <select className={s.select} aria-label="Perusahaan driver" value={dco} onChange={(e) => setDco(e.target.value)}>{khusus.map((k) => <option key={k}>{k}</option>)}</select>
            <NumIn label="Jumlah kasus driver" value={dc} onChange={(x) => setDc(x || 1)} />
            <button type="button" className={s.smallBtn} onClick={() => { if (!dn.trim()) return; set((p) => { p.drivers.push({ name: dn.trim(), co: dco, n: dc || 1 }); }); setDn(""); setDc(1); }}>+ Driver</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════ Issue area ═════════════ */
function IssuesPanel({ monthKey, issues, onChange }: { monthKey: string; issues: Issue[]; onChange: (list: Issue[]) => void }) {
  const [tgl, setTgl] = useState(monthStart(monthKey));
  const [kat, setKat] = useState(KEJ_CATS[3].id);
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<Issue["status"]>("Open");
  useEffect(() => { setTgl(monthStart(monthKey)); }, [monthKey]);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}><div><h2>Issue area — kejadian penting bulan ini</h2><p>Ditampilkan sebagai sorotan di laporan. Kejadian berstatus Open masuk daftar &quot;perlu perhatian manajemen&quot;.</p></div></div>
      <div className={s.issueList}>
        {issues.length === 0 && <p className={s.empty}>Belum ada issue area.</p>}
        {[...issues].map((it, i) => ({ it, i })).sort((a, b) => (a.it.tgl < b.it.tgl ? -1 : 1)).map(({ it, i }) => (
          <div key={i} className={s.issue}>
            <b>{dateShort(it.tgl)}</b>
            <span className={s.issueKat}>{it.kat}</span>
            <span className={s.issueDesc}>{it.desc}</span>
            <button type="button" className={it.status === "Open" ? s.badgeBad : s.badgeOk} title="Klik untuk ubah status"
              onClick={() => onChange(issues.map((x, j) => (j === i ? { ...x, status: x.status === "Open" ? "Close" : "Open" } : x)))}>{it.status}</button>
            <button type="button" className={s.iconBtn} aria-label={`Hapus kejadian ${dateShort(it.tgl)}`} onClick={() => onChange(issues.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div className={s.issueForm}>
        <input type="date" className={s.text} aria-label="Tanggal kejadian" value={tgl} min={monthStart(monthKey)} max={monthEnd(monthKey)} onChange={(e) => setTgl(e.target.value)} />
        <select className={s.select} aria-label="Jenis kejadian" value={kat} onChange={(e) => setKat(e.target.value)}>{KEJ_CATS.map((c) => <option key={c.id}>{c.id}</option>)}</select>
        <input className={s.text} placeholder="Deskripsi singkat kejadian…" aria-label="Deskripsi kejadian" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <select className={s.select} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Issue["status"])}><option>Open</option><option>Close</option></select>
        <button type="button" className={s.primary} onClick={() => { if (!desc.trim()) return; onChange([...issues, { tgl, kat, desc: desc.trim(), status }]); setDesc(""); }}>+ Tambah</button>
      </div>
    </div>
  );
}

/* ═════════════ Riwayat 12 bulan ═════════════ */
const HIST_COLS: { k: TotalKey; l: string; from: (t: MonthTotals) => number | null }[] = [
  { k: "kary", l: "Mobil karyawan", from: (t) => t.kary },
  { k: "tamu", l: "Mobil tamu", from: (t) => t.tamu },
  { k: "kontr", l: "Mobil kontraktor", from: (t) => t.kontr },
  { k: "motor", l: "Motor", from: (t) => t.motor },
  { k: "vis", l: "Visitor", from: (t) => t.vis },
  { k: "timbang", l: "Timbang", from: (t) => t.timbang },
  { k: "non", l: "Non-timbang", from: (t) => t.non },
  { k: "biomas", l: "Biomas", from: (t) => t.biomas },
  { k: "pel", l: "Pelanggaran*", from: (t) => t.pelHist },
  { k: "kej", l: "Kejadian manual", from: (t) => t.kejManual },
];

function HistoryPanel({ monthKey, onSaved, onError }: { monthKey: string; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const keys = useMemo(() => monthKeysBetween(addMonthsKey(monthKey, -12), monthKey), [monthKey]);
  const [rows, setRows] = useState<Record<string, SecData>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Record<TotalKey, number>>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSecurityMonths(keys[0], keys[keys.length - 1]).then(setRows).catch((e) => onError(`Gagal memuat riwayat: ${e?.message || e}`));
    setEdits({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const weeklyFilled = (k: string, col: TotalKey) => {
    const d = rows[k];
    if (!d) return false;
    if (col === "kary" || col === "tamu" || col === "kontr" || col === "motor") return sumArr(d.veh?.[col]?.wd) + sumArr(d.veh?.[col]?.we) > 0;
    if (col === "vis") return sumArr(d.vis?.wd) + sumArr(d.vis?.we) > 0;
    if (col === "timbang") return sumArr(d.tr?.wd) + sumArr(d.tr?.we) > 0;
    if (col === "non") return num(d.tr?.non) > 0;
    if (col === "biomas") return num(d.bio?.sekam) + num(d.bio?.abu) > 0;
    if (col === "kej") return d.kej ? Object.values(d.kej).some((x) => num(x) > 0) : false;
    return false;
  };
  async function saveAll() {
    setBusy(true);
    try {
      for (const k of Object.keys(edits)) {
        const totals = { ...(rows[k]?.totals || {}), ...edits[k] };
        Object.keys(totals).forEach((c) => { if ((totals as Record<string, number | undefined>)[c] === undefined || Number.isNaN((totals as Record<string, number>)[c])) delete (totals as Record<string, number>)[c]; });
        await saveSecurityTotals(k, totals);
      }
      setRows(await getSecurityMonths(keys[0], keys[keys.length - 1]));
      setEdits({});
      onSaved("Riwayat tersimpan.");
    } catch (e) {
      onError(`Gagal menyimpan riwayat: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  const dirty = Object.keys(edits).length > 0;
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2>Riwayat 13 bulan — untuk grafik tren</h2>
          <p>Isi total sebulan untuk bulan yang tidak diinput per minggu (mis. dari laporan security lama). Bulan yang sudah diisi per minggu dihitung otomatis dan tidak bisa diubah di sini. *Pelanggaran: isi hanya untuk bulan sebelum G-C dipakai; bila diisi, angka ini menggantikan data G-C bulan tsb.</p>
        </div>
        <button type="button" className={s.primary} disabled={!dirty || busy} onClick={saveAll}>{busy ? "Menyimpan…" : "Simpan riwayat"}</button>
      </div>
      <div className={s.tableBox}>
        <table className={`${s.table} ${s.histTable}`}>
          <thead><tr><th>Bulan</th>{HIST_COLS.map((c) => <th key={c.k} className={s.thSub}>{c.l}</th>)}</tr></thead>
          <tbody>
            {keys.map((k) => {
              const tt = monthTotals(rows[k]);
              return (
                <tr key={k} className={k === monthKey ? s.rowCurrent : undefined}>
                  <th scope="row"><b>{monthShortLabel(k)}</b></th>
                  {HIST_COLS.map((c) => {
                    const auto = weeklyFilled(k, c.k);
                    const v = edits[k]?.[c.k] ?? (auto ? c.from(tt) : rows[k]?.totals?.[c.k]);
                    return (
                      <td key={c.k}>
                        {auto
                          ? <span className={s.autoVal} title="Dari input mingguan">{f(c.from(tt) || 0)}</span>
                          : <NumIn label={`${c.l} ${monthLabel(k)}`} value={v ?? undefined} onChange={(x) => setEdits((e) => ({ ...e, [k]: { ...(e[k] || {}), [c.k]: x } }))} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ═════════════ Pengaturan ═════════════ */
interface KhususRow extends Record<string, unknown> { name: string }
interface DriverNameRow extends Record<string, unknown> { hash: string; name: string; co: string }

function SettingsPanel({ cfg, onSaveKhusus, onSaveNames }: { cfg: SecurityConfig; onSaveKhusus: (l: string[]) => Promise<void>; onSaveNames: (n: SecurityConfig["driverNames"]) => Promise<void> }) {
  const [ping, setPing] = useState<GcPing | null>(null);
  const [pinging, setPinging] = useState(false);
  const khusus: KhususRow[] = cfg.khusus.map((name) => ({ name }));
  const names: DriverNameRow[] = Object.entries(cfg.driverNames).map(([hash, v]) => ({ hash, name: v.name, co: v.co || "" }));
  const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
  return (
    <SettingsPage>
      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>Koneksi G-C & Security Desk</h2><p>Data pelanggaran transporter dan laporan security dibaca langsung dari database Security Desk, hanya membaca.</p></div></div>
        <button type="button" className={s.primary} disabled={pinging} onClick={async () => { setPinging(true); setPing(await pingGc()); setPinging(false); }}>{pinging ? "Memeriksa…" : "Cek koneksi"}</button>
        {ping && (
          <div className={ping.ok ? s.checkOk : s.checkWarn}>
            {ping.ok
              ? `✓ Tersambung (${ping.mode === "service" ? "service key" : "akun baca-saja"}) · plant ${ping.plant} · ${f(ping.total || 0)} laporan Accept · terbaru ${ping.latest ? dateShort(ping.latest) : "-"}`
              : `⚠ ${ping.configured ? "Gagal" : "Belum dikonfigurasi"}: ${ping.error || "-"}`}
          </div>
        )}
        <p className={s.mute}>Cara menyambungkan: docs/PANDUAN.md, bab Security (environment variable GC_* di Vercel).</p>
      </section>
      <CrudList<KhususRow>
        icon="🏢" title="Perusahaan khusus" itemName="perusahaan"
        desc={<>Pelanggarannya dipisah di laporan (mis. Becis & JMM). Tulis nama <b>persis</b> seperti di master supplier G-C.</>}
        rows={khusus} rowKey={(r) => r.name}
        columns={[{ label: "Nama perusahaan", render: (r) => <b>{r.name}</b> }]}
        fields={[{ key: "name", label: "Nama perusahaan", required: true, placeholder: "PT. NAMA PERUSAHAAN" }]}
        onCreate={async (v) => { const n = norm(v.name); if (cfg.khusus.includes(n)) throw new Error("Perusahaan ini sudah ada."); await onSaveKhusus([...cfg.khusus, n]); }}
        onUpdate={async (row, v) => { const n = norm(v.name); if (n !== row.name && cfg.khusus.includes(n)) throw new Error("Perusahaan ini sudah ada."); await onSaveKhusus(cfg.khusus.map((k) => (k === row.name ? n : k))); }}
        onDelete={async (row) => { await onSaveKhusus(cfg.khusus.filter((k) => k !== row.name)); }}
      />
      <CrudList<DriverNameRow>
        icon="🪪" title="Nama driver transporter" itemName="nama driver"
        desc="G-C tidak menyimpan nama driver. Nama ditautkan ke kode acak dari nomor SIM (nomor SIM asli tidak disimpan). Nama baru diberikan dari tab Pelanggaran Transporter."
        empty="Belum ada nama driver."
        rows={names} rowKey={(r) => r.hash}
        columns={[
          { label: "Nama", render: (r) => <b>{r.name}</b> },
          { label: "Perusahaan", render: (r) => r.co || "—" },
          { label: "Kode", render: (r) => <code>{r.hash.slice(0, 6)}</code> },
        ]}
        fields={[
          { key: "name", label: "Nama driver", required: true },
          { key: "co", label: "Perusahaan", type: "select", options: cfg.khusus.map((k) => ({ value: k, label: k })) },
        ]}
        onUpdate={async (row, v) => { await onSaveNames({ ...cfg.driverNames, [row.hash]: { name: String(v.name).trim(), co: String(v.co ?? "") || undefined } }); }}
        onDelete={async (row) => { const n = { ...cfg.driverNames }; delete n[row.hash]; await onSaveNames(n); }}
      />
    </SettingsPage>
  );
}
