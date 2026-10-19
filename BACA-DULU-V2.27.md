# V2.27 — Kelola & Koreksi Data di Excel GA (modGA v1.8)

Zip ini berisi **seluruh kode** CIKOPS. Timpa isi repo, lalu commit dan push.
Tidak ada SQL baru dan tidak ada library baru.

## Yang berubah
- `vba/ga/modGA.bas` naik ke **v1.8**. Versi ini juga ada di menu Cleaning & Gardening → Sinkron Excel.
- **Perbaikan penting:** di v1.7, actual yang dikosongkan di Excel tetap tersimpan di CIKOPS dengan nilai lamanya. Di v1.8 waktu koreksinya ikut dicatat, jadi CIKOPS ikut mengosongkan.

## Pasang di Excel ISS GA System
1. Tekan Alt+F11, hapus modul `modGA`, lalu import `modGA.bas` v1.8. `modSyncGA` tidak perlu diganti.
2. Jalankan **Setup_Tombol** sekali. Ini memasang tombol baru di MENU dan tombol "Hapus baris terpilih" di sheet log.

## Menu Kelola & Koreksi Data
Buka lewat tombol **KELOLA & KOREKSI DATA** di panel kanan MENU, atau link "Kelola & koreksi data" di bawah dashboard.

| No | Pilihan | Kapan dipakai |
|---|---|---|
| 1 | Koreksi actual satu minggu | Salah isi 1/0. Membuka Input Actual di minggu itu; ubah angkanya lalu Simpan. |
| 2 | Kosongkan actual (rentang tanggal) | Satu minggu salah input semua. Bisa dipilih per tim. Setelah itu input ulang. |
| 3 | Perbarui plan periode ini | DB_PEKERJAAN berubah (hari, petugas, pekerjaan baru/nonaktif). Jadwal yang belum ada actual-nya mulai tanggal tertentu dibuat ulang. **Actual aman.** |
| 4 | Hapus semua plan periode lalu generate ulang | Plan salah total. Actual di periode itu ikut terhapus. |
| 5 | Hapus baris terpilih | Salah catat di Event / Improvement / Inventory / TGA. Blok barisnya, lalu klik tombol di sheet tersebut. |
| 6 | **Batalkan perubahan terakhir** | Kembali ke kondisi sebelum Simpan Actual / Kosongkan / Perbarui / Hapus plan terakhir. Jalankan lagi untuk mengulangi. |

- Backup dibuat otomatis sebelum setiap Simpan Actual, Kosongkan, Perbarui Plan dan Hapus Plan. Backup disimpan di sheet tersembunyi `GA_BACKUP`.
- Hapus baris log (pilihan 5) tidak masuk backup. Untuk membatalkannya, tutup file tanpa menyimpan.
- Semua koreksi otomatis terkirim ke CIKOPS. Kalau sedang offline, koreksi masuk antrean.
