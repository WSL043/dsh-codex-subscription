// DSH's pi-ai adapter and the pi-ai library that runs the Codex request come from the
// host, and a profile can end up with an adapter newer than the library (an adapter
// from 0.2.1-alpha.2 on hands over a transcript whose first message is the system
// prompt; pi-ai before 0.87 only knows Context.systemPrompt and fails while sizing
// that message). Hand an older library the shape it understands.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const versionOf = specifier => {
  try {
    let path = fileURLToPath(import.meta.resolve(specifier))
    for (let depth = 0; depth < 6; depth += 1) {
      path = path.replace(/[\\/][^\\/]+$/u, '')
      try {
        const manifest = JSON.parse(readFileSync(`${path}/package.json`, 'utf8'))
        if (typeof manifest.version === 'string') return manifest.version
      } catch { /* keep walking up */ }
    }
  } catch { /* not resolvable from here */ }
  return undefined
}

let cached
/** Versions of the pi-ai library and of DSH's adapter this plugin runs against. */
export function runtimeVersions() {
  cached ??= { piAi: versionOf('@earendil-works/pi-ai'), adapter: versionOf('@deepseek-ai/dsh-llm-pi-ai') }
  return cached
}

const atLeast087 = version => {
  const match = /^(\d+)\.(\d+)/u.exec(version ?? '')
  return match !== null && (Number(match[1]) > 0 || Number(match[2]) >= 87)
}

/** Whether the installed pi-ai understands system messages inside the transcript. */
export const understandsSystemMessages = version => atLeast087(version)

const textOf = content => typeof content === 'string'
  ? content
  : Array.isArray(content) ? content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n') : ''

/**
 * Fold the transcript's leading system messages back into `systemPrompt` and `tools`,
 * the form every pi-ai release accepts. Messages after the first non-system one stay.
 */
export function hoistLeadingSystem(context) {
  const messages = context?.messages
  if (!Array.isArray(messages) || messages[0]?.role !== 'system') return context
  let end = 0
  const texts = context.systemPrompt ? [context.systemPrompt] : []
  const tools = [...(Array.isArray(context.tools) ? context.tools : [])]
  while (messages[end]?.role === 'system') {
    const message = messages[end]
    const text = [textOf(message.content), ...Object.values(message.sections ?? {}).filter(value => typeof value === 'string')].filter(Boolean).join('\n\n')
    if (text !== '') texts.push(text)
    if (Array.isArray(message.toolsAdded)) tools.push(...message.toolsAdded)
    end += 1
  }
  const { systemPrompt: _systemPrompt, tools: _tools, ...rest } = context
  const systemPrompt = texts.join('\n\n')
  return { ...rest, ...(systemPrompt === '' ? {} : { systemPrompt }), ...(tools.length === 0 ? {} : { tools }), messages: messages.slice(end) }
}
