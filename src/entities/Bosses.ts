import * as THREE from 'three';
import type { Enemy, EnemyDef, EnemyVisual } from './Enemy';
import type { World } from '../game/World';
import { toon, glow } from '../render/Toon';
import { angleDiff, headingOf, clamp, damp } from '../core/MathUtil';
import { audio } from '../audio/Audio';
import { bishopModel, bishopAnim, hoardModel, hoardAnim, sovereignModel, sovereignAnim } from './BossModels';
import { rand } from '../core/Rng';

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent?: THREE.Object3D) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}
function pv(x: number, y: number, z: number, parent: THREE.Object3D) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const set = (e: Enemy, s: string) => {
  e.state = s;
  e.st = 0;
  e.aux = 0;
};

export interface BossInfo {
  title: string;
  subtitle: string;
  phase: number;
  objective?: { text: string; done: number; total: number; optional?: boolean };
}

export function bossPhase(e: Enemy) {
  const f = e.hp / e.maxHp;
  return f > 0.6 ? 1 : f > 0.3 ? 2 : 3;
}

// =================================================================== IRON BISHOP
const bishop: EnemyDef = {
  id: 'bishop', name: 'The Iron Bishop', hp: 12500, speed: 7, radius: 3.8, height: 17, mass: 99, damage: 50, xp: 600, gold: 250,
  body: 'armor', cost: 99, minFloor: 0, acts: [1], weight: 0, boss: true, noRam: true,
  spheres: [{ y: 3.5, r: 3.3, crit: false }, { y: 9.0, r: 3.2, crit: false }, { y: 9.0, r: 1.15, crit: true, fwd: 2.3 }, { y: 12.4, r: 1.4, crit: true, fwd: 0.15 }],
  build: bishopModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    const ph = bossPhase(e);
    const haste = ph === 3 ? 1.35 : 1;
    e.st += dt * haste;
    e.cd -= dt * haste;
    e.cd2 -= dt;
    switch (e.state) {
      case 'idle':
      case 'walk': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        e.move(w, dir.x, dir.z, d > 18 ? e.def.speed : 0, dt, 2);
        e.faceTo(p.pos.x, p.pos.z, dt, 2);
        if (e.cd <= 0) {
          const opts: [string, number][] = [['ring', 3], ['slam', d > 12 ? 3 : 1.5], ['summon', e.cd2 <= 0 ? 2 : 0]];
          if (ph >= 2) opts.push(['lance', 3]);
          let tot = 0;
          for (const o of opts) tot += o[1];
          let r = Math.random() * tot;
          let pick = 'ring';
          for (const o of opts) {
            r -= o[1];
            if (r <= 0) {
              pick = o[0];
              break;
            }
          }
          set(e, pick);
          if (pick === 'slam') {
            e.tx = p.pos.x + p.vel.x * 0.6;
            e.tz = p.pos.z + p.vel.z * 0.6;
            w.fx.tele.circle(e.tx, e.tz, 11, 1.4, 0xff4020);
            audio.play('telegraph', { x: e.tx, z: e.tz });
          }
          if (pick === 'lance') audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 1.3 });
        }
        break;
      }
      case 'ring': {
        e.move(w, 0, 0, 0, dt, 4);
        e.faceTo(p.pos.x, p.pos.z, dt, 3);
        const waves = ph === 3 ? 3 : ph === 2 ? 2 : 1;
        if (e.st > 0.9 && e.aux < waves && e.st > 0.9 + e.aux * 0.55) {
          const n = 26;
          const gap = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z) + rand(-1.2, 1.2);
          const off = e.aux * (Math.PI / n);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + off;
            if (Math.abs(angleDiff(a, gap)) < 0.32) continue;
            w.projectiles.enemyShot('holy', e.pos.x + Math.sin(a) * 4, 2.2, e.pos.z + Math.cos(a) * 4, Math.sin(a) * 19, 0, Math.cos(a) * 19, e.damage * 0.6, e, { life: 5 });
          }
          audio.play('orb', { x: e.pos.x, z: e.pos.z, pitch: 0.6 });
          w.fx.rings.spawn(e.pos.x, 2, e.pos.z, 2, 8, 0.4, 0xffd070);
          e.aux++;
        }
        if (e.st > 1.2 + waves * 0.55) {
          set(e, 'walk');
          e.cd = rand(1.4, 2.2);
        }
        break;
      }
      case 'slam': {
        // leap: rise, travel, crash
        const t = e.st;
        if (t < 1.4) {
          const k = clamp((t - 0.4) / 1.0, 0, 1);
          if (e.aux === 0) {
            e.aux2 = e.pos.x;
            e.aux = 1;
            (e as any).sz = e.pos.z;
          }
          if (t > 0.4) {
            e.pos.x = e.aux2 + (e.tx - e.aux2) * k;
            e.pos.z = (e as any).sz + (e.tz - (e as any).sz) * k;
            e.y = Math.sin(k * Math.PI) * 16;
          }
          e.vel.set(0, 0, 0);
        } else if (e.aux === 1) {
          e.aux = 2;
          e.y = 0;
          audio.play('slam', { x: e.pos.x, z: e.pos.z });
          audio.play('explosionBig', { x: e.pos.x, z: e.pos.z });
          w.fx.explosion(e.pos.x, 0.5, e.pos.z, 8, 'holy', true);
          w.fx.shake(1.4);
          if (d < 11 && p.pos.y < 2) w.damagePlayer(e.damage * 1.3, { enemy: e, x: e.pos.x, z: e.pos.z, knock: 34 });
          w.shockwave(e.pos.x, e.pos.z, 55, 32, e.damage * 0.7, e, 0xffd070);
          if (ph >= 2) w.shockwave(e.pos.x, e.pos.z, 55, 22, e.damage * 0.7, e, 0xff6020, 0.5);
        } else if (t > 2.3) {
          set(e, 'walk');
          e.cd = rand(1.2, 2);
        }
        break;
      }
      case 'lance': {
        e.move(w, 0, 0, 0, dt, 4);
        const base = e.aux2;
        if (e.st < 0.05) e.aux2 = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z) - 1.5;
        const sweep = clamp((e.st - 1.0) / 2.6, 0, 1);
        const ang = base + sweep * 3.0;
        e.heading = damp(e.heading, ang, 8, dt);
        const cx = e.pos.x + Math.sin(e.heading) * 2.4, cz = e.pos.z + Math.cos(e.heading) * 2.4;
        const len = w.grid.raycast(cx, cz, Math.sin(ang), Math.cos(ang), 90);
        const ex = cx + Math.sin(ang) * len, ez = cz + Math.cos(ang) * len;
        if (e.st < 1.0) {
          w.fx.beams.segment(cx, 9.0, cz, ex, 1.2, ez, 0.25, 3, 0.3, 0.2, 0.6);
        } else if (sweep < 1) {
          w.fx.beams.segment(cx, 9.0, cz, ex, 1.2, ez, 2.4, 1.6, 1.1, 0.4, 0.9);
          w.fx.beams.segment(cx, 9.0, cz, ex, 1.2, ez, 0.7, 1.4, 1.3, 1.1, 1);
          w.fx.sparks(ex, 1, ez, 0, 1, 0, 3, [1, 0.8, 0.4], 14);
          if (Math.random() < 0.3) w.fx.decals.splat(ex, ez, 1.5, 0x1a0a00, 0.6, 10, 1);
          // hit test: distance from player to segment
          const px = p.pos.x - cx, pz = p.pos.z - cz;
          const dx = ex - cx, dz = ez - cz;
          const L2 = dx * dx + dz * dz;
          const t = clamp((px * dx + pz * dz) / L2, 0, 1);
          const qx = cx + dx * t - p.pos.x, qz = cz + dz * t - p.pos.z;
          if (qx * qx + qz * qz < 2.6 * 2.6 && p.pos.y < 3) w.damagePlayer(e.damage * 2.2 * dt, { enemy: e, element: 'fire', silent: true });
          w.lightFlash(ex, 2, ez, 0xffc060, 10, 20);
        } else if (e.st > 4) {
          set(e, 'walk');
          e.cd = rand(1.5, 2.5);
        }
        break;
      }
      case 'summon': {
        e.move(w, 0, 0, 0, dt, 4);
        if (e.st > 1.2 && e.aux === 0) {
          e.aux = 1;
          const n = ph >= 2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const sx = e.pos.x + Math.sin(a) * 12, sz = e.pos.z + Math.cos(a) * 12;
            if (!w.grid.isSolidAt(sx, sz)) w.spawnEnemy(i % 3 === 2 && ph >= 2 ? 'boneknight' : 'bonewalker', sx, sz, e.room, { summoned: true });
          }
          audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 0.9 });
          e.cd2 = 16;
        }
        if (e.st > 2) {
          set(e, 'walk');
          e.cd = 1.5;
        }
        break;
      }
    }
  },
  anim: bishopAnim,
  onDeath: (e, w) => {
    w.bossDeathFx(e, [1, 0.85, 0.4]);
  },
};

// =================================================================== HOARDLORD
const hoardlord: EnemyDef = {
  id: 'hoardlord', name: 'The Hoardlord', hp: 20000, speed: 30, radius: 5.5, height: 13, mass: 99, damage: 60, xp: 1200, gold: 600,
  body: 'bone', cost: 99, minFloor: 0, acts: [2], weight: 0, boss: true, noRam: true,
  spheres: [{ y: 2.6, r: 4.2, crit: false, fwd: 2.4 }, { y: 2.6, r: 4.2, crit: false, fwd: -2.6 }, { y: 7.0, r: 2.6, crit: false, fwd: 0.5 }, { y: 11.4, r: 1.9, crit: true, fwd: 5.4 }],
  build: hoardModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    const ph = bossPhase(e);
    e.st += dt;
    e.cd -= dt;
    // phase 2 seals
    if (ph >= 2 && !(e as any).sealsSpawned) {
      (e as any).sealsSpawned = true;
      w.spawnBossAdds('seal', 3, e);
      w.say('seals');
      audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 0.8 });
    }
    const drive = (target: number, speed: number, turn: number) => {
      const diff = angleDiff(e.heading, target);
      e.heading += clamp(diff, -turn * dt, turn * dt);
      e.aux2 = damp(e.aux2, speed, 2, dt);
      e.vel.x = Math.sin(e.heading) * e.aux2;
      e.vel.z = Math.cos(e.heading) * e.aux2;
      return diff;
    };
    switch (e.state) {
      case 'idle':
      case 'cruise': {
        // circle-strafe the player at mid range
        const orbit = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z) + (d < 28 ? 1.3 : d > 45 ? 0.2 : 0.9);
        drive(orbit, 22, 1.4);
        if (e.cd <= 0) {
          const r = Math.random();
          if (r < 0.4) {
            set(e, 'chargeWind');
            e.tx = p.pos.x;
            e.tz = p.pos.z;
          } else if (r < 0.7) set(e, 'coins');
          else set(e, 'breath');
        }
        break;
      }
      case 'chargeWind': {
        const tgt = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        drive(tgt, 0, 3);
        if (e.st > 0.1 && e.aux === 0) {
          e.aux = 1;
          audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 1.1 });
        }
        if (e.st > 1.0) {
          w.fx.tele.line(e.pos.x, e.pos.z, e.heading, 70, 10, 0.5);
          set(e, 'charge');
        }
        break;
      }
      case 'charge': {
        e.aux2 = ph === 3 ? 62 : 55;
        e.vel.x = Math.sin(e.heading) * e.aux2;
        e.vel.z = Math.cos(e.heading) * e.aux2;
        if (d < 7.5 && e.aux === 0 && p.pos.y < 3) {
          e.aux = 1;
          w.damagePlayer(e.damage * 1.5, { enemy: e, x: e.pos.x, z: e.pos.z, knock: 40 });
        }
        // wall hit → stunned
        const ahead = w.grid.raycast(e.pos.x, e.pos.z, Math.sin(e.heading), Math.cos(e.heading), 8);
        if (ahead < 7.5 || e.st > 2.2) {
          if (ahead < 7.5) {
            audio.play('explosionBig', { x: e.pos.x, z: e.pos.z });
            w.fx.explosion(e.pos.x + Math.sin(e.heading) * 6, 3, e.pos.z + Math.cos(e.heading) * 6, 6, 'none', true);
            w.fx.shake(1.2);
            w.spawnCoinsAt(e.pos.x, e.pos.z, 12, 6);
            set(e, 'stunned');
            w.say('bossStunned');
          } else set(e, 'cruise');
          e.aux2 = 0;
          e.vel.set(0, 0, 0);
          e.cd = rand(2, 3);
        }
        break;
      }
      case 'stunned':
        e.vel.set(0, 0, 0);
        if (Math.random() < 0.3) w.fx.magicBurst(e.pos.x, 11, e.pos.z, [1, 0.9, 0.3], 2, 3);
        if (e.st > 2.4) set(e, 'cruise');
        break;
      case 'coins': {
        const tgt = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        drive(tgt, 8, 2);
        if (e.st > 0.6 && e.st < 2.2) {
          e.aux += dt;
          const rate = ph === 3 ? 0.035 : 0.05;
          while (e.aux > rate) {
            e.aux -= rate;
            const a = e.heading + rand(-0.55, 0.55);
            const tp = e.visual.parts.throat.getWorldPosition(new THREE.Vector3());
            const hx = tp.x, hz = tp.z;
            w.projectiles.enemyShot('coin', hx, tp.y, hz, Math.sin(a) * rand(26, 40), rand(4, 12), Math.cos(a) * rand(26, 40), e.damage * 0.35, e, { gravity: 22, life: 3 });
          }
          if (Math.random() < 0.3) audio.play('coin', { x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 2.6) {
          set(e, 'cruise');
          e.cd = rand(1.5, 2.5);
        }
        break;
      }
      case 'breath': {
        const tgt = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        drive(tgt + (e.st > 0.9 ? Math.sin(e.st * 1.5) * 0.6 : 0), 4, 1.2);
        if (e.st > 0.9 && e.st < 3.2) {
          const tp = e.visual.parts.throat.getWorldPosition(new THREE.Vector3());
          const hx = tp.x, hz = tp.z;
          e.aux += dt;
          while (e.aux > 0.05) {
            e.aux -= 0.05;
            const a = e.heading + rand(-0.18, 0.18);
            w.projectiles.enemyShot('purple', hx, tp.y, hz, Math.sin(a) * 42, -tp.y * 0.75, Math.cos(a) * 42, e.damage * 0.4, e, { life: 1.4 });
          }
          if (Math.random() < 0.35) w.fx.beams.lightning(hx, tp.y, hz, hx + Math.sin(e.heading) * 20 + rand(-4, 4), 1, hz + Math.cos(e.heading) * 20 + rand(-4, 4), 0.3, 0.9, 0.35, 1.6, 2);
          if (Math.random() < 0.2) audio.play('tesla', { x: hx, z: hz, pitch: 0.6 });
        }
        if (e.st > 3.5) {
          set(e, 'cruise');
          e.cd = rand(1.5, 2.5);
        }
        break;
      }
    }
    // seals shield
    const seals = w.countAlive('seal');
    e.maxShield = seals > 0 ? 1 : 0;
    (e as any).invulnFactor = seals > 0 ? 0.1 : 1;
  },
  anim: hoardAnim,
  onDeath: (e, w) => {
    w.bossDeathFx(e, [0.7, 0.3, 1]);
    w.spawnCoinsAt(e.pos.x, e.pos.z, 80, 12);
  },
};

// =================================================================== BONE SOVEREIGN
const sovereign: EnemyDef = {
  id: 'sovereign', name: 'The Bone Sovereign', hp: 30000, speed: 6, radius: 6, height: 20, mass: 99, damage: 70, xp: 2500, gold: 1200,
  body: 'bone', cost: 99, minFloor: 0, acts: [3], weight: 0, boss: true, noRam: true,
  spheres: [{ y: 6, r: 4.6, crit: false, fwd: -2.5 }, { y: 8.5, r: 4.2, crit: false, fwd: 2 }, { y: 7.3, r: 1.5, crit: true, fwd: 0.6 }, { y: 16.3, r: 2.6, crit: true, fwd: 9.2 }],
  build: sovereignModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    const ph = bossPhase(e);
    const haste = ph === 3 ? 1.3 : 1;
    e.st += dt * haste;
    e.cd -= dt * haste;
    e.cd2 -= dt;
    if (!(e as any).pillars) {
      (e as any).pillars = true;
      w.spawnBossAdds('pillar', 3, e);
    }
    const pillars = w.countAlive('pillar');
    (e as any).invulnFactor = 1 - pillars * 0.2;
    switch (e.state) {
      case 'idle':
      case 'stalk': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        e.move(w, dir.x, dir.z, d > 24 ? e.def.speed : d < 14 ? -e.def.speed : 0, dt, 2, false);
        e.faceTo(p.pos.x, p.pos.z, dt, 1.5);
        if (e.cd <= 0) {
          const behind = Math.abs(angleDiff(e.heading, headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z))) > 1.9;
          if (behind && d < 22) set(e, 'tail');
          else {
            const r = Math.random();
            set(e, r < 0.4 ? 'meteors' : r < 0.75 ? 'breath' : e.cd2 <= 0 && ph >= 2 ? 'summon' : 'meteors');
          }
          if ((e.state as string) === 'tail') w.fx.tele.circle(e.pos.x, e.pos.z, 20, 1.1, 0xff4020);
          if ((e.state as string) === 'breath') audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 0.7 });
        }
        break;
      }
      case 'meteors': {
        e.move(w, 0, 0, 0, dt, 3);
        e.faceTo(p.pos.x, p.pos.z, dt, 2);
        const n = ph === 3 ? 10 : ph === 2 ? 8 : 6;
        if (e.aux === 0 && e.st > 0.6) {
          e.aux = 1;
          audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 0.55 });
          for (let i = 0; i < n; i++) {
            const tx = p.pos.x + (i === 0 ? p.vel.x * 1.2 : rand(-16, 16));
            const tz = p.pos.z + (i === 0 ? p.vel.z * 1.2 : rand(-16, 16));
            const delay = 1.1 + i * 0.12;
            w.fx.tele.circle(tx, tz, 5, delay, 0xff5010);
            w.projectiles.meteor(tx, tz, delay, e.damage, e);
          }
        }
        if (e.st > 2.8) {
          set(e, 'stalk');
          e.cd = rand(1.5, 2.5);
        }
        break;
      }
      case 'breath': {
        e.move(w, 0, 0, 0, dt, 3);
        const base = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        if (e.st < 1.0) e.faceTo(p.pos.x, p.pos.z, dt, 3);
        else e.heading = damp(e.heading, base + Math.sin((e.st - 1) * 1.6) * 0.8, 1.5, dt);
        const sk = e.visual.parts.mouthGlow.getWorldPosition(new THREE.Vector3());
        if (e.st > 1.0 && e.st < 4.0) {
          e.aux += dt;
          while (e.aux > 0.04) {
            e.aux -= 0.04;
            const a = e.heading + rand(-0.14, 0.14);
            w.projectiles.enemyShot('eflame', sk.x, sk.y, sk.z, Math.sin(a) * 40, -sk.y * 0.55, Math.cos(a) * 40, e.damage * 0.3, e, { life: 1.3 });
          }
          if (Math.random() < 0.2) audio.play('fireball', { x: sk.x, z: sk.z });
          w.lightFlash(sk.x, sk.y, sk.z, 0xff6020, 14, 30);
        }
        if (e.st > 4.4) {
          set(e, 'stalk');
          e.cd = rand(1.4, 2.4);
        }
        break;
      }
      case 'tail': {
        e.move(w, 0, 0, 0, dt, 3);
        if (e.st > 1.1 && e.aux === 0) {
          e.aux = 1;
          audio.play('slam', { x: e.pos.x, z: e.pos.z });
          w.fx.rings.spawn(e.pos.x, 0.3, e.pos.z, 3, 21, 0.4, 0xff6020);
          w.fx.shake(1);
          if (d < 20 && p.pos.y < 2) w.damagePlayer(e.damage * 1.2, { enemy: e, x: e.pos.x, z: e.pos.z, knock: 40 });
        }
        if (e.st > 1.8) {
          set(e, 'stalk');
          e.cd = 1.2;
        }
        break;
      }
      case 'summon': {
        e.move(w, 0, 0, 0, dt, 3);
        if (e.st > 1 && e.aux === 0) {
          e.aux = 1;
          for (let i = 0; i < 4; i++) {
            const a = rand(0, Math.PI * 2);
            const sx = e.pos.x + Math.sin(a) * 18, sz = e.pos.z + Math.cos(a) * 18;
            if (!w.grid.isSolidAt(sx, sz)) w.spawnEnemy(i < 2 ? 'wraith' : 'imp', sx, sz, e.room, { summoned: true });
          }
          e.cd2 = 18;
          audio.play('roar', { x: e.pos.x, z: e.pos.z, pitch: 1.2 });
        }
        if (e.st > 1.8) {
          set(e, 'stalk');
          e.cd = 1;
        }
        break;
      }
    }
  },
  anim: sovereignAnim,
  onDeath: (e, w) => {
    w.bossDeathFx(e, [1, 0.4, 0.1]);
  },
};

// =================================================================== boss adds
function sealModel(): EnemyVisual {
  const root = new THREE.Group();
  m(new THREE.CylinderGeometry(1.6, 2, 1.2, 8), toon(0x3a2a4a), 0, 0.6, 0, 0, 0, 0, root);
  const c = m(new THREE.OctahedronGeometry(1.4, 0), toon(0xffc040, { emissive: 0xffa010, emissiveIntensity: 1.6 }), 0, 3.4, 0, 0, 0, 0, root);
  c.scale.set(0.9, 1.8, 0.9);
  const ring = m(new THREE.TorusGeometry(2, 0.12, 6, 20), glow(0xffd060, 3), 0, 3.4, 0, Math.PI / 2, 0, 0, root);
  return { root, parts: { c, ring } };
}
const seal: EnemyDef = {
  id: 'seal', name: 'Treasure Seal', hp: 1400, speed: 0, radius: 2, height: 6, mass: 99, damage: 0, xp: 60, gold: 40,
  body: 'armor', cost: 99, minFloor: 0, acts: [2], weight: 0, stationary: true, noRam: true,
  spheres: [{ y: 1, r: 1.8, crit: false }, { y: 3.4, r: 1.6, crit: true }],
  build: sealModel,
  ai: (e, w, dt) => {
    e.st += dt;
    if (Math.random() < 0.3) {
      const boss = w.boss;
      if (boss) w.fx.beams.segment(e.pos.x, 3.4, e.pos.z, boss.pos.x, 8, boss.pos.z, 0.25, 1.2, 0.9, 0.3, 0.45);
    }
  },
  anim: (e, dt) => {
    e.visual.parts.c.rotation.y += dt * 1.5;
    e.visual.parts.ring.rotation.z += dt;
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 3, e.pos.z, [1, 0.8, 0.2], 40, 14);
    w.spawnCoinsAt(e.pos.x, e.pos.z, 10, 3);
    audio.play('shatter', { x: e.pos.x, z: e.pos.z });
  },
};

function pillarModel(): EnemyVisual {
  const root = new THREE.Group();
  m(new THREE.CylinderGeometry(1.5, 1.8, 7, 8), toon(0x3a2a2a), 0, 3.5, 0, 0, 0, 0, root);
  for (let i = 0; i < 3; i++) m(new THREE.SphereGeometry(0.55, 8, 6), toon(0xe8dfc6), Math.cos(i * 2.1) * 1.4, 2 + i * 1.8, Math.sin(i * 2.1) * 1.4, 0, 0, 0, root);
  const flame = m(new THREE.ConeGeometry(1.2, 3, 8), glow(0x40ffc0, 3), 0, 8.5, 0, 0, 0, 0, root);
  return { root, parts: { flame } };
}
const pillar: EnemyDef = {
  id: 'pillar', name: 'Soul Pillar', hp: 2200, speed: 0, radius: 1.9, height: 9, mass: 99, damage: 0, xp: 80, gold: 60,
  body: 'spirit', cost: 99, minFloor: 0, acts: [3], weight: 0, stationary: true, noRam: true,
  spheres: [{ y: 3.5, r: 2, crit: false }, { y: 8.5, r: 1.3, crit: true }],
  build: pillarModel,
  ai: (e, w, dt) => {
    e.st += dt;
    const boss = w.boss;
    if (boss && Math.random() < 0.25) w.fx.beams.segment(e.pos.x, 8.5, e.pos.z, boss.pos.x, 9, boss.pos.z, 0.3, 0.2, 1.2, 0.9, 0.45);
  },
  anim: (e, dt) => {
    const f = e.visual.parts.flame;
    f.scale.set(1 + Math.sin(e.st * 9) * 0.1, 1 + Math.sin(e.st * 7) * 0.15, 1);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 5, e.pos.z, [0.25, 1, 0.75], 40, 14);
    w.fx.boneBurst(e.pos.x, 3, e.pos.z, 0, 0, 6);
    w.spawnCoinsAt(e.pos.x, e.pos.z, 12, 3);
    audio.play('shatter', { x: e.pos.x, z: e.pos.z, pitch: 0.7 });
  },
};

export const BOSSES: Record<string, EnemyDef> = { bishop, hoardlord, sovereign, seal, pillar };

export const BOSS_BY_ACT: Record<number, { id: string; title: string; subtitle: string }> = {
  1: { id: 'bishop', title: 'THE IRON BISHOP', subtitle: 'Warden of the Gilded Crypt' },
  2: { id: 'hoardlord', title: 'THE HOARDLORD', subtitle: 'Ruler of the Last Cache' },
  3: { id: 'sovereign', title: 'BONE SOVEREIGN', subtitle: 'Lord of the Gilded Grave' },
};
