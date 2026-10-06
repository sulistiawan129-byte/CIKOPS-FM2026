# Redesign V2.1 — cara pasang

V2.1 = V2 + TV display baru, link TV di sistem, dan tombol kembali di semua modul/halaman. Paket ini lengkap (menggantikan REDESIGN-V2.zip).

## Baru di V2.1
- `src/app/tv-display/page.tsx` — tampilan TV ditulis ulang: data diformat (nama Title Case, plat "B 1234 XYZ", durasi "2j 50m"), banner plant + progres, kartu 2×2 yang ganti halaman otomatis tiap 10 detik, panel Gate (CIK) / Driver Standby (PRB), ticker, tema terang/gelap, tombol layar penuh dan **tombol Dashboard**. Ukuran font mengikuti layar (rem).
- Link TV: sidebar ("Tampilan TV"), ikon TV di topbar, dan tombol di hero Home. Semuanya membuka /tv-display di tab baru.
- Tombol kembali: bar **Kembali ke Home** + **kembali ke menu sebelumnya** + breadcrumb di semua modul dashboard; bar Kembali/Home di halaman gate, request, canteen, locker, gift (`src/components/GlobalBack.tsx`, dipasang di layout.tsx).
- `Icon.tsx` — tambah ikon tv, expand, shrink, pin, check, external, copy.


Semua file di folder ini menimpa/menambah file di repo dengan path yang sama.

## File
- `package.json` + `package-lock.json` — Next 16.3, React 19.3, react-leaflet 5, supabase-js terbaru, TypeScript 5.9, @types/react 19.
  Script `lint` dihapus karena `next lint` tidak ada lagi di Next 16 (project memang belum punya konfigurasi ESLint).
- `tsconfig.json` — diubah otomatis oleh Next 16 (`jsx: react-jsx`, tambahan `include`). Pakai versi ini.
- `src/app/layout.tsx` — font Inter diganti Plus Jakarta Sans.
- `src/app/globals.css` — token warna/radius/bayangan baru + komponen global (nav, kartu, tombol).
- `src/app/dashboard/dashboard.module.css` — lapisan gaya baru (tabel, form, modal, stat card, Home dashboard).
- `src/app/dashboard/page.tsx` — sidebar melayang berlabel, topbar baru, **Dashboard (HomeTab) baru**, ikon SVG, warna lama dipetakan ke palet baru.
- `src/components/Icon.tsx` — **file baru**, ikon SVG seragam.
- `src/components/GlobalBack.tsx` — **file baru**, bar Kembali/Home untuk halaman mandiri.
- `src/app/tv-display/page.tsx` — **file baru**, layar TV tanpa login (V2.1).
- `src/app/{gate,request,canteen,locker}/page.tsx`, `src/lib/dictionary.ts` — penyesuaian warna dan teks login.

## Langkah
1. Timpa/tambah file di atas ke repo.
2. `npm install` (atau `npm ci` agar sesuai lock file).
3. `npm run build` lokal bila ingin cek dulu, lalu push. Vercel akan memakai Node >= 20.9 (wajib untuk Next 16).

## Sudah diuji
`tsc` bersih, `next build` (Next 16.3.8) sukses untuk semua rute, dan dashboard, modul Penugasan/Armada, login, gate dicek lewat screenshot (light/dark, desktop/HP) dengan data tiruan.
Catatan: sandbox tidak bisa mengunduh Google Fonts, jadi build uji memakai font cadangan. Di Vercel font Plus Jakarta Sans akan termuat normal.

## Catatan
- `npm audit` masih menyisakan temuan di dependensi turunan `jspdf`/`dompurify` dan `exceljs`/`uuid`. Itu bukan akibat upgrade ini; perbaikannya butuh `npm audit fix --force` (versi mayor), jadi saya biarkan.
