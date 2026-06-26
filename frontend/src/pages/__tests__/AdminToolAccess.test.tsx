import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminPage from '@/pages/Admin'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

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
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          grantedActions: [
            '/lexisAgentAdmin',
            '/fileApplicationUpload',
            '/lexisPolicyAdmin',
            'createApplication',
            'uploadApplicationSubmission',
          ],
        }),
        canPerform: (action: string) =>
          [
            '/lexisAgentAdmin',
            '/fileApplicationUpload',
            '/lexisPolicyAdmin',
            'createApplication',
            'uploadApplicationSubmission',
          ].includes(action),
      }),
    )
  })

  it('opens policy and upload workflows when required actions are granted', async () => {
    renderPage()

    const policyRow = screen.getByText('Fee policy administration').closest('tr')
    expect(policyRow).not.toBeNull()

    await userEvent.click(
      within(policyRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/admin/policies/fee')

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

  it('opens split policy, schedule, and average monthly value administration areas', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          grantedActions: ['/lexisAgentAdmin', '/lexisPolicyAdmin', '/lexisFILAdmin'],
        }),
        canPerform: (action: string) =>
          ['/lexisAgentAdmin', '/lexisPolicyAdmin', '/lexisFILAdmin'].includes(action),
      }),
    )

    renderPage()

    const feePolicyRow = screen.getByText('Fee policy administration').closest('tr')
    const filPolicyRow = screen.getByText('Fee in lieu percent administration').closest('tr')
    const scheduleRow = screen.getByText('Export schedule administration').closest('tr')
    const averageMonthlyValuesRow = screen.getByText('Average Monthly Values').closest('tr')

    expect(feePolicyRow).not.toBeNull()
    expect(filPolicyRow).not.toBeNull()
    expect(scheduleRow).not.toBeNull()
    expect(averageMonthlyValuesRow).not.toBeNull()

    await userEvent.click(
      within(feePolicyRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/policies/fee')

    await userEvent.click(
      within(filPolicyRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/policies/fil')

    await userEvent.click(
      within(scheduleRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/schedules')

    await userEvent.click(
      within(averageMonthlyValuesRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/rtm/emslogamv')
  })

  it('disables tool actions when permissions are denied', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\readonly',
          roles: ['READ_ONLY'],
          welcomeTarget: 'readOnly',
          grantedActions: [],
        }),
        canPerform: () => false,
      }),
    )

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
