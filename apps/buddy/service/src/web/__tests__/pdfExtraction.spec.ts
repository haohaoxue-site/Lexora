import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { extractWebResource } from '../webContent'

function pdfFixture() {
  const stream = 'BT /F1 12 Tf 72 720 Td (Public PDF source text) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(source.length)
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const start = source.length
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(source)
}

describe('text PDF extraction', () => {
  it('extracts actual PDF bytes with page markers without OCR or rendering dependencies', async () => {
    const result = await extractWebResource({ url: 'https://example.com/source.pdf', bytes: pdfFixture(), status: 200, headers: new Headers({ 'content-type': 'application/pdf' }) }, new AbortController().signal)
    expect(result).toMatchObject({ handler: 'pdf', acquisitionIncomplete: false })
    expect(result.content).toContain('## Page 1')
    expect(result.content).toContain('Public PDF source text')
  })
})
