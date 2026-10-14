#!/usr/bin/env node
// Maintainer tool: replay the request a support report recorded for a failed
// model call, against the real pi-ai Codex provider with a stubbed network, and
// print where the exception is thrown.
//
//   node scripts/support/replay-request.mjs diagnostics.json
//
// The report only holds a text-free copy of the request (see src/failure-capture.js),
// which is enough for failures that happen before anything is sent.
import { readFileSync } from 'node:fs'
import inspector from 'node:inspector'
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { reviveRequest } from '../../src/failure-capture.js'

if (!isMainThread) {
  // Pause the main thread on every exception, record where it was thrown, resume.
  const session = new inspector.Session()
  session.connectToMainThread()
  session.post('Debugger.enable')
  session.post('Debugger.setPauseOnExceptions', { state: 'all' })
  session.on('Debugger.paused', ({ params }) => {
    const description = params.data?.description ?? ''
    if (process.env.REPLAY_DEBUG) console.error('paused', params.reason, description.split('\n')[0])
    if (['exception', 'promiseRejection'].includes(params.reason) && /^(?:TypeError|RangeError|ReferenceError)/u.test(description)) {
      parentPause.push({
        message: description.split('\n')[0],
        frames: params.callFrames.slice(0, 8).map(frame => `${frame.functionName || '(anonymous)'} ${frame.url.replace(/^.*node_modules[\\/]/u, '')}:${frame.location.lineNumber + 1}`),
      })
    }
    session.post('Debugger.resume')
  })
  const parentPause = []
  parentPort.on('message', message => {
    if (message === 'collect') parentPort.postMessage(parentPause)
  })
} else {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const failure = report.streamFailure ?? report
  if (!failure.request && !failure.adapter?.request) { console.log('The report has no recorded request.'); process.exit(1) }
  const worker = new Worker(new URL(import.meta.url))
  await new Promise(resolve => setTimeout(resolve, 500))
  const { openaiCodexSubscriptionProvider } = await import('../../src/pi-ai-runtime.js')
  const jwt = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'replay' } })).toString('base64url')}.replay`
  const completed = JSON.stringify({ type: 'response.completed', response: { id: 'r', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
  globalThis.fetch = async () => new Response(`data: ${completed}

`, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const provider = openaiCodexSubscriptionProvider()
  const outcomes = []
  if (failure.request) {
    const { model, context, options } = reviveRequest(failure.request)
    let outcome = 'completed'
    try {
      for await (const event of provider[failure.request.method ?? 'streamSimple'](model, context, { ...options, apiKey: jwt, transport: 'sse', signal: undefined })) {
        if (event.type === 'error') outcome = `error event: ${event.error?.errorMessage}`
      }
    } catch (error) { outcome = `thrown: ${error?.message}` }
    outcomes.push(`pi-ai request replay: ${outcome}`)
  }
  if (failure.adapter?.request) {
    const { PiAiAdapter } = await import('@deepseek-ai/dsh-llm-pi-ai')
    const adapter = new PiAiAdapter({
      profiles: () => new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 5000 }]]),
      resolveApiKey: async () => jwt,
    })
    let outcome = 'completed'
    try {
      const request = reviveRequest(failure.adapter.request)
      const known = provider.getModels().map(model => model.id)
      if (!known.includes(request.model)) { outcomes.push(`note: model ${request.model} is not in the bundled list, replaying with ${known[0]}`); request.model = known[0] }
      for await (const chunk of adapter.stream({ ...request, signal: AbortSignal.timeout(8000) })) {
        if (chunk.reason?.failure) outcome = `failure ${chunk.reason.failure.code}: ${chunk.reason.failure.message}`
      }
    } catch (error) { outcome = `thrown: ${error?.message}` }
    outcomes.push(`adapter request replay: ${outcome}`)
  }
  worker.postMessage('collect')
  const found = await new Promise(resolve => worker.once('message', resolve))
  for (const outcome of outcomes) console.log(outcome)
  for (const item of found) console.log(['', item.message, ...item.frames.map(frame => `  at ${frame}`)].join('\n'))
  if (found.length === 0) console.log('No exception was observed in this replay.')
  process.exit(0)
}
