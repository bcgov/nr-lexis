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

const liveRegion = (): Element | null | undefined =>
  screen
    .getByLabelText('Remark')
    .closest('.remark-text-area')
    ?.querySelector('[aria-live="polite"]')

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

  it('describes the field with the character limit', () => {
    render(<RemarkField />)
    expect(screen.getByLabelText('Remark')).toHaveAccessibleDescription('Character limit 250')
  })

  it('announces nothing while well under the limit', () => {
    render(<RemarkField initialValue={'R'.repeat(239)} />)
    expect(liveRegion()).toHaveTextContent('')
  })

  it.each([
    [240, '10 characters left.'],
    [249, '1 character left.'],
    [250, 'Maximum characters reached.'],
  ])('announces the remaining count at %i stored characters', (length, announcement) => {
    render(<RemarkField initialValue={'R'.repeat(length)} />)
    expect(liveRegion()).toHaveTextContent(announcement)
  })

  it('announces the remaining count in stored characters', async () => {
    render(<RemarkField initialValue={'R'.repeat(235)} />)
    expect(liveRegion()).toHaveTextContent('')

    await userEvent.type(screen.getByLabelText('Remark'), '&')
    expect(counter()).toHaveTextContent('240/250')
    expect(liveRegion()).toHaveTextContent('10 characters left.')
  })

  it('announces how far a remark is over the limit once stored', () => {
    const { unmount } = render(<RemarkField initialValue={`${'R'.repeat(246)}&`} />)
    expect(liveRegion()).toHaveTextContent('1 character over the limit.')
    unmount()

    render(<RemarkField initialValue={`${'R'.repeat(245)}&&&`} />)
    expect(liveRegion()).toHaveTextContent('10 characters over the limit.')
  })

  it('keeps the counter out of the accessibility tree and stops typing at 250 characters', async () => {
    render(<RemarkField />)
    expect(counter()).toHaveAttribute('aria-hidden', 'true')

    await userEvent.type(screen.getByLabelText('Remark'), 'R'.repeat(251))
    expect(screen.getByLabelText('Remark')).toHaveValue('R'.repeat(250))
  })
})
