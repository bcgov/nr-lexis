import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthProvider'
import { useAuth } from '@/context/auth/useAuth'
import { fetchSessionCapabilities } from '@/service/session-service'

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
}))

const mockedFetchSessionCapabilities = vi.mocked(fetchSessionCapabilities)

type ProbeProps = {
  actionChecks: string[]
}

function AuthProbe({ actionChecks }: ProbeProps) {
  const {
    capabilities,
    canPerform,
    defaultRoute,
    hasAnyRole,
    isLoading,
    isLoggedIn,
    logout,
    refresh,
  } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="is-logged-in">{String(isLoggedIn)}</div>
      <div data-testid="has-any-role">{String(hasAnyRole)}</div>
      <div data-testid="roles">{capabilities.roles.join(',')}</div>
      <div data-testid="default-route">{defaultRoute}</div>
      {actionChecks.map((action) => (
        <div key={action} data-testid={`action-${action}`}>
          {String(canPerform(action))}
        </div>
      ))}
      <button type="button" onClick={() => void refresh()}>
        Refresh Session
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  )
}

const renderProbe = (actionChecks: string[] = []) => {
  render(
    <AuthProvider>
      <AuthProbe actionChecks={actionChecks} />
    </AuthProvider>,
  )
}

const waitForAuthLoad = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
}

describe('Auth Provider Role Matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
  })

  it('normalizes modern submitter roles without routing to retired summary', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER_00012345', 'LEXIS_FEDERAL_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/summary'],
    })

    renderProbe(['/summary'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent(
      'PROVINCIAL_SUBMITTER_00012345,FEDERAL_SUBMITTER',
    )
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('true')
  })

  it('does not route modern submitter roles to summary without a summary grant', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'bceid\\submitter',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER_00012345'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/summary'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('PROVINCIAL_SUBMITTER_00012345')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('false')
  })

  it('does not route legacy submitter aliases as modern submitter roles', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['LEXIS_INDUSTRY_00012345', 'LOG_EXPORT_INDUSTRY_00067890'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/summary'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent(
      'LEXIS_INDUSTRY_00012345,LOG_EXPORT_INDUSTRY_00067890',
    )
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('false')
  })

  it('maps legacy admin alias to canonical admin role and admin route', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\admin',
      roles: ['LEXIS_ADMIN'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/lexisAgentAdmin', '/fileApplicationUpload', 'createApplication'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/fileApplicationUpload')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('true')
  })

  it('limits admin default route and actions when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\admin',
      roles: ['LEXIS_ADMIN'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/lexisAgentAdmin', '/applicationSearch', 'createApplication'],
    })

    renderProbe(['/lexisAgentAdmin', '/applicationSearch', 'createApplication'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin/rtm/emslogamv')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('false')
  })

  it('routes non-admin users to unauthorized when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\readonly',
      roles: ['LEXIS_READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationSearch'],
    })

    renderProbe(['/lexisAgentAdmin', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('READ_ONLY')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('keeps admin routing and actions when read-only is also present', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\admin',
      roles: ['LEXIS_ADMIN', 'LEXIS_READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationSearch'],
    })

    renderProbe(['/lexisAgentAdmin', '/applicationReport', 'createApplication'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN,READ_ONLY')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('true')
  })

  it('does not use legacyPath for default route routing anymore', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\approver',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      welcomeTarget: null,
      legacyPath: '/permitSearch.do?actionMapping=view',
      grantedActions: [],
    })

    renderProbe(['/applicationsReview', '/applicationReport', '/lexisAgentAdmin'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('false')
  })

  it('routes application approvers to review and honours report but not admin grants', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\approver',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationsReview', '/applicationReport'],
    })

    renderProbe(['/applicationsReview', '/applicationReport', '/lexisAgentAdmin'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('false')
  })

  it('blocks reports for read-only users even when report actions are granted', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\readonly',
      roles: ['LEXIS_READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationSearch', '/applicationReport', '/feeReport', 'mofrListing'],
    })

    renderProbe(['/applicationSearch', '/applicationReport', '/feeReport', 'mofrListing'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/application')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/feeReport')).toHaveTextContent('false')
    expect(screen.getByTestId('action-mofrListing')).toHaveTextContent('false')
  })

  it('routes delegated admin without LEXIS actions to unauthorized', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'bceid\\delegated',
      roles: ['LEXIS_DELEGATED_ADMIN'],
      welcomeTarget: 'noAccess',
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/applicationsReview'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('DELEGATED_ADMIN')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('false')
  })

  it('uses backend granted actions for canPerform and roleless default route selection', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\reviewer',
      roles: [],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationsReview'],
    })

    renderProbe(['/applicationsReview', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('prioritizes the review queue over retired summary when both actions are granted', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\reviewer',
      roles: [],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/summary', '/applicationsReview'],
    })

    renderProbe(['/summary', '/applicationsReview'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
  })

  it('routes provincial submitters with application access to application search before upload', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'bceid\\submitter',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [
        '/applicationSearch',
        '/applicationDetails',
        'createApplication',
        'uploadApplicationSubmission',
      ],
    })

    renderProbe(['uploadApplicationSubmission', 'createApplication', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/application')
    expect(screen.getByTestId('action-uploadApplicationSubmission')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('true')
  })

  it('routes application-submission-only users to the upload flow', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'bceid\\submitter',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['uploadApplicationSubmission'],
    })

    renderProbe(['uploadApplicationSubmission', 'createApplication', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/application/upload')
    expect(screen.getByTestId('action-uploadApplicationSubmission')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('routes federal submitters to application submission upload with federal search access', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'bceid\\federal',
      roles: ['LEXIS_FEDERAL_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [
        '/federalApplicationSearch',
        '/federalApplicationDetails',
        'uploadApplicationSubmission',
        'viewFederalApplication',
      ],
    })

    renderProbe([
      '/federalApplicationSearch',
      '/applicationSearch',
      'uploadApplicationSubmission',
      'createApplication',
    ])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('FEDERAL_SUBMITTER')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/federal/application/upload')
    expect(screen.getByTestId('action-/federalApplicationSearch')).toHaveTextContent('true')
    expect(screen.getByTestId('action-uploadApplicationSubmission')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('false')
  })

  it('coalesces concurrent session refresh requests', async () => {
    let resolveCapabilities:
      | ((value: Awaited<ReturnType<typeof fetchSessionCapabilities>>) => void)
      | undefined
    mockedFetchSessionCapabilities.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapabilities = resolve
        }),
    )

    renderProbe()

    await waitFor(() => {
      expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(1)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Session' }))
    expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCapabilities?.({
        authenticated: true,
        principal: 'idir\\reviewer',
        roles: [],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: ['/applicationsReview'],
      })
    })

    await waitForAuthLoad()
    expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(1)
  })

  it('ignores stale session refresh results after logout', async () => {
    let resolveCapabilities:
      | ((value: Awaited<ReturnType<typeof fetchSessionCapabilities>>) => void)
      | undefined
    mockedFetchSessionCapabilities.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapabilities = resolve
        }),
    )

    renderProbe()

    await waitFor(() => {
      expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(1)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    await waitForAuthLoad()
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')

    await act(async () => {
      resolveCapabilities?.({
        authenticated: true,
        principal: 'idir\\admin',
        roles: ['LEXIS_ADMIN'],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: ['/lexisAgentAdmin'],
      })
    })

    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(screen.getByTestId('roles')).toHaveTextContent('')
    expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(1)
  })

  it('sets login state from authenticated flag only', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: false,
      principal: null,
      roles: ['READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe()
    await waitForAuthLoad()

    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(screen.getByTestId('has-any-role')).toHaveTextContent('true')
  })
})
