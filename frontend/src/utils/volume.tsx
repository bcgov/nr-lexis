import type { ReactNode } from 'react'
import EmptyValue from '@/components/EmptyValue'
import { EMPTY_VALUE_TEXT } from '@/utils/display-value'

type VolumeValue = number | string | null | undefined

// Volumes show one decimal, including 0.0. They are stored with up to two decimals, so a
// stored second decimal stays visible rather than being rounded away.
const VOLUME_FORMAT = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})
const VOLUME_INPUT_FORMAT = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
  useGrouping: false,
})

const volumeNumber = (value: VolumeValue): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = value?.trim().replaceAll(',', '') ?? ''
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

/** A volume for display, such as "1,234.5" or "0.0"; text that isn't a number is kept. */
export const formatVolume = (value: VolumeValue): string => {
  const volume = volumeNumber(value)
  if (volume !== null) return VOLUME_FORMAT.format(volume)
  return typeof value === 'string' ? value.trim() : ''
}

/** A read-only volume; blank shows the empty value. */
export const displayVolume = (value: VolumeValue): ReactNode =>
  formatVolume(value) || <EmptyValue />

/** A read-only volume as plain text, such as a disabled input's value. */
export const displayVolumeText = (value: VolumeValue): string =>
  formatVolume(value) || EMPTY_VALUE_TEXT

/** A stored volume as an editable value ("12.0"), without thousands separators. */
export const formatVolumeInput = (value: VolumeValue): string => {
  const volume = volumeNumber(value)
  if (volume !== null) return VOLUME_INPUT_FORMAT.format(volume)
  return typeof value === 'string' ? value.trim() : ''
}
