# Resonance Overlay

Android overlay for AI Orchestra cognitive state visualization.

## What it does

- Reads state from `https://ai-orchestra-production.up.railway.app/api/visualization/{model}`.
- Draws a floating particle field over Telegram or any other app.
- Tap the overlay to cycle: Nevan, Spud, Reon, Miro.
- Drag to move it.
- Long tap to switch between full and compact size.

## Build

1. Open this folder in Android Studio:
   `android-overlay`
2. Let Android Studio sync Gradle.
3. Build APK:
   `Build > Build Bundle(s) / APK(s) > Build APK(s)`
4. Install the APK on the phone.
5. Open the app and grant `Draw over other apps`.
6. Tap `Запустити хмарку`.

The repo machine currently does not have Java, Gradle, Android SDK, or adb in PATH, so Codex cannot build the APK here without installing Android tooling.
