import type { APIResponse, Page } from '@playwright/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWithAuth, postWithCsrf } from '../../../e2e/utils/regression-auth'
import {
  regressionSubmissionFile,
  regressionSubmissionVariants,
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
  grades: { HE: ['H', 'J'], FI: ['J'] } as Record<string, string[]>,
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
    if (path.endsWith('/grade-codes')) {
      const regionRecord = records.find(
        (item) => String(item.summary.orgUnitNumber) === params.orgUnitNumber,
      )
      return response(
        (regionRecord?.grades[params.speciesCode] ?? []).map((code) => ({
          code,
          description: code,
        })),
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
    expect(fixture.xml).toContain(
      '<lexis:contactTelephoneNumber>2505551212</lexis:contactTelephoneNumber>',
    )
    expect(getWithAuth).toHaveBeenCalledWith(
      page,
      '/api/lexis/rpc/application-details/end-uses-for-species-region',
      {
        params: { orgUnitNumber: '1903', speciesJSON: '["HE"]' },
      },
    )
    expect(getWithAuth).toHaveBeenCalledWith(
      page,
      '/api/lexis/rpc/application-details/grade-codes',
      { params: { orgUnitNumber: '1903', speciesCode: 'HE' } },
    )
    expect(getWithAuth).toHaveBeenCalledWith(
      page,
      '/api/lexis/rpc/application-details/grade-codes',
      { params: { orgUnitNumber: '1903', speciesCode: 'FI' } },
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

  it.each([
    { label: 'hemlock grade J', grades: { HE: ['H'], FI: ['J'] } },
    { label: 'hemlock grade H', grades: { HE: ['J'], FI: ['J'] } },
    { label: 'fir grade J', grades: { HE: ['H', 'J'], FI: ['H'] } },
    { label: 'fir', grades: { HE: ['H', 'J'], FI: [] } },
  ])('skips a region that does not list $label', async ({ grades }) => {
    const unsupported = record(1)
    unsupported.grades = grades
    const supported = record(2)
    supported.summary.orgUnitNumber = 1910
    stubRecords([unsupported, supported])
    const fixture = await resolveRegressionSubmission(page, packageNumber)
    expect(fixture.ownerClientNumber).toBe(supported.summary.ownerClientNumber)
    expect(fixture.xml).toContain('<lexis:bcForestRegionCode>RWC</lexis:bcForestRegionCode>')
    expect(postWithCsrf).toHaveBeenCalledTimes(1)
    expect(getWithAuth).not.toHaveBeenCalledWith(
      page,
      '/api/lexis/rpc/application-details/unique-scales',
      { params: { applicationNumber: '1' } },
    )
  })

  it('looks up the grades of a region once for all of its applications', async () => {
    stubRecords([record(1), record(2)])
    vi.mocked(postWithCsrf).mockResolvedValueOnce(
      rejected(['Application owner location does not exist.']),
    )
    await resolveRegressionSubmission(page, packageNumber)
    const gradeLookups = vi
      .mocked(getWithAuth)
      .mock.calls.filter(([, path]) => path.endsWith('/grade-codes'))
    expect(gradeLookups).toHaveLength(2)
  })

  it('fails a grade lookup outage before validation instead of guessing the grades', async () => {
    stubRecords([record(1)])
    const lookup = vi.mocked(getWithAuth).getMockImplementation()!
    vi.mocked(getWithAuth).mockImplementation((...args) =>
      args[1].endsWith('/grade-codes')
        ? Promise.resolve(response({ message: 'PRIVATE BODY' }, 503))
        : lookup(...args),
    )
    await expect(resolveRegressionSubmission(page, packageNumber)).rejects.toThrow(
      'Regression reference lookup failed.',
    )
    expect(postWithCsrf).not.toHaveBeenCalled()
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
    'Species code HE is not valid for this region.',
    'Grade code H is not valid for species HE in this region.',
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
    expect(getWithAuth).toHaveBeenCalledTimes(54)
  })
})

describe('regression submission variants', () => {
  const baseXml = async () => {
    stubRecords([record(1)])
    vi.mocked(postWithCsrf).mockResolvedValue(validated())
    return (await resolveRegressionSubmission(page, packageNumber)).xml
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('edits only the values each refusal depends on', async () => {
    const xml = await baseXml()
    const [decimals, pieces, telephone, region] = regressionSubmissionVariants(xml)

    expect(decimals.xml).toBe(
      xml.replace('<lexis:quantityVolume>0.5<', '<lexis:quantityVolume>0.55<'),
    )
    expect(pieces.xml.match(/<lexis:numberOfPieces>0<\/lexis:numberOfPieces>/g)).toHaveLength(3)
    expect(pieces.xml).not.toMatch(/<lexis:numberOfPieces>[1-9]/)
    expect(telephone.xml).not.toContain('contactTelephoneNumber')
    expect(telephone.xml).toContain('<lexis:contactFirstname>E2E</lexis:contactFirstname>')
    expect(region.xml).toBe(
      xml.replace('<lexis:bcForestRegionCode>RCB<', '<lexis:bcForestRegionCode>RSI<'),
    )
    expect(regressionSubmissionVariants(xml).map(({ xml: edited }) => edited)).not.toContain(xml)
  })

  it('names the refusal each variant must produce', async () => {
    const variants = regressionSubmissionVariants(await baseXml())

    expect(
      variants.map(({ label, expectedErrors, match }) => ({ label, expectedErrors, match })),
    ).toEqual([
      {
        label: 'a scale total with two decimals',
        expectedErrors: [
          'The total scale volume (525.05) must have no more than one decimal place.',
        ],
        match: 'exact',
      },
      {
        label: 'scale volume without pieces',
        expectedErrors: [
          'The total number of scale pieces must be greater than 0 when the scales have a volume.',
        ],
        match: 'exact',
      },
      {
        label: 'no contact telephone number',
        expectedErrors: ['Applicant contact telephone number is required.'],
        match: 'exact',
      },
      {
        label: 'a retired region code',
        expectedErrors: [
          'Forest region code RSI is not a valid BC forest region code (RCB, RKB, RNO, ROM, RSC, RSK, RTO, RWC).',
        ],
        match: 'contains',
      },
    ])
  })

  it('fails instead of returning a copy that was not edited', () => {
    expect(() => regressionSubmissionVariants('<empty/>')).toThrow(
      'Regression submission XML no longer has the element to edit.',
    )
  })
})
