import { defineConfig } from 'vite';

const API_TARGET = process.env.FFA_API_TARGET ?? 'http://localhost:8787';

/** Paths the API server owns; Vite proxies them through in development. */
const proxied = ['/api', '/assets', '/models', '/mediapipe-wasm'];

export default defineConfig({
  root: 'client',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // three.js is needed for the first frame; the face detector is not.
        manualChunks: { three: ['three'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((path) => [
        path,
        { target: API_TARGET, changeOrigin: true, ws: false },
      ]),
    ),
  },
});
