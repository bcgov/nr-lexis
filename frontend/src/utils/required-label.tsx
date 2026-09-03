import type { ReactNode } from 'react'

export const requiredLabel = (label: ReactNode, required = true): NonNullable<ReactNode> =>
  required ? <span className="required-label">{label}</span> : (label ?? '')
