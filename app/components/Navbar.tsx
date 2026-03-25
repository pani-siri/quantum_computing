import React, { useState } from 'react';
import { Home, Calendar, Zap, User as UserIcon, LogOut, BrainCircuit, Info } from 'lucide-react';
import { User } from '../types'; // Adjust typing import as necessary

interface NavbarProps {
  currentUser: User | { name: string, uid: string } | any;
  activeScreen: 'home' | 'planner' | 'stats' | 'me' | string;
  setActiveScreen: (screen: any) => void;
  setSelectedAgentId: (id: string | null) => void;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentUser, activeScreen, setActiveScreen, setSelectedAgentId, onLogout }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="hidden md:flex h-20 items-center justify-between px-8 figma-glass mx-6 mt-6 mb-8 sticky top-6 z-[100] transition-all duration-300 border border-white/20 shadow-2xl backdrop-blur-xl rounded-[2rem]">
      {/* Brand / Logo */}
      <div 
        className="flex items-center gap-4 group cursor-pointer"
        onClick={() => { setActiveScreen('home'); setSelectedAgentId(null); }}
      >
        <div className="w-12 h-12 bg-gradient-to-br from-white to-blue-50 rounded-[1.2rem] flex items-center justify-center text-[#0d62bb] shadow-lg shadow-white/20 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300 border border-white/50 relative overflow-hidden">
          <BrainCircuit size={28} className="relative z-10" />
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
        </div>
        <div className="flex flex-col">
          <span className="font-black text-2xl tracking-tighter text-white leading-none">SmartLearn</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/50 mt-1">Quantum Edition</span>
        </div>
      </div>
      
      {/* Navigation Links */}
      <nav className="flex items-center gap-10">
        {[
          { id: 'home', label: 'Subjects', icon: Home },
          { id: 'planner', label: 'Schedule', icon: Calendar },
          { id: 'stats', label: 'Velocity', icon: Zap },
          { id: 'me', label: 'Profile', icon: UserIcon },
          { id: 'about', label: 'About', icon: Info }
        ].map(n => (
          <button 
            key={n.id} 
            onClick={() => { setActiveScreen(n.id as any); setSelectedAgentId(null); }} 
            className={`group relative flex items-center gap-2.5 transition-all font-black text-[11px] uppercase tracking-widest py-2 ${activeScreen === n.id ? 'text-white' : 'text-white/60 hover:text-white'}`}
          >
            <n.icon size={16} className={`transition-transform duration-300 ${activeScreen === n.id ? 'scale-110 drop-shadow-md text-white' : 'group-hover:scale-110 group-hover:-rotate-6 text-white/60 group-hover:text-white'}`} />
            {n.label}
            {activeScreen === n.id && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-8 h-1.5 rounded-t-[4px] bg-white shadow-[0_0_10px_#fff] animate-in fade-in zoom-in duration-300"></span>
            )}
          </button>
        ))}
      </nav>
      
      {/* User Actions */}
      <div className="flex items-center gap-6 relative">
        <button 
          onClick={() => setShowDropdown(!showDropdown)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="flex items-center gap-3 bg-white/10 hover:bg-white/20 active:scale-95 px-4 py-2.5 rounded-full border border-white/20 backdrop-blur-md transition-all shadow-sm"
        >
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-[#0d62bb] text-xs shadow-md border border-white/50">
            {currentUser?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="text-[11px] font-black text-white uppercase tracking-widest pr-1">
            {currentUser?.name || 'User'}
          </span>
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <div className="absolute top-[120%] right-0 w-48 figma-glass border border-white/20 rounded-3xl p-2 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
            <button
              onClick={() => { setActiveScreen('me'); setSelectedAgentId(null); setShowDropdown(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/80 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
            >
              <UserIcon size={16} /> Profile
            </button>
            <div className="my-1 h-px w-full bg-white/10"></div>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 rounded-2xl transition-colors"
            >
              <LogOut size={16} /> Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
