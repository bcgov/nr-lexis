import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { RemarkTextArea } from '@/pages/shared/RemarkTextArea'

function RemarkField({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue)
  return (
    <RemarkTextArea
      id="remark"
      labelText="Remark"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

const counter = (): Element | null | undefined =>
  screen
    .getByLabelText('Remark')
    .closest('.remark-text-area')
    ?.querySelector('.cds--text-area__label-counter')

describe('RemarkTextArea', () => {
  it('counts typed text as it is stored', async () => {
    render(<RemarkField />)
    expect(counter()).toHaveTextContent('0/250')

    await userEvent.type(screen.getByLabelText('Remark'), 'ab')
    expect(counter()).toHaveTextContent('2/250')
  })

  it.each([
    ['&', 5],
    ['<', 4],
    ['>', 4],
  ])('counts %s as %i stored characters', async (character, stored) => {
    render(<RemarkField />)
    await userEvent.type(screen.getByLabelText('Remark'), character)
    expect(counter()).toHaveTextContent(`${stored}/250`)
  })

  it('passes the limit exactly when the stored remark is over 250', () => {
    const { unmount } = render(<RemarkField initialValue={`${'R'.repeat(245)}&`} />)
    expect(counter()).toHaveTextContent('250/250')
    unmount()

    render(<RemarkField initialValue={`${'R'.repeat(246)}&`} />)
    expect(counter()).toHaveTextContent('251/250')
  })

  it('keeps the counter out of the accessibility tree and stops typing at 250 characters', async () => {
    render(<RemarkField />)
    expect(counter()).toHaveAttribute('aria-hidden', 'true')

    await userEvent.type(screen.getByLabelText('Remark'), 'R'.repeat(251))
    expect(screen.getByLabelText('Remark')).toHaveValue('R'.repeat(250))
  })
})
