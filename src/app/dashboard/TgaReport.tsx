"use client";

/* Menu TGA → Laporan: aktivitas teknisi GA per bulan (aplikasi /tga + log Excel lama),
   per teknisi, pemohon terbanyak, ekspor Excel/PDF/CSV. Dipindah dari modul Cleaning & Gardening. */

import { useMemo, useState } from "react";
import { inMonth, shiftPeriode, type GaManpower, type GaTga } from "@/lib/ga/model";
import { exportGenericCsv, exportGenericExcel, exportGenericPdf } from "@/lib/reportEngine";
import type { ReportColumn, ReportLang } from "@/lib/reportEngine";
import a from "./atk.module.css";
import g from "./ga.module.css";

type Lang = "id" | "en";
const BLN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BLN_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BLN_S = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const perLabel = (p: number, lang: Lang) => `${(lang === "en" ? BLN_EN : BLN_ID)[(p % 100) - 1]} ${Math.floor(p / 100)}`;
const fmtD = (d: string | null, lang: Lang) => (d ? new Date(d + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const TGA_ST: Record<string, { id: string; en: string; cls: string }> = {
  selesai: { id: "Selesai", en: "Done", cls: "tagExcel" },
  proses: { id: "Proses", en: "In progress", cls: "tagWeb" },
  pending: { id: "Pending", en: "Pending", cls: "tagPending" },
  butuh_part: { id: "Butuh part", en: "Needs part", cls: "tagPending" },
  baru: { id: "Baru (belum diterima)", en: "New (not accepted)", cls: "tagPending" },
  batal: { id: "Dibatalkan", en: "Cancelled", cls: "tagWeb" },
};
const tgaSt = (t: GaTga, lang: Lang) => (t.status ? (lang === "en" ? TGA_ST[t.status]?.en : TGA_ST[t.status]?.id) ?? t.status : "");

export default function TgaReport({ lang, rows, all, periode, manpower }: { lang: Lang; rows: GaTga[]; all: GaTga[]; periode: number; manpower: GaManpower[] }) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [src, setSrc] = useState<"" | "app" | "excel" | "open">("");
  const tech = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((t) => m.set(t.namaTga || "—", (m.get(t.namaTga || "—") ?? 0) + 1));
    manpower.filter((p) => p.tim.toUpperCase() === "TGA").forEach((p) => { if (!m.has(p.nama)) m.set(p.nama, 0); });
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [rows, manpower]);
  const req = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((t) => m.set(t.requestBy || "—", (m.get(t.requestBy || "—") ?? 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  }, [rows]);
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const p = shiftPeriode(periode, i - 5);
    return { p, label: BLN_S[(p % 100) - 1], n: all.filter((t) => inMonth(t.tanggal, p)).length };
  }), [all, periode]);
  // Pekerjaan dari aplikasi yang belum selesai — ditampilkan lintas bulan supaya tidak terlewat.
  const openAll = useMemo(() => all.filter((t) => t.source === "app" && t.status && t.status !== "selesai"), [all]);
  const base = src === "open" ? openAll : rows.filter((t) => !src || (t.source ?? "excel") === src);
  const list = base.filter((t) => (!who || (t.namaTga || "—") === who) &&
    (!q || [t.activity, t.requestBy, t.namaTga, t.lokasi, t.kategori, t.departemen, t.refNo].join(" ").toLowerCase().includes(q.toLowerCase())));
  const maxM = Math.max(1, ...months.map((m) => m.n));
  const appCount = rows.filter((t) => t.source === "app").length;

  function exportRows(fmt: "excel" | "pdf" | "csv") {
    const cols: ReportColumn<GaTga>[] = [
      { key: "tgl", labelId: "Tanggal", labelEn: "Date", get: (r) => r.tanggal ?? "" },
      { key: "jam", labelId: "Jam", labelEn: "Time", get: (r) => r.jam ?? "" },
      { key: "nama", labelId: "Nama TGA", labelEn: "Technician", get: (r) => r.namaTga },
      { key: "kat", labelId: "Kategori", labelEn: "Category", get: (r) => r.kategori ?? "" },
      { key: "act", labelId: "Activity", labelEn: "Activity", get: (r) => r.activity, width: 3 },
      { key: "lok", labelId: "Lokasi", labelEn: "Location", get: (r) => r.lokasi ?? "" },
      { key: "req", labelId: "Request By", labelEn: "Requested by", get: (r) => r.requestBy },
      { key: "dept", labelId: "Departemen", labelEn: "Department", get: (r) => r.departemen ?? "" },
      { key: "st", labelId: "Status", labelEn: "Status", get: (r) => tgaSt(r, lang) + (r.prioritas === "urgent" ? " (URGENT)" : "") },
      { key: "ref", labelId: "No. Ref", labelEn: "Ref no.", get: (r) => r.refNo ?? "" },
      { key: "src", labelId: "Sumber", labelEn: "Source", get: (r) => (r.source === "app" ? "Aplikasi" : "Excel") },
    ];
    const run = fmt === "csv" ? exportGenericCsv : fmt === "excel" ? exportGenericExcel : exportGenericPdf;
    run({ rows: list, columns: cols, lang: lang as ReportLang, titleId: "Aktivitas TGA (Teknisi GA)", titleEn: "GA Technician Activities", periodLabel: perLabel(periode, lang), filename: "Aktivitas_TGA",
      summaryRows: [
        { label: L("Total aktivitas", "Total activities"), value: list.length },
        { label: L("Selesai", "Done"), value: list.filter((t) => !t.status || t.status === "selesai").length },
        { label: L("Belum selesai", "Open"), value: list.filter((t) => t.status && t.status !== "selesai").length },
      ] });
  }

  const SRC: { id: typeof src; label: string; n: number }[] = [
    { id: "", label: L("Semua", "All"), n: rows.length },
    { id: "app", label: L("Dari aplikasi", "From app"), n: appCount },
    { id: "excel", label: "Excel", n: rows.length - appCount },
    { id: "open", label: L("Belum selesai", "Open"), n: openAll.length },
  ];

  return (
    <div className={a.dash}>
      <div className={g.grid3}>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Aktivitas bulan ini", "Activities this month")}</h2><p>{L("Perbaikan / permintaan yang dikerjakan TGA", "Repairs / requests handled by TGA")}</p></div></div>
          <div className={g.bigNum}>{rows.length}</div>
          <p className={a.hint} style={{ margin: "0 0 8px" }}>{appCount} {L("dari aplikasi", "from app")} · {openAll.length} {L("belum selesai", "open")}</p>
          <div className={g.sparkBars}>{months.map((m) => <div key={m.p} title={`${m.label}: ${m.n}`}><span style={{ height: `${(m.n / maxM) * 100}%` }} className={m.p === periode ? g.sparkOn : ""} /><small>{m.label}</small></div>)}</div>
        </section>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Per teknisi", "By technician")}</h2><p>{L("Klik untuk memfilter", "Click to filter")}</p></div></div>
          {tech.length === 0 ? <p className={a.empty}>—</p> : (
            <ol className={a.hbars}>
              {tech.map(([n, c]) => (
                <li key={n}>
                  <button type="button" className={`${a.hbar} ${who === n ? a.hbarOn : ""}`} onClick={() => setWho(who === n ? "" : n)} aria-pressed={who === n}>
                    <span className={a.hbarBody}><span className={a.hbarTop}><b>{n}</b><span>{c}</span></span><span className={a.track}><span style={{ width: `${tech[0][1] ? (c / tech[0][1]) * 100 : 0}%` }} /></span></span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className={a.card}>
          <div className={a.cardHead}><div><h2>{L("Pemohon terbanyak", "Top requesters")}</h2><p>Request By</p></div></div>
          {req.length === 0 ? <p className={a.empty}>—</p> : (
            <ul className={a.feed}>{req.map(([n, c]) => <li key={n}><div className={a.feedMain}><div className={a.feedTop}><b>{n}</b><span>{c} {L("aktivitas", "activities")}</span></div></div></li>)}</ul>
          )}
        </section>
      </div>
      <section className={a.card}>
        <div className={a.toolbar}>
          <input className={`${a.input} ${a.search}`} placeholder={L("Cari activity, lokasi, pemohon, teknisi…", "Search activity, location, requester, technician…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className={a.seg}>{SRC.map((x) => <button key={x.id || "all"} type="button" className={src === x.id ? a.segOn : ""} onClick={() => setSrc(x.id)} aria-pressed={src === x.id}>{x.label}<small>{x.n}</small></button>)}</div>
          {who && <button type="button" className={a.focusChip} onClick={() => setWho("")}>{who} ✕</button>}
          <span className={a.grow} />
          <div className={a.exportGroup}>{(["excel", "pdf", "csv"] as const).map((f) => <button key={f} type="button" className={a.ghostBtn} onClick={() => exportRows(f)} disabled={!list.length}>{f.toUpperCase()}</button>)}</div>
        </div>
        {list.length === 0 ? <p className={a.empty}>{src === "open" ? L("Tidak ada pekerjaan yang belum selesai. 👍", "No open jobs. 👍") : L("Tidak ada aktivitas TGA di bulan ini.", "No TGA activities this month.")}</p> : (
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead><tr><th>{L("Tanggal", "Date")}</th><th>{L("Nama TGA", "Technician")}</th><th>Activity</th><th>Request By</th><th>Status</th></tr></thead>
              <tbody>{list.map((t) => (
                <tr key={`${t.source ?? "excel"}-${t.id}`}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtD(t.tanggal, lang)}{t.jam && <><br /><small className={a.mute}>{t.jam}</small></>}</td>
                  <td><b>{t.namaTga || "—"}</b></td>
                  <td>
                    {t.activity}
                    {(t.kategori || t.lokasi || t.refNo) && <><br /><small className={a.mute}>{[t.kategori, t.lokasi && `📍 ${t.lokasi}`, t.refNo].filter(Boolean).join(" · ")}</small></>}
                    {t.catatan && <><br /><small className={a.mute}>📝 {t.catatan}</small></>}
                  </td>
                  <td>{t.requestBy || "—"}{(t.departemen || (t.source === "app" && t.requestBy)) && <><br /><small className={a.mute}>{[t.departemen, t.source === "app" && t.requestBy ? (t.requestorLinked ? L("✓ data karyawan", "✓ employee") : L("di luar data karyawan", "not in employee data")) : ""].filter(Boolean).join(" · ")}</small></>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {t.status ? <span className={a[TGA_ST[t.status]?.cls ?? "tagWeb"]}>{tgaSt(t, lang)}</span> : <span className={a.mute}>—</span>}
                    {t.prioritas === "urgent" && <> <span className={a.tagPending}>URGENT</span></>}
                    <br /><small className={a.mute}>{t.source === "app" ? L("📱 Aplikasi", "📱 App") : "Excel"}</small>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

