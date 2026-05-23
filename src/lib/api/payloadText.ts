import { isRecord } from '../guards'
import {
  attachDebugResponseMeta,
  sanitizeDebugValue,
  summarizeDebugString,
} from './debug'
import { extractErrorMessage } from './errors'
import { createApiError } from './imageTransforms'
import {
  buildCompactResponsesPayload,
  hasDirectImagePayload,
  isCompletedImagesPayload,
  isImagesFailurePayload,
} from './payloadFacts'
import { parseSseEvents, tryParseJson } from './sse'
import type { ApiDebugRequestLogEntry } from './types'

const LARGE_IMAGES_PAYLOAD_TEXT_LENGTH = 2 * 1024 * 1024

function compactResponsesPayloadIfNeeded(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload
  }

  if (payload.type === 'response.completed' && isRecord(payload.response)) {
    return buildCompactResponsesPayload(payload.response)
  }

  if (Array.isArray(payload.output)) {
    return buildCompactResponsesPayload(payload)
  }

  return payload
}

function readJsonStringField(text: string, fieldName: string): string | undefined {
  const keyMarker = `"${fieldName}"`
  const markerIndex = text.indexOf(keyMarker)
  if (markerIndex < 0) {
    return undefined
  }

  let valueStart = markerIndex + keyMarker.length
  while (valueStart < text.length && /\s/.test(text[valueStart])) {
    valueStart += 1
  }
  if (text[valueStart] !== ':') {
    return undefined
  }

  valueStart += 1
  while (valueStart < text.length && /\s/.test(text[valueStart])) {
    valueStart += 1
  }
  if (text[valueStart] !== '"') {
    return undefined
  }

  const stringStart = valueStart
  valueStart += 1
  const nextQuoteIndex = text.indexOf('"', valueStart)
  const nextEscapeIndex = text.indexOf('\\', valueStart)
  if (nextQuoteIndex >= 0 && (nextEscapeIndex < 0 || nextEscapeIndex > nextQuoteIndex)) {
    return text.slice(valueStart, nextQuoteIndex)
  }

  let index = valueStart
  let escaped = false
  let hasEscapes = false

  while (index < text.length) {
    const char = text[index]
    if (escaped) {
      escaped = false
      index += 1
      continue
    }

    if (char === '\\') {
      escaped = true
      hasEscapes = true
      index += 1
      continue
    }

    if (char === '"') {
      return hasEscapes
        ? JSON.parse(text.slice(stringStart, index + 1)) as string
        : text.slice(valueStart, index)
    }

    index += 1
  }

  return undefined
}

function parseLargeImagesPayloadText(text: string, logEntry?: ApiDebugRequestLogEntry): unknown | undefined {
  if (text.length < LARGE_IMAGES_PAYLOAD_TEXT_LENGTH) {
    return undefined
  }

  const b64Json = readJsonStringField(text, 'b64_json')
  const result = b64Json ? undefined : readJsonStringField(text, 'result')
  const imagePayload = b64Json
    ? { b64_json: b64Json }
    : result
      ? { result }
      : null
  if (!imagePayload) {
    return undefined
  }

  const payload = {
    data: [
      {
        ...imagePayload,
        output_format: readJsonStringField(text, 'output_format') ?? undefined,
        revised_prompt: readJsonStringField(text, 'revised_prompt') ?? undefined,
      },
    ],
  }

  if (logEntry) {
    logEntry.responseBody = sanitizeDebugValue(payload)
  }
  return payload
}

export function parseResponsesPayloadText(
  text: string,
  responseStatus: number,
  requestId: string | undefined,
  logEntry?: ApiDebugRequestLogEntry,
): unknown {
  const directJson = tryParseJson(text)
  if (directJson !== undefined) {
    const normalizedPayload = compactResponsesPayloadIfNeeded(directJson)
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(normalizedPayload)
    }
    return normalizedPayload
  }

  const sseEvents = parseSseEvents(text)
  if (!sseEvents.length) {
    if (logEntry && text.trim()) {
      logEntry.responseText = summarizeDebugString(text)
    }
    throw createApiError('Responses API 返回了非 JSON 响应，且不是可解析的 SSE 数据', responseStatus, {
      requestId,
      details: text.trim() ? { responseText: text } : undefined,
    })
  }

  const jsonPayloads = sseEvents
    .map((event) => event.json)
    .filter((payload): payload is Record<string, unknown> => isRecord(payload))
  const outputItems = jsonPayloads
    .filter((payload) => payload.type === 'response.output_item.done' && isRecord(payload.item))
    .map((payload) => payload.item as Record<string, unknown>)

  const failedPayload = [...jsonPayloads].reverse().find((payload) => {
    if (payload.type === 'response.failed') {
      return true
    }
    const nestedResponse = payload.response
    return isRecord(nestedResponse) && nestedResponse.status === 'failed'
  })

  if (failedPayload) {
    const nestedResponse = isRecord(failedPayload.response) ? failedPayload.response : null
    const message =
      extractErrorMessage(failedPayload) ||
      (nestedResponse ? extractErrorMessage(nestedResponse) : null) ||
      'Responses API 处理失败'
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(failedPayload)
    }
    throw createApiError(message, responseStatus, {
      requestId,
      details: {
        responseBody: failedPayload,
      },
    })
  }

  const completedPayload = [...jsonPayloads].reverse().find(
    (payload) => payload.type === 'response.completed' && isRecord(payload.response),
  )
  if (completedPayload && isRecord(completedPayload.response)) {
    const completedResponse = completedPayload.response as Record<string, unknown>
    const existingOutput = Array.isArray(completedResponse.output) ? completedResponse.output : []
    const normalizedOutput = outputItems.length > 0 ? outputItems : existingOutput
    const compactResponse = buildCompactResponsesPayload(completedResponse, normalizedOutput)
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(compactResponse)
    }
    return compactResponse
  }

  if (outputItems.length > 0) {
    return {
      output: outputItems,
    }
  }

  const lastJsonPayload = [...jsonPayloads].reverse().find(Boolean)
  if (lastJsonPayload) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(lastJsonPayload)
    }
    return lastJsonPayload
  }

  if (logEntry && text.trim()) {
    logEntry.responseText = summarizeDebugString(text)
  }
  throw createApiError('Responses API 返回了 SSE，但未包含可解析的 JSON 事件', responseStatus, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

export function parseImagesPayloadText(
  text: string,
  responseStatus: number,
  requestId: string | undefined,
  logEntry?: ApiDebugRequestLogEntry,
): unknown {
  const largePayload = parseLargeImagesPayloadText(text, logEntry)
  if (largePayload !== undefined) {
    return largePayload
  }

  const directJson = tryParseJson(text)
  if (directJson !== undefined) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(directJson)
    }
    return directJson
  }

  const sseEvents = parseSseEvents(text)
  if (!sseEvents.length) {
    if (logEntry && text.trim()) {
      logEntry.responseText = summarizeDebugString(text)
    }
    throw createApiError('Images API 返回了非 JSON 响应，且不是可解析的 SSE 数据', responseStatus, {
      requestId,
      details: text.trim() ? { responseText: text } : undefined,
    })
  }

  const jsonPayloads = sseEvents
    .map((event) => event.json)
    .filter((payload): payload is Record<string, unknown> => isRecord(payload))

  const failedPayload = [...jsonPayloads].reverse().find((payload) => isImagesFailurePayload(payload))
  if (failedPayload) {
    const message = extractErrorMessage(failedPayload) || 'Images API 处理失败'
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(failedPayload)
    }
    throw createApiError(message, responseStatus, {
      requestId,
      details: {
        responseBody: failedPayload,
      },
    })
  }

  const completedItems = jsonPayloads.filter((payload) => isCompletedImagesPayload(payload))
  if (completedItems.length > 0) {
    const completedPayload = { data: completedItems }
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(completedPayload)
    }
    return completedPayload
  }

  const standaloneImages = jsonPayloads.filter(
    (payload) => payload.type == null && hasDirectImagePayload(payload),
  )
  if (standaloneImages.length > 0) {
    const standalonePayload = { data: standaloneImages }
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(standalonePayload)
    }
    return standalonePayload
  }

  const lastJsonPayload = [...jsonPayloads].reverse().find(Boolean)
  if (lastJsonPayload) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(lastJsonPayload)
    }
    return lastJsonPayload
  }

  if (logEntry && text.trim()) {
    logEntry.responseText = summarizeDebugString(text)
  }
  throw createApiError('Images API 返回了 SSE，但未包含可解析的 JSON 事件', responseStatus, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

export async function readResponsesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
  return parseResponsesPayloadText(text, response.status, requestId, logEntry)
}

export async function readImagesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
  return parseImagesPayloadText(text, response.status, requestId, logEntry)
}
