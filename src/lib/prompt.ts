export const PROMPT_SOFT_LIMIT = 4000
export const PROMPT_HARD_LIMIT = 5000

export function normalizePromptText(prompt: string): string {
  return prompt.trim()
}

export function truncatePromptText(prompt: string, maxChars = PROMPT_HARD_LIMIT): string {
  if (prompt.length <= maxChars) {
    return prompt
  }

  return `${prompt.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

export function preparePromptText(prompt: string): { value: string; truncated: boolean } {
  const normalized = normalizePromptText(prompt)
  const value = truncatePromptText(normalized)
  return {
    value,
    truncated: value.length < normalized.length,
  }
}
