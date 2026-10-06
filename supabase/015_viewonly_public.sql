-- ═══════════════════════════════════════════════════════════════
-- 015 — Dashboard-ViewOnly (halaman /dashboard-viewonly, TANPA login)
--
-- Masalah: tanpa login, tabel tasks/drivers/vehicles tidak bisa dibaca
-- (RLS), sehingga halaman terlihat kosong. Solusi: SATU fungsi
-- SECURITY DEFINER yang hanya mengembalikan data ringkas & aman untuk
-- tampilan lihat-saja. Tabel tetap terkunci seperti sekarang.
--
-- Yang DIKEMBALIKAN : penugasan hari ini (tujuan, keperluan, status, jam),
--                     nama driver + plant + tipe, nopol/jenis kendaraan.
-- Yang TIDAK keluar : no. HP, email, PIN/password, alasan pembatalan,
--                     data klaim/overtime/dana, dan data apa pun di luar itu.
-- Aman dijalankan ulang (idempotent). Jalankan SESUDAH/BERSAMA 014.
-- ═══════════════════════════════════════════════════════════════

-- (idem dengan 014 — supaya 015 bisa berdiri sendiri)
alter table drivers add column if not exists driver_type text not null default 'operational';
alter table drivers add column if not exists assigned_user text;
alter table drivers add column if not exists assigned_user_title text;

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
begin
  select coalesce(jsonb_agg(to_jsonb(t) - 'cancel_reason' - 'cancelled_by' order by t.created_at desc), '[]'::jsonb)
    into v_tasks
    from tasks_detail t
   where t.tanggal = v_date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'nama', d.nama, 'aktif', d.aktif, 'plant', d.plant,
           'avatar_emoji', d.avatar_emoji,
           'driver_type', d.driver_type,
           'assigned_user', d.assigned_user,
           'assigned_user_title', d.assigned_user_title
         ) order by d.nama), '[]'::jsonb)
    into v_drivers
    from drivers d
   where d.aktif = true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'nopol', v.nopol, 'jenis', v.jenis, 'aktif', v.aktif, 'plant', v.plant
         ) order by v.nopol), '[]'::jsonb)
    into v_vehicles
    from vehicles v
   where v.aktif = true;

  return jsonb_build_object('date', v_date, 'tasks', v_tasks, 'drivers', v_drivers, 'vehicles', v_vehicles);
end;
$$;

revoke all on function get_viewonly_snapshot(date) from public;
grant execute on function get_viewonly_snapshot(date) to anon, authenticated;
