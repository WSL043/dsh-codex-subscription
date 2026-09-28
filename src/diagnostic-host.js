import { collectChecks } from './diagnostic-checks.js'
import { PACKAGE_VERSION } from './version.js'

const roots = ['settings.section', 'conversation.input.right', 'conversation.input.model',
  'conversation.input.attachments', 'conversation.message.images', 'conversation.trajectory.images', 'shell.overlay']
const packageName = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]{0,99}$/u
export function projectHostSlots(slots) {
  if (typeof slots?.snapshot !== 'function') return undefined
  return roots.map(name => {
    const nodes = slots.snapshot(name)
    const node = Array.isArray(nodes) ? nodes.find(item => item.type === 'slot' && item.name === name) : undefined
    const occupants = Array.isArray(node?.occupants) ? node.occupants : []
    return { name, declared: !!node, truncated: occupants.length > 16,
      occupants: occupants.slice(0, 16).map(value => ({
        registrant: typeof value.registrant === 'string' && packageName.test(value.registrant) ? value.registrant : 'unknown',
        identity: 'unverified-host-label',
        active: value.active === true,
      })),
    }
  })
}

export function createHostDiagnostics() {
  const scopes = new Map()
  let sequence = 0
  return {
    register(slots) {
      const item = scopes.get(slots) ?? { alias: `scope-${++sequence}`, count: 0 }
      item.count++; scopes.set(slots, item)
      return () => { if (--item.count === 0) scopes.delete(slots) }
    },
    async collect() {
      const topology = []
      const active = [...scopes.entries()].slice(0, 8)
      const checks = await collectChecks(active.map(([slots, item]) => ({
        id: `host-slots-${item.alias}`, capability: 'host-ui',
        run: () => {
          const value = projectHostSlots(slots)
          if (!value) return { status: 'unknown', reason: 'host-inspection-unavailable' }
          topology.push({ scope: item.alias, slots: value })
          return { status: 'pass', reason: 'inspection-completed' }
        },
      })), { source: 'client', scope: 'mounted-host-scopes' })
      return { version: PACKAGE_VERSION, generatedAt: new Date().toISOString(), checks, topology,
        truncated: scopes.size > active.length, interpretation: 'host-selection-not-visual-or-execution-proof' }
    },
  }
}
