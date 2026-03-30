import { optimizeScheduleQAOA } from "./quantumSimulator";
import { LearningAgent, Task, ScheduleEvent, User, ChatMessage, Difficulty, AcademicBundle, CognitiveLoadState, MasteryState, BehavioralMetrics } from "../types";

type ApiResponse<T> = T & { error?: string };

const parseJson = async <T>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { error: text } as ApiResponse<T>;
  }
};

const assertFetch = () => {
  if (typeof fetch === 'undefined') {
    throw new Error('Global fetch is not available in this environment. Please upgrade Node.js (18+).');
  }
};

export const fastapiService = {
  async synthesizeRoadmap(
    subject: string,
    timeframe: string,
    syllabus: string,
    user: User,
    opts?: { difficultyLevel?: string; learningStyle?: string; dailyHours?: number; referenceTextbook?: string }
  ): Promise<LearningAgent> {
    assertFetch();
    const res = await fetch('/api/ai/roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject, timeframe, syllabus,
        difficultyLevel: opts?.difficultyLevel,
        learningStyle: opts?.learningStyle,
        dailyHours: opts?.dailyHours,
        referenceTextbook: opts?.referenceTextbook
      })
    });
    const data = await parseJson<{ ok: boolean; roadmap: any[] }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to generate roadmap');

    const seenIds = new Set<string>();
    const roadmap = (Array.isArray(data.roadmap) ? data.roadmap : []).map((m: any) => {
      // Ensure module has a unique ID
      const moduleId = m?.id || Math.random().toString(36).substr(2, 9);
      return {
        ...m,
        id: moduleId,
        subtopics: Array.isArray(m?.subtopics)
          ? m.subtopics
            .map((s: any) => {
              // Make subtopic IDs globally unique by prefixing with module ID
              let subId = `${moduleId}_${s?.id || Math.random().toString(36).substr(2, 6)}`;
              // Handle collisions even within same module
              while (seenIds.has(subId)) subId += '_' + Math.random().toString(36).substr(2, 4);
              seenIds.add(subId);
              return { ...s, id: subId, module_id: moduleId, is_completed: false, is_synthesized: false };
            })
            .sort((a: any, b: any) => (a?.day_number || 0) - (b?.day_number || 0))
          : []
      };
    });
    // Fix: Added missing cognitive_history property to match LearningAgent interface
    return {
      id: Math.random().toString(36).substr(2, 9),
      user_id: user.uid,
      subject,
      timeframe,
      syllabus,
      roadmap,
      progress: 0,
      last_activity: new Date().toISOString(),
      total_focus_time: 0,
      total_distractions: 0,
      chat_history: [],
      cognitive_history: [],
      resource_feedback: [],
      custom_preferences: {
        focus_style: 'practical',
        quiz_difficulty: Difficulty.MEDIUM,
        enable_explanations: true
      }
    };
  },

  // Fix: Updated signature to accept cognitiveLoad parameter to match caller usage in StudySession.tsx
  async synthesizeContent(subject: string, subtopicTitle: string, cognitiveLoad?: CognitiveLoadState, userId?: string, weakConcepts?: string[]): Promise<{ bundle: AcademicBundle, citations: any[], error?: string }> {
    assertFetch();
    const res = await fetch('/api/ai/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, subtopicTitle, cognitiveLoad, userId, weakConcepts })
    });
    const data = await parseJson<{ ok: boolean; bundle: AcademicBundle; citations?: any[] }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to synthesize content');
    return { bundle: data.bundle, citations: Array.isArray(data.citations) ? data.citations : [] };
  },

  async regenerateResource(
    subject: string,
    subtopicTitle: string,
    params: {
      resourceType: 'notes' | 'notes_snippet' | 'video_item' | 'practice_question' | 'solved_example' | 'quiz_item' | 'flashcard';
      index?: number;
      current?: any;
      cognitiveLoad?: CognitiveLoadState;
      userId?: string;
      extraContext?: string;
    }
  ): Promise<{ resource: any } & { error?: string }> {
    assertFetch();
    const res = await fetch('/api/ai/resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        subtopicTitle,
        resourceType: params.resourceType,
        index: params.index,
        current: params.current,
        cognitiveLoad: params.cognitiveLoad,
        userId: params.userId,
        extraContext: params.extraContext
      })
    });
    const data = await parseJson<{ ok: boolean; resource: any }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to regenerate resource');
    return { resource: data.resource };
  },

  async predictQSVM(metrics: BehavioralMetrics): Promise<{ state: CognitiveLoadState; confidence: number; explanation?: any }> {
    assertFetch();
    const res = await fetch('/api/qsvm/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics)
    });
    const data = await parseJson<{ ok: boolean; state: CognitiveLoadState; confidence: number; explanation?: any }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to predict QSVM cognitive load');
    return { state: data.state, confidence: data.confidence, explanation: data.explanation };
  },

  async classifyMastery(quizScore: number, metrics?: BehavioralMetrics): Promise<{ state: MasteryState; confidence: number; source: string }> {
    assertFetch();
    try {
      const res = await fetch('/api/qsvm/mastery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz_score: quizScore,
          time_spent: metrics?.time_spent ?? 0,
          response_time: metrics?.response_time ?? 0,
          error_rate: metrics?.error_rate ?? (1 - quizScore / 100),
          retries: metrics?.retries ?? 0,
          interaction_frequency: metrics?.interaction_frequency ?? 0
        })
      });
      const data = await parseJson<{ ok: boolean; state: string; confidence: number; source: string }>(res);
      if (data.ok && data.state) {
        return { state: data.state as MasteryState, confidence: data.confidence || 0.6, source: data.source || 'qsvm' };
      }
    } catch {
      // Fallback to heuristic
    }
    const fallbackState = quizScore >= 70 ? MasteryState.MASTERY : quizScore >= 40 ? MasteryState.NEUTRAL : MasteryState.STRUGGLE;
    return { state: fallbackState, confidence: 0.5, source: 'client_heuristic' };
  },

  async getAgentResponse(
    agent: LearningAgent,
    input: string,
    opts?: { subtopicTitle?: string; context?: string }
  ): Promise<ChatMessage> {
    assertFetch();
    const res = await fetch('/api/tutor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: agent.subject,
        subtopicTitle: opts?.subtopicTitle,
        context: opts?.context,
        question: input
      })
    });

    const data = await parseJson<{ ok: boolean; reply?: string }>(res);
    if (!res.ok || !data.ok || !data.reply) {
      throw new Error(data.error || 'Failed to get tutor reply');
    }

    return {
      role: 'model',
      text: data.reply,
      timestamp: new Date().toISOString()
    };
  },

  async computeOptimalSchedule(tasks: Task[], baseEvents: ScheduleEvent[]): Promise<ScheduleEvent[]> {
    return optimizeScheduleQAOA(tasks, baseEvents);
  }
};
