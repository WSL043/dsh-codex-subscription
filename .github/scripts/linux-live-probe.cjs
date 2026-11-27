const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { writeFile } = require('node:fs/promises')
module.exports = {
  name: 'linux-live-transport-probe', inject: ['sessionController'],
  apply(ctx) {
    const control = globalThis[Symbol.for('dsh-linux-live-control')]
    let stage = 'startup'
    const emit = value => writeFile(process.env.DSH_LIVE_RESULT, JSON.stringify({ stage, ...value }, null, 2))
    const deadline = (operation, ms = 60000) => {
      let timer
      return Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Live probe deadline')), ms) })]).finally(() => clearTimeout(timer))
    }
    queueMicrotask(() => {
      void (async () => {
        await emit({ pending: true })
        await control.ready
        const service = ctx.get('sessionController')
        // Stop native request retries: the connection layer's one pre-acceptance SSE fallback is the test.
        ctx.on('agent/request-error', () => undefined, true)
        const create = async name => {
          const { sessionId } = await service.create({ cwd: process.env.DSH_LIVE_WORKSPACE })
          await service.rename({ sessionId, title: name })
          await service.selectModel({ sessionId, provider: 'openai-codex', model: 'gpt-6.2-sol', reasoningEffort: 'low' })
          const { agent } = await service.resolveAgent(sessionId)
          return { sessionId, agent }
        }
        const submit = async (session, text) => {
          const result = await service.prompt({ requestId: randomUUID(), sessionId: session.sessionId, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(15000))
          assert.notEqual(result?.accepted, false)
          await deadline(session.agent.whenIdle())
          const message = [...session.agent.session.deriveMessages()].filter(message => message.role === 'assistant').at(-1)
          const answer = message?.content?.filter(part => part.type === 'text').map(part => part.text).join('').trim()
          assert.equal(answer, 'READY', 'The selected model must complete its fixed short answer')
        }
        const main = await create('Linux transport verification'), parallel = await create('Linux parallel verification')
        const prompt = 'Reply with READY only. Do not call tools or access files.'
        for (const name of ['baseline-1', 'baseline-2']) { stage = name; control.phase(stage); await emit({ pending: true }); await submit(main, prompt) }
        assert.ok(control.snapshot().wires.some(wire => wire.phase === 'baseline-2' && wire.transport === 'websocket' && wire.previousResponse))
        stage = 'injected-upgrade-rejection'; control.phase(stage)
        await control.rejectUpgrade(); await submit(main, prompt)
        assert.ok(control.snapshot().wires.some(wire => wire.phase === stage && wire.transport === 'sse'))
        stage = 'cooldown'; control.phase(stage); await submit(main, prompt)
        assert.ok(control.snapshot().wires.some(wire => wire.phase === stage && wire.transport === 'sse'))
        stage = 'parallel-sse'; control.phase(stage); control.hold()
        const pending = submit(parallel, 'LIVE-PARALLEL-HOLD. ' + prompt)
        pending.catch(() => {})
        await deadline((async () => { while (!control.held()) await new Promise(resolve => setTimeout(resolve, 100)) })(), 15000)
        await emit({ pending: true, waitingForProductionCooldown: true })
        // Production cooldown has up to 20% jitter; do not accelerate its clock.
        await new Promise(resolve => setTimeout(resolve, 37000))
        stage = 'recovery-with-parallel-sse'; control.phase(stage); await submit(main, prompt)
        assert.ok(control.snapshot().wires.some(wire => wire.phase === stage && wire.transport === 'websocket'), 'Other SSE traffic must not starve the recovery probe')
        control.release(); await pending
        stage = 'delta-after-recovery'; control.phase(stage); await submit(main, prompt)
        assert.ok(control.snapshot().wires.some(wire => wire.phase === stage && wire.transport === 'websocket' && wire.previousResponse && wire.inputItems === 1))
        await emit({ passed: true, realAccount: true, model: 'gpt-6.2-sol', primaryPrompts: 7, injectedNetworkFailure: true,
          parallelSseAllowedProbe: true, nativeAgentLoop: true, ...control.snapshot() })
      })().catch(async error => {
        control?.release()
        await emit({ passed: false, realAccount: true, code: /^[A-Z_]{1,48}$/.test(error?.code ?? '') ? error.code : 'LIVE_PROBE_FAILED', ...control?.snapshot() })
      })
    })
  },
}
