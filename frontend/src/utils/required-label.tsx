import { Asterisk } from '@carbon/icons-react'
import type { ReactNode } from 'react'

export const requiredLabel = (label: ReactNode, required = true): NonNullable<ReactNode> =>
  required ? (
    <span className="required-label">
      <span className="required-label__marker" aria-hidden="true">
        <Asterisk />
      </span>
      {label}
    </span>
  ) : (
    (label ?? '')
  )
