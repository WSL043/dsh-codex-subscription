// Reuse the host renderer, including its session-scoped business props. Entries
// requiring a store or child-slot renderer must be left to the host machinery.
export function nativeComposerAttachments(entries, ownComponent) {
  return entries.find(entry => entry.component !== ownComponent
    && entry.locale === 'conversation' && !entry.store && !entry.children
    && (entry.inject === undefined || typeof entry.inject === 'function'))
}

export function nativeComposerProps(entry, props, translate) {
  return { ...props, ...entry.inject?.(props.sessionId), t: translate }
}
