import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../../../types'
import { fieldClassName } from './apiSettingsShared'

interface ApiRequestSettingsProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  commitSettings: (nextDraft: AppSettings) => void
}

export default function ApiRequestSettings({
  draft,
  setDraft,
  commitSettings,
}: ApiRequestSettingsProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">请求模式</span>
      <select
        value={draft.requestMode}
        onChange={(event) => {
          const requestMode = event.target.value as AppSettings['requestMode']
          const nextDraft = { ...draft, requestMode }
          setDraft(nextDraft)
          commitSettings(nextDraft)
        }}
        className={fieldClassName}
      >
        <option value="local_proxy">本地代理（推荐线上部署）</option>
        <option value="direct">浏览器直连</option>
      </select>
      <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
        本地代理通过同源 /api-proxy 转发请求，可规避浏览器跨域限制。
      </div>
    </label>
  )
}
