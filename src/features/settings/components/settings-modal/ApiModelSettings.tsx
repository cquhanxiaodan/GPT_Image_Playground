import { useCallback, useEffect, useState } from 'react'
import type { AppSettings } from '../../../../types'
import type { Dispatch, SetStateAction } from 'react'
import { fetchModels, type ModelInfo } from '../../../../lib/api/models'
import { fieldClassName } from './apiSettingsShared'

interface ApiModelSettingsProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  commitSettings: (nextDraft: AppSettings) => void
}

export default function ApiModelSettings({
  draft,
  setDraft,
  commitSettings,
}: ApiModelSettingsProps) {
  const [chatModels, setChatModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')

  const loadModels = useCallback(async () => {
    if (!draft.baseUrl || !draft.apiKey) {
      setModelsError('请先填写 API URL 和 API Key')
      return
    }
    setLoadingModels(true)
    setModelsError('')
    try {
      const allModels = await fetchModels(draft.baseUrl, draft.apiKey, draft.requestMode === 'local_proxy')
      const filtered = allModels.filter(
        (m) => !m.id.toLowerCase().includes('image') && !m.id.toLowerCase().includes('dall-e') && !m.id.toLowerCase().includes('tts') && !m.id.toLowerCase().includes('whisper') && !m.id.toLowerCase().includes('embedding'),
      )
      setChatModels(filtered)
      if (filtered.length === 0) {
        setModelsError('未找到可用的视觉模型')
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : '获取模型列表失败')
      setChatModels([])
    } finally {
      setLoadingModels(false)
    }
  }, [draft.baseUrl, draft.apiKey, draft.requestMode])

  useEffect(() => {
    if (draft.baseUrl && draft.apiKey && chatModels.length === 0 && !loadingModels) {
      loadModels()
    }
  }, [draft.baseUrl, draft.apiKey, chatModels.length, loadingModels, loadModels])

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">图片生成模型</span>
        <input
          value={draft.model}
          onChange={(event) => setDraft((prev) => ({ ...prev, model: event.target.value }))}
          onBlur={(event) => commitSettings({ ...draft, model: event.target.value })}
          type="text"
          placeholder="gpt-image-2"
          className={fieldClassName}
        />
      </label>

      <label className="block">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">视觉模型（兼容旧流程）</span>
          <button
            type="button"
            onClick={loadModels}
            disabled={loadingModels || !draft.baseUrl || !draft.apiKey}
            className="text-[10px] text-blue-500 hover:text-blue-600 disabled:opacity-40 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {loadingModels ? '加载中...' : '刷新模型列表'}
          </button>
        </div>
        {chatModels.length > 0 ? (
          <select
            value={draft.visionModel}
            onChange={(event) => commitSettings({ ...draft, visionModel: event.target.value })}
            className={fieldClassName}
          >
            <option value="">-- 选择视觉模型 --</option>
            {chatModels.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
        ) : (
          <input
            value={draft.visionModel}
            onChange={(event) => setDraft((prev) => ({ ...prev, visionModel: event.target.value }))}
            onBlur={(event) => commitSettings({ ...draft, visionModel: event.target.value })}
            type="text"
            placeholder="gpt-5.4"
            className={fieldClassName}
          />
        )}
        {modelsError && (
          <div className="mt-1 text-[10px] text-amber-500 dark:text-amber-400">{modelsError}</div>
        )}
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          当前图生图会直接提交参考图；此模型仅用于兼容旧的参考图转提示词流程。
        </div>
      </label>
    </>
  )
}
