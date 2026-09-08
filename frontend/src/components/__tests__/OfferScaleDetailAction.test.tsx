import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OfferScaleDetailAction from '@/components/OfferScaleDetailAction'
import { useAuth } from '@/context/auth/useAuth'
import { fetchOfferScaleDetails, type OfferScaleDetail } from '@/service/offer-scale-detail-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/service/offer-scale-detail-service', () => ({ fetchOfferScaleDetails: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchOfferScaleDetails = vi.mocked(fetchOfferScaleDetails)
const scale: OfferScaleDetail = {
  timberMark: 'TM-1',
  pieces: 4,
  species: 'HE',
  grade: 'J',
  volume: '12.34',
  cascadeSplitCode: 'W',
}

describe('Offer scale details', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext())
    mockedFetchOfferScaleDetails.mockResolvedValue([])
  })

  it('shows an empty result and closes using the keyboard', async () => {
    render(<OfferScaleDetailAction target={{ packageNumber: 'PKG-1' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(await screen.findByText('No scale details found for this package.')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a load failure and fetches again when reopened', async () => {
    mockedFetchOfferScaleDetails.mockRejectedValueOnce(new Error('Access denied'))
    render(<OfferScaleDetailAction target={{ offerNumber: '81001' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(await screen.findByText('Unable to load scale details')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    mockedFetchOfferScaleDetails.mockResolvedValue([scale])
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(await screen.findByText('TM-1')).toBeInTheDocument()
    expect(mockedFetchOfferScaleDetails).toHaveBeenCalledTimes(2)
  })

  it('discards a pending response after closing and reopening', async () => {
    let finishFirstRequest!: (rows: OfferScaleDetail[]) => void
    mockedFetchOfferScaleDetails.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirstRequest = resolve
      }),
    )
    render(<OfferScaleDetailAction target={{ offerNumber: '81001' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(screen.getByText('Loading scale details…')).toBeInTheDocument()
    const oldSignal = mockedFetchOfferScaleDetails.mock.calls[0][1]
    await userEvent.click(screen.getByRole('button', { name: 'Close scale details' }))
    expect(oldSignal.aborted).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(await screen.findByText('No scale details found for this package.')).toBeInTheDocument()
    await act(async () => {
      finishFirstRequest([scale])
    })
    expect(screen.queryByText('TM-1')).not.toBeInTheDocument()
  })

  it('closes and discards pending data when the selected package changes', async () => {
    let finishFirstRequest!: (rows: OfferScaleDetail[]) => void
    mockedFetchOfferScaleDetails.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirstRequest = resolve
      }),
    )
    const { rerender } = render(<OfferScaleDetailAction target={{ packageNumber: 'PKG-1' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    const oldSignal = mockedFetchOfferScaleDetails.mock.calls[0][1]
    rerender(<OfferScaleDetailAction target={{ packageNumber: 'PKG-2' }} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(oldSignal.aborted).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(await screen.findByText('No scale details found for this package.')).toBeInTheDocument()
    await act(async () => {
      finishFirstRequest([scale])
    })
    expect(screen.queryByText('TM-1')).not.toBeInTheDocument()
    expect(mockedFetchOfferScaleDetails).toHaveBeenLastCalledWith(
      { packageNumber: 'PKG-2' },
      expect.any(AbortSignal),
    )
  })

  it('clears displayed data when the authenticated forest client changes', async () => {
    mockedFetchOfferScaleDetails.mockResolvedValue([scale])
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\buyer',
          forestClientNumber: '00000001',
        }),
      }),
    )
    const { rerender } = render(<OfferScaleDetailAction target={{ offerNumber: '81001' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    const dialog = await screen.findByRole('dialog', { name: 'Scale Detail' })
    expect(await within(dialog).findByText('TM-1')).toBeInTheDocument()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\buyer',
          forestClientNumber: '00000002',
        }),
      }),
    )
    rerender(<OfferScaleDetailAction target={{ offerNumber: '81001' }} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('TM-1')).not.toBeInTheDocument()
  })
})
