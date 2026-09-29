import { Rng } from '../core/Rng';
import type { Mod, StatKey } from '../game/Stats';
import type { Element } from '../fx/FX';

export type Slot = 'main' | 'side' | 'plow' | 'engine' | 'wheels' | 'shield' | 'gadget';
export type Rarity = 0 | 1 | 2 | 3 | 4;
export type MainType = 'mg' | 'minigun' | 'cannon' | 'shotgun' | 'laser' | 'flamer' | 'tesla' | 'rail';
export type SideType = 'rocket' | 'swarm' | 'mortar' | 'saw';
export type WeaponType = MainType | SideType;
export type GadgetType = 'mines' | 'hop' | 'pulse' | 'turret' | 'bubble' | 'gravity';

export const SLOTS: Slot[] = ['main', 'side', 'plow', 'engine', 'wheels', 'shield', 'gadget'];
export const SLOT_NAMES: Record<Slot, string> = {
  main: 'Turret',
  side: 'Side Gun',
  plow: 'Plow',
  engine: 'Engine',
  wheels: 'Wheels',
  shield: 'Shield',
  gadget: 'Gadget',
};
export const SLOT_ICONS: Record<Slot, string> = {
  main: 'cannon',
  side: 'rocket',
  plow: 'plow',
  engine: 'engine',
  wheels: 'wheel',
  shield: 'shield',
  gadget: 'gear',
};

export const RARITY = [
  { name: 'Common', color: '#e9e6dc', glow: [0.9, 0.9, 0.85] as [number, number, number], mult: 1.0 },
  { name: 'Uncommon', color: '#4dff6a', glow: [0.3, 1.0, 0.4] as [number, number, number], mult: 1.1 },
  { name: 'Rare', color: '#3aa6ff', glow: [0.2, 0.6, 1.0] as [number, number, number], mult: 1.24 },
  { name: 'Epic', color: '#c45cff', glow: [0.75, 0.3, 1.0] as [number, number, number], mult: 1.42 },
  { name: 'Legendary', color: '#ffa51f', glow: [1.0, 0.62, 0.1] as [number, number, number], mult: 1.62 },
] as const;

export interface WeaponStats {
  damage: number;
  fireRate: number;
  mag: number;
  reload: number;
  spread: number;
  projSpeed: number;
  splash: number;
  pellets: number;
  elemChance: number;
  critBonus: number;
  range: number;
}

export interface Item {
  uid: number;
  slot: Slot;
  rarity: Rarity;
  level: number;
  name: string;
  flavor?: string;
  maker?: string;
  wtype?: WeaponType;
  gtype?: GadgetType;
  variant: number;
  element: Element;
  w?: WeaponStats;
  mods: Mod[];
  special?: string;
  specialText?: string;
  value: number;
  /** gadget */
  cooldown?: number;
  power?: number;
}

let uidCounter = 1;
export const nextUid = () => uidCounter++;

// ---------------------------------------------------------------- weapon bases
const WEAPON_BASE: Record<WeaponType, WeaponStats & { names: string[] }> = {
  mg: { damage: 15, fireRate: 9, mag: 42, reload: 1.6, spread: 0.022, projSpeed: 250, splash: 0, pellets: 1, elemChance: 0.12, critBonus: 0, range: 140, names: ['Chattergun', 'Rattler', 'Peacemaker', 'Buzzbox', 'Hot Rod MG'] },
  minigun: { damage: 10, fireRate: 17, mag: 130, reload: 2.8, spread: 0.05, projSpeed: 250, splash: 0, pellets: 1, elemChance: 0.07, critBonus: 0, range: 130, names: ['Shredder', 'Brrrtha', 'Gatling Grinder', 'Lawnmower'] },
  cannon: { damage: 78, fireRate: 1.35, mag: 6, reload: 2.1, spread: 0.008, projSpeed: 135, splash: 4.2, pellets: 1, elemChance: 0.25, critBonus: 0, range: 160, names: ['Hellion Cannon', 'Twin Cannons', 'Boomstick', 'Siegebreaker', 'Doorknocker'] },
  shotgun: { damage: 12, fireRate: 1.9, mag: 8, reload: 2.2, spread: 0.12, projSpeed: 190, splash: 0, pellets: 8, elemChance: 0.08, critBonus: 0, range: 45, names: ['Scattershot', 'Bone Buster', 'Face Melter', 'Crowd Pleaser'] },
  laser: { damage: 14, fireRate: 10, mag: 90, reload: 2.2, spread: 0, projSpeed: 0, splash: 0, pellets: 1, elemChance: 0.06, critBonus: 0, range: 80, names: ['Beamwhip', 'Prism Lance', 'Sunspear', 'Light Show'] },
  flamer: { damage: 8, fireRate: 18, mag: 110, reload: 2.4, spread: 0.16, projSpeed: 48, splash: 0, pellets: 1, elemChance: 0.35, critBonus: 0, range: 28, names: ["Dragon's Breath", 'Scorcher', 'Barbecue', 'Hot Take'] },
  tesla: { damage: 27, fireRate: 3.4, mag: 22, reload: 1.9, spread: 0, projSpeed: 0, splash: 0, pellets: 1, elemChance: 0.5, critBonus: 0, range: 42, names: ['Storm Coil', 'Zapper', 'Thunderbox', 'Static Cling'] },
  rail: { damage: 165, fireRate: 0.85, mag: 4, reload: 2.4, spread: 0, projSpeed: 0, splash: 0, pellets: 1, elemChance: 0.2, critBonus: 0.15, range: 200, names: ['Rail Lance', 'Needle', 'Kingsnail', 'Skewer'] },
  rocket: { damage: 62, fireRate: 2.2, mag: 6, reload: 2.5, spread: 0.04, projSpeed: 60, splash: 5, pellets: 1, elemChance: 0.2, critBonus: 0, range: 150, names: ['Rocket Pod', 'RPG-Boi', 'Boomerang', 'Ticket Home'] },
  swarm: { damage: 20, fireRate: 9, mag: 24, reload: 2.7, spread: 0.3, projSpeed: 52, splash: 2.6, pellets: 1, elemChance: 0.15, critBonus: 0, range: 120, names: ['Swarm Pod', 'Hornet Nest', 'Wasp Kiss', 'Party Favors'] },
  mortar: { damage: 95, fireRate: 1.1, mag: 4, reload: 2.4, spread: 0, projSpeed: 0, splash: 7, pellets: 1, elemChance: 0.25, critBonus: 0, range: 90, names: ['Lob Launcher', 'Plonker', 'Grave Mortar', 'Sky Delivery'] },
  saw: { damage: 34, fireRate: 2.4, mag: 5, reload: 2.0, spread: 0.02, projSpeed: 70, splash: 0, pellets: 1, elemChance: 0.15, critBonus: 0, range: 100, names: ['Saw Launcher', 'Buzzkill', 'Disc Jockey', 'Ricochet Rita'] },
};

export const WEAPON_LABEL: Record<WeaponType, string> = {
  mg: 'Machine Gun', minigun: 'Minigun', cannon: 'Cannon', shotgun: 'Shotgun', laser: 'Laser', flamer: 'Flamethrower',
  tesla: 'Tesla Coil', rail: 'Railgun', rocket: 'Rocket Pod', swarm: 'Swarm Missiles', mortar: 'Mortar', saw: 'Saw Launcher',
};

export const MAKERS = [
  { id: 'grimjaw', name: 'Grimjaw', desc: 'Heavy hitters. Slow and brutal.', dmg: 0.22, rate: -0.14, mag: 0.1, reload: 0, crit: 0, elem: 0 },
  { id: 'hexworks', name: 'Hexworks', desc: 'Always elemental. Always weird.', dmg: -0.05, rate: 0, mag: 0, reload: 0, crit: 0, elem: 0.3 },
  { id: 'ratchet', name: 'Ratchet & Sons', desc: 'Cheap, fast, loud.', dmg: -0.1, rate: 0.2, mag: 0.15, reload: 0.15, crit: 0, elem: 0 },
  { id: 'kingsforge', name: 'Kingsforge', desc: 'Gilded precision for discerning looters.', dmg: 0.05, rate: 0, mag: -0.1, reload: 0, crit: 0.1, elem: 0 },
  { id: 'bonecraft', name: 'Bonecraft', desc: 'Grown, not made. Hungers.', dmg: 0.08, rate: 0.05, mag: 0.2, reload: -0.1, crit: 0.03, elem: 0 },
] as const;

const PREFIX: Record<string, string[]> = {
  dmg: ['Heavy', 'Brutal', 'Savage', 'Mean'],
  rate: ['Furious', 'Frantic', 'Twitchy', 'Rapid'],
  mag: ['Bottomless', 'Hungry', 'Deep'],
  reload: ['Quick', 'Snappy', 'Slick'],
  crit: ['Precise', 'Cruel', 'Surgical'],
  splash: ['Explosive', 'Loud', 'Volatile'],
  fire: ['Blazing', 'Scorching', 'Molten'],
  shock: ['Crackling', 'Storming', 'Static'],
  acid: ['Caustic', 'Corrosive', 'Oozing'],
  cryo: ['Frigid', 'Frozen', 'Glacial'],
};

export const ELEMENT_NAMES: Record<Element, string> = { none: 'Kinetic', fire: 'Fire', shock: 'Shock', acid: 'Corrosive', cryo: 'Cryo' };

export const levelMult = (lvl: number) => Math.pow(1.14, lvl - 1);

// ---------------------------------------------------------------- legendaries
interface LegendaryDef {
  name: string;
  slot: Slot;
  wtype?: WeaponType;
  gtype?: GadgetType;
  element?: Element;
  special: string;
  text: string;
  flavor: string;
  tweak?: (w: WeaponStats) => void;
  mods?: Mod[];
}

export const LEGENDARIES: LegendaryDef[] = [
  { name: 'Hot Rod MG', slot: 'main', wtype: 'mg', special: 'speedFireRate', text: 'Fire rate scales with your speed (up to +120%).', flavor: '"Faster is better. Always."' },
  { name: 'The Tax Collector', slot: 'main', wtype: 'minigun', special: 'taxCollector', text: 'Hits have a chance to knock gold out of enemies.', flavor: '"Death and taxes. Mostly taxes."' },
  { name: 'Graveyard Cannon', slot: 'main', wtype: 'cannon', element: 'none', special: 'ghostSkulls', text: 'Kills release homing ghost skulls.', flavor: '"Even death has a blind spot."' },
  { name: 'Hellsplitter Turret', slot: 'main', wtype: 'cannon', element: 'fire', special: 'splitShells', text: 'Shells split into 3 burning bomblets.', flavor: '"Set the dungeon on fire."' },
  { name: 'Goblin Glitcher', slot: 'main', wtype: 'shotgun', element: 'shock', special: 'critChain', text: 'Crits spark chain lightning.', flavor: '"Small, loud, effective."', tweak: (w) => { w.fireRate *= 1.25; } },
  { name: 'Cryo Coffin', slot: 'main', wtype: 'laser', element: 'cryo', special: 'cryoShatter', text: 'Frozen enemies shatter into ice shrapnel.', flavor: '"Chill out. Forever."' },
  { name: 'Thunderclap', slot: 'main', wtype: 'tesla', element: 'shock', special: 'shockChain', text: 'Lightning chains to 3 extra targets.', flavor: '"Mjolnitro."' },
  { name: 'Kingslayer', slot: 'main', wtype: 'rail', special: 'railPierceBoss', text: 'Pierces everything. Double damage to bosses.', flavor: '"Heavy is the head."' },
  { name: 'Barbecue Deluxe', slot: 'main', wtype: 'flamer', element: 'fire', special: 'burnExplode', text: 'Burning enemies explode on death.', flavor: '"Well done. Very well done."' },
  { name: 'Dragonspine Launcher', slot: 'side', wtype: 'rocket', special: 'boneShards', text: 'Rockets burst into a ring of bone shards.', flavor: '"Built from something that was very angry."' },
  { name: 'RPG-BOI', slot: 'side', wtype: 'rocket', special: 'bigRocket', text: 'One enormous rocket. Enormous.', flavor: '"Reload? Never heard of her."', tweak: (w) => { w.damage *= 4.5; w.splash *= 2.2; w.mag = 1; w.reload *= 0.9; w.projSpeed *= 0.8; } },
  { name: 'Sawmageddon', slot: 'side', wtype: 'saw', special: 'infiniteSaws', text: 'Saws bounce forever for 6 seconds.', flavor: '"Ricochet responsibly."' },
  { name: "Big Bertha's Baby", slot: 'side', wtype: 'mortar', special: 'clusterMortar', text: 'Shells scatter 6 cluster bomblets.', flavor: '"Mama raised a menace."' },
  { name: 'Rusted Faith', slot: 'plow', special: 'ramHoly', text: 'Ram hits smite with holy fire.', flavor: '"Steel your soul."', mods: [{ stat: 'ramDamage', mul: 0.4 }, { stat: 'armor', mul: 0.2 }] },
  { name: 'Bonecrusher Grille', slot: 'plow', special: 'ramExplode', text: 'Ram kills explode.', flavor: '"Parts is parts."', mods: [{ stat: 'ramDamage', mul: 0.5 }] },
  { name: 'Soulreaver Core', slot: 'engine', special: 'killBoost', text: 'Kills refill nitro. +30% damage while boosting.', flavor: '"It runs on regret."', mods: [{ stat: 'boostMax', mul: 0.3 }] },
  { name: 'Hellfire Exhaust', slot: 'engine', special: 'boostFireTrail', text: 'Boosting leaves a trail of fire.', flavor: '"Tailgaters get roasted."', mods: [{ stat: 'topSpeed', mul: 0.08 }] },
  { name: 'Titan Wheels', slot: 'wheels', special: 'titanWheels', text: 'Crush small enemies without losing speed.', flavor: '"Speed bumps are a state of mind."', mods: [{ stat: 'mass', mul: 0.3 }, { stat: 'grip', mul: 0.15 }] },
  { name: 'Abyssal Tires', slot: 'wheels', special: 'driftShadowTrail', text: 'Drifting leaves a damaging shadow trail.', flavor: '"The road remembers."', mods: [{ stat: 'driftCharge', mul: 0.3 }] },
  { name: 'Bone Zone', slot: 'shield', special: 'shieldNova', text: 'Shield break releases a shock nova.', flavor: '"Personal space: enforced."' },
  { name: 'Coin Magnet Ward', slot: 'shield', special: 'coinShield', text: 'Picking up gold restores shield.', flavor: '"Money can buy safety."' },
  { name: 'Honkbringer', slot: 'gadget', gtype: 'pulse', special: 'honkCannon', text: 'Your horn becomes a devastating sonic cannon.', flavor: '"HONK AND YE SHALL DIE."' },
  { name: 'Twin Mines of Doom', slot: 'gadget', gtype: 'mines', special: 'secondCharge', text: 'Gadget holds 2 charges.', flavor: '"Double the doom, double the fun."' },
];

// ---------------------------------------------------------------- part definitions
interface PartDef {
  names: string[];
  main: { stat: StatKey; add?: number; mul?: number }[];
}

const PARTS: Record<'plow' | 'engine' | 'wheels' | 'shield', PartDef[]> = {
  plow: [
    { names: ['Iron Ram', 'Battering Block', 'Knocker'], main: [{ stat: 'ramDamage', mul: 0.35 }, { stat: 'armor', add: 8 }] },
    { names: ['Bone Plow', 'Scoop of Sorrow', 'Crypt Scraper'], main: [{ stat: 'ramDamage', mul: 0.25 }, { stat: 'mass', mul: 0.15 }] },
    { names: ['Spiked Grille', 'Porcupine', 'Pointy Business'], main: [{ stat: 'ramDamage', mul: 0.5 }] },
    { names: ['Cathedral Bumper', 'Holy Fender', 'Warden Plate'], main: [{ stat: 'armor', add: 16 }, { stat: 'ramResist', add: 0.2 }] },
  ],
  engine: [
    { names: ['Hemi-Hex V8', 'Grave Blower', 'Big Block'], main: [{ stat: 'accel', mul: 0.18 }, { stat: 'topSpeed', mul: 0.06 }] },
    { names: ['Screaming Turbo', 'Banshee Turbo', 'Whistler'], main: [{ stat: 'topSpeed', mul: 0.12 }] },
    { names: ['Nitro Heart', 'Bottle of Lightning', 'Fuel Idol'], main: [{ stat: 'boostMax', mul: 0.35 }, { stat: 'boostRegen', mul: 0.25 }] },
    { names: ['Soul Engine', 'Arcane Piston', 'Wisp Furnace'], main: [{ stat: 'boostPower', mul: 0.2 }, { stat: 'accel', mul: 0.1 }] },
  ],
  wheels: [
    { names: ['Grave Grippers', 'Mud Eaters', 'Crypt Crawlers'], main: [{ stat: 'grip', mul: 0.18 }, { stat: 'handling', mul: 0.08 }] },
    { names: ['Racing Slicks', 'Skate Wheels', 'Butter Rubber'], main: [{ stat: 'driftCharge', mul: 0.35 }, { stat: 'topSpeed', mul: 0.04 }] },
    { names: ['Spiked Wheels', 'Caltrop Rollers', 'Needle Treads'], main: [{ stat: 'ramDamage', mul: 0.2 }, { stat: 'grip', mul: 0.1 }] },
    { names: ['Ghost Rims', 'Hover Hubs', 'Ether Tires'], main: [{ stat: 'handling', mul: 0.18 }, { stat: 'driftCharge', mul: 0.15 }] },
  ],
  shield: [
    { names: ['Ward Generator', 'Aegis Box', 'Bubble Wrap'], main: [{ stat: 'maxShield', add: 70 }] },
    { names: ['Quickstart Ward', 'Snapback Shield', 'Twitch Ward'], main: [{ stat: 'maxShield', add: 40 }, { stat: 'shieldDelay', add: -0.8 }] },
    { names: ['Turtle Shell', 'Bunker Ward', 'Fortress Field'], main: [{ stat: 'maxShield', add: 120 }, { stat: 'shieldRate', mul: -0.15 }] },
    { names: ['Surge Ward', 'Dynamo Shield', 'Flux Guard'], main: [{ stat: 'maxShield', add: 50 }, { stat: 'shieldRate', mul: 0.35 }] },
  ],
};

const GADGETS: Record<GadgetType, { names: string[]; cooldown: number; desc: string }> = {
  mines: { names: ['Mine Layer', 'Caltrop Crate', 'Surprise Package'], cooldown: 7, desc: 'Drop 3 proximity mines behind you.' },
  hop: { names: ['Hydraulic Hop', 'Pogo Pistons', 'Leap of Faith'], cooldown: 4.5, desc: 'Launch into the air. Land to crush enemies.' },
  pulse: { names: ['Shock Pulse', 'EMP Horn', 'Static Burst'], cooldown: 9, desc: 'Electric nova that damages and stuns nearby enemies.' },
  turret: { names: ['Sentry Pod', 'Tiny Tony', 'Auto-Buddy'], cooldown: 16, desc: 'Deploy an auto-turret for 10 seconds.' },
  bubble: { names: ['Bubble Ward', 'Holy Aegis', 'Pocket Fortress'], cooldown: 14, desc: 'Become invulnerable and reflect projectiles for 2.5s.' },
  gravity: { names: ['Gravity Well', 'Pocket Singularity', 'The Vacuum'], cooldown: 13, desc: 'Create a vortex that pulls enemies together.' },
};
export const GADGET_INFO = GADGETS;

const BONUS_POOL: { stat: StatKey; add?: number; mul?: number; w: number }[] = [
  { stat: 'dmg', mul: 0.06, w: 3 },
  { stat: 'critChance', add: 0.03, w: 2 },
  { stat: 'critDmg', mul: 0.15, w: 1.5 },
  { stat: 'fireRate', mul: 0.06, w: 2 },
  { stat: 'reloadSpeed', mul: 0.1, w: 1.5 },
  { stat: 'maxHp', add: 45, w: 2.5 },
  { stat: 'armor', add: 5, w: 2 },
  { stat: 'maxShield', add: 30, w: 2 },
  { stat: 'luck', add: 4, w: 1 },
  { stat: 'goldFind', mul: 0.12, w: 1.2 },
  { stat: 'xpGain', mul: 0.1, w: 1 },
  { stat: 'boostRegen', mul: 0.15, w: 1.2 },
  { stat: 'topSpeed', mul: 0.04, w: 1 },
  { stat: 'pickupRadius', add: 3, w: 0.8 },
  { stat: 'lifesteal', add: 0.01, w: 0.8 },
  { stat: 'hpRegen', add: 2, w: 0.8 },
  { stat: 'elemChance', mul: 0.12, w: 1.2 },
  { stat: 'elemDmg', mul: 0.12, w: 1.2 },
  { stat: 'ramDamage', mul: 0.12, w: 1 },
  { stat: 'cooldown', mul: -0.08, w: 1 },
  { stat: 'splash', mul: 0.1, w: 0.8 },
];

export interface GenOpts {
  level: number;
  rarity?: Rarity;
  slot?: Slot;
  luck?: number;
  minRarity?: Rarity;
  legendaryChanceMult?: number;
}

export function rollRarity(rng: Rng, luck: number, depth: number, minRarity: Rarity = 0, legMult = 1): Rarity {
  const L = luck + depth * 2.2;
  const w: [Rarity, number][] = [
    [0, Math.max(8, 56 - L * 1.4)],
    [1, 28 + L * 0.3],
    [2, 11 + L * 0.5],
    [3, 3.5 + L * 0.28],
    [4, (0.9 + L * 0.09) * legMult],
  ];
  const r = rng.weighted(w.filter(([k]) => k >= minRarity));
  return r;
}

export function rollSlot(rng: Rng): Slot {
  return rng.weighted<Slot>([
    ['main', 30],
    ['side', 18],
    ['plow', 9],
    ['engine', 10],
    ['wheels', 10],
    ['shield', 12],
    ['gadget', 9],
  ]);
}

export function generateItem(rng: Rng, o: GenOpts): Item {
  const rarity = o.rarity ?? rollRarity(rng, o.luck ?? 0, o.level, o.minRarity ?? 0, o.legendaryChanceMult ?? 1);
  let slot = o.slot ?? rollSlot(rng);
  // legendary?
  if (rarity === 4) {
    const pool = LEGENDARIES.filter((l) => !o.slot || l.slot === o.slot);
    if (pool.length) return makeLegendary(rng, rng.pick(pool), o.level);
    slot = o.slot!;
  }
  if (slot === 'main' || slot === 'side') return makeWeapon(rng, slot, rarity, o.level);
  if (slot === 'gadget') return makeGadget(rng, rarity, o.level);
  return makePart(rng, slot, rarity, o.level);
}

function pickElement(rng: Rng, chance: number): Element {
  return rng.chance(chance) ? rng.pick(['fire', 'shock', 'acid', 'cryo'] as const) : 'none';
}

function weaponStats(t: WeaponType, level: number, rarity: Rarity): WeaponStats {
  const b = WEAPON_BASE[t];
  const m = levelMult(level) * RARITY[rarity].mult;
  return {
    damage: b.damage * m,
    fireRate: b.fireRate,
    mag: b.mag,
    reload: b.reload,
    spread: b.spread,
    projSpeed: b.projSpeed,
    splash: b.splash,
    pellets: b.pellets,
    elemChance: b.elemChance,
    critBonus: b.critBonus,
    range: b.range,
  };
}

function makeWeapon(rng: Rng, slot: 'main' | 'side', rarity: Rarity, level: number): Item {
  const types: WeaponType[] = slot === 'main' ? ['mg', 'minigun', 'cannon', 'shotgun', 'laser', 'flamer', 'tesla', 'rail'] : ['rocket', 'swarm', 'mortar', 'saw'];
  const t = rng.pick(types);
  const maker = rng.pick(MAKERS);
  const w = weaponStats(t, level, rarity);
  w.damage *= 1 + maker.dmg + rng.float(-0.06, 0.06);
  w.fireRate *= 1 + maker.rate + rng.float(-0.05, 0.05);
  w.mag = Math.max(1, Math.round(w.mag * (1 + maker.mag + rng.float(-0.1, 0.1))));
  w.reload *= 1 - maker.reload + rng.float(-0.06, 0.06);
  w.critBonus += maker.crit;
  let elemChance = 0.18 + rarity * 0.12 + maker.elem;
  if (t === 'flamer') elemChance = 1;
  if (t === 'tesla') elemChance = 1;
  let element = pickElement(rng, Math.min(1, elemChance));
  if (t === 'flamer') element = rng.chance(0.8) ? 'fire' : rng.pick(['acid', 'cryo'] as const);
  if (t === 'tesla') element = rng.chance(0.8) ? 'shock' : rng.pick(['fire', 'cryo'] as const);
  if (maker.id === 'hexworks' && element === 'none') element = rng.pick(['fire', 'shock', 'acid', 'cryo'] as const);
  w.elemChance += maker.elem * 0.5;
  // rarity bonus rolls on weapon stats
  const bonusKeys: string[] = [];
  const rolls = rarity;
  for (let i = 0; i < rolls; i++) {
    const k = rng.pick(['dmg', 'rate', 'mag', 'reload', 'crit', 'splash']);
    bonusKeys.push(k);
    switch (k) {
      case 'dmg': w.damage *= 1.1; break;
      case 'rate': w.fireRate *= 1.1; break;
      case 'mag': w.mag = Math.ceil(w.mag * 1.2); break;
      case 'reload': w.reload *= 0.88; break;
      case 'crit': w.critBonus += 0.05; break;
      case 'splash': w.splash = w.splash > 0 ? w.splash * 1.2 : w.splash; break;
    }
  }
  const mods: Mod[] = [];
  if (rarity >= 2) mods.push(bonusMod(rng, level));
  if (rarity >= 3) mods.push(bonusMod(rng, level));
  const prefixKey = element !== 'none' && rng.chance(0.6) ? element : bonusKeys.length ? rng.pick(bonusKeys) : maker.dmg > 0.1 ? 'dmg' : 'rate';
  const prefix = rng.pick(PREFIX[prefixKey] ?? PREFIX.dmg);
  const base = rng.pick(WEAPON_BASE[t].names.filter((n) => !LEGENDARIES.some((l) => l.name === n)));
  const name = `${prefix} ${base}`;
  const it: Item = {
    uid: nextUid(),
    slot,
    rarity,
    level,
    name,
    maker: maker.name,
    wtype: t,
    variant: rng.int(0, 3),
    element,
    w,
    mods,
    value: 0,
  };
  it.value = itemValue(it);
  return it;
}

function bonusMod(rng: Rng, level: number): Mod {
  const b = rng.weighted(BONUS_POOL.map((p) => [p, p.w] as const));
  const scale = b.add !== undefined && ['maxHp', 'maxShield', 'armor', 'hpRegen'].includes(b.stat) ? levelMult(level) * 0.8 + 0.2 : 1;
  const k = rng.float(0.8, 1.3);
  const m: Mod = { stat: b.stat };
  if (b.add !== undefined) m.add = round2(b.add * scale * k);
  if (b.mul !== undefined) m.mul = round2(b.mul * k);
  return m;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function makePart(rng: Rng, slot: 'plow' | 'engine' | 'wheels' | 'shield', rarity: Rarity, level: number): Item {
  const vi = rng.int(0, PARTS[slot].length - 1);
  const def = PARTS[slot][vi];
  const m = RARITY[rarity].mult;
  const lm = levelMult(level);
  const mods: Mod[] = def.main.map((mm) => {
    const o: Mod = { stat: mm.stat };
    const scaleAdd = ['maxShield', 'armor', 'maxHp'].includes(mm.stat) ? lm * m : m;
    if (mm.add !== undefined) o.add = round2(mm.add * (mm.add > 0 ? scaleAdd : 1) * rng.float(0.9, 1.15));
    if (mm.mul !== undefined) o.mul = round2(mm.mul * (mm.mul > 0 ? m : 1) * rng.float(0.9, 1.15));
    return o;
  });
  if (slot === 'shield') {
    // every shield also scales capacity with level
    const cap = mods.find((x) => x.stat === 'maxShield');
    if (cap && cap.add) cap.add = Math.round(cap.add);
  }
  const extra = rarity >= 4 ? 3 : rarity >= 3 ? 2 : rarity >= 1 ? 1 : 0;
  for (let i = 0; i < extra; i++) mods.push(bonusMod(rng, level));
  const it: Item = {
    uid: nextUid(),
    slot,
    rarity,
    level,
    name: rng.pick(def.names),
    variant: vi,
    element: slot === 'shield' && rarity >= 2 && rng.chance(0.3) ? rng.pick(['fire', 'shock', 'acid', 'cryo'] as const) : 'none',
    mods,
    value: 0,
  };
  if (slot === 'shield' && it.element !== 'none') {
    it.specialText = `Shield break releases a ${ELEMENT_NAMES[it.element].toLowerCase()} nova.`;
    it.special = 'elemNova';
  }
  it.value = itemValue(it);
  return it;
}

function makeGadget(rng: Rng, rarity: Rarity, level: number): Item {
  const gt = rng.pick(Object.keys(GADGETS) as GadgetType[]);
  const g = GADGETS[gt];
  const mods: Mod[] = [];
  const extra = rarity >= 3 ? 2 : rarity >= 1 ? 1 : 0;
  for (let i = 0; i < extra; i++) mods.push(bonusMod(rng, level));
  const it: Item = {
    uid: nextUid(),
    slot: 'gadget',
    rarity,
    level,
    name: rng.pick(g.names),
    gtype: gt,
    variant: 0,
    element: gt === 'pulse' ? 'shock' : gt === 'mines' && rng.chance(0.4) ? rng.pick(['fire', 'acid', 'cryo'] as const) : 'none',
    mods,
    value: 0,
    cooldown: g.cooldown * (1 - rarity * 0.06),
    power: levelMult(level) * RARITY[rarity].mult,
  };
  it.value = itemValue(it);
  return it;
}

function makeLegendary(rng: Rng, def: LegendaryDef, level: number): Item {
  let it: Item;
  if (def.slot === 'main' || def.slot === 'side') {
    const t = def.wtype!;
    const w = weaponStats(t, level, 4);
    def.tweak?.(w);
    it = {
      uid: nextUid(), slot: def.slot, rarity: 4, level, name: def.name, maker: rng.pick(MAKERS).name, wtype: t, variant: 4,
      element: def.element ?? pickElement(rng, 0.5), w, mods: [bonusMod(rng, level), bonusMod(rng, level)], value: 0,
    };
    if (t === 'flamer' && it.element === 'none') it.element = 'fire';
    if (t === 'tesla' && it.element === 'none') it.element = 'shock';
  } else if (def.slot === 'gadget') {
    const gt = def.gtype!;
    it = {
      uid: nextUid(), slot: 'gadget', rarity: 4, level, name: def.name, gtype: gt, variant: 0, element: gt === 'pulse' ? 'shock' : 'none',
      mods: [bonusMod(rng, level)], value: 0, cooldown: GADGETS[gt].cooldown * 0.75, power: levelMult(level) * RARITY[4].mult,
    };
  } else {
    const base = makePart(rng, def.slot as 'plow' | 'engine' | 'wheels' | 'shield', 4, level);
    it = { ...base, name: def.name, variant: 4, mods: [...(def.mods ?? []), ...base.mods.slice(0, 3)] };
  }
  it.special = def.special;
  it.specialText = def.text;
  it.flavor = def.flavor;
  it.value = itemValue(it);
  return it;
}

export function itemValue(it: Item) {
  return Math.round((20 + it.level * 9) * [1, 1.8, 3.2, 6, 11][it.rarity]);
}

/** Effective DPS estimate for comparisons. */
export function weaponDps(it: Item): number {
  if (!it.w) return 0;
  const w = it.w;
  const shotsPerMag = w.mag;
  const magTime = shotsPerMag / w.fireRate;
  const cycle = magTime + w.reload;
  const perShot = w.damage * w.pellets * (w.splash > 0 ? 1.15 : 1);
  return (perShot * shotsPerMag) / cycle;
}

export function itemScore(it: Item): number {
  if (it.w) return weaponDps(it) * (1 + (it.element !== 'none' ? 0.15 : 0)) * (it.special ? 1.2 : 1);
  let s = it.level * 10 * RARITY[it.rarity].mult;
  s += it.mods.length * 4;
  if (it.special) s *= 1.3;
  return s;
}

export function starterItems(rng: Rng, carId: string): Partial<Record<Slot, Item>> {
  const main = makeWeapon(rng, 'main', 0, 1);
  const mt: WeaponType = carId === 'wisp' ? 'mg' : carId === 'juggernaut' ? 'cannon' : carId === 'hearse' ? 'shotgun' : 'mg';
  const mw = weaponStats(mt, 1, 0);
  main.wtype = mt;
  main.w = mw;
  main.element = 'none';
  main.maker = 'Ratchet & Sons';
  main.name = mt === 'mg' ? 'Trusty Rattler' : mt === 'cannon' ? 'Old Boomstick' : 'Family Scattershot';
  const side = makeWeapon(rng, 'side', 0, 1);
  side.wtype = 'rocket';
  side.w = weaponStats('rocket', 1, 0);
  side.element = 'none';
  side.name = 'Rusty Rocket Pod';
  side.maker = 'Ratchet & Sons';
  const shield = makePart(rng, 'shield', 0, 1);
  shield.name = 'Hand-me-down Ward';
  shield.mods = [{ stat: 'maxShield', add: 60 }];
  shield.element = 'none';
  shield.special = undefined;
  shield.specialText = undefined;
  const gadget = makeGadget(rng, 0, 1);
  const gt: GadgetType = carId === 'wisp' ? 'hop' : carId === 'hearse' ? 'turret' : carId === 'juggernaut' ? 'pulse' : 'mines';
  gadget.gtype = gt;
  gadget.name = GADGETS[gt].names[0];
  gadget.cooldown = GADGETS[gt].cooldown;
  gadget.element = gt === 'pulse' ? 'shock' : 'none';
  gadget.mods = [];
  for (const it of [main, side, shield, gadget]) it.value = itemValue(it);
  return { main, side, shield, gadget };
}
