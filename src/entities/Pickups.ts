import * as THREE from 'three';
import type { World } from '../game/World';
import { toon, glow } from '../render/Toon';
import { RARITY, type Item } from '../loot/Items';
import { buildItemIcon3D } from './WeaponModels';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';
import { SHAPE_DOT, SHAPE_STAR } from '../fx/Particles';

interface Coin {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  value: number;
  age: number;
  magnet: boolean;
  big: boolean;
}

export type SmallKind = 'repair' | 'key' | 'keystone' | 'nitro';

interface Small {
  kind: SmallKind;
  x: number; y: number; z: number;
  vy: number;
  age: number;
  mesh: THREE.Object3D;
}

export interface GroundItem {
  item: Item;
  x: number;
  z: number;
  y: number;
  vy: number;
  vx: number;
  vz: number;
  mesh: THREE.Object3D;
  age: number;
  shop?: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export class Pickups {
  coins: Coin[] = [];
  smalls: Small[] = [];
  items: GroundItem[] = [];
  private coinMesh: THREE.InstancedMesh;
  private bigCoinMesh: THREE.InstancedMesh;

  constructor(private w: World, private scene: THREE.Scene) {
    const cg = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12);
    cg.rotateX(Math.PI / 2);
    const mat = toon(0xf5c02a, { emissive: 0x6a4000, emissiveIntensity: 0.9 });
    this.coinMesh = new THREE.InstancedMesh(cg, mat, 600);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.coinMesh);
    const bg = new THREE.CylinderGeometry(0.7, 0.7, 0.16, 12);
    bg.rotateX(Math.PI / 2);
    this.bigCoinMesh = new THREE.InstancedMesh(bg, toon(0xffd84a, { emissive: 0x8a5a00, emissiveIntensity: 1.2 }), 200);
    this.bigCoinMesh.count = 0;
    this.bigCoinMesh.frustumCulled = false;
    this.bigCoinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.bigCoinMesh);
  }

  clear() {
    this.coins.length = 0;
    for (const s of this.smalls) this.scene.remove(s.mesh);
    this.smalls.length = 0;
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items.length = 0;
  }

  spawnGold(x: number, z: number, total: number, spread = 1, burst = true) {
    total = Math.max(1, Math.round(total));
    let n = Math.min(24, Math.max(1, Math.ceil(total / 4)));
    const bigValue = total > 60 ? Math.floor(total / 6) : 0;
    let remaining = total;
    const push = (value: number, big: boolean) => {
      if (this.coins.length > 700) {
        this.w.run.addGold(value);
        return;
      }
      const a = rand(0, Math.PI * 2), s = burst ? rand(3, 9) * spread : rand(0, 2);
      this.coins.push({ x: x + rand(-0.5, 0.5), y: 1.2, z: z + rand(-0.5, 0.5), vx: Math.cos(a) * s, vy: burst ? rand(8, 16) : 2, vz: Math.sin(a) * s, value, age: 0, magnet: false, big });
    };
    if (bigValue > 0) {
      for (let i = 0; i < 4; i++) {
        push(bigValue, true);
        remaining -= bigValue;
      }
    }
    n = Math.min(n, remaining);
    const per = Math.max(1, Math.floor(remaining / n));
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? remaining - per * (n - 1) : per;
      if (v > 0) push(v, false);
    }
  }

  spawnSmall(kind: SmallKind, x: number, z: number) {
    let mesh: THREE.Object3D;
    const g = new THREE.Group();
    if (kind === 'repair') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), toon(0xd02030));
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.82), glow(0xffffff, 2));
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.82), glow(0xffffff, 2));
      g.add(box, c1, c2);
    } else if (kind === 'key') {
      const gold = toon(0xf2c040, { emissive: 0x6a4000, emissiveIntensity: 1 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 6, 12), gold);
      ring.position.y = 0.5;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), gold);
      shaft.position.y = -0.2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.14), gold);
      tooth.position.set(0.16, -0.5, 0);
      g.add(ring, shaft, tooth);
    } else if (kind === 'nitro') {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 10), toon(0x2060d0, { emissive: 0x103070, emissiveIntensity: 1 }));
      g.add(can);
    } else {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), toon(0x40b0ff, { emissive: 0x2080ff, emissiveIntensity: 2 }));
      gem.scale.set(0.8, 1.3, 0.8);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 6, 20), glow(0x80d0ff, 3));
      ring.rotation.x = Math.PI / 2;
      g.add(gem, ring);
    }
    mesh = g;
    mesh.position.set(x, 1, z);
    this.scene.add(mesh);
    this.smalls.push({ kind, x, y: 1, z, vy: 10, age: 0, mesh });
  }

  dropItem(item: Item, x: number, z: number, burst = true, shop = false): GroundItem {
    const holder = new THREE.Group();
    const icon = buildItemIcon3D(item);
    icon.position.y = 0.3;
    holder.add(icon);
    // glowing base ring by rarity
    const col = RARITY[item.rarity].color;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 24), glow(col, 2.5, { additive: true, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.95;
    ring.layers.set(1);
    holder.add(ring);
    holder.position.set(x, 1, z);
    holder.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.scene.add(holder);
    const a = rand(0, Math.PI * 2);
    const s = burst ? rand(3, 8) : 0;
    const gi: GroundItem = { item, x, z, y: 1.2, vy: burst ? 14 : 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, mesh: holder, age: 0, shop };
    this.items.push(gi);
    if (!shop) {
      audio.play('lootDrop', { x, z, pitch: item.rarity });
      this.w.run.counters.itemsFound++;
      if (item.rarity >= 4) this.w.onLegendaryDrop(item);
    }
    return gi;
  }

  removeItem(gi: GroundItem) {
    const i = this.items.indexOf(gi);
    if (i >= 0) this.items.splice(i, 1);
    this.scene.remove(gi.mesh);
  }

  update(dt: number, time: number) {
    const w = this.w;
    const p = w.player;
    const run = w.run;
    const radius = run.stats.pickupRadius;
    // coins
    let n = 0, nb = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z, dy = p.pos.y + 0.8 - c.y;
      const d = Math.hypot(dx, dz);
      if (c.age > 0.35 && p.alive && (d < radius || c.magnet)) c.magnet = true;
      if (c.magnet) {
        const sp = 30 + c.age * 20;
        const dl = Math.hypot(dx, dy, dz) || 1;
        c.vx = (dx / dl) * sp;
        c.vy = (dy / dl) * sp;
        c.vz = (dz / dl) * sp;
        if (dl < 1.6) {
          const v = Math.round(c.value * run.stats.goldFind);
          run.addGold(v);
          audio.play('coin', { pitch: c.big ? 0.8 : 1 });
          w.onGoldPickup(v);
          this.coins.splice(i, 1);
          continue;
        }
      } else {
        c.vy -= 35 * dt;
        c.vx *= Math.exp(-1.5 * dt);
        c.vz *= Math.exp(-1.5 * dt);
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (!c.magnet) {
        if (w.grid.isSolidAt(c.x, c.z)) {
          c.x -= c.vx * dt * 2;
          c.z -= c.vz * dt * 2;
          c.vx = -c.vx * 0.3;
          c.vz = -c.vz * 0.3;
        }
        if (c.y < 0.45) {
          c.y = 0.45;
          c.vy = Math.abs(c.vy) > 3 ? -c.vy * 0.4 : 0;
        }
      }
      if (c.age > 60) {
        this.coins.splice(i, 1);
        continue;
      }
      tmpE.set(0, time * 3 + c.x, 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(c.x, c.y + (c.vy === 0 ? Math.sin(time * 4 + c.z) * 0.1 : 0), c.z), tmpQ, tmpS.set(1, 1, 1));
      if (c.big) this.bigCoinMesh.setMatrixAt(nb++, tmpM);
      else this.coinMesh.setMatrixAt(n++, tmpM);
    }
    this.coinMesh.count = Math.min(n, 600);
    this.bigCoinMesh.count = Math.min(nb, 200);
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.bigCoinMesh.instanceMatrix.needsUpdate = true;

    // smalls
    for (let i = this.smalls.length - 1; i >= 0; i--) {
      const s = this.smalls[i];
      s.age += dt;
      s.vy -= 30 * dt;
      s.y = Math.max(1.2, s.y + s.vy * dt);
      if (s.y <= 1.2) s.vy = 0;
      s.mesh.position.set(s.x, s.y + Math.sin(time * 3) * 0.2, s.z);
      s.mesh.rotation.y += dt * 2;
      const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
      if (s.kind === 'keystone') w.fx.add.draw(s.x, s.y, s.z, 0, 0, 0, 4, 0, 0.3, 0.8, 2, 0.5, SHAPE_DOT);
      if (s.age > 0.5 && d < (s.kind === 'keystone' ? 4 : radius * 0.6) && p.alive) {
        this.collectSmall(s);
        this.scene.remove(s.mesh);
        this.smalls.splice(i, 1);
      }
    }

    // ground items
    for (const gi of this.items) {
      gi.age += dt;
      if (gi.vy !== 0 || gi.y > 1.2) {
        gi.vy -= 30 * dt;
        gi.x += gi.vx * dt;
        gi.z += gi.vz * dt;
        gi.y += gi.vy * dt;
        if (w.grid.isSolidAt(gi.x, gi.z)) {
          gi.x -= gi.vx * dt * 2;
          gi.z -= gi.vz * dt * 2;
          gi.vx = gi.vz = 0;
        }
        if (gi.y <= 1.2) {
          gi.y = 1.2;
          gi.vy = 0;
          gi.vx = gi.vz = 0;
        }
      }
      gi.mesh.position.set(gi.x, gi.y + Math.sin(time * 2.5 + gi.x) * 0.25, gi.z);
      gi.mesh.children[0].rotation.y += dt * 1.2;
      const col = RARITY[gi.item.rarity].glow;
      const h = 6 + gi.item.rarity * 5;
      if (!gi.shop || gi.item.rarity >= 2) w.fx.lootBeam(gi.x, 0.2, gi.z, col, h, time + gi.x);
      if (gi.item.rarity >= 3 && Math.random() < dt * 8) w.fx.add.emit(gi.x + rand(-1, 1), 0.3, gi.z + rand(-1, 1), 0, rand(2, 5), 0, 1, 0.25, 0.05, col[0] * 3, col[1] * 3, col[2] * 3, 1, { shape: SHAPE_STAR });
    }
  }

  private collectSmall(s: Small) {
    const w = this.w;
    const run = w.run;
    switch (s.kind) {
      case 'repair':
        run.hp = Math.min(run.stats.maxHp, run.hp + run.stats.maxHp * 0.15);
        audio.play('heal');
        w.floatText(s.x, 2, s.z, '+REPAIR', '#60ff8a');
        break;
      case 'nitro':
        run.nitro = run.stats.boostMax;
        audio.play('pickup');
        w.floatText(s.x, 2, s.z, '+NITRO', '#60b0ff');
        break;
      case 'key':
        run.keys++;
        audio.play('pickup');
        w.floatText(s.x, 2, s.z, '+KEY', '#ffd23a');
        break;
      case 'keystone':
        run.keystones++;
        audio.play('keystone');
        w.onKeystone();
        break;
    }
  }

  nearestItem(x: number, z: number, r: number): GroundItem | null {
    let best: GroundItem | null = null;
    let bd = r;
    for (const gi of this.items) {
      if (gi.age < 0.4) continue;
      const d = Math.hypot(gi.x - x, gi.z - z);
      if (d < bd) {
        bd = d;
        best = gi;
      }
    }
    return best;
  }
}
