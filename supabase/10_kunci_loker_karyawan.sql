-- ═════════════════════════════════════════════════
-- 10_KUNCI_LOKER_KARYAWAN — modul "Kunci Loker Karyawan" (Fasilitas): cari kunci loker, CRUD, pinjam/kembali kunci serep.
--   • locker_keys      satu baris = satu pintu loker (blok, slot, pintu, penghuni, no. kunci, status).
--   • locker_key_logs  riwayat otomatis (tambah / ubah / hapus / pinjam / kembali / impor) — tidak bisa diubah dari aplikasi.
--   • Hak akses: baca & tulis hanya Master Admin dan Admin GA (modul Fasilitas). Management / role lain tidak bisa membaca
--     (tabel ini berisi nama & NIK karyawan). Pengunjung tanpa login tidak punya akses sama sekali.
--   • Terpisah dari modul "Locker" (loker ber-PIN untuk pemesanan) — tabel `lockers` TIDAK diubah.
--
-- Jalankan di Supabase SQL Editor CIKOPS, SESUDAH 02_peran_keamanan.sql. Idempotent — aman diulang.
-- Data awal diisi dari aplikasi: menu Kunci Loker → Impor Excel (file Master_Loker_Karyawan).
-- ═════════════════════════════════════════════════

-- ── 1. Tabel ───────────────────────────────────────────────────────────────────────
create table if not exists locker_keys (
  id           uuid primary key default gen_random_uuid(),
  row_no       integer not null default 0,                 -- urutan tampil (mengikuti urutan di Excel)
  blok         text not null,
  slot         integer,                                    -- no. slot kunci
  pintu        text not null default '',                   -- label pintu, mis. A1 / M3
  nama         text not null default '',                   -- penghuni; kosong = loker kosong
  nik          text not null default '',
  dept         text not null default '',
  no_kunci     text not null default '',
  status       text not null default 'Kosong' check (status in ('Terisi', 'Kosong', 'Dipinjam')),
  borrowed_by  text not null default '',                   -- peminjam kunci serep (status Dipinjam)
  borrowed_at  date,
  keterangan   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table  locker_keys is 'Master kunci loker karyawan: satu baris per pintu loker.';
comment on column locker_keys.status is 'Terisi = ada penghuni | Kosong = tanpa penghuni | Dipinjam = kunci serep sedang dipinjam';

create index if not exists locker_keys_row_idx   on locker_keys (row_no);
create index if not exists locker_keys_blok_idx  on locker_keys (blok);
create index if not exists locker_keys_nik_idx   on locker_keys (nik);
create index if not exists locker_keys_kunci_idx on locker_keys (no_kunci);
create index if not exists locker_keys_nama_idx  on locker_keys (lower(nama));

create table if not exists locker_key_logs (
  id            uuid primary key default gen_random_uuid(),
  locker_key_id uuid,                                      -- tanpa foreign key: riwayat tetap ada walau barisnya dihapus
  blok          text not null default '',
  pintu         text not null default '',
  nama          text not null default '',
  action        text not null check (action in ('tambah', 'ubah', 'hapus', 'pinjam', 'kembali', 'impor')),
  detail        text not null default '',
  actor         text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists locker_key_logs_time_idx on locker_key_logs (created_at desc);
create index if not exists locker_key_logs_key_idx  on locker_key_logs (locker_key_id);

-- ── 2. updated_at ──────────────────────────────────────────────────────────────────
create or replace function locker_keys_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_locker_keys_touch on locker_keys;
create trigger trg_locker_keys_touch before update on locker_keys for each row execute function locker_keys_touch();

-- ── 3. Riwayat otomatis ────────────────────────────────────────────────────────────
create or replace function locker_keys_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor  text;
  v_action text;
  v_detail text := '';
  o locker_keys;
  n locker_keys;
begin
  if coalesce(current_setting('lockerkeys.skip_log', true), '') = '1' then return coalesce(new, old); end if;
  select coalesce(nullif(trim(full_name), ''), 'Staf') into v_actor from profiles where id = auth.uid();
  v_actor := coalesce(v_actor, 'Sistem');

  if tg_op = 'INSERT' then
    n := new;
    insert into locker_key_logs (locker_key_id, blok, pintu, nama, action, detail, actor)
    values (n.id, n.blok, n.pintu, n.nama, 'tambah', concat_ws(' · ', nullif('kunci ' || n.no_kunci, 'kunci '), nullif(n.dept, '')), v_actor);
    return new;
  elsif tg_op = 'DELETE' then
    o := old;
    insert into locker_key_logs (locker_key_id, blok, pintu, nama, action, detail, actor)
    values (o.id, o.blok, o.pintu, o.nama, 'hapus', concat_ws(' · ', nullif('kunci ' || o.no_kunci, 'kunci '), nullif(o.dept, ''), o.status), v_actor);
    return old;
  end if;

  o := old; n := new;
  if o.status is distinct from 'Dipinjam' and n.status = 'Dipinjam' then
    v_action := 'pinjam';
    v_detail := concat_ws(' · ', nullif('oleh ' || n.borrowed_by, 'oleh '), case when n.borrowed_at is not null then to_char(n.borrowed_at, 'DD-MM-YYYY') end, nullif(n.keterangan, ''));
  elsif o.status = 'Dipinjam' and n.status is distinct from 'Dipinjam' then
    v_action := 'kembali';
    v_detail := concat_ws(' · ', nullif('dari ' || o.borrowed_by, 'dari '), case when o.borrowed_at is not null then 'dipinjam ' || to_char(o.borrowed_at, 'DD-MM-YYYY') end);
  else
    v_action := 'ubah';
    if o.blok        is distinct from n.blok        then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'blok: ' || o.blok || ' → ' || n.blok); end if;
    if o.pintu       is distinct from n.pintu       then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'pintu: ' || o.pintu || ' → ' || n.pintu); end if;
    if o.nama        is distinct from n.nama        then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'nama: ' || o.nama || ' → ' || n.nama); end if;
    if o.nik         is distinct from n.nik         then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'NIK: ' || o.nik || ' → ' || n.nik); end if;
    if o.dept        is distinct from n.dept        then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'dept: ' || o.dept || ' → ' || n.dept); end if;
    if o.no_kunci    is distinct from n.no_kunci    then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'kunci: ' || o.no_kunci || ' → ' || n.no_kunci); end if;
    if o.status      is distinct from n.status      then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'status: ' || o.status || ' → ' || n.status); end if;
    if o.keterangan  is distinct from n.keterangan  then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'keterangan diubah'); end if;
    if o.slot        is distinct from n.slot        then v_detail := concat_ws(' · ', nullif(v_detail, ''), 'slot: ' || coalesce(o.slot::text, '-') || ' → ' || coalesce(n.slot::text, '-')); end if;
    if v_detail = '' then return new; end if;   -- tidak ada perubahan berarti (mis. hanya urutan)
  end if;

  insert into locker_key_logs (locker_key_id, blok, pintu, nama, action, detail, actor)
  values (n.id, n.blok, n.pintu, n.nama, v_action, v_detail, v_actor);
  return new;
end $$;

drop trigger if exists trg_locker_keys_audit on locker_keys;
create trigger trg_locker_keys_audit after insert or update or delete on locker_keys for each row execute function locker_keys_audit();

-- ── 4. Hak akses (RLS) ─────────────────────────────────────────────────────────────
alter table locker_keys     enable row level security;
alter table locker_key_logs enable row level security;
revoke all on locker_keys, locker_key_logs from anon;

drop policy if exists locker_keys_read  on locker_keys;
drop policy if exists locker_keys_ins   on locker_keys;
drop policy if exists locker_keys_upd   on locker_keys;
drop policy if exists locker_keys_del   on locker_keys;
create policy locker_keys_read on locker_keys for select to authenticated using (staff_can('facility'));
create policy locker_keys_ins  on locker_keys for insert to authenticated with check (staff_can('facility'));
create policy locker_keys_upd  on locker_keys for update to authenticated using (staff_can('facility')) with check (staff_can('facility'));
create policy locker_keys_del  on locker_keys for delete to authenticated using (staff_can('facility'));

drop policy if exists locker_key_logs_read on locker_key_logs;
create policy locker_key_logs_read on locker_key_logs for select to authenticated using (staff_can('facility'));
revoke insert, update, delete on locker_key_logs from authenticated;   -- hanya trigger yang menulis

-- ── 5. Fungsi: pinjam / kembalikan kunci serep ─────────────────────────────────────
create or replace function locker_key_borrow(p_id uuid, p_by text, p_date date default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_by text := left(btrim(coalesce(p_by, '')), 80);
begin
  if not staff_can('facility') then raise exception 'Akses ditolak: akun ini tidak mengelola modul Fasilitas.' using errcode = '42501'; end if;
  if v_by = '' then raise exception 'Nama peminjam wajib diisi.'; end if;
  update locker_keys
     set status = 'Dipinjam', borrowed_by = v_by, borrowed_at = coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date),
         keterangan = case when nullif(btrim(coalesce(p_note, '')), '') is null then keterangan
                           else left(btrim(p_note), 300) end
   where id = p_id;
  if not found then raise exception 'Loker tidak ditemukan.'; end if;
end $$;

create or replace function locker_key_return(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not staff_can('facility') then raise exception 'Akses ditolak: akun ini tidak mengelola modul Fasilitas.' using errcode = '42501'; end if;
  update locker_keys
     set status = case when nama <> '' then 'Terisi' else 'Kosong' end, borrowed_by = '', borrowed_at = null
   where id = p_id and status = 'Dipinjam';
  if not found then raise exception 'Kunci ini tidak sedang dipinjam.'; end if;
end $$;

-- ── 6. Fungsi: impor massal dari Excel ─────────────────────────────────────────────
--   p_replace = true  → seluruh data lama diganti (atomik: gagal = tidak ada yang berubah)
--   p_replace = false → baris baru ditambahkan di bawah data yang ada
create or replace function locker_keys_import(p_rows jsonb, p_replace boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer; base integer := 0; v_actor text;
begin
  if not staff_can('facility') then raise exception 'Akses ditolak: akun ini tidak mengelola modul Fasilitas.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada baris untuk diimpor.';
  end if;
  perform set_config('lockerkeys.skip_log', '1', true);     -- satu catatan ringkas, bukan ribuan baris riwayat
  if p_replace then delete from locker_keys; else select coalesce(max(row_no), 0) into base from locker_keys; end if;

  insert into locker_keys (row_no, blok, slot, pintu, nama, nik, dept, no_kunci, status, borrowed_by, keterangan)
  select base + x.ord, left(btrim(coalesce(x.r ->> 'blok', '')), 30), nullif(x.r ->> 'slot', '')::integer,
         left(btrim(coalesce(x.r ->> 'pintu', '')), 30), left(btrim(coalesce(x.r ->> 'nama', '')), 120), left(btrim(coalesce(x.r ->> 'nik', '')), 30),
         left(btrim(coalesce(x.r ->> 'dept', '')), 80), left(btrim(coalesce(x.r ->> 'no_kunci', '')), 30),
         case when x.r ->> 'status' in ('Terisi', 'Kosong', 'Dipinjam') then x.r ->> 'status' else 'Kosong' end,
         left(btrim(coalesce(x.r ->> 'borrowed_by', '')), 80), left(btrim(coalesce(x.r ->> 'keterangan', '')), 300)
    from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
   where btrim(coalesce(x.r ->> 'blok', '')) <> '';
  get diagnostics n = row_count;

  select coalesce(nullif(trim(full_name), ''), 'Staf') into v_actor from profiles where id = auth.uid();
  insert into locker_key_logs (action, detail, actor)
  values ('impor', format('%s baris diimpor dari Excel (%s)', n, case when p_replace then 'semua data lama diganti' else 'ditambahkan ke data yang ada' end), coalesce(v_actor, 'Sistem'));
  return n;
end $$;

revoke all on function locker_key_borrow(uuid, text, date, text), locker_key_return(uuid), locker_keys_import(jsonb, boolean) from public, anon;
grant execute on function locker_key_borrow(uuid, text, date, text), locker_key_return(uuid), locker_keys_import(jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
select 'ok' as cek, (select count(*) from locker_keys) as jumlah_loker;
