-- ============================================================================
-- 13 — HAPUS DATA KARYAWAN DARI SUPABASE
--
-- Keputusan: CIKOPS tidak lagi menyimpan master/daftar karyawan. Nama + departemen
-- diketik manual di tiap form; saran nama diambil dari RIWAYAT modul itu sendiri.
-- Modul Pembagian (Gift) dan Kunci Loker Karyawan dihapus. ATK hanya menerima laporan.
--
-- YANG DIHAPUS (permanen):   employees, atk_employees, gift_*, locker_keys, locker_key_logs
-- YANG DIPERTAHANKAN:        semua yang sudah masuk laporan/riwayat — penugasan, klaim, ATK
--                            (transaksi), TGA, ID Card, Receptionist, dst. Data driver & teknisi TGA tidak disentuh.
--
-- URUTAN WAJIB
--   1. Backup dulu (GitHub Actions "Backup database" → Run workflow, atau ekspor CSV dari Table Editor).
--   2. Deploy versi aplikasi terbaru (yang tidak lagi membaca tabel di atas).
--   3. Jalankan file ini: BAGIAN A (pratinjau) → B (fungsi) → C (penghapusan) → E (verifikasi).
--   Menjalankan BAGIAN C SEBELUM deploy akan merusak aplikasi versi lama.
--
-- CATATAN
--   • BAGIAN C tidak bisa dibatalkan. Backup lama (artifact 30 hari) masih memuat data ini sampai kedaluwarsa.
--   • BAGIAN D (opsional, dalam komentar): mengosongkan NIK pada transaksi ATK yang sudah tercatat.
--   • Idempoten — aman dijalankan ulang.
-- ============================================================================


-- ═══ BAGIAN A — PRATINJAU (hanya membaca; tidak mengubah apa pun) ═══════════
-- Jumlah baris per tabel. "tidak ada" = tabel sudah tidak ada (mis. file ini pernah dijalankan).
select t.tabel, t.nasib,
       case when to_regclass('public.' || t.tabel) is null then 'tidak ada'
            else (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tabel), false, true, '')))[1]::text
       end as baris
  from (values
    ('employees',           'DIHAPUS'),
    ('atk_employees',       'DIHAPUS'),
    ('gift_events',         'DIHAPUS'),
    ('gift_registrations',  'DIHAPUS'),
    ('locker_keys',         'DIHAPUS'),
    ('locker_key_logs',     'DIHAPUS'),
    ('tasks',               'dipertahankan'),
    ('atk_requests',        'dipertahankan'),
    ('atk_restocks',        'dipertahankan'),
    ('tga_activities',      'dipertahankan'),
    ('idcard_requests',     'dipertahankan'),
    ('rcp_visitors',        'dipertahankan')
  ) as t(tabel, nasib);


-- ═══ BAGIAN B — FUNGSI (aman dijalankan kapan saja setelah deploy) ══════════

-- B1) Aplikasi teknisi TGA: saran requestor = RIWAYAT kegiatan TGA (bukan daftar karyawan).
--     Bentuk hasil sama seperti dulu, tetapi tanpa id/NIK/jabatan.
create or replace function tga_requestors(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform tga_user_of(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('nama', x.nama, 'dept', x.dept) order by x.nama)
      from (
        select distinct on (lower(btrim(a.request_by))) btrim(a.request_by) as nama, coalesce(btrim(a.departemen), '') as dept
          from (select request_by, departemen, created_at from tga_activities order by created_at desc limit 1500) a
         where coalesce(btrim(a.request_by), '') <> ''
         order by lower(btrim(a.request_by)), a.created_at desc
      ) x
  ), '[]'::jsonb);
end $$;
revoke all on function tga_requestors(text) from public;
grant execute on function tga_requestors(text) to anon, authenticated;

-- B2) Form publik /tugas-tga: daftar saran requestor juga dari riwayat (bukan daftar karyawan).
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
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object('nama', x.nama, 'dept', x.dept) order by x.nama)
        from (
          select distinct on (lower(btrim(a.request_by))) btrim(a.request_by) as nama, coalesce(btrim(a.departemen), '') as dept
            from (select request_by, departemen, created_at from tga_activities order by created_at desc limit 1500) a
           where coalesce(btrim(a.request_by), '') <> ''
           order by lower(btrim(a.request_by)), a.created_at desc
        ) x
    ), '[]'::jsonb));
end $$;
revoke all on function tga_assign_public_info(text) from public;
grant execute on function tga_assign_public_info(text) to anon, authenticated;

-- B3) ATK hanya menerima laporan: tutup semua RPC input dari aplikasi (permintaan, restock, barang baru,
--     stok minimum, pembatalan). Sinkron dari Excel (atk_excel_*) tetap jalan.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'atk\_web\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- B4) Excel ATK tidak lagi boleh mengirim daftar karyawan (makro SyncKaryawanOnly sudah dinonaktifkan).
create or replace function atk_excel_push_employee(p_key text, p_row jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  return 'dinonaktifkan';
end $$;

notify pgrst, 'reload schema';


-- ═══ BAGIAN C — PENGHAPUSAN PERMANEN (tidak bisa dibatalkan) ════════════════
-- Jalankan HANYA setelah backup dan setelah aplikasi terbaru ter-deploy.
begin;

-- C1) Modul Pembagian (Gift): tabel + fungsi
drop table if exists gift_verify_attempts, gift_registrations, gift_events cascade;

-- C2) Modul Kunci Loker Karyawan: tabel + fungsi (locker_key_*)
drop table if exists locker_key_logs, locker_keys cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like '%gift%' or p.proname like 'locker\_key%'
            or p.proname in ('employees_dedupe', 'get_employee_by_nik'))
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- C3) Master karyawan: kosongkan isi dan tutup akses dari aplikasi.
--     tga_activities.requestor_id otomatis menjadi NULL (FK on delete set null);
--     nama requestor yang sudah tercatat di riwayat TETAP ada.
do $$
begin
  if to_regclass('public.employees') is not null then
    delete from employees;
    revoke all on employees from anon, authenticated;
  end if;
  if to_regclass('public.atk_employees') is not null then
    delete from atk_employees;
    revoke all on atk_employees from anon, authenticated;
  end if;
end $$;

commit;


-- ═══ BAGIAN D — OPSIONAL: kosongkan NIK pada transaksi ATK yang sudah tercatat ═
-- Secara bawaan data laporan dipertahankan apa adanya (termasuk kolom NIK pada transaksi ATK
-- yang dulu dikirim dari Excel). Buka komentar di bawah bila NIK di laporan ATK juga ingin dihapus.
-- begin;
--   update atk_requests set nik = '' where coalesce(nik, '') <> '';
--   update atk_restocks set nik = '' where coalesce(nik, '') <> '';
-- commit;


-- ═══ BAGIAN E — VERIFIKASI ══════════════════════════════════════════════════
select 'employees (harus 0 / tidak ada)' as cek,
       case when to_regclass('public.employees') is null then 'tabel tidak ada'
            else (select count(*)::text from public.employees) end as hasil
union all select 'atk_employees (harus 0 / tidak ada)',
       case when to_regclass('public.atk_employees') is null then 'tabel tidak ada'
            else (select count(*)::text from public.atk_employees) end
union all select 'tabel gift (harus 0)',         (select count(*)::text from pg_tables where schemaname = 'public' and tablename like 'gift\_%')
union all select 'tabel locker_key (harus 0)',   (select count(*)::text from pg_tables where schemaname = 'public' and tablename like 'locker\_key%')
union all select 'fungsi atk_web_* terbuka (harus 0)', (select count(*)::text
                                                          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                                         where n.nspname = 'public' and p.proname like 'atk\_web\_%'
                                                           and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')));
