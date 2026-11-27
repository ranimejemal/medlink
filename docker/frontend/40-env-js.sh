#!/bin/sh
# Writes /env.js: the PUBLIC settings of the browser app (never a secret).
# SUPABASE_URL is empty by default: the app then uses the site's own address (same origin),
# and nginx forwards /auth/v1, /rest/v1 and /storage/v1 to the Supabase gateway.
set -eu
mkdir -p /tmp/medlink
url="${PUBLIC_SUPABASE_URL:-}"
key="${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY is required}"
if [ -z "$url" ]; then url_js="window.location.origin"; else url_js="\"$url\""; fi
printf 'window.__MEDLINK_ENV__={SUPABASE_URL:%s,SUPABASE_PUBLISHABLE_KEY:"%s"};\n' "$url_js" "$key" \
  > /tmp/medlink/env.js
echo "40-env-js.sh: /env.js written"
