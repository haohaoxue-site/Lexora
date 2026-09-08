import type { InjectionKey } from 'vue'
import { inject } from 'vue'

export function createInjectionContext<T>(name: string) {
  const key: InjectionKey<T> = Symbol(name)

  function useContext(): T {
    const value = inject(key)
    if (!value)
      throw new Error(`${name} context is unavailable`)
    return value
  }

  return { key, useContext }
}
