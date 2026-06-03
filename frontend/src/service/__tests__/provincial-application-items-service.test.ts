import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addApplicationScaleToPackage,
  deleteApplicationScale,
  fetchApplicationRemainingSpecies,
  updateApplicationPackage,
} from '@/service/provincial-application-items-service'

const { deleteMock, getCachedResponseMock, postMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getCachedResponseMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      delete: deleteMock,
      post: postMock,
    }),
    getCachedResponse: getCachedResponseMock,
  },
}))

describe('provincial-application-items-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads remaining species with legacy species JSON params', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [{ code: 'CE', description: 'Cedar' }],
    })

    const result = await fetchApplicationRemainingSpecies('12', 'LOG', ['FI'])

    expect(result).toEqual([{ code: 'CE', description: 'Cedar' }])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/remaining-species',
      {
        params: {
          orgUnitNumber: '12',
          productType: 'LOG',
          speciesJSON: '["FI"]',
        },
      },
      { ttlMs: 30000 },
    )
  })

  it('posts package updates as legacy url-encoded form fields', async () => {
    postMock.mockResolvedValue({
      data: {
        valid: true,
        packageNumber: 'PKG-2',
        errors: [],
        warnings: ['renamed'],
      },
    })

    const result = await updateApplicationPackage({
      packageNumber: 'PKG-1',
      newPackageNumber: 'PKG-2',
      applicationNumber: '321',
      volume: '100.0',
      averageLength: '12.0',
      averageDiameter: '24.0',
      status: 'A',
      comments: 'Ready',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'LOG',
      endUseCode: 'LU',
      speciesCodes: ['FI', 'CE'],
    })

    expect(result).toEqual({
      valid: true,
      packageNumber: 'PKG-2',
      errors: [],
      warnings: ['renamed'],
    })
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/package-update')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('packageNumber')).toBe('PKG-1')
    expect(body.get('newPackageNumber')).toBe('PKG-2')
    expect(body.get('packageDialogPackageVolume')).toBe('100.0')
    expect(body.get('updatePackageEndUse')).toBe('LU')
    expect(body.get('updatePackageSpeciesTableValues')).toBe('FI,CE')
  })

  it('posts package scale adds and normalizes the persisted row', async () => {
    postMock.mockResolvedValue({
      data: {
        valid: true,
        result: {
          timberMark: 'TM001',
          pieces: '5',
          species: 'Douglas-fir',
          grade: 'Sawlog',
          volume: '20.0',
          id: '55',
        },
        errors: [],
        warnings: [],
      },
    })

    const result = await addApplicationScaleToPackage({
      timberMark: 'TM001',
      packageNumber: 'PKG-1',
      gradeCode: '1',
      speciesCode: 'FI',
      applicationNumber: '321',
      pieces: '5',
      volume: '20.0',
    })

    expect(result.result).toEqual({
      permitted: false,
      timberMark: 'TM001',
      species: 'Douglas-fir',
      pieces: 5,
      grade: 'Sawlog',
      volume: '20.0',
      id: '55',
      cascadeSplitCode: '',
    })
    const [path, body] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/package-scale')
    expect(body.get('timberMark')).toBe('TM001')
    expect(body.get('packageNumber')).toBe('PKG-1')
    expect(body.get('gradeCode')).toBe('1')
    expect(body.get('speciesCode')).toBe('FI')
    expect(body.get('applicationNumber')).toBe('321')
    expect(body.get('scalePieces')).toBe('5')
    expect(body.get('scaleVolume')).toBe('20.0')
  })

  it('deletes scales through the modern item endpoint', async () => {
    deleteMock.mockResolvedValue({
      status: 200,
      data: {
        success: true,
      },
    })

    const result = await deleteApplicationScale('55')

    expect(result).toEqual({ success: true })
    expect(deleteMock).toHaveBeenCalledWith('/lexis/rpc/application-details/scale', {
      params: {
        scaleId: '55',
      },
    })
  })
})
