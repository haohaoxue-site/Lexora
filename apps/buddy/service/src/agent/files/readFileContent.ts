import type { Buffer } from 'node:buffer'

export const READ_CONTENT_NOTICE = 'read returned metadata only; no file content was extracted. read does not play audio or video or extract document contents. Use native content for the sent snapshot only if it is supplied in this request; it does not reflect later file edits. Otherwise use a format-aware tool for the task. For byte inspection, use a bounded hex dump.'

export function detectBinaryReadFormat(buffer: Buffer): string | undefined {
  const header = buffer.subarray(0, 16).toString('latin1')
  if (/^RIFF[\s\S]{4}WAVE/.test(header))
    return 'WAV audio'
  if (/^RIFF[\s\S]{4}AVI /.test(header))
    return 'AVI video'
  if (/^[\s\S]{4}ftyp[\x20-\x7E]{4}/.test(header))
    return 'MP4/M4A container'
  if (header.startsWith('\x1A\x45\xDF\xA3'))
    return 'WebM/Matroska container'
  if (hasId3Header(header))
    return 'ID3-tagged audio'
  if (buffer.length >= 4 && buffer[0] === 0xFF && (buffer[1]! & 0xE0) === 0xE0
    && (buffer[1]! & 0x18) !== 0x08 && (buffer[1]! & 0x06) !== 0
    && (buffer[2]! & 0xF0) !== 0xF0 && (buffer[2]! & 0x0C) !== 0x0C) {
    return 'MPEG audio'
  }
  if (header.startsWith('OggS\x00'))
    return 'Ogg media container'
  if (header.startsWith('fLaC'))
    return 'FLAC audio'
  if (/^%PDF-[12]\.\d[\r\n]/.test(header))
    return 'PDF document'
  if (hasZipHeader(header))
    return 'ZIP archive/container'
  if (header.startsWith('\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'))
    return 'OLE compound document'
  return undefined
}

export function decodeReadText(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xFE)
    return new TextDecoder('utf-16le').decode(buffer)
  if (buffer[0] === 0xFE && buffer[1] === 0xFF)
    return new TextDecoder('utf-16be').decode(buffer)
  return buffer.toString('utf8')
}

export function isHistoricalBinaryRead(text: string): boolean {
  const header = text.slice(0, 16)
  return /^RIFF[\s\S]{1,4}(?:WAVE|AVI )/.test(header)
    || /^[\s\S]{1,4}ftyp[\x20-\x7E]{4}/.test(header)
    || header.startsWith('\x1AE\u07E3')
    || hasId3Header(header)
    || header.startsWith('OggS\x00')
    || header.startsWith('fLaC')
    || /^%PDF-[12]\.\d[\r\n]/.test(header)
    || hasZipHeader(header)
}

function hasId3Header(header: string): boolean {
  return header.startsWith('ID3') && header.charCodeAt(3) >= 2 && header.charCodeAt(3) <= 4 && header.charCodeAt(4) === 0
}

function hasZipHeader(header: string): boolean {
  return ['PK\x03\x04', 'PK\x05\x06', 'PK\x07\x08'].some(prefix => header.startsWith(prefix))
}
