-- ═══════════════════════════════════════════════════════════════
-- 05_DATA_DEMO — akun & data FIKTIF untuk deployment DEMO CIKOPS
--
-- ⚠ HANYA untuk project Supabase DEMO (bukan database produksi!).
--   Skrip berhenti sendiri bila menemukan akun login yang bukan @demo.cikops.id.
--
-- Isi: perusahaan fiktif "PT Nusantara Prima Industri" (plant CIK = Cikupa,
-- PRB = Parung), akun demo per role, driver, armada, tugas, gate, klaim,
-- dana operasional, kantin, ATK, locker, printer, permintaan karyawan,
-- pembagian, kalender, resepsionis, Cleaning & Gardening, TGA.
-- Semua tanggal RELATIF terhadap hari ini → jalankan ulang kapan saja
-- (mis. tiap pagi lewat workflow "Demo database") supaya demo selalu "hidup".
--
-- Password semua akun: Demo2026!   ·   PIN teknisi TGA: 1234
-- Kode form penugasan TGA: DEMO2026
-- Aman dijalankan ulang: data demo lama dihapus lalu dibuat ulang.
-- ═══════════════════════════════════════════════════════════════

-- ── 0) Pengaman: tolak database yang berisi akun asli ──
do $$
declare v_real int;
begin
  select count(*) into v_real from auth.users where coalesce(email, '') not ilike '%@demo.cikops.id';
  if v_real > 0 then
    raise exception 'DIBATALKAN — database ini punya % akun login asli (bukan @demo.cikops.id). 05_data_demo.sql hanya untuk project Supabase DEMO.', v_real;
  end if;
end $$;

-- Matikan trigger selama pengisian (mis. notifikasi / email otomatis). Abaikan bila tidak diizinkan.
do $$ begin
  set session_replication_role = replica;
exception when others then raise notice 'session_replication_role tidak bisa diubah (%), trigger tetap aktif.', sqlerrm;
end $$;

-- ── 1) Helper: sisipkan baris jsonb hanya ke kolom yang memang ada di tabel ──
-- (skema produksi bisa punya kolom tambahan / kurang; kolom lain memakai default)
create or replace function demo_put(p_table text, p_row jsonb) returns void
language plpgsql as $$
declare v_cols text;
begin
  p_row := jsonb_strip_nulls(p_row);   -- nilai null → pakai default kolom
  select string_agg(quote_ident(k), ', ') into v_cols
    from jsonb_object_keys(p_row) k
   where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p_table and c.column_name = k);
  if v_cols is null then return; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', p_table, v_cols, v_cols, p_table)
    using p_row;
end $$;

/** Akun login demo (auth.users + auth.identities). Mengembalikan id. */
create or replace function demo_user(p_email text, p_name text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
          extensions.crypt('Demo2026!', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_name),
          now() - interval '60 days', now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
          'email', now(), now(), now());
  return v_id;
end $$;

/** Waktu WIB → timestamptz */
create or replace function demo_ts(p_day date, p_time time) returns timestamptz
language sql immutable as $$ select (p_day + p_time) at time zone 'Asia/Jakarta' $$;

-- ── 2) Kosongkan data demo lama ──
do $$
declare t text;
begin
  foreach t in array array[
    'tga_sessions', 'tga_activities', 'tga_users', 'tga_counters', 'ga_plan_resets', 'ga_plan', 'ga_jobs', 'ga_manpower', 'ga_events',
    'ga_improvements', 'ga_inventory', 'ga_tga', 'rcp_wifi_grants', 'rcp_wifi_accounts', 'rcp_parcels', 'rcp_room_bookings', 'rcp_contacts',
    'rcp_counters', 'agenda_events', 'announcements', 'gift_registrations', 'gift_events', 'gift_verify_attempts', 'employee_requests',
    'printer_requests', 'printers', 'lockers', 'atk_requests', 'atk_restocks', 'atk_items', 'canteen_reports', 'condolence_wreaths',
    'driver_claim_requests', 'claims', 'overtime', 'kantong', 'vehicle_gate_logs', 'vehicle_doc_notifications', 'tasks', 'push_subscriptions',
    'gas_stations', 'security_monthly', 'activity_log', 'vehicles', 'drivers', 'driver_tiers', 'job_types', 'employees', 'profiles']
  loop
    if to_regclass('public.' || t) is not null then execute format('truncate table public.%I restart identity cascade', t); end if;
  end loop;
  if to_regclass('public.app_settings') is not null then
    delete from app_settings where key in ('driver_user_ids', 'manager_email', 'manager_contacts');
  end if;
  delete from auth.identities where user_id in (select id from auth.users where email ilike '%@demo.cikops.id');
  delete from auth.users where email ilike '%@demo.cikops.id';
end $$;

-- ── 3) Isi data — satu blok per modul; modul yang gagal (skema berbeda) dilewati dengan peringatan ──
do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Master: karyawan ── */
  for i in 1..64 loop
    v_id := gen_random_uuid();
    e := jsonb_build_object('id', v_id, 'nama', first_names[1 + (i - 1) % array_length(first_names, 1)] || ' ' || last_names[1 + (i * 7) % array_length(last_names, 1)],
      'departement', depts[1 + (i - 1) % array_length(depts, 1)], 'nik', 'NPI-' || (10200 + i * 13)::text,
      'jabatan', jabatan[1 + (i * 3) % array_length(jabatan, 1)], 'aktif', true);
    e := e || jsonb_build_object('email', lower(replace(e->>'nama', ' ', '.')) || '@nusantara-prima.demo', 'no_hp', '0812' || lpad((3400000 + i * 7919)::text, 8, '0'));
    perform demo_put('employees', e);
    v_emp := v_emp || jsonb_build_array(e);
  end loop;

  foreach v_status in array jenis || array['Lainnya'] loop
    perform demo_put('job_types', jsonb_build_object('id', gen_random_uuid(), 'label', v_status));
  end loop;

  perform demo_put('driver_tiers', jsonb_build_object('id', v_tier_gold, 'name', 'Gold', 'color', '#d4a017', 'amount_per_month', 2500000));
  perform demo_put('driver_tiers', jsonb_build_object('id', v_tier_silver, 'name', 'Silver', 'color', '#94a3b8', 'amount_per_month', 1800000));
  perform demo_put('driver_tiers', jsonb_build_object('id', v_tier_bronze, 'name', 'Bronze', 'color', '#b45309', 'amount_per_month', 1200000));
exception when others then
  raise warning 'DEMO · modul "Master: karyawan" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Driver (akun login untuk aplikasi driver) ── */
  for i in 1..17 loop
    v_id := gen_random_uuid();
    dv := jsonb_build_object('id', v_id,
      'nama', (array['Andi Kurniawan', 'Bambang Sutejo', 'Cecep Hidayat', 'Dodi Firmansyah', 'Edi Prasetyo', 'Feri Gunawan', 'Gugun Saputra', 'Hari Wibowo',
                     'Iwan Setiadi', 'Jajang Nurdin', 'Komar Sulaeman', 'Lutfi Hakim', 'Mulyadi', 'Nana Suryana', 'Opik Taufik', 'Pardi Santoso', 'Rahmat Hidayat'])[i],
      'plant', case when i <= 12 then 'CIK' else 'PRB' end,
      'driver_type', case when i in (10, 11, 12) then 'user' when i = 9 then 'support' else 'operational' end,
      'tier_id', case when i % 3 = 0 then v_tier_gold when i % 3 = 1 then v_tier_silver else v_tier_bronze end,
      'aktif', true, 'no_hp', '0813' || lpad((5500000 + i * 4211)::text, 8, '0'), 'avatar_emoji', null);
    dv := dv || jsonb_build_object('email', case when i = 1 then 'driver.andi@demo.cikops.id' else 'driver' || i || '@demo.cikops.id' end);
    if dv->>'driver_type' = 'user' then
      dv := dv || jsonb_build_object('assigned_user', (array['Bpk. Hartono (Plant Director)', 'Ibu Melati (HR Director)', 'Bpk. Surya (Finance Director)'])[i - 9],
                                     'assigned_user_title', (array['Plant Director', 'HR Director', 'Finance Director'])[i - 9]);
    end if;
    perform demo_put('drivers', dv);
    perform demo_user(dv->>'email', dv->>'nama');
    v_drv := v_drv || jsonb_build_array(dv);
  end loop;
  perform demo_put('app_settings', jsonb_build_object('key', 'driver_user_ids', 'value',
    (select jsonb_agg(jsonb_build_object('id', x->>'id', 'nama', x->>'nama', 'plant', x->>'plant')) from jsonb_array_elements(v_drv) x where x->>'driver_type' = 'user')::text));
  perform demo_put('app_settings', jsonb_build_object('key', 'manager_email', 'value', 'manager.ga@nusantara-prima.demo'));
  perform demo_put('app_settings', jsonb_build_object('key', 'manager_contacts', 'value', '[{"email":"manager.ga@nusantara-prima.demo","nama":"Rina Kusuma"}]'));
exception when others then
  raise warning 'DEMO · modul "Driver (akun login untuk aplikasi driver)" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Armada ── */
  for i in 1..15 loop
    v_id := gen_random_uuid();
    vh := jsonb_build_object('id', v_id,
      'nopol', (array['B 1203 NPI', 'B 1457 NPI', 'B 1688 NPI', 'B 1724 NPI', 'B 1901 NPI', 'B 2045 NPI', 'B 2178 NPI', 'B 2233 NPI', 'B 2390 NPI', 'B 2412 NPI',
                      'B 2561 NPI', 'F 1102 NP', 'F 1287 NP', 'F 1350 NP', 'F 1499 NP'])[i],
      'jenis', (array['Toyota Innova Zenix', 'Toyota Avanza', 'Daihatsu Gran Max Box', 'Toyota Innova Reborn', 'Mitsubishi Xpander', 'Toyota Fortuner', 'Suzuki APV',
                      'Toyota Hiace', 'Mitsubishi L300 Pick Up', 'Honda HR-V', 'Toyota Alphard', 'Toyota Avanza', 'Daihatsu Gran Max Box', 'Toyota Innova Reborn', 'Isuzu Elf'])[i],
      'plant', case when i <= 11 then 'CIK' else 'PRB' end, 'aktif', true, 'year', 2018 + (i % 7),
      'color', (array['Putih', 'Hitam', 'Silver', 'Abu-abu'])[1 + i % 4], 'fuel', case when i in (3, 6, 9, 13, 15) then 'Solar' else 'Bensin' end,
      'odometer', 18000 + i * 7350, 'dept', (array['GA', 'GA', 'Supply Chain', 'Direksi', 'Marketing', 'Direksi', 'GA', 'HR & GA', 'Warehouse', 'Marketing', 'Direksi', 'GA', 'Supply Chain', 'GA', 'Warehouse'])[i],
      -- dokumen: sebagian jatuh tempo dekat supaya pengingat & Command Center terlihat
      'stnk_date', v_today + case when i = 2 then 6 when i = 7 then 20 when i = 12 then -3 else 60 + i * 23 end,
      'kir_date', v_today + case when i = 3 then 12 when i = 9 then 4 else 90 + i * 17 end,
      'service_date', v_today + case when i = 5 then 2 when i = 14 then 9 else 25 + i * 11 end);
    if i <= 9 then vh := vh || jsonb_build_object('default_driver_id', (v_drv -> (i - 1)) ->> 'id'); end if;
    perform demo_put('vehicles', vh);
    v_veh := v_veh || jsonb_build_array(vh);
  end loop;
exception when others then
  raise warning 'DEMO · modul "Armada" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Tugas driver 45 hari terakhir + hari ini + 5 hari ke depan ── */
  for d in select generate_series(v_today - 45, v_today + 5, interval '1 day')::date loop
    for dv in select x from jsonb_array_elements(v_drv) x where x->>'driver_type' <> 'user' loop
      n := case when extract(isodow from d) >= 6 then (random() < 0.25)::int else 1 + (random() * 2.2)::int end;
      if d > v_today then n := (random() < 0.3)::int; end if;
      for k in 1..n loop
        vh := (select x from jsonb_array_elements(v_veh) x where x->>'plant' = dv->>'plant' order by random() limit 1);
        v_t := time '07:30' + (k - 1) * interval '3 hours' + (random() * 50)::int * interval '1 minute';
        j := 1 + (random() * (array_length(tujuan, 1) - 1))::int;
        e := v_emp -> ((random() * 63)::int);
        if d < v_today or (d = v_today and v_t + interval '3 hours' < v_now_t) then v_status := case when random() < 0.04 then 'CANCELLED' else 'DONE' end;
        elsif d = v_today and v_t < v_now_t then v_status := 'ON GOING';
        else v_status := 'ASSIGNED'; end if;
        v_start := demo_ts(d, v_t);
        perform demo_put('tasks', jsonb_build_object('id', gen_random_uuid(), 'tanggal', d, 'driver_id', dv->>'id', 'vehicle_id', vh->>'id', 'plant', dv->>'plant',
          'jenis_pekerjaan', jenis[1 + (j - 1) % array_length(jenis, 1)], 'tujuan', tujuan[j], 'perihal', perihal[j],
          'requestor', e->>'nama', 'departement', e->>'departement', 'status', v_status,
          'lokasi_asal', case when dv->>'plant' = 'PRB' then 'Plant Parung' else 'Plant Cikupa' end,
          'created_at', v_start - interval '50 minutes',
          'accepted_at', case when v_status in ('ON GOING', 'DONE') then v_start end,
          'completed_at', case when v_status = 'DONE' then v_start + (90 + (random() * 120)::int) * interval '1 minute' end,
          'cancelled_at', case when v_status = 'CANCELLED' then v_start - interval '20 minutes' end,
          'cancelled_by', case when v_status = 'CANCELLED' then 'admin' end,
          'cancel_reason', case when v_status = 'CANCELLED' then 'Jadwal requestor berubah' end));
        /* log gate: kendaraan CIK keluar–kembali, kendaraan PRB masuk–keluar CIK */
        if v_status in ('ON GOING', 'DONE') and random() < 0.8 then
          v_end := v_start + (100 + (random() * 110)::int) * interval '1 minute';
          perform demo_put('vehicle_gate_logs', jsonb_build_object('id', gen_random_uuid(), 'vehicle_id', vh->>'id', 'driver_id', dv->>'id', 'plant', dv->>'plant',
            'tujuan', tujuan[j], 'keterangan', perihal[j],
            'time_out', case when dv->>'plant' = 'CIK' then v_start + interval '8 minutes' when v_status = 'DONE' then v_end end,
            'time_in', case when dv->>'plant' = 'PRB' then v_start + interval '45 minutes' when v_status = 'DONE' then v_end end,
            'status', case when v_status = 'DONE' then 'DONE' when dv->>'plant' = 'CIK' then 'OUT' else 'IN' end,
            'created_at', v_start));
        end if;
      end loop;
    end loop;
  end loop;
exception when others then
  raise warning 'DEMO · modul "Tugas driver 45 hari terakhir + hari ini + 5 hari ke depan" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Klaim driver (mingguan, 10 minggu) + Self-Claim menunggu verifikasi ── */
  for dv in select x from jsonb_array_elements(v_drv) x where x->>'driver_type' <> 'support' loop
    for k in 0..9 loop
      d := v_today - (k * 7 + 3);
      e := jsonb_build_array(
        jsonb_build_object('type', 'Gasoline', 'expr', (200000 + (random() * 6)::int * 50000)::text, 'total', 0),
        jsonb_build_object('type', 'Toll', 'expr', (array['15500+15500', '22000+22000', '9500+9500+12000', '31000+31000'])[1 + (random() * 3)::int], 'total', 0),
        jsonb_build_object('type', 'Parking', 'expr', (array['5000+5000', '10000', '6000+4000+5000'])[1 + (random() * 2)::int], 'total', 0));
      -- total per item = hasil penjumlahan ekspresi
      e := (select jsonb_agg(x || jsonb_build_object('total', (select sum(p::numeric) from unnest(string_to_array(x->>'expr', '+')) p))) from jsonb_array_elements(e) x);
      perform demo_put('claims', jsonb_build_object('id', gen_random_uuid(), 'driver_id', dv->>'id', 'plant', dv->>'plant', 'submission_date', d + 1, 'period_date', d,
        'items', e, 'total', (select sum((x->>'total')::numeric) from jsonb_array_elements(e) x), 'status', 'submitted', 'note', '', 'submitted_at', demo_ts(d + 1, time '09:15')));
    end loop;
  end loop;
  i := 0;
  for dv in select x from jsonb_array_elements(v_drv) x where x->>'driver_type' = 'operational' limit 5 loop
    i := i + 1;
    e := jsonb_build_array(jsonb_build_object('type', 'Gasoline', 'expr', '250000', 'total', 250000), jsonb_build_object('type', 'Toll', 'expr', '19500+19500', 'total', 39000));
    perform demo_put('driver_claim_requests', jsonb_build_object('id', gen_random_uuid(), 'driver_id', dv->>'id', 'period_date', v_today - i, 'items', e, 'total', 289000,
      'note', 'Perjalanan ke ' || tujuan[i], 'nota', case when i % 2 = 0 then 'menyusul' else 'ada' end,
      'status', (array['menunggu', 'menunggu', 'menunggu', 'disetujui', 'ditolak'])[i],
      'admin_note', case when i = 5 then 'Nota tol tidak terbaca, mohon upload ulang' else '' end,
      'reviewed_by', case when i >= 4 then 'Rina Kusuma' end, 'reviewed_at', case when i >= 4 then now() - interval '1 day' end,
      'created_at', now() - i * interval '7 hours'));
  end loop;
exception when others then
  raise warning 'DEMO · modul "Klaim driver (mingguan, 10 minggu) + Self-Claim menunggu verifikasi" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Dana operasional (4 periode per plant) & lembur ── */
  for k in 0..3 loop
    foreach v_status in array array['CIK', 'PRB'] loop
      perform demo_put('kantong', jsonb_build_object('id', gen_random_uuid(), 'plant', v_status, 'period', to_char(v_m0 - k * interval '1 month', 'YYYY-MM'),
        'total_budget', case when v_status = 'CIK' then 45000000 else 20000000 end,
        'alloc_op_driver', case when v_status = 'CIK' then 30000000 else 13000000 end,
        'alloc_emergency', case when v_status = 'CIK' then 5000000 else 2500000 end,
        'cash_available', case when v_status = 'CIK' then 12500000 - k * 900000 else 6400000 - k * 400000 end,
        'claim_submitted', case when v_status = 'CIK' then 18400000 + k * 650000 else 7300000 + k * 300000 end,
        'claim_paid', case when v_status = 'CIK' then 14200000 + k * 500000 else 5600000 + k * 250000 end,
        'unsubmitted_claim', case when k = 0 then (case when v_status = 'CIK' then 1850000 else 640000 end) else 0 end,
        'last_reset', v_m0 - k * interval '1 month'));
    end loop;
  end loop;
  for dv in select x from jsonb_array_elements(v_drv) x loop
    for k in 0..2 loop
      n := 6 + (random() * 22)::int;
      perform demo_put('overtime', jsonb_build_object('id', gen_random_uuid(), 'driver_id', dv->>'id', 'plant', dv->>'plant',
        'period', to_char(v_m0 - k * interval '1 month', 'YYYY-MM'), 'hours', n, 'amount', n * 28500,
        'reason', (array['Antar jemput direksi', 'Tamu luar kota', 'Lembur akhir bulan', 'Event perusahaan'])[1 + (random() * 3)::int]));
    end loop;
  end loop;
  perform demo_put('condolence_wreaths', jsonb_build_object('id', gen_random_uuid(), 'plant', 'CIK', 'tanggal', v_today - 9, 'atas_nama', 'Keluarga Bpk. Suryanto (Produksi)', 'keterangan', 'Karangan bunga duka cita', 'claimed', true));
  perform demo_put('condolence_wreaths', jsonb_build_object('id', gen_random_uuid(), 'plant', 'CIK', 'tanggal', v_today - 2, 'atas_nama', 'Keluarga Ibu Ratna (Finance)', 'keterangan', 'Karangan bunga duka cita', 'claimed', false));
exception when others then
  raise warning 'DEMO · modul "Dana operasional (4 periode per plant) & lembur" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Pom bensin sekitar plant ── */
  perform demo_put('gas_stations', jsonb_build_object('id', gen_random_uuid(), 'name', 'SPBU 34.157.01 Cikupa', 'address', 'Jl. Raya Serang KM 18, Cikupa', 'lat', -6.2295, 'lng', 106.5102,
    'fuels', '[{"type":"Pertalite","available":true},{"type":"Pertamax","available":true},{"type":"Dexlite","available":true}]', 'notes', 'Buka 24 jam, bisa kartu fleet'));
  perform demo_put('gas_stations', jsonb_build_object('id', gen_random_uuid(), 'name', 'SPBU 34.157.08 Bitung', 'address', 'Jl. Raya Serang, Bitung Jaya', 'lat', -6.2181, 'lng', 106.5530,
    'fuels', '[{"type":"Pertalite","available":true},{"type":"Pertamax","available":true},{"type":"Solar","available":true}]', 'notes', ''));
  perform demo_put('gas_stations', jsonb_build_object('id', gen_random_uuid(), 'name', 'Shell Citra Raya', 'address', 'Boulevard Citra Raya, Cikupa', 'lat', -6.2512, 'lng', 106.5243,
    'fuels', '[{"type":"Super","available":true},{"type":"V-Power","available":true},{"type":"V-Power Diesel","available":false}]', 'notes', 'Toilet bersih, ada minimarket'));
  perform demo_put('gas_stations', jsonb_build_object('id', gen_random_uuid(), 'name', 'SPBU 34.163.02 Balaraja', 'address', 'Jl. Raya Serang KM 24, Balaraja', 'lat', -6.2013, 'lng', 106.4597,
    'fuels', '[{"type":"Pertalite","available":true},{"type":"Solar","available":true}]', 'notes', 'Antrean solar panjang pagi hari'));
  perform demo_put('gas_stations', jsonb_build_object('id', gen_random_uuid(), 'name', 'SPBU 34.163.11 Parung', 'address', 'Jl. Raya Parung, Bogor', 'lat', -6.4221, 'lng', 106.7339,
    'fuels', '[{"type":"Pertalite","available":true},{"type":"Pertamax","available":true},{"type":"Dexlite","available":true}]', 'notes', 'Terdekat dari Plant Parung'));
  perform demo_put('gas_stations', jsonb_build_object('id', gen_random_uuid(), 'name', 'BP Karawaci', 'address', 'Jl. Imam Bonjol, Karawaci', 'lat', -6.2167, 'lng', 106.6017,
    'fuels', '[{"type":"BP 92","available":true},{"type":"BP Ultimate","available":true},{"type":"BP Diesel","available":true}]', 'notes', ''));
exception when others then
  raise warning 'DEMO · modul "Pom bensin sekitar plant" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Kantin: setiap hari 60 hari terakhir (3 shift snack & makan) ── */
  for d in select generate_series(v_today - 60, v_today - 1, interval '1 day')::date loop
    r := case when extract(isodow from d) >= 6 then 0.45 else 1 end;
    perform demo_put('canteen_reports', jsonb_build_object('id', gen_random_uuid(), 'report_date', d, 'submitted_by', 'Petugas Kantin',
      'snack_order_1', round(320 * r), 'snack_order_2', round(260 * r), 'snack_order_3', round(140 * r),
      'snack_leftover_1', round((6 + random() * 22) * r), 'snack_leftover_2', round((5 + random() * 20) * r), 'snack_leftover_3', round((2 + random() * 14) * r),
      'meal_order_1', round(410 * r), 'meal_order_2', round(330 * r), 'meal_order_3', round(180 * r),
      'meal_leftover_1', round((8 + random() * 30) * r), 'meal_leftover_2', round((6 + random() * 26) * r), 'meal_leftover_3', round((3 + random() * 18) * r)));
  end loop;
exception when others then
  raise warning 'DEMO · modul "Kantin: setiap hari 60 hari terakhir (3 shift snack & makan)" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── ATK: master barang, permintaan 60 hari, restock ── */
  for i in 1..array_length(atk_names, 1) loop
    perform demo_put('atk_items', jsonb_build_object('kode_barang', 'ATK' || lpad(i::text, 3, '0'), 'nama_barang', atk_names[i], 'satuan', atk_unit[i],
      'stok', case when i in (3, 12, 19) then 2 when i in (7, 15) then 0 else 25 + (i * 17) % 140 end, 'min_stok', case when i <= 2 then 20 else 10 end,
      'source', 'web', 'excel_pulled_at', now(), 'created_by', 'Admin GA', 'updated_at', now()));
  end loop;
  n := 0;
  for d in select generate_series(v_today - 60, v_today, interval '1 day')::date loop
    continue when extract(isodow from d) >= 6;
    for k in 1..(1 + (random() * 4)::int) loop
      n := n + 1; e := v_emp -> ((random() * 63)::int); i := 1 + (random() * (array_length(atk_names, 1) - 1))::int;
      for j in 0..(random() * 2)::int loop
        perform demo_put('atk_requests', jsonb_build_object('request_id', 'REQ-' || to_char(d, 'YYYYMMDD') || lpad(n::text, 4, '0'), 'tanggal', d,
          'nama', e->>'nama', 'nik', e->>'nik', 'departemen', e->>'departement',
          'kode_barang', 'ATK' || lpad((1 + (i + j * 5 - 1) % array_length(atk_names, 1))::text, 3, '0'),
          'nama_barang', atk_names[1 + (i + j * 5 - 1) % array_length(atk_names, 1)], 'jumlah', 1 + (random() * 4)::int,
          'satuan', atk_unit[1 + (i + j * 5 - 1) % array_length(atk_names, 1)], 'helper', 'Staff GA', 'source', 'web', 'excel_pulled_at', now(),
          'created_by', 'Admin GA', 'created_at', demo_ts(d, time '10:00' + k * interval '47 minutes')));
      end loop;
    end loop;
  end loop;
  for k in 0..3 loop
    for i in 1..8 loop
      j := 1 + ((i * 3 + k) % array_length(atk_names, 1));
      perform demo_put('atk_restocks', jsonb_build_object('update_id', 'UPD-' || to_char(v_today - k * 14, 'YYYYMMDD') || lpad(i::text, 4, '0'), 'tanggal', v_today - k * 14,
        'nama', 'Admin GA', 'nik', '', 'departemen', 'Pembelian rutin', 'kode_barang', 'ATK' || lpad(j::text, 3, '0'), 'nama_barang', atk_names[j],
        'jumlah', 20 + (i * 7) % 40, 'satuan', atk_unit[j], 'source', 'web', 'excel_pulled_at', now(), 'created_by', 'Admin GA'));
    end loop;
  end loop;
exception when others then
  raise warning 'DEMO · modul "ATK: master barang, permintaan 60 hari, restock" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Locker (72 unit, ±70 persen terisi) ── */
  for i in 1..72 loop
    e := v_emp -> ((i * 5) % 64);
    if i % 10 in (0, 3, 7) then
      perform demo_put('lockers', jsonb_build_object('row_no', i, 'number', i::text, 'pin', lpad(((i * 7919) % 9000 + 1000)::text, 4, '0'), 'status', 'Available'));
    else
      perform demo_put('lockers', jsonb_build_object('row_no', i, 'number', i::text, 'pin', lpad(((i * 7919) % 9000 + 1000)::text, 4, '0'), 'status', 'Terisi',
        'nama', case when i % 9 = 4 then 'Intern ' || first_names[1 + i % 40] else e->>'nama' end, 'no_hp', e->>'no_hp', 'email', e->>'email',
        'periode', case when i % 9 = 4 then 'Jul-Des ' || extract(year from v_today) else 'Employee' end,
        'extra', case when i % 9 = 4 then 'Universitas Pelita Nusa' else e->>'departement' end,
        'end_date', case when i % 9 = 4 then v_today + 45 end, 'last_confirmed', v_today - (i % 40)));
    end if;
  end loop;
exception when others then
  raise warning 'DEMO · modul "Locker (72 unit, ±70 persen terisi)" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Printer & permintaan printer ── */
  for i in 1..8 loop
    v_id := gen_random_uuid();
    perform demo_put('printers', jsonb_build_object('id', v_id, 'no_eq', 'PRN-' || lpad(i::text, 3, '0'),
      'location', (array['Lobby - Resepsionis', 'Lantai 2 - Finance', 'Lantai 2 - HR & GA', 'Lantai 3 - Marketing', 'Produksi - Office', 'QA Laboratorium', 'Gudang - Admin', 'Ruang Direksi'])[i],
      'type', case when i in (2, 4, 8) then 'COLOR' else 'BW' end, 'brand', (array['Canon', 'Ricoh', 'Fuji Xerox', 'Epson'])[1 + i % 4],
      'control_panel_url', 'http://10.10.20.' || (40 + i), 'aktif', true));
    for k in 1..4 loop
      e := v_emp -> ((i * 11 + k * 3) % 64);
      perform demo_put('printer_requests', jsonb_build_object('id', gen_random_uuid(), 'printer_id', v_id, 'source', case when k % 2 = 0 then 'EMPLOYEE' else 'ADMIN' end,
        'request_type', (array['RESET_KUOTA', 'TAMBAH_KUOTA', 'AMBIL_TONER', 'TAMBAH_KUOTA'])[k], 'employee_name', e->>'nama', 'department', e->>'departement',
        'print_user_id', 'U' || lpad(((i * 31 + k) % 900)::text, 4, '0'), 'quota_amount', case when k in (2, 4) then 200 + k * 50 end,
        'notes', case when k = 3 then 'Toner hitam habis' else '' end, 'created_at', now() - ((i * 4 + k) * 19) * interval '1 hour'));
    end loop;
  end loop;
exception when others then
  raise warning 'DEMO · modul "Printer & permintaan printer" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Permintaan karyawan (form publik /request) ── */
  for i in 1..24 loop
    e := v_emp -> ((i * 13) % 64);
    v_status := (array['PENDING', 'PENDING', 'IN_PROGRESS', 'DONE', 'DONE', 'DONE', 'REJECTED'])[1 + i % 7];
    perform demo_put('employee_requests', jsonb_build_object('id', gen_random_uuid(), 'request_type', (array['DRIVER', 'DRIVER', 'TONER', 'OTHER'])[1 + i % 4],
      'employee_name', e->>'nama', 'department', e->>'departement', 'phone', e->>'no_hp',
      'description', (array['Butuh mobil + driver ke kantor pusat', 'Jemput tamu di bandara', 'Toner printer lantai 2 habis', 'Minta kursi kerja pengganti'])[1 + i % 4],
      'details', case when i % 4 in (0, 1) then jsonb_build_object('eventDate', v_today + (i % 6), 'destination', tujuan[1 + i % 16], 'departureTime', '09:00', 'purpose', perihal[1 + i % 16], 'additionalNotes', '') else '{}'::jsonb end,
      'status', v_status, 'admin_notes', case when v_status = 'REJECTED' then 'Tidak ada armada tersedia di jam tsb, mohon ajukan ulang' when v_status = 'DONE' then 'Sudah ditangani' end,
      'created_at', now() - (i * 9) * interval '1 hour', 'processed_at', case when v_status in ('DONE', 'REJECTED') then now() - (i * 9 - 4) * interval '1 hour' end));
  end loop;
exception when others then
  raise warning 'DEMO · modul "Permintaan karyawan (form publik /request)" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Pembagian (gift) ── */
  v_id := gen_random_uuid();
  perform demo_put('gift_events', jsonb_build_object('id', v_id, 'name', 'Bingkisan HUT Perusahaan ke-25', 'description', 'Kaos + tumbler untuk seluruh karyawan',
    'items', '[{"name":"Kaos HUT","variants":["S","M","L","XL","XXL"]},{"name":"Tumbler","variants":[]}]', 'status', 'open', 'plant', 'CIK', 'mode', 'self_register'));
  for i in 1..40 loop
    e := v_emp -> (i - 1);
    perform demo_put('gift_registrations', jsonb_build_object('id', gen_random_uuid(), 'event_id', v_id, 'nik', e->>'nik', 'nama', e->>'nama', 'departemen', e->>'departement',
      'email', e->>'email', 'selections', jsonb_build_array(jsonb_build_object('item', 'Kaos HUT', 'variant', (array['S', 'M', 'L', 'XL', 'XXL'])[1 + i % 5]), jsonb_build_object('item', 'Tumbler', 'variant', '')),
      'passcode_hash', extensions.crypt(lpad((i * 37)::text, 6, '0'), extensions.gen_salt('bf', 4)), 'claimed', i % 3 <> 0,
      'claimed_at', case when i % 3 <> 0 then now() - i * interval '2 hours' end, 'claimed_by', case when i % 3 <> 0 then 'Petugas GA' end,
      'registered_at', now() - (3 + i % 5) * interval '1 day'));
  end loop;
exception when others then
  raise warning 'DEMO · modul "Pembagian (gift)" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Pengumuman & kalender ── */
  if to_regclass('public.announcements') is not null then
    perform demo_put('announcements', jsonb_build_object('title', 'Selamat datang di CIKOPS Demo', 'body', 'Semua data di sini fiktif. Silakan jelajahi setiap modul — tidak ada yang tersimpan ke sistem asli.', 'is_active', true, 'created_by', 'Admin GA'));
    perform demo_put('announcements', jsonb_build_object('title', 'Servis berkala armada minggu ini', 'body', 'Kendaraan B 1901 NPI & F 1350 NP masuk bengkel Rabu–Kamis. Jadwalkan tugas dengan armada lain.', 'is_active', true, 'created_by', 'Admin GA'));
    perform demo_put('announcements', jsonb_build_object('title', 'Audit K3 tahunan', 'body', 'Audit K3 eksternal dijadwalkan pekan depan. Mohon area kerja dirapikan.', 'is_active', true, 'created_by', 'HSE'));
  end if;
  for i in -10..20 loop
    continue when i % 3 <> 0;
    perform demo_put('agenda_events', jsonb_build_object('id', gen_random_uuid(),
      'title', (array['Kunjungan customer PT Sumber Rejeki', 'Audit internal ISO 9001', 'Townhall bulanan', 'Training K3 karyawan baru', 'Kunjungan supplier kemasan',
                     'Rapat koordinasi GA', 'Medical check-up karyawan', 'Kunjungan direksi kantor pusat', 'Donor darah', 'Family gathering - persiapan', 'Rapat budget Q4'])[1 + abs(i) % 11],
      'location', (array['Ruang Meeting Mawar', 'Aula', 'Area Produksi', 'Lobby', 'Ruang Direksi'])[1 + abs(i) % 5], 'event_date', v_today + i,
      'event_time', (array['09:00', '10:00', '13:00', '14:30'])[1 + abs(i) % 4], 'end_time', (array['11:00', '12:00', '15:00', '16:00'])[1 + abs(i) % 4],
      'kategori', (array['kunjungan', 'event', 'meeting', 'pelatihan'])[1 + abs(i) % 4], 'color', (array['#2f6bff', '#16a34a', '#f59e0b', '#a855f7'])[1 + abs(i) % 4],
      'pic', (v_emp -> (abs(i) * 3)) ->> 'nama', 'notes', '', 'created_by', 'Admin GA'));
  end loop;
exception when others then
  raise warning 'DEMO · modul "Pengumuman & kalender" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Resepsionis ── */
  if to_regclass('public.rcp_settings') is not null then
    update rcp_settings set room_name = 'Induction Room', wifi_ssid = 'NPI-Guest', open_time = '07:30', close_time = '17:00', slot_minutes = 30 where id = 1;
    if not found then perform demo_put('rcp_settings', jsonb_build_object('id', 1, 'room_name', 'Induction Room', 'wifi_ssid', 'NPI-Guest', 'open_time', '07:30', 'close_time', '17:00', 'slot_minutes', 30)); end if;
  end if;
  for i in 1..10 loop
    v_id := gen_random_uuid();
    perform demo_put('rcp_wifi_accounts', jsonb_build_object('id', v_id, 'username', 'guest' || lpad(i::text, 2, '0'), 'password', 'Npi' || (4000 + i * 37),
      'valid_from', v_m0, 'valid_until', v_today + case when i <= 2 then 5 else 60 end, 'slots', 3, 'batch', to_char(v_m0, 'YYYY-MM'), 'active', true, 'created_by', 'Receptionist'));
    for k in 1..(case when i <= 6 then 2 else 1 end) loop
      e := v_emp -> ((i * 7 + k) % 64);
      perform demo_put('rcp_wifi_grants', jsonb_build_object('id', gen_random_uuid(), 'receipt_no', 'WF-' || to_char(v_today, 'YYMM') || '-' || lpad((i * 2 + k)::text, 3, '0'),
        'account_id', v_id, 'slots', 1, 'guest_name', (array['Mr. Tanaka', 'Ms. Lee', 'Bpk. Rudi (Auditor)', 'Ibu Sarah (Konsultan)', 'Tim Vendor IT'])[1 + (i + k) % 5],
        'guest_company', (array['Tokyo Pack Co.', 'Seoul Machinery', 'KAP Mitra Audit', 'PT Konsultan Prima', 'PT Solusi Data'])[1 + (i + k) % 5],
        'requestor_name', e->>'nama', 'requestor_email', e->>'email', 'department', e->>'departement', 'purpose', 'Kunjungan kerja',
        'start_date', v_today - (i % 3), 'end_date', v_today + (i % 4),
        'returned_at', case when i > 8 then now() - interval '2 hours' end, 'created_by', 'Receptionist', 'created_at', now() - (i * 5) * interval '1 hour'));
    end loop;
  end loop;
  for i in 1..36 loop
    e := v_emp -> ((i * 9) % 64);
    v_status := case when i % 4 = 0 or i > 30 then 'waiting' else 'handed' end;
    perform demo_put('rcp_parcels', jsonb_build_object('id', gen_random_uuid(), 'receipt_no', case when i % 5 = 0 then 'OUT' else 'IN' end || '-' || to_char(v_today, 'YYMM') || '-' || lpad(i::text, 3, '0'),
      'direction', case when i % 5 = 0 then 'out' else 'in' end, 'item_type', (array['Paket', 'Dokumen', 'Surat'])[1 + i % 3],
      'description', (array['Paket sparepart', 'Dokumen kontrak', 'Surat undangan', 'Sampel produk', 'Paket ATK'])[1 + i % 5],
      'sender', (array['JNE', 'TIKI', 'Kantor Pusat', 'PT Kemas Jaya', 'Bank Mandiri'])[1 + i % 5], 'recipient', e->>'nama', 'department', e->>'departement', 'email', e->>'email',
      'courier', (array['JNE', 'J&T', 'SiCepat', 'Kurir internal'])[1 + i % 4], 'status', v_status,
      'handed_to', case when v_status = 'handed' then e->>'nama' end, 'handed_at', case when v_status = 'handed' then now() - (i * 3) * interval '1 hour' end,
      'handed_by', case when v_status = 'handed' then 'Receptionist' end, 'created_by', 'Receptionist',
      'created_at', now() - (case when v_status = 'waiting' then (case when i in (4, 8) then 60 else 1 + i % 9 end) else i * 4 end) * interval '1 hour'));
  end loop;
  for i in -5..10 loop
    continue when extract(isodow from v_today + i) >= 6;
    for k in 0..(1 + abs(i) % 2) loop
      e := v_emp -> ((abs(i) * 5 + k) % 64);
      perform demo_put('rcp_room_bookings', jsonb_build_object('id', gen_random_uuid(), 'room', 'Induction Room', 'booking_date', v_today + i,
        'start_time', (time '08:30' + k * interval '3 hours'), 'end_time', (time '10:00' + k * interval '3 hours'),
        'title', (array['Induksi karyawan baru', 'Training 5S', 'Briefing kontraktor', 'Safety induction tamu', 'Interview kandidat'])[1 + (abs(i) + k) % 5],
        'pic_name', e->>'nama', 'pic_email', e->>'email', 'department', e->>'departement', 'attendees', 6 + (abs(i) * 3 + k) % 14, 'notes', '', 'created_by', 'Receptionist',
        'receipt_no', 'BK-' || to_char(v_today, 'YYMM') || '-' || lpad(((i + 6) * 3 + k)::text, 3, '0')));
    end loop;
  end loop;
  insert into rcp_counters (prefix, period, last) values ('WF', to_char(v_today, 'YYMM'), 40), ('IN', to_char(v_today, 'YYMM'), 40), ('OUT', to_char(v_today, 'YYMM'), 40), ('BK', to_char(v_today, 'YYMM'), 60)
  on conflict do nothing;
exception when others then
  raise warning 'DEMO · modul "Resepsionis" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── Cleaning & Gardening: CIKOPS sumber utama, master, jadwal 2 bulan + actual ── */
  update ga_sync_config set master = 'cikops', master_since = now() - interval '30 days' where id = 1;
  for i in 1..12 loop
    perform demo_put('ga_manpower', jsonb_build_object('id', case when i <= 8 then 'CS' else 'GD' end || lpad(i::text, 2, '0'),
      'nama', first_names[10 + i] || ' ' || last_names[1 + i % 20], 'tim', case when i <= 8 then 'Cleaning Service' else 'Gardener' end,
      'jabatan', case when i in (1, 9) then 'Leader' else 'Crew' end, 'area_tugas', (array['Gedung A', 'Gedung B', 'Produksi', 'Kantin', 'Lobby', 'Toilet', 'Gudang', 'Area Luar'])[1 + i % 8],
      'status', 'Aktif', 'no_hp', '0857' || lpad((1200000 + i * 911)::text, 8, '0')));
  end loop;
  for i in 1..20 loop
    perform demo_put('ga_jobs', jsonb_build_object('id', case when i <= 14 then 'CS-' else 'GD-' end || lpad(i::text, 3, '0'),
      'tim', case when i <= 14 then 'Cleaning Service' else 'Gardener' end,
      'lokasi', (array['Gedung A', 'Gedung A', 'Gedung B', 'Lobby', 'Kantin', 'Toilet Lt.1', 'Toilet Lt.2', 'Ruang Meeting', 'Mushola', 'Produksi', 'Gudang', 'Pos Security', 'Parkir', 'Ruang Direksi',
                         'Taman Depan', 'Taman Belakang', 'Area Parkir', 'Pagar Keliling', 'Pot Lobby', 'Kolam'])[i],
      'tipe', (array['Sapu & pel lantai', 'Lap kaca jendela', 'Sapu & pel lantai', 'Lap meja & sofa', 'Bersihkan meja makan', 'Bersihkan toilet', 'Bersihkan toilet', 'Rapikan ruang', 'Bersihkan karpet',
                       'Buang sampah', 'Sapu area', 'Lap meja', 'Sapu parkir', 'Lap & vacuum', 'Siram tanaman', 'Potong rumput', 'Sapu daun', 'Pangkas pagar', 'Siram & pupuk', 'Kuras kolam'])[i],
      'area', 'Area ' || (1 + i % 4), 'frek', case when i in (2, 9, 16, 18, 20) then 'Mingguan' else 'Harian' end,
      'hari', case when i in (2, 9, 16, 18, 20) then (array['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'])[1 + i % 5] else 'Senin,Selasa,Rabu,Kamis,Jumat' end,
      'petugas', first_names[10 + 1 + i % 12] || ' ' || last_names[1 + (1 + i % 12) % 20], 'aktif', true, 'catatan', ''));
  end loop;
  for d in select generate_series(v_m0 - interval '1 month', (v_m0 + interval '1 month - 1 day')::date, interval '1 day')::date loop
    for e in select to_jsonb(gj) from ga_jobs gj where gj.aktif loop
      continue when extract(isodow from d)::int not in (select ga_day_no(trim(h)) from unnest(string_to_array(e->>'hari', ',')) h);
      r := random();
      perform demo_put('ga_plan', jsonb_build_object('key', (e->>'id') || '|' || to_char(d, 'YYYYMMDD'), 'periode', to_char(d, 'YYYYMM')::int, 'tanggal', d,
        'hari', ga_day_name(extract(isodow from d)::int), 'minggu_ke', ga_week_of_month(d), 'job_id', e->>'id', 'tim', e->>'tim', 'lokasi', e->>'lokasi', 'tipe', e->>'tipe',
        'area', e->>'area', 'frek', e->>'frek', 'petugas', e->>'petugas', 'plan', 1,
        'actual', case when d < v_today then (case when r < 0.93 then 1 else 0 end) end,
        'spv', case when d < v_today then 'SPV ISS' else '' end, 'waktu_input', case when d < v_today then demo_ts(d, time '16:30') end, 'sync_id', 'cikops'));
    end loop;
  end loop;
  for i in 1..8 loop
    perform demo_put('ga_events', jsonb_build_object('tanggal', v_today - i * 6, 'nama', (array['Persiapan townhall', 'Kerja bakti 5R', 'Dekorasi HUT RI', 'Support audit ISO', 'Family day', 'Fogging area plant', 'Penanaman pohon', 'Bersih-bersih pasca banjir'])[i],
      'deskripsi', 'Support tim Cleaning & Gardening', 'waktu', (array['Pagi', 'Siang', 'Full day'])[1 + i % 3], 'support', '4 crew cleaning, 2 gardener', 'dokumentasi', '', 'updated_by', 'SPV ISS', 'updated_at', now()));
    perform demo_put('ga_improvements', jsonb_build_object('tanggal', v_today - i * 5, 'kategori', (array['Kebersihan', 'Taman', 'Keamanan'])[1 + i % 3],
      'jenis', (array['Perbaikan', 'Penambahan', 'Penggantian'])[1 + i % 3], 'deskripsi', (array['Ganti keset lobby', 'Tambah tempat sampah terpilah', 'Perbaiki saluran air taman', 'Tambah dispenser sabun toilet', 'Ganti selang taman', 'Pasang rambu lantai basah', 'Tanam ulang rumput area parkir', 'Rapikan gudang alat'])[i],
      'area', (array['Lobby', 'Produksi', 'Taman', 'Toilet', 'Taman', 'Gedung A', 'Parkir', 'Gudang'])[i], 'petugas', 'Crew ISS', 'pengawas', 'SPV ISS', 'dokumentasi', '', 'updated_by', 'SPV ISS', 'updated_at', now()));
  end loop;
  for i in 1..14 loop
    perform demo_put('ga_inventory', jsonb_build_object('kode', 'INV-' || lpad(i::text, 3, '0'),
      'nama', (array['Mesin poles lantai', 'Vacuum cleaner', 'Mop set', 'Tangga lipat', 'Mesin potong rumput', 'Gunting pangkas', 'Selang 30m', 'Troli sampah', 'Wet floor sign', 'Sprayer', 'Blower daun', 'Ember peras', 'Sapu ijuk', 'Pengki'])[i],
      'jenis', case when i in (5, 6, 7, 10, 11) then 'Taman' else 'Kebersihan' end, 'area', (array['Gudang ISS', 'Gedung A', 'Gedung B'])[1 + i % 3],
      'status', case when i in (2, 11) then 'Perlu servis' when i = 5 then 'Rusak' else 'Baik' end, 'jumlah', 1 + (i * 3) % 9, 'tgl_update', v_today - i, 'foto', '', 'updated_by', 'SPV ISS', 'updated_at', now()));
  end loop;
exception when others then
  raise warning 'DEMO · modul "Cleaning & Gardening: CIKOPS sumber utama, master, jadwal 2 bulan + actual" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_t time := (now() at time zone 'Asia/Jakarta')::time;
  v_m0 date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  d date; i int; j int; k int; n int; r double precision;
  v_id uuid; v_uid uuid; v_vid uuid; v_did uuid;
  v_emp jsonb := '[]'::jsonb;
  v_drv jsonb := '[]'::jsonb;   -- [{id, nama, plant, type}]
  v_veh jsonb := '[]'::jsonb;   -- [{id, nopol, plant}]
  v_tga jsonb := '[]'::jsonb;
  e jsonb; dv jsonb; vh jsonb;
  v_status text; v_t time; v_start timestamptz; v_end timestamptz;
  v_tier_gold uuid := gen_random_uuid(); v_tier_silver uuid := gen_random_uuid(); v_tier_bronze uuid := gen_random_uuid();

  depts text[] := array['Produksi', 'Quality Assurance', 'Engineering', 'HR & GA', 'Finance & Accounting', 'Supply Chain', 'Marketing', 'IT', 'HSE', 'R&D', 'Procurement', 'Warehouse'];
  first_names text[] := array['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri',
    'Rizky', 'Sari', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yogi', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Elsa', 'Ferry', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin',
    'Laras', 'Miko', 'Nisa', 'Prasetyo', 'Ratna', 'Sinta', 'Teguh', 'Wulan', 'Yusuf', 'Agnes', 'Bayu', 'Cahya', 'Dian', 'Erlangga', 'Fitri', 'Galih'];
  last_names text[] := array['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Santoso', 'Hidayat', 'Kusuma', 'Nugroho', 'Permata', 'Setiawan', 'Maharani', 'Siregar',
    'Halim', 'Putra', 'Rahmawati', 'Gunawan', 'Wibowo', 'Anggraini', 'Firmansyah', 'Utami'];
  jabatan text[] := array['Staff', 'Staff', 'Staff', 'Senior Staff', 'Supervisor', 'Assistant Manager', 'Manager'];
  tujuan text[] := array['Kantor Pusat Sudirman', 'Bandara Soekarno-Hatta', 'Bank Mandiri KCP Cikupa', 'Kantor Pajak Tangerang', 'Pelabuhan Tanjung Priok',
    'Customer PT Sumber Rejeki', 'Distributor Serpong', 'Gudang Transit Balaraja', 'Bengkel Resmi Toyota Cikupa', 'Kantor Imigrasi Tangerang',
    'Hotel Santika BSD', 'Customer PT Agro Lestari', 'Laboratorium Sucofindo', 'Kantor Notaris Karawaci', 'Stasiun Tangerang', 'Supplier PT Kemas Jaya'];
  perihal text[] := array['Antar dokumen tender', 'Jemput tamu dari bandara', 'Setor kas & ambil cek', 'Lapor SPT masa', 'Ambil dokumen impor',
    'Kirim sampel produk', 'Meeting distributor', 'Antar barang ke gudang transit', 'Servis berkala kendaraan', 'Urus KITAS tenaga ahli',
    'Antar peserta training', 'Kunjungan customer', 'Kirim sampel uji lab', 'Legalisasi dokumen', 'Jemput karyawan dinas', 'Ambil kemasan sampel'];
  jenis text[] := array['Antar Dokumen', 'Antar Jemput Tamu', 'Keperluan Bank', 'Antar Barang', 'Kunjungan Customer', 'Servis Kendaraan', 'Antar Jemput Karyawan'];
  atk_names text[] := array['Kertas HVS A4 70gr', 'Kertas HVS F4 70gr', 'Pulpen Hitam', 'Pulpen Biru', 'Pensil 2B', 'Spidol Whiteboard Hitam', 'Spidol Permanen',
    'Stabilo Kuning', 'Tipe-X Kertas', 'Map Plastik', 'Ordner Besar', 'Amplop Coklat A4', 'Amplop Putih Kecil', 'Staples No.10', 'Isi Staples No.10',
    'Paper Clip', 'Binder Clip 155', 'Sticky Notes', 'Lakban Bening', 'Lakban Coklat', 'Gunting Sedang', 'Penggaris 30cm', 'Buku Agenda', 'Baterai AA', 'Tinta Stempel'];
  atk_unit text[] := array['Rim', 'Rim', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Pcs', 'Box', 'Box', 'Box', 'Pak', 'Roll', 'Roll', 'Pcs', 'Pcs', 'Pcs', 'Pak', 'Btl'];
  tga_cat text[] := array['Listrik', 'AC', 'Plumbing', 'Furniture', 'Sipil', 'Lainnya'];
  tga_job text[] := array['Ganti lampu TL ruang meeting', 'AC tidak dingin di ruang HR', 'Kran bocor toilet pria lt. 1', 'Perbaiki kursi kerja staff finance',
    'Tambal dinding retak gudang', 'Persiapan panggung townhall', 'Perbaiki stop kontak pantry', 'Cuci AC ruang server', 'Saluran wastafel mampet',
    'Pasang rak arsip baru', 'Cat ulang pintu lobby', 'Angkat & pindah meja ke lt. 2', 'Cek panel MCB area produksi', 'Ganti remote AC ruang direksi',
    'Perbaiki engsel pintu toilet', 'Pasang banner acara K3'];
  tga_loc text[] := array['Gedung A lt. 1', 'Gedung A lt. 2', 'Gedung B', 'Lobby', 'Kantin', 'Ruang Meeting Mawar', 'Gudang Bahan Baku', 'Pos Security', 'Ruang Server', 'Area Produksi'];
begin
  perform setseed(0.42);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nik), '[]'::jsonb) into v_emp from employees x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.email), '[]'::jsonb) into v_drv from drivers x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nopol), '[]'::jsonb) into v_veh from vehicles x;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama), '[]'::jsonb) into v_tga from tga_users x;
  select coalesce((select id from driver_tiers where name = 'Gold'), v_tier_gold), coalesce((select id from driver_tiers where name = 'Silver'), v_tier_silver),
         coalesce((select id from driver_tiers where name = 'Bronze'), v_tier_bronze) into v_tier_gold, v_tier_silver, v_tier_bronze;

  /* ── TGA: teknisi (PIN 1234), pekerjaan 45 hari + tugas terbuka, kode form DEMO2026 ── */
  for i in 1..4 loop
    v_id := gen_random_uuid();
    perform demo_put('tga_users', jsonb_build_object('id', v_id, 'nama', (array['Supriyadi', 'Agus Salim', 'Dedi Kurnia', 'Rohmat'])[i], 'no_hp', '0819' || lpad((2200000 + i * 733)::text, 8, '0'),
      'pin_hash', extensions.crypt('1234', extensions.gen_salt('bf')), 'aktif', true, 'last_login_at', now() - i * interval '3 hours'));
    v_tga := v_tga || jsonb_build_array(jsonb_build_object('id', v_id, 'nama', (array['Supriyadi', 'Agus Salim', 'Dedi Kurnia', 'Rohmat'])[i]));
  end loop;
  n := 0;
  for d in select generate_series(v_today - 45, v_today, interval '1 day')::date loop
    continue when extract(isodow from d) = 7;
    for k in 1..(2 + (random() * 3)::int) loop
      n := n + 1; e := v_emp -> ((random() * 63)::int); dv := v_tga -> ((random() * 3)::int); j := 1 + (random() * 15)::int;
      v_t := time '08:00' + (k - 1) * interval '95 minutes';
      v_status := case when d < v_today or v_t + interval '2 hours' < v_now_t then 'selesai' else 'proses' end;
      continue when d = v_today and v_t > v_now_t;
      perform demo_put('tga_activities', jsonb_build_object('id', gen_random_uuid(), 'ref_no', 'TGA-' || to_char(d, 'YYMM') || '-' || lpad(n::text, 3, '0'),
        'user_id', dv->>'id', 'nama_tga', dv->>'nama', 'tanggal', d, 'jam_mulai', v_t, 'jam_selesai', case when v_status = 'selesai' then v_t + interval '70 minutes' end,
        'kategori', tga_cat[1 + (j - 1) % 6], 'lokasi', tga_loc[1 + j % 10], 'activity', tga_job[j], 'request_by', e->>'nama', 'requestor_id', e->>'id', 'departemen', e->>'departement',
        'status', v_status, 'prioritas', case when random() < 0.12 then 'urgent' else 'normal' end, 'catatan', '',
        'sumber', (array['mandiri', 'tugas', 'permintaan'])[1 + n % 3], 'assigned_by', case when n % 3 = 1 then 'Rina Kusuma' when n % 3 = 2 then 'Permintaan karyawan' else '' end,
        'assigned_at', demo_ts(d, v_t - interval '20 minutes'), 'accepted_at', demo_ts(d, v_t),
        'selesai_at', case when v_status = 'selesai' then demo_ts(d, v_t + interval '70 minutes') end,
        'created_at', demo_ts(d, v_t - interval '20 minutes'), 'updated_at', demo_ts(d, v_t + interval '70 minutes')));
    end loop;
  end loop;
  -- tugas terbuka hari ini: belum diambil (urgent), menunggu diterima, butuh part
  perform demo_put('tga_activities', jsonb_build_object('id', gen_random_uuid(), 'ref_no', 'TGA-' || to_char(v_today, 'YYMM') || '-' || lpad((n + 1)::text, 3, '0'), 'user_id', null, 'nama_tga', '',
    'tanggal', v_today, 'kategori', 'Plumbing', 'lokasi', 'Toilet Gedung B', 'activity', 'Toilet wanita mampet, air meluap', 'request_by', (v_emp -> 4) ->> 'nama', 'departemen', (v_emp -> 4) ->> 'departement',
    'status', 'baru', 'prioritas', 'urgent', 'sumber', 'permintaan', 'assigned_by', 'Permintaan karyawan', 'assigned_at', now() - interval '12 minutes', 'created_at', now() - interval '12 minutes'));
  perform demo_put('tga_activities', jsonb_build_object('id', gen_random_uuid(), 'ref_no', 'TGA-' || to_char(v_today, 'YYMM') || '-' || lpad((n + 2)::text, 3, '0'), 'user_id', (v_tga -> 2) ->> 'id', 'nama_tga', (v_tga -> 2) ->> 'nama',
    'tanggal', v_today, 'kategori', 'AC', 'lokasi', 'Ruang Meeting Mawar', 'activity', 'AC ruang meeting tidak dingin', 'request_by', (v_emp -> 9) ->> 'nama', 'departemen', (v_emp -> 9) ->> 'departement',
    'status', 'baru', 'prioritas', 'normal', 'sumber', 'tugas', 'assigned_by', 'Rina Kusuma · form', 'assigned_at', now() - interval '25 minutes', 'created_at', now() - interval '25 minutes'));
  perform demo_put('tga_activities', jsonb_build_object('id', gen_random_uuid(), 'ref_no', 'TGA-' || to_char(v_today, 'YYMM') || '-' || lpad((n + 3)::text, 3, '0'), 'user_id', (v_tga -> 3) ->> 'id', 'nama_tga', (v_tga -> 3) ->> 'nama',
    'tanggal', v_today - 1, 'jam_mulai', '14:00', 'kategori', 'Listrik', 'lokasi', 'Area Produksi', 'activity', 'Ganti ballast lampu high bay', 'request_by', (v_emp -> 2) ->> 'nama', 'departemen', (v_emp -> 2) ->> 'departement',
    'status', 'butuh_part', 'prioritas', 'normal', 'catatan', 'Menunggu ballast 400W dari purchasing', 'sumber', 'tugas', 'assigned_by', 'Rina Kusuma',
    'assigned_at', now() - interval '1 day', 'accepted_at', now() - interval '23 hours', 'created_at', now() - interval '1 day'));
  insert into tga_counters (period, last)
  select substr(ref_no, 5, 4), max(substr(ref_no, 10)::int) from tga_activities group by 1
  on conflict (period) do update set last = excluded.last;
  if to_regclass('public.tga_assign_config') is not null then
    update tga_assign_config set code_hash = extensions.crypt('DEMO2026', extensions.gen_salt('bf')), aktif = true, failed_count = 0, locked_until = null,
           updated_at = now(), updated_by = 'Admin ISS' where id = 1;
  end if;
exception when others then
  raise warning 'DEMO · modul "TGA: teknisi (PIN 1234), pekerjaan 45 hari + tugas terbuka, kode form DEMO2026" dilewati: % (%)', sqlerrm, sqlstate;
end $$;

-- ── 4) Akun dashboard per role ──
do $$
declare a record; v_id uuid;
begin
  for a in select * from (values
    ('master@demo.cikops.id', 'Rina Kusuma (Master Admin)', 'master', null),
    ('ga.cik@demo.cikops.id', 'Dimas Pratama (Admin GA)', 'admin_ga_cik', 'CIK'),
    ('ga.prb@demo.cikops.id', 'Wulan Sari (Admin GA Parung)', 'admin_ga_prb', 'PRB'),
    ('iss@demo.cikops.id', 'Hendra Gunawan (SPV ISS)', 'admin_iss', null),
    ('security@demo.cikops.id', 'Bagus Wibowo (SPV Security)', 'admin_security', null),
    ('resepsionis@demo.cikops.id', 'Nadia Putri (Receptionist)', 'receptionist', null),
    ('manajemen@demo.cikops.id', 'Ir. Bambang Hartono (Plant Director)', 'management', null)
  ) as t(email, nama, role, plant) loop
    v_id := demo_user(a.email, a.nama);
    insert into profiles (id, full_name, role, plant_scope, is_master_admin, allowed_tabs)
    values (v_id, a.nama, a.role, a.plant, a.role = 'master', null)
    on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, plant_scope = excluded.plant_scope,
      is_master_admin = excluded.is_master_admin, allowed_tabs = null;
  end loop;
end $$;

-- Trigger kembali normal
do $$ begin set session_replication_role = origin; exception when others then null; end $$;

drop function if exists demo_put(text, jsonb);
drop function if exists demo_user(text, text);
drop function if exists demo_ts(date, time);

notify pgrst, 'reload schema';

-- ── Ringkasan ──
select 'akun demo' as isi, count(*)::text as jumlah from auth.users where email ilike '%@demo.cikops.id'
union all select 'karyawan', count(*)::text from employees
union all select 'driver', count(*)::text from drivers
union all select 'kendaraan', count(*)::text from vehicles
union all select 'tugas driver', count(*)::text from tasks
union all select 'klaim', count(*)::text from claims
union all select 'laporan kantin', count(*)::text from canteen_reports
union all select 'jadwal cleaning & gardening', count(*)::text from ga_plan
union all select 'pekerjaan TGA', count(*)::text from tga_activities;
