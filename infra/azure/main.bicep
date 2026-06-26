// ============================================================================
// Pantry Party — production database foundation on Azure
// Scope: resource group.  Default region: East US 2.
//
// Provisions:
//   - VNet + subnet delegated to PostgreSQL Flexible Server + private DNS zone
//   - Azure Database for PostgreSQL Flexible Server (PRIVATE access)
//       * app database  (logical-replication source for PowerSync)
//       * powersync_storage database (PowerSync sync-bucket storage)
//       * wal_level = logical, generous max_slot_wal_keep_size
//   - Azure Key Vault (holds the DB connection secrets)
//   - Log Analytics workspace + Application Insights (for the Phase-2 containers)
//   - Monthly budget alert
//
//  IMMUTABLE DECISION: a Flexible Server's networking mode (private vs public)
//  CANNOT be changed after creation. This template uses PRIVATE access by design.
//
//  wal_level is a STATIC parameter -> the server must be RESTARTED after deploy
//  for it to take effect (see DEPLOY.md).
//
//  This template has NOT been deployed/validated by its author. Before applying:
//      az bicep build -f main.bicep
//      az deployment group what-if -g <rg> -f main.bicep -p @main.parameters.json
//  and adjust any apiVersion / property the validator flags.
// ============================================================================

targetScope = 'resourceGroup'

@description('Azure region. Effectively locked once the Flexible Server is created.')
param location string = 'eastus2'

@description('Short prefix used in resource names.')
param namePrefix string = 'pantryparty'

@description('Environment segment/tag.')
param env string = 'prod'

@description('PostgreSQL administrator login name.')
param pgAdminUser string = 'pgadmin'

@description('PostgreSQL administrator password.')
@secure()
param pgAdminPassword string

@description('Password for the dedicated PowerSync replication role (the role itself is created post-deploy via replication-setup.sql).')
@secure()
param powersyncReplPassword string

@description('Major PostgreSQL version. Azure latest GA; local dev runs 18 but the schema is version-agnostic.')
param pgVersion string = '16'

@description('Object ID of the principal (your user or the deploy service principal) to grant Key Vault Secrets access.')
param keyVaultAdminObjectId string = ''

@description('Monthly cost budget (USD) for alerting.')
param budgetAmount int = 800

@description('First day of the budget period (must be the 1st of a month).')
param budgetStartDate string = '2026-06-01'

@description('Emails for budget alerts. Leave empty to skip the budget resource.')
param alertEmails array = []

@description('Common resource tags.')
param tags object = {
  app: 'pantry-party'
  env: env
  managedBy: 'bicep'
}

// ---------- Naming ----------
var pgServerName = toLower('${namePrefix}-${env}-pg')
var vnetName = '${namePrefix}-${env}-vnet'
var kvName = take(toLower('${namePrefix}${env}kv${uniqueString(resourceGroup().id)}'), 24)
var lawName = '${namePrefix}-${env}-law'
var appiName = '${namePrefix}-${env}-appi'
var privateDnsZoneName = '${namePrefix}${env}.private.postgres.database.azure.com'
var appDbName = 'pantryparty'
var storageDbName = 'powersync_storage'

// Key Vault Secrets Officer built-in role.
var kvSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

// ---------- Networking (private access for the DB) ----------
resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.40.0.0/16'] }
    subnets: [
      {
        name: 'snet-postgres'
        properties: {
          addressPrefix: '10.40.1.0/24'
          delegations: [
            {
              name: 'pgflex'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
      {
        // Container Apps environment subnet (the migration Job + Phase-2 PowerSync/api).
        // Workload-profile environments require this delegation and a >= /23 subnet.
        name: 'snet-containerapps'
        properties: {
          addressPrefix: '10.40.4.0/23'
          delegations: [
            {
              name: 'aca'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
    ]
  }
}

resource pgPrivateDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
  tags: tags
}

resource pgPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: pgPrivateDns
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

// ---------- PostgreSQL Flexible Server (PRIVATE) ----------
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: pgServerName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B2s'   // Burstable; logical replication is supported on this tier.
    tier: 'Burstable'
  }
  properties: {
    version: pgVersion
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: { storageSizeGB: 64 }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }   // HA is not offered on Burstable.
    network: {
      delegatedSubnetResourceId: vnet.properties.subnets[0].id
      privateDnsZoneArmResourceId: pgPrivateDns.id
      publicNetworkAccess: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
  dependsOn: [ pgPrivateDnsLink ]
}

// wal_level = logical (PowerSync requirement). STATIC -> restart after deploy.
resource pgWalLevel 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'wal_level'
  properties: {
    value: 'logical'
    source: 'user-override'
  }
}

// Keep enough WAL that the initial PowerSync snapshot cannot invalidate the slot.
// Units = MB. Use '-1' to never invalidate (unbounded WAL — watch disk instead).
resource pgSlotKeep 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'max_slot_wal_keep_size'
  properties: {
    value: '10240'
    source: 'user-override'
  }
  dependsOn: [ pgWalLevel ]
}

resource appDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: appDbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [ pgSlotKeep ]
}

resource storageDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: storageDbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [ appDb ]
}

// ---------- Observability ----------
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: lawName
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: appiName
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
  }
}

// ---------- Key Vault + DB secrets ----------
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    publicNetworkAccess: 'Enabled'   // tighten to a private endpoint in a later pass
  }
}

resource secretPgUri 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'PG-URI'
  properties: {
    value: 'postgresql://${pgAdminUser}:${pgAdminPassword}@${pg.properties.fullyQualifiedDomainName}:5432/${appDbName}?sslmode=require'
  }
}

resource secretPsDataSource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'PS-DATA-SOURCE-URI'
  properties: {
    value: 'postgresql://powersync_repl:${powersyncReplPassword}@${pg.properties.fullyQualifiedDomainName}:5432/${appDbName}?sslmode=require'
  }
}

resource secretPsStorage 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'PS-STORAGE-URI'
  properties: {
    value: 'postgresql://${pgAdminUser}:${pgAdminPassword}@${pg.properties.fullyQualifiedDomainName}:5432/${storageDbName}?sslmode=require'
  }
}

// Repl-role password, so the migration Job can create the powersync_repl role in-VNet.
resource secretReplPw 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'POWERSYNC-REPL-PASSWORD'
  properties: {
    value: powersyncReplPassword
  }
}

resource kvRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(keyVaultAdminObjectId)) {
  scope: kv
  name: guid(kv.id, keyVaultAdminObjectId, kvSecretsOfficerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsOfficerRoleId)
    principalId: keyVaultAdminObjectId
  }
}

// ---------- Budget ----------
resource budget 'Microsoft.Consumption/budgets@2023-05-01' = if (!empty(alertEmails)) {
  name: '${namePrefix}-${env}-budget'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
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

// ---------- Outputs ----------
output pgFqdn string = pg.properties.fullyQualifiedDomainName
output appDatabase string = appDbName
output storageDatabase string = storageDbName
output keyVaultName string = kv.name
output appInsightsConnectionString string = appi.properties.ConnectionString
output vnetId string = vnet.id
output containerAppsSubnetId string = vnet.properties.subnets[1].id
