import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminPage from '@/pages/Admin'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Admin tool access smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\admin',
        roles: ['ADMIN'],
        welcomeTarget: '/admin',
        legacyPath: null,
        grantedActions: [
          '/lexisAgentAdmin',
          '/fileApplicationUpload',
          '/lexisPolicyAdmin',
          'createApplication',
          'uploadApplicationSubmission',
        ],
      },
      canPerform: (action: string) =>
        [
          '/lexisAgentAdmin',
          '/fileApplicationUpload',
          '/lexisPolicyAdmin',
          'createApplication',
          'uploadApplicationSubmission',
        ].includes(action),
      refresh: vi.fn().mockResolvedValue(undefined),
    } as any)
  })

  it('opens policy and upload workflows when required actions are granted', async () => {
    renderPage()

    const policyRow = screen.getByText('Fee policy administration').closest('tr')
    expect(policyRow).not.toBeNull()

    await userEvent.click(
      within(policyRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/admin/policies')

    const uploadRow = screen.getByText('Application upload').closest('tr')
    expect(uploadRow).not.toBeNull()

    await userEvent.click(
      within(uploadRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/admin/uploads?type=application')

    const submissionUploadRow = screen.getByText('Application submission upload').closest('tr')
    expect(submissionUploadRow).not.toBeNull()

    await userEvent.click(
      within(submissionUploadRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenLastCalledWith('/provincial/application/upload')
  })

  it('disables tool actions when permissions are denied', () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\readonly',
        roles: ['READ_ONLY'],
        welcomeTarget: 'readOnly',
        legacyPath: null,
        grantedActions: [],
      },
      canPerform: () => false,
      refresh: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderPage()

    const uploadRow = screen.getByText('Application upload').closest('tr')
    expect(uploadRow).not.toBeNull()
    expect(
      within(uploadRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    ).toBeDisabled()

    const adminRow = screen.getByText('LEXIS administration').closest('tr')
    expect(adminRow).not.toBeNull()
    expect(within(adminRow as HTMLTableRowElement).getByText('Denied')).toBeInTheDocument()
  })
})
