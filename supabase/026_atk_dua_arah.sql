-- ═══════════════════════════════════════════════════════════════
-- 026 — ATK dua arah: input di CIKOPS  ⇄  Excel/VBA
--
-- Sebelumnya: Excel → CIKOPS saja (CIKOPS hanya laporan).
-- Sekarang:
--   • CIKOPS bisa input Permintaan, Restock, dan Barang baru (lewat
--     fungsi di bawah). Stok di database langsung berubah.
--   • Excel menarik transaksi web itu lewat tombol "Tarik dari CIKOPS"
--     (modSyncCikops versi baru) memakai KUNCI SINKRON, lalu
--     menandainya sudah ditarik.
--   • Stok yang dikirim Excel (atk_upsert_item) otomatis dikoreksi
--     dengan transaksi web yang BELUM ditarik Excel, jadi stok tidak
--     saling menimpa — tetap benar walau VBA lama belum diganti.
--
-- Aman dijalankan ulang. Data lama tidak berubah (dianggap dari Excel).
-- Di bagian paling bawah tampil KUNCI SINKRON untuk diisi di VBA.
-- ═══════════════════════════════════════════════════════════════

-- 1) Kolom penanda asal data & status tarik ke Excel
alter table atk_items    add column if not exists source text not null default 'excel';
alter table atk_items    add column if not exists excel_pulled_at timestamptz;
alter table atk_items    add column if not exists min_stok numeric not null default 5;
alter table atk_items    add column if not exists created_by text default '';

alter table atk_requests add column if not exists source text not null default 'excel';
alter table atk_requests add column if not exists excel_pulled_at timestamptz;
alter table atk_requests add column if not exists created_by text default '';
alter table atk_requests add column if not exists helper text default '';

alter table atk_restocks add column if not exists source text not null default 'excel';
alter table atk_restocks add column if not exists excel_pulled_at timestamptz;
alter table atk_restocks add column if not exists created_by text default '';

create index if not exists idx_atk_requests_pending on atk_requests (kode_barang) where source = 'web' and excel_pulled_at is null;
create index if not exists idx_atk_restocks_pending on atk_restocks (kode_barang) where source = 'web' and excel_pulled_at is null;

-- 2) Konfigurasi sinkron (1 baris). Tidak ada policy → hanya bisa dibaca fungsi di bawah.
create table if not exists atk_sync_config (
  id int primary key default 1 check (id = 1),
  sync_key text not null default replace(gen_random_uuid()::text, '-', ''),
  last_push_at timestamptz,
  last_pull_at timestamptz,
  last_pull_count int default 0
);
insert into atk_sync_config (id) values (1) on conflict (id) do nothing;
alter table atk_sync_config enable row level security;

-- 3) Helper
create or replace function atk_txt(x text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(x, ''), '|', '/'), chr(13), ' '), chr(10), ' ')
$$;

create or replace function atk_staff_name() returns text
language plpgsql security definer set search_path to 'public' as $$
declare n text;
begin
  select coalesce(full_name, '') into n from profiles where id = auth.uid();
  if not found then raise exception 'Akses ditolak: akun tidak terdaftar di CIKOPS.' using errcode = '42501'; end if;
  return n;
end $$;

create or replace function atk_check_key(p_key text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_key is null or not exists (select 1 from atk_sync_config where id = 1 and sync_key = p_key) then
    raise exception 'Kunci sinkron salah. Cek CIKOPS_SYNC_KEY di VBA (menu ATK → Sinkron Excel).' using errcode = '42501';
  end if;
end $$;

create or replace function atk_new_id(p_prefix text, p_tanggal date, p_tbl text) returns text
language plpgsql set search_path to 'public' as $$
declare v text; taken boolean;
begin
  loop
    v := p_prefix || '-' || to_char(p_tanggal, 'YYYYMMDD') || to_char(now() at time zone 'Asia/Jakarta', 'HH24MISS')
         || '-W' || lpad((floor(random() * 100))::int::text, 2, '0');
    if p_tbl = 'req' then select exists (select 1 from atk_requests where request_id = v) into taken;
    else select exists (select 1 from atk_restocks where update_id = v) into taken; end if;
    exit when not taken;
  end loop;
  return v;
end $$;

-- 4) Upsert stok dari Excel (dipanggil VBA) — sekarang dikoreksi transaksi web yang belum ditarik
create or replace function atk_upsert_item(p_kode_barang text, p_nama_barang text, p_satuan text, p_stok numeric)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_adj numeric;
begin
  select coalesce((select sum(jumlah) from atk_restocks where kode_barang = p_kode_barang and source = 'web' and excel_pulled_at is null), 0)
       - coalesce((select sum(jumlah) from atk_requests where kode_barang = p_kode_barang and source = 'web' and excel_pulled_at is null), 0)
    into v_adj;

  insert into atk_items (kode_barang, nama_barang, satuan, stok, updated_at, excel_pulled_at)
  values (p_kode_barang, p_nama_barang, p_satuan, p_stok + v_adj, now(), now())
  on conflict (kode_barang) do update set
    nama_barang = excluded.nama_barang,
    satuan = excluded.satuan,
    stok = excluded.stok,
    updated_at = now(),
    excel_pulled_at = coalesce(atk_items.excel_pulled_at, now()); -- barang ini sudah dikenal Excel

  update atk_sync_config set last_push_at = now() where id = 1;
end $$;

-- 5) INPUT DARI CIKOPS (akun login)
-- p_items: [{"kode":"ATK001","jumlah":2}, ...]
create or replace function atk_web_request(p_tanggal date, p_nama text, p_nik text, p_departemen text, p_helper text, p_items jsonb)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_by text; v_id text; r record; it atk_items%rowtype;
begin
  v_by := atk_staff_name();
  if coalesce(trim(p_nama), '') = '' then raise exception 'Nama pemohon wajib diisi.'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Pilih minimal 1 barang.'; end if;
  v_id := atk_new_id('REQ', coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), 'req');

  for r in
    select x.kode, sum(x.jumlah) as jumlah
    from jsonb_to_recordset(p_items) as x(kode text, jumlah numeric)
    group by x.kode
  loop
    if r.jumlah is null or r.jumlah <= 0 then raise exception 'Jumlah untuk % harus lebih dari 0.', r.kode; end if;
    select * into it from atk_items where kode_barang = r.kode for update;
    if not found then raise exception 'Barang % tidak ditemukan.', r.kode; end if;
    if it.stok < r.jumlah then
      raise exception 'Stok % tidak cukup (sisa %, diminta %).', it.nama_barang, it.stok, r.jumlah;
    end if;
    insert into atk_requests (request_id, tanggal, nama, nik, departemen, kode_barang, nama_barang, jumlah, satuan, helper, source, created_by)
    values (v_id, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), trim(p_nama), coalesce(trim(p_nik), ''), coalesce(trim(p_departemen), ''),
            it.kode_barang, it.nama_barang, r.jumlah, coalesce(it.satuan, ''), coalesce(trim(p_helper), ''), 'web', v_by);
    update atk_items set stok = stok - r.jumlah, updated_at = now() where kode_barang = r.kode;
  end loop;
  return v_id;
end $$;

create or replace function atk_web_restock(p_tanggal date, p_nama text, p_nik text, p_departemen text, p_items jsonb)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_by text; v_id text; r record; it atk_items%rowtype;
begin
  v_by := atk_staff_name();
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Pilih minimal 1 barang.'; end if;
  v_id := atk_new_id('UPD', coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), 'rst');

  for r in
    select x.kode, sum(x.jumlah) as jumlah
    from jsonb_to_recordset(p_items) as x(kode text, jumlah numeric)
    group by x.kode
  loop
    if r.jumlah is null or r.jumlah <= 0 then raise exception 'Jumlah untuk % harus lebih dari 0.', r.kode; end if;
    select * into it from atk_items where kode_barang = r.kode for update;
    if not found then raise exception 'Barang % tidak ditemukan.', r.kode; end if;
    insert into atk_restocks (update_id, tanggal, nama, nik, departemen, kode_barang, nama_barang, jumlah, satuan, source, created_by)
    values (v_id, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), coalesce(nullif(trim(p_nama), ''), v_by), coalesce(trim(p_nik), ''),
            coalesce(trim(p_departemen), ''), it.kode_barang, it.nama_barang, r.jumlah, coalesce(it.satuan, ''), 'web', v_by);
    update atk_items set stok = stok + r.jumlah, updated_at = now() where kode_barang = r.kode;
  end loop;
  return v_id;
end $$;

-- Barang baru (stok awal dicatat sebagai restock web)
create or replace function atk_web_add_item(p_kode text, p_nama text, p_satuan text, p_min_stok numeric, p_stok_awal numeric)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_by text; v_kode text := upper(trim(p_kode));
begin
  v_by := atk_staff_name();
  if v_kode = '' or coalesce(trim(p_nama), '') = '' then raise exception 'Kode dan nama barang wajib diisi.'; end if;
  if exists (select 1 from atk_items where upper(kode_barang) = v_kode) then raise exception 'Kode % sudah dipakai.', v_kode; end if;
  if exists (select 1 from atk_items where lower(nama_barang) = lower(trim(p_nama))) then raise exception 'Nama barang "%" sudah ada.', trim(p_nama); end if;
  insert into atk_items (kode_barang, nama_barang, satuan, stok, min_stok, source, created_by, updated_at)
  values (v_kode, trim(p_nama), coalesce(trim(p_satuan), ''), 0, greatest(coalesce(p_min_stok, 5), 0), 'web', v_by, now());
  if coalesce(p_stok_awal, 0) > 0 then
    perform atk_web_restock((now() at time zone 'Asia/Jakarta')::date, v_by, '', 'Stok awal', jsonb_build_array(jsonb_build_object('kode', v_kode, 'jumlah', p_stok_awal)));
  end if;
  return v_kode;
end $$;

create or replace function atk_web_set_min_stok(p_kode text, p_min numeric)
returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  perform atk_staff_name();
  update atk_items set min_stok = greatest(coalesce(p_min, 0), 0) where kode_barang = p_kode;
  if not found then raise exception 'Barang % tidak ditemukan.', p_kode; end if;
end $$;

-- Batalkan transaksi web yang BELUM ditarik Excel (stok dikembalikan)
create or replace function atk_web_cancel(p_kind text, p_ref text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int := 0; r record;
begin
  perform atk_staff_name();
  if p_kind = 'request' then
    if exists (select 1 from atk_requests where request_id = p_ref and (source <> 'web' or excel_pulled_at is not null)) then
      raise exception 'Transaksi ini sudah ada di Excel — batalkan/koreksi dari Excel.';
    end if;
    for r in select kode_barang, sum(jumlah) j from atk_requests where request_id = p_ref group by kode_barang loop
      update atk_items set stok = stok + r.j, updated_at = now() where kode_barang = r.kode_barang;
    end loop;
    delete from atk_requests where request_id = p_ref; get diagnostics n = row_count;
  elsif p_kind = 'restock' then
    if exists (select 1 from atk_restocks where update_id = p_ref and (source <> 'web' or excel_pulled_at is not null)) then
      raise exception 'Transaksi ini sudah ada di Excel — batalkan/koreksi dari Excel.';
    end if;
    for r in select s.kode_barang, sum(s.jumlah) j, max(i.stok) stok, max(i.nama_barang) nm
             from atk_restocks s join atk_items i on i.kode_barang = s.kode_barang
             where s.update_id = p_ref group by s.kode_barang loop
      if r.stok < r.j then raise exception 'Tidak bisa dibatalkan: stok % tinggal %, sudah terpakai.', r.nm, r.stok; end if;
      update atk_items set stok = stok - r.j, updated_at = now() where kode_barang = r.kode_barang;
    end loop;
    delete from atk_restocks where update_id = p_ref; get diagnostics n = row_count;
  else
    raise exception 'Jenis transaksi tidak dikenal.';
  end if;
  if n = 0 then raise exception 'Transaksi % tidak ditemukan.', p_ref; end if;
  return n;
end $$;

-- Status sinkron untuk dashboard (kunci hanya untuk admin)
create or replace function atk_sync_status()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_admin boolean; c atk_sync_config%rowtype;
begin
  perform atk_staff_name();
  select (role = 'admin' or coalesce(is_master_admin, false)) into v_admin from profiles where id = auth.uid();
  select * into c from atk_sync_config where id = 1;
  return jsonb_build_object(
    'pending_requests', (select count(distinct request_id) from atk_requests where source = 'web' and excel_pulled_at is null),
    'pending_restocks', (select count(distinct update_id) from atk_restocks where source = 'web' and excel_pulled_at is null),
    'pending_items',    (select count(*) from atk_items where source = 'web' and excel_pulled_at is null),
    'last_push_at', c.last_push_at,
    'last_pull_at', c.last_pull_at,
    'last_pull_count', c.last_pull_count,
    'is_admin', coalesce(v_admin, false),
    'sync_key', case when coalesce(v_admin, false) then c.sync_key else null end
  );
end $$;

create or replace function atk_rotate_sync_key()
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or coalesce(is_master_admin, false))) then
    raise exception 'Hanya admin yang bisa mengganti kunci sinkron.' using errcode = '42501';
  end if;
  v := replace(gen_random_uuid()::text, '-', '');
  update atk_sync_config set sync_key = v where id = 1;
  return v;
end $$;

-- 6) UNTUK VBA (anon + kunci sinkron)
-- Hasil teks per baris, kolom dipisah "|":
--   I|id|kode|nama|satuan
--   S|id|update_id|tanggal|nama|nik|departemen|kode|nama_barang|jumlah|satuan
--   Q|id|request_id|tanggal|nama|nik|departemen|kode|nama_barang|jumlah|satuan|helper
create or replace function atk_pull_for_excel(p_key text)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  perform atk_check_key(p_key);
  select string_agg(line, chr(10) order by ord, k1, k2) into v from (
    select 1 ord, kode_barang k1, '' k2,
           concat_ws('|', 'I', id, atk_txt(kode_barang), atk_txt(nama_barang), atk_txt(satuan)) line
    from atk_items where source = 'web' and excel_pulled_at is null
    union all
    select 2, update_id, kode_barang,
           concat_ws('|', 'S', id, atk_txt(update_id), to_char(tanggal, 'YYYY-MM-DD'), atk_txt(nama), atk_txt(nik), atk_txt(departemen),
                     atk_txt(kode_barang), atk_txt(nama_barang), jumlah::text, atk_txt(satuan))
    from atk_restocks where source = 'web' and excel_pulled_at is null
    union all
    select 3, request_id, kode_barang,
           concat_ws('|', 'Q', id, atk_txt(request_id), to_char(tanggal, 'YYYY-MM-DD'), atk_txt(nama), atk_txt(nik), atk_txt(departemen),
                     atk_txt(kode_barang), atk_txt(nama_barang), jumlah::text, atk_txt(satuan), atk_txt(helper))
    from atk_requests where source = 'web' and excel_pulled_at is null
  ) t;
  return coalesce(v, '');
end $$;

-- Tandai sudah ditarik (p_ids: daftar id dipisah koma)
create or replace function atk_mark_pulled(p_key text, p_ids text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare ids text[]; n int := 0; m int;
begin
  perform atk_check_key(p_key);
  ids := string_to_array(regexp_replace(coalesce(p_ids, ''), '\s', '', 'g'), ',');
  update atk_items    set excel_pulled_at = now() where id::text = any(ids) and excel_pulled_at is null; get diagnostics m = row_count; n := n + m;
  update atk_restocks set excel_pulled_at = now() where id::text = any(ids) and excel_pulled_at is null; get diagnostics m = row_count; n := n + m;
  update atk_requests set excel_pulled_at = now() where id::text = any(ids) and excel_pulled_at is null; get diagnostics m = row_count; n := n + m;
  update atk_sync_config set last_pull_at = now(), last_pull_count = n where id = 1;
  return n;
end $$;

-- 7) Hak akses fungsi
revoke all on function atk_staff_name() from public, anon;
revoke all on function atk_check_key(text) from public, anon;
revoke all on function atk_new_id(text, date, text) from public, anon;
revoke all on function atk_web_request(date, text, text, text, text, jsonb) from public, anon;
revoke all on function atk_web_restock(date, text, text, text, jsonb) from public, anon;
revoke all on function atk_web_add_item(text, text, text, numeric, numeric) from public, anon;
revoke all on function atk_web_set_min_stok(text, numeric) from public, anon;
revoke all on function atk_web_cancel(text, text) from public, anon;
revoke all on function atk_sync_status() from public, anon;
revoke all on function atk_rotate_sync_key() from public, anon;
grant execute on function atk_web_request(date, text, text, text, text, jsonb) to authenticated;
grant execute on function atk_web_restock(date, text, text, text, jsonb) to authenticated;
grant execute on function atk_web_add_item(text, text, text, numeric, numeric) to authenticated;
grant execute on function atk_web_set_min_stok(text, numeric) to authenticated;
grant execute on function atk_web_cancel(text, text) to authenticated;
grant execute on function atk_sync_status() to authenticated;
grant execute on function atk_rotate_sync_key() to authenticated;
grant execute on function atk_upsert_item(text, text, text, numeric) to anon, authenticated;
grant execute on function atk_pull_for_excel(text) to anon, authenticated;
grant execute on function atk_mark_pulled(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 8) KUNCI SINKRON → salin ke VBA: Private Const CIKOPS_SYNC_KEY = "..."
select 'KUNCI SINKRON (isi di VBA)' as info, sync_key as nilai from atk_sync_config where id = 1
union all
select 'Jumlah barang', count(*)::text from atk_items;
