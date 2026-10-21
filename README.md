# CIKOPS — Facility Management Plant Cikarang

Satu aplikasi untuk operasional GA/FM: fleet & driver, klaim & dana operasional,
fasilitas (locker, gift, printer, ATK, kantin, receptionist), Cleaning & Gardening + TGA,
Security (tersinkron dengan Security Desk G4S), report manajemen, dan Command Center.

- **Teknologi:** Next.js 16 (App Router) di Vercel · Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Aplikasi lapangan:** `/driver`, `/tga` (juga tersedia sebagai APK)
- **Tanpa login:** `/request`, `/bukti`, `/locker`, `/gift`, `/canteen`, `/gate`, `/dashboard-viewonly`

## Struktur
| Folder | Isi |
|---|---|
| `src/app/dashboard/` | Dashboard staf, satu file per modul (`*Tab.tsx`) |
| `src/app/<halaman>/` | Halaman publik & aplikasi driver/TGA |
| `src/lib/` | Akses data per modul (`api.ts`, `ga/`, `security/`, `receptionist/`, `tga/`, `mgmtReport/` …) |
| `supabase/01_dasar.sql` | Semua migrasi lama (sudah berjalan di production) |
| `supabase/02_peran_keamanan.sql` | Role per modul + pengetatan keamanan (**jalankan sekarang**) |
| `supabase/03_data_impor.sql` | Impor data lama sekali pakai |
| `supabase/cek_audit_keamanan.sql` | Pemeriksaan keamanan (hanya membaca) |
| `supabase/functions/` | Edge Function (email, notifikasi, akun staf) |
| `vba/` | Modul Excel (GA, ATK). Salinan unduhan ada di `public/downloads/` |

## Dokumentasi
- **`docs/PANDUAN.md`**: file SQL, Edge Function & secret, env Vercel, langkah per modul, backup & pemulihan, dan pindah akun Supabase/GitHub
- Riwayat perubahan: `git log`

## Menjalankan lokal
```bash
npm install
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run dev
```
