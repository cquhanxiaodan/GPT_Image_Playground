import { normalizeImageSize } from '../lib/size'
import type { TaskParams } from '../types'

const MAX_OUTPUT_IMAGES = 10

export const DEFAULT_PARAMS: TaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
}

export function resolveTaskParamSizeOrDefault(size: string): string {
  return normalizeImageSize(size) || DEFAULT_PARAMS.size
}

export function normalizeTaskParams(params: TaskParams): TaskParams {
  return {
    ...params,
    size: resolveTaskParamSizeOrDefault(params.size),
    n: Math.min(MAX_OUTPUT_IMAGES, Math.max(1, Number.isFinite(params.n) ? Math.trunc(params.n) : DEFAULT_PARAMS.n)),
    output_compression: params.output_format === 'png' ? DEFAULT_PARAMS.output_compression : params.output_compression,
  }
}

export function getChangedTaskParams(current: TaskParams, next: TaskParams): Partial<TaskParams> {
  const patch: Partial<TaskParams> = {}
  for (const key of Object.keys(next) as Array<keyof TaskParams>) {
    if (current[key] !== next[key]) {
      ;(patch as Record<keyof TaskParams, TaskParams[keyof TaskParams]>)[key] = next[key]
    }
  }
  return patch
}
