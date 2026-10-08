import { render, screen } from '@testing-library/react'
import { Dropdown, TextInput } from '@carbon/react'
import { describe, expect, it } from 'vitest'
import { focusFirstEditableField, focusFirstInvalidField } from '@/utils/focus'

describe('focusFirstEditableField', () => {
  it('skips disabled, read-only and hidden fields', () => {
    const { container } = render(
      <div>
        <input aria-label="Locked" disabled />
        <input aria-label="Read only" readOnly />
        <div hidden>
          <input aria-label="Hidden" />
        </div>
        <input type="hidden" aria-label="Hidden input" />
        <input aria-label="Client location" />
      </div>,
    )

    expect(focusFirstEditableField(container)).toBe(true)
    expect(screen.getByLabelText('Client location')).toHaveFocus()
  })

  it('focuses the checked option of a radio group', () => {
    const { container } = render(
      <fieldset>
        <legend>Override fees?</legend>
        <input type="radio" name="override" aria-label="No" defaultChecked />
        <input type="radio" name="override" aria-label="Yes" />
      </fieldset>,
    )
    const yes = screen.getByLabelText('Yes')
    ;(yes as HTMLInputElement).checked = true

    focusFirstEditableField(container)

    expect(yes).toHaveFocus()
  })

  it('reports when the container has no editable field yet', () => {
    const { container } = render(<p>Loading…</p>)

    expect(focusFirstEditableField(container)).toBe(false)
    expect(focusFirstEditableField(null)).toBe(false)
  })
})

describe('focusFirstInvalidField', () => {
  it('focuses the first invalid control, including one inside a Carbon dropdown', () => {
    const { container } = render(
      <div>
        <TextInput id="timber-mark" labelText="Timber mark" />
        <Dropdown
          id="species"
          titleText="Species"
          label="Choose an option"
          items={['Fir']}
          invalid
          invalidText="Select a species."
        />
        <TextInput id="volume" labelText="Volume" invalid invalidText="Enter a volume." />
      </div>,
    )

    expect(focusFirstInvalidField(container)).toBe(true)
    expect(screen.getByRole('combobox', { name: /Species/ })).toHaveFocus()
  })

  it('focuses an invalid text input', () => {
    const { container } = render(
      <TextInput id="volume" labelText="Volume" invalid invalidText="Enter a volume." />,
    )

    focusFirstInvalidField(container)

    expect(screen.getByRole('textbox', { name: 'Volume' })).toHaveFocus()
  })

  it('reports when nothing is invalid', () => {
    const { container } = render(<TextInput id="volume" labelText="Volume" />)

    expect(focusFirstInvalidField(container)).toBe(false)
  })
})
