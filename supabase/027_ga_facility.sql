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
