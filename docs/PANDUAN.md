# CIKOPS — Panduan setup, operasional & pindah akun

Satu dokumen untuk semua langkah pasang, per modul, plus langkah pindah akun
Supabase/Vercel (bab terakhir). Riwayat perubahan ada di `git log`.

## File SQL (Supabase CIKOPS → SQL Editor)
| File | Isi | Kapan dijalankan |
|---|---|---|
| `supabase/01_dasar.sql` | Semua migrasi lama (skema inti + bagian 001 … 038): driver, armada, tugas, klaim, kantin, gift, gate, security, kalender, ATK, Cleaning & Gardening, Command Center, Receptionist, TGA | **Sudah berjalan di production** — tidak perlu diulang. Cari `## BAGIAN 0xx` untuk melihat migrasi tertentu |
| `supabase/02_peran_keamanan.sql` | Bagian 039 role per modul, 041 riwayat pengingat dokumen, 040 pengetatan keamanan | **Jalankan sekali sekarang** (utuh, satu kali Run). Aman diulang |
| `supabase/04_aplikasi_lapangan.sql` | Bagian 042 token notifikasi APK (Firebase), 043 Self-Claim driver, 044 sinkron Excel ATK, 045 modul TGA (ubah/hapus pekerjaan + form penugasan publik), 046 status teknisi Available/Busy (realtime), 047 reset periode Cleaning & Gardening, 048 ringkasan TGA di FM Command Center, 049 form kantin publik tanggal bebas (backdate) | **Jalankan sekali, sesudah file 02.** Aman diulang |
| `supabase/03_data_impor.sql` | Impor data lama sekali pakai (riwayat security, klaim Jan–Jun 2026) | Sudah berjalan. Tidak perlu untuk project baru yang datanya disalin |
| `supabase/06_perbaikan_audit_2026-11.sql` | Perbaikan temuan audit keamanan: tutup fungsi yang bisa dipanggil tanpa login (buat/hapus tugas Fleet, data klaim & driver), batasi aksi admin locker, kunci 15 menit setelah 5× PIN locker salah, policy "semua akun login" → staf saja, batas wajar angka kantin | **Jalankan sekali di Supabase produksi, sesudah file 04.** Aman diulang. Lihat bab *Keamanan: menjalankan SQL 06* |
| `supabase/05_data_demo.sql` | Akun & data **fiktif** untuk deployment DEMO (lihat bab *Deployment DEMO*) | **Hanya di project Supabase DEMO** — berhenti sendiri bila dijalankan di database yang berisi akun asli |
| `supabase/07_kategori_driver.sql` | Kategori driver jadi 2 (Driver Pool & Driver User): driver bertipe *Support* diubah jadi Pool, constraint diperketat | **Jalankan sekali SESUDAH aplikasi versi baru ter-deploy (merge ke main).** Aman diulang |
| `supabase/cek_audit_keamanan.sql` | Pemeriksaan keamanan, hanya membaca | Sebelum & sesudah `02_peran_keamanan.sql`, dan sesudah pindah akun |

Bila bagian 040 dibatalkan oleh pemeriksaan awalnya (pesan `DIBATALKAN — …`),
bagian 039 & 041 tetap tersimpan; kirim hasil bagian 7 dari
`cek_audit_keamanan.sql`, perbaiki, lalu jalankan ulang file yang sama.

## Edge Function & secret
| Function | Secret yang dibutuhkan |
|---|---|
| `manage-staff-account` | — (memakai `SUPABASE_SERVICE_ROLE_KEY` bawaan) |
| `send-driver-credentials`, `send-claim-email`, `send-task-email`, `send-receptionist-email`, `send-gift-passcode` | `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| `send-locker-email` | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `LOCKER_ADMIN_EMAIL` (opsional) |
| `send-web-push` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, dan `FCM_SERVICE_ACCOUNT` (isi JSON service account Firebase, untuk notifikasi APK) |
| `vehicle-document-reminder` | `GMAIL_USER`, `GMAIL_APP_PASSWORD`. Dijadwalkan harian lewat Supabase Cron dengan header `Authorization: Bearer <service_role>` (lihat bagian 041 di `supabase/02_peran_keamanan.sql`) |

Set secret: Dashboard Supabase → Edge Functions → Secrets, atau `supabase secrets set NAMA=nilai`.

## Environment variable Vercel (CIKOPS)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TWA_SHA256` (APK),
`GC_SUPABASE_URL`, `GC_SUPABASE_ANON_KEY`, `GC_READER_EMAIL`, `GC_READER_PASSWORD`
(atau `GC_SUPABASE_SERVICE_ROLE_KEY`), `GC_PLANT`, `GC_HASH_SALT`, `SECDESK_SITE` (opsional).


---

## Role & akun

| Role | Kelola | Halaman awal | Kelola akun untuk |
|---|---|---|---|
| **Master Admin** | Semua modul (termasuk Kantin), Log Aktivitas | Beranda | Semua role |
| **Admin GA CIK** | Penugasan, Armada, Gate Log, Pom Bensin (CIK), Klaim, Dana Operasional, Locker, Pembagian, Printer, ATK, Permintaan Karyawan, Receptionist, Master Data, Kalender, Report (Fleet, Klaim, ATK) | Beranda | Admin GA CIK, Receptionist |
| **Admin GA PRB** | Penugasan, Armada, Master Data (driver, pegawai, pengaturan), Kalender, Report Fleet — **data PRB saja** | Beranda (versi PRB) | Admin GA PRB |
| **Admin / SPV ISS** | Cleaning & Gardening, TGA, Report Cleaning & Gardening dan TGA | Cleaning & Gardening | Admin / SPV ISS |
| **Admin / SPV Security** | Laporan Security, Report Security | Laporan Security | Admin / SPV Security |
| **Receptionist** | Receptionist, Kalender (agenda & kunjungan, tanpa penugasan driver) | Receptionist | — |
| **Management** | **Lihat saja**: FM Command Center + tarik laporan semua modul | Command Center | — |

Tetap **tanpa login**: `/canteen` (staf kantin input), `/gate` (pos security),
`/request`, `/bukti`, `/locker`, `/gift`, dan Command Center `/dashboard-viewonly`.
Driver & TGA tetap memakai aplikasinya sendiri (`/driver`, `/tga`, APK).

### Yang dijaga database (bagian 039 di `02_peran_keamanan.sql`)
- **Management** tidak bisa menambah, mengubah, atau menghapus data apa pun.
- Setiap role hanya bisa **menulis** ke tabel modulnya. Contohnya, Admin ISS tidak bisa
  mengubah klaim dan Admin Security tidak bisa mengubah armada.
- Fungsi simpan Cleaning & Gardening, TGA, Receptionist, dan ATK ikut memeriksa role.
- **Membaca** data tidak dibatasi, supaya laporan lintas modul tetap jalan. Menu yang
  boleh dibuka diatur aplikasi.
- Batas plant CIK/PRB diatur aplikasi (filter data per plant).
- Tabel yang RLS-nya belum aktif disebut di pesan *NOTICE* saat SQL dijalankan. Untuk
  tabel itu, pembatasannya hanya di aplikasi.

### Langkah pasang (sekali saja)
1. **Supabase CIKOPS → SQL Editor:** jalankan `supabase/02_peran_keamanan.sql` utuh
   (sekaligus memasang bab Keamanan di bawah). Cek role tiap akun di menu **Akun & Role**.
   - Akun master admin lama otomatis menjadi **Master Admin**.
   - Akun lama dengan plant PRB otomatis menjadi **Admin GA PRB**.
   - Akun lain tetap memakai role lama (`admin`/`ga`) dan tetap bisa masuk seperti
     sebelumnya. Ganti role-nya lewat menu **Akun & Role**.
2. **Deploy Edge Function** `manage-staff-account`, sama seperti function lain:
   ```bash
   supabase functions deploy manage-staff-account
   ```
   Tanpa install apa pun: Dashboard Supabase → **Edge Functions → Deploy a new
   function → Via Editor** → nama `manage-staff-account` → tempel isi
   `supabase/functions/manage-staff-account/index.ts` → **Deploy**. Function ini memakai `SUPABASE_SERVICE_ROLE_KEY` bawaan Supabase,
   jadi tidak perlu secret tambahan.
3. Login sebagai **Master Admin** → Sistem → **Akun & Role**:
   - **+ Akun baru**: isi email, nama, dan role. Password boleh dikosongkan supaya
     dibuat acak. Password ditampilkan sekali, bisa disalin dan diberikan ke pemilik akun.
   - **Ubah**: ganti nama atau role.
   - **Password**: buat password baru.
   - **Nonaktifkan**: akun tidak bisa login sampai diaktifkan lagi.
4. Setiap admin tim (GA CIK, GA PRB, ISS, Security) bisa membuat akun untuk timnya
   sendiri dari menu yang sama.

### Password sementara & ganti password
- Akun yang **dibuat** atau **direset** dari menu Akun & Role mendapat password sementara.
  Saat login pertama, pemilik akun langsung diminta membuat password sendiri
  (isi password sementara → password baru 2x). Tombol **Keluar** tersedia bila belum siap.
- Kapan saja: menu akun (kartu nama di kiri bawah sidebar) → **Ubah password**.
  Password baru minimal 8 karakter, berisi huruf dan angka.
- Butuh Edge Function `manage-staff-account` versi terbaru (deploy ulang) supaya
  tanda "wajib ganti password" ikut terpasang saat reset.

### Catatan
- Email yang terdaftar sebagai **driver** tidak bisa dijadikan akun staf.
- Role akun sendiri tidak bisa diubah, dan akun sendiri tidak bisa dinonaktifkan.
  Ini mencegah admin terkunci dari sistemnya sendiri.
- Akun driver tetap dikelola di Master Data → Driver. Akun TGA dikelola di
  menu **TGA → Teknisi** (khusus Admin ISS).


---

## Keamanan

Audit mencakup RLS semua tabel, fungsi/RPC/view yang bisa melewati RLS, halaman tanpa
login (termasuk Command Center), dan kunci rahasia.

### Hasil audit — yang sudah aman
- **Service role key tidak pernah sampai ke browser.** Key hanya dipakai di server
  (`/api/gc-nc`) dan di Edge Function Supabase. Browser hanya memegang URL dan anon key
  (memang publik). Tidak ada kunci rahasia di kode maupun di riwayat git.
- **Modul baru** (Security, Kalender, Cleaning & Gardening, Receptionist, TGA, notifikasi)
  sudah memakai RLS untuk akun login, atau tabelnya hanya bisa diakses lewat fungsi.

### Temuan & perbaikan (bagian 040 di `supabase/02_peran_keamanan.sql`)
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

### Langkah pasang
1. **Cek dulu:** Supabase CIKOPS → SQL Editor → jalankan `supabase/cek_audit_keamanan.sql`.
   Simpan hasilnya untuk perbandingan.
2. **Jalankan `supabase/02_peran_keamanan.sql` utuh** (berisi 039, 041, lalu 040).
   - Di awal, file ini memeriksa bahwa fungsi gate/locker/gift/login driver yang tidak
     ada di repo berstatus *security definer*. Kalau ada yang bukan, bagian 040 **dibatalkan
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
6. Jalankan lagi `cek_audit_keamanan.sql`. Bagian 2 (policy tanpa login) dan bagian 8 (driver
   dengan akses staf) seharusnya kosong.

### Masih perlu ditinjau (fungsi tidak ada di repo)
Fungsi gate (`open/close_gate_checkpoint`, `get_gate_logs_public`), locker
(`register_locker`, `verify_locker_release`, …), pencarian gift (`find_gift_*`,
`claim_gift_registration`), dan login driver (`get_driver_by_email`) dibuat langsung di
Supabase, bukan dari repo. Isinya belum bisa diaudit. Bagian 7 dari
`cek_audit_keamanan.sql` menampilkan isinya; kirim hasilnya untuk ditinjau. Yang perlu
dicek: batas tanggal, batas percobaan PIN locker, dan data pribadi yang dikembalikan.

### Catatan lain
- Workflow `vapid-keys.yml` dan `android-apk.yml` menaruh kunci (VAPID & keystore APK)
  sebagai artifact selama 1–3 hari. Setelah disalin ke Secrets, **hapus artifact-nya**
  di GitHub → Actions → run → Artifacts.
- PIN aplikasi TGA 4–6 digit dengan kunci 15 menit setelah 5 kali salah. Ini cukup
  untuk pemakaian internal; disarankan PIN 6 digit.


---

## Security — Security Desk (G4S)

Tim security tetap memakai **Security Desk** (https://cik-g4s.vercel.app) seperti biasa,
termasuk modul G-C. CIKOPS **membaca** datanya, jadi modul Security di CIKOPS tidak perlu
diisi lagi dan Laporan Manajemen terisi otomatis.

| Di CIKOPS (Fasilitas → Security) | Diambil dari Security Desk |
|---|---|
| Kendaraan All (per minggu, HK/libur) | Data harian: mobil karyawan, tamu, kontraktor, motor |
| Visit → visitor | Data harian: visitor |
| Visit → kunjungan team support | **Baru** Kejadian & patroli → Kunjungan team support |
| Transporter (timbang, non-timbang, selisih, Palm Oil) | **Baru** Data harian → Transporter & biomas + Kejadian & patroli |
| Biomas PT Becis (sekam, abu) | **Baru** Data harian → Transporter & biomas |
| Transporter → Gate transporter | Gate In/Out (jumlah, temuan, durasi, di dalam area) |
| Pelanggaran transporter | G-C (sudah jalan sebelumnya) |
| Kejadian per jenis | Kejadian & patroli |
| Kejadian → Issue area | **Baru** Kejadian & patroli → Issue area |
| Patroli | Kejadian & patroli → Patroli |
| **Baru** tab Personel & KPI | Personel (cuti/sakit/backup, need improvement) & KPI |

Bulan yang belum diisi di Security Desk tetap memakai data CIKOPS lama (input manual),
jadi riwayat sebelum sinkron tidak hilang.

### Langkah pemasangan (sekali saja)

#### 1. Update aplikasi Security Desk (repo `CIK-G4S`)
Sudah di-push ke `main` repo `CIK-G4S` (Vercel deploy otomatis).

### 2. Jalankan SQL di Supabase (project Security Desk / G-C)
SQL Editor → jalankan **`supabase/laporan_cikops.sql`** (dari repo `CIK-G4S`, atau
repo `CIK-G4S`). Tabel lama tidak diubah.

#### 3. Beri akses baca ke akun CIKOPS
CIKOPS membaca Security Desk memakai akun yang sama dengan sinkron G-C
(`GC_READER_EMAIL` di Vercel CIKOPS). Akun itu perlu peran **Management** (lihat saja) di
Security Desk:

- Cara mudah: Security Desk → menu **Pengguna** → cari akun itu → peran **Management**.
- Atau lewat SQL (ganti email):
  ```sql
  insert into security.profiles (id, email, full_name, role, active)
  select id, email, 'CIKOPS (baca)', 'management', true
  from auth.users where email = 'email-akun-cikops@contoh.com'
  on conflict (id) do update set role = 'management', active = true;
  ```

> Kalau akun itu dipakai orang lain dengan peran lain (mis. SHE), buat akun khusus
> untuk CIKOPS dan ganti `GC_READER_EMAIL` / `GC_READER_PASSWORD` di Vercel CIKOPS.
> Peran Management tetap bisa membaca data NC G-C.

Kalau CIKOPS memakai `GC_SUPABASE_SERVICE_ROLE_KEY`, langkah 3 tidak perlu.

#### 4. Cek di CIKOPS
Fasilitas → **Security** → muncul kotak hijau **"Tersinkron dengan Security Desk"**.
Kalau oranye, pesan di kotak itu menjelaskan yang kurang.

### Pemakaian harian (tim security, di Security Desk)
- **Data harian**: selain 5 angka kendaraan/visitor, sekarang ada kelompok
  **Transporter & biomas** (timbang, non-timbang, sekam, abu). Tombol Enter tetap pindah kolom.
- **Kejadian & patroli**: di bawah patroli ada **Transporter & biomas** (selisih timbang ≥ 40 kg,
  Palm Oil/Fat Blend), **Kunjungan team support**, dan **Issue area**.
- **Laporan bulanan**: ada 2 slide baru (Transporter & biomas, Kunjungan & issue area).

Di CIKOPS semua isian Security menjadi hanya-baca selama bulan itu ada di Security Desk.
Tombol **Buka Security Desk ↗** membuka aplikasi untuk mengubah data.


---

## Security — sinkron G-C (pelanggaran transporter)

Panduan ini menyambungkan **pelanggaran transporter** dari aplikasi G-C (Kepatuhan Transporter / Security Desk) ke CIKOPS, supaya:

- tab **Laporan Security → Pelanggaran Transporter** terisi otomatis,
- modul **Security** di **Report → Laporan Manajemen** memakai data G-C,
- tidak ada lagi input ulang sekitar 100 kasus per bulan.

Sambungan ini **hanya membaca**. CIKOPS tidak pernah menulis, mengubah, atau menghapus data G-C.

---

### 1. Cara kerjanya

```
Browser CIKOPS ──(login CIKOPS)──► /api/gc-nc (server CIKOPS di Vercel)
                                        │  memakai akun baca-saja G-C
                                        ▼
                               Supabase G-C / Security Desk
                               nc_reports · nc_report_findings
                               suppliers · nc_categories
```

**Siapa yang boleh memanggil**
- `/api/gc-nc` hanya melayani pengguna yang sudah login di dashboard CIKOPS (punya baris di tabel `profiles`).

**Keamanan kredensial dan data pribadi**
- Kredensial G-C disimpan di **environment variable Vercel** dan tidak pernah sampai ke browser.
- **Nomor SIM tidak dikirim ke browser dan tidak disimpan di CIKOPS.** Yang dikirim hanya kode acak (hash) dan 4 digit terakhir. Kode itu dipakai untuk mengenali driver yang melanggar berulang.

**Aturan hitung (sudah dicocokkan dengan laporan G4S September 2026)**
- Yang dihitung hanya laporan **status Accept** dan **plant Cikarang**.
- **Kasus = jumlah laporan NC.** Contoh September: 109.
- **Jenis pelanggaran = jumlah temuan.** Contoh September: 136.
- **Top perusahaan** dan **jenis** sama persis dengan grafik di laporan G4S.

**Pembaruan data**
- Data dibaca langsung saat halaman atau report dibuka, dengan cache 2 menit.
- Tombol **Sinkron ulang** memaksa ambil data terbaru.

---

### 2. Langkah di database CIKOPS (sekali)

Buka **Supabase project CIKOPS → SQL Editor**, lalu jalankan berurutan:

1. **bagian 021 di `supabase/01_dasar.sql`** membuat tabel modul Security (`security_monthly`, `security_config`) beserta aturan aksesnya.
2. **bagian 022 di `supabase/03_data_impor.sql`** mengisi riwayat 12 bulan (Sep 2025 – Agu 2026) dan data lengkap September 2026 dari laporan G4S, supaya grafik tren 13 bulan langsung terisi.

Keduanya aman dijalankan ulang. File 022 tidak menimpa data September 2026 yang sudah diinput di aplikasi.

> **Akun dengan menu terbatas.** Kalau ada akun yang kolom `allowed_tabs`-nya diisi daftar menu, tambahkan `security` supaya menu muncul. Contoh:
> ```sql
> update profiles set allowed_tabs = array_append(allowed_tabs, 'security')
> where allowed_tabs is not null and not ('security' = any(allowed_tabs));
> ```
> Akun scope Pasar Rebo (PRB) memang tidak melihat menu Security.

---

### 3. Langkah di G-C / Security Desk: akun baca-saja

Disarankan memakai **akun khusus** dengan hak terkecil, bukan akun admin.

1. Login ke **Security Desk** sebagai Admin G4S atau Admin GA.
2. Buka menu **Pengguna**, lalu tambah pengguna baru:
   - **Email:** misalnya `cikops-reader@frisianflag.local` (boleh email apa saja yang tidak dipakai orang).
   - **Password:** buat yang panjang dan acak, lalu catat.
   - **Peran:** **SHE Department**. Peran ini bisa **melihat** data G-C (NC), tetapi tidak bisa mengubahnya.
   - **Site:** Cikarang.
3. Simpan.

Kalau menu Pengguna tidak bisa membuat akun, buat lewat **Supabase project G-C → Authentication → Add user**, lalu beri peran SHE Department dari menu Pengguna.

> **Alternatif (kurang disarankan).** Isi `GC_SUPABASE_SERVICE_ROLE_KEY` dengan *service_role key* project G-C. Kunci ini punya akses penuh ke database G-C, jadi pakai hanya bila cara akun di atas tidak bisa. Kalau diisi, kunci ini menggantikan login akun.

---

### 4. Langkah di Vercel (project CIKOPS)

Buka **Vercel → project CIKOPS → Settings → Environment Variables**, lalu tambahkan untuk **Production** (dan Preview bila perlu):

| Nama | Isi | Diambil dari |
|---|---|---|
| `GC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase **G-C** → Settings → API → Project URL |
| `GC_SUPABASE_ANON_KEY` | `eyJ...` (anon public key) | Supabase **G-C** → Settings → API → anon public |
| `GC_READER_EMAIL` | email akun baca-saja | langkah 3 |
| `GC_READER_PASSWORD` | password akun baca-saja | langkah 3 |
| `GC_PLANT` | `Cikarang` | nilai kolom `plant` di nc_reports (default `Cikarang`) |
| `GC_HASH_SALT` | teks acak, mis. 32 karakter | buat sendiri dan **jangan diubah** setelah dipakai |

> **Kenapa `GC_HASH_SALT` tidak boleh diubah:** nama driver yang sudah diberikan di CIKOPS tertaut ke kode hash. Kalau salt diganti, semua nama driver harus diberikan ulang.

Setelah semua diisi, buka **Deployments → Redeploy** (environment variable baru hanya terbaca setelah deploy ulang).

---

### 5. Uji sambungan

1. Buka CIKOPS → **Laporan Security → Pengaturan → Cek koneksi G-C**. Hasil yang benar kira-kira:
   `✓ Tersambung (akun baca-saja) · plant Cikarang · 417 laporan Accept · terbaru 11 Okt`
2. Buka tab **Pelanggaran Transporter**. Seharusnya muncul pita hijau "Tersinkron otomatis dari G-C". Untuk September 2026, angkanya **109 kasus · 136 temuan · 43 perusahaan**, dengan JMM 5 kasus dan Becis 0.
3. Di daftar **Driver pelanggar (Becis & JMM)**, klik **Beri nama** untuk driver yang tampil sebagai `SIM ••1234 · B 1234 XX`. Cukup sekali; nama dipakai lagi di bulan-bulan berikutnya.
4. Buka **Report → Laporan Manajemen**, centang **Security**, pilih September 2026, lalu **Susun laporan**.

---

### 6. Data yang dipakai dari G-C

| Tabel G-C | Kolom yang dibaca |
|---|---|
| `nc_reports` | `id`, `tanggal`, `supplier_id`, `no_polisi`, `nomor_identitas` (di-hash), filter `status = 'Accept'` dan `plant` |
| `nc_report_findings` | `report_id`, `category_id` |
| `suppliers` | `id`, `name` |
| `nc_categories` | `id`, `name` |

Kolom lain (catatan, nama petugas, dll.) tidak dibaca.

---

### 7. Perusahaan khusus (Becis & JMM)

- Diatur di **Laporan Security → Pengaturan → Perusahaan khusus**.
- Nama harus **persis** sama dengan master supplier G-C. Saat ini: `PT. BECIS` dan `PT. JAYA MUKTI MANDIRI`.
- Jangan pakai potongan kata. Di G-C ada juga **PT. ARJAYA MUKTI SENTOSA**, dan pencarian "jaya mukti" akan ikut menangkapnya.

---

### 8. Kalau ada masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| "Sinkron G-C belum dikonfigurasi" | Environment variable `GC_*` belum diisi atau belum redeploy | Lengkapi langkah 4 lalu Redeploy |
| "Login ke G-C gagal" | Email/password salah, atau akun belum dikonfirmasi | Cek akun di Supabase G-C → Authentication; reset password |
| "G-C menolak query … permission denied" | Peran akun tidak boleh membaca tabel NC | Ganti peran akun menjadi SHE Department (atau peran lain yang bisa melihat G-C) |
| Tersambung tetapi 0 kasus | `GC_PLANT` tidak sama dengan isi kolom plant | Samakan dengan nilai di G-C (mis. `Cikarang`) |
| Becis/JMM tidak terpisah | Nama perusahaan khusus tidak persis sama | Perbaiki di tab Pengaturan |
| Angka beda sedikit dengan laporan G4S | Ada input susulan di G-C setelah laporan G4S dibuat | Normal. CIKOPS selalu memakai data G-C terbaru |
| Bulan Mei–Juni 2026 | G-C belum lengkap (Juni hanya 12 laporan) | Sudah diisi dari laporan G4S lewat bagian 022 di `03_data_impor.sql` (kolom "Pelanggaran" di tab Riwayat). Angka riwayat menggantikan data G-C untuk bulan tsb |

Selama G-C tidak tersambung, laporan tetap bisa dibuat: tab Pelanggaran Transporter menyediakan **input manual (cadangan)**, dan report otomatis memakai angka itu.


---

## Cleaning & Gardening

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

### Langkah pemasangan (sekali saja)

1. **Supabase → SQL Editor**: jalankan bagian 038 di `supabase/01_dasar.sql`.
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

### Pemakaian harian

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

### Reset periode — input ulang actual / generate ulang (bagian 047)
Tombol **⟲ Reset periode** ada di tab **Master & jadwal** dan **Checklist harian**
(hanya saat CIKOPS sumber utama, khusus Admin ISS / Master).
1. Pilih bulan (‹ ›).
2. Pilih yang direset:
   - **Reset actual** — semua input ✓ / ✕ dikosongkan, jadwal tetap. SPV mengisi ulang dari Checklist harian.
   - **Generate ulang jadwal** — jadwal + actual dihapus lalu dibuat ulang dari Master pekerjaan terbaru
     (pakai ini bila master pekerjaan/hari berubah dan jadwal lama mau diganti total).
3. Cakupan: **1 bulan penuh** atau **rentang tanggal**, dan **semua tim** / satu tim.
4. Cek pratinjau jumlah data → ketik `RESET` → jalankan.
- Setiap reset disalin otomatis. Salah reset? Klik **Batalkan** (di layar hasil atau di **Riwayat reset**).
  Batalkan reset actual hanya mengisi baris yang masih kosong, jadi input baru tidak tertimpa;
  batalkan generate ulang mengembalikan jadwal + actual persis seperti sebelum reset.
- Disimpan 30 riwayat reset terakhir.
- Bedanya dengan **♻️ Perbarui jadwal**: tombol itu hanya mengganti jadwal yang *belum diisi*;
  Reset periode juga bisa menghapus yang *sudah diisi*.

### Kembali ke mode Excel

Admin bisa mengembalikan mode di tab Excel CIKOPS ("Kembali ke mode Excel"),
lalu pasang lagi `modSyncGA.bas` versi 1 di Excel.


---

## Aplikasi TGA

An app for TGA technicians to log their work from a phone: what was done, who requested it, the location, the status (Selesai / Proses / Pending / Butuh part), whether it is urgent, and the time. It can be installed on the home screen like the driver app.

### 1. Activate it (once)
1. Supabase → **SQL Editor** → **New query** → paste the **entire** contents of bagian 034 di `supabase/01_dasar.sql` (do not select only part of it) → **Run**.
2. Open **Dashboard → Fasilitas → TGA → tab Teknisi**.
3. Click **＋ Akun baru** (or a name chip from the TGA manpower list) → enter the name, phone number and a **PIN of 4–6 digits** → Simpan.
4. Also run bagian 035 di `supabase/01_dasar.sql` and bagian 037 di `supabase/01_dasar.sql` (after 034), so the requestor is linked to **Data Karyawan**.
5. Tell each technician their PIN, then send the link (the **Bagikan ke WhatsApp** button).

### 2. Install on a phone
- **Android (Chrome):** open `https://<domain>/tga` → *Profil* → **Pasang aplikasi**, or menu ⋮ → *Instal aplikasi*.
- **iPhone (Safari):** open the link → **Bagikan** button → **Tambah ke Layar Utama**.

The app is called **CIKOPS TGA** (orange wrench icon) and is separate from the driver app.

### 3. Using it
- **Masuk:** pick a name → enter the PIN. The session lasts 120 days and is extended automatically while the app is used.
- **＋ (orange button):** pick the job type → tap a quick suggestion or type the activity → location (recent locations appear as chips) → **Pilih requestor** → status, urgent, time → **Simpan**. Each record gets a number like `TGA-2610-001`.
- **Beranda:** today's summary, a 7-day chart, open jobs (tap ✓ to mark one done).
- **Terbuka:** all open jobs, with urgent ones first.
- **Riwayat:** 90 days, with search and filters by status/type. Tap an item to edit or delete it.

### 4. Requestor = Data Karyawan (035)
- Requestors are picked from **Data Karyawan** — the same `employees` table used by the main dashboard (Master Data), drivers, and the receptionist; nothing needs to be entered again. Inactive employees are hidden. Search by name / NIK / department, filter by department, and the "Sering meminta" list appears at the top.
- The name and department are taken from the employee data and stored as an employee link (`requestor_id`).
- If the employee data changes (name typo / moved department) → TGA activities linked to that employee update automatically.
- Guests / vendors are still allowed through "Pakai “nama”" and are marked **Di luar data karyawan**.
- Existing activities whose name exactly matches one employee are linked automatically when 035 is run.
- New employees appear in the app the next time the form is opened.

### 5. Security
- The PIN is stored as a bcrypt hash. After 5 wrong attempts the account is locked for 15 minutes.
- Resetting the PIN or deactivating the account from the dashboard → old sessions on phones are signed out.
- Technicians can only see and edit **their own** activities.

### 6. Dashboard — menu TGA (terpisah dari Cleaning & Gardening)
TGA sekarang punya menu sendiri: **Fasilitas → TGA** (`/dashboard/tga`). Akun lama yang punya
izin Cleaning & Gardening otomatis juga bisa membuka menu TGA. Isinya:

| Tab | Fungsi |
|---|---|
| **Papan tugas** | Tugaskan teknisi / semua TGA, alihkan, batalkan. Alur Baru → Proses → Selesai |
| **Data pekerjaan** | CRUD semua pekerjaan (aplikasi, papan, form, permintaan karyawan): **Tambah**, **Ubah** (teknisi, status, tanggal, jam, requestor…), **Batalkan** (tetap tercatat), **Hapus permanen**. Bisa pilih banyak baris → batalkan / hapus sekaligus. Ekspor Excel/PDF/CSV |
| **Teknisi** | Akun aplikasi `/tga`: tambah, ubah, reset PIN, nonaktif, hapus |
| **Form penugasan** | Atur kode untuk form publik `/tugas-tga` |
| **Laporan** | Rekap bulanan (aplikasi + log Excel lama), per teknisi, pemohon terbanyak |

Bedanya **Batalkan** vs **Hapus**: batal = status *Dibatalkan*, masih ada di data & laporan
dengan alasan di catatan; hapus = hilang permanen (untuk data salah input / dobel).
Data aplikasi tersimpan di tabel `tga_activities`, jadi **tidak tertimpa** sinkron Excel.

### 6b. Status teknisi Available / Busy (bagian 046)
- **Busy** = teknisi punya pekerjaan berstatus **Proses** (begitu menekan *Terima*, otomatis Busy).
- **Available** = tidak ada pekerjaan Proses — setelah ditandai **Selesai** (atau diubah ke
  Pending / Butuh part) status kembali Available.
- Aplikasi TGA: kartu besar di Beranda (hijau AVAILABLE / merah BUSY + tombol *Selesai*) dan chip di header.
- Dashboard TGA: strip **Status teknisi** (tab Papan tugas & Teknisi), kolom *Kerja* di tabel teknisi,
  dan status di pemilih teknisi saat menugaskan — berubah **realtime** tanpa muat ulang.
- Form `/tugas-tga`: status tiap teknisi diperbarui tiap 20 detik.
- Jalankan ulang `supabase/04_aplikasi_lapangan.sql` (bagian 046 mendaftarkan `tga_activities` ke Realtime).

### 6c. TGA di FM Command Center (bagian 048)
`/dashboard-viewonly` sekarang punya tab **TGA**: pekerjaan terbuka, teknisi available/busy,
selesai hari ini & bulan ini (dengan rata-rata durasi), daftar status teknisi, pekerjaan terbuka,
jenis pekerjaan & selesai per teknisi, serta grafik selesai per hari.
Di **Ringkasan hari ini** ada sel **TGA** dan butir **Perlu tindakan** untuk tugas urgent yang belum
diterima / tugas yang menunggu > 30 menit (ikut memengaruhi indeks FM).
Data lewat fungsi `tga_board()` — tanpa no. HP, nama requestor, PIN, atau catatan (aman untuk layar publik).

### 7. Form penugasan publik `/tugas-tga` (semua staf GA, bagian 045)
Semua staf GA bisa menugaskan TGA dari HP **tanpa akun dashboard**.
1. Jalankan bagian 045 (jalankan ulang `supabase/04_aplikasi_lapangan.sql` utuh — aman diulang).
2. Dashboard → **TGA → Form penugasan** → isi kode (4–20 huruf/angka, atau tombol **Acak**) →
   **Simpan & aktifkan**. Catat kodenya — kode disimpan terenkripsi dan tidak bisa dilihat lagi.
3. Bagikan tautan `https://<domain>/tugas-tga` (tombol Salin / WhatsApp, juga ada di menu **Tautan**),
   dan berikan kodenya terpisah ke staf GA.
4. Staf membuka tautan → masukkan kode (diingat di perangkat itu) → isi nama pemberi tugas,
   teknisi (atau *Semua TGA*), jenis, pekerjaan, lokasi, urgent, requestor → **Kirim**.
   HP teknisi langsung berdering; tugas tampil di Papan tugas dengan keterangan `Nama · form`.
- Keamanan: 8x kode salah → form terkunci 15 menit; maks 30 tugas per 10 menit lewat form.
  Ganti kode bila ada staf yang keluar, atau **Nonaktifkan form** kapan saja.
- Karyawan non-GA tetap memakai `/request` (permintaan masuk ke *Belum diambil*).


---

## Receptionist

Menu baru: **Dashboard → Fasilitas → Receptionist** (Dashboard, Tamu, Wifi Guest, Barang & Surat, Induction Room, Data Master, Pengaturan).
Ringkasannya juga tampil di **FM Command Center** (tab *Receptionist*, angka di *Ringkasan hari ini*, dan butir *Perlu tindakan*).

### 1. Jalankan SQL (sekali)
Supabase → SQL Editor → jalankan bagian 031 di `supabase/01_dasar.sql`.
Aman dijalankan ulang. Wajib **sesudah** bagian 025 di `supabase/01_dasar.sql` (booking ruangan disinkron ke Kalender & Agenda).

### 1b. Data Master & Bukti Permintaan (SQL tambahan)
Jalankan juga bagian 033 di `supabase/01_dasar.sql` (sesudah 031 & 032):
- kolom **email, no HP, jabatan, aktif** di master karyawan (`employees`) untuk menu Data Master → Data Karyawan;
- **nomor booking** `BK-YYMM-###`, email PIC booking, dan **token tautan bukti** untuk wifi / barang / booking;
- fungsi `rcp_receipt` untuk halaman publik **/bukti?t=…** (bisa dibuka requestor tanpa login).
Bila suatu saat `031` dijalankan ulang, jalankan ulang `033` sesudahnya.

### 2. Deploy fungsi email
```
supabase functions deploy send-receptionist-email
```
Memakai secrets yang sama dengan fungsi email lain: `GMAIL_USER`, `GMAIL_APP_PASSWORD`.
Jika fungsi belum di-deploy, transaksi tetap tersimpan — hanya email yang gagal (muncul peringatan di layar).
**Deploy ulang** setiap kali file fungsi ini berubah (versi terbaru: email bergaya tiket + tombol "Lihat & cetak bukti",
dan email konfirmasi booking ruangan ke PIC). Tidak ada fungsi baru — halaman bukti memakai RPC `rcp_receipt`.

### 3. Hak akses menu
Akun dengan `allowed_tabs` terbatas perlu ditambah `receptionist` agar menu muncul.
Akun dengan `allowed_tabs = null` (akses penuh) langsung melihat menunya.

#### Akun khusus resepsionis (role `receptionist`)
1. Supabase → Authentication → Users → **Add user → Create new user**:
   email `receptionist@cikops.com`, isi password, centang **Auto Confirm User**.
2. Jalankan bagian 032 di `supabase/01_dasar.sql` di SQL Editor.

Akun ber-role `receptionist` dikunci ke menu Receptionist saja: tanpa Home, Ringkasan,
Kalender, pencarian, atau menu lain. URL menu lain otomatis diarahkan kembali ke Receptionist.
Untuk membuat akun resepsionis lain: buat user baru, lalu
`update profiles set role = 'receptionist', allowed_tabs = array['receptionist'] where id = (select id from auth.users where email = '...');`

### Dashboard harian & buku tamu (bagian 055)
**Dashboard** menampilkan angka HARIAN untuk tanggal yang dipilih (default hari ini; panah ‹ › atau kalender di bagian atas, tombol *Kembali ke hari ini*):

| Kartu | Isi |
|---|---|
| **Dokumen masuk** | jumlah **catatan** masuk pada hari itu, berapa yang sudah diserahkan / masih menunggu, dan (bila ada) total barangnya |
| **Dokumen keluar** | jumlah **catatan** keluar, sudah diserahkan / menunggu, dan total barangnya |
| **Booking Induction Room** | jumlah agenda, total jam terbooking, atau agenda berikutnya |
| **Peminjaman Wifi Guest** | jumlah pemberian akun wifi pada hari itu, jumlah slot, dan tamu yang masih aktif |
| **Tamu datang** | jumlah ORANG (rombongan dijumlah), banyak kunjungan, dan yang masih di lokasi |

Tiap kartu punya tren 14 hari (garis kecil), selisih dengan hari sebelumnya, dan bisa diketuk untuk membuka tab terkait
(kartu Dokumen masuk / keluar membuka tab Barang & Surat pada **tanggal & arah yang sama**).

#### Aturan hitung (supaya angka bisa dicocokkan)
- **Hari = WIB**, sama dengan database, apa pun zona waktu perangkat. Dashboard otomatis pindah ke hari baru lewat tengah malam,
  dan data disegarkan sendiri tiap menit (serta saat tab dibuka kembali) — angka tidak basi bila ada pengguna / perangkat lain yang mencatat.
- **Dokumen / barang masuk & keluar** = jumlah **CATATAN** yang dicatat pada tanggal itu (satu catatan = satu hitungan, berapa pun kolom *Jumlah*-nya).
  Bila ada catatan berjumlah lebih dari 1 (mis. "Surat ×3"), kartu menambahkan keterangan "total N barang". Kartu juga menyebut berapa catatan yang
  sudah diserahkan dan berapa yang menunggu **dari catatan hari itu saja**, dan rincian catatan per jenis (Paket, Dokumen / Surat, Makanan, Barang lain).
  Barang yang dicatat di hari lain tetapi diserahkan hari ini TIDAK dihitung sebagai masuk/keluar hari ini
  (ditampilkan terpisah di tab Barang & Surat → *Hari ini / per tanggal*).
- **Peminjaman Wifi Guest** = pemberian akun wifi yang **dibuat** pada tanggal itu. Kapasitas (total slot, terpakai, tersedia, akun berlaku, tamu aktif)
  adalah kondisi **saat ini** dan ditampilkan terpisah di panel *Kapasitas Wifi Guest* (bukan angka harian).
- **Tamu datang** = jumlah ORANG pada tanggal kunjungan itu; tamu dari hari lalu yang belum dicatat pulang tidak ikut angka hari ini — muncul sebagai
  catatan "belum dicatat pulang" dengan tombol *Rapikan*.
- **Barang menunggu** (di hero & kartu bawah) adalah total semua hari, termasuk yang lama — diberi label "semua hari".
- **FM Command Center** (tab Receptionist) memakai aturan yang sama (SQL bagian 056): *Masuk hari ini*, *Keluar hari ini*, dan *Diserahkan hari ini* dipisah.
  Sebelumnya satu angka "dicatat hari ini" menjumlah masuk + keluar sehingga bisa lebih besar dari barang masuk sebenarnya (mis. 10 masuk + 1 keluar = 11).
- Bila angka tidak cocok dengan hitungan manual: ketuk kartunya → daftar per tanggal memuat persis catatan yang dihitung.
  Angka utama sudah per catatan, jadi 10 catatan tetap tampil 10; bila ada catatan dengan **Jumlah lebih dari 1** (mis. "Dokumen / Surat ×2"), total barang (11) hanya muncul sebagai keterangan. Daftar menandainya dengan
  lencana "Jumlah ×N" dan ringkasan menyebut nomor catatannya; bila jumlahnya keliru, perbaiki lewat **✎ Ubah**. Satu pemilih tanggal dipakai bersama
  oleh daftar dan tombol *Lembar kurir* (lembar kurir = barang keluar yang dicatat atau diserahkan pada tanggal itu).
Di bawahnya: **Aktivitas 14 hari** (ketuk batang untuk pindah ke hari itu, arahkan kursor untuk rincian, ketuk nama di legenda untuk
menampilkan/menyembunyikan jenis aktivitas), **Sedang di lokasi** (tamu yang belum pulang + tombol *Pulang*), **Jejak hari ini**
(tamu datang/pulang, barang masuk/keluar/diserahkan, wifi, booking — urut waktu), **jadwal Induction Room** (garis waktu + penanda "sekarang"),
barang menunggu, akun wifi yang akan habis, dan pemakaian wifi per departemen. Tombol aksi cepat di bagian atas membuka form yang dituju.

**Tab Tamu = buku tamu.** *Tamu datang* → isi nama (tamu yang pernah datang muncul sebagai saran, instansi & HP terisi sendiri), jumlah orang
(rombongan cukup satu baris), bertemu siapa (dari Data Karyawan; departemen terisi sendiri), keperluan, no. kartu tamu, dan jam datang
(otomatis sekarang; boleh diisi mundur untuk koreksi). Saat tamu keluar tekan **Pulang**. Daftar per tanggal bisa difilter (Di lokasi / Sudah pulang),
dicari, diubah (termasuk jam datang & pulang), dibatalkan pulangnya, dihapus (bila salah catat), dan diekspor ke Excel/PDF. Kunjungan yang
sudah > 4 jam tanpa Pulang diberi petunjuk "lupa check-out?".
- Hak akses: yang mengelola Receptionist bisa mengisi; role Management hanya membaca.
- **Syarat:** jalankan `supabase/04_aplikasi_lapangan.sql` (bagian 055 dan 056) di Supabase SQL Editor. Sebelum itu, tab Tamu menampilkan petunjuk
  dan bagian dashboard lain tetap berjalan.

### Pemilihan akun wifi sesuai durasi
Akun wifi dari IT punya "tipe" menurut panjang masa berlakunya (mis. 7, 30, 60 hari). Pada pilihan **1 minggu / 1 bulan / 3 bulan**,
sakelar **Utamakan akun yang sesuai durasi** (aktif secara bawaan) memilih tipe terkecil yang cukup panjang: 1 minggu → akun 7 hari,
1 bulan → akun 30 hari, 3 bulan → tipe terpanjang yang ada. Akun yang sudah berjalan beberapa hari bisa habis sedikit lebih cepat dari
durasi yang diminta; dalam hal itu **tanggal selesai otomatis disesuaikan ke tanggal habis akun** dan tampil peringatan kuning
(tanggal yang sama yang tercetak di tanda terima), jadi tamu tidak pernah diberi akun yang habis sebelum tanggal di tanda terima.
Matikan sakelar untuk perilaku ketat (hanya akun yang berlaku penuh sampai tanggal selesai, paling cepat habis dulu).
Untuk Hari ini, 3 hari, dan "Sampai tanggal…" perilaku tetap ketat.

### Koreksi data (ubah / hapus) — SQL 052
Supaya salah input jumlah, penerima, atau tanggal bisa dibetulkan tanpa menghapus semuanya:
- **Barang & Surat:** kolom **Jumlah** (tampil ×N di daftar, bukti, dan laporan). Tombol **✎ Ubah** di daftar Menunggu, Hari ini, dan Riwayat:
  semua isian bisa diubah (arah masuk/keluar dan nomor bukti tetap; bila arah salah, hapus lalu catat ulang). Untuk barang yang sudah
  diserahkan, nama pengambil dan waktu serah terima bisa dikoreksi, atau pilih **↩ Batalkan serah terima** agar barang kembali "Menunggu".
  **Hapus** hanya untuk salah catat (ada konfirmasi yang menyebut nomor, penerima, dan jumlah).
- **Wifi Guest:** di Tamu aktif dan Riwayat ada **✎ Ubah** (nama tamu/requestor, departemen, keperluan, slot, tanggal selesai) dan **Hapus**.
  Tanggal selesai tidak boleh melewati masa berlaku akun, slot tidak boleh melebihi kapasitas akun (dicek di database). Hapus
  mengosongkan slot akun; bila tamu hanya pulang lebih awal, pakai **Kembalikan**.
- Setiap koreksi tercatat (`updated_at` / `updated_by`) dan tampil di daftar sebagai "✎ diubah oleh … · tanggal".
- **Syarat:** jalankan ulang `supabase/04_aplikasi_lapangan.sql` (bagian 052) di Supabase SQL Editor.

### 4. Pengaturan awal (menu Receptionist → Pengaturan)
- Jam operasional ruangan (default 06:00–22:00) dan panjang slot grid (15/30/60 menit).
- Nama wifi (SSID) dan ketentuan — keduanya dicantumkan di email tanda terima.

### Aturan yang ditegakkan database
| Aturan | Keterangan |
|---|---|
| 1 akun = 2 slot | Bisa diubah per akun saat impor (kolom *Slot*). |
| Status akun | Tersedia → Terpakai sebagian → Penuh → Kedaluwarsa (otomatis dari tanggal & slot). |
| Saran akun | Hanya akun yang berlaku sampai tanggal selesai pemakaian; urut dari yang paling cepat habis. |
| Slot kembali | Klik *Kembalikan*, atau otomatis setelah tanggal "berlaku sampai" lewat (tamu harian = akhir hari itu). |
| Nomor tanda terima | `WF-YYMM-###` (wifi), `IN-YYMM-###` (barang masuk), `OUT-YYMM-###` (barang keluar) — urut per bulan. |
| Booking ruangan | Tolak jadwal bentrok & di luar jam operasional; booking berulang bisa melewati tanggal yang bentrok. |
| Buku alamat | Email setiap nama yang pernah diinput diingat otomatis (tabel `rcp_contacts`). |

### Format impor akun dari IT
Tempel dari Excel atau unggah `.xlsx`/`.csv`. Kolom yang dikenali (urutan bebas):
`Username`, `Password`, `Berlaku sampai` (atau `Durasi`/`Hari`), opsional `Berlaku mulai`, `Slot`, `Batch`.
Tanpa baris judul, urutannya: username, password, berlaku sampai. Username yang sudah ada akan diperbarui.

### Bukti Permintaan
Setiap wifi, barang/surat, dan booking punya **Bukti Permintaan**: tiket bernomor unik dengan barcode Code 128
(nomor tanda terima) dan kode verifikasi. Dari tombol 🧾 di setiap daftar:
**Cetak** (A5, hanya tiketnya) · **Salin tautan** (/bukti?t=…) · **WhatsApp** (nomor dari Data Karyawan) · **Email**.
Password wifi di tautan publik otomatis disembunyikan setelah masa akses berakhir atau dikembalikan.

### Data Master
Menu Receptionist → **Data Master** berisi tiga CRUD terpisah:
- **Data Karyawan** — tabel `employees` CIKOPS (tambah/ubah/nonaktifkan/hapus/impor). Email & no HP dipakai untuk
  isi otomatis dan pengiriman bukti. Email yang diketik di form ikut melengkapi data karyawan yang masih kosong.
- **Data Akun Wifi** — akun dari IT (tambah/ubah/impor/nonaktifkan/hapus).
- **Data Driver** — tabel `drivers` CIKOPS yang sama, jadi otomatis sinkron dengan menu Driver, Penugasan, dan aplikasi
  driver. Hapus driver hanya bisa oleh admin (aturan lama); akun lain cukup menonaktifkan.


---

## ATK (Excel ↔ CIKOPS)

> **Sesudah `02_peran_keamanan.sql`:** Excel tidak boleh lagi menulis langsung ke tabel.
> Jalankan `supabase/04_aplikasi_lapangan.sql` (bagian 044) dan ganti modul
> `modSyncCikops.bas` dengan versi terbaru (unduh dari CIKOPS → Tautan → Modul Excel).
> Gejalanya bila belum: "Sinkron Permintaan/Restock ada yang gagal … permission denied for table atk_requests".

### Wajib, urut
1. **Supabase → SQL Editor** → jalankan bagian 026 di `supabase/01_dasar.sql`.
   - Aman dijalankan ulang, dan data lama tidak berubah.
   - Baris paling bawah hasilnya menampilkan **KUNCI SINKRON**. Kunci ini juga bisa dilihat admin di CIKOPS → ATK → tab *Sinkron Excel*.
2. **Excel ATK**:
   - Alt+F11 → hapus modul `modSyncCikops` yang lama → File → Import File → pilih `vba/modSyncCikops.bas`. File yang sama bisa diunduh dari tab *Sinkron Excel*.
   - Isi 3 konstanta: `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (sama seperti dulu), lalu `CIKOPS_SYNC_KEY`.
   - Tombol Sinkron yang lama (`SyncToCikops`) sekarang otomatis **tarik dulu, lalu kirim**.
   - Opsional: buat tombol baru untuk macro `TarikDariCikops`.
3. Upload file kode ke repo → commit → push (Vercel deploy otomatis).

### Cara kerja sinkron
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
  - Ini sudah berlaku begitu bagian 026 (`01_dasar.sql`) berjalan, walaupun VBA belum diganti. Hanya saja, sebelum VBA diganti, Excel tidak akan tahu transaksi dari CIKOPS.
- **Koreksi**:
  - Transaksi CIKOPS bisa **dibatalkan** dari tab Riwayat selama belum ditarik Excel.
  - Setelah ditarik, koreksinya dilakukan di Excel.
- **Keamanan**: menarik data butuh kunci sinkron, karena anon key saja tidak bisa membaca data karyawan. Admin bisa *Ganti kunci* kapan saja.

### Tampilan baru (menu Fasilitas → ATK)
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

### Dua sumber karyawan: ATK dari Excel, modul lain dari Master Karyawan (bagian 054)
| Dipakai oleh | Sumber | Cara mengisi |
|---|---|---|
| **ATK** (form permintaan: saran nama, NIK, departemen) | tabel `atk_employees` | HANYA dari sheet Excel `MasterDataKaryawan` — makro `SyncKaryawanOnly` (kolom A NIK, B Nama, C Departemen) |
| **Semua modul lain** (Receptionist, TGA, penugasan driver, permintaan karyawan, Laporan) | tabel `employees` = Master Data → Pegawai | diunggah langsung lewat Supabase (lihat di bawah) atau diubah di Master Data |

- Kedua daftar **tidak saling memengaruhi**. Transaksi ATK tidak lagi menambah / mengubah Master Karyawan, dan
  riwayat ATK tidak dipakai lagi untuk saran nama / departemen (departemen lama yang salah tidak ikut muncul).
- **Excel = sumber ATK:** mengirim ulang sheet *menimpa* nama & departemen di daftar ATK (cocok per NIK; bila NIK
  kosong, per nama). Perbaiki departemen di Excel, jalankan `SyncKaryawanOnly`, selesai.
- Selama sheet belum pernah dikirim, saran nama di form ATK kosong (nama tetap bisa diketik manual) dan form
  menampilkan petunjuk.
- **Syarat:** jalankan `supabase/04_aplikasi_lapangan.sql` (bagian 054) di Supabase SQL Editor, lalu pasang makro
  `modSyncCikops` versi terbaru (kunci sinkron tidak berubah). Bagian 054 juga melepas sambungan lama
  ATK → Master Karyawan; isi `employees` TIDAK dihapus oleh SQL ini.

#### Mengganti seluruh Master Karyawan (CSV baru, lewat tabel sementara)
Import CSV di Supabase hanya **menambah** baris — tidak memperbarui yang sudah ada. Jadi data lama harus diganti, bukan ditimpa.
Cara paling aman: impor ke **tabel sementara** dulu, periksa, baru tukar dalam satu transaksi (tabel `employees` tidak pernah kosong di tengah jalan).
1. **Cadangkan:** Supabase → Table Editor → `employees` → Export CSV.
2. **Siapkan CSV** dengan kolom `nik`, `nama`, `departement` (ejaan kolom persis begitu, bukan "department"). Satu orang satu baris,
   satu ejaan per departemen. NIK dibaca sebagai **teks** (Excel bisa membuang angka 0 di depan — simpan "CSV UTF-8" dan format kolom NIK sebagai Text).
3. **Buat tabel sementara** (SQL Editor), lalu Table Editor → `employees_new` → Insert → Import data from CSV:
   ```sql
   create table employees_new (nik text, nama text, departement text);
   alter table employees_new enable row level security;   -- data karyawan tidak boleh terbuka lewat API
   ```
4. **Periksa isi CSV** sebelum menukar:
   ```sql
   select count(*) total, count(*) filter (where nullif(trim(nama),'') is null) nama_kosong,
          count(*) filter (where nullif(trim(departement),'') is null) dept_kosong from employees_new;
   select nullif(trim(nik),'') as nik, count(*) from employees_new where nullif(trim(nik),'') is not null group by 1 having count(*) > 1;  -- NIK ganda
   select departement, count(*) from employees_new group by 1 order by 2 desc;   -- cek ejaan departemen
   ```
5. **Tukar** (satu kali jalan; bila ada error, tidak ada yang berubah). **Pakai `delete`, JANGAN `truncate ... cascade`** — cascade ikut menghapus seluruh kegiatan TGA:
   ```sql
   begin;
     delete from employees;
     insert into employees (nik, nama, departement)
       select nullif(trim(nik), ''), trim(nama), nullif(trim(departement), '') from employees_new where nullif(trim(nama), '') is not null;
     -- sambungkan lagi kegiatan TGA ke karyawan baru (hanya nama yang unik)
     update tga_activities a set requestor_id = m.id
       from (select lower(trim(nama)) as k, (array_agg(id))[1] as id from employees group by 1 having count(*) = 1) m
      where a.requestor_id is null and lower(trim(a.request_by)) = m.k;
     select count(*) as employees_sekarang from employees;   -- harus sama dengan jumlah baris CSV
   commit;
   drop table employees_new;
   ```
- Kegiatan TGA lama tetap utuh (nama & departemen tersimpan sebagai teks). Transaksi ATK / Receptionist / penugasan tidak terpengaruh.
- Departemen di transaksi lama tidak ikut berubah — itu riwayat. Transaksi baru memakai departemen terbaru.
- Sesudahnya: Master Data → Pegawai → **Cek karyawan dobel** harus kosong atau hanya berisi nama kembar yang memang orang berbeda.

### Karyawan dobel (bagian 053)
Satu orang bisa tercatat dua kali dengan departemen berbeda (mis. `SCM Pack Sachet` dan `Operations - Cikarang`), misalnya
akibat NIK yang berbeda ketik. Alat ini untuk memeriksa dan merapikannya, juga setelah unggah ulang.
- Master Data → Pegawai → **Cek karyawan dobel** menampilkan **pratinjau** — belum ada yang berubah.
- **Pasangan siap digabung** = nama sama, tepat dua baris, salah satunya `Operations - Cikarang`. Hasil gabung:
  baris lama dipertahankan, departemen jadi **Operations - Cikarang**, NIK kedua baris digabung `A / B`,
  email / HP / jabatan diambil dari yang terisi, kegiatan TGA dipindah ke baris yang bertahan, baris kembar dihapus.
  Hilangkan centang pada pasangan yang ternyata dua orang berbeda, lalu **Gabungkan … terpilih**.
- **Nama kembar lain** (mis. dua “Budi Santoso” dengan NIK dan departemen berbeda) hanya ditampilkan untuk dicek
  manual lewat tabel Pegawai — bisa jadi memang orang berbeda.
- **Riwayat tidak berubah:** transaksi lama (ATK, Receptionist, penugasan, kegiatan TGA yang sudah selesai)
  tetap memuat departemen saat itu; transaksi baru memakai departemen terbaru. Kegiatan TGA yang masih berjalan
  ikut departemen terbaru bila Master diubah.
- **Syarat:** jalankan `supabase/04_aplikasi_lapangan.sql` (bagian 053) di Supabase SQL Editor.

### File
- Baru:
  - `src/app/dashboard/AtkTab.tsx`
  - `src/app/dashboard/atk.module.css`
  - bagian 026 di `supabase/01_dasar.sql`
  - `vba/modSyncCikops.bas`
  - `public/downloads/modSyncCikops.bas`
- Berubah:
  - `src/app/dashboard/page.tsx` (AtkTab lama dihapus)
  - `src/lib/api.ts`
  - `src/lib/types.ts`


---

## Kalender & agenda

### Wajib (sekali saja)
Supabase CIKOPS → SQL Editor → jalankan bagian 025 di `supabase/01_dasar.sql`.
Skrip ini menambah kolom jenis agenda, jam selesai, PIC, catatan, dan tautan penugasan, serta izin UBAH.
Aman dijalankan ulang, dan agenda lama tetap ada (jenisnya menjadi "Event").
Sebelum skrip dijalankan, kalender tetap bisa dipakai, tetapi jenis/catatan/PIC tidak tersimpan.

### Yang baru
- Menu **Sistem → Kalender** (`/dashboard/calendar`): kalender bulan penuh.
  - Agenda dan penugasan driver tampil di tiap tanggal.
  - Filter per jenis.
  - Panel tanggal terpilih dan daftar agenda mendatang.
- **Agenda CRUD**:
  - Jenis: Kunjungan, Event, Meeting, Pelatihan, Libur, Lainnya.
  - Isian: judul, tanggal, jam mulai–selesai, lokasi, PIC, catatan.
  - Ubah dengan klik agendanya; hapus dengan tombol 🗑 atau tombol Hapus di formulir.
- **Sinkron penugasan driver**:
  - Penugasan (tasks_detail) muncul otomatis di tanggalnya dan diperbarui tiap 60 detik, termasuk statusnya (Ditugaskan/Berjalan/Selesai/Batal).
  - Agenda bisa **ditautkan** ke penugasan, misalnya kunjungan tamu yang dijemput driver. Status penugasan ikut tampil di agenda.
  - Tombol **+ Agenda** di penugasan membuat agenda kunjungan yang sudah terisi dari data penugasan.
  - **Buka di Penugasan →** membuka menu Penugasan langsung pada tanggal tersebut.
- Home (kolom kanan) memakai kalender yang sama dalam versi ringkas, dengan tautan "Kalender lengkap →".

### File
- Baru:
  - `src/app/dashboard/CalendarAgenda.tsx`
  - `src/app/dashboard/calendar.module.css`
  - bagian 025 di `supabase/01_dasar.sql`
- Berubah:
  - `src/app/dashboard/page.tsx`
  - `src/lib/api.ts`
  - `src/lib/types.ts`
  - `src/components/Icon.tsx`


---

## Notifikasi (Web Push)

### 1. Activate it (once)
1. **SQL:** Supabase → SQL Editor → paste the **entire** bagian 036 di `supabase/01_dasar.sql` → Run (after 034 & 035).
2. **Notification keys (VAPID)** — on a computer with Node.js:
   ```
   npx web-push generate-vapid-keys
   ```
   Copy the result to Supabase → Edge Functions → **Secrets**:
   - `VAPID_PUBLIC_KEY`  = Public Key
   - `VAPID_PRIVATE_KEY` = Private Key (keep it secret)
   - `VAPID_SUBJECT`     = `mailto:your-ga-email@company.com`
3. **Deploy the function:** `supabase functions deploy send-web-push`
4. Redeploy the website (Vercel) so the new service worker (`sw.js` v3) is active.

### 2. Turn on notifications on the phone
- **TGA app:** Profil tab → **🔔 Aktifkan notifikasi** → allow → press **Kirim tes**.
- **Driver app:** Profil tab → section *Notifikasi* → **Aktifkan** → **Tes**.
- **iPhone:** iOS 16.4+, and the app must be added to the **Home Screen** and opened from its icon.
- **OneSignal / APK Median sudah dihapus.** Semua notifikasi driver & TGA memakai Web Push ini.
  Driver memakai APK **CIKOPS Driver** dari GitHub (atau pasang sebagai PWA), lalu aktifkan notifikasi.

### 3. How it rings
| Situation | What happens |
|---|---|
| App **closed** / phone locked | System notification: the phone's default notification sound + vibration. Urgent tasks stay on screen until tapped. Tap → the app opens. |
| App **open** (TGA) | Rings with the CIKOPS ringtone (`notif.wav`) up to 6 times + vibrates + a **"Tugas baru"** pop-up with the *Terima & kerjakan* button. The app checks for new tasks every 20 seconds. |
| App **open** (Driver) | Same as before: ringtone + voice announcement + vibration. |

> A web notification cannot use a custom ringtone when the app is closed; Android/iOS uses the
> notification sound from the phone's settings. To make it louder: Phone settings → Apps → Chrome / CIKOPS → Notifications → sound & priority.

### 4. TGA task flow (like the driver flow)
1. **Admin:** Dashboard → Fasilitas → Cleaning & Gardening → **TGA** tab → **Papan tugas TGA** → **＋ Tugaskan TGA**.
   - Pick a technician, or **Semua TGA (siapa cepat)** = the first technician to take it.
   - Category, job, location, requestor (from Data Karyawan), phone number, priority, note → **🔔 Kirim tugas**.
2. **Employee:** opens `/request` → **Perbaikan / Teknisi GA** → fills in the location & problem → sends.
   It goes into *Belum diambil* and every TGA phone rings.
3. **Technician:** the phone rings → **Terima & kerjakan** (or **Ambil tugas** for requests) → status *Proses*
   → once finished, tap **✓ Tandai selesai** (status, notes, and end time can be changed).
4. The admin sees the board: *Belum diambil → Menunggu diterima → Dikerjakan → Selesai hari ini*,
   can **reassign** (the task goes back to "Baru" and the new technician's phone rings) or **cancel**.
- Technicians cannot delete tasks from the admin / employees (only their own entries).
- If two technicians tap "Ambil" at the same time, only the first one gets it; the other is told "sudah diambil teknisi lain".


---

## APK Android (Driver & TGA)

### Why TGA and Driver could not be installed together before
Both apps live on the same domain. The driver manifest (`manifest.json`) had no `id`/`scope`, so it
claimed **the whole domain** (`/`) as its own. Chrome then treated TGA (`/tga`) as being *inside*
the driver app, and only one of them could be installed.
**Fixed:** Driver now has `id`+`scope` = `/driver` and TGA has `/tga`. They are separate apps and can be
installed side by side (names on the phone: **CIKOPS Driver** and **CIKOPS TGA**).
> If the old version is already installed on a phone: uninstall it once, open the link again, and reinstall.

### APK built through GitHub Actions
The APK is a *Trusted Web Activity*: a real Android app (it has its own icon and opens full screen) that
displays the CIKOPS page. Web updates show up in the app right away, so it does **not** need to be
rebuilt every time the website changes.

#### Building the APK
1. GitHub → repository → **Actions** tab → **APK Android (TGA & Driver)** → **Run workflow**.
   - `app`: semua / tga / driver
   - `site_url`: leave empty (uses the `SITE_URL` variable or `https://cikops-onefm.vercel.app`)
2. Wait about 3–5 minutes → open that run → the **Artifacts** section → download `APK-tga` / `APK-driver` (zip → contains the .apk).
3. Send the .apk to the phone (WhatsApp/Drive) → open it → allow "Install unknown apps" → Install.

> If the domain is different, set it once at: Settings → Secrets and variables → Actions → **Variables** → `SITE_URL`.

#### Saving the APK key (once, important)
On the first build GitHub creates a new key and attaches it as the artifact
**KUNCI-APK-simpan-ke-secrets-lalu-hapus**. Download it, then in Settings → Secrets and variables → Actions →
**New repository secret**, create 3 secrets from the contents of the files:
| Secret | Contents from file |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | ANDROID_KEYSTORE_BASE64.txt |
| `ANDROID_KEYSTORE_PASSWORD` | ANDROID_KEYSTORE_PASSWORD.txt |
| `ANDROID_KEY_ALIAS` | ANDROID_KEY_ALIAS.txt |

After that, **delete** the key artifact from the run page. Also keep a copy of the files somewhere safe.
Without a saved key, every build signs with a different key → the APK cannot be updated (it has to be uninstalled first).

#### Full screen without an address bar
Android checks that the website "approves" the app. In each run's summary there is a **SHA-256 fingerprint**.
Enter it in Vercel → Settings → Environment Variables → `TWA_SHA256` → **Redeploy**.
Check it: open `https://<domain>/.well-known/assetlinks.json` — it should show `com.cikops.tga` and `com.cikops.driver`.
Before this is set, the app still works but shows a thin address bar at the top.

### Notifikasi native (Firebase) — bunyi & getar seperti aplikasi asli
Tanpa Firebase, APK memakai notifikasi web: bunyinya suara notifikasi bawaan HP dan bisa
"tidur" saat HP hemat baterai. Dengan Firebase Cloud Messaging (FCM), APK punya kanal
notifikasi sendiri: **bunyi CIKOPS + getar panjang, muncul di atas layar, dan tugas baru
berbunyi berulang sampai notifikasinya dibuka** (seperti panggilan masuk).

**Pasang sekali:**
1. https://console.firebase.google.com → **Add project** (mis. `cikops`). Google Analytics boleh dimatikan.
2. Di project itu, **Add app → Android** dua kali:
   - package `com.cikops.driver` (nama: CIKOPS Driver)
   - package `com.cikops.tga` (nama: CIKOPS TGA)
3. Unduh **google-services.json** (sesudah kedua aplikasi ditambahkan, file ini berisi keduanya).
   GitHub → Settings → Secrets and variables → Actions → **New repository secret**
   `GOOGLE_SERVICES_JSON` = seluruh isi file itu.
4. Firebase → ⚙ Project settings → **Service accounts** → **Generate new private key** → unduh JSON.
   Supabase → Edge Functions → Secrets → `FCM_SERVICE_ACCOUNT` = seluruh isi JSON itu.
   Lalu deploy ulang `send-web-push`.
5. Jalankan `supabase/04_aplikasi_lapangan.sql` (bila belum).
6. Actions → **APK Android (TGA & Driver)** → Run workflow. Ringkasan run menulis
   "Notifikasi native (Firebase): **aktif** 🔔". Pasang APK baru di HP (menimpa APK lama,
   selama kunci APK sama).

**Di HP:** buka aplikasi → izinkan notifikasi → login. HP terdaftar otomatis (muncul pesan
"🔔 Notifikasi aktif di HP ini"); tidak perlu menekan tombol apa pun. Tes lewat Profil → **Kirim tes**.
Bunyi dan getar bisa diatur per kanal di Pengaturan HP → Aplikasi → CIKOPS → Notifikasi
(kanal **Tugas baru** dan **Info**).

> Merek HP yang agresif menghemat baterai (Xiaomi, Oppo, Vivo, Realme): Pengaturan → Baterai →
> CIKOPS Driver/TGA → **Tanpa batasan**, dan izinkan *Autostart*. Tanpa ini notifikasi bisa terlambat.

### Catatan untuk driver
OneSignal / APK Median sudah tidak dipakai. Driver yang masih memakai APK Median harus pindah ke APK
**CIKOPS Driver** (GitHub Actions di atas), lalu Profil → Notifikasi → **Aktifkan** supaya tetap
mendapat notifikasi tugas.

## Self-Claim driver
Driver mengajukan klaim sendiri dari aplikasi; admin tidak perlu mengetik ulang, cukup
memeriksa dan memverifikasi.

**Pasang:** jalankan `supabase/04_aplikasi_lapangan.sql` (sesudah `02_peran_keamanan.sql`), lalu deploy website.

**Alur:**
1. **Driver:** tombol **＋** di aplikasi driver (atau tab Klaim) → tanggal pengeluaran → rincian
   (Bensin/Tol/Parkir/Servis/…, nominal boleh dijumlah: `50000+25000`) → **Nota: menyusul / sudah ada**
   → keterangan → **Kirim ke admin**. Draf tersimpan di HP bila aplikasi tertutup.
   Selama belum diproses, driver masih bisa **mengubah** atau **membatalkan** pengajuannya.
2. **Admin Finance:** Dashboard → Finance → Klaim → tab **Pengajuan driver** (ada angka jumlah yang
   menunggu, muncul langsung tanpa refresh) → **Periksa & verifikasi** membuka form klaim yang sudah terisi.
   Koreksi bila tidak sesuai nota → **Verifikasi & buat klaim**. Klaim resmi dibuat dan driver mendapat
   notifikasi "Klaim diverifikasi" (ditandai "dikoreksi admin" bila nominal berubah).
   Atau **Tolak** dengan alasan; alasan tampil di aplikasi driver.
3. Pengajuan yang belum diverifikasi **tidak** masuk rekap mingguan, laporan, maupun Dana Operasional.

**Hak akses:** yang bisa memverifikasi/menolak hanya role yang mengelola Finance
(Master Admin, Admin GA CIK, dan role lama admin/ga). Driver hanya melihat pengajuannya sendiri.

## Tautan (menu Sistem → Tautan)
Semua link CIKOPS di satu halaman: aplikasi Driver & TGA, halaman publik (permintaan karyawan,
locker, pembagian, kantin, pos gate, Command Center TV), link login per role, link langsung ke
setiap menu, Security Desk, dan modul Excel. Setiap link punya tombol **Salin**, **Buka**,
**WA** (kirim lewat WhatsApp beserta keterangannya), dan **QR** (unduh PNG / cetak).
Setiap akun hanya melihat link untuk modul yang boleh dibukanya. **Salin semua link** menyalin
daftar lengkap sebagai teks. Bagian **Link lainnya** untuk link di luar CIKOPS (mis. APK di
Google Drive, SOP) — bisa ditambah/diubah oleh Master Admin & Admin GA CIK.

## Deployment DEMO (presentasi ke perusahaan lain)
Deployment terpisah dengan **database terpisah** dan perusahaan fiktif *PT Nusantara Prima Industri*
(plant **Cikupa** & **Parung**). Data asli tidak pernah ikut: yang disalin dari produksi hanya **struktur**
tabel/fungsi, lalu diisi data dummy lengkap untuk semua modul. Tanggal data selalu relatif hari ini
dan disegarkan otomatis tiap pagi, jadi demo selalu terlihat "hidup".

### 1. Project Supabase demo (sekali)
1. supabase.com → **New project** → nama mis. `cikops-demo` (paket gratis cukup).
2. Project demo → **Connect** → *Session pooler* → salin connection string (ganti `[YOUR-PASSWORD]`).
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `DEMO_DB_URL` = connection string tadi. (`CIKOPS_DB_URL` sudah ada dari Backup.)
4. GitHub → **Actions → Demo database → Run workflow** → aksi **setup**.
   Workflow menyalin struktur produksi (tanpa data), menjalankan file 04, lalu mengisi data demo.
   Peringatan kuning di log = modul yang dilewati / fungsi yang memanggil URL luar — kirim ke saya bila ada.
5. Project demo → **Authentication → URL Configuration** → *Site URL* = alamat Vercel demo (langkah 2).

### 2. Project Vercel demo (sekali)
Vercel → **Add New → Project** → impor repo yang sama → nama mis. `cikops-demo` → **Environment Variables**:

| Variable | Nilai |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dari project Supabase **demo** (Settings → API) |
| `NEXT_PUBLIC_DEMO_MODE` | `1` |
| `NEXT_PUBLIC_COMPANY_NAME` | `PT Nusantara Prima Industri` |
| `NEXT_PUBLIC_PLANT_CIK_NAME` / `NEXT_PUBLIC_PLANT_PRB_NAME` | `Cikupa` / `Parung` |
| `NEXT_PUBLIC_ADMIN_NAME` | mis. `Rina Kusuma` |
| `NEXT_PUBLIC_MAP_CENTER` | `-6.2357,106.5106` (peta pom bensin) |

**Jangan** isi `GC_*`, `SUPABASE_SERVICE_ROLE_KEY`, atau secret produksi lain. Di mode demo, data
Security Desk & pelanggaran G-C dibuat otomatis (fiktif) tanpa koneksi ke luar.
Deployment produksi tidak berubah: tanpa variable di atas, nama perusahaan & plant tetap seperti biasa.

### 3. Akun demo (password semua: `Demo2026!`)
Di halaman login demo ada panel **Coba akun demo** — sekali klik langsung masuk.

| Akun | Role |
|---|---|
| `master@demo.cikops.id` | Master Admin — semua modul |
| `ga.cik@demo.cikops.id` | Admin GA Cikupa — fleet, finance, fasilitas |
| `ga.prb@demo.cikops.id` | Admin GA Parung |
| `iss@demo.cikops.id` | Admin / SPV ISS — Cleaning, Gardening & TGA |
| `security@demo.cikops.id` | Admin Security |
| `resepsionis@demo.cikops.id` | Receptionist |
| `manajemen@demo.cikops.id` | Management — Command Center & laporan |
| `driver.andi@demo.cikops.id` | Aplikasi driver `/driver` (tombol *Masuk sebagai driver demo*) |

Aplikasi TGA `/tga`: pilih teknisi mana saja, PIN `1234`. Form penugasan `/tugas-tga`: kode `DEMO2026`.
Command Center publik: `/dashboard-viewonly`. Semua halaman menampilkan pita **DEMO · DATA FIKTIF**.

### 4. Isi data demo
- **Fleet:** 17 driver (pool, support, Driver User), 15 kendaraan (beberapa dokumen hampir jatuh tempo),
  ±1.000 tugas 45 hari terakhir + hari ini + 5 hari ke depan, log gate, klaim mingguan, Self-Claim menunggu
  verifikasi, dana operasional 4 periode, lembur, pom bensin di peta.
- **Fasilitas:** 64 karyawan, kantin 60 hari, ATK (stok kritis & habis), 72 locker, printer & permintaan,
  permintaan karyawan, pembagian bingkisan, pengumuman, kalender.
- **Receptionist:** wifi tamu, paket masuk/keluar, booking Induction Room.
- **Cleaning & Gardening:** mode CIKOPS, master pekerjaan, jadwal 2 bulan + actual, event, improvement, inventory.
- **TGA:** 4 teknisi, ±140 pekerjaan, tugas terbuka (urgent, menunggu, butuh part).
- **Security & NC:** dibuat otomatis oleh aplikasi (mode demo).

### 5. Sehari-hari
- Data diisi ulang otomatis tiap pagi 05.45 WIB (aksi *refresh*). Setelah presentasi yang banyak mengubah
  data, jalankan **Run workflow → refresh** untuk kembali ke kondisi awal.
- Perubahan kode di `main` otomatis ter-deploy ke produksi **dan** demo (dua project Vercel dari repo yang sama).
- Fitur yang butuh Edge Function (kirim email, notifikasi HP, kelola akun) tidak aktif di demo kecuali
  function-nya di-deploy juga ke project demo.

## Deployment Mockup (tanpa Supabase, tanpa login)
Mode **Mockup** menjalankan seluruh aplikasi CIKOPS dengan *backend tiruan di browser* — tanpa database,
tanpa Supabase, tanpa akun sama sekali. Cocok untuk presentasi kilat di laptop, pameran, atau demonstrasi
kepada calon klien yang belum dapat akses internet.

### Cara kerja
Semua data (±1.600 baris / 46 tabel) dibuat ulang di `localStorage` tiap hari baru. Perubahan yang
dilakukan selama demo — terima tugas, catat pekerjaan, input kantin, dsb. — tersimpan di browser
yang sama; tombol **↺ Reset** mengembalikan semuanya ke kondisi awal kapan saja.

### 1. Buat project Vercel mockup (sekali)
1. Vercel → **Add New → Project** → impor repo yang sama → nama mis. `cikops-mockup`.
2. **Environment Variables** — hanya satu variabel yang perlu diisi:

| Variable | Nilai |
|---|---|
| `NEXT_PUBLIC_MOCK_BACKEND` | `1` |

Jangan isi variabel Supabase, GC, atau variabel rahasia lain. Tidak diperlukan.

3. **Deploy**. Selesai — tidak ada setup database, tidak ada workflow.

### 2. Halaman utama
Landing page otomatis mengarah ke **`/demo`** — pusat demo berisi:
- **7 kartu role** → klik masuk langsung sebagai role tersebut ke dashboard.
- **8 kartu aplikasi** → link langsung ke /driver, /tga, /tugas-tga, /request, /gate, /canteen, /locker, /gift.
- **Tombol Reset** → kembalikan semua data ke kondisi awal.

### 3. Navigasi antar-role
Di setiap halaman ada tombol **DEMO · DATA FIKTIF** di sudut kiri bawah.
Klik → panel muncul → pilih role lain → langsung masuk ke dashboard sebagai role itu.

| Role | Deskripsi |
|---|---|
| Master Admin | Semua modul, semua plant |
| Admin GA Cikupa | Fleet, Finance, Fasilitas — plant CIK |
| Admin GA Parung | Sama, plant PRB |
| Admin / SPV ISS | Cleaning & Gardening, TGA |
| Admin Security | Modul Security & NC |
| Receptionist | Resepsionis |
| Management | Command Center & laporan saja |

### 4. Aplikasi pendukung (tanpa login)
| Alamat | Deskripsi |
|---|---|
| `/driver` | App driver — otomatis masuk sebagai Andi |
| `/tga` | App TGA — pilih nama teknisi, PIN: **1234** |
| `/tugas-tga` | Form penugasan TGA publik — kode: **DEMO2026** |
| `/request` | Form permintaan karyawan |
| `/gate` | Input gate security |
| `/canteen` | Input laporan kantin |
| `/locker` | Daftar & lepas locker |
| `/dashboard-viewonly` | FM Command Center (TV publik) |

### 5. Catatan penting
- Data **hanya ada di browser** yang sedang digunakan. Buka di browser/device lain → data baru.
- Perubahan kode di `main` otomatis ter-deploy ke project mockup Vercel, sama seperti deployment lain.
- Mockup tidak memerlukan *edge function*, *service worker*, atau koneksi internet (setelah halaman dimuat).
- Fitur yang mengirim email/notifikasi HP tetap bisa diklik dan tidak error, tetapi tidak benar-benar mengirim.

## Report — Laporan Manajemen
Report → Laporan Manajemen menyusun ringkasan umum per modul, dikelompokkan sesuai kategori menu:

| Kategori | Modul laporan |
|---|---|
| Fleet & Kendaraan | **Fleet Management** — penugasan driver, armada terpakai, dokumen jatuh tempo |
| Finance | **Klaim Driver** — pengeluaran per kategori |
| Fasilitas | **Kantin**, **ATK**, **Cleaning & Gardening** (achievement plan vs actual), **TGA** (pekerjaan teknisi: selesai, belum selesai, urgent, per teknisi), **Receptionist** (akses wifi tamu, barang & surat + tingkat serah terima, pemakaian Induction Room, kapasitas akun wifi) |
| Security | **Security** — kendaraan, visitor, transporter, pelanggaran, kejadian, patroli |

Setiap modul berisi 4 angka utama, 2 grafik, temuan, dan rekomendasi; ringkasan eksekutif di atas
memuat butir "perlu perhatian manajemen". Unduh sebagai Excel, PowerPoint, atau PDF (Indonesia / English).
Modul yang tampil mengikuti role (mis. Admin ISS hanya Cleaning & Gardening dan TGA).

### Cara membaca angka — perbandingan, catatan data, dan istilah
- **Perbandingan yang adil.** Bulan yang sedang berjalan dipotong sampai **hari ini** dan dibandingkan dengan **rentang hari yang sama**
  di bulan lalu (1–3 Nov ↔ 1–3 Okt), bukan dengan satu bulan penuh. Label periode memuat "(data s.d. 3 Nov)". Bulan/kuartal/tahun penuh
  dibandingkan dengan periode kalender sebelumnya.
- **Tanda ⚠ = perbandingan belum representatif.** Muncul bila periode pembanding baru terisi < 80% (mis. modul baru dipakai sejak
  pertengahan bulan lalu) atau periode ini belum terisi penuh (data terakhir tertinggal > 3 hari). Angka naik/turun tetap tampil,
  tetapi bertanda ⚠, tidak diwarnai baik/buruk, dan **tidak dijadikan dasar rekomendasi**. Ringkasan eksekutif menyebut modul mana yang terkena.
  Di grafik tren 13 bulan, perubahan terhadap bulan yang datanya baru terisi sebagian tidak ditampilkan, dan bulan sebelum data ada
  tidak dihitung sebagai "0".
- **Catatan data per modul** (layar, PDF, PPT, Excel): *Data tersedia sejak … · terakhir tercatat … (N hari lalu)*, peringatan ⚠ beserta
  alasannya, dan **definisi indikator** (rumus, aturan tutup otomatis pukul 17.00, dll.). Di layar: kotak di bawah tiap modul; PDF: strip di
  dasar halaman + lampiran; PPT: strip + slide "Catatan data & definisi"; Excel: baris peringatan di atas + bagian "Catatan data & definisi".
- **Tingkat penyelesaian driver** menampilkan komposisinya: *% oleh driver · % otomatis 17.00 · dibatalkan*. Tugas yang belum ditutup
  driver sampai pukul 17.00 WIB pada tanggal tugas ditutup sistem; dihitung selesai tetapi tidak masuk rata-rata durasi.
- **"Armada terpakai"** (dulu "Utilisasi armada") = unit aktif yang dipakai minimal sekali ÷ unit aktif. Tidak mengukur seberapa sering unit dipakai.
- **Rincian selalu menjumlah ke total:** daftar teratas (jenis pekerjaan, teknisi, pemohon, kategori, jenis kejadian) memuat baris "Lainnya"
  untuk sisanya.
Laporan Receptionist tampil untuk Master Admin, Admin GA CIK, dan Management (role Management hanya membaca; kata sandi akun wifi tidak ikut terbaca — kapasitas akun diambil lewat fungsi khusus, SQL 052).

## Bahasa Indonesia / English

Seluruh sistem (dashboard, Command Center, TV display, aplikasi Driver & TGA, form publik, halaman bukti/QR)
punya dua bahasa. Pilih dengan tombol **ID / EN** (pojok layar, `LangSwitch`) atau tombol bahasa di halaman
login/driver; pilihan tersimpan di browser (`cikops_lang`) dan diterapkan seketika tanpa muat ulang.

- **Ikut berganti:** semua label, tombol, pesan galat, tooltip, tanggal & angka (locale `en-GB` / `id-ID`),
  Laporan Manajemen (pratinjau + Excel/PPT/PDF), tanda terima, slip tugas, rekap klaim/kantin.
- **Tidak ikut berganti (sengaja):** *isi data* yang diketik pengguna atau berasal dari database
  (nama pekerjaan, catatan, nama pelanggar, data demo), nilai status di database (mis. "Terisi", "Paket"),
  judul notifikasi push & email dari Edge Function.
- **Menambah teks baru:** pakai `L("Indonesia", "English")` dari `src/lib/i18n.ts`. Tabel label tingkat modul
  harus memakai getter/fungsi agar bahasa tidak "membeku" saat impor.

## Menu Kantin untuk layar TV (`/menu-tv`) — CONTOH

Tayangan otomatis layar penuh 16:9 (tanpa login, tanpa interaksi) bergaya menu restoran: navy + biru CIKOPS dengan
aksen champagne, font serif (Playfair Display, Cormorant Garamond, Jost), debu emas, kilau, dan animasi masuk bertahap.
Urutan (berulang): Sampul "MENU KANTIN KARYAWAN" + periode → Menu Snack → Menu Meal → Menu Hari Ini → Penutup "Selamat Menikmati".
Tiap menu menampilkan **nama, kalori (kkal) dan gram**. Strukturnya mengikuti menu vendor kantin:
- **Snack** (Breakfast / shift 2 / shift 3): beberapa komponen per hari (mis. nasi kuning, tempe orek, timun, kerupuk) + **total kalori snack** per hari.
- **Meal:** lauk utama **A Ayam · B Daging/Ikan · C Telur** (persentase porsi vendor seperti "50%" tidak ditampilkan), kartu *Special*
  emas (hanya hari tertentu, mis. Sop Daging), **pendamping** (sayur + tempe/tahu/dll.), **buah per hari**, dan strip "Selalu Tersedia"
  untuk nasi putih, sambal, kerupuk.
Hari ini otomatis disorot. Slide Menu Hari Ini menampilkan hidangan hari berjalan dalam gaya kartu menu.
- URL: `/menu-tv` · `?slide=snack|meal|today|cover|closing` · `?rotate=0` · `?sec=20` · `?date=2026-11-03` (pratinjau minggu lain).
- Operator: ← → ganti slide, `F` layar penuh. Layar tidak merespons klik/sentuhan.
- **Mengisi menu:** Dashboard → Fasilitas → **Kantin** → tab **Menu TV**.
  1. Pilih minggu (Senin–Minggu) dengan tombol ‹ › atau pilih tanggal.
  2. Isi per hari: Snack, lauk utama (Daging, Ayam, Telur), Special (kosongkan bila tidak ada), Pendamping (bisa tambah/hapus),
     lalu "Selalu tersedia" (nasi, sambal, kerupuk, buah) untuk satu minggu. Tiap butir: nama, **kkal**, **gram**.
  3. Snack boleh banyak baris per hari (tombol **+ Komponen snack**). Nama yang pernah dipakai terisi otomatis kalori & gramnya. **Salin dari minggu lalu** mempercepat pengisian.
  4. **Simpan menu** → layar TV memperbarui diri maksimal 5 menit kemudian. **Lihat di TV** membuka pratinjau.
  Baris yang namanya kosong tidak ditampilkan. Bila minggu itu belum diisi, TV menampilkan layar "Menu minggu ini segera hadir".
- **Buah** diisi **per hari** (berbeda tiap hari); strip "Selalu tersedia" hanya berisi menu tetap (nasi, sambal, kerupuk).
- **Isi massal** (tombol di toolbar editor):
  - *Tempel / unggah data:* satu baris = satu hidangan, kolom `Hari · Jenis · Menu · Kkal · Gram`. **Pembeda kolom** bisa
    dipilih (Tab dari salinan Excel, titik koma, koma, garis tegak) atau otomatis. Hari = Senin–Minggu, **tanggal**
    (`2026-11-03` / `03/11/2026` → otomatis ke minggunya, jadi satu tempelan bisa memuat banyak minggu), atau `Semua`.
    Jenis = Snack, Daging, Ayam, Telur, Special, Pendamping, Buah, Tetap (nasi/sambal/kerupuk, Hari diisi `-`).
    Menu `-` = kosongkan butir itu. Bisa mengunggah `.xlsx`/`.csv`/`.txt`; **Muat format minggu ini** / **Unduh CSV**
    memberi templat berisi menu saat ini untuk diedit di Excel lalu ditempel kembali.
    Pratinjau menandai baris yang error (dilewati); mode **Gabung** hanya menimpa yang ada di data, mode **Ganti**
    mengosongkan minggu yang tersentuh dulu. Data langsung tersimpan ke semua minggu yang terpengaruh.
  - *Ulangi ke minggu lain:* menyalin isian yang tampil ke 1–12 minggu berikutnya (minggu yang sudah terisi dilewati,
    kecuali dicentang "Timpa").
- **Dari gambar menu vendor (pakai AI):** di dialog Isi massal klik **Salin prompt AI (gambar → teks)**, tempel prompt itu bersama
  gambar menu vendor ke ChatGPT / Claude / Gemini, lalu tempel jawabannya di kotak teks. Tabel markdown dari AI (`| … |`), tanggal
  gaya vendor (`02-Nov-26`), dan nama berakhiran `50%` dikenali otomatis. **Selalu cek pratinjau** sebelum menerapkan: AI bisa salah baca angka.
  Berkas contoh hasil transkripsi menu vendor 2–8 Nov 2026: `docs/contoh-isi-massal-menu.csv` (bisa langsung diunggah).
  Catatan transkripsi: Selasa "Telur bumbu pindang" dan Rabu special "Sop Daging" tidak punya angka di gambar → dikosongkan (tampil "–");
  Rabu tidak ada lauk B (digantikan Sop Daging).
- `?today=2026-11-04` memperlakukan tanggal itu sebagai "hari ini" (untuk pratinjau slide Menu Hari Ini hari lain).
- **Syarat:** jalankan ulang `supabase/04_aplikasi_lapangan.sql` (bagian 051) di Supabase SQL Editor — membuat tabel
  `canteen_menu_weeks` dan fungsi publik `canteen_menu_public`. Yang boleh mengisi: akun dengan akses modul Kantin
  (sama seperti laporan kantin); layar TV hanya membaca satu minggu lewat fungsi itu.
- `?sample=1` menampilkan menu contoh untuk uji tampilan.

### Pemasangan di TV (checklist go-live)
1. **Sebelum rapat dengan IT:** jalankan `supabase/04_aplikasi_lapangan.sql` (bagian 051 & 054) di Supabase SQL Editor dan pastikan
   perubahan terbaru sudah di-merge ke `main` (Vercel hanya men-deploy `main`).
2. **Jaringan:** kabel LAN ke TV (tanpa captive portal). Minta IT memastikan TV boleh membuka alamat Vercel dan `*.supabase.co`
   (HTTPS). Wifi guest dengan halaman login tidak cocok untuk TV.
3. **Uji dulu di TV:** buka `https://<domain>/menu-tv?sample=1` (menu contoh, tanpa data). Aplikasi ini memerlukan browser modern
   (setara Chrome/Edge 111+, Safari 16.4+). Browser bawaan TV yang lama (beberapa Samsung Tizen / LG webOS lama) bisa gagal
   menampilkan — bila halaman kosong/berantakan, pakai Chromecast with Google TV / Android TV box / mini PC (Chrome), atau
   cadangan video MP4 lewat USB.
4. **Layar penuh:** buka `/menu-tv` lalu tekan tombol layar penuh browser (F11 / mode kiosk). Kursor tersembunyi otomatis.
5. **Tepi terpotong?** Di pengaturan gambar TV pilih "Fit to screen / Just Scan / Screen Fit" (matikan overscan). Bila tetap
   terpotong, tambahkan `?safe=3` (mengecilkan tampilan 3%) pada alamatnya.
6. **Setelah terpasang tidak perlu disentuh:** minggu & sorotan "hari ini" berganti otomatis tengah malam (WIB), menu dibaca ulang
   tiap 5 menit (perubahan dari Dashboard tampil maksimal 5 menit kemudian), halaman memuat ulang otomatis 03:30 WIB, dan bila
   internet putus layar tetap menampilkan menu terakhir. Minggu yang belum diisi menampilkan layar "Menu minggu ini segera hadir".
7. **Isi menu** sebelum Senin: Dashboard → Fasilitas → Kantin → Menu TV (bisa isi massal untuk beberapa minggu sekaligus).

## Memilih karyawan: kotak pencarian

Semua pemilihan karyawan memakai **kotak pencarian** (bukan daftar panjang), supaya nyaman di HP: ketik sebagian nama, NIK, atau departemen
(beberapa kata boleh, urutannya bebas, mis. "budi fin"), lalu ketuk hasilnya. Dipakai di: Penugasan Driver (Requestor), TGA (penugasan &
ubah pekerjaan), ATK (nama pemohon), dan Receptionist (requestor wifi, penerima/pengirim barang, PIC booking). Di Penugasan Driver hanya
bisa memilih dari daftar karyawan; di tempat lain nama di luar data karyawan (mis. tamu) tetap boleh diketik.

> Batas Supabase **Max rows** (Project Settings → API) menentukan berapa karyawan yang dimuat sekali ambil (bawaan 1000). Jumlah karyawan
> sekarang 1500 → pastikan **Max rows ≥ jumlah karyawan** (disarankan 5000). Bila suatu saat melewatinya, nama di ujung daftar tidak muncul.

## Backup & pemulihan
Supabase paket Free tidak menyediakan backup yang bisa dipulihkan sendiri (paket Pro
menyimpan backup harian 7 hari). Karena itu ada workflow GitHub **Backup database**
(`.github/workflows/backup-database.yml`) yang jalan setiap hari pukul 02.00 WIB.

### Isi backup
Satu file `<nama>-<tanggal>.tar.gpg` per database, terenkripsi AES-256, disimpan sebagai
artifact GitHub selama 30 hari:
- `data.dump`: semua tabel aplikasi (struktur + data, fungsi, policy)
- `auth.dump`: akun login (`auth.users`, `auth.identities`, password tetap ter-hash)
- `cron_job.csv`: daftar jadwal pg_cron

Tidak termasuk: Edge Function & secret (kodenya di repo, secret catat sendiri), pengaturan
Auth di Dashboard, dan file Storage (CIKOPS tidak memakai Storage).

### Pasang (sekali)
1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `BACKUP_PASSPHRASE`: kata sandi panjang. **Simpan juga di tempat lain** (password
     manager / brankas). Tanpa ini backup tidak bisa dibuka.
   - `CIKOPS_DB_URL`: Supabase CIKOPS → **Connect** → *Session pooler* → URI, isi password database.
   - `SECDESK_DB_URL` (opsional): sama, untuk project Security Desk.
2. **Actions → Backup database → Run workflow** sekali untuk uji. Pastikan hijau dan ada
   artifact `backup-cikops-…`.
3. GitHub menonaktifkan jadwal workflow bila repo tidak ada aktivitas 60 hari. Kalau itu
   terjadi, ada email dari GitHub; buka Actions lalu **Enable workflow**.

### Memulihkan
Butuh `psql`/`pg_restore` versi 17 dan `gpg` di laptop.
```bash
gpg -d cikops-20261021-0200.tar.gpg | tar -x          # minta BACKUP_PASSPHRASE
pg_restore --data-only -d "$DB_URL" auth.dump           # 1) akun login dulu
pg_restore --no-owner -d "$DB_URL" data.dump            # 2) tabel aplikasi
```
- Target sebaiknya **project Supabase baru/kosong** (extension `pgcrypto`, `pg_cron`,
  `pg_net` aktif). Pesan `schema "public" already exists` boleh diabaikan.
- Hanya satu tabel yang rusak/terhapus? Pulihkan ke project cadangan dulu, lalu salin
  baris yang dibutuhkan, supaya data lain yang sudah masuk hari ini tidak tertimpa.
- Buat ulang jadwal pg_cron dari `cron_job.csv` (`select cron.schedule(nama, jadwal, perintah)`).
- Latih pemulihan ke project uji minimal sekali setiap 3 bulan.

## Akses bersama akun (tidak dipindah)

Keputusan terakhir: **Vercel, Supabase, dan GitHub tetap di akun sekarang.** Akun kedua
diberi akses supaya pengelolaan tidak bergantung pada satu orang.

| Layanan | Cara | Hak yang didapat |
|---|---|---|
| Supabase | Organization → **Team** → Invite → role **Owner** | Penuh: semua project, SQL, secret, Edge Function, billing, menambah/menghapus anggota |
| GitHub (repo pribadi) | Repo → Settings → **Collaborators** → Add people | **Write**: push, merge PR, menjalankan Actions. *Tidak bisa* mengubah Settings, secret Actions, menghapus/transfer repo — repo pribadi tidak punya peran "Owner" untuk collaborator |
| Vercel (Hobby) | Tidak bisa menambah anggota di paket gratis | Tetap dikelola akun pemilik |

Catatan:
- Lakukan untuk kedua repo (`CIKOPS-FM2026`, `CIK-G4S`) dan kedua project Supabase.
- Supabase: minimal 2 Owner, jadi bila satu akun hilang akses, project tetap bisa dikelola.
- GitHub setara Owner hanya lewat **Organization** (gratis, bisa beberapa Owner), tetapi repo
  harus dipindah ke organization itu, dan Vercel Hobby tidak bisa deploy dari repo **private**
  milik organization (perlu Pro). Selama repo tetap di akun pribadi, simpan kode pemulihan 2FA
  akun pemilik di tempat aman.
- Simpan juga salinan semua secret Actions (terutama kunci APK `ANDROID_KEYSTORE_*`) di
  password manager, karena hanya pemilik repo yang bisa melihat/mengubahnya.

Bab di bawah tetap disimpan bila suatu saat memang perlu pindah akun.

## Pindah akun Supabase & GitHub (bila suatu saat diperlukan)

Keputusan: **Vercel tetap di akun sekarang** (domain `cikops-onefm.vercel.app` dan
`cik-g4s.vercel.app` tidak berubah, jadi APK, QR, TV, dan link email aman).
Yang pindah hanya **Supabase** (CIKOPS, dan Security Desk bila ikut) dan **repo GitHub**.

### A. Supabase — cara utama: Transfer project (tanpa salin data)
Supabase bisa memindahkan project ke organisasi lain **utuh**: URL, kunci API, data,
akun login, Edge Function, secret, dan jadwal cron tetap sama. Tidak ada yang perlu
diganti di Vercel, APK, maupun Excel.

1. Login Supabase dengan **email baru** → buat **Organization** baru (paket Free).
2. Di organization baru itu: Team → **Invite** email lama sebagai **Owner**. Terima undangan dari email lama.
3. Login dengan **email lama** → buka project CIKOPS → Project Settings → General →
   **Transfer project** → pilih organization baru → Transfer.
   Ulangi untuk project Security Desk (G-C) bila ikut pindah.
4. Cek: buka aplikasi, login, buat satu tugas, kirim satu notifikasi tes.
5. Di organization baru, keluarkan email lama dari Team (opsional, sesudah semua beres).

> Batas paket Free: 2 project aktif per organization/akun — pas untuk CIKOPS + Security Desk.
> Bila tombol Transfer tidak tersedia / ditolak (misalnya karena aturan paket), pakai cara B.

### B. Supabase — cara cadangan: project baru + salin database
Dipakai hanya bila cara A tidak bisa. Karena URL Supabase berubah, yang perlu diganti:

| Hal | Tindakan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (akun sekarang) → env → isi nilai baru → Redeploy |
| `GC_*` | Bila project Security Desk ikut pindah: isi nilai baru. **`GC_HASH_SALT` tetap sama** |
| Edge secrets (`VAPID_*`, `GMAIL_*`, `LOCKER_ADMIN_EMAIL`, `FCM_SERVICE_ACCOUNT`) | Salin **persis sama** ke project baru, lalu deploy semua function di `supabase/functions/` |
| pg_cron & jadwal `vehicle-document-reminder` | Buat ulang di project baru (data `cron.job` tidak ikut tersalin); matikan di project lama |
| Auth → URL Configuration, template email | Salin manual dari project lama |
| Excel GA & ATK | Ganti URL & anon key di VBA setiap PC (kunci sinkron ikut database) |
| Secret GitHub `CIKOPS_DB_URL` / `SECDESK_DB_URL` (backup) | Ganti ke connection string baru |

Langkah:
1. Buat project baru di region yang sama (Singapore); aktifkan `pgcrypto`, `pg_cron`, `pg_net`
   (Security Desk: tambahkan `security` ke Exposed schemas).
2. Salin database (latihan dulu, ulangi di hari-H):
   ```bash
   supabase db dump --db-url "$LAMA" --role-only > roles.sql
   supabase db dump --db-url "$LAMA" > skema.sql
   supabase db dump --db-url "$LAMA" --data-only --use-copy -s public,security,auth > data.sql
   psql "$BARU" -f roles.sql -f skema.sql -c 'SET session_replication_role = replica' -f data.sql
   ```
   Atau pulihkan dari backup harian (bab Backup & pemulihan).
3. Hari-H (malam): jeda input → salin data terakhir → ganti env di Vercel → Redeploy →
   matikan cron project lama → tes. Pengguna login ulang sekali. APK tidak perlu dibuat ulang.
4. Pause project lama ±2 minggu sebelum dihapus.

### C. GitHub — Transfer repository (gratis)
1. Siapkan akun GitHub baru. Di repo lama: Settings → General → **Transfer ownership** →
   isi akun baru → konfirmasi dari akun baru. Lakukan untuk `CIKOPS-FM2026` dan `CIK-G4S`.
   Link lama otomatis diteruskan ke alamat baru.
2. **Sebelum transfer, catat semua secret & variabel Actions** (nilainya tidak bisa dibaca lagi):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (simpan file
   kunci APK di tempat aman — **tanpa ini APK tidak bisa di-update**), `GOOGLE_SERVICES_JSON`,
   `BACKUP_PASSPHRASE`, `CIKOPS_DB_URL`, `SECDESK_DB_URL`, variabel `SITE_URL`.
   Sesudah transfer, cek Settings → Secrets and variables → Actions; isi ulang yang kosong.
3. **Sambungkan ulang Vercel:** akun GitHub baru → install **Vercel** GitHub App dan beri akses
   ke kedua repo. Di Vercel (akun sekarang) → project → Settings → **Git** → Connect ke repo
   di akun baru. Tes dengan satu push: deploy harus jalan otomatis.
4. Install juga GitHub App **Claude** di akun baru bila masih dipakai.
5. Actions di repo hasil transfer: buka tab Actions → aktifkan workflow bila diminta
   (backup harian & build APK).

---

## Keamanan: menjalankan SQL 06 (hasil audit 4 November 2026)

Laporan lengkap: `docs/AUDIT_KEAMANAN_ISO27001.md` (Bagian 1A = bukti dari database produksi).

**Langkah**
1. Buka Supabase → **SQL Editor** → tempel isi `supabase/06_perbaikan_audit_2026-11.sql` → **Run**. Aman diulang.
2. Hasil akhir berupa tabel 12 baris; kolom `anon_bisa_panggil` harus `false` semua.
3. *Deploy* ulang aplikasi di Vercel (merge ke `main`) supaya perbaikan XSS cetak (struk permintaan, label gift, bukti Receptionist) dan pesan PIN locker ikut aktif.

**Yang berubah untuk pengguna**
| Area | Sebelum | Sesudah |
|---|---|---|
| Tugas Fleet (buat / hapus batch) | siapa pun tanpa login | hanya staf Fleet (Master, Admin GA CIK/PRB); rentang maks. 62 hari |
| Locker — "Lepas locker" / konfirmasi massal oleh admin | akun login mana pun | hanya staf Fasilitas |
| Locker — PIN karyawan salah | bisa dicoba tanpa batas | salah 5× → **terkunci 15 menit** (pesan: "Terlalu banyak PIN salah…"); admin Fasilitas tetap bisa melepas locker |
| Agenda, daftar penghuni locker, riwayat PIN locker, daftar karyawan ATK | semua akun login (termasuk driver) | hanya staf (riwayat PIN: Fasilitas) |
| Aplikasi Driver (klaim, info tugas) | — | tidak berubah; driver hanya melihat datanya sendiri |

**Setelah menjalankan, uji cepat**: (1) login Admin GA → buat tugas 1 hari → batalkan; (2) login driver → tab Klaim & Tugas terbuka normal; (3) Locker: lepas dengan PIN benar berhasil, PIN salah 5× terkunci; (4) form `/gate`, `/request`, `/canteen`, daftar locker karyawan tetap terbuka tanpa login.

**Belum diubah (butuh keputusan Anda)**: pencarian & klaim gift, riwayat gate publik, pembatasan pendaftaran locker, kode petugas untuk form kantin — lihat tabel keputusan di laporan audit.

### Header keamanan, CSP, CI, dan Dependabot (hasil audit)

| Hal | Isi | Tindakan Anda |
|---|---|---|
| **Header keamanan** (`next.config.js`) | HSTS, `nosniff`, Referrer-Policy, Permissions-Policy (kamera/mikrofon/lokasi dimatikan), anti-clickjacking (`frame-ancestors 'self'`) | Otomatis aktif setelah *deploy*. Dashboard Command Center di dalam tab Akun tetap tampil (satu situs yang sama) |
| **CSP penuh** (daftar sumber yang diizinkan) | Dikirim sebagai **Report-Only** — tidak memblokir apa pun, hanya mencatat. Diuji di 38 halaman: nol pelanggaran | Pakai aplikasi normal beberapa hari; cek **Vercel → Logs** dengan kata kunci `csp-violation`. Bila bersih: Vercel → Settings → Environment Variables → `CSP_ENFORCE` = `1` → Redeploy |
| Variabel opsional | `CSP_FRAME_ANCESTORS` (situs lain yang boleh membingkai aplikasi, bawaan hanya diri sendiri), `CSP_EXTRA_CONNECT` (mis. domain kustom Supabase) | Hanya bila diperlukan |
| **CI** (`.github/workflows/ci.yml`) | Setiap perubahan: cek tipe → build → uji header → `npm audit` (gagal bila ada celah tinggi/kritis) | Lihat tab *Actions*; jadikan syarat merge di Settings → Branches |
| **Dependabot** (`.github/dependabot.yml`) | Sebulan sekali, **maksimal 1 PR per ekosistem** (npm, GitHub Actions) yang menggabung semua pembaruan minor/patch. Pembaruan *major* diabaikan (bisa merusak build) | Tinjau PR-nya; gabungkan bila CI hijau. Tip: GitHub → Settings → General → centang **Automatically delete head branches** supaya branch yang sudah digabung hilang sendiri |

Disarankan juga (pengaturan GitHub, tanpa kode): Settings → *Code security* → aktifkan **Secret scanning** dan **Push protection**.

## Scope Plant (CIK / PRB) pada data & laporan

Ada dua plant: **CIK** dan **PRB**. Cara aplikasi memisahkan datanya:

| Akun | Plant | Yang terlihat |
|---|---|---|
| **Admin GA CIK** | dikunci **CIK** | Beranda (KPI, kendaraan, driver, klaim, dana operasional), Penugasan, Armada, Klaim, Dana Operasional, Master Data (driver), Kalender, Overview, dan **semua laporan** hanya berisi data CIK. Pemilih plant diganti penanda 🔒. **Gate Log** milik plant CIK (lihat di bawah) |
| **Admin GA PRB** | dikunci **PRB** | Sama, khusus PRB (Penugasan, Armada, Master Data, Report Fleet). **Tidak ada Gate Log** |
| **Master Admin, Management, role lama tanpa scope** | bebas | Pemilih **Semua plant / CIK / PRB** di Laporan Manajemen, Laporan & Analytics (tugas driver), dan tab Klaim. Dashboard **Executive** dan Command Center tetap **semua plant** |

**Laporan Manajemen** (menu Report): langkah 1 kini *Plant & modul*.
- Pilih plant → **Fleet** (tugas, armada, driver, gate log) dan **Klaim** hanya memuat plant itu; nama file memuat kode plant (mis. `Laporan_Manajemen_PRB_…pdf`), dan sampul laporan menyebut plant.
- Bila **Semua plant**, Fleet & Klaim menampilkan kedua plant lengkap dengan pembanding per plant.
- **PRB hanya punya Fleet & Klaim.** Modul fasilitas (Kantin, ATK, Cleaning & Gardening, TGA, Receptionist, Security) adalah fasilitas CIK, jadi saat plant PRB dipilih modul itu disembunyikan.
- Angka CIK + PRB selalu sama dengan angka Semua plant (diuji: 431 + 241 = 672 penugasan).

**Laporan & Analytics (tugas driver)** dan **rekap klaim / tanda terima** mengikuti plant yang dipilih; "Driver Aktif" dan rekap per driver hanya menghitung driver plant itu.

**Gate Log = plant CIK.** Pos gate ada di CIK, jadi seluruh log gate (kendaraan CIK keluar-masuk plant **dan** kendaraan PRB yang masuk CIK) adalah data plant CIK. Akun CIK, Master, dan Management melihat semuanya; pemilih "Semua kendaraan / Kendaraan CIK / Kendaraan PRB" hanya menyaring asal kendaraan. **Akun PRB tidak punya menu Gate Log**, dan Laporan Manajemen khusus PRB tidak memuat data gate. CSV Gate Log diberi nama `GateLog_PosCIK…` dan kolom `plant_kendaraan`.

> **Catatan keamanan:** pemisahan plant saat ini ditegakkan **di aplikasi** (filter data & menu). Database belum menolak akun CIK yang meminta data PRB lewat API langsung. Bila diperlukan isolasi tegas, langkah berikutnya adalah menambah policy baca per plant di database (lihat audit keamanan, T-03).

## Kategori driver, huruf kapital otomatis, dan email Receptionist

**Kategori driver: hanya 2.** *Driver Pool* (menerima penugasan) dan *Driver User* (khusus 1 user, On Duty otomatis 08.00–16.30 WIB). Kategori *Support* dihapus dari semua tampilan (Master Data, Receptionist → Data, Command Center). Driver lama bertipe Support otomatis dibaca sebagai Pool; untuk merapikan database jalankan `supabase/07_kategori_driver.sql` **setelah** aplikasi di-deploy.

**Huruf kapital otomatis.** Semua isian teks (nama, tujuan, keterangan, perihal, plat, dll.) — termasuk form Gate Log, `/request`, Receptionist, Klaim, TGA — otomatis menjadi **HURUF BESAR** saat diketik, dan keyboard HP diminta huruf besar. Tidak dikapitalkan (karena akan merusak data): email, password, username, URL/link, token, kode/PIN, SSID wifi, angka/tanggal/jam, dan kotak pencarian. Kolom tempel data massal (menu TV, impor wifi/driver) juga tidak diubah. Data lama tidak berubah sampai diedit.

**Email Receptionist berisi `=20`.** Penyebabnya bug pada pustaka pengirim email (denomailer): spasi di ujung baris diubah menjadi `=20` lalu tanda `=` di-encode ulang, sehingga penerima melihat `=20`. Perbaikan: isi email dikirim sebagai base64 (tanpa quoted-printable), subjek dan nama pengirim dibuat ASCII murni. **Wajib deploy ulang fungsi** (Edge Function tidak ikut Vercel): `supabase functions deploy send-receptionist-email`, atau tempel isi `supabase/functions/send-receptionist-email/index.ts` di Supabase → Edge Functions → send-receptionist-email → Deploy.

