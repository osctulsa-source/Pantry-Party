# Deploying the database foundation (`main.bicep`)

Phase 1, steps 1–6: the private data tier (VNet, private PostgreSQL Flexible
Server + two databases, Key Vault, Log Analytics / App Insights, budget). The
server has **no public IP** — the schema is loaded later by the migration Job
running inside the VNet (see [MIGRATIONS-DEPLOY.md](./MIGRATIONS-DEPLOY.md)),
not from your laptop.

Run everything from the **repo root**. These are Bash snippets (Git Bash / WSL /
Cloud Shell); on PowerShell adapt the `$(...)` and `export` syntax.

## Pre-flight

- Azure CLI logged in, Container Apps extension: `az extension add --name containerapp`
- **Owner**, or **Contributor + User Access Administrator** — the templates create
  role assignments (Key Vault, ACR), which plain Contributor cannot do.
- A subscription where your credit applies.

## Step 1 — Log in, pick subscription, register providers

```bash
az login
SUB=your-subscription-id-or-name
az account set --subscription "$SUB"
for ns in Microsoft.DBforPostgreSQL Microsoft.App Microsoft.ContainerRegistry \
          Microsoft.OperationalInsights Microsoft.Insights Microsoft.KeyVault \
          Microsoft.Network Microsoft.ManagedIdentity Microsoft.Consumption; do
  az provider register --namespace "$ns"
done
```

## Step 2 — Variables + generated passwords

```bash
RG=rg-pantryparty-prod-westus3
LOC=westus3
ALERT_EMAIL=you@company.com
# Alphanumeric (URL-safe) AND mixed-case+digits so it satisfies Azure's password
# complexity rule (3 of 4 char classes). Do NOT use `openssl rand -hex` here —
# hex is lowercase+digits only (2 classes) and Azure rejects it.
export PG_ADMIN_PW=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24)
export PS_REPL_PW=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24)
OBJ=$(az ad signed-in-user show --query id -o tsv)
```

Keep this shell open through the whole flow. Alphanumeric passwords are
deliberate — they survive URL-embedding in the `postgresql://user:pass@host`
connection strings stored in Key Vault. You don't need to memorize them; they
live in Key Vault afterward.

> **Region note:** `eastus`/`eastus2` are commonly **offer-restricted** on
> trial/sponsored subscriptions (`LocationIsOfferRestricted`), and `what-if`
> does **not** catch this — it only surfaces on the real deploy. `westus3` works
> for this subscription. If a region is restricted, probe for an allowed one
> (see the region-probe loop) before re-running.

## Step 3 — Resource group

```bash
az group create -n "$RG" -l "$LOC"
```

## Step 4 — Validate (no changes made)

```bash
az deployment group what-if -g "$RG" -n main -f infra/azure/main.bicep \
  -p location=$LOC keyVaultAdminObjectId=$OBJ \
  -p pgAdminPassword="$PG_ADMIN_PW" powersyncReplPassword="$PS_REPL_PW" \
  -p alertEmails="['$ALERT_EMAIL']"
```

Safety net. If it errors on an apiVersion or property, **stop** and fix the
template before deploying. A clean `+ create` list means continue.

## Step 5 — Deploy

```bash
az deployment group create -g "$RG" -n main -f infra/azure/main.bicep \
  -p location=$LOC keyVaultAdminObjectId=$OBJ \
  -p pgAdminPassword="$PG_ADMIN_PW" powersyncReplPassword="$PS_REPL_PW" \
  -p alertEmails="['$ALERT_EMAIL']"
```

~5–10 min (the Flexible Server is the slow part). Creates the VNet + two subnets,
private DNS zone, the private server + `pantryparty` and `powersync_storage`
databases, Key Vault with all connection secrets, Log Analytics + App Insights,
and the budget.

**Optional overrides** (defaults shown): `pgSkuName=Standard_B2s pgTier=Burstable
pgStorageGb=32 monthlyBudget=200`. Bump the SKU for production load.

## Step 6 — Restart for `wal_level`, then verify

`wal_level=logical` is a **static** parameter — it only takes effect after a
restart.

```bash
PG=$(az deployment group show -g "$RG" -n main --query properties.outputs.postgresServerName.value -o tsv)
az postgres flexible-server restart -g "$RG" -n "$PG"
az postgres flexible-server parameter show -g "$RG" -s "$PG" -n wal_level \
  --query "{name:name,value:value}" -o table
```

Expect **value = logical**. This is a control-plane read — it needs no DB
connectivity. Once it reads `logical`, the foundation is ready and you move on to
[MIGRATIONS-DEPLOY.md](./MIGRATIONS-DEPLOY.md).

## What got created (outputs)

`az deployment group show -g "$RG" -n main --query properties.outputs` gives you
`keyVaultName`, `postgresPrivateFqdn`, `businessDatabaseName`,
`storageDatabaseName`, `acaSubnetId`, `logAnalyticsWorkspaceName`, and the
App Insights connection string — all consumed by the next phase.

### Key Vault secrets written

| Secret | Used by |
|---|---|
| `pg-admin-password` | break-glass admin login |
| `ps-repl-password` | the `powersync_repl` role (set by the Job) |
| `pg-admin-uri` | the migration Job (`ADMIN_URI`) |
| `ps-data-source-uri` | Phase 2 PowerSync `PS_DATA_SOURCE_URI` |
| `ps-storage-source-uri` | Phase 2 PowerSync `PS_STORAGE_SOURCE_URI` |

## If something trips

- **`authorization failed` on Step 5** → you need Owner / User Access
  Administrator (role assignments).
- **what-if / validation error** → fix the named property in `main.bicep` and
  re-run Step 4.
