import apiService from '@/service/api-service'
import { isRecord, stringField } from '@/utils/record'

export type ForestClientSuggestion = {
  clientNumber: string
  companyName: string
  clientAcronym: string
}

export const searchForestClients = async (
  query: string,
  counterpartyClientNumber?: string,
): Promise<ForestClientSuggestion[]> => {
  const q = query.trim()
  if (q.length < 3 || (/^\d+$/.test(q) && q.length > 8)) return []
  const counterparty = counterpartyClientNumber?.trim() ?? ''
  const data = await apiService.getCachedData<unknown>(
    '/lexis/client-search',
    { params: { q, ...(counterparty ? { counterpartyClientNumber: counterparty } : {}) } },
    // Reauthorize every lookup, including after roles change within the same session.
    { ttlMs: 0 },
  )
  if (!Array.isArray(data)) throw new Error('Client search returned an invalid response.')
  const clients = new Map<string, ForestClientSuggestion>()
  for (const item of data) {
    if (!isRecord(item)) throw new Error('Client search returned an invalid response.')
    const clientNumber = stringField(item, 'clientNumber')
    if (!/^\d{8}$/.test(clientNumber)) {
      throw new Error('Client search returned an invalid client number.')
    }
    if (!clients.has(clientNumber)) {
      clients.set(clientNumber, {
        clientNumber,
        companyName: stringField(item, 'companyName'),
        clientAcronym: stringField(item, 'clientAcronym'),
      })
    }
  }
  return [...clients.values()].slice(0, 15)
}
