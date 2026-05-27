export type CreateDraftRecord<TData> = {
  id: string
  module: string
  savedAt: string
  payload: TData
}

const storageKey = (module: string): string => `lexis.create-drafts.${module}`

const parseRecords = <TData>(rawValue: string | null): CreateDraftRecord<TData>[] => {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is CreateDraftRecord<TData> => {
      if (!item || typeof item !== 'object') {
        return false
      }
      return (
        typeof (item as any).id === 'string' &&
        typeof (item as any).module === 'string' &&
        typeof (item as any).savedAt === 'string' &&
        typeof (item as any).payload === 'object'
      )
    })
  } catch (error) {
    console.warn('Unable to parse create draft records.', error)
    return []
  }
}

const persistRecords = <TData>(module: string, records: CreateDraftRecord<TData>[]): void => {
  localStorage.setItem(storageKey(module), JSON.stringify(records))
}

const createDraftId = (): string => {
  const randomSegment = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `DRF-${Date.now()}-${randomSegment}`
}

export const listCreateDrafts = <TData>(module: string): CreateDraftRecord<TData>[] => {
  const records = parseRecords<TData>(localStorage.getItem(storageKey(module)))
  return records.sort((left, right) => right.savedAt.localeCompare(left.savedAt))
}

export const saveCreateDraft = <TData>(
  module: string,
  payload: TData,
): CreateDraftRecord<TData> => {
  const records = listCreateDrafts<TData>(module)
  const nextRecord: CreateDraftRecord<TData> = {
    id: createDraftId(),
    module,
    savedAt: new Date().toISOString(),
    payload,
  }

  const nextRecords = [nextRecord, ...records].slice(0, 25)
  persistRecords(module, nextRecords)
  return nextRecord
}

export const deleteCreateDraft = (module: string, draftId: string): boolean => {
  const records = listCreateDrafts(module)
  const nextRecords = records.filter((record) => record.id !== draftId)

  if (nextRecords.length === records.length) {
    return false
  }

  persistRecords(module, nextRecords)
  return true
}
