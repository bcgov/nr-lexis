import { Tile } from '@carbon/react'
import type { FC, ReactNode } from 'react'

export type DetailField = {
  label: string
  value: ReactNode
}

export type DetailListItem = {
  key: string
  content: ReactNode
}

type DetailFieldTileProps = {
  title: string
  fields: DetailField[]
}

export const DetailFieldTile: FC<DetailFieldTileProps> = ({ title, fields }) => {
  return (
    <Tile>
      <h2 className="detail-tile-title">{title}</h2>
      <dl className="detail-field-grid">
        {fields.map((field) => (
          <div key={field.label} className="detail-field-item">
            <dt className="detail-field-label">{field.label}</dt>
            <dd className="detail-field-value">{field.value}</dd>
          </div>
        ))}
      </dl>
    </Tile>
  )
}

type DetailListTileProps = {
  title: string
  items: DetailListItem[]
  emptyLabel: string
}

export const DetailListTile: FC<DetailListTileProps> = ({ title, items, emptyLabel }) => {
  return (
    <Tile>
      <h2 className="detail-tile-title">{title}</h2>
      {items.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        <ul className="detail-list">
          {items.map((item) => (
            <li key={item.key}>{item.content}</li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
