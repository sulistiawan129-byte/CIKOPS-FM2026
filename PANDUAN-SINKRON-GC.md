# Panduan Sinkron Data G-C → CIKOPS

Panduan ini menyambungkan **pelanggaran transporter** dari aplikasi G-C (Kepatuhan Transporter / Security Desk) ke CIKOPS, supaya:

- tab **Laporan Security → Pelanggaran Transporter** terisi otomatis,
- modul **Security** di **Report → Laporan Manajemen** memakai data G-C,
- tidak ada lagi input ulang sekitar 100 kasus per bulan.

Sambungan ini **hanya membaca**. CIKOPS tidak pernah menulis, mengubah, atau menghapus data G-C.

---

## 1. Cara kerjanya

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

## 2. Langkah di database CIKOPS (sekali)

Buka **Supabase project CIKOPS → SQL Editor**, lalu jalankan berurutan:

1. **`supabase/021_security.sql`** membuat tabel modul Security (`security_monthly`, `security_config`) beserta aturan aksesnya.
2. **`supabase/022_security_seed_2025_2026.sql`** mengisi riwayat 12 bulan (Sep 2025 – Agu 2026) dan data lengkap September 2026 dari laporan G4S, supaya grafik tren 13 bulan langsung terisi.

Keduanya aman dijalankan ulang. File 022 tidak menimpa data September 2026 yang sudah diinput di aplikasi.

> **Akun dengan menu terbatas.** Kalau ada akun yang kolom `allowed_tabs`-nya diisi daftar menu, tambahkan `security` supaya menu muncul. Contoh:
> ```sql
> update profiles set allowed_tabs = array_append(allowed_tabs, 'security')
> where allowed_tabs is not null and not ('security' = any(allowed_tabs));
> ```
> Akun scope Pasar Rebo (PRB) memang tidak melihat menu Security.

---

## 3. Langkah di G-C / Security Desk: akun baca-saja

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

## 4. Langkah di Vercel (project CIKOPS)

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

## 5. Uji sambungan

1. Buka CIKOPS → **Laporan Security → Pengaturan → Cek koneksi G-C**. Hasil yang benar kira-kira:
   `✓ Tersambung (akun baca-saja) · plant Cikarang · 417 laporan Accept · terbaru 11 Okt`
2. Buka tab **Pelanggaran Transporter**. Seharusnya muncul pita hijau "Tersinkron otomatis dari G-C". Untuk September 2026, angkanya **109 kasus · 136 temuan · 43 perusahaan**, dengan JMM 5 kasus dan Becis 0.
3. Di daftar **Driver pelanggar (Becis & JMM)**, klik **Beri nama** untuk driver yang tampil sebagai `SIM ••1234 · B 1234 XX`. Cukup sekali; nama dipakai lagi di bulan-bulan berikutnya.
4. Buka **Report → Laporan Manajemen**, centang **Security**, pilih September 2026, lalu **Susun laporan**.

---

## 6. Data yang dipakai dari G-C

| Tabel G-C | Kolom yang dibaca |
|---|---|
| `nc_reports` | `id`, `tanggal`, `supplier_id`, `no_polisi`, `nomor_identitas` (di-hash), filter `status = 'Accept'` dan `plant` |
| `nc_report_findings` | `report_id`, `category_id` |
| `suppliers` | `id`, `name` |
| `nc_categories` | `id`, `name` |

Kolom lain (catatan, nama petugas, dll.) tidak dibaca.

---

## 7. Perusahaan khusus (Becis & JMM)

- Diatur di **Laporan Security → Pengaturan → Perusahaan khusus**.
- Nama harus **persis** sama dengan master supplier G-C. Saat ini: `PT. BECIS` dan `PT. JAYA MUKTI MANDIRI`.
- Jangan pakai potongan kata. Di G-C ada juga **PT. ARJAYA MUKTI SENTOSA**, dan pencarian "jaya mukti" akan ikut menangkapnya.

---

## 8. Kalau ada masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| "Sinkron G-C belum dikonfigurasi" | Environment variable `GC_*` belum diisi atau belum redeploy | Lengkapi langkah 4 lalu Redeploy |
| "Login ke G-C gagal" | Email/password salah, atau akun belum dikonfirmasi | Cek akun di Supabase G-C → Authentication; reset password |
| "G-C menolak query … permission denied" | Peran akun tidak boleh membaca tabel NC | Ganti peran akun menjadi SHE Department (atau peran lain yang bisa melihat G-C) |
| Tersambung tetapi 0 kasus | `GC_PLANT` tidak sama dengan isi kolom plant | Samakan dengan nilai di G-C (mis. `Cikarang`) |
| Becis/JMM tidak terpisah | Nama perusahaan khusus tidak persis sama | Perbaiki di tab Pengaturan |
| Angka beda sedikit dengan laporan G4S | Ada input susulan di G-C setelah laporan G4S dibuat | Normal. CIKOPS selalu memakai data G-C terbaru |
| Bulan Mei–Juni 2026 | G-C belum lengkap (Juni hanya 12 laporan) | Sudah diisi dari laporan G4S lewat SQL 022 (kolom "Pelanggaran" di tab Riwayat). Angka riwayat menggantikan data G-C untuk bulan tsb |

Selama G-C tidak tersambung, laporan tetap bisa dibuat: tab Pelanggaran Transporter menyediakan **input manual (cadangan)**, dan report otomatis memakai angka itu.
