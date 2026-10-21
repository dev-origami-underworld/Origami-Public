import { CoreMixin } from './Core.js';
import { WorldGenMixin } from './WorldGen.js';
import { EntitiesMixin } from './Entities.js';
import { CombatMixin } from './Combat.js';
import { ItemsMixin } from './Items.js';

export class OrigamiEngine {
    constructor() {
        // Compose the God Object into a single Class Instance via ES6 Mixins
        Object.assign(
            this,
            CoreMixin,
            WorldGenMixin,
            EntitiesMixin,
            CombatMixin,
            ItemsMixin
        );
        
        // Ensure object properties (like player, arrays) are deeply cloned for the instance
        // so multiple instances wouldn't share prototype arrays (future proofing)
        this.player = JSON.parse(JSON.stringify(CoreMixin.player));
        this.lootItems = [];
        this.boulders = [];
        this.spells = [];
        this.mapData = [];
        this.mapFlags = {};
        this.mapEntities = {};
        this.rooms = [];
        this.halls = [];
        this.mobs = [];
        this.decor = [];
    }
}
