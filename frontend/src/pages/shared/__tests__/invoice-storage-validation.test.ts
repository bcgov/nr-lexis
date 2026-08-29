import { describe, expect, it } from 'vitest'
import {
  INVOICE_AMOUNT_DECIMAL_PLACES,
  INVOICE_AMOUNT_MAX,
  INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
  INVOICE_CONVERSION_RATE_MAX,
  invoiceDecimalStorageFieldError,
  invoiceNumberStorageFieldError,
} from '@/pages/shared/invoice-storage-validation'

describe('invoice storage validation', () => {
  it('accepts values that fit after Oracle rounds them to the column scale', () => {
    expect(invoiceNumberStorageFieldError('INV-12345')).toBeUndefined()
    expect(
      invoiceDecimalStorageFieldError(
        '9999999.994',
        'Invoice export value',
        INVOICE_AMOUNT_MAX,
        INVOICE_AMOUNT_DECIMAL_PLACES,
      ),
    ).toBeUndefined()
    expect(
      invoiceDecimalStorageFieldError(
        '9.999994',
        'Invoice conversion rate',
        INVOICE_CONVERSION_RATE_MAX,
        INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
      ),
    ).toBeUndefined()
    expect(
      invoiceDecimalStorageFieldError(
        '1.000001',
        'Invoice conversion rate',
        INVOICE_CONVERSION_RATE_MAX,
        INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
      ),
    ).toBeUndefined()
  })

  it('rejects invoice numbers that cannot fit Oracle byte storage', () => {
    expect(invoiceNumberStorageFieldError('1234567890')).toBe(
      'Invoice number must be 9 characters or fewer.',
    )
    expect(invoiceNumberStorageFieldError('é'.repeat(9))).toBe(
      'Invoice number must use printable US-ASCII characters.',
    )
  })

  it('rejects invoice values that overflow after Oracle rounding', () => {
    expect(
      invoiceDecimalStorageFieldError(
        '9999999.995',
        'Invoice export value',
        INVOICE_AMOUNT_MAX,
        INVOICE_AMOUNT_DECIMAL_PLACES,
      ),
    ).toBe('Invoice export value must round to 9999999.99 or less.')
    expect(
      invoiceDecimalStorageFieldError(
        '9.999995',
        'Invoice conversion rate',
        INVOICE_CONVERSION_RATE_MAX,
        INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
      ),
    ).toBe('Invoice conversion rate must round to 9.99999 or less.')
  })
})
