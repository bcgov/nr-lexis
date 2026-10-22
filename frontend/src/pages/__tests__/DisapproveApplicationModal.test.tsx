import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DisapproveApplicationModal from '@/pages/ProvincialReview/DisapproveApplicationModal'
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import { updateApplicationReviewStatus } from '@/service/application-review-search-service'
import { fetchApplicationSummarySnapshot } from '@/service/provincial-application-items-service'
import { fetchCurrentApplicationRecordVersion } from '@/service/record-version-service'

vi.mock('@/service/application-review-search-service', () => ({
  sendApplicationReviewStatusEmail: vi.fn(),
  updateApplicationReviewStatus: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationSummarySnapshot: vi.fn(),
}))

vi.mock('@/service/record-version-service', () => ({
  fetchCurrentApplicationRecordVersion: vi.fn(),
}))

const statusOptions = [
  { value: 'REJ', label: 'Rejected' },
  { value: 'WDR', label: 'Withdrawn' },
]

const summary = (overrides = {}) =>
  ({
    applicationNumber: '1000123',
    applicantTypeCode: 'O',
    ownerClientNumber: '00012345',
    ownerClientLocationCode: '00',
    agentClientNumber: '00054321',
    agentClientLocationCode: '02',
    ...overrides,
  }) as Awaited<ReturnType<typeof fetchApplicationSummarySnapshot>>

const clientData = (email: string) => ({
  clientNumber: '00012345',
  companyName: 'Client Ltd.',
  clientAcronym: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  country: '',
  phone: '',
  fax: '',
  email,
  notfound: '',
})

const EMAIL_REQUIRED =
  'Enter at least one email address, or clear Send disapproval email to notify the applicant another way.'

const renderModal = (onClose = vi.fn()) =>
  render(
    <DisapproveApplicationModal
      applicationNumber="1000123"
      statusOptions={statusOptions}
      onComplete={vi.fn()}
      onClose={onClose}
    />,
  )

// A browser Escape carries keyCode 27, which Carbon's ListBox checks before it stops the key.
const pressEscape = (target: HTMLElement) =>
  fireEvent.keyDown(target, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 })

describe('DisapproveApplicationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApplicationSummarySnapshot).mockResolvedValue(summary())
    vi.mocked(fetchApplicationClientData).mockResolvedValue(clientData('Not on file'))
    vi.mocked(fetchCurrentApplicationRecordVersion).mockResolvedValue('"version"')
  })

  it('closes on Escape from the collapsed Application status and keeps Rejected', async () => {
    const onClose = vi.fn()
    renderModal(onClose)
    const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 1000123' })
    const status = within(dialog).getByRole('combobox', { name: 'Application status' })
    status.focus()
    expect(status).toHaveAttribute('aria-expanded', 'false')

    pressEscape(status)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(status).toHaveValue('Rejected')
  })

  it('closes only the status list on the first Escape and the dialog on the second', async () => {
    const onClose = vi.fn()
    renderModal(onClose)
    const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 1000123' })
    const status = within(dialog).getByRole('combobox', { name: 'Application status' })

    await userEvent.click(status)
    expect(status).toHaveAttribute('aria-expanded', 'true')
    pressEscape(status)

    expect(status).toHaveAttribute('aria-expanded', 'false')
    expect(onClose).not.toHaveBeenCalled()
    expect(status).toHaveValue('Rejected')

    pressEscape(status)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('holds the recipient section open while the recipients load', async () => {
    let finishLoad: (value: ReturnType<typeof summary>) => void = () => undefined
    vi.mocked(fetchApplicationSummarySnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    )
    renderModal()

    const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 1000123' })
    const placeholder = dialog.querySelector('.exemption-approval-modal__recipient--loading')
    expect(placeholder).not.toBeNull()
    expect(placeholder).toHaveAttribute('aria-busy', 'true')
    expect(within(placeholder as HTMLElement).getByText('Loading recipients…')).toBeInTheDocument()

    finishLoad(summary())
    await within(dialog).findByRole('textbox', { name: 'Owner email' })
    expect(dialog.querySelector('.exemption-approval-modal__recipient--loading')).toBeNull()
  })

  it('replaces the placeholder with one owner summary row when the owner has an email', async () => {
    let finishLoad: (value: ReturnType<typeof summary>) => void = () => undefined
    vi.mocked(fetchApplicationSummarySnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    )
    vi.mocked(fetchApplicationClientData).mockResolvedValue(clientData('owner@example.com'))
    renderModal()

    const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 1000123' })
    expect(dialog.querySelector('.exemption-approval-modal__recipient--loading')).not.toBeNull()

    finishLoad(summary())
    expect(await within(dialog).findByText('owner@example.com')).toBeInTheDocument()
    // The placeholder is sized for this row: the owner's email beside its Edit recipients button.
    expect(dialog.querySelector('.exemption-approval-modal__recipient--loading')).toBeNull()
    const rows = dialog.querySelectorAll('.exemption-approval-modal__recipient')
    expect(rows).toHaveLength(1)
    expect(rows[0].querySelectorAll('dt')).toHaveLength(1)
    expect(
      rows[0].querySelector('.exemption-approval-modal__recipient-summary > .cds--btn'),
    ).toHaveTextContent('Edit recipients')
  })

  it('marks the recipient inputs invalid and described after a both-empty submit', async () => {
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 1000123' })
    const owner = await within(dialog).findByRole('textbox', { name: 'Owner email' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')
    expect(owner).not.toHaveAttribute('aria-invalid')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Disapprove and send email' }))

    const error = within(dialog).getByText(EMAIL_REQUIRED).closest('[role="alert"]')
    expect(error).toHaveAttribute('id')
    expect(owner).toHaveAttribute('aria-invalid', 'true')
    const describedBy = (owner.getAttribute('aria-describedby') ?? '').split(' ')
    expect(describedBy).toContain((error as HTMLElement).id)
    const helper = describedBy.find((id) => id.endsWith('-helper-text'))
    expect(document.getElementById(helper ?? '')).toHaveTextContent(
      'No email on file. The email you enter applies to this email only.',
    )
    expect(within(dialog).getAllByText(EMAIL_REQUIRED)).toHaveLength(1)
    expect(updateApplicationReviewStatus).not.toHaveBeenCalled()

    await waitFor(() => expect(owner).toHaveFocus())
    await userEvent.type(owner, 'owner@example.com')
    expect(within(dialog).queryByText(EMAIL_REQUIRED)).not.toBeInTheDocument()
    await waitFor(() => expect(owner).not.toHaveAttribute('aria-invalid'))
    expect(owner.getAttribute('aria-describedby') ?? '').not.toContain('disapprove-email-required')
  })

  it('links both the owner and agent inputs to the shared error', async () => {
    vi.mocked(fetchApplicationSummarySnapshot).mockResolvedValue(
      summary({ applicantTypeCode: 'A' }),
    )
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 1000123' })
    const owner = await within(dialog).findByRole('textbox', { name: 'Owner email' })
    const agent = within(dialog).getByRole('textbox', { name: 'Agent email' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Disapprove and send email' }))

    const errorId = (
      within(dialog).getByText(EMAIL_REQUIRED).closest('[role="alert"]') as HTMLElement
    ).id
    for (const input of [owner, agent]) {
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.getAttribute('aria-describedby')).toContain(errorId)
    }

    // The failed submit moves focus to the first address once the frame is drawn.
    await waitFor(() => expect(owner).toHaveFocus())
    await userEvent.type(agent, 'agent@example.com')
    await waitFor(() => {
      for (const input of [owner, agent]) expect(input).not.toHaveAttribute('aria-invalid')
    })
  })
})
