-- ═════════════════════════════════════════════════
-- 07_KATEGORI_DRIVER — kategori driver disederhanakan jadi 2: Driver Pool dan Driver User.
--   • Tipe lama "support" (Driver Support, migrasi 030) dihapus: driver bertipe support DIJADIKAN Driver Pool
--     (sebelumnya pun menerima penugasan seperti Pool, hanya beda label).
--   • Constraint tipe driver diperketat menjadi ('operational', 'user').
--
-- URUTAN: (1) deploy aplikasi versi terbaru dulu (merge ke main), (2) baru jalankan file ini di Supabase SQL Editor.
-- Idempotent — aman diulang.
-- ═════════════════════════════════════════════════

-- 1) driver Support → Driver Pool
update drivers set driver_type = 'operational' where driver_type = 'support';

-- 2) hanya dua tipe yang diizinkan
alter table drivers drop constraint if exists drivers_driver_type_check;
alter table drivers add constraint drivers_driver_type_check check (driver_type in ('operational', 'user'));

comment on column drivers.driver_type is
  'operational (Driver Pool) | user (Driver User — On Duty otomatis 08.00–16.30 WIB, status terkunci).';

notify pgrst, 'reload schema';

-- Pemeriksaan: harus 0 baris bertipe selain dua di atas
select driver_type, count(*) as jumlah from drivers group by 1 order by 1;
