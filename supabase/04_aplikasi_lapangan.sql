-- ═══════════════════════════════════════════════════════════════
-- 04_APLIKASI_LAPANGAN — aplikasi Driver & TGA
--   Bagian 042  notifikasi native APK (Firebase Cloud Messaging)
--   Bagian 043  Self-Claim driver: driver mengajukan klaim sendiri,
--               admin Finance memverifikasi / mengedit → masuk ke tabel claims
--   Bagian 044  Excel ATK: kirim permintaan & restock lewat kunci sinkron
--   Bagian 045  Modul TGA: admin ubah / hapus pekerjaan + form penugasan publik
--               (semua staf GA menugaskan TGA dengan kode penugasan)
--   Bagian 046  Status teknisi TGA Available / Busy (realtime di dashboard)
--
-- Jalankan SESUDAH 02_peran_keamanan.sql. Idempotent — aman diulang.
-- ═══════════════════════════════════════════════════════════════


-- ######################################################################
-- ## BAGIAN 042 — token FCM
-- ######################################################################
-- APK membuka halaman dengan ?fcm=<token>; halaman mendaftarkan token itu ke
-- push_subscriptions dengan endpoint "fcm:<token>" (p256dh/auth kosong).
-- Edge Function send-web-push mengirim lewat FCM untuk endpoint ini.

create or replace function push_endpoint_ok(p_endpoint text) returns boolean
language sql immutable as $$
  -- catatan: PostgreSQL membatasi {m,n} maksimal 255, jadi panjang token dicek terpisah
  select coalesce(p_endpoint, '') ~ '^https://'
      or (coalesce(p_endpoint, '') ~ '^fcm:[A-Za-z0-9_:.-]+$' and length(p_endpoint) between 24 and 4100)
$$;

create or replace function push_subscribe_driver(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare v_driver uuid;
begin
  select d.id into v_driver from drivers d
   where lower(trim(to_jsonb(d) ->> 'email')) = lower(auth.jwt() ->> 'email') and d.aktif
   limit 1;
  if v_driver is null then raise exception 'Akun ini tidak terhubung ke driver aktif.'; end if;
  if not push_endpoint_ok(p_endpoint) then raise exception 'Langganan notifikasi tidak valid.'; end if;
  insert into push_subscriptions (endpoint, p256dh, auth, app, driver_id, tga_user_id, user_agent)
  values (p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''), 'driver', v_driver, null, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, app = 'driver',
    driver_id = excluded.driver_id, tga_user_id = null, user_agent = excluded.user_agent, updated_at = now();
  return true;
end $$;

create or replace function tga_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype;
begin
  u := tga_user_of(p_token);
  if not push_endpoint_ok(p_endpoint) then raise exception 'Langganan notifikasi tidak valid.'; end if;
  insert into push_subscriptions (endpoint, p256dh, auth, app, driver_id, tga_user_id, user_agent)
  values (p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''), 'tga', null, u.id, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, app = 'tga',
    driver_id = null, tga_user_id = excluded.tga_user_id, user_agent = excluded.user_agent, updated_at = now();
  return true;
end $$;

revoke all on function push_subscribe_driver(text, text, text, text) from public, anon;
grant execute on function push_subscribe_driver(text, text, text, text) to authenticated;
revoke all on function tga_push_subscribe(text, text, text, text, text) from public;
grant execute on function tga_push_subscribe(text, text, text, text, text) to anon, authenticated;


-- ######################################################################
-- ## BAGIAN 043 — Self-Claim driver
-- ######################################################################
-- Alur: driver mengisi klaim di aplikasi (status "menunggu") → admin Finance
-- membuka di menu Klaim → "Pengajuan driver", memeriksa / mengedit, lalu
-- Verifikasi (klaim resmi dibuat di tabel claims) atau Tolak (dengan alasan).
-- Selama belum diverifikasi, pengajuan TIDAK masuk ke laporan / rekap klaim.

create table if not exists driver_claim_requests (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references drivers(id) on delete cascade,
  period_date  date not null,                       -- tanggal pengeluaran
  items        jsonb not null default '[]',         -- [{type, expr, total}] sama seperti claims.items
  total        numeric not null default 0,
  note         text not null default '',
  nota         text not null default 'menyusul' check (nota in ('ada', 'menyusul')),
  status       text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  admin_note   text not null default '',
  claim_id     uuid references claims(id) on delete set null,
  reviewed_by  text not null default '',
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists driver_claim_requests_status_idx on driver_claim_requests (status, created_at desc);
create index if not exists driver_claim_requests_driver_idx on driver_claim_requests (driver_id, created_at desc);

-- Baca: staf, dan driver untuk pengajuannya sendiri. Tulis: hanya lewat fungsi di bawah.
alter table driver_claim_requests enable row level security;
revoke all on driver_claim_requests from anon;
revoke insert, update, delete on driver_claim_requests from authenticated;
grant select on driver_claim_requests to authenticated;
drop policy if exists staff_read on driver_claim_requests;
create policy staff_read on driver_claim_requests for select to authenticated using (is_staff());
drop policy if exists driver_own on driver_claim_requests;
create policy driver_own on driver_claim_requests for select to authenticated using (driver_id = my_driver_id());

-- Rapikan rincian: maks 30 baris, jenis wajib, nominal > 0 dan wajar.
create or replace function claim_items_clean(p_items jsonb) returns jsonb
language plpgsql immutable as $$
declare it jsonb; out jsonb := '[]'; v_total numeric; v_type text;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Rincian klaim tidak valid.'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Isi minimal satu rincian.'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Rincian maksimal 30 baris.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_type := left(trim(coalesce(it ->> 'type', '')), 40);
    v_total := round(coalesce((it ->> 'total')::numeric, 0));
    if v_type = '' then raise exception 'Jenis klaim wajib diisi.'; end if;
    if v_total <= 0 or v_total > 50000000 then raise exception 'Nominal % tidak valid.', v_type; end if;
    out := out || jsonb_build_array(jsonb_build_object('type', v_type, 'expr', left(coalesce(it ->> 'expr', v_total::text), 120), 'total', v_total));
  end loop;
  return out;
end $$;

/** Driver: ajukan baru (p_id null) atau ubah pengajuan yang masih menunggu. */
create or replace function driver_claim_submit(p_id uuid, p_period date, p_items jsonb, p_note text default '', p_nota text default 'menyusul')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_driver uuid := my_driver_id(); v_items jsonb; v_total numeric; v_id uuid;
begin
  if v_driver is null then raise exception 'Akun ini bukan akun driver.' using errcode = '42501'; end if;
  if p_period is null or p_period > (now() at time zone 'Asia/Jakarta')::date or p_period < (now() at time zone 'Asia/Jakarta')::date - 120 then
    raise exception 'Tanggal pengeluaran tidak valid (maksimal 120 hari ke belakang).';
  end if;
  v_items := claim_items_clean(p_items);
  select sum((x ->> 'total')::numeric) into v_total from jsonb_array_elements(v_items) x;
  if p_id is null then
    insert into driver_claim_requests (driver_id, period_date, items, total, note, nota)
    values (v_driver, p_period, v_items, v_total, left(coalesce(p_note, ''), 500), case when p_nota = 'ada' then 'ada' else 'menyusul' end)
    returning id into v_id;
  else
    update driver_claim_requests set period_date = p_period, items = v_items, total = v_total,
           note = left(coalesce(p_note, ''), 500), nota = case when p_nota = 'ada' then 'ada' else 'menyusul' end, updated_at = now()
     where id = p_id and driver_id = v_driver and status = 'menunggu'
    returning id into v_id;
    if v_id is null then raise exception 'Pengajuan sudah diproses admin — tidak bisa diubah lagi.'; end if;
  end if;
  return v_id;
end $$;

/** Driver: batalkan pengajuan yang masih menunggu. */
create or replace function driver_claim_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update driver_claim_requests set status = 'dibatalkan', updated_at = now()
   where id = p_id and driver_id = my_driver_id() and status = 'menunggu';
  if not found then raise exception 'Pengajuan sudah diproses admin — tidak bisa dibatalkan.'; end if;
end $$;

/** Admin Finance: verifikasi (boleh dengan koreksi) → klaim resmi dibuat. */
create or replace function driver_claim_approve(p_id uuid, p_driver uuid, p_submission date, p_period date,
                                                p_items jsonb, p_note text default '', p_admin_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare r driver_claim_requests%rowtype; v_items jsonb; v_total numeric; v_claim uuid; v_who text;
begin
  if not staff_can('finance') then raise exception 'Akses ditolak: akun ini tidak mengelola modul Finance.' using errcode = '42501'; end if;
  select * into r from driver_claim_requests where id = p_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan ini sudah %.', r.status; end if;
  v_items := claim_items_clean(p_items);
  select sum((x ->> 'total')::numeric) into v_total from jsonb_array_elements(v_items) x;
  insert into claims (driver_id, submission_date, period_date, items, total, note, status, submitted_at)
  values (coalesce(p_driver, r.driver_id), coalesce(p_submission, (now() at time zone 'Asia/Jakarta')::date),
          coalesce(p_period, r.period_date), v_items, v_total, coalesce(p_note, ''), 'submitted', now())
  returning id into v_claim;
  select coalesce(nullif(trim(full_name), ''), 'Admin') into v_who from profiles where id = auth.uid();
  update driver_claim_requests set status = 'disetujui', claim_id = v_claim, admin_note = left(coalesce(p_admin_note, ''), 500),
         reviewed_by = coalesce(v_who, 'Admin'), reviewed_at = now(), updated_at = now()
   where id = p_id;
  return v_claim;
end $$;

/** Admin Finance: tolak dengan alasan (terlihat di aplikasi driver). */
create or replace function driver_claim_reject(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  if not staff_can('finance') then raise exception 'Akses ditolak: akun ini tidak mengelola modul Finance.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan penolakan wajib diisi.'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin') into v_who from profiles where id = auth.uid();
  update driver_claim_requests set status = 'ditolak', admin_note = left(trim(p_reason), 500),
         reviewed_by = coalesce(v_who, 'Admin'), reviewed_at = now(), updated_at = now()
   where id = p_id and status = 'menunggu';
  if not found then raise exception 'Pengajuan sudah diproses.'; end if;
end $$;

revoke all on function claim_items_clean(jsonb) from public, anon;
revoke all on function driver_claim_submit(uuid, date, jsonb, text, text), driver_claim_cancel(uuid),
              driver_claim_approve(uuid, uuid, date, date, jsonb, text, text), driver_claim_reject(uuid, text) from public, anon;
grant execute on function driver_claim_submit(uuid, date, jsonb, text, text), driver_claim_cancel(uuid),
              driver_claim_approve(uuid, uuid, date, date, jsonb, text, text), driver_claim_reject(uuid, text) to authenticated;

-- Realtime: badge "pengajuan baru" di dashboard & status di aplikasi driver
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'driver_claim_requests') then
    alter publication supabase_realtime add table driver_claim_requests;
  end if;
end $$;

notify pgrst, 'reload schema';

select 'pengajuan klaim driver menunggu' as cek, count(*)::text as hasil from driver_claim_requests where status = 'menunggu';


-- ######################################################################
-- ## BAGIAN 044 — Excel ATK: kirim permintaan & restock lewat kunci sinkron
-- ######################################################################
-- Bagian 040 menutup INSERT langsung ke atk_requests / atk_restocks bagi pengunjung
-- tanpa login, sehingga "Sinkron ke CIKOPS" dari Excel (anon key) ditolak.
-- Sekarang Excel (modSyncCikops.bas versi baru) mengirim lewat fungsi di bawah,
-- yang memeriksa CIKOPS_SYNC_KEY seperti atk_upsert_item. Kiriman ulang baris yang
-- sama (mis. Excel tertutup sebelum menandai Synced) tidak membuat data dobel.

do $$
begin
  if to_regclass('public.atk_requests') is null or to_regclass('public.atk_restocks') is null then
    raise notice 'Tabel ATK belum ada — bagian 044 dilewati.'; return;
  end if;

  create or replace function atk_excel_push_request(p_key text, p_row jsonb) returns boolean
  language plpgsql security definer set search_path = public as $f$
  declare v_id text := trim(coalesce(p_row ->> 'request_id', '')); v_kode text := trim(coalesce(p_row ->> 'kode_barang', ''));
          v_jml numeric := coalesce(nullif(p_row ->> 'jumlah', '')::numeric, 0);
  begin
    perform atk_check_key(p_key);
    if v_id = '' then raise exception 'request_id kosong.'; end if;
    if exists (select 1 from atk_requests where request_id = v_id and kode_barang = v_kode and jumlah = v_jml and source = 'excel') then
      return false;  -- sudah pernah terkirim
    end if;
    insert into atk_requests (request_id, tanggal, nama, nik, departemen, kode_barang, nama_barang, jumlah, satuan, helper, source, created_by)
    values (v_id, coalesce(nullif(p_row ->> 'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            left(coalesce(p_row ->> 'nama', ''), 200), left(coalesce(p_row ->> 'nik', ''), 60), left(coalesce(p_row ->> 'departemen', ''), 120),
            v_kode, left(coalesce(p_row ->> 'nama_barang', ''), 200), v_jml, left(coalesce(p_row ->> 'satuan', ''), 40),
            left(coalesce(p_row ->> 'helper', ''), 120), 'excel', 'Excel');
    update atk_sync_config set last_push_at = now() where id = 1;
    return true;
  end $f$;

  create or replace function atk_excel_push_restock(p_key text, p_row jsonb) returns boolean
  language plpgsql security definer set search_path = public as $f$
  declare v_id text := trim(coalesce(p_row ->> 'update_id', '')); v_kode text := trim(coalesce(p_row ->> 'kode_barang', ''));
          v_jml numeric := coalesce(nullif(p_row ->> 'jumlah', '')::numeric, 0);
  begin
    perform atk_check_key(p_key);
    if v_id = '' then raise exception 'update_id kosong.'; end if;
    if exists (select 1 from atk_restocks where update_id = v_id and kode_barang = v_kode and jumlah = v_jml and source = 'excel') then
      return false;
    end if;
    insert into atk_restocks (update_id, tanggal, nama, nik, departemen, kode_barang, nama_barang, jumlah, satuan, source, created_by)
    values (v_id, coalesce(nullif(p_row ->> 'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            left(coalesce(p_row ->> 'nama', ''), 200), left(coalesce(p_row ->> 'nik', ''), 60), left(coalesce(p_row ->> 'departemen', ''), 120),
            v_kode, left(coalesce(p_row ->> 'nama_barang', ''), 200), v_jml, left(coalesce(p_row ->> 'satuan', ''), 40), 'excel', 'Excel');
    update atk_sync_config set last_push_at = now() where id = 1;
    return true;
  end $f$;

  revoke all on function atk_excel_push_request(text, jsonb), atk_excel_push_restock(text, jsonb) from public;
  grant execute on function atk_excel_push_request(text, jsonb), atk_excel_push_restock(text, jsonb) to anon, authenticated;
end $$;

notify pgrst, 'reload schema';


-- ######################################################################
-- ## BAGIAN 045 — Modul TGA: CRUD pekerjaan oleh admin + form penugasan publik
-- ######################################################################
-- • Admin ISS (dashboard → menu TGA) boleh mengubah SEMUA kolom pekerjaan
--   (teknisi, status, tanggal, jam, dst.), membatalkan, dan menghapus permanen.
-- • Form publik /tugas-tga: semua staf GA bisa menugaskan TGA tanpa login,
--   cukup dengan KODE PENUGASAN yang diatur admin. Kode disimpan sebagai hash;
--   salah kode 8x → form terkunci 15 menit.

-- ── 1) Admin: tambah / ubah pekerjaan apa pun ──
-- p_user_id null = tanpa teknisi (masuk "siapa cepat" bila status Baru);
-- p_data.nama_tga dipakai bila teknisinya tidak punya akun lagi.
create or replace function tga_admin_save_activity(p_id uuid, p_user_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a tga_activities%rowtype; old tga_activities%rowtype; v_by text; v_nama text; v_act text; v_status text;
        v_req_id uuid; v_req text; v_dept text; v_tgl date; v_mulai time; v_selesai time;
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin GA') into v_by from profiles where id = auth.uid();
  v_act := trim(coalesce(p_data->>'activity', ''));
  if v_act = '' then raise exception 'Isi pekerjaan yang dikerjakan.'; end if;
  v_status := coalesce(nullif(p_data->>'status', ''), 'baru');
  if v_status not in ('baru', 'proses', 'pending', 'butuh_part', 'selesai', 'batal') then raise exception 'Status tidak dikenal.'; end if;
  if p_user_id is not null then
    select nama into v_nama from tga_users where id = p_user_id;
    if v_nama is null then raise exception 'Teknisi tidak ditemukan.'; end if;
  else
    v_nama := left(trim(coalesce(p_data->>'nama_tga', '')), 80);
  end if;
  if v_status in ('proses', 'pending', 'butuh_part', 'selesai') and v_nama = '' then
    raise exception 'Pilih teknisi untuk status ini.';
  end if;
  v_req := left(trim(coalesce(p_data->>'request_by', '')), 80);
  v_dept := left(trim(coalesce(p_data->>'departemen', '')), 80);
  if coalesce(p_data->>'requestor_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select e.id, e.nama, coalesce(nullif(trim(e.departement), ''), v_dept) into v_req_id, v_req, v_dept
      from employees e where e.id = (p_data->>'requestor_id')::uuid;
  end if;
  v_tgl := coalesce(nullif(p_data->>'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date);
  v_mulai := nullif(p_data->>'jam_mulai', '')::time;
  v_selesai := nullif(p_data->>'jam_selesai', '')::time;

  if p_id is null then
    insert into tga_activities (ref_no, user_id, nama_tga, tanggal, jam_mulai, jam_selesai, kategori, lokasi, activity,
                                request_by, requestor_id, departemen, request_phone, status, prioritas, catatan,
                                sumber, assigned_by, assigned_at, accepted_at, selesai_at)
    values (tga_next_no(), p_user_id, v_nama, v_tgl, v_mulai, v_selesai,
            coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'), left(trim(coalesce(p_data->>'lokasi', '')), 120), left(v_act, 1000),
            v_req, v_req_id, v_dept, left(trim(coalesce(p_data->>'request_phone', '')), 30), v_status,
            case when p_data->>'prioritas' = 'urgent' then 'urgent' else 'normal' end, trim(coalesce(p_data->>'catatan', '')),
            'tugas', v_by, now(),
            case when v_status in ('proses', 'pending', 'butuh_part', 'selesai') then now() end,
            case when v_status = 'selesai' then now() end)
    returning * into a;
  else
    select * into old from tga_activities where id = p_id;
    if not found then raise exception 'Pekerjaan tidak ditemukan.'; end if;
    update tga_activities set
      user_id = p_user_id, nama_tga = v_nama, tanggal = v_tgl, jam_mulai = v_mulai, jam_selesai = v_selesai,
      kategori = coalesce(nullif(trim(p_data->>'kategori'), ''), kategori), lokasi = left(trim(coalesce(p_data->>'lokasi', '')), 120),
      activity = left(v_act, 1000), request_by = v_req, requestor_id = v_req_id, departemen = v_dept,
      request_phone = left(trim(coalesce(p_data->>'request_phone', request_phone)), 30),
      status = v_status, prioritas = case when p_data->>'prioritas' = 'urgent' then 'urgent' else 'normal' end,
      catatan = trim(coalesce(p_data->>'catatan', '')),
      accepted_at = case when v_status = 'baru' then null else coalesce(accepted_at, case when v_status <> 'batal' then now() end) end,
      selesai_at = case when v_status = 'selesai' then coalesce(selesai_at, now()) else null end,
      -- Kembali ke "Baru" untuk teknisi lain / dibuka ulang → dikirim ulang ke HP teknisi
      assigned_by = case when v_status = 'baru' and (old.status <> 'baru' or old.user_id is distinct from p_user_id) then v_by else assigned_by end,
      assigned_at = case when v_status = 'baru' and (old.status <> 'baru' or old.user_id is distinct from p_user_id) then now() else assigned_at end,
      updated_at = now()
     where id = p_id
    returning * into a;
  end if;
  return tga_activity_json(a);
end $$;

-- ── 2) Admin: hapus permanen (batal = tetap tercatat; hapus = hilang dari laporan) ──
create or replace function tga_admin_delete_activity(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  delete from tga_activities where id = p_id;
  if not found then raise exception 'Pekerjaan tidak ditemukan (mungkin sudah dihapus).'; end if;
end $$;

-- ── 3) Kode penugasan untuk form publik ──
create table if not exists tga_assign_config (
  id           int primary key default 1 check (id = 1),
  code_hash    text,
  aktif        boolean not null default false,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz,
  updated_by   text not null default ''
);
insert into tga_assign_config (id) values (1) on conflict (id) do nothing;
alter table tga_assign_config enable row level security;   -- tanpa policy: hanya lewat fungsi

create or replace function tga_admin_assign_config() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c tga_assign_config%rowtype;
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  select * into c from tga_assign_config where id = 1;
  return jsonb_build_object('aktif', coalesce(c.aktif, false), 'has_code', c.code_hash is not null,
    'updated_at', c.updated_at, 'updated_by', coalesce(c.updated_by, ''),
    'locked', c.locked_until is not null and c.locked_until > now(),
    'today', (select count(*) from tga_activities where sumber = 'tugas' and assigned_by like '%· form' and created_at > now() - interval '1 day'));
end $$;

/** p_code kosong = kode tidak diganti (hanya aktif/nonaktif). */
create or replace function tga_admin_set_assign_code(p_code text, p_aktif boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_by text;
begin
  if not tga_is_staff() then raise exception 'Akses ditolak.' using errcode = '42501'; end if;
  if coalesce(p_code, '') <> '' and p_code !~ '^[A-Za-z0-9]{4,20}$' then raise exception 'Kode harus 4–20 huruf/angka tanpa spasi.'; end if;
  if coalesce(p_aktif, false) and coalesce(p_code, '') = '' and (select code_hash from tga_assign_config where id = 1) is null then
    raise exception 'Buat kode penugasan dulu.';
  end if;
  select coalesce(nullif(trim(full_name), ''), 'Admin GA') into v_by from profiles where id = auth.uid();
  update tga_assign_config set
    code_hash = case when coalesce(p_code, '') <> '' then crypt(upper(p_code), gen_salt('bf')) else code_hash end,
    aktif = coalesce(p_aktif, aktif), failed_count = 0, locked_until = null, updated_at = now(), updated_by = v_by
   where id = 1;
end $$;

-- Cek kode TANPA exception supaya hitungan salah kode tetap tersimpan. null = lolos.
create or replace function tga_assign_check(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c tga_assign_config%rowtype;
begin
  select * into c from tga_assign_config where id = 1 for update;
  if not found or not c.aktif or c.code_hash is null then return 'Form penugasan belum diaktifkan admin.'; end if;
  if c.locked_until is not null and c.locked_until > now() then
    return 'Terlalu banyak kode salah. Coba lagi ' || greatest(1, ceil(extract(epoch from c.locked_until - now()) / 60))::int || ' menit lagi.';
  end if;
  if crypt(upper(coalesce(p_code, '')), c.code_hash) <> c.code_hash then
    update tga_assign_config set
           locked_until = case when failed_count + 1 >= 8 then now() + interval '15 minutes' else locked_until end,
           failed_count = case when failed_count + 1 >= 8 then 0 else failed_count + 1 end
     where id = 1;
    return 'Kode penugasan salah.';
  end if;
  if c.failed_count > 0 then update tga_assign_config set failed_count = 0 where id = 1; end if;
  return null;
end $$;

/** Form publik: cek kode + daftar teknisi aktif & karyawan (untuk pemilih requestor). */
create or replace function tga_assign_public_info(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_err text;
begin
  v_err := tga_assign_check(p_code);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  return jsonb_build_object(
    'technicians', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nama', u.nama,
        'open', (select count(*) from tga_activities a where a.user_id = u.id and a.status in ('baru', 'proses', 'pending', 'butuh_part'))) order by u.nama)
      from tga_users u where u.aktif), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nama', e.nama, 'dept', coalesce(e.departement, '')) order by e.nama)
      from employees e
     where coalesce(trim(e.nama), '') <> '' and coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb));
end $$;

/** Form publik: buat tugas TGA (status Baru → HP teknisi berdering). */
create or replace function tga_assign_public(p_code text, p_user_id uuid, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_err text; a tga_activities%rowtype; v_by text; v_nama text := ''; v_act text; v_req_id uuid; v_req text; v_dept text; v_recent int;
begin
  v_err := tga_assign_check(p_code);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  v_by := left(trim(coalesce(p_data->>'assigned_by', '')), 60);
  if length(v_by) < 2 then return jsonb_build_object('error', 'Isi nama Anda (pemberi tugas).'); end if;
  v_act := trim(coalesce(p_data->>'activity', ''));
  if length(v_act) < 3 then return jsonb_build_object('error', 'Isi pekerjaan yang harus dikerjakan.'); end if;
  select count(*) into v_recent from tga_activities where assigned_by like '%· form' and created_at > now() - interval '10 minutes';
  if v_recent >= 30 then return jsonb_build_object('error', 'Terlalu banyak tugas dalam 10 menit. Coba lagi sebentar.'); end if;
  if p_user_id is not null then
    select nama into v_nama from tga_users where id = p_user_id and aktif;
    if v_nama is null then return jsonb_build_object('error', 'Teknisi tidak ditemukan atau nonaktif.'); end if;
  end if;
  v_req := left(trim(coalesce(p_data->>'request_by', '')), 80);
  v_dept := left(trim(coalesce(p_data->>'departemen', '')), 80);
  if coalesce(p_data->>'requestor_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select e.id, e.nama, coalesce(nullif(trim(e.departement), ''), v_dept) into v_req_id, v_req, v_dept
      from employees e where e.id = (p_data->>'requestor_id')::uuid;
  end if;
  insert into tga_activities (ref_no, user_id, nama_tga, kategori, lokasi, activity, request_by, requestor_id, departemen,
                              request_phone, status, prioritas, catatan, sumber, assigned_by, assigned_at)
  values (tga_next_no(), p_user_id, coalesce(v_nama, ''), coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'),
          left(trim(coalesce(p_data->>'lokasi', '')), 120), left(v_act, 1000), v_req, v_req_id, v_dept,
          left(trim(coalesce(p_data->>'request_phone', '')), 30), 'baru',
          case when p_data->>'prioritas' = 'urgent' then 'urgent' else 'normal' end,
          left(trim(coalesce(p_data->>'catatan', '')), 500), 'tugas', v_by || ' · form', now())
  returning * into a;
  return jsonb_build_object('id', a.id, 'ref_no', a.ref_no, 'nama_tga', a.nama_tga, 'pool', a.user_id is null);
end $$;

-- ── 4) Hak akses ──
revoke all on function tga_admin_save_activity(uuid, uuid, jsonb), tga_admin_delete_activity(uuid),
  tga_admin_assign_config(), tga_admin_set_assign_code(text, boolean) from public, anon;
grant execute on function tga_admin_save_activity(uuid, uuid, jsonb), tga_admin_delete_activity(uuid),
  tga_admin_assign_config(), tga_admin_set_assign_code(text, boolean) to authenticated;
revoke all on function tga_assign_check(text) from public, anon, authenticated;
revoke all on function tga_assign_public_info(text), tga_assign_public(text, uuid, jsonb) from public;
grant execute on function tga_assign_public_info(text), tga_assign_public(text, uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- Cek: form penugasan aktif? (aktifkan dari Dashboard → TGA → Form penugasan)
select 'form penugasan TGA aktif' as cek, coalesce((select aktif::text from tga_assign_config where id = 1), 'false') as hasil;


-- ######################################################################
-- ## BAGIAN 046 — Status teknisi TGA: Available / Busy
-- ######################################################################
-- Busy  = teknisi punya pekerjaan berstatus Proses (sudah menerima / sedang dikerjakan).
-- Available = tidak ada pekerjaan Proses (selesai, pending, butuh part, atau belum ada tugas).
-- Status dihitung dari tga_activities, jadi selalu sesuai data. Dashboard menerima
-- perubahan secara realtime lewat publikasi supabase_realtime.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tga_activities') then
    alter publication supabase_realtime add table tga_activities;
  end if;
end $$;

create index if not exists tga_activities_busy_idx on tga_activities (user_id) where status = 'proses';

/** Form publik: + status busy per teknisi. */
create or replace function tga_assign_public_info(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_err text;
begin
  v_err := tga_assign_check(p_code);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  return jsonb_build_object(
    'technicians', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nama', u.nama,
        'open', (select count(*) from tga_activities a where a.user_id = u.id and a.status in ('baru', 'proses', 'pending', 'butuh_part')),
        'busy', exists (select 1 from tga_activities a where a.user_id = u.id and a.status = 'proses'),
        'busy_ref', (select a.ref_no from tga_activities a where a.user_id = u.id and a.status = 'proses' order by a.accepted_at desc nulls last limit 1))
        order by u.nama)
      from tga_users u where u.aktif), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nama', e.nama, 'dept', coalesce(e.departement, '')) order by e.nama)
      from employees e
     where coalesce(trim(e.nama), '') <> '' and coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb));
end $$;
revoke all on function tga_assign_public_info(text) from public;
grant execute on function tga_assign_public_info(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Cek: teknisi yang sedang busy
select 'teknisi busy sekarang' as cek, count(distinct user_id)::text as hasil from tga_activities where status = 'proses' and user_id is not null;
