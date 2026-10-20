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
