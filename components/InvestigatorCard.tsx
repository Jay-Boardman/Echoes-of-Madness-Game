
import React, { useState } from 'react';
import { Player, Attribute } from '../types';
import { INVESTIGATOR_TEMPLATES, ITEMS } from '../constants';

interface Props {
  player: Player;
  isActive: boolean;
  onSelect?: () => void;
  onUseItem?: (item: string) => void;
  compact?: boolean;
}

const InvestigatorCard: React.FC<Props> = ({ player, isActive, onSelect, onUseItem, compact = false }) => {
  const [revealSecret, setRevealSecret] = useState(false);
  const template = INVESTIGATOR_TEMPLATES.find(t => t.id === player.investigatorId);
  const investigatorName = template ? template.name : "Investigator";
  const imageUrl = player.image || template?.image;

  return (
    <div 
      onClick={onSelect}
      className={`
        bg-[#e8dfc5] border-2 rounded-sm p-4 transition-all relative overflow-hidden group
        ${isActive ? 'border-mythos-gold shadow-[0_0_15px_rgba(180,83,9,0.4)] scale-[1.02]' : 'border-[#8b6b4b] opacity-90'}
        ${onSelect ? 'cursor-pointer hover:brightness-105' : ''}
        ${player.isWounded ? 'bg-red-50/20' : ''}
      `}
    >
      {/* Background Texture Effect */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/paper.png')] opacity-40 pointer-events-none mix-blend-multiply"></div>
      
      {/* Wounded Overlay Effect */}
      {player.isWounded && (
         <div className="absolute inset-0 pointer-events-none border-4 border-red-900/30 z-20 animate-pulse">
             <div className="absolute top-0 right-0 bg-red-900 text-white text-[10px] px-2 py-1 font-bold uppercase">Wounded</div>
         </div>
      )}

      <div className="flex justify-between items-start mb-3 relative z-10">
         <div className="flex gap-3">
             {/* Portrait */}
             {imageUrl && (
                 <div className="w-12 h-12 rounded border border-[#5c4033] bg-gray-300 overflow-hidden shadow-sm shrink-0 relative">
                     <img src={imageUrl} alt={player.name} className={`w-full h-full object-cover ${player.isInsane ? 'grayscale contrast-125' : ''}`} />
                     {player.isInsane && <div className="absolute inset-0 bg-purple-900/30 mix-blend-overlay"></div>}
                 </div>
             )}
             <div>
                <h3 className="font-serif text-lg font-bold text-[#2b1d0e] tracking-wide leading-none">{player.name}</h3>
                {!compact && <p className="text-xs text-[#8b6b4b] uppercase tracking-widest mt-1">{investigatorName}</p>}
             </div>
         </div>
         <div className="w-4 h-4 rounded-full shadow-sm border border-[#5c4033]" style={{ backgroundColor: player.color }}></div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4 relative z-10">
        <div className={`bg-[#d4c5b0] p-1.5 rounded-sm border border-[#bfa68a] text-center flex flex-col justify-center shadow-inner ${player.isWounded ? 'border-red-500 bg-red-100/50' : ''}`}>
          <span className="block text-[10px] uppercase text-[#8b3a3a] tracking-wider font-bold">Health</span>
          <span className={`font-serif text-lg font-bold ${player.isWounded ? 'text-red-800' : 'text-[#4a2c2c]'}`}>
            {player.health}
          </span>
        </div>
        <div className={`bg-[#d4c5b0] p-1.5 rounded-sm border border-[#bfa68a] text-center flex flex-col justify-center shadow-inner ${player.isInsane ? 'border-purple-800 bg-purple-900' : ''}`}>
          <span className={`block text-[10px] uppercase tracking-wider font-bold ${player.isInsane ? 'text-purple-200' : 'text-[#3a5a8b]'}`}>Sanity</span>
          {player.isInsane ? (
              <span className="font-serif text-sm font-bold text-white uppercase animate-pulse">INSANE</span>
          ) : (
              <span className="font-serif text-lg font-bold text-[#2c3a4a]">{player.sanity}</span>
          )}
        </div>
      </div>

      {!compact && (
        <>
          {/* Secret Objective Reveal */}
          {player.isInsane && player.secretObjective && (
              <div className="mb-4 relative z-20">
                  <div 
                    onClick={(e) => { e.stopPropagation(); setRevealSecret(!revealSecret); }}
                    className={`
                        cursor-pointer border-2 border-dashed border-purple-900 p-2 rounded text-center
                        ${revealSecret ? 'bg-black text-white' : 'bg-purple-100 text-purple-900 hover:bg-purple-200'}
                    `}
                  >
                      <p className="text-[10px] uppercase font-bold mb-1 tracking-widest">
                          {revealSecret ? "Secret Objective" : "Tap to Reveal Secret"}
                      </p>
                      {revealSecret && (
                          <p className="text-sm font-serif italic text-purple-200">
                              "{player.secretObjective}"
                          </p>
                      )}
                  </div>
              </div>
          )}

          <div className="grid grid-cols-3 gap-1 mb-4 relative z-10">
            {Object.entries(player.attributes).map(([attr, value]) => (
              <div key={attr} className="text-center bg-[#dacbb6] rounded-sm p-1 border border-[#c9b8a0]">
                <span className="block text-[9px] uppercase text-[#5c4033] mb-0.5 font-bold">{attr.slice(0,3)}</span>
                <span className="font-bold text-[#2b1d0e] font-serif">{value}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-[#bfa68a] pt-3 mt-2 relative z-10">
            <p className="text-[10px] uppercase text-[#5c4033] mb-2 tracking-wider font-bold">Inventory</p>
            <div className="flex flex-wrap gap-2">
              {player.items.map((itemKey, i) => {
                const itemDef = ITEMS[itemKey];
                const desc = itemDef ? itemDef.description : "Unknown item";
                const isWeapon = itemDef?.type === 'Weapon';
                const isConsumable = itemKey === "First Aid Kit";

                return (
                  <span 
                    key={i} 
                    title={`${itemKey}: ${desc}`}
                    onClick={(e) => { 
                        if (isConsumable && onUseItem) { 
                            e.stopPropagation(); 
                            onUseItem(itemKey); 
                        } 
                    }}
                    className={`
                      text-xs px-2 py-1 rounded-sm border shadow-sm font-serif italic cursor-help flex items-center gap-1
                      ${isWeapon ? 'bg-red-50 text-red-900 border-red-200' : 'bg-[#f3e9d2] text-[#3d2b1f] border-[#d1c2a5]'}
                      ${isConsumable ? 'hover:bg-green-100 cursor-pointer border-green-300' : ''}
                    `}
                  >
                    {itemDef?.type === 'Weapon' && '⚔️ '}
                    {isConsumable && '✚ '}
                    {itemKey}
                  </span>
                );
              })}
              {player.items.length === 0 && <span className="text-xs text-[#7d6e5f] italic">Empty handed</span>}
            </div>
          </div>
           
           <div className="mt-3 flex items-center justify-between relative z-10 bg-[#dacbb6] p-2 rounded-sm border border-[#c9b8a0]">
              <span className="text-xs text-[#5c4033] uppercase font-bold">Clues</span>
              <div className="flex gap-1.5">
                {Array.from({length: Math.max(player.clues, 0)}).map((_, i) => (
                  <span key={i} className="w-3 h-3 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 border border-yellow-800 shadow-sm block" title="Clue Token"></span>
                ))}
                {player.clues === 0 && <span className="text-[10px] text-[#7d6e5f]">None</span>}
              </div>
           </div>
        </>
      )}
    </div>
  );
};

export default InvestigatorCard;