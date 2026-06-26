# Migration Job — deploy & run runbook (Phase 1, continued)

Builds the migration runner image, deploys it as a **Manual Container Apps Job** inside the
VNet, and runs it to load the schema (+ `powersync` publication + `powersync_repl` role) into
the **private** Flexible Server. No jumpbox required — the Job runs in-VNet.

> Prerequisite: `main.bicep` is already deployed (DB, Key Vault, VNet, Log Analytics) and the
> server has been restarted so `wal_level=logical` is active. Validate each Bicep with
> `az bicep build` / `az deployment group what-if` first. Untested by author.

## Variables
```
RG=rg-pantryparty-prod-eastus2
LOC=eastus2
PREFIX=pantryparty
ENVNAME=prod
KV=$(az deployment group show -g "$RG" -n main --query properties.outputs.keyVaultName.value -o tsv)
```

## 1. Deploy the platform (ACR + identity + Container Apps environment)
```
az deployment group create -g "$RG" -n platform -f infra/azure/platform.bicep \
  -p location=$LOC namePrefix=$PREFIX env=$ENVNAME keyVaultName=$KV
```

## 2. Build the runner image (cloud build — no local Docker needed)
Run from the repo root so the Dockerfile COPY paths resolve:
```
ACR=$(az deployment group show -g "$RG" -n platform --query properties.outputs.acrName.value -o tsv)
az acr build -r "$ACR" -t pantryparty-migrate:latest -f infra/azure/migrations/Dockerfile .
```

## 3. Deploy the Job
```
ACRSERVER=$(az deployment group show -g "$RG" -n platform --query properties.outputs.acrLoginServer.value -o tsv)
ENVID=$(az deployment group show -g "$RG" -n platform --query properties.outputs.environmentId.value -o tsv)
UAMI=$(az deployment group show -g "$RG" -n platform --query properties.outputs.uamiResourceId.value -o tsv)
az deployment group create -g "$RG" -n job-migrations -f infra/azure/job-migrations.bicep \
  -p location=$LOC namePrefix=$PREFIX env=$ENVNAME \
  -p environmentId="$ENVID" acrLoginServer="$ACRSERVER" uamiResourceId="$UAMI" \
  -p keyVaultName="$KV" imageTag=latest
```

## 4. Run it
```
JOB=$(az deployment group show -g "$RG" -n job-migrations --query properties.outputs.jobName.value -o tsv)
az containerapp job start -g "$RG" -n "$JOB"
```

## 5. Watch + verify
```
az containerapp job execution list -g "$RG" -n "$JOB" -o table
```
Console logs (the runner prints the `schema_migrations` ledger at the end) are in the
Container Apps execution logs / the Log Analytics `ContainerAppConsoleLogs_CL` table. Expect:
`wal_level=logical`, publication `powersync` with 7 tables, role `powersync_repl` present.

## Re-running & future migrations
- The Job is idempotent — safe to start again any time.
- To add a migration: drop `0007_*.sql` into `infra/azure/migrations/sql/`, repeat step 2
  (rebuild image) and step 4 (start the Job). Only the new file applies.

## If something fails
- A `CREATE EXTENSION` error means Azure gates that extension — add it to the server's
  `azure.extensions` parameter (`az postgres flexible-server parameter set`) and re-run.
- Auth/secret errors usually mean the UAMI's Key Vault Secrets User role hasn't propagated
  yet (give RBAC a minute) or the secret name differs from `PG-URI` / `POWERSYNC-REPL-PASSWORD`.
