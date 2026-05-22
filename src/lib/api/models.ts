import { buildApiUrl, normalizeProxyTargetBaseUrl, readClientDevProxyConfig } from '../devProxy'

export interface ModelInfo {
  id: string
  owned_by?: string
}

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  useProxy = false,
): Promise<ModelInfo[]> {
  const proxyConfig = useProxy ? readClientDevProxyConfig() : null
  const requestUrl = buildApiUrl(baseUrl, 'models', proxyConfig)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  }

  if (proxyConfig?.enabled && proxyConfig.forwardTargetHeader !== false) {
    const proxyTarget = normalizeProxyTargetBaseUrl(baseUrl)
    if (proxyTarget) {
      headers['X-Dev-Proxy-Target'] = proxyTarget
    }
  }

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`)
  }

  const data = await response.json()
  const models: ModelInfo[] = Array.isArray(data?.data)
    ? data.data.map((m: any) => ({ id: m.id, owned_by: m.owned_by }))
    : []

  return models.sort((a, b) => a.id.localeCompare(b.id))
}
