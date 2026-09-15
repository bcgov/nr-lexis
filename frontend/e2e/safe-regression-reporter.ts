import path from 'node:path'
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter'

const RECOVERY_MESSAGE =
  /^\[LEXIS (?:navigation|runtime config|request)\] \d{4}-\d{2}-\d{2}T[\d:.]+Z attempt \d+: (?:document transport failure|frontend resource transport failure|empty app shell|pending frontend resource|transport failure|(?:frontend )?HTTP 50[234]|connection refused before send); retry in \d+ms$/

const failureCategory = (error: TestError): string => {
  const message = error.message ?? ''
  const transport = message.match(
    /\b(?:ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_ABORTED|ERR_FAILED|ERR_TIMED_OUT|ERR_NAME_NOT_RESOLVED)\b/,
  )
  if (transport) return `Transport failure: ${transport[0]}`
  const http = message.match(/LEXIS frontend resource returned HTTP (\d{3})\./)
  if (http) return `Frontend HTTP ${http[1]}`
  if (/Process from config\.webServer was not able to start/.test(message))
    return 'Local test server failed to start'
  if (/No tests found/.test(message)) return 'No matching regression tests'
  if (/browserType\.launch/.test(message)) return 'Browser launch failed'
  if (/locator\.waitFor: Timeout/.test(message)) return 'Expected page content did not render'
  if (
    /login did not establish|login was rejected|Unable to (?:click|find).*login button/.test(
      message,
    )
  )
    return 'Login did not complete'
  if (/Timeout|timed out/.test(message)) return 'Operation timed out'
  return 'Assertion or application error'
}

// Credentialed runs are public. Playwright's normal error renderer includes request headers,
// page snippets and assertion values, so print static test metadata and failure categories only.
export default class SafeRegressionReporter implements Reporter {
  private suite?: Suite
  private completed = 0

  onBegin(_config: FullConfig, suite: Suite) {
    this.suite = suite
    console.log(`Running ${suite.allTests().length} regression tests`)
  }

  private printError(error: TestError) {
    console.log(`  ${failureCategory(error)}`)
    // Retain source locations, never the source excerpt or the raw error/cause text.
    const locations = (error.stack ?? '')
      .split('\n')
      .filter((line) => /^\s+at /.test(line))
      .map((line) => line.match(/\b(e2e\/[A-Za-z0-9_./-]+\.ts:\d+:\d+)\)?$/)?.[1])
      .filter((location): location is string => Boolean(location))
    for (const location of [...new Set(locations)].slice(0, 4)) console.log(`    at ${location}`)
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.completed += 1
    console.log(
      `[${this.completed}/${this.suite?.allTests().length ?? '?'}] ${result.status}: ${path.basename(test.location.file)}:${test.location.line} ${test.title}`,
    )
    for (const error of result.errors) this.printError(error)
  }

  onError(error: TestError) {
    this.printError(error)
  }

  onStdOut(chunk: string | Buffer) {
    for (const line of chunk.toString().trim().split(/\r?\n/)) {
      if (RECOVERY_MESSAGE.test(line)) console.log(line)
    }
  }

  onStdErr(chunk: string | Buffer) {
    this.onStdOut(chunk)
  }

  onEnd(result: FullResult) {
    const outcomes = new Map<string, number>()
    for (const test of this.suite?.allTests() ?? []) {
      const status = test.results.at(-1)?.status ?? 'not run'
      outcomes.set(status, (outcomes.get(status) ?? 0) + 1)
    }
    console.log(
      `Regression ${result.status}: ${[...outcomes].map(([status, count]) => `${count} ${status}`).join(', ')}`,
    )
  }
}
