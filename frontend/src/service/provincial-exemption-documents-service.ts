import apiService from '@/service/api-service'
import {
  type DocumentRowBase,
  normalizeDocumentRowBase,
  parseDocumentArrayPayload,
  parseRemoveDocumentSuccess,
} from '@/service/document-service-utils'
import { extractResponseFilename } from '@/service/http-response-utils'

export type ProvincialExemptionDocumentRow = DocumentRowBase

export type ProvincialExemptionDocumentSource = 'api'

export type ProvincialExemptionDocumentsResult = {
  rows: ProvincialExemptionDocumentRow[]
  source: ProvincialExemptionDocumentSource
}

export type OpenProvincialExemptionDocumentResult = {
  source: 'api'
  blob: Blob
  filename: string
}

export type RemoveProvincialExemptionDocumentResult = {
  success: boolean
  source: ProvincialExemptionDocumentSource
}

const DOCUMENT_LIST_CACHE_TTL_MS = 30_000

export const fetchExemptionDocuments = async (
  exemptionNumber: string,
): Promise<ProvincialExemptionDocumentsResult> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/rpc/exemption-details/document-details',
    {
      params: {
        exemptionNumber,
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
    throw new Error('Unexpected exemption document payload.')
  }

  return {
    rows: rows.map(normalizeDocumentRowBase),
    source: 'api',
  }
}

export const openExemptionDocument = async (
  fileId: string,
  fileName: string,
): Promise<OpenProvincialExemptionDocumentResult> => {
  const response = await apiService
    .getAxiosInstance()
    .get<Blob>('/lexis/rpc/exemption-details/document', {
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
    throw new Error('Exemption document payload was empty.')
  }

  return {
    source: 'api',
    blob: response.data,
    filename: extractResponseFilename(response.headers, fileName),
  }
}

export const removeExemptionDocument = async (
  documentId: string,
): Promise<RemoveProvincialExemptionDocumentResult> => {
  const normalizedDocumentId = documentId.trim()
  const response = await apiService
    .getAxiosInstance()
    .delete<unknown>('/lexis/rpc/exemption-details/document', {
      params: {
        documentId: normalizedDocumentId,
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
