import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { getProtectedRoutes } from '@/routes/routePaths'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
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
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\readonly',
        roles: ['READ_ONLY'],
        welcomeTarget: '/dashboard',
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/provincial/application',
      canPerform: () => false,
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderWithPath('/admin/uploads')

    expect(await screen.findByRole('heading', { name: 'Unauthorized' })).toBeInTheDocument()
  })

  it('allows upload page when one matching upload action is granted', async () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\uploader',
        roles: ['ADMIN'],
        welcomeTarget: '/admin',
        legacyPath: null,
        grantedActions: ['/fileApplicationUpload'],
      },
      defaultRoute: '/admin',
      canPerform: (action: string) => action === '/fileApplicationUpload',
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderWithPath('/admin/uploads?type=application')

    expect(await screen.findByRole('heading', { name: 'Data Upload' })).toBeInTheDocument()
  })

  it('does not allow generic data upload route for create application only users', async () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'bceid\\submitter',
        roles: ['PROVINCIAL_SUBMITTER'],
        welcomeTarget: '/provincial/application/upload',
        legacyPath: null,
        grantedActions: ['createApplication'],
      },
      defaultRoute: '/provincial/application/upload',
      canPerform: (action: string) => action === 'createApplication',
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderWithPath('/admin/uploads?type=lexisXml')

    expect(await screen.findByRole('heading', { name: 'Unauthorized' })).toBeInTheDocument()
  })

  it('allows application submission upload route when create application is granted', async () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'bceid\\submitter',
        roles: ['PROVINCIAL_SUBMITTER'],
        welcomeTarget: '/provincial/application/upload',
        legacyPath: null,
        grantedActions: ['createApplication'],
      },
      defaultRoute: '/provincial/application/upload',
      canPerform: (action: string) => action === 'createApplication',
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderWithPath('/provincial/application/upload')

    expect(
      await screen.findByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })

  it('allows admin users to open the application submission upload route', async () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\admin',
        roles: ['ADMIN'],
        welcomeTarget: '/admin',
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/admin',
      canPerform: () => true,
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderWithPath('/provincial/application/upload')

    expect(
      await screen.findByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
  })
})
