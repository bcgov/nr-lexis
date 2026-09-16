import type { APIResponse, Page } from '@playwright/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWithAuth, postWithCsrf } from '../../../e2e/utils/regression-auth'
import {
  regressionSubmissionFile,
  resolveRegressionSubmission,
} from '../../../e2e/utils/regression-fixtures'

vi.mock('../../../e2e/utils/regression-auth', () => ({
  getWithAuth: vi.fn(),
  postWithCsrf: vi.fn(),
}))

const page = {} as Page
const packageNumber = 'E2E-UNIT-RUN'
const response = (payload: unknown, status = 200) =>
  ({ status: () => status, json: async () => payload }) as APIResponse
const validated = () => response({ status: 'validated', packageNumber, scaleRows: 3, errors: [] })
const rejected = (errors: unknown) => response({ status: 'rejected', errors }, 422)
const record = (id: number) => ({
  application: id,
  summary: {
    ownerClientNumber: String(90_000_000 + id),
    ownerClientLocationCode: '01',
    orgUnitNumber: 1903,
    ownerContactName: 'PRIVATE SOURCE CONTACT',
    productLocation: 'PRIVATE SOURCE LOCATION',
    applicationVolume: 98765,
  },
  scales: [{ timberMark: `REF${id}` }],
  endUses: [{ code: 'SL', description: 'Sawlog' }],
})

const stubRecords = (records: ReturnType<typeof record>[]) => {
  vi.mocked(getWithAuth).mockImplementation(async (_page, path, options) => {
    if (path === '/api/lexis/applications/search') return response({ results: records })
    const params = options?.params as Record<string, string>
    if (path.endsWith('/end-uses-for-species-region')) {
      return response(
        records.find((item) => String(item.summary.orgUnitNumber) === params.orgUnitNumber)
          ?.endUses ?? [],
      )
    }
    const candidate = records.find((item) => String(item.application) === params.applicationNumber)
    if (path.endsWith('/application-summary')) return response(candidate?.summary)
    if (path.endsWith('/unique-scales')) return response(candidate?.scales)
    throw new Error('Unexpected fixture lookup')
  })
}

describe('regression lifecycle fixtures', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(postWithCsrf).mockResolvedValue(validated())
  })

  it('resolves runtime keys and preflights a fresh synthetic payload without changing source records', async () => {
    const source = record(1)
    source.scales = [{ timberMark: 'REF&<1>' }]
    stubRecords([source])
    const fixture = await resolveRegressionSubmission(page, packageNumber)
    expect(fixture.ownerClientNumber).toBe(source.summary.ownerClientNumber)
    expect(fixture.endUseCode).toBe('SL')
    expect(fixture.xml).toContain(`<lexis:boomNumber>${packageNumber}</lexis:boomNumber>`)
    expect(fixture.xml).toContain('<lexis:bcForestRegionCode>RCB</lexis:bcForestRegionCode>')
    expect(fixture.xml).toContain('<lexis:speciesEndUseSort>HE/SL</lexis:speciesEndUseSort>')
    expect(getWithAuth).toHaveBeenCalledWith(
      page,
      '/api/lexis/rpc/application-details/end-uses-for-species-region',
      {
        params: { orgUnitNumber: '1903', speciesJSON: '["HE"]' },
      },
    )
    expect(fixture.xml).toContain('<lexis:timberMark>REF&amp;&lt;1&gt;</lexis:timberMark>')
    expect(fixture.xml.match(/<lexis:harvestedTimber>/g)).toHaveLength(3)
    expect(fixture.xml).not.toMatch(/PRIVATE SOURCE|98765/)
    expect(getWithAuth).toHaveBeenNthCalledWith(1, page, '/api/lexis/applications/search', {
      params: expect.objectContaining({ packageNumber: '%', size: '25', page: '0' }),
    })
    expect(postWithCsrf).toHaveBeenCalledExactlyOnceWith(
      page,
      '/api/lexis/application-submissions/validation',
      { multipart: regressionSubmissionFile(packageNumber, fixture.xml) },
    )

    const nextSource = record(2)
    stubRecords([nextSource])
    const next = await resolveRegressionSubmission(page, 'E2E-NEXT-RUN')
    expect(next.ownerClientNumber).toBe(nextSource.summary.ownerClientNumber)
    expect(next.xml).toContain('E2E-NEXT-RUN')
    expect(next.xml).not.toContain(source.summary.ownerClientNumber)
  })

  it('skips incomplete and unsupported reference contexts and applications with no remaining scales', async () => {
    const missingLocation = record(1)
    missingLocation.summary.ownerClientLocationCode = ''
    const unsupportedRegion = record(2)
    unsupportedRegion.summary.orgUnitNumber = 9999
    const noScales = record(3)
    noScales.scales = []
    const usable = record(4)
    stubRecords([missingLocation, unsupportedRegion, noScales, usable])
    expect((await resolveRegressionSubmission(page, packageNumber)).ownerClientNumber).toBe(
      usable.summary.ownerClientNumber,
    )
    expect(postWithCsrf).toHaveBeenCalledTimes(1)
  })

  it('uses the selected region lookup instead of a fixed end-use or a historical business value', async () => {
    const unsupported = record(1)
    unsupported.endUses = []
    const supported = record(2)
    supported.summary.orgUnitNumber = 1910
    supported.endUses = [{ code: 'PL', description: 'Pulp' }]
    stubRecords([unsupported, supported])
    const fixture = await resolveRegressionSubmission(page, packageNumber)
    expect(fixture.xml).toContain('<lexis:bcForestRegionCode>RWC</lexis:bcForestRegionCode>')
    expect(fixture.xml).toContain('<lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>')
    expect(fixture.endUseCode).toBe('PL')
    expect(postWithCsrf).toHaveBeenCalledTimes(1)
  })

  it('fails an end-use lookup outage before validation instead of using a guessed code', async () => {
    stubRecords([record(1)])
    const lookup = vi.mocked(getWithAuth).getMockImplementation()!
    vi.mocked(getWithAuth).mockImplementation((...args) =>
      args[1].endsWith('/end-uses-for-species-region')
        ? Promise.resolve(response({ message: 'PRIVATE BODY' }, 503))
        : lookup(...args),
    )
    await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
      'Regression reference lookup failed.',
    )
    expect(postWithCsrf).not.toHaveBeenCalled()
  })

  it.each([
    'Application owner location does not exist.',
    'Application region does not exist.',
    'Timber mark REF1 does not exist.',
    'Timber mark REF1 is not valid for this region.',
    'Timber mark REF1 is not valid for provincial applications.',
    'Timber mark REF1 is not valid for this scale due to a status of X.',
  ])('tries another reference only after the explicit rejection: %s', async (error) => {
    stubRecords([record(1), record(2)])
    vi.mocked(postWithCsrf).mockResolvedValueOnce(rejected([error]))
    expect((await resolveRegressionSubmission(page, packageNumber)).ownerClientNumber).toBe(
      record(2).summary.ownerClientNumber,
    )
    expect(postWithCsrf).toHaveBeenCalledTimes(2)
  })

  it('does not repeatedly validate the same unavailable keys from different applications', async () => {
    const duplicate = { ...record(1), application: 2 }
    stubRecords([record(1), duplicate, record(3)])
    vi.mocked(postWithCsrf).mockResolvedValueOnce(
      rejected(['Application owner location does not exist.']),
    )
    expect((await resolveRegressionSubmission(page, packageNumber)).ownerClientNumber).toBe(
      record(3).summary.ownerClientNumber,
    )
    expect(postWithCsrf).toHaveBeenCalledTimes(2)
  })

  it.each([
    { errors: ['Invalid XML schema.'] },
    { errors: ['The application species/enduse sort is not valid for the selected region.'] },
    {
      errors: ['Application owner location does not exist.', 'Submission service is unavailable.'],
    },
    { errors: [] },
  ])(
    'fails other validation errors instead of searching until a test passes: %j',
    async ({ errors }) => {
      stubRecords([record(1), record(2)])
      vi.mocked(postWithCsrf).mockResolvedValueOnce(rejected(errors))
      await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
        'preflight failed beyond reference availability',
      )
      expect(postWithCsrf).toHaveBeenCalledTimes(1)
    },
  )

  it.each([401, 403, 500, 503])(
    'fails HTTP %i without trying a different reference',
    async (status) => {
      stubRecords([record(1), record(2)])
      vi.mocked(postWithCsrf).mockResolvedValueOnce(response({ message: 'PRIVATE BODY' }, status))
      await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
        'Regression submission preflight request failed.',
      )
      expect(postWithCsrf).toHaveBeenCalledTimes(1)
    },
  )

  it('fails a lookup outage without making any submission request', async () => {
    vi.mocked(getWithAuth).mockResolvedValue(response({ message: 'PRIVATE BODY' }, 503))
    await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
      'Regression reference lookup failed.',
    )
    expect(postWithCsrf).not.toHaveBeenCalled()
  })

  it('reports missing external reference data without skipping or provisioning registry records', async () => {
    stubRecords([])
    await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
      'Regression reference data unavailable',
    )
    expect(postWithCsrf).not.toHaveBeenCalled()
  })

  it('bounds discovery even when every historical reference is obsolete', async () => {
    stubRecords(Array.from({ length: 26 }, (_, index) => record(index + 1)))
    vi.mocked(postWithCsrf).mockResolvedValue(
      rejected(['Application owner location does not exist.']),
    )
    await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
      'Regression reference data unavailable',
    )
    expect(postWithCsrf).toHaveBeenCalledTimes(25)
    expect(getWithAuth).toHaveBeenCalledTimes(52)
  })
})
