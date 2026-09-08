export function normalizeBrowserAddress(rawAddress: string): string | null {
  const value = rawAddress.trim()
  if (!value)
    return null
  const hasExplicitProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
  try {
    const candidate = hasExplicitProtocol ? value : `https://${value}`
    const url = new URL(candidate)
    if (!hasExplicitProtocol && isLocalNetworkHostname(url.hostname))
      url.protocol = 'http:'
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}

function isLocalNetworkHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!hostname.includes('.') || /(?:^|\.)(?:local|internal|lan|home\.arpa)$/.test(hostname))
    return true
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return hostname === '::1'
      || /^(?:fc|fd|fe[89ab])/i.test(hostname)
      || hostname.startsWith('::ffff:')
  }
  const [first, second] = octets
  const secondOctet = second ?? -1
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && secondOctet >= 64 && secondOctet <= 127)
    || (first === 169 && secondOctet === 254)
    || (first === 172 && secondOctet >= 16 && secondOctet <= 31)
    || (first === 192 && secondOctet === 168)
    || (first === 198 && (secondOctet === 18 || secondOctet === 19))
}
