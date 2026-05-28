import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  submitIndianReservePermitCreate,
  submitProvincialApplicationCreate,
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
      applicantClientNumber: '00022222',
      productTypeCode: 'LOG',
      exemptionType: 'SECTION_1',
      region: '11',
      receivedDate: '2026-01-01',
      listingDate: '2026-01-02',
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
    expect(body.get('agentClientNumber')).toBe('00022222')
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
      region: '11',
      purchaseOfferAmount: '25000',
      purchaseOfferDate: '2026-01-10',
      offerEndDate: '2026-01-20',
      pickupLocation: 'yard',
      offerCondition: 'none',
    })

    expect(result.createdId).toBe('OP-900')
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
      applicantClientNumber: '00022222',
      productTypeCode: 'LOG',
      exemptionType: 'SECTION_1',
      region: '11',
      receivedDate: '2026-01-01',
      listingDate: '2026-01-02',
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
      applicantClientNumber: '00022222',
      productTypeCode: 'LOG',
      exemptionType: 'SECTION_1',
      region: '11',
      receivedDate: '2026-01-01',
      listingDate: '2026-01-02',
      comments: 'ready',
    })

    const [, body, config] = postMock.mock.calls[0]
    expect(body).toEqual(
      expect.objectContaining({
        actionMapping: 'addApplication',
        applicationNumber: '1001',
      }),
    )
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/json',
      },
    })
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
