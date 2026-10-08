import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import ProvincialOfferDetailsPage from '@/pages/ProvincialOfferDetails'
import { fetchProvincialOfferDetail, releaseOfferEditLock } from '@/service/lexis-detail-service'
import { submitProvincialOfferUpdate } from '@/service/create-submit-service'
import { createTestAuthContext } from '@/test-utils/auth'

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
  fetchOfferScaleDetails: vi.fn().mockResolvedValue([]),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialOfferDetail = vi.mocked(fetchProvincialOfferDetail)
const mockedReleaseOfferEditLock = vi.mocked(releaseOfferEditLock)
const mockedSubmitProvincialOfferUpdate = vi.mocked(submitProvincialOfferUpdate)

const offerDetail: ProvincialOfferDetail = {
  offerNumber: 81001,
  applicationNumber: 1000456,
  packageNumber: 'PKG-903',
  companyName: 'Original Buyer',
  contactName: 'Buyer Contact',
  purchaseOfferAmount: 12500,
  purchaseOfferDate: '2026-03-02',
  offerWithdrawalDate: null,
  teacReviewDate: '2026-03-05',
  approvalIndicator: 'N',
  validOfferIndicator: 'Y',
  fairOfferIndicator: 'N',
  offerRemark: 'Original remark',
  withdrawReason: null,
  exportJurisdictionCode: 'P',
  manufacturingFacilityInfo: 'Mill details',
  offeringClientNumber: '00077881',
  pickupLocation: 'Port Moody',
  offerCondition: 'Original conditions',
  advertisingDate: '2026-02-25',
  offerEndDate: '2026-03-18',
  packageVolume: 45.5,
  speciesGradeCode: 'FI/HE/LUM',
  offerVolume: 40,
  region: '12',
  author: 'idir\\offer-author',
  canEditScheduleDates: true,
  canEditOfferRemarks: true,
  canEditOfferDetails: true,
  canEditWithdrawFields: true,
  locked: false,
  lockedBy: null,
  lockMessage: null,
}

const renderPage = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/provincial/offers/:offerNumber',
        element: (
          <>
            <ProvincialOfferDetailsPage />
            <Link to="/elsewhere">Leave offer</Link>
          </>
        ),
      },
      { path: '/elsewhere', element: <h1>Elsewhere</h1> },
    ],
    { initialEntries: ['/provincial/offers/81001'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const editButton = () => screen.getByRole('button', { name: 'Edit' })

const startEditing = async () => {
  await screen.findByRole('heading', { name: 'Offer 81001', level: 1 })
  await userEvent.click(editButton())
  await waitFor(() => expect(screen.getByLabelText('Offer volume (m³)')).toHaveFocus())
}

const replaceValue = async (label: string, value: string) => {
  const field = screen.getByLabelText(label)
  await userEvent.clear(field)
  if (value) await userEvent.type(field, value)
}

describe('Provincial offer detail form behaviour', () => {
  it('closes an unchanged offer edit with no request or notification', async () => {
    renderPage()
    await startEditing()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(editButton()).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
    expect(
      screen.queryByText('The purchase offer was updated successfully.'),
    ).not.toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialOfferDetail.mockResolvedValue(offerDetail)
    mockedReleaseOfferEditLock.mockResolvedValue(undefined)
    mockedSubmitProvincialOfferUpdate.mockResolvedValue({
      success: true,
      message: 'The purchase offer was updated successfully.',
      createdId: '81001',
      errors: [],
      warnings: [],
    })
  })

  it('shows invalid fields on Save, focuses the first, and clears each once changed', async () => {
    renderPage()
    await startEditing()
    await replaceValue('Offer amount ($/m³)', '100000')
    await replaceValue('Pickup location', '')

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    await userEvent.click(save)

    const amount = screen.getByLabelText('Offer amount ($/m³)')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Offer amount must be 99999.99 or less')).toBeInTheDocument()
    expect(screen.getByLabelText('Pickup location')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Pickup location is required')).toBeInTheDocument()
    expect(screen.queryByText('Validation error')).not.toBeInTheDocument()
    await waitFor(() => expect(amount).toHaveFocus())
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()

    await replaceValue('Offer amount ($/m³)', '13000')
    expect(amount).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Offer amount must be 99999.99 or less')).not.toBeInTheDocument()
    expect(screen.getByText('Pickup location is required')).toBeInTheDocument()
  })

  it('keeps an error on a field the user cannot edit in the form notification', async () => {
    mockedFetchProvincialOfferDetail.mockResolvedValue({ ...offerDetail, companyName: 'Société' })
    renderPage()
    await startEditing()
    await replaceValue('Offer amount ($/m³)', '13000')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Validation error')).toBeInTheDocument()
    expect(screen.getByLabelText('Company')).not.toHaveAttribute('aria-invalid', 'true')
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('shows a server message that names a field on that field', async () => {
    mockedSubmitProvincialOfferUpdate.mockResolvedValue({
      success: false,
      message: '',
      errors: ['Offer volume cannot exceed the application/package volume.'],
      warnings: [],
    })
    renderPage()
    await startEditing()
    await replaceValue('Offer remarks', 'Updated remark')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const volume = screen.getByLabelText('Offer volume (m³)')
    await waitFor(() => expect(volume).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText('Offer volume cannot exceed the application/package volume'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument()
    await waitFor(() => expect(volume).toHaveFocus())
  })

  it('keeps a server message without a field in the result notification', async () => {
    mockedSubmitProvincialOfferUpdate.mockResolvedValue({
      success: false,
      message: '',
      errors: ['A purchase offer cannot be moved to a different application.'],
      warnings: [],
    })
    renderPage()
    await startEditing()
    await replaceValue('Offer remarks', 'Updated remark')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(
      screen.getByText('A purchase offer cannot be moved to a different application.'),
    ).toBeInTheDocument()
  })

  it('returns focus to Edit after a save', async () => {
    renderPage()
    await startEditing()
    await replaceValue('Offer remarks', 'Updated remark')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Offer saved')).toBeInTheDocument()
    await waitFor(() => expect(editButton()).toHaveFocus())
  })

  it('cancels without asking when nothing changed and returns focus to Edit', async () => {
    renderPage()
    await startEditing()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(editButton()).toHaveFocus())
  })

  it('asks before cancelling changes', async () => {
    renderPage()
    await startEditing()
    await replaceValue('Offer remarks', 'Updated remark')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(screen.getByText('Your changes will be lost.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Offer remarks')).toHaveValue('Updated remark')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(editButton()).toHaveFocus())
    expect(screen.getByLabelText('Offer remarks')).toHaveValue('Original remark')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('asks before leaving the offer with changes', async () => {
    const router = renderPage()
    await startEditing()
    await replaceValue('Offer remarks', 'Updated remark')

    await userEvent.click(screen.getByRole('link', { name: 'Leave offer' }))

    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/elsewhere')
  })

  it('leaves without asking when nothing changed', async () => {
    renderPage()
    await startEditing()

    await userEvent.click(screen.getByRole('link', { name: 'Leave offer' }))

    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })
})
