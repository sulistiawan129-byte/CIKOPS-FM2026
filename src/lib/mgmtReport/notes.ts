/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — catatan data per modul.
   • assessData(): seberapa lengkap data periode ini & periode pembanding → apakah perbandingan
     "naik/turun" layak dipercaya.
   • buildNote(): teks siap tampil (status data, peringatan, definisi indikator) untuk layar/PDF/PPT/Excel.
   Fungsi murni; teks mengikuti bahasa laporan (tr).
════════════════════════════════════════════════════════════ */

import { COVERAGE_MIN, daysBetween, dFull, tr, type DataNote, type ModuleKey } from "./model";
/** Selisih hari antara input terakhir dan akhir periode yang masih dianggap wajar (akhir pekan / libur). */
const GAP_OK_DAYS = 3;

export interface Assessment {
  first: string | null;
  last: string | null;
  prevCov: number;
  curCov: number;
  ok: boolean;
  reasons: string[];
  lastAgo: number | null;
  /** periode laporan sudah berakhir (bukan bulan berjalan) → "N hari lalu" tidak bermakna */
  pastPeriod: boolean;
}

const d10 = (s: string | null | undefined) => (s || "").slice(0, 10);

/**
 * dates  : tanggal transaksi/aktivitas modul dalam jendela data (menentukan "tersedia sejak").
 * inputs : tanggal saat data diinput (menentukan "terakhir tercatat"); bila kosong dipakai `dates`.
 * Tanggal setelah hari ini tidak dihitung sebagai input (mis. jadwal masa depan).
 */
export function assessData(p: {
  dates: (string | null | undefined)[]; inputs?: (string | null | undefined)[];
  from: string; to: string; prevFrom: string; prevTo: string; prevLabel: string; today: string;
}): Assessment {
  const ds = p.dates.map(d10).filter(Boolean).sort();
  // "terakhir tercatat": tidak melewati hari ini, dan untuk periode yang sudah berakhir tidak melewati akhir periode
  const lastCap = p.to < p.today ? p.to : p.today;
  const ins = (p.inputs ?? p.dates).map(d10).filter((d) => d && d <= lastCap).sort();
  const first = ds[0] ?? null;
  const last = ins.length ? ins[ins.length - 1] : null;

  // periode pembanding: berapa bagian periodenya yang sudah punya data (data baru mulai di tengah periode → kurang)
  const prevSpan = Math.max(1, daysBetween(p.prevFrom, p.prevTo));
  const prevCov = first === null || first > p.prevTo ? 0 : first <= p.prevFrom ? 1 : daysBetween(first, p.prevTo) / prevSpan;

  // periode ini: berapa bagian (s.d. hari ini) yang sudah terisi
  const effEnd = p.to < p.today ? p.to : p.today;
  let curCov = 1;
  if (effEnd >= p.from) {
    if (last === null || last < p.from) curCov = 0;
    else if (daysBetween(last, effEnd) - 1 > GAP_OK_DAYS) curCov = daysBetween(p.from, last) / Math.max(1, daysBetween(p.from, effEnd));
  }

  const reasons: string[] = [];
  if (prevCov < COVERAGE_MIN) {
    reasons.push(first === null || first > p.prevTo
      ? tr(`belum ada data pada ${p.prevLabel}`, `no data for ${p.prevLabel}`)
      : tr(`data modul ini baru tersedia sejak ${dFull(first)}, sehingga ${p.prevLabel} baru terisi ${Math.round(prevCov * 100)}%`,
           `this module's data only starts on ${dFull(first)}, so ${p.prevLabel} is only ${Math.round(prevCov * 100)}% covered`));
  }
  if (curCov < COVERAGE_MIN) {
    reasons.push(last === null || last < p.from
      ? tr("belum ada data tercatat pada periode ini", "no data recorded in this period yet")
      : tr(`data terakhir tercatat ${dFull(last)}, sehingga periode ini baru terisi ${Math.round(curCov * 100)}%`,
           `the latest data is from ${dFull(last)}, so this period is only ${Math.round(curCov * 100)}% covered`));
  }
  const lastAgo = last ? Math.max(0, daysBetween(last, p.today) - 1) : null;
  return { first, last, prevCov, curCov, ok: reasons.length === 0, reasons, lastAgo, pastPeriod: p.to < p.today };
}

/* ── definisi indikator per modul ── */
function defsOf(key: ModuleKey): string[] {
  switch (key) {
    case "fleet": return [
      tr("Total penugasan: semua tugas pada periode yang tidak dibatalkan.", "Total assignments: all tasks in the period that were not cancelled."),
      tr("Tingkat penyelesaian: tugas berstatus selesai ÷ total penugasan. Terdiri dari tugas yang ditutup driver dan tugas yang ditutup otomatis oleh sistem (rinciannya tertulis di bawah angka).",
         "Completion rate: completed tasks ÷ total assignments. It combines tasks closed by the driver and tasks closed automatically by the system (the split is shown under the figure)."),
      tr("Ditutup otomatis: tugas yang belum ditutup driver sampai pukul 17.00 WIB pada tanggal tugas ditutup oleh sistem. Tugas ini dihitung selesai, tetapi tidak dipakai untuk rata-rata durasi.",
         "Auto-closed: a task the driver has not closed by 17:00 (WIB) on the task date is closed by the system. It counts as completed but is excluded from the average duration."),
      tr("Armada terpakai: unit aktif yang dipakai minimal sekali pada periode ÷ jumlah unit aktif. Tidak mengukur seberapa sering atau seberapa lama unit dipakai.",
         "Fleet used: active units used at least once in the period ÷ active units. It does not measure how often or how long a unit is used."),
      tr("Rata-rata durasi tugas: waktu dari tugas diterima sampai selesai, hanya untuk tugas yang ditutup driver.", "Average task duration: time from accepted to completed, only for tasks the driver closed."),
      tr("Dokumen jatuh tempo: KIR dan Service 6 bulan, STNK 12 bulan sejak tanggal terakhir; dihitung bila jatuh tempo ≤ 30 hari dari hari ini.",
         "Documents due: KIR and Service every 6 months, STNK every 12 months from the last date; counted when due within 30 days from today."),
    ];
    case "claims": return [
      tr("Total klaim: jumlah nominal klaim driver menurut tanggal periode klaim.", "Total claims: sum of driver claim amounts by the claim period date."),
      tr("Rata-rata per klaim: total nominal ÷ jumlah pengajuan.", "Average per claim: total amount ÷ number of submissions."),
      tr("Kategori mengikuti jenis item klaim (bensin, tol, parkir, servis, perawatan, lainnya).", "Categories follow the claim item type (fuel, toll, parking, service, maintenance, other)."),
    ];
    case "canteen": return [
      tr("Efisiensi: porsi yang termakan ÷ porsi yang dipesan (pesanan dikurangi sisa), dihitung dari laporan harian kantin.", "Efficiency: portions eaten ÷ portions ordered (order minus leftover), from the daily canteen reports."),
      tr("Hari tanpa laporan harian tidak dihitung.", "Days without a daily report are not counted."),
    ];
    case "atk": return [
      tr("Unit ATK keluar: jumlah barang yang diminta pada periode (permintaan dari form web dan Excel).", "Units issued: items requested in the period (web form and Excel requests)."),
      tr("Rasio masuk/keluar: unit restock ÷ unit keluar. Di bawah 1 berarti stok menipis.", "In/out ratio: units restocked ÷ units issued. Below 1 means stock is shrinking."),
      tr("Item stok kritis: barang yang habis atau stoknya cukup kurang dari 14 hari menurut laju pemakaian.", "Critical stock items: items that are out or have under 14 days of cover at the current usage rate."),
    ];
    case "ga": return [
      tr("Achievement: pekerjaan dikerjakan ÷ (dikerjakan + tidak dikerjakan) pada jadwal Cleaning & Gardening. Pekerjaan yang belum dinilai atau masih terjadwal ke depan tidak dihitung.",
         "Achievement: jobs done ÷ (done + not done) in the Cleaning & Gardening schedule. Jobs not yet assessed or still scheduled ahead are not counted."),
      tr("Lokasi di bawah target: lokasi dengan achievement di bawah 100%.", "Locations below target: locations with achievement under 100%."),
    ];
    case "tga": return [
      tr("Total pekerjaan: semua pekerjaan TGA pada periode yang tidak dibatalkan.", "Total jobs: all TGA jobs in the period that were not cancelled."),
      tr("Selesai: pekerjaan berstatus selesai ÷ total pekerjaan. Belum selesai = baru, proses, pending, dan butuh part.", "Completed: jobs marked completed ÷ total jobs. Still open = new, in progress, pending and needs parts."),
      tr("Rata-rata waktu pengerjaan: jam mulai sampai jam selesai, hanya untuk pekerjaan yang selesai dan jamnya lengkap.", "Average working time: start to finish time, only for completed jobs with both times recorded."),
    ];
    case "receptionist": return [
      tr("Akses wifi tamu: jumlah pemberian akun wifi pada periode.", "Guest wifi access: number of wifi accounts handed out in the period."),
      tr("Serah terima barang: barang yang sudah diserahkan ÷ barang yang tercatat; “menunggu ≥ 2 hari” adalah barang yang belum diambil.", "Items handed over: items handed over ÷ items logged; “waiting ≥ 2 days” are items not yet collected."),
      tr("Pemakaian ruang: jam terbooking ÷ jam buka ruang pada hari kerja dalam periode.", "Room usage: booked hours ÷ room opening hours on working days in the period."),
    ];
    case "security": return [
      tr("Data Security berasal dari laporan bulanan G4S (per minggu / bulan); perbandingan memakai bulan yang tersedia.", "Security data comes from the monthly G4S reports (weekly / monthly); comparisons use the months available."),
      tr("Total kejadian: jumlah seluruh jenis kejadian pada periode; rincian per jenis dijumlahkan, sisanya masuk “Lainnya”.", "Total incidents: all incident types in the period; the per-type breakdown adds up, with the remainder under “Other”."),
    ];
  }
}

/** Satu kalimat untuk ringkasan eksekutif: modul mana yang perbandingannya belum representatif (null = semua aman). */
export function compareSummary(modules: { title: string; sub?: boolean; note?: DataNote }[]): string | null {
  const weak = modules.filter((m) => !m.sub && m.note?.warn).map((m) => m.title);
  if (!weak.length) return null;
  return tr(`⚠ Perbandingan dengan periode lalu belum representatif pada: ${weak.join(", ")}. Lihat catatan data di tiap modul; angka naik/turun bertanda ⚠ jangan dijadikan dasar keputusan.`,
            `⚠ The comparison with the prior period is not yet representative for: ${weak.join(", ")}. See each module's data note; changes marked ⚠ should not be used for decisions.`);
}

export function buildNote(key: ModuleKey, a: Assessment | null, prevLabel: string): DataNote {
  const defs = defsOf(key);
  if (!a) return { status: "", defs };
  const showAgo = !a.pastPeriod && a.lastAgo !== null;   // periode lampau: hanya tanggal data terakhir dalam periode
  const status = a.first === null
    ? tr("Belum ada data tercatat.", "No data recorded yet.")
    : tr(`Data tersedia sejak ${dFull(a.first)} · ${a.pastPeriod ? "data terakhir dalam periode ini" : "terakhir tercatat"} ${a.last ? dFull(a.last) : "–"}${showAgo ? (a.lastAgo === 0 ? " (hari ini)" : ` (${a.lastAgo} hari lalu)`) : ""}.`,
         `Data available since ${dFull(a.first)} · ${a.pastPeriod ? "latest data within this period" : "last recorded"} ${a.last ? dFull(a.last) : "–"}${showAgo ? (a.lastAgo === 0 ? " (today)" : ` (${a.lastAgo} days ago)`) : ""}.`);
  const warn = a.ok ? undefined
    : tr(`⚠ Perbandingan dengan ${prevLabel} belum representatif: ${a.reasons.join("; ")}. Angka naik/turun bertanda ⚠ jangan dijadikan dasar keputusan.`,
         `⚠ The comparison with ${prevLabel} is not yet representative: ${a.reasons.join("; ")}. Changes marked ⚠ should not be used for decisions.`);
  return { status, warn, defs };
}
