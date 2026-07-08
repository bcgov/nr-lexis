import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import ProvincialOfferDetailsPage from '@/pages/ProvincialOfferDetails'
import { fetchProvincialOfferDetail } from '@/service/lexis-detail-service'
import { submitProvincialOfferUpdate } from '@/service/create-submit-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialOfferDetail: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialOfferUpdate: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialOfferDetail = vi.mocked(fetchProvincialOfferDetail)
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
  offerVolume: 99.99,
  region: '12',
}

const LocationDisplay = () => {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/offers/81001']}>
      <Routes>
        <Route path="/provincial/offers/:offerNumber" element={<ProvincialOfferDetailsPage />} />
        <Route path="/provincial/application/:applicationNumber" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Provincial Offer Detail Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialOfferDetail.mockResolvedValue(offerDetail)
    mockedSubmitProvincialOfferUpdate.mockResolvedValue({
      success: true,
      message: 'The purchase offer was updated successfully.',
      createdId: '81001',
      errors: [],
      warnings: [],
    })
  })

  it('updates editable legacy offer fields from the detail page', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Provincial offer details' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const companyInput = screen.getByLabelText('Company')
    await userEvent.clear(companyInput)
    await userEvent.type(companyInput, 'Updated Buyer')

    const amountInput = screen.getByLabelText('Offer amount ($/m³)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '13000')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          offerNumber: '81001',
          applicationNumber: '1000456',
          packageNumber: 'PKG-903',
          companyName: 'Updated Buyer',
          purchaseOfferAmount: '13000',
          pickupLocation: 'Port Moody',
        }),
      )
    })
    expect(await screen.findByText('Offer saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('does not expose edit controls without createOffer access', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action !== 'createOffer' }),
    )

    renderPage()

    expect(await screen.findByDisplayValue('Original Buyer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('shows the legacy application or package volume on the offer detail page', async () => {
    renderPage()

    expect(await screen.findByLabelText('Application/package volume (m³)')).toHaveDisplayValue(
      '45.5',
    )
    expect(screen.getByLabelText('Species/grade')).toHaveDisplayValue('FI/HE/LUM')
  })

  it('opens the parent application scale detail filtered to the offer package', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Provincial offer details' })
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/provincial/application/1000456?packageFilter=PKG-903',
    )
  })

  it('blocks offer numeric values outside legacy limits', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Provincial offer details' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const amountInput = screen.getByLabelText('Offer amount ($/m³)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '10000000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        screen.getAllByText('Offer amount must be 9999999.99 or less.').length,
      ).toBeGreaterThan(0)
    })
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('keeps legacy text area character caps', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Provincial offer details' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Pickup location')).toHaveAttribute('maxlength', '250')
    expect(screen.getByLabelText('Offer conditions / remarks')).toHaveAttribute('maxlength', '250')
    expect(screen.getByLabelText('Offer withdrawal reason')).toHaveAttribute('maxlength', '250')
    expect(screen.getByLabelText('Offer remarks')).toHaveAttribute('maxlength', '250')
  })
})
