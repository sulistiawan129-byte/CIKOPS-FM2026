-- ═══════════════════════════════════════════════════════════════
-- 01_DASAR — seluruh migrasi database CIKOPS yang SUDAH berjalan di production
--   (schema.sql lalu 001 … 038, digabung berurutan tanpa diubah isinya).
--
-- Production lama: TIDAK perlu dijalankan lagi. File ini arsip & acuan.
-- Project Supabase baru: paling aman salin skema dari project lama
--   (lihat docs/PANDUAN.md bab "Pindah akun"). Bila terpaksa membangun dari nol,
--   jalankan file ini utuh, lalu 02_peran_keamanan.sql.
-- Cari "## BAGIAN 0xx" untuk melompat ke migrasi tertentu.
-- ═══════════════════════════════════════════════════════════════


-- ######################################################################
-- ## BAGIAN SKEMA INTI  (dulu: schema.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
--  CIKOPS FLEET OS — SUPABASE SCHEMA v1.0
--  Pengganti Google Sheets dari sistem GAS lama.
--  Jalankan file ini di Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- Ekstensi untuk UUID & crypto (biasanya sudah aktif di Supabase)
create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────
-- 1. DRIVERS  (pengganti sheet MASTER_DRIVER)
-- ───────────────────────────────────────────────────────────────
create table if not exists drivers (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  no_hp       text,
  pin_hash    text not null default crypt('1234', gen_salt('bf')), -- default PIN 1234, di-hash
  avatar_emoji text default '🧑‍✈️',
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table drivers is 'Master data driver. PIN disimpan terenkripsi (bcrypt) — verifikasi via RPC verify_driver_pin, jangan query pin_hash langsung dari client.';

-- ───────────────────────────────────────────────────────────────
-- 2. VEHICLES  (pengganti sheet MASTER_KENDARAAN)
-- ───────────────────────────────────────────────────────────────
create table if not exists vehicles (
  id           uuid primary key default gen_random_uuid(),
  nopol        text not null unique,
  jenis        text,
  aktif        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 3. EMPLOYEES  (pengganti sheet MASTER_KARYAWAN — requestor)
-- ───────────────────────────────────────────────────────────────
create table if not exists employees (
  id           uuid primary key default gen_random_uuid(),
  nik          text,
  nama         text not null,
  departement  text,
  created_at   timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 4. JOB TYPES  (pengganti sheet MASTER_JOB)
-- ───────────────────────────────────────────────────────────────
create table if not exists job_types (
  id     uuid primary key default gen_random_uuid(),
  label  text not null unique
);

insert into job_types (label) values
  ('Employee Support'),
  ('Goods/Document Delivery'),
  ('Guest Support')
on conflict (label) do nothing;

-- ───────────────────────────────────────────────────────────────
-- 5. TASKS  (pengganti sheet TASK_DRIVER) — jantung sistem
-- ───────────────────────────────────────────────────────────────
create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  tanggal          date not null default current_date,
  driver_id        uuid references drivers(id) on delete set null,
  vehicle_id       uuid references vehicles(id) on delete set null,
  jenis_pekerjaan  text not null,
  tujuan           text not null,
  requestor        text not null,
  departement      text,
  perihal          text,
  status           text not null default 'ASSIGNED'
                     check (status in ('ASSIGNED', 'ON GOING', 'DONE', 'CANCELLED')),
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     text,              -- 'driver' atau 'admin'
  cancel_reason    text
);

create index if not exists idx_tasks_driver_tanggal on tasks (driver_id, tanggal);
create index if not exists idx_tasks_status on tasks (status);
create index if not exists idx_tasks_tanggal on tasks (tanggal);

comment on table tasks is 'Tabel utama penugasan driver. Setara TASK_DRIVER di sheet lama.';

-- ───────────────────────────────────────────────────────────────
-- 6. VIEW: tasks_detail — join siap pakai untuk frontend
--    (driver_name, kendaraan ikut tampil tanpa join manual di client)
-- ───────────────────────────────────────────────────────────────
create or replace view tasks_detail as
select
  t.id,
  t.tanggal,
  t.driver_id,
  d.nama        as driver_nama,
  d.avatar_emoji as driver_avatar,
  t.vehicle_id,
  v.nopol       as kendaraan,
  v.jenis       as kendaraan_jenis,
  t.jenis_pekerjaan,
  t.tujuan,
  t.requestor,
  t.departement,
  t.perihal,
  t.status,
  t.created_at,
  t.accepted_at,
  t.completed_at,
  t.cancelled_at,
  t.cancelled_by,
  t.cancel_reason
from tasks t
left join drivers d  on d.id = t.driver_id
left join vehicles v on v.id = t.vehicle_id;

-- ───────────────────────────────────────────────────────────────
-- 7. RPC: verify_driver_pin
--    Verifikasi PIN tanpa expose pin_hash ke client.
--    Return: driver row (tanpa pin_hash) jika cocok, null jika salah.
-- ───────────────────────────────────────────────────────────────
create or replace function verify_driver_pin(p_driver_id uuid, p_pin text)
returns table (id uuid, nama text, no_hp text, avatar_emoji text)
language plpgsql
security definer
as $$
begin
  if exists (
    select 1 from drivers
    where drivers.id = p_driver_id
      and drivers.pin_hash = crypt(p_pin, drivers.pin_hash)
      and drivers.aktif = true
  ) then
    return query
      select drivers.id, drivers.nama, drivers.no_hp, drivers.avatar_emoji
      from drivers where drivers.id = p_driver_id;
  end if;
  return;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 8. RPC: set_driver_pin
--    Ganti PIN driver (dipanggil dari halaman profil driver).
-- ───────────────────────────────────────────────────────────────
create or replace function set_driver_pin(p_driver_id uuid, p_old_pin text, p_new_pin text)
returns boolean
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from drivers
    where id = p_driver_id and pin_hash = crypt(p_old_pin, pin_hash)
  ) then
    return false;
  end if;

  update drivers
    set pin_hash = crypt(p_new_pin, gen_salt('bf'))
    where id = p_driver_id;

  return true;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 9. RPC: accept_task / complete_task
--    Mengunci transisi status agar tidak bisa di-skip dari client.
-- ───────────────────────────────────────────────────────────────
create or replace function accept_task(p_task_id uuid, p_driver_id uuid)
returns tasks_detail
language plpgsql
security definer
as $$
declare
  result tasks_detail;
begin
  update tasks
    set status = 'ON GOING', accepted_at = now()
    where id = p_task_id
      and driver_id = p_driver_id
      and status = 'ASSIGNED';

  if not found then
    raise exception 'Task tidak dapat diterima (status bukan ASSIGNED atau bukan milik driver ini)';
  end if;

  select * into result from tasks_detail where id = p_task_id;
  return result;
end;
$$;

create or replace function complete_task(p_task_id uuid, p_driver_id uuid)
returns tasks_detail
language plpgsql
security definer
as $$
declare
  result tasks_detail;
begin
  update tasks
    set status = 'DONE', completed_at = now()
    where id = p_task_id
      and driver_id = p_driver_id
      and status = 'ON GOING'
  ;

  if not found then
    raise exception 'Task tidak dapat diselesaikan (status bukan ON GOING atau bukan milik driver ini)';
  end if;

  select * into result from tasks_detail where id = p_task_id;
  return result;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 9b. RPC: cancel_task
--     Driver membatalkan tugas miliknya sendiri (status ASSIGNED/ON GOING saja).
--     Admin/dashboard membatalkan langsung lewat update tabel (lihat policy di bawah),
--     tidak lewat RPC ini karena admin tidak terbatas pada driver_id tertentu.
-- ───────────────────────────────────────────────────────────────
create or replace function cancel_task(p_task_id uuid, p_driver_id uuid, p_reason text default null)
returns tasks_detail
language plpgsql
security definer
as $$
declare
  result tasks_detail;
begin
  update tasks
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'driver', cancel_reason = p_reason
    where id = p_task_id
      and driver_id = p_driver_id
      and status in ('ASSIGNED', 'ON GOING')
  ;

  if not found then
    raise exception 'Task tidak dapat dibatalkan (status sudah final atau bukan milik driver ini)';
  end if;

  select * into result from tasks_detail where id = p_task_id;
  return result;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY
--     Karena tidak ada Supabase Auth (login via PIN custom),
--     kita pakai anon key dengan RLS terbuka untuk read,
--     tapi write (insert/update task) dibatasi ke RPC function di atas.
-- ───────────────────────────────────────────────────────────────
alter table drivers enable row level security;
alter table vehicles enable row level security;
alter table employees enable row level security;
alter table job_types enable row level security;
alter table tasks enable row level security;

-- Drivers: boleh dibaca semua (untuk landing page pilih driver),
-- tapi pin_hash tidak pernah di-select langsung oleh client (lihat catatan di app).
drop policy if exists "drivers_select_all" on drivers;
create policy "drivers_select_all" on drivers for select using (true);

drop policy if exists "vehicles_select_all" on vehicles;
create policy "vehicles_select_all" on vehicles for select using (true);

drop policy if exists "employees_select_all" on employees;
create policy "employees_select_all" on employees for select using (true);

drop policy if exists "job_types_select_all" on job_types;
create policy "job_types_select_all" on job_types for select using (true);

-- Tasks: read terbuka (driver & admin perlu baca semua untuk dashboard).
drop policy if exists "tasks_select_all" on tasks;
create policy "tasks_select_all" on tasks for select using (true);

-- Tasks: insert hanya dari dashboard admin (tanpa auth khusus saat ini,
-- dibuka untuk anon key — amankan lebih lanjut dengan Supabase Auth jika perlu).
drop policy if exists "tasks_insert_all" on tasks;
create policy "tasks_insert_all" on tasks for insert with check (true);

drop policy if exists "tasks_update_all" on tasks;
create policy "tasks_update_all" on tasks for update using (true);

-- Vehicles/Employees/JobTypes: izinkan insert dari dashboard (master data management).
drop policy if exists "vehicles_insert_all" on vehicles;
create policy "vehicles_insert_all" on vehicles for insert with check (true);

drop policy if exists "employees_insert_all" on employees;
create policy "employees_insert_all" on employees for insert with check (true);

drop policy if exists "drivers_insert_all" on drivers;
create policy "drivers_insert_all" on drivers for insert with check (true);

-- ───────────────────────────────────────────────────────────────
-- 11. REALTIME
--     Aktifkan replication untuk tabel tasks agar driver panel
--     & dashboard menerima update otomatis (Supabase Realtime).
-- ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table tasks;

-- ───────────────────────────────────────────────────────────────
-- 12. SAMPLE DATA (opsional — hapus/comment jika tidak perlu)
-- ───────────────────────────────────────────────────────────────
insert into drivers (nama, no_hp, avatar_emoji) values
  ('Budi Santoso', '081234567890', '🧑‍✈️'),
  ('Siti Aminah',  '081234567891', '👨‍✈️'),
  ('Ahmad Yani',   '081234567892', '🧑‍🔧')
on conflict do nothing;

insert into vehicles (nopol, jenis) values
  ('B 1234 XYZ', 'Toyota Avanza'),
  ('D 5678 ABC', 'Toyota Innova'),
  ('B 9999 DEF', 'Daihatsu Xenia')
on conflict (nopol) do nothing;

insert into employees (nik, nama, departement) values
  ('001', 'John Doe',    'IT'),
  ('002', 'Jane Smith',  'HR'),
  ('003', 'Bob Johnson', 'Finance')
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════
--  SELESAI. Semua default PIN driver = 1234 (ganti via app nanti).
-- ═══════════════════════════════════════════════════════════════


-- ######################################################################
-- ## BAGIAN 001  (dulu: 001_fleetos_core_tables_RECOVERY.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- Migration 001 (RECOVERY): FleetOS core tables
--
-- The original migration files that created these tables (when
-- FleetOS was first merged into this driver-assignment system) went
-- missing from the project folder somewhere along the way. This is a
-- reconstruction based on what the actual TypeScript code (types.ts /
-- api.ts) expects to exist — the live database most likely already
-- has all of this (since Claims/Overtime/Gas Stations have been
-- working in testing), but if you're ever setting up a FRESH Supabase
-- project from this codebase, you need this file to exist.
--
-- Everything here uses `if not exists` / `if not exists` column
-- guards, so it's safe to run even against a database that already
-- has some or all of this — it will not error or duplicate anything.
-- ═══════════════════════════════════════════════════════════════

-- ── Extend existing shared tables (vehicles, drivers) ──
alter table vehicles add column if not exists year int;
alter table vehicles add column if not exists color text;
alter table vehicles add column if not exists fuel text;
alter table vehicles add column if not exists odometer numeric default 0;
alter table vehicles add column if not exists kir_date date;
alter table vehicles add column if not exists service_date date;
alter table vehicles add column if not exists stnk_date date;
alter table vehicles add column if not exists dept text;
alter table vehicles add column if not exists default_driver_id uuid references drivers(id);
alter table vehicles add column if not exists updated_at timestamptz default now();
alter table vehicles add column if not exists updated_by uuid references auth.users(id);

alter table drivers add column if not exists email text;
alter table drivers add column if not exists updated_at timestamptz default now();
alter table drivers add column if not exists updated_by uuid references auth.users(id);

-- ── profiles — admin/GA accounts (Supabase Auth), separate from the
-- driver PIN system ──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'ga' check (role in ('admin', 'ga')),
  created_at timestamptz not null default now()
);
alter table drivers add column if not exists tier_id uuid;

-- Auto-create a profile row (default role 'ga') whenever a new
-- Supabase Auth user signs up — lets an admin create accounts via the
-- Supabase Dashboard and immediately have a usable profile.
create or replace function handle_new_admin_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'ga')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_admin_user();

-- ── driver_tiers — operational allowance tiers ──
create table if not exists driver_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3d6ff2',
  amount_per_month numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table drivers add constraint drivers_tier_id_fkey
  foreign key (tier_id) references driver_tiers(id) on delete set null;

-- View: derived active-driver-count per tier (never stored directly)
create or replace view driver_tier_summary as
select
  t.id, t.name, t.color, t.amount_per_month,
  count(d.id) filter (where d.aktif) as active_driver_count
from driver_tiers t
left join drivers d on d.tier_id = t.id
group by t.id, t.name, t.color, t.amount_per_month;

-- ── claims ──
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  submission_date date not null,
  period_date date not null,
  items jsonb not null default '[]',
  total numeric not null default 0,
  status text not null default 'submitted',
  note text default '',
  submitted_at timestamptz not null default now()
);

-- ── overtime ──
create table if not exists overtime (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  period text not null, -- "YYYY-MM"
  plant text not null check (plant in ('CIK', 'PRB')),
  hours numeric not null default 0,
  amount numeric not null default 0,
  reason text default '',
  created_at timestamptz not null default now()
);

-- ── kantong (Dana Operasional) — period-keyed, one row per month ──
create table if not exists kantong (
  id uuid primary key default gen_random_uuid(),
  period text not null unique, -- "YYYY-MM"
  total_budget numeric not null default 0,
  alloc_op_driver numeric not null default 0,
  alloc_emergency numeric not null default 0,
  cash_available numeric not null default 0,
  claim_submitted numeric not null default 0,
  claim_paid numeric not null default 0,
  last_reset date not null default current_date
);

create or replace view current_kantong as
select * from kantong order by period desc limit 1;

-- ── gas_stations ──
create table if not exists gas_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text default '',
  lat numeric not null,
  lng numeric not null,
  fuels jsonb not null default '[]',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS — enable + open policies (select/insert/update), matching the
-- permissive pattern used throughout this internal-tool app. DELETE
-- policies are handled separately in migration 006 (which is the fix
-- for the actual reported bug) so they stay in one place.
-- ═══════════════════════════════════════════════════════════════

alter table profiles enable row level security;
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (true);

alter table driver_tiers enable row level security;
drop policy if exists "driver_tiers_select_all" on driver_tiers;
create policy "driver_tiers_select_all" on driver_tiers for select using (true);
drop policy if exists "driver_tiers_insert_all" on driver_tiers;
create policy "driver_tiers_insert_all" on driver_tiers for insert with check (true);
drop policy if exists "driver_tiers_update_all" on driver_tiers;
create policy "driver_tiers_update_all" on driver_tiers for update using (true);

alter table claims enable row level security;
drop policy if exists "claims_select_all" on claims;
create policy "claims_select_all" on claims for select using (true);
drop policy if exists "claims_insert_all" on claims;
create policy "claims_insert_all" on claims for insert with check (true);

alter table overtime enable row level security;
drop policy if exists "overtime_select_all" on overtime;
create policy "overtime_select_all" on overtime for select using (true);
drop policy if exists "overtime_insert_all" on overtime;
create policy "overtime_insert_all" on overtime for insert with check (true);
drop policy if exists "overtime_update_all" on overtime;
create policy "overtime_update_all" on overtime for update using (true);

alter table kantong enable row level security;
drop policy if exists "kantong_select_all" on kantong;
create policy "kantong_select_all" on kantong for select using (true);
drop policy if exists "kantong_insert_all" on kantong;
create policy "kantong_insert_all" on kantong for insert with check (true);
drop policy if exists "kantong_update_all" on kantong;
create policy "kantong_update_all" on kantong for update using (true);

alter table gas_stations enable row level security;
drop policy if exists "gas_stations_select_all" on gas_stations;
create policy "gas_stations_select_all" on gas_stations for select using (true);
drop policy if exists "gas_stations_insert_all" on gas_stations;
create policy "gas_stations_insert_all" on gas_stations for insert with check (true);
drop policy if exists "gas_stations_update_all" on gas_stations;
create policy "gas_stations_update_all" on gas_stations for update using (true);


-- ######################################################################
-- ## BAGIAN 003  (dulu: 003_admin_driver_pin.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Admin driver PIN management
--
-- The existing `set_driver_pin` RPC requires the OLD pin to match
-- before allowing a change — correct for a driver changing their own
-- PIN from their profile screen, but useless for:
--   (a) setting an initial PIN when an admin creates a brand-new
--       driver (pin_hash is NULL, so no "old pin" can ever match), and
--   (b) an admin resetting a driver's PIN after they forget it.
--
-- This adds a second RPC, callable only by an authenticated admin/GA
-- user (via the profiles table), that sets a driver's PIN directly.
-- ═══════════════════════════════════════════════════════════════

create or replace function admin_set_driver_pin(p_driver_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid()
  ) then
    raise exception 'Only admin/GA users can set a driver PIN directly';
  end if;

  if p_new_pin is null or length(p_new_pin) < 4 then
    raise exception 'PIN must be at least 4 digits';
  end if;

  update drivers
    set pin_hash = crypt(p_new_pin, gen_salt('bf'))
    where id = p_driver_id;
end;
$$;


-- ######################################################################
-- ## BAGIAN 004  (dulu: 004_app_settings.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- Migration 004: App settings (key-value) + manager email default
--
-- Needed for the Claims email notification feature: lets an admin
-- configure which manager email address receives a copy of every
-- submitted claim, without hardcoding it in the frontend.
-- ═══════════════════════════════════════════════════════════════

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists "app_settings_select_all" on app_settings;
create policy "app_settings_select_all" on app_settings for select using (true);

drop policy if exists "app_settings_upsert_authenticated" on app_settings;
create policy "app_settings_upsert_authenticated" on app_settings
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed the manager_email key (empty by default — admin fills it in via
-- the Master Data / Settings UI before claim emails will be cc'd to a manager).
insert into app_settings (key, value)
values ('manager_email', '')
on conflict (key) do nothing;


-- ######################################################################
-- ## BAGIAN 005  (dulu: 005_remove_nik.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Remove NIK (national ID number) from employees
--
-- Internal policy decision: this system should never store NIK
-- (Nomor Induk Kependudukan), even though full names are fine to
-- keep. This permanently drops the column and any values already
-- stored in it — this cannot be undone, so make sure that's really
-- what you want before running it.
-- ═══════════════════════════════════════════════════════════════

alter table employees drop column if exists nik;


-- ######################################################################
-- ## BAGIAN 006  (dulu: 006_fix_delete_policies.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- Migration 006: Fix missing DELETE policies (root cause of
-- "delete button does nothing" across the app)
--
-- Supabase/Postgres RLS behavior that causes this bug: if a table has
-- RLS enabled but NO policy for DELETE, a `delete().eq('id', x)` call
-- from the JS client does NOT throw an error — it just matches zero
-- rows (RLS silently filters everything out) and returns success.
-- The UI closes the confirm dialog like nothing went wrong, but the
-- row is still sitting right there in the table.
--
-- This was traced to migrations 001/002 (created earlier when the
-- FleetOS tables were first merged in) being missing from this
-- project folder — so depending on what actually got run against the
-- live database, some or all of these tables may never have gotten a
-- DELETE policy at all. This migration is idempotent (safe to run
-- even if some policies already exist) and re-establishes all of them
-- in one place, so the fix doesn't depend on finding those old files.
--
-- Design: `vehicles` and `drivers` are shared with the original
-- driver-assignment app, so delete stays admin-only (matching the
-- original intent). Every FleetOS-exclusive table (claims, overtime,
-- driver_tiers, gas_stations, employees, job_types) and `tasks` get
-- open delete for any authenticated user, consistent with how this
-- internal tool already handles insert/update everywhere else.
-- ═══════════════════════════════════════════════════════════════

-- ── Admin-only delete: shared tables ──
drop policy if exists "vehicles_delete_admin" on vehicles;
create policy "vehicles_delete_admin" on vehicles for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists "drivers_delete_admin" on drivers;
create policy "drivers_delete_admin" on drivers for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Also make sure UPDATE exists for these two (needed for editing
-- vehicle/driver records — same silent-failure risk as DELETE).
drop policy if exists "vehicles_update_authenticated" on vehicles;
create policy "vehicles_update_authenticated" on vehicles for update using (auth.role() = 'authenticated');

drop policy if exists "drivers_update_authenticated" on drivers;
create policy "drivers_update_authenticated" on drivers for update using (auth.role() = 'authenticated');

-- ── Open delete: FleetOS-exclusive tables ──
drop policy if exists "claims_delete_authenticated" on claims;
create policy "claims_delete_authenticated" on claims for delete using (auth.role() = 'authenticated');

drop policy if exists "overtime_delete_authenticated" on overtime;
create policy "overtime_delete_authenticated" on overtime for delete using (auth.role() = 'authenticated');

drop policy if exists "driver_tiers_delete_authenticated" on driver_tiers;
create policy "driver_tiers_delete_authenticated" on driver_tiers for delete using (auth.role() = 'authenticated');

drop policy if exists "gas_stations_delete_authenticated" on gas_stations;
create policy "gas_stations_delete_authenticated" on gas_stations for delete using (auth.role() = 'authenticated');

-- ── Open delete: original driver-assignment tables that were never
-- given a delete policy at all ──
drop policy if exists "tasks_delete_authenticated" on tasks;
create policy "tasks_delete_authenticated" on tasks for delete using (auth.role() = 'authenticated');

drop policy if exists "employees_delete_authenticated" on employees;
create policy "employees_delete_authenticated" on employees for delete using (auth.role() = 'authenticated');

drop policy if exists "job_types_delete_authenticated" on job_types;
create policy "job_types_delete_authenticated" on job_types for delete using (auth.role() = 'authenticated');

-- Also missing entirely from schema.sql: UPDATE for employees/job_types
-- (only tasks/vehicles/drivers had update policies before).
drop policy if exists "employees_update_authenticated" on employees;
create policy "employees_update_authenticated" on employees for update using (auth.role() = 'authenticated');

drop policy if exists "job_types_update_authenticated" on job_types;
create policy "job_types_update_authenticated" on job_types for update using (auth.role() = 'authenticated');


-- ######################################################################
-- ## BAGIAN 007  (dulu: 007_canteen_reports.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- Migration 007: Canteen reports (merged from the standalone
-- GAS/Google Sheets-based Canteen Ops system)
--
-- One row per date, with per-shift (1/2/3) order + leftover numbers
-- for both Snack and Meal categories — "consumed" is always derived
-- (order − leftover) at query time, never stored, exactly matching
-- how the original system worked.
-- ═══════════════════════════════════════════════════════════════

create table if not exists canteen_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,

  snack_order_1 numeric not null default 0,
  snack_order_2 numeric not null default 0,
  snack_order_3 numeric not null default 0,
  snack_leftover_1 numeric not null default 0,
  snack_leftover_2 numeric not null default 0,
  snack_leftover_3 numeric not null default 0,

  meal_order_1 numeric not null default 0,
  meal_order_2 numeric not null default 0,
  meal_order_3 numeric not null default 0,
  meal_leftover_1 numeric not null default 0,
  meal_leftover_2 numeric not null default 0,
  meal_leftover_3 numeric not null default 0,

  submitted_by text default '',
  created_at timestamptz not null default now()
);

alter table canteen_reports enable row level security;

drop policy if exists "canteen_reports_select_all" on canteen_reports;
create policy "canteen_reports_select_all" on canteen_reports for select using (true);

drop policy if exists "canteen_reports_insert_all" on canteen_reports;
create policy "canteen_reports_insert_all" on canteen_reports for insert with check (true);

drop policy if exists "canteen_reports_update_all" on canteen_reports;
create policy "canteen_reports_update_all" on canteen_reports for update using (true);

drop policy if exists "canteen_reports_delete_authenticated" on canteen_reports;
create policy "canteen_reports_delete_authenticated" on canteen_reports for delete using (auth.role() = 'authenticated');

-- One report per date — re-submitting the same date updates it instead
-- of creating a duplicate (upsert pattern), matching the original
-- system's "Save Report" behavior for a given day.
create unique index if not exists canteen_reports_date_idx on canteen_reports(report_date);


-- ######################################################################
-- ## BAGIAN 008  (dulu: 008_kantong_plant_and_unsubmitted_claim_RECOVERY.sql)
-- ######################################################################

-- ════════════════════════════════════════════════════════════
-- 008_kantong_plant_and_unsubmitted_claim_RECOVERY.sql
--
-- RECOVERY migration, same reason as 001_..._RECOVERY.sql: the original
-- migration that added multi-plant support and the "Unsubmitted Claim (A7)"
-- field to Dana Operasional (kantong) was lost from this repo before it
-- could be committed. This reconstructs it from what src/lib/api.ts and
-- src/app/dashboard/page.tsx (OpFundTab) actually expect at runtime:
--
--   • a "plant" column ('CIK' | 'PRB') — every kantong query filters by it
--   • an "unsubmitted_claim" column      — read/written by updateKantongBudget()
--   • a UNIQUE constraint on (period, plant), not on period alone — two
--     plants must be able to have a row for the same month
--   • a get_current_kantong(p_plant) RPC — called by getCurrentKantong()
--     every time the Operational Fund tab loads, but never defined in SQL
--
-- Safe to run multiple times.
-- ════════════════════════════════════════════════════════════

-- ── plant column ──
alter table kantong add column if not exists plant text not null default 'CIK';
alter table kantong drop constraint if exists kantong_plant_check;
alter table kantong add constraint kantong_plant_check check (plant in ('CIK', 'PRB'));

-- ── unsubmitted_claim column (the A7 field) ──
alter table kantong add column if not exists unsubmitted_claim numeric not null default 0;

-- ── fix the unique constraint: was on period alone, must be (period, plant)
--    so CIK and PRB can each have their own row for the same month ──
alter table kantong drop constraint if exists kantong_period_key;
drop index if exists kantong_period_key;
alter table kantong drop constraint if exists kantong_period_plant_key;
alter table kantong add constraint kantong_period_plant_key unique (period, plant);

-- ── refresh the view to reflect the new columns / one row per plant ──
create or replace view current_kantong as
select distinct on (plant) *
from kantong
order by plant, period desc;

-- ── the RPC the frontend actually calls: latest row for a given plant ──
-- Dropped first (not just CREATE OR REPLACE) because Postgres refuses to
-- replace a function whose return type differs from what's already there,
-- which happens if an older/partial version of this function already
-- exists in the database with a different signature.
drop function if exists get_current_kantong(text);

create function get_current_kantong(p_plant text)
returns setof kantong
language sql
stable
as $$
  select *
  from kantong
  where plant = p_plant
  order by period desc
  limit 1;
$$;


-- ######################################################################
-- ## BAGIAN 009  (dulu: 009_condolence_wreaths.sql)
-- ######################################################################

-- ════════════════════════════════════════════════════════════
-- 009_condolence_wreaths.sql
--
-- "Karangan Bunga Duka Cita" — condolence flower wreath records.
-- Tracked separately from the "claims" table because a wreath isn't
-- tied to a driver or an expense line item — it's a one-off event
-- (date + on whose behalf) that just needs a claim-submitted status
-- and its own report, independent of the regular fuel/toll claim flow.
--
-- Safe to run multiple times.
-- ════════════════════════════════════════════════════════════

create table if not exists condolence_wreaths (
  id uuid primary key default gen_random_uuid(),
  plant text not null check (plant in ('CIK', 'PRB')),
  tanggal date not null,
  atas_nama text not null,
  keterangan text default '',
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists condolence_wreaths_plant_tanggal_idx
  on condolence_wreaths (plant, tanggal desc);

alter table condolence_wreaths enable row level security;

drop policy if exists "condolence_wreaths_select_all" on condolence_wreaths;
create policy "condolence_wreaths_select_all" on condolence_wreaths for select using (true);

drop policy if exists "condolence_wreaths_insert_all" on condolence_wreaths;
create policy "condolence_wreaths_insert_all" on condolence_wreaths for insert with check (true);

drop policy if exists "condolence_wreaths_update_all" on condolence_wreaths;
create policy "condolence_wreaths_update_all" on condolence_wreaths for update using (true);

drop policy if exists "condolence_wreaths_delete_all" on condolence_wreaths;
create policy "condolence_wreaths_delete_all" on condolence_wreaths for delete using (true);

-- Register with realtime, same as other live-updating tables (tasks) —
-- keeps the Claims tab's wreath list in sync across open sessions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'condolence_wreaths'
  ) then
    alter publication supabase_realtime add table condolence_wreaths;
  end if;
end $$;


-- ######################################################################
-- ## BAGIAN 013  (dulu: 013_gift_distribution.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
--  Migration 013: Sistem Pembagian Gift / Seragam / dll
--  Jalankan di Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabel event pembagian
create table if not exists gift_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- Item dan variannya disimpan sebagai JSON array
  -- contoh: [{"name":"Seragam","variants":["S","M","L","XL"]},{"name":"Sepatu","variants":["39","40","41","42"]}]
  items       jsonb not null default '[]',
  status      text not null default 'open' check (status in ('open','closed')),
  plant       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Tabel pendaftaran karyawan
create table if not exists gift_registrations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references gift_events(id) on delete cascade,
  nik         text not null,
  nama        text not null,
  departemen  text not null,
  email       text not null,
  -- Pilihan item: [{"item":"Seragam","variant":"L"},{"item":"Sepatu","variant":"41"}]
  selections  jsonb not null default '[]',
  -- Passcode di-hash pakai pgcrypto (tidak pernah tersimpan plaintext)
  passcode_hash text not null,
  -- Status pengambilan
  claimed     boolean not null default false,
  claimed_at  timestamptz,
  claimed_by  text,  -- nama petugas yang memproses
  registered_at timestamptz not null default now(),
  -- Satu NIK hanya bisa daftar sekali per event
  unique (event_id, nik)
);

-- 3. Aktifkan RLS
alter table gift_events enable row level security;
alter table gift_registrations enable row level security;

-- gift_events: read public (supaya halaman /gift bisa tampilkan daftar event)
-- write hanya authenticated (admin)
create policy "gift_events_select_public" on gift_events
  for select using (true);
create policy "gift_events_write_admin" on gift_events
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- gift_registrations: insert public (karyawan daftar tanpa login)
-- select/update terbuka (petugas /gift/verify perlu baca dan update status)
-- delete hanya admin
create policy "gift_reg_insert_public" on gift_registrations
  for insert with check (true);
create policy "gift_reg_select_public" on gift_registrations
  for select using (true);
create policy "gift_reg_update_public" on gift_registrations
  for update using (true) with check (true);
create policy "gift_reg_delete_admin" on gift_registrations
  for delete using (auth.role() = 'authenticated');

-- 4. RPC: verifikasi passcode (security definer supaya hash tidak ter-expose)
create or replace function public.verify_gift_passcode(p_passcode text)
returns table (
  id uuid, event_id uuid, event_name text,
  nik text, nama text, departemen text, email text,
  selections jsonb, claimed boolean, claimed_at timestamptz,
  claimed_by text, registered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      r.id, r.event_id, e.name as event_name,
      r.nik, r.nama, r.departemen, r.email,
      r.selections, r.claimed, r.claimed_at,
      r.claimed_by, r.registered_at
    from gift_registrations r
    join gift_events e on e.id = r.event_id
    where r.passcode_hash = crypt(p_passcode, r.passcode_hash);
end;
$$;

grant execute on function public.verify_gift_passcode(text) to anon, authenticated;

-- 5. RPC: generate passcode hash (8 digit angka) + simpan registrasi
--    Dikerjakan server-side supaya passcode PLAINTEXT tidak pernah masuk DB
create or replace function public.create_gift_registration(
  p_event_id  uuid,
  p_nik       text,
  p_nama      text,
  p_departemen text,
  p_email     text,
  p_selections jsonb,
  p_passcode  text  -- 8-digit, generated di client tapi di-hash di sini
)
returns table (success boolean, error_code text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cek event masih open
  if not exists (
    select 1 from gift_events where id = p_event_id and status = 'open'
  ) then
    return query select false, 'EVENT_CLOSED';
    return;
  end if;

  -- Cek NIK belum daftar di event ini
  if exists (
    select 1 from gift_registrations where event_id = p_event_id and nik = p_nik
  ) then
    return query select false, 'ALREADY_REGISTERED';
    return;
  end if;

  -- Insert dengan hash passcode
  insert into gift_registrations (
    event_id, nik, nama, departemen, email,
    selections, passcode_hash
  ) values (
    p_event_id, p_nik, p_nama, p_departemen, p_email,
    p_selections, crypt(p_passcode, gen_salt('bf', 8))
  );

  return query select true, '';
end;
$$;

grant execute on function public.create_gift_registration(uuid, text, text, text, text, jsonb, text) to anon, authenticated;

-- 6. Pastikan pgcrypto aktif (butuh untuk crypt/gen_salt)
create extension if not exists pgcrypto;


-- ######################################################################
-- ## BAGIAN 014  (dulu: 014_driver_type.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 014 — Tipe driver: Operational vs User
--   operational : driver yang ditugaskan untuk penugasan operasional
--   user        : driver pribadi/dedicated untuk seorang "user"
--                 (mis. direksi). Otomatis ON DUTY 08.00–16.30 WIB setiap
--                 hari; statusnya terkunci dan tidak ikut penugasan.
-- JALANKAN SEKALI di Supabase → SQL Editor, SEBELUM deploy kode baru.
-- Aman dijalankan ulang (idempotent).
-- ═══════════════════════════════════════════════════════════════

alter table drivers add column if not exists driver_type text not null default 'operational';
alter table drivers add column if not exists assigned_user text;        -- nama user yang diantar
alter table drivers add column if not exists assigned_user_title text;  -- jabatan / keterangan (opsional)

alter table drivers drop constraint if exists drivers_driver_type_check;
alter table drivers add constraint drivers_driver_type_check
  check (driver_type in ('operational', 'user'));

comment on column drivers.driver_type is 'operational | user. Driver user = On Duty otomatis 08.00–16.30 WIB, status terkunci.';
comment on column drivers.assigned_user is 'Nama user yang diantar oleh driver bertipe user.';

-- Dipakai aplikasi driver (sesi login driver tidak selalu bisa SELECT langsung
-- ke tabel drivers karena RLS — pola sama dengan get_driver_by_email).
create or replace function get_driver_duty_info(p_driver_id uuid)
returns table (driver_type text, assigned_user text, assigned_user_title text)
language sql
security definer
set search_path = public
as $$
  select d.driver_type, d.assigned_user, d.assigned_user_title
  from drivers d
  where d.id = p_driver_id;
$$;
grant execute on function get_driver_duty_info(uuid) to authenticated, anon;

-- Driver User tidak boleh ditugaskan ke penugasan operasional
-- (statusnya On Duty terkunci). Hanya memblokir penugasan BARU / pergantian driver.
create or replace function block_user_driver_tasks()
returns trigger
language plpgsql
as $$
begin
  if new.driver_id is not null
     and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id)
     and exists (select 1 from drivers d where d.id = new.driver_id and d.driver_type = 'user')
  then
    raise exception 'Driver User berstatus On Duty (08.00–16.30) dan tidak dapat ditugaskan ke penugasan operasional.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_user_driver_tasks on tasks;
create trigger trg_block_user_driver_tasks
  before insert or update of driver_id on tasks
  for each row execute function block_user_driver_tasks();


-- ######################################################################
-- ## BAGIAN 015  (dulu: 015_viewonly_public.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 015 — Dashboard-ViewOnly (halaman /dashboard-viewonly, TANPA login)
--
-- Masalah: tanpa login, tabel tasks/drivers/vehicles tidak bisa dibaca
-- (RLS), sehingga halaman terlihat kosong. Solusi: SATU fungsi
-- SECURITY DEFINER yang hanya mengembalikan data ringkas & aman untuk
-- tampilan lihat-saja. Tabel tetap terkunci seperti sekarang.
--
-- Yang DIKEMBALIKAN : penugasan hari ini (tujuan, keperluan, status, jam),
--                     nama driver + plant + tipe, nopol/jenis kendaraan.
-- Yang TIDAK keluar : no. HP, email, PIN/password, alasan pembatalan,
--                     data klaim/overtime/dana, dan data apa pun di luar itu.
-- Aman dijalankan ulang (idempotent). Jalankan SESUDAH/BERSAMA 014.
-- ═══════════════════════════════════════════════════════════════

-- (idem dengan 014 — supaya 015 bisa berdiri sendiri)
alter table drivers add column if not exists driver_type text not null default 'operational';
alter table drivers add column if not exists assigned_user text;
alter table drivers add column if not exists assigned_user_title text;

create or replace function get_viewonly_snapshot(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_tasks jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) - 'cancel_reason' - 'cancelled_by' order by t.created_at desc), '[]'::jsonb)
    into v_tasks
    from tasks_detail t
   where t.tanggal = v_date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'nama', d.nama, 'aktif', d.aktif, 'plant', d.plant,
           'avatar_emoji', d.avatar_emoji,
           'driver_type', d.driver_type,
           'assigned_user', d.assigned_user,
           'assigned_user_title', d.assigned_user_title
         ) order by d.nama), '[]'::jsonb)
    into v_drivers
    from drivers d
   where d.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'nopol', v.nopol, 'jenis', v.jenis, 'aktif', v.aktif, 'plant', v.plant
         ) order by v.nopol), '[]'::jsonb)
    into v_vehicles
    from vehicles v
   where v.aktif = true;

  return jsonb_build_object('date', v_date, 'tasks', v_tasks, 'drivers', v_drivers, 'vehicles', v_vehicles);
end;
$$;

revoke all on function get_viewonly_snapshot(date) from public;
grant execute on function get_viewonly_snapshot(date) to anon, authenticated;


-- ######################################################################
-- ## BAGIAN 016  (dulu: 016_viewonly_gate.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 016 — Dashboard-ViewOnly: data GATE dari log Security Gate
--
-- Gate = catatan petugas security (Armada → tab Gate / halaman /gate,
-- tabel vehicle_gate_logs), BUKAN turunan dari penugasan/status tugas.
-- Semantik log (plant = plant asal kendaraan):
--   plant CIK : dibuka saat kendaraan KELUAR plant (time_out), status OUT;
--               ditutup saat KEMBALI (time_in) → DONE.
--   plant PRB : dibuka saat kendaraan MASUK Cikarang (time_in), status IN;
--               ditutup saat KELUAR lagi (time_out) → DONE.
-- Snapshot memuat: log hari ini (WIB) + log yang masih aktif (belum DONE).
-- Tidak ada data sensitif (hanya nopol, jenis, nama driver, tujuan, jam).
-- Menggantikan fungsi dari 015 (idempotent). Jalankan SESUDAH 014 & 015.
-- ═══════════════════════════════════════════════════════════════

create or replace function get_viewonly_snapshot(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_tasks jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
  v_gate jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) - 'cancel_reason' - 'cancelled_by' order by t.created_at desc), '[]'::jsonb)
    into v_tasks from tasks_detail t where t.tanggal = v_date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'nama', d.nama, 'aktif', d.aktif, 'plant', d.plant,
           'avatar_emoji', d.avatar_emoji, 'driver_type', d.driver_type,
           'assigned_user', d.assigned_user, 'assigned_user_title', d.assigned_user_title
         ) order by d.nama), '[]'::jsonb)
    into v_drivers from drivers d where d.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'nopol', v.nopol, 'jenis', v.jenis, 'aktif', v.aktif, 'plant', v.plant
         ) order by v.nopol), '[]'::jsonb)
    into v_vehicles from vehicles v where v.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'nopol', ve.nopol, 'jenis', ve.jenis,
           'driver_name', coalesce(nullif(g.driver_name_manual, ''), dr.nama, '-'),
           'plant', g.plant, 'tujuan', g.tujuan,
           'time_out', g.time_out, 'time_in', g.time_in,
           'status', g.status, 'created_at', g.created_at
         ) order by g.created_at desc), '[]'::jsonb)
    into v_gate
    from vehicle_gate_logs g
    left join vehicles ve on ve.id = g.vehicle_id
    left join drivers dr on dr.id = g.driver_id
   where g.status <> 'DONE'
      or (g.created_at at time zone 'Asia/Jakarta')::date = v_date
      or (g.time_out at time zone 'Asia/Jakarta')::date = v_date
      or (g.time_in at time zone 'Asia/Jakarta')::date = v_date;

  return jsonb_build_object('date', v_date, 'tasks', v_tasks, 'drivers', v_drivers,
                            'vehicles', v_vehicles, 'gate', v_gate);
end;
$$;

revoke all on function get_viewonly_snapshot(date) from public;
grant execute on function get_viewonly_snapshot(date) to anon, authenticated;


-- ######################################################################
-- ## BAGIAN 017  (dulu: 017_task_origin.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 017 — Penugasan: kolom "Lokasi Keberangkatan / Penjemputan" (Dari mana → kemana)
--
-- • tasks.lokasi_asal  : titik berangkat / jemput. Tujuan tetap di tasks.tujuan.
-- • Data lama          : diisi otomatis sesuai plant tugasnya
--                        (CIK → "Plant Cikarang", PRB → "Plant Pasar Rebo").
-- • Data baru          : diisi dari form; kalau kosong, default sesuai plant.
-- • get_task_origins   : dibaca aplikasi (dashboard & driver) tanpa mengubah
--                        view tasks_detail (definisi view di produksi tidak disentuh).
-- • set_task_origin_batch : mengisi lokasi asal untuk penugasan rentang tanggal
--                        (create_task_batch tidak diubah).
-- Aman dijalankan ulang (idempotent).
-- ═══════════════════════════════════════════════════════════════

alter table tasks add column if not exists lokasi_asal text;

-- 1) Isi data lama sesuai plant
update tasks
   set lokasi_asal = case plant
                       when 'CIK' then 'Plant Cikarang'
                       when 'PRB' then 'Plant Pasar Rebo'
                       else lokasi_asal
                     end
 where lokasi_asal is null or btrim(lokasi_asal) = '';

-- 2) Baris baru tanpa lokasi asal otomatis memakai lokasi plant-nya
create or replace function tasks_default_origin()
returns trigger
language plpgsql
as $$
begin
  if new.lokasi_asal is null or btrim(new.lokasi_asal) = '' then
    new.lokasi_asal := case new.plant
                         when 'CIK' then 'Plant Cikarang'
                         when 'PRB' then 'Plant Pasar Rebo'
                         else null
                       end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_default_origin on tasks;
create trigger trg_tasks_default_origin
  before insert on tasks
  for each row execute function tasks_default_origin();

-- 3) Baca lokasi asal untuk sekumpulan tugas (id saja, tanpa data lain)
create or replace function get_task_origins(p_ids uuid[])
returns table (id uuid, lokasi_asal text)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.lokasi_asal from tasks t where t.id = any(p_ids);
$$;

revoke all on function get_task_origins(uuid[]) from public;
grant execute on function get_task_origins(uuid[]) to anon, authenticated;

-- 4) Isi lokasi asal untuk satu batch (penugasan rentang tanggal) — hanya staf login
create or replace function set_task_origin_batch(p_batch_id uuid, p_asal text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update tasks set lokasi_asal = nullif(btrim(p_asal), '') where batch_id = p_batch_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function set_task_origin_batch(uuid, text) from public;
grant execute on function set_task_origin_batch(uuid, text) to authenticated;


-- ######################################################################
-- ## BAGIAN 018  (dulu: 018_gate_keterangan.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 018 — Gate: kolom KETERANGAN (keperluan / catatan) pada log gate
--
-- • vehicle_gate_logs.keterangan : isi kolom "Keperluan / Catatan" di form /gate.
-- • set_gate_keterangan(vehicle, teks) : dipanggil sesudah open_gate_checkpoint,
--     mengisi log aktif terbaru milik kendaraan itu (RPC lama tidak diubah).
-- • get_gate_keterangan(ids[]) : dipakai halaman publik /gate untuk menggabungkan
--     keterangan ke daftar (get_gate_logs_public lama tidak diubah).
-- • get_viewonly_snapshot : gate kini memuat 'keterangan' (menggantikan 016).
-- Idempotent. Jalankan SESUDAH 016.
-- ═══════════════════════════════════════════════════════════════

alter table vehicle_gate_logs add column if not exists keterangan text;

create or replace function set_gate_keterangan(p_vehicle_id uuid, p_keterangan text)
returns void
language sql
security definer
set search_path = public
as $$
  update vehicle_gate_logs
     set keterangan = nullif(btrim(p_keterangan), '')
   where id = (
     select id from vehicle_gate_logs
      where vehicle_id = p_vehicle_id and status <> 'DONE'
      order by created_at desc limit 1
   );
$$;

create or replace function get_gate_keterangan(p_ids uuid[])
returns table(id uuid, keterangan text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.keterangan from vehicle_gate_logs g
   where g.id = any(p_ids) and g.keterangan is not null;
$$;

revoke all on function set_gate_keterangan(uuid, text) from public;
revoke all on function get_gate_keterangan(uuid[]) from public;
grant execute on function set_gate_keterangan(uuid, text) to anon, authenticated;
grant execute on function get_gate_keterangan(uuid[]) to anon, authenticated;

create or replace function get_viewonly_snapshot(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_tasks jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
  v_gate jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) - 'cancel_reason' - 'cancelled_by' order by t.created_at desc), '[]'::jsonb)
    into v_tasks from tasks_detail t where t.tanggal = v_date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'nama', d.nama, 'aktif', d.aktif, 'plant', d.plant,
           'avatar_emoji', d.avatar_emoji, 'driver_type', d.driver_type,
           'assigned_user', d.assigned_user, 'assigned_user_title', d.assigned_user_title
         ) order by d.nama), '[]'::jsonb)
    into v_drivers from drivers d where d.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'nopol', v.nopol, 'jenis', v.jenis, 'aktif', v.aktif, 'plant', v.plant
         ) order by v.nopol), '[]'::jsonb)
    into v_vehicles from vehicles v where v.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'nopol', ve.nopol, 'jenis', ve.jenis,
           'driver_name', coalesce(nullif(g.driver_name_manual, ''), dr.nama, '-'),
           'plant', g.plant, 'tujuan', g.tujuan, 'keterangan', g.keterangan,
           'time_out', g.time_out, 'time_in', g.time_in,
           'status', g.status, 'created_at', g.created_at
         ) order by g.created_at desc), '[]'::jsonb)
    into v_gate
    from vehicle_gate_logs g
    left join vehicles ve on ve.id = g.vehicle_id
    left join drivers dr on dr.id = g.driver_id
   where g.status <> 'DONE'
      or (g.created_at at time zone 'Asia/Jakarta')::date = v_date
      or (g.time_out at time zone 'Asia/Jakarta')::date = v_date
      or (g.time_in at time zone 'Asia/Jakarta')::date = v_date;

  return jsonb_build_object('date', v_date, 'tasks', v_tasks, 'drivers', v_drivers,
                            'vehicles', v_vehicles, 'gate', v_gate);
end;
$$;

revoke all on function get_viewonly_snapshot(date) from public;
grant execute on function get_viewonly_snapshot(date) to anon, authenticated;


-- ######################################################################
-- ## BAGIAN 019  (dulu: 019_claims_update.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 019 — Klaim: izinkan EDIT (perbaikan salah input) dari dashboard
--
-- Sebelumnya tabel claims hanya punya policy SELECT, INSERT, dan DELETE,
-- sehingga UPDATE dari dashboard ditolak diam-diam (0 baris berubah).
-- Policy ini mengizinkan pengguna yang login (admin dashboard) mengubah klaim.
-- Idempotent. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "claims_update_authenticated" on claims;
create policy "claims_update_authenticated" on claims
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');


-- ######################################################################
-- ## BAGIAN 020  (dulu: 020_task_auto_complete.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 020 — Penugasan: jam tugas maksimal 17.00 WIB, auto-selesai
--
-- • tasks.auto_completed : penanda tugas yang ditutup otomatis oleh sistem.
-- • auto_complete_tasks() : menutup semua tugas berstatus ASSIGNED atau
--     ON GOING yang batas waktunya (tanggal tugas pukul 17.00 WIB) sudah
--     lewat. Status jadi DONE, completed_at = pukul 17.00 WIB tanggal tugas
--     (atau jam diterima, bila driver baru menerima setelah 17.00).
--     Tugas DIBATALKAN dan yang sudah SELESAI tidak disentuh.
--     Mengembalikan jumlah tugas yang ditutup.
-- • Jadwal pg_cron setiap hari 17.00 WIB (= 10.00 UTC).
--     Bila pg_cron belum aktif, aktifkan dulu: Supabase Dashboard ->
--     Database -> Extensions -> pg_cron, lalu jalankan ulang file ini.
--     Aplikasi juga memanggil fungsi ini saat memuat tugas sebagai cadangan.
-- Catatan: tugas lama (hari-hari sebelumnya) yang masih menggantung akan
-- ikut ditutup saat fungsi pertama kali berjalan.
-- Idempotent. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

alter table tasks add column if not exists auto_completed boolean not null default false;

create or replace function auto_complete_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with closed as (
    update tasks t
       set status = 'DONE',
           completed_at = greatest(
             (t.tanggal::timestamp + time '17:00') at time zone 'Asia/Jakarta',
             coalesce(t.accepted_at, (t.tanggal::timestamp + time '17:00') at time zone 'Asia/Jakarta')
           ),
           auto_completed = true
     where t.status in ('ASSIGNED', 'ON GOING')
       and ((t.tanggal::timestamp + time '17:00') at time zone 'Asia/Jakarta') <= now()
    returning 1
  )
  select count(*) into v_count from closed;
  return v_count;
end;
$$;

revoke all on function auto_complete_tasks() from public;
grant execute on function auto_complete_tasks() to authenticated;

-- Jadwal harian 17.00 WIB (10.00 UTC). Dilewati dengan pesan bila pg_cron belum tersedia.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron belum bisa diaktifkan dari SQL (%). Aktifkan lewat Dashboard -> Database -> Extensions, lalu jalankan ulang file ini.', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('auto-complete-tasks-1700');
  exception when others then
    null; -- belum pernah dijadwalkan
  end;
  perform cron.schedule('auto-complete-tasks-1700', '0 10 * * *', 'select public.auto_complete_tasks();');
  raise notice 'Jadwal auto-selesai 17.00 WIB aktif.';
end;
$$;

-- Tutup sekarang tugas yang sudah lewat batas.
select auto_complete_tasks() as tugas_ditutup_sekarang;


-- ######################################################################
-- ## BAGIAN 021  (dulu: 021_security.sql)
-- ######################################################################

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
-- lewat /api/gc-nc (lihat docs/PANDUAN.md).
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


-- ######################################################################
-- ## BAGIAN 025  (dulu: 025_kalender_agenda.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 025 — Kalender & Agenda: jenis agenda, jam selesai, PIC, catatan,
--       tautan ke penugasan driver, dan izin UBAH (update).
--
-- Aman dijalankan ulang. Data agenda lama tetap ada (jenis = "event").
-- ═══════════════════════════════════════════════════════════════

-- 1) Tabel (dibuat hanya bila belum ada — biasanya sudah ada)
create table if not exists agenda_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  location    text default '',
  event_date  date not null,
  event_time  text default '',
  color       text default 'blue',
  created_by  text default '',
  created_at  timestamptz not null default now()
);

-- 2) Kolom baru
alter table agenda_events add column if not exists kategori   text not null default 'event';
alter table agenda_events add column if not exists end_time   text default '';
alter table agenda_events add column if not exists notes      text default '';
alter table agenda_events add column if not exists pic        text default '';
alter table agenda_events add column if not exists task_id    uuid references tasks(id) on delete set null;
alter table agenda_events add column if not exists updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_events_kategori_chk') then
    alter table agenda_events add constraint agenda_events_kategori_chk
      check (kategori in ('kunjungan','event','meeting','pelatihan','libur','lainnya'));
  end if;
end $$;

create index if not exists agenda_events_date_idx on agenda_events (event_date);
create index if not exists agenda_events_task_idx on agenda_events (task_id) where task_id is not null;

-- 3) Izin (RLS): semua akun yang login (punya profil) boleh lihat/tambah/ubah/hapus.
--    Kebijakan lama yang sudah ada tidak dihapus; yang belum ada ditambahkan.
alter table agenda_events enable row level security;

do $$
declare
  c text;
begin
  foreach c in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'agenda_events' and cmd in (c, 'ALL')
    ) then
      if c = 'INSERT' then
        execute format('create policy "agenda_%s" on agenda_events for insert to authenticated with check (exists (select 1 from profiles where id = auth.uid()))', lower(c));
      elsif c = 'UPDATE' then
        execute format('create policy "agenda_%s" on agenda_events for update to authenticated using (exists (select 1 from profiles where id = auth.uid())) with check (exists (select 1 from profiles where id = auth.uid()))', lower(c));
      else
        execute format('create policy "agenda_%s" on agenda_events for %s to authenticated using (exists (select 1 from profiles where id = auth.uid()))', lower(c), lower(c));
      end if;
      raise notice 'Kebijakan % ditambahkan', c;
    end if;
  end loop;
end $$;

-- 4) Cek hasil
select 'kolom' as cek, string_agg(column_name, ', ' order by ordinal_position) as hasil
from information_schema.columns where table_schema = 'public' and table_name = 'agenda_events'
union all
select 'kebijakan', string_agg(policyname || ' (' || cmd || ')', ', ')
from pg_policies where schemaname = 'public' and tablename = 'agenda_events'
union all
select 'jumlah agenda', count(*)::text from agenda_events;


-- ######################################################################
-- ## BAGIAN 026  (dulu: 026_atk_dua_arah.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 026 — ATK dua arah: input di CIKOPS  ⇄  Excel/VBA
--
-- Sebelumnya: Excel → CIKOPS saja (CIKOPS hanya laporan).
-- Sekarang:
--   • CIKOPS bisa input Permintaan, Restock, dan Barang baru (lewat
--     fungsi di bawah). Stok di database langsung berubah.
--   • Excel menarik transaksi web itu lewat tombol "Tarik dari CIKOPS"
--     (modSyncCikops versi baru) memakai KUNCI SINKRON, lalu
--     menandainya sudah ditarik.
--   • Stok yang dikirim Excel (atk_upsert_item) otomatis dikoreksi
--     dengan transaksi web yang BELUM ditarik Excel, jadi stok tidak
--     saling menimpa — tetap benar walau VBA lama belum diganti.
--
-- Aman dijalankan ulang. Data lama tidak berubah (dianggap dari Excel).
-- Di bagian paling bawah tampil KUNCI SINKRON untuk diisi di VBA.
-- ═══════════════════════════════════════════════════════════════

-- 1) Kolom penanda asal data & status tarik ke Excel
alter table atk_items    add column if not exists source text not null default 'excel';
alter table atk_items    add column if not exists excel_pulled_at timestamptz;
alter table atk_items    add column if not exists min_stok numeric not null default 5;
alter table atk_items    add column if not exists created_by text default '';

alter table atk_requests add column if not exists source text not null default 'excel';
alter table atk_requests add column if not exists excel_pulled_at timestamptz;
alter table atk_requests add column if not exists created_by text default '';
alter table atk_requests add column if not exists helper text default '';

alter table atk_restocks add column if not exists source text not null default 'excel';
alter table atk_restocks add column if not exists excel_pulled_at timestamptz;
alter table atk_restocks add column if not exists created_by text default '';

create index if not exists idx_atk_requests_pending on atk_requests (kode_barang) where source = 'web' and excel_pulled_at is null;
create index if not exists idx_atk_restocks_pending on atk_restocks (kode_barang) where source = 'web' and excel_pulled_at is null;

-- 2) Konfigurasi sinkron (1 baris). Tidak ada policy → hanya bisa dibaca fungsi di bawah.
create table if not exists atk_sync_config (
  id int primary key default 1 check (id = 1),
  sync_key text not null default replace(gen_random_uuid()::text, '-', ''),
  last_push_at timestamptz,
  last_pull_at timestamptz,
  last_pull_count int default 0
);
insert into atk_sync_config (id) values (1) on conflict (id) do nothing;
alter table atk_sync_config enable row level security;

-- 3) Helper
create or replace function atk_txt(x text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(x, ''), '|', '/'), chr(13), ' '), chr(10), ' ')
$$;

create or replace function atk_staff_name() returns text
language plpgsql security definer set search_path to 'public' as $$
declare n text;
begin
  select coalesce(full_name, '') into n from profiles where id = auth.uid();
  if not found then raise exception 'Akses ditolak: akun tidak terdaftar di CIKOPS.' using errcode = '42501'; end if;
  return n;
end $$;

create or replace function atk_check_key(p_key text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_key is null or not exists (select 1 from atk_sync_config where id = 1 and sync_key = p_key) then
    raise exception 'Kunci sinkron salah. Cek CIKOPS_SYNC_KEY di VBA (menu ATK → Sinkron Excel).' using errcode = '42501';
  end if;
end $$;

create or replace function atk_new_id(p_prefix text, p_tanggal date, p_tbl text) returns text
language plpgsql set search_path to 'public' as $$
declare v text; taken boolean;
begin
  loop
    v := p_prefix || '-' || to_char(p_tanggal, 'YYYYMMDD') || to_char(now() at time zone 'Asia/Jakarta', 'HH24MISS')
         || '-W' || lpad((floor(random() * 100))::int::text, 2, '0');
    if p_tbl = 'req' then select exists (select 1 from atk_requests where request_id = v) into taken;
    else select exists (select 1 from atk_restocks where update_id = v) into taken; end if;
    exit when not taken;
  end loop;
  return v;
end $$;

-- 4) Upsert stok dari Excel (dipanggil VBA) — sekarang dikoreksi transaksi web yang belum ditarik
create or replace function atk_upsert_item(p_kode_barang text, p_nama_barang text, p_satuan text, p_stok numeric)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_adj numeric;
begin
  select coalesce((select sum(jumlah) from atk_restocks where kode_barang = p_kode_barang and source = 'web' and excel_pulled_at is null), 0)
       - coalesce((select sum(jumlah) from atk_requests where kode_barang = p_kode_barang and source = 'web' and excel_pulled_at is null), 0)
    into v_adj;

  insert into atk_items (kode_barang, nama_barang, satuan, stok, updated_at, excel_pulled_at)
  values (p_kode_barang, p_nama_barang, p_satuan, p_stok + v_adj, now(), now())
  on conflict (kode_barang) do update set
    nama_barang = excluded.nama_barang,
    satuan = excluded.satuan,
    stok = excluded.stok,
    updated_at = now(),
    excel_pulled_at = coalesce(atk_items.excel_pulled_at, now()); -- barang ini sudah dikenal Excel

  update atk_sync_config set last_push_at = now() where id = 1;
end $$;

-- 5) INPUT DARI CIKOPS (akun login)
-- p_items: [{"kode":"ATK001","jumlah":2}, ...]
create or replace function atk_web_request(p_tanggal date, p_nama text, p_nik text, p_departemen text, p_helper text, p_items jsonb)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_by text; v_id text; r record; it atk_items%rowtype;
begin
  v_by := atk_staff_name();
  if coalesce(trim(p_nama), '') = '' then raise exception 'Nama pemohon wajib diisi.'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Pilih minimal 1 barang.'; end if;
  v_id := atk_new_id('REQ', coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), 'req');

  for r in
    select x.kode, sum(x.jumlah) as jumlah
    from jsonb_to_recordset(p_items) as x(kode text, jumlah numeric)
    group by x.kode
  loop
    if r.jumlah is null or r.jumlah <= 0 then raise exception 'Jumlah untuk % harus lebih dari 0.', r.kode; end if;
    select * into it from atk_items where kode_barang = r.kode for update;
    if not found then raise exception 'Barang % tidak ditemukan.', r.kode; end if;
    if it.stok < r.jumlah then
      raise exception 'Stok % tidak cukup (sisa %, diminta %).', it.nama_barang, it.stok, r.jumlah;
    end if;
    insert into atk_requests (request_id, tanggal, nama, nik, departemen, kode_barang, nama_barang, jumlah, satuan, helper, source, created_by)
    values (v_id, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), trim(p_nama), coalesce(trim(p_nik), ''), coalesce(trim(p_departemen), ''),
            it.kode_barang, it.nama_barang, r.jumlah, coalesce(it.satuan, ''), coalesce(trim(p_helper), ''), 'web', v_by);
    update atk_items set stok = stok - r.jumlah, updated_at = now() where kode_barang = r.kode;
  end loop;
  return v_id;
end $$;

create or replace function atk_web_restock(p_tanggal date, p_nama text, p_nik text, p_departemen text, p_items jsonb)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_by text; v_id text; r record; it atk_items%rowtype;
begin
  v_by := atk_staff_name();
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Pilih minimal 1 barang.'; end if;
  v_id := atk_new_id('UPD', coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), 'rst');

  for r in
    select x.kode, sum(x.jumlah) as jumlah
    from jsonb_to_recordset(p_items) as x(kode text, jumlah numeric)
    group by x.kode
  loop
    if r.jumlah is null or r.jumlah <= 0 then raise exception 'Jumlah untuk % harus lebih dari 0.', r.kode; end if;
    select * into it from atk_items where kode_barang = r.kode for update;
    if not found then raise exception 'Barang % tidak ditemukan.', r.kode; end if;
    insert into atk_restocks (update_id, tanggal, nama, nik, departemen, kode_barang, nama_barang, jumlah, satuan, source, created_by)
    values (v_id, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), coalesce(nullif(trim(p_nama), ''), v_by), coalesce(trim(p_nik), ''),
            coalesce(trim(p_departemen), ''), it.kode_barang, it.nama_barang, r.jumlah, coalesce(it.satuan, ''), 'web', v_by);
    update atk_items set stok = stok + r.jumlah, updated_at = now() where kode_barang = r.kode;
  end loop;
  return v_id;
end $$;

-- Barang baru (stok awal dicatat sebagai restock web)
create or replace function atk_web_add_item(p_kode text, p_nama text, p_satuan text, p_min_stok numeric, p_stok_awal numeric)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_by text; v_kode text := upper(trim(p_kode));
begin
  v_by := atk_staff_name();
  if v_kode = '' or coalesce(trim(p_nama), '') = '' then raise exception 'Kode dan nama barang wajib diisi.'; end if;
  if exists (select 1 from atk_items where upper(kode_barang) = v_kode) then raise exception 'Kode % sudah dipakai.', v_kode; end if;
  if exists (select 1 from atk_items where lower(nama_barang) = lower(trim(p_nama))) then raise exception 'Nama barang "%" sudah ada.', trim(p_nama); end if;
  insert into atk_items (kode_barang, nama_barang, satuan, stok, min_stok, source, created_by, updated_at)
  values (v_kode, trim(p_nama), coalesce(trim(p_satuan), ''), 0, greatest(coalesce(p_min_stok, 5), 0), 'web', v_by, now());
  if coalesce(p_stok_awal, 0) > 0 then
    perform atk_web_restock((now() at time zone 'Asia/Jakarta')::date, v_by, '', 'Stok awal', jsonb_build_array(jsonb_build_object('kode', v_kode, 'jumlah', p_stok_awal)));
  end if;
  return v_kode;
end $$;

create or replace function atk_web_set_min_stok(p_kode text, p_min numeric)
returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  perform atk_staff_name();
  update atk_items set min_stok = greatest(coalesce(p_min, 0), 0) where kode_barang = p_kode;
  if not found then raise exception 'Barang % tidak ditemukan.', p_kode; end if;
end $$;

-- Batalkan transaksi web yang BELUM ditarik Excel (stok dikembalikan)
create or replace function atk_web_cancel(p_kind text, p_ref text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int := 0; r record;
begin
  perform atk_staff_name();
  if p_kind = 'request' then
    if exists (select 1 from atk_requests where request_id = p_ref and (source <> 'web' or excel_pulled_at is not null)) then
      raise exception 'Transaksi ini sudah ada di Excel — batalkan/koreksi dari Excel.';
    end if;
    for r in select kode_barang, sum(jumlah) j from atk_requests where request_id = p_ref group by kode_barang loop
      update atk_items set stok = stok + r.j, updated_at = now() where kode_barang = r.kode_barang;
    end loop;
    delete from atk_requests where request_id = p_ref; get diagnostics n = row_count;
  elsif p_kind = 'restock' then
    if exists (select 1 from atk_restocks where update_id = p_ref and (source <> 'web' or excel_pulled_at is not null)) then
      raise exception 'Transaksi ini sudah ada di Excel — batalkan/koreksi dari Excel.';
    end if;
    for r in select s.kode_barang, sum(s.jumlah) j, max(i.stok) stok, max(i.nama_barang) nm
             from atk_restocks s join atk_items i on i.kode_barang = s.kode_barang
             where s.update_id = p_ref group by s.kode_barang loop
      if r.stok < r.j then raise exception 'Tidak bisa dibatalkan: stok % tinggal %, sudah terpakai.', r.nm, r.stok; end if;
      update atk_items set stok = stok - r.j, updated_at = now() where kode_barang = r.kode_barang;
    end loop;
    delete from atk_restocks where update_id = p_ref; get diagnostics n = row_count;
  else
    raise exception 'Jenis transaksi tidak dikenal.';
  end if;
  if n = 0 then raise exception 'Transaksi % tidak ditemukan.', p_ref; end if;
  return n;
end $$;

-- Status sinkron untuk dashboard (kunci hanya untuk admin)
create or replace function atk_sync_status()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_admin boolean; c atk_sync_config%rowtype;
begin
  perform atk_staff_name();
  select (role = 'admin' or coalesce(is_master_admin, false)) into v_admin from profiles where id = auth.uid();
  select * into c from atk_sync_config where id = 1;
  return jsonb_build_object(
    'pending_requests', (select count(distinct request_id) from atk_requests where source = 'web' and excel_pulled_at is null),
    'pending_restocks', (select count(distinct update_id) from atk_restocks where source = 'web' and excel_pulled_at is null),
    'pending_items',    (select count(*) from atk_items where source = 'web' and excel_pulled_at is null),
    'last_push_at', c.last_push_at,
    'last_pull_at', c.last_pull_at,
    'last_pull_count', c.last_pull_count,
    'is_admin', coalesce(v_admin, false),
    'sync_key', case when coalesce(v_admin, false) then c.sync_key else null end
  );
end $$;

create or replace function atk_rotate_sync_key()
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or coalesce(is_master_admin, false))) then
    raise exception 'Hanya admin yang bisa mengganti kunci sinkron.' using errcode = '42501';
  end if;
  v := replace(gen_random_uuid()::text, '-', '');
  update atk_sync_config set sync_key = v where id = 1;
  return v;
end $$;

-- 6) UNTUK VBA (anon + kunci sinkron)
-- Hasil teks per baris, kolom dipisah "|":
--   I|id|kode|nama|satuan
--   S|id|update_id|tanggal|nama|nik|departemen|kode|nama_barang|jumlah|satuan
--   Q|id|request_id|tanggal|nama|nik|departemen|kode|nama_barang|jumlah|satuan|helper
create or replace function atk_pull_for_excel(p_key text)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  perform atk_check_key(p_key);
  select string_agg(line, chr(10) order by ord, k1, k2) into v from (
    select 1 ord, kode_barang k1, '' k2,
           concat_ws('|', 'I', id, atk_txt(kode_barang), atk_txt(nama_barang), atk_txt(satuan)) line
    from atk_items where source = 'web' and excel_pulled_at is null
    union all
    select 2, update_id, kode_barang,
           concat_ws('|', 'S', id, atk_txt(update_id), to_char(tanggal, 'YYYY-MM-DD'), atk_txt(nama), atk_txt(nik), atk_txt(departemen),
                     atk_txt(kode_barang), atk_txt(nama_barang), jumlah::text, atk_txt(satuan))
    from atk_restocks where source = 'web' and excel_pulled_at is null
    union all
    select 3, request_id, kode_barang,
           concat_ws('|', 'Q', id, atk_txt(request_id), to_char(tanggal, 'YYYY-MM-DD'), atk_txt(nama), atk_txt(nik), atk_txt(departemen),
                     atk_txt(kode_barang), atk_txt(nama_barang), jumlah::text, atk_txt(satuan), atk_txt(helper))
    from atk_requests where source = 'web' and excel_pulled_at is null
  ) t;
  return coalesce(v, '');
end $$;

-- Tandai sudah ditarik (p_ids: daftar id dipisah koma)
create or replace function atk_mark_pulled(p_key text, p_ids text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare ids text[]; n int := 0; m int;
begin
  perform atk_check_key(p_key);
  ids := string_to_array(regexp_replace(coalesce(p_ids, ''), '\s', '', 'g'), ',');
  update atk_items    set excel_pulled_at = now() where id::text = any(ids) and excel_pulled_at is null; get diagnostics m = row_count; n := n + m;
  update atk_restocks set excel_pulled_at = now() where id::text = any(ids) and excel_pulled_at is null; get diagnostics m = row_count; n := n + m;
  update atk_requests set excel_pulled_at = now() where id::text = any(ids) and excel_pulled_at is null; get diagnostics m = row_count; n := n + m;
  update atk_sync_config set last_pull_at = now(), last_pull_count = n where id = 1;
  return n;
end $$;

-- 7) Hak akses fungsi
revoke all on function atk_staff_name() from public, anon;
revoke all on function atk_check_key(text) from public, anon;
revoke all on function atk_new_id(text, date, text) from public, anon;
revoke all on function atk_web_request(date, text, text, text, text, jsonb) from public, anon;
revoke all on function atk_web_restock(date, text, text, text, jsonb) from public, anon;
revoke all on function atk_web_add_item(text, text, text, numeric, numeric) from public, anon;
revoke all on function atk_web_set_min_stok(text, numeric) from public, anon;
revoke all on function atk_web_cancel(text, text) from public, anon;
revoke all on function atk_sync_status() from public, anon;
revoke all on function atk_rotate_sync_key() from public, anon;
grant execute on function atk_web_request(date, text, text, text, text, jsonb) to authenticated;
grant execute on function atk_web_restock(date, text, text, text, jsonb) to authenticated;
grant execute on function atk_web_add_item(text, text, text, numeric, numeric) to authenticated;
grant execute on function atk_web_set_min_stok(text, numeric) to authenticated;
grant execute on function atk_web_cancel(text, text) to authenticated;
grant execute on function atk_sync_status() to authenticated;
grant execute on function atk_rotate_sync_key() to authenticated;
grant execute on function atk_upsert_item(text, text, text, numeric) to anon, authenticated;
grant execute on function atk_pull_for_excel(text) to anon, authenticated;
grant execute on function atk_mark_pulled(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 8) KUNCI SINKRON → salin ke VBA: Private Const CIKOPS_SYNC_KEY = "..."
select 'KUNCI SINKRON (isi di VBA)' as info, sync_key as nilai from atk_sync_config where id = 1
union all
select 'Jumlah barang', count(*)::text from atk_items;


-- ######################################################################
-- ## BAGIAN 027  (dulu: 027_ga_facility.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 027 — Modul GA Facility: Cleaning Service, Gardening & TGA
--
-- Sumber data: file Excel "ISS GA System" (modGA + modSyncGA).
-- Arah sinkron: Excel → CIKOPS saja. CIKOPS hanya membaca/menampilkan.
--   • Master pekerjaan & manpower  → dicerminkan penuh tiap sinkron
--   • Plan & actual                → per periode (bulan); actual dari PC
--                                    dengan salinan lebih lama TIDAK
--                                    menimpa actual yang lebih baru
--   • Event, Improvement, Inventory, TGA → dicerminkan penuh
--
-- Excel memanggil fungsi ga_* dengan anon key + KUNCI SINKRON GA
-- (lihat hasil paling bawah). Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

-- 1) Tabel
create table if not exists ga_jobs (
  id text primary key,
  tim text default '', lokasi text default '', tipe text default '', area text default '',
  frek text default '', hari text default '', petugas text default '',
  aktif boolean not null default true, catatan text default '',
  synced_at timestamptz not null default now()
);

create table if not exists ga_manpower (
  id text primary key,
  nama text default '', tim text default '', jabatan text default '', area_tugas text default '', status text default '',
  synced_at timestamptz not null default now()
);

create table if not exists ga_plan (
  key text primary key,                 -- ID pekerjaan | yyyymmdd
  periode int not null,                 -- yyyymm
  tanggal date not null,
  hari text default '', minggu_ke int,
  job_id text default '', tim text default '', lokasi text default '', tipe text default '', area text default '',
  frek text default '', petugas text default '',
  plan smallint not null default 1,
  actual smallint,                      -- 1 dikerjakan, 0 tidak, null belum diinput
  spv text default '',
  waktu_input timestamptz,
  sync_id text,
  synced_at timestamptz not null default now()
);
create index if not exists ga_plan_tanggal_idx on ga_plan (tanggal);
create index if not exists ga_plan_periode_idx on ga_plan (periode);

create table if not exists ga_events (
  id bigserial primary key, baris int,
  tanggal date, nama text default '', deskripsi text default '', waktu text default '', support text default '', dokumentasi text default '',
  synced_at timestamptz not null default now()
);
create table if not exists ga_improvements (
  id bigserial primary key, baris int,
  tanggal date, kategori text default '', jenis text default '', deskripsi text default '', area text default '',
  petugas text default '', pengawas text default '', dokumentasi text default '',
  synced_at timestamptz not null default now()
);
create table if not exists ga_inventory (
  id bigserial primary key, baris int,
  kode text default '', nama text default '', jenis text default '', area text default '', status text default '',
  foto text default '', jumlah numeric, tgl_update date,
  synced_at timestamptz not null default now()
);
create table if not exists ga_tga (
  id bigserial primary key, baris int,
  tanggal date, nama_tga text default '', activity text default '', request_by text default '',
  synced_at timestamptz not null default now()
);
create index if not exists ga_tga_tanggal_idx on ga_tga (tanggal);
create index if not exists ga_events_tanggal_idx on ga_events (tanggal);
create index if not exists ga_improvements_tanggal_idx on ga_improvements (tanggal);

create table if not exists ga_sync_config (
  id int primary key default 1 check (id = 1),
  sync_key text not null default replace(gen_random_uuid()::text, '-', ''),
  last_sync_at timestamptz,
  last_computer text,
  last_plan_at timestamptz,
  last_master_at timestamptz,
  last_logs_at timestamptz,
  last_summary jsonb default '{}'::jsonb
);
insert into ga_sync_config (id) values (1) on conflict (id) do nothing;

-- 2) Izin baca: akun CIKOPS yang login
do $$
declare t text;
begin
  foreach t in array array['ga_jobs','ga_manpower','ga_plan','ga_events','ga_improvements','ga_inventory','ga_tga'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on %I for select to authenticated using (exists (select 1 from profiles where id = auth.uid()))', t || '_read', t);
    end if;
  end loop;
end $$;
alter table ga_sync_config enable row level security;   -- tanpa policy: hanya lewat fungsi

-- 3) Helper
create or replace function ga_check_key(p_key text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_key is null or not exists (select 1 from ga_sync_config where id = 1 and sync_key = p_key) then
    raise exception 'Kunci sinkron GA salah. Cek GA_SYNC_KEY di modSyncGA (CIKOPS: Fasilitas → Cleaning, Gardening & TGA → Sinkron).' using errcode = '42501';
  end if;
end $$;

create or replace function ga_date(v text) returns date language sql immutable as $$
  select case when v ~ '^\d{4}-\d{2}-\d{2}' then left(v, 10)::date else null end
$$;
create or replace function ga_ts(v text) returns timestamptz language sql immutable as $$
  select case when v ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}' then (replace(left(v, 19), 'T', ' ')::timestamp at time zone 'Asia/Jakarta') else null end
$$;

-- 4) Fungsi untuk Excel (anon + kunci)
create or replace function ga_ping(p_key text) returns text
language plpgsql security definer set search_path to 'public' as $$
begin
  perform ga_check_key(p_key);
  return 'ok';
end $$;

-- Master pekerjaan & manpower (cermin penuh)
create or replace function ga_sync_master(p_key text, p_jobs jsonb, p_manpower jsonb, p_computer text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare nj int; nm int;
begin
  perform ga_check_key(p_key);
  delete from ga_jobs where true;
  insert into ga_jobs (id, tim, lokasi, tipe, area, frek, hari, petugas, aktif, catatan)
  select distinct on (x.id) x.id, coalesce(x.tim,''), coalesce(x.lokasi,''), coalesce(x.tipe,''), coalesce(x.area,''), coalesce(x.frek,''),
         coalesce(x.hari,''), coalesce(x.petugas,''), coalesce(upper(x.aktif) not in ('TIDAK','NO','N','0','FALSE'), true), coalesce(x.catatan,'')
  from jsonb_to_recordset(coalesce(p_jobs, '[]'::jsonb)) as x(id text, tim text, lokasi text, tipe text, area text, frek text, hari text, petugas text, aktif text, catatan text)
  where coalesce(trim(x.id), '') <> '';
  get diagnostics nj = row_count;

  delete from ga_manpower where true;
  insert into ga_manpower (id, nama, tim, jabatan, area_tugas, status)
  select distinct on (coalesce(nullif(trim(x.id), ''), x.nama)) coalesce(nullif(trim(x.id), ''), x.nama), coalesce(x.nama,''), coalesce(x.tim,''),
         coalesce(x.jabatan,''), coalesce(x.area_tugas,''), coalesce(x.status,'')
  from jsonb_to_recordset(coalesce(p_manpower, '[]'::jsonb)) as x(id text, nama text, tim text, jabatan text, area_tugas text, status text)
  where coalesce(trim(x.nama), '') <> '';
  get diagnostics nm = row_count;

  update ga_sync_config set last_master_at = now(), last_sync_at = now(), last_computer = left(coalesce(p_computer, ''), 80) where id = 1;
  return jsonb_build_object('jobs', nj, 'manpower', nm);
end $$;

-- Plan & actual: satu potongan (maks ± 500 baris) — upsert
create or replace function ga_sync_plan(p_key text, p_sync_id text, p_rows jsonb)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  perform ga_check_key(p_key);
  insert into ga_plan as g (key, periode, tanggal, hari, minggu_ke, job_id, tim, lokasi, tipe, area, frek, petugas, plan, actual, spv, waktu_input, sync_id, synced_at)
  select x.key, x.periode, ga_date(x.tanggal), coalesce(x.hari,''), x.minggu, coalesce(x.job_id,''), coalesce(x.tim,''), coalesce(x.lokasi,''),
         coalesce(x.tipe,''), coalesce(x.area,''), coalesce(x.frek,''), coalesce(x.petugas,''), coalesce(x.plan, 1),
         case when x.actual in (0, 1) then x.actual end, coalesce(x.spv,''), ga_ts(x.waktu), p_sync_id, now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(key text, periode int, tanggal text, hari text, minggu int, job_id text, tim text, lokasi text,
       tipe text, area text, frek text, petugas text, plan smallint, actual smallint, spv text, waktu text)
  where coalesce(x.key, '') <> '' and ga_date(x.tanggal) is not null
  on conflict (key) do update set
    periode = excluded.periode, tanggal = excluded.tanggal, hari = excluded.hari, minggu_ke = excluded.minggu_ke,
    job_id = excluded.job_id, tim = excluded.tim, lokasi = excluded.lokasi, tipe = excluded.tipe, area = excluded.area,
    frek = excluded.frek, petugas = excluded.petugas, plan = excluded.plan,
    -- actual: pakai yang paling baru (Waktu Input); salinan lama tidak menimpa
    actual = case when excluded.waktu_input is not null and (g.waktu_input is null or excluded.waktu_input >= g.waktu_input) then excluded.actual else g.actual end,
    spv = case when excluded.waktu_input is not null and (g.waktu_input is null or excluded.waktu_input >= g.waktu_input) then excluded.spv else g.spv end,
    waktu_input = case when excluded.waktu_input is not null and (g.waktu_input is null or excluded.waktu_input >= g.waktu_input) then excluded.waktu_input else g.waktu_input end,
    sync_id = excluded.sync_id, synced_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Selesai satu sinkron plan: hapus jadwal di periode tsb yang sudah tidak ada di Excel
create or replace function ga_sync_plan_finish(p_key text, p_sync_id text, p_periodes int[], p_computer text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  perform ga_check_key(p_key);
  delete from ga_plan where periode = any(coalesce(p_periodes, '{}')) and sync_id is distinct from p_sync_id;
  get diagnostics n = row_count;
  update ga_sync_config set last_plan_at = now(), last_sync_at = now(), last_computer = left(coalesce(p_computer, ''), 80) where id = 1;
  return n;
end $$;

-- Log Event / Improvement / Inventory / TGA (cermin penuh per sheet)
create or replace function ga_sync_logs(p_key text, p_table text, p_rows jsonb, p_computer text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int := 0;
begin
  perform ga_check_key(p_key);
  if p_table = 'events' then
    delete from ga_events where true;
    insert into ga_events (baris, tanggal, nama, deskripsi, waktu, support, dokumentasi)
    select x.baris, ga_date(x.tanggal), coalesce(x.nama,''), coalesce(x.deskripsi,''), coalesce(x.waktu,''), coalesce(x.support,''), coalesce(x.dok,'')
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as x(baris int, tanggal text, nama text, deskripsi text, waktu text, support text, dok text);
  elsif p_table = 'improvements' then
    delete from ga_improvements where true;
    insert into ga_improvements (baris, tanggal, kategori, jenis, deskripsi, area, petugas, pengawas, dokumentasi)
    select x.baris, ga_date(x.tanggal), coalesce(x.kategori,''), coalesce(x.jenis,''), coalesce(x.deskripsi,''), coalesce(x.area,''),
           coalesce(x.petugas,''), coalesce(x.pengawas,''), coalesce(x.dok,'')
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as x(baris int, tanggal text, kategori text, jenis text, deskripsi text, area text, petugas text, pengawas text, dok text);
  elsif p_table = 'inventory' then
    delete from ga_inventory where true;
    insert into ga_inventory (baris, kode, nama, jenis, area, status, foto, jumlah, tgl_update)
    select x.baris, coalesce(x.kode,''), coalesce(x.nama,''), coalesce(x.jenis,''), coalesce(x.area,''), coalesce(x.status,''), coalesce(x.foto,''),
           x.jumlah, ga_date(x.tgl_update)
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as x(baris int, kode text, nama text, jenis text, area text, status text, foto text, jumlah numeric, tgl_update text);
  elsif p_table = 'tga' then
    delete from ga_tga where true;
    insert into ga_tga (baris, tanggal, nama_tga, activity, request_by)
    select x.baris, ga_date(x.tanggal), coalesce(x.nama_tga,''), coalesce(x.activity,''), coalesce(x.request_by,'')
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as x(baris int, tanggal text, nama_tga text, activity text, request_by text);
  else
    raise exception 'Tabel % tidak dikenal.', p_table;
  end if;
  get diagnostics n = row_count;
  update ga_sync_config set last_logs_at = now(), last_sync_at = now(), last_computer = left(coalesce(p_computer, ''), 80),
         last_summary = coalesce(last_summary, '{}'::jsonb) || jsonb_build_object(p_table, n) where id = 1;
  return n;
end $$;

-- 5) Untuk dashboard CIKOPS
create or replace function ga_sync_status()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_admin boolean; c ga_sync_config%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select (role = 'admin' or coalesce(is_master_admin, false)) into v_admin from profiles where id = auth.uid();
  select * into c from ga_sync_config where id = 1;
  return jsonb_build_object(
    'last_sync_at', c.last_sync_at, 'last_computer', c.last_computer,
    'last_plan_at', c.last_plan_at, 'last_master_at', c.last_master_at, 'last_logs_at', c.last_logs_at,
    'jobs', (select count(*) from ga_jobs), 'plan', (select count(*) from ga_plan),
    'is_admin', coalesce(v_admin, false),
    'sync_key', case when coalesce(v_admin, false) then c.sync_key else null end
  );
end $$;

create or replace function ga_rotate_sync_key() returns text
language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or coalesce(is_master_admin, false))) then
    raise exception 'Hanya admin yang bisa mengganti kunci sinkron.' using errcode = '42501';
  end if;
  v := replace(gen_random_uuid()::text, '-', '');
  update ga_sync_config set sync_key = v where id = 1;
  return v;
end $$;

-- 6) Hak akses
revoke all on function ga_check_key(text) from public, anon;
grant execute on function ga_ping(text) to anon, authenticated;
grant execute on function ga_sync_master(text, jsonb, jsonb, text) to anon, authenticated;
grant execute on function ga_sync_plan(text, text, jsonb) to anon, authenticated;
grant execute on function ga_sync_plan_finish(text, text, int[], text) to anon, authenticated;
grant execute on function ga_sync_logs(text, text, jsonb, text) to anon, authenticated;
revoke all on function ga_sync_status() from public, anon;
revoke all on function ga_rotate_sync_key() from public, anon;
grant execute on function ga_sync_status() to authenticated;
grant execute on function ga_rotate_sync_key() to authenticated;

notify pgrst, 'reload schema';

-- 7) KUNCI SINKRON GA → salin ke modSyncGA: Private Const GA_SYNC_KEY = "..."
select 'KUNCI SINKRON GA (isi di modSyncGA)' as info, sync_key as nilai from ga_sync_config where id = 1;


-- ######################################################################
-- ## BAGIAN 028  (dulu: 028_fm_command_center.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 028 — FM COMMAND CENTER (layar /dashboard-viewonly)
--
-- get_fm_snapshot() : SATU panggilan berisi data BERJALAN (hari ini + total
--   bulan berjalan) untuk Fleet, Gate, Kantin & ATK. Boleh dipanggil TANPA
--   LOGIN — karena itu TIDAK ADA data bernominal (klaim, kantong, lembur, dana
--   operasional) dan tidak ada nama orang.
--   Pelanggaran / NC security dibaca terpisah dari G-C lewat /api/gc-nc?board=1.
--   Setiap bagian dibungkus BEGIN…EXCEPTION: bila satu tabel belum ada /
--   berbeda, bagian itu bernilai null dan bagian lain tetap tampil.
--
-- Idempotent — aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

-- bersihkan versi uji coba (mode manajemen) bila pernah dijalankan
drop function if exists get_fm_snapshot(text);
drop function if exists fm_manager_key();
drop function if exists fm_rotate_manager_key();
drop function if exists fm_is_admin();
drop table if exists fm_config;

create or replace function get_fm_snapshot()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_m0    date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  r jsonb;
  x jsonb; y jsonb; z jsonb; w jsonb;
begin
  r := jsonb_build_object('today', v_today, 'generated_at', now());

  -- ── TUGAS DRIVER (per hari, bulan berjalan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'done', done, 'same', same) order by d), '[]'::jsonb) into x
    from (select tanggal d,
                 count(*) filter (where status <> 'CANCELLED') n,
                 count(*) filter (where status = 'DONE') done,
                 count(*) filter (where status = 'DONE' and (completed_at at time zone 'Asia/Jakarta')::date = tanggal) same
            from tasks where tanggal between v_m0 and v_today group by tanggal) s;
    r := r || jsonb_build_object('tasks_daily', x);
  exception when others then r := r || jsonb_build_object('tasks_daily', null);
  end;

  -- ── ARMADA (dokumen jatuh tempo + pemakaian bulan berjalan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'nopol', v.nopol, 'jenis', v.jenis, 'plant', v.plant,
             'kir', v.kir_date, 'stnk', v.stnk_date, 'service', v.service_date,
             'days', (select count(distinct t.tanggal) from tasks t where t.vehicle_id = v.id and t.tanggal between v_m0 and v_today and t.status <> 'CANCELLED'),
             'trips', (select count(*) from tasks t where t.vehicle_id = v.id and t.tanggal between v_m0 and v_today and t.status <> 'CANCELLED')
           ) order by v.nopol), '[]'::jsonb) into x
      from vehicles v where v.aktif;
    r := r || jsonb_build_object('vehicles', x);
  exception when others then r := r || jsonb_build_object('vehicles', null);
  end;

  -- ── GATE (per hari bulan berjalan, per jam hari ini, yang masih terbuka) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'done', done, 'trip', trip) order by d), '[]'::jsonb) into x
    from (select (coalesce(time_out, time_in, created_at) at time zone 'Asia/Jakarta')::date d,
                 count(*) n, count(*) filter (where status = 'DONE') done,
                 round(avg(abs(extract(epoch from (time_in - time_out))) / 60) filter (where time_in is not null and time_out is not null)) trip
            from vehicle_gate_logs
           where coalesce(time_out, time_in, created_at) >= (v_m0::timestamp at time zone 'Asia/Jakarta')
           group by 1) s;
    select jsonb_build_object(
             'out', coalesce((select jsonb_agg(extract(hour from time_out at time zone 'Asia/Jakarta')::int) from vehicle_gate_logs where (time_out at time zone 'Asia/Jakarta')::date = v_today), '[]'::jsonb),
             'in',  coalesce((select jsonb_agg(extract(hour from time_in  at time zone 'Asia/Jakarta')::int) from vehicle_gate_logs where (time_in  at time zone 'Asia/Jakarta')::date = v_today), '[]'::jsonb)) into y;
    select coalesce(jsonb_agg(jsonb_build_object('plant', g.plant, 'nopol', ve.nopol,
             'since', coalesce(case when g.plant = 'CIK' then g.time_out else g.time_in end, g.created_at)) order by g.created_at), '[]'::jsonb) into z
      from vehicle_gate_logs g left join vehicles ve on ve.id = g.vehicle_id
     where g.status <> 'DONE';
    r := r || jsonb_build_object('gate_daily', x, 'gate_hours', y, 'gate_open', z);
  exception when others then r := r || jsonb_build_object('gate_daily', null, 'gate_hours', null, 'gate_open', null);
  end;

  -- ── KANTIN (per hari bulan berjalan: order & sisa per shift, snack + makan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', report_date,
             'o', jsonb_build_array(snack_order_1 + meal_order_1, snack_order_2 + meal_order_2, snack_order_3 + meal_order_3),
             'l', jsonb_build_array(snack_leftover_1 + meal_leftover_1, snack_leftover_2 + meal_leftover_2, snack_leftover_3 + meal_leftover_3)
           ) order by report_date), '[]'::jsonb) into x
      from canteen_reports where report_date between v_m0 and v_today;
    r := r || jsonb_build_object('canteen_daily', x);
  exception when others then r := r || jsonb_build_object('canteen_daily', null);
  end;

  -- ── ATK (keluar per hari bulan berjalan, stok kritis, per departemen, item hari ini) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) into x
    from (select tanggal d, sum(jumlah) n from atk_requests where tanggal between v_m0 and v_today group by 1) s;
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into y
    from (select nama_barang nama, stok, coalesce(satuan, '') satuan, u30,
                 case when u30 > 0 then round(stok / (u30 / 30.0), 1) end cover
            from (select i.nama_barang, i.stok, i.satuan,
                         (select coalesce(sum(q.jumlah), 0) from atk_requests q where q.kode_barang = i.kode_barang and q.tanggal > v_today - 30) u30
                    from atk_items i) a
           where stok <= 0 or (u30 > 0 and stok / (u30 / 30.0) < 14)
           order by case when stok <= 0 then -1 else stok / nullif(u30 / 30.0, 0) end nulls last
           limit 8) s;
    select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) into z
    from (select coalesce(nullif(departemen, ''), 'Lainnya') k, sum(jumlah) n from atk_requests where tanggal between v_m0 and v_today group by 1 order by 2 desc limit 6) s;
    select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) into w
    from (select coalesce(i.nama_barang, q.kode_barang) k, sum(q.jumlah) n
            from atk_requests q left join atk_items i on i.kode_barang = q.kode_barang
           where q.tanggal = v_today group by 1 order by 2 desc limit 6) s;
    r := r || jsonb_build_object('atk_daily', x, 'atk_critical', y, 'atk_depts', z, 'atk_today', w);
  exception when others then r := r || jsonb_build_object('atk_daily', null, 'atk_critical', null, 'atk_depts', null, 'atk_today', null);
  end;

  return r;
end $$;

revoke all on function get_fm_snapshot() from public;
grant execute on function get_fm_snapshot() to anon, authenticated;


-- ######################################################################
-- ## BAGIAN 029  (dulu: 029_fm_canteen_split.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 029 — FM COMMAND CENTER: kantin snack & makan TERPISAH
--
-- Memperbarui get_fm_snapshot() (028) supaya canteen_daily membawa angka
-- snack (so/sl) dan makan (mo/ml) per shift secara terpisah, sehingga layar
-- /dashboard-viewonly bisa menampilkan total & sisa masing-masing.
-- Kunci lama o/l (gabungan) tetap ada untuk kompatibilitas.
-- Bagian lain fungsi identik dengan 028.
--
-- Idempotent — aman dijalankan ulang. Jalankan SETELAH 028.
-- ═══════════════════════════════════════════════════════════════

create or replace function get_fm_snapshot()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_m0    date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  r jsonb;
  x jsonb; y jsonb; z jsonb; w jsonb;
begin
  r := jsonb_build_object('today', v_today, 'generated_at', now());

  -- ── TUGAS DRIVER (per hari, bulan berjalan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'done', done, 'same', same) order by d), '[]'::jsonb) into x
    from (select tanggal d,
                 count(*) filter (where status <> 'CANCELLED') n,
                 count(*) filter (where status = 'DONE') done,
                 count(*) filter (where status = 'DONE' and (completed_at at time zone 'Asia/Jakarta')::date = tanggal) same
            from tasks where tanggal between v_m0 and v_today group by tanggal) s;
    r := r || jsonb_build_object('tasks_daily', x);
  exception when others then r := r || jsonb_build_object('tasks_daily', null);
  end;

  -- ── ARMADA (dokumen jatuh tempo + pemakaian bulan berjalan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'nopol', v.nopol, 'jenis', v.jenis, 'plant', v.plant,
             'kir', v.kir_date, 'stnk', v.stnk_date, 'service', v.service_date,
             'days', (select count(distinct t.tanggal) from tasks t where t.vehicle_id = v.id and t.tanggal between v_m0 and v_today and t.status <> 'CANCELLED'),
             'trips', (select count(*) from tasks t where t.vehicle_id = v.id and t.tanggal between v_m0 and v_today and t.status <> 'CANCELLED')
           ) order by v.nopol), '[]'::jsonb) into x
      from vehicles v where v.aktif;
    r := r || jsonb_build_object('vehicles', x);
  exception when others then r := r || jsonb_build_object('vehicles', null);
  end;

  -- ── GATE (per hari bulan berjalan, per jam hari ini, yang masih terbuka) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'done', done, 'trip', trip) order by d), '[]'::jsonb) into x
    from (select (coalesce(time_out, time_in, created_at) at time zone 'Asia/Jakarta')::date d,
                 count(*) n, count(*) filter (where status = 'DONE') done,
                 round(avg(abs(extract(epoch from (time_in - time_out))) / 60) filter (where time_in is not null and time_out is not null)) trip
            from vehicle_gate_logs
           where coalesce(time_out, time_in, created_at) >= (v_m0::timestamp at time zone 'Asia/Jakarta')
           group by 1) s;
    select jsonb_build_object(
             'out', coalesce((select jsonb_agg(extract(hour from time_out at time zone 'Asia/Jakarta')::int) from vehicle_gate_logs where (time_out at time zone 'Asia/Jakarta')::date = v_today), '[]'::jsonb),
             'in',  coalesce((select jsonb_agg(extract(hour from time_in  at time zone 'Asia/Jakarta')::int) from vehicle_gate_logs where (time_in  at time zone 'Asia/Jakarta')::date = v_today), '[]'::jsonb)) into y;
    select coalesce(jsonb_agg(jsonb_build_object('plant', g.plant, 'nopol', ve.nopol,
             'since', coalesce(case when g.plant = 'CIK' then g.time_out else g.time_in end, g.created_at)) order by g.created_at), '[]'::jsonb) into z
      from vehicle_gate_logs g left join vehicles ve on ve.id = g.vehicle_id
     where g.status <> 'DONE';
    r := r || jsonb_build_object('gate_daily', x, 'gate_hours', y, 'gate_open', z);
  exception when others then r := r || jsonb_build_object('gate_daily', null, 'gate_hours', null, 'gate_open', null);
  end;

  -- ── KANTIN (per hari bulan berjalan: order & sisa per shift) ──
  --   so/sl = snack order/sisa, mo/ml = makan order/sisa — TERPISAH, tidak digabung.
  --   o/l (snack + makan) dipertahankan untuk kompatibilitas klien lama.
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', report_date,
             'so', jsonb_build_array(snack_order_1, snack_order_2, snack_order_3),
             'sl', jsonb_build_array(snack_leftover_1, snack_leftover_2, snack_leftover_3),
             'mo', jsonb_build_array(meal_order_1, meal_order_2, meal_order_3),
             'ml', jsonb_build_array(meal_leftover_1, meal_leftover_2, meal_leftover_3),
             'o', jsonb_build_array(snack_order_1 + meal_order_1, snack_order_2 + meal_order_2, snack_order_3 + meal_order_3),
             'l', jsonb_build_array(snack_leftover_1 + meal_leftover_1, snack_leftover_2 + meal_leftover_2, snack_leftover_3 + meal_leftover_3)
           ) order by report_date), '[]'::jsonb) into x
      from canteen_reports where report_date between v_m0 and v_today;
    r := r || jsonb_build_object('canteen_daily', x);
  exception when others then r := r || jsonb_build_object('canteen_daily', null);
  end;

  -- ── ATK (keluar per hari bulan berjalan, stok kritis, per departemen, item hari ini) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) into x
    from (select tanggal d, sum(jumlah) n from atk_requests where tanggal between v_m0 and v_today group by 1) s;
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into y
    from (select nama_barang nama, stok, coalesce(satuan, '') satuan, u30,
                 case when u30 > 0 then round(stok / (u30 / 30.0), 1) end cover
            from (select i.nama_barang, i.stok, i.satuan,
                         (select coalesce(sum(q.jumlah), 0) from atk_requests q where q.kode_barang = i.kode_barang and q.tanggal > v_today - 30) u30
                    from atk_items i) a
           where stok <= 0 or (u30 > 0 and stok / (u30 / 30.0) < 14)
           order by case when stok <= 0 then -1 else stok / nullif(u30 / 30.0, 0) end nulls last
           limit 8) s;
    select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) into z
    from (select coalesce(nullif(departemen, ''), 'Lainnya') k, sum(jumlah) n from atk_requests where tanggal between v_m0 and v_today group by 1 order by 2 desc limit 6) s;
    select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) into w
    from (select coalesce(i.nama_barang, q.kode_barang) k, sum(q.jumlah) n
            from atk_requests q left join atk_items i on i.kode_barang = q.kode_barang
           where q.tanggal = v_today group by 1 order by 2 desc limit 6) s;
    r := r || jsonb_build_object('atk_daily', x, 'atk_critical', y, 'atk_depts', z, 'atk_today', w);
  exception when others then r := r || jsonb_build_object('atk_daily', null, 'atk_critical', null, 'atk_depts', null, 'atk_today', null);
  end;

  return r;
end $$;

revoke all on function get_fm_snapshot() from public;
grant execute on function get_fm_snapshot() to anon, authenticated;


-- ######################################################################
-- ## BAGIAN 030  (dulu: 030_driver_support.sql)
-- ######################################################################

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


-- ######################################################################
-- ## BAGIAN 031  (dulu: 031_receptionist.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 031 — RECEPTIONIST: Wifi Guest, Barang & Surat, Induction Room
--
-- 1. Wifi Guest
--    • rcp_wifi_accounts : akun dari IT, masing-masing dengan masa berlakunya
--      sendiri (mis. 30 / 90 hari). 1 akun = 2 slot (bisa diubah per akun).
--    • rcp_wifi_grants   : pemberian akses ke tamu (nomor WF-YYMM-###).
--      Slot dianggap TERPAKAI selama: belum dikembalikan DAN tanggal selesai
--      ≥ hari ini (WIB). Jadi slot otomatis kembali di akhir hari terakhir
--      pemakaian (tamu harian = akhir hari itu) tanpa perlu job terjadwal.
--    • rcp_wifi_suggest  : hanya menyarankan akun yang masa berlakunya cukup
--      untuk durasi pemakaian, urut dari yang paling cepat habis → tamu harian
--      memakai akun 30 hari, pemakaian 3 bulan otomatis ke akun berdurasi panjang.
-- 2. Barang & Surat (IN-YYMM-### masuk, OUT-YYMM-### keluar) + buku alamat
--    email yang terbentuk sendiri dari nama yang pernah diinput (rcp_contacts).
-- 3. Induction Room: booking dengan tolak-bentrok, jam operasional dari
--    pengaturan, booking berulang, dan sinkron otomatis ke Kalender & Agenda.
-- 4. rcp_board() : ringkasan aman (tanpa nama/password) untuk FM Command Center.
--
-- Akses: hanya pengguna dashboard (punya baris di profiles). rcp_board() boleh anon.
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 025 (Kalender & Agenda).
-- ═══════════════════════════════════════════════════════════════

-- ── 0) Helper ──
create or replace function rcp_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

create or replace function rcp_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

create or replace function rcp_staff_name() returns text
language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  select coalesce(full_name, '') into n from profiles where id = auth.uid();
  if not found then raise exception 'Akses ditolak: akun tidak terdaftar di CIKOPS.' using errcode = '42501'; end if;
  return n;
end $$;

-- ── 1) Pengaturan (1 baris) ──
create table if not exists rcp_settings (
  id            int primary key default 1 check (id = 1),
  open_time     time not null default '06:00',
  close_time    time not null default '22:00',
  slot_minutes  int  not null default 30 check (slot_minutes in (15, 30, 60)),
  room_name     text not null default 'Induction Room',
  wifi_ssid     text not null default '',
  wifi_terms    text not null default
    '1. Akun hanya untuk tamu yang tercantum dan tidak boleh dibagikan.' || chr(10) ||
    '2. Satu akun berlaku untuk maksimal 2 perangkat.' || chr(10) ||
    '3. Dilarang mengakses konten ilegal atau melanggar kebijakan perusahaan.' || chr(10) ||
    '4. Akses berakhir otomatis pada tanggal berlaku atau saat tamu meninggalkan lokasi.',
  updated_at    timestamptz not null default now()
);
insert into rcp_settings (id) values (1) on conflict (id) do nothing;

-- ── 2) Nomor tanda terima: PREFIX-YYMM-### (urut per bulan) ──
create table if not exists rcp_counters (
  prefix text not null,
  period text not null,
  last   int  not null default 0,
  primary key (prefix, period)
);

create or replace function rcp_next_no(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(now() at time zone 'Asia/Jakarta', 'YYMM'); v int;
begin
  insert into rcp_counters (prefix, period, last) values (p_prefix, v_period, 1)
  on conflict (prefix, period) do update set last = rcp_counters.last + 1
  returning last into v;
  return p_prefix || '-' || v_period || '-' || lpad(v::text, 3, '0');
end $$;

-- ── 3) Buku alamat (nama → email) yang terbentuk sendiri ──
create table if not exists rcp_contacts (
  name_key   text primary key,               -- lower(trim(nama))
  name       text not null,
  email      text not null,
  department text not null default '',
  use_count  int  not null default 1,
  updated_at timestamptz not null default now()
);

create or replace function rcp_remember_contact(p_name text, p_email text, p_department text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then return; end if;
  insert into rcp_contacts (name_key, name, email, department)
  values (lower(trim(p_name)), trim(p_name), lower(trim(p_email)), coalesce(trim(p_department), ''))
  on conflict (name_key) do update set
    email = excluded.email,
    department = case when excluded.department <> '' then excluded.department else rcp_contacts.department end,
    use_count = rcp_contacts.use_count + 1,
    updated_at = now();
end $$;

-- ── 4) WIFI GUEST ──
create table if not exists rcp_wifi_accounts (
  id          uuid primary key default gen_random_uuid(),
  username    text not null unique,
  password    text not null default '',
  valid_from  date not null default ((now() at time zone 'Asia/Jakarta')::date),
  valid_until date not null,
  slots       int  not null default 2 check (slots between 1 and 10),
  batch       text not null default '',
  notes       text not null default '',
  active      boolean not null default true,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  check (valid_until >= valid_from)
);

create table if not exists rcp_wifi_grants (
  id              uuid primary key default gen_random_uuid(),
  receipt_no      text not null unique,
  account_id      uuid not null references rcp_wifi_accounts(id) on delete restrict,
  slots           int  not null default 1 check (slots between 1 and 10),
  guest_name      text not null,
  guest_company   text not null default '',
  requestor_name  text not null,
  requestor_email text not null default '',
  department      text not null default '',
  line_manager    text not null default '',   -- hanya dicatat, tanpa notifikasi
  purpose         text not null default '',
  start_date      date not null,
  end_date        date not null,
  returned_at     timestamptz,
  return_note     text not null default '',
  email_sent_at   timestamptz,
  created_by      text not null default '',
  created_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists rcp_wifi_grants_active_idx on rcp_wifi_grants (account_id, end_date) where returned_at is null;
create index if not exists rcp_wifi_grants_created_idx on rcp_wifi_grants (created_at);

/** Slot terpakai sebuah akun hari ini. */
create or replace function rcp_wifi_used(p_account uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(slots), 0)::int from rcp_wifi_grants
   where account_id = p_account and returned_at is null and end_date >= rcp_today();
$$;

/** Semua akun + status: available | partial | full | expired | inactive. */
create or replace function rcp_wifi_accounts_status()
returns table (id uuid, username text, password text, valid_from date, valid_until date, slots int, used int, free int,
               days_left int, duration_days int, status text, batch text, notes text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not rcp_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  return query
  select a.id, a.username, a.password, a.valid_from, a.valid_until, a.slots,
         u.used, greatest(a.slots - u.used, 0),
         (a.valid_until - rcp_today())::int, (a.valid_until - a.valid_from)::int,
         case when not a.active then 'inactive'
              when a.valid_until < rcp_today() then 'expired'
              when u.used >= a.slots then 'full'
              when u.used > 0 then 'partial'
              else 'available' end,
         a.batch, a.notes, a.active, a.created_at
    from rcp_wifi_accounts a
    cross join lateral (select rcp_wifi_used(a.id) as used) u
   order by a.valid_until, a.username;
end $$;

/** Saran akun untuk pemakaian sampai p_end (inklusif) yang butuh p_slots slot. */
create or replace function rcp_wifi_suggest(p_end date, p_slots int default 1)
returns table (id uuid, username text, valid_until date, free int, days_left int, duration_days int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not rcp_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  return query
  select s.id, s.username, s.valid_until, s.free, s.days_left, s.duration_days
    from rcp_wifi_accounts_status() s
   where s.status in ('available', 'partial') and s.valid_until >= p_end and s.free >= greatest(p_slots, 1)
   -- paling pas dulu: akun yang paling cepat habis tapi masih cukup, lalu isi akun yang sudah terpakai sebagian
   order by s.valid_until, s.free, s.username
   limit 8;
end $$;

/** Impor akun dari IT. p_rows: [{"username":"g001","password":"x","valid_from":"2026-10-01","valid_until":"2026-10-31","slots":2,"batch":"Okt"}] */
create or replace function rcp_wifi_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text; r record; n_new int := 0; n_upd int := 0;
begin
  v_by := rcp_staff_name();
  for r in select * from jsonb_to_recordset(p_rows) as x(username text, password text, valid_from date, valid_until date, slots int, batch text, notes text) loop
    if coalesce(trim(r.username), '') = '' or r.valid_until is null then continue; end if;
    if exists (select 1 from rcp_wifi_accounts where username = trim(r.username)) then
      update rcp_wifi_accounts set
        password = coalesce(r.password, password),
        valid_from = coalesce(r.valid_from, valid_from),
        valid_until = r.valid_until,
        slots = coalesce(r.slots, slots),
        batch = coalesce(nullif(trim(r.batch), ''), batch),
        notes = coalesce(nullif(trim(r.notes), ''), notes),
        active = true
       where username = trim(r.username);
      n_upd := n_upd + 1;
    else
      insert into rcp_wifi_accounts (username, password, valid_from, valid_until, slots, batch, notes, created_by)
      values (trim(r.username), coalesce(r.password, ''), coalesce(r.valid_from, least(rcp_today(), r.valid_until)), r.valid_until,
              coalesce(r.slots, 2), coalesce(trim(r.batch), ''), coalesce(trim(r.notes), ''), v_by);
      n_new := n_new + 1;
    end if;
  end loop;
  return jsonb_build_object('created', n_new, 'updated', n_upd);
end $$;

/** Beri akses wifi. Mengunci akun supaya 2 resepsionis tidak memakai slot yang sama. */
create or replace function rcp_wifi_grant(
  p_account_id uuid, p_slots int, p_guest_name text, p_guest_company text,
  p_requestor_name text, p_requestor_email text, p_department text, p_line_manager text,
  p_purpose text, p_start date, p_end date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text; a rcp_wifi_accounts%rowtype; v_used int; v_no text; v_id uuid;
begin
  v_by := rcp_staff_name();
  if coalesce(trim(p_guest_name), '') = '' then raise exception 'Nama tamu wajib diisi.'; end if;
  if coalesce(trim(p_requestor_name), '') = '' then raise exception 'Nama requestor wajib diisi.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Tanggal pemakaian tidak valid.'; end if;
  if p_end < rcp_today() then raise exception 'Tanggal selesai sudah lewat.'; end if;

  select * into a from rcp_wifi_accounts where id = p_account_id for update;
  if not found or not a.active then raise exception 'Akun wifi tidak ditemukan / nonaktif.'; end if;
  if a.valid_until < p_end then
    raise exception 'Akun % hanya berlaku sampai % — tidak cukup untuk pemakaian sampai %.', a.username, to_char(a.valid_until, 'DD Mon YYYY'), to_char(p_end, 'DD Mon YYYY');
  end if;
  v_used := rcp_wifi_used(a.id);
  if v_used + greatest(p_slots, 1) > a.slots then
    raise exception 'Slot akun % tidak cukup (tersisa %).', a.username, greatest(a.slots - v_used, 0);
  end if;

  v_no := rcp_next_no('WF');
  insert into rcp_wifi_grants (receipt_no, account_id, slots, guest_name, guest_company, requestor_name, requestor_email,
                               department, line_manager, purpose, start_date, end_date, created_by)
  values (v_no, a.id, greatest(p_slots, 1), trim(p_guest_name), coalesce(trim(p_guest_company), ''), trim(p_requestor_name),
          lower(coalesce(trim(p_requestor_email), '')), coalesce(trim(p_department), ''), coalesce(trim(p_line_manager), ''),
          coalesce(trim(p_purpose), ''), p_start, p_end, v_by)
  returning id into v_id;

  perform rcp_remember_contact(p_requestor_name, p_requestor_email, p_department);
  return jsonb_build_object('id', v_id, 'receipt_no', v_no, 'username', a.username, 'password', a.password,
                            'start_date', p_start, 'end_date', p_end, 'account_valid_until', a.valid_until);
end $$;

create or replace function rcp_wifi_return(p_grant_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform rcp_staff_name();
  update rcp_wifi_grants set returned_at = now(), return_note = coalesce(trim(p_note), '')
   where id = p_grant_id and returned_at is null;
end $$;

-- ── 5) BARANG & SURAT ──
create table if not exists rcp_parcels (
  id          uuid primary key default gen_random_uuid(),
  receipt_no  text not null unique,
  direction   text not null check (direction in ('in', 'out')),
  item_type   text not null default 'Paket',
  description text not null default '',
  sender      text not null default '',   -- dari
  recipient   text not null default '',   -- untuk
  department  text not null default '',
  email       text not null default '',   -- email karyawan (penerima utk IN, pengirim utk OUT)
  courier     text not null default '',
  status      text not null default 'waiting' check (status in ('waiting', 'handed')),
  handed_to   text not null default '',   -- nama pengambil / kurir
  handed_at   timestamptz,
  handed_by   text not null default '',
  notified_at timestamptz,
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists rcp_parcels_status_idx on rcp_parcels (status, created_at);

create or replace function rcp_parcel_create(
  p_direction text, p_item_type text, p_description text, p_sender text, p_recipient text,
  p_department text, p_email text, p_courier text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text; v_no text; v_id uuid;
begin
  v_by := rcp_staff_name();
  if p_direction not in ('in', 'out') then raise exception 'Arah barang tidak valid.'; end if;
  if coalesce(trim(p_recipient), '') = '' and coalesce(trim(p_sender), '') = '' then raise exception 'Isi dari / untuk siapa.'; end if;
  v_no := rcp_next_no(case when p_direction = 'in' then 'IN' else 'OUT' end);
  insert into rcp_parcels (receipt_no, direction, item_type, description, sender, recipient, department, email, courier, created_by)
  values (v_no, p_direction, coalesce(nullif(trim(p_item_type), ''), 'Paket'), coalesce(trim(p_description), ''),
          coalesce(trim(p_sender), ''), coalesce(trim(p_recipient), ''), coalesce(trim(p_department), ''),
          lower(coalesce(trim(p_email), '')), coalesce(trim(p_courier), ''), v_by)
  returning id into v_id;
  -- karyawan internal = penerima (IN) atau pengirim (OUT)
  perform rcp_remember_contact(case when p_direction = 'in' then p_recipient else p_sender end, p_email, p_department);
  return jsonb_build_object('id', v_id, 'receipt_no', v_no);
end $$;

create or replace function rcp_parcel_handover(p_id uuid, p_handed_to text) returns void
language plpgsql security definer set search_path = public as $$
declare v_by text;
begin
  v_by := rcp_staff_name();
  if coalesce(trim(p_handed_to), '') = '' then raise exception 'Nama pengambil wajib diisi.'; end if;
  update rcp_parcels set status = 'handed', handed_to = trim(p_handed_to), handed_at = now(), handed_by = v_by
   where id = p_id and status = 'waiting';
  if not found then raise exception 'Barang sudah diserahkan atau tidak ditemukan.'; end if;
end $$;

-- ── 6) INDUCTION ROOM ──
create table if not exists rcp_room_bookings (
  id           uuid primary key default gen_random_uuid(),
  room         text not null default 'Induction Room',
  booking_date date not null,
  start_time   time not null,
  end_time     time not null,
  title        text not null,
  pic_name     text not null default '',
  department   text not null default '',
  attendees    int,
  notes        text not null default '',
  series_id    uuid,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists rcp_room_bookings_date_idx on rcp_room_bookings (room, booking_date);

/** Tolak jadwal bentrok & di luar jam operasional (berlaku untuk semua jalur input). */
create or replace function rcp_room_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare st rcp_settings%rowtype; c rcp_room_bookings%rowtype;
begin
  select * into st from rcp_settings where id = 1;
  if found and (new.start_time < st.open_time or new.end_time > st.close_time) then
    raise exception 'Di luar jam operasional (% – %).', to_char(st.open_time, 'HH24:MI'), to_char(st.close_time, 'HH24:MI');
  end if;
  select * into c from rcp_room_bookings b
   where b.room = new.room and b.booking_date = new.booking_date and b.id <> new.id
     and b.start_time < new.end_time and new.start_time < b.end_time
   limit 1;
  if found then
    raise exception 'Bentrok dengan "%" pada % (% – %).', c.title, to_char(c.booking_date, 'DD Mon YYYY'),
      to_char(c.start_time, 'HH24:MI'), to_char(c.end_time, 'HH24:MI') using errcode = '23P01';
  end if;
  return new;
end $$;
drop trigger if exists trg_rcp_room_guard on rcp_room_bookings;
create trigger trg_rcp_room_guard before insert or update on rcp_room_bookings
  for each row execute function rcp_room_guard();

/** Booking (tunggal atau berulang). p_rows: [{"date":"2026-10-21","start":"08:00","end":"10:00"}, ...].
 *  p_skip_conflicts = true → tanggal yang bentrok dilewati (dilaporkan), sisanya tetap dibooking. */
create or replace function rcp_room_book(
  p_rows jsonb, p_title text, p_pic text, p_department text, p_attendees int, p_notes text, p_skip_conflicts boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text; v_series uuid; r record; v_room text; n int := 0; skipped jsonb := '[]'::jsonb;
begin
  v_by := rcp_staff_name();
  if coalesce(trim(p_title), '') = '' then raise exception 'Judul / keperluan wajib diisi.'; end if;
  if p_rows is null or jsonb_array_length(p_rows) = 0 then raise exception 'Pilih minimal 1 jadwal.'; end if;
  select room_name into v_room from rcp_settings where id = 1;
  if jsonb_array_length(p_rows) > 1 then v_series := gen_random_uuid(); end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(date date, start time, "end" time) order by 1, 2 loop
    begin
      insert into rcp_room_bookings (room, booking_date, start_time, end_time, title, pic_name, department, attendees, notes, series_id, created_by)
      values (coalesce(v_room, 'Induction Room'), r.date, r.start, r."end", trim(p_title), coalesce(trim(p_pic), ''),
              coalesce(trim(p_department), ''), p_attendees, coalesce(trim(p_notes), ''), v_series, v_by);
      n := n + 1;
    exception when others then
      if not p_skip_conflicts then raise; end if;
      skipped := skipped || jsonb_build_object('date', r.date, 'reason', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', n, 'skipped', skipped, 'series_id', v_series);
end $$;

-- Sinkron ke Kalender & Agenda (agenda_events, migrasi 025): 1 booking = 1 agenda.
alter table agenda_events add column if not exists rcp_booking_id uuid references rcp_room_bookings(id) on delete cascade;
create unique index if not exists agenda_events_rcp_booking_idx on agenda_events (rcp_booking_id) where rcp_booking_id is not null;

create or replace function rcp_room_sync_agenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into agenda_events (title, location, event_date, event_time, end_time, color, kategori, notes, pic, created_by, rcp_booking_id)
    values (new.title, new.room, new.booking_date, to_char(new.start_time, 'HH24:MI'), to_char(new.end_time, 'HH24:MI'), 'green',
            'pelatihan', trim(both ' · ' from concat_ws(' · ', nullif(new.department, ''), case when new.attendees is not null then new.attendees || ' orang' end, nullif(new.notes, ''))),
            new.pic_name, new.created_by, new.id);
  else
    update agenda_events set title = new.title, location = new.room, event_date = new.booking_date,
           event_time = to_char(new.start_time, 'HH24:MI'), end_time = to_char(new.end_time, 'HH24:MI'), pic = new.pic_name,
           notes = trim(both ' · ' from concat_ws(' · ', nullif(new.department, ''), case when new.attendees is not null then new.attendees || ' orang' end, nullif(new.notes, ''))),
           updated_at = now()
     where rcp_booking_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_rcp_room_agenda on rcp_room_bookings;
create trigger trg_rcp_room_agenda after insert or update on rcp_room_bookings
  for each row execute function rcp_room_sync_agenda();

-- ── 7) RLS: hanya pengguna dashboard ──
do $$
declare t text;
begin
  foreach t in array array['rcp_settings', 'rcp_counters', 'rcp_contacts', 'rcp_wifi_accounts', 'rcp_wifi_grants', 'rcp_parcels', 'rcp_room_bookings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_staff', t);
    execute format('create policy %I on %I for all to authenticated using (rcp_is_staff()) with check (rcp_is_staff())', t || '_staff', t);
  end loop;
end $$;

-- ── 8) Ringkasan untuk FM Command Center (tanpa nama orang & password) ──
create or replace function rcp_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := rcp_today(); r jsonb;
begin
  select jsonb_build_object(
    'today', v_today,
    'wifi', (select jsonb_build_object(
               'accounts', count(*) filter (where a.active and a.valid_until >= v_today),
               'slots', coalesce(sum(a.slots) filter (where a.active and a.valid_until >= v_today), 0),
               'used', coalesce(sum(least(rcp_wifi_used(a.id), a.slots)) filter (where a.active and a.valid_until >= v_today), 0),
               'expiring7', count(*) filter (where a.active and a.valid_until between v_today and v_today + 7),
               'guests_today', (select count(*) from rcp_wifi_grants g where g.created_at >= (v_today::timestamp at time zone 'Asia/Jakarta')))
             from rcp_wifi_accounts a),
    'parcels', (select jsonb_build_object(
               'waiting', count(*) filter (where p.status = 'waiting'),
               'waiting_in', count(*) filter (where p.status = 'waiting' and p.direction = 'in'),
               'waiting_out', count(*) filter (where p.status = 'waiting' and p.direction = 'out'),
               'waiting_old', count(*) filter (where p.status = 'waiting' and p.created_at < now() - interval '2 days'),
               'in_today', count(*) filter (where (p.created_at at time zone 'Asia/Jakarta')::date = v_today),
               'handed_today', count(*) filter (where (p.handed_at at time zone 'Asia/Jakarta')::date = v_today))
             from rcp_parcels p),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('start', to_char(b.start_time, 'HH24:MI'), 'end', to_char(b.end_time, 'HH24:MI'), 'title', b.title, 'attendees', b.attendees) order by b.start_time)
             from rcp_room_bookings b where b.booking_date = v_today), '[]'::jsonb),
    'bookings_week', (select count(*) from rcp_room_bookings b where b.booking_date between v_today and v_today + 6)
  ) into r;
  return r;
end $$;

revoke all on function rcp_board() from public;
grant execute on function rcp_board() to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['rcp_is_staff()', 'rcp_staff_name()', 'rcp_next_no(text)', 'rcp_remember_contact(text,text,text)', 'rcp_wifi_used(uuid)',
    'rcp_wifi_accounts_status()', 'rcp_wifi_suggest(date,int)', 'rcp_wifi_import(jsonb)',
    'rcp_wifi_grant(uuid,int,text,text,text,text,text,text,text,date,date)', 'rcp_wifi_return(uuid,text)',
    'rcp_parcel_create(text,text,text,text,text,text,text,text)', 'rcp_parcel_handover(uuid,text)',
    'rcp_room_book(jsonb,text,text,text,int,text,boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Minta API Supabase (PostgREST) memuat ulang daftar tabel/kolom/fungsi baru.
notify pgrst, 'reload schema';


-- ######################################################################
-- ## BAGIAN 032  (dulu: 032_role_receptionist.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 032 — Role RECEPTIONIST: akun yang hanya bisa membuka menu Receptionist
--
-- LANGKAH:
--   1. Supabase → Authentication → Users → "Add user" → "Create new user"
--        Email    : receptionist@cikops.com
--        Password : (buat password kuat, simpan di tempat aman)
--        Centang "Auto Confirm User".
--   2. Jalankan file ini di Supabase → SQL Editor.
--      (Bila langkah 1 belum dilakukan, bagian role tetap terpasang;
--       jalankan ulang file ini setelah akunnya dibuat.)
--
-- Efek:
--   • profiles.role boleh bernilai 'receptionist' (role lama tetap sah).
--   • Profil receptionist@cikops.com: role 'receptionist', allowed_tabs =
--     ['receptionist'], bukan master admin, tanpa batas plant.
--   • Aplikasi mengunci role ini ke menu Receptionist saja: tanpa Home,
--     Ringkasan, Kalender, pencarian, atau menu lain — apa pun isi allowed_tabs.
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 031.
-- ═══════════════════════════════════════════════════════════════

-- 1) Izinkan role 'receptionist' — constraint lama diganti, semua role yang sudah dipakai tetap sah.
do $$
declare c record; v_roles text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.profiles'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table profiles drop constraint %I', c.conname);
  end loop;
  select string_agg(quote_literal(r), ', ') into v_roles
    from (select distinct role as r from profiles where role is not null
          union select unnest(array['admin', 'ga', 'receptionist'])) x;
  execute format('alter table profiles add constraint profiles_role_check check (role in (%s))', v_roles);
end $$;

-- 2) Kolom pembatas akses (biasanya sudah ada; ditambahkan bila belum)
alter table profiles add column if not exists allowed_tabs text[];
alter table profiles add column if not exists is_master_admin boolean not null default false;

-- 3) Profil akun receptionist@cikops.com
do $$
declare v_id uuid; v_type text;
begin
  select id into v_id from auth.users where lower(email) = 'receptionist@cikops.com' limit 1;
  if v_id is null then
    raise notice 'Akun receptionist@cikops.com belum ada di Authentication → Users. Buat dulu, lalu jalankan ulang file ini.';
    return;
  end if;

  insert into profiles (id, full_name, role) values (v_id, 'Receptionist', 'receptionist')
  on conflict (id) do update set role = 'receptionist', full_name = coalesce(nullif(profiles.full_name, ''), 'Receptionist');

  -- allowed_tabs bisa bertipe text[] atau jsonb tergantung riwayat database
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'allowed_tabs';
  if v_type = 'jsonb' or v_type = 'json' then
    execute 'update profiles set allowed_tabs = ''["receptionist"]''::' || v_type || ' where id = $1' using v_id;
  else
    update profiles set allowed_tabs = array['receptionist'] where id = v_id;
  end if;

  update profiles set is_master_admin = false where id = v_id;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'plant_scope') then
    execute 'update profiles set plant_scope = null where id = $1' using v_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'access_scope') then
    execute 'update profiles set access_scope = ''full'' where id = $1' using v_id;
  end if;
  raise notice 'Profil receptionist@cikops.com siap: role receptionist, hanya menu Receptionist.';
end $$;

-- Minta API Supabase (PostgREST) memuat ulang daftar tabel/kolom/fungsi baru.
notify pgrst, 'reload schema';

-- 4) Cek hasil
select u.email, p.full_name, p.role, p.allowed_tabs::text as allowed_tabs, p.is_master_admin
  from profiles p join auth.users u on u.id = p.id
 where p.role = 'receptionist';


-- ######################################################################
-- ## BAGIAN 033  (dulu: 033_receptionist_data_bukti.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 033 — RECEPTIONIST: Data Master (karyawan) + Bukti Permintaan
--
-- 1. employees: kolom email, no_hp, jabatan, aktif — dipakai CRUD Data Karyawan
--    dan pengisian email otomatis. Buku alamat (rcp_contacts) ikut mengisi
--    email karyawan yang masih kosong (sinkron dua arah, tanpa menimpa).
-- 2. Bukti Permintaan: setiap wifi / barang / booking punya share_token acak
--    (80 bit) untuk tautan publik /bukti?t=… yang bisa dibuka requestor.
--    Booking ruangan kini juga bernomor BK-YYMM-### dan bisa punya email PIC.
-- 3. rcp_receipt(token): data bukti untuk halaman publik (tanpa login).
--    Password wifi hanya ditampilkan selama aksesnya masih aktif.
--
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 031 (dan 032).
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Data karyawan ──
-- (nik ikut ditambahkan: di sebagian database tabel employees dibuat tanpa kolom ini)
alter table employees add column if not exists nik        text;
alter table employees add column if not exists email      text;
alter table employees add column if not exists no_hp      text;
alter table employees add column if not exists jabatan    text;
alter table employees add column if not exists aktif      boolean not null default true;
alter table employees add column if not exists updated_at timestamptz;
create index if not exists employees_nama_lower_idx on employees (lower(nama));

-- Buku alamat juga melengkapi email karyawan yang masih kosong (tidak menimpa).
create or replace function rcp_remember_contact(p_name text, p_email text, p_department text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then return; end if;
  insert into rcp_contacts (name_key, name, email, department)
  values (lower(trim(p_name)), trim(p_name), lower(trim(p_email)), coalesce(trim(p_department), ''))
  on conflict (name_key) do update set
    email = excluded.email,
    department = case when excluded.department <> '' then excluded.department else rcp_contacts.department end,
    use_count = rcp_contacts.use_count + 1,
    updated_at = now();
  update employees set email = lower(trim(p_email)), updated_at = now()
   where lower(trim(nama)) = lower(trim(p_name)) and coalesce(email, '') = '';
end $$;

-- ── 2) Token tautan bukti + nomor booking ──
create or replace function rcp_new_token() returns text
language sql volatile as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 20) $$;

alter table rcp_wifi_grants   add column if not exists share_token text;
alter table rcp_parcels       add column if not exists share_token text;
alter table rcp_room_bookings add column if not exists share_token text;
alter table rcp_room_bookings add column if not exists receipt_no  text;
alter table rcp_room_bookings add column if not exists pic_email   text not null default '';

update rcp_wifi_grants   set share_token = rcp_new_token() where share_token is null;
update rcp_parcels       set share_token = rcp_new_token() where share_token is null;
update rcp_room_bookings set share_token = rcp_new_token() where share_token is null;
do $$
declare b record;
begin
  for b in select id from rcp_room_bookings where receipt_no is null order by created_at loop
    update rcp_room_bookings set receipt_no = rcp_next_no('BK') where id = b.id;
  end loop;
end $$;

alter table rcp_wifi_grants   alter column share_token set default rcp_new_token();
alter table rcp_parcels       alter column share_token set default rcp_new_token();
alter table rcp_room_bookings alter column share_token set default rcp_new_token();
alter table rcp_room_bookings alter column receipt_no  set default rcp_next_no('BK');
create unique index if not exists rcp_wifi_grants_token_idx   on rcp_wifi_grants (share_token);
create unique index if not exists rcp_parcels_token_idx       on rcp_parcels (share_token);
create unique index if not exists rcp_room_bookings_token_idx on rcp_room_bookings (share_token);

-- Booking (tunggal / berulang) — kini menerima email PIC untuk konfirmasi.
drop function if exists rcp_room_book(jsonb, text, text, text, int, text, boolean);
create or replace function rcp_room_book(
  p_rows jsonb, p_title text, p_pic text, p_department text, p_attendees int, p_notes text,
  p_skip_conflicts boolean default false, p_email text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text; v_series uuid; r record; v_room text; n int := 0; skipped jsonb := '[]'::jsonb; v_first uuid; v_id uuid;
begin
  v_by := rcp_staff_name();
  if coalesce(trim(p_title), '') = '' then raise exception 'Judul / keperluan wajib diisi.'; end if;
  if p_rows is null or jsonb_array_length(p_rows) = 0 then raise exception 'Pilih minimal 1 jadwal.'; end if;
  select room_name into v_room from rcp_settings where id = 1;
  if jsonb_array_length(p_rows) > 1 then v_series := gen_random_uuid(); end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(date date, start time, "end" time) order by 1, 2 loop
    begin
      insert into rcp_room_bookings (room, booking_date, start_time, end_time, title, pic_name, pic_email, department, attendees, notes, series_id, created_by)
      values (coalesce(v_room, 'Induction Room'), r.date, r.start, r."end", trim(p_title), coalesce(trim(p_pic), ''), lower(coalesce(trim(p_email), '')),
              coalesce(trim(p_department), ''), p_attendees, coalesce(trim(p_notes), ''), v_series, v_by)
      returning id into v_id;
      v_first := coalesce(v_first, v_id);
      n := n + 1;
    exception when others then
      if not p_skip_conflicts then raise; end if;
      skipped := skipped || jsonb_build_object('date', r.date, 'reason', sqlerrm);
    end;
  end loop;
  perform rcp_remember_contact(p_pic, p_email, p_department);
  return jsonb_build_object('created', n, 'skipped', skipped, 'series_id', v_series, 'first_id', v_first);
end $$;
revoke all on function rcp_room_book(jsonb, text, text, text, int, text, boolean, text) from public;
grant execute on function rcp_room_book(jsonb, text, text, text, int, text, boolean, text) to authenticated;

-- ── 3) Data bukti untuk halaman publik /bukti?t=… ──
create or replace function rcp_receipt(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; st rcp_settings%rowtype; v_today date := rcp_today();
begin
  if coalesce(length(p_token), 0) < 16 then return null; end if;
  select * into st from rcp_settings where id = 1;

  select jsonb_build_object(
      'kind', 'wifi', 'receipt_no', g.receipt_no, 'created_at', g.created_at, 'created_by', g.created_by,
      'guest_name', g.guest_name, 'guest_company', g.guest_company, 'requestor_name', g.requestor_name,
      'department', g.department, 'purpose', g.purpose, 'slots', g.slots, 'start_date', g.start_date, 'end_date', g.end_date,
      'returned_at', g.returned_at,
      'status', case when g.returned_at is not null then 'returned' when g.end_date < v_today then 'ended' else 'active' end,
      'username', a.username,
      'password', case when g.returned_at is null and g.end_date >= v_today then a.password end,
      'ssid', st.wifi_ssid, 'terms', st.wifi_terms)
    into v
    from rcp_wifi_grants g join rcp_wifi_accounts a on a.id = g.account_id
   where g.share_token = p_token;
  if v is not null then return v; end if;

  select jsonb_build_object(
      'kind', 'parcel', 'receipt_no', p.receipt_no, 'created_at', p.created_at, 'created_by', p.created_by,
      'direction', p.direction, 'item_type', p.item_type, 'description', p.description, 'sender', p.sender,
      'recipient', p.recipient, 'department', p.department, 'courier', p.courier,
      'status', p.status, 'handed_to', p.handed_to, 'handed_at', p.handed_at)
    into v from rcp_parcels p where p.share_token = p_token;
  if v is not null then return v; end if;

  select jsonb_build_object(
      'kind', 'booking', 'receipt_no', b.receipt_no, 'created_at', b.created_at, 'created_by', b.created_by,
      'room', b.room, 'date', b.booking_date, 'start', to_char(b.start_time, 'HH24:MI'), 'end', to_char(b.end_time, 'HH24:MI'),
      'title', b.title, 'pic', b.pic_name, 'department', b.department, 'attendees', b.attendees, 'notes', b.notes,
      'status', case when b.booking_date < v_today then 'done' else 'confirmed' end,
      'series', case when b.series_id is null then null else (
        select jsonb_build_object('count', count(*), 'first', min(s.booking_date), 'last', max(s.booking_date))
          from rcp_room_bookings s where s.series_id = b.series_id) end)
    into v from rcp_room_bookings b where b.share_token = p_token;
  return v;
end $$;
revoke all on function rcp_receipt(text) from public;
grant execute on function rcp_receipt(text) to anon, authenticated;

-- Minta API Supabase (PostgREST) memuat ulang daftar tabel/kolom/fungsi baru.
notify pgrst, 'reload schema';

-- ── 4) Cek hasil ──
select 'karyawan dengan email' as cek, count(*)::text as hasil from employees where coalesce(email, '') <> ''
union all select 'booking bernomor', count(*)::text from rcp_room_bookings where receipt_no is not null
union all select 'token bukti wifi', count(*)::text from rcp_wifi_grants where share_token is not null;


-- ######################################################################
-- ## BAGIAN 034  (dulu: 034_tga_app.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 034 — APLIKASI TGA (Teknisi GA) — /tga, bisa di-install di HP
--
-- • tga_users      : akun teknisi (nama + PIN terenkripsi bcrypt). Dikelola dari
--                    Dashboard → Cleaning, Gardening & TGA → TGA → Akun aplikasi.
--                    5× PIN salah → terkunci 15 menit.
-- • tga_sessions   : sesi login di HP (token acak, berlaku 120 hari, diperpanjang saat dipakai).
-- • tga_activities : kegiatan yang diinput dari aplikasi (nomor TGA-YYMM-###).
--                    TERPISAH dari ga_tga (cermin Excel yang dihapus-isi ulang tiap sinkron),
--                    jadi input dari HP tidak pernah tertimpa. Dashboard menampilkan keduanya.
-- • Fungsi tga_* (tanpa login Supabase) dipakai aplikasi; semuanya memeriksa token sesi.
--
-- Idempotent — aman dijalankan ulang. Butuh ekstensi pgcrypto (sudah dipakai PIN driver).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 1) Tabel ──
create table if not exists tga_users (
  id            uuid primary key default gen_random_uuid(),
  nama          text not null unique,
  no_hp         text not null default '',
  pin_hash      text not null,
  aktif         boolean not null default true,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

-- Nama unik tanpa membedakan huruf besar/kecil (login memakai lower(nama)).
create unique index if not exists tga_users_nama_lower_idx on tga_users (lower(trim(nama)));

create table if not exists tga_sessions (
  token      text primary key,
  user_id    uuid not null references tga_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '120 days'
);
create index if not exists tga_sessions_user_idx on tga_sessions (user_id);

create table if not exists tga_counters (period text primary key, last int not null default 0);

create table if not exists tga_activities (
  id          uuid primary key default gen_random_uuid(),
  ref_no      text not null unique,
  user_id     uuid references tga_users(id) on delete set null,
  nama_tga    text not null,
  tanggal     date not null default ((now() at time zone 'Asia/Jakarta')::date),
  jam_mulai   time,
  jam_selesai time,
  kategori    text not null default 'Lainnya',
  lokasi      text not null default '',
  activity    text not null,
  request_by  text not null default '',
  departemen  text not null default '',
  status      text not null default 'selesai' check (status in ('selesai', 'proses', 'pending', 'butuh_part')),
  prioritas   text not null default 'normal' check (prioritas in ('normal', 'urgent')),
  catatan     text not null default '',
  selesai_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tga_activities_tanggal_idx on tga_activities (tanggal);
create index if not exists tga_activities_user_idx on tga_activities (user_id, tanggal);
create index if not exists tga_activities_open_idx on tga_activities (status) where status <> 'selesai';

-- ── 2) Helper ──
create or replace function tga_next_no() returns text
language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(now() at time zone 'Asia/Jakarta', 'YYMM'); v int;
begin
  insert into tga_counters (period, last) values (v_period, 1)
  on conflict (period) do update set last = tga_counters.last + 1
  returning last into v;
  return 'TGA-' || v_period || '-' || lpad(v::text, 3, '0');
end $$;

/** Pengguna dari token sesi (dan perpanjang sesi). Gagal → exception "Sesi berakhir". */
create or replace function tga_user_of(p_token text) returns tga_users
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype;
begin
  select t.* into u from tga_sessions s join tga_users t on t.id = s.user_id
   where s.token = p_token and s.expires_at > now() and t.aktif;
  if not found then raise exception 'Sesi berakhir — silakan masuk lagi.' using errcode = '28000'; end if;
  update tga_sessions set expires_at = now() + interval '120 days' where token = p_token and expires_at < now() + interval '110 days';
  return u;
end $$;

create or replace function tga_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

create or replace function tga_activity_json(a tga_activities) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', a.id, 'ref_no', a.ref_no, 'nama_tga', a.nama_tga, 'tanggal', a.tanggal,
    'jam_mulai', to_char(a.jam_mulai, 'HH24:MI'), 'jam_selesai', to_char(a.jam_selesai, 'HH24:MI'),
    'kategori', a.kategori, 'lokasi', a.lokasi, 'activity', a.activity, 'request_by', a.request_by,
    'departemen', a.departemen, 'status', a.status, 'prioritas', a.prioritas, 'catatan', a.catatan,
    'selesai_at', a.selesai_at, 'created_at', a.created_at, 'updated_at', a.updated_at)
$$;

-- ── 3) Fungsi untuk aplikasi (tanpa login Supabase) ──
/** Daftar nama teknisi aktif untuk layar masuk. */
create or replace function tga_names() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(nama order by nama), '[]'::jsonb) from tga_users where aktif;
$$;

create or replace function tga_login(p_nama text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u tga_users%rowtype; v_token text;
begin
  select * into u from tga_users where lower(nama) = lower(trim(p_nama)) and aktif;
  if not found then return jsonb_build_object('error', 'Nama tidak terdaftar atau akun nonaktif.'); end if;
  -- Gagal dikembalikan sebagai {error} (bukan exception) supaya hitungan PIN salah tetap tersimpan.
  if u.locked_until is not null and u.locked_until > now() then
    return jsonb_build_object('error', format('Terlalu banyak PIN salah. Coba lagi pukul %s.', to_char(u.locked_until at time zone 'Asia/Jakarta', 'HH24:MI')));
  end if;
  if u.pin_hash <> crypt(coalesce(p_pin, ''), u.pin_hash) then
    update tga_users set failed_count = failed_count + 1,
           locked_until = case when failed_count + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = u.id
    returning * into u;
    return jsonb_build_object('error', case when u.locked_until is not null
      then 'PIN salah 5 kali — akun dikunci 15 menit.' else format('PIN salah. Sisa %s percobaan.', 5 - u.failed_count) end);
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into tga_sessions (token, user_id) values (v_token, u.id);
  update tga_users set failed_count = 0, locked_until = null, last_login_at = now() where id = u.id;
  delete from tga_sessions where expires_at < now();
  return jsonb_build_object('token', v_token, 'nama', u.nama);
end $$;

create or replace function tga_logout(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from tga_sessions where token = p_token;
$$;

/** Profil + kegiatan milik teknisi (p_days hari terakhir) + semua yang belum selesai. */
create or replace function tga_my_data(p_token text, p_days int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  u := tga_user_of(p_token);
  return jsonb_build_object(
    'nama', u.nama, 'today', v_today,
    'activities', coalesce((select jsonb_agg(tga_activity_json(a) order by a.tanggal desc, a.created_at desc)
       from tga_activities a where a.user_id = u.id and (a.tanggal >= v_today - greatest(p_days, 1) or a.status <> 'selesai')), '[]'::jsonb),
    'month_count', (select count(*) from tga_activities a where a.user_id = u.id and date_trunc('month', a.tanggal) = date_trunc('month', v_today)));
end $$;

/** Simpan kegiatan (baru bila p_id null, ubah bila milik sendiri). */
create or replace function tga_save_activity(p_token text, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; a tga_activities%rowtype; v_status text; v_act text;
begin
  u := tga_user_of(p_token);
  v_act := trim(coalesce(p_data->>'activity', ''));
  if v_act = '' then raise exception 'Isi kegiatan yang dikerjakan.'; end if;
  v_status := coalesce(nullif(p_data->>'status', ''), 'selesai');
  if p_id is null then
    insert into tga_activities (ref_no, user_id, nama_tga, tanggal, jam_mulai, jam_selesai, kategori, lokasi, activity, request_by, departemen, status, prioritas, catatan, selesai_at)
    values (tga_next_no(), u.id, u.nama,
            coalesce(nullif(p_data->>'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            nullif(p_data->>'jam_mulai', '')::time, nullif(p_data->>'jam_selesai', '')::time,
            coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'), trim(coalesce(p_data->>'lokasi', '')), v_act,
            trim(coalesce(p_data->>'request_by', '')), trim(coalesce(p_data->>'departemen', '')), v_status,
            coalesce(nullif(p_data->>'prioritas', ''), 'normal'), trim(coalesce(p_data->>'catatan', '')),
            case when v_status = 'selesai' then now() end)
    returning * into a;
  else
    update tga_activities set
      tanggal = coalesce(nullif(p_data->>'tanggal', '')::date, tanggal),
      jam_mulai = nullif(p_data->>'jam_mulai', '')::time, jam_selesai = nullif(p_data->>'jam_selesai', '')::time,
      kategori = coalesce(nullif(trim(p_data->>'kategori'), ''), kategori), lokasi = trim(coalesce(p_data->>'lokasi', '')),
      activity = v_act, request_by = trim(coalesce(p_data->>'request_by', '')), departemen = trim(coalesce(p_data->>'departemen', '')),
      status = v_status, prioritas = coalesce(nullif(p_data->>'prioritas', ''), prioritas), catatan = trim(coalesce(p_data->>'catatan', '')),
      selesai_at = case when v_status = 'selesai' then coalesce(selesai_at, now()) else null end, updated_at = now()
     where id = p_id and user_id = u.id
    returning * into a;
    if not found then raise exception 'Kegiatan tidak ditemukan.'; end if;
  end if;
  return tga_activity_json(a);
end $$;

create or replace function tga_delete_activity(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype;
begin
  u := tga_user_of(p_token);
  delete from tga_activities where id = p_id and user_id = u.id;
end $$;

/** Nama & departemen karyawan untuk isian "Requestor". */
create or replace function tga_requestors(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform tga_user_of(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('nama', e.nama, 'dept', coalesce(e.departement, '')) order by e.nama)
    from employees e where coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb);
end $$;

-- ── 4) Fungsi dashboard (akun yang login ke CIKOPS) ──
create or replace function tga_admin_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id, 'nama', u.nama, 'no_hp', u.no_hp, 'aktif', u.aktif, 'last_login_at', u.last_login_at,
      'locked', u.locked_until is not null and u.locked_until > now(),
      'month_count', (select count(*) from tga_activities a where a.user_id = u.id and date_trunc('month', a.tanggal) = date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)))
    order by u.nama) from tga_users u), '[]'::jsonb);
end $$;

/** Tambah / ubah akun teknisi. p_pin kosong saat ubah = PIN tidak diganti. */
create or replace function tga_admin_save_user(p_id uuid, p_nama text, p_no_hp text, p_pin text, p_aktif boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  if coalesce(trim(p_nama), '') = '' then raise exception 'Nama wajib diisi.'; end if;
  if coalesce(p_pin, '') <> '' and p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN harus 4–6 angka.'; end if;
  if exists (select 1 from tga_users where lower(trim(nama)) = lower(trim(p_nama)) and id is distinct from p_id) then
    raise exception 'Nama "%" sudah punya akun.', trim(p_nama);
  end if;
  if p_id is null then
    if coalesce(p_pin, '') = '' then raise exception 'PIN wajib diisi untuk akun baru.'; end if;
    insert into tga_users (nama, no_hp, pin_hash, aktif) values (trim(p_nama), trim(coalesce(p_no_hp, '')), crypt(p_pin, gen_salt('bf')), coalesce(p_aktif, true));
  else
    update tga_users set nama = trim(p_nama), no_hp = trim(coalesce(p_no_hp, '')), aktif = coalesce(p_aktif, aktif),
           pin_hash = case when coalesce(p_pin, '') <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end,
           failed_count = case when coalesce(p_pin, '') <> '' then 0 else failed_count end,
           locked_until = case when coalesce(p_pin, '') <> '' then null else locked_until end
     where id = p_id;
    -- Nonaktif atau PIN diganti → semua sesi lama dikeluarkan.
    if not coalesce(p_aktif, true) or coalesce(p_pin, '') <> '' then delete from tga_sessions where user_id = p_id; end if;
  end if;
exception when unique_violation then
  raise exception 'Nama "%" sudah punya akun.', trim(p_nama);
end $$;

create or replace function tga_admin_delete_user(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  delete from tga_users where id = p_id;  -- kegiatannya tetap tersimpan (user_id menjadi kosong, nama tetap)
end $$;

-- ── 5) Hak akses ──
alter table tga_users enable row level security;       -- tanpa policy: hanya lewat fungsi
alter table tga_sessions enable row level security;    -- tanpa policy: hanya lewat fungsi
alter table tga_counters enable row level security;
alter table tga_activities enable row level security;
drop policy if exists tga_activities_staff on tga_activities;
create policy tga_activities_staff on tga_activities for all to authenticated using (tga_is_staff()) with check (tga_is_staff());

do $$
declare f text;
begin
  foreach f in array array['tga_names()', 'tga_login(text,text)', 'tga_logout(text)', 'tga_my_data(text,int)',
    'tga_save_activity(text,uuid,jsonb)', 'tga_delete_activity(text,uuid)', 'tga_requestors(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['tga_admin_users()', 'tga_admin_save_user(uuid,text,text,text,boolean)', 'tga_admin_delete_user(uuid)', 'tga_is_staff()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['tga_user_of(text)', 'tga_next_no()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Minta API Supabase (PostgREST) memuat ulang daftar tabel/kolom/fungsi baru.
notify pgrst, 'reload schema';


-- ######################################################################
-- ## BAGIAN 035  (dulu: 035_tga_requestor_karyawan.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 035 — TGA: Requestor tersinkron dengan Data Karyawan
--
-- • tga_activities.requestor_id → employees(id). Requestor dipilih dari
--   Data Karyawan (menu Receptionist → Data Master, atau tabel employees).
--   Nama & departemen diambil dari data karyawan, bukan ketikan bebas.
-- • Data karyawan diubah (nama / departemen) → kegiatan TGA yang terhubung
--   ikut diperbarui otomatis. Karyawan dihapus → kegiatan tetap ada, namanya tetap.
-- • Kegiatan lama dihubungkan otomatis bila namanya persis sama dengan
--   satu karyawan.
-- • Requestor di luar data karyawan (tamu / vendor) tetap boleh, ditandai
--   "di luar data karyawan".
--
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 034.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Kolom penghubung ──
alter table tga_activities add column if not exists requestor_id uuid references employees(id) on delete set null;
create index if not exists tga_activities_requestor_idx on tga_activities (requestor_id);

-- Hubungkan kegiatan lama yang namanya cocok dengan tepat satu karyawan.
update tga_activities a set requestor_id = m.id
  from (select lower(trim(nama)) as k, (array_agg(id))[1] as id from employees group by 1 having count(*) = 1) m
 where a.requestor_id is null and coalesce(trim(a.request_by), '') <> '' and lower(trim(a.request_by)) = m.k;

-- ── 2) JSON kegiatan kini membawa requestor_id ──
create or replace function tga_activity_json(a tga_activities) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'ref_no', a.ref_no, 'nama_tga', a.nama_tga, 'tanggal', a.tanggal,
    'jam_mulai', to_char(a.jam_mulai, 'HH24:MI'), 'jam_selesai', to_char(a.jam_selesai, 'HH24:MI'),
    'kategori', a.kategori, 'lokasi', a.lokasi, 'activity', a.activity, 'request_by', a.request_by,
    'requestor_id', a.requestor_id,
    'departemen', a.departemen, 'status', a.status, 'prioritas', a.prioritas, 'catatan', a.catatan,
    'selesai_at', a.selesai_at, 'created_at', a.created_at, 'updated_at', a.updated_at)
$$;

-- ── 3) Daftar karyawan untuk aplikasi (id, nama, NIK, departemen, jabatan) ──
create or replace function tga_requestors(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform tga_user_of(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nama', e.nama, 'dept', coalesce(e.departement, ''),
      'nik', coalesce(e.nik, ''), 'jabatan', coalesce(to_jsonb(e) ->> 'jabatan', '')) order by e.nama)
    from employees e
   where coalesce(trim(e.nama), '') <> '' and coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb);
end $$;

-- ── 4) Simpan kegiatan: requestor_id → nama & departemen dari Data Karyawan ──
create or replace function tga_save_activity(p_token text, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; a tga_activities%rowtype; v_status text; v_act text;
        v_req_id uuid; v_req text; v_dept text;
begin
  u := tga_user_of(p_token);
  v_act := trim(coalesce(p_data->>'activity', ''));
  if v_act = '' then raise exception 'Isi kegiatan yang dikerjakan.'; end if;
  v_status := coalesce(nullif(p_data->>'status', ''), 'selesai');

  v_req := trim(coalesce(p_data->>'request_by', ''));
  v_dept := trim(coalesce(p_data->>'departemen', ''));
  if coalesce(p_data->>'requestor_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select e.id, e.nama, coalesce(nullif(trim(e.departement), ''), v_dept)
      into v_req_id, v_req, v_dept
      from employees e where e.id = (p_data->>'requestor_id')::uuid;
    if v_req_id is null then raise exception 'Karyawan requestor tidak ditemukan — pilih ulang dari daftar.'; end if;
  end if;

  if p_id is null then
    insert into tga_activities (ref_no, user_id, nama_tga, tanggal, jam_mulai, jam_selesai, kategori, lokasi, activity,
                                request_by, requestor_id, departemen, status, prioritas, catatan, selesai_at)
    values (tga_next_no(), u.id, u.nama,
            coalesce(nullif(p_data->>'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            nullif(p_data->>'jam_mulai', '')::time, nullif(p_data->>'jam_selesai', '')::time,
            coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'), trim(coalesce(p_data->>'lokasi', '')), v_act,
            v_req, v_req_id, v_dept, v_status,
            coalesce(nullif(p_data->>'prioritas', ''), 'normal'), trim(coalesce(p_data->>'catatan', '')),
            case when v_status = 'selesai' then now() end)
    returning * into a;
  else
    update tga_activities set
      tanggal = coalesce(nullif(p_data->>'tanggal', '')::date, tanggal),
      jam_mulai = nullif(p_data->>'jam_mulai', '')::time, jam_selesai = nullif(p_data->>'jam_selesai', '')::time,
      kategori = coalesce(nullif(trim(p_data->>'kategori'), ''), kategori), lokasi = trim(coalesce(p_data->>'lokasi', '')),
      activity = v_act, request_by = v_req, requestor_id = v_req_id, departemen = v_dept,
      status = v_status, prioritas = coalesce(nullif(p_data->>'prioritas', ''), prioritas), catatan = trim(coalesce(p_data->>'catatan', '')),
      selesai_at = case when v_status = 'selesai' then coalesce(selesai_at, now()) else null end, updated_at = now()
     where id = p_id and user_id = u.id
    returning * into a;
    if not found then raise exception 'Kegiatan tidak ditemukan.'; end if;
  end if;
  return tga_activity_json(a);
end $$;

-- ── 5) Data karyawan berubah → kegiatan TGA yang terhubung ikut diperbarui ──
create or replace function tga_sync_requestor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tga_activities
     set request_by = new.nama,
         departemen = coalesce(nullif(trim(new.departement), ''), departemen)
   where requestor_id = new.id
     and (request_by is distinct from new.nama or departemen is distinct from coalesce(nullif(trim(new.departement), ''), departemen));
  return new;
end $$;
drop trigger if exists tga_sync_requestor on employees;
create trigger tga_sync_requestor after update of nama, departement on employees
  for each row execute function tga_sync_requestor();

-- Hak akses (tga_save_activity & tga_requestors tetap untuk aplikasi tanpa login Supabase)
revoke all on function tga_save_activity(text, uuid, jsonb) from public;
grant execute on function tga_save_activity(text, uuid, jsonb) to anon, authenticated;
revoke all on function tga_requestors(text) from public;
grant execute on function tga_requestors(text) to anon, authenticated;
revoke all on function tga_sync_requestor() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ── 6) Cek hasil ──
select 'kegiatan TGA terhubung ke karyawan' as cek, count(*)::text as hasil from tga_activities where requestor_id is not null
union all select 'kegiatan TGA requestor di luar data karyawan', count(*)::text from tga_activities where requestor_id is null and coalesce(request_by, '') <> ''
union all select 'karyawan aktif (pilihan requestor)', count(*)::text from employees e where coalesce((to_jsonb(e) ->> 'aktif')::boolean, true);


-- ######################################################################
-- ## BAGIAN 036  (dulu: 036_push_tga_tugas.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 036 — Notifikasi push (Driver & TGA) + alur TUGAS TGA
--
-- A. push_subscriptions: HP yang mengaktifkan notifikasi (Web Push).
--    Dipakai edge function send-web-push. Driver mendaftar dengan login
--    Supabase-nya, TGA dengan token sesi aplikasinya.
--
-- B. Alur tugas TGA (seperti driver):
--    • Admin menugaskan teknisi (atau ke "semua TGA") dari Dashboard,
--      atau karyawan mengajukan lewat /request → masuk sebagai "Baru".
--    • Teknisi menerima ("Terima & kerjakan") → Proses → Selesai.
--    • Tugas tanpa teknisi (permintaan karyawan / ke semua TGA) bisa
--      diambil teknisi mana pun yang pertama mengambil.
--    Kolom baru di tga_activities: sumber (mandiri / tugas / permintaan),
--    assigned_by, assigned_at, accepted_at, request_phone, notified_key.
--    Status baru: 'baru' (menunggu diterima) dan 'batal'.
--
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 034 & 035.
-- ═══════════════════════════════════════════════════════════════

-- ── A) Langganan notifikasi ──
create table if not exists push_subscriptions (
  endpoint     text primary key,
  p256dh       text not null,
  auth         text not null,
  app          text not null check (app in ('driver', 'tga')),
  driver_id    uuid,
  tga_user_id  uuid references tga_users(id) on delete cascade,
  user_agent   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists push_subscriptions_driver_idx on push_subscriptions (driver_id) where driver_id is not null;
create index if not exists push_subscriptions_tga_idx on push_subscriptions (tga_user_id) where tga_user_id is not null;
alter table push_subscriptions enable row level security;  -- tanpa policy: hanya lewat fungsi & service role

/** Driver (login Supabase) mendaftarkan HP-nya. */
create or replace function push_subscribe_driver(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare v_driver uuid;
begin
  select d.id into v_driver from drivers d
   where lower(trim(to_jsonb(d) ->> 'email')) = lower(auth.jwt() ->> 'email') and d.aktif
   limit 1;
  if v_driver is null then raise exception 'Akun ini tidak terhubung ke driver aktif.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' then raise exception 'Langganan notifikasi tidak valid.'; end if;
  insert into push_subscriptions (endpoint, p256dh, auth, app, driver_id, tga_user_id, user_agent)
  values (p_endpoint, p_p256dh, p_auth, 'driver', v_driver, null, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, app = 'driver',
    driver_id = excluded.driver_id, tga_user_id = null, user_agent = excluded.user_agent, updated_at = now();
  return true;
end $$;

/** Teknisi TGA (token aplikasi) mendaftarkan HP-nya. */
create or replace function tga_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype;
begin
  u := tga_user_of(p_token);
  if coalesce(p_endpoint, '') !~ '^https://' then raise exception 'Langganan notifikasi tidak valid.'; end if;
  insert into push_subscriptions (endpoint, p256dh, auth, app, driver_id, tga_user_id, user_agent)
  values (p_endpoint, p_p256dh, p_auth, 'tga', null, u.id, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, app = 'tga',
    driver_id = null, tga_user_id = excluded.tga_user_id, user_agent = excluded.user_agent, updated_at = now();
  return true;
end $$;

/** Matikan notifikasi untuk HP ini (endpoint bersifat rahasia per perangkat). */
create or replace function push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

-- ── B) Alur tugas TGA ──
alter table tga_activities add column if not exists sumber        text not null default 'mandiri';
alter table tga_activities add column if not exists assigned_by   text not null default '';
alter table tga_activities add column if not exists assigned_at   timestamptz;
alter table tga_activities add column if not exists accepted_at   timestamptz;
alter table tga_activities add column if not exists request_phone text not null default '';
alter table tga_activities add column if not exists notified_key  text;
alter table tga_activities alter column nama_tga set default '';

do $$
begin
  alter table tga_activities drop constraint if exists tga_activities_status_check;
  alter table tga_activities add constraint tga_activities_status_check
    check (status in ('baru', 'proses', 'pending', 'butuh_part', 'selesai', 'batal'));
  alter table tga_activities drop constraint if exists tga_activities_sumber_check;
  alter table tga_activities add constraint tga_activities_sumber_check
    check (sumber in ('mandiri', 'tugas', 'permintaan'));
end $$;
create index if not exists tga_activities_pool_idx on tga_activities (created_at) where user_id is null and status = 'baru';

create or replace function tga_activity_json(a tga_activities) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'ref_no', a.ref_no, 'nama_tga', a.nama_tga, 'tanggal', a.tanggal,
    'jam_mulai', to_char(a.jam_mulai, 'HH24:MI'), 'jam_selesai', to_char(a.jam_selesai, 'HH24:MI'),
    'kategori', a.kategori, 'lokasi', a.lokasi, 'activity', a.activity, 'request_by', a.request_by,
    'requestor_id', a.requestor_id, 'departemen', a.departemen, 'request_phone', a.request_phone,
    'status', a.status, 'prioritas', a.prioritas, 'catatan', a.catatan,
    'sumber', a.sumber, 'assigned_by', a.assigned_by, 'assigned_at', a.assigned_at, 'accepted_at', a.accepted_at,
    'pool', a.user_id is null,
    'selesai_at', a.selesai_at, 'created_at', a.created_at, 'updated_at', a.updated_at)
$$;

-- Data aplikasi: kegiatan sendiri + permintaan yang belum diambil siapa pun.
create or replace function tga_my_data(p_token text, p_days int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  u := tga_user_of(p_token);
  return jsonb_build_object(
    'nama', u.nama, 'today', v_today,
    'activities', coalesce((select jsonb_agg(tga_activity_json(a) order by a.tanggal desc, a.created_at desc)
       from tga_activities a
      where a.user_id = u.id and a.status <> 'batal'
        and (a.tanggal >= v_today - greatest(p_days, 1) or a.status <> 'selesai')), '[]'::jsonb),
    'pool', coalesce((select jsonb_agg(tga_activity_json(a) order by (a.prioritas = 'urgent') desc, a.created_at)
       from tga_activities a where a.user_id is null and a.status = 'baru'), '[]'::jsonb),
    'month_count', (select count(*) from tga_activities a where a.user_id = u.id and a.status <> 'batal'
                      and date_trunc('month', a.tanggal) = date_trunc('month', v_today)));
end $$;

/** Terima tugas: tugas milik sendiri → Proses; tugas tanpa teknisi → diambil (siapa cepat). */
create or replace function tga_accept(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; a tga_activities%rowtype; v_now time := date_trunc('minute', now() at time zone 'Asia/Jakarta')::time;
begin
  u := tga_user_of(p_token);
  update tga_activities set
      user_id = u.id, nama_tga = u.nama, status = 'proses', accepted_at = now(),
      tanggal = (now() at time zone 'Asia/Jakarta')::date,
      jam_mulai = coalesce(jam_mulai, v_now), updated_at = now()
   where id = p_id and status = 'baru' and (user_id = u.id or user_id is null)
  returning * into a;
  if not found then
    if exists (select 1 from tga_activities where id = p_id and status = 'baru' and user_id is not null and user_id <> u.id) then
      raise exception 'Tugas ini sudah diambil teknisi lain.';
    end if;
    raise exception 'Tugas tidak tersedia lagi (sudah diambil atau dibatalkan).';
  end if;
  return tga_activity_json(a);
end $$;

-- Simpan dari aplikasi: status tugas hanya boleh proses / pending / butuh part / selesai.
create or replace function tga_save_activity(p_token text, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; a tga_activities%rowtype; v_status text; v_act text;
        v_req_id uuid; v_req text; v_dept text;
begin
  u := tga_user_of(p_token);
  v_act := trim(coalesce(p_data->>'activity', ''));
  if v_act = '' then raise exception 'Isi kegiatan yang dikerjakan.'; end if;
  v_status := coalesce(nullif(p_data->>'status', ''), 'selesai');
  if v_status not in ('proses', 'pending', 'butuh_part', 'selesai') then raise exception 'Status tidak valid.'; end if;

  v_req := trim(coalesce(p_data->>'request_by', ''));
  v_dept := trim(coalesce(p_data->>'departemen', ''));
  if coalesce(p_data->>'requestor_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select e.id, e.nama, coalesce(nullif(trim(e.departement), ''), v_dept)
      into v_req_id, v_req, v_dept
      from employees e where e.id = (p_data->>'requestor_id')::uuid;
    if v_req_id is null then raise exception 'Karyawan requestor tidak ditemukan — pilih ulang dari daftar.'; end if;
  end if;

  if p_id is null then
    insert into tga_activities (ref_no, user_id, nama_tga, tanggal, jam_mulai, jam_selesai, kategori, lokasi, activity,
                                request_by, requestor_id, departemen, status, prioritas, catatan, selesai_at, sumber)
    values (tga_next_no(), u.id, u.nama,
            coalesce(nullif(p_data->>'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            nullif(p_data->>'jam_mulai', '')::time, nullif(p_data->>'jam_selesai', '')::time,
            coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'), trim(coalesce(p_data->>'lokasi', '')), v_act,
            v_req, v_req_id, v_dept, v_status,
            coalesce(nullif(p_data->>'prioritas', ''), 'normal'), trim(coalesce(p_data->>'catatan', '')),
            case when v_status = 'selesai' then now() end, 'mandiri')
    returning * into a;
  else
    update tga_activities set
      tanggal = coalesce(nullif(p_data->>'tanggal', '')::date, tanggal),
      jam_mulai = nullif(p_data->>'jam_mulai', '')::time, jam_selesai = nullif(p_data->>'jam_selesai', '')::time,
      kategori = coalesce(nullif(trim(p_data->>'kategori'), ''), kategori), lokasi = trim(coalesce(p_data->>'lokasi', '')),
      activity = v_act, request_by = v_req, requestor_id = v_req_id, departemen = v_dept,
      status = v_status, prioritas = coalesce(nullif(p_data->>'prioritas', ''), prioritas), catatan = trim(coalesce(p_data->>'catatan', '')),
      accepted_at = coalesce(accepted_at, case when sumber <> 'mandiri' then now() end),
      selesai_at = case when v_status = 'selesai' then coalesce(selesai_at, now()) else null end, updated_at = now()
     where id = p_id and user_id = u.id and status <> 'batal'
    returning * into a;
    if not found then raise exception 'Kegiatan tidak ditemukan.'; end if;
  end if;
  return tga_activity_json(a);
end $$;

-- Teknisi hanya boleh menghapus catatan mandiri; tugas dari admin / karyawan tidak.
create or replace function tga_delete_activity(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype;
begin
  u := tga_user_of(p_token);
  if exists (select 1 from tga_activities where id = p_id and user_id = u.id and sumber <> 'mandiri') then
    raise exception 'Tugas dari admin / permintaan karyawan tidak bisa dihapus. Hubungi admin GA bila perlu dibatalkan.';
  end if;
  delete from tga_activities where id = p_id and user_id = u.id;
end $$;

/** Dashboard: buat / ubah / alihkan tugas TGA. p_user_id null = ke semua TGA (siapa cepat). */
create or replace function tga_admin_assign(p_id uuid, p_user_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a tga_activities%rowtype; v_by text; v_nama text := ''; v_act text; v_req_id uuid; v_req text; v_dept text; v_reassign boolean;
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin GA') into v_by from profiles where id = auth.uid();
  v_act := trim(coalesce(p_data->>'activity', ''));
  if v_act = '' then raise exception 'Isi pekerjaan yang harus dikerjakan.'; end if;
  if p_user_id is not null then
    select nama into v_nama from tga_users where id = p_user_id and aktif;
    if v_nama is null then raise exception 'Teknisi tidak ditemukan atau nonaktif.'; end if;
  end if;
  v_req := trim(coalesce(p_data->>'request_by', ''));
  v_dept := trim(coalesce(p_data->>'departemen', ''));
  if coalesce(p_data->>'requestor_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select e.id, e.nama, coalesce(nullif(trim(e.departement), ''), v_dept) into v_req_id, v_req, v_dept
      from employees e where e.id = (p_data->>'requestor_id')::uuid;
  end if;

  if p_id is null then
    insert into tga_activities (ref_no, user_id, nama_tga, tanggal, kategori, lokasi, activity, request_by, requestor_id,
                                departemen, request_phone, status, prioritas, catatan, sumber, assigned_by, assigned_at)
    values (tga_next_no(), p_user_id, coalesce(v_nama, ''),
            coalesce(nullif(p_data->>'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'), trim(coalesce(p_data->>'lokasi', '')), v_act,
            v_req, v_req_id, v_dept, trim(coalesce(p_data->>'request_phone', '')), 'baru',
            coalesce(nullif(p_data->>'prioritas', ''), 'normal'), trim(coalesce(p_data->>'catatan', '')),
            'tugas', v_by, now())
    returning * into a;
  else
    select (user_id is distinct from p_user_id) into v_reassign from tga_activities where id = p_id;
    if v_reassign is null then raise exception 'Tugas tidak ditemukan.'; end if;
    update tga_activities set
      user_id = p_user_id, nama_tga = coalesce(v_nama, ''),
      kategori = coalesce(nullif(trim(p_data->>'kategori'), ''), kategori), lokasi = trim(coalesce(p_data->>'lokasi', '')),
      activity = v_act, request_by = v_req, requestor_id = v_req_id, departemen = v_dept,
      request_phone = trim(coalesce(p_data->>'request_phone', request_phone)),
      prioritas = coalesce(nullif(p_data->>'prioritas', ''), prioritas), catatan = trim(coalesce(p_data->>'catatan', '')),
      -- Dialihkan ke teknisi lain → kembali "Baru" supaya diterima ulang
      status = case when v_reassign and status <> 'selesai' then 'baru' else status end,
      accepted_at = case when v_reassign then null else accepted_at end,
      assigned_by = case when v_reassign then v_by else assigned_by end,
      assigned_at = case when v_reassign then now() else assigned_at end,
      updated_at = now()
     where id = p_id
    returning * into a;
  end if;
  return tga_activity_json(a);
end $$;

create or replace function tga_admin_cancel(p_id uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  update tga_activities set status = 'batal', updated_at = now(),
         catatan = trim(both ' ' from catatan || case when coalesce(trim(p_reason), '') <> '' then ' [Dibatalkan: ' || trim(p_reason) || ']' else ' [Dibatalkan]' end)
   where id = p_id and status <> 'selesai';
end $$;

/** Halaman publik /request: karyawan meminta bantuan TGA (masuk ke semua TGA). */
create or replace function tga_request_public(p_name text, p_dept text, p_phone text, p_kategori text,
                                              p_lokasi text, p_activity text, p_prioritas text default 'normal') returns jsonb
language plpgsql security definer set search_path = public as $$
declare a tga_activities%rowtype; v_req_id uuid; v_recent int;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama wajib diisi.'; end if;
  if coalesce(trim(p_lokasi), '') = '' then raise exception 'Lokasi wajib diisi.'; end if;
  if length(trim(coalesce(p_activity, ''))) < 5 then raise exception 'Jelaskan masalahnya (minimal 5 huruf).'; end if;
  -- Batas wajar: maks 5 permintaan per nama per jam
  select count(*) into v_recent from tga_activities
   where sumber = 'permintaan' and lower(request_by) = lower(trim(p_name)) and created_at > now() - interval '1 hour';
  if v_recent >= 5 then raise exception 'Terlalu banyak permintaan dalam 1 jam. Hubungi admin GA langsung.'; end if;
  select (array_agg(e.id))[1] into v_req_id from employees e
   where lower(trim(e.nama)) = lower(trim(p_name)) having count(*) = 1;

  insert into tga_activities (ref_no, user_id, nama_tga, kategori, lokasi, activity, request_by, requestor_id, departemen,
                              request_phone, status, prioritas, sumber, assigned_by, assigned_at)
  values (tga_next_no(), null, '', coalesce(nullif(trim(p_kategori), ''), 'Lainnya'), left(trim(p_lokasi), 120),
          left(trim(p_activity), 1000), left(trim(p_name), 80), v_req_id, left(trim(coalesce(p_dept, '')), 80),
          left(trim(coalesce(p_phone, '')), 30), 'baru',
          case when p_prioritas = 'urgent' then 'urgent' else 'normal' end, 'permintaan', 'Permintaan karyawan', now())
  returning * into a;
  return jsonb_build_object('id', a.id, 'ref_no', a.ref_no);
end $$;

-- Hak akses
do $$
declare f text;
begin
  foreach f in array array['tga_my_data(text,int)', 'tga_accept(text,uuid)', 'tga_save_activity(text,uuid,jsonb)',
    'tga_delete_activity(text,uuid)', 'tga_push_subscribe(text,text,text,text,text)', 'push_unsubscribe(text)',
    'tga_request_public(text,text,text,text,text,text,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['push_subscribe_driver(text,text,text,text)', 'tga_admin_assign(uuid,uuid,jsonb)', 'tga_admin_cancel(uuid,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── Cek hasil ──
select 'perangkat ber-notifikasi' as cek, count(*)::text as hasil from push_subscriptions
union all select 'tugas TGA menunggu diterima', count(*)::text from tga_activities where status = 'baru'
union all select 'permintaan belum diambil', count(*)::text from tga_activities where status = 'baru' and user_id is null;


-- ######################################################################
-- ## BAGIAN 037  (dulu: 037_tga_requestors_fix.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 037 — PERBAIKAN: daftar requestor (Data Karyawan) kosong di aplikasi TGA
--
-- Penyebab: tga_requestors ditandai STABLE. API Supabase (PostgREST)
-- menjalankan fungsi STABLE dalam transaksi READ ONLY, padahal pengecekan
-- sesi (tga_user_of) ikut memperpanjang sesi (UPDATE) → selalu gagal
-- "cannot execute UPDATE in a read-only transaction" → aplikasi menerima
-- daftar kosong.
--
-- Sumber data tetap tabel employees yang SAMA dengan dashboard utama,
-- driver, dan receptionist — tidak ada data yang perlu diisi ulang.
-- Idempotent — aman dijalankan ulang (setelah 034/035).
-- ═══════════════════════════════════════════════════════════════

create or replace function tga_requestors(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform tga_user_of(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nama', e.nama, 'dept', coalesce(e.departement, ''),
      'nik', coalesce(e.nik, ''), 'jabatan', coalesce(to_jsonb(e) ->> 'jabatan', '')) order by e.nama)
    from employees e
   where coalesce(trim(e.nama), '') <> '' and coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb);
end $$;
revoke all on function tga_requestors(text) from public;
grant execute on function tga_requestors(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Cek: harus 'v' (volatile) dan jumlah karyawan aktif
select 'volatilitas tga_requestors' as cek, provolatile::text as hasil from pg_proc where proname = 'tga_requestors'
union all select 'karyawan aktif', count(*)::text from employees e where coalesce((to_jsonb(e) ->> 'aktif')::boolean, true);


-- ######################################################################
-- ## BAGIAN 038  (dulu: 038_ga_cikops_master.sql)
-- ######################################################################

-- ═══════════════════════════════════════════════════════════════
-- 038 — Cleaning & Gardening: CIKOPS jadi SUMBER UTAMA, Excel mengikuti
--
-- Sebelumnya (027): Excel "ISS GA System" → CIKOPS (CIKOPS hanya membaca).
-- Sekarang:
--   • Semua input di CIKOPS: master pekerjaan, manpower, jadwal (generate),
--     checklist actual harian, Event, Improvement, Inventory.
--   • Excel MENARIK data dari CIKOPS (modSyncGA v2 → ga_pull) dan menulis
--     ulang sheet-nya mengikuti template CIKOPS. Excel = cermin/laporan.
--   • Mode diatur di ga_sync_config.master: 'excel' (lama) atau 'cikops'.
--     Saat 'cikops', kiriman dari Excel lama (ga_sync_master / plan / logs)
--     DITOLAK dengan pesan jelas supaya data di CIKOPS tidak tertimpa.
--   • Aturan jadwal sama dengan Excel (GeneratePlan): per pekerjaan, hari
--     Senin..Minggu (maks 4 hari di kolom Hari 1-4), key = ID|yyyymmdd,
--     generate ulang tidak menyentuh actual yang sudah diisi.
--
-- Data yang sudah ada (hasil sinkron Excel terakhir) menjadi data awal.
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 027.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Kolom tambahan ──
alter table ga_sync_config add column if not exists master text not null default 'excel';
alter table ga_sync_config add column if not exists master_since timestamptz;
alter table ga_sync_config add column if not exists last_pull_at timestamptz;
alter table ga_sync_config add column if not exists last_pull_computer text;
do $$ begin
  alter table ga_sync_config drop constraint if exists ga_sync_config_master_check;
  alter table ga_sync_config add constraint ga_sync_config_master_check check (master in ('excel', 'cikops'));
end $$;

alter table ga_jobs add column if not exists created_at timestamptz not null default now();
alter table ga_jobs add column if not exists updated_at timestamptz;
alter table ga_jobs add column if not exists updated_by text not null default '';
alter table ga_manpower add column if not exists no_hp text not null default '';
alter table ga_manpower add column if not exists updated_at timestamptz;
alter table ga_events add column if not exists updated_by text not null default '';
alter table ga_events add column if not exists updated_at timestamptz;
alter table ga_improvements add column if not exists updated_by text not null default '';
alter table ga_improvements add column if not exists updated_at timestamptz;
alter table ga_inventory add column if not exists updated_by text not null default '';
alter table ga_inventory add column if not exists updated_at timestamptz;

-- ── 2) Helper ──
create or replace function ga_is_cikops_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select master = 'cikops' from ga_sync_config where id = 1), false);
$$;

/** Kunci sinkron saja (dipakai ping & tarik). */
create or replace function ga_check_key_only(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or not exists (select 1 from ga_sync_config where id = 1 and sync_key = p_key) then
    raise exception 'Kunci sinkron GA salah. Cek GA_SYNC_KEY di modSyncGA (CIKOPS: Fasilitas → Cleaning, Gardening & TGA → Sinkron Excel).' using errcode = '42501';
  end if;
end $$;

/** Dipakai semua fungsi KIRIM dari Excel (027): ditolak saat CIKOPS jadi sumber utama. */
create or replace function ga_check_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ga_check_key_only(p_key);
  if ga_is_cikops_master() then
    raise exception 'CIKOPS sekarang sumber data utama Cleaning & Gardening. Data tidak lagi dikirim dari Excel — pasang modSyncGA versi 2 lalu pakai "Tarik dari CIKOPS".' using errcode = '42501';
  end if;
end $$;

create or replace function ga_ping(p_key text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform ga_check_key_only(p_key);
  return case when ga_is_cikops_master() then 'ok:cikops' else 'ok' end;
end $$;

create or replace function ga_staff_name() returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin GA') into v from profiles where id = auth.uid();
  return v;
end $$;

/** Nama hari Indonesia → ISO day (Senin=1 … Minggu=7). null bila tidak dikenal. */
create or replace function ga_day_no(p text) returns int
language sql immutable as $$
  select case lower(replace(replace(trim(coalesce(p, '')), '''', ''), '’', ''))
    when 'senin' then 1 when 'selasa' then 2 when 'rabu' then 3 when 'kamis' then 4
    when 'jumat' then 5 when 'sabtu' then 6 when 'minggu' then 7 else null end
$$;
create or replace function ga_day_name(n int) returns text
language sql immutable as $$
  select (array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'])[n]
$$;
/** Minggu ke- dalam bulan (minggu mulai Senin) — sama dengan rumus Excel. */
create or replace function ga_week_of_month(d date) returns int
language sql immutable as $$
  select ((extract(day from d)::int + extract(isodow from date_trunc('month', d))::int - 2) / 7) + 1
$$;

-- ── 3) Mode sumber data ──
create or replace function ga_set_master(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or coalesce(is_master_admin, false))) then
    raise exception 'Hanya admin yang bisa mengganti sumber data.' using errcode = '42501';
  end if;
  if p_mode not in ('excel', 'cikops') then raise exception 'Mode tidak dikenal.'; end if;
  update ga_sync_config set master = p_mode, master_since = now() where id = 1;
  return jsonb_build_object('master', p_mode);
end $$;

-- ── 4) Master pekerjaan ──
create or replace function ga_next_job_id(p_tim text) returns text
language plpgsql security definer set search_path = public as $$
declare v_pre text; v_n int;
begin
  v_pre := case lower(trim(coalesce(p_tim, ''))) when 'cleaning service' then 'CS' when 'gardener' then 'GD'
             else upper(left(regexp_replace(coalesce(p_tim, 'XX'), '[^A-Za-z]', '', 'g') || 'XX', 2)) end;
  select coalesce(max((regexp_match(id, '^' || v_pre || '-(\d+)$'))[1]::int), 0) + 1 into v_n from ga_jobs where id ~ ('^' || v_pre || '-\d+$');
  return v_pre || '-' || lpad(v_n::text, 3, '0');
end $$;

/** Tambah / ubah pekerjaan. p_data.hari = array nama hari (maks 4). */
create or replace function ga_save_job(p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text := ga_staff_name(); v_id text; v_days text[]; v_hari text; j ga_jobs%rowtype; v_aktif boolean;
begin
  if coalesce(trim(p_data->>'tim'), '') = '' then raise exception 'Tim wajib diisi.'; end if;
  if coalesce(trim(p_data->>'tipe'), '') = '' then raise exception 'Tipe pekerjaan wajib diisi.'; end if;
  v_aktif := coalesce((p_data->>'aktif')::boolean, true);
  select array_agg(ga_day_name(n) order by n) into v_days
    from (select distinct ga_day_no(x) as n from jsonb_array_elements_text(coalesce(p_data->'hari', '[]'::jsonb)) x) d where n is not null;
  if v_aktif and coalesce(array_length(v_days, 1), 0) = 0 then raise exception 'Pilih minimal 1 hari jadwal.'; end if;
  if coalesce(array_length(v_days, 1), 0) > 4 then raise exception 'Maksimal 4 hari per pekerjaan (sama dengan kolom Hari 1–4 di Excel). Pecah jadi 2 pekerjaan bila perlu.'; end if;
  v_hari := coalesce(array_to_string(v_days, ', '), '');

  if coalesce(trim(p_id), '') = '' then
    v_id := coalesce(nullif(upper(trim(p_data->>'id')), ''), ga_next_job_id(p_data->>'tim'));
    if exists (select 1 from ga_jobs where id = v_id) then raise exception 'ID % sudah dipakai.', v_id; end if;
    insert into ga_jobs (id, tim, lokasi, tipe, area, frek, hari, petugas, aktif, catatan, updated_by, updated_at, synced_at)
    values (v_id, trim(p_data->>'tim'), trim(coalesce(p_data->>'lokasi', '')), trim(p_data->>'tipe'), trim(coalesce(p_data->>'area', '')),
            coalesce(nullif(trim(p_data->>'frek'), ''), case when coalesce(array_length(v_days, 1), 0) = 1 then 'W' else coalesce(array_length(v_days, 1), 0) || 'W' end),
            v_hari, trim(coalesce(p_data->>'petugas', '')), v_aktif, trim(coalesce(p_data->>'catatan', '')), v_by, now(), now())
    returning * into j;
  else
    update ga_jobs set tim = trim(p_data->>'tim'), lokasi = trim(coalesce(p_data->>'lokasi', '')), tipe = trim(p_data->>'tipe'),
           area = trim(coalesce(p_data->>'area', '')),
           frek = coalesce(nullif(trim(p_data->>'frek'), ''), case when coalesce(array_length(v_days, 1), 0) = 1 then 'W' else coalesce(array_length(v_days, 1), 0) || 'W' end),
           hari = v_hari, petugas = trim(coalesce(p_data->>'petugas', '')), aktif = v_aktif, catatan = trim(coalesce(p_data->>'catatan', '')),
           updated_by = v_by, updated_at = now()
     where id = p_id returning * into j;
    if not found then raise exception 'Pekerjaan % tidak ditemukan.', p_id; end if;
  end if;
  return to_jsonb(j);
end $$;

/** Hapus pekerjaan + jadwal mendatang yang belum diisi (riwayat yang sudah diisi tetap). */
create or replace function ga_delete_job(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform ga_staff_name();
  delete from ga_plan where job_id = p_id and actual is null and tanggal >= (now() at time zone 'Asia/Jakarta')::date;
  get diagnostics n = row_count;
  delete from ga_jobs where id = p_id;
  return jsonb_build_object('plan_removed', n);
end $$;

-- ── 5) Manpower ──
create or replace function ga_save_manpower(p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text; m ga_manpower%rowtype; v_n int;
begin
  perform ga_staff_name();
  if coalesce(trim(p_data->>'nama'), '') = '' then raise exception 'Nama wajib diisi.'; end if;
  if coalesce(trim(p_id), '') = '' then
    select coalesce(max((regexp_match(id, '^MP-(\d+)$'))[1]::int), 0) + 1 into v_n from ga_manpower where id ~ '^MP-\d+$';
    v_id := 'MP-' || lpad(v_n::text, 3, '0');
    insert into ga_manpower (id, nama, tim, jabatan, area_tugas, status, no_hp, updated_at, synced_at)
    values (v_id, trim(p_data->>'nama'), trim(coalesce(p_data->>'tim', '')), trim(coalesce(p_data->>'jabatan', '')),
            trim(coalesce(p_data->>'area_tugas', '')), coalesce(nullif(trim(p_data->>'status'), ''), 'Aktif'), trim(coalesce(p_data->>'no_hp', '')), now(), now())
    returning * into m;
  else
    update ga_manpower set nama = trim(p_data->>'nama'), tim = trim(coalesce(p_data->>'tim', '')), jabatan = trim(coalesce(p_data->>'jabatan', '')),
           area_tugas = trim(coalesce(p_data->>'area_tugas', '')), status = coalesce(nullif(trim(p_data->>'status'), ''), 'Aktif'),
           no_hp = trim(coalesce(p_data->>'no_hp', '')), updated_at = now()
     where id = p_id returning * into m;
    if not found then raise exception 'Manpower tidak ditemukan.'; end if;
  end if;
  return to_jsonb(m);
end $$;

create or replace function ga_delete_manpower(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ga_staff_name();
  delete from ga_manpower where id = p_id;
end $$;

-- ── 6) Generate jadwal (sama dengan GeneratePlan di Excel) ──
/** p_from: hanya tanggal >= p_from (null = awal bulan).
    p_rebuild: hapus dulu jadwal periode itu (>= p_from) yang actual-nya masih kosong,
               supaya perubahan master ikut terbawa ("Perbarui jadwal"). */
create or replace function ga_generate_plan(p_periode int, p_from date default null, p_rebuild boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_first date; v_last date; v_from date; n_del int := 0; n_add int := 0;
begin
  perform ga_staff_name();
  if p_periode is null or p_periode < 200001 or p_periode % 100 not between 1 and 12 then raise exception 'Periode tidak valid.'; end if;
  v_first := make_date(p_periode / 100, p_periode % 100, 1);
  v_last := (v_first + interval '1 month - 1 day')::date;
  v_from := greatest(v_first, coalesce(p_from, v_first));

  if p_rebuild then
    delete from ga_plan where periode = p_periode and tanggal >= v_from and actual is null;
    get diagnostics n_del = row_count;
  end if;

  insert into ga_plan (key, periode, tanggal, hari, minggu_ke, job_id, tim, lokasi, tipe, area, frek, petugas, plan, actual, spv, waktu_input, sync_id, synced_at)
  select j.id || '|' || to_char(d, 'YYYYMMDD'), p_periode, d, ga_day_name(extract(isodow from d)::int), ga_week_of_month(d),
         j.id, j.tim, j.lokasi, j.tipe, j.area, j.frek, j.petugas, 1, null, '', null, 'cikops', now()
    from ga_jobs j
    cross join generate_series(v_from, v_last, interval '1 day') g(dd)
    cross join lateral (select g.dd::date as d) x
   where j.aktif
     and extract(isodow from d)::int in (select ga_day_no(trim(h)) from unnest(string_to_array(j.hari, ',')) h)
  on conflict (key) do nothing;
  get diagnostics n_add = row_count;
  return jsonb_build_object('periode', p_periode, 'added', n_add, 'removed', n_del,
    'total', (select count(*) from ga_plan where periode = p_periode));
end $$;

-- ── 7) Checklist actual ──
/** p_rows = [{key, actual: 1 | 0 | null}] — null = kosongkan. SPV = nama akun yang login. */
create or replace function ga_set_actual(p_rows jsonb, p_spv text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_name text := ga_staff_name(); v_spv text; n int;
begin
  v_spv := coalesce(nullif(trim(p_spv), ''), v_name);
  update ga_plan g set actual = x.actual, spv = case when x.actual is null then '' else v_spv end,
         waktu_input = now(), sync_id = 'cikops', synced_at = now()
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(key text, actual smallint)
   where g.key = x.key and (x.actual is null or x.actual in (0, 1));
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 8) Event / Improvement / Inventory ──
create or replace function ga_save_log(p_table text, p_id bigint, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_by text := ga_staff_name(); v_id bigint;
begin
  if p_table = 'events' then
    if coalesce(trim(p_data->>'nama'), '') = '' then raise exception 'Nama event wajib diisi.'; end if;
    if p_id is null then
      insert into ga_events (tanggal, nama, deskripsi, waktu, support, dokumentasi, updated_by, updated_at)
      values (ga_date(p_data->>'tanggal'), trim(p_data->>'nama'), trim(coalesce(p_data->>'deskripsi', '')), trim(coalesce(p_data->>'waktu', '')),
              trim(coalesce(p_data->>'support', '')), trim(coalesce(p_data->>'dokumentasi', '')), v_by, now()) returning id into v_id;
    else
      update ga_events set tanggal = ga_date(p_data->>'tanggal'), nama = trim(p_data->>'nama'), deskripsi = trim(coalesce(p_data->>'deskripsi', '')),
             waktu = trim(coalesce(p_data->>'waktu', '')), support = trim(coalesce(p_data->>'support', '')), dokumentasi = trim(coalesce(p_data->>'dokumentasi', '')),
             updated_by = v_by, updated_at = now() where id = p_id returning id into v_id;
    end if;
  elsif p_table = 'improvements' then
    if coalesce(trim(p_data->>'deskripsi'), '') = '' then raise exception 'Deskripsi wajib diisi.'; end if;
    if p_id is null then
      insert into ga_improvements (tanggal, kategori, jenis, deskripsi, area, petugas, pengawas, dokumentasi, updated_by, updated_at)
      values (ga_date(p_data->>'tanggal'), trim(coalesce(p_data->>'kategori', '')), trim(coalesce(p_data->>'jenis', '')), trim(p_data->>'deskripsi'),
              trim(coalesce(p_data->>'area', '')), trim(coalesce(p_data->>'petugas', '')), trim(coalesce(p_data->>'pengawas', '')),
              trim(coalesce(p_data->>'dokumentasi', '')), v_by, now()) returning id into v_id;
    else
      update ga_improvements set tanggal = ga_date(p_data->>'tanggal'), kategori = trim(coalesce(p_data->>'kategori', '')), jenis = trim(coalesce(p_data->>'jenis', '')),
             deskripsi = trim(p_data->>'deskripsi'), area = trim(coalesce(p_data->>'area', '')), petugas = trim(coalesce(p_data->>'petugas', '')),
             pengawas = trim(coalesce(p_data->>'pengawas', '')), dokumentasi = trim(coalesce(p_data->>'dokumentasi', '')),
             updated_by = v_by, updated_at = now() where id = p_id returning id into v_id;
    end if;
  elsif p_table = 'inventory' then
    if coalesce(trim(p_data->>'nama'), '') = '' then raise exception 'Nama alat wajib diisi.'; end if;
    if p_id is null then
      insert into ga_inventory (kode, nama, jenis, area, status, foto, jumlah, tgl_update, updated_by, updated_at)
      values (trim(coalesce(p_data->>'kode', '')), trim(p_data->>'nama'), trim(coalesce(p_data->>'jenis', '')), trim(coalesce(p_data->>'area', '')),
              coalesce(nullif(trim(p_data->>'status'), ''), 'Baik'), trim(coalesce(p_data->>'foto', '')), nullif(p_data->>'jumlah', '')::numeric,
              coalesce(ga_date(p_data->>'tgl_update'), (now() at time zone 'Asia/Jakarta')::date), v_by, now()) returning id into v_id;
    else
      update ga_inventory set kode = trim(coalesce(p_data->>'kode', '')), nama = trim(p_data->>'nama'), jenis = trim(coalesce(p_data->>'jenis', '')),
             area = trim(coalesce(p_data->>'area', '')), status = coalesce(nullif(trim(p_data->>'status'), ''), 'Baik'), foto = trim(coalesce(p_data->>'foto', '')),
             jumlah = nullif(p_data->>'jumlah', '')::numeric, tgl_update = coalesce(ga_date(p_data->>'tgl_update'), (now() at time zone 'Asia/Jakarta')::date),
             updated_by = v_by, updated_at = now() where id = p_id returning id into v_id;
    end if;
  else
    raise exception 'Tabel % tidak dikenal.', p_table;
  end if;
  if v_id is null then raise exception 'Data tidak ditemukan.'; end if;
  return v_id;
end $$;

create or replace function ga_delete_log(p_table text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ga_staff_name();
  if p_table = 'events' then delete from ga_events where id = p_id;
  elsif p_table = 'improvements' then delete from ga_improvements where id = p_id;
  elsif p_table = 'inventory' then delete from ga_inventory where id = p_id;
  else raise exception 'Tabel % tidak dikenal.', p_table; end if;
end $$;

-- ── 9) Excel menarik data (modSyncGA v2) ──
-- Keluaran: teks bersekat TAB per sheet, mudah dibaca VBA tanpa parser JSON.
--   ##SHEET<TAB>nama<TAB>jumlah_baris
--   baris header (kolom sama dengan template Excel)
--   baris data …
create or replace function ga_tsv(v text) returns text
language sql immutable as $$
  select replace(replace(replace(coalesce(v, ''), E'\t', ' '), E'\r', ' '), E'\n', ' ')
$$;

create or replace function ga_pull(p_key text, p_from_periode int, p_computer text default '') returns text
language plpgsql security definer set search_path = public as $$
declare out text := ''; part text; n int; v_from int := coalesce(p_from_periode, 200001);
begin
  perform ga_check_key_only(p_key);

  -- Master pekerjaan (DB_PEKERJAAN, A..M)
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(j.id), ga_tsv(j.tim), ga_tsv(j.lokasi), ga_tsv(j.tipe), ga_tsv(j.area), ga_tsv(j.frek),
           ga_tsv(trim(split_part(j.hari, ',', 1))), ga_tsv(trim(split_part(j.hari, ',', 2))), ga_tsv(trim(split_part(j.hari, ',', 3))), ga_tsv(trim(split_part(j.hari, ',', 4))),
           ga_tsv(j.petugas), case when j.aktif then 'YA' else 'TIDAK' end, ga_tsv(j.catatan)), E'\n' order by j.tim, j.id)
    into n, part from ga_jobs j;
  out := out || E'##SHEET\tDB_PEKERJAAN\t' || n || E'\n' || E'ID\tTim\tLokasi\tTipe Pekerjaan\tArea Pekerjaan\tFrek\tHari 1\tHari 2\tHari 3\tHari 4\tPetugas\tAktif\tCatatan\n' || coalesce(part || E'\n', '');

  -- Manpower (DB_MANPOWER, A..G)
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(m.id), ga_tsv(m.nama), ga_tsv(m.tim), ga_tsv(m.jabatan), ga_tsv(m.area_tugas), ga_tsv(m.no_hp), ga_tsv(m.status)), E'\n' order by m.tim, m.nama)
    into n, part from ga_manpower m;
  out := out || E'##SHEET\tDB_MANPOWER\t' || n || E'\n' || E'ID\tNama\tTim\tJabatan\tArea Tugas\tNo HP\tStatus\n' || coalesce(part || E'\n', '');

  -- Plan & actual (DATA_PLAN_ACTUAL, A..P) mulai periode p_from_periode
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(g.key), g.periode::text, to_char(g.tanggal, 'YYYY-MM-DD'), ga_tsv(g.hari), coalesce(g.minggu_ke::text, ''),
           ga_tsv(g.job_id), ga_tsv(g.tim), ga_tsv(g.lokasi), ga_tsv(g.tipe), ga_tsv(g.area), ga_tsv(g.frek), ga_tsv(g.petugas), g.plan::text,
           coalesce(g.actual::text, ''), ga_tsv(g.spv), coalesce(to_char(g.waktu_input at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'), '')), E'\n' order by g.tanggal, g.job_id)
    into n, part from ga_plan g where g.periode >= v_from;
  out := out || E'##SHEET\tDATA_PLAN_ACTUAL\t' || n || E'\t' || v_from || E'\n'
    || E'Key\tPeriode\tTanggal\tHari\tMinggu ke\tID\tTim\tLokasi\tTipe\tArea\tFrek\tPetugas\tPlan\tActual\tSPV\tWaktu Input\n' || coalesce(part || E'\n', '');

  -- Event (EVENT, A..F)
  select count(*), string_agg(concat_ws(E'\t', coalesce(to_char(e.tanggal, 'YYYY-MM-DD'), ''), ga_tsv(e.nama), ga_tsv(e.deskripsi), ga_tsv(e.waktu), ga_tsv(e.support), ga_tsv(e.dokumentasi)), E'\n' order by e.tanggal nulls last, e.id)
    into n, part from ga_events e;
  out := out || E'##SHEET\tEVENT\t' || n || E'\n' || E'Tanggal\tNama Event\tDescription\tWaktu\tSupport GA\tDocumentation\n' || coalesce(part || E'\n', '');

  -- Improvement (IMPROVEMENT, A..H)
  select count(*), string_agg(concat_ws(E'\t', coalesce(to_char(i.tanggal, 'YYYY-MM-DD'), ''), ga_tsv(i.kategori), ga_tsv(i.jenis), ga_tsv(i.deskripsi), ga_tsv(i.area), ga_tsv(i.petugas), ga_tsv(i.pengawas), ga_tsv(i.dokumentasi)), E'\n' order by i.tanggal nulls last, i.id)
    into n, part from ga_improvements i;
  out := out || E'##SHEET\tIMPROVEMENT\t' || n || E'\n' || E'Tanggal\tKategori\tJenis\tDescription\tArea\tPetugas\tPengawas\tDokumentasi\n' || coalesce(part || E'\n', '');

  -- Inventory (INVENTORY, A..H)
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(v.kode), ga_tsv(v.nama), ga_tsv(v.jenis), ga_tsv(v.area), ga_tsv(v.status), ga_tsv(v.foto), coalesce(v.jumlah::text, ''), coalesce(to_char(v.tgl_update, 'YYYY-MM-DD'), '')), E'\n' order by v.kode, v.id)
    into n, part from ga_inventory v;
  out := out || E'##SHEET\tINVENTORY\t' || n || E'\n' || E'Kode\tNama\tJenis\tArea\tStatus\tFoto\tJumlah\tTgl Update\n' || coalesce(part || E'\n', '');

  -- TGA (TGA, A..D): log Excel lama + kegiatan dari aplikasi TGA (034)
  select count(*), string_agg(r, E'\n' order by t, r) into n, part from (
    select x.tanggal as t, concat_ws(E'\t', coalesce(to_char(x.tanggal, 'YYYY-MM-DD'), ''), ga_tsv(x.nama_tga), ga_tsv(x.activity), ga_tsv(x.request_by)) as r
      from ga_tga x where x.tanggal is null or x.tanggal >= make_date(v_from / 100, v_from % 100, 1)
    union all
    select a.tanggal, concat_ws(E'\t', to_char(a.tanggal, 'YYYY-MM-DD'), ga_tsv(a.nama_tga), ga_tsv(a.activity || case when a.lokasi <> '' then ' @ ' || a.lokasi else '' end), ga_tsv(a.request_by))
      from tga_activities a where a.status not in ('baru', 'batal') and a.tanggal >= make_date(v_from / 100, v_from % 100, 1)
  ) z;
  out := out || E'##SHEET\tTGA\t' || n || E'\n' || E'Tanggal\tNama TGA\tActivity\tRequest By\n' || coalesce(part || E'\n', '');

  update ga_sync_config set last_pull_at = now(), last_pull_computer = left(coalesce(p_computer, ''), 80) where id = 1;
  return E'##CIKOPS\tGA\t' || to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') || E'\t' || (select master from ga_sync_config where id = 1) || E'\n' || out || E'##END\n';
end $$;

-- Status untuk dashboard (tambah mode & tarik terakhir)
create or replace function ga_sync_status()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_admin boolean; c ga_sync_config%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select (role = 'admin' or coalesce(is_master_admin, false)) into v_admin from profiles where id = auth.uid();
  select * into c from ga_sync_config where id = 1;
  return jsonb_build_object(
    'last_sync_at', c.last_sync_at, 'last_computer', c.last_computer,
    'last_plan_at', c.last_plan_at, 'last_master_at', c.last_master_at, 'last_logs_at', c.last_logs_at,
    'jobs', (select count(*) from ga_jobs), 'plan', (select count(*) from ga_plan),
    'is_admin', coalesce(v_admin, false),
    'sync_key', case when coalesce(v_admin, false) then c.sync_key else null end,
    'master', c.master, 'master_since', c.master_since, 'last_pull_at', c.last_pull_at, 'last_pull_computer', c.last_pull_computer
  );
end $$;

-- ── 10) Hak akses ──
do $$
declare f text;
begin
  foreach f in array array['ga_check_key_only(text)', 'ga_staff_name()', 'ga_next_job_id(text)', 'ga_is_cikops_master()'] loop
    execute format('revoke all on function %s from public, anon', f);
  end loop;
  foreach f in array array['ga_ping(text)', 'ga_pull(text,int,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['ga_set_master(text)', 'ga_save_job(text,jsonb)', 'ga_delete_job(text)', 'ga_save_manpower(text,jsonb)',
      'ga_delete_manpower(text)', 'ga_generate_plan(int,date,boolean)', 'ga_set_actual(jsonb,text)', 'ga_save_log(text,bigint,jsonb)',
      'ga_delete_log(text,bigint)', 'ga_sync_status()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── Cek hasil ──
select 'mode sumber data' as cek, master as hasil from ga_sync_config where id = 1
union all select 'master pekerjaan', count(*)::text from ga_jobs
union all select 'jadwal (plan)', count(*)::text from ga_plan;
