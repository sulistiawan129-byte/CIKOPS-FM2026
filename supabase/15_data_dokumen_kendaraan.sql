-- 15 — Data dokumen kendaraan (untuk Surat Kuasa STNK / KIR)
-- Menambah 4 kolom pada tabel vehicles. Tidak mengubah data yang ada. Aman dijalankan berulang kali.
--   jenis_kendaraan : jenis menurut STNK, mis. "Mobil Barang" / "Mobil Penumpang"
--   no_rangka       : nomor rangka (VIN)
--   no_mesin        : nomor mesin
--   no_uji          : nomor uji KIR, mis. JKT761681

alter table public.vehicles add column if not exists jenis_kendaraan text;
alter table public.vehicles add column if not exists no_rangka       text;
alter table public.vehicles add column if not exists no_mesin        text;
alter table public.vehicles add column if not exists no_uji          text;

-- ── Riwayat pembuatan Surat Kuasa ───────────────────────────────────────────────
-- Setiap surat yang berhasil dibuat dicatat. Isiannya (pemberi, penerima, kota, ruang kop) dipakai sebagai default surat berikutnya.
-- Hanya staf Fleet (Admin GA CIK / PRB, Master Admin) yang bisa melihat & menambah. Riwayat tidak bisa diubah/dihapus dari aplikasi.
create or replace function surat_kuasa_actor() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select full_name from profiles where id = auth.uid())), ''), 'Staf')
$$;
revoke all on function surat_kuasa_actor() from public, anon;
grant execute on function surat_kuasa_actor() to authenticated;

create table if not exists public.surat_kuasa_log (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  created_by       text not null default surat_kuasa_actor(),
  tipe             text not null check (tipe in ('stnk', 'kir')),
  tanggal          date not null,
  kota             text not null default '',
  vehicle_id       uuid references public.vehicles(id) on delete set null,
  nopol            text not null default '',
  merk             text not null default '',
  pemberi_nama     text not null default '',
  pemberi_jabatan  text not null default '',
  penerima_nama    text not null default '',
  penerima_alamat  text not null default '',
  data             jsonb not null default '{}'::jsonb      -- salinan lengkap isi surat (untuk "pakai lagi" & cetak ulang)
);
create index if not exists surat_kuasa_log_time_idx    on public.surat_kuasa_log (created_at desc);
create index if not exists surat_kuasa_log_vehicle_idx on public.surat_kuasa_log (vehicle_id, created_at desc);

alter table public.surat_kuasa_log enable row level security;
revoke all on public.surat_kuasa_log from anon;
revoke update, delete on public.surat_kuasa_log from authenticated;
drop policy if exists surat_kuasa_read on public.surat_kuasa_log;
drop policy if exists surat_kuasa_ins  on public.surat_kuasa_log;
create policy surat_kuasa_read on public.surat_kuasa_log for select to authenticated using (staff_can('fleet'));
create policy surat_kuasa_ins  on public.surat_kuasa_log for insert to authenticated with check (staff_can('fleet'));
