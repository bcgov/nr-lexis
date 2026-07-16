import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import type { fetchApplicationDocuments } from '@/service/provincial-application-documents-service'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupApplicationDetailTests,
  NavigateButton,
  applicationDetail,
  mockApplicationDetailAuth,
  mockedFetchApplicationDocuments,
  mockedFetchApplicationPermits,
  mockedFetchProvincialApplicationDetail,
  mockedOpenApplicationDocument,
  mockedRemoveApplicationDocument,
  mockedSubmitAdminUpload,
  mockedValidateAdminUpload,
  selectApplicationDetailTab,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

describe.sequential('Provincial Application Detail Actions - documents', () => {
  beforeEach(setupApplicationDetailTests)

  it('shows permit lookup failures as unavailable and fails closed for industry uploads', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchApplicationPermits.mockRejectedValue(new Error('permit lookup failed'))

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Application')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Permits unavailable',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Permit information could not be retrieved for this application.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 3, name: 'No permits found' }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByText(
        'Application document upload is unavailable while permit information cannot be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()
  })

  it('shows document lookup failures as unavailable instead of truly empty', async () => {
    mockedFetchApplicationDocuments.mockRejectedValue(new Error('document lookup failed'))

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Documents unavailable',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Document information could not be retrieved for this application.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 3, name: 'No documents found' }),
    ).not.toBeInTheDocument()
  })

  it('labels the header file count unavailable without presenting a failed lookup as zero', async () => {
    mockedFetchApplicationDocuments.mockRejectedValue(new Error('document lookup failed'))

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const applicationHighlights = await screen.findByRole('group', {
      name: 'Application highlights',
    })
    await waitFor(() => {
      expect(within(applicationHighlights).getByText('Unavailable')).toBeInTheDocument()
    })
    expect(within(applicationHighlights).getByText('File count')).toBeInTheDocument()
    expect(within(applicationHighlights).queryByText('0')).not.toBeInTheDocument()
  })

  it('shows the embedded application upload panel on the documents tab without header actions', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')

    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
  })

  it('shows inline application upload to a scoped Provincial Submitter', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === '/fileApplicationUpload',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')

    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
    expect(screen.getByLabelText('Document description')).toBeInTheDocument()
  })

  it('shows only the upload panel when an application has no documents', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No documents found',
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('No documents are on file for this application yet.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
    expect(screen.getByLabelText('Document description')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter document rows')).not.toBeInTheDocument()
    expect(
      screen.queryByText('No document rows matched the current filter.'),
    ).not.toBeInTheDocument()
  })

  it('shows existing application documents before the upload accordion', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '900',
          name: 'existing-doc.pdf',
          description: 'Existing document',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('existing-doc.pdf')
    const uploadToggle = screen.getByRole('button', {
      name: 'Upload new documents',
    })

    expect(screen.getByRole('region', { name: 'Application document rows' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter document rows')).toBeInTheDocument()
    expect(
      documentName.compareDocumentPosition(uploadToggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await userEvent.click(uploadToggle)
    expect(screen.getByLabelText('Document description')).toBeVisible()
  })

  it('disables application upload for expired applications', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')

    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(
      await screen.findByText(
        'Application document upload is unavailable for expired applications.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
  })

  it('disables application upload for industry users when a permit is complete', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchApplicationPermits.mockResolvedValue([
      { permitNumber: '900101', permitStatusDescription: 'Complete' },
    ])

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Application document upload is unavailable for industry users when the application has a complete permit.',
      ),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
  })

  it('uploads application documents inline and refreshes document rows', async () => {
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [],
        source: 'api',
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '900',
            name: 'uploaded-doc.pdf',
            description: 'Uploaded',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const file = new File(['test'], 'uploaded-doc.pdf', {
      type: 'application/pdf',
    })

    await userEvent.type(screen.getByLabelText('Document description'), 'Uploaded')
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => {
      expect(mockedValidateAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file,
          fileDescription: 'Uploaded',
        }),
      )
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file,
          fileDescription: 'Uploaded',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getAllByText('uploaded-doc.pdf').length).toBeGreaterThanOrEqual(1)
    })
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
  })

  it('keeps a partial upload queue mounted while the document list refreshes', async () => {
    let resolveDocumentRefresh:
      | ((value: Awaited<ReturnType<typeof fetchApplicationDocuments>>) => void)
      | undefined
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({ rows: [], source: 'api' })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDocumentRefresh = resolve
        }),
      )
    mockedSubmitAdminUpload
      .mockResolvedValueOnce({
        status: 'success',
        message: 'First document uploaded.',
      })
      .mockRejectedValueOnce(new Error('Second upload failed'))

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    await userEvent.type(await screen.findByLabelText('Document description'), 'Mixed batch')
    await userEvent.upload(screen.getByLabelText('Document File'), [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('second.pdf').length).toBeGreaterThan(0)

    await act(async () => {
      resolveDocumentRefresh?.({
        rows: [
          {
            id: '901',
            name: 'first.pdf',
            description: 'Mixed batch',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
    })

    expect(await screen.findByText(/1 file failed/)).toBeInTheDocument()
    expect(screen.getAllByText('second.pdf').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Upload new documents' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('includes queued document uploads in application dirty-state protection', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)

    await userEvent.upload(
      screen.getByLabelText('Document File'),
      new File(['queued'], 'queued-doc.pdf', { type: 'application/pdf' }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled())
    const queuedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(queuedUnload)
    expect(queuedUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const clearedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clearedUnload)
    expect(clearedUnload.defaultPrevented).toBe(false)
  })

  it('opens application document from API response', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '100',
          name: 'app-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenApplicationDocument).toHaveBeenCalledWith('100', 'app-doc.pdf', '321')
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes application documents and refreshes rows', async () => {
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '100',
            name: 'app-doc.pdf',
            description: 'remove me',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
      .mockResolvedValueOnce({
        rows: [],
        source: 'api',
      })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemoveApplicationDocument).toHaveBeenCalledWith('100', '321')
      expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('app-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('keeps linked permit documents read-only on the application aggregate', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '101',
          name: 'permit-doc.pdf',
          description: 'linked permit copy',
          type: 'Permit document',
          source: 'permit',
          deletable: false,
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentRow = (await screen.findByText('permit-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getByText('Permit')).toBeInTheDocument()
    expect(
      within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    ).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('keeps application document delete disabled for approvers when the application is expired', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '100',
          name: 'expired-doc.pdf',
          description: 'expired application',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(
      await screen.findByText(
        'Application document upload is unavailable for expired applications.',
      ),
    ).toBeInTheDocument()

    const documentName = await screen.findByText('expired-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('keeps expired application document delete available to scoped industry users', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === '/applicationDetails',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      industryUser: true,
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '104',
          name: 'industry-expired-doc.pdf',
          description: 'legacy industry cleanup',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentRow = (await screen.findByText('industry-expired-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    ).toBeEnabled()
  })

  it('ignores stale document refreshes after navigating to another application', async () => {
    const secondApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationNumber: 654,
      ownerClientNumber: '00099988',
    }
    let resolveStaleDocuments:
      | ((value: Awaited<ReturnType<typeof fetchApplicationDocuments>>) => void)
      | undefined
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(secondApplicationDetail)
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '100',
            name: 'old-doc.pdf',
            description: 'old application',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleDocuments = resolve
          }),
      )
      .mockResolvedValueOnce({
        rows: [
          {
            id: '200',
            name: 'new-doc.pdf',
            description: 'new application',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={
              <>
                <NavigateButton to="/provincial/application/654" />
                <ProvincialApplicationDetailsPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('old-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    await userEvent.click(
      within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(() => {
      expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Navigate application' }))

    expect(await screen.findByText('new-doc.pdf')).toBeInTheDocument()

    await act(async () => {
      resolveStaleDocuments?.({
        rows: [
          {
            id: '999',
            name: 'stale-doc.pdf',
            description: 'stale application',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
    })

    expect(screen.getByText('new-doc.pdf')).toBeInTheDocument()
    expect(screen.queryByText('old-doc.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('stale-doc.pdf')).not.toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('654')
  })

  it('disables upload and delete without file upload permission or a delete role', async () => {
    mockApplicationDetailAuth((action: string) => action !== '/fileApplicationUpload', [])
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '101',
          name: 'locked-doc.pdf',
          description: 'locked',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentName = await screen.findByText('locked-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('keeps application delete available to approvers without file upload permission', async () => {
    mockApplicationDetailAuth(
      (action: string) => action !== '/fileApplicationUpload',
      ['LEXIS_APPLICATION_APPROVER'],
    )
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '103',
          name: 'approver-doc.pdf',
          description: 'delete without upload',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentRow = (await screen.findByText('approver-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    ).toBeEnabled()
  })

  it('disables application document delete when status is unavailable', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: null,
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '102',
          name: 'unknown-status-doc.pdf',
          description: 'unknown status',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('unknown-status-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    ).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })
})
