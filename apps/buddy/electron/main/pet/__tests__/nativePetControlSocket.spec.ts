import { describe, expect, it } from 'vitest'

import { resolveNativePetControlSocketPath } from '../nativePetControlSocket'

describe('nativePetControlSocket', () => {
  it('uses the same per-session socket path as the standalone pet', () => {
    expect(resolveNativePetControlSocketPath({
      env: { XDG_RUNTIME_DIR: '/run/user/1000' },
      temporaryDirectory: '/tmp',
      userId: 1000,
    })).toBe('/run/user/1000/lexora-buddy/native-pet.sock')
  })
})
