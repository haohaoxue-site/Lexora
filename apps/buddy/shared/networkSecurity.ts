export function isSecureOrLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:')
      return true
    return url.protocol === 'http:' && isLoopbackHostname(url.hostname)
  }
  catch {
    return false
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '[::1]'
    || hostname === '127.0.0.1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}
