# V2.29 — FM Command Center (/dashboard-viewonly)

Zip ini berisi **seluruh kode** CIKOPS. Timpa isi repo, lalu commit dan push.
Ada **1 SQL baru**. Tidak ada library baru.

## Langkah pasang
1. Supabase → SQL Editor → jalankan **`supabase/028_fm_command_center.sql`** (aman dijalankan ulang).
2. Push kode ke GitHub. Vercel akan deploy otomatis.
3. Buka `https://cikops-onefm.vercel.app/dashboard-viewonly` di TV. Halaman ini tidak perlu login.

Jika SQL belum dijalankan, layar menampilkan pesan "FM Command Center belum aktif".

## Isi layar
Hanya data yang sedang berjalan: **hari ini + total bulan berjalan**. Tidak ada tren tahunan.

| Tab | Isi |
|---|---|
| Ringkasan hari ini | Indeks FM, kalimat ringkasan, 4 kartu area (angka hari ini + total bulan ini), daftar "Perlu perhatian", slot Tamu (menunggu modul Receptionist) |
| Fleet live | Papan driver live, sama dengan sebelumnya |
| Fleet & Gate | Tugas driver hari ini/bulan ini, selesai di hari yang sama, gate per jam, kendaraan di luar > 8 jam, utilisasi, dokumen kendaraan jatuh tempo |
| Kantin | Efisiensi hari ini/bulan ini, porsi dan sisa, per shift, efisiensi per hari |
| ATK | Keluar hari ini/bulan ini, stok kritis/habis, item keluar hari ini, per departemen |
| Pelanggaran / NC | NC hari ini/bulan ini dari G-C: jenis temuan, transporter, 5 laporan terbaru |

- Tab berganti otomatis tiap 25 detik. Tab juga bisa diklik, dan kartu di Ringkasan bisa diklik untuk membuka detailnya.
- Data diperbarui tiap 60 detik.
- URL opsional: `?tab=nc` (mulai di tab tertentu), `?rotate=0` (tanpa rotasi), `?sec=40` (lama rotasi dalam detik).

## Privasi (layar publik)
- **Tidak ada data bernominal**: klaim, kantong, lembur, dan dana operasional tidak ditampilkan.
- Pelanggaran/NC hanya menampilkan jumlah, jenis temuan, dan nama transporter. Nopol, nama driver, dan nomor SIM tidak dikirim.
- Ringkasan NC memakai `/api/gc-nc?board=1` dengan env GC_* yang sudah ada. Hasilnya di-cache 60 detik supaya G-C tidak terbebani.

## Catatan
- Laporan bulanan Security (kendaraan, visitor, kejadian) tetap ada di menu Security & Laporan Manajemen. Laporan itu tidak ditampilkan di TV.
- Kebersihan & Taman tidak dimasukkan ke Command Center, sesuai permintaan.
- Data tamu akan masuk otomatis setelah modul Receptionist dibuat.
