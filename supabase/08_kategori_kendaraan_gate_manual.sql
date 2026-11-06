-- ═════════════════════════════════════════════════
-- 08_KATEGORI_KENDARAAN_GATE_MANUAL
--   A. Kategori kendaraan: ASET GA (bawaan) atau MOBIL PERUSAHAAN NON-ASET GA
--      (mis. mobil sales — bukan aset GA, tetapi dipakai driver GA sesuai kebutuhan).
--   B. Gate Log: Security bisa mencatat MANUAL plat yang belum terdaftar di Aset GA.
--      Plat itu otomatis didaftarkan sebagai non-aset "dari gate" (belum diverifikasi); GA bisa melengkapinya di Armada.
--
-- URUTAN: jalankan file ini di Supabase SQL Editor SEBELUM / bersamaan dengan deploy aplikasi (aplikasi tetap jalan
-- bila file ini belum dijalankan, tetapi kategori & input manual gate baru aktif sesudahnya). Idempotent — aman diulang.
-- ═════════════════════════════════════════════════

-- ── A. Kolom baru ─────────────────────────────────────────────────────────────────
alter table vehicles add column if not exists kategori  text    not null default 'asset_ga';
alter table vehicles add column if not exists from_gate boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_kategori_check') then
    alter table vehicles add constraint vehicles_kategori_check check (kategori in ('asset_ga', 'non_asset'));
  end if;
end $$;

comment on column vehicles.kategori  is 'asset_ga = aset GA/Facility Management | non_asset = mobil perusahaan bukan aset GA (mis. mobil sales) yang dipakai driver GA sesuai kebutuhan';
comment on column vehicles.from_gate is 'true = didaftarkan otomatis dari input manual Security di /gate; belum diverifikasi GA (aktif=false sampai GA menjadikannya mobil perusahaan di Armada)';

-- ── B1. Daftar kendaraan untuk form gate: + kategori, + plat dari gate (belum diverifikasi) ───────────
drop function if exists get_active_vehicles_for_gate();
create function get_active_vehicles_for_gate()
returns table (id uuid, nopol text, jenis text, plant text, color text, kategori text)
language sql stable security definer set search_path = public as $$
  select id, nopol, jenis, plant, color, kategori
    from vehicles
   where aktif = true or from_gate = true
   order by nopol;
$$;
revoke all on function get_active_vehicles_for_gate() from public;
grant execute on function get_active_vehicles_for_gate() to anon, authenticated;

-- ── B2. Daftar log gate publik: + kategori kendaraan ───────────────────────────────────────
drop function if exists get_gate_logs_public(date);
create function get_gate_logs_public(p_date date default current_date)
returns table (log_id uuid, vehicle_id uuid, nopol text, jenis text, color text, plant text, driver_name text, tujuan text,
               time_out timestamptz, time_in timestamptz, status text, created_at timestamptz, kategori text)
language sql stable security definer set search_path = public as $$
  select
    g.id, g.vehicle_id, v.nopol, v.jenis, v.color, g.plant,
    coalesce(g.driver_name_manual, d.nama, '-'),
    g.tujuan, g.time_out, g.time_in, g.status, g.created_at, v.kategori
  from vehicle_gate_logs g
  join vehicles v on v.id = g.vehicle_id
  left join drivers d on d.id = g.driver_id
  where g.created_at::date = p_date
  order by g.created_at desc;
$$;
revoke all on function get_gate_logs_public(date) from public;
grant execute on function get_gate_logs_public(date) to anon, authenticated;

-- ── B3. Input MANUAL untuk plat yang tidak terdaftar di Aset GA ─────────────────────────────
-- • Plat sudah ada di master kendaraan (format spasi/huruf besar-kecil apa pun) → memakai kendaraan itu.
-- • Belum ada → didaftarkan sebagai NON-ASET dari gate (aktif=false: tidak muncul di penugasan sampai GA memverifikasi),
--   lalu pencatatan keluar/masuk berjalan seperti biasa (open_gate_checkpoint).
-- • Anti-penyalahgunaan (fungsi ini publik seperti RPC gate lainnya): format plat divalidasi, panjang dibatasi,
--   maksimal 30 plat baru per jam.
create or replace function open_gate_checkpoint_manual(
  p_nopol text, p_jenis text, p_plant text,
  p_driver_id uuid, p_driver_name_manual text, p_tujuan text,
  p_timestamp timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_plat  text := upper(regexp_replace(btrim(coalesce(p_nopol, '')), '\s+', ' ', 'g'));
  v_norm  text := regexp_replace(v_plat, '[^A-Z0-9]', '', 'g');
  v_plant text := case when upper(coalesce(p_plant, '')) = 'PRB' then 'PRB' else 'CIK' end;
  v_id    uuid;
begin
  if v_plat !~ '^[A-Z0-9 -]{3,14}$' or v_norm !~ '[0-9]' or v_norm !~ '[A-Z]' then
    raise exception 'Plat nomor tidak valid (contoh: B 1234 ABC).';
  end if;

  select id into v_id from vehicles
   where regexp_replace(upper(nopol), '[^A-Z0-9]', '', 'g') = v_norm
   limit 1;

  if v_id is null then
    if (select count(*) from vehicles where from_gate and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Terlalu banyak plat baru dalam 1 jam — hubungi GA.';
    end if;
    insert into vehicles (nopol, jenis, plant, aktif, kategori, from_gate)
    values (v_plat, nullif(left(btrim(coalesce(p_jenis, '')), 40), ''), v_plant, false, 'non_asset', true)
    returning id into v_id;
  end if;

  perform open_gate_checkpoint(v_id, p_driver_id, nullif(left(btrim(coalesce(p_driver_name_manual, '')), 80), ''),
                               left(coalesce(p_tujuan, ''), 200), coalesce(p_timestamp, now()));
  return v_id;   -- id kendaraan (dipakai aplikasi untuk menyimpan keterangan)
end $$;
revoke all on function open_gate_checkpoint_manual(text, text, text, uuid, text, text, timestamptz) from public;
grant execute on function open_gate_checkpoint_manual(text, text, text, uuid, text, text, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';

-- Pemeriksaan
select kategori, from_gate, count(*) as jumlah from vehicles group by 1, 2 order by 1, 2;
