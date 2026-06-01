import { Buffer } from 'node:buffer'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const SCRYPT_VERSION = '1'
const SCRYPT_KEY_LENGTH = 32
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAX_MEM = 64 * 1024 * 1024
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number, r: number, p: number, maxmem: number },
) => Promise<Buffer>

export async function hashCollaborationPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEM,
  })

  return [
    'scrypt',
    SCRYPT_VERSION,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt,
    derivedKey.toString('base64url'),
  ].join('$')
}

export async function verifyCollaborationPassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = passwordHash.split('$')

  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== SCRYPT_VERSION) {
    return false
  }

  const n = Number(parts[2])
  const r = Number(parts[3])
  const p = Number(parts[4])
  const salt = parts[5]
  const expectedKey = Buffer.from(parts[6], 'base64url')

  if (
    !Number.isSafeInteger(n)
    || !Number.isSafeInteger(r)
    || !Number.isSafeInteger(p)
    || n <= 0
    || r <= 0
    || p <= 0
    || expectedKey.length === 0
  ) {
    return false
  }

  let actualKey: Buffer

  try {
    actualKey = await scryptAsync(password, salt, expectedKey.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAX_MEM,
    })
  }
  catch {
    return false
  }

  return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey)
}
