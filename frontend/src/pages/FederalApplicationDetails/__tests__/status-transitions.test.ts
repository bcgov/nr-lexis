import { describe, expect, it } from 'vitest'
import { allowedFederalStatusTransitions } from '../status-transitions'

describe('federal application status transitions', () => {
  it.each(['NEW', 'PND', ' new '])('offers no status change from %s', (currentStatus) => {
    expect(allowedFederalStatusTransitions(currentStatus, '2026-07-11', '2026-07-11')).toEqual([])
    expect(allowedFederalStatusTransitions(currentStatus, '2026-07-11', '2026-07-12')).toEqual([])
  })

  it('offers rejection and withdrawal through the listing day', () => {
    expect(allowedFederalStatusTransitions('APP', '2026-07-11', '2026-07-11')).toEqual([
      { code: 'WDN', label: 'Withdrawn', actionLabel: 'Withdraw' },
      { code: 'REJ', label: 'Rejected', actionLabel: 'Reject' },
    ])
  })

  it('offers no status action on the day after listing', () => {
    expect(allowedFederalStatusTransitions('APP', '2026-07-11', '2026-07-12')).toEqual([])
  })

  it('fails closed for missing listing dates and terminal statuses', () => {
    expect(allowedFederalStatusTransitions('APP', null, '2026-07-11')).toEqual([])
    expect(allowedFederalStatusTransitions('REJ', '2026-07-11', '2026-07-11')).toEqual([])
  })
})
