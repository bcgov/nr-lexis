import type { ReactNode } from 'react'

export const requiredLabel = (label: ReactNode, required = true): NonNullable<ReactNode> =>
  required ? (
    <span className="required-label">
      {label}
      <span className="required-label__marker" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path
            d="M8 2v12M2.804 5l10.392 6M13.196 5 2.804 11"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    </span>
  ) : (
    (label ?? '')
  )
