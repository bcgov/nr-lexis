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
import { fetchReportOptions } from '@/service/search-options-service'
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

vi.mock('@/service/search-options-service', () => ({
  fetchReportOptions: vi.fn(),
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
const mockedFetchReportOptions = vi.mocked(fetchReportOptions)

const reportOptions = {
  currentSchedules: [],
  defaultRegion: '',
  regions: [
    { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
    { value: '1905', label: 'Thompson-Okanagan Natural Resource Region' },
  ],
  reportJurisdictions: [],
  biweeklyJurisdictions: [],
  teacJurisdictions: [],
  exemptionTypes: [],
  tenureExemptionTypes: [],
  exemptionReasons: [],
  exemptionStatuses: [],
  growthTypes: [],
  permitStatuses: [],
  destinationCountries: [],
  allDestinationCountries: [],
  portsOfExport: [],
} satisfies Awaited<ReturnType<typeof fetchReportOptions>>

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

const openAddPolicyDialog = async (area: 'fee' | 'fil') => {
  const dialogName = area === 'fee' ? 'Add fee policy' : 'Add fee in lieu policy'
  const openButton = await screen.findByRole('button', { name: dialogName })
  await waitFor(() => {
    expect(openButton).toBeEnabled()
  })
  await userEvent.click(openButton)
  return screen.getByRole('dialog', { name: dialogName })
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
          orgUnitNo: '1904',
          orgUnitCode: 'RCO',
          orgUnitName: 'Kootenay-Boundary Natural Resource Region',
          policyPercentage: '4',
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
          filPercentage: '2',
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

    mockedUpsertFeePolicy.mockResolvedValue(undefined)
    mockedUpsertFilPolicy.mockResolvedValue(undefined)
    mockedDeleteFeePolicy.mockResolvedValue(undefined)
    mockedDeleteFilPolicy.mockResolvedValue(undefined)
    mockedFetchReportOptions.mockResolvedValue(reportOptions)
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
    mockedFetchFeePolicyPage
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'fee-1',
            effectiveDate: '2026-01-01',
            orgUnitNo: '1904',
            orgUnitCode: 'RCO',
            orgUnitName: 'Kootenay-Boundary Natural Resource Region',
            policyPercentage: '4',
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
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'fee-2',
            effectiveDate: '2026-02-01',
            orgUnitNo: '1905',
            orgUnitCode: 'RTO',
            orgUnitName: 'Thompson-Okanagan Natural Resource Region',
            policyPercentage: '4',
            entryUserId: 'idir\\admin',
            entryTimestamp: '2026-02-01T00:00:00.000Z',
            updateUserId: 'idir\\admin',
            updateTimestamp: '2026-02-01T00:00:00.000Z',
          },
          {
            id: 'fee-1',
            effectiveDate: '2026-01-01',
            orgUnitNo: '1904',
            orgUnitCode: 'RCO',
            orgUnitName: 'Kootenay-Boundary Natural Resource Region',
            policyPercentage: '4',
            entryUserId: 'idir\\admin',
            entryTimestamp: '2026-01-01T00:00:00.000Z',
            updateUserId: 'idir\\admin',
            updateTimestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 2,
        page: 0,
        size: 100,
      })

    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const dialog = await openAddPolicyDialog('fee')
    await within(dialog).findByRole('option', {
      name: 'Thompson-Okanagan Natural Resource Region (1905)',
    })

    fireEvent.change(within(dialog).getByLabelText('Policy effective date'), {
      target: { value: '2026-02-01' },
    })
    await userEvent.selectOptions(within(dialog).getByLabelText('Region'), '1905')
    await userEvent.type(within(dialog).getByLabelText('Fee increase percentage'), '4')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee policy' }))

    await waitFor(() => {
      expect(mockedUpsertFeePolicy).toHaveBeenCalledWith({
        id: null,
        effectiveDate: '2026-02-01',
        orgUnitNo: '1905',
        policyPercentage: '4',
      })
    })

    expect(screen.getByText('Policy update')).toBeInTheDocument()
    expect(screen.getByText('Fee policy added.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add fee policy' })).not.toBeInTheDocument()
    expect(screen.getByText('2 results found')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('2026-02-01')
    expect(rows[1]).toHaveTextContent('RTO')
  })

  it('preserves the numeric organization unit when editing an RCO fee policy', async () => {
    renderPage()

    const openButton = await screen.findByRole('button', { name: 'Add fee policy' })
    await waitFor(() => {
      expect(openButton).toBeEnabled()
    })
    const policyRow = screen.getByText('RCO').closest('tr')
    expect(policyRow).not.toBeNull()
    await userEvent.click(within(policyRow as HTMLElement).getByRole('button', { name: 'Edit' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit fee policy' })
    expect(within(dialog).getByLabelText('Region')).toHaveValue('1904')
    await userEvent.clear(within(dialog).getByLabelText('Fee increase percentage'))
    await userEvent.type(within(dialog).getByLabelText('Fee increase percentage'), '5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update fee policy' }))

    await waitFor(() => {
      expect(mockedUpsertFeePolicy).toHaveBeenCalledWith({
        id: 'fee-1',
        effectiveDate: '2026-01-01',
        orgUnitNo: '1904',
        policyPercentage: '5',
      })
    })
  })

  it('adds a fee in lieu policy from the dialog and refreshes the table', async () => {
    mockedFetchFilPolicyPage
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'fil-1',
            effectiveDate: '2026-01-01',
            filPercentage: '2',
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
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'fil-2',
            effectiveDate: '2026-02-01',
            filPercentage: '3',
            entryUserId: 'idir\\admin',
            entryTimestamp: '2026-02-01T00:00:00.000Z',
            updateUserId: 'idir\\admin',
            updateTimestamp: '2026-02-01T00:00:00.000Z',
          },
          {
            id: 'fil-1',
            effectiveDate: '2026-01-01',
            filPercentage: '2',
            entryUserId: 'idir\\admin',
            entryTimestamp: '2026-01-01T00:00:00.000Z',
            updateUserId: 'idir\\admin',
            updateTimestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 2,
        page: 0,
        size: 100,
      })

    renderPage('fil')

    const dialog = await openAddPolicyDialog('fil')
    fireEvent.change(within(dialog).getByLabelText('Policy effective date'), {
      target: { value: '2026-02-01' },
    })
    await userEvent.type(within(dialog).getByLabelText('Fee in lieu percentage'), '3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee in lieu policy' }))

    await waitFor(() => {
      expect(mockedUpsertFilPolicy).toHaveBeenCalledWith({
        id: null,
        effectiveDate: '2026-02-01',
        filPercentage: '3',
      })
    })
    expect(screen.getByText('Fee in lieu policy added.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add fee in lieu policy' })).not.toBeInTheDocument()
    expect(screen.getByText('2 results found')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('2026-02-01')
    expect(rows[1]).toHaveTextContent('3')
  })

  it('edits a fee in lieu policy in the policy dialog', async () => {
    renderPage('fil')

    await screen.findByRole('heading', {
      level: 1,
      name: 'Fee in lieu percent policy administration',
    })
    const policyRow = screen.getByText('2026-01-01').closest('tr')
    expect(policyRow).not.toBeNull()
    await userEvent.click(within(policyRow as HTMLElement).getByRole('button', { name: 'Edit' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit fee in lieu policy' })
    expect(within(dialog).getByLabelText('Policy effective date')).toHaveValue('2026-01-01')
    await userEvent.clear(within(dialog).getByLabelText('Fee in lieu percentage'))
    await userEvent.type(within(dialog).getByLabelText('Fee in lieu percentage'), '3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update fee in lieu policy' }))

    await waitFor(() => {
      expect(mockedUpsertFilPolicy).toHaveBeenCalledWith({
        id: 'fil-1',
        effectiveDate: '2026-01-01',
        filPercentage: '3',
      })
    })
  })

  it.each([
    { area: 'fee' as const, percentageLabel: 'Fee increase percentage' },
    { area: 'fil' as const, percentageLabel: 'Fee in lieu percentage' },
  ])('cancels and resets the $area add dialog', async ({ area, percentageLabel }) => {
    renderPage(area)

    const dialog = await openAddPolicyDialog(area)
    await userEvent.type(within(dialog).getByLabelText(percentageLabel), '7')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const reopenedDialog = await openAddPolicyDialog(area)
    expect(within(reopenedDialog).getByLabelText(percentageLabel)).toHaveValue('')
  })

  it('fails closed when authoritative fee region options are unavailable', async () => {
    mockedFetchReportOptions.mockResolvedValue({ ...reportOptions, regions: [] })

    renderPage()

    expect(await screen.findByText('Region options unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Authoritative region options are unavailable. Fee policy saves are disabled.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add fee policy' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()
  })

  it.each([
    { area: 'fee' as const, value: '0' },
    { area: 'fee' as const, value: '100' },
    { area: 'fil' as const, value: '1' },
    { area: 'fil' as const, value: '99' },
  ])('accepts the $area integer boundary $value', async ({ area, value }) => {
    renderPage(area)

    await screen.findByRole('heading', {
      level: 1,
      name:
        area === 'fee' ? 'Fee policy administration' : 'Fee in lieu percent policy administration',
    })
    const dialog = await openAddPolicyDialog(area)
    fireEvent.change(within(dialog).getByLabelText('Policy effective date'), {
      target: { value: '2026-08-01' },
    })

    if (area === 'fee') {
      await within(dialog).findByRole('option', {
        name: 'RCO — Kootenay-Boundary Natural Resource Region',
      })
      await userEvent.selectOptions(within(dialog).getByLabelText('Region'), '1904')
      await userEvent.type(within(dialog).getByLabelText('Fee increase percentage'), value)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee policy' }))
      await waitFor(() => {
        expect(mockedUpsertFeePolicy).toHaveBeenCalledWith({
          id: null,
          effectiveDate: '2026-08-01',
          orgUnitNo: '1904',
          policyPercentage: value,
        })
      })
      return
    }

    await userEvent.type(within(dialog).getByLabelText('Fee in lieu percentage'), value)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee in lieu policy' }))
    await waitFor(() => {
      expect(mockedUpsertFilPolicy).toHaveBeenCalledWith({
        id: null,
        effectiveDate: '2026-08-01',
        filPercentage: value,
      })
    })
  })

  it.each([
    {
      area: 'fee' as const,
      value: '4.2',
      expectedError: 'Fee increase percentage must be a whole number.',
    },
    {
      area: 'fee' as const,
      value: '101',
      expectedError: 'Fee increase percentage must be 100 or less.',
    },
    {
      area: 'fil' as const,
      value: '2.5',
      expectedError: 'Fee in lieu percentage must be a whole number.',
    },
    {
      area: 'fil' as const,
      value: '0',
      expectedError: 'Fee in lieu percentage must be greater than or equal to 1.',
    },
    {
      area: 'fil' as const,
      value: '100',
      expectedError: 'Fee in lieu percentage must be 99 or less.',
    },
  ])('rejects $area percentage $value', async ({ area, value, expectedError }) => {
    renderPage(area)

    await screen.findByRole('heading', {
      level: 1,
      name:
        area === 'fee' ? 'Fee policy administration' : 'Fee in lieu percent policy administration',
    })
    const dialog = await openAddPolicyDialog(area)
    fireEvent.change(within(dialog).getByLabelText('Policy effective date'), {
      target: { value: '2026-08-01' },
    })

    if (area === 'fee') {
      await within(dialog).findByRole('option', {
        name: 'RCO — Kootenay-Boundary Natural Resource Region',
      })
      await userEvent.selectOptions(within(dialog).getByLabelText('Region'), '1904')
      await userEvent.type(within(dialog).getByLabelText('Fee increase percentage'), value)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee policy' }))
      expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()
    } else {
      await userEvent.type(within(dialog).getByLabelText('Fee in lieu percentage'), value)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee in lieu policy' }))
      expect(mockedUpsertFilPolicy).not.toHaveBeenCalled()
    }

    expect(await screen.findByText(expectedError)).toBeInTheDocument()
  })

  it.each([
    {
      area: 'fee',
      heading: 'Fee policy administration',
      editorHeading: null,
      actionName: 'Add fee policy',
      expectedTileCount: 0,
      subtitle: 'Manage regional fee policy percentages and effective dates.',
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
      editorHeading: null,
      actionName: 'Add fee in lieu policy',
      expectedTileCount: 0,
      subtitle: 'Manage fee-in-lieu percentages and effective dates.',
      absentHeadings: ['Fee policy administration', 'Export schedule administration'],
      fetchPage: mockedFetchFilPolicyPage,
      untouchedFetches: [mockedFetchFeePolicyPage, mockedFetchExportSchedulePage],
    },
    {
      area: 'schedule',
      heading: 'Export schedule administration',
      editorHeading: 'Schedule details',
      actionName: null,
      expectedTileCount: 1,
      subtitle: 'Manage advertising, receipt, offer, and TEAC schedule dates.',
      absentHeadings: ['Fee policy administration', 'Fee in lieu percent policy administration'],
      fetchPage: mockedFetchExportSchedulePage,
      untouchedFetches: [mockedFetchFeePolicyPage, mockedFetchFilPolicyPage],
    },
  ])(
    'loads only the selected $area admin area',
    async ({
      area,
      heading,
      editorHeading,
      actionName,
      expectedTileCount,
      subtitle,
      absentHeadings,
      fetchPage,
      untouchedFetches,
    }) => {
      const { container } = renderPage(area as AdminPolicyArea)

      await screen.findByRole('heading', { level: 1, name: heading })
      expect(screen.getByText(subtitle)).toBeVisible()
      if (editorHeading) {
        expect(screen.getByRole('heading', { level: 2, name: editorHeading })).toBeInTheDocument()
      } else {
        expect(
          screen.queryByRole('heading', { level: 2, name: 'Policy details' }),
        ).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Policy effective date')).not.toBeInTheDocument()
      }
      expect(screen.queryByRole('heading', { level: 2, name: heading })).not.toBeInTheDocument()
      expect(container.querySelectorAll('.cds--tile')).toHaveLength(expectedTileCount)
      const resultsRegion = await screen.findByRole('region', { name: 'Search results table' })
      expect(resultsRegion.closest('.legacy-search-table-frame')).toHaveTextContent(
        '1 result found',
      )
      if (actionName) {
        const actionButton = screen.getByRole('button', { name: actionName })
        expect(actionButton.closest('.admin-policy-table-actions')).not.toBeNull()
        expect(actionButton.closest('.admin-policy-workspace')?.firstElementChild).toHaveClass(
          'admin-policy-table-actions',
        )
      }
      for (const absentHeading of absentHeadings) {
        expect(
          screen.queryByRole('heading', { level: 2, name: absentHeading }),
        ).not.toBeInTheDocument()
      }

      expect(fetchPage).toHaveBeenCalledWith(
        0,
        100,
        area === 'schedule' ? 'advertisingDate' : 'effective_date',
        'desc',
      )
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
        mockedFetchFeePolicyPage.mockImplementation(async (page = 0, size = 100) => ({
          rows: [
            {
              id: `fee-${page}-${size}`,
              effectiveDate: '2026-01-01',
              orgUnitNo: '1904',
              orgUnitCode: 'RCO',
              orgUnitName: 'Kootenay-Boundary Natural Resource Region',
              policyPercentage: '4',
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
        mockedFetchFilPolicyPage.mockImplementation(async (page = 0, size = 100) => ({
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
        mockedFetchExportSchedulePage.mockImplementation(async (page = 0, size = 100) => ({
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

      expect(fetchPage).toHaveBeenLastCalledWith(
        0,
        100,
        area === 'schedule' ? 'advertisingDate' : 'effective_date',
        'desc',
      )
      expect(screen.getByText('220 results found')).toBeInTheDocument()

      const rowsPerPage = screen.getByLabelText('Rows per page')
      expect(rowsPerPage).toHaveValue('100')
      expect(
        within(rowsPerPage)
          .getAllByRole('option')
          .map((option) => (option as HTMLOptionElement).value),
      ).toEqual(['20', '50', '100', '200'])

      fireEvent.change(rowsPerPage, { target: { value: '20' } })

      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(
          0,
          20,
          area === 'schedule' ? 'advertisingDate' : 'effective_date',
          'desc',
        )
      })

      await userEvent.click(screen.getByLabelText('Next page'))

      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(
          1,
          20,
          area === 'schedule' ? 'advertisingDate' : 'effective_date',
          'desc',
        )
      })
    },
  )

  it.each([
    { area: 'fee' as const, title: 'No fee policies found' },
    { area: 'fil' as const, title: 'No fee-in-lieu policies found' },
    { area: 'schedule' as const, title: 'No export schedules found' },
  ])('renders a semantic empty workspace for $area administration', async ({ area, title }) => {
    if (area === 'fee') {
      mockedFetchFeePolicyPage.mockResolvedValue({ rows: [], total: 0, page: 0, size: 100 })
    } else if (area === 'fil') {
      mockedFetchFilPolicyPage.mockResolvedValue({ rows: [], total: 0, page: 0, size: 100 })
    } else {
      mockedFetchExportSchedulePage.mockResolvedValue({ rows: [], total: 0, page: 0, size: 100 })
    }

    renderPage(area)

    expect(await screen.findByRole('heading', { level: 3, name: title })).toBeVisible()
    expect(screen.getByText('0 results found')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument()
  })

  it('shows policy loading inside the retained results workspace', async () => {
    let resolvePolicies!: (value: Awaited<ReturnType<typeof fetchFeePolicyPage>>) => void
    mockedFetchFeePolicyPage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePolicies = resolve
        }),
    )

    renderPage('fee')

    const resultsRegion = screen.getByRole('region', { name: 'Search results table' })
    expect(resultsRegion).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading fee policies...')).toBeVisible()

    resolvePolicies({ rows: [], total: 0, page: 0, size: 100 })
    expect(await screen.findByRole('heading', { name: 'No fee policies found' })).toBeVisible()
    await waitFor(() => {
      expect(resultsRegion).toHaveAttribute('aria-busy', 'false')
    })
  })

  it('loads historical schedules in the paginated table and sorts them on the server', async () => {
    const historicalRow = {
      exportScheduleId: '17',
      advertisingDate: '2026-06-24',
      applicationReceiptDate: '2026-06-24',
      offerReceiptDate: '2026-07-08',
      offerEndDate: '2026-08-07',
      offerWithdrawalDate: '2026-07-28',
      teacMeetingDate: '2026-07-31',
      applicationCount: 0,
      mutable: true,
    }
    mockedFetchExportSchedulePage.mockResolvedValue({
      rows: [historicalRow],
      total: 2154,
      page: 0,
      size: 100,
    })

    renderPage('schedule')

    await screen.findByRole('heading', { level: 1, name: 'Export schedule administration' })
    await waitFor(() => {
      expect(mockedFetchExportSchedulePage).toHaveBeenLastCalledWith(
        0,
        100,
        'advertisingDate',
        'desc',
      )
    })
    expect(screen.getByLabelText('Advertising date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'TEAC meeting' }))

    await waitFor(() => {
      expect(mockedFetchExportSchedulePage).toHaveBeenLastCalledWith(
        0,
        100,
        'teacMeetingDate',
        'asc',
      )
    })

    await userEvent.click(screen.getByRole('button', { name: 'TEAC meeting' }))

    await waitFor(() => {
      expect(mockedFetchExportSchedulePage).toHaveBeenLastCalledWith(
        0,
        100,
        'teacMeetingDate',
        'desc',
      )
    })
  })

  it.each([
    {
      area: 'fee' as const,
      heading: 'Fee policy administration',
      targetHeader: 'Region',
      sortField: 'org_unit_no',
      fetchPage: mockedFetchFeePolicyPage,
    },
    {
      area: 'fil' as const,
      heading: 'Fee in lieu percent policy administration',
      targetHeader: 'Fee in lieu %',
      sortField: 'fil_percent',
      fetchPage: mockedFetchFilPolicyPage,
    },
  ])(
    'sorts and resets backend pagination for $area policy headers',
    async ({ area, heading, targetHeader, sortField, fetchPage }) => {
      if (area === 'fee') {
        mockedFetchFeePolicyPage.mockImplementation(async (page = 0, size = 100) => ({
          rows: [
            {
              id: `fee-${page}-${size}`,
              effectiveDate: '2026-01-01',
              orgUnitNo: '1904',
              orgUnitCode: 'RCO',
              orgUnitName: 'Kootenay-Boundary Natural Resource Region',
              policyPercentage: '4',
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
        mockedFetchFilPolicyPage.mockImplementation(async (page = 0, size = 100) => ({
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
      }

      renderPage(area)

      await screen.findByRole('heading', { level: 1, name: heading })
      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(0, 100, 'effective_date', 'desc')
      })

      await userEvent.click(screen.getByLabelText('Next page'))
      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(1, 100, 'effective_date', 'desc')
      })

      await userEvent.click(screen.getByRole('button', { name: targetHeader }))
      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(0, 100, sortField, 'asc')
      })

      await userEvent.click(screen.getByRole('button', { name: targetHeader }))
      await waitFor(() => {
        expect(fetchPage).toHaveBeenLastCalledWith(0, 100, sortField, 'desc')
      })
    },
  )

  it('enforces permission and disables mutating actions when not granted', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })

    expect(screen.getByRole('button', { name: 'Add fee policy' })).toBeDisabled()
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
    fireEvent.blur(screen.getByLabelText('Offer end date'))
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
    expect(screen.queryByText('Offer end date is required.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Offer end date')).not.toHaveAttribute('aria-invalid', 'true')
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
          provincialApplicationCount: 2,
        },
      ],
      total: 1,
      page: 0,
      size: 100,
    })

    renderPage('schedule')

    const applicationLink = await screen.findByRole('link', {
      name: 'View 2 provincial applications assigned to export schedule 1002',
    })
    expect(applicationLink).toHaveAttribute('href', '/provincial/application?exportScheduleId=1002')
  })

  it('shows backend schedule guardrail messages without reloading the table', async () => {
    mockedCreateExportSchedule.mockResolvedValueOnce({
      success: false,
      message: 'Export schedule is used by existing applications and cannot be changed.',
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
      await screen.findByText(
        'Export schedule is used by existing applications and cannot be changed.',
      ),
    ).toBeInTheDocument()
    expect(mockedFetchExportSchedulePage).toHaveBeenCalledTimes(1)
  })

  it('updates and deletes unreferenced export schedule rows regardless of date', async () => {
    mockedFetchExportSchedulePage
      .mockResolvedValueOnce({
        rows: [
          {
            exportScheduleId: '1001',
            advertisingDate: '2026-06-24',
            applicationReceiptDate: '2026-06-20',
            offerReceiptDate: '2026-06-30',
            offerEndDate: '2026-07-09',
            offerWithdrawalDate: '2026-07-05',
            teacMeetingDate: '2026-07-07',
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
            advertisingDate: '2026-06-24',
            applicationReceiptDate: '2026-06-26',
            offerReceiptDate: '2026-06-30',
            offerEndDate: '2026-07-09',
            offerWithdrawalDate: '2026-07-05',
            teacMeetingDate: '2026-07-07',
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
        advertisingDate: '2026-06-24',
        applicationReceiptDate: '2026-06-26',
        offerReceiptDate: '2026-06-30',
        offerEndDate: '2026-07-09',
        offerWithdrawalDate: '2026-07-05',
        teacMeetingDate: '2026-07-07',
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
    const dialog = await openAddPolicyDialog('fee')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add fee policy' }))

    await waitFor(() => {
      expect(screen.getByText('Policy error')).toBeInTheDocument()
      expect(
        screen.getByText('Fee policy requires effective date, region, and percentage.'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Policy effective date is required.')).toBeInTheDocument()
    expect(screen.getByText('Region is required.')).toBeInTheDocument()
    expect(screen.getByText('Fee increase percentage is required.')).toBeInTheDocument()
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()
  })

  it('blocks typed policy dates that are not valid ISO dates', async () => {
    const feeView = renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Fee policy administration' })

    const feeDialog = await openAddPolicyDialog('fee')
    fireEvent.change(within(feeDialog).getByLabelText('Policy effective date'), {
      target: { value: 'not-a-date' },
    })
    await userEvent.selectOptions(within(feeDialog).getByLabelText('Region'), '1904')
    await userEvent.type(within(feeDialog).getByLabelText('Fee increase percentage'), '4')
    await userEvent.click(within(feeDialog).getByRole('button', { name: 'Add fee policy' }))

    expect(await screen.findByText('Policy effective date is required.')).toBeInTheDocument()
    expect(mockedUpsertFeePolicy).not.toHaveBeenCalled()

    feeView.unmount()
    renderPage('fil')

    await screen.findByRole('heading', {
      level: 1,
      name: 'Fee in lieu percent policy administration',
    })

    const filDialog = await openAddPolicyDialog('fil')
    fireEvent.change(within(filDialog).getByLabelText('Policy effective date'), {
      target: { value: 'not-a-date' },
    })
    await userEvent.type(within(filDialog).getByLabelText('Fee in lieu percentage'), '2')
    await userEvent.click(within(filDialog).getByRole('button', { name: 'Add fee in lieu policy' }))

    expect(await screen.findAllByText('Policy effective date is required.')).toHaveLength(1)
    expect(mockedUpsertFilPolicy).not.toHaveBeenCalled()
  })
})
