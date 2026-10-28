import { createSketchSessionRegistry } from './sketch-session-state.js'
import { withComposerSession, openComposerSession, createSessionOpeners } from './client-session-compat.js'
import { ComposerImagePreviews, MessageImagePreviews, IMAGE_PREVIEWS_CSS } from './client-image-previews.jsx'
import { imageConversationNode } from './image-conversation-node.js'
import { CodexImageToolRow, CodexImageOutput } from './client-images.jsx'
import { ImageWorkspace } from './image-workspace.jsx'
import { attachImageFiles, appendImagePrompt } from './image-composer.js'
import { createSketchTrigger, createImageTrigger } from './sketch-trigger.js'
import { zh, en } from './client-locales.js'
import { STYLE } from './client-styles.js'
import { createAnnotatedImageReference } from './image-edit-reference.js'
import { DeferredImageViewer } from './client-deferred-image-viewer.jsx'
import { SubscriptionImageViewerService } from './subscription-image-viewer.js'
import { createPreferenceController } from './preference-controller.js'
import { createDefaultModelController } from './default-model-controller.js'
import { createAccountStatusController } from './account-status-controller.js'
import { NS, CHANNEL, unwrap } from './client-shared.js'
import { createSubscriptionRpcClient } from './rpc-contract.js'
import { CodexComposerQuota } from './client-composer-quota.jsx'
import { quotaUsageController } from './client-quota.jsx'
import { CodexModelSelect } from './client-model-select.jsx'
import { VoiceCallButton } from './client-voice-call.jsx'
import { CodexSection } from './client-section.jsx'
import { createHostDiagnostics } from './diagnostic-host.js'
import { restoreVoiceConversation } from './voice-browser.js'
import { ComposerPrediction, PREDICTION_CSS } from './client-predictions.jsx'

export const inject = [
  'slots', 'locale', 'connection', 'remote', 'modelDirectories', 'conversation', 'uiConversation', 'sessions',
]

// The composer's right-hand slot holds one component: the quota readout and the voice button share it, so DSH's own voice input
// (which owns the activity slot) and this one never compete.
const ComposerRight = props => <><CodexComposerQuota {...props} /><VoiceCallButton {...props} /></>

export function apply(ctx) {
  if (new URL(window.location.href).searchParams.has('codexVoiceSession')) ctx.inject(['uiWorkspace', 'sessions'], scope => scope.effect(() => {
    const sessions = scope.get('sessions'), controller = new AbortController()
    let attempted = false
    const restore = () => {
      if (attempted || (typeof sessions.list?.getSnapshot === 'function' && sessions.list.getSnapshot().phase !== 'ready')) return
      attempted = true
      void restoreVoiceConversation({ href: window.location.href, workspace: scope.get('uiWorkspace'), history: window.history, sessions, signal: controller.signal }).catch(() => { /* retain an unavailable target for a deliberate retry */ })
    }
    const unsubscribe = sessions.list?.subscribe?.(restore) ?? (() => {})
    restore()
    return () => { controller.abort(); unsubscribe() }
  }, 'codex-subscription: browser voice conversation'))
  const diagnostics = createHostDiagnostics()
  ctx.effect(() => diagnostics.register(ctx.slots), 'codex-subscription: host inspection')
  const imageViewer = new SubscriptionImageViewerService()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-subscription: copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-codex-subscription'
    tag.textContent = STYLE + IMAGE_PREVIEWS_CSS + PREDICTION_CSS
    document.head.append(tag)
    return () => tag.remove()
  }, 'codex-subscription: style')
  const rpc = createSubscriptionRpcClient(ctx.get('connection').rpc)
  const preference = createPreferenceController(rpc)
  const quotaUsage = quotaUsageController(rpc)
  ctx.effect(() => {
    let mode = preference.getSnapshot().quickQuotaMode
    return preference.subscribe(() => {
      const next = preference.getSnapshot().quickQuotaMode
      if (next !== mode) { mode = next; quotaUsage.invalidate({ preserveUsage: true }) }
    })
  }, 'codex-subscription: quota preference snapshot')
  const defaultModel = createDefaultModelController(rpc)
  ctx.effect(() => {
    let previous = JSON.stringify(preference.getSnapshot(), (key,value) => key.startsWith('image') || key === '' ? value : undefined)
    return preference.subscribe(() => {
      const next = JSON.stringify(preference.getSnapshot(), (key,value) => key.startsWith('image') || key === '' ? value : undefined)
      if (next !== previous) imageViewer.close()
      previous = next
    })
  }, 'codex-subscription: image controls')
  const accountStatus = createAccountStatusController(rpc)
  ctx.effect(() => {
    void preference.load()
    void accountStatus.load()
    const disposeReset = ctx.on('connection/reset', () => { quotaUsage.invalidate(); void preference.load(); void preference.refreshModels(); void accountStatus.reload() })
    return () => {
      disposeReset?.()
      preference.dispose()
      defaultModel.dispose()
      accountStatus.dispose()
    }
  }, 'codex-subscription: preferences and account status')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'codex-subscription-image-viewer', order: 20,
    inject: () => ({ service: imageViewer, t }),
  }, DeferredImageViewer))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => t('nav'), locale: NS, inject: () => ({ preference, rpc: rpc, accountStatus, t, diagnostics, defaultModel }),
  }, CodexSection))
  const sessions = ctx.get('sessions')
  // The quota readout and the voice button sit in the composer's right slot. They register on the root context, like the
  // composer's other entries, so DSH's composer always finds them (a session scope can be a different slot registry).
  const rootDirectories = ctx.get('modelDirectories')
  // The host's directory service reads remote.session from the context that asked for it; the root context does not inject it,
  // so once the session-scoped install below has run, its instance is the one to use.
  let scopedDirectories
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'codex-subscription-quota', order: 15,
    locale: NS,
    inject: sessionId => ({
      sessionId,
      preference,
      rpc: rpc,
      t,
      directory: (scopedDirectories ?? rootDirectories).directoryFor(sessionId).store,
    }),
  }, ComposerRight))
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay', id: 'codex-subscription-prediction', order: 20,
    inject: sessionId => ({ sessionId, preference, rpc, t, accountStatus,
      directory: (scopedDirectories ?? rootDirectories).directoryFor(sessionId).store,
    }),
  }, ComposerPrediction))
  const installDirectorySlots = scope => {
    scope.effect(() => diagnostics.register(scope.slots), 'codex-subscription: scoped host inspection')
    const modelDirectories = scope.get('modelDirectories')
    scopedDirectories = modelDirectories
    scope.effect(() => () => { if (scopedDirectories === modelDirectories) scopedDirectories = undefined }, 'codex-subscription: scoped model directories')
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model', priority: -10, locale: NS,
      // The label slot is declared by DSH's own picker entry; declaring it again makes DSH refuse this registration (and the picker disappears).
      inject: sessionId => {
        const directory = modelDirectories.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          load: () => { if (available) void directory.load() },
          select: selection => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
          preference,
        }
      },
    }, CodexModelSelect))
  }
  if (ctx.get('remote.session') === undefined) installDirectorySlots(ctx)
  else ctx.inject(['remote.session'], installDirectorySlots)
  const conversation = ctx.get('conversation')
  const uiConversation = ctx.get('uiConversation')
  const sketchOpeners = createSessionOpeners()
  const sketchSessions = createSketchSessionRegistry()
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort(); imageViewer.close(); sketchOpeners.clear(); sketchSessions.dispose() }, 'codex-subscription: sketch sessions')
  ctx.inject(['inputTriggers'], triggerContext => triggerContext.effect(() => triggerContext.get('inputTriggers').registerSource(createSketchTrigger({
    name: () => t('triggerSketchName'), description: () => t('triggerSketchHint'),
    enabled: () => { const value = preference.getSnapshot(); return value.imageSketchAgent && value.imageSketch && value.imageEditing },
    consume: (sessionId, span) => {
      const actx = sessions.scope(sessionId)
      return sketchOpeners.has(sessionId) && actx?.bail(actx, 'slash/input-insert-text', { text: '@sketch ', span }) === true
    },
  })), 'codex-subscription: Sketch trigger'))
  ctx.inject(['inputTriggers'], triggerContext => triggerContext.effect(() => triggerContext.get('inputTriggers').registerSource(createImageTrigger({
    name: () => t('triggerImageName'), description: () => t('triggerImageHint'),
    enabled: () => { const value = preference.getSnapshot(); return value.imageShortcut && (value.imageGeneration || value.imageEditing) },
    open: () => {},
    consume: (sessionId, span) => {
      const actx = sessions.scope(sessionId)
      return sketchOpeners.has(sessionId) && actx?.bail(actx, 'slash/input-insert-text', { text: t('imageInlinePrompt'), span }) === true
    },
  })), 'codex-subscription: Image trigger'))
  const sessionInput = sessionId => {
    const actx = sessions.scope(sessionId)
    if (!actx || !conversation.input?.for) throw new Error('Image composer is unavailable')
    return conversation.input.for(actx)
  }
  const openSketchImage = sessionId => async (src, name) => {
    const settings = preference.getSnapshot(), open = sketchOpeners.get(sessionId)
    if (!settings.imageSketch || !settings.imageEditing || !open) throw Error('Sketch unavailable')
    const response = await fetch(src, { signal: lifetime.signal })
    if (!response.ok) throw Error('Image unavailable')
    const blob = await response.blob()
    if (blob.size > 20 * 1024 * 1024) throw Error('Image too large')
    lifetime.signal.throwIfAborted()
    const liveOpen = sketchOpeners.get(sessionId)
    if (!liveOpen || !preference.getSnapshot().imageSketch || !preference.getSnapshot().imageEditing) throw Error('Sketch unavailable')
    imageViewer.close()
    liveOpen('sketch', document.activeElement, new File([blob], name || 'image.png', {type:blob.type || 'image/png'}))
  }
  const attachForEdit = sessionId => async (src, filename, draft, annotations = [], referenceName, sourceInDraft = false, extraFiles) => {
    // Official image tools pass their own files (possibly none) and always carry an instruction.
    const tool = Array.isArray(extraFiles)
    if (!preference.getSnapshot().imageEditing) throw new Error('Image editing is disabled')
    return withComposerSession(sessions, sessionId, async actx => {
      const response = await fetch(src, { signal: lifetime.signal })
      if (!response.ok) throw new Error('Could not read generated image')
      const blob = await response.blob()
      const files = sourceInDraft ? [] : [new File([blob], filename, { type: blob.type || 'image/png' })]
      if (annotations.length > 0) {
        const reference = await createAnnotatedImageReference(blob, annotations)
        files.push(new File([reference], referenceName, { type: 'image/png' }))
      }
      if (tool) files.push(...extraFiles)
      lifetime.signal.throwIfAborted()
      const input = conversation.input.for(actx)
      if (!preference.getSnapshot().imageEditing) throw new Error('Image editing is disabled')
      if (files.length) attachImageFiles(conversation, input, files, sessionId)
      openComposerSession(sessions, ctx.get('uiWorkspace'), sessionId)
      // Preserve text typed while the asynchronous image preparation ran.
      if (sourceInDraft && !annotations.length && !tool) return
      if (!input.state.getSnapshot().draft.trim()) input.setDraft(draft)
      else if (annotations.length || tool) {
        if (!input.state.getSnapshot().occurrences?.length) appendImagePrompt(input, draft)
        else input.notify('info', draft)
      }
    })
  }
  const nativeAttachments = () => ctx.slots.entries('conversation.input.attachments').find(entry =>
    entry.component !== ComposerImagePreviews && entry.locale === 'conversation' &&
    !entry.inject && !entry.store && !entry.children)
  const watchNativeAttachments = callback => ctx.slots.subscribe('conversation.input.attachments',callback)
  const nativeTranslate = ctx.locale.bind('conversation')
  // Use the host's attachment presentation slots; restore its own renderer when
  // enhancement is off. Intake, validation and draft ownership stay with DSH.
  for (const [name, component] of [
    ['conversation.input.attachments', ComposerImagePreviews],
    ['conversation.chat.message.images', MessageImagePreviews],
    ['conversation.chat.user.images', MessageImagePreviews],
    ['tool.call.images', MessageImagePreviews],
    ['conversation.trajectory.images', MessageImagePreviews],
  ]) ctx.slots.inject(name, () => {
    let dispose
    const sync = () => {
      if (preference.getSnapshot().imageViewer) {
        dispose ??= ctx.slots.register({ name, priority: -10,
          inject: sessionId => ({ preference, t, nativeAttachments, watchNativeAttachments, nativeTranslate, service: imageViewer, openSketchImage: openSketchImage(sessionId), attachForEdit: attachForEdit(sessionId) }),
        }, component)
      } else { dispose?.(); dispose = undefined }
    }
    sync()
    const unwatch = preference.subscribe(sync)
    return () => { unwatch(); dispose?.() }
  })
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'codex-image-workspace', order: 30,
    inject: sessionId => ({
      preference, t, sessionId, rpc, sessionState: sketchSessions.get(sessionId),
      registerOpen: callback => sketchOpeners.register(sessionId, callback),
      attachSketch: blob => {
        const current = preference.getSnapshot()
        if (!current.imageSketch || !current.imageEditing) throw new Error('Sketch editing is disabled')
        attachImageFiles(conversation, sessionInput(sessionId), [new File([blob], 'sketch-reference.png', { type: 'image/png' })], sessionId)
      },
    }),
  }, ImageWorkspace))
  const imageProps = sessionId => ({
      sessionId,
      rpc: rpc,
      t,
      preference,
      loadImage: attachment => uiConversation.imageUrl(sessionId, attachment),
      getImageViewer: () => {
        try {
          return ctx.get('nativeImageViewer')
        } catch {
          return undefined
        }
      },
      getInternalImageViewer: () => imageViewer,
      openSketchImage: openSketchImage(sessionId),
      attachForEdit: attachForEdit(sessionId),
  })
  ctx.effect(() => uiConversation.events.register(imageConversationNode), 'codex-subscription: image results in chat')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'codex-image-output', inject: imageProps,
  }, CodexImageOutput))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'codex_image_generate', locale: NS,
    inject: imageProps,
  }, CodexImageToolRow))
}
