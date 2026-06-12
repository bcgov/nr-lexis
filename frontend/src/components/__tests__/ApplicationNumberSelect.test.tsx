import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ApplicationNumberSelect from '@/components/ApplicationNumberSelect'
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
})
