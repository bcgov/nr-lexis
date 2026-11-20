import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import RecordHeaderSubtitle, { type RelatedRecordLink } from '@/components/RecordHeaderSubtitle'

const applicationRecords = (count: number): RelatedRecordLink[] =>
  Array.from({ length: count }, (_, index) => {
    const recordNumber = String(47200 + index)
    return { recordNumber, to: `/provincial/application/${recordNumber}` }
  })

const renderSubtitle = (applications: RelatedRecordLink[], permits: RelatedRecordLink[] = []) =>
  render(
    <MemoryRouter>
      <RecordHeaderSubtitle
        relatedRecordGroups={[
          {
            label: 'Application number',
            pluralLabel: 'Application numbers',
            records: applications,
          },
          { label: 'Permit number', pluralLabel: 'Permit numbers', records: permits },
        ]}
        author={'IDIR\\SAMPLE'}
      />
    </MemoryRouter>,
  )

const subtitleItems = (container: HTMLElement): (string | null)[] =>
  Array.from(
    container.querySelectorAll('.record-header-subtitle__item'),
    (item) => item.textContent,
  )

describe('RecordHeaderSubtitle', () => {
  it('names each related record group and leaves out empty groups', () => {
    const { container } = renderSubtitle(applicationRecords(1))

    expect(subtitleItems(container)).toEqual(['Application number: 47200', 'Author: IDIR\\SAMPLE'])
    expect(screen.getByRole('link', { name: '47200' })).toHaveAttribute(
      'href',
      '/provincial/application/47200',
    )
  })

  it('shows a record the user cannot open as plain text', () => {
    const { container } = renderSubtitle(applicationRecords(2), [{ recordNumber: '9021135' }])

    expect(subtitleItems(container)).toEqual([
      'Application numbers: 47200, 47201',
      'Permit number: 9021135',
      'Author: IDIR\\SAMPLE',
    ])
    expect(screen.queryByRole('link', { name: '9021135' })).not.toBeInTheDocument()
  })

  it('shows five records of a long list until all are asked for', async () => {
    const { container } = renderSubtitle(applicationRecords(23))
    const applicationItem = container.querySelector('.record-header-subtitle__item') as HTMLElement

    expect(within(applicationItem).getAllByRole('link')).toHaveLength(5)
    const showAll = within(applicationItem).getByRole('button', { name: '+18 more' })
    expect(showAll).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(showAll)
    expect(within(applicationItem).getAllByRole('link')).toHaveLength(23)
    const showFewer = within(applicationItem).getByRole('button', { name: 'Show fewer' })
    expect(showFewer).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(showFewer)
    expect(within(applicationItem).getAllByRole('link')).toHaveLength(5)
  })

  it('shows every record when the list has five', () => {
    renderSubtitle(applicationRecords(5))

    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
