export function isLocalNamedPipe(address: string): boolean {
  return /^\\\\\.\\pipe\\[\w.-]+$/.test(address)
}
