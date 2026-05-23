import {
  fetchCachedProxyResponse,
  parseImagesFromPayload,
  readImagesPayload,
} from '../lib/api'
import { buildDevProxyResponseCacheUrl } from '../lib/devProxy'
import type { TaskRecord } from '../types'
import { storeImage } from './imageAssets'
import { updateTaskInStore } from './taskStoreUtils'

interface ProxyCacheJsonPayload {
  requestId?: string
  status?: number
  statusText?: string
  headers?: Record<string, string>
  bodyBase64?: string
}

export function findRecoverableProxyRequestId(task: TaskRecord): string | null {
  const entries = task.errorDebug?.requestLog ?? []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      entry.responseStatus === 200 &&
      typeof entry.responseRequestId === 'string' &&
      entry.responseRequestId.trim()
    ) {
      return entry.responseRequestId.trim()
    }
  }

  return null
}

export function canRecoverTaskFromProxyCache(task: TaskRecord): boolean {
  return task.status !== 'done' && findRecoverableProxyRequestId(task) !== null
}

export function getTaskProxyCacheDownloadUrl(task: TaskRecord): string | null {
  const requestId = findRecoverableProxyRequestId(task)
  return requestId ? buildDevProxyResponseCacheUrl(requestId) : null
}

function buildHeaders(input: ProxyCacheJsonPayload['headers']): Headers {
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chunkSize = 0x8000
  const estimatedLength = Math.max(0, Math.floor((base64.length * 3) / 4))
  const bytes = new Uint8Array(estimatedLength)
  let writeOffset = 0

  for (let index = 0; index < base64.length; index += chunkSize) {
    const binary = atob(base64.slice(index, index + chunkSize))
    for (let binaryIndex = 0; binaryIndex < binary.length; binaryIndex += 1) {
      bytes[writeOffset] = binary.charCodeAt(binaryIndex)
      writeOffset += 1
    }
  }

  const output = writeOffset === bytes.length ? bytes : bytes.slice(0, writeOffset)
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer
}

function buildResponseFromCacheJson(payload: ProxyCacheJsonPayload): Response {
  if (typeof payload.bodyBase64 !== 'string') {
    throw new Error('代理缓存 JSON 缺少 bodyBase64')
  }

  const headers = buildHeaders(payload.headers)
  if (payload.requestId) {
    headers.set('x-dev-proxy-request-id', payload.requestId)
  }

  return new Response(base64ToArrayBuffer(payload.bodyBase64), {
    status: payload.status ?? 200,
    statusText: payload.statusText ?? 'OK',
    headers,
  })
}

async function recoverTaskFromResponse(task: TaskRecord, response: Response): Promise<number> {
  const controller = new AbortController()
  const payload = await readImagesPayload(response)
  const images = await parseImagesFromPayload(
    payload,
    task.params.output_format === 'jpeg' ? 'image/jpeg' : `image/${task.params.output_format}`,
    controller.signal,
  )

  if (!images.length) {
    throw new Error('代理缓存响应中没有可恢复的图片')
  }

  const outputImageIds: string[] = []
  for (const image of images) {
    const imageId = await storeImage(image.blob, {
      source: 'generated',
      mimeType: image.mimeType || image.blob.type || null,
    })
    outputImageIds.push(imageId)
  }

  const finishedAt = Date.now()
  updateTaskInStore(task.id, {
    outputImages: outputImageIds,
    status: 'done',
    isAborted: false,
    error: null,
    errorDebug: null,
    finishedAt,
    elapsed: finishedAt - task.createdAt,
  })

  return outputImageIds.length
}

export async function recoverTaskFromProxyCache(task: TaskRecord): Promise<number> {
  const requestId = findRecoverableProxyRequestId(task)
  if (!requestId) {
    throw new Error('未找到可恢复的代理响应缓存 ID')
  }

  const controller = new AbortController()
  const response = await fetchCachedProxyResponse(requestId, controller.signal)
  return recoverTaskFromResponse(task, response)
}

export async function recoverTaskFromProxyCacheJson(task: TaskRecord, file: File): Promise<number> {
  const payload = JSON.parse(await file.text()) as ProxyCacheJsonPayload
  return recoverTaskFromResponse(task, buildResponseFromCacheJson(payload))
}
