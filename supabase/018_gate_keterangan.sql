-- ═══════════════════════════════════════════════════════════════
-- 018 — Gate: kolom KETERANGAN (keperluan / catatan) pada log gate
--
-- • vehicle_gate_logs.keterangan : isi kolom "Keperluan / Catatan" di form /gate.
-- • set_gate_keterangan(vehicle, teks) : dipanggil sesudah open_gate_checkpoint,
--     mengisi log aktif terbaru milik kendaraan itu (RPC lama tidak diubah).
-- • get_gate_keterangan(ids[]) : dipakai halaman publik /gate untuk menggabungkan
--     keterangan ke daftar (get_gate_logs_public lama tidak diubah).
-- • get_viewonly_snapshot : gate kini memuat 'keterangan' (menggantikan 016).
-- Idempotent. Jalankan SESUDAH 016.
-- ═══════════════════════════════════════════════════════════════

alter table vehicle_gate_logs add column if not exists keterangan text;

create or replace function set_gate_keterangan(p_vehicle_id uuid, p_keterangan text)
returns void
language sql
security definer
set search_path = public
as $$
  update vehicle_gate_logs
     set keterangan = nullif(btrim(p_keterangan), '')
   where id = (
     select id from vehicle_gate_logs
      where vehicle_id = p_vehicle_id and status <> 'DONE'
      order by created_at desc limit 1
   );
$$;

create or replace function get_gate_keterangan(p_ids uuid[])
returns table(id uuid, keterangan text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.keterangan from vehicle_gate_logs g
   where g.id = any(p_ids) and g.keterangan is not null;
$$;

revoke all on function set_gate_keterangan(uuid, text) from public;
revoke all on function get_gate_keterangan(uuid[]) from public;
grant execute on function set_gate_keterangan(uuid, text) to anon, authenticated;
grant execute on function get_gate_keterangan(uuid[]) to anon, authenticated;

create or replace function get_viewonly_snapshot(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_tasks jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
  v_gate jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) - 'cancel_reason' - 'cancelled_by' order by t.created_at desc), '[]'::jsonb)
    into v_tasks from tasks_detail t where t.tanggal = v_date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'nama', d.nama, 'aktif', d.aktif, 'plant', d.plant,
           'avatar_emoji', d.avatar_emoji, 'driver_type', d.driver_type,
           'assigned_user', d.assigned_user, 'assigned_user_title', d.assigned_user_title
         ) order by d.nama), '[]'::jsonb)
    into v_drivers from drivers d where d.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'nopol', v.nopol, 'jenis', v.jenis, 'aktif', v.aktif, 'plant', v.plant
         ) order by v.nopol), '[]'::jsonb)
    into v_vehicles from vehicles v where v.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'nopol', ve.nopol, 'jenis', ve.jenis,
           'driver_name', coalesce(nullif(g.driver_name_manual, ''), dr.nama, '-'),
           'plant', g.plant, 'tujuan', g.tujuan, 'keterangan', g.keterangan,
           'time_out', g.time_out, 'time_in', g.time_in,
           'status', g.status, 'created_at', g.created_at
         ) order by g.created_at desc), '[]'::jsonb)
    into v_gate
    from vehicle_gate_logs g
    left join vehicles ve on ve.id = g.vehicle_id
    left join drivers dr on dr.id = g.driver_id
   where g.status <> 'DONE'
      or (g.created_at at time zone 'Asia/Jakarta')::date = v_date
      or (g.time_out at time zone 'Asia/Jakarta')::date = v_date
      or (g.time_in at time zone 'Asia/Jakarta')::date = v_date;

  return jsonb_build_object('date', v_date, 'tasks', v_tasks, 'drivers', v_drivers,
                            'vehicles', v_vehicles, 'gate', v_gate);
end;
$$;

revoke all on function get_viewonly_snapshot(date) from public;
grant execute on function get_viewonly_snapshot(date) to anon, authenticated;
