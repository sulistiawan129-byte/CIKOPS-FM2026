# V2.28 — Halaman Gate (/gate) baru

Zip ini berisi **seluruh kode** CIKOPS. Timpa isi repo, lalu commit dan push.
Tidak ada SQL baru, tidak ada library baru, dan data/RPC tetap sama.

## Tampilan baru /gate (Pos Security)
- Header dengan jam besar live (WIB), tanggal, nama petugas, serta mode terang/gelap.
- **KPI yang bisa diklik**: CIK di luar, PRB di dalam, Selesai, Total tercatat, Rata-rata durasi. Klik untuk memfilter daftar.
- **Form cepat dalam 4 langkah**:
  1. Kendaraan: pilih dari grid ketuk atau ketik plat (Enter memilih kendaraan teratas). Kendaraan yang sedang trip otomatis dikunci.
  2. Driver: terisi otomatis dari driver terakhir kendaraan tersebut. Bisa juga ketik manual.
  3. Tujuan: ada chip tujuan yang sering dipakai.
  4. Catatan.

  Arah tercatat otomatis: kendaraan CIK = **KELUAR PLANT**, kendaraan PRB = **MASUK CIK**.
- **Grafik pergerakan per jam** (keluar vs masuk), dengan jam berjalan disorot.
- **Kartu kendaraan aktif** dengan timer durasi live. Warnanya berubah kuning setelah 4 jam dan merah setelah 8 jam.
- **Tombol aksi dengan konfirmasi dua kali ketuk** (Catat Kembali / Catat Keluar CIK) supaya tidak salah tekan.
- Tab Selesai menampilkan alur jam pertama → jam kedua beserta durasinya.
- Notifikasi berhasil, dan kartu baru berkedip hijau.
- Responsif untuk PC, tablet, dan HP.

## Perbaikan
- Label untuk kendaraan CIK sebelumnya terbalik: kolom "Check-In" berisi jam keluar, dan tombolnya selalu "Check-Out". Sekarang sudah sesuai: **Keluar → Kembali** (CIK) dan **Masuk CIK → Keluar CIK** (PRB).
- Tombol "✓ Check-In" yang hanya hiasan sudah dihapus.
- Tanggal default salah antara pukul 00.00–07.00 WIB karena dihitung dengan UTC. Sekarang memakai waktu lokal.
- Link "Kelola Driver", yang sebenarnya hanya ganti ke input manual, sekarang berlabel "Ketik manual".
