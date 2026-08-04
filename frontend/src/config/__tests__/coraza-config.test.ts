import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readCorazaConfig = (): string => readFileSync(resolve(process.cwd(), 'coraza.conf'), 'utf8')
const readCaddyConfig = (): string => readFileSync(resolve(process.cwd(), 'Caddyfile'), 'utf8')
const sensitiveRequestHeaders = ['Authorization', 'Cookie', 'X-XSRF-TOKEN']

const ruleTargets = (config: string): string[][] =>
  [...config.matchAll(/^SecRule\s+(\S+)\s+"/gm)].map((match) => match[1].split('|'))

const sensitivePathPattern = (): RegExp => {
  const config = readCorazaConfig()
  const sensitivePathRule = config.match(/SecRule REQUEST_URI "@rx \^\/\(([^"]+)\)\(\/\|\$\)"/)

  expect(sensitivePathRule?.[1]).toBeDefined()
  return new RegExp(`^/(${sensitivePathRule?.[1]})(/|$)`)
}

describe('Coraza WAF config', () => {
  it('allows the supported 20 MiB upload plus multipart overhead', () => {
    const config = readCorazaConfig()

    expect(config).toContain('SecRequestBodyLimit 23068672')
  })

  it('omits sensitive request and response sections from audit logs', () => {
    const config = readCorazaConfig()
    const auditParts = config.match(/^SecAuditLogParts\s+([A-Z]+)$/m)?.[1]
    const sensitiveAuditParts = ['B', 'C', 'E', 'F', 'I', 'J']

    expect(auditParts).toBe('AHZ')
    sensitiveAuditParts.forEach((part) => expect(auditParts).not.toContain(part))
    expect(config).not.toMatch(/ctl:auditLogParts\s*=\s*\+?[A-Z]*[BCEFIJ]/i)
    expect(config).toMatch(/^SecDebugLogLevel\s+0$/m)
    expect(config).not.toMatch(/\blogdata\s*:/i)
    expect(config).not.toMatch(/\bmsg\s*:[^,\n]*%\{/i)
  })

  it('excludes opaque credential headers from every generic whole-header rule', () => {
    const targets = ruleTargets(readCorazaConfig())
    const wholeHeaderTargets = targets.filter((target) => target.includes('REQUEST_HEADERS'))

    expect(wholeHeaderTargets).toHaveLength(3)
    wholeHeaderTargets.forEach((target) => {
      sensitiveRequestHeaders.forEach((header) => {
        expect(target).toContain(`!REQUEST_HEADERS:${header}`)
        expect(target).not.toContain(`REQUEST_HEADERS:${header}`)
      })
    })
  })

  it('keeps the Caddy admin and metrics endpoint on loopback', () => {
    const config = readCaddyConfig()

    expect(config).toMatch(/^\s*metrics\s*$/m)
    expect(config).toMatch(/^\s*admin\s+127\.0\.0\.1:3003\s*$/m)
    expect(config).not.toMatch(/^\s*admin\s+(?:0\.0\.0\.0|\[::\]|\*|:)/m)
  })

  it('allows LEXIS SPA admin routes through document navigation', () => {
    const pattern = sensitivePathPattern()

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
