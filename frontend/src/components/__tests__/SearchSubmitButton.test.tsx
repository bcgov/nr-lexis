import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SearchSubmitButton from '../SearchSubmitButton'

const renderInForm = (props: { loading: boolean; disabled?: boolean }) => {
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
  const view = render(
    <form onSubmit={onSubmit}>
      <input aria-label="Application number" />
      <SearchSubmitButton {...props} />
    </form>,
  )
  return { ...view, onSubmit }
}

describe('SearchSubmitButton', () => {
  it('keeps its label and icon while a search runs', () => {
    const { container } = renderInForm({ loading: true })

    const search = screen.getByRole('button', { name: 'Search' })
    expect(search).toHaveAttribute('aria-disabled', 'true')
    expect(search).not.toBeDisabled()
    expect(search.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('.cds--loading')).not.toBeInTheDocument()
    expect(screen.queryByText(/Searching/)).not.toBeInTheDocument()
  })

  it('keeps focus and ignores clicks and Enter while a search runs', async () => {
    const { onSubmit, rerender } = renderInForm({ loading: false })
    const search = screen.getByRole('button', { name: 'Search' })

    await userEvent.click(search)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    rerender(
      <form onSubmit={onSubmit}>
        <input aria-label="Application number" />
        <SearchSubmitButton loading />
      </form>,
    )
    expect(search).toHaveFocus()
    await userEvent.click(search)
    await userEvent.type(screen.getByLabelText('Application number'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)

    rerender(
      <form onSubmit={onSubmit}>
        <input aria-label="Application number" />
        <SearchSubmitButton loading={false} />
      </form>,
    )
    expect(search).not.toHaveAttribute('aria-disabled')
    fireEvent.click(search)
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('stays disabled while the filters are invalid', () => {
    renderInForm({ loading: false, disabled: true })

    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })
})
