# Audit Keamanan Informasi CIKOPS-FM — pemetaan ISO/IEC 27001:2022

| | |
|---|---|
| **Tanggal audit** | 4 November 2026 |
| **Objek** | Repositori `sulistiawan129-byte/CIKOPS-FM2026` (branch `claude/loving-lamport-rqai35`), seluruh SQL Supabase, Edge Function, Next.js (Vercel), workflow GitHub, aplikasi Android (TWA), modul VBA/Excel |
| **Pendekatan** | Telaah kode + **replika database** (SQL repo dijalankan di PostgreSQL 16 dengan stub Supabase, lalu RLS / policy / fungsi diukur langsung) + pemindaian rahasia + `npm audit` + pembuktian (PoC) di mockup lokal |
| **Tidak dilakukan** | Tidak ada pengujian aktif ke produksi (Supabase / Vercel). Pemeriksaan header langsung ke situs produksi tidak bisa dilakukan dari lingkungan audit |
| **Penting** | Ini audit teknis + gap-analysis terhadap ISO/IEC 27001:2022, **bukan sertifikasi** dan bukan nasihat hukum. Klausul manajemen (4–10) hanya bisa dinilai dari bukti dokumen yang ada di repo |

---

## 1. Ringkasan eksekutif

**Kesimpulan: fondasi teknisnya kuat, tetapi ada satu kelas celah aplikasi yang harus ditutup segera, dan tata kelola ISMS-nya belum ada.**

| Kategori | Jumlah | Catatan |
|---|---|---|
| Tinggi | 4 | XSS tersimpan (3 jalur), Next.js rentan, akses baca terlalu luas untuk semua role staf, dependensi PDF |
| Sedang | 11 | tulis anonim kantin, kebocoran kecil pada `atk_employees`, tanpa header keamanan/CSP, RPC publik tanpa pembatas, log audit, CI/CD, IaC, dll. |
| Rendah | 7 | |
| **Sudah baik** | 14 | RLS 100% pada tabel di repo, tulis dibatasi per modul, bcrypt, backup terenkripsi, dll. |

**Lima hal yang perlu dikerjakan lebih dulu**

1. **Tutup XSS tersimpan pada jendela cetak** (T-01). Siapa pun tanpa login bisa menyisipkan skrip lewat form publik; skrip itu berjalan di dashboard ketika staf menekan *Cetak Bukti* / *Cetak Label*. Sudah dibuktikan (PoC) di mockup.
2. **Naikkan Next.js dari 16.3.8** (T-02). Versi terpasang berada di rentang yang memuat advisori RCE & DoS (≤ 16.4.0); versi 16.4.5 tersedia.
3. **Batasi baca data pribadi per peran** (T-03). Role mana pun yang punya profil (termasuk Receptionist, Admin ISS, Security, Management) saat ini dapat membaca NIK/email/HP karyawan, data driver, klaim, lembur, dan pendaftar gift.
4. **Tutup tulis anonim di `canteen_reports`** (S-01) dan **cabut baca `atk_employees` untuk semua akun login** (S-02) — keduanya berasal dari perubahan terakhir di repo ini dan merupakan kemunduran dari hasil audit sebelumnya.
5. **Mulai ISMS minimum**: ruang lingkup, register risiko, kebijakan akses, prosedur insiden & notifikasi pelanggaran data (UU PDP: 3×24 jam), tinjauan akses berkala (Bagian 6).

**Tingkat kesiapan ISO/IEC 27001:2022** (dari baris yang dinilai di Bagian 4): Annex A.5 — 21 baris: 1 sesuai, 12 sebagian, 8 belum. Annex A.8 — 30 baris (3 tidak berlaku): 4 sesuai, 18 sebagian, 5 belum. A.6 hampir seluruhnya belum ada bukti; A.7 umumnya tidak berlaku (cloud). Klausul ISMS 4–10: **belum ada dokumen**. Perkiraan jalur sertifikasi: 6–9 bulan setelah ISMS dimulai (perkiraan kasar, bergantung sumber daya).

---

## 2. Ruang lingkup, metode, dan batasan

### 2.1 Cakupan
Aplikasi web dashboard (staf), aplikasi Driver & TGA (PWA + APK), halaman publik (`/request`, `/gift`, `/locker`, `/gate`, `/canteen`, `/bukti`, `/menu-tv`, `/dashboard-viewonly`, `/tugas-tga`), 9 Edge Function, `/api/gc-nc`, SQL `01…05`, workflow `backup-database`, `demo-database`, `android-apk`, `vapid-keys`, makro VBA ATK/GA.

### 2.2 Cara pengukuran
- **Replika DB:** `01_dasar.sql` + `02_peran_keamanan.sql` + `04_aplikasi_lapangan.sql` dijalankan berurutan di PostgreSQL 16 dengan stub `auth.*`, role `anon/authenticated/service_role`, dan default privilege ala Supabase. Hasil: 0 error di `02` dan `04`; 28 error di `01` (semuanya karena objek yang **tidak ada di repo**, lihat S-07).
- Query yang dipakai identik dengan `supabase/cek_audit_keamanan.sql` ditambah analisis fungsi anonim, policy longgar, kolom rahasia, dan hash.
- Pemindaian rahasia pada seluruh riwayat git (191 commit): **tidak ditemukan** kunci, token, atau `.env`.
- `npm audit --omit=dev` (14 temuan: 2 kritis, 3 tinggi, 9 sedang).
- **PoC XSS** dijalankan di mockup lokal (bukan produksi).

### 2.3 Batasan (harus diverifikasi di lingkungan nyata)
| Tidak terlihat dari repo | Cara memeriksa |
|---|---|
| Tabel/fungsi yang dibuat langsung di Supabase (gate, locker, gift, `activity_log`, `atk_*`, `drivers`/`tasks` versi produksi) | Jalankan `supabase/cek_audit_keamanan.sql` di produksi, bagian 1–7 |
| Pengaturan Supabase Auth (signup publik, panjang password, MFA, kebocoran password, masa sesi) | Dashboard → Authentication |
| Paket Supabase, region, PITR, network restriction, SSL enforcement | Dashboard → Settings |
| Header keamanan produksi, Deployment Protection, firewall/WAF | `curl -I https://<domain>` dari luar; Vercel → Settings |
| Proteksi branch, review wajib, 2FA akun GitHub/Supabase/Vercel | GitHub → Settings |

---

## 3. Temuan teknis

Skala: **Tinggi** = dapat dieksploitasi dengan dampak nyata pada kerahasiaan/akun; **Sedang** = perlu kondisi tertentu atau dampak terbatas; **Rendah** = pengerasan / kebersihan.

### 3.1 Tinggi

#### T-01 · XSS tersimpan pada jendela cetak (3 jalur) — **terbukti**
- **Bukti:**
  - `src/app/dashboard/dashboardShared.tsx` (`printRequestReceipt`) memasukkan `l.value`, `employeeName`, `department` **tanpa escape** ke `w.document.write(...)`. Data berasal dari tabel `employee_requests` / `printer_requests`, yang menerima `INSERT` **anonim** (`public_submit … with check (true)`).
  - `src/app/dashboard/GiftTab.tsx` (`printGiftLabels`) memasukkan `r.nama`, `r.nik`, `r.departemen`, `r.lokasiPengambilan`, `r.statusKehadiran` tanpa escape. `create_gift_registration` dapat dipanggil anonim dan **tidak memvalidasi panjang/isi** `p_nama`, `p_departemen`, `p_email`.
  - `window.open("", "_blank")` menghasilkan dokumen `about:blank` yang **mewarisi origin dashboard**, sehingga skrip dapat membaca `localStorage` (token sesi Supabase) dan memanggil API atas nama staf.
- **PoC (mockup lokal):** isian "Nama Anda" di `/request` diisi `<img src=x onerror=…>`; saat staf menekan **Cetak Bukti**, skrip berjalan di `origin` dashboard dan mengakses `localStorage` aplikasi.
- **Dampak:** pengambilalihan akun staf yang mencetak (bila Master Admin: seluruh sistem), tanpa kredensial apa pun dari penyerang.
- **Perbaikan:** (1) fungsi `esc()` untuk semua nilai yang disisipkan ke HTML cetak, atau bangun dokumen cetak dengan `textContent`/DOM, bukan string; (2) validasi server-side (panjang, daftar karakter) pada RPC/insert publik; (3) CSP (lihat S-03); (4) tinjau juga `<title>${title}` di `ProofCard.printTicket`.
- **ISO:** A.8.28 (secure coding), A.8.26, A.8.29. **Usaha:** kecil (±0,5 hari) untuk escape; sedang untuk validasi + CSP.

#### T-02 · Next.js 16.3.8 berada dalam rentang rentan
- **Bukti:** `npm audit` — `next` rentang `16.0.0–16.4.0`: RCE tanpa autentikasi pada *Image Optimization API* (SVG), RCE pada fungsi `use cache`, dan DoS pada Server Actions. Versi terbaru di registry: 16.4.5.
- **Keterjangkauan:** aplikasi tidak memakai `next/image` maupun `use cache`, sehingga RCE kemungkinan **tidak terjangkau**; endpoint `/_next/image` tetap ada secara bawaan dan DoS Server Action tidak bisa dikesampingkan. Anggap **wajib ditambal**.
- **Perbaikan:** naik ke 16.4.5 (atau terbaru), uji build + halaman utama. Catatan repo: Next ini punya perubahan besar — baca `node_modules/next/dist/docs/` sebelum menaikkan.
- **ISO:** A.8.8 (manajemen kerentanan). **Usaha:** kecil–sedang.

#### T-03 · Akses baca data pribadi terlalu luas (semua role staf)
- **Bukti (replika DB):** tabel yang dapat **dibaca oleh akun staf mana pun**, apa pun perannya (`is_staff()`): `employees` (NIK, email, HP, jabatan), `drivers` (HP, email, **`pin_hash`**), `claims`, `overtime`, `kantong`, `driver_claim_requests`, `gift_registrations` (NIK, email), `tasks`, `vehicles`, `app_settings`, dan lainnya (17 tabel). Penulisan sudah dibatasi per modul, **pembacaan belum**.
- **Dampak:** akun Receptionist, **Admin ISS (vendor luar)**, Security, dan Management dapat membaca data yang tidak mereka perlukan → melanggar *need-to-know*/minimisasi data (UU PDP, ISO A.5.15, A.8.3).
- **Perbaikan:** ganti `is_staff()` pada policy `SELECT` dengan `staff_can('<modul>')` per tabel; sembunyikan `drivers.pin_hash` (kolom dicabut atau dipindah); buat *view* khusus kolom untuk kebutuhan lintas modul (mis. daftar nama + departemen tanpa NIK untuk pemilih karyawan).
- **Usaha:** sedang (perlu uji per peran).

#### T-04 · Dependensi klien jsPDF 2.5.2 (kritis menurut advisori)
- **Bukti:** jsPDF ≤ 4.2.0 memuat banyak advisori, termasuk injeksi PDF/JavaScript dan "HTML injection in New Window paths" (CVSS 9.6). DOMPurify 2.5.9 (transitif) juga dalam rentang rentan.
- **Keterjangkauan:** kode hanya memakai jsPDF untuk menulis teks/tabel (tidak memakai `html()`, `addJS`, atau `output(...newwindow)`), jadi eksploitasi langsung kecil. Tetap perlu diperbarui karena data pengguna ikut masuk PDF.
- **Perbaikan:** jsPDF ≥ 4.2.1 (perubahan mayor; uji ekspor PDF Laporan Manajemen, kantin, klaim) + `jspdf-autotable` yang cocok. Perbarui `exceljs` (transitif `uuid`, `archiver`) — penting karena fitur impor `.xlsx` memuat berkas unggahan staf.
- **ISO:** A.8.8, A.8.19. **Usaha:** sedang.

### 3.2 Sedang

| ID | Temuan | Bukti | Perbaikan |
|---|---|---|---|
| **S-01** | **Tulis anonim `canteen_reports` untuk tanggal mana pun** | SQL bagian 049: `public_any_read/ins/upd` untuk `anon` dengan `using (true)`; hanya `UNIQUE(report_date)`, **tanpa CHECK nilai** dan tanpa riwayat perubahan. Siapa pun yang memegang anon key (publik) dapat menimpa angka kantin → memalsukan KPI Laporan Manajemen. *Berasal dari perubahan terakhir (backdate form kantin).* | Wajibkan kode petugas lewat RPC (seperti gift), batasi mundur ≤ 7 hari, tambah `CHECK (nilai between 0 and 5000)`, simpan versi lama (tabel audit), batasi laju |
| **S-02** | **`atk_employees_read` terbuka untuk semua akun login** | SQL 054: `using (true) to authenticated` → akun **driver** pun bisa membaca NIK + nama + departemen daftar ATK. *Kemunduran dari audit sebelumnya (policy longgar `authenticated`).* | `using (staff_can('facility'))` |
| **S-03** | **Tidak ada header keamanan / CSP** | Tidak ada `vercel.json`, `middleware`, atau `headers()` di `next.config.js`. Akibat: tidak ada `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` (clickjacking pada dashboard), `Referrer-Policy` (URL `/bukti?t=<token>` ikut bocor lewat Referer), `Permissions-Policy`. | Tambah `headers()` di `next.config.js`: CSP (mulai mode *report-only*; skrip tema inline perlu hash/nonce), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options`, `Permissions-Policy` |
| **S-04** | **RPC/Edge Function publik tanpa pembatas laju yang memadai** | `tga_request_public`: batas 5/jam **per nama** → penyerang cukup mengganti nama (banjir antrian TGA). `send-gift-passcode`: tanpa login, hanya memeriksa email pendaftar ≤ 15 menit; angka passcode **diterima dari pemanggil** (tidak dicocokkan ke DB) dan `nama`/`eventName` bebas → email palsu dari akun SMTP perusahaan. 51 fungsi `SECURITY DEFINER` dapat dipanggil anon (replika). | Pembatas per IP/WAF (Vercel Firewall / Cloudflare), CAPTCHA pada form publik, batas global per jam, verifikasi nilai passcode ke DB, hapus parameter yang tidak perlu |
| **S-05** | **Jejak audit lemah** | `activity_log` **dan trigger-nya tidak ada di repo** (cakupan tidak bisa dibuktikan). Policy `staff_write` mengizinkan **staf mana pun `INSERT`** → log dapat dipalsukan. Tidak ada pencatatan: login gagal, pelihat password wifi, ekspor data, perubahan role. Tidak ada kebijakan retensi/proteksi log. | Pindahkan DDL log ke repo; isi log hanya lewat trigger `SECURITY DEFINER` (cabut `INSERT` langsung); catat peristiwa sensitif; salin ke penyimpanan terpisah; tetapkan retensi (≥ 12 bulan) |
| **S-06** | **Rahasia & CI/CD** | (a) `vapid-keys.yml` & `android-apk.yml` mengunggah **kunci privat (VAPID, keystore + password)** sebagai artifact (1–3 hari) yang bisa diunduh semua kolaborator repo. (b) `demo-database.yml` memakai `CIKOPS_DB_URL` (kredensial produksi) hanya untuk membaca struktur. (c) Backup memakai connection string pemilik DB. (d) Seluruh `actions/*@v4` dipin dengan tag, bukan SHA. | Buat kunci secara offline lalu simpan di Secrets/brankas; buat peran DB **baca-saja** khusus backup/demo; pin action dengan SHA; pakai *Environment secrets* dengan persetujuan |
| **S-07** | **Repo bukan sumber kebenaran skema (IaC tidak lengkap)** | Menjalankan `01_dasar.sql` gagal 28× karena `atk_items`, `atk_requests`, `atk_restocks`, `vehicle_gate_logs`, fungsi gate/locker/gift, dan kolom `drivers.plant` dibuat langsung di Supabase. Pemulihan bencana dan audit tidak dapat dibangun ulang dari repo. | Ekspor skema produksi (`pg_dump --schema-only`) ke repo sebagai baseline; semua perubahan lewat migrasi bernomor |
| **S-08** | **`/api/gc-nc` bisa dipakai semua akun staf** | `requireDashboardUser` hanya memeriksa "punya profil", bukan peran Security. Mode alternatif memakai `GC_SUPABASE_SERVICE_ROLE_KEY` (hak penuh proyek lain). | Wajib `staff_can('security')`; hanya pakai akun baca-saja, jangan service role |
| **S-09** | **Penyimpanan kredensial** | Password sementara driver dikirim **plaintext lewat email** (`send-driver-credentials`); `rcp_wifi_accounts.password` plaintext (kebutuhan fungsional); `tga_sessions.token` plaintext dan berlaku **120 hari**; `atk_sync_config.sync_key` / `ga_sync_config.sync_key` plaintext; bcrypt `gen_salt('bf')` memakai cost bawaan (6). | Wajib ganti password saat login pertama; simpan token sesi sebagai hash; kurangi masa sesi (≤ 30 hari); cost bcrypt ≥ 10 |
| **S-10** | **Tidak ada pengujian & pemindaian otomatis** | Tidak ada berkas tes; workflow hanya Android/backup/demo/VAPID. Tidak ada CI untuk `build`/`lint`, Dependabot, CodeQL/SAST, atau *secret scanning*. 14 kerentanan dependensi menumpuk tanpa terdeteksi. | Workflow `build` + `npm audit` pada PR; aktifkan Dependabot, secret scanning & push protection, CodeQL |
| **S-11** | **ISMS belum ada** | Tidak ada kebijakan keamanan, register risiko, SoA, prosedur insiden, tinjauan akses, perjanjian pemroses data, pelatihan (kata kunci `insiden`, `RTO`, `kebijakan`, `retensi`, `PDP` = 0 di `docs/`). | Lihat Bagian 6 |

### 3.3 Rendah

| ID | Temuan | Perbaikan |
|---|---|---|
| R-01 | `admin_set_driver_pin` adalah `SECURITY DEFINER` **tanpa** `set search_path` (1 dari 116 fungsi definer). Kolom `drivers.pin_hash` masih ada dengan default PIN `1234`, padahal PIN lama sudah dihapus. | Tambah `set search_path`; hapus fungsi & kolom bila tak dipakai |
| R-02 | Fungsi anon `get_driver_duty_info(uuid)` mengembalikan nama pejabat yang dilayani driver; `get_task_origins`, `tga_names`, `rcp_board` (judul booking hari ini) terbuka untuk layar TV. | Pertimbangkan token layar TV / batasi kolom |
| R-03 | Edge Function memakai `Access-Control-Allow-Origin: *`. Otorisasi memakai Bearer token (bukan cookie) sehingga risiko kecil. | Batasi ke domain aplikasi |
| R-04 | Pembandingan kunci sinkron dan `Bearer == SERVICE_ROLE_KEY` memakai `=`/`!==` (bukan konstan-waktu); tidak ada penghitung percobaan salah untuk `atk_check_key`. | Perbandingan konstan-waktu + penundaan setelah gagal |
| R-05 | `share_token` bukti (20 heks ≈ 80 bit) tidak pernah kedaluwarsa dan tidak bisa dicabut; tautan `/bukti` memuat nama tamu dan (selama aktif) **password wifi**. | Kedaluwarsa otomatis + tombol cabut |
| R-06 | Impor modul Edge Function dari `deno.land/x/denomailer@1.6.0` (ter-pin tetapi tanpa integritas/lock). | Vendor modul atau pakai `deno.lock` |
| R-07 | Pasca-penghapusan karyawan, `tga_activities.requestor_id` dilepas tetapi nama tetap sebagai teks (data pribadi tersalin di banyak tabel); tidak ada kebijakan anonimisasi. | Tetapkan retensi + prosedur anonimisasi |

### 3.4 Hal yang sudah baik (bukti)
1. **RLS aktif pada 48/48 tabel** yang didefinisikan di repo (replika); 6 tabel tanpa policy hanya diakses lewat fungsi (`tga_sessions`, `tga_users`, `push_subscriptions`, …).
2. **Penulisan dibatasi per modul:** 0 tabel yang dapat ditulis oleh "staf mana pun"; 63 policy `RESTRICTIVE` sebagai penjaga tambahan.
3. **Policy anon pada tabel yang ada di repo hanya kantin dan event gift yang terbuka** (disengaja). Tabel lain yang menerima `INSERT` anonim dibuat di luar repo (`employee_requests`, `printer_requests` — diketahui dari `02_peran_keamanan.sql`); sisanya perlu dibuktikan lewat `cek_audit_keamanan.sql` bagian 2 di produksi.
4. `profiles` **tidak punya policy tulis** → tidak ada eskalasi peran lewat REST; perubahan peran hanya lewat Edge Function `manage-staff-account` (memeriksa pemanggil, mencegah ubah role/nonaktif akun sendiri).
5. 115 dari 116 fungsi `SECURITY DEFINER` memakai `set search_path`.
6. **bcrypt** untuk PIN & passcode (`crypt(..., gen_salt('bf'))`); penguncian akun TGA setelah 5 PIN salah; Gift: passcode 8 digit + batas 20 tebakan/10 menit.
7. View memakai `security_invoker`; Command Center publik hanya data hari ini, nama depan saja.
8. Tidak ada kunci/`.env` di git (riwayat penuh dipindai); service role **tidak** sampai ke browser; source map produksi mati; workflow memakai `permissions: contents: read`.
9. **Backup harian terenkripsi (AES-256)**, retensi 30 hari, prosedur pemulihan & anjuran latihan per 3 bulan tertulis di `PANDUAN.md`.
10. Semua Edge Function mengirim email memverifikasi pemanggil (staf) atau membatasi penerima; isi di-escape; ada penjaga injeksi header SMTP.
11. Kunci sinkron Excel (ATK/GA) dapat diputar dari antarmuka; fungsi sinkron `revoke … from public`.
12. Token bukti publik acak (80 bit), password wifi hanya tampil selama pemberian aktif.
13. Pembatasan role Management (hanya baca) dan tidak ada akses ke password wifi.
14. Dokumen PANDUAN memuat hasil audit sebelumnya + langkah pemasangan + skrip pemeriksaan (`cek_audit_keamanan.sql`).

---

## 4. Pemetaan ISO/IEC 27001:2022

Legenda: ✅ sesuai · ◐ sebagian · ✖ belum · — tidak berlaku / di luar bukti repo.

### 4.1 Klausul ISMS (4–10)

| Klausul | Persyaratan | Status | Bukti / celah |
|---|---|---|---|
| 4 | Konteks organisasi, pihak berkepentingan, **ruang lingkup ISMS** | ✖ | Belum ada dokumen ruang lingkup |
| 5 | Kepemimpinan, **kebijakan keamanan informasi**, peran & wewenang | ✖ | Tidak ada kebijakan; peran sistem (role akun) ada, peran ISMS belum |
| 6.1 | **Penilaian & perlakuan risiko**, Statement of Applicability | ✖ | Tidak ada register risiko; laporan ini dapat menjadi masukan awal |
| 6.2 | Sasaran keamanan terukur | ✖ | — |
| 7 | Sumber daya, kompetensi, **kesadaran**, komunikasi, informasi terdokumentasi | ◐ | `PANDUAN.md` sebagai dokumentasi operasional; tanpa pelatihan keamanan |
| 8 | Perencanaan & pengendalian operasional, penilaian risiko berkala | ◐ | Ada skrip audit & backup; tidak berkala/terjadwal |
| 9 | Pemantauan, **audit internal**, **tinjauan manajemen** | ◐ | Audit sebelumnya (bagian 040) & laporan ini; tanpa siklus |
| 10 | Ketidaksesuaian, tindakan korektif, perbaikan berkelanjutan | ◐ | Temuan sebelumnya diperbaiki (040), tetapi tanpa register tindakan |

### 4.2 Annex A.5 — Kontrol organisasi (37)

| Kontrol | Status | Bukti / celah | Rujukan |
|---|---|---|---|
| 5.1 Kebijakan keamanan informasi | ✖ | Belum ada | S-11 |
| 5.2–5.3 Peran, pemisahan tugas | ◐ | Role akun dipisah per modul; tidak ada pemisahan pemilik data vs admin DB | T-03 |
| 5.7 Intelijen ancaman | ✖ | Tidak ada langganan advisori (Dependabot) | S-10 |
| 5.8 Keamanan dalam manajemen proyek | ◐ | Pengerasan 039/040 setelah audit | — |
| 5.9 Inventaris aset | ✖ | Tidak ada inventaris aset informasi/layanan | S-11 |
| 5.10 Penggunaan aset yang dapat diterima | ✖ | — | S-11 |
| 5.12–5.13 Klasifikasi & pelabelan | ✖ | Data pribadi tidak diklasifikasikan | Lampiran A |
| 5.14 Transfer informasi | ◐ | Email via SMTP; password sementara via email | S-09 |
| **5.15 Kontrol akses** | ◐ | Tulis per modul ✅; baca terlalu luas | T-03 |
| 5.16 Manajemen identitas | ✅ | Akun staf lewat Edge Function, driver terpisah, profil tak bisa dinonaktifkan sendiri | — |
| 5.17 Informasi autentikasi | ◐ | bcrypt ✅; password sementara via email, tanpa kebijakan panjang/rotasi | S-09 |
| **5.18 Hak akses** | ✖ | Tidak ada tinjauan akses berkala; akun vendor (ISS) tanpa masa berlaku | S-11 |
| 5.19–5.22 Hubungan pemasok | ✖ | Supabase, Vercel, GitHub, Google (SMTP), Firebase, G4S/ISS tanpa penilaian/perjanjian terdokumentasi | S-11 |
| 5.23 Keamanan layanan cloud | ◐ | Konfigurasi dasar ✅; paket, region, PITR belum terverifikasi | §2.3 |
| 5.24–5.28 Manajemen insiden | ✖ | Tidak ada prosedur, kanal pelaporan, atau pembelajaran insiden | S-11 |
| 5.29–5.30 Kelangsungan layanan | ◐ | Backup & pemulihan tertulis; **RTO/RPO tidak ditetapkan** (RPO tersirat 24 jam) | S-07 |
| 5.31 Persyaratan hukum | ◐ | UU PDP belum dipetakan (lihat 5) | Bagian 5 |
| 5.33 Perlindungan rekaman | ◐ | Log aktivitas ada, integritas lemah | S-05 |
| **5.34 Privasi & PII** | ◐ | Minimisasi parsial (Command Center, NIK disamarkan); hak subjek data, retensi, DPO belum | Bagian 5 |
| 5.35–5.36 Tinjauan independen / kepatuhan | ◐ | Audit ini; belum berkala | — |
| 5.37 Prosedur operasi terdokumentasi | ◐ | `PANDUAN.md` memadai untuk operasi, tanpa prosedur keamanan | — |

### 4.3 Annex A.6 — Kontrol orang (8)
| Kontrol | Status | Catatan |
|---|---|---|
| 6.1–6.2 Penyaringan, syarat kerja | — | Di luar bukti repo |
| **6.3 Kesadaran & pelatihan** | ✖ | Tidak ada program; relevan karena XSS/phishing menyasar staf |
| 6.4 Proses disipliner | — | |
| **6.5 Setelah pemutusan/perubahan kerja** | ◐ | Ada fitur nonaktifkan akun; tidak ada prosedur offboarding (termasuk kunci sinkron Excel & akun vendor) |
| 6.6 Perjanjian kerahasiaan | — | Tidak terlihat (perlu untuk vendor ISS) |
| 6.7 Kerja jarak jauh | ◐ | Aplikasi diakses lewat internet publik; tanpa pembatasan perangkat/jaringan |
| 6.8 Pelaporan kejadian keamanan | ✖ | Tidak ada kanal |

### 4.4 Annex A.7 — Kontrol fisik (14)
Umumnya **tidak berlaku** (SaaS cloud). Catatan: layar TV `Command Center` menampilkan data operasional di area umum (A.7.4/7.7) — pastikan hanya tampilan agregat (sudah demikian), dan gunakan tautan TV yang tidak mudah ditebak.

### 4.5 Annex A.8 — Kontrol teknologi (34)

| Kontrol | Status | Bukti / celah | Rujukan |
|---|---|---|---|
| 8.1 Perangkat pengguna | — | Tidak ada kebijakan perangkat (HP driver/TGA, PWA/APK) | |
| 8.2 Hak akses istimewa | ◐ | Role `master/admin/ga` penuh; Edge Function service role; tanpa MFA terverifikasi | §2.3 |
| **8.3 Pembatasan akses informasi** | ◐ | RLS ✅; baca terlalu luas | T-03, S-02 |
| 8.4 Akses kode sumber | ◐ | Repo privat? (verifikasi); proteksi branch tidak terlihat | §2.3 |
| **8.5 Autentikasi aman** | ◐ | Supabase Auth + bcrypt + penguncian TGA ✅; MFA & kebijakan password tidak terverifikasi; sesi TGA 120 hari | S-09 |
| 8.6 Manajemen kapasitas | ◐ | Batas "Max rows" diatur; tanpa pemantauan kuota | |
| 8.7 Perlindungan malware | — | Unggah `.xlsx` oleh staf; dependensi `exceljs` rentan | T-04 |
| **8.8 Manajemen kerentanan teknis** | ✖ | 14 kerentanan dependensi; tanpa Dependabot/CodeQL; Next rentan | T-02, T-04, S-10 |
| **8.9 Manajemen konfigurasi** | ◐ | SQL bernomor & idempoten ✅; skema tidak lengkap di repo; header tak dikonfigurasi | S-07, S-03 |
| 8.10 Penghapusan informasi | ✖ | Tidak ada retensi/penghapusan otomatis (tamu, wifi, kunjungan) | R-07 |
| **8.11 Penyamaran data** | ◐ | NIK disamarkan (gift, SIM hash); NIK karyawan tampil penuh ke banyak role | T-03 |
| 8.12 Pencegahan kebocoran data | ◐ | Ekspor Excel/PDF tanpa batas & tanpa log | S-05 |
| **8.13 Backup** | ✅ | Harian, AES-256, 30 hari, prosedur tertulis. Catatan: kunci tunggal (`BACKUP_PASSPHRASE`) & penyimpanan di GitHub; latihan pemulihan belum terbukti | S-06 |
| 8.14 Redundansi | ◐ | Mengandalkan SLA Supabase/Vercel (paket belum terverifikasi) | §2.3 |
| **8.15 Pencatatan log** | ◐ | `activity_log` ada; cakupan tak terbukti; dapat dipalsukan | S-05 |
| 8.16 Pemantauan aktivitas | ✖ | Tidak ada alarm anomali (login gagal, lonjakan RPC) | S-04 |
| 8.17 Sinkronisasi jam | ✅ | Semua stempel waktu server (`now()`), WIB konsisten | |
| 8.20–8.22 Keamanan jaringan | ◐ | TLS oleh platform; tanpa WAF/pembatas laju | S-04 |
| 8.23 Penyaringan web | — | | |
| **8.24 Kriptografi** | ◐ | TLS, bcrypt, backup AES-256 ✅; token & kunci sinkron plaintext di DB; tanpa kebijakan kunci | S-09 |
| 8.25 Siklus pengembangan aman | ◐ | Pengerasan setelah audit; tanpa tinjauan kode/threat modelling formal | S-10 |
| **8.26 Persyaratan keamanan aplikasi** | ◐ | RLS & guard fungsi ✅; validasi input publik lemah | T-01, S-04 |
| 8.27 Arsitektur aman | ◐ | Prinsip RPC `SECURITY DEFINER` + `search_path` ✅ | |
| **8.28 Pengodean aman** | ✖ | XSS tersimpan; `document.write` tanpa escape | T-01 |
| **8.29 Pengujian keamanan** | ✖ | Tanpa SAST/DAST/pentest/tes otomatis | S-10 |
| 8.30 Pengembangan oleh pihak luar | ◐ | Kode ditulis dengan bantuan AI; tinjau manusia & lisensi | |
| **8.31 Pemisahan lingkungan** | ◐ | Ada deployment DEMO/mockup terpisah ✅; bukti pemisahan preview vs produksi belum ada | §2.3 |
| **8.32 Manajemen perubahan** | ◐ | Merge ke `main` oleh pemilik; tanpa review wajib/CI | S-10 |
| 8.33 Informasi uji | ✅ | Data demo fiktif (`05_data_demo.sql`), mode mockup | |
| 8.34 Perlindungan saat audit | ✅ | Audit baca-saja | |

---

## 5. Perlindungan data pribadi (UU No. 27/2022 — rujukan, bukan nasihat hukum)

### 5.1 Inventaris data pribadi yang ditemukan
| Data | Lokasi | Subjek | Catatan |
|---|---|---|---|
| NIK, nama, email, HP, jabatan, departemen | `employees`, `atk_employees` | Karyawan | NIK tampil luas (T-03) |
| Nama, HP, email, **hash PIN**, kendaraan | `drivers`, `profiles`, `auth.users` | Driver & staf | |
| Nama, instansi, **HP**, tujuan kunjungan | `rcp_visitors`, `rcp_wifi_grants`, `rcp_room_bookings` | **Tamu eksternal** | Tanpa retensi; perlu pemberitahuan privasi di lobi |
| NIK, email, pilihan hadiah, jumlah anak < 2 tahun | `gift_registrations` | Karyawan (+ informasi keluarga) | Pendaftaran publik tanpa validasi isi (T-01) |
| Nomor SIM (hash + 4 digit), nama driver transporter | modul Security (G-C) | Pihak ketiga | Hash dengan garam tetap |
| Lokasi/gerak kendaraan & driver | `tasks`, `vehicle_gate_logs` | Driver | Pemantauan karyawan |

### 5.2 Kesenjangan
1. **Dasar pemrosesan & pemberitahuan privasi** belum terdokumentasi (tamu, karyawan, anak).
2. **Retensi & penghapusan** tidak ada (A.8.10).
3. **Pemroses data** (Supabase, Vercel, GitHub backup, Google SMTP, Firebase) belum punya DPA / penilaian transfer lintas negara (verifikasi region Supabase).
4. **Pemberitahuan pelanggaran** (rujukan: 3×24 jam) belum punya prosedur (A.5.26).
5. **Hak subjek data** (akses/koreksi/hapus) belum ada alur.
6. Penunjukan **petugas PDP** perlu dikaji bila pemrosesan berskala besar.

---

## 6. Peta jalan perbaikan

| Fase | Tindakan | Temuan | Perkiraan |
|---|---|---|---|
| **0–7 hari** | Escape semua HTML cetak + validasi panjang pada RPC publik | T-01 | 0,5–1 hari |
| | Naikkan Next.js ke 16.4.5 + uji | T-02 | 0,5 hari |
| | Cabut tulis anonim kantin → kode petugas + `CHECK` | S-01 | 1 hari |
| | `atk_employees_read` → `staff_can('facility')` | S-02 | 15 menit |
| | Putar kunci yang pernah lewat artifact (VAPID, keystore bila dibuat lewat workflow); pindahkan ke Secrets | S-06 | 0,5 hari |
| | Jalankan `cek_audit_keamanan.sql` di produksi & simpan hasil | §2.3 | 1 jam |
| **8–30 hari** | Batasi baca per peran (policy `SELECT`), sembunyikan `pin_hash` | T-03 | 3–5 hari |
| | Header keamanan + CSP *report-only* → enforce | S-03 | 2 hari |
| | CI: build + `npm audit`, Dependabot, secret scanning, CodeQL | S-10 | 1 hari |
| | Pembatas laju & CAPTCHA form publik; verifikasi passcode di DB | S-04 | 2 hari |
| | Baseline skema produksi ke repo | S-07 | 1–2 hari |
| | jsPDF/exceljs/DOMPurify terbaru + uji ekspor | T-04 | 2 hari |
| | Peran DB baca-saja untuk backup/demo, pin action ke SHA | S-06 | 1 hari |
| **31–90 hari** | Perkuat `activity_log` (trigger-only, peristiwa sensitif, retensi), alarm anomali | S-05 | 3–4 hari |
| | Password sementara → wajib ganti; sesi TGA ≤ 30 hari; token disimpan hash | S-09 | 2 hari |
| | `gc-nc` per peran; hapus mode service role | S-08 | 0,5 hari |
| | Kebijakan retensi & anonimisasi (tamu, wifi, kantin) + job pembersih | R-07 | 3 hari |
| | Verifikasi pengaturan Supabase/Vercel/GitHub (MFA semua akun admin, signup, PITR, Deployment Protection) | §2.3 | 1 hari |
| **3–6 bulan** | **ISMS minimum:** ruang lingkup, kebijakan, register risiko + SoA, prosedur insiden & notifikasi pelanggaran, tinjauan akses triwulanan, daftar pemasok + DPA, retensi, pelatihan kesadaran, latihan pemulihan (RTO/RPO) | S-11 | 1–2 bulan paralel |
| **6–9 bulan** | Audit internal ISO 27001, tinjauan manajemen, perbaikan, lalu audit tahap 1 & 2 bila ingin bersertifikat | — | |

### Kebijakan minimum yang disarankan (12 dokumen ringkas)
Kebijakan keamanan informasi · Kontrol akses & tinjauan hak akses · Kriptografi & manajemen kunci · Pengembangan aman & manajemen perubahan · Manajemen kerentanan & patch · Backup, RTO/RPO, & pemulihan bencana · Manajemen insiden & pelaporan pelanggaran data · Klasifikasi & retensi data · Pelindungan data pribadi (UU PDP) · Manajemen pemasok & cloud · Penggunaan aset yang dapat diterima · Pelatihan & kesadaran.

---

## Lampiran A — Daftar fungsi `SECURITY DEFINER` yang dapat dipanggil tanpa login (hasil replika DB)

**Dijaga kunci/kode/token (disengaja):** `atk_excel_push_employee`, `atk_mark_pulled`, `atk_pull_for_excel`, `atk_upsert_item`, `ga_ping/pull/sync_*` (kunci sinkron); `create_gift_registration`, `verify_gift_passcode` (passcode, batas tebakan); `tga_login/logout/my_data/accept/save_activity/delete_activity/push_subscribe/requestors` (token sesi); `tga_assign_public(_info)` (kode); `rcp_receipt` (token bukti).

**Dijaga peran login di dalam fungsi:** `rcp_wifi_accounts_status`, `rcp_wifi_suggest`, `rcp_staff_name`, `tga_admin_*`, `tga_is_staff`, `security_is_dashboard_user`, serta semua `rcp_*` yang memanggil `rcp_staff_name()` (`rcp_wifi_grant/import/return`, `rcp_parcel_handover`, `rcp_room_book`).

**Publik tanpa penjaga (perlu keputusan):** `canteen_menu_public` (menu TV — wajar), `rcp_board`, `tga_board`, `get_fm_snapshot`, `get_viewonly_snapshot` (Command Center — hanya hari ini), `tga_names` (daftar nama teknisi), `tga_request_public` (form publik — lihat S-04), `get_driver_duty_info`, `get_task_origins`, `push_unsubscribe`.

## Lampiran B — Perintah yang dipakai
```bash
# replika DB (stub Supabase + SQL repo) → ukur RLS, policy, fungsi
psql -d aud -f stub.sql; for f in 01_dasar 02_peran_keamanan 04_aplikasi_lapangan; do psql -d aud -f supabase/$f.sql; done
# tabel tanpa RLS / policy untuk anon / policy 'authenticated' longgar / fungsi definer anon  → supabase/cek_audit_keamanan.sql (bagian 1-5)
npm audit --omit=dev --json
git grep -nE "(eyJ[a-zA-Z0-9_-]{20,}\.…|AKIA…|AIza…|-----BEGIN … PRIVATE KEY)"   # + seluruh riwayat git
```

## Lampiran C — Checklist verifikasi di dashboard (tidak terlihat dari repo)
- [ ] **Supabase Auth:** signup publik dimatikan; panjang password ≥ 12; *leaked password protection* aktif; masa sesi/refresh sesuai kebijakan; MFA untuk akun Master Admin.
- [ ] **Supabase:** paket (Free = tanpa PITR & dapat *pause*), region, *network restrictions*, *SSL enforcement*, log retensi; **Max rows** sudah 1500 (dikonfirmasi).
- [ ] **Vercel:** *Deployment Protection* untuk preview, variabel env produksi vs preview terpisah, **`NEXT_PUBLIC_MOCK_BACKEND` tidak diaktifkan di produksi**, firewall/WAF aktif.
- [ ] **GitHub:** proteksi branch `main` (review wajib), 2FA seluruh kolaborator, *secret scanning + push protection*, Dependabot, repo privat.
- [ ] **Akun:** daftar pemegang akses admin (Supabase, Vercel, GitHub, Firebase, SMTP) dan kunci sinkron Excel; offboarding.
- [ ] **Produksi:** jalankan `cek_audit_keamanan.sql` bagian 1–9 dan simpan hasil sebagai bukti.
