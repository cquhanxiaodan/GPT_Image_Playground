import { describe, expect, it } from 'vitest'
import { base64ToBlob, getDataUrlByteSize } from '../imageTransforms'

describe('base64ToBlob', () => {
  it.each([
    ['typical 4k', 16 * 1024 * 1024],
    ['large 4k', 64 * 1024 * 1024],
  ])('decodes %s base64 payload to blob', async (_label, base64Length) => {
    const base64 = 'A'.repeat(base64Length)
    const blob = await base64ToBlob(base64, 'image/png')

    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe((base64Length * 3) / 4)
  }, 30_000)

  it('rejects invalid large base64 payloads without regex stack pressure', async () => {
    const base64 = `${'A'.repeat(16 * 1024 * 1024 - 1)}?===`

    await expect(base64ToBlob(base64, 'image/png')).rejects.toThrow('图片 base64 数据格式无效')
  }, 30_000)

  it('normalizes large base64 payloads with whitespace without regex stack pressure', async () => {
    const base64 = `\n${'A'.repeat(8 * 1024 * 1024)}\n${'A'.repeat(8 * 1024 * 1024)}\n`
    const blob = await base64ToBlob(base64, 'image/png')

    expect(blob.size).toBe(12 * 1024 * 1024)
  }, 30_000)

  it('measures large data urls without splitting the whole payload', () => {
    const base64 = 'A'.repeat(16 * 1024 * 1024)

    expect(getDataUrlByteSize(`data:image/png;base64,${base64}`)).toBe(12 * 1024 * 1024)
  })
})
