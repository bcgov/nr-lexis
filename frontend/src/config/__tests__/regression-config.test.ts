import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

it('does not replay a failed regression under CI or publish its raw diagnostics', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'lexis-regression-config-'))
  const attemptsPath = join(fixture, 'attempts.txt')
  const marker = 'synthetic-private-regression-value'
  try {
    writeFileSync(
      join(fixture, 'playwright.config.ts'),
      `const config = require(${JSON.stringify(resolve('playwright.regression.config.ts'))}).default
module.exports = {
  ...config,
  testDir: ${JSON.stringify(fixture)},
  outputDir: ${JSON.stringify(join(fixture, 'results'))},
  webServer: undefined,
  reporter: config.reporter.map(([reporter]) => [${JSON.stringify(process.cwd())} + '/' + reporter]),
}
`,
    )
    writeFileSync(
      join(fixture, 'probe-regression.spec.ts'),
      `const { test } = require(${JSON.stringify(require.resolve('@playwright/test'))})
const { appendFileSync } = require('node:fs')
test('synthetic failed mutation', async () => {
  appendFileSync(${JSON.stringify(attemptsPath)}, 'attempt\\n')
  console.log(${JSON.stringify(marker)})
  console.error(${JSON.stringify(marker)})
  throw new Error(${JSON.stringify(marker)})
})
`,
    )
    const run = spawnSync(
      process.execPath,
      [
        require.resolve('@playwright/test/cli'),
        'test',
        '--config',
        join(fixture, 'playwright.config.ts'),
      ],
      {
        cwd: process.cwd(),
        // No credentials, remote requests, web server or browser are needed for this probe.
        env: { PATH: process.env.PATH, CI: 'true', E2E_BASE_URL: 'http://127.0.0.1:1' },
        encoding: 'utf8',
        timeout: 15_000,
      },
    )

    expect(run.error).toBeUndefined()
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('Regression failed: 1 failed')
    expect(run.stdout + run.stderr).not.toContain(marker)
    expect(readFileSync(attemptsPath, 'utf8')).toBe('attempt\n')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}, 20_000)
