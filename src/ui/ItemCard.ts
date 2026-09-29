import { RARITY, SLOT_NAMES, SLOT_ICONS, WEAPON_LABEL, ELEMENT_NAMES, GADGET_INFO, weaponDps, type Item } from '../loot/Items';
import { describeMod, modIsGood } from '../game/Stats';
import { icon, ELEMENT_ICON } from './Icons';
import { itemArt } from './ArtIcons';
import { ELEMENT_HEX } from '../fx/FX';

const fmt = (v: number, d = 0) => (d ? v.toFixed(d) : Math.round(v).toLocaleString('en-US'));

function row(ic: string, label: string, v: number, cmp: number | undefined, d = 0, lowerBetter = false, suffix = '') {
  let arrow = '';
  if (cmp !== undefined && Math.abs(v - cmp) > 1e-6) {
    const better = lowerBetter ? v < cmp : v > cmp;
    arrow = better ? `<span class="up">${icon('up', '', 14)}</span>` : `<span class="dn">${icon('down', '', 14)}</span>`;
  }
  return `<div class="st">${icon(ic, '', 17)}<span>${label}</span><span class="v" style="${arrow && (lowerBetter ? v < (cmp ?? v) : v > (cmp ?? v)) ? 'color:#5dff8a' : ''}">${fmt(v, d)}${suffix} ${arrow}</span></div>`;
}

export function itemCardHTML(it: Item, cmp?: Item | null, extraTag = '') {
  const r = RARITY[it.rarity];
  const c = cmp && cmp.slot === it.slot ? cmp : null;
  let body = '';
  if (it.w) {
    const w = it.w;
    const cw = c?.w;
    const perShot = w.damage * w.pellets;
    body += row('cannon', 'Damage', perShot, cw ? cw.damage * cw.pellets : undefined, 0, false, w.pellets > 1 ? ` (${w.pellets}×)` : '');
    body += row('gear', 'Fire Rate', w.fireRate, cw?.fireRate, 1, false, '/s');
    body += row('rocket', 'Magazine', w.mag, cw?.mag);
    body += row('wrench', 'Reload', w.reload, cw?.reload, 1, true, 's');
    if (w.splash > 0) body += row('star', 'Splash', w.splash, cw?.splash, 1);
    body += row('skull', 'Est. DPS', weaponDps(it), c ? weaponDps(c) : undefined);
  } else if (it.gtype) {
    const g = GADGET_INFO[it.gtype];
    body += `<div class="st">${icon('gear', '', 17)}<span>Cooldown</span><span class="v">${fmt(it.cooldown ?? g.cooldown, 1)}s</span></div>`;
    body += `<div class="st" style="color:#d4d0c1;font-weight:600;font-size:16px">${g.desc}</div>`;
  }
  const mods = it.mods.map((m) => `<div style="color:${modIsGood(m) ? '#ffd86a' : '#ff8a7a'}">${describeMod(m)}</div>`).join('');
  const elem = it.element !== 'none' ? `<span class="elem" style="color:${ELEMENT_HEX[it.element]}">${icon(ELEMENT_ICON[it.element], '', 13)} ${ELEMENT_NAMES[it.element]}</span>` : '';
  const kind = it.wtype ? WEAPON_LABEL[it.wtype] : SLOT_NAMES[it.slot];
  return `
  <div class="item-card bg-r${it.rarity} ${it.rarity >= 4 ? 'legend' : ''}">
    <div class="icbg jag-r${it.rarity}"></div>
    ${extraTag ? `<div class="tag">${extraTag}</div>` : ''}
    <div class="ictop">
      <div class="icart">${itemArt(it, it.slot)}</div>
      <div class="ictxt">
        <div class="ir">${r.name} · ${kind} · Lv ${it.level}</div>
        <div class="in">${it.name}</div>
        <div class="is">${it.maker ? it.maker + ' ' : ''}${elem}</div>
      </div>
    </div>
    <div class="stats">${body}</div>
    ${mods ? `<div class="mods">${mods}</div>` : ''}
    ${it.specialText ? `<div class="special">${it.specialText}</div>` : ''}
    ${it.flavor ? `<div class="flavor">${it.flavor}</div>` : ''}
  </div>`;
}

export function slotIcon(it: Item | null, slot: string, size = 26) {
  const name = it?.wtype ? (['rocket', 'swarm'].includes(it.wtype) ? 'rocket' : it.wtype === 'saw' ? 'gear' : 'cannon') : SLOT_ICONS[slot as keyof typeof SLOT_ICONS];
  const col = it ? RARITY[it.rarity].color : '#666';
  return icon(name, '', size, col);
}
