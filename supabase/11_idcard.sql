-- ═════════════════════════════════════════════════
-- 11_IDCARD — modul "ID Card" (Security → ID Card): kartu akses non-karyawan (Temporary / Contractor / Outsourcing).
--   Alur sama dengan sistem ID Card lama: Pengajuan (generate nomor) → Cetak kartu (PDF A4) → Penyerahan (tanda terima)
--   + Card Designer. Bedanya, data di database (bisa dipakai bersama) dan nomor dibuat ATOMIK oleh database
--   sehingga tidak bisa kembar, serta setiap kartu bisa dilacak (diterbitkan / diserahkan / kembali / hilang).
--
--   Penomoran (tetap): Temporary  T-DDMMYY###   | Contractor & Outsourcing  DDMMYY###  (urutan harian, kembali ke 001 tiap hari WIB)
--   Contractor dan Outsourcing MEMAKAI SATU URUTAN yang sama supaya nomor kartu tidak pernah kembar antar jenis.
--
--   Hak akses: Master Admin, Admin GA CIK, dan Admin / SPV Security (modul Fasilitas atau Security). Role lain & anonim: tidak ada akses.
--
-- Jalankan di Supabase SQL Editor CIKOPS, SESUDAH 02_peran_keamanan.sql. Idempotent — aman diulang.
-- ═════════════════════════════════════════════════

-- ── 1. Tabel ───────────────────────────────────────────────────────────────────────
create table if not exists idcard_requests (
  id          uuid primary key default gen_random_uuid(),
  tanggal     date not null default (now() at time zone 'Asia/Jakarta')::date,
  perusahaan  text not null,
  pic         text not null,
  phone       text not null default '',
  tipe        text not null check (tipe in ('T', 'C', 'O')),
  lokasi      text not null default 'CIKARANG',
  jumlah      integer not null check (jumlah between 1 and 500),
  card_from   text not null,
  card_to     text not null,
  status      text not null default 'pending' check (status in ('pending', 'printed', 'selesai')),
  catatan     text not null default '',
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idcard_requests_time_idx on idcard_requests (created_at desc);

create table if not exists idcard_handovers (
  id          uuid primary key default gen_random_uuid(),
  tanggal     date not null default (now() at time zone 'Asia/Jakarta')::date,
  perusahaan  text not null,
  pic         text not null,
  phone       text not null default '',
  jabatan     text not null default '',
  tipe        text not null check (tipe in ('T', 'C', 'O')),
  jumlah      integer not null check (jumlah between 1 and 999),
  card_from   text not null,
  card_to     text not null,
  catatan     text not null default '',
  request_id  uuid,                                        -- referensi pengajuan (opsional)
  validated   boolean not null default true,               -- false = kartu lama di luar sistem (nomor tidak diperiksa)
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idcard_handovers_time_idx on idcard_handovers (created_at desc);

create table if not exists idcards (
  id          uuid primary key default gen_random_uuid(),
  ord         bigint generated always as identity,         -- urutan penerbitan (dipakai untuk rentang "dari … sampai")
  request_id  uuid not null references idcard_requests(id) on delete cascade,
  number      text not null unique,
  tipe        text not null check (tipe in ('T', 'C', 'O')),
  status      text not null default 'diterbitkan' check (status in ('diterbitkan', 'diserahkan', 'kembali', 'hilang')),
  handover_id uuid,
  handed_at   date,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idcards_request_idx  on idcards (request_id);
create index if not exists idcards_ord_idx      on idcards (tipe, ord);
create index if not exists idcards_handover_idx on idcards (handover_id);

create table if not exists idcard_card_logs (
  id          uuid primary key default gen_random_uuid(),
  number      text not null,
  action      text not null,
  detail      text not null default '',
  actor       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idcard_card_logs_num_idx on idcard_card_logs (number, created_at desc);

-- penghitung nomor harian (satu baris per hari WIB per deret: T atau CO)
create table if not exists idcard_counters (
  day      date not null,
  series   text not null check (series in ('T', 'CO')),
  last_seq integer not null default 0,
  primary key (day, series)
);

-- desain kartu (satu baris): ukuran, template, zona teks, logo
create table if not exists idcard_settings (
  id         integer primary key check (id = 1),
  design     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

-- ── 2. Hak akses ───────────────────────────────────────────────────────────────────
create or replace function idcard_can() returns boolean
language sql stable security definer set search_path = public as $$
  select staff_can('facility') or staff_can('security')
$$;
revoke all on function idcard_can() from public, anon;
grant execute on function idcard_can() to authenticated;

alter table idcard_requests  enable row level security;
alter table idcard_handovers enable row level security;
alter table idcards          enable row level security;
alter table idcard_card_logs enable row level security;
alter table idcard_counters  enable row level security;
alter table idcard_settings  enable row level security;
revoke all on idcard_requests, idcard_handovers, idcards, idcard_card_logs, idcard_counters, idcard_settings from anon;

do $$
declare t text;
begin
  foreach t in array array['idcard_requests', 'idcard_handovers', 'idcards', 'idcard_card_logs', 'idcard_counters', 'idcard_settings'] loop
    execute format('drop policy if exists idcard_read on %I', t);
    execute format('create policy idcard_read on %I for select to authenticated using (idcard_can())', t);
  end loop;
end $$;

-- pengajuan: status & catatan boleh diubah langsung; tambah/hapus lewat fungsi (nomor harus dibuat database)
drop policy if exists idcard_upd on idcard_requests;
create policy idcard_upd on idcard_requests for update to authenticated using (idcard_can()) with check (idcard_can());
revoke insert, delete on idcard_requests from authenticated;
revoke insert, update, delete on idcard_handovers, idcards, idcard_card_logs, idcard_counters from authenticated;

drop policy if exists idcard_settings_ins on idcard_settings;
drop policy if exists idcard_settings_upd on idcard_settings;
create policy idcard_settings_ins on idcard_settings for insert to authenticated with check (idcard_can());
create policy idcard_settings_upd on idcard_settings for update to authenticated using (idcard_can()) with check (idcard_can());

-- ── 3. Fungsi ──────────────────────────────────────────────────────────────────────
create or replace function idcard_actor() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select full_name from profiles where id = auth.uid())), ''), 'Staf')
$$;

create or replace function idcard_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not idcard_can() then raise exception 'Akses ditolak: akun ini tidak mengelola modul ID Card.' using errcode = '42501'; end if;
end $$;

-- Nomor kartu: Temporary T-DDMMYY###, selain itu DDMMYY###
create or replace function idcard_format(p_tipe text, p_day date, p_seq integer) returns text
language sql immutable as $$
  select case when p_tipe = 'T' then 'T-' else '' end || to_char(p_day, 'DDMMYY') || lpad(p_seq::text, 3, '0')
$$;

-- Pengajuan baru: nomor dibuat atomik (tidak bisa kembar walau dua orang mengajukan bersamaan)
create or replace function idcard_create_request(
  p_tanggal date, p_perusahaan text, p_pic text, p_phone text, p_tipe text, p_lokasi text, p_jumlah integer, p_catatan text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Asia/Jakarta')::date;
  v_series text := case when p_tipe = 'T' then 'T' else 'CO' end;
  v_last integer; v_start integer; v_id uuid;
begin
  perform idcard_guard();
  if p_tipe not in ('T', 'C', 'O') then raise exception 'Jenis kartu tidak valid.'; end if;
  if btrim(coalesce(p_perusahaan, '')) = '' then raise exception 'Nama perusahaan harus diisi.'; end if;
  if btrim(coalesce(p_pic, '')) = '' then raise exception 'Nama PIC harus diisi.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 500 then raise exception 'Jumlah harus antara 1–500.'; end if;

  insert into idcard_counters (day, series, last_seq) values (v_day, v_series, p_jumlah)
  on conflict (day, series) do update set last_seq = idcard_counters.last_seq + p_jumlah
  returning last_seq into v_last;
  v_start := v_last - p_jumlah + 1;

  insert into idcard_requests (tanggal, perusahaan, pic, phone, tipe, lokasi, jumlah, card_from, card_to, catatan, created_by)
  values (coalesce(p_tanggal, v_day), left(btrim(p_perusahaan), 120), left(btrim(p_pic), 80), left(btrim(coalesce(p_phone, '')), 30), p_tipe,
          upper(left(coalesce(nullif(btrim(p_lokasi), ''), 'CIKARANG'), 40)), p_jumlah,
          idcard_format(p_tipe, v_day, v_start), idcard_format(p_tipe, v_day, v_last), left(btrim(coalesce(p_catatan, '')), 500), idcard_actor())
  returning id into v_id;

  insert into idcards (request_id, number, tipe)
  select v_id, idcard_format(p_tipe, v_day, g), p_tipe from generate_series(v_start, v_last) g;
  return v_id;
end $$;

-- Tandai sudah dicetak (hanya bila masih pending)
create or replace function idcard_mark_printed(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform idcard_guard();
  update idcard_requests set status = 'printed' where id = p_id and status = 'pending';
end $$;

-- Hapus pengajuan: ditolak bila ada kartunya yang sudah diserahkan / kembali / hilang
create or replace function idcard_delete_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform idcard_guard();
  select count(*) into n from idcards where request_id = p_id and status <> 'diterbitkan';
  if n > 0 then raise exception 'Tidak bisa dihapus: % kartu sudah diserahkan / dikembalikan / hilang. Batalkan penyerahannya dulu.', n; end if;
  delete from idcard_requests where id = p_id;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
end $$;

-- Penyerahan kartu. Nomor "dari … sampai" diperiksa terhadap kartu yang pernah diterbitkan (rentang menurut urutan terbit, jenis sama).
-- p_skip_validation = true → kartu lama di luar sistem: dicatat apa adanya (jumlah = p_jumlah), tanpa mengubah status kartu.
create or replace function idcard_create_handover(
  p_tanggal date, p_perusahaan text, p_pic text, p_phone text, p_jabatan text, p_tipe text,
  p_card_from text, p_card_to text, p_jumlah integer, p_catatan text, p_request_id uuid, p_skip_validation boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_from idcards; v_to idcards; v_n integer; v_busy integer;
  v_from_txt text := upper(btrim(coalesce(p_card_from, '')));
  v_to_txt   text := upper(btrim(coalesce(p_card_to, '')));
  v_actor text := idcard_actor();
  v_jumlah integer := p_jumlah;
  v_req uuid;
begin
  perform idcard_guard();
  if p_tipe not in ('T', 'C', 'O') then raise exception 'Jenis kartu tidak valid.'; end if;
  if btrim(coalesce(p_perusahaan, '')) = '' then raise exception 'Nama perusahaan harus diisi.'; end if;
  if btrim(coalesce(p_pic, '')) = '' then raise exception 'Nama penerima harus diisi.'; end if;
  if v_from_txt = '' or v_to_txt = '' then raise exception 'Nomor kartu dari / sampai harus diisi.'; end if;

  if not coalesce(p_skip_validation, false) then
    select * into v_from from idcards where number = v_from_txt;
    select * into v_to   from idcards where number = v_to_txt;
    if v_from.id is null then raise exception 'Nomor % tidak ditemukan di data kartu yang diterbitkan. (Kartu lama? Centang "kartu lama di luar sistem".)', v_from_txt; end if;
    if v_to.id is null   then raise exception 'Nomor % tidak ditemukan di data kartu yang diterbitkan. (Kartu lama? Centang "kartu lama di luar sistem".)', v_to_txt; end if;
    if v_from.tipe <> p_tipe or v_to.tipe <> p_tipe then raise exception 'Jenis kartu pada nomor tidak sama dengan jenis yang dipilih.'; end if;
    if v_from.ord > v_to.ord then raise exception 'Nomor "dari" harus lebih awal dari nomor "sampai".'; end if;
    select count(*), count(*) filter (where status <> 'diterbitkan') into v_n, v_busy
      from idcards where tipe = p_tipe and ord between v_from.ord and v_to.ord;
    if v_busy > 0 then raise exception '% dari % kartu dalam rentang ini tidak berstatus "diterbitkan" (sudah diserahkan / kembali / hilang).', v_busy, v_n; end if;
    v_jumlah := v_n;
  else
    if v_jumlah is null or v_jumlah < 1 or v_jumlah > 999 then raise exception 'Jumlah harus antara 1–999.'; end if;
  end if;

  insert into idcard_handovers (id, tanggal, perusahaan, pic, phone, jabatan, tipe, jumlah, card_from, card_to, catatan, request_id, validated, created_by)
  values (v_id, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), left(btrim(p_perusahaan), 120), left(btrim(p_pic), 80), left(btrim(coalesce(p_phone, '')), 30),
          left(btrim(coalesce(p_jabatan, '')), 60), p_tipe, v_jumlah, v_from_txt, v_to_txt, left(btrim(coalesce(p_catatan, '')), 500), p_request_id,
          not coalesce(p_skip_validation, false), v_actor);

  if not coalesce(p_skip_validation, false) then
    update idcards set status = 'diserahkan', handover_id = v_id, handed_at = coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), updated_at = now()
     where tipe = p_tipe and ord between v_from.ord and v_to.ord;
    insert into idcard_card_logs (number, action, detail, actor)
    select number, 'serah', format('%s · %s', btrim(p_perusahaan), btrim(p_pic)), v_actor from idcards where handover_id = v_id;

    -- pengajuan yang kartunya sudah habis diserahkan → Selesai (yang diacu maupun semua pengajuan yang kartunya ikut terserahkan)
    for v_req in select distinct request_id from idcards where handover_id = v_id loop
      if not exists (select 1 from idcards where request_id = v_req and status = 'diterbitkan') then
        update idcard_requests set status = 'selesai' where id = v_req;
      end if;
    end loop;
  end if;
  return v_id;
end $$;

-- Batalkan penyerahan: kartu kembali berstatus "diterbitkan"
create or replace function idcard_delete_handover(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor text := idcard_actor();
begin
  perform idcard_guard();
  insert into idcard_card_logs (number, action, detail, actor)
  select number, 'batal-serah', 'penyerahan dibatalkan', v_actor from idcards where handover_id = p_id;
  update idcards set status = 'diterbitkan', handover_id = null, handed_at = null, updated_at = now() where handover_id = p_id and status = 'diserahkan';
  update idcard_requests r set status = 'printed'
   where r.status = 'selesai' and exists (select 1 from idcards c where c.request_id = r.id and c.status = 'diterbitkan');
  delete from idcard_handovers where id = p_id;
  if not found then raise exception 'Data penyerahan tidak ditemukan.'; end if;
end $$;

-- Ubah status satu kartu: kembali / hilang / diterbitkan (kartu kembali disiapkan untuk dipakai lagi)
create or replace function idcard_set_card_status(p_number text, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c idcards; v_actor text := idcard_actor();
begin
  perform idcard_guard();
  if p_status not in ('kembali', 'hilang', 'diterbitkan') then raise exception 'Status tidak valid.'; end if;
  select * into c from idcards where number = upper(btrim(coalesce(p_number, '')));
  if c.id is null then raise exception 'Nomor kartu tidak ditemukan.'; end if;
  if p_status = 'kembali' and c.status <> 'diserahkan' then raise exception 'Hanya kartu yang sedang diserahkan yang bisa ditandai kembali.'; end if;
  update idcards set status = p_status, note = left(btrim(coalesce(p_note, note)), 300), updated_at = now(),
         handover_id = case when p_status = 'diterbitkan' then null else handover_id end,
         handed_at   = case when p_status = 'diterbitkan' then null else handed_at end
   where id = c.id;
  insert into idcard_card_logs (number, action, detail, actor)
  values (c.number, p_status, coalesce(nullif(btrim(p_note), ''), ''), v_actor);
  -- kartu disiapkan ulang → pengajuannya bukan "selesai" lagi
  if p_status = 'diterbitkan' then update idcard_requests set status = 'printed' where id = c.request_id and status = 'selesai'; end if;
end $$;

revoke all on function idcard_actor(), idcard_guard(), idcard_format(text, date, integer) from public, anon;
revoke all on function idcard_create_request(date, text, text, text, text, text, integer, text),
                       idcard_mark_printed(uuid), idcard_delete_request(uuid),
                       idcard_create_handover(date, text, text, text, text, text, text, text, integer, text, uuid, boolean),
                       idcard_delete_handover(uuid), idcard_set_card_status(text, text, text) from public, anon;
grant execute on function idcard_create_request(date, text, text, text, text, text, integer, text),
                          idcard_mark_printed(uuid), idcard_delete_request(uuid),
                          idcard_create_handover(date, text, text, text, text, text, text, text, integer, text, uuid, boolean),
                          idcard_delete_handover(uuid), idcard_set_card_status(text, text, text) to authenticated;

notify pgrst, 'reload schema';
select 'ok' as cek, (select count(*) from idcard_requests) as pengajuan, (select count(*) from idcards) as kartu;
