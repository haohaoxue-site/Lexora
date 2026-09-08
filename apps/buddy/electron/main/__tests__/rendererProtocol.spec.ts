import { describe, expect, it } from 'vitest'
import { resolveRendererAssetPath } from '../rendererProtocol'

describe('renderer protocol', () => {
  it('resolves renderer assets without allowing host or path escape', () => {
    expect(resolveRendererAssetPath(
      'lexora-app://renderer/assets/index.js',
      '/opt/Lexora Buddy/resources/app.asar/renderer',
    )).toBe('/opt/Lexora Buddy/resources/app.asar/renderer/assets/index.js')
    expect(resolveRendererAssetPath(
      'lexora-app://other/assets/index.js',
      '/opt/Lexora Buddy/resources/app.asar/renderer',
    )).toBeNull()
    expect(resolveRendererAssetPath(
      'lexora-app://renderer/../../package.json',
      '/opt/Lexora Buddy/resources/app.asar/renderer',
    )).toBeNull()
  })
})
