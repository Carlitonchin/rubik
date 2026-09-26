import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    // El detector de manos carga MediaPipe como módulo dentro del worker.
    format: 'es',
  },
  build: {
    // Three.js ocupa por sí solo cerca de 500 kB.
    chunkSizeWarningLimit: 800,
  },
});
