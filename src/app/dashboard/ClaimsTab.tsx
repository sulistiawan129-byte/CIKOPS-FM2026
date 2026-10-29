"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import cs from "./claims.module.css";
import { ClaimsHero, ClaimCard, WeekHeader, ViewSwitch, PeriodSwitch, RecapBar, ClaimForm, WreathCard, CLAIM_CATS, catLabel } from "./ClaimsUI";
import { ModalPortal } from "@/components/ModalPortal";
import { sendPushToDriver, getDrivers, type MyProfile, getClaims, addClaim, deleteClaim, updateClaim, getWreaths, addWreath, setWreathClaimed, deleteWreath, sendClaimNotificationEmails, getAppSetting } from "@/lib/api";
import type { Claim, ClaimItem, Plant, Wreath } from "@/lib/types";
import { exportTandaTerima } from "@/lib/tandaTerima";
import { buildRincianRows } from "@/lib/claimRecap";
import { exportWeeklyRecapToExcel, exportWeeklyRecapToPdf } from "@/lib/weeklyRecapExport";
import { exportWreathsToCsv } from "@/lib/report";
import type { Driver } from "@/lib/types";
import { useLang } from "@/lib/providers";
import of from "./opfund.module.css";
import { ModuleHeader } from "./ModuleShell";
import { todayStr, useIsMobile, useCountUp, formatDateLabel, fmtRp, evalExpr, monthWeekBoundaries, PLANT_COLOR } from "./dashboardShared";
import { OpFundTab } from "./OpFundTab";
import { ClaimRequestsPanel } from "./ClaimRequestsPanel";
import { approveClaimRequest, getClaimRequests, rejectClaimRequest, subscribeClaimRequests, type ClaimRequest } from "@/lib/claims/driverClaims";
import { plantShort } from "@/lib/brand";

/** Which of the month's 4 work-weeks (1–4) a date falls into — see
 *  monthWeekBoundaries() above for the exact rule. */
export function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 1;
  const dNum = d.getDate();
  const bounds = monthWeekBoundaries(dateStr);
  for (let i = 0; i < bounds.length; i++) {
    if (dNum <= bounds[i].end) return i + 1;
  }
  return 4;
}

/* ════════════════════════════════════════════════════════════
   BUDGET FORECAST (Claims-based) — used by OpFundTab to project
   next week's likely spend from recent claim history, for the
   "dana belum cair dari Finance" contingency-planning scenario.
════════════════════════════════════════════════════════════ */

type ClaimLineDraft = { id: number; type: string; expr: string };

/** The month-anchored work-week (Mon–Fri, Week 1–4) containing the given
 *  date — used both for the Claims table's "Period: X – Y" display and
 *  for the per-week filter. Shares monthWeekBoundaries()'s rule with
 *  weekOfMonth() so the filter and the Weekly Recap report always agree
 *  on where each week starts and ends. */
function weekRangeOf(dateStr: string, lang: string): { from: Date; to: Date; label: string } {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const wk = weekOfMonth(dateStr);
  const bounds = monthWeekBoundaries(dateStr)[wk - 1];
  const from = new Date(year, month, bounds.start);
  const to = new Date(year, month, bounds.end);
  const fmt = (dt: Date) => dt.toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short" });
  const weekLabel = lang === "en" ? `Week ${wk}` : `Minggu ${wk}`;
  return { from, to, label: `${weekLabel} · ${fmt(from)} – ${fmt(to)}` };
}

/** Groups claims into per-week, per-driver totals by category (Gasoline/
 *  Toll/Parking/Other). Shared by the on-screen Weekly Recap table and by
 *  the Excel/PDF export (which calls this twice — once for the "Driver
 *  User" list, once for everyone else — to produce two separate tables). */
function computeWeeklyRecap(claims: Claim[]): {
  rows: { weekLabel: string; driver: string; gasoline: number; toll: number; parking: number; other: number; total: number }[];
  grandTotal: { gasoline: number; toll: number; parking: number; other: number; total: number };
} {
  const weekMap = new Map<string, Map<string, { Gasoline: number; Toll: number; Parking: number; Other: number }>>();
  claims.forEach((c) => {
    const wk = weekOfMonth(c.periodDate);
    const weekKey = `${c.periodDate.slice(0, 7)}-W${wk}`;
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Map());
    const driverMap = weekMap.get(weekKey)!;
    const name = c.driverName || "-";
    if (!driverMap.has(name)) driverMap.set(name, { Gasoline: 0, Toll: 0, Parking: 0, Other: 0 });
    const bucket = driverMap.get(name)!;
    c.items.forEach((item) => {
      const cat = item.type === "Gasoline" ? "Gasoline" : item.type === "Toll" ? "Toll" : item.type === "Parking" ? "Parking" : "Other";
      bucket[cat] += item.total;
    });
  });
  const weekKeys = [...weekMap.keys()].sort();
  const rows: { weekLabel: string; driver: string; gasoline: number; toll: number; parking: number; other: number; total: number }[] = [];
  weekKeys.forEach((wk) => {
    const driverMap = weekMap.get(wk)!;
    const weekNum = wk.split("-W")[1];
    [...driverMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([driver, vals]) => {
      rows.push({
        weekLabel: weekNum,
        driver,
        gasoline: vals.Gasoline,
        toll: vals.Toll,
        parking: vals.Parking,
        other: vals.Other,
        total: vals.Gasoline + vals.Toll + vals.Parking + vals.Other,
      });
    });
  });
  const grandTotal = {
    gasoline: rows.reduce((s, r) => s + r.gasoline, 0),
    toll: rows.reduce((s, r) => s + r.toll, 0),
    parking: rows.reduce((s, r) => s + r.parking, 0),
    other: rows.reduce((s, r) => s + r.other, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
  };
  return { rows, grandTotal };
}

export function ClaimsTab({ myProfile = null }: { myProfile?: MyProfile | null }) {
  const { lang, t } = useLang();
  const isMobileClaims = useIsMobile(768);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [periodMode, setPeriodMode] = useState<"all" | "week" | "date">("all");
  const [filterDate, setFilterDate] = useState(todayStr());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Claim | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);
  const [formDriverId, setFormDriverId] = useState("");
  const [submissionDate, setSubmissionDate] = useState(todayStr());
  const [periodDate, setPeriodDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ClaimLineDraft[]>([
    { id: Date.now(), type: "Gasoline", expr: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [driverUserIds, setDriverUserIds] = useState<string[]>([]);
  const [exportingRecap, setExportingRecap] = useState(false);
  const [exportingWeeklyRecap, setExportingWeeklyRecap] = useState<"excel" | "pdf" | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "weekly" | "wreath" | "requests">("list");
  // ── Self-Claim: pengajuan dari aplikasi driver ──
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [requestsErr, setRequestsErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ClaimRequest | null>(null);
  const [rejecting, setRejecting] = useState<ClaimRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const canReview = ["master", "admin", "ga", "admin_ga_cik"].includes(myProfile?.role ?? "master");
  const pendingRequests = requests.filter((r) => r.status === "menunggu").length;
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ name: string; total: number; edited?: boolean } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  // ── Karangan Bunga Duka Cita ──
  const [wreaths, setWreaths] = useState<Wreath[]>([]);
  const [loadingWreaths, setLoadingWreaths] = useState(false);
  const [showWreathForm, setShowWreathForm] = useState(false);
  const [wreathTanggal, setWreathTanggal] = useState(todayStr());
  const [wreathAtasNama, setWreathAtasNama] = useState("");
  const [wreathKeterangan, setWreathKeterangan] = useState("");
  const [wreathPlant, setWreathPlant] = useState<Plant>(myProfile?.plantScope ?? "CIK");
  const [savingWreath, setSavingWreath] = useState(false);
  const [confirmDeleteWreath, setConfirmDeleteWreath] = useState<Wreath | null>(null);
  const [wreathStatusFilter, setWreathStatusFilter] = useState<"all" | "submitted" | "pending">("all");

  const loadWreaths = useCallback(async () => {
    setLoadingWreaths(true);
    try {
      const w = await getWreaths(myProfile?.plantScope ?? null);
      setWreaths(w);
    } catch (e) {
      console.warn("Gagal memuat data karangan bunga:", e);
    } finally {
      setLoadingWreaths(false);
    }
  }, [myProfile?.plantScope]);

  useEffect(() => {
    if (viewMode === "wreath") loadWreaths();
  }, [viewMode, loadWreaths]);

  const filteredWreaths = useMemo(() => {
    if (wreathStatusFilter === "submitted") return wreaths.filter((w) => w.claimed);
    if (wreathStatusFilter === "pending") return wreaths.filter((w) => !w.claimed);
    return wreaths;
  }, [wreaths, wreathStatusFilter]);

  function openAddWreath() {
    setWreathTanggal(todayStr());
    setWreathAtasNama("");
    setWreathKeterangan("");
    setWreathPlant(myProfile?.plantScope ?? "CIK");
    setShowWreathForm(true);
  }

  const canSaveWreath = wreathTanggal.trim() !== "" && wreathAtasNama.trim() !== "";

  async function handleSaveWreath() {
    if (!canSaveWreath || savingWreath) return;
    setSavingWreath(true);
    try {
      await addWreath({
        plant: wreathPlant,
        tanggal: wreathTanggal,
        atasNama: wreathAtasNama.trim(),
        keterangan: wreathKeterangan.trim(),
      });
      setShowWreathForm(false);
      await loadWreaths();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan data karangan bunga");
    } finally {
      setSavingWreath(false);
    }
  }

  async function handleToggleWreathClaimed(w: Wreath) {
    // optimistic update — table stays snappy, revert on failure
    setWreaths((prev) => prev.map((x) => (x.id === w.id ? { ...x, claimed: !x.claimed } : x)));
    try {
      await setWreathClaimed(w.id, !w.claimed);
    } catch (e) {
      setWreaths((prev) => prev.map((x) => (x.id === w.id ? { ...x, claimed: w.claimed } : x)));
      alert(e instanceof Error ? e.message : "Gagal mengubah status klaim");
    }
  }

  async function handleDeleteWreath() {
    if (!confirmDeleteWreath) return;
    try {
      await deleteWreath(confirmDeleteWreath.id);
      setConfirmDeleteWreath(null);
      await loadWreaths();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus data karangan bunga");
    }
  }

  function handleExportWreaths() {
    const plantLabel = myProfile?.plantScope ?? "Semua-Plant";
    exportWreathsToCsv(filteredWreaths, plantLabel);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, d, du] = await Promise.all([getClaims(myProfile?.plantScope ?? null), getDrivers(myProfile?.plantScope ?? null), getAppSetting("driver_user_ids")]);
      setClaims(c);
      setDrivers(d);
      setDriverUserIds(du ? du.split(",").filter(Boolean) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data klaim");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadRequests = useCallback(async () => {
    try { setRequests(await getClaimRequests({ status: "all", plant: myProfile?.plantScope ?? null })); setRequestsErr(null); }
    catch (e) { setRequestsErr(e instanceof Error ? e.message : String(e)); }
  }, [myProfile?.plantScope]);
  useEffect(() => {
    loadRequests();
    return subscribeClaimRequests(() => loadRequests());
  }, [loadRequests]);

  function openReview(r: ClaimRequest) {
    setReviewing(r);
    setEditingClaim(null);
    setFormDriverId(r.driverId);
    setSubmissionDate(todayStr());
    setPeriodDate(r.periodDate);
    setNote(r.note || "");
    setLines(r.items.length ? r.items.map((it, i) => ({ id: Date.now() + i, type: it.type, expr: it.expr || String(it.total) })) : [{ id: Date.now(), type: "Gasoline", expr: "" }]);
    setShowForm(true);
  }

  async function handleReject() {
    if (!rejecting || !rejectReason.trim() || rejectBusy) return;
    setRejectBusy(true);
    try {
      await rejectClaimRequest(rejecting.id, rejectReason.trim());
      sendPushToDriver([rejecting.driverId], lang === "en" ? "Claim rejected ❌" : "Klaim ditolak ❌",
        `Rp ${fmtRp(rejecting.total)} · ${rejectReason.trim()}`, { type: "claim" }).catch(() => {});
      setRejecting(null); setRejectReason("");
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally { setRejectBusy(false); }
  }

  const filtered = useMemo(() => {
    let list = driverFilter === "all" ? claims : claims.filter((c) => c.driver_id === driverFilter);
    if (periodMode === "date") {
      list = list.filter((c) => c.periodDate === filterDate);
    } else if (periodMode === "week") {
      const { from, to } = weekRangeOf(filterDate, lang);
      list = list.filter((c) => {
        const d = new Date(c.periodDate);
        return d >= from && d <= to;
      });
    }
    return list;
  }, [claims, driverFilter, periodMode, filterDate, lang]);
  const totalFiltered = filtered.reduce((s, c) => s + c.total, 0);
  const uniqueDriversFiltered = new Set(filtered.map((c) => c.driver_id)).size;
  const animatedClaimsCount = useCountUp(filtered.length);
  const animatedTotalFiltered = useCountUp(totalFiltered);
  const animatedActiveDriversClaims = useCountUp(uniqueDriversFiltered);

  const weeklyRecap = useMemo(() => computeWeeklyRecap(filtered), [filtered]);

  function openEditClaim(c: Claim) {
    setEditingClaim(c);
    setFormDriverId(c.driver_id);
    setSubmissionDate(c.submissionDate);
    setPeriodDate(c.periodDate);
    setNote(c.note || "");
    setLines(
      c.items.length > 0
        ? c.items.map((it, i) => ({ id: Date.now() + i, type: it.type, expr: it.expr || String(it.total) }))
        : [{ id: Date.now(), type: "Gasoline", expr: "" }]
    );
    setShowForm(true);
  }

  function openAdd() {
    setEditingClaim(null);
    setFormDriverId("");
    setSubmissionDate(todayStr());
    setPeriodDate(todayStr());
    setNote("");
    setLines([{ id: Date.now(), type: "Gasoline", expr: "" }]);
    setShowForm(true);
  }

  function addLine() {
    setLines((p) => [...p, { id: Date.now() + Math.random(), type: "Gasoline", expr: "" }]);
  }
  function removeLine(id: number) {
    setLines((p) => (p.length > 1 ? p.filter((l) => l.id !== id) : p));
  }
  function updateLine(id: number, field: "type" | "expr", value: string) {
    setLines((p) => p.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  const grandTotal = lines.reduce((s, l) => s + (evalExpr(l.expr) || 0), 0);
  const canSave = !!formDriverId && lines.every((l) => l.type && (evalExpr(l.expr) || 0) > 0);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const items: ClaimItem[] = lines.map((l) => ({
        type: l.type,
        expr: l.expr,
        total: evalExpr(l.expr) || 0,
      }));
      if (reviewing) {
        await approveClaimRequest(reviewing.id, { driverId: formDriverId, submissionDate, periodDate, items, note });
        const changed = Math.round(grandTotal) !== Math.round(reviewing.total);
        sendPushToDriver([formDriverId], lang === "en" ? "Claim verified ✅" : "Klaim diverifikasi ✅",
          `Rp ${new Intl.NumberFormat("id-ID").format(grandTotal)}${changed ? (lang === "en" ? " (corrected by admin)" : " (dikoreksi admin)") : ""}`, { type: "claim" }).catch(() => {});
        setShowForm(false);
        setReviewing(null);
        setNotice({ name: drivers.find((d) => d.id === formDriverId)?.nama || reviewing.driverName || "-", total: grandTotal });
        await Promise.all([load(), loadRequests()]);
        return;
      }
      if (editingClaim) {
        await updateClaim(editingClaim.id, { driver_id: formDriverId, submissionDate, periodDate, items, total: grandTotal, note });
        setShowForm(false);
        setEditingClaim(null);
        setNotice({ name: drivers.find((d) => d.id === formDriverId)?.nama || editingClaim.driverName || "-", total: grandTotal, edited: true });
        await load();
        return;
      }
      await addClaim({
        driver_id: formDriverId,
        submissionDate,
        periodDate,
        items,
        total: grandTotal,
        note,
      });
      setShowForm(false);
      setNotice({ name: drivers.find((d) => d.id === formDriverId)?.nama || "-", total: grandTotal });
      await load();

      // Best-effort email notifications — driver gets a friendly
      // confirmation, manager gets a formal record copy. Never blocks
      // or fails the claim submission itself; only logged if it fails
      // (e.g. Edge Function not deployed yet, or no email on file).
      const driverEmail = drivers.find((d) => d.id === formDriverId)?.email;
      const driverName = drivers.find((d) => d.id === formDriverId)?.nama || "-";
      sendClaimNotificationEmails(driverEmail, {
        driverName,
        periodDate,
        submissionDate,
        items,
        total: grandTotal,
        note,
        lang,
      })
        .then((res) => {
          if (res.driver && !res.driver.ok) console.warn("Driver claim email failed:", res.driver.error);
          if (res.manager && !res.manager.ok) console.warn("Manager claim email failed:", res.manager.error);
        })
        .catch((e) => console.warn("Claim email notification failed:", e));
      // Push notification ke driver (fire-and-forget)
      sendPushToDriver(
        [formDriverId],
        lang === "en" ? "New Claim Submitted 💰" : "Ada Klaim Baru 💰",
        lang === "en"
          ? `Period: ${periodDate} · Total: Rp ${new Intl.NumberFormat("id-ID").format(grandTotal)}`
          : `Periode: ${periodDate} · Total: Rp ${new Intl.NumberFormat("id-ID").format(grandTotal)}`,
        { type: "claim" }
      ).catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan klaim");
    } finally {
      setSaving(false);
    }
  }

 async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteClaim(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus klaim");
    }
  }

  function handleExportRecap() {
    setExportingRecap(true);
    try {
      const label = weekRangeOf(filterDate, lang).label + " " + filterDate.slice(0, 4);
      exportTandaTerima(filtered, `Week ${weekOfMonth(filterDate)} - ${label}`, plantShort("CIK"), driverUserIds);
    } finally {
      setExportingRecap(false);
    }
  }

  function weeklyRecapPeriodLabel(): string {
    if (periodMode === "week") return `${weekRangeOf(filterDate, lang).label} ${filterDate.slice(0, 4)}`;
    if (periodMode === "date") return filterDate;
    return lang === "en" ? "All Time" : "Semua Periode";
  }

  async function handleExportWeeklyRecap(format: "excel" | "pdf") {
    if (exportingWeeklyRecap) return;
    setExportingWeeklyRecap(format);
    try {
      const label = weeklyRecapPeriodLabel();

      const userClaims = filtered.filter((c) => driverUserIds.includes(c.driver_id));
      const otherClaims = filtered.filter((c) => !driverUserIds.includes(c.driver_id));
      const hasDriverUserSplit = driverUserIds.length > 0 && userClaims.length > 0;

      const sections = hasDriverUserSplit
        ? [
            { ...computeWeeklyRecap(userClaims), title: "TANDA TERIMA — DRIVER USER", rincianRows: buildRincianRows(userClaims) },
            { ...computeWeeklyRecap(otherClaims), title: "TANDA TERIMA", rincianRows: buildRincianRows(otherClaims) },
          ]
        : [{ ...weeklyRecap, title: "TANDA TERIMA", rincianRows: buildRincianRows(filtered) }];

      if (format === "excel") {
        await exportWeeklyRecapToExcel(sections, label);
      } else {
        await exportWeeklyRecapToPdf(sections, label);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal membuat file rekap");
    } finally {
      setExportingWeeklyRecap(null);
    }
  }

  const en = lang === "en";
  const periodLabel = weeklyRecapPeriodLabel();
  const typeOrder = [...CLAIM_CATS as readonly string[], ...Array.from(new Set(filtered.flatMap((c) => c.items.map((i) => i.type)))).filter((x) => !(CLAIM_CATS as readonly string[]).includes(x))];
  const byType = typeOrder.map((type) => ({
    type,
    amount: filtered.reduce((s, c) => s + c.items.filter((i) => i.type === type).reduce((a, i) => a + i.total, 0), 0),
  }));
  const typeFiltered = typeFilter ? filtered.filter((c) => c.items.some((i) => i.type === typeFilter)) : filtered;
  const groups = useMemo(() => {
    const sorted = typeFiltered.slice().sort((a, b) => (a.periodDate < b.periodDate ? 1 : a.periodDate > b.periodDate ? -1 : (a.submittedAt < b.submittedAt ? 1 : -1)));
    const map = new Map<string, { label: string; items: Claim[]; total: number }>();
    for (const c of sorted) {
      const key = `${c.periodDate.slice(0, 7)}-W${weekOfMonth(c.periodDate)}`;
      const g = map.get(key) ?? { label: weekRangeOf(c.periodDate, lang).label, items: [], total: 0 };
      g.items.push(c);
      g.total += c.total;
      map.set(key, g);
    }
    return [...map.entries()];
  }, [typeFiltered, lang]);
  let formWeek = "";
  try { formWeek = periodDate ? weekRangeOf(periodDate, lang).label : ""; } catch { formWeek = ""; }
  const driverOptions = drivers.map((d) => ({ id: d.id, nama: d.nama }));
  // Saat edit, driver klaim lama tetap muncul di daftar walau sudah nonaktif / beda filter.
  if (reviewing && !driverOptions.some((d) => d.id === reviewing.driverId)) {
    driverOptions.unshift({ id: reviewing.driverId, nama: reviewing.driverName || "-" });
  }
  if (editingClaim && !driverOptions.some((d) => d.id === editingClaim.driver_id)) {
    driverOptions.unshift({ id: editingClaim.driver_id, nama: editingClaim.driverName || "-" });
  }

  return (
    <div className={cs.root}>
      <ModuleHeader
        kicker={en ? "Finance · Claims" : "Finance · Klaim"}
        title={en ? "Driver Claims" : "Klaim Driver"}
        desc={en ? "Driver expense claims (fuel, tolls, parking, service, and more), weekly recaps, and condolence wreaths." : "Pengajuan klaim pengeluaran driver (bensin, tol, parkir, servis, dan lainnya), rekap mingguan, serta karangan bunga duka cita."}
      />
      {notice && (
        <div className={cs.notice} role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m8 12.5 2.8 2.8L16 9.5" /></svg>
          <span>{notice.edited ? (en ? "Claim updated for" : "Klaim diperbarui untuk") : (en ? "Claim submitted for" : "Klaim terkirim untuk")} <b>{notice.name}</b> · Rp {fmtRp(notice.total)}</span>
        </div>
      )}
      {error && <div className={`${cs.notice} ${cs.noticeErr}`} role="alert">{error}</div>}

      <ViewSwitch
        value={viewMode}
        onChange={setViewMode}
        options={[
          { key: "list", label: en ? "Claims" : "Daftar klaim" },
          { key: "weekly", label: en ? "Weekly recap" : "Rekap mingguan" },
          { key: "requests", label: `${en ? "Driver requests" : "Pengajuan driver"}${pendingRequests ? ` (${pendingRequests})` : ""}`, icon: <span aria-hidden="true">📲</span> },
          { key: "wreath", label: en ? "Condolence wreaths" : "Karangan bunga duka cita", icon: <span aria-hidden="true">💐</span> },
        ]}
      />

      {viewMode === "requests" && (
        <ClaimRequestsPanel lang={lang} requests={requests} error={requestsErr} canReview={canReview}
          onReview={openReview} onReject={(r) => { setRejecting(r); setRejectReason(""); }} />
      )}

      {viewMode !== "list" || pendingRequests === 0 ? null : (
        <button className={cs.notice} style={{ cursor: "pointer", textAlign: "left", width: "100%" }} onClick={() => setViewMode("requests")}>
          <span aria-hidden="true">📲</span>
          <span><b>{pendingRequests}</b> {en ? "claim request(s) from drivers awaiting review — open" : "pengajuan klaim dari driver menunggu verifikasi — buka"}</span>
        </button>
      )}

      {viewMode !== "wreath" && viewMode !== "requests" && (
        <div className={cs.top}>
          <div className={cs.filters}>
            <select className={cs.select} value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Driver">
              <option value="all">{en ? "All drivers" : "Semua driver"}</option>
              {drivers.map((d) => (<option key={d.id} value={d.id}>{d.nama}</option>))}
            </select>
            <PeriodSwitch
              value={periodMode}
              onChange={setPeriodMode}
              labels={[en ? "All time" : "Semua", en ? "By week" : "Per minggu", en ? "By date" : "Per tanggal"]}
            />
            {periodMode !== "all" && (
              <input type="date" className={cs.dateIn} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} aria-label={en ? "Filter date" : "Tanggal filter"} />
            )}
            {periodMode === "week" && <span className={cs.weekNote}>{weekRangeOf(filterDate, lang).label}</span>}
          </div>
          <div className={cs.actions}>
            {periodMode === "week" && filtered.length > 0 && (
              <button className={`${cs.btn} ${cs.btnGreen}`} onClick={handleExportRecap} disabled={exportingRecap} title={en ? "Export official Finance recap format (CSV)" : "Export format rekap resmi Finance (CSV)"}>
                ⬇ {exportingRecap ? "..." : "Export Tanda Terima"}
              </button>
            )}
            <button className={cs.primary} onClick={openAdd}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {en ? "New claim" : "Buat klaim"}
            </button>
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <>
          <ClaimsHero
            lang={lang}
            total={totalFiltered}
            count={filtered.length}
            drivers={uniqueDriversFiltered}
            byType={byType}
            activeType={typeFilter}
            onType={setTypeFilter}
            totalValue={animatedTotalFiltered}
            countValue={animatedClaimsCount}
            driversValue={animatedActiveDriversClaims}
            periodLabel={periodLabel}
          />
          {loading ? (
            <div className={cs.skel}><i /><i /><i /></div>
          ) : typeFiltered.length === 0 ? (
            <div className={cs.empty}>
              <span className={cs.emptyIc} aria-hidden="true">🧾</span>
              <b>{filtered.length === 0 ? (en ? "No claims in this view" : "Belum ada klaim di tampilan ini") : (en ? "No claim has this category" : "Tidak ada klaim dengan kategori ini")}</b>
              <p>{filtered.length === 0 ? (en ? "Change the filters, or add the first claim." : "Ubah filter di atas, atau buat klaim pertama.") : (en ? "Clear the category filter to see everything again." : "Hapus filter kategori untuk melihat semuanya lagi.")}</p>
              {filtered.length === 0
                ? <button className={cs.primary} onClick={openAdd}>{en ? "New claim" : "Buat klaim"}</button>
                : <button className={cs.btn} onClick={() => setTypeFilter(null)}>{en ? "Clear filter" : "Hapus filter"}</button>}
            </div>
          ) : (
            <div className={cs.list}>
              {groups.map(([key, g]) => (
                <div key={key} style={{ display: "contents" }}>
                  <WeekHeader label={g.label} count={g.items.length} total={g.total} lang={lang} />
                  {g.items.map((c) => (
                    <ClaimCard
                      key={c.id}
                      claim={c}
                      open={expandedId === c.id}
                      onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      onDelete={() => setConfirmDelete(c)}
                      onEdit={() => openEditClaim(c)}
                      lang={lang}
                      typeFilter={typeFilter}
                      weekText={weekRangeOf(c.periodDate, lang).label}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === "weekly" && (
        <div className={cs.panel}>
          <div className={cs.panelBar}>
            <h3>{en ? "Weekly recap" : "Rekap mingguan"} · {periodLabel}</h3>
            <div className={cs.actions}>
              <button className={`${cs.btn} ${cs.btnGreen}`} onClick={() => handleExportWeeklyRecap("excel")} disabled={exportingWeeklyRecap !== null || weeklyRecap.rows.length === 0} title={en ? "Download this recap as Excel (.xlsx)" : "Unduh rekap ini sebagai Excel (.xlsx)"}>
                ⬇ {exportingWeeklyRecap === "excel" ? "..." : "Excel"}
              </button>
              <button className={`${cs.btn} ${cs.btnRed}`} onClick={() => handleExportWeeklyRecap("pdf")} disabled={exportingWeeklyRecap !== null || weeklyRecap.rows.length === 0} title={en ? "Download this recap as PDF" : "Unduh rekap ini sebagai PDF"}>
                ⬇ {exportingWeeklyRecap === "pdf" ? "..." : "PDF"}
              </button>
            </div>
          </div>
          {weeklyRecap.rows.length === 0 ? (
            <div className={cs.empty} style={{ border: 0 }}><span className={cs.emptyIc} aria-hidden="true">📊</span><b>{t.actionNoDataYet}</b></div>
          ) : (
            <div className={cs.tableWrap}>
              <table className={cs.table}>
                <thead>
                  <tr>
                    <th>{en ? "Week" : "Minggu"}</th>
                    <th>{en ? "Driver" : "Nama driver"}</th>
                    <th className={cs.num}>{catLabel("Gasoline", lang)}</th>
                    <th className={cs.num}>{catLabel("Toll", lang)}</th>
                    <th className={cs.num}>{catLabel("Parking", lang)}</th>
                    <th className={cs.num}>{en ? "Other" : "Lainnya"}</th>
                    <th style={{ minWidth: 110 }}>{en ? "Mix" : "Komposisi"}</th>
                    <th className={cs.num}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRecap.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.weekLabel}</td>
                      <td className={cs.strong}>{r.driver}</td>
                      <td className={cs.num}>Rp {fmtRp(r.gasoline)}</td>
                      <td className={cs.num}>Rp {fmtRp(r.toll)}</td>
                      <td className={cs.num}>Rp {fmtRp(r.parking)}</td>
                      <td className={cs.num}>Rp {fmtRp(r.other)}</td>
                      <td><RecapBar g={r.gasoline} t={r.toll} p={r.parking} o={r.other} /></td>
                      <td className={`${cs.num} ${cs.strong}`}>Rp {fmtRp(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Grand total</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.gasoline)}</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.toll)}</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.parking)}</td>
                    <td className={cs.num}>Rp {fmtRp(weeklyRecap.grandTotal.other)}</td>
                    <td><RecapBar g={weeklyRecap.grandTotal.gasoline} t={weeklyRecap.grandTotal.toll} p={weeklyRecap.grandTotal.parking} o={weeklyRecap.grandTotal.other} /></td>
                    <td className={cs.num} style={{ color: "var(--brand)" }}>Rp {fmtRp(weeklyRecap.grandTotal.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {viewMode === "wreath" && (
        <>
          <div className={cs.top}>
            <div className={cs.filters}>
              <PeriodSwitch
                value={wreathStatusFilter === "all" ? "all" : wreathStatusFilter === "submitted" ? "week" : "date"}
                onChange={(v) => setWreathStatusFilter(v === "all" ? "all" : v === "week" ? "submitted" : "pending")}
                labels={[en ? "All" : "Semua", en ? "Submitted" : "Sudah diajukan", en ? "Not yet" : "Belum diajukan"]}
              />
            </div>
            <div className={cs.actions}>
              <button className={`${cs.btn} ${cs.btnGreen}`} onClick={handleExportWreaths} disabled={filteredWreaths.length === 0} title={en ? "Export condolence wreath report (CSV)" : "Export laporan karangan bunga (CSV)"}>
                ⬇ {en ? "Export report" : "Export laporan"}
              </button>
              <button className={cs.primary} onClick={openAddWreath}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {en ? "Add wreath" : "Tambah karangan bunga"}
              </button>
            </div>
          </div>
          {loadingWreaths ? (
            <div className={cs.skel}><i /><i /><i /></div>
          ) : filteredWreaths.length === 0 ? (
            <div className={cs.empty}>
              <span className={cs.emptyIc} aria-hidden="true">💐</span>
              <b>{en ? "No wreath records yet" : "Belum ada data karangan bunga"}</b>
              <p>{en ? "Record each condolence wreath so Finance can claim it later." : "Catat tiap karangan bunga duka cita supaya bisa diajukan ke Finance."}</p>
              <button className={cs.primary} onClick={openAddWreath}>{en ? "Add wreath" : "Tambah karangan bunga"}</button>
            </div>
          ) : (
            <div className={cs.list}>
              {filteredWreaths.map((w) => (
                <WreathCard
                  key={w.id}
                  atasNama={w.atasNama}
                  keterangan={w.keterangan}
                  tanggal={w.tanggal}
                  plant={w.plant}
                  claimed={w.claimed}
                  onToggle={() => handleToggleWreathClaimed(w)}
                  onDelete={() => setConfirmDeleteWreath(w)}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <ModalPortal onOverlayClick={() => { setShowForm(false); setEditingClaim(null); }} maxWidth={940}>
          <ClaimForm
            lang={lang}
            drivers={driverOptions}
            driverId={formDriverId} setDriverId={setFormDriverId}
            submissionDate={submissionDate} setSubmissionDate={setSubmissionDate}
            periodDate={periodDate} setPeriodDate={setPeriodDate}
            weekLabel={formWeek}
            lines={lines}
            addLine={addLine} removeLine={removeLine} updateLine={updateLine}
            note={note} setNote={setNote}
            grandTotal={grandTotal} canSave={canSave} saving={saving}
            onSave={handleSave} onClose={() => { setShowForm(false); setEditingClaim(null); setReviewing(null); }}
            evalExpr={evalExpr}
            cancelText={t.actionCancel} savingText={t.actionSaving}
            editing={!!editingClaim}
            review={reviewing ? { driverName: reviewing.driverName, nota: reviewing.nota, submittedAt: reviewing.createdAt, driverNote: reviewing.note } : undefined}
          />
        </ModalPortal>
      )}

      {rejecting && (
        <ModalPortal onOverlayClick={() => { if (!rejectBusy) setRejecting(null); }} maxWidth={420}>
          <div className={`${cs.dialog} ${cs.dialogWarn}`}>
            <div className={cs.warnIc} aria-hidden="true">!</div>
            <h2>{en ? "Reject this request?" : "Tolak pengajuan ini?"}</h2>
            <p><b>Rp {fmtRp(rejecting.total)}</b> ({rejecting.driverName}). {en ? "The driver will see the reason in the app." : "Driver akan melihat alasannya di aplikasi."}</p>
            <textarea className={cs.select} style={{ width: "100%", minHeight: 84, height: "auto", padding: 10 }} autoFocus maxLength={500}
              placeholder={en ? "Reason, e.g. receipt doesn't match / duplicate" : "Alasan, mis. nominal tidak sesuai nota / dobel"}
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setRejecting(null)} disabled={rejectBusy}>{t.actionCancel}</button>
              <button className={cs.danger} onClick={handleReject} disabled={rejectBusy || !rejectReason.trim()}>{rejectBusy ? t.actionSaving : (en ? "Reject" : "Tolak")}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={380}>
          <div className={`${cs.dialog} ${cs.dialogWarn}`}>
            <div className={cs.warnIc} aria-hidden="true">!</div>
            <h2>{en ? "Delete this claim?" : "Hapus klaim ini?"}</h2>
            <p><b>Rp {fmtRp(confirmDelete.total)}</b> ({confirmDelete.driverName}) {en ? "will be permanently deleted." : "akan dihapus permanen."}</p>
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setConfirmDelete(null)}>{t.actionCancel}</button>
              <button className={cs.danger} onClick={handleDelete}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {showWreathForm && (
        <ModalPortal onOverlayClick={() => setShowWreathForm(false)} maxWidth={460}>
          <div className={cs.dialog}>
            <h2>💐 {en ? "Add condolence wreath" : "Tambah karangan bunga duka cita"}</h2>
            <label className={cs.field}>
              <span>{en ? "Date" : "Tanggal"}</span>
              <input type="date" className={cs.search} value={wreathTanggal} onChange={(e) => setWreathTanggal(e.target.value)} />
            </label>
            <label className={cs.field}>
              <span>{en ? "On behalf of" : "Atas nama"}</span>
              <input className={cs.search} value={wreathAtasNama} onChange={(e) => setWreathAtasNama(e.target.value)} placeholder={en ? "e.g. Bapak Ahmad (father of driver Budi)" : "mis. Bapak Ahmad (ayah dari driver Budi)"} autoFocus />
            </label>
            <label className={cs.field}>
              <span>{en ? "Note" : "Keterangan"} <em style={{ fontStyle: "normal", fontWeight: 600, color: "var(--t3)" }}>{en ? "optional" : "opsional"}</em></span>
              <input className={cs.search} value={wreathKeterangan} onChange={(e) => setWreathKeterangan(e.target.value)} />
            </label>
            <div className={cs.field}>
              <span>{t.fieldPlant}</span>
              <div className={cs.plants} role="radiogroup">
                {OT_PLANTS.map((p) => (
                  <button key={p} role="radio" aria-checked={wreathPlant === p} className={`${cs.plantBtn} ${wreathPlant === p ? cs.plantBtnOn : ""}`} style={{ ["--c" as string]: PLANT_COLOR[p] }} onClick={() => setWreathPlant(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setShowWreathForm(false)}>{t.actionCancel}</button>
              <button className={cs.primary} style={{ height: 44 }} onClick={handleSaveWreath} disabled={!canSaveWreath || savingWreath}>
                {savingWreath ? t.actionSaving : (en ? "Save record" : "Simpan data")}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDeleteWreath && (
        <ModalPortal onOverlayClick={() => setConfirmDeleteWreath(null)} maxWidth={380}>
          <div className={`${cs.dialog} ${cs.dialogWarn}`}>
            <div className={cs.warnIc} aria-hidden="true">!</div>
            <h2>{en ? "Delete this record?" : "Hapus data ini?"}</h2>
            <p><b>{confirmDeleteWreath.atasNama}</b> ({formatDateLabel(confirmDeleteWreath.tanggal)}) {en ? "will be permanently deleted." : "akan dihapus permanen."}</p>
            <div className={cs.dialogFoot}>
              <button className={cs.btn} style={{ height: 44 }} onClick={() => setConfirmDeleteWreath(null)}>{t.actionCancel}</button>
              <button className={cs.danger} onClick={handleDeleteWreath}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
const OT_PLANTS: Plant[] = ["CIK", "PRB"];
