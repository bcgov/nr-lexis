import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminPoliciesPage from '@/pages/AdminPolicies'
import {
  deleteFeePolicy,
  deleteFilPolicy,
  fetchFeePolicies,
  fetchFilPolicies,
  upsertFeePolicy,
  upsertFilPolicy,
} from '@/service/admin-policy-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-policy-service', () => ({
  fetchFeePolicies: vi.fn(),
  fetchFilPolicies: vi.fn(),
  upsertFeePolicy: vi.fn(),
  upsertFilPolicy: vi.fn(),
  deleteFeePolicy: vi.fn(),
  deleteFilPolicy: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchFeePolicies = vi.mocked(fetchFeePolicies)
const mockedFetchFilPolicies = vi.mocked(fetchFilPolicies)
const mockedUpsertFeePolicy = vi.mocked(upsertFeePolicy)
const mockedUpsertFilPolicy = vi.mocked(upsertFilPolicy)
const mockedDeleteFeePolicy = vi.mocked(deleteFeePolicy)
const mockedDeleteFilPolicy = vi.mocked(deleteFilPolicy)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/admin/policies']}>
      <Routes>
        <Route path="/admin/policies" element={<AdminPoliciesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Admin policy action states', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/lexisPolicyAdmin' || action === '/lexisFILAdmin',
    } as any)

    mockedFetchFeePolicies.mockResolvedValue([
      {
        id: 'fee-1',
        effectiveDate: '2026-01-01',
        orgUnitCode: '12',
        orgUnitName: 'Coast',
        policyPercentage: '3.5',
        entryUserId: 'idir\\admin',
        entryTimestamp: '2026-01-01T00:00:00.000Z',
        updateUserId: 'idir\\admin',
        updateTimestamp: '2026-01-01T00:00:00.000Z',
      },
    ])

    mockedFetchFilPolicies.mockResolvedValue([
      {
        id: 'fil-1',
        effectiveDate: '2026-01-01',
        filPercentage: '2.0',
        entryUserId: 'idir\\admin',
        entryTimestamp: '2026-01-01T00:00:00.000Z',
        updateUserId: 'idir\\admin',
        updateTimestamp: '2026-01-01T00:00:00.000Z',
      },
    ])

    mockedUpsertFeePolicy.mockResolvedValue([])
    mockedUpsertFilPolicy.mockResolvedValue([])
    mockedDeleteFeePolicy.mockResolvedValue([])
    mockedDeleteFilPolicy.mockResolvedValue([])
  })

  it('submits fee policy add when required fields are valid', async () => {
    mockedUpsertFeePolicy.mockResolvedValue([
      {
        id: 'fee-2',
        effectiveDate: '2026-02-01',
        orgUnitCode: '11',
        orgUnitName: 'Cariboo',
        policyPercentage: '4.2',
        entryUserId: 'idir\\admin',
        entryTimestamp: '2026-02-01T00:00:00.000Z',
        updateUserId: 'idir\\admin',
        updateTimestamp: '2026-02-01T00:00:00.000Z',
      },
    ])

    renderPage()

    await screen.findByText('Fee Policy Administration')

    const policyDateInputs = screen.getAllByLabelText('Policy Effective Date')
    fireEvent.change(policyDateInputs[0], { target: { value: '2026-02-01' } })
    await userEvent.type(screen.getByLabelText('Region Code'), '11')
    await userEvent.type(screen.getByLabelText('Region Name'), 'Cariboo')
    await userEvent.type(screen.getByLabelText('Fee Increase Percentage'), '4.2')
    await userEvent.click(screen.getByRole('button', { name: 'Add Fee Policy' }))

    await waitFor(() => {
      expect(mockedUpsertFeePolicy).toHaveBeenCalledWith({
        id: null,
        effectiveDate: '2026-02-01',
        orgUnitCode: '11',
        orgUnitName: 'Cariboo',
        policyPercentage: '4.2',
      })
    })

    expect(screen.getByText('Policy Update')).toBeInTheDocument()
    expect(screen.getByText('Fee policy added.')).toBeInTheDocument()
  })

  it('loads fee and FIL policies sequentially', async () => {
    let resolveFeePolicies:
      | ((value: Awaited<ReturnType<typeof fetchFeePolicies>>) => void)
      | undefined
    mockedFetchFeePolicies.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFeePolicies = resolve
        }),
    )

    renderPage()

    await waitFor(() => {
      expect(mockedFetchFeePolicies).toHaveBeenCalledTimes(1)
    })
    expect(mockedFetchFilPolicies).not.toHaveBeenCalled()

    await act(async () => {
      resolveFeePolicies?.([])
    })

    await waitFor(() => {
      expect(mockedFetchFilPolicies).toHaveBeenCalledTimes(1)
    })
  })

  it('enforces permission and disables mutating actions when not granted', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage()

    await screen.findByText('Policy Center')

    expect(screen.getAllByText('Not Granted')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add Fee Policy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add FIL Policy' })).toBeDisabled()
  })

  it('shows validation contract when fee policy fields are incomplete', async () => {
    renderPage()

    await screen.findByText('Fee Policy Administration')
    await userEvent.click(screen.getByRole('button', { name: 'Add Fee Policy' }))

    await waitFor(() => {
      expect(screen.getByText('Policy Error')).toBeInTheDocument()
      expect(
        screen.getByText('Fee policy requires effective date, region code, and percentage.'),
      ).toBeInTheDocument()
    })
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()
  })
})
