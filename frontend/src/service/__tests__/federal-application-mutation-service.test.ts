import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  saveFederalPermit,
  updateFederalApplicationStatus,
} from '@/service/federal-application-mutation-service'

const { postMock, putMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      post: postMock,
      put: putMock,
    }),
  },
}))

const permit = {
  permitNumber: null,
  permitIssueDate: '2026-07-10',
  destinationCountry: ' us ',
  transportType: ' s ',
  transportName: ' MV Test ',
  shippingDate: '2026-07-12',
  portOfExport: ' va ',
  otherPortOfExport: 'Stale other port',
}

describe('federal-application-mutation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a federal permit through the application-scoped endpoint', async () => {
    postMock.mockResolvedValue({ data: { success: true, message: 'Created', errors: [] } })

    await expect(saveFederalPermit('1000456', permit, false)).resolves.toEqual({
      success: true,
      message: 'Created',
      errors: [],
    })
    expect(postMock).toHaveBeenCalledWith('/lexis/federal/applications/1000456/permit', {
      ...permit,
      destinationCountry: 'US',
      transportType: 'S',
      transportName: 'MV Test',
      portOfExport: 'VA',
      otherPortOfExport: null,
    })
    expect(putMock).not.toHaveBeenCalled()
  })

  it('updates an existing federal permit with PUT', async () => {
    const update = {
      ...permit,
      permitNumber: 1234,
      portOfExport: ' ot ',
      otherPortOfExport: ' Boundary Bay ',
    }
    putMock.mockResolvedValue({ data: { success: true, message: 'Updated', errors: [] } })

    await saveFederalPermit('1000456', update, true)

    expect(putMock).toHaveBeenCalledWith('/lexis/federal/applications/1000456/permit', {
      ...update,
      destinationCountry: 'US',
      transportType: 'S',
      transportName: 'MV Test',
      portOfExport: 'OT',
      otherPortOfExport: 'Boundary Bay',
    })
    expect(postMock).not.toHaveBeenCalled()
  })

  it('updates federal status with its required remark', async () => {
    postMock.mockResolvedValue({ data: { success: true, message: 'Rejected', errors: [] } })

    await updateFederalApplicationStatus('1000456', 'REJ', 'Not eligible')

    expect(postMock).toHaveBeenCalledWith('/lexis/federal/applications/1000456/status', {
      statusCode: 'REJ',
      remark: 'Not eligible',
    })
  })
})
