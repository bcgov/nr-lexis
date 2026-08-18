import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRtmEmsLogAmvLastSaved,
  previewRtmEmsLogAmvUpload,
  saveRtmEmsLogAmvBatch,
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  uploadRtmEmsLogAmv,
} from '@/service/rtm-emslogamv-service'

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

  it('requests the latest average monthly values before a date', async () => {
    getMock.mockResolvedValue({ data: [] })

    await searchLatestRtmEmsLogAmv(' 2026-07-01 ')

    expect(getMock).toHaveBeenCalledWith('/lexis/rtm/emslogamv', {
      params: { latestBeforeDate: '2026-07-01' },
    })
  })

  it('requests last-saved audit metadata for the effective month', async () => {
    getMock.mockResolvedValue({
      data: {
        savedBy: 'IDIR\\MGURJAOD',
        savedAt: '2026-08-11T18:21:00',
      },
    })

    const result = await getRtmEmsLogAmvLastSaved(' 2026-09-01 ')

    expect(getMock).toHaveBeenCalledWith('/lexis/rtm/emslogamv/last-saved', {
      params: { effectiveDate: '2026-09-01' },
    })
    expect(result).toEqual({
      savedBy: 'IDIR\\MGURJAOD',
      savedAt: '2026-08-11T18:21:00',
    })
  })

  it('posts the full AMV grid as one batch', async () => {
    postMock.mockResolvedValue({
      data: {
        status: 'accepted',
        message: 'Average monthly values saved.',
        errors: [],
        rows: [],
        lastSaved: {
          savedBy: 'IDIR\\MGURJAOD',
          savedAt: '2026-08-11T18:21:00',
        },
      },
    })
    const request = {
      values: [
        {
          species: 'PINE',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-06-01',
          newValue: 123.45,
          saveMode: 'update' as const,
        },
      ],
    }

    const result = await saveRtmEmsLogAmvBatch(request)

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/rtm/emslogamv/batch',
      request,
      expect.objectContaining({ validateStatus: expect.any(Function) }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        status: 'accepted',
        lastSaved: {
          savedBy: 'IDIR\\MGURJAOD',
          savedAt: '2026-08-11T18:21:00',
        },
      }),
    )
  })

  it('uses the AMV upload preview client contract', async () => {
    postMock.mockResolvedValue({
      data: {
        status: 'accepted',
        fileName: 'rtm-ems-log-amv-template.xlsx',
        fileSize: 128,
        message: 'Preview accepted.',
        rowCount: 2,
        retrievalDate: '2026-05-01',
        updateDate: '2026-06-01',
        errors: [],
        warnings: [],
        rows: [],
      },
    })
    const file = new File(['xlsx'], 'rtm-ems-log-amv-template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await previewRtmEmsLogAmvUpload(file, '2026-06-01')

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/rtm/emslogamv/preview',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        validateStatus: expect.any(Function),
      }),
    )
    const [, payload, config] = postMock.mock.calls[0]
    expect(payload.get('file')).toBe(file)
    expect(payload.get('effectiveMonth')).toBe('2026-06-01')
    expect(config.validateStatus(422)).toBe(true)
    expect(config.validateStatus(500)).toBe(false)
    expect(result).toEqual(expect.objectContaining({ status: 'accepted', rowCount: 2 }))
  })

  it('uses the AMV workbook submission client contract', async () => {
    postMock.mockResolvedValue({
      data: {
        status: 'validation_failed',
        fileName: 'bad.xlsx',
        fileSize: 4,
        message: 'Upload validation failed.',
        attemptedRowCount: 0,
        uploadedRowCount: 0,
        errors: ['Update date is required.'],
        warnings: [],
        rows: [],
      },
    })
    const file = new File(['xlsx'], 'bad.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await uploadRtmEmsLogAmv({ file, effectiveMonth: '2026-06-01' })

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/rtm/emslogamv/upload',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        validateStatus: expect.any(Function),
      }),
    )
    const [, payload, config] = postMock.mock.calls[0]
    expect(payload.get('file')).toBe(file)
    expect(payload.get('effectiveMonth')).toBe('2026-06-01')
    expect(config.validateStatus(422)).toBe(true)
    expect(config.validateStatus(500)).toBe(false)
    expect(result).toEqual(
      expect.objectContaining({
        status: 'validation_failed',
        attemptedRowCount: 0,
        uploadedRowCount: 0,
      }),
    )
  })
})
