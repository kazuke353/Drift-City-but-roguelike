import type { Game } from '../game/Game';
import type { World, ShopEntry, ShrineDef } from '../game/World';
import type { Run } from '../game/Run';
import type { Enemy } from '../entities/Enemy';
import { HUD } from './HUD';
import { icon } from './Icons';
import { itemCardHTML, slotIcon } from './ItemCard';
import { portraitFrame } from './Portrait';
import { artImg, itemArt } from './ArtIcons';
import { Save, type Settings } from '../core/Save';
import { CHASSIS, META_UPGRADES } from '../game/Cars';
import { RARITY, SLOTS, SLOT_NAMES, generateItem, type Item, type Rarity } from '../loot/Items';
import { RELIC_MAP, RELICS, activeSynergies, tagCounts, SYNERGIES } from '../loot/Relics';
import { PERK_MAP } from '../loot/Perks';
import { audio } from '../audio/Audio';
import { formatNum } from '../core/MathUtil';
import type { Element } from '../fx/FX';

type Screen = 'none' | 'title' | 'select' | 'garage' | 'settings' | 'howto' | 'pause' | 'loadout' | 'shop' | 'shrine' | 'relic' | 'results';

export class UI {
  root: HTMLElement;
  hud: HUD;
  private screenEl: HTMLDivElement;
  private overlayEl: HTMLDivElement;
  screen: Screen = 'none';
  private back: Screen = 'none';
  private selCar: string;
  private loadoutSel: { where: 'eq' | 'bp'; slot?: string; idx?: number } | null = null;

  constructor(private game: Game) {
    this.root = document.getElementById('ui')!;
    this.hud = new HUD(game, this.root);
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'overlay-layer';
    this.root.appendChild(this.overlayEl);
    this.screenEl = document.createElement('div');
    this.screenEl.className = 'screen hidden';
    this.root.appendChild(this.screenEl);
    this.selCar = Save.data.lastCar;
    this.screenEl.addEventListener('mouseover', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.btn, .mi, .car-card, .relic-card, .pcard, .slot-row, .bp-cell')) audio.play('uiHover');
    });
  }

  get modalOpen() {
    return this.screen !== 'none' && this.screen !== 'title';
  }

  // =============================================================== hooks used by World
  damageNumber(x: number, y: number, z: number, a: number, crit: boolean, el: Element, big = false) {
    this.hud.damageNumber(x, y, z, a, crit, el, big);
  }
  floatText(x: number, y: number, z: number, t: string, c: string) {
    this.hud.floatText(x, y, z, t, c);
  }
  hitMarker(crit: boolean, kill: boolean) {
    this.hud.hitMarker(crit, kill);
  }
  playerHit(intensity: number, shieldOnly: boolean, dir: number | null) {
    this.game.screenFx.damage = Math.max(this.game.screenFx.damage, shieldOnly ? intensity * 0.25 : intensity);
    this.game.screenFx.chroma = Math.max(this.game.screenFx.chroma, intensity * 1.5);
    if (dir !== null) this.hud.hitDirection(dir);
  }
  toast(t: string, s = '', c = '#e8242f') {
    this.hud.toast(t, s, c);
  }
  combo(n: number) {
    this.hud.combo(n);
  }
  bark(k: string) {
    this.hud.bark(k);
  }
  bossBar(e: Enemy | null) {
    const w = this.game.world;
    this.hud.bossBar(e, w?.bossDef?.title, w?.bossDef?.subtitle);
  }
  setDowned(v: boolean) {
    this.hud.setDowned(v);
  }
  flash(color: string, a: number) {
    this.game.screenFx.flash(color, a);
  }
  roomLocked(elite: boolean) {
    this.hud.toast(elite ? 'ELITE AMBUSH!' : 'AMBUSH!', 'Clear the room to open the gates', elite ? '#ff40ff' : '#e8242f');
  }
  wave(i: number, n: number) {
    this.hud.toast(`WAVE ${i}/${n}`, '', '#111');
  }
  driftBoost(tier: number) {
    this.game.screenFx.speedLines = Math.max(this.game.screenFx.speedLines, 0.4 + tier * 0.2);
  }
  ramHit(_d: number) {
    this.game.screenFx.chroma = Math.max(this.game.screenFx.chroma, 0.4);
  }
  equipped(it: Item) {
    this.hud.bark('equip');
    this.hud.toast('EQUIPPED', it.name, RARITY[it.rarity].color);
  }
  legendaryDrop(it: Item) {
    this.hud.toast('LEGENDARY!', it.name, '#ffa51f');
    this.flash('#ffa51f', 0.25);
  }
  bossIntro(title: string, sub: string) {
    this.fullCard(`<div class="band red"></div><div class="content"><div class="big">${title}</div><div class="mid">${sub.toUpperCase()}</div></div>`, 2600);
  }
  floorIntro(run: Run) {
    const mods = run.floorMods.map((m) => `<div class="mod-chip" style="border-color:${m.color}">${icon(m.icon, '', 18, m.color)}<span>${m.name} — ${m.desc}</span></div>`).join('');
    this.fullCard(`<div class="band"></div><div class="content"><div class="small">${run.biome.name.toUpperCase()} · ACT ${run.act}</div><div class="big">${run.floorLabel}</div><div class="mid">${run.floorName.toUpperCase()}</div>${mods ? `<div class="mods-inline">${mods}</div>` : ''}</div>`, 2600);
  }
  private fullCard(html: string, ms: number) {
    const el = document.createElement('div');
    el.className = 'fullcard in';
    el.innerHTML = html;
    this.overlayEl.appendChild(el);
    audio.play('uiOpen');
    setTimeout(() => {
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }, ms);
  }

  // =============================================================== screens
  private open(s: Screen, html: string, dim = true) {
    this.screen = s;
    this.root.classList.toggle('modal-open', s !== 'title' && s !== 'none');
    this.screenEl.className = 'screen' + (dim ? ' dimbg' : '');
    this.screenEl.innerHTML = html;
    this.game.onModal(this.modalOpen);
  }

  close() {
    const was = this.screen;
    this.screen = 'none';
    this.root.classList.remove('modal-open');
    this.screenEl.className = 'screen hidden';
    this.screenEl.innerHTML = '';
    this.game.onModal(false);
    if (was !== 'title') audio.play('uiClose');
  }

  private bind(sel: string, fn: (el: HTMLElement) => void) {
    this.screenEl.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.play('uiClick');
      fn(el as HTMLElement);
    }));
  }

  // ---------------------------------------------------------------- title
  showTitle() {
    this.hud.show(false);
    const d = Save.data;
    this.game.menu?.setFocus('title');
    this.open('title', `
      <div class="title-logo">
        <div class="crown">${artImg('icon_crown')}</div>
        <div class="l1">DUNGEON</div>
        <div class="l2">DRIVERS</div>
        <div class="tag">CARS. LOOT. DUNGEONS. REPEAT.</div>
      </div>
      <div class="title-side">
        <div class="crowns">${artImg('icon_crown')} ${d.crowns}</div>
        <div class="slogan" style="margin-top:30px">Bigger loot.<br/>Badder roads.<br/>Brighter tomorrow.</div>
      </div>
      <div class="title-menu">
        <div class="mi interactive" data-a="drive"><i class="mk"></i>DRIVE</div>
        <div class="mi interactive" data-a="garage"><i class="mk"></i>GARAGE</div>
        <div class="mi interactive" data-a="howto"><i class="mk"></i>HOW TO PLAY</div>
        <div class="mi interactive" data-a="settings"><i class="mk"></i>SETTINGS</div>
      </div>
      <div class="title-foot">RUNS ${d.runs} · WINS ${d.wins} · BEST FLOOR B${Math.max(1, d.bestFloor)} · KILLS ${formatNum(d.kills)}<br/>SAME ROADS. DIFFERENT TREASURES.</div>
    `, false);
    this.bind('.mi', (el) => {
      const a = el.dataset.a;
      if (a === 'drive') this.showCarSelect();
      if (a === 'garage') this.showGarage();
      if (a === 'howto') this.showHowTo('title');
      if (a === 'settings') this.showSettings('title');
    });
  }

  // ---------------------------------------------------------------- car select
  showCarSelect() {
    const d = Save.data;
    const cards = CHASSIS.map((c) => {
      const owned = d.unlockedCars.includes(c.id);
      const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      return `<div class="car-card interactive ${this.selCar === c.id ? 'sel' : ''} ${owned ? '' : 'locked'}" data-id="${c.id}"><div class="cbg jag-${this.selCar === c.id ? 'red' : 'a'}"></div>
        <div class="row" style="justify-content:space-between"><div><div class="cn">${c.name}</div><div class="ct">${c.title.toUpperCase()}</div></div>
        ${owned ? '' : `<div class="crowns" style="font-size:20px;padding:2px 16px 0 10px">${artImg('icon_crown', 20)} ${c.cost}</div>`}</div>
        <div class="cd">${c.desc}</div>
        <div class="cp">${c.passive}</div>
        <div class="bars2">
          <div class="statbar"><span class="sl">SPEED</span><span class="pips">${pips(c.bars.speed)}</span></div>
          <div class="statbar"><span class="sl">ARMOR</span><span class="pips">${pips(c.bars.armor)}</span></div>
          <div class="statbar"><span class="sl">HANDLING</span><span class="pips">${pips(c.bars.handling)}</span></div>
          <div class="statbar"><span class="sl">FIREPOWER</span><span class="pips">${pips(c.bars.firepower)}</span></div>
        </div>
      </div>`;
    }).join('');
    const sel = CHASSIS.find((c) => c.id === this.selCar)!;
    const owned = d.unlockedCars.includes(sel.id);
    this.game.menu?.setFocus('select');
    this.open('select', `
      <div class="cs-top interactive"><div class="ps-title">CHOOSE YOUR RIDE</div><div class="crowns">${artImg('icon_crown')} ${d.crowns}</div></div>
      <div class="cs-bottom interactive"><div class="car-select">${cards}</div></div>
      <div class="cs-actions interactive">
        <button class="btn" data-a="back"><span>BACK</span></button>
        ${owned ? `<button class="btn gold" data-a="go"><span>DRIVE THE ${sel.name} ▶</span></button>` : `<button class="btn gold" data-a="buy" ${d.crowns < sel.cost ? 'disabled' : ''}><span>UNLOCK FOR ${sel.cost} CROWNS</span></button>`}
      </div>`, false);
    this.game.previewCar(this.selCar);
    this.bind('.car-card', (el) => {
      this.selCar = el.dataset.id!;
      this.showCarSelect();
    });
    this.bind('[data-a=back]', () => this.showTitle());
    this.bind('[data-a=buy]', () => {
      if (Save.data.crowns >= sel.cost) {
        Save.data.crowns -= sel.cost;
        Save.data.unlockedCars.push(sel.id);
        Save.save();
        audio.play('purchase');
        this.showCarSelect();
      }
    });
    this.bind('[data-a=go]', () => {
      Save.data.lastCar = this.selCar;
      Save.save();
      this.close();
      this.game.startRun(this.selCar);
    });
  }

  // ---------------------------------------------------------------- garage
  showGarage() {
    const d = Save.data;
    const UPART: Record<string, string> = { hull: 'icon_heart', shield: 'icon_shieldstat', firepower: 'icon_cannon', startGold: 'pk_coin', luck: 'icon_gear', nitro: 'icon_engine', rerolls: 'icon_wheel', startRarity: 'icon_crown', secondWind: 'icon_heart', keys: 'icon_treasure' };
    const cards = META_UPGRADES.map((u) => {
      const lvl = d.upgrades[u.id] ?? 0;
      const max = u.costs.length;
      const cost = lvl < max ? u.costs[lvl] : 0;
      return `<div class="up-card"><div class="ubg jag-${'abcde'[META_UPGRADES.indexOf(u) % 5]}"></div>
        <div class="un">${artImg(UPART[u.id] ?? 'icon_gear')} ${u.name}</div>
        <div class="ud">${lvl > 0 ? u.desc(lvl) : '—'}${lvl < max ? `<br/><span>Next: ${u.desc(lvl + 1)}</span>` : ''}</div>
        <div class="upips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        ${lvl < max ? `<button class="btn gold" data-u="${u.id}" ${d.crowns < cost ? 'disabled' : ''}><span>${artImg('icon_crown', 18)} ${cost}</span></button>` : '<div class="lbl" style="color:#ffcb2f;font-size:16px">MAXED</div>'}
      </div>`;
    }).join('');
    this.game.menu?.setFocus('title');
    this.open('garage', `
      <div class="panel-screen interactive">
        <div class="ps-head"><div class="ps-title">THE GARAGE</div><div class="ps-sub">Crowns are earned every run — even the bad ones.</div><div class="crowns">${artImg('icon_crown')} ${d.crowns}</div></div>
        <div class="garage-grid">${cards}</div>
        <div class="row" style="justify-content:space-between;margin-top:22px">
          <button class="btn" data-a="back"><span>BACK</span></button>
          <button class="btn" data-a="reset" style="font-size:16px"><span>RESET PROGRESS</span></button>
        </div>
      </div>`);
    this.bind('[data-u]', (el) => {
      const u = META_UPGRADES.find((x) => x.id === el.dataset.u)!;
      const lvl = Save.data.upgrades[u.id] ?? 0;
      const cost = u.costs[lvl];
      if (cost !== undefined && Save.data.crowns >= cost) {
        Save.data.crowns -= cost;
        Save.data.upgrades[u.id] = lvl + 1;
        Save.save();
        audio.play('purchase');
        this.showGarage();
      }
    });
    this.bind('[data-a=back]', () => this.showTitle());
    this.bind('[data-a=reset]', (el) => {
      if (el.dataset.confirm) {
        Save.reset();
        this.showGarage();
      } else {
        el.dataset.confirm = '1';
        el.innerHTML = '<span>CLICK AGAIN TO CONFIRM</span>';
      }
    });
  }

  // ---------------------------------------------------------------- how to play
  showHowTo(back: Screen) {
    this.back = back;
    const k = (x: string) => `<span class="keycap">${x}</span>`;
    this.open('howto', `
      <div class="panel-screen interactive">
        <div class="ps-head"><div class="ps-title">HOW TO DRIVE</div><div class="ps-sub">Cars in dungeons. What could go wrong?</div></div>
        <div class="howto">
          <div>
            <h3>DRIVING</h3>
            <div class="kr">${k('W')} Accelerate — the car steers toward where you look (Borderlands style)</div>
            <div class="kr">${k('S')} Brake / Reverse &nbsp; ${k('A')}${k('D')} Manual steering</div>
            <div class="kr">${k('MOUSE')} Aim & orbit the camera</div>
            <div class="kr">${k('SPACE')} Handbrake — hold while turning to <b>DRIFT</b>. Charge sparks (blue → orange → purple) and release for a boost!</div>
            <div class="kr">${k('SHIFT')} Nitro boost &nbsp; ${k('H')} Horn (knocks enemies back)</div>
            <div class="kr">${k('C')} Look behind</div>
            <h3 style="margin-top:12px">COMBAT</h3>
            <div class="kr">${k('LMB')} Turret gun &nbsp; ${k('RMB')} Side gun &nbsp; ${k('R')} Reload</div>
            <div class="kr">${k('Q')} Gadget (mines, hop, pulse, turret...)</div>
            <p>Ramming enemies at speed sends them flying. Heads are weak points — aim high for crits.</p>
          </div>
          <div>
            <h3>LOOT & ROGUELIKE</h3>
            <div class="kr">${k('E')} Equip / Interact &nbsp; ${k('F')} Stash &nbsp; ${k('X')} Salvage</div>
            <div class="kr">${k('TAB')} Garage / Inventory &nbsp; ${k('M')} Map &nbsp; ${k('ESC')} Pause</div>
            <div class="kr">${k('1')}${k('2')}${k('3')} Pick a perk on level up &nbsp; ${k('T')} Reroll</div>
            <p>Each floor: find the <b>Keystone</b> (guarded in the Elite room, marked pink on the minimap), then reach the <b>Exit Portal</b>. Choose your next road — each portal has a modifier.</p>
            <p>Every 3rd floor is a <b>BOSS</b>. Beat all three to escape rich.</p>
            <p>Rarity: <span class="r0">Common</span> · <span class="r1">Uncommon</span> · <span class="r2">Rare</span> · <span class="r3">Epic</span> · <span class="r4">Legendary</span>. Elements: Fire burns flesh, Corrosive melts armor, Shock wrecks shields & spirits, Cryo freezes.</p>
            <p>When your hull hits zero you enter <b>LAST GEAR</b> — get a kill before the timer ends for a Second Wind!</p>
            <p>Die, earn Crowns, upgrade the Garage, drive again.</p>
          </div>
        </div>
        <div style="margin-top:16px"><button class="btn" data-a="back"><span>BACK</span></button></div>
      </div>`);
    this.bind('[data-a=back]', () => (this.back === 'pause' ? this.showPause() : this.showTitle()));
  }

  // ---------------------------------------------------------------- settings
  showSettings(back: Screen) {
    this.back = back;
    const s = Save.settings;
    const sl = (key: keyof Settings, label: string, min: number, max: number, step: number) => `<div class="set-row"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"/></div>`;
    const cb = (key: keyof Settings, label: string) => `<div class="set-row"><span>${label}</span><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}/></div>`;
    this.open('settings', `
      <div class="panel-screen interactive" style="width:min(900px,94vw)">
        <div class="ps-head"><div class="ps-title">SETTINGS</div></div>
        <div class="settings-grid">
          ${sl('masterVol', 'MASTER VOLUME', 0, 1, 0.05)}
          ${sl('musicVol', 'MUSIC', 0, 1, 0.05)}
          ${sl('sfxVol', 'SOUND FX', 0, 1, 0.05)}
          ${sl('sensitivity', 'MOUSE SENSITIVITY', 0.2, 3, 0.05)}
          ${sl('fov', 'FIELD OF VIEW', 55, 95, 1)}
          ${sl('screenShake', 'SCREEN SHAKE', 0, 1.5, 0.05)}
          <div class="set-row"><span>STEERING</span><select data-k="steerMode"><option value="camera" ${s.steerMode === 'camera' ? 'selected' : ''}>Camera steer (Borderlands)</option><option value="classic" ${s.steerMode === 'classic' ? 'selected' : ''}>Classic A/D (GTA)</option></select></div>
          <div class="set-row"><span>GRAPHICS</span><select data-k="quality"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option><option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Medium</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low</option></select></div>
          ${cb('invertY', 'INVERT Y')}
          ${cb('aimAssist', 'AIM ASSIST')}
          ${cb('damageNumbers', 'DAMAGE NUMBERS')}
          ${cb('showFps', 'SHOW FPS')}
        </div>
        <div style="margin-top:18px"><button class="btn" data-a="back"><span>BACK</span></button></div>
      </div>`);
    this.screenEl.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener('input', () => {
        const k = (el as HTMLElement).dataset.k as keyof Settings;
        const inp = el as HTMLInputElement;
        const v: unknown = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? Number(inp.value) : inp.value;
        (Save.settings as unknown as Record<string, unknown>)[k] = v;
        Save.save();
        this.game.applySettings();
      });
    });
    this.bind('[data-a=back]', () => (this.back === 'pause' ? this.showPause() : this.showTitle()));
  }

  // ---------------------------------------------------------------- pause
  showPause() {
    const run = this.game.run;
    if (!run) return;
    this.open('pause', `
      <div class="title-menu interactive" style="bottom:auto;top:22vh">
        <div class="ps-title" style="font-size:70px;margin-bottom:24px">PAUSED</div>
        <div class="mi interactive" data-a="resume">RESUME</div>
        <div class="mi interactive" data-a="loadout">GARAGE / LOADOUT</div>
        <div class="mi interactive" data-a="howto">HOW TO PLAY</div>
        <div class="mi interactive" data-a="settings">SETTINGS</div>
        <div class="mi interactive" data-a="abandon">ABANDON RUN</div>
      </div>
      <div class="title-side"><div class="p-panel" style="padding:16px 22px;text-align:left;min-width:280px">
        <div class="slash-title" style="font-size:26px;color:var(--red)">RUN #${run.runNumber}</div>
        <div style="font-size:18px;margin-top:6px">${run.floorLabel} · ${run.floorName}</div>
        <div style="font-size:18px">Kills ${run.counters.kills} · Gold ${formatNum(run.gold)}</div>
        <div style="font-size:18px">Level ${run.level} · ${run.relics.length} relics</div>
        <div style="font-size:18px">Time ${Math.floor(run.counters.time / 60)}:${String(Math.floor(run.counters.time % 60)).padStart(2, '0')}</div>
      </div></div>`);
    this.bind('[data-a=resume]', () => this.game.resume());
    this.bind('[data-a=loadout]', () => this.showLoadout());
    this.bind('[data-a=howto]', () => this.showHowTo('pause'));
    this.bind('[data-a=settings]', () => this.showSettings('pause'));
    this.bind('[data-a=abandon]', (el) => {
      if (el.dataset.confirm) {
        this.close();
        this.game.gameOver();
      } else {
        el.dataset.confirm = '1';
        el.textContent = 'REALLY? (CLICK)';
      }
    });
  }

  // ---------------------------------------------------------------- loadout
  showLoadout() {
    const run = this.game.run;
    const w = this.game.world;
    if (!run || !w) return;
    const st = run.stats;
    const sel = this.loadoutSel;
    let selItem: Item | null = null;
    if (sel?.where === 'eq') selItem = run.equipped[sel.slot as keyof typeof run.equipped];
    if (sel?.where === 'bp') selItem = run.backpack[sel.idx!] ?? null;
    const slots = SLOTS.map((s) => {
      const it = run.equipped[s];
      return `<div class="slot-row interactive ${sel?.where === 'eq' && sel.slot === s ? 'sel' : ''} ${it ? 'bg-r' + it.rarity : ''}" data-slot="${s}"><div class="sbg jag-${it ? 'r' + it.rarity : 'grey'}"></div>
        <div class="sart ${it ? '' : 'empty'}">${itemArt(it, s)}</div>
        <div><div class="sn">${SLOT_NAMES[s]}</div>
        <div class="sv ${it ? 'r' + it.rarity : ''}">${it ? it.name : '— empty —'}${it ? `<small>Lv ${it.level} ${RARITY[it.rarity].name}</small>` : ''}</div></div></div>`;
    }).join('');
    const bp = Array.from({ length: run.backpackSize }, (_, i) => {
      const it = run.backpack[i];
      if (!it) return `<div class="bp-cell empty"><div class="bbg jag-grey"></div>+</div>`;
      return `<div class="bp-cell interactive bg-r${it.rarity} ${sel?.where === 'bp' && sel.idx === i ? 'sel' : ''}" data-bp="${i}"><div class="bbg jag-r${it.rarity}"></div>${itemArt(it, it.slot)}<div class="r${it.rarity}">${it.name}<small>${SLOT_NAMES[it.slot]} Lv${it.level}</small></div></div>`;
    }).join('');
    const eqForCmp = selItem && sel?.where === 'bp' ? run.equipped[selItem.slot] : null;
    const detail = selItem ? `
      <div class="row" style="flex-wrap:wrap;gap:6px;justify-content:center">${eqForCmp ? `<div style="transform:scale(.8);transform-origin:top center;margin:0 -30px -30px"><div class="lbl">EQUIPPED</div>${itemCardHTML(eqForCmp)}</div>` : ''}<div>${sel?.where === 'bp' ? '<div class="lbl">SELECTED</div>' : ''}${itemCardHTML(selItem, eqForCmp)}</div></div>
      <div class="row" style="justify-content:center;margin-top:12px;flex-wrap:wrap;gap:10px">
        ${sel?.where === 'bp' ? `<button class="btn gold" data-a="equip"><span>EQUIP</span></button>` : ''}
        ${sel?.where === 'eq' && run.backpack.length < run.backpackSize && !['main'].includes(selItem.slot) ? `<button class="btn" data-a="unequip"><span>STASH</span></button>` : ''}
        <button class="btn" data-a="salvage" style="font-size:19px"><span>SALVAGE +${run.salvageValue(selItem)}</span></button>
      </div>` : `<div style="text-align:center;color:#a9a597;font-weight:800;font-style:italic;font-size:22px;margin:22px 0;text-transform:uppercase">Select a part to inspect it</div>`;
    const syn = activeSynergies(run.relics);
    const tc = tagCounts(run.relics);
    const relics = run.relics.map((id) => {
      const r = RELIC_MAP.get(id)!;
      return `<div class="relic-row" title="${r.desc}"><div class="relic-ico" style="--rc:${r.color}">${icon(r.icon, '', 20, r.color)}</div><div><b style="color:${r.color}">${r.name}</b><br/>${r.desc}</div></div>`;
    }).join('') || '<div style="color:#8f8b7d;font-weight:700">No relics yet. Find altars, shops and bosses.</div>';
    const perks = Object.entries(run.perks).map(([id, n]) => `${PERK_MAP.get(id)?.name} ${n > 1 ? '×' + n : ''}`).join(' · ') || '—';
    const synText = SYNERGIES.map((s) => {
      const have = tc.get(s.tag) ?? 0;
      const on = syn.includes(s);
      return `<div style="font-weight:800;font-style:italic;font-size:15px;color:${on ? '#ffcb2f' : have ? '#c8c4b4' : '#5d5b55'}">${on ? '★' : '☆'} ${s.name} (${s.tag} ${have}/${s.need})</div>`;
    }).join('');
    const mainDps = w.player.weapons[0] ? Math.round((w.player.weapons[0].item.w!.damage * st.dmg * w.player.weapons[0].fireRate * w.player.weapons[0].item.w!.pellets)) : 0;
    const statsHtml = `<div class="stat-sheet">
            <span>Max Hull</span><b>${Math.round(st.maxHp)}</b><span>Shield</span><b>${Math.round(st.maxShield)}</b>
            <span>Armor</span><b>${Math.round(st.armor)}</b><span>Top Speed</span><b>${Math.round(st.topSpeed * 3)} km/h</b>
            <span>Weapon Dmg</span><b>${Math.round(st.dmg * 100)}%</b><span>Turret DPS</span><b>${formatNum(mainDps)}</b>
            <span>Crit</span><b>${Math.round(st.critChance * 100)}% ×${st.critDmg.toFixed(1)}</b><span>Fire Rate</span><b>${Math.round(st.fireRate * 100)}%</b>
            <span>Ram Damage</span><b>${Math.round(st.ramDamage * 100)}%</b><span>Luck</span><b>${Math.round(st.luck)}</b>
          </div>`;
    this.open('loadout', `
      <div class="lo-title interactive"><div class="ps-title">LOADOUT</div><div class="row" style="align-items:center;gap:10px"><div class="crowns">${artImg('pk_coin')} ${formatNum(run.gold)}</div><div class="crowns">${icon('key', '', 28, '#ffd23a')} ${run.keys}</div></div></div>
      <div class="lo-left interactive"><div class="lo-bg jag-a"></div>
        <div class="lbl">EQUIPPED — ${run.chassis.name}</div>
        <div class="slot-list">${slots}</div>
        <div class="lbl lo-stats">STATS</div>${statsHtml}
      </div>
      <div class="lo-right interactive"><div class="lo-bg jag-b"></div>
        ${detail}
        <div class="lbl" style="margin-top:12px">BACKPACK (${run.backpack.length}/${run.backpackSize})</div>
        <div class="bp-grid">${bp}</div>
        <div class="lbl lo-relics">RELICS</div><div class="relic-list">${relics}</div>
        <div class="lbl" style="margin-top:8px">SYNERGIES</div>${synText}
      </div>
      <div class="perk-strip">PERKS: ${perks}</div>
      <div class="lo-actions interactive"><button class="btn" data-a="close"><span>BACK TO THE ROAD [TAB]</span></button></div>`, false);
    this.bind('[data-slot]', (el) => {
      this.loadoutSel = { where: 'eq', slot: el.dataset.slot };
      this.showLoadout();
    });
    this.bind('[data-bp]', (el) => {
      this.loadoutSel = { where: 'bp', idx: Number(el.dataset.bp) };
      this.showLoadout();
    });
    this.bind('[data-a=equip]', () => {
      if (!selItem) return;
      const old = run.equip(selItem);
      if (old) run.backpack.push(old);
      w.player.refreshLoadout();
      audio.play('pickup');
      this.loadoutSel = { where: 'eq', slot: selItem.slot };
      this.showLoadout();
    });
    this.bind('[data-a=unequip]', () => {
      if (!selItem || sel?.where !== 'eq') return;
      run.equipped[selItem.slot] = null;
      run.backpack.push(selItem);
      run.recompute();
      w.player.refreshLoadout();
      this.loadoutSel = null;
      this.showLoadout();
    });
    this.bind('[data-a=salvage]', () => {
      if (!selItem) return;
      if (sel?.where === 'eq') {
        run.equipped[selItem.slot] = null;
        run.recompute();
        w.player.refreshLoadout();
      } else run.backpack.splice(sel!.idx!, 1);
      run.addGold(run.salvageValue(selItem));
      audio.play('purchase');
      this.loadoutSel = null;
      this.showLoadout();
    });
    this.bind('[data-a=close]', () => this.game.resume());
  }

  // ---------------------------------------------------------------- shop
  openShop(entries: ShopEntry[], w: World) {
    const run = w.run;
    const render = () => {
      const cards = entries.map((e, i) => {
        let inner = '';
        if (e.kind === 'item' && e.item) inner = itemCardHTML(e.item, run.equipped[e.item.slot]);
        else if (e.kind === 'relic' && e.relic) {
          const r = RELIC_MAP.get(e.relic)!;
          inner = `<div class="simple-card" style="--rc:${r.color}"><div class="sbg jag-a"></div><div class="in">${icon(r.icon, '', 30, r.color)} ${r.name}</div><div class="id">${r.desc}</div><div class="id" style="color:#888">RELIC · ${r.tags.join(' / ')}</div></div>`;
        } else if (e.kind === 'repair') inner = `<div class="simple-card" style="--rc:#60ff8a"><div class="sbg jag-r1"></div><div class="in">${icon('wrench', '', 30, '#60ff8a')} Full Repair</div><div class="id">Restore hull and shields completely.</div></div>`;
        else if (e.kind === 'key') inner = `<div class="simple-card" style="--rc:#ffd23a"><div class="sbg jag-gold"></div><div class="in">${icon('key', '', 30, '#ffd23a')} Dungeon Key</div><div class="id">Opens golden chests and vaults.</div></div>`;
        else inner = `<div class="simple-card" style="--rc:#40b0ff"><div class="sbg jag-r2"></div><div class="in">${icon('engine', '', 30, '#40b0ff')} Nitro Refill</div><div class="id">Fill the tank. Go fast.</div></div>`;
        const afford = run.gold >= e.price;
        return `<div class="shop-entry ${e.sold ? 'sold' : ''}">${inner}<div class="price"><div class="crowns" style="font-size:24px;padding:3px 22px 1px 14px">${artImg('pk_coin', 26)} ${formatNum(e.price)}</div><button class="btn gold" data-buy="${i}" ${afford && !e.sold ? '' : 'disabled'}><span>${e.sold ? 'SOLD' : 'BUY'}</span></button></div></div>`;
      }).join('');
      this.open('shop', `
        <div class="panel-screen interactive">
          <div class="ps-head"><div class="row" style="align-items:center">${portraitFrame('wink', 118)}<div><div class="ps-title">GOBLIN MERCHANT</div><div class="ps-sub" style="margin-top:8px">"Shiny things for shiny coins. No refunds. No questions."</div></div></div><div class="crowns">${artImg('pk_coin')} ${formatNum(run.gold)}</div></div>
          <div class="shop-grid">${cards}</div>
          <div class="row" style="justify-content:space-between;margin-top:16px"><button class="btn" data-a="close"><span>LEAVE [ESC]</span></button><button class="btn" data-a="reroll" ${run.gold >= this.rerollCost(run) ? '' : 'disabled'}><span>REROLL ITEMS (${this.rerollCost(run)} GOLD)</span></button></div>
        </div>`);
      this.bind('[data-buy]', (el) => {
        const e = entries[Number(el.dataset.buy)];
        if (e.sold || run.gold < e.price) return;
        run.gold -= e.price;
        e.sold = true;
        audio.play('purchase');
        if (e.kind === 'item' && e.item) {
          const p = w.player;
          w.pickups.dropItem(e.item, p.pos.x + Math.sin(p.heading) * 5, p.pos.z + Math.cos(p.heading) * 5, false, false);
          this.toast('PURCHASED', `${e.item.name} dropped by your car`, RARITY[e.item.rarity].color);
        } else if (e.kind === 'relic' && e.relic) {
          run.addRelic(e.relic);
          w.player.refreshLoadout();
        } else if (e.kind === 'repair') {
          run.hp = run.stats.maxHp;
          run.shield = run.stats.maxShield;
        } else if (e.kind === 'key') {
          run.keys++;
          e.sold = false;
          e.price = Math.round(e.price * 1.5);
        } else run.nitro = run.stats.boostMax;
        render();
      });
      this.bind('[data-a=reroll]', () => {
        const c = this.rerollCost(run);
        if (run.gold < c) return;
        run.gold -= c;
        (run as any).shopRerolls = ((run as any).shopRerolls ?? 0) + 1;
        for (const e of entries) {
          if (e.kind !== 'item') continue;
          e.item = generateItem(run.lootRng, { level: run.depthLevel + 1, luck: run.stats.luck + 8, minRarity: 1 });
          e.price = Math.round(e.item.value * 1.6 * run.priceMult());
          e.sold = false;
        }
        audio.play('purchase');
        render();
      });
      this.bind('[data-a=close]', () => this.game.resume());
    };
    render();
    audio.play('uiOpen');
  }

  private rerollCost(run: Run) {
    return Math.round(30 * (1 + run.floor * 0.3) * (1 + ((run as any).shopRerolls ?? 0) * 0.5));
  }

  // ---------------------------------------------------------------- shrine
  openShrine(def: ShrineDef, w: World) {
    const run = w.run;
    const goldCost = Math.round(90 * (1 + run.floor * 0.35));
    const forgeCost = Math.round(160 * (1 + run.floor * 0.35));
    let body = '';
    if (def.id === 'blood') body = `<button class="btn gold" data-a="accept"><span>OFFER ${Math.round(run.stats.maxHp * 0.25)} HULL</span></button>`;
    else if (def.id === 'gamble') body = `<button class="btn gold" data-a="accept" ${run.gold >= goldCost ? '' : 'disabled'}><span>PAY ${goldCost} GOLD</span></button>`;
    else if (def.id === 'fountain') body = `<button class="btn gold" data-a="accept"><span>DRINK DEEP</span></button>`;
    else {
      const ws = (['main', 'side'] as const).filter((s) => run.equipped[s] && run.equipped[s]!.rarity < 4);
      body = ws.map((s) => `<button class="btn gold" data-forge="${s}" ${run.gold >= forgeCost ? '' : 'disabled'}><span>REFORGE ${run.equipped[s]!.name.toUpperCase()} (${forgeCost})</span></button>`).join('') || '<div>No weapon can be improved further.</div>';
    }
    this.open('shrine', `
      <div class="panel-screen interactive" style="width:min(760px,94vw);text-align:center">
        <div class="ps-title" style="display:inline-block">${def.name.toUpperCase()}</div>
        <div style="font-size:22px;margin:18px 0;color:#ddd">${def.desc}</div>
        <div class="row" style="justify-content:center;flex-wrap:wrap">${body}<button class="btn" data-a="leave"><span>LEAVE</span></button></div>
      </div>`);
    const done = (title: string, sub: string, color: string) => {
      def.used = true;
      this.game.resume();
      this.toast(title, sub, color);
    };
    this.bind('[data-a=accept]', () => {
      if (def.id === 'blood') {
        run.hp = Math.max(1, run.hp - run.stats.maxHp * 0.25);
        const owned = new Set(run.relics);
        const pool = RELICS.filter((r) => !owned.has(r.id));
        const rel = pool[Math.floor(Math.random() * pool.length)];
        if (rel) {
          run.addRelic(rel.id);
          w.player.refreshLoadout();
          audio.play('keystone');
          done(rel.name.toUpperCase(), rel.desc, rel.color);
        } else done('THE ALTAR IS SATED', '', '#ff2040');
      } else if (def.id === 'gamble') {
        run.gold -= goldCost;
        const roll = Math.random();
        if (roll < 0.15) {
          audio.play('uiError');
          done('NOTHING!', 'The idol laughs at you.', '#888');
        } else {
          const rar = (roll > 0.93 ? 4 : roll > 0.7 ? 3 : roll > 0.4 ? 2 : 1) as Rarity;
          const it = generateItem(run.lootRng, { level: run.depthLevel + 1, rarity: rar });
          w.pickups.dropItem(it, w.player.pos.x + 4, w.player.pos.z + 4);
          done('JACKPOT?', it.name, RARITY[rar].color);
        }
      } else if (def.id === 'fountain') {
        run.hp = run.stats.maxHp;
        run.shield = run.stats.maxShield;
        run.nitro = run.stats.boostMax;
        audio.play('heal');
        done('REFRESHED', 'Hull, shields and nitro restored', '#40d0ff');
      }
    });
    this.bind('[data-forge]', (el) => {
      const slot = el.dataset.forge as 'main' | 'side';
      const old = run.equipped[slot];
      if (!old || run.gold < forgeCost) return;
      run.gold -= forgeCost;
      const it = generateItem(run.lootRng, { level: Math.max(old.level, run.depthLevel) + 1, slot, rarity: Math.min(4, old.rarity + 1) as Rarity });
      run.equip(it);
      w.player.refreshLoadout();
      audio.play('lootDrop', { pitch: it.rarity });
      done('REFORGED!', it.name, RARITY[it.rarity].color);
    });
    this.bind('[data-a=leave]', () => this.game.resume());
  }

  // ---------------------------------------------------------------- relic choice
  openRelicChoice(ids: string[], cb: (id: string | null) => void) {
    const cards = ids.map((id, i) => {
      const r = RELIC_MAP.get(id)!;
      return `<div class="relic-card interactive" data-i="${i}" style="--rc:${r.color}"><div class="rbg jag-${'abc'[i % 3]}"></div>
        <span class="keycap" style="align-self:flex-start">${i + 1}</span>
        <div class="relic-big">${icon(r.icon, '', 60, r.color)}</div>
        <div class="rn" style="color:${r.color}">${r.name.toUpperCase()}</div>
        <div class="rd">${r.desc}</div>
        <div class="rt">${r.tags.map((t) => `<span>${t}</span>`).join('')}${r.cursed ? '<span style="border-color:#f33;color:#f55">cursed</span>' : ''}</div>
      </div>`;
    }).join('');
    this.open('relic', `
      <div class="panel-screen interactive" style="width:min(1000px,94vw);text-align:center">
        <div class="ps-title" style="display:inline-block">CHOOSE A RELIC</div>
        <div class="ps-sub" style="margin:10px 0">Relics with matching tags build Synergies.</div>
        <div class="relic-choice">${cards}</div>
        <div style="margin-top:16px"><button class="btn" data-a="skip"><span>SKIP</span></button></div>
      </div>`);
    this.relicCb = (i: number) => {
      this.relicCb = null;
      this.game.resume();
      cb(i >= 0 ? ids[i] : null);
    };
    this.bind('.relic-card', (el) => this.relicCb?.(Number(el.dataset.i)));
    this.bind('[data-a=skip]', () => this.relicCb?.(-1));
  }
  relicCb: ((i: number) => void) | null = null;

  // ---------------------------------------------------------------- results
  showResults(win: boolean, run: Run, crowns: number) {
    this.hud.show(false);
    const c = run.counters;
    const t = `${Math.floor(c.time / 60)}:${String(Math.floor(c.time % 60)).padStart(2, '0')}`;
    const stat = (k: string, v: string) => `<div class="rstat"><div class="rsb jag-${'abcde'[k.length % 5]}"></div><div class="v">${v}</div><div class="k">${k}</div></div>`;
    this.open('results', `
      <div class="panel-screen interactive results ${win ? 'win' : ''}" style="width:min(1000px,94vw)">
        <div class="rbig">${win ? 'RICH & ALIVE!' : 'WRECKED!'}</div>
        <div style="font-family:var(--f-head);font-size:24px;margin-top:10px">${win ? 'You escaped the dungeon with the loot. Legends will be told. Loudly.' : `Your ${run.chassis.name} was scrapped on ${run.floorLabel} — ${run.floorName}.`}</div>
        <div class="rgrid">
          ${stat('FLOOR REACHED', run.floorLabel)}${stat('KILLS', formatNum(c.kills))}${stat('DAMAGE DEALT', formatNum(c.damageDealt))}${stat('GOLD EARNED', formatNum(c.goldEarned))}
          ${stat('LOOT FOUND', String(c.itemsFound))}${stat('LEGENDARIES', String(c.legendaries))}${stat('BOSSES', String(c.bossesKilled))}${stat('TIME', t)}
          ${stat('RAMS', String(c.rams))}${stat('DRIFT TIME', Math.round(c.driftTime) + 's')}${stat('ROOMS CLEARED', String(c.roomsCleared))}${stat('LEVEL', String(run.level))}
        </div>
        ${c.bestItem ? `<div style="display:flex;justify-content:center;margin:10px 0"><div><div class="lbl">BEST FIND</div>${itemCardHTML(c.bestItem)}</div></div>` : ''}
        <div class="crowns" style="font-size:40px;margin:8px 0">${artImg('icon_crown', 38)} +${crowns} CROWNS</div>
        <div class="row" style="justify-content:center;margin-top:16px">
          <button class="btn gold" data-a="again"><span>DRIVE AGAIN</span></button>
          <button class="btn" data-a="garage"><span>GARAGE</span></button>
          <button class="btn" data-a="title"><span>TITLE</span></button>
        </div>
      </div>`);
    this.bind('[data-a=again]', () => {
      this.close();
      this.game.startRun(Save.data.lastCar);
    });
    this.bind('[data-a=garage]', () => {
      this.game.toTitle();
      this.showGarage();
    });
    this.bind('[data-a=title]', () => this.game.toTitle());
  }

  // ---------------------------------------------------------------- keyboard in modals
  handleModalKey(k: 'choice1' | 'choice2' | 'choice3' | 'pause' | 'loadout') {
    if (this.screen === 'relic' && this.relicCb && k.startsWith('choice')) {
      this.relicCb(Number(k.slice(-1)) - 1);
      return true;
    }
    return false;
  }
}
