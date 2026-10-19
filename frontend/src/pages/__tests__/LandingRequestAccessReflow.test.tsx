import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ThemeProvider from '@/context/theme/ThemeProvider'
import LandingPage from '@/pages/Landing'
import { createLoggedOutTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('Landing request access reflow', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(createLoggedOutTestAuthContext())
  })

  it('offers a line break before the @ of each export office address', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Request access to LEXIS' })
    const [officeList] = within(dialog).getAllByRole('list')
    const links = within(officeList).getAllByRole('link')

    expect(links.map((link) => link.textContent)).toEqual([
      'Provincial.Log.Export.Analyst@gov.bc.ca',
      'NorthAreaExportScaling@gov.bc.ca',
      'Export.Applications@gov.bc.ca',
    ])
    for (const link of links) {
      const breakOpportunity = link.querySelector('wbr')
      expect(link.querySelectorAll('wbr')).toHaveLength(1)
      expect(breakOpportunity?.nextSibling?.textContent).toMatch(/^@/)
    }
  })
})
