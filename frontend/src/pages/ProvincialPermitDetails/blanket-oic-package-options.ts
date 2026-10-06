// Blanket OIC packages are harvested timber only.
export const BLANKET_OIC_PRODUCT_TYPE_OPTIONS = [{ value: 'H', label: 'Harvested' }]

export const blanketOicProductTypeLabel = (code: string | undefined): string | undefined =>
  BLANKET_OIC_PRODUCT_TYPE_OPTIONS.find(
    (option) => option.value === (code ?? '').trim().toUpperCase(),
  )?.label
