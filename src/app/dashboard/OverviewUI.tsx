"use client";

/**
 * Ringkasan (Overview) — tampilan baru.
 * Murni presentasi + perhitungan ringan; data dimuat OverviewTab (page.tsx).
 * Filter plant (Semua/CIK/PRB) dan periode (Hari ini/Minggu ini/Bulan ini)
 * mengubah angka, grafik 30 hari, dan daftar secara langsung.
 */

import { useMemo, useState } from "react";
import type { Claim, Driver, DriverTier, Plant, TaskDetail, Vehicle } from "@/lib/types";
import o from "./overview.module.css";
import { plantFull } from "@/lib/brand";

import { loc , L} from "@/lib/i18n";
export type OverviewGo = "tasks" | "vehicles" | "claims" | "opfund" | "driverbudget" | "canteen" | "locker" | "gasstations";

export interface OverviewData {
  tasks: TaskDetail[]; // 30 hari terakhir
  claims: Claim[];
  vehicles: Vehicle[];
  drivers: Driver[];
  funds: { plant: Plant; cash: number; budget: number }[];
  docs: { id: string; nopol: string; plant: Plant; doc: string; date: string; days: number }[];
  tiers: DriverTier[];
  canteen: { snackOrder: number; snackUsed: number; mealOrder: number; mealUsed: number };
  locker: { total: number; used: number };
  gas: { stations: number; fuelTypes: number };
}

type PlantF = "all" | Plant;
type Period = "today" | "week" | "month";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rp = (n: number) => "Rp " + new Intl.NumberFormat(loc()).format(Math.round(n || 0));
function rpShort(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return rp(n);
}
const num = (n: number) => new Intl.NumberFormat(loc()).format(Math.round(n || 0));
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const fmtDay = (s: string) => {
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short" });
};

function ranges(period: Period, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: iso(today), to: iso(today), pFrom: iso(y), pTo: iso(y), label: "kemarin" };
  }
  if (period === "week") {
    const dow = (today.getDay() + 6) % 7;
    const mon = new Date(today); mon.setDate(today.getDate() - dow);
    const pMon = new Date(mon); pMon.setDate(mon.getDate() - 7);
    const pTo = new Date(today); pTo.setDate(today.getDate() - 7);
    return { from: iso(mon), to: iso(today), pFrom: iso(pMon), pTo: iso(pTo), label: "minggu lalu" };
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const pFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const pLast = new Date(today.getFullYear(), today.getMonth(), 0);
  const pTo = new Date(pFirst.getFullYear(), pFirst.getMonth(), Math.min(today.getDate(), pLast.getDate()));
  return { from: iso(first), to: iso(today), pFrom: iso(pFirst), pTo: iso(pTo), label: "bulan lalu" };
}

function paths(vals: number[]) {
  const max = Math.max(1, ...vals);
  const w = 600, h = 72, p = 6;
  const pts = vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * w).toFixed(1)},${(h - p - (v / max) * (h - p * 2)).toFixed(1)}`);
  return { line: pts.join(" "), area: `0,${h} ${pts.join(" ")} ${w},${h}` };
}

const IcWarn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);
const IcOk = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>
);

export function OverviewBoard({
  data, lockedPlant, userName, onGo,
}: {
  data: OverviewData;
  lockedPlant: Plant | null;
  userName: string;
  onGo: (tab: OverviewGo) => void;
}) {
  const [plantSel, setPlant] = useState<PlantF>(lockedPlant ?? "all");
  const [period, setPeriod] = useState<Period>("month");
  const plant: PlantF = lockedPlant ?? plantSel;
  const now = useMemo(() => new Date(), []);
  const inPlant = (p?: Plant | null) => plant === "all" || (p ?? "CIK") === plant;

  const v = useMemo(() => {
    const r = ranges(period, now);
    const today = iso(now);
    const thisMonth = today.slice(0, 7);
    const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthD.getFullYear()}-${pad(lastMonthD.getMonth() + 1)}`;
    const between = (d: string, a: string, b: string) => d >= a && d <= b;

    const tasks = data.tasks.filter((t) => inPlant(t.plant) && t.status !== "CANCELLED");
    const tasksP = tasks.filter((t) => between(t.tanggal, r.from, r.to));
    const going = tasksP.filter((t) => t.status === "ON GOING").length;
    const done = tasksP.filter((t) => t.status === "DONE").length;

    const vehicles = data.vehicles.filter((x) => inPlant(x.plant));
    const vActive = vehicles.filter((x) => x.aktif).length;

    const drivers = data.drivers.filter((d) => d.aktif && inPlant(d.plant));
    const busy = new Set(tasks.filter((t) => t.tanggal === today && t.status === "ON GOING").map((t) => t.driver_id));
    const free = drivers.filter((d) => !busy.has(d.id)).length;

    const claims = data.claims.filter((c) => inPlant(c.plant));
    const cDay = (c: Claim) => (c.periodDate || c.submissionDate || "").slice(0, 10);
    const claimNow = claims.filter((c) => between(cDay(c), r.from, r.to)).reduce((s, c) => s + c.total, 0);
    const claimPrev = claims.filter((c) => between(cDay(c), r.pFrom, r.pTo)).reduce((s, c) => s + c.total, 0);

    // 30 hari
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(iso(d)); }
    const idx = new Map(days.map((d, i) => [d, i]));
    const sT = days.map(() => 0), sC = days.map(() => 0);
    tasks.forEach((t) => { const i = idx.get(t.tanggal); if (i !== undefined) sT[i] += 1; });
    claims.forEach((c) => { const i = idx.get(cDay(c)); if (i !== undefined) sC[i] += c.total; });
    const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

    const docs = data.docs.filter((d) => inPlant(d.plant)).sort((a, b) => a.days - b.days);
    const docsUrgent = docs.filter((d) => d.days <= 7);
    const late = tasks.filter((t) => t.status === "ON GOING" && Date.now() - new Date(t.accepted_at ?? t.created_at).getTime() > 2 * 3600_000);
    const funds = data.funds.filter((f) => inPlant(f.plant));
    const lowFunds = funds.filter((f) => f.budget > 0 && f.cash / f.budget < 0.2);

    const feed = [
      ...claims.map((c) => ({ id: "c" + c.id, driver: c.driverName, plant: c.plant, meta: Array.from(new Set(c.items.map((i) => i.type))).join(", ") || "-", date: cDay(c), amount: c.total })),
    ].filter((a) => a.driver).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

    return {
      r, tasksP, going, done, vehicles, vActive, drivers, free, claimNow, claimPrev,
      series: [
        { key: "t", label: L("Tugas", "Tasks"), cls: o.cBrand, total: `${num(sum(sT))} ${L("tugas", "tasks")}`, note: L(`Rata-rata ${(sum(sT) / 30).toFixed(1).replace(".", ",")} per hari`, `Average ${(sum(sT) / 30).toFixed(1)} per day`), ...paths(sT) },
        { key: "c", label: L("Klaim", "Claims"), cls: o.cGreen, total: rpShort(sum(sC)), note: `${L("Puncak", "Peak")} ${rp(Math.max(0, ...sC))}`, ...paths(sC) },
      ],
      days, docs, docsUrgent, late, funds, lowFunds, feed,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, plant, period, now]);

  const trend = v.claimPrev > 0 ? ((v.claimNow - v.claimPrev) / v.claimPrev) * 100 : null;
  const periodWord = period === "today" ? L("hari ini", "today") : period === "week" ? L("minggu ini", "this week") : L("bulan ini", "this month");

  const alerts: { tone: "bad" | "warn"; title: string; sub: string; go: OverviewGo }[] = [];
  if (v.docsUrgent.length) alerts.push({ tone: "bad", title: L(`${v.docsUrgent.length} dokumen kendaraan jatuh tempo`, `${v.docsUrgent.length} vehicle document${v.docsUrgent.length === 1 ? "" : "s"} due`), sub: v.docsUrgent.slice(0, 2).map((d) => `${d.doc} ${d.nopol}`).join(L(" dan ", " and ")) + (v.docsUrgent.some((d) => d.days < 0) ? L(" · sudah lewat atau ≤ 7 hari", " · overdue or within 7 days") : L(" dalam 7 hari", " within 7 days")), go: "vehicles" });
  if (v.late.length) alerts.push({ tone: "warn", title: L(`${v.late.length} tugas berjalan lebih dari 2 jam`, `${v.late.length} task${v.late.length === 1 ? "" : "s"} running for over 2 hours`), sub: v.late.slice(0, 1).map((t) => `${t.driver_nama ?? "-"} ${L("ke", "to")} ${t.tujuan}`).join(""), go: "tasks" });
  v.lowFunds.forEach((f) => alerts.push({ tone: "bad", title: L(`Dana operasional ${f.plant} tersisa ${Math.round(pct(f.cash, f.budget))}%`, `${f.plant} operational fund at ${Math.round(pct(f.cash, f.budget))}%`), sub: L(`${rp(f.cash)} dari ${rp(f.budget)} periode ini`, `${rp(f.cash)} of ${rp(f.budget)} this period`), go: "opfund" }));

  const dateLabel = now.toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = now.toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  const cant = data.canteen;

  const kpis = [
    { label: L(`Tugas ${periodWord}`, `Tasks ${periodWord}`), value: num(v.tasksP.length), unit: L("tugas", "tasks"), foot: L(`${v.going} berjalan · ${v.done} selesai`, `${v.going} in progress · ${v.done} done`), bar: pct(v.done, v.tasksP.length), go: "tasks" as OverviewGo },
    { label: L("Kendaraan aktif", "Active vehicles"), value: num(v.vActive), unit: L(`/ ${v.vehicles.length} unit`, `/ ${v.vehicles.length} units`), foot: v.vehicles.length - v.vActive > 0 ? L(`${v.vehicles.length - v.vActive} tidak aktif / perawatan`, `${v.vehicles.length - v.vActive} inactive / under maintenance`) : L("Semua unit aktif", "All units active"), bar: pct(v.vActive, v.vehicles.length), go: "vehicles" as OverviewGo },
    { label: L("Driver tersedia", "Available drivers"), value: num(v.free), unit: `/ ${v.drivers.length} ${L("driver", "drivers")}`, foot: L(`${v.drivers.length - v.free} sedang bertugas`, `${v.drivers.length - v.free} on duty`), bar: pct(v.free, v.drivers.length), go: "tasks" as OverviewGo },
    { label: L(`Klaim ${periodWord}`, `Claims ${periodWord}`), value: rpShort(v.claimNow), unit: "", foot: trend === null ? L(`Belum ada data ${v.r.label}`, `No data for ${v.r.label}`) : L(`${trend >= 0 ? "Naik" : "Turun"} ${Math.abs(Math.round(trend))}% dari ${v.r.label}`, `${trend >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(trend))}% from ${v.r.label}`), bar: pct(v.claimNow, Math.max(v.claimNow, v.claimPrev)), go: "claims" as OverviewGo },
  ];

  const fleetMaint = v.vehicles.length - v.vActive;
  const budget = {
    total: data.tiers.reduce((s, t) => s + t.amountPerMonth * t.activeDriverCount, 0),
    drivers: data.tiers.reduce((s, t) => s + t.activeDriverCount, 0),
    max: Math.max(1, ...data.tiers.map((t) => t.amountPerMonth * t.activeDriverCount)),
  };

  return (
    <div className={o.wrap}>
      <header className={o.head}>
        <div className={o.headText}>
          <span className={o.eyebrow}>{dateLabel} · diperbarui {timeLabel}</span>
          <h1>{L("Ringkasan operasional", "Operations summary")}</h1>
          <p>{L(`${userName ? `Halo ${userName.split(" ")[0]}, ini` : "Ini"} kondisi armada, keuangan, dan fasilitas ${plant === "all" ? "semua plant" : plantFull(plant)}.`, `${userName ? `Hello ${userName.split(" ")[0]}, here is` : "Here is"} the status of fleet, finance and facilities for ${plant === "all" ? "all plants" : plantFull(plant)}.`)}</p>
        </div>
        <div className={o.filters}>
          {!lockedPlant && (
            <div className={o.seg} role="group" aria-label="Plant">
              {([["all", L("Semua plant", "All plants")], ["CIK", "CIK"], ["PRB", "PRB"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={plantSel === k} className={plantSel === k ? o.segOn : ""} onClick={() => setPlant(k)}>{l}</button>
              ))}
            </div>
          )}
          <div className={o.seg} role="group" aria-label={L("Periode", "Period")}>
            {([["today", L("Hari ini", "Today")], ["week", L("Minggu ini", "This week")], ["month", L("Bulan ini", "This month")]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={period === k} className={period === k ? o.segOn : ""} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      <section aria-label="Perlu tindakan" className={o.alerts}>
        {alerts.length === 0 ? (
          <div className={`${o.alert} ${o.alertOk}`}>
            <span className={o.alertIc}><IcOk /></span>
            <span className={o.alertText}><b>{L("Tidak ada yang perlu ditindak", "Nothing needs action")}</b><span>{L("Dokumen, tugas, dan dana operasional dalam batas aman.", "Documents, tasks and operational funds are within safe limits.")}</span></span>
          </div>
        ) : alerts.map((a, i) => (
          <button key={i} type="button" className={`${o.alert} ${a.tone === "bad" ? o.alertBad : o.alertWarn}`} onClick={() => onGo(a.go)}>
            <span className={o.alertIc}><IcWarn /></span>
            <span className={o.alertText}><b>{a.title}</b><span>{a.sub}</span></span>
            <span className={o.alertGo}>{L("Lihat", "View")}</span>
          </button>
        ))}
      </section>

      <section aria-label="Indikator utama" className={o.kpis}>
        {kpis.map((k) => (
          <button key={k.label} type="button" className={o.kpi} onClick={() => onGo(k.go)}>
            <span className={o.kpiLabel}>{k.label}</span>
            <span className={o.kpiVal}><b>{k.value}</b>{k.unit ? <span>{k.unit}</span> : null}</span>
            <span className={o.bar}><i style={{ width: `${k.bar}%` }} /></span>
            <span className={o.kpiFoot}>{k.foot}</span>
          </button>
        ))}
      </section>

      <div className={o.split}>
        <section className={`${o.card} ${o.trend}`}>
          <div className={o.cardHead}>
            <h2>Aktivitas 30 hari</h2>
            <span>Tiap baris memakai skalanya sendiri</span>
          </div>
          {v.series.map((s) => (
            <div key={s.key} className={o.sRow}>
              <div className={o.sInfo}>
                <span className={o.sLabel}><i className={s.cls} />{s.label}</span>
                <b>{s.total}</b>
                <span>{s.note}</span>
              </div>
              <svg viewBox="0 0 600 72" preserveAspectRatio="none" className={`${o.spark} ${s.cls}`} role="img" aria-label={`Tren ${s.label.toLowerCase()} 30 hari`}>
                <polyline points={s.area} className={o.sArea} />
                <polyline points={s.line} className={o.sLine} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          ))}
          <div className={o.sAxis}><span /><div><span>{fmtDay(v.days[0])}</span><span>{fmtDay(v.days[14])}</span><span>{fmtDay(v.days[29])}</span></div></div>
        </section>

        <section className={`${o.card} ${o.fleet}`}>
          <div className={o.cardHead}>
            <h2>{L("Armada", "Fleet")}</h2>
            <button type="button" className={o.link} onClick={() => onGo("vehicles")}>{L("Buka Armada", "Open Fleet")}</button>
          </div>
          <div className={o.stack} aria-label={`${v.vActive} aktif, ${fleetMaint} tidak aktif`}>
            <span className={o.stackA} style={{ width: `${pct(v.vActive, v.vehicles.length)}%` }} />
            <span className={o.stackB} style={{ width: `${pct(fleetMaint, v.vehicles.length)}%` }} />
          </div>
          <div className={o.legend}>
            <span><i className={o.cBrand} />{L("Aktif", "Active")} <b>{v.vActive}</b></span>
            <span><i className={o.cOrange} />{L("Tidak aktif / perawatan", "Inactive / maintenance")} <b>{fleetMaint}</b></span>
          </div>
          <h3 className={o.sub}>Dokumen jatuh tempo</h3>
          <div className={o.docs}>
            {v.docs.length === 0 && <div className={o.empty}>{L("Belum ada data tanggal KIR, STNK, atau service.", "No KIR, STNK or service date data yet.")}</div>}
            {v.docs.slice(0, 5).map((d) => (
              <div key={d.id} className={o.docRow}>
                <span><b>{d.nopol}</b><small>{d.doc} · {fmtDay(d.date)}</small></span>
                <span className={`${o.pill} ${d.days <= 7 ? o.pBad : d.days <= 30 ? o.pWarn : o.pMute}`}>{d.days < 0 ? L(`Lewat ${-d.days} hari`, `${-d.days} days overdue`) : d.days === 0 ? L("Hari ini", "Today") : L(`${d.days} hari`, `${d.days} days`)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={o.trio}>
        <section className={o.card}>
          <div className={o.cardHead}>
            <h2>{L("Dana operasional", "Operational fund")}</h2>
            <span>Per plant, tidak dijumlah</span>
          </div>
          {v.funds.length === 0 && <div className={o.empty}>{L("Belum ada periode dana operasional.", "No operational fund period yet.")}</div>}
          {v.funds.map((f) => {
            const p = pct(f.cash, f.budget);
            const low = f.budget > 0 && f.cash / f.budget < 0.2;
            return (
              <button key={f.plant} type="button" className={o.fund} onClick={() => onGo("opfund")}>
                <span className={o.fundTop}><b>{plantFull(f.plant)}</b><span className={low ? o.inkBad : ""}>{Math.round(p)}% tersisa</span></span>
                <span className={o.bar}><i className={low ? o.barBad : ""} style={{ width: `${p}%` }} /></span>
                <span className={o.fundFoot}><span>{L("Tersedia", "Available")} <b>{rp(f.cash)}</b></span><span>{L("dari", "of")} {rp(f.budget)}</span></span>
              </button>
            );
          })}
        </section>

        <section className={o.card}>
          <div className={o.cardHead}>
            <h2>Budget driver</h2>
            <button type="button" className={o.link} onClick={() => onGo("driverbudget")}>{L("Buka", "Open")}</button>
          </div>
          <div className={o.big}><b>{rpShort(budget.total)}</b><span>per bulan · {num(budget.drivers)} driver</span></div>
          {data.tiers.length === 0 && <div className={o.empty}>{L("Belum ada tier budget driver.", "No driver budget tiers yet.")}</div>}
          {data.tiers.map((t) => (
            <div key={t.id} className={o.otRow}>
              <b title={t.name}>{t.name}</b>
              <span className={o.bar}><i style={{ width: `${pct(t.amountPerMonth * t.activeDriverCount, budget.max)}%` }} /></span>
              <span>{num(t.activeDriverCount)} driver</span>
            </div>
          ))}
          <div className={o.kv}>
            <span>{L("Klaim", "Claims")} {periodWord}</span><b>{rp(v.claimNow)}</b>
          </div>
        </section>

        <section className={o.card}>
          <div className={o.cardHead}><h2>{L("Fasilitas", "Facilities")}</h2><span>{L("Bulan ini", "This month")}</span></div>
          <button type="button" className={o.fac} onClick={() => onGo("canteen")}>
            <span className={o.fundTop}><b>{L("Kantin · snack", "Canteen · snacks")}</b><span>{num(cant.snackUsed)} / {num(cant.snackOrder)} {L("terpakai", "used")} · {L("sisa", "left")} {num(Math.max(0, cant.snackOrder - cant.snackUsed))}</span></span>
            <span className={o.bar}><i className={o.barGreen} style={{ width: `${pct(cant.snackUsed, cant.snackOrder)}%` }} /></span>
          </button>
          <button type="button" className={o.fac} onClick={() => onGo("canteen")}>
            <span className={o.fundTop}><b>{L("Kantin · makan", "Canteen · meals")}</b><span>{num(cant.mealUsed)} / {num(cant.mealOrder)} {L("terpakai", "used")} · {L("sisa", "left")} {num(Math.max(0, cant.mealOrder - cant.mealUsed))}</span></span>
            <span className={o.bar}><i className={o.barGreen} style={{ width: `${pct(cant.mealUsed, cant.mealOrder)}%` }} /></span>
          </button>
          <div className={o.tiles}>
            <button type="button" className={o.tile} onClick={() => onGo("locker")}>
              <span>{L("Locker terisi", "Lockers occupied")}</span>
              <b>{num(data.locker.used)} <small>/ {num(data.locker.total)}</small></b>
              <em>{num(data.locker.total - data.locker.used)} {L("tersedia", "available")}</em>
            </button>
            <button type="button" className={o.tile} onClick={() => onGo("gasstations")}>
              <span>{L("Pom bensin", "Gas stations")}</span>
              <b>{num(data.gas.stations)} <small>{L("lokasi", "locations")}</small></b>
              <em>{data.gas.fuelTypes} {L("jenis BBM tersedia", "fuel types available")}</em>
            </button>
          </div>
        </section>
      </div>

      <section className={o.card}>
        <div className={o.cardHead}>
          <h2>{L("Klaim terbaru", "Latest claims")}</h2>
          <button type="button" className={o.link} onClick={() => onGo("claims")}>{L("Lihat klaim", "View claims")}</button>
        </div>
        {v.feed.length === 0 ? (
          <div className={o.empty}>{L("Belum ada klaim.", "No claims yet.")}</div>
        ) : (
          <div className={o.tableBox}>
            <table className={o.table}>
              <thead>
                <tr><th>Driver</th><th>Plant</th><th>{L("Jenis klaim", "Claim type")}</th><th>{L("Tanggal", "Date")}</th><th className={o.right}>{L("Nominal", "Amount")}</th></tr>
              </thead>
              <tbody>
                {v.feed.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.driver}</b></td>
                    <td><span className={`${o.pill} ${r.plant === "PRB" ? o.pWarn : o.pBlue}`}>{r.plant ?? "CIK"}</span></td>
                    <td className={o.muted}>{r.meta}</td>
                    <td className={o.muted}>{fmtDay(r.date)}</td>
                    <td className={o.right}><b>{rp(r.amount)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
