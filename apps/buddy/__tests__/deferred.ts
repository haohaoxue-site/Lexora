export interface Deferred<T> {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

export function deferred<T>(): Deferred<T> {
  let reject!: Deferred<T>['reject']
  let resolve!: Deferred<T>['resolve']
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise
    resolve = resolvePromise
  })
  return { promise, reject, resolve }
}
