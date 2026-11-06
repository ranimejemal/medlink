# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# VITE_* values are public and baked into the browser bundle at build time.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

# Node 22: supabase-js needs the native WebSocket (missing in Node 20).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
# Server-side secrets (SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY, ...) are injected at runtime, never at build time.
CMD ["node", ".output/server/index.mjs"]