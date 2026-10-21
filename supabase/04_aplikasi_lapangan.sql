-- ═══════════════════════════════════════════════════════════════
-- 04_APLIKASI_LAPANGAN — aplikasi Driver & TGA
--   Bagian 042  notifikasi native APK (Firebase Cloud Messaging)
--   Bagian 043  Self-Claim driver: driver mengajukan klaim sendiri,
--               admin Finance memverifikasi / mengedit → masuk ke tabel claims
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
  select coalesce(p_endpoint, '') ~ '^https://' or coalesce(p_endpoint, '') ~ '^fcm:[A-Za-z0-9_:.-]{20,4096}$'
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
