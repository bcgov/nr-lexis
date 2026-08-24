import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthProvider'
import { useAuth } from '@/context/auth/useAuth'
import { fetchSessionCapabilities } from '@/service/session-service'
import {
  clearActiveForestClientNumber,
  getActiveForestClientNumber,
} from '@/service/forest-client-selection'

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
}))

const mockedFetchSessionCapabilities = vi.mocked(fetchSessionCapabilities)

type SessionCapabilitiesWithoutClient = Omit<
  Awaited<ReturnType<typeof fetchSessionCapabilities>>,
  'availableForestClientNumbers' | 'forestClientNumber' | 'forestClientSelectionRequired'
> & {
  availableForestClientNumbers?: string[]
  forestClientNumber?: string | null
  forestClientSelectionRequired?: boolean
}

const mockSessionCapabilities = (capabilities: SessionCapabilitiesWithoutClient): void => {
  mockedFetchSessionCapabilities.mockResolvedValue({
    availableForestClientNumbers: [],
    forestClientNumber: null,
    forestClientSelectionRequired: false,
    ...capabilities,
  })
}

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
    selectForestClient,
  } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="is-logged-in">{String(isLoggedIn)}</div>
      <div data-testid="has-any-role">{String(hasAnyRole)}</div>
      <div data-testid="roles">{capabilities.roles.join(',')}</div>
      <div data-testid="forest-client">{capabilities.forestClientNumber ?? ''}</div>
      <div data-testid="available-forest-clients">
        {capabilities.availableForestClientNumbers.join(',')}
      </div>
      <div data-testid="forest-client-selection-required">
        {String(capabilities.forestClientSelectionRequired)}
      </div>
      <div data-testid="default-route">{defaultRoute}</div>
      {actionChecks.map((action) => (
        <div key={action} data-testid={`action-${action}`}>
          {String(canPerform(action))}
        </div>
      ))}
      <button type="button" onClick={() => void refresh()}>
        Refresh Session
      </button>
      <button type="button" onClick={() => void selectForestClient('00067890')}>
        Select Forest Client
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
    clearActiveForestClientNumber()
  })

  it('normalizes the scoped submitter role without normalizing unknown roles', async () => {
    mockSessionCapabilities({
      authenticated: true,
      principal: 'bceid\\tester',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER_00012345', 'LEXIS_UNKNOWN_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/summary'],
      forestClientNumber: '00012345',
    })

    renderProbe(['/summary'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent(
      'PROVINCIAL_SUBMITTER_00012345,LEXIS_UNKNOWN_SUBMITTER',
    )
    expect(screen.getByTestId('forest-client')).toHaveTextContent('00012345')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/summary')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('true')
  })

  it('activates one of multiple assigned forest clients for the session', async () => {
    mockedFetchSessionCapabilities
      .mockResolvedValueOnce({
        authenticated: true,
        principal: 'bceid\\submitter',
        roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
        welcomeTarget: 'provincialSubmitter',
        legacyPath: '/provincial/summary',
        grantedActions: ['/summary', '/applicationSearch'],
        forestClientNumber: null,
        availableForestClientNumbers: ['00012345', '00067890'],
        forestClientSelectionRequired: true,
      })
      .mockResolvedValueOnce({
        authenticated: true,
        principal: 'bceid\\submitter',
        roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
        welcomeTarget: 'provincialSubmitter',
        legacyPath: '/provincial/summary',
        grantedActions: ['/summary', '/applicationSearch'],
        forestClientNumber: '00067890',
        availableForestClientNumbers: ['00012345', '00067890'],
        forestClientSelectionRequired: false,
      })

    renderProbe()
    await waitForAuthLoad()

    expect(screen.getByTestId('available-forest-clients')).toHaveTextContent('00012345,00067890')
    expect(screen.getByTestId('forest-client-selection-required')).toHaveTextContent('true')

    await userEvent.click(screen.getByRole('button', { name: 'Select Forest Client' }))

    await waitFor(() => {
      expect(screen.getByTestId('forest-client')).toHaveTextContent('00067890')
    })
    expect(screen.getByTestId('forest-client-selection-required')).toHaveTextContent('false')
    expect(getActiveForestClientNumber()).toBe('00067890')
    expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(2)
  })

  it('does not route modern submitter roles to summary without a summary grant', async () => {
    mockSessionCapabilities({
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
    mockSessionCapabilities({
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
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')
    expect(screen.getByTestId('has-any-role')).toHaveTextContent('false')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('false')
  })

  it('maps legacy admin alias to canonical admin role and review route', async () => {
    mockSessionCapabilities({
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
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/fileApplicationUpload')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('true')
  })

  it('limits admin default route and actions when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockSessionCapabilities({
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
    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin/rtm/emslogamv/upload')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('false')
  })

  it('preserves normal read-only routing and actions when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockSessionCapabilities({
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
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/application')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('true')
  })

  it('keeps other non-admin roles unauthorized when PROD RTM-only mode is enabled', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockSessionCapabilities({
      authenticated: true,
      principal: 'idir\\approver',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationSearch'],
    })

    renderProbe(['/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('keeps admin review routing and actions when read-only is also present', async () => {
    mockSessionCapabilities({
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
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('true')
  })

  it('keeps RTM-only admin precedence when read-only is also present during rollout', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockSessionCapabilities({
      authenticated: true,
      principal: 'idir\\admin',
      roles: ['LEXIS_ADMIN', 'LEXIS_READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/lexisAgentAdmin', '/applicationSearch'],
    })

    renderProbe(['/lexisAgentAdmin', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin/rtm/emslogamv')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('does not use legacyPath for default route routing anymore', async () => {
    mockSessionCapabilities({
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
    mockSessionCapabilities({
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

  it('honours server-granted report actions for read-only users', async () => {
    mockSessionCapabilities({
      authenticated: true,
      principal: 'idir\\readonly',
      roles: ['LEXIS_READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [
        '/applicationSearch',
        '/applicationReport',
        '/permitReport',
        '/approvedExemptionReport',
        'mofrListing',
      ],
    })

    renderProbe([
      '/applicationSearch',
      '/applicationReport',
      '/permitReport',
      '/approvedExemptionReport',
      '/feeReport',
      'mofrListing',
    ])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/application')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/permitReport')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/approvedExemptionReport')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/feeReport')).toHaveTextContent('false')
    expect(screen.getByTestId('action-mofrListing')).toHaveTextContent('true')
  })

  it('ignores FAM delegated administration when resolving LEXIS access', async () => {
    mockSessionCapabilities({
      authenticated: true,
      principal: 'bceid\\delegated',
      roles: ['LEXIS_DELEGATED_ADMIN'],
      welcomeTarget: 'noAccess',
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/applicationsReview'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toBeEmptyDOMElement()
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')
    expect(screen.getByTestId('has-any-role')).toHaveTextContent('false')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('false')
  })

  it('uses backend granted actions for canPerform and roleless default route selection', async () => {
    mockSessionCapabilities({
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

  it('keeps roleless reviewers on the review queue when both actions are granted', async () => {
    mockSessionCapabilities({
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

  it('routes provincial submitters with summary access to their client summary', async () => {
    mockSessionCapabilities({
      authenticated: true,
      principal: 'bceid\\submitter',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [
        '/summary',
        '/applicationSearch',
        '/applicationDetails',
        'createApplication',
        'uploadApplicationSubmission',
      ],
    })

    renderProbe([
      '/summary',
      'uploadApplicationSubmission',
      'createApplication',
      '/applicationSearch',
    ])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/summary')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('true')
    expect(screen.getByTestId('action-uploadApplicationSubmission')).toHaveTextContent('true')
    expect(screen.getByTestId('action-createApplication')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('true')
  })

  it('routes application-submission-only users to the upload flow', async () => {
    mockSessionCapabilities({
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

  it('routes report-only users to their first available report', async () => {
    mockSessionCapabilities({
      authenticated: true,
      principal: 'bceid\\reporter',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['mofrListing'],
    })

    renderProbe(['mofrListing', '/applicationReport', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/reports/biweeklyListing')
    expect(screen.getByTestId('action-mofrListing')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationReport')).toHaveTextContent('false')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('does not route unknown roles to federal search', async () => {
    mockSessionCapabilities({
      authenticated: true,
      principal: 'bceid\\federal',
      roles: ['LEXIS_UNKNOWN_ROLE'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe([
      '/federalApplicationSearch',
      '/applicationSearch',
      'uploadApplicationSubmission',
      'createApplication',
    ])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('LEXIS_UNKNOWN_ROLE')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/unauthorized')
    expect(screen.getByTestId('action-/federalApplicationSearch')).toHaveTextContent('false')
    expect(screen.getByTestId('action-uploadApplicationSubmission')).toHaveTextContent('false')
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
        forestClientNumber: null,
        availableForestClientNumbers: [],
        forestClientSelectionRequired: false,
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
        forestClientNumber: null,
        availableForestClientNumbers: [],
        forestClientSelectionRequired: false,
      })
    })

    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(screen.getByTestId('roles')).toHaveTextContent('')
    expect(mockedFetchSessionCapabilities).toHaveBeenCalledTimes(1)
  })

  it('sets login state from authenticated flag only', async () => {
    mockSessionCapabilities({
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
