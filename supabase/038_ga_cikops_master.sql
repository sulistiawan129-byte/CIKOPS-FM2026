-- ═══════════════════════════════════════════════════════════════
-- 038 — Cleaning & Gardening: CIKOPS jadi SUMBER UTAMA, Excel mengikuti
--
-- Sebelumnya (027): Excel "ISS GA System" → CIKOPS (CIKOPS hanya membaca).
-- Sekarang:
--   • Semua input di CIKOPS: master pekerjaan, manpower, jadwal (generate),
--     checklist actual harian, Event, Improvement, Inventory.
--   • Excel MENARIK data dari CIKOPS (modSyncGA v2 → ga_pull) dan menulis
--     ulang sheet-nya mengikuti template CIKOPS. Excel = cermin/laporan.
--   • Mode diatur di ga_sync_config.master: 'excel' (lama) atau 'cikops'.
--     Saat 'cikops', kiriman dari Excel lama (ga_sync_master / plan / logs)
--     DITOLAK dengan pesan jelas supaya data di CIKOPS tidak tertimpa.
--   • Aturan jadwal sama dengan Excel (GeneratePlan): per pekerjaan, hari
--     Senin..Minggu (maks 4 hari di kolom Hari 1-4), key = ID|yyyymmdd,
--     generate ulang tidak menyentuh actual yang sudah diisi.
--
-- Data yang sudah ada (hasil sinkron Excel terakhir) menjadi data awal.
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 027.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Kolom tambahan ──
alter table ga_sync_config add column if not exists master text not null default 'excel';
alter table ga_sync_config add column if not exists master_since timestamptz;
alter table ga_sync_config add column if not exists last_pull_at timestamptz;
alter table ga_sync_config add column if not exists last_pull_computer text;
do $$ begin
  alter table ga_sync_config drop constraint if exists ga_sync_config_master_check;
  alter table ga_sync_config add constraint ga_sync_config_master_check check (master in ('excel', 'cikops'));
end $$;

alter table ga_jobs add column if not exists created_at timestamptz not null default now();
alter table ga_jobs add column if not exists updated_at timestamptz;
alter table ga_jobs add column if not exists updated_by text not null default '';
alter table ga_manpower add column if not exists no_hp text not null default '';
alter table ga_manpower add column if not exists updated_at timestamptz;
alter table ga_events add column if not exists updated_by text not null default '';
alter table ga_events add column if not exists updated_at timestamptz;
alter table ga_improvements add column if not exists updated_by text not null default '';
alter table ga_improvements add column if not exists updated_at timestamptz;
alter table ga_inventory add column if not exists updated_by text not null default '';
alter table ga_inventory add column if not exists updated_at timestamptz;

-- ── 2) Helper ──
create or replace function ga_is_cikops_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select master = 'cikops' from ga_sync_config where id = 1), false);
$$;

/** Kunci sinkron saja (dipakai ping & tarik). */
create or replace function ga_check_key_only(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or not exists (select 1 from ga_sync_config where id = 1 and sync_key = p_key) then
    raise exception 'Kunci sinkron GA salah. Cek GA_SYNC_KEY di modSyncGA (CIKOPS: Fasilitas → Cleaning, Gardening & TGA → Sinkron Excel).' using errcode = '42501';
  end if;
end $$;

/** Dipakai semua fungsi KIRIM dari Excel (027): ditolak saat CIKOPS jadi sumber utama. */
create or replace function ga_check_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ga_check_key_only(p_key);
  if ga_is_cikops_master() then
    raise exception 'CIKOPS sekarang sumber data utama Cleaning & Gardening. Data tidak lagi dikirim dari Excel — pasang modSyncGA versi 2 lalu pakai "Tarik dari CIKOPS".' using errcode = '42501';
  end if;
end $$;

create or replace function ga_ping(p_key text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform ga_check_key_only(p_key);
  return case when ga_is_cikops_master() then 'ok:cikops' else 'ok' end;
end $$;

create or replace function ga_staff_name() returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin GA') into v from profiles where id = auth.uid();
  return v;
end $$;

/** Nama hari Indonesia → ISO day (Senin=1 … Minggu=7). null bila tidak dikenal. */
create or replace function ga_day_no(p text) returns int
language sql immutable as $$
  select case lower(replace(replace(trim(coalesce(p, '')), '''', ''), '’', ''))
    when 'senin' then 1 when 'selasa' then 2 when 'rabu' then 3 when 'kamis' then 4
    when 'jumat' then 5 when 'sabtu' then 6 when 'minggu' then 7 else null end
$$;
create or replace function ga_day_name(n int) returns text
language sql immutable as $$
  select (array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'])[n]
$$;
/** Minggu ke- dalam bulan (minggu mulai Senin) — sama dengan rumus Excel. */
create or replace function ga_week_of_month(d date) returns int
language sql immutable as $$
  select ((extract(day from d)::int + extract(isodow from date_trunc('month', d))::int - 2) / 7) + 1
$$;

-- ── 3) Mode sumber data ──
create or replace function ga_set_master(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or coalesce(is_master_admin, false))) then
    raise exception 'Hanya admin yang bisa mengganti sumber data.' using errcode = '42501';
  end if;
  if p_mode not in ('excel', 'cikops') then raise exception 'Mode tidak dikenal.'; end if;
  update ga_sync_config set master = p_mode, master_since = now() where id = 1;
  return jsonb_build_object('master', p_mode);
end $$;

-- ── 4) Master pekerjaan ──
create or replace function ga_next_job_id(p_tim text) returns text
language plpgsql security definer set search_path = public as $$
declare v_pre text; v_n int;
begin
  v_pre := case lower(trim(coalesce(p_tim, ''))) when 'cleaning service' then 'CS' when 'gardener' then 'GD'
             else upper(left(regexp_replace(coalesce(p_tim, 'XX'), '[^A-Za-z]', '', 'g') || 'XX', 2)) end;
  select coalesce(max((regexp_match(id, '^' || v_pre || '-(\d+)$'))[1]::int), 0) + 1 into v_n from ga_jobs where id ~ ('^' || v_pre || '-\d+$');
  return v_pre || '-' || lpad(v_n::text, 3, '0');
end $$;

/** Tambah / ubah pekerjaan. p_data.hari = array nama hari (maks 4). */
create or replace function ga_save_job(p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text := ga_staff_name(); v_id text; v_days text[]; v_hari text; j ga_jobs%rowtype; v_aktif boolean;
begin
  if coalesce(trim(p_data->>'tim'), '') = '' then raise exception 'Tim wajib diisi.'; end if;
  if coalesce(trim(p_data->>'tipe'), '') = '' then raise exception 'Tipe pekerjaan wajib diisi.'; end if;
  v_aktif := coalesce((p_data->>'aktif')::boolean, true);
  select array_agg(ga_day_name(n) order by n) into v_days
    from (select distinct ga_day_no(x) as n from jsonb_array_elements_text(coalesce(p_data->'hari', '[]'::jsonb)) x) d where n is not null;
  if v_aktif and coalesce(array_length(v_days, 1), 0) = 0 then raise exception 'Pilih minimal 1 hari jadwal.'; end if;
  if coalesce(array_length(v_days, 1), 0) > 4 then raise exception 'Maksimal 4 hari per pekerjaan (sama dengan kolom Hari 1–4 di Excel). Pecah jadi 2 pekerjaan bila perlu.'; end if;
  v_hari := coalesce(array_to_string(v_days, ', '), '');

  if coalesce(trim(p_id), '') = '' then
    v_id := coalesce(nullif(upper(trim(p_data->>'id')), ''), ga_next_job_id(p_data->>'tim'));
    if exists (select 1 from ga_jobs where id = v_id) then raise exception 'ID % sudah dipakai.', v_id; end if;
    insert into ga_jobs (id, tim, lokasi, tipe, area, frek, hari, petugas, aktif, catatan, updated_by, updated_at, synced_at)
    values (v_id, trim(p_data->>'tim'), trim(coalesce(p_data->>'lokasi', '')), trim(p_data->>'tipe'), trim(coalesce(p_data->>'area', '')),
            coalesce(nullif(trim(p_data->>'frek'), ''), case when coalesce(array_length(v_days, 1), 0) = 1 then 'W' else coalesce(array_length(v_days, 1), 0) || 'W' end),
            v_hari, trim(coalesce(p_data->>'petugas', '')), v_aktif, trim(coalesce(p_data->>'catatan', '')), v_by, now(), now())
    returning * into j;
  else
    update ga_jobs set tim = trim(p_data->>'tim'), lokasi = trim(coalesce(p_data->>'lokasi', '')), tipe = trim(p_data->>'tipe'),
           area = trim(coalesce(p_data->>'area', '')),
           frek = coalesce(nullif(trim(p_data->>'frek'), ''), case when coalesce(array_length(v_days, 1), 0) = 1 then 'W' else coalesce(array_length(v_days, 1), 0) || 'W' end),
           hari = v_hari, petugas = trim(coalesce(p_data->>'petugas', '')), aktif = v_aktif, catatan = trim(coalesce(p_data->>'catatan', '')),
           updated_by = v_by, updated_at = now()
     where id = p_id returning * into j;
    if not found then raise exception 'Pekerjaan % tidak ditemukan.', p_id; end if;
  end if;
  return to_jsonb(j);
end $$;

/** Hapus pekerjaan + jadwal mendatang yang belum diisi (riwayat yang sudah diisi tetap). */
create or replace function ga_delete_job(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform ga_staff_name();
  delete from ga_plan where job_id = p_id and actual is null and tanggal >= (now() at time zone 'Asia/Jakarta')::date;
  get diagnostics n = row_count;
  delete from ga_jobs where id = p_id;
  return jsonb_build_object('plan_removed', n);
end $$;

-- ── 5) Manpower ──
create or replace function ga_save_manpower(p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text; m ga_manpower%rowtype; v_n int;
begin
  perform ga_staff_name();
  if coalesce(trim(p_data->>'nama'), '') = '' then raise exception 'Nama wajib diisi.'; end if;
  if coalesce(trim(p_id), '') = '' then
    select coalesce(max((regexp_match(id, '^MP-(\d+)$'))[1]::int), 0) + 1 into v_n from ga_manpower where id ~ '^MP-\d+$';
    v_id := 'MP-' || lpad(v_n::text, 3, '0');
    insert into ga_manpower (id, nama, tim, jabatan, area_tugas, status, no_hp, updated_at, synced_at)
    values (v_id, trim(p_data->>'nama'), trim(coalesce(p_data->>'tim', '')), trim(coalesce(p_data->>'jabatan', '')),
            trim(coalesce(p_data->>'area_tugas', '')), coalesce(nullif(trim(p_data->>'status'), ''), 'Aktif'), trim(coalesce(p_data->>'no_hp', '')), now(), now())
    returning * into m;
  else
    update ga_manpower set nama = trim(p_data->>'nama'), tim = trim(coalesce(p_data->>'tim', '')), jabatan = trim(coalesce(p_data->>'jabatan', '')),
           area_tugas = trim(coalesce(p_data->>'area_tugas', '')), status = coalesce(nullif(trim(p_data->>'status'), ''), 'Aktif'),
           no_hp = trim(coalesce(p_data->>'no_hp', '')), updated_at = now()
     where id = p_id returning * into m;
    if not found then raise exception 'Manpower tidak ditemukan.'; end if;
  end if;
  return to_jsonb(m);
end $$;

create or replace function ga_delete_manpower(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ga_staff_name();
  delete from ga_manpower where id = p_id;
end $$;

-- ── 6) Generate jadwal (sama dengan GeneratePlan di Excel) ──
/** p_from: hanya tanggal >= p_from (null = awal bulan).
    p_rebuild: hapus dulu jadwal periode itu (>= p_from) yang actual-nya masih kosong,
               supaya perubahan master ikut terbawa ("Perbarui jadwal"). */
create or replace function ga_generate_plan(p_periode int, p_from date default null, p_rebuild boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_first date; v_last date; v_from date; n_del int := 0; n_add int := 0;
begin
  perform ga_staff_name();
  if p_periode is null or p_periode < 200001 or p_periode % 100 not between 1 and 12 then raise exception 'Periode tidak valid.'; end if;
  v_first := make_date(p_periode / 100, p_periode % 100, 1);
  v_last := (v_first + interval '1 month - 1 day')::date;
  v_from := greatest(v_first, coalesce(p_from, v_first));

  if p_rebuild then
    delete from ga_plan where periode = p_periode and tanggal >= v_from and actual is null;
    get diagnostics n_del = row_count;
  end if;

  insert into ga_plan (key, periode, tanggal, hari, minggu_ke, job_id, tim, lokasi, tipe, area, frek, petugas, plan, actual, spv, waktu_input, sync_id, synced_at)
  select j.id || '|' || to_char(d, 'YYYYMMDD'), p_periode, d, ga_day_name(extract(isodow from d)::int), ga_week_of_month(d),
         j.id, j.tim, j.lokasi, j.tipe, j.area, j.frek, j.petugas, 1, null, '', null, 'cikops', now()
    from ga_jobs j
    cross join generate_series(v_from, v_last, interval '1 day') g(dd)
    cross join lateral (select g.dd::date as d) x
   where j.aktif
     and extract(isodow from d)::int in (select ga_day_no(trim(h)) from unnest(string_to_array(j.hari, ',')) h)
  on conflict (key) do nothing;
  get diagnostics n_add = row_count;
  return jsonb_build_object('periode', p_periode, 'added', n_add, 'removed', n_del,
    'total', (select count(*) from ga_plan where periode = p_periode));
end $$;

-- ── 7) Checklist actual ──
/** p_rows = [{key, actual: 1 | 0 | null}] — null = kosongkan. SPV = nama akun yang login. */
create or replace function ga_set_actual(p_rows jsonb, p_spv text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_spv text; n int;
begin
  v_spv := coalesce(nullif(trim(p_spv), ''), ga_staff_name());
  update ga_plan g set actual = x.actual, spv = case when x.actual is null then '' else v_spv end,
         waktu_input = now(), sync_id = 'cikops', synced_at = now()
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(key text, actual smallint)
   where g.key = x.key and (x.actual is null or x.actual in (0, 1));
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 8) Event / Improvement / Inventory ──
create or replace function ga_save_log(p_table text, p_id bigint, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_by text := ga_staff_name(); v_id bigint;
begin
  if p_table = 'events' then
    if coalesce(trim(p_data->>'nama'), '') = '' then raise exception 'Nama event wajib diisi.'; end if;
    if p_id is null then
      insert into ga_events (tanggal, nama, deskripsi, waktu, support, dokumentasi, updated_by, updated_at)
      values (ga_date(p_data->>'tanggal'), trim(p_data->>'nama'), trim(coalesce(p_data->>'deskripsi', '')), trim(coalesce(p_data->>'waktu', '')),
              trim(coalesce(p_data->>'support', '')), trim(coalesce(p_data->>'dokumentasi', '')), v_by, now()) returning id into v_id;
    else
      update ga_events set tanggal = ga_date(p_data->>'tanggal'), nama = trim(p_data->>'nama'), deskripsi = trim(coalesce(p_data->>'deskripsi', '')),
             waktu = trim(coalesce(p_data->>'waktu', '')), support = trim(coalesce(p_data->>'support', '')), dokumentasi = trim(coalesce(p_data->>'dokumentasi', '')),
             updated_by = v_by, updated_at = now() where id = p_id returning id into v_id;
    end if;
  elsif p_table = 'improvements' then
    if coalesce(trim(p_data->>'deskripsi'), '') = '' then raise exception 'Deskripsi wajib diisi.'; end if;
    if p_id is null then
      insert into ga_improvements (tanggal, kategori, jenis, deskripsi, area, petugas, pengawas, dokumentasi, updated_by, updated_at)
      values (ga_date(p_data->>'tanggal'), trim(coalesce(p_data->>'kategori', '')), trim(coalesce(p_data->>'jenis', '')), trim(p_data->>'deskripsi'),
              trim(coalesce(p_data->>'area', '')), trim(coalesce(p_data->>'petugas', '')), trim(coalesce(p_data->>'pengawas', '')),
              trim(coalesce(p_data->>'dokumentasi', '')), v_by, now()) returning id into v_id;
    else
      update ga_improvements set tanggal = ga_date(p_data->>'tanggal'), kategori = trim(coalesce(p_data->>'kategori', '')), jenis = trim(coalesce(p_data->>'jenis', '')),
             deskripsi = trim(p_data->>'deskripsi'), area = trim(coalesce(p_data->>'area', '')), petugas = trim(coalesce(p_data->>'petugas', '')),
             pengawas = trim(coalesce(p_data->>'pengawas', '')), dokumentasi = trim(coalesce(p_data->>'dokumentasi', '')),
             updated_by = v_by, updated_at = now() where id = p_id returning id into v_id;
    end if;
  elsif p_table = 'inventory' then
    if coalesce(trim(p_data->>'nama'), '') = '' then raise exception 'Nama alat wajib diisi.'; end if;
    if p_id is null then
      insert into ga_inventory (kode, nama, jenis, area, status, foto, jumlah, tgl_update, updated_by, updated_at)
      values (trim(coalesce(p_data->>'kode', '')), trim(p_data->>'nama'), trim(coalesce(p_data->>'jenis', '')), trim(coalesce(p_data->>'area', '')),
              coalesce(nullif(trim(p_data->>'status'), ''), 'Baik'), trim(coalesce(p_data->>'foto', '')), nullif(p_data->>'jumlah', '')::numeric,
              coalesce(ga_date(p_data->>'tgl_update'), (now() at time zone 'Asia/Jakarta')::date), v_by, now()) returning id into v_id;
    else
      update ga_inventory set kode = trim(coalesce(p_data->>'kode', '')), nama = trim(p_data->>'nama'), jenis = trim(coalesce(p_data->>'jenis', '')),
             area = trim(coalesce(p_data->>'area', '')), status = coalesce(nullif(trim(p_data->>'status'), ''), 'Baik'), foto = trim(coalesce(p_data->>'foto', '')),
             jumlah = nullif(p_data->>'jumlah', '')::numeric, tgl_update = coalesce(ga_date(p_data->>'tgl_update'), (now() at time zone 'Asia/Jakarta')::date),
             updated_by = v_by, updated_at = now() where id = p_id returning id into v_id;
    end if;
  else
    raise exception 'Tabel % tidak dikenal.', p_table;
  end if;
  if v_id is null then raise exception 'Data tidak ditemukan.'; end if;
  return v_id;
end $$;

create or replace function ga_delete_log(p_table text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ga_staff_name();
  if p_table = 'events' then delete from ga_events where id = p_id;
  elsif p_table = 'improvements' then delete from ga_improvements where id = p_id;
  elsif p_table = 'inventory' then delete from ga_inventory where id = p_id;
  else raise exception 'Tabel % tidak dikenal.', p_table; end if;
end $$;

-- ── 9) Excel menarik data (modSyncGA v2) ──
-- Keluaran: teks bersekat TAB per sheet, mudah dibaca VBA tanpa parser JSON.
--   ##SHEET<TAB>nama<TAB>jumlah_baris
--   baris header (kolom sama dengan template Excel)
--   baris data …
create or replace function ga_tsv(v text) returns text
language sql immutable as $$
  select replace(replace(replace(coalesce(v, ''), E'\t', ' '), E'\r', ' '), E'\n', ' ')
$$;

create or replace function ga_pull(p_key text, p_from_periode int, p_computer text default '') returns text
language plpgsql security definer set search_path = public as $$
declare out text := ''; part text; n int; v_from int := coalesce(p_from_periode, 200001);
begin
  perform ga_check_key_only(p_key);

  -- Master pekerjaan (DB_PEKERJAAN, A..M)
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(j.id), ga_tsv(j.tim), ga_tsv(j.lokasi), ga_tsv(j.tipe), ga_tsv(j.area), ga_tsv(j.frek),
           ga_tsv(trim(split_part(j.hari, ',', 1))), ga_tsv(trim(split_part(j.hari, ',', 2))), ga_tsv(trim(split_part(j.hari, ',', 3))), ga_tsv(trim(split_part(j.hari, ',', 4))),
           ga_tsv(j.petugas), case when j.aktif then 'YA' else 'TIDAK' end, ga_tsv(j.catatan)), E'\n' order by j.tim, j.id)
    into n, part from ga_jobs j;
  out := out || E'##SHEET\tDB_PEKERJAAN\t' || n || E'\n' || E'ID\tTim\tLokasi\tTipe Pekerjaan\tArea Pekerjaan\tFrek\tHari 1\tHari 2\tHari 3\tHari 4\tPetugas\tAktif\tCatatan\n' || coalesce(part || E'\n', '');

  -- Manpower (DB_MANPOWER, A..G)
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(m.id), ga_tsv(m.nama), ga_tsv(m.tim), ga_tsv(m.jabatan), ga_tsv(m.area_tugas), ga_tsv(m.no_hp), ga_tsv(m.status)), E'\n' order by m.tim, m.nama)
    into n, part from ga_manpower m;
  out := out || E'##SHEET\tDB_MANPOWER\t' || n || E'\n' || E'ID\tNama\tTim\tJabatan\tArea Tugas\tNo HP\tStatus\n' || coalesce(part || E'\n', '');

  -- Plan & actual (DATA_PLAN_ACTUAL, A..P) mulai periode p_from_periode
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(g.key), g.periode::text, to_char(g.tanggal, 'YYYY-MM-DD'), ga_tsv(g.hari), coalesce(g.minggu_ke::text, ''),
           ga_tsv(g.job_id), ga_tsv(g.tim), ga_tsv(g.lokasi), ga_tsv(g.tipe), ga_tsv(g.area), ga_tsv(g.frek), ga_tsv(g.petugas), g.plan::text,
           coalesce(g.actual::text, ''), ga_tsv(g.spv), coalesce(to_char(g.waktu_input at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'), '')), E'\n' order by g.tanggal, g.job_id)
    into n, part from ga_plan g where g.periode >= v_from;
  out := out || E'##SHEET\tDATA_PLAN_ACTUAL\t' || n || E'\t' || v_from || E'\n'
    || E'Key\tPeriode\tTanggal\tHari\tMinggu ke\tID\tTim\tLokasi\tTipe\tArea\tFrek\tPetugas\tPlan\tActual\tSPV\tWaktu Input\n' || coalesce(part || E'\n', '');

  -- Event (EVENT, A..F)
  select count(*), string_agg(concat_ws(E'\t', coalesce(to_char(e.tanggal, 'YYYY-MM-DD'), ''), ga_tsv(e.nama), ga_tsv(e.deskripsi), ga_tsv(e.waktu), ga_tsv(e.support), ga_tsv(e.dokumentasi)), E'\n' order by e.tanggal nulls last, e.id)
    into n, part from ga_events e;
  out := out || E'##SHEET\tEVENT\t' || n || E'\n' || E'Tanggal\tNama Event\tDescription\tWaktu\tSupport GA\tDocumentation\n' || coalesce(part || E'\n', '');

  -- Improvement (IMPROVEMENT, A..H)
  select count(*), string_agg(concat_ws(E'\t', coalesce(to_char(i.tanggal, 'YYYY-MM-DD'), ''), ga_tsv(i.kategori), ga_tsv(i.jenis), ga_tsv(i.deskripsi), ga_tsv(i.area), ga_tsv(i.petugas), ga_tsv(i.pengawas), ga_tsv(i.dokumentasi)), E'\n' order by i.tanggal nulls last, i.id)
    into n, part from ga_improvements i;
  out := out || E'##SHEET\tIMPROVEMENT\t' || n || E'\n' || E'Tanggal\tKategori\tJenis\tDescription\tArea\tPetugas\tPengawas\tDokumentasi\n' || coalesce(part || E'\n', '');

  -- Inventory (INVENTORY, A..H)
  select count(*), string_agg(concat_ws(E'\t', ga_tsv(v.kode), ga_tsv(v.nama), ga_tsv(v.jenis), ga_tsv(v.area), ga_tsv(v.status), ga_tsv(v.foto), coalesce(v.jumlah::text, ''), coalesce(to_char(v.tgl_update, 'YYYY-MM-DD'), '')), E'\n' order by v.kode, v.id)
    into n, part from ga_inventory v;
  out := out || E'##SHEET\tINVENTORY\t' || n || E'\n' || E'Kode\tNama\tJenis\tArea\tStatus\tFoto\tJumlah\tTgl Update\n' || coalesce(part || E'\n', '');

  -- TGA (TGA, A..D): log Excel lama + kegiatan dari aplikasi TGA (034)
  select count(*), string_agg(r, E'\n' order by t, r) into n, part from (
    select x.tanggal as t, concat_ws(E'\t', coalesce(to_char(x.tanggal, 'YYYY-MM-DD'), ''), ga_tsv(x.nama_tga), ga_tsv(x.activity), ga_tsv(x.request_by)) as r
      from ga_tga x where x.tanggal is null or x.tanggal >= make_date(v_from / 100, v_from % 100, 1)
    union all
    select a.tanggal, concat_ws(E'\t', to_char(a.tanggal, 'YYYY-MM-DD'), ga_tsv(a.nama_tga), ga_tsv(a.activity || case when a.lokasi <> '' then ' @ ' || a.lokasi else '' end), ga_tsv(a.request_by))
      from tga_activities a where a.status not in ('baru', 'batal') and a.tanggal >= make_date(v_from / 100, v_from % 100, 1)
  ) z;
  out := out || E'##SHEET\tTGA\t' || n || E'\n' || E'Tanggal\tNama TGA\tActivity\tRequest By\n' || coalesce(part || E'\n', '');

  update ga_sync_config set last_pull_at = now(), last_pull_computer = left(coalesce(p_computer, ''), 80) where id = 1;
  return E'##CIKOPS\tGA\t' || to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') || E'\t' || (select master from ga_sync_config where id = 1) || E'\n' || out || E'##END\n';
end $$;

-- Status untuk dashboard (tambah mode & tarik terakhir)
create or replace function ga_sync_status()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_admin boolean; c ga_sync_config%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select (role = 'admin' or coalesce(is_master_admin, false)) into v_admin from profiles where id = auth.uid();
  select * into c from ga_sync_config where id = 1;
  return jsonb_build_object(
    'last_sync_at', c.last_sync_at, 'last_computer', c.last_computer,
    'last_plan_at', c.last_plan_at, 'last_master_at', c.last_master_at, 'last_logs_at', c.last_logs_at,
    'jobs', (select count(*) from ga_jobs), 'plan', (select count(*) from ga_plan),
    'is_admin', coalesce(v_admin, false),
    'sync_key', case when coalesce(v_admin, false) then c.sync_key else null end,
    'master', c.master, 'master_since', c.master_since, 'last_pull_at', c.last_pull_at, 'last_pull_computer', c.last_pull_computer
  );
end $$;

-- ── 10) Hak akses ──
do $$
declare f text;
begin
  foreach f in array array['ga_check_key_only(text)', 'ga_staff_name()', 'ga_next_job_id(text)', 'ga_is_cikops_master()'] loop
    execute format('revoke all on function %s from public, anon', f);
  end loop;
  foreach f in array array['ga_ping(text)', 'ga_pull(text,int,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['ga_set_master(text)', 'ga_save_job(text,jsonb)', 'ga_delete_job(text)', 'ga_save_manpower(text,jsonb)',
      'ga_delete_manpower(text)', 'ga_generate_plan(int,date,boolean)', 'ga_set_actual(jsonb,text)', 'ga_save_log(text,bigint,jsonb)',
      'ga_delete_log(text,bigint)', 'ga_sync_status()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── Cek hasil ──
select 'mode sumber data' as cek, master as hasil from ga_sync_config where id = 1
union all select 'master pekerjaan', count(*)::text from ga_jobs
union all select 'jadwal (plan)', count(*)::text from ga_plan;
