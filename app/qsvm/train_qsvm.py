import argparse
import json
import math
import os

import joblib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix

from qiskit.circuit.library import ZZFeatureMap
from qiskit_aer import Aer
from qiskit_machine_learning.algorithms.classifiers import QSVC
from qiskit_machine_learning.kernels import FidelityQuantumKernel


FEATURE_NAMES = [
    "time_spent",
    "response_time",
    "error_rate",
    "retries",
    "interaction_frequency",
]


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def simulate_dataset(n: int, seed: int = 42):
    rng = np.random.default_rng(seed)

    # skill: 0..1 (higher is better)
    # difficulty: 0..1 (higher is harder)
    skill = rng.uniform(0.0, 1.0, size=n)
    difficulty = rng.uniform(0.0, 1.0, size=n)

    gap = difficulty - skill

    # response time: seconds
    response_time = rng.normal(loc=12 + 25 * np.clip(gap, -1, 1), scale=6, size=n)
    response_time = np.clip(response_time, 2, 180)

    # time spent: seconds
    time_spent = rng.normal(loc=35 + 90 * np.clip(gap, -1, 1), scale=20, size=n)
    time_spent = np.clip(time_spent, 5, 600)

    # error rate: 0..1
    error_rate = np.array([_sigmoid(3.0 * g) for g in gap])
    error_rate = np.clip(error_rate + rng.normal(0, 0.08, size=n), 0, 1)

    # retries: 0..6
    lam = np.clip(0.5 + 3.0 * np.maximum(gap, 0), 0.2, 4.0)
    retries = rng.poisson(lam=lam, size=n)
    retries = np.clip(retries, 0, 6)

    # interaction frequency: events/min
    interaction_frequency = rng.normal(loc=6 + 14 * np.maximum(gap, 0), scale=4, size=n)
    interaction_frequency = np.clip(interaction_frequency, 0, 60)

    X = np.column_stack([
        time_spent,
        response_time,
        error_rate,
        retries,
        interaction_frequency
    ])

    # Labeling: 0=LOW, 1=MEDIUM, 2=HIGH
    y = np.zeros(n, dtype=int)

    high_mask = (error_rate >= 0.6) | (retries >= 3) | (response_time >= 35)
    low_mask = (error_rate <= 0.1) & (retries == 0) & (response_time <= 10)

    y[:] = 1
    y[high_mask] = 2
    y[low_mask] = 0

    return X, y


def train(output_path: str, n_samples: int = 600, seed: int = 42, reps: int = 2):
    X, y = simulate_dataset(n_samples, seed=seed)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=seed, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # Quantum kernel using Aer simulator
    backend = Aer.get_backend("statevector_simulator")
    feature_map = ZZFeatureMap(feature_dimension=X_train_s.shape[1], reps=reps, entanglement="full")
    qkernel = FidelityQuantumKernel(feature_map=feature_map)

    model = QSVC(quantum_kernel=qkernel)
    model.fit(X_train_s, y_train)

    y_pred = model.predict(X_test_s)

    report = classification_report(y_test, y_pred, digits=4)
    cm = confusion_matrix(y_test, y_pred)

    # IMPORTANT: store a plain dict so loading works even when this script was run
    # as __main__ (e.g., when called via Node + child_process).
    bundle = {
        "scaler": scaler,
        "model": model,
        "feature_means": X_train.mean(axis=0),
        "feature_names": list(FEATURE_NAMES),
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    joblib.dump(bundle, output_path)

    return {
        "ok": True,
        "output": output_path,
        "n_samples": int(n_samples),
        "feature_map": "ZZFeatureMap",
        "reps": int(reps),
        "report": report,
        "confusion_matrix": cm.tolist(),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(os.path.dirname(__file__), "model.joblib"))
    ap.add_argument("--samples", type=int, default=600)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--reps", type=int, default=2)
    args = ap.parse_args()

    result = train(args.output, n_samples=args.samples, seed=args.seed, reps=args.reps)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
