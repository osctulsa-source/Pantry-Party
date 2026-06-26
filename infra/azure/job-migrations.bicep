// ============================================================================
// Pantry Party — DB migration Container Apps Job (Manual trigger)
// Scope: resource group. Deploy AFTER platform.bicep and after the image is built.
//
// Runs the migration runner image inside the VNet so it can reach the private
// Flexible Server. Pulls PG-URI (admin) + POWERSYNC-REPL-PASSWORD from Key Vault
// via the user-assigned identity (which has Key Vault Secrets User).
//
//  Untested by author — validate with `az bicep build` / `what-if`. The Job run
//  itself is the real test; its console logs print the schema_migrations ledger.
// ============================================================================

targetScope = 'resourceGroup'

param location string = 'eastus2'
param namePrefix string = 'pantryparty'
param env string = 'prod'

@description('Container Apps environment resource ID (platform.bicep output environmentId).')
param environmentId string

@description('ACR login server, e.g. pantrypartyprodacrxxxx.azurecr.io (platform.bicep output).')
param acrLoginServer string

@description('User-assigned identity resource ID (platform.bicep output uamiResourceId).')
param uamiResourceId string

@description('Existing Key Vault name (main.bicep output keyVaultName).')
param keyVaultName string

@description('Image tag to run.')
param imageTag string = 'latest'

param tags object = {
  app: 'pantry-party'
  env: env
  managedBy: 'bicep'
}

var jobName = '${namePrefix}-${env}-migrate'
var image = '${acrLoginServer}/pantryparty-migrate:${imageTag}'
var kvSecretsBase = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets'

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uamiResourceId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: acrLoginServer
          identity: uamiResourceId
        }
      ]
      secrets: [
        {
          name: 'pg-uri'
          keyVaultUrl: '${kvSecretsBase}/PG-URI'
          identity: uamiResourceId
        }
        {
          name: 'ps-repl-password'
          keyVaultUrl: '${kvSecretsBase}/POWERSYNC-REPL-PASSWORD'
          identity: uamiResourceId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'PG_URI', secretRef: 'pg-uri' }
            { name: 'PS_REPL_PASSWORD', secretRef: 'ps-repl-password' }
          ]
        }
      ]
    }
  }
}

output jobName string = job.name
