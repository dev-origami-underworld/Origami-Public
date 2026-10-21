export const ItemsMixin = {
spawnLoot(gridX, gridZ) {
                // Ensure spawnLootCard has been initialized (which it should be via initMap)
                if (typeof this.spawnLootCard !== 'function') return;

                const LOOT_CARDS = [
                    { name:'BOULDER',   el:'EARTH',  kanji:'\u5730', desc:'Heavy impact.',  attr:'SKILL CARD' },
                    { name:'FISSURE',   el:'EARTH',  kanji:'\u5730', desc:'Sunders earth.', attr:'SKILL CARD' },
                    { name:'GALE',      el:'WIND',   kanji:'\u98a8', desc:'Forceful gust.', attr:'SKILL CARD' },
                    { name:'FIREBALL',  el:'FIRE',   kanji:'\u706b', desc:'Inferno star.',  attr:'SKILL CARD' },
                    { name:'SURGE',     el:'WATER',  kanji:'\u6c34', desc:'Crashing wave.', attr:'SKILL CARD' },
                    { name:'SLASH',     el:'KATANA', kanji:'\u65ac', desc:'Basic slash.',   attr:'SKILL CARD' },
                    { name:'SHIELD',    el:'ITEM', kanji:'\u76fe', desc:'Armor.',      attr:'SKILL CARD' },
                    { name:'POTION',    el:'SCROLL',   kanji:'\u5177', desc:'Consumable',  attr:'SKILL CARD' },
                    { name:'SHURIKEN',  el:'MISSILE',kanji:'\u6295', desc:'Ranged Wep.', attr:'SKILL CARD' },
                    { name:'SHORT BOW', el:'MISSILE',kanji:'\u5f13', desc:'Quick shot.',    attr:'SKILL CARD' },
                    { name:'LONG BOW',  el:'MISSILE',kanji:'\u9577', desc:'Heavy shot.',    attr:'SKILL CARD' },
                    { name:'COINS',     el:'GOLD_COIN', kanji:'\u91d1', desc:'Wealth.',     attr:'GOLD' }
                ];
                
                const lc = LOOT_CARDS[Math.floor(Math.random() * LOOT_CARDS.length)];
                
                let attr = lc.attr;
                if (lc.el === 'GOLD_COIN') {
                    attr = '+' + (Math.random() < 0.5 ? 50 : 100) + ' GOLD';
                }
                
                this.spawnLootCard(gridX, gridZ, lc.el, lc.name, lc.desc, lc.kanji, attr);
                window.parent.postMessage({ type: 'LOG_EVENT', text: `You hear a card drop to the floor.`, logType: 'system' }, '*');
            }
};
