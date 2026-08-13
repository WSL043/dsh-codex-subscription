import { spawn } from 'node:child_process'

const OPENAI_AUTH_ORIGIN = 'https://auth.openai.com'

/** Validate the only external origin this plugin may launch. */
export function assertCodexAuthUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Codex auth URL is invalid')
  }
  if (url.protocol !== 'https:') throw new Error('Codex auth URL must use HTTPS')
  if (url.origin !== OPENAI_AUTH_ORIGIN || url.username !== '' || url.password !== '') {
    throw new Error('Codex auth URL must use the OpenAI auth origin')
  }
  return url.href
}

/** Return a shell-free native opener command for the current desktop. */
export function commandForCodexAuthUrl(value, platform = process.platform) {
  const url = assertCodexAuthUrl(value)
  if (platform === 'win32') {
    return {
      file: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', url],
      shell: false,
    }
  }
  if (platform === 'darwin') return { file: 'open', args: [url], shell: false }
  if (platform === 'linux') return { file: 'xdg-open', args: [url], shell: false }
  throw new Error(`Codex auth URL opener is unsupported on ${platform}`)
}

export function openCodexAuthUrl(value, options = {}) {
  const command = commandForCodexAuthUrl(value, options.platform)
  const spawnProcess = options.spawn ?? spawn
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command.file, command.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: command.shell,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
