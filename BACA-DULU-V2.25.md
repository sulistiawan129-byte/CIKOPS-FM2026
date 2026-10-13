# V2.25 — Kode lengkap CIKOPS (timpa seluruh isi repo)

Zip ini berisi **seluruh kode** CIKOPS. Extract, salin ke folder repo (timpa semua), lalu commit dan push.

Folder `node_modules` dan `.next` sengaja tidak ikut. `npm install` tidak perlu, karena tidak ada library baru.

## SQL yang perlu dijalankan di Supabase (kalau belum)
Jalankan berurutan, cukup sekali. Semuanya aman diulang.
1. `supabase/021_security.sql`, `022_…`, `023_…` — modul Security (kalau belum dari V2.24)
2. `supabase/024_claims_impor_jan_jun_2026.sql` — impor klaim Jan–Jun 2026 (kalau belum)
3. `supabase/025_kalender_agenda.sql` — Kalender & Agenda
4. `supabase/026_atk_dua_arah.sql` — ATK dua arah. Hasil paling bawahnya menampilkan **kunci sinkron** untuk VBA.

## Isi sejak V2.24
- **URL per menu**: `/dashboard/claims`, `/dashboard/security`, dst. Tombol Back/Forward browser ikut berfungsi.
- **PowerPoint laporan manajemen** memakai gaya dashboard, dengan warna kontras tinggi.
- **Kalender & Agenda** (`/dashboard/calendar` dan widget Home):
  - Agenda bisa ditambah, diubah, dan dihapus. Jenisnya: kunjungan, event, meeting, pelatihan, libur, lainnya.
  - Penugasan driver muncul otomatis di kalender, dan agenda bisa ditautkan ke penugasan. Detail: `BACA-DULU-KALENDER.md`.
- **ATK & Supplies baru**: dashboard interaktif, form permintaan, restock, dan barang baru, stok, riwayat, serta sinkron **dua arah** dengan Excel/VBA. Detail: `BACA-DULU-ATK.md`.
  - Perbarui modul VBA di Excel dengan `vba/modSyncCikops.bas`, lalu isi `CIKOPS_SYNC_KEY`.
