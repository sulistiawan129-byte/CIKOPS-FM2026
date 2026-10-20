# Modul Receptionist — langkah aktivasi

Menu baru: **Dashboard → Fasilitas → Receptionist** (Dashboard, Wifi Guest, Barang & Surat, Induction Room, Pengaturan).
Ringkasannya juga tampil di **FM Command Center** (tab *Receptionist*, angka di *Ringkasan hari ini*, dan butir *Perlu tindakan*).

## 1. Jalankan SQL (sekali)
Supabase → SQL Editor → jalankan `supabase/031_receptionist.sql`.
Aman dijalankan ulang. Wajib **sesudah** `025_kalender_agenda.sql` (booking ruangan disinkron ke Kalender & Agenda).

## 1b. Data Master & Bukti Permintaan (SQL tambahan)
Jalankan juga `supabase/033_receptionist_data_bukti.sql` (sesudah 031 & 032):
- kolom **email, no HP, jabatan, aktif** di master karyawan (`employees`) untuk menu Data Master → Data Karyawan;
- **nomor booking** `BK-YYMM-###`, email PIC booking, dan **token tautan bukti** untuk wifi / barang / booking;
- fungsi `rcp_receipt` untuk halaman publik **/bukti?t=…** (bisa dibuka requestor tanpa login).
Bila suatu saat `031` dijalankan ulang, jalankan ulang `033` sesudahnya.

## 2. Deploy fungsi email
```
supabase functions deploy send-receptionist-email
```
Memakai secrets yang sama dengan fungsi email lain: `GMAIL_USER`, `GMAIL_APP_PASSWORD`.
Jika fungsi belum di-deploy, transaksi tetap tersimpan — hanya email yang gagal (muncul peringatan di layar).
**Deploy ulang** setiap kali file fungsi ini berubah (versi terbaru: email bergaya tiket + tombol "Lihat & cetak bukti",
dan email konfirmasi booking ruangan ke PIC). Tidak ada fungsi baru — halaman bukti memakai RPC `rcp_receipt`.

## 3. Hak akses menu
Akun dengan `allowed_tabs` terbatas perlu ditambah `receptionist` agar menu muncul.
Akun dengan `allowed_tabs = null` (akses penuh) langsung melihat menunya.

### Akun khusus resepsionis (role `receptionist`)
1. Supabase → Authentication → Users → **Add user → Create new user**:
   email `receptionist@cikops.com`, isi password, centang **Auto Confirm User**.
2. Jalankan `supabase/032_role_receptionist.sql` di SQL Editor.

Akun ber-role `receptionist` dikunci ke menu Receptionist saja: tanpa Home, Ringkasan,
Kalender, pencarian, atau menu lain. URL menu lain otomatis diarahkan kembali ke Receptionist.
Untuk membuat akun resepsionis lain: buat user baru, lalu
`update profiles set role = 'receptionist', allowed_tabs = array['receptionist'] where id = (select id from auth.users where email = '...');`

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

## Bukti Permintaan
Setiap wifi, barang/surat, dan booking punya **Bukti Permintaan**: tiket bernomor unik dengan barcode Code 128
(nomor tanda terima) dan kode verifikasi. Dari tombol 🧾 di setiap daftar:
**Cetak** (A5, hanya tiketnya) · **Salin tautan** (/bukti?t=…) · **WhatsApp** (nomor dari Data Karyawan) · **Email**.
Password wifi di tautan publik otomatis disembunyikan setelah masa akses berakhir atau dikembalikan.

## Data Master
Menu Receptionist → **Data Master** berisi tiga CRUD terpisah:
- **Data Karyawan** — tabel `employees` CIKOPS (tambah/ubah/nonaktifkan/hapus/impor). Email & no HP dipakai untuk
  isi otomatis dan pengiriman bukti. Email yang diketik di form ikut melengkapi data karyawan yang masih kosong.
- **Data Akun Wifi** — akun dari IT (tambah/ubah/impor/nonaktifkan/hapus).
- **Data Driver** — tabel `drivers` CIKOPS yang sama, jadi otomatis sinkron dengan menu Driver, Penugasan, dan aplikasi
  driver. Hapus driver hanya bisa oleh admin (aturan lama); akun lain cukup menonaktifkan.
