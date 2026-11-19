import { createHmac } from 'node:crypto'

// RFC 6238 codes as an authenticator app produces them: HMAC-SHA1, 6 digits, 30-second step.
const STEP_SECONDS = 30
const DIGITS = 6
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Decodes the secret key as Microsoft displays it: base32, often lowercase and space-grouped. */
const base32Decode = (input: string): Buffer => {
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const character of input.replace(/[\s=-]/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index === -1) throw new Error('E2E_IDIR_TOTP_SECRET is not valid base32.')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

const generateTotp = (secret: string, now: number = Date.now()): string => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / STEP_SECONDS)))

  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return code.toString().padStart(DIGITS, '0')
}

const stepMs = STEP_SECONDS * 1000
const currentStep = () => Math.floor(Date.now() / stepMs)
// A worker that failed just before this one started may have used the current code.
let lastIssuedStep = currentStep()

/** Waits for the next code when this one was issued already or is about to expire. */
export const freshTotp = async (secret: string, minRemainingMs = 5_000): Promise<string> => {
  const remainingMs = stepMs - (Date.now() % stepMs)
  // The identity provider refuses a code it has already accepted.
  if (remainingMs < minRemainingMs || currentStep() === lastIssuedStep) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs + 250))
  }
  lastIssuedStep = currentStep()
  return generateTotp(secret)
}
