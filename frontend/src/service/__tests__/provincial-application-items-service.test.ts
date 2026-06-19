import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addApplicationScaleToPackage,
  checkApplicationVolumeUsage,
  deleteApplicationScale,
  fetchApplicationPackageStatusCodes,
  fetchApplicationSummarySnapshot,
  fetchApplicationRemainingSpecies,
  fetchApplicationUniqueScales,
  saveApplicationRemark,
  updateApplicationSummary,
  updateApplicationPackage,
} from '@/service/provincial-application-items-service'

const { deleteMock, getCachedResponseMock, postMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getCachedResponseMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      delete: deleteMock,
      post: postMock,
    }),
    getCachedResponse: getCachedResponseMock,
  },
}))

describe('provincial-application-items-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads remaining species with legacy species JSON params', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [{ code: 'CE', description: 'Cedar' }],
    })

    const result = await fetchApplicationRemainingSpecies('12', 'LOG', ['FI'])

    expect(result).toEqual([{ code: 'CE', description: 'Cedar' }])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/remaining-species',
      {
        params: {
          orgUnitNumber: '12',
          productType: 'LOG',
          speciesJSON: '["FI"]',
        },
      },
      { ttlMs: 30000 },
    )
  })

  it('loads package status code options from the application detail RPC endpoint', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [{ code: 'ACT', description: 'Active' }],
    })

    const result = await fetchApplicationPackageStatusCodes()

    expect(result).toEqual([{ code: 'ACT', description: 'Active' }])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/package-status-codes',
      undefined,
      { ttlMs: 30000 },
    )
  })

  it('checks application volume usage without cached GET data', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        volumeUsedInd: false,
      },
    })

    const result = await checkApplicationVolumeUsage('321')

    expect(result).toEqual({ volumeUsed: false })
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/check-unused-volume',
      {
        params: {
          applicationNumber: '321',
        },
      },
      { ttlMs: 0 },
    )
  })

  it('loads unique application timber marks from the application detail RPC endpoint', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [{ timberMark: 'TM001' }, { timberMark: 'TM002' }, { timberMark: '' }],
    })

    const result = await fetchApplicationUniqueScales('321')

    expect(result).toEqual([{ timberMark: 'TM001' }, { timberMark: 'TM002' }])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/unique-scales',
      {
        params: {
          applicationNumber: '321',
        },
      },
      { ttlMs: 30000 },
    )
  })

  it('posts package updates as legacy url-encoded form fields', async () => {
    postMock.mockResolvedValue({
      data: {
        valid: true,
        packageNumber: 'PKG-2',
        errors: [],
        warnings: ['renamed'],
      },
    })

    const result = await updateApplicationPackage({
      packageNumber: 'PKG-1',
      newPackageNumber: 'PKG-2',
      applicationNumber: '321',
      volume: '100.0',
      averageLength: '12.0',
      averageDiameter: '24.0',
      status: 'ACT',
      comments: 'Ready',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'LOG',
      endUseCode: 'LU',
      speciesCodes: ['FI', 'CE'],
    })

    expect(result).toEqual({
      valid: true,
      packageNumber: 'PKG-2',
      errors: [],
      warnings: ['renamed'],
    })
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/package-update')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('packageNumber')).toBe('PKG-1')
    expect(body.get('newPackageNumber')).toBe('PKG-2')
    expect(body.get('packageDialogPackageVolume')).toBe('100.0')
    expect(body.get('packageDialogPackageStatus')).toBe('ACT')
    expect(body.get('updatePackageEndUse')).toBe('LU')
    expect(body.get('updatePackageSpeciesTableValues')).toBe('FI,CE')
  })

  it('posts package scale adds and normalizes the persisted row', async () => {
    postMock.mockResolvedValue({
      data: {
        valid: true,
        result: {
          timberMark: 'TM001',
          pieces: '5',
          species: 'Douglas-fir',
          grade: 'Sawlog',
          volume: '20.0',
          id: '55',
          cascadeSplitCode: 'S',
        },
        errors: [],
        warnings: [],
      },
    })

    const result = await addApplicationScaleToPackage({
      timberMark: 'TM001',
      packageNumber: 'PKG-1',
      gradeCode: '1',
      speciesCode: 'FI',
      applicationNumber: '321',
      pieces: '5',
      volume: '20.0',
    })

    expect(result.result).toEqual({
      permitted: false,
      timberMark: 'TM001',
      species: 'Douglas-fir',
      pieces: 5,
      grade: 'Sawlog',
      volume: '20.0',
      id: '55',
      cascadeSplitCode: 'S',
    })
    const [path, body] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/package-scale')
    expect(body.get('timberMark')).toBe('TM001')
    expect(body.get('packageNumber')).toBe('PKG-1')
    expect(body.get('gradeCode')).toBe('1')
    expect(body.get('speciesCode')).toBe('FI')
    expect(body.get('applicationNumber')).toBe('321')
    expect(body.get('scalePieces')).toBe('5')
    expect(body.get('scaleVolume')).toBe('20.0')
  })

  it('posts application remarks as legacy url-encoded form fields', async () => {
    postMock.mockResolvedValue({
      data: {
        status: 'ok',
        remarkId: '88',
        remark: 'New note',
        title: 'New note',
        user: 'idir\\jsmith',
      },
    })

    const result = await saveApplicationRemark({
      applicationNumber: '321',
      remarkBody: 'New note',
    })

    expect(result).toEqual({
      success: true,
      status: 'ok',
      remarkId: '88',
      remark: 'New note',
      title: 'New note',
      user: 'idir\\jsmith',
    })
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/remark')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('remarkId')).toBe('new')
    expect(body.get('applicationNumber')).toBe('321')
    expect(body.get('remarkBody')).toBe('New note')
  })

  it('posts application summary updates as legacy url-encoded form fields', async () => {
    postMock.mockResolvedValue({
      data: {
        valid: true,
        message: 'The application was saved successfully.',
        applicationNumber: '321',
        errors: [],
        warnings: [],
      },
    })

    const result = await updateApplicationSummary({
      applicationNumber: '321',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '45',
      applicationVolume: '125.5',
      averageLogVolume: '2.1',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      applicationStatusCode: 'NEW',
      applicantTypeCode: 'A',
      orgUnitNumber: '12',
      productTypeCode: 'H',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI', 'CE'],
    })

    expect(result).toEqual({
      valid: true,
      message: 'The application was saved successfully.',
      applicationNumber: '321',
      errors: [],
      warnings: [],
    })
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/application-summary')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('applicationNumber')).toBe('321')
    expect(body.get('applicationDate')).toBe('2026-01-01')
    expect(body.get('receivedDate')).toBe('2026-01-02')
    expect(body.get('termDays')).toBe('45')
    expect(body.get('applicationVolume')).toBe('125.5')
    expect(body.get('averageLogVolume')).toBe('2.1')
    expect(body.get('exemptionReasonCode')).toBe('U')
    expect(body.get('productLocation')).toBe('BC')
    expect(body.get('exportScheduleId')).toBe('987')
    expect(body.get('agentClientNumber')).toBe('00033344')
    expect(body.get('agentClientLocationCode')).toBe('01')
    expect(body.get('ownerClientNumber')).toBe('00011122')
    expect(body.get('ownerClientLocationCode')).toBe('00')
    expect(body.get('applicationStatusCode')).toBe('NEW')
    expect(body.get('applicantType')).toBe('A')
    expect(body.get('orgUnitNumber')).toBe('12')
    expect(body.get('productTypeCode')).toBe('H')
    expect(body.get('jurisdictionCode')).toBe('P')
    expect(body.get('growthTypeCode')).toBe('O')
    expect(body.get('agentContactName')).toBe('Agent Contact')
    expect(body.get('ownerContactName')).toBe('Owner Contact')
    expect(body.get('oicIndicator')).toBe('N')
    expect(body.get('applicationEndUseCode')).toBe('LU')
    expect(body.get('applicationSelectedSpecies')).toBe('FI,CE')
  })

  it('loads editable application summary snapshot fields', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        applicationNumber: 321,
        federalApplicationNumber: 654,
        applicationDate: '2026-01-01',
        termDays: 45,
        receivedDate: '2026-01-02',
        applicationVolume: 125.5,
        averageLogVolume: 2.1,
        productLocation: 'BC',
        exportScheduleId: 987,
        agentClientNumber: '00033344',
        agentClientLocationCode: '01',
        ownerClientNumber: '00011122',
        ownerClientLocationCode: '00',
        exemptionNumber: 'EX-555',
        exemptionReasonCode: 'U',
        applicationStatusCode: 'NEW',
        applicantTypeCode: 'A',
        orgUnitNumber: 12,
        productTypeCode: 'H',
        jurisdictionCode: 'P',
        growthTypeCode: 'O',
        agentContactName: 'Agent Contact',
        ownerContactName: 'Owner Contact',
        oicIndicator: 'N',
        endUseCode: 'LU',
        speciesCodes: ['FI', 'CE'],
      },
    })

    const result = await fetchApplicationSummarySnapshot('321')

    expect(result).toMatchObject({
      applicationNumber: '321',
      federalApplicationNumber: '654',
      productLocation: 'BC',
      ownerClientLocationCode: '00',
      agentContactName: 'Agent Contact',
      endUseCode: 'LU',
      speciesCodes: ['FI', 'CE'],
    })
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/application-summary',
      {
        params: { applicationNumber: '321' },
      },
      { ttlMs: 30000 },
    )
  })

  it('deletes scales through the modern item endpoint', async () => {
    deleteMock.mockResolvedValue({
      status: 200,
      data: {
        success: true,
      },
    })

    const result = await deleteApplicationScale('55', '321')

    expect(result).toEqual({ success: true })
    expect(deleteMock).toHaveBeenCalledWith('/lexis/rpc/application-details/scale', {
      params: {
        applicationNumber: '321',
        scaleId: '55',
      },
    })
  })
})
