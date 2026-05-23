import {
  fetchCachedProxyResponse,
  parseImagesFromPayload,
  readImagesPayload,
} from '../lib/api'
import type { TaskRecord } from '../types'
import { storeImage } from './imageAssets'
import { updateTaskInStore } from './taskStoreUtils'

function findRecoverableProxyRequestId(task: TaskRecord): string | null {
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

export async function recoverTaskFromProxyCache(task: TaskRecord): Promise<number> {
  const requestId = findRecoverableProxyRequestId(task)
  if (!requestId) {
    throw new Error('未找到可恢复的代理响应缓存 ID')
  }

  const controller = new AbortController()
  const response = await fetchCachedProxyResponse(requestId, controller.signal)
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
