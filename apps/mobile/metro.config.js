// Monorepo workspace resolution for Metro. Without this, `import { ... } from '@breadbox/core'`
// fails at runtime because Metro can't find the workspace package.
// See: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire workspace so Metro picks up changes in `packages/*`.
config.watchFolders = [workspaceRoot];

// Resolve modules from the app's own node_modules first, then the workspace root's.
// `@breadbox/core` resolves via the root `node_modules/@breadbox/core` workspace symlink
// with the default (hierarchical) resolution — no need to disable hierarchical lookup,
// which expo/metro-config flags as a misconfiguration in current SDKs.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
