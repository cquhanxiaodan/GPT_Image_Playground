import { callImageApi } from '../lib/api'
import type { ApiInputImage, ApiImageAsset, CallApiResult } from '../lib/api'
import { describeImagesWithVision } from '../lib/api/visionToPrompt'
import { PROMPT_HARD_LIMIT } from '../lib/prompt'
import type { AppSettings, TaskRecord } from '../types'
import { getImageView } from './imageAssets'

export type TaskApiOutputImageAsset = ApiImageAsset

export interface TaskApiRequestHandlers {
  onFinalImages?: (images: TaskApiOutputImageAsset[]) => void | Promise<void>
  registerAbort?: (abort: () => void) => void
  throwIfAborted?: () => void
  onStatusMessage?: (message: string) => void
}

const ENHANCED_PROMPT_LIMIT = 1600
const BASE_PROMPT_LIMIT = PROMPT_HARD_LIMIT

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function buildEnhancedPrompt(prompt: string, imageDescriptions: string): string {
  const basePrompt = prompt.trim()
  const descriptions = imageDescriptions.trim()
  if (!descriptions) {
    return basePrompt
  }

  const nextPrompt = basePrompt
    ? `${basePrompt}\n\n参考图补充:\n${descriptions}`
    : `参考图补充:\n${descriptions}`

  if (nextPrompt.length <= ENHANCED_PROMPT_LIMIT) {
    return nextPrompt
  }

  const trimmedBasePrompt = truncateText(basePrompt, BASE_PROMPT_LIMIT)
  const descriptionBudget = Math.max(120, ENHANCED_PROMPT_LIMIT - trimmedBasePrompt.length - 16)
  const trimmedDescriptions = truncateText(descriptions, descriptionBudget)

  return trimmedBasePrompt
    ? `${trimmedBasePrompt}\n\n参考图补充:\n${trimmedDescriptions}`
    : `参考图补充:\n${trimmedDescriptions}`
}

async function loadTaskInputImages(
  task: TaskRecord,
  throwIfAborted?: () => void,
) {
  const inputImages: ApiInputImage[] = []

  for (const imageId of task.inputImageIds) {
    throwIfAborted?.()
    const dataUrl = await getImageView(imageId).getRawDataUrl()
    throwIfAborted?.()
    if (!dataUrl) {
      continue
    }

    inputImages.push({
      id: imageId,
      dataUrl,
    })
  }

  return inputImages
}

async function loadTaskEditMaskDataUrl(
  task: TaskRecord,
  throwIfAborted?: () => void,
): Promise<string | undefined> {
  if (!task.editMaskImageId) {
    return undefined
  }

  throwIfAborted?.()
  const editMaskDataUrl = await getImageView(task.editMaskImageId).getRawDataUrl()
  throwIfAborted?.()
  if (!editMaskDataUrl) {
    throw new Error('局部编辑蒙版缺失，请重新选择编辑区域后再试')
  }

  return editMaskDataUrl
}

export async function callTaskImageApi(
  task: TaskRecord,
  settings: AppSettings,
  handlers: TaskApiRequestHandlers = {},
): Promise<CallApiResult> {
  const inputImages = await loadTaskInputImages(
    task,
    handlers.throwIfAborted,
  )
  const editMaskDataUrl = await loadTaskEditMaskDataUrl(task, handlers.throwIfAborted)
  handlers.throwIfAborted?.()

  const visionModel = settings.visionModel?.trim() || 'gpt-5.4'

  if (inputImages.length > 0 && !editMaskDataUrl) {
    handlers.onStatusMessage?.('正在用视觉模型识别参考图...')
    try {
      const imageDataUrls = inputImages.map((img) => img.dataUrl)
      const imageDescriptions = await describeImagesWithVision(
        imageDataUrls,
        settings.baseUrl,
        settings.apiKey,
        visionModel,
      )
      handlers.throwIfAborted?.()

      const enhancedPrompt = buildEnhancedPrompt(task.prompt, imageDescriptions)

      return callImageApi({
        settings,
        prompt: enhancedPrompt,
        params: task.params,
        inputImages: [],
        editMask: null,
        onFinalImages: handlers.onFinalImages,
        registerAbort: handlers.registerAbort,
      })
    } catch (visionError) {
      handlers.throwIfAborted?.()
      handlers.onStatusMessage?.('视觉模型识别失败，尝试直接提交...')
    }
  }

  return callImageApi({
    settings,
    prompt: task.prompt,
    params: task.params,
    inputImages,
    editMask: editMaskDataUrl
      ? {
          dataUrl: editMaskDataUrl,
          sourceImageId: task.editSourceImageId ?? null,
          selection: task.editSelection ?? null,
        }
      : null,
    onFinalImages: handlers.onFinalImages,
    registerAbort: handlers.registerAbort,
  })
}
