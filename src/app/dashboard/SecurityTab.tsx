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
import { plantFull } from "@/lib/brand";

import { loc , L} from "@/lib/i18n";
type Tab = "ringkasan" | "kendaraan" | "transporter" | "pelanggaran" | "kejadian" | "visit" | "patroli" | "personel" | "riwayat" | "pengaturan";
const TABS: { id: Tab; label: string; check?: boolean }[] = [
  { id: "ringkasan", get label() { return L("Ringkasan", "Summary"); } },
  { id: "kendaraan", get label() { return L("Kendaraan All", "All Vehicles"); }, check: true },
  { id: "transporter", label: "Transporter", check: true },
  { id: "pelanggaran", get label() { return L("Pelanggaran Transporter", "Transporter Violations"); }, check: true },
  { id: "kejadian", get label() { return L("Kejadian", "Incidents"); }, check: true },
  { id: "visit", label: "Visit", check: true },
  { id: "patroli", get label() { return L("Patroli", "Patrol"); }, check: true },
  { id: "personel", get label() { return L("Personel & KPI", "Personnel & KPI"); } },
  { id: "riwayat", get label() { return L("Riwayat 12 bulan", "12-Month History"); } },
  { id: "pengaturan", get label() { return L("Pengaturan", "Settings"); } },
];
const mname = (m: number, style: "long" | "short") => new Date(2000, m - 1, 1).toLocaleDateString(loc(), { month: style });
const monthNames = () => Array.from({ length: 12 }, (_, i) => mname(i + 1, "long"));
const f = (n: number) => Number(n || 0).toLocaleString(loc());
const f1 = (n: number) => Number(n || 0).toLocaleString(loc(), { maximumFractionDigits: 1 });
const pctTxt = (a: number, b: number) => (b ? `${f1((a / b) * 100)}%` : "–");
const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${mname(m, "long")} ${y}`; };
const monthShortLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${mname(m, "short")} ${String(y).slice(2)}`; };
const dateShort = (iso: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const [, m, d] = iso.split("-").map(Number); return `${d} ${mname(m, "short")}`; };

function defaultMonth(): string {
  const d = new Date();
  // input dilakukan awal bulan untuk bulan sebelumnya
  const t = d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : new Date(d.getFullYear(), d.getMonth(), 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}
function delta(cur: number, prev: number | null | undefined): { txt: string; up: boolean | null } {
  if (!prev) return { txt: L("belum ada data bulan lalu", "no data for last month"), up: null };
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) < 0.5) return { txt: L(`stabil vs bulan lalu (${f(prev)})`, `flat vs last month (${f(prev)})`), up: null };
  return { txt: `${p > 0 ? "▲" : "▼"} ${f1(Math.abs(p))}% ${L("vs bulan lalu", "vs last month")} (${f(prev)})`, up: p > 0 };
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
  const deadline = useMemo(() => { const n = addMonthsKey(monthKey, 1); const [y, m] = n.split("-").map(Number); return { input: `1 ${mname(m, "short")} ${y}`, report: `3 ${mname(m, "short")} ${y}` }; }, [monthKey]);

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
        if (alive) { setData(normalizeData(monthKey, null)); setMsg({ t: "err", text: L(`Gagal memuat data: ${e instanceof Error ? e.message : String(e)}. Pastikan SQL 01_dasar bagian 021 sudah dijalankan.`, `Failed to load data: ${e instanceof Error ? e.message : String(e)}. Make sure SQL 01_dasar section 021 has been run.`) }); }
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
      setMsg({ t: "err", text: `${L("Gagal menyimpan", "Failed to save")}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  function changeMonth(k: string) {
    if (k === monthKey) return;
    if (dirty && !window.confirm(L("Ada perubahan yang belum disimpan. Pindah bulan tanpa menyimpan?", "There are unsaved changes. Switch month without saving?"))) return;
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
    return <div className={s.wrap}><div className={s.loading}>{L("Memuat data security…", "Loading security data…")}</div></div>;
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
        <th scope="row"><b>{L("Minggu", "Week")} {i + 1}</b><small>{w.label} {mname(mm, "short")} · {w.wdDays} {L("HK", "WD")}{w.weDays ? ` + ${w.weDays} ${L("libur", "off")}` : ""}</small></th>
        <td><NumIn label={L(`${name} minggu ${i + 1} hari kerja`, `${name} week ${i + 1} workdays`)} value={pair?.wd[i]} onChange={(v) => setter(i, "wd", v)} /></td>
        <td><NumIn label={L(`${name} minggu ${i + 1} akhir pekan`, `${name} week ${i + 1} weekend`)} value={pair?.we[i]} onChange={(v) => setter(i, "we", v)} /></td>
        <td className={s.tdNum}>{f(num(pair?.wd[i]) + num(pair?.we[i]))}</td>
      </tr>
    ));

  return (
    <div className={s.wrap}>
      {/* header */}
      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.kicker}>Security · {plantFull("CIK")}</span>
          <h1>{L("Laporan Security Bulanan", "Monthly Security Report")}</h1>
          <p>{sdOn
            ? L("Semua angka dibaca otomatis dari Security Desk (diisi tim security) dan pelanggaran transporter dari G-C. Tidak perlu input di sini — angka langsung masuk ke Report → Laporan Manajemen.", "All figures are read automatically from Security Desk (filled in by the security team) and transporter violations from G-C. No input is needed here — the figures flow straight into Report → Management Report.")
            : L("Input rekap dari laporan security setiap tanggal 1. Angka otomatis masuk ke Report → Laporan Manajemen, modul Security. Pelanggaran transporter dibaca langsung dari G-C.", "Enter the recap from the security report on the 1st of each month. The figures flow automatically into Report → Management Report, Security module. Transporter violations are read directly from G-C.")}</p>
        </div>
        <div className={s.headSide}>
          <div className={s.monthPick}>
            <button type="button" className={s.navBtn} aria-label={L("Bulan sebelumnya", "Previous month")} onClick={() => changeMonth(addMonthsKey(monthKey, -1))}>‹</button>
            <label className={s.field}>
              <span>{L("Periode data", "Data period")}</span>
              <div className={s.monthSelects}>
                <select value={mm} onChange={(e) => changeMonth(`${yy}-${String(e.target.value).padStart(2, "0")}`)} aria-label={L("Bulan", "Month")}>
                  {monthNames().map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                </select>
                <select value={yy} onChange={(e) => changeMonth(`${e.target.value}-${String(mm).padStart(2, "0")}`)} aria-label={L("Tahun", "Year")}>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </label>
            <button type="button" className={s.navBtn} aria-label={L("Bulan berikutnya", "Next month")} onClick={() => changeMonth(addMonthsKey(monthKey, 1))}>›</button>
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

      <nav className={s.tabs} role="tablist" aria-label={L("Laporan security", "Security report")}>
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
          <b>{sdOn ? L("Tersinkron dengan Security Desk", "Synced with Security Desk") : sd && !sd.ok ? L("Security Desk belum tersambung", "Security Desk is not connected") : L("Security Desk belum ada data bulan ini", "No Security Desk data this month")}</b>
          <span>
            {sdOn
              ? L(`Data ${monthLabel(monthKey)}${sd && sd.ok && sd.site ? ` · site ${sd.site}` : ""} · diperbarui ${new Date(sd && sd.ok ? sd.fetchedAt : Date.now()).toLocaleString(loc(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Ubah data di Security Desk; CIKOPS mengikuti.`, `${monthLabel(monthKey)} data${sd && sd.ok && sd.site ? ` · site ${sd.site}` : ""} · updated ${new Date(sd && sd.ok ? sd.fetchedAt : Date.now()).toLocaleString(loc(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Change data in Security Desk; CIKOPS follows.`)
              : sd && !sd.ok ? `${sd.error} — sementara pakai input manual di bawah. Panduan: docs/PANDUAN.md (bab Security).`
              : sd && sd.ok && sd.sites && !sd.sites.length
                ? L("Akun pembaca CIKOPS tidak bisa melihat site mana pun di Security Desk. Beri peran Management ke akun GC_READER_EMAIL (menu Pengguna).", "The CIKOPS reader account cannot see any site in Security Desk. Give the Management role to the GC_READER_EMAIL account (Users menu).")
              : sd && sd.ok && sd.sites && !sd.sites.some((x) => x.n > 0)
                ? L(`Tidak ada data harian ${monthLabel(monthKey)} yang bisa dibaca akun CIKOPS (site: ${sd.sites.map((x) => x.code).join(", ")}). Pastikan akun GC_READER_EMAIL berperan Management di Security Desk.`, `No daily data for ${monthLabel(monthKey)} can be read by the CIKOPS account (sites: ${sd.sites.map((x) => x.code).join(", ")}). Make sure the GC_READER_EMAIL account has the Management role in Security Desk.`)
              : L(`Bulan ini belum diisi di Security Desk${sd && sd.ok && sd.site ? ` (site ${sd.site})` : ""}, jadi data CIKOPS (input manual) yang dipakai.`, `This month has not been filled in Security Desk${sd && sd.ok && sd.site ? ` (site ${sd.site})` : ""}, so CIKOPS data (manual input) is used.`)}
          </span>
        </div>
        <div className={s.sdBtns}>
          <button type="button" className={s.ghostBtn} onClick={() => setReloadN((n) => n + 1)}>Sinkron ulang</button>
          <a className={s.ghostBtn} href={SECDESK_URL} target="_blank" rel="noreferrer">{L("Buka Security Desk ↗", "Open Security Desk ↗")}</a>
        </div>
      </div>

      {/* ═════ RINGKASAN ═════ */}
      {tab === "ringkasan" && (
        <section className={s.stack}>
          <div className={s.cards}>
            {[
              { id: "kendaraan" as Tab, title: L("Laporan Kendaraan All", "All Vehicles Report"), stats: [[L("Total kendaraan", "Total vehicles"), f(vehTotal)], [L("Mobil karyawan", "Employee cars"), f(vehSum("kary"))]], note: L("4 kategori × minggu (hari kerja / akhir pekan)", "4 categories × week (workdays / weekend)") },
              { id: "transporter" as Tab, title: L("Laporan Transporter", "Transporter Report"), stats: [[L("Timbang + non", "Weighed + non"), f(trTotal)], [L("Biomas", "Biomass"), f(bioTot)]], note: bioTot && bioWeek !== bioTot ? L("Biomas: total mingguan belum sama dengan sekam + abu", "Biomass: weekly total does not equal husk + ash") : L(`Selisih timbang ≥ 40 kg: ${f(num(data.tr?.sel))}`, `Weighbridge gap ≥ 40 kg: ${f(num(data.tr?.sel))}`) },
              { id: "pelanggaran" as Tab, title: L("Pelanggaran Transporter", "Transporter Violations"), stats: [[L("Kasus", "Cases"), f(agg.total)], ["Becis & JMM", f(agg.khusus.total)]], note: gcOk ? L("Otomatis dari G-C — tidak perlu input", "Automatic from G-C — no input needed") : L("G-C tidak tersambung — pakai input manual", "G-C not connected — use manual input") },
              { id: "kejadian" as Tab, title: L("Laporan Kejadian", "Incident Report"), stats: [[L("Total kejadian", "Total incidents"), f(kejTotal)], ["Issue area", f(data.issues?.length || 0)]], note: L(`Lost & Found ${f(num(data.kej?.["Lost & Found"]))} · Kerusakan fasilitas ${f(num(data.kej?.["Kerusakan Fasilitas"]))}`, `Lost & Found ${f(num(data.kej?.["Lost & Found"]))} · Facility damage ${f(num(data.kej?.["Kerusakan Fasilitas"]))}`) },
              { id: "visit" as Tab, title: L("Laporan Visit", "Visit Report"), stats: [["Visitor", f(visTotal)], ["Team support", f(TEAM_KEYS.reduce((a, k) => a + num(data.team?.[k]), 0))]], note: delta(visTotal, prevT?.vis).txt },
              { id: "patroli" as Tab, title: "Patrol Activity", stats: [[L("Patroli", "Patrols"), pctTxt(pat.ap, pat.tp)], ["Checkpoint", pctTxt(pat.ac, pat.tc)]], note: L(`${f(pat.missed)} patroli missed`, `${f(pat.missed)} missed patrols`) },
            ].map((c) => (
              <article key={c.id} className={s.card}>
                <div className={s.cardHead}>
                  <b>{c.title}</b>
                  <span className={done[c.id] ? s.badgeOk : s.badgeWarn}>{c.id === "pelanggaran" && gcOk ? L("Sinkron G-C", "G-C synced") : sdOn && c.id !== "pelanggaran" ? (done[c.id] ? "Security Desk" : L("Belum diisi di Security Desk", "Not filled in Security Desk")) : done[c.id] ? L("Lengkap", "Complete") : L("Perlu dilengkapi", "Needs completing")}</span>
                </div>
                <div className={s.cardStats}>
                  {c.stats.map(([l, v]) => <div key={l}><small>{l}</small><strong>{v}</strong></div>)}
                </div>
                <span className={s.cardNote}>{c.note}</span>
                <button type="button" className={s.ghostBtn} onClick={() => setTab(c.id)}>{(c.id === "pelanggaran" && gcOk) || (sdOn && c.id !== "pelanggaran") ? L("Lihat data", "View data") : done[c.id] ? L("Lihat / ubah", "View / edit") : L("Lengkapi", "Complete")}</button>
              </article>
            ))}
          </div>
          <div className={s.readyBar}>
            <span>{L("Setelah semua lengkap, buka", "Once everything is complete, open")} <b>Report → {L("Laporan Manajemen", "Management Report")}</b>, {L("centang", "tick")} <b>Security</b>, {L("pilih periode", "choose the period")} {monthLabel(monthKey)}, {L("lalu unduh Excel / PowerPoint / PDF.", "then download Excel / PowerPoint / PDF.")}</span>
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
              <div><h2>{L("Laporan Kendaraan All", "All Vehicles Report")}</h2><p>{L("Jumlah kendaraan masuk per minggu, dipisah hari kerja (HK) dan akhir pekan. Minggu mengikuti kalender Senin–Minggu.", "Vehicles entering per week, split into workdays (WD) and weekends. Weeks follow the Monday–Sunday calendar.")}</p></div>
            </div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th rowSpan={2}>{L("Minggu", "Week")}</th>
                    {VEH_CATS.map((c) => <th key={c.k} colSpan={2} className={s.thGroup}>{c.id}{c.noteId ? <small>{c.noteId}</small> : null}</th>)}
                  </tr>
                  <tr>{VEH_CATS.map((c) => [<th key={`${c.k}w`} className={s.thSub}>HK</th>, <th key={`${c.k}e`} className={s.thSub}>Libur</th>])}</tr>
                </thead>
                <tbody>
                  {weeks.map((w, i) => (
                    <tr key={i}>
                      <th scope="row"><b>{L("Minggu", "Week")} {i + 1}</b><small>{w.label} {mname(mm, "short")}</small></th>
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
                  <span className={s.mute}>{L("Rata-rata", "Average")} {f(Math.round(sumArr(data.veh?.[c.k]?.wd) / Math.max(1, wdDays)))} / {L("hari kerja", "workday")} · {f(Math.round(sumArr(data.veh?.[c.k]?.we) / Math.max(1, weDays)))} / {L("hari libur", "off day")}</span>
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
            <div className={s.panelHead}><div><h2>{L("Transporter material", "Material transporters")}</h2><p>{L("Kendaraan timbang per minggu dan total non-timbang sebulan.", "Weighed vehicles per week and the monthly non-weighed total.")}</p></div></div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>{L("Minggu", "Week")}</th><th className={s.thSub}>{L("Timbang HK", "Weighed WD")}</th><th className={s.thSub}>{L("Timbang libur", "Weighed off days")}</th><th className={s.thSub}>Total</th></tr></thead>
                <tbody>{weekRows(data.tr, (i, side, v) => upd((d) => { d.tr![side][i] = v; }), "Timbang")}</tbody>
              </table>
            </div>
            <div className={s.fields3}>
              <label className={s.field}><span>Non-timbang (sebulan)</span><NumIn wide label="Non-timbang" value={data.tr?.non} onChange={(v) => upd((d) => { d.tr!.non = v; })} /></label>
              <label className={s.field}><span>Selisih timbang ≥ 40 kg</span><NumIn wide label="Selisih timbang" value={data.tr?.sel} onChange={(v) => upd((d) => { d.tr!.sel = v; })} /></label>
              <label className={s.field}><span>{L("dari kendaraan Palm Oil / Fat Blend", "of Palm Oil / Fat Blend vehicles")}</span><NumIn wide label={L("Kendaraan Palm Oil / Fat Blend", "Palm Oil / Fat Blend vehicles")} value={data.tr?.po} onChange={(v) => upd((d) => { d.tr!.po = v; })} /></label>
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
                <thead><tr><th>{L("Minggu", "Week")}</th><th className={s.thSub}>{L("HK", "WD")}</th><th className={s.thSub}>{L("Libur", "Off")}</th><th className={s.thSub}>Total</th></tr></thead>
                <tbody>{weekRows(data.bio, (i, side, v) => upd((d) => { d.bio![side][i] = v; }), "Biomas")}</tbody>
              </table>
            </div>
            {bioTot > 0 && (
              <div className={bioWeek === bioTot ? s.checkOk : s.checkWarn}>
                {bioWeek === bioTot ? L(`✓ Total mingguan (${f(bioWeek)}) sama dengan sekam + abu (${f(bioTot)}).`, `✓ Weekly total (${f(bioWeek)}) equals husk + ash (${f(bioTot)}).`) : L(`⚠ Total mingguan ${f(bioWeek)}, sedangkan sekam + abu ${f(bioTot)}. Periksa lagi.`, `⚠ Weekly total ${f(bioWeek)}, while husk + ash is ${f(bioTot)}. Please check again.`)}
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
            try { await saveSecurityConfig("driver_names", next); setMsg({ t: "ok", text: L("Nama driver tersimpan.", "Driver name saved.") }); } catch (e) { setMsg({ t: "err", text: `${L("Gagal menyimpan nama", "Failed to save the name")}: ${e instanceof Error ? e.message : String(e)}` }); }
          }}
        />
      )}

      <fieldset className={s.fs} disabled={sdOn}>
      {/* ═════ KEJADIAN ═════ */}
      {tab === "kejadian" && (
        <section className={s.stack}>
          <div className={s.panel}>
            <div className={s.panelHead}>
              <div><h2>{L("Laporan Kejadian — jumlah per jenis", "Incident Report — count per type")}</h2><p>{L("Dua jenis bertanda", "Two types marked")} <b className={s.autoTxt}>{L("otomatis", "automatic")}</b> {L("terisi dari form lain dan tidak perlu diketik.", "are filled from other forms and need not be typed.")}</p></div>
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
            <div className={s.panelHead}><div><h2>Visitor</h2><p>{L("Jumlah tamu per minggu.", "Number of guests per week.")}</p></div></div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>{L("Minggu", "Week")}</th><th className={s.thSub}>{L("HK", "WD")}</th><th className={s.thSub}>{L("Libur", "Off")}</th><th className={s.thSub}>Total</th></tr></thead>
                <tbody>{weekRows(data.vis, (i, side, v) => upd((d) => { d.vis![side][i] = v; }), "Visitor")}</tbody>
              </table>
            </div>
            <div className={s.sumBar}><span>Total visitor <b>{f(visTotal)}</b></span><span className={s.mute}>{delta(visTotal, prevT?.vis).txt}</span></div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>{L("Kunjungan team support pengamanan", "Security support team visits")}</h2><p>{L("Jumlah kunjungan per kelompok, plus siapa saja yang berkunjung.", "Number of visits per group, plus who visited.")}</p></div></div>
            <div className={s.fields2}>
              {TEAM_KEYS.map((k) => (
                <label key={k} className={s.field}><span>{k}</span><NumIn wide label={L(`Kunjungan ${k}`, `Visits ${k}`)} value={data.team?.[k]} onChange={(v) => upd((d) => { d.team![k] = v; })} /></label>
              ))}
            </div>
            <label className={s.field}>
              <span>{L("Catatan kunjungan", "Visit notes")}</span>
              <textarea rows={4} className={s.textarea} value={data.teamNote || ""} onChange={(e) => upd((d) => { d.teamNote = e.target.value; })} placeholder="mis. External: BHABINSA, Polsek … · G4S: Supervisor Area, OH …" />
            </label>
          </div>
        </section>
      )}

      {/* ═════ PATROLI ═════ */}
      {tab === "patroli" && (
        <section className={s.grid2}>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>Patrol activity</h2><p>{L("Angka dari sistem guard tour, satu kali per bulan.", "Figures from the guard tour system, once a month.")}</p></div></div>
            <div className={s.fields2}>
              {([["tp", "Target patrol"], ["ap", "Actual patrol"], ["tc", "Target checkpoint"], ["ac", "Actual checkpoint"], ["missed", "Missed"]] as const).map(([k, l]) => (
                <label key={k} className={s.field}><span>{l}</span><NumIn wide label={l} value={pat[k]} onChange={(v) => upd((d) => { d.pat![k] = v; })} /></label>
              ))}
            </div>
            <label className={s.field}>
              <span>{L("Catatan (penyebab missed, dll.)", "Notes (cause of misses, etc.)")}</span>
              <textarea rows={3} className={s.textarea} value={pat.note || ""} onChange={(e) => upd((d) => { d.pat!.note = e.target.value; })} placeholder="Opsional" />
            </label>
          </div>
          <div className={s.panel}>
            <span className={s.kicker}>Hasil otomatis</span>
            {[
              { l: L("Tour schedule (patroli)", "Tour schedule (patrols)"), a: pat.ap, b: pat.tp, sub: L(`${f(pat.ap)} dari ${f(pat.tp)} patroli · ${f(pat.missed)} missed`, `${f(pat.ap)} of ${f(pat.tp)} patrols · ${f(pat.missed)} missed`) },
              { l: "Tour checkpoint", a: pat.ac, b: pat.tc, sub: L(`${f(pat.ac)} dari ${f(pat.tc)} checkpoint · ${f(Math.max(0, pat.tc - pat.ac))} tidak terpindai`, `${f(pat.ac)} of ${f(pat.tc)} checkpoints · ${f(Math.max(0, pat.tc - pat.ac))} not scanned`) },
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
          <span>{dirty ? L("Ada perubahan yang belum disimpan.", "There are unsaved changes.") : L(`Data ${monthLabel(monthKey)}`, `${monthLabel(monthKey)} data`)}</span>
          <div className={s.saveBtns}>
            <button type="button" className={s.ghostBtn} onClick={() => setTab("ringkasan")}>{L("Kembali ke ringkasan", "Back to summary")}</button>
            <button type="button" className={s.primary} disabled={saving || !dirty} onClick={() => save()}>{saving ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
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
            <b>{L("Tersinkron otomatis dari G-C (Kepatuhan Transporter)", "Synced automatically from G-C (Transporter Compliance)")}</b>
            <span>{L("Laporan NC berstatus Accept", "NC reports with Accept status")} · plant {gcOk.plant} · {L("diperbarui", "updated")} {new Date(gcOk.fetchedAt).toLocaleString(loc(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {L("tidak perlu input", "no input needed")}</span>
          </div>
          <div className={s.saveBtns}>
            <button type="button" className={s.ghostBtn} disabled={gcLoading} onClick={onResync}>{gcLoading ? "Menyinkron…" : "Sinkron ulang"}</button>
            <button type="button" className={s.ghostBtn} onClick={() => setManual((m) => !m)}>{manual ? L("Sembunyikan input manual", "Hide manual input") : L("Input manual (cadangan)", "Manual input (backup)")}</button>
          </div>
        </div>
      ) : (
        <div className={s.syncWarn}>
          <div>
            <b>{gc && !gc.ok && gc.notConfigured ? L("Sinkron G-C belum dikonfigurasi", "G-C sync is not configured") : L("G-C tidak dapat dihubungi", "G-C cannot be reached")}</b>
            <span>{gc && !gc.ok ? gc.error : "Memeriksa koneksi…"} — sementara pakai input manual di bawah. Panduan: docs/PANDUAN.md (bab Security).</span>
          </div>
          <button type="button" className={s.ghostBtn} disabled={gcLoading} onClick={onResync}>{gcLoading ? L("Mencoba…", "Trying…") : L("Coba lagi", "Try again")}</button>
        </div>
      )}

      <div className={s.pelLayout}>
        <div className={s.stack}>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>{L("Pelanggaran per perusahaan", "Violations per company")}</h2><p>{L("Dihitung per laporan NC (kasus)", "Counted per NC report (case)")} · {f(agg.companies.length)} {L("perusahaan", "companies")}</p></div></div>
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead><tr><th>#</th><th>{L("Perusahaan", "Company")}</th><th className={s.thSub}>{L("Kasus", "Cases")}</th><th className={s.thSub}>{L("Temuan", "Findings")}</th></tr></thead>
                <tbody>
                  {agg.companies.length === 0 && <tr><td colSpan={4} className={s.empty}>{L("Belum ada pelanggaran pada", "No violations in")} {monthLabel(monthKey)}.</td></tr>}
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
                {showAll ? L("Tampilkan 15 teratas", "Show top 15") : L(`Tampilkan semua (${agg.companies.length} perusahaan)`, `Show all (${agg.companies.length} companies)`)}
              </button>
            )}
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><div><h2>{L("Jenis pelanggaran", "Violation types")}</h2><p>{L("Dihitung per temuan", "Counted per finding")} · {f(agg.temuan)} {L("temuan", "findings")}</p></div></div>
            {agg.jenis.length === 0 && <p className={s.empty}>{L("Belum ada data.", "No data yet.")}</p>}
            {agg.jenis.map((j) => (
              <div key={j.name} className={s.barRow}>
                <span>{j.name}</span>
                <div className={s.barTrack}><div className={s.barFill} style={{ width: `${(j.n / maxJ) * 100}%` }} /></div>
                <b>{f(j.n)}</b>
              </div>
            ))}
          </div>
          <div className={`${s.panel} ${s.panelKhusus}`}>
            <div className={s.panelHead}><div><h2>{L("Khusus", "Special:")} {kNames}</h2><p>{L("Nama perusahaan khusus diatur di tab Pengaturan (harus persis sama dengan master supplier G-C).", "Special company names are set in the Settings tab (they must match the G-C supplier master exactly).")}</p></div></div>
            <div className={s.fields2}>
              <div className={s.miniList}><small>Per perusahaan</small>{agg.khusus.byCo.map((c) => <div key={c.name}><span>{c.name}</span><b>{f(c.n)}</b></div>)}</div>
              <div className={s.miniList}><small>{L("Jenis", "Type")}</small>{agg.khusus.jenis.length ? agg.khusus.jenis.map((j) => <div key={j.name}><span>{j.name}</span><b>{f(j.n)}</b></div>) : <span className={s.mute}>{L("Nihil", "None")}</span>}</div>
            </div>
            <div className={s.miniList}>
              <small>{L("Driver pelanggar", "Violating drivers")} {gcOk ? L("(dikenali dari nomor SIM — beri nama sekali, tersimpan untuk bulan berikutnya)", "(identified from the licence number — name once, saved for following months)") : ""}</small>
              {agg.khusus.drivers.length === 0 && <span className={s.mute}>{L("Nihil", "None")}</span>}
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
              <div className={s.statBox}><small>{L("Perusahaan lain", "Other companies")}</small><strong>{f(agg.total - agg.khusus.total)}</strong><span>{f(agg.companies.filter((c) => !c.khusus).length)} {L("perusahaan", "companies")}</span></div>
            </div>
            <div className={s.miniList}>
              <small>Driver berulang (SIM sama)</small>
              {agg.repeat.length ? agg.repeat.slice(0, 6).map((d) => <div key={d.hash}><span>{driverLabel(d, cfg.driverNames)} — {d.co}</span><b>{d.n}×</b></div>) : <span className={s.mute}>{L("Tidak ada", "None")}</span>}
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
        <input className={s.text} autoFocus value={val} placeholder={L("Nama driver", "Driver name")} aria-label={L("Nama driver", "Driver name")} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onName(d.hash, val, d.co); setEdit(false); } if (e.key === "Escape") setEdit(false); }} />
      ) : (
        <span><b>{label}</b>{named && d.last4 ? <small> · SIM ••{d.last4}</small> : null}</span>
      )}
      <span className={s.mute}>{d.co.replace(/^PT\.?\s*/i, "")}</span>
      <span className={d.n > 1 ? s.badgeBad : s.badgeMute}>{d.n}×</span>
      {editable && (edit
        ? <button type="button" className={s.smallBtn} onClick={() => { onName(d.hash, val, d.co); setEdit(false); }}>{L("Simpan", "Save")}</button>
        : <button type="button" className={s.smallBtn} onClick={() => setEdit(true)}>{named ? L("Ubah nama", "Edit name") : L("Beri nama", "Set name")}</button>)}
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
      <div className={s.panelHead}><div><h2>{L("Input manual (cadangan)", "Manual input (backup)")}</h2><p>{L(`Dipakai di report hanya bila G-C tidak tersambung. Totalnya: ${f(coTotal)} kasus, ${f(jTotal)} temuan.`, `Used in the report only when G-C is not connected. Total: ${f(coTotal)} cases, ${f(jTotal)} findings.`)}</p></div></div>
      <div className={s.grid2}>
        <div className={s.stack}>
          <small className={s.kicker}>Rekap per perusahaan</small>
          {v.companies.map((c, i) => (
            <div key={i} className={s.manualRow}>
              <span>{c.name}{khusus.map(normCo).includes(normCo(c.name)) && <span className={s.tagKhusus}>KHUSUS</span>}</span>
              <NumIn label={`Kasus ${c.name}`} value={c.n} onChange={(x) => set((p) => { p.companies[i].n = x; })} />
              <button type="button" className={s.iconBtn} aria-label={L(`Hapus ${c.name}`, `Delete ${c.name}`)} onClick={() => set((p) => { p.companies.splice(i, 1); })}>✕</button>
            </div>
          ))}
          <div className={s.manualRow}>
            <input className={s.text} placeholder={L("Nama perusahaan…", "Company name…")} aria-label={L("Nama perusahaan baru", "New company name")} value={co} onChange={(e) => setCo(e.target.value)} />
            <NumIn label={L("Jumlah kasus", "Number of cases")} value={n} onChange={setN} />
            <button type="button" className={s.smallBtn} onClick={() => { if (!co.trim()) return; set((p) => { p.companies.push({ name: co.trim().toUpperCase(), n }); }); setCo(""); setN(0); }}>{L("+ Tambah", "+ Add")}</button>
          </div>
        </div>
        <div className={s.stack}>
          <small className={s.kicker}>Rekap per jenis (semua perusahaan)</small>
          {NC_JENIS.map((j) => (
            <label key={j} className={s.manualRow}><span>{j}</span><NumIn label={j} value={v.jenis[j]} onChange={(x) => set((p) => { p.jenis[j] = x; })} /></label>
          ))}
          {jTotal !== coTotal && coTotal > 0 && <div className={s.checkWarn}>{L(`⚠ Rekap per jenis (${f(jTotal)}) belum sama dengan total kasus (${f(coTotal)}). Satu kasus bisa punya lebih dari satu temuan.`, `⚠ The per-type recap (${f(jTotal)}) does not equal the total cases (${f(coTotal)}). One case can have more than one finding.`)}</div>}
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
              <button type="button" className={s.iconBtn} aria-label={L(`Hapus ${d.name}`, `Delete ${d.name}`)} onClick={() => set((p) => { p.drivers.splice(i, 1); })}>✕</button>
            </div>
          ))}
          <div className={s.manualRow}>
            <input className={s.text} placeholder={L("Nama driver…", "Driver name…")} aria-label={L("Nama driver baru", "New driver name")} value={dn} onChange={(e) => setDn(e.target.value)} />
            <select className={s.select} aria-label={L("Perusahaan driver", "Driver company")} value={dco} onChange={(e) => setDco(e.target.value)}>{khusus.map((k) => <option key={k}>{k}</option>)}</select>
            <NumIn label={L("Jumlah kasus driver", "Driver case count")} value={dc} onChange={(x) => setDc(x || 1)} />
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
      <div className={s.panelHead}><div><h2>{L("Issue area — kejadian penting bulan ini", "Issue area — key incidents this month")}</h2><p>{L("Ditampilkan sebagai sorotan di laporan. Kejadian berstatus Open masuk daftar \"perlu perhatian manajemen\".", "Shown as highlights in the report. Incidents with Open status go into the \"needs management attention\" list.")}</p></div></div>
      <div className={s.issueList}>
        {issues.length === 0 && <p className={s.empty}>{L("Belum ada issue area.", "No issue areas yet.")}</p>}
        {[...issues].map((it, i) => ({ it, i })).sort((a, b) => (a.it.tgl < b.it.tgl ? -1 : 1)).map(({ it, i }) => (
          <div key={i} className={s.issue}>
            <b>{dateShort(it.tgl)}</b>
            <span className={s.issueKat}>{it.kat}</span>
            <span className={s.issueDesc}>{it.desc}</span>
            <button type="button" className={it.status === "Open" ? s.badgeBad : s.badgeOk} title={L("Klik untuk ubah status", "Click to change status")}
              onClick={() => onChange(issues.map((x, j) => (j === i ? { ...x, status: x.status === "Open" ? "Close" : "Open" } : x)))}>{it.status}</button>
            <button type="button" className={s.iconBtn} aria-label={L(`Hapus kejadian ${dateShort(it.tgl)}`, `Delete incident ${dateShort(it.tgl)}`)} onClick={() => onChange(issues.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div className={s.issueForm}>
        <input type="date" className={s.text} aria-label={L("Tanggal kejadian", "Incident date")} value={tgl} min={monthStart(monthKey)} max={monthEnd(monthKey)} onChange={(e) => setTgl(e.target.value)} />
        <select className={s.select} aria-label={L("Jenis kejadian", "Incident type")} value={kat} onChange={(e) => setKat(e.target.value)}>{KEJ_CATS.map((c) => <option key={c.id}>{c.id}</option>)}</select>
        <input className={s.text} placeholder="Deskripsi singkat kejadian…" aria-label="Deskripsi kejadian" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <select className={s.select} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Issue["status"])}><option>Open</option><option>Close</option></select>
        <button type="button" className={s.primary} onClick={() => { if (!desc.trim()) return; onChange([...issues, { tgl, kat, desc: desc.trim(), status }]); setDesc(""); }}>{L("+ Tambah", "+ Add")}</button>
      </div>
    </div>
  );
}

/* ═════════════ Riwayat 12 bulan ═════════════ */
const HIST_COLS: { k: TotalKey; l: string; from: (t: MonthTotals) => number | null }[] = [
  { k: "kary", get l() { return L("Mobil karyawan", "Employee cars"); }, from: (t) => t.kary },
  { k: "tamu", get l() { return L("Mobil tamu", "Guest cars"); }, from: (t) => t.tamu },
  { k: "kontr", get l() { return L("Mobil kontraktor", "Contractor cars"); }, from: (t) => t.kontr },
  { k: "motor", get l() { return L("Motor", "Motorbikes"); }, from: (t) => t.motor },
  { k: "vis", l: "Visitor", from: (t) => t.vis },
  { k: "timbang", get l() { return L("Timbang", "Weighed"); }, from: (t) => t.timbang },
  { k: "non", get l() { return L("Non-timbang", "Non-weighed"); }, from: (t) => t.non },
  { k: "biomas", get l() { return L("Biomas", "Biomass"); }, from: (t) => t.biomas },
  { k: "pel", get l() { return L("Pelanggaran*", "Violations*"); }, from: (t) => t.pelHist },
  { k: "kej", get l() { return L("Kejadian manual", "Manual incidents"); }, from: (t) => t.kejManual },
];

function HistoryPanel({ monthKey, onSaved, onError }: { monthKey: string; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const keys = useMemo(() => monthKeysBetween(addMonthsKey(monthKey, -12), monthKey), [monthKey]);
  const [rows, setRows] = useState<Record<string, SecData>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Record<TotalKey, number>>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSecurityMonths(keys[0], keys[keys.length - 1]).then(setRows).catch((e) => onError(`${L("Gagal memuat riwayat", "Failed to load history")}: ${e?.message || e}`));
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
      onError(`${L("Gagal menyimpan riwayat", "Failed to save history")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  const dirty = Object.keys(edits).length > 0;
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2>{L("Riwayat 13 bulan — untuk grafik tren", "13-month history — for the trend chart")}</h2>
          <p>{L("Isi total sebulan untuk bulan yang tidak diinput per minggu (mis. dari laporan security lama). Bulan yang sudah diisi per minggu dihitung otomatis dan tidak bisa diubah di sini. *Pelanggaran: isi hanya untuk bulan sebelum G-C dipakai; bila diisi, angka ini menggantikan data G-C bulan tsb.", "Enter the monthly total for months that were not entered weekly (e.g. from an old security report). Months already filled in weekly are calculated automatically and cannot be changed here. *Violations: fill in only for months before G-C was used; if filled in, this figure replaces the G-C data for that month.")}</p>
        </div>
        <button type="button" className={s.primary} disabled={!dirty || busy} onClick={saveAll}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan riwayat", "Save history")}</button>
      </div>
      <div className={s.tableBox}>
        <table className={`${s.table} ${s.histTable}`}>
          <thead><tr><th>{L("Bulan", "Month")}</th>{HIST_COLS.map((c) => <th key={c.k} className={s.thSub}>{c.l}</th>)}</tr></thead>
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
        <div className={s.panelHead}><div><h2>{L("Koneksi G-C & Security Desk", "G-C & Security Desk connection")}</h2><p>{L("Data pelanggaran transporter dan laporan security dibaca langsung dari database Security Desk, hanya membaca.", "Transporter violation data and the security report are read directly from the Security Desk database (read-only).")}</p></div></div>
        <button type="button" className={s.primary} disabled={pinging} onClick={async () => { setPinging(true); setPing(await pingGc()); setPinging(false); }}>{pinging ? L("Memeriksa…", "Checking…") : L("Cek koneksi", "Check connection")}</button>
        {ping && (
          <div className={ping.ok ? s.checkOk : s.checkWarn}>
            {ping.ok
              ? `✓ Tersambung (${ping.mode === "service" ? "service key" : "akun baca-saja"}) · plant ${ping.plant} · ${f(ping.total || 0)} laporan Accept · terbaru ${ping.latest ? dateShort(ping.latest) : "-"}`
              : `⚠ ${ping.configured ? L("Gagal", "Failed") : "Belum dikonfigurasi"}: ${ping.error || "-"}`}
          </div>
        )}
        <p className={s.mute}>Cara menyambungkan: docs/PANDUAN.md, bab Security (environment variable GC_* di Vercel).</p>
      </section>
      <CrudList<KhususRow>
        icon="🏢" title={L("Perusahaan khusus", "Special companies")} itemName={L("perusahaan", "company")}
        desc={<>Pelanggarannya dipisah di laporan (mis. Becis & JMM). Tulis nama <b>persis</b> seperti di master supplier G-C.</>}
        rows={khusus} rowKey={(r) => r.name}
        columns={[{ label: L("Nama perusahaan", "Company name"), render: (r) => <b>{r.name}</b> }]}
        fields={[{ key: "name", label: L("Nama perusahaan", "Company name"), required: true, placeholder: L("PT. NAMA PERUSAHAAN", "PT. COMPANY NAME") }]}
        onCreate={async (v) => { const n = norm(v.name); if (cfg.khusus.includes(n)) throw new Error(L("Perusahaan ini sudah ada.", "This company already exists.")); await onSaveKhusus([...cfg.khusus, n]); }}
        onUpdate={async (row, v) => { const n = norm(v.name); if (n !== row.name && cfg.khusus.includes(n)) throw new Error(L("Perusahaan ini sudah ada.", "This company already exists.")); await onSaveKhusus(cfg.khusus.map((k) => (k === row.name ? n : k))); }}
        onDelete={async (row) => { await onSaveKhusus(cfg.khusus.filter((k) => k !== row.name)); }}
      />
      <CrudList<DriverNameRow>
        icon="🪪" title={L("Nama driver transporter", "Transporter driver names")} itemName={L("nama driver", "driver name")}
        desc={L("G-C tidak menyimpan nama driver. Nama ditautkan ke kode acak dari nomor SIM (nomor SIM asli tidak disimpan). Nama baru diberikan dari tab Pelanggaran Transporter.", "G-C does not store driver names. Names are linked to a random code derived from the licence number (the real number is not stored). New names are set from the Transporter Violations tab.")}
        empty={L("Belum ada nama driver.", "No driver names yet.")}
        rows={names} rowKey={(r) => r.hash}
        columns={[
          { label: L("Nama", "Name"), render: (r) => <b>{r.name}</b> },
          { label: L("Perusahaan", "Company"), render: (r) => r.co || "—" },
          { label: "Kode", render: (r) => <code>{r.hash.slice(0, 6)}</code> },
        ]}
        fields={[
          { key: "name", label: L("Nama driver", "Driver name"), required: true },
          { key: "co", label: L("Perusahaan", "Company"), type: "select", options: cfg.khusus.map((k) => ({ value: k, label: k })) },
        ]}
        onUpdate={async (row, v) => { await onSaveNames({ ...cfg.driverNames, [row.hash]: { name: String(v.name).trim(), co: String(v.co ?? "") || undefined } }); }}
        onDelete={async (row) => { const n = { ...cfg.driverNames }; delete n[row.hash]; await onSaveNames(n); }}
      />
    </SettingsPage>
  );
}
