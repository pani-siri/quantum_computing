
import { BehavioralMetrics, CognitiveLoadState, ScheduleEvent, Task } from "../types";

export type { BehavioralMetrics };

export type CognitiveLoadExplanation = {
  predicted: CognitiveLoadState;
  confidence: number;
  contributions: Record<keyof BehavioralMetrics, number>;
};

/**
 * Stage 2: Quantum Kernel SVM Simulation
 * Simulates mapping features into a higher-dimensional Hilbert space for non-linear separation.
 */
const runQSVMInference = (m: BehavioralMetrics): CognitiveLoadState => {
  const t = Math.tanh((m.time_spent - 60) / 60);
  const rt = Math.tanh((m.response_time - 20) / 20);
  const er = Math.tanh((m.error_rate - 0.35) / 0.2);
  const r = Math.tanh((m.retries - 1.5) / 1.5);
  const f = Math.tanh((m.interaction_frequency - 8) / 8);

  // Simulated ZZFeatureMap-like mixing: non-linear interactions.
  const quantumFeature =
    0.35 * er +
    0.25 * rt +
    0.20 * r +
    0.10 * t +
    0.10 * f +
    0.12 * Math.sin(er * Math.PI) * Math.cos(rt * Math.PI) +
    0.08 * Math.sin(r * Math.PI) * Math.cos(f * Math.PI);

  if (quantumFeature > 0.55) return CognitiveLoadState.HIGH;
  if (quantumFeature < -0.25) return CognitiveLoadState.LOW;
  return CognitiveLoadState.OPTIMAL;
};

/**
 * Hybrid Cognitive Load Detection Pipeline
 */
export const classifyCognitiveLoad = (
  metrics: BehavioralMetrics
): { state: CognitiveLoadState; confidence: number; explanation: CognitiveLoadExplanation } => {
  // Stage 1: Classical Heuristics (Fast Pass)
  if (metrics.error_rate >= 0.6 || metrics.retries >= 3) {
    const explanation: CognitiveLoadExplanation = {
      predicted: CognitiveLoadState.HIGH,
      confidence: 0.85,
      contributions: {
        time_spent: 0.08,
        response_time: 0.18,
        error_rate: 0.40,
        retries: 0.28,
        interaction_frequency: 0.06
      }
    };
    return { state: CognitiveLoadState.HIGH, confidence: 0.85, explanation };
  }

  if (metrics.error_rate <= 0.1 && metrics.response_time <= 8 && metrics.retries === 0) {
    const explanation: CognitiveLoadExplanation = {
      predicted: CognitiveLoadState.LOW,
      confidence: 0.82,
      contributions: {
        time_spent: 0.14,
        response_time: 0.34,
        error_rate: 0.34,
        retries: 0.12,
        interaction_frequency: 0.06
      }
    };
    return { state: CognitiveLoadState.LOW, confidence: 0.82, explanation };
  }

  // Stage 2: QSVM inference
  const qState = runQSVMInference(metrics);

  // Lightweight explainability: normalized feature magnitudes (proxy contributions).
  const raw = {
    time_spent: Math.min(1, Math.abs((metrics.time_spent - 60) / 120)),
    response_time: Math.min(1, Math.abs((metrics.response_time - 20) / 40)),
    error_rate: Math.min(1, Math.abs((metrics.error_rate - 0.35) / 0.65)),
    retries: Math.min(1, Math.abs((metrics.retries - 1.5) / 3)),
    interaction_frequency: Math.min(1, Math.abs((metrics.interaction_frequency - 8) / 16))
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const contributions = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Number((v / sum).toFixed(2))])
  ) as Record<keyof BehavioralMetrics, number>;

  const confidence = qState === CognitiveLoadState.OPTIMAL ? 0.78 : 0.91;
  const explanation: CognitiveLoadExplanation = {
    predicted: qState,
    confidence,
    contributions
  };

  return { state: qState, confidence, explanation };
};

/**
 * Enhanced Schedule Optimization using simulated QAOA
 */
export const optimizeScheduleQAOA = (
  tasks: Task[],
  baseEvents: ScheduleEvent[]
): ScheduleEvent[] => {
  let optimized = [...baseEvents].sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  for (let i = 0; i < optimized.length; i++) {
    for (let j = i + 1; j < optimized.length; j++) {
      const eventA = optimized[i];
      const eventB = optimized[j];
      const endA = new Date(eventA.end_time).getTime();
      const startB = new Date(eventB.start_time).getTime();
      
      if (startB < endA) {
        const newStart = new Date(endA);
        const duration = new Date(eventB.end_time).getTime() - new Date(eventB.start_time).getTime();
        const newEnd = new Date(newStart.getTime() + duration);
        optimized[j] = { ...eventB, start_time: newStart.toISOString(), end_time: newEnd.toISOString() };
      }
    }
  }

  tasks.forEach(task => {
    const deadlineTime = new Date(task.deadline).getTime();
    optimized = optimized.map(e => {
      const eventTime = new Date(e.start_time).getTime();
      const diff = Math.abs(eventTime - deadlineTime);
      if (diff < 7200000 && task.priority === 'high') {
        const start = new Date(e.start_time);
        const end = new Date(e.end_time);
        start.setHours(start.getHours() - 4);
        end.setHours(end.getHours() - 4);
        return { ...e, start_time: start.toISOString(), end_time: end.toISOString() };
      }
      return e;
    });
  });

  return optimized;
};
