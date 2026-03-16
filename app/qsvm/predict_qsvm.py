import argparse
import json
import os

import joblib
import numpy as np


STATE_MAP = {0: "LOW_LOAD", 1: "OPTIMAL_LOAD", 2: "HIGH_LOAD"}
FEATURE_NAMES = [
    "time_spent",
    "response_time",
    "error_rate",
    "retries",
    "interaction_frequency",
]


def _contrib_proxy(x_scaled: np.ndarray) -> dict:
    # Simple explainability proxy: normalized absolute value of scaled features
    abs_vals = np.abs(x_scaled).astype(float)
    s = float(abs_vals.sum()) if float(abs_vals.sum()) != 0.0 else 1.0
    contrib = (abs_vals / s).round(2)
    return {FEATURE_NAMES[i]: float(contrib[i]) for i in range(len(FEATURE_NAMES))}


def load_bundle(model_path: str):
    bundle = joblib.load(model_path)
    # Backwards/forwards compatibility:
    # - New format: dict with keys scaler/model/feature_means/feature_names
    # - Old format: ModelBundle dataclass instance with attributes
    if isinstance(bundle, dict):
        return bundle
    return {
        "scaler": getattr(bundle, "scaler", None),
        "model": getattr(bundle, "model", None),
        "feature_means": getattr(bundle, "feature_means", None),
        "feature_names": getattr(bundle, "feature_names", FEATURE_NAMES),
    }


def predict_one(bundle, x: dict):
    vec = np.array([
        float(x.get("time_spent", 0)),
        float(x.get("response_time", 0)),
        float(x.get("error_rate", 0)),
        float(x.get("retries", 0)),
        float(x.get("interaction_frequency", 0)),
    ], dtype=float).reshape(1, -1)

    scaler = bundle.get("scaler")
    model = bundle.get("model")
    if scaler is None or model is None:
        raise RuntimeError("Invalid model bundle: missing scaler/model")

    x_scaled = scaler.transform(vec)

    y = int(model.predict(x_scaled)[0])

    # Confidence: QSVC doesn't always expose calibrated probabilities.
    # We provide a reasonable proxy using distance-to-boundary if available.
    confidence = 0.75
    try:
        score = model.decision_function(x_scaled)
        # For multi-class, this can be a vector. Use max magnitude.
        score_val = float(np.max(np.abs(score)))
        confidence = float(np.clip(0.55 + (score_val / 4.0), 0.55, 0.95))
    except Exception:
        pass

    return {
        "state": STATE_MAP.get(y, "OPTIMAL_LOAD"),
        "confidence": round(confidence, 3),
        "explanation": {
            "contributions": _contrib_proxy(x_scaled.flatten()),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.path.join(os.path.dirname(__file__), "model.joblib"))
    ap.add_argument("--input", default="")
    args = ap.parse_args()

    if args.input:
        payload = json.loads(args.input)
    else:
        payload = json.loads(os.environ.get("QSVM_INPUT", "{}"))

    bundle = load_bundle(args.model)
    result = predict_one(bundle, payload)
    print(json.dumps({"ok": True, **result}))


if __name__ == "__main__":
    main()
