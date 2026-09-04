import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStore } from './store.js';
import { createRealtime } from './realtime.js';
import { createApi } from './api.js';
import { attachUser } from './auth.js';
import { faceDir } from './db.js';
import { config } from './config.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Builds the Express app. Exported separately from `listen` so tests can mount
 * it on an ephemeral port with their own on-disk database.
 */
export function createApp({ store, realtime } = {}) {
  store ??= createStore();
  realtime ??= createRealtime();

  const app = express();
  app.disable('x-powered-by');
  app.use(attachUser(store));

  app.use('/api', createApi({ store, realtime }));

  // Stored face cutouts. Immutable: the filename contains a random id and a
  // face is never rewritten in place, only replaced by a new one.
  app.use(
    '/assets/faces',
    express.static(faceDir, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  );

  // The vendored MediaPipe model + wasm are served locally so face detection
  // never calls out to a third-party CDN (spec §12).
  app.use('/models', express.static(path.join(rootDir, 'public/models')));
  app.use(
    '/mediapipe-wasm',
    express.static(path.join(rootDir, 'public/mediapipe-wasm')),
  );

  // In production the built client is served from here; in development Vite
  // owns the page and proxies /api back to this server.
  const distDir = path.join(rootDir, 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((err, _req, res, _next) => {
    console.error('[ffa]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error' });
  });

  return { app, store, realtime };
}

export function startServer({ port = Number(process.env.PORT) || 8787 } = {}) {
  const { app, store, realtime } = createApp();

  // Make sure the shared tank exists before the first request arrives.
  store.defaultTank();
  store.pruneActivity();
  const pruner = setInterval(
    () => store.pruneActivity(),
    60 * 60 * 1000,
  );
  pruner.unref();

  const server = app.listen(port, () => {
    console.log(`friend fish aquarium listening on http://localhost:${port}`);
    console.log(
      `tank invite code: ${store.defaultTank().invite_code} · ` +
        `feed cooldown ${config.feed.cooldownMs}ms`,
    );
  });

  const shutdown = () => {
    clearInterval(pruner);
    realtime.close();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, store, realtime };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
