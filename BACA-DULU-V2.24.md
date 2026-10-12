# V2.24 — Modul Security + tren 13 bulan di semua report

Paket ini berisi **kode lengkap** CIKOPS (bukan hanya file yang berubah). Salin semuanya ke repo, lalu commit dan push seperti biasa.

## Wajib dilakukan
1. **Supabase CIKOPS → SQL Editor**, jalankan berurutan:
   - `supabase/021_security.sql` — tabel modul Security
   - `supabase/022_security_seed_2025_2026.sql` — riwayat Sep 2025–Agu 2026 + data September 2026 dari laporan G4S
2. **Sinkron G-C** (pelanggaran transporter otomatis): ikuti **PANDUAN-SINKRON-GC.md**.
   - Buat akun baca-saja di Security Desk.
   - Isi environment variable `GC_*` di Vercel (contoh di `.env.example`).
   - Redeploy.
   - Selama belum disambungkan, aplikasi tetap jalan dan memakai input manual.
3. `npm install` tidak perlu, karena tidak ada library baru (kecuali Anda belum pernah memasang V2.22).

## Yang baru
- **Menu Security → Laporan Security** (input tiap tanggal 1 untuk bulan sebelumnya):
  - Kendaraan All (Mobil Karyawan, Mobil Tamu, Mobil Kontraktor, Motor) per minggu, hari kerja/libur
  - Transporter (timbang, non-timbang, selisih timbang ≥ 40 kg) dan Biomas PT Becis
  - Pelanggaran Transporter: otomatis dari G-C (cadangan: input manual); Becis & JMM dipisah, driver berulang dikenali dari SIM
  - Kejadian (12 jenis + 2 otomatis) dan daftar Issue area (Open/Close)
  - Visit (visitor + kunjungan team support) dan Patroli (target/aktual)
  - Riwayat 12 bulan (isi total bulan lama untuk grafik tren) dan Pengaturan (perusahaan khusus, cek koneksi G-C, nama driver)
- **Report → Laporan Manajemen**:
  - Modul baru **Security**: 1 kartu ringkasan + 9 halaman rincian (per kategori kendaraan, visitor, transporter, pelanggaran, Becis/JMM, kejadian & patroli)
  - **Tren 13 bulan** untuk semua modul (Fleet, Klaim, Kantin, ATK, Security), dengan ▲▼ perubahan dari bulan sebelumnya di bawah tiap bulan, plus kalimat tren di temuan utama
  - Excel, PowerPoint, dan PDF menyesuaikan (5 modul di ringkasan eksekutif, kolom "Perubahan vs bulan sebelumnya" di data grafik Excel)
- Pengambilan data tugas & ATK kini berpaginasi (lebih dari 1.000 baris tidak terpotong).

## File baru / berubah
- Baru:
  - `src/app/api/gc-nc/route.ts`
  - `src/app/dashboard/SecurityTab.tsx`, `security.module.css`
  - `src/lib/security/model.ts`, `api.ts`
  - `src/lib/mgmtReport/security.ts`, `trend.ts`
  - `supabase/021_security.sql`, `022_security_seed_2025_2026.sql`
  - `PANDUAN-SINKRON-GC.md`, `.env.example`
- Berubah:
  - `src/app/dashboard/page.tsx`, `MgmtReportTab.tsx`, `mgmt.module.css`
  - `src/components/Icon.tsx`, `src/lib/api.ts`
  - `src/lib/mgmtReport/model.ts`, `build.ts`, `chartImage.ts`, `exportPdf.ts`, `exportPptx.ts`, `exportXlsx.ts`
