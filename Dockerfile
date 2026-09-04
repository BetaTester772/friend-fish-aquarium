# syntax=docker/dockerfile:1

# better-sqlite3 is a native module, so the build stage needs a toolchain. The
# runtime stage gets only the compiled result, keeping the final image small.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# `npm ci` runs the postinstall that vendors the MediaPipe wasm into public/,
# so scripts/ has to be present first.
COPY scripts ./scripts
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 FFA_DATA_DIR=/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data && chown node:node /data

# dist/ already contains the built client plus the MediaPipe model and wasm that
# Vite copied out of public/, so public/ is not needed at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations

USER node
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "server/node.js"]
