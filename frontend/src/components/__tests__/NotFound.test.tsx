import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NotFound from '@/components/NotFound'

describe('NotFound', () => {
  test('renders a heading with the correct text', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    const headingElement = screen.getByRole('heading', { level: 1, name: 'Page not found' })
    expect(headingElement).toBeInTheDocument()
    expect(screen.getByText("The page you're looking for does not exist.")).toBeVisible()
  })

  test('names the browser tab after the heading and restores the previous name on leave', async () => {
    document.title = 'Provincial applications'
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <Routes>
          <Route path="/" element={<p>Landing</p>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(document.title).toBe('Page not found')

    await userEvent.click(screen.getByRole('button', { name: 'Go to my landing page' }))

    expect(document.title).toBe('Provincial applications')
  })

  test('sends the user to their landing page', async () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <Routes>
          <Route path="/" element={<p>Landing</p>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Go to my landing page' }))

    expect(screen.getByText('Landing')).toBeVisible()
  })
})
