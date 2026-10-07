import { render } from '@testing-library/react'

import { displayVolume, displayVolumeText, formatVolume, formatVolumeInput } from '@/utils/volume'

describe('volume formatting', () => {
  it('shows one decimal, including 0.0, and keeps a stored second decimal', () => {
    expect(formatVolume(0)).toBe('0.0')
    expect(formatVolume(12)).toBe('12.0')
    expect(formatVolume('12.5')).toBe('12.5')
    expect(formatVolume(12.35)).toBe('12.35')
    expect(formatVolume(1234567.8)).toBe('1,234,567.8')
    expect(formatVolume(' 1,234 ')).toBe('1,234.0')
  })

  it('keeps text that is not a volume and leaves blanks empty', () => {
    expect(formatVolume('Loading…')).toBe('Loading…')
    expect(formatVolume(null)).toBe('')
    expect(formatVolume(Number.NaN)).toBe('')
    expect(displayVolumeText(undefined)).toBe('—')
    expect(displayVolumeText(5)).toBe('5.0')
  })

  it('shows an em dash for a blank read-only volume', () => {
    const { container } = render(<p>{displayVolume('')}</p>)
    expect(container).toHaveTextContent('—Not provided')
    expect(displayVolume(3)).toBe('3.0')
  })

  it('prepares stored volumes for editing without thousands separators', () => {
    expect(formatVolumeInput(1234.5)).toBe('1234.5')
    expect(formatVolumeInput(0)).toBe('0.0')
    expect(formatVolumeInput('7')).toBe('7.0')
    expect(formatVolumeInput(null)).toBe('')
    expect(formatVolumeInput('abc')).toBe('abc')
  })
})
