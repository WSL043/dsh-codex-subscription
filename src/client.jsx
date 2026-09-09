import { ComposerImagePreviews, MessageImagePreviews, IMAGE_PREVIEWS_CSS } from './client-image-previews.jsx'
import { imageConversationNode } from './image-conversation-node.js'
import { CodexImageToolRow, CodexImageOutput } from './client-images.jsx'
import { SKETCH_CSS } from './sketch-workspace.jsx'
import { ImageWorkspace } from './image-workspace.jsx'
import { attachImageFiles, appendImagePrompt } from './image-composer.js'
import { createSketchTrigger, createImageTrigger } from './sketch-trigger.js'
import { zh, en } from './client-locales.js'
import { STYLE } from './client-styles.js'
import { createAnnotatedImageReference } from './image-edit-reference.js'
import { SubscriptionImageViewerOverlay } from './subscription-image-viewer.jsx'
import { SUBSCRIPTION_IMAGE_VIEWER_CSS } from './subscription-image-viewer-styles.js'
import { SubscriptionImageViewerService } from './subscription-image-viewer.js'
import { SETTINGS_NAMESPACE } from './settings-contract.js'
import { createPreferenceController } from './preference-controller.js'
import { createAccountStatusController } from './account-status-controller.js'
import { NS, CHANNEL, unwrap } from './client-shared.js'
import { createSubscriptionRpcClient } from './rpc-contract.js'
import { CodexComposerQuota } from './client-composer-quota.jsx'
import { CodexModelSelect } from './client-model-select.jsx'
import { CodexSection } from './client-section.jsx'

export const inject = [
  'slots', 'locale', 'connection', 'remote', 'settingsScope', 'modelDirectories', 'conversation', 'uiConversation', 'sessions',
]

export function apply(ctx) {
  const imageViewer = new SubscriptionImageViewerService()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-subscription: copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-codex-subscription'
    tag.textContent = STYLE + SUBSCRIPTION_IMAGE_VIEWER_CSS + SKETCH_CSS + IMAGE_PREVIEWS_CSS
    document.head.append(tag)
    return () => tag.remove()
  }, 'codex-subscription: style')
  const rpc = createSubscriptionRpcClient(ctx.get('connection').rpc)
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
  const preference = createPreferenceController(scope, rpc)
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
    const disposeReset = ctx.on('connection/reset', () => { void preference.load(); void preference.refreshModels(); void accountStatus.reload() })
    return () => {
      disposeReset?.()
      preference.dispose()
      accountStatus.dispose()
    }
  }, 'codex-subscription: preferences and account status')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'codex-subscription-image-viewer', order: 20,
    inject: () => ({ service: imageViewer, t }),
  }, SubscriptionImageViewerOverlay))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => t('nav'), locale: NS, inject: () => ({ preference, rpc: rpc, accountStatus, t }),
  }, CodexSection))
  const sessions = ctx.get('sessions')
  const installDirectorySlots = scope => {
    const modelDirectories = scope.get('modelDirectories')
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right', id: 'codex-subscription-quota', order: 15,
      locale: NS,
      inject: sessionId => ({
        preference,
        rpc: rpc,
        t,
        directory: modelDirectories.directoryFor(sessionId).store,
      }),
    }, CodexComposerQuota))
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model', priority: -10, locale: NS,
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
  const sketchOpeners = new Map()
  ctx.inject(['inputTriggers'], triggerContext => triggerContext.effect(() => triggerContext.get('inputTriggers').registerSource(createSketchTrigger({
    enabled: () => { const value = preference.getSnapshot(); return value.imageSketch && value.imageEditing },
    open: sessionId => sketchOpeners.get(sessionId)?.(),
    consume: (sessionId, span) => {
      const actx = sessions.scope(sessionId)
      return sketchOpeners.has(sessionId) && actx?.bail(actx, 'slash/input-consume-token', { guard: { kind: 'span', span } }) === true
    },
  })), 'codex-subscription: Sketch trigger'))
  ctx.inject(['inputTriggers'], triggerContext => triggerContext.effect(() => triggerContext.get('inputTriggers').registerSource(createImageTrigger({
    enabled: () => { const value = preference.getSnapshot(); return value.imageShortcut && (value.imageGeneration || value.imageEditing) },
    open: () => {},
    consume: (sessionId, span) => {
      const actx = sessions.scope(sessionId)
      return sketchOpeners.has(sessionId) && actx?.bail(actx, 'slash/input-insert-text', { text: t('imageInlinePrompt'), span }) === true
    },
  })), 'codex-subscription: Image trigger'))
  const sessionInput = sessionId => {
    const actx = sessions.scope(sessionId)
    if (!actx || typeof conversation.createDraftImages !== 'function' || !conversation.input?.for) throw new Error('Image composer is unavailable')
    return conversation.input.for(actx)
  }
  const attachForEdit = sessionId => async (src, filename, draft, annotations = [], referenceName, sourceInDraft = false) => {
    if (!preference.getSnapshot().imageEditing) throw new Error('Image editing is disabled')
    const actx = sessions.scope(sessionId)
    if (actx === undefined || typeof conversation.createDraftImages !== 'function' || conversation.input?.for === undefined) {
      throw new Error('This DSH version does not provide the image composer bridge')
    }
    const response = await fetch(src)
    if (!response.ok) throw new Error('Could not read generated image')
    const blob = await response.blob()
    const files = sourceInDraft ? [] : [new File([blob], filename, { type: blob.type || 'image/png' })]
    if (annotations.length > 0) {
      const reference = await createAnnotatedImageReference(blob, annotations)
      files.push(new File([reference], referenceName, { type: 'image/png' }))
    }
    const input = conversation.input.for(actx)
    if (!preference.getSnapshot().imageEditing) throw new Error('Image editing is disabled')
    if (files.length) attachImageFiles(conversation, input, files)
    sessions.open(sessionId)
    // Preserve text typed while the asynchronous image preparation ran.
    if (sourceInDraft && !annotations.length) return
    if (!input.state.getSnapshot().draft.trim()) input.setDraft(draft)
    else if (annotations.length) {
      if (!input.state.getSnapshot().occurrences?.length) appendImagePrompt(input, draft)
      else input.notify('info', draft)
    }
  }
  // Use the host's attachment presentation slots; restore its own renderer when
  // enhancement is off. Intake, validation and draft ownership stay with DSH.
  for (const [name, component] of [
    ['conversation.input.attachments', ComposerImagePreviews],
    ['conversation.message.images', MessageImagePreviews],
    ['conversation.trajectory.images', MessageImagePreviews],
  ]) ctx.slots.inject(name, () => {
    let dispose
    const sync = () => {
      if (preference.getSnapshot().imageViewer) {
        dispose ??= ctx.slots.register({ name, priority: -10,
          inject: sessionId => ({ preference, t, service: imageViewer, attachForEdit: attachForEdit(sessionId) }),
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
      preference, t,
      registerOpen: callback => { sketchOpeners.set(sessionId, callback); return () => { if (sketchOpeners.get(sessionId) === callback) sketchOpeners.delete(sessionId) } },
      attachSketch: blob => {
        const current = preference.getSnapshot()
        if (!current.imageSketch || !current.imageEditing) throw new Error('Sketch editing is disabled')
        attachImageFiles(conversation, sessionInput(sessionId), [new File([blob], 'sketch-reference.png', { type: 'image/png' })])
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
