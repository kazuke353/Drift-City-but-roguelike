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
    wall: { base: '#3c4462', dark: '#0d0f18', light: '#6f7a9c', accent: '#2c5a4a', mortar: '#090a11' },
    floor: { base: '#3d4359', dark: '#0d0e17', light: '#6b718a', accent: '#27473a', mortar: '#07080e' },
    fog: 0x070a15,
    fogNear: 55,
    fogFar: 210,
    hemiSky: 0x4a62a8,
    hemiGround: 0x1a1226,
    hemiIntensity: 1.05,
    keyColor: 0x9ab4ff,
    keyIntensity: 1.0,
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
    wall: { base: '#43385f', dark: '#0e0a18', light: '#7d6cab', accent: '#a04cff', mortar: '#0a0710' },
    floor: { base: '#463c5c', dark: '#0e0a17', light: '#71668c', accent: '#b8801f', mortar: '#08060d' },
    fog: 0x0d0618,
    fogNear: 55,
    fogFar: 210,
    hemiSky: 0x7a50c0,
    hemiGround: 0x22102c,
    hemiIntensity: 1.1,
    keyColor: 0xc8a8ff,
    keyIntensity: 1.0,
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
    wall: { base: '#4a2f30', dark: '#120809', light: '#8c5646', accent: '#ff5a1a', mortar: '#0b0505' },
    floor: { base: '#4c3536', dark: '#110909', light: '#77504a', accent: '#ff6a1a', mortar: '#0a0505' },
    fog: 0x140504,
    fogNear: 50,
    fogFar: 200,
    hemiSky: 0xb04a34,
    hemiGround: 0x2a0c06,
    hemiIntensity: 1.1,
    keyColor: 0xffa070,
    keyIntensity: 1.05,
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
