# CIKOPS — Panduan setup, operasional & pindah akun

Satu dokumen untuk semua langkah pasang, per modul, plus langkah pindah akun
Supabase/Vercel (bab terakhir). Riwayat perubahan ada di `git log`.

## File SQL (Supabase CIKOPS → SQL Editor)
| File | Isi | Kapan dijalankan |
|---|---|---|
| `supabase/01_dasar.sql` | Semua migrasi lama (skema inti + bagian 001 … 038): driver, armada, tugas, klaim, kantin, gift, gate, security, kalender, ATK, Cleaning & Gardening, Command Center, Receptionist, TGA | **Sudah berjalan di production** — tidak perlu diulang. Cari `## BAGIAN 0xx` untuk melihat migrasi tertentu |
| `supabase/02_peran_keamanan.sql` | Bagian 039 role per modul, 041 riwayat pengingat dokumen, 040 pengetatan keamanan | **Jalankan sekali sekarang** (utuh, satu kali Run). Aman diulang |
| `supabase/04_aplikasi_lapangan.sql` | Bagian 042 token notifikasi APK (Firebase), 043 Self-Claim driver, 044 sinkron Excel ATK, 045 modul TGA (ubah/hapus pekerjaan + form penugasan publik) | **Jalankan sekali, sesudah file 02.** Aman diulang |
| `supabase/03_data_impor.sql` | Impor data lama sekali pakai (riwayat security, klaim Jan–Jun 2026) | Sudah berjalan. Tidak perlu untuk project baru yang datanya disalin |
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
| **Admin / SPV ISS** | Cleaning & Gardening, TGA, Report Cleaning & Gardening | Cleaning & Gardening | Admin / SPV ISS |
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

Menu baru: **Dashboard → Fasilitas → Receptionist** (Dashboard, Wifi Guest, Barang & Surat, Induction Room, Pengaturan).
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

