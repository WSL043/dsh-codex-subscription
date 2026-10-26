import { usePreferenceSnapshot } from './client-shared.js'
import { ImageChoice } from './image-preferences.jsx'
import { DEFAULT_REASONING_EFFORT_FIELD, DEFAULT_REASONING_EFFORTS, normalizeDefaultReasoningEffortChoice } from './settings-contract.js'

export function DefaultReasoningEffortPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const value = normalizeDefaultReasoningEffortChoice(snapshot[DEFAULT_REASONING_EFFORT_FIELD])
  return <ImageChoice t={t} label={t('defaultReasoningEffort')} hint={t('defaultReasoningEffortHint')}
    value={value} text={t(`defaultReasoningEffort_${value}`)}
    items={DEFAULT_REASONING_EFFORTS.map(id => ({ id, label: t(`defaultReasoningEffort_${id}`) }))}
    disabled={snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving}
    onSelect={effort => { void preference.set({ [DEFAULT_REASONING_EFFORT_FIELD]: effort }) }} />
}
