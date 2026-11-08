import { defineTool } from '@deepseek-ai/dsh-tools'
import { PREFERENCE_FIELDS } from './preference-fields.js'
import { OUTPUT_VERBOSITY_FIELD, REASONING_SUMMARY_FIELD } from './settings-contract.js'

const fields = [OUTPUT_VERBOSITY_FIELD, REASONING_SUMMARY_FIELD]
const name = 'codex_subscription_preferences'

export function createSubscriptionPreferencesTool(runPreferenceOperation, getApproval) {
  return defineTool({
    name,
    description: 'Read the Codex subscription response preferences. Update the saved defaults only when the user asks to change these settings. DSH asks for approval before saving.',
    parameters: {
      action: { type: 'string', enum: ['read', 'update'], required: true, description: 'Read current settings or save new defaults.' },
      [OUTPUT_VERBOSITY_FIELD]: { type: 'string', enum: PREFERENCE_FIELDS[OUTPUT_VERBOSITY_FIELD].choices, description: 'Default answer detail on supported Codex models.' },
      [REASONING_SUMMARY_FIELD]: { type: 'string', enum: PREFERENCE_FIELDS[REASONING_SUMMARY_FIELD].choices, description: 'Default reasoning summary on supported Codex models.' },
    },
    isConcurrencySafe: args => args.action === 'read',
    async execute(args, { agent, callId, signal }) {
      signal.throwIfAborted()
      const { action, ...patch } = args
      const updates = Object.entries(patch)
      if (action === 'read' ? updates.length !== 0 : action !== 'update' || updates.length === 0 ||
        updates.some(([key, value]) => !fields.includes(key) || !PREFERENCE_FIELDS[key].choices.includes(value))) {
        throw new Error('Invalid Codex subscription preference request')
      }
      if (action === 'update') {
        const approval = getApproval()
        if (typeof approval?.request !== 'function') throw new Error('DSH approval is unavailable')
        const changes = updates.map(([key, value]) => `${key} = ${value}`).join(', ')
        const decision = await approval.request({ agent, callId, signal, toolName: name, reason: `Save Codex subscription defaults: ${changes}` })
        signal.throwIfAborted()
        if (decision !== 'allowed-once') throw new Error('DSH did not approve the preference change')
      }
      const result = await runPreferenceOperation(action === 'read' ? 'preferences/status' : 'preferences/update', patch, signal)
      if (!result.ok) throw new Error(result.error.message)
      return {
        outputVerbosity: result.value[OUTPUT_VERBOSITY_FIELD],
        reasoningSummary: result.value[REASONING_SUMMARY_FIELD],
        writable: result.value.writable,
        ...(result.value.liveSynced === false ? { liveSynced: false } : {}),
      }
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
  })
}
