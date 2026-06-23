/**
 * Pantry Party home/lock-screen widget target (@bacons/apple-targets).
 *
 * The config plugin links this `targets/widget/` folder to a WidgetKit
 * extension at prebuild. The Swift lives beside this file (index.swift). The
 * App Group MUST match app.config.js (main app) + index.swift so the widget
 * can read the snapshot the RN app writes via ExtensionStorage.
 *
 * Colors are hardcoded in index.swift (self-contained, no asset-catalog
 * dependency), so there is no `colors` map to keep in sync here.
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = () => ({
  type: 'widget',
  name: 'Pantry Party Widget',
  // Lock-screen accessory families need iOS 16+.
  deploymentTarget: '16.0',
  // Sign the extension with the same Apple team as the app. When APPLE_TEAM_ID
  // is unset this is undefined and Xcode falls back to automatic signing —
  // fine for a local dev build.
  appleTeamId: process.env.APPLE_TEAM_ID,
  entitlements: {
    'com.apple.security.application-groups': ['group.com.osctulsa.pantryparty'],
  },
});
