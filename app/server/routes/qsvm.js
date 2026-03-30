/**
 * QSVM Cognitive Load Routes
 * Pure JavaScript implementation — no Python / model.joblib dependency.
 * Mirrors the ZZFeatureMap-style hybrid pipeline in app/services/quantumSimulator.ts
 */

import { Router } from "express";

const router = Router();

const STATE_HIGH    = "HIGH_LOAD";
const STATE_OPTIMAL = "OPTIMAL_LOAD";
const STATE_LOW     = "LOW_LOAD";

/** tanh normalisation helper */
const tn = (v, center, scale) => Math.tanh((v - center) / scale);

/**
 * Two-stage hybrid pipeline:
 *  Stage 1 – classical heuristics (fast-pass for extreme inputs)
 *  Stage 2 – ZZFeatureMap-style quantum kernel SVM simulation
 */
function classifyCognitiveLoad(m) {
  const ts  = Number(m.time_spent            ?? 0);
  const rt  = Number(m.response_time         ?? 0);
  const er  = Number(m.error_rate            ?? 0);
  const ret = Number(m.retries               ?? 0);
  const fq  = Number(m.interaction_frequency ?? 0);

  // ── Stage 1: Classical heuristics ────────────────────────────────────
  if (er >= 0.6 || ret >= 3) {
    return {
      state: STATE_HIGH, confidence: 0.85,
      explanation: { contributions: { time_spent: 0.08, response_time: 0.18, error_rate: 0.40, retries: 0.28, interaction_frequency: 0.06 } }
    };
  }
  if (er <= 0.1 && rt <= 8 && ret === 0) {
    return {
      state: STATE_LOW, confidence: 0.82,
      explanation: { contributions: { time_spent: 0.14, response_time: 0.34, error_rate: 0.34, retries: 0.12, interaction_frequency: 0.06 } }
    };
  }

  // ── Stage 2: QSVM (ZZFeatureMap kernel simulation) ───────────────────
  const t_  = tn(ts,  60,  60);
  const rt_ = tn(rt,  20,  20);
  const er_ = tn(er,  0.35, 0.2);
  const r_  = tn(ret, 1.5,  1.5);
  const f_  = tn(fq,  8,    8);

  const qFeature =
    0.35 * er_ +
    0.25 * rt_ +
    0.20 * r_  +
    0.10 * t_  +
    0.10 * f_  +
    0.12 * Math.sin(er_ * Math.PI) * Math.cos(rt_ * Math.PI) +
    0.08 * Math.sin(r_  * Math.PI) * Math.cos(f_  * Math.PI);

  const state = qFeature > 0.55 ? STATE_HIGH : qFeature < -0.25 ? STATE_LOW : STATE_OPTIMAL;
  const confidence = state === STATE_OPTIMAL ? 0.78 : 0.91;

  // Lightweight explainability (normalised feature magnitudes)
  const raw = {
    time_spent:            Math.min(1, Math.abs((ts  - 60)  / 120)),
    response_time:         Math.min(1, Math.abs((rt  - 20)  / 40)),
    error_rate:            Math.min(1, Math.abs((er  - 0.35) / 0.65)),
    retries:               Math.min(1, Math.abs((ret - 1.5)  / 3)),
    interaction_frequency: Math.min(1, Math.abs((fq  - 8)   / 16)),
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const contributions = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Number((v / sum).toFixed(2))])
  );

  return { state, confidence, explanation: { contributions } };
}

/** Map cognitive load state → mastery state */
function loadToMastery(state) {
  if (state === STATE_HIGH)    return "Struggle";
  if (state === STATE_LOW)     return "Mastery";
  return "Neutral";
}

// ── POST /api/qsvm/predict ────────────────────────────────────────────────────
router.post("/api/qsvm/predict", (req, res) => {
  try {
    const result = classifyCognitiveLoad(req.body || {});
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "QSVM predict failed", debug: err?.message });
  }
});

// ── POST /api/qsvm/mastery ────────────────────────────────────────────────────
router.post("/api/qsvm/mastery", (req, res) => {
  try {
    const payload    = req.body || {};
    const quizScore  = Number(payload.quiz_score ?? 0);
    const metrics    = {
      time_spent:            Number(payload.time_spent            ?? 0),
      response_time:         Number(payload.response_time         ?? 0),
      error_rate:            Number(payload.error_rate            ?? (1 - quizScore / 100)),
      retries:               Number(payload.retries               ?? 0),
      interaction_frequency: Number(payload.interaction_frequency ?? 0),
    };

    const result = classifyCognitiveLoad(metrics);
    return res.json({
      ok: true,
      state: loadToMastery(result.state),
      confidence: result.confidence,
      source: "qsvm_js",
    });
  } catch (err) {
    // Hard fallback — never return 500 for mastery classification
    const qs = Number((req.body || {}).quiz_score ?? 0);
    const fallback = qs >= 70 ? "Mastery" : qs >= 40 ? "Neutral" : "Struggle";
    return res.json({ ok: true, state: fallback, confidence: 0.6, source: "heuristic_fallback" });
  }
});

export default router;
