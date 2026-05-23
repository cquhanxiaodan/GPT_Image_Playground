export const PROMPT_SOFT_LIMIT = 4000
export const PROMPT_HARD_LIMIT = 5000
export const PROMPT_COMPRESSION_THRESHOLD = 1200
export const PROMPT_COMPRESSION_TARGET = 1100

const PROMPT_SECTION_LABELS = ['主体', '构图', '风格', '材质', '限制项'] as const

type PromptSectionLabel = typeof PROMPT_SECTION_LABELS[number]

type PromptSections = Record<PromptSectionLabel, string[]>

export function normalizePromptText(prompt: string): string {
  return prompt.trim()
}

export function truncatePromptText(prompt: string, maxChars = PROMPT_HARD_LIMIT): string {
  if (prompt.length <= maxChars) {
    return prompt
  }

  return `${prompt.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function createEmptyPromptSections(): PromptSections {
  return {
    主体: [],
    构图: [],
    风格: [],
    材质: [],
    限制项: [],
  }
}

function splitPromptSentences(prompt: string): string[] {
  return (prompt.replace(/\s+/g, ' ').match(/[^。！？；;.!?]+[。！？；;.!?]?/g) ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolvePromptSection(sentence: string): PromptSectionLabel {
  if (/不要|避免|禁止|不能|无水印|logo|Logo|文字|二维码|低俗|血腥|现代|科幻|卡通|Q版|过度|廉价/i.test(sentence)) {
    return '限制项'
  }
  if (/构图|视角|镜头|画面|前景|中景|远景|横向|纵向|16:9|1:1|主体|居中|俯瞰|透视/.test(sentence)) {
    return '构图'
  }
  if (/材质|纹理|石材|木纹|玻璃|金属|青铜|布料|纤维|反光|锈蚀|雾气|光线|阴影/.test(sentence)) {
    return '材质'
  }
  if (/风格|氛围|电影|史诗|写实|奇幻|高级|神秘|庄严|肃穆|商业|概念艺术|海报/.test(sentence)) {
    return '风格'
  }
  return '主体'
}

function pushPromptSection(sections: PromptSections, sentence: string): void {
  const section = resolvePromptSection(sentence)
  if (sections[section].length >= 4) {
    return
  }
  sections[section].push(sentence.replace(/[。！？；;.!?]+$/, ''))
}

function compactSectionText(items: string[], fallback: string, maxChars: number): string {
  const text = (items.length ? items : [fallback]).join('；')
  return truncatePromptText(text, maxChars).replace(/…$/, '')
}

export function compressPromptText(prompt: string, targetChars = PROMPT_COMPRESSION_TARGET): string {
  const normalized = normalizePromptText(prompt)
  if (normalized.length <= PROMPT_COMPRESSION_THRESHOLD) {
    return normalized
  }

  const sections = createEmptyPromptSections()
  for (const sentence of splitPromptSentences(normalized)) {
    pushPromptSection(sections, sentence)
  }

  const perSectionLimit = Math.max(120, Math.floor((targetChars - 40) / PROMPT_SECTION_LABELS.length))
  const compressed = [
    `主体：${compactSectionText(sections.主体, '保留原始主题与核心对象', perSectionLimit)}`,
    `构图：${compactSectionText(sections.构图, '画面层次清晰，主体明确，适合当前比例', perSectionLimit)}`,
    `风格：${compactSectionText(sections.风格, '保持高质量写实视觉与统一氛围', perSectionLimit)}`,
    `材质：${compactSectionText(sections.材质, '强化真实材质、光影、纹理和空间细节', perSectionLimit)}`,
    `限制项：${compactSectionText(sections.限制项, '不要出现文字、Logo、水印、低质量伪影和无关元素', perSectionLimit)}`,
  ].join('\n')

  return truncatePromptText(compressed, targetChars)
}

export function preparePromptText(prompt: string): { value: string; truncated: boolean; compressed: boolean } {
  const normalized = normalizePromptText(prompt)
  const compressedValue = compressPromptText(normalized)
  const value = truncatePromptText(compressedValue)
  return {
    value,
    truncated: value.length < normalized.length,
    compressed: compressedValue.length < normalized.length,
  }
}
