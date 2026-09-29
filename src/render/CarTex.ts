import * as THREE from 'three';
import { Rng } from '../core/Rng';

/** Tileable livery textures for triplanar car paint (see paintToon). */

type Style = 'shards' | 'stripes' | 'flames' | 'hazard';

function cv(S: number) {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  return [c, c.getContext('2d')!] as const;
}

function wrap(S: number, fn: (dx: number, dy: number) => void) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy);
}

function scribbleCrown(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng, col: string) {
  g.save();
  g.translate(x, y);
  g.rotate(rng.float(-0.35, 0.35));
  g.scale(s, s);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 0.13;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-1, 0.55);
  g.lineTo(-1.15, -0.65);
  g.lineTo(-0.5, -0.1);
  g.lineTo(0, -0.9);
  g.lineTo(0.5, -0.1);
  g.lineTo(1.15, -0.65);
  g.lineTo(1, 0.55);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.moveTo(-0.95, 0.72);
  g.lineTo(1.0, 0.7);
  g.stroke();
  g.restore();
}

function scribbleSkull(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng, col: string) {
  g.save();
  g.translate(x, y);
  g.rotate(rng.float(-0.3, 0.3));
  g.scale(s, s);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 0.12;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-0.7, 0.1);
  g.bezierCurveTo(-0.9, -1.0, 0.9, -1.0, 0.7, 0.1);
  g.lineTo(0.45, 0.45);
  g.lineTo(0.4, 0.85);
  g.lineTo(-0.4, 0.85);
  g.lineTo(-0.45, 0.45);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.ellipse(-0.3, 0.02, 0.2, 0.24, 0, 0, Math.PI * 2);
  g.ellipse(0.3, 0.02, 0.2, 0.24, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-0.16, 0.45); g.lineTo(0.16, 0.45); g.lineTo(0, 0.28); g.closePath();
  g.fill();
  g.restore();
}

function slash(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, w: number, col: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.lineTo(len / 2, 0);
  g.stroke();
  g.restore();
}

export function camoTexture(primary: string, secondary: string, accent: string, style: Style, seed = 5, S = 512): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = cv(S);
  const nat = new THREE.Color(primary);
  const hi = '#' + nat.clone().offsetHSL(0, 0.05, 0.1).getHexString();
  const lo = '#' + nat.clone().offsetHSL(0, 0, -0.12).getHexString();
  g.fillStyle = style === 'shards' ? secondary : primary;
  g.fillRect(0, 0, S, S);

  if (style === 'shards') {
    // black base + big red jagged shards, each with a highlight facet
    for (let i = 0; i < 26; i++) {
      const cx = rng.float(0, S), cy = rng.float(0, S), r = rng.float(40, 120);
      const a0 = rng.float(0, 6.28);
      const pts: [number, number][] = [];
      const n = rng.int(3, 5);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * 6.28 + rng.float(-0.4, 0.4);
        const rr = r * rng.float(0.5, 1.15);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      wrap(S, (dx, dy) => {
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(cx + px + dx, cy + py + dy) : g.moveTo(cx + px + dx, cy + py + dy)));
        g.closePath();
        g.fillStyle = rng.chance(0.75) ? primary : lo;
        g.fill();
        g.beginPath();
        g.moveTo(cx + pts[0][0] + dx, cy + pts[0][1] + dy);
        g.lineTo(cx + pts[1][0] + dx, cy + pts[1][1] + dy);
        g.lineTo(cx + dx, cy + dy);
        g.closePath();
        g.fillStyle = hi;
        g.globalAlpha = 0.5;
        g.fill();
        g.globalAlpha = 1;
      });
    }
    // white tribal marks
    for (let i = 0; i < 7; i++) {
      const x = rng.float(0, S), y = rng.float(0, S);
      wrap(S, (dx, dy) => {
        const k = i % 3;
        if (k === 0) scribbleCrown(g, x + dx, y + dy, rng.float(26, 44), new Rng(seed + i), accent);
        else if (k === 1) scribbleSkull(g, x + dx, y + dy, rng.float(22, 34), new Rng(seed + i), accent);
        else for (let j = 0; j < 3; j++) slash(g, x + dx + j * 14, y + dy, rng.float(40, 70), 1.0 + j * 0.05, 6, accent);
      });
    }
    for (let i = 0; i < 12; i++) {
      const x = rng.float(0, S), y = rng.float(0, S);
      wrap(S, (dx, dy) => slash(g, x + dx, y + dy, rng.float(30, 90), rng.float(0.6, 1.4), rng.float(3, 6), accent));
    }
  } else if (style === 'hazard') {
    g.save();
    for (let i = -8; i < 16; i++) {
      g.fillStyle = i % 2 ? secondary : primary;
      g.beginPath();
      g.moveTo(i * 48, 0);
      g.lineTo(i * 48 + 48, 0);
      g.lineTo(i * 48 + 48 - S, S);
      g.lineTo(i * 48 - S, S);
      g.closePath();
    }
    g.restore();
    // scattered dirt & big chevrons
    g.fillStyle = primary;
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 96) {
      g.fillStyle = secondary;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S / 2, y + 42);
      g.lineTo(S, y);
      g.lineTo(S, y + 24);
      g.lineTo(S / 2, y + 66);
      g.lineTo(0, y + 24);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = rng.float(0, S), y = rng.float(0, S);
      wrap(S, (dx, dy) => scribbleSkull(g, x + dx, y + dy, 26, new Rng(seed + i), accent));
    }
  } else if (style === 'stripes') {
    // funeral black with gold pinstripes + damask diamonds
    g.fillStyle = primary;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = secondary;
    g.lineWidth = 3;
    for (let i = 0; i < S; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }
    g.lineWidth = 2;
    for (let x = 32; x < S; x += 64) for (let y = 32; y < S; y += 64) {
      g.beginPath();
      g.moveTo(x, y - 18); g.lineTo(x + 12, y); g.lineTo(x, y + 18); g.lineTo(x - 12, y);
      g.closePath();
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = rng.float(0, S), y = rng.float(0, S);
      wrap(S, (dx, dy) => scribbleSkull(g, x + dx, y + dy, 24, new Rng(seed + i), accent));
    }
  } else {
    // flames
    g.fillStyle = primary;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 12; i++) {
      const x = rng.float(0, S), y = rng.float(0, S), h = rng.float(80, 190), w = rng.float(30, 60);
      wrap(S, (dx, dy) => {
        g.fillStyle = secondary;
        g.beginPath();
        g.moveTo(x + dx - w / 2, y + dy);
        g.bezierCurveTo(x + dx - w, y + dy - h * 0.4, x + dx - w * 0.2, y + dy - h * 0.6, x + dx, y + dy - h);
        g.bezierCurveTo(x + dx + w * 0.1, y + dy - h * 0.55, x + dx + w, y + dy - h * 0.35, x + dx + w / 2, y + dy);
        g.closePath();
        g.fill();
        g.fillStyle = accent;
        g.globalAlpha = 0.9;
        g.beginPath();
        g.moveTo(x + dx - w * 0.2, y + dy);
        g.bezierCurveTo(x + dx - w * 0.5, y + dy - h * 0.3, x + dx - w * 0.05, y + dy - h * 0.4, x + dx, y + dy - h * 0.62);
        g.bezierCurveTo(x + dx + w * 0.1, y + dy - h * 0.3, x + dx + w * 0.4, y + dy - h * 0.2, x + dx + w * 0.2, y + dy);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
      });
    }
  }

  // wear: paint chips revealing steel, scratches, grime
  for (let i = 0; i < 160; i++) {
    const x = rng.float(0, S), y = rng.float(0, S), r = rng.float(1.5, 5);
    g.fillStyle = rng.chance(0.6) ? '#8a8f9a' : '#3a3d46';
    g.globalAlpha = rng.float(0.35, 0.85);
    wrap(S, (dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + r * rng.float(0.5, 2), y + dy + rng.float(-r, r));
      g.lineTo(x + dx + rng.float(-r, r), y + dy + r * rng.float(0.5, 2));
      g.closePath();
      g.fill();
    });
  }
  g.globalAlpha = 1;
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = rng.float(0, S), y = rng.float(0, S), l = rng.float(10, 46), a = rng.float(0, 6.28);
    g.strokeStyle = rng.chance(0.5) ? 'rgba(220,225,235,0.28)' : 'rgba(0,0,0,0.3)';
    g.lineWidth = rng.float(0.8, 1.8);
    wrap(S, (dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      g.stroke();
    });
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.float(0, S), y = rng.float(0, S), r = rng.float(40, 110);
    wrap(S, (dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, 'rgba(10,6,4,0.34)');
      gr.addColorStop(1, 'rgba(10,6,4,0)');
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
