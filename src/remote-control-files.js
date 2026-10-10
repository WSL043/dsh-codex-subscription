// File search for the phone's @-mentions: a bounded walk of a conversation folder with a small
// fuzzy matcher, answering the same shape the Codex app server does.

import { readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { localFolder } from './remote-control-dsh.js'

const SKIP = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'target', '__pycache__', '.venv', 'venv', '.next', '.cache', 'coverage'])
const MAX_ENTRIES = 30_000
const MAX_DEPTH = 8
const BUDGET_MS = 2_000
const RESULTS = 50

/** Subsequence match with a bonus for runs, word starts and the file name; undefined when the query is not in the text. */
export function fuzzyScore(query, text) {
  const needle = query.toLowerCase()
  const hay = text.toLowerCase()
  const indices = []
  let from = 0
  let score = 0
  let previous = -2
  const nameStart = hay.lastIndexOf('/') + 1
  for (const char of needle) {
    const at = hay.indexOf(char, from)
    if (at < 0) return undefined
    indices.push(at)
    score += 1 + (at === previous + 1 ? 5 : 0) + (at === 0 || '/_-. '.includes(hay[at - 1]) ? 4 : 0) + (at >= nameStart ? 2 : 0)
    previous = at
    from = at + 1
  }
  return { score: score * 10 - Math.floor(Math.min(text.length, 200) / 10), indices }
}

const within = (folder, target) => {
  const path = relative(resolve(folder), resolve(target))
  return path === '' || (!path.startsWith('..') && !/^[A-Za-z]:/u.test(path))
}

/** Matches for `query` under each root; roots outside `folders` are ignored. */
export async function searchFiles({ roots, query, folders, now = Date.now }) {
  const found = []
  const started = now()
  let seen = 0
  for (const given of roots) {
    const root = localFolder(given)
    if (!root || !folders.some(folder => within(folder, root))) continue
    const queue = [[root, 0]]
    while (queue.length > 0 && seen < MAX_ENTRIES && now() - started < BUDGET_MS) {
      const [folder, depth] = queue.shift()
      let entries
      try { entries = await readdir(folder, { withFileTypes: true }) } catch { continue }
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.github') continue
        const directory = entry.isDirectory()
        if (!directory && !entry.isFile()) continue
        seen += 1
        const path = relative(root, join(folder, entry.name)).split(sep).join('/')
        const match = query === '' ? { score: 0, indices: [] } : fuzzyScore(query, path)
        if (match) found.push({ root, path, matchType: directory ? 'directory' : 'file', fileName: entry.name, score: match.score, indices: match.indices })
        if (directory && !SKIP.has(entry.name) && depth < MAX_DEPTH) queue.push([join(folder, entry.name), depth + 1])
      }
    }
  }
  return found.sort((a, b) => b.score - a.score || a.path.length - b.path.length).slice(0, RESULTS)
}
