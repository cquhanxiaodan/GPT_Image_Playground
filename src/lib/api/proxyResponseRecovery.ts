import { buildDevProxyResponseCacheUrl } from '../devProxy'
import { createApiError } from './imageTransforms'

interface CachedProxyResponsePayload {
  requestId?: string
  status?: number
  statusText?: string
  headers?: Record<string, string>
  bodyBase64?: string
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function buildHeaders(input: CachedProxyResponsePayload['headers']): Headers {
  const headers = new Headers()
  if (!input) {
    return headers
  }

  for (const [name, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      headers.set(name, value)
    }
  }
  return headers
}

export async function fetchCachedProxyResponse(requestId: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(buildDevProxyResponseCacheUrl(requestId), {
    method: 'GET',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    throw createApiError(`代理响应缓存读取失败：HTTP ${response.status}`, response.status)
  }

  const payload = (await response.json()) as CachedProxyResponsePayload
  if (typeof payload.bodyBase64 !== 'string') {
    throw createApiError('代理响应缓存格式无效')
  }

  const headers = buildHeaders(payload.headers)
  if (payload.requestId) {
    headers.set('x-dev-proxy-request-id', payload.requestId)
  }
  const bytes = base64ToBytes(payload.bodyBase64)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Response(body, {
    status: payload.status ?? 200,
    statusText: payload.statusText ?? 'OK',
    headers,
  })
}
