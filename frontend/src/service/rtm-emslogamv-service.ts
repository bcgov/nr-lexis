import apiService from '@/service/api-service'

export type RtmEmsLogAmvRow = {
  species: string | null
  grade: string | null
  growthIndicator: string | null
  retrievalDate: string | null
  updateDate: string | null
  currentValue: number | null
  newValue: number | null
  returnCode: string | null
}

export type RtmEmsLogAmvFilters = {
  species: string
  growthIndicator: string
  retrievalDate: string
  updateDate: string
}

export type RtmEmsLogAmvSaveRequest = {
  species: string
  grade: string
  growthIndicator: string
  retrievalDate: string
  updateDate: string
  newValue: number
  saveMode: 'create' | 'update'
}

export type RtmEmsLogAmvMutationResult = {
  status: string
  message: string
  errors: string[]
  rows: RtmEmsLogAmvRow[]
}

/**
 * Dormant workbook upload contracts retained for the legacy AMV upload screen.
 * The active AMV route uses the editable table instead.
 */
export type RtmEmsLogAmvUploadPreview = {
  status: string
  fileName?: string
  fileSize?: number
  message: string
  rowCount: number
  retrievalDate?: string | null
  updateDate?: string | null
  errors: string[]
  warnings: string[]
  rows: RtmEmsLogAmvRow[]
}

export type RtmEmsLogAmvUploadRequest = {
  file: File
}

export type RtmEmsLogAmvUploadResult = {
  status: string
  fileName?: string
  fileSize?: number
  message: string
  attemptedRowCount: number
  uploadedRowCount: number
  errors: string[]
  warnings: string[]
  rows: RtmEmsLogAmvRow[]
}

const trimOptional = (value: string): string | undefined => {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

const normalizeFilters = (filters: RtmEmsLogAmvFilters): Record<string, string> => {
  const result: Record<string, string> = {}

  const species = trimOptional(filters.species)
  const growthIndicator = trimOptional(filters.growthIndicator)
  const retrievalDate = trimOptional(filters.retrievalDate)
  const updateDate = trimOptional(filters.updateDate)

  if (species) {
    result.species = species
  }
  if (growthIndicator) {
    result.growthIndicator = growthIndicator
  }
  if (retrievalDate) {
    result.retrievalDate = retrievalDate
  }
  if (updateDate) {
    result.updateDate = updateDate
  }

  return result
}

export const searchRtmEmsLogAmv = async (
  filters: RtmEmsLogAmvFilters,
): Promise<RtmEmsLogAmvRow[]> => {
  const response = await apiService
    .getAxiosInstance()
    .get<RtmEmsLogAmvRow[]>('/lexis/rtm/emslogamv', {
      params: normalizeFilters(filters),
    })

  return response.data ?? []
}

export const saveRtmEmsLogAmv = async (
  request: RtmEmsLogAmvSaveRequest,
): Promise<RtmEmsLogAmvMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<RtmEmsLogAmvMutationResult>('/lexis/rtm/emslogamv', request, {
      validateStatus: (status) => status < 500,
    })

  return response.data ?? { status: 'failed', message: '', errors: [], rows: [] }
}

/**
 * Dormant until the server-side AMV upload feature is deliberately re-enabled.
 */
export const previewRtmEmsLogAmvUpload = async (file: File): Promise<RtmEmsLogAmvUploadPreview> => {
  const payload = new FormData()
  payload.append('file', file)

  const response = await apiService
    .getAxiosInstance()
    .post<RtmEmsLogAmvUploadPreview>('/lexis/rtm/emslogamv/preview', payload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      validateStatus: (status) => status < 500,
    })

  return (
    response.data ?? {
      status: 'failed',
      message: '',
      rowCount: 0,
      retrievalDate: null,
      updateDate: null,
      errors: ['No preview response was returned.'],
      warnings: [],
      rows: [],
    }
  )
}

/**
 * Dormant until the server-side AMV upload feature is deliberately re-enabled.
 */
export const uploadRtmEmsLogAmv = async (
  request: RtmEmsLogAmvUploadRequest,
): Promise<RtmEmsLogAmvUploadResult> => {
  const payload = new FormData()
  payload.append('file', request.file)

  const response = await apiService
    .getAxiosInstance()
    .post<RtmEmsLogAmvUploadResult>('/lexis/rtm/emslogamv/upload', payload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      validateStatus: (status) => status < 500,
    })

  return (
    response.data ?? {
      status: 'failed',
      message: '',
      attemptedRowCount: 0,
      uploadedRowCount: 0,
      errors: ['No upload response was returned.'],
      warnings: [],
      rows: [],
    }
  )
}
