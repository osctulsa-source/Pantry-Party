# =============================================================================
# Migration runner image — applies the Pantry Party baseline schema to the
# private Azure PostgreSQL business database.
#
# BUILD CONTEXT MUST BE THE REPO ROOT so the COPY of the init-scripts resolves:
#   az acr build -r <acr> -t pantryparty-migrate:latest \
#     -f infra/azure/migrations/Dockerfile .
#                                            ^ repo root
#
# The "baseline" is the SAME 00..06 init-scripts the local-dev Docker Postgres
# loads on a fresh volume — they describe the CURRENT schema, so a fresh Azure
# DB needs exactly these (the numbered ../migrations/ files only evolve EXISTING
# local volumes and are not applied here).
# =============================================================================
FROM postgres:16-alpine

# psql ships with the postgres image; no extra packages needed.
WORKDIR /migrations

# Baseline schema (00-households .. 06-powersync-publication).
COPY infra/local-dev/docker/modules/database-postgres/init-scripts/*.sql /migrations/sql/

# Idempotent runner.
COPY infra/azure/migrations/run.sh /migrations/run.sh
RUN chmod +x /migrations/run.sh

ENTRYPOINT ["/migrations/run.sh"]
