import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RTMEmsLogAmvPage from '@/pages/RTMEmsLogAmv'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  previewRtmEmsLogAmvUpload: vi.fn(),
  uploadRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

describe('RTM EMS Log AMV actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
  })

  it('renders upload-only average monthly value controls', async () => {
    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    expect(screen.queryByRole('heading', { name: 'Query rows' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manual entry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save row' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upload Excel Spreadsheet' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Data Preview' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'download',
      'rtm-ems-log-amv-template.xlsx',
    )
    expect(
      screen.getByText(
        'Supported format: .xlsx. Enter the update date and AMV values in the template; values apply to old and second growth.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Preview data' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply upload' })).toBeDisabled()
  })
})
