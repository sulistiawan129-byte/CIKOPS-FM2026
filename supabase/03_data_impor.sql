-- ═══════════════════════════════════════════════════════════════
-- 03_DATA_IMPOR — impor data lama sekali pakai (riwayat Security G4S,
--   klaim Jan–Jun 2026). Sudah dijalankan di production; TIDAK perlu untuk
--   project baru yang datanya disalin dari project lama.
-- ═══════════════════════════════════════════════════════════════


-- ######################################################################
-- ## BAGIAN 022  (dulu: 022_security_seed_2025_2026.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 022 — Data awal modul SECURITY dari Monthly Report Security G4S
--       periode September 2026 (dijalankan SEKALI, setelah 021).
--
-- 1) Riwayat total bulanan Sep 2025 – Agu 2026 (grafik tahunan di laporan G4S)
--    → supaya grafik tren 13 bulan langsung terisi.
--    Pelanggaran transporter Mei & Jun 2026 diisi dari laporan G4S karena
--    data G-C baru lengkap mulai Juli 2026 (Juni hanya 12 laporan).
-- 2) Data lengkap September 2026 (per minggu, kejadian, patroli, dll.).
--    Tidak menimpa bila September 2026 sudah pernah diisi di aplikasi.
--
-- Bila riwayat dijalankan ulang, hanya bagian "totals" yang diperbarui;
-- input mingguan bulan tsb tidak tersentuh.
-- ═══════════════════════════════════════════════════════════════

with hist(period, totals) as (values
  ('2025-09-01'::date, '{"kary":1386,"tamu":425,"kontr":546,"motor":31965,"vis":1244,"timbang":2078,"non":363}'::jsonb),
  ('2025-10-01', '{"kary":1575,"tamu":316,"kontr":654,"motor":34491,"vis":1371,"timbang":2679,"non":562}'),
  ('2025-11-01', '{"kary":1286,"tamu":248,"kontr":626,"motor":31425,"vis":1280,"timbang":2431,"non":536}'),
  ('2025-12-01', '{"kary":1427,"tamu":252,"kontr":554,"motor":34175,"vis":966,"timbang":2562,"non":518}'),
  ('2026-01-01', '{"kary":1379,"tamu":185,"kontr":530,"motor":33898,"vis":903,"timbang":2420,"non":305}'),
  ('2026-02-01', '{"kary":1331,"tamu":213,"kontr":395,"motor":29784,"vis":692,"timbang":1861,"non":458}'),
  ('2026-03-01', '{"kary":1363,"tamu":124,"kontr":362,"motor":33148,"vis":491,"timbang":2601,"non":395}'),
  ('2026-04-01', '{"kary":1428,"tamu":215,"kontr":504,"motor":33970,"vis":741,"timbang":2645,"non":560}'),
  ('2026-05-01', '{"kary":1280,"tamu":137,"kontr":622,"motor":34238,"vis":642,"timbang":2544,"non":507,"pel":147}'),
  ('2026-06-01', '{"kary":1289,"tamu":179,"kontr":743,"motor":33579,"vis":648,"timbang":2413,"non":568,"pel":170}'),
  ('2026-07-01', '{"kary":1349,"tamu":191,"kontr":664,"motor":34723,"vis":434,"timbang":2633,"non":741}'),
  ('2026-08-01', '{"kary":1258,"tamu":260,"kontr":492,"motor":34683,"vis":476,"timbang":2537,"non":777,"biomas":418}')
)
insert into security_monthly (plant, period, data)
select 'CIK', period, jsonb_build_object('totals', totals) from hist
on conflict (plant, period) do update
  set data = jsonb_set(security_monthly.data, '{totals}', excluded.data -> 'totals', true);

insert into security_monthly (plant, period, data) values ('CIK', '2026-09-01', $json$
{
  "status": "ready",
  "veh": {
    "kary":  { "wd": [239, 298, 272, 257, 176],      "we": [25, 28, 36, 34, 0] },
    "tamu":  { "wd": [45, 57, 101, 52, 43],          "we": [2, 0, 0, 2, 0] },
    "kontr": { "wd": [60, 105, 89, 129, 71],         "we": [10, 13, 13, 26, 0] },
    "motor": { "wd": [5024, 6324, 6101, 5997, 3615], "we": [1849, 1780, 1854, 1958, 0] }
  },
  "vis":  { "wd": [67, 138, 177, 120, 67], "we": [3, 1, 0, 0, 0] },
  "team": { "Team G": 0, "External": 1, "Lingkungan": 0, "G4S": 7 },
  "teamNote": "External: BHABINSA Desa Sukamahi, PAMOBVIT, Polsek, Polres, Kodim. G4S: Supervisor Area, OH, KAM, P&D, GM, Task Force.",
  "tr":   { "wd": [359, 507, 456, 526, 304], "we": [106, 88, 78, 104, 0], "non": 828, "sel": 71, "po": 134 },
  "bio":  { "sekam": 214, "abu": 177, "wd": [3, 84, 76, 75, 52], "we": [25, 24, 19, 33, 0] },
  "kej":  { "Lingkungan": 0, "Komplain Internal": 0, "Komplain Eksternal": 0, "Security Issue": 2, "Lost & Found": 38,
            "Kerusakan Fasilitas": 5, "Kecelakaan / Sakit": 3, "Kerusakan Khusus": 0, "External Threat": 0,
            "Kejadian Lain-lain": 0, "Kegiatan Khusus": 0, "Pelanggaran KDM": 0 },
  "issues": [
    { "tgl": "2026-09-15", "kat": "Security Issue", "desc": "Body check: helper ISS membawa plastic foil tanpa surat jalan di dalam tas.", "status": "Close" },
    { "tgl": "2026-09-27", "kat": "Security Issue", "desc": "CCTV: driver PT Mitra Tata Lingkungan Baru buang air kecil sembarangan di area Alcov.", "status": "Close" },
    { "tgl": "2026-09-29", "kat": "Security Issue", "desc": "Patroli + CCTV: indikasi jual beli solar oleh driver JMM dan PT Sawargi.", "status": "Open" }
  ],
  "pat":  { "tp": 372, "ap": 371, "tc": 7560, "ac": 7320, "missed": 1, "note": "" }
}
$json$::jsonb)
on conflict (plant, period) do nothing;


-- ######################################################################
-- ## BAGIAN 023  (dulu: 023_security_riwayat_2026.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 023 — Riwayat bulanan SECURITY Januari – Agustus 2026
--       Visitor, Motor (karyawan & outsource), Mobil Karyawan,
--       Mobil Kontraktor, Mobil Tamu.
--
-- • Hanya mengisi/menimpa 5 angka ini di bagian "totals" tiap bulan.
--   Angka lain (timbang, non-timbang, biomas, pelanggaran) dan input
--   mingguan yang sudah ada TIDAK tersentuh.
-- • September 2026 tidak diisi (sudah ada data per minggu).
--   Oktober – Desember 2026 diinput lewat aplikasi tiap tanggal 1.
-- • Jalankan setelah 021. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

-- ── A. Isi Januari – Agustus 2026 ──
with v(period, vis, motor, kary, kontr, tamu) as (values
  ('2026-01-01'::date, 903, 33898, 1379, 530, 185),
  ('2026-02-01', 692, 29784, 1331, 395, 213),
  ('2026-03-01', 491, 33148, 1363, 362, 124),
  ('2026-04-01', 741, 33970, 1428, 504, 215),
  ('2026-05-01', 642, 34238, 1280, 622, 137),
  ('2026-06-01', 648, 33579, 1289, 743, 179),
  ('2026-07-01', 434, 34723, 1349, 664, 191),
  ('2026-08-01', 476, 34683, 1258, 492, 260)
)
insert into security_monthly (plant, period, data)
select 'CIK', period,
       jsonb_build_object('totals', jsonb_build_object('vis', vis, 'motor', motor, 'kary', kary, 'kontr', kontr, 'tamu', tamu))
from v
on conflict (plant, period) do update
  set data = jsonb_set(
    security_monthly.data,
    '{totals}',
    coalesce(security_monthly.data -> 'totals', '{}'::jsonb) || (excluded.data -> 'totals'),
    true
  );

-- ── B. (OPSIONAL) Hapus semua data tahun 2025 ──
-- File 022 sebelumnya ikut mengisi September – Desember 2025.
-- Hapus tanda "--" di baris delete di bawah bila 2025 ingin dihapus total.
-- Akibatnya: grafik tren hanya mulai Januari 2026, dan perbandingan
-- "vs tahun lalu" kosong sampai ada data 2026 vs 2027.
-- delete from security_monthly where plant = 'CIK' and period < '2026-01-01';

-- ── Cek hasil ──
select to_char(period, 'Mon YYYY') as bulan,
       coalesce(data -> 'totals' ->> 'vis',   'per minggu') as visitor,
       coalesce(data -> 'totals' ->> 'motor', 'per minggu') as motor,
       coalesce(data -> 'totals' ->> 'kary',  'per minggu') as mobil_karyawan,
       coalesce(data -> 'totals' ->> 'kontr', 'per minggu') as mobil_kontraktor,
       coalesce(data -> 'totals' ->> 'tamu',  'per minggu') as mobil_tamu
from security_monthly
where plant = 'CIK'
order by period;


-- ######################################################################
-- ## BAGIAN 024  (dulu: 024_claims_impor_jan_jun_2026.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 024 — Impor KLAIM DRIVER Januari – Juni 2026 (dari rekap Excel)
--
-- Isi: 477 baris rekap → 113 klaim, total Rp180.800.400.
-- Format sama dengan modul Klaim:
--   • 1 klaim = 1 driver × 1 tanggal pengajuan × 1 minggu (W1, W1.2, W2, …)
--   • tanggal periode = tanggal awal periode klaim (mis. "1 - 8 Januari" → 1 Jan)
--   • tiap baris Excel = 1 rincian klaim (jenis + nominal)
--   • jenis: TOLL→Tol, GASOLINE→Bensin, PARK→Parkir, CAR SERVICE→Servis,
--            CARWASH→Perawatan, CONDOLENCE FLOWER & OFFICE CONSUME→Lainnya
--     (keterangan asli & remark disimpan di catatan klaim)
--   • status "submitted"
--
-- Aman dijalankan ulang: klaim hasil impor ini (catatan diawali
-- [IMPOR-2026-H1]) dihapus dulu lalu dimasukkan ulang. Klaim yang diinput
-- lewat aplikasi (termasuk Juli dst.) TIDAK tersentuh.
--
-- Nama driver dicocokkan dengan master driver (tidak peka huruf besar/kecil;
-- nama pendek/panjang juga dicocokkan, mis. "Dicky Kurniadi" ↔
-- "Dicky Kurniadi Setiawan"). Baris yang drivernya tidak ditemukan DILEWATI
-- dan muncul di hasil cek paling bawah dengan status "DRIVER TIDAK DITEMUKAN".
-- ═══════════════════════════════════════════════════════════════

drop table if exists _impor_klaim;
drop table if exists _impor_peta;
create temporary table _impor_klaim (
  nama_driver text, submission_date date, period_date date, note text, items jsonb, total numeric
);

insert into _impor_klaim values
  ('Bobby Chandra', '2026-01-05'::date, '2026-01-01'::date, '[IMPOR-2026-H1] W1 · 1 - 8 Januari 2026 · cuci mobil (Rp45.000)', '[{"type": "Toll", "expr": "256500", "total": 256500}, {"type": "Toll", "expr": "210000", "total": 210000}, {"type": "Toll", "expr": "155000", "total": 155000}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}, {"type": "Parking", "expr": "40000", "total": 40000}, {"type": "Maintenance", "expr": "45000", "total": 45000}]'::jsonb, 2106500),
  ('Mohamad Amin', '2026-01-05'::date, '2026-01-01'::date, '[IMPOR-2026-H1] W1 · 1 - 8 Januari 2026', '[{"type": "Toll", "expr": "190500", "total": 190500}, {"type": "Toll", "expr": "156500", "total": 156500}, {"type": "Gasoline", "expr": "650000", "total": 650000}, {"type": "Parking", "expr": "29000", "total": 29000}]'::jsonb, 1026000),
  ('Bobby Chandra', '2026-01-05'::date, '2026-01-01'::date, '[IMPOR-2026-H1] W1.2 · 1 - 8 Januari 2026', '[{"type": "Gasoline", "expr": "2100000", "total": 2100000}, {"type": "Parking", "expr": "54000", "total": 54000}, {"type": "Toll", "expr": "324000", "total": 324000}, {"type": "Toll", "expr": "140000", "total": 140000}]'::jsonb, 2618000),
  ('Alvin Abdul Hamzah', '2026-01-05'::date, '2026-01-01'::date, '[IMPOR-2026-H1] W1 · 1 - 8 Januari 2026 · karangan bunga duka cita (Rp1.600.000)', '[{"type": "Other", "expr": "1600000", "total": 1600000}]'::jsonb, 1600000),
  ('Andriyanto Kurniawan', '2026-01-07'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026', '[{"type": "Parking", "expr": "8000", "total": 8000}, {"type": "Toll", "expr": "150500", "total": 150500}, {"type": "Toll", "expr": "100500", "total": 100500}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}]'::jsonb, 1659000),
  ('Dicky Kurniadi Setiawan', '2026-01-07'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026 · servis: nitrogen (Rp40.000)', '[{"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Gasoline", "expr": "1050000", "total": 1050000}, {"type": "Service", "expr": "40000", "total": 40000}, {"type": "Parking", "expr": "4000", "total": 4000}]'::jsonb, 1161000),
  ('Bobby Chandra', '2026-01-08'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026 · cuci mobil (Rp50.000); servis: nitrogen (Rp35.000)', '[{"type": "Parking", "expr": "31000", "total": 31000}, {"type": "Maintenance", "expr": "50000", "total": 50000}, {"type": "Toll", "expr": "198000", "total": 198000}, {"type": "Toll", "expr": "324000", "total": 324000}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}, {"type": "Service", "expr": "35000", "total": 35000}]'::jsonb, 2038000),
  ('Alvin Abdul Hamzah', '2026-01-08'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026 · karangan bunga duka cita (Rp500.000); office consume: Penambahan Cash OP : Bobby (Rp1.000.000)', '[{"type": "Other", "expr": "500000", "total": 500000}, {"type": "Other", "expr": "1000000", "total": 1000000}]'::jsonb, 1500000),
  ('Andriyanto Kurniawan', '2026-01-13'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026 · servis: nitrogen (Rp40.000)', '[{"type": "Service", "expr": "40000", "total": 40000}, {"type": "Toll", "expr": "33500", "total": 33500}, {"type": "Toll", "expr": "100000", "total": 100000}, {"type": "Toll", "expr": "100500", "total": 100500}, {"type": "Toll", "expr": "43000", "total": 43000}, {"type": "Gasoline", "expr": "860000", "total": 860000}]'::jsonb, 1177000),
  ('Dicky Kurniadi Setiawan', '2026-01-13'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026', '[{"type": "Toll", "expr": "219000", "total": 219000}, {"type": "Toll", "expr": "212000", "total": 212000}, {"type": "Gasoline", "expr": "1000000", "total": 1000000}]'::jsonb, 1431000),
  ('Mohamad Amin', '2026-01-13'::date, '2026-01-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 Januari 2026', '[{"type": "Gasoline", "expr": "600000", "total": 600000}, {"type": "Parking", "expr": "69000", "total": 69000}, {"type": "Toll", "expr": "222500", "total": 222500}, {"type": "Toll", "expr": "257000", "total": 257000}]'::jsonb, 1148500),
  ('Mohamad Amin', '2026-01-20'::date, '2026-01-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 Januari 2026', '[{"type": "Toll", "expr": "123000", "total": 123000}, {"type": "Toll", "expr": "344000", "total": 344000}, {"type": "Toll", "expr": "224000", "total": 224000}, {"type": "Parking", "expr": "9000", "total": 9000}, {"type": "Gasoline", "expr": "740000", "total": 740000}]'::jsonb, 1440000),
  ('Dicky Kurniadi Setiawan', '2026-01-20'::date, '2026-01-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 Januari 2026', '[{"type": "Toll", "expr": "108000", "total": 108000}, {"type": "Toll", "expr": "99000", "total": 99000}, {"type": "Gasoline", "expr": "1200000", "total": 1200000}]'::jsonb, 1407000),
  ('Bobby Chandra', '2026-01-20'::date, '2026-01-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 Januari 2026 · cuci mobil (Rp50.000)', '[{"type": "Toll", "expr": "99000", "total": 99000}, {"type": "Toll", "expr": "167000", "total": 167000}, {"type": "Toll", "expr": "323000", "total": 323000}, {"type": "Toll", "expr": "191000", "total": 191000}, {"type": "Parking", "expr": "46000", "total": 46000}, {"type": "Gasoline", "expr": "2100000", "total": 2100000}, {"type": "Maintenance", "expr": "50000", "total": 50000}]'::jsonb, 2976000),
  ('Alvin Abdul Hamzah', '2026-01-20'::date, '2026-01-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 Januari 2026 · karangan bunga duka cita (Rp1.600.000)', '[{"type": "Other", "expr": "1600000", "total": 1600000}]'::jsonb, 1600000),
  ('Mohamad Amin', '2026-01-23'::date, '2026-01-23'::date, '[IMPOR-2026-H1] W4 · 23 - 31 Januari 2026', '[{"type": "Gasoline", "expr": "400000", "total": 400000}, {"type": "Gasoline", "expr": "400000", "total": 400000}, {"type": "Parking", "expr": "23000", "total": 23000}, {"type": "Parking", "expr": "15000", "total": 15000}, {"type": "Toll", "expr": "95500", "total": 95500}, {"type": "Toll", "expr": "244500", "total": 244500}, {"type": "Toll", "expr": "375000", "total": 375000}, {"type": "Toll", "expr": "199000", "total": 199000}]'::jsonb, 1752000),
  ('Bobby Chandra', '2026-01-27'::date, '2026-01-23'::date, '[IMPOR-2026-H1] W4 · 23 - 31 Januari 2026 · servis: nitrogen (Rp50.000); cuci mobil (Rp45.000)', '[{"type": "Gasoline", "expr": "2100000", "total": 2100000}, {"type": "Toll", "expr": "34000", "total": 34000}, {"type": "Toll", "expr": "172500", "total": 172500}, {"type": "Toll", "expr": "347500", "total": 347500}, {"type": "Toll", "expr": "236500", "total": 236500}, {"type": "Parking", "expr": "48000", "total": 48000}, {"type": "Service", "expr": "50000", "total": 50000}, {"type": "Maintenance", "expr": "45000", "total": 45000}]'::jsonb, 3033500),
  ('Alvin Abdul Hamzah', '2026-01-27'::date, '2026-01-23'::date, '[IMPOR-2026-H1] W4 · 23 - 31 Januari 2026 · office consume: KIR Mobil B 9528 TAA (Rp350.000); karangan bunga duka cita (Rp1.000.000)', '[{"type": "Other", "expr": "350000", "total": 350000}, {"type": "Other", "expr": "1000000", "total": 1000000}]'::jsonb, 1350000),
  ('Mohamad Amin', '2026-01-29'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026', '[{"type": "Gasoline", "expr": "400000", "total": 400000}, {"type": "Gasoline", "expr": "200000", "total": 200000}, {"type": "Parking", "expr": "5000", "total": 5000}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Toll", "expr": "135500", "total": 135500}]'::jsonb, 807500),
  ('Dicky Kurniadi Setiawan', '2026-01-29'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026', '[{"type": "Gasoline", "expr": "750000", "total": 750000}, {"type": "Parking", "expr": "13000", "total": 13000}]'::jsonb, 763000),
  ('Andriyanto Kurniawan', '2026-01-29'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026', '[{"type": "Toll", "expr": "100500", "total": 100500}, {"type": "Toll", "expr": "66000", "total": 66000}, {"type": "Parking", "expr": "27000", "total": 27000}, {"type": "Gasoline", "expr": "650000", "total": 650000}]'::jsonb, 843500),
  ('Bobby Chandra', '2026-02-05'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026 · cuci mobil (Rp45.000)', '[{"type": "Toll", "expr": "133000", "total": 133000}, {"type": "Toll", "expr": "298000", "total": 298000}, {"type": "Toll", "expr": "265000", "total": 265000}, {"type": "Parking", "expr": "59000", "total": 59000}, {"type": "Maintenance", "expr": "45000", "total": 45000}, {"type": "Gasoline", "expr": "2000000", "total": 2000000}]'::jsonb, 2800000),
  ('Mohamad Amin', '2026-02-05'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026', '[{"type": "Parking", "expr": "28500", "total": 28500}, {"type": "Toll", "expr": "155000", "total": 155000}, {"type": "Gasoline", "expr": "800000", "total": 800000}]'::jsonb, 983500),
  ('Andriyanto Kurniawan', '2026-02-05'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026', '[{"type": "Gasoline", "expr": "750000", "total": 750000}, {"type": "Toll", "expr": "83500", "total": 83500}, {"type": "Parking", "expr": "14000", "total": 14000}]'::jsonb, 847500),
  ('Dicky Kurniadi Setiawan', '2026-02-05'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026 · cuci mobil (Rp50.000)', '[{"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Parking", "expr": "22000", "total": 22000}, {"type": "Gasoline", "expr": "900000", "total": 900000}, {"type": "Maintenance", "expr": "50000", "total": 50000}]'::jsonb, 1039000),
  ('Alvin Abdul Hamzah', '2026-02-05'::date, '2026-02-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 February 2026', '[{"type": "Gasoline", "expr": "300000", "total": 300000}]'::jsonb, 300000),
  ('Bobby Chandra', '2026-02-10'::date, '2026-02-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 February 2026 · cuci mobil (Rp50.000)', '[{"type": "Maintenance", "expr": "50000", "total": 50000}, {"type": "Gasoline", "expr": "1950000", "total": 1950000}, {"type": "Toll", "expr": "150000", "total": 150000}, {"type": "Toll", "expr": "251000", "total": 251000}, {"type": "Toll", "expr": "332500", "total": 332500}, {"type": "Parking", "expr": "53000", "total": 53000}]'::jsonb, 2786500),
  ('Dicky Kurniadi Setiawan', '2026-02-10'::date, '2026-02-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 February 2026', '[{"type": "Toll", "expr": "188500", "total": 188500}, {"type": "Toll", "expr": "151500", "total": 151500}, {"type": "Gasoline", "expr": "1250000", "total": 1250000}, {"type": "Parking", "expr": "9000", "total": 9000}]'::jsonb, 1599000),
  ('Andriyanto Kurniawan', '2026-02-12'::date, '2026-02-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 February 2026', '[{"type": "Parking", "expr": "18000", "total": 18000}, {"type": "Parking", "expr": "14000", "total": 14000}, {"type": "Toll", "expr": "145500", "total": 145500}, {"type": "Gasoline", "expr": "1200000", "total": 1200000}]'::jsonb, 1377500),
  ('Bobby Chandra', '2026-02-16'::date, '2026-02-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 February 2026 · cuci mobil (Rp45.000)', '[{"type": "Gasoline", "expr": "1950000", "total": 1950000}, {"type": "Toll", "expr": "723500", "total": 723500}, {"type": "Parking", "expr": "39000", "total": 39000}, {"type": "Maintenance", "expr": "45000", "total": 45000}]'::jsonb, 2757500),
  ('Dicky Kurniadi Setiawan', '2026-02-16'::date, '2026-02-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 February 2026', '[{"type": "Gasoline", "expr": "600000", "total": 600000}, {"type": "Toll", "expr": "272500", "total": 272500}, {"type": "Parking", "expr": "4000", "total": 4000}]'::jsonb, 876500),
  ('Alvin Abdul Hamzah', '2026-02-16'::date, '2026-02-15'::date, '[IMPOR-2026-H1] W3 · 15 - 22 February 2026 · karangan bunga duka cita (Rp2.050.000)', '[{"type": "Other", "expr": "2050000", "total": 2050000}]'::jsonb, 2050000),
  ('Alvin Abdul Hamzah', '2026-02-23'::date, '2026-02-23'::date, '[IMPOR-2026-H1] W4 · 23 - 28 February 2026 · office consume: Perpanjangan STNK B-1880-TZX (Rp3.362.000)', '[{"type": "Other", "expr": "3362000", "total": 3362000}]'::jsonb, 3362000),
  ('Andriyanto Kurniawan', '2026-02-23'::date, '2026-02-23'::date, '[IMPOR-2026-H1] W4 · 23 - 28 February 2026', '[{"type": "Parking", "expr": "13000", "total": 13000}, {"type": "Toll", "expr": "133500", "total": 133500}, {"type": "Gasoline", "expr": "900000", "total": 900000}]'::jsonb, 1046500),
  ('Dicky Kurniadi Setiawan', '2026-02-23'::date, '2026-02-23'::date, '[IMPOR-2026-H1] W4 · 23 - 28 February 2026', '[{"type": "Toll", "expr": "86500", "total": 86500}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 686500),
  ('Mohamad Amin', '2026-02-24'::date, '2026-02-23'::date, '[IMPOR-2026-H1] W4 · 23 - 28 February 2026', '[{"type": "Parking", "expr": "40000", "total": 40000}, {"type": "Toll", "expr": "215000", "total": 215000}, {"type": "Toll", "expr": "277000", "total": 277000}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 1132000),
  ('Bobby Chandra', '2026-02-24'::date, '2026-02-23'::date, '[IMPOR-2026-H1] W4 · 23 - 28 February 2026 · cuci mobil (Rp45.000)', '[{"type": "Gasoline", "expr": "1950000", "total": 1950000}, {"type": "Maintenance", "expr": "45000", "total": 45000}, {"type": "Parking", "expr": "79000", "total": 79000}, {"type": "Toll", "expr": "45000", "total": 45000}, {"type": "Toll", "expr": "224000", "total": 224000}, {"type": "Toll", "expr": "331000", "total": 331000}]'::jsonb, 2674000),
  ('Andriyanto Kurniawan', '2026-02-24'::date, '2026-02-23'::date, '[IMPOR-2026-H1] W4 · 23 - 28 February 2026', '[{"type": "Gasoline", "expr": "300000", "total": 300000}, {"type": "Toll", "expr": "75500", "total": 75500}, {"type": "Parking", "expr": "16000", "total": 16000}]'::jsonb, 391500),
  ('Andriyanto Kurniawan', '2026-03-02'::date, '2026-03-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 March 2026', '[{"type": "Gasoline", "expr": "700000", "total": 700000}, {"type": "Toll", "expr": "203500", "total": 203500}, {"type": "Toll", "expr": "63000", "total": 63000}, {"type": "Parking", "expr": "22000", "total": 22000}, {"type": "Parking", "expr": "20000", "total": 20000}]'::jsonb, 1008500),
  ('Dicky Kurniadi Setiawan', '2026-03-02'::date, '2026-03-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 March 2026', '[{"type": "Toll", "expr": "151500", "total": 151500}, {"type": "Gasoline", "expr": "900000", "total": 900000}, {"type": "Parking", "expr": "10000", "total": 10000}]'::jsonb, 1061500),
  ('Mohamad Amin', '2026-03-02'::date, '2026-03-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 March 2026', '[{"type": "Toll", "expr": "174500", "total": 174500}, {"type": "Toll", "expr": "164500", "total": 164500}, {"type": "Gasoline", "expr": "600000", "total": 600000}, {"type": "Parking", "expr": "52000", "total": 52000}]'::jsonb, 991000),
  ('Bobby Chandra', '2026-03-04'::date, '2026-03-01'::date, '[IMPOR-2026-H1] W1 · 1 - 7 March 2026', '[{"type": "Gasoline", "expr": "2050000", "total": 2050000}, {"type": "Toll", "expr": "232000", "total": 232000}, {"type": "Toll", "expr": "235000", "total": 235000}, {"type": "Toll", "expr": "324000", "total": 324000}, {"type": "Parking", "expr": "55000", "total": 55000}]'::jsonb, 2896000),
  ('Andriyanto Kurniawan', '2026-03-09'::date, '2026-03-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 March 2026', '[{"type": "Gasoline", "expr": "750000", "total": 750000}, {"type": "Toll", "expr": "100000", "total": 100000}, {"type": "Toll", "expr": "100000", "total": 100000}]'::jsonb, 950000),
  ('Dicky Kurniadi Setiawan', '2026-03-09'::date, '2026-03-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 March 2026 · cuci mobil (Rp60.000)', '[{"type": "Toll", "expr": "82500", "total": 82500}, {"type": "Toll", "expr": "151000", "total": 151000}, {"type": "Gasoline", "expr": "1100000", "total": 1100000}, {"type": "Parking", "expr": "24000", "total": 24000}, {"type": "Maintenance", "expr": "60000", "total": 60000}]'::jsonb, 1417500),
  ('Mohamad Amin', '2026-03-10'::date, '2026-03-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 March 2026', '[{"type": "Toll", "expr": "149000", "total": 149000}, {"type": "Toll", "expr": "135000", "total": 135000}, {"type": "Parking", "expr": "44000", "total": 44000}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 928000),
  ('Alvin Abdul Hamzah', '2026-03-11'::date, '2026-03-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 March 2026 · karangan bunga duka cita (Rp500.000)', '[{"type": "Other", "expr": "500000", "total": 500000}]'::jsonb, 500000),
  ('Bobby Chandra', '2026-03-13'::date, '2026-03-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 March 2026 · cuci mobil (Rp95.000)', '[{"type": "Maintenance", "expr": "95000", "total": 95000}, {"type": "Gasoline", "expr": "2700000", "total": 2700000}, {"type": "Parking", "expr": "99000", "total": 99000}, {"type": "Parking", "expr": "70000", "total": 70000}, {"type": "Toll", "expr": "324000", "total": 324000}, {"type": "Toll", "expr": "235000", "total": 235000}, {"type": "Toll", "expr": "288000", "total": 288000}, {"type": "Toll", "expr": "267000", "total": 267000}]'::jsonb, 4078000),
  ('Mohamad Amin', '2026-03-16'::date, '2026-03-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 March 2026', '[{"type": "Gasoline", "expr": "700000", "total": 700000}, {"type": "Toll", "expr": "130500", "total": 130500}, {"type": "Toll", "expr": "142000", "total": 142000}, {"type": "Toll", "expr": "150500", "total": 150500}, {"type": "Parking", "expr": "37000", "total": 37000}]'::jsonb, 1160000),
  ('Dicky Kurniadi Setiawan', '2026-03-16'::date, '2026-03-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 March 2026', '[{"type": "Toll", "expr": "128500", "total": 128500}, {"type": "Toll", "expr": "211500", "total": 211500}, {"type": "Gasoline", "expr": "1450000", "total": 1450000}, {"type": "Parking", "expr": "37000", "total": 37000}]'::jsonb, 1827000),
  ('Andriyanto Kurniawan', '2026-03-16'::date, '2026-03-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 March 2026', '[{"type": "Toll", "expr": "166000", "total": 166000}, {"type": "Toll", "expr": "106000", "total": 106000}, {"type": "Parking", "expr": "23000", "total": 23000}, {"type": "Gasoline", "expr": "1100000", "total": 1100000}]'::jsonb, 1395000),
  ('Alvin Abdul Hamzah', '2026-03-18'::date, '2026-03-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 March 2026 · karangan bunga duka cita (Rp500.000)', '[{"type": "Other", "expr": "500000", "total": 500000}]'::jsonb, 500000),
  ('Dicky Kurniadi Setiawan', '2026-03-24'::date, '2026-03-22'::date, '[IMPOR-2026-H1] W4 · 22 - 31 March 2026', '[{"type": "Gasoline", "expr": "1200000", "total": 1200000}, {"type": "Parking", "expr": "30000", "total": 30000}, {"type": "Toll", "expr": "63000", "total": 63000}, {"type": "Toll", "expr": "85000", "total": 85000}]'::jsonb, 1378000),
  ('Dicky Kurniadi Setiawan', '2026-03-30'::date, '2026-03-22'::date, '[IMPOR-2026-H1] W4 · 22 - 31 March 2026', '[{"type": "Gasoline", "expr": "900000", "total": 900000}, {"type": "Parking", "expr": "12000", "total": 12000}, {"type": "Toll", "expr": "100000", "total": 100000}]'::jsonb, 1012000),
  ('Bobby Chandra', '2026-03-31'::date, '2026-03-22'::date, '[IMPOR-2026-H1] W4 · 22 - 31 March 2026 · cuci mobil (Rp45.000)', '[{"type": "Maintenance", "expr": "45000", "total": 45000}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}, {"type": "Parking", "expr": "47000", "total": 47000}, {"type": "Toll", "expr": "235000", "total": 235000}, {"type": "Toll", "expr": "119000", "total": 119000}]'::jsonb, 1846000),
  ('Andriyanto Kurniawan', '2026-03-31'::date, '2026-03-22'::date, '[IMPOR-2026-H1] W4 · 22 - 31 March 2026', '[{"type": "Gasoline", "expr": "550000", "total": 550000}, {"type": "Parking", "expr": "9000", "total": 9000}, {"type": "Toll", "expr": "181000", "total": 181000}]'::jsonb, 740000),
  ('Mohamad Amin', '2026-04-02'::date, '2026-04-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 April 2026', '[{"type": "Toll", "expr": "249500", "total": 249500}, {"type": "Toll", "expr": "168000", "total": 168000}, {"type": "Toll", "expr": "116000", "total": 116000}, {"type": "Gasoline", "expr": "650000", "total": 650000}, {"type": "Parking", "expr": "63000", "total": 63000}]'::jsonb, 1246500),
  ('Dicky Kurniadi Setiawan', '2026-04-06'::date, '2026-04-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 April 2026', '[{"type": "Toll", "expr": "179000", "total": 179000}, {"type": "Toll", "expr": "132000", "total": 132000}, {"type": "Gasoline", "expr": "1100000", "total": 1100000}]'::jsonb, 1411000),
  ('Bobby Chandra', '2026-04-07'::date, '2026-04-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 April 2026 · cuci mobil (Rp45.000)', '[{"type": "Toll", "expr": "99000", "total": 99000}, {"type": "Toll", "expr": "174000", "total": 174000}, {"type": "Toll", "expr": "263500", "total": 263500}, {"type": "Gasoline", "expr": "2100000", "total": 2100000}, {"type": "Parking", "expr": "57000", "total": 57000}, {"type": "Maintenance", "expr": "45000", "total": 45000}]'::jsonb, 2738500),
  ('Andriyanto Kurniawan', '2026-04-08'::date, '2026-04-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 April 2026', '[{"type": "Gasoline", "expr": "900000", "total": 900000}, {"type": "Parking", "expr": "19000", "total": 19000}, {"type": "Toll", "expr": "163500", "total": 163500}, {"type": "Toll", "expr": "94500", "total": 94500}]'::jsonb, 1177000),
  ('Mohamad Amin', '2026-04-10'::date, '2026-04-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 April 2026', '[{"type": "Toll", "expr": "226000", "total": 226000}, {"type": "Toll", "expr": "144500", "total": 144500}, {"type": "Parking", "expr": "85000", "total": 85000}, {"type": "Gasoline", "expr": "600100", "total": 600100}]'::jsonb, 1055600),
  ('Dicky Kurniadi Setiawan', '2026-04-13'::date, '2026-04-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 April 2026', '[{"type": "Toll", "expr": "235500", "total": 235500}, {"type": "Toll", "expr": "187500", "total": 187500}, {"type": "Gasoline", "expr": "1750000", "total": 1750000}, {"type": "Parking", "expr": "17000", "total": 17000}]'::jsonb, 2190000),
  ('Bobby Chandra', '2026-04-13'::date, '2026-04-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 April 2026 · cuci mobil (Rp90.000)', '[{"type": "Toll", "expr": "221500", "total": 221500}, {"type": "Toll", "expr": "324000", "total": 324000}, {"type": "Toll", "expr": "116000", "total": 116000}, {"type": "Parking", "expr": "40000", "total": 40000}, {"type": "Maintenance", "expr": "90000", "total": 90000}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}]'::jsonb, 2191500),
  ('Andriyanto Kurniawan', '2026-04-14'::date, '2026-04-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 April 2026 · servis: NITROGEN (Rp20.000)', '[{"type": "Toll", "expr": "151000", "total": 151000}, {"type": "Toll", "expr": "136000", "total": 136000}, {"type": "Toll", "expr": "117000", "total": 117000}, {"type": "Parking", "expr": "19000", "total": 19000}, {"type": "Service", "expr": "20000", "total": 20000}, {"type": "Gasoline", "expr": "700000", "total": 700000}, {"type": "Gasoline", "expr": "850000", "total": 850000}]'::jsonb, 1993000),
  ('Mohamad Amin', '2026-04-15'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026', '[{"type": "Toll", "expr": "319000", "total": 319000}, {"type": "Toll", "expr": "239500", "total": 239500}, {"type": "Parking", "expr": "28000", "total": 28000}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 1186500),
  ('Dicky Kurniadi Setiawan', '2026-04-16'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026', '[{"type": "Toll", "expr": "252000", "total": 252000}, {"type": "Toll", "expr": "121500", "total": 121500}, {"type": "Toll", "expr": "190500", "total": 190500}, {"type": "Parking", "expr": "63000", "total": 63000}, {"type": "Gasoline", "expr": "1100000", "total": 1100000}]'::jsonb, 1727000),
  ('Bobby Chandra', '2026-04-16'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026 · cuci mobil (Rp50.000)', '[{"type": "Toll", "expr": "331000", "total": 331000}, {"type": "Toll", "expr": "444500", "total": 444500}, {"type": "Toll", "expr": "35500", "total": 35500}, {"type": "Parking", "expr": "61000", "total": 61000}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}, {"type": "Maintenance", "expr": "50000", "total": 50000}]'::jsonb, 2322000),
  ('Mohamad Amin', '2026-04-20'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026', '[{"type": "Toll", "expr": "349000", "total": 349000}, {"type": "Toll", "expr": "184500", "total": 184500}, {"type": "Toll", "expr": "226000", "total": 226000}, {"type": "Parking", "expr": "49000", "total": 49000}, {"type": "Gasoline", "expr": "900000", "total": 900000}]'::jsonb, 1708500),
  ('Andriyanto Kurniawan', '2026-04-20'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026', '[{"type": "Toll", "expr": "120500", "total": 120500}, {"type": "Toll", "expr": "177000", "total": 177000}, {"type": "Toll", "expr": "154000", "total": 154000}, {"type": "Toll", "expr": "87500", "total": 87500}, {"type": "Parking", "expr": "30000", "total": 30000}, {"type": "Gasoline", "expr": "800000", "total": 800000}]'::jsonb, 1369000),
  ('Dicky Kurniadi Setiawan', '2026-04-20'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026', '[{"type": "Toll", "expr": "235500", "total": 235500}, {"type": "Parking", "expr": "15000", "total": 15000}, {"type": "Gasoline", "expr": "1150000", "total": 1150000}]'::jsonb, 1400500),
  ('Bobby Chandra', '2026-04-22'::date, '2026-04-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 April 2026 · cuci mobil (Rp50.000)', '[{"type": "Toll", "expr": "150000", "total": 150000}, {"type": "Toll", "expr": "279000", "total": 279000}, {"type": "Toll", "expr": "168500", "total": 168500}, {"type": "Parking", "expr": "70000", "total": 70000}, {"type": "Gasoline", "expr": "1550000", "total": 1550000}, {"type": "Maintenance", "expr": "50000", "total": 50000}]'::jsonb, 2267500),
  ('Mohamad Amin', '2026-04-24'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026', '[{"type": "Toll", "expr": "226000", "total": 226000}, {"type": "Toll", "expr": "325000", "total": 325000}, {"type": "Toll", "expr": "45000", "total": 45000}, {"type": "Parking", "expr": "23000", "total": 23000}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 1219000),
  ('Andriyanto Kurniawan', '2026-04-27'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026', '[{"type": "Toll", "expr": "134000", "total": 134000}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Toll", "expr": "85500", "total": 85500}, {"type": "Toll", "expr": "108500", "total": 108500}, {"type": "Parking", "expr": "4000", "total": 4000}, {"type": "Gasoline", "expr": "1700000", "total": 1700000}]'::jsonb, 2099000),
  ('Dicky Kurniadi Setiawan', '2026-04-27'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026 · servis (Rp24.000)', '[{"type": "Toll", "expr": "160500", "total": 160500}, {"type": "Parking", "expr": "9000", "total": 9000}, {"type": "Gasoline", "expr": "1600000", "total": 1600000}, {"type": "Service", "expr": "24000", "total": 24000}]'::jsonb, 1793500),
  ('Bobby Chandra', '2026-04-27'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026', '[{"type": "Toll", "expr": "227500", "total": 227500}, {"type": "Toll", "expr": "314500", "total": 314500}, {"type": "Parking", "expr": "40000", "total": 40000}, {"type": "Gasoline", "expr": "2000000", "total": 2000000}]'::jsonb, 2582000),
  ('Mohamad Amin', '2026-04-29'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026', '[{"type": "Toll", "expr": "191000", "total": 191000}, {"type": "Toll", "expr": "274000", "total": 274000}, {"type": "Parking", "expr": "43000", "total": 43000}, {"type": "Gasoline", "expr": "700000", "total": 700000}]'::jsonb, 1208000),
  ('Alvin Abdul Hamzah', '2026-04-27'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026 · office consume (Rp300.000); gasoline: Emergency (Rp300.000)', '[{"type": "Other", "expr": "300000", "total": 300000}, {"type": "Gasoline", "expr": "300000", "total": 300000}]'::jsonb, 600000),
  ('Alvin Abdul Hamzah', '2026-04-29'::date, '2026-04-22'::date, '[IMPOR-2026-H1] W4 · 22 - 30 April 2026 · karangan bunga duka cita (Rp3.650.000)', '[{"type": "Other", "expr": "3650000", "total": 3650000}]'::jsonb, 3650000),
  ('Bobby Chandra', '2026-05-06'::date, '2026-05-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 May 2026 · cuci mobil (Rp95.000)', '[{"type": "Toll", "expr": "133000", "total": 133000}, {"type": "Toll", "expr": "324000", "total": 324000}, {"type": "Toll", "expr": "182500", "total": 182500}, {"type": "Toll", "expr": "256000", "total": 256000}, {"type": "Maintenance", "expr": "95000", "total": 95000}, {"type": "Parking", "expr": "57000", "total": 57000}, {"type": "Gasoline", "expr": "2100000", "total": 2100000}]'::jsonb, 3147500),
  ('Andriyanto Kurniawan', '2026-05-06'::date, '2026-05-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 May 2026', '[{"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Toll", "expr": "105000", "total": 105000}, {"type": "Toll", "expr": "110000", "total": 110000}, {"type": "Parking", "expr": "30000", "total": 30000}, {"type": "Gasoline", "expr": "1150000", "total": 1150000}]'::jsonb, 1462000),
  ('Dicky Kurniadi Setiawan', '2026-05-06'::date, '2026-05-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 May 2026', '[{"type": "Toll", "expr": "150000", "total": 150000}, {"type": "Gasoline", "expr": "1700000", "total": 1700000}, {"type": "Parking", "expr": "4000", "total": 4000}]'::jsonb, 1854000),
  ('Dicky Kurniadi Setiawan', '2026-05-11'::date, '2026-05-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 May 2026', '[{"type": "Toll", "expr": "152000", "total": 152000}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Gasoline", "expr": "1150000", "total": 1150000}, {"type": "Parking", "expr": "14500", "total": 14500}]'::jsonb, 1383500),
  ('Bobby Chandra', '2026-05-11'::date, '2026-05-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 May 2026 · cuci mobil (Rp100.000)', '[{"type": "Gasoline", "expr": "1400000", "total": 1400000}, {"type": "Toll", "expr": "310000", "total": 310000}, {"type": "Toll", "expr": "251500", "total": 251500}, {"type": "Toll", "expr": "17000", "total": 17000}, {"type": "Parking", "expr": "40000", "total": 40000}, {"type": "Maintenance", "expr": "100000", "total": 100000}]'::jsonb, 2118500),
  ('Mohamad Amin', '2026-05-11'::date, '2026-05-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 May 2026', '[{"type": "Toll", "expr": "99000", "total": 99000}, {"type": "Gasoline", "expr": "600000", "total": 600000}, {"type": "Parking", "expr": "55000", "total": 55000}, {"type": "Parking", "expr": "66000", "total": 66000}, {"type": "Toll", "expr": "234000", "total": 234000}]'::jsonb, 1054000),
  ('Andriyanto Kurniawan', '2026-05-13'::date, '2026-05-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 May 2026', '[{"type": "Gasoline", "expr": "800000", "total": 800000}, {"type": "Parking", "expr": "34000", "total": 34000}, {"type": "Toll", "expr": "67000", "total": 67000}]'::jsonb, 901000),
  ('Bobby Chandra', '2026-05-13'::date, '2026-05-08'::date, '[IMPOR-2026-H1] W2 · 8 - 14 May 2026 · cuci mobil (Rp50.000)', '[{"type": "Toll", "expr": "42000", "total": 42000}, {"type": "Toll", "expr": "223500", "total": 223500}, {"type": "Toll", "expr": "244000", "total": 244000}, {"type": "Parking", "expr": "34000", "total": 34000}, {"type": "Gasoline", "expr": "2100000", "total": 2100000}, {"type": "Maintenance", "expr": "50000", "total": 50000}]'::jsonb, 2693500),
  ('Mohamad Amin', '2026-05-18'::date, '2026-05-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 May 2026', '[{"type": "Parking", "expr": "28000", "total": 28000}, {"type": "Gasoline", "expr": "600000", "total": 600000}, {"type": "Toll", "expr": "181000", "total": 181000}, {"type": "Toll", "expr": "190500", "total": 190500}, {"type": "Toll", "expr": "129500", "total": 129500}]'::jsonb, 1129000),
  ('Dicky Kurniadi Setiawan', '2026-05-18'::date, '2026-05-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 May 2026', '[{"type": "Toll", "expr": "182000", "total": 182000}, {"type": "Toll", "expr": "309500", "total": 309500}, {"type": "Toll", "expr": "84000", "total": 84000}, {"type": "Gasoline", "expr": "1200000", "total": 1200000}, {"type": "Parking", "expr": "46000", "total": 46000}]'::jsonb, 1821500),
  ('Alvin Abdul Hamzah', '2026-05-19'::date, '2026-05-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 May 2026 · servis: KIR B9065TCF (Rp600.000)', '[{"type": "Service", "expr": "600000", "total": 600000}]'::jsonb, 600000),
  ('Mohamad Amin', '2026-05-21'::date, '2026-05-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 May 2026', '[{"type": "Toll", "expr": "207500", "total": 207500}, {"type": "Toll", "expr": "38500", "total": 38500}, {"type": "Toll", "expr": "409000", "total": 409000}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 1255000),
  ('Andriyanto Kurniawan', '2026-05-21'::date, '2026-05-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 May 2026', '[{"type": "Parking", "expr": "45000", "total": 45000}, {"type": "Toll", "expr": "86000", "total": 86000}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Gasoline", "expr": "1100000", "total": 1100000}]'::jsonb, 1298000),
  ('Bobby Chandra', '2026-05-18'::date, '2026-05-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 May 2026 · servis: Nitro (Rp20.000); cuci mobil (Rp95.000)', '[{"type": "Toll", "expr": "45000", "total": 45000}, {"type": "Toll", "expr": "209000", "total": 209000}, {"type": "Service", "expr": "20000", "total": 20000}, {"type": "Maintenance", "expr": "95000", "total": 95000}, {"type": "Parking", "expr": "34000", "total": 34000}, {"type": "Toll", "expr": "231000", "total": 231000}, {"type": "Gasoline", "expr": "1400000", "total": 1400000}]'::jsonb, 2034000),
  ('Dicky Kurniadi Setiawan', '2026-05-25'::date, '2026-05-22'::date, '[IMPOR-2026-H1] W4 · 22 - 29 May 2026', '[{"type": "Toll", "expr": "154000", "total": 154000}, {"type": "Gasoline", "expr": "1500000", "total": 1500000}, {"type": "Parking", "expr": "8000", "total": 8000}]'::jsonb, 1662000),
  ('Bobby Chandra', '2026-05-25'::date, '2026-05-22'::date, '[IMPOR-2026-H1] W4 · 22 - 29 May 2026 · cuci mobil (Rp50.000)', '[{"type": "Toll", "expr": "65000", "total": 65000}, {"type": "Toll", "expr": "219500", "total": 219500}, {"type": "Toll", "expr": "242500", "total": 242500}, {"type": "Toll", "expr": "251500", "total": 251500}, {"type": "Parking", "expr": "82000", "total": 82000}, {"type": "Maintenance", "expr": "50000", "total": 50000}, {"type": "Gasoline", "expr": "2100000", "total": 2100000}]'::jsonb, 3010500),
  ('Mohamad Amin', '2026-05-28'::date, '2026-05-22'::date, '[IMPOR-2026-H1] W4 · 22 - 29 May 2026', '[{"type": "Toll", "expr": "87500", "total": 87500}, {"type": "Toll", "expr": "342000", "total": 342000}, {"type": "Toll", "expr": "150500", "total": 150500}, {"type": "Parking", "expr": "19000", "total": 19000}, {"type": "Parking", "expr": "43000", "total": 43000}, {"type": "Gasoline", "expr": "780000", "total": 780000}]'::jsonb, 1422000),
  ('Andriyanto Kurniawan', '2026-05-25'::date, '2026-05-22'::date, '[IMPOR-2026-H1] W4 · 22 - 29 May 2026', '[{"type": "Toll", "expr": "64000", "total": 64000}]'::jsonb, 64000),
  ('Andriyanto Kurniawan', '2026-05-28'::date, '2026-05-22'::date, '[IMPOR-2026-H1] W4 · 22 - 29 May 2026', '[{"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Toll", "expr": "102500", "total": 102500}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Parking", "expr": "41000", "total": 41000}, {"type": "Parking", "expr": "29000", "total": 29000}, {"type": "Gasoline", "expr": "1250000", "total": 1250000}]'::jsonb, 1556500),
  ('Bobby Chandra', '2026-06-03'::date, '2026-06-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 June 2026', '[{"type": "Gasoline", "expr": "2100000", "total": 2100000}, {"type": "Parking", "expr": "67000", "total": 67000}, {"type": "Parking", "expr": "19000", "total": 19000}, {"type": "Toll", "expr": "275500", "total": 275500}, {"type": "Toll", "expr": "274500", "total": 274500}, {"type": "Toll", "expr": "244500", "total": 244500}, {"type": "Toll", "expr": "121000", "total": 121000}]'::jsonb, 3101500),
  ('Andriyanto Kurniawan', '2026-06-03'::date, '2026-06-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 June 2026', '[{"type": "Parking", "expr": "9000", "total": 9000}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Gasoline", "expr": "300000", "total": 300000}]'::jsonb, 376000),
  ('Dicky Kurniadi Setiawan', '2026-06-03'::date, '2026-06-01'::date, '[IMPOR-2026-H1] W1 · 01 - 07 June 2026', '[{"type": "Toll", "expr": "134000", "total": 134000}, {"type": "Toll", "expr": "50000", "total": 50000}, {"type": "Gasoline", "expr": "1000000", "total": 1000000}, {"type": "Parking", "expr": "12000", "total": 12000}]'::jsonb, 1196000),
  ('Alvin Abdul Hamzah', '2026-06-11'::date, '2026-06-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 June 2026 · office consume: Perpanjangan STNK B 9528 TAA (Rp2.020.800)', '[{"type": "Other", "expr": "2020800", "total": 2020800}]'::jsonb, 2020800),
  ('Mohamad Amin', '2026-06-11'::date, '2026-06-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 June 2026', '[{"type": "Toll", "expr": "335500", "total": 335500}, {"type": "Toll", "expr": "115500", "total": 115500}, {"type": "Toll", "expr": "145500", "total": 145500}, {"type": "Parking", "expr": "18000", "total": 18000}, {"type": "Gasoline", "expr": "600000", "total": 600000}, {"type": "Toll", "expr": "203500", "total": 203500}, {"type": "Toll", "expr": "68500", "total": 68500}, {"type": "Parking", "expr": "38000", "total": 38000}, {"type": "Parking", "expr": "56000", "total": 56000}, {"type": "Gasoline", "expr": "750000", "total": 750000}]'::jsonb, 2330500),
  ('Bobby Chandra', '2026-06-11'::date, '2026-06-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 June 2026', '[{"type": "Gasoline", "expr": "1400000", "total": 1400000}, {"type": "Parking", "expr": "28000", "total": 28000}, {"type": "Toll", "expr": "283000", "total": 283000}, {"type": "Toll", "expr": "256000", "total": 256000}]'::jsonb, 1967000),
  ('Andriyanto Kurniawan', '2026-06-11'::date, '2026-06-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 June 2026', '[{"type": "Gasoline", "expr": "350000", "total": 350000}, {"type": "Parking", "expr": "24000", "total": 24000}, {"type": "Toll", "expr": "41000", "total": 41000}]'::jsonb, 415000),
  ('Dicky Kurniadi Setiawan', '2026-06-11'::date, '2026-06-08'::date, '[IMPOR-2026-H1] W2 · 08 - 14 June 2026', '[{"type": "Toll", "expr": "66500", "total": 66500}, {"type": "Gasoline", "expr": "1150000", "total": 1150000}, {"type": "Parking", "expr": "21000", "total": 21000}]'::jsonb, 1237500),
  ('Bobby Chandra', '2026-06-15'::date, '2026-06-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 June 2026 · cuci mobil (Rp50.000)', '[{"type": "Gasoline", "expr": "2300000", "total": 2300000}, {"type": "Toll", "expr": "292500", "total": 292500}, {"type": "Toll", "expr": "251500", "total": 251500}, {"type": "Toll", "expr": "283500", "total": 283500}, {"type": "Maintenance", "expr": "50000", "total": 50000}, {"type": "Parking", "expr": "64000", "total": 64000}]'::jsonb, 3241500),
  ('Dicky Kurniadi Setiawan', '2026-06-15'::date, '2026-06-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 June 2026', '[{"type": "Parking", "expr": "21000", "total": 21000}, {"type": "Toll", "expr": "66500", "total": 66500}, {"type": "Gasoline", "expr": "1150000", "total": 1150000}]'::jsonb, 1237500),
  ('Alvin Abdul Hamzah', '2026-06-18'::date, '2026-06-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 June 2026 · gasoline: B9528TAA (Rp100.000)', '[{"type": "Gasoline", "expr": "100000", "total": 100000}, {"type": "Gasoline", "expr": "200000", "total": 200000}]'::jsonb, 300000),
  ('Bobby Chandra', '2026-06-18'::date, '2026-06-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 June 2026', '[{"type": "Toll", "expr": "99000", "total": 99000}, {"type": "Toll", "expr": "297500", "total": 297500}, {"type": "Gasoline", "expr": "1600000", "total": 1600000}, {"type": "Parking", "expr": "15000", "total": 15000}]'::jsonb, 2011500),
  ('Mohamad Amin', '2026-06-18'::date, '2026-06-15'::date, '[IMPOR-2026-H1] W3 · 15 - 21 June 2026', '[{"type": "Gasoline", "expr": "650000", "total": 650000}, {"type": "Toll", "expr": "341000", "total": 341000}, {"type": "Toll", "expr": "150500", "total": 150500}, {"type": "Parking", "expr": "36000", "total": 36000}]'::jsonb, 1177500),
  ('Andriyanto Kurniawan', '2026-06-22'::date, '2026-06-22'::date, '[IMPOR-2026-H1] W4 · 22 - 28 June 2026', '[{"type": "Gasoline", "expr": "900000", "total": 900000}, {"type": "Parking", "expr": "28000", "total": 28000}, {"type": "Toll", "expr": "106500", "total": 106500}, {"type": "Toll", "expr": "67000", "total": 67000}, {"type": "Toll", "expr": "60000", "total": 60000}]'::jsonb, 1161500),
  ('Dicky Kurniadi Setiawan', '2026-06-22'::date, '2026-06-22'::date, '[IMPOR-2026-H1] W4 · 22 - 28 June 2026', '[{"type": "Toll", "expr": "171500", "total": 171500}, {"type": "Toll", "expr": "220000", "total": 220000}, {"type": "Toll", "expr": "161500", "total": 161500}, {"type": "Toll", "expr": "112000", "total": 112000}, {"type": "Gasoline", "expr": "1550000", "total": 1550000}, {"type": "Parking", "expr": "48000", "total": 48000}]'::jsonb, 2263000),
  ('Bobby Chandra', '2026-06-24'::date, '2026-06-22'::date, '[IMPOR-2026-H1] W4 · 22 - 28 June 2026 · servis: Nitrogen (Rp35.000)', '[{"type": "Parking", "expr": "25000", "total": 25000}, {"type": "Toll", "expr": "276000", "total": 276000}, {"type": "Toll", "expr": "269500", "total": 269500}, {"type": "Toll", "expr": "116500", "total": 116500}, {"type": "Service", "expr": "35000", "total": 35000}, {"type": "Gasoline", "expr": "1600000", "total": 1600000}]'::jsonb, 2322000),
  ('Mohamad Amin', '2026-06-25'::date, '2026-06-22'::date, '[IMPOR-2026-H1] W4 · 22 - 28 June 2026', '[{"type": "Toll", "expr": "97500", "total": 97500}, {"type": "Toll", "expr": "260500", "total": 260500}, {"type": "Parking", "expr": "46000", "total": 46000}, {"type": "Gasoline", "expr": "600000", "total": 600000}]'::jsonb, 1004000);

-- cocokkan nama driver ke master driver
create temporary table _impor_peta as
select n.nama_driver,
       (select d.id from drivers d
         where lower(trim(d.nama)) = lower(n.nama_driver)
            or lower(trim(d.nama)) like lower(n.nama_driver) || '%'
            or lower(n.nama_driver) like lower(trim(d.nama)) || '%'
         order by (lower(trim(d.nama)) = lower(n.nama_driver)) desc, d.aktif desc, length(d.nama)
         limit 1) as driver_id
from (select distinct nama_driver from _impor_klaim) n;

begin;
-- hapus hasil impor sebelumnya (bila dijalankan ulang)
delete from claims where note like '[IMPOR-2026-H1]%';

insert into claims (driver_id, submission_date, period_date, items, total, status, note, submitted_at, plant)
select p.driver_id, k.submission_date, k.period_date, k.items, k.total, 'submitted', k.note,
       (k.submission_date::timestamp + time '09:00') at time zone 'Asia/Jakarta',
       coalesce((select d.plant from drivers d where d.id = p.driver_id), 'CIK')
from _impor_klaim k
join _impor_peta p on p.nama_driver = k.nama_driver
where p.driver_id is not null;
commit;

-- ── HASIL CEK ──
select 'TOTAL PER BULAN' as bagian,
       to_char(date_trunc('month', period_date), 'YYYY-MM') as keterangan,
       count(*) as jumlah_klaim,
       to_char(sum(total), 'FM999G999G999') as nominal
from claims where note like '[IMPOR-2026-H1]%'
group by 2
union all
select 'PER DRIVER', d.nama, count(*), to_char(sum(c.total), 'FM999G999G999')
from claims c join drivers d on d.id = c.driver_id
where c.note like '[IMPOR-2026-H1]%'
group by d.nama
union all
select 'DRIVER TIDAK DITEMUKAN', p.nama_driver,
       (select count(*) from _impor_klaim k where k.nama_driver = p.nama_driver),
       to_char((select sum(total) from _impor_klaim k where k.nama_driver = p.nama_driver), 'FM999G999G999')
from _impor_peta p where p.driver_id is null
order by 1, 2;
