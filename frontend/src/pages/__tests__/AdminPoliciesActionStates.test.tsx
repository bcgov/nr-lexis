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

    await screen.findByText('Fee policy administration')

    const policyDateInputs = screen.getAllByLabelText('Policy effective date')
    fireEvent.change(policyDateInputs[0], { target: { value: '2026-02-01' } })
    await userEvent.type(screen.getByLabelText('Region code'), '11')
    await userEvent.type(screen.getByLabelText('Region name'), 'Cariboo')
    await userEvent.type(screen.getByLabelText('Fee increase percentage'), '4.2')
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

    expect(screen.getByText('Policy update')).toBeInTheDocument()
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

    await screen.findByText('Policy center')

    expect(screen.getAllByText('Not Granted')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add Fee Policy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add fee in lieu policy' })).toBeDisabled()
  })

  it('shows validation contract when fee policy fields are incomplete', async () => {
    renderPage()

    await screen.findByText('Fee policy administration')
    await userEvent.click(screen.getByRole('button', { name: 'Add Fee Policy' }))

    await waitFor(() => {
      expect(screen.getByText('Policy error')).toBeInTheDocument()
      expect(
        screen.getByText('Fee policy requires effective date, region code, and percentage.'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Policy effective date is required.')).toBeInTheDocument()
    expect(screen.getByText('Region code is required.')).toBeInTheDocument()
    expect(screen.getByText('Fee increase percentage is required.')).toBeInTheDocument()
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()
  })

  it('blocks typed policy dates that are not valid ISO dates', async () => {
    renderPage()

    await screen.findByText('Fee policy administration')

    const policyDateInputs = screen.getAllByLabelText('Policy effective date')
    fireEvent.change(policyDateInputs[0], { target: { value: '2026-99-99' } })
    await userEvent.type(screen.getByLabelText('Region code'), '11')
    await userEvent.type(screen.getByLabelText('Fee increase percentage'), '4.2')
    await userEvent.click(screen.getByRole('button', { name: 'Add Fee Policy' }))

    expect(await screen.findByText('Date must be YYYY-MM-DD.')).toBeInTheDocument()
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()

    fireEvent.change(policyDateInputs[1], { target: { value: 'not-a-date' } })
    await userEvent.type(screen.getByLabelText('Fee in lieu percentage'), '2.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add fee in lieu policy' }))

    expect(await screen.findAllByText('Date must be YYYY-MM-DD.')).toHaveLength(2)
    expect(mockedUpsertFilPolicy).not.toHaveBeenCalled()
  })
})
