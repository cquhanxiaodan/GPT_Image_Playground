export interface DevProxyConfig {
  enabled: boolean
  prefix: string
  target: string
  changeOrigin: boolean
  secure: boolean
}

export const DEV_PROXY_REQUEST_ID_HEADER = 'x-dev-proxy-request-id'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizePathname(pathname: string): string {
  const trimmed = trimTrailingSlashes(pathname)
  return trimmed === '/' ? '' : trimmed
}

function joinUrlPath(base: string, path: string): string {
  const trimmedBase = trimTrailingSlashes(base)
  const trimmedPath = path.replace(/^\/+/, '')
  return trimmedBase ? `${trimmedBase}/${trimmedPath}` : `/${trimmedPath}`
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return ''

  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(input)
    return `${url.protocol}//${url.host}${normalizePathname(url.pathname)}`
  } catch {
    return trimTrailingSlashes(trimmed)
  }
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return ''

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(normalizedBaseUrl)) {
    const url = new URL(normalizedBaseUrl)
    const pathname = normalizePathname(url.pathname)
    const apiPath = /(?:^|\/)v1$/i.test(pathname) ? pathname || '/v1' : `${pathname}/v1`
    return `${url.protocol}//${url.host}${apiPath}`
  }

  const pathname = normalizedBaseUrl.startsWith('/') ? normalizedBaseUrl : `/${normalizedBaseUrl}`
  return /(?:^|\/)v1$/i.test(pathname) ? pathname : `${pathname}/v1`
}

export function normalizeProxyTargetBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return ''

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(normalizedBaseUrl)) {
    const url = new URL(normalizedBaseUrl)
    const pathname = normalizePathname(url.pathname).replace(/(?:^|\/)v1$/i, '')
    return `${url.protocol}//${url.host}${normalizePathname(pathname)}`
  }

  const pathname = (normalizedBaseUrl.startsWith('/') ? normalizedBaseUrl : `/${normalizedBaseUrl}`).replace(
    /(?:^|\/)v1$/i,
    '',
  )
  return normalizePathname(pathname)
}

export function normalizeDevProxyConfig(input: unknown): DevProxyConfig | null {
  if (!input || typeof input !== 'object') return null

  const record = input as Record<string, unknown>
  const target = normalizeBaseUrl(typeof record.target === 'string' ? record.target : '')
  if (!record.enabled && !target) return null

  const rawPrefix = typeof record.prefix === 'string' ? record.prefix : '/api-proxy'
  const trimmedPrefix = rawPrefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  const prefix = trimmedPrefix ? `/${trimmedPrefix}` : '/api-proxy'

  return {
    enabled: Boolean(record.enabled),
    prefix,
    target: target || '',
    changeOrigin: record.changeOrigin !== false,
    secure: Boolean(record.secure),
  }
}

export function buildApiUrl(
  baseUrl: string,
  path: string,
  proxyConfig?: DevProxyConfig | null,
  options?: { forceProxy?: boolean },
): string {
  const apiPath = joinUrlPath('/v1', path)
  const useProxy = Boolean(proxyConfig?.enabled)

  if (useProxy) {
    return joinUrlPath(proxyConfig!.prefix, apiPath)
  }

  const normalizedApiBaseUrl = normalizeApiBaseUrl(baseUrl)
  return normalizedApiBaseUrl ? joinUrlPath(normalizedApiBaseUrl, path) : apiPath
}

export function resolveDevProxyConfig(input: unknown, isDev: boolean): DevProxyConfig | null {
  if (!isDev) return null
  return normalizeDevProxyConfig(input)
}

export function readClientDevProxyConfig(): DevProxyConfig | null {
  if (import.meta.env.DEV) {
    return resolveDevProxyConfig(
      typeof __DEV_PROXY_CONFIG__ === 'undefined' ? null : __DEV_PROXY_CONFIG__,
      true,
    )
  }

  return { enabled: true, prefix: '/api-proxy', target: '', changeOrigin: true, secure: true }
}
