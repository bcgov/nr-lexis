import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ThemeProvider from '@/context/theme/ThemeProvider'
import { getProtectedRoutes } from '@/routes/routePaths'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/Reports', () => ({
  default: () => <h1>Reports</h1>,
}))

vi.mock('@/pages/RTMEmsLogAmv', () => ({
  default: () => <h1>Average Monthly Values</h1>,
}))

vi.mock('@/pages/Federal', () => ({
  default: () => <h1>Federal application search</h1>,
}))

vi.mock('@/pages/ProvincialSummary', () => ({
  default: () => <h1>Summary</h1>,
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderWithPath = (path: string) => {
  const router = createMemoryRouter(getProtectedRoutes(), {
    initialEntries: [path],
  })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

const findLazyPageHeading = (name: string) =>
  screen.findByRole('heading', { name }, { timeout: 5000 })

describe('Protected route guard access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
  })

  it('redirects to unauthorized when required action is missing', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\readonly',
          roles: ['READ_ONLY'],
          welcomeTarget: 'readOnly',
        }),
        defaultRoute: '/provincial/application',
        canPerform: () => false,
      }),
    )

    renderWithPath('/admin/uploads')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('forbidden-page')).toHaveClass('landing-grid-container')
    expect(screen.getByRole('img', { name: 'Government of British Columbia' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Go to my landing page' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  it('rejects generic data upload when only a supporting-document action is granted', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\uploader',
          grantedActions: ['/fileApplicationUpload'],
        }),
        canPerform: (action: string) => action === '/fileApplicationUpload',
      }),
    )

    renderWithPath('/admin/uploads?type=application')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
  })

  it('allows generic data upload when the admin upload action is granted', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\admin',
          grantedActions: ['/lexisAgentAdmin'],
        }),
        canPerform: (action: string) => action === '/lexisAgentAdmin',
      }),
    )

    renderWithPath('/admin/uploads?type=application')

    expect(await findLazyPageHeading('Data Upload')).toBeInTheDocument()
  })

  it('does not allow generic data upload route for create application only users', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          welcomeTarget: '/provincial/application/upload',
          grantedActions: ['createApplication'],
        }),
        defaultRoute: '/provincial/application/upload',
        canPerform: (action: string) => action === 'createApplication',
      }),
    )

    renderWithPath('/admin/uploads?type=lexisXml')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
  })

  it('allows application submission upload route when submission upload is granted', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          welcomeTarget: '/provincial/application/upload',
          grantedActions: ['uploadApplicationSubmission'],
        }),
        defaultRoute: '/provincial/application/upload',
        canPerform: (action: string) => action === 'uploadApplicationSubmission',
      }),
    )

    renderWithPath('/provincial/application/upload')

    expect(await findLazyPageHeading('Upload Application Submission')).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('allows scoped provincial submitters to open the provincial application submission route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\scoped-submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00012345'],
          welcomeTarget: '/provincial/application/upload',
          grantedActions: ['uploadApplicationSubmission'],
        }),
        defaultRoute: '/provincial/application/upload',
        canPerform: (action: string) => action === 'uploadApplicationSubmission',
      }),
    )

    renderWithPath('/provincial/application/upload')

    expect(await findLazyPageHeading('Upload Application Submission')).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('allows provincial submitters to open the client summary', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00012345'],
          grantedActions: ['/summary'],
          forestClientNumber: '00012345',
        }),
        defaultRoute: '/provincial/summary',
        canPerform: (action: string) => action === '/summary',
      }),
    )

    renderWithPath('/provincial/summary')

    expect(await findLazyPageHeading('Summary')).toBeInTheDocument()
  })

  it('blocks IDIR administrators from the client summary', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\admin',
          roles: ['ADMIN'],
          grantedActions: ['/summary'],
        }),
        canPerform: () => true,
      }),
    )

    renderWithPath('/provincial/summary')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
  })

  it('keeps the client summary blocked when an administrator also has a submitter role', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\admin',
          roles: ['ADMIN', 'PROVINCIAL_SUBMITTER_00012345'],
          grantedActions: ['/summary'],
          forestClientNumber: '00012345',
        }),
        canPerform: () => true,
      }),
    )

    renderWithPath('/provincial/summary')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
  })

  it('blocks unknown roles from the provincial application submission upload route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\federal',
          roles: ['LEXIS_UNKNOWN_ROLE'],
          welcomeTarget: null,
          grantedActions: [],
        }),
        defaultRoute: '/unauthorized',
        canPerform: () => false,
      }),
    )

    renderWithPath('/provincial/application/upload')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
  })

  it('allows BCEID advertising-list-only users to open the reports route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          welcomeTarget: '/reports',
          grantedActions: ['mofrListing'],
        }),
        defaultRoute: '/reports',
        canPerform: (action: string) => action === 'mofrListing',
      }),
    )

    renderWithPath('/reports/biweeklyListing')

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
  })

  it('allows admin users to open the application submission upload route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: () => true,
      }),
    )

    renderWithPath('/provincial/application/upload')

    expect(await findLazyPageHeading('Upload Application Submission')).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('blocks non-RTM protected routes when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === '/lexisAgentAdmin',
      }),
    )

    renderWithPath('/admin/policies/fee')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeInTheDocument()
  })

  it('allows the RTM protected route when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === '/lexisAgentAdmin',
      }),
    )

    renderWithPath('/admin/rtm/emslogamv')

    expect(
      await screen.findByRole('heading', { name: 'Average Monthly Values' }),
    ).toBeInTheDocument()
  })
})
