import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForestClientComboBox from '../ForestClientComboBox'
import { searchForestClients } from '@/service/client-search-service'
import { AuthContext } from '@/context/auth/AuthContext'
import type { AuthContextType } from '@/context/auth/types'

vi.mock('@/service/client-search-service', () => ({ searchForestClients: vi.fn() }))
const search = vi.mocked(searchForestClients)
const sample = { clientNumber: '00012345', companyName: 'Sample Forest', clientAcronym: '' }
Element.prototype.scrollIntoView = vi.fn()

function Harness({ initial = '', counterparty = '', resetKey = 0, disabled = false }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <ForestClientComboBox
        id="client"
        labelText="Client"
        value={value}
        onChange={setValue}
        counterpartyClientNumber={counterparty}
        resetKey={resetKey}
        required
        disabled={disabled}
      />
      <span data-testid="value">{value}</span>
      <button onClick={() => setValue('')}>Reset selected client</button>
    </>
  )
}
const input = () => screen.getByRole('combobox', { name: 'Client' })
const type = (text: string) => fireEvent.change(input(), { target: { value: text } })
const tick = async (ms = 300) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('ForestClientComboBox', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    search.mockReset()
    search.mockResolvedValue([sample])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for three characters and debounces the current query', async () => {
    render(<Harness />)
    expect(input()).toHaveAttribute('aria-required', 'true')
    expect(screen.getByText('Enter name or client number (min. 3 characters)')).toBeVisible()
    type('Sa')
    await tick()
    expect(search).not.toHaveBeenCalled()
    type('Sam')
    await tick(200)
    type('Samp')
    await tick(299)
    expect(search).not.toHaveBeenCalled()
    await tick(1)
    expect(search).toHaveBeenCalledExactlyOnceWith('Samp', '')
    expect(screen.getByRole('option', { name: 'Sample Forest · 00012345' })).toBeVisible()
  })

  it('stores only the selected number and clears it when the label is edited', async () => {
    render(<Harness />)
    type('Sam')
    await tick()
    fireEvent.click(screen.getByRole('option', { name: 'Sample Forest · 00012345' }))
    expect(screen.getByTestId('value')).toHaveTextContent('00012345')
    expect(input()).toHaveValue('Sample Forest · 00012345')
    type('Other')
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    expect(input()).toHaveValue('Other')
    await tick()
    expect(search).toHaveBeenLastCalledWith('Other', '')
  })

  it('selects a suggestion by keyboard', async () => {
    render(<Harness />)
    type('Sam')
    await tick()
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
    expect(screen.getByTestId('value')).toHaveTextContent('00012345')
  })

  it('shows a restored number and supports clearing it', () => {
    render(<Harness initial="00012345" />)
    expect(input()).toHaveValue('00012345')
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected item' }))
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    expect(input()).toHaveValue('')
  })

  it('reopens the selected client as the highlighted current option without another search', async () => {
    search.mockResolvedValueOnce([
      sample,
      { clientNumber: '00054321', companyName: 'Sample Other Forest', clientAcronym: '' },
    ])
    render(<Harness />)
    type('Sam')
    await tick()
    fireEvent.click(screen.getByRole('option', { name: 'Sample Forest · 00012345' }))

    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Clear selected item' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open' })).toBeVisible()
    fireEvent.click(input())

    expect(input()).toHaveAttribute('aria-expanded', 'true')
    const selectedOption = screen.getByRole('option', { name: 'Sample Forest · 00012345' })
    expect(selectedOption).toHaveAttribute('aria-selected', 'true')
    expect(selectedOption).toHaveClass('cds--list-box__menu-item--active')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.queryByRole('option', { name: /Sample Other Forest/ })).not.toBeInTheDocument()
    fireEvent.click(selectedOption)
    await tick()

    expect(screen.getByTestId('value')).toHaveTextContent('00012345')
    expect(input()).toHaveValue('Sample Forest · 00012345')
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('opens a restored selection with the chevron and retains it with keyboard selection', async () => {
    render(<Harness initial="00012345" />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('option', { name: '00012345' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })
    await tick()

    expect(screen.getByTestId('value')).toHaveTextContent('00012345')
    expect(input()).toHaveValue('00012345')
    expect(search).not.toHaveBeenCalled()
  })

  it('keeps a disabled selected client unchanged and does not expose suggestions', async () => {
    render(<Harness initial="00012345" disabled />)

    expect(input()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear selected item' })).toBeDisabled()
    fireEvent.click(input())
    await tick()

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('00012345')
    expect(search).not.toHaveBeenCalled()
  })

  it('resets a selected client when the parent clears it', async () => {
    render(<Harness />)
    type('Sam')
    await tick()
    fireEvent.click(screen.getByRole('option', { name: 'Sample Forest · 00012345' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset selected client' }))
    expect(input()).toHaveValue('')
  })

  it('discards an old response after the query changes', async () => {
    let resolve!: (value: (typeof sample)[]) => void
    search.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    render(<Harness />)
    type('Sam')
    await tick()
    type('Nope')
    await act(async () => resolve([sample]))
    expect(screen.queryByRole('option', { name: /Sample Forest/ })).not.toBeInTheDocument()
    search.mockResolvedValueOnce([])
    await tick()
    expect(screen.getByRole('status')).toHaveTextContent('No matching clients.')
  })

  it('clears old results and ignores pending responses after the counterparty changes', async () => {
    let resolve!: (value: (typeof sample)[]) => void
    search.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { rerender } = render(<Harness counterparty="00011111" />)
    type('Sam')
    await tick()
    rerender(<Harness counterparty="00022222" />)
    await act(async () => resolve([sample]))
    expect(screen.queryByRole('option', { name: /Sample Forest/ })).not.toBeInTheDocument()
    await tick()
    expect(search).toHaveBeenLastCalledWith('Sam', '00022222')
  })

  it('distinguishes failure from no matches and retries the same query', async () => {
    search.mockRejectedValueOnce(new Error('Unavailable'))
    render(<Harness />)
    type('Sam')
    await tick()
    expect(screen.getByRole('status')).toHaveTextContent('Unable to search clients.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await tick()
    expect(search).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('option', { name: /Sample Forest/ })).toBeVisible()
  })

  it('clears unselected text on a parent reset and does not search disabled fields', async () => {
    const { rerender } = render(<Harness />)
    type('Sam')
    rerender(<Harness resetKey={1} disabled />)
    expect(input()).toHaveValue('')
    expect(input()).toBeDisabled()
    await tick()
    expect(search).not.toHaveBeenCalled()
  })

  it('discards pending suggestions when the authenticated client changes', async () => {
    let resolve!: (value: (typeof sample)[]) => void
    search.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const auth = (forestClientNumber: string): AuthContextType => ({
      capabilities: {
        authenticated: true,
        principal: 'sample-user',
        roles: ['SUBMITTER'],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: [],
        forestClientNumber,
        availableForestClientNumbers: ['00011111', '00022222'],
        forestClientSelectionRequired: false,
      },
      isLoading: false,
      isLoggedIn: true,
      hasAnyRole: true,
      usesExternalLogin: true,
      defaultRoute: '/',
      refresh: vi.fn(),
      selectForestClient: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      canPerform: () => true,
    })
    const { rerender } = render(
      <AuthContext value={auth('00011111')}>
        <Harness />
      </AuthContext>,
    )
    type('Sam')
    await tick()
    expect(input()).toHaveAttribute('aria-busy', 'true')
    rerender(
      <AuthContext value={auth('00022222')}>
        <Harness />
      </AuthContext>,
    )
    await act(async () => resolve([sample]))
    expect(input()).toHaveValue('')
    expect(screen.queryByRole('option', { name: /Sample Forest/ })).not.toBeInTheDocument()
  })

  it('keeps a selected client on blur and clears unselected text with the clear button', async () => {
    render(<Harness />)
    type('Sam')
    await tick()
    fireEvent.click(screen.getByRole('option', { name: /Sample Forest/ }))
    fireEvent.blur(input())
    expect(screen.getByTestId('value')).toHaveTextContent('00012345')
    type('Other')
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected item' }))
    expect(input()).toHaveValue('')
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    await tick()
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('never treats unmatched text as a client number on blur or Enter', async () => {
    search.mockResolvedValue([])
    render(<Harness />)
    type('Missing client')
    await tick()
    fireEvent.keyDown(input(), { key: 'Enter' })
    fireEvent.blur(input())
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    expect(input()).toHaveValue('')
  })
})
