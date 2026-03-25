import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

function runPython(scriptPath, args) {
  const pythonCmd = process.env.QSVM_PYTHON || "python";
  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.on("error", err => reject(new Error(`Failed to start Python (${pythonCmd}): ${err.message}`)));
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("close", code => {
      if (code !== 0) return reject(new Error(stderr.slice(0, 2000) || "Python process failed"));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Invalid JSON from Python: " + stdout.slice(0, 2000))); }
    });
  });
}

// ── Predict cognitive load ────────────────────────────────────────────────────
router.post("/api/qsvm/predict", async (req, res) => {
  try {
    const payload = req.body || {};
    const features = {
      time_spent: Number(payload.time_spent ?? 0),
      response_time: Number(payload.response_time ?? 0),
      error_rate: Number(payload.error_rate ?? 0),
      retries: Number(payload.retries ?? 0),
      interaction_frequency: Number(payload.interaction_frequency ?? 0)
    };
    const modelPath = process.env.QSVM_MODEL_PATH || path.resolve(__dirname, "..", "..", "qsvm", "model.joblib");
    const scriptPath = path.resolve(__dirname, "..", "..", "qsvm", "predict_qsvm.py");
    const result = await runPython(scriptPath, ["--model", modelPath, "--input", JSON.stringify(features)]);
    return res.json(result);
  } catch (err) { return res.status(500).json({ ok: false, error: "QSVM predictor failed", debug: err?.message }); }
});

// ── Classify mastery state ────────────────────────────────────────────────────
router.post("/api/qsvm/mastery", async (req, res) => {
  try {
    const payload = req.body || {};
    const quizScore = Number(payload.quiz_score ?? 0);
    const features = {
      time_spent: Number(payload.time_spent ?? 0),
      response_time: Number(payload.response_time ?? 0),
      error_rate: Number(payload.error_rate ?? (1 - quizScore / 100)),
      retries: Number(payload.retries ?? 0),
      interaction_frequency: Number(payload.interaction_frequency ?? 0)
    };
    const modelPath = process.env.QSVM_MODEL_PATH || path.resolve(__dirname, "..", "..", "qsvm", "model.joblib");
    const scriptPath = path.resolve(__dirname, "..", "..", "qsvm", "predict_qsvm.py");
    try {
      const parsed = await runPython(scriptPath, ["--model", modelPath, "--input", JSON.stringify(features), "--mode", "mastery"]);
      const loadToMastery = { HIGH_LOAD: "Struggle", LOW_LOAD: "Mastery", OPTIMAL_LOAD: "Neutral" };
      return res.json({ ok: true, state: loadToMastery[parsed.state] || "Neutral", confidence: parsed.confidence || 0.75, source: "qsvm" });
    } catch {
      const heuristicState = quizScore >= 70 ? "Mastery" : quizScore >= 40 ? "Neutral" : "Struggle";
      return res.json({ ok: true, state: heuristicState, confidence: 0.6, source: "heuristic_fallback" });
    }
  } catch (err) { return res.status(500).json({ ok: false, error: err?.message || "Failed" }); }
});

export default router;
