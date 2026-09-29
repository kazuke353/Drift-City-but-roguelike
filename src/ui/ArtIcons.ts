import { artUrl } from '../render/Art';
import type { Item } from '../loot/Items';

/** Raster art helpers: everything here points at sliced reference art / the asset pack in public/art. */
const WEBP = new Set(['por_cat_grin', 'por_cat_smug', 'por_cat_mono', 'por_gremlin', 'card_legendary', 'card_rare', 'card_epic', 'art_ram', 'art_gatling', 'art_tire', 'env_arch', 'env_chest', 'env_crystal']);

export function artSrc(name: string) {
  const ext = name.startsWith('pk_') || name.startsWith('tex_') || WEBP.has(name) ? 'webp' : 'png';
  return artUrl(`${name}.${ext}`);
}

export function artImg(name: string, size = 0, cls = '', style = '') {
  const s = size ? `width:${size}px;height:${size}px;` : '';
  return `<img class="aico ${cls}" src="${artSrc(name)}" alt="" draggable="false" style="${s}${style}"/>`;
}

const WEAPON_ART: Record<string, string> = {
  mg: 'pk_w_autocannon', minigun: 'w_minigun', cannon: 'w_cannon', shotgun: 'pk_w_scatter', laser: 'w_laser', flamer: 'p_booster', tesla: 'pk_w_arc', rail: 'w_shotgun',
  rocket: 'w_rocket', swarm: 'w_rocket', mortar: 'w_mine', saw: 'p_spikes',
};
const PLOW_ART = ['pk_ram', 'p_plow', 'p_spikes', 'p_ram', 'pk_ram'];
const WHEEL_ART = ['pk_wheel_crypt', 'wheel_slick', 'wheel_spiked', 'wheel_void', 'wheel_rose'];
const GADGET_ART: Record<string, string> = { mines: 'w_mine', hop: 'p_booster', pulse: 'icon_gear', turret: 'pk_w_autocannon', bubble: 'p_shield', gravity: 'icon_wheel' };

/** Art name for an item (weapon / part). */
export function itemArtName(it: Item): string {
  if (it.wtype) return WEAPON_ART[it.wtype] ?? 'w_cannon';
  switch (it.slot) {
    case 'plow': return PLOW_ART[it.variant % PLOW_ART.length];
    case 'engine': return 'pk_engine_v8';
    case 'wheels': return WHEEL_ART[it.variant % WHEEL_ART.length];
    case 'shield': return 'p_shield';
    case 'gadget': return GADGET_ART[it.gtype ?? 'mines'] ?? 'icon_gear';
    default: return 'icon_gear';
  }
}

export function slotArtName(slot: string): string {
  const m: Record<string, string> = { main: 'w_cannon', side: 'w_rocket', plow: 'p_ram', engine: 'icon_engine', wheels: 'icon_wheel', shield: 'icon_shield', gadget: 'icon_gear' };
  return m[slot] ?? 'icon_gear';
}

export function itemArt(it: Item | null, slot: string, cls = '') {
  const name = it ? itemArtName(it) : slotArtName(slot);
  return `<img class="aico ${cls}" src="${artSrc(name)}" alt="" draggable="false"${it ? '' : ' style="opacity:.35;filter:grayscale(1)"'}/>`;
}
