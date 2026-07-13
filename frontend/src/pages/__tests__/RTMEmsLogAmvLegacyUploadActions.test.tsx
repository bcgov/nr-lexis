import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import LegacyRtmEmsLogAmvUploadWorkflow from '@/pages/RTMEmsLogAmv/LegacyUploadWorkflow'
import { previewRtmEmsLogAmvUpload } from '@/service/rtm-emslogamv-service'
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

describe('legacy RTM EMS Log AMV upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
  })

  it('rejects files above 20 MiB before requesting a server preview', async () => {
    render(<LegacyRtmEmsLogAmvUploadWorkflow />)
    const oversized = new File(
      [new Uint8Array(20 * 1024 * 1024 + 1)],
      'oversized-rtm-template.xlsx',
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    )

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      oversized,
    )

    expect(await screen.findByText('File must be 20 MiB or smaller.')).toBeVisible()
    expect(mockedPreviewUpload).not.toHaveBeenCalled()
  })

  it('reviews physical pine species and legacy W and BLANK grades without collapsing keys', async () => {
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'rtm-values.xlsx',
      fileSize: 1,
      message: 'Spreadsheet is valid.',
      rowCount: 4,
      retrievalDate: '2026-06-01',
      updateDate: '2026-07-01',
      errors: [],
      warnings: [],
      rows: [
        {
          species: 'WH',
          grade: 'W',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'LO',
          grade: 'W',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 20,
          returnCode: '0',
        },
        {
          species: 'YE',
          grade: 'W',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 30,
          returnCode: '0',
        },
        {
          species: 'BA',
          grade: ' ',
          growthIndicator: 'S',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 4,
          returnCode: '0',
        },
      ],
    })
    render(<LegacyRtmEmsLogAmvUploadWorkflow />)
    const workbook = new File([new Uint8Array([1])], 'rtm-values.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )
    await screen.findByText('Spreadsheet validated')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))

    const table = screen.getByRole('table', { name: 'Average monthly value upload review' })
    expect(within(table).getByRole('columnheader', { name: 'Western white pine' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'Lodgepole pine' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'Yellow pine' })).toBeVisible()
    expect(within(table).queryByRole('columnheader', { name: 'Pine' })).not.toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /W.*10\.00.*20\.00.*30\.00/ })).toBeVisible()
    expect(within(table).getByRole('row', { name: /BLANK.*4\.00/ })).toBeVisible()
  })
})
