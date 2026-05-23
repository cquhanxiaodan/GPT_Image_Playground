import {
  buildApiErrorFromResponse,
  createDebugRequestLogEntry,
  isSseResponse,
  readDevProxyRequestId,
  sanitizeDebugValue,
} from './debug'
import { createApiError, emitFinalImages } from './imageTransforms'
import {
  buildTaskResponseMetaFromCalls,
  collectImageGenerationCallsFromPayload,
  parseImagesFromPayload,
} from './imagePayload'
import { readImagesPayload } from './payloadText'
import { fetchCachedProxyResponse } from './proxyResponseRecovery'
import { createImagesPlanner, mergeTaskResponseTransportMeta } from './requestPlanner'
import { buildImagesRequestSpec } from './imagesRequestBuilder'
import { readImagesPayloadStream } from './sseReader'
import type {
  AppliedTransportMeta,
} from '../../types'
import type {
  ApiImageAsset,
  ApiDebugRequestLogEntry,
  ApiError,
  CallApiOptions,
  CallApiResult,
  SharedRequestContext,
} from './types'

async function recoverImagesPayloadFromProxyCache(
  requestId: string | undefined,
  ctx: SharedRequestContext,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown | null> {
  if (!requestId || !ctx.forceProxy) {
    return null
  }

  const cachedResponse = await fetchCachedProxyResponse(requestId, ctx.controller.signal)
  return await readImagesPayload(cachedResponse, logEntry)
}

async function buildImagesApiResultFromPayload(
  payload: unknown,
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  transportMeta: AppliedTransportMeta,
  actualTransport: 'json' | 'stream',
  streamedImages: ApiImageAsset[],
  responseStatus: number,
  requestId: string | undefined,
  debugLogEntry?: ApiDebugRequestLogEntry,
): Promise<CallApiResult> {
  const responseMetaFromCalls = buildTaskResponseMetaFromCalls(
    collectImageGenerationCallsFromPayload(payload),
  )
  const images: ApiImageAsset[] =
    actualTransport === 'stream' && streamedImages.length > 0
      ? streamedImages
      : await parseImagesFromPayload(payload, ctx.mime, ctx.controller.signal)
  if (!images.length) {
    if (debugLogEntry) {
      debugLogEntry.responseBody = sanitizeDebugValue(payload)
    }
    throw createApiError('接口未返回可用图片数据', responseStatus, {
      requestId,
      details: {
        responseBody: payload,
      },
    })
  }

  await emitFinalImages(opts, images)
  return {
    images,
    responseMeta: mergeTaskResponseTransportMeta(
      responseMetaFromCalls,
      transportMeta,
    ),
  }
}

async function tryBuildImagesApiResultFromProxyCache(
  requestId: string | undefined,
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  transportMeta: AppliedTransportMeta | undefined,
  responseStatus: number | undefined,
  debugLogEntry?: ApiDebugRequestLogEntry,
): Promise<CallApiResult | null> {
  if (!requestId || !transportMeta) {
    return null
  }

  const recoveredPayload = await recoverImagesPayloadFromProxyCache(
    requestId,
    ctx,
    debugLogEntry,
  )
  if (recoveredPayload == null) {
    return null
  }

  try {
    return await buildImagesApiResultFromPayload(
      recoveredPayload,
      opts,
      ctx,
      transportMeta,
      'json',
      [],
      responseStatus ?? 200,
      requestId,
      debugLogEntry,
    )
  } catch {
    return null
  }
}

function normalizeImagesEditCompatibilityError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error
  }

  if (!/failed to parse multipart form|\/backend-api\/files failed|bad_response_body/i.test(error.message)) {
    return error
  }

  const apiError = error as ApiError
  return createApiError(
    '当前供应商的 /v1/images/edits 兼容性不足，看起来只支持 /v1/images/generations，或其内部文件上传链路被拦截。请优先改用 Responses 协议做参考图编辑，或更换为明确支持 /images/edits 的供应商。',
    apiError.status,
    {
      requestId: apiError.requestId,
      details: apiError.details,
    },
  )
}

export async function callImagesApi(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
): Promise<CallApiResult> {
  const { settings, inputImageDataUrls } = opts
  const isEdit = inputImageDataUrls.length > 0
  const planner = createImagesPlanner(settings, { isEdit })
  let previousRecoverableRequestId: string | undefined
  let previousRecoveryMeta: AppliedTransportMeta | undefined
  let previousRecoveryStatus: number | undefined
  let previousRecoveryLogEntry: ApiDebugRequestLogEntry | undefined

  while (true) {
    const plan = planner.currentPlan
    let debugLogEntry: ApiDebugRequestLogEntry | undefined

    try {
      let actualTransport: 'json' | 'stream' = 'json'
      const requestSpec = await buildImagesRequestSpec({ opts, plan, ctx })
      debugLogEntry = createDebugRequestLogEntry(
        ctx,
        requestSpec.stage,
        'POST',
        requestSpec.requestUrl,
        requestSpec.debugBody,
      )
      const response = await fetch(requestSpec.requestUrl, requestSpec.requestInit)

      if (!response.ok) {
        throw await buildApiErrorFromResponse(response, debugLogEntry)
      }

      const requestId = readDevProxyRequestId(response.headers)
      const shouldReadAsStream = plan.transport === 'stream' || isSseResponse(response)
      const shouldReadStreamAsFullBody = ctx.forceProxy && shouldReadAsStream
      if (requestId) {
        previousRecoverableRequestId = requestId
        previousRecoveryMeta = planner.completeSuccess(shouldReadAsStream ? 'stream' : 'json')
        previousRecoveryLogEntry = debugLogEntry
        previousRecoveryStatus = response.status
      }
      const streamResult =
        shouldReadAsStream && !shouldReadStreamAsFullBody
          ? await readImagesPayloadStream(
              response,
              ctx.mime,
              ctx.controller.signal,
              debugLogEntry,
            )
          : null
      let payload: unknown
      let usedRecoveredPayload = false
      try {
        payload = streamResult?.payload ?? (await readImagesPayload(response, debugLogEntry))
      } catch (parseError) {
        const recoveredPayload = await recoverImagesPayloadFromProxyCache(requestId, ctx, debugLogEntry)
        if (recoveredPayload == null) {
          throw parseError
        }
        payload = recoveredPayload
        usedRecoveredPayload = true
      }
      const streamedImages = streamResult?.streamedImages ?? []
      actualTransport = streamResult?.actualTransport ?? (shouldReadAsStream ? 'stream' : 'json')
      const plannerMeta = planner.completeSuccess(actualTransport)
      if (requestId) {
        previousRecoveryMeta = plannerMeta
      }
      try {
        return await buildImagesApiResultFromPayload(
          payload,
          opts,
          ctx,
          plannerMeta,
          actualTransport,
          streamedImages,
          response.status,
          requestId,
          debugLogEntry,
        )
      } catch (resultError) {
        if (usedRecoveredPayload || actualTransport === 'stream') {
          throw resultError
        }

        const recoveredPayload = await recoverImagesPayloadFromProxyCache(requestId, ctx, debugLogEntry)
        if (recoveredPayload == null) {
          throw resultError
        }
        return await buildImagesApiResultFromPayload(
          recoveredPayload,
          opts,
          ctx,
          plannerMeta,
          'json',
          [],
          response.status,
          requestId,
          debugLogEntry,
        )
      }
    } catch (error) {
      const recoveredResult = await tryBuildImagesApiResultFromProxyCache(
        previousRecoverableRequestId,
        opts,
        ctx,
        previousRecoveryMeta,
        previousRecoveryStatus,
        previousRecoveryLogEntry,
      )
      if (recoveredResult) {
        return recoveredResult
      }

      if (!planner.failAndAdvance(error)) {
        throw isEdit ? normalizeImagesEditCompatibilityError(error) : error
      }
    }
  }
}
