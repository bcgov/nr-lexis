import { describe, expect, it } from 'vitest'
import {
  exemptionApprovalResults,
  type ExemptionApprovalReport,
} from '@/components/exemption-approval-results'

const report = (overrides: Partial<ExemptionApprovalReport>): ExemptionApprovalReport => ({
  approved: [],
  failures: [],
  unconfirmedNumbers: [],
  notes: [],
  ...overrides,
})

describe('exemptionApprovalResults', () => {
  it('reports approvals and failures of one batch in separate notifications', () => {
    const results = exemptionApprovalResults(
      report({
        approved: [
          {
            exemptionNumber: 'TEST-8821',
            email: {
              status: 'sent',
              ownerEmail: 'owner@example.test',
              agentEmail: 'agent@example.test',
            },
          },
          {
            exemptionNumber: 'TEST-8820',
            email: { status: 'sent', ownerEmail: 'billing@example.test', agentEmail: '' },
          },
        ],
        failures: [
          {
            exemptionNumber: 'TEST-8819',
            message:
              'The approval volume (342.5 m³) is less than the total requested volume (400.0 m³). Enter an approval volume of at least 400.0 m³.',
          },
        ],
      }),
      (exemptionNumber) => ({ to: `/provincial/exemption/${exemptionNumber}` }),
    )

    expect(results).toEqual([
      {
        kind: 'success',
        title: '2 exemptions approved and now Active. Approval emails sent:',
        message: '',
        items: [
          {
            id: 'TEST-8821',
            text: ' to the owner (owner@example.test) and the agent (agent@example.test).',
            to: '/provincial/exemption/TEST-8821',
          },
          {
            id: 'TEST-8820',
            text: ' to the owner (billing@example.test).',
            to: '/provincial/exemption/TEST-8820',
          },
        ],
      },
      {
        kind: 'error',
        title: '1 exemption was not approved',
        message:
          'It stays in New status and no email was sent. Correct the details below, then approve again.',
        items: [
          {
            id: 'TEST-8819',
            text: ': The approval volume (342.5 m³) is less than the total requested volume (400.0 m³). Enter an approval volume of at least 400.0 m³.',
            to: '/provincial/exemption/TEST-8819',
          },
        ],
      },
    ])
  })

  it('gives a single approval one notification without a list', () => {
    expect(
      exemptionApprovalResults(
        report({
          approved: [
            {
              exemptionNumber: 'TEST-1',
              email: { status: 'sent', ownerEmail: 'owner@example.test', agentEmail: '' },
            },
          ],
          notes: ['Refresh the page to see the latest status.'],
        }),
      ),
    ).toEqual([
      {
        kind: 'warning',
        title: 'Exemption approved and now Active.',
        message:
          'Approval email sent to the owner (owner@example.test). Refresh the page to see the latest status.',
      },
    ])
  })

  it('keeps email problems with the approvals and unconfirmed approvals with the failures', () => {
    const results = exemptionApprovalResults(
      report({
        approved: [
          {
            exemptionNumber: 'TEST-1',
            email: { status: 'sent', ownerEmail: 'owner@example.test', agentEmail: '' },
          },
          { exemptionNumber: 'TEST-2', email: { status: 'notSent', reason: 'Mail server busy' } },
          { exemptionNumber: 'TEST-3', email: { status: 'unknown' } },
        ],
        failures: [{ exemptionNumber: 'TEST-4', message: 'Rejected.' }],
        unconfirmedNumbers: ['TEST-5'],
      }),
    )

    expect(results.map(({ kind, title }) => [kind, title])).toEqual([
      ['warning', '3 exemptions approved and now Active.'],
      ['error', '2 exemptions were not approved or could not be confirmed'],
    ])
    expect(results[0].items?.map(({ id, text }) => `${id}${text}`)).toEqual([
      'TEST-1: Approval email sent to the owner (owner@example.test).',
      'TEST-2: The approval email was not sent. Mail server busy.',
      'TEST-3: The approval email status could not be confirmed. Check whether it was sent before sending it again.',
    ])
    expect(results[1].items?.map(({ id, text }) => `${id}${text}`)).toEqual([
      'TEST-4: Rejected.',
      'TEST-5: The approval could not be confirmed. Check its current status before approving again.',
    ])
  })

  it('reports only unconfirmed approvals as a warning', () => {
    expect(exemptionApprovalResults(report({ unconfirmedNumbers: ['TEST-1', 'TEST-2'] }))).toEqual([
      {
        kind: 'warning',
        title: '2 approvals could not be confirmed',
        message: 'No approval emails were sent.',
        items: [
          {
            id: 'TEST-1',
            text: ': The approval could not be confirmed. Check its current status before approving again.',
          },
          {
            id: 'TEST-2',
            text: ': The approval could not be confirmed. Check its current status before approving again.',
          },
        ],
      },
    ])
  })

  it('names skipped emails and plural failures', () => {
    const results = exemptionApprovalResults(
      report({
        approved: [
          { exemptionNumber: 'TEST-1', email: { status: 'skipped' } },
          { exemptionNumber: 'TEST-2', email: { status: 'skipped' } },
        ],
        failures: [
          { exemptionNumber: 'TEST-3', message: 'Rejected' },
          { exemptionNumber: 'TEST-4', message: '' },
        ],
      }),
    )

    expect(results[0]).toMatchObject({
      title: '2 exemptions approved and now Active.',
      message: 'Approval emails were not sent.',
      items: [
        { id: 'TEST-1', text: '' },
        { id: 'TEST-2', text: '' },
      ],
    })
    expect(results[1]).toMatchObject({
      title: '2 exemptions were not approved',
      message:
        'They stay in New status and no emails were sent. Correct the details below, then approve again.',
      items: [
        { id: 'TEST-3', text: ': Rejected.' },
        { id: 'TEST-4', text: ': The exemption could not be approved.' },
      ],
    })
  })
})
