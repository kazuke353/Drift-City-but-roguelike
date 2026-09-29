import type { Mod } from './Stats';

export type ChassisKind = 'muscle' | 'hearse' | 'buggy' | 'truck';

export interface ChassisDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  passive: string;
  passiveId: string;
  cost: number;
  kind: ChassisKind;
  mods: Mod[];
  colors: { primary: string; secondary: string; accent: string; style: 'shards' | 'stripes' | 'flames' | 'hazard'; emblem: 'crown' | 'skull' | 'flame' | 'eye' };
  bars: { speed: number; armor: number; handling: number; firepower: number };
}

export const CHASSIS: ChassisDef[] = [
  {
    id: 'rustbucket',
    name: 'RUSTBUCKET',
    title: 'The Muscle',
    desc: 'A supercharged muscle car with a crown on the hood and a grudge in the trunk. Balanced in every way that matters.',
    passive: 'BURNOUT: Drift boosts are 40% stronger.',
    passiveId: 'burnout',
    cost: 0,
    kind: 'muscle',
    mods: [],
    colors: { primary: '#b3121f', secondary: '#111111', accent: '#f2efe6', style: 'shards', emblem: 'crown' },
    bars: { speed: 3, armor: 3, handling: 3, firepower: 3 },
  },
  {
    id: 'wisp',
    name: 'WILL-O-WISP',
    title: 'The Buggy',
    desc: 'A roll-cage dune buggy that weighs about as much as a ghost. Blisteringly quick, cries when hit.',
    passive: 'FEATHERWEIGHT: +30% nitro regen. Hops cool down twice as fast.',
    passiveId: 'featherweight',
    cost: 8,
    kind: 'buggy',
    mods: [{ stat: 'topSpeed', mul: 0.14 }, { stat: 'accel', mul: 0.25 }, { stat: 'handling', mul: 0.2 }, { stat: 'maxHp', mul: -0.3 }, { stat: 'armor', add: -5 }, { stat: 'boostRegen', mul: 0.3 }, { stat: 'mass', mul: -0.3 }],
    colors: { primary: '#2a9d4a', secondary: '#f2d024', accent: '#111111', style: 'hazard', emblem: 'eye' },
    bars: { speed: 5, armor: 1, handling: 5, firepower: 2 },
  },
  {
    id: 'hearse',
    name: 'GRAVE DIGGER',
    title: 'The Hearse',
    desc: 'A gothic hearse with gold trim and a coffin full of guns. The dead ride shotgun.',
    passive: 'UNDERTAKER: Kills have a 12% chance to raise a ghost skull that hunts enemies.',
    passiveId: 'undertaker',
    cost: 14,
    kind: 'hearse',
    mods: [{ stat: 'maxHp', mul: 0.15 }, { stat: 'maxShield', mul: 0.2 }, { stat: 'topSpeed', mul: -0.05 }, { stat: 'critChance', add: 0.05 }],
    colors: { primary: '#1a1420', secondary: '#c89a2a', accent: '#8e3cff', style: 'stripes', emblem: 'skull' },
    bars: { speed: 2, armor: 4, handling: 3, firepower: 4 },
  },
  {
    id: 'juggernaut',
    name: 'JUGGERNAUT',
    title: 'The Truck',
    desc: 'A monster truck built from a siege engine. It does not go around things.',
    passive: 'UNSTOPPABLE: Double ram damage. Immune to knockback.',
    passiveId: 'unstoppable',
    cost: 20,
    kind: 'truck',
    mods: [{ stat: 'maxHp', mul: 0.45 }, { stat: 'armor', add: 15 }, { stat: 'mass', mul: 0.8 }, { stat: 'ramDamage', mul: 1 }, { stat: 'topSpeed', mul: -0.1 }, { stat: 'accel', mul: -0.12 }, { stat: 'handling', mul: -0.12 }],
    colors: { primary: '#d46a12', secondary: '#1a1a1a', accent: '#f2d024', style: 'flames', emblem: 'flame' },
    bars: { speed: 2, armor: 5, handling: 2, firepower: 3 },
  },
];

export const CHASSIS_MAP = new Map(CHASSIS.map((c) => [c.id, c]));

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: (lvl: number) => string;
  icon: string;
  costs: number[];
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'hull', name: 'Reinforced Frame', desc: (l) => `+${l * 8}% max hull`, icon: 'heart', costs: [3, 5, 8, 12, 18] },
  { id: 'shield', name: 'Warded Chassis', desc: (l) => `+${l * 8}% shield capacity`, icon: 'shield', costs: [3, 5, 8, 12, 18] },
  { id: 'firepower', name: 'Gunsmith Guild', desc: (l) => `+${l * 5}% weapon damage`, icon: 'cannon', costs: [4, 7, 11, 16, 22] },
  { id: 'startGold', name: 'Trust Fund', desc: (l) => `Start runs with ${l * 50} gold`, icon: 'coin', costs: [2, 4, 7, 10] },
  { id: 'luck', name: 'Rabbit Foot Air Freshener', desc: (l) => `+${l * 4} luck`, icon: 'clover', costs: [4, 8, 13, 19] },
  { id: 'nitro', name: 'Nitro Distillery', desc: (l) => `+${l * 12}% nitro capacity & regen`, icon: 'engine', costs: [3, 6, 10] },
  { id: 'rerolls', name: 'Loaded Deck', desc: (l) => `${l} free perk reroll${l === 1 ? '' : 's'} per run`, icon: 'dice', costs: [5, 10, 16] },
  { id: 'startRarity', name: 'Family Heirloom', desc: (l) => (l >= 2 ? 'Starting weapons are Rare' : l >= 1 ? 'Starting weapons are Uncommon' : 'Better starting weapons'), icon: 'crown', costs: [8, 18] },
  { id: 'secondWind', name: 'Stubborn Engine', desc: (l) => `Last Gear lasts +${l * 1.5}s`, icon: 'heart', costs: [4, 8, 12] },
  { id: 'keys', name: 'Key Ring', desc: (l) => `Start runs with ${l} key${l === 1 ? '' : 's'}`, icon: 'key', costs: [5, 11] },
];
