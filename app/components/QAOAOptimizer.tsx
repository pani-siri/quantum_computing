
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  optimizationSteps: { step: number; energy: number }[];
}

const QAOAOptimizer: React.FC<Props> = ({ optimizationSteps }) => {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl text-white">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse"></span>
            QAOA Optimization Engine
          </h3>
          <p className="text-slate-400 text-sm">Minimizing scheduling conflicts via quantum approximate optimization</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono text-cyan-400">STATE: OPTIMIZING</span>
        </div>
      </div>
      
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={optimizationSteps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="step" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
              itemStyle={{ color: '#22d3ee' }}
            />
            <Line 
              type="monotone" 
              dataKey="energy" 
              stroke="#22d3ee" 
              strokeWidth={2} 
              dot={false}
              animationDuration={2000}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="p-3 bg-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase">Qubits Active</div>
          <div className="text-lg font-bold text-slate-200">24</div>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase">Conflict Score</div>
          <div className="text-lg font-bold text-emerald-400">0.002</div>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase">Convergence</div>
          <div className="text-lg font-bold text-cyan-400">98.4%</div>
        </div>
      </div>
    </div>
  );
};

export default QAOAOptimizer;
