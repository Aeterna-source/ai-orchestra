package ai.orchestra.overlay;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

public final class MainActivity extends android.app.Activity {
    private static final int OVERLAY_PERMISSION_REQUEST = 44;
    private Spinner modelSpinner;

    private final String[] modelKeys = {"nevan", "spud", "reon", "grokulchik"};
    private final String[] modelLabels = {
        "Nevan",
        "Spud",
        "Reon",
        "Grokulchik"
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestNotificationPermission();
        setContentView(buildLayout());
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshPermissionHint();
    }

    private LinearLayout buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(22), dp(28), dp(22), dp(22));
        root.setBackgroundColor(Color.rgb(246, 247, 244));

        TextView title = new TextView(this);
        title.setText("Resonance Overlay");
        title.setTextColor(Color.rgb(23, 33, 29));
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        root.addView(title, matchWrap());

        TextView subtitle = new TextView(this);
        subtitle.setText("Плаваюче поле стану для AI Orchestra");
        subtitle.setTextColor(Color.rgb(74, 89, 82));
        subtitle.setTextSize(15);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, dp(8), 0, dp(18));
        root.addView(subtitle, matchWrap());

        modelSpinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            modelLabels
        );
        modelSpinner.setAdapter(adapter);
        modelSpinner.setSelection(savedModelIndex());
        root.addView(modelSpinner, matchWrap());

        Button permissionButton = new Button(this);
        permissionButton.setText("Дозвіл поверх вікон");
        permissionButton.setOnClickListener(v -> openOverlayPermission());
        root.addView(permissionButton, buttonParams());

        Button startButton = new Button(this);
        startButton.setText("Запустити хмарку");
        startButton.setOnClickListener(v -> startOverlay());
        root.addView(startButton, buttonParams());

        Button stopButton = new Button(this);
        stopButton.setText("Зупинити");
        stopButton.setOnClickListener(v -> stopOverlay());
        root.addView(stopButton, buttonParams());

        TextView hint = new TextView(this);
        hint.setId(android.R.id.text1);
        hint.setTextColor(Color.rgb(74, 89, 82));
        hint.setTextSize(14);
        hint.setLineSpacing(0, 1.18f);
        hint.setPadding(0, dp(16), 0, 0);
        root.addView(hint, matchWrap());

        refreshPermissionHint();
        return root;
    }

    private void refreshPermissionHint() {
        TextView hint = findViewById(android.R.id.text1);
        if (hint == null) return;

        String permission = Settings.canDrawOverlays(this)
            ? "Дозвіл поверх вікон: увімкнено."
            : "Спершу увімкни дозвіл поверх вікон.";

        hint.setText(permission + "\n\nТап по хмарці перемикає суб'єкта. Довгий тап стискає або розгортає. Перетягування рухає її по екрану.");
    }

    private void openOverlayPermission() {
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getPackageName())
        );
        startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST);
    }

    private void startOverlay() {
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermission();
            return;
        }

        String modelKey = modelKeys[Math.max(0, modelSpinner.getSelectedItemPosition())];
        prefs().edit().putString(FloatingOverlayService.EXTRA_MODEL_KEY, modelKey).apply();

        Intent intent = new Intent(this, FloatingOverlayService.class);
        intent.setAction(FloatingOverlayService.ACTION_START);
        intent.putExtra(FloatingOverlayService.EXTRA_MODEL_KEY, modelKey);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void stopOverlay() {
        Intent intent = new Intent(this, FloatingOverlayService.class);
        intent.setAction(FloatingOverlayService.ACTION_STOP);
        startService(intent);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 45);
        }
    }

    private int savedModelIndex() {
        String saved = prefs().getString(FloatingOverlayService.EXTRA_MODEL_KEY, "nevan");
        for (int i = 0; i < modelKeys.length; i++) {
            if (modelKeys[i].equals(saved)) return i;
        }
        return 0;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("overlay", MODE_PRIVATE);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = matchWrap();
        params.topMargin = dp(12);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
