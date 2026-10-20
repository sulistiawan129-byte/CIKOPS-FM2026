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
