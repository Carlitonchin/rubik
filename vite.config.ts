import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js ocupa por sí solo cerca de 500 kB.
    chunkSizeWarningLimit: 800,
  },
});
