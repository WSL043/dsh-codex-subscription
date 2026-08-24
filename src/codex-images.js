import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { USER_AGENT } from './version.js'

export const CODEX_IMAGE_TOOL_NAME = 'codex_image_generate'
export const CODEX_IMAGE_GENERATION_URL = 'https://chatgpt.com/backend-api/codex/images/generations'

const IMAGE_MODEL = 'gpt-image-2'
const RESPONSE_ENVELOPE_BYTES = 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

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
    description: 'Generate an image from a detailed description using the signed-in Codex subscription. Use this whenever the user asks to create an image.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'A complete, production-ready description of the image to generate.',
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
      let response
      try {
        response = await fetchImage(CODEX_IMAGE_GENERATION_URL, {
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
            prompt,
            background: 'auto',
            model: IMAGE_MODEL,
            quality: 'auto',
            size: 'auto',
          }),
          signal: exec.signal,
        })
      } catch (error) {
        if (exec.signal.aborted) throw exec.signal.reason
        throw new Error('Codex image generation request failed', { cause: error })
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('ChatGPT sign-in needs to be renewed')
        }
        if (response.status === 429) throw new Error('Codex image generation quota is unavailable')
        throw new Error(`Codex image generation failed (HTTP ${response.status})`)
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
