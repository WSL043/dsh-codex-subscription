#!/usr/bin/env node
// Refresh the checked-in slot snapshot from an installed DSH:
//   node scripts/refresh-slot-snapshot.mjs --modules <profile>/node_modules --dsh-version 0.2.1-rc.2
// Writes tests/fixtures/dsh-slots-<version>.json (slot names with kind and scope only).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declaredSlots } from './support/slot-catalog.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
const modules = argument('--modules')
const dshVersion = argument('--dsh-version')
if (modules === undefined || dshVersion === undefined) {
  console.error('usage: node scripts/refresh-slot-snapshot.mjs --modules <node_modules containing @deepseek-ai> --dsh-version <version>')
  process.exit(2)
}
const slots = declaredSlots(resolve(modules))
if (slots.length < 50) { console.error(`only ${slots.length} slots found; is ${modules} a DSH install?`); process.exit(1) }
const file = join(root, 'tests', 'fixtures', `dsh-slots-${dshVersion}.json`)
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, `${JSON.stringify({ dshVersion, slots }, null, 1).replace(/\{\n\s+"name": ("[^"]+"),\n\s+"kind": ("[^"]+"),\n\s+"scope": ("[^"]+")\n\s+\}/gu, '{ "name": $1, "kind": $2, "scope": $3 }')}\n`)
console.log(`wrote ${slots.length} slots to ${file}`)
