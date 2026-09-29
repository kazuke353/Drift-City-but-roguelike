import { Enemy, type EnemyDef } from './Enemy';
import type { World } from '../game/World';
import { skeletonModel as skeleton, houndModel, goblinModel, bruteModel, necroModel, buggyModel, mimicModel, sentryModel, wraithModel, impModel } from './EnemyModels';
import { angleDiff, headingOf, clamp, damp } from '../core/MathUtil';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';

function bipedWalk(e: Enemy, dt: number, stride = 1.3, amp = 0.65) {
  const p = e.visual.parts;
  const sp = Math.hypot(e.vel.x, e.vel.z);
  e.walkPhase += sp * dt * stride * 0.5;
  const s = Math.sin(e.walkPhase * 2) * Math.min(1, sp / 4) * amp;
  if (p.legL) p.legL.rotation.x = s;
  if (p.legR) p.legR.rotation.x = -s;
  if (p.kneeL) p.kneeL.rotation.x = Math.max(0, -s) * 0.9;
  if (p.kneeR) p.kneeR.rotation.x = Math.max(0, s) * 0.9;
  if (p.hips) p.hips.position.y = (p.hips.userData.baseY ??= p.hips.position.y) + Math.abs(Math.cos(e.walkPhase * 2)) * 0.08 * Math.min(1, sp / 4);
  return s;
}

// ------------------------------------------------------------------ shared AI bits
function playerTargetable(w: World) {
  return w.player.alive;
}
function inFront(e: Enemy, x: number, z: number, arc: number) {
  return Math.abs(angleDiff(e.heading, headingOf(x - e.pos.x, z - e.pos.z))) < arc;
}
function lead(w: World, e: Enemy, speed: number, k = 0.7) {
  const p = w.player;
  const d = e.distTo(p.pos.x, p.pos.z);
  const t = (d / speed) * k;
  return { x: p.pos.x + p.vel.x * t, z: p.pos.z + p.vel.z * t };
}
function setState(e: Enemy, s: string) {
  e.state = s;
  e.st = 0;
}

// ------------------------------------------------------------------ definitions
const bonewalker: EnemyDef = {
  id: 'bonewalker', name: 'Bonewalker', hp: 60, speed: 11, radius: 0.9, height: 3.1, mass: 0.8, damage: 28, xp: 10, gold: 3,
  body: 'bone', cost: 1, minFloor: 0, acts: [1, 2, 3], weight: 10,
  spheres: [{ y: 1.7, r: 0.95, crit: false }, { y: 3.28, r: 0.45, crit: true }],
  build: () => skeleton('sword'),
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    switch (e.state) {
      case 'idle':
      case 'chase': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        e.move(w, dir.x, dir.z, e.def.speed, dt);
        if (d < 4.4 && playerTargetable(w)) setState(e, 'windup');
        break;
      }
      case 'windup':
        e.move(w, 0, 0, 0, dt);
        e.faceTo(p.pos.x, p.pos.z, dt, 12);
        if (e.st > 0.42 / e.speedMult) {
          setState(e, 'swing');
          audio.play('swing', { x: e.pos.x, z: e.pos.z });
        }
        break;
      case 'swing':
        if (e.aux === 0 && e.st > 0.06) {
          e.aux = 1;
          if (d < 5.2 && inFront(e, p.pos.x, p.pos.z, 1.3)) w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 0.3) setState(e, 'recover');
        break;
      case 'recover':
        e.aux = 0;
        e.move(w, 0, 0, 0, dt);
        if (e.st > 0.55) setState(e, 'chase');
        break;
    }
  },
  anim: (e, dt) => {
    bipedWalk(e, dt);
    const p = e.visual.parts;
    const armTarget = e.state === 'windup' ? -2.6 : e.state === 'swing' ? 0.9 : Math.sin(e.walkPhase * 2) * 0.4 - 0.3;
    p.armR.rotation.x = damp(p.armR.rotation.x, armTarget, e.state === 'swing' ? 30 : 12, dt);
    p.armL.rotation.x = damp(p.armL.rotation.x, -Math.sin(e.walkPhase * 2) * 0.5, 10, dt);
    p.elR.rotation.x = -0.5;
    p.torso.rotation.y = e.state === 'windup' ? -0.4 : e.state === 'swing' ? 0.5 : 0;
  },
  onDeath: (e, w) => {
    w.fx.boneBurst(e.pos.x, e.y, e.pos.z, e.vel.x * 0.1 + e.knockX * 0.05, e.vel.z * 0.1 + e.knockZ * 0.05, 8);
    audio.play('bone', { x: e.pos.x, z: e.pos.z });
  },
};

const boneknight: EnemyDef = {
  ...bonewalker,
  id: 'boneknight', name: 'Bone Knight', hp: 150, speed: 9.5, radius: 1.05, mass: 1.6, damage: 42, xp: 22, gold: 6, body: 'armor', cost: 2.2, minFloor: 1, weight: 5,
  build: () => skeleton('knight'),
};

const bonearcher: EnemyDef = {
  id: 'bonearcher', name: 'Bone Archer', hp: 45, speed: 9, radius: 0.9, height: 3.1, mass: 0.7, damage: 20, xp: 12, gold: 4,
  body: 'bone', cost: 1.3, minFloor: 0, acts: [1, 3], weight: 6,
  spheres: [{ y: 1.7, r: 0.95, crit: false }, { y: 3.28, r: 0.45, crit: true }],
  build: () => skeleton('bow'),
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    if (e.state === 'draw') {
      e.move(w, 0, 0, 0, dt);
      const L = lead(w, e, 60);
      e.faceTo(L.x, L.z, dt, 14);
      e.visual.parts.glowTip.visible = true;
      if (e.st > 0.75 / e.speedMult) {
        e.visual.parts.glowTip.visible = false;
        const dx = L.x - e.pos.x, dz = L.z - e.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        w.projectiles.enemyShot('arrow', e.pos.x + (dx / dl) * 1.2, 2.3, e.pos.z + (dz / dl) * 1.2, (dx / dl) * 60, -0.5, (dz / dl) * 60, e.damage, e);
        audio.play('arrow', { x: e.pos.x, z: e.pos.z });
        e.cd = rand(1.8, 2.8);
        setState(e, 'move');
      }
      return;
    }
    // reposition / strafe
    let dx = 0, dz = 0;
    if (d > 34 || !los) {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      dx = dir.x;
      dz = dir.z;
    } else if (d < 15) {
      dx = (e.pos.x - p.pos.x) / d;
      dz = (e.pos.z - p.pos.z) / d;
    } else {
      if (e.st > e.aux2) {
        e.aux = Math.random() < 0.5 ? -1 : 1;
        e.aux2 = e.st + rand(1, 2.5);
      }
      dx = (-(p.pos.z - e.pos.z) / d) * e.aux;
      dz = ((p.pos.x - e.pos.x) / d) * e.aux;
    }
    e.move(w, dx, dz, e.def.speed, dt);
    if (e.cd <= 0 && los && d < 48 && playerTargetable(w)) setState(e, 'draw');
  },
  anim: (e, dt) => {
    bipedWalk(e, dt);
    const p = e.visual.parts;
    p.armL.rotation.x = damp(p.armL.rotation.x, e.state === 'draw' ? -1.5 : -0.3, 10, dt);
    p.armR.rotation.x = damp(p.armR.rotation.x, e.state === 'draw' ? -1.4 : Math.sin(e.walkPhase * 2) * 0.4, 10, dt);
    p.elR.rotation.x = e.state === 'draw' ? -1.2 : -0.2;
  },
  onDeath: bonewalker.onDeath,
};

const hellhound: EnemyDef = {
  id: 'hellhound', name: 'Hellhound', hp: 70, speed: 21, radius: 1.1, height: 2.2, mass: 1.0, damage: 24, xp: 13, gold: 4,
  body: 'flesh', cost: 1.4, minFloor: 0, acts: [1, 2, 3], weight: 7,
  spheres: [{ y: 1.3, r: 1.1, crit: false }, { y: 2.0, r: 0.5, crit: true, fwd: 1.65 }],
  build: houndModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    switch (e.state) {
      case 'idle':
      case 'chase': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        // zig-zag approach
        const zig = Math.sin(e.st * 3 + e.id) * 0.5;
        e.move(w, dir.x + -dir.z * zig, dir.z + dir.x * zig, e.def.speed, dt, 6);
        if (d < 15 && e.cd <= 0 && w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z) && playerTargetable(w)) {
          setState(e, 'crouch');
          audio.play('growl', { x: e.pos.x, z: e.pos.z, pitch: 1.2 });
        }
        break;
      }
      case 'crouch': {
        e.move(w, 0, 0, 0, dt, 12);
        const L = lead(w, e, 40, 0.8);
        e.faceTo(L.x, L.z, dt, 14);
        e.tx = L.x;
        e.tz = L.z;
        if (e.st > 0.42 / e.speedMult) {
          setState(e, 'leap');
          const dx = e.tx - e.pos.x, dz = e.tz - e.pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          e.vel.set((dx / dl) * 42, 0, (dz / dl) * 42);
          e.aux = 0;
        }
        break;
      }
      case 'leap': {
        if (e.aux === 0 && e.distTo(p.pos.x, p.pos.z) < 3.4) {
          e.aux = 1;
          w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
          audio.play('chomp', { x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 0.45) setState(e, 'recover');
        break;
      }
      case 'recover':
        e.move(w, 0, 0, 0, dt, 5);
        if (e.st > 0.6) {
          setState(e, 'chase');
          e.cd = rand(1.2, 2.2);
        }
        break;
    }
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    const sp = Math.hypot(e.vel.x, e.vel.z);
    e.walkPhase += sp * dt * 0.35;
    const g = Math.sin(e.walkPhase * 2) * Math.min(1, sp / 6) * 0.8;
    p.l0.rotation.x = g;
    p.l1.rotation.x = g * 0.8;
    p.l2.rotation.x = -g;
    p.l3.rotation.x = -g * 0.8;
    const crouch = e.state === 'crouch' ? 1 : 0;
    p.body.position.y = damp(p.body.position.y, 1.35 - crouch * 0.45 + Math.abs(Math.cos(e.walkPhase * 2)) * 0.12, 14, dt);
    p.body.rotation.x = e.state === 'leap' ? -0.3 : 0;
    p.jaw.rotation.x = e.state === 'leap' || e.state === 'crouch' ? 0.6 : 0.1;
    p.tail.rotation.y = Math.sin(e.walkPhase * 3) * 0.4;
  },
  onDeath: (e, w) => {
    w.fx.gooBurst(e.pos.x, 1.2, e.pos.z, [0.8, 0.08, 0.05], 12);
    w.fx.chunkBurst(e.pos.x, 1.2, e.pos.z, 0x4a1414, 6, 0.45, 8);
    audio.play('splat', { x: e.pos.x, z: e.pos.z });
  },
};

const goblinBomber: EnemyDef = {
  id: 'bomber', name: 'Goblin Bomber', hp: 32, speed: 17, radius: 0.8, height: 2.6, mass: 0.5, damage: 55, xp: 9, gold: 5,
  body: 'flesh', cost: 1.1, minFloor: 0, acts: [1, 2], weight: 5,
  spheres: [{ y: 1.0, r: 0.7, crit: false }, { y: 1.9, r: 0.45, crit: true }, { y: 2.65, r: 0.5, crit: true }],
  build: () => goblinModel(true),
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    if (e.state === 'fuse') {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      e.move(w, dir.x, dir.z, e.def.speed * 0.4, dt);
      if (Math.random() < 0.5) w.fx.sparks(e.pos.x, 3.3, e.pos.z, 0, 1, 0, 1, [1, 0.6, 0.1], 6);
      if (e.st > 0.75) {
        w.explode(e.pos.x, 1, e.pos.z, 6.5, e.damage, { team: 'enemy', element: 'fire', source: e });
        e.hp = 0;
        w.killEnemy(e, { amount: 0, element: 'fire', source: 'status' }, true);
      }
      return;
    }
    const dir = e.pathTo(w, p.pos.x, p.pos.z);
    e.move(w, dir.x, dir.z, e.def.speed, dt);
    if (d < 5 && playerTargetable(w)) {
      setState(e, 'fuse');
      audio.play('ignite', { x: e.pos.x, z: e.pos.z });
      w.fx.tele.circle(e.pos.x, e.pos.z, 6.5, 0.75);
    }
  },
  anim: (e, dt) => {
    bipedWalk(e, dt, 2.2, 0.8);
    const s = e.visual.parts.spark;
    if (s) s.scale.setScalar(e.state === 'fuse' ? 1.5 + Math.sin(e.st * 40) * 0.8 : 1 + Math.sin(e.st * 20) * 0.3);
  },
  onDeath: (e, w) => {
    if (e.state !== 'fuse') w.explode(e.pos.x, 1, e.pos.z, 5.5, e.damage * 0.8, { team: 'both', element: 'fire', source: e });
    w.fx.gooBurst(e.pos.x, 1.2, e.pos.z, [0.3, 0.8, 0.2], 8);
  },
};

const brute: EnemyDef = {
  id: 'brute', name: 'Stoneback Brute', hp: 620, speed: 7.5, radius: 2.2, height: 6.2, mass: 6, damage: 70, xp: 60, gold: 18,
  body: 'armor', cost: 5, minFloor: 1, acts: [1, 2, 3], weight: 3,
  spheres: [{ y: 2.4, r: 2.0, crit: false }, { y: 4.3, r: 1.6, crit: false }, { y: 5.1, r: 0.7, crit: true, fwd: 0.6 }],
  build: bruteModel,
  noRam: true,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    e.cd2 -= dt;
    switch (e.state) {
      case 'idle':
      case 'chase': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        e.move(w, dir.x, dir.z, e.def.speed, dt, 3);
        if (d < 10 && e.cd <= 0 && playerTargetable(w)) {
          setState(e, 'slamWind');
          w.fx.tele.circle(e.pos.x + Math.sin(e.heading) * 3, e.pos.z + Math.cos(e.heading) * 3, 9, 1.0 / e.speedMult);
          audio.play('growl', { x: e.pos.x, z: e.pos.z, pitch: 0.6 });
        } else if (d > 16 && d < 55 && e.cd2 <= 0 && w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z) && playerTargetable(w)) {
          setState(e, 'throwWind');
          const L = lead(w, e, 30, 1.0);
          e.tx = L.x;
          e.tz = L.z;
        }
        break;
      }
      case 'slamWind':
        e.move(w, 0, 0, 0, dt, 8);
        if (e.st > 1.0 / e.speedMult) {
          const sx = e.pos.x + Math.sin(e.heading) * 3, sz = e.pos.z + Math.cos(e.heading) * 3;
          audio.play('slam', { x: sx, z: sz });
          w.fx.explosion(sx, 0.5, sz, 5, 'none');
          w.fx.rings.spawn(sx, 0.2, sz, 1, 10, 0.4, 0xffa060);
          w.fx.shake(0.8);
          if (Math.hypot(p.pos.x - sx, p.pos.z - sz) < 9.5 && p.pos.y < 1.5) w.damagePlayer(e.damage, { enemy: e, x: sx, z: sz, knock: 26 });
          w.damageEnemiesInRadius(sx, sz, 9, e.damage * 0.5, e);
          setState(e, 'recover');
          e.cd = 3.2;
        }
        break;
      case 'throwWind':
        e.move(w, 0, 0, 0, dt, 8);
        e.faceTo(e.tx, e.tz, dt, 8);
        if (e.st > 0.85 / e.speedMult) {
          w.projectiles.lob('boulder', e.pos.x, 5.5, e.pos.z, e.tx, e.tz, 1.1, e.damage * 0.8, e, 4.5);
          w.fx.tele.circle(e.tx, e.tz, 4.5, 1.1);
          e.cd2 = rand(3.5, 5);
          setState(e, 'recover');
        }
        break;
      case 'recover':
        e.move(w, 0, 0, 0, dt, 5);
        if (e.st > 0.8) setState(e, 'chase');
        break;
    }
  },
  anim: (e, dt) => {
    bipedWalk(e, dt, 0.8, 0.45);
    const p = e.visual.parts;
    const raise = e.state === 'slamWind' || e.state === 'throwWind' ? 1 : 0;
    const slam = e.state === 'recover' && e.st < 0.3 ? 1 : 0;
    const armX = raise ? -2.9 : slam ? -0.6 : -2.2;
    p.armL.rotation.x = damp(p.armL.rotation.x, armX, raise ? 6 : 25, dt);
    p.armR.rotation.x = damp(p.armR.rotation.x, armX, raise ? 6 : 25, dt);
    p.block.position.y = damp(p.block.position.y, raise ? 4.6 : slam ? 1.6 : 3.4, raise ? 6 : 25, dt);
    p.block.position.z = damp(p.block.position.z, slam ? 2.2 : 0.3, 12, dt);
    p.block.visible = !(e.state === 'recover' && e.aux2 === 1);
    p.torso.rotation.x = damp(p.torso.rotation.x, slam ? 0.4 : raise ? -0.2 : 0, 10, dt);
  },
  onDeath: (e, w) => {
    w.fx.chunkBurst(e.pos.x, 2, e.pos.z, 0x6a6a72, 14, 0.9, 12);
    w.fx.chunkBurst(e.pos.x, 3, e.pos.z, 0x6a2020, 8, 0.7, 10);
    w.fx.gooBurst(e.pos.x, 3, e.pos.z, [1, 0.3, 0.05], 16);
    w.fx.shake(0.6);
    audio.play('explosion', { x: e.pos.x, z: e.pos.z });
  },
};

const necro: EnemyDef = {
  id: 'necro', name: 'Crypt Cultist', hp: 170, speed: 8, radius: 1.1, height: 3.8, mass: 1.2, damage: 18, xp: 28, gold: 10,
  body: 'flesh', cost: 3, minFloor: 1, acts: [1, 2, 3], weight: 3,
  spheres: [{ y: 1.9, r: 1.1, crit: false }, { y: 3.3, r: 0.5, crit: true }],
  build: necroModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    e.cd2 -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    if (e.state === 'cast') {
      e.move(w, 0, 0, 0, dt, 6);
      e.faceTo(p.pos.x, p.pos.z, dt, 10);
      if (Math.random() < 0.6) w.fx.add.emit(e.pos.x + Math.sin(e.heading) * 0.6, 3.8, e.pos.z + Math.cos(e.heading) * 0.6, rand(-2, 2), rand(0, 3), rand(-2, 2), 0.4, 0.4, 0.1, 2, 0.6, 3, 1);
      if (e.st > 0.65 / e.speedMult) {
        const base = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        if (e.aux === 0) {
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.22;
            w.projectiles.enemyShot('orb', e.pos.x + Math.sin(a) * 1.2, 3.2, e.pos.z + Math.cos(a) * 1.2, Math.sin(a) * 22, 0, Math.cos(a) * 22, e.damage, e);
          }
        } else {
          for (let i = 0; i < 12; i++) {
            const a = base + (i / 12) * Math.PI * 2;
            w.projectiles.enemyShot('orb', e.pos.x + Math.sin(a) * 1.2, 2.2, e.pos.z + Math.cos(a) * 1.2, Math.sin(a) * 17, 0, Math.cos(a) * 17, e.damage, e);
          }
        }
        audio.play('orb', { x: e.pos.x, z: e.pos.z });
        e.cd = rand(2.6, 3.6);
        setState(e, 'hover');
      }
      return;
    }
    if (e.state === 'summon') {
      e.move(w, 0, 0, 0, dt, 6);
      if (Math.random() < 0.8) w.fx.add.emit(e.pos.x + rand(-4, 4), 0.2, e.pos.z + rand(-4, 4), 0, rand(3, 6), 0, 0.6, 0.4, 0.1, 1.8, 0.4, 3, 1, { stretch: 0.05 });
      if (e.st > 1.1) {
        for (let i = 0; i < 2; i++) {
          const a = rand(0, Math.PI * 2);
          const sx = e.pos.x + Math.cos(a) * 4, sz = e.pos.z + Math.sin(a) * 4;
          if (!w.grid.isSolidAt(sx, sz)) {
            const s = w.spawnEnemy('bonewalker', sx, sz, e.room, { summoned: true });
            if (s) s.summoned = true;
          }
        }
        e.cd2 = rand(9, 12);
        setState(e, 'hover');
      }
      return;
    }
    let dx = 0, dz = 0;
    if (!los || d > 36) {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      dx = dir.x;
      dz = dir.z;
    } else if (d < 20) {
      dx = (e.pos.x - p.pos.x) / d;
      dz = (e.pos.z - p.pos.z) / d;
    } else {
      dx = (-(p.pos.z - e.pos.z) / d) * (e.id % 2 ? 1 : -1);
      dz = ((p.pos.x - e.pos.x) / d) * (e.id % 2 ? 1 : -1);
    }
    e.move(w, dx, dz, e.def.speed, dt, 3);
    if (e.cd <= 0 && los && d < 50 && playerTargetable(w)) {
      setState(e, 'cast');
      e.aux = Math.random() < 0.35 ? 1 : 0;
    } else if (e.cd2 <= 0 && w.countSummons(e.room) < 5) setState(e, 'summon');
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    e.walkPhase += dt;
    p.float.position.y = 0.6 + Math.sin(e.walkPhase * 2 + e.id) * 0.3;
    const casting = e.state === 'cast' || e.state === 'summon';
    p.armR.rotation.x = damp(p.armR.rotation.x, casting ? -2.4 : -0.2, 8, dt);
    p.armL.rotation.x = damp(p.armL.rotation.x, casting ? -1.2 : 0, 8, dt);
    p.orb.scale.setScalar(casting ? 1.4 + Math.sin(e.st * 20) * 0.3 : 1);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 2, e.pos.z, [0.7, 0.25, 1], 30, 12);
    w.fx.chunkBurst(e.pos.x, 2, e.pos.z, 0x2a1840, 6, 0.6, 8);
    w.fx.boneBurst(e.pos.x, 1, e.pos.z, 0, 0, 4);
    audio.play('bone', { x: e.pos.x, z: e.pos.z });
  },
};

function vehicleAI(e: Enemy, w: World, dt: number, cruise: number, charge: number, burst: number, spread: number) {
  const p = w.player;
  const d = e.distTo(p.pos.x, p.pos.z);
  e.st += dt;
  e.cd -= dt;
  e.cd2 -= dt;
  let target = { x: p.pos.x, z: p.pos.z };
  if (e.state === 'charge') target = { x: e.tx, z: e.tz };
  let desired = headingOf(target.x - e.pos.x, target.z - e.pos.z);
  if (e.state !== 'charge' && !w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z)) {
    const dir = e.pathTo(w, p.pos.x, p.pos.z);
    desired = headingOf(dir.x, dir.z);
  }
  const diff = angleDiff(e.heading, desired);
  const turn = e.state === 'charge' ? 1.2 : 2.6;
  e.heading += clamp(diff, -turn * dt, turn * dt) * e.slow;
  let speed = e.state === 'charge' ? charge : Math.abs(diff) < 0.7 ? cruise : cruise * 0.45;
  if (e.state === 'backoff') speed = -cruise * 0.6;
  speed *= e.speedMult * e.slow;
  const cur = e.aux2;
  e.aux2 = damp(cur, speed, 2.5, dt);
  e.vel.x = Math.sin(e.heading) * e.aux2;
  e.vel.z = Math.cos(e.heading) * e.aux2;
  if (e.state === 'charge' && e.st > 1.3) {
    setState(e, 'drive');
    e.cd = rand(3, 5);
  }
  if (e.state === 'backoff' && e.st > 0.8) setState(e, 'drive');
  if ((e.state === 'drive' || e.state === 'idle') && d < 35 && d > 8 && Math.abs(diff) < 0.3 && e.cd <= 0 && playerTargetable(w)) {
    setState(e, 'charge');
    const L = lead(w, e, charge, 0.5);
    e.tx = L.x;
    e.tz = L.z;
    w.fx.tele.line(e.pos.x, e.pos.z, e.heading, Math.min(40, d + 8), 4, 0.5);
    audio.play('horn', { pitch: 1.4 });
  }
  // gun bursts
  if (e.cd2 <= 0 && d < 45 && Math.abs(diff) < 0.6 && playerTargetable(w)) {
    e.aux += dt;
    if (e.aux > 0.14) {
      e.aux = 0;
      e.tx2 = (e.tx2 ?? 0) + 1;
      const a = e.heading + rand(-spread, spread);
      w.projectiles.enemyShot('ebullet', e.pos.x + Math.sin(a) * 2.4, 1.9 * e.scale, e.pos.z + Math.cos(a) * 2.4, Math.sin(a) * 70, 0, Math.cos(a) * 70, e.damage * 0.3, e);
      audio.play('mg', { x: e.pos.x, z: e.pos.z, pitch: 1.3, vol: 0.6 });
      if (e.tx2 >= burst) {
        e.tx2 = 0;
        e.cd2 = rand(1.4, 2.2);
      }
    }
  }
  // contact ram
  if (d < e.radius + 2.2 && Math.abs(e.aux2) > 12 && e.ramCd <= 0) {
    e.ramCd = 1;
    w.damagePlayer(e.damage * (e.state === 'charge' ? 1.4 : 0.7), { enemy: e, x: e.pos.x, z: e.pos.z, knock: 18 });
    audio.play('ram', { x: e.pos.x, z: e.pos.z });
    setState(e, 'backoff');
  }
}

declare module './Enemy' {
  interface Enemy {
    tx2?: number;
  }
}

const buggy: EnemyDef = {
  id: 'buggy', name: 'Goblin Buggy', hp: 280, speed: 28, radius: 1.8, height: 2.4, mass: 2.2, damage: 40, xp: 30, gold: 12,
  body: 'armor', cost: 3.2, minFloor: 2, acts: [2, 3], weight: 4,
  spheres: [{ y: 1.1, r: 1.6, crit: false, fwd: 0.6 }, { y: 1.1, r: 1.6, crit: false, fwd: -0.9 }, { y: 2.1, r: 0.45, crit: true, fwd: -0.3 }],
  build: () => buggyModel(false),
  ai: (e, w, dt) => {
    e.ramCd -= dt;
    vehicleAI(e, w, dt, 26, 44, 5, 0.06);
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    e.walkPhase += e.aux2 * dt;
    for (const k of ['w0', 'w1', 'w2', 'w3']) p[k].rotation.x = e.walkPhase / 0.55;
    p.body.position.y = Math.sin(e.walkPhase * 1.5) * 0.05;
    const blink = e.state === 'charge' && Math.sin(e.st * 30) > 0;
    p.l0.visible = p.l1.visible = !blink;
  },
  onDeath: (e, w) => {
    w.explode(e.pos.x, 1, e.pos.z, 6, e.damage * 0.6, { team: 'both', element: 'fire', source: e, noDamageOwner: true });
    w.fx.chunkBurst(e.pos.x, 1.5, e.pos.z, 0x7a4a22, 12, 0.6, 12);
  },
};

const trucker: EnemyDef = {
  ...buggy,
  id: 'trucker', name: 'Skeletal Trucker', hp: 900, speed: 26, radius: 2.4, height: 3.2, mass: 5, damage: 60, xp: 80, gold: 25,
  cost: 7, minFloor: 6, acts: [3], weight: 2,
  spheres: [{ y: 1.4, r: 2.1, crit: false, fwd: 0.9 }, { y: 1.4, r: 2.1, crit: false, fwd: -1.2 }, { y: 2.9, r: 0.5, crit: true, fwd: -0.4 }],
  build: () => buggyModel(true),
  noRam: true,
  ai: (e, w, dt) => {
    e.ramCd -= dt;
    vehicleAI(e, w, dt, 24, 48, 8, 0.12);
  },
};

const mimic: EnemyDef = {
  id: 'mimic', name: 'Mimic', hp: 420, speed: 15, radius: 1.4, height: 2.2, mass: 1.8, damage: 45, xp: 60, gold: 60,
  body: 'flesh', cost: 99, minFloor: 0, acts: [1, 2, 3], weight: 0,
  spheres: [{ y: 0.8, r: 1.3, crit: false }, { y: 1.3, r: 0.6, crit: true, fwd: 0.2 }],
  build: mimicModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    switch (e.state) {
      case 'idle':
      case 'disguised':
        e.state = 'disguised';
        e.move(w, 0, 0, 0, dt);
        if (d < 7 || e.hp < e.maxHp) {
          setState(e, 'reveal');
          audio.play('chomp', { x: e.pos.x, z: e.pos.z });
          w.say('mimic');
        }
        break;
      case 'reveal':
        e.faceTo(p.pos.x, p.pos.z, dt, 6);
        if (e.st > 0.7) setState(e, 'hop');
        break;
      case 'hop': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        const phase = (e.st % 0.65) / 0.65;
        e.move(w, dir.x, dir.z, phase < 0.6 ? e.def.speed * 1.4 : 0, dt, 10);
        e.y = Math.sin(Math.min(1, phase / 0.6) * Math.PI) * 1.4;
        if (d < 4.2 && phase > 0.6) {
          setState(e, 'bite');
          e.y = 0;
        }
        break;
      }
      case 'bite':
        e.move(w, 0, 0, 0, dt);
        e.faceTo(p.pos.x, p.pos.z, dt, 12);
        if (e.aux === 0 && e.st > 0.3) {
          e.aux = 1;
          audio.play('chomp', { x: e.pos.x, z: e.pos.z });
          if (d < 5) w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 0.7) {
          e.aux = 0;
          setState(e, 'hop');
        }
        break;
    }
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    const open = e.state === 'disguised' ? 0 : e.state === 'bite' ? (e.st < 0.3 ? 1.1 : 0.1) : 0.5 + Math.sin(e.st * 10) * 0.25;
    p.lid.rotation.x = damp(p.lid.rotation.x, -open, 14, dt);
    p.tongue.visible = e.state !== 'disguised';
    p.e0.visible = p.e1.visible = e.state !== 'disguised';
  },
  onDeath: (e, w) => {
    w.fx.chunkBurst(e.pos.x, 1, e.pos.z, 0x7a4a22, 12, 0.6, 10);
    w.fx.chunkBurst(e.pos.x, 1, e.pos.z, 0xe0aa2a, 6, 0.4, 10);
    audio.play('splat', { x: e.pos.x, z: e.pos.z });
  },
};

const sentry: EnemyDef = {
  id: 'sentry', name: 'Crystal Sentry', hp: 230, speed: 0, radius: 1.6, height: 4.2, mass: 99, damage: 20, xp: 26, gold: 9,
  body: 'armor', cost: 2.5, minFloor: 3, acts: [2], weight: 4, stationary: true, noRam: true,
  spheres: [{ y: 1.0, r: 1.5, crit: false }, { y: 2.6, r: 1.1, crit: true }],
  build: sentryModel,
  ai: (e, w, dt) => {
    const p = w.player;
    e.st += dt;
    e.cd -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    e.faceTo(p.pos.x, p.pos.z, dt, 3);
    if (e.state === 'charge') {
      if (e.st > 0.8 && e.aux < 3 && e.st > 0.8 + e.aux * 0.16) {
        const L = lead(w, e, 50, 0.5);
        const a = headingOf(L.x - e.pos.x, L.z - e.pos.z) + rand(-0.05, 0.05);
        w.projectiles.enemyShot('shard', e.pos.x + Math.sin(a) * 1.5, 2.6, e.pos.z + Math.cos(a) * 1.5, Math.sin(a) * 50, 0, Math.cos(a) * 50, e.damage, e);
        audio.play('laserZap', { x: e.pos.x, z: e.pos.z, pitch: 1.5 });
        e.aux++;
      }
      if (e.aux >= 3) {
        e.aux = 0;
        setState(e, 'idle');
        e.cd = rand(2.2, 3);
      }
      return;
    }
    if (e.cd <= 0 && los && e.distTo(p.pos.x, p.pos.z) < 60 && playerTargetable(w)) setState(e, 'charge');
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    p.spin.rotation.y += dt * (e.state === 'charge' ? 6 : 1);
    p.crystal.scale.set(0.8, 1.7, 0.8).multiplyScalar(e.state === 'charge' ? 1 + Math.min(0.3, e.st * 0.4) : 1);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 2.5, e.pos.z, [0.7, 0.3, 1], 30, 14);
    w.fx.chunkBurst(e.pos.x, 2.5, e.pos.z, 0xb44cff, 10, 0.5, 12);
    audio.play('shatter', { x: e.pos.x, z: e.pos.z });
  },
};

const wraith: EnemyDef = {
  id: 'wraith', name: 'Toll Wraith', hp: 130, speed: 13, radius: 1.1, height: 4, mass: 0.6, damage: 22, xp: 24, gold: 8,
  body: 'spirit', flying: true, cost: 2.4, minFloor: 4, acts: [2, 3], weight: 4,
  spheres: [{ y: 2.0, r: 1.1, crit: false }, { y: 3.3, r: 0.48, crit: true }],
  build: wraithModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    if (e.state === 'cast') {
      e.move(w, 0, 0, 0, dt, 5);
      e.faceTo(p.pos.x, p.pos.z, dt, 8);
      if (e.st > 0.6) {
        const a = e.heading;
        w.projectiles.enemyShot('skull', e.pos.x + Math.sin(a) * 1.4, 3.1, e.pos.z + Math.cos(a) * 1.4, Math.sin(a) * 18, 0, Math.cos(a) * 18, e.damage, e, { homing: 2.2, life: 4.5 });
        audio.play('orb', { x: e.pos.x, z: e.pos.z, pitch: 0.7 });
        e.cd = rand(2.6, 3.8);
        setState(e, 'orbit');
      }
      return;
    }
    if (e.state === 'dash') {
      if (e.aux === 0 && d < 3) {
        e.aux = 1;
        w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
      }
      if (e.st > 0.7) {
        e.aux = 0;
        setState(e, 'orbit');
      }
      return;
    }
    e.aux2 += dt * (e.id % 2 ? 0.5 : -0.5);
    const ox = p.pos.x + Math.cos(e.aux2) * 18, oz = p.pos.z + Math.sin(e.aux2) * 18;
    const dir = e.pathTo(w, ox, oz);
    e.move(w, dir.x, dir.z, e.def.speed, dt, 3, false);
    e.faceTo(p.pos.x, p.pos.z, dt, 5);
    if (e.cd <= 0 && playerTargetable(w)) {
      if (d < 14 && Math.random() < 0.4) {
        setState(e, 'dash');
        const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        e.vel.set((dx / dl) * 34, 0, (dz / dl) * 34);
        e.cd = 2;
      } else if (w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z)) setState(e, 'cast');
    }
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    e.walkPhase += dt;
    p.float.position.y = 1.4 + Math.sin(e.walkPhase * 2.4 + e.id) * 0.35;
    p.float.rotation.x = e.state === 'dash' ? 0.5 : Math.sin(e.walkPhase) * 0.08;
    const cast = e.state === 'cast';
    p.armL.rotation.x = damp(p.armL.rotation.x, cast ? -1.6 : -0.3 + Math.sin(e.walkPhase * 2) * 0.2, 6, dt);
    p.armR.rotation.x = damp(p.armR.rotation.x, cast ? -1.6 : -0.3 - Math.sin(e.walkPhase * 2) * 0.2, 6, dt);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 2.5, e.pos.z, [0.25, 1, 0.8], 30, 10);
    w.fx.boneBurst(e.pos.x, 3, e.pos.z, 0, 0, 3);
    audio.play('shatter', { x: e.pos.x, z: e.pos.z, pitch: 0.6 });
  },
};

const imp: EnemyDef = {
  id: 'imp', name: 'Magma Imp', hp: 85, speed: 14, radius: 0.9, height: 2.8, mass: 0.6, damage: 30, xp: 16, gold: 5,
  body: 'flesh', cost: 1.6, minFloor: 5, acts: [3], weight: 7,
  spheres: [{ y: 1.4, r: 0.8, crit: false }, { y: 2.3, r: 0.45, crit: true }],
  build: impModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    if (e.state === 'throw') {
      e.move(w, 0, 0, 0, dt, 8);
      const L = lead(w, e, 25, 1);
      e.faceTo(L.x, L.z, dt, 10);
      if (e.st > 0.6) {
        w.projectiles.lob('fireball', e.pos.x, 2.5, e.pos.z, L.x, L.z, 0.95, e.damage, e, 3.5);
        w.fx.tele.circle(L.x, L.z, 3.5, 0.95, 0xff6020);
        audio.play('fireball', { x: e.pos.x, z: e.pos.z });
        e.cd = rand(2.2, 3.2);
        setState(e, 'move');
      }
      return;
    }
    let dx = 0, dz = 0;
    if (d > 30 || !los) {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      dx = dir.x;
      dz = dir.z;
    } else if (d < 14) {
      dx = (e.pos.x - p.pos.x) / d;
      dz = (e.pos.z - p.pos.z) / d;
    } else {
      const sgn = e.id % 2 ? 1 : -1;
      dx = (-(p.pos.z - e.pos.z) / d) * sgn;
      dz = ((p.pos.x - e.pos.x) / d) * sgn;
    }
    e.move(w, dx, dz, e.def.speed, dt);
    if (e.cd <= 0 && los && d < 40 && playerTargetable(w)) setState(e, 'throw');
  },
  anim: (e, dt) => {
    bipedWalk(e, dt, 2, 0.7);
    const p = e.visual.parts;
    p.wingL.rotation.y = Math.sin(e.walkPhase * 4 + 1) * 0.5 + 0.3;
    p.wingR.rotation.y = -Math.sin(e.walkPhase * 4 + 1) * 0.5 - 0.3;
    p.armR.rotation.x = damp(p.armR.rotation.x, e.state === 'throw' ? -2.6 : -0.4, 10, dt);
    p.ball.visible = e.state === 'throw' || e.cd < 1;
  },
  onDeath: (e, w) => {
    w.explode(e.pos.x, 1, e.pos.z, 4, e.damage * 0.4, { team: 'enemy', element: 'fire', source: e, noDamageOwner: true });
    w.fx.gooBurst(e.pos.x, 1.5, e.pos.z, [1, 0.4, 0.05], 10);
  },
};

export const ENEMIES: Record<string, EnemyDef> = {
  bonewalker, boneknight, bonearcher, hellhound, bomber: goblinBomber, brute, necro, buggy, trucker, mimic, sentry, wraith, imp,
};

export function spawnTable(act: number, floor: number): [EnemyDef, number][] {
  return Object.values(ENEMIES)
    .filter((d) => d.weight > 0 && d.acts.includes(act) && d.minFloor <= floor)
    .map((d) => [d, d.weight] as [EnemyDef, number]);
}
