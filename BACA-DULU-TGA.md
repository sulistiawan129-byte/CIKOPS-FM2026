# Aplikasi TGA (Teknisi GA) — `/tga`

An app for TGA technicians to log their work from a phone: what was done, who requested it, the location, the status (Selesai / Proses / Pending / Butuh part), whether it is urgent, and the time. It can be installed on the home screen like the driver app.

## 1. Activate it (once)
1. Supabase → **SQL Editor** → **New query** → paste the **entire** contents of `supabase/034_tga_app.sql` (do not select only part of it) → **Run**.
2. Open **Dashboard → Cleaning, Gardening & TGA → TGA tab** and scroll down to **Akun aplikasi TGA**.
3. Click **＋ Akun baru** (or a name chip from the TGA manpower list) → enter the name, phone number and a **PIN of 4–6 digits** → Simpan.
4. Tell each technician their PIN, then send the link (the **Bagikan ke WhatsApp** button).

## 2. Install on a phone
- **Android (Chrome):** open `https://<domain>/tga` → *Profil* → **Pasang aplikasi**, or menu ⋮ → *Instal aplikasi*.
- **iPhone (Safari):** open the link → **Bagikan** button → **Tambah ke Layar Utama**.

The app is called **CIKOPS TGA** (orange wrench icon) and is separate from the driver app.

## 3. Using it
- **Masuk:** pick a name → enter the PIN. The session lasts 120 days and is extended automatically while the app is used.
- **＋ (orange button):** pick the job type → tap a quick suggestion or type the activity → location (recent locations appear as chips) → requestor (employee name suggestions fill in the department) → status, urgent, time → **Simpan**. Each record gets a number like `TGA-2610-001`.
- **Beranda:** today's summary, a 7-day chart, open jobs (tap ✓ to mark one done).
- **Terbuka:** all open jobs, with urgent ones first.
- **Riwayat:** 90 days, with search and filters by status/type. Tap an item to edit or delete it.

## 4. Security
- The PIN is stored as a bcrypt hash. After 5 wrong attempts the account is locked for 15 minutes.
- Resetting the PIN or deactivating the account from the dashboard → old sessions on phones are signed out.
- Technicians can only see and edit **their own** activities.

## 5. Dashboard
The **TGA** tab merges the data from the app (📱) with the Excel log. Filters: *Semua / Dari aplikasi / Excel / Belum selesai*. Exports (Excel/PDF/CSV) now include category, location, department, status and ref number.
The app data is stored in the `tga_activities` table, so it is **not overwritten** by the Excel sync.
