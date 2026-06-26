// ============================================================================
// Pantry Party — Azure container platform (shared by the migration Job + Phase 2)
// Scope: resource group. Deploy AFTER main.bicep.
//
// Provisions:
//   - Azure Container Registry (Basic)
//   - User-assigned managed identity (UAMI) with AcrPull + Key Vault Secrets User
//   - Container Apps managed environment, VNet-injected into snet-containerapps,
//     logs -> the existing Log Analytics workspace
//
//  References existing resources from main.bicep by name (vnet, Log Analytics, Key Vault).
//  Untested by author — validate with `az bicep build` / `what-if`; confirm apiVersions.
// ============================================================================

targetScope = 'resourceGroup'

@description('Azure region (same as main.bicep).')
param location string = 'eastus2'

@description('Resource name prefix (same as main.bicep).')
param namePrefix string = 'pantryparty'

@description('Environment segment (same as main.bicep).')
param env string = 'prod'

@description('Existing VNet name (from main.bicep).')
param vnetName string = '${namePrefix}-${env}-vnet'

@description('Existing Container Apps subnet name (from main.bicep).')
param containerAppsSubnetName string = 'snet-containerapps'

@description('Existing Log Analytics workspace name (from main.bicep).')
param logAnalyticsName string = '${namePrefix}-${env}-law'

@description('Existing Key Vault name (pass main.bicep output keyVaultName).')
param keyVaultName string

@description('Common tags.')
param tags object = {
  app: 'pantry-party'
  env: env
  managedBy: 'bicep'
}

var acrName = take(toLower('${namePrefix}${env}acr${uniqueString(resourceGroup().id)}'), 50)
var uamiName = '${namePrefix}-${env}-uami'
var caeName = '${namePrefix}-${env}-cae'

// Built-in role IDs
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'        // AcrPull
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'  // Key Vault Secrets User

// ---------- Existing references ----------
resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' existing = { name: vnetName }
resource caSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-01-01' existing = {
  parent: vnet
  name: containerAppsSubnetName
}
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = { name: logAnalyticsName }
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: keyVaultName }

// ---------- Container Registry ----------
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

// ---------- Managed identity (for ACR pull + Key Vault secret reads) ----------
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: uamiName
  location: location
  tags: tags
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, uami.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, uami.id, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------- Container Apps environment (VNet-injected) ----------
resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: caeName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: caSubnet.id
      internal: false   // external ingress available for Phase-2 api/PowerSync; still VNet-injected, so it reaches the private DB
    }
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output environmentId string = cae.id
output uamiResourceId string = uami.id
output uamiClientId string = uami.properties.clientId
