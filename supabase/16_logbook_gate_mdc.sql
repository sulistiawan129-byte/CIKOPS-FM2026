-- 16 — Logbook Gate MDC ⇄ FFI
-- Form publik /logbook: karyawan & tamu mencatat keluar-masuk antara area MDC dan FFI (satu kali isi, tanpa NIK).
-- Hanya nama + departemen/perusahaan + keperluan yang disimpan. Tanggal & jam dicatat otomatis (WIB) oleh database.
--
--   • Pengunjung (tanpa login) hanya bisa MENAMBAH lewat fungsi logbook_submit() — tidak bisa membaca daftar.
--   • Staf Security, Admin GA CIK, dan Master Admin bisa melihat, mengekspor, dan menghapus entri yang salah input.
--   • Realtime: dashboard menerima entri baru seketika.
--
-- Jalankan di Supabase SQL Editor CIKOPS, sesudah 02_peran_keamanan.sql. Aman diulang.

create table if not exists public.logbook_gate (
  id          uuid primary key default gen_random_uuid(),
  no          text not null unique,                                 -- LB-DDMMYY-001 (urut per hari)
  created_at  timestamptz not null default now(),
  tanggal     date not null,                                        -- tanggal WIB
  jam         time not null,                                        -- jam WIB
  arah        text not null check (arah in ('mdc_ffi', 'ffi_mdc')), -- mdc_ffi = dari MDC ke FFI
  tipe        text not null check (tipe in ('karyawan', 'guest')),
  nama        text not null,
  asal        text not null,                                        -- departemen (karyawan) / perusahaan (guest)
  keperluan   text not null,
  plant       text not null default 'CIK'
);
create index if not exists logbook_gate_tgl_idx on public.logbook_gate (tanggal desc, created_at desc);

create or replace function logbook_can() returns boolean
language sql stable security definer set search_path = public as $$
  select staff_can('security') or staff_can('facility')
$$;
revoke all on function logbook_can() from public, anon;
grant execute on function logbook_can() to authenticated;

alter table public.logbook_gate enable row level security;
revoke all on public.logbook_gate from anon;
revoke insert, update on public.logbook_gate from authenticated;   -- tambah hanya lewat fungsi
drop policy if exists logbook_read on public.logbook_gate;
drop policy if exists logbook_del  on public.logbook_gate;
create policy logbook_read on public.logbook_gate for select to authenticated using (logbook_can());
create policy logbook_del  on public.logbook_gate for delete to authenticated using (logbook_can());

-- Tambah catatan (publik, tanpa login)
create or replace function logbook_submit(p_arah text, p_tipe text, p_nama text, p_asal text, p_keperluan text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_nama text := regexp_replace(trim(coalesce(p_nama, '')), '\s+', ' ', 'g');
  v_asal text := regexp_replace(trim(coalesce(p_asal, '')), '\s+', ' ', 'g');
  v_kep  text := regexp_replace(trim(coalesce(p_keperluan, '')), '\s+', ' ', 'g');
  v_now  timestamp := (now() at time zone 'Asia/Jakarta');
  v_tgl  date := v_now::date;
  v_n    int;
  v_no   text;
begin
  if p_arah not in ('mdc_ffi', 'ffi_mdc') then raise exception 'Arah tidak valid.'; end if;
  if p_tipe not in ('karyawan', 'guest')  then raise exception 'Pilih Karyawan atau Guest.'; end if;
  if char_length(v_nama) < 2 or char_length(v_nama) > 80 then raise exception 'Nama lengkap harus diisi (2–80 huruf).'; end if;
  if char_length(v_asal) < 1 or char_length(v_asal) > 80 then raise exception 'Departemen / perusahaan harus diisi.'; end if;
  if char_length(v_kep)  < 2 or char_length(v_kep)  > 120 then raise exception 'Tujuan / keperluan harus diisi.'; end if;

  perform pg_advisory_xact_lock(hashtext('logbook_gate'));

  -- pengaman dobel-klik & spam
  if exists (select 1 from logbook_gate where lower(nama) = lower(v_nama) and arah = p_arah and created_at > now() - interval '60 seconds') then
    raise exception 'Catatan yang sama baru saja masuk. Tunggu semenit bila memang ingin mencatat lagi.';
  end if;
  if (select count(*) from logbook_gate where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'Terlalu banyak catatan dalam waktu singkat. Coba lagi sebentar.';
  end if;

  select count(*) + 1 into v_n from logbook_gate where tanggal = v_tgl;
  v_no := 'LB-' || to_char(v_tgl, 'DDMMYY') || '-' || lpad(v_n::text, 3, '0');
  while exists (select 1 from logbook_gate where no = v_no) loop
    v_n := v_n + 1; v_no := 'LB-' || to_char(v_tgl, 'DDMMYY') || '-' || lpad(v_n::text, 3, '0');
  end loop;

  insert into logbook_gate (no, tanggal, jam, arah, tipe, nama, asal, keperluan)
  values (v_no, v_tgl, v_now::time(0), p_arah, p_tipe, v_nama, v_asal, v_kep);

  return jsonb_build_object('no', v_no, 'tanggal', v_tgl, 'jam', to_char(v_now, 'HH24:MI'), 'arah', p_arah);
end $$;
revoke all on function logbook_submit(text, text, text, text, text) from public;
grant execute on function logbook_submit(text, text, text, text, text) to anon, authenticated;

-- Realtime (dashboard menerima entri baru seketika)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'logbook_gate') then
    alter publication supabase_realtime add table public.logbook_gate;
  end if;
end $$;
