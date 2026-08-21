import { PACKAGE_VERSION } from './version.js'

/** Build a support report that deliberately excludes OAuth and account metadata. */
export async function createSubscriptionDiagnostics({ auth, preferences }) {
  let account = { status: 'unknown' }
  const issues = []
  try {
    const status = await auth.status()
    account = { status: status.authenticated === true ? 'signed-in' : 'signed-out' }
  } catch {
    issues.push({ code: 'account-status-unavailable' })
  }

  return {
    schemaVersion: 1,
    package: 'dsh-codex-subscription',
    version: PACKAGE_VERSION,
    runtime: { node: process.version },
    account,
    provider: {
      id: 'openai-codex',
      transport: 'sse',
      cache: { owner: 'dsh/pi-ai', retention: 'short' },
    },
    capabilities: {
      models: true,
      quota: true,
      search: true,
      imageGeneration: true,
      composerQuota: true,
      speedMode: true,
    },
    configuration: preferences.status(),
    issues,
  }
}
