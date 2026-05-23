import { ensureImageAssetUrl } from '../store/imageAssets'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface DownloadImagesResult {
  successCount: number
  failCount: number
}

export function formatDownloadTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

function getBlobExtension(blob: Blob): string {
  return MIME_EXTENSIONS[blob.type.toLowerCase()] ?? blob.type.split('/')[1] ?? 'png'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function getImageBlob(imageIdOrUrl: string): Promise<Blob> {
  let imageUrl = imageIdOrUrl
  if (!/^data:|^https?:\/\//i.test(imageUrl)) {
    imageUrl = await ensureImageAssetUrl(imageUrl) ?? imageUrl
  }

  const response = await fetch(imageUrl)
  if (!response.ok && !imageUrl.startsWith('data:')) {
    throw new Error(`读取图片失败：${imageIdOrUrl}`)
  }

  return await response.blob()
}

export async function downloadImages(
  imageIdsOrUrls: string[],
  fileNameBase = `gpt-image-${formatDownloadTimestamp()}`,
): Promise<DownloadImagesResult> {
  let successCount = 0
  let failCount = 0
  const multiple = imageIdsOrUrls.length > 1

  for (let index = 0; index < imageIdsOrUrls.length; index += 1) {
    try {
      const blob = await getImageBlob(imageIdsOrUrls[index])
      const order = String(index + 1).padStart(2, '0')
      const fileName = multiple
        ? `${fileNameBase}-${order}.${getBlobExtension(blob)}`
        : `${fileNameBase}.${getBlobExtension(blob)}`
      triggerDownload(blob, fileName)
      successCount += 1
      if (multiple) {
        await delay(100)
      }
    } catch (error) {
      console.error(error)
      failCount += 1
    }
  }

  return { successCount, failCount }
}
