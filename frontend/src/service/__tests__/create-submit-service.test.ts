import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  submitProvincialApplicationCreate,
  submitProvincialExemptionCreate,
  submitProvincialOfferCreate,
} from '@/service/create-submit-service'

const postMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      post: postMock,
    }),
  },
}))

describe('create-submit-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
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
      contactName: 'Alex Example',
      region: '11',
      purchaseOfferAmount: '25000',
      purchaseOfferDate: '2026-01-10',
      offerEndDate: '2026-01-20',
      withdrawReason: 'Withdrawn by buyer',
      pickupLocation: 'yard',
      offerCondition: 'none',
    })

    expect(result.createdId).toBe('OP-900')
    const [, body] = postMock.mock.calls[0]
    expect(body.get('companyName')).toBe('Example Lumber')
    expect(body.get('contactName')).toBe('Alex Example')
    expect(body.get('withdrawReason')).toBe('Withdrawn by buyer')
    expect(body.get('offerNumber')).toBeNull()
    expect(body.get('exportPurchaseOfferNumber')).toBeNull()
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
      linkedApplicationNumbers: ['123'],
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      ownerClientNumber: '123',
      applicantClientNumber: '123',
      approvalDate: '2026-04-04',
      expiryDate: '2027-04-04',
      approvedVolume: '333333',
      otherConditions: '',
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('')
    expect(result.errors).toEqual(['Application 123 is already assigned to exemption 1234.'])
    const [, body] = postMock.mock.calls[0]
    expect(body.get('exemptionNumber')).toBeNull()
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
