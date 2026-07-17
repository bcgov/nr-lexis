import type { HTMLAttributes } from 'react'

import './StatusTag.css'

export type StatusTagVariant =
  | 'positive'
  | 'informative'
  | 'draft'
  | 'pending'
  | 'negative'
  | 'expired'
  | 'cancelled'
  | 'inactive'
  | 'updated'
  | 'neutral'

const CODE_VARIANTS: Readonly<Record<string, StatusTagVariant>> = {
  A: 'positive',
  ACT: 'positive',
  APP: 'positive',
  COM: 'positive',
  EXE: 'positive',
  ISS: 'positive',
  PER: 'positive',
  PMT: 'positive',
  NEW: 'informative',
  OPEN: 'informative',
  SUB: 'informative',
  DFT: 'draft',
  PND: 'pending',
  REV: 'pending',
  REJ: 'negative',
  DAL: 'negative',
  EXP: 'expired',
  CAN: 'cancelled',
  WDN: 'inactive',
  WDR: 'inactive',
  UPD: 'updated',
}

const hasAnyTerm = (value: string, terms: readonly string[]): boolean =>
  terms.some((term) => value.includes(term))

export const getStatusTagVariant = (status: string): StatusTagVariant => {
  const normalized = status.trim().toUpperCase()
  if (!normalized) return 'neutral'

  if (hasAnyTerm(normalized, ['NOT APPROV', 'DISAPPROV', 'UNAPPROV'])) {
    return 'negative'
  }

  const leadingCode = normalized.match(/^([A-Z]{1,4})(?:\s*[-:]|$)/)?.[1]
  if (leadingCode && CODE_VARIANTS[leadingCode]) return CODE_VARIANTS[leadingCode]
  if (CODE_VARIANTS[normalized]) return CODE_VARIANTS[normalized]

  if (hasAnyTerm(normalized, ['REJECT', 'DISALLOW', 'FAIL', 'INVALID', 'ERROR'])) {
    return 'negative'
  }
  if (hasAnyTerm(normalized, ['CANCEL'])) return 'cancelled'
  if (hasAnyTerm(normalized, ['EXPIR'])) return 'expired'
  if (hasAnyTerm(normalized, ['WITHDRAW', 'RETIRED', 'DELETED', 'REPLACED', 'CLOSED'])) {
    return 'inactive'
  }
  if (
    hasAnyTerm(normalized, ['PENDING', 'REVIEW', 'IN PROGRESS', 'PROCESS', 'QUEUED', 'WAITING'])
  ) {
    return 'pending'
  }
  if (hasAnyTerm(normalized, ['DRAFT'])) return 'draft'
  if (hasAnyTerm(normalized, ['UPDATED', 'AMENDED'])) return 'updated'
  if (hasAnyTerm(normalized, ['NEW', 'SUBMIT', 'OPEN'])) return 'informative'
  if (
    hasAnyTerm(normalized, [
      'APPROV',
      'ACTIVE',
      'COMPLETE',
      'CURRENT',
      'ISSUED',
      'PERMIT',
      'EXEMPT',
      'SUCCESS',
      'ACCEPT',
    ]) &&
    !normalized.includes('INACTIVE')
  ) {
    return 'positive'
  }
  if (normalized.includes('INACTIVE')) return 'inactive'

  return 'neutral'
}

export type StatusTagProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  status: string
  variant?: StatusTagVariant
  fallbackLabel?: string
}

/** Semantic, consistently coloured status pill for LEXIS status codes and labels. */
const StatusTag = ({
  status,
  variant,
  fallbackLabel = 'Unknown',
  className,
  ...spanProps
}: StatusTagProps) => {
  const label = status.trim() || fallbackLabel
  const resolvedVariant = variant ?? getStatusTagVariant(status)

  return (
    <span
      {...spanProps}
      className={['lexis-status-tag', className].filter(Boolean).join(' ')}
      data-status-variant={resolvedVariant}
    >
      {label}
    </span>
  )
}

export default StatusTag
