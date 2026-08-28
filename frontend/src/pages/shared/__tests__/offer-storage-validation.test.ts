import { describe, expect, it } from 'vitest'
import {
  OFFER_COMPANY_NAME_MAX_LENGTH,
  OFFER_VOLUME_MAX,
  PURCHASE_OFFER_AMOUNT_MAX,
  formatLegacyOfferVolume,
  offerDecimalStorageFieldError,
  offerTextStorageFieldError,
  offerVolumeContextFieldError,
} from '@/pages/shared/offer-storage-validation'

describe('offer storage validation', () => {
  it('accepts the exact Oracle numeric boundaries', () => {
    expect(
      offerDecimalStorageFieldError('99999.99', PURCHASE_OFFER_AMOUNT_MAX, 'Offer amount', true),
    ).toBeNull()
    expect(offerDecimalStorageFieldError('9999999.99', OFFER_VOLUME_MAX, 'Offer volume')).toBeNull()
  })

  it('rejects non-finite, out-of-range, and excess-scale numeric values', () => {
    expect(offerDecimalStorageFieldError('Infinity', OFFER_VOLUME_MAX, 'Offer volume')).toBe(
      'Offer volume must be a number with up to two decimal places.',
    )
    expect(offerDecimalStorageFieldError('100000', PURCHASE_OFFER_AMOUNT_MAX, 'Offer amount')).toBe(
      'Offer amount must be 99999.99 or less.',
    )
    expect(offerDecimalStorageFieldError('1.234', OFFER_VOLUME_MAX, 'Offer volume')).toBe(
      'Offer volume must be a number with up to two decimal places.',
    )
  })

  it('formats valid offer volumes with the legacy browser toFixed semantics', () => {
    expect(formatLegacyOfferVolume('12.34')).toBe('12.3')
    expect(formatLegacyOfferVolume('12.36')).toBe('12.4')
    expect(formatLegacyOfferVolume('12.25')).toBe('12.3')
    expect(formatLegacyOfferVolume('1.234')).toBe('1.234')
  })

  it('rejects an offer volume above the application or package volume', () => {
    expect(offerVolumeContextFieldError('95.1', '95.0')).toBe(
      'Offer volume cannot exceed the application/package volume.',
    )
    expect(offerVolumeContextFieldError('95.0', '95.0')).toBeNull()
    expect(offerVolumeContextFieldError('95.54', '95.5')).toBe(
      'Offer volume cannot exceed the application/package volume.',
    )
    expect(offerVolumeContextFieldError('', '95.0')).toBeNull()
    expect(offerVolumeContextFieldError('95.1', '')).toBeNull()
    expect(offerVolumeContextFieldError('95.1', null)).toBeNull()
  })

  it('compares against the canonical one-decimal context returned by the backend', () => {
    expect(offerVolumeContextFieldError('12.2', '12.2')).toBeNull()
    expect(offerVolumeContextFieldError('12.3', '12.2')).toBe(
      'Offer volume cannot exceed the application/package volume.',
    )
  })

  it('enforces US7ASCII and Oracle byte lengths for offer text', () => {
    expect(
      offerTextStorageFieldError(
        'A'.repeat(OFFER_COMPANY_NAME_MAX_LENGTH),
        OFFER_COMPANY_NAME_MAX_LENGTH,
        'Company name',
        true,
      ),
    ).toBeNull()
    expect(
      offerTextStorageFieldError(
        'A'.repeat(OFFER_COMPANY_NAME_MAX_LENGTH + 1),
        OFFER_COMPANY_NAME_MAX_LENGTH,
        'Company name',
        true,
      ),
    ).toBe('Company name must be 52 characters or fewer.')
    expect(
      offerTextStorageFieldError(
        'Québec Lumber',
        OFFER_COMPANY_NAME_MAX_LENGTH,
        'Company name',
        true,
      ),
    ).toBe('Company name must contain ASCII characters only.')
  })
})
