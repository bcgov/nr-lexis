import apiService from '@/service/api-service'
import {
  normalizeDocumentRowBase,
  parseDocumentArrayPayload,
  parseRemoveDocumentSuccess,
} from '@/service/document-service-utils'
import { extractResponseFilename } from '@/service/http-response-utils'

export type ProvincialApplicationDocumentRow = {
  id: string
  name: string
  description: string
  type: string
}

export type ProvincialApplicationDocumentSource = 'api'

export type ProvincialApplicationDocumentsResult = {
  rows: ProvincialApplicationDocumentRow[]
  source: ProvincialApplicationDocumentSource
}

export type OpenApplicationDocumentResult = {
  source: 'api'
  blob: Blob
  filename: string
}

export type RemoveApplicationDocumentResult = {
  success: boolean
  source: ProvincialApplicationDocumentSource
}

const DOCUMENT_LIST_CACHE_TTL_MS = 30_000

const normalizeDocumentRow = (row: unknown, index: number): ProvincialApplicationDocumentRow => {
  return normalizeDocumentRowBase(row, index)
}

export const fetchApplicationDocuments = async (
  applicationNumber: string,
): Promise<ProvincialApplicationDocumentsResult> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/rpc/application-details/document-details',
    {
      params: {
        applicationNumber,
      },
    },
    { ttlMs: DOCUMENT_LIST_CACHE_TTL_MS },
  )

  if (response.status === 204) {
    return {
      rows: [],
      source: 'api',
    }
  }

  const rows = parseDocumentArrayPayload(response.data)
  if (!rows) {
    throw new Error('Unexpected application document payload.')
  }

  return {
    rows: rows.map(normalizeDocumentRow),
    source: 'api',
  }
}

export const openApplicationDocument = async (
  fileId: string,
  fileName: string,
): Promise<OpenApplicationDocumentResult> => {
  const response = await apiService
    .getAxiosInstance()
    .get<Blob>('/lexis/rpc/application-details/document', {
      params: {
        fileId,
        fileName,
      },
      responseType: 'blob',
      headers: {
        Accept: 'application/octet-stream',
      },
    })

  if (response.status === 204) {
    throw new Error('Application document payload was empty.')
  }

  return {
    source: 'api',
    blob: response.data,
    filename: extractResponseFilename(response.headers, fileName),
  }
}

export const removeApplicationDocument = async (
  documentId: string,
  applicationNumber: string,
): Promise<RemoveApplicationDocumentResult> => {
  const normalizedDocumentId = documentId.trim()
  const normalizedApplicationNumber = applicationNumber.trim()
  const response = await apiService
    .getAxiosInstance()
    .delete<unknown>('/lexis/rpc/application-details/document', {
      params: {
        documentId: normalizedDocumentId,
        applicationNumber: normalizedApplicationNumber,
      },
    })

  if (response.status === 204) {
    return {
      success: true,
      source: 'api',
    }
  }

  return {
    success: parseRemoveDocumentSuccess(response.data),
    source: 'api',
  }
}
