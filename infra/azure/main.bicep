// =============================================================================
// main.bicep — Pantry Party database foundation (Phase 1)
//
// Provisions the private data tier that PowerSync + the API run against:
//   - VNet with a delegated subnet for the private PostgreSQL Flexible Server
//     and a separate subnet the Container Apps environment (platform.bicep)
//     joins, so the migration Job + PowerSync can reach the DB over the VNet.
//   - PostgreSQL Flexible Server (PG 16), PRIVATE access only (no public IP),
//     with wal_level=logical for PowerSync logical replication.
//   - Two databases: the business DB (publication source) + PowerSync storage.
//   - Key Vault (RBAC) holding the admin password, repl password, and the two
//     connection URIs PowerSync consumes (PS_DATA_SOURCE_URI / _STORAGE_SOURCE_URI).
//   - Log Analytics + Application Insights for the whole stack.
//   - A resource-group-scoped budget with email alerts.
//
// wal_level is a STATIC server parameter: this template sets it, but it only
// takes effect after a server restart (see DEPLOY.md step 6).
// =============================================================================

@description('Azure region for all resources.')
param location string = 'eastus2'

@description('Short prefix for resource names (lowercase alphanumeric).')
@minLength(3)
@maxLength(12)
param namePrefix string = 'pantryparty'

@description('Environment moniker, e.g. prod / staging.')
param env string = 'prod'

@description('Object ID (principal) granted Key Vault Secrets Officer — the deploying user, so they can read the generated secrets.')
param keyVaultAdminObjectId string

@description('PostgreSQL admin login password. Use an alphanumeric (hex) value so it survives URL-embedding in the connection strings.')
@secure()
param pgAdminPassword string

@description('Password for the powersync_repl replication role (set by the migration Job). Alphanumeric/hex recommended.')
@secure()
param powersyncReplPassword string

@description('Email addresses notified when the budget thresholds are crossed.')
param alertEmails array = []

@description('PostgreSQL admin username (Azure reserves several names; pgadmin is allowed).')
param pgAdminUser string = 'pgadmin'

@description('Flexible Server compute SKU.')
param pgSkuName string = 'Standard_B2s'

@description('Flexible Server compute tier.')
@allowed([ 'Burstable', 'GeneralPurpose', 'MemoryOptimized' ])
param pgTier string = 'Burstable'

@description('Storage size in GB.')
param pgStorageGb int = 32

@description('Monthly budget amount (currency of the subscription) for cost alerts.')
param monthlyBudget int = 200

@description('Budget start date (first of the current month). Leave at default — utcNow only resolves in a param default.')
param budgetStartDate string = '${utcNow('yyyy-MM')}-01'

// ---- Derived names ----------------------------------------------------------
var suffix = '${namePrefix}-${env}'
var vnetName = '${suffix}-vnet'
var pgSubnetName = 'snet-postgres'
var acaSubnetName = 'snet-aca'
var pgServerName = '${suffix}-pg'
var businessDbName = namePrefix            // e.g. "pantryparty"
var storageDbName = 'powersync_storage'
var kvName = take('${replace(suffix, '-', '')}kv', 24)
var lawName = '${suffix}-law'
var appiName = '${suffix}-appi'
var privateDnsZoneName = '${pgServerName}.private.postgres.database.azure.com'

// ---- Networking -------------------------------------------------------------
resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: { addressPrefixes: [ '10.30.0.0/16' ] }
    subnets: [
      {
        // Delegated subnet for the Flexible Server (VNet-injected private access).
        name: pgSubnetName
        properties: {
          addressPrefix: '10.30.1.0/24'
          delegations: [
            {
              name: 'pgdelegation'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
      {
        // Container Apps environment infrastructure subnet (joined in platform.bicep).
        // MUST be delegated to Microsoft.App/environments, or the managed
        // environment create fails with ManagedEnvironmentSubnetDelegationError.
        name: acaSubnetName
        properties: {
          addressPrefix: '10.30.2.0/23'
          delegations: [
            {
              name: 'acadelegation'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
    ]
  }
}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${pgServerName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

// ---- PostgreSQL Flexible Server (private) -----------------------------------
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: pgServerName
  location: location
  sku: { name: pgSkuName, tier: pgTier }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: { storageSizeGB: pgStorageGb }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: '${vnet.id}/subnets/${pgSubnetName}'
      privateDnsZoneArmResourceId: privateDnsZone.id
    }
  }
  dependsOn: [ dnsLink ]
}

// wal_level=logical — required for PowerSync logical replication. STATIC param:
// needs a server restart to apply (DEPLOY.md step 6).
resource walLevel 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'wal_level'
  properties: { value: 'logical', source: 'user-override' }
}

// PowerSync also benefits from extra replication slots / wal senders.
resource maxSlots 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'max_replication_slots'
  properties: { value: '10', source: 'user-override' }
  dependsOn: [ walLevel ]
}

resource maxSenders 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'max_wal_senders'
  properties: { value: '10', source: 'user-override' }
  dependsOn: [ maxSlots ]
}

resource businessDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: businessDbName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource storageDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: storageDbName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
  dependsOn: [ businessDb ]
}

// ---- Observability ----------------------------------------------------------
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: lawName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: appiName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
  }
}

// ---- Key Vault (RBAC) + secrets ---------------------------------------------
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// Grant the deploying user Key Vault Secrets Officer so they can read/manage secrets.
var kvSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
resource kvAdminRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, keyVaultAdminObjectId, kvSecretsOfficerRoleId)
  scope: kv
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsOfficerRoleId)
    principalId: keyVaultAdminObjectId
    principalType: 'User'
  }
}

// The server's real FQDN (e.g. <name>.postgres.database.azure.com). Inside the
// VNet this CNAMEs into the linked private DNS zone and resolves to the private
// IP. Do NOT construct the '.private.<zone>' apex name — that has no A record.
var pgFqdn = pg.properties.fullyQualifiedDomainName

resource secretAdminPw 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'pg-admin-password'
  properties: { value: pgAdminPassword }
}

resource secretReplPw 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'ps-repl-password'
  properties: { value: powersyncReplPassword }
}

// Admin connection URI to the BUSINESS db — consumed by the migration Job.
resource secretAdminUri 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'pg-admin-uri'
  properties: {
    value: 'postgresql://${pgAdminUser}:${pgAdminPassword}@${pgFqdn}:5432/${businessDbName}?sslmode=require'
  }
}

// PowerSync replication source URI (business db, powersync_repl role).
resource secretDataUri 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'ps-data-source-uri'
  properties: {
    value: 'postgresql://powersync_repl:${powersyncReplPassword}@${pgFqdn}:5432/${businessDbName}?sslmode=require'
  }
}

// PowerSync storage URI (storage db, admin role — PowerSync manages its own schema there).
resource secretStorageUri 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'ps-storage-source-uri'
  properties: {
    value: 'postgresql://${pgAdminUser}:${pgAdminPassword}@${pgFqdn}:5432/${storageDbName}?sslmode=require'
  }
}

// ---- Budget -----------------------------------------------------------------
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = if (!empty(alertEmails)) {
  name: '${suffix}-budget'
  properties: {
    category: 'Cost'
    amount: monthlyBudget
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        contactEmails: alertEmails
        thresholdType: 'Actual'
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        contactEmails: alertEmails
        thresholdType: 'Forecasted'
      }
    }
  }
}

// ---- Outputs ----------------------------------------------------------------
output keyVaultName string = kv.name
output postgresServerName string = pg.name
output postgresPrivateFqdn string = pgFqdn
output businessDatabaseName string = businessDbName
output storageDatabaseName string = storageDbName
output vnetName string = vnet.name
output acaSubnetId string = '${vnet.id}/subnets/${acaSubnetName}'
output logAnalyticsWorkspaceName string = law.name
output appInsightsConnectionString string = appi.properties.ConnectionString
