import { Tile } from '@carbon/react'
import type { ReactNode } from 'react'

export type DetailField = {
  label: string
  value: ReactNode
}

export type DetailFieldTileProps = {
  title: string
  fields: DetailField[]
  headerAction?: ReactNode
}

// INTENTIONAL_LEGACY_DIVERGENCE(DETAIL_VIEW_EDIT_MODES):
// Detail fields render as values until an authorized user explicitly enters edit mode.
export function DetailFieldTile({ title, fields, headerAction }: DetailFieldTileProps) {
  return (
    <Tile className="detail-section-card">
      <div className="detail-section-card__header">
        <h2 className="detail-tile-title">{title}</h2>
        {headerAction}
      </div>
      <dl className="detail-field-grid">
        {fields.map((field) => (
          <div
            key={field.label}
            className={`detail-field-item${fields.length === 1 ? ' detail-field-item--full' : ''}`}
          >
            <dt className="detail-field-label">{field.label}</dt>
            <dd className="detail-field-value">{field.value}</dd>
          </div>
        ))}
      </dl>
    </Tile>
  )
}
