-- ═══════════════════════════════════════════════════════════════
-- 039 — ROLE PER SCOPE: setiap admin mengelola modulnya sendiri
--
--   master          Master Admin          semua modul, semua akun, log aktivitas
--   admin_ga_cik    Admin GA CIK          fleet CIK, finance, fasilitas (locker, gift,
--                                          printer, ATK, permintaan karyawan),
--                                          receptionist, master data, kalender
--   admin_ga_prb    Admin GA PRB          fleet PRB (task, armada, driver), master data,
--                                          kalender, report — data PRB saja
--   admin_iss       Admin / SPV ISS       Cleaning, Gardening, TGA
--   admin_security  Admin / SPV Security  modul Security
--   receptionist    Receptionist          modul Receptionist + kalender
--   management      Management            lihat saja: Command Center + tarik laporan
--   (admin, ga)     role lama — tetap jalan seperti sebelumnya sampai diganti
--
-- Yang dijaga DATABASE (bukan cuma tampilan):
--   • Management tidak bisa menambah / mengubah / menghapus data apa pun.
--   • Setiap role hanya bisa MENULIS ke tabel modulnya (mis. Admin ISS tidak bisa
--     mengubah klaim, Admin Security tidak bisa mengubah armada).
--   • Fungsi tulis modul ISS / TGA / Receptionist / ATK ikut memeriksa role.
--   Membaca data tetap seperti sebelumnya (laporan lintas modul tetap jalan).
--   Batas plant CIK / PRB dijaga oleh aplikasi (filter data per plant).
--
-- Akun dibuat & diatur dari menu Akun & Role di dashboard (Edge Function
-- manage-staff-account). Jalankan SESUDAH 038. Idempotent — aman diulang.
-- ═══════════════════════════════════════════════════════════════

-- 1) Daftar role yang sah ─────────────────────────────────────────
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
          union select unnest(array['admin', 'ga', 'receptionist', 'master', 'admin_ga_cik', 'admin_ga_prb',
                                    'admin_iss', 'admin_security', 'management'])) x;
  execute format('alter table profiles add constraint profiles_role_check check (role in (%s))', v_roles);
end $$;

alter table profiles add column if not exists is_master_admin boolean not null default false;

-- 2) Helper role ──────────────────────────────────────────────────
-- role akun yang sedang login (null = bukan staf, mis. driver / publik)
create or replace function staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Bolehkah role ini MENULIS di modul tertentu?
-- modul: fleet, finance, facility, canteen, receptionist, iss, security, masterdata, calendar, general
create or replace function staff_can(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select case coalesce((select role from profiles where id = auth.uid()), '')
    when 'master'         then true
    when 'admin'          then true      -- role lama
    when 'ga'             then true      -- role lama
    when 'admin_ga_cik'   then p_module in ('fleet', 'finance', 'facility', 'receptionist', 'masterdata', 'calendar', 'general')
    when 'admin_ga_prb'   then p_module in ('fleet', 'masterdata', 'calendar', 'general')
    when 'admin_iss'      then p_module in ('iss', 'general')
    when 'admin_security' then p_module in ('security', 'general')
    when 'receptionist'   then p_module in ('receptionist', 'calendar', 'general')
    else false                           -- management & role tak dikenal
  end
$$;

-- Role yang boleh dikelola (dibuat / diubah) oleh role pemanggil — dipakai Edge Function
create or replace function staff_manageable_roles(p_role text) returns text[]
language sql immutable as $$
  select case p_role
    when 'master'         then array['master', 'admin_ga_cik', 'admin_ga_prb', 'admin_iss', 'admin_security', 'receptionist', 'management']
    when 'admin'          then array['master', 'admin_ga_cik', 'admin_ga_prb', 'admin_iss', 'admin_security', 'receptionist', 'management']
    when 'admin_ga_cik'   then array['admin_ga_cik', 'receptionist']
    when 'admin_ga_prb'   then array['admin_ga_prb']
    when 'admin_iss'      then array['admin_iss']
    when 'admin_security' then array['admin_security']
    else array[]::text[]
  end
$$;

grant execute on function staff_role(), staff_can(text), staff_manageable_roles(text) to authenticated;

-- 3) Penjaga tulis per tabel (policy RESTRICTIVE: berlaku DI ATAS policy lama) ──
--    Akun non-staf (driver, publik) tidak terpengaruh: staff_role() null → lolos.
do $$
declare
  m record; t text; rls boolean;
  map jsonb := jsonb_build_object(
    'fleet',        jsonb_build_array('vehicles', 'drivers', 'tasks', 'vehicle_gate_logs', 'gas_stations', 'job_types', 'driver_tiers'),
    'finance',      jsonb_build_array('claims', 'overtime', 'kantong', 'condolence_wreaths'),
    'facility',     jsonb_build_array('lockers', 'gift_events', 'gift_registrations', 'printers', 'printer_requests', 'employee_requests', 'atk_items', 'atk_requests', 'atk_restocks'),
    'canteen',      jsonb_build_array('canteen_reports'),
    'receptionist', jsonb_build_array('rcp_room_bookings', 'rcp_parcels', 'rcp_wifi_accounts', 'rcp_wifi_grants', 'rcp_settings', 'rcp_contacts'),
    'iss',          jsonb_build_array('ga_jobs', 'ga_manpower', 'ga_plan', 'ga_events', 'ga_improvements', 'ga_inventory', 'ga_tga', 'tga_activities', 'ga_sync_config'),
    'security',     jsonb_build_array('security_monthly', 'security_config'),
    'masterdata',   jsonb_build_array('employees'),
    'calendar',     jsonb_build_array('agenda_events'));
  mapped text[] := array[]::text[];
  skipped text[] := array[]::text[];
begin
  for m in select key, value from jsonb_each(map) loop
    for t in select jsonb_array_elements_text(m.value) loop
      mapped := mapped || t;
      select c.relrowsecurity into rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = t and c.relkind = 'r';
      if rls is null then continue; end if;                          -- tabel tidak ada di database ini
      if not rls then skipped := skipped || t; continue; end if;     -- RLS mati: tidak bisa dijaga policy
      execute format('drop policy if exists role_ins on %I', t);
      execute format('drop policy if exists role_upd on %I', t);
      execute format('drop policy if exists role_del on %I', t);
      execute format('create policy role_ins on %I as restrictive for insert to authenticated with check (staff_role() is null or staff_can(%L))', t, m.key);
      execute format('create policy role_upd on %I as restrictive for update to authenticated using (staff_role() is null or staff_can(%L)) with check (staff_role() is null or staff_can(%L))', t, m.key, m.key);
      execute format('create policy role_del on %I as restrictive for delete to authenticated using (staff_role() is null or staff_can(%L))', t, m.key);
    end loop;
  end loop;

  -- Tabel lain yang RLS-nya aktif: cukup dijaga dari Management (lihat saja)
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and c.relname <> all (mapped)
       and c.relname not in ('profiles', 'activity_log', 'push_subscriptions', 'tga_users', 'tga_sessions')
  loop
    execute format('drop policy if exists role_ins on %I', t);
    execute format('drop policy if exists role_upd on %I', t);
    execute format('drop policy if exists role_del on %I', t);
    execute format('create policy role_ins on %I as restrictive for insert to authenticated with check (staff_role() is null or staff_can(''general''))', t);
    execute format('create policy role_upd on %I as restrictive for update to authenticated using (staff_role() is null or staff_can(''general'')) with check (staff_role() is null or staff_can(''general''))', t);
    execute format('create policy role_del on %I as restrictive for delete to authenticated using (staff_role() is null or staff_can(''general''))', t);
  end loop;

  if array_length(skipped, 1) > 0 then
    raise notice 'RLS belum aktif di tabel: % — penjaga role untuk tabel ini hanya di aplikasi.', array_to_string(skipped, ', ');
  end if;
end $$;

-- 4) Fungsi tulis modul ikut memeriksa role ─────────────────────────
-- ISS (Cleaning & Gardening, 038)
create or replace function ga_staff_name() returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if not exists (select 1 from profiles where id = auth.uid()) or not staff_can('iss') then
    raise exception 'Akses ditolak: akun ini tidak mengelola modul Cleaning & Gardening.' using errcode = '42501';
  end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin GA') into v from profiles where id = auth.uid();
  return v;
end $$;

-- Checklist actual (038): selalu periksa role, juga saat nama SPV diisi
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

-- TGA (034/036): kelola akun & tugas TGA hanya role ISS. Semua staf tetap bisa MEMBACA kegiatan TGA (laporan).
create or replace function tga_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()) and staff_can('iss');
$$;
do $$
begin
  if to_regclass('public.tga_activities') is not null then
    drop policy if exists tga_activities_read on tga_activities;
    create policy tga_activities_read on tga_activities for select to authenticated
      using (exists (select 1 from profiles where id = auth.uid()));
  end if;
end $$;

-- Receptionist (031/033)
create or replace function rcp_staff_name() returns text
language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  select coalesce(full_name, '') into n from profiles where id = auth.uid();
  if not found then raise exception 'Akses ditolak: akun tidak terdaftar di CIKOPS.' using errcode = '42501'; end if;
  if not staff_can('receptionist') then raise exception 'Akses ditolak: akun ini tidak mengelola modul Receptionist.' using errcode = '42501'; end if;
  return n;
end $$;

-- ATK (026)
create or replace function atk_staff_name() returns text
language plpgsql security definer set search_path to 'public' as $$
declare n text;
begin
  select coalesce(full_name, '') into n from profiles where id = auth.uid();
  if not found then raise exception 'Akses ditolak: akun tidak terdaftar di CIKOPS.' using errcode = '42501'; end if;
  if not staff_can('facility') then raise exception 'Akses ditolak: akun ini tidak mengelola modul ATK.' using errcode = '42501'; end if;
  return n;
end $$;

-- 5) Akun lama → role baru (hanya yang jelas; sisanya tetap role lama) ──
alter table profiles add column if not exists plant_scope text;
update profiles set role = 'master' where is_master_admin and role in ('admin', 'ga');
update profiles set role = 'admin_ga_prb' where role in ('admin', 'ga') and plant_scope = 'PRB' and not is_master_admin;
update profiles set is_master_admin = true where role = 'master';

notify pgrst, 'reload schema';

-- 6) Cek hasil
select u.email, p.full_name, p.role, p.plant_scope, p.is_master_admin
  from profiles p join auth.users u on u.id = p.id
 order by p.role, u.email;
