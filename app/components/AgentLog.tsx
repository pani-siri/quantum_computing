
import React from 'react';
import { Terminal, Cpu, Zap, Calendar, UserCheck } from 'lucide-react';
// Fix: Removed .ts extension and correctly imported AgentStatus from types
import { AgentStatus } from '../types';

interface Props {
  agents: AgentStatus[];
}

const AgentLog: React.FC<Props> = ({ agents }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[400px]">
      <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-indigo-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">Multi-Agent Neural Bus</h3>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[10px]">
        {agents.map((agent) => (
          <div key={agent.id} className="group">
            <div className="flex items-center gap-3 mb-1">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                agent.status === 'processing' ? 'bg-indigo-500/20 text-indigo-400' :
                agent.status === 'optimizing' ? 'bg-cyan-500/20 text-cyan-400' :
                agent.status === 'negotiating' ? 'bg-amber-500/20 text-amber-400' :
                'bg-slate-700 text-slate-400'
              }`}>
                {agent.status}
              </span>
              <span className="text-slate-500 font-bold">{agent.name}</span>
            </div>
            <div className="pl-4 border-l border-slate-800 text-slate-400 group-hover:text-slate-200 transition-colors">
              <span className="text-indigo-500 mr-2">➜</span>
              {agent.lastAction}
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 italic">
            <Cpu size={32} className="mb-2 opacity-20" />
            Waiting for agent initialization...
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentLog;
