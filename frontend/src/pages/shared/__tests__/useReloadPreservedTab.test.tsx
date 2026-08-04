import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'

const TABS = ['summary', 'documents'] as const

const TabHarness = () => {
  const [selectedTab, selectTab] = useReloadPreservedTab({
    tabs: TABS,
    defaultTab: 'summary',
  })

  return (
    <>
      <div data-testid="selected-tab">{selectedTab}</div>
      <button type="button" onClick={() => selectTab('summary')}>
        Select summary
      </button>
    </>
  )
}

describe('useReloadPreservedTab', () => {
  it('restores a valid tab and updates the current navigation entry', async () => {
    const router = createMemoryRouter([{ path: '/record/:recordId', element: <TabHarness /> }], {
      initialEntries: [
        {
          pathname: '/record/1',
          state: {
            lexisDetailTab: 'documents',
            unrelatedState: 'preserved',
          },
        },
      ],
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByTestId('selected-tab')).toHaveTextContent('documents')

    await userEvent.click(screen.getByRole('button', { name: 'Select summary' }))

    await waitFor(() => {
      expect(router.state.location.state).toEqual({
        lexisDetailTab: 'summary',
        unrelatedState: 'preserved',
      })
    })
    expect(router.state.location.pathname).toBe('/record/1')
  })
})
