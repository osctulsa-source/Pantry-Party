# Azure database foundation — deploy runbook (Phase 1)

Stands up the production Postgres for Pantry Party on Azure: a **private** PostgreSQL
Flexible Server (logical-replication source for PowerSync) plus a `powersync_storage`
database, Key Vault, Log Analytics + Application Insights, and a budget alert.

> The Bicep here has **not** been deployed by its author. Always run `what-if` first and
> adjust any apiVersion/property the validator flags. Region **East US 2** and the
> **private** networking choice are effectively permanent once the server is created.

## Assumptions (correct these if wrong — they were skipped earlier)
- The $1,000/mo credit is recurring monthly. If it is one-time/expiring, tell me and we
  front-load (reserved capacity / prepay) instead.
- You have (or will create) an Azure **subscription** and an Azure tenant to deploy into.
- No org naming convention was given, so resources use `pantryparty-prod-*`. Override via
  the `namePrefix` / `env` parameters.
- Auth stays on **Supabase** through Phases 1–2; Entra External ID is Phase 3.

## Prerequisites
- Azure CLI (`az`) logged in, with Bicep (`az bicep version`).
- Owner/Contributor + User Access Administrator on the target subscription (the latter for
  the Key Vault role assignment).
- A `psql` client (for the schema/replication step) — used **from inside the VNet** (see
  the note at the end; the server has no public endpoint).

## 1. Pick the subscription
```
az login
az account set --subscription "<your-subscription-id>"
```

## 2. Set variables and secrets (this shell session)
```
RG=rg-pantryparty-prod-eastus2
LOC=eastus2
export PG_ADMIN_PW='<choose-a-strong-password>'
export PS_REPL_PW='<choose-a-different-strong-password>'
OBJ=$(az ad signed-in-user show --query id -o tsv)
```

## 3. Create the resource group
```
az group create -n "$RG" -l "$LOC"
```

## 4. Validate (no changes made)
```
az deployment group what-if -g "$RG" -f infra/azure/main.bicep \
  -p location=$LOC keyVaultAdminObjectId=$OBJ \
  -p pgAdminPassword="$PG_ADMIN_PW" powersyncReplPassword="$PS_REPL_PW" \
  -p alertEmails="['you@company.com']"
```

## 5. Deploy
```
az deployment group create -g "$RG" -f infra/azure/main.bicep \
  -p location=$LOC keyVaultAdminObjectId=$OBJ \
  -p pgAdminPassword="$PG_ADMIN_PW" powersyncReplPassword="$PS_REPL_PW" \
  -p alertEmails="['you@company.com']"
```

## 6. Restart so `wal_level=logical` takes effect
```
PG=$(az postgres flexible-server list -g "$RG" --query "[0].name" -o tsv)
az postgres flexible-server restart -g "$RG" -n "$PG"
```

## 7. Load schema + replication role (in-VNet — see note)
With `psql` reachable inside the VNet, against the `pantryparty` database as admin:
1. Apply the repo's existing init-scripts in order
   (`infra/local-dev/docker/modules/database-postgres/init-scripts/00..06`). These create
   all 7 tables **and** the `powersync` publication.
2. Then run `infra/azure/replication-setup.sql` to create the `powersync_repl` role:
```
psql "$ADMIN_URI" -v powersync_repl_password="$PS_REPL_PW" -f infra/azure/replication-setup.sql
```
Verify: `SHOW wal_level;` → `logical`; `SELECT pubname FROM pg_publication;` → `powersync`.

## Note — reaching a private server
The server has **no public endpoint** (by design). To run step 7 before the Phase-2
Container Apps environment exists, use one of:
- a **temporary jumpbox VM** in `snet-containerapps` (delete it after), or
- **Azure Bastion** to a small VM in the VNet.

The repeatable answer is the **migration runner as a Container Apps Job** in the VNet
(next deliverable) — that becomes the supported way to apply schema + future migrations,
so step 7 is a one-time bootstrap.

## What this leaves ready
- Private Postgres, `wal_level=logical`, app + storage databases, generous WAL retention.
- DB connection strings in Key Vault (`PG-URI`, `PS-DATA-SOURCE-URI`, `PS-STORAGE-URI`).
- App Insights connection string (output) for the Phase-2 containers.
- VNet + a reserved `snet-containerapps` subnet for PowerSync + the api.
