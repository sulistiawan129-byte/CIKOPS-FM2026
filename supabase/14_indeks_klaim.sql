-- 14 — Indeks tabel claims (mempercepat daftar klaim, rekap per driver, dan ringkasan Beranda)
-- Aman dijalankan berulang kali. Tidak mengubah data.

create index if not exists claims_period_date_idx     on public.claims (period_date desc);
create index if not exists claims_submission_date_idx on public.claims (submission_date desc, id desc);
create index if not exists claims_driver_period_idx   on public.claims (driver_id, period_date);
create index if not exists claims_plant_period_idx    on public.claims (plant, period_date);

analyze public.claims;
