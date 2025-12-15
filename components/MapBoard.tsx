
import React, { useState, useRef } from 'react';
import { Tile, Token, TokenType, Player, Monster } from '../types';

interface Props {
  tiles: Tile[];
  tokens: Token[];
  players: Player[];
  monsters?: Monster[];
  onTokenClick: (token: Token) => void;
  onTileClick: (tile: Tile) => void;
  onMonsterClick?: (monster: Monster) => void;
  currentPlayerId: string;
}

const TILE_SIZE = 140; 
const WALL_THICKNESS = 8; // Thicker walls

const MapBoard: React.FC<Props> = ({ tiles, tokens, players, monsters = [], onTokenClick, onTileClick, onMonsterClick, currentPlayerId }) => {
  // Pan & Zoom State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Handle empty tiles case gracefully to avoid Math.min on empty array returning Infinity
  const minX = tiles.length > 0 ? Math.min(...tiles.map(t => t.x)) : 0;
  const minY = tiles.length > 0 ? Math.min(...tiles.map(t => t.y)) : 0;
  
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const scaleFactor = 0.001;
    const newScale = Math.min(Math.max(0.4, transform.scale - e.deltaY * scaleFactor), 3);
    setTransform(prev => ({ ...prev, scale: newScale }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const currentPlayer = players.find(p => p.id === currentPlayerId);
  const getNeighbor = (x: number, y: number) => tiles.find(t => t.x === x && t.y === y);

  // Render a wall or door on a specific edge
  const renderEdge = (tile: Tile, dir: 'N'|'S'|'E'|'W') => {
    let nx = tile.x;
    let ny = tile.y;
    
    if (dir === 'N') ny--;
    if (dir === 'S') ny++;
    if (dir === 'E') nx++;
    if (dir === 'W') nx--;

    const neighbor = getNeighbor(nx, ny);

    // If connected to same room, no wall
    if (neighbor && neighbor.roomId === tile.roomId) return null;

    // Check for Door
    // Door logic: Token must exist at this tile facing this direction, OR at neighbor facing opposite
    const doorToken = tokens.find(t => 
       t.type === TokenType.Explore && (
         (t.x === tile.x && t.y === tile.y && t.direction === (dir === 'N' ? 'North' : dir === 'S' ? 'South' : dir === 'E' ? 'East' : 'West')) ||
         (neighbor && t.x === neighbor.x && t.y === neighbor.y && t.direction === (dir === 'N' ? 'South' : dir === 'S' ? 'North' : dir === 'E' ? 'West' : 'East'))
       )
    );

    const wallColor = '#1a1a1a';
    const wallBorder = '1px solid #4a4a4a';
    const offset = -WALL_THICKNESS / 2;

    if (doorToken) {
        // Render Door + Partial Walls (Jambs) to create "gap" effect
        const isOpen = doorToken.resolved;
        const doorLength = '40%'; 
        const wallLength = '30%';

        return (
            <React.Fragment key={`edge-${dir}-${tile.id}`}>
                {/* Wall Segment 1 */}
                <div style={{
                    position: 'absolute',
                    backgroundColor: wallColor,
                    border: wallBorder,
                    zIndex: 20,
                    ...(dir === 'N' || dir === 'S' ? {
                        height: WALL_THICKNESS,
                        width: wallLength,
                        top: dir === 'N' ? offset : undefined,
                        bottom: dir === 'S' ? offset : undefined,
                        left: offset
                    } : {
                        width: WALL_THICKNESS,
                        height: wallLength,
                        left: dir === 'W' ? offset : undefined,
                        right: dir === 'E' ? offset : undefined,
                        top: offset
                    })
                }} />

                {/* Wall Segment 2 */}
                <div style={{
                    position: 'absolute',
                    backgroundColor: wallColor,
                    border: wallBorder,
                    zIndex: 20,
                    ...(dir === 'N' || dir === 'S' ? {
                        height: WALL_THICKNESS,
                        width: wallLength,
                        top: dir === 'N' ? offset : undefined,
                        bottom: dir === 'S' ? offset : undefined,
                        right: offset
                    } : {
                        width: WALL_THICKNESS,
                        height: wallLength,
                        left: dir === 'W' ? offset : undefined,
                        right: dir === 'E' ? offset : undefined,
                        bottom: offset
                    })
                }} />

                {/* Door Element */}
                <div 
                    onClick={(e) => { e.stopPropagation(); onTokenClick(doorToken); }}
                    className={`absolute z-30 flex items-center justify-center cursor-pointer transition-all hover:scale-110 group`}
                    style={{
                        ...(dir === 'N' || dir === 'S' ? {
                            height: WALL_THICKNESS * 2,
                            width: doorLength,
                            top: dir === 'N' ? -WALL_THICKNESS : undefined,
                            bottom: dir === 'S' ? -WALL_THICKNESS : undefined,
                            left: '50%',
                            transform: 'translateX(-50%)'
                        } : {
                            width: WALL_THICKNESS * 2,
                            height: doorLength,
                            left: dir === 'W' ? -WALL_THICKNESS : undefined,
                            right: dir === 'E' ? -WALL_THICKNESS : undefined,
                            top: '50%',
                            transform: 'translateY(-50%)'
                        }),
                        backgroundColor: isOpen ? 'transparent' : '#5d4037',
                        border: isOpen ? '2px dashed #444' : '2px solid #2a1b15',
                        boxShadow: isOpen ? 'none' : '0 2px 5px rgba(0,0,0,0.8)'
                    }}
                    title={isOpen ? "Open Door" : "Closed Door"}
                >
                    {!isOpen && <div className="w-1.5 h-1.5 rounded-full bg-yellow-600 group-hover:bg-yellow-400 shadow-sm"></div>}
                </div>
            </React.Fragment>
        );
    }

    // Render Full Solid Wall
    return (
        <div style={{ 
            position: 'absolute', 
            backgroundColor: wallColor,
            border: wallBorder, 
            zIndex: 20,
            ...(dir === 'N' ? { top: offset, left: offset, right: offset, height: WALL_THICKNESS } :
              dir === 'S' ? { bottom: offset, left: offset, right: offset, height: WALL_THICKNESS } :
              dir === 'W' ? { left: offset, top: offset, bottom: offset, width: WALL_THICKNESS } :
                            { right: offset, top: offset, bottom: offset, width: WALL_THICKNESS })
        }} />
    );
  };

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full bg-[#0a0a0c] relative overflow-hidden flex items-center justify-center ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }}>
      </div>

      <div 
        style={{ 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          position: 'absolute'
        }}
      >
        {tiles.map(tile => {
          const left = (tile.x - minX) * TILE_SIZE;
          const top = (tile.y - minY) * TILE_SIZE;
          const isAdjacent = currentPlayer && (Math.abs(currentPlayer.x - tile.x) + Math.abs(currentPlayer.y - tile.y) === 1);
          
          const tilePlayers = players.filter(p => p.x === tile.x && p.y === tile.y);
          // Only show interactable tokens (Explore tokens are handled in renderEdge, except specific cases, but mostly Search/Interact/Escape/Sight)
          const tileTokens = tokens.filter(t => t.x === tile.x && t.y === tile.y && !t.resolved && t.type !== TokenType.Explore);
          const tileMonsters = monsters.filter(m => m.x === tile.x && m.y === tile.y);

          // Calculate background stitching based on room properties
          const roomW = (tile.roomWidth || 1) * TILE_SIZE;
          const roomH = (tile.roomHeight || 1) * TILE_SIZE;
          const roomOffsetX = ((tile.x - (tile.roomX || 0)) * TILE_SIZE);
          const roomOffsetY = ((tile.y - (tile.roomY || 0)) * TILE_SIZE);

          const tileStyle: React.CSSProperties = {
              width: TILE_SIZE, 
              height: TILE_SIZE, 
              left, 
              top,
              backgroundColor: '#2a1b15', // Fallback color
              backgroundImage: tile.roomImage ? `url("${tile.roomImage}")` : 'none',
              backgroundSize: `${roomW}px ${roomH}px`,
              backgroundPosition: `-${roomOffsetX}px -${roomOffsetY}px`,
              backgroundRepeat: 'no-repeat'
          };

          return (
            <div
              key={tile.id}
              onClick={(e) => { if (!isDragging) { e.stopPropagation(); onTileClick(tile); } }}
              className="absolute shadow-lg transition-colors duration-200"
              style={tileStyle}
            >
               {/* Walls */}
               {renderEdge(tile, 'N')}
               {renderEdge(tile, 'S')}
               {renderEdge(tile, 'E')}
               {renderEdge(tile, 'W')}
              
               {/* Room Label */}
               <div className="absolute top-1 left-1 opacity-50 text-[8px] uppercase tracking-wider text-white pointer-events-none z-10 font-sans bg-black/50 px-1 rounded">
                   {tile.name}
               </div>

               {/* Content Layer */}
               <div className="absolute inset-0 pointer-events-none z-20">
                   
                   {/* PLAYERS - Center */}
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center justify-center">
                       {tilePlayers.map((player, i) => (
                           <div 
                             key={player.id} 
                             className="relative transition-transform hover:scale-125"
                             style={{ marginLeft: i > 0 ? '-20px' : 0 }} // Stack overlap
                           >
                               <div 
                                 className="w-12 h-12 rounded-full border-2 border-white shadow-xl overflow-hidden relative pointer-events-auto"
                                 style={{ backgroundColor: player.color }}
                                 title={player.name}
                               >
                                   {player.image && <img src={player.image} className="w-full h-full object-cover opacity-90" alt={player.name} />}
                               </div>
                           </div>
                       ))}
                   </div>

                   {/* TOKENS - Corners */}
                   {tileTokens.map((token, i) => {
                       // Cycle corners: TL, TR, BL, BR
                       const cornerClass = [
                           'top-2 left-2',
                           'top-2 right-2',
                           'bottom-2 left-2',
                           'bottom-2 right-2'
                       ][i % 4];

                       return (
                           <div 
                             key={token.id} 
                             onClick={(e) => { e.stopPropagation(); onTokenClick(token); }}
                             className={`absolute ${cornerClass} pointer-events-auto cursor-pointer animate-pulse hover:scale-110 transition-transform z-40`}
                           >
                               {token.type === TokenType.Escape ? (
                                   <span className="text-3xl drop-shadow-md" title="Escape!">🏃</span>
                               ) : (
                                   <div className="w-8 h-8 rounded-full bg-yellow-500 border-2 border-white text-black font-bold flex items-center justify-center text-sm shadow-[0_0_10px_rgba(234,179,8,0.6)]">?</div>
                               )}
                           </div>
                       );
                   })}

                   {/* MONSTERS - Edges */}
                   {tileMonsters.map((monster, i) => {
                       // Cycle edges: Top, Bottom, Left, Right
                       let posStyle: React.CSSProperties = {};
                       const mod = i % 4;
                       if (mod === 0) posStyle = { top: '-6px', left: '50%', transform: 'translateX(-50%)' }; // Top Center
                       if (mod === 1) posStyle = { bottom: '-6px', left: '50%', transform: 'translateX(-50%)' }; // Bottom Center
                       if (mod === 2) posStyle = { top: '50%', left: '-6px', transform: 'translateY(-50%)' }; // Left Center
                       if (mod === 3) posStyle = { top: '50%', right: '-6px', transform: 'translateY(-50%)' }; // Right Center

                       return (
                           <div 
                             key={monster.id}
                             onClick={(e) => { e.stopPropagation(); if(onMonsterClick) onMonsterClick(monster); }}
                             className="absolute pointer-events-auto cursor-pointer z-40 hover:scale-110 transition-transform"
                             style={posStyle}
                           >
                               <div className="w-12 h-12 relative">
                                   <div className="absolute inset-0 bg-red-900/40 rounded-full opacity-50 animate-ping"></div>
                                   <img src={monster.image} className="w-full h-full rounded-full border-2 border-red-600 object-cover shadow-lg relative z-10 bg-black" alt="Monster" />
                                   {/* Health Pip */}
                                   <div className="absolute -bottom-1 -right-1 bg-black text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-900 z-20">
                                       {monster.health}
                                   </div>
                               </div>
                           </div>
                       );
                   })}

               </div>
               
               {/* Selection Highlight */}
               {isAdjacent && (
                   <div className="absolute inset-0 border-2 border-white/30 bg-white/5 pointer-events-none z-10 animate-pulse"></div>
               )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MapBoard;
