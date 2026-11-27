# syntax=docker/dockerfile:1
# Image "medlink-backend": the Node.js server (server functions, /api: Swagger, health,
# e-mail job). Holds the server-side secrets, injected at run time (never in the image).
# Build from the repository root:  docker build -f docker/backend/Dockerfile -t medlink-backend .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN NITRO_PRESET=node-server npx vite build

# Node 22: supabase-js needs the native WebSocket (missing in Node 20).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", ".output/server/index.mjs"]
