import { Button } from '@carbon/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'

describe('DisabledButtonTooltip', () => {
  it('explains a disabled button on hover and keyboard focus', async () => {
    render(
      <DisabledButtonTooltip disabled description="Enter an application number to add it.">
        <Button disabled>Add application</Button>
      </DisabledButtonTooltip>,
    )

    const button = screen.getByRole('button', { name: 'Add application' })
    const trigger = button.parentElement as HTMLElement

    expect(button).toBeDisabled()
    expect(trigger).toHaveClass('disabled-button-tooltip')
    expect(trigger).toHaveAttribute('tabindex', '0')
    expect(trigger.closest('.cds--popover-container')).toHaveClass('cds--popover--auto-align')

    await userEvent.hover(trigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Enter an application number to add it.',
    )
  })

  it('does not add a tooltip wrapper while the button is enabled', () => {
    render(
      <DisabledButtonTooltip disabled={false} description="Enter an application number to add it.">
        <Button>Add application</Button>
      </DisabledButtonTooltip>,
    )

    const button = screen.getByRole('button', { name: 'Add application' })

    expect(button).toBeEnabled()
    expect(button.parentElement).not.toHaveClass('disabled-button-tooltip')
  })
})
