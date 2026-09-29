import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glow, paintToon, metalToon } from '../render/Toon';
import { RARITY, type Item, type WeaponType } from '../loot/Items';
import { ELEMENT_HEX } from '../fx/FX';
import { bevBox, cone, rivets, bakeStatic } from './CarKit';
import { buildWheel, buildPlow } from './CarModels';

export interface WeaponModel {
  root: THREE.Group; // yaw pivot (for turrets) / mount
  pitch: THREE.Group; // pitch pivot
  muzzles: THREE.Object3D[];
  spinner: THREE.Object3D | null;
  glowMat: THREE.MeshBasicMaterial | null;
}

const MAKER_COLORS: Record<string, [number, number]> = {
  Grimjaw: [0x8a1a22, 0x1a1a1e],
  Hexworks: [0x1f7a86, 0x3a1a5a],
  'Ratchet & Sons': [0xd0a428, 0x4a3018],
  Kingsforge: [0xdedad0, 0xc89a2a],
  Bonecraft: [0xe0d6b8, 0x3a2a2a],
};

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** cylinder along +Z starting at z0 */
const rod = (r: number, len: number, seg = 10, r2 = r) => {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
};
const tor = (r: number, t: number, seg = 14) => new THREE.TorusGeometry(r, t, 6, seg);

/** Build a weapon model. Local +Z is the firing direction. */
export function buildWeapon(item: Item, mirrored = false): WeaponModel {
  const root = new THREE.Group();
  const pitch = new THREE.Group();
  root.add(pitch);
  const [c1, c2] = MAKER_COLORS[item.maker ?? 'Ratchet & Sons'] ?? [0x555555, 0x222222];
  const accentHex = item.element !== 'none' ? ELEMENT_HEX[item.element] : RARITY[item.rarity].color;
  const body = paintToon(c1, { refl: 0.5, spec: 0.982, specStrength: 0.9, rim: 0xffc8a0, rimStrength: 0.3 });
  const dark = metalToon(c2);
  const steel = metalToon(0x8a90a0);
  const gun = metalToon(0x2a2c35);
  const chrome = metalToon(0xe4ebfa, { refl: 1, spec: 0.958 });
  const brass = metalToon(0xc89a3a, { refl: 0.7 });
  const trim = item.rarity >= 3 ? metalToon(0xe8b030, { refl: 0.75 }) : steel;
  const glowMat = glow(accentHex, item.rarity >= 3 ? 3 : 2).clone();
  const muzzles: THREE.Object3D[] = [];
  let spinner: THREE.Object3D | null = null;
  const addMuzzle = (x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    pitch.add(o);
    muzzles.push(o);
  };
  const P = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = pitch) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const vents = (x: number, y: number, z0: number, n: number, w: number, vertical = false) => {
    for (let i = 0; i < n; i++) P(vertical ? B(0.02, w, 0.05) : B(w, 0.02, 0.05), dark, x, y, z0 + i * 0.08).castShadow = false;
  };
  const bolts = (pts: [number, number, number][]) => P(rivets(pts, 0.024), chrome);
  const brake = (x: number, y: number, z: number, r: number) => {
    P(rod(r * 1.35, 0.3, 10), dark, x, y, z);
    for (const s of [-1, 1]) P(B(0.05, r * 0.7, 0.16), gun, x + s * r * 1.3, y, z);
    P(tor(r * 1.36, 0.04, 12), trim, x, y, z - 0.14);
  };
  const t: WeaponType = item.wtype ?? 'mg';
  const twin = item.variant % 2 === 1 || item.name.includes('Twin');
  // universal mount plate
  P(new THREE.CylinderGeometry(0.34, 0.4, 0.1, 12), gun, 0, 0.03, 0);
  switch (t) {
    case 'mg': {
      P(bevBox(0.52, 0.42, 0.95, 0.05), body, 0, 0.25, 0);
      P(bevBox(0.5, 0.1, 0.6, 0.03), dark, 0, 0.5, -0.1);
      P(bevBox(0.16, 0.16, 0.24, 0.03), gun, 0.0, 0.62, 0.15);
      P(B(0.1, 0.08, 0.02), glowMat, 0, 0.64, 0.28).castShadow = false;
      P(bevBox(0.26, 0.34, 0.4, 0.04), dark, 0.42, 0.18, -0.1);
      for (let i = 0; i < 7; i++) P(B(0.05, 0.05, 0.05), brass, 0.28 - i * 0.02, 0.3 + i * 0.03, 0.08 - i * 0.04);
      vents(0.27, 0.3, -0.25, 4, 0.16, true);
      const xs = twin ? [-0.15, 0.15] : [0];
      for (const x of xs) {
        P(rod(0.075, 1.2), gun, x, 0.28, 0.95);
        P(rod(0.14, 0.62, 10), steel, x, 0.28, 0.66);
        for (let i = 0; i < 4; i++) P(B(0.3, 0.02, 0.02), dark, x, 0.28, 0.44 + i * 0.13).castShadow = false;
        brake(x, 0.28, 1.5, 0.075);
        addMuzzle(x, 0.28, 1.68);
      }
      P(B(0.08, 0.05, 0.6), glowMat, 0, 0.475, 0.12).castShadow = false;
      bolts([[-0.24, 0.42, 0.42], [0.24, 0.42, 0.42], [-0.24, 0.42, -0.4], [0.24, 0.42, -0.4]]);
      break;
    }
    case 'minigun': {
      P(bevBox(0.62, 0.52, 0.82, 0.05), body, 0, 0.28, -0.1);
      P(rod(0.34, 0.34, 14), dark, 0, 0.28, 0.42);
      // ammo drum with belt feed
      P(new THREE.CylinderGeometry(0.26, 0.26, 0.4, 14).rotateZ(Math.PI / 2), dark, 0.5, 0.2, -0.24);
      P(tor(0.27, 0.03, 14).rotateY(Math.PI / 2), trim, 0.72, 0.2, -0.24);
      for (let i = 0; i < 6; i++) P(B(0.05, 0.05, 0.05), brass, 0.36 - i * 0.02, 0.4 + i * 0.03, -0.1 + i * 0.05);
      // cooling fins behind the motor
      for (let i = 0; i < 5; i++) P(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 14).rotateX(Math.PI / 2), steel, 0, 0.3, -0.56 - i * 0.06);
      const spin = new THREE.Group();
      spin.position.set(0, 0.28, 0.55);
      spin.userData.keep = true;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P(rod(0.06, 1.3), gun, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.65, 0, 0, 0, spin);
      }
      P(rod(0.27, 0.07, 14), trim, 0, 0, 1.15, 0, 0, 0, spin);
      P(rod(0.27, 0.07, 14), steel, 0, 0, 0.7, 0, 0, 0, spin);
      P(rod(0.27, 0.07, 14), steel, 0, 0, 0.35, 0, 0, 0, spin);
      pitch.add(spin);
      spinner = spin;
      addMuzzle(0, 0.28, 1.95);
      P(B(0.66, 0.05, 0.6), glowMat, 0, 0.56, -0.1).castShadow = false;
      vents(-0.32, 0.3, -0.3, 4, 0.2, true);
      break;
    }
    case 'cannon': {
      P(bevBox(0.86, 0.62, 1.0, 0.06), body, 0, 0.32, -0.2);
      P(bevBox(0.92, 0.18, 0.72, 0.04), dark, 0, 0.68, -0.25);
      P(bevBox(0.6, 0.42, 0.26, 0.04), gun, 0, 0.3, -0.78);
      const xs = twin ? [-0.24, 0.24] : [0];
      for (const x of xs) {
        const r = twin ? 0.13 : 0.19;
        P(rod(r, 1.8), gun, x, 0.35, 1.0);
        P(rod(r * 1.5, 0.5, 12), steel, x, 0.35, 0.5);
        for (let i = 0; i < 3; i++) P(tor(r * 1.18, 0.035, 14), trim, x, 0.35, 0.9 + i * 0.42);
        // recoil hydraulics
        P(rod(0.04, 0.9, 6), chrome, x + r * 0.9, 0.35 + r * 1.05, 0.6);
        P(rod(0.06, 0.5, 6), dark, x + r * 0.9, 0.35 + r * 1.05, 0.3);
        brake(x, 0.35, 1.88, r);
        addMuzzle(x, 0.35, 2.08);
      }
      P(B(0.08, 0.3, 0.8), glowMat, 0.44, 0.35, -0.2).castShadow = false;
      P(B(0.08, 0.3, 0.8), glowMat, -0.44, 0.35, -0.2).castShadow = false;
      bolts([[-0.4, 0.62, 0.2], [0.4, 0.62, 0.2], [-0.4, 0.62, -0.6], [0.4, 0.62, -0.6], [-0.44, 0.15, 0.25], [0.44, 0.15, 0.25]]);
      break;
    }
    case 'shotgun': {
      P(bevBox(0.6, 0.46, 0.8, 0.05), body, 0, 0.26, -0.1);
      P(bevBox(0.3, 0.2, 0.7, 0.04), paintToon(0x6a4226, { refl: 0.15, spec: 0.99 }), 0, 0.02, 0.35);
      for (const x of [-0.14, 0.14]) {
        P(rod(0.12, 1.15), gun, x, 0.3, 0.85);
        P(rod(0.17, 0.2, 12, 0.13), steel, x, 0.3, 1.48);
        P(tor(0.13, 0.03, 12), trim, x, 0.3, 0.6);
      }
      P(B(0.42, 0.06, 0.05), dark, 0, 0.42, 1.0);
      P(B(0.5, 0.06, 0.9), glowMat, 0, 0.51, 0.2).castShadow = false;
      vents(0.31, 0.3, -0.3, 4, 0.18, true);
      bolts([[-0.26, 0.48, -0.3], [0.26, 0.48, -0.3], [-0.26, 0.48, 0.1], [0.26, 0.48, 0.1]]);
      addMuzzle(-0.14, 0.3, 1.55);
      addMuzzle(0.14, 0.3, 1.55);
      break;
    }
    case 'laser': {
      P(bevBox(0.56, 0.46, 0.9, 0.05), body, 0, 0.26, -0.1);
      const core = P(new THREE.OctahedronGeometry(0.22), glowMat, 0, 0.66, -0.15);
      P(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), steel, 0.2, 0.52, -0.15);
      P(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), steel, -0.2, 0.52, -0.15);
      P(rod(0.1, 1.3), steel, 0, 0.28, 0.9);
      for (let i = 0; i < 4; i++) P(tor(0.17, 0.04, 14), i % 2 ? glowMat : dark, 0, 0.28, 0.45 + i * 0.28);
      for (let i = 0; i < 5; i++) P(B(0.44, 0.02, 0.1), steel, 0, 0.52, -0.35 + i * 0.09);
      P(new THREE.ConeGeometry(0.16, 0.3, 8).rotateX(Math.PI / 2), dark, 0, 0.28, 1.62);
      P(new THREE.OctahedronGeometry(0.08), glowMat, 0, 0.28, 1.82);
      addMuzzle(0, 0.28, 1.86);
      spinner = core;
      break;
    }
    case 'flamer': {
      P(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12), body, 0.3, 0.45, -0.35);
      P(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 12), dark, -0.25, 0.4, -0.35);
      for (const y of [0.15, 0.75]) P(tor(0.29, 0.03, 12).rotateX(Math.PI / 2), trim, 0.3, y, -0.35);
      P(bevBox(0.5, 0.35, 0.6, 0.04), gun, 0, 0.25, 0.2);
      P(rod(0.11, 0.9), steel, 0, 0.3, 0.8);
      P(new THREE.ConeGeometry(0.2, 0.35, 8).rotateX(-Math.PI / 2), dark, 0, 0.3, 1.35);
      P(new THREE.SphereGeometry(0.07, 6, 5), glow(0x40a0ff, 3), 0, 0.18, 1.35);
      P(rod(0.03, 0.9, 5), brass, 0, 0.44, 0.5);
      addMuzzle(0, 0.3, 1.5);
      break;
    }
    case 'tesla': {
      P(new THREE.CylinderGeometry(0.4, 0.5, 0.35, 12), dark, 0, 0.18, 0);
      P(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8), steel, 0, 0.8, 0);
      for (let i = 0; i < 4; i++) P(tor(0.38 - i * 0.06, 0.05, 16).rotateX(Math.PI / 2), i % 2 ? body : glowMat, 0, 0.45 + i * 0.25, 0);
      const orb = P(new THREE.SphereGeometry(0.26, 12, 10), glowMat, 0, 1.45, 0);
      for (let i = 0; i < 4; i++) P(B(0.04, 0.5, 0.04), chrome, Math.cos(i * 1.57) * 0.3, 0.6, Math.sin(i * 1.57) * 0.3);
      addMuzzle(0, 1.45, 0.1);
      spinner = orb;
      break;
    }
    case 'rail': {
      P(bevBox(0.58, 0.5, 1.0, 0.05), body, 0, 0.26, -0.25);
      for (const x of [-0.15, 0.15]) P(bevBox(0.09, 0.22, 2.1, 0.02), steel, x, 0.3, 0.85);
      for (let i = 0; i < 5; i++) P(B(0.42, 0.1, 0.1), glowMat, 0, 0.3, 0.1 + i * 0.4).castShadow = false;
      P(bevBox(0.5, 0.12, 0.3, 0.03), dark, 0, 0.3, 1.9);
      P(bevBox(0.4, 0.4, 0.4, 0.04), gun, 0, 0.6, -0.5);
      P(new THREE.OctahedronGeometry(0.1), glowMat, 0, 0.62, -0.5);
      addMuzzle(0, 0.3, 2.0);
      break;
    }
    case 'rocket': {
      const big = item.special === 'bigRocket';
      const n = big ? 1 : 2;
      const w = big ? 0.78 : 0.66, h = big ? 0.78 : 0.66;
      P(bevBox(w, h, 1.1, 0.05), body, 0, h / 2, 0);
      P(bevBox(w + 0.06, 0.1, 1.14, 0.03), dark, 0, h + 0.03, 0);
      const rr = big ? 0.28 : 0.13;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = n === 1 ? 0 : (i - 0.5) * 0.3, y = n === 1 ? h / 2 : h / 2 + (j - 0.5) * 0.3;
        P(rod(rr * 1.15, 0.14, 12), gun, x, y, 0.58);
        P(new THREE.ConeGeometry(rr * 0.9, rr * 2.4, 8).rotateX(Math.PI / 2), paintToon(0xd02020, { refl: 0.3, spec: 0.98 }), x, y, 0.55);
        P(rod(rr * 0.5, 0.06, 8), chrome, x, y, 0.72);
        addMuzzle(x, y, 0.66);
      }
      P(B(0.06, 0.14, 0.8), glowMat, (mirrored ? -1 : 1) * (w / 2 + 0.02), h * 0.5, 0).castShadow = false;
      bolts([[-w / 2 + 0.06, h + 0.09, 0.4], [w / 2 - 0.06, h + 0.09, 0.4], [-w / 2 + 0.06, h + 0.09, -0.4], [w / 2 - 0.06, h + 0.09, -0.4]]);
      break;
    }
    case 'swarm': {
      P(bevBox(0.72, 0.64, 0.9, 0.05), body, 0, 0.31, 0);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = (i - 1) * 0.21, y = 0.31 + (j - 1) * 0.19;
        P(rod(0.08, 0.12, 8), gun, x, y, 0.47);
        P(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(Math.PI / 2), paintToon(0xd02020, { refl: 0.3 }), x, y, 0.42);
        addMuzzle(x, y, 0.52);
      }
      P(B(0.76, 0.06, 0.94), glowMat, 0, 0.66, 0).castShadow = false;
      break;
    }
    case 'mortar': {
      P(bevBox(0.74, 0.3, 0.74, 0.04), dark, 0, 0.15, 0);
      const tube = new THREE.Group();
      tube.rotation.x = -0.9;
      tube.position.set(0, 0.35, 0);
      P(rod(0.24, 1.0), body, 0, 0, 0.35, 0, 0, 0, tube);
      P(rod(0.3, 0.14, 14), steel, 0, 0, 0.82, 0, 0, 0, tube);
      P(rod(0.3, 0.08, 14), glowMat, 0, 0, 0.1, 0, 0, 0, tube);
      P(tor(0.25, 0.03, 14), trim, 0, 0, 0.5, 0, 0, 0, tube);
      pitch.add(tube);
      tube.userData.keep = true;
      const mz = new THREE.Object3D();
      mz.position.set(0, 0, 0.9);
      tube.add(mz);
      muzzles.push(mz);
      break;
    }
    case 'saw': {
      P(bevBox(0.56, 0.3, 0.9, 0.05), body, 0, 0.18, -0.1);
      P(bevBox(0.16, 0.34, 0.5, 0.03), gun, 0, 0.36, 0.2);
      const blade = new THREE.Group();
      blade.position.set(0, 0.4, 0.28);
      blade.userData.keep = true;
      P(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), steel, 0, 0, 0, 0, 0, 0, blade);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        P(new THREE.ConeGeometry(0.075, 0.18, 4), chrome, Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46, 0, -a, Math.PI / 2, blade);
      }
      P(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 8), glowMat, 0, 0, 0, 0, 0, 0, blade);
      pitch.add(blade);
      spinner = blade;
      addMuzzle(0, 0.4, 0.8);
      break;
    }
  }
  if (item.rarity >= 4) {
    const fin = P(new THREE.ConeGeometry(0.1, 0.35, 4), glow(RARITY[4].color, 3), 0, t === 'tesla' ? 0.3 : 0.8, -0.3);
    fin.castShadow = false;
  }
  bakeStatic(pitch);
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
  const main = metalToon(0x3a3d48);
  const dark = metalToon(0x15161b);
  const chrome = metalToon(0xe4ebfa, { refl: 1, spec: 0.958 });
  const accent = paintToon(0x222222, { emissive: col, emissiveIntensity: 1.6, refl: 0.3 });
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (item.slot) {
    case 'engine': {
      put(bevBox(0.95, 0.6, 1.15, 0.06), main, 0, 0.32, 0);
      put(bevBox(0.7, 0.22, 0.9, 0.05), dark, 0, 0.7, 0);
      for (const x of [-0.25, 0.25]) for (const z of [-0.3, 0.3]) put(new THREE.CylinderGeometry(0.09, 0.13, 0.4, 8), chrome, x, 0.95, z);
      put(B(1.0, 0.08, 0.5), accent, 0, 0.5, 0.3).castShadow = false;
      put(rod(0.14, 0.4, 10), chrome, 0.55, 0.3, 0.1, 0, 0, Math.PI / 2);
      break;
    }
    case 'wheels': {
      const w = buildWheel(0.6, 0.45, item.variant, item.rarity, 1);
      w.position.y = 0.6;
      w.rotation.y = 0.5;
      g.add(w);
      break;
    }
    case 'shield': {
      put(bevBox(0.85, 0.4, 0.85, 0.06), main, 0, 0.2, 0);
      put(new THREE.SphereGeometry(0.4, 14, 10), glow(col, 2.2), 0, 0.78, 0);
      put(tor(0.5, 0.04, 20).rotateX(Math.PI / 2), chrome, 0, 0.78, 0);
      put(tor(0.5, 0.04, 20), chrome, 0, 0.78, 0);
      break;
    }
    case 'plow': {
      const pl = buildPlow(item.rarity === 4 ? 4 : item.variant, item.rarity, 1.6);
      pl.position.set(0, -0.25, -0.2);
      g.add(pl);
      break;
    }
    case 'gadget': {
      put(new THREE.CylinderGeometry(0.42, 0.48, 0.55, 12), main, 0, 0.28, 0);
      put(tor(0.44, 0.06, 18).rotateX(Math.PI / 2), accent, 0, 0.6, 0);
      put(new THREE.SphereGeometry(0.2, 10, 8), glow(col, 2.5), 0, 0.72, 0);
      put(cone(0.05, 0.4, 5), chrome, 0.3, 0.56, 0.2, 0.4, 0, -0.4);
      put(cone(0.05, 0.4, 5), chrome, -0.3, 0.56, -0.2, -0.4, 0, 0.4);
      break;
    }
  }
  return g;
}
