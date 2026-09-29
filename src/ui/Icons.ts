/** Hand-authored SVG icon set (inline, currentColor friendly). */
const P: Record<string, string> = {
  heart: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.2c2.1-.2 3.9 1 5.4 3 1.5-2 3.3-3.2 5.4-3 3.7.3 5.7 4.2 4.2 7.6C19.5 16.4 12 21 12 21z"/>',
  shield: '<path d="M12 2l8.5 3.2v6.1c0 5.3-3.6 9.3-8.5 10.7C7.1 20.6 3.5 16.6 3.5 11.3V5.2z"/><path d="M12 5.2v14" stroke="#000" stroke-width="1.6" opacity=".35"/>',
  gear: '<path d="M10.3 2h3.4l.5 2.6c.8.3 1.5.7 2.2 1.2l2.5-.9 1.7 2.9-2 1.7c.1.8.1 1.7 0 2.5l2 1.7-1.7 2.9-2.5-.9c-.7.5-1.4.9-2.2 1.2l-.5 2.6h-3.4l-.5-2.6c-.8-.3-1.5-.7-2.2-1.2l-2.5.9-1.7-2.9 2-1.7a8 8 0 0 1 0-2.5l-2-1.7 1.7-2.9 2.5.9c.7-.5 1.4-.9 2.2-1.2zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/>',
  coin: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#000" stroke-width="1.4" opacity=".35"/><path d="M13.2 7h-2.4v1.2c-1.4.3-2.3 1.2-2.3 2.4 0 1.5 1.2 2 2.7 2.4 1 .3 1.4.5 1.4 1s-.5.8-1.3.8c-.9 0-1.7-.4-2.3-.9l-.9 1.5c.7.5 1.6.9 2.5 1V18h2.4v-1.6c1.5-.3 2.4-1.3 2.4-2.6 0-1.6-1.2-2.1-2.8-2.5-.9-.2-1.3-.4-1.3-.8s.4-.7 1.1-.7c.7 0 1.4.3 1.9.7l.9-1.5c-.6-.4-1.3-.7-2.1-.8z" fill="#000" opacity=".55"/>',
  key: '<circle cx="7.5" cy="12" r="5"/><circle cx="7.5" cy="12" r="2" fill="#000" opacity=".5"/><path d="M12 10.5h10v3h-2v3h-3v-3h-5z"/>',
  skull: '<path d="M12 2.5c-5 0-8.5 3.5-8.5 8 0 2.6 1.2 4.6 3 5.9V20h3v-2h1.5v2h2v-2H14.5v2h3v-3.6c1.8-1.3 3-3.3 3-5.9 0-4.5-3.5-8-8.5-8zM8.3 9.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm7.4 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zM12 13.8l1.3 2.2h-2.6z"/>',
  crown: '<path d="M2.5 7.5l5 4 4.5-7 4.5 7 5-4-2 11.5H4.5z"/><rect x="4.5" y="19.5" width="15" height="2"/>',
  chest: '<path d="M3 10h18v10H3z"/><path d="M3 10V8c0-2.2 1.8-4 4-4h10c2.2 0 4 1.8 4 4v2z" opacity=".85"/><rect x="10.3" y="9" width="3.4" height="4.5" fill="#000" opacity=".5"/>',
  wrench: '<path d="M21 6.5l-3.2 3.2-2.6-.9-.9-2.6L17.5 3a5.5 5.5 0 0 0-7 6.8L3 17.3 6.7 21l7.5-7.5A5.5 5.5 0 0 0 21 6.5z"/>',
  flame: '<path d="M12 22c-4.4 0-7.5-3-7.5-7 0-3.4 2.2-5.7 3.8-7.5.4 1.8 1.2 3 2.3 3.6-.3-3.3 1.1-6.6 4.2-9.1-.2 3.3 1.3 5.1 2.9 7 1.4 1.7 2.8 3.5 2.8 6 0 4-3.1 7-8.5 7z"/>',
  bolt: '<path d="M13.5 2L4 13.5h6.2L8.8 22 20 9.5h-6.3z"/>',
  drop: '<path d="M12 2.5S5 10.2 5 14.8A7 7 0 0 0 19 14.8C19 10.2 12 2.5 12 2.5z"/>',
  snow: '<path d="M11 2h2v5.3l3.2-2 1 1.7L13 9.6v2.6l2.3-1.3 4.2-2.5 1 1.7-3.3 2 3.3 2-1 1.7-4.2-2.5-2.3-1.3v2.6l4.2 2.6-1 1.7-3.2-2V22h-2v-5.3l-3.2 2-1-1.7 4.2-2.6v-2.6l-2.3 1.3-4.2 2.5-1-1.7 3.3-2-3.3-2 1-1.7 4.2 2.5L11 12.2V9.6L6.8 7l1-1.7 3.2 2z"/>',
  rocket: '<path d="M14.5 2.5c3.5 0 6 .5 7 1.5 1 1 1.5 3.5 1.5 7l-8 8-6.5-6.5zM6.5 13.5l4 4-3.5 1-1.5-1.5zM4 20l2.5-4.5 2 2z"/><circle cx="16.5" cy="7.5" r="1.8" fill="#000" opacity=".5"/>',
  cannon: '<path d="M2 9h11l3-2h6v7h-6l-3-2H9v4l-2 2H4v-4H2z"/><rect x="18" y="8.3" width="1.2" height="4.4" fill="#000" opacity=".4"/>',
  wheel: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5.5" fill="#000" opacity=".45"/><circle cx="12" cy="12" r="2.2"/><path d="M12 6.5v3M12 14.5v3M6.5 12h3M14.5 12h3" stroke="currentColor" stroke-width="1.6"/>',
  engine: '<path d="M6 7h8v2h3l2 2h2v6h-2l-2 2H8l-2-2H4v-3H2v-4h2V9h2z"/><rect x="8" y="4" width="4" height="3"/><circle cx="12" cy="14" r="2.2" fill="#000" opacity=".45"/>',
  plow: '<path d="M2 17l4-11h12l4 11z"/><path d="M5 17l2.5 5M12 17v5M19 17l-2.5 5" stroke="currentColor" stroke-width="2.2"/>',
  clover: '<circle cx="8.5" cy="8.5" r="4"/><circle cx="15.5" cy="8.5" r="4"/><circle cx="8.5" cy="15.5" r="4"/><circle cx="15.5" cy="15.5" r="4"/><path d="M12 12l3 10" stroke="currentColor" stroke-width="2"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><g fill="#000" opacity=".55"><circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="16" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="8" cy="16" r="1.8"/></g>',
  horn: '<path d="M3 9h4l9-5v16l-9-5H3z"/><path d="M18.5 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5M20.5 6c2 1.6 3 3.6 3 6s-1 4.4-3 6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  shop: '<path d="M12 1.5l1.6 2.3v1.6c2 .3 3.4 1.5 3.4 3.2h-3c0-.6-.7-1-1.8-1-1 0-1.6.4-1.6.9 0 .7 1 1 2.6 1.4 2.4.6 4 1.5 4 3.7 0 1.8-1.4 3.1-3.6 3.5v1.7L12 21.5l-1.6-2.3v-1.6c-2.3-.3-3.9-1.7-3.9-3.6h3c.1.8 1 1.3 2.3 1.3 1.1 0 1.8-.4 1.8-1 0-.7-.9-1-2.5-1.4-2.3-.6-3.9-1.5-3.9-3.6 0-1.7 1.3-2.9 3.2-3.3V3.8z"/>',
  portal: '<ellipse cx="12" cy="12" rx="7.5" ry="10"/><ellipse cx="12" cy="12" rx="4" ry="6.5" fill="#000" opacity=".45"/><path d="M12 7c1.5 1 2 2.5 2 5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  star: '<path d="M12 2l2.9 6.5 7.1.7-5.3 4.7 1.6 7L12 17.3 5.7 21l1.6-7L2 9.2l7.1-.7z"/>',
  boss: '<path d="M2 3l4.5 4 2-3L12 7l3.5-3 2 3L22 3l-1.5 8c0 4.5-3.5 8-8.5 9.5C7 19 3.5 15.5 3.5 11z"/><g fill="#000" opacity=".6"><path d="M7 11l3.5 1.5L8.5 15zM17 11l-3.5 1.5L15.5 15z"/></g>',
  question: '<path d="M12 2.5c-3.5 0-6 2.2-6 5.5h3.2c0-1.5 1.1-2.5 2.8-2.5 1.6 0 2.7 1 2.7 2.3 0 2.8-4.3 2.9-4.3 7.2h3.2c0-3.4 4.4-3.6 4.4-7.4 0-3-2.6-5.1-6-5.1z"/><circle cx="12" cy="19.5" r="2"/>',
  arrow: '<path d="M12 2l8 18-8-4.5L4 20z"/>',
  bag: '<path d="M6 8h12l2 13H4z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" stroke-width="2"/>',
  x: '<path d="M5 3l7 7 7-7 2 2-7 7 7 7-2 2-7-7-7 7-2-2 7-7-7-7z"/>',
  up: '<path d="M12 4l8 10h-5v6H9v-6H4z"/>',
  down: '<path d="M12 20l8-10h-5V4H9v6H4z"/>',
  car: '<path d="M2 15v-3l2.5-1 2.5-4h9l3.5 4 2.5 1v3h-2a2.5 2.5 0 0 0-5 0H9a2.5 2.5 0 0 0-5 0z"/><circle cx="6.5" cy="15.5" r="2"/><circle cx="17.5" cy="15.5" r="2"/>',
  pause: '<rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/>',
  map: '<path d="M2 5l6-2 8 3 6-2v15l-6 2-8-3-6 2z"/><path d="M8 3v15M16 6v15" stroke="#000" stroke-width="1.2" opacity=".4"/>',
};

export function icon(name: string, cls = '', size = 24, color?: string) {
  const inner = P[name] ?? P.star;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color ?? 'currentColor'}" aria-hidden="true">${inner}</svg>`;
}

export const ELEMENT_ICON: Record<string, string> = { fire: 'flame', shock: 'bolt', acid: 'drop', cryo: 'snow', none: 'star' };
