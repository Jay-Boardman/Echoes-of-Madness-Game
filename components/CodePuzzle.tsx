
import React, { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
  onFail: () => void;
}

// Colors available for the code
const COLORS = [
  { id: 'r', color: '#ef4444', label: 'Red' },    // Red
  { id: 'b', color: '#3b82f6', label: 'Blue' },    // Blue
  { id: 'g', color: '#22c55e', label: 'Green' },   // Green
  { id: 'y', color: '#eab308', label: 'Yellow' },  // Yellow
  { id: 'p', color: '#a855f7', label: 'Purple' },  // Purple
  { id: 'w', color: '#f8fafc', label: 'White' }    // White/Silver
];

const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 8;

const CodePuzzle: React.FC<Props> = ({ onComplete, onFail }) => {
  const [secretCode, setSecretCode] = useState<string[]>([]);
  const [history, setHistory] = useState<{ guess: string[], feedback: { exact: number, partial: number } }[]>([]);
  const [currentGuess, setCurrentGuess] = useState<(string | null)[]>(Array(CODE_LENGTH).fill(null));
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');

  useEffect(() => {
    // Generate random secret code
    const code = [];
    for (let i = 0; i < CODE_LENGTH; i++) {
      code.push(COLORS[Math.floor(Math.random() * COLORS.length)].id);
    }
    setSecretCode(code);
    // console.log("Secret Code (Cheats):", code); 
  }, []);

  const handleColorSelect = (colorId: string) => {
    if (status !== 'playing') return;
    
    const nextIndex = currentGuess.findIndex(c => c === null);
    if (nextIndex !== -1) {
      const newGuess = [...currentGuess];
      newGuess[nextIndex] = colorId;
      setCurrentGuess(newGuess);
    }
  };

  const handleBackspace = () => {
    if (status !== 'playing') return;
    
    // Find the last filled slot
    // Since findLastIndex might not be available in all envs, iterate backwards
    let lastIndex = -1;
    for (let i = CODE_LENGTH - 1; i >= 0; i--) {
        if (currentGuess[i] !== null) {
            lastIndex = i;
            break;
        }
    }

    if (lastIndex !== -1) {
      const newGuess = [...currentGuess];
      newGuess[lastIndex] = null;
      setCurrentGuess(newGuess);
    }
  };

  const submitGuess = () => {
    if (currentGuess.includes(null)) return; // Incomplete guess
    if (status !== 'playing') return;

    const guess = currentGuess as string[];
    
    // Calculate Feedback
    // 1. Exact Matches (Green light)
    let exact = 0;
    const codeTemp = [...secretCode];
    const guessTemp = [...guess];

    // Check exacts first and mark them to avoid double counting
    for (let i = 0; i < CODE_LENGTH; i++) {
        if (guessTemp[i] === codeTemp[i]) {
            exact++;
            codeTemp[i] = 'MATCHED';
            guessTemp[i] = 'CHECKED';
        }
    }

    // 2. Partial Matches (Yellow light) - Correct color, wrong position
    let partial = 0;
    for (let i = 0; i < CODE_LENGTH; i++) {
        if (guessTemp[i] === 'CHECKED') continue;
        
        const foundIndex = codeTemp.findIndex(c => c === guessTemp[i]);
        if (foundIndex !== -1) {
            partial++;
            codeTemp[foundIndex] = 'MATCHED'; // Consume the color from code so it's not matched again
        }
    }

    const newHistory = [...history, { guess, feedback: { exact, partial } }];
    setHistory(newHistory);
    setCurrentGuess(Array(CODE_LENGTH).fill(null));

    if (exact === CODE_LENGTH) {
        setStatus('won');
        setTimeout(onComplete, 1500);
    } else if (newHistory.length >= MAX_ATTEMPTS) {
        setStatus('lost');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 font-mono">
      <div className="bg-[#1f2937] border-4 border-[#4b5563] p-6 rounded-lg shadow-2xl max-w-md w-full relative flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-200 text-center uppercase tracking-widest border-b border-gray-600 pb-2">
            Security Bypass
        </h2>
        
        {/* Status Message */}
        {status === 'lost' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col z-20">
                <div className="text-red-500 text-3xl font-bold uppercase tracking-widest mb-4">Access Denied</div>
                <button onClick={onFail} className="bg-red-900 text-white px-6 py-2 border border-red-500 hover:bg-red-800">Close</button>
            </div>
        )}
        {status === 'won' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col z-20">
                <div className="text-green-500 text-3xl font-bold uppercase tracking-widest mb-4">Access Granted</div>
            </div>
        )}

        {/* History Board */}
        <div className="bg-black/40 rounded p-2 flex flex-col gap-1 h-64 overflow-y-auto border-inner border border-gray-700">
            {Array.from({ length: MAX_ATTEMPTS }).map((_, idx) => {
                const entry = history[idx];
                return (
                    <div key={idx} className="flex items-center gap-3 border-b border-gray-800 pb-1 last:border-0">
                        <span className="text-gray-600 text-xs w-4">{idx + 1}.</span>
                        {/* Slots */}
                        <div className="flex gap-2">
                            {Array.from({ length: CODE_LENGTH }).map((__, i) => {
                                const colorId = entry?.guess[i];
                                const colorHex = COLORS.find(c => c.id === colorId)?.color || '#374151';
                                return (
                                    <div 
                                        key={i} 
                                        className="w-4 h-4 rounded-full border border-gray-600"
                                        style={{ backgroundColor: entry ? colorHex : 'transparent' }}
                                    />
                                );
                            })}
                        </div>
                        {/* Feedback */}
                        <div className="ml-auto flex gap-1 items-center bg-[#111] px-1 rounded border border-gray-800">
                            {/* Exact matches (Green dots) */}
                            {Array.from({ length: entry?.feedback.exact || 0 }).map((__, i) => (
                                <div key={`ex-${i}`} className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" title="Correct Position"></div>
                            ))}
                            {/* Partial matches (Yellow dots) */}
                            {Array.from({ length: entry?.feedback.partial || 0 }).map((__, i) => (
                                <div key={`pa-${i}`} className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_5px_#eab308]" title="Wrong Position"></div>
                            ))}
                            {/* Empty dots for remainder */}
                            {Array.from({ length: CODE_LENGTH - (entry ? (entry.feedback.exact + entry.feedback.partial) : 0) }).map((__, i) => (
                                <div key={`emp-${i}`} className="w-1.5 h-1.5 rounded-full bg-gray-800"></div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Active Input Row */}
        <div className="flex flex-col gap-2 mt-2 bg-gray-800/50 p-3 rounded border border-gray-600">
             <div className="flex justify-between items-center mb-2">
                 <span className="text-xs uppercase text-gray-400">Current Sequence:</span>
                 <div className="flex gap-2">
                     {currentGuess.map((colorId, i) => (
                         <div 
                            key={i} 
                            className={`w-6 h-6 rounded-full border-2 ${colorId ? 'border-gray-300' : 'border-dashed border-gray-500'}`}
                            style={{ backgroundColor: COLORS.find(c => c.id === colorId)?.color || 'transparent' }}
                         />
                     ))}
                 </div>
             </div>

             <div className="flex gap-2 justify-center flex-wrap">
                 {COLORS.map(c => (
                     <button
                        key={c.id}
                        onClick={() => handleColorSelect(c.id)}
                        className="w-8 h-8 rounded-full border-2 border-transparent hover:scale-110 transition-transform focus:outline-none focus:border-white shadow-lg"
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                        disabled={status !== 'playing'}
                     />
                 ))}
             </div>
             
             <div className="flex gap-2 mt-2">
                 <button 
                    onClick={handleBackspace}
                    disabled={status !== 'playing'}
                    className="flex-1 bg-gray-700 text-gray-200 text-xs py-2 rounded uppercase font-bold hover:bg-gray-600 border border-gray-500"
                 >
                    Backspace
                 </button>
                 <button 
                    onClick={submitGuess}
                    disabled={status !== 'playing' || currentGuess.includes(null)}
                    className="flex-[2] bg-green-800 text-green-100 text-xs py-2 rounded uppercase font-bold hover:bg-green-700 border border-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    Execute
                 </button>
             </div>
        </div>
        
        <button 
            onClick={onFail}
            className="self-center text-xs text-red-400 hover:text-red-300 underline uppercase tracking-wider"
        >
            Abort Hack (Fail)
        </button>

      </div>
    </div>
  );
};

export default CodePuzzle;
