import React, { useState, useEffect, useRef } from 'react';
import { 
  GameState, GamePhase, Player, Investigator, Attribute, 
  Tile, Token, TokenType, DiceFace, Monster, NetworkMode, PuzzleType, ActionContext
} from './types';
import { 
  INVESTIGATOR_TEMPLATES, ITEMS, STARTING_ITEMS, DICE_FACES, MONSTER_TEMPLATES, generateRoomImage 
} from './constants';
import * as GeminiService from './services/gemini';

// Components
import DiceRoller from './components/DiceRoller';
import MapBoard from './components/MapBoard';
import InvestigatorCard from './components/InvestigatorCard';
import SlidingPuzzle from './components/SlidingPuzzle';
import RunePuzzle from './components/RunePuzzle';
import CodePuzzle from './components/CodePuzzle';

// Declare PeerJS global
declare const Peer: any;

const PEER_PREFIX = 'echoes-madness-v1-';

const App: React.FC = () => {
  // --- State ---
  const [gameState, setGameState] = useState<GameState>({
    roomCode: '',
    phase: GamePhase.Lobby,
    difficulty: 'Normal',
    round: 0,
    players: [],
    monsters: [],
    currentPlayerIndex: 0,
    tiles: [],
    tokens: [],
    itemDeck: [], 
    log: [],
    storyContext: '',
    evidenceCollected: 0,
    evidenceRequired: 5,
    isEscapeOpen: false,
    networkMode: NetworkMode.Offline
  });

  // Local Settings
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [connectedClientsCount, setConnectedClientsCount] = useState(0);

  // Networking Refs
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); // For Host: list of client connections
  const clientConnRef = useRef<any>(null);  // For Client: connection to host
  
  // State Ref to prevent stale closures in async logic
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Handler Ref to prevent stale closures in PeerJS callbacks
  const handleNetworkDataRef = useRef<(data: any) => void>(() => {});

  // Temp state for Lobby/Setup
  const [lobbyName, setLobbyName] = useState('');
  const [joinCode, setJoinCode] = useState(''); // New input for joining
  const [isHostTab, setIsHostTab] = useState(true); // Toggle between Host/Join
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [previewInvId, setPreviewInvId] = useState<string | null>(null); 
  const [playerColor, setPlayerColor] = useState('#b45309');
  const [loading, setLoading] = useState(false);
  const [showTitleScreen, setShowTitleScreen] = useState(true);
  
  // Item Distribution State
  const [distributionItems, setDistributionItems] = useState<string[]>([]);
  const [selectedDistItem, setSelectedDistItem] = useState<number | null>(null);
  
  // --- Native Audio Logic ---
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    if (!narrationEnabled) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    const preferredVoice = voices.find(v => v.name.includes("Google UK English Male")) 
                        || voices.find(v => v.lang === "en-GB" && v.name.includes("Male"))
                        || voices.find(v => v.lang === "en-GB");

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.pitch = 0.7; 
    utterance.rate = 0.85; 

    window.speechSynthesis.speak(utterance);
  };

  const addLog = (msg: string, narrate = true) => {
    setGameState(prev => ({
      ...prev,
      log: [...prev.log, msg].slice(-50) // Keep log size manageable for network sync
    }));
    if (narrate) {
        speak(msg);
    }
  };

  useEffect(() => {
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
    }
    // Cleanup peer on unmount
    return () => {
        if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // --- Networking Logic ---

  // Host: Broadcast state changes to all clients
  useEffect(() => {
      if (gameState.networkMode === NetworkMode.Host && connectionsRef.current.length > 0) {
          // SANITIZE STATE BEFORE SENDING
          // Ensure log isn't too huge and no weird non-serializable objects slipped in
          const safeState = {
              ...gameState,
              log: gameState.log.slice(-50) // Truncate log history for network performance
          };
          
          const syncData = { type: 'SYNC', state: safeState };
          
          connectionsRef.current.forEach(conn => {
              if (conn.open) {
                  try {
                      conn.send(syncData);
                  } catch (e) {
                      console.error("Failed to sync state to client:", e);
                  }
              }
          });
      }
  }, [gameState]);

  const initHost = () => {
      if (peerRef.current) return; // Prevent double init
      setLoading(true);

      // Generate a short code for display
      const displayCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      // Use a prefixed ID for PeerJS to avoid collisions
      const peerId = PEER_PREFIX + displayCode;
      
      console.log("Initializing Host with ID:", peerId);

      const peer = new Peer(peerId, {
          debug: 1
      });
      
      peer.on('open', (id: string) => {
          console.log("Host Peer Open. ID:", id);
          setGameState(prev => ({ ...prev, roomCode: displayCode, networkMode: NetworkMode.Host }));
          setShowTitleScreen(false);
          setLoading(false);
          addLog(`Room Created! Share Code: ${displayCode}`, false);
      });

      peer.on('connection', (conn: any) => {
          console.log("Host received connection from:", conn.peer);
          connectionsRef.current.push(conn);
          setConnectedClientsCount(prev => prev + 1);
          
          conn.on('open', () => {
              console.log("Host connection fully opened with", conn.peer);
              // Send immediate sync using REF to ensure fresh state
              try {
                  conn.send({ type: 'SYNC', state: gameStateRef.current });
              } catch (e) {
                  console.error("Failed to send initial sync:", e);
              }
          });
          
          conn.on('data', (data: any) => {
              // Call the ref, which points to the fresh handleNetworkData from current render
              if (handleNetworkDataRef.current) {
                  handleNetworkDataRef.current(data);
              }
          });

          conn.on('close', () => {
              console.log("Connection closed");
              setConnectedClientsCount(prev => Math.max(0, prev - 1));
              connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          });

          conn.on('error', (err: any) => {
              console.error("Connection error:", err);
          });
      });

      peer.on('error', (err: any) => {
          console.error("Peer error:", err);
          setLoading(false);
          alert("Network Error: " + err.type);
      });

      peerRef.current = peer;
  };

  const initClient = () => {
      // Force cleanup of previous attempts to allow retrying code
      if (peerRef.current) {
          console.log("Cleaning up previous peer instance...");
          peerRef.current.destroy();
          peerRef.current = null;
      }
      
      if (!joinCode) {
          alert("Please enter a Room Code.");
          return;
      }

      setLoading(true);
      
      const peer = new Peer(undefined, {
          debug: 1
      }); 
      const targetPeerId = PEER_PREFIX + joinCode.toUpperCase();
      
      console.log("Initializing Client. Connecting to:", targetPeerId);

      peer.on('open', () => {
          console.log("Client Peer Open. ID:", peer.id);
          // Standard connection
          const conn = peer.connect(targetPeerId);
          clientConnRef.current = conn;
          
          conn.on('open', () => {
              console.log("Client connected to Host");
              setGameState(prev => ({ ...prev, roomCode: joinCode, networkMode: NetworkMode.Client }));
              setShowTitleScreen(false);
              setLoading(false);
              addLog("Connected to Host!", false);
          });

          conn.on('data', (data: any) => {
              if (data.type === 'SYNC') {
                  // Client receives authoritative state from Host
                  setGameState(data.state);
              }
          });

          conn.on('error', (err: any) => {
             console.error("Client Connection Error:", err);
             setLoading(false);
             alert("Connection Error: " + err);
          });
          
          conn.on('close', () => {
              alert("Disconnected from host.");
              resetGame();
          });
      });
      
      peer.on('error', (err: any) => {
          console.error("Client Peer Error:", err);
          setLoading(false);
          if (err.type === 'peer-unavailable') {
              alert("Room not found. Check the code and try again.");
          } else {
              alert("Network Error: " + err.type);
          }
          // Cleanup on error to allow retry
          if (peerRef.current) {
              peerRef.current.destroy();
              peerRef.current = null;
          }
      });
      
      peerRef.current = peer;
  };

  // Host handles incoming actions from Clients
  const handleNetworkData = (data: any) => {
      const currentState = gameStateRef.current;
      
      // Auto-parse if string (fallback for serialization mismatches)
      if (typeof data === 'string') {
          try {
              data = JSON.parse(data);
          } catch (e) {
              console.error("Failed to parse incoming network data:", e);
              return;
          }
      }

      console.log("Handling Network Action:", data.type, data.payload);

      if (currentState.networkMode !== NetworkMode.Host) {
          return;
      }

      if (data.type === 'ACTION_REGISTER_PLAYER') {
          const newPlayer = data.payload;
          
          // STRICT VALIDATION: Ensure payload is valid before state update
          if (!newPlayer || !newPlayer.id || !newPlayer.name) {
              console.error("Invalid Register Payload:", newPlayer);
              return;
          }

          setGameState(prev => {
              const existsIndex = prev.players.findIndex(p => p.id === newPlayer.id);
              let updatedPlayers = [...prev.players];
              
              if (existsIndex !== -1) {
                  console.log("Updating existing player:", newPlayer.name);
                  updatedPlayers[existsIndex] = newPlayer;
              } else {
                  console.log("Registering New Player:", newPlayer.name);
                  updatedPlayers.push(newPlayer);
              }

              return {
                  ...prev,
                  players: updatedPlayers,
                  log: [...prev.log, `${newPlayer.name} has joined the roster.`].slice(-50)
              };
          });
          speak(`${newPlayer.name} has joined the roster.`);
      }
      else if (data.type === 'ACTION_PLAYER_READY') {
          setGameState(prev => ({
              ...prev,
              players: prev.players.map(p => 
                  p.id === data.payload.playerId ? { ...p, isReady: data.payload.isReady } : p
              )
          }));
      }
      else if (data.type === 'ACTION_TILE_CLICK') {
          const tile = currentState.tiles.find(t => t.id === data.payload.tileId);
          if(tile) handleTileClick(tile, true);
      }
      else if (data.type === 'ACTION_TOKEN_CLICK') {
          const token = currentState.tokens.find(t => t.id === data.payload.tokenId);
          if(token) handleTokenClick(token, true);
      }
      else if (data.type === 'ACTION_MONSTER_CLICK') {
          const monster = currentState.monsters.find(m => m.id === data.payload.monsterId);
          if(monster) handleMonsterClick(monster, true);
      }
      else if (data.type === 'ACTION_END_TURN') {
          endTurn(true);
      }
      else if (data.type === 'ACTION_USE_ITEM') {
          handleUseItem(data.payload.item, true); 
      }
      else if (data.type === 'ACTION_COMPLETE_TASK') {
          handleActionComplete(data.payload.context, data.payload.success, data.payload.data);
      }
  };

  // Keep ref updated with latest handler on every render
  useEffect(() => {
      handleNetworkDataRef.current = handleNetworkData;
  });

  // Generic Action Sender for Clients
  const sendAction = (type: string, payload: any) => {
      if (clientConnRef.current && clientConnRef.current.open) {
          console.log("Sending Action:", type, payload);
          try {
              clientConnRef.current.send({ type, payload });
          } catch (e) {
              console.error("Failed to send action:", e);
              alert("Transmission failed. Reconnecting...");
          }
      } else {
          console.warn("Cannot send action, connection not open.");
          alert("Connection lost. Please rejoin.");
      }
  };

  // --- Logic Helpers ---

  const formatRoomName = (name: string) => {
    if (name.toLowerCase().startsWith('the ')) return name;
    return `The ${name}`;
  };

  const createRoom = () => {
    // Only used for Local/Host init now
    if (isHostTab) {
        initHost();
    } else {
        initClient();
    }
  };

  const resetGame = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (peerRef.current) peerRef.current.destroy();
    peerRef.current = null;
    connectionsRef.current = [];
    clientConnRef.current = null;

    setGameState({
      roomCode: '',
      phase: GamePhase.Lobby,
      difficulty: 'Normal',
      round: 0,
      players: [],
      monsters: [],
      currentPlayerIndex: 0,
      tiles: [],
      tokens: [],
      itemDeck: [],
      log: [],
      storyContext: '',
      evidenceCollected: 0,
      evidenceRequired: 5, 
      isEscapeOpen: false,
      networkMode: NetworkMode.Offline
    });
    setLobbyName('');
    setSelectedInvId(null);
    setPreviewInvId(null);
    setDistributionItems([]);
    setSelectedDistItem(null);
    setLoading(false);
    setShowTitleScreen(true);
    setMyPlayerId(null);
    setConnectedClientsCount(0);
  };

  const joinGame = () => {
    if(!selectedInvId || !lobbyName) return;

    const template = INVESTIGATOR_TEMPLATES.find(t => t.id === selectedInvId)!;
    
    // Ensure Client IDs are unique
    let uniqueId = myPlayerId;
    if (!uniqueId) {
        uniqueId = gameState.networkMode === NetworkMode.Client 
            ? `p_${Date.now()}_${Math.floor(Math.random()*1000)}` 
            : `p_host_${Date.now()}`;
        setMyPlayerId(uniqueId);
    }

    const newPlayer: Player = {
      id: uniqueId,
      name: lobbyName,
      investigatorId: selectedInvId,
      color: playerColor,
      clues: 1,
      items: [],
      health: template.health,
      sanity: template.sanity,
      attributes: { ...template.attributes },
      image: template.image,
      x: 0, 
      y: 0,
      movesRemaining: 2,
      actionsRemaining: 2,
      isWounded: false,
      isInsane: false,
      usedItemAbilityRound: false,
      isReady: gameState.networkMode !== NetworkMode.Client // Host is always ready
    };

    if (gameState.networkMode === NetworkMode.Client) {
        // Send player to host
        console.log("Client Sending Register Action:", newPlayer);
        sendAction('ACTION_REGISTER_PLAYER', newPlayer);
    } else {
        // Host adds immediately
        setGameState(prev => ({
            ...prev,
            players: [...prev.players, newPlayer]
        }));
    }
  };

  const toggleReady = () => {
      if (!myPlayerId) return;
      const me = gameState.players.find(p => p.id === myPlayerId);
      if (!me) return;

      if (gameState.networkMode === NetworkMode.Client) {
          sendAction('ACTION_PLAYER_READY', { playerId: myPlayerId, isReady: !me.isReady });
      }
  };

  // STEP 1: PREPARE ITEMS
  const prepareItemDistribution = () => {
     const currentPlayers = gameStateRef.current.players;
     
     if (gameState.networkMode === NetworkMode.Client) return;

     const numPlayers = currentPlayers.length;
     const numItemsToGenerate = numPlayers + 1;
     
     const allItemKeys = Object.keys(ITEMS);
     const weapons = allItemKeys.filter(k => ITEMS[k].type === 'Weapon');
     const others = allItemKeys.filter(k => ITEMS[k].type !== 'Weapon');

     const selected: string[] = [];

     const maxWeapons = Math.ceil(numItemsToGenerate * 0.3); 
     
     for(let i=0; i<maxWeapons; i++) {
        if(weapons.length > 0) {
            const idx = Math.floor(Math.random() * weapons.length);
            selected.push(weapons[idx]);
            weapons.splice(idx, 1);
        }
     }

     while(selected.length < numItemsToGenerate) {
        if(others.length > 0) {
             const idx = Math.floor(Math.random() * others.length);
             selected.push(others[idx]);
             others.splice(idx, 1);
        } else {
             if(weapons.length > 0) {
                const idx = Math.floor(Math.random() * weapons.length);
                selected.push(weapons[idx]);
                weapons.splice(idx, 1);
             } else {
                 break; 
             }
        }
     }
     
     for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
     }

     setDistributionItems(selected);
     setGameState(prev => ({...prev, phase: GamePhase.ItemDistribution}));
  };

  const assignItemToPlayer = (playerIndex: number) => {
      if (gameState.networkMode === NetworkMode.Client) return;

      if (selectedDistItem === null) return;
      
      const itemToAssign = distributionItems[selectedDistItem];
      const newPlayers = [...gameState.players];
      
      newPlayers[playerIndex] = {
          ...newPlayers[playerIndex],
          items: [...newPlayers[playerIndex].items, itemToAssign]
      };
      
      const newDistList = [...distributionItems];
      newDistList.splice(selectedDistItem, 1);

      setGameState(prev => ({...prev, players: newPlayers}));
      setDistributionItems(newDistList);
      setSelectedDistItem(null);
  };

  // STEP 2: FINALIZE START
  const generateMapAndIntro = async () => {
    if (gameState.networkMode === NetworkMode.Client) return; // Only host starts
    const currentState = gameStateRef.current;
    
    setLoading(true);
    
    try {
        const distributed = currentState.players.flatMap(p => p.items);
        const remainingItems = STARTING_ITEMS.filter(i => !distributed.includes(i));
        for (let i = remainingItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remainingItems[i], remainingItems[j]] = [remainingItems[j], remainingItems[i]];
        }

        const intro = await GeminiService.generateIntro(currentState.difficulty, currentState.players);
        
        const dirs = ['North', 'South', 'East', 'West'];
        const hallDir = dirs[Math.floor(Math.random() * dirs.length)];
        let parlorDir = dirs[Math.floor(Math.random() * dirs.length)];
        while (parlorDir === hallDir || (hallDir === 'North' && parlorDir === 'South') || (hallDir === 'South' && parlorDir === 'North') || (hallDir === 'East' && parlorDir === 'West') || (hallDir === 'West' && parlorDir === 'East')) {
            parlorDir = dirs[Math.floor(Math.random() * dirs.length)];
        }
        
        const getVec = (d: string) => {
            if (d === 'North') return {x:0, y:-1};
            if (d === 'South') return {x:0, y:1};
            if (d === 'East') return {x:1, y:0};
            if (d === 'West') return {x:-1, y:0};
            return {x:0, y:0};
        };

        const hV = getVec(hallDir);
        const pV = getVec(parlorDir);

        const inverseDir = (d: string) => d === 'North' ? 'South' : d === 'South' ? 'North' : d === 'East' ? 'West' : 'East';
        
        const h1x = hV.x, h1y = hV.y;
        const h2x = hV.x * 2, h2y = hV.y * 2;
        const hallMinX = Math.min(h1x, h2x);
        const hallMinY = Math.min(h1y, h2y);
        const hallW = Math.abs(h2x - h1x) + 1;
        const hallH = Math.abs(h2y - h1y) + 1;

        const p1x = pV.x, p1y = pV.y;
        const p2x = pV.x * 2, p2y = pV.y * 2;
        const parlorMinX = Math.min(p1x, p2x);
        const parlorMinY = Math.min(p1y, p2y);
        const parlorW = Math.abs(p2x - p1x) + 1;
        const parlorH = Math.abs(p2y - p1y) + 1;

        const foyerImg = generateRoomImage(`Foyer, ${intro.startingRoomDescription}, doors on the ${hallDir} and ${parlorDir} walls, square room`, 1, 1);
        const hallImg = generateRoomImage(`Grand Hall, A long rectangular corridor lined with portraits, containing a Strange Painting, door on the ${inverseDir(hallDir)} wall, detailed floor plan`, 2, 1); // Approx
        const parlorImg = generateRoomImage(`The Parlor, cozy with a fireplace and armchairs, rug on floor, tea table, door on the ${inverseDir(parlorDir)} wall, detailed floor plan`, 2, 1); // Approx

        const foyer: Tile = {
          id: 'tile_start', roomId: 'room_start_mansion', name: formatRoomName('Foyer'), description: intro.startingRoomDescription,
          x: 0, y: 0, imageType: 'hallway', roomImage: foyerImg, roomX: 0, roomY: 0, roomWidth: 1, roomHeight: 1
        };
        
        const hallRoomId = 'room_start_hall';
        const hallTile1: Tile = { id: 'tile_hall_1', roomId: hallRoomId, name: formatRoomName('Grand Hall'), description: "A long corridor lined with portraits.", x: h1x, y: h1y, imageType: 'hallway', roomImage: hallImg, roomX: hallMinX, roomY: hallMinY, roomWidth: 2, roomHeight: 2 };
        const hallTile2: Tile = { id: 'tile_hall_2', roomId: hallRoomId, name: formatRoomName('Grand Hall'), description: "A long corridor lined with portraits.", x: h2x, y: h2y, imageType: 'hallway', roomImage: hallImg, roomX: hallMinX, roomY: hallMinY, roomWidth: 2, roomHeight: 2 };

        const parlorRoomId = 'room_start_parlor';
        const parlorTile1: Tile = { id: 'tile_parlor_1', roomId: parlorRoomId, name: formatRoomName('Parlor'), description: "A quiet sitting room.", x: p1x, y: p1y, imageType: 'study', roomImage: parlorImg, roomX: parlorMinX, roomY: parlorMinY, roomWidth: 2, roomHeight: 2 };
        const parlorTile2: Tile = { id: 'tile_parlor_2', roomId: parlorRoomId, name: formatRoomName('Parlor'), description: "A quiet sitting room.", x: p2x, y: p2y, imageType: 'study', roomImage: parlorImg, roomX: parlorMinX, roomY: parlorMinY, roomWidth: 2, roomHeight: 2 };

        const tiles = [foyer, hallTile1, hallTile2, parlorTile1, parlorTile2];
        const tokens: Token[] = [];
        
        tokens.push({ id: 't_search_foyer', type: TokenType.Search, x: 0, y: 0, description: 'Coat Rack', resolved: false, requiredAttribute: Attribute.Observation, difficulty: 2 });
        tokens.push({ id: 't_search_hall_1', type: TokenType.Search, x: h1x, y: h1y, description: 'Bust of Ancestor', resolved: false, requiredAttribute: Attribute.Lore, difficulty: 2 });
        tokens.push({ id: 't_search_hall_2', type: TokenType.Search, x: h2x, y: h2y, description: 'Strange Painting', resolved: false, requiredAttribute: Attribute.Observation, difficulty: 3 });
        tokens.push({ id: 't_search_parlor_1', type: TokenType.Search, x: p1x, y: p1y, description: 'Coffee Table', resolved: false, requiredAttribute: Attribute.Observation, difficulty: 2 });
        tokens.push({ id: 't_search_parlor_2', type: TokenType.Search, x: p2x, y: p2y, description: 'Bookshelf', resolved: false, requiredAttribute: Attribute.Lore, difficulty: 2 });

        tokens.push({ id: 't_door_foyer_hall', type: TokenType.Explore, x: 0, y: 0, description: 'Archway', resolved: true, direction: hallDir as any });
        tokens.push({ id: 't_door_foyer_parlor', type: TokenType.Explore, x: 0, y: 0, description: 'Double Doors', resolved: true, direction: parlorDir as any });

        const cardVectors = [{ dir: 'North', x: 0, y: -1 }, { dir: 'South', x: 0, y: 1 }, { dir: 'East', x: 1, y: 0 }, { dir: 'West', x: -1, y: 0 }];
        const checkOccupied = (tx: number, ty: number) => tiles.some(t => t.x === tx && t.y === ty);

        tiles.forEach(tile => {
             cardVectors.forEach((v, i) => {
                const tx = tile.x + v.x;
                const ty = tile.y + v.y;
                if (!checkOccupied(tx, ty)) {
                     if (Math.random() > 0.55) {
                         tokens.push({
                            id: `t_door_${tile.id}_${i}`,
                            type: TokenType.Explore,
                            x: tile.x, y: tile.y,
                            description: 'Heavy Door',
                            resolved: false,
                            direction: v.dir as any
                        });
                     }
                }
            });
        });

        const safeIntroText = intro && intro.introText ? intro.introText : "The game begins.";

        setGameState(prev => ({
          ...prev,
          players: currentState.players, 
          phase: GamePhase.Playing,
          round: 1,
          tiles: tiles,
          tokens: tokens,
          itemDeck: remainingItems, 
          storyContext: safeIntroText,
          log: [safeIntroText],
          evidenceCollected: 0,
          evidenceRequired: 4 + Math.floor(currentState.players.length / 2), 
          isEscapeOpen: false
        }));
        
        speak(safeIntroText);
    } catch (error) {
        console.error("Critical Error generating map:", error);
        addLog("Error starting game. Check console.", false);
    } finally {
        setLoading(false);
    }
  };

  // --- Core Game Logic ---

  const handleUseItem = (item: string, remote = false) => {
      if (gameState.networkMode === NetworkMode.Client && !remote) {
          sendAction('ACTION_USE_ITEM', { item });
          return;
      }

      const player = gameState.players[gameState.currentPlayerIndex];
      const template = INVESTIGATOR_TEMPLATES.find(t => t.id === player.investigatorId);
      const maxHp = template?.health || 7;
      const maxSanity = template?.sanity || 7;

      const consumeItem = () => {
          const newItems = player.items.filter((i, idx) => idx !== player.items.indexOf(item));
          return newItems;
      };

      const updatePlayer = (updates: Partial<Player>) => {
           setGameState(prev => ({
              ...prev,
              players: prev.players.map(p => p.id === player.id ? { ...p, ...updates } : p)
           }));
      };

      if (item === "First Aid Kit") {
          const newHp = Math.min(player.health + 2, maxHp);
          if (newHp > player.health) {
              updatePlayer({ health: newHp, items: consumeItem() });
              addLog(`${player.name} uses First Aid Kit and heals 2 Health.`);
          } else {
              addLog("Health is already full.", false);
          }
      } else if (item === "Bandages") {
          const newHp = Math.min(player.health + 1, maxHp);
          if (newHp > player.health) {
               updatePlayer({ health: newHp, items: consumeItem() });
               addLog(`${player.name} bandages their wounds (+1 Health).`);
          } else {
              addLog("Health is already full.", false);
          }
      } else if (item === "Painkillers") {
          const newHp = Math.min(player.health + 2, maxHp);
          if (newHp > player.health) {
               updatePlayer({ health: newHp, sanity: Math.max(0, player.sanity - 1), items: consumeItem() });
               addLog(`${player.name} takes Painkillers (+2 Health, -1 Sanity).`);
          } else {
               addLog("Health is already full.", false);
          }
      } else if (item === "Smelling Salts") {
          const newSanity = Math.min(player.sanity + 2, maxSanity);
          if (newSanity > player.sanity) {
               updatePlayer({ sanity: newSanity, items: consumeItem() });
               addLog(`${player.name} uses Smelling Salts (+2 Sanity).`);
          } else {
               addLog("Sanity is already full.", false);
          }
      } else if (item === "Pocket Watch") {
          updatePlayer({ actionsRemaining: player.actionsRemaining + 2, items: consumeItem() });
          addLog(`${player.name} checks the Pocket Watch. Time seems to slow (+2 Actions).`);
      } else if (item === "Kerosene") {
          const monstersInSpace = gameState.monsters.filter(m => m.x === player.x && m.y === player.y);
          if (monstersInSpace.length > 0) {
              const target = monstersInSpace[0];
              const newHealth = target.health - 3;
              let newMonsters = [...gameState.monsters];
              if (newHealth <= 0) {
                  newMonsters = newMonsters.filter(m => m.id !== target.id);
                  addLog(`${player.name} throws Kerosene! ${target.name} burns and dies!`, true);
              } else {
                  newMonsters = newMonsters.map(m => m.id === target.id ? { ...m, health: newHealth } : m);
                  addLog(`${player.name} throws Kerosene! ${target.name} takes 3 Fire Damage.`, true);
              }
              setGameState(prev => ({
                  ...prev,
                  monsters: newMonsters,
                  players: prev.players.map(p => p.id === player.id ? { ...p, items: consumeItem() } : p)
              }));
          } else {
              addLog("No monsters here to burn.", false);
          }
      }
  };

  const handleConsumeItem = (item: string) => {
      if (gameState.networkMode === NetworkMode.Client) {
          sendAction('ACTION_USE_ITEM', { item });
          return;
      }

      const player = gameState.players[gameState.currentPlayerIndex];
      const newItems = player.items.filter((i, idx) => idx !== player.items.indexOf(item));
      setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === player.id ? { ...p, items: newItems } : p),
          log: [...prev.log, `${player.name} used ${item}.`].slice(-50)
      }));
  };

  const handleMarkItemUsed = () => {
      const player = gameState.players[gameState.currentPlayerIndex];
      setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === player.id ? { ...p, usedItemAbilityRound: true } : p)
      }));
  };

  const applyDamage = async (playerId: string, damage: number, horror: number) => {
      setGameState(prev => {
          const player = prev.players.find(p => p.id === playerId);
          if (!player) return prev;

          let newHealth = player.health - damage;
          let newSanity = player.sanity - horror;
          let newIsWounded = player.isWounded;
          let newIsInsane = player.isInsane;
          let logMsg = "";
          let elimMsg = "";

          if (newHealth <= 0) {
              if (player.isWounded) {
                  elimMsg = `${player.name} has succumbed to their wounds!`;
                  return { ...prev, players: prev.players.filter(p => p.id !== playerId), log: [...prev.log, elimMsg].slice(-50) };
              } else {
                  newIsWounded = true;
                  const template = INVESTIGATOR_TEMPLATES.find(t => t.id === player.investigatorId);
                  newHealth = template ? template.health : 7; 
                  logMsg += `${player.name} is broken and Wounded! Health restored, but mobility is limited. `;
              }
          }

          let sanityChanged = false;
          if (newSanity <= 0) {
              if (!player.isInsane) {
                  newIsInsane = true;
                  newSanity = 0; 
                  logMsg += `${player.name} has gone INSANE! `;
                  sanityChanged = true;
              } else {
                 newSanity = 0;
              }
          }

          if (logMsg) speak(logMsg);

          const updatedPlayer = {
              ...player,
              health: newHealth,
              sanity: newSanity,
              isWounded: newIsWounded,
              isInsane: newIsInsane,
              actionsRemaining: (newIsWounded && !player.isWounded) ? Math.min(player.actionsRemaining, 1) : player.actionsRemaining,
              movesRemaining: (newIsWounded && !player.isWounded) ? Math.min(player.movesRemaining, 1) : player.movesRemaining
          };

          return {
              ...prev,
              players: prev.players.map(p => p.id === playerId ? updatedPlayer : p),
              log: logMsg ? [...prev.log, logMsg].slice(-50) : prev.log
          };
      });

      const player = gameState.players.find(p => p.id === playerId); 
      
      if (player && !player.isInsane && (player.sanity - horror) <= 0) {
         setLoading(true);
         const objective = await GeminiService.generateInsanityCondition(gameState.storyContext);
         setGameState(prev => ({
             ...prev,
             players: prev.players.map(p => p.id === playerId ? { ...p, secretObjective: objective } : p)
         }));
         setLoading(false);
      }
  };

  const updatePlayerAction = (playerId: string, delta: number) => {
    setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === playerId ? { ...p, actionsRemaining: p.actionsRemaining + delta } : p)
    }));
  };

  // --- New Centralized Action Resolution Logic ---
  
  const handleActionComplete = (context: ActionContext, success: boolean, data?: any) => {
      // If we are Client, we must send this to Host
      if (gameState.networkMode === NetworkMode.Client) {
          sendAction('ACTION_COMPLETE_TASK', { context, success, data });
          
          // Clear local UI immediately for responsiveness
          setGameState(prev => ({
              ...prev,
              activeDiceRoll: undefined,
              activePuzzle: undefined,
              phase: GamePhase.Playing // Return to playing pending sync
          }));
          return;
      }

      // HOST LOGIC (also runs if offline)
      console.log("Resolving Action:", context, success);

      if (context.type === 'SEARCH') {
          const token = gameState.tokens.find(t => t.id === context.tokenId);
          if (token) {
              resolveSearch(token, success, data); // data is rolls array
          } else {
              setGameState(prev => ({ ...prev, phase: GamePhase.Playing, activeDiceRoll: undefined, activePuzzle: undefined }));
          }
      } else if (context.type === 'COMBAT') {
          resolveCombat(context.monsterId, success, data); // data is damage amount
      }
  };

  // --- Interaction Logic ---

  const handleTileClick = (tile: Tile, remote = false) => {
    // Check if Game is playing
    const currentState = gameStateRef.current;
    if (currentState.phase !== GamePhase.Playing) return;
    
    // Network Check
    if (currentState.networkMode === NetworkMode.Client && !remote) {
        sendAction('ACTION_TILE_CLICK', { tileId: tile.id });
        return;
    }

    const player = currentState.players[currentState.currentPlayerIndex];

    if (player.movesRemaining <= 0) {
        addLog("No moves remaining.", false);
        return;
    }

    // MONSTER CHECK: Movement Restriction
    const monstersOnTile = currentState.monsters.filter(m => m.x === player.x && m.y === player.y);
    if (monstersOnTile.length > 0 && (tile.x !== player.x || tile.y !== player.y)) {
        addLog(`${player.name} is engaged by ${monstersOnTile[0].name} and cannot move! Defeat the monster first.`, true);
        return;
    }

    const dist = Math.abs(player.x - tile.x) + Math.abs(player.y - tile.y);
    if (dist === 1) {
        const updatedPlayers = currentState.players.map(p => 
            p.id === player.id 
            ? { ...p, x: tile.x, y: tile.y, movesRemaining: p.movesRemaining - 1 }
            : p
        );
        setGameState(prev => ({ ...prev, players: updatedPlayers }));
    }
  };

  const handleTokenClick = async (token: Token, remote = false) => {
    const currentState = gameStateRef.current;
    if (currentState.phase !== GamePhase.Playing) return;

    if (currentState.networkMode === NetworkMode.Client && !remote) {
        sendAction('ACTION_TOKEN_CLICK', { tokenId: token.id });
        return;
    }

    const player = currentState.players[currentState.currentPlayerIndex];
    
    if (player.x !== token.x || player.y !== token.y) {
      addLog("You must be in the same area to interact.", false);
      return;
    }

    if (token.type === TokenType.Escape) {
        setGameState(prev => ({ ...prev, phase: GamePhase.Victory }));
        speak("You burst through the heavy doors into the cool night air. You have survived the night.");
        return;
    }

    if (player.actionsRemaining <= 0) {
      addLog("No actions remaining.", false);
      return;
    }

    if (token.type === TokenType.Explore) {
      setLoading(true);
      
      let dir = token.direction || 'North';
      let originX = token.x;
      let originY = token.y;
      
      let entryX = originX;
      let entryY = originY;
      if (dir === 'North') entryY--;
      if (dir === 'South') entryY++;
      if (dir === 'East') entryX++;
      if (dir === 'West') entryX--;

      const exists = currentState.tiles.find(t => t.x === entryX && t.y === entryY);
      if (exists) {
        addLog(`${player.name} opens the door, but it leads to a known room.`, true);
        updatePlayerAction(player.id, -1);
        setGameState(prev => ({
           ...prev,
           tokens: prev.tokens.map(t => t.id === token.id ? { ...t, resolved: true } : t)
        }));
        setLoading(false);
        return;
      }

      const sourceTile = currentState.tiles.find(t => t.x === originX && t.y === originY);
      const fromType = sourceTile?.imageType || 'hallway';
      const existingTypes = Array.from(new Set(currentState.tiles.map(t => t.imageType.toLowerCase()))) as string[];

      const roomData = await GeminiService.generateRoomDiscovery(dir, currentState.storyContext, fromType, existingTypes);
      const roomName = formatRoomName(roomData.name);
      
      const newTiles: Tile[] = [];
      const newTokens: Token[] = [];
      const newRoomId = `room_${Date.now()}`;
      const isHallway = roomData.visualType.toLowerCase() === 'hallway';
      const isCloset = roomData.visualType.toLowerCase() === 'closet';
      
      const entryTile = {
        id: `tile_${Date.now()}_entry`,
        roomId: newRoomId,
        name: roomName,
        description: roomData.description,
        x: entryX,
        y: entryY,
        imageType: roomData.visualType.toLowerCase() as any
      };
      newTiles.push(entryTile);

      if (!isHallway && !isCloset) {
          const checkOccupied = (x: number, y: number) => {
              return currentState.tiles.some(t => t.x === x && t.y === y) || newTiles.some(t => t.x === x && t.y === y);
          };

          let dx = 0, dy = 0;
          let orthoX = 0, orthoY = 0;
          
          if (dir === 'North') { dy = -1; orthoX = 1; } 
          if (dir === 'South') { dy = 1; orthoX = 1; }
          if (dir === 'East') { dx = 1; orthoY = 1; }
          if (dir === 'West') { dx = -1; orthoY = 1; }

          const p1 = { x: entryX + dx, y: entryY + dy }; 
          const p2 = { x: entryX + orthoX, y: entryY + orthoY }; 
          const p3 = { x: entryX + dx + orthoX, y: entryY + dy + orthoY }; 

          const can2x2 = !checkOccupied(p1.x, p1.y) && !checkOccupied(p2.x, p2.y) && !checkOccupied(p3.x, p3.y);
          
          if (can2x2 && Math.random() > 0.5) {
             [p1, p2, p3].forEach((p, i) => {
                 newTiles.push({
                    id: `tile_${Date.now()}_${i}`,
                    roomId: newRoomId,
                    name: roomName,
                    description: "",
                    x: p.x,
                    y: p.y,
                    imageType: roomData.visualType.toLowerCase() as any
                 });
             });
          } else {
             if (!checkOccupied(p1.x, p1.y) && Math.random() > 0.2) {
                  newTiles.push({
                    id: `tile_${Date.now()}_fwd`,
                    roomId: newRoomId,
                    name: roomName,
                    description: "",
                    x: p1.x,
                    y: p1.y,
                    imageType: roomData.visualType.toLowerCase() as any
                 });
             } else if (!checkOccupied(p2.x, p2.y) && Math.random() > 0.2) {
                  newTiles.push({
                    id: `tile_${Date.now()}_side`,
                    roomId: newRoomId,
                    name: roomName,
                    description: "",
                    x: p2.x,
                    y: p2.y,
                    imageType: roomData.visualType.toLowerCase() as any
                 });
             }
          }
      }

      const xs = newTiles.map(t => t.x);
      const ys = newTiles.map(t => t.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      
      const entryDirection = dir === 'North' ? 'South' : dir === 'South' ? 'North' : dir === 'East' ? 'West' : 'East';

      const exitCount = isHallway ? 2 : (Math.random() > 0.6 ? 2 : 1);
      const possibleDirs = ['North', 'South', 'East', 'West'].filter(d => {
          if (dir === 'North' && d === 'South') return false;
          if (dir === 'South' && d === 'North') return false;
          if (dir === 'East' && d === 'West') return false;
          if (dir === 'West' && d === 'East') return false;
          return true;
      });

      const selectedExits: string[] = [];
      for (let i = 0; i < exitCount; i++) {
          if (possibleDirs.length === 0) break;
          const exDir = possibleDirs.splice(Math.floor(Math.random() * possibleDirs.length), 1)[0];
          selectedExits.push(exDir);
      }

      const doors = [entryDirection, ...selectedExits];
      const doorString = `doors on the ${doors.join(' and ')} walls`;

      const roomImgPrompt = `${roomName}, ${roomData.description}, ${doorString}, ${roomData.visualType} style`;
      const roomImgUrl = generateRoomImage(roomImgPrompt, width, height);

      newTiles.forEach(t => {
          t.roomImage = roomImgUrl;
          t.roomX = minX;
          t.roomY = minY;
          t.roomWidth = width;
          t.roomHeight = height;
      });

      const searchPoints = roomData.searchPoints || [{description: 'Unknown', attribute: 'Observation'}];
      const shuffledTiles = [...newTiles].sort(() => 0.5 - Math.random());
      
      searchPoints.forEach((point: any, index: number) => {
          const targetTile = shuffledTiles[index % shuffledTiles.length];
          newTokens.push({
            id: `tok_${Date.now()}_search_${index}`,
            type: TokenType.Search,
            x: targetTile.x,
            y: targetTile.y,
            description: point.description,
            resolved: false,
            requiredAttribute: (point.attribute as Attribute) || Attribute.Observation,
            difficulty: 2
          });
      });

      selectedExits.forEach((exDir, i) => {
          const candidates = newTiles.filter(t => {
             if (exDir === 'North') return t.y === minY;
             if (exDir === 'South') return t.y === maxY;
             if (exDir === 'West') return t.x === minX;
             if (exDir === 'East') return t.x === maxX;
             return false;
          });
          
          const doorTile = candidates.length > 0 
                ? candidates[Math.floor(Math.random() * candidates.length)] 
                : newTiles[Math.floor(Math.random() * newTiles.length)];

          newTokens.push({
            id: `tok_${Date.now()}_door_${i}`,
            type: TokenType.Explore,
            x: doorTile.x,
            y: doorTile.y,
            description: isHallway ? 'Heavy Door' : 'Side Door',
            resolved: false,
            direction: exDir as any
          });
      });

      const updatedPlayers = currentState.players.map(p => 
        p.id === player.id 
        ? { ...p, x: entryX, y: entryY, actionsRemaining: p.actionsRemaining - 1 } 
        : p
      );

      const updatedTokens = currentState.tokens.map(t => 
        t.id === token.id ? { ...t, resolved: true } : t
      );

      setGameState(prev => ({
        ...prev,
        tiles: [...prev.tiles, ...newTiles],
        tokens: [...updatedTokens, ...newTokens],
        players: updatedPlayers,
        storyContext: prev.storyContext + ` They entered ${roomName}. ${roomData.description}`,
        log: [...prev.log, `${player.name} explores ${roomName}. ${roomData.description}`].slice(-50)
      }));
      
      speak(`${player.name} opens the door to ${roomName}. ${roomData.description}`);
      setLoading(false);

    } else if (token.type === TokenType.Search) {
      if (Math.random() > 0.7) {
          const rand = Math.random();
          let puzzleType = PuzzleType.Sliding;
          if (rand < 0.33) puzzleType = PuzzleType.Sliding;
          else if (rand < 0.66) puzzleType = PuzzleType.Rune;
          else puzzleType = PuzzleType.Code;

          setGameState(prev => ({
              ...prev,
              phase: GamePhase.Puzzle,
              activePuzzle: {
                  type: puzzleType,
                  token: token,
                  context: { type: 'SEARCH', tokenId: token.id }
              }
          }));
      } else {
          const attr = token.requiredAttribute || Attribute.Observation;
          const count = player.attributes[attr]; 
          
          setGameState(prev => ({
            ...prev,
            phase: GamePhase.DiceRoll,
            activeDiceRoll: {
              playerId: player.id,
              attribute: attr,
              count: count,
              target: token.difficulty || 1,
              description: token.description,
              context: { type: 'SEARCH', tokenId: token.id }
            }
          }));
      }
    }
  };

  const resolveSearch = async (token: Token, success: boolean, rolls: DiceFace[]) => {
     setLoading(true);
     setGameState(prev => ({ 
         ...prev, 
         phase: GamePhase.Playing, 
         activeDiceRoll: undefined,
         activePuzzle: undefined 
     }));

     let rewardType: 'None' | 'Evidence' | 'Item' | 'Clue' = 'None';
     let foundObjectName = '';

     if (success) {
         const roll = Math.random();
         const state = gameStateRef.current;
         
         if (!state.isEscapeOpen && roll < 0.20) { 
             rewardType = 'Evidence';
             foundObjectName = 'Incriminating Evidence';
         } else if (roll < 0.65 && state.itemDeck.length > 0) {
             rewardType = 'Item';
             foundObjectName = state.itemDeck[state.itemDeck.length - 1];
         } else {
             rewardType = 'Clue'; 
             foundObjectName = 'a Clue';
         }
     }

     const narrative = await GeminiService.generateInvestigationOutcome(
       token.description, 
       success, 
       gameState.storyContext,
       rewardType === 'Item' ? foundObjectName : (rewardType === 'Evidence' ? 'Incriminating Evidence' : (rewardType === 'Clue' ? 'a hidden Clue' : undefined))
     );
     
     setGameState(prev => {
        let newPlayers = [...prev.players];
        let newTokens = [...prev.tokens];
        let newItemDeck = [...prev.itemDeck];
        let rewardMsg = "";
        let newEvidenceCount = prev.evidenceCollected;

        const currentPlayer = newPlayers[prev.currentPlayerIndex];

        if (success) {
           if (rewardType === 'Evidence') {
               newEvidenceCount++;
               rewardMsg = "Found: EVIDENCE";
           } else if (rewardType === 'Item') {
               const popped = newItemDeck.pop();
               if (popped) {
                   currentPlayer.items.push(popped);
                   rewardMsg = `Found: ${popped}`;
               } else {
                   currentPlayer.clues++;
                   rewardMsg = "Found: 1 Clue";
               }
           } else {
               currentPlayer.clues++;
               rewardMsg = "Found: 1 Clue";
           }

           newTokens = newTokens.filter(t => t.id !== token.id);
        } else {
           rewardMsg = "Found nothing";
        }

        newPlayers[prev.currentPlayerIndex].actionsRemaining--;
        
        const logMsg = `${success ? 'SUCCESS' : 'FAILURE'}: ${rewardMsg}. ${narrative}`;
        
        const nextState = {
          ...prev,
          players: newPlayers,
          tokens: newTokens,
          itemDeck: newItemDeck,
          log: [...prev.log, logMsg].slice(-50),
          storyContext: prev.storyContext + ` Investigation of ${token.description}: ${narrative}`,
          evidenceCollected: newEvidenceCount
        };

        return nextState;
     });

     setTimeout(() => {
        setGameState(current => {
            if (current.evidenceCollected >= current.evidenceRequired && !current.isEscapeOpen) {
                const finaleMsg = "You found the final piece of evidence! The ancient ritual is exposed. The Master of the House has awoken! RETREAT TO THE FOYER!";
                const spawnTile = current.tiles[Math.floor(Math.random() * current.tiles.length)];
                const bossTemplate = MONSTER_TEMPLATES.find(m => m.tier === 3) || MONSTER_TEMPLATES[MONSTER_TEMPLATES.length - 1];
                
                const boss: Monster = {
                    id: `boss_${Date.now()}`,
                    templateId: bossTemplate.id,
                    name: bossTemplate.name,
                    tier: 3,
                    health: bossTemplate.health + current.players.length * 3,
                    maxHealth: bossTemplate.health + current.players.length * 3,
                    damage: bossTemplate.damage + 1,
                    horror: bossTemplate.horror + 1,
                    x: spawnTile.x,
                    y: spawnTile.y,
                    image: bossTemplate.image
                };

                const escapeToken: Token = {
                    id: 'tok_escape',
                    type: TokenType.Escape,
                    x: 0, 
                    y: 0,
                    description: "Exit the Mansion",
                    resolved: false
                };

                speak(finaleMsg);

                return {
                    ...current,
                    isEscapeOpen: true,
                    monsters: [...current.monsters, boss],
                    tokens: [...current.tokens, escapeToken],
                    log: [...current.log, `FINALE: ${finaleMsg}`].slice(-50)
                };
            }
            return current;
        });
     }, 100);

     let spokenText = narrative.trim();
     if (spokenText && !/[.!?]$/.test(spokenText)) {
         spokenText += ".";
     }
     
     if (success) {
         if (rewardType === 'Item') spokenText += ` ${foundObjectName} added to inventory.`;
         else if (rewardType === 'Clue') spokenText += ` Clue added to inventory.`;
         else if (rewardType === 'Evidence') spokenText += ` Evidence collected.`;
     } 

     if (success) spokenText += (gameState.evidenceCollected + 1 >= gameState.evidenceRequired ? " You feel you are close to the truth." : "");

     speak(spokenText);
     setLoading(false);
  };

  const endMythosPhase = () => {
    const currentState = gameStateRef.current;
    if (currentState.players.length === 0) {
        addLog("ALL INVESTIGATORS ELIMINATED", true);
        setGameState(prev => ({ ...prev, phase: GamePhase.GameOver }));
        return;
    }
    setGameState(prev => ({
      ...prev,
      phase: GamePhase.Playing,
      mythosEvent: undefined,
      currentPlayerIndex: 0,
      players: prev.players.map(p => ({ 
          ...p, 
          actionsRemaining: p.isWounded ? 1 : 2, 
          movesRemaining: p.isWounded ? 1 : 2,
          usedItemAbilityRound: false 
      }))
    }));
    addLog("New Round.", false);
  };

  const runMythosPhase = async () => {
      const currentState = gameStateRef.current;
      const nextRound = currentState.round + 1;
      const threat = Math.min(10, nextRound + (currentState.difficulty === 'Hard' ? 2 : 0));
      
      setGameState(prev => ({ ...prev, phase: GamePhase.Mythos, round: nextRound }));
      
      try {
          const event = await GeminiService.generateMythosEvent(currentState.storyContext, threat);
          
          let logMsg = event.narrative;
          let newMonsters = [...currentState.monsters];
          let newPlayers = [...currentState.players];
          
          if (event.type === 'SPAWN') {
             const tile = currentState.tiles[Math.floor(Math.random() * currentState.tiles.length)];
             const mTemplate = MONSTER_TEMPLATES.find(m => m.tier === (threat > 6 ? 2 : 1)) || MONSTER_TEMPLATES[0];
             const monster: Monster = {
                 id: `m_${Date.now()}`,
                 templateId: mTemplate.id,
                 name: mTemplate.name,
                 health: mTemplate.health,
                 maxHealth: mTemplate.health,
                 damage: mTemplate.damage,
                 horror: mTemplate.horror,
                 tier: mTemplate.tier as any,
                 x: tile.x,
                 y: tile.y,
                 image: mTemplate.image
             };
             newMonsters.push(monster);
             logMsg += ` A ${monster.name} appears!`;
          } else if (event.type === 'TEST') {
             // Simple global horror test
             logMsg += " The darkness presses in. All investigators take 1 Horror.";
             newPlayers = newPlayers.map(p => ({ ...p, sanity: Math.max(0, p.sanity - 1) }));
          }
          
          setGameState(prev => ({ 
              ...prev, 
              monsters: newMonsters,
              players: newPlayers,
              mythosEvent: { text: logMsg, type: event.type as any },
              log: [...prev.log, logMsg].slice(-50)
          }));
          speak(logMsg);
      } catch (e) {
          endMythosPhase(); 
      }
  };

  const resolveCombat = (monsterId: string, hit: boolean, damage: number) => {
     setGameState(prev => {
         let newMonsters = [...prev.monsters];
         const mIdx = newMonsters.findIndex(m => m.id === monsterId);
         let msg = "";
         if (mIdx !== -1 && hit) {
             newMonsters[mIdx] = { ...newMonsters[mIdx], health: newMonsters[mIdx].health - damage };
             if (newMonsters[mIdx].health <= 0) {
                 msg = `You defeated the ${newMonsters[mIdx].name}!`;
                 newMonsters.splice(mIdx, 1);
             } else {
                 msg = `You hit the ${newMonsters[mIdx].name} for ${damage} damage.`;
             }
         } else {
             msg = "Attack missed!";
         }
         return {
             ...prev,
             monsters: newMonsters,
             phase: GamePhase.Playing,
             activeDiceRoll: undefined,
             log: [...prev.log, msg].slice(-50)
         };
     });
  };

  const handleMonsterClick = (monster: Monster, remote = false) => {
      const currentState = gameStateRef.current;
      if (currentState.phase !== GamePhase.Playing) return;

      if (currentState.networkMode === NetworkMode.Client && !remote) {
          sendAction('ACTION_MONSTER_CLICK', { monsterId: monster.id });
          return;
      }

      const player = currentState.players[currentState.currentPlayerIndex];
      
      if (player.actionsRemaining <= 0) {
          addLog("No actions remaining.", false);
          return;
      }

      if (Math.abs(player.x - monster.x) + Math.abs(player.y - monster.y) > 0) {
           const hasGun = player.items.some(i => i.includes('Revolver') || i.includes('Shotgun'));
           if (!hasGun) {
               addLog("Too far to attack! (Need firearm)", false);
               return;
           }
      }

      const weapon = player.items.find(i => ITEMS[i]?.type === 'Weapon');
      const baseDmg = 1;
      const weaponDmg = weapon ? (weapon.includes('Shotgun') ? 2 : 1) : 0;
      const totalDmg = baseDmg + weaponDmg;
      const str = player.attributes[Attribute.Strength];

      setGameState(prev => ({
          ...prev,
          phase: GamePhase.DiceRoll,
          activeDiceRoll: {
              playerId: player.id,
              attribute: Attribute.Strength,
              count: str,
              target: 2, 
              description: `Attacking ${monster.name}`,
              context: { type: 'COMBAT', monsterId: monster.id }
          }
      }));
      
      updatePlayerAction(player.id, -1);
  };

  const endTurn = (remote = false) => {
      const currentState = gameStateRef.current;
      if (currentState.networkMode === NetworkMode.Client && !remote) {
           sendAction('ACTION_END_TURN', {});
           return;
      }
      
      const player = currentState.players[currentState.currentPlayerIndex];
      const enemies = currentState.monsters.filter(m => m.x === player.x && m.y === player.y);
      if (enemies.length > 0) {
          let totalDmg = 0;
          let totalHorror = 0;
          enemies.forEach(m => { totalDmg += m.damage; totalHorror += m.horror; });
          if (totalDmg > 0 || totalHorror > 0) {
              addLog(`${player.name} is attacked by enemies!`, true);
              applyDamage(player.id, totalDmg, totalHorror);
          }
      }

      const nextIndex = (currentState.currentPlayerIndex + 1) % currentState.players.length;
      if (nextIndex === 0) {
          runMythosPhase();
      } else {
           setGameState(prev => ({ 
               ...prev, 
               currentPlayerIndex: nextIndex,
               players: prev.players.map(p => p.id === prev.players[nextIndex].id ? 
                   { ...p, actionsRemaining: p.isWounded ? 1 : 2, movesRemaining: p.isWounded ? 1 : 2 } : p)
           }));
           speak(`It is ${currentState.players[nextIndex].name}'s turn.`);
      }
  };

  // --- Render ---
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  const activeTemplateId = previewInvId || selectedInvId || INVESTIGATOR_TEMPLATES[0].id;
  const activeTemplate = INVESTIGATOR_TEMPLATES.find(t => t.id === activeTemplateId) || INVESTIGATOR_TEMPLATES[0];

  // Logic to identify if local player is registered
  const myPlayer = gameState.players.find(p => p.id === myPlayerId);
  const isRegistered = !!myPlayer;

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex flex-col text-gray-200 font-serif relative">
      {/* Global Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/80 z-[200] flex items-center justify-center flex-col">
          <div className="text-[#d4c5b0] font-serif text-3xl animate-pulse tracking-widest mb-4">
             Consulting the Archives...
          </div>
          <div className="w-16 h-16 border-4 border-t-[#b45309] border-r-[#b45309] border-b-transparent border-l-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Title Screen Overlay */}
      {showTitleScreen && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 text-center bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
          <div className="max-w-4xl w-full border-4 border-double border-[#5c1a1a] p-12 bg-[#0f0a0a] shadow-[0_0_100px_rgba(0,0,0,0.9)] relative overflow-hidden">
             {/* Decorative corners */}
             <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-mythos-gold"></div>
             <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-mythos-gold"></div>
             <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-mythos-gold"></div>
             <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-mythos-gold"></div>

             <h1 className="text-6xl md:text-8xl font-serif font-bold text-mythos-blood mb-4 tracking-wider drop-shadow-md">ECHOES</h1>
             <h2 className="text-3xl md:text-5xl font-serif text-gray-400 mb-12 tracking-[0.5em] uppercase">Of Madness</h2>
             
             <div className="mt-8 flex gap-4 justify-center">
                 <button 
                   onClick={() => createRoom()}
                   className="group relative px-8 py-3 bg-transparent border-2 border-[#5c4033] text-mythos-gold hover:text-white hover:border-mythos-gold transition-all duration-500 overflow-hidden"
                 >
                    <span className="absolute inset-0 w-full h-full bg-mythos-gold/10 group-hover:bg-mythos-gold/80 transition-all duration-500 transform -translate-x-full group-hover:translate-x-0"></span>
                    <span className="relative text-xl uppercase tracking-widest font-bold z-10">
                        {isHostTab ? "Create Room" : "Join Room"}
                    </span>
                 </button>
             </div>
             
             {/* Toggle Join/Create */}
             <div className="mt-4 flex gap-4 text-sm uppercase tracking-widest">
                 <button onClick={() => setIsHostTab(true)} className={`${isHostTab ? 'text-white underline' : 'text-gray-600'}`}>Create</button>
                 <span className="text-gray-600">|</span>
                 <button onClick={() => setIsHostTab(false)} className={`${!isHostTab ? 'text-white underline' : 'text-gray-600'}`}>Join</button>
             </div>

             {!isHostTab && (
                 <input 
                    type="text" 
                    placeholder="Enter Room Code" 
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="mt-4 bg-transparent border-b border-[#5c4033] text-center text-xl text-white outline-none uppercase"
                 />
             )}
             
             <p className="mt-8 text-gray-600 text-sm italic font-serif">"That is not dead which can eternal lie..."</p>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="h-16 bg-[#0f0a0a] border-b border-[#3e2723] flex items-center justify-between px-6 z-10 shadow-lg relative bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]">
        <h1 
          className="text-xl font-bold text-mythos-blood tracking-[0.2em] relative z-10 drop-shadow-sm"
          style={{ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 0 #000' }}
        >
          ECHOES OF MADNESS
        </h1>
        {gameState.phase === GamePhase.Playing && currentPlayer && (
          <div className="flex items-center gap-6 relative z-10">
             <div className="flex gap-4 text-xs font-serif text-[#d4c5b0]">
                 <div className="bg-black/60 px-3 py-1 border border-[#5c4033] rounded-sm">Round <span className="text-mythos-gold font-bold ml-1">{gameState.round}</span></div>
                 {gameState.networkMode === NetworkMode.Client && (
                     <div className="bg-blue-900/50 px-3 py-1 border border-blue-800 rounded-sm text-blue-200">
                         CLIENT MODE
                     </div>
                 )}
                 {gameState.networkMode === NetworkMode.Host && (
                     <div className="bg-red-900/50 px-3 py-1 border border-red-800 rounded-sm text-red-200">
                         HOST: {gameState.roomCode}
                     </div>
                 )}
                 <div className="bg-black/60 px-3 py-1 border border-[#5c4033] rounded-sm text-mythos-gold">
                    Moves: <span className="text-white font-bold ml-1">{currentPlayer.movesRemaining}</span> | 
                    Actions: <span className="text-white font-bold ml-1">{currentPlayer.actionsRemaining}</span>
                 </div>
                 <div className="bg-black/60 px-3 py-1 border border-[#5c4033] rounded-sm text-blue-300 shadow-[0_0_10px_rgba(0,100,255,0.2)]">
                    Evidence: <span className="text-white font-bold ml-1">{gameState.evidenceCollected} / {gameState.evidenceRequired}</span>
                 </div>
             </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#d4c5b0] tracking-wide uppercase text-sm font-serif">{currentPlayer.name}</span>
            </div>
            <button onClick={() => endTurn()} className="px-6 py-1.5 bg-[#5c1a1a] border border-red-900 rounded-sm text-xs uppercase font-bold hover:bg-red-900 transition-colors shadow-lg">End Turn</button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {gameState.phase === GamePhase.Lobby ? (
            !showTitleScreen ? (
            <div className="w-full h-full flex items-center justify-center p-6 bg-[#0a0a0c] bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                 <div className="bg-[#e8dfc5] p-6 max-w-[95vw] w-full h-[90vh] rounded-sm shadow-2xl border-8 border-[#2b1d0e] relative flex flex-col overflow-hidden">
                      {/* Paper Texture Overlay */}
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/parchment.png')] opacity-50 pointer-events-none mix-blend-multiply"></div>
                      
                      <div className="relative z-10 flex flex-col h-full">
                          <header className="border-b-2 border-black/80 pb-4 mb-4 flex justify-between items-end shrink-0">
                              <div className="flex items-center gap-4">
                                  <button 
                                    onClick={resetGame}
                                    className="p-2 border-2 border-black/20 rounded hover:bg-black/10 hover:border-black/50 transition-all text-black group"
                                    title="Return to Title Screen"
                                  >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 group-hover:-translate-x-1 transition-transform">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                      </svg>
                                  </button>
                                  <div>
                                      <h2 className="text-4xl text-black font-serif font-bold uppercase tracking-widest">Case File #892</h2>
                                      <p className="text-[#5c4033] italic mt-1">Classification: Top Secret // Paranormal</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-sm font-bold text-black uppercase">Session ID</div>
                                  <div className="text-2xl text-red-900 font-mono tracking-widest">{gameState.roomCode}</div>
                                  {gameState.networkMode === NetworkMode.Client && <div className="text-xs text-blue-800 font-bold mt-1">Connected as Client</div>}
                                  {gameState.networkMode === NetworkMode.Host && (
                                      <div className="text-xs font-bold mt-1 flex items-center justify-end gap-1">
                                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                          <span className="text-red-800">Hosting Server ({connectedClientsCount} Connected)</span>
                                      </div>
                                  )}
                              </div>
                          </header>

                          <div className="flex-1 flex gap-6 min-h-0">
                              {/* Left Column: Player Details & Roster */}
                              <div className="w-1/4 flex flex-col gap-6 border-r-2 border-black/10 pr-6">
                                  {!isRegistered && (
                                    <>
                                      <div>
                                          <label className="block text-black font-bold uppercase text-xs mb-2 tracking-widest">Investigator Name</label>
                                          <input 
                                            className="w-full bg-transparent border-b-2 border-black/50 p-2 text-xl font-serif text-[#2b1d0e] placeholder-black/30 focus:outline-none focus:border-red-900" 
                                            placeholder="Enter name..." 
                                            value={lobbyName} 
                                            onChange={e => setLobbyName(e.target.value)} 
                                          />
                                      </div>

                                      <div>
                                          <label className="block text-black font-bold uppercase text-xs mb-2 tracking-widest">Marker Color</label>
                                          <div className="flex gap-2 flex-wrap">
                                              {['#9f1239', '#b45309', '#15803d', '#1d4ed8', '#4c1d95', '#be123c'].map(c => (
                                                  <button 
                                                    key={c}
                                                    onClick={() => setPlayerColor(c)}
                                                    className={`w-8 h-8 rounded-full border-2 shadow-sm ${playerColor === c ? 'border-black scale-110' : 'border-transparent opacity-70'}`}
                                                    style={{ backgroundColor: c }}
                                                  />
                                              ))}
                                          </div>
                                      </div>
                                    </>
                                  )}
                                  
                                  {isRegistered && (
                                      <div className="bg-black/10 p-4 rounded border border-black/20 text-center">
                                          <div className="text-sm font-bold uppercase tracking-widest mb-1">Your Investigator</div>
                                          <div className="text-xl font-serif font-bold text-[#2b1d0e]">{myPlayer.name}</div>
                                          <div className="text-xs text-gray-600 italic">Waiting for mission start...</div>
                                          {/* Resend button for stuck clients */}
                                          {gameState.networkMode === NetworkMode.Client && (
                                              <button 
                                                onClick={joinGame}
                                                className="mt-2 text-[10px] uppercase text-red-800 underline hover:text-red-600 cursor-pointer"
                                              >
                                                  Resend Registration
                                              </button>
                                          )}
                                      </div>
                                  )}

                                  {gameState.networkMode === NetworkMode.Host && (
                                      <div>
                                          <label className="block text-black font-bold uppercase text-xs mb-2 tracking-widest">Difficulty</label>
                                          <select 
                                            className="w-full bg-[#dacbb6] border border-[#bfa68a] p-2 text-[#2b1d0e] font-serif focus:outline-none focus:border-red-900 shadow-inner"
                                            value={gameState.difficulty}
                                            onChange={(e) => setGameState(prev => ({...prev, difficulty: e.target.value as any}))}
                                          >
                                              <option value="Easy">★ Easy (Max 1 enemy/player)</option>
                                              <option value="Normal">★★ Normal (Max 2 enemies/player)</option>
                                              <option value="Hard">★★★ Hard (Max 3 enemies/player)</option>
                                          </select>
                                      </div>
                                  )}

                                  <div className="mt-auto flex-1 overflow-y-auto pr-2">
                                      <h3 className="text-black font-bold uppercase text-xs mb-2 tracking-widest sticky top-0 bg-[#e8dfc5] z-10 py-2">Team Roster</h3>
                                      <ul className="text-sm space-y-2">
                                          {gameState.players.map(p => (
                                              <li key={p.id} className="flex items-center gap-2 text-[#2b1d0e] font-serif border-b border-black/10 pb-1">
                                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }}></span>
                                                  <span className="font-bold truncate">{p.name}</span>
                                                  <span className="text-xs opacity-70 ml-2 whitespace-nowrap">{INVESTIGATOR_TEMPLATES.find(t => t.id === p.investigatorId)?.name}</span>
                                                  {p.isReady && <span className="ml-auto text-green-700 font-bold text-[10px] uppercase border border-green-600 px-1 rounded">Ready</span>}
                                              </li>
                                          ))}
                                          {gameState.players.length === 0 && <li className="text-black/40 italic">No investigators registered.</li>}
                                      </ul>
                                  </div>
                              </div>

                              {/* Middle Column: Grid Selection */}
                              <div className="flex-1 flex flex-col min-h-0 border-r-2 border-black/10 pr-6">
                                  <label className="block text-black font-bold uppercase text-xs mb-4 tracking-widest">Select Investigator Profile</label>
                                  {/* Compact grid to fit all 10 without scroll */}
                                  <div className={`flex-1 grid grid-cols-2 gap-3 content-start ${isRegistered ? 'opacity-50 pointer-events-none' : ''}`}>
                                       {INVESTIGATOR_TEMPLATES.map(t => (
                                           <div 
                                             key={t.id} 
                                             onClick={() => setSelectedInvId(t.id)} 
                                             onMouseEnter={() => setPreviewInvId(t.id)}
                                             onMouseLeave={() => setPreviewInvId(null)}
                                             className={`
                                                relative p-2 border-2 cursor-pointer transition-all duration-200 flex gap-3 items-center
                                                ${selectedInvId === t.id ? 'border-red-900 bg-[#d4c5b0] shadow-md' : 'border-[#bfa68a] bg-transparent hover:bg-[#efebe9]'}
                                             `}
                                           >
                                               <div className="w-12 h-12 bg-gray-300 border border-[#8b6b4b] shrink-0 overflow-hidden grayscale transition-all">
                                                   {t.image && <img src={t.image} alt={t.name} className="w-full h-full object-cover" />}
                                               </div>
                                               <div className="flex flex-col min-w-0">
                                                   <div className="font-serif font-bold text-base text-[#2b1d0e] leading-none truncate">{t.name}</div>
                                                   <div className="text-[10px] uppercase tracking-wider text-[#8b6b4b] truncate">{t.title}</div>
                                               </div>
                                               {selectedInvId === t.id && (
                                                   <div className="absolute top-2 right-2 text-red-900 text-lg">✓</div>
                                               )}
                                           </div>
                                       ))}
                                  </div>
                              </div>

                              {/* Right Column: Persistent Details Panel */}
                              <div className="w-1/3 flex flex-col min-h-0 bg-[#dacbb6]/30 border-2 border-[#bfa68a] p-4 rounded-sm relative shadow-inner">
                                   <div className="absolute -top-3 left-4 bg-[#e8dfc5] px-2 text-[10px] uppercase font-bold text-[#5c4033] tracking-widest border border-[#bfa68a]">
                                       Personnel Dossier
                                   </div>

                                   {/* Re-using logic from InvestigatorCard but making it static and larger */}
                                   <div className="flex-1 flex flex-col">
                                       <div className="flex justify-between items-start border-b border-[#bfa68a] pb-4 mb-4">
                                            <div className="flex gap-4">
                                                <div className="w-20 h-24 bg-gray-300 border border-[#8b6b4b] shrink-0 overflow-hidden shadow-sm">
                                                    {activeTemplate.image && <img src={activeTemplate.image} alt={activeTemplate.name} className="w-full h-full object-cover" />}
                                                </div>
                                                <div>
                                                    <div className="font-serif font-bold text-2xl text-[#2b1d0e] leading-none mb-1">{activeTemplate.name}</div>
                                                    <div className="text-xs uppercase tracking-wider text-[#8b6b4b] font-bold">{activeTemplate.title}</div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 text-xs font-bold text-[#2b1d0e]">
                                                <span className="bg-red-900/10 text-red-900 px-2 py-1 rounded border border-red-900/20">HP {activeTemplate.health}</span>
                                                <span className="bg-blue-900/10 text-blue-900 px-2 py-1 rounded border border-blue-900/20">SAN {activeTemplate.sanity}</span>
                                            </div>
                                        </div>

                                        <div className="mb-6 bg-[#dacbb6]/50 p-4 rounded border border-[#c9b8a0]">
                                            <div className="text-[10px] uppercase font-bold text-[#5c4033] mb-2 tracking-wide">Special Ability</div>
                                            <div className="text-sm italic text-[#2b1d0e] leading-relaxed font-serif">"{activeTemplate.ability}"</div>
                                        </div>

                                        <div className="mt-auto">
                                            <div className="text-[10px] uppercase font-bold text-[#5c4033] mb-2 tracking-wide text-center">Attributes</div>
                                            <div className="grid grid-cols-3 gap-3">
                                                {Object.entries(activeTemplate.attributes).map(([attr, val]) => (
                                                    <div key={attr} className="flex flex-col items-center bg-[#dacbb6] rounded-sm p-2 border border-[#c9b8a0]">
                                                        <span className="text-[9px] uppercase text-[#5c4033] font-bold tracking-tighter mb-1">{attr.substring(0,3)}</span>
                                                        <span className="text-xl font-serif font-bold text-[#2b1d0e]">{val}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                   </div>
                              </div>
                          </div>

                          <div className="mt-6 flex gap-4 pt-4 border-t-2 border-black/20 shrink-0">
                               {!isRegistered ? (
                                   <button 
                                     onClick={joinGame} 
                                     disabled={!selectedInvId || !lobbyName} 
                                     className="flex-1 py-3 bg-[#2b1d0e] text-[#e8dfc5] font-serif uppercase tracking-widest font-bold text-lg hover:bg-[#3e2b18] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                   >
                                      Register Investigator
                                   </button>
                               ) : (
                                   <>
                                     {gameState.networkMode === NetworkMode.Client ? (
                                         <button 
                                             onClick={toggleReady}
                                             className={`flex-1 py-3 font-serif uppercase tracking-widest font-bold text-lg shadow-lg border-2 transition-all
                                                 ${myPlayer.isReady 
                                                     ? 'bg-green-800 text-white border-green-900 hover:bg-green-700' 
                                                     : 'bg-[#5c4033] text-[#e8dfc5] border-[#2b1d0e] hover:bg-[#4a332a]'}
                                             `}
                                         >
                                             {myPlayer.isReady ? "Ready! (Waiting for Host)" : "Ready Up"}
                                         </button>
                                     ) : (
                                         <button 
                                           onClick={prepareItemDistribution} 
                                           className="flex-1 py-3 bg-red-900 text-white font-serif uppercase tracking-widest font-bold text-lg hover:bg-red-800 shadow-lg border-2 border-red-950"
                                         >
                                            Begin Investigation
                                         </button>
                                     )}
                                   </>
                               )}
                          </div>
                      </div>
                 </div>
            </div>
            ) : <div className="w-full h-full bg-[#0a0a0c]" /> 
        ) : gameState.phase === GamePhase.ItemDistribution ? (
            <div className="w-full h-full flex items-center justify-center p-6 bg-[#0a0a0c] relative">
                 <div className="bg-[#e8dfc5] p-6 max-w-5xl w-full h-[80vh] rounded-sm shadow-2xl border-4 border-[#2b1d0e] flex flex-col relative">
                     <h2 className="text-3xl font-serif font-bold text-[#2b1d0e] mb-4 text-center border-b border-[#2b1d0e] pb-2 uppercase tracking-widest">
                        Equip Investigators
                     </h2>
                     <p className="text-center text-[#5c4033] mb-6 italic">
                        {gameState.networkMode === NetworkMode.Client 
                            ? "The Host is distributing starting equipment..." 
                            : "Select an item, then select an investigator to assign it."}
                     </p>

                     <div className="flex-1 flex gap-6 min-h-0">
                         {/* Items Column */}
                         <div className="w-1/3 border-r border-[#bfa68a] pr-4 flex flex-col">
                             <h3 className="font-bold text-[#2b1d0e] uppercase text-xs mb-2 tracking-widest">Available Items</h3>
                             <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                 {distributionItems.map((item, idx) => (
                                     <div 
                                        key={idx}
                                        onClick={() => gameState.networkMode === NetworkMode.Host && setSelectedDistItem(idx)}
                                        className={`p-3 border rounded cursor-pointer transition-all ${
                                            selectedDistItem === idx 
                                            ? 'bg-[#2b1d0e] text-[#e8dfc5] border-[#2b1d0e]' 
                                            : 'bg-[#f3e9d2] text-[#2b1d0e] border-[#d1c2a5] hover:bg-[#e6d8b9]'
                                        } ${gameState.networkMode === NetworkMode.Client ? 'opacity-70 pointer-events-none' : ''}`}
                                     >
                                         <div className="font-bold font-serif">{item}</div>
                                         <div className="text-xs opacity-80">{ITEMS[item]?.type}</div>
                                     </div>
                                 ))}
                                 {distributionItems.length === 0 && (
                                     <div className="text-center text-gray-500 italic mt-10">No items remaining.</div>
                                 )}
                             </div>
                         </div>

                         {/* Players Column */}
                         <div className="flex-1 flex flex-col">
                             <h3 className="font-bold text-[#2b1d0e] uppercase text-xs mb-2 tracking-widest">Investigators</h3>
                             <div className="grid grid-cols-2 gap-4 overflow-y-auto pr-2">
                                 {gameState.players.map((p, idx) => (
                                     <div 
                                        key={p.id}
                                        onClick={() => gameState.networkMode === NetworkMode.Host && assignItemToPlayer(idx)}
                                        className={`cursor-pointer transition-transform hover:scale-[1.02] ${gameState.networkMode === NetworkMode.Client ? 'pointer-events-none' : ''}`}
                                     >
                                         <InvestigatorCard player={p} isActive={false} compact={true} />
                                     </div>
                                 ))}
                             </div>
                         </div>
                     </div>

                     {gameState.networkMode === NetworkMode.Host && (
                         <div className="mt-6 flex justify-end">
                             <button 
                               onClick={generateMapAndIntro}
                               className="px-8 py-3 bg-red-900 text-white font-serif uppercase tracking-widest font-bold shadow-lg hover:bg-red-800 border-2 border-red-950"
                             >
                                Start Game
                             </button>
                         </div>
                     )}
                 </div>
            </div>
        ) : (
            // MAIN GAME PLAYING AREA
            <div className="relative w-full h-full bg-[#0a0a0c]">
                 <MapBoard 
                    tiles={gameState.tiles}
                    tokens={gameState.tokens}
                    players={gameState.players}
                    monsters={gameState.monsters}
                    currentPlayerId={currentPlayer?.id || ''}
                    onTileClick={(t) => handleTileClick(t)}
                    onTokenClick={(t) => handleTokenClick(t)}
                    onMonsterClick={(m) => handleMonsterClick(m)}
                 />

                 {/* HUD / Current Player Card */}
                 {currentPlayer && (
                     <div className="absolute bottom-4 left-4 z-50 w-80 pointer-events-none">
                         <div className="pointer-events-auto transform transition-transform hover:scale-105 origin-bottom-left">
                            <InvestigatorCard 
                                player={currentPlayer} 
                                isActive={true} 
                                onUseItem={(item) => handleUseItem(item)}
                            />
                         </div>
                     </div>
                 )}

                 {/* LOG */}
                 <div className="absolute top-20 right-4 w-72 h-48 pointer-events-none flex flex-col justify-end">
                    <div className="bg-black/60 p-2 rounded text-xs text-gray-300 font-serif space-y-1 overflow-hidden flex flex-col justify-end h-full shadow-lg border border-gray-800/50 backdrop-blur-sm">
                        {gameState.log.slice(-6).map((msg, i) => (
                            <div key={i} className="animate-fade-in">{msg}</div>
                        ))}
                    </div>
                 </div>
            </div>
        )}

        {/* OVERLAYS */}
        
        {/* Dice Roller Overlay */}
        {gameState.phase === GamePhase.DiceRoll && gameState.activeDiceRoll && currentPlayer && (
             <DiceRoller 
                attribute={gameState.activeDiceRoll.attribute}
                amount={gameState.activeDiceRoll.count}
                target={gameState.activeDiceRoll.target}
                playerClues={currentPlayer.clues}
                playerColor={currentPlayer.color}
                playerItems={currentPlayer.items}
                usedItemAbilityRound={currentPlayer.usedItemAbilityRound}
                onComplete={(faces, cluesSpent) => {
                    const successes = faces.filter(f => f === DiceFace.ElderSign).length;
                    const success = successes >= gameState.activeDiceRoll!.target;
                    
                    if (cluesSpent > 0) {
                        setGameState(prev => ({
                            ...prev,
                            players: prev.players.map(p => p.id === currentPlayer.id ? { ...p, clues: p.clues - cluesSpent } : p)
                        }));
                    }
                    
                    // Centralized completion handler
                    handleActionComplete(gameState.activeDiceRoll!.context, success, faces);
                }}
                onConsumeItem={handleConsumeItem}
                onMarkItemUsed={handleMarkItemUsed}
                onCancel={() => {}} 
             />
        )}

        {/* Puzzle Overlay */}
        {gameState.phase === GamePhase.Puzzle && gameState.activePuzzle && (
            <>
                {gameState.activePuzzle.type === PuzzleType.Sliding && (
                    <SlidingPuzzle 
                        onComplete={() => handleActionComplete(gameState.activePuzzle!.context, true)} 
                        onFail={() => handleActionComplete(gameState.activePuzzle!.context, false)} 
                    />
                )}
                {gameState.activePuzzle.type === PuzzleType.Rune && (
                    <RunePuzzle 
                        onComplete={() => handleActionComplete(gameState.activePuzzle!.context, true)} 
                        onFail={() => handleActionComplete(gameState.activePuzzle!.context, false)} 
                    />
                )}
                {gameState.activePuzzle.type === PuzzleType.Code && (
                    <CodePuzzle 
                        onComplete={() => handleActionComplete(gameState.activePuzzle!.context, true)} 
                        onFail={() => handleActionComplete(gameState.activePuzzle!.context, false)} 
                    />
                )}
            </>
        )}

        {/* Mythos/Event Overlay */}
        {gameState.phase === GamePhase.Mythos && gameState.mythosEvent && (
            <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8">
                <div className="bg-[#2a1b15] border-4 border-red-900 p-8 max-w-2xl text-center shadow-[0_0_50px_rgba(255,0,0,0.2)] rounded-sm relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20 pointer-events-none"></div>
                    <h2 className="text-4xl text-red-600 font-serif font-bold mb-6 tracking-widest uppercase drop-shadow-md">Mythos Phase</h2>
                    <p className="text-xl text-[#d4c5b0] mb-8 font-serif leading-relaxed">{gameState.mythosEvent.text}</p>
                    <button 
                        onClick={endMythosPhase}
                        className="px-8 py-3 bg-red-900 hover:bg-red-800 text-white font-serif uppercase tracking-widest border border-red-950 shadow-lg"
                    >
                        Continue
                    </button>
                </div>
            </div>
        )}

        {/* Game Over / Victory Overlay */}
        {(gameState.phase === GamePhase.GameOver || gameState.phase === GamePhase.Victory) && (
            <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-8">
                <div className={`p-12 max-w-3xl text-center border-4 shadow-2xl ${gameState.phase === GamePhase.Victory ? 'bg-[#e8dfc5] border-yellow-600' : 'bg-[#1a0f0a] border-red-900'}`}>
                    <h1 className={`text-6xl font-serif font-bold mb-6 tracking-widest ${gameState.phase === GamePhase.Victory ? 'text-[#2b1d0e]' : 'text-red-700'}`}>
                        {gameState.phase === GamePhase.Victory ? "SURVIVED" : "DEFEATED"}
                    </h1>
                    <p className={`text-2xl font-serif mb-12 ${gameState.phase === GamePhase.Victory ? 'text-[#5c4033]' : 'text-gray-400'}`}>
                        {gameState.phase === GamePhase.Victory 
                            ? "You have escaped the manor with your lives and your sanity... mostly." 
                            : "The manor claims another soul. Your investigation ends here."}
                    </p>
                    <button 
                        onClick={resetGame}
                        className={`px-10 py-4 text-xl font-bold uppercase tracking-widest border-2 transition-all
                            ${gameState.phase === GamePhase.Victory 
                                ? 'bg-[#2b1d0e] text-[#e8dfc5] hover:bg-[#3e2b18]' 
                                : 'bg-red-900 text-white hover:bg-red-800'}`}
                    >
                        Return to Title
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;
