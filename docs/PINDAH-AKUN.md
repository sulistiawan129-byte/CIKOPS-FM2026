# Pindah akun Supabase & Vercel tanpa mengganggu operasional

Prinsipnya: **domain tetap sama, database disalin utuh (termasuk akun login), dan
kunci rahasia disalin persis**. Dengan begitu APK, QR yang sudah dicetak, layar TV,
notifikasi, dan file Excel tetap jalan.

## Yang terikat ke akun lama
| Hal | Di mana sekarang | Saat pindah | Kalau lupa |
|---|---|---|---|
| Domain `cikops-onefm.vercel.app`, `cik-g4s.vercel.app` | Project Vercel | **Transfer Project** ke akun Vercel baru (domain ikut) | APK, QR, TV, link email rusak |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env | Isi nilai project baru, lalu redeploy | Aplikasi tidak bisa login |
| `GC_*`, `SECDESK_SITE` | Vercel env CIKOPS | Arahkan ke project G-C/Security Desk (baru bila ikut pindah). **`GC_HASH_SALT` tetap sama** | Data NC & Security Desk hilang dari CIKOPS |
| `TWA_SHA256`, `TWA_PACKAGES` | Vercel env | Salin sama | APK tampil dengan address bar |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Supabase Edge secrets | **Salin persis sama**. Jangan jalankan `vapid-keys.yml` lagi | Semua notifikasi driver/TGA mati |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `LOCKER_ADMIN_EMAIL` | Supabase Edge secrets | Salin sama | Semua email berhenti |
| Keystore APK (`ANDROID_KEYSTORE_*`) & variabel `SITE_URL` | GitHub Actions | Tetap (atau salin bila repo pindah) | APK tidak bisa update, harus instal ulang |
| Kunci sinkron Excel (`ga_sync_config`, `atk_sync_config`) | Database | Ikut otomatis bila database disalin (jangan dibuat ulang lewat SQL) | Excel "kunci salah" |
| URL & anon key di file Excel GA & ATK | Konstanta VBA di setiap PC | Ganti ke nilai project baru | Sinkron Excel gagal |
| pg_cron `auto-complete-tasks-1700` | Database | Ikut database; **matikan di project lama** | Tugas ditutup dua kali |
| Realtime publication, schema `security` di Exposed schemas (G-C) | Pengaturan Supabase | Cek & samakan | Layar tidak update otomatis |

## Langkah
1. **Siapkan akun baru.** Buat project Supabase baru (CIKOPS, dan G-C/Security Desk
   bila ikut pindah) di region yang sama (Singapore). Aktifkan extension `pgcrypto` dan
   `pg_cron`. Untuk project G-C, tambahkan `security` ke Exposed schemas.
2. **Latihan salin database** (belum pindah):
   ```bash
   supabase db dump --db-url "$LAMA" --role-only > roles.sql
   supabase db dump --db-url "$LAMA" > schema.sql
   supabase db dump --db-url "$LAMA" --data-only --use-copy -s public,security,auth > data.sql
   psql "$BARU" -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql
   ```
   Skema `auth` ikut disalin, jadi semua akun (staf, driver, TGA, receptionist) tetap
   bisa login dengan password lama. Cek jumlah baris per tabel, `cron.job`, daftar
   realtime, dan jalankan `supabase/tools/AUDIT-keamanan.sql`.
3. **Edge Function & secret.** Deploy semua function di `supabase/functions/` ke project
   baru, lalu set secret dengan nilai **yang sama** (tabel di atas).
4. **Uji paralel.** Di akun Vercel baru, buat deploy uji yang memakai Supabase baru,
   lalu cek:
   - login tiap role
   - aplikasi driver & TGA
   - email
   - Command Center
   - `/api/gc-nc`
   - satu salinan file Excel
5. **Hari-H** (malam, ±30 menit):
   - umumkan jeda input
   - ulangi salin data (`data.sql`)
   - **Transfer Project** Vercel ke akun baru
   - ganti env Supabase, lalu redeploy
   - matikan pg_cron di project lama
6. **Sesudahnya.** Ganti URL & anon key di semua file Excel GA dan ATK. APK tidak perlu
   dibuat ulang selama domain dan keystore sama. Setiap pengguna cukup login ulang satu
   kali.
7. **Simpan cadangan.** Jeda (pause) project lama selama ±2 minggu sebelum dihapus.
