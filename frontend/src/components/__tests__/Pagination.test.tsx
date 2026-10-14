import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Pagination from '@/components/Pagination'

describe('Pagination', () => {
  it('groups item and page counts by thousands', () => {
    render(<Pagination page={1} pageSize={10} pageSizes={[10, 25]} totalItems={12_345} />)

    expect(screen.getByText('1–10 of 12,345 items')).toBeInTheDocument()
    expect(screen.getByText('of 1,235 pages')).toBeInTheDocument()
  })

  it('groups the item range when the total is not known yet', () => {
    render(
      <Pagination page={101} pageSize={10} pageSizes={[10, 25]} totalItems={1_011} pagesUnknown />,
    )

    expect(screen.getByText('1,001–1,010 items')).toBeInTheDocument()
  })
})
