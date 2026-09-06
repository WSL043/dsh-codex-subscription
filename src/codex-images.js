import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ORIGINAL_IMAGE_SCHEMA_VERSION } from './image-original-contract.js'
import { USER_AGENT } from './version.js'

export const CODEX_IMAGE_TOOL_NAME = 'codex_image_generate'
export const CODEX_IMAGE_GENERATION_URL = 'https://chatgpt.com/backend-api/codex/images/generations'
export const CODEX_IMAGE_EDIT_URL = 'https://chatgpt.com/backend-api/codex/images/edits'

const IMAGE_MODEL = 'gpt-image-2'
const MAX_REFERENCE_IMAGES = 5
const RESPONSE_ENVELOPE_BYTES = 1024 * 1024
const IMAGE_QUALITIES = new Set(['auto', 'low', 'medium', 'high'])
const IMAGE_BACKGROUNDS = new Set(['auto', 'transparent', 'opaque'])
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FULL_ATTACHMENT_ID = /^sha256:[0-9a-f]{64}$/u
const BARE_ATTACHMENT_DIGEST = /^[0-9a-f]{64}$/iu
const PATH_LIKE_ATTACHMENT_ID = /[\\/]/u
const FILE_NAME_ATTACHMENT_ID = /\.[A-Za-z0-9]{1,16}$/u

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

export function normalizeImageOptions(args) {
  const quality = nonEmpty(args?.quality) ?? 'auto'
  const background = nonEmpty(args?.background) ?? 'auto'
  const size = nonEmpty(args?.size) ?? 'auto'
  if (!IMAGE_QUALITIES.has(quality)) throw new Error('quality must be auto, low, medium, or high')
  if (!IMAGE_BACKGROUNDS.has(background)) throw new Error('background must be auto, transparent, or opaque')
  if (size !== 'auto') {
    const match = /^(\d+)x(\d+)$/u.exec(size)
    const width = Number(match?.[1])
    const height = Number(match?.[2])
    const short = Math.min(width, height)
    const long = Math.max(width, height)
    const pixels = width * height
    if (match === null || width % 16 !== 0 || height % 16 !== 0 || long > 3840 || long > short * 3
      || pixels < 655_360 || pixels > 8_294_400) {
      throw new Error('size must be auto or a valid GPT Image 2 widthxheight resolution')
    }
  }
  return { quality, background, size }
}

function encodedLimit(decodedBytes) {
  return Math.ceil(decodedBytes / 3) * 4
}

function validBase64Body(value, end) {
  for (let index = 0; index < end; index += 1) {
    const code = value.charCodeAt(index)
    if (!((code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 43
      || code === 47)) return false
  }
  return true
}

async function readJsonWithin(response, maximumBytes) {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error('Codex image response exceeds the image size limit')
  }
  if (response.body === null) throw new Error('Codex returned an unreadable image response')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maximumBytes) {
      await reader.cancel()
      throw new Error('Codex image response exceeds the image size limit')
    }
    chunks.push(value)
  }
  const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), bytes).toString('utf8')
  try {
    return JSON.parse(body)
  } catch {
    throw new Error('Codex returned an unreadable image response')
  }
}

/** Strictly decode one PNG returned by the subscription backend. */
export function decodeCodexPng(value, maximumBytes) {
  const encoded = nonEmpty(value)
  const padding = encoded?.endsWith('==') ? 2 : encoded?.endsWith('=') ? 1 : 0
  if (encoded === undefined || encoded.length % 4 !== 0
    || !validBase64Body(encoded, encoded.length - padding)) {
    throw new Error('Codex returned an invalid base64 PNG')
  }
  const decodedBytes = (encoded.length / 4) * 3 - padding
  if (decodedBytes > maximumBytes) throw new Error('Codex image exceeds the image size limit')
  const data = Buffer.from(encoded, 'base64')
  if (data.length !== decodedBytes || data.length < PNG_SIGNATURE.length
    || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Codex returned an invalid PNG')
  }
  return new Uint8Array(data)
}

function imageReference(value) {
  const originalDimensions = record(value.originalDimensions)
    ? { width: value.originalDimensions.width, height: value.originalDimensions.height }
    : undefined
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(originalDimensions === undefined ? {} : { originalDimensions }),
  }
}

function normalizeAttachmentId(value) {
  if (typeof value !== 'string') return undefined
  if (FULL_ATTACHMENT_ID.test(value)) return value
  const bare = BARE_ATTACHMENT_DIGEST.exec(value)
  return bare === null ? undefined : `sha256:${bare[0].toLowerCase()}`
}

function invalidAttachmentId(value) {
  const attachmentId = value?.attachmentId
  if (typeof attachmentId === 'string'
    && (PATH_LIKE_ATTACHMENT_ID.test(attachmentId) || FILE_NAME_ATTACHMENT_ID.test(attachmentId))) {
    throw new Error('referenceImages attachmentId is a file path or filename; call read_image on that file and retry with its complete sha256:<64 lowercase hex> attachment reference. Do not omit referenceImages or fall back to new image generation.')
  }
  throw new Error('referenceImages attachmentId must be sha256:<64 lowercase hex> copied from an image block or read_image result. Do not omit referenceImages or fall back to new image generation.')
}

function referenceOf(value, attachments) {
  const attachmentId = normalizeAttachmentId(value?.attachmentId)
  if (attachmentId === undefined) invalidAttachmentId(value)
  if (!record(value)
    || !attachments.imageLimits.mediaTypes.includes(value.mediaType)
    || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
    || !Number.isSafeInteger(value.width) || value.width <= 0
    || !Number.isSafeInteger(value.height) || value.height <= 0
    || (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 256))
    || (value.originalDimensions !== undefined && (!record(value.originalDimensions)
      || !Number.isSafeInteger(value.originalDimensions.width) || value.originalDimensions.width <= 0
      || !Number.isSafeInteger(value.originalDimensions.height) || value.originalDimensions.height <= 0))) {
    throw new Error('referenceImages contains an invalid image reference')
  }
  return imageReference({ ...value, attachmentId })
}

function sessionImageReferences(messages) {
  const references = new Map()
  const visit = content => {
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (block?.type === 'image' && record(block.attachment)) {
        const id = normalizeAttachmentId(block.attachment.attachmentId)
        if (id !== undefined) references.set(id, block.attachment)
      } else if (block?.type === 'tool-result') visit(block.content)
    }
  }
  for (const message of messages ?? []) visit(message?.content)
  return references
}

async function editImages(values, attachments, signal, messages) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`referenceImages must contain between 1 and ${MAX_REFERENCE_IMAGES} images`)
  }
  const available = messages === undefined ? undefined : sessionImageReferences(messages)
  const references = values.map(value => {
    const id = normalizeAttachmentId(value?.attachmentId)
    if (id === undefined) invalidAttachmentId(value)
    if (available === undefined) return referenceOf(value, attachments)
    const selected = available.get(id)
    if (selected === undefined) {
      throw new Error('The selected image attachment cannot be found in the current session. Call read_image on the intended image and retry with its returned reference. Do not omit referenceImages or substitute another image.')
    }
    return referenceOf(selected, attachments)
  })
  if (new Set(references.map(value => value.attachmentId)).size !== references.length) {
    throw new Error('referenceImages must not contain duplicates')
  }
  const images = []
  let totalBytes = 0
  for (const reference of references) {
    const stored = await attachments.readImage(reference, signal)
    totalBytes += stored.data.byteLength
    if (totalBytes > attachments.imageLimits.maxMessageImageBytes) {
      throw new Error('referenceImages exceed the DSH message image limit')
    }
    images.push({
      image_url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`,
    })
  }
  return images
}

function imageContent(value) {
  const label = typeof value.size === 'string' && value.size.length > 0
    ? `Generated a ${value.size} image.`
    : 'Generated an image.'
  return [
    { type: 'text', text: value.localPath === undefined ? label : `${label}\nOriginal PNG saved on the DSH host at: ${JSON.stringify(value.localPath)}. Read this file or copy it to the workspace with a .png extension; this host path is not a browser URL.` },
    { type: 'image', attachment: imageReference(value.image) },
  ]
}

function imageOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      image: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string', required: true },
          mediaType: { type: 'string', enum: ['image/png'], required: true },
          bytes: { type: 'integer', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          name: { type: 'string' },
          originalDimensions: {
            type: 'object',
            additionalProperties: false,
            properties: {
              width: { type: 'integer', required: true },
              height: { type: 'integer', required: true },
            },
          },
        },
      },
      original: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          assetId: { type: 'string', required: true },
          mediaType: { type: 'string', enum: ['image/png'], required: true },
          bytes: { type: 'integer', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          name: { type: 'string', required: true },
          sha256: { type: 'string', required: true },
        },
      },
      background: { type: 'string' },
      localPath: { type: 'string', required: true, description: 'Absolute path to the original PNG on the DSH host.' },
      quality: { type: 'string' },
      size: { type: 'string' },
    },
  }
}

function responseMetadata(value) {
  const data = Array.isArray(value?.data) ? value.data[0] : undefined
  const encoded = record(data) ? data.b64_json : undefined
  if (typeof encoded !== 'string') throw new Error('Codex returned no image data')
  return {
    encoded,
    background: nonEmpty(value.background),
    quality: nonEmpty(value.quality),
    size: nonEmpty(value.size),
  }
}

/** Create the DSH-native image-generation tool backed only by the ChatGPT subscription. */
export function createCodexImageTool(options) {
  const fetchImage = options.fetch ?? fetch
  const attachments = options.attachments
  return defineTool({
    name: CODEX_IMAGE_TOOL_NAME,
    description: 'Create a new image or explicitly edit selected prior images using the signed-in Codex subscription. Omit referenceImages only for a completely new image. For an edit, copy each complete image reference from the session image block or read_image result, including attachmentId in the exact form sha256:<64 lowercase hex>; never use a workspace path, absolute path, or filename, and do not omit the references to turn an edit into text-to-image generation. A bare 64-character hex digest is accepted and normalized to sha256:<64 lowercase hex>. If a reference is unavailable, call read_image and retry with its returned reference. Include only the exact prior image references the user asked to edit; never assume every image in the conversation is a reference. For annotation-guided edits, include both the named clean source and its numbered location reference, and preserve the numbered coordinates and requested changes in the prompt. The location-reference markers are guidance only and must not appear in the result. If those references cannot be identified, do not substitute unrelated images or silently ignore the annotations.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'A complete, production-ready description of the image to generate.',
      },
      size: {
        type: 'string',
        description: 'Optional GPT Image 2 output size. Use auto unless the user requests an exact valid widthxheight resolution.',
      },
      quality: {
        type: 'string',
        enum: ['auto', 'low', 'medium', 'high'],
        description: 'Optional rendering quality. Use auto unless the user requests draft speed or final quality.',
      },
      background: {
        type: 'string',
        enum: ['auto', 'transparent', 'opaque'],
        description: 'Optional background mode. Request transparent only when the user needs transparency.',
      },
      referenceImages: {
        type: 'array',
        description: 'Optional explicit references to 1-5 prior images to edit. Copy each complete reference from the session image block or read_image result. Omit only for a new image; an invalid reference must be fixed and retried rather than omitted.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            attachmentId: {
              type: 'string',
              required: true,
              description: 'Copy the complete attachmentId from the image block or read_image result: sha256:<64 lowercase hex>. Never pass a workspace path, absolute path, or filename. A bare 64-character hex digest is accepted and normalized to sha256:<64 lowercase hex>.',
            },
            mediaType: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
            width: { type: 'integer', required: true },
            height: { type: 'integer', required: true },
            name: { type: 'string' },
            originalDimensions: {
              type: 'object',
              additionalProperties: false,
              properties: {
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
              },
            },
          },
        },
      },
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args, value) => imageContent(value),
      presentationMeta: (_args, value) => ({
        kind: 'codex-subscription-image',
        schemaVersion: ORIGINAL_IMAGE_SCHEMA_VERSION,
        original: value.original,
      }),
    },
    timeoutMs: 5 * 60 * 1000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const prompt = nonEmpty(args.prompt)
      if (prompt === undefined) throw new Error('prompt must be a non-empty string')
      const imageOptions = normalizeImageOptions(args)
      const auth = await options.getAuth({ signal: exec.signal })
      const credential = await options.readCredential({ signal: exec.signal })
      const access = auth?.auth?.apiKey
      const accountId = credential?.type === 'oauth' ? credential.accountId : undefined
      if (typeof access !== 'string' || access.length === 0
        || typeof accountId !== 'string' || accountId.length === 0) {
        throw new Error('ChatGPT subscription is not signed in')
      }
      if (!attachments.imageLimits.mediaTypes.includes('image/png')) {
        throw new Error('This DSH installation does not accept PNG image attachments')
      }
      const maximumBytes = Math.min(
        attachments.imageLimits.maxImageBytes,
        attachments.imageLimits.maxMessageImageBytes,
      )
      const editing = args.referenceImages !== undefined
      const sessionMessages = editing && typeof options.getSessionMessages === 'function'
        ? await options.getSessionMessages(exec.agent?.id)
        : undefined
      const images = editing
        ? await editImages(args.referenceImages, attachments, exec.signal, sessionMessages ?? (options.getSessionMessages ? [] : undefined))
        : undefined
      let response
      try {
        response = await fetchImage(editing ? CODEX_IMAGE_EDIT_URL : CODEX_IMAGE_GENERATION_URL, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${access}`,
            'chatgpt-account-id': accountId,
            accept: 'application/json',
            'content-type': 'application/json',
            originator: 'pi',
            'x-codex-image-turn-id': String(exec.callId),
            'user-agent': USER_AGENT,
          },
          body: JSON.stringify({
            ...(images === undefined ? {} : { images }),
            prompt,
            background: imageOptions.background,
            model: IMAGE_MODEL,
            quality: imageOptions.quality,
            size: imageOptions.size,
          }),
          signal: exec.signal,
        })
      } catch (error) {
        if (exec.signal.aborted) throw exec.signal.reason
        throw new Error(`Codex image ${editing ? 'edit' : 'generation'} request failed`, { cause: error })
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('ChatGPT sign-in needs to be renewed')
        }
        if (response.status === 429) throw new Error('Codex image generation quota is unavailable')
        throw new Error(`Codex image ${editing ? 'edit' : 'generation'} failed (HTTP ${response.status})`)
      }
      const value = await readJsonWithin(
        response,
        encodedLimit(maximumBytes) + RESPONSE_ENVELOPE_BYTES,
      )
      const metadata = responseMetadata(value)
      const data = decodeCodexPng(metadata.encoded, maximumBytes)
      const sessionId = exec.agent?.id
      if (sessionId === undefined) throw new Error('Codex image generation requires a session-owned tool call')
      const original = await options.originalImages.save(String(sessionId), data)
      let ref
      try {
        ref = await attachments.saveImage({
          data,
          mediaType: 'image/png',
          name: 'codex-generated.png',
        })
      } catch (error) {
        await options.originalImages.remove(original)
        throw error
      }
      const result = {
        image: imageReference(ref),
        original,
        localPath: options.originalImages.originalPath(original.assetId),
        ...(metadata.background === undefined ? {} : { background: metadata.background }),
        ...(metadata.quality === undefined ? {} : { quality: metadata.quality }),
        ...(metadata.size === undefined ? {} : { size: metadata.size }),
      }
      if (exec.parent !== undefined) {
        exec.deferContext(createUserMessage({
          content: imageContent(result),
          source: { kind: 'plugin', plugin: 'codex-subscription' },
        }))
      }
      return result
    },
  })
}
