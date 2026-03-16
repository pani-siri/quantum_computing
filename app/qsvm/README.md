# QSVM (Quantum Kernel SVM) - Free Local Simulator

This folder adds a **real QSVM-style quantum kernel SVM** using **Qiskit Aer** (local simulator, free).

It is designed to be called from the Node server endpoint:
- `POST /api/qsvm/predict`

## 1) Install Python dependencies

Create a venv (recommended) and install:

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r qsvm/requirements.txt
```

## 2) Train a QSVM model (generates a local model file)

```bash
python qsvm/train_qsvm.py --output qsvm/model.joblib --samples 600 --reps 2
```

The training script uses a **synthetic dataset** (simulation) so you can run it immediately for an academic demo.

## 3) Predict (standalone test)

```bash
python qsvm/predict_qsvm.py --model qsvm/model.joblib --input "{\"time_spent\":60,\"response_time\":25,\"error_rate\":0.7,\"retries\":2,\"interaction_frequency\":12}"
```

## 4) Server integration

The backend endpoint is:
- `POST /api/qsvm/predict`

Payload:

```json
{
  "time_spent": 75,
  "response_time": 35,
  "error_rate": 0.6,
  "retries": 3,
  "interaction_frequency": 18
}
```

Optional environment overrides:
- `QSVM_PYTHON` (default: `python`)
- `QSVM_MODEL_PATH` (default: `qsvm/model.joblib`)

Notes:
- If the model file does not exist, run training first.
- This is **fully local** (no paid services, no IBM account required).
