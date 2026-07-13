import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchProvincialExemptionCreatePreview,
  submitProvincialApplicationCreate,
  submitProvincialExemptionCreate,
  submitProvincialOfferCreate,
  submitProvincialOfferUpdate,
} from '@/service/create-submit-service'

const postMock = vi.fn()
const getMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
    }),
  },
}))

describe('create-submit-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('loads a strict exemption create preview for every selected application', async () => {
    getMock.mockResolvedValue({
      data: {
        valid: true,
        exemptionTypeCode: 'M',
        exemptionStatusCode: 'NEW',
        approvedVolume: '300.6',
        expiryDate: '2026-10-10',
        applicationNumbers: [123, 124],
        errors: [],
      },
    })

    const result = await fetchProvincialExemptionCreatePreview(['123', '124'])

    expect(result).toEqual({
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvedVolume: '300.6',
      expiryDate: '2026-10-10',
      applicationNumbers: ['123', '124'],
    })
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, config] = getMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/exemption-details/create-preview')
    expect(config.params).toBeInstanceOf(URLSearchParams)
    expect(config.params.getAll('applicationNumbers')).toEqual(['123', '124'])
  })

  it('fails closed when an exemption create preview omits a selected application', async () => {
    getMock.mockResolvedValue({
      data: {
        valid: true,
        exemptionTypeCode: 'M',
        exemptionStatusCode: 'NEW',
        approvedVolume: '100.0',
        expiryDate: '2026-10-10',
        applicationNumbers: [123],
        errors: [],
      },
    })

    await expect(fetchProvincialExemptionCreatePreview(['123', '124'])).rejects.toThrow(
      'LEXIS returned an invalid exemption preview.',
    )
  })

  it('rejects a non-ministerial selected-application preview', async () => {
    getMock.mockResolvedValue({
      data: {
        valid: true,
        exemptionTypeCode: 'B',
        exemptionStatusCode: 'ACT',
        approvedVolume: '9999999.9',
        expiryDate: '2026-10-10',
        applicationNumbers: [123],
        errors: [],
      },
    })

    await expect(fetchProvincialExemptionCreatePreview(['123'])).rejects.toThrow(
      'LEXIS returned an invalid exemption preview.',
    )
  })

  it('posts provincial application create payload as url-encoded form', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'saved',
        applicationNumber: '1001',
      },
    })

    const result = await submitProvincialApplicationCreate({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      applicantTypeCode: 'O',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-01',
      applicationTermDays: '30',
      receivedDate: '2026-01-01',
      exportScheduleId: '987',
      listingDate: '2026-01-02',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      speciesCodes: ['HE', 'BA'],
      endUseCode: 'SA',
      comments: 'ready',
    })

    expect(result).toEqual({
      success: true,
      message: 'saved',
      createdId: '1001',
      errors: [],
      warnings: [],
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/applicationDetailsRPC')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('actionMapping')).toBe('addApplication')
    expect(body.get('applicationNumber')).toBeNull()
    expect(body.get('packageNumber')).toBeNull()
    expect(body.get('ownerApplicantType')).toBe('O')
    expect(body.get('applicantType')).toBe('O')
    expect(body.get('agentClientNumber')).toBeNull()
    expect(body.get('ownerClientLocationCode')).toBe('00')
    expect(body.get('ownerContactName')).toBe('Owner Contact')
    expect(body.get('ageClass')).toBeNull()
    expect(body.get('growthTypeCode')).toBeNull()
    expect(body.get('exemptionReason')).toBe('U')
    expect(body.get('exemptionReasonCode')).toBe('U')
    expect(body.get('applicationDate')).toBe('2026-01-01')
    expect(body.get('exemptionTerm')).toBe('30')
    expect(body.get('dateReceived')).toBe('2026-01-01')
    expect(body.get('exportScheduleId')).toBe('987')
    expect(body.get('legacyExportScheduleId')).toBe('987')
    expect(body.get('listingDate')).toBe('2026-01-02')
    expect(body.get('productLocation')).toBe('Camp 1')
    expect(body.get('logLocation')).toBe('Camp 1')
    expect(body.get('applicationVolume')).toBe('125.5')
    expect(body.get('averageLogVolume')).toBe('1.2')
    expect(body.get('logVolume')).toBe('1.2')
    expect(body.get('applicationSelectedSpecies')).toBe('HE,BA')
    expect(body.get('speciesTableValues')).toBe('HE,BA')
    expect(body.get('speciesCodes')).toBe('HE,BA')
    expect(body.get('applicationEndUseCode')).toBe('SA')
    expect(body.get('endUseCode')).toBe('SA')
    expect(body.get('endUse')).toBe('SA')
  })

  it('returns offer created id from exportPurchaseOfferNumber payload', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'saved',
        exportPurchaseOfferNumber: 'OP-900',
      },
    })

    const result = await submitProvincialOfferCreate({
      applicationNumber: '200',
      packageNumber: 'PKG-9',
      offeringClientNumber: '00012345',
      companyName: 'Example Lumber',
      contactName: 'Sample Contact',
      offerVolume: '99.9',
      purchaseOfferAmount: '25000',
      teacReviewDate: '2026-01-15',
      fairOfferIndicator: 'Y',
      validOfferIndicator: 'Y',
      approvalIndicator: 'N',
      offerRemark: 'Needs review',
      pickupLocation: 'yard',
      offerCondition: 'none',
    })

    expect(result.createdId).toBe('OP-900')
    const [, body] = postMock.mock.calls[0]
    expect(body.get('companyName')).toBe('Example Lumber')
    expect(body.get('contactName')).toBe('Sample Contact')
    expect(body.get('offerVolume')).toBe('99.9')
    expect(body.get('region')).toBeNull()
    expect(body.get('purchaseOfferDate')).toBeNull()
    expect(body.get('offerWithdrawalDate')).toBeNull()
    expect(body.get('withdrawReason')).toBeNull()
    expect(body.get('teacReviewDate')).toBe('2026-01-15')
    expect(body.get('fairOfferIndicator')).toBe('Y')
    expect(body.get('validOfferIndicator')).toBe('Y')
    expect(body.get('approvalIndicator')).toBe('N')
    expect(body.get('offerRemark')).toBe('Needs review')
    expect(body.get('offerNumber')).toBeNull()
    expect(body.get('exportPurchaseOfferNumber')).toBeNull()
  })

  it('keeps offer conditions separate from an empty approver remark', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        exportPurchaseOfferNumber: 'OP-901',
      },
    })

    await submitProvincialOfferCreate({
      applicationNumber: '200',
      packageNumber: 'PKG-9',
      offeringClientNumber: '00012345',
      companyName: 'Example Lumber',
      contactName: 'Sample Contact',
      offerVolume: '99.9',
      purchaseOfferAmount: '25000',
      teacReviewDate: '',
      fairOfferIndicator: 'N',
      validOfferIndicator: 'Y',
      approvalIndicator: 'N',
      offerRemark: '',
      pickupLocation: 'yard',
      offerCondition: 'No partial loads',
    })

    const [, body] = postMock.mock.calls[0]
    expect(body.get('offerCondition')).toBe('No partial loads')
    expect(body.get('offerRemark')).toBeNull()
  })

  it('returns actionable guidance when an offer update loses its edit lock', async () => {
    postMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: {} },
    })

    const result = await submitProvincialOfferUpdate({
      offerNumber: '81001',
      applicationNumber: '200',
      packageNumber: 'PKG-9',
      offeringClientNumber: '00012345',
      companyName: 'Example Lumber',
      contactName: 'Sample Contact',
      region: '11',
      offerVolume: '99.9',
      purchaseOfferAmount: '25000',
      purchaseOfferDate: '2026-01-10',
      offerWithdrawalDate: '',
      withdrawReason: '',
      teacReviewDate: '',
      fairOfferIndicator: 'N',
      validOfferIndicator: 'Y',
      approvalIndicator: 'N',
      offerRemark: '',
      pickupLocation: 'yard',
      offerCondition: 'none',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('edit lock has expired or is held by another user')
    const [, body] = postMock.mock.calls[0]
    expect(body.get('region')).toBeNull()
    expect(body.get('purchaseOfferDate')).toBe('2026-01-10')
    expect(body.get('offerWithdrawalDate')).toBeNull()
    expect(body.get('withdrawReason')).toBeNull()
  })

  it('posts provincial application agent applicant fields when applicant type is agent', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'saved',
        applicationNumber: '1002',
      },
    })

    await submitProvincialApplicationCreate({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      agentClientNumber: '00033333',
      agentClientLocationCode: '01',
      agentContactName: 'Agent Contact',
      applicantTypeCode: 'A',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-01',
      applicationTermDays: '30',
      receivedDate: '2026-01-01',
      listingDate: '2026-01-02',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      comments: 'ready',
    })

    const [, body] = postMock.mock.calls[0]
    expect(body.get('ownerApplicantType')).toBe('A')
    expect(body.get('applicantType')).toBe('A')
    expect(body.get('agentClientNumber')).toBe('00033333')
    expect(body.get('agentClientLocationCode')).toBe('01')
    expect(body.get('agentClientLocation')).toBe('01')
    expect(body.get('agentContactName')).toBe('Agent Contact')
  })

  it('surfaces provincial exemption backend errors without a generic prefix', async () => {
    postMock.mockResolvedValue({
      data: {
        success: false,
        errors: ['Application 123 is already assigned to exemption 1234.'],
      },
    })

    const result = await submitProvincialExemptionCreate({
      applicationNumber: '123',
      linkedApplicationNumbers: ['123', '124'],
      exemptionNumber: '',
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvalDate: '2026-04-04',
      expiryDate: '2027-04-04',
      approvedVolume: '333333',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('')
    expect(result.errors).toEqual(['Application 123 is already assigned to exemption 1234.'])
    const [, body] = postMock.mock.calls[0]
    expect(body.get('applicationNumber')).toBe('123')
    expect(body.get('applications')).toBe('123,124')
    expect(body.get('exemptionNumber')).toBeNull()
    expect(body.get('enableRateOverride')).toBeNull()
    expect(body.get('feeRate')).toBeNull()
    expect(body.get('region')).toBeNull()
    expect(body.get('ownerClientNumber')).toBeNull()
    expect(body.get('applicantClientNumber')).toBeNull()
    expect(body.get('agentClientNumber')).toBeNull()
  })

  it('submits a standalone ministerial exemption without application or OIC fields', async () => {
    postMock.mockResolvedValue({
      data: { success: true, exemptionNumber: 'EX-900', message: 'saved' },
    })

    const result = await submitProvincialExemptionCreate({
      applicationNumber: '',
      linkedApplicationNumbers: [],
      exemptionNumber: '',
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvalDate: '',
      expiryDate: '',
      approvedVolume: '250.5',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })

    expect(result.success).toBe(true)
    const [, body] = postMock.mock.calls[0]
    expect(body.get('applicationNumber')).toBeNull()
    expect(body.get('applications')).toBeNull()
    expect(body.get('exemptionNumber')).toBeNull()
    expect(body.get('enableRateOverride')).toBeNull()
    expect(body.get('feeRate')).toBeNull()
    expect(body.get('region')).toBeNull()
  })

  it('serializes standalone Blanket OIC regions and fee override fields', async () => {
    postMock.mockResolvedValue({
      data: { success: true, exemptionNumber: 'BOIC-1', message: 'saved' },
    })

    await submitProvincialExemptionCreate({
      applicationNumber: '',
      linkedApplicationNumbers: [],
      exemptionNumber: 'BOIC-1',
      exemptionTypeCode: 'B',
      exemptionStatusCode: 'ACT',
      approvalDate: '2026-07-01',
      expiryDate: '2027-07-01',
      approvedVolume: '9999999.9',
      enableRateOverride: true,
      feeRate: '18.25',
      regionNumbers: ['1903', '1904'],
      otherConditions: '',
    })

    const [, body] = postMock.mock.calls[0]
    expect(body.get('applicationNumber')).toBeNull()
    expect(body.get('applications')).toBeNull()
    expect(body.get('exemptionNumber')).toBe('BOIC-1')
    expect(body.get('exemptionTypeCode')).toBe('B')
    expect(body.get('exemptionStatusCode')).toBe('ACT')
    expect(body.get('enableRateOverride')).toBe('true')
    expect(body.get('feeRate')).toBe('18.25')
    expect(body.get('region')).toBe('1903,1904')
  })

  it('uses configured create endpoint overrides when provided', async () => {
    vi.stubEnv('VITE_LEXIS_CREATE_APPLICATION_ENDPOINT', '/lexis/rpc/application-details/add')
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'saved',
        applicationNumber: '1001',
      },
    })

    await submitProvincialApplicationCreate({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      applicantTypeCode: 'O',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-01',
      applicationTermDays: '30',
      receivedDate: '2026-01-01',
      listingDate: '2026-01-02',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      comments: 'ready',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0][0]).toBe('/lexis/rpc/application-details/add')
  })

  it('submits json payload when create submit request mode is json', async () => {
    vi.stubEnv('VITE_LEXIS_CREATE_SUBMIT_REQUEST_MODE', 'json')
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'saved',
        applicationNumber: '1001',
      },
    })

    await submitProvincialApplicationCreate({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      applicantTypeCode: 'O',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-01',
      applicationTermDays: '30',
      receivedDate: '2026-01-01',
      listingDate: '2026-01-02',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      comments: 'ready',
    })

    const [, body, config] = postMock.mock.calls[0]
    expect(body).toEqual(
      expect.objectContaining({
        actionMapping: 'addApplication',
        ownerApplicantType: 'O',
        exemptionReason: 'U',
        logLocation: 'Camp 1',
        productLocation: 'Camp 1',
        averageLogVolume: '1.2',
        logVolume: '1.2',
      }),
    )
    expect(body).not.toHaveProperty('applicationNumber')
    expect(body).not.toHaveProperty('packageNumber')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/json',
      },
    })
  })
})
