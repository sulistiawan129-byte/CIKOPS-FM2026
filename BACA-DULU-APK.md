# Android APK for CIKOPS TGA & CIKOPS Driver (built through GitHub)

## Why TGA and Driver could not be installed together before
Both apps live on the same domain. The driver manifest (`manifest.json`) had no `id`/`scope`, so it
claimed **the whole domain** (`/`) as its own. Chrome then treated TGA (`/tga`) as being *inside*
the driver app, and only one of them could be installed.
**Fixed:** Driver now has `id`+`scope` = `/driver` and TGA has `/tga`. They are separate apps and can be
installed side by side (names on the phone: **CIKOPS Driver** and **CIKOPS TGA**).
> If the old version is already installed on a phone: uninstall it once, open the link again, and reinstall.

## APK built through GitHub Actions
The APK is a *Trusted Web Activity*: a real Android app (it has its own icon and opens full screen) that
displays the CIKOPS page. Web updates show up in the app right away, so it does **not** need to be
rebuilt every time the website changes.

### Building the APK
1. GitHub → repository → **Actions** tab → **APK Android (TGA & Driver)** → **Run workflow**.
   - `app`: semua / tga / driver
   - `site_url`: leave empty (uses the `SITE_URL` variable or `https://cikops-onefm.vercel.app`)
2. Wait about 3–5 minutes → open that run → the **Artifacts** section → download `APK-tga` / `APK-driver` (zip → contains the .apk).
3. Send the .apk to the phone (WhatsApp/Drive) → open it → allow "Install unknown apps" → Install.

> If the domain is different, set it once at: Settings → Secrets and variables → Actions → **Variables** → `SITE_URL`.

### Saving the APK key (once, important)
On the first build GitHub creates a new key and attaches it as the artifact
**KUNCI-APK-simpan-ke-secrets-lalu-hapus**. Download it, then in Settings → Secrets and variables → Actions →
**New repository secret**, create 3 secrets from the contents of the files:
| Secret | Contents from file |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | ANDROID_KEYSTORE_BASE64.txt |
| `ANDROID_KEYSTORE_PASSWORD` | ANDROID_KEYSTORE_PASSWORD.txt |
| `ANDROID_KEY_ALIAS` | ANDROID_KEY_ALIAS.txt |

After that, **delete** the key artifact from the run page. Also keep a copy of the files somewhere safe.
Without a saved key, every build signs with a different key → the APK cannot be updated (it has to be uninstalled first).

### Full screen without an address bar
Android checks that the website "approves" the app. In each run's summary there is a **SHA-256 fingerprint**.
Enter it in Vercel → Settings → Environment Variables → `TWA_SHA256` → **Redeploy**.
Check it: open `https://<domain>/.well-known/assetlinks.json` — it should show `com.cikops.tga` and `com.cikops.driver`.
Before this is set, the app still works but shows a thin address bar at the top.

## Note for Driver
The driver app currently uses **Median** (an APK with OneSignal notifications). The Driver APK from GitHub
**does not have the Median/OneSignal bridge**, so OneSignal-based task notifications do not reach it.
Recommendation: TGA → use the GitHub APK; Driver → keep using the Median APK,
unless you want to move driver notifications to web push.
