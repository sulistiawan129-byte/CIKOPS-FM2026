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
