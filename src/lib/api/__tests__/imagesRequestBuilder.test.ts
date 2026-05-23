import { describe, expect, it } from 'vitest'
import { buildImagesRequestSpec, type BuildImagesRequestSpecOptions } from '../imagesRequestBuilder'

function createOptions(
  overrides: Partial<BuildImagesRequestSpecOptions> = {},
): BuildImagesRequestSpecOptions {
  return {
    opts: {
      settings: {
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        visionModel: '',
        responsesImageModel: 'gpt-image-2',
        responsesTransport: 'auto',
        responsesImageInputMode: 'auto',
        responsesPromptRevisionMode: 'allow',
        timeout: 900,
        apiProtocol: 'images',
        requestMode: 'local_proxy',
      },
      prompt: 'make it cinematic',
      params: {
        n: 1,
        size: '1024x1024',
        quality: 'high',
        output_format: 'png',
        output_compression: null,
        moderation: 'auto',
      },
      inputImageDataUrls: ['data:image/png;base64,input'],
      editMaskDataUrl: undefined,
    },
    plan: {
      id: 'json-body-json',
      transport: 'json',
      bodyMode: 'json',
    },
    ctx: {
      controller: new AbortController(),
      requestHeaders: { Authorization: 'Bearer sk-test' },
      proxyConfig: null,
      mime: 'image/png',
      forceProxy: false,
      debugLog: [],
    },
    ...overrides,
  }
}

describe('buildImagesRequestSpec', () => {
  it('带参考图时使用 images edits 端点', async () => {
    const spec = await buildImagesRequestSpec(createOptions())

    expect(spec.requestUrl).toBe('https://api.example.com/v1/images/edits')
    expect(spec.stage).toBe('images.edit.json-body-json')
  })
})
