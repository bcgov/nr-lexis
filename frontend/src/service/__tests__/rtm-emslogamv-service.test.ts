import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  previewRtmEmsLogAmvUpload,
  saveRtmEmsLogAmv,
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

    expect(postMock).toHaveBeenCalledWith('/lexis/rtm/emslogamv', request)
    expect(result).toEqual({
      status: 'accepted',
      message: 'Average monthly value row saved.',
      errors: [],
      rows: [],
    })
  })

  it('previews AMV uploads as multipart data and preserves date metadata', async () => {
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
        rows: [
          {
            species: 'FI',
            grade: '1',
            growthIndicator: 'O',
            retrievalDate: '2026-05-01',
            updateDate: '2026-06-01',
            currentValue: null,
            newValue: 123.45,
            returnCode: null,
          },
        ],
      },
    })
    const file = new File(['xlsx'], 'rtm-ems-log-amv-template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await previewRtmEmsLogAmvUpload(file)

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/rtm/emslogamv/preview',
      expect.any(FormData),
      expect.objectContaining({
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        validateStatus: expect.any(Function),
      }),
    )
    const [, payload, config] = postMock.mock.calls[0]
    expect(payload.get('file')).toBe(file)
    expect(config.validateStatus(422)).toBe(true)
    expect(config.validateStatus(500)).toBe(false)
    expect(result).toEqual(
      expect.objectContaining({
        status: 'accepted',
        rowCount: 2,
        retrievalDate: '2026-05-01',
        updateDate: '2026-06-01',
      }),
    )
  })

  it('uploads AMV workbooks as multipart data and returns validation errors in-band', async () => {
    postMock.mockResolvedValue({
      data: {
        status: 'validation_failed',
        fileName: 'bad.xlsx',
        fileSize: 4,
        message: 'Upload validation failed.',
        attemptedRowCount: 0,
        uploadedRowCount: 0,
        errors: ['Update date is required.'],
        warnings: ['No AMV values were imported.'],
        rows: [],
      },
    })
    const file = new File(['xlsx'], 'bad.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await uploadRtmEmsLogAmv({ file })

    expect(postMock).toHaveBeenCalledWith(
      '/lexis/rtm/emslogamv/upload',
      expect.any(FormData),
      expect.objectContaining({
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        validateStatus: expect.any(Function),
      }),
    )
    const [, payload, config] = postMock.mock.calls[0]
    expect(payload.get('file')).toBe(file)
    expect(config.validateStatus(422)).toBe(true)
    expect(config.validateStatus(500)).toBe(false)
    expect(result).toEqual(
      expect.objectContaining({
        status: 'validation_failed',
        attemptedRowCount: 0,
        uploadedRowCount: 0,
        errors: ['Update date is required.'],
        warnings: ['No AMV values were imported.'],
      }),
    )
  })
})
