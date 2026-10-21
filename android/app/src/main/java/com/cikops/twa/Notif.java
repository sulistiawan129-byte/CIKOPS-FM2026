package com.cikops.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Kanal & tampilan notifikasi native: bunyi khas CIKOPS + getar panjang, muncul di atas layar. */
final class Notif {
    /** Ganti id bila bunyi/getar diubah — Android mengunci pengaturan kanal setelah dibuat. */
    static final String CH_TASK = "cikops_tugas_v1";
    static final String CH_INFO = "cikops_info_v1";
    static final long[] VIBRATE = {0, 400, 150, 400, 150, 400, 600, 400, 150, 400};

    private Notif() {}

    static Uri sound(Context c) {
        return Uri.parse("android.resource://" + c.getPackageName() + "/" + R.raw.notif);
    }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        AudioAttributes aa = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        NotificationChannel task = new NotificationChannel(CH_TASK, "Tugas baru", NotificationManager.IMPORTANCE_HIGH);
        task.setDescription("Tugas & permintaan baru — berbunyi dan bergetar");
        task.setSound(sound(c), aa);
        task.enableVibration(true);
        task.setVibrationPattern(VIBRATE);
        task.enableLights(true);
        task.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(task);

        NotificationChannel info = new NotificationChannel(CH_INFO, "Info", NotificationManager.IMPORTANCE_DEFAULT);
        info.setDescription("Pemberitahuan umum (klaim, status, tes)");
        info.setSound(sound(c), aa);
        info.enableVibration(true);
        info.setVibrationPattern(new long[]{0, 250, 120, 250});
        nm.createNotificationChannel(info);
    }

    /** Tampilkan notifikasi; ketuk → buka aplikasi di alamat {@code path}. */
    static void show(Context c, String title, String body, String path, String tag, boolean urgent, boolean info) {
        ensureChannels(c);
        Intent open = new Intent(c, StartActivity.class)
                .putExtra(StartActivity.EXTRA_PATH, path)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        int id = (tag == null || tag.isEmpty()) ? (int) (System.currentTimeMillis() & 0xfffffff) : tag.hashCode();
        PendingIntent pi = PendingIntent.getActivity(c, id, open, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, info ? CH_INFO : CH_TASK)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(ContextCompat.getColor(c, R.color.theme_color))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(info ? NotificationCompat.CATEGORY_STATUS : NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                // Android < 8 tidak punya kanal: atur bunyi & getar per notifikasi
                .setPriority(info ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH)
                .setSound(sound(c))
                .setVibrate(info ? new long[]{0, 250, 120, 250} : VIBRATE);
        Notification n = b.build();
        // Urgent: bunyi berulang sampai notifikasi dibuka / digeser, seperti telepon masuk
        if (urgent) n.flags |= Notification.FLAG_INSISTENT;
        try {
            NotificationManagerCompat.from(c).notify(tag == null ? null : tag, id, n);
        } catch (SecurityException ignored) {
            // izin notifikasi dicabut pengguna
        }
    }
}
