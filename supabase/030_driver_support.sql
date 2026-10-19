-- ═══════════════════════════════════════════════════════════════
-- 030 — Tipe driver jadi 3: Driver Pool, Driver User, Driver Support
--   operational : DRIVER POOL — menerima penugasan operasional
--                 (nilai lama dipertahankan agar data yang ada tidak berubah)
--   user        : DRIVER USER — dedicated untuk 1 user, On Duty otomatis
--                 08.00–16.30 WIB, status terkunci (aturan 014 tetap berlaku)
--   support     : DRIVER SUPPORT — driver pendukung/cadangan; menerima
--                 penugasan seperti Driver Pool, hanya beda klasifikasi
-- JALANKAN di Supabase → SQL Editor SEBELUM memilih tipe Driver Support.
-- Aman dijalankan ulang (idempotent). Jalankan SESUDAH 014.
-- ═══════════════════════════════════════════════════════════════

alter table drivers drop constraint if exists drivers_driver_type_check;
alter table drivers add constraint drivers_driver_type_check
  check (driver_type in ('operational', 'user', 'support'));

comment on column drivers.driver_type is
  'operational (Driver Pool) | user (Driver User — On Duty otomatis 08.00–16.30 WIB, status terkunci) | support (Driver Support).';
