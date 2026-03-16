
import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell
} from 'recharts';
import { LearningAgent, CognitiveLoadState } from '../types';
import { CheckCircle2, Zap, Clock, Sparkles, Target, BarChart3, ListChecks, GraduationCap, Brain, RefreshCw, AlertTriangle, TrendingUp } from 'lucide-react';
import ProjectSheet from './ProjectSheet';

interface DashboardProps {
  agents: LearningAgent[];
}

const Dashboard: React.FC<DashboardProps> = ({ agents }) => {
  const [view, setView] = useState<'analytics' | 'quantum' | 'roadmap'>('analytics');

  const trendData = [
    { hour: '8am', focus: 30 },
    { hour: '10am', focus: 85 },
    { hour: '12pm', focus: 45 },
    { hour: '2pm', focus: 92 },
    { hour: '4pm', focus: 75 },
    { hour: '6pm', focus: 60 },
    { hour: '8pm', focus: 95 },
  ];

  const totalFocusAll = agents.reduce((acc, a) => acc + (a.total_focus_time || 0), 0);
  const totalLessonsAll = agents.reduce((acc, a) => acc + a.roadmap.reduce((sum, m) => sum + m.subtopics.filter(s => s.is_completed).length, 0), 0);
  const totalSubtopics = agents.reduce((acc, a) => acc + a.roadmap.reduce((sum, m) => sum + m.subtopics.length, 0), 0);
  
  const coveragePercent = totalSubtopics > 0 ? Math.round((totalLessonsAll / totalSubtopics) * 100) : 0;

  const averageUnderstanding = agents.length > 0 
    ? Math.round(agents.reduce((acc, a) => {
        const loadScore = a.cognitive_history.length > 0
          ? a.cognitive_history.filter(h => h.state === CognitiveLoadState.OPTIMAL).length / a.cognitive_history.length
          : 0.8;
        return acc + (a.progress * 0.7 + loadScore * 30);
      }, 0) / agents.length)
    : 0;

  const expectedTime = totalSubtopics * 45;
  const actualTimeMinutes = totalFocusAll / 60;
  const timeEfficiency = expectedTime > 0 ? Math.min(100, Math.round((actualTimeMinutes / expectedTime) * 100)) : 100;

  // --- Quantum Cognitive Load Trend Data ---
  const cognitiveTimeline = useMemo(() => {
    const allEntries = agents.flatMap(a =>
      (a.cognitive_history || []).map(h => ({ ...h, subject: a.subject }))
    ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return allEntries.map((entry, i) => ({
      idx: i + 1,
      label: `S${i + 1}`,
      optimal: entry.state === CognitiveLoadState.OPTIMAL ? 1 : 0,
      high: entry.state === CognitiveLoadState.HIGH ? 1 : 0,
      low: entry.state === CognitiveLoadState.LOW ? 1 : 0,
      state: entry.state,
      subject: entry.subject
    }));
  }, [agents]);

  const cognitiveLoadSummary = useMemo(() => {
    const total = cognitiveTimeline.length || 1;
    return {
      optimal: Math.round((cognitiveTimeline.filter(c => c.state === CognitiveLoadState.OPTIMAL).length / total) * 100),
      high: Math.round((cognitiveTimeline.filter(c => c.state === CognitiveLoadState.HIGH).length / total) * 100),
      low: Math.round((cognitiveTimeline.filter(c => c.state === CognitiveLoadState.LOW).length / total) * 100),
      total: cognitiveTimeline.length
    };
  }, [cognitiveTimeline]);

  // --- Per-Topic Mastery Tracker ---
  const topicMastery = useMemo(() => {
    return agents.flatMap(a =>
      a.roadmap.flatMap(m =>
        m.subtopics.filter(s => s.is_completed && !s.is_review).map(s => ({
          id: s.id,
          title: s.title,
          subject: a.subject,
          quizScore: s.quiz_score,
          mastery: (s.quiz_score ?? 0) >= 70 ? 'Mastery' as const : (s.quiz_score ?? 0) >= 40 ? 'Neutral' as const : 'Struggle' as const,
          weakConcepts: s.weak_concepts || [],
          hasReview: a.roadmap.some(mod => mod.subtopics.some(sub => sub.is_review && sub.review_of === s.id))
        }))
      )
    );
  }, [agents]);

  const masteryStats = useMemo(() => ({
    mastered: topicMastery.filter(t => t.mastery === 'Mastery').length,
    neutral: topicMastery.filter(t => t.mastery === 'Neutral').length,
    struggle: topicMastery.filter(t => t.mastery === 'Struggle').length,
    total: topicMastery.length
  }), [topicMastery]);

  // --- Revision/Weak Concepts Tracker ---
  const revisionTopics = useMemo(() => {
    return agents.flatMap(a =>
      a.roadmap.flatMap(m =>
        m.subtopics.filter(s => s.is_review).map(s => ({
          id: s.id,
          title: s.title,
          reviewOf: s.review_of,
          originalTitle: m.subtopics.find(sub => sub.id === s.review_of)?.title || s.title.replace('Review: ', ''),
          weakConcepts: s.weak_concepts || [],
          isCompleted: s.is_completed,
          subject: a.subject
        }))
      )
    );
  }, [agents]);

  // --- Mastery trend for bar chart ---
  const masteryBarData = useMemo(() => {
    return topicMastery.slice(-10).map((t) => ({
      name: t.title.length > 15 ? t.title.slice(0, 15) + '...' : t.title,
      score: t.quizScore ?? 0,
      fill: (t.quizScore ?? 0) >= 70 ? '#10b981' : (t.quizScore ?? 0) >= 40 ? '#f59e0b' : '#ef4444'
    }));
  }, [topicMastery]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-32">
      {/* View Switcher */}
      <div className="flex figma-glass p-1.5 rounded-3xl w-full max-w-sm mx-auto mb-6 shadow-sm border-white/20">
        <button
          onClick={() => setView('analytics')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 ${view === 'analytics' ? 'bg-white shadow-md text-[#0d62bb]' : 'text-white/50 hover:text-white/80'}`}
        >
          <GraduationCap size={14}/> Analytics
        </button>
        <button
          onClick={() => setView('quantum')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 ${view === 'quantum' ? 'bg-white shadow-md text-[#0d62bb]' : 'text-white/50 hover:text-white/80'}`}
        >
          <Brain size={14}/> Quantum
        </button>
        <button
          onClick={() => setView('roadmap')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 ${view === 'roadmap' ? 'bg-white shadow-md text-[#0d62bb]' : 'text-white/50 hover:text-white/80'}`}
        >
          <ListChecks size={14}/> Sheet
        </button>
      </div>

      {view === 'roadmap' ? (
        <ProjectSheet />
      ) : view === 'quantum' ? (
        <>
          {/* Quantum Cognitive Load Header */}
          <div className="bg-slate-900 bg-mesh p-10 md:p-14 rounded-[3rem] text-white shadow-2xl relative overflow-hidden animate-float">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/20 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/20 blur-[100px] rounded-full -translate-x-1/3 translate-y-1/3"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="text-center md:text-left">
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter flex items-center gap-3 drop-shadow-lg">
                  <Brain size={40} className="text-violet-400" /> Quantum Tracker
                </h2>
                <p className="text-violet-200/80 text-[10px] font-black uppercase tracking-widest mt-3">
                  Cognitive Load + Mastery Engine
                </p>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-4xl font-black italic text-violet-400">{cognitiveLoadSummary.total}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#0d62bb] mt-1">QSVM Sessions</p>
                </div>
                <div className="w-px h-12 bg-white/20 self-center"></div>
                <div className="text-center">
                  <p className="text-4xl font-black italic text-emerald-400">{cognitiveLoadSummary.optimal}%</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#0d62bb] mt-1">Optimal Load</p>
                </div>
                <div className="w-px h-12 bg-white/20 self-center"></div>
                <div className="text-center">
                  <p className="text-4xl font-black italic text-rose-400">{cognitiveLoadSummary.high}%</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#0d62bb] mt-1">High Load</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cognitive Load Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="figma-glass hover:-translate-y-1 transition-transform duration-300 p-8 rounded-[2.5rem] space-y-4">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 border border-emerald-400/30">
                <CheckCircle2 size={28} />
              </div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50">Mastered</h4>
              <p className="text-4xl font-black text-white">{masteryStats.mastered}</p>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-full" style={{ width: `${masteryStats.total > 0 ? (masteryStats.mastered / masteryStats.total) * 100 : 0}%` }}></div>
              </div>
              <p className="text-[10px] font-bold text-white/50">Quiz score 70%+ confirmed</p>
            </div>

            <div className="figma-glass hover:-translate-y-1 transition-transform duration-300 p-8 rounded-[2.5rem] space-y-4">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/30 border border-amber-400/30">
                <TrendingUp size={28} />
              </div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50">Neutral</h4>
              <p className="text-4xl font-black text-white">{masteryStats.neutral}</p>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-full" style={{ width: `${masteryStats.total > 0 ? (masteryStats.neutral / masteryStats.total) * 100 : 0}%` }}></div>
              </div>
              <p className="text-[10px] font-bold text-white/50">Quiz 40-70% — needs practice</p>
            </div>

            <div className="figma-glass hover:-translate-y-1 transition-transform duration-300 p-8 rounded-[2.5rem] space-y-4">
              <div className="w-14 h-14 bg-gradient-to-br from-rose-400 to-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-500/30 border border-rose-400/30">
                <AlertTriangle size={28} />
              </div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50">Struggle</h4>
              <p className="text-4xl font-black text-white">{masteryStats.struggle}</p>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-rose-400 to-rose-500 h-full" style={{ width: `${masteryStats.total > 0 ? (masteryStats.struggle / masteryStats.total) * 100 : 0}%` }}></div>
              </div>
              <p className="text-[10px] font-bold text-white/50">Learning targeted for review</p>
            </div>
          </div>

          {/* Charts Row: Cognitive Load Timeline + Mastery Scores */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
            {/* QSVM Cognitive Load Timeline */}
            <div className="glass-card hover:shadow-md transition-shadow p-10 rounded-[3rem]">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Cognitive Load</h3>
                <div className="p-2 bg-violet-50 rounded-xl">
                  <Brain size={20} className="text-violet-500"/>
                </div>
              </div>
              {cognitiveTimeline.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cognitiveTimeline} barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                      <YAxis hide />
                      <Tooltip
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', padding: '16px', fontWeight: 'bold' }}
                        formatter={(_: any, name: string) => [name === 'optimal' ? 'Optimal' : name === 'high' ? 'High Load' : 'Low Load', 'State']}
                        labelFormatter={(label: string) => {
                          const entry = cognitiveTimeline.find(c => c.label === label);
                          return entry ? `${entry.subject} — Session ${entry.idx}` : label;
                        }}
                      />
                      <Bar dataKey="optimal" stackId="a" fill="#10b981" radius={[8, 8, 8, 8]} name="Optimal" />
                      <Bar dataKey="high" stackId="a" fill="#ef4444" radius={[8, 8, 8, 8]} name="High Load" />
                      <Bar dataKey="low" stackId="a" fill="#6366f1" radius={[8, 8, 8, 8]} name="Low Load" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
                  <Brain size={32} className="opacity-20" />
                  <p className="text-xs font-bold italic">Complete sessions to track cognitive load.</p>
                </div>
              )}
            </div>

            {/* Mastery Quiz Score Bar Chart */}
            <div className="glass-card hover:shadow-md transition-shadow p-10 rounded-[3rem]">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Topic Mastery</h3>
                <div className="p-2 bg-emerald-50 rounded-xl">
                  <Target size={20} className="text-emerald-500"/>
                </div>
              </div>
              {masteryBarData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={masteryBarData} barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" fontSize={9} fontWeight="bold" axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} />
                      <YAxis domain={[0, 100]} fontSize={10} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }}
                        formatter={(value: any) => [`${value}%`, 'Quiz Score']}
                      />
                      <Bar dataKey="score" radius={[12, 12, 0, 0]}>
                        {masteryBarData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <p className="text-xs font-bold text-slate-400 italic">Complete quizzes to track mastery scores.</p>
                </div>
              )}
            </div>
          </div>

          {/* Revision Tracker + Per-Topic Mastery List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Revision Topics */}
            <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Revision Tracker</h3>
                <RefreshCw size={18} className="text-amber-400"/>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {revisionTopics.length === 0 ? (
                  <div className="py-12 text-center space-y-4">
                    <CheckCircle2 size={40} className="mx-auto text-slate-200" />
                    <p className="text-xs font-bold text-slate-400 italic max-w-[200px] mx-auto">No revision topics yet. They appear when quiz scores drop below 40%.</p>
                  </div>
                ) : (
                  revisionTopics.map(r => (
                    <div key={r.id} className={`p-5 rounded-2xl border transition-all ${r.isCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-amber-200'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${r.isCompleted ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {r.isCompleted ? 'Reviewed' : 'Pending Review'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">{r.subject}</span>
                      </div>
                      <h5 className="font-black text-sm mt-2">{r.originalTitle}</h5>
                      {r.weakConcepts.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {r.weakConcepts.slice(0, 4).map((c, i) => (
                            <span key={i} className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{c.length > 40 ? c.slice(0, 40) + '...' : c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Per-Topic Mastery Detail */}
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Per-Topic Mastery</h3>
                <GraduationCap size={18} className="text-indigo-400"/>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {topicMastery.length === 0 ? (
                  <div className="py-12 text-center space-y-4">
                    <Target size={40} className="mx-auto text-slate-200" />
                    <p className="text-xs font-bold text-slate-400 italic max-w-[200px] mx-auto">Complete topics with quizzes to see mastery classification.</p>
                  </div>
                ) : (
                  topicMastery.map(t => (
                    <div key={t.id} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-all">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${t.mastery === 'Mastery' ? 'bg-emerald-500' : t.mastery === 'Neutral' ? 'bg-amber-400' : 'bg-rose-500'}`}></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black truncate">{t.title}</p>
                        <p className="text-[9px] font-bold text-slate-400">{t.subject}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs font-black ${t.mastery === 'Mastery' ? 'text-emerald-600' : t.mastery === 'Neutral' ? 'text-amber-600' : 'text-rose-600'}`}>
                          {typeof t.quizScore === 'number' ? `${t.quizScore}%` : '—'}
                        </span>
                        {t.hasReview && <RefreshCw size={12} className="text-amber-400" />}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Header Stat Board */}
          <div className="p-10 md:p-14 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden animate-float border border-white/10 bg-white/5 backdrop-blur-md">
             <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-500 to-fuchsia-500 opacity-20 blur-[100px] rounded-full translate-x-1/3 -translate-y-1/3"></div>
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/20 blur-[80px] rounded-full -translate-x-1/2 translate-y-1/2"></div>
             
             <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                <div className="text-center md:text-left">
                   <h2 className="text-4xl md:text-5xl font-black tracking-tighter drop-shadow-md">Academic Status</h2>
                   <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full mt-4 border border-white/10">
                     <Zap size={14} className="text-amber-400"/> 
                     <span className="text-[10px] font-black uppercase tracking-widest">Optimized Neural Flow</span>
                   </div>
                </div>
                <div className="flex gap-8 items-center bg-black/20 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 shadow-inner">
                   <div className="text-center">
                      <p className="text-5xl font-black bg-gradient-to-br from-indigo-300 to-indigo-500 bg-clip-text text-transparent">{coveragePercent}%</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200/70 mt-2">Coverage</p>
                   </div>
                   <div className="w-px h-16 bg-white/10"></div>
                   <div className="text-center">
                      <p className="text-5xl font-black bg-gradient-to-br from-emerald-300 to-emerald-500 bg-clip-text text-transparent">{averageUnderstanding}%</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200/70 mt-2">Mastery</p>
                   </div>
                </div>
             </div>
          </div>

          {/* Main Analysis Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
             <div className="figma-glass hover:-translate-y-1 transition-transform p-8 rounded-[2.5rem] space-y-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 border border-indigo-400/30">
                   <Target size={28} />
                </div>
                <div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50">Nodes Covered</h4>
                   <p className="text-3xl font-black mt-2 text-white">{totalLessonsAll} <span className="text-lg text-white/50">/ {totalSubtopics}</span></p>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                   <div className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-full" style={{ width: `${coveragePercent}%` }}></div>
                </div>
             </div>

             <div className="figma-glass hover:-translate-y-1 transition-transform p-8 rounded-[2.5rem] space-y-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 border border-emerald-400/30">
                   <CheckCircle2 size={28} />
                </div>
                <div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50">Understanding</h4>
                   <p className="text-3xl font-black mt-2 text-white">{averageUnderstanding}%</p>
                </div>
                <p className="text-[10px] font-bold text-white/50">Based on mastery nodes</p>
             </div>

             <div className="figma-glass hover:-translate-y-1 transition-transform p-8 rounded-[2.5rem] space-y-4">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/30 border border-amber-400/30">
                   <Clock size={28} />
                </div>
                <div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50">Pacing</h4>
                   <p className="text-3xl font-black mt-2 text-white">{timeEfficiency}%</p>
                </div>
                <p className="text-[10px] font-bold text-white/50">Actual vs targeted velocity</p>
             </div>

             <div className="bg-gradient-to-br from-[#0d62bb]/50 to-indigo-900/50 p-8 rounded-[2.5rem] text-white shadow-xl shadow-black/10 space-y-4 hover:-translate-y-1 transition-transform border border-white/20 backdrop-blur-md">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
                   <Sparkles size={28} />
                </div>
                <div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-2">Neural Suggestion</h4>
                   <p className="text-base font-bold leading-relaxed text-white">
                     {coveragePercent < 50 
                       ? "Prioritize absolute foundational nodes next to build momentum." 
                       : averageUnderstanding < 70 
                       ? "Switch to 'Practical' mode to boost intuition." 
                       : "Excellent pacing. Try elective nodes."}
                   </p>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="figma-glass p-10 rounded-[3rem] shadow-sm">
               <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xs font-black uppercase text-white/50 tracking-widest">Focus Persistence</h3>
                  <BarChart3 size={18} className="text-white/30"/>
               </div>
               <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff1a" />
                        <XAxis dataKey="hour" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} tick={{fill: '#ffffff80'}}/>
                        <YAxis hide />
                        <Tooltip 
                           contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px', backgroundColor: '#0f172a', color: '#fff'}}
                           itemStyle={{fontWeight: '900', color: '#818cf8'}}
                        />
                        <Area type="monotone" dataKey="focus" stroke="#818cf8" strokeWidth={4} fill="url(#colorFocus)" />
                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="figma-glass p-10 rounded-[3rem] flex flex-col gap-6">
               <h3 className="text-xs font-black uppercase text-white/50 tracking-widest">Optimization Path</h3>
               <div className="space-y-4">
                  {agents.length === 0 ? (
                    <div className="py-12 text-center space-y-4">
                       <Target size={40} className="mx-auto text-white/20" />
                       <p className="text-xs font-bold text-white/50 italic max-w-[200px] mx-auto">Generate roadmaps to unlock insights.</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-6 bg-white/10 rounded-3xl border border-white/20 shadow-sm group">
                        <div className="flex items-center gap-4 mb-2">
                           <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                           <span className="text-[10px] font-black uppercase text-indigo-300">Retention</span>
                        </div>
                        <p className="text-sm font-bold text-white leading-snug">"Peak performance detected in morning intervals. Schedule complex labs between 9am-11am."</p>
                      </div>
                      <div className="p-6 bg-white/10 rounded-3xl border border-white/20 shadow-sm group">
                        <div className="flex items-center gap-4 mb-2">
                           <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                           <span className="text-[10px] font-black uppercase text-emerald-300">Focus</span>
                        </div>
                        <p className="text-sm font-bold text-white leading-snug">"Distraction dropped when using visual materials. Prioritize Video Hub content."</p>
                      </div>
                    </>
                  )}
               </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
