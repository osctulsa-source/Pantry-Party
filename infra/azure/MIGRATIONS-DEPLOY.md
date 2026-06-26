# Deploying the platform + running the migration Job

Phase 1, steps 7–11. Assumes [DEPLOY.md](./DEPLOY.md) finished and `wal_level`
reads `logical`. This deploys the shared compute platform (`platform.bicep`),
builds the runner image, deploys the Container Apps Job (`job-migrations.bicep`),
and runs it to load the schema.

Same shell/variables as DEPLOY.md (`RG`, `LOC`). Run from the **repo root**.

## Step 7 — Platform (ACR + identity + Container Apps env)

```bash
KV=$(az deployment group show -g "$RG" -n main --query properties.outputs.keyVaultName.value -o tsv)
ACASUBNET=$(az deployment group show -g "$RG" -n main --query properties.outputs.acaSubnetId.value -o tsv)
LAW=$(az deployment group show -g "$RG" -n main --query properties.outputs.logAnalyticsWorkspaceName.value -o tsv)

az deployment group create -g "$RG" -n platform -f infra/azure/platform.bicep \
  -p location=$LOC keyVaultName=$KV acaSubnetId="$ACASUBNET" logAnalyticsWorkspaceName=$LAW
```

~3–8 min (the Container Apps environment). It joins the `snet-aca` subnet so
containers resolve the private Postgres FQDN, and grants the managed identity
**AcrPull** + **Key Vault Secrets User**. Phase 2 reuses this same environment.

## Step 8 — Build the runner image (cloud build, no local Docker)

```bash
ACR=$(az deployment group show -g "$RG" -n platform --query properties.outputs.acrName.value -o tsv)
az acr build -r "$ACR" -t pantryparty-migrate:latest -f infra/azure/migrations/Dockerfile .
```

Run from the **repo root** — the trailing `.` is the build context, and the
Dockerfile copies the baseline init-scripts from
`infra/local-dev/docker/modules/database-postgres/init-scripts/` plus the runner.

## Step 9 — Deploy the Job

```bash
ACRSERVER=$(az deployment group show -g "$RG" -n platform --query properties.outputs.acrLoginServer.value -o tsv)
ENVID=$(az deployment group show -g "$RG" -n platform --query properties.outputs.environmentId.value -o tsv)
UAMI=$(az deployment group show -g "$RG" -n platform --query properties.outputs.uamiResourceId.value -o tsv)

az deployment group create -g "$RG" -n job-migrations -f infra/azure/job-migrations.bicep \
  -p location=$LOC environmentId="$ENVID" acrLoginServer="$ACRSERVER" \
  -p uamiResourceId="$UAMI" keyVaultName="$KV" imageTag=latest
```

The Job reads `ADMIN_URI` (from the `pg-admin-uri` secret) and `REPL_PASSWORD`
(from `ps-repl-password`) straight out of Key Vault via the managed identity — no
passwords in the deploy command.

## Step 10 — Run the Job

```bash
JOB=$(az deployment group show -g "$RG" -n job-migrations --query properties.outputs.jobName.value -o tsv)
az containerapp job start -g "$RG" -n "$JOB"
```

## Step 11 — Watch and verify

```bash
az containerapp job execution list -g "$RG" -n "$JOB" -o table
```

Wait for **Succeeded**, then read the console logs. Easiest in the Portal:
Container App Job → Execution history → click the run → Console. You should see
`==> apply 00-households.sql …` through `==> migration runner complete`, then the
`schema_migrations` ledger listing `00`–`06` and the 7 publication tables.

CLI alternative (ingestion lags 1–3 min):

```bash
WSID=$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query customerId -o tsv)
az monitor log-analytics query --workspace "$WSID" \
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerJobName_s == '$JOB' | project TimeGenerated, Log_s | order by TimeGenerated asc | take 200" \
  -o table
```

### What success means

Schema loaded into the `pantryparty` database, the `powersync` publication covers
exactly the 7 tables, and the `powersync_repl` role exists with REPLICATION +
SELECT. The private DB is fully PowerSync-ready, and **Phase 2** (deploying
PowerSync + the API onto the same Container Apps environment, reading
`ps-data-source-uri` / `ps-storage-source-uri` from Key Vault) is unblocked.

## If something trips

- **Job can't pull the image or read a secret on the first run** → the
  AcrPull / Key Vault RBAC for the identity is still propagating. Wait ~2 min and
  `az containerapp job start -g "$RG" -n "$JOB"` again — the runner is idempotent,
  so a re-run is safe.
- **Baseline fails on a `CREATE EXTENSION`** → none exist today, but if one is
  added later, add the extension to the server's `azure.extensions` parameter
  and re-run.
- **Runner connects but a numbered file fails** → fix the SQL, rebuild the image
  (Step 8), and re-run the Job; the ledger skips already-applied files.
