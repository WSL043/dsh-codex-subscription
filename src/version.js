import packageJson from '../package.json' with { type: 'json' }

export const PACKAGE_VERSION = packageJson.version
export const USER_AGENT = `dsh-codex-subscription/${PACKAGE_VERSION}`

// The Codex app-server protocol level this host speaks. The phone app gates features (live voice from 0.146.0-alpha.3)
// on the version a host reports, and it reads Codex's own version format, not this plugin's.
export const CODEX_PROTOCOL_VERSION = '0.146.0'
export const APP_SERVER_USER_AGENT = `codex_cli_rs/${CODEX_PROTOCOL_VERSION} (DSH; ${USER_AGENT})`
