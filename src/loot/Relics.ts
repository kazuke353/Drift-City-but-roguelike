import type { Mod } from '../game/Stats';

export type RelicTag = 'loot' | 'fire' | 'shock' | 'drift' | 'ram' | 'crit' | 'armor' | 'blood' | 'speed' | 'arcane';

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  tags: RelicTag[];
  tier: 1 | 2 | 3;
  mods?: Mod[];
  special?: string;
  cursed?: boolean;
}

export const RELICS: RelicDef[] = [
  { id: 'greedRush', name: 'Greed Rush', desc: 'Enemies drop 35% more loot.', icon: 'crown', color: '#ffc21a', tags: ['loot'], tier: 2, mods: [{ stat: 'luck', add: 6 }], special: 'greed' },
  { id: 'glassCannon', name: 'Glass Cannon', desc: '+50% damage. -40% max hull.', icon: 'skull', color: '#ff3a3a', tags: ['crit'], tier: 2, mods: [{ stat: 'dmg', mul: 0.5 }, { stat: 'maxHp', mul: -0.4 }], cursed: true },
  { id: 'luckyClover', name: 'Four-Leaf Hubcap', desc: 'Much higher chance for rare parts.', icon: 'clover', color: '#3aff7a', tags: ['loot'], tier: 2, mods: [{ stat: 'luck', add: 14 }] },
  { id: 'emberHeart', name: 'Ember Heart', desc: '+30% fire damage. Burning enemies explode on death.', icon: 'flame', color: '#ff6a1a', tags: ['fire'], tier: 3, mods: [{ stat: 'elemDmg', mul: 0.15 }], special: 'burnExplode' },
  { id: 'stormBottle', name: 'Storm in a Bottle', desc: 'Shock damage chains to 2 more enemies.', icon: 'bolt', color: '#4fa8ff', tags: ['shock'], tier: 2, special: 'shockChain' },
  { id: 'frostbiteFang', name: 'Frostbite Fang', desc: 'Frozen enemies shatter into ice shrapnel.', icon: 'snow', color: '#9fe8ff', tags: ['arcane'], tier: 2, special: 'cryoShatter' },
  { id: 'acidSaint', name: 'Acid Saint', desc: 'Corroded enemies spread corrosion when they die.', icon: 'drop', color: '#7cff2e', tags: ['arcane'], tier: 2, special: 'acidSpread' },
  { id: 'driftKing', name: 'Drift King Crown', desc: 'Drift boosts are 50% stronger and charge faster.', icon: 'crown', color: '#ff40c0', tags: ['drift', 'speed'], tier: 2, mods: [{ stat: 'driftCharge', mul: 0.4 }], special: 'driftBoostPlus' },
  { id: 'burnout', name: 'Burnout Pipes', desc: 'Drifting reloads your weapons.', icon: 'wheel', color: '#ff8a2a', tags: ['drift'], tier: 2, special: 'driftReload' },
  { id: 'wreckingBall', name: 'Wrecking Ball', desc: '+60% ram damage. Ram kills explode.', icon: 'plow', color: '#c0c0c0', tags: ['ram'], tier: 3, mods: [{ stat: 'ramDamage', mul: 0.6 }], special: 'ramExplode' },
  { id: 'bullBar', name: 'Bull Bar Blessing', desc: '+40% ram damage, +20% impact resistance.', icon: 'plow', color: '#d08040', tags: ['ram', 'armor'], tier: 1, mods: [{ stat: 'ramDamage', mul: 0.4 }, { stat: 'ramResist', add: 0.2 }] },
  { id: 'loadedDice', name: 'Loaded Dice', desc: '+12% crit chance.', icon: 'dice', color: '#f2efe6', tags: ['crit'], tier: 1, mods: [{ stat: 'critChance', add: 0.12 }] },
  { id: 'executioner', name: "Executioner's Hood", desc: '+60% crit damage. Crits explode.', icon: 'skull', color: '#a01020', tags: ['crit'], tier: 3, mods: [{ stat: 'critDmg', mul: 0.6 }], special: 'critExplode' },
  { id: 'vampFang', name: 'Vampire Fang', desc: '4% of damage dealt heals your hull.', icon: 'heart', color: '#d0103a', tags: ['blood'], tier: 2, mods: [{ stat: 'lifesteal', add: 0.04 }] },
  { id: 'bloodPact', name: 'Blood Pact', desc: 'Kills heal 2% hull. -15% max shield.', icon: 'heart', color: '#8a0a20', tags: ['blood'], tier: 1, mods: [{ stat: 'maxShield', mul: -0.15 }], special: 'killHeal' },
  { id: 'berserker', name: 'Berserker Piston', desc: 'Up to +70% damage as your hull drops.', icon: 'engine', color: '#ff2a2a', tags: ['blood', 'speed'], tier: 2, special: 'lowHpDamage' },
  { id: 'nitroTank', name: 'Spare Nitro Tank', desc: '+50% nitro capacity, +30% regen.', icon: 'engine', color: '#40c0ff', tags: ['speed'], tier: 1, mods: [{ stat: 'boostMax', mul: 0.5 }, { stat: 'boostRegen', mul: 0.3 }] },
  { id: 'leadFoot', name: 'Lead Foot', desc: '+12% top speed. +20% acceleration.', icon: 'wheel', color: '#8080ff', tags: ['speed'], tier: 1, mods: [{ stat: 'topSpeed', mul: 0.12 }, { stat: 'accel', mul: 0.2 }] },
  { id: 'bulletPlating', name: 'Bullet Plating', desc: '+35% armor while moving fast.', icon: 'shield', color: '#40e0ff', tags: ['armor', 'speed'], tier: 1, special: 'movingArmor' },
  { id: 'bastion', name: 'Bastion Core', desc: '+40% shield capacity, faster recharge.', icon: 'shield', color: '#3a8aff', tags: ['armor'], tier: 2, mods: [{ stat: 'maxShield', mul: 0.4 }, { stat: 'shieldDelay', add: -0.6 }] },
  { id: 'thornPlate', name: 'Thorn Plating', desc: 'Enemies that hit you in melee take heavy damage.', icon: 'plow', color: '#6aff9a', tags: ['armor', 'ram'], tier: 1, special: 'thorns' },
  { id: 'coinMagnet', name: 'Coin Magnet', desc: '+120% pickup radius. +20% gold.', icon: 'coin', color: '#ffd23a', tags: ['loot'], tier: 1, mods: [{ stat: 'pickupRadius', mul: 1.2 }, { stat: 'goldFind', mul: 0.2 }] },
  { id: 'crownPoor', name: 'Crown of Poor Decisions', desc: '+100% gold. Enemies deal +35% damage.', icon: 'crown', color: '#ffb020', tags: ['loot'], tier: 2, mods: [{ stat: 'goldFind', mul: 1.0 }], special: 'poorDecisions', cursed: true },
  { id: 'chaosDice', name: 'Chaos Dice', desc: 'Every shot has a random element. +20% elemental damage.', icon: 'dice', color: '#c05cff', tags: ['arcane'], tier: 2, mods: [{ stat: 'elemDmg', mul: 0.2 }], special: 'chaosElement' },
  { id: 'gearbox', name: 'Clockwork Gearbox', desc: '-25% gadget cooldown.', icon: 'gear', color: '#c0a060', tags: ['arcane'], tier: 1, mods: [{ stat: 'cooldown', mul: -0.25 }] },
  { id: 'hotRod', name: 'Hot Rod Heart', desc: '+20% fire rate. +10% top speed.', icon: 'flame', color: '#ff5a1a', tags: ['fire', 'speed'], tier: 2, mods: [{ stat: 'fireRate', mul: 0.2 }, { stat: 'topSpeed', mul: 0.1 }] },
  { id: 'pyroManual', name: "Pyromaniac's Manual", desc: '+50% elemental chance. +25% fire damage.', icon: 'flame', color: '#ff8a1a', tags: ['fire'], tier: 1, mods: [{ stat: 'elemChance', mul: 0.5 }, { stat: 'elemDmg', mul: 0.1 }] },
  { id: 'lightningRod', name: 'Lightning Rod', desc: 'Crits spark chain lightning.', icon: 'bolt', color: '#80c0ff', tags: ['shock', 'crit'], tier: 2, special: 'critChain' },
  { id: 'soulJar', name: 'Soul Jar', desc: 'Kills restore nitro. +10% xp.', icon: 'skull', color: '#a0ffe0', tags: ['speed', 'arcane'], tier: 1, mods: [{ stat: 'xpGain', mul: 0.1 }], special: 'killBoost' },
  { id: 'secondWind', name: 'Second Wind Spark Plug', desc: 'Last Gear lasts 60% longer.', icon: 'heart', color: '#ffffff', tags: ['blood'], tier: 1, special: 'lastStand' },
  { id: 'extendedMag', name: 'Extended Drum', desc: '+35% magazine size.', icon: 'cannon', color: '#c0c0c0', tags: ['crit'], tier: 1, mods: [{ stat: 'magSize', mul: 0.35 }] },
  { id: 'overcharger', name: 'Overcharger', desc: 'First shot after a reload deals triple damage.', icon: 'bolt', color: '#ffe040', tags: ['shock', 'crit'], tier: 2, special: 'firstShot' },
  { id: 'kineticMag', name: 'Kinetic Magazine', desc: 'Driving fast slowly refills your magazines.', icon: 'engine', color: '#40ffc0', tags: ['speed'], tier: 2, special: 'kineticMag' },
  { id: 'honkMastery', name: 'Golden Horn', desc: 'Your honk hits 4x harder and recharges faster.', icon: 'horn', color: '#ffd23a', tags: ['ram'], tier: 1, mods: [{ stat: 'hornPower', mul: 3 }] },
];

export const RELIC_MAP = new Map(RELICS.map((r) => [r.id, r]));

export interface Synergy {
  tag: RelicTag;
  need: number;
  name: string;
  desc: string;
  mods?: Mod[];
  special?: string;
}

export const SYNERGIES: Synergy[] = [
  { tag: 'loot', need: 3, name: 'Treasure Hunter', desc: 'Loot synergy: +40% gold, +10 luck.', mods: [{ stat: 'goldFind', mul: 0.4 }, { stat: 'luck', add: 10 }] },
  { tag: 'fire', need: 2, name: 'Pyromania', desc: 'Fire synergy: +35% elemental damage.', mods: [{ stat: 'elemDmg', mul: 0.35 }] },
  { tag: 'shock', need: 2, name: 'Live Wire', desc: 'Shock synergy: +50% elemental chance.', mods: [{ stat: 'elemChance', mul: 0.5 }] },
  { tag: 'drift', need: 2, name: 'Tokyo Crypt Drift', desc: 'Drift synergy: drifting grants +25% damage.', special: 'driftDamage' },
  { tag: 'ram', need: 2, name: 'Demolition Derby', desc: 'Ram synergy: +50% ram damage & impact resist.', mods: [{ stat: 'ramDamage', mul: 0.5 }, { stat: 'ramResist', add: 0.3 }] },
  { tag: 'crit', need: 3, name: 'Assassin Drive', desc: 'Crit synergy: +10% crit chance, +40% crit damage.', mods: [{ stat: 'critChance', add: 0.1 }, { stat: 'critDmg', mul: 0.4 }] },
  { tag: 'armor', need: 3, name: 'Rolling Fortress', desc: 'Armor synergy: +30 armor, +25% shield.', mods: [{ stat: 'armor', add: 30 }, { stat: 'maxShield', mul: 0.25 }] },
  { tag: 'blood', need: 2, name: 'Blood Engine', desc: 'Blood synergy: +3 hull regen/s, +2% lifesteal.', mods: [{ stat: 'hpRegen', add: 3 }, { stat: 'lifesteal', add: 0.02 }] },
  { tag: 'speed', need: 3, name: 'Ludicrous Speed', desc: 'Speed synergy: +10% top speed, +40% nitro power.', mods: [{ stat: 'topSpeed', mul: 0.1 }, { stat: 'boostPower', mul: 0.4 }] },
  { tag: 'arcane', need: 3, name: 'Hexed Chassis', desc: 'Arcane synergy: -20% cooldowns, +25% elemental damage.', mods: [{ stat: 'cooldown', mul: -0.2 }, { stat: 'elemDmg', mul: 0.25 }] },
];

export function activeSynergies(relics: string[]): Synergy[] {
  const counts = new Map<RelicTag, number>();
  for (const id of relics) {
    const r = RELIC_MAP.get(id);
    if (!r) continue;
    for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return SYNERGIES.filter((s) => (counts.get(s.tag) ?? 0) >= s.need);
}

export function tagCounts(relics: string[]) {
  const counts = new Map<RelicTag, number>();
  for (const id of relics) {
    const r = RELIC_MAP.get(id);
    if (!r) continue;
    for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}
