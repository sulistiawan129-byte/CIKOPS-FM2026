-- ═══════════════════════════════════════════════════════════════
-- 040 — PENGETATAN KEAMANAN (hasil audit RLS, fungsi & endpoint publik)
--
-- Jalankan SESUDAH 039_roles.sql. Idempotent — aman diulang.
-- Sebelum & sesudah menjalankan, cek dengan supabase/AUDIT-keamanan.sql.
--
-- Yang diperbaiki:
--  1. Akun baru TIDAK lagi otomatis jadi staf (trigger lama memberi role 'ga'
--     ke SETIAP akun, termasuk driver). Profil staf hanya dibuat lewat menu
--     Akun & Role. Profil 'ga' milik akun driver dihapus.
--  2. Tabel inti (driver, armada, tugas, pegawai, klaim, lembur, kantong,
--     tier driver, pom bensin, karangan bunga, pengaturan, gift, kantin, locker,
--     printer, permintaan karyawan, gate log, pengumuman, ATK):
--       • TANPA LOGIN: tidak bisa membaca/mengubah apa pun, kecuali:
--           - kantin: isi laporan HARI INI (halaman /canteen)
--           - permintaan karyawan & printer: hanya MENGIRIM (halaman /request)
--           - daftar event gift yang sedang buka (halaman /gift)
--       • DRIVER (login aplikasi driver): hanya tugas & data dirinya sendiri.
--       • STAF: baca semua; tulis sesuai modul role (SQL 039).
--  3. View tasks_detail / current_kantong / driver_tier_summary ikut RLS
--     (security_invoker) dan tidak bisa dibaca tanpa login.
--  4. Fungsi yang bisa dipanggil tanpa login diperketat:
--       • accept/complete/cancel_task: hanya driver pemilik tugas (cek email login)
--       • atk_upsert_item: wajib kunci sinkron (modSyncCikops.bas ikut diperbarui)
--       • rcp_remember_contact, set_task_origin_batch, auto_complete_tasks,
--         rcp_next_no, rcp_wifi_used, rcp_is_staff: tidak bisa dipanggil tanpa login
--       • verify_driver_pin / set_driver_pin (lama, PIN 4 digit) dihapus
--       • verify_gift_passcode: dibatasi percobaan + NIK disamarkan, email tidak dikirim
--       • get_viewonly_snapshot (Command Center): hanya HARI INI, tanpa departemen,
--         nama pemohon disingkat, tanpa data pejabat yang dilayani driver
--       • data wifi receptionist hanya untuk role yang mengelola Receptionist
-- ═══════════════════════════════════════════════════════════════

-- ── Pemeriksaan awal ──────────────────────────────────────────────
-- Halaman tanpa login (gate, locker, gift, request) & aplikasi driver memanggil
-- fungsi-fungsi ini. Setelah tabel ditutup untuk anon, fungsi itu HARUS
-- security definer, kalau tidak halamannya berhenti bekerja. Bila ada yang
-- bukan definer, migrasi dibatalkan sebelum mengubah apa pun.
do $$
declare f text; bad text[] := array[]::text[];
begin
  foreach f in array array['get_active_drivers_for_gate', 'get_active_vehicles_for_gate', 'get_gate_logs_public',
    'open_gate_checkpoint', 'close_gate_checkpoint', 'register_locker', 'verify_locker_release', 'release_locker_by_user',
    'get_locker_by_confirm_token', 'confirm_locker_answer', 'get_employee_by_nik', 'find_gift_registration_by_nik',
    'find_gift_registrations_by_name', 'find_gift_registration_by_sequence_no', 'claim_gift_registration',
    'create_gift_registration', 'get_printer_locations_public', 'get_driver_by_email', 'get_claims_by_driver',
    'get_driver_duty_info', 'get_task_origins', 'get_fm_snapshot', 'rcp_board'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = f and not p.prosecdef) then
      bad := bad || f;
    end if;
  end loop;
  if array_length(bad, 1) > 0 then
    raise exception 'DIBATALKAN — fungsi ini bukan SECURITY DEFINER sehingga akan berhenti bekerja: %. Kirim hasil bagian 7 dari AUDIT-keamanan.sql ke developer.', array_to_string(bad, ', ');
  end if;
end $$;

-- ── 0) Helper ────────────────────────────────────────────────────
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid())
$$;

-- id driver milik akun yang sedang login (aplikasi driver), null bila bukan driver
create or replace function my_driver_id() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from drivers d
   where lower(d.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and coalesce(auth.jwt() ->> 'email', '') <> ''
   limit 1
$$;

revoke all on function is_staff(), my_driver_id() from public, anon;
grant execute on function is_staff(), my_driver_id() to authenticated;
revoke all on function staff_role(), staff_can(text) from public, anon;
grant execute on function staff_role(), staff_can(text) to authenticated;

-- ── 1) Akun baru tidak otomatis jadi staf ─────────────────────────
create or replace function handle_new_admin_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sengaja kosong: profil staf dibuat lewat menu Akun & Role (Edge Function
  -- manage-staff-account). Akun driver / TGA / aplikasi lain tidak boleh jadi staf.
  return new;
end $$;

do $$
declare n int;
begin
  if to_regclass('public.drivers') is null then return; end if;
  with gone as (
    delete from profiles p
     using auth.users u, drivers d
     where p.id = u.id and lower(u.email) = lower(d.email) and coalesce(d.email, '') <> ''
       and p.role = 'ga' and not coalesce(p.is_master_admin, false)
    returning p.id
  ) select count(*) into n from gone;
  raise notice 'Profil staf milik akun driver yang dihapus: %', n;
end $$;

-- ── 2) RLS tabel inti ────────────────────────────────────────────
-- Semua policy lama di tabel ini diganti (banyak yang "using (true)" dan
-- berlaku juga untuk pengunjung tanpa login).
do $$
declare
  m record; t text; p record;
  map jsonb := jsonb_build_object(
    'fleet',      jsonb_build_array('drivers', 'vehicles', 'tasks', 'job_types', 'gas_stations', 'vehicle_gate_logs'),
    'finance',    jsonb_build_array('claims', 'overtime', 'kantong', 'driver_tiers', 'condolence_wreaths'),
    'facility',   jsonb_build_array('gift_events', 'gift_registrations', 'lockers', 'printers', 'printer_requests',
                                    'employee_requests', 'atk_items', 'atk_requests', 'atk_restocks'),
    'canteen',    jsonb_build_array('canteen_reports'),
    'masterdata', jsonb_build_array('employees'),
    'general',    jsonb_build_array('app_settings', 'announcements'));
begin
  for m in select key, value from jsonb_each(map) loop
    for t in select jsonb_array_elements_text(m.value) loop
      if to_regclass('public.' || t) is null then continue; end if;
      execute format('alter table %I enable row level security', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on %I', p.policyname, t);
      end loop;
      execute format('revoke all on %I from anon', t);
      execute format('create policy staff_read on %I for select to authenticated using (is_staff())', t);
      execute format('create policy staff_ins on %I for insert to authenticated with check (staff_can(%L))', t, m.key);
      execute format('create policy staff_upd on %I for update to authenticated using (staff_can(%L)) with check (staff_can(%L))', t, m.key, m.key);
      execute format('create policy staff_del on %I for delete to authenticated using (staff_can(%L))', t, m.key);
    end loop;
  end loop;
end $$;

-- Pengecualian yang memang dibutuhkan ─────────────────────────────
do $$
begin
  -- Aplikasi driver: tugas, data diri, armada (untuk view tasks_detail)
  if to_regclass('public.tasks') is not null then
    create policy driver_own_tasks on tasks for select to authenticated using (driver_id = my_driver_id());
  end if;
  if to_regclass('public.drivers') is not null then
    create policy driver_own_row on drivers for select to authenticated using (id = my_driver_id());
  end if;
  if to_regclass('public.vehicles') is not null then
    create policy driver_vehicles on vehicles for select to authenticated using (my_driver_id() is not null);
  end if;

  -- /gift: daftar event yang sedang buka (tanpa login)
  if to_regclass('public.gift_events') is not null then
    grant select on gift_events to anon;
    create policy public_open_events on gift_events for select to anon using (status = 'open');
  end if;

  -- /canteen: isi & perbarui laporan HARI INI saja (tanpa login)
  if to_regclass('public.canteen_reports') is not null then
    grant select, insert, update on canteen_reports to anon;
    create policy public_today_read on canteen_reports for select to anon
      using (report_date = (now() at time zone 'Asia/Jakarta')::date);
    create policy public_today_ins on canteen_reports for insert to anon
      with check (report_date = (now() at time zone 'Asia/Jakarta')::date);
    create policy public_today_upd on canteen_reports for update to anon
      using (report_date = (now() at time zone 'Asia/Jakarta')::date)
      with check (report_date = (now() at time zone 'Asia/Jakarta')::date);
  end if;

  -- /request: hanya MENGIRIM permintaan (tidak bisa membaca permintaan orang lain)
  if to_regclass('public.employee_requests') is not null then
    grant insert on employee_requests to anon;
    create policy public_submit on employee_requests for insert to anon with check (true);
  end if;
  if to_regclass('public.printer_requests') is not null then
    grant insert on printer_requests to anon;
    create policy public_submit on printer_requests for insert to anon with check (true);
  end if;
end $$;

-- profiles: baca diri sendiri + sesama staf; tulis hanya lewat Edge Function (service role)
do $$
declare p record;
begin
  alter table profiles enable row level security;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on profiles', p.policyname);
  end loop;
  revoke all on profiles from anon;
  create policy own_or_staff_read on profiles for select to authenticated using (id = auth.uid() or is_staff());
end $$;

-- activity_log: hanya Master Admin yang membaca; tidak bisa dibaca tanpa login
do $$
declare p record;
begin
  if to_regclass('public.activity_log') is null then return; end if;
  alter table activity_log enable row level security;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'activity_log' loop
    execute format('drop policy %I on activity_log', p.policyname);
  end loop;
  revoke all on activity_log from anon;
  create policy master_read on activity_log for select to authenticated using (staff_role() in ('master', 'admin'));
  create policy staff_write on activity_log for insert to authenticated with check (is_staff());   -- untuk trigger log
end $$;

-- ── 3) View ikut RLS & tertutup tanpa login ───────────────────────
do $$
declare v text;
begin
  foreach v in array array['tasks_detail', 'current_kantong', 'driver_tier_summary'] loop
    if to_regclass('public.' || v) is null then continue; end if;
    execute format('alter view %I set (security_invoker = true)', v);
    execute format('revoke all on %I from anon', v);
    execute format('grant select on %I to authenticated', v);
  end loop;
end $$;

-- ── 4) Fungsi ─────────────────────────────────────────────────────
-- 4a. Status tugas: hanya driver pemilik (email login) atau staf armada
create or replace function accept_task(p_task_id uuid, p_driver_id uuid)
returns tasks_detail language plpgsql security definer set search_path = public as $$
declare result tasks_detail;
begin
  if p_driver_id is distinct from my_driver_id() and not staff_can('fleet') then
    raise exception 'Akses ditolak: tugas ini bukan milik akun Anda.' using errcode = '42501';
  end if;
  update tasks set status = 'ON GOING', accepted_at = now()
   where id = p_task_id and driver_id = p_driver_id and status = 'ASSIGNED';
  if not found then raise exception 'Task tidak dapat diterima (status bukan ASSIGNED atau bukan milik driver ini)'; end if;
  select * into result from tasks_detail where id = p_task_id;
  return result;
end $$;

create or replace function complete_task(p_task_id uuid, p_driver_id uuid)
returns tasks_detail language plpgsql security definer set search_path = public as $$
declare result tasks_detail;
begin
  if p_driver_id is distinct from my_driver_id() and not staff_can('fleet') then
    raise exception 'Akses ditolak: tugas ini bukan milik akun Anda.' using errcode = '42501';
  end if;
  update tasks set status = 'DONE', completed_at = now()
   where id = p_task_id and driver_id = p_driver_id and status = 'ON GOING';
  if not found then raise exception 'Task tidak dapat diselesaikan (status bukan ON GOING atau bukan milik driver ini)'; end if;
  select * into result from tasks_detail where id = p_task_id;
  return result;
end $$;

create or replace function cancel_task(p_task_id uuid, p_driver_id uuid, p_reason text default null)
returns tasks_detail language plpgsql security definer set search_path = public as $$
declare result tasks_detail;
begin
  if p_driver_id is distinct from my_driver_id() and not staff_can('fleet') then
    raise exception 'Akses ditolak: tugas ini bukan milik akun Anda.' using errcode = '42501';
  end if;
  update tasks set status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'driver', cancel_reason = p_reason
   where id = p_task_id and driver_id = p_driver_id and status in ('ASSIGNED', 'ON GOING');
  if not found then raise exception 'Task tidak dapat dibatalkan (status sudah final atau bukan milik driver ini)'; end if;
  select * into result from tasks_detail where id = p_task_id;
  return result;
end $$;

revoke all on function accept_task(uuid, uuid), complete_task(uuid, uuid), cancel_task(uuid, uuid, text) from public, anon;
grant execute on function accept_task(uuid, uuid), complete_task(uuid, uuid), cancel_task(uuid, uuid, text) to authenticated;

-- 4b. PIN driver lama (4 digit, tanpa batas percobaan) — tidak dipakai lagi
drop function if exists verify_driver_pin(uuid, text);
drop function if exists set_driver_pin(uuid, text, text);

-- 4c. ATK: simpan barang dari Excel wajib kunci sinkron
do $$
begin
  if to_regclass('public.atk_items') is null then return; end if;
  drop function if exists atk_upsert_item(text, text, text, numeric);
  create or replace function atk_upsert_item(p_kode_barang text, p_nama_barang text, p_satuan text, p_stok numeric, p_key text default null)
  returns void language plpgsql security definer set search_path to 'public' as $f$
  declare v_adj numeric;
  begin
    perform atk_check_key(p_key);
    select coalesce((select sum(jumlah) from atk_restocks where kode_barang = p_kode_barang and source = 'web' and excel_pulled_at is null), 0)
         - coalesce((select sum(jumlah) from atk_requests where kode_barang = p_kode_barang and source = 'web' and excel_pulled_at is null), 0)
      into v_adj;
    insert into atk_items (kode_barang, nama_barang, satuan, stok, updated_at, excel_pulled_at)
    values (p_kode_barang, p_nama_barang, p_satuan, p_stok + v_adj, now(), now())
    on conflict (kode_barang) do update set
      nama_barang = excluded.nama_barang, satuan = excluded.satuan, stok = excluded.stok,
      updated_at = now(), excel_pulled_at = coalesce(atk_items.excel_pulled_at, now());
    update atk_sync_config set last_push_at = now() where id = 1;
  end $f$;
  revoke all on function atk_upsert_item(text, text, text, numeric, text) from public;
  grant execute on function atk_upsert_item(text, text, text, numeric, text) to anon, authenticated;
end $$;

-- 4d. Fungsi internal / staf: tidak bisa dipanggil tanpa login
do $$
declare f text;
begin
  foreach f in array array['rcp_remember_contact(text,text,text)', 'rcp_next_no(text)', 'rcp_wifi_used(uuid)',
                           'set_task_origin_batch(uuid,text)', 'auto_complete_tasks()', 'admin_set_driver_pin(uuid,text)'] loop
    if to_regprocedure(f) is null then continue; end if;
    execute format('revoke all on function %s from public, anon', f);
  end loop;
  -- buku alamat receptionist: hanya dipanggil fungsi receptionist lain
  if to_regprocedure('rcp_remember_contact(text,text,text)') is not null then
    revoke all on function rcp_remember_contact(text, text, text) from authenticated;
  end if;
end $$;

create or replace function set_task_origin_batch(p_batch_id uuid, p_asal text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not staff_can('fleet') then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  update tasks set lokasi_asal = nullif(btrim(p_asal), '') where batch_id = p_batch_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- 4e. Receptionist: data wifi & buku tamu hanya untuk role yang mengelola Receptionist
create or replace function rcp_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()) and staff_can('receptionist');
$$;
revoke all on function rcp_is_staff() from public, anon;
grant execute on function rcp_is_staff() to authenticated;

-- 4f. Gift: batasi tebakan passcode + jangan kirim NIK lengkap / email
create table if not exists gift_verify_attempts (at timestamptz not null default now(), ok boolean not null);
alter table gift_verify_attempts enable row level security;   -- tanpa policy: hanya lewat fungsi
revoke all on gift_verify_attempts from anon, authenticated;

do $$
begin
  if to_regclass('public.gift_registrations') is null then return; end if;
  drop function if exists verify_gift_passcode(text);
  create function verify_gift_passcode(p_passcode text)
  returns table (id uuid, event_id uuid, event_name text, nik text, nama text, departemen text, email text,
                 selections jsonb, claimed boolean, claimed_at timestamptz, claimed_by text, registered_at timestamptz)
  language plpgsql security definer set search_path = public as $f$
  declare v_fail int; v_hit boolean := false;
  begin
    -- maksimal 20 tebakan salah per 10 menit (seluruh sistem)
    select count(*) into v_fail from gift_verify_attempts where not ok and at > now() - interval '10 minutes';
    if v_fail >= 20 then
      raise exception 'Terlalu banyak passcode salah. Coba lagi 10 menit lagi.' using errcode = '42501';
    end if;
    if coalesce(length(regexp_replace(p_passcode, '\D', '', 'g')), 0) < 4 then
      raise exception 'Passcode tidak valid.' using errcode = '22023';
    end if;
    for id, event_id, event_name, nik, nama, departemen, email, selections, claimed, claimed_at, claimed_by, registered_at in
      select r.id, r.event_id, e.name,
             case when length(coalesce(r.nik, '')) > 4 then repeat('•', length(r.nik) - 4) || right(r.nik, 4) else r.nik end,
             r.nama, r.departemen, ''::text, r.selections, r.claimed, r.claimed_at, r.claimed_by, r.registered_at
        from gift_registrations r join gift_events e on e.id = r.event_id
       where r.passcode_hash = crypt(p_passcode, r.passcode_hash)
    loop
      v_hit := true;
      return next;
    end loop;
    insert into gift_verify_attempts (ok) values (v_hit);
    delete from gift_verify_attempts where at < now() - interval '1 day';
  end $f$;
  revoke all on function verify_gift_passcode(text) from public;
  grant execute on function verify_gift_passcode(text) to anon, authenticated;
end $$;

-- 4g. Command Center publik: hanya HARI INI, data seperlunya untuk layar
do $$
begin
  if to_regclass('public.vehicle_gate_logs') is null or to_regclass('public.tasks_detail') is null then return; end if;
  create or replace function get_viewonly_snapshot(p_date date default null)
  returns jsonb language plpgsql security definer set search_path = public stable as $f$
  declare
    v_date date := (now() at time zone 'Asia/Jakarta')::date;   -- p_date diabaikan: hanya hari ini
    v_tasks jsonb; v_drivers jsonb; v_vehicles jsonb; v_gate jsonb;
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'tanggal', t.tanggal, 'driver_id', t.driver_id, 'driver_nama', t.driver_nama,
             'driver_avatar', t.driver_avatar, 'vehicle_id', t.vehicle_id, 'kendaraan', t.kendaraan,
             'kendaraan_jenis', t.kendaraan_jenis, 'jenis_pekerjaan', t.jenis_pekerjaan, 'tujuan', t.tujuan,
             'perihal', t.perihal, 'requestor', split_part(coalesce(t.requestor, ''), ' ', 1),
             'status', t.status, 'created_at', t.created_at, 'accepted_at', t.accepted_at,
             'completed_at', t.completed_at, 'cancelled_at', t.cancelled_at
           ) order by t.created_at desc), '[]'::jsonb)
      into v_tasks from tasks_detail t where t.tanggal = v_date;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'nama', d.nama, 'aktif', d.aktif, 'plant', d.plant,
             'avatar_emoji', d.avatar_emoji, 'driver_type', d.driver_type
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
             'time_out', g.time_out, 'time_in', g.time_in, 'status', g.status, 'created_at', g.created_at
           ) order by g.created_at desc), '[]'::jsonb)
      into v_gate
      from vehicle_gate_logs g
      left join vehicles ve on ve.id = g.vehicle_id
      left join drivers dr on dr.id = g.driver_id
     where g.status <> 'DONE'
        or (g.created_at at time zone 'Asia/Jakarta')::date = v_date
        or (g.time_out at time zone 'Asia/Jakarta')::date = v_date
        or (g.time_in at time zone 'Asia/Jakarta')::date = v_date;

    return jsonb_build_object('date', v_date, 'tasks', v_tasks, 'drivers', v_drivers, 'vehicles', v_vehicles, 'gate', v_gate);
  end $f$;
  revoke all on function get_viewonly_snapshot(date) from public;
  grant execute on function get_viewonly_snapshot(date) to anon, authenticated;
end $$;

notify pgrst, 'reload schema';

-- ── 5) Ringkasan: tabel public yang masih bisa dibaca TANPA LOGIN ──
select c.relname as tabel_masih_terbuka_untuk_anon
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and has_table_privilege('anon', c.oid, 'select')
   and (not c.relrowsecurity or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                                       and p.roles && array['anon', 'public']::name[] and p.cmd in ('SELECT', 'ALL')))
 order by 1;
