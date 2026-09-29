import * as THREE from 'three';
import type { World } from '../game/World';
import type { Game } from '../game/Game';
import type { Enemy } from '../entities/Enemy';
import { icon, ELEMENT_ICON } from './Icons';
import { portraitHTML, SPEAKERS, type Mood } from './Portrait';
import { artImg, artSrc, itemArt, itemArtName } from './ArtIcons';
import { pickBark } from './Barks';
import { itemCardHTML, slotIcon } from './ItemCard';
import { RARITY, GADGET_INFO, type Item } from '../loot/Items';
import { RELIC_MAP, activeSynergies } from '../loot/Relics';
import { PERK_MAP, rollPerkChoices, type PerkDef } from '../loot/Perks';
import { ELEMENT_HEX, type Element } from '../fx/FX';
import { TILE, Tile } from '../world/DungeonGen';
import { Save } from '../core/Save';
import { audio } from '../audio/Audio';
import { clamp, formatNum } from '../core/MathUtil';
import { ELITE_INFO } from '../entities/Enemy';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const tmpV = new THREE.Vector3();

interface Num {
  el: HTMLDivElement;
  x: number; y: number; z: number;
  vy: number;
  life: number;
  max: number;
  scale: number;
  ox: number;
}

export class HUD {
  root: HTMLDivElement;
  private els: Record<string, HTMLElement> = {};
  private nums: Num[] = [];
  private numPool: HTMLDivElement[] = [];
  private ebars: HTMLDivElement[] = [];
  private glabels: HTMLDivElement[] = [];
  private mapBase: HTMLCanvasElement | null = null;
  private mapScale = 4;
  private mapKey = '';
  private mapCtx: CanvasRenderingContext2D;
  private toastQ: { t: string; s: string; c: string }[] = [];
  private toastT = 0;
  private barkT = 0;
  private barkPrio = 0;
  private comboT = 0;
  private hmT = 0;
  private hitdirT = 0;
  private lastText = new Map<HTMLElement, string>();
  private hpLagW = 1;
  private shLagW = 1;
  perkChoices: PerkDef[] | null = null;
  private lastLoot: Item | null = null;
  private lastInteract = '';
  private lowHpWarned = false;
  private bigmapOpen = false;
  private fpsT = 0;
  private fpsN = 0;
  private bossRef: Enemy | null = null;
  private glyphImgs: Record<string, HTMLImageElement> = {};

  constructor(private game: Game, parent: HTMLElement) {
    const r = document.createElement('div');
    r.id = 'hud';
    r.className = 'hidden';
    r.innerHTML = `
      <div class="tl z">
        <div class="run-banner"><div class="rb-bg jag-a"></div>${artImg('icon_crown', 0, 'rb-crown')}<div class="rb-txt"><div class="rb1">RUN <b class="rnum"></b></div><div class="rb2"></div></div></div>
        <div class="objective"><div class="obg jag-b"></div><div class="ot"></div><div class="olines"></div></div>
      </div>
      <div class="minimap-wrap z"><div class="mmbg jag-c"></div>
        <div class="mm-head"><span class="fl"></span><span class="fn"></span></div>
        <div class="mm-body"><canvas width="214" height="172"></canvas>
          <div class="mm-legend"><div><i class="tri"></i>You</div><div><i class="sq"></i>Room</div><div>${artImg('icon_treasure')}Treasure</div><div>${artImg('icon_enemy')}Enemy</div><div>${artImg('icon_shop')}Shop</div><div>${artImg('icon_rest')}Rest</div><div>${artImg('icon_boss')}Boss</div></div>
        </div>
      </div>
      <div class="mods-row z"></div>
      <div class="boss-bar hidden z"><div class="bicon">${artImg('icon_boss')}</div><div class="bbody"><div class="bname"></div><div class="bsub"></div><div class="btrack"><div class="blag"></div><div class="bfill"></div><div class="bshield hidden"></div><div class="bphase" style="left:60%"></div><div class="bphase" style="left:30%"></div></div></div></div>
      <div id="labels"></div>
      <div id="numbers"></div>
      <div id="crosshair"><svg class="ch" viewBox="0 0 36 36"><g stroke="#fff" stroke-width="3" stroke-linecap="square"><path d="M18 4v7M18 25v7M4 18h7M25 18h7"/></g><g stroke="#000" stroke-width="1"><path d="M18 4v7M18 25v7M4 18h7M25 18h7" fill="none"/></g><circle cx="18" cy="18" r="1.8" fill="#fff" stroke="#000"/></svg><svg class="hm" viewBox="0 0 48 48"><g stroke-width="4" stroke-linecap="square"><path d="M10 10l8 8M38 10l-8 8M10 38l8-8M38 38l-8-8"/></g></svg></div>
      <div class="hitdir"><i></i></div>
      <div class="navigator off z"><div class="pframe"></div><div class="bubble"><div class="bbg slab-dark-b"></div><div class="who">SPROCKET</div><span class="bt"></span></div></div>
      <div class="status z">
        <div class="car-badge">${artImg('hud_car')}<span class="lvl"></span></div>
        <div class="col">
          <div class="synergy-tag hidden"></div>
          <div class="bars">
            <div class="bar hp"><div class="lag"></div><div class="fill"></div>${artImg('icon_heart', 0, 'bi')}<div class="txt"></div></div>
            <div class="bar sh"><div class="lag"></div><div class="fill"></div>${artImg('icon_shieldstat', 0, 'bi')}<div class="txt"></div></div>
          </div>
          <div class="xprow"><div class="xpbar"><div class="fill"></div></div><div class="relics"></div></div>
        </div>
      </div>
      <div class="speedo z">
        <div class="abilities">
          <div class="ability boost"><div class="frame"><img class="bg" src="${artSrc('ab_boost')}" alt=""/><div class="cdv"></div></div><div class="kc"><span class="keycap">SHIFT</span>Boost</div></div>
          <div class="ability gad"><div class="frame"><img class="bg" src="${artSrc('ab_mine')}" alt=""/><div class="gi"></div><div class="cdv"></div><div class="cdt"></div><span class="chg"></span></div><div class="kc"><span class="keycap">Q</span><span class="gname">Gadget</span></div></div>
          <div class="ability horn"><div class="frame"><img class="bg" src="${artSrc('ab_ram')}" alt=""/><div class="cdv"></div></div><div class="kc"><span class="keycap">H</span>Horn</div></div>
        </div>
        <div class="speed-box"><svg viewBox="0 0 210 100"><path d="M6 96 L44 26 Q52 12 68 12 L206 12 L192 46 L84 46 Q72 46 68 56 L44 96 Z" fill="#09090c" stroke="#f4f1e8" stroke-width="3" stroke-linejoin="miter"/><path class="sarc" d="M14 94 L50 30 Q56 19 70 19 L200 19" fill="none" stroke="#ff2a3c" stroke-width="9" stroke-dasharray="300" stroke-dashoffset="300"/></svg><div class="speed-num">0</div><div class="speed-unit">KM/H</div></div>
        <div class="nitro-col"><span class="lbl">NITRO</span><div class="nitro"><div class="fill"></div></div><span class="lbl">DRIFT [SPACE]</span><div class="drift-meter"><i></i><i></i><i></i></div></div>
      </div>
      <div class="weapons z">
        <div class="perks hidden"><div class="ph"><div class="pt">CHOOSE A PERK</div><div class="prr"></div></div><div class="pcards"></div></div>
        <div class="currency"><div class="cur">${artImg('pk_coin')}<span class="gold">0</span></div><div class="cur">${icon('key', '', 28, '#ffd23a')}<span class="keys">0</span></div><div class="cur ks hidden">${icon('portal', '', 26, '#40b0ff')}<span class="kst">0</span></div></div>
        <div class="wpanel side"><div class="wbg jag-d"></div><span class="mb keycap">RMB</span><div class="wico"></div><div class="winfo"><div class="wname"></div><div class="wsub"></div></div><div class="ammo"></div><div class="reload"></div><div class="rl"></div></div>
        <div class="wpanel main"><div class="wbg jag-a"></div><span class="mb keycap">LMB</span><div class="wico"></div><div class="winfo"><div class="wname"></div><div class="wsub"></div></div><div class="ammo"></div><div class="reload"></div><div class="rl"></div></div>
      </div>
      <div class="prompt hidden"><div class="pr"></div><div class="ps"></div></div>
      <div class="loot-card hidden z"></div>
      <div class="toast hidden"><div class="tt"></div><div class="ts"></div></div>
      <div class="combo hidden"></div>
      <div class="downed hidden"><div class="dt">LAST GEAR!</div><div class="ds">GET A KILL TO RESTART YOUR ENGINE</div><div class="dbar"><i></i></div></div>
      <div class="click-hint hidden interactive">CLICK TO DRIVE</div>
      <div class="bigmap hidden"><div class="bmt">MAP</div><canvas></canvas></div>
      <div class="fps hidden"></div>
    `;
    parent.appendChild(r);
    this.root = r;
    const q = (s: string) => $(r, s);
    this.els = {
      ot: q('.objective .ot'), olines: q('.objective .olines'), rnum: q('.run-banner .rnum'), rb2: q('.run-banner .rb2'),
      fl: q('.mm-head .fl'), fn: q('.mm-head .fn'), mods: q('.mods-row'),
      boss: q('.boss-bar'), bname: q('.bname'), bsub: q('.bsub'), bfill: q('.bfill'), blag: q('.blag'), bshield: q('.bshield'),
      labels: q('#labels'), numbers: q('#numbers'), cross: q('#crosshair'), hm: q('#crosshair .hm'), hitdir: q('.hitdir'), hitdirI: q('.hitdir i'),
      nav: q('.navigator'), pframe: q('.pframe'), bt: q('.bubble .bt'), who: q('.bubble .who'),
      lvl: q('.car-badge .lvl'), relics: q('.relics'), syn: q('.synergy-tag'),
      hpFill: q('.bar.hp .fill'), hpLag: q('.bar.hp .lag'), hpTxt: q('.bar.hp .txt'),
      shFill: q('.bar.sh .fill'), shLag: q('.bar.sh .lag'), shTxt: q('.bar.sh .txt'), xp: q('.xpbar .fill'),
      gad: q('.ability.gad'), gadImg: q('.ability.gad img.bg'), gadName: q('.ability.gad .gname'), gadCd: q('.ability.gad .cdv'), gadT: q('.ability.gad .cdt'), gadChg: q('.ability.gad .chg'),
      horn: q('.ability.horn'), hornCd: q('.ability.horn .cdv'), boost: q('.ability.boost'), boostCd: q('.ability.boost .cdv'),
      sarc: q('.sarc'), speed: q('.speed-num'), nitro: q('.nitro .fill'), drift: q('.drift-meter'),
      perks: q('.perks'), pcards: q('.pcards'), prr: q('.prr'),
      gold: q('.gold'), keys: q('.keys'), ks: q('.cur.ks'), kst: q('.kst'),
      wMain: q('.wpanel.main'), wSide: q('.wpanel.side'),
      prompt: q('.prompt'), pr: q('.prompt .pr'), ps: q('.prompt .ps'),
      loot: q('.loot-card'), toast: q('.toast'), tt: q('.toast .tt'), ts: q('.toast .ts'), combo: q('.combo'),
      downed: q('.downed'), dbar: q('.downed .dbar i'), click: q('.click-hint'), bigmap: q('.bigmap'), fps: q('.fps'),
    };
    this.mapCtx = (q('.minimap-wrap canvas') as HTMLCanvasElement).getContext('2d')!;
    for (const n of ['icon_treasure', 'icon_enemy', 'icon_shop', 'icon_rest', 'icon_boss', 'icon_skull', 'icon_crown']) {
      const im = new Image();
      im.src = artSrc(n);
      this.glyphImgs[n] = im;
    }
    const applyScale = () => document.documentElement.style.setProperty('--s', String(clamp(window.innerHeight / 720, 0.85, 1.8)));
    applyScale();
    window.addEventListener('resize', applyScale);
    this.els.click.addEventListener('click', () => this.game.lockPointer());
    for (let i = 0; i < 26; i++) {
      const b = document.createElement('div');
      b.className = 'ebar hidden';
      b.innerHTML = '<i></i><b></b><span class="en"></span>';
      this.els.labels.appendChild(b);
      this.ebars.push(b);
    }
    for (let i = 0; i < 14; i++) {
      const g = document.createElement('div');
      g.className = 'glabel hidden';
      this.els.labels.appendChild(g);
      this.glabels.push(g);
    }
    this.els.pframe.innerHTML = portraitHTML('happy');
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  reset() {
    this.mapBase = null;
    this.mapKey = '';
    this.perkChoices = null;
    this.els.perks.classList.add('hidden');
    this.els.boss.classList.add('hidden');
    this.bossRef = null;
    this.els.downed.classList.add('hidden');
    for (const n of this.nums) this.releaseNum(n);
    this.nums = [];
    this.toastQ = [];
    this.lowHpWarned = false;
  }

  private setText(el: HTMLElement, t: string) {
    if (this.lastText.get(el) !== t) {
      el.textContent = t;
      this.lastText.set(el, t);
    }
  }
  private setHTML(el: HTMLElement, t: string) {
    if (this.lastText.get(el) !== t) {
      el.innerHTML = t;
      this.lastText.set(el, t);
    }
  }

  // ------------------------------------------------------------------ events
  damageNumber(x: number, y: number, z: number, amount: number, crit: boolean, el: Element, big = false) {
    if (!Save.settings.damageNumbers) return;
    if (this.nums.length > 70) this.releaseNum(this.nums.shift()!);
    const d = this.numPool.pop() ?? document.createElement('div');
    d.className = 'dmg' + (crit ? ' crit' : '');
    d.textContent = formatNum(amount);
    d.style.color = crit ? '' : el !== 'none' ? ELEMENT_HEX[el] : '#fff';
    this.els.numbers.appendChild(d);
    this.nums.push({ el: d, x, y, z, vy: 5 + Math.random() * 3, life: crit ? 1.1 : 0.8, max: crit ? 1.1 : 0.8, scale: big ? 1.3 : 1, ox: (Math.random() - 0.5) * 40 });
  }

  floatText(x: number, y: number, z: number, text: string, color: string) {
    const d = this.numPool.pop() ?? document.createElement('div');
    d.className = 'dmg float';
    d.textContent = text;
    d.style.color = color;
    this.els.numbers.appendChild(d);
    this.nums.push({ el: d, x, y, z, vy: 3, life: 1.3, max: 1.3, scale: 1, ox: 0 });
  }

  private releaseNum(n: Num) {
    n.el.remove();
    this.numPool.push(n.el);
  }

  hitMarker(crit: boolean, kill: boolean) {
    this.hmT = kill ? 0.25 : 0.1;
    (this.els.hm.querySelector('g') as SVGGElement).setAttribute('stroke', kill ? '#e8242f' : crit ? '#ffd23a' : '#fff');
  }

  hitDirection(angle: number) {
    this.hitdirT = 0.6;
    this.els.hitdir.style.transform = `rotate(${-angle}rad)`;
  }

  toast(t: string, s = '', c = '#e8242f') {
    if (this.toastQ.length > 3) this.toastQ.shift();
    this.toastQ.push({ t, s, c });
    if (this.toastT <= 0) this.nextToast();
  }
  private nextToast() {
    const n = this.toastQ.shift();
    if (!n) {
      this.els.toast.classList.add('hidden');
      return;
    }
    this.toastT = 1.9;
    const el = this.els.toast;
    el.classList.remove('hidden', 'hide', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    this.els.tt.textContent = n.t;
    this.els.tt.style.setProperty('--c', n.c);
    this.els.ts.textContent = n.s;
  }

  combo(n: number) {
    const names = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'QUAD KILL!', 'RAMPAGE!', 'CARNAGE!!', 'WRECKING CREW!!', 'UNSTOPPABLE!!!'];
    const t = n < names.length ? names[n] : `${n}× MAYHEM!!!`;
    const el = this.els.combo;
    el.textContent = t;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.classList.add('pop');
    this.comboT = 1.4;
  }

  bark(key: string) {
    const b = pickBark(key);
    if (!b) return;
    if (this.barkT > 0.8 && b.prio < this.barkPrio) return;
    this.say(b.text, b.mood, b.prio);
  }

  say(text: string, mood: Mood, prio = 0) {
    this.barkT = Math.min(5, 1.6 + text.length * 0.045);
    this.barkPrio = prio;
    this.els.pframe.innerHTML = portraitHTML(mood);
    this.els.who.textContent = SPEAKERS[mood].who;
    this.els.bt.textContent = text;
    this.els.nav.classList.remove('off');
  }

  bossBar(e: Enemy | null, title?: string, sub?: string) {
    this.bossRef = e;
    this.els.boss.classList.toggle('hidden', !e);
    if (e && title) {
      this.els.bname.textContent = title;
      this.els.bsub.textContent = sub ?? '';
    }
  }

  setDowned(v: boolean) {
    this.els.downed.classList.toggle('hidden', !v);
  }

  offerPerks(run: import('../game/Run').Run) {
    if (this.perkChoices || run.pendingPerks <= 0) return;
    this.perkChoices = rollPerkChoices(run.rng, run.perks, 3);
    if (!this.perkChoices.length) {
      run.pendingPerks = 0;
      this.perkChoices = null;
      return;
    }
    this.renderPerks(run);
    const el = this.els.perks;
    el.classList.remove('hidden', 'in');
    void el.offsetWidth;
    el.classList.add('in');
  }

  private renderPerks(run: import('../game/Run').Run) {
    const ch = this.perkChoices!;
    this.els.pcards.innerHTML = ch.map((p, i) => `
      <div class="pcard interactive" data-i="${i}" style="--pc:${p.color}"><div class="pbg jag-b"></div>
        <span class="pk keycap">${i + 1}</span><span class="plv">${run.perks[p.id] ? 'LV ' + (run.perks[p.id] + 1) : 'NEW'}</span>
        ${icon(p.icon, '', 44, p.color)}
        <div class="pn">${p.name}</div><div class="pd">${p.desc}</div>
      </div>`).join('');
    this.els.prr.innerHTML = `${run.pendingPerks > 1 ? `×${run.pendingPerks} &nbsp;` : ''}${run.rerolls > 0 ? `<span class="keycap">T</span>REROLL (${run.rerolls})` : ''}`;
    this.els.pcards.querySelectorAll('.pcard').forEach((c) => c.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      this.choosePerk(run, Number((c as HTMLElement).dataset.i));
    }));
  }

  choosePerk(run: import('../game/Run').Run, i: number) {
    const ch = this.perkChoices;
    if (!ch || !ch[i]) return;
    run.takePerk(ch[i].id);
    run.pendingPerks--;
    audio.play('levelUp');
    this.toast(ch[i].name.toUpperCase(), ch[i].desc, ch[i].color);
    this.perkChoices = null;
    this.els.perks.classList.add('hidden');
    this.game.world?.player.refreshLoadout();
    if (run.pendingPerks > 0) setTimeout(() => this.offerPerks(run), 400);
  }

  rerollPerks(run: import('../game/Run').Run) {
    if (!this.perkChoices || run.rerolls <= 0) return;
    run.rerolls--;
    this.perkChoices = rollPerkChoices(run.rng, run.perks, 3);
    this.renderPerks(run);
    audio.play('uiClick');
  }

  toggleBigMap(w: World | null) {
    this.bigmapOpen = !this.bigmapOpen && !!w;
    this.els.bigmap.classList.toggle('hidden', !this.bigmapOpen);
    if (this.bigmapOpen && w) this.drawBigMap(w);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, w: World) {
    const run = w.run;
    const st = run.stats;
    const p = w.player;
    const cam = w.game.renderer.camera;
    const W = window.innerWidth, H = window.innerHeight;

    // fps
    if (Save.settings.showFps) {
      this.fpsT += dt;
      this.fpsN++;
      if (this.fpsT > 0.5) {
        this.els.fps.textContent = `${Math.round(this.fpsN / this.fpsT)} FPS`;
        this.fpsT = 0;
        this.fpsN = 0;
      }
      this.els.fps.classList.remove('hidden');
    } else this.els.fps.classList.add('hidden');

    // objective
    const obj = w.objective;
    const dia = '<svg viewBox="0 0 20 20"><path d="M10 2l8 8-8 8-8-8z" fill="none" stroke="#f4f1e8" stroke-width="2.4" stroke-linejoin="miter"/></svg>';
    this.setText(this.els.ot, obj.title);
    this.setHTML(this.els.olines, obj.lines.map((l) => `<div class="ol ${l.done ? 'done' : ''} ${l.optional ? 'opt' : ''}"><span class="di">${l.optional ? artImg('icon_skull', 20) : l.done ? icon('star', '', 18, '#ffcb2f') : dia}</span><span>${l.text}</span>${l.count ? `<b>${l.count}</b>` : ''}</div>`).join(''));
    this.setText(this.els.rnum, `#${run.runNumber}`);
    this.setText(this.els.rb2, run.biome.name);
    this.setText(this.els.fl, run.floorLabel);
    this.setText(this.els.fn, run.floorName);
    this.setHTML(this.els.mods, run.floorMods.map((m) => `<div class="mod-chip" style="border-color:${m.color}">${icon(m.icon, '', 16, m.color)}<span>${m.name}</span></div>`).join(''));

    // status bars
    const hpF = clamp(run.hp / st.maxHp, 0, 1);
    const shF = st.maxShield > 0 ? clamp(run.shield / st.maxShield, 0, 1) : 0;
    this.els.hpFill.style.width = `${hpF * 100}%`;
    this.els.shFill.style.width = `${shF * 100}%`;
    this.hpLagW = hpF > this.hpLagW ? hpF : this.hpLagW;
    this.shLagW = shF > this.shLagW ? shF : this.shLagW;
    this.hpLagW += (hpF - this.hpLagW) * Math.min(1, dt * 2.5);
    this.shLagW += (shF - this.shLagW) * Math.min(1, dt * 2.5);
    this.els.hpLag.style.width = `${this.hpLagW * 100}%`;
    this.els.shLag.style.width = `${this.shLagW * 100}%`;
    this.setHTML(this.els.hpTxt, `${Math.ceil(Math.max(0, run.hp))} <small>/ ${Math.round(st.maxHp)}</small>`);
    this.setHTML(this.els.shTxt, `${Math.ceil(run.shield)} <small>/ ${Math.round(st.maxShield)}</small>`);
    this.els.xp.style.width = `${(run.xp / run.xpForLevel(run.level)) * 100}%`;
    this.setText(this.els.lvl, `LV ${run.level}`);
    const relicKey = run.relics.join(',');
    if (this.lastText.get(this.els.relics) !== relicKey) {
      this.lastText.set(this.els.relics, relicKey);
      this.els.relics.innerHTML = run.relics.map((id) => {
        const r = RELIC_MAP.get(id)!;
        return `<div class="relic-ico" style="border-color:${r.color}" title="${r.name}: ${r.desc}">${icon(r.icon, '', 20, r.color)}</div>`;
      }).join('');
      const syn = activeSynergies(run.relics);
      this.els.syn.classList.toggle('hidden', !syn.length);
      this.els.syn.textContent = syn.map((s) => `${s.name} Synergy Active!`).join('  ');
    }
    if (hpF < 0.3 && !this.lowHpWarned && !p.downed) {
      this.lowHpWarned = true;
      this.bark('lowhp');
    } else if (hpF > 0.5) this.lowHpWarned = false;

    // speed, nitro, drift
    const kmh = Math.round(p.speed * 3.0);
    this.setText(this.els.speed, String(kmh));
    this.els.sarc.setAttribute('stroke-dashoffset', String(300 - clamp(p.speed / 60, 0, 1) * 300));
    this.els.sarc.setAttribute('stroke', p.boosting || p.driftBoostT > 0 ? '#3aa6ff' : '#e8242f');
    this.els.nitro.style.width = `${(run.nitro / st.boostMax) * 100}%`;
    const tiers = this.els.drift.children;
    for (let i = 0; i < 3; i++) {
      const on = p.drifting && p.driftTier > i;
      (tiers[i] as HTMLElement).className = on ? `on${p.driftTier}` : '';
    }

    // abilities
    const g = p.gadget;
    if (g) {
      const gi = g.item.gtype ?? 'mines';
      const frameArt = gi === 'mines' ? 'ab_mine' : gi === 'turret' ? 'ab_turret' : gi === 'hop' ? 'ab_boost' : 'ab_ram';
      const src = artSrc(frameArt);
      if (this.els.gadImg.getAttribute('src') !== src) (this.els.gadImg as HTMLImageElement).src = src;
      this.setText(this.els.gadName, { mines: 'Mines', hop: 'Hop', pulse: 'Pulse', turret: 'Turret', bubble: 'Ward', gravity: 'Well' }[gi] ?? 'Gadget');
      const frac = g.charges >= g.maxCharges ? 0 : clamp(g.cd / g.cooldown, 0, 1);
      this.els.gadCd.style.height = `${(g.charges > 0 ? 0 : frac) * 84}%`;
      this.setText(this.els.gadT, g.charges > 0 ? '' : g.cd.toFixed(1));
      this.setText(this.els.gadChg, g.maxCharges > 1 ? `${g.charges}` : '');
      this.els.gad.classList.toggle('ready', g.charges > 0);
      this.els.gad.title = `${g.item.name}: ${GADGET_INFO[gi].desc}`;
    }
    this.els.boostCd.style.height = `${(1 - clamp(run.nitro / st.boostMax, 0, 1)) * 84}%`;
    this.els.boost.classList.toggle('ready', run.nitro / st.boostMax > 0.3);
    this.els.hornCd.style.height = `${clamp(p.hornCd / 4, 0, 1) * 84}%`;

    // weapons
    this.weaponPanel(this.els.wMain, p.weapons[0]);
    this.weaponPanel(this.els.wSide, p.weapons[1]);

    // currency
    this.setText(this.els.gold, formatNum(run.gold));
    this.setText(this.els.keys, String(run.keys));
    this.els.ks.classList.toggle('hidden', run.keystones <= 0);
    this.setText(this.els.kst, String(run.keystones));

    // boss
    if (this.bossRef) {
      const b = this.bossRef;
      this.els.bfill.style.width = `${clamp(b.hp / b.maxHp, 0, 1) * 100}%`;
      this.els.blag.style.width = `${clamp(b.hp / b.maxHp, 0, 1) * 100}%`;
      const inv = (b as any).invulnFactor ?? 1;
      this.els.bshield.classList.toggle('hidden', inv >= 1);
      this.els.bshield.style.width = `${clamp(b.hp / b.maxHp, 0, 1) * 100}%`;
      if (!b.alive) this.bossBar(null);
    }

    // crosshair
    this.els.cross.classList.toggle('enemy', !!w.aimEnemy);
    this.hmT -= dt;
    this.els.hm.classList.toggle('on', this.hmT > 0);
    this.hitdirT -= dt;
    this.els.hitdirI.classList.toggle('on', this.hitdirT > 0.3);

    // barks
    if (this.barkT > 0) {
      this.barkT -= dt;
      if (this.barkT <= 0) this.els.nav.classList.add('off');
    }
    // toasts
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0.3 && !this.els.toast.classList.contains('hide')) this.els.toast.classList.add('hide');
      if (this.toastT <= 0) this.nextToast();
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.els.combo.classList.add('hidden');
    }

    // downed
    if (p.downed) (this.els.dbar as HTMLElement).style.width = `${clamp(p.downedT / p.downedMax, 0, 1) * 100}%`;

    // loot card & prompt
    const gi = w.lootTarget;
    if (gi) {
      if (this.lastLoot !== gi.item) {
        this.lastLoot = gi.item;
        const eq = run.equipped[gi.item.slot];
        this.els.loot.innerHTML = `
          <div class="cmp">
            ${eq ? `<div class="eq"><div class="lbl-eq">EQUIPPED</div>${itemCardHTML(eq)}</div>` : ''}
            <div style="position:relative"><div class="lbl-new">NEW</div>${itemCardHTML(gi.item, eq)}</div>
          </div>
          <div class="acts">
            <div><span class="keycap">E</span>EQUIP</div>
            <div><span class="keycap">F</span>STASH (${run.backpack.length}/${run.backpackSize})</div>
            <div><span class="keycap">X</span>SALVAGE (+${run.salvageValue(gi.item)} ${icon('coin', '', 16, '#ffd23a')})</div>
          </div>`;
      }
      this.els.loot.classList.remove('hidden');
      this.els.nav.classList.add('off');
    } else {
      this.lastLoot = null;
      this.els.loot.classList.add('hidden');
    }
    const it = w.interactTarget;
    const label = it ? it.label() : null;
    if (it && label) {
      const sub = it.sub?.() ?? '';
      const key = label + '|' + sub;
      if (key !== this.lastInteract) {
        this.lastInteract = key;
        this.els.pr.innerHTML = `<span class="keycap">E</span><span>${label}</span>`;
        this.els.ps.textContent = sub;
      }
      this.els.prompt.classList.remove('hidden');
    } else {
      this.lastInteract = '';
      this.els.prompt.classList.add('hidden');
    }

    // click hint
    const g2 = this.game;
    this.els.click.classList.toggle('hidden', g2.input.pointerLocked || g2.input.pointerLockFailed || g2.ui.modalOpen || !p.alive);

    this.updateWorldLabels(dt, w, cam, W, H);
    this.drawMinimap(w);
    if (this.bigmapOpen) this.drawBigMap(w);
  }

  private weaponPanel(el: HTMLElement, wr: import('../combat/Weapons').WeaponRuntime | null) {
    if (!wr) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const it = wr.item;
    const key = String(it.uid);
    if (this.lastText.get(el) !== key) {
      this.lastText.set(el, key);
      $(el, '.wico').innerHTML = itemArt(it, it.slot);
      const n = $(el, '.wname');
      n.textContent = it.name;
      n.style.color = RARITY[it.rarity].color;
      el.style.setProperty('--rc', RARITY[it.rarity].color);
      $(el, '.wsub').innerHTML = `${it.element !== 'none' ? icon(ELEMENT_ICON[it.element], '', 13, ELEMENT_HEX[it.element]) + ' ' : ''}Lv ${it.level} ${RARITY[it.rarity].name}`;
    }
    this.setHTML($(el, '.ammo'), `${Math.max(0, Math.floor(wr.mag))}<small> / ${wr.magMax}</small>`);
    const rl = wr.reloadT > 0;
    ($(el, '.reload')).style.setProperty('--rw', rl ? `${(1 - wr.reloadT / wr.reloadTime) * 100}%` : '0%');
    this.setText($(el, '.rl'), rl ? 'RELOADING' : wr.mag <= 0 ? 'EMPTY' : '');
  }

  private project(x: number, y: number, z: number, cam: THREE.PerspectiveCamera, W: number, H: number): [number, number] | null {
    tmpV.set(x, y, z).project(cam);
    if (tmpV.z > 1 || tmpV.z < -1) return null;
    return [(tmpV.x * 0.5 + 0.5) * W, (-tmpV.y * 0.5 + 0.5) * H];
  }

  private updateWorldLabels(dt: number, w: World, cam: THREE.PerspectiveCamera, W: number, H: number) {
    // damage numbers
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      if (n.life <= 0) {
        this.releaseNum(n);
        this.nums.splice(i, 1);
        continue;
      }
      n.y += n.vy * dt;
      n.vy *= Math.exp(-3 * dt);
      const s = this.project(n.x, n.y, n.z, cam, W, H);
      if (!s) {
        n.el.style.opacity = '0';
        continue;
      }
      const t = 1 - n.life / n.max;
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.9 : t < 0.25 ? 1.5 - ((t - 0.12) / 0.13) * 0.5 : 1;
      n.el.style.opacity = String(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
      n.el.style.transform = `translate(${s[0] + n.ox}px, ${s[1]}px) translate(-50%, -50%) scale(${pop * n.scale})`;
    }
    // enemy bars
    const p = w.player;
    const cands: Enemy[] = [];
    for (const e of w.enemies) {
      if (!e.alive || e.spawnT > 0 || e.def.boss) continue;
      const d = e.distTo(p.pos.x, p.pos.z);
      if (d > 85) continue;
      if (e.isElite || e.isMiniboss || e.def.stationary || w.time - e.lastHitT < 4 || e.hp < e.maxHp) cands.push(e);
    }
    cands.sort((a, b) => a.distTo(p.pos.x, p.pos.z) - b.distTo(p.pos.x, p.pos.z));
    for (let i = 0; i < this.ebars.length; i++) {
      const b = this.ebars[i];
      const e = cands[i];
      if (!e) {
        b.classList.add('hidden');
        continue;
      }
      const s = this.project(e.pos.x, e.y + e.def.height * e.scale + 0.9, e.pos.z, cam, W, H);
      if (!s) {
        b.classList.add('hidden');
        continue;
      }
      b.classList.remove('hidden');
      const special = e.isElite || e.isMiniboss || e.def.stationary;
      b.classList.toggle('elite', special);
      (b.firstElementChild as HTMLElement).style.width = `${clamp(e.hp / e.maxHp, 0, 1) * 100}%`;
      const sh = b.children[1] as HTMLElement;
      sh.style.width = e.maxShield > 0 && e.shield > 0 ? `${(e.shield / e.maxShield) * 100}%` : '0';
      const en = b.children[2] as HTMLElement;
      const nm = special ? (e.isMiniboss ? '★ ' : '') + e.displayName : '';
      if (en.textContent !== nm) en.textContent = nm;
      if (special && e.elite.length) en.style.setProperty('--ec', '#' + new THREE.Color(ELITE_INFO[e.elite[0]].color).getHexString());
      const dist = e.distTo(p.pos.x, p.pos.z);
      const sc = clamp(1.3 - dist / 90, 0.6, 1.2);
      b.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%, -50%) scale(${sc})`;
    }
    // ground item labels
    const items = w.pickups.items.filter((g) => Math.hypot(g.x - p.pos.x, g.z - p.pos.z) < 40).sort((a, b) => b.item.rarity - a.item.rarity);
    for (let i = 0; i < this.glabels.length; i++) {
      const l = this.glabels[i];
      const g = items[i];
      if (!g || g === w.lootTarget) {
        l.classList.add('hidden');
        continue;
      }
      const s = this.project(g.x, g.y + 1.8, g.z, cam, W, H);
      if (!s) {
        l.classList.add('hidden');
        continue;
      }
      l.classList.remove('hidden');
      const key = String(g.item.uid);
      if (l.dataset.k !== key) {
        l.dataset.k = key;
        l.className = `glabel bg-r${g.item.rarity}`;
        l.innerHTML = `${itemArt(g.item, g.item.slot)}<div>${g.item.name}<small>${RARITY[g.item.rarity].name} ${g.item.wtype ? 'Weapon' : 'Part'}</small></div>`;
      }
      l.style.transform = `translate(${s[0] + 14}px, ${s[1]}px) translateY(-50%)`;
    }
  }

  // ------------------------------------------------------------------ minimap
  private ensureMapBase(w: World) {
    const key = [...w.exploredRooms].sort().join(',') + '|' + w.d.w;
    if (this.mapBase && this.mapKey === key) return;
    this.mapKey = key;
    const d = w.d;
    const S = this.mapScale;
    const c = this.mapBase ?? document.createElement('canvas');
    c.width = d.w * S;
    c.height = d.h * S;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const visible = new Set<number>(w.exploredRooms);
    const hinted = new Set<number>();
    for (const id of w.exploredRooms) for (const n of d.rooms[id].neighbors) if (!visible.has(n)) hinted.add(n);
    // corridors connected to explored rooms
    for (const cor of d.corridors) {
      if (!visible.has(cor.a) && !visible.has(cor.b)) continue;
      g.fillStyle = '#6a6a70';
      g.fillRect(cor.x0 * S, cor.y0 * S, (cor.x1 - cor.x0) * S, (cor.y1 - cor.y0) * S);
    }
    for (const r of d.rooms) {
      if (visible.has(r.id)) {
        g.fillStyle = '#b8b4a8';
        g.fillRect(r.x0 * S, r.y0 * S, (r.x1 - r.x0) * S, (r.y1 - r.y0) * S);
        // interior blocks & lava
        for (let ty = r.y0; ty < r.y1; ty++) for (let tx = r.x0; tx < r.x1; tx++) {
          const t = d.tiles[ty * d.w + tx];
          if (t === Tile.Pillar) {
            g.fillStyle = '#2a2a30';
            g.fillRect(tx * S, ty * S, S, S);
          } else if (t === Tile.Lava) {
            g.fillStyle = '#ff6a1a';
            g.fillRect(tx * S, ty * S, S, S);
          }
        }
        g.strokeStyle = '#111';
        g.lineWidth = 2;
        g.strokeRect(r.x0 * S + 1, r.y0 * S + 1, (r.x1 - r.x0) * S - 2, (r.y1 - r.y0) * S - 2);
      } else if (hinted.has(r.id)) {
        g.strokeStyle = '#555';
        g.setLineDash([4, 3]);
        g.lineWidth = 2;
        g.strokeRect(r.x0 * S + 1, r.y0 * S + 1, (r.x1 - r.x0) * S - 2, (r.y1 - r.y0) * S - 2);
        g.setLineDash([]);
      }
    }
    this.mapBase = c;
  }

  private roomGlyph(g: CanvasRenderingContext2D, type: string, x: number, y: number, s: number, done: boolean) {
    const col: Record<string, string> = { treasure: '#ffc21a', vault: '#ffc21a', shop: '#3aff7a', pitstop: '#3aff7a', shrine: '#b080ff', elite: '#ff40ff', exit: '#40b0ff', boss: '#ff2020', start: '#f2efe6', combat: '#e8242f' };
    const c = col[type];
    if (!c || (type === 'combat' && done)) return;
    g.save();
    g.translate(x, y);
    g.fillStyle = c;
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    switch (type) {
      case 'treasure':
      case 'vault':
        g.rect(-s, -s * 0.6, s * 2, s * 1.4);
        break;
      case 'shop':
      case 'pitstop':
        g.arc(0, 0, s, 0, Math.PI * 2);
        break;
      case 'exit':
        g.ellipse(0, 0, s * 0.7, s, 0, 0, Math.PI * 2);
        break;
      case 'combat':
        g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s);
        g.strokeStyle = c;
        g.lineWidth = 3;
        g.stroke();
        g.restore();
        return;
      default:
        g.moveTo(0, -s); g.lineTo(s, 0); g.lineTo(0, s); g.lineTo(-s, 0); g.closePath();
    }
    g.fill();
    g.stroke();
    if (type === 'shop' || type === 'pitstop') {
      g.fillStyle = '#000';
      g.font = `bold ${s * 1.5}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 1);
    }
    g.restore();
  }

  private drawMinimap(w: World) {
    this.ensureMapBase(w);
    const g = this.mapCtx;
    const cw = 214, ch = 172;
    g.fillStyle = '#0b0b0f';
    g.fillRect(0, 0, cw, ch);
    const S = this.mapScale;
    const p = w.player;
    const px = (p.pos.x / TILE) * S, pz = (p.pos.z / TILE) * S;
    g.save();
    g.translate(cw / 2 - px, ch / 2 - pz);
    if (this.mapBase) g.drawImage(this.mapBase, 0, 0);
    for (const rs of w.rooms) {
      const r = rs.room;
      if (!w.exploredRooms.has(r.id) && r.type !== 'exit' && r.type !== 'boss') continue;
      if (!w.exploredRooms.has(r.id) && !w.exploredRooms.size) continue;
      if (!w.exploredRooms.has(r.id)) continue;
      this.roomGlyph(g, r.type, (r.wx / TILE) * S, (r.wz / TILE) * S, 6, rs.cleared);
    }
    // enemies
    g.fillStyle = '#ff2a2a';
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const ex = (e.pos.x / TILE) * S, ez = (e.pos.z / TILE) * S;
      if (Math.abs(ex - px) > cw / 2 || Math.abs(ez - pz) > ch / 2) continue;
      g.beginPath();
      g.arc(ex, ez, e.def.boss ? 6 : e.isElite ? 3.5 : 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // loot
    for (const it of w.pickups.items) {
      g.fillStyle = RARITY[it.item.rarity].color;
      g.fillRect((it.x / TILE) * S - 2, (it.z / TILE) * S - 2, 4, 4);
    }
    g.restore();
    // player arrow (north-up map; world +z is down on the map)
    g.save();
    g.translate(cw / 2, ch / 2);
    g.rotate(-p.heading + Math.PI);
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(7, 7);
    g.lineTo(0, 3);
    g.lineTo(-7, 7);
    g.closePath();
    g.fillStyle = '#e8242f';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.fill();
    g.stroke();
    g.restore();
    // camera view cone
    g.save();
    g.translate(cw / 2, ch / 2);
    g.rotate(-w.cam.yaw + Math.PI);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-30, -60);
    g.lineTo(30, -60);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawBigMap(w: World) {
    this.ensureMapBase(w);
    const c = this.els.bigmap.querySelector('canvas') as HTMLCanvasElement;
    if (!this.mapBase) return;
    const S = this.mapScale;
    const k = Math.max(1, Math.floor(Math.min((window.innerWidth * 0.8) / this.mapBase.width, (window.innerHeight * 0.75) / this.mapBase.height) * 2) / 2);
    c.width = this.mapBase.width * k;
    c.height = this.mapBase.height * k;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.mapBase, 0, 0, c.width, c.height);
    for (const rs of w.rooms) {
      if (!w.exploredRooms.has(rs.room.id)) continue;
      this.roomGlyph(g, rs.room.type, (rs.room.wx / TILE) * S * k, (rs.room.wz / TILE) * S * k, 8 * Math.min(2, k), rs.cleared);
    }
    const p = w.player;
    g.save();
    g.translate((p.pos.x / TILE) * S * k, (p.pos.z / TILE) * S * k);
    g.rotate(-p.heading + Math.PI);
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(9, 9);
    g.lineTo(0, 4);
    g.lineTo(-9, 9);
    g.closePath();
    g.fillStyle = '#e8242f';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.fill();
    g.stroke();
    g.restore();
  }
}
