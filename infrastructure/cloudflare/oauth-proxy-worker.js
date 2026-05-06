const GITHUB_OAUTH_UPSTREAM_URL = 'https://github.com/login/oauth'
const GITHUB_USERINFO_UPSTREAM_URL = 'https://api.github.com/user'
const LINUX_DO_UPSTREAM_URL = 'https://connect.linux.do'

const PROXY_HEADER_NAMES = new Set([
  'accept',
  'authorization',
  'content-type',
  'user-agent',
  'x-github-api-version',
])

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
      return new Response('samepage oauth proxy', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    const route = resolveRoute(url)

    if (!route) {
      return new Response('Not found', { status: 404 })
    }

    if (!route.methods.includes(request.method)) {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: route.methods.join(', ') },
      })
    }

    if (route.type === 'redirect') {
      return Response.redirect(route.target.toString(), 302)
    }

    if (route.type === 'linux-do-metadata') {
      return proxyLinuxDoMetadata(url)
    }

    return proxyRequest(request, route.target)
  },
}

function resolveRoute(url) {
  const linuxDoPath = stripPrefix(url.pathname, '/linux-do')

  if (linuxDoPath === '/oauth2/authorize') {
    return {
      type: 'redirect',
      methods: ['GET'],
      target: createTargetUrl(LINUX_DO_UPSTREAM_URL, '/oauth2/authorize', url),
    }
  }

  if (linuxDoPath === '/oauth2/token') {
    return {
      type: 'proxy',
      methods: ['POST'],
      target: createTargetUrl(LINUX_DO_UPSTREAM_URL, '/oauth2/token', url),
    }
  }

  if (linuxDoPath === '/api/user') {
    return {
      type: 'proxy',
      methods: ['GET'],
      target: createTargetUrl(LINUX_DO_UPSTREAM_URL, '/api/user', url),
    }
  }

  if (linuxDoPath === '/.well-known/jwks.json') {
    return {
      type: 'proxy',
      methods: ['GET'],
      target: createTargetUrl(LINUX_DO_UPSTREAM_URL, '/.well-known/jwks.json', url),
    }
  }

  if (linuxDoPath === '/.well-known/openid-configuration') {
    return {
      type: 'linux-do-metadata',
      methods: ['GET'],
      target: createTargetUrl(LINUX_DO_UPSTREAM_URL, '/.well-known/openid-configuration', url),
    }
  }

  if (linuxDoPath) {
    return null
  }

  const githubPath = stripPrefix(url.pathname, '/github')

  if (githubPath === '/authorize') {
    return {
      type: 'redirect',
      methods: ['GET'],
      target: createTargetUrl(GITHUB_OAUTH_UPSTREAM_URL, '/authorize', url),
    }
  }

  if (githubPath === '/access_token') {
    return {
      type: 'proxy',
      methods: ['POST'],
      target: createTargetUrl(GITHUB_OAUTH_UPSTREAM_URL, '/access_token', url),
    }
  }

  if (githubPath === '/user') {
    return {
      type: 'proxy',
      methods: ['GET'],
      target: createTargetUrl(GITHUB_USERINFO_UPSTREAM_URL, '', url),
    }
  }

  return null
}

function stripPrefix(pathname, prefix) {
  if (pathname === prefix) {
    return '/'
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length)
  }

  return null
}

function createTargetUrl(baseUrl, path, sourceUrl) {
  const target = new URL(baseUrl)
  const basePath = target.pathname.replace(/\/+$/g, '')
  const nextPath = path.replace(/^\/+/g, '')
  target.pathname = nextPath ? `${basePath}/${nextPath}` : basePath || '/'
  target.search = sourceUrl.search
  return target
}

async function proxyLinuxDoMetadata(sourceUrl) {
  const response = await fetch(`${LINUX_DO_UPSTREAM_URL}/.well-known/openid-configuration`)
  const metadata = await response.json()
  const baseUrl = new URL('/linux-do', sourceUrl.origin)

  return Response.json({
    ...metadata,
    authorization_endpoint: createTargetUrl(baseUrl.toString(), '/oauth2/authorize', sourceUrl).toString(),
    token_endpoint: createTargetUrl(baseUrl.toString(), '/oauth2/token', sourceUrl).toString(),
    userinfo_endpoint: createTargetUrl(baseUrl.toString(), '/api/user', sourceUrl).toString(),
    jwks_uri: createTargetUrl(baseUrl.toString(), '/.well-known/jwks.json', sourceUrl).toString(),
  })
}

function proxyRequest(request, target) {
  return fetch(target, {
    method: request.method,
    headers: createProxyHeaders(request.headers),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
}

function createProxyHeaders(sourceHeaders) {
  const headers = new Headers()

  for (const [name, value] of sourceHeaders) {
    if (PROXY_HEADER_NAMES.has(name.toLowerCase())) {
      headers.set(name, value)
    }
  }

  return headers
}
