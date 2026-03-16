
import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  question: string;
  answer: string;
}

const ModuleFlashcard: React.FC<Props> = ({ question, answer }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div 
      className="perspective-1000 w-full h-48 cursor-pointer group"
      onClick={() => setFlipped(!flipped)}
    >
      <div className={`relative w-full h-full transition-all duration-500 preserve-3d ${flipped ? 'rotate-y-180' : ''}`}>
        {/* Front */}
        <div className="absolute inset-0 backface-hidden bg-white border-2 border-slate-100 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm group-hover:border-indigo-200 transition-colors">
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-4 flex items-center gap-2">
            <RefreshCw size={12} /> Active Recall Question
          </span>
          <p className="text-lg font-black text-slate-800 leading-tight">{question}</p>
        </div>

        {/* Back */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-xl text-white">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">Neural Feedback</span>
          <p className="text-lg font-bold leading-tight">{answer}</p>
        </div>
      </div>
    </div>
  );
};

export default ModuleFlashcard;
