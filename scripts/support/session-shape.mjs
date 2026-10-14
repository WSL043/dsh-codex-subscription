#!/usr/bin/env node
// Support helper: print the *shape* of the newest DSH conversation (message roles,
// content block types, whether each text block really holds a string, the tool
// list, and how the last turn ended). It never prints message text, tool
// arguments, paths or names of files, so the output is safe to paste in an issue.
//
//   node session-shape.mjs [DSH_HOME or a sessions folder]
//
// Without an argument it looks under the usual per-user folders for `sessions`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const FILE = 'session.v4.jsonl.zstd'
const roots = process.argv[2] ? [process.argv[2]] : [homedir(), process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean)

function* walk(dir, depth) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isFile() && entry.name === FILE) yield path
    else if (entry.isDirectory() && depth > 0 && !['node_modules', '.git', 'Cache', 'Code Cache', 'GPUCache'].includes(entry.name)) yield* walk(path, depth - 1)
  }
}

let newest
for (const root of roots) for (const file of walk(root, 6)) {
  const time = statSync(file).mtimeMs
  if (!newest || time > newest.time) newest = { file, time }
}
if (!newest) { console.log('No DSH session file found. Pass the DSH home folder as an argument.'); process.exit(1) }

function readEvents(file) {
  const bytes = readFileSync(file)
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = []
  for (let at = bytes.indexOf(magic); at >= 0; at = bytes.indexOf(magic, at + 4)) starts.push(at)
  const events = []
  starts.forEach((start, index) => {
    try {
      for (const line of zstdDecompressSync(bytes.subarray(start, starts[index + 1] ?? bytes.length)).toString().split('\n')) {
        if (line) events.push(JSON.parse(line))
      }
    } catch { /* a damaged frame is skipped */ }
  })
  return events
}

const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const block = value => {
  if (value === null || typeof value !== 'object') return kind(value)
  const text = 'text' in value ? ` text=${kind(value.text)}${typeof value.text === 'string' && value.text.length === 0 ? '(empty)' : ''}` : ''
  return `${value.type ?? '?'}${text}`
}
const message = value => `${value?.role ?? '?'} content=${Array.isArray(value?.content) ? `[${value.content.map(block).join(', ')}]` : kind(value?.content)}`

const events = readEvents(newest.file)
console.log(`events: ${events.length}`)
for (const event of events) {
  const data = event.data ?? {}
  if (event.type === 'user/message' || event.type === 'system/message' || event.type === 'assistant/message' || event.type === 'tool/result') {
    console.log(`#${event.seq} ${event.type}: ${message(data.message ?? data)}`)
  } else if (event.type === 'model/selection') {
    console.log(`#${event.seq} model: ${data.provider}/${data.model} effort=${data.reasoningEffort}`)
  } else if (event.type === 'request/header') {
    const tools = Array.isArray(data.header?.tools) ? data.header.tools : []
    console.log(`#${event.seq} request header: ${tools.length} tools`)
    const shapes = new Map()
    for (const tool of tools) {
      const line = `tool name=${kind(tool?.name)} description=${kind(tool?.description)} parameters=${kind(tool?.parameters)}${tool?.parameters && typeof tool.parameters === 'object' ? ` type=${kind(tool.parameters.type)} properties=${kind(tool.parameters.properties)}` : ''}`
      shapes.set(line, (shapes.get(line) ?? 0) + 1)
    }
    for (const [line, count] of shapes) console.log(`    ${count} x ${line}`)
  } else if (event.type === 'turn/end') {
    const reason = data.reason ?? {}
    console.log(`#${event.seq} turn end: ${reason.kind}${reason.failure ? ` code=${reason.failure.code} message=${JSON.stringify(String(reason.failure.message).slice(0, 160))}` : ''}`)
  }
}
