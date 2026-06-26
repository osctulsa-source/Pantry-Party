# Migration runner image for the Pantry Party Azure DB.
# Build from the REPO ROOT so the COPY paths resolve:
#   az acr build -r <acr> -t pantryparty-migrate:latest -f infra/azure/migrations/Dockerfile .
#
# Uses the postgres:16-alpine base purely for a matching psql client (+ busybox
# sha256sum/sort). The image runs the runner once and exits (Container Apps Job).
FROM postgres:16-alpine
WORKDIR /app

# Baseline = the repo's Postgres init-scripts (single source of truth, no transcription).
COPY infra/local-dev/docker/modules/database-postgres/init-scripts/ ./baseline/

# Forward migrations (0007+) applied after the baseline, in lexical order.
COPY infra/azure/migrations/sql/ ./migrations/

# Replication-role bootstrap (run at the end if PS_REPL_PASSWORD is provided).
COPY infra/azure/replication-setup.sql ./replication-setup.sql

COPY infra/azure/migrations/run-migrations.sh ./run-migrations.sh
RUN chmod +x ./run-migrations.sh

ENTRYPOINT ["/app/run-migrations.sh"]
