"use client";

/* Tampilan data Security Desk di modul Security: gate transporter, personel & KPI.
   Semua hanya-baca — datanya diisi tim security di Security Desk. */

import { SD_KPI_OBJ, SECDESK_URL, type SdReport } from "@/lib/security/secdesk";
import s from "./security.module.css";

import { L, loc } from "@/lib/i18n";
const mname = (m: number, style: "long" | "short") => new Date(2000, m - 1, 1).toLocaleDateString(loc(), { month: style });
const f = (n: number) => Number(n || 0).toLocaleString(loc());
const f1 = (n: number) => Number(n || 0).toLocaleString(loc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number) => Number(n || 0).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (a: number, b: number) => (b ? `${f1((a / b) * 100)}%` : "–");
const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${mname(m, "long")} ${y}`; };
const monthShort = (key: string) => { const [y, m] = key.split("-").map(Number); return `${mname(m, "short")} ${String(y).slice(2)}`; };

export function GatePanel({ g }: { g: SdReport["gate"] }) {
  const mx = Math.max(1, ...g.top_companies.map((c) => c.n));
  const dur = g.avg_minutes === null ? "–" : g.avg_minutes >= 60 ? `${Math.floor(g.avg_minutes / 60)} ${L("j", "h")} ${g.avg_minutes % 60} m` : `${g.avg_minutes} m`;
  return (
    <section className={`${s.panel} ${s.sdGate}`}>
      <div className={s.panelHead}><div><h2>{L("Gate transporter — Security Desk", "Transporter gate — Security Desk")}</h2><p>{L("Pemeriksaan Gate In/Out bulan ini, plus kondisi area saat ini.", "This month's Gate In/Out checks, plus the current area condition.")}</p></div></div>
      <div className={s.kpis}>
        <div className={s.kpi}><small>{L("Gate in bulan ini", "Gate in this month")}</small><strong>{f(g.total_in)}</strong><span className={s.mute}>{f(g.total_out)} {L("sudah keluar", "already out")}</span></div>
        <div className={s.kpi}><small>{L("Dengan temuan", "With findings")}</small><strong>{f(g.with_findings)}</strong><span className={s.mute}>{pctTxt(g.with_findings, g.total_in)} {L("dari gate in", "of gate-ins")}</span></div>
        <div className={s.kpi}><small>{L("Rata-rata di dalam", "Average time inside")}</small><strong>{dur}</strong><span className={s.mute}>{L("dari masuk sampai keluar", "from entry to exit")}</span></div>
        <div className={s.kpi}><small>{L("Di dalam area sekarang", "Inside the area now")}</small><strong>{f(g.inside_now)}</strong><span className={g.over_4h ? s.down : s.mute}>{f(g.over_4h)} {L("lebih dari 4 jam", "over 4 hours")}</span></div>
      </div>
      {g.top_companies.length > 0 && (
        <div className={s.sdBars}>
          <small className={s.mute}>{L("Transporter teratas bulan ini", "Top transporters this month")}</small>
          {g.top_companies.map((c) => (
            <div key={c.name} className={s.sdBar}><span>{c.name}</span><i><em style={{ width: `${(c.n / mx) * 100}%` }} /></i><b>{f(c.n)}</b></div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PersonelView({ r, monthKey }: { r: SdReport | null; monthKey: string }) {
  if (!r) {
    return (
      <section className={s.panel}>
        <p className={s.empty}>{L("Data personel & KPI diambil dari Security Desk, tetapi belum tersambung atau belum ada data", "Personnel & KPI data comes from Security Desk, but it is not connected or has no data for")} {monthLabel(monthKey)}. <a href={SECDESK_URL} target="_blank" rel="noreferrer">{L("Buka Security Desk ↗", "Open Security Desk ↗")}</a></p>
      </section>
    );
  }
  const m = Number(monthKey.slice(5, 7));
  const rows = SD_KPI_OBJ.map(([name, w], i) => {
    const v = r.kpi.filter((k) => k.o === i + 1).map((k) => k.s);
    const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const cur = r.kpi.find((k) => k.o === i + 1 && k.m === m)?.s ?? null;
    return { name, w, cur, avg, fin: (avg * w) / 100 };
  });
  const ytd = rows.reduce((a, x) => a + x.fin, 0);
  const curFinal = rows.every((x) => x.cur === null) ? null : rows.reduce((a, x) => a + ((x.cur ?? 0) * x.w) / 100, 0);
  const tone: Record<string, string> = { Open: s.badgeBad, Proses: s.badgeWarn, Selesai: s.badgeOk };
  const open = r.improvements.filter((n) => n.status !== "Selesai");
  const noBackup = r.leaves.filter((l) => !l.backup.trim()).length;
  return (
    <section className={s.stack}>
      <div className={s.kpis}>
        <div className={s.kpi}><small>KPI {monthLabel(monthKey)}</small><strong>{curFinal === null ? "–" : f2(curFinal)}</strong><span className={s.mute}>{L("skala 1–5, sudah dibobot", "scale 1–5, weighted")}</span></div>
        <div className={s.kpi}><small>KPI YTD {monthKey.slice(0, 4)}</small><strong>{f2(ytd)}</strong><span className={s.mute}>{L("rata-rata bulan yang dinilai", "average of the months scored")}</span></div>
        <div className={s.kpi}><small>{L("Cuti / sakit", "Leave / sick")}</small><strong>{f(r.leaves.length)}</strong><span className={noBackup ? s.down : s.mute}>{f(noBackup)} {L("tanpa backup", "without backup")}</span></div>
        <div className={s.kpi}><small>Need improvement</small><strong>{f(open.length)}</strong><span className={s.mute}>{L("belum selesai, dari", "not finished, out of")} {f(r.improvements.length)}</span></div>
      </div>

      <div className={s.grid2}>
        <div className={s.panel}>
          <div className={s.panelHead}><div><h2>{L("Cuti, sakit & backup", "Leave, sick & backup")}</h2><p>{L("Personel security", "Security personnel")} {monthLabel(monthKey)}.</p></div></div>
          {r.leaves.length === 0 ? <p className={s.empty}>{L("Tidak ada cuti atau sakit bulan ini.", "No leave or sick days this month.")}</p> : (
            <div className={s.tableBox}><table className={s.table}>
              <thead><tr><th>{L("Nama", "Name")}</th><th>{L("Tanggal", "Date")}</th><th>{L("Keterangan", "Notes")}</th><th>Backup</th></tr></thead>
              <tbody>{r.leaves.map((l, i) => <tr key={i}><td>{l.name || "-"}</td><td>{l.date_text}</td><td>{l.type}</td><td>{l.backup || <span className={s.badgeBad}>{L("Tanpa backup", "No backup")}</span>}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
        <div className={s.panel}>
          <div className={s.panelHead}><div><h2>Key Performance Indicator</h2><p>{L("Skor bulan ini dan rata-rata tahun berjalan.", "This month's score and the year-to-date average.")}</p></div></div>
          <div className={s.tableBox}><table className={s.table}>
            <thead><tr><th>{L("Objektif", "Objective")}</th><th>{L("Bobot", "Weight")}</th><th>{mname(m, "short")}</th><th>{L("Rata-rata", "Average")}</th><th>Final</th></tr></thead>
            <tbody>
              {rows.map((x) => <tr key={x.name}><td>{x.name}</td><td className={s.tdNum}>{x.w}%</td><td className={s.tdNum}>{x.cur ?? "–"}</td><td className={s.tdNum}>{f2(x.avg)}</td><td className={s.tdNum}>{f2(x.fin)}</td></tr>)}
              <tr className={s.totalRow}><th scope="row" colSpan={4}>Final score YTD</th><td className={s.tdNum}>{f2(ytd)}</td></tr>
            </tbody>
          </table></div>
        </div>
      </div>

      <div className={s.panel}>
        <div className={s.panelHead}><div><h2>Need improvement</h2><p>{L("Temuan jangka panjang dan progresnya.", "Long-term findings and their progress.")}</p></div></div>
        {r.improvements.length === 0 ? <p className={s.empty}>{L("Belum ada need improvement.", "No need-improvement items yet.")}</p> : (
          <div className={s.tableBox}><table className={s.table}>
            <thead><tr><th>{L("Dibuka", "Opened")}</th><th>{L("Deskripsi", "Description")}</th><th>{L("Tingkat", "Level")}</th><th>{L("Progres", "Progress")}</th><th>Status</th></tr></thead>
            <tbody>{r.improvements.map((n, i) => <tr key={i}><td>{monthShort(n.opened_month)}</td><td>{n.description}</td><td>{n.priority}</td><td>{n.progress || "-"}</td><td><span className={tone[n.status] || s.badgeMute}>{n.status}</span></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}
