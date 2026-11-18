#!/usr/bin/env bash
# US-45: CI fails if a secret is committed. Secrets live in Supabase Vault (medical data key)
# and in the server's .env (never committed), not in the source code.
set -euo pipefail

pattern="sb_secret_[A-Za-z0-9_-]{10,}|eyJhbGciOi[A-Za-z0-9._-]{40,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|^[[:space:]]*(export[[:space:]]+)?(SMTP_PASS|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|AI_API_KEY)=[\"']?[^\"'[:space:]]{8,}"

if git grep -nIE "$pattern" -- . ':!package-lock.json' ':!scripts/check-secrets.sh'; then
  echo "::error::Possible secret committed (see the lines above). Move it to .env or Vault."
  exit 1
fi

if git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'; then
  echo "::error::A .env file is committed. Remove it with: git rm --cached <file>"
  exit 1
fi

echo "No secret found in the repository."
