#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const DEFAULT_CASES_FILE = 'tools/report-parity-cases.json'
const DEFAULT_MODERN_BASE = 'http://localhost:8080/api/lexis/reports'
const DEFAULT_TIMEOUT_MS = 120_000
const RETIRED_ACTION_MAPPINGS = new Set(['generateIndustryCSV', 'generateIndustryPDF'])
const TRANSPORT_EXPECTATIONS = {
  CSV: {
    contentTypes: ['application/vnd.ms-excel'],
    extension: 'csv',
    magicDescription: 'comma-delimited text',
    matchesMagic: (body) => looksLikeCsv(body),
  },
  PDF: {
    contentTypes: ['application/pdf'],
    extension: 'pdf',
    magicDescription: '%PDF-',
    matchesMagic: (body) => startsWithBytes(body, Buffer.from('%PDF-', 'ascii')),
  },
  XLS: {
    contentTypes: ['application/vnd.ms-excel'],
    extension: 'xls',
    magicDescription: 'D0CF11E0A1B11AE1',
    matchesMagic: (body) =>
      startsWithBytes(body, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
  XLSX: {
    contentTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    extension: 'xlsx',
    magicDescription: 'PK\\x03\\x04',
    matchesMagic: (body) => startsWithBytes(body, Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  },
}

const args = process.argv.slice(2)

function usage() {
  return `Usage: node tools/compare-report-parity.mjs [options]

Compares modern Spring/Jasper report output with reference application report output.

Options:
  --cases <path>           Case manifest path. Default: ${DEFAULT_CASES_FILE}
  --case <id>              Run one case id. Can be supplied more than once.
  --modern-base <url>      Modern report base URL. Default: ${DEFAULT_MODERN_BASE}
  --legacy-base <url>      Legacy app base URL. Required unless LEGACY_REPORT_BASE_URL is set.
  --out-dir <path>         Save modern/legacy report bytes and metadata for each executed case.
  --timeout-ms <ms>        Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --list                   List available cases and exit.
  --validate               Validate the case manifest and exit without making requests.
  --strict-env             Fail instead of skipping cases with missing \${ENV_VAR} placeholders.
  --exact-binary           Compare every case by exact bytes, including PDF/XLS metadata outputs.
  --help                   Show this help.

Auth headers:
  REPORT_PARITY_COOKIE, MODERN_REPORT_COOKIE, LEGACY_REPORT_COOKIE
  REPORT_PARITY_AUTHORIZATION, MODERN_REPORT_AUTHORIZATION, LEGACY_REPORT_AUTHORIZATION
  REPORT_PARITY_CSRF_TOKEN, MODERN_REPORT_CSRF_TOKEN, LEGACY_REPORT_CSRF_TOKEN

Common example:
  LEGACY_REPORT_BASE_URL=http://localhost:8081/nr-lexis \\
  REPORT_PARITY_COOKIE='SESSION=...' \\
  REPORT_REGION=1904 REPORT_SCHEDULE_ID=12345 PERMIT_NUMBER=900100 \\
  node tools/compare-report-parity.mjs --modern-base http://localhost:8080/api/lexis/reports
`
}

function parseArgs(rawArgs) {
  const options = {
    casesFile: process.env.REPORT_PARITY_CASES ?? DEFAULT_CASES_FILE,
    modernBase: process.env.MODERN_REPORT_BASE_URL ?? DEFAULT_MODERN_BASE,
    legacyBase: process.env.LEGACY_REPORT_BASE_URL ?? '',
    outDir: process.env.REPORT_PARITY_OUTPUT_DIR ?? '',
    timeoutMs: process.env.REPORT_PARITY_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`,
    caseIds: new Set(),
    list: false,
    validate: false,
    strictEnv: false,
    exactBinary: false,
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--cases') {
      options.casesFile = requireValue(rawArgs, ++index, arg)
      continue
    }
    if (arg === '--case') {
      options.caseIds.add(requireValue(rawArgs, ++index, arg))
      continue
    }
    if (arg === '--modern-base') {
      options.modernBase = requireValue(rawArgs, ++index, arg)
      continue
    }
    if (arg === '--legacy-base') {
      options.legacyBase = requireValue(rawArgs, ++index, arg)
      continue
    }
    if (arg === '--out-dir') {
      options.outDir = requireValue(rawArgs, ++index, arg)
      continue
    }
    if (arg === '--timeout-ms') {
      options.timeoutMs = requireValue(rawArgs, ++index, arg)
      continue
    }
    if (arg === '--list') {
      options.list = true
      continue
    }
    if (arg === '--validate') {
      options.validate = true
      continue
    }
    if (arg === '--strict-env') {
      options.strictEnv = true
      continue
    }
    if (arg === '--exact-binary') {
      options.exactBinary = true
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  options.timeoutMs = parsePositiveInteger(options.timeoutMs, '--timeout-ms')
  return options
}

function parsePositiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new Error(`${label} must be a positive integer`)
  }
  return Number(value)
}

function requireValue(values, index, option) {
  const value = values[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${option}`)
  }
  return value
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function joinUrl(base, path) {
  const normalizedBase = trimTrailingSlash(base)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function headersFor(prefix) {
  const headers = {}
  const sharedCookie = process.env.REPORT_PARITY_COOKIE
  const specificCookie = process.env[`${prefix}_REPORT_COOKIE`]
  const sharedAuthorization = process.env.REPORT_PARITY_AUTHORIZATION
  const specificAuthorization = process.env[`${prefix}_REPORT_AUTHORIZATION`]
  const sharedCsrf = process.env.REPORT_PARITY_CSRF_TOKEN
  const specificCsrf = process.env[`${prefix}_REPORT_CSRF_TOKEN`]

  if (specificCookie || sharedCookie) {
    headers.Cookie = specificCookie ?? sharedCookie
  }
  if (specificAuthorization || sharedAuthorization) {
    headers.Authorization = specificAuthorization ?? sharedAuthorization
  }
  if (specificCsrf || sharedCsrf) {
    headers['X-CSRF-TOKEN'] = specificCsrf ?? sharedCsrf
  }
  return headers
}

function resolveValue(value, missing) {
  if (typeof value !== 'string') {
    return value
  }
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (match, name) => {
    const envValue = process.env[name]
    if (envValue === undefined || envValue === '') {
      missing.add(name)
      return match
    }
    return envValue
  })
}

function resolveCase(rawCase) {
  const missing = new Set()
  const parameters = {}
  for (const [key, value] of Object.entries(rawCase.parameters ?? {})) {
    parameters[key] = resolveValue(value, missing)
  }

  return {
    ...rawCase,
    parameters,
    missingEnv: Array.from(missing).sort(),
  }
}

function modernPayload(testCase) {
  const parameters = { ...testCase.parameters }
  delete parameters.outputFormat
  if (testCase.actionMapping) {
    parameters.legacyActionMapping = testCase.actionMapping
  }
  return {
    parameters,
    format: testCase.format,
  }
}

function legacyUrl(baseUrl, testCase) {
  const url = new URL(joinUrl(baseUrl, testCase.legacyPath))
  if (testCase.actionMapping) {
    url.searchParams.set('actionMapping', testCase.actionMapping)
  }
  for (const [key, rawValue] of Object.entries(testCase.parameters ?? {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue
    }
    const values = key === 'region' || key === 'orgUnitNumber'
      ? String(rawValue).split(',').map((value) => value.trim()).filter(Boolean)
      : [String(rawValue)]
    values.forEach((value) => url.searchParams.append(key, value))
  }
  return url
}

async function fetchModern(baseUrl, testCase, timeoutMs) {
  const response = await fetch(joinUrl(baseUrl, `/${encodeURIComponent(testCase.reportId)}`), {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      ...headersFor('MODERN'),
      Accept: 'application/octet-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(modernPayload(testCase)),
  })
  return responseSummary(response, Buffer.from(await response.arrayBuffer()))
}

async function fetchLegacy(baseUrl, testCase, timeoutMs) {
  const response = await fetch(legacyUrl(baseUrl, testCase), {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      ...headersFor('LEGACY'),
      Accept: 'application/octet-stream',
    },
  })
  return responseSummary(response, Buffer.from(await response.arrayBuffer()))
}

function responseSummary(response, body) {
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    disposition: response.headers.get('content-disposition') ?? '',
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
    body,
  }
}

function filenameExtension(disposition) {
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)
  if (!match) {
    return ''
  }
  const filename = decodeURIComponent(match[1].replace(/"$/, ''))
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

function extensionForResult(result, fallbackFormat) {
  const dispositionExtension = filenameExtension(result.disposition)
  if (dispositionExtension) {
    return dispositionExtension
  }
  const contentType = normalizeContentType(result.contentType)
  if (contentType.includes('pdf')) {
    return 'pdf'
  }
  if (contentType.includes('csv') || contentType.includes('excel')) {
    return fallbackFormat.toLowerCase() === 'xls' ? 'xlsx' : fallbackFormat.toLowerCase()
  }
  if (contentType.includes('spreadsheet')) {
    return 'xlsx'
  }
  return fallbackFormat.toLowerCase()
}

function safeFileStem(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'report'
}

function normalizeContentType(contentType) {
  return contentType.split(';')[0].trim().toLowerCase()
}

function startsWithBytes(body, expectedPrefix) {
  return body.length >= expectedPrefix.length
    && body.subarray(0, expectedPrefix.length).equals(expectedPrefix)
}

function looksLikeCsv(body) {
  if (body.length === 0) {
    return false
  }
  const sampleBytes = body.subarray(0, Math.min(body.length, 4096))
  if (sampleBytes.includes(0)) {
    return false
  }
  const sample = sampleBytes.toString('utf8').replace(/^\uFEFF/, '').trimStart()
  if (/^(?:<!doctype\s+html|<html\b|<\?xml\b|[\[{])/i.test(sample)) {
    return false
  }
  return sample.includes(',')
}

function expectedFormat(testCase, source) {
  const requested = source === 'legacy'
    ? (testCase.parameters?.outputFormat ?? testCase.format)
    : testCase.format
  const normalized = String(requested ?? '').trim().toUpperCase()
  return source === 'modern' && normalized === 'XLS' ? 'XLSX' : normalized
}

function assertExpectedTransport(testCase, source, result, failures) {
  const format = expectedFormat(testCase, source)
  const expectation = TRANSPORT_EXPECTATIONS[format]
  if (!expectation) {
    failures.push(`${source} has no transport expectation for format ${format || '-'}`)
    return
  }

  const actualType = normalizeContentType(result.contentType)
  if (!expectation.contentTypes.includes(actualType)) {
    failures.push(
      `${source} content-type expected=${expectation.contentTypes.join('|')} actual=${actualType || '-'}`,
    )
  }

  const actualExtension = filenameExtension(result.disposition)
  if (actualExtension !== expectation.extension) {
    failures.push(
      `${source} filename extension expected=${expectation.extension} actual=${actualExtension || '-'}`,
    )
  }

  if (!expectation.matchesMagic(result.body)) {
    const actualMagic = result.body.subarray(0, 8).toString('hex').toUpperCase() || '-'
    failures.push(
      `${source} magic bytes expected=${expectation.magicDescription} actual=${actualMagic}`,
    )
  }
}

function compareResults(testCase, modern, legacy, exactBinary) {
  const failures = []
  if (modern.status !== legacy.status) {
    failures.push(`status modern=${modern.status} legacy=${legacy.status}`)
  }
  if (modern.status < 200 || modern.status >= 300) {
    failures.push(`modern returned non-success status ${modern.status}`)
  }
  if (legacy.status < 200 || legacy.status >= 300) {
    failures.push(`legacy returned non-success status ${legacy.status}`)
  }
  if (modern.bytes === 0) {
    failures.push('modern body is empty')
  }
  if (legacy.bytes === 0) {
    failures.push('legacy body is empty')
  }

  assertExpectedTransport(testCase, 'modern', modern, failures)
  assertExpectedTransport(testCase, 'legacy', legacy, failures)

  const compareMode = exactBinary ? 'exact' : (testCase.compare ?? 'metadata')
  if (compareMode === 'exact') {
    if (modern.sha256 !== legacy.sha256) {
      failures.push(`sha256 modern=${modern.sha256} legacy=${legacy.sha256}`)
    }
  }

  return failures
}

function printableSummary(result) {
  return `status=${result.status} bytes=${result.bytes} sha256=${result.sha256.slice(0, 16)} type=${normalizeContentType(result.contentType) || '-'}`
}

async function writeArtifacts(outputDirectory, testCase, modern, legacy, failures) {
  if (!outputDirectory) {
    return
  }
  await mkdir(outputDirectory, { recursive: true })

  const stem = safeFileStem(testCase.id)
  const modernExtension = extensionForResult(modern, testCase.format)
  const legacyExtension = extensionForResult(legacy, testCase.format)
  const modernPath = join(outputDirectory, `${stem}.modern.${modernExtension}`)
  const legacyPath = join(outputDirectory, `${stem}.legacy.${legacyExtension}`)
  const metadataPath = join(outputDirectory, `${stem}.metadata.json`)

  await Promise.all([
    writeFile(modernPath, modern.body),
    writeFile(legacyPath, legacy.body),
    writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          id: testCase.id,
          description: testCase.description,
          reportId: testCase.reportId,
          actionMapping: testCase.actionMapping,
          format: testCase.format,
          compare: testCase.compare ?? 'metadata',
          failures,
          modern: {
            path: modernPath,
            status: modern.status,
            contentType: modern.contentType,
            contentDisposition: modern.disposition,
            bytes: modern.bytes,
            sha256: modern.sha256,
          },
          legacy: {
            path: legacyPath,
            status: legacy.status,
            contentType: legacy.contentType,
            contentDisposition: legacy.disposition,
            bytes: legacy.bytes,
            sha256: legacy.sha256,
          },
        },
        null,
        2,
      )}\n`,
    ),
  ])
}

async function loadCases(casesFile) {
  const content = await readFile(resolve(casesFile), 'utf8')
  return JSON.parse(content)
}

function validateCases(cases) {
  if (!Array.isArray(cases)) {
    return ['manifest root must be an array']
  }

  const failures = []
  const ids = new Set()
  cases.forEach((testCase, index) => {
    const label = testCase?.id || `case[${index}]`
    for (const field of ['id', 'description', 'reportId', 'legacyPath', 'format', 'compare']) {
      if (typeof testCase?.[field] !== 'string' || testCase[field].trim() === '') {
        failures.push(`${label}: ${field} must be a non-blank string`)
      }
    }
    if (ids.has(testCase?.id)) {
      failures.push(`${label}: duplicate id`)
    }
    ids.add(testCase?.id)
    if (!['exact', 'metadata'].includes(testCase?.compare)) {
      failures.push(`${label}: compare must be exact or metadata`)
    }
    if (testCase?.parameters !== undefined
        && (testCase.parameters === null
          || Array.isArray(testCase.parameters)
          || typeof testCase.parameters !== 'object')) {
      failures.push(`${label}: parameters must be an object`)
    }
    if (RETIRED_ACTION_MAPPINGS.has(testCase?.actionMapping)) {
      failures.push(`${label}: actionMapping ${testCase.actionMapping} is retired`)
    }
    for (const source of ['modern', 'legacy']) {
      const format = expectedFormat(testCase ?? {}, source)
      if (!TRANSPORT_EXPECTATIONS[format]) {
        failures.push(`${label}: unsupported ${source} transport format ${format || '-'}`)
      }
    }
  })
  return failures
}

async function main() {
  const options = parseArgs(args)
  const cases = await loadCases(options.casesFile)
  const validationFailures = validateCases(cases)
  if (validationFailures.length > 0) {
    throw new Error(`Invalid report parity manifest:\n- ${validationFailures.join('\n- ')}`)
  }

  if (options.validate) {
    console.log(`Validated ${cases.length} report parity cases`)
    return
  }

  if (options.list) {
    cases.forEach((testCase) => {
      console.log(`${testCase.id}\t${testCase.compare ?? 'metadata'}\t${testCase.description}`)
    })
    return
  }

  if (options.caseIds.size > 0) {
    const knownCaseIds = new Set(cases.map((testCase) => testCase.id))
    const unknownCaseIds = Array.from(options.caseIds).filter((caseId) => !knownCaseIds.has(caseId))
    if (unknownCaseIds.length > 0) {
      throw new Error(`Unknown report parity case(s): ${unknownCaseIds.join(', ')}`)
    }
  }

  if (!options.legacyBase) {
    throw new Error('Missing --legacy-base or LEGACY_REPORT_BASE_URL')
  }

  const selectedCases = options.caseIds.size
    ? cases.filter((testCase) => options.caseIds.has(testCase.id))
    : cases
  if (selectedCases.length === 0) {
    throw new Error('No report parity cases selected')
  }

  let failed = 0
  let skipped = 0

  for (const rawCase of selectedCases) {
    const testCase = resolveCase(rawCase)
    if (testCase.missingEnv.length > 0) {
      const message = `${testCase.id}: missing env ${testCase.missingEnv.join(', ')}`
      if (options.strictEnv) {
        console.error(`FAIL ${message}`)
        failed += 1
      } else {
        console.log(`SKIP ${message}`)
        skipped += 1
      }
      continue
    }

    process.stdout.write(`RUN  ${testCase.id} ... `)
    const [modern, legacy] = await Promise.all([
      fetchModern(options.modernBase, testCase, options.timeoutMs),
      fetchLegacy(options.legacyBase, testCase, options.timeoutMs),
    ])
    const failures = compareResults(testCase, modern, legacy, options.exactBinary)
    await writeArtifacts(options.outDir, testCase, modern, legacy, failures)
    if (failures.length > 0) {
      failed += 1
      console.log('FAIL')
      console.log(`     modern ${printableSummary(modern)}`)
      console.log(`     legacy ${printableSummary(legacy)}`)
      failures.forEach((failure) => console.log(`     - ${failure}`))
    } else {
      console.log('PASS')
      console.log(`     modern ${printableSummary(modern)}`)
      console.log(`     legacy ${printableSummary(legacy)}`)
    }
  }

  console.log(`\nReport parity: ${selectedCases.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`)
  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
