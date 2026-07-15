import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminPoliciesPage from '@/pages/AdminPolicies'
import type { AdminPolicyArea } from '@/pages/AdminPolicies'
import {
  createExportSchedule,
  deleteExportSchedule,
  fetchExportSchedulePage,
  updateExportSchedule,
} from '@/service/admin-schedule-service'
import {
  deleteFeePolicy,
  deleteFilPolicy,
  fetchFeePolicyPage,
  fetchFilPolicyPage,
  upsertFeePolicy,
  upsertFilPolicy,
} from '@/service/admin-policy-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-policy-service', () => ({
  fetchFeePolicyPage: vi.fn(),
  fetchFilPolicyPage: vi.fn(),
  upsertFeePolicy: vi.fn(),
  upsertFilPolicy: vi.fn(),
  deleteFeePolicy: vi.fn(),
  deleteFilPolicy: vi.fn(),
}))

vi.mock('@/service/admin-schedule-service', () => ({
  fetchExportSchedulePage: vi.fn(),
  createExportSchedule: vi.fn(),
  updateExportSchedule: vi.fn(),
  deleteExportSchedule: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchExportSchedulePage = vi.mocked(fetchExportSchedulePage)
const mockedCreateExportSchedule = vi.mocked(createExportSchedule)
const mockedUpdateExportSchedule = vi.mocked(updateExportSchedule)
const mockedDeleteExportSchedule = vi.mocked(deleteExportSchedule)
const mockedFetchFeePolicyPage = vi.mocked(fetchFeePolicyPage)
const mockedFetchFilPolicyPage = vi.mocked(fetchFilPolicyPage)
const mockedUpsertFeePolicy = vi.mocked(upsertFeePolicy)
const mockedUpsertFilPolicy = vi.mocked(upsertFilPolicy)
const mockedDeleteFeePolicy = vi.mocked(deleteFeePolicy)
const mockedDeleteFilPolicy = vi.mocked(deleteFilPolicy)

const renderPage = (area: 'fee' | 'fil' | 'schedule' = 'fee') => {
  const path =
    area === 'fee'
      ? '/admin/policies/fee'
      : area === 'fil'
        ? '/admin/policies/fil'
        : '/admin/schedules'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<AdminPoliciesPage area={area} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Admin policy action states', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === '/lexisPolicyAdmin' || action === '/lexisFILAdmin',
      }),
    )

    mockedFetchFeePolicyPage.mockResolvedValue({
      rows: [
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
      ],
      total: 1,
      page: 0,
      size: 100,
    })

    mockedFetchFilPolicyPage.mockResolvedValue({
      rows: [
        {
          id: 'fil-1',
          effectiveDate: '2026-01-01',
          filPercentage: '2.0',
          entryUserId: 'idir\\admin',
          entryTimestamp: '2026-01-01T00:00:00.000Z',
          updateUserId: 'idir\\admin',
          updateTimestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 0,
      size: 100,
    })
    mockedFetchExportSchedulePage.mockResolvedValue({
      rows: [
        {
          exportScheduleId: '1001',
          advertisingDate: '2026-07-01',
          applicationReceiptDate: '2026-06-25',
          offerReceiptDate: '2026-07-08',
          offerEndDate: '2026-07-09',
          offerWithdrawalDate: '2026-07-10',
          teacMeetingDate: '2026-07-15',
          applicationCount: 0,
          mutable: true,
        },
      ],
      total: 1,
      page: 0,
      size: 100,
    })

    mockedUpsertFeePolicy.mockResolvedValue([])
    mockedUpsertFilPolicy.mockResolvedValue([])
    mockedDeleteFeePolicy.mockResolvedValue([])
    mockedDeleteFilPolicy.mockResolvedValue([])
    mockedCreateExportSchedule.mockResolvedValue({
      success: true,
      message: 'Export schedule added.',
      schedule: {
        exportScheduleId: '1002',
        advertisingDate: '2026-07-15',
        applicationReceiptDate: '2026-07-08',
        offerReceiptDate: '2026-07-22',
        offerEndDate: '2026-07-23',
        offerWithdrawalDate: '2026-07-24',
        teacMeetingDate: '2026-07-29',
        applicationCount: 0,
        mutable: true,
      },
    })
    mockedUpdateExportSchedule.mockResolvedValue({
      success: true,
      message: 'Export schedule updated.',
      schedule: {
        exportScheduleId: '1001',
        advertisingDate: '2026-07-01',
        applicationReceiptDate: '2026-06-26',
        offerReceiptDate: '2026-07-08',
        offerEndDate: '2026-07-09',
        offerWithdrawalDate: '2026-07-10',
        teacMeetingDate: '2026-07-15',
        applicationCount: 0,
        mutable: true,
      },
    })
    mockedDeleteExportSchedule.mockResolvedValue({
      success: true,
      message: 'Export schedule deleted.',
      schedule: null,
    })
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

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })

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

  it.each<{
    area: AdminPolicyArea
    heading: string
    absentHeadings: string[]
    fetchPage: typeof mockedFetchFeePolicyPage
    untouchedFetches: Array<typeof mockedFetchFeePolicyPage>
  }>([
    {
      area: 'fee',
      heading: 'Fee policy administration',
      absentHeadings: [
        'Fee in lieu percent policy administration',
        'Export schedule administration',
      ],
      fetchPage: mockedFetchFeePolicyPage,
      untouchedFetches: [mockedFetchFilPolicyPage, mockedFetchExportSchedulePage],
    },
    {
      area: 'fil',
      heading: 'Fee in lieu percent policy administration',
      absentHeadings: ['Fee policy administration', 'Export schedule administration'],
      fetchPage: mockedFetchFilPolicyPage,
      untouchedFetches: [mockedFetchFeePolicyPage, mockedFetchExportSchedulePage],
    },
    {
      area: 'schedule',
      heading: 'Export schedule administration',
      absentHeadings: ['Fee policy administration', 'Fee in lieu percent policy administration'],
      fetchPage: mockedFetchExportSchedulePage,
      untouchedFetches: [mockedFetchFeePolicyPage, mockedFetchFilPolicyPage],
    },
  ])(
    'loads only the selected $area admin area',
    async ({ area, heading, absentHeadings, fetchPage, untouchedFetches }) => {
      renderPage(area)

      await screen.findByRole('heading', { level: 1, name: heading })
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
      for (const absentHeading of absentHeadings) {
        expect(
          screen.queryByRole('heading', { level: 2, name: absentHeading }),
        ).not.toBeInTheDocument()
      }

      expect(fetchPage).toHaveBeenCalledWith(0, 100)
      for (const untouchedFetch of untouchedFetches) {
        expect(untouchedFetch).not.toHaveBeenCalled()
      }
    },
  )

  it.each<AdminPolicyArea>(['fee', 'fil', 'schedule'])(
    'uses backend pagination for %s admin area',
    async (area) => {
      const heading =
        area === 'fee'
          ? 'Fee policy administration'
          : area === 'fil'
            ? 'Fee in lieu percent policy administration'
            : 'Export schedule administration'
      const fetchPage =
        area === 'fee'
          ? mockedFetchFeePolicyPage
          : area === 'fil'
            ? mockedFetchFilPolicyPage
            : mockedFetchExportSchedulePage

      if (area === 'fee') {
        mockedFetchFeePolicyPage.mockImplementation(async (page, size) => ({
          rows: [
            {
              id: `fee-${page}-${size}`,
              effectiveDate: '2026-01-01',
              orgUnitCode: '12',
              orgUnitName: 'Coast',
              policyPercentage: '3.5',
              entryUserId: 'idir\\admin',
              entryTimestamp: '2026-01-01T00:00:00.000Z',
              updateUserId: 'idir\\admin',
              updateTimestamp: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 220,
          page,
          size,
        }))
      } else if (area === 'fil') {
        mockedFetchFilPolicyPage.mockImplementation(async (page, size) => ({
          rows: [
            {
              id: `fil-${page}-${size}`,
              effectiveDate: '2026-01-01',
              filPercentage: '2.0',
              entryUserId: 'idir\\admin',
              entryTimestamp: '2026-01-01T00:00:00.000Z',
              updateUserId: 'idir\\admin',
              updateTimestamp: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 220,
          page,
          size,
        }))
      } else {
        mockedFetchExportSchedulePage.mockImplementation(async (page, size) => ({
          rows: [
            {
              exportScheduleId: `schedule-${page}-${size}`,
              advertisingDate: '2026-07-01',
              applicationReceiptDate: '2026-06-25',
              offerReceiptDate: '2026-07-08',
              offerEndDate: '2026-07-09',
              offerWithdrawalDate: '2026-07-10',
              teacMeetingDate: '2026-07-15',
              applicationCount: 0,
              mutable: true,
            },
          ],
          total: 220,
          page,
          size,
        }))
      }

      renderPage(area)

      await screen.findByRole('heading', { level: 1, name: heading })

      expect(fetchPage).toHaveBeenLastCalledWith(0, 100)
      expect(screen.getByText('220')).toBeInTheDocument()

      const rowsPerPage = screen.getByLabelText('Rows per page')
      expect(rowsPerPage).toHaveValue('100')
      expect(
        within(rowsPerPage)
          .getAllByRole('option')
          .map((option) => (option as HTMLOptionElement).value),
      ).toEqual(['20', '50', '100', '200'])

      fireEvent.change(rowsPerPage, { target: { value: '20' } })

      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(0, 20)
      })

      await userEvent.click(screen.getByLabelText('Next page'))

      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(1, 20)
      })
    },
  )

  it('enforces permission and disables mutating actions when not granted', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })

    expect(screen.getByRole('button', { name: 'Add Fee Policy' })).toBeDisabled()
  })

  it('submits export schedule rows when all schedule dates are valid', async () => {
    mockedFetchExportSchedulePage
      .mockResolvedValueOnce({ rows: [], total: 0, page: 0, size: 100 })
      .mockResolvedValueOnce({
        rows: [
          {
            exportScheduleId: '1002',
            advertisingDate: '2026-07-15',
            applicationReceiptDate: '2026-07-08',
            offerReceiptDate: '2026-07-22',
            offerEndDate: '2026-07-23',
            offerWithdrawalDate: '2026-07-24',
            teacMeetingDate: '2026-07-29',
            applicationCount: 0,
            mutable: true,
          },
        ],
        total: 1,
        page: 0,
        size: 100,
      })

    renderPage('schedule')

    await screen.findByRole('heading', { level: 1, name: 'Export schedule administration' })

    fireEvent.change(screen.getByLabelText('Advertising date'), {
      target: { value: '2026-07-15' },
    })
    fireEvent.change(screen.getByLabelText('Application receipt date'), {
      target: { value: '2026-07-08' },
    })
    fireEvent.change(screen.getByLabelText('Offer receipt date'), {
      target: { value: '2026-07-22' },
    })
    fireEvent.change(screen.getByLabelText('Offer end date'), {
      target: { value: '2026-07-23' },
    })
    fireEvent.change(screen.getByLabelText('Offer withdrawal date'), {
      target: { value: '2026-07-24' },
    })
    fireEvent.change(screen.getByLabelText('TEAC meeting date'), {
      target: { value: '2026-07-29' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add Export Schedule' }))

    await waitFor(() => {
      expect(mockedCreateExportSchedule).toHaveBeenCalledWith({
        advertisingDate: '2026-07-15',
        applicationReceiptDate: '2026-07-08',
        offerReceiptDate: '2026-07-22',
        offerEndDate: '2026-07-23',
        offerWithdrawalDate: '2026-07-24',
        teacMeetingDate: '2026-07-29',
      })
    })

    expect(await screen.findByText('Export schedule added.')).toBeInTheDocument()
    expect(await screen.findByText('1002')).toBeInTheDocument()
  })

  it('shows schedule validation errors before creating export schedule rows', async () => {
    renderPage('schedule')

    await screen.findByRole('heading', { level: 1, name: 'Export schedule administration' })
    await userEvent.click(screen.getByRole('button', { name: 'Add Export Schedule' }))

    await waitFor(() => {
      expect(screen.getByText('Schedule error')).toBeInTheDocument()
      expect(
        screen.getByText('Export schedule requires all schedule dates in YYYY-MM-DD format.'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Advertising date is required.')).toBeInTheDocument()
    expect(screen.getByText('Application receipt date is required.')).toBeInTheDocument()
    expect(screen.getByText('Offer receipt date is required.')).toBeInTheDocument()
    expect(screen.getByText('Offer end date is required.')).toBeInTheDocument()
    expect(screen.getByText('Offer withdrawal date is required.')).toBeInTheDocument()
    expect(screen.getByText('TEAC meeting date is required.')).toBeInTheDocument()
    expect(mockedCreateExportSchedule).not.toHaveBeenCalled()
  })

  it('links application counts to an auto-filtered application search', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === '/lexisPolicyAdmin' ||
          action === '/lexisFILAdmin' ||
          action === '/applicationSearch',
      }),
    )
    mockedFetchExportSchedulePage.mockResolvedValueOnce({
      rows: [
        {
          exportScheduleId: '1002',
          advertisingDate: '2026-07-15',
          applicationReceiptDate: '2026-07-15',
          offerReceiptDate: '2026-07-29',
          offerEndDate: '2026-08-14',
          offerWithdrawalDate: '2026-08-04',
          teacMeetingDate: '2026-08-07',
          applicationCount: 3,
          mutable: false,
        },
      ],
      total: 1,
      page: 0,
      size: 100,
    })

    renderPage('schedule')

    const applicationLink = await screen.findByRole('link', {
      name: 'View 3 applications advertised on 2026-07-15',
    })
    expect(applicationLink).toHaveAttribute(
      'href',
      '/provincial/application?listingFromDate=2026-07-15&listingToDate=2026-07-15',
    )
  })

  it('shows backend schedule guardrail messages without reloading the table', async () => {
    mockedCreateExportSchedule.mockResolvedValueOnce({
      success: false,
      message: 'A schedule already exists for that advertising date.',
      schedule: null,
    })

    renderPage('schedule')

    await screen.findByRole('heading', { level: 1, name: 'Export schedule administration' })
    await waitFor(() => {
      expect(mockedFetchExportSchedulePage).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByLabelText('Advertising date'), {
      target: { value: '2026-07-01' },
    })
    fireEvent.change(screen.getByLabelText('Application receipt date'), {
      target: { value: '2026-06-25' },
    })
    fireEvent.change(screen.getByLabelText('Offer receipt date'), {
      target: { value: '2026-07-08' },
    })
    fireEvent.change(screen.getByLabelText('Offer end date'), {
      target: { value: '2026-07-09' },
    })
    fireEvent.change(screen.getByLabelText('Offer withdrawal date'), {
      target: { value: '2026-07-10' },
    })
    fireEvent.change(screen.getByLabelText('TEAC meeting date'), {
      target: { value: '2026-07-15' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add Export Schedule' }))

    await waitFor(() => {
      expect(mockedCreateExportSchedule).toHaveBeenCalledWith({
        advertisingDate: '2026-07-01',
        applicationReceiptDate: '2026-06-25',
        offerReceiptDate: '2026-07-08',
        offerEndDate: '2026-07-09',
        offerWithdrawalDate: '2026-07-10',
        teacMeetingDate: '2026-07-15',
      })
    })
    expect(await screen.findByText('Schedule error')).toBeInTheDocument()
    expect(
      await screen.findByText('A schedule already exists for that advertising date.'),
    ).toBeInTheDocument()
    expect(mockedFetchExportSchedulePage).toHaveBeenCalledTimes(1)
  })

  it('updates and deletes only mutable export schedule rows', async () => {
    mockedFetchExportSchedulePage
      .mockResolvedValueOnce({
        rows: [
          {
            exportScheduleId: '1001',
            advertisingDate: '2026-07-01',
            applicationReceiptDate: '2026-06-25',
            offerReceiptDate: '2026-07-08',
            offerEndDate: '2026-07-09',
            offerWithdrawalDate: '2026-07-10',
            teacMeetingDate: '2026-07-15',
            applicationCount: 0,
            mutable: true,
          },
          {
            exportScheduleId: '1002',
            advertisingDate: '2026-07-15',
            applicationReceiptDate: '2026-07-08',
            offerReceiptDate: '2026-07-22',
            offerEndDate: '2026-07-23',
            offerWithdrawalDate: '2026-07-24',
            teacMeetingDate: '2026-07-29',
            applicationCount: 3,
            mutable: false,
          },
        ],
        total: 2,
        page: 0,
        size: 100,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            exportScheduleId: '1001',
            advertisingDate: '2026-07-01',
            applicationReceiptDate: '2026-06-26',
            offerReceiptDate: '2026-07-08',
            offerEndDate: '2026-07-09',
            offerWithdrawalDate: '2026-07-10',
            teacMeetingDate: '2026-07-15',
            applicationCount: 0,
            mutable: true,
          },
        ],
        total: 1,
        page: 0,
        size: 100,
      })
      .mockResolvedValueOnce({ rows: [], total: 0, page: 0, size: 100 })

    renderPage('schedule')

    await screen.findByRole('heading', { level: 1, name: 'Export schedule administration' })
    const lockedRow = screen.getByText('1002').closest('tr')
    expect(lockedRow).not.toBeNull()
    expect(within(lockedRow as HTMLElement).getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(within(lockedRow as HTMLElement).getByRole('button', { name: 'Delete' })).toBeDisabled()

    const mutableRow = screen.getByText('1001').closest('tr')
    expect(mutableRow).not.toBeNull()
    await userEvent.click(within(mutableRow as HTMLElement).getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Application receipt date'), {
      target: { value: '2026-06-26' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Update Export Schedule' }))

    await waitFor(() => {
      expect(mockedUpdateExportSchedule).toHaveBeenCalledWith('1001', {
        advertisingDate: '2026-07-01',
        applicationReceiptDate: '2026-06-26',
        offerReceiptDate: '2026-07-08',
        offerEndDate: '2026-07-09',
        offerWithdrawalDate: '2026-07-10',
        teacMeetingDate: '2026-07-15',
      })
    })
    expect(await screen.findByText('Export schedule updated.')).toBeInTheDocument()

    const updatedRow = screen.getByText('1001').closest('tr')
    expect(updatedRow).not.toBeNull()
    await userEvent.click(within(updatedRow as HTMLElement).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedDeleteExportSchedule).toHaveBeenCalledWith('1001')
    })
    expect(await screen.findByText('Export schedule deleted.')).toBeInTheDocument()
  })

  it('shows validation contract when fee policy fields are incomplete', async () => {
    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })
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
    const feeView = renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })

    fireEvent.change(screen.getByLabelText('Policy effective date'), {
      target: { value: '2026-99-99' },
    })
    await userEvent.type(screen.getByLabelText('Region code'), '11')
    await userEvent.type(screen.getByLabelText('Fee increase percentage'), '4.2')
    await userEvent.click(screen.getByRole('button', { name: 'Add Fee Policy' }))

    expect(await screen.findByText('Date must be YYYY-MM-DD.')).toBeInTheDocument()
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()

    feeView.unmount()
    renderPage('fil')

    await screen.findByRole('heading', {
      level: 1,
      name: 'Fee in lieu percent policy administration',
    })

    fireEvent.change(screen.getByLabelText('Policy effective date'), {
      target: { value: 'not-a-date' },
    })
    await userEvent.type(screen.getByLabelText('Fee in lieu percentage'), '2.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add fee in lieu policy' }))

    expect(await screen.findAllByText('Date must be YYYY-MM-DD.')).toHaveLength(1)
    expect(mockedUpsertFilPolicy).not.toHaveBeenCalled()
  })
})
