import type { Palette } from '../render/Textures';

export interface Biome {
  id: string;
  name: string;
  act: number;
  wall: Palette;
  floor: Palette;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyColor: number;
  keyIntensity: number;
  torchColor: number;
  runeColor: number;
  bannerColor: string;
  bannerEmblem: 'skull' | 'crown' | 'flame' | 'eye';
  accentProp: 'crystals' | 'gold' | 'bones';
  lava: boolean;
  floorNames: string[];
  bossName: string;
  graffiti: string[][];
}

export const BIOMES: Biome[] = [
  {
    id: 'crypt',
    name: 'The Gilded Crypt',
    act: 1,
    wall: { base: '#5a5f6e', dark: '#15161c', light: '#8a90a0', accent: '#3d5a3a', mortar: '#23252e' },
    floor: { base: '#565a64', dark: '#141519', light: '#7d828e', accent: '#2f4a33', mortar: '#1f2026' },
    fog: 0x0b0d16,
    fogNear: 70,
    fogFar: 230,
    hemiSky: 0x6070a0,
    hemiGround: 0x2a2018,
    hemiIntensity: 1.2,
    keyColor: 0xb0c0ff,
    keyIntensity: 0.9,
    torchColor: 0xff8a2a,
    runeColor: 0x2aa8ff,
    bannerColor: '#8e1420',
    bannerEmblem: 'skull',
    accentProp: 'bones',
    lava: false,
    floorNames: ['Catacombs', 'Blood Halls', 'Ossuary Row', 'The Pale Galleries', 'Knightfall Nave'],
    bossName: "Iron Bishop's Nave",
    graffiti: [['MORE LOOT', 'LESS BRAKES'], ['HONK IF', "YOU'RE LOOTED"], ['NO PARKING', 'EVER'], ['DRIFT OR', 'DIE']],
  },
  {
    id: 'vaults',
    name: 'The Crystal Vaults',
    act: 2,
    wall: { base: '#4b3f63', dark: '#120d1c', light: '#7a6a9a', accent: '#b04cff', mortar: '#1d1629' },
    floor: { base: '#4a4058', dark: '#120e18', light: '#6e6284', accent: '#c78a2a', mortar: '#1b1622' },
    fog: 0x120a1e,
    fogNear: 70,
    fogFar: 230,
    hemiSky: 0x8a60c0,
    hemiGround: 0x2a1830,
    hemiIntensity: 1.25,
    keyColor: 0xd0b0ff,
    keyIntensity: 0.9,
    torchColor: 0xc070ff,
    runeColor: 0xb44cff,
    bannerColor: '#3a1a5e',
    bannerEmblem: 'crown',
    accentProp: 'crystals',
    lava: true,
    floorNames: ['Ancient Vaults', 'Amethyst Deeps', 'The Counting House', 'Gilded Undercroft', 'Glittering Sump'],
    bossName: "The Hoardlord's Treasury",
    graffiti: [['ALL TREASURE', 'DRIVES TO ME'], ['MORE LOOT', 'LESS BRAKES'], ['FINDERS', 'KEEPERS'], ['TAX FREE', 'ZONE']],
  },
  {
    id: 'ashen',
    name: 'The Ashen Crypt',
    act: 3,
    wall: { base: '#4a302c', dark: '#140a09', light: '#7a4a3a', accent: '#ff5a1a', mortar: '#1e1110' },
    floor: { base: '#4a3530', dark: '#120b0a', light: '#6e4a40', accent: '#ff6a1a', mortar: '#1c100e' },
    fog: 0x1a0806,
    fogNear: 65,
    fogFar: 220,
    hemiSky: 0xc06040,
    hemiGround: 0x301008,
    hemiIntensity: 1.2,
    keyColor: 0xffb080,
    keyIntensity: 0.95,
    torchColor: 0xff6a20,
    runeColor: 0xff3a2a,
    bannerColor: '#5e0c0c',
    bannerEmblem: 'flame',
    accentProp: 'bones',
    lava: true,
    floorNames: ['Chamber of Embers', 'The Cinder Stair', 'Ashfall Cloister', 'Brimstone Row', 'The Last Toll'],
    bossName: 'Throne of the Bone Sovereign',
    graffiti: [['THE DEAD', 'PAY TOLLS'], ['RICHER', 'IN DEATH'], ['ALL ROADS', 'END HERE'], ['MORE LOOT', 'BEYOND DEATH']],
  },
];

export function biomeForAct(act: number) {
  return BIOMES[Math.max(0, Math.min(BIOMES.length - 1, act - 1))];
}
