# Cleaning & Gardening — CIKOPS jadi sumber utama, Excel mengikuti

Mulai versi ini, data Cleaning & Gardening **diinput di CIKOPS**. File Excel
(ISS GA System) hanya **menarik** data dari CIKOPS dan menulis ulang sheet-nya
persis mengikuti template CIKOPS. Laporan Bulanan, Plan vs Actual dan
Dashboard di Excel tetap dibuat oleh `modGA` seperti biasa.

| Yang diinput di CIKOPS | Ditarik ke sheet Excel |
|---|---|
| Master pekerjaan & jadwal hari | `DB_PEKERJAAN` (A..M) |
| Manpower | `DB_MANPOWER` (A..G) |
| Plan otomatis + checklist actual harian | `DATA_PLAN_ACTUAL` (A..P) |
| Event | `EVENT` (A..F) |
| Improvement | `IMPROVEMENT` (A..H) |
| Inventory | `INVENTORY` (A..H) |
| TGA (dari aplikasi TGA) | `TGA` (A..D) |

## Langkah pemasangan (sekali saja)

1. **Supabase → SQL Editor**: jalankan `supabase/038_ga_cikops_master.sql`.
2. **CIKOPS → Fasilitas → Cleaning & Gardening → tab "Excel"**: pastikan data
   Excel terakhir sudah masuk (Sinkron dari Excel versi 1), lalu klik
   **"Jadikan CIKOPS sumber utama"** (khusus admin).
   Setelah ini kiriman dari Excel versi 1 ditolak supaya data tidak bentrok.
3. **Excel**: ganti modul sinkron dengan versi 2.
   - Unduh `modSyncGA_v2.bas` dari tab Excel di CIKOPS
     (atau dari repo: `vba/ga/modSyncGA_v2.bas`).
   - `Alt+F11` → klik kanan `modSyncGA` → **Remove** → pilih *No* (tidak perlu export).
   - **File → Import File** → pilih `modSyncGA_v2.bas`. Nama modul tetap `modSyncGA`.
   - Isi 3 konstanta di atas modul (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `GA_SYNC_KEY`), sama seperti versi 1.
   - `modGA` **tidak perlu** diganti.
   - Simpan file (`.xlsm`).

## Pemakaian harian

- **Supervisor**: buka CIKOPS → Cleaning & Gardening → **Checklist harian**,
  tandai ✓ / ✕ per pekerjaan lalu **Simpan**. Kosong dihitung dikerjakan.
- **Admin**: tab **Master & jadwal** untuk tambah/ubah pekerjaan (maks 4 hari),
  manpower, serta tombol **Generate plan** / **Perbarui plan** per bulan.
  Simpan pekerjaan otomatis memperbarui plan bulan berjalan mulai hari ini.
- **Event / Improvement / Inventory**: tambah & ubah langsung di tab masing-masing.
- **Excel**: tombol **Sinkron CIKOPS** di MENU →
  - *Yes* = jadwal 6 bulan terakhir s/d bulan depan (cepat),
  - *No* = semua jadwal.
  Excel juga menarik otomatis 20 detik setelah dibuka, lalu tiap 10 menit.

> Perubahan yang diketik langsung di Excel **akan ditimpa** saat tarik
> berikutnya. Selalu ubah datanya di CIKOPS.

## Kembali ke mode Excel

Admin bisa mengembalikan mode di tab Excel CIKOPS ("Kembali ke mode Excel"),
lalu pasang lagi `modSyncGA.bas` versi 1 di Excel.
