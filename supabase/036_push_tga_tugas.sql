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
