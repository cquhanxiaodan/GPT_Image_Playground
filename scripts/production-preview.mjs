import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 4173)
const DIST_DIR = resolve(process.cwd(), 'dist')
const API_PROXY_PREFIX = '/api-proxy'
const API_PROXY_CACHE_PREFIX = '/api-proxy-cache'
const DEV_PROXY_TARGET_HEADER = 'x-dev-proxy-target'
const DEV_PROXY_REQUEST_ID_HEADER = 'x-dev-proxy-request-id'
const DEFAULT_PROXY_TARGET = process.env.LOCAL_API_PROXY_TARGET || process.env.API_URL || ''
const RESPONSE_CACHE_TTL_MS = 60 * 60 * 1000
const RESPONSE_CACHE_MAX_ENTRIES = 20
const ALLOWED_PROXY_METHODS = new Set(['POST', 'OPTIONS'])
const ALLOWED_PROXY_PATHS = new Set([
  '/v1/images/generations',
  '/v1/images/edits',
  '/v1/responses',
  '/images/generations',
  '/images/edits',
  '/responses',
])
const responseCache = new Map()

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, '')
}

function normalizePathname(pathname) {
  const trimmed = trimTrailingSlashes(pathname)
  return trimmed === '/' ? '' : trimmed
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim()
  if (!trimmed) return ''

  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(input)
    return `${url.protocol}//${url.host}${normalizePathname(url.pathname)}`
  } catch {
    return trimTrailingSlashes(trimmed)
  }
}

function normalizeProxyTargetBaseUrl(baseUrl) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return ''

  const url = new URL(normalizedBaseUrl)
  const pathname = normalizePathname(url.pathname).replace(/(?:^|\/)v1$/i, '')
  return `${url.protocol}//${url.host}${normalizePathname(pathname)}`
}

function joinTargetPath(basePath, path) {
  const normalizedBasePath = trimTrailingSlashes(basePath || '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBasePath}${normalizedPath}` || '/'
}

function isAllowedProxyRequest(method, proxiedPath) {
  if (!ALLOWED_PROXY_METHODS.has(method)) {
    return false
  }

  const normalizedPath = normalizePathname(proxiedPath) || '/'
  return ALLOWED_PROXY_PATHS.has(normalizedPath)
}

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function pruneResponseCache() {
  const now = Date.now()
  for (const [requestId, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(requestId)
    }
  }

  while (responseCache.size > RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestRequestId = responseCache.keys().next().value
    if (!oldestRequestId) break
    responseCache.delete(oldestRequestId)
  }
}

function cacheProxyResponse(requestId, response) {
  responseCache.set(requestId, {
    ...response,
    createdAt: Date.now(),
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
  })
  pruneResponseCache()
}

function isStaticAsset(pathname) {
  return pathname.includes('.') && !pathname.endsWith('/')
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname)
  const normalizedPath = normalize(decoded).replace(/^\.{2}(\/|\\|$)/, '')
  return join(DIST_DIR, normalizedPath)
}

function setCorslessProxyHeaders(req, headers, targetUrl) {
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) continue
    const lowerName = name.toLowerCase()
    if (lowerName === 'host' || lowerName === 'connection' || lowerName === DEV_PROXY_TARGET_HEADER) continue
    if (Array.isArray(value)) {
      headers.set(name, value.join(', '))
    } else {
      headers.set(name, value)
    }
  }

  headers.set('accept-encoding', 'identity')
  if (headers.has('origin')) headers.set('origin', targetUrl.origin)
  if (headers.has('referer')) headers.set('referer', `${targetUrl.origin}/`)
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return chunks.length ? Buffer.concat(chunks) : undefined
}

async function handleProxy(req, res, requestUrl) {
  const requestId = createRequestId()
  const headerTarget = Array.isArray(req.headers[DEV_PROXY_TARGET_HEADER])
    ? req.headers[DEV_PROXY_TARGET_HEADER][0]
    : req.headers[DEV_PROXY_TARGET_HEADER]
  const targetBaseUrl = normalizeProxyTargetBaseUrl(headerTarget || DEFAULT_PROXY_TARGET)

  if (!targetBaseUrl) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('生产预览未配置有效的 API 代理目标')
    return
  }

  const proxiedPath = requestUrl.pathname.slice(API_PROXY_PREFIX.length) || '/'
  if (!isAllowedProxyRequest(req.method || 'GET', proxiedPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden: API proxy path restricted')
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': Array.from(ALLOWED_PROXY_METHODS).join(', '),
      'Access-Control-Allow-Headers': 'authorization, content-type, x-dev-proxy-target',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  const targetUrl = new URL(targetBaseUrl)
  targetUrl.pathname = joinTargetPath(targetUrl.pathname, proxiedPath)
  targetUrl.search = requestUrl.search

  const headers = new Headers()
  setCorslessProxyHeaders(req, headers, targetUrl)
  const body = await readRequestBody(req)

  let upstream
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      duplex: body ? 'half' : undefined,
    })
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`生产预览代理失败：${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const responseHeaders = {}
  upstream.headers.forEach((value, name) => {
    const lowerName = name.toLowerCase()
    if (lowerName === 'connection' || lowerName === 'content-encoding' || lowerName === 'transfer-encoding') return
    responseHeaders[name] = value
  })
  responseHeaders[DEV_PROXY_REQUEST_ID_HEADER] = requestId

  res.writeHead(upstream.status, responseHeaders)
  if (!upstream.body) {
    cacheProxyResponse(requestId, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      bodyBase64: '',
    })
    res.end()
    return
  }

  const chunks = []
  for await (const chunk of upstream.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    chunks.push(buffer)
    res.write(chunk)
  }
  const responseBody = Buffer.concat(chunks)
  cacheProxyResponse(requestId, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
    bodyBase64: responseBody.toString('base64'),
  })
  res.end()
}

function handleProxyCache(req, res, requestUrl) {
  pruneResponseCache()
  const requestId = decodeURIComponent(requestUrl.pathname.slice(API_PROXY_CACHE_PREFIX.length).replace(/^\/+/, ''))
  const entry = requestId ? responseCache.get(requestId) : null

  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'cached proxy response not found' }))
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({
    requestId,
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
    bodyBase64: entry.bodyBase64,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
  }))
}

async function handleStatic(req, res, requestUrl) {
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
  let filePath = safeFilePath(pathname)

  if (!existsSync(filePath) || !filePath.startsWith(DIST_DIR)) {
    if (isStaticAsset(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }
    filePath = join(DIST_DIR, 'index.html')
  }

  const ext = extname(filePath)
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  })

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  if (ext === '.html') {
    const html = await readFile(filePath)
    res.end(html)
    return
  }

  createReadStream(filePath).pipe(res)
}

if (!existsSync(DIST_DIR)) {
  console.error('dist 目录不存在，请先执行 npm run build')
  process.exit(1)
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

  try {
    if (requestUrl.pathname === API_PROXY_CACHE_PREFIX || requestUrl.pathname.startsWith(`${API_PROXY_CACHE_PREFIX}/`)) {
      handleProxyCache(req, res, requestUrl)
      return
    }

    if (requestUrl.pathname === API_PROXY_PREFIX || requestUrl.pathname.startsWith(`${API_PROXY_PREFIX}/`)) {
      await handleProxy(req, res, requestUrl)
      return
    }

    await handleStatic(req, res, requestUrl)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`生产预览服务异常：${error instanceof Error ? error.message : String(error)}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Production preview server running at http://${HOST}:${PORT}`)
  if (DEFAULT_PROXY_TARGET) {
    console.log(`Proxy target: ${DEFAULT_PROXY_TARGET}`)
  }
})
