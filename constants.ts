
import { Investigator, Attribute } from './types';

// Generic image generator for Portraits and Monsters (Art style)
export const generateImage = (prompt: string) => 
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " lovecraftian horror arkham horror card game style digital art dark lighting high detailed")}?width=512&height=512&nologo=true`;

// Specific generator for Map Tiles to ensure consistent Perspective (Top Down) and Size
export const generateRoomImage = (prompt: string, widthTiles: number = 1, heightTiles: number = 1) => {
  if (!prompt) return ""; 
  // Truncate prompt to prevent 414 URI Too Long errors
  const safePrompt = prompt.slice(0, 300); 
  const seed = Math.floor(Math.random() * 100000);

  // Calculate pixel dimensions based on tile ratio
  // REDUCED SCALE FOR SPEED (256px per tile unit instead of 512px)
  const baseScale = 256;
  const maxDimension = 768;
  
  let w = widthTiles * baseScale;
  let h = heightTiles * baseScale;
  
  // Scale down if too large while maintaining aspect ratio
  if (w > maxDimension || h > maxDimension) {
      const scale = maxDimension / Math.max(w, h);
      w = Math.floor(w * scale);
      h = Math.floor(h * scale);
  }
  
  // Ensure minimum size
  w = Math.max(w, 256);
  h = Math.max(h, 256);

  // Enforce flat top-down perspective
  const perspectivePrompts = "perfectly flat top down 2d overhead view battlemap floor plan, orthographic view, architectural drawing, no perspective, 90 degree viewing angle";
  
  // Using model=flux for best instruction adherence (doors), but relying on smaller dimensions for speed
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(perspectivePrompts + " of " + safePrompt + " lovecraftian horror arkham horror card game style digital art dark lighting high detailed")}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux`;
};

export const INVESTIGATOR_TEMPLATES: Investigator[] = [
  {
    id: 'inv_1',
    name: 'Father Mateo',
    title: 'The Priest',
    ability: 'Once per round, you may re-roll any number of dice during a Will check.',
    health: 7,
    sanity: 7,
    image: generateImage("portrait of Father Mateo catholic priest holding a bible and rosary stern face glowing magic"),
    attributes: {
      [Attribute.Strength]: 2,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 3,
      [Attribute.Lore]: 4,
      [Attribute.Influence]: 5,
      [Attribute.Will]: 5
    }
  },
  {
    id: 'inv_2',
    name: 'Wendy Adams',
    title: 'The Urchin',
    ability: 'You may evade monsters using Agility instead of Observation.',
    health: 7,
    sanity: 7,
    image: generateImage("portrait of Wendy Adams young orphan girl with an amulet dark moody street urchin"),
    attributes: {
      [Attribute.Strength]: 2,
      [Attribute.Agility]: 5,
      [Attribute.Observation]: 4,
      [Attribute.Lore]: 3,
      [Attribute.Influence]: 3,
      [Attribute.Will]: 4
    }
  },
  {
    id: 'inv_3',
    name: 'Harvey Walters',
    title: 'The Professor',
    ability: 'Start with 1 extra Clue. You may hold 2 additional cards in your hand.',
    health: 6,
    sanity: 8,
    image: generateImage("portrait of Harvey Walters old professor university suit monocle holding ancient tome"),
    attributes: {
      [Attribute.Strength]: 2,
      [Attribute.Agility]: 2,
      [Attribute.Observation]: 5,
      [Attribute.Lore]: 5,
      [Attribute.Influence]: 3,
      [Attribute.Will]: 4
    }
  },
  {
    id: 'inv_4',
    name: 'Leo Anderson',
    title: 'The Expedition Leader',
    ability: 'Once per round, a friendly investigator in your space gains 1 Action.',
    health: 8,
    sanity: 6,
    image: generateImage("portrait of Leo Anderson rugged expedition leader trenchcoat explorer"),
    attributes: {
      [Attribute.Strength]: 4,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 4,
      [Attribute.Lore]: 2,
      [Attribute.Influence]: 4,
      [Attribute.Will]: 3
    }
  },
  {
    id: 'inv_5',
    name: 'Agatha Crane',
    title: 'The Parapsychologist',
    ability: 'When you perform a Lore check to solve a puzzle, add +1 to your roll result.',
    health: 6,
    sanity: 8,
    image: generateImage("portrait of Agatha Crane woman parapsychologist 1920s scientist ghost hunter"),
    attributes: {
      [Attribute.Strength]: 2,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 4,
      [Attribute.Lore]: 5,
      [Attribute.Influence]: 3,
      [Attribute.Will]: 4
    }
  },
  {
    id: 'inv_6',
    name: 'Preston Fairmont',
    title: 'The Millionaire',
    ability: 'You may spend Resources to convert 1 die result to a Success.',
    health: 7,
    sanity: 7,
    image: generateImage("portrait of Preston Fairmont wealthy millionaire tuxedo arrogant 1920s"),
    attributes: {
      [Attribute.Strength]: 3,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 3,
      [Attribute.Lore]: 2,
      [Attribute.Influence]: 5,
      [Attribute.Will]: 3
    }
  },
  {
    id: 'inv_7',
    name: 'William Yorick',
    title: 'The Gravedigger',
    ability: 'When you defeat a monster, you may retrieve 1 Item from the discard pile.',
    health: 9,
    sanity: 5,
    image: generateImage("portrait of William Yorick gravedigger with shovel and lantern rugged"),
    attributes: {
      [Attribute.Strength]: 5,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 3,
      [Attribute.Lore]: 2,
      [Attribute.Influence]: 2,
      [Attribute.Will]: 4
    }
  },
  {
    id: 'inv_8',
    name: 'Akachi Onyele',
    title: 'The Shaman',
    ability: 'When performing a spell action, you may look at the top card of the spell deck.',
    health: 6,
    sanity: 8,
    image: generateImage("portrait of Akachi Onyele african shaman priestess magic staff glowing eyes"),
    attributes: {
      [Attribute.Strength]: 3,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 2,
      [Attribute.Lore]: 5,
      [Attribute.Influence]: 3,
      [Attribute.Will]: 5
    }
  },
  {
    id: 'inv_9',
    name: 'Carson Sinclair',
    title: 'The Butler',
    ability: 'As an action, you may give another investigator 1 of your actions.',
    health: 6,
    sanity: 8,
    image: generateImage("portrait of Carson Sinclair butler suit formal loyal grim expression"),
    attributes: {
      [Attribute.Strength]: 2,
      [Attribute.Agility]: 2,
      [Attribute.Observation]: 4,
      [Attribute.Lore]: 3,
      [Attribute.Influence]: 4,
      [Attribute.Will]: 4
    }
  },
  {
    id: 'inv_10',
    name: 'Diana Stanley',
    title: 'The Redeemed Cultist',
    ability: 'When you would take Horror, you may discard 1 Item to negate 1 Horror.',
    health: 7,
    sanity: 7,
    image: generateImage("portrait of Diana Stanley woman cultist robes redeemed determined dark magic"),
    attributes: {
      [Attribute.Strength]: 3,
      [Attribute.Agility]: 3,
      [Attribute.Observation]: 3,
      [Attribute.Lore]: 4,
      [Attribute.Influence]: 2,
      [Attribute.Will]: 5
    }
  }
];

export interface ItemDef {
  name: string;
  type: 'Weapon' | 'Utility' | 'Relic';
  description: string;
}

export const ITEMS: Record<string, ItemDef> = {
  // WEAPONS
  "Old Revolver": { name: "Old Revolver", type: "Weapon", description: "+1 Damage. A rusty but reliable firearm." },
  "Rusty Knife": { name: "Rusty Knife", type: "Weapon", description: "+1 Damage. Dangerous in close quarters." },
  "Holy Water": { name: "Holy Water", type: "Weapon", description: "+1 Damage. INSTANTLY banishes Spirits." },
  "Crowbar": { name: "Crowbar", type: "Weapon", description: "+1 Damage." },
  "Brass Knuckles": { name: "Brass Knuckles", type: "Weapon", description: "+1 Damage. Up close and personal." },
  "Shotgun": { name: "Shotgun", type: "Weapon", description: "+2 Damage. Devastating at close range." },
  "Ritual Dagger": { name: "Ritual Dagger", type: "Weapon", description: "+1 Damage. Magical properties." },
  
  // UTILITY / RELICS
  "Lantern": { name: "Lantern", type: "Utility", description: "Use to add +3 Dice to Observation. (Consumed)" },
  "Bandages": { name: "Bandages", type: "Utility", description: "Use to heal 1 Health. (Consumed)" },
  "Ancient Tome": { name: "Ancient Tome", type: "Relic", description: "Passive: +1 Die on Lore checks." },
  "Pocket Watch": { name: "Pocket Watch", type: "Relic", description: "Use to gain +2 Actions immediately. (Consumed)" },
  "Magnifying Glass": { name: "Magnifying Glass", type: "Utility", description: "Passive: +1 Die on Observation checks." },
  "Elder Sign": { name: "Elder Sign", type: "Relic", description: "Passive: +1 Die on Will checks." },
  "Painkillers": { name: "Painkillers", type: "Utility", description: "Use to heal 2 Health, but take 1 Horror. (Consumed)" },
  "Smelling Salts": { name: "Smelling Salts", type: "Utility", description: "Use to heal 2 Sanity. (Consumed)" },
  "Kerosene": { name: "Kerosene", type: "Utility", description: "Use to deal 3 Damage to a monster in your space. (Consumed)" },
  "Lockpick": { name: "Lockpick", type: "Utility", description: "Use to add +3 Dice to Agility. (Consumed)" },
  
  // SPECIAL
  "First Aid Kit": { name: "First Aid Kit", type: "Utility", description: "Use to heal 2 Health. (Consumed)" },
  "Lucky Cigarette Case": { name: "Lucky Cigarette Case", type: "Relic", description: "Use to add +2 Dice to any roll. (Consumed)" },
  "Detective's Journal": { name: "Detective's Journal", type: "Utility", description: "Once per round: Convert 1 Clue to a Success." },
  "Eldritch Glyph": { name: "Eldritch Glyph", type: "Relic", description: "Use to convert ALL Clues to Successes. (Consumed)" }
};

export const STARTING_ITEMS = Object.keys(ITEMS);

export const DICE_FACES = [
  'PASS', 'PASS', 'PASS', // 3 Elder Signs
  'CLUE', 'CLUE',         // 2 Clues
  'FAIL', 'FAIL', 'FAIL'  // 3 Blanks
];

export const MONSTER_TEMPLATES = [
  // Tier 1: Early Game / Easy
  { id: 'm_cultist', name: 'Cultist', tier: 1, health: 2, damage: 0, horror: 1, image: generateImage("lovecraftian cultist in robes holding dagger scary face") },
  { id: 'm_rat', name: 'Swarm of Rats', tier: 1, health: 1, damage: 1, horror: 0, image: generateImage("swarm of black rats red eyes vicious biting") },
  { id: 'm_maniac', name: 'Crazed Maniac', tier: 1, health: 3, damage: 1, horror: 0, image: generateImage("crazed maniac bloody axe insane expression asylum patient") },

  // Tier 2: Mid Game (NERFED from original)
  { id: 'm_deepone', name: 'Deep One', tier: 2, health: 4, damage: 1, horror: 0, image: generateImage("deep one fish man monster scales claws scary") },
  { id: 'm_ghost', name: 'Vengeful Spirit', tier: 2, health: 4, damage: 0, horror: 1, image: generateImage("vengeful spirit ghost translucent scary screaming face") },
  { id: 'm_hound', name: 'Hound of Tindalos', tier: 2, health: 5, damage: 1, horror: 1, image: generateImage("hound of tindalos alien dog geometric angular teeth scary") },

  // Tier 3: Late Game / Boss (NERFED from original)
  { id: 'm_shoggoth', name: 'Shoggoth', tier: 3, health: 10, damage: 2, horror: 2, image: generateImage("shoggoth blob of eyes and mouths slime monster massive terrifying") },
  { id: 'm_starspawn', name: 'Star Spawn', tier: 3, health: 12, damage: 2, horror: 3, image: generateImage("star spawn of cthulhu giant winged octopus face monster massive") }
];
