
export enum Attribute {
  Strength = 'Strength',
  Agility = 'Agility',
  Observation = 'Observation',
  Lore = 'Lore',
  Influence = 'Influence',
  Will = 'Will'
}

export interface Investigator {
  id: string;
  name: string;
  title: string;
  ability: string;
  health: number;
  sanity: number;
  attributes: Record<Attribute, number>;
  image?: string;
}

export interface Player {
  id: string;
  name: string;
  investigatorId: string;
  color: string; // Dice color
  clues: number;
  items: string[];
  health: number;
  sanity: number;
  attributes: Record<Attribute, number>; // Added attributes to player state
  x: number;
  y: number;
  movesRemaining: number;
  actionsRemaining: number;
  image?: string;
  // New Status Flags
  isWounded: boolean;
  isInsane: boolean;
  secretObjective?: string;
  usedItemAbilityRound?: boolean; // Track if they used a "Once per round" item
  isReady: boolean; // Lobby Ready Status
}

export interface Monster {
  id: string;
  templateId: string;
  name: string;
  health: number;
  maxHealth: number;
  damage: number; // Physical damage
  horror: number; // Sanity damage
  x: number;
  y: number;
  tier: 1 | 2 | 3;
  image?: string;
}

export enum TokenType {
  Explore = 'Explore',
  Search = 'Search',
  Interact = 'Interact',
  Sight = 'Sight',
  Escape = 'Escape' // New Token Type
}

export interface Token {
  id: string;
  type: TokenType;
  x: number;
  y: number;
  description: string; // "Heavy Door", "Strange Book"
  resolved: boolean;
  requiredAttribute?: Attribute; // For skill checks
  difficulty?: number;
  direction?: 'North' | 'South' | 'East' | 'West'; // For door placement
}

export interface Tile {
  id: string;
  roomId: string; // New: unique ID for the logical room (group of tiles)
  name: string;
  description: string;
  x: number; // Grid X
  y: number; // Grid Y
  imageType: 'hallway' | 'study' | 'bedroom' | 'dining' | 'garden' | 'ritual' | 'kitchen' | 'bathroom' | 'closet';
  // New visual properties for single-image rooms
  roomImage?: string;
  roomX?: number; // Min X of the room
  roomY?: number; // Min Y of the room
  roomWidth?: number; // Width in tiles
  roomHeight?: number; // Height in tiles
}

export enum GamePhase {
  Lobby = 'LOBBY',
  ItemDistribution = 'ITEM_DISTRIBUTION', // New phase
  Setup = 'SETUP', // Item distribution
  Playing = 'PLAYING',
  Mythos = 'MYTHOS', // New phase
  DiceRoll = 'DICE_ROLL',
  Puzzle = 'PUZZLE', // New Phase
  GameOver = 'GAME_OVER',
  Victory = 'VICTORY' // New Phase
}

export enum PuzzleType {
  Sliding = 'SLIDING',
  Rune = 'RUNE',
  Code = 'CODE'
}

export enum DiceFace {
  ElderSign = 'PASS',
  Clue = 'CLUE',
  Blank = 'FAIL'
}

export enum NetworkMode {
  Offline = 'OFFLINE',
  Host = 'HOST',
  Client = 'CLIENT'
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  difficulty: 'Easy' | 'Normal' | 'Hard';
  round: number; // Track rounds for difficulty
  players: Player[];
  monsters: Monster[]; // Active monsters
  currentPlayerIndex: number;
  tiles: Tile[];
  tokens: Token[];
  itemDeck: string[]; // Track unique items available to be found
  log: string[];
  storyContext: string; // History for AI
  evidenceCollected: number; // New: Current evidence
  evidenceRequired: number;  // New: Goal
  isEscapeOpen: boolean;     // New: Phase flag
  networkMode: NetworkMode;  // New: Track if online
  activeDiceRoll?: {
    playerId: string;
    attribute: Attribute;
    count: number;
    target: number; // Number of successes needed
    onSuccess: (rolls: DiceFace[]) => void;
    onFail: (rolls: DiceFace[]) => void;
    description: string;
  };
  activePuzzle?: {
    type: PuzzleType;
    token: Token;
    onSuccess: () => void;
    onFail: () => void;
  };
  mythosEvent?: {
    text: string;
    type: 'SPAWN' | 'TEST' | 'FLAVOR';
  };
}
