import '@fontsource/anton/400.css';
import '@fontsource/bangers/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import './ui/style.css';
import { Game } from './game/Game';

async function boot() {
  // Make sure the display fonts are ready before canvas textures (signs, graffiti, liveries) are drawn.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('64px "Anton"'),
        document.fonts.load('40px "Bangers"'),
        document.fonts.load('40px "Permanent Marker"'),
        document.fonts.load('700 20px "Barlow Condensed"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fonts are optional */
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  game.start();
}

boot();
