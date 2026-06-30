// =============================================================================
// platform.bicep — shared runtime platform (Phase 1, reused by Phase 2)
//
// Stands up the compute platform the migration Job (and later PowerSync + the
// API) run on:
//   - Azure Container Registry (Basic) for the migration runner image.
//   - A user-assigned managed identity (UAMI) with AcrPull on the registry and
//     Key Vault Secrets User on the foundation's vault — so workloads pull
//     images and read connection secrets WITHOUT any password in YAML.
//   - A Container Apps environment, VNet-integrated into the snet-aca subnet
//     from main.bicep, so containers resolve the private Postgres FQDN.
//
// Depends on main.bicep outputs: keyVaultName + acaSubnetId + the LAW name.
// =============================================================================

@description('Azure region.')
param location string = 'eastus2'

@description('Short prefix (must match main.bicep).')
param namePrefix string = 'pantryparty'

@description('Environment moniker (must match main.bicep).')
param env string = 'prod'

@description('Key Vault name from main.bicep output keyVaultName.')
param keyVaultName string

@description('Resource ID of the snet-aca subnet (main.bicep output acaSubnetId).')
param acaSubnetId string

@description('Log Analytics workspace name from main.bicep output logAnalyticsWorkspaceName.')
param logAnalyticsWorkspaceName string

var suffix = '${namePrefix}-${env}'
// ACR names: alphanumeric only, 5-50 chars, globally unique.
var acrName = take('${replace(suffix, '-', '')}acr', 50)
var uamiName = '${suffix}-runtime-id'
var acaEnvName = '${suffix}-aca-env'

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: uamiName
  location: location
}

// AcrPull so workloads can pull the runner/PowerSync/api images.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPullRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Key Vault Secrets User so workloads can read the connection-string secrets.
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
resource kvSecretsUserRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, uami.id, kvSecretsUserRoleId)
  scope: kv
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource acaEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: acaEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      internal: true
      infrastructureSubnetId: acaSubnetId
    }
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output uamiResourceId string = uami.id
output uamiClientId string = uami.properties.clientId
output environmentId string = acaEnv.id
output environmentName string = acaEnv.name
