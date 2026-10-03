import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import ExemptionApprovalModal from '@/components/ExemptionApprovalModal'
import type {
  ApprovalEmailResult,
  ExemptionApprovalReport,
} from '@/components/exemption-approval-results'
import {
  fetchExemptionApprovalRecipients,
  sendExemptionApprovalNotifications,
  type ExemptionApprovalRecipientPreview,
} from '@/service/provincial-exemption-detail-service'

vi.mock('@/service/provincial-exemption-detail-service', () => ({
  fetchExemptionApprovalRecipients: vi.fn(),
  sendExemptionApprovalNotifications: vi.fn(),
}))

const preview = (
  overrides: Partial<ExemptionApprovalRecipientPreview> = {},
): ExemptionApprovalRecipientPreview => ({
  exemptionNumber: 'EX-205',
  ownerEmail: 'owner@example.com',
  agentEmail: 'agent@example.com',
  agentApplicable: true,
  sendable: true,
  message: '',
  ...overrides,
})

const contacts = [preview()]

const report = (
  approved: [string, ApprovalEmailResult][],
  extra: Partial<ExemptionApprovalReport> = {},
): ExemptionApprovalReport => ({
  approved: approved.map(([exemptionNumber, email]) => ({ exemptionNumber, email })),
  failures: [],
  unconfirmedNumbers: [],
  notes: [],
  ...extra,
})

const sent = (ownerEmail = 'owner@example.com', agentEmail = 'agent@example.com') =>
  ({ status: 'sent', ownerEmail, agentEmail }) as const

const approval = (numbers = ['EX-205']) => ({
  approvedNumbers: numbers,
  message: 'Approval complete.',
  warning: false,
})

describe('ExemptionApprovalModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue(contacts)
    vi.mocked(sendExemptionApprovalNotifications).mockResolvedValue({
      outcomes: [{ exemptionNumber: 'EX-205', queued: true, message: 'Approval email queued.' }],
    })
  })

  it('shows the designed certification and email errors instead of approving', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview({ ownerEmail: '', agentEmail: '' }),
    ])
    const onApprove = vi.fn().mockResolvedValue(approval())
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await screen.findByRole('textbox', { name: 'Owner email' })
    expect(
      screen.getAllByText('No email on file. The email you enter applies to this approval only.'),
    ).toHaveLength(2)
    const submit = screen.getByRole('button', { name: 'Approve and send email' })
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(
      screen.getByText('Confirm that you certify this exemption has been approved.'),
    ).toBeVisible()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /I certify/ })).toHaveFocus())
    expect(
      screen.getByText(
        'Enter an email address, or clear “Send approval email to the applicant” to notify the applicant another way.',
      ),
    ).toBeVisible()

    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    expect(
      screen.queryByText('Confirm that you certify this exemption has been approved.'),
    ).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Owner email' }), 'invalid address')
    await user.click(submit)
    expect(
      screen.getByText('Enter an email address in the correct format, like name@example.com.'),
    ).toBeVisible()
    await user.clear(screen.getByRole('textbox', { name: 'Owner email' }))
    await user.type(screen.getByRole('textbox', { name: 'Agent email' }), 'agent@example.com')
    expect(onApprove).not.toHaveBeenCalled()
    await user.click(submit)
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1))
  })

  it('shows only the owner contact when the applicant is not an agent', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview({ agentEmail: '', agentApplicable: false }),
    ])
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={vi.fn().mockResolvedValue(approval())}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('owner@example.com')
    expect(screen.queryByText('Agent email')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit recipients' }))
    expect(screen.getByRole('textbox', { name: 'Owner email' })).toBeVisible()
    expect(screen.getByText('Changes apply to this approval only.')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Agent email' })).not.toBeInTheDocument()
  })

  it('keeps one available contact read-only even when the other contact is missing', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview({ ownerEmail: '', agentEmail: 'agent@example.com' }),
    ])
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={vi.fn().mockResolvedValue(approval())}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('agent@example.com')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit recipients' }))
    const owner = screen.getByRole('textbox', { name: 'Owner email' })
    await user.type(owner, 'owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    expect(owner).toBeVisible()
    expect(owner).toHaveValue('owner@example.com')
  })

  it('displays duplicate contacts under both roles without changing either preview value', async () => {
    const shared = 'shared@example.com'
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview({ ownerEmail: shared, agentEmail: shared }),
    ])
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={vi.fn().mockResolvedValue(approval())}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findAllByText(shared)).toHaveLength(2)
    expect(screen.getByText('Owner email')).toBeVisible()
    expect(screen.getByText('Agent email')).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('waits for interaction before showing a malformed stored address, then focuses its correction', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn().mockResolvedValue(approval())
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview({ ownerEmail: 'invalid address' }),
    ])
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('invalid address')
    await user.click(screen.getByRole('button', { name: 'Edit recipients' }))
    const owner = screen.getByRole('textbox', { name: 'Owner email' })
    expect(owner).not.toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
    expect(owner).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(owner).toHaveFocus())
    expect(onApprove).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'focuses server approval feedback with unconfirmed=%s',
    async (unconfirmed) => {
      const user = userEvent.setup()
      const rects = vi
        .spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue([new DOMRect(0, 0, 400, 80)] as unknown as DOMRectList)
      const message = unconfirmed
        ? 'Check the current approval status before trying again.'
        : 'A valid expiry date is required for an active exemption.'
      const onClose = vi.fn()
      try {
        render(
          <ExemptionApprovalModal
            exemptionNumbers={['EX-205']}
            onApprove={vi.fn().mockResolvedValue({
              approvedNumbers: [],
              message,
              warning: true,
              unconfirmed,
            })}
            onComplete={vi.fn()}
            onClose={onClose}
          />,
        )

        await screen.findByText('owner@example.com')
        await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
        await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
        const title = unconfirmed ? 'Approval status unconfirmed' : 'Approval failed'
        const notification = (await screen.findByText(title)).closest('[role="status"]')
        await waitFor(() => expect(notification).toHaveFocus())
        expect(notification).toHaveTextContent(message)
        if (!unconfirmed) {
          expect(notification).toHaveTextContent('Review the expiry date in Exemption details.')
          await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
          await waitFor(() =>
            expect(screen.getByText(title).closest('[role="status"]')).toHaveFocus(),
          )
        }
        expect(onClose).not.toHaveBeenCalled()
        expect(sendExemptionApprovalNotifications).not.toHaveBeenCalled()
      } finally {
        rects.mockRestore()
      }
    },
  )

  it('sends edited contacts for this approval without changing the preview data', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn().mockResolvedValue(approval())
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('button', { name: 'Edit recipients' }))
    await user.clear(screen.getByRole('textbox', { name: 'Owner email' }))
    await user.type(screen.getByRole('textbox', { name: 'Owner email' }), 'updated@example.com')
    await user.clear(screen.getByRole('textbox', { name: 'Agent email' }))
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledWith([
      { exemptionNumber: 'EX-205', ownerEmail: 'updated@example.com', agentEmail: '' },
    ])
    expect(onComplete).toHaveBeenCalledWith(report([['EX-205', sent('updated@example.com', '')]]))
    expect(contacts[0]).toEqual(preview())
  })

  it('approves without queueing when email is unchecked', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn().mockResolvedValue(approval())
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: 'Send approval email' }))
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve exemption' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(sendExemptionApprovalNotifications).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledWith(report([['EX-205', { status: 'skipped' }]]))
  })

  it('labels an unknown approval result without claiming the request failed', async () => {
    const user = userEvent.setup()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={vi.fn().mockResolvedValue({
          approvedNumbers: [],
          message: 'Approval status could not be confirmed.',
          warning: true,
          unconfirmed: true,
        })}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))

    expect(await screen.findByText('Approval status unconfirmed')).toBeVisible()
    expect(screen.queryByText('Approval failed')).not.toBeInTheDocument()
    expect(sendExemptionApprovalNotifications).not.toHaveBeenCalled()
  })

  it('approves a batch when one exemption cannot be emailed and reports why', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview({ agentApplicable: false, agentEmail: '' }),
      preview({
        exemptionNumber: 'EX-206',
        ownerEmail: '',
        agentEmail: '',
        agentApplicable: false,
        sendable: false,
        message:
          'An approval email can’t be sent because this exemption has no linked application.',
      }),
    ])
    const onApprove = vi.fn().mockResolvedValue(approval(['EX-205', 'EX-206']))
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205', 'EX-206']}
        onApprove={onApprove}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )

    const blockedRow = await screen.findByRole('region', {
      name: 'Recipients for exemption EX-206',
    })
    expect(
      within(blockedRow).getByText(
        'An approval email can’t be sent because this exemption has no linked application.',
      ),
    ).toBeVisible()
    expect(within(blockedRow).queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send emails' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledWith([
      { exemptionNumber: 'EX-205', ownerEmail: 'owner@example.com', agentEmail: '' },
    ])
    expect(onComplete).toHaveBeenCalledWith(
      report([
        ['EX-205', sent('owner@example.com', '')],
        [
          'EX-206',
          {
            status: 'notSent',
            reason:
              'An approval email can’t be sent because this exemption has no linked application.',
          },
        ],
      ]),
    )
  })

  it('shows the batch recipient error inside the row that needs an address', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview(),
      preview({ exemptionNumber: 'EX-206', ownerEmail: '', agentEmail: '' }),
    ])
    const onApprove = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205', 'EX-206']}
        onApprove={onApprove}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const emptyRow = await screen.findByRole('region', { name: 'Recipients for exemption EX-206' })
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send emails' }))

    expect(
      within(emptyRow).getByText(
        'Enter at least one email address, or clear “Send approval emails”.',
      ),
    ).toBeVisible()
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('retries only failed notifications and shows why they were not queued', async () => {
    const user = userEvent.setup()
    const rows = [
      preview({ agentEmail: '', agentApplicable: false }),
      preview({
        exemptionNumber: 'EX-206',
        ownerEmail: 'other@example.com',
        agentEmail: '',
        agentApplicable: false,
      }),
    ]
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue(rows)
    vi.mocked(sendExemptionApprovalNotifications)
      .mockResolvedValueOnce({
        outcomes: [
          { exemptionNumber: 'EX-205', queued: true, message: 'Approval email queued.' },
          {
            exemptionNumber: 'EX-206',
            queued: false,
            message: 'A recipient email address is invalid.',
          },
        ],
      })
      .mockResolvedValueOnce({
        outcomes: [{ exemptionNumber: 'EX-206', queued: true, message: 'Approval email queued.' }],
      })
    const onApprove = vi.fn().mockResolvedValue(approval(['EX-205', 'EX-206']))
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205', 'EX-206']}
        onApprove={onApprove}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('other@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send emails' }))
    expect(
      await screen.findByText(
        'Approval is complete. Notifications were not queued for EX-206 (A recipient email address is invalid). Review the recipients and retry.',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry notifications' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(2)
    expect(sendExemptionApprovalNotifications).toHaveBeenNthCalledWith(1, [
      { exemptionNumber: 'EX-205', ownerEmail: 'owner@example.com', agentEmail: '' },
      { exemptionNumber: 'EX-206', ownerEmail: 'other@example.com', agentEmail: '' },
    ])
    expect(sendExemptionApprovalNotifications).toHaveBeenNthCalledWith(2, [
      { exemptionNumber: 'EX-206', ownerEmail: 'other@example.com', agentEmail: '' },
    ])
    expect(onComplete).toHaveBeenCalledWith(
      report([
        ['EX-205', sent('owner@example.com', '')],
        ['EX-206', sent('other@example.com', '')],
      ]),
    )
  })

  it('reports which notifications were not queued when closed after a failed send', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      preview(),
      preview({ exemptionNumber: 'EX-206' }),
    ])
    vi.mocked(sendExemptionApprovalNotifications).mockResolvedValue({
      outcomes: [
        { exemptionNumber: 'EX-205', queued: true, message: 'Approval email queued.' },
        {
          exemptionNumber: 'EX-206',
          queued: false,
          message: 'Approval email could not be queued.',
        },
      ],
    })
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205', 'EX-206']}
        onApprove={vi.fn().mockResolvedValue(approval(['EX-205', 'EX-206']))}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )

    await screen.findAllByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send emails' }))
    await screen.findByRole('button', { name: 'Retry notifications' })
    await user.click(screen.getByText('Close', { selector: 'button' }))

    expect(onComplete).toHaveBeenCalledWith(
      report([
        ['EX-205', sent()],
        ['EX-206', { status: 'notSent', reason: 'Approval email could not be queued.' }],
      ]),
    )
  })

  const renderSingleApproval = () => {
    const onApprove = vi.fn().mockResolvedValue(approval())
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )
    return { onApprove, onComplete }
  }
  const uncertainSendMessage =
    'Approval is complete, but notification queue status could not be confirmed for EX-205. You can retry once; if the first send went through, the applicant may receive the email twice.'

  it.each([
    ['is lost', new Error('Response lost')],
    // A gateway error can follow a committed send.
    ['is a gateway error', { response: { status: 502, data: {} } }],
  ])('allows one retry when the queue response %s, then only verification', async (_, failure) => {
    const user = userEvent.setup()
    vi.mocked(sendExemptionApprovalNotifications).mockRejectedValue(failure)
    const { onApprove, onComplete } = renderSingleApproval()
    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))

    expect(await screen.findByText(uncertainSendMessage)).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Retry approval notifications' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry notifications' }))

    expect(await screen.findByRole('button', { name: 'Queue status unknown' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retry notifications' })).not.toBeInTheDocument()
    await user.click(screen.getByText('Close', { selector: 'button' }))
    expect(onComplete).toHaveBeenCalledWith(report([['EX-205', { status: 'unknown' }]]))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(2)
  })

  it('completes when the one retry after an uncertain send is queued', async () => {
    const user = userEvent.setup()
    vi.mocked(sendExemptionApprovalNotifications)
      .mockRejectedValueOnce({ response: { status: 504, data: {} } })
      .mockResolvedValueOnce({
        outcomes: [{ exemptionNumber: 'EX-205', queued: true, message: 'Approval email queued.' }],
      })
    const { onComplete } = renderSingleApproval()
    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
    await user.click(await screen.findByRole('button', { name: 'Retry notifications' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(report([['EX-205', sent()]])))
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(2)
  })

  it('offers no second retry when the retry after an uncertain send is not queued', async () => {
    const user = userEvent.setup()
    vi.mocked(sendExemptionApprovalNotifications)
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({
        outcomes: [{ exemptionNumber: 'EX-205', queued: false, message: 'Mail server busy.' }],
      })
    renderSingleApproval()
    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
    await user.click(await screen.findByRole('button', { name: 'Retry notifications' }))

    // The first send may still have gone through, so the status can only be verified now.
    expect(await screen.findByRole('button', { name: 'Queue status unknown' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retry notifications' })).not.toBeInTheDocument()
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(2)
  })

  it('retries notifications when the queue request is rejected', async () => {
    const user = userEvent.setup()
    vi.mocked(sendExemptionApprovalNotifications)
      .mockRejectedValueOnce({
        response: { status: 400, data: { detail: 'Notifications are paused.' } },
      })
      .mockResolvedValueOnce({
        outcomes: [{ exemptionNumber: 'EX-205', queued: true, message: 'Approval email queued.' }],
      })
    const onApprove = vi.fn().mockResolvedValue(approval())
    const onComplete = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )
    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))

    expect(
      await screen.findByText(
        'Approval is complete. Notifications were not queued for EX-205 (Notifications are paused). Review the recipients and retry.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Retry approval notifications' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Queue status unknown' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry notifications' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(report([['EX-205', sent()]])))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(2)
  })

  it('keeps the approval wording while the first notification send is in flight', async () => {
    const user = userEvent.setup()
    type QueueResult = Awaited<ReturnType<typeof sendExemptionApprovalNotifications>>
    let resolveQueue: ((value: QueueResult) => void) | undefined
    vi.mocked(sendExemptionApprovalNotifications).mockImplementation(
      () =>
        new Promise<QueueResult>((resolve) => {
          resolveQueue = resolve
        }),
    )
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={vi.fn().mockResolvedValue(approval())}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
    await waitFor(() => expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog', { name: 'Approve exemption EX-205' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Sending…$/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(
      screen.queryByText(
        'Approval is complete. Retry only the notifications that were not queued.',
      ),
    ).not.toBeInTheDocument()

    resolveQueue?.({
      outcomes: [{ exemptionNumber: 'EX-205', queued: false, message: 'Unavailable.' }],
    })
    expect(
      await screen.findByRole('dialog', { name: 'Retry approval notifications' }),
    ).toBeVisible()
    expect(
      screen.getByText('Approval is complete. Retry only the notifications that were not queued.'),
    ).toBeVisible()
  })

  it('reports busy while approval and notification requests are in flight', async () => {
    const user = userEvent.setup()
    type QueueResult = Awaited<ReturnType<typeof sendExemptionApprovalNotifications>>
    let resolveQueue: ((value: QueueResult) => void) | undefined
    vi.mocked(sendExemptionApprovalNotifications).mockImplementation(
      () =>
        new Promise<QueueResult>((resolve) => {
          resolveQueue = resolve
        }),
    )
    const onBusyChange = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={vi.fn().mockResolvedValue(approval())}
        onComplete={vi.fn()}
        onClose={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    )

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    await user.click(screen.getByRole('button', { name: 'Approve and send email' }))
    await waitFor(() => expect(sendExemptionApprovalNotifications).toHaveBeenCalledTimes(1))
    expect(onBusyChange).toHaveBeenLastCalledWith(true)

    resolveQueue?.({ outcomes: [] })
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
  })

  it('blocks email approval when preview fails and cancellation makes no mutation', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionApprovalRecipients).mockRejectedValue(new Error('lookup unavailable'))
    const onApprove = vi.fn().mockResolvedValue(approval())
    const onClose = vi.fn()
    render(
      <ExemptionApprovalModal
        exemptionNumbers={['EX-205']}
        onApprove={onApprove}
        onComplete={vi.fn()}
        onClose={onClose}
      />,
    )

    expect(await screen.findByText(/Approval recipients could not be loaded/)).toBeVisible()
    await user.click(screen.getByRole('checkbox', { name: /I certify/ }))
    expect(screen.getByRole('button', { name: 'Approve and send email' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApprove).not.toHaveBeenCalled()
    expect(sendExemptionApprovalNotifications).not.toHaveBeenCalled()
  })
})
