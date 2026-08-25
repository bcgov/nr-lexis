import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
  sendExemptionApprovalEmails,
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
  sendExemptionApprovalEmails: vi.fn(),
}))

vi.mock('@/service/record-version-service', () => ({
  fetchCurrentExemptionRecordVersion: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
const mockedSearchProvincialExemptions = vi.mocked(searchProvincialExemptions)
const mockedCountProvincialExemptions = vi.mocked(countProvincialExemptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedApproveExemptions = vi.mocked(approveExemptions)
const mockedSendExemptionApprovalEmails = vi.mocked(sendExemptionApprovalEmails)
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

const renderPage = (
  path = '/provincial/exemption?region=11&page=1&pageSize=10&sortField=exemptionNumber&sortDirection=desc',
) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/provincial/exemption" element={<ProvincialExemptionPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Exemption Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
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
    mockedSendExemptionApprovalEmails.mockResolvedValue({
      success: true,
      message: 'Approval email sent.',
    })
  })

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
    const firstDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    expect(within(firstDialog).getByText('EX-1001')).toBeInTheDocument()
    const firstCertification = within(firstDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved.',
    })
    const firstConfirm = within(firstDialog).getByRole('button', { name: 'Approve exemptions' })
    expect(firstCertification).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    expect(firstConfirm).toHaveClass('cds--btn--primary')
    expect(firstConfirm).not.toHaveClass('cds--btn--danger')
    expect(firstConfirm.parentElement).toHaveClass('lexis-confirmation-modal__actions')
    await userEvent.click(firstConfirm)
    expect(mockedApproveExemptions).not.toHaveBeenCalled()

    await userEvent.click(firstCertification)
    expect(firstConfirm).toBeEnabled()
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Approve selected exemptions' }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const reopenedDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    const reopenedCertification = within(reopenedDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved.',
    })
    const reopenedConfirm = within(reopenedDialog).getByRole('button', {
      name: 'Approve exemptions',
    })
    expect(reopenedCertification).not.toBeChecked()
    expect(reopenedConfirm).toBeDisabled()
    await userEvent.click(reopenedCertification)
    await userEvent.click(reopenedConfirm)

    await waitFor(() =>
      expect(mockedApproveExemptions).toHaveBeenCalledWith(
        ['EX-1001'],
        'exemption-EX-1001-version',
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Approve selected exemptions' }),
      ).not.toBeInTheDocument(),
    )
    const notificationDialog = await screen.findByRole('dialog', {
      name: 'Send approval notification',
    })
    const recipient = within(notificationDialog).getByLabelText('Recipient for exemption EX-1001')
    expect(recipient).toHaveValue('client@example.test')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'updated@example.test')
    await userEvent.click(within(notificationDialog).getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(mockedSendExemptionApprovalEmails).toHaveBeenCalledWith([
        ['EX-1001', 'updated@example.test'],
      ]),
    )
    expect(
      await screen.findByText('Approved 1 exemption. Approval email sent.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected exemptions' }))
    const postApprovalDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    expect(
      within(postApprovalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved.',
      }),
    ).not.toBeChecked()
    await userEvent.click(within(postApprovalDialog).getByRole('button', { name: 'Cancel' }))

    const addExemptionAction = screen.getByRole('link', { name: 'Add exemption' })
    expect(addExemptionAction).toHaveAttribute('href', '/provincial/exemption/create')
    expect(addExemptionAction).toHaveClass('cds--btn--primary')
    expect(addExemptionAction.closest('.legacy-search-table-toolbar__actions')).not.toBeNull()
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

    const approvalDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved.',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: 'Approve exemptions' }),
    )

    const notificationDialog = await screen.findByRole('dialog', {
      name: 'Send approval notification',
    })
    const recipient = within(notificationDialog).getByLabelText('Recipient for exemption EX-1001')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'not-an-email')
    expect(within(notificationDialog).getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(within(notificationDialog).getByText('Enter one valid email address.')).toBeVisible()
    expect(mockedSendExemptionApprovalEmails).not.toHaveBeenCalled()

    await userEvent.click(
      within(notificationDialog).getByRole('button', { name: 'Skip notification' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Send approval notification' }),
      ).not.toBeInTheDocument(),
    )
    expect(mockedApproveExemptions).toHaveBeenCalledWith(['EX-1001'], 'exemption-EX-1001-version')
    expect(mockedSendExemptionApprovalEmails).not.toHaveBeenCalled()
    expect(screen.getByText('Approval completed with warnings')).toBeInTheDocument()
    expect(
      screen.getByText('Approved 1 exemption. Approval notification was skipped.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Approval failed')).not.toBeInTheDocument()
  }, 20_000)

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

    const approvalDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved.',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: 'Approve exemptions' }),
    )

    expect(
      await screen.findByText(
        'No selected exemptions were approved; 1 failed. Failed exemptions: EX-1001 — Failed to approve invalid exemption EX-1001: Active ministerial exemptions require at least one application.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Approval failed')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeChecked()
    expect(
      screen.queryByRole('dialog', { name: 'Send approval notification' }),
    ).not.toBeInTheDocument()
    expect(mockedSendExemptionApprovalEmails).not.toHaveBeenCalled()
  })

  it('approves selected exemptions one at a time with a freshly loaded version', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    mockedSendExemptionApprovalEmails.mockResolvedValueOnce({
      success: true,
      message: 'Approval emails sent.',
    })
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
    const approvalDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that these exemptions have been approved.',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: 'Approve exemptions' }),
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

    const notificationDialog = await screen.findByRole('dialog', {
      name: 'Send notifications',
    })
    expect(
      within(notificationDialog).getByLabelText('Recipient for exemption TEST-EX-001'),
    ).toHaveValue('first@example.test')
    expect(
      within(notificationDialog).getByLabelText('Recipient for exemption TEST-EX-002'),
    ).toHaveValue('second@example.test')
    const skipNotifications = within(notificationDialog).getByRole('button', {
      name: 'Skip notifications',
    })
    const sendAll = within(notificationDialog).getByRole('button', { name: 'Send all' })
    expect(skipNotifications).toHaveClass('cds--btn--tertiary')
    expect(sendAll).toHaveClass('cds--btn--primary')
    expect(skipNotifications.parentElement).toHaveClass('lexis-confirmation-modal__actions')
    expect(notificationDialog.querySelector('.cds--modal-footer')).not.toBeInTheDocument()
    await userEvent.click(sendAll)
    await waitFor(() =>
      expect(mockedSendExemptionApprovalEmails).toHaveBeenCalledWith([
        ['TEST-EX-001', 'first@example.test'],
        ['TEST-EX-002', 'second@example.test'],
      ]),
    )
    expect(
      await screen.findByText('Approved 2 exemptions. Approval emails sent.'),
    ).toBeInTheDocument()
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

    const approvalDialog = screen.getByRole('dialog', { name: 'Approve selected exemptions' })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that these exemptions have been approved.',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: 'Approve exemptions' }),
    )

    expect(
      await screen.findByText(
        'Approved 1 exemption. Review the applicant recipients before sending notifications. 1 selected exemption failed to approve. Failed exemptions: TEST-EX-002 — Failed to approve invalid exemption TEST-EX-002: Active ministerial exemptions require at least one application.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Approval completed with warnings')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select TEST-EX-001' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select TEST-EX-002' })).toBeChecked()

    const notificationDialog = await screen.findByRole('dialog', {
      name: 'Send approval notification',
    })
    expect(
      within(notificationDialog).getByLabelText('Recipient for exemption TEST-EX-001'),
    ).toHaveValue('first@example.test')
    expect(
      within(notificationDialog).queryByLabelText('Recipient for exemption TEST-EX-002'),
    ).not.toBeInTheDocument()
    expect(mockedSendExemptionApprovalEmails).not.toHaveBeenCalled()
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

  it('uses the application search filter order and labels', async () => {
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
      'Exemption status',
      'Package number',
      'Exemption type',
      'Exemption number',
      'Region',
      'Applicant client number',
      'Owner client number',
      'Approval from date',
      'Approval to date',
      'Listing from date',
      'Listing to date',
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
