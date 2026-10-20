# Audit & pengetatan keamanan CIKOPS

Audit mencakup RLS semua tabel, fungsi/RPC/view yang bisa melewati RLS, halaman tanpa
login (termasuk Command Center), dan kunci rahasia.

## Hasil audit — yang sudah aman
- **Service role key tidak pernah sampai ke browser.** Key hanya dipakai di server
  (`/api/gc-nc`) dan di Edge Function Supabase. Browser hanya memegang URL dan anon key
  (memang publik). Tidak ada kunci rahasia di kode maupun di riwayat git.
- **Modul baru** (Security, Kalender, Cleaning & Gardening, Receptionist, TGA, notifikasi)
  sudah memakai RLS untuk akun login, atau tabelnya hanya bisa diakses lewat fungsi.

## Temuan & perbaikan (`supabase/040_keamanan.sql`)
| Temuan | Risiko | Perbaikan |
|---|---|---|
| Setiap akun baru, **termasuk driver**, otomatis diberi role staf `ga` oleh trigger lama | Kritis | Trigger tidak lagi membuat profil staf; profil `ga` milik akun driver dihapus |
| Tabel lama (driver, tugas, pegawai, klaim, lembur, kantong, tier, karangan bunga, gift) punya policy `using (true)` yang juga berlaku **tanpa login**, termasuk no HP, email, dan hash PIN driver serta NIK pendaftar gift | Kritis | Semua policy lama diganti: tanpa login tertutup; staf baca semua, tulis sesuai modul; driver hanya data & tugasnya sendiri |
| View `tasks_detail`, `current_kantong`, `driver_tier_summary` berjalan dengan hak pemilik (melewati RLS) dan bisa dibaca tanpa login | Tinggi | View ikut RLS (`security_invoker`), tertutup tanpa login |
| `accept/complete/cancel_task` bisa dipanggil tanpa login dengan id yang terlihat di Command Center, sehingga siapa pun bisa menyelesaikan atau membatalkan tugas | Tinggi | Hanya driver pemilik tugas (dicek dari email login) atau staf armada |
| `atk_upsert_item` tanpa kunci: siapa pun bisa mengubah stok ATK | Tinggi | Wajib kunci sinkron (**perbarui modSyncCikops.bas**) |
| `rcp_remember_contact` bisa dipanggil tanpa login, sehingga email bukti/wifi bisa dialihkan | Tinggi | Hanya bisa dipanggil fungsi internal |
| Gift: passcode 4 digit, verifikasi tanpa batas, mengembalikan NIK & email | Tinggi | Passcode baru 8 digit; maksimal 20 tebakan salah per 10 menit; NIK disamarkan, email tidak dikirim |
| Command Center publik bisa menarik riwayat tugas **tanggal berapa pun**, lengkap dengan departemen & pejabat yang dilayani driver | Sedang–Tinggi | Hanya hari ini; departemen & data pejabat dihapus; nama pemohon hanya nama depan |
| Edge Function email gift & locker bisa dipakai siapa pun untuk mengirim email (phishing) dari akun perusahaan, plus sisipan HTML | Tinggi | Hanya ke pendaftar/pemilik locker yang terdaftar; semua isi di-escape; konfirmasi locker hanya staf |
| PIN driver lama (`verify_driver_pin`/`set_driver_pin`, 4 digit, tanpa batas) masih terbuka | Tinggi | Dihapus (tidak dipakai aplikasi) |
| Fungsi internal lain (`set_task_origin_batch`, `auto_complete_tasks`, `rcp_next_no`, …) bisa dipanggil tanpa login | Sedang | Hanya untuk akun login / staf |
| Data wifi receptionist bisa dibaca semua staf | Sedang | Hanya role yang mengelola Receptionist |
| Source map produksi aktif, sehingga seluruh kode bisa diunduh | Rendah | Dimatikan |
| Pesan error Command Center (`/api/gc-nc?board=1`) menampilkan detail internal | Rendah | Pesan dibuat umum |

**Tetap bisa tanpa login (sesuai kebutuhan):**
- isi laporan kantin **hari ini**
- kirim permintaan karyawan/printer (tanpa bisa membaca permintaan orang lain)
- daftar event gift yang sedang buka
- halaman gate, locker, gift, dan bukti (lewat fungsi)
- Command Center versi ringkas

## Langkah pasang
1. **Cek dulu:** Supabase CIKOPS → SQL Editor → jalankan `supabase/AUDIT-keamanan.sql`.
   Simpan hasilnya untuk perbandingan.
2. **Jalankan `supabase/040_keamanan.sql`** (sesudah 039).
   - Di awal, file ini memeriksa bahwa fungsi gate/locker/gift/login driver yang tidak
     ada di repo berstatus *security definer*. Kalau ada yang bukan, migrasi **dibatalkan
     tanpa mengubah apa pun**. Kirim hasil bagian 7 audit ke developer.
   - Di akhir ada daftar tabel yang masih bisa dibaca tanpa login. Seharusnya hanya
     `canteen_reports` (hari ini) dan `gift_events` (event buka).
3. **Deploy ulang Edge Function** `send-gift-passcode` dan `send-locker-email`, dengan cara
   yang sama seperti function lain (Dashboard → Edge Functions → buka function → tempel
   kode baru → Deploy).
4. **Excel ATK:** ganti modul `modSyncCikops.bas` dengan versi baru
   (`public/downloads/modSyncCikops.bas`). Isi konstanta tetap sama. Tanpa ini, kirim
   data barang dari Excel akan ditolak.
5. **Deploy website** (merge ke `main`) supaya source map mati, passcode gift 8 digit,
   dan pesan error yang aman ikut aktif.
6. Jalankan lagi `AUDIT-keamanan.sql`. Bagian 2 (policy tanpa login) dan bagian 8 (driver
   dengan akses staf) seharusnya kosong.

## Masih perlu ditinjau (fungsi tidak ada di repo)
Fungsi gate (`open/close_gate_checkpoint`, `get_gate_logs_public`), locker
(`register_locker`, `verify_locker_release`, …), pencarian gift (`find_gift_*`,
`claim_gift_registration`), dan login driver (`get_driver_by_email`) dibuat langsung di
Supabase, bukan dari repo. Isinya belum bisa diaudit. Bagian 7 dari
`AUDIT-keamanan.sql` menampilkan isinya; kirim hasilnya untuk ditinjau. Yang perlu
dicek: batas tanggal, batas percobaan PIN locker, dan data pribadi yang dikembalikan.

## Catatan lain
- Workflow `vapid-keys.yml` dan `android-apk.yml` menaruh kunci (VAPID & keystore APK)
  sebagai artifact selama 1–3 hari. Setelah disalin ke Secrets, **hapus artifact-nya**
  di GitHub → Actions → run → Artifacts.
- PIN aplikasi TGA 4–6 digit dengan kunci 15 menit setelah 5 kali salah. Ini cukup
  untuk pemakaian internal; disarankan PIN 6 digit.
