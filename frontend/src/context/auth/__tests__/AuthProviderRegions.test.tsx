import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthProvider'
import { useAuth } from '@/context/auth/useAuth'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import { fetchSessionCapabilities } from '@/service/session-service'

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
}))

const REGION_OPTIONS = [
  { id: '1903', text: 'Cariboo' },
  { id: '1908', text: 'Skeena' },
]

function RegionProbe() {
  const { canPerform, isLoading } = useAuth()
  const writeRegions = useAllowedRegionOptions(REGION_OPTIONS, 'createApplication', 'id')
  const readRegions = useAllowedRegionOptions(REGION_OPTIONS, '/applicationSearch', 'id')
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="write-cariboo">{String(canPerform('createApplication', 1903))}</div>
      <div data-testid="write-skeena">{String(canPerform('createApplication', '1908'))}</div>
      <div data-testid="write-no-region">{String(canPerform('createApplication', null))}</div>
      <div data-testid="write-undefined-region">
        {String(canPerform('createApplication', undefined))}
      </div>
      <div data-testid="write-route">{String(canPerform('createApplication'))}</div>
      <div data-testid="read-skeena">{String(canPerform('/applicationSearch', 1908))}</div>
      <div data-testid="write-options">{writeRegions.map((option) => option.id).join(',')}</div>
      <div data-testid="read-options">{readRegions.map((option) => option.id).join(',')}</div>
    </div>
  )
}

const renderWith = async (actionRegions: Record<string, number[]> | undefined) => {
  vi.mocked(fetchSessionCapabilities).mockResolvedValue({
    authenticated: true,
    principal: 'IDIR\\staff',
    roles: ['LEXIS_READ_ONLY', 'LEXIS_APPLICATION_APPROVER'],
    welcomeTarget: 'applicationApprover',
    legacyPath: '/provincial/review',
    grantedActions: ['/applicationSearch', 'createApplication'],
    forestClientNumber: null,
    availableForestClientNumbers: [],
    forestClientSelectionRequired: false,
    ...(actionRegions
      ? { actionRegions: actionRegions as unknown as Record<string, string[]> }
      : {}),
  })
  render(
    <AuthProvider>
      <RegionProbe />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
}

describe('AuthProvider regional access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
  })

  it('limits writes and write region choices to the granted regions only', async () => {
    // Province-wide Read Only plus Cariboo Application Approver.
    await renderWith({ createApplication: [1903] })

    expect(screen.getByTestId('write-cariboo')).toHaveTextContent('true')
    expect(screen.getByTestId('write-skeena')).toHaveTextContent('false')
    expect(screen.getByTestId('write-no-region')).toHaveTextContent('false')
    // An explicit but missing record region still applies the region check.
    expect(screen.getByTestId('write-undefined-region')).toHaveTextContent('false')
    expect(screen.getByTestId('write-route')).toHaveTextContent('true')
    expect(screen.getByTestId('read-skeena')).toHaveTextContent('true')
    expect(screen.getByTestId('write-options')).toHaveTextContent('1903')
    expect(screen.getByTestId('read-options')).toHaveTextContent('1903,1908')
  })

  it('leaves province-wide users unrestricted', async () => {
    await renderWith(undefined)

    expect(screen.getByTestId('write-skeena')).toHaveTextContent('true')
    expect(screen.getByTestId('write-no-region')).toHaveTextContent('true')
    expect(screen.getByTestId('write-options')).toHaveTextContent('1903,1908')
  })
})
