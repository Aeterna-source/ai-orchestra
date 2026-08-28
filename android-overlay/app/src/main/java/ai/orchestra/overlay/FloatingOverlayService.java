package ai.orchestra.overlay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.WindowManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class FloatingOverlayService extends Service {
    public static final String ACTION_START = "ai.orchestra.overlay.START";
    public static final String ACTION_STOP = "ai.orchestra.overlay.STOP";
    public static final String EXTRA_MODEL_KEY = "model_key";

    private static final String CHANNEL_ID = "resonance_overlay";
    private static final int NOTIFICATION_ID = 707;
    private static final long REFRESH_MS = 7000;
    private static final String API_BASE = "https://ai-orchestra-production.up.railway.app/api/visualization/";

    private static final String[] MODEL_KEYS = {"nevan", "spud", "reon", "miro"};

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    private WindowManager windowManager;
    private WindowManager.LayoutParams params;
    private StateCloudView cloudView;
    private String modelKey = "nevan";
    private boolean fetching = false;

    private final Runnable refreshRunnable = new Runnable() {
        @Override
        public void run() {
            fetchState();
            handler.postDelayed(this, REFRESH_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        modelKey = prefs().getString(EXTRA_MODEL_KEY, "nevan");
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null && intent.hasExtra(EXTRA_MODEL_KEY)) {
            setModelKey(intent.getStringExtra(EXTRA_MODEL_KEY));
        }

        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        showOverlay();
        handler.removeCallbacks(refreshRunnable);
        handler.post(refreshRunnable);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(refreshRunnable);
        networkExecutor.shutdownNow();
        if (cloudView != null && windowManager != null) {
            windowManager.removeView(cloudView);
            cloudView = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void showOverlay() {
        if (cloudView != null) return;

        cloudView = new StateCloudView(this);
        cloudView.setOnTouchListener(new DragTouchListener());

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        params = new WindowManager.LayoutParams(
            dp(260),
            dp(220),
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = prefs().getInt("overlay_x", dp(24));
        params.y = prefs().getInt("overlay_y", dp(90));

        windowManager.addView(cloudView, params);
    }

    private void fetchState() {
        if (fetching) return;
        fetching = true;
        final String requestModel = modelKey;

        networkExecutor.execute(() -> {
            try {
                URL url = new URL(API_BASE + Uri.encode(requestModel));
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(9000);
                connection.setReadTimeout(12000);
                connection.setRequestMethod("GET");

                int status = connection.getResponseCode();
                BufferedReader reader = new BufferedReader(new InputStreamReader(
                    status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream(),
                    StandardCharsets.UTF_8
                ));

                StringBuilder body = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    body.append(line);
                }
                reader.close();
                connection.disconnect();

                if (status < 200 || status >= 300) return;

                OverlayState nextState = OverlayState.fromJson(new JSONObject(body.toString()));
                handler.post(() -> {
                    if (cloudView != null && requestModel.equals(modelKey)) {
                        cloudView.setState(modelKey, nextState);
                    }
                });
            } catch (Exception ignored) {
                // The overlay keeps its last visible state when the network hiccups.
            } finally {
                fetching = false;
            }
        });
    }

    private void cycleModel() {
        int index = 0;
        for (int i = 0; i < MODEL_KEYS.length; i++) {
            if (MODEL_KEYS[i].equals(modelKey)) {
                index = i;
                break;
            }
        }
        setModelKey(MODEL_KEYS[(index + 1) % MODEL_KEYS.length]);
        fetchState();
    }

    private void setModelKey(String key) {
        if (key == null || key.trim().isEmpty()) return;
        modelKey = "grokulchik".equals(key.trim()) ? "miro" : key.trim();
        prefs().edit().putString(EXTRA_MODEL_KEY, modelKey).apply();
    }

    private void toggleCompact() {
        if (cloudView == null || params == null) return;
        boolean compact = !cloudView.isCompact();
        cloudView.setCompact(compact);
        params.width = compact ? dp(180) : dp(260);
        params.height = compact ? dp(112) : dp(220);
        windowManager.updateViewLayout(cloudView, params);
    }

    private Notification buildNotification() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return builder
            .setContentTitle("Resonance Overlay")
            .setContentText("Floating cognitive state field is running")
            .setSmallIcon(android.R.drawable.presence_online)
            .setOngoing(true)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Resonance Overlay",
            NotificationManager.IMPORTANCE_LOW
        );
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("overlay", Context.MODE_PRIVATE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class DragTouchListener implements android.view.View.OnTouchListener {
        private int initialX;
        private int initialY;
        private float initialTouchX;
        private float initialTouchY;
        private long downAt;
        private boolean moved;

        @Override
        public boolean onTouch(android.view.View view, MotionEvent event) {
            if (params == null) return false;

            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    downAt = System.currentTimeMillis();
                    moved = false;
                    return true;

                case MotionEvent.ACTION_MOVE:
                    int nextX = initialX + Math.round(event.getRawX() - initialTouchX);
                    int nextY = initialY + Math.round(event.getRawY() - initialTouchY);
                    moved = moved || Math.abs(nextX - initialX) > dp(5) || Math.abs(nextY - initialY) > dp(5);
                    params.x = nextX;
                    params.y = nextY;
                    windowManager.updateViewLayout(view, params);
                    return true;

                case MotionEvent.ACTION_UP:
                    prefs().edit().putInt("overlay_x", params.x).putInt("overlay_y", params.y).apply();
                    long duration = System.currentTimeMillis() - downAt;
                    if (!moved && duration > 550) {
                        toggleCompact();
                    } else if (!moved) {
                        cycleModel();
                    }
                    return true;

                default:
                    return false;
            }
        }
    }
}
