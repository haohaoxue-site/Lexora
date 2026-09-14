export async function waitForMcpOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal)
    return operation
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted)
      abort()
  })
}
