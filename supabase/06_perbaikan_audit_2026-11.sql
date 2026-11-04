-- ═════════════════════════════════════════════════
-- 06_PERBAIKAN_AUDIT_2026-11 — menutup temuan audit keamanan (docs/AUDIT_KEAMANAN_ISO27001.md)
--   yang terbukti di database PRODUKSI (hasil supabase/cek_audit_keamanan.sql, 4 Nov 2026).
--
--   A. Fungsi yang bisa dipanggil TANPA login padahal mengubah / membuka data:
--        create_task_batch, delete_task_batch   → hanya staf Fleet (staff_can('fleet')), rentang tanggal ≤ 62 hari
--        admin_cancel_task, admin_update_task_status, admin_set_driver_pin → staf Fleet + search_path dikunci
--        get_claims_by_driver, get_driver_duty_info, get_driver_by_email → hanya staf, atau driver pemilik akun itu
--        get_task_origins       → hanya staf, atau driver pemilik tugas
--        start_bulk_confirmation, admin_release_locker → hanya staf Fasilitas (sebelumnya: akun apa pun yang login)
--   B. PIN locker 3 digit bisa ditebak: salah 5× → kunci 15 menit per locker (verify_locker_release, release_locker_by_user)
--   C. Policy "semua akun login" (termasuk akun driver) → khusus staf:
--        agenda_events, locker_karyawan, locker_pin_history (riwayat PIN!), atk_employees
--   D. employees_dedupe: butuh hak Master Data (sebelumnya: profil apa pun, termasuk Management)
--   E. canteen_reports: batas wajar angka (tidak negatif, ≤ 100.000) — form kantin publik tetap berjalan
--
--   TIDAK diubah (publik BY DESIGN — keputusan ada di laporan audit, bagian "Keputusan"):
--   form /gate, daftar & lepas locker oleh karyawan, cari/klaim gift, /request, /canteen.
--
-- Jalankan di Supabase → SQL Editor SESUDAH 01, 02, 04. Idempotent — aman diulang.
-- Setiap fungsi dibuat ulang PERSIS seperti definisi produksi, hanya ditambah penjaga akses.
-- ═════════════════════════════════════════════════

-- ── Pembantu: apakah p_id adalah baris driver milik akun yang sedang login? ──────────
-- (dicocokkan lewat email di JWT; aman untuk email ganda karena yang dicek baris spesifik itu)
create or replace function is_my_driver(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from drivers d
     where d.id = p_id
       and coalesce(auth.jwt() ->> 'email', '') <> ''
       and lower(d.email) = lower(auth.jwt() ->> 'email'))
$$;
revoke all on function is_my_driver(uuid) from public, anon;
grant execute on function is_my_driver(uuid) to authenticated;


-- ═══ A. FLEET ═══════════════════════════════════════════════════════════════════════

create or replace function create_task_batch(p_driver_id uuid, p_vehicle_id uuid, p_jenis_pekerjaan text, p_tujuan text, p_requestor text, p_departement text, p_perihal text, p_plant text, p_date_from date, p_date_to date)
returns table(created_count integer, batch_id uuid)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_batch_id uuid := gen_random_uuid();
  v_conflict_count int;
  v_day date;
  v_count int := 0;
begin
  if auth.uid() is null or not staff_can('fleet') then
    raise exception 'Akses ditolak: hanya staf Fleet yang boleh membuat tugas.' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null then
    raise exception 'Tanggal mulai dan selesai wajib diisi';
  end if;
  if p_date_to < p_date_from then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai';
  end if;
  if p_date_to - p_date_from > 62 then
    raise exception 'Rentang tugas maksimal 62 hari per sekali buat';
  end if;

  -- Cek bentrok: driver ATAU kendaraan sudah punya tugas aktif
  -- (bukan CANCELLED) di salah satu tanggal dalam rentang ini.
  select count(*) into v_conflict_count
  from tasks
  where tanggal between p_date_from and p_date_to
    and status <> 'CANCELLED'
    and (driver_id = p_driver_id or vehicle_id = p_vehicle_id);

  if v_conflict_count > 0 then
    raise exception 'Driver atau kendaraan sudah punya tugas lain di rentang tanggal ini';
  end if;

  v_day := p_date_from;
  while v_day <= p_date_to loop
    insert into tasks (
      tanggal, driver_id, vehicle_id, jenis_pekerjaan, tujuan,
      requestor, departement, perihal, status, plant, batch_id
    ) values (
      v_day, p_driver_id, p_vehicle_id, p_jenis_pekerjaan, p_tujuan,
      p_requestor, p_departement, p_perihal, 'ASSIGNED', p_plant, v_batch_id
    );
    v_count := v_count + 1;
    v_day := v_day + interval '1 day';
  end loop;

  return query select v_count, v_batch_id;
end;
$function$;
revoke all on function create_task_batch(uuid, uuid, text, text, text, text, text, text, date, date) from public, anon;
grant execute on function create_task_batch(uuid, uuid, text, text, text, text, text, text, date, date) to authenticated;

create or replace function delete_task_batch(p_batch_id uuid)
returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_count int;
begin
  if auth.uid() is null or not staff_can('fleet') then
    raise exception 'Akses ditolak: hanya staf Fleet yang boleh menghapus tugas.' using errcode = '42501';
  end if;
  select count(*) into v_count from tasks where batch_id = p_batch_id;
  delete from tasks where batch_id = p_batch_id;
  return v_count;
end;
$function$;
revoke all on function delete_task_batch(uuid) from public, anon;
grant execute on function delete_task_batch(uuid) to authenticated;

create or replace function admin_cancel_task(p_task_id uuid, p_reason text default null)
returns tasks_detail
language plpgsql security definer set search_path to 'public' as $function$
declare
  result tasks_detail;
  v_admin_label text;
begin
  if auth.uid() is null or not staff_can('fleet') then
    raise exception 'Hanya admin/GA (Fleet) yang dapat membatalkan tugas';
  end if;

  -- Ambil nama/email admin yang sebenarnya untuk audit trail.
  select coalesce(p.full_name, u.email, 'admin') into v_admin_label
  from profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid();

  update tasks
    set status = 'CANCELLED',
        cancelled_at = now(),
        cancelled_by = v_admin_label,
        cancel_reason = p_reason
    where id = p_task_id
      and status in ('ASSIGNED', 'ON GOING');

  if not found then
    raise exception 'Tugas tidak dapat dibatalkan (status sudah final)';
  end if;

  select * into result from tasks_detail where id = p_task_id;
  return result;
end;
$function$;
revoke all on function admin_cancel_task(uuid, text) from public, anon;
grant execute on function admin_cancel_task(uuid, text) to authenticated;

create or replace function admin_update_task_status(p_task_id uuid, p_new_status text)
returns tasks_detail
language plpgsql security definer set search_path to 'public' as $function$
declare
  result tasks_detail;
  v_current_status text;
begin
  if auth.uid() is null or not staff_can('fleet') then
    raise exception 'Hanya admin/GA (Fleet) yang dapat mengubah status tugas';
  end if;

  if p_new_status not in ('ON GOING', 'DONE') then
    raise exception 'Status tujuan tidak valid untuk aksi admin: %', p_new_status;
  end if;

  select status into v_current_status from tasks where id = p_task_id;
  if v_current_status is null then
    raise exception 'Tugas tidak ditemukan';
  end if;

  if p_new_status = 'ON GOING' and v_current_status != 'ASSIGNED' then
    raise exception 'Transisi tidak valid: % -> ON GOING', v_current_status;
  end if;
  if p_new_status = 'DONE' and v_current_status != 'ON GOING' then
    raise exception 'Transisi tidak valid: % -> DONE', v_current_status;
  end if;

  update tasks
    set status = p_new_status,
        accepted_at = case when p_new_status = 'ON GOING' then now() else accepted_at end,
        completed_at = case when p_new_status = 'DONE' then now() else completed_at end
    where id = p_task_id;

  select * into result from tasks_detail where id = p_task_id;
  return result;
end;
$function$;
revoke all on function admin_update_task_status(uuid, text) from public, anon;
grant execute on function admin_update_task_status(uuid, text) to authenticated;

create or replace function admin_set_driver_pin(p_driver_id uuid, p_new_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or not staff_can('fleet') then
    raise exception 'Only Fleet admin/GA users can set a driver PIN directly';
  end if;

  if p_new_pin is null or length(p_new_pin) < 4 then
    raise exception 'PIN must be at least 4 digits';
  end if;

  update drivers
    set pin_hash = crypt(p_new_pin, gen_salt('bf'))
    where id = p_driver_id;
end;
$$;
revoke all on function admin_set_driver_pin(uuid, text) from public, anon;
grant execute on function admin_set_driver_pin(uuid, text) to authenticated;


-- ═══ A2. DATA DRIVER (aplikasi driver) ══════════════════════════════════════════════

create or replace function get_claims_by_driver(p_driver_id uuid)
returns table(id uuid, driver_id uuid, driver_name text, driver_email text, period_date text, submission_date text, items jsonb, total numeric, status text, note text, submitted_at text, plant text)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not (is_staff() or is_my_driver(p_driver_id)) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return query
    select
      c.id,
      c.driver_id,
      coalesce(d.nama, '')        as driver_name,
      coalesce(d.email, '')       as driver_email,
      c.period_date::text,
      c.submission_date::text,
      c.items,
      c.total,
      c.status,
      coalesce(c.note, '')        as note,
      c.submitted_at::text,
      coalesce(c.plant::text, '') as plant
    from public.claims c
    left join public.drivers d on d.id = c.driver_id
    where c.driver_id = p_driver_id
    order by c.submission_date desc;
end;
$function$;
revoke all on function get_claims_by_driver(uuid) from public, anon;
grant execute on function get_claims_by_driver(uuid) to authenticated;

create or replace function get_driver_by_email(p_email text)
returns table(id uuid, nama text, no_hp text, avatar_emoji text, aktif boolean, tier_id uuid, email text, plant text)
language plpgsql security definer set search_path to 'public' as $function$
begin
  -- driver hanya boleh mencari akunnya sendiri; staf boleh mencari siapa saja
  if auth.uid() is null
     or not (is_staff() or lower(coalesce(p_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '#'))) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return query
    select d.id, d.nama, d.no_hp, d.avatar_emoji, d.aktif, d.tier_id, d.email, d.plant::text
    from public.drivers d
    where lower(d.email) = lower(p_email)
      and d.aktif = true
    limit 1;
end;
$function$;
revoke all on function get_driver_by_email(text) from public, anon;
grant execute on function get_driver_by_email(text) to authenticated;

create or replace function get_driver_duty_info(p_driver_id uuid)
returns table (driver_type text, assigned_user text, assigned_user_title text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (is_staff() or is_my_driver(p_driver_id)) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return query
    select d.driver_type, d.assigned_user, d.assigned_user_title
    from drivers d
    where d.id = p_driver_id;
end;
$$;
revoke all on function get_driver_duty_info(uuid) from public, anon;
grant execute on function get_driver_duty_info(uuid) to authenticated;

create or replace function get_task_origins(p_ids uuid[])
returns table (id uuid, lokasi_asal text)
language sql security definer set search_path = public stable as $$
  select t.id, t.lokasi_asal
    from tasks t
   where t.id = any(p_ids)
     and auth.uid() is not null
     and (is_staff() or is_my_driver(t.driver_id))
$$;
revoke all on function get_task_origins(uuid[]) from public, anon;
grant execute on function get_task_origins(uuid[]) to authenticated;


-- ═══ B. LOCKER ══════════════════════════════════════════════════════════════════════

-- Pembatasan percobaan PIN. Tabel hanya disentuh fungsi di bawah (RLS aktif tanpa policy).
create table if not exists locker_pin_attempts (
  locker_number text primary key,
  fails         int  not null default 0,
  locked_until  timestamptz,
  last_fail     timestamptz
);
alter table locker_pin_attempts enable row level security;
revoke all on locker_pin_attempts from anon, authenticated;

-- menit tersisa bila locker sedang dikunci (0 = tidak dikunci)
create or replace function _locker_lock_minutes(p_number text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select greatest(1, ceil(extract(epoch from (a.locked_until - now())) / 60))::int
                     from locker_pin_attempts a
                    where a.locker_number = p_number and a.locked_until > now()), 0)
$$;

-- catat satu PIN salah; sampai 5× → kunci 15 menit lalu hitungan mulai dari nol
create or replace function _locker_pin_fail(p_number text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into locker_pin_attempts (locker_number, fails, last_fail) values (p_number, 1, now())
  on conflict (locker_number) do update
    set fails = case when locker_pin_attempts.last_fail < now() - interval '1 hour' then 1 else locker_pin_attempts.fails + 1 end,
        last_fail = now();
  update locker_pin_attempts
     set locked_until = now() + interval '15 minutes', fails = 0
   where locker_number = p_number and fails >= 5;
end $$;

create or replace function _locker_pin_ok(p_number text) returns void
language sql security definer set search_path = public as $$
  delete from locker_pin_attempts where locker_number = p_number
$$;

revoke all on function _locker_lock_minutes(text), _locker_pin_fail(text), _locker_pin_ok(text) from public, anon, authenticated;

-- PIN salah TIDAK lagi memakai "raise exception" (itu membatalkan pencatatan percobaan);
-- fungsi mengembalikan 0 baris dan aplikasi menampilkan "PIN salah".
create or replace function verify_locker_release(p_number text, p_pin text)
returns table(locker_number text, nama text, extra text, periode text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status text;
  v_pin text;
  v_nama text;
  v_extra text;
  v_periode text;
  v_wait int;
begin
  v_wait := _locker_lock_minutes(p_number);
  if v_wait > 0 then
    raise exception 'Terlalu banyak PIN salah. Coba lagi sekitar % menit lagi, atau hubungi GA.', v_wait;
  end if;

  select lockers.status, lockers.pin, lockers.nama, lockers.extra, lockers.periode
    into v_status, v_pin, v_nama, v_extra, v_periode
  from lockers where lockers.number = p_number;

  if v_status is null then
    raise exception 'Nomor locker tidak ditemukan.';
  end if;
  if v_status <> 'Terisi' then
    raise exception 'Locker ini belum digunakan / sudah kosong.';
  end if;
  if v_pin is distinct from p_pin then
    perform _locker_pin_fail(p_number);
    return;
  end if;

  perform _locker_pin_ok(p_number);
  return query select p_number, v_nama, v_extra, v_periode;
end;
$function$;
revoke all on function verify_locker_release(text, text) from public;
grant execute on function verify_locker_release(text, text) to anon, authenticated;

create or replace function release_locker_by_user(p_number text, p_pin text)
returns table(locker_number text, nama text, email text, extra text, periode text, source text, pin text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid;
  v_status text;
  v_pin text;
  v_wait int;
begin
  v_wait := _locker_lock_minutes(p_number);
  if v_wait > 0 then
    raise exception 'Terlalu banyak PIN salah. Coba lagi sekitar % menit lagi, atau hubungi GA.', v_wait;
  end if;

  select lockers.id, lockers.status, lockers.pin into v_id, v_status, v_pin
  from lockers where lockers.number = p_number;

  if v_id is null then
    raise exception 'Nomor locker tidak ditemukan.';
  end if;
  if v_status <> 'Terisi' then
    raise exception 'Locker ini belum digunakan / sudah kosong.';
  end if;
  if v_pin is distinct from p_pin then
    perform _locker_pin_fail(p_number);
    return;
  end if;

  perform _locker_pin_ok(p_number);
  return query select * from release_locker_by_id_(v_id, 'user');
end;
$function$;
revoke all on function release_locker_by_user(text, text) from public;
grant execute on function release_locker_by_user(text, text) to anon, authenticated;

-- Aksi admin Fasilitas: sebelumnya cukup "akun apa pun yang login" (termasuk akun driver)
create or replace function start_bulk_confirmation()
returns table(locker_number text, email text, nama text, extra text, periode text, token text)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not staff_can('facility') then
    raise exception 'Hanya admin/GA (Fasilitas) yang bisa melakukan aksi ini.';
  end if;

  update lockers
    set confirm_token = gen_random_uuid()::text
    where lockers.status = 'Terisi' and lockers.email is not null and lockers.email <> '';

  return query
    select l.number, l.email, l.nama, l.extra, l.periode, l.confirm_token
    from lockers l
    where l.status = 'Terisi' and l.confirm_token is not null and l.email is not null and l.email <> '';
end;
$function$;
revoke all on function start_bulk_confirmation() from public, anon;
grant execute on function start_bulk_confirmation() to authenticated;

create or replace function admin_release_locker(p_number text)
returns table(locker_number text, nama text, email text, extra text, periode text, source text, pin text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null or not staff_can('facility') then
    raise exception 'Hanya admin/GA (Fasilitas) yang bisa melakukan aksi ini.';
  end if;

  select lockers.id, lockers.status into v_id, v_status
  from lockers where lockers.number = p_number;

  if v_id is null then
    raise exception 'Nomor locker tidak ditemukan.';
  end if;
  if v_status <> 'Terisi' then
    raise exception 'Locker ini sudah kosong.';
  end if;

  return query select * from release_locker_by_id_(v_id, 'admin');
end;
$function$;
revoke all on function admin_release_locker(text) from public, anon;
grant execute on function admin_release_locker(text) to authenticated;


-- ═══ C. POLICY "SEMUA AKUN LOGIN" → KHUSUS STAF ═════════════════════════════════════
-- Akun driver / TGA juga "authenticated"; policy lama tidak membedakan sehingga mereka
-- bisa membaca & mengubah agenda, data locker, riwayat PIN locker, dan daftar karyawan ATK.

do $$
begin
  -- agenda_events (kalender): lihat = semua staf; ubah = staf modul Kalender
  if to_regclass('public.agenda_events') is not null then
    drop policy if exists agenda_events_all_authenticated on agenda_events;
    drop policy if exists agenda_events_staff_select on agenda_events;
    drop policy if exists agenda_events_staff_write  on agenda_events;
    create policy agenda_events_staff_select on agenda_events for select to authenticated using (is_staff());
    create policy agenda_events_staff_write  on agenda_events for all    to authenticated using (staff_can('calendar')) with check (staff_can('calendar'));
  end if;

  -- locker_karyawan: lihat = staf; ubah = staf Fasilitas
  if to_regclass('public.locker_karyawan') is not null then
    drop policy if exists locker_karyawan_write_authenticated  on locker_karyawan;
    drop policy if exists locker_karyawan_select_authenticated on locker_karyawan;
    drop policy if exists locker_karyawan_staff_select on locker_karyawan;
    drop policy if exists locker_karyawan_staff_write  on locker_karyawan;
    create policy locker_karyawan_staff_select on locker_karyawan for select to authenticated using (is_staff());
    create policy locker_karyawan_staff_write  on locker_karyawan for all    to authenticated using (staff_can('facility')) with check (staff_can('facility'));
  end if;

  -- locker_pin_history: berisi PIN → hanya staf Fasilitas
  if to_regclass('public.locker_pin_history') is not null then
    drop policy if exists locker_pin_history_select_authenticated on locker_pin_history;
    drop policy if exists locker_pin_history_staff_select on locker_pin_history;
    create policy locker_pin_history_staff_select on locker_pin_history for select to authenticated using (staff_can('facility'));
  end if;

  -- atk_employees: daftar NIK + nama + departemen → staf Fasilitas / Master Data
  if to_regclass('public.atk_employees') is not null then
    drop policy if exists atk_employees_read on atk_employees;
    create policy atk_employees_read on atk_employees for select to authenticated using (staff_can('facility') or staff_can('masterdata'));
  end if;
end $$;


-- ═══ D. employees_dedupe: butuh hak Master Data ═════════════════════════════════════
-- (tubuh fungsi diambil dari database lalu hanya baris pemeriksaan akses yang diganti)
do $$
declare d text; d2 text;
begin
  if to_regprocedure('public.employees_dedupe(uuid[])') is null then return; end if;
  d := pg_get_functiondef('public.employees_dedupe(uuid[])'::regprocedure);
  d2 := replace(d, 'not exists (select 1 from profiles where id = auth.uid())', 'not staff_can(''masterdata'')');
  d2 := replace(d2, 'Akses ditolak: akun tidak terdaftar di CIKOPS.', 'Akses ditolak: butuh hak Master Data.');
  if d2 = d then
    raise notice 'employees_dedupe: pola pemeriksaan akses tidak ditemukan (mungkin sudah diperbaiki) — dilewati.';
  else
    execute d2;
  end if;
end $$;
revoke all on function employees_dedupe(uuid[]) from public, anon;
grant execute on function employees_dedupe(uuid[]) to authenticated;


-- ═══ E. canteen_reports: batas wajar angka ══════════════════════════════════════════
-- Form kantin publik (/canteen) masih boleh mengisi; hanya angka tak masuk akal yang ditolak.
-- NOT VALID = baris lama tidak diperiksa ulang (tidak mungkin gagal karena data lama).
do $$
declare c record;
begin
  if to_regclass('public.canteen_reports') is null then return; end if;
  for c in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'canteen_reports'
       and data_type in ('numeric', 'integer', 'bigint', 'double precision', 'real', 'smallint')
       and column_name ~ '^(snack|meal)_'
  loop
    if not exists (select 1 from pg_constraint where conname = 'canteen_reports_' || c.column_name || '_rng') then
      execute format('alter table canteen_reports add constraint %I check (%I between 0 and 100000) not valid',
                     'canteen_reports_' || c.column_name || '_rng', c.column_name);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Pemeriksaan cepat: fungsi di bawah TIDAK boleh lagi muncul sebagai "anon = true"
select p.proname as fungsi, has_function_privilege('anon', p.oid, 'execute') as anon_bisa_panggil
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('create_task_batch', 'delete_task_batch', 'admin_cancel_task', 'admin_update_task_status', 'admin_set_driver_pin',
                     'get_claims_by_driver', 'get_driver_duty_info', 'get_driver_by_email', 'get_task_origins',
                     'start_bulk_confirmation', 'admin_release_locker', 'employees_dedupe')
 order by 1;
