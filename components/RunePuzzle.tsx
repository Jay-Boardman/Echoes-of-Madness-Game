
import React, { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
  onFail: () => void;
}

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ'];

const RunePuzzle: React.FC<Props> = ({ onComplete, onFail }) => {
  const [cards, setCards] = useState<{id: number, rune: string, flipped: boolean, matched: boolean}[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matches, setMatches] = useState(0);
  const [locked, setLocked] = useState(false); // Prevent clicking while checking

  useEffect(() => {
    // Create pairs and shuffle
    const deck = [...RUNES, ...RUNES]
      .sort(() => Math.random() - 0.5)
      .map((rune, i) => ({
        id: i,
        rune,
        flipped: false,
        matched: false
      }));
    setCards(deck);
  }, []);

  const handleCardClick = (index: number) => {
    if (locked || cards[index].flipped || cards[index].matched) return;

    const newCards = [...cards];
    newCards[index].flipped = true;
    setCards(newCards);

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      setLocked(true);
      checkForMatch(newFlipped, newCards);
    }
  };

  const checkForMatch = (indices: number[], currentCards: any[]) => {
    const [idx1, idx2] = indices;
    if (currentCards[idx1].rune === currentCards[idx2].rune) {
      // Match!
      setTimeout(() => {
        const newCards = [...currentCards];
        newCards[idx1].matched = true;
        newCards[idx2].matched = true;
        setCards(newCards);
        setFlippedIndices([]);
        setLocked(false);
        setMatches(m => {
            const next = m + 1;
            if (next === RUNES.length) {
                setTimeout(onComplete, 800);
            }
            return next;
        });
      }, 500);
    } else {
      // No Match
      setTimeout(() => {
        const newCards = [...currentCards];
        newCards[idx1].flipped = false;
        newCards[idx2].flipped = false;
        setCards(newCards);
        setFlippedIndices([]);
        setLocked(false);
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] border-4 border-[#4f46e5] p-8 rounded-full shadow-[0_0_50px_rgba(79,70,229,0.3)] max-w-lg w-full relative aspect-square flex flex-col items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-indigo-500/30 animate-pulse"></div>
        
        <h2 className="text-2xl font-serif text-indigo-300 mb-6 text-center uppercase tracking-widest drop-shadow-lg">
          Arcane Wards
        </h2>

        <div className="grid grid-cols-4 gap-3 w-64 h-64">
          {cards.map((card, i) => (
            <div
              key={i}
              onClick={() => handleCardClick(i)}
              className={`
                flex items-center justify-center text-3xl font-bold rounded cursor-pointer transition-all duration-300 transform perspective-1000
                ${card.flipped || card.matched ? 'bg-indigo-900 text-indigo-100 rotate-y-180' : 'bg-[#2a2a40] text-transparent hover:bg-[#3a3a50]'}
                ${card.matched ? 'opacity-50 border border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : ''}
              `}
              style={{
                  boxShadow: card.flipped ? '0 0 10px #4f46e5' : 'inset 0 0 10px rgba(0,0,0,0.5)'
              }}
            >
              {(card.flipped || card.matched) ? card.rune : ''}
            </div>
          ))}
        </div>

        <button 
            onClick={onFail}
            className="mt-8 px-6 py-2 text-indigo-400 hover:text-white uppercase text-xs font-bold tracking-widest border border-transparent hover:border-indigo-500/50 rounded transition-all"
        >
            Break Concentration (Fail)
        </button>
      </div>
    </div>
  );
};

export default RunePuzzle;
