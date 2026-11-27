#!/bin/sh
# Copies the REAL MedLink data from Supabase cloud into the Kubernetes database
# (Job "medlink-import-cloud", started by scripts/k8s-import-cloud.ps1).
#
#   - accounts: auth.users + auth.identities (password hashes kept: everyone keeps their password);
#     MFA factors are NOT copied (Supabase cloud may encrypt their secrets): practitioners and
#     admins set up MFA again at their next sign-in, as the app requires;
#   - every table of the "public" schema (profiles, appointments, records, audit log...);
#   - the Vault key "medical_data_key", so the encrypted medical data stays readable (US-43);
#   - the files of the "patient-documents" bucket (if CLOUD_SERVICE_KEY is given).
#
# The demo data of the cluster is REPLACED. Only columns that exist on both sides are copied,
# so small version differences between Supabase cloud and the cluster do not matter.
# Env: CLOUD_DB_URL (Supabase cloud, session pooler), SUPERUSER_PASSWORD, PGHOST (cluster primary),
#      CLOUD_API_URL + CLOUD_SERVICE_KEY (optional, for the files), SERVICE_ROLE_KEY, STORAGE_URL.
set -eu

PGHOST="${PGHOST:-medlink-db-rw}"
LOCAL="postgres://postgres:${SUPERUSER_PASSWORD}@${PGHOST}:5432/postgres?sslmode=require"
CLOUD="${CLOUD_DB_URL:?CLOUD_DB_URL is required}"
case "$CLOUD" in *sslmode=*) ;; *\?*) CLOUD="$CLOUD&sslmode=require" ;; *) CLOUD="$CLOUD?sslmode=require" ;; esac
log() { echo "[import] $*"; }
q() { psql -X -v ON_ERROR_STOP=1 -q -tA "$@"; }
# Cluster side while loading: triggers and foreign-key checks off (superuser only), so rows are
# copied as they are, without re-running the app's triggers (new-user profile, audit, encryption).
qload() { PGOPTIONS="-c session_replication_role=replica" psql -X -v ON_ERROR_STOP=1 -q -tA "$@"; }

log "connecting to Supabase cloud"
q "$CLOUD" -c "select 1" >/dev/null || { log "cannot connect to Supabase cloud: check the URL and password"; exit 1; }
log "connected; cloud users: $(q "$CLOUD" -c 'select count(*) from auth.users')"

# Tables to copy, in the cluster (target) catalog.
PUBLIC_TABLES=$(q "$LOCAL" -c "select tablename from pg_tables where schemaname = 'public' order by 1")
TABLES="auth.users auth.identities"
for t in $PUBLIC_TABLES; do TABLES="$TABLES public.$t"; done

# Columns present on both sides, minus generated columns of the target.
common_cols() {
  schema=${1%%.*}; table=${1#*.}
  local_cols=$(q "$LOCAL" -c "select column_name from information_schema.columns
    where table_schema = '$schema' and table_name = '$table'
      and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    order by ordinal_position")
  cloud_cols=$(q "$CLOUD" -c "select column_name from information_schema.columns
    where table_schema = '$schema' and table_name = '$table'")
  out=""
  for c in $local_cols; do
    if echo "$cloud_cols" | grep -qx "$c"; then out="$out${out:+,}\"$c\""; fi
  done
  echo "$out"
}

log "removing the demo data of the cluster"
TRUNC="auth.users, auth.identities, auth.mfa_factors, auth.sessions, auth.refresh_tokens"
for t in $PUBLIC_TABLES; do TRUNC="$TRUNC, public.\"$t\""; done
qload "$LOCAL" -c "truncate $TRUNC cascade"
qload "$LOCAL" -c "delete from storage.objects where bucket_id = 'patient-documents'"

for t in $TABLES; do
  cols=$(common_cols "$t")
  if [ -z "$cols" ]; then log "  $t: not in Supabase cloud, skipped"; continue; fi
  q "$CLOUD" -c "\\copy (select $cols from $t) to stdout" \
    | qload "$LOCAL" -c "\\copy $t ($cols) from pstdin"
  log "  $t: $(q "$LOCAL" -c "select count(*) from $t") rows"
done

log "sequences"
q "$LOCAL" -c "do \$\$ declare r record; begin
  for r in select s.relname seq, t.relname tab, a.attname col
      from pg_class s join pg_depend d on d.objid = s.oid and d.deptype in ('a','i')
      join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = s.relnamespace
      where s.relkind = 'S' and n.nspname = 'public' loop
    execute format('select setval(%L, greatest(1, coalesce((select max(%I) from public.%I), 1)))',
      'public.' || r.seq, r.col, r.tab);
  end loop; end \$\$"

log "medical data key (Vault)"
KEY=$(q "$CLOUD" -c "select decrypted_secret from vault.decrypted_secrets where name = 'medical_data_key'")
if [ -n "$KEY" ]; then
  q "$LOCAL" -c "select vault.update_secret(id, '$KEY') from vault.secrets where name = 'medical_data_key'" >/dev/null
  log "  key copied (value not shown)"
else
  log "  no medical_data_key in Supabase cloud: kept the cluster's key"
fi
KEY=""

if [ -n "${CLOUD_SERVICE_KEY:-}" ] && [ -n "${CLOUD_API_URL:-}" ]; then
  log "patient documents (files)"
  n=0; failed=0
  q "$CLOUD" -F '|' -c "select name, coalesce(metadata->>'mimetype', 'application/octet-stream')
      from storage.objects where bucket_id = 'patient-documents'" > /tmp/objects.txt
  while IFS='|' read -r name mime; do
    [ -z "$name" ] && continue
    path=$(printf '%s' "$name" | sed 's/ /%20/g')
    # Private bucket: authenticated download. New "sb_secret_" keys go in the apikey header; some
    # gateways also want them as a bearer token: try both.
    url="$CLOUD_API_URL/storage/v1/object/authenticated/patient-documents/$path"
    code=$(curl -sS -o /tmp/file -w '%{http_code}' -H "apikey: $CLOUD_SERVICE_KEY" "$url" || echo 000)
    if [ "$code" != "200" ]; then
      code=$(curl -sS -o /tmp/file -w '%{http_code}' -H "apikey: $CLOUD_SERVICE_KEY" \
        -H "Authorization: Bearer $CLOUD_SERVICE_KEY" "$url" || echo 000)
    fi
    if [ "$code" != "200" ]; then
      failed=$((failed + 1)); log "  download failed ($code): $name -> $(head -c 200 /tmp/file)"; continue
    fi
    code=$(curl -sS -o /tmp/resp -w '%{http_code}' -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      -H "apikey: $SERVICE_ROLE_KEY" -H "x-upsert: true" -H "Content-Type: $mime" \
      --data-binary @/tmp/file "$STORAGE_URL/object/patient-documents/$path" || echo 000)
    if [ "$code" = "200" ]; then
      n=$((n + 1))
    else
      failed=$((failed + 1)); log "  upload failed ($code): $name -> $(head -c 200 /tmp/resp)"
    fi
  done < /tmp/objects.txt
  rm -f /tmp/file /tmp/resp /tmp/objects.txt
  log "  $n file(s) copied, $failed failed"
else
  log "no CLOUD_SERVICE_KEY: patient documents (files) not copied"
fi

# Marker: the db-init Job must not add the demo data and demo accounts back.
q "$LOCAL" -c "create table if not exists supabase_migrations.medlink_real_data (imported_at timestamptz default now());
  insert into supabase_migrations.medlink_real_data default values"
log "done: $(q "$LOCAL" -c 'select count(*) from auth.users') accounts in the cluster"
