import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveApplicationReview,
  updateApplicationReviewStatus,
} from '@/service/application-review-search-service'
import { RECORD_VERSION_HEADER } from '@/service/optimistic-conflict'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({ post: postMock }),
  },
}))

describe('application review search service mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    postMock.mockResolvedValue({ data: { updated: true, valid: true } })
  })

  it('sends the explicitly supplied record version when approving from the review list', async () => {
    await approveApplicationReview('999000001', 'application-version-7')

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/application-reviews/999000001/approve',
      undefined,
      { headers: { [RECORD_VERSION_HEADER]: 'application-version-7' } },
    )
  })

  it('sends the explicitly supplied record version when updating status from the review list', async () => {
    const payload = {
      statusCode: 'REJ',
      remark: 'Incomplete application',
      clientEmailAddress: 'recipient@example.test',
    }

    await updateApplicationReviewStatus('999000001', payload, 'application-version-8')

    expect(postMock).toHaveBeenCalledWith('/lexis/application-reviews/999000001/status', payload, {
      headers: { [RECORD_VERSION_HEADER]: 'application-version-8' },
    })
  })
})
