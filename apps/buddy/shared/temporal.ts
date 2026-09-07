import { Temporal as temporalPolyfill } from '@js-temporal/polyfill'

export const Temporal = temporalPolyfill as unknown as typeof globalThis.Temporal
