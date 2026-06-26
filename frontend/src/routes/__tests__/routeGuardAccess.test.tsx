import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { getProtectedRoutes } from '@/routes/routePaths'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/Reports', () => ({
  default: () => <h1>Reports</h1>,
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderWithPath = (path: string) => {
  const router = createMemoryRouter(getProtectedRoutes(), {
    initialEntries: [path],
  })
  render(<RouterProvider router={router} />)
}

describe('Protected route guard access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    expect(await screen.findByRole('heading', { name: 'Unauthorized' })).toBeInTheDocument()
  })

  it('allows upload page when one matching upload action is granted', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Data Upload' })).toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { name: 'Unauthorized' })).toBeInTheDocument()
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

    expect(
      await screen.findByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
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

    expect(
      await screen.findByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('allows federal submitters to open the federal application submission upload route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\federal',
          roles: ['FEDERAL_SUBMITTER'],
          welcomeTarget: '/federal/application/upload',
          grantedActions: ['uploadApplicationSubmission', '/federalApplicationSearch'],
        }),
        defaultRoute: '/federal/application/upload',
        canPerform: (action: string) =>
          ['uploadApplicationSubmission', '/federalApplicationSearch'].includes(action),
      }),
    )

    renderWithPath('/federal/application/upload')

    expect(
      await screen.findByRole('heading', { name: 'Upload Federal Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('blocks federal-only users from the provincial application submission upload route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\federal',
          roles: ['FEDERAL_SUBMITTER'],
          welcomeTarget: '/federal/application/upload',
          grantedActions: ['uploadApplicationSubmission', '/federalApplicationSearch'],
        }),
        defaultRoute: '/federal/application/upload',
        canPerform: (action: string) =>
          ['uploadApplicationSubmission', '/federalApplicationSearch'].includes(action),
      }),
    )

    renderWithPath('/provincial/application/upload')

    expect(await screen.findByRole('heading', { name: 'Unauthorized' })).toBeInTheDocument()
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

    renderWithPath('/reports?report=biweeklyListing')

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
  })

  it('allows admin users to open the application submission upload route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: () => true,
      }),
    )

    renderWithPath('/provincial/application/upload')

    expect(
      await screen.findByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('allows admin users to open the federal application submission upload route', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: () => true,
      }),
    )

    renderWithPath('/federal/application/upload')

    expect(
      await screen.findByRole('heading', { name: 'Upload Federal Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })
})
