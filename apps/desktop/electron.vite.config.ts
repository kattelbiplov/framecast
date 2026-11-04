import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// Workspace packages and npm deps are bundled into main/preload. Only `electron` and native
// modules (uiohook-napi, loaded at runtime from node_modules) stay external.
export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts'), external: ['electron', 'uiohook-napi'] },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts'), external: ['electron'] },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
