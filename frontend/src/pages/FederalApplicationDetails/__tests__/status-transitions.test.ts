import { describe, expect, it } from 'vitest'
import {
  allowedFederalStatusTransitions,
  federalStatusReadOnlyMessage,
} from '../status-transitions'

describe('federal application status transitions', () => {
  it.each(['NEW', 'PND'])('offers only approval from %s', (currentStatus) => {
    expect(allowedFederalStatusTransitions(currentStatus, '2026-07-11', '2026-07-11')).toEqual([
      { code: 'APP', label: 'Approved' },
    ])
  })

  it('offers rejection and withdrawal through the listing day', () => {
    expect(allowedFederalStatusTransitions('APP', '2026-07-11', '2026-07-11')).toEqual([
      { code: 'REJ', label: 'Rejected' },
      { code: 'WDN', label: 'Withdrawn' },
    ])
  })

  it('becomes read only on the day after listing', () => {
    expect(allowedFederalStatusTransitions('APP', '2026-07-11', '2026-07-12')).toEqual([])
    expect(federalStatusReadOnlyMessage('APP', '2026-07-11', '2026-07-12')).toBe(
      'Status changes are read only because the listing day has passed.',
    )
  })

  it('fails closed for missing listing dates and terminal statuses', () => {
    expect(allowedFederalStatusTransitions('APP', null, '2026-07-11')).toEqual([])
    expect(allowedFederalStatusTransitions('REJ', '2026-07-11', '2026-07-11')).toEqual([])
    expect(federalStatusReadOnlyMessage('APP', null, '2026-07-11')).toContain(
      'valid listing date is unavailable',
    )
    expect(federalStatusReadOnlyMessage('REJ', '2026-07-11', '2026-07-11')).toBe(
      'No status changes are available from REJ.',
    )
  })
})
