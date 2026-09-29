import * as THREE from 'three';
import { Rng } from '../core/Rng';

/** Procedural "hand painted" textures drawn on canvases at startup. */

export interface Palette {
  base: string;
  dark: string;
  light: string;
  accent: string;
  mortar: string;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTex(c: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}

function jitterLine(g: CanvasRenderingContext2D, rng: Rng, x0: number, y0: number, x1: number, y1: number, j: number) {
  const segs = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 14));
  g.moveTo(x0 + rng.float(-j, j), y0 + rng.float(-j, j));
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    g.lineTo(x0 + (x1 - x0) * t + rng.float(-j, j), y0 + (y1 - y0) * t + rng.float(-j, j));
  }
}

/** Stone brick wall with inked edges, chips and grime. */
export function stoneWallTexture(p: Palette, seed = 1) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rng = new Rng(seed);
  g.fillStyle = p.mortar;
  g.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 === 0 ? 0 : -rng.int(30, 70);
    while (x < S) {
      const w = rng.int(80, 140);
      const drawBrick = (ox: number) => {
        const bx = x + ox + 3, by = r * rh + 3, bw = w - 6, bh = rh - 6;
        const col = shade(p.base, rng.float(-0.06, 0.06));
        g.fillStyle = col;
        g.beginPath();
        const rr = 6;
        g.moveTo(bx + rr, by);
        g.lineTo(bx + bw - rr, by + rng.float(-1, 1));
        g.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
        g.lineTo(bx + bw + rng.float(-1, 1), by + bh - rr);
        g.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
        g.lineTo(bx + rr, by + bh + rng.float(-1, 1));
        g.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
        g.lineTo(bx + rng.float(-1, 1), by + rr);
        g.quadraticCurveTo(bx, by, bx + rr, by);
        g.closePath();
        g.fill();
        // top highlight / bottom shadow bands (painted lighting)
        g.fillStyle = shade(col, 0.07);
        g.fillRect(bx + 4, by + 3, bw - 8, 6);
        g.fillStyle = shade(col, -0.08);
        g.fillRect(bx + 4, by + bh - 9, bw - 8, 6);
        // speckles
        for (let i = 0; i < 18; i++) {
          g.fillStyle = rng.chance(0.5) ? shade(col, -0.12) : shade(col, 0.1);
          g.fillRect(bx + rng.float(4, bw - 6), by + rng.float(4, bh - 6), rng.float(1, 3), rng.float(1, 3));
        }
        // ink outline
        g.strokeStyle = p.dark;
        g.lineWidth = 3;
        g.stroke();
        // cracks
        if (rng.chance(0.35)) {
          g.beginPath();
          const cx = bx + rng.float(10, bw - 10), cy = by + rng.float(6, bh - 6);
          jitterLine(g, rng, cx, cy, cx + rng.float(-30, 30), cy + rng.float(-20, 20), 3);
          g.lineWidth = 2;
          g.stroke();
        }
        // chipped corner
        if (rng.chance(0.25)) {
          g.fillStyle = p.mortar;
          g.beginPath();
          const cx = rng.chance(0.5) ? bx : bx + bw, cy = rng.chance(0.5) ? by : by + bh;
          g.arc(cx, cy, rng.float(5, 10), 0, Math.PI * 2);
          g.fill();
        }
      };
      drawBrick(0);
      if (x + w > S) drawBrick(-S);
      if (x < 0) drawBrick(S);
      x += w;
    }
  }
  // grime / soot overlay
  for (let i = 0; i < 14; i++) {
    const gx = rng.float(0, S), gy = rng.float(0, S), gr = rng.float(40, 120);
    const grad = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  }
  // accent (moss / crystal dust / embers) drips
  g.globalAlpha = 0.5;
  for (let i = 0; i < 10; i++) {
    g.fillStyle = p.accent;
    const x = rng.float(0, S), y = rng.float(0, S);
    g.beginPath();
    g.ellipse(x, y, rng.float(6, 20), rng.float(3, 8), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // hatching in the lower part (comic shading)
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const x = rng.float(0, S), y = rng.float(S * 0.55, S);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 10, y - 10);
    g.stroke();
  }
  return toTex(c);
}

/** Irregular cobblestone floor, seamless. */
export function cobbleTexture(p: Palette, seed = 2) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rng = new Rng(seed);
  g.fillStyle = p.mortar;
  g.fillRect(0, 0, S, S);
  const n = 6;
  const cell = S / n;
  const pts: [number, number][][] = [];
  for (let y = 0; y < n; y++) {
    pts.push([]);
    for (let x = 0; x < n; x++) pts[y].push([x * cell + cell / 2 + rng.float(-cell * 0.18, cell * 0.18), y * cell + cell / 2 + rng.float(-cell * 0.18, cell * 0.18)]);
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [cx, cy] = pts[y][x];
      const col = shade(p.base, rng.float(-0.07, 0.05));
      const rw = cell * rng.float(0.5, 0.56), rh = cell * rng.float(0.5, 0.56);
      const verts: [number, number][] = [];
      const k = 8;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + rng.float(-0.12, 0.12);
        const rr = rng.float(0.9, 1.04);
        verts.push([Math.cos(a) * rw * rr, Math.sin(a) * rh * rr]);
      }
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          const px = cx + ox, py = cy + oy;
          if (px < -cell || px > S + cell || py < -cell || py > S + cell) continue;
          g.beginPath();
          verts.forEach(([vx, vy], i) => (i === 0 ? g.moveTo(px + vx, py + vy) : g.lineTo(px + vx, py + vy)));
          g.closePath();
          g.fillStyle = col;
          g.fill();
          // painted light from upper-left
          const grad = g.createLinearGradient(px - rw, py - rh, px + rw, py + rh);
          grad.addColorStop(0, 'rgba(255,255,255,0.10)');
          grad.addColorStop(0.5, 'rgba(255,255,255,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.16)');
          g.fillStyle = grad;
          g.fill();
          g.strokeStyle = p.dark;
          g.lineWidth = 4;
          g.stroke();
          // a few chips/cracks per stone
          if (rng.chance(0.3)) {
            g.beginPath();
            g.moveTo(px + rng.float(-rw, rw) * 0.5, py + rng.float(-rh, rh) * 0.5);
            g.lineTo(px + rng.float(-rw, rw) * 0.7, py + rng.float(-rh, rh) * 0.7);
            g.lineWidth = 2;
            g.stroke();
          }
        }
      }
    }
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.06)';
    g.fillRect(rng.float(0, S), rng.float(0, S), 2, 2);
  }
  g.globalAlpha = 0.35;
  for (let i = 0; i < 6; i++) {
    g.fillStyle = p.accent;
    g.beginPath();
    g.ellipse(rng.float(0, S), rng.float(0, S), rng.float(4, 14), rng.float(2, 6), rng.float(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return toTex(c);
}

export function woodTexture(seed = 3, base = '#7a4a28') {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = new Rng(seed);
  const planks = 4;
  const pw = S / planks;
  for (let i = 0; i < planks; i++) {
    const col = shade(base, rng.float(-0.06, 0.05));
    g.fillStyle = col;
    g.fillRect(i * pw, 0, pw, S);
    g.strokeStyle = shade(col, -0.12);
    g.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      const x = i * pw + rng.float(6, pw - 6);
      g.moveTo(x, 0);
      for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * 0.05 + k) * 3, y);
      g.stroke();
    }
    g.strokeStyle = '#1a0f08';
    g.lineWidth = 4;
    g.strokeRect(i * pw + 1, -2, pw - 2, S + 4);
    // knots
    g.fillStyle = shade(col, -0.2);
    g.beginPath();
    g.ellipse(i * pw + pw / 2 + rng.float(-8, 8), rng.float(20, S - 20), 5, 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  return toTex(c);
}

export function metalTexture(seed = 4, base = '#4a4d55') {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = new Rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const x = i * 128, y = j * 128;
      g.fillStyle = shade(base, rng.float(-0.05, 0.05));
      g.fillRect(x + 4, y + 4, 120, 120);
      const grad = g.createLinearGradient(x, y, x + 128, y + 128);
      grad.addColorStop(0, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = grad;
      g.fillRect(x + 4, y + 4, 120, 120);
      g.strokeStyle = '#111';
      g.lineWidth = 4;
      g.strokeRect(x + 4, y + 4, 120, 120);
      g.fillStyle = shade(base, 0.2);
      for (const [rx, ry] of [[14, 14], [114, 14], [14, 114], [114, 114]]) {
        g.beginPath();
        g.arc(x + rx, y + ry, 5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      // scratches
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        const sx = x + rng.float(10, 110), sy = y + rng.float(10, 110);
        g.moveTo(sx, sy);
        g.lineTo(sx + rng.float(-20, 20), sy + rng.float(-20, 20));
        g.stroke();
      }
    }
  }
  return toTex(c);
}

type Emblem = 'skull' | 'crown' | 'flame' | 'eye' | 'coin';

export function drawEmblem(g: CanvasRenderingContext2D, e: Emblem, cx: number, cy: number, s: number, fill: string, ink = '#111') {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 100, s / 100);
  g.fillStyle = fill;
  g.strokeStyle = ink;
  g.lineWidth = 6;
  g.lineJoin = 'round';
  switch (e) {
    case 'skull': {
      g.beginPath();
      g.moveTo(-40, -5);
      g.bezierCurveTo(-45, -60, 45, -60, 40, -5);
      g.lineTo(32, 18);
      g.lineTo(20, 22);
      g.lineTo(20, 40);
      g.lineTo(-20, 40);
      g.lineTo(-20, 22);
      g.lineTo(-32, 18);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = ink;
      g.beginPath();
      g.moveTo(-28, -8); g.lineTo(-6, -12); g.lineTo(-10, 8); g.lineTo(-26, 6); g.closePath();
      g.moveTo(28, -8); g.lineTo(6, -12); g.lineTo(10, 8); g.lineTo(26, 6); g.closePath();
      g.moveTo(0, 12); g.lineTo(-6, 22); g.lineTo(6, 22); g.closePath();
      g.fill();
      g.fillRect(-10, 28, 4, 12);
      g.fillRect(-1, 28, 4, 12);
      g.fillRect(8, 28, 4, 12);
      break;
    }
    case 'crown': {
      g.beginPath();
      g.moveTo(-45, 30);
      g.lineTo(-50, -30);
      g.lineTo(-22, 0);
      g.lineTo(0, -45);
      g.lineTo(22, 0);
      g.lineTo(50, -30);
      g.lineTo(45, 30);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'flame': {
      g.beginPath();
      g.moveTo(0, 50);
      g.bezierCurveTo(-45, 45, -40, 0, -15, -20);
      g.bezierCurveTo(-18, 0, -5, 5, -2, -10);
      g.bezierCurveTo(-5, -30, 10, -40, 5, -55);
      g.bezierCurveTo(35, -30, 45, 20, 0, 50);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'eye': {
      g.beginPath();
      g.moveTo(-50, 0);
      g.quadraticCurveTo(0, -45, 50, 0);
      g.quadraticCurveTo(0, 45, -50, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(0, 0, 10, 22, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'coin': {
      g.beginPath();
      g.arc(0, 0, 40, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.font = 'bold 50px sans-serif';
      g.fillStyle = ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 3);
      break;
    }
  }
  g.restore();
}

export function bannerTexture(color: string, emblem: Emblem, emblemColor = '#f4ead5') {
  const [c, g] = canvas(128, 320);
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 320);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 320);
  g.fillStyle = '#d4a93a';
  g.fillRect(0, 0, 128, 14);
  g.fillRect(10, 20, 6, 250);
  g.fillRect(112, 20, 6, 250);
  drawEmblem(g, emblem, 64, 140, 90, emblemColor);
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 314);
  return toTex(c, false);
}

/** Spray-painted graffiti (transparent). */
export function graffitiTexture(lines: string[], color = '#f2efe6', arrow: 'left' | 'right' | 'none' = 'none', font = 'Permanent Marker') {
  const W = 512, H = 256;
  const [c, g] = canvas(W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = lines.length > 2 ? 58 : 74;
  g.font = `${size}px "${font}", "Bangers", sans-serif`;
  lines.forEach((l, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * size * 0.95 - (arrow !== 'none' ? 24 : 0);
    g.save();
    g.translate(W / 2, y);
    g.rotate(-0.05 + i * 0.02);
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.fillStyle = color;
    g.fillText(l, 0, 0);
    g.restore();
  });
  // drips
  g.fillStyle = color;
  const rng = new Rng(lines.join('').length * 7);
  for (let i = 0; i < 7; i++) {
    const x = W / 2 + rng.float(-180, 180);
    const y = H / 2 + rng.float(0, 30);
    g.fillRect(x, y, 3, rng.float(10, 40));
  }
  if (arrow !== 'none') {
    g.save();
    g.translate(W / 2, H - 48);
    if (arrow === 'left') g.scale(-1, 1);
    g.strokeStyle = color;
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-90, 0);
    g.lineTo(80, 0);
    g.moveTo(50, -28);
    g.lineTo(88, 0);
    g.lineTo(50, 28);
    g.stroke();
    g.restore();
  }
  return toTex(c, false);
}

export function runeTexture(seed = 5) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = new Rng(seed);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = '#ffffff';
  g.shadowBlur = 16;
  g.translate(S / 2, S / 2);
  // diamond frame
  g.beginPath();
  g.moveTo(0, -110);
  g.lineTo(70, 0);
  g.lineTo(0, 110);
  g.lineTo(-70, 0);
  g.closePath();
  g.stroke();
  g.lineWidth = 8;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = rng.float(-50, 50), b = rng.float(-80, 80);
    g.moveTo(a * 0.6, b * 0.6);
    g.lineTo(rng.float(-40, 40), rng.float(-70, 70));
  }
  g.moveTo(0, -60);
  g.lineTo(0, 60);
  g.stroke();
  return toTex(c, false);
}

/** Car livery atlas: top half = view-from-above stripes, bottom half = side graphics. */
export function liveryTexture(primary: string, secondary: string, accent: string, style: 'shards' | 'stripes' | 'flames' | 'hazard', seed = 9, emblem: Emblem = 'crown') {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const rng = new Rng(seed);
  g.fillStyle = primary;
  g.fillRect(0, 0, W, H);
  // Top: racing stripes along the length (u = length, v = width)
  g.fillStyle = secondary;
  g.fillRect(0, 256 * 0.36, W, 256 * 0.1);
  g.fillRect(0, 256 * 0.54, W, 256 * 0.1);
  g.fillStyle = accent;
  g.fillRect(0, 256 * 0.475, W, 256 * 0.05);
  // Side: graphics
  const sy = 256;
  if (style === 'shards') {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = rng.chance(0.6) ? secondary : accent;
      const x = rng.float(0, W), y = sy + rng.float(30, 230), s = rng.float(12, 44);
      g.beginPath();
      g.moveTo(x, y - s);
      g.lineTo(x + s * rng.float(0.3, 0.7), y + s * 0.3);
      g.lineTo(x - s * rng.float(0.2, 0.6), y + s * rng.float(0.2, 0.8));
      g.closePath();
      g.fill();
    }
    // splatter
    for (let i = 0; i < 40; i++) {
      g.fillStyle = accent;
      g.beginPath();
      g.arc(rng.float(0, W), sy + rng.float(40, 220), rng.float(1.5, 5), 0, Math.PI * 2);
      g.fill();
    }
  } else if (style === 'stripes') {
    g.fillStyle = secondary;
    g.fillRect(0, sy + 110, W, 22);
    g.fillStyle = accent;
    g.fillRect(0, sy + 136, W, 8);
  } else if (style === 'flames') {
    for (let i = 0; i < 9; i++) {
      const x0 = W * 0.55 + i * 6;
      g.fillStyle = i % 2 ? accent : secondary;
      g.beginPath();
      const cy = sy + 128 + rng.float(-30, 30);
      g.moveTo(W, cy - 30);
      g.quadraticCurveTo(x0 + 60, cy - 50, x0 - rng.float(40, 160), cy + rng.float(-20, 20));
      g.quadraticCurveTo(x0 + 80, cy + 40, W, cy + 30);
      g.closePath();
      g.fill();
    }
  } else {
    for (let x = -60; x < W + 60; x += 60) {
      g.fillStyle = secondary;
      g.beginPath();
      g.moveTo(x, sy + 150);
      g.lineTo(x + 30, sy + 150);
      g.lineTo(x + 60, sy + 110);
      g.lineTo(x + 30, sy + 110);
      g.closePath();
      g.fill();
    }
  }
  // emblem & number on the doors
  drawEmblem(g, emblem, W * 0.5, sy + 120, 70, secondary === '#111111' ? '#f2efe6' : secondary);
  g.font = 'bold 44px "Anton", sans-serif';
  g.fillStyle = accent;
  g.textAlign = 'center';
  g.fillText(String(rng.int(2, 99)), W * 0.3, sy + 140);
  // wear & grime
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(0,0,0,${rng.float(0.05, 0.2)})`;
    g.fillRect(rng.float(0, W), rng.float(0, H), rng.float(2, 8), rng.float(1, 3));
  }
  const grad = g.createLinearGradient(0, sy + 180, 0, H);
  grad.addColorStop(0, 'rgba(40,30,20,0)');
  grad.addColorStop(1, 'rgba(40,30,20,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, sy + 180, W, 76);
  return toTex(c, false);
}

/** Radial soft dot, used for glows/halos. */
export function glowDotTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTex(c, false, false);
}

/** Text label texture for world signs. */
export function signTexture(text: string, sub: string, bg = '#111', fg = '#f2efe6', accent = '#e8242f') {
  const [c, g] = canvas(512, 160);
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(10, 20);
  g.lineTo(502, 4);
  g.lineTo(490, 150);
  g.lineTo(20, 156);
  g.closePath();
  g.fill();
  g.strokeStyle = fg;
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(24, 110, 200, 8);
  g.fillStyle = fg;
  g.font = '64px "Anton", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 64);
  g.font = '30px "Barlow Condensed", sans-serif';
  g.fillStyle = accent;
  g.fillText(sub.toUpperCase(), 256, 124);
  return toTex(c, false);
}
