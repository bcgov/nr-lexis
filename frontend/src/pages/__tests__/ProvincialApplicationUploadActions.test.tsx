import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialApplicationUploadPage from '@/pages/ProvincialApplicationUpload'
import {
  submitAdminUpload,
  validateApplicationSubmissionUpload,
  type AdminUploadResult,
  type LexisXmlSubmissionSummary,
} from '@/service/admin-upload-service'
import type * as ApplicationItemsServiceModule from '@/service/provincial-application-items-service'
import { fetchApplicationEndUsesForSpeciesRegion } from '@/service/provincial-application-items-service'
import type * as SearchOptionsServiceModule from '@/service/search-options-service'
import { fetchProvincialApplicationOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateApplicationSubmissionUpload: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', async (importOriginal) => ({
  ...(await importOriginal<typeof ApplicationItemsServiceModule>()),
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
}))

vi.mock('@/service/search-options-service', async (importOriginal) => ({
  ...(await importOriginal<typeof SearchOptionsServiceModule>()),
  fetchProvincialApplicationOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedValidateApplicationSubmissionUpload = vi.mocked(validateApplicationSubmissionUpload)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchApplicationEndUsesForSpeciesRegion = vi.mocked(
  fetchApplicationEndUsesForSpeciesRegion,
)

const SUBMITTER_ACTIONS = [
  'uploadApplicationSubmission',
  '/applicationSearch',
  '/applicationDetails',
]

const mockAccess = (...allowedActions: string[]): void => {
  mockedUseAuth.mockReturnValue(
    createTestAuthContext({
      canPerform: (action: string) => allowedActions.includes(action),
    }),
  )
}

const summaryFor = (packageNumber: string): LexisXmlSubmissionSummary => ({
  ownerClientNumber: '00162575',
  ownerClientLocationCode: '00',
  ownerContactName: 'Test Contact',
  agentClientNumber: null,
  jurisdictionCode: 'P',
  orgUnitNumber: 1909,
  regionCode: 'RSC',
  exemptionReasonCode: 'S',
  applicantTypeCode: 'O',
  productTypeCode: 'H',
  packageNumber,
  productLocation: 'Test Log Sort',
  ageClass: 'S',
  averageLength: 8.4,
  averageDiameter: 21.6,
  applicationVolume: 312.5,
  averageLogVolume: 0.4,
  endUseCode: 'SW',
  speciesCodes: ['HE'],
  scaleRows: 2,
})

const validated = (packageNumber: string): AdminUploadResult => ({
  status: 'validated',
  packageNumber,
  scaleRows: 2,
  submissionSummary: summaryFor(packageNumber),
})

const rejected = (...errors: string[]): AdminUploadResult => ({ status: 'rejected', errors })

const xmlFile = (name: string): File => new File(['<xml />'], name, { type: 'application/xml' })

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/application/upload']}>
      <Routes>
        <Route
          path="/provincial/application/upload"
          element={<ProvincialApplicationUploadPage />}
        />
        <Route path="/provincial/application" element={<h1>Application search</h1>} />
      </Routes>
    </MemoryRouter>,
  )

const addFiles = async (...files: File[]) => {
  await userEvent.upload(screen.getByLabelText('Application files'), files)
}

const reviewButton = () => screen.getByRole('button', { name: 'Review' })

const goToReview = async () => {
  await waitFor(() => expect(reviewButton()).toBeEnabled())
  await userEvent.click(reviewButton())
  await screen.findByRole('heading', { name: 'Review' })
}

describe('Upload applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    mockAccess(...SUBMITTER_ACTIONS)
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'S', label: 'Surplus' }],
      applicationStatuses: [],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'S', label: 'Second Growth' }],
      regions: [],
      currentSchedules: [],
    })
    mockedFetchApplicationEndUsesForSpeciesRegion.mockResolvedValue([
      { code: 'SW', description: 'Sawlog' },
    ])
  })

  it('opens on an empty upload step that keeps Review available', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Upload applications' })).toBeVisible()
    expect(
      screen.getByText('Create one or more applications by uploading their LEXIS files.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Upload' })).toBeVisible()
    expect(
      screen.getByText('Each file creates one application. You can add several files at once.'),
    ).toBeVisible()
    expect(screen.getByText('Application files')).toBeVisible()
    expect(
      screen.getByText(
        /Accepted file types: XML, ZIP, GeoJSON, and JSON\. Maximum file size: 20 MB per file\.\s+A ZIP file can contain only one application\./,
      ),
    ).toBeVisible()
    const progress = screen.getByRole('list', { name: 'Upload applications progress' })
    expect(within(progress).getByText('1. Upload').closest('[role="listitem"]')).toHaveAttribute(
      'aria-current',
      'step',
    )

    await userEvent.click(reviewButton())

    expect(screen.getByText('Add at least one file to review')).toBeVisible()
    const dropZone = screen.getByRole('button', { name: 'Choose files for Application files' })
    expect(dropZone).toHaveFocus()
    expect(dropZone).toHaveClass('is-invalid')
    expect(screen.getByRole('heading', { level: 2, name: 'Upload' })).toBeVisible()
    expect(screen.queryByRole('heading', { level: 2, name: 'Review' })).not.toBeInTheDocument()
  })

  it('focuses the page heading when the page opens with focus lost', async () => {
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Upload applications' })).toHaveFocus(),
    )
  })

  it('validates files one at a time and disables Review until they finish', async () => {
    const first = deferred<AdminUploadResult>()
    const second = deferred<AdminUploadResult>()
    mockedValidateApplicationSubmissionUpload
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    renderPage()

    await addFiles(xmlFile('test-2026-10-20-01.xml'), xmlFile('test-2026-10-20-02.xml'))

    expect(screen.getAllByLabelText('Validating file')).toHaveLength(2)
    expect(screen.getByText('Validating 2 files')).toBeInTheDocument()
    expect(reviewButton()).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
    expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledTimes(1)

    await act(async () => first.resolve(validated('TEST1020-V01')))

    await waitFor(() => expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledTimes(2))
    expect(screen.getAllByLabelText('Validating file')).toHaveLength(1)
    expect(reviewButton()).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Remove test-2026-10-20-01.xml' }),
    ).toBeInTheDocument()

    await act(async () => second.resolve(validated('TEST1020-V02')))

    expect(await screen.findByText('2 files validated')).toBeVisible()
    expect(screen.getByText('Review them to create the applications.')).toBeVisible()
    expect(screen.getAllByText('Validated')).toHaveLength(2)
    expect(screen.queryByText('Validating 2 files')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Validation issues/ })).not.toBeInTheDocument()
    expect(reviewButton()).toBeEnabled()
  })

  it('reports failed files once for the batch with their issues', async () => {
    mockedValidateApplicationSubmissionUpload.mockImplementation(async ({ file }) =>
      file.name === 'test-2026-10-20-02.xml'
        ? rejected('Summary of scale is required.')
        : validated(`PKG-${file.name}`),
    )
    renderPage()

    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'test-2026-10-20-03.xml', {
      type: 'application/xml',
    })
    await addFiles(xmlFile('test-2026-10-20-01.xml'), xmlFile('test-2026-10-20-02.xml'), oversized)

    expect(await screen.findByText('2 of 3 files failed validation')).toBeVisible()
    expect(
      screen.getByText(
        'Correct the failed files and add them again, or review the 1 valid file and create its application.',
      ),
    ).toBeVisible()
    expect(screen.getAllByText('Failed')).toHaveLength(2)
    expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledTimes(2)

    const issuesTable = screen.getByRole('table', { name: 'Validation issues (2)' })
    expect(
      within(issuesTable)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Application file', 'Detail'])
    expect(
      within(issuesTable).getByRole('row', {
        name: 'test-2026-10-20-02.xml Summary of scale is required.',
      }),
    ).toBeInTheDocument()
    expect(
      within(issuesTable).getByRole('row', {
        name: 'test-2026-10-20-03.xml The file must be 20 MB or smaller.',
      }),
    ).toBeInTheDocument()
    const download = screen.getByRole('link', { name: 'Download issues (.csv)' })
    expect(download).toHaveAttribute('download', 'lexis-validation-issues.csv')
    expect(decodeURIComponent(download.getAttribute('href') ?? '')).toContain(
      '"Application file","Detail"',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove test-2026-10-20-02.xml' }))

    expect(screen.getByText('1 of 2 files failed validation')).toBeVisible()
    expect(screen.getByRole('table', { name: 'Validation issues (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove test-2026-10-20-03.xml' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Remove test-2026-10-20-03.xml' }))

    expect(screen.getByRole('button', { name: 'Remove test-2026-10-20-01.xml' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Remove test-2026-10-20-01.xml' }))

    expect(screen.getByRole('button', { name: 'Choose files for Application files' })).toHaveFocus()
  })

  it('explains that no files are ready when every file failed', async () => {
    mockedValidateApplicationSubmissionUpload.mockResolvedValue(
      rejected('A ZIP file can contain only one application file.'),
    )
    renderPage()

    await addFiles(new File(['zip'], 'test-2026-10-20.zip', { type: 'application/zip' }))

    expect(await screen.findByText('1 file failed validation')).toBeVisible()
    expect(screen.getByText('Correct the file and add it again.')).toBeVisible()

    await userEvent.click(reviewButton())

    expect(
      screen.getByText(
        'No files are ready for review. Correct the failed files and add them again.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose files for Application files' })).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Review' })).not.toBeInTheDocument()

    await addFiles(xmlFile('test-2026-10-20-01.xml'), xmlFile('test-2026-10-20-02.xml'))

    expect(
      screen.queryByText(
        'No files are ready for review. Correct the failed files and add them again.',
      ),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('3 files failed validation')).toBeVisible()
    expect(screen.getByText('Correct the files and add them again.')).toBeVisible()
  })

  it('keeps only the latest result when a file is added again under the same name', async () => {
    const first = deferred<AdminUploadResult>()
    mockedValidateApplicationSubmissionUpload
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(validated('TEST1020-V02'))
    renderPage()

    await addFiles(xmlFile('test-2026-10-20.xml'))
    await addFiles(xmlFile('test-2026-10-20.xml'))
    await act(async () => first.resolve(rejected('Summary of scale is required.')))

    expect(await screen.findByText('1 file validated')).toBeVisible()
    expect(screen.getByText('Review it to create the application.')).toBeVisible()
    expect(screen.getAllByText('test-2026-10-20.xml')).toHaveLength(1)
    expect(screen.queryByText('Summary of scale is required.')).not.toBeInTheDocument()
  })

  it('reviews the valid files in a table whose rows open to show the application', async () => {
    mockedValidateApplicationSubmissionUpload.mockImplementation(async ({ file }) =>
      file.name === 'test-2026-10-20-03.xml'
        ? rejected('Summary of scale is required.')
        : validated(file.name === 'test-2026-10-20-01.xml' ? 'TEST1020-V01' : 'TEST1020-V02'),
    )
    renderPage()
    await addFiles(
      xmlFile('test-2026-10-20-01.xml'),
      xmlFile('test-2026-10-20-02.xml'),
      xmlFile('test-2026-10-20-03.xml'),
    )
    await goToReview()

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Review' })).toHaveFocus(),
    )
    expect(screen.getByText('Check the applications before you create them.')).toBeVisible()
    const progress = screen.getByRole('list', { name: 'Upload applications progress' })
    expect(within(progress).getByText('2. Review').closest('[role="listitem"]')).toHaveAttribute(
      'aria-current',
      'step',
    )
    const table = screen.getByRole('table', { name: 'Applications to create (2)' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
        .filter(Boolean),
    ).toEqual([
      'Application file',
      'Owner client',
      'Agent client',
      'Package',
      'Application volume (m³)',
      'Region',
    ])
    expect(
      within(table).getByRole('row', {
        name: 'test-2026-10-20-01.xml 00162575 Not provided TEST1020-V01 312.5 RSC',
      }),
    ).toBeInTheDocument()
    expect(within(table).queryByText('test-2026-10-20-03.xml')).not.toBeInTheDocument()
    expect(within(table).getAllByText('Contact name')[0]).not.toBeVisible()

    await userEvent.click(
      screen.getByRole('button', { name: 'Details for test-2026-10-20-01.xml' }),
    )

    const details = document.getElementById(
      screen.getByRole('button', { name: 'Details for test-2026-10-20-01.xml' }).closest('tr')
        ?.nextElementSibling?.id ?? '',
    ) as HTMLElement
    expect(details).toBeVisible()
    await waitFor(() => expect(within(details).getByText('Harvested Timber')).toBeVisible())
    for (const [label, value] of [
      ['Contact name', 'Test Contact'],
      ['Exemption reason', 'Surplus'],
      ['Location of logs', 'Test Log Sort'],
      ['Age class', 'Second Growth'],
      ['Average log volume (m³)', '0.4'],
      ['Species list', 'HE'],
      ['End use', 'Sawlog'],
      ['Package volume (m³)', '312.5'],
      ['Average length (m)', '8.4'],
      ['Average top diameter (rads)', '21.6'],
      ['Summary of scale', '2 lines'],
    ]) {
      expect(within(details).getByText(label).nextElementSibling).toHaveTextContent(value)
    }
    expect(
      within(details)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(['Applicant', 'Application', 'Package'])

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Upload' })).toHaveFocus(),
    )
    expect(screen.getAllByText('Validated')).toHaveLength(2)
    expect(screen.getByText('Failed')).toBeVisible()
  })

  it('creates the applications one at a time and shows the result page', async () => {
    mockedValidateApplicationSubmissionUpload.mockImplementation(async ({ file }) =>
      validated(file.name === 'test-2026-10-20-01.xml' ? 'TEST1020-V01' : 'TEST1020-V02'),
    )
    const firstCreate = deferred<AdminUploadResult>()
    mockedSubmitAdminUpload
      .mockReturnValueOnce(firstCreate.promise)
      .mockResolvedValueOnce({ applicationNumber: 46821, packageNumber: 'TEST1020-V02' })
    renderPage()
    await addFiles(xmlFile('test-2026-10-20-01.xml'), xmlFile('test-2026-10-20-02.xml'))
    await goToReview()

    await userEvent.click(screen.getByRole('button', { name: 'Create 2 applications' }))

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(1)
    expect(mockedSubmitAdminUpload).toHaveBeenCalledWith('applicationSubmission', {
      file: expect.objectContaining({ name: 'test-2026-10-20-01.xml' }),
    })

    await act(async () =>
      firstCreate.resolve({ applicationNumber: 46820, packageNumber: 'TEST1020-V01' }),
    )

    const title = await screen.findByRole('heading', { level: 1, name: '2 applications created' })
    expect(title).toHaveFocus()
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 })
    expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('list', { name: 'Upload applications progress' })).toBeNull()
    expect(
      screen.getByText('Open an application from the list, or find it later in', { exact: false }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Application search' })).toHaveAttribute(
      'href',
      '/provincial/application',
    )
    const created = screen.getByRole('table', { name: 'Created (2)' })
    expect(within(created).getByRole('link', { name: '46820' })).toHaveAttribute(
      'href',
      '/provincial/application/46820',
    )
    expect(
      within(created).getByRole('row', { name: 'test-2026-10-20-02.xml 46821 TEST1020-V02' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Not created/ })).not.toBeInTheDocument()
    const uploadMore = screen.getByRole('button', { name: 'Upload more applications' })
    expect(uploadMore).toHaveClass('cds--btn--tertiary')

    await userEvent.click(uploadMore)

    expect(await screen.findByRole('heading', { level: 2, name: 'Upload' })).toBeVisible()
    expect(screen.queryByText('test-2026-10-20-01.xml')).not.toBeInTheDocument()
  })

  it('lists files that were not created first, with their reasons', async () => {
    mockedValidateApplicationSubmissionUpload.mockImplementation(async ({ file }) =>
      validated(file.name === 'test-2026-10-20-01.xml' ? 'TEST1020-V01' : 'TEST1020-V02'),
    )
    mockedSubmitAdminUpload
      .mockResolvedValueOnce({ applicationNumber: 46820, packageNumber: 'TEST1020-V01' })
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: { status: 'rejected', errors: ['Package TEST1020-V02 already exists.'] },
        },
      })
    renderPage()
    await addFiles(xmlFile('test-2026-10-20-01.xml'), xmlFile('test-2026-10-20-02.xml'))
    await goToReview()

    await userEvent.click(screen.getByRole('button', { name: 'Create 2 applications' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: '1 of 2 applications created' }),
    ).toHaveFocus()
    expect(
      screen.getByText('1 file was not created. Check the reason before you upload it again.'),
    ).toBeVisible()
    expect(
      screen.getByText('Open the created application from the list, or find it later in', {
        exact: false,
      }),
    ).toBeVisible()
    const tables = screen.getAllByRole('table')
    expect(tables.map((table) => table.getAttribute('aria-labelledby'))).toHaveLength(2)
    expect(tables[0]).toHaveAccessibleName('Not created (1)')
    expect(tables[1]).toHaveAccessibleName('Created (1)')
    expect(
      within(tables[0]).getByRole('row', {
        name: 'test-2026-10-20-02.xml Package TEST1020-V02 already exists.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload more applications' })).toHaveClass(
      'cds--btn--primary',
    )
  })

  it('shows the generic failure when the server fails without a reason', async () => {
    mockedValidateApplicationSubmissionUpload.mockResolvedValue(validated('TEST1020-V01'))
    mockedSubmitAdminUpload.mockRejectedValue({
      response: { status: 500, data: { message: 'Database connection refused' } },
    })
    renderPage()
    await addFiles(xmlFile('test-2026-10-20.xml'))
    await goToReview()

    await userEvent.click(screen.getByRole('button', { name: 'Create 1 application' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No applications created' }),
    ).toHaveFocus()
    expect(
      screen.getByText("The file couldn't be created. Check the reason in the list."),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Application search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /^Created/ })).not.toBeInTheDocument()
    const notCreated = screen.getByRole('table', { name: 'Not created (1)' })
    expect(
      within(notCreated).getByText(/We couldn't save this application\. Try again later\./),
    ).toBeVisible()
    expect(within(notCreated).queryByText(/Database/)).not.toBeInTheDocument()
    expect(within(notCreated).getByRole('link', { name: 'report an issue' })).toHaveAttribute(
      'href',
      'mailto:Heartwood@gov.bc.ca',
    )
    expect(screen.getByRole('button', { name: 'Upload applications' })).toHaveClass(
      'cds--btn--primary',
    )
  })

  it('links the report an issue request in a reason that asks for it', async () => {
    mockedValidateApplicationSubmissionUpload.mockResolvedValue(validated('TEST1020-V01'))
    mockedSubmitAdminUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          status: 'rejected',
          errors: [
            "We couldn't save this application. Try again later. If it keeps happening, report an issue.",
          ],
        },
      },
    })
    renderPage()
    await addFiles(xmlFile('test-2026-10-20.xml'))
    await goToReview()

    await userEvent.click(screen.getByRole('button', { name: 'Create 1 application' }))

    const notCreated = await screen.findByRole('table', { name: 'Not created (1)' })
    expect(
      within(notCreated).getByText(/We couldn't save this application\. Try again later\./),
    ).toBeVisible()
    expect(within(notCreated).getByRole('link', { name: 'report an issue' })).toHaveAttribute(
      'href',
      'mailto:Heartwood@gov.bc.ca',
    )
  })

  it('shows the generic validation failure when the server is unavailable', async () => {
    mockedValidateApplicationSubmissionUpload.mockRejectedValue({
      response: {
        status: 503,
        data: {
          title: 'Service temporarily unavailable',
          detail: 'LEXIS could not complete the request. Please try again later.',
        },
      },
    })
    renderPage()

    await addFiles(xmlFile('test-2026-10-20.xml'))

    const issuesTable = await screen.findByRole('table', { name: 'Validation issues (1)' })
    expect(
      within(issuesTable).getByText(/We couldn't check this file\. Try again later\./),
    ).toBeVisible()
    expect(within(issuesTable).getByRole('link', { name: 'report an issue' })).toHaveAttribute(
      'href',
      'mailto:Heartwood@gov.bc.ca',
    )
    expect(within(issuesTable).queryByText(/LEXIS could not complete/)).not.toBeInTheDocument()
  })

  it('shows the size limit when the server turns a file down as too large', async () => {
    mockedValidateApplicationSubmissionUpload.mockRejectedValue({
      response: {
        status: 413,
        data: { message: 'The selected file is too large. Choose a smaller file and try again.' },
      },
    })
    renderPage()

    await addFiles(xmlFile('test-2026-10-20.xml'))

    const issuesTable = await screen.findByRole('table', { name: 'Validation issues (1)' })
    expect(
      within(issuesTable).getByRole('row', {
        name: 'test-2026-10-20.xml The file must be 20 MB or smaller.',
      }),
    ).toBeInTheDocument()
  })

  it('asks before leaving while files are on the page', async () => {
    mockedValidateApplicationSubmissionUpload.mockResolvedValue(validated('TEST1020-V01'))
    const router = createMemoryRouter(
      [
        { path: '/provincial/application/upload', element: <ProvincialApplicationUploadPage /> },
        { path: '/provincial/application', element: <h1>Application search</h1> },
      ],
      { initialEntries: ['/provincial/application/upload'] },
    )
    render(<RouterProvider router={router} />)
    await addFiles(xmlFile('test-2026-10-20.xml'))
    await screen.findByText('1 file validated')

    await act(async () => {
      void router.navigate('/provincial/application')
    })

    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/provincial/application/upload')
  })
})
