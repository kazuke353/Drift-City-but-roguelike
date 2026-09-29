import * as THREE from 'three';
import { GameRenderer } from '../render/Renderer';
import { LightPool } from '../render/LightPool';
import { Input } from '../core/Input';
import { FX } from '../fx/FX';
import { UI } from '../ui/UI';
import { Run, TOTAL_FLOORS, type FloorMod } from './Run';
import { World } from './World';
import { MenuScene } from './MenuScene';
import { Save } from '../core/Save';
import { audio } from '../audio/Audio';
import type { MusicMode } from '../audio/Music';
import type { PlayerCar } from '../entities/PlayerCar';
import type { CarModel } from '../entities/CarModels';
import { clamp, damp } from '../core/MathUtil';
import { generateItem, type Rarity, type Slot } from '../loot/Items';
import { TILE } from '../world/DungeonGen';

type State = 'title' | 'playing' | 'dead' | 'loading';

export class Game {
  renderer: GameRenderer;
  input: Input;
  ui: UI;
  fx: FX;
  lights: LightPool;
  headlight: THREE.SpotLight;
  run: Run | null = null;
  world: World | null = null;
  menu: MenuScene | null = null;
  state: State = 'title';
  time = 0;
  private last = performance.now();
  private timeScale = 1;
  private slowT = 0;
  private slowScale = 1;
  private expectUnlock = false;
  private loadingEl: HTMLDivElement;
  screenFx = {
    damage: 0,
    chroma: 0,
    speedLines: 0,
    flashA: 0,
    flashColor: new THREE.Color(1, 1, 1),
    flash: (c: string, a: number) => {
      this.screenFx.flashColor.set(c);
      this.screenFx.flashA = Math.max(this.screenFx.flashA, a);
    },
  };
  debug: Record<string, (...a: any[]) => unknown> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new GameRenderer(canvas);
    this.input = new Input(canvas);
    this.lights = new LightPool(this.renderer.scene, 8);
    this.fx = new FX(this.renderer.scene, this.lights);
    this.headlight = new THREE.SpotLight(0xfff0d0, 0, 55, 0.62, 0.65, 1.2);
    this.headlight.castShadow = false;
    this.renderer.scene.add(this.headlight, this.headlight.target);
    this.ui = new UI(this);
    this.loadingEl = document.createElement('div');
    this.loadingEl.className = 'loading hidden';
    this.loadingEl.innerHTML = '<span>DELVING DEEPER...</span>';
    document.getElementById('ui')!.appendChild(this.loadingEl);
    this.applySettings();

    canvas.addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.ui.modalOpen) this.lockPointer();
    });
    this.input.onPointerLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.ui.modalOpen && !this.expectUnlock) this.pause();
      this.expectUnlock = false;
    };
    const unlockAudio = () => {
      audio.init();
      audio.music?.setMode(this.state === 'playing' ? 'explore' : 'menu');
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.ui.modalOpen) this.pause();
    });
    this.setupDebug();
  }

  start() {
    this.toTitle();
    requestAnimationFrame(this.loop);
  }

  applySettings() {
    const s = Save.settings;
    this.renderer.setQuality(s.quality);
    this.lights.setCount(s.quality === 'high' ? 8 : s.quality === 'medium' ? 6 : 3);
    this.fx.quality = s.quality === 'low' ? 0.5 : s.quality === 'medium' ? 0.75 : 1;
    this.input.sensitivity = s.sensitivity;
    audio.applyVolumes();
  }

  lockPointer() {
    if (this.input.pointerLockFailed) return;
    this.input.requestPointerLock();
  }

  // ------------------------------------------------------------------ flow
  toTitle() {
    this.state = 'title';
    this.disposeWorld();
    this.run = null;
    if (!this.menu) this.menu = new MenuScene(this);
    this.menu.setCar(Save.data.lastCar);
    this.ui.hud.show(false);
    this.ui.showTitle();
    this.music('menu');
    this.expectUnlock = true;
    this.input.exitPointerLock();
  }

  previewCar(id: string) {
    this.menu?.setCar(id);
  }

  startRun(carId: string) {
    audio.init();
    if (this.ui.screen !== 'none') this.ui.close();
    this.run = new Run(carId);
    Save.data.runs++;
    Save.save();
    this.loadFloor(true);
  }

  private disposeWorld() {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
  }

  private loadFloor(first = false) {
    const run = this.run!;
    this.state = 'loading';
    if (this.ui.screen !== 'none') this.ui.close();
    this.loadingEl.classList.remove('hidden');
    this.ui.hud.show(false);
    this.ui.hud.reset();
    setTimeout(() => {
      this.menu?.dispose();
      this.menu = null;
      this.disposeWorld();
      const names = run.biome.floorNames;
      run.floorName = run.isBossFloor ? run.biome.bossName : names[(run.seed + run.floor * 3) % names.length];
      run.keystones = 0;
      run.recompute();
      run.hp = Math.min(run.hp, run.stats.maxHp);
      this.world = new World(this, run);
      this.loadingEl.classList.add('hidden');
      this.state = 'playing';
      this.ui.hud.show(true);
      this.ui.floorIntro(run);
      this.music('explore');
      this.lockPointer();
      setTimeout(() => this.ui.bark(first ? 'firstFloor' : run.isBossFloor ? 'boss' : 'floorStart'), 2800);
      if (run.pendingPerks > 0) setTimeout(() => this.ui.hud.offerPerks(run), 3200);
      Save.data.bestFloor = Math.max(Save.data.bestFloor, run.floor + 1);
      Save.save();
    }, 60);
  }

  nextFloor(mods: FloorMod[]) {
    const run = this.run;
    if (!run) return;
    if (run.floor + 1 >= TOTAL_FLOORS) {
      this.victory();
      return;
    }
    run.floor++;
    run.floorMods = mods;
    // carry a little shield back up between floors
    run.shield = run.stats.maxShield;
    this.screenFx.flash('#ffffff', 0.8);
    this.loadFloor();
  }

  gameOver() {
    if (!this.run) return this.toTitle();
    this.finishRun(false);
  }

  victory() {
    if (!this.run) return;
    this.run.won = true;
    Save.data.wins++;
    audio.play('victory');
    this.finishRun(true);
  }

  private finishRun(win: boolean) {
    const run = this.run!;
    this.state = 'dead';
    const crowns = run.crownsEarned();
    Save.data.crowns += crowns;
    Save.data.totalCrowns += crowns;
    Save.save();
    this.expectUnlock = true;
    this.input.exitPointerLock();
    audio.stopAllLoops();
    this.music(win ? 'shop' : 'menu');
    this.ui.showResults(win, run, crowns);
  }

  pause() {
    if (this.state !== 'playing' || this.ui.modalOpen) return;
    this.ui.showPause();
  }

  resume() {
    this.ui.close();
    if (this.state === 'playing') this.lockPointer();
  }

  onModal(open: boolean) {
    if (open) {
      this.expectUnlock = true;
      this.input.exitPointerLock();
      this.input.releaseAll();
      audio.stopAllLoops();
    }
  }

  onLevelUp(n: number) {
    const run = this.run!;
    audio.play('levelUp');
    this.ui.toast('LEVEL UP!', `Level ${run.level}`, '#ffd23a');
    this.ui.bark('levelUp');
    this.screenFx.flash('#ffd23a', 0.2);
    const p = this.world?.player;
    if (p) this.fx.rings.spawn(p.pos.x, 0.3, p.pos.z, 1, 10, 0.5, 0xffd23a);
    this.ui.hud.offerPerks(run);
    void n;
  }

  music(mode: MusicMode) {
    audio.music?.setMode(mode);
  }

  slowmo(dur: number, scale: number) {
    this.slowT = Math.max(this.slowT, dur);
    this.slowScale = Math.min(this.slowScale, scale);
  }

  updateHeadlights(p: PlayerCar) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    this.headlight.intensity = p.alive ? 70 : 0;
    this.headlight.position.set(p.pos.x + fx * 2.4, p.pos.y + 1.1, p.pos.z + fz * 2.4);
    this.headlight.target.position.set(p.pos.x + fx * 16, 0, p.pos.z + fz * 16);
    this.headlight.target.updateMatrixWorld();
  }

  updateHeadlightsStatic(car: CarModel | null, x: number, z: number) {
    if (!car) {
      this.headlight.intensity = 0;
      return;
    }
    const h = car.root.rotation.y;
    this.headlight.intensity = 14;
    this.headlight.position.set(x + Math.sin(h) * 2.4, 1.1, z + Math.cos(h) * 2.4);
    this.headlight.target.position.set(x + Math.sin(h) * 16, 0, z + Math.cos(h) * 16);
    this.headlight.target.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ main loop
  private loop = (now: number) => {
    requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, Math.max(0.0001, (now - this.last) / 1000));
    this.last = now;
    this.time += rawDt;
    this.input.poll();
    const r = this.renderer;
    const sf = this.screenFx;

    if (this.state === 'playing' && this.world) {
      this.handleInput();
      const w = this.world;
      // time scale
      if (this.slowT > 0) {
        this.slowT -= rawDt;
        this.timeScale = damp(this.timeScale, this.slowScale, 12, rawDt);
        if (this.slowT <= 0) this.slowScale = 1;
      } else this.timeScale = damp(this.timeScale, 1, 5, rawDt);
      let dt = rawDt * this.timeScale;
      if (this.fx.hitStop > 0) {
        this.fx.hitStop -= rawDt;
        dt *= 0.05;
      }
      if (!this.ui.modalOpen) {
        const run = w.run;
        const s = Save.settings;
        const drive = {
          throttle: this.input.throttleAxis,
          steer: this.input.steerAxis,
          steerFromKeys: Math.abs(this.input.steerAxis) > 0.05,
          handbrake: this.input.isDown('handbrake'),
          boost: this.input.isDown('boost'),
          camYaw: w.cam.yaw,
          mode: s.steerMode,
        };
        const reps = (this as any).simSpeed ?? 1;
        for (let k = 0; k < reps && this.world === w; k++) {
          this.fx.beams.begin(r.camera.position);
          w.update(reps > 1 ? 1 / 30 : dt, drive, [this.input.isDown('fireMain'), this.input.isDown('fireSide')]);
        }
        if (this.world === w) {
          w.cam.lookBack = this.input.isDown('lookBack');
          w.cam.update(rawDt, this.input, w.player, w.grid, this.fx.shakeAmount, this.input.pointerLocked || this.input.pointerLockFailed || this.input.lastDevice === 'pad');
          const p = w.player;
          audio.setListener(p.pos.x, p.pos.z, w.cam.yaw);
          sf.speedLines = damp(sf.speedLines, p.boosting ? 0.85 : p.driftBoostT > 0 ? 0.7 : p.speed > 45 ? 0.3 : 0, 6, rawDt);
          r.uniforms.lowHp.value = run.hp < run.stats.maxHp * 0.3 || p.downed ? 1 : 0;
          r.uniforms.desat.value = damp(r.uniforms.desat.value, p.downed ? 0.75 : p.dead ? 0.6 : 0, 4, rawDt);
        }
      }
      if (this.world) {
        const w2 = this.world;
        this.fx.shakeAmount = Math.max(0, this.fx.shakeAmount - rawDt * 2.8);
        this.lights.update(dt, w2.player.pos.x, w2.player.pos.z);
        r.followShadow(w2.player.pos.x, w2.player.pos.z);
        if (this.ui.modalOpen) this.fx.beams.begin(r.camera.position);
        if (this.ui.screen === 'loadout') {
          // showcase orbit around the player's car while the loadout is open
          const pp = w2.player;
          const a = this.time * 0.4 + 0.6;
          r.camera.position.set(pp.pos.x + Math.sin(a) * 8.6, pp.pos.y + 3.1, pp.pos.z + Math.cos(a) * 8.6);
          r.camera.lookAt(pp.pos.x, pp.pos.y + 0.9, pp.pos.z);
          r.camera.fov = 46;
          r.camera.updateProjectionMatrix();
        }
        w2.render(this.time);
        this.fx.update(dt, r.camera.position);
        this.ui.hud.update(rawDt, w2);
      }
    } else if (this.menu) {
      this.fx.beams.begin(r.camera.position);
      this.menu.update(rawDt);
      this.fx.update(rawDt, r.camera.position);
      sf.speedLines = damp(sf.speedLines, 0, 4, rawDt);
      r.uniforms.lowHp.value = 0;
      r.uniforms.desat.value = 0;
    } else if (this.world) {
      // dead / results: keep the scene alive in the background
      this.fx.beams.begin(r.camera.position);
      this.fx.update(rawDt * 0.3, r.camera.position);
      this.world.render(this.time);
      this.lights.update(rawDt, this.world.player.pos.x, this.world.player.pos.z);
    }

    // screen fx decay
    sf.damage = Math.max(0, sf.damage - rawDt * 2.2);
    sf.chroma = Math.max(0, sf.chroma - rawDt * 3);
    sf.flashA = Math.max(0, sf.flashA - rawDt * 2.5);
    r.uniforms.damage.value = sf.damage * 0.7;
    r.uniforms.chroma.value = sf.chroma + sf.speedLines * 0.6;
    r.uniforms.speedLines.value = sf.speedLines;
    r.uniforms.flash.value.set(sf.flashColor.r, sf.flashColor.g, sf.flashColor.b, sf.flashA);
    r.render(this.time);
    this.input.endFrame();
  };

  private handleInput() {
    const inp = this.input;
    const w = this.world!;
    const run = w.run;
    const ui = this.ui;
    if (inp.consume('pause')) {
      if (ui.screen === 'pause' || ui.modalOpen) this.resume();
      else this.pause();
      return;
    }
    if (inp.consume('loadout')) {
      if (ui.screen === 'loadout') this.resume();
      else if (!ui.modalOpen) ui.showLoadout();
      return;
    }
    if (ui.modalOpen) {
      for (const k of ['choice1', 'choice2', 'choice3'] as const) if (inp.consume(k)) ui.handleModalKey(k);
      return;
    }
    if (inp.consume('map')) ui.hud.toggleBigMap(w);
    const p = w.player;
    if (!p.alive) return;
    if (inp.consume('interact')) {
      if (w.lootTarget) w.equipGround(w.lootTarget);
      else if (w.interactTarget && w.interactTarget.label()) w.interactTarget.use();
    }
    if (inp.consume('stash') && w.lootTarget) w.stashGround(w.lootTarget);
    if (inp.consume('salvage') && w.lootTarget) w.salvageGround(w.lootTarget);
    if (inp.consume('gadget')) p.gadget?.activate(w);
    if (inp.consume('reload')) for (const wr of p.weapons) wr?.startReload();
    if (inp.consume('horn')) p.honk();
    if (ui.hud.perkChoices) {
      if (inp.consume('choice1')) ui.hud.choosePerk(run, 0);
      else if (inp.consume('choice2')) ui.hud.choosePerk(run, 1);
      else if (inp.consume('choice3')) ui.hud.choosePerk(run, 2);
      else if (inp.consume('reroll')) ui.hud.rerollPerks(run);
    }
  }

  // ------------------------------------------------------------------ debug hooks (for testing)
  private setupDebug() {
    const g = this;
    this.debug = {
      start: (car = 'rustbucket') => g.startRun(car as string),
      floor: (n: number) => {
        if (!g.run) g.run = new Run('rustbucket');
        g.run.floor = n;
        g.loadFloor();
      },
      god: () => {
        if (g.world) g.world.player.invulnT = 1e9;
      },
      teleport: (type: string) => {
        const w = g.world;
        if (!w) return;
        const r = w.d.rooms.find((x) => x.type === type);
        if (r) {
          w.player.pos.set(r.wx, 0, r.wz);
          w.player.vel.set(0, 0, 0);
          w.cam.snapTo(w.player);
        }
        return r?.type;
      },
      give: (rarity = 4, slot?: string) => {
        const w = g.world;
        if (!w) return;
        const it = generateItem(w.run.lootRng, { level: w.run.depthLevel, rarity: rarity as Rarity, slot: slot as Slot | undefined });
        w.pickups.dropItem(it, w.player.pos.x + Math.sin(w.player.heading) * 6, w.player.pos.z + Math.cos(w.player.heading) * 6);
        return it.name;
      },
      spawn: (id: string, n = 1) => {
        const w = g.world;
        if (!w) return;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          w.spawnEnemy(id, w.player.pos.x + Math.sin(w.player.heading + a * 0.3) * 20, w.player.pos.z + Math.cos(w.player.heading + a * 0.3) * 20, w.grid.roomAt(w.player.pos.x, w.player.pos.z), {});
        }
      },
      killAll: () => {
        const w = g.world;
        if (!w) return;
        for (const e of w.enemies) if (e.alive) w.killEnemy(e, { amount: 0, element: 'none', source: 'status' });
      },
      state: () => ({ state: g.state, floor: g.run?.floor, hp: g.run?.hp, enemies: g.world?.enemies.length, room: g.world?.currentRoom, pos: g.world ? [g.world.player.pos.x, g.world.player.pos.z] : null, calls: g.renderer.stats.calls, tris: g.renderer.stats.tris }),
      tiles: () => (g.world ? TILE : 0),
      pick: (px: number, py: number) => {
        const cam = g.renderer.camera;
        const rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2((px / window.innerWidth) * 2 - 1, -((py / window.innerHeight) * 2 - 1)), cam);
        const hits = rc.intersectObjects(g.renderer.scene.children, true).slice(0, 4);
        return hits.map((h) => {
          const o = h.object as THREE.Mesh;
          const chain: string[] = [];
          let q: THREE.Object3D | null = o;
          while (q && chain.length < 6) { chain.push(q.name || q.type); q = q.parent; }
          const m = o.material as THREE.MeshToonMaterial;
          return { d: +h.distance.toFixed(1), geo: o.geometry?.type, color: m?.color?.getHexString?.(), inst: (o as any).isInstancedMesh, chain: chain.join('<') };
        });
      },
      xp: (n: number) => {
        const r = g.run;
        if (!r) return;
        const ups = r.addXp(n);
        if (ups) g.onLevelUp(ups);
      },
      clamp: () => clamp(0, 0, 1),
      speed: (n: number) => ((g as any).simSpeed = n),
    };
    (window as any).__game = this;
  }
}
