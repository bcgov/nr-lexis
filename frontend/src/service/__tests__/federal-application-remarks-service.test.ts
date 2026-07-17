import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFederalApplicationRemarks,
  saveFederalApplicationRemark,
} from '@/service/federal-application-remarks-service'

const { getMock, postMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
      put: putMock,
    }),
  },
}))

describe('federal-application-remarks-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads remarks from the application-scoped endpoint', async () => {
    const remarks = [
      { remarkId: 44, remark: 'Review note', user: 'idir\\reviewer', date: '2026-07-10T20:00:00Z' },
    ]
    getMock.mockResolvedValue({ data: remarks })

    await expect(fetchFederalApplicationRemarks('9001')).resolves.toEqual(remarks)
    expect(getMock).toHaveBeenCalledWith('/lexis/federal/applications/9001/remarks')
  })

  it('adds a new remark with POST', async () => {
    postMock.mockResolvedValue({
      data: { success: true, message: 'Added', remark: null, errors: [] },
    })

    await saveFederalApplicationRemark('9001', 'New note')

    expect(postMock).toHaveBeenCalledWith('/lexis/federal/applications/9001/remarks', {
      remark: 'New note',
    })
    expect(putMock).not.toHaveBeenCalled()
  })

  it('updates an existing remark with its parent and identifier', async () => {
    putMock.mockResolvedValue({
      data: { success: true, message: 'Updated', remark: null, errors: [] },
    })

    await saveFederalApplicationRemark('9001', 'Updated note', 44)

    expect(putMock).toHaveBeenCalledWith('/lexis/federal/applications/9001/remarks/44', {
      remark: 'Updated note',
    })
    expect(postMock).not.toHaveBeenCalled()
  })
})
