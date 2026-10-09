import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import RecordDocumentsSection, {
  DOCUMENT_DELETED_RESULT,
  documentsSavedResult,
} from '@/components/documents/RecordDocumentsSection'
import type { DocumentRowBase } from '@/service/document-service-utils'
import type { ActionResult } from '@/utils/action-result'

const upload = {
  enabled: true,
  open: false,
  resetKey: 0,
  targetNumber: '777',
  inputId: 'permitDocumentUpload',
  contentSelector: '#record-content',
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onDirtyChange: vi.fn(),
  onBusyChange: vi.fn(),
  onUploadComplete: vi.fn(),
  onSaved: vi.fn(),
}

const rows: DocumentRowBase[] = [
  {
    id: '1',
    name: 'a-very-long-scale-summary-file-name-that-wraps.xlsx',
    description: 'New scale summary',
    type: 'Permit',
    source: 'permit',
  },
  { id: '2', name: 'sales-contract.pdf', description: '', type: 'Invoice', source: 'invoice' },
  {
    id: '3',
    name: 'application-letter.pdf',
    description: '',
    type: 'Application',
    source: 'application',
    deletable: false,
  },
]

const renderSection = (
  props: Partial<Parameters<typeof RecordDocumentsSection<DocumentRowBase>>[0]> = {},
) =>
  render(
    <RecordDocumentsSection
      id="permit-documents"
      recordType="permit"
      rows={rows}
      upload={upload}
      onOpen={vi.fn()}
      canDelete
      removingId={null}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />,
  )

describe('RecordDocumentsSection', () => {
  it('shows the empty state on the tab background with Add documents', async () => {
    const onOpen = vi.fn()
    renderSection({ rows: [], upload: { ...upload, onOpen } })

    expect(
      screen.getByRole('heading', { level: 2, name: 'No documents for this permit' }),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Documents stay with the record as it moves through the application, exemption and permit stages.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add documents' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('lists documents by source with Open, Download and Delete only where deletion is allowed', async () => {
    const onOpen = vi.fn()
    renderSection({
      onOpen,
      canDeleteRow: (row) => row.source !== 'invoice',
    })

    const table = screen.getByRole('table')
    expect(table).toHaveClass('detail-documents-table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['File name', 'Description', 'Type', 'Actions'])
    const [, permitRow, invoiceRow, applicationRow] = within(table).getAllByRole('row')
    expect(within(permitRow).getByText('Permit')).toBeVisible()
    expect(within(invoiceRow).getByText('—')).toBeVisible()
    expect(within(invoiceRow).getByText('Invoice')).toBeVisible()
    expect(within(permitRow).getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(within(invoiceRow).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(within(applicationRow).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    await userEvent.click(within(permitRow).getByRole('button', { name: 'Open' }))
    await userEvent.click(within(permitRow).getByRole('button', { name: 'Download' }))
    expect(onOpen).toHaveBeenNthCalledWith(1, rows[0], true)
    expect(onOpen).toHaveBeenNthCalledWith(2, rows[0], false)
    expect(screen.getByRole('button', { name: 'Add documents' })).toBeVisible()
  })

  it('hides Delete from users who cannot delete and shows the row being deleted', () => {
    const { rerender } = renderSection({ canDelete: false })
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    rerender(
      <RecordDocumentsSection
        id="permit-documents"
        recordType="permit"
        rows={rows}
        upload={upload}
        onOpen={vi.fn()}
        canDelete
        removingId="1"
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  })

  it('confirms deletion with the file name and any extra consequence', async () => {
    const onDeleteStart = vi.fn()
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Document removal failed. Refresh and try again.'))
      .mockResolvedValueOnce(undefined)
    renderSection({
      onDeleteStart,
      onDelete,
      deleteConsequence: (row) => (row.source === 'invoice' ? 'The invoice goes too.' : undefined),
    })

    const [, permitRow, invoiceRow] = screen.getAllByRole('row')
    await userEvent.click(within(invoiceRow).getByRole('button', { name: 'Delete' }))
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    expect(confirmation).toHaveTextContent(
      'sales-contract.pdf will be deleted. The invoice goes too. This action cannot be undone.',
    )
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(within(permitRow).getByRole('button', { name: 'Delete' }))
    const permitConfirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    expect(permitConfirmation).not.toHaveTextContent('The invoice goes too.')
    await userEvent.click(within(permitConfirmation).getByRole('button', { name: 'Delete' }))
    expect(
      await within(permitConfirmation).findByText(
        'Document removal failed. Refresh and try again.',
      ),
    ).toBeVisible()
    await userEvent.click(within(permitConfirmation).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onDelete).toHaveBeenCalledWith(rows[0])
    expect(onDeleteStart).toHaveBeenCalledTimes(2)
  })

  it('shows loading, unavailable documents and the in-tab result', async () => {
    const onDismissResult = vi.fn()
    const { rerender } = renderSection({ loading: true })
    expect(screen.getByText('Loading permit documents…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    rerender(
      <RecordDocumentsSection
        id="permit-documents"
        recordType="permit"
        rows={[]}
        errorMessage="Unable to retrieve permit documents."
        result={DOCUMENT_DELETED_RESULT}
        onDismissResult={onDismissResult}
        upload={upload}
        onOpen={vi.fn()}
        canDelete
        removingId={null}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Documents unavailable' })).toBeVisible()
    expect(screen.getByText('Unable to retrieve permit documents.')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'No documents for this permit' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Document deleted.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onDismissResult).toHaveBeenCalledTimes(1)
  })

  it('opens the Add documents side panel and returns focus to its launcher when it closes', async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false)
      const [result, setResult] = useState<ActionResult | null>(null)
      return (
        <div id="record-content">
          <RecordDocumentsSection
            id="permit-documents"
            recordType="permit"
            rows={rows}
            result={result}
            upload={{
              ...upload,
              open,
              onOpen: () => setOpen(true),
              onClose: () => setOpen(false),
              onSaved: (savedCount) => setResult(documentsSavedResult(savedCount)),
            }}
            onOpen={vi.fn()}
            canDelete
            removingId={null}
            onDelete={vi.fn()}
          />
        </div>
      )
    }
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Add documents' }))
    const panel = await screen.findByRole('complementary', { name: 'Add documents' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add documents' })).toHaveFocus())
  })

  it('titles saved documents by count', () => {
    expect(documentsSavedResult(1)).toEqual({
      kind: 'success',
      title: '1 document saved.',
      message: '',
    })
    expect(documentsSavedResult(2).title).toBe('2 documents saved.')
  })
})
