package br.com.rjcompressores.despesasmobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "TripNotification", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class TripNotificationPlugin extends Plugin {
    private static final String CHANNEL = "open_km";
    private static final int ID = 7301;

    @PluginMethod
    public void update(PluginCall call) {
        if (call.getLong("start", 0L) > 0 && Build.VERSION.SDK_INT >= 33
            && getPermissionState("notifications") != PermissionState.GRANTED
            && !getContext().getSharedPreferences(CHANNEL, 0).getBoolean("asked", false)) {
            getContext().getSharedPreferences(CHANNEL, 0).edit().putBoolean("asked", true).apply();
            requestPermissionForAlias("notifications", call, "permissionResult");
            return;
        }
        publish(call);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) { publish(call); }

    private void publish(PluginCall call) {
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        boolean enabled = manager.areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Viagem de KM em aberto", NotificationManager.IMPORTANCE_LOW);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
            enabled = enabled && manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        long start = call.getLong("start", 0L);
        if (start <= 0) {
            manager.cancel(ID);
        } else if (enabled) {
            Intent intent = new Intent(getContext(), MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pending = PendingIntent.getActivity(getContext(), ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(getContext(), CHANNEL)
                : new Notification.Builder(getContext()).setPriority(Notification.PRIORITY_LOW);
            Notification notification = builder
                .setSmallIcon(R.drawable.ic_trip_notification)
                .setContentTitle("KM em aberto")
                .setContentText("Viagem em andamento · Toque para abrir o app")
                .setWhen(start).setShowWhen(true).setUsesChronometer(true)
                .setOngoing(true).setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(pending).build();
            manager.notify(ID, notification);
        }
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }
}
