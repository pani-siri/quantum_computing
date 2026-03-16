
import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Zap, Code2, Rocket, BrainCircuit, Layout } from 'lucide-react';

const MILESTONES = [
  { day: 1, phase: 'Phase 1: Core', title: 'Scheduler Initialization', desc: 'Fix session rendering & event population.', icon: <Code2 size={16}/> },
  { day: 2, phase: 'Phase 1: Core', title: 'Data Persistence Audit', desc: 'Refine local storage & state sync.', icon: <Code2 size={16}/> },
  { day: 3, phase: 'Phase 1: Core', title: 'Telemetry Reliability', desc: 'Finalize distraction & focus listeners.', icon: <Code2 size={16}/> },
  { day: 4, phase: 'Phase 2: Intelligence', title: 'QSVM Kernel Tuning', desc: 'Adjust ZZ Feature Map math weights.', icon: <BrainCircuit size={16}/> },
  { day: 5, phase: 'Phase 2: Intelligence', title: 'QAOA Visualization', desc: 'Implement energy minimization curves.', icon: <BrainCircuit size={16}/> },
  { day: 6, phase: 'Phase 2: Intelligence', title: 'Adaptive Content Loop', desc: 'Connect load state to Gemini synthesis.', icon: <BrainCircuit size={16}/> },
  { day: 7, phase: 'Phase 3: Mastery', title: 'Library Sourcing', desc: 'Optimize Google Search grounding prompts.', icon: <Layout size={16}/> },
  { day: 8, phase: 'Phase 3: Mastery', title: 'Final Assessment Node', desc: 'Build 30-question evaluation logic.', icon: <Layout size={16}/> },
  { day: 9, phase: 'Phase 3: Mastery', title: 'Analytics Dashboard', desc: 'Populate velocity & efficiency metrics.', icon: <Layout size={16}/> },
  { day: 10, phase: 'Phase 4: Delivery', title: 'Responsive Design Audit', desc: 'Polish UI for mobile & desktop views.', icon: <Rocket size={16}/> },
  { day: 11, phase: 'Phase 4: Delivery', title: 'Edge Case Handling', desc: 'Add error boundaries & loading states.', icon: <Rocket size={16}/> },
  { day: 12, phase: 'Phase 4: Delivery', title: 'Presentation Prep', desc: 'Record demo & final architect audit.', icon: <Rocket size={16}/> },
];

const ProjectSheet: React.FC = () => {
  const [completedDays, setCompletedDays] = useState<number[]>(() => {
    const saved = localStorage.getItem('project_milestones');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      try {
        localStorage.setItem('project_milestones', '[]');
      } catch {
        // ignore
      }
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('project_milestones', JSON.stringify(completedDays));
  }, [completedDays]);

  const toggleDay = (day: number) => {
    setCompletedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const progress = Math.round((completedDays.length / MILESTONES.length) * 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[100px] rounded-full"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div>
            <h2 className="text-4xl font-black italic tracking-tighter">Project Roadmap</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2 flex items-center gap-2">
              <Zap size={14} className="text-cyan-400"/> Execution Phase: {progress < 100 ? 'In Development' : 'Launch Ready'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-6xl font-black italic text-cyan-400">{progress}%</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">Completion Progress</p>
          </div>
        </div>
        <div className="w-full bg-slate-800 h-2 rounded-full mt-10 overflow-hidden">
          <div className="bg-cyan-400 h-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MILESTONES.map((m) => {
          const isDone = completedDays.includes(m.day);
          return (
            <button 
              key={m.day} 
              onClick={() => toggleDay(m.day)}
              className={`p-6 rounded-[2.5rem] border-2 text-left transition-all flex flex-col justify-between h-48 group ${
                isDone ? 'bg-cyan-50 border-cyan-200' : 'bg-white border-slate-100 hover:border-indigo-400'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDone ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {m.icon}
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ${isDone ? 'bg-cyan-200 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>
                    Day {m.day}
                  </span>
                </div>
                <h4 className={`font-black text-sm leading-tight mb-1 ${isDone ? 'text-cyan-900' : 'text-slate-900'}`}>{m.title}</h4>
                <p className={`text-[10px] font-medium leading-relaxed ${isDone ? 'text-cyan-600' : 'text-slate-500'}`}>{m.desc}</p>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                {isDone ? <CheckCircle2 size={14} className="text-cyan-500" /> : <Circle size={14} className="text-slate-200" />}
                <span className="text-[9px] font-black uppercase tracking-widest">{isDone ? 'Milestone Built' : 'Pending Build'}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectSheet;
