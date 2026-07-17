import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import TableFrame from '@/components/TableFrame'

describe('TableFrame', () => {
  const renderFrame = () =>
    render(
      <TableFrame ariaLabel="Workflow table" className="dashboard-frame" data-testid="frame">
        <table>
          <tbody>
            <tr>
              <td>Applications</td>
            </tr>
          </tbody>
        </table>
      </TableFrame>,
    )

  it('does not add a keyboard stop when the table fits', () => {
    renderFrame()

    const viewport = screen.getByRole('region', { name: 'Workflow table' })
    expect(screen.getByTestId('frame')).toBe(viewport)
    expect(viewport).toHaveClass('lexis-table-frame', 'dashboard-frame')
    expect(viewport).not.toHaveAttribute('tabindex')
    expect(viewport).toContainElement(screen.getByRole('table'))
  })

  it('becomes keyboard-focusable when the table overflows', async () => {
    renderFrame()

    const viewport = screen.getByRole('region', { name: 'Workflow table' })
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 640 })
    fireEvent(window, new Event('resize'))

    await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'))
  })
})
