// Slot names: the ones this plugin registers (parsed from its sources) and the ones a DSH install
// declares (parsed from the type declarations of its @deepseek-ai packages).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const sourceFiles = directory => readdirSync(directory).filter(name => /\.(jsx?|mjs)$/u.test(name)).sort().map(name => join(directory, name))

/**
 * Every slot name this plugin registers or injects: `slots.inject('x')`, `name: 'x'` inside a
 * register call, the `[name, component]` tables that feed `slots.inject(name, ...)`, and the
 * `roots` the diagnostics read back from the host.
 */
export function registeredSlotNames(root) {
  const names = new Set()
  const slotName = '([a-z][a-z0-9-]*(?:\\.[a-z][A-Za-z0-9-]*)+)'
  for (const file of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(new RegExp(`slots\\.(?:inject|register|subscribe|snapshot|spec)\\(\\s*'${slotName}'`, 'gu'))) names.add(match[1])
    for (const match of text.matchAll(new RegExp(`\\bname:\\s*'${slotName}'`, 'gu'))) names.add(match[1])
    for (const match of text.matchAll(new RegExp(`\\[\\s*'${slotName}'\\s*,\\s*[A-Z]\\w*\\s*\\]`, 'gu'))) names.add(match[1])
  }
  // diagnostic-host.js: `const roots = [ ... ]`
  const diagnostics = readFileSync(join(root, 'src', 'diagnostic-host.js'), 'utf8')
  const rootsBlock = /const roots = \[([\s\S]*?)\]/u.exec(diagnostics)?.[1] ?? ''
  for (const match of rootsBlock.matchAll(/'([^']+)'/gu)) names.add(match[1])
  return [...names].filter(name => !/\.(png|webp|jpe?g|svg|json|js|jsx|mjs|css|md)$/u.test(name)).sort()
}

function* declarations(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const info = statSync(path)
    if (info.isDirectory()) yield* declarations(path)
    else if (entry.endsWith('.d.ts')) yield path
  }
}

/** The slot catalog declared by an installed DSH: [{name, kind, scope}] from `'a.b': { kind: ..; scope: ..; }` entries. */
export function declaredSlots(modulesDirectory) {
  const scope = join(modulesDirectory, '@deepseek-ai')
  const found = new Map()
  for (const pkg of readdirSync(scope)) {
    const types = join(scope, pkg, 'lib', 'types')
    try { if (!statSync(types).isDirectory()) continue } catch { continue }
    for (const file of declarations(types)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/'([a-z][a-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)+)':\s*\{\s*kind:\s*'(\w+)';\s*scope:\s*'([\w-]+)';/gu)) {
        found.set(match[1], { name: match[1], kind: match[2], scope: match[3] })
      }
    }
  }
  return [...found.values()].sort((left, right) => left.name.localeCompare(right.name))
}
