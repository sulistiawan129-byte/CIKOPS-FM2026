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
