# V2.26 — Kode lengkap CIKOPS (timpa seluruh isi repo)

Zip ini berisi **seluruh kode** CIKOPS. Extract, salin ke folder repo (timpa semua), lalu commit dan push.
Tidak ada library baru, jadi `npm install` tidak perlu.

## Isi baru: menu **Cleaning & Gardening** (Fasilitas)
Modul laporan ISS General Affairs: Cleaning Service, Gardener dan TGA (Teknisi GA).
Data diinput SPV di Excel **ISS GA System**, lalu disinkron **satu arah** ke CIKOPS. CIKOPS hanya menampilkan laporan.

- **Dashboard**:
  - KPI: Achievement (target 100%), Plan, Dikerjakan, Tidak dikerjakan, Belum diinput, dan Kepatuhan input SPV.
  - Achievement per minggu, per tim, tren 6 bulan, per lokasi dan per tipe (terendah dulu).
  - Daftar pekerjaan yang tidak dikerjakan, rekap kegiatan, dan input actual per SPV.
- **Plan vs Actual**: matriks mingguan pekerjaan × hari (✓ / ✕ / belum diinput / terjadwal). Bisa difilter dan diekspor Excel/PDF/CSV.
- **TGA**: aktivitas per teknisi dan pemohon terbanyak, dengan tabel dan export.
- **Event, Improvement, Inventory**: tabel dengan pencarian dan export. Foto tetap di folder Dokumentasi PC SPV; CIKOPS hanya menampilkan nama filenya.
- **Sinkron Excel**: status sinkron terakhir, unduhan modul VBA, dan kunci sinkron (khusus admin, bisa diganti).
- **Laporan Manajemen** punya modul baru **Cleaning, Gardening & TGA**: KPI, tren achievement 13 bulan, per lokasi/tim, TGA per teknisi, temuan dan tindakan. Modul ini ikut di Excel/PDF/PowerPoint.

Rumus achievement = dikerjakan ÷ jadwal yang sudah jatuh tempo. Untuk bulan yang sudah lewat, hasilnya sama persis dengan Laporan Bulanan Excel. Untuk bulan berjalan, angkanya tidak turun hanya karena masih ada jadwal yang belum tiba.

## Langkah pasang (sekali saja)
1. **Supabase** → SQL Editor → jalankan `supabase/027_ga_facility.sql` (aman diulang). Baris paling bawah hasilnya menampilkan **KUNCI SINKRON GA**; salin kunci itu.
2. **Excel ISS GA System** (minimal di PC SPV):
   1. Tekan Alt+F11, lalu **hapus modul `modGA` lama**.
   2. Import `vba/ga/modGA.bas` (v1.7) dan `vba/ga/modSyncGA.bas`. Keduanya juga bisa diunduh dari menu Cleaning & Gardening → Sinkron Excel.
   3. Di `modSyncGA`, isi `SUPABASE_URL`, `SUPABASE_ANON_KEY` (sama dengan yang dipakai modul ATK), dan `GA_SYNC_KEY` (kunci dari langkah 1).
   4. Jalankan macro **`Setup_Tombol`** sekali. Macro ini membuat sheet **TGA** (Tanggal, Nama TGA, Activity, Request By), tombol **SINKRON CIKOPS**, dan tombol TGA di MENU.
   5. Di **DB_MANPOWER**, isi nama teknisi dengan Tim = `TGA` supaya muncul di dropdown Nama TGA.
   6. Klik **SINKRON CIKOPS** → **No** (kirim semua periode) untuk sinkron pertama.

## Cara kerja sinkron
- **Otomatis**: setiap Simpan Actual, Generate Plan, atau Hapus Plan langsung mengirim data ke CIKOPS.
- **Offline**: data masuk antrean di sheet tersembunyi `GA_SYNC`, lalu dicoba ulang tiap 10 menit selama file terbuka dan saat file dibuka lagi. Label status sinkron tampil di MENU.
- **Manual**: tombol **SINKRON CIKOPS**. Yes = bulan ini dan bulan lalu; No = semua periode. Master dan log (Event, Improvement, Inventory, TGA) selalu ikut.
- **Beberapa PC**: actual dari salinan file yang lebih lama tidak menimpa actual yang lebih baru, karena yang menang adalah waktu input terbaru. Untuk membatasi PC yang boleh sinkron, isi nama komputer di `GA_SYNC!B7` (pisahkan dengan koma).
- No HP manpower **tidak** dikirim ke CIKOPS.
