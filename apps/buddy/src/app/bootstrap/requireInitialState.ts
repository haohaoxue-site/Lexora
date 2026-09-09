class InitialStateUnavailableError extends Error {
  readonly code = 'INITIAL_STATE_UNAVAILABLE'
}

export function requireInitialState(available: boolean | void): void {
  if (available === false)
    throw new InitialStateUnavailableError('Initial state is unavailable')
}
