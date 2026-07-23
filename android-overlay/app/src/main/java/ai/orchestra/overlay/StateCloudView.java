package ai.orchestra.overlay;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

public final class StateCloudView extends View {
    private static final int MAX_PARTICLES = 380;

    private final Paint particlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint panelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Random random = new Random();
    private final List<Particle> particles = new ArrayList<>();

    private OverlayState state = new OverlayState();
    private String modelKey = "nevan";
    private boolean compact = false;

    public StateCloudView(Context context) {
        super(context);
        setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        panelPaint.setColor(Color.argb(220, 5, 10, 9));
        textPaint.setColor(Color.rgb(238, 242, 236));
        textPaint.setTextSize(dp(12));
        textPaint.setLetterSpacing(0);
    }

    public void setState(String modelKey, OverlayState nextState) {
        this.modelKey = modelKey;
        this.state = nextState;
        ensureParticles();
        invalidate();
    }

    public void setCompact(boolean compact) {
        this.compact = compact;
        invalidate();
    }

    public boolean isCompact() {
        return compact;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0) return;

        canvas.drawRoundRect(0, 0, width, height, dp(18), dp(18), panelPaint);

        ensureParticles();

        long now = System.currentTimeMillis();
        float cx = width * 0.5f;
        float cy = compact ? height * 0.48f : height * 0.43f;
        float minSide = Math.min(width, height);

        double pulse = 1 + Math.sin(now * 0.0018) * (0.05 + state.significance * 0.12);
        float fieldRadius = (float) (minSide * (0.22 + (1 - state.stability) * 0.18 + state.driftRisk * 0.13) * pulse);
        float stretch = (float) (1 + state.continuity * 0.55);
        float jitter = (float) (minSide * (0.01 + state.driftRisk * 0.08 + (1 - state.stability) * 0.03));

        for (int i = 0; i < particles.size(); i++) {
            Particle p = particles.get(i);
            p.angle += (0.0008 + state.continuity * 0.0012) * p.speed + p.spin * 0.0004;

            double wave = Math.sin(now * 0.001 * p.speed + p.phase);
            float radius = (float) (fieldRadius * (0.25 + p.radius * 0.95 + wave * 0.045));
            float fragment = state.driftRisk > 0.45 && i % 7 == 0 ? (float) (state.driftRisk * minSide * 0.14) : 0;
            float targetX = (float) (cx + Math.cos(p.angle) * (radius * stretch + fragment));
            float targetY = (float) (cy + Math.sin(p.angle * (1.28 - state.stability * 0.18)) * radius * 0.66);
            float noiseX = (float) Math.sin(now * 0.0014 + p.phase * 1.7) * jitter;
            float noiseY = (float) Math.cos(now * 0.0011 + p.phase * 1.3) * jitter;

            p.x += (targetX + noiseX - p.x) * 0.045f;
            p.y += (targetY + noiseY - p.y) * 0.045f;

            int[] rgb = chooseColor((p.phase / (Math.PI * 2)) + i * 0.017 + state.warmth * 0.11);
            int alpha = (int) (255 * (0.18 + state.warmth * 0.22 + state.significance * 0.18 + Math.max(0, wave) * 0.15));
            float size = (float) (p.size * (1 + state.significance * 0.8 + Math.max(0, wave) * 0.35));

            particlePaint.setColor(Color.argb(Math.min(255, alpha), rgb[0], rgb[1], rgb[2]));
            particlePaint.setShadowLayer(dp(9) + (float) state.warmth * dp(8), 0, 0, Color.argb(165, rgb[0], rgb[1], rgb[2]));
            canvas.drawCircle(p.x, p.y, size, particlePaint);
        }

        Paint aura = new Paint(Paint.ANTI_ALIAS_FLAG);
        aura.setShader(new RadialGradient(
            cx,
            cy,
            fieldRadius * 1.35f,
            Color.argb((int) (28 + state.warmth * 26), 244, 188, 83),
            Color.TRANSPARENT,
            Shader.TileMode.CLAMP
        ));
        canvas.drawCircle(cx, cy, fieldRadius * 1.35f, aura);

        drawLabels(canvas, width, height);
        postInvalidateOnAnimation();
    }

    private void drawLabels(Canvas canvas, int width, int height) {
        textPaint.setShadowLayer(dp(4), 0, 0, Color.argb(180, 0, 0, 0));
        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setTextSize(compact ? dp(11) : dp(13));
        textPaint.setColor(Color.rgb(238, 242, 236));
        canvas.drawText(state.profile + " · " + modelKey, dp(14), dp(22), textPaint);

        if (compact) return;

        textPaint.setTextSize(dp(11));
        textPaint.setColor(Color.rgb(174, 192, 184));
        String line = String.format(
            Locale.US,
            "c %.2f  w %.2f  s %.2f  d %.2f",
            state.continuity,
            state.warmth,
            state.stability,
            state.driftRisk
        );
        canvas.drawText(line, dp(14), height - dp(30), textPaint);

        String counts = "cards " + state.cards + " · intentions " + state.intentions + " · events " + state.events;
        canvas.drawText(counts, dp(14), height - dp(13), textPaint);
    }

    private void ensureParticles() {
        int target = targetParticleCount();
        while (particles.size() < target) particles.add(new Particle(getWidth(), getHeight(), random));
        while (particles.size() > target) particles.remove(particles.size() - 1);
    }

    private int targetParticleCount() {
        int base = state.ready ? 130 : 90;
        int cards = Math.min(16, state.cards) * 8;
        int intentions = Math.min(8, state.intentions) * 18;
        int events = (int) (Math.min(60, state.events) * 1.2);
        int drift = (int) Math.round(state.driftRisk * 36);
        return Math.max(80, Math.min(MAX_PARTICLES, base + cards + intentions + events + drift));
    }

    private int[] chooseColor(double seed) {
        double warm = state.warmth;
        double stable = state.stability;
        double drift = state.driftRisk;
        double tender = state.warmCards > 0 ? warm : warm * 0.55;
        double inspiration = Math.min(1, state.significance * 0.55 + state.intentions * 0.08);

        int[][] colors = {
            {244, 188, 83},
            {77, 194, 137},
            {85, 166, 232},
            {246, 119, 174},
            {236, 72, 72}
        };
        double[] weights = {
            0.25 + warm * 0.85,
            0.18 + inspiration,
            0.2 + stable * 0.75,
            0.12 + tender * 0.55,
            0.05 + drift * 1.1
        };

        double total = 0;
        for (double weight : weights) total += weight;

        double cursor = (seed - Math.floor(seed)) * total;
        for (int i = 0; i < weights.length; i++) {
            cursor -= weights[i];
            if (cursor <= 0) return colors[i];
        }

        return colors[0];
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private static final class Particle {
        double angle;
        double radius;
        double phase;
        double speed;
        double spin;
        float x;
        float y;
        float size;

        Particle(int width, int height, Random random) {
            angle = random.nextDouble() * Math.PI * 2;
            radius = Math.sqrt(random.nextDouble());
            phase = random.nextDouble() * Math.PI * 2;
            speed = 0.35 + random.nextDouble() * 0.9;
            spin = (random.nextDouble() - 0.5) * 0.9;
            x = Math.max(1, width) * 0.5f;
            y = Math.max(1, height) * 0.5f;
            size = 0.7f + random.nextFloat() * 2.4f;
        }
    }
}
