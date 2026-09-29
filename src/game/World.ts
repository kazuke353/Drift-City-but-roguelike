import * as THREE from 'three';
import type { Game } from './Game';
import type { Run, FloorMod } from './Run';
import { FLOOR_MODS } from './Run';
import { generateDungeon, TILE, Tile, type DungeonData, type Room } from '../world/DungeonGen';
import { buildLevel, type Level, type Gate } from '../world/LevelBuilder';
import type { Grid } from '../world/Grid';
import { PlayerCar, type DriveInput } from '../entities/PlayerCar';
import { Enemy, type EliteMod } from '../entities/Enemy';
import { ENEMIES, spawnTable } from '../entities/EnemyTypes';
import { BOSSES, BOSS_BY_ACT } from '../entities/Bosses';
import { Projectiles, type Proj } from '../combat/Projectiles';
import { Pickups, type GroundItem } from '../entities/Pickups';
import { Props, type Interactable, type Chest, type Portal } from '../entities/Props';
import { CameraRig } from './CameraRig';
import { CHASSIS_MAP } from './Cars';
import { ELEMENT_COLORS, type Element, type FX } from '../fx/FX';
import { SHAPE_DOT, SHAPE_CORE } from '../fx/Particles';
import { audio } from '../audio/Audio';
import { Rng, rand } from '../core/Rng';
import { clamp, raySphere } from '../core/MathUtil';
import { generateItem, RARITY, type Item, type Rarity, type Slot } from '../loot/Items';
import { RELICS, RELIC_MAP } from '../loot/Relics';
import type { WeaponRuntime } from '../combat/Weapons';
import { Save } from '../core/Save';
import { toon, glow } from '../render/Toon';

export interface DamageInfo {
  amount: number;
  element: Element;
  source: 'weapon' | 'ram' | 'explosion' | 'status' | 'gadget' | 'thorns' | 'horn' | 'hazard' | 'turret' | 'ghost' | 'chain' | 'fire';
  elemChance?: number;
  headshot?: boolean;
  critBonus?: number;
  noCrit?: boolean;
  noStatus?: boolean;
  weapon?: WeaponRuntime | null;
  kx?: number;
  kz?: number;
  knock?: number;
  hx?: number;
  hy?: number;
  hz?: number;
  silent?: boolean;
  quiet?: boolean;
}

export interface PlayerHitOpts {
  element?: Element;
  melee?: boolean;
  enemy?: Enemy | null;
  x?: number;
  z?: number;
  knock?: number;
  silent?: boolean;
  collision?: boolean;
  hazard?: boolean;
  projectile?: boolean;
}

interface RoomState {
  room: Room;
  visited: boolean;
  cleared: boolean;
  active: boolean;
  waves: { def: string; elite: EliteMod[] | null; mini?: boolean }[][];
  waveIdx: number;
  queue: { def: string; x: number; z: number; t: number; elite: EliteMod[] | null; mini?: boolean }[];
  enemies: Set<Enemy>;
  gates: Gate[];
}

export interface ShopEntry {
  kind: 'item' | 'relic' | 'repair' | 'key' | 'nitro';
  item?: Item;
  relic?: string;
  price: number;
  sold: boolean;
}

export interface ShrineDef {
  id: 'blood' | 'gamble' | 'forge' | 'fountain';
  name: string;
  desc: string;
  used: boolean;
}

interface FirePatch {
  x: number; z: number; r: number; t: number; max: number; dps: number; team: 'player' | 'enemy'; kind: 'fire' | 'shadow'; tick: number;
}
interface Shockwave {
  x: number; z: number; r: number; max: number; speed: number; dmg: number; hit: boolean; delay: number; color: number;
}
interface Turret {
  x: number; z: number; t: number; dmg: number; cd: number; mesh: THREE.Group; head: THREE.Object3D;
}
interface Well {
  x: number; z: number; t: number; max: number; dmg: number;
}

const ELEM_MULT: Record<string, Record<Element, number>> = {
  bone: { none: 1, fire: 1.2, shock: 1, acid: 1, cryo: 1 },
  flesh: { none: 1, fire: 1.5, shock: 0.9, acid: 0.9, cryo: 1 },
  armor: { none: 0.9, fire: 0.7, shock: 0.9, acid: 1.6, cryo: 1 },
  spirit: { none: 0.85, fire: 1, shock: 1.5, acid: 0.8, cryo: 1.1 },
};

export class World {
  group = new THREE.Group();
  d: DungeonData;
  level: Level;
  grid: Grid;
  player: PlayerCar;
  enemies: Enemy[] = [];
  projectiles: Projectiles;
  pickups: Pickups;
  props: Props;
  rooms: RoomState[] = [];
  cam: CameraRig;
  fx: FX;
  rng: Rng;
  time = 0;
  aimPoint = new THREE.Vector3();
  aimEnemy: Enemy | null = null;
  boss: Enemy | null = null;
  bossDef: { id: string; title: string; subtitle: string } | null = null;
  currentRoom = -1;
  firePatches: FirePatch[] = [];
  shockwaves: Shockwave[] = [];
  turrets: Turret[] = [];
  wells: Well[] = [];
  shops = new Map<number, ShopEntry[]>();
  shrines = new Map<number, ShrineDef>();
  private hash = new Map<number, Enemy[]>();
  private flowT = 0;
  combo = 0;
  comboT = 0;
  enemyDmgMult: number;
  enemyHpMult: number;
  exploredRooms = new Set<number>();
  exitPortals: Portal[] = [];
  bossDefeated = false;
  hpDisplay = 0;
  interactTarget: Interactable | null = null;
  lootTarget: GroundItem | null = null;
  lavaT = 0;
  private secondWindT = 0;
  roomsTotal = 0;
  roomsCleared = 0;

  constructor(public game: Game, public run: Run) {
    this.fx = game.fx;
    this.rng = new Rng(run.seed + run.floor * 7919);
    const biome = run.biome;
    const isBoss = run.isBossFloor;
    const extraTreasure = run.hasMod('ancientVaults') ? 1 : 0;
    const extraShops = run.hasMod('bargainBin') ? 1 : 0;
    const eliteRooms = run.hasMod('eliteHunt') ? 2 : 1;
    this.d = generateDungeon({
      seed: run.seed + run.floor * 1013,
      roomCount: 8 + Math.min(4, Math.floor(run.floor / 2)) + extraTreasure + extraShops,
      isBoss, act: run.act, lavaAllowed: biome.lava, extraTreasure, extraShops, eliteRooms,
    });
    this.level = buildLevel(this.d, biome, game.lights, run.seed + run.floor);
    this.grid = this.level.grid;
    this.group.add(this.level.group);
    game.renderer.scene.add(this.group);
    const f = run.floor;
    this.enemyHpMult = Math.pow(1.19, f) * (1 + (Save.data.wins > 0 ? 0.05 * Math.min(4, Save.data.wins) : 0));
    this.enemyDmgMult = Math.pow(1.12, f) * (run.special('poorDecisions') > 0 ? 1.35 : 1);

    this.projectiles = new Projectiles(this, this.group as unknown as THREE.Scene);
    this.pickups = new Pickups(this, this.group as unknown as THREE.Scene);
    this.props = new Props(this, this.group as unknown as THREE.Scene);
    this.fx.debris.isSolid = (x, z) => this.grid.isSolidAt(x, z);

    this.player = new PlayerCar(this, CHASSIS_MAP.get(run.chassis.id)!);
    this.group.add(this.player.model.root);
    this.player.refreshLoadout();
    const start = this.d.rooms[this.d.startRoom];
    this.player.pos.set(start.wx, 0, start.wz);
    // face toward the first door
    const door = start.doors[0];
    if (door) {
      const dx = ((door.x0 + door.x1) / 2) * TILE - start.wx, dz = ((door.y0 + door.y1) / 2) * TILE - start.wz;
      this.player.heading = Math.atan2(dx, dz);
    }
    this.cam = new CameraRig(game.renderer.camera);
    this.cam.snapTo(this.player);

    for (const r of this.d.rooms) {
      this.rooms.push({ room: r, visited: false, cleared: !['combat', 'elite', 'boss'].includes(r.type), active: false, waves: [], waveIdx: 0, queue: [], enemies: new Set(), gates: this.level.gatesOfRoom(r.id) });
    }
    this.roomsTotal = this.rooms.filter((r) => ['combat', 'elite'].includes(r.room.type)).length;
    this.populate();
    this.game.renderer.setFog(biome.fog, biome.fogNear, biome.fogFar);
    const r = this.game.renderer;
    r.hemi.color.set(biome.hemiSky);
    r.hemi.groundColor.set(biome.hemiGround);
    r.hemi.intensity = biome.hemiIntensity;
    r.keyLight.color.set(biome.keyColor);
    r.keyLight.intensity = biome.keyIntensity;
  }

  get isBossFloor() {
    return this.d.isBoss;
  }

  get lights() {
    return this.game.lights;
  }

  dispose() {
    this.game.renderer.scene.remove(this.group);
    this.level.dispose();
    this.fx.clear();
    this.game.lights.clearStatics();
    audio.stopAllLoops();
    for (const wr of this.player.weapons) wr?.stopLoops();
  }

  // ================================================================= population
  private populate() {
    const rng = this.rng;
    const run = this.run;
    const T = TILE;
    const freeSpot = (r: Room, margin = 2, tries = 40): [number, number] | null => {
      for (let i = 0; i < tries; i++) {
        const tx = rng.int(r.x0 + margin, r.x1 - 1 - margin), ty = rng.int(r.y0 + margin, r.y1 - 1 - margin);
        if (this.d.tiles[ty * this.d.w + tx] !== Tile.Floor) continue;
        const x = (tx + 0.5) * T + rng.float(-1, 1), z = (ty + 0.5) * T + rng.float(-1, 1);
        if (this.grid.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 3)) continue;
        if (this.props.destructibles.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue;
        return [x, z];
      }
      return null;
    };
    // markers → hazards
    const rampRooms = new Map<number, number>();
    for (const mk of this.d.markers) {
      const x = (mk.x + 0.5) * T, z = (mk.y + 0.5) * T;
      if (mk.kind === 'spikes') this.props.addSpikes(x, z);
      else if (mk.kind === 'mace') this.props.addMace(x, z, rng.int(0, 1));
      else if (mk.kind === 'ramp') {
        const k = rampRooms.get(mk.room) ?? 0;
        rampRooms.set(mk.room, k + 1);
        const dir = mk.dir === 0 ? Math.PI / 2 : mk.dir === 1 ? -Math.PI / 2 : mk.dir === 2 ? 0 : Math.PI;
        const off = k === 0 ? -9 : 9;
        const ox = mk.dir! >= 2 ? off : 0, oz = mk.dir! < 2 ? off : 0;
        this.props.addRamp(x + ox, z + oz, dir);
      }
    }
    this.props.finalizeSpikes();

    for (const rs of this.rooms) {
      const r = rs.room;
      const cx = r.wx, cz = r.wz;
      switch (r.type) {
        case 'combat':
        case 'elite': {
          const n = rng.int(3, 7);
          for (let i = 0; i < n; i++) {
            const s = freeSpot(r, 1);
            if (!s) continue;
            const k = rng.weighted<'barrel' | 'crate' | 'urn' | 'tnt' | 'sack'>([['barrel', 4], ['crate', 3], ['urn', 2], ['tnt', 1.6], ['sack', 0.6]]);
            this.props.addDestructible(k, s[0], s[1]);
          }
          this.planWaves(rs);
          break;
        }
        case 'treasure': {
          const mimic = rng.chance(0.18 + run.floor * 0.02);
          const tier: 0 | 1 | 2 = rng.chance(0.18 + run.floor * 0.03) ? 2 : rng.chance(0.5) ? 1 : 0;
          if (mimic) {
            const e = this.spawnEnemy('mimic', cx, cz, r.id, { instant: true });
            if (e) e.state = 'disguised';
          } else this.props.addChest(cx, cz, tier);
          if (rng.chance(0.35)) this.addRelicAltar(cx + 8, cz, 3);
          for (let i = 0; i < 4; i++) {
            const s = freeSpot(r, 1);
            if (s) this.props.addDestructible(rng.chance(0.5) ? 'sack' : 'urn', s[0], s[1]);
          }
          break;
        }
        case 'vault': {
          this.props.addChest(cx, cz - 3, 2);
          this.addRelicAltar(cx, cz + 6, 3);
          for (const g of this.level.gatesOfRoom(r.id)) {
            this.level.setGate(g, false);
            this.props.addInteractable({
              x: g.x, z: g.z, r: 9, enabled: true,
              label: () => (run.keys > 0 ? 'Unlock Vault' : 'Vault Locked (needs a Key)'),
              sub: () => `Keys: ${run.keys}`,
              use: () => {
                if (run.keys <= 0) {
                  audio.play('uiError');
                  this.say('needKey');
                  return;
                }
                run.keys--;
                for (const gg of this.level.gatesOfRoom(r.id)) this.level.setGate(gg, true);
                audio.play('gate', { x: g.x, z: g.z });
                this.toast('VAULT OPENED', 'Treasure awaits', '#ffc21a');
                for (const it of this.props.interactables) if (Math.hypot(it.x - g.x, it.z - g.z) < 0.1) it.enabled = false;
              },
            });
          }
          break;
        }
        case 'shop':
        case 'pitstop': {
          this.buildShop(r);
          if (r.type === 'pitstop') this.addRepairStation(cx + 10, cz + 6, true);
          break;
        }
        case 'shrine':
          this.buildShrine(r);
          break;
        case 'exit':
          this.buildExit(r);
          break;
        case 'start': {
          if (run.floor === 0) {
            for (let i = 0; i < 4; i++) {
              const s = freeSpot(r, 2);
              if (s) this.props.addDestructible(i === 0 ? 'tnt' : 'barrel', s[0], s[1]);
            }
          }
          break;
        }
        case 'boss':
          this.bossDef = BOSS_BY_ACT[run.act];
          break;
      }
    }
    // corridors: occasional barrels
    for (const c of this.d.corridors) {
      if (rng.chance(0.4)) {
        const x = ((c.x0 + c.x1) / 2) * T + rng.float(-3, 3), z = ((c.y0 + c.y1) / 2) * T + rng.float(-3, 3);
        this.props.addDestructible(rng.chance(0.3) ? 'tnt' : 'barrel', x, z);
      }
    }
  }

  private planWaves(rs: RoomState) {
    const rng = this.rng;
    const run = this.run;
    const f = run.floor;
    const table = spawnTable(run.act, f);
    const size = ((rs.room.x1 - rs.room.x0) * (rs.room.y1 - rs.room.y0)) / 300;
    let mult = 1;
    if (run.hasMod('bloodHalls')) mult *= 1.35;
    if (run.hasMod('hordeNight')) mult *= 1.5;
    const elite = rs.room.type === 'elite';
    const waves = elite ? 2 : f >= 4 ? 3 : 2 + (rng.chance(0.4) ? 1 : 0);
    const eliteMods: EliteMod[] = ['armored', 'blazing', 'hasted', 'vampiric', 'shielded', 'volatile'];
    for (let wv = 0; wv < waves; wv++) {
      let budget = (4.5 + f * 1.3) * clamp(size, 0.8, 1.6) * mult * (wv === waves - 1 ? 1.15 : 1);
      const list: { def: string; elite: EliteMod[] | null; mini?: boolean }[] = [];
      if (elite && wv === waves - 1) {
        const big = rng.pick(table.filter(([d]) => d.cost >= 3).map(([d]) => d.id).concat(['brute']));
        list.push({ def: big, elite: [rng.pick(eliteMods), rng.pick(eliteMods)].filter((v, i, a) => a.indexOf(v) === i), mini: true });
        budget *= 0.5;
      }
      let guard = 0;
      while (budget > 0.5 && guard++ < 40) {
        const def = rng.weighted(table);
        if (def.cost > budget + 1) continue;
        budget -= def.cost;
        const eliteChance = (elite ? 0.25 : 0.03) + f * 0.018;
        const e = rng.chance(Math.min(0.35, eliteChance)) ? [rng.pick(eliteMods)] : null;
        list.push({ def: def.id, elite: e });
      }
      rs.waves.push(list);
    }
  }

  private buildShop(r: Room) {
    const run = this.run;
    const rng = this.rng;
    const lvl = run.depthLevel;
    const pm = run.priceMult();
    const entries: ShopEntry[] = [];
    for (let i = 0; i < 4; i++) {
      const item = generateItem(run.lootRng, { level: lvl + 1, luck: run.stats.luck + 8, minRarity: 1 });
      entries.push({ kind: 'item', item, price: Math.round(item.value * 1.6 * pm), sold: false });
    }
    const owned = new Set(run.relics);
    const relicPool = RELICS.filter((x) => !owned.has(x.id));
    if (relicPool.length) {
      const rel = rng.pick(relicPool);
      entries.push({ kind: 'relic', relic: rel.id, price: Math.round((140 + rel.tier * 80) * (1 + run.floor * 0.25) * pm), sold: false });
    }
    entries.push({ kind: 'repair', price: Math.round(50 * (1 + run.floor * 0.35) * pm), sold: false });
    entries.push({ kind: 'key', price: Math.round(75 * (1 + run.floor * 0.3) * pm), sold: false });
    entries.push({ kind: 'nitro', price: Math.round(20 * (1 + run.floor * 0.2) * pm), sold: false });
    this.shops.set(r.id, entries);
    // merchant model
    const g = new THREE.Group();
    const cart = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 3), toon(0x6a4226));
    cart.position.y = 1.8;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4), toon(0x2a8a4a));
    roof.position.y = 5.4;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.2, 1, 0.8);
    for (const x of [-2.6, 2.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.5, 6), toon(0x4a2a14));
      post.position.set(x, 4.2, 1.2);
      g.add(post);
    }
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.4, 12), toon(0x3a2a1a));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(-3.1, 1, 0);
    const wheel2 = wheel.clone();
    wheel2.position.x = 3.1;
    // goblin merchant
    const gob = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), toon(0x6a2a8a));
    body.position.y = 3.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), toon(0x5aa83a));
    head.position.y = 4.8;
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.0, 5), toon(0x5aa83a));
      ear.position.set(s * 0.8, 4.9, 0);
      ear.rotation.z = s * (Math.PI / 2 + 0.3);
      gob.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), glow(0xffe040, 3));
      eye.position.set(s * 0.22, 4.9, 0.55);
      gob.add(eye);
    }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.7, 10), toon(0x2a2a30));
    hat.position.y = 5.5;
    gob.add(body, head, hat);
    gob.position.z = -0.2;
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glow(0xffc060, 3));
    lantern.position.set(2.6, 5.4, 1.4);
    // sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), new THREE.MeshBasicMaterial({ map: this.signTex('SHOP', 'Loot for Gold'), transparent: true }));
    sign.position.set(0, 7.3, 1.2);
    // wares
    for (let i = 0; i < 5; i++) {
      const ware = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), glow(Object.values(RARITY)[1 + (i % 4)].color, 2.2));
      ware.position.set(-2 + i, 3.3, 1.3);
      g.add(ware);
    }
    g.add(cart, roof, wheel, wheel2, gob, lantern, sign);
    const pos = new THREE.Vector3(r.wx, 0, r.wz - (r.y1 - r.y0) * TILE * 0.25);
    g.position.copy(pos);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.game.lights.addStatic(pos.x + 2.6, 5.4, pos.z + 1.4, 0xffc060, 8, 22, 0.1);
    this.grid.obstacles.push({ x: pos.x, z: pos.z, r: 3.4, h: 6 });
    this.props.addInteractable({
      x: pos.x, z: pos.z + 3, r: 9, enabled: true,
      label: () => 'Browse Shop',
      sub: () => 'Goblin Merchant',
      use: () => this.game.ui.openShop(entries, this),
    }, g);
  }

  private signTex(t: string, s: string) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(10, 16);
    g.lineTo(500, 4);
    g.lineTo(490, 150);
    g.lineTo(18, 156);
    g.closePath();
    g.fill();
    g.strokeStyle = '#f2efe6';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = '#ffd23a';
    g.font = '72px "Anton", sans-serif';
    g.textAlign = 'center';
    g.fillText(t, 256, 88);
    g.fillStyle = '#e8242f';
    g.font = '30px "Barlow Condensed", sans-serif';
    g.fillText(s.toUpperCase(), 256, 132);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  addRepairStation(x: number, z: number, free: boolean) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.3, 20), toon(0x2a2a30, { emissive: 0x103020, emissiveIntensity: 1 }));
    pad.position.y = 0.15;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.15, 6, 30), glow(0x40ff80, 2.5));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.35;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), toon(0x3a3a42));
    post.position.set(4.6, 2.5, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.3), new THREE.MeshBasicMaterial({ map: this.signTex('PIT STOP', free ? 'Free repairs' : 'Repairs'), transparent: true, side: THREE.DoubleSide }));
    sign.position.set(4.6, 5.6, 0);
    g.add(pad, ring, post, sign);
    g.position.set(x, 0, z);
    let used = false;
    const run = this.run;
    const cost = () => (free && !used ? 0 : Math.round(60 * (1 + run.floor * 0.35) * run.priceMult()));
    this.props.addInteractable({
      x, z, r: 6, enabled: true,
      label: () => (run.hp >= run.stats.maxHp - 1 ? 'Hull Fully Repaired' : 'Repair Hull'),
      sub: () => (cost() === 0 ? 'FREE' : `${cost()} gold`),
      use: () => {
        if (run.hp >= run.stats.maxHp - 1) return;
        const c = cost();
        if (run.gold < c) {
          audio.play('uiError');
          return;
        }
        run.gold -= c;
        used = true;
        run.hp = run.stats.maxHp;
        run.shield = run.stats.maxShield;
        audio.play('heal');
        this.fx.magicBurst(x, 1, z, [0.3, 1, 0.5], 40, 8);
        this.toast('FULLY REPAIRED', '', '#60ff8a');
      },
    }, g);
  }

  addRelicAltar(x: number, z: number, choices: number) {
    if (this.grid.isSolidAt(x, z)) return;
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 2.4, 8), toon(0x4a4050));
    ped.position.y = 1.2;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), glow(0xff40c0, 2.6));
    orb.position.y = 3.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 6, 20), glow(0xffd23a, 3));
    ring.position.y = 3.6;
    g.add(ped, orb, ring);
    g.position.set(x, 0, z);
    g.userData.spin = [orb, ring];
    this.grid.obstacles.push({ x, z, r: 1.7, h: 3 });
    const it: Interactable = {
      x, z, r: 6, enabled: true,
      label: () => 'Claim a Relic',
      sub: () => `Choose 1 of ${choices}`,
      use: () => {
        const owned = new Set(this.run.relics);
        const pool = this.rng.shuffle(RELICS.filter((r) => !owned.has(r.id)).map((r) => r.id)).slice(0, choices);
        if (!pool.length) {
          this.run.addGold(200);
          it.enabled = false;
          return;
        }
        this.game.ui.openRelicChoice(pool, (id) => {
          if (id) {
            this.run.addRelic(id);
            this.player.refreshLoadout();
            audio.play('keystone');
            it.enabled = false;
            g.visible = false;
            this.fx.magicBurst(x, 3, z, [1, 0.3, 0.8], 40, 12);
            const rel = RELIC_MAP.get(id)!;
            this.toast(rel.name.toUpperCase(), rel.desc, rel.color);
          }
        });
      },
    };
    this.props.addInteractable(it, g);
    this.altars.push(g);
  }
  altars: THREE.Group[] = [];

  private buildShrine(r: Room) {
    const rng = this.rng;
    const defs: ShrineDef[] = [
      { id: 'blood', name: 'Blood Altar', desc: 'Offer 25% of your max hull for a random relic.', used: false },
      { id: 'gamble', name: "Gambler's Idol", desc: 'Pay gold for a mystery item. Might be amazing. Might be trash.', used: false },
      { id: 'forge', name: 'Soul Forge', desc: 'Pay gold to re-forge an equipped weapon at a higher rarity.', used: false },
      { id: 'fountain', name: 'Oil Fountain', desc: 'Fully repair hull and refill nitro. Free, once.', used: false },
    ];
    const def = rng.pick(defs);
    this.shrines.set(r.id, def);
    const g = new THREE.Group();
    const col = def.id === 'blood' ? 0xff2040 : def.id === 'gamble' ? 0xffd23a : def.id === 'forge' ? 0xff7020 : 0x40d0ff;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 1.2, 8), toon(0x3a3440));
    base.position.y = 0.6;
    const col1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 1.4), toon(0x5a5060));
    col1.position.y = 3.5;
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), glow(col, 3));
    top.position.y = 7;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 6, 24), glow(col, 2.5));
    halo.position.y = 7;
    g.add(base, col1, top, halo);
    g.position.set(r.wx, 0, r.wz);
    g.userData.spin = [top, halo];
    this.altars.push(g);
    this.game.lights.addStatic(r.wx, 7, r.wz, col, 8, 26, 0.1);
    this.grid.obstacles.push({ x: r.wx, z: r.wz, r: 3.2, h: 8 });
    this.props.addInteractable({
      x: r.wx, z: r.wz, r: 8, enabled: true,
      label: () => (def.used ? null : def.name),
      sub: () => def.desc,
      use: () => this.game.ui.openShrine(def, this),
    }, g);
  }

  private buildExit(r: Room) {
    const run = this.run;
    // two portals on the wall opposite the entrance
    const door = r.doors[0];
    const dir = door ? door.dir : 3;
    // portals face back toward the entrance
    const w = (r.x1 - r.x0) * TILE, h = (r.y1 - r.y0) * TILE;
    let px: number, pz: number, heading: number, ax: number, az: number;
    if (dir === 0) { px = r.x0 * TILE + 7; pz = r.wz; heading = Math.PI / 2; ax = 0; az = 1; }
    else if (dir === 1) { px = r.x1 * TILE - 7; pz = r.wz; heading = -Math.PI / 2; ax = 0; az = 1; }
    else if (dir === 2) { px = r.wx; pz = r.y0 * TILE + 7; heading = 0; ax = 1; az = 0; }
    else { px = r.wx; pz = r.y1 * TILE - 7; heading = Math.PI; ax = 1; az = 0; }
    const spread = Math.min(w, h) * 0.26;
    const nextFloor = run.floor + 1;
    const nextIsBoss = nextFloor % 3 === 2;
    const mods = this.rng.shuffle([...FLOOR_MODS]).slice(0, 2);
    const nextBiome = run.biome;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const mod = nextIsBoss ? null : mods[i];
      const name = nextIsBoss ? (i === 0 ? 'Boss Gate' : 'Boss Gate') : mod!.name;
      const sub = nextIsBoss ? nextBiome.bossName : `B${nextFloor + 1} · ${mod!.desc}`;
      const p = this.props.addPortal(px + ax * spread * s, pz + az * spread * s, heading, mod, name, sub);
      this.exitPortals.push(p);
      if (nextIsBoss) break;
    }
    if (nextIsBoss) this.exitPortals[0].group.position.set(px, 0, pz);
    if (nextIsBoss) {
      this.exitPortals[0].x = px;
      this.exitPortals[0].z = pz;
    }
    this.game.lights.addStatic(px, 6, pz, 0x40a0ff, 10, 30, 0.1);
  }

  // ================================================================= spawning
  spawnEnemy(id: string, x: number, z: number, room: number, opts: { elite?: EliteMod[] | null; summoned?: boolean; instant?: boolean; mini?: boolean } = {}): Enemy | null {
    const def = ENEMIES[id] ?? BOSSES[id];
    if (!def) return null;
    if (this.enemies.length > 90) return null;
    const hpMult = this.enemyHpMult * (def.boss ? 1 : 1);
    const e = new Enemy(def, x, z, room, hpMult, this.enemyDmgMult);
    if (opts.elite && opts.elite.length) e.makeElite(opts.elite);
    if (opts.mini) {
      e.isMiniboss = true;
      e.maxHp *= 1.6;
      e.hp = e.maxHp;
      e.displayName = e.displayName.replace(/^/, '');
    }
    e.summoned = !!opts.summoned;
    if (opts.instant) e.spawnT = 0;
    e.heading = Math.atan2(this.player.pos.x - x, this.player.pos.z - z);
    this.group.add(e.visual.root);
    this.enemies.push(e);
    const rs = this.rooms[room];
    if (rs) rs.enemies.add(e);
    if (!opts.instant) {
      this.fx.spawnPortal(x, z, def.body === 'spirit' ? [0.3, 1, 0.8] : [0.8, 0.2, 1]);
      audio.play('spawn', { x, z });
    }
    return e;
  }

  spawnBossAdds(id: string, n: number, boss: Enemy) {
    const r = this.d.rooms[boss.room];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const rad = (Math.min(r.x1 - r.x0, r.y1 - r.y0) * TILE) * 0.36;
      const x = r.wx + Math.cos(a) * rad, z = r.wz + Math.sin(a) * rad;
      const e = this.spawnEnemy(id, x, z, boss.room, {});
      if (e) e.summoned = true;
    }
  }

  countAlive(defId: string) {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.def.id === defId) n++;
    return n;
  }

  countSummons(room: number) {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.summoned && e.room === room) n++;
    return n;
  }

  // ================================================================= queries
  private rebuildHash() {
    this.hash.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const k = Math.floor(e.pos.x / 10) * 4096 + Math.floor(e.pos.z / 10);
      let b = this.hash.get(k);
      if (!b) this.hash.set(k, (b = []));
      b.push(e);
    }
  }

  enemiesNear(x: number, z: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    const x0 = Math.floor((x - r) / 10), x1 = Math.floor((x + r) / 10);
    const z0 = Math.floor((z - r) / 10), z1 = Math.floor((z + r) / 10);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const b = this.hash.get(ix * 4096 + iz);
      if (b) for (const e of b) out.push(e);
    }
    return out;
  }

  nearestEnemy(x: number, z: number, maxD: number, dirX?: number, dirZ?: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD;
    const dl = dirX !== undefined ? Math.hypot(dirX, dirZ!) || 1 : 1;
    for (const e of this.enemiesNear(x, z, maxD)) {
      if (!e.alive || e.spawnT > 0) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z;
      let d = Math.hypot(dx, dz);
      if (dirX !== undefined) {
        const cos = (dx * dirX + dz * dirZ!) / (d * dl || 1);
        if (cos < 0.2) continue;
        d *= 1.6 - cos;
      }
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ================================================================= damage
  damageEnemy(e: Enemy, info: DamageInfo) {
    if (!e.alive) return;
    const run = this.run;
    const st = run.stats;
    let amt = info.amount;
    let crit = false;
    if (!info.noCrit) {
      const chance = st.critChance + (info.critBonus ?? 0) + (e.frozenT > 0 ? 0.25 : 0);
      crit = !!info.headshot || Math.random() < chance;
    }
    if (crit) amt *= st.critDmg;
    amt *= ELEM_MULT[e.def.body][info.element];
    if (info.element !== 'none' && info.source !== 'status') amt *= st.elemDmg;
    if (e.acidT > 0) amt *= 1.2;
    if (e.def.boss || e.isElite || e.isMiniboss) amt *= st.bossDmg;
    if (e.elite.includes('armored') && info.element !== 'acid') amt *= 0.7;
    amt *= (e as any).invulnFactor ?? 1;
    if (e.def.id === 'hoardlord' && e.state === 'stunned') amt *= 1.5;
    if (e.shield > 0) {
      const mult = info.element === 'shock' ? 2 : 1;
      const absorbed = Math.min(e.shield, amt * mult);
      e.shield -= absorbed;
      amt -= absorbed / mult;
      if (e.shield <= 0) {
        audio.play('shieldBreak');
        this.fx.magicBurst(e.pos.x, e.def.height * 0.5, e.pos.z, [0.3, 0.6, 1], 20, 10);
      }
    }
    amt = Math.max(0, amt);
    e.hp -= amt;
    run.counters.damageDealt += amt;
    e.flash = Math.min(1, e.flash + (crit ? 1 : 0.6));
    e.punch = Math.min(1, e.punch + (e.def.boss ? 0.15 : 0.5));
    e.lastHitT = this.time;
    if (info.knock && info.kx !== undefined) e.knock(info.kx, info.kz ?? 0, info.knock * (crit ? 1.5 : 1));
    if (!info.noStatus && info.element !== 'none' && Math.random() < (info.elemChance ?? 0)) this.applyStatus(e, info.element, info.amount);
    if (st.lifesteal > 0 && (info.source === 'weapon' || info.source === 'ram')) run.hp = Math.min(st.maxHp, run.hp + amt * st.lifesteal);
    // on-hit specials
    if (info.weapon?.item.special === 'taxCollector' && Math.random() < 0.08) this.pickups.spawnGold(e.pos.x, e.pos.z, 2 + run.floor, 0.6);
    if (crit && info.source === 'weapon') {
      if ((run.special('critChain') > 0 || info.weapon?.item.special === 'critChain') && Math.random() < 0.6) this.chainLightning(e, amt * 0.4, 2);
      if (run.special('critExplode') > 0 && Math.random() < 0.35) this.explode(e.pos.x, e.def.height * 0.5, e.pos.z, 3.5, amt * 0.4, { team: 'player', element: info.element, small: true, noChain: true });
    }
    if (!info.silent || crit) {
      const hy = info.hy ?? e.y + e.def.height * e.scale * 0.8;
      if (!info.quiet || crit || Math.random() < 0.3) this.game.ui.damageNumber(info.hx ?? e.pos.x, hy + 0.5, info.hz ?? e.pos.z, amt, crit, info.element, e.def.boss);
      if (info.hx !== undefined) this.fx.hit(info.hx, hy, info.hz!, info.element, crit, info.kx ?? 0, info.kz ?? 0);
      if (!info.quiet) {
        if (crit) audio.play('crit', { x: e.pos.x, z: e.pos.z });
        else audio.play(e.def.body === 'armor' ? 'armorHit' : 'hit', { x: e.pos.x, z: e.pos.z });
      }
      this.game.ui.hitMarker(crit, e.hp <= 0);
      if (crit && e.def.boss) this.fx.hitStop = Math.max(this.fx.hitStop, 0.03);
    }
    if (e.hp <= 0) this.killEnemy(e, info);
  }

  private applyStatus(e: Enemy, el: Element, base: number) {
    const st = this.run.stats;
    const k = st.elemDmg;
    switch (el) {
      case 'fire':
        if (e.burnT <= 0) audio.play('ignite', { x: e.pos.x, z: e.pos.z });
        e.burnT = 3.5;
        e.burnDps = Math.max(e.burnDps * (e.burnT > 0 ? 1 : 0), base * 0.5 * k);
        break;
      case 'shock':
        e.shockT = 2.5;
        e.shockDps = Math.max(e.shockDps, base * 0.35 * k);
        if (Math.random() < 0.15 && !e.def.boss) e.stunT = Math.max(e.stunT, 0.4);
        if (this.run.special('shockChain') > 0 && Math.random() < 0.5) this.chainLightning(e, base * 0.5, 2);
        break;
      case 'acid':
        e.acidT = 5;
        e.acidDps = Math.max(e.acidDps, base * 0.28 * k);
        break;
      case 'cryo':
        if (e.frozenT > 0) break;
        e.chill = Math.min(5, e.chill + 1);
        e.chillT = 3;
        if (e.chill >= 5 && !e.def.boss) {
          e.frozenT = 2.2;
          e.chill = 0;
          audio.play('freeze', { x: e.pos.x, z: e.pos.z });
          this.fx.magicBurst(e.pos.x, e.def.height * 0.5, e.pos.z, [0.6, 0.9, 1], 14, 6);
        } else if (e.def.boss && e.chill >= 5) e.chill = 4;
        break;
    }
  }

  chainLightning(from: Enemy, dmg: number, jumps: number) {
    let cur = from;
    const hit = new Set<number>([from.id]);
    for (let i = 0; i < jumps; i++) {
      let next: Enemy | null = null;
      let nd = 14;
      for (const e of this.enemiesNear(cur.pos.x, cur.pos.z, 14)) {
        if (!e.alive || hit.has(e.id)) continue;
        const d = e.distTo(cur.pos.x, cur.pos.z);
        if (d < nd) {
          nd = d;
          next = e;
        }
      }
      if (!next) break;
      hit.add(next.id);
      this.fx.beams.lightning(cur.pos.x, cur.def.height * 0.5, cur.pos.z, next.pos.x, next.def.height * 0.5, next.pos.z, 0.3, 1, 2, 4, 1.1);
      this.damageEnemy(next, { amount: dmg, element: 'shock', source: 'chain', noCrit: true, quiet: true });
      cur = next;
    }
  }

  killEnemy(e: Enemy, info: DamageInfo, silent = false) {
    if (!e.alive) return;
    const run = this.run;
    const st = run.stats;
    e.alive = false;
    e.hp = 0;
    const burning = e.burnT > 0, frozen = e.frozenT > 0, corroded = e.acidT > 0;
    if (!e.airborne) {
      e.dead = true;
      e.def.onDeath?.(e, this);
    }
    if (e === this.boss) {
      this.onBossKilled(e);
      return;
    }
    if (silent) return;
    const floorK = 1 + run.floor * 0.28;
    const eliteK = e.isMiniboss ? 5 : e.isElite ? 3 : 1;
    const sumK = e.summoned ? 0.25 : 1;
    const xp = e.def.xp * (1 + run.floor * 0.12) * eliteK * sumK;
    const ups = run.addXp(xp);
    if (ups > 0) this.game.onLevelUp(ups);
    const gold = e.def.gold * floorK * eliteK * sumK * rand(0.7, 1.3);
    if (gold >= 1) this.pickups.spawnGold(e.pos.x, e.pos.z, gold, 0.7);
    // loot
    let lootChance = e.isMiniboss ? 1 : e.isElite ? 0.55 : e.def.id === 'mimic' ? 1 : 0.055;
    if (run.special('greed') > 0) lootChance *= 1.35;
    if (run.hasMod('bloodHalls')) lootChance *= 1.35;
    if (run.hasMod('greedRush')) lootChance *= 1.4;
    if (e.summoned) lootChance *= 0.15;
    if (Math.random() < lootChance) {
      const count = e.def.id === 'mimic' ? 3 : e.isMiniboss ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const item = generateItem(run.lootRng, { level: run.depthLevel, luck: st.luck + (e.isElite ? 10 : 0) + (e.def.id === 'mimic' ? 20 : 0), minRarity: e.isMiniboss ? 2 : e.def.id === 'mimic' ? 2 : 0 });
        this.pickups.dropItem(item, e.pos.x, e.pos.z);
      }
    }
    if (Math.random() < (run.hp < st.maxHp * 0.4 ? 0.1 : 0.035) * sumK) this.pickups.spawnSmall('repair', e.pos.x, e.pos.z);
    if (Math.random() < (e.isElite ? 0.15 : 0.012) * sumK) this.pickups.spawnSmall('key', e.pos.x, e.pos.z);
    if (e.isElite && run.hasMod('eliteHunt') && Math.random() < 0.35) this.addRelicAltar(e.pos.x, e.pos.z, 2);
    // specials
    if (run.special('killHeal') > 0) run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.02);
    if (run.special('killBoost') > 0) run.nitro = Math.min(st.boostMax, run.nitro + st.boostMax * 0.18);
    const ghostChance = (info.weapon?.item.special === 'ghostSkulls' ? 1 : 0) + (run.special('passive_undertaker') > 0 ? 0.12 : 0);
    if (Math.random() < ghostChance) {
      const n = info.weapon?.item.special === 'ghostSkulls' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const p = this.projectiles.spawn('ghost', 'player', e.pos.x, 3, e.pos.z, rand(-8, 8), 6, rand(-8, 8), 60 * st.dmg * Math.pow(1.14, run.floor), 4, 0.6);
        p.homing = 4;
      }
    }
    if (burning && run.special('burnExplode') > 0) this.explode(e.pos.x, 1, e.pos.z, 5, e.maxHp * 0.35 + 30, { team: 'player', element: 'fire', noChain: true });
    if (frozen && run.special('cryoShatter') > 0) {
      audio.play('shatter', { x: e.pos.x, z: e.pos.z });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const p = this.projectiles.spawn('shard_p', 'player', e.pos.x, 1.5, e.pos.z, Math.cos(a) * 55, 0, Math.sin(a) * 55, e.maxHp * 0.12 + 20, 0.5, 0.3);
        p.element = 'cryo';
        p.elemChance = 0.6;
        p.pierce = 1;
      }
    }
    if (corroded && run.special('acidSpread') > 0) {
      for (const o of this.enemiesNear(e.pos.x, e.pos.z, 9)) if (o.alive && o !== e) this.applyStatus(o, 'acid', e.maxHp * 0.3);
      this.fx.gooBurst(e.pos.x, 1, e.pos.z, [0.4, 1, 0.2], 20);
    }
    if (info.source === 'ram' && run.special('ramExplode') > 0) this.explode(e.pos.x, 1, e.pos.z, 5.5, e.maxHp * 0.5 + 40, { team: 'player', element: 'none', noChain: true });
    if (e.elite.includes('volatile')) {
      this.fx.tele.circle(e.pos.x, e.pos.z, 8, 0.7, 0xffd23a);
      const x = e.pos.x, z = e.pos.z;
      setTimeout(() => this.explode(x, 1, z, 8, e.damage * 1.5, { team: 'enemy', element: 'fire', big: true }), 700);
    }
    // second wind
    if (this.player.downed) this.secondWind();
    // combo
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.6;
    if (this.combo >= 2) this.game.ui.combo(this.combo);
    if (this.combo >= 3) run.addGold(Math.round(this.combo * (1 + run.floor * 0.3)));
    run.counters.kills++;
    Save.data.kills++;
    if (e.isMiniboss || e.isElite) this.say('eliteKill');
  }

  explode(x: number, y: number, z: number, r: number, dmg: number, o: { team: 'player' | 'enemy' | 'both'; element?: Element; elemChance?: number; weapon?: WeaponRuntime | null; source?: Enemy; noDamageOwner?: boolean; big?: boolean; small?: boolean; critBonus?: number; noChain?: boolean }) {
    const el = o.element ?? 'none';
    this.fx.explosion(x, y, z, Math.max(1.5, r * 0.62), el, o.big || r > 7);
    audio.play(o.big || r > 7 ? 'explosionBig' : o.small || r < 3.5 ? 'explosionSmall' : 'explosion', { x, z });
    if (o.team !== 'enemy') {
      for (const e of this.enemiesNear(x, z, r + 4)) {
        if (!e.alive || (o.noDamageOwner && e === o.source)) continue;
        const d = e.distTo(x, z);
        if (d > r + e.radius) continue;
        const k = 1 - 0.5 * clamp(d / r, 0, 1);
        const dx = (e.pos.x - x) / (d || 1), dz = (e.pos.z - z) / (d || 1);
        this.damageEnemy(e, { amount: dmg * k, element: el, elemChance: o.elemChance ?? (el !== 'none' ? 0.5 : 0), source: 'explosion', weapon: o.weapon, kx: dx, kz: dz, knock: 10 + r * 2, critBonus: o.critBonus, quiet: true });
        if (r >= 4 && e.alive && e.mass < 1.5 && !e.def.boss) e.launch(dx * r * 2.5, dz * r * 2.5, 8 + r);
      }
    }
    if (o.team !== 'player') {
      const p = this.player;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < r + 1.5 && p.alive) {
        const k = 1 - 0.5 * clamp(d / r, 0, 1);
        this.damagePlayer(dmg * k, { element: el, x, z, knock: 14 + r * 2, enemy: o.source ?? null });
      }
      if (o.team === 'both') {
        // enemy-made explosions also hurt other enemies (goblin bombs!)
      }
    }
    this.props.damageInRadius(x, z, r, dmg);
  }

  damageEnemiesInRadius(x: number, z: number, r: number, dmg: number, src: Enemy) {
    for (const e of this.enemiesNear(x, z, r)) {
      if (!e.alive || e === src || e.def.boss) continue;
      if (e.distTo(x, z) < r) this.damageEnemy(e, { amount: dmg, element: 'none', source: 'explosion', noCrit: true, quiet: true });
    }
  }

  damagePlayer(amount: number, o: PlayerHitOpts = {}) {
    const p = this.player;
    const run = this.run;
    const st = run.stats;
    if (!p.alive || amount <= 0) return;
    if (p.invulnT > 0 && !o.collision) return;
    if (p.bubbleT > 0) {
      this.fx.sparks(p.pos.x, 1.5, p.pos.z, 0, 1, 0, 6, [1, 0.85, 0.4], 12);
      return;
    }
    let armor = st.armor;
    const ma = run.special('movingArmor');
    if (ma > 0 && p.speed > 12) armor *= 1 + 0.3 * ma;
    const red = clamp(armor / (armor + 120), 0, 0.75);
    let dmg = amount * (1 - red);
    run.counters.damageTaken += dmg;
    p.shieldDelayT = 0;
    let shieldHit = false;
    if (run.shield > 0) {
      const a = Math.min(run.shield, dmg);
      run.shield -= a;
      dmg -= a;
      shieldHit = true;
      p.flashShield();
      if (run.shield <= 0) this.shieldBreak();
      else if (!o.silent) audio.play('shieldHit');
    }
    if (dmg > 0) {
      if (!p.downed) run.hp -= dmg;
      else p.downedT -= dmg / Math.max(1, st.maxHp) * 4;
      if (!o.silent) audio.play('playerHit');
    }
    const frac = amount / st.maxHp;
    this.game.ui.playerHit(clamp(frac * 4, 0.15, 1), shieldHit && dmg <= 0, o.x !== undefined ? Math.atan2(o.x - p.pos.x, o.z! - p.pos.z) - this.cam.yaw : null);
    this.fx.shake(clamp(frac * 3, 0.05, 0.6));
    if (o.knock && o.x !== undefined && run.special('passive_unstoppable') <= 0) {
      const dx = p.pos.x - o.x, dz = p.pos.z - o.z!;
      const d = Math.hypot(dx, dz) || 1;
      p.vel.x += (dx / d) * o.knock / Math.max(0.6, st.mass);
      p.vel.z += (dz / d) * o.knock / Math.max(0.6, st.mass);
    }
    if (o.melee && o.enemy && o.enemy.alive && run.special('thorns') > 0) {
      this.damageEnemy(o.enemy, { amount: amount * 3 * st.dmg, element: 'none', source: 'thorns', noCrit: true });
    }
    if (o.enemy?.elite.includes('vampiric') && o.enemy.alive) o.enemy.hp = Math.min(o.enemy.maxHp, o.enemy.hp + amount * 2);
    if (run.hp <= 0 && !p.downed) this.enterDowned();
  }

  private shieldBreak() {
    const run = this.run;
    const p = this.player;
    audio.play('shieldBreak');
    this.game.ui.flash('#4aa8ff', 0.25);
    const eq = run.equipped.shield;
    const nova = run.special('shieldNova') > 0 ? 'shock' : eq?.special === 'elemNova' ? eq.element : null;
    if (nova) {
      const el = nova as Element;
      this.fx.rings.spawn(p.pos.x, 1, p.pos.z, 1, 12, 0.4, new THREE.Color(...ELEMENT_COLORS[el]));
      this.explode(p.pos.x, 1, p.pos.z, 11, 70 * run.stats.dmg * Math.pow(1.14, run.floor), { team: 'player', element: el, elemChance: 1 });
    }
  }

  private enterDowned() {
    const p = this.player;
    const run = this.run;
    p.downed = true;
    run.hp = 1;
    p.downedMax = Math.max(4, 10 - p.downedCount * 2) + Save.upgrade('secondWind') * 1.5;
    if (run.special('lastStand') > 0) p.downedMax *= 1.6;
    p.downedT = p.downedMax;
    p.downedCount++;
    audio.play('downed');
    this.game.ui.setDowned(true);
    this.say('downed');
    this.game.slowmo(0.6, 0.3);
  }

  secondWind() {
    const p = this.player;
    const run = this.run;
    p.downed = false;
    run.hp = run.stats.maxHp * 0.4;
    p.invulnT = 2;
    audio.play('secondWind');
    this.game.ui.setDowned(false);
    this.toast('SECOND WIND!', 'Back in gear', '#ffd23a');
    this.game.slowmo(0.4, 0.35);
    this.fx.rings.spawn(p.pos.x, 1, p.pos.z, 1, 14, 0.5, 0xffd23a);
    this.secondWindT = 1;
  }

  playerWrecked() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.downed = false;
    this.game.ui.setDowned(false);
    this.explode(p.pos.x, 1, p.pos.z, 7, 0, { team: 'player', element: 'fire', big: true });
    this.fx.chunkBurst(p.pos.x, 1, p.pos.z, new THREE.Color(this.run.chassis.colors.primary).getHex(), 20, 0.8, 16);
    this.fx.chunkBurst(p.pos.x, 1, p.pos.z, 0x19191c, 8, 0.9, 12);
    audio.play('wrecked');
    for (const w of p.weapons) w?.stopLoops();
    this.game.slowmo(1.2, 0.25);
    setTimeout(() => this.game.gameOver(), 2200);
  }

  // ================================================================= hazards & helpers
  shockwave(x: number, z: number, max: number, speed: number, dmg: number, _owner: Enemy, color: number, delay = 0) {
    this.shockwaves.push({ x, z, r: 0, max, speed, dmg, hit: false, delay, color });
    if (delay <= 0) this.fx.rings.spawn(x, 0.4, z, 0.5, max, max / speed, color);
  }

  addFirePatch(x: number, z: number, r: number, dur: number, dps: number, team: 'player' | 'enemy', kind: 'fire' | 'shadow' = 'fire') {
    if (this.firePatches.length > 160) this.firePatches.shift();
    this.firePatches.push({ x, z, r, t: dur, max: dur, dps, team, kind, tick: 0 });
    if (kind === 'fire') this.fx.decals.splat(x, z, r * 0.9, 0x1a0500, 0.6, dur + 4, 1);
  }

  spawnCoinsAt(x: number, z: number, count: number, spread: number, raw = false) {
    const amount = raw ? count * (2 + this.run.floor) : count * (3 + this.run.floor * 1.2);
    this.pickups.spawnGold(x, z, amount, spread * 0.3 + 0.5);
  }

  spawnTurret(x: number, z: number, dur: number, dmg: number) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.8, 8), toon(0x3a3a42));
    base.position.y = 0.4;
    const head = new THREE.Group();
    head.position.y = 1.3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.1), toon(0xc8a020));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), toon(0x222222));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.9;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), glow(0x40ff80, 3));
    eye.position.set(0, 0.2, 0.56);
    head.add(box, barrel, eye);
    g.add(base, head);
    g.position.set(x, 0, z);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.group.add(g);
    this.turrets.push({ x, z, t: dur, dmg, cd: 0, mesh: g, head });
    this.fx.dust(x, z, 6);
  }

  spawnGravityWell(x: number, z: number, dur: number, dmg: number) {
    this.wells.push({ x, z, t: dur, max: dur, dmg });
    audio.play('portal', { x, z });
  }

  lightFlash(x: number, y: number, z: number, color: number, intensity: number, range: number) {
    this.game.lights.flash(x, y, z, color, intensity, range, 0.06, 2);
  }

  hitProps(p: Proj, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.props.hitBySegment(p, x0, y0, z0, x1, y1, z1);
  }

  hitPropsRay(o: THREE.Vector3, d: THREE.Vector3, t: number, dmg: number) {
    this.props.hitByRay(o.x, o.y, o.z, d.x, d.y, d.z, t, dmg);
  }

  floatText(x: number, y: number, z: number, text: string, color: string) {
    this.game.ui.floatText(x, y, z, text, color);
  }

  toast(title: string, sub = '', color = '#e8242f') {
    this.game.ui.toast(title, sub, color);
  }

  say(key: string) {
    this.game.ui.bark(key);
  }

  onDriftBoost(tier: number) {
    if (tier >= 3) this.say('driftMax');
    const run = this.run;
    if (run.special('driftReload') > 0) {
      for (const wr of this.player.weapons) {
        if (!wr) continue;
        wr.mag = Math.min(wr.magMax, wr.mag + Math.ceil(wr.magMax * 0.15 * tier * run.special('driftReload')));
        if (wr.reloadT > 0) wr.reloadT *= 0.5;
      }
    }
    this.game.ui.driftBoost(tier);
  }

  onGoldPickup(v: number) {
    const run = this.run;
    if (run.equipped.shield?.special === 'coinShield' || run.special('coinShield') > 0) run.shield = Math.min(run.stats.maxShield, run.shield + v * 2);
  }

  onLegendaryDrop(item: Item) {
    this.run.counters.legendaries++;
    Save.data.legendaries++;
    this.say('legendary');
    this.game.ui.legendaryDrop(item);
    this.game.slowmo(0.35, 0.4);
  }

  onKeystone() {
    this.toast('KEYSTONE ACQUIRED', 'The exit portal is unsealed', '#40b0ff');
    this.say('keystone');
    this.game.ui.flash('#40b0ff', 0.3);
  }

  openChest(c: Chest) {
    const run = this.run;
    const n = c.tier === 2 ? 2 : c.tier === 1 ? (Math.random() < 0.5 ? 2 : 1) : 1;
    const minR = (c.tier === 2 ? 3 : c.tier === 1 ? 1 : 0) as Rarity;
    for (let i = 0; i < n; i++) {
      const item = generateItem(run.lootRng, { level: run.depthLevel, luck: run.stats.luck + c.tier * 10, minRarity: minR, legendaryChanceMult: c.tier === 2 ? 3 : 1 });
      this.pickups.dropItem(item, c.x, c.z);
    }
    this.pickups.spawnGold(c.x, c.z, (20 + c.tier * 40) * (1 + run.floor * 0.3), 1);
    if (Math.random() < 0.25) this.pickups.spawnSmall(c.tier === 0 ? 'repair' : 'key', c.x, c.z);
    this.fx.magicBurst(c.x, 1.5, c.z, c.tier === 2 ? [1, 0.8, 0.3] : [1, 0.9, 0.6], 30, 10);
    this.say('chest');
  }

  enterPortal(p: Portal) {
    if (p.final) {
      if (this.run.floor >= 8) this.game.victory();
      else this.game.nextFloor([]);
      return;
    }
    this.game.nextFloor(p.mod ? [p.mod] : []);
  }

  bossDeathFx(e: Enemy, col: [number, number, number]) {
    const x = e.pos.x, z = e.pos.z;
    audio.play('bossDie');
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        this.fx.explosion(x + rand(-5, 5), rand(2, 10), z + rand(-5, 5), rand(4, 7), 'none', true);
        this.fx.magicBurst(x, 6, z, col, 30, 18);
      }, i * 180);
    }
    this.fx.chunkBurst(x, 6, z, 0xe8dfc6, 30, 1.2, 18);
    this.fx.shake(2);
  }

  private onBossKilled(e: Enemy) {
    const run = this.run;
    this.bossDefeated = true;
    run.counters.bossesKilled++;
    Save.data.bossKills++;
    this.game.ui.bossBar(null);
    this.game.slowmo(1.5, 0.2);
    this.toast('BOSS DEFEATED', `${this.bossDef?.title ?? ''} has fallen`, '#ffd23a');
    this.say('bossDown');
    // kill adds
    for (const o of this.enemies) if (o.alive && o !== e) this.killEnemy(o, { amount: 0, element: 'none', source: 'status' }, true);
    const x = e.pos.x, z = e.pos.z;
    const ups = run.addXp(e.def.xp * (1 + run.floor * 0.12));
    if (ups > 0) this.game.onLevelUp(ups);
    setTimeout(() => {
      // loot shower
      this.pickups.spawnGold(x, z, e.def.gold * (1 + run.floor * 0.3), 2.5);
      const leg = generateItem(run.lootRng, { level: run.depthLevel + 1, rarity: 4 });
      this.pickups.dropItem(leg, x, z);
      for (let i = 0; i < 3; i++) this.pickups.dropItem(generateItem(run.lootRng, { level: run.depthLevel + 1, luck: run.stats.luck + 25, minRarity: 2 }), x, z);
      this.pickups.spawnSmall('key', x, z);
      this.pickups.spawnSmall('repair', x, z);
      const room = this.d.rooms[e.room];
      this.addRelicAltar(room.wx - 10, room.wz, 3);
      const final = run.floor >= 8;
      const portal = this.props.addPortal(room.wx + 12, room.wz, -Math.PI / 2, null, final ? 'ESCAPE' : 'DESCEND', final ? 'Drive out rich' : `Act ${run.act + 1}: ${['', 'The Gilded Crypt', 'The Crystal Vaults', 'The Ashen Crypt'][run.act + 1] ?? ''}`, true);
      this.exitPortals.push(portal);
      audio.play('victory');
      const rs = this.rooms[e.room];
      rs.cleared = true;
      rs.active = false;
      for (const g of rs.gates) this.level.setGate(g, true);
      this.game.music('explore');
    }, 1600);
  }

  // ================================================================= rooms
  private checkRooms(dt: number) {
    const p = this.player;
    const rid = this.grid.roomAt(p.pos.x, p.pos.z);
    if (rid !== this.currentRoom) {
      this.currentRoom = rid;
      if (rid >= 0) {
        const rs = this.rooms[rid];
        if (!rs.visited) {
          rs.visited = true;
          this.onEnterRoom(rs);
        }
      }
    }
    if (rid >= 0) {
      const rs = this.rooms[rid];
      if (!rs.cleared && !rs.active && rs.room.type !== 'boss') {
        // lock only once fully inside
        const r = rs.room;
        const m = 2.5;
        if (p.pos.x > r.x0 * TILE + m && p.pos.x < r.x1 * TILE - m && p.pos.z > r.y0 * TILE + m && p.pos.z < r.y1 * TILE - m) this.activateRoom(rs);
      }
      if (rs.room.type === 'boss' && !rs.active && !this.bossDefeated) {
        const r = rs.room;
        const m = 8;
        if (p.pos.x > r.x0 * TILE + m) this.startBoss(rs);
      }
    }
    for (const rs of this.rooms) {
      if (!rs.active) continue;
      // spawn queue
      for (let i = rs.queue.length - 1; i >= 0; i--) {
        const q = rs.queue[i];
        q.t -= dt;
        if (q.t <= 0) {
          this.spawnEnemy(q.def, q.x, q.z, rs.room.id, { elite: q.elite, mini: q.mini });
          rs.queue.splice(i, 1);
        }
      }
      if (rs.room.type === 'boss') continue;
      let alive = 0;
      for (const e of rs.enemies) if (e.alive && !e.summoned) alive++;
      if (rs.queue.length === 0) {
        if (rs.waveIdx < rs.waves.length && alive <= Math.max(1, Math.floor(rs.waves[rs.waveIdx - 1]?.length * 0.25 || 0))) {
          this.queueWave(rs);
        } else if (rs.waveIdx >= rs.waves.length && alive === 0) {
          this.clearRoom(rs);
        }
      }
    }
  }

  private onEnterRoom(rs: RoomState) {
    this.exploredRooms.add(rs.room.id);
    switch (rs.room.type) {
      case 'shop':
      case 'pitstop':
        this.say('shop');
        this.game.music('shop');
        break;
      case 'treasure':
        this.say('treasure');
        break;
      case 'vault':
        this.say('vault');
        break;
      case 'shrine':
        this.say('shrine');
        break;
      case 'exit':
        this.say(this.run.keystones > 0 ? 'exit' : 'exitLocked');
        break;
      case 'elite':
        this.say('elite');
        break;
    }
    if ((rs.room.type === 'combat' || rs.room.type === 'start' || rs.room.type === 'treasure') && !this.anyActive()) this.game.music('explore');
  }

  private anyActive() {
    return this.rooms.some((r) => r.active);
  }

  private activateRoom(rs: RoomState) {
    rs.active = true;
    for (const g of rs.gates) this.level.setGate(g, false);
    if (rs.gates.length) audio.play('gate', { x: this.player.pos.x, z: this.player.pos.z });
    rs.waveIdx = 0;
    this.queueWave(rs);
    this.game.music('combat');
    this.say(rs.room.type === 'elite' ? 'eliteStart' : 'fight');
    this.game.ui.roomLocked(rs.room.type === 'elite');
  }

  private queueWave(rs: RoomState) {
    const wave = rs.waves[rs.waveIdx++];
    if (!wave) return;
    const r = rs.room;
    const p = this.player;
    let i = 0;
    for (const s of wave) {
      let x = r.wx, z = r.wz;
      for (let tries = 0; tries < 30; tries++) {
        const tx = this.rng.int(r.x0 + 1, r.x1 - 2), ty = this.rng.int(r.y0 + 1, r.y1 - 2);
        if (this.d.tiles[ty * this.d.w + tx] !== Tile.Floor) continue;
        x = (tx + 0.5) * TILE;
        z = (ty + 0.5) * TILE;
        if (Math.hypot(x - p.pos.x, z - p.pos.z) < 16) continue;
        if (this.grid.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2)) continue;
        break;
      }
      const t = 0.9 + i * 0.12;
      this.fx.tele.circle(x, z, 2.2, t, s.elite ? 0xff40ff : 0xb040ff);
      rs.queue.push({ def: s.def, x, z, t, elite: s.elite, mini: s.mini });
      i++;
    }
    if (rs.waveIdx > 1) this.game.ui.wave(rs.waveIdx, rs.waves.length);
  }

  private clearRoom(rs: RoomState) {
    rs.active = false;
    rs.cleared = true;
    const run = this.run;
    for (const g of rs.gates) this.level.setGate(g, true);
    audio.play('gate', { x: this.player.pos.x, z: this.player.pos.z });
    for (const e of rs.enemies) if (e.alive) this.killEnemy(e, { amount: 0, element: 'none', source: 'status' }, true);
    this.roomsCleared++;
    run.counters.roomsCleared++;
    const x = rs.room.wx, z = rs.room.wz;
    this.pickups.spawnGold(x, z, (18 + run.floor * 9) * (rs.room.type === 'elite' ? 3 : 1), 1.5);
    const ups = run.addXp(25 * (1 + run.floor * 0.15));
    if (ups > 0) this.game.onLevelUp(ups);
    if (rs.room.type === 'elite') {
      this.pickups.spawnSmall('keystone', x, z);
      this.pickups.dropItem(generateItem(run.lootRng, { level: run.depthLevel, luck: run.stats.luck + 15, minRarity: 3 }), x, z);
      this.props.addChest(x + 6, z, 1);
      this.toast('ELITE ROOM CLEARED', 'A Keystone materialises...', '#ff40ff');
    } else {
      if (Math.random() < 0.3) this.pickups.dropItem(generateItem(run.lootRng, { level: run.depthLevel, luck: run.stats.luck + 5, minRarity: 1 }), x, z);
      this.toast('ROOM CLEARED', `+${Math.round(18 + run.floor * 9)} gold`, '#e8242f');
    }
    this.say('clear');
    if (!this.anyActive()) this.game.music('explore');
  }

  private startBoss(rs: RoomState) {
    rs.active = true;
    for (const g of rs.gates) this.level.setGate(g, false);
    audio.play('gate');
    const r = rs.room;
    const def = this.bossDef ?? BOSS_BY_ACT[this.run.act];
    const bx = r.wx + (r.x1 - r.x0) * TILE * 0.22, bz = r.wz;
    const e = this.spawnEnemy(def.id, bx, bz, r.id, { instant: false });
    if (!e) return;
    e.spawnT = 2.2;
    e.heading = -Math.PI / 2;
    this.boss = e;
    this.game.music('boss');
    this.game.ui.bossIntro(def.title, def.subtitle);
    this.game.ui.bossBar(e);
    audio.play('roar', { pitch: 0.8 });
    this.fx.shake(1);
    this.say('boss');
    this.cam.cinematic = { x: bx - 26, y: 9, z: bz + 14, tx: bx, ty: 8, tz: bz, t: 2.2 };
  }

  // ================================================================= aim
  private computeAim() {
    const cam = this.game.renderer.camera;
    const o = cam.position;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const startT = o.distanceTo(this.cam.focus) + 1;
    let bestT = 160;
    let best: Enemy | null = null;
    // walls
    const horiz = Math.hypot(dir.x, dir.z);
    if (horiz > 0.01) {
      const wd = this.grid.raycast(o.x, o.z, dir.x, dir.z, bestT * horiz) / horiz;
      bestT = Math.min(bestT, wd);
    }
    if (dir.y < -0.001) bestT = Math.min(bestT, o.y / -dir.y);
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
      for (const s of e.def.spheres) {
        const f = (s.fwd ?? 0) * e.scale;
        const t = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, e.pos.x + fx * f, e.y + s.y * e.scale, e.pos.z + fz * f, s.r * e.scale);
        if (t > startT && t < bestT) {
          bestT = t;
          best = e;
        }
      }
    }
    // aim assist: nearest enemy to the crosshair within a small cone
    if (!best && Save.settings.aimAssist) {
      let bestCos = 0.985;
      for (const e of this.enemies) {
        if (!e.alive || e.spawnT > 0) continue;
        const cx = e.pos.x - o.x, cy = e.y + e.def.height * 0.5 * e.scale - o.y, cz = e.pos.z - o.z;
        const d = Math.hypot(cx, cy, cz);
        if (d < startT || d > 90) continue;
        const cos = (cx * dir.x + cy * dir.y + cz * dir.z) / d;
        if (cos > bestCos && this.grid.los(this.player.pos.x, this.player.pos.z, e.pos.x, e.pos.z)) {
          bestCos = cos;
          best = e;
          bestT = d;
        }
      }
      if (best) {
        this.aimPoint.set(best.pos.x, best.y + best.def.height * 0.55 * best.scale, best.pos.z);
        this.aimEnemy = best;
        return;
      }
    }
    this.aimPoint.copy(o).addScaledVector(dir, bestT);
    this.aimEnemy = best;
  }

  // ================================================================= main update
  update(dt: number, drive: DriveInput, firing: [boolean, boolean]) {
    this.time += dt;
    const p = this.player;
    const run = this.run;
    run.counters.time += dt;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    this.rebuildHash();

    // player (substepped for stable collisions at speed)
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps; i++) {
      p.update(dt / steps, drive);
      this.collideCarEnemies(dt / steps);
      this.collideCarProps();
    }
    // lava
    if (!p.airborne && this.grid.isLava(p.pos.x, p.pos.z) && p.alive) {
      this.lavaT -= dt;
      if (this.lavaT <= 0) {
        this.lavaT = 0.3;
        this.damagePlayer(run.stats.maxHp * 0.035 * (run.hasMod('spikyRoads') ? 1.6 : 1), { element: 'fire', silent: true, hazard: true });
        this.fx.fire.emit(p.pos.x, 0.5, p.pos.z, 0, 4, 0, 0.5, 1, [4, 1.5, 0.3], [1, 0.1, 0], 2, 3);
      }
      audio.loop('lava', 0.3);
    } else audio.loop('lava', 0);

    // flow field toward player
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.2;
      this.grid.computeFlow(p.pos.x, p.pos.z);
    }

    // aim & weapons
    this.computeAim();
    const ctx = { w: this, car: p, aim: this.aimPoint, aimEnemy: this.aimEnemy };
    const canFire = p.alive && !this.game.ui.modalOpen;
    p.weapons[0]?.update(dt, canFire && firing[0], ctx);
    p.weapons[1]?.update(dt, canFire && firing[1], ctx);

    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive) {
        if (e.spawnT > 0) {
          e.spawnT -= dt;
          if (Math.random() < 0.4) this.fx.dust(e.pos.x, e.pos.z, 1, [0.4, 0.3, 0.45], 0.8);
        } else {
          e.statusTick(this, dt);
          if (!e.alive) continue;
          if (!e.disabled && p.alive) e.def.ai(e, this, dt);
          else if (e.disabled) e.vel.multiplyScalar(Math.exp(-6 * dt));
          if (!p.alive) e.move(this, 0, 0, 0, dt);
          this.eliteAura(e, dt);
        }
        e.ramCd -= dt;
        e.integrate(this, dt);
        e.def.anim(e, dt, this);
        e.syncVisual(dt);
      } else {
        // dead: flying corpses finish their arc
        if (!e.dead) {
          e.integrate(this, dt);
          e.syncVisual(dt);
          if (e.dead) e.def.onDeath?.(e, this);
          else continue;
        }
        this.group.remove(e.visual.root);
        this.enemies.splice(i, 1);
        this.rooms[e.room]?.enemies.delete(e);
      }
    }

    this.projectiles.update(dt);
    this.pickups.update(dt, this.time);
    this.props.update(dt);
    this.updateHazards(dt);
    this.checkRooms(dt);
    this.updateInteraction();
    this.level.update(dt, this.fx, this.game.renderer.camera.position);
    for (const a of this.altars) {
      const sp = a.userData.spin as THREE.Object3D[] | undefined;
      if (sp) {
        sp[0].rotation.y += dt * 1.5;
        sp[0].position.y = (sp[0].userData.by ??= sp[0].position.y) + Math.sin(this.time * 2) * 0.3;
        sp[1].rotation.x = Math.PI / 2 + Math.sin(this.time) * 0.3;
        sp[1].rotation.z += dt;
      }
    }
    if (this.secondWindT > 0) this.secondWindT -= dt;
    // headlights & shadows follow
    this.game.updateHeadlights(p);
  }

  private eliteAura(e: Enemy, dt: number) {
    if (!e.isElite) return;
    e.auraT -= dt;
    if (e.elite.includes('blazing') && e.auraT <= 0) {
      e.auraT = 0.6;
      this.addFirePatch(e.pos.x, e.pos.z, 2.6, 3, e.damage * 0.25, 'enemy');
    }
    if (e.elite.includes('vampiric') && Math.random() < dt * 2) {
      for (const o of this.enemiesNear(e.pos.x, e.pos.z, 12)) if (o.alive && o !== e) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.02);
      this.fx.magicBurst(e.pos.x, 2, e.pos.z, [1, 0.1, 0.3], 4, 4);
    }
    if (Math.random() < dt * 6) {
      const c = new THREE.Color(({ armored: 0xc0c8d8, blazing: 0xff5a1a, hasted: 0x40e0ff, vampiric: 0xff2050, shielded: 0x4a8aff, volatile: 0xffd23a } as Record<string, number>)[e.elite[0]]);
      this.fx.add.emit(e.pos.x + rand(-1, 1) * e.radius, rand(0, e.def.height * e.scale), e.pos.z + rand(-1, 1) * e.radius, 0, rand(1, 3), 0, 0.7, 0.35, 0.05, c.r * 3, c.g * 3, c.b * 3, 1, { shape: SHAPE_CORE });
    }
  }

  private collideCarEnemies(dt: number) {
    const p = this.player;
    if (!p.alive) return;
    const run = this.run;
    const st = run.stats;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const L = p.model.length * 0.3;
    const cr = p.model.halfWidth + 0.2;
    for (const e of this.enemiesNear(p.pos.x, p.pos.z, 8)) {
      if (!e.alive || e.spawnT > 0 || e.airborne) continue;
      if (p.pos.y > e.def.height * e.scale * 0.8) continue;
      for (const side of [1, -1]) {
        const cx = p.pos.x + fx * L * side, cz = p.pos.z + fz * L * side;
        const dx = e.pos.x - cx, dz = e.pos.z - cz;
        const d = Math.hypot(dx, dz);
        const min = cr + e.radius * e.scale;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        const rel = (p.vel.x - e.vel.x) * nx + (p.vel.z - e.vel.z) * nz;
        const heavy = e.def.noRam || e.mass > st.mass * 2.5 || e.def.boss || e.def.stationary;
        if (!heavy) {
          // push enemy out of the way
          e.pos.x += nx * (min - d);
          e.pos.z += nz * (min - d);
        } else {
          p.pos.x -= nx * (min - d);
          p.pos.z -= nz * (min - d);
          const vn = p.vel.x * nx + p.vel.z * nz;
          if (vn > 0) {
            p.vel.x -= nx * vn * 1.3;
            p.vel.z -= nz * vn * 1.3;
          }
        }
        if (rel > 7 && e.ramCd <= 0) {
          e.ramCd = 0.4;
          const unstop = run.special('passive_unstoppable') > 0 ? 2 : 1;
          const base = 26 * Math.pow(1.14, run.floor) * st.ramDamage * unstop * st.dmg;
          const dmg = base * Math.pow(rel / 18, 1.25) * (side > 0 ? 1 : 0.6);
          audio.play('ram', { x: e.pos.x, z: e.pos.z });
          this.fx.sparks(cx + nx * cr, 1, cz + nz * cr, nx, 0.5, nz, 12, [1, 0.8, 0.5], 16);
          this.fx.shake(heavy ? 0.4 : 0.18);
          run.counters.rams++;
          if (run.equipped.plow?.special === 'ramHoly') {
            this.explode(e.pos.x, 1, e.pos.z, 4.5, dmg * 0.6, { team: 'player', element: 'none', small: true, noChain: true });
            this.fx.magicBurst(e.pos.x, 2, e.pos.z, [1, 0.9, 0.5], 16, 10);
          }
          if (!heavy) {
            // launch first so a lethal ram turns into a flying corpse that bursts on landing
            const titan = run.special('titanWheels') > 0;
            e.launch(p.vel.x * 0.9 + nx * 6, p.vel.z * 0.9 + nz * 6, 10 + rel * 0.35);
            const loss = titan ? 0 : clamp(e.mass / st.mass, 0.05, 0.5) * 0.25;
            p.vel.multiplyScalar(1 - loss);
          }
          this.damageEnemy(e, { amount: dmg, element: 'none', source: 'ram', kx: nx, kz: nz, knock: heavy ? 0 : rel * 0.8, hx: e.pos.x, hy: 1.5, hz: e.pos.z });
          if (heavy) {
            // bounce off heavies, take a little damage
            this.damagePlayer(e.damage * 0.3 * (1 - clamp(st.ramResist, 0, 0.9)), { collision: true, silent: true });
          }
          this.game.ui.ramHit(dmg);
        }
      }
    }
    void dt;
  }

  private collideCarProps() {
    const p = this.player;
    if (!p.alive || p.pos.y > 2) return;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const L = p.model.length * 0.3;
    for (const d of this.props.destructibles) {
      if (!d.alive) continue;
      for (const side of [1, -1]) {
        const cx = p.pos.x + fx * L * side, cz = p.pos.z + fz * L * side;
        const dd = Math.hypot(d.x - cx, d.z - cz);
        if (dd < d.r + p.model.halfWidth) {
          if (p.speed > 6) {
            this.props.damageDestructible(d, 9999, p.vel.x * 0.05, p.vel.z * 0.05);
            p.vel.multiplyScalar(0.94);
            this.fx.shake(0.1);
          } else {
            const nx = (cx - d.x) / (dd || 1), nz = (cz - d.z) / (dd || 1);
            p.pos.x += nx * (d.r + p.model.halfWidth - dd);
            p.pos.z += nz * (d.r + p.model.halfWidth - dd);
          }
          break;
        }
      }
    }
  }

  private updateHazards(dt: number) {
    const p = this.player;
    const run = this.run;
    // fire patches
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const f = this.firePatches[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.firePatches.splice(i, 1);
        continue;
      }
      const k = f.t / f.max;
      if (Math.random() < dt * 10 * f.r * this.fx.quality) {
        const a = rand(0, Math.PI * 2), rr = rand(0, f.r);
        if (f.kind === 'fire') this.fx.fire.emit(f.x + Math.cos(a) * rr, 0.3, f.z + Math.sin(a) * rr, 0, rand(2, 4), 0, 0.5, rand(0.4, 0.9) * (0.4 + k), [4, 1.4, 0.3], [0.8, 0.1, 0], 2, 3);
        else this.fx.add.emit(f.x + Math.cos(a) * rr, 0.3, f.z + Math.sin(a) * rr, 0, rand(1, 3), 0, 0.7, 0.5, 0.1, 1.2, 0.2, 2.4, 1, { shape: SHAPE_DOT });
      }
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick = 0.25;
      if (f.team === 'enemy') {
        if (p.alive && !p.airborne && Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < f.r + 1) this.damagePlayer(f.dps * 0.25, { element: 'fire', silent: true, hazard: true });
      } else {
        for (const e of this.enemiesNear(f.x, f.z, f.r + 2)) {
          if (!e.alive || e.def.flying) continue;
          if (e.distTo(f.x, f.z) < f.r + e.radius) this.damageEnemy(e, { amount: f.dps * 0.25, element: f.kind === 'fire' ? 'fire' : 'none', elemChance: 0.3, source: 'fire', noCrit: true, quiet: true, silent: true });
        }
      }
    }
    // shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      if (s.delay > 0) {
        s.delay -= dt;
        if (s.delay <= 0) this.fx.rings.spawn(s.x, 0.4, s.z, 0.5, s.max, s.max / s.speed, s.color);
        continue;
      }
      s.r += s.speed * dt;
      const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
      if (!s.hit && Math.abs(d - s.r) < 1.8 && p.pos.y < 1.2 && p.alive) {
        s.hit = true;
        this.damagePlayer(s.dmg, { x: s.x, z: s.z, knock: 20 });
      }
      if (s.r > s.max) this.shockwaves.splice(i, 1);
    }
    // turrets
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.t -= dt;
      t.cd -= dt;
      if (t.t <= 0) {
        this.group.remove(t.mesh);
        this.fx.explosion(t.x, 1, t.z, 2, 'none');
        this.turrets.splice(i, 1);
        continue;
      }
      const target = this.nearestEnemy(t.x, t.z, 45);
      if (target && this.grid.los(t.x, t.z, target.pos.x, target.pos.z)) {
        const a = Math.atan2(target.pos.x - t.x, target.pos.z - t.z);
        t.head.rotation.y = a;
        if (t.cd <= 0) {
          t.cd = 0.13;
          const dx = target.pos.x - t.x, dz = target.pos.z - t.z, dy = target.def.height * 0.5 - 1.3;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const pr = this.projectiles.spawn('bullet', 'player', t.x + (dx / dl) * 1.4, 1.3, t.z + (dz / dl) * 1.4, (dx / dl) * 200, (dy / dl) * 200, (dz / dl) * 200, t.dmg, 0.6, 0.2);
          pr.critBonus = 0.05;
          this.fx.muzzle(t.x + (dx / dl) * 1.5, 1.3, t.z + (dz / dl) * 1.5, dx / dl, 0, dz / dl, 0.7);
          audio.play('mg', { x: t.x, z: t.z, pitch: 1.4, vol: 0.5 });
        }
      }
    }
    // gravity wells
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const g = this.wells[i];
      g.t -= dt;
      for (let k = 0; k < 3; k++) {
        const a = rand(0, Math.PI * 2), r = rand(4, 16);
        this.fx.add.emit(g.x + Math.cos(a) * r, rand(0.5, 3), g.z + Math.sin(a) * r, -Math.cos(a) * r * 2, 0, -Math.sin(a) * r * 2, 0.4, 0.3, 0.05, 1.4, 0.4, 3, 1, { stretch: 0.03, shape: SHAPE_CORE });
      }
      this.fx.add.draw(g.x, 2, g.z, 0, 0, 0, 5 + Math.sin(this.time * 10), 0, 0.6, 0.1, 1.4, 0.8, SHAPE_DOT);
      for (const e of this.enemiesNear(g.x, g.z, 18)) {
        if (!e.alive || e.def.boss || e.def.stationary) continue;
        const dx = g.x - e.pos.x, dz = g.z - e.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < 18 && d > 1) {
          e.pullX = (dx / d) * 22;
          e.pullZ = (dz / d) * 22;
        }
      }
      if (g.t <= 0) {
        this.explode(g.x, 1.5, g.z, 9, g.dmg, { team: 'player', element: 'shock', elemChance: 0.5 });
        this.wells.splice(i, 1);
      }
    }
    void run;
  }

  private updateInteraction() {
    const p = this.player;
    this.lootTarget = p.alive ? this.pickups.nearestItem(p.pos.x, p.pos.z, 6) : null;
    this.interactTarget = !this.lootTarget && p.alive ? this.props.nearestInteractable(p.pos.x, p.pos.z) : null;
  }

  // ================================================================= loot actions
  equipGround(gi: GroundItem) {
    const run = this.run;
    const old = run.equip(gi.item);
    this.pickups.removeItem(gi);
    if (old) this.pickups.dropItem(old, gi.x, gi.z, false).age = -1.2;
    this.player.refreshLoadout();
    audio.play('pickup');
    this.game.ui.equipped(gi.item);
    this.trackBest(gi.item);
  }

  stashGround(gi: GroundItem) {
    if (!this.run.stash(gi.item)) {
      audio.play('uiError');
      this.toast('BACKPACK FULL', 'Salvage something first', '#ff6a3a');
      return;
    }
    this.pickups.removeItem(gi);
    audio.play('pickup');
    this.floatText(gi.x, 2, gi.z, 'STASHED', '#f2efe6');
    this.trackBest(gi.item);
  }

  salvageGround(gi: GroundItem) {
    const v = this.run.salvageValue(gi.item);
    this.run.addGold(v);
    this.pickups.removeItem(gi);
    audio.play('purchase');
    this.floatText(gi.x, 2, gi.z, `+${v} GOLD`, '#ffd23a');
    this.fx.chunkBurst(gi.x, 1.5, gi.z, 0x8a8a92, 6, 0.3, 6);
  }

  private trackBest(it: Item) {
    const c = this.run.counters;
    if (!c.bestItem || it.rarity > c.bestItem.rarity || (it.rarity === c.bestItem.rarity && it.level > c.bestItem.level)) c.bestItem = it;
  }

  // ================================================================= render-time
  render(time: number) {
    this.projectiles.render(time);
    // crosshair world target glow
  }

  get objective(): { title: string; lines: { text: string; done?: boolean; optional?: boolean; count?: string }[] } {
    const run = this.run;
    if (this.isBossFloor) {
      const def = this.bossDef ?? BOSS_BY_ACT[run.act];
      const lines: { text: string; done?: boolean; optional?: boolean; count?: string }[] = [{ text: `Defeat ${def.title.replace('THE ', 'the ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}`, done: this.bossDefeated }];
      if (this.boss && run.act === 2 && (this.boss as any).sealsSpawned) {
        const alive = this.countAlive('seal');
        lines.push({ text: 'Break Treasure Seals', count: `${3 - alive}/3`, done: alive === 0 });
      }
      if (this.boss && run.act === 3 && (this.boss as any).pillars) {
        const alive = this.countAlive('pillar');
        lines.push({ text: 'Optional: Break Soul Pillars', count: `${3 - alive}/3`, optional: true, done: alive === 0 });
      }
      if (this.bossDefeated) lines.push({ text: run.floor >= 8 ? 'Escape with the loot!' : 'Descend through the portal' });
      return { title: 'BOSS FIGHT', lines };
    }
    const lines: { text: string; done?: boolean; optional?: boolean; count?: string }[] = [];
    lines.push({ text: 'Find the Keystone', count: `${Math.min(1, run.keystones)}/1`, done: run.keystones > 0 });
    lines.push({ text: 'Reach the Exit Portal', done: false });
    lines.push({ text: 'Optional: Clear rooms', count: `${this.roomsCleared}/${this.roomsTotal}`, optional: true, done: this.roomsCleared >= this.roomsTotal });
    return { title: 'DELVE DEEPER', lines };
  }
}
