// Metro config for the pnpm monorepo.
//
// pnpm uses a non-hoisted, symlinked node_modules layout. Without the settings
// below, Metro cannot resolve workspace packages (`@tv-time-2/shared-types`)
// or hoisted deps living in the repo-root node_modules.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so changes in packages/* trigger rebuilds.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both the app and the repo-root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Follow pnpm's symlinks (required to reach @tv-time-2/shared-types).
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
