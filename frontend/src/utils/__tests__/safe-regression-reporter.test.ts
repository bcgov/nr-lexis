import type { FullConfig, FullResult, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SafeRegressionReporter from '../../../e2e/safe-regression-reporter'

describe('credentialed regression reporter', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps failure categories and source locations without publishing errors, headers or data', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = {
      message:
        'apiRequestContext.post: connect ECONNREFUSED\nCookie: SMSESSION=private-session\nX-XSRF-TOKEN: private-csrf\nAuthorization: Bearer private-token',
      stack:
        'Error: private-business-data\n    at request (/workspace/frontend/e2e/utils/regression-auth.ts:800:9)\n    at /workspace/frontend/e2e/regression.spec.ts:2304:24',
      snippet: 'private-source-snippet',
      cause: { message: 'private-nested-cause' },
    }
    const result = {
      status: 'failed',
      errors: [error],
      attachments: [
        {
          name: 'private-attachment',
          contentType: 'text/plain',
          body: Buffer.from('private-attachment-body'),
          path: '/private-attachment-path',
        },
      ],
    } as TestResult
    const test = {
      title: 'generates each report artifact',
      location: { file: '/workspace/frontend/e2e/regression.spec.ts', line: 2239 },
      results: [result],
    } as TestCase
    const reporter = new SafeRegressionReporter()
    reporter.onBegin({} as FullConfig, { allTests: () => [test] } as Suite)
    reporter.onTestEnd(test, result)
    reporter.onError({
      message: 'Loading https://login.example.test/auth?state=private-login-state',
    })
    reporter.onStdOut('private-stdout\n')
    reporter.onStdErr(Buffer.from('private-stderr\n'))
    reporter.onStdErr(
      '[LEXIS navigation] 2026-09-14T21:52:45.534Z attempt 1: document transport failure; retry in 5000ms\n',
    )
    reporter.onEnd({ status: 'failed' } as FullResult)

    const log = output.mock.calls.flat().join('\n')
    expect(log).not.toContain('private-')
    expect(log).not.toMatch(/Cookie:|Authorization:|X-XSRF-TOKEN:|state=/)
    expect(log).toContain('Transport failure: ECONNREFUSED')
    expect(log).toContain('e2e/regression.spec.ts:2304:24')
    expect(log).toContain('document transport failure; retry in 5000ms')
    expect(log).toContain('Regression failed: 1 failed')
  })

  it('rejects raw JSON, encoded secrets and text appended to allowed recovery messages', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const reporter = new SafeRegressionReporter()
    const secret = 'synthetic/session+token=value'
    const privateValues = [
      secret,
      encodeURIComponent(secret),
      Buffer.from(secret).toString('base64'),
    ]
    for (const value of privateValues) {
      reporter.onStdOut(
        JSON.stringify({ authorization: value, customer: 'synthetic-business-value' }),
      )
      reporter.onStdErr(Buffer.from(`process warning: ${value}\n`))
      reporter.onStdErr(
        `[LEXIS request] 2026-09-14T21:52:45.534Z attempt 1: connection refused before send; retry in 5000ms ${value}\n`,
      )
      reporter.onError({ message: value, stack: `Error: ${value}`, snippet: value })
    }
    const log = output.mock.calls.flat().join('\n')
    for (const value of privateValues) expect(log).not.toContain(value)
    expect(log).not.toContain('synthetic-business-value')
    expect(log).not.toContain('connection refused before send')
    expect(output).toHaveBeenCalledTimes(privateValues.length)
  })

  it.each([
    ['LEXIS frontend resource returned HTTP 403.', 'Frontend HTTP 403'],
    [
      'locator.waitFor: Timeout 30000ms exceeded. heading private-record',
      'Expected page content did not render',
    ],
    ['Unable to click IDIR login button from private-url', 'Login did not complete'],
    ['Timeout 30000ms exceeded. private-details', 'Operation timed out'],
    ['Expected private-value to equal private-other-value', 'Assertion or application error'],
  ])('reports a safe category for %s', (message, category) => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    new SafeRegressionReporter().onError({ message })
    expect(output).toHaveBeenCalledExactlyOnceWith(`  ${category}`)
  })
})
