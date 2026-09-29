export type Mood = 'happy' | 'smug' | 'shock' | 'angry' | 'wink';

/**
 * SPROCKET — the navigator: a black-and-white cat mechanic with goggles and a red scarf,
 * drawn as an inked, cel-shaded SVG in a jagged Persona-style frame.
 */
export function portraitSVG(mood: Mood = 'happy') {
  const eyes: Record<Mood, string> = {
    happy: `<path d="M74 92 q9 -10 18 0" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M112 92 q9 -10 18 0" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    smug: `<path d="M72 90 l20 2 q-10 9 -20 -2z" fill="#ffd23a" stroke="#111" stroke-width="3"/><path d="M80 91 l5 0" stroke="#111" stroke-width="5"/>
           <path d="M112 92 l20 -2 q-10 11 -20 2z" fill="#ffd23a" stroke="#111" stroke-width="3"/><path d="M121 91 l5 0" stroke="#111" stroke-width="5"/>`,
    shock: `<circle cx="83" cy="90" r="10" fill="#fff" stroke="#111" stroke-width="3.5"/><circle cx="83" cy="90" r="3.5" fill="#111"/>
            <circle cx="121" cy="90" r="10" fill="#fff" stroke="#111" stroke-width="3.5"/><circle cx="121" cy="90" r="3.5" fill="#111"/>`,
    angry: `<path d="M70 82 l24 8" stroke="#111" stroke-width="5"/><path d="M134 82 l-24 8" stroke="#111" stroke-width="5"/>
            <ellipse cx="84" cy="95" rx="8" ry="6" fill="#ffd23a" stroke="#111" stroke-width="3"/><ellipse cx="120" cy="95" rx="8" ry="6" fill="#ffd23a" stroke="#111" stroke-width="3"/>
            <circle cx="85" cy="95" r="2.6" fill="#111"/><circle cx="119" cy="95" r="2.6" fill="#111"/>`,
    wink: `<ellipse cx="83" cy="91" rx="8" ry="9" fill="#ffd23a" stroke="#111" stroke-width="3"/><path d="M83 84 v14" stroke="#111" stroke-width="4"/>
           <path d="M112 93 q9 -9 18 0" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  };
  const mouth: Record<Mood, string> = {
    happy: `<path d="M88 113 q7 8 13 0 q6 8 13 0" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M93 117 q8 12 16 0z" fill="#e8242f" stroke="#111" stroke-width="3"/>`,
    smug: `<path d="M86 114 q10 6 18 -1 q6 5 12 -2" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M113 112 l3 7 3 -6" fill="#fff" stroke="#111" stroke-width="2"/>`,
    shock: `<ellipse cx="101" cy="120" rx="9" ry="11" fill="#5a0a10" stroke="#111" stroke-width="3.5"/>`,
    angry: `<path d="M86 121 l8 -6 7 5 7 -5 8 6" stroke="#111" stroke-width="4" fill="#fff" stroke-linejoin="round"/>`,
    wink: `<path d="M88 114 q13 12 26 0" stroke="#111" stroke-width="4" fill="#e8242f" stroke-linecap="round"/>`,
  };
  return `
<svg viewBox="0 0 200 200" class="portrait-svg" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="ht" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.4" fill="#000" opacity=".35"/></pattern>
  </defs>
  <polygon points="6,30 60,4 70,24 140,0 150,20 196,14 184,70 198,110 178,120 192,196 120,178 90,198 70,176 10,190 22,130 2,96 18,70" fill="#e8242f" stroke="#111" stroke-width="5"/>
  <polygon points="6,30 60,4 70,24 140,0 150,20 196,14 184,70 198,110 178,120 192,196 120,178 90,198 70,176 10,190 22,130 2,96 18,70" fill="url(#ht)"/>
  <!-- ears -->
  <path d="M46 70 L52 18 L86 52 Z" fill="#161618" stroke="#111" stroke-width="4"/>
  <path d="M154 70 L150 16 L116 50 Z" fill="#161618" stroke="#111" stroke-width="4"/>
  <path d="M56 58 L57 32 L76 50 Z" fill="#f2b8c0"/>
  <path d="M146 58 L145 30 L127 49 Z" fill="#f2b8c0"/>
  <!-- head -->
  <path d="M40 96 C40 58 70 44 101 44 C134 44 164 58 164 96 C164 132 138 150 101 150 C66 150 40 132 40 96 Z" fill="#161618" stroke="#111" stroke-width="5"/>
  <!-- white muzzle / face patch -->
  <path d="M62 102 C62 84 80 76 101 76 C124 76 142 86 142 104 C142 128 124 142 101 142 C80 142 62 128 62 102 Z" fill="#f4f0e6"/>
  <path d="M101 76 C92 70 86 60 101 50 C116 60 110 70 101 76Z" fill="#f4f0e6"/>
  <!-- cel shadow on face -->
  <path d="M120 80 C136 90 142 104 136 122 C128 134 114 140 101 142 C124 128 130 104 120 80Z" fill="#d8d0c0"/>
  ${eyes[mood]}
  <!-- nose -->
  <path d="M96 104 h10 l-5 5z" fill="#e87a8a" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
  ${mouth[mood]}
  <!-- whiskers -->
  <path d="M60 108 l-26 -4 M60 115 l-24 4 M142 108 l26 -4 M142 115 l24 4" stroke="#111" stroke-width="2.5"/>
  <!-- goggles on forehead -->
  <path d="M46 62 C70 50 132 50 158 62" stroke="#3a2a1a" stroke-width="9" fill="none"/>
  <circle cx="80" cy="56" r="15" fill="#2a2a2e" stroke="#111" stroke-width="4"/>
  <circle cx="80" cy="56" r="10" fill="#60d0ff"/>
  <path d="M73 52 q5 -6 12 -2" stroke="#fff" stroke-width="3" fill="none"/>
  <circle cx="122" cy="56" r="15" fill="#2a2a2e" stroke="#111" stroke-width="4"/>
  <circle cx="122" cy="56" r="10" fill="#60d0ff"/>
  <path d="M115 52 q5 -6 12 -2" stroke="#fff" stroke-width="3" fill="none"/>
  <!-- scarf -->
  <path d="M52 140 C74 156 128 158 152 140 L158 160 C130 178 72 178 46 160 Z" fill="#e8242f" stroke="#111" stroke-width="4"/>
  <path d="M130 158 L150 196 L166 188 L146 154 Z" fill="#c01a24" stroke="#111" stroke-width="4"/>
  <!-- wrench -->
  <path d="M28 186 L58 150 L66 156 L36 192 Z" fill="#b8bcc8" stroke="#111" stroke-width="3"/>
  <path d="M56 140 a9 9 0 1 1 14 12 l-4 -2 -4 4 -4 -4 z" fill="#b8bcc8" stroke="#111" stroke-width="3"/>
</svg>`;
}
