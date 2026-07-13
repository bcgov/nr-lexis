import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
  offerVolume: 99.99,
  region: '12',
  canEditScheduleDates: true,
  canEditOfferRemarks: true,
  canEditOfferDetails: true,
  canEditWithdrawFields: true,
  locked: false,
  lockedBy: null,
  lockMessage: null,
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
        <Route path="/federal/application/:applicationNumber" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Provincial Offer Detail Actions', () => {
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

  it('renders one semantic page heading and exposes editing as a page action', async () => {
    renderPage()

    const heading = await screen.findByRole('heading', {
      name: 'Offer 81001',
      level: 1,
    })
    const pageHeader = heading.closest('header')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(pageHeader).toBeTruthy()
    expect(
      within(pageHeader as HTMLElement).getByText('Check and manage this provincial offer'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Provincial offer search' })).toHaveAttribute(
      'href',
      '/provincial/offers',
    )
    expect(
      within(pageHeader as HTMLElement).getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument()
  })

  it('updates editable legacy offer fields from the detail page', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const companyInput = screen.getByLabelText('Company')
    expect(companyInput).toHaveAttribute('readonly')

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
          companyName: 'Original Buyer',
          purchaseOfferAmount: '13000',
          pickupLocation: 'Port Moody',
        }),
      )
    })
    expect(await screen.findByText('Offer saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('submits an explicitly cleared offer condition', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.clear(screen.getByLabelText('Offer conditions / remarks'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          offerNumber: '81001',
          offerCondition: '',
        }),
      )
    })
  })

  it('submits an explicitly cleared offer volume', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.clear(screen.getByLabelText('Offer volume (m³)'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          offerNumber: '81001',
          offerVolume: '',
        }),
      )
    })
  })

  it('keeps a null Oracle offer volume blank during an unrelated update', async () => {
    mockedFetchProvincialOfferDetail.mockResolvedValue({
      ...offerDetail,
      offerVolume: null,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Offer volume (m³)')).toHaveValue('')
    const amountInput = screen.getByLabelText('Offer amount ($/m³)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '13000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOfferAmount: '13000',
          offerVolume: '',
        }),
      )
    })
  })

  it('preserves the form when the backend rejects a stale offer lock', async () => {
    mockedSubmitProvincialOfferUpdate.mockResolvedValue({
      success: false,
      message:
        'The offer edit lock has expired or is held by another user. Close and re-open the offer before saving again.',
      errors: [],
      warnings: [],
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const amountInput = screen.getByLabelText('Offer amount ($/m³)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '13000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(amountInput).toHaveValue('13000')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('does not expose edit controls when the offer detail has no edit permissions', async () => {
    mockedFetchProvincialOfferDetail.mockResolvedValue({
      ...offerDetail,
      canEditScheduleDates: false,
      canEditOfferRemarks: false,
      canEditOfferDetails: false,
      canEditWithdrawFields: false,
    })

    renderPage()

    expect(await screen.findByDisplayValue('Original Buyer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Offer remarks')).not.toBeInTheDocument()
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('fails closed and explains when another user holds the offer lock', async () => {
    mockedFetchProvincialOfferDetail.mockResolvedValue({
      ...offerDetail,
      locked: true,
      lockedBy: 'Reviewer One',
      lockMessage: 'This offer is currently locked for editing by Reviewer One.',
    })

    renderPage()

    expect(await screen.findByText('Offer locked')).toBeInTheDocument()
    expect(
      screen.getByText('This offer is currently locked for editing by Reviewer One.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('releases the offer lock as best-effort cleanup on exit', async () => {
    const rendered = renderPage()
    await screen.findByRole('heading', { name: 'Offer 81001' })

    rendered.unmount()

    expect(mockedReleaseOfferEditLock).toHaveBeenCalledWith('81001')
  })

  it('guards unload only after an offer field differs from its persisted baseline', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    const amountInput = screen.getByLabelText('Offer amount ($/m³)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '13000')
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const cancelledUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cancelledUnload)
    expect(cancelledUnload.defaultPrevented).toBe(false)
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

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/provincial/application/1000456?packageFilter=PKG-903',
    )
  })

  it('opens a federal parent application in the federal detail journey', async () => {
    mockedFetchProvincialOfferDetail.mockResolvedValue({
      ...offerDetail,
      exportJurisdictionCode: 'f',
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/federal/application/1000456?packageFilter=PKG-903',
    )
  })

  it('blocks offer amounts outside the Oracle NUMBER(7,2) limit', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const amountInput = screen.getByLabelText('Offer amount ($/m³)')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getAllByText('Offer amount must be 99999.99 or less.').length).toBeGreaterThan(
        0,
      )
    })
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('uses the authoritative Oracle text column limits', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Pickup location')).toHaveAttribute('maxlength', '250')
    expect(screen.getByLabelText('Offer conditions / remarks')).toHaveAttribute('maxlength', '254')
    expect(screen.getByLabelText('Offer withdrawal reason')).toHaveAttribute('maxlength', '254')
    expect(screen.getByLabelText('Offer remarks')).toHaveAttribute('maxlength', '254')
    expect(screen.getByLabelText('Company')).toHaveAttribute('maxlength', '52')
    expect(screen.getByLabelText('Contact name')).toHaveAttribute('maxlength', '120')
  })

  it('blocks excess numeric scale before submitting an offer update', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const volumeInput = screen.getByLabelText('Offer volume (m³)')
    await userEvent.clear(volumeInput)
    await userEvent.type(volumeInput, '1.234')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      screen.getAllByText('Offer volume must be a number with up to two decimal places.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitProvincialOfferUpdate).not.toHaveBeenCalled()
  })

  it('only enables legacy offer detail fields for offering-client edits', async () => {
    mockedFetchProvincialOfferDetail.mockResolvedValue({
      ...offerDetail,
      canEditScheduleDates: false,
      canEditOfferRemarks: false,
      canEditOfferDetails: true,
      canEditWithdrawFields: false,
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Offer 81001' })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Offer amount ($/m³)')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Pickup location')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Company')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Offer withdrawal reason')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Offer remarks')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Fair market value' })).toBeDisabled()
  })
})
