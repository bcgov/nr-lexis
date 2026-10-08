import { Tile } from '@carbon/react'
import type { ReactNode } from 'react'
import {
  RecordField,
  RecordFieldGrid,
  RecordFieldRow,
  type RecordFieldSpan,
} from './RecordFieldGrid'

export type DetailField = {
  label: string
  value: ReactNode
  span?: RecordFieldSpan
}

type DetailFieldTileProps = {
  title: string
  /** One group of fields, or one group per row; each group starts a new row. */
  fields: DetailField[] | DetailField[][]
  headerAction?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}

const fieldRows = (fields: DetailField[] | DetailField[][]): DetailField[][] =>
  fields.length > 0 && Array.isArray(fields[0])
    ? (fields as DetailField[][])
    : [fields as DetailField[]]

export function DetailFieldGrid({ fields }: { fields: DetailField[] | DetailField[][] }) {
  return (
    <RecordFieldGrid>
      {fieldRows(fields).map((row) => (
        <RecordFieldRow key={row.map((field) => field.label).join('|')}>
          {row.map((field) => (
            <RecordField
              key={field.label}
              label={field.label}
              value={field.value}
              span={field.span}
            />
          ))}
        </RecordFieldRow>
      ))}
    </RecordFieldGrid>
  )
}

// INTENTIONAL_LEGACY_DIVERGENCE(DETAIL_VIEW_EDIT_MODES):
// Detail fields render as values until an authorized user explicitly enters edit mode.
export function DetailFieldTile({
  title,
  fields,
  headerAction,
  icon,
  children,
}: DetailFieldTileProps) {
  return (
    <Tile className="detail-section-card">
      <div className="detail-section-card__header">
        <h2 className="detail-tile-title">
          {icon}
          {title}
        </h2>
        {headerAction}
      </div>
      {fields.length > 0 && <DetailFieldGrid fields={fields} />}
      {children}
    </Tile>
  )
}
