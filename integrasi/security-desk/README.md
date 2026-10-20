# Security Desk

Sistem operasional security **dan** kepatuhan transporter (G-C) untuk **FFI Plant Cikarang**, dalam satu aplikasi dan satu login.
- **Modul Security:** data harian, kejadian & patroli, personel, KPI, laporan bulanan (PowerPoint), layar ruang Security.
- **Modul Kepatuhan transporter (dulu aplikasi CIKOPS-G-C):** gate in/out, laporan pelanggaran (NC), analisa, decision support, rekap bulanan, cetak Excel, surat resmi PDF, import data lama, total pemeriksaan, supplier & tujuan.

- **Frontend**: Next.js 14 (App Router) → di-deploy ke **Vercel**
- **Database, login & realtime**: **Supabase** (Postgres + Auth + Realtime)
- **Kode**: disimpan di **GitHub**, Vercel otomatis deploy setiap ada push

---

## Isi aplikasi

| Halaman | Path | Fungsi |
|---|---|---|
| Dashboard | `/` | Satu dashboard untuk semua peran (kecuali SHE): angka utama, kendaraan per hari, perlu dicek & kesiapan slide, pelanggaran transporter (NC), portal gate live, kendaraan di dalam area, kejadian, patroli & personel, KPI, rekap per kategori. Untuk Management tampil versi lihat-saja |
| Data harian | `/harian` | Kalender + isi 5 angka per hari (mobil karyawan/tamu/kontraktor, motor, visitor). Tersimpan otomatis |
| Kejadian & patroli | `/kejadian` | Jumlah kejadian per kategori + keterangan, data guard tour |
| Personel & temuan | `/personel` | Cuti/sakit + backup, need improvement + progres & status |
| KPI | `/kpi` | Skor 1–5 per objektif per bulan, nilai tahun berjalan |
| Laporan bulanan | `/laporan` | 12 slide format laporan, catatan highlight, **unduh PowerPoint** |
| Dashboard NC, Laporan NC, Input NC, Total pemeriksaan, Supplier & tujuan | `/gc/...` | Modul G-C (lihat bagian Penggabungan) |
| Pengguna | `/pengguna` | (Admin G4S / Admin GA) buat akun, atur peran/site/menu, nonaktifkan, reset password, log aktivitas |
| Gate transporter | `/gate` | Ringkasan gate (masuk, keluar, di dalam, > 4 jam, temuan, rata-rata durasi), arus per jam, transporter teratas, Gate In/Out, persetujuan SL/SPV, cetak form, laporan NC |
| Layar ruang Security | `/display` | Dashboard eksekutif layar penuh, realtime, termasuk panel **Portal gate · live** dan ringkasan kendaraan gate |
| Aplikasi petugas | `/pos` | Link terpisah untuk petugas gate (lihat bagian Modul Gate) |

**Tampilan penuh layar & adaptif.** Semua halaman admin memakai seluruh lebar layar: menu gelap di kiri (bisa diciutkan dengan tombol «), header ringkas, dan grid 12 kolom yang menyesuaikan ukuran layar. Di tablet kartu-kartu tersusun ulang, di HP menu pindah ke bar bawah.

### Peran & scope

| Peran | Bisa apa | Halaman awal |
|---|---|---|
| **Admin G4S** | Semua menu & data, semua site, kelola pengguna, log aktivitas | Ringkasan |
| **Admin GA** | Sama dengan Admin G4S | Ringkasan |
| **GA Department** | Semua menu & data, semua site, **tanpa** kelola pengguna | Ringkasan |
| **SHE Department** | Hanya modul G-C: Dashboard NC, Gate in/out, Laporan NC (analisa, rekap, cetak Excel, surat PDF). Lihat, unduh & cetak saja, tidak bisa mengubah data | Dashboard NC |
| **Management** | Hanya Dashboard (security + transporter + NC), lihat saja: tanpa tombol ubah, tanpa menu lain | Dashboard |
| **Petugas Gate** | Aplikasi `/pos`: gate in/out, input NC, total pemeriksaan, NC hari ini. Hanya site yang dicentang | Aplikasi pos |
| **Layar ruang Security** | Hanya `/display` | Layar ruang Security |

Aturan ini dijaga di dua tempat: tampilan aplikasi (`src/lib/access.ts`) dan **Row Level Security di database** (`supabase/merger_gc.sql`). Jadi walaupun seseorang memanggil API Supabase langsung, SHE tetap tidak bisa mengubah data NC dan Management tidak bisa mengubah apa pun.

### Penggabungan dengan aplikasi G-C (sekali saja)

1. Jalankan **`supabase/merger_gc.sql`** di Supabase → SQL Editor (setelah `schema.sql`, `gate_module.sql`, `akses_akun.sql`). File ini:
   - mengganti peran lama: Master Admin & Admin → **Admin G4S**, Viewer → **Management**;
   - memberi akses otomatis ke akun aplikasi G-C: admin_ga → **Admin GA**, admin_security → **Admin G4S**, petugas_gate → **Petugas Gate**;
   - memperketat aturan akses tabel G-C sesuai peran baru. **Data G-C tidak dipindah atau diubah.**
2. Buka menu **Pengguna**. Ubah peran akun yang perlu (mis. akun SHE dan Management), dan nonaktifkan akun yang tidak dipakai lagi. Semua akun G-C lama awalnya menjadi Petugas Gate kalau perannya di G-C belum pernah dinaikkan.
3. Pensiunkan aplikasi G-C lama: hapus/arsipkan project Vercel-nya. Semua orang memakai link utama ini.
4. Kalau perlu membatalkan aturan akses tabel G-C (supaya aplikasi lama jalan lagi), jalankan `supabase/merger_gc_rollback.sql`.

**Total pemeriksaan otomatis.** Jumlah kendaraan yang diperiksa per hari (dasar *True NC Rate*) sekarang dihitung dari Gate In. Input manual di menu Total pemeriksaan tetap bisa dipakai; kalau satu tanggal diisi manual, angka manual yang dipakai. Supaya cocok dengan plant di data NC, kolom `security.sites.gc_plant` diisi nama plant G-C (sudah otomatis "Cikarang" untuk site CIK).

### Realtime

Semua halaman berlangganan perubahan tabel lewat Supabase Realtime. Begitu satu admin menyimpan angka, layar lain (admin lain, viewer, layar ruang Security) ikut berubah dalam hitungan detik. Indikator **LIVE** di pojok atas menunjukkan koneksi. Sebagai jaring pengaman, data juga dimuat ulang saat tab kembali aktif, saat internet tersambung lagi, dan setiap 2 menit.

---

## 1. Siapkan Supabase

Security Desk dipasang di **project Supabase yang sama dengan aplikasi G-C**. Tabel Security Desk ada di schema terpisah **`security`**; tabel G-C tetap di schema `public`. Satu-satunya perubahan pada schema `public` adalah aturan akses tabel G-C oleh `merger_gc.sql` (langkah penggabungan di atas), datanya tidak disentuh.

1. **SQL Editor → New query**, tempel isi `supabase/schema.sql`, klik **Run**.
2. (Opsional, untuk mencoba) jalankan `supabase/seed_agustus_2026.sql`, berisi data contoh Agustus 2026.
3. **Project Settings → API → Data API → Exposed schemas**: tambahkan **`security`**, lalu Save. Tanpa langkah ini aplikasi tidak bisa membaca data.
4. Jalankan `supabase/gate_module.sql`, `supabase/akses_akun.sql`, lalu `supabase/merger_gc.sql`.
5. Beri peran Admin G4S ke akun Anda (kalau belum). Akun yang sudah ada di Authentication → Users boleh dipakai:
   ```sql
   insert into security.profiles (id, email, full_name, role, active)
   select id, email, 'Nama Anda', 'admin_g4s', true
   from auth.users where email = 'email@anda.com'
   on conflict (id) do update set role = 'admin_g4s', active = true;
   ```
6. **Project Settings → API**: catat **Project URL**, **anon public key**, dan **service_role key**.

### Ubah password sendiri
Setiap akun bisa mengganti password sendiri, tanpa perlu admin:
- **Aplikasi utama:** klik nama di pojok kanan atas, lalu pilih **Ubah password**.
- **Aplikasi petugas (`/pos`):** klik tombol **Password** di header.

Password lama wajib diisi. Password baru minimal 8 karakter dan harus berisi huruf dan angka. Karena akunnya dipakai bersama, password baru ini juga berlaku di aplikasi lain seperti G-C.

Kalau muncul pesan "verifikasi tambahan", buka Supabase → Authentication → Providers → Email, lalu matikan **Secure password change**.

### Memberi akses ke akun yang sudah ada (mis. akun G-C)
Akun dari aplikasi lain bisa login dengan email dan password yang sama, tetapi **baru bisa masuk Security Desk setelah diberi akses**. Ini disengaja supaya tidak semua akun G-C otomatis melihat data security.
1. Jalankan `supabase/akses_akun.sql` sekali di SQL Editor.
2. Buka menu **Pengguna**, lalu cari bagian *Akun dari aplikasi lain belum punya akses*. Pilih peran dan site, lalu klik **Beri akses**.

Cara cepat lewat SQL juga tersedia di bagian bawah file `akses_akun.sql`.

### Akun login dipakai bersama
- Satu email bisa masuk ke aplikasi lain dan ke Security Desk dengan password yang sama. Akses Security Desk diatur terpisah di `security.profiles` (menu **Pengguna**).
- Akun yang **belum** diberi akses di menu Pengguna tidak bisa masuk ke Security Desk, meskipun email dan password-nya benar.
- Menu Pengguna → **Tambah akun** dengan email yang sudah terdaftar di aplikasi lain: aksesnya ditambahkan, password lama tetap berlaku.
- Tombol **Keluar** di Security Desk hanya mengakhiri sesi Security Desk. Sesi di aplikasi lain tidak ikut putus.
- Perhatian: project ini punya trigger `on_auth_user_created` milik aplikasi lain. Setiap akun **baru** yang dibuat dari Security Desk juga otomatis mendapat baris di `public.profiles` dengan peran bawaan aplikasi itu. Pastikan peran bawaan tersebut tidak memberi akses yang tidak diinginkan di aplikasi lain.

## 2. Upload ke GitHub

```bash
cd security-desk
git init
git add .
git commit -m "Security Desk v1"
git branch -M main
git remote add origin https://github.com/<akun-anda>/security-desk.git
git push -u origin main
```

Atau lewat web: buat repo baru di GitHub → **uploading an existing file** → seret isi folder ini (kecuali `node_modules` dan `.next`).

## 3. Deploy ke Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import** repo `security-desk`. Next.js terdeteksi otomatis.
2. **Environment Variables**:

   | Nama | Nilai |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**jangan** diawali `NEXT_PUBLIC_`) |

3. **Deploy**. Setiap push ke `main` akan otomatis ter-deploy ulang.
4. Di Supabase: **Authentication → URL Configuration → Site URL** isi dengan alamat Vercel Anda.

## 4. Pasang layar ruang Security

1. Di menu **Pengguna**, buat akun dengan peran **Layar Ruang Security**, centang site CIK.
2. Di PC/TV box ruang Security, buka alamat aplikasi, login dengan akun itu. Otomatis masuk ke `/display`.
3. Klik **Layar penuh** (tombol muncul saat mouse digerakkan, hilang lagi setelah 4 detik).
4. Tips: pakai Chrome dengan mode kiosk supaya langsung layar penuh saat PC menyala:
   `chrome --kiosk https://alamat-anda.vercel.app/display`

Layar ini menjaga agar monitor tidak masuk mode tidur, memilih bulan terbaru secara otomatis, dan memuat ulang dirinya setiap 6 jam. Untuk site lain gunakan `/display?site=KODE`.

---

## Data tambahan laporan & sinkron ke CIKOPS

Supaya laporan manajemen di CIKOPS (FM) terisi otomatis tanpa input ulang, Security Desk menyimpan beberapa angka tambahan yang dulu diketik di CIKOPS:

| Di mana | Isi |
|---|---|
| **Data harian** → kelompok *Transporter & biomas* | Transporter timbang, non-timbang, suplai sekam & buang abu (PT Becis) per hari |
| **Kejadian & patroli** → *Transporter & biomas* | Selisih timbang ≥ 40 kg dan jumlahnya dari kendaraan Palm Oil / Fat Blend (bulanan) |
| **Kejadian & patroli** → *Kunjungan team support* | Jumlah kunjungan Team G / External / Lingkungan / G4S + catatan |
| **Kejadian & patroli** → *Issue area* | Tanggal, jenis, deskripsi, status Open/Close |
| **Laporan bulanan** | 2 slide baru: *Transporter & biomas* dan *Kunjungan & issue area* |

**Setup (sekali):** jalankan `supabase/laporan_cikops.sql` di SQL Editor (setelah `merger_gc.sql`). Tabel lama tidak diubah. File ini juga membuat fungsi baca-saja `security.cikops_report(bulan, site)` yang dipanggil server CIKOPS dengan akun berperan **Management**. Sebelum SQL dijalankan, bagian tambahan ini tidak tampil dan halaman lain tetap berjalan normal.

## Modul Gate transporter

Digitalisasi form **Ceklist Pemeriksaan Kelengkapan Transporter**: Gate In (kedatangan), daftar kendaraan di dalam area, Gate Out (keberangkatan), persetujuan Shift Leader/Supervisor, cetak form, dan pembuatan laporan pelanggaran ke aplikasi NC.

**Setup (sekali):** jalankan `supabase/gate_module.sql` di SQL Editor setelah `schema.sql`. File ini aman dijalankan ulang, dan tidak mengubah tabel aplikasi NC. Tabel `suppliers` dan `destinations` hanya dibaca. Laporan NC dibuat lewat fungsi `security.gate_create_nc` saat petugas menekan tombol.

**Akun petugas:** di menu Pengguna, buat akun dengan peran **Petugas Gate** dan centang site-nya.

**Link khusus petugas: `/pos`** (misalnya `https://cik-g4s.vercel.app/pos`)
- Punya halaman login sendiri (`/pos/login`) dan tampilan ringkas tanpa menu admin.
- Di PC/tablet lebar: kiri daftar kendaraan di dalam area, kanan form Gate In. Di HP: dua tab di bawah (*Di dalam · Gate Out* dan *Gate In*).
- **Gate In cepat:** semua item checklist dianggap lengkap/OK, petugas cukup mengetuk yang bermasalah (berubah merah). Temuan kondisi fisik wajib diberi keterangan. Nopol yang pernah datang mengisi data pengemudi otomatis. Detail lain (jenis kendaraan, surat jalan, segel, kenek) bisa dibuka bila perlu. Form lengkap tetap ada di `/pos/baru`.
- **Gate Out cepat:** ketuk kartu kendaraan, lalu lembar Gate Out muncul dari bawah (tujuan, surat jalan, segel, checklist keluar, persetujuan pengemudi).
- Bisa dipasang sebagai aplikasi di HP: buka link di Chrome, lalu pilih menu **Tambahkan ke layar utama**. Namanya akan muncul sebagai "Pos Gate".
- Akun Petugas Gate yang login lewat link utama otomatis diarahkan ke `/pos`.
- Admin dan SPV tetap bisa membuka `/pos` untuk membantu di gate. Linknya ada di menu kiri: *Aplikasi petugas gate ↗*.

**Opsional, pakai domain terpisah** (misalnya `pos-cik-g4s.vercel.app`):
1. Vercel → project → Settings → **Domains** → tambahkan domain tersebut.
2. Vercel → Settings → Environment Variables: `POS_HOST` = `pos-cik-g4s.vercel.app`, lalu Redeploy.
3. Membuka domain itu akan langsung masuk ke halaman petugas.

**Aturan yang dijaga database:**
- Jam masuk dan keluar diisi server, sehingga tidak bisa dimundurkan.
- Nomor dokumen otomatis dengan format `GT-<site>-<YYMM>-<urut>`.
- Petugas gate tidak bisa mengisi persetujuan SL/SPV.
- Setelah kendaraan keluar, data hanya bisa diubah atau dihapus admin.
- Laporan NC hanya bisa dibuat sekali per pemeriksaan.

## Menjalankan di komputer sendiri

```bash
npm install
cp .env.example .env.local   # isi 3 nilai dari Supabase
npm run dev                  # http://localhost:3000
```

## Struktur

```
supabase/
  schema.sql              schema "security": tabel, RLS, trigger log, realtime
  seed_agustus_2026.sql   data contoh Agustus 2026
src/
  middleware.ts           cek login + arahkan akun layar ke /display
  lib/
    supabase/             klien browser, server, dan service role
    data.ts               ambil data per bulan + langganan realtime + fungsi simpan
    calc.ts               rata-rata, selisih, KPI, daftar "perlu dicek"
    slides.ts             pembentuk 12 slide laporan (format G4S)
    constants.ts dates.ts types.ts useDrafts.ts latest.ts
  components/             AppContext (sesi, site, bulan, toast), Shell, komponen UI
  app/
    (app)/                halaman admin (butuh login)
    display/              layar ruang Security
    login/                halaman masuk
    api/admin/users/      buat akun & reset password (khusus Admin G4S / Admin GA)
```

## Aturan hitung yang dipakai

- **Minggu ke-** dihitung Senin–Minggu. Hari setelah minggu ke-5 digabung ke minggu ke-5 (mengikuti laporan).
- **Hari kerja/libur** = Senin–Jumat / Sabtu–Minggu.
- **Rata-rata harian** = total hari kerja ÷ jumlah hari kerja (dan sama untuk hari libur).
- **Grafik 13 bulan**: bulan yang punya data harian memakai jumlah data harian; bulan sebelum sistem dipakai memakai tabel `security.monthly_baseline`.
- **Nilai KPI tahun berjalan** = rata-rata bulan yang sudah dinilai × bobot (tidak dibagi 12).

## Menambah site baru

```sql
insert into security.sites (code, name, client) values ('KODE', 'Nama Plant', 'Nama Klien');
```
Lalu centang site tersebut untuk akun yang boleh mengaksesnya di menu Pengguna.
