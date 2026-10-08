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
import { fetchFederalApplicationDocuments } from '@/service/federal-application-documents-service'
import { fetchApplicationPackageScales } from '@/service/provincial-application-items-service'
import {
  fetchFederalApplicationRemarks,
  saveFederalApplicationRemark,
} from '@/service/federal-application-remarks-service'
import {
  saveFederalPermit,
  updateFederalApplicationStatus,
} from '@/service/federal-application-mutation-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchFederalApplicationDetail: vi.fn(),
  releaseApplicationEditLock: vi.fn(),
}))

vi.mock('@/service/federal-application-documents-service', () => ({
  fetchFederalApplicationDocuments: vi.fn(),
  openFederalApplicationDocument: vi.fn(),
  removeFederalApplicationDocument: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationPackageScales: vi.fn(),
}))

vi.mock('@/service/federal-application-remarks-service', () => ({
  fetchFederalApplicationRemarks: vi.fn(),
  saveFederalApplicationRemark: vi.fn(),
}))

vi.mock('@/service/federal-application-mutation-service', () => ({
  saveFederalPermit: vi.fn(),
  updateFederalApplicationStatus: vi.fn(),
}))

vi.mock('@/service/shipping-reference-service', () => ({
  fetchShippingReferenceOptions: vi.fn(),
  formatShippingReferenceOption: (option: { code: string; name: string }) =>
    `${option.name} (${option.code})`,
  shippingReferenceLabel: (
    options: Array<{ code: string; name: string }> | undefined,
    code: string | null | undefined,
  ) => options?.find((candidate) => candidate.code === code)?.name ?? code ?? '',
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchFederalApplicationDetail = vi.mocked(fetchFederalApplicationDetail)
const mockedSaveFederalPermit = vi.mocked(saveFederalPermit)
const mockedUpdateFederalApplicationStatus = vi.mocked(updateFederalApplicationStatus)
const mockedFetchFederalApplicationRemarks = vi.mocked(fetchFederalApplicationRemarks)
const mockedSaveFederalApplicationRemark = vi.mocked(saveFederalApplicationRemark)

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

const startShippingEdit = async () => {
  await selectTab('Shipping details')
  await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
  await waitFor(() => expect(screen.getByLabelText('Permit issue date')).toHaveFocus())
}

describe('Federal application detail form behaviour', () => {
  it('closes unchanged shipping editing without a request or notification', async () => {
    renderPage()
    await startShippingEdit()
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit shipping details' })).toHaveFocus(),
    )
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()
    expect(screen.queryByText('Federal permit updated.')).not.toBeInTheDocument()
  })

  it('closes an unchanged saved remark without a request or notification', async () => {
    renderPage()
    await selectTab('Remarks')
    const row = (await screen.findByText('First note')).closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByLabelText('Edit remark 44')).toHaveValue('First note')
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Edit' })).toHaveFocus())
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()
    expect(screen.queryByText('Federal application remark saved.')).not.toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchFederalApplicationDetail.mockResolvedValue(federalDetail)
    vi.mocked(releaseApplicationEditLock).mockResolvedValue(undefined)
    vi.mocked(fetchFederalApplicationDocuments).mockResolvedValue({ rows: [], source: 'api' })
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
    mockedSaveFederalPermit.mockResolvedValue({
      success: true,
      message: 'Federal permit updated.',
      errors: [],
    })
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: true,
      message: 'Federal application status updated.',
      errors: [],
    })
    vi.mocked(fetchShippingReferenceOptions).mockResolvedValue({
      countries: [
        { code: 'CA', name: 'Canada' },
        { code: 'US', name: 'United States' },
      ],
      transportTypes: [
        { code: 'S', name: 'Ship' },
        { code: 'T', name: 'Truck' },
      ],
      ports: [
        { code: 'OT', name: 'Other' },
        { code: 'VA', name: 'Vancouver' },
      ],
    })
  })

  it('focuses the first shipping field on edit and the Edit button after Save', async () => {
    renderPage()
    await startShippingEdit()
    await userEvent.clear(screen.getByLabelText('Transport name'))
    await userEvent.type(screen.getByLabelText('Transport name'), 'Rail')

    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))

    expect(await screen.findByText('Federal permit updated.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit shipping details' })).toHaveFocus(),
    )
  })

  it('shows shipping errors on their fields on Save and focuses the first', async () => {
    renderPage()
    await startShippingEdit()
    await userEvent.selectOptions(screen.getByLabelText('Final destination country'), '')
    await userEvent.clear(screen.getByLabelText('Transport name'))

    const save = screen.getByRole('button', { name: 'Save federal permit' })
    expect(save).toBeEnabled()
    await userEvent.click(save)

    const country = screen.getByLabelText('Final destination country')
    expect(country).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Final destination country is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Transport name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Transport name is required')).toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    await waitFor(() => expect(country).toHaveFocus())
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()

    await userEvent.selectOptions(country, 'CA')
    expect(country).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Transport name is required')).toBeInTheDocument()
  })

  it('shows a server shipping message on its field', async () => {
    mockedSaveFederalPermit.mockResolvedValue({
      success: false,
      message: null,
      errors: ['Transport type is invalid.'],
    })
    renderPage()
    await startShippingEdit()

    await userEvent.type(screen.getByLabelText('Transport name'), ' Updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))

    const transportType = screen.getByLabelText('Transport type')
    await waitFor(() => expect(transportType).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('Transport type is invalid')).toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    await waitFor(() => expect(transportType).toHaveFocus())
  })

  it('cancels shipping without asking when nothing changed and asks when something did', async () => {
    renderPage()
    await startShippingEdit()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const editButton = screen.getByRole('button', { name: 'Edit shipping details' })
    await waitFor(() => expect(editButton).toHaveFocus())

    await userEvent.click(editButton)
    await userEvent.type(await screen.findByLabelText('Transport name'), ' two')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Transport name')).toHaveValue('Truck two')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit shipping details' })).toHaveFocus(),
    )
    expect(screen.queryByLabelText('Transport name')).not.toBeInTheDocument()
  })

  it('focuses the status field on edit and shows a server remark message on the remark', async () => {
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: false,
      message: null,
      errors: ['Remark is too long to save. Shorten it and try again.'],
    })
    renderPage()
    await selectTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Edit federal status' }))
    const status = await screen.findByLabelText('Status')
    await waitFor(() => expect(status).toHaveFocus())
    const remark = screen.getByLabelText('Remark')
    await userEvent.type(remark, 'Not eligible')

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(remark).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText('Remark is too long to save. Shorten it and try again.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(remark).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit federal status' })).toHaveFocus(),
    )
  })

  it('asks before another remark edit drops unsaved remark changes', async () => {
    renderPage()
    await selectTab('Remarks')
    const firstRow = (await screen.findByText('First note')).closest('tr') as HTMLElement
    const secondRow = screen.getByText('Second note').closest('tr') as HTMLElement
    await userEvent.click(within(firstRow).getByRole('button', { name: 'Edit' }))
    const remark = await screen.findByLabelText('Edit remark 44')
    await waitFor(() => expect(remark).toHaveFocus())
    await userEvent.type(remark, ' changed')

    await userEvent.click(within(secondRow).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Edit remark 44')).toHaveValue('First note changed')

    await userEvent.click(within(secondRow).getByRole('button', { name: 'Edit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByLabelText('Edit remark 45')).toHaveValue('Second note')
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
})
