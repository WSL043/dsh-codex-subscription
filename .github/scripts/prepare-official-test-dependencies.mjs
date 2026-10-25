import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TEST_DEPENDENCIES = ['fake-indexeddb', 'react']

/** Preserve the checkout's locked package graph, with only the test-owned roots enabled. */
export function projectTestDependencies(manifest, lockfile) {
  const start = lockfile.indexOf('\nimporters:\n'), end = lockfile.indexOf('\npackages:\n', start)
  if (start < 0 || end < 0) throw new Error('Unsupported pnpm lockfile layout')
  const importer = lockfile.slice(start, end)
  const dependencies = {}, entries = []
  for (const name of TEST_DEPENDENCIES) {
    const version = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version)) throw new Error(`Missing exact test dependency: ${name}`)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const entry = new RegExp(`^      ['"]?${escaped}['"]?:\\r?\\n        specifier: ([^\\r\\n]+)\\r?\\n        version: ([^\\r\\n]+)`, 'mu').exec(importer)
    if (!entry || entry[1] !== version || entry[2] !== version) throw new Error(`Test dependency is not locked to ${name}@${version}`)
    dependencies[name] = version
    entries.push(`      ${JSON.stringify(name)}:\n        specifier: ${version}\n        version: ${version}`)
  }
  return {
    manifest: { private: true, dependencies },
    lockfile: `${lockfile.slice(0, start)}\nimporters:\n\n  .:\n    dependencies:\n${entries.join('\n')}\n${lockfile.slice(end)}`,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = fileURLToPath(new URL('../../', import.meta.url))
  const target = resolve(process.argv[2])
  const projected = projectTestDependencies(JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8')), readFileSync(resolve(source, 'pnpm-lock.yaml'), 'utf8'))
  mkdirSync(target, { recursive: true })
  writeFileSync(resolve(target, 'package.json'), `${JSON.stringify(projected.manifest, null, 2)}\n`)
  writeFileSync(resolve(target, 'pnpm-lock.yaml'), projected.lockfile)
}
