# Redesign V2.7 — modul Klaim

Tidak ada SQL baru. Cukup ganti file, lalu deploy.

## Baru di V2.7
- Form klaim: pilih driver lewat chip (ada kolom cari), kategori berikon, nominal dengan hasil hitung langsung, tombol +10rb/+20rb/+50rb/+100rb, Enter menambah baris, dan struk pratinjau di kanan yang terisi saat mengetik.
- Daftar klaim: ringkasan total dengan bar komposisi kategori (klik untuk memfilter), dikelompokkan per minggu kerja, kartu bisa dibuka untuk melihat rincian.
- Rekap mingguan: ditambah kolom komposisi. Karangan bunga: kartu dengan saklar status.
- Logika simpan, email, push, dan ekspor (Tanda Terima, Excel, PDF, CSV) tidak diubah.
- File baru: src/app/dashboard/ClaimsUI.tsx dan claims.module.css; diubah: src/app/dashboard/page.tsx (hanya ClaimsTab).

---
# Redesign V2.6 — cara pasang

## ⚠ LANGKAH PERTAMA (V2.6): jalankan 1 SQL lagi di Supabase → SQL Editor
`supabase/016_viewonly_gate.sql` (sesudah 014 & 015) — menambahkan data GATE ke fungsi `get_viewonly_snapshot`.

## Baru di V2.6 — Gate dari Security Gate, bukan dari tugas
- Panel "Gate Security", ticker GATE, dan KPI "Di luar gate" kini membaca log petugas security (`vehicle_gate_logs`, Armada → Gate / halaman /gate).
- Driver PRB di Cikarang = log PRB belum selesai; Driver CIK di luar plant = log CIK belum selesai. Tugas ON GOING tidak lagi mengubah gate.
- Angka dari status tugas diganti nama: "Sedang bertugas", "Standby", chip "Bertugas" (bukan posisi fisik).
- Tanpa 016, panel gate memakai log publik hari ini bila tersedia; jika tidak, tampil "belum tersedia".

---
# (V2.5) cara pasang

## ⚠ LANGKAH PERTAMA (V2.5): jalankan 2 SQL di Supabase → SQL Editor
1. `supabase/014_driver_type.sql` (kalau belum — tipe Driver Operational/User)
2. `supabase/015_viewonly_public.sql` — **wajib agar Dashboard-ViewOnly terlihat tanpa login**

## Baru di V2.5 — Dashboard-ViewOnly (tanpa login)
- Alamat baru: **/dashboard-viewonly** (mis. https://cikops-fleet-ivory.vercel.app/dashboard-viewonly). Alamat lama /tv-display otomatis dialihkan ke sini.
- Bisa dibuka dari perangkat mana pun tanpa login — untuk SPV/manajer. Sebelumnya kosong karena tabel tasks/drivers/vehicles tidak bisa dibaca tanpa login (RLS). Sekarang data diambil lewat fungsi database `get_viewonly_snapshot` (SECURITY DEFINER) yang hanya mengembalikan data ringkas: penugasan hari ini, nama driver + plant + tipe, nopol/jenis kendaraan. TIDAK ikut: no. HP, email, PIN/password, alasan pembatalan, klaim/overtime/dana. Tabel tetap terkunci seperti semula.
- Nama menu/link di sistem diganti jadi **Dashboard-ViewOnly** (sidebar, ikon mata di topbar, tombol di hero Home) + tombol **Salin link** untuk dibagikan.
- Halaman diberi lencana "VIEW ONLY" dan tidak diindeks mesin pencari (noindex).
- Catatan keamanan: siapa pun yang memegang link bisa melihat halaman ini. Kalau nanti ingin dibatasi (mis. kunci rahasia di link), bilang saja.
- File baru/berubah: `supabase/015_viewonly_public.sql` (baru), `src/app/dashboard-viewonly/{page,layout}.tsx` (baru; pindahan dari tv-display), `src/app/tv-display/page.tsx` (kini hanya redirect), `src/lib/api.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/dashboard.module.css`, `src/components/{Icon,GlobalBack}.tsx`.

# (sebelumnya) V2.4

## ⚠ LANGKAH PERTAMA (V2.4): jalankan SQL dulu
Buka Supabase → SQL Editor → tempel isi `supabase/014_driver_type.sql` → Run. (Aman diulang.)
Isinya: kolom `drivers.driver_type` (operational | user), `assigned_user`, `assigned_user_title`; fungsi `get_driver_duty_info`; dan trigger yang memblokir penugasan baru ke Driver User.
Kode sudah dibuat tahan banting: kalau SQL belum dijalankan, aplikasi tetap jalan (semua driver dianggap operational) dan tombol Simpan driver akan memberi pesan agar menjalankan migrasi.

## Baru di V2.4 — Driver Operational vs Driver User
- Master Data → Driver: pilih **Tipe Driver** (Operational / Driver User). Driver User wajib isi **Nama User** (+ jabatan opsional).
- Driver User otomatis **ON DUTY setiap hari 08.00–16.30 WIB** (di luar jam itu OFF DUTY, otomatis juga). Status terkunci, tidak bisa diubah, dan tidak bisa dipilih di form penugasan (tampil abu-abu dengan keterangan).
- Aplikasi driver: Driver User melihat banner status (ON DUTY/OFF DUTY, jam, **nama user-nya**) dan di tab Profil; status di strip atas berubah jadi 🔒.
- TV: Driver User tampil sebagai baris "On Duty 🔒 — Driver User · mengantar <nama user>" (urutan paling akhir), dan tidak dihitung sebagai "Di plant"/"Di luar". KPI Driver aktif memuat rincian operasional · user.
- File baru/berubah: `supabase/014_driver_type.sql` (baru), `src/lib/duty.ts` (baru), `src/lib/types.ts`, `src/lib/api.ts`, `src/app/dashboard/page.tsx`, `src/app/driver/page.tsx`, `src/app/driver/driver.module.css`, `src/app/tv-display/page.tsx`.

# (sebelumnya) V2.3

V2.3 = V2.2 + tujuan, keperluan, dan semua detail tugas di TV tampil PENUH (tanpa dipotong "…"; teks panjang dibungkus ke baris baru). Jumlah baris per halaman kini menyesuaikan panjang teks dan tinggi layar, halaman berganti otomatis. Hanya `src/app/tv-display/page.tsx` yang berubah dari V2.2.


V2.2 = V2.1 + TV display bergaya "Driver Operations" (mengikuti referensi): tema gelap berpola grid, font display Chakra Petch (judul/angka/nama) + Inter (isi) + JetBrains Mono (meta), 6 KPI bergaris warna, kolom driver per plant (Cikarang | Pasar Rebo | Tugas Berikutnya), baris bawah Progres | Gate Lintas-Plant | Perlu Perhatian, dan bar GATE berjalan. Hanya `src/app/tv-display/page.tsx` yang berubah dari V2.1. Font dimuat khusus di halaman TV lewat next/font (tidak membebani halaman lain). Tema terang tetap ada lewat tombol di header.


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
