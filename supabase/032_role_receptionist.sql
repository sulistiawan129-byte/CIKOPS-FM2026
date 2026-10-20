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

-- 4) Cek hasil
select u.email, p.full_name, p.role, p.allowed_tabs::text as allowed_tabs, p.is_master_admin
  from profiles p join auth.users u on u.id = p.id
 where p.role = 'receptionist';
