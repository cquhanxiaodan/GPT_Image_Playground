import { describe, expect, it } from 'vitest'
import {
  PROMPT_COMPRESSION_TARGET,
  compressPromptText,
  preparePromptText,
} from './prompt'

describe('prompt preparation', () => {
  it('compresses long prompts into structured sections', () => {
    const sentence = '生成一张东方神话史诗场景，画面主体是十八层环形深渊。构图采用超广角俯瞰视角，前景有黑石高台。风格要庄严神秘，具有电影级史诗氛围。材质包含黑石、青铜、雾气和暗红光线。不要出现文字、Logo、水印和现代元素。'
    const prompt = sentence.repeat(16)

    const compressed = compressPromptText(prompt)

    expect(compressed.length).toBeLessThanOrEqual(PROMPT_COMPRESSION_TARGET)
    expect(compressed).toContain('主体：')
    expect(compressed).toContain('构图：')
    expect(compressed).toContain('风格：')
    expect(compressed).toContain('材质：')
    expect(compressed).toContain('限制项：')
  })

  it('marks compressed prompts during preparation', () => {
    const prompt = '主体是高端建筑室内摄影。构图为横向 16:9，空间层次清晰。风格真实高级，适合品牌首页。材质包含布料、木纹、石材和玻璃。不要出现文字、Logo 和水印。'.repeat(20)

    const prepared = preparePromptText(prompt)

    expect(prepared.compressed).toBe(true)
    expect(prepared.truncated).toBe(true)
    expect(prepared.value).toContain('主体：')
  })
})
