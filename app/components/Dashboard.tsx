
import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { LearningAgent, CognitiveLoadState, Module } from '../types';
import { classifyCognitiveLoad, BehavioralMetrics } from '../services/quantumSimulator';
import {
  CheckCircle2, Zap, Clock, Target, GraduationCap, Brain,
  RefreshCw, AlertTriangle, TrendingUp, ChevronDown, BookOpen, Flame,
  Activity, Atom, BarChart3, Cpu
} from 'lucide-react';

interface DashboardProps {
  agents: LearningAgent[];
}

type TabType = 'analytics' | 'quantum';

const PIE_COLORS = {
  mastery: '#34d399',
  neutral: '#fbbf24',
  struggle: '#f87171',
  optimal: '#34d399',
  high: '#f87171',
  low: '#818cf8',
};

const GlassCard: React.FC<{ children: React.ReactNode; className?: string; blue?: boolean }> = ({ children, className = '', blue }) => (
  <div className={`${blue ? 'figma-glass-blue' : 'figma-glass'} p-6 ${className}`}>
    {children}
  </div>
);

const StatPill: React.FC<{ icon: React.ReactNode; label: string; value: string | number; sub?: string }> = ({ icon, label, value, sub }) => (
  <div className="figma-glass p-5 flex flex-col gap-2">
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/50">{label}</span>
    </div>
    <p className="text-3xl font-black text-white">{value}</p>
    {sub && <p className="text-[10px] font-medium text-white/40">{sub}</p>}
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ agents }) => {
  const [activeTab, setActiveTab] = useState<TabType>('analytics');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(agents.length === 1 ? agents[0]?.id : null);

  // ── Global Stats ──────────────────────────────────────────────────────
  const globalStats = useMemo(() => {
    let totalLessons = 0, completedLessons = 0, totalFocus = 0, totalDistractions = 0;
    let optimalCount = 0, highCount = 0, lowCount = 0;
    let mastered = 0, neutral = 0, struggle = 0;
    const quizScores: number[] = [];

    for (const a of agents) {
      totalFocus += a.total_focus_time || 0;
      totalDistractions += a.total_distractions || 0;
      for (const h of a.cognitive_history || []) {
        if (h.state === CognitiveLoadState.OPTIMAL) optimalCount++;
        else if (h.state === CognitiveLoadState.HIGH) highCount++;
        else lowCount++;
      }
      for (const m of a.roadmap) {
        for (const s of m.subtopics) {
          if (s.is_review) continue;
          totalLessons++;
          if (s.is_completed) {
            completedLessons++;
            const score = s.quiz_score ?? 0;
            quizScores.push(score);
            if (score >= 70) mastered++;
            else if (score >= 40) neutral++;
            else struggle++;
          }
        }
      }
    }

    const cogTotal = optimalCount + highCount + lowCount;
    const avgQuiz = quizScores.length > 0 ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : 0;
    const focusMin = Math.round(totalFocus / 60);

    return {
      totalLessons, completedLessons, totalFocus: focusMin, totalDistractions,
      coverage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      avgQuiz,
      cogTotal, optimalCount, highCount, lowCount,
      optimalPct: cogTotal > 0 ? Math.round((optimalCount / cogTotal) * 100) : 0,
      highPct: cogTotal > 0 ? Math.round((highCount / cogTotal) * 100) : 0,
      lowPct: cogTotal > 0 ? Math.round((lowCount / cogTotal) * 100) : 0,
      mastered, neutral, struggle,
    };
  }, [agents]);

  // ── Per-Agent Stats ───────────────────────────────────────────────────
  const agentStats = useMemo(() => {
    return agents.map(a => {
      let total = 0, completed = 0, mastered = 0, neutral = 0, struggle = 0;
      const scores: number[] = [];
      const moduleStats: { module: Module; completed: number; total: number; avgScore: number }[] = [];

      for (const m of a.roadmap) {
        let mCompleted = 0, mTotal = 0;
        const mScores: number[] = [];
        for (const s of m.subtopics) {
          if (s.is_review) continue;
          mTotal++;
          total++;
          if (s.is_completed) {
            mCompleted++;
            completed++;
            const score = s.quiz_score ?? 0;
            scores.push(score);
            mScores.push(score);
            if (score >= 70) mastered++;
            else if (score >= 40) neutral++;
            else struggle++;
          }
        }
        moduleStats.push({
          module: m,
          completed: mCompleted,
          total: mTotal,
          avgScore: mScores.length > 0 ? Math.round(mScores.reduce((a, b) => a + b, 0) / mScores.length) : 0
        });
      }

      const cogHistory = a.cognitive_history || [];
      const optCount = cogHistory.filter(h => h.state === CognitiveLoadState.OPTIMAL).length;
      const highCount = cogHistory.filter(h => h.state === CognitiveLoadState.HIGH).length;
      const lowCount = cogHistory.filter(h => h.state === CognitiveLoadState.LOW).length;
      const cogTotal = cogHistory.length;
      const focusMin = Math.round((a.total_focus_time || 0) / 60);
      const avgQuiz = scores.length > 0 ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : 0;

      const topicScores = a.roadmap.flatMap(m =>
        m.subtopics.filter(s => s.is_completed && !s.is_review).map(s => ({
          name: s.title.length > 18 ? s.title.slice(0, 18) + '...' : s.title,
          score: s.quiz_score ?? 0,
          fill: (s.quiz_score ?? 0) >= 70 ? PIE_COLORS.mastery : (s.quiz_score ?? 0) >= 40 ? PIE_COLORS.neutral : PIE_COLORS.struggle,
        }))
      ).slice(-8);

      const revisions = a.roadmap.flatMap(m =>
        m.subtopics.filter(s => s.is_review).map(s => ({
          title: m.subtopics.find(sub => sub.id === s.review_of)?.title || s.title.replace('Review: ', ''),
          weakConcepts: s.weak_concepts || [],
          isCompleted: s.is_completed,
        }))
      );

      return {
        agent: a,
        total, completed, mastered, neutral, struggle,
        coverage: total > 0 ? Math.round((completed / total) * 100) : 0,
        focusMin, avgQuiz,
        optCount, highCount, lowCount,
        optPct: cogTotal > 0 ? Math.round((optCount / cogTotal) * 100) : 0,
        highPct: cogTotal > 0 ? Math.round((highCount / cogTotal) * 100) : 0,
        lowPct: cogTotal > 0 ? Math.round((lowCount / cogTotal) * 100) : 0,
        cogTotal,
        moduleStats,
        topicScores,
        revisions,
        cogHistory,
        masteryPie: [
          { name: 'Mastered', value: mastered, color: PIE_COLORS.mastery },
          { name: 'Neutral', value: neutral, color: PIE_COLORS.neutral },
          { name: 'Struggle', value: struggle, color: PIE_COLORS.struggle },
        ].filter(d => d.value > 0),
        cogPie: [
          { name: 'Optimal', value: optCount, color: PIE_COLORS.optimal },
          { name: 'High Load', value: highCount, color: PIE_COLORS.high },
          { name: 'Low Load', value: lowCount, color: PIE_COLORS.low },
        ].filter(d => d.value > 0),
      };
    });
  }, [agents]);

  // ── Quantum Analytics Data ────────────────────────────────────────────
  const quantumData = useMemo(() => {
    // Cognitive load timeline across all agents
    const allHistory = agents.flatMap(a =>
      (a.cognitive_history || []).map((h, i) => ({
        session: i + 1,
        agent: a.subject,
        state: h.state,
        value: h.state === CognitiveLoadState.HIGH ? 1 : h.state === CognitiveLoadState.OPTIMAL ? 0.5 : 0,
        label: h.state === CognitiveLoadState.HIGH ? 'High' : h.state === CognitiveLoadState.OPTIMAL ? 'Optimal' : 'Low',
        timestamp: h.timestamp,
      }))
    );

    // Run QSVM on synthetic behavioral metrics from completed subtopics for feature contribution viz
    const featureContributions: { topic: string; time_spent: number; response_time: number; error_rate: number; retries: number; interaction_frequency: number; state: string; confidence: number }[] = [];

    for (const a of agents) {
      for (const m of a.roadmap) {
        for (const s of m.subtopics) {
          if (!s.is_completed || s.is_review) continue;
          // Derive behavioral metrics from available data
          const quizScore = s.quiz_score ?? 50;
          const errorRate = Math.max(0, (100 - quizScore) / 100);
          const retries = (s.weak_concepts?.length || 0);
          const metrics: BehavioralMetrics = {
            time_spent: 45 + Math.random() * 60,
            response_time: 10 + (1 - quizScore / 100) * 30,
            error_rate: errorRate,
            retries: retries,
            interaction_frequency: 5 + Math.random() * 10,
          };
          const result = classifyCognitiveLoad(metrics);
          featureContributions.push({
            topic: s.title.length > 20 ? s.title.slice(0, 20) + '...' : s.title,
            ...result.explanation.contributions,
            state: result.state === CognitiveLoadState.HIGH ? 'High' : result.state === CognitiveLoadState.OPTIMAL ? 'Optimal' : 'Low',
            confidence: Math.round(result.confidence * 100),
          });
        }
      }
    }

    // ZZFeatureMap quantum kernel values for visualization
    const kernelSamples = featureContributions.slice(0, 10).map(fc => {
      const er = Math.tanh((fc.error_rate - 0.35) / 0.2);
      const rt = Math.tanh((fc.response_time - 20) / 20);
      const r = Math.tanh((fc.retries - 1.5) / 1.5);
      const t = Math.tanh((fc.time_spent - 60) / 60);
      const f = Math.tanh((fc.interaction_frequency - 8) / 8);
      const linear = 0.35 * er + 0.25 * rt + 0.20 * r + 0.10 * t + 0.10 * f;
      const quantum = 0.12 * Math.sin(er * Math.PI) * Math.cos(rt * Math.PI) + 0.08 * Math.sin(r * Math.PI) * Math.cos(f * Math.PI);
      return {
        topic: fc.topic,
        linear: Number(linear.toFixed(3)),
        quantum: Number(quantum.toFixed(3)),
        total: Number((linear + quantum).toFixed(3)),
        state: fc.state,
      };
    });

    return { allHistory, featureContributions, kernelSamples };
  }, [agents]);

  const formatTime = (min: number) => min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;

  // ── Empty State ───────────────────────────────────────────────────────
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-6">
        <div className="w-24 h-24 figma-glass rounded-[2rem] flex items-center justify-center mb-8">
          <GraduationCap size={48} className="text-white/40" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white">No Courses Yet</h2>
        <p className="text-white/40 font-medium mt-3 max-w-sm">Add a subject and generate a roadmap to see your analytics here.</p>
      </div>
    );
  }

  const glassTooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '16px',
    padding: '12px 16px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 700,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-32 animate-in fade-in duration-500">

      {/* ── Tab Switcher ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="figma-glass inline-flex p-1.5 gap-1.5">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-5 py-2.5 rounded-[18px] text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'bg-white/20 text-white shadow-lg shadow-white/5'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <BarChart3 size={16} />
            Analytics
          </button>
          <button
            onClick={() => setActiveTab('quantum')}
            className={`px-5 py-2.5 rounded-[18px] text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'quantum'
                ? 'bg-white/20 text-white shadow-lg shadow-white/5'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Atom size={16} />
            Quantum
          </button>
        </div>
        <div className="figma-glass px-4 py-2 flex items-center gap-2">
          <Flame size={14} className="text-orange-300" />
          <span className="text-sm font-black text-white">{formatTime(globalStats.totalFocus)}</span>
          <span className="text-[9px] font-bold text-white/40 uppercase">focus</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ANALYTICS TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* Global Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatPill
              icon={<Target size={16} className="text-blue-300" />}
              label="Coverage"
              value={`${globalStats.coverage}%`}
              sub={`${globalStats.completedLessons}/${globalStats.totalLessons} lessons`}
            />
            <StatPill
              icon={<CheckCircle2 size={16} className="text-emerald-300" />}
              label="Avg Quiz"
              value={`${globalStats.avgQuiz}%`}
              sub={`${globalStats.mastered} mastered topics`}
            />
            <StatPill
              icon={<Brain size={16} className="text-violet-300" />}
              label="Cognitive"
              value={`${globalStats.optimalPct}%`}
              sub="optimal load sessions"
            />
            <StatPill
              icon={<AlertTriangle size={16} className="text-amber-300" />}
              label="Needs Work"
              value={globalStats.struggle + globalStats.neutral}
              sub={`${globalStats.struggle} struggling, ${globalStats.neutral} neutral`}
            />
          </div>

          {/* ── Per-Subject Cards ──────────────────────────────────────── */}
          {agentStats.map(stat => {
            const isExpanded = expandedAgent === stat.agent.id;
            return (
              <GlassCard key={stat.agent.id} className="!p-0 overflow-hidden transition-all">
                {/* Subject Header */}
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : stat.agent.id)}
                  className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400/30 to-violet-500/30 border border-white/20 flex items-center justify-center shadow-lg">
                      <BookOpen size={24} className="text-white" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xl font-black tracking-tight text-white">{stat.agent.subject}</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                        {stat.agent.timeframe} · {stat.completed}/{stat.total} lessons · {formatTime(stat.focusMin)} focus
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="hidden md:flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="text-xs font-black text-white/80">{stat.mastered}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="text-xs font-black text-white/80">{stat.neutral}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                        <span className="text-xs font-black text-white/80">{stat.struggle}</span>
                      </div>
                    </div>

                    {/* Coverage ring */}
                    <div className="relative w-12 h-12">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke="#818cf8" strokeWidth="3"
                          strokeDasharray={`${stat.coverage}, 100`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">{stat.coverage}%</span>
                    </div>

                    <ChevronDown size={20} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-6 md:p-8 space-y-6 animate-in slide-in-from-top-4 duration-300">

                    {/* Mastery + Cognitive Split */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Mastery Breakdown */}
                      <div className="figma-glass-blue p-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">Mastery Breakdown</h4>
                        <div className="flex items-center gap-6">
                          {stat.masteryPie.length > 0 ? (
                            <div className="w-28 h-28 flex-shrink-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={stat.masteryPie} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={4} strokeWidth={0}>
                                    {stat.masteryPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                                  </Pie>
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="w-28 h-28 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                              <Target size={24} className="text-white/20" />
                            </div>
                          )}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-emerald-400" />
                              <span className="text-sm font-black text-white">{stat.mastered} Mastered</span>
                              <span className="text-[10px] text-white/30 font-medium">(70%+)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-amber-400" />
                              <span className="text-sm font-black text-white">{stat.neutral} Neutral</span>
                              <span className="text-[10px] text-white/30 font-medium">(40-70%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-rose-400" />
                              <span className="text-sm font-black text-white">{stat.struggle} Struggle</span>
                              <span className="text-[10px] text-white/30 font-medium">(&lt;40%)</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Cognitive Load */}
                      <div className="figma-glass-blue p-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">Cognitive Load</h4>
                        <div className="flex items-center gap-6">
                          {stat.cogPie.length > 0 ? (
                            <div className="w-28 h-28 flex-shrink-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={stat.cogPie} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={4} strokeWidth={0}>
                                    {stat.cogPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                                  </Pie>
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="w-28 h-28 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                              <Brain size={24} className="text-white/20" />
                            </div>
                          )}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-emerald-400" />
                              <span className="text-sm font-black text-white">{stat.optPct}% Optimal</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-rose-400" />
                              <span className="text-sm font-black text-white">{stat.highPct}% Overloaded</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-indigo-400" />
                              <span className="text-sm font-black text-white">{stat.lowPct}% Low</span>
                            </div>
                            <p className="text-[10px] text-white/30 font-medium">{stat.cogTotal} sessions tracked</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quiz Scores Bar Chart */}
                    {stat.topicScores.length > 0 && (
                      <div className="figma-glass-blue p-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">Quiz Scores by Topic</h4>
                        <div className="h-52">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stat.topicScores} barSize={20}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="name" fontSize={9} fontWeight={700} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={55} tick={{ fill: 'rgba(255,255,255,0.4)' }} />
                              <YAxis domain={[0, 100]} fontSize={10} axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)' }} />
                              <Tooltip contentStyle={glassTooltipStyle} formatter={(value: any) => [`${value}%`, 'Score']} />
                              <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                                {stat.topicScores.map((entry, index) => (
                                  <Cell key={index} fill={entry.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Module Progress */}
                    <div className="figma-glass-blue p-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">Module Progress</h4>
                      <div className="space-y-4">
                        {stat.moduleStats.map((ms, i) => {
                          const pct = ms.total > 0 ? Math.round((ms.completed / ms.total) * 100) : 0;
                          return (
                            <div key={ms.module.id} className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/70 font-black text-sm flex-shrink-0 border border-white/10">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-bold text-white/90 truncate pr-4">{ms.module.title}</span>
                                  <span className="text-[10px] font-black text-white/40 flex-shrink-0">
                                    {ms.completed}/{ms.total} · {ms.avgScore > 0 ? `${ms.avgScore}% avg` : 'no quizzes'}
                                  </span>
                                </div>
                                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${pct}%`,
                                      background: pct === 100
                                        ? 'linear-gradient(90deg, #34d399, #6ee7b7)'
                                        : pct > 0
                                        ? 'linear-gradient(90deg, #818cf8, #a78bfa)'
                                        : 'rgba(255,255,255,0.1)'
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Revision Topics */}
                    {stat.revisions.length > 0 && (
                      <div className="figma-glass p-6" style={{ background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.03))' }}>
                        <div className="flex items-center gap-2 mb-4">
                          <RefreshCw size={16} className="text-amber-300" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-300/70">Topics Needing Review</h4>
                        </div>
                        <div className="space-y-3">
                          {stat.revisions.map((r, i) => (
                            <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${
                              r.isCompleted
                                ? 'bg-emerald-500/10 border-emerald-400/20'
                                : 'bg-white/5 border-amber-400/20'
                            }`}>
                              <div className="flex items-center gap-3">
                                {r.isCompleted
                                  ? <CheckCircle2 size={16} className="text-emerald-400" />
                                  : <AlertTriangle size={16} className="text-amber-400" />
                                }
                                <span className="text-sm font-bold text-white/90">{r.title}</span>
                              </div>
                              {r.weakConcepts.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap justify-end max-w-[50%]">
                                  {r.weakConcepts.slice(0, 3).map((c, j) => (
                                    <span key={j} className="text-[9px] font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full truncate max-w-[120px]">{c}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Stats Footer */}
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { icon: <Clock size={16} />, value: formatTime(stat.focusMin), label: 'Focus Time' },
                        { icon: <Zap size={16} />, value: `${stat.avgQuiz}%`, label: 'Avg Quiz' },
                        { icon: <TrendingUp size={16} />, value: `${stat.coverage}%`, label: 'Coverage' },
                      ].map((item, i) => (
                        <div key={i} className="text-center p-4 figma-glass-blue">
                          <div className="mx-auto w-fit text-white/40 mb-1">{item.icon}</div>
                          <p className="text-lg font-black text-white">{item.value}</p>
                          <p className="text-[9px] font-bold text-white/40 uppercase">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          QUANTUM TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'quantum' && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* Quantum Header */}
          <GlassCard className="!p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-white/20 flex items-center justify-center">
                <Atom size={24} className="text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Quantum SVM Analytics</h2>
                <p className="text-sm text-white/40 font-medium">ZZFeatureMap kernel · Hybrid classical-quantum pipeline</p>
              </div>
            </div>

            {/* Quantum Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu size={14} className="text-cyan-300" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">Pipeline</span>
                </div>
                <p className="text-xl font-black text-white">Hybrid</p>
                <p className="text-[10px] text-white/30">Classical + QSVM</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Activity size={14} className="text-violet-300" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">Sessions</span>
                </div>
                <p className="text-xl font-black text-white">{globalStats.cogTotal}</p>
                <p className="text-[10px] text-white/30">total classified</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Brain size={14} className="text-emerald-300" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">Optimal Rate</span>
                </div>
                <p className="text-xl font-black text-white">{globalStats.optimalPct}%</p>
                <p className="text-[10px] text-white/30">{globalStats.optimalCount} sessions</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className="text-rose-300" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">Overload</span>
                </div>
                <p className="text-xl font-black text-white">{globalStats.highPct}%</p>
                <p className="text-[10px] text-white/30">{globalStats.highCount} sessions</p>
              </div>
            </div>
          </GlassCard>

          {/* Cognitive Load Timeline */}
          {quantumData.allHistory.length > 0 && (
            <GlassCard blue>
              <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-1">Cognitive Load Timeline</h4>
              <p className="text-[10px] text-white/25 mb-5">QSVM classification over time — 1.0 = High Load, 0.5 = Optimal, 0.0 = Low</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={quantumData.allHistory}>
                    <defs>
                      <linearGradient id="cogGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="session" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)' }} label={{ value: 'Session #', position: 'insideBottom', offset: -5, fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} />
                    <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} fontSize={10} axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)' }} tickFormatter={(v: number) => v === 1 ? 'High' : v === 0.5 ? 'Optimal' : 'Low'} />
                    <Tooltip
                      contentStyle={glassTooltipStyle}
                      formatter={(value: any, _name: any, props: any) => [props.payload.label, `Session ${props.payload.session}`]}
                      labelFormatter={(label: any) => `${quantumData.allHistory[label - 1]?.agent || ''}`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2} fill="url(#cogGradient)" dot={{ fill: '#818cf8', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#a78bfa', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {/* ZZFeatureMap Kernel Visualization */}
          {quantumData.kernelSamples.length > 0 && (
            <GlassCard blue>
              <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-1">ZZFeatureMap Kernel Decomposition</h4>
              <p className="text-[10px] text-white/25 mb-5">Linear vs quantum interaction contributions per topic</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quantumData.kernelSamples} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="topic" fontSize={9} fontWeight={700} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={55} tick={{ fill: 'rgba(255,255,255,0.4)' }} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)' }} />
                    <Tooltip contentStyle={glassTooltipStyle} formatter={(value: any, name: string) => [value, name === 'linear' ? 'Classical' : name === 'quantum' ? 'Quantum ZZ' : 'Total']} />
                    <Bar dataKey="linear" stackId="kernel" fill="#818cf8" radius={[0, 0, 0, 0]} name="linear" />
                    <Bar dataKey="quantum" stackId="kernel" fill="#22d3ee" radius={[8, 8, 0, 0]} name="quantum" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-indigo-400" />
                  <span className="text-[10px] font-bold text-white/50">Classical (weighted sum)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-cyan-400" />
                  <span className="text-[10px] font-bold text-white/50">Quantum (sin·cos ZZ interactions)</span>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Feature Contributions Table */}
          {quantumData.featureContributions.length > 0 && (
            <GlassCard>
              <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">QSVM Feature Contributions per Topic</h4>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 pr-4">Topic</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 px-2">Time</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 px-2">Response</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 px-2">Error</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 px-2">Retries</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 px-2">Interaction</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 px-2">State</th>
                      <th className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/30 pb-3 pl-2">Conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantumData.featureContributions.slice(0, 12).map((fc, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 pr-4 font-bold text-white/80 text-xs">{fc.topic}</td>
                        <td className="py-3 px-2 text-center">
                          <ContribBar value={fc.time_spent} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <ContribBar value={fc.response_time} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <ContribBar value={fc.error_rate} color="rose" />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <ContribBar value={fc.retries} color="amber" />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <ContribBar value={fc.interaction_frequency} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                            fc.state === 'High' ? 'bg-rose-500/20 text-rose-300' :
                            fc.state === 'Optimal' ? 'bg-emerald-500/20 text-emerald-300' :
                            'bg-indigo-500/20 text-indigo-300'
                          }`}>{fc.state}</span>
                        </td>
                        <td className="py-3 pl-2 text-center text-xs font-black text-white/60">{fc.confidence}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Cognitive Load Distribution (Global) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <GlassCard blue>
              <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">Global Cognitive Distribution</h4>
              <div className="flex items-center gap-6">
                {globalStats.cogTotal > 0 ? (
                  <div className="w-32 h-32 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Optimal', value: globalStats.optimalCount, color: PIE_COLORS.optimal },
                            { name: 'High Load', value: globalStats.highCount, color: PIE_COLORS.high },
                            { name: 'Low Load', value: globalStats.lowCount, color: PIE_COLORS.low },
                          ].filter(d => d.value > 0)}
                          dataKey="value"
                          cx="50%" cy="50%"
                          innerRadius={32} outerRadius={56}
                          paddingAngle={4} strokeWidth={0}
                        >
                          {[
                            { color: PIE_COLORS.optimal },
                            { color: PIE_COLORS.high },
                            { color: PIE_COLORS.low },
                          ].filter((_, i) => [globalStats.optimalCount, globalStats.highCount, globalStats.lowCount][i] > 0)
                            .map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                    <Brain size={28} className="text-white/20" />
                  </div>
                )}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    <span className="text-sm font-black text-white">{globalStats.optimalPct}% Optimal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-400" />
                    <span className="text-sm font-black text-white">{globalStats.highPct}% Overloaded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-400" />
                    <span className="text-sm font-black text-white">{globalStats.lowPct}% Low</span>
                  </div>
                  <p className="text-[10px] text-white/30 font-medium">{globalStats.cogTotal} total QSVM classifications</p>
                </div>
              </div>
            </GlassCard>

            {/* Pipeline Explanation */}
            <GlassCard>
              <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 mb-5">Hybrid Pipeline Stages</h4>
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Classical Heuristics', desc: 'Fast-pass for extreme error_rate (>60%) or retries (>3). Confidence: 0.82-0.85', color: 'text-blue-300' },
                  { step: '02', title: 'ZZFeatureMap Encoding', desc: '5D behavioral vector → tanh normalization → non-linear sin·cos quantum interactions', color: 'text-violet-300' },
                  { step: '03', title: 'QSVM Decision', desc: 'Kernel output > 0.55 → HIGH, < -0.25 → LOW, else OPTIMAL. Confidence: 0.78-0.91', color: 'text-cyan-300' },
                  { step: '04', title: 'Explainability', desc: 'Normalized feature magnitudes → per-dimension contribution percentages', color: 'text-emerald-300' },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/50 font-black text-xs flex-shrink-0 border border-white/10 mt-0.5">
                      {s.step}
                    </div>
                    <div>
                      <p className={`text-sm font-black ${s.color}`}>{s.title}</p>
                      <p className="text-[11px] text-white/35 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

// Small contribution bar for the feature table
const ContribBar: React.FC<{ value: number; color?: 'rose' | 'amber' | 'default' }> = ({ value, color = 'default' }) => {
  const pct = Math.round(value * 100);
  const barColor = color === 'rose' ? 'bg-rose-400' : color === 'amber' ? 'bg-amber-400' : 'bg-indigo-400';
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[10px] font-bold text-white/40 w-7 text-right">{pct}%</span>
    </div>
  );
};

export default Dashboard;
