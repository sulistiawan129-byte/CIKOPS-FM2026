-- ═══════════════════════════════════════════════════════════════
-- 020 — Penugasan: jam tugas maksimal 17.00 WIB, auto-selesai
--
-- • tasks.auto_completed : penanda tugas yang ditutup otomatis oleh sistem.
-- • auto_complete_tasks() : menutup semua tugas berstatus ASSIGNED atau
--     ON GOING yang batas waktunya (tanggal tugas pukul 17.00 WIB) sudah
--     lewat. Status jadi DONE, completed_at = pukul 17.00 WIB tanggal tugas
--     (atau jam diterima, bila driver baru menerima setelah 17.00).
--     Tugas DIBATALKAN dan yang sudah SELESAI tidak disentuh.
--     Mengembalikan jumlah tugas yang ditutup.
-- • Jadwal pg_cron setiap hari 17.00 WIB (= 10.00 UTC).
--     Bila pg_cron belum aktif, aktifkan dulu: Supabase Dashboard ->
--     Database -> Extensions -> pg_cron, lalu jalankan ulang file ini.
--     Aplikasi juga memanggil fungsi ini saat memuat tugas sebagai cadangan.
-- Catatan: tugas lama (hari-hari sebelumnya) yang masih menggantung akan
-- ikut ditutup saat fungsi pertama kali berjalan.
-- Idempotent. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

alter table tasks add column if not exists auto_completed boolean not null default false;

create or replace function auto_complete_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with closed as (
    update tasks t
       set status = 'DONE',
           completed_at = greatest(
             (t.tanggal::timestamp + time '17:00') at time zone 'Asia/Jakarta',
             coalesce(t.accepted_at, (t.tanggal::timestamp + time '17:00') at time zone 'Asia/Jakarta')
           ),
           auto_completed = true
     where t.status in ('ASSIGNED', 'ON GOING')
       and ((t.tanggal::timestamp + time '17:00') at time zone 'Asia/Jakarta') <= now()
    returning 1
  )
  select count(*) into v_count from closed;
  return v_count;
end;
$$;

revoke all on function auto_complete_tasks() from public;
grant execute on function auto_complete_tasks() to authenticated;

-- Jadwal harian 17.00 WIB (10.00 UTC). Dilewati dengan pesan bila pg_cron belum tersedia.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron belum bisa diaktifkan dari SQL (%). Aktifkan lewat Dashboard -> Database -> Extensions, lalu jalankan ulang file ini.', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('auto-complete-tasks-1700');
  exception when others then
    null; -- belum pernah dijadwalkan
  end;
  perform cron.schedule('auto-complete-tasks-1700', '0 10 * * *', 'select public.auto_complete_tasks();');
  raise notice 'Jadwal auto-selesai 17.00 WIB aktif.';
end;
$$;

-- Tutup sekarang tugas yang sudah lewat batas.
select auto_complete_tasks() as tugas_ditutup_sekarang;
