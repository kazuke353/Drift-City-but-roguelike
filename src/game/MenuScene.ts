import * as THREE from 'three';
import type { Game } from './Game';
import { generateDungeon, TILE } from '../world/DungeonGen';
import { buildLevel, type Level } from '../world/LevelBuilder';
import { setLightMap } from '../render/LightMap';
import { BIOMES } from '../world/Biomes';
import { buildCar, setCarPlow, setCarWheels, type CarModel } from '../entities/CarModels';
import { buildWeapon } from '../entities/WeaponModels';
import { CHASSIS_MAP } from './Cars';
import { generateItem } from '../loot/Items';
import { Rng } from '../core/Rng';
import { SHAPE_CORE } from '../fx/Particles';

/** The title-screen showroom: a car idling in a torch-lit crypt with an orbiting camera. */
export class MenuScene {
  group = new THREE.Group();
  level: Level;
  car: CarModel | null = null;
  carId = '';
  t = 0;
  cx: number;
  cz: number;
  private focus = { right: 3.0, up: 0.2, r: 11 };
  private focusT = { right: 3.0, up: 0.2, r: 11 };

  constructor(private game: Game) {
    const biome = BIOMES[Math.floor(Math.random() * 3)];
    const d = generateDungeon({ seed: 777 + Math.floor(Math.random() * 9999), roomCount: 4, isBoss: false, act: biome.act, lavaAllowed: biome.lava, extraShops: 0, extraTreasure: 0, eliteRooms: 1 });
    this.level = buildLevel(d, biome, game.lights, 4242);
    if (this.level.lightMap) setLightMap(this.level.lightMap.tex, this.level.lightMap.x0, this.level.lightMap.z0, this.level.lightMap.w, this.level.lightMap.h);
    this.group.add(this.level.group);
    const r = d.rooms[d.startRoom];
    this.cx = r.wx;
    this.cz = r.wz;
    game.renderer.scene.add(this.group);
    game.renderer.setFog(biome.fog, biome.fogNear, biome.fogFar);
    game.renderer.hemi.color.set(biome.hemiSky);
    game.renderer.hemi.groundColor.set(biome.hemiGround);
    game.renderer.hemi.intensity = biome.hemiIntensity;
    game.renderer.keyLight.color.set(biome.keyColor);
    // a showroom spotlight glow on the floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.5, 7, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8242f).multiplyScalar(2), side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.cx, 0.05, this.cz);
    ring.layers.set(1);
    this.group.add(ring);
    void TILE;
    if (new URLSearchParams(location.search).has('studio')) this.studio();
  }

  /** Neutral turntable set for model inspection (?studio). */
  private studio() {
    this.level.group.visible = false;
    const r = this.game.renderer;
    r.setFog(0x14151c, 60, 200);
    r.hemi.intensity = 0.9;
    r.hemi.color.set(0x9aa4c8);
    r.hemi.groundColor.set(0x28242c);
    r.keyLight.intensity = 2.0;
    r.keyLight.color.set(0xfff0dd);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshToonMaterial({ color: 0x23242e }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.cx, 0, this.cz);
    floor.receiveShadow = true;
    this.group.add(floor);
    for (const [x, z, c, i] of [[8, 6, 0xffb070, 60], [-8, -5, 0x6a90ff, 50], [0, 9, 0xffffff, 30]] as const) this.game.lights.addStatic(this.cx + x, 6, this.cz + z, c, i, 30, 0);
  }

  /** Where the car sits on screen: 'title' = right of the menu, 'select' = high, leaving room for the cards. */
  setFocus(kind: 'title' | 'select') {
    this.focusT = kind === 'select' ? { right: 0, up: 3.5, r: 10 } : { right: 3.0, up: 0.2, r: 11 };
  }

  setCar(id: string) {
    if (id === this.carId) return;
    this.carId = id;
    if (this.car) this.group.remove(this.car.root);
    const def = CHASSIS_MAP.get(id)!;
    this.car = buildCar(def);
    const rng = new Rng(id.length * 31);
    const main = generateItem(rng, { level: 3, slot: 'main', rarity: 3 });
    const side = generateItem(rng, { level: 3, slot: 'side', rarity: 2 });
    const wm = buildWeapon(main);
    this.car.turretMount.add(wm.root);
    this.car.sideMounts.forEach((m, i) => m.add(buildWeapon(side, i === 0).root));
    setCarPlow(this.car, generateItem(rng, { level: 3, slot: 'plow', rarity: 2 }));
    setCarWheels(this.car, null);
    this.car.root.position.set(this.cx, 0, this.cz);
    this.car.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
    this.group.add(this.car.root);
  }

  update(dt: number) {
    this.t += dt;
    const cam = this.game.renderer.camera;
    const close = new URLSearchParams(location.search).has('closeup');
    const a = close ? 2.2 + this.t * 0.4 : 1.4 + Math.sin(this.t * 0.22) * 0.5;
    const r = close ? 7.2 : 13;
    const ov = (window as any).__cam as { a: number; r: number; h: number; ty: number; tx?: number; tz?: number } | undefined;
    if (ov) {
      cam.position.set(this.cx + Math.sin(ov.a) * ov.r, ov.h, this.cz + Math.cos(ov.a) * ov.r);
      cam.lookAt(this.cx + (ov.tx ?? 0), ov.ty, this.cz + (ov.tz ?? 0));
    } else if (close) {
      cam.position.set(this.cx + Math.sin(a) * r, 2.5, this.cz + Math.cos(a) * r);
      cam.lookAt(this.cx, 0.85, this.cz);
    } else {
      const k = Math.min(1, dt * 3);
      this.focus.right += (this.focusT.right - this.focus.right) * k;
      this.focus.up += (this.focusT.up - this.focus.up) * k;
      this.focus.r += (this.focusT.r - this.focus.r) * k;
      const px = this.cx + Math.sin(a) * this.focus.r, pz = this.cz + Math.cos(a) * this.focus.r;
      cam.position.set(px, 3.6 + Math.sin(this.t * 0.3) * 0.5, pz);
      const fx = this.cx - px, fz = this.cz - pz, fl = Math.hypot(fx, fz) || 1;
      const rx = -fz / fl, rz = fx / fl;
      cam.lookAt(this.cx - rx * this.focus.right, 1.1 - this.focus.up, this.cz - rz * this.focus.right);
    }
    cam.fov = 58;
    cam.updateProjectionMatrix();
    if (this.car) {
      this.car.body.position.y = Math.sin(this.t * 30) * 0.012;
      this.car.root.rotation.y = 0.4;
      // idle exhaust
      if (Math.random() < 0.1) {
        this.car.root.updateMatrixWorld();
        const p = this.car.exhausts[0].clone().applyMatrix4(this.car.root.matrixWorld);
        this.game.fx.smokePuff(p.x, p.y, p.z, 0, 0.8, -1, 0.35, 0.4, 0.8);
      }
      if (Math.random() < 0.05) this.game.fx.add.emit(this.cx + (Math.random() - 0.5) * 12, 0.2, this.cz + (Math.random() - 0.5) * 12, 0, 2, 0, 1.5, 0.15, 0.05, 3, 1.2, 0.3, 1, { shape: SHAPE_CORE });
    }
    this.level.update(dt, this.game.fx, cam.position);
    this.game.lights.update(dt, this.cx, this.cz);
    this.game.renderer.followShadow(this.cx, this.cz);
    this.game.updateHeadlightsStatic(this.car, this.cx, this.cz);
  }

  dispose() {
    this.game.renderer.scene.remove(this.group);
    this.level.dispose();
    this.game.lights.clearStatics();
  }
}
