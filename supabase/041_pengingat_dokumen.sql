-- ═══════════════════════════════════════════════════════════════
-- 041 — Pengingat dokumen kendaraan (KIR, servis berkala, STNK)
--
-- Edge Function vehicle-document-reminder mengirim email ke manager_email
-- (Master Data → Pengaturan) saat dokumen tinggal 30 / 14 / 7 / 3 / 1 hari
-- atau sudah lewat. Tabel ini mencatat pengingat yang sudah terkirim supaya
-- email yang sama tidak dikirim ulang setiap hari.
--
-- Jadwal: Dashboard Supabase → Integrations → Cron → Create job →
--   tipe "Supabase Edge Function", function vehicle-document-reminder,
--   jadwal "0 0 * * *" (07.00 WIB), header Authorization: Bearer <service_role key>.
-- Idempotent — aman diulang.
-- ═══════════════════════════════════════════════════════════════

create table if not exists vehicle_doc_notifications (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null,
  doc_type   text not null check (doc_type in ('kir', 'service', 'stnk')),
  threshold  text not null,
  doc_date   date not null,
  sent_at    timestamptz not null default now(),
  unique (vehicle_id, doc_type, threshold, doc_date)
);

-- hanya Edge Function (service role) yang menulis; staf boleh melihat riwayatnya
alter table vehicle_doc_notifications enable row level security;
revoke all on vehicle_doc_notifications from anon;
drop policy if exists staff_read on vehicle_doc_notifications;
create policy staff_read on vehicle_doc_notifications for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid()));

notify pgrst, 'reload schema';
