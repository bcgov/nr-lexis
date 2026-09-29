import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import type { ProvincialExemptionSearchResponse } from '@/interfaces/ProvincialExemptionSearch'
import ProvincialExemptionPage from '@/pages/ProvincialExemption'
import {
  countProvincialExemptions,
  searchProvincialExemptions,
} from '@/service/provincial-exemption-search-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import {
  approveExemptions,
  fetchExemptionApprovalRecipients,
  sendExemptionApprovalNotifications,
} from '@/service/provincial-exemption-detail-service'
import { fetchCurrentExemptionRecordVersion } from '@/service/record-version-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-search-service', () => ({
  countProvincialExemptions: vi.fn(),
  searchProvincialExemptions: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-detail-service', () => ({
  approveExemptions: vi.fn(),
  fetchExemptionApprovalRecipients: vi.fn(),
  sendExemptionApprovalNotifications: vi.fn(),
}))

vi.mock('@/service/record-version-service', () => ({
  fetchCurrentExemptionRecordVersion: vi.fn(),
}))

vi.mock('@/components/ForestClientComboBox', () => ({
  default: ({
    id,
    labelText,
    value,
    onChange,
  }: {
    id: string
    labelText: string
    value: string
    onChange: (value: string) => void
  }) => (
    <div>
      <label htmlFor={id}>{labelText}</label>
      <input id={id} readOnly value={value} />
      <button
        type="button"
        onClick={() => onChange(labelText.startsWith('Owner') ? '00054321' : '00012345')}
      >
        Select {labelText}
      </button>
    </div>
  ),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
const mockedSearchProvincialExemptions = vi.mocked(searchProvincialExemptions)
const mockedCountProvincialExemptions = vi.mocked(countProvincialExemptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedApproveExemptions = vi.mocked(approveExemptions)
const mockedSendExemptionApprovalNotifications = vi.mocked(sendExemptionApprovalNotifications)
const mockedFetchCurrentExemptionRecordVersion = vi.mocked(fetchCurrentExemptionRecordVersion)

const exemptionSearchResponse = (
  content: ProvincialExemptionSearchResponse['content'],
): ProvincialExemptionSearchResponse => ({
  content,
  page: {
    number: 0,
    size: 10,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
  },
})

const selectableExemption = (
  exemptionNumber: string,
): ProvincialExemptionSearchResponse['content'][number] => ({
  exemptionNumber,
  type: 'Ministerial',
  typeCode: 'M',
  status: 'New',
  statusCode: 'NEW',
  applicantClientNumber: 'TEST0001',
  ownerClientNumber: 'TEST0002',
  approvedVolume: 100,
  balanceRemaining: 100,
  listingDate: '2026-01-10',
  expiryDate: '2026-12-31',
  region: '11',
  canApprove: true,
  isLocked: false,
  canViewExemption: true,
})

const renderPage = (
  path = '/provincial/exemption?region=11&page=1&pageSize=10&sortField=exemptionNumber&sortDirection=desc',
) => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/provincial/exemption" element={<ProvincialExemptionPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Approval results list each exemption, and an item's text follows its linked number.
const resultNotification = (title: string) =>
  screen.getByText(title).closest('.app-inline-notification') as HTMLElement
const resultItems = (title: string) =>
  within(resultNotification(title))
    .getAllByRole('listitem')
    .map((item) => item.textContent)
const UNCONFIRMED_ITEM =
  ': The approval could not be confirmed and no email was sent. Check its current status before approving again.'

const renderDataRouter = () => {
  const router = createMemoryRouter(
    [
      { path: '/provincial/exemption', element: <ProvincialExemptionPage /> },
      { path: '/elsewhere', element: <h1>Elsewhere</h1> },
    ],
    { initialEntries: ['/provincial/exemption?region=11'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('Provincial Exemption Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [
        { value: 'NULL', label: 'None' },
        { value: 'SECTION_1', label: 'Section 1' },
      ],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    })
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        {
          exemptionNumber: 'EX-1001',
          type: 'Section 1',
          typeCode: 'SECTION_1',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          approvedVolume: 100,
          balanceRemaining: 100,
          listingDate: '2026-01-10',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: true,
          isLocked: false,
          canViewExemption: true,
        },
        {
          exemptionNumber: 'EX-2002',
          type: 'Section 2',
          typeCode: 'SECTION_2',
          status: 'Approved',
          statusCode: 'APPROVED',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          approvedVolume: 200,
          balanceRemaining: 10,
          listingDate: '2026-01-11',
          expiryDate: '2026-12-31',
          region: '12',
          canApprove: false,
          isLocked: true,
          canViewExemption: true,
        },
      ]),
    )
    mockedApproveExemptions.mockResolvedValue({
      success: true,
      valid: true,
      sendGrid: [['EX-1001', 'client@example.test']],
      errorMessage: '',
      errors: [],
      warnings: [],
    })
    mockedFetchCurrentExemptionRecordVersion.mockImplementation((exemptionNumber) =>
      Promise.resolve(`exemption-${exemptionNumber}-version`),
    )
    vi.mocked(fetchExemptionApprovalRecipients).mockImplementation(async (numbers) =>
      numbers.map((exemptionNumber) => ({
        exemptionNumber,
        ownerEmail:
          exemptionNumber === 'TEST-EX-001'
            ? 'first@example.test'
            : exemptionNumber === 'TEST-EX-002'
              ? 'second@example.test'
              : 'client@example.test',
        agentEmail: '',
        agentApplicable: false,
        sendable: true,
        message: '',
      })),
    )
    mockedSendExemptionApprovalNotifications.mockImplementation(async (recipients) => ({
      outcomes: recipients.map(({ exemptionNumber }) => ({
        exemptionNumber,
        queued: true,
        message: 'Queued',
      })),
    }))
  })

  it('submits and restores None as literal NULL, while clearing restores All types', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    const page = renderPage()
    await screen.findByText('EX-1001')
    expect(mockedFetchProvincialExemptionOptions).toHaveBeenCalledWith(true)

    const exemptionType = screen.getByRole('combobox', { name: 'Exemption type' })
    expect(exemptionType).toHaveValue('')
    expect(exemptionType).toHaveAttribute('placeholder', 'All types')
    await userEvent.click(exemptionType)
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ exemptionTypeCode: 'NULL' }),
        }),
        expect.any(Object),
      )
    })
    const storageKey = 'lexis.search-state.v1.provincial-exemptions'
    expect(
      new URLSearchParams(sessionStorage.getItem(storageKey) ?? '').get('exemptionTypeCode'),
    ).toBe('NULL')

    page.unmount()
    mockedSearchProvincialExemptions.mockClear()
    renderPage('/provincial/exemption')
    await screen.findByText('EX-1001')
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('None')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ exemptionTypeCode: 'NULL' }) }),
      expect.any(Object),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('')
    expect(
      new URLSearchParams(sessionStorage.getItem(storageKey) ?? '').has('exemptionTypeCode'),
    ).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ exemptionTypeCode: '' }) }),
        expect.any(Object),
      )
    })
  }, 20_000)

  it('requires explicit certification before approving selected exemptions', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === 'approveExemption' || action === '/createExemption',
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    const approveButton = screen.getByRole('button', { name: 'Approve selected exemptions' })
    expect(approveButton).toBeDisabled()
    expect(approveButton.closest('.legacy-search-table-toolbar__actions')).not.toBeNull()

    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeEnabled()
    const lockedCheckbox = screen.getByRole('checkbox', { name: 'Select EX-2002' })
    expect(lockedCheckbox).toBeDisabled()
    expect(screen.getByText('Locked')).toBeInTheDocument()

    const lockedCheckboxTooltipTrigger = lockedCheckbox.closest(
      '.disabled-button-tooltip',
    ) as HTMLElement
    expect(lockedCheckboxTooltipTrigger).toBeTruthy()

    await userEvent.hover(lockedCheckboxTooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This exemption is currently locked and cannot be approved.',
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    expect(screen.getByRole('button', { name: 'Approve selected exemptions' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const firstDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    expect(
      within(firstDialog).getByRole('heading', { name: 'Approve exemption EX-1001' }),
    ).toBeInTheDocument()
    const firstCertification = within(firstDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved',
    })
    const firstConfirm = within(firstDialog).getByRole('button', { name: /Approve and send email/ })
    expect(firstCertification).not.toBeChecked()
    await within(firstDialog).findByText('client@example.test')
    expect(firstConfirm).toBeEnabled()
    expect(firstConfirm).toHaveClass('cds--btn--primary')
    expect(firstConfirm).not.toHaveClass('cds--btn--danger')
    expect(firstConfirm.parentElement).toHaveClass('lexis-confirmation-modal__actions')
    await userEvent.click(firstConfirm)
    expect(within(firstDialog).getByText('Certification is required')).toBeVisible()
    expect(mockedApproveExemptions).not.toHaveBeenCalled()

    await userEvent.click(firstCertification)
    expect(within(firstDialog).queryByText('Certification is required')).not.toBeInTheDocument()
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /^Approve (exemption|[0-9])/ }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const reopenedDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    const reopenedCertification = within(reopenedDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved',
    })
    const reopenedConfirm = within(reopenedDialog).getByRole('button', {
      name: /Approve and send email/,
    })
    expect(reopenedCertification).not.toBeChecked()
    expect(within(reopenedDialog).queryByText('Certification is required')).not.toBeInTheDocument()
    await userEvent.click(reopenedCertification)
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: 'Edit recipients' }))
    const recipient = within(reopenedDialog).getByLabelText('Owner email')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'updated@example.test')
    await userEvent.click(reopenedConfirm)
    await waitFor(() =>
      expect(mockedApproveExemptions).toHaveBeenCalledWith(
        ['EX-1001'],
        'exemption-EX-1001-version',
      ),
    )
    await waitFor(() =>
      expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledWith([
        { exemptionNumber: 'EX-1001', ownerEmail: 'updated@example.test', agentEmail: '' },
      ]),
    )
    expect(await screen.findByText('Exemption approved and now Active.')).toBeInTheDocument()
    expect(
      screen.getByText('Approval email sent to the owner (updated@example.test).'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const postApprovalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    expect(
      within(postApprovalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    ).not.toBeChecked()
    await userEvent.click(within(postApprovalDialog).getByRole('button', { name: 'Cancel' }))

    const addExemptionAction = screen.getByRole('link', { name: 'Add exemption' })
    expect(addExemptionAction).toHaveAttribute('href', '/provincial/exemption/create')
    expect(addExemptionAction).toHaveClass('cds--btn--primary')
    expect(addExemptionAction.closest('.lexis-page-header__actions')).not.toBeNull()
  }, 20_000)

  it('preserves selected exemptions while paging through approval results', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    const rows: ProvincialExemptionSearchResponse['content'] = [
      {
        exemptionNumber: 'EX-PAGE-1',
        type: 'Ministerial',
        typeCode: 'M',
        status: 'New',
        statusCode: 'NEW',
        applicantClientNumber: '11111111',
        ownerClientNumber: '22222222',
        approvedVolume: 100,
        balanceRemaining: 100,
        listingDate: '2026-01-10',
        expiryDate: '2026-12-31',
        region: '11',
        canApprove: true,
        isLocked: false,
        canViewExemption: true,
      },
      {
        exemptionNumber: 'EX-PAGE-2',
        type: 'Ministerial',
        typeCode: 'M',
        status: 'New',
        statusCode: 'NEW',
        applicantClientNumber: '33333333',
        ownerClientNumber: '44444444',
        approvedVolume: 200,
        balanceRemaining: 200,
        listingDate: '2026-01-11',
        expiryDate: '2026-12-31',
        region: '11',
        canApprove: true,
        isLocked: false,
        canViewExemption: true,
      },
    ]
    mockedSearchProvincialExemptions.mockImplementation(async (request) => ({
      content: [rows[request.page]],
      page: {
        number: request.page,
        size: request.pageSize,
        totalElements: 20,
        totalPages: 2,
      },
    }))

    renderPage()
    await screen.findByText('EX-PAGE-1')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-PAGE-1' }))

    await userEvent.click(screen.getByLabelText('Next page'))
    await screen.findByText('EX-PAGE-2')
    expect(screen.getByRole('button', { name: 'Approve selected exemptions' })).toBeEnabled()

    await userEvent.click(screen.getByLabelText('Previous page'))
    await screen.findByText('EX-PAGE-1')
    expect(screen.getByRole('checkbox', { name: 'Select EX-PAGE-1' })).toBeChecked()
  })

  it('blocks invalid approval recipients and keeps a skipped notification separate from approval', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )

    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))

    const approvalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(
      await within(approvalDialog).findByRole('button', { name: 'Edit recipients' }),
    )
    const recipient = within(approvalDialog).getByLabelText('Owner email')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'not-an-email')
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: 'Approve and send email' }),
    )
    expect(within(approvalDialog).getByText('Enter one valid email address.')).toBeVisible()
    expect(mockedApproveExemptions).not.toHaveBeenCalled()
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', { name: 'Send approval email' }),
    )
    await userEvent.click(within(approvalDialog).getByRole('button', { name: 'Approve exemption' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /^Approve exemption/ })).not.toBeInTheDocument(),
    )
    expect(mockedApproveExemptions).toHaveBeenCalledWith(['EX-1001'], 'exemption-EX-1001-version')
    expect(mockedSendExemptionApprovalNotifications).not.toHaveBeenCalled()
    expect(screen.getByText('Exemption approved and now Active.')).toBeInTheDocument()
    expect(screen.getByText('No approval email was sent.')).toBeInTheDocument()
  }, 20_000)

  it('retains an approval refresh warning after successfully queuing its notification', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-1001' })
    await within(dialog).findByRole('button', { name: 'Edit recipients' })
    mockedSearchProvincialExemptions.mockRejectedValueOnce(new Error('Refresh failed'))
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and send email' }))
    expect(
      await screen.findByText(
        'Approval email sent to the owner (client@example.test). Refresh the page to see the latest status.',
      ),
    ).toBeVisible()
    expect(resultNotification('Exemption approved and now Active.')).toHaveClass(
      'cds--inline-notification--warning',
    )
    expect(mockedApproveExemptions).toHaveBeenCalledTimes(1)
    expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a lost approval response', Object.assign(new Error('Network Error'), { request: {} })],
    // A gateway error can follow a committed approval.
    ['a gateway error', { response: { status: 502, data: {} } }],
  ])('reports %s as unconfirmed rather than failed', async (_, failure) => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedApproveExemptions.mockRejectedValueOnce(failure)

    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const approvalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await within(approvalDialog).findByText('client@example.test')
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: /Approve and send email/ }),
    )

    expect(await screen.findByText('1 approval could not be confirmed')).toBeInTheDocument()
    expect(resultItems('1 approval could not be confirmed')).toEqual([`EX-1001${UNCONFIRMED_ITEM}`])
    await userEvent.click(within(approvalDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('1 approval could not be confirmed')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeChecked()
    expect(mockedSendExemptionApprovalNotifications).not.toHaveBeenCalled()
  })

  it('separates unconfirmed and rejected approvals when none succeeded', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([selectableExemption('EX-1001'), selectableExemption('EX-1002')]),
    )
    mockedApproveExemptions
      .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { request: {} }))
      .mockResolvedValueOnce({
        success: true,
        valid: false,
        sendGrid: [],
        errorMessage: 'Rejected.',
        errors: [],
        warnings: [],
      })

    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve 2 exemptions' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I certify/ }))
    await within(dialog).findAllByText('client@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and send emails' }))

    expect(await screen.findByText('1 exemption was not approved')).toBeInTheDocument()
    expect(resultItems('1 exemption was not approved')).toEqual(['EX-1002: Rejected.'])
    expect(resultItems('1 approval could not be confirmed')).toEqual([`EX-1001${UNCONFIRMED_ITEM}`])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select EX-1002' })).toBeChecked()
    expect(mockedSendExemptionApprovalNotifications).not.toHaveBeenCalled()
  })

  it('reports success, rejection, and unconfirmed approval distinctly in one batch', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        selectableExemption('EX-1001'),
        selectableExemption('EX-1002'),
        selectableExemption('EX-1003'),
      ]),
    )
    mockedApproveExemptions
      .mockResolvedValueOnce({
        success: true,
        valid: true,
        sendGrid: [],
        errorMessage: '',
        errors: [],
        warnings: [],
      })
      .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { request: {} }))
      .mockResolvedValueOnce({
        success: true,
        valid: false,
        sendGrid: [],
        errorMessage: 'Rejected.',
        errors: [],
        warnings: [],
      })

    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve 3 exemptions' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I certify/ }))
    await within(dialog).findAllByText('client@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and send emails' }))

    const approvedTitle = '1 exemption approved and now Active. Approval email sent:'
    expect(await screen.findByText(approvedTitle)).toBeInTheDocument()
    expect(resultNotification(approvedTitle)).toHaveClass('cds--actionable-notification--success')
    expect(resultItems(approvedTitle)).toEqual(['EX-1001 to the owner (client@example.test).'])
    expect(resultItems('1 approval could not be confirmed')).toEqual([`EX-1002${UNCONFIRMED_ITEM}`])
    expect(resultNotification('1 exemption was not approved')).toHaveClass(
      'cds--actionable-notification--error',
    )
    expect(resultItems('1 exemption was not approved')).toEqual(['EX-1003: Rejected.'])
    expect(
      within(resultNotification('1 exemption was not approved')).getByRole('link', {
        name: 'EX-1003',
      }),
    ).toHaveAttribute('href', expect.stringContaining('/provincial/exemption/EX-1003'))
    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select EX-1002' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select EX-1003' })).toBeChecked()
    expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledWith([
      { exemptionNumber: 'EX-1001', ownerEmail: 'client@example.test', agentEmail: '' },
    ])
  })

  it('holds navigation while an approval request is in flight', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    type ApprovalResult = Awaited<ReturnType<typeof approveExemptions>>
    let resolveApproval: ((value: ApprovalResult) => void) | undefined
    mockedApproveExemptions.mockImplementationOnce(
      () =>
        new Promise<ApprovalResult>((resolve) => {
          resolveApproval = resolve
        }),
    )
    const router = renderDataRouter()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-1001' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I certify/ }))
    await within(dialog).findByText('client@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and send email' }))
    await waitFor(() => expect(mockedApproveExemptions).toHaveBeenCalledTimes(1))
    expect(within(dialog).getByRole('button', { name: 'Approving…' })).toBeDisabled()

    await act(async () => {
      await router.navigate('/elsewhere')
    })
    expect(router.state.location.pathname).toBe('/provincial/exemption')
    expect(
      await screen.findByText(/A change to these exemptions is still being completed/),
    ).toBeVisible()

    await act(async () => {
      resolveApproval?.({
        success: true,
        valid: true,
        sendGrid: [],
        errorMessage: '',
        errors: [],
        warnings: [],
      })
    })
    expect(await screen.findByText('Exemption approved and now Active.')).toBeVisible()
    expect(router.state.location.pathname).toBe('/provincial/exemption')
  })

  it('holds navigation through notification sending and retry', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    type QueueResult = Awaited<ReturnType<typeof sendExemptionApprovalNotifications>>
    let resolveFirstQueue: ((value: QueueResult) => void) | undefined
    let resolveRetryQueue: ((value: QueueResult) => void) | undefined
    mockedSendExemptionApprovalNotifications
      .mockImplementationOnce(
        () =>
          new Promise<QueueResult>((resolve) => {
            resolveFirstQueue = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<QueueResult>((resolve) => {
            resolveRetryQueue = resolve
          }),
      )
    const router = renderDataRouter()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-1001' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I certify/ }))
    await within(dialog).findByText('client@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and send email' }))
    await waitFor(() => expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledTimes(1))
    expect(within(dialog).getByRole('button', { name: 'Sending…' })).toBeDisabled()

    await act(async () => {
      await router.navigate('/elsewhere')
    })
    expect(router.state.location.pathname).toBe('/provincial/exemption')
    expect(
      await screen.findByText(/A change to these exemptions is still being completed/),
    ).toBeVisible()
    await act(async () => {
      resolveFirstQueue?.({
        outcomes: [{ exemptionNumber: 'EX-1001', queued: false, message: 'Unavailable.' }],
      })
    })
    await waitFor(() =>
      expect(
        screen.queryByText(/A change to these exemptions is still being completed/),
      ).not.toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Retry notifications' }))
    await waitFor(() => expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledTimes(2))

    await act(async () => {
      await router.navigate('/elsewhere')
    })
    expect(router.state.location.pathname).toBe('/provincial/exemption')
    expect(
      await screen.findByText(/A change to these exemptions is still being completed/),
    ).toBeVisible()
    await act(async () => {
      resolveRetryQueue?.({
        outcomes: [{ exemptionNumber: 'EX-1001', queued: true, message: 'Queued.' }],
      })
    })
    expect(await screen.findByText('Exemption approved and now Active.')).toBeVisible()
    expect(router.state.location.pathname).toBe('/provincial/exemption')
    expect(mockedApproveExemptions).toHaveBeenCalledTimes(1)
    await act(async () => {
      await router.navigate('/elsewhere')
    })
    expect(router.state.location.pathname).toBe('/elsewhere')
    expect(screen.getByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it('keeps the server reason when an approval request is rejected', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedApproveExemptions.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), {
        response: { status: 409, data: { message: 'The exemption changed. Reload it first.' } },
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const approvalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await within(approvalDialog).findByText('client@example.test')
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: /Approve and send email/ }),
    )

    expect(await screen.findByText('1 exemption was not approved')).toBeInTheDocument()
    expect(resultItems('1 exemption was not approved')).toEqual([
      'EX-1001: The exemption changed. Reload it first.',
    ])
  })

  it('reports an exemption approval failure reason and keeps the failed row selected', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedApproveExemptions.mockResolvedValueOnce({
      success: true,
      valid: false,
      sendGrid: [],
      errorMessage:
        'Failed to approve invalid exemption EX-1001:</br>*Active ministerial exemptions require at least one application.</br>',
      errors: [],
      warnings: [],
    })

    renderPage()
    await screen.findByText('EX-1001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))

    const approvalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: /Approve and send email/ }),
    )

    expect(await screen.findByText('1 exemption was not approved')).toBeInTheDocument()
    expect(
      screen.getByText(
        'It stays in New status and no email was sent. Correct the details below, then approve again.',
      ),
    ).toBeInTheDocument()
    expect(resultItems('1 exemption was not approved')).toEqual([
      'EX-1001: Failed to approve invalid exemption EX-1001: Active ministerial exemptions require at least one application.',
    ])
    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeChecked()
    expect(
      screen.queryByRole('dialog', { name: 'Send approval notification' }),
    ).not.toBeInTheDocument()
    expect(mockedSendExemptionApprovalNotifications).not.toHaveBeenCalled()

    await userEvent.click(within(approvalDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('1 exemption was not approved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const reopenedDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    expect(
      within(reopenedDialog).queryByText('1 exemption was not approved'),
    ).not.toBeInTheDocument()
    expect(within(reopenedDialog).getByRole('checkbox', { name: /I certify/ })).not.toBeChecked()
    expect(mockedApproveExemptions).toHaveBeenCalledTimes(1)
  })

  it('approves selected exemptions one at a time with a freshly loaded version', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        {
          exemptionNumber: 'TEST-EX-001',
          type: 'Section 1',
          typeCode: 'SECTION_1',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: 'TEST0001',
          ownerClientNumber: 'TEST0002',
          approvedVolume: 100,
          balanceRemaining: 100,
          listingDate: '2026-01-10',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: true,
          isLocked: false,
          canViewExemption: true,
        },
        {
          exemptionNumber: 'TEST-EX-002',
          type: 'Section 1',
          typeCode: 'SECTION_1',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: 'TEST0003',
          ownerClientNumber: 'TEST0004',
          approvedVolume: 200,
          balanceRemaining: 200,
          listingDate: '2026-01-11',
          expiryDate: '2026-12-31',
          region: '12',
          canApprove: true,
          isLocked: false,
          canViewExemption: true,
        },
      ]),
    )
    mockedApproveExemptions
      .mockResolvedValueOnce({
        success: true,
        valid: true,
        sendGrid: [['TEST-EX-001', 'first@example.test']],
        errorMessage: '',
        errors: [],
        warnings: [],
      })
      .mockResolvedValueOnce({
        success: true,
        valid: true,
        sendGrid: [['TEST-EX-002', 'second@example.test']],
        errorMessage: '',
        errors: [],
        warnings: [],
      })

    renderPage()
    await screen.findByText('TEST-EX-001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const approvalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that these exemptions have been approved',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: /Approve and send email/ }),
    )

    await waitFor(() => expect(mockedApproveExemptions).toHaveBeenCalledTimes(2))
    expect(mockedFetchCurrentExemptionRecordVersion).toHaveBeenNthCalledWith(1, 'TEST-EX-001')
    expect(mockedApproveExemptions).toHaveBeenNthCalledWith(
      1,
      ['TEST-EX-001'],
      'exemption-TEST-EX-001-version',
    )
    expect(mockedFetchCurrentExemptionRecordVersion).toHaveBeenNthCalledWith(2, 'TEST-EX-002')
    expect(mockedApproveExemptions).toHaveBeenNthCalledWith(
      2,
      ['TEST-EX-002'],
      'exemption-TEST-EX-002-version',
    )

    await waitFor(() =>
      expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledWith([
        { exemptionNumber: 'TEST-EX-001', ownerEmail: 'first@example.test', agentEmail: '' },
        { exemptionNumber: 'TEST-EX-002', ownerEmail: 'second@example.test', agentEmail: '' },
      ]),
    )
    const approvedTitle = '2 exemptions approved and now Active. Approval emails sent:'
    expect(await screen.findByText(approvedTitle)).toBeInTheDocument()
    expect(resultItems(approvedTitle)).toEqual([
      'TEST-EX-001 to the owner (first@example.test).',
      'TEST-EX-002 to the owner (second@example.test).',
    ])
  })

  it('reports partial approval details, keeps failures selected, and emails only successes', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        {
          exemptionNumber: 'TEST-EX-001',
          type: 'Ministerial',
          typeCode: 'M',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: 'TEST0001',
          ownerClientNumber: 'TEST0002',
          approvedVolume: 100,
          balanceRemaining: 100,
          listingDate: '2026-01-10',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: true,
          isLocked: false,
          canViewExemption: true,
        },
        {
          exemptionNumber: 'TEST-EX-002',
          type: 'Ministerial',
          typeCode: 'M',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: '',
          ownerClientNumber: '',
          approvedVolume: 100,
          balanceRemaining: 100,
          listingDate: '2026-01-11',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: true,
          isLocked: false,
          canViewExemption: true,
        },
      ]),
    )
    mockedApproveExemptions
      .mockResolvedValueOnce({
        success: true,
        valid: true,
        sendGrid: [['TEST-EX-001', 'first@example.test']],
        errorMessage: '',
        errors: [],
        warnings: [],
      })
      .mockResolvedValueOnce({
        success: true,
        valid: false,
        sendGrid: [],
        errorMessage:
          'Failed to approve invalid exemption TEST-EX-002:</br>*Active ministerial exemptions require at least one application.</br>',
        errors: [],
        warnings: [],
      })

    renderPage()
    await screen.findByText('TEST-EX-001')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))

    const approvalDialog = screen.getByRole('dialog', { name: /^Approve (exemption|[0-9])/ })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that these exemptions have been approved',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: /Approve and send email/ }),
    )

    // Approvals and failures each get their own notification, as designed.
    const approvedTitle = '1 exemption approved and now Active. Approval email sent:'
    expect(await screen.findByText(approvedTitle)).toBeInTheDocument()
    expect(resultNotification(approvedTitle)).toHaveClass('cds--actionable-notification--success')
    expect(resultItems(approvedTitle)).toEqual(['TEST-EX-001 to the owner (first@example.test).'])
    expect(resultNotification('1 exemption was not approved')).toHaveClass(
      'cds--actionable-notification--error',
    )
    expect(resultItems('1 exemption was not approved')).toEqual([
      'TEST-EX-002: Failed to approve invalid exemption TEST-EX-002: Active ministerial exemptions require at least one application.',
    ])
    expect(screen.getByRole('checkbox', { name: 'Select TEST-EX-001' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select TEST-EX-002' })).toBeChecked()

    expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledWith([
      { exemptionNumber: 'TEST-EX-001', ownerEmail: 'first@example.test', agentEmail: '' },
    ])
  })

  it('displays and prevents selection of an actively locked new exemption', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        {
          exemptionNumber: 'EX-LOCKED',
          type: 'Ministerial',
          typeCode: 'M',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          approvedVolume: 100,
          balanceRemaining: 80,
          listingDate: '2026-01-10',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: true,
          isLocked: true,
          canViewExemption: true,
        },
      ]),
    )

    renderPage()

    await screen.findByText('EX-LOCKED')
    expect(screen.getByText('Locked')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select EX-LOCKED' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve selected exemptions' })).toBeDisabled()
  })

  it('explains why select-all is disabled when this page has no approvable exemptions', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        {
          exemptionNumber: 'EX-APPROVED',
          type: 'Ministerial',
          typeCode: 'M',
          status: 'Approved',
          statusCode: 'APPROVED',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          approvedVolume: 100,
          balanceRemaining: 80,
          listingDate: '2026-01-10',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: false,
          isLocked: false,
          canViewExemption: true,
        },
      ]),
    )

    renderPage()

    await screen.findByText('EX-APPROVED')
    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: 'Select all rows on this page',
    })
    expect(selectAllCheckbox).toBeDisabled()

    const selectAllTooltipTrigger = selectAllCheckbox.closest(
      '.disabled-button-tooltip',
    ) as HTMLElement
    expect(selectAllTooltipTrigger).toBeTruthy()

    await userEvent.hover(selectAllTooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No eligible exemptions are available on this page.',
    )
  })

  it('passes table sort field and direction through the search request', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.getByRole('button', { name: 'Exemption' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Balance remaining (m³)' }))

    expect(screen.getByRole('button', { name: 'Balance remaining (m³)' })).toBeInTheDocument()

    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sortField: 'balanceRemaining',
          sortDirection: 'asc',
        }),
        expect.any(Object),
      )
    })
  })

  it('hides add, approval, and selection controls when permissions are missing', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.queryByRole('link', { name: 'Add exemption' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select EX-1001' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select all rows on this page' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Approve selected exemptions' }),
    ).not.toBeInTheDocument()
  })

  it('links authorized NEW exemptions for provincial submitters', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00077881'],
        }),
        canPerform: () => false,
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.getByRole('link', { name: 'EX-1001' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'EX-2002' })).toBeInTheDocument()
  })

  it('hides client-number filters for client-scoped provincial submitters', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
        }),
        canPerform: () => false,
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Owner client number')).not.toBeInTheDocument()
  })

  it('retains client-number filters for provincial staff', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: () => false,
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.getByLabelText('Applicant client number')).toBeInTheDocument()
    expect(screen.getByLabelText('Owner client number')).toBeInTheDocument()
  })

  it('uses canonical applicant and owner client selections in a staff search', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: () => false,
      }),
    )

    renderPage('/provincial/exemption')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Select Applicant client number' }))
    await userEvent.click(screen.getByRole('button', { name: 'Select Owner client number' }))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialExemptions.mock.calls.some(
          ([request]) =>
            request.filters.applicantClientNumber === '00012345' &&
            request.filters.ownerClientNumber === '00054321',
        ),
      ).toBe(true)
    })
  })

  it('locks the exemption type to Ministerial for an Exemption Approver', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: () => true,
      }),
    )
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [
        { value: 'M', label: 'Ministerial' },
        { value: 'B', label: 'Blanket Order in Council' },
      ],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    })

    // A shared or saved link can't widen the search beyond Ministerial.
    renderPage('/provincial/exemption?exemptionTypeCode=B&page=1&pageSize=10')
    await screen.findByText('EX-1001')

    const exemptionType = screen.getByRole('combobox', { name: 'Exemption type' })
    expect(exemptionType).toHaveValue('Ministerial')
    expect(exemptionType).toHaveAttribute('readonly')
    expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ exemptionTypeCode: 'M' }),
      }),
      expect.any(Object),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('Ministerial')
  })

  it('keeps the exemption type editable for an Exemption Approver who also has Read Only', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_EXEMPTION_APPROVER', 'LEXIS_READ_ONLY'],
        }),
        canPerform: () => true,
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.getByRole('combobox', { name: 'Exemption type' })).not.toHaveAttribute('readonly')
  })

  it('defaults approver filters without applying a region when no preference exists', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['EXEMPTION_APPROVER'],
          orgUnitNo: '11',
        }),
        canPerform: () => true,
      }),
    )

    renderPage('/provincial/exemption')
    await waitFor(() => {
      expect(mockedFetchProvincialExemptionOptions).toHaveBeenCalledOnce()
    })

    expect(mockedSearchProvincialExemptions).not.toHaveBeenCalled()
    const addExemptionAction = screen.getByRole('link', { name: 'Add exemption' })
    expect(addExemptionAction).toHaveAttribute('href', '/provincial/exemption/create')
    expect(addExemptionAction.closest('.lexis-page-header__actions')).not.toBeNull()
    const resultsTable = screen.getByRole('region', { name: 'Search results table', hidden: true })
    expect(resultsTable.closest('[hidden]')).toHaveStyle({ display: 'none' })
    expect(resultsTable).not.toBeVisible()
    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
    ).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            exemptionStatusCode: 'NEW',
            exemptionTypeCode: 'M',
            region: [],
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
    const searchCallsBeforeClear = mockedSearchProvincialExemptions.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() => {
      expect(resultsTable).not.toBeVisible()
    })
    expect(mockedSearchProvincialExemptions).toHaveBeenCalledTimes(searchCallsBeforeClear)
  })

  it('renders a full result page before count and then prefetches the next page', async () => {
    const content = Array.from({ length: 10 }, (_, index) => ({
      exemptionNumber: `EX-${index + 1}`,
      type: 'Section 1',
      typeCode: 'SECTION_1',
      status: 'New',
      statusCode: 'NEW',
      applicantClientNumber: '11111111',
      ownerClientNumber: '22222222',
      approvedVolume: 100,
      balanceRemaining: 100,
      listingDate: '2026-01-10',
      expiryDate: '2026-12-31',
      region: '11',
      canApprove: true,
      isLocked: false,
      canViewExemption: true,
    }))
    mockedSearchProvincialExemptions.mockResolvedValue({
      content,
      page: {
        number: 0,
        size: 10,
        totalElements: 11,
        totalPages: 2,
      },
    })
    let resolveCount!: (total: number) => void
    mockedCountProvincialExemptions.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveCount = resolve
        }),
    )

    renderPage()

    expect(await screen.findByText('EX-1')).toBeVisible()
    expect(mockedCountProvincialExemptions).toHaveBeenCalledOnce()
    expect(mockedSearchProvincialExemptions).toHaveBeenCalledOnce()

    resolveCount(809)
    await waitFor(() =>
      expect(mockedSearchProvincialExemptions).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 10 }),
        { knownTotal: 809 },
      ),
    )
  })

  it('keeps exemption rows and pagination available when the exact count fails', async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      exemptionNumber: `EX-${8100 + index}`,
      type: 'Section 1',
      typeCode: 'SECTION_1',
      status: 'New',
      statusCode: 'NEW',
      applicantClientNumber: '11111111',
      ownerClientNumber: '22222222',
      approvedVolume: 100,
      balanceRemaining: 100,
      listingDate: '2026-01-10',
      expiryDate: '2026-12-31',
      region: '11',
      canApprove: true,
      isLocked: false,
      canViewExemption: true,
    }))
    mockedSearchProvincialExemptions.mockImplementation(async (request) => {
      const pageRows = request.page === 0 ? rows.slice(0, 10) : rows.slice(10)
      const optimisticTotal = (request.page + 1) * request.pageSize + 1
      return {
        content: pageRows,
        page: {
          number: request.page,
          size: request.pageSize,
          totalElements: optimisticTotal,
          totalPages: Math.ceil(optimisticTotal / request.pageSize),
        },
      }
    })
    mockedCountProvincialExemptions.mockRejectedValueOnce(new Error('count unavailable'))

    renderPage()

    expect(await screen.findByText('EX-8100')).toBeInTheDocument()
    expect(
      await screen.findByText('At least 10 results found — exact count unavailable'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Exemption search unavailable' }),
    ).not.toBeInTheDocument()

    const nextPage = screen.getByLabelText('Next page')
    expect(nextPage).toBeEnabled()
    await userEvent.click(nextPage)

    expect(await screen.findByText('EX-8110')).toBeInTheDocument()
    expect(mockedCountProvincialExemptions).toHaveBeenCalledOnce()
  })

  it('uses the saved region to preselect exemption search areas', async () => {
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: 'RNI',
      preferenceLoading: false,
    })
    mockedFetchProvincialExemptionOptions.mockResolvedValueOnce({
      exemptionTypes: [{ value: 'M', label: 'Ministerial' }],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [
        { value: '1903', label: 'Cariboo' },
        { value: '1905', label: 'Northeast' },
        { value: '1906', label: 'Omineca' },
        { value: '1908', label: 'Skeena' },
      ],
    })

    renderPage('/provincial/exemption')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*3/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['1905', '1906', '1908'] }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('shows selected exemption search regions in the default Carbon multi-select', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialExemptionOptions.mockResolvedValueOnce({
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    })

    renderPage('/provincial/exemption?region=1903,1908')
    await screen.findByText('EX-1001')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('preserves the legacy exemption filter order with expanded approval dates', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('EX-1001')

    const filterGrid = document.querySelector('.provincial-exemption-search-grid')
    expect(filterGrid).toBeInTheDocument()

    const filterLabels = Array.from(filterGrid?.querySelectorAll('label') ?? []).map((label) =>
      label.textContent?.replace(/Total items selected:.*$/, '').trim(),
    )
    expect(filterLabels).toEqual([
      'Application number',
      'Package number',
      'Exemption number',
      'Region',
      'Approval from date',
      'Approval to date',
      'Listing from date',
      'Listing to date',
      'Exemption type',
      'Exemption status',
      'Applicant client number',
      'Owner client number',
    ])
  })

  it('waits for explicit submission while text filters are typed', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('EX-1001')
    mockedSearchProvincialExemptions.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['4', '46', '460', '4605', '46053']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedSearchProvincialExemptions).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialExemptions).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ applicationNumber: '46053' }),
        }),
        expect.any(Object),
      )
    })
  })

  it('clears approval date filters and removes results without searching again', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage(
      '/provincial/exemption?approvalFromDate=2026-02-01&approvalToDate=2026-02-28&region=11',
    )
    await screen.findByText('EX-1001')

    expect(screen.getByLabelText('Approval from date')).toHaveValue('2026-02-01')
    expect(screen.getByLabelText('Approval to date')).toHaveValue('2026-02-28')
    expect(mockedSearchProvincialExemptions).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          approvalFromDate: '2026-02-01',
          approvalToDate: '2026-02-28',
        }),
      }),
      expect.any(Object),
    )
    const resultsTable = screen.getByRole('region', { name: 'Search results table' })
    const searchCallsBeforeClear = mockedSearchProvincialExemptions.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(screen.getByLabelText('Approval from date')).toHaveValue('')
    expect(screen.getByLabelText('Approval to date')).toHaveValue('')
    await waitFor(() => {
      expect(resultsTable).not.toBeVisible()
    })
    expect(mockedSearchProvincialExemptions).toHaveBeenCalledTimes(searchCallsBeforeClear)
  })

  it('disables search button for invalid date filters', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('EX-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Approval from date'), '2026-99-99')

    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSearchProvincialExemptions.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Exemption search unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve exemption search results.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No exemptions found' })).not.toBeInTheDocument()
  })
})
