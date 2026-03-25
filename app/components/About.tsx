
import React from 'react';
import { BrainCircuit, Cpu, Sparkles, Zap, BookOpen, Shield, Github, Globe, ChevronRight } from 'lucide-react';

const About: React.FC = () => {
  const features = [
    {
      icon: BrainCircuit,
      title: 'AI-Powered Roadmaps',
      description: 'Our AI synthesizes personalized day-by-day study roadmaps tailored to your subject, timeframe, and learning style.',
      gradient: 'from-indigo-500 to-blue-500',
      glow: 'bg-indigo-500/20',
    },
    {
      icon: Cpu,
      title: 'Quantum ML (QSVM)',
      description: 'A Quantum Support Vector Machine classifies your cognitive load and mastery level in real-time during study sessions.',
      gradient: 'from-violet-500 to-purple-500',
      glow: 'bg-violet-500/20',
    },
    {
      icon: Zap,
      title: 'QAOA Scheduler',
      description: 'Quantum Approximate Optimization Algorithm resolves schedule conflicts and finds your optimal study timetable.',
      gradient: 'from-amber-500 to-orange-500',
      glow: 'bg-amber-500/20',
    },
    {
      icon: BookOpen,
      title: 'Adaptive Content',
      description: 'Every lesson generates notes, videos, practice problems, flashcards, and quizzes — adapting to your weak areas.',
      gradient: 'from-emerald-500 to-teal-500',
      glow: 'bg-emerald-500/20',
    },
    {
      icon: Shield,
      title: 'Smart Review System',
      description: 'Struggled on a quiz? SmartLearn injects targeted review lessons and reinforces weak concepts automatically.',
      gradient: 'from-rose-500 to-pink-500',
      glow: 'bg-rose-500/20',
    },
    {
      icon: Sparkles,
      title: 'AI Tutor Chat',
      description: 'An always-available AI tutor provides contextual help, explanations, and guidance throughout your learning journey.',
      gradient: 'from-cyan-500 to-sky-500',
      glow: 'bg-cyan-500/20',
    },
  ];

  const techStack = [
    { label: 'Frontend', items: ['React', 'TypeScript', 'Vite', 'TailwindCSS'] },
    { label: 'AI Engine', items: ['GPT-4o-mini', 'OpenRouter', 'Groq Fallback'] },
    { label: 'Quantum ML', items: ['Qiskit QSVM', 'QAOA Optimizer', 'Scikit-learn'] },
    { label: 'Backend', items: ['Express.js', 'Node.js', 'YouTube Data API'] },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-16 animate-in fade-in duration-500 pb-32 relative">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-500/10 to-transparent -z-10 rounded-[3rem] blur-3xl" />
      <div className="absolute top-40 right-10 w-72 h-72 bg-violet-500/10 blur-[120px] rounded-full -z-10 animate-float" />
      <div className="absolute bottom-40 left-10 w-56 h-56 bg-cyan-500/10 blur-[100px] rounded-full -z-10 animate-float" style={{ animationDelay: '3s' }} />

      {/* Hero Section */}
      <div className="figma-glass-blue p-10 md:p-14 rounded-[3rem] relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 blur-[120px] rounded-full translate-x-1/3 -translate-y-1/3 group-hover:translate-x-1/4 transition-transform duration-1000" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/10 blur-[80px] rounded-full -translate-x-1/3 translate-y-1/3" />

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          <div className="w-28 h-28 md:w-36 md:h-36 bg-gradient-to-br from-white to-blue-50 rounded-[2rem] flex items-center justify-center text-[#0d62bb] shadow-2xl shadow-white/20 group-hover:scale-105 group-hover:rotate-3 transition-all duration-500 border border-white/50 relative overflow-hidden shrink-0">
            <BrainCircuit size={56} className="relative z-10" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
          </div>

          <div className="text-center md:text-left space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200/70 mb-2">About SmartLearn</p>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
                Learn Smarter with <br className="hidden md:block" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-white to-violet-200">Quantum Intelligence</span>
              </h1>
            </div>
            <p className="text-white/60 font-medium text-base md:text-lg max-w-xl leading-relaxed">
              SmartLearn is an AI-powered adaptive learning platform that combines cutting-edge quantum machine learning with personalized study roadmaps to revolutionize how you learn.
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">The SmartLearn Pipeline</p>
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">How It Works</h2>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-0">
          {[
            { step: '01', title: 'Create Subject', desc: 'Define your subject, timeline & goals' },
            { step: '02', title: 'AI Roadmap', desc: 'Day-by-day modules generated by AI' },
            { step: '03', title: 'Study & Learn', desc: 'Videos, notes, quizzes & flashcards' },
            { step: '04', title: 'Quantum Adapt', desc: 'QSVM tracks mastery & adjusts path' },
          ].map((item, i) => (
            <React.Fragment key={i}>
              <div className="flex-1 figma-glass p-6 rounded-[2rem] text-center hover:-translate-y-1 hover:shadow-xl transition-all duration-300 border border-white/20 group">
                <div className="text-3xl font-black italic bg-clip-text text-transparent bg-gradient-to-br from-indigo-300 to-violet-300 mb-3 group-hover:scale-110 transition-transform">
                  {item.step}
                </div>
                <h4 className="font-black text-white text-sm mb-1">{item.title}</h4>
                <p className="text-[11px] font-medium text-white/50">{item.desc}</p>
              </div>
              {i < 3 && (
                <div className="hidden md:flex items-center px-2 text-white/20">
                  <ChevronRight size={20} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Features Grid */}
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Core Capabilities</p>
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Powered by AI & Quantum ML</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="group figma-glass p-8 rounded-[2.5rem] hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 border border-white/20 relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-32 h-32 ${f.glow} rounded-full blur-3xl -mr-10 -mt-10 opacity-50 group-hover:opacity-100 transition-opacity`} />

              <div className="relative z-10">
                <div className={`w-14 h-14 bg-gradient-to-br ${f.gradient} rounded-[1.2rem] flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 border border-white/20`}>
                  <f.icon size={24} className="text-white" />
                </div>
                <h3 className="font-black text-xl text-white mb-3">{f.title}</h3>
                <p className="text-sm font-medium text-white/50 leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div className="figma-glass p-8 md:p-12 rounded-[3rem] border border-white/20 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-indigo-500/15 to-transparent blur-3xl" />

        <div className="relative z-10 space-y-8">
          <div className="text-center space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Under The Hood</p>
            <h2 className="text-3xl font-black text-white tracking-tight">Technology Stack</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {techStack.map((group, i) => (
              <div key={i} className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  {group.label}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item, j) => (
                    <span key={j} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white/10 text-white/80 border border-white/10 hover:bg-white/20 hover:border-white/30 transition-all cursor-default">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Credits */}
      <div className="text-center space-y-6 pt-8">
        <div className="figma-glass inline-flex items-center gap-3 px-6 py-3 rounded-full border border-white/20">
          <BrainCircuit size={20} className="text-white/60" />
          <span className="font-black text-white text-sm tracking-tight">SmartLearn</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Quantum Edition</span>
        </div>
        <p className="text-white/30 text-xs font-bold">
          Built with ❤️ using React, Qiskit & AI — Transforming education through quantum intelligence.
        </p>
      </div>
    </div>
  );
};

export default About;
