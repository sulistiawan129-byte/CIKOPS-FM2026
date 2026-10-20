"use client";

/* Tampilan data Security Desk di modul Security: gate transporter, personel & KPI.
   Semua hanya-baca — datanya diisi tim security di Security Desk. */

import { SD_KPI_OBJ, SECDESK_URL, type SdReport } from "@/lib/security/secdesk";
import s from "./security.module.css";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const f = (n: number) => Number(n || 0).toLocaleString("id-ID");
const f1 = (n: number) => Number(n || 0).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number) => Number(n || 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (a: number, b: number) => (b ? `${f1((a / b) * 100)}%` : "–");
const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const monthShort = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MON[m - 1]} ${String(y).slice(2)}`; };

export function GatePanel({ g }: { g: SdReport["gate"] }) {
  const mx = Math.max(1, ...g.top_companies.map((c) => c.n));
  const dur = g.avg_minutes === null ? "–" : g.avg_minutes >= 60 ? `${Math.floor(g.avg_minutes / 60)} j ${g.avg_minutes % 60} m` : `${g.avg_minutes} m`;
  return (
    <section className={`${s.panel} ${s.sdGate}`}>
      <div className={s.panelHead}><div><h2>Gate transporter — Security Desk</h2><p>Pemeriksaan Gate In/Out bulan ini, plus kondisi area saat ini.</p></div></div>
      <div className={s.kpis}>
        <div className={s.kpi}><small>Gate in bulan ini</small><strong>{f(g.total_in)}</strong><span className={s.mute}>{f(g.total_out)} sudah keluar</span></div>
        <div className={s.kpi}><small>Dengan temuan</small><strong>{f(g.with_findings)}</strong><span className={s.mute}>{pctTxt(g.with_findings, g.total_in)} dari gate in</span></div>
        <div className={s.kpi}><small>Rata-rata di dalam</small><strong>{dur}</strong><span className={s.mute}>dari masuk sampai keluar</span></div>
        <div className={s.kpi}><small>Di dalam area sekarang</small><strong>{f(g.inside_now)}</strong><span className={g.over_4h ? s.down : s.mute}>{f(g.over_4h)} lebih dari 4 jam</span></div>
      </div>
      {g.top_companies.length > 0 && (
        <div className={s.sdBars}>
          <small className={s.mute}>Transporter teratas bulan ini</small>
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
        <p className={s.empty}>Data personel & KPI diambil dari Security Desk, tetapi belum tersambung atau belum ada data {monthLabel(monthKey)}. <a href={SECDESK_URL} target="_blank" rel="noreferrer">Buka Security Desk ↗</a></p>
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
        <div className={s.kpi}><small>KPI {monthLabel(monthKey)}</small><strong>{curFinal === null ? "–" : f2(curFinal)}</strong><span className={s.mute}>skala 1–5, sudah dibobot</span></div>
        <div className={s.kpi}><small>KPI YTD {monthKey.slice(0, 4)}</small><strong>{f2(ytd)}</strong><span className={s.mute}>rata-rata bulan yang dinilai</span></div>
        <div className={s.kpi}><small>Cuti / sakit</small><strong>{f(r.leaves.length)}</strong><span className={noBackup ? s.down : s.mute}>{f(noBackup)} tanpa backup</span></div>
        <div className={s.kpi}><small>Need improvement</small><strong>{f(open.length)}</strong><span className={s.mute}>belum selesai, dari {f(r.improvements.length)}</span></div>
      </div>

      <div className={s.grid2}>
        <div className={s.panel}>
          <div className={s.panelHead}><div><h2>Cuti, sakit & backup</h2><p>Personel security {monthLabel(monthKey)}.</p></div></div>
          {r.leaves.length === 0 ? <p className={s.empty}>Tidak ada cuti atau sakit bulan ini.</p> : (
            <div className={s.tableBox}><table className={s.table}>
              <thead><tr><th>Nama</th><th>Tanggal</th><th>Keterangan</th><th>Backup</th></tr></thead>
              <tbody>{r.leaves.map((l, i) => <tr key={i}><td>{l.name || "-"}</td><td>{l.date_text}</td><td>{l.type}</td><td>{l.backup || <span className={s.badgeBad}>Tanpa backup</span>}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
        <div className={s.panel}>
          <div className={s.panelHead}><div><h2>Key Performance Indicator</h2><p>Skor bulan ini dan rata-rata tahun berjalan.</p></div></div>
          <div className={s.tableBox}><table className={s.table}>
            <thead><tr><th>Objektif</th><th>Bobot</th><th>{MON[m - 1]}</th><th>Rata-rata</th><th>Final</th></tr></thead>
            <tbody>
              {rows.map((x) => <tr key={x.name}><td>{x.name}</td><td className={s.tdNum}>{x.w}%</td><td className={s.tdNum}>{x.cur ?? "–"}</td><td className={s.tdNum}>{f2(x.avg)}</td><td className={s.tdNum}>{f2(x.fin)}</td></tr>)}
              <tr className={s.totalRow}><th scope="row" colSpan={4}>Final score YTD</th><td className={s.tdNum}>{f2(ytd)}</td></tr>
            </tbody>
          </table></div>
        </div>
      </div>

      <div className={s.panel}>
        <div className={s.panelHead}><div><h2>Need improvement</h2><p>Temuan jangka panjang dan progresnya.</p></div></div>
        {r.improvements.length === 0 ? <p className={s.empty}>Belum ada need improvement.</p> : (
          <div className={s.tableBox}><table className={s.table}>
            <thead><tr><th>Dibuka</th><th>Deskripsi</th><th>Tingkat</th><th>Progres</th><th>Status</th></tr></thead>
            <tbody>{r.improvements.map((n, i) => <tr key={i}><td>{monthShort(n.opened_month)}</td><td>{n.description}</td><td>{n.priority}</td><td>{n.progress || "-"}</td><td><span className={tone[n.status] || s.badgeMute}>{n.status}</span></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}
