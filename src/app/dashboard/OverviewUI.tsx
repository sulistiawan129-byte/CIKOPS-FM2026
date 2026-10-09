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
const rp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
function rpShort(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return rp(n);
}
const num = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const fmtDay = (s: string) => {
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
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
        { key: "t", label: "Tugas", cls: o.cBrand, total: `${num(sum(sT))} tugas`, note: `Rata-rata ${(sum(sT) / 30).toFixed(1).replace(".", ",")} per hari`, ...paths(sT) },
        { key: "c", label: "Klaim", cls: o.cGreen, total: rpShort(sum(sC)), note: `Puncak ${rp(Math.max(0, ...sC))}`, ...paths(sC) },
      ],
      days, docs, docsUrgent, late, funds, lowFunds, feed,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, plant, period, now]);

  const trend = v.claimPrev > 0 ? ((v.claimNow - v.claimPrev) / v.claimPrev) * 100 : null;
  const periodWord = period === "today" ? "hari ini" : period === "week" ? "minggu ini" : "bulan ini";

  const alerts: { tone: "bad" | "warn"; title: string; sub: string; go: OverviewGo }[] = [];
  if (v.docsUrgent.length) alerts.push({ tone: "bad", title: `${v.docsUrgent.length} dokumen kendaraan jatuh tempo`, sub: v.docsUrgent.slice(0, 2).map((d) => `${d.doc} ${d.nopol}`).join(" dan ") + (v.docsUrgent.some((d) => d.days < 0) ? " · sudah lewat atau ≤ 7 hari" : " dalam 7 hari"), go: "vehicles" });
  if (v.late.length) alerts.push({ tone: "warn", title: `${v.late.length} tugas berjalan lebih dari 2 jam`, sub: v.late.slice(0, 1).map((t) => `${t.driver_nama ?? "-"} ke ${t.tujuan}`).join(""), go: "tasks" });
  v.lowFunds.forEach((f) => alerts.push({ tone: "bad", title: `Dana operasional ${f.plant} tersisa ${Math.round(pct(f.cash, f.budget))}%`, sub: `${rp(f.cash)} dari ${rp(f.budget)} periode ini`, go: "opfund" }));

  const dateLabel = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  const cant = data.canteen;

  const kpis = [
    { label: `Tugas ${periodWord}`, value: num(v.tasksP.length), unit: "tugas", foot: `${v.going} berjalan · ${v.done} selesai`, bar: pct(v.done, v.tasksP.length), go: "tasks" as OverviewGo },
    { label: "Kendaraan aktif", value: num(v.vActive), unit: `/ ${v.vehicles.length} unit`, foot: v.vehicles.length - v.vActive > 0 ? `${v.vehicles.length - v.vActive} tidak aktif / perawatan` : "Semua unit aktif", bar: pct(v.vActive, v.vehicles.length), go: "vehicles" as OverviewGo },
    { label: "Driver tersedia", value: num(v.free), unit: `/ ${v.drivers.length} driver`, foot: `${v.drivers.length - v.free} sedang bertugas`, bar: pct(v.free, v.drivers.length), go: "tasks" as OverviewGo },
    { label: `Klaim ${periodWord}`, value: rpShort(v.claimNow), unit: "", foot: trend === null ? `Belum ada data ${v.r.label}` : `${trend >= 0 ? "Naik" : "Turun"} ${Math.abs(Math.round(trend))}% dari ${v.r.label}`, bar: pct(v.claimNow, Math.max(v.claimNow, v.claimPrev)), go: "claims" as OverviewGo },
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
          <h1>Ringkasan operasional</h1>
          <p>{userName ? `Halo ${userName.split(" ")[0]}, ini` : "Ini"} kondisi armada, keuangan, dan fasilitas {plant === "all" ? "semua plant" : plant === "CIK" ? "Plant Cikarang" : "Plant Pasar Rebo"}.</p>
        </div>
        <div className={o.filters}>
          {!lockedPlant && (
            <div className={o.seg} role="group" aria-label="Plant">
              {([["all", "Semua plant"], ["CIK", "CIK"], ["PRB", "PRB"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={plantSel === k} className={plantSel === k ? o.segOn : ""} onClick={() => setPlant(k)}>{l}</button>
              ))}
            </div>
          )}
          <div className={o.seg} role="group" aria-label="Periode">
            {([["today", "Hari ini"], ["week", "Minggu ini"], ["month", "Bulan ini"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={period === k} className={period === k ? o.segOn : ""} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      <section aria-label="Perlu tindakan" className={o.alerts}>
        {alerts.length === 0 ? (
          <div className={`${o.alert} ${o.alertOk}`}>
            <span className={o.alertIc}><IcOk /></span>
            <span className={o.alertText}><b>Tidak ada yang perlu ditindak</b><span>Dokumen, tugas, dan dana operasional dalam batas aman.</span></span>
          </div>
        ) : alerts.map((a, i) => (
          <button key={i} type="button" className={`${o.alert} ${a.tone === "bad" ? o.alertBad : o.alertWarn}`} onClick={() => onGo(a.go)}>
            <span className={o.alertIc}><IcWarn /></span>
            <span className={o.alertText}><b>{a.title}</b><span>{a.sub}</span></span>
            <span className={o.alertGo}>Lihat</span>
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
            <h2>Armada</h2>
            <button type="button" className={o.link} onClick={() => onGo("vehicles")}>Buka Armada</button>
          </div>
          <div className={o.stack} aria-label={`${v.vActive} aktif, ${fleetMaint} tidak aktif`}>
            <span className={o.stackA} style={{ width: `${pct(v.vActive, v.vehicles.length)}%` }} />
            <span className={o.stackB} style={{ width: `${pct(fleetMaint, v.vehicles.length)}%` }} />
          </div>
          <div className={o.legend}>
            <span><i className={o.cBrand} />Aktif <b>{v.vActive}</b></span>
            <span><i className={o.cOrange} />Tidak aktif / perawatan <b>{fleetMaint}</b></span>
          </div>
          <h3 className={o.sub}>Dokumen jatuh tempo</h3>
          <div className={o.docs}>
            {v.docs.length === 0 && <div className={o.empty}>Belum ada data tanggal KIR, STNK, atau service.</div>}
            {v.docs.slice(0, 5).map((d) => (
              <div key={d.id} className={o.docRow}>
                <span><b>{d.nopol}</b><small>{d.doc} · {fmtDay(d.date)}</small></span>
                <span className={`${o.pill} ${d.days <= 7 ? o.pBad : d.days <= 30 ? o.pWarn : o.pMute}`}>{d.days < 0 ? `Lewat ${-d.days} hari` : d.days === 0 ? "Hari ini" : `${d.days} hari`}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={o.trio}>
        <section className={o.card}>
          <div className={o.cardHead}>
            <h2>Dana operasional</h2>
            <span>Per plant, tidak dijumlah</span>
          </div>
          {v.funds.length === 0 && <div className={o.empty}>Belum ada periode dana operasional.</div>}
          {v.funds.map((f) => {
            const p = pct(f.cash, f.budget);
            const low = f.budget > 0 && f.cash / f.budget < 0.2;
            return (
              <button key={f.plant} type="button" className={o.fund} onClick={() => onGo("opfund")}>
                <span className={o.fundTop}><b>{f.plant === "CIK" ? "Plant Cikarang" : "Plant Pasar Rebo"}</b><span className={low ? o.inkBad : ""}>{Math.round(p)}% tersisa</span></span>
                <span className={o.bar}><i className={low ? o.barBad : ""} style={{ width: `${p}%` }} /></span>
                <span className={o.fundFoot}><span>Tersedia <b>{rp(f.cash)}</b></span><span>dari {rp(f.budget)}</span></span>
              </button>
            );
          })}
        </section>

        <section className={o.card}>
          <div className={o.cardHead}>
            <h2>Budget driver</h2>
            <button type="button" className={o.link} onClick={() => onGo("driverbudget")}>Buka</button>
          </div>
          <div className={o.big}><b>{rpShort(budget.total)}</b><span>per bulan · {num(budget.drivers)} driver</span></div>
          {data.tiers.length === 0 && <div className={o.empty}>Belum ada tier budget driver.</div>}
          {data.tiers.map((t) => (
            <div key={t.id} className={o.otRow}>
              <b title={t.name}>{t.name}</b>
              <span className={o.bar}><i style={{ width: `${pct(t.amountPerMonth * t.activeDriverCount, budget.max)}%` }} /></span>
              <span>{num(t.activeDriverCount)} driver</span>
            </div>
          ))}
          <div className={o.kv}>
            <span>Klaim {periodWord}</span><b>{rp(v.claimNow)}</b>
          </div>
        </section>

        <section className={o.card}>
          <div className={o.cardHead}><h2>Fasilitas</h2><span>Bulan ini</span></div>
          <button type="button" className={o.fac} onClick={() => onGo("canteen")}>
            <span className={o.fundTop}><b>Kantin · snack</b><span>{num(cant.snackUsed)} / {num(cant.snackOrder)} terpakai</span></span>
            <span className={o.bar}><i className={o.barGreen} style={{ width: `${pct(cant.snackUsed, cant.snackOrder)}%` }} /></span>
          </button>
          <button type="button" className={o.fac} onClick={() => onGo("canteen")}>
            <span className={o.fundTop}><b>Kantin · makan</b><span>{num(cant.mealUsed)} / {num(cant.mealOrder)} terpakai</span></span>
            <span className={o.bar}><i className={o.barGreen} style={{ width: `${pct(cant.mealUsed, cant.mealOrder)}%` }} /></span>
          </button>
          <div className={o.tiles}>
            <button type="button" className={o.tile} onClick={() => onGo("locker")}>
              <span>Locker terisi</span>
              <b>{num(data.locker.used)} <small>/ {num(data.locker.total)}</small></b>
              <em>{num(data.locker.total - data.locker.used)} tersedia</em>
            </button>
            <button type="button" className={o.tile} onClick={() => onGo("gasstations")}>
              <span>Pom bensin</span>
              <b>{num(data.gas.stations)} <small>lokasi</small></b>
              <em>{data.gas.fuelTypes} jenis BBM tersedia</em>
            </button>
          </div>
        </section>
      </div>

      <section className={o.card}>
        <div className={o.cardHead}>
          <h2>Klaim terbaru</h2>
          <button type="button" className={o.link} onClick={() => onGo("claims")}>Lihat klaim</button>
        </div>
        {v.feed.length === 0 ? (
          <div className={o.empty}>Belum ada klaim.</div>
        ) : (
          <div className={o.tableBox}>
            <table className={o.table}>
              <thead>
                <tr><th>Driver</th><th>Plant</th><th>Jenis klaim</th><th>Tanggal</th><th className={o.right}>Nominal</th></tr>
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
