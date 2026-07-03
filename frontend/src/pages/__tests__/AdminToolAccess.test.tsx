import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminPage from '@/pages/Admin'
import { searchFamUserRoleAssignments } from '@/service/fam-user-access-service'
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

vi.mock('@/service/fam-user-access-service', () => ({
  searchFamUserRoleAssignments: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchFamUserRoleAssignments = vi.mocked(searchFamUserRoleAssignments)

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
    vi.unstubAllEnvs()
    window.config = {}
    mockedSearchFamUserRoleAssignments.mockResolvedValue({
      results: [],
      total: 0,
      pageNumber: 1,
      pageSize: 10,
      pageCount: 0,
      configured: true,
      message: null,
    })
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
    expect(screen.queryByText('FAM user access lookup')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage in FAM' })).not.toBeInTheDocument()
  })

  it('searches FAM user access and renders identity results', async () => {
    mockedSearchFamUserRoleAssignments.mockResolvedValue({
      results: [
        {
          assignmentId: null,
          userId: null,
          userName: 'JSMITH',
          userTypeCode: 'IDIR',
          userTypeDescription: 'IDIR',
          firstName: 'Jane',
          lastName: 'Smith',
          fullName: 'Jane Smith',
          email: 'jane.smith@gov.bc.ca',
          roleId: null,
          roleName: null,
          roleDisplayName: null,
          roleTypeCode: null,
          forestClientNumber: null,
          forestClientName: null,
          forestClientStatusCode: null,
          forestClientStatusDescription: null,
          scopeType: null,
          scopeValue: null,
          createDate: null,
          expiryDate: null,
        },
      ],
      total: 1,
      pageNumber: 1,
      pageSize: 10,
      pageCount: 1,
      configured: true,
      message: null,
    })

    renderPage()

    const manageLink = screen.getByRole('link', { name: 'Manage in FAM' })
    expect(manageLink).toHaveAttribute('href', 'https://fam-dev.nrs.gov.bc.ca')
    expect(manageLink).toHaveAttribute('target', '_blank')

    await userEvent.type(screen.getByLabelText('IDIR username'), 'smith')
    await userEvent.click(screen.getByRole('button', { name: 'Search FAM Access' }))

    expect(mockedSearchFamUserRoleAssignments).toHaveBeenCalledWith({
      search: 'smith',
      pageNumber: 1,
      pageSize: 10,
      sortBy: 'user_name',
      sortOrder: 'asc',
    })
    expect(await screen.findByText('JSMITH')).toBeInTheDocument()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('jane.smith@gov.bc.ca')).toBeInTheDocument()
  })

  it('keeps FAM access management read-only and delegates changes to FAM', () => {
    window.config = {
      VITE_FAM_MANAGE_URL: 'https://fam-tst.nrs.gov.bc.ca/applications/lexis',
    }

    renderPage()

    const manageLink = screen.getByRole('link', { name: 'Manage in FAM' })
    expect(manageLink).toHaveAttribute('href', 'https://fam-tst.nrs.gov.bc.ca/applications/lexis')
    expect(manageLink).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('button', { name: 'Search FAM Access' })).toBeVisible()

    for (const name of [
      /^Grant/i,
      /^Revoke/i,
      /^Add role/i,
      /^Remove role/i,
      /^Save access/i,
      /^Update access/i,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it('validates FAM user access searches before calling the backend', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('IDIR username'), 'ab')
    await userEvent.click(screen.getByRole('button', { name: 'Search FAM Access' }))

    expect(mockedSearchFamUserRoleAssignments).not.toHaveBeenCalled()
    expect(
      screen.getByText('Enter at least 3 characters to search FAM user access.'),
    ).toBeInTheDocument()
  })
})
