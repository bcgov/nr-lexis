import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readCorazaConfig = (): string => readFileSync(resolve(process.cwd(), 'coraza.conf'), 'utf8')

const sensitivePathPattern = (): RegExp => {
  const config = readCorazaConfig()
  const sensitivePathRule = config.match(/SecRule REQUEST_URI "@rx \^\/\(([^"]+)\)\(\/\|\$\)"/)

  expect(sensitivePathRule?.[1]).toBeDefined()
  return new RegExp(`^/(${sensitivePathRule?.[1]})(/|$)`)
}

describe('Coraza WAF config', () => {
  it('allows LEXIS SPA admin routes through document navigation', () => {
    const pattern = sensitivePathPattern()

    expect(pattern.test('/admin')).toBe(false)
    expect(pattern.test('/admin/policies/fee')).toBe(false)
    expect(pattern.test('/admin/schedules')).toBe(false)
    expect(pattern.test('/admin/rtm/emslogamv')).toBe(false)
  })

  it('still blocks common sensitive paths', () => {
    const pattern = sensitivePathPattern()

    expect(pattern.test('/.env')).toBe(true)
    expect(pattern.test('/.git/config')).toBe(true)
    expect(pattern.test('/config')).toBe(true)
    expect(pattern.test('/wp-admin')).toBe(true)
  })
})
