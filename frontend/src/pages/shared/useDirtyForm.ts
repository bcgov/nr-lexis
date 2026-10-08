import { useMemo } from 'react'
import { formValuesEqual } from '@/components/UnsavedChangesGuard'

/** Whether the current values differ from the values the form started with. */
export const useDirtyForm = <T>(initial: T, current: T): boolean =>
  useMemo(() => !formValuesEqual(initial, current), [initial, current])
