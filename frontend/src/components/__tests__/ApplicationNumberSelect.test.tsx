import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ApplicationNumberSelect from '../ApplicationNumberSelect'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'

vi.mock('@/service/provincial-application-search-service', () => ({
  searchProvincialApplicationNumberOptions: vi.fn(),
}))

const mockedSearchProvincialApplicationNumberOptions = vi.mocked(
  searchProvincialApplicationNumberOptions,
)

describe('ApplicationNumberSelect', () => {
  it('searches application numbers and selects a database result', async () => {
    const onChange = vi.fn()
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([
      {
        value: '28077',
        label: '28077 - Approved - Owner 00016245 - Region RKB',
        status: 'Approved',
        applicantClientNumber: '',
        ownerClientNumber: '00016245',
        region: 'RKB',
        listingDate: '2012-05-11',
        exemptionNumber: '',
      },
    ])

    render(
      <ApplicationNumberSelect
        id="applicationNumber"
        labelText="Application Number (required)"
        value=""
        onChange={onChange}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Application Number (required)' })
    await userEvent.type(input, '28077')

    await waitFor(() => {
      expect(mockedSearchProvincialApplicationNumberOptions).toHaveBeenLastCalledWith('28077')
    })

    await userEvent.click(
      await screen.findByRole('option', {
        name: '28077 - Approved - Owner 00016245 - Region RKB',
      }),
    )

    expect(onChange).toHaveBeenLastCalledWith('28077')
  })

  it('shows every loaded option for short result lists when a value is already selected', async () => {
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([
      {
        value: '28077',
        label: '28077 - Approved - Owner 00016245 - Region RKB',
        status: 'Approved',
        applicantClientNumber: '',
        ownerClientNumber: '00016245',
        region: 'RKB',
        listingDate: '2012-05-11',
        exemptionNumber: '',
      },
      {
        value: '28078',
        label: '28078 - New - Owner 00016245 - Region RKB',
        status: 'New',
        applicantClientNumber: '',
        ownerClientNumber: '00016245',
        region: 'RKB',
        listingDate: '2012-05-12',
        exemptionNumber: '',
      },
    ])

    render(
      <ApplicationNumberSelect
        id="applicationNumber"
        labelText="Application Number (required)"
        value="28077"
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockedSearchProvincialApplicationNumberOptions).toHaveBeenLastCalledWith('28077')
    })

    const input = screen.getByRole('combobox', { name: 'Application Number (required)' })
    await waitFor(() => {
      expect(input).toHaveValue('28077 - Approved - Owner 00016245 - Region RKB')
    })
    await userEvent.click(input)

    const listboxId = input.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null

    expect(listbox).not.toBeNull()
    expect(
      within(listbox as HTMLElement).getByRole('option', {
        name: '28077 - Approved - Owner 00016245 - Region RKB',
      }),
    ).toBeVisible()
    expect(
      within(listbox as HTMLElement).getByRole('option', {
        name: '28078 - New - Owner 00016245 - Region RKB',
      }),
    ).toBeVisible()
  })

  it('does not emit a change when the current application is selected again', async () => {
    const onChange = vi.fn()
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([
      {
        value: '999000001',
        label: '999000001 - Approved - Owner 99999999 - Region RKB',
        status: 'Approved',
        applicantClientNumber: '',
        ownerClientNumber: '99999999',
        region: 'RKB',
        listingDate: '2012-05-11',
        exemptionNumber: '',
      },
    ])

    render(
      <ApplicationNumberSelect
        id="applicationNumber"
        labelText="Application Number (required)"
        value="999000001"
        onChange={onChange}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Application Number (required)' })
    await waitFor(() => {
      expect(input).toHaveValue('999000001 - Approved - Owner 99999999 - Region RKB')
    })
    onChange.mockClear()

    await userEvent.click(input)
    await userEvent.click(
      await screen.findByRole('option', {
        name: '999000001 - Approved - Owner 99999999 - Region RKB',
      }),
    )

    expect(onChange).not.toHaveBeenCalled()
  })
})
