import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchFamUserRoleAssignments } from '@/service/fam-user-access-service'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
    }),
  },
}))

describe('fam-user-access-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches FAM role assignments through the backend proxy', async () => {
    const payload = {
      results: [],
      total: 0,
      pageNumber: 1,
      pageSize: 10,
      pageCount: 0,
      configured: true,
      message: null,
    }
    getMock.mockResolvedValue({ data: payload })

    const result = await searchFamUserRoleAssignments({
      search: 'smith',
      pageNumber: 1,
      pageSize: 10,
      sortBy: 'user_name',
      sortOrder: 'asc',
    })

    expect(getMock).toHaveBeenCalledWith('/lexis/admin/fam-users', {
      params: {
        search: 'smith',
        pageNumber: 1,
        pageSize: 10,
        sortBy: 'user_name',
        sortOrder: 'asc',
      },
    })
    expect(result).toBe(payload)
  })
})
