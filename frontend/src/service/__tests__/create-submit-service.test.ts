import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  submitIndianReservePermitCreate,
  submitProvincialApplicationCreate,
  submitProvincialExemptionCreate,
  submitProvincialOfferCreate,
  submitProvincialPermitCreate,
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
      applicationNumber: '1001',
      packageNumber: 'PKG-1',
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
    expect(body.get('applicationNumber')).toBe('1001')
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
    expect(body.get('productLocation')).toBe('Camp 1')
    expect(body.get('logLocation')).toBe('Camp 1')
    expect(body.get('applicationVolume')).toBe('125.5')
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
      offerNumber: '900',
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
  })

  it('surfaces provincial exemption backend errors without a generic prefix', async () => {
    postMock.mockResolvedValue({
      data: {
        success: false,
        errors: ['Application 123 is already assigned to exemption 1234.'],
      },
    })

    const result = await submitProvincialExemptionCreate({
      exemptionNumber: '1235',
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
      applicationNumber: '1001',
      packageNumber: 'PKG-1',
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
      applicationNumber: '1001',
      packageNumber: 'PKG-1',
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
      comments: 'ready',
    })

    const [, body, config] = postMock.mock.calls[0]
    expect(body).toEqual(
      expect.objectContaining({
        actionMapping: 'addApplication',
        applicationNumber: '1001',
        ownerApplicantType: 'O',
        exemptionReason: 'U',
        logLocation: 'Camp 1',
        productLocation: 'Camp 1',
      }),
    )
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/json',
      },
    })
  })

  it('can omit create actionMapping when include-action-mapping toggle is disabled', async () => {
    vi.stubEnv('VITE_LEXIS_CREATE_SUBMIT_REQUEST_MODE', 'json')
    vi.stubEnv('VITE_LEXIS_CREATE_SUBMIT_INCLUDE_ACTION_MAPPING', 'false')
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'saved',
        permitNumber: '101',
      },
    })

    await submitProvincialPermitCreate({
      permitNumber: '101',
      applicationNumber: '2',
      packageNumber: 'PKG',
      exemptionNumber: 'EX-1',
      permitStatus: 'Issued',
      applicantClientNumber: '00011111',
      ownerClientNumber: '00022222',
      issueDate: '2026-01-01',
      estimatedShippingDate: '2026-01-02',
      permitVolume: '10',
      remarks: '',
    })

    const [, body] = postMock.mock.calls[0]
    expect(body).toEqual(
      expect.objectContaining({
        permitNumber: '101',
        permitStatus: 'Issued',
      }),
    )
    expect(body).not.toHaveProperty('actionMapping')
  })

  it('returns status-specific message when permit submit endpoint is unavailable', async () => {
    postMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: {},
      },
    })

    const result = await submitProvincialPermitCreate({
      permitNumber: '1',
      applicationNumber: '2',
      packageNumber: 'PKG',
      exemptionNumber: 'EX-1',
      permitStatus: 'Issued',
      applicantClientNumber: '00011111',
      ownerClientNumber: '00022222',
      issueDate: '2026-01-01',
      estimatedShippingDate: '2026-01-02',
      permitVolume: '10',
      remarks: '',
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe(
      'Unable to submit provincial permit create request. Submit endpoint is unavailable in this environment (status 404).',
    )
  })

  it('uses backend response message for submit failures when provided', async () => {
    postMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: 'Validation failed',
          errors: ['Client number is required'],
        },
      },
    })

    const result = await submitIndianReservePermitCreate({
      permitNumber: '900',
      packageNumber: 'PKG-1',
      clientNumber: '12345678',
      applicationDate: '2026-03-01',
      permitIssueDate: '2026-03-02',
      estimatedShippingDate: '2026-03-03',
      destinationCountry: 'CA',
      transportTypeCode: 'TRK',
      transportName: 'Truck',
      portOfExport: 'VAN',
      remarks: '',
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('Validation failed')
    expect(result.errors).toEqual(['Client number is required'])
  })
})
