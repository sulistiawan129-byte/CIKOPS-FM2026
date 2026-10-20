"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { ReportExportButtons, LanguagePickerModal, useExportLanguagePicker } from "@/components/ReportControls";
import { exportGenericCsv, exportGenericExcel, exportGenericPdf } from "@/lib/reportEngine";
import type { ReportColumn } from "@/lib/reportEngine";
import { hasTabPermission, getDrivers, type MyProfile, getClaims, getCurrentKantong, getKantongHistory, updateKantongBudget, resetKantong, createKantong, getDriverTiers, addDriverTier, updateDriverTier, deleteDriverTier, setDriverTier } from "@/lib/api";
import type { Claim, Plant, Kantong, DriverTier } from "@/lib/types";
import type { Driver } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { toLocalISODate } from "@/lib/dateUtils";
import of from "./opfund.module.css";
import { ModuleHeader, ModulePage, ModuleTabs } from "./ModuleShell";
import { useCountUp, fmtRp, evalExpr, monthWeekBoundaries } from "./dashboardShared";
import { SkeletonRows } from "./TaskModals";
import { weekOfMonth } from "./ClaimsTab";

interface WeekBucket {
  key: string;   // e.g. "2026-08-W1" — unique across months
  label: string; // e.g. "M1 Agu"
  endDate: Date; // last day of that work-week, used for chronological sort
}

/** Every 4-week bucket (using the same Mon–Fri, weekend-folded-into-Week-1
 *  rule as weekOfMonth) whose end date falls within the last `monthsBack`
 *  months up to today — oldest first. A claim's bucket key is
 *  `${year}-${month}-W${weekOfMonth(date)}`, so summing claim totals by
 *  bucket key and walking this sequence gives a complete week-by-week
 *  history with explicit zeros for weeks that had no claims (not just
 *  the weeks that happen to have data — a driver who claims every other
 *  week should average lower per-week than one who claims every week,
 *  and skipping the zero-claim weeks would hide that). */
function generateWeekBucketSequence(monthsBack: number): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  const today = new Date();
  const rangeStart = new Date(today);
  rangeStart.setMonth(rangeStart.getMonth() - monthsBack);

  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const endCursor = new Date(today.getFullYear(), today.getMonth(), 1);

  while (cursor <= endCursor) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const bounds = monthWeekBoundaries(`${year}-${String(month + 1).padStart(2, "0")}-01`);
    bounds.forEach((b, i) => {
      const endDate = new Date(year, month, b.end);
      if (endDate >= rangeStart && endDate <= today) {
        buckets.push({
          key: `${year}-${String(month + 1).padStart(2, "0")}-W${i + 1}`,
          label: `M${i + 1} ${cursor.toLocaleDateString("id-ID", { month: "short" })}`,
          endDate,
        });
      }
    });
    cursor = new Date(year, month + 1, 1);
  }
  return buckets.sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
}

function claimWeekBucketKey(dateStr: string): string {
  const d = new Date(dateStr);
  const wk = weekOfMonth(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-W${wk}`;
}

/** Recency-weighted average: the most recent week in `buckets` gets
 *  weight 1, and each week further back is weighted by `decay` less
 *  (decay=0.85 ⇒ a week ~5 weeks old counts about half as much as this
 *  week) — so a recent spike or dip in a driver's claim pattern shows up
 *  in the forecast faster than a flat 3-month average would, while older
 *  weeks still contribute rather than being cut off entirely. */
function weightedWeeklyAverage(buckets: WeekBucket[], totalsByKey: Record<string, number>, decay = 0.85): number {
  const n = buckets.length;
  if (n === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  buckets.forEach((b, i) => {
    const weight = Math.pow(decay, n - 1 - i);
    weightedSum += weight * (totalsByKey[b.key] ?? 0);
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/* ════════════════════════════════════════════════════════════
   HOME TAB — halaman utama baru: kartu ikon per modul, dikelompokkan
   per kategori (tab horizontal), supaya sidebar bisa dibikin ramping
   tanpa kehilangan kemudahan navigasi. Konten "Ringkasan" (KPI dsb.)
   yang lama tetap ada terpisah, tidak diganti.
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   WIDGET — Aksi Cepat
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   WIDGET — Pengumuman
════════════════════════════════════════════════════════════ */
const TIER_PALETTE = ["var(--brand)", "var(--green)", "var(--orange)", "var(--red)", "var(--purple)"];

/* ════════════════════════════════════════════════════════════
   LOGIN SCREEN — Admin/GA sign-in via Supabase Auth. Separate from
   the driver PIN system on /driver, which is untouched.
════════════════════════════════════════════════════════════ */
function DriverBudgetTab({ myProfile = null }: { myProfile?: MyProfile | null }) {
  const { lang, t } = useLang();
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DriverTier | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(TIER_PALETTE[0]);
  const [formAmount, setFormAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DriverTier | null>(null);
  const [tierFilter, setTierFilter] = useState("");
  const [driverQ, setDriverQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d] = await Promise.all([getDriverTiers(), getDrivers(myProfile?.plantScope ?? null)]);
      setTiers(t);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data tier");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalDrivers = tiers.reduce((s, t) => s + t.activeDriverCount, 0);
  const totalBudget = tiers.reduce((s, t) => s + t.amountPerMonth * t.activeDriverCount, 0);
  const animatedTotalDrivers = useCountUp(totalDrivers);
  const animatedTotalBudget = useCountUp(totalBudget);
  const animatedYearlyBudget = useCountUp(totalBudget * 12);

  const tierColumns: ReportColumn<DriverTier>[] = [
    { key: "name", labelId: "Nama Tier", labelEn: "Tier Name", get: (t) => t.name },
    { key: "count", labelId: "Jumlah Driver Aktif", labelEn: "Active Drivers", get: (t) => t.activeDriverCount, align: "right" },
    { key: "perMonth", labelId: "Nominal per Bulan (Rp)", labelEn: "Amount per Month (Rp)", get: (t) => t.amountPerMonth, align: "right" },
    { key: "totalMonth", labelId: "Total per Bulan (Rp)", labelEn: "Total per Month (Rp)", get: (t) => t.amountPerMonth * t.activeDriverCount, align: "right" },
    { key: "totalYear", labelId: "Total per Tahun (Rp)", labelEn: "Total per Year (Rp)", get: (t) => t.amountPerMonth * t.activeDriverCount * 12, align: "right" },
  ];
  const tierExportPicker = useExportLanguagePicker((format, exportLang) => {
    const opts = {
      rows: tiers, columns: tierColumns, lang: exportLang,
      titleId: "Laporan Tier Uang Operasional Driver", titleEn: "Driver Operational Allowance Tier Report",
      periodLabel: new Date().toLocaleDateString(exportLang === "en" ? "en-US" : "id-ID", { day: "2-digit", month: "long", year: "numeric" }),
      filename: "Laporan_Driver_Budget",
      summaryRows: [
        { label: "Total Driver Aktif / Total Active Drivers", value: totalDrivers },
        { label: "Total Budget per Bulan / Total Monthly Budget (Rp)", value: totalBudget.toLocaleString("id-ID") },
        { label: "Total Budget per Tahun / Total Yearly Budget (Rp)", value: (totalBudget * 12).toLocaleString("id-ID") },
      ],
    };
    if (format === "csv") exportGenericCsv(opts);
    else if (format === "excel") exportGenericExcel(opts);
    else exportGenericPdf(opts);
  });

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormColor(TIER_PALETTE[0]);
    setFormAmount("");
    setShowForm(true);
  }
  function openEdit(t: DriverTier) {
    setEditing(t);
    setFormName(t.name);
    setFormColor(t.color);
    setFormAmount(String(t.amountPerMonth));
    setShowForm(true);
  }

  const canSaveTier = formName.trim() !== "" && !!evalExpr(formAmount);

  async function handleSave() {
    const amount = evalExpr(formAmount);
    if (!formName || !amount) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDriverTier(editing.id, { name: formName, color: formColor, amountPerMonth: amount });
      } else {
        await addDriverTier({ name: formName, color: formColor, amountPerMonth: amount });
      }
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan tier");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteDriverTier(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus tier");
    }
  }

  async function handleAssignTier(driverId: string, tierId: string) {
    try {
      await setDriverTier(driverId, tierId || null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal assign tier");
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const noTier = drivers.filter((d) => !d.tier_id).length;
  const budgetTotal = tiers.reduce((x, tr) => x + tr.amountPerMonth * tr.activeDriverCount, 0) || 1;
  const visibleDrivers = drivers.filter((d) => (!tierFilter || (tierFilter === "none" ? !d.tier_id : d.tier_id === tierFilter)) &&
    (!driverQ || d.nama.toLowerCase().includes(driverQ.toLowerCase())));

  return (
    <div className={of.wrap}>
      <div className={of.tiles4}>
        <div className={of.tile} style={{ ["--c" as string]: "var(--brand)" }}><span className={of.tileLabel}><i />{L("Total driver", "Total drivers")}</span><b>{animatedTotalDrivers}</b><small>{L("aktif di plant ini", "active in this plant")}</small></div>
        <div className={of.tile} style={{ ["--c" as string]: "var(--green)" }}><span className={of.tileLabel}><i />{L("Budget / bulan", "Budget / month")}</span><b>Rp {fmtRp(animatedTotalBudget)}</b><small>{L("jumlah semua tier", "sum of all tiers")}</small></div>
        <div className={of.tile} style={{ ["--c" as string]: "var(--purple)" }}><span className={of.tileLabel}><i />{L("Per tahun", "Per year")}</span><b>Rp {fmtRp(animatedYearlyBudget)}</b><small>{L("proyeksi 12 bulan", "12-month projection")}</small></div>
        <div className={of.tile} style={{ ["--c" as string]: noTier ? "var(--orange)" : "var(--green)" }}><span className={of.tileLabel}><i />{L("Belum punya tier", "Without a tier")}</span><b>{noTier}</b><small>{noTier ? L("atur di daftar driver →", "assign in the driver list →") : L("semua driver sudah diatur 👍", "all drivers assigned 👍")}</small></div>
      </div>

      {error && <div className={of.errBox}>{error}</div>}
      {tierExportPicker.pending && <LanguagePickerModal format={tierExportPicker.pending} onConfirm={tierExportPicker.confirm} onClose={tierExportPicker.cancel} />}

      <div className={of.grid2}>
        <section className={of.card}>
          <div className={of.cardHead}>
            <h3>{L("Tier uang operasional", "Allowance tiers")}</h3>
            <div className={of.headBtns}>
              <ReportExportButtons onExport={tierExportPicker.requestExport} disabled={tiers.length === 0} />
              <button type="button" className={of.btnPrimary} onClick={openAdd}>+ {L("Tier", "Tier")}</button>
            </div>
          </div>
          {tiers.length > 0 && (
            <div className={of.stackLight}>
              {tiers.map((tr) => tr.amountPerMonth * tr.activeDriverCount > 0 && (
                <span key={tr.id} style={{ width: `${((tr.amountPerMonth * tr.activeDriverCount) / budgetTotal) * 100}%`, background: tr.color }} title={`${tr.name}: Rp ${fmtRp(tr.amountPerMonth * tr.activeDriverCount)}`} />
              ))}
            </div>
          )}
          {loading ? <div className={of.empty}>{L("Memuat…", "Loading…")}</div> : tiers.length === 0 ? (
            <div className={of.empty}>{L("Belum ada tier. Buat tier pertama, mis. \"Driver Senior — Rp 2.000.000/bulan\".", "No tiers yet.")}</div>
          ) : (
            <ul className={of.tierList}>
              {tiers.map((tr) => (
                <li key={tr.id} style={{ ["--c" as string]: tr.color }}>
                  <button type="button" className={`${of.tierMain} ${tierFilter === tr.id ? of.tierOn : ""}`} onClick={() => setTierFilter(tierFilter === tr.id ? "" : tr.id)} title={L("Tampilkan driver di tier ini", "Show drivers in this tier")}>
                    <i />
                    <span><b>{tr.name}</b><small>{tr.activeDriverCount} driver · Rp {fmtRp(tr.amountPerMonth)}/{L("orang", "person")}</small></span>
                    <strong>Rp {fmtRp(tr.amountPerMonth * tr.activeDriverCount)}</strong>
                  </button>
                  <button type="button" className={of.iconBtn} onClick={() => openEdit(tr)} aria-label={L("Ubah", "Edit")}>✏️</button>
                  <button type="button" className={of.iconBtn} onClick={() => setConfirmDelete(tr)} aria-label={L("Hapus", "Delete")}>🗑️</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={of.card}>
          <div className={of.cardHead}><h3>{L("Tier per driver", "Tier per driver")}</h3><span>{visibleDrivers.length}</span></div>
          <div className={of.filterRow}>
            <input className={of.searchInput} value={driverQ} onChange={(e) => setDriverQ(e.target.value)} placeholder={L("Cari driver…", "Search driver…")} />
            <button type="button" className={`${of.chip} ${!tierFilter ? of.chipOn : ""}`} onClick={() => setTierFilter("")}>{L("Semua", "All")}</button>
            <button type="button" className={`${of.chip} ${tierFilter === "none" ? of.chipOn : ""}`} onClick={() => setTierFilter(tierFilter === "none" ? "" : "none")}>{L("Tanpa tier", "No tier")} {noTier ? `(${noTier})` : ""}</button>
          </div>
          <ul className={of.driverList}>
            {visibleDrivers.map((d) => {
              const tr = tiers.find((x) => x.id === d.tier_id);
              return (
                <li key={d.id} style={{ ["--c" as string]: tr?.color ?? "var(--border2)" }}>
                  <span className={of.drvAv}>{d.avatar_emoji || "🧑‍✈️"}</span>
                  <span className={of.drvName}><b>{d.nama}</b><small>{tr ? `Rp ${fmtRp(tr.amountPerMonth)}/${L("bulan", "month")}` : L("belum diatur", "not assigned")}</small></span>
                  <select className={of.select} value={d.tier_id || ""} onChange={(e) => handleAssignTier(d.id, e.target.value)}>
                    <option value="">— {L("pilih tier", "choose tier")} —</option>
                    {tiers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </li>
              );
            })}
            {visibleDrivers.length === 0 && <li className={of.empty}>{L("Tidak ada driver.", "No drivers.")}</li>}
          </ul>
        </section>
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={380}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Tier" : "Edit Tier") : (lang === "en" ? "Add Tier" : "Tambah Tier")}</div>
            <div style={{ marginBottom: 12 }}>
              <label>{t.fieldTierName}</label>
              <input className={styles.formInput} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Senior Driver" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>{t.fieldColor}</label>
              <div style={{ display: "flex", gap: 8 }}>
                {TIER_PALETTE.map((c) => (
                  <div key={c} onClick={() => setFormColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: formColor === c ? "2px solid var(--t1)" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>{t.fieldAmountPerPersonMonth}</label>
              <input className={styles.formInput} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="2000000" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSave} disabled={!canSaveTier || saving} style={{ flex: 1, justifyContent: "center", opacity: canSaveTier && !saving ? 1 : 0.5 }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this tier?" : "Hapus tier ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.name}</strong> akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
/** "Prediksi Kebutuhan Minggu Depan" — projects next week's likely
 *  Op Driver claim spend from the last 3 months of Claims history, using
 *  a recency-weighted per-driver average (see weightedWeeklyAverage()).
 *  Built for the "dana belum cair dari Finance" scenario: gives the
 *  admin a defensible number to work from even without waiting on an
 *  actual disbursement. */
function ForecastCard({ plant }: { plant: Plant }) {
  const { lang } = useLang();
  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const all = await getClaims(plant);
        if (!cancelled) setClaims(all);
      } catch {
        if (!cancelled) setClaims([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plant]);

  const forecast = useMemo(() => {
    const MONTHS_BACK = 3;
    const buckets = generateWeekBucketSequence(MONTHS_BACK);
    if (buckets.length === 0) return { total: 0, perDriver: [] as { driverId: string; name: string; weekly: number }[], weeksAnalyzed: 0 };

    const cutoff = buckets[0].endDate;
    const recentClaims = claims.filter((c) => {
      const d = new Date(c.periodDate || c.submissionDate);
      return !isNaN(d.getTime()) && d >= cutoff;
    });

    // driverId -> bucketKey -> sum of claim totals
    const byDriver = new Map<string, { name: string; totals: Record<string, number> }>();
    for (const c of recentClaims) {
      const key = claimWeekBucketKey(c.periodDate || c.submissionDate);
      const entry = byDriver.get(c.driver_id) ?? { name: c.driverName, totals: {} };
      entry.totals[key] = (entry.totals[key] ?? 0) + c.total;
      byDriver.set(c.driver_id, entry);
    }

    const perDriver = Array.from(byDriver.entries())
      .map(([driverId, { name, totals }]) => ({
        driverId,
        name,
        weekly: weightedWeeklyAverage(buckets, totals),
      }))
      .filter((d) => d.weekly > 0)
      .sort((a, b) => b.weekly - a.weekly);

    const total = perDriver.reduce((sum, d) => sum + d.weekly, 0);
    return { total, perDriver, weeksAnalyzed: buckets.length };
  }, [claims]);

  const animatedTotal = useCountUp(Math.round(forecast.total));

  return (
    <div className="statPop" style={{ ...cardStyle, padding: 20, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
            🔮 {lang === "en" ? "Next Week Budget Forecast" : "Prediksi Kebutuhan Minggu Depan"}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>
            {lang === "en"
              ? `Recency-weighted average from the last ${forecast.weeksAnalyzed} weeks of Claims history — use this if Finance funds haven't landed yet.`
              : `Rata-rata tertimbang (minggu terbaru lebih berpengaruh) dari ${forecast.weeksAnalyzed} minggu riwayat Claims terakhir — pakai ini kalau dana dari Finance belum cair.`}
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : forecast.perDriver.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12.5 }}>
          {lang === "en" ? "Not enough Claims history yet to forecast." : "Belum cukup riwayat Claims untuk membuat prediksi."}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--mono)", color: "var(--brand)", margin: "10px 0 16px" }}>
            Rp {fmtRp(animatedTotal)}
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t3)", marginLeft: 8 }}>
              / {lang === "en" ? "week" : "minggu"} · {forecast.perDriver.length} {lang === "en" ? "drivers" : "driver"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {forecast.perDriver.map((d, i) => {
              const pct = forecast.total > 0 ? (d.weekly / forecast.total) * 100 : 0;
              return (
                <div key={d.driverId} className="staggerItem" style={{ animationDelay: `${i * 0.04}s` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ color: "var(--t2)", fontWeight: 600 }}>{d.name}</span>
                    <span style={{ color: "var(--t3)", fontFamily: "var(--mono)" }}>Rp {fmtRp(Math.round(d.weekly))}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: "var(--brand)", borderRadius: 3, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Dana Operasional + Budget Driver (digabung) — tab mengikuti izin masing-masing. */
export function OpFundPage({ myProfile, initial }: { myProfile: MyProfile | null; initial: "fund" | "budget" }) {
  const { lang } = useLang();
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const canFund = hasTabPermission(myProfile, "opfund");
  const canBudget = hasTabPermission(myProfile, "driverbudget");
  const [view, setView] = useState<"fund" | "budget">(initial === "budget" && canBudget ? "budget" : canFund ? "fund" : "budget");
  useEffect(() => { if (initial === "budget" && canBudget) setView("budget"); }, [initial, canBudget]);
  const tabs = [
    ...(canFund ? [{ id: "fund" as const, label: L("Dana Operasional", "Operational Fund"), icon: "💰" }] : []),
    ...(canBudget ? [{ id: "budget" as const, label: L("Budget Driver", "Driver Budget"), icon: "💳" }] : []),
  ];
  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Finance · Dana Operasional", "Finance · Operational Fund")}
        title={L("Dana Operasional", "Operational Fund")}
        desc={L("Kas operasional plant, outstanding klaim, dan budget bulanan driver per tier — dalam satu halaman.",
          "Plant operating cash, outstanding claims, and monthly driver budgets per tier — in one place.")}
      />
      {tabs.length > 1 && <ModuleTabs tabs={tabs} value={view} onChange={setView} label={L("Bagian Dana Operasional", "Operational Fund sections")} />}
      {view === "fund" ? <OpFundTab myProfile={myProfile} /> : <DriverBudgetTab myProfile={myProfile} />}
    </ModulePage>
  );
}

export function OpFundTab({ myProfile }: { myProfile: MyProfile | null }) {
  const { lang, t } = useLang();
  const lockedPlant = myProfile?.plantScope ?? null;
  const [viewPlant, setViewPlant] = useState<Plant>(lockedPlant ?? "CIK");

  useEffect(() => {
    if (lockedPlant) setViewPlant(lockedPlant);
  }, [lockedPlant]);

  const [kantong, setKantong] = useState<Kantong | null>(null);
  const [history, setHistory] = useState<Kantong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [gaugeReady, setGaugeReady] = useState(false);

  const [eBudget, setEBudget] = useState("");
  const [eOpDriver, setEOpDriver] = useState("");
  const [eEmergency, setEEmergency] = useState("");
  const [eCash, setECash] = useState("");
  const [eSubmitted, setESubmitted] = useState("");
  const [ePaid, setEPaid] = useState("");
  const [eUnsubmittedClaim, setEUnsubmittedClaim] = useState("");
  const [saving, setSaving] = useState(false);

  // First-time setup — shown only when no kantong row exists yet at all
  // for this plant.
  const [initBudget, setInitBudget] = useState("");
  const [initOpDriver, setInitOpDriver] = useState("");
  const [initEmergency, setInitEmergency] = useState("");
  const [initCash, setInitCash] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (plant: Plant) => {
    setLoading(true);
    setError(null);
    try {
      const k = await getCurrentKantong(plant);
      setKantong(k);
      if (k) {
        setEBudget(String(k.totalBudget));
        setEOpDriver(String(k.allocOpDriver));
        setEEmergency(String(k.allocEmergency));
        setECash(String(k.cashAvailable));
        setESubmitted(String(k.claimSubmitted));
        setEPaid(String(k.claimPaid));
        setEUnsubmittedClaim(String(k.unsubmittedClaim));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat Dana Operasional");
    } finally {
      setLoading(false);
    }
    try {
      setHistory(await getKantongHistory(plant));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    load(viewPlant);
  }, [load, viewPlant]);

  const totalBudgetPre = kantong?.totalBudget ?? 0;
  const outstandingPre = kantong
    ? kantong.allocOpDriver + kantong.allocEmergency + kantong.cashAvailable + kantong.claimSubmitted + kantong.claimPaid + kantong.unsubmittedClaim
    : 0;
  const gapPre = outstandingPre - totalBudgetPre;
  const animatedTotalBudget = useCountUp(totalBudgetPre);
  const animatedOutstanding = useCountUp(outstandingPre);
  const animatedGapAbs = useCountUp(Math.abs(gapPre));

  // ⚠️ Hook laporan ini WAJIB ada di sini (sebelum return awal loading/
  // error/belum-ada-data di bawah) — kalau dipindah ke bawah lagi,
  // jumlah hook yang dipanggil beda antar render dan bikin React error
  // #310 ("Rendered more hooks than during the previous render").
  const kantongColumns: ReportColumn<Kantong>[] = [
    { key: "period", labelId: "Periode", labelEn: "Period", get: (k) => k.period },
    { key: "plant", labelId: "Plant", labelEn: "Plant", get: (k) => k.plant },
    { key: "budget", labelId: "Total Budget (Rp)", labelEn: "Total Budget (Rp)", get: (k) => k.totalBudget, align: "right" },
    { key: "opDriver", labelId: "Alokasi OP Driver (Rp)", labelEn: "OP Driver Allocation (Rp)", get: (k) => k.allocOpDriver, align: "right" },
    { key: "emergency", labelId: "Alokasi Darurat (Rp)", labelEn: "Emergency Allocation (Rp)", get: (k) => k.allocEmergency, align: "right" },
    { key: "cash", labelId: "Kas Tersedia (Rp)", labelEn: "Cash Available (Rp)", get: (k) => k.cashAvailable, align: "right" },
    { key: "submitted", labelId: "Klaim Diajukan (Rp)", labelEn: "Claims Submitted (Rp)", get: (k) => k.claimSubmitted, align: "right" },
    { key: "paid", labelId: "Klaim Dibayar (Rp)", labelEn: "Claims Paid (Rp)", get: (k) => k.claimPaid, align: "right" },
    { key: "unsubmitted", labelId: "Belum Diajukan (Rp)", labelEn: "Not Yet Submitted (Rp)", get: (k) => k.unsubmittedClaim, align: "right" },
  ];
  const opFundExportPicker = useExportLanguagePicker((format, exportLang) => {
    const opts = {
      rows: history, columns: kantongColumns, lang: exportLang,
      titleId: `Laporan Dana Operasional — ${viewPlant}`, titleEn: `Operational Fund Report — ${viewPlant}`,
      periodLabel: history.length > 0 ? `${history[history.length - 1].period} s/d ${history[0].period}` : "-",
      filename: `Laporan_OpFund_${viewPlant}`,
    };
    if (format === "csv") exportGenericCsv(opts);
    else if (format === "excel") exportGenericExcel(opts);
    else exportGenericPdf(opts);
  });

  useEffect(() => {
    if (!loading && kantong) {
      const timer = setTimeout(() => setGaugeReady(true), 80);
      return () => clearTimeout(timer);
    }
    setGaugeReady(false);
  }, [loading, kantong]);

  const inputStyleInit: CSSProperties = {};
  const labelStyleInit: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  const PlantSwitcher = !lockedPlant ? (
    <div style={{ display: "flex", padding: 3, borderRadius: 10, background: "var(--bg2)", border: "1px solid var(--border2)", width: "fit-content", marginBottom: 18 }}>
      {(["CIK", "PRB"] as Plant[]).map((p) => (
        <button
          key={p}
          onClick={() => setViewPlant(p)}
          style={{
            padding: "8px 22px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: viewPlant === p ? "var(--surface)" : "transparent",
            color: viewPlant === p ? "var(--brand)" : "var(--t3)",
            boxShadow: viewPlant === p ? "var(--shadow-sm)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, background: "var(--bg2)", width: "fit-content", marginBottom: 18, fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)" }} />
      {lockedPlant}
      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--t3)" }}>({lang === "en" ? "your plant" : "plant akun ini"})</span>
    </div>
  );

  async function handleCreateInitial() {
    const budget = evalExpr(initBudget);
    if (!budget) return;
    setCreating(true);
    try {
      const now = new Date();
      await createKantong({
        period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        plant: viewPlant,
        totalBudget: budget,
        allocOpDriver: evalExpr(initOpDriver) || 0,
        allocEmergency: evalExpr(initEmergency) || 0,
        cashAvailable: evalExpr(initCash) || 0,
      });
      setInitBudget(""); setInitOpDriver(""); setInitEmergency(""); setInitCash("");
      await load(viewPlant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal membuat data Dana Operasional");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        {PlantSwitcher}
        <SkeletonRows rows={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 20 }}>
        {PlantSwitcher}
        <div style={{ padding: 30, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)" }}>{error}</div>
      </div>
    );
  }

  if (!kantong) {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>{PlantSwitcher}</div>
        <div className="heroGlow" style={{ borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)", padding: 28, width: "100%", maxWidth: 440 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? `Set Up Operational Fund — ${viewPlant}` : `Buat Data Dana Operasional — ${viewPlant}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 20 }}>
            {lang === "en"
              ? `No data yet for ${viewPlant} this period — enter the starting numbers below.`
              : `Belum ada data untuk plant ${viewPlant} periode ini — isi angka awalnya di bawah.`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative", zIndex: 1 }}>
            <div>
              <label className="fLabel" style={labelStyleInit}>{t.fieldTotalCashOp} *</label>
              <input className={styles.formInput} style={inputStyleInit} value={initBudget} onChange={(e) => setInitBudget(e.target.value)} placeholder="48000000" />
            </div>
            <div>
              <label className="fLabel" style={labelStyleInit}>OP DRIVER (A1)</label>
              <input className={styles.formInput} style={inputStyleInit} value={initOpDriver} onChange={(e) => setInitOpDriver(e.target.value)} placeholder="9000000" />
            </div>
            <div>
              <label className="fLabel" style={labelStyleInit}>EMERGENCY (A2)</label>
              <input className={styles.formInput} style={inputStyleInit} value={initEmergency} onChange={(e) => setInitEmergency(e.target.value)} placeholder="1500000" />
            </div>
            <div>
              <label className="fLabel" style={labelStyleInit}>CASH AVAILABLE (A4)</label>
              <input className={styles.formInput} style={inputStyleInit} value={initCash} onChange={(e) => setInitCash(e.target.value)} placeholder="20000000" />
            </div>
          </div>
          <button
            className="pillBtn"
            onClick={handleCreateInitial}
            disabled={!evalExpr(initBudget) || creating}
            style={{ width: "100%", justifyContent: "center", marginTop: 20, opacity: evalExpr(initBudget) && !creating ? 1 : 0.5 }}
          >
            {creating ? t.actionSaving : (lang === "en" ? "Create" : "Buat Data")}
          </button>
        </div>
      </div>
    );
  }

  const totalAlokasi = kantong.allocOpDriver + kantong.allocEmergency;
  const outstanding = totalAlokasi + kantong.cashAvailable + kantong.claimSubmitted + kantong.claimPaid + kantong.unsubmittedClaim;
  const gap = outstanding - kantong.totalBudget;
  const gapColor = gap === 0 ? "var(--green)" : gap > 0 ? "var(--orange)" : "var(--red)";
  const gapText = gap === 0 ? "Sesuai" : gap > 0 ? "Outstanding melebihi total cash" : "Outstanding di bawah total cash";

  async function handleSaveEdit() {
    if (!kantong) return;
    setSaving(true);
    try {
      const updated = {
        period: kantong.period,
        plant: viewPlant,
        totalBudget: evalExpr(eBudget) ?? kantong.totalBudget,
        allocOpDriver: evalExpr(eOpDriver) ?? kantong.allocOpDriver,
        allocEmergency: evalExpr(eEmergency) ?? kantong.allocEmergency,
        cashAvailable: evalExpr(eCash) ?? kantong.cashAvailable,
        claimSubmitted: evalExpr(eSubmitted) ?? kantong.claimSubmitted,
        claimPaid: evalExpr(ePaid) ?? kantong.claimPaid,
        unsubmittedClaim: evalExpr(eUnsubmittedClaim) ?? kantong.unsubmittedClaim,
        lastReset: kantong.lastReset,
      };
      await updateKantongBudget(updated);
      setShowEdit(false);
      await load(viewPlant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!kantong) return;
    const now = new Date();
    const newPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      await resetKantong(viewPlant, newPeriod, toLocalISODate(now));
      setShowResetConfirm(false);
      await load(viewPlant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal reset periode");
    }
  }

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  const composition = [
    { label: "Op Driver (A1)", value: kantong.allocOpDriver, color: "var(--orange)" },
    { label: "Emergency (A2)", value: kantong.allocEmergency, color: "var(--red)" },
    { label: "Cash Available (A4)", value: kantong.cashAvailable, color: "var(--green)" },
    { label: lang === "en" ? "Claim Submitted (A5)" : "Klaim Diajukan (A5)", value: kantong.claimSubmitted, color: "var(--brand)" },
    { label: lang === "en" ? "Claim Paid (A6)" : "Klaim Dibayar (A6)", value: kantong.claimPaid, color: "var(--purple)" },
    { label: lang === "en" ? "Unsubmitted Claim (A7)" : "Klaim Belum Diajukan (A7)", value: kantong.unsubmittedClaim, color: "#eab308" },
  ];

  const fundHealthPct = kantong.totalBudget > 0
    ? Math.max(0, 100 - Math.min(100, (Math.abs(gap) / kantong.totalBudget) * 100))
    : 100;
  const healthColor = fundHealthPct >= 90 ? "var(--green)" : fundHealthPct >= 70 ? "var(--brand)" : fundHealthPct >= 50 ? "var(--orange)" : "var(--red)";

  const trendData = history.map((h) => ({
    period: h.period,
gap: h.allocOpDriver + h.allocEmergency + h.cashAvailable + h.claimSubmitted + h.claimPaid + h.unsubmittedClaim - h.totalBudget,
  }));

  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const pctOf = (v: number) => (kantong.totalBudget > 0 ? (v / kantong.totalBudget) * 100 : 0);
  const compTotal = composition.reduce((x, c) => x + Math.max(0, c.value), 0) || 1;
  const statusTone = gap === 0 ? "ok" : gap > 0 ? "warn" : "bad";
  const insights: { icon: string; text: string; tone: "ok" | "warn" | "bad" | "info" }[] = [
    gap === 0
      ? { icon: "✅", tone: "ok", text: L("Outstanding sama persis dengan total cash — pembukuan seimbang.", "Outstanding matches total cash — books are balanced.") }
      : { icon: gap > 0 ? "⚠️" : "🔻", tone: gap > 0 ? "warn" : "bad", text: gap > 0
          ? L(`Outstanding melebihi total cash Rp ${fmtRp(gap)} — cek ulang alokasi / klaim.`, `Outstanding exceeds total cash by Rp ${fmtRp(gap)} — recheck allocations / claims.`)
          : L(`Masih ada Rp ${fmtRp(-gap)} yang belum tercatat di outstanding.`, `Rp ${fmtRp(-gap)} not yet accounted for in outstanding.`) },
    { icon: "💵", tone: pctOf(kantong.cashAvailable) < 20 ? "warn" : "info", text: L(`Kas tersedia ${pctOf(kantong.cashAvailable).toFixed(0)}% dari total cash (Rp ${fmtRp(kantong.cashAvailable)}).`, `Cash available is ${pctOf(kantong.cashAvailable).toFixed(0)}% of total (Rp ${fmtRp(kantong.cashAvailable)}).`) },
    ...(kantong.unsubmittedClaim > 0 ? [{ icon: "🧾", tone: "warn" as const, text: L(`Klaim belum diajukan Rp ${fmtRp(kantong.unsubmittedClaim)} — ajukan sebelum periode ditutup.`, `Rp ${fmtRp(kantong.unsubmittedClaim)} of claims not yet submitted.`) }] : []),
    ...(kantong.claimSubmitted > 0 ? [{ icon: "⏳", tone: "info" as const, text: L(`Klaim diajukan menunggu dibayar: Rp ${fmtRp(kantong.claimSubmitted)}.`, `Submitted claims awaiting payment: Rp ${fmtRp(kantong.claimSubmitted)}.`) }] : []),
  ];
  const maxTrend = Math.max(1, ...trendData.map((d) => Math.abs(d.gap)));

  return (
    <div className={of.wrap}>
      <div className={of.topBar}>
        <div className={of.titleBlock}>
          <span className={of.titleIcon}>📅</span>
          <div>
            <p>{L("Periode", "Period")} <b>{kantong.period}</b></p>
            <p>{L("reset terakhir", "last reset")} {kantong.lastReset}</p>
          </div>
        </div>
        <div className={of.topActions}>
          {lockedPlant ? (
            <span className={of.plantLocked}><i />{lockedPlant}</span>
          ) : (
            <div className={of.plantSeg} role="group" aria-label="Plant">
              {(["CIK", "PRB"] as Plant[]).map((p) => (
                <button key={p} type="button" className={viewPlant === p ? of.plantOn : ""} onClick={() => setViewPlant(p)} aria-pressed={viewPlant === p}>{p}</button>
              ))}
            </div>
          )}
          <button type="button" className={of.btn} onClick={() => setShowEdit(true)}>✏️ {L("Edit nilai", "Edit values")}</button>
          <button type="button" className={`${of.btn} ${of.btnDanger}`} onClick={() => setShowResetConfirm(true)}>🔄 {L("Reset periode", "Reset period")}</button>
          <ReportExportButtons onExport={opFundExportPicker.requestExport} disabled={history.length === 0} />
        </div>
      </div>
      {opFundExportPicker.pending && <LanguagePickerModal format={opFundExportPicker.pending} onConfirm={opFundExportPicker.confirm} onClose={opFundExportPicker.cancel} />}

      {/* ── Hero: total, outstanding, gap + komposisi ── */}
      <section className={of.hero}>
        <div className={of.heroMain}>
          <div className={of.ring} style={{ ["--p" as string]: gaugeReady ? fundHealthPct : 0, ["--c" as string]: healthColor }}>
            <div><b>{Math.round(fundHealthPct)}</b><small>{L("kesehatan", "health")}</small></div>
          </div>
          <div className={of.heroNums}>
            <div className={of.heroNum}>
              <small>Total Cash Operational (A)</small>
              <strong>Rp {fmtRp(animatedTotalBudget)}</strong>
            </div>
            <div className={of.heroNum}>
              <small>Outstanding (B)</small>
              <strong>Rp {fmtRp(animatedOutstanding)}</strong>
            </div>
            <div className={of.heroNum}>
              <small>GAP = B − A</small>
              <strong className={of["gap_" + statusTone]}>{gap >= 0 ? "+" : "−"}Rp {fmtRp(animatedGapAbs)}</strong>
              <span className={`${of.status} ${of["st_" + statusTone]}`}>{gapText}</span>
            </div>
          </div>
        </div>
        <div className={of.stack} role="img" aria-label={L("Komposisi outstanding", "Outstanding composition")}>
          {composition.map((c) => c.value > 0 && (
            <span key={c.label} style={{ width: `${(c.value / compTotal) * 100}%`, background: c.color }} title={`${c.label}: Rp ${fmtRp(c.value)}`} />
          ))}
        </div>
        <div className={of.legend}>
          {composition.map((c) => <span key={c.label}><i style={{ background: c.color }} />{c.label}</span>)}
        </div>
      </section>

      {/* ── Tiles per pos ── */}
      <div className={of.tiles}>
        {composition.map((c, i) => {
          const pct = pctOf(c.value);
          return (
            <div key={c.label} className={of.tile} style={{ ["--c" as string]: c.color, animationDelay: `${i * 0.04}s` }}>
              <span className={of.tileLabel}><i />{c.label}</span>
              <b>Rp {fmtRp(c.value)}</b>
              <span className={of.tileBar}><span style={{ width: `${Math.min(100, pct)}%` }} /></span>
              <small>{pct.toFixed(1).replace(".", ",")}% {L("dari total cash", "of total cash")}</small>
            </div>
          );
        })}
      </div>

      <div className={of.grid2}>
        <section className={of.card}>
          <div className={of.cardHead}><h3>{L("Catatan cepat", "Quick insights")}</h3><span>{insights.length}</span></div>
          <ul className={of.insights}>
            {insights.map((x, i) => <li key={i} className={of["in_" + x.tone]}><span>{x.icon}</span><p>{x.text}</p></li>)}
          </ul>
        </section>

        <section className={of.card}>
          <div className={of.cardHead}><h3>{L("Tren gap per periode", "Gap trend by period")}</h3><span>{trendData.length}</span></div>
          <p className={of.cardSub}>{L("Batang ke atas = melebihi budget, ke bawah = di bawah budget", "Up = over budget, down = under budget")}</p>
          {trendData.length < 2 ? (
            <div className={of.empty}>{L("Belum cukup periode untuk membuat tren.", "Not enough periods yet for a trend.")}</div>
          ) : (
            <div className={of.trend}>
              {trendData.map((d) => (
                <div key={d.period} className={of.trendCol} title={`${d.period}: ${d.gap >= 0 ? "+" : "−"}Rp ${fmtRp(Math.abs(d.gap))}`}>
                  <div className={of.trendUp}>{d.gap > 0 && <span style={{ height: `${(d.gap / maxTrend) * 100}%` }} />}</div>
                  <div className={of.trendDown}>{d.gap < 0 && <span style={{ height: `${(-d.gap / maxTrend) * 100}%` }} />}</div>
                  <small>{d.period.slice(2)}</small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ForecastCard plant={viewPlant} />

      {showEdit && (
        <ModalPortal onOverlayClick={() => setShowEdit(false)} maxWidth={420}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>Edit Dana Operasional — {viewPlant}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label>{t.fieldTotalCashOp}</label><input className={styles.formInput} value={eBudget} onChange={(e) => setEBudget(e.target.value)} /></div>
              <div><label>OP DRIVER (A1)</label><input className={styles.formInput} value={eOpDriver} onChange={(e) => setEOpDriver(e.target.value)} /></div>
              <div><label>EMERGENCY (A2)</label><input className={styles.formInput} value={eEmergency} onChange={(e) => setEEmergency(e.target.value)} /></div>
              <div><label>CASH AVAILABLE (A4)</label><input className={styles.formInput} value={eCash} onChange={(e) => setECash(e.target.value)} /></div>
              <div><label>{lang === "en" ? "CLAIM SUBMITTED (A5)" : "CLAIM DIAJUKAN (A5)"}</label><input className={styles.formInput} value={eSubmitted} onChange={(e) => setESubmitted(e.target.value)} /></div>
             <div><label>{lang === "en" ? "CLAIM PAID (A6)" : "CLAIM DIBAYAR (A6)"}</label><input className={styles.formInput} value={ePaid} onChange={(e) => setEPaid(e.target.value)} /></div>
              <div><label>{lang === "en" ? "UNSUBMITTED CLAIM (A7)" : "KLAIM BELUM DIAJUKAN (A7)"}</label><input className={styles.formInput} value={eUnsubmittedClaim} onChange={(e) => setEUnsubmittedClaim(e.target.value)} placeholder="0" /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowEdit(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSaveEdit} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {showResetConfirm && (
        <ModalPortal onOverlayClick={() => setShowResetConfirm(false)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔄</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>Reset Periode — {viewPlant}?</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              Claim Diajukan (A5) dan Claim Dibayar (A6) akan direset ke 0 untuk periode baru. Total cash dan alokasi tetap sama. Data periode lama tetap tersimpan.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleReset} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Ya, Reset</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
