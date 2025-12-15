
import { GoogleGenAI, Type } from "@google/genai";
import { Player, Attribute } from "../types";

// Safe API Key retrieval for Browser/ESM environments
const getApiKey = () => {
  try {
    // Check for standard process.env (Node/Webpack/Vite with define)
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
    // Check for Vite's import.meta.env
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    console.warn("Could not read API Key environment variables", e);
  }
  return undefined;
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const MODEL = 'gemini-2.5-flash';

// Circuit breaker: if we hit a quota limit, stop trying to call the API for the session
let isOffline = !apiKey;

const generateWithRetry = async (fn: () => Promise<any>, retries = 1, delay = 1000): Promise<any> => {
    if (isOffline || !ai) throw new Error("Offline Mode");

    try {
        return await fn();
    } catch (error: any) {
        const isQuotaError = error?.status === 429 || 
                             error?.code === 429 || 
                             error?.message?.includes('quota') || 
                             error?.message?.includes('429') ||
                             error?.message?.includes('EXHAUSTED');

        if (isQuotaError) {
            console.log("Quota exceeded. Switching to offline fallback mode.");
            isOffline = true; // Trip the circuit breaker
            throw new Error("Quota Exceeded");
        }

        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateWithRetry(fn, retries - 1, delay * 2);
        }
        throw error;
    }
};

const cleanJson = (text: string) => {
    if (!text) return "";
    // Remove Markdown code blocks
    let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "");
    // Remove potential leading/trailing whitespace
    return clean.trim();
};

// --- Fallback Generators ---

const getFallbackIntro = () => ({
  title: "The Silent Manor",
  introText: "You stand before the looming doors of Blackwood Manor. A letter from an old friend summoned you here, but the house stands silent. The heavy oak doors are unlocked, inviting you into the darkness.",
  startingRoomDescription: "A grand foyer, choked with dust and shadows. Portraits of long-dead ancestors seem to watch your every move."
});

const getFallbackRoom = (direction: string, fromType: string, existingTypes: string[]) => {
    const isFromHallway = fromType === 'hallway';
    // Normalize existing types to lowercase for robust checking
    const normalizedTypes = existingTypes.map(t => t.toLowerCase());
    
    // Logic: If from hallway, give room. If from room, give hallway.
    if (!isFromHallway) {
        return {
             name: "Corridor",
             description: "A narrow, paneled hallway stretching into darkness.",
             visualType: "hallway",
             searchPoints: [
                 { description: "A discarded note", attribute: "Observation" },
                 { description: "A loose floorboard", attribute: "Strength" }
             ]
        };
    }
    
    // Check missing mandatory rooms
    const mandatory = [
        { id: 'kitchen', name: "Kitchen", desc: "Smells of rot.", type: "kitchen", points: [{d: "Pantry", a: "Observation"}, {d: "Icebox", a: "Strength"}] },
        { id: 'bathroom', name: "Bathroom", desc: "Dripping tap.", type: "bathroom", points: [{d: "Medicine Cabinet", a: "Lore"}, {d: "Bathtub", a: "Observation"}] }
    ];

    const missing = mandatory.filter(m => !normalizedTypes.includes(m.id));

    if (missing.length > 0) {
        // Pick random missing mandatory room
        const pick = missing[Math.floor(Math.random() * missing.length)];
        return {
             name: pick.name,
             description: pick.desc,
             visualType: pick.type,
             searchPoints: pick.points.map(p => ({ description: p.d, attribute: p.a }))
        };
    }

    const rooms = [
        { name: "Dusty Library", desc: "Shelves lined with rotting books.", type: "study", points: [{d: "Ancient Tome", a: "Lore"}, {d: "Desk Drawer", a: "Observation"}] },
        { name: "Guest Bedroom", desc: "The bed is made, but cold.", type: "bedroom", points: [{d: "Under mattress", a: "Observation"}, {d: "Wardrobe", a: "Strength"}] },
        { name: "Master Bedroom", desc: "The grandeur has faded.", type: "bedroom", points: [{d: "Vanity", a: "Influence"}, {d: "Jewelry Box", a: "Agility"}] },
        { name: "Storage Closet", desc: "Filled with junk.", type: "closet", points: [{d: "Old boxes", a: "Strength"}, {d: "Shelf", a: "Observation"}] },
        { name: "Ritual Chamber", desc: "Bloodstains mar the floor.", type: "ritual", points: [{d: "The Altar", a: "Will"}, {d: "Runes", a: "Lore"}] }
    ];
    
    const available = rooms.filter(r => 
        (r.type === 'bedroom' || r.type === 'closet') || !normalizedTypes.includes(r.type)
    );

    const pool = available.length > 0 ? available : rooms.filter(r => r.type === 'bedroom' || r.type === 'closet');
    const idx = Date.now() % pool.length;
    const fallback = pool[idx];
    
    return {
      name: fallback.name,
      description: fallback.desc,
      visualType: fallback.type,
      searchPoints: fallback.points.map(p => ({ description: p.d, attribute: p.a }))
    };
};

const getFallbackMythos = (threatLevel: number) => {
   if (threatLevel < 3) {
      return { 
        narrative: "A cold draft extinguishes the candles for a moment. You feel watched.", 
        type: 'FLAVOR', 
        param: 'None' 
      };
   } else if (threatLevel < 6) {
      return { 
        narrative: "A sudden noise from the darkness tests your nerves! Test Willpower.", 
        type: 'TEST', 
        param: 'Will' 
      };
   } else {
      return { 
        narrative: "Something emerges from the shadows! A monster appears!", 
        type: 'SPAWN', 
        param: 'Monster' 
      };
   }
};

const getFallbackInsanity = () => {
    const objectives = [
        "You must end the game with at least 2 items in your inventory.",
        "You must not attack any monsters for the rest of the game.",
        "You must try to set fire to the mansion (Roleplay only).",
        "You are convinced another investigator is a doppelganger. Do not end your turn in their space."
    ];
    return objectives[Date.now() % objectives.length];
};

// --- API Functions ---

export const generateIntro = async (difficulty: string, investigators: Player[]) => {
  if (isOffline) return getFallbackIntro();

  const names = investigators.map(p => p.name).join(", ");
  const prompt = `
    Intro for Mansions of Madness style game.
    Diff: ${difficulty}. Inv: ${names}.
    Theme: Lovecraft.
    Output JSON: {title, introText, startingRoomDescription}
  `;

  try {
    const response = await generateWithRetry(() => ai!.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2000, 
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            introText: { type: Type.STRING },
            startingRoomDescription: { type: Type.STRING }
          }
        }
      }
    }));
    
    const text = response.text;
    if (!text) throw new Error("No text");
    return JSON.parse(cleanJson(text));
  } catch (error) {
    console.error("API Error (Intro), using fallback:", error);
    return getFallbackIntro();
  }
};

export const generateRoomDiscovery = async (direction: string, context: string, fromRoomType: string, existingTypes: string[]) => {
  if (isOffline) return getFallbackRoom(direction, fromRoomType, existingTypes);
  
  const normalizedExisting = existingTypes.map(t => t.toLowerCase());
  const bedroomCount = normalizedExisting.filter(t => t === 'bedroom').length;
  const closetCount = normalizedExisting.filter(t => t === 'closet').length;
  
  const missingMandatory = [];
  if (!normalizedExisting.includes('kitchen')) missingMandatory.push('kitchen');
  if (!normalizedExisting.includes('bathroom')) missingMandatory.push('bathroom');
  if (bedroomCount < 3) missingMandatory.push('bedroom');
  if (closetCount < 2) missingMandatory.push('closet');

  const safeContext = context || '';

  const prompt = `
    Generating a new map tile to the ${direction}.
    Current Location Type: ${fromRoomType}.
    Existing Room Types: ${normalizedExisting.join(', ')}.
    Missing Mandatory Rooms: ${missingMandatory.join(', ')}.
    Context: ${safeContext.slice(-500)}.
    
    ESTATE LOGIC:
    1. Structure: Rooms should mostly connect via 'hallway'. If current is Room, generate 'hallway'. If current is Hallway, generate Room.
    2. Constraints:
       - ONLY 1 OF EACH: Kitchen, Bathroom, Dining, Study, Ritual, Garden. DO NOT REPEAT THESE.
       - CAN REPEAT: Bedroom (Aim for 3+), Closet (Aim for 2+), Hallway.
    3. Priorities: 
       - If 'hallway', prioritize generating Missing Mandatory Rooms (${missingMandatory.join(', ')}).
    
    IMPORTANT: Provide 2 or 3 distinct 'searchPoints' (Interactable objects like desks, shelves, bodies) in the room to encourage exploration.
    
    Output JSON: {
       name, 
       description, 
       visualType (OPTIONS: hallway, study, bedroom, dining, garden, ritual, kitchen, bathroom, closet), 
       searchPoints: [{ description, attribute }]
    }
  `;

  try {
    const response = await generateWithRetry(() => ai!.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2000,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            visualType: { type: Type.STRING },
            searchPoints: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING },
                        attribute: { type: Type.STRING, enum: ["Strength", "Agility", "Observation", "Lore", "Influence", "Will"] }
                    }
                }
            }
          }
        }
      }
    }));
    return JSON.parse(cleanJson(response.text || ""));
  } catch (error) {
    console.error("API Error (Room), using fallback:", error);
    return getFallbackRoom(direction, fromRoomType, existingTypes);
  }
};

export const generateInvestigationOutcome = async (
  tokenDesc: string,
  success: boolean,
  context: string,
  foundObject?: string
) => {
  if (isOffline) {
      if (!success) return `You search the ${tokenDesc} but find nothing of value.`;
      if (foundObject) return `You rummage through the ${tokenDesc} and find ${foundObject}.`;
      return `You search the ${tokenDesc} and find a clue.`;
  }

  const safeContext = context || '';

  const prompt = `
    Action: Investigator searches ${tokenDesc}.
    Result: ${success ? "SUCCESS" : "FAILURE"}.
    ${success && foundObject ? `Found Item: ${foundObject}` : ''}
    Context: ${safeContext.slice(-500)}.
    
    Write a short immersive description (approx 2 sentences) of the search action and the result.
    ${success && foundObject ? `Describe finding the ${foundObject} clearly.` : 'Describe finding nothing useful.'}
    Do not mention "added to inventory" or game mechanics.
    IMPORTANT: Ensure the response is a complete sentence and ends with a period.
  `;

  try {
    const response = await generateWithRetry(() => ai!.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { maxOutputTokens: 800 }
    }));
    return response.text;
  } catch (error) {
    console.error("API Error (Investigate), using fallback:", error);
    return success ? `You found ${foundObject || 'something'}.` : "You found nothing.";
  }
};

export const generateMythosEvent = async (context: string, threatLevel: number) => {
  if (isOffline) return getFallbackMythos(threatLevel);

  // Note: context param not used in prompt currently, but keeping signature for potential usage
  
  const prompt = `
    Generate Mythos Event. Threat Level (1-10): ${threatLevel}.
    Logic: 
    - Low threat (1-3): Atmospheric, flavor text mostly.
    - Med threat (4-7): Spawn monsters OR skill tests. Do NOT always spawn.
    - High threat (8+): Hard monsters or hard tests.
    IMPORTANT: Do not spawn monsters every time. Favor atmospheric horror or tests unless threat is very high.
    
    Output JSON:
    {
      "narrative": "Story text describing the event",
      "type": "SPAWN" | "TEST" | "FLAVOR",
      "param": "Attribute name for TEST (e.g. Will), or 'Monster' for SPAWN, or null"
    }
  `;

  try {
    const response = await generateWithRetry(() => ai!.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1000,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             narrative: { type: Type.STRING },
             type: { type: Type.STRING, enum: ["SPAWN", "TEST", "FLAVOR"] },
             param: { type: Type.STRING }
          }
        }
      }
    }));
    return JSON.parse(cleanJson(response.text || ""));
  } catch (error) {
    console.error("API Error (Mythos), using fallback:", error);
    return getFallbackMythos(threatLevel);
  }
};

export const generateInsanityCondition = async (context: string) => {
    if (isOffline) return getFallbackInsanity();

    const safeContext = context || '';

    const prompt = `
      The investigator has gone INSANE. Generate a secret objective that involves betrayal or a selfish goal.
      It should be concise and playable.
      Context: ${safeContext.slice(-200)}
      Examples: "You must steal the artifact and escape.", "You must end the game with no other survivors in your room.", "You must hoard at least 3 items."
      Output just the instruction text.
    `;

    try {
        const response = await generateWithRetry(() => ai!.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: { maxOutputTokens: 200 }
        }));
        return response.text;
    } catch (error) {
        console.error("API Error (Insanity), using fallback:", error);
        return getFallbackInsanity();
    }
};
