import { describe, expect, it } from 'vitest'
import { parseImagesPayloadText } from '../payloadText'

describe('parseImagesPayloadText', () => {
  it('extracts large images json payload without full payload traversal', () => {
    const largeBase64 = 'A'.repeat(2 * 1024 * 1024 + 16)
    const payloadText = JSON.stringify({
      created: 1779496363,
      data: [
        {
          b64_json: largeBase64,
          output_format: 'png',
          revised_prompt: 'revised prompt',
        },
      ],
    })

    const payload = parseImagesPayloadText(payloadText, 200, 'request-1') as {
      data: Array<{
        b64_json?: string
        output_format?: string
        revised_prompt?: string
      }>
    }

    expect(payload.data).toHaveLength(1)
    expect(payload.data[0].b64_json).toBe(largeBase64)
    expect(payload.data[0].output_format).toBe('png')
    expect(payload.data[0].revised_prompt).toBe('revised prompt')
  })
})
