import { defineConfig } from 'vite';

const API_TARGET = process.env.FFA_API_TARGET ?? 'http://localhost:8787';

/**
 * Paths the API owns; Vite proxies them through in development. The MediaPipe
 * model and wasm live in `public/`, which Vite serves itself, so they are not
 * proxied.
 */
const proxied = ['/api', '/faces'];

export default defineConfig({
  root: 'client',
  // Stamped into the bundle so a bug report can be tied to the code that
  // produced it. Three rounds were spent unsure whether a fix was even running.
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
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
