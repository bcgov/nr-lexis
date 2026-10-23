import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProvincialOfferCreatePage from '@/pages/ProvincialOfferCreate'
import { useAuth } from '@/context/auth/useAuth'
import {
  submitProvincialOfferCreate,
  type OfferSubmissionResult,
} from '@/service/create-submit-service'
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferClientData,
  fetchOfferPackageList,
  fetchOfferPackageVolume,
  validateOfferApplication,
} from '@/service/provincial-offer-create-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialOfferCreate: vi.fn(),
}))

vi.mock('@/service/provincial-offer-create-service', () => ({
  fetchOfferApplicationDetails: vi.fn(),
  fetchOfferApplicationVolume: vi.fn(),
  fetchOfferClientData: vi.fn(),
  fetchOfferPackageList: vi.fn(),
  fetchOfferPackageVolume: vi.fn(),
  validateOfferApplication: vi.fn(),
}))

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/offer-scale-detail-service', () => ({
  fetchOfferScaleDetails: vi.fn(),
}))

Element.prototype.scrollIntoView = vi.fn()

const mockedUseAuth = vi.mocked(useAuth)
const mockedSubmitProvincialOfferCreate = vi.mocked(submitProvincialOfferCreate)
const mockedFetchOfferApplicationDetails = vi.mocked(fetchOfferApplicationDetails)
const mockedFetchOfferApplicationVolume = vi.mocked(fetchOfferApplicationVolume)
const mockedFetchOfferClientData = vi.mocked(fetchOfferClientData)
const mockedFetchOfferPackageList = vi.mocked(fetchOfferPackageList)
const mockedFetchOfferPackageVolume = vi.mocked(fetchOfferPackageVolume)
const mockedValidateOfferApplication = vi.mocked(validateOfferApplication)

const NO_CLIENT_EMAIL_WARNING =
  'As no valid email address is attached to this client, no email notification will be sent and the Region will not be notified, consequently you must notify both the Applicant and the corresponding Regional office of your offer and/or offer withdrawal at this time.'
const EMAIL_QUEUED_MESSAGE =
  'The purchase offer was saved successfully. An email notification is queued for the applicant and the regional office.'

const createResult = (
  createdId: string,
  overrides: Partial<OfferSubmissionResult> = {},
): OfferSubmissionResult => ({
  success: true,
  message: EMAIL_QUEUED_MESSAGE,
  createdId,
  errors: [],
  warnings: [],
  emailRequired: true,
  applicantEmailFound: true,
  ...overrides,
})

const fieldValue = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

const scopedSubmitterAuth = () =>
  createTestAuthContext({
    capabilities: createTestCapabilities({
      principal: 'bceid\\buyer',
      roles: ['PROVINCIAL_SUBMITTER_00077881'],
      forestClientNumber: '77881',
    }),
  })

const approverAuth = () =>
  createTestAuthContext({
    capabilities: createTestCapabilities({
      principal: 'idir\\approver',
      roles: ['APPLICATION_APPROVER'],
    }),
  })

const SCOPED_QUERY =
  'applicationNumber=2001&packageNumber=PKG-9&pickupLocation=Yard&purchaseOfferAmount=250&offerVolume=50.0'
const APPROVER_QUERY = `${SCOPED_QUERY}&companyName=Example%20Lumber&contactName=Sample%20Contact`

const renderCreatePage = (query: string) =>
  render(
    <MemoryRouter initialEntries={[`/provincial/offers/create?${query}`]}>
      <Routes>
        <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Provincial offer create page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(approverAuth())
    mockedFetchOfferApplicationDetails.mockResolvedValue({
      success: true,
      speciesGradeCode: 'H/SA',
      advertisingDate: '2026-02-26',
      teacReviewDate: '2026-03-05',
      region: 'Cariboo Natural Resource Region',
    })
    mockedFetchOfferApplicationVolume.mockResolvedValue('100.0')
    mockedFetchOfferClientData.mockResolvedValue({
      clientNumber: '00077881',
      companyName: 'Authoritative Buyer Ltd.',
    })
    mockedFetchOfferPackageList.mockResolvedValue(['PKG-9'])
    mockedFetchOfferPackageVolume.mockResolvedValue('95.0')
    mockedValidateOfferApplication.mockResolvedValue({ isValid: true, errors: [] })
    mockedSubmitProvincialOfferCreate.mockResolvedValue(createResult('8090'))
  })

  describe('list date', () => {
    it('shows the application list date in ISO format', async () => {
      renderCreatePage(APPROVER_QUERY)

      await screen.findByLabelText('Contact name')
      expect(fieldValue('List date')).toHaveTextContent('2026-02-26')
    })
  })

  describe('submitter contact name', () => {
    it('prefills the contact name from the client legal first and middle names', async () => {
      mockedUseAuth.mockReturnValue(scopedSubmitterAuth())
      mockedFetchOfferClientData.mockResolvedValue({
        clientNumber: '00077881',
        companyName: 'Buyer, Jane Quinn',
        legalContactName: 'Jane Quinn',
      })

      renderCreatePage(SCOPED_QUERY)

      await waitFor(() => expect(fieldValue('Company')).toHaveTextContent('Buyer, Jane Quinn'))
      expect(screen.queryByLabelText('Company')).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('Contact name')).toHaveValue('Jane Quinn'))
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            offeringClientNumber: '00077881',
            companyName: 'Buyer, Jane Quinn',
            contactName: 'Jane Quinn',
          }),
        )
      })
    })

    it('lets the submitter replace the prefilled contact name', async () => {
      mockedUseAuth.mockReturnValue(scopedSubmitterAuth())
      mockedFetchOfferClientData.mockResolvedValue({
        clientNumber: '00077881',
        companyName: 'Buyer, Jane Quinn',
        legalContactName: 'Jane Quinn',
      })

      renderCreatePage(SCOPED_QUERY)

      await waitFor(() => expect(screen.getByLabelText('Contact name')).toHaveValue('Jane Quinn'))
      await userEvent.clear(screen.getByLabelText('Contact name'))
      await userEvent.type(screen.getByLabelText('Contact name'), 'Sam Buyer')
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
          expect.objectContaining({ contactName: 'Sam Buyer' }),
        )
      })
    })

    it('leaves the contact name blank when the client has no legal names', async () => {
      mockedUseAuth.mockReturnValue(scopedSubmitterAuth())

      renderCreatePage(SCOPED_QUERY)

      await waitFor(() =>
        expect(fieldValue('Company')).toHaveTextContent('Authoritative Buyer Ltd.'),
      )
      expect(screen.getByLabelText('Contact name')).toHaveValue('')
    })

    it('keeps a contact name typed before the client lookup finishes', async () => {
      mockedUseAuth.mockReturnValue(scopedSubmitterAuth())
      let resolveClient: (value: Awaited<ReturnType<typeof fetchOfferClientData>>) => void = () =>
        undefined
      mockedFetchOfferClientData.mockReturnValue(
        new Promise((resolve) => {
          resolveClient = resolve
        }),
      )

      renderCreatePage(SCOPED_QUERY)

      const contactName = await screen.findByLabelText('Contact name')
      await userEvent.type(contactName, 'Typed Contact')
      resolveClient({
        clientNumber: '00077881',
        companyName: 'Buyer, Jane Quinn',
        legalContactName: 'Jane Quinn',
      })

      await waitFor(() => expect(fieldValue('Company')).toHaveTextContent('Buyer, Jane Quinn'))
      expect(contactName).toHaveValue('Typed Contact')
    })
  })

  describe('approver TEAC review date', () => {
    it('fills the schedule date once and submits an empty date after the approver clears it', async () => {
      renderCreatePage(APPROVER_QUERY)

      const teacReviewDate = await screen.findByLabelText('TEAC review date')
      await waitFor(() => expect(teacReviewDate).toHaveValue('2026-03-05'))

      await userEvent.clear(teacReviewDate)
      expect(teacReviewDate).toHaveValue('')
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
          expect.objectContaining({ teacReviewDate: '' }),
        )
      })
    })

    it('submits the schedule date when the approver leaves it alone', async () => {
      renderCreatePage(APPROVER_QUERY)

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-03-05'),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
          expect.objectContaining({ teacReviewDate: '2026-03-05' }),
        )
      })
    })

    it('keeps the date from the link instead of the schedule date', async () => {
      renderCreatePage(`${APPROVER_QUERY}&teacReviewDate=2026-06-01`)

      expect(await screen.findByLabelText('TEAC review date')).toHaveValue('2026-06-01')
      await waitFor(() => expect(fieldValue('Species/grade')).toHaveTextContent('H/SA'))
    })

    it('fills the new schedule date when the application changes and the date was not edited', async () => {
      mockedFetchOfferApplicationDetails.mockImplementation(async (applicationNumber) => ({
        success: true,
        speciesGradeCode: 'H/SA',
        advertisingDate: '2026-02-26',
        teacReviewDate: applicationNumber === '2002' ? '2026-04-01' : '2026-03-05',
        region: 'Cariboo Natural Resource Region',
      }))
      renderCreatePage(APPROVER_QUERY)

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-03-05'),
      )
      const applicationNumber = screen.getByLabelText(/Application number/)
      await userEvent.clear(applicationNumber)
      await userEvent.type(applicationNumber, '2002')

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-04-01'),
      )
    })

    it('keeps a date the approver typed when the application changes', async () => {
      mockedFetchOfferApplicationDetails.mockImplementation(async (applicationNumber) => ({
        success: true,
        speciesGradeCode: applicationNumber === '2002' ? 'F/LUM' : 'H/SA',
        advertisingDate: '2026-02-26',
        teacReviewDate: applicationNumber === '2002' ? '2026-04-01' : '2026-03-05',
        region: 'Cariboo Natural Resource Region',
      }))
      renderCreatePage(APPROVER_QUERY)

      const teacReviewDate = await screen.findByLabelText('TEAC review date')
      await waitFor(() => expect(teacReviewDate).toHaveValue('2026-03-05'))
      await userEvent.clear(teacReviewDate)
      await userEvent.type(teacReviewDate, '2026-05-05')
      const applicationNumber = screen.getByLabelText(/Application number/)
      await userEvent.clear(applicationNumber)
      await userEvent.type(applicationNumber, '2002')

      await waitFor(() => expect(fieldValue('Species/grade')).toHaveTextContent('F/LUM'))
      expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-05-05')
    })
  })

  describe('save notice', () => {
    it('carries a success notice when the applicant and the regional office were emailed', async () => {
      renderCreatePage(APPROVER_QUERY)

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-03-05'),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8090', {
          state: {
            offerCreationNotice: {
              kind: 'success',
              title: 'Offer saved.',
              message: 'Email notification sent to the applicant and the regional office.',
            },
          },
        })
      })
    })

    it('carries a warning to notify the regional office when the save raised warnings', async () => {
      mockedSubmitProvincialOfferCreate.mockResolvedValue(
        createResult('8090', {
          message: 'The purchase offer was saved successfully.',
          warnings: [NO_CLIENT_EMAIL_WARNING],
        }),
      )
      renderCreatePage(APPROVER_QUERY)

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-03-05'),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8090', {
          state: {
            offerCreationNotice: {
              kind: 'warning',
              title: 'Offer saved.',
              message:
                'Email notification sent to the applicant. Notify the regional office another way.',
            },
          },
        })
      })
    })

    it('carries a warning that no email was sent when the applicant has no email address', async () => {
      mockedSubmitProvincialOfferCreate.mockResolvedValue(
        createResult('8090', { applicantEmailFound: false }),
      )
      renderCreatePage(APPROVER_QUERY)

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-03-05'),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8090', {
          state: {
            offerCreationNotice: {
              kind: 'warning',
              title: 'Offer saved.',
              message:
                'No email was sent. Let the applicant and the regional office know about your offer another way.',
            },
          },
        })
      })
    })

    it('carries a notice without a message when no email was required', async () => {
      mockedSubmitProvincialOfferCreate.mockResolvedValue(
        createResult('8090', { emailRequired: false, applicantEmailFound: false }),
      )
      renderCreatePage(APPROVER_QUERY)

      await waitFor(() =>
        expect(screen.getByLabelText('TEAC review date')).toHaveValue('2026-03-05'),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save offer' }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8090', {
          state: {
            offerCreationNotice: { kind: 'success', title: 'Offer saved.', message: '' },
          },
        })
      })
    })
  })
})
