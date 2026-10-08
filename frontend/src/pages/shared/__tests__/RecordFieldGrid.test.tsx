import { useEffect, useRef } from 'react'
import { TextInput } from '@carbon/react'
import { render, screen, within } from '@testing-library/react'

import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldGroup,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'

const spanClasses = (element: Element | null) =>
  [...(element?.classList ?? [])].filter((name) => name.includes('col-span')).sort()

const PermitFields = ({ editing }: { editing: boolean }) => (
  <RecordFieldGrid editing={editing}>
    <RecordFieldRow>
      <RecordField
        label="Status"
        value="Active"
        edit={<TextInput id="status" labelText="Status" defaultValue="Active" />}
      />
    </RecordFieldRow>
    <RecordFieldRow>
      <RecordField label="Exemption number" value="R276T002" />
      <RecordField label="Exemption type" value="Blanket OIC" />
      <RecordField
        label="Region"
        value="South Coast Natural Resource Region"
        span="wide"
        edit={<TextInput id="region" labelText="Region" />}
      />
    </RecordFieldRow>
    <RecordFieldRow>
      <RecordField
        label="Remarks"
        value={null}
        span="full"
        edit={<TextInput id="remarks" labelText="Remarks" />}
      />
    </RecordFieldRow>
  </RecordFieldGrid>
)

describe('record field grid', () => {
  it('lays fields out in rows on the four-column grid', () => {
    const { container } = render(<PermitFields editing={false} />)

    const rows = container.querySelectorAll('.record-field-grid > .record-field-grid__row')
    expect(rows).toHaveLength(3)
    rows.forEach((row) => {
      expect(spanClasses(row)).toEqual([
        'cds--lg:col-span-16',
        'cds--md:col-span-8',
        'cds--sm:col-span-4',
      ])
    })

    const typeRow = rows[1] as HTMLElement
    expect(within(typeRow).getByText('Exemption type').tagName).toBe('DT')
    expect(within(typeRow).getByText('Blanket OIC').tagName).toBe('DD')
    expect(within(typeRow).getAllByRole('term')).toHaveLength(3)

    const typeColumn = screen.getByText('Exemption type').closest('.record-field')
    expect(spanClasses(typeColumn)).toEqual([
      'cds--lg:col-span-4',
      'cds--md:col-span-4',
      'cds--sm:col-span-4',
    ])
    expect(spanClasses(screen.getByText('Region').closest('.record-field'))).toEqual([
      'cds--lg:col-span-8',
      'cds--md:col-span-4',
      'cds--sm:col-span-4',
    ])
    expect(spanClasses(screen.getByText('Remarks').closest('.record-field'))).toEqual([
      'cds--lg:col-span-16',
      'cds--md:col-span-8',
      'cds--sm:col-span-4',
    ])
  })

  it('shows a blank value as a dash read as not provided', () => {
    render(<PermitFields editing={false} />)

    const remarks = screen.getByText('Remarks').nextElementSibling as HTMLElement
    expect(remarks).toHaveTextContent('—Not provided')
    expect(within(remarks).getByText('Not provided')).toHaveClass('cds--visually-hidden')
  })

  it('keeps every field in the same row and columns in edit mode', () => {
    const fieldPositions = (container: HTMLElement) =>
      [...container.querySelectorAll('.record-field-grid__row')].map((row) =>
        [...row.querySelectorAll('.record-field')].map((field) => spanClasses(field).join(' ')),
      )

    const view = render(<PermitFields editing={false} />)
    const viewPositions = fieldPositions(view.container)
    view.unmount()
    const edit = render(<PermitFields editing />)

    expect(fieldPositions(edit.container)).toEqual(viewPositions)
    expect(screen.getByRole('textbox', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Region' })).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('renders a read-only field the same way in view and edit mode', () => {
    const view = render(<PermitFields editing={false} />)
    const viewField = screen.getByText('Exemption type').closest('.record-field')?.outerHTML
    view.unmount()
    render(<PermitFields editing />)

    expect(screen.getByText('Exemption type').closest('.record-field')?.outerHTML).toBe(viewField)
    expect(screen.getByText('Exemption type').nextElementSibling).toHaveTextContent('Blanket OIC')
  })

  it('builds edit controls only in edit mode', () => {
    const control = vi.fn(() => <TextInput id="pieces" labelText="Permit request pieces" />)
    const fields = (editing: boolean) => (
      <RecordFieldGrid editing={editing}>
        <RecordFieldRow>
          <RecordField label="Permit request pieces" value={10} edit={control} />
        </RecordFieldRow>
      </RecordFieldGrid>
    )

    const { rerender } = render(fields(false))
    expect(control).not.toHaveBeenCalled()
    expect(screen.getByText('10').tagName).toBe('DD')

    rerender(fields(true))
    expect(screen.getByRole('textbox', { name: 'Permit request pieces' })).toBeInTheDocument()
  })

  it('leaves out hidden rows and hidden fields', () => {
    const { container } = render(
      <RecordFieldGrid>
        <RecordFieldRow>
          <RecordField label="Client" value="00001074" span="wide" />
        </RecordFieldRow>
        <RecordFieldRow hidden>
          <RecordField label="Address" value="123 Main St" span="wide" />
        </RecordFieldRow>
        <RecordFieldRow>
          <RecordField label="Customs port of export" value="Prince Rupert" />
          <RecordField label="Other port of export" value={null} hidden />
        </RecordFieldRow>
      </RecordFieldGrid>,
    )

    expect(container.querySelectorAll('.record-field-grid__row')).toHaveLength(2)
    expect(screen.queryByText('Address')).not.toBeInTheDocument()
    expect(screen.getByText('Customs port of export')).toBeInTheDocument()
    expect(screen.queryByText('Other port of export')).not.toBeInTheDocument()
  })

  it('keeps a row group in place while its rows are hidden', () => {
    const contactRows = (hasLocation: boolean) => (
      <RecordFieldGrid>
        <RecordFieldRow>
          <RecordField label="Client location" value={hasLocation ? '00 · Head office' : null} />
        </RecordFieldRow>
        <RecordFieldGroup aria-live="polite" data-testid="client-details">
          <RecordFieldRow hidden={!hasLocation}>
            <RecordField label="Address" value="123 Main St" span="wide" />
            <RecordField label="City" value="Victoria" />
          </RecordFieldRow>
          <RecordFieldRow hidden={!hasLocation}>
            <RecordField label="Phone number" value={null} />
          </RecordFieldRow>
        </RecordFieldGroup>
      </RecordFieldGrid>
    )

    const { rerender } = render(contactRows(false))
    const group = screen.getByTestId('client-details')
    expect(group).toHaveAttribute('aria-live', 'polite')
    expect(spanClasses(group)).toEqual([
      'cds--lg:col-span-16',
      'cds--md:col-span-8',
      'cds--sm:col-span-4',
    ])
    expect(group).toBeEmptyDOMElement()

    rerender(contactRows(true))
    expect(screen.getByTestId('client-details')).toBe(group)
    expect(within(group).getByText('Address')).toBeInTheDocument()
    expect(within(group).getAllByRole('term')).toHaveLength(3)
  })

  it('places other content in a cell', () => {
    render(
      <RecordFieldGrid>
        <RecordFieldRow>
          <RecordField label="Package fee" value="$120.00" />
          <RecordFieldCell span="full">
            <p>Fee details</p>
          </RecordFieldCell>
        </RecordFieldRow>
      </RecordFieldGrid>,
    )

    expect(screen.getByText('Package fee').closest('dl')).toHaveClass('record-field')
    expect(spanClasses(screen.getByText('Fee details').closest('.record-field'))).toEqual([
      'cds--lg:col-span-16',
      'cds--md:col-span-8',
      'cds--sm:col-span-4',
    ])
  })

  it('passes its ref and attributes to the grid element', () => {
    const onGrid = vi.fn()
    const EditingCard = () => {
      const gridRef = useRef<HTMLDivElement>(null)
      useEffect(() => onGrid(gridRef.current), [])
      return (
        <RecordFieldGrid ref={gridRef} editing data-edit-section="permit">
          <RecordFieldRow>
            <RecordField label="Status" value="Active" />
          </RecordFieldRow>
        </RecordFieldGrid>
      )
    }
    render(<EditingCard />)

    const grid = onGrid.mock.calls[0][0] as HTMLElement
    expect(grid).toHaveClass('record-field-grid', 'record-field-grid--editing')
    expect(grid).toHaveAttribute('data-edit-section', 'permit')
  })
})
