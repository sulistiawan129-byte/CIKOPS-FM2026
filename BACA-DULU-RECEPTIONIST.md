# Modul Receptionist — langkah aktivasi

Menu baru: **Dashboard → Fasilitas → Receptionist** (Dashboard, Wifi Guest, Barang & Surat, Induction Room, Pengaturan).
Ringkasannya juga tampil di **FM Command Center** (tab *Receptionist*, angka di *Ringkasan hari ini*, dan butir *Perlu tindakan*).

## 1. Jalankan SQL (sekali)
Supabase → SQL Editor → jalankan `supabase/031_receptionist.sql`.
Aman dijalankan ulang. Wajib **sesudah** `025_kalender_agenda.sql` (booking ruangan disinkron ke Kalender & Agenda).

## 2. Deploy fungsi email
```
supabase functions deploy send-receptionist-email
```
Memakai secrets yang sama dengan fungsi email lain: `GMAIL_USER`, `GMAIL_APP_PASSWORD`.
Jika fungsi belum di-deploy, transaksi tetap tersimpan — hanya email yang gagal (muncul peringatan di layar).

## 3. Hak akses menu
Akun dengan `allowed_tabs` terbatas perlu ditambah `receptionist` agar menu muncul.
Akun dengan `allowed_tabs = null` (akses penuh) langsung melihat menunya.

## 4. Pengaturan awal (menu Receptionist → Pengaturan)
- Jam operasional ruangan (default 06:00–22:00) dan panjang slot grid (15/30/60 menit).
- Nama wifi (SSID) dan ketentuan — keduanya dicantumkan di email tanda terima.

## Aturan yang ditegakkan database
| Aturan | Keterangan |
|---|---|
| 1 akun = 2 slot | Bisa diubah per akun saat impor (kolom *Slot*). |
| Status akun | Tersedia → Terpakai sebagian → Penuh → Kedaluwarsa (otomatis dari tanggal & slot). |
| Saran akun | Hanya akun yang berlaku sampai tanggal selesai pemakaian; urut dari yang paling cepat habis. |
| Slot kembali | Klik *Kembalikan*, atau otomatis setelah tanggal "berlaku sampai" lewat (tamu harian = akhir hari itu). |
| Nomor tanda terima | `WF-YYMM-###` (wifi), `IN-YYMM-###` (barang masuk), `OUT-YYMM-###` (barang keluar) — urut per bulan. |
| Booking ruangan | Tolak jadwal bentrok & di luar jam operasional; booking berulang bisa melewati tanggal yang bentrok. |
| Buku alamat | Email setiap nama yang pernah diinput diingat otomatis (tabel `rcp_contacts`). |

## Format impor akun dari IT
Tempel dari Excel atau unggah `.xlsx`/`.csv`. Kolom yang dikenali (urutan bebas):
`Username`, `Password`, `Berlaku sampai` (atau `Durasi`/`Hari`), opsional `Berlaku mulai`, `Slot`, `Batch`.
Tanpa baris judul, urutannya: username, password, berlaku sampai. Username yang sudah ada akan diperbarui.
