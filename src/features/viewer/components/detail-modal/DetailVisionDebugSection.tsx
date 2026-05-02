import type { TaskVisionDebugInfo } from '../../../../types'

interface DetailVisionDebugSectionProps {
  vision: TaskVisionDebugInfo | null | undefined
}

function renderDebugCard(label: string, value: string) {
  return (
    <div className="rounded-lg bg-amber-50/70 px-3 py-2 dark:bg-amber-500/10">
      <span className="text-amber-700/80 dark:text-amber-200/70">{label}</span>
      <br />
      <span className="break-all font-medium text-amber-900 dark:text-amber-100">{value}</span>
    </div>
  )
}

export default function DetailVisionDebugSection({ vision }: DetailVisionDebugSectionProps) {
  if (!vision) {
    return null
  }

  return (
    <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-200">
        参考图增强调试
      </h3>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        {renderDebugCard('视觉模型', vision.model)}
        {renderDebugCard('参考图数量', String(vision.inputImageCount))}
        {renderDebugCard('原始提示词长度', String(vision.basePromptLength))}
        {renderDebugCard('视觉描述长度', String(vision.visionDescriptionLength))}
        {renderDebugCard('增强后长度', String(vision.enhancedPromptLength))}
        {renderDebugCard('是否截断', vision.enhancedPromptWasTruncated ? '是' : '否')}
      </div>

      <div className="mb-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-amber-700/80 dark:text-amber-200/70">
          Vision 描述
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-relaxed text-amber-950 shadow-sm dark:bg-gray-900/70 dark:text-amber-50">
          <p className="whitespace-pre-wrap break-words">{vision.visionDescription || '(空)'}</p>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-amber-700/80 dark:text-amber-200/70">
          增强后 Prompt
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-relaxed text-amber-950 shadow-sm dark:bg-gray-900/70 dark:text-amber-50">
          <p className="whitespace-pre-wrap break-words">{vision.enhancedPrompt || '(空)'}</p>
        </div>
      </div>
    </div>
  )
}
