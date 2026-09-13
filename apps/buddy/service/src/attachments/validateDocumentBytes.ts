import { hasPdfSignature } from './validatePdfBytes'

export function hasDocumentSignature(mimeType: string, bytes: Uint8Array): boolean {
  const signature = (offset: number, value: string) => value.split('').every((char, index) => bytes[offset + index] === char.charCodeAt(0))
  switch (mimeType) {
    case 'application/pdf':
      return hasPdfSignature(bytes)
    case 'audio/wav':
      return bytes.length >= 44 && signature(0, 'RIFF') && signature(8, 'WAVE')
    case 'audio/mpeg':
      return bytes.length >= 4 && (signature(0, 'ID3') || (bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0))
    case 'audio/mp4':
    case 'video/mp4':
      return bytes.length >= 12 && signature(4, 'ftyp')
    case 'video/webm':
      return bytes.length >= 8 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3
    default:
      return false
  }
}
