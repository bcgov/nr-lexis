import { Column, Grid } from '@carbon/react'
import { createContext, use, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react'
import { displayValue } from '@/utils/display-value'
import './RecordFieldGrid.scss'

/**
 * How much of a card row a field takes. A field is one of four columns on large screens, two on
 * medium and one on small. Wide fields (region names, clients, addresses) take two columns on large
 * screens, and full fields (remarks, tables) take the whole row.
 */
export type RecordFieldSpan = 'field' | 'wide' | 'full'

const COLUMN_SPANS: Record<RecordFieldSpan, { sm: number; md: number; lg: number }> = {
  field: { sm: 4, md: 4, lg: 4 },
  wide: { sm: 4, md: 4, lg: 8 },
  full: { sm: 4, md: 8, lg: 16 },
}

const ROW_SPAN = COLUMN_SPANS.full

const classNames = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

const RecordFieldGridContext = createContext({ editing: false })

type RecordFieldGridProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /** Edit mode: fields with an `edit` control show it in place of their value. */
  editing?: boolean
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * The field layout inside a record card. View and edit render the same rows, so a field keeps its
 * column and row when the card switches mode.
 */
export function RecordFieldGrid({
  editing = false,
  className,
  children,
  ref,
  ...rest
}: RecordFieldGridProps) {
  return (
    <RecordFieldGridContext value={{ editing }}>
      <Grid
        {...rest}
        ref={ref}
        className={classNames(
          'record-field-grid',
          editing && 'record-field-grid--editing',
          className,
        )}
      >
        {children}
      </Grid>
    </RecordFieldGridContext>
  )
}

type RecordFieldProps = {
  label: ReactNode
  /** The read-only value. Blank text and numbers show "—", read as "Not provided". */
  value?: ReactNode
  /** The control shown in edit mode, with its own label. Without it the field stays read-only. */
  edit?: ReactNode | (() => ReactNode)
  span?: RecordFieldSpan
  hidden?: boolean
  className?: string
}

const readOnlyValue = (value: ReactNode): ReactNode =>
  value === null || value === undefined || typeof value === 'string' || typeof value === 'number'
    ? displayValue(value)
    : value

/**
 * One field: its label and value, or its control in edit mode. A read-only field renders the same
 * way in both modes.
 */
export function RecordField({
  label,
  value,
  edit,
  span = 'field',
  hidden = false,
  className,
}: RecordFieldProps) {
  const { editing } = use(RecordFieldGridContext)
  if (hidden) return null

  const columnClassName = classNames('record-field', className)
  if (editing && edit !== undefined) {
    return (
      <Column
        {...COLUMN_SPANS[span]}
        className={classNames(columnClassName, 'record-field--control')}
      >
        {typeof edit === 'function' ? edit() : edit}
      </Column>
    )
  }

  return (
    <Column {...COLUMN_SPANS[span]} as="dl" className={columnClassName}>
      <dt className="detail-field-label">{label}</dt>
      <dd className="detail-field-value">{readOnlyValue(value)}</dd>
    </Column>
  )
}

type RecordFieldCellProps = {
  span?: RecordFieldSpan
  hidden?: boolean
  className?: string
  children: ReactNode
}

/** A cell for content that isn't a label and value, such as a checkbox, table or notification. */
export function RecordFieldCell({
  span = 'field',
  hidden = false,
  className,
  children,
}: RecordFieldCellProps) {
  if (hidden) return null
  return (
    <Column {...COLUMN_SPANS[span]} className={classNames('record-field', className)}>
      {children}
    </Column>
  )
}

type RecordFieldRowProps = {
  hidden?: boolean
  className?: string
  children: ReactNode
}

/**
 * One group of fields. Every row starts on a new line, and columns it doesn't fill stay empty. Hide
 * a row with `hidden` rather than hiding each of its fields.
 */
export function RecordFieldRow({ hidden = false, className, children }: RecordFieldRowProps) {
  if (hidden) return null
  return (
    <Column {...ROW_SPAN} className={classNames('record-field-grid__row', className)}>
      {children}
    </Column>
  )
}

type RecordFieldGroupProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  hidden?: boolean
  children: ReactNode
}

/**
 * Rows that show, hide or update together. The group stays in place while its rows are hidden, so
 * it can carry a live region (`aria-live`) that announces them when they appear.
 */
export function RecordFieldGroup({
  hidden = false,
  className,
  children,
  ...rest
}: RecordFieldGroupProps) {
  if (hidden) return null
  return (
    <Column {...rest} {...ROW_SPAN} className={classNames('record-field-grid__group', className)}>
      {children}
    </Column>
  )
}
