import type { KeyboardEventHandler, RefObject } from 'react'

interface PromptSectionProps {
  prompt: string
  normalizedPrompt: string
  promptLength: number
  softLimit: number
  hardLimit: number
  promptHintText: string
  isMobile: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onPromptChange: (value: string) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
}

export default function PromptSection({
  prompt,
  normalizedPrompt,
  promptLength,
  softLimit,
  hardLimit,
  promptHintText,
  isMobile,
  textareaRef,
  onPromptChange,
  onKeyDown,
}: PromptSectionProps) {
  const exceedsSoftLimit = promptLength > softLimit
  const exceedsHardLimit = promptLength > hardLimit

  return (
    <div className="flex flex-shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">提示词</span>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{promptHintText}</p>
          {exceedsSoftLimit ? (
            <p className={`mt-1 text-xs ${exceedsHardLimit ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {exceedsHardLimit
                ? `已超过建议长度，提交时会自动截断到 ${hardLimit} 字。`
                : `提示词偏长，超过 ${softLimit} 字后更容易触发上游超时。`}
            </p>
          ) : null}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${exceedsHardLimit ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : exceedsSoftLimit ? 'bg-gray-200 text-gray-700 dark:bg-white/[0.08] dark:text-gray-300' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400'}`}>
          {normalizedPrompt ? `${promptLength} / ${hardLimit} 字` : '未填写'}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={isMobile ? 3 : 12}
        placeholder="描述你想生成的图片..."
        className="min-h-[4.75rem] w-full resize-none rounded-[1.35rem] border border-gray-200/70 bg-white px-4 py-3 text-[15px] leading-6 text-gray-700 shadow-sm transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100 md:min-h-[11rem] md:py-3.5 md:leading-7"
      />
    </div>
  )
}
