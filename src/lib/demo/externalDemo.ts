/* Data FIKTIF untuk sumber luar (G-C / Security Desk) saat deployment DEMO
   (NEXT_PUBLIC_DEMO_MODE=1). Dipakai /api/gc-nc sebagai pengganti koneksi G-C.
   Angka dibuat dari pseudo-random dengan seed tanggal → konsisten antar refresh. */

import { KEJ_CATS, TEAM_KEYS } from "../security/model";
import type { SdReport } from "../security/secdesk";

/** mulberry32 — PRNG kecil berbiji */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const pickOf = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n: number) => String(n).padStart(2, "0");

/** Hari ini menurut WIB (YYYY-MM-DD) */
export const todayWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

const TRANSPORTERS = ["PT. Sinar Logistik Nusantara", "PT. Cahaya Transindo", "CV. Mandiri Angkut", "PT. Bumi Ekspres", "PT. Garuda Cargo Lestari", "PT. Samudra Trans Jaya", "CV. Putra Armada"];
const NC_TYPES = ["Tidak memakai APD", "Over speed di area plant", "Merokok di area terlarang", "Dokumen tidak lengkap", "Parkir tidak pada tempatnya", "Tidak mengikuti antrean timbang"];
const PLATES = ["B 9123 KJT", "B 9871 UYA", "B 9455 TXR", "D 8812 AB", "B 9012 FCD", "T 8456 GH", "B 9334 KLM"];

function monthDays(key: string, upTo: string) {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    if (iso > upTo) break;
    out.push(iso);
  }
  return out;
}

/** Ringkasan NC bulan berjalan untuk FM Command Center */
export function demoNcBoard() {
  const today = todayWib();
  const items: { d: string; jam: string | null; transporter: string; jenis: string[] }[] = [];
  for (const d of monthDays(today.slice(0, 7), today)) {
    const r = rng(seedOf(`nc-${d}`));
    const n = r() < 0.45 ? 0 : int(r, 1, 3);
    for (let i = 0; i < n; i++) items.push({ d, jam: `${pad(int(r, 7, 17))}:${pad(int(r, 0, 59))}`, transporter: pickOf(r, TRANSPORTERS), jenis: [pickOf(r, NC_TYPES)] });
  }
  return { ok: true, plant: "DEMO", today, fetchedAt: new Date().toISOString(), items };
}

/** Kasus pelanggaran per tanggal (modul Security → Pelanggaran) */
export function demoNcCases(from: string, to: string) {
  const cases = [];
  const today = todayWib();
  for (let t = Date.parse(from); t <= Date.parse(to) && t <= Date.parse(today); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const r = rng(seedOf(`nc-${d}`));
    const n = r() < 0.45 ? 0 : int(r, 1, 3);
    for (let i = 0; i < n; i++) {
      const sim = String(int(r, 1000, 9999));
      cases.push({ id: `demo-${d}-${i}`, tanggal: d, supplier: pickOf(r, TRANSPORTERS), nopol: pickOf(r, PLATES), simHash: `demo${sim}`, simLast4: sim, jenis: [pickOf(r, NC_TYPES)] });
    }
  }
  return { ok: true, plant: "DEMO", fetchedAt: new Date().toISOString(), cases };
}

/** Laporan Security Desk per bulan (format security.cikops_report) */
export function demoSecDeskMonth(key: string): SdReport {
  const today = todayWib();
  const r = rng(seedOf(`sd-${key}`));
  const days = monthDays(key, today);
  const daily: SdReport["daily"] = [];
  for (const d of days) {
    const we = [0, 6].includes(new Date(`${d}T00:00:00`).getDay());
    const k = we ? 0.35 : 1;
    daily.push(
      { d, c: "karyawan", v: Math.round(int(r, 160, 210) * k) }, { d, c: "motor", v: Math.round(int(r, 380, 460) * k) },
      { d, c: "tamu", v: Math.round(int(r, 12, 30) * k) }, { d, c: "kontraktor", v: Math.round(int(r, 8, 22) * k) },
      { d, c: "visitor", v: Math.round(int(r, 15, 40) * k) }, { d, c: "timbang", v: Math.round(int(r, 25, 45) * k) },
      { d, c: "non_timbang", v: Math.round(int(r, 6, 14) * k) }, { d, c: "sekam", v: Math.round(int(r, 2, 6) * k) }, { d, c: "abu", v: Math.round(int(r, 0, 3) * k) },
    );
  }
  const frac = days.length / 30;
  const incidents = KEJ_CATS.map((c) => ({ category: c.id, value: r() < 0.55 ? 0 : Math.max(1, Math.round(int(r, 1, 4) * frac)), note: "" }));
  const [y, m] = key.split("-").map(Number);
  const kpi: SdReport["kpi"] = [];
  for (let mm = 1; mm <= m; mm++) for (let o = 1; o <= 7; o++) kpi.push({ m: mm, o, s: Math.round((3.6 + rng(seedOf(`kpi-${y}-${mm}-${o}`))() * 1.3) * 100) / 100 });
  const dayStr = (i: number) => days[Math.min(days.length - 1, Math.max(0, i))] ?? `${key}-01`;
  return {
    version: 1,
    site: { code: "DEMO", name: "Pos Utama", plant: "CIK" },
    month: `${key}-01`,
    generated_at: new Date().toISOString(),
    daily,
    incidents,
    patrol: { target_patrol: Math.round(120 * frac), actual_patrol: Math.round(int(r, 108, 120) * frac), target_checkpoint: Math.round(960 * frac), actual_checkpoint: Math.round(int(r, 900, 960) * frac), note: "Patroli malam ditambah di area gudang" },
    extra: { selisih_timbang: int(r, 0, 3), palm_oil: int(r, 18, 40), team: Object.fromEntries(TEAM_KEYS.map((k) => [k, int(r, 2, 14)])), team_note: "Rotasi personel shift 3 berjalan normal" },
    issues: [
      { day: dayStr(2), category: "Kerusakan Fasilitas", description: "Palang pintu gate 2 macet, sudah dilaporkan ke teknisi", status: "Close" },
      { day: dayStr(9), category: "Lost & Found", description: "Dompet karyawan ditemukan di area kantin, sudah dikembalikan", status: "Close" },
      { day: dayStr(days.length - 3), category: "Security Issue", description: "CCTV area parkir motor blind spot, usulan tambah 1 kamera", status: "Open" },
    ],
    leaves: [
      { name: "Agus Setiawan", date_text: `${pad(3)}–${pad(4)} ${key.slice(5)}`, type: "Cuti", backup: "Rudi Hartono" },
      { name: "Bambang Sutrisno", date_text: `${pad(12)} ${key.slice(5)}`, type: "Sakit", backup: "" },
    ],
    improvements: [
      { opened_month: `${key}-01`, description: "Penambahan lampu penerangan jalur patroli belakang", priority: "Tinggi", progress: "Menunggu PO", status: "Proses" },
      { opened_month: `${key}-01`, description: "Refresh training penanganan tamu & visitor", priority: "Sedang", progress: "Jadwal minggu ke-4", status: "Open" },
      { opened_month: `${key}-01`, description: "Pengecatan ulang marka jalan area loading", priority: "Rendah", progress: "Selesai", status: "Selesai" },
    ],
    kpi,
    gate: {
      days: days.map((d) => ({ d, n: int(r, 25, 60) })),
      total_in: Math.round(1150 * frac), total_out: Math.round(1130 * frac), with_findings: int(r, 8, 25), avg_minutes: int(r, 70, 110),
      inside_now: int(r, 4, 14), over_4h: int(r, 0, 2),
      top_companies: TRANSPORTERS.slice(0, 5).map((name, i) => ({ name, n: Math.round((120 - i * 18) * frac) })),
    },
  };
}

/** Respons /api/gc-nc?sd=1 untuk rentang bulan */
export function demoSecDesk(keys: string[]) {
  return {
    ok: true, site: "DEMO", sites: [{ code: "DEMO", name: "Pos Utama", n: 30 }], fetchedAt: new Date().toISOString(),
    months: Object.fromEntries(keys.map((k) => [k, demoSecDeskMonth(k)])),
  };
}
