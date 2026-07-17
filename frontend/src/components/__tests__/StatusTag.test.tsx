import { render, screen } from '@testing-library/react'

import StatusTag, { getStatusTagVariant, type StatusTagVariant } from '@/components/StatusTag'

describe('StatusTag', () => {
  it.each<[string, StatusTagVariant]>([
    ['APP - Approved', 'positive'],
    ['ACT', 'positive'],
    ['COM - Complete', 'positive'],
    ['PMT - Permitted', 'positive'],
    ['NEW', 'informative'],
    ['Submitted', 'informative'],
    ['Draft', 'draft'],
    ['PND - Pending', 'pending'],
    ['Under review', 'pending'],
    ['REJ - Rejected', 'negative'],
    ['Validation failed', 'negative'],
    ['Not approved', 'negative'],
    ['Disapproved', 'negative'],
    ['Unapproved', 'negative'],
    ['APP - Not approved', 'negative'],
    ['EXP - Expired', 'expired'],
    ['CAN - Cancelled', 'cancelled'],
    ['WDN - Withdrawn', 'inactive'],
    ['Inactive', 'inactive'],
    ['Updated', 'updated'],
    ['Unmapped status', 'neutral'],
  ])('maps %s to the %s semantic variant', (status, expectedVariant) => {
    expect(getStatusTagVariant(status)).toBe(expectedVariant)
  })

  it('renders the supplied status and exposes its resolved semantic variant', () => {
    render(<StatusTag status="APP - Approved" className="application-status" />)

    expect(screen.getByText('APP - Approved')).toHaveClass('lexis-status-tag', 'application-status')
    expect(screen.getByText('APP - Approved')).toHaveAttribute('data-status-variant', 'positive')
  })

  it('supports an explicit variant and a safe label for blank statuses', () => {
    render(<StatusTag status="  " variant="pending" fallbackLabel="Status unavailable" />)

    expect(screen.getByText('Status unavailable')).toHaveAttribute('data-status-variant', 'pending')
  })
})
