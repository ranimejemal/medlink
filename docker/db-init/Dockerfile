# Image "medlink-db-init": sets up the MedLink database (Kubernetes Job, k8s/database/init-job.yaml).
# Based on the official Supabase Postgres image, which already contains the Supabase schema
# scripts and psql. Build from the repository root:
#   docker build -f docker/db-init/Dockerfile -t medlink-db-init .
FROM supabase/postgres:15.8.1.085
COPY supabase/migrations/ /medlink/migrations/
COPY supabase/seed.sql /medlink/seed.sql
COPY --chmod=0755 docker/db-init/init.sh /medlink/init.sh
USER postgres
ENTRYPOINT ["/medlink/init.sh"]
