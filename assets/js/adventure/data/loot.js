/**
 * Loot Data Definitions
 * Master list of all items in the game following the Origami Dungeon specification.
 */

export const LOOT_DATA = [
    {
        id: "wep_katana_std",
        baseType: "Longsword",
        japaneseName: "Katana",
        kanjiName: "刀",
        category: "Weapon",
        stats: {
            damage: "1d8",
            damageType: "Slash",
            value: 150,
            weight: 3
        },
        description: "The soul of the samurai. A curved blade folded a thousand times. Reliable and sharp.",
        modelId: "swordA",
        rarity: "Common"
    },
    {
        id: "wep_tanto_std",
        baseType: "Dagger",
        japaneseName: "Tanto",
        kanjiName: "短刀",
        category: "Weapon",
        stats: {
            damage: "1d4",
            damageType: "Pierce",
            value: 80,
            weight: 1
        },
        description: "A short blade for close quarters. Often used for ritual purposes or as a sidearm.",
        modelId: "daggerA",
        rarity: "Common"
    },
    {
        id: "pot_health_small",
        baseType: "Health Potion",
        japaneseName: "Kaifuku",
        kanjiName: "回復",
        category: "Consumable",
        stats: {
            effect: "Restores 2d4+2 HP",
            value: 50,
            weight: 0.5
        },
        description: "A beaker of glowing green liquid. Smells faintly of matcha tea.",
        modelId: "potionA",
        rarity: "Common"
    },
    {
        id: "scroll_fireball",
        baseType: "Scroll",
        japaneseName: "Katon",
        kanjiName: "火遁",
        category: "Magic",
        stats: {
            effect: "Casts Fireball (3d6 Fire)",
            value: 200,
            weight: 0.1
        },
        description: "An ancient parchment inscribed with burning runes. Warm to the touch.",
        modelId: "scrollA",
        rarity: "Uncommon"
    },
    {
        id: "treasure_coin_pouch",
        baseType: "Treasure",
        japaneseName: "Koban",
        kanjiName: "小判",
        category: "Treasure",
        stats: {
            value: 100,
            weight: 0.5
        },
        description: "A small pouch containing oval gold coins used in the Edo period.",
        modelId: "coinPouch",
        rarity: "Common"
    }
];

export function getLootById(id) {
    return LOOT_DATA.find(item => item.id === id);
}

export function getRandomLoot(rarity = null) {
    let pool = LOOT_DATA;
    if (rarity) {
        pool = pool.filter(item => item.rarity === rarity);
    }
    return pool[Math.floor(Math.random() * pool.length)];
}
