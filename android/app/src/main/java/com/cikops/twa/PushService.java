package com.cikops.twa;

import android.content.Context;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Menerima pesan FCM dari Edge Function send-web-push (pesan data, prioritas tinggi). */
public class PushService extends FirebaseMessagingService {
    static final String PREFS = "cikops_push";
    static final String KEY_TOKEN = "fcm_token";

    @Override
    public void onNewToken(@NonNull String token) {
        // Dikirim ke server saat aplikasi dibuka berikutnya (StartActivity → ?fcm=)
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        String title = d.get("title");
        String body = d.get("body");
        if (title == null && msg.getNotification() != null) {
            title = msg.getNotification().getTitle();
            body = msg.getNotification().getBody();
        }
        if (title == null) return;
        Notif.show(this, title, body == null ? "" : body, d.get("url"), d.get("tag"),
                "1".equals(d.get("urgent")), "info".equals(d.get("kind")));
    }
}
