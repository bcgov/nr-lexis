import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateFederalApplicationStatus } from '@/service/federal-application-mutation-service'

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      post: postMock,
    }),
  },
}))

describe('federal-application-mutation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
