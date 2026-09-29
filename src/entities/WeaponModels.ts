import * as THREE from 'three';
import { toon, glow } from '../render/Toon';
import { RARITY, type Item, type WeaponType } from '../loot/Items';
import { ELEMENT_HEX } from '../fx/FX';

export interface WeaponModel {
  root: THREE.Group; // yaw pivot (for turrets) / mount
  pitch: THREE.Group; // pitch pivot
  muzzles: THREE.Object3D[];
  spinner: THREE.Object3D | null;
  glowMat: THREE.MeshBasicMaterial | null;
}

const MAKER_COLORS: Record<string, [number, number]> = {
  Grimjaw: [0x5a1418, 0x1a1a1e],
  Hexworks: [0x1a5a60, 0x3a1a5a],
  'Ratchet & Sons': [0xc8a020, 0x4a3018],
  Kingsforge: [0xe8e4da, 0xc89a2a],
  Bonecraft: [0xe0d6b8, 0x3a2a2a],
};

function mk(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (r: number, len: number, seg = 10) => {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
};

/** Build a weapon model. Local +Z is the firing direction. */
export function buildWeapon(item: Item, mirrored = false): WeaponModel {
  const root = new THREE.Group();
  const pitch = new THREE.Group();
  root.add(pitch);
  const [c1, c2] = MAKER_COLORS[item.maker ?? 'Ratchet & Sons'] ?? [0x555555, 0x222222];
  const body = toon(c1);
  const dark = toon(c2);
  const metal = toon(0x3a3c44);
  const barrelMat = toon(0x26272c);
  const accentHex = item.element !== 'none' ? ELEMENT_HEX[item.element] : RARITY[item.rarity].color;
  const glowMat = glow(accentHex, item.rarity >= 3 ? 3 : 2).clone();
  const muzzles: THREE.Object3D[] = [];
  let spinner: THREE.Object3D | null = null;
  const addMuzzle = (x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    pitch.add(o);
    muzzles.push(o);
  };
  const P = (m: THREE.Object3D) => {
    pitch.add(m);
    return m;
  };
  const t: WeaponType = item.wtype ?? 'mg';
  const twin = item.variant % 2 === 1 || item.name.includes('Twin');
  switch (t) {
    case 'mg': {
      P(mk(B(0.5, 0.42, 0.9), body, 0, 0.25, 0));
      P(mk(B(0.52, 0.12, 0.6), dark, 0, 0.5, -0.1));
      P(mk(B(0.2, 0.3, 0.4), metal, 0.35, 0.2, -0.1));
      const xs = twin ? [-0.13, 0.13] : [0];
      for (const x of xs) {
        P(mk(C(0.075, 1.2), barrelMat, x, 0.28, 0.95));
        P(mk(C(0.11, 0.28), metal, x, 0.28, 0.5));
        P(mk(C(0.1, 0.12), dark, x, 0.28, 1.5));
        addMuzzle(x, 0.28, 1.6);
      }
      P(mk(B(0.08, 0.06, 0.5), glowMat, 0, 0.47, 0.1));
      break;
    }
    case 'minigun': {
      P(mk(B(0.6, 0.5, 0.8), body, 0, 0.28, -0.1));
      P(mk(C(0.3, 0.3), dark, 0, 0.28, 0.4));
      const spin = new THREE.Group();
      spin.position.set(0, 0.28, 0.55);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spin.add(mk(C(0.06, 1.3), barrelMat, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.65));
      }
      spin.add(mk(C(0.26, 0.08), metal, 0, 0, 1.1));
      spin.add(mk(C(0.26, 0.08), metal, 0, 0, 0.35));
      pitch.add(spin);
      spinner = spin;
      addMuzzle(0, 0.28, 1.95);
      P(mk(B(0.4, 0.5, 0.5), metal, 0.45, 0.2, -0.2));
      P(mk(B(0.62, 0.06, 0.6), glowMat, 0, 0.55, -0.1));
      break;
    }
    case 'cannon': {
      P(mk(B(0.8, 0.6, 1.0), body, 0, 0.32, -0.2));
      P(mk(B(0.9, 0.18, 0.7), dark, 0, 0.68, -0.25));
      const xs = twin ? [-0.22, 0.22] : [0];
      for (const x of xs) {
        const r = twin ? 0.13 : 0.19;
        P(mk(C(r, 1.8), barrelMat, x, 0.35, 1.0));
        P(mk(C(r * 1.45, 0.35), dark, x, 0.35, 1.85));
        P(mk(C(r * 1.2, 0.2), metal, x, 0.35, 0.35));
        addMuzzle(x, 0.35, 2.05);
      }
      P(mk(B(0.08, 0.3, 0.8), glowMat, 0.42, 0.35, -0.2));
      break;
    }
    case 'shotgun': {
      P(mk(B(0.6, 0.45, 0.8), body, 0, 0.26, -0.1));
      P(mk(B(0.66, 0.14, 0.9), toon(0x6a4226), 0, 0.02, -0.15));
      for (const x of [-0.13, 0.13]) {
        P(mk(C(0.12, 1.15), barrelMat, x, 0.3, 0.85));
        addMuzzle(x, 0.3, 1.45);
      }
      P(mk(B(0.5, 0.08, 0.9), glowMat, 0, 0.52, 0.2));
      break;
    }
    case 'laser': {
      P(mk(B(0.55, 0.45, 0.9), body, 0, 0.26, -0.1));
      const core = mk(new THREE.OctahedronGeometry(0.22), glowMat, 0, 0.62, -0.15);
      P(core);
      P(mk(C(0.1, 1.3), metal, 0, 0.28, 0.9));
      for (let i = 0; i < 4; i++) P(mk(new THREE.TorusGeometry(0.17, 0.04, 6, 14), i % 2 ? glowMat : dark, 0, 0.28, 0.45 + i * 0.28));
      P(mk(new THREE.ConeGeometry(0.16, 0.3, 8), dark, 0, 0.28, 1.6, Math.PI / 2));
      addMuzzle(0, 0.28, 1.72);
      spinner = core;
      break;
    }
    case 'flamer': {
      P(mk(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12), body, 0.3, 0.45, -0.35));
      P(mk(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 12), dark, -0.25, 0.4, -0.35));
      P(mk(B(0.5, 0.35, 0.6), metal, 0, 0.25, 0.2));
      P(mk(C(0.11, 0.9), barrelMat, 0, 0.3, 0.8));
      P(mk(new THREE.ConeGeometry(0.2, 0.35, 8), dark, 0, 0.3, 1.35, -Math.PI / 2));
      P(mk(new THREE.SphereGeometry(0.07, 6, 5), glow(0x40a0ff, 3), 0, 0.18, 1.35));
      addMuzzle(0, 0.3, 1.5);
      break;
    }
    case 'tesla': {
      P(mk(new THREE.CylinderGeometry(0.4, 0.5, 0.35, 12), dark, 0, 0.18, 0));
      P(mk(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8), metal, 0, 0.8, 0));
      for (let i = 0; i < 4; i++) {
        const r = mk(new THREE.TorusGeometry(0.38 - i * 0.06, 0.05, 6, 16), i % 2 ? body : glowMat, 0, 0.45 + i * 0.25, 0, Math.PI / 2);
        P(r);
      }
      const orb = mk(new THREE.SphereGeometry(0.26, 12, 10), glowMat, 0, 1.45, 0);
      P(orb);
      addMuzzle(0, 1.45, 0.1);
      spinner = orb;
      break;
    }
    case 'rail': {
      P(mk(B(0.55, 0.5, 1.0), body, 0, 0.26, -0.25));
      for (const x of [-0.15, 0.15]) P(mk(B(0.08, 0.2, 2.1), metal, x, 0.3, 0.85));
      for (let i = 0; i < 5; i++) P(mk(B(0.2, 0.12, 0.1), glowMat, 0, 0.3, 0.1 + i * 0.4));
      P(mk(B(0.5, 0.1, 0.3), dark, 0, 0.3, 1.9));
      addMuzzle(0, 0.3, 2.0);
      break;
    }
    case 'rocket': {
      const big = item.special === 'bigRocket';
      const n = big ? 1 : 2;
      const w = big ? 0.75 : 0.62, h = big ? 0.75 : 0.62;
      P(mk(B(w, h, 1.1), body, 0, h / 2, 0));
      P(mk(B(w + 0.06, 0.1, 1.14), dark, 0, h + 0.03, 0));
      const rr = big ? 0.28 : 0.12;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = n === 1 ? 0 : (i - 0.5) * 0.28, y = n === 1 ? h / 2 : h / 2 + (j - 0.5) * 0.28;
        P(mk(C(rr, 0.1), toon(0x111111), x, y, 0.56));
        P(mk(new THREE.ConeGeometry(rr * 0.9, rr * 2, 8), toon(0xd02020), x, y, 0.5, Math.PI / 2));
        addMuzzle(x, y, 0.62);
      }
      P(mk(B(0.06, 0.12, 0.8), glowMat, (mirrored ? -1 : 1) * (w / 2 + 0.02), h * 0.5, 0));
      break;
    }
    case 'swarm': {
      P(mk(B(0.7, 0.62, 0.9), body, 0, 0.31, 0));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = (i - 1) * 0.2, y = 0.31 + (j - 1) * 0.18;
        P(mk(C(0.07, 0.1), toon(0x111111), x, y, 0.46));
        addMuzzle(x, y, 0.5);
      }
      P(mk(B(0.74, 0.06, 0.94), glowMat, 0, 0.64, 0));
      break;
    }
    case 'mortar': {
      P(mk(B(0.7, 0.3, 0.7), dark, 0, 0.15, 0));
      const tube = new THREE.Group();
      tube.rotation.x = -0.9;
      tube.position.set(0, 0.35, 0);
      tube.add(mk(C(0.24, 1.0), body, 0, 0, 0.35));
      tube.add(mk(C(0.29, 0.14), metal, 0, 0, 0.82));
      tube.add(mk(C(0.29, 0.08), glowMat, 0, 0, 0.1));
      pitch.add(tube);
      const mz = new THREE.Object3D();
      mz.position.set(0, 0, 0.9);
      tube.add(mz);
      muzzles.push(mz);
      break;
    }
    case 'saw': {
      P(mk(B(0.55, 0.3, 0.9), body, 0, 0.18, -0.1));
      const blade = new THREE.Group();
      blade.position.set(0, 0.4, 0.2);
      const disc = mk(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), toon(0xc8ccd6), 0, 0, 0);
      blade.add(disc);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        blade.add(mk(new THREE.ConeGeometry(0.07, 0.16, 4), toon(0xc8ccd6), Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46, 0, -a, Math.PI / 2));
      }
      blade.add(mk(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), glowMat));
      pitch.add(blade);
      spinner = blade;
      addMuzzle(0, 0.4, 0.8);
      break;
    }
  }
  if (item.rarity >= 4) {
    // legendary flair: glowing crown fin
    const fin = mk(new THREE.ConeGeometry(0.1, 0.35, 4), glow(RARITY[4].color, 3), 0, t === 'tesla' ? 0.3 : 0.75, -0.3);
    pitch.add(fin);
  }
  return { root, pitch, muzzles, spinner, glowMat };
}

/** Small preview model for a non-weapon item (used for ground loot). */
export function buildItemIcon3D(item: Item): THREE.Object3D {
  if (item.slot === 'main' || item.slot === 'side') {
    const w = buildWeapon(item);
    w.root.scale.setScalar(0.9);
    return w.root;
  }
  const g = new THREE.Group();
  const col = RARITY[item.rarity].color;
  const main = toon(0x3a3a44);
  const accent = toon(0x222222, { emissive: col, emissiveIntensity: 1.6 });
  switch (item.slot) {
    case 'engine': {
      g.add(mk(B(0.9, 0.6, 1.1), main, 0, 0.3, 0));
      for (const x of [-0.25, 0.25]) g.add(mk(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), toon(0xc8ccd6), x, 0.8, 0));
      g.add(mk(B(0.95, 0.1, 0.4), accent, 0, 0.62, 0.3));
      break;
    }
    case 'wheels': {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 16), toon(0x19191c));
      t.rotation.z = Math.PI / 2;
      t.position.y = 0.6;
      g.add(t);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12), accent);
      r.rotation.z = Math.PI / 2;
      r.position.y = 0.6;
      g.add(r);
      break;
    }
    case 'shield': {
      g.add(mk(B(0.8, 0.5, 0.8), main, 0, 0.25, 0));
      g.add(mk(new THREE.SphereGeometry(0.38, 12, 10), glow(col, 2.2), 0, 0.75, 0));
      break;
    }
    case 'plow': {
      g.add(mk(B(1.2, 0.5, 0.3), main, 0, 0.35, 0));
      for (let i = 0; i < 3; i++) g.add(mk(new THREE.ConeGeometry(0.12, 0.5, 6), accent, (i - 1) * 0.4, 0.35, 0.35, Math.PI / 2));
      break;
    }
    case 'gadget': {
      g.add(mk(new THREE.CylinderGeometry(0.4, 0.45, 0.6, 10), main, 0, 0.3, 0));
      g.add(mk(new THREE.TorusGeometry(0.42, 0.06, 6, 16), accent, 0, 0.62, 0, Math.PI / 2));
      g.add(mk(new THREE.SphereGeometry(0.18, 8, 6), glow(col, 2.5), 0, 0.72, 0));
      break;
    }
  }
  return g;
}
