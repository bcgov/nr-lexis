import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import ProvincialOfferDetailsPage from '@/pages/ProvincialOfferDetails'
import { fetchProvincialOfferDetail, releaseOfferEditLock } from '@/service/lexis-detail-service'
import {
  submitProvincialOfferUpdate,
  type OfferSubmissionResult,
} from '@/service/create-submit-service'
import { createTestAuthContext } from '@/test-utils/auth'
import { formatBusinessIsoDate } from '@/utils/date'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialOfferDetail: vi.fn(),
  releaseOfferEditLock: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialOfferUpdate: vi.fn(),
}))

vi.mock('@/service/offer-scale-detail-service', () => ({
  fetchOfferScaleDetails: vi.fn(),
}))

Element.prototype.scrollIntoView = vi.fn()

const mockedFetchDetail = vi.mocked(fetchProvincialOfferDetail)
const mockedSubmit = vi.mocked(submitProvincialOfferUpdate)

const staffOffer: ProvincialOfferDetail = {
  offerNumber: 455,
  applicationNumber: 46989,
  packageNumber: 'T1020-1654-13',
  companyName: 'NORSKE SKOG CANADA LIMITED',
  contactName: 'Log buyer',
  purchaseOfferAmount: 10,
  purchaseOfferDate: '2026-10-21',
  offerWithdrawalDate: null,
  teacReviewDate: '2026-12-04',
  approvalIndicator: 'N',
  validOfferIndicator: 'Y',
  fairOfferIndicator: 'N',
  offerRemark: null,
  withdrawReason: null,
  exportJurisdictionCode: 'P',
  manufacturingFacilityInfo: null,
  offeringClientNumber: '00077881',
  pickupLocation: 'Menzies Bay',
  offerCondition: null,
  advertisingDate: '2026-10-21',
  offerEndDate: '2026-12-11',
  packageVolume: 525,
  speciesGradeCode: 'HE/PL',
  offerVolume: 13,
  region: 'Coast',
  author: 'IDIR\\AMCDERMI',
  canEditScheduleDates: true,
  canEditOfferRemarks: true,
  canEditOfferDetails: true,
  canEditWithdrawFields: true,
  locked: false,
  lockedBy: null,
  lockMessage: null,
}

// An offering client sees no schedule fields and edits only its own offer details.
const clientOffer: ProvincialOfferDetail = {
  ...staffOffer,
  teacReviewDate: null,
  canEditScheduleDates: false,
  canEditOfferRemarks: false,
}

const savedResult = (overrides: Partial<OfferSubmissionResult> = {}): OfferSubmissionResult => ({
  success: true,
  message: 'The purchase offer was updated successfully.',
  createdId: '455',
  errors: [],
  warnings: [],
  emailRequired: true,
  applicantEmailFound: true,
  ...overrides,
})

const renderRecord = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/provincial/offers/455', state }]}>
      <Routes>
        <Route path="/provincial/offers/:offerNumber" element={<ProvincialOfferDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )

const recordValue = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? ''

const startEditing = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Edit offer' }))
  return screen.findByRole('button', { name: 'Save changes' })
}

describe('Offer record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    vi.mocked(releaseOfferEditLock).mockResolvedValue(undefined)
    mockedFetchDetail.mockResolvedValue(staffOffer)
    mockedSubmit.mockResolvedValue(savedResult())
  })

  it('titles the record with its number and author, in one card of sections', async () => {
    renderRecord()

    expect(await screen.findByRole('heading', { name: 'Offer 455' })).toBeInTheDocument()
    expect(screen.getByText('Author: IDIR\\AMCDERMI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit offer' })).toBeInTheDocument()
    for (const section of [
      'Application details',
      'Offering company details',
      'Offer details',
      'Offer withdrawals',
      'Approval',
    ]) {
      expect(screen.getByRole('group', { name: section })).toBeInTheDocument()
    }
    expect(screen.queryByText('Offer number')).not.toBeInTheDocument()
    expect(screen.getByText('Back to Offer search')).toBeInTheDocument()
  })

  it('shows values as text with dates in words, one-decimal volumes and a two-decimal amount', async () => {
    renderRecord()

    await screen.findByRole('heading', { name: 'Offer 455' })
    expect(recordValue('Application/package volume (m³)')).toBe('525.0')
    expect(recordValue('Offer volume (m³)')).toBe('13.0')
    expect(recordValue('Offer amount ($/m³)')).toBe('10.00')
    expect(recordValue('List date')).toBe('Oct 21, 2026')
    expect(recordValue('Offer received date')).toBe('Oct 21, 2026')
    expect(recordValue('Offer in effect until')).toBe('Dec 11, 2026')
    expect(recordValue('TEAC review date')).toBe('Dec 4, 2026')
    expect(recordValue('Fair market value')).toBe('No')
    expect(recordValue('Valid offer')).toBe('Yes')
    expect(recordValue('Offer approved')).toBe('No')
    expect(screen.getByRole('button', { name: 'See scale detail' })).toBeInTheDocument()
  })

  it('says an offer without a package has no packages', async () => {
    mockedFetchDetail.mockResolvedValue({ ...staffOffer, packageNumber: null })
    renderRecord()

    await screen.findByRole('heading', { name: 'Offer 455' })
    expect(recordValue('Package number')).toBe('No packages')
    expect(screen.queryByRole('button', { name: 'See scale detail' })).toBeNull()
  })

  it('shows read-only dates as YYYY-MM-DD in edit mode, with radio groups for staff', async () => {
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)

    expect(screen.getByText('Required fields')).toBeInTheDocument()
    expect(recordValue('List date')).toBe('2026-10-21')
    expect(recordValue('Offer in effect until')).toBe('2026-12-11')
    expect(screen.getByRole('textbox', { name: /Offer amount/ })).toHaveValue('10.00')
    expect(screen.getByRole('textbox', { name: /Offer volume/ })).toHaveValue('13.0')
    expect(
      within(screen.getByRole('group', { name: 'Fair market value' })).getByRole('radio', {
        name: 'No',
      }),
    ).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Edit offer' })).toBeNull()
  })

  it('shows a failed save above Cancel and Save changes and focuses the first error', async () => {
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)
    await user.type(screen.getByLabelText('Offer withdrawal date'), '2026-10-21')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Offer withdrawal reason is required when there is an offer withdrawal date',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Offer not saved.')).toBeInTheDocument()
    expect(
      screen.getByText('Some fields have errors. Correct them and save again.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Offer withdrawal reason/ })).toHaveFocus(),
    )
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('says the offer was withdrawn on the save that adds the withdrawal', async () => {
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)
    await user.type(screen.getByLabelText('Offer withdrawal date'), formatBusinessIsoDate())
    await user.type(screen.getByRole('textbox', { name: /Offer withdrawal reason/ }), 'Sold')
    mockedFetchDetail.mockResolvedValue({
      ...staffOffer,
      offerWithdrawalDate: formatBusinessIsoDate(),
      withdrawReason: 'Sold',
    })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Offer withdrawn.')).toBeInTheDocument()
    expect(
      screen.getByText('Email notification sent to the applicant and the regional office.'),
    ).toBeInTheDocument()
  })

  it('says a later save of a withdrawn offer saved it', async () => {
    mockedFetchDetail.mockResolvedValue({
      ...staffOffer,
      offerWithdrawalDate: '2026-10-20',
      withdrawReason: 'Sold',
    })
    mockedSubmit.mockResolvedValue(savedResult({ emailRequired: false }))
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)
    await user.type(screen.getByRole('textbox', { name: /Pickup location/ }), ' North')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Offer saved.')).toBeInTheDocument()
    expect(screen.queryByText('Offer withdrawn.')).toBeNull()
  })

  it('announces a missing applicant email as a lasting alert', async () => {
    renderRecord({
      offerCreationNotice: {
        kind: 'warning',
        title: 'Offer saved.',
        message:
          'No email was sent. Let the applicant and the regional office know about your offer another way.',
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Offer saved.')
    expect(alert).toHaveTextContent(
      'No email was sent. Let the applicant and the regional office know about your offer another way.',
    )
    expect(within(alert).getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('saves an offer whose stored remarks are longer than the screen allows', async () => {
    mockedFetchDetail.mockResolvedValue({ ...staffOffer, offerRemark: 'R'.repeat(252) })
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)
    await user.type(screen.getByRole('textbox', { name: /Pickup location/ }), ' North')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1))
    expect(mockedSubmit.mock.calls[0][0].offerRemark).toBe('R'.repeat(252))
  })

  it('clears the last save result when the next save fails', async () => {
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)
    await user.type(screen.getByRole('textbox', { name: /Pickup location/ }), ' North')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Offer saved.')).toBeInTheDocument()

    await startEditing(user)
    await user.clear(screen.getByRole('textbox', { name: /Pickup location/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Offer not saved.')).toBeInTheDocument()
    expect(screen.queryByText('Offer saved.')).toBeNull()
  })

  it('lets an offering client withdraw only today', async () => {
    mockedFetchDetail.mockResolvedValue(clientOffer)
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)
    expect(screen.queryByText('TEAC review date')).toBeNull()
    expect(recordValue('Fair market value')).toBe('No')
    await user.type(screen.getByLabelText('Offer withdrawal date'), '2020-01-02')
    await user.type(screen.getByRole('textbox', { name: /Offer withdrawal reason/ }), 'Sold')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText("Offer withdrawal date must be today's date"),
    ).toBeInTheDocument()
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('shows an offering client the withdrawal as read-only after its deadline, with the reason', async () => {
    mockedFetchDetail.mockResolvedValue({ ...clientOffer, canEditWithdrawFields: false })
    const user = userEvent.setup()
    renderRecord()

    await startEditing(user)

    expect(
      screen.getByText(
        'The withdrawal deadline for this offer has passed. To withdraw it, contact your regional export office.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Offer withdrawal date')).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: /Offer withdrawal reason/ })).toHaveAttribute(
      'readonly',
    )
    expect(screen.getByLabelText('Offer withdrawal date')).not.toBeDisabled()
  })
})
