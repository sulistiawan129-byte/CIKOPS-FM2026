package com.cikops.twa;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Pintu masuk aplikasi: minta izin notifikasi, siapkan kanal bunyi/getar, ambil token FCM,
 * lalu buka halaman web (TWA) dengan ?fcm=<token> supaya halaman mendaftarkan HP ini.
 */
public class StartActivity extends Activity {
    static final String EXTRA_PATH = "path";
    private static final int REQ_NOTIF = 7;
    private static final long TOKEN_WAIT_MS = 2500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean launched;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Notif.ensureChannels(this);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        } else {
            fetchTokenThenLaunch();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        fetchTokenThenLaunch();
    }

    private void fetchTokenThenLaunch() {
        if (!getResources().getBoolean(R.bool.has_firebase) || FirebaseApp.getApps(this).isEmpty()) {
            launch(null);
            return;
        }
        String cached = getSharedPreferences(PushService.PREFS, Context.MODE_PRIVATE).getString(PushService.KEY_TOKEN, null);
        handler.postDelayed(() -> launch(cached), TOKEN_WAIT_MS);
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                String tok = t.isSuccessful() ? t.getResult() : null;
                if (tok != null) {
                    getSharedPreferences(PushService.PREFS, Context.MODE_PRIVATE).edit().putString(PushService.KEY_TOKEN, tok).apply();
                }
                launch(tok != null ? tok : cached);
            });
        } catch (RuntimeException e) {
            launch(cached);
        }
    }

    private void launch(String token) {
        if (launched) return;
        launched = true;
        handler.removeCallbacksAndMessages(null);

        String base = getString(R.string.launch_url);
        String path = getIntent().getStringExtra(EXTRA_PATH);
        if (path != null && path.startsWith("/")) base = getString(R.string.site_url) + path;
        Uri.Builder url = Uri.parse(base).buildUpon();
        if (token != null && !token.isEmpty()) url.appendQueryParameter("fcm", token);

        Intent twa = new Intent(this, LauncherActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(url.build());
        startActivity(twa);
        finish();
    }
}
