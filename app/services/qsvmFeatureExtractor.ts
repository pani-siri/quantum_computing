import { BehavioralMetrics } from "./quantumSimulator";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number(v) || 0));

const safeDiv = (num: number, den: number): number => {
  const n = Number(num) || 0;
  const d = Number(den) || 0;
  return d > 0 ? n / d : 0;
};

/**
 * Builds a QSVM-ready, resource-agnostic feature vector.
 *
 * Academic justification:
 * - We enforce a fixed 5D feature space across resource types so the QSVM kernel
 *   always compares like-for-like representations.
 * - All proxy features are normalized to [0, 1] to avoid scale dominance.
 */
export const buildQSVMFeatures = (args: {
  time_spent: number;
  response_time: number;
  error_rate: number;
  retries: number;
  interaction_frequency: number;
}): BehavioralMetrics => {
  const timeSpent = Math.max(1, Math.round(Number(args.time_spent) || 0));
  const responseTime = Math.max(0, Math.round(Number(args.response_time) || 0));

  return {
    time_spent: timeSpent,
    response_time: responseTime,
    error_rate: clamp01(args.error_rate),
    retries: Math.max(0, Math.round(Number(args.retries) || 0)),
    interaction_frequency: Math.max(0, Number(args.interaction_frequency) || 0)
  };
};

/**
 * A) Notes section (index = idx)
 * - error_rate proxy: scroll intensity vs expected scrolls in a struggle window.
 * - interaction_frequency: scroll events per minute.
 */
export const extractNotesFeatures = (args: {
  time_spent_sec: number;
  scroll_events: number;
  expected_scroll_events: number;
}): BehavioralMetrics => {
  const timeSpent = Math.max(1, Math.round(Number(args.time_spent_sec) || 0));
  const scrollEvents = Math.max(0, Math.round(Number(args.scroll_events) || 0));
  const expected = Math.max(1, Number(args.expected_scroll_events) || 1);

  const errorRate = clamp01(safeDiv(scrollEvents, expected));
  const interactionFrequency = safeDiv(scrollEvents, timeSpent) * 60;

  return buildQSVMFeatures({
    time_spent: timeSpent,
    response_time: 0,
    error_rate: errorRate,
    retries: 0,
    interaction_frequency: interactionFrequency
  });
};

/**
 * B) Practice question (index = idx)
 * - error_rate proxy: reveal count vs max expected reveals.
 * - retries: reveal_count - 1.
 * - interaction_frequency: reveals per minute.
 */
export const extractPracticeFeatures = (args: {
  response_time_sec: number;
  reveal_count: number;
  max_expected_reveals: number;
}): BehavioralMetrics => {
  const responseTime = Math.max(1, Math.round(Number(args.response_time_sec) || 0));
  const reveals = Math.max(0, Math.round(Number(args.reveal_count) || 0));
  const maxReveals = Math.max(1, Number(args.max_expected_reveals) || 1);

  const errorRate = clamp01(safeDiv(reveals, maxReveals));
  const retries = Math.max(0, reveals - 1);
  const interactionFrequency = safeDiv(reveals, responseTime) * 60;

  return buildQSVMFeatures({
    time_spent: responseTime,
    response_time: responseTime,
    error_rate: errorRate,
    retries,
    interaction_frequency: interactionFrequency
  });
};

/**
 * C) Quiz question (index = quizIndex)
 * - error_rate: wrong_attempts / total_attempts.
 * - retries: wrong_attempts.
 * - interaction_frequency: total attempts per minute.
 */
export const extractQuizFeatures = (args: {
  time_spent_sec: number;
  wrong_attempts: number;
  total_attempts: number;
}): BehavioralMetrics => {
  const timeSpent = Math.max(1, Math.round(Number(args.time_spent_sec) || 0));
  const wrong = Math.max(0, Math.round(Number(args.wrong_attempts) || 0));
  const total = Math.max(1, Math.round(Number(args.total_attempts) || 1));

  const errorRate = clamp01(safeDiv(wrong, total));
  const interactionFrequency = safeDiv(total, timeSpent) * 60;

  return buildQSVMFeatures({
    time_spent: timeSpent,
    response_time: timeSpent,
    error_rate: errorRate,
    retries: wrong,
    interaction_frequency: interactionFrequency
  });
};

/**
 * D) Video item (index = videoIndex)
 * - error_rate proxy: switches vs max expected switches.
 * - retries: video_switches - 1.
 * - interaction_frequency: switches per minute.
 */
export const extractVideoFeatures = (args: {
  time_spent_sec: number;
  video_switches: number;
  max_expected_switches: number;
}): BehavioralMetrics => {
  const timeSpent = Math.max(1, Math.round(Number(args.time_spent_sec) || 0));
  const switches = Math.max(0, Math.round(Number(args.video_switches) || 0));
  const maxSwitches = Math.max(1, Number(args.max_expected_switches) || 1);

  const errorRate = clamp01(safeDiv(switches, maxSwitches));
  const retries = Math.max(0, switches - 1);
  const interactionFrequency = safeDiv(switches, timeSpent) * 60;

  return buildQSVMFeatures({
    time_spent: timeSpent,
    response_time: 0,
    error_rate: errorRate,
    retries,
    interaction_frequency: interactionFrequency
  });
};
