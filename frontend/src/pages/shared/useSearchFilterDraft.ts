import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

export const useSearchFilterDraft = <TFilters extends object>(appliedFilters: TFilters) => {
  const appliedFiltersSignature = JSON.stringify(appliedFilters)
  const [draftState, setDraftState] = useState({
    appliedFiltersSignature,
    filters: appliedFilters,
  })
  const draftFilters =
    draftState.appliedFiltersSignature === appliedFiltersSignature
      ? draftState.filters
      : appliedFilters
  const setDraftFilters: Dispatch<SetStateAction<TFilters>> = useCallback(
    (nextFilters) => {
      setDraftState((currentState) => {
        const currentFilters =
          currentState.appliedFiltersSignature === appliedFiltersSignature
            ? currentState.filters
            : appliedFilters
        return {
          appliedFiltersSignature,
          filters:
            typeof nextFilters === 'function'
              ? (nextFilters as (current: TFilters) => TFilters)(currentFilters)
              : nextFilters,
        }
      })
    },
    [appliedFilters, appliedFiltersSignature],
  )

  return [draftFilters, setDraftFilters] as const
}
