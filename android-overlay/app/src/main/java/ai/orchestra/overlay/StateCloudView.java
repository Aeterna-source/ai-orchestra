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
    private static final int MAX_PARTICLES = 860;

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

        double pulse = 1 + Math.sin(now * 0.0018) * (0.04 + state.significance * 0.09);
        float fieldRadius = (float) (minSide * (0.22 + (1 - state.stability) * 0.16 + state.driftRisk * 0.12) * pulse);
        float stretch = (float) (1 + state.continuity * 0.5);
        float jitter = (float) (minSide * (0.006 + state.driftRisk * 0.07 + (1 - state.stability) * 0.025));

        for (int i = 0; i < particles.size(); i++) {
            Particle p = particles.get(i);
            p.angle += (0.00065 + state.continuity * 0.001) * p.speed + p.spin * 0.00035;

            double wave = Math.sin(now * 0.001 * p.speed + p.phase);
            float radius = (float) (fieldRadius * (0.25 + p.radius * 0.96 + wave * 0.035));
            float fragment = state.driftRisk > 0.45 && i % 9 == 0 ? (float) (state.driftRisk * minSide * 0.12) : 0;
            float targetX = (float) (cx + Math.cos(p.angle) * (radius * stretch + fragment));
            float targetY = (float) (cy + Math.sin(p.angle * (1.28 - state.stability * 0.18)) * radius * 0.66);
            float noiseX = (float) Math.sin(now * 0.0014 + p.phase * 1.7) * jitter;
            float noiseY = (float) Math.cos(now * 0.0011 + p.phase * 1.3) * jitter;

            p.x += (targetX + noiseX - p.x) * 0.042f;
            p.y += (targetY + noiseY - p.y) * 0.042f;

            int[] rgb = chooseColor((p.phase / (Math.PI * 2)) + i * 0.017 + state.warmth * 0.11);
            int alpha = (int) (255 * (0.10 + state.warmth * 0.14 + state.significance * 0.10 + Math.max(0, wave) * 0.10));
            float size = (float) (p.size * (1 + state.significance * 0.42 + Math.max(0, wave) * 0.2));

            particlePaint.setColor(Color.argb(Math.min(255, alpha), rgb[0], rgb[1], rgb[2]));
            particlePaint.setShadowLayer(dp(4) + (float) state.warmth * dp(5), 0, 0, Color.argb(145, rgb[0], rgb[1], rgb[2]));
            canvas.drawCircle(p.x, p.y, size, particlePaint);
        }

        int[] dominant = dominantColor();
        Paint aura = new Paint(Paint.ANTI_ALIAS_FLAG);
        aura.setShader(new RadialGradient(
            cx,
            cy,
            fieldRadius * 1.35f,
            Color.argb((int) (32 + dominantScore() * 34), dominant[0], dominant[1], dominant[2]),
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
        canvas.drawText(state.profile + " / " + modelKey, dp(14), dp(22), textPaint);

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

        String counts = "tone " + dominantTone() + " / cards " + state.cards + " / meta " + state.metaMemory + " / events " + state.events;
        canvas.drawText(counts, dp(14), height - dp(13), textPaint);
    }

    private void ensureParticles() {
        int target = targetParticleCount();
        while (particles.size() < target) particles.add(new Particle(getWidth(), getHeight(), random));
        while (particles.size() > target) particles.remove(particles.size() - 1);
    }

    private int targetParticleCount() {
        int base = state.ready ? 420 : 260;
        int cards = Math.min(20, state.cards) * 10;
        int intentions = Math.min(8, state.intentions) * 16;
        int meta = Math.min(10, state.metaMemory) * 8;
        int events = (int) (Math.min(80, state.events) * 1.3);
        int drift = (int) Math.round(state.driftRisk * 44);
        return Math.max(220, Math.min(MAX_PARTICLES, base + cards + intentions + meta + events + drift));
    }

    private int[] chooseColor(double seed) {
        int[] dominant = dominantColor();
        int[] secondary = secondaryColor();
        int[] alert = {236, 72, 72};

        double value = seed - Math.floor(seed);
        if (state.driftRisk > 0.32 && value > 0.94 - state.driftRisk * 0.1) {
            return blend(alert, dominant, 0.28);
        }
        if (value > 0.82) {
            return blend(secondary, dominant, 0.18);
        }
        if (value > 0.72) {
            return blend(dominant, new int[]{245, 248, 242}, 0.18);
        }

        return dominant;
    }

    private String dominantTone() {
        int index = dominantIndex();
        if (index == 0) return "danger";
        if (index == 1) return "warmth";
        if (index == 2) return "inspiration";
        if (index == 3) return "focus";
        return "tenderness";
    }

    private int[] dominantColor() {
        return toneColors()[dominantIndex()];
    }

    private int[] secondaryColor() {
        double[] scores = toneScores();
        int dominant = dominantIndex();
        int secondary = dominant == 0 ? 1 : 0;
        for (int i = 0; i < scores.length; i++) {
            if (i != dominant && scores[i] > scores[secondary]) {
                secondary = i;
            }
        }
        return toneColors()[secondary];
    }

    private int dominantIndex() {
        double[] scores = toneScores();
        int index = 0;
        for (int i = 1; i < scores.length; i++) {
            if (scores[i] > scores[index]) index = i;
        }
        return index;
    }

    private double dominantScore() {
        double[] scores = toneScores();
        return Math.max(0, Math.min(1, scores[dominantIndex()]));
    }

    private double[] toneScores() {
        double drift = Math.min(1, state.driftRisk * 1.25 + state.drifts * 0.08);
        double warmCardSignal = Math.min(1, state.warmCards * 0.08);
        double warmth = Math.min(1, state.warmth * 0.82 + warmCardSignal * 0.18) * (1 - state.driftRisk * 0.18);
        double inspiration = Math.min(1, state.significance * 0.72 + state.intentions * 0.08);
        double focusBase = Math.min(1, state.stability * 0.34 + state.continuity * 0.22);
        double focus = focusBase * (1 - Math.max(0, warmth - 0.55) * 0.75);
        double tenderness = Math.min(1, state.warmth * 0.78 + warmCardSignal * 0.22);
        return new double[]{drift, warmth, inspiration, focus, tenderness};
    }

    private int[][] toneColors() {
        return new int[][]{
            {236, 72, 72},
            {244, 188, 83},
            {77, 194, 137},
            {85, 166, 232},
            {246, 119, 174}
        };
    }

    private int[] blend(int[] a, int[] b, double bShare) {
        double aShare = 1 - bShare;
        return new int[]{
            (int) Math.round(a[0] * aShare + b[0] * bShare),
            (int) Math.round(a[1] * aShare + b[1] * bShare),
            (int) Math.round(a[2] * aShare + b[2] * bShare)
        };
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
            size = 0.35f + random.nextFloat() * 1.05f;
        }
    }
}
