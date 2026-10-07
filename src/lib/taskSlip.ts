/**
 * Bukti Penugasan Driver — dokumen cetak.
 *
 * Satu bukti per tugas, dua bukti per lembar A4 (garis potong putus-putus),
 * hitam-putih friendly. Dirender sebagai HTML mandiri dan dicetak lewat iframe
 * (pratinjau di dashboard) — tidak butuh library tambahan.
 *
 * Nomor referensi diturunkan dari tanggal tugas + 4 karakter id (bukan nomor
 * urut resmi): PNG/20261007/A3F9.
 */

import type { TaskDetail, TaskStatus } from "./types";
import { plantLocation } from "./types";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

const STATUS_LABEL: Record<TaskStatus, string> = {
  ASSIGNED: "Ditugaskan",
  "ON GOING": "Sedang berjalan",
  DONE: "Selesai",
  CANCELLED: "Dibatalkan",
};

export function taskRefNo(t: Pick<TaskDetail, "id" | "tanggal">): string {
  return `PNG/${t.tanggal.replace(/-/g, "")}/${t.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return (
    d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")
  );
}

function plantName(p: string): string {
  return p === "PRB" ? "Plant Pasar Rebo" : "Plant Cikarang";
}

function slip(t: TaskDetail, printedAt: string, printedBy: string): string {
  const asal = (t.lokasi_asal && t.lokasi_asal.trim()) || plantLocation(t.plant);
  const kendaraan = t.kendaraan ? `${esc(t.kendaraan)}${t.kendaraan_jenis ? ` <span class="muted">(${esc(t.kendaraan_jenis)})</span>` : ""}` : "-";
  const requestor = `${esc(t.requestor || "-")}${t.departement ? ` <span class="muted">· ${esc(t.departement)}</span>` : ""}`;
  const cancelled = t.status === "CANCELLED";
  const times: string[] = [];
  if (t.accepted_at) times.push(`Diterima ${fmtStamp(t.accepted_at)}`);
  if (t.completed_at) times.push(`Selesai ${fmtStamp(t.completed_at)}`);
  return `
  <section class="slip${cancelled ? " void" : ""}">
    ${cancelled ? '<div class="stamp">DIBATALKAN</div>' : ""}
    <header class="head">
      <div class="brand">
        <div>
          <b>PT FRISIAN FLAG INDONESIA</b>
          <span>${esc(plantName(t.plant))}</span>
        </div>
      </div>
      <div class="doc">
        <h1>BUKTI PERMINTAAN DAN PENUGASAN DRIVER</h1>
        <div class="ref">No. Ref <b>${esc(taskRefNo(t))}</b></div>
      </div>
    </header>

    <div class="route">
      <div class="stop">
        <small>DARI · KEBERANGKATAN</small>
        <strong>${esc(asal)}</strong>
      </div>
      <div class="arrow" aria-hidden="true"><i></i><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
      <div class="stop to">
        <small>KE · TUJUAN</small>
        <strong>${esc(t.tujuan || "-")}</strong>
      </div>
    </div>

    <div class="grid">
      <div><small>Tanggal tugas</small><b>${esc(fmtDay(t.tanggal))}</b></div>
      <div><small>Jenis pekerjaan</small><b>${esc(t.jenis_pekerjaan || "-")}</b></div>
      <div><small>Status</small><b>${esc(STATUS_LABEL[t.status] ?? t.status)}</b>${times.length ? `<em>${esc(times.join(" · "))}</em>` : ""}</div>
      <div><small>Driver</small><b>${esc(t.driver_nama || "-")}</b></div>
      <div><small>Kendaraan</small><b>${kendaraan}</b></div>
      <div><small>Requestor</small><b>${requestor}</b></div>
      <div class="wide"><small>Perihal / catatan</small><b class="note">${esc(t.perihal || "-")}</b></div>
    </div>

    <div class="log">
      <div class="logTitle">Diisi saat tugas berjalan</div>
      <div class="logRow">
        <div><small>Jam keluar gate</small><span></span></div>
        <div><small>Jam masuk gate</small><span></span></div>
        <div><small>KM awal</small><span></span></div>
        <div><small>KM akhir</small><span></span></div>
      </div>
    </div>

    <footer class="foot">
      <span>Diterbitkan ${esc(fmtStamp(t.created_at))}</span>
      <span>Dicetak ${esc(printedAt)}${printedBy ? ` oleh ${esc(printedBy)}` : ""}</span>
    </footer>
  </section>`;
}

const CSS = `
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
  body { font-family: "Segoe UI", Roboto, Arial, "Helvetica Neue", sans-serif; font-size: 11px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 194mm; height: 281mm; margin: 0 auto; display: flex; flex-direction: column; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .slip { position: relative; flex: 1 1 0; min-height: 0; padding: 5mm 6mm 4mm; display: flex; flex-direction: column; gap: 3.2mm; border-bottom: 1px dashed #9ca3af; }
  .page .slip:last-child { border-bottom: 0; }
  .slip.void > *:not(.stamp) { opacity: .55; }
  .stamp { position: absolute; right: 12mm; bottom: 44mm; transform: rotate(-8deg); border: 2.5px solid #b91c1c; color: #b91c1c; padding: 2px 10px; font-weight: 800; font-size: 18px; letter-spacing: .08em; opacity: .85; z-index: 2; background: rgba(255,255,255,.7); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; padding-bottom: 2.4mm; border-bottom: 2px solid #111827; }
  .brand { display: flex; align-items: center; gap: 3mm; min-width: 0; }
  .brand b { display: block; font-size: 12px; letter-spacing: .04em; }
  .brand span { font-size: 10px; color: #4b5563; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 15px; letter-spacing: .06em; }
  .ref { margin-top: 1mm; font-size: 10px; color: #4b5563; }
  .ref b { font-family: "Consolas", "Courier New", monospace; color: #111827; font-size: 11px; }
  .route { display: grid; grid-template-columns: 1fr auto 1.25fr; align-items: stretch; gap: 3mm; }
  .stop { border: 1.5px solid #111827; border-radius: 2.2mm; padding: 2.4mm 3.2mm; min-width: 0; }
  .stop.to { background: #f3f4f6; }
  .stop small { display: block; font-size: 8.5px; letter-spacing: .1em; color: #4b5563; font-weight: 700; }
  .stop strong { display: block; margin-top: .8mm; font-size: 14px; line-height: 1.25; overflow-wrap: anywhere; }
  .arrow { display: flex; align-items: center; gap: 1mm; color: #111827; }
  .arrow i { width: 8mm; border-top: 2px dotted #111827; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d1d5db; border-radius: 2mm; }
  .grid > div { padding: 1.8mm 3mm; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; min-width: 0; }
  .grid > div:nth-child(3n) { border-right: 0; }
  .grid > div:nth-last-child(-n+1) { border-bottom: 0; }
  .grid > .wide { grid-column: 1 / -1; border-right: 0; }
  small { display: block; font-size: 8.5px; color: #6b7280; letter-spacing: .03em; margin-bottom: .4mm; }
  .grid b { font-size: 11.5px; font-weight: 700; overflow-wrap: anywhere; }
  .grid em { display: block; font-style: normal; font-size: 9px; color: #4b5563; margin-top: .4mm; }
  .note { font-weight: 600 !important; white-space: pre-wrap; }
  .muted { color: #6b7280; font-weight: 500; }
  .log .logTitle { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #374151; margin-bottom: 1.2mm; }
  .logRow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
  .logRow span { display: block; height: 6.5mm; border-bottom: 1px solid #111827; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; gap: 6mm; padding-top: 1.4mm; border-top: 1px solid #e5e7eb; font-size: 8.5px; color: #6b7280; }
  @media screen { body { background: #e5e7eb; padding: 10px 0; } .page { background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.18); margin-bottom: 14px; } }
`;

/** HTML lengkap berisi semua bukti, dua per halaman. */
export function buildTaskSlipsHtml(
  tasks: TaskDetail[],
  opts: { printedBy?: string; origin?: string } = {}
): string {
  const printedAt = fmtStamp(new Date().toISOString());
  const pages: string[] = [];
  for (let i = 0; i < tasks.length; i += 2) {
    const pair = tasks.slice(i, i + 2).map((t) => slip(t, printedAt, opts.printedBy ?? "")).join("");
    pages.push(`<div class="page">${pair}</div>`);
  }
  const title = tasks.length === 1 ? `Bukti Permintaan dan Penugasan ${taskRefNo(tasks[0])}` : `Bukti Permintaan dan Penugasan (${tasks.length} tugas)`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${pages.join("")}</body></html>`;
}
