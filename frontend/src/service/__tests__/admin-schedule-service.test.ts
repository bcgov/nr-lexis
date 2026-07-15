import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createExportSchedule,
  deleteExportSchedule,
  fetchExportSchedulePage,
  fetchExportSchedules,
  updateExportSchedule,
} from '@/service/admin-schedule-service'

const { deleteMock, getCachedResponseMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getCachedResponseMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    getAxiosInstance: () => ({
      delete: deleteMock,
      post: postMock,
      put: putMock,
    }),
  },
}))

describe('admin-schedule-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes export schedule rows from the admin API', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [
        {
          exportScheduleId: 1001,
          advertisingDate: '2026-07-01',
          applicationReceiptDate: '2026-06-25',
          offerReceiptDate: '2026-07-08',
          offerEndDate: '2026-07-09',
          offerWithdrawalDate: '2026-07-10',
          teacMeetingDate: '2026-07-15',
          applicationCount: 2,
          mutable: false,
        },
      ],
    })

    const result = await fetchExportSchedules()

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/schedules',
      {
        params: {
          page: 0,
          size: 100,
          sortField: 'advertisingDate',
          sortDirection: 'desc',
        },
      },
      {
        cacheKey: 'admin-schedules:advertisingDate:desc:0:100',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual([
      {
        exportScheduleId: '1001',
        advertisingDate: '2026-07-01',
        applicationReceiptDate: '2026-06-25',
        offerReceiptDate: '2026-07-08',
        offerEndDate: '2026-07-09',
        offerWithdrawalDate: '2026-07-10',
        teacMeetingDate: '2026-07-15',
        applicationCount: 2,
        mutable: false,
      },
    ])
  })

  it('normalizes export schedule page metadata', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            exportScheduleId: 1001,
            advertisingDate: '2026-07-01',
            applicationCount: 0,
          },
        ],
        total: 27,
        page: 1,
        size: 20,
      },
    })

    const result = await fetchExportSchedulePage(1, 20)

    expect(result).toEqual({
      rows: [
        expect.objectContaining({
          exportScheduleId: '1001',
          advertisingDate: '2026-07-01',
        }),
      ],
      total: 27,
      page: 1,
      size: 20,
    })
  })

  it('passes column sorting to the export schedule API', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [],
        total: 2129,
        page: 2,
        size: 50,
      },
    })

    await fetchExportSchedulePage(2, 50, 'teacMeetingDate', 'desc')

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/schedules',
      {
        params: {
          page: 2,
          size: 50,
          sortField: 'teacMeetingDate',
          sortDirection: 'desc',
        },
      },
      {
        cacheKey: 'admin-schedules:teacMeetingDate:desc:2:50',
        ttlMs: 30_000,
      },
    )
  })

  it('posts export schedule create payloads', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'Export schedule added.',
        schedule: {
          exportScheduleId: 1002,
          advertisingDate: '2026-07-15',
        },
      },
    })

    const result = await createExportSchedule({
      advertisingDate: '2026-07-15',
      applicationReceiptDate: '2026-07-08',
      offerReceiptDate: '2026-07-22',
      offerEndDate: '2026-07-23',
      offerWithdrawalDate: '2026-07-24',
      teacMeetingDate: '2026-07-29',
    })

    expect(postMock).toHaveBeenCalledWith('/lexis/admin/schedules', {
      advertisingDate: '2026-07-15',
      applicationReceiptDate: '2026-07-08',
      offerReceiptDate: '2026-07-22',
      offerEndDate: '2026-07-23',
      offerWithdrawalDate: '2026-07-24',
      teacMeetingDate: '2026-07-29',
    })
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: 'Export schedule added.',
        schedule: expect.objectContaining({
          exportScheduleId: '1002',
          advertisingDate: '2026-07-15',
        }),
      }),
    )
  })

  it('puts export schedule update payloads', async () => {
    putMock.mockResolvedValue({
      data: {
        success: true,
        message: 'Export schedule updated.',
        schedule: {
          exportScheduleId: 1002,
          advertisingDate: '2026-07-15',
        },
      },
    })

    const result = await updateExportSchedule('1002', {
      advertisingDate: '2026-07-15',
      applicationReceiptDate: '2026-07-08',
      offerReceiptDate: '2026-07-22',
      offerEndDate: '2026-07-23',
      offerWithdrawalDate: '2026-07-24',
      teacMeetingDate: '2026-07-29',
    })

    expect(putMock).toHaveBeenCalledWith('/lexis/admin/schedules/1002', {
      advertisingDate: '2026-07-15',
      applicationReceiptDate: '2026-07-08',
      offerReceiptDate: '2026-07-22',
      offerEndDate: '2026-07-23',
      offerWithdrawalDate: '2026-07-24',
      teacMeetingDate: '2026-07-29',
    })
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: 'Export schedule updated.',
        schedule: expect.objectContaining({
          exportScheduleId: '1002',
          advertisingDate: '2026-07-15',
        }),
      }),
    )
  })

  it('deletes export schedules by id', async () => {
    deleteMock.mockResolvedValue({
      data: {
        success: true,
        message: 'Export schedule deleted.',
        schedule: null,
      },
    })

    const result = await deleteExportSchedule('1002')

    expect(deleteMock).toHaveBeenCalledWith('/lexis/admin/schedules/1002')
    expect(result).toEqual({
      success: true,
      message: 'Export schedule deleted.',
      schedule: null,
    })
  })
})
