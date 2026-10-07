import type { ReactNode } from 'react'
import EmptyValue from '@/components/EmptyValue'

type DisplayableValue = string | number | null | undefined

/** The visible text of an empty read-only value, for places that need plain text. */
export const EMPTY_VALUE_TEXT = '—'

const isBlankValue = (value: DisplayableValue): value is null | undefined | '' =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

/** A read-only value as plain text, such as an input's value; blank shows "—". */
export const displayValueText = (value: DisplayableValue): string =>
  isBlankValue(value) ? EMPTY_VALUE_TEXT : String(value)

/** A read-only value; blank shows "—" and reads as "Not provided". */
export const displayValue = (value: DisplayableValue): ReactNode =>
  isBlankValue(value) ? <EmptyValue /> : String(value)

/** Table cells use the same empty value as every other read-only value. */
export const displayTableValue = displayValue
