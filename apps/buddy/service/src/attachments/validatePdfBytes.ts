export function hasPdfSignature(bytes: Uint8Array): boolean {
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return /%PDF-(?:1\.[0-7]|2\.0)\s/.test(header)
}
