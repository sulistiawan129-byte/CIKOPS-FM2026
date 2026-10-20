# Role per scope — setiap admin mengelola modulnya sendiri

| Role | Kelola | Halaman awal | Kelola akun untuk |
|---|---|---|---|
| **Master Admin** | Semua modul (termasuk Kantin), Log Aktivitas | Beranda | Semua role |
| **Admin GA CIK** | Penugasan, Armada, Gate Log, Pom Bensin (CIK), Klaim, Dana Operasional, Locker, Pembagian, Printer, ATK, Permintaan Karyawan, Receptionist, Master Data, Kalender, Report (Fleet, Klaim, ATK) | Beranda | Admin GA CIK, Receptionist |
| **Admin GA PRB** | Penugasan, Armada, Master Data (driver, pegawai, pengaturan), Kalender, Report Fleet — **data PRB saja** | Beranda (versi PRB) | Admin GA PRB |
| **Admin / SPV ISS** | Cleaning & Gardening + TGA, Report Cleaning & Gardening | Cleaning & Gardening | Admin / SPV ISS |
| **Admin / SPV Security** | Laporan Security, Report Security | Laporan Security | Admin / SPV Security |
| **Receptionist** | Receptionist, Kalender (agenda & kunjungan, tanpa penugasan driver) | Receptionist | — |
| **Management** | **Lihat saja**: FM Command Center + tarik laporan semua modul | Command Center | — |

Tetap **tanpa login**: `/canteen` (staf kantin input), `/gate` (pos security),
`/request`, `/bukti`, `/locker`, `/gift`, dan Command Center `/dashboard-viewonly`.
Driver & TGA tetap memakai aplikasinya sendiri (`/driver`, `/tga`, APK).

## Yang dijaga database (SQL 039)
- **Management** tidak bisa menambah, mengubah, atau menghapus data apa pun.
- Setiap role hanya bisa **menulis** ke tabel modulnya. Contohnya, Admin ISS tidak bisa
  mengubah klaim dan Admin Security tidak bisa mengubah armada.
- Fungsi simpan Cleaning & Gardening, TGA, Receptionist, dan ATK ikut memeriksa role.
- **Membaca** data tidak dibatasi, supaya laporan lintas modul tetap jalan. Menu yang
  boleh dibuka diatur aplikasi.
- Batas plant CIK/PRB diatur aplikasi (filter data per plant).
- Tabel yang RLS-nya belum aktif disebut di pesan *NOTICE* saat SQL dijalankan. Untuk
  tabel itu, pembatasannya hanya di aplikasi.

## Langkah pasang (sekali saja)
1. **Supabase CIKOPS → SQL Editor:** jalankan `supabase/039_roles.sql`. Di bagian
   bawah hasilnya ada daftar akun dan role-nya.
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

## Catatan
- Email yang terdaftar sebagai **driver** tidak bisa dijadikan akun staf.
- Role akun sendiri tidak bisa diubah, dan akun sendiri tidak bisa dinonaktifkan.
  Ini mencegah admin terkunci dari sistemnya sendiri.
- Akun driver tetap dikelola di Master Data → Driver. Akun TGA dikelola di
  Cleaning & Gardening → TGA (khusus Admin ISS).
