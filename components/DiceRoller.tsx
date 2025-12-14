
import React, { useState } from 'react';
import { Attribute, DiceFace } from '../types';
import { DICE_FACES } from '../constants';

interface DiceRollerProps {
  attribute: Attribute;
  amount: number;
  playerClues: number;
  playerColor: string;
  playerItems: string[];
  usedItemAbilityRound?: boolean;
  target: number;
  onComplete: (finalFaces: DiceFace[], cluesSpent: number) => void;
  onConsumeItem: (item: string) => void;
  onMarkItemUsed: () => void;
  onCancel: () => void;
}

const DiceRoller: React.FC<DiceRollerProps> = ({ 
  attribute, amount, playerClues, playerColor, playerItems, usedItemAbilityRound,
  target, onComplete, onConsumeItem, onMarkItemUsed, onCancel 
}) => {
  const [results, setResults] = useState<DiceFace[] | null>(null);
  const [spentClues, setSpentClues] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [bonusDice, setBonusDice] = useState(0);

  // Passive Bonuses
  let passiveBonus = 0;
  if (attribute === Attribute.Observation && playerItems.includes("Magnifying Glass")) passiveBonus += 1;
  if (attribute === Attribute.Lore && playerItems.includes("Ancient Tome")) passiveBonus += 1;
  if (attribute === Attribute.Will && playerItems.includes("Elder Sign")) passiveBonus += 1;

  const rollDice = () => {
    setRolling(true);
    // Animate for a bit
    setTimeout(() => {
      const totalDice = amount + bonusDice + passiveBonus;
      const rolls = Array(totalDice).fill(0).map(() => {
        const idx = Math.floor(Math.random() * DICE_FACES.length);
        return DICE_FACES[idx] as DiceFace;
      });
      setResults(rolls);
      setRolling(false);
    }, 800);
  };

  const convertClue = (index: number) => {
    if (!results || spentClues >= playerClues) return;
    if (results[index] !== DiceFace.Clue) return;

    const newResults = [...results];
    newResults[index] = DiceFace.ElderSign; // Convert to pass
    setResults(newResults);
    setSpentClues(prev => prev + 1);
  };

  const passes = results ? results.filter(r => r === DiceFace.ElderSign).length : 0;
  const clues = results ? results.filter(r => r === DiceFace.Clue).length : 0;
  const isPass = passes >= target;

  // Item Logic handlers
  const hasExtraDiceItem = playerItems.includes("Lucky Cigarette Case");
  const hasSingleConvertItem = playerItems.includes("Detective's Journal");
  const hasAllConvertItem = playerItems.includes("Eldritch Glyph");
  const hasLantern = playerItems.includes("Lantern") && attribute === Attribute.Observation;
  const hasLockpick = playerItems.includes("Lockpick") && attribute === Attribute.Agility;

  const useExtraDiceItem = () => {
      setBonusDice(prev => prev + 2);
      onConsumeItem("Lucky Cigarette Case");
  };

  const useLantern = () => {
      setBonusDice(prev => prev + 3);
      onConsumeItem("Lantern");
  };

  const useLockpick = () => {
      setBonusDice(prev => prev + 3);
      onConsumeItem("Lockpick");
  };

  const useSingleConvertItem = () => {
      if (!results) return;
      const clueIdx = results.findIndex(r => r === DiceFace.Clue);
      if (clueIdx !== -1) {
          const newResults = [...results];
          newResults[clueIdx] = DiceFace.ElderSign;
          setResults(newResults);
          onMarkItemUsed(); // Mark "Once per round"
      }
  };

  const useAllConvertItem = () => {
      if (!results) return;
      const newResults = results.map(r => r === DiceFace.Clue ? DiceFace.ElderSign : r);
      setResults(newResults);
      onConsumeItem("Eldritch Glyph");
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-mythos-dark border-2 border-mythos-gold rounded-lg p-6 max-w-2xl w-full shadow-2xl relative">
        <h2 className="text-2xl font-serif text-mythos-gold mb-2 text-center">
          Test {attribute}
        </h2>
        <p className="text-center text-gray-400 mb-4 font-serif">
          Required Successes: <span className="text-white text-xl font-bold">{target}</span>
        </p>

        {!results ? (
           <div className="text-center py-10">
             <p className="mb-6 text-gray-300">
                Rolling {amount} <span className="text-blue-400 font-bold" title="Attributes"> (Base) </span>
                {passiveBonus > 0 && <span className="text-green-500 font-bold" title="Passive Items"> + {passiveBonus} </span>}
                {bonusDice > 0 && <span className="text-yellow-500 font-bold" title="Bonuses"> + {bonusDice} </span>}
                 = <span className="text-white font-bold text-xl ml-2">{amount + passiveBonus + bonusDice} Dice</span>
             </p>
             
             <div className="flex flex-col gap-2 mb-6 items-center">
                {hasExtraDiceItem && (
                    <button onClick={useExtraDiceItem} className="px-4 py-1 text-sm bg-purple-900 border border-purple-500 text-purple-200 rounded hover:bg-purple-800">
                        Use Lucky Cigarette Case (+2 Dice)
                    </button>
                )}
                {hasLantern && (
                    <button onClick={useLantern} className="px-4 py-1 text-sm bg-yellow-900 border border-yellow-500 text-yellow-200 rounded hover:bg-yellow-800">
                        Use Lantern (+3 Dice)
                    </button>
                )}
                {hasLockpick && (
                    <button onClick={useLockpick} className="px-4 py-1 text-sm bg-gray-700 border border-gray-500 text-gray-200 rounded hover:bg-gray-600">
                        Use Lockpick (+3 Dice)
                    </button>
                )}
             </div>

             <button 
               onClick={rollDice}
               disabled={rolling}
               className={`px-8 py-3 rounded text-xl font-bold transition-transform ${rolling ? 'animate-pulse bg-gray-600' : 'bg-mythos-accent hover:bg-indigo-600 hover:scale-105'}`}
               style={{ backgroundColor: rolling ? undefined : playerColor }}
             >
               {rolling ? 'ROLLING...' : 'ROLL'}
             </button>
           </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-center gap-4 py-6">
              {results.map((face, idx) => (
                <div 
                  key={idx}
                  onClick={() => convertClue(idx)}
                  className={`w-16 h-16 flex items-center justify-center rounded-lg border-2 text-2xl font-bold cursor-pointer transition-all hover:scale-110 shadow-lg select-none
                    ${face === DiceFace.ElderSign ? 'bg-green-900 border-green-500 text-green-200' : ''}
                    ${face === DiceFace.Clue ? 'bg-blue-900 border-blue-400 text-blue-200 animate-pulse' : ''}
                    ${face === DiceFace.Blank ? 'bg-gray-800 border-gray-600 text-gray-500' : ''}
                  `}
                >
                  {face === DiceFace.ElderSign && '★'}
                  {face === DiceFace.Clue && '?'}
                  {face === DiceFace.Blank && ''}
                </div>
              ))}
            </div>

            <div className="text-center space-y-2">
              <p className="text-xl">
                 Result: <span className={isPass ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                    {isPass ? "PASS" : "FAIL"}
                 </span> ({passes}/{target})
              </p>
              
              {/* Item Interactions Phase 2 */}
              <div className="flex gap-2 justify-center flex-wrap">
                  {hasSingleConvertItem && !usedItemAbilityRound && clues > 0 && (
                      <button 
                        onClick={useSingleConvertItem}
                        className="text-xs bg-indigo-900 border border-indigo-400 text-indigo-100 px-3 py-1 rounded hover:bg-indigo-800"
                      >
                          Use Detective's Journal (Convert 1)
                      </button>
                  )}
                  
                  {hasAllConvertItem && clues > 0 && (
                      <button 
                        onClick={useAllConvertItem}
                        className="text-xs bg-purple-900 border border-purple-400 text-purple-100 px-3 py-1 rounded hover:bg-purple-800"
                      >
                          Use Eldritch Glyph (Convert ALL)
                      </button>
                  )}
              </div>

              {clues > 0 && playerClues - spentClues > 0 && (
                <p className="text-sm text-blue-300">Click on '?' dice to spend a clue and convert to success.</p>
              )}
               <p className="text-sm text-gray-400">Clues Remaining: {playerClues - spentClues}</p>
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={() => onComplete(results, spentClues)}
                className="px-6 py-2 bg-mythos-gold text-white font-serif rounded hover:bg-yellow-700 uppercase tracking-widest font-bold"
              >
                Confirm Result
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiceRoller;