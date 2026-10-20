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
