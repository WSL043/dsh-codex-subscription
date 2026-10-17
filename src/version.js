import packageJson from '../package.json' with { type: 'json' }

export const PACKAGE_VERSION = packageJson.version
export const USER_AGENT = `dsh-codex-subscription/${PACKAGE_VERSION}`
