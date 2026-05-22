import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, TaskRecord } from '../../types'
import { DEFAULT_SETTINGS } from '../../types'
import { callTaskImageApi } from '../taskApiRequest'
import { DEFAULT_PARAMS } from '../taskParams'

const mocks = vi.hoisted(() => ({
  callImageApi: vi.fn(),
  getRawDataUrl: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  callImageApi: mocks.callImageApi,
}))

vi.mock('../imageAssets', () => ({
  getImageView: () => ({
    getRawDataUrl: mocks.getRawDataUrl,
  }),
}))

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    taskKind: 'generation',
    providerId: null,
    providerName: 'Test Provider',
    categoryId: null,
    categoryName: null,
    deletedAt: null,
    isFavorite: false,
    parentTaskId: null,
    parentImageId: null,
    prompt: 'make it cinematic',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: ['input-1'],
    editMaskImageId: null,
    editSourceImageId: null,
    editSelection: null,
    outputImages: [],
    responseMeta: null,
    errorDebug: null,
    isAborted: false,
    status: 'running',
    error: null,
    createdAt: 1,
    finishedAt: null,
    elapsed: null,
    ...overrides,
  }
}

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    apiKey: 'sk-test',
    ...overrides,
  }
}

describe('callTaskImageApi', () => {
  beforeEach(() => {
    mocks.callImageApi.mockReset()
    mocks.getRawDataUrl.mockReset()
    mocks.callImageApi.mockResolvedValue({ images: [] })
    mocks.getRawDataUrl.mockResolvedValue('data:image/png;base64,input')
  })

  it('普通参考图直接提交给图像 API', async () => {
    await callTaskImageApi(createTask(), createSettings())

    expect(mocks.callImageApi).toHaveBeenCalledTimes(1)
    expect(mocks.callImageApi).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make it cinematic',
        inputImages: [
          {
            id: 'input-1',
            dataUrl: 'data:image/png;base64,input',
          },
        ],
        editMask: null,
      }),
    )
  })
})
