import * as THREE from 'three';
import type { Game } from './Game';
import { generateDungeon, TILE } from '../world/DungeonGen';
import { buildLevel, type Level } from '../world/LevelBuilder';
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

  constructor(private game: Game) {
    const biome = BIOMES[Math.floor(Math.random() * 3)];
    const d = generateDungeon({ seed: 777 + Math.floor(Math.random() * 9999), roomCount: 4, isBoss: false, act: biome.act, lavaAllowed: biome.lava, extraShops: 0, extraTreasure: 0, eliteRooms: 1 });
    this.level = buildLevel(d, biome, game.lights, 4242);
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
    const a = close ? 2.2 + this.t * 0.4 : this.t * 0.18;
    const r = close ? 8 : 13;
    cam.position.set(this.cx + Math.sin(a) * r, 4.2 + Math.sin(this.t * 0.3) * 0.8, this.cz + Math.cos(a) * r);
    cam.lookAt(this.cx + 3.5 * Math.cos(a), 1.4, this.cz - 3.5 * Math.sin(a));
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
