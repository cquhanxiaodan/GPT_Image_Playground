import { describe, expect, it } from 'vitest'
import { sanitizeDebugValue } from '../debug'

describe('sanitizeDebugValue', () => {
  it('summarizes image payload fields by key without scanning large base64 strings', () => {
    const payload = {
      data: [
        {
          b64_json: 'A'.repeat(16 * 1024 * 1024),
          output_format: 'png',
        },
      ],
    }

    const sanitized = sanitizeDebugValue(payload) as {
      data: Array<{
        b64_json?: string
        output_format?: string
      }>
    }

    expect(sanitized.data[0].b64_json).toBe('[base64 length=16777216]')
    expect(sanitized.data[0].output_format).toBe('png')
  })
})
