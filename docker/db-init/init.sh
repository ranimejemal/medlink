#!/bin/sh
# MedLink database initialisation (Kubernetes Job "medlink-db-init").
# Safe to run again: every step checks what is already done.
#   1. Supabase base schema (roles, auth, storage, extensions), the same as Supabase cloud.
#   2. Passwords of the service roles (auth, storage, REST API), from the medlink-supabase Secret.
#   3. Waits until auth and storage have created their own tables.
#   4. MedLink migrations (supabase/migrations), each applied once and recorded.
#   5. Demo data (seed.sql) and the 4 demo accounts.
set -eu

export PGHOST="${PGHOST:-medlink-db-rw}" PGPORT="${PGPORT:-5432}" PGDATABASE=postgres
SU="postgres://postgres:${SUPERUSER_PASSWORD}@${PGHOST}:${PGPORT}/postgres?sslmode=require"
ADMIN="postgres://supabase_admin:${SUPABASE_ADMIN_PASSWORD}@${PGHOST}:${PGPORT}/postgres?sslmode=require"
INIT=/docker-entrypoint-initdb.d
# MedLink files: in the medlink-db-init image (defaults), or mounted from ConfigMaps by
# k8s/database/init-job.yaml (the Job then runs the plain supabase/postgres image).
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/medlink/migrations}"
SEED_FILE="${SEED_FILE:-/medlink/seed.sql}"
run() { psql -v ON_ERROR_STOP=1 --no-psqlrc -q "$@"; }
log() { echo "[db-init] $*"; }

log "waiting for the primary ($PGHOST)"
until run "$SU" -c "select 1" >/dev/null 2>&1; do sleep 3; done

# ---------- 1. Supabase base schema ----------
if [ "$(run "$SU" -tAc "select count(*) from pg_roles where rolname = 'supabase_auth_admin'")" = "0" ]; then
  log "creating the Supabase base schema"
  run "$SU" -c "do \$\$ begin
      if not exists (select from pg_roles where rolname = 'supabase_admin') then
        create role supabase_admin login superuser createdb createrole replication bypassrls;
      end if; end \$\$;"
  run "$SU" -c "alter role supabase_admin password '${SUPABASE_ADMIN_PASSWORD}'"
  for f in "$INIT"/init-scripts/*.sql; do log "  $(basename "$f")"; run "$SU" -f "$f"; done
  for f in "$INIT"/migrations/*.sql; do
    case "$(basename "$f")" in
      # Kept as superuser: CloudNativePG manages the cluster with the "postgres" role.
      10000000000000_demote-postgres.sql) continue ;;
    esac
    log "  $(basename "$f")"
    run "$ADMIN" -f "$f"
  done
  # Like Supabase cloud today: new tables are NOT readable by anon/authenticated by default;
  # each MedLink migration grants exactly what each role needs (tested by supabase/tests/rbac.sql).
  for r in postgres supabase_admin; do
    run "$ADMIN" -c "alter default privileges for role $r in schema public
      revoke all on tables from anon, authenticated;
      alter default privileges for role $r in schema public
      revoke all on sequences from anon, authenticated"
  done
else
  log "Supabase base schema already present"
fi

# ---------- 2. Service role passwords (re-applied each run) ----------
run "$SU" -c "alter role supabase_admin password '${SUPABASE_ADMIN_PASSWORD}'"
run "$ADMIN" -c "alter role supabase_auth_admin password '${AUTH_DB_PASSWORD}'"
run "$ADMIN" -c "alter role supabase_storage_admin password '${STORAGE_DB_PASSWORD}'"
run "$ADMIN" -c "alter role authenticator password '${AUTHENTICATOR_PASSWORD}'"

# ---------- 3. Wait for auth (GoTrue) and storage to migrate their own schemas ----------
log "waiting for the auth and storage services to create their tables"
until [ "$(run "$ADMIN" -tAc "select count(*) from information_schema.columns
    where (table_schema, table_name, column_name) in
      (('auth','users','is_anonymous'), ('storage','buckets','allowed_mime_types'))")" = "2" ]; do
  sleep 5
done

# ---------- 4. MedLink migrations ----------
run "$ADMIN" -c "create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations
    (version text primary key, name text, statements text[])"
for f in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$f" .sql); version=${name%%_*}
  if [ "$(run "$ADMIN" -tAc "select count(*) from supabase_migrations.schema_migrations where version = '$version'")" = "0" ]; then
    log "migration $name"
    # Same role as "supabase db push" (postgres): objects get the same owner as on Supabase cloud.
    { echo "set role postgres;"; cat "$f"; echo ";"; echo "reset role;";
      echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${name#*_}');"; } \
      | run "$ADMIN" -1
  fi
done

# ---------- 5. Demo data ----------
# Not after an import of the real data (scripts/k8s-import-cloud.ps1 sets this marker).
if [ "$(run "$ADMIN" -tAc "select count(*) from information_schema.tables
    where table_schema = 'supabase_migrations' and table_name = 'medlink_real_data'")" = "1" ]; then
  log "real data imported from Supabase cloud: no demo data, no demo accounts"
  log "done"
  exit 0
fi
log "demo data (seed.sql)"
{ echo "set role postgres;"; cat "$SEED_FILE"; } | run "$ADMIN" -1

if [ -n "${DEMO_PASSWORD:-}" ]; then
  log "waiting for the auth API"
  until wget -qO- "$AUTH_URL/health" >/dev/null 2>&1; do sleep 3; done
  for email in patient.demo@medlink.test doctor.demo@medlink.test admin.demo@medlink.test staff.demo@medlink.test; do
    exists=$(run "$ADMIN" -tAc "select count(*) from auth.users where email = '$email'")
    if [ "$exists" = "0" ]; then
      log "demo account $email"
      wget -qO- --header "Authorization: Bearer $SERVICE_ROLE_KEY" --header "apikey: $SERVICE_ROLE_KEY" \
        --header "Content-Type: application/json" \
        --post-data "{\"email\":\"$email\",\"password\":\"$DEMO_PASSWORD\",\"email_confirm\":true}" \
        "$AUTH_URL/admin/users" >/dev/null
    fi
  done
fi

log "done"
