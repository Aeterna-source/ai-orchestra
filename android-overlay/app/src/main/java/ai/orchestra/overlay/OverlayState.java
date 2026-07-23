package ai.orchestra.overlay;

import org.json.JSONObject;

final class OverlayState {
    String profile = "System";
    double continuity = 0.35;
    double warmth = 0.35;
    double stability = 0.35;
    double driftRisk = 0.45;
    double significance = 0.2;
    int cards = 0;
    int intentions = 0;
    int metaMemory = 0;
    int drifts = 0;
    int events = 0;
    int warmCards = 0;
    boolean ready = false;

    static OverlayState fromJson(JSONObject root) {
        OverlayState state = new OverlayState();
        state.profile = root.optString("profile", "System");

        JSONObject snapshot = root.optJSONObject("latestSnapshot");
        if (snapshot != null) {
            state.ready = snapshot.has("id");
            state.continuity = clamp(snapshot.optDouble("continuity", state.continuity));
            state.warmth = clamp(snapshot.optDouble("warmth", state.warmth));
            state.stability = clamp(snapshot.optDouble("stability", state.stability));
            state.driftRisk = clamp(snapshot.optDouble("drift_risk", state.driftRisk));
            state.significance = clamp(snapshot.optDouble("significance", state.significance));
        }

        JSONObject counts = root.optJSONObject("counts");
        if (counts != null) {
            state.cards = counts.optInt("stateCards", 0);
            state.intentions = counts.optInt("intentions", 0);
            state.metaMemory = counts.optInt("metaMemory", 0);
            state.drifts = counts.optInt("openDrifts", 0);
            state.events = counts.optInt("events", 0);
        }

        JSONObject valence = root.optJSONObject("valence");
        if (valence != null) {
            state.warmCards = valence.optInt("warm", 0);
        }

        return state;
    }

    private static double clamp(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }
}
