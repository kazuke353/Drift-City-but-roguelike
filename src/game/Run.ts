import { Rng } from '../core/Rng';
import { Save } from '../core/Save';
import { baseStats, StatBuilder, type CarStats } from './Stats';
import { CHASSIS_MAP, type ChassisDef } from './Cars';
import { starterItems, generateItem, SLOTS, type Item, type Slot, type Rarity } from '../loot/Items';
import { RELIC_MAP, activeSynergies } from '../loot/Relics';
import { PERK_MAP } from '../loot/Perks';
import { biomeForAct, type Biome } from '../world/Biomes';

export const FLOORS_PER_ACT = 3;
export const TOTAL_FLOORS = 9;

export interface FloorMod {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
}

export const FLOOR_MODS: FloorMod[] = [
  { id: 'bloodHalls', name: 'Blood Halls', desc: '+35% enemies. +35% loot.', icon: 'skull', color: '#ff2a3a' },
  { id: 'ancientVaults', name: 'Ancient Vaults', desc: 'Extra treasure room. Traps hit harder.', icon: 'chest', color: '#ffc21a' },
  { id: 'greedRush', name: 'Greed Rush', desc: 'More loot drops! +50% gold.', icon: 'coin', color: '#ffd23a' },
  { id: 'glassCannon', name: 'Glass Cannon', desc: '+50% damage. -50% max hull.', icon: 'skull', color: '#ff5a5a' },
  { id: 'spikyRoads', name: 'Spiky Roads', desc: 'Hazards are more dangerous. +40% gold.', icon: 'plow', color: '#b44cff' },
  { id: 'eliteHunt', name: 'Elite Hunt', desc: 'Extra elite room. Elites drop relics.', icon: 'crown', color: '#ff40ff' },
  { id: 'bargainBin', name: 'Bargain Bin', desc: 'Extra shop. Prices -25%.', icon: 'shop', color: '#3aff7a' },
  { id: 'hordeNight', name: 'Horde Night', desc: '+50% enemies. +50% XP.', icon: 'skull', color: '#ff8a2a' },
  { id: 'fastLane', name: 'Fast Lane', desc: 'Everything is 15% faster. Including you.', icon: 'engine', color: '#40c0ff' },
];

export interface RunCounters {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  itemsFound: number;
  legendaries: number;
  bossesKilled: number;
  driftTime: number;
  rams: number;
  roomsCleared: number;
  bestItem: Item | null;
  time: number;
}

export class Run {
  seed: number;
  rng: Rng;
  lootRng: Rng;
  chassis: ChassisDef;
  floor = 0;
  runNumber: number;
  equipped: Record<Slot, Item | null> = { main: null, side: null, plow: null, engine: null, wheels: null, shield: null, gadget: null };
  backpack: Item[] = [];
  backpackSize = 10;
  relics: string[] = [];
  perks: Record<string, number> = {};
  gold = 0;
  keys = 0;
  keystones = 0;
  level = 1;
  xp = 0;
  hp = 1;
  shield = 1;
  nitro = 100;
  stats: CarStats = baseStats();
  specials = new Map<string, number>();
  pendingPerks = 0;
  rerolls = 0;
  floorMods: FloorMod[] = [];
  nextFloorMods: FloorMod[] = [];
  floorName = '';
  counters: RunCounters = {
    kills: 0, damageDealt: 0, damageTaken: 0, goldEarned: 0, itemsFound: 0, legendaries: 0,
    bossesKilled: 0, driftTime: 0, rams: 0, roomsCleared: 0, bestItem: null, time: 0,
  };
  won = false;
  onChange: (() => void) | null = null;

  constructor(chassisId: string, seed = (Math.random() * 1e9) | 0) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.lootRng = new Rng(seed ^ 0x9e3779b9);
    this.chassis = CHASSIS_MAP.get(chassisId) ?? CHASSIS_MAP.get('rustbucket')!;
    this.runNumber = Save.data.runs + 1;
    const st = starterItems(this.lootRng, this.chassis.id);
    const heir = Save.upgrade('startRarity');
    for (const s of SLOTS) this.equipped[s] = st[s] ?? null;
    if (heir > 0) {
      for (const s of ['main', 'side'] as Slot[]) {
        const it = generateItem(this.lootRng, { level: 1, slot: s, rarity: (heir as Rarity) });
        if (it.rarity < 4) this.equipped[s] = it;
      }
    }
    this.gold = Save.upgrade('startGold') * 50;
    this.keys = Save.upgrade('keys');
    this.rerolls = Save.upgrade('rerolls');
    this.recompute();
    this.hp = this.stats.maxHp;
    this.shield = this.stats.maxShield;
    this.nitro = this.stats.boostMax;
  }

  get act() {
    return Math.floor(this.floor / FLOORS_PER_ACT) + 1;
  }
  get floorInAct() {
    return this.floor % FLOORS_PER_ACT;
  }
  get isBossFloor() {
    return this.floorInAct === FLOORS_PER_ACT - 1;
  }
  get biome(): Biome {
    return biomeForAct(this.act);
  }
  get floorLabel() {
    return `B${this.floor + 1}`;
  }
  get depthLevel() {
    return this.floor + 1;
  }
  hasMod(id: string) {
    return this.floorMods.some((m) => m.id === id);
  }
  special(id: string) {
    return this.specials.get(id) ?? 0;
  }

  xpForLevel(l: number) {
    return Math.round(90 * Math.pow(1.22, l - 1));
  }

  recompute() {
    const prevMaxHp = this.stats.maxHp, prevMaxSh = this.stats.maxShield;
    const b = new StatBuilder();
    b.applyAll(this.chassis.mods);
    // meta upgrades
    const u = Save.data.upgrades;
    if (u.hull) b.apply({ stat: 'maxHp', mul: u.hull * 0.08 });
    if (u.shield) b.apply({ stat: 'maxShield', mul: u.shield * 0.08 });
    if (u.firepower) b.apply({ stat: 'dmg', mul: u.firepower * 0.05 });
    if (u.luck) b.apply({ stat: 'luck', add: u.luck * 4 });
    if (u.nitro) {
      b.apply({ stat: 'boostMax', mul: u.nitro * 0.12 });
      b.apply({ stat: 'boostRegen', mul: u.nitro * 0.12 });
    }
    for (const s of SLOTS) {
      const it = this.equipped[s];
      if (!it) continue;
      b.applyAll(it.mods);
      if (it.special) b.special(it.special);
    }
    for (const id of this.relics) {
      const r = RELIC_MAP.get(id);
      if (!r) continue;
      b.applyAll(r.mods);
      if (r.special) b.special(r.special);
    }
    for (const [id, n] of Object.entries(this.perks)) {
      const p = PERK_MAP.get(id);
      if (!p) continue;
      b.applyAll(p.mods, n);
      if (p.special && p.special !== 'healNow') b.special(p.special, n);
    }
    for (const syn of activeSynergies(this.relics)) {
      b.applyAll(syn.mods);
      if (syn.special) b.special(syn.special);
    }
    if (this.hasMod('glassCannon')) {
      b.apply({ stat: 'dmg', mul: 0.5 });
      b.apply({ stat: 'maxHp', mul: -0.5 });
    }
    if (this.hasMod('greedRush')) {
      b.apply({ stat: 'goldFind', mul: 0.5 });
      b.apply({ stat: 'luck', add: 8 });
    }
    if (this.hasMod('spikyRoads')) b.apply({ stat: 'goldFind', mul: 0.4 });
    if (this.hasMod('hordeNight')) b.apply({ stat: 'xpGain', mul: 0.5 });
    if (this.hasMod('fastLane')) {
      b.apply({ stat: 'topSpeed', mul: 0.15 });
      b.apply({ stat: 'accel', mul: 0.15 });
    }
    b.special('passive_' + this.chassis.passiveId);
    this.stats = b.resolve(baseStats());
    this.specials = b.specials;
    // keep proportional health when max changes
    if (prevMaxHp > 0 && this.stats.maxHp !== prevMaxHp) this.hp = Math.min(this.stats.maxHp, this.hp * (this.stats.maxHp / prevMaxHp));
    if (prevMaxSh > 0 && this.stats.maxShield !== prevMaxSh) this.shield = Math.min(this.stats.maxShield, this.shield);
    this.onChange?.();
  }

  addXp(amount: number): number {
    this.xp += amount * this.stats.xpGain;
    let ups = 0;
    while (this.xp >= this.xpForLevel(this.level)) {
      this.xp -= this.xpForLevel(this.level);
      this.level++;
      ups++;
    }
    this.pendingPerks += ups;
    return ups;
  }

  addGold(n: number) {
    this.gold += n;
    this.counters.goldEarned += n;
  }

  takePerk(id: string) {
    this.perks[id] = (this.perks[id] ?? 0) + 1;
    const p = PERK_MAP.get(id);
    this.recompute();
    if (p?.special === 'healNow') this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.15);
  }

  addRelic(id: string) {
    if (!this.relics.includes(id)) this.relics.push(id);
    this.recompute();
  }

  equip(item: Item): Item | null {
    const old = this.equipped[item.slot];
    this.equipped[item.slot] = item;
    const idx = this.backpack.indexOf(item);
    if (idx >= 0) this.backpack.splice(idx, 1);
    this.recompute();
    return old;
  }

  stash(item: Item) {
    if (this.backpack.length >= this.backpackSize) return false;
    this.backpack.push(item);
    return true;
  }

  salvageValue(it: Item) {
    return Math.round(it.value * 0.35);
  }

  priceMult() {
    return this.hasMod('bargainBin') ? 0.75 : 1;
  }

  crownsEarned() {
    const c = this.counters;
    return Math.max(1, Math.floor(this.floor * 2 + c.bossesKilled * 5 + c.kills / 45 + c.legendaries * 1 + (this.won ? 15 : 0)));
  }
}
