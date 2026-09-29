import { artSrc } from './ArtIcons';

export type Mood = 'happy' | 'smug' | 'shock' | 'angry' | 'wink';

/** The crew: real illustrated portraits sliced from the UI kit, one per mood. */
export const SPEAKERS: Record<Mood, { who: string; art: string }> = {
  happy: { who: 'SPROCKET', art: 'por_cat_grin' },
  smug: { who: 'SPROCKET', art: 'por_cat_smug' },
  wink: { who: 'GLITCH', art: 'por_gremlin' },
  shock: { who: 'GRINDER', art: 'por_pilot_grin' },
  angry: { who: 'SHADE', art: 'por_cat_mono' },
};

export function portraitHTML(mood: Mood = 'happy') {
  const s = SPEAKERS[mood];
  return `<div class="pring"></div><div class="pimg"><img src="${artSrc(s.art)}" alt="" draggable="false"/></div>`;
}

/** A standalone framed portrait (shop keeper, dialogue panels). */
export function portraitFrame(mood: Mood, size = 110) {
  return `<div class="pframe static" style="width:${size}px;height:${Math.round(size * 0.92)}px">${portraitHTML(mood)}</div>`;
}
