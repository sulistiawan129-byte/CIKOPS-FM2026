-- ═══════════════════════════════════════════════════════════════
-- 021 — Modul SECURITY (input bulanan dari laporan security)
--
-- • security_monthly : satu baris per bulan per plant. Kolom data (jsonb)
--     menyimpan semua input: kendaraan & visitor per minggu (WD/WE),
--     transporter, biomas, kejadian, issue area, patroli, kunjungan,
--     input manual pelanggaran (cadangan bila G-C tidak tersambung),
--     dan "totals" untuk riwayat bulan lama (grafik tren 13 bulan).
-- • security_config  : pengaturan — daftar perusahaan khusus (Becis & JMM)
--     dan nama driver yang ditautkan ke hash nomor SIM dari G-C.
-- • Akses: hanya pengguna dashboard (punya baris di tabel profiles).
--
-- Pelanggaran transporter TIDAK disimpan di sini: dibaca langsung dari G-C
-- lewat /api/gc-nc (lihat docs/SETUP-OPERASIONAL.md).
-- Idempotent. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

create table if not exists security_monthly (
  plant       text        not null default 'CIK',
  period      date        not null,               -- tanggal 1 di bulan laporan
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id) on delete set null,
  primary key (plant, period),
  constraint security_monthly_first_day check (extract(day from period) = 1)
);

create table if not exists security_config (
  key         text        primary key,
  value       jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Pengguna dashboard = punya profil di tabel profiles.
create or replace function security_is_dashboard_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;
revoke all on function security_is_dashboard_user() from public;
grant execute on function security_is_dashboard_user() to authenticated;

-- updated_at / updated_by otomatis
create or replace function security_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'security_monthly' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_security_monthly_touch on security_monthly;
create trigger trg_security_monthly_touch before insert or update on security_monthly
  for each row execute function security_touch();
drop trigger if exists trg_security_config_touch on security_config;
create trigger trg_security_config_touch before insert or update on security_config
  for each row execute function security_touch();

alter table security_monthly enable row level security;
alter table security_config  enable row level security;

drop policy if exists "security_monthly_rw" on security_monthly;
create policy "security_monthly_rw" on security_monthly
  for all to authenticated
  using (security_is_dashboard_user())
  with check (security_is_dashboard_user());

drop policy if exists "security_config_rw" on security_config;
create policy "security_config_rw" on security_config
  for all to authenticated
  using (security_is_dashboard_user())
  with check (security_is_dashboard_user());

-- Pengaturan awal: perusahaan khusus (nama PERSIS seperti di master supplier G-C).
insert into security_config (key, value)
values ('khusus_companies', '["PT. BECIS", "PT. JAYA MUKTI MANDIRI"]'::jsonb),
       ('driver_names', '{}'::jsonb)
on conflict (key) do nothing;
