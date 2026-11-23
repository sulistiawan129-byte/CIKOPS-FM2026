/* ════════════════════════════════════════════════════════════
   ID CARD — dokumen cetak (tanda terima pengajuan & penyerahan). Dibuka di jendela baru lalu dicetak,
   sama dengan sistem ID Card lama. Semua isi dari pengguna di-escape.
════════════════════════════════════════════════════════════ */
import { BRAND } from "../brand";
import { escapeHtml as esc } from "../escapeHtml";
import { TIPE_LABEL, angkaKata, fmtDate, fmtDateLong, type IdHandover, type IdRequest } from "./model";

const company = () => BRAND.company.toUpperCase();
const TIPE_COLOR = { T: "#92400e", C: "#1d4ed8", O: "#166534", R: "#9a3412" } as const;

function openPrintWindow(html: string): boolean {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

const PRINT_SCRIPT = "<script>window.onload=function(){window.print();setTimeout(function(){window.close()},800)}</script>";

export function printRequestReceipt(r: IdRequest, cards: string[]): boolean {
  const ref = r.id.substring(0, 8).toUpperCase();
  return openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tanda Terima Pengajuan Kartu</title>
<style>
@page{size:A4;margin:20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11pt;color:#000}
.hdr{text-align:center;margin-bottom:20px}.hdr h2{font-size:14pt;font-weight:900;color:#0e3377}.hdr p{font-size:9pt;color:#555}
.title{text-align:center;font-size:13pt;font-weight:700;border:2px solid #0e3377;padding:8px 0;margin-bottom:18px;color:#0e3377;border-radius:4px}
.info-tbl{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:10pt}.info-tbl td{padding:5px 8px;border:1px solid #ddd}
.info-tbl td:first-child{font-weight:700;background:#f5f7fa;width:35%;color:#0e3377}
.sign-area{display:flex;justify-content:space-between;margin-top:28px;gap:30px}
.sign-box{flex:1;border-top:2px solid #0e3377;padding-top:8px;text-align:center;font-size:9pt;color:#333}
.num-grid{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.num-tag{background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:9pt;font-weight:700;border:1px solid #93c5fd}
.footer{margin-top:24px;text-align:center;font-size:8pt;color:#888;border-top:1px solid #ddd;padding-top:8px}
.highlight{background:#fff8e1;border:1.5px solid #f59e0b;border-radius:4px;padding:6px 10px;margin-bottom:14px;font-size:9.5pt}
</style></head><body>
<div class="hdr"><h2>${esc(company())}</h2><p>${esc(BRAND.address)} — Security Department</p></div>
<div class="title">TANDA TERIMA PENGAJUAN ID CARD</div>
<div class="highlight">No. Referensi: <strong>${esc(ref)}</strong> &nbsp;|&nbsp; Tanggal Cetak: <strong>${esc(fmtDateLong(new Date(Date.now() + 7 * 3600000).toISOString()))}</strong></div>
<table class="info-tbl">
<tr><td>Nama Perusahaan</td><td><strong>${esc(r.perusahaan)}</strong></td></tr>
<tr><td>Nama PIC</td><td>${esc(r.pic)}</td></tr>
<tr><td>No. HP / WA</td><td>${esc(r.phone) || "—"}</td></tr>
<tr><td>Tanggal Pengajuan</td><td>${esc(fmtDate(r.tanggal))}</td></tr>
<tr><td>Jenis Kartu</td><td><strong>${esc(TIPE_LABEL[r.tipe])}</strong></td></tr>
<tr><td>Lokasi</td><td>${esc(r.lokasi) || "CIKARANG"}</td></tr>
<tr><td>Jumlah Kartu</td><td><strong style="font-size:13pt;color:#0e3377">${r.jumlah} kartu</strong></td></tr>
<tr><td>Nomor Kartu Dari</td><td><span style="font-family:monospace;font-weight:700;color:#1d4ed8">${esc(r.cardFrom)}</span></td></tr>
<tr><td>Nomor Kartu Sampai</td><td><span style="font-family:monospace;font-weight:700;color:#1d4ed8">${esc(r.cardTo)}</span></td></tr>
${r.catatan ? `<tr><td>Catatan</td><td>${esc(r.catatan)}</td></tr>` : ""}
</table>
<div style="font-weight:700;color:#0e3377;margin-bottom:8px;font-size:10pt">DETAIL NOMOR KARTU:</div>
<div class="num-grid">${cards.map((n) => `<span class="num-tag">${esc(n)}</span>`).join("")}</div>
<div class="sign-area">
<div class="sign-box"><div style="height:60px"></div>Admin Security<br><strong>${esc(BRAND.company)}</strong><br><small>Nama &amp; Tanda Tangan</small></div>
<div class="sign-box"><div style="height:60px"></div>Penerima / PIC<br><strong>${esc(r.pic)}</strong><br><small>${esc(r.perusahaan)}</small></div>
<div class="sign-box"><div style="height:60px"></div>Mengetahui<br><strong>Supervisor Security</strong><br><small>Nama &amp; Tanda Tangan</small></div>
</div>
<div class="footer">Dokumen ini dicetak melalui ID Card Management System — ${esc(BRAND.company)} &nbsp;|&nbsp; ${esc(new Date().toISOString())}</div>
${PRINT_SCRIPT}</body></html>`);
}

export function printHandoverReceipt(h: IdHandover): boolean {
  const ref = h.id.substring(0, 8).toUpperCase();
  const label = TIPE_LABEL[h.tipe];
  return openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tanda Terima Penyerahan Kartu</title>
<style>
@page{size:A4;margin:18mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11pt;color:#111}
.letterhead{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #0e3377;padding-bottom:12px;margin-bottom:16px}
.lh-left h1{font-size:15pt;font-weight:900;color:#0e3377;margin-bottom:2px}.lh-left p{font-size:8.5pt;color:#555;line-height:1.5}
.doc-title{text-align:center;margin-bottom:18px}
.doc-title h2{font-size:14pt;font-weight:900;text-transform:uppercase;color:#0e3377;border:2.5px solid #0e3377;display:inline-block;padding:8px 28px;border-radius:5px;letter-spacing:.5px}
.ref-bar{background:#f0f4ff;border:1px solid #c7d7f5;border-radius:5px;padding:8px 14px;margin-bottom:16px;font-size:9pt;display:flex;gap:24px}
.ref-bar span{color:#555}.ref-bar strong{color:#0e3377}
table.info{width:100%;border-collapse:collapse;margin-bottom:16px}table.info td{padding:6px 10px;border:1px solid #ddd;font-size:10.5pt;vertical-align:top}
table.info td:first-child{font-weight:700;background:#f5f7fa;width:38%;color:#0e3377;font-size:10pt}
.card-box{background:#e8f0fe;border:2px solid #3b5fc0;border-radius:6px;padding:14px 18px;margin-bottom:18px}
.card-box-title{font-size:10pt;font-weight:700;color:#0e3377;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}
.card-row{display:flex;gap:16px;align-items:center;margin-bottom:6px;font-size:11pt}.card-row label{color:#555;width:120px;font-size:9.5pt}
.card-tag{background:#fff;border:1.5px solid #3b5fc0;border-radius:4px;padding:3px 12px;font-family:monospace;font-weight:700;color:#1d4ed8;font-size:12pt}
.card-count{font-size:22pt;font-weight:900;color:#0e3377;margin-top:4px}
.catatan-box{background:#fffbeb;border:1px solid #f59e0b;border-radius:5px;padding:10px 14px;margin-bottom:18px;font-size:10pt}
.sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:24px}.sign-box{text-align:center;font-size:9.5pt}
.sign-box .sign-line{border-bottom:1.5px solid #333;margin:56px 10px 6px}.sign-box .sign-title{font-weight:700;color:#0e3377;margin-bottom:2px}.sign-box .sign-name{font-size:9pt;color:#555}
.stamp-area{border:1px dashed #aaa;border-radius:5px;width:90px;height:90px;display:flex;align-items:center;justify-content:center;font-size:7.5pt;color:#bbb;text-align:center;margin:0 auto 4px}
.footer-note{margin-top:20px;border-top:1px solid #ccc;padding-top:8px;font-size:7.5pt;color:#888;display:flex;justify-content:space-between}
</style></head><body>
<div class="letterhead"><div class="lh-left"><h1>${esc(company())}</h1><p>Security &amp; HSE Department<br>${esc(BRAND.address)}</p></div></div>
<div class="doc-title"><h2>Tanda Terima Penyerahan ID Card</h2></div>
<div class="ref-bar"><div><span>No. Ref: </span><strong>${esc(ref)}</strong></div><div><span>Tgl Serah: </span><strong>${esc(fmtDateLong(h.tanggal))}</strong></div><div><span>Tgl Cetak: </span><strong>${esc(fmtDateLong(new Date(Date.now() + 7 * 3600000).toISOString()))}</strong></div></div>
<table class="info">
<tr><td>Nama Perusahaan</td><td><strong style="font-size:11.5pt">${esc(h.perusahaan)}</strong></td></tr>
<tr><td>Nama Penerima</td><td><strong>${esc(h.pic)}</strong>${h.jabatan ? ` &nbsp;<span style="color:#777;font-size:9.5pt">/ ${esc(h.jabatan)}</span>` : ""}</td></tr>
<tr><td>No. HP / WA</td><td>${esc(h.phone) || "—"}</td></tr>
<tr><td>Jenis ID Card</td><td><strong style="color:${TIPE_COLOR[h.tipe]}">${esc(label)}</strong></td></tr>
</table>
<div class="card-box"><div class="card-box-title">🪪 Detail Kartu yang Diserahkan</div>
<div class="card-row"><label>Nomor Dari</label><span class="card-tag">${esc(h.cardFrom)}</span></div>
<div class="card-row"><label>Nomor Sampai</label><span class="card-tag">${esc(h.cardTo)}</span></div>
<div class="card-row" style="margin-top:10px"><label>Total Kartu</label><div><span class="card-count">${h.jumlah}</span> <span style="font-size:10pt;color:#555">kartu</span></div></div></div>
${h.catatan ? `<div class="catatan-box"><strong>📝 Catatan:</strong> ${esc(h.catatan)}</div>` : ""}
<p style="font-size:10pt;color:#555;margin-bottom:18px;line-height:1.6">Dengan ini menyatakan bahwa kartu identitas sebanyak <strong>${h.jumlah} (${esc(angkaKata(h.jumlah))}) kartu</strong> jenis <strong>${esc(label)}</strong> dengan nomor <strong>${esc(h.cardFrom)}</strong> sampai <strong>${esc(h.cardTo)}</strong> telah diterima dalam kondisi baik oleh pihak yang bersangkutan untuk digunakan sesuai peraturan ${esc(BRAND.company)} yang berlaku.</p>
<div class="sign-grid">
<div class="sign-box"><div class="stamp-area">Cap<br>Perusahaan</div><div class="sign-line"></div><div class="sign-title">Yang Menyerahkan</div><div class="sign-name">Admin Security / HSE<br>${esc(BRAND.company)}</div></div>
<div class="sign-box"><div class="stamp-area">Cap<br>Perusahaan</div><div class="sign-line"></div><div class="sign-title">Yang Menerima</div><div class="sign-name"><strong>${esc(h.pic)}</strong><br>${esc(h.jabatan || h.perusahaan)}</div></div>
<div class="sign-box"><div class="stamp-area">Cap<br>Perusahaan</div><div class="sign-line"></div><div class="sign-title">Mengetahui</div><div class="sign-name">Supervisor / Manager<br>${esc(BRAND.company)}</div></div>
</div>
<div class="footer-note"><span>Dokumen ini dicetak melalui ID Card Management System — ${esc(BRAND.company)}</span><span>${esc(new Date().toISOString())}</span></div>
${PRINT_SCRIPT}</body></html>`);
}
