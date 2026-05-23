import { describe, expect, it } from 'vitest'
import { base64ToBlob } from '../imageTransforms'

describe('base64ToBlob', () => {
  it.each([
    ['typical 4k', 16 * 1024 * 1024],
    ['large 4k', 64 * 1024 * 1024],
  ])('decodes %s base64 payload to blob', async (_label, base64Length) => {
    const base64 = 'A'.repeat(base64Length)
    const blob = await base64ToBlob(base64, 'image/png')

    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe((base64Length * 3) / 4)
  })
})
