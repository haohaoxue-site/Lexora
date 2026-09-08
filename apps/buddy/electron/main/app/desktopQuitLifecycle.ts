import type { DesktopQuitOptions } from './typing'

interface DesktopQuitLifecycleOptions {
  confirm: (options: DesktopQuitOptions) => Promise<boolean>
  dispose: () => Promise<void>
  quit: () => void
}

export function createDesktopQuitLifecycle(options: DesktopQuitLifecycleOptions) {
  let committed = false
  let quitting = false
  let pending: Promise<void> | null = null

  return {
    get committed() { return committed },
    get quitting() { return quitting },
    request(input: DesktopQuitOptions = {}): Promise<void> {
      if (pending)
        return pending
      pending = Promise.resolve().then(async () => {
        if (!(await options.confirm(input)))
          return
        quitting = true
        await options.dispose()
        committed = true
        options.quit()
      }).finally(() => {
        if (!committed)
          pending = null
      })
      return pending
    },
  }
}
