-- ═══════════════════════════════════════════════════════════════
-- AUDIT KEAMANAN — HANYA MEMBACA, tidak mengubah apa pun.
-- Jalankan di Supabase CIKOPS → SQL Editor. Setiap bagian menghasilkan
-- satu tabel; kirim hasil yang ditandai "PERLU DICEK" untuk ditindaklanjuti.
-- ═══════════════════════════════════════════════════════════════

-- 1) Tabel di schema public: RLS aktif? + jumlah policy + hak anon
select c.relname as tabel,
       c.relrowsecurity as rls_aktif,
       c.relforcerowsecurity as rls_paksa,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as jml_policy,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('anon', c.oid, 'insert') as anon_insert,
       has_table_privilege('anon', c.oid, 'update') as anon_update,
       has_table_privilege('anon', c.oid, 'delete') as anon_delete,
       case
         when not c.relrowsecurity and has_table_privilege('anon', c.oid, 'select') then 'PERLU DICEK: RLS mati, anon bisa baca semua'
         when not c.relrowsecurity then 'PERLU DICEK: RLS mati'
         when (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) = 0 then 'ok: RLS aktif tanpa policy (hanya lewat fungsi)'
         else 'ok'
       end as status
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
 order by c.relrowsecurity, c.relname;

-- 2) Policy yang membuka akses ke anon / public (tanpa login)
select tablename as tabel, policyname as policy, cmd as perintah, roles, permissive,
       qual as using_expr, with_check,
       'PERLU DICEK: bisa diakses tanpa login' as status
  from pg_policies
 where schemaname = 'public' and (roles && array['anon', 'public']::name[])
 order by tablename, cmd;

-- 3) Policy "authenticated" yang longgar (true / auth.role()) — berlaku juga untuk akun driver & TGA
select tablename as tabel, policyname as policy, cmd as perintah, qual as using_expr, with_check
  from pg_policies
 where schemaname = 'public' and roles && array['authenticated']::name[] and permissive = 'PERMISSIVE'
   and (coalesce(qual, '') in ('true', '(auth.role() = ''authenticated''::text)')
        or coalesce(with_check, '') in ('true', '(auth.role() = ''authenticated''::text)'))
 order by tablename, cmd;

-- 4) Fungsi SECURITY DEFINER yang bisa dipanggil TANPA LOGIN (anon) lewat /rest/v1/rpc
select p.proname as fungsi, pg_get_function_identity_arguments(p.oid) as argumen,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_bisa,
       has_function_privilege('authenticated', p.oid, 'execute') as login_bisa,
       case when p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
            then 'PERLU DICEK: melewati RLS & bisa dipanggil tanpa login' else 'ok' end as status
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- bukan fungsi extension
 order by (p.prosecdef and has_function_privilege('anon', p.oid, 'execute')) desc, p.proname;

-- 5) View: berjalan dengan hak pemilik (melewati RLS) kecuali security_invoker
select c.relname as view_name,
       coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') as security_invoker,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('authenticated', c.oid, 'select') as login_select,
       case when coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') <> 'true'
            then 'PERLU DICEK: view melewati RLS tabel asal' else 'ok' end as status
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v', 'm')
 order by c.relname;

-- 6) Bucket Storage publik (file bisa dibuka tanpa login)
select id as bucket, public as publik from storage.buckets order by id;

-- 7) Isi fungsi yang dipakai halaman tanpa login tetapi TIDAK ada di repo
--    (gate, locker, gift, login driver). Kirim hasilnya untuk ditinjau.
select p.proname as fungsi, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_bisa,
       pg_get_functiondef(p.oid) as definisi
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in (
   'get_active_drivers_for_gate', 'get_active_vehicles_for_gate', 'get_gate_logs_public', 'open_gate_checkpoint',
   'close_gate_checkpoint', 'register_locker', 'verify_locker_release', 'release_locker_by_user',
   'get_locker_by_confirm_token', 'confirm_locker_answer', 'get_employee_by_nik', 'generate_unique_locker_pin',
   'admin_release_locker', 'start_bulk_confirmation', 'get_confirmation_recipient_count',
   'find_gift_registration_by_nik', 'find_gift_registrations_by_name', 'find_gift_registration_by_sequence_no',
   'claim_gift_registration', 'get_printer_locations_public', 'get_driver_by_email', 'get_claims_by_driver',
   'create_task_batch', 'delete_task_batch', 'admin_update_task_status', 'admin_cancel_task')
 order by 1;

-- 8) Akun DRIVER yang punya profil staf (seharusnya 0 baris)
select u.email, p.role, 'PERLU DICEK: driver punya akses staf' as status
  from profiles p join auth.users u on u.id = p.id
  join drivers d on lower(d.email) = lower(u.email)
 order by 1;

-- 9) Trigger pada auth.users (trigger lama memberi role 'ga' ke setiap akun baru)
select tgname as trigger_name, pg_get_triggerdef(t.oid) as definisi
  from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
