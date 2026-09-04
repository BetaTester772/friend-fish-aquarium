import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createRouter, isApiPath, json } from './router.js';
import { createStore } from './store.js';
import { createLocalRealtime } from './sse.js';
import { openSqlite } from './sqlite.js';
import { assertUsablePassphrase } from './gate.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');

/**
 * The server: `node:http` in front of the Web-standard router, serving the
 * built client from `dist/` and the API from `server/router.js`.
 *
 * Behind a TLS-terminating reverse proxy (see `deploy/`), set FFA_TRUST_PROXY=1
 * so the app knows the original request was https.
 */
export function createNodeApp({ file, now, random } = {}) {
  const db = openSqlite(file);
  const store = createStore(db, { now });
  const realtime = createLocalRealtime();
  const handle = createRouter({ store, realtime, random });

  const server = http.createServer((req, res) => {
    toWebRequest(req)
      .then(async (request) => {
        const response =
          (await handle(request)) ?? (await serveStatic(new URL(request.url)));
        await writeResponse(res, response);
      })
      .catch((err) => {
        console.error('[ffa]', err);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
      });
  });

  return { server, store, realtime, db };
}

export async function startServer({ port = Number(process.env.PORT) || 8787 } = {}) {
  // Fail before binding a port rather than serving an unprotected tank. This is
  // an operator mistake, not a crash, so report it as one line and stop.
  let gate;
  try {
    gate = assertUsablePassphrase();
  } catch (err) {
    console.error(`[ffa] ${err.message}`);
    process.exit(1);
  }

  const app = createNodeApp();

  // Make sure the shared tank exists before the first request arrives.
  const tank = await app.store.defaultTank();
  await app.store.pruneActivity();
  const pruner = setInterval(() => app.store.pruneActivity(), 60 * 60 * 1000);
  pruner.unref();

  app.server.listen(port, () => {
    console.log(`friend fish aquarium listening on http://localhost:${port}`);
    console.log(`tank invite code: ${tank.invite_code}`);
    console.log(
      gate.enabled
        ? 'passphrase required (FFA_PASSPHRASE is set)'
        : 'OPEN TANK — anyone who finds the URL can join. Set FFA_PASSPHRASE to gate it.',
    );
  });

  const shutdown = () => {
    clearInterval(pruner);
    app.realtime.close();
    app.server.close(() => {
      app.db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}

// ------------------------------------------------------------------ plumbing

/** node:http IncomingMessage -> Web Request. */
async function toWebRequest(req) {
  const url = requestUrl(req);
  const controller = new AbortController();
  req.on('aborted', () => controller.abort());
  req.on('close', () => controller.abort());

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: hasBody ? await readBody(req) : undefined,
    signal: controller.signal,
  });
}

/**
 * Reconstructs the URL the browser actually asked for.
 *
 * A reverse proxy terminates TLS and forwards plain http, so without this the
 * app would think every request was insecure and drop `Secure` from the session
 * cookie. The forwarded headers are trusted only when FFA_TRUST_PROXY is set —
 * anyone can send them, so they are meaningless unless a proxy you control is
 * guaranteed to be in front.
 */
function requestUrl(req) {
  const trustProxy = process.env.FFA_TRUST_PROXY === '1';
  const first = (header) => String(header ?? '').split(',')[0].trim();

  const forwardedProto = trustProxy ? first(req.headers['x-forwarded-proto']) : '';
  const protocol = forwardedProto === 'https' ? 'https' : 'http';

  const host =
    (trustProxy ? first(req.headers['x-forwarded-host']) : '') ||
    req.headers.host ||
    'localhost';

  return `${protocol}://${host}${req.url}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Web Response -> node:http, streaming the body so SSE stays open. */
async function writeResponse(res, response) {
  const headers = {};
  for (const [key, value] of response.headers) headers[key] = value;
  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};

/**
 * Serves the built client plus `public/` (the MediaPipe model and wasm), with
 * `index.html` as the fallback so client-side routing works.
 */
async function serveStatic(url) {
  if (isApiPath(url.pathname)) return json({ error: 'not_found' }, 404);

  for (const base of [distDir, publicDir]) {
    const file = safeJoin(base, url.pathname);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fileResponse(file, url.pathname);
    }
  }

  const index = path.join(distDir, 'index.html');
  if (fs.existsSync(index)) return fileResponse(index, '/index.html');

  return new Response(
    'Client not built yet — run `npm run build`, or use `npm run dev` for the Vite dev server.',
    { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
}

/**
 * Caching, which decides whether a deploy actually reaches anyone.
 *
 * Vite fingerprints everything under /assets/, so those can be kept forever —
 * a new build produces new names. `index.html` is the opposite: it is the one
 * file that names the current bundles, so it must be revalidated every time.
 * Without a header here browsers cache it heuristically, and someone who has
 * already visited keeps loading yesterday's build no matter what is deployed.
 */
function cacheControlFor(pathname) {
  if (pathname.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  // The vendored model and wasm keep fixed names, so they get a bounded life
  // rather than an unbounded one — 3.6MB is worth caching, but not forever.
  if (pathname.startsWith('/models/') || pathname.startsWith('/mediapipe-wasm/')) {
    return 'public, max-age=604800';
  }
  return 'no-cache';
}

function fileResponse(file, pathname) {
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': cacheControlFor(pathname),
    },
  });
}

/** Blocks `..` traversal out of the served directory. */
function safeJoin(base, pathname) {
  const resolved = path.resolve(base, `.${decodeURIComponent(pathname)}`);
  return resolved === base || resolved.startsWith(base + path.sep) ? resolved : null;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
