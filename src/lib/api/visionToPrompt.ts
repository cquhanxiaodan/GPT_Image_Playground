import { buildApiUrl, normalizeProxyTargetBaseUrl, readClientDevProxyConfig } from '../devProxy'

const MAX_IMAGE_DIMENSION = 1024
const JPEG_QUALITY = 0.8
const VISION_MAX_TOKENS = 220
const SINGLE_DESCRIPTION_CHAR_LIMIT = 240
const TOTAL_DESCRIPTION_CHAR_LIMIT = 420
const VISION_SYSTEM_PROMPT = `Describe this image for AI image generation in one compact paragraph. Focus on subject, composition, clothing or objects, style, lighting, colors, and the most important visual details. Keep it useful but tightly bounded, and avoid repetition or long prose. Write in the same language as the user's prompt.`

function normalizeDescriptionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function compressImageToDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.onerror = () => reject(new Error('Failed to load image for compression'))
    img.src = dataUrl
  })
}

export async function describeImageWithVision(
  imageDataUrl: string,
  baseUrl: string,
  apiKey: string,
  visionModel: string,
  signal?: AbortSignal,
): Promise<string> {
  const proxyConfig = readClientDevProxyConfig()
  const requestUrl = buildApiUrl(baseUrl, 'chat/completions', proxyConfig)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  if (proxyConfig?.enabled && proxyConfig.forwardTargetHeader !== false) {
    const proxyTarget = normalizeProxyTargetBaseUrl(baseUrl)
    if (proxyTarget) {
      headers['X-Dev-Proxy-Target'] = proxyTarget
    }
  }

  const compressedDataUrl = await compressImageToDataUrl(imageDataUrl)

  const body = {
    model: visionModel,
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image in detail for image generation purposes.' },
          { type: 'image_url', image_url: { url: compressedDataUrl } },
        ],
      },
    ],
    max_tokens: VISION_MAX_TOKENS,
  }

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Vision API error: HTTP ${response.status}${text ? ` - ${text.slice(0, 200)}` : ''}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Vision API returned empty response')
  }

  return truncateText(normalizeDescriptionText(content), SINGLE_DESCRIPTION_CHAR_LIMIT)
}

export async function describeImagesWithVision(
  imageDataUrls: string[],
  baseUrl: string,
  apiKey: string,
  visionModel: string,
  signal?: AbortSignal,
): Promise<string> {
  const descriptions: string[] = []

  for (let i = 0; i < imageDataUrls.length; i++) {
    const description = await describeImageWithVision(
      imageDataUrls[i],
      baseUrl,
      apiKey,
      visionModel,
      signal,
    )
    descriptions.push(`[参考图${imageDataUrls.length > 1 ? i + 1 : ''}]: ${description}`)
  }

  return truncateText(descriptions.join('\n'), TOTAL_DESCRIPTION_CHAR_LIMIT)
}
