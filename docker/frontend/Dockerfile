# syntax=docker/dockerfile:1
# Image "medlink-frontend": the pages of the app (static files) served by nginx, plus the
# site's entry point (forwards /api to the backend and the Supabase APIs to the gateway).
# Build from the repository root:  docker build -f docker/frontend/Dockerfile -t medlink-frontend .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# Single-page build, settings read at run time from /env.js (see src/lib/public-env.ts).
RUN MEDLINK_SPA=1 VITE_RUNTIME_CONFIG=1 npx vite build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY --from=build /app/dist/client/ /usr/share/nginx/html/
COPY docker/frontend/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/frontend/security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --chmod=0755 docker/frontend/40-env-js.sh /docker-entrypoint.d/40-env-js.sh
# Defaults for docker compose; Kubernetes sets the Service addresses (k8s/app/frontend.yaml).
ENV BACKEND_URL=http://backend:3000 GATEWAY_URL=http://gateway:8000 \
    NGINX_ENVSUBST_FILTER="^(BACKEND_URL|GATEWAY_URL)$"
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
