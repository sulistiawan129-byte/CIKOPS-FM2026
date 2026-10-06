-- ═══════════════════════════════════════════════════════════════
-- 016 — Dashboard-ViewOnly: data GATE dari log Security Gate
--
-- Gate = catatan petugas security (Armada → tab Gate / halaman /gate,
-- tabel vehicle_gate_logs), BUKAN turunan dari penugasan/status tugas.
-- Semantik log (plant = plant asal kendaraan):
--   plant CIK : dibuka saat kendaraan KELUAR plant (time_out), status OUT;
--               ditutup saat KEMBALI (time_in) → DONE.
--   plant PRB : dibuka saat kendaraan MASUK Cikarang (time_in), status IN;
--               ditutup saat KELUAR lagi (time_out) → DONE.
-- Snapshot memuat: log hari ini (WIB) + log yang masih aktif (belum DONE).
-- Tidak ada data sensitif (hanya nopol, jenis, nama driver, tujuan, jam).
-- Menggantikan fungsi dari 015 (idempotent). Jalankan SESUDAH 014 & 015.
-- ═══════════════════════════════════════════════════════════════

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
           'plant', g.plant, 'tujuan', g.tujuan,
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
