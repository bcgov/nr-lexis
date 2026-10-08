import { useRef, useState } from 'react'
import { Button, TextInput } from '@carbon/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useFieldErrors } from '@/pages/shared/useFieldErrors'

type Field = 'timberMark' | 'volume'

const Harness = ({ onSave }: { onSave: () => void }) => {
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState<Record<Field, string>>({ timberMark: 'ABC', volume: '' })
  const { invalidProps, clearFieldError, showFieldErrors } = useFieldErrors<Field>()

  const update = (field: Field, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    clearFieldError(field)
  }

  return (
    <form ref={formRef} aria-label="Scale">
      <TextInput
        id="timber-mark"
        labelText="Timber mark"
        value={form.timberMark}
        onChange={(event) => update('timberMark', event.target.value)}
        {...invalidProps('timberMark')}
      />
      <TextInput
        id="volume"
        labelText="Volume (m³)"
        helperText="Up to the remaining package volume."
        value={form.volume}
        onChange={(event) => update('volume', event.target.value)}
        {...invalidProps('volume')}
      />
      <Button
        size="md"
        onClick={() => {
          const valid = showFieldErrors(
            {
              timberMark: form.timberMark.trim() ? undefined : 'Enter a timber mark.',
              volume: Number(form.volume) > 0 ? undefined : 'Enter a volume greater than 0.',
            },
            () => formRef.current,
          )
          if (valid) onSave()
        }}
      >
        Save
      </Button>
    </form>
  )
}

describe('useFieldErrors', () => {
  it('shows errors on their fields on Save, focuses the first, and clears each once fixed', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    const volume = screen.getByRole('textbox', { name: 'Volume (m³)' })
    expect(screen.getByText('Up to the remaining package volume.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(volume).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a volume greater than 0')).toBeVisible()
    expect(screen.queryByText('Up to the remaining package volume.')).not.toBeInTheDocument()
    await waitFor(() => expect(volume).toHaveFocus())

    await user.type(volume, '2')

    expect(volume).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Enter a volume greater than 0')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
