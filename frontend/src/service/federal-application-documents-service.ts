import {
  fetchApplicationDocuments,
  openApplicationDocument,
  removeApplicationDocument,
  type OpenApplicationDocumentResult,
  type ProvincialApplicationDocumentRow,
  type ProvincialApplicationDocumentSource,
} from '@/service/provincial-application-documents-service'

export type FederalApplicationDocumentRow = ProvincialApplicationDocumentRow
type FederalApplicationDocumentSource = ProvincialApplicationDocumentSource
type FederalApplicationDocumentsResult = {
  rows: FederalApplicationDocumentRow[]
  source: FederalApplicationDocumentSource
}
type OpenFederalApplicationDocumentResult = OpenApplicationDocumentResult
type RemoveFederalApplicationDocumentResult = {
  success: boolean
  source: FederalApplicationDocumentSource
}

export const fetchFederalApplicationDocuments = (
  applicationNumber: string,
): Promise<FederalApplicationDocumentsResult> => {
  return fetchApplicationDocuments(applicationNumber)
}

export const openFederalApplicationDocument = (
  fileId: string,
  fileName: string,
  applicationNumber: string,
): Promise<OpenFederalApplicationDocumentResult> => {
  return openApplicationDocument(fileId, fileName, applicationNumber)
}

export const removeFederalApplicationDocument = (
  documentId: string,
  applicationNumber: string,
): Promise<RemoveFederalApplicationDocumentResult> => {
  return removeApplicationDocument(documentId, applicationNumber)
}
