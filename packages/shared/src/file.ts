export const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export type ByteUnits = typeof BYTE_UNITS[number]

export interface PrettyBytesOptions {
  precision?: number
  compatible?: boolean
}

export function getBytes(num: number, unit: ByteUnits, compatible = false): number {
  const exponent = BYTE_UNITS.indexOf(unit)

  if (exponent < 0) {
    return num
  }

  return num * getByteBase(compatible) ** exponent
}

export function prettyBytes(num: number, options: PrettyBytesOptions = {}): string {
  const { compatible = false } = options
  const base = getByteBase(compatible)
  const precision = normalizePrecision(options.precision)

  if (Math.abs(num) < 1) {
    return `${num}${BYTE_UNITS[0]}`
  }

  const exponent = Math.min(
    Math.floor(Math.log(Math.abs(num)) / Math.log(base)),
    BYTE_UNITS.length - 1,
  )
  const result = Number((num / base ** exponent).toFixed(precision))

  return `${result}${BYTE_UNITS[exponent]}`
}

function getByteBase(compatible: boolean) {
  return compatible ? 1000 : 1024
}

function normalizePrecision(value: number | undefined) {
  if (value === undefined) {
    return 2
  }

  if (!Number.isFinite(value)) {
    return 2
  }

  return Math.min(Math.max(Math.trunc(value), 0), 20)
}
