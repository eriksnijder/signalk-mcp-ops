// Both src/ and dist/ live directly below package.json. Keep protocol and OpenAPI
// metadata aligned with the installed artifact, including prerelease versions.
export const PLUGIN_VERSION: string = (require('../package.json') as { version: string }).version
