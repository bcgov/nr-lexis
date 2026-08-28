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
  it('accepts invoice values at the Oracle storage boundaries', () => {
    expect(invoiceNumberStorageFieldError('INV-12345')).toBeUndefined()
    expect(
      invoiceDecimalStorageFieldError(
        '9999999.99',
        'Invoice export value',
        INVOICE_AMOUNT_MAX,
        INVOICE_AMOUNT_DECIMAL_PLACES,
      ),
    ).toBeUndefined()
    expect(
      invoiceDecimalStorageFieldError(
        '9.99999',
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
      'Invoice number must use US-ASCII characters.',
    )
  })

  it('rejects invoice values outside the Oracle precision and scale boundaries', () => {
    expect(
      invoiceDecimalStorageFieldError(
        '10000000',
        'Invoice export value',
        INVOICE_AMOUNT_MAX,
        INVOICE_AMOUNT_DECIMAL_PLACES,
      ),
    ).toBe('Invoice export value must be 9999999.99 or less.')
    expect(
      invoiceDecimalStorageFieldError(
        '1.000001',
        'Invoice conversion rate',
        INVOICE_CONVERSION_RATE_MAX,
        INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
      ),
    ).toBe('Invoice conversion rate must have no more than 5 decimal places.')
  })
})
