import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, itch.io, local file servers).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
