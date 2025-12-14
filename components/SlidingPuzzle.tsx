
import React, { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
  onFail: () => void;
}

const SlidingPuzzle: React.FC<Props> = ({ onComplete, onFail }) => {
  // 0 represents empty space
  // Solved state: [1, 2, 3, 4, 5, 6, 7, 8, 0]
  const [grid, setGrid] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    // Generate a solvable puzzle by making random moves from solved state
    let state = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    let emptyIdx = 8;
    const previousMoves: number[] = [];
    
    // Simulate 50 random valid moves to shuffle
    for (let i = 0; i < 50; i++) {
      const neighbors = [];
      if (emptyIdx % 3 > 0) neighbors.push(emptyIdx - 1); // Left
      if (emptyIdx % 3 < 2) neighbors.push(emptyIdx + 1); // Right
      if (emptyIdx >= 3) neighbors.push(emptyIdx - 3);    // Up
      if (emptyIdx < 6) neighbors.push(emptyIdx + 3);     // Down
      
      // Don't undo immediate last move to ensure good shuffling
      const valid = neighbors.filter(n => n !== previousMoves[previousMoves.length - 1]);
      const next = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : neighbors[0];
      
      // Swap
      [state[emptyIdx], state[next]] = [state[next], state[emptyIdx]];
      emptyIdx = next;
      previousMoves.push(emptyIdx);
    }
    setGrid(state);
  }, []);

  const handleTileClick = (index: number) => {
    if (solved) return;
    
    const emptyIdx = grid.indexOf(0);
    const isAdjacent = 
      (Math.abs(index - emptyIdx) === 1 && Math.floor(index / 3) === Math.floor(emptyIdx / 3)) || // Horizontal
      (Math.abs(index - emptyIdx) === 3); // Vertical

    if (isAdjacent) {
      const newGrid = [...grid];
      [newGrid[index], newGrid[emptyIdx]] = [newGrid[emptyIdx], newGrid[index]];
      setGrid(newGrid);
      setMoves(m => m + 1);
      checkWin(newGrid);
    }
  };

  const checkWin = (currentGrid: number[]) => {
    const winState = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const isWin = currentGrid.every((val, idx) => val === winState[idx]);
    if (isWin) {
      setSolved(true);
      setTimeout(onComplete, 1000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2a1b15] border-4 border-[#8b6b4b] p-8 rounded-lg shadow-2xl max-w-md w-full relative">
        <h2 className="text-2xl font-serif text-[#e8dfc5] mb-2 text-center uppercase tracking-widest border-b border-[#5c4033] pb-2">
          Mechanical Lock
        </h2>
        <p className="text-[#8b6b4b] text-center mb-6 italic text-sm">
          "Slide the gears into alignment to bypass the mechanism."
        </p>

        <div className="grid grid-cols-3 gap-2 bg-[#1a0f0a] p-2 border-2 border-[#5c4033] rounded mx-auto w-64 h-64">
          {grid.map((num, i) => (
            <div
              key={i}
              onClick={() => handleTileClick(i)}
              className={`
                flex items-center justify-center text-2xl font-bold rounded cursor-pointer transition-all duration-200
                ${num === 0 ? 'bg-transparent' : 'bg-[#e8dfc5] text-[#2a1b15] shadow-inner border border-[#bfa68a] hover:bg-[#fff8e1]'}
                ${solved && num !== 0 ? 'bg-green-200 border-green-500' : ''}
              `}
            >
              {num !== 0 && num}
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-between items-center">
            <button 
              onClick={onFail}
              className="px-4 py-2 text-red-400 hover:text-red-300 uppercase text-xs font-bold tracking-widest"
            >
              Forfeit (Fail)
            </button>
            <div className="text-[#8b6b4b] font-serif">Moves: {moves}</div>
        </div>
      </div>
    </div>
  );
};

export default SlidingPuzzle;
