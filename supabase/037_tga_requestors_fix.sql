-- ═══════════════════════════════════════════════════════════════
-- 037 — PERBAIKAN: daftar requestor (Data Karyawan) kosong di aplikasi TGA
--
-- Penyebab: tga_requestors ditandai STABLE. API Supabase (PostgREST)
-- menjalankan fungsi STABLE dalam transaksi READ ONLY, padahal pengecekan
-- sesi (tga_user_of) ikut memperpanjang sesi (UPDATE) → selalu gagal
-- "cannot execute UPDATE in a read-only transaction" → aplikasi menerima
-- daftar kosong.
--
-- Sumber data tetap tabel employees yang SAMA dengan dashboard utama,
-- driver, dan receptionist — tidak ada data yang perlu diisi ulang.
-- Idempotent — aman dijalankan ulang (setelah 034/035).
-- ═══════════════════════════════════════════════════════════════

create or replace function tga_requestors(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform tga_user_of(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nama', e.nama, 'dept', coalesce(e.departement, ''),
      'nik', coalesce(e.nik, ''), 'jabatan', coalesce(to_jsonb(e) ->> 'jabatan', '')) order by e.nama)
    from employees e
   where coalesce(trim(e.nama), '') <> '' and coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb);
end $$;
revoke all on function tga_requestors(text) from public;
grant execute on function tga_requestors(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Cek: harus 'v' (volatile) dan jumlah karyawan aktif
select 'volatilitas tga_requestors' as cek, provolatile::text as hasil from pg_proc where proname = 'tga_requestors'
union all select 'karyawan aktif', count(*)::text from employees e where coalesce((to_jsonb(e) ->> 'aktif')::boolean, true);
