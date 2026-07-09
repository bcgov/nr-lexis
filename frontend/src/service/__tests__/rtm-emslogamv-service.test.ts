import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveRtmEmsLogAmv, searchRtmEmsLogAmv } from '@/service/rtm-emslogamv-service'

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
    }),
  },
}))

describe('rtm-emslogamv-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends retrieval and update date filters to the average monthly value search', async () => {
    getMock.mockResolvedValue({ data: [] })

    await searchRtmEmsLogAmv({
      species: ' FI ',
      growthIndicator: ' O ',
      retrievalDate: ' 2026-05-01 ',
      updateDate: ' 2026-06-01 ',
    })

    expect(getMock).toHaveBeenCalledWith('/lexis/rtm/emslogamv', {
      params: {
        species: 'FI',
        growthIndicator: 'O',
        retrievalDate: '2026-05-01',
        updateDate: '2026-06-01',
      },
    })
  })

  it('posts manual update rows with retrieval and update dates', async () => {
    postMock.mockResolvedValue({
      data: {
        status: 'accepted',
        message: 'Average monthly value row saved.',
        errors: [],
        rows: [],
      },
    })

    const request = {
      species: 'FI',
      grade: '1',
      growthIndicator: 'O',
      retrievalDate: '2026-05-01',
      updateDate: '2026-06-01',
      newValue: 123.45,
      saveMode: 'update' as const,
    }

    const result = await saveRtmEmsLogAmv(request)

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/rtm/emslogamv',
      request,
      expect.objectContaining({ validateStatus: expect.any(Function) }),
    )
    const [, , config] = postMock.mock.calls[0]
    expect(config.validateStatus(422)).toBe(true)
    expect(config.validateStatus(500)).toBe(false)
    expect(result).toEqual({
      status: 'accepted',
      message: 'Average monthly value row saved.',
      errors: [],
      rows: [],
    })
  })
})
