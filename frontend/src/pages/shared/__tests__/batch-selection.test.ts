import { batchSelectionTranslator } from '../batch-selection'

describe('batchSelectionTranslator', () => {
  const translate = batchSelectionTranslator('exemption', 'exemptions')

  it.each([
    [1, '1 exemption selected'],
    [2, '2 exemptions selected'],
  ])('names %s selected records', (totalSelected, expected) => {
    expect(translate('carbon.table.batch.item.selected', { totalSelected })).toBe(expected)
    expect(translate('carbon.table.batch.items.selected', { totalSelected })).toBe(expected)
  })

  it('keeps Carbon wording for the other batch controls', () => {
    expect(translate('carbon.table.batch.cancel')).toBe('Cancel')
    expect(translate('carbon.table.batch.selectAll', { totalCount: 4 })).toBe('Select all (4)')
  })
})
