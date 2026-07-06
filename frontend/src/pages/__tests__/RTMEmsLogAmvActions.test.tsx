import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RTMEmsLogAmvPage from '@/pages/RTMEmsLogAmv'
import {
  previewRtmEmsLogAmvUpload,
  uploadRtmEmsLogAmv,
  type RtmEmsLogAmvUploadPreview,
  type RtmEmsLogAmvUploadResult,
} from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  previewRtmEmsLogAmvUpload: vi.fn(),
  uploadRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedPreviewUpload = vi.mocked(previewRtmEmsLogAmvUpload)
const mockedUpload = vi.mocked(uploadRtmEmsLogAmv)

const acceptedPreview: RtmEmsLogAmvUploadPreview = {
  status: 'accepted',
  fileName: 'rtm-ems-log-amv-template.xlsx',
  fileSize: 12,
  message: 'Preview generated.',
  rowCount: 8,
  retrievalDate: '2026-07-06',
  updateDate: '2026-06-01',
  errors: [],
  warnings: [],
  rows: [
    {
      species: 'BA',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 10.25,
      returnCode: null,
    },
    {
      species: 'HE',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 20.5,
      returnCode: null,
    },
    {
      species: 'WH',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 30.75,
      returnCode: null,
    },
    {
      species: 'LO',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 30.75,
      returnCode: null,
    },
    {
      species: 'YE',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 30.75,
      returnCode: null,
    },
    {
      species: 'BA',
      grade: 'A',
      growthIndicator: 'S',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 10.25,
      returnCode: null,
    },
    {
      species: 'HE',
      grade: 'A',
      growthIndicator: 'S',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 20.5,
      returnCode: null,
    },
    {
      species: 'WH',
      grade: 'A',
      growthIndicator: 'S',
      retrievalDate: '2026-07-06',
      updateDate: '2026-06-01',
      currentValue: null,
      newValue: 30.75,
      returnCode: null,
    },
  ],
}

const acceptedUpload: RtmEmsLogAmvUploadResult = {
  status: 'accepted',
  fileName: 'rtm-ems-log-amv-template.xlsx',
  fileSize: 12,
  message: 'Upload applied.',
  attemptedRowCount: 8,
  uploadedRowCount: 8,
  errors: [],
  warnings: [],
  rows: [],
}

describe('RTM EMS Log AMV actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedPreviewUpload.mockResolvedValue(acceptedPreview)
    mockedUpload.mockResolvedValue(acceptedUpload)
  })

  it('renders upload-only average monthly value controls', async () => {
    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    expect(screen.queryByRole('heading', { name: 'Query rows' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manual entry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save row' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upload Excel Spreadsheet' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Data Preview' })).not.toBeInTheDocument()
    const workflowProgress = screen.getByRole('list', {
      name: 'Average monthly values upload workflow progress',
    })
    expect(within(workflowProgress).getByText('1. Upload')).toBeVisible()
    expect(within(workflowProgress).getByText('2. Review')).toBeVisible()
    expect(
      within(workflowProgress).getByText('1. Upload').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'download',
      'rtm-ems-log-amv-template.xlsx',
    )
    expect(
      screen.getByText(
        'Supported format: .xlsx. Enter the update date and AMV values in the template; values apply to old and second growth.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Choose an average monthly values upload spreadsheet' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('validates the selected file automatically before review and save', async () => {
    const user = userEvent.setup()
    const file = new File(['excel bytes'], 'rtm-ems-log-amv-template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    render(<RTMEmsLogAmvPage />)

    await user.upload(screen.getByLabelText('Average monthly values upload spreadsheet'), file)

    await waitFor(() => expect(mockedPreviewUpload).toHaveBeenCalledWith(file))
    expect(await screen.findByText('Spreadsheet validated')).toBeVisible()
    expect(screen.getByText('"rtm-ems-log-amv-template.xlsx" is ready for review.')).toBeVisible()

    const reviewButton = screen.getByRole('button', { name: 'Review upload' })
    await waitFor(() => expect(reviewButton).toBeEnabled())
    await user.click(reviewButton)

    expect(screen.getByRole('heading', { name: 'Review upload' })).toBeVisible()
    const workflowProgress = screen.getByRole('list', {
      name: 'Average monthly values upload workflow progress',
    })
    expect(
      within(workflowProgress).getByText('2. Review').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    const reviewTable = screen.getByRole('table', { name: 'Average monthly value upload review' })
    expect(reviewTable).toBeVisible()
    expect(within(reviewTable).getByRole('columnheader', { name: 'Balsam' })).toBeVisible()
    expect(within(reviewTable).getByRole('columnheader', { name: 'Pine' })).toBeVisible()
    expect(
      within(reviewTable).queryByRole('columnheader', { name: 'Growth' }),
    ).not.toBeInTheDocument()
    expect(within(reviewTable).getAllByRole('row')).toHaveLength(2)
    expect(within(reviewTable).queryByText('Old growth')).not.toBeInTheDocument()
    expect(within(reviewTable).queryByText('Second growth')).not.toBeInTheDocument()
    expect(within(reviewTable).getAllByText('10.25')).toHaveLength(1)
    expect(within(reviewTable).getAllByText('30.75')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith({ file }))
    await waitFor(() => expect(screen.getAllByText('Upload applied.')).toHaveLength(2))
  })

  it('keeps users on upload when validation fails', async () => {
    const user = userEvent.setup()
    mockedPreviewUpload.mockResolvedValue({
      ...acceptedPreview,
      status: 'validation_failed',
      message: 'Template is missing an update date.',
      rowCount: 0,
      errors: ['The update date is required in the uploaded template.'],
      rows: [],
    })

    render(<RTMEmsLogAmvPage />)

    await user.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      new File(['excel bytes'], 'invalid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )

    expect(await screen.findByText('1 validation issue found')).toBeVisible()
    expect(screen.getByText('The update date is required in the uploaded template.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Review upload' })).not.toBeInTheDocument()
  })
})
