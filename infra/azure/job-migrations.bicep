// =============================================================================
// job-migrations.bicep — Container Apps Job that runs the migration runner.
//
// A MANUALLY triggered job (you start it explicitly; it is not a cron). It runs
// the runner image once, applying the baseline schema + provisioning the
// powersync_repl role against the private Postgres business DB. Idempotent, so
// re-running on transient failure (e.g. RBAC still propagating) is safe.
//
// Reads its connection secrets straight from Key Vault via the user-assigned
// identity — no passwords passed as deploy params here.
// =============================================================================

@description('Azure region.')
param location string = 'eastus2'

@description('Short prefix (must match the other templates).')
param namePrefix string = 'pantryparty'

@description('Environment moniker (must match the other templates).')
param env string = 'prod'

@description('Container Apps environment resource ID (platform.bicep output environmentId).')
param environmentId string

@description('ACR login server, e.g. pantypartyprodacr.azurecr.io (platform.bicep output acrLoginServer).')
param acrLoginServer string

@description('User-assigned identity resource ID (platform.bicep output uamiResourceId).')
param uamiResourceId string

@description('Key Vault name holding pg-admin-uri + ps-repl-password (main.bicep output keyVaultName).')
param keyVaultName string

@description('Image tag for the runner image.')
param imageTag string = 'latest'

@description('Runner image repository name.')
param imageRepository string = 'pantryparty-migrate'

var suffix = '${namePrefix}-${env}'
var jobName = '${suffix}-migrate'

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uamiResourceId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
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
          name: 'admin-uri'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/pg-admin-uri'
          identity: uamiResourceId
        }
        {
          name: 'repl-password'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/ps-repl-password'
          identity: uamiResourceId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: '${acrLoginServer}/${imageRepository}:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'ADMIN_URI', secretRef: 'admin-uri' }
            { name: 'REPL_PASSWORD', secretRef: 'repl-password' }
          ]
        }
      ]
    }
  }
}

output jobName string = job.name
