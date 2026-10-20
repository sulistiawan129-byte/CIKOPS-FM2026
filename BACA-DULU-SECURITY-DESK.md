# Security — Security Desk (G4S) jadi sumber, CIKOPS mengikuti

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

## Langkah pemasangan (sekali saja)

### 1. Update aplikasi Security Desk (repo `CIK-G4S`)
✅ **Sudah dilakukan** — perubahan sudah di-push ke `main` repo `CIK-G4S` (commit f13aaf5) dan
Vercel otomatis deploy. Langkah upload di bawah hanya cadangan.

File perubahannya ada di folder **`integrasi/security-desk/`** di repo ini, dengan susunan
folder yang sama persis dengan repo `CIK-G4S`:

```
supabase/laporan_cikops.sql          (baru)
src/components/ExtraSections.tsx     (baru)
src/app/(app)/harian/page.tsx        (ubah)
src/app/(app)/kejadian/page.tsx      (ubah)
src/app/globals.css                  (ubah)
src/lib/constants.ts                 (ubah)
src/lib/data.ts                      (ubah)
src/lib/slides.ts                    (ubah)
src/lib/types.ts                     (ubah)
README.md                            (ubah)
```

Upload ke GitHub `CIK-G4S` → **Add file → Upload files**, seret isi folder
`integrasi/security-desk/` (bukan foldernya) supaya file lama tertimpa → **Commit**.
Vercel otomatis deploy.

> Alternatif: pasang Claude GitHub App di repo `CIK-G4S`
> (https://github.com/apps/claude/installations/select_target), maka perubahan bisa saya push langsung.

### 2. Jalankan SQL di Supabase (project Security Desk / G-C)
SQL Editor → jalankan **`supabase/laporan_cikops.sql`** (dari repo `CIK-G4S`, atau
`integrasi/security-desk/supabase/laporan_cikops.sql`). Tabel lama tidak diubah.

### 3. Beri akses baca ke akun CIKOPS
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

### 4. Cek di CIKOPS
Fasilitas → **Security** → muncul kotak hijau **"Tersinkron dengan Security Desk"**.
Kalau oranye, pesan di kotak itu menjelaskan yang kurang.

## Pemakaian harian (tim security, di Security Desk)
- **Data harian**: selain 5 angka kendaraan/visitor, sekarang ada kelompok
  **Transporter & biomas** (timbang, non-timbang, sekam, abu). Tombol Enter tetap pindah kolom.
- **Kejadian & patroli**: di bawah patroli ada **Transporter & biomas** (selisih timbang ≥ 40 kg,
  Palm Oil/Fat Blend), **Kunjungan team support**, dan **Issue area**.
- **Laporan bulanan**: ada 2 slide baru (Transporter & biomas, Kunjungan & issue area).

Di CIKOPS semua isian Security menjadi hanya-baca selama bulan itu ada di Security Desk.
Tombol **Buka Security Desk ↗** membuka aplikasi untuk mengubah data.
