import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addApplicationToExemption,
  approveExemptions,
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  releaseExemptionEditLock,
  removeApplicationFromExemption,
  sendExemptionApprovalEmails,
  updateExemption,
} from '@/service/provincial-exemption-detail-service'

const { getMock, postMock, deleteMock, registerRecordVersionMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
  registerRecordVersionMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    registerRecordVersion: registerRecordVersionMock,
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
      delete: deleteMock,
    }),
  },
}))

describe('provincial exemption detail service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an empty edit-context response instead of treating it as editable state', async () => {
    getMock.mockResolvedValue({ data: undefined, status: 204 })

    await expect(fetchExemptionEditContext('BOIC-205')).rejects.toThrow(
      'Unexpected exemption edit context payload.',
    )
  })

  it('parses a complete edit-context response', async () => {
    getMock.mockResolvedValue({
      data: {
        rateOverrideEnabled: false,
        fixedFeeRate: '',
        regionNumbers: [1903, 1904],
        locked: false,
        lockMessage: '',
      },
    })

    await expect(fetchExemptionEditContext(' BOIC-205 ')).resolves.toEqual({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/edit-context', {
      params: { exemptionNumber: 'BOIC-205' },
    })
    expect(registerRecordVersionMock).toHaveBeenCalledWith(
      'exemption',
      'BOIC-205',
      expect.any(Object),
      '/lexis/rpc/exemption-details/edit-context',
      { params: { exemptionNumber: 'BOIC-205' } },
    )
  })

  it('parses authoritative permit rows including record-specific visibility', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          permitNumber: 900101,
          permitVolume: '25.5',
          permitStatus: 'Active',
          permitIssueDate: '12-Jul-2026',
          canViewPermit: true,
        },
        {
          permitNumber: 900102,
          permitVolume: '14.0',
          permitStatus: 'Complete',
          permitIssueDate: '10-Jul-2026',
          canViewPermit: false,
        },
      ],
    })

    await expect(fetchExemptionPermits(' EX-777 ')).resolves.toEqual([
      {
        permitNumber: '900101',
        permitVolume: '25.5',
        permitStatus: 'Active',
        permitIssueDate: '12-Jul-2026',
        canViewPermit: true,
      },
      {
        permitNumber: '900102',
        permitVolume: '14.0',
        permitStatus: 'Complete',
        permitIssueDate: '10-Jul-2026',
        canViewPermit: false,
      },
    ])
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/permits', {
      params: { exemptionNumber: 'EX-777' },
    })
  })

  it('rejects permit rows without an explicit visibility decision', async () => {
    getMock.mockResolvedValue({
      data: [{ permitNumber: 900101, permitStatus: 'Active' }],
    })

    await expect(fetchExemptionPermits('EX-777')).rejects.toThrow(
      'Unexpected exemption permit payload.',
    )
  })

  it('parses Blanket OIC permit volume totals', async () => {
    getMock.mockResolvedValue({
      data: { requestedVolume: '500.0', completedVolume: 125.5 },
    })

    await expect(fetchExemptionBlanketOicTotals(' BOIC-205 ')).resolves.toEqual({
      requestedVolume: '500.0',
      completedVolume: '125.5',
    })
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/blanket-oic-totals', {
      params: { exemptionNumber: 'BOIC-205' },
    })
  })

  it('parses associated applications and trims the exemption key', async () => {
    getMock.mockResolvedValue({
      data: {
        applications: [
          {
            applicationNumber: 1000456,
            requestedVolume: 25.5,
            scaleVolume: '10.0',
            locked: true,
            jurisdiction: 'P',
          },
        ],
        containsUnmanu: true,
        ownerNumber: 12345,
      },
    })

    await expect(fetchExemptionApplications(' EX-777 ')).resolves.toEqual({
      applications: [
        {
          applicationNumber: '1000456',
          requestedVolume: '25.5',
          scaleVolume: '10.0',
          locked: true,
          jurisdiction: 'P',
        },
      ],
      containsUnmanu: true,
      ownerNumber: '12345',
    })
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/applications', {
      params: { exemptionNumber: 'EX-777' },
    })
  })

  it('serializes application association mutations with normalized identifiers', async () => {
    postMock.mockResolvedValue({ data: { success: true, errors: [] } })
    deleteMock.mockResolvedValue({ data: { success: false, errors: ['Association is locked.'] } })

    await expect(addApplicationToExemption(' EX-777 ', ' 1000456 ')).resolves.toMatchObject({
      success: true,
      message: 'Application association updated.',
    })

    const [addPath, addBody, addConfig] = postMock.mock.calls[0]
    expect(addPath).toBe('/lexis/rpc/exemption-details/application')
    expect([...addBody.entries()]).toEqual([
      ['exemptionNumber', 'EX-777'],
      ['applicationNumber', '1000456'],
    ])
    expect(addConfig).toEqual({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    await expect(removeApplicationFromExemption(' EX-777 ', ' 1000456 ')).resolves.toMatchObject({
      success: false,
      message: 'Association is locked.',
      errors: ['Association is locked.'],
    })
    expect(deleteMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/application', {
      params: { exemptionNumber: 'EX-777', applicationNumber: '1000456' },
    })
  })

  it('serializes exemption updates including repeated regions and managed fee fields', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'Saved.',
        exemptionNumber: 'EX-777',
        warnings: ['Review the expiry date.'],
      },
    })

    await expect(
      updateExemption({
        exemptionNumber: ' EX-777 ',
        approvedVolume: ' 125.5 ',
        approvalDate: ' 2026-07-01 ',
        expiryDate: ' 2027-07-01 ',
        otherConditions: ' Ship before expiry. ',
        exemptionTypeCode: ' M ',
        exemptionStatusCode: ' ACT ',
        manageFeeRate: true,
        enableRateOverride: true,
        feeRate: ' 4.25 ',
        regionNumbers: [' 1903 ', '1904'],
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Saved.',
      exemptionNumber: 'EX-777',
      errors: [],
      warnings: ['Review the expiry date.'],
    })

    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/exemption-details/exemption/update')
    expect(body.get('exemptionNumber')).toBe('EX-777')
    expect(body.get('legacyExemptionNumber')).toBe('EX-777')
    expect(body.get('approvedVolume')).toBe('125.5')
    expect(body.get('approvalDate')).toBe('2026-07-01')
    expect(body.get('exemptionExpiryDate')).toBe('2027-07-01')
    expect(body.get('otherConditions')).toBe('Ship before expiry.')
    expect(body.get('exemptionTypeCode')).toBe('M')
    expect(body.get('exemptionStatusCode')).toBe('ACT')
    expect(body.get('feeRate')).toBe('4.25')
    expect(body.get('enableRateOverride')).toBe('true')
    expect(body.getAll('region')).toEqual(['1903', '1904'])
    expect(config).toEqual({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  })

  it('omits fee controls when the current role cannot manage the fee rate', async () => {
    postMock.mockResolvedValue({ data: { success: true, exemptionNumber: 'EX-777' } })

    await updateExemption({
      exemptionNumber: 'EX-777',
      approvedVolume: '125.5',
      approvalDate: '2026-07-01',
      expiryDate: '2027-07-01',
      otherConditions: '',
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'ACT',
      manageFeeRate: false,
      enableRateOverride: true,
      feeRate: '4.25',
      regionNumbers: [],
    })

    const body = postMock.mock.calls[0][1]
    expect(body.has('feeRate')).toBe(false)
    expect(body.has('enableRateOverride')).toBe(false)
  })

  it('normalizes approval requests and filters malformed email rows', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        valid: true,
        sendGrid: [
          ['EX-777', 'owner@example.com'],
          ['', 'missing-number@example.com'],
          ['EX-778'],
          'invalid',
        ],
        errors: [],
        warnings: ['One exemption has no client email.'],
      },
    })

    await expect(approveExemptions([' EX-777 ', '', ' EX-778 '])).resolves.toEqual({
      success: true,
      valid: true,
      sendGrid: [['EX-777', 'owner@example.com']],
      errorMessage: '',
      errors: [],
      warnings: ['One exemption has no client email.'],
    })

    const [path, body] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/exemption-details/approve-exemptions')
    expect(body.get('exemptionNumbers')).toBe('EX-777,EX-778')
  })

  it('serializes approval email recipients and short-circuits an empty recipient list', async () => {
    await expect(
      sendExemptionApprovalEmails([
        ['', ''],
        ['EX-777', ''],
      ]),
    ).resolves.toEqual({ success: false, message: 'No client email address was available.' })
    expect(postMock).not.toHaveBeenCalled()

    postMock.mockResolvedValue({ data: { success: true, message: 'Queued.' } })
    await expect(
      sendExemptionApprovalEmails([
        [' EX-777 ', ' owner@example.com '],
        ['EX-778', 'other@example.com'],
      ]),
    ).resolves.toEqual({ success: true, message: 'Queued.' })

    const [path, body] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/exemption-details/approval-emails')
    expect(body.get('sendGrid')).toBe('EX-777:owner@example.com,EX-778:other@example.com')
  })

  it('treats edit-lock release as best-effort cleanup', async () => {
    postMock.mockRejectedValue(new Error('connection lost'))

    await expect(releaseExemptionEditLock(' EX-777 ')).resolves.toBeUndefined()
    expect(postMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/release-lock', null, {
      params: { exemptionNumber: 'EX-777' },
    })
  })
})
