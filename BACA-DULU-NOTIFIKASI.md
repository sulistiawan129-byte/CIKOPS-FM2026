# Notifications & ringtone (Driver & TGA) + TGA task flow

## 1. Activate it (once)
1. **SQL:** Supabase → SQL Editor → paste the **entire** `supabase/036_push_tga_tugas.sql` → Run (after 034 & 035).
2. **Notification keys (VAPID)** — on a computer with Node.js:
   ```
   npx web-push generate-vapid-keys
   ```
   Copy the result to Supabase → Edge Functions → **Secrets**:
   - `VAPID_PUBLIC_KEY`  = Public Key
   - `VAPID_PRIVATE_KEY` = Private Key (keep it secret)
   - `VAPID_SUBJECT`     = `mailto:your-ga-email@company.com`
3. **Deploy the function:** `supabase functions deploy send-web-push`
4. Redeploy the website (Vercel) so the new service worker (`sw.js` v3) is active.

## 2. Turn on notifications on the phone
- **TGA app:** Profil tab → **🔔 Aktifkan notifikasi** → allow → press **Kirim tes**.
- **Driver app:** Profil tab → section *Notifikasi* → **Aktifkan** → **Tes**.
- **iPhone:** iOS 16.4+, and the app must be added to the **Home Screen** and opened from its icon.
- **Driver APK via Median** keeps using OneSignal (no change). Web push is for drivers who use the
  installed app (PWA) / the APK from GitHub.

## 3. How it rings
| Situation | What happens |
|---|---|
| App **closed** / phone locked | System notification: the phone's default notification sound + vibration. Urgent tasks stay on screen until tapped. Tap → the app opens. |
| App **open** (TGA) | Rings with the CIKOPS ringtone (`notif.wav`) up to 6 times + vibrates + a **"Tugas baru"** pop-up with the *Terima & kerjakan* button. The app checks for new tasks every 20 seconds. |
| App **open** (Driver) | Same as before: ringtone + voice announcement + vibration. |

> A web notification cannot use a custom ringtone when the app is closed; Android/iOS uses the
> notification sound from the phone's settings. To make it louder: Phone settings → Apps → Chrome / CIKOPS → Notifications → sound & priority.

## 4. TGA task flow (like the driver flow)
1. **Admin:** Dashboard → Fasilitas → Cleaning & Gardening → **TGA** tab → **Papan tugas TGA** → **＋ Tugaskan TGA**.
   - Pick a technician, or **Semua TGA (siapa cepat)** = the first technician to take it.
   - Category, job, location, requestor (from Data Karyawan), phone number, priority, note → **🔔 Kirim tugas**.
2. **Employee:** opens `/request` → **Perbaikan / Teknisi GA** → fills in the location & problem → sends.
   It goes into *Belum diambil* and every TGA phone rings.
3. **Technician:** the phone rings → **Terima & kerjakan** (or **Ambil tugas** for requests) → status *Proses*
   → once finished, tap **✓ Tandai selesai** (status, notes, and end time can be changed).
4. The admin sees the board: *Belum diambil → Menunggu diterima → Dikerjakan → Selesai hari ini*,
   can **reassign** (the task goes back to "Baru" and the new technician's phone rings) or **cancel**.
- Technicians cannot delete tasks from the admin / employees (only their own entries).
- If two technicians tap "Ambil" at the same time, only the first one gets it; the other is told "sudah diambil teknisi lain".
