export function maskConnectorUrl(value: string): string {
  const url = new URL(value)
  const query = [...url.searchParams.keys()].map(key => `${encodeURIComponent(key)}=••••`).join('&')
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`
}
