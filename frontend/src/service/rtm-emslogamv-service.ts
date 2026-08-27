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
  lastSaved?: RtmEmsLogAmvLastSaved | null
}

export type RtmEmsLogAmvLastSaved = {
  savedBy: string | null
  savedAt: string | null
}

export type RtmEmsLogAmvBatchSaveRequest = {
  values: RtmEmsLogAmvSaveRequest[]
}

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
  effectiveMonth: string
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

const isHandledRtmAmvResponseStatus = (status: number): boolean =>
  (status >= 200 && status < 300) || status === 422

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

export const searchLatestRtmEmsLogAmv = async (
  latestBeforeDate: string,
): Promise<RtmEmsLogAmvRow[]> => {
  const normalizedDate = trimOptional(latestBeforeDate)
  if (!normalizedDate) {
    return []
  }

  const response = await apiService
    .getAxiosInstance()
    .get<RtmEmsLogAmvRow[]>('/lexis/rtm/emslogamv', {
      params: { latestBeforeDate: normalizedDate },
    })

  return response.data ?? []
}

export const getRtmEmsLogAmvLastSaved = async (
  effectiveDate: string,
): Promise<RtmEmsLogAmvLastSaved | null> => {
  const normalizedDate = trimOptional(effectiveDate)
  if (!normalizedDate) {
    return null
  }

  const response = await apiService
    .getAxiosInstance()
    .get<RtmEmsLogAmvLastSaved>('/lexis/rtm/emslogamv/last-saved', {
      params: { effectiveDate: normalizedDate },
    })
  const lastSaved = response.data
  return lastSaved?.savedAt && lastSaved.savedBy ? lastSaved : null
}

export const saveRtmEmsLogAmvBatch = async (
  request: RtmEmsLogAmvBatchSaveRequest,
): Promise<RtmEmsLogAmvMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<RtmEmsLogAmvMutationResult>('/lexis/rtm/emslogamv/batch', request, {
      validateStatus: isHandledRtmAmvResponseStatus,
    })

  return response.data ?? { status: 'failed', message: '', errors: [], rows: [] }
}

export const previewRtmEmsLogAmvUpload = async (
  file: File,
  effectiveMonth: string,
): Promise<RtmEmsLogAmvUploadPreview> => {
  const payload = new FormData()
  payload.append('file', file)
  payload.append('effectiveMonth', effectiveMonth)

  const response = await apiService
    .getAxiosInstance()
    .post<RtmEmsLogAmvUploadPreview>('/lexis/rtm/emslogamv/preview', payload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      validateStatus: isHandledRtmAmvResponseStatus,
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

export const uploadRtmEmsLogAmv = async (
  request: RtmEmsLogAmvUploadRequest,
): Promise<RtmEmsLogAmvUploadResult> => {
  const payload = new FormData()
  payload.append('file', request.file)
  payload.append('effectiveMonth', request.effectiveMonth)

  const response = await apiService
    .getAxiosInstance()
    .post<RtmEmsLogAmvUploadResult>('/lexis/rtm/emslogamv/upload', payload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      validateStatus: isHandledRtmAmvResponseStatus,
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
