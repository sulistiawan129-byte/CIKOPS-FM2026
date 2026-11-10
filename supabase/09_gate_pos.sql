-- ═════════════════════════════════════════════════
-- 09_GATE_POS — daftar log gate untuk aplikasi petugas Security Desk (/pos/kendaraan).
--   • Hari mengikuti WIB (get_gate_logs_public memakai tanggal UTC: catatan pukul 00.00–07.00 WIB jatuh ke "kemarin").
--   • Kendaraan yang MASIH AKTIF (belum kembali / belum keluar) dari hari-hari sebelumnya ikut tampil,
--     supaya petugas selalu bisa menutupnya.
-- Jalankan di Supabase SQL Editor CIKOPS. Idempotent. get_gate_logs_public TIDAK diubah.
-- ═════════════════════════════════════════════════
create or replace function get_gate_logs_pos(p_date date default (now() at time zone 'Asia/Jakarta')::date)
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
  where (g.created_at at time zone 'Asia/Jakarta')::date = p_date
     or g.status <> 'DONE'
  order by g.created_at desc;
$$;
revoke all on function get_gate_logs_pos(date) from public;
grant execute on function get_gate_logs_pos(date) to anon, authenticated;

notify pgrst, 'reload schema';
select 'ok' as cek, count(*) as log_aktif from vehicle_gate_logs where status <> 'DONE';
