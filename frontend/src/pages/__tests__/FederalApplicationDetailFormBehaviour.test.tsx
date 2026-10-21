import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import FederalApplicationDetailsPage from '@/pages/FederalApplicationDetails'
import {
  fetchFederalApplicationDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import { fetchApplicationPackageScales } from '@/service/provincial-application-items-service'
import {
  fetchFederalApplicationRemarks,
  saveFederalApplicationRemark,
} from '@/service/federal-application-remarks-service'
import { updateFederalApplicationStatus } from '@/service/federal-application-mutation-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchFederalApplicationDetail: vi.fn(),
  releaseApplicationEditLock: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationPackageScales: vi.fn(),
}))

vi.mock('@/service/federal-application-remarks-service', () => ({
  fetchFederalApplicationRemarks: vi.fn(),
  saveFederalApplicationRemark: vi.fn(),
}))

vi.mock('@/service/federal-application-mutation-service', () => ({
  updateFederalApplicationStatus: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchFederalApplicationDetail = vi.mocked(fetchFederalApplicationDetail)
const mockedUpdateFederalApplicationStatus = vi.mocked(updateFederalApplicationStatus)
const mockedFetchFederalApplicationRemarks = vi.mocked(fetchFederalApplicationRemarks)
const mockedSaveFederalApplicationRemark = vi.mocked(saveFederalApplicationRemark)

const UNSUPPORTED_CHARACTERS =
  'Application remarks contain unsupported special characters. Remove them and try again.'

const federalDetail: FederalApplicationDetail = {
  applicationNumber: 888,
  federalApplicationNumber: 'FED-888',
  statusCode: 'APP',
  statusDescription: 'Approved',
  ownerClientNumber: '00021234',
  ownerClientLocationCode: '01',
  ownerApplicantType: 'O',
  ownerContactName: 'Owner Contact',
  ownerCompanyName: 'Owner Company',
  ownerClientContext: null,
  agentClientNumber: null,
  agentClientLocationCode: null,
  agentApplicantType: null,
  agentContactName: null,
  agentCompanyName: null,
  agentClientContext: null,
  exemptionNumber: 'EX-555',
  exemptionType: 'Section 1',
  exemptionReason: 'Economic',
  region: 'RSC',
  productType: 'Standing Timber',
  applicationDate: '2026-01-10',
  receivedDate: '2026-01-11',
  listingDate: '2999-12-31',
  termDays: 14,
  logLocation: 'Forest service road',
  ageClass: 'Mature',
  averageLogVolume: 12.5,
  applicationVolume: 42,
  endUse: 'HE/PL',
  author: 'IDIR\\TESTER',
  readOnly: false,
  locked: false,
  lockHeldByCurrentUser: true,
  lockedBy: null,
  lockMessage: null,
  packages: [],
  remarks: [],
  offers: [],
  federalPermit: {
    permitNumber: 90001,
    permitIssueDate: '2026-02-01',
    destinationCountry: 'US',
    transportType: 'S',
    transportName: 'Truck',
    shippingDate: '2026-02-10',
    portOfExport: 'VA',
    otherPortOfExport: null,
  },
}

const renderPage = () => {
  const router = createMemoryRouter(
    [{ path: '/federal/:applicationNumber', element: <FederalApplicationDetailsPage /> }],
    { initialEntries: ['/federal/888'] },
  )
  render(<RouterProvider router={router} />)
}

const selectTab = async (name: string) => {
  const tab = await screen.findByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') await userEvent.click(tab)
}

describe('Federal application detail form behaviour', () => {
  it('closes an unchanged saved remark without a request or notification', async () => {
    renderPage()
    await selectTab('Remarks')
    const row = (await screen.findByText('First note')).closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /^Edit remark / }))
    expect(await screen.findByRole('textbox', { name: /^Edit remark 44/ })).toHaveValue(
      'First note',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: /^Edit remark / })).toHaveFocus(),
    )
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()
    expect(screen.queryByText('Federal application remark saved.')).not.toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchFederalApplicationDetail.mockResolvedValue(federalDetail)
    vi.mocked(releaseApplicationEditLock).mockResolvedValue(undefined)
    vi.mocked(fetchApplicationPackageScales).mockResolvedValue([])
    mockedFetchFederalApplicationRemarks.mockResolvedValue([
      { remarkId: 44, remark: 'First note', user: 'idir\\reviewer', date: '2026-07-18T04:37:21Z' },
      { remarkId: 45, remark: 'Second note', user: 'idir\\reviewer', date: '2026-07-19T04:37:21Z' },
    ])
    mockedSaveFederalApplicationRemark.mockResolvedValue({
      success: true,
      message: 'Federal application remark saved.',
      remark: null,
      errors: [],
    })
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: true,
      message: 'Federal application status updated.',
      errors: [],
    })
  })

  it('focuses the remark on Withdraw and shows a server remark message on the remark', async () => {
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: false,
      message: null,
      errors: ['Remark is too long to save. Shorten it and try again.'],
    })
    renderPage()
    await selectTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    const remark = await screen.findByLabelText('Remark')
    await waitFor(() => expect(remark).toHaveFocus())
    expect(screen.getByText('Withdrawn', { selector: '.detail-field-value' })).toBeInTheDocument()
    await userEvent.type(remark, 'Not eligible')

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(remark).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText('Remark is too long to save. Shorten it and try again.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(remark).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveFocus())
  })

  it('returns focus to the Reject action it was opened from', async () => {
    renderPage()
    await selectTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(screen.getByLabelText('Remark')).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reject' })).toHaveFocus())
  })

  it('shows the unsupported-character message on the status remark', async () => {
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: false,
      message: null,
      errors: [UNSUPPORTED_CHARACTERS],
    })
    renderPage()
    await selectTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const remark = await screen.findByLabelText('Remark')
    await userEvent.type(remark, 'Caf\u00e9')

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(remark).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText(UNSUPPORTED_CHARACTERS)).toBeInTheDocument()
    expect(screen.queryByText('Unable to update federal application status.')).toBeNull()
  })

  it('shows the unsupported-character message on the new remark', async () => {
    mockedSaveFederalApplicationRemark.mockResolvedValue({
      success: false,
      message: null,
      remark: null,
      errors: [UNSUPPORTED_CHARACTERS],
    })
    renderPage()
    await selectTab('Remarks')
    await userEvent.click(await screen.findByRole('button', { name: 'Add remark' }))
    const remark = await screen.findByLabelText('New remark')
    await userEvent.type(remark, 'It\u2019s here')

    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

    await waitFor(() => expect(remark).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText(UNSUPPORTED_CHARACTERS)).toBeInTheDocument()
    expect(screen.queryByText('Unable to save federal application remark.')).toBeNull()
    await waitFor(() => expect(remark).toHaveFocus())
  })

  it('asks before another remark edit drops unsaved remark changes', async () => {
    renderPage()
    await selectTab('Remarks')
    const firstRow = (await screen.findByText('First note')).closest('tr') as HTMLElement
    const secondRow = screen.getByText('Second note').closest('tr') as HTMLElement
    await userEvent.click(within(firstRow).getByRole('button', { name: /^Edit remark / }))
    const remark = await screen.findByRole('textbox', { name: /^Edit remark 44/ })
    await waitFor(() => expect(remark).toHaveFocus())
    await userEvent.type(remark, ' changed')

    await userEvent.click(within(secondRow).getByRole('button', { name: /^Edit remark / }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('textbox', { name: /^Edit remark 44/ })).toHaveValue(
      'First note changed',
    )

    await userEvent.click(within(secondRow).getByRole('button', { name: /^Edit remark / }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('textbox', { name: /^Edit remark 45/ })).toHaveValue(
      'Second note',
    )
  })

  it('shows remark errors on the remark field and returns focus to the remark Edit button', async () => {
    renderPage()
    await selectTab('Remarks')
    await userEvent.click(await screen.findByRole('button', { name: 'Add remark' }))
    const remark = await screen.findByLabelText('New remark')

    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
    expect(remark).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Remark is required')).toBeInTheDocument()
    await waitFor(() => expect(remark).toHaveFocus())

    await userEvent.type(remark, 'Third note')
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
    expect(await screen.findByText('Federal application remark saved.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add remark' })).toHaveFocus())
  })

  it('shows an empty Remarks tab without a card and keeps Add remark in reach', async () => {
    mockedFetchFederalApplicationRemarks.mockResolvedValue([])
    renderPage()

    await selectTab('Remarks')
    const remarksEmpty = (
      await screen.findByRole('heading', { name: 'No remarks found', level: 2 })
    ).closest('.lexis-empty-state') as HTMLElement
    expect(remarksEmpty).toHaveClass('lexis-empty-state--tab')
    expect(remarksEmpty.closest('.cds--tile')).toBeNull()
    expect(remarksEmpty.closest('.cds--tab-content')).toHaveClass(
      'application-detail-tab-panel--empty',
    )

    await userEvent.click(within(remarksEmpty).getByRole('button', { name: 'Add remark' }))
    expect(await screen.findByLabelText('New remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add remark' })).toHaveFocus())
  })
})
