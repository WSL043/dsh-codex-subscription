import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(process.argv[2])
const files = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.mjs')).map(name => join(root, 'tests', name))
const legacy = join(root, 'tests', 'host-settings-schema.test.mjs')
const temporary = join(root, 'tests', '.compat-host-settings-schema.test.mjs')
let adapted = false
try {
  // Old published tags constructed a Cordis Entry fixture without binding its
  // context. New Cordis correctly requires that binding. Fix only the test
  // fixture in a disposable copy; never alter the candidate's runtime or tests.
  const source = readFileSync(legacy, 'utf8')
  if (source.includes('Entry.prototype._commitVolatile') && !source.includes('fiber.ctx.fiber = fiber')) {
    const marker = '  fiber.entry = entry\n'
    const normalized = source.replaceAll('\r\n', '\n')
    if (normalized.split(marker).length !== 2) throw Error('Unrecognized legacy Cordis fixture')
    writeFileSync(temporary, normalized.replace(marker, `${marker}  fiber.ctx.fiber = fiber\n`))
    files[files.indexOf(legacy)] = temporary
    adapted = true
    console.log('Compatibility acceptance: bind the legacy Cordis test context; candidate source is unchanged.')
  }
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { if (adapted) unlinkSync(temporary) }
