
import React, { useState } from 'react';
import { User, LearningAgent } from '../types';
import { firebaseService } from '../services/firebaseService';
import { LogOut, BookOpen, Clock, CheckCircle2, Target, Edit3 } from 'lucide-react';

interface ProfileProps {
  user: User;
  agents: LearningAgent[];
  onLogout: () => void;
  onUpdateUser: (updatedUser: User) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, agents, onLogout, onUpdateUser }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: user.name });
  const [isSaving, setIsSaving] = useState(false);

  const totalFocus = agents.reduce((acc, a) => acc + (a.total_focus_time || 0), 0);
  const completedNodes = agents.reduce((acc, a) =>
    acc + a.roadmap.reduce((sum, m) => sum + m.subtopics.filter(s => s.is_completed && !s.is_review).length, 0), 0
  );
  const totalNodes = agents.reduce((acc, a) =>
    acc + a.roadmap.reduce((sum, m) => sum + m.subtopics.filter(s => !s.is_review).length, 0), 0
  );
  const quizScores = agents.flatMap(a =>
    a.roadmap.flatMap(m => m.subtopics.filter(s => s.is_completed && !s.is_review && typeof s.quiz_score === 'number').map(s => s.quiz_score!))
  );
  const avgQuiz = quizScores.length > 0 ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : 0;
  const focusHrs = Math.floor(totalFocus / 3600);
  const focusMins = Math.round((totalFocus % 3600) / 60);
  const overallProgress = agents.length > 0 ? Math.round(agents.reduce((sum, a) => sum + a.progress, 0) / agents.length) : 0;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await firebaseService.updateUser(user.uid, editData);
      onUpdateUser(updated);
      setIsEditing(false);
    } catch (err: any) {
      alert("We couldn't save your changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8 animate-in fade-in duration-500 pb-32">

      {/* ── Profile Card ─────────────────────────────────────────── */}
      <div className="figma-glass-blue p-8 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#c4b998]/[0.04] rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#8baa6e]/[0.03] rounded-full blur-[80px] -translate-x-1/4 translate-y-1/4 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Avatar */}
          <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#c4b998] to-[#a89870] flex items-center justify-center text-[#111113] text-5xl font-bold shadow-xl shadow-[#c4b998]/15 flex-shrink-0">
            {user.name[0]?.toUpperCase() || 'U'}
          </div>

          {/* Name & Info */}
          <div className="flex-1 text-center md:text-left">
            {isEditing ? (
              <div className="w-full max-w-sm space-y-4 mx-auto md:mx-0">
                <input
                  className="w-full text-center md:text-left text-2xl font-bold bg-white/[0.06] border border-white/[0.1] rounded-xl px-5 py-3 outline-none text-[#e8e4dc] placeholder:text-white/20 focus:border-[#c4b998]/40 transition-all"
                  value={editData.name}
                  onChange={e => setEditData({...editData, name: e.target.value})}
                  placeholder="Your Name"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl text-sm font-semibold disabled:opacity-50 transition-all">
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setIsEditing(false); setEditData({ name: user.name }); }} className="flex-1 py-3 bg-white/[0.04] text-white/40 border border-white/[0.08] rounded-xl text-sm font-medium hover:bg-white/[0.06] transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 justify-center md:justify-start">
                  <h2 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] tracking-tight">{user.name}</h2>
                  <button onClick={() => setIsEditing(true)} className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/25 hover:text-[#c4b998] hover:border-[#c4b998]/20 transition-all">
                    <Edit3 size={14} />
                  </button>
                </div>
                <p className="text-white/30 text-base">{user.email}</p>

                {/* Overall progress bar */}
                <div className="flex items-center gap-3 mt-4 max-w-xs mx-auto md:mx-0">
                  <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${overallProgress}%`,
                        background: overallProgress === 100 ? 'linear-gradient(90deg, #8baa6e, #a8c98a)' : 'linear-gradient(90deg, #c4b998, #d4c9a8)'
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-white/40">{overallProgress}% overall</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, label: 'Courses', value: agents.length, color: '#c4b998' },
          { icon: CheckCircle2, label: 'Completed', value: `${completedNodes}/${totalNodes}`, color: '#8baa6e' },
          { icon: Target, label: 'Avg Quiz', value: `${avgQuiz}%`, color: '#7a9ec4' },
          { icon: Clock, label: 'Focus Time', value: focusHrs > 0 ? `${focusHrs}h ${focusMins}m` : `${focusMins}m`, color: '#d4a574' },
        ].map((stat, i) => (
          <div key={i} className="figma-glass p-5 md:p-6 text-center space-y-3 hover:bg-white/[0.06] transition-all group">
            <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center transition-all group-hover:scale-110" style={{ backgroundColor: `${stat.color}12`, border: `1px solid ${stat.color}18` }}>
              <stat.icon size={22} style={{ color: stat.color }} />
            </div>
            <p className="text-2xl md:text-3xl font-bold text-[#e8e4dc]">{stat.value}</p>
            <p className="text-xs font-medium text-white/30">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Courses List ─────────────────────────────────────────── */}
      {agents.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-white/40 px-1">My Courses</h3>
          <div className="space-y-3">
            {agents.map(a => {
              const total = a.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => !s.is_review).length, 0);
              const done = a.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => s.is_completed && !s.is_review).length, 0);
              return (
                <div key={a.id} className="figma-glass p-5 md:p-6 flex items-center gap-5 hover:bg-white/[0.06] transition-all">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-base font-bold text-[#c4b998] flex-shrink-0">
                    {a.subject[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-base text-[#e8e4dc] truncate">{a.subject}</p>
                      <span className="text-sm font-semibold text-white/40 ml-3 flex-shrink-0">{a.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${a.progress}%`,
                          background: a.progress === 100 ? 'linear-gradient(90deg, #8baa6e, #a8c98a)' : 'linear-gradient(90deg, #c4b998, #d4c9a8)'
                        }}
                      />
                    </div>
                    <p className="text-xs text-white/20 mt-2">{done}/{total} lessons &middot; {a.timeframe}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Account Actions ──────────────────────────────────────── */}
      <div className="pt-3">
        <button
          onClick={onLogout}
          className="w-full py-4 rounded-xl text-sm font-medium text-white/25 bg-white/[0.02] border border-white/[0.06] hover:bg-rose-500/8 hover:text-rose-400/70 hover:border-rose-500/15 transition-all flex items-center justify-center gap-2.5"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Profile;
