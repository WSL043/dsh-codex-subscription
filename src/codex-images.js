import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
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
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(value.name === undefined ? {} : { name: value.name }),
  }
}

function referenceOf(value, attachments) {
  if (!record(value)
    || typeof value.attachmentId !== 'string' || value.attachmentId.length === 0 || value.attachmentId.length > 256
    || !attachments.imageLimits.mediaTypes.includes(value.mediaType)
    || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
    || !Number.isSafeInteger(value.width) || value.width <= 0
    || !Number.isSafeInteger(value.height) || value.height <= 0
    || (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 256))) {
    throw new Error('referenceImages contains an invalid image reference')
  }
  return imageReference(value)
}

async function editImages(values, attachments, signal) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`referenceImages must contain between 1 and ${MAX_REFERENCE_IMAGES} images`)
  }
  const references = values.map(value => referenceOf(value, attachments))
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
    { type: 'text', text: label },
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
        },
      },
      background: { type: 'string' },
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
    description: 'Create a new image or explicitly edit selected prior images using the signed-in Codex subscription. Omit referenceImages for a completely new image. Include only the exact prior image references the user asked to edit; never assume every image in the conversation is a reference.',
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
        description: 'Optional explicit references to 1-5 prior images to edit. Omit for a new image.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            attachmentId: { type: 'string', required: true },
            mediaType: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
            width: { type: 'integer', required: true },
            height: { type: 'integer', required: true },
            name: { type: 'string' },
          },
        },
      },
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args, value) => imageContent(value),
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
      const images = editing
        ? await editImages(args.referenceImages, attachments, exec.signal)
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
      const ref = await attachments.saveImage({
        data,
        mediaType: 'image/png',
        name: 'codex-generated.png',
      })
      const result = {
        image: imageReference(ref),
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
