-- ═══════════════════════════════════════════════════════════════
-- 019 — Klaim: izinkan EDIT (perbaikan salah input) dari dashboard
--
-- Sebelumnya tabel claims hanya punya policy SELECT, INSERT, dan DELETE,
-- sehingga UPDATE dari dashboard ditolak diam-diam (0 baris berubah).
-- Policy ini mengizinkan pengguna yang login (admin dashboard) mengubah klaim.
-- Idempotent. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "claims_update_authenticated" on claims;
create policy "claims_update_authenticated" on claims
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
