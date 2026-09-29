import '@fontsource/anton/400.css';
import '@fontsource/bangers/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/600-italic.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import './ui/style.css';
import { Game } from './game/Game';
import { preloadArt } from './render/Art';

async function boot() {
  // Make sure the display fonts are ready before canvas textures (signs, graffiti, liveries) are drawn.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('64px "Anton"'),
        document.fonts.load('40px "Bangers"'),
        document.fonts.load('40px "Permanent Marker"'),
        document.fonts.load('700 20px "Barlow Condensed"'),
        document.fonts.load('italic 900 20px "Barlow Condensed"'),
        document.fonts.load('italic 800 20px "Barlow Condensed"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fonts are optional */
  }
  try {
    await Promise.race([preloadArt(), new Promise((r) => setTimeout(r, 6000))]);
  } catch {
    /* art is optional */
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  game.start();
}

boot();
