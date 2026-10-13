# ATK & Supplies — tampilan baru + sinkron dua arah dengan Excel/VBA

## Wajib, urut
1. **Supabase → SQL Editor** → jalankan `supabase/026_atk_dua_arah.sql`.
   - Aman dijalankan ulang, dan data lama tidak berubah.
   - Baris paling bawah hasilnya menampilkan **KUNCI SINKRON**. Kunci ini juga bisa dilihat admin di CIKOPS → ATK → tab *Sinkron Excel*.
2. **Excel ATK**:
   - Alt+F11 → hapus modul `modSyncCikops` yang lama → File → Import File → pilih `vba/modSyncCikops.bas`. File yang sama bisa diunduh dari tab *Sinkron Excel*.
   - Isi 3 konstanta: `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (sama seperti dulu), lalu `CIKOPS_SYNC_KEY`.
   - Tombol Sinkron yang lama (`SyncToCikops`) sekarang otomatis **tarik dulu, lalu kirim**.
   - Opsional: buat tombol baru untuk macro `TarikDariCikops`.
3. Upload file kode ke repo → commit → push (Vercel deploy otomatis).

## Cara kerja sinkron
| Arah | Caranya | Isi |
|---|---|---|
| Excel → CIKOPS | tombol Sinkron di Excel (seperti dulu) | stok MasterBarang, TransaksiPermintaan, Restock |
| CIKOPS → Excel | `SyncToCikops` / `TarikDariCikops` | permintaan, restock, dan barang baru yang diinput di CIKOPS |

- **Input di CIKOPS**:
  - Stok di database langsung berubah. Permintaan ditolak kalau stok tidak cukup.
  - Nomor transaksi memakai format yang sama dengan Excel (`REQ-yyyymmddHHMMSS-Wxx` / `UPD-...-Wxx`). Akhiran `-W` menandai input dari web.
- **Saat ditarik ke Excel**:
  - Baris ditambahkan ke sheet TransaksiPermintaan / TransaksiUpdateBarang (kolom Synced langsung TRUE, jadi tidak dikirim balik).
  - Stok MasterBarang ikut dikurangi/ditambah, dan barang baru masuk ke MasterBarang.
  - Baris yang sudah ada dilewati, jadi aman kalau tombol ditekan berkali-kali.
- **Stok tidak saling menimpa**:
  - Stok yang dikirim Excel otomatis dikoreksi dengan transaksi CIKOPS yang belum ditarik.
  - Ini sudah berlaku begitu SQL 026 dijalankan, walaupun VBA belum diganti. Hanya saja, sebelum VBA diganti, Excel tidak akan tahu transaksi dari CIKOPS.
- **Koreksi**:
  - Transaksi CIKOPS bisa **dibatalkan** dari tab Riwayat selama belum ditarik Excel.
  - Setelah ditarik, koreksinya dilakukan di Excel.
- **Keamanan**: menarik data butuh kunci sinkron, karena anon key saja tidak bisa membaca data karyawan. Admin bisa *Ganti kunci* kapan saja.

## Tampilan baru (menu Fasilitas → ATK)
- **Dashboard**:
  - KPI dengan perbandingan ke periode sebelumnya: barang keluar, permintaan, restock masuk, barang yang perlu restock.
  - Grafik arus barang keluar/masuk.
  - Donut per departemen dan daftar barang paling banyak diminta. Keduanya bisa diklik untuk memfilter dashboard.
  - Daftar stok kritis dengan tombol Restock, dan aktivitas terbaru.
- **Permintaan**: form multi-barang.
  - Isi NIK/nama → data pemohon lama terisi otomatis.
  - Cek stok langsung, dan sisa stok setelah transaksi langsung terlihat.
- **Restock**: form multi-barang. Bisa langsung terisi dari tombol "+ Restock" di dashboard/stok.
- **Stok Barang**:
  - Cari, filter (habis/menipis/aman/baru), dan urutkan.
  - Pemakaian 30 hari plus perkiraan berapa hari stok cukup.
  - **Stok minimum bisa diubah** (tersimpan di CIKOPS), tambah **barang baru**, ekspor Excel/PDF/CSV.
- **Riwayat**:
  - Transaksi dikelompokkan per nomor. Filter keluar/masuk dan sumber (Excel / CIKOPS / menunggu Excel).
  - Detail tiap transaksi, batalkan, ekspor.
- **Sinkron Excel**: status terakhir kirim/tarik, jumlah yang menunggu, kunci sinkron, unduhan VBA, dan panduan.

## File
- Baru:
  - `src/app/dashboard/AtkTab.tsx`
  - `src/app/dashboard/atk.module.css`
  - `supabase/026_atk_dua_arah.sql`
  - `vba/modSyncCikops.bas`
  - `public/downloads/modSyncCikops.bas`
- Berubah:
  - `src/app/dashboard/page.tsx` (AtkTab lama dihapus)
  - `src/lib/api.ts`
  - `src/lib/types.ts`
