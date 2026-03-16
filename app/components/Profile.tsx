
import React, { useState } from 'react';
import { User, LearningAgent } from '../types';
import { firebaseService } from '../services/firebaseService';

interface ProfileProps {
  user: User;
  agents: LearningAgent[];
  onLogout: () => void;
  onUpdateUser: (updatedUser: User) => void;
  gmailConnected: boolean;
  gmailLastSyncAt: string | null;
  onConnectGmail: () => Promise<void>;
  onImportGmailTasks: () => Promise<void>;
  onDisconnectGmail: () => Promise<void>;
}

const Profile: React.FC<ProfileProps> = ({ user, agents, onLogout, onUpdateUser, gmailConnected, gmailLastSyncAt, onConnectGmail, onImportGmailTasks, onDisconnectGmail }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: user.name,
    education_level: user.education_level,
    career_goals: user.career_goals,
    preferred_language: user.preferred_language
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isMailBusy, setIsMailBusy] = useState(false);

  const totalFocus = agents.reduce((acc, a) => acc + (a.total_focus_time || 0), 0);
  const completedNodes = agents.reduce((acc, a) => 
    acc + a.roadmap.reduce((sum, m) => sum + m.subtopics.filter(s => s.is_completed).length, 0), 0
  );

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
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500 pb-32">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 figma-glass p-10 rounded-[3rem] shadow-2xl relative overflow-hidden animate-float border border-white/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2"></div>
        
        <div className="relative z-10 w-32 h-32 bg-white/20 backdrop-blur-md border border-white/30 shadow-inner rounded-full flex items-center justify-center text-white text-5xl font-black italic">
          {user.name[0]}
        </div>
        <div className="relative z-10 flex-1 text-center md:text-left space-y-2">
          {isEditing ? (
            <input 
              className="text-4xl font-black bg-transparent border-b-2 border-white/50 outline-none w-full text-white placeholder:text-white/30"
              value={editData.name}
              onChange={e => setEditData({...editData, name: e.target.value})}
            />
          ) : (
            <h2 className="text-4xl md:text-5xl font-black drop-shadow-md text-white">{user.name}</h2>
          )}
          <p className="text-white/80 font-bold uppercase tracking-widest text-xs flex items-center justify-center md:justify-start gap-2">
            <span className="px-2 py-0.5 bg-white/10 rounded-full border border-white/10">{user.education_level}</span>
            <span className="text-white/50">•</span>
            <span className="px-2 py-0.5 bg-white/10 rounded-full border border-white/10">Learning in {user.preferred_language}</span>
          </p>
        </div>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="relative z-10 px-6 py-3 bg-white/10 border border-white/20 hover:bg-white hover:text-[#0d62bb] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg backdrop-blur-md">
            Edit Profile
          </button>
        )}
      </div>

      <div className="figma-glass rounded-[3rem] p-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white">Email Tasks</h3>
            <p className="text-xs font-bold text-white/50 leading-relaxed max-w-md">Connect Gmail to automatically extract and prioritize upcoming deadlines into your SmartLearn schedule.</p>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-sm border ${gmailConnected ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30' : 'bg-white/10 text-white/70 border-white/20'}`}>
            {gmailConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        {gmailLastSyncAt && (
          <p className="text-[10px] font-bold text-white/40">Last sync: {new Date(gmailLastSyncAt).toLocaleString()}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          {!gmailConnected ? (
            <button
              disabled={isMailBusy}
              onClick={async () => {
                setIsMailBusy(true);
                try {
                  await onConnectGmail();
                } finally {
                  setIsMailBusy(false);
                }
              }}
              className="flex-1 py-4 bg-white text-[#0d62bb] rounded-xl font-black uppercase tracking-widest hover:bg-slate-50 shadow-lg disabled:opacity-50 transition-colors"
            >
              Connect Gmail
            </button>
          ) : (
            <>
              <button
                disabled={isMailBusy}
                onClick={async () => {
                  setIsMailBusy(true);
                  try {
                    await onImportGmailTasks();
                  } catch (err: any) {
                    alert(err?.message || "We couldn't import tasks from Gmail. Please try again.");
                  } finally {
                    setIsMailBusy(false);
                  }
                }}
                className="flex-1 py-4 bg-white text-[#0d62bb] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-black/20 hover:scale-[1.02] disabled:opacity-50 transition-all border border-transparent hover:border-white/20"
              >
                Import Tasks Now
              </button>
              <button
                disabled={isMailBusy}
                onClick={async () => {
                  setIsMailBusy(true);
                  try {
                    await onDisconnectGmail();
                  } catch (err: any) {
                    alert(err?.message || "We couldn't disconnect Gmail. Please try again.");
                  } finally {
                    setIsMailBusy(false);
                  }
                }}
                className="flex-1 py-4 bg-transparent text-white/80 border border-white/30 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white hover:scale-[1.02] disabled:opacity-50 transition-all"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gradient-to-br from-[#0d62bb]/50 to-indigo-900/50 p-10 rounded-[3rem] text-white shadow-xl shadow-black/10 space-y-6 hover:-translate-y-1 transition-transform duration-300 border border-white/20 backdrop-blur-md">
          <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200">Study Stats</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-4xl font-black italic">{Math.floor(totalFocus / 60)}<span className="text-xl">m</span></p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">Focus Time</p>
            </div>
            <div>
              <p className="text-4xl font-black italic">{completedNodes}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">Lessons Done</p>
            </div>
          </div>
        </div>

        <div className="figma-glass border border-white/20 hover:-translate-y-1 transition-transform duration-300 p-10 rounded-[3rem] space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-white/50">Your Goals</h3>
          {isEditing ? (
            <textarea 
              className="w-full bg-white/10 backdrop-blur-md border border-white/30 rounded-2xl p-5 outline-none font-bold text-sm min-h-[100px] text-white placeholder:text-white/40 focus:border-white transition-colors shadow-inner"
              value={editData.career_goals}
              onChange={e => setEditData({...editData, career_goals: e.target.value})}
              placeholder="What do you want to achieve?"
            />
          ) : (
            <p className="font-bold text-white/80 italic leading-relaxed text-lg">"{user.career_goals || 'No goals set yet.'}"</p>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="flex gap-4">
          <button onClick={handleSave} disabled={isSaving} className="flex-1 py-4 bg-white text-[#0d62bb] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-black/20 transition-all border border-transparent hover:border-white/20">Save Changes</button>
          <button onClick={() => setIsEditing(false)} className="flex-1 py-4 bg-transparent text-white/80 border border-white/30 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all">Cancel</button>
        </div>
      )}

      <div className="space-y-6">
        <h3 className="text-2xl font-black text-white">My Subjects</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {agents.map(a => (
            <div key={a.id} className="p-8 figma-glass border border-white/20 rounded-[2rem] flex items-center justify-between group hover:shadow-md hover:bg-white/10 transition-all duration-300">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center font-black text-white/50 group-hover:bg-white group-hover:text-[#0d62bb] transition-all duration-300 shadow-sm border border-white/20">{a.subject[0]}</div>
                <div>
                  <p className="font-black text-lg text-white group-hover:text-white/90 transition-colors">{a.subject}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#0d62bb] mt-1">{a.progress}% Completed</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <button onClick={onLogout} className="w-full py-5 border-2 border-rose-400/50 bg-rose-500/10 backdrop-blur-md text-rose-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 hover:border-rose-400 hover:text-rose-200 transition-all shadow-lg">Log Out</button>
    </div>
  );
};

export default Profile;
