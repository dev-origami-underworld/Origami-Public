/**
 * Narrative Engine
 * Generates rich text descriptions based on room metadata.
 * Uses a dictionary of templates to ensure variety.
 */

const ADJECTIVES = [
  "damp", "ancient", "crumbling", "silent", "echoing", "shadowy", "dusty", "cold", "oppressive"
];

const ROOM_TYPES = {
  entrance: ["vestibule", "foyer", "entryway", "gatehouse"],
  hallway: ["corridor", "passage", "tunnel", "gallery"],
  chamber: ["room", "chamber", "hall", "crypt"]
};

const SMELLS = [
  "mildew", "ozone", "rotting wood", "old paper", "dust", "metallic tang"
];

export class NarrativeEngine {
  constructor() {
    this.rng = Math.random;
  }

  generateDescription(room) {
    const adj = this.pick(ADJECTIVES);
    const type = this.pick(ROOM_TYPES[room.type] || ["area"]);
    const smell = this.pick(SMELLS);
    
    return `You stand in a ${adj} ${type}. The air smells faintly of ${smell}.`;
  }

  pick(array) {
    return array[Math.floor(this.rng() * array.length)];
  }
}
